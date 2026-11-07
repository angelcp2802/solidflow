import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, Shape } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { CadEngine } from './kernel.engine'
import { validateAssemblyShape } from './kernel.assembly-placements'
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership'
import type { Feature } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

type Family = 'legacy' | 'semantic' | 'explicit'
// Original 4 x 6 x 4 mm prism: V=96, A=128, eight literal corners.
function original(family: Family, width = 4, depth = 4): Feature[] {
  return [{ id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: family === 'semantic' ? { kind: 'entities',
      points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: width, y: 0 }, { id: 'c', x: width, y: 6 }, { id: 'd', x: 0, y: 6 }],
      entities: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([start, end], i) => ({ id: 'edge-' + i, type: 'line' as const, start, end, construction: false })), constraints: [] }
      : { kind: 'rectangle', center: [width / 2, 3], width, height: 6 } },
  { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
    ...(family === 'explicit' ? { bodyOperation: { mode: 'new', bodyId: 'box' } as const } : {}) }]
}
const expected = (width = 4, depth = 4) => [0, width].flatMap(x => [0, 6].flatMap(y => [0, depth].map(z => [x, y, z].join(',')))).sort()
const near = (a: number, b: number, tolerance = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)

for (const family of ['legacy', 'semantic', 'explicit'] as const) it('publishes actual ' + family + ' vertex identities in both builds and queries native points without tessellation', () => {
  const render = new CadEngine(), native = new CadEngine()
  try {
    const result = render.build(original(family)), body = family === 'explicit' ? result.bodies![0].ref : null
    expect(result.featureErrors).toEqual([])
    const picks = family === 'explicit' ? result.bodies![0].vertexPoints! : result.vertexPoints!
    expect(picks).toHaveLength(8); expect(picks.map(v => v.point.join(',')).sort()).toEqual(expected())
    const mesh = vi.spyOn(Shape.prototype, 'mesh'), edges = vi.spyOn(Shape.prototype, 'meshEdges')
    try {
      const inventory = native.rebuildForAssemblyReferences(original(family))
      const refs = inventory.kind === 'explicit' ? inventory.bodies[0].vertexRefs : inventory.kind === 'legacy' ? inventory.vertexRefs : []
      expect(inventory.featureErrors).toEqual([]); expect(refs).toEqual(picks.map(v => v.ref))
      expect(refs.map(ref => native.inspectCurrentVertexSupport(ref, body).point.join(',')).sort()).toEqual(expected())
      for (const ref of refs) {
        const point = native.inspectCurrentVertexSupport(ref, body)
        expect(point.kind).toBe('point'); expect(point).not.toHaveProperty('axis')
        expect(point.tolerance).toBeGreaterThanOrEqual(0); expect(Number.isFinite(point.tolerance)).toBe(true)
        point.point[0] = 999 // A detached numeric measurement cannot change native geometry.
        expect(native.inspectCurrentVertexSupport(ref, body).point[0]).not.toBe(999)
      }
      expect(mesh).not.toHaveBeenCalled(); expect(edges).not.toHaveBeenCalled()
      const stable = structuredClone(refs[0]); picks[0].point[0] = 888; picks[0].ref.key = 'display-forgery'
      expect(native.inspectCurrentVertexSupport(stable, body).point[0]).not.toBe(888)
      if (body) expect(() => native.inspectCurrentVertexSupport(stable, null)).toThrow(/cuerpo explícito/)
      else expect(() => native.inspectCurrentVertexSupport(stable, { bodyId: 'box', sourceFeatureId: 'solid' })).toThrow(/catálogo explícito/)
    } finally { mesh.mockRestore(); edges.mockRestore() }
    withNativeOwners(owners => {
      const shape = owners.own(native.copyCurrentBodyShape(body)), box = owners.own(shape.boundingBox)
      expect(validateAssemblyShape(shape)).toBe(1)
      near(owners.own(measureShapeVolumeProperties(shape)).volume, 96)
      near(owners.own(measureShapeSurfaceProperties(shape)).area, 128)
      expect(box.bounds).toEqual([[0, 0, 0], [4, 6, 4]])
    })
  } finally { native.dispose(); render.dispose() }
})

