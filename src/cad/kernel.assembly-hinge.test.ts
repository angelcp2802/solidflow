import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference, type AssemblyPlaneReference, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { solveRigidMates } from '../model/assemblySolver'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { prepareAssemblySolve, prepareAssemblyMotionPreview, applyAssemblySolvePreview, discardAssemblySolvePreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners } from './kernel.native-ownership'
import { originalHingeDocument } from './kernel.assembly-hinge-fixture.test-utils'
import { resolveAssemblyHingeReferences, assertAssemblyHingeReferences, buildAssemblyHingeConstraint, measureAssemblyHingeReferences, type AssemblyHingeReferenceRequest } from './kernel.assembly-hinge'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const near = (a: number, b: number, band = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(band)
const vector = (a: readonly number[], b: readonly number[], band = 1e-6) => { expect(a).toHaveLength(b.length); a.forEach((value, i) => near(value, b[i], band)) }
function references(document: AssemblyDocument, firstPath = ['ground'], secondPath = ['moving']) {
  const scene = buildAssemblyScene(document)
  const body = (path: string[]) => { const bodies = scene.bodies.filter(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify(path)); expect(bodies).toHaveLength(1); return bodies[0] }
  const axis = (path: string[]): AssemblyFaceReference & { support: 'axis' } => {
    const faces = body(path).faces.filter(f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius - 1) < 1e-10 && Math.hypot(f.support.point[0], f.support.point[1]) < 1e-10)
    expect(faces).toHaveLength(1); return { kind: 'face', ...structuredClone(faces[0].selection), support: 'axis' }
  }
  const plane = (path: string[], z: number): AssemblyPlaneReference => {
    const faces = body(path).faces.filter(f => f.support?.kind === 'plane' && Math.abs(f.support.point[2] - z) < 1e-10 && Math.abs(f.support.normal[2]) > .99)
    expect(faces).toHaveLength(1); return { kind: 'face', ...structuredClone(faces[0].selection), support: 'plane' }
  }
  const axial: [AssemblyPlaneReference, AssemblyPlaneReference] = [plane(firstPath, 4), plane(secondPath, 0)],
    axes: [AssemblyFaceReference & { support: 'axis' }, AssemblyFaceReference & { support: 'axis' }] = [axis(firstPath), axis(secondPath)]
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const first = snapshot.resolveReference(document, axial[0]), second = snapshot.resolveReference(document, axial[1])
    if (first.kind !== 'support' || second.kind !== 'support' || first.localSupport.kind !== 'plane' || second.localSupport.kind !== 'plane') throw Error('Actual original axial planes required')
    const secondNormal = second.localSupport.normal
    const dot = first.localSupport.normal.reduce((sum, value, i) => sum + value * secondNormal[i], 0)
    return { axis: axes, axial, alignment: (dot < 0 ? 'opposed' : 'aligned') as 'aligned' | 'opposed' }
  } finally { snapshot.dispose() }
}
function primitiveControl(document = originalHingeDocument(), axial = true): AssemblyDocument {
  const q = references(document), checked = validateAssemblyDocument(document)
  checked.mates = [{ id: 'control-axis', name: 'Current native coaxial control', type: 'concentric', suppressed: false, first: q.axis[0], second: q.axis[1], alignment: 'aligned', rotationLock: null },
    ...(axial ? [{ id: 'control-axial', name: 'Current native axial cap control', type: 'coincident' as const, suppressed: false, first: q.axial[0], second: q.axial[1], alignment: q.alignment }] : [])]
  return validateAssemblyDocument(checked)
}
function ready(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview { expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready'); if (value.status !== 'ready') throw Error(value.message); return value }
function rootResult(value: AssemblySolvePreview) { const root = value.scopes.find(scope => scope.definition.id === 'original-hinge'); expect(root).toBeDefined(); return root!.result }
function physical(document: AssemblyDocument, quarterTurns = 0) {
  const scene = buildAssemblyScene(document); expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(2); expect(scene.prototypeCount).toBe(1)
  near(scene.volume, 384 - 8 * Math.PI, 1e-5); near(scene.area, 448 + 12 * Math.PI, 1e-5)
  for (const body of scene.bodies) { expect(body.solidCount).toBe(1); near(body.volume, 192 - 4 * Math.PI, 1e-5); near(body.area, 224 + 6 * Math.PI, 1e-5) }
  const moving = scene.bodies.find(body => body.component.occurrencePath[0] === 'moving')!, ground = scene.bodies.find(body => body.component.occurrencePath[0] === 'ground')!
  vector(ground.bounds.min, [-2, -2, 0]); vector(ground.bounds.max, [10, 2, 4])
  vector(moving.bounds.min, [-2, -2, 4]); vector(moving.bounds.max, quarterTurns === 1 ? [2, 10, 8] : [10, 2, 8])
  const corners = moving.vertexPoints!.filter(vertex => vertex.point.every((value, i) => Math.abs(value - [10, 2, 4][i]) < 1e-10)); expect(corners).toHaveLength(1)
  const snapshot = new AssemblyGeometrySnapshot(document)
  try { const point = snapshot.resolveVertexReference(document, { kind: 'vertex', ...structuredClone(corners[0].selection), support: 'point' }); vector(point.worldSupport.point, quarterTurns === 1 ? [-2, 10, 8] : [10, 2, 8]) }
  finally { snapshot.dispose() }
  withNativeOwners(owners => {
    const definition = document.definitions[0]; if (definition.kind !== 'part') throw Error('Original part required')
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    const inventory = engine.rebuildForAssemblyReferences(definition.document.features)
    expect(inventory.featureErrors).toEqual([]); if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw Error('One explicit native solid required')
    const shape = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), oc = getOC(), checker = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false))
    expect(checker.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
  })
}

