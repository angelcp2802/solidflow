import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyPlaneReference, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { validateAssemblySymmetryReferenceSet, type AssemblySymmetryReferenceSet } from '../model/assemblySymmetryReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { measureAssemblySymmetryReferences } from './kernel.assembly-symmetry'
import { CadEngine } from './kernel.engine'
import { UnsupportedAssemblyCylinderSurfaceError, UnsupportedAssemblySphereSurfaceError } from './kernel.assembly-supports'
import { NativeCleanupError } from './kernel.native-ownership'

type Kind = AssemblySymmetryReferenceSet['entityKind']
const kinds: Kind[] = ['point', 'line', 'plane', 'sphere', 'cylinder'], stamp = '2026-10-21T00:00:00.000Z'
let sphere: EmbeddedPartDefinition, largerSphere: EmbeddedPartDefinition
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const original = validateAssemblyDocument(JSON.parse(await readFile(new URL('./fixtures/assembly-sphere-sphere-tangent-original.json', import.meta.url), 'utf8')))
  const selected = original.definitions.find(d => d.id === 'sphere-source-r2')
  if (selected?.kind !== 'part') throw Error('Original radius-two revolved sphere required')
  sphere = selected
  const larger = original.definitions.find(d => d.id === 'sphere-source-r3')
  if (larger?.kind !== 'part') throw Error('Original radius-three revolved sphere required')
  largerSphere = larger
}, 60_000)
const near = (a: number, b: number, tolerance = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
function original(kind: Kind, explicit = true): AssemblyDocument {
  const box = { kind: 'part', id: 'box', revision: 'r1', document: { version: 1, id: 'box', name: 'Original 4 by 6 by 4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
    { id: 'solid', name: 'Prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'body' } } : {}) }] } }
  const cylinder = { kind: 'part', id: 'cylinder', revision: 'r1', document: { version: 1, id: 'cylinder', name: 'Original radius-two cylinder', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'solid', name: 'Cylinder', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } }] } }
  const id = kind === 'sphere' ? sphere.id : kind === 'cylinder' ? 'cylinder' : 'box'
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original symmetry observation', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [box, ...(kind === 'sphere' ? [sphere] : kind === 'cylinder' ? [cylinder] : [])], mates: [], occurrences: ['a', 'b', 'm'].map((owner, i) => ({ id: owner, name: owner,
      definition: { id: i === 2 ? 'box' : id, revision: 'r1' }, pose: { ...identityRigidPose(), translation: [i === 0 ? -5 : i === 1 ? 5 : -2, 0, 0] }, fixed: false, suppressed: false, visible: true })) })
}
function plane(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, owner: string, sign: number): AssemblyPlaneReference {
  for (const selected of snapshot.listFaces(doc, [owner])) {
    const ref = { kind: 'face' as const, ...selected, support: 'plane' as const }, w = snapshot.resolveReference(doc, ref)
    if (w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[0] * sign > .999) return ref
  }
  throw Error('Original X plane required')
}
function entity(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, kind: Kind, owner: string, sign: number): unknown {
  if (kind === 'plane') return plane(snapshot, doc, owner, sign)
  if (kind === 'point') {
    for (const selected of snapshot.listVertices(doc, [owner])) {
      const ref = { kind: 'vertex' as const, ...selected, support: 'point' as const }, p = snapshot.resolveVertexReference(doc, ref).localSupport.point
      if (p[0] === sign * 2 && p[1] === -3 && p[2] === 0) return ref
    }
  } else if (kind === 'line') {
    const part = doc.definitions.find(d => d.id === 'box'); if (part?.kind !== 'part') throw Error('Original box required')
    const engine = new CadEngine()
    try {
      const inv = engine.rebuildForAssemblyReferences(part.document.features)
      const entries = inv.kind === 'explicit' ? inv.bodies.flatMap(b => b.edges.map(edge => ({ body: b.ref, edge }))) : inv.kind === 'legacy' ? inv.edges.map(edge => ({ body: null, edge })) : []
      for (const selected of entries) {
        const s = engine.inspectCurrentEdgeSupport(selected.edge, selected.body)
        if (Math.abs(s.point[0] - sign * 2) < 1e-10 && s.point[1] === -3 && s.axis[2] > .999) return { kind: 'edge', component: { occurrencePath: [owner], definition: { id: 'box', revision: 'r1' } }, ...selected, support: 'line' }
      }
    } finally { engine.dispose() }
  } else {
    for (const selected of snapshot.listFaces(doc, [owner])) {
      try {
        if (kind === 'sphere') { const ref = { kind: 'face' as const, ...selected, support: 'sphere-surface' as const }; snapshot.resolveSphereSurfaceReference(doc, ref); return ref }
        const ref = { kind: 'face' as const, ...selected, support: 'cylinder-surface' as const }; snapshot.resolveCylinderSurfaceReference(doc, ref); return ref
      } catch (error) { if (!(error instanceof UnsupportedAssemblyCylinderSurfaceError) && !(error instanceof UnsupportedAssemblySphereSurfaceError)) throw error }
    }
  }
  throw Error('Expected original native entity ' + kind)
}
function request(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, kind: Kind): AssemblySymmetryReferenceSet {
  return validateAssemblySymmetryReferenceSet({ entityKind: kind, source: entity(snapshot, doc, kind, 'a', -1), target: entity(snapshot, doc, kind, 'b', 1), mirror: plane(snapshot, doc, 'm', 1), alignment: kind === 'point' || kind === 'sphere' ? null : 'aligned' })
}
function ok(value: ReturnType<typeof measureAssemblySymmetryReferences>) { expect(value.status).toBe('ok'); if (value.status !== 'ok') throw Error(value.message); return value }
for (const kind of kinds) it('measures actual reflected ' + kind + ' supports on three independent native owners', () => {
  const doc = original(kind), snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const refs = request(snapshot, doc, kind), before = structuredClone(doc), first = ok(measureAssemblySymmetryReferences(snapshot, doc, refs)), second = ok(measureAssemblySymmetryReferences(snapshot, doc, refs))
    expect(first.satisfied).toBe(true); near(first.positionErrorMm, 0); if (kind !== 'point' && kind !== 'sphere') near(first.angleRadians!, 0)
    if (kind === 'sphere' || kind === 'cylinder') near(first.radiusDifferenceMm!, 0)
    expect(first.componentPaths).toEqual({ source: ['a'], target: ['b'], mirror: ['m'] }); expect(first.supportOnly).toBe(true)
    expect(second).toEqual(first); expect(doc).toEqual(before)
    expect(() => snapshot.assertPointWitness(structuredClone(first) as never, doc)).toThrow()
  } finally { snapshot.dispose() }
})
for (const kind of kinds) it('reports a literal one-mm physical defect for ' + kind + ' without solving', () => {
  const doc = original(kind); doc.occurrences[1].pose.translation[0] += 1
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try { const value = ok(measureAssemblySymmetryReferences(snapshot, doc, request(snapshot, doc, kind))); near(value.positionErrorMm, 1); expect(value.satisfied).toBe(false) }
  finally { snapshot.dispose() }
})
it('reports physical pi for an opposed branch and rejects an axis as cylindrical-surface purpose', () => {
  const doc = original('cylinder'), snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const refs = request(snapshot, doc, 'cylinder'), value = ok(measureAssemblySymmetryReferences(snapshot, doc, { ...refs, alignment: 'opposed' }))
    near(value.angleRadians!, Math.PI); expect(value.satisfied).toBe(false)
    const lineRefs = { ...refs, entityKind: 'line', source: { ...refs.source, support: 'axis' }, target: { ...refs.target, support: 'axis' } }
    expect(ok(measureAssemblySymmetryReferences(snapshot, doc, lineRefs)).satisfied).toBe(true)
    expect(() => measureAssemblySymmetryReferences(snapshot, doc, { ...refs, source: { ...refs.source, support: 'axis' } })).toThrow()
  } finally { snapshot.dispose() }
})
it('measures a literal fifteen-degree cylinder tilt as radians without moving its owner', () => {
  const doc = original('cylinder'), theta = Math.PI / 12
  doc.occurrences[1].pose.rotation = [Math.sin(theta / 2), 0, 0, Math.cos(theta / 2)]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const before = structuredClone(doc), value = ok(measureAssemblySymmetryReferences(snapshot, doc, request(snapshot, doc, 'cylinder')))
    near(value.angleRadians!, theta); expect(value.satisfied).toBe(false); expect(doc).toEqual(before)
  } finally { snapshot.dispose() }
})
for (const kind of ['sphere', 'cylinder'] as const) it('reports a one-mm radius mismatch for actual ' + kind + ' surfaces', () => {
  const doc = original(kind)
  if (kind === 'sphere') { doc.definitions.push(structuredClone(largerSphere)); doc.occurrences[1].definition = { id: largerSphere.id, revision: largerSphere.revision } }
  else {
    const part = doc.definitions.find(d => d.id === 'cylinder'); if (part?.kind !== 'part') throw Error('Cylinder source required')
    const copy = structuredClone(part); copy.id = 'larger-cylinder'; copy.document.id = copy.id
    const sketch = copy.document.features[0]; if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw Error('Circle required'); sketch.profile.radius = 3
    doc.definitions.push(copy); doc.occurrences[1].definition = { id: copy.id, revision: copy.revision }
  }
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try { const value = ok(measureAssemblySymmetryReferences(snapshot, doc, request(snapshot, doc, kind))); near(value.positionErrorMm, 0); near(value.radiusDifferenceMm!, 1); expect(value.satisfied).toBe(false) }
  finally { snapshot.dispose() }
})
for (const kind of kinds) it('retains repeated ' + kind + ' owner identity without inventing a reflected component', () => {
  const doc = original(kind); doc.occurrences[0].pose.translation = [0, 0, 0]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const refs = request(snapshot, doc, kind); refs.target.component!.occurrencePath = ['a']
    const value = ok(measureAssemblySymmetryReferences(snapshot, doc, refs)); expect(value.satisfied).toBe(true)
    expect(value.componentPaths).toEqual({ source: ['a'], target: ['a'], mirror: ['m'] })
  } finally { snapshot.dispose() }
})
it('measures nested local references in their real rotated scope', () => {
  const doc = original('point'), initial = new AssemblyGeometrySnapshot(doc)
  let refs: AssemblySymmetryReferenceSet
  try { refs = request(initial, doc, 'point') } finally { initial.dispose() }
  const members = doc.occurrences
  doc.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original rotated scope', createdAt: stamp, updatedAt: stamp, occurrences: members, mates: [] })
  doc.occurrences = [{ id: 'sub-owner', name: 'Rotated scope', definition: { id: 'sub', revision: 'r1' }, pose: { translation: [20, 30, 40], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false }]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const value = ok(measureAssemblySymmetryReferences(snapshot, doc, refs, {}, ['sub-owner'])); near(value.positionErrorMm, 0); expect(value.satisfied).toBe(true)
    expect(value.componentPaths).toEqual({ source: ['sub-owner', 'a'], target: ['sub-owner', 'b'], mirror: ['sub-owner', 'm'] }); expect(value.scopePath).toEqual(['sub-owner'])
  } finally { snapshot.dispose() }
})
it('performs fresh point and mirror observations on every measurement', () => {
  const doc = original('point'), snapshot = new AssemblyGeometrySnapshot(doc), refs = request(snapshot, doc, 'point')
  const points = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport'), faces = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport')
  try {
    expect(ok(measureAssemblySymmetryReferences(snapshot, doc, refs)).satisfied).toBe(true)
    expect(ok(measureAssemblySymmetryReferences(snapshot, doc, refs)).satisfied).toBe(true)
    expect(points).toHaveBeenCalledTimes(4); expect(faces).toHaveBeenCalledTimes(2)
  } finally { points.mockRestore(); faces.mockRestore(); snapshot.dispose() }
})
it('retains exact legacy aggregate references and rejects stale document content', () => {
  const doc = original('point', false), snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const refs = request(snapshot, doc, 'point'); expect(ok(measureAssemblySymmetryReferences(snapshot, structuredClone(doc), refs)).satisfied).toBe(true)
    const stale = structuredClone(doc); stale.occurrences[1].pose.translation[0]++
    expect(() => measureAssemblySymmetryReferences(snapshot, stale, refs)).toThrow()
    expect(() => snapshot.listVertices(doc, ['a'])).toThrow()
  } finally { snapshot.dispose() }
})
it('rejects aggregate substitution for an explicit-body point before returning a report', () => {
  const doc = original('point'), snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const refs = request(snapshot, doc, 'point')
    expect(() => measureAssemblySymmetryReferences(snapshot, doc, { ...refs, source: { ...refs.source, body: null } })).toThrow()
    expect(() => snapshot.listVertices(doc, ['b'])).toThrow()
  } finally { snapshot.dispose() }
})
it('retains huge cancelled placement magnitudes and rejects unresolved physical precision', () => {
  const doc = original('point'), a = doc.occurrences[0]
  doc.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original cancelled chain', createdAt: stamp, updatedAt: stamp, occurrences: [{ ...structuredClone(a), id: 'inner', pose: { ...identityRigidPose(), translation: [-1e16, 0, 0] } }], mates: [] })
  a.definition = { id: 'sub', revision: 'r1' }; a.pose.translation = [1e16, 0, 0]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const selected = snapshot.listVertices(doc, ['a', 'inner'])[0]
    const refs = { entityKind: 'point', source: { kind: 'vertex', ...selected, support: 'point' }, target: entity(snapshot, doc, 'point', 'b', 1), mirror: plane(snapshot, doc, 'm', 1), alignment: null }
    expect(measureAssemblySymmetryReferences(snapshot, doc, refs).status).toBe('precisionLimit')
  } finally { snapshot.dispose() }
})
it('does not return a partial report after a second native query fails or disposes the snapshot', () => {
  for (const dispose of [false, true]) {
    const doc = original('point'), snapshot = new AssemblyGeometrySnapshot(doc), refs = request(snapshot, doc, 'point'), actual = CadEngine.prototype.inspectCurrentVertexSupport
    let calls = 0
    const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport').mockImplementation(function (this: CadEngine, ...args) {
      const value = actual.apply(this, args)
      if (++calls === 2) { if (dispose) snapshot.dispose(); else throw new NativeCleanupError({ error: Error('original query failure') }, [Error('original release failure')], 'Original point query/release failure') }
      return value
    })
    try { let escaped: unknown; expect(() => { escaped = measureAssemblySymmetryReferences(snapshot, doc, refs) }).toThrow(); expect(escaped).toBeUndefined(); expect(() => snapshot.listVertices(doc, ['a'])).toThrow() }
    finally { spy.mockRestore(); snapshot.dispose() }
  }
})
it('rejects invalid measurement policy and scope data before any native query', () => {
  const doc = original('point'), snapshot = new AssemblyGeometrySnapshot(doc), refs = request(snapshot, doc, 'point')
  const points = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport')
  try {
    let reads = 0
    const accessor = Object.defineProperty({}, 'lengthToleranceMm', { enumerable: true, get() { reads++; return 1e-6 } })
    for (const options of [{ toString: 1 }, { lengthToleranceMm: 0 }, { angleToleranceRad: Math.PI }, accessor]) {
      expect(() => measureAssemblySymmetryReferences(snapshot, doc, refs, options as never)).toThrow()
    }
    const scope = Object.defineProperty(['m'], '0', { enumerable: true, get() { reads++; return 'm' } })
    expect(() => measureAssemblySymmetryReferences(snapshot, doc, refs, {}, scope)).toThrow()
    expect(reads).toBe(0); expect(points).not.toHaveBeenCalled()
    expect(snapshot.listVertices(doc, ['a'])).toHaveLength(8)
  } finally { points.mockRestore(); snapshot.dispose() }
})
it('rechecks prior point authorities after disposal during the third native plane query', () => {
  const doc = original('point'), snapshot = new AssemblyGeometrySnapshot(doc), refs = request(snapshot, doc, 'point')
  const actual = CadEngine.prototype.inspectCurrentFaceSupport
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const value = actual.apply(this, args); snapshot.dispose(); return value
  })
  try {
    let escaped: unknown
    expect(() => { escaped = measureAssemblySymmetryReferences(snapshot, doc, refs) }).toThrow()
    expect(escaped).toBeUndefined(); expect(() => snapshot.listVertices(doc, ['a'])).toThrow()
  } finally { spy.mockRestore(); snapshot.dispose() }
})
it('retains cancelled mirror placement magnitudes through a rotated nested chain', () => {
  const doc = original('point'), mirror = doc.occurrences[2]
  doc.definitions.push({ kind: 'assembly', id: 'mirror-sub', revision: 'r1', name: 'Original rotated mirror chain', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(mirror), id: 'inner', pose: { ...identityRigidPose(), translation: [0, 1e16, 0] } }], mates: [] })
  mirror.definition = { id: 'mirror-sub', revision: 'r1' }
  mirror.pose = { translation: [1e16, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const faces = snapshot.listFaces(doc, ['m', 'inner'])
    const selected = faces.find(value => {
      const w = snapshot.resolveReference(doc, { kind: 'face', ...value, support: 'plane' })
      return w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[0] > .999
    })
    expect(selected).toBeDefined()
    const refs = { entityKind: 'point', source: entity(snapshot, doc, 'point', 'a', -1), target: entity(snapshot, doc, 'point', 'b', 1), mirror: { kind: 'face', ...selected!, support: 'plane' }, alignment: null }
    expect(measureAssemblySymmetryReferences(snapshot, doc, refs).status).toBe('precisionLimit')
  } finally { snapshot.dispose() }
})
it('reports precisionLimit for finite placements whose original magnitude sum overflows', () => {
  const doc = original('point'), a = doc.occurrences[0]
  doc.definitions.push({ kind: 'assembly', id: 'overflow-sub', revision: 'r1', name: 'Original finite extreme chain', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(a), id: 'inner', pose: { ...identityRigidPose(), translation: [-1e308, 0, 0] } }], mates: [] })
  a.definition = { id: 'overflow-sub', revision: 'r1' }; a.pose.translation = [1e308, 0, 0]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const selected = snapshot.listVertices(doc, ['a', 'inner'])[0]
    const refs = { entityKind: 'point', source: { kind: 'vertex', ...selected, support: 'point' }, target: entity(snapshot, doc, 'point', 'b', 1), mirror: plane(snapshot, doc, 'm', 1), alignment: null }
    expect(measureAssemblySymmetryReferences(snapshot, doc, refs).status).toBe('precisionLimit')
    expect(snapshot.listVertices(doc, ['a', 'inner'])).toHaveLength(8)
  } finally { snapshot.dispose() }
})