it('separates coincident explicit bodies and requires fresh source geometry after rebuild and suppression', () => {
  const engine = new CadEngine(), source = original('explicit')
  const second = { ...structuredClone(source[1]), id: 'second', bodyOperation: { mode: 'new', bodyId: 'other' } } as Feature
  try {
    const both = engine.rebuildForAssemblyReferences([...source, second]); if (both.kind !== 'explicit') throw new Error('Explicit fixture missing')
    expect(both.bodies).toHaveLength(2)
    const first = both.bodies[0], other = both.bodies[1]
    expect(first.vertexRefs).toHaveLength(8); expect(other.vertexRefs).toHaveLength(8)
    expect(() => engine.inspectCurrentVertexSupport(first.vertexRefs[0], other.ref)).toThrow(/otro estado/)
    expect(() => engine.inspectCurrentVertexSupport(other.vertexRefs[0], first.ref)).toThrow(/otro estado/)
    const changed = engine.rebuildForAssemblyReferences(original('explicit', 6, 5)); if (changed.kind !== 'explicit') throw new Error('Changed fixture missing')
    expect(changed.bodies[0].vertexRefs.map(ref => engine.inspectCurrentVertexSupport(ref, changed.bodies[0].ref).point.join(',')).sort()).toEqual(expected(6, 5))
    expect(() => engine.inspectCurrentVertexSupport(other.vertexRefs[0], other.ref)).toThrow()
    const suppressed = original('explicit'); suppressed[1].suppressed = true
    engine.rebuildForAssemblyReferences(suppressed)
    expect(() => engine.inspectCurrentVertexSupport(first.vertexRefs[0], first.ref)).toThrow(/reconstrucción/)
  } finally { engine.dispose() }
})

it('rejects a reentrant native point result and keeps only the newly completed build inspectable', () => {
  const engine = new CadEngine(), oc = getOC(), pnt = oc.BRep_Tool.Pnt.bind(oc.BRep_Tool)
  let once = false, replacement: ReturnType<CadEngine['rebuildForAssemblyReferences']> | undefined
  try {
    const initial = engine.rebuildForAssemblyReferences(original('explicit')); if (initial.kind !== 'explicit') throw new Error('Explicit fixture missing')
    const query = vi.spyOn(oc.BRep_Tool, 'Pnt').mockImplementation((raw: Parameters<typeof pnt>[0]) => {
      const point = pnt(raw)
      if (!once) { once = true; replacement = engine.rebuildForAssemblyReferences(original('explicit', 6, 5)) }
      return point
    })
    try { expect(() => engine.inspectCurrentVertexSupport(initial.bodies[0].vertexRefs[0], initial.bodies[0].ref)).toThrow(/cambió/) }
    finally { query.mockRestore() }
    if (replacement?.kind !== 'explicit') throw new Error('Replacement fixture missing')
    const current = replacement.bodies[0]
    expect(current.vertexRefs.map(ref => engine.inspectCurrentVertexSupport(ref, current.ref).point.join(',')).sort()).toEqual(expected(6, 5))
  } finally { engine.dispose() }
})

it('seals all native inspection when releasing a queried point fails', () => {
  const engine = new CadEngine(), oc = getOC(), pnt = oc.BRep_Tool.Pnt.bind(oc.BRep_Tool)
  let released = 0
  try {
    const inventory = engine.rebuildForAssemblyReferences(original('explicit')); if (inventory.kind !== 'explicit') throw new Error('Explicit fixture missing')
    const body = inventory.bodies[0], query = vi.spyOn(oc.BRep_Tool, 'Pnt').mockImplementation((raw: Parameters<typeof pnt>[0]) => {
      const point = pnt(raw), release = point.delete.bind(point)
      point.delete = () => { released++; release(); throw new Error('Original point release fault') }
      return point
    })
    try { expect(() => engine.inspectCurrentVertexSupport(body.vertexRefs[0], body.ref)).toThrow(NativeCleanupError) }
    finally { query.mockRestore() }
    expect(released).toBe(1)
    expect(() => engine.inspectCurrentVertexSupport(body.vertexRefs[1], body.ref)).toThrow(/reconstrucción/)
    expect(() => engine.inspectCurrentFaceSupport(body.faces[0], body.ref)).toThrow(/reconstrucción/)
  } finally { engine.dispose() }
})