it('uses actual coaxial and axial primitives to remove four plus one independent DOF on original reused leaves', () => {
  for (const [document, dof, rank] of [[originalHingeDocument(), 6, 0], [primitiveControl(undefined, false), 2, 4], [primitiveControl(), 1, 5]] as const) {
    const before = serializeAssemblyDocument(document), preview = ready(prepareAssemblySolve(document))
    try { expect(rootResult(preview).localDOF).toBe(dof); expect(rootResult(preview).rank).toBe(rank); expect(preview.checks.every(check => check.satisfied)).toBe(true); physical(validateAssemblyDocument(preview.document)) }
    finally { discardAssemblySolvePreview(preview) }
    expect(serializeAssemblyDocument(document)).toBe(before)
  }
}, 60_000)

function request(document: AssemblyDocument, firstPath = ['ground'], secondPath = ['moving']): AssemblyHingeReferenceRequest {
  const q = references(document, firstPath, secondPath)
  return { axis: q.axis, axial: q.axial, alignment: 'aligned' }
}
function nativeSolve(document: AssemblyDocument, q: AssemblyHingeReferenceRequest, scopePath: string[] = []) {
  const snapshot = new AssemblyGeometrySnapshot(document), before = serializeAssemblyDocument(document)
  try {
    const issued = resolveAssemblyHingeReferences(snapshot, document, q, scopePath)
    expect(Object.isFrozen(issued)).toBe(true); expect(Object.isFrozen(issued.axis)).toBe(true)
    assertAssemblyHingeReferences(snapshot, document, issued)
    const constraint = buildAssemblyHingeConstraint(snapshot, document, issued, 'original-native-hinge')
    expect(constraint.type).toBe('hinge'); expect(constraint.uncertainty).toHaveLength(4)
    for (const error of constraint.uncertainty!) { expect(error.positionErrorMm).toBeGreaterThan(0); expect(error.directionErrorRad).toBeGreaterThan(0) }
    const result = solveRigidMates({ bodies: document.occurrences.map(o => ({ id: o.id, fixed: o.fixed, pose: structuredClone(o.pose) as RigidPose })), constraints: [constraint],
      origin: [0, 0, 0], lengthScale: 20, lengthTolerance: 1e-6, angleTolerance: 1e-8 })
    expect(['underdefined', 'fullyDefined']).toContain(result.status); expect(result.poses).not.toBeNull()
    const candidate = validateAssemblyDocument(document)
    for (const o of candidate.occurrences) o.pose = structuredClone(result.poses!.get(o.id)!)
    assertAssemblyHingeReferences(snapshot, document, issued); expect(serializeAssemblyDocument(document)).toBe(before)
    return { candidate, result, constraint }
  } finally { snapshot.dispose() }
}
function independentMeasure(document: AssemblyDocument, q: AssemblyHingeReferenceRequest, scopePath: string[] = []) {
  const fresh = new AssemblyGeometrySnapshot(document)
  try {
    const report = measureAssemblyHingeReferences(fresh, document, q, {}, scopePath)
    expect(report.status).toBe('ok'); if (report.status !== 'ok') throw Error(report.message)
    expect(report.supportOnly).toBe(true); expect(report.qualifiedRotation).toBe(true); expect(report.satisfied).toBe(true)
    expect(report.axisAngleRad).toBeLessThanOrEqual(1e-8); expect(report.transverseResidualMm).toBeLessThanOrEqual(1e-6); expect(Math.abs(report.axialOffsetMm)).toBeLessThanOrEqual(1e-6)
    expect(report.axialityRad.every(angle => angle <= 1e-12)).toBe(true)
    expect(report.precision.positionMm).toBeLessThanOrEqual(1e-6); expect(report.precision.directionRad).toBeLessThanOrEqual(1e-8)
    return report
  } finally { fresh.dispose() }
}

