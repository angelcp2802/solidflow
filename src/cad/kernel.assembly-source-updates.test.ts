import { requireBinaryAssemblyMate } from '../model/assemblyBinaryFixtures.test-utils'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { makeBox, measureShapeVolumeProperties, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyComponentReference,
  type AssemblyDocument, type AssemblyFaceReference, type AssemblyMate, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { validateDocument, type Document } from '../model/document'
import { identityRigidPose } from '../model/rigidPose'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, prepareAssemblySolve, type AssemblySolvePreview } from './kernel.assembly-solve'
import { CadEngine } from './kernel.engine'
import { bodyBoolean } from './kernel.bodies'
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership'
import * as placements from './kernel.assembly-placements'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original public-feature fixtures in millimeters. The plate is 40×30×4 with
// two R3 holes at X=±10. Each reused pin is R2×12 with an eccentric R.25 bore
// at (1,0). Updating only the outer radius to 2.5 gives each pin V=297π/4,
// A=627π/8; aggregate plate+two pins V=4800+153π/2, A=2960+675π/4.
// A second fixture is a legacy finite entity-disk extrusion: R2→2.5, H12.
// Its saved circle ID is preserved only in the semantic positive control.
// A separate depth edit H12→16 retains the endcap role; fresh solves must move
// a free disk from Z=-12 to -16 against the declaring frame's XY plane.
// No external models, nearest matching or expected final solver poses seed a solve.
const pinSource = { id: 'example-pin', revision: 'r1' }, semanticSource = { id: 'semantic-pin', revision: 'r1' }
const near = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
function vector(actual: readonly number[], expected: readonly number[], tolerance = 1e-6) {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, index) => near(value, expected[index], tolerance))
}
function part(input: AssemblyDocument, id: string): EmbeddedPartDefinition {
  const value = input.definitions.find(definition => definition.id === id && definition.revision === 'r1')
  if (!value || value.kind !== 'part') throw new Error('Original fixture part missing')
  return value
}
function changedPin(input: AssemblyDocument): Document {
  const changed = structuredClone(part(input, pinSource.id).document), sketch = changed.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original pin profile missing')
  sketch.profile.radius = 2.5; return validateDocument(changed)
}
function select(scene: AssemblyScene, occurrence: string, predicate: (face: AssemblySceneFace) => boolean): AssemblySceneFace {
  const matches = scene.bodies.filter(body => body.component.occurrencePath.length === 1 && body.component.occurrencePath[0] === occurrence)
    .flatMap(body => body.faces).filter(predicate)
  expect(matches).toHaveLength(1); return matches[0]
}
function faceReference(face: AssemblySceneFace): AssemblyFaceReference {
  const reference = assemblySceneFaceReference(face)
  if (!reference) throw new Error('Actual analytical face expected')
  return reference
}
const cylinder = (radius: number, x = 0) => (face: AssemblySceneFace) => face.support?.kind === 'cylinder'
  && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9
const cap = (z: number) => (face: AssemblySceneFace) => face.support?.kind === 'plane'
  && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99
