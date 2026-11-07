import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyVertexReference } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyPointPlacementArithmetic, MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const stamp = '2026-10-21T00:00:00.000Z'
function original(explicit: boolean): AssemblyDocument {
  const part = { kind: 'part', id: 'original-box', revision: 'r1', document: { version: 1, id: 'original-box', name: 'Original 4 by 6 by 4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [{ id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
      { id: 'solid', name: 'Prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'body' } } : {}) }] } }
  const occurrence = (id: string) => ({ id, name: id, definition: { id: part.id, revision: part.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })
  const a = occurrence('a'), b = occurrence('b'); a.pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }; b.pose.translation = [-10, 0, 0]
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original vertex assembly', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part], occurrences: [a, b], mates: [] })
}
const reference = (snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, path = ['a']): AssemblyVertexReference => ({ kind: 'vertex', ...snapshot.listVertices(input, path)[0], support: 'point' })
const near = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1e-10))
for (const explicit of [false, true]) it('retains native prism vertices for repeated occurrences with literal proper placements, explicit=' + explicit, () => {
  const input = original(explicit), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    expect(build).toHaveBeenCalledTimes(1)
    const a = snapshot.listVertices(input, ['a']), b = snapshot.listVertices(input, ['b'])
    expect(a).toHaveLength(8); expect(b).toHaveLength(8); expect(new Set(a.map(v => v.vertex.key)).size).toBe(8)
    expect(a.map(v => v.vertex)).toEqual(b.map(v => v.vertex)); expect(a.every(v => explicit ? v.body !== null : v.body === null)).toBe(true)
    const expected = new Set([-2, 2].flatMap(x => [-3, 3].flatMap(y => [0, 4].map(z => JSON.stringify([x, y, z])))))
    for (const selection of a) {
      const witness = snapshot.resolveVertexReference(input, { kind: 'vertex', ...selection, support: 'point' })
      expect(witness.kind).toBe('point'); expect(witness.origin).toBe('native-vertex'); expect(witness.localSupport).not.toHaveProperty('axis')
      expect(expected.delete(JSON.stringify(witness.localSupport.point))).toBe(true)
      const [x, y, z] = witness.localSupport.point; near(witness.worldSupport.point, [10 - y, 20 + x, 30 + z])
      expect(snapshot.assertPointWitness(witness, input)).toBe(witness); expect(Object.isFrozen(witness.localSupport.point)).toBe(true)
    }
    expect(expected.size).toBe(0)
    a[0].component.occurrencePath[0] = 'wrong'; expect(snapshot.listVertices(input, ['a'])[0].component.occurrencePath).toEqual(['a'])
  } finally { snapshot.dispose(); build.mockRestore() }
})
it('composes a nested scoped point and retains placement-chain magnitudes', () => {
  const input = original(true), inner = structuredClone(input.occurrences[1]); inner.id = 'inner'; inner.pose.translation = [2, 0, 0]
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Reusable subassembly', createdAt: stamp, updatedAt: stamp, occurrences: [inner], mates: [] })
  input.occurrences.push({ ...structuredClone(inner), id: 'sub-owner', definition: { id: 'sub', revision: 'r1' }, pose: { translation: [100, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } })
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const selected = reference(snapshot, input, ['sub-owner', 'inner']); selected.component.occurrencePath = ['inner']
    const witness = snapshot.resolveVertexReference(input, selected, ['sub-owner']), [x, y, z] = witness.localSupport.point
    near(witness.worldSupport.point, [100 - y, 2 + x, z]); expect(witness.componentPath).toEqual(['sub-owner', 'inner'])
    expect(assemblyPointPlacementArithmetic(witness, input)).toEqual({ placementSum: 102, depth: 2 })
  } finally { snapshot.dispose() }
})
it('rejects copied, foreign, old-purpose and disposed point authority', () => {
  const input = original(true), snapshot = new AssemblyGeometrySnapshot(input), other = new AssemblyGeometrySnapshot(input)
  try {
    const selected = reference(snapshot, input), witness = snapshot.resolveVertexReference(input, selected)
    expect(() => snapshot.assertPointWitness(structuredClone(witness), input)).toThrow()
    expect(() => other.assertPointWitness(witness, input)).toThrow()
    expect(() => assemblyPointPlacementArithmetic(structuredClone(witness), input)).toThrow()
    expect(() => snapshot.resolveReference(input, selected as never)).toThrow()
    expect(() => snapshot.resolveVertexReference(input, { ...selected, support: 'axis' } as never)).toThrow()
    expect(() => snapshot.assertWitness(witness as never, input)).toThrow()
    snapshot.dispose(); expect(() => snapshot.assertPointWitness(witness, input)).toThrow(); expect(() => snapshot.listVertices(input, ['a'])).toThrow()
  } finally { snapshot.dispose(); other.dispose() }
})
it('requires the exact current document, revision and active occurrence', () => {
  const input = original(false), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const selected = reference(snapshot, input), witness = snapshot.resolveVertexReference(input, selected)
    for (const mutate of [(d: AssemblyDocument) => { d.occurrences[0].pose.translation[0]++ }, (d: AssemblyDocument) => { d.occurrences[0].suppressed = true },
      (d: AssemblyDocument) => { d.definitions[0].revision = 'changed'; d.occurrences.forEach(o => { o.definition.revision = 'changed' }) },
      (d: AssemblyDocument) => { const part = d.definitions[0]; if (part.kind === 'part') { const solid = part.document.features.find(f => f.type === 'extrude'); if (solid?.type === 'extrude') solid.depth = 8 } }]) {
      const changed = structuredClone(input); mutate(changed); expect(() => snapshot.assertPointWitness(witness, changed)).toThrow()
    }
    expect(() => snapshot.resolveVertexReference(input, { ...selected, component: { ...selected.component, definition: { id: 'original-box', revision: 'other' } } })).toThrow()
    const suppressed = structuredClone(input); suppressed.occurrences[0].suppressed = true
    const hidden = new AssemblyGeometrySnapshot(suppressed); try { expect(() => hidden.resolveVertexReference(suppressed, selected)).toThrow() } finally { hidden.dispose() }
  } finally { snapshot.dispose() }
})
it('cannot turn an explicit-body point into a legacy aggregate or a foreign source', () => {
  for (const foreign of [false, true]) {
    const input = original(true), snapshot = new AssemblyGeometrySnapshot(input)
    try {
      const selected = reference(snapshot, input)
      const changed = foreign ? { ...selected, body: { bodyId: 'body', sourceFeatureId: 'foreign' }, vertex: { ...selected.vertex, sourceFeatureId: 'foreign' } } : { ...selected, body: null }
      expect(() => snapshot.resolveVertexReference(input, changed)).toThrow()
    } finally { snapshot.dispose() }
  }
})
it('closes the complete snapshot after a native point inspection failure', () => {
  const input = original(true), snapshot = new AssemblyGeometrySnapshot(input), selected = reference(snapshot, input)
  const failure = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport').mockImplementation(() => { throw new NativeCleanupError({ error: new Error('original injected inspection failure') }, [new Error('original injected release failure')], 'Point release failed') })
  try { expect(() => snapshot.resolveVertexReference(input, selected)).toThrow(); expect(() => snapshot.listVertices(input, ['b'])).toThrow() }
  finally { failure.mockRestore(); snapshot.dispose() }
})
it('admits exactly 65536 vertex references and rejects 65537 before publishing metadata or point authority', () => {
  const input = original(false), rebuild = CadEngine.prototype.rebuildForAssemblyReferences
  let count = MAX_ASSEMBLY_NATIVE_VERTEX_REFERENCES, engine: CadEngine | undefined
  let selected: ReturnType<AssemblyGeometrySnapshot['listVertices']>[number]['vertex'] | undefined
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, ...args) {
    const inventory = rebuild.apply(this, args)
    if (inventory.kind !== 'legacy' || !inventory.vertexRefs.length) throw new Error('Expected original native vertex inventory')
    engine = this; selected = { ...inventory.vertexRefs[0] }
    // Cardinality fault injection only: native topology and inspection remain real.
    return { ...inventory, vertexRefs: Array.from({ length: count }, () => ({ ...inventory.vertexRefs[0] })) }
  })
  try {
    expect(count).toBe(65536)
    const admitted = new AssemblyGeometrySnapshot(input)
    try {
      expect(admitted.listVertices(input, ['a'])).toHaveLength(65536)
      const witness = admitted.resolveVertexReference(input, reference(admitted, input))
      expect(admitted.assertPointWitness(witness, input)).toBe(witness)
    } finally { admitted.dispose() }
    count++
    let escaped: AssemblyGeometrySnapshot | undefined
    expect(() => { escaped = new AssemblyGeometrySnapshot(input) }).toThrow('presupuesto de vértices nativos')
    expect(escaped).toBeUndefined(); expect(spy).toHaveBeenCalledTimes(2)
    expect(() => engine!.inspectCurrentVertexSupport(selected!, null)).toThrow('reconstrucción completa')
  } finally { spy.mockRestore(); engine?.dispose() }
}, 60_000)
it('withholds a point when a reentrant native query disposes its snapshot', () => {
  const input = original(true), snapshot = new AssemblyGeometrySnapshot(input), selected = reference(snapshot, input)
  const inspect = CadEngine.prototype.inspectCurrentVertexSupport
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport').mockImplementation(function (this: CadEngine, ...args) {
    const value = inspect.apply(this, args); snapshot.dispose(); return value
  })
  try {
    let escaped: ReturnType<AssemblyGeometrySnapshot['resolveVertexReference']> | undefined
    expect(() => { escaped = snapshot.resolveVertexReference(input, selected) }).toThrow('ya no está vigente')
    expect(escaped).toBeUndefined()
  } finally { spy.mockRestore(); snapshot.dispose() }
})
it('rechecks lifetime after document validation with a reentrant plain-object proxy', () => {
  for (const action of ['assert', 'list', 'resolve'] as const) {
    const input = original(false), snapshot = new AssemblyGeometrySnapshot(input), selected = reference(snapshot, input)
    const witness = snapshot.resolveVertexReference(input, selected)
    let traps = 0
    const proxy = new Proxy(input, { getPrototypeOf(target) { traps++; snapshot.dispose(); return Reflect.getPrototypeOf(target) } })
    try {
      let escaped: unknown
      expect(() => { escaped = action === 'assert' ? snapshot.assertPointWitness(witness, proxy)
        : action === 'list' ? snapshot.listVertices(proxy, ['a']) : snapshot.resolveVertexReference(proxy, selected) }).toThrow('ya no está vigente')
      expect(traps).toBeGreaterThan(0); expect(escaped).toBeUndefined()
    } finally { snapshot.dispose() }
  }
})
