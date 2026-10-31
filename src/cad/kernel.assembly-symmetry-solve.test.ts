import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, validateAssemblyMate, serializeAssemblyDocument, parseAssemblyDocument, type AssemblyDocument, type AssemblyPlaneReference, type EmbeddedPartDefinition, type AssemblySymmetryMate } from '../model/assemblyDocument'
import { validateAssemblySymmetryReferenceSet, type AssemblySymmetryReferenceSet } from '../model/assemblySymmetryReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { measureAssemblySymmetryReferences } from './kernel.assembly-symmetry'
import { CadEngine } from './kernel.engine'
import { UnsupportedAssemblyCylinderSurfaceError, UnsupportedAssemblySphereSurfaceError } from './kernel.assembly-supports'
import { NativeCleanupError } from './kernel.native-ownership'
import { prepareAssemblySolve, discardAssemblySolvePreview, prepareAssemblyMovePreview, prepareAssemblyDragPreview } from './kernel.assembly-solve'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { buildAssemblyScene } from './kernel.assembly-scene'

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
function saved(kind: Kind, freeAll = false): AssemblyDocument {
  const doc = original(kind), snapshot = new AssemblyGeometrySnapshot(doc)
  try { doc.mates = [validateAssemblyMate({ id: 'native-symmetry', name: 'Original ' + kind, type: 'symmetry', suppressed: false, ...request(snapshot, doc, kind) })] }
  finally { snapshot.dispose() }
  doc.occurrences[0].fixed = !freeAll; doc.occurrences[2].fixed = !freeAll
  doc.occurrences[1].pose.translation[0]++
  return validateAssemblyDocument(doc)
}
const mate = (d: AssemblyDocument): AssemblySymmetryMate => { const m = d.mates[0]; if (m.type !== 'symmetry') throw Error('Actual symmetry declaration required'); return m }
function ready(value: ReturnType<typeof prepareAssemblySolve>) { expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready'); if (value.status !== 'ready') throw Error(value.message); return value }
/** Independently project actual world-native supports; no symmetry helper/rows. */
function physical(input: unknown) {
  const doc = validateAssemblyDocument(input)
  const snapshot = new AssemblyGeometrySnapshot(doc), declaration = mate(doc)
  try {
    const resolve = (ref: AssemblySymmetryReferenceSet['source']) => ref.kind === 'vertex' ? snapshot.resolveVertexReference(doc, ref)
      : ref.kind === 'face' && ref.support === 'sphere-surface' ? snapshot.resolveSphereSurfaceReference(doc, ref)
        : ref.kind === 'face' && ref.support === 'cylinder-surface' ? snapshot.resolveCylinderSurfaceReference(doc, ref) : snapshot.resolveReference(doc, ref)
    const simple = (w: ReturnType<typeof resolve>) => {
      if (w.kind === 'component') throw Error('No component fallback')
      const s = w.worldSupport
      return { point: s.kind === 'sphere-surface' ? s.center : s.point, direction: s.kind === 'point' || s.kind === 'sphere-surface' ? null : s.kind === 'plane' ? s.normal : s.axis }
    }
    const a = simple(resolve(declaration.source)), b = simple(resolve(declaration.target)), m = simple(resolve(declaration.mirror))
    const dot = (x: readonly number[], y: readonly number[]) => x.reduce((s, v, i) => s + v * y[i], 0), n = m.direction!
    const offset = dot(n, a.point.map((x, i) => x - m.point[i])), delta = b.point.map((x, i) => x - a.point[i] + 2 * n[i] * offset)
    const t = b.direction ? dot(b.direction, delta) : 0, position = b.direction ? delta.map((x, i) => declaration.entityKind === 'plane' ? b.direction![i] * t : x - b.direction![i] * t) : delta
    expect(Math.hypot(...position)).toBeLessThanOrEqual(1e-6)
    if (a.direction && b.direction) {
      const sign = declaration.alignment === 'opposed' ? -1 : 1, d = a.direction.map((x, i) => sign * (x - 2 * n[i] * dot(n, a.direction!))), e = b.direction
      const cross = [d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]]
      expect(Math.atan2(Math.hypot(...cross), dot(d, e))).toBeLessThanOrEqual(1e-8)
    }
    expect(ok(measureAssemblySymmetryReferences(snapshot, doc, { entityKind: declaration.entityKind, source: declaration.source,
      target: declaration.target, mirror: declaration.mirror, alignment: declaration.alignment })).satisfied).toBe(true)
  } finally { snapshot.dispose() }
}
for (const kind of kinds) it('solves a real one-mm ' + kind + ' defect and verifies final native supports independently', () => {
  const doc = saved(kind), before = serializeAssemblyDocument(doc), value = ready(prepareAssemblySolve(doc))
  try {
    expect(value.document.occurrences[0]).toEqual(doc.occurrences[0]); expect(value.document.occurrences[2]).toEqual(doc.occurrences[2]); expect(value.document.mates).toEqual(doc.mates)
    physical(value.document); expect(value.symmetries).toHaveLength(1)
    expect(value.symmetries![0]).toMatchObject({ entityKind: kind, supportOnly: true })
    const expectedVolume = kind === 'sphere' ? 32 * Math.PI / 3 : kind === 'cylinder' ? 16 * Math.PI : 96
    const scene = buildAssemblyScene(validateAssemblyDocument(value.document))
    expect(scene.bodies).toHaveLength(3)
    for (const body of scene.bodies) near(body.volume, body.component.occurrencePath[0] === 'm' ? 96 : expectedVolume, 1e-5)
    if (kind === 'sphere') near(value.document.occurrences[1].pose.translation[0], 5, 1e-6)
    if (kind === 'point') {
      const current = validateAssemblyDocument(value.document), actual = new AssemblyGeometrySnapshot(current), target = mate(current).target
      try { if (target.kind !== 'vertex') throw Error('Material point required'); near(actual.resolveVertexReference(current, target).worldSupport.point[0], 7, 1e-6) }
      finally { actual.dispose() }
    }
  } finally { discardAssemblySolvePreview(value) }
  expect(serializeAssemblyDocument(doc)).toBe(before)
}, 60_000)
for (const kind of kinds) it('retains all three moving native ' + kind + ' owners in one incidence group', () => {
  const doc = saved(kind, true), value = ready(prepareAssemblySolve(doc))
  try {
    const group = value.scopes.at(-1)!.result.evidence.groups.find(g => g.constraintIds.includes('native-symmetry'))!
    expect(group.bodyIds).toEqual(['a', 'b', 'm']); expect(group.unanchored).toBe(true); expect(group.rank).toBe(kind === 'line' || kind === 'cylinder' ? 4 : 3)
    physical(value.document)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)
it('solves the independently moving mirror from literal point mid-plane geometry', () => {
  const doc = saved('point'); doc.occurrences[1].fixed = true; doc.occurrences[2].fixed = false
  const value = ready(prepareAssemblySolve(doc))
  try {
    expect(value.document.occurrences.slice(0, 2)).toEqual(doc.occurrences.slice(0, 2)); physical(value.document)
    const current = validateAssemblyDocument(value.document), snapshot = new AssemblyGeometrySnapshot(current)
    try {
      const w = snapshot.resolveReference(current, mate(current).mirror)
      if (w.kind !== 'support' || w.worldSupport.kind !== 'plane') throw Error('Actual mirror plane required')
      // Source/target points are (-7,-3,0) and (8,-3,0): mirror X=0.5.
      near(w.worldSupport.normal[0], 1, 1e-8); near(w.worldSupport.point[0], .5, 1e-6)
    } finally { snapshot.dispose() }
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)
for (const kind of kinds) it('retains repeated native ' + kind + ' owner roles while repairing the mirror', () => {
  const doc = saved(kind); doc.occurrences[0].pose.translation[0] = 0; doc.occurrences[2].fixed = false; doc.occurrences[2].pose.translation[0]++
  const declaration = mate(doc); declaration.target.component!.occurrencePath = ['a']
  const value = ready(prepareAssemblySolve(doc))
  try { physical(value.document); expect(value.symmetries![0].componentPaths.source).toEqual(['a']); expect(value.symmetries![0].componentPaths.target).toEqual(['a']) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)
it('uses an explicit fixed-scope mirror without inventing a moving mirror owner', () => {
  const doc = saved('point'); mate(doc).mirror = { kind: 'principal-plane', component: null, plane: 'YZ' }
  const value = ready(prepareAssemblySolve(doc))
  try { physical(value.document); expect(value.symmetries![0].componentPaths.mirror).toEqual([]) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)
it('solves explicit cylindrical-face axis line purpose without inheriting surface-radius equations', () => {
  const doc = saved('cylinder'), declaration = mate(doc)
  doc.mates = [validateAssemblyMate({ ...declaration, entityKind: 'line', source: { ...declaration.source, support: 'axis' }, target: { ...declaration.target, support: 'axis' } })]
  const value = ready(prepareAssemblySolve(doc))
  try { physical(value.document); expect(value.symmetries![0].entityKind).toBe('line'); expect(value.symmetries![0].radiusDifferenceMm).toBeNull() }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)
it('solves and reopens a real relation declared inside a rotated rigid subassembly', () => {
  const doc = saved('point'), occurrences = doc.occurrences, mates = doc.mates
  doc.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original nested symmetry', createdAt: stamp, updatedAt: stamp, occurrences, mates })
  doc.mates = []; doc.occurrences = [{ id: 'parent', name: 'Rotated parent', definition: { id: 'sub', revision: 'r1' }, pose: { translation: [20, 30, 40], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false }]
  const value = ready(prepareAssemblySolve(doc))
  try {
    const current = parseAssemblyDocument(serializeAssemblyDocument(validateAssemblyDocument(value.document))), sub = current.definitions.find(d => d.id === 'sub')
    if (sub?.kind !== 'assembly') throw Error('Actual solved nested declaration required')
    physical({ ...current, occurrences: sub.occurrences, mates: sub.mates })
    expect(value.symmetries!.some(r => r.scopePath.join('/') === 'parent')).toBe(true)
    expect(current.occurrences[0].pose).toEqual(doc.occurrences[0].pose)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)
it('rejects unequal native radii without publishing a pose or mutating the document', () => {
  const doc = saved('sphere'); doc.definitions.push(structuredClone(largerSphere)); doc.occurrences[1].definition = { id: largerSphere.id, revision: largerSphere.revision }
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try { const old = mate(doc); doc.mates = [validateAssemblyMate({ ...old, target: entity(snapshot, doc, 'sphere', 'b', 1) })] } finally { snapshot.dispose() }
  const before = serializeAssemblyDocument(doc), value = prepareAssemblySolve(doc)
  expect(value.status).toBe('rejected'); expect(value).not.toHaveProperty('document'); expect(serializeAssemblyDocument(doc)).toBe(before)
}, 60_000)
it('cancels, applies, undoes and reopens a worker-owned native symmetry proposal', () => {
  const doc = saved('point'), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(doc)
  try {
    const canceled = session.prepare(doc); expect(canceled.status).toBe('ready'); if (canceled.status !== 'ready') throw Error(canceled.message)
    session.discard(canceled.token); expect(() => session.apply(doc, canceled.token)).toThrow()
    const pending = session.prepare(doc); expect(pending.status).toBe('ready'); if (pending.status !== 'ready') throw Error(pending.message)
    pending.document.occurrences[1].pose.translation[0] = 999
    const applied = session.apply(doc, pending.token).document; physical(applied); history.commitDocument(applied)
    expect(history.undo()).toEqual(doc); expect(history.redo()).toEqual(applied)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = session.prepare(reopened)
    expect(fresh.status).toBe('ready'); if (fresh.status !== 'ready') throw Error(fresh.message); expect(fresh.symmetries).toHaveLength(1)
    expect(fresh.document.mates).toEqual(doc.mates); physical(fresh.document)
  } finally { session.discard() }
}, 60_000)
it('distinguishes strict point movement from local target projection without altering hard geometry', () => {
  const first = ready(prepareAssemblySolve(saved('point'))), doc = validateAssemblyDocument(first.document); discardAssemblySolvePreview(first)
  const component = { occurrencePath: ['b'], definition: { ...doc.occurrences[1].definition } }, pose = { ...identityRigidPose(), translation: [6, 0, 0] as [number, number, number] }
  expect(prepareAssemblyMovePreview(doc, { component, pose }).status).toBe('rejected')
  const projected = ready(prepareAssemblyDragPreview(doc, { component, pose, mode: 'translate' }))
  try { expect(projected.projection?.evidence.localOnly).toBe(true); physical(projected.document) } finally { discardAssemblySolvePreview(projected) }
}, 60_000)
it('withholds the candidate when a later fresh native point query fails', () => {
  const doc = saved('point'), actual = CadEngine.prototype.inspectCurrentVertexSupport
  let calls = 0
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport').mockImplementation(function (this: CadEngine, ...args) {
    if (++calls === 3) throw new NativeCleanupError({ error: Error('Original later query fault') }, [Error('Original release fault')], 'Original final verification fault')
    return actual.apply(this, args)
  })
  try { const before = serializeAssemblyDocument(doc), value = prepareAssemblySolve(doc); expect(calls).toBeGreaterThanOrEqual(3); expect(value.status).toBe('rejected'); expect(value).not.toHaveProperty('document'); expect(serializeAssemblyDocument(doc)).toBe(before) }
  finally { spy.mockRestore() }
}, 60_000)
it('rejects a cancelled nested source chain before publishing any candidate', () => {
  const doc = saved('point'), selected = mate(doc).source
  if (selected.kind !== 'vertex') throw Error('Point required')
  const old = doc.occurrences[0]
  doc.definitions.push({ kind: 'assembly', id: 'cancelled', revision: 'r1', name: 'Original cancelled chain', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(old), id: 'inner', pose: { ...identityRigidPose(), translation: [-1e16, 0, 0] } }], mates: [] })
  old.definition = { id: 'cancelled', revision: 'r1' }; old.pose.translation = [1e16, 0, 0]; selected.component.occurrencePath = ['a', 'inner']
  const before = serializeAssemblyDocument(doc), value = prepareAssemblySolve(doc)
  expect(value.status).toBe('rejected'); expect(value).not.toHaveProperty('document'); expect(serializeAssemblyDocument(doc)).toBe(before)
}, 60_000)
it('rejects original cancelled mirror arithmetic rather than certifying its small composed pose', () => {
  const doc = saved('point'), declaration = mate(doc), old = doc.occurrences[2]
  if (declaration.mirror.kind !== 'face') throw Error('Material mirror required')
  doc.definitions.push({ kind: 'assembly', id: 'mirror-sub', revision: 'r1', name: 'Original cancelled mirror', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(old), id: 'inner', pose: { ...identityRigidPose(), translation: [-1e16, 0, 0] } }], mates: [] })
  old.definition = { id: 'mirror-sub', revision: 'r1' }; old.pose.translation = [1e16, 0, 0]; declaration.mirror.component!.occurrencePath = ['m', 'inner']
  const before = serializeAssemblyDocument(doc), value = prepareAssemblySolve(doc)
  expect(value.status).toBe('rejected'); expect(value).not.toHaveProperty('document'); expect(serializeAssemblyDocument(doc)).toBe(before)
}, 60_000)