function mated(): AssemblyDocument {
  const input = createAssemblyExample(), scene = buildAssemblyScene(input), mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = select(scene, id, cylinder(2)), hole = select(scene, 'plate', cylinder(3, x))
    const pinSupport = pin.support, holeSupport = hole.support
    if (pinSupport?.kind !== 'cylinder' || holeSupport?.kind !== 'cylinder') throw new Error('Actual cylinders expected')
    const direction = pinSupport.axis.reduce((sum, value, index) => sum + value * holeSupport.axis[index], 0)
    const first = faceReference(pin), second = faceReference(hole)
    if (first.support !== 'axis' || second.support !== 'axis') throw new Error('Native axis selection expected')
    mates.push({ id: id + '-axis', name: id + ' analytical cylinders', type: 'concentric', suppressed: false,
      first: { ...first, support: 'axis' }, second: { ...second, support: 'axis' }, alignment: direction > 0 ? 'aligned' : 'opposed', rotationLock: null },
    { id: id + '-cap', name: id + ' analytical caps', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { ...faceReference(select(scene, id, cap(12))), support: 'plane' },
      second: { ...faceReference(select(scene, 'plate', cap(4))), support: 'plane' } })
  }
  input.mates = mates; return validateAssemblyDocument(input)
}
function semantic(): AssemblyDocument {
  const input = createEmptyAssembly('Original semantic source update'), stamp = '2026-10-15T00:00:00.000Z'
  input.definitions = [{ kind: 'part', ...semanticSource, document: validateDocument({ version: 1, id: semanticSource.id,
    name: 'Original finite entity disk', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'entities', name: 'Original disk identity', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'entities', points: [], entities: [{ id: 'circle', type: 'circle', center: 'origin', radius: 2, construction: false }], constraints: [] } },
      { id: 'prism', name: 'Original finite disk extrusion', type: 'extrude', sketchId: 'entities', depth: 12, symmetric: false, suppressed: false },
    ] }) }]
  input.occurrences = ['a', 'b'].map((id, index) => ({ id, name: id, definition: { ...semanticSource },
    pose: { ...identityRigidPose(), translation: [index * 10, 0, 0] as [number, number, number] }, fixed: index === 0, visible: true, suppressed: false }))
  const scene = buildAssemblyScene(input)
  input.mates = [{ id: 'axes', name: 'Original parallel entity cylinders', type: 'angle', suppressed: false, angle: 0,
    first: faceReference(select(scene, 'a', cylinder(2))), second: faceReference(select(scene, 'b', cylinder(2))) }]
  return validateAssemblyDocument(input)
}
function changedSemantic(input: AssemblyDocument): Document {
  const changed = structuredClone(part(input, semanticSource.id).document), sketch = changed.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'entities' || sketch.profile.entities[0].type !== 'circle') throw new Error('Original entity circle missing')
  sketch.profile.entities[0].radius = 2.5; return validateDocument(changed)
}
function component(id: string): AssemblyComponentReference { return { occurrencePath: [id], definition: { ...semanticSource } } }
function addDeclaredFrames(input: AssemblyDocument): AssemblyDocument {
  input.mates.push({ id: 'frames', name: 'Original declared relative frames', type: 'lock', suppressed: true,
    first: component('a'), second: component('b'), relativePose: { ...identityRigidPose(), translation: [10, 0, 0] } },
  { id: 'principal', name: 'Original declared principal planes', type: 'coincident', suppressed: true, alignment: 'aligned',
    first: { kind: 'principal-plane', component: component('a'), plane: 'XY' }, second: { kind: 'principal-plane', component: component('b'), plane: 'XY' } })
  return validateAssemblyDocument(input)
}
function nested(input = semantic()): AssemblyDocument {
  const { version: _version, units: _units, definitions, ...sub } = input
  const root = createEmptyAssembly('Original reused shared scope')
  root.definitions = [...definitions, { ...sub, id: 'shared-sub', revision: 'r1' }]
  root.occurrences = ['sub-a', 'sub-b'].map((id, index) => ({ id, name: id, definition: { id: 'shared-sub', revision: 'r1' },
    pose: { ...identityRigidPose(), translation: [index * 30, 0, 0] as [number, number, number] }, fixed: false, visible: true, suppressed: false }))
  return validateAssemblyDocument(root)
}
const causalErrors = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(causalErrors)] : [error]

it('updates both reused pins with independent native material totals and preserves original v1 endpoints for repair', () => {
  const input = mated(), update = changedPin(input), before = serializeAssemblyDocument(input), sourceBefore = JSON.stringify(update)
  const review = reviewAssemblyPartSourceUpdate(input, pinSource, update, 'r2')
  expect(review.kind).toBe('assembly-source-review'); expect(review.occurrences.map(value => value.occurrenceId)).toEqual(['left', 'right'])
  expect(review.endpoints).toHaveLength(4); expect(review.endpoints.every(value => value.status === 'needs-repair')).toBe(true)
  expect(review.document.occurrences.filter(value => value.id !== 'plate').every(value => value.definition.revision === 'r2')).toBe(true)
  expect(review.document.mates).toEqual(input.mates); expect(part(review.document, pinSource.id)).toEqual(part(input, pinSource.id))
  expect(review.scene.solidCount).toBe(3); near(review.scene.volume, 4800 + 153 * Math.PI / 2); near(review.scene.area, 2960 + 675 * Math.PI / 4)
  expect(serializeAssemblyDocument(input)).toBe(before); expect(JSON.stringify(update)).toBe(sourceBefore)
  for (const [document, expected] of [[part(input, pinSource.id).document, 0], [update, .001]] as const) withNativeOwners(owners => {
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() }); expect(engine.build(document.features).featureErrors).toEqual([])
    const shape = owners.own(engine.copyCurrentBodyShape({ bodyId: 'pin-body', sourceFeatureId: 'bore' }))
    const cube = owners.own(makeBox([2.2, -.05, 5.95], [2.3, .05, 6.05]))
    const intersection = owners.own(bodyBoolean('common', shape, cube)), properties = owners.own(measureShapeVolumeProperties(intersection))
    near(properties.volume, expected, 1e-8)
  })
}, 60_000)