it('builds from four live native references, solves a displaced leaf and independently remeasures its material geometry', () => {
  const d = originalHingeDocument(); d.occurrences[1].pose.translation = [3, -2, 7]
  const q = request(d), { candidate, result, constraint } = nativeSolve(d, q)
  expect(result.rank).toBe(5); expect(result.localDOF).toBe(1)
  expect(constraint.axis.map(e => e.bodyId)).toEqual(['ground', 'moving']); expect(constraint.axial.map(e => e.bodyId)).toEqual(['ground', 'moving'])
  vector(candidate.occurrences[1].pose.translation, [0, 0, 4]); physical(candidate)
  const report = independentMeasure(candidate, q); expect(report.componentPaths).toEqual({ axis: [['ground'], ['moving']], axial: [['ground'], ['moving']] })
  expect('token' in report).toBe(false); expect('localDOF' in report).toBe(false)
}, 60_000)

it('retains a native-derived quarter-turn spin and distinguishes common floating gauge from the relative revolute mode', () => {
  const d = originalHingeDocument(); d.occurrences[1].pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const q = request(d), { candidate, result } = nativeSolve(d, q)
  expect(result.rank).toBe(5); expect(result.localDOF).toBe(1); physical(candidate, 1); independentMeasure(candidate, q)
  const floating = originalHingeDocument(); floating.occurrences[0].fixed = false
  const free = nativeSolve(floating, request(floating)); expect(free.result.rank).toBe(5); expect(free.result.localDOF).toBe(7)
  independentMeasure(free.candidate, request(floating))
}, 60_000)

it('rejects copied, wrong-purpose, different-snapshot, disposed and changed-source proofs without granting numerical authority', () => {
  const d = originalHingeDocument(), q = request(d), snapshot = new AssemblyGeometrySnapshot(d), other = new AssemblyGeometrySnapshot(d)
  try {
    const issued = resolveAssemblyHingeReferences(snapshot, d, q)
    expect(() => assertAssemblyHingeReferences(snapshot, d, structuredClone(issued))).toThrow(/issued/)
    expect(() => assertAssemblyHingeReferences(other, d, issued)).toThrow(/issued/)
    expect(() => buildAssemblyHingeConstraint(snapshot, d, issued.axis[0] as never, 'wrong-purpose')).toThrow(/issued/)
    const changed = validateAssemblyDocument(d), definition = changed.definitions[0]
    if (definition.kind !== 'part' || definition.document.features[1].type !== 'extrude') throw Error('Original extrusion required')
    definition.document.features[1].depth = 5
    expect(() => assertAssemblyHingeReferences(snapshot, changed, issued)).toThrow()
  } finally { snapshot.dispose(); other.dispose() }
  const closed = new AssemblyGeometrySnapshot(d), issued = resolveAssemblyHingeReferences(closed, d, q); closed.dispose()
  expect(() => buildAssemblyHingeConstraint(closed, d, issued, 'disposed')).toThrow()
}, 60_000)