it('repairs to actual updated faces and requires a fresh simultaneous solve before Apply', () => {
  const input = mated(), review = reviewAssemblyPartSourceUpdate(input, pinSource, changedPin(input), 'r2')
  const blocked = prepareAssemblySolve(review.document); expect(blocked.status).toBe('rejected')
  let repaired = review.document
  for (const item of review.endpoints) {
    const id = item.locator.mateId.startsWith('left') ? 'left' : 'right'
    const actual = select(review.scene, id, item.locator.mateId.endsWith('axis') ? cylinder(2.5) : cap(12))
    repaired = repairAssemblyEndpoint(repaired, item.locator, faceReference(actual))
  }
  const preview = prepareAssemblySolve(repaired)
  expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw new Error(preview.message)
  expect(preview.scopes.find(value => value.definition.id === input.id)!.result.localDOF).toBe(2)
  const history = new AssemblyDocumentHistory(repaired), applied = applyAssemblySolvePreview(history, preview), scene = buildAssemblyScene(applied)
  expect(scene.solidCount).toBe(3); near(scene.volume, 4800 + 153 * Math.PI / 2); near(scene.area, 2960 + 675 * Math.PI / 4)
  vector(scene.bounds!.min, [-20, -15, -8]); vector(scene.bounds!.max, [20, 15, 4])
  for (const [id, x] of [['left', -10], ['right', 10]] as const) vector(applied.occurrences.find(value => value.id === id)!.pose.translation, [x, 0, -8])
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('ya se consumió')
}, 60_000)

it('never promotes a v1 geometric key even when unchanged geometry recreates the same exact key', () => {
  const input = mated(), original = part(input, pinSource.id).document
  const review = reviewAssemblyPartSourceUpdate(input, pinSource, original, 'r2')
  expect(review.endpoints.every(item => item.status === 'needs-repair')).toBe(true)
  expect(review.document.mates).toEqual(input.mates)
  expect(review.scene.bodies.flatMap(body => body.faces).some(face => face.selection.face.key === (requireBinaryAssemblyMate(input.mates[0]).first as AssemblyFaceReference).face.key)).toBe(true)
}, 60_000)

it('retains verified semantic identity through a radius edit while actual native geometry changes', () => {
  const input = semantic(), before = serializeAssemblyDocument(input), review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.endpoints.map(item => item.status)).toEqual(['retained-semantic', 'retained-semantic'])
  for (const item of review.endpoints) {
    expect('kind' in item.endpoint && item.endpoint.kind === 'face' && item.endpoint.face.key.startsWith('face-v2|')).toBe(true)
    expect('kind' in item.endpoint && item.endpoint.component?.definition).toEqual(semanticSource)
  }
  expect(requireBinaryAssemblyMate(review.document.mates[0]).first).toMatchObject({ component: { definition: { id: semanticSource.id, revision: 'r2' } } })
  expect(review.scene.solidCount).toBe(2); near(review.scene.volume, 150 * Math.PI); near(review.scene.area, 145 * Math.PI)
  vector(review.scene.bounds!.min, [-2.5, -2.5, 0]); vector(review.scene.bounds!.max, [12.5, 2.5, 12])
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('retains a semantic endcap through a depth edit and solves against its changed actual native support', () => {
  const input = semantic(), originalScene = buildAssemblyScene(input)
  input.mates = [{ id: 'endcap', name: 'Original native endcap to root XY', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { ...faceReference(select(originalScene, 'b', cap(12))), support: 'plane' }, second: { kind: 'principal-plane', component: null, plane: 'XY' } }]
  const oldPreview = prepareAssemblySolve(input)
  expect(oldPreview.status).toBe('ready'); if (oldPreview.status !== 'ready') throw new Error(oldPreview.message)
  const current = applyAssemblySolvePreview(new AssemblyDocumentHistory(input), oldPreview)
  near(current.occurrences.find(value => value.id === 'b')!.pose.translation[2], -12, 1e-6)
  const changed = structuredClone(part(current, semanticSource.id).document), extrusion = changed.features[1]
  if (extrusion.type !== 'extrude') throw new Error('Original extrusion missing')
  extrusion.depth = 16
  const review = reviewAssemblyPartSourceUpdate(current, semanticSource, changed, 'r2')
  expect(review.endpoints.map(value => value.status)).toEqual(['retained-semantic'])
  const actual = select(review.scene, 'b', cap(16))
  if (actual.worldSupport?.kind !== 'plane') throw new Error('Actual changed native endcap expected')
  near(actual.worldSupport.point[2], 4, 1e-6)
  near(review.document.occurrences.find(value => value.id === 'b')!.pose.translation[2], -12, 1e-6)
  const preview = prepareAssemblySolve(review.document)
  expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw new Error(preview.message)
  expect(preview.scopes.find(value => value.definition.id === input.id)!.result.localDOF).toBe(3)
  const applied = applyAssemblySolvePreview(new AssemblyDocumentHistory(review.document), preview), scene = buildAssemblyScene(applied)
  const free = applied.occurrences.find(value => value.id === 'b')!.pose, [tx, ty, tz] = free.translation,
    [qx, qy, qz, qw] = free.rotation
  near(tz, -16, 1e-6)
  // Plane coincidence leaves X/Y translation and axial spin free. These are
  // conditional Cartesian cylinder bounds, not a unique X/Y placement oracle.
  vector([2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)], [0, 0, 1])
  vector(applied.occurrences.find(value => value.id === 'a')!.pose.translation, [0, 0, 0])
  const fixedBody = scene.bodies.find(body => body.component.occurrencePath[0] === 'a')!,
    freeBody = scene.bodies.find(body => body.component.occurrencePath[0] === 'b')!
  vector(fixedBody.bounds.min, [-2, -2, 0]); vector(fixedBody.bounds.max, [2, 2, 16])
  vector(freeBody.bounds.min, [tx - 2, ty - 2, -16]); vector(freeBody.bounds.max, [tx + 2, ty + 2, 0])
  near(scene.volume, 128 * Math.PI); near(scene.area, 144 * Math.PI)
  vector(scene.bounds!.min, [Math.min(-2, tx - 2), Math.min(-2, ty - 2), -16])
  vector(scene.bounds!.max, [Math.max(2, tx + 2), Math.max(2, ty + 2), 16])
}, 60_000)

it('does not treat a well-formed v2 prefix and digest as native correspondence', () => {
  const input = semantic(), first = requireBinaryAssemblyMate(input.mates[0]).first
  if (!('kind' in first) || first.kind !== 'face') throw new Error('Original face missing')
  first.face.key = 'face-v2|' + '0'.repeat(64)
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.endpoints[0].status).toBe('needs-repair'); expect(review.endpoints[0].endpoint).toEqual(first)
  expect(review.endpoints[1].status).toBe('retained-semantic')
}, 60_000)

it('rejects a changed actual semantic entity key instead of matching equal surface geometry', () => {
  const input = semantic(), changed = changedSemantic(input), sketch = changed.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'entities') throw new Error('Original entity sketch missing')
  sketch.profile.entities[0].id = 'fresh-circle'
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2'), original = requireBinaryAssemblyMate(input.mates[0]).first as AssemblyFaceReference
  expect(review.endpoints.every(item => item.status === 'needs-repair')).toBe(true)
  expect(review.scene.bodies.flatMap(body => body.faces).some(face => face.selection.face.key === original.face.key)).toBe(false)
  expect(review.scene.bodies.flatMap(body => body.faces).some(face => face.selection.face.key.startsWith('face-v2|'))).toBe(true)
}, 60_000)