it('preflights malformed data without invoking accessors or consuming the borrowed snapshot', () => {
  const d = originalHingeDocument(), q = request(d), snapshot = new AssemblyGeometrySnapshot(d); let reads = 0
  const query = { ...q }; Object.defineProperty(query, 'axis', { enumerable: true, get() { reads++; return q.axis } })
  const inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport')
  try {
    expect(() => resolveAssemblyHingeReferences(snapshot, d, query)).toThrow(/data/); expect(reads).toBe(0); expect(inspect).not.toHaveBeenCalled()
    expect(() => resolveAssemblyHingeReferences(snapshot, d, { ...q, extra: true })).toThrow(/exact/)
    expect(snapshot.listFaces(d, ['ground']).length).toBeGreaterThan(0)
    const valid = resolveAssemblyHingeReferences(snapshot, d, q); assertAssemblyHingeReferences(snapshot, d, valid)
  } finally { inspect.mockRestore(); snapshot.dispose() }
}, 60_000)

it('publishes no four-role proof after fourth native query failure and releases its current engine', () => {
  const d = originalHingeDocument(), q = request(d), snapshot = new AssemblyGeometrySnapshot(d), real = CadEngine.prototype.inspectCurrentFaceSupport
  let count = 0; const inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    if (++count === 4) throw Error('Original fourth-query failure'); return real.apply(this, args)
  }), release = vi.spyOn(CadEngine.prototype, 'dispose')
  try {
    expect(() => resolveAssemblyHingeReferences(snapshot, d, q)).toThrow('Original fourth-query failure'); expect(count).toBe(4); expect(release).toHaveBeenCalled()
    expect(() => snapshot.listFaces(d, ['ground'])).toThrow()
  } finally { inspect.mockRestore(); release.mockRestore(); snapshot.dispose() }
}, 60_000)

it('refuses radial planes despite the misleading possibility of one remaining translational DOF', () => {
  const d = originalHingeDocument(), q = request(d), scene = buildAssemblyScene(d), moving = scene.bodies.find(b => b.component.occurrencePath[0] === 'moving')!
  const face = moving.faces.find(f => f.support?.kind === 'plane' && Math.abs(f.support.normal[0]) > .99 && Math.abs(f.support.point[0] - 10) < 1e-10)!
  expect(face).toBeDefined(); q.axial[1] = { kind: 'face', ...structuredClone(face.selection), support: 'plane' }
  const snapshot = new AssemblyGeometrySnapshot(d)
  try { const issued = resolveAssemblyHingeReferences(snapshot, d, q); expect(() => buildAssemblyHingeConstraint(snapshot, d, issued, 'radial')).toThrow(/perpendicular|radial/) }
  finally { snapshot.dispose() }
  const fresh = new AssemblyGeometrySnapshot(d)
  try { expect(() => measureAssemblyHingeReferences(fresh, d, q)).toThrow(/perpendicular|radial/) } finally { fresh.dispose() }
}, 60_000)