it('rejects a discrete generating-direction change even though cylindrical support kind survives', () => {
  const input = semantic(), changed = changedSemantic(input), extrusion = changed.features[1]
  if (extrusion.type !== 'extrude') throw new Error('Original extrusion missing')
  extrusion.depth = -12
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2')
  expect(review.endpoints.every(item => item.status === 'needs-repair')).toBe(true)
  vector(review.scene.bounds!.min, [-2.5, -2.5, -12]); vector(review.scene.bounds!.max, [12.5, 2.5, 0])
}, 60_000)

it('keeps a lost native face stale instead of giving an empty replacement a reference', () => {
  const input = semantic(), changed = changedSemantic(input); changed.features = []
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2')
  expect(review.scene.bodies).toEqual([]); expect(review.endpoints.every(item => item.status === 'needs-repair')).toBe(true)
  expect(review.document.mates).toEqual(input.mates)
}, 60_000)

it('checks actual old native support instead of trusting a semantic-looking saved key', () => {
  const input = semantic(), first = requireBinaryAssemblyMate(input.mates[0]).first
  if (!('kind' in first) || first.kind !== 'face') throw new Error('Original face missing')
  first.support = 'plane' // Repairable angle endpoint whose actual surface is cylindrical.
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.endpoints.find(item => item.locator.side === 'first')!.status).toBe('needs-repair')
  expect(review.endpoints.find(item => item.locator.side === 'second')!.status).toBe('retained-semantic')
}, 60_000)

it('includes an already broken exact-component body declaration only as manual repair', () => {
  const input = semantic(), first = requireBinaryAssemblyMate(input.mates[0]).first
  if (!('kind' in first) || first.kind !== 'face') throw new Error('Original face missing')
  first.body = { bodyId: 'missing-body', sourceFeatureId: 'prism' }
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.endpoints).toHaveLength(2); expect(review.endpoints[0].status).toBe('needs-repair')
  expect(review.endpoints[0].endpoint).toEqual(first)
}, 60_000)

it('requires consistent native semantic catalogs in every expansion of a reused nested scope', () => {
  const input = nested(), review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.occurrences).toHaveLength(2); expect(review.endpoints).toHaveLength(2)
  expect(review.endpoints.every(item => item.status === 'retained-semantic')).toBe(true)
  expect(review.endpoints.every(item => item.locator.scope.id === 'shared-sub')).toBe(true)
  expect(review.scene.bodies.map(body => body.component.occurrencePath)).toEqual([['sub-a', 'a'], ['sub-a', 'b'], ['sub-b', 'a'], ['sub-b', 'b']])
  near(review.scene.volume, 300 * Math.PI); expect(review.scene.prototypeCount).toBe(1)
}, 60_000)

it('does not automap shared faces when one actual occurrence expansion is suppressed', () => {
  const input = nested(addDeclaredFrames(semantic())); input.occurrences[1].suppressed = true
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.scene.bodies).toHaveLength(2)
  expect(review.endpoints.filter(item => item.locator.mateId === 'axes').every(item => item.status === 'needs-repair')).toBe(true)
  expect(review.endpoints.filter(item => item.locator.mateId !== 'axes').every(item => item.status === 'retained-component')).toBe(true)
}, 60_000)

it('retains only declared component/principal identities in a dormant shared scope, without native authority', () => {
  const input = nested(addDeclaredFrames(semantic())); input.occurrences = []
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.scene.bodies).toEqual([]); expect(review.occurrences).toHaveLength(2); expect(review.endpoints).toHaveLength(6)
  expect(review.endpoints.filter(item => item.locator.mateId === 'axes').every(item => item.status === 'needs-repair')).toBe(true)
  expect(review.endpoints.filter(item => item.locator.mateId !== 'axes').every(item => item.status === 'retained-component')).toBe(true)
  const sub = review.document.definitions.find(value => value.id === 'shared-sub')!
  if (sub.kind !== 'assembly') throw new Error('Shared declaration missing')
  expect(sub.occurrences.every(value => value.definition.revision === 'r2')).toBe(true)
  expect(review.endpoints.every(item => item.message.length > 0)).toBe(true)
}, 60_000)

it('retains suppressed component and principal identities while preserving poses and saved lock data', () => {
  const input = addDeclaredFrames(semantic()); input.occurrences.forEach(value => value.suppressed = true)
  const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')
  expect(review.scene.bodies).toEqual([])
  expect(review.document.occurrences.map(value => value.pose)).toEqual(input.occurrences.map(value => value.pose))
  expect(review.endpoints.filter(item => item.locator.mateId !== 'axes').map(item => item.status)).toEqual(Array(4).fill('retained-component'))
  const oldLock = input.mates.find(value => value.type === 'lock')!, newLock = review.document.mates.find(value => value.type === 'lock')!
  if (oldLock.type !== 'lock' || newLock.type !== 'lock') throw new Error('Original lock missing')
  expect(newLock.relativePose).toEqual(oldLock.relativePose)
}, 60_000)

it('preserves query and native cleanup causes while withholding the entire source review', () => {
  const input = semantic(), changed = changedSemantic(input), before = serializeAssemblyDocument(input), original = placements.placeAssemblyShapeChecked
  const primary = new Error('Original source-review mesh fault'), cleanup = new Error('Original source-review release fault')
  let calls = 0, releases = 0
  const spy = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((...args) => {
    const placed = original(...args), shape = placed.shape
    if (++calls === 3) {
      const mesh = shape.mesh.bind(shape), remove = shape.delete.bind(shape)
      vi.spyOn(shape, 'mesh').mockImplementation(options => { mesh(options); throw primary })
      vi.spyOn(shape, 'delete').mockImplementation(() => { releases++; remove(); throw cleanup })
    }
    return placed
  })
  try {
    let failure: unknown
    try { reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2') } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(NativeCleanupError); expect(causalErrors(failure)).toContain(primary); expect(causalErrors(failure)).toContain(cleanup)
    expect(releases).toBe(1); expect(calls).toBe(3); expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { spy.mockRestore() }
  expect(reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2').scene.solidCount).toBe(2)
}, 60_000)

it('withholds a review if an actual reused source engine epoch is revoked between occurrence copies', () => {
  const input = semantic(), original = CadEngine.prototype.placeCurrentAssemblyBody; let copies = 0
  const spy = vi.spyOn(CadEngine.prototype, 'placeCurrentAssemblyBody').mockImplementation(function(this: CadEngine, ...args) {
    const placed = original.apply(this, args)
    if (++copies === 1) this.dispose()
    return placed // The owned first placement survives; the next prototype query must fail.
  })
  try { expect(() => reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2')).toThrow('reconstrucción completa') }
  finally { spy.mockRestore() }
  expect(copies).toBe(1)
}, 60_000)

it('provides detached numeric review data that cannot forge single-use Apply authority', () => {
  const input = semantic(), review = reviewAssemblyPartSourceUpdate(input, semanticSource, changedSemantic(input), 'r2'), before = serializeAssemblyDocument(input)
  expect('token' in review).toBe(false); expect(() => structuredClone(review)).not.toThrow()
  expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(input), review as unknown as AssemblySolvePreview)).toThrow('no fue verificada')
  review.document.occurrences[0].pose.translation[0] = 99
  review.endpoints[0].locator.mateId = 'caller-mutated-report'; review.scene.bodies[0].component.occurrencePath[0] = 'caller-mutated-scene'
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('isolates the review snapshot from caller source mutation during a real native build', () => {
  const input = semantic(), changed = changedSemantic(input), original = CadEngine.prototype.build; let calls = 0
  const spy = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function(this: CadEngine, features) {
    const result = original.call(this, features)
    if (++calls === 1) { input.occurrences[0].pose.translation[0] = 100; changed.name = 'Caller changed after capture' }
    return result
  })
  try {
    const review = reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2')
    expect(review.document.occurrences[0].pose.translation[0]).toBe(0)
    expect(review.document.definitions.find(value => value.id === semanticSource.id && value.revision === 'r2')).toMatchObject({ document: { name: 'Original finite entity disk' } })
    expect('token' in review).toBe(false)
  } finally { spy.mockRestore() }
}, 60_000)

it('does not return partial geometry when the replacement has a real failed downstream cut', () => {
  const input = semantic(), changed = changedSemantic(input), before = serializeAssemblyDocument(input)
  changed.features.push({ id: 'remote-profile', name: 'Original rejected remote cut profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'remote-cut', name: 'Original rejected remote cut', type: 'cut', sketchId: 'remote-profile', depth: 12, symmetric: false, suppressed: false })
  expect(() => reviewAssemblyPartSourceUpdate(input, semanticSource, changed, 'r2')).toThrow('No se pudo reconstruir')
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)