function containerDocument(differentChildren = false, capTilt = 0): AssemblyDocument {
  const d = originalHingeDocument(), child = { ...structuredClone(d.occurrences[0]), fixed: true }, stamp = d.createdAt
  const node: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-hinge-container', revision: 'r0', name: 'Original rigid reference container', createdAt: stamp, updatedAt: stamp,
    occurrences: differentChildren ? ['axis-leaf', 'cap-leaf'].map(id => ({ ...structuredClone(child), id, name: id,
      pose: { translation: [1, 2, 0], rotation: id === 'cap-leaf' && capTilt ? [Math.sin(capTilt / 2), 0, 0, Math.cos(capTilt / 2)] : [0, 0, Math.SQRT1_2, Math.SQRT1_2] } })) : structuredClone(d.occurrences), mates: [] }
  d.definitions.push(node); d.occurrences.forEach(o => { o.definition = { id: node.id, revision: node.revision } }); return validateAssemblyDocument(d)
}
it('combines actual axis and cap on different descendants of each rigid root owner without confusing reused definitions', () => {
  const d = containerDocument(true), axes = references(d, ['ground', 'axis-leaf'], ['moving', 'axis-leaf']), caps = references(d, ['ground', 'cap-leaf'], ['moving', 'cap-leaf'])
  const q: AssemblyHingeReferenceRequest = { axis: axes.axis, axial: caps.axial, alignment: 'aligned' }, solved = nativeSolve(d, q)
  expect(solved.result.rank).toBe(5); expect(solved.result.localDOF).toBe(1)
  expect(solved.constraint.axis.map(x => x.bodyId)).toEqual(['ground', 'moving']); expect(solved.constraint.axial.map(x => x.bodyId)).toEqual(['ground', 'moving'])
  vector(solved.constraint.axis[0].frame.translation, [1, 2, 0]); independentMeasure(solved.candidate, q)
  const invalid = structuredClone(q); invalid.axial[0] = q.axial[1]
  const snapshot = new AssemblyGeometrySnapshot(d)
  try { expect(() => resolveAssemblyHingeReferences(snapshot, d, invalid)).toThrow(/owner/) } finally { snapshot.dispose() }
}, 60_000)

it('keeps scope as reference context and never promotes two descendants into independent root bodies', () => {
  const d = containerDocument(), q = request(d, ['ground', 'ground'], ['ground', 'moving'])
  d.occurrences[0].fixed = false; d.occurrences[1].fixed = true
  d.occurrences[0].pose = { translation: [7, -2, 3], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  for (const ref of [...q.axis, ...q.axial]) { if (!ref.component) throw Error('Material original component'); ref.component.occurrencePath = ref.component.occurrencePath.slice(1) }
  const solved = nativeSolve(d, q, ['ground'])
  expect(solved.constraint.axis.map(x => x.bodyId)).toEqual(['ground', 'ground']); expect(solved.constraint.axial.map(x => x.bodyId)).toEqual(['ground', 'ground'])
  expect(solved.result.rank).toBe(0); expect(solved.result.localDOF).toBe(6)
  const report = independentMeasure(solved.candidate, q, ['ground'])
  expect(report.scopePath).toEqual(['ground']); expect(report.componentPaths.axis).toEqual([['ground', 'ground'], ['ground', 'moving']])
  const body = buildAssemblyScene(solved.candidate).bodies.find(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify(['ground', 'moving']))!
  const corner = body.vertexPoints!.find(v => v.point.every((value, i) => Math.abs(value - [10, 2, 4][i]) < 1e-10))!
  vector(corner.worldPoint, [17, -10, 5])
}, 60_000)

it('rejects an oblique descendant cap at five nanoradians structurally without widening the declared angular acceptance band', () => {
  const d = containerDocument(true, 5e-9), axes = references(d, ['ground', 'axis-leaf'], ['moving', 'axis-leaf']), caps = references(d, ['ground', 'cap-leaf'], ['moving', 'cap-leaf'])
  const q: AssemblyHingeReferenceRequest = { axis: axes.axis, axial: caps.axial, alignment: 'aligned' }, snapshot = new AssemblyGeometrySnapshot(d)
  try { const issued = resolveAssemblyHingeReferences(snapshot, d, q); expect(() => buildAssemblyHingeConstraint(snapshot, d, issued, 'near-oblique', { angleToleranceRad: 1e-3 })).toThrow(/perpendicular|axial/) }
  finally { snapshot.dispose() }
  const fresh = new AssemblyGeometrySnapshot(d)
  try { expect(() => measureAssemblyHingeReferences(fresh, d, q, { angleToleranceRad: 1e-3 })).toThrow(/perpendicular|axial/) } finally { fresh.dispose() }
}, 60_000)

it('admits actual material LINE axes while rejecting an axial plane offered as an axis purpose', () => {
  const d = originalHingeDocument(), q = request(d), scene = buildAssemblyScene(d)
  q.axis = ['ground', 'moving'].map(id => {
    const body = scene.bodies.find(b => b.component.occurrencePath[0] === id)!, edges = body.edges!.filter(e => e.support?.kind === 'line'
      && Math.abs(e.support.axis[2]) > .99 && Math.abs(e.support.point[0] - 10) < 1e-10 && Math.abs(e.support.point[1] - 2) < 1e-10)
    expect(edges).toHaveLength(1); return { kind: 'edge' as const, ...structuredClone(edges[0].selection), support: 'line' as const }
  }) as AssemblyHingeReferenceRequest['axis']
  const solved = nativeSolve(d, q); expect(solved.result.rank).toBe(5); expect(solved.result.localDOF).toBe(1); independentMeasure(solved.candidate, q)
  const wrong = structuredClone(q); wrong.axis[0] = q.axial[0] as never
  const snapshot = new AssemblyGeometrySnapshot(d)
  try { expect(() => resolveAssemblyHingeReferences(snapshot, d, wrong)).toThrow(/axes/); expect(snapshot.listFaces(d, ['ground']).length).toBeGreaterThan(0) }
  finally { snapshot.dispose() }
}, 60_000)

it('retains original large cancelling declarations in the native uncertainty rather than certifying the small final world pose', () => {
  const d = containerDocument(), node = d.definitions.find(x => x.kind === 'assembly')!
  if (node.kind !== 'assembly') throw Error('Original nested source')
  d.occurrences.forEach(o => { o.pose.translation[0] = 1e12 })
  node.occurrences.forEach(o => { o.pose.translation[0] = -1e12 })
  const q = request(d, ['ground', 'ground'], ['moving', 'ground']), snapshot = new AssemblyGeometrySnapshot(d)
  try { const issued = resolveAssemblyHingeReferences(snapshot, d, q); expect(() => buildAssemblyHingeConstraint(snapshot, d, issued, 'cancellation')).toThrow(/precision/) }
  finally { snapshot.dispose() }
  const fresh = new AssemblyGeometrySnapshot(d)
  try { const report = measureAssemblyHingeReferences(fresh, d, q); expect(report.status).toBe('precisionLimit'); expect('qualifiedRotation' in report).toBe(false) }
  finally { fresh.dispose() }
}, 60_000)

it('drives the remaining physical material spin ninety degrees through native motion and preserves hole volume, cap and source identity', () => {
  const document = primitiveControl(), history = new AssemblyDocumentHistory(document), first = ready(prepareAssemblySolve(document)), solved = applyAssemblySolvePreview(history, first)
  const moved = ready(prepareAssemblyMotionPreview(solved, { component: { occurrencePath: ['moving'], definition: { ...solved.occurrences[1].definition } }, translation: [0, 0, 4], rotation: { axis: 2, angle: Math.PI / 2 } }))
  expect(moved.motion?.verifiedStations).toBe(moved.motion?.stationCount)
  const candidate = applyAssemblySolvePreview(history, moved); physical(candidate, 1)
  expect(candidate.occurrences[0]).toEqual(document.occurrences[0]); expect(candidate.definitions).toEqual(document.definitions)
  const fresh = ready(prepareAssemblySolve(candidate)); try { expect(rootResult(fresh).localDOF).toBe(1); physical(validateAssemblyDocument(fresh.document), 1) } finally { discardAssemblySolvePreview(fresh) }
}, 60_000)
