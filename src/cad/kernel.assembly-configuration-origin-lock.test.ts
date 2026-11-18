import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, parseAssemblyConfiguredDocument, assemblyConfiguredGeometryInput } from '../model/assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import type { AssemblyPrincipalAxisReference, EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { AssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'
import { identityRigidPose } from '../model/rigidPose'
import { ConfiguredAssemblyWorkerSession } from './kernel.assembly-configuration-session'
import { buildConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'

const require = createRequire(import.meta.url)
// Tracked original 2×3×4 prisms, no imported geometry. Rz30 exposes roll in
// asymmetric material bounds; a circular cylinder would not prove rotation.
const original = require('../../scripts/desktop-assembly-origin-axes-original.cjs') as (configured: boolean) => unknown
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000)
const near = (actual: readonly number[], expected: readonly number[], tolerance = 1e-8) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(tolerance))
}
function fixture(shared = false, depth = 0) {
  const document = validateAssemblyConfiguredDocument(original(true))
  document.source.occurrences[1].pose = { translation: [0, 0, 6], rotation: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] }
  if (!shared) return { document, generation: 20, scopePath: [] as string[] }
  const source = document.source, scope: EmbeddedAssemblyDefinition = { kind: 'assembly', id: source.id, revision: source.revision, name: source.name,
    createdAt: source.createdAt, updatedAt: source.updatedAt, occurrences: source.occurrences, mates: [] }
  source.definitions.push(scope)
  let child = { id: scope.id, revision: scope.revision }
  const scopePath = ['left']
  for (let index = 0; index < depth; index++) {
    const id = `origin-wrapper-${index}`, occurrenceId = `nested-${index}`
    source.definitions.push({ kind: 'assembly', id, revision: 'r1', name: 'Original wrapper', createdAt: source.createdAt, updatedAt: source.updatedAt,
      occurrences: [{ id: occurrenceId, name: 'Nested original', definition: child, pose: identityRigidPose(), fixed: true, suppressed: false, visible: true }], mates: [] })
    document.catalog.push({ definition: { id, revision: 'r1' }, configurations: [{ id: 'demo', name: 'Original wrapper state', occurrences: [{ occurrenceId, configuration: 'demo' }], mates: [] }] })
    child = { id, revision: 'r1' }; scopePath.splice(1, 0, occurrenceId)
  }
  source.id = 'origin-outer-root'
  source.occurrences = ['left', 'right'].map((id, index) => ({ id, name: id, definition: child, fixed: true, suppressed: false, visible: true,
    pose: { translation: [index * 30, 0, 0], rotation: index ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : [0, 0, 0, 1] } }))
  document.catalog.push({ definition: { id: source.id, revision: source.revision }, configurations: [{ id: 'demo', name: 'Shared original', occurrences: source.occurrences.map(o => ({ occurrenceId: o.id, configuration: 'demo' })), mates: [] }] })
  return { document: validateAssemblyConfiguredDocument(document), generation: 20, scopePath }
}
function context(current: ReturnType<typeof fixture>) { return { document: current.document, generation: current.generation } }
function axis(path: string[] | null): AssemblyPrincipalAxisReference {
  return { kind: 'principal-axis', axis: 'Z', component: path === null ? null : { occurrencePath: path, definition: { id: 'origin-axis-prism', revision: 'r1' } } }
}
function intent(current: ReturnType<typeof fixture>, replace = false): AssemblyConfiguredMechanicalEdit {
  const spec = { id: 'original-origin-lock', name: 'Original origin lock', type: 'concentric' as const, suppressed: false, first: axis(['moving']), second: axis(null), alignment: 'aligned' as const }
  return { scopePath: current.scopePath, definition: { id: 'original-origin-axes', revision: 'r1' }, configuration: 'demo',
    change: replace ? { kind: 'replace', mateId: spec.id, capture: 'recapture', spec } : { kind: 'add', spec } }
}
function effective(document: ReturnType<typeof fixture>['document'], path: string[]) {
  return evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration).scopes.find(scope => JSON.stringify(scope.path) === JSON.stringify(path))!
}
function assertLock(document: ReturnType<typeof fixture>['document'], path: string[]) {
  const mate = effective(document, path).mates.find(m => m.id === 'original-origin-lock')!
  expect(mate.type).toBe('concentric')
  if (mate.type !== 'concentric' || !mate.rotationLock) throw Error('Captured original rotation required')
  const sign = mate.rotationLock[3] < 0 ? -1 : 1
  near(mate.rotationLock.map(value => sign * value), [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
  expect(mate.first).toEqual(axis(['moving'])); expect(mate.second).toEqual(axis(null))
  return mate
}

it('captures root/component Rz30, measures asymmetric material, consumes authority and round trips the exact lock', () => {
  const current = fixture(), before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession()
  const preview = session.previewMechanicalEdit(context(current), intent(current))
  expect(preview.verification.accepted).toBe(true)
  assertLock(preview.document, [])
  expect(Math.abs(preview.scene.scene.volume - 48)).toBeLessThanOrEqual(1e-6)
  expect(Math.abs(preview.scene.scene.area - 104)).toBeLessThanOrEqual(1e-6)
  expect(preview.scene.scene.solidCount).toBe(2)
  const body = preview.scene.scene.bodies.find(b => b.component.occurrencePath[0] === 'moving')!
  near(body.bounds.min, [-1.5, 0, 6], 1e-6)
  near(body.bounds.max, [Math.sqrt(3), 1 + 3 * Math.sqrt(3) / 2, 10], 1e-6)
  const applied = session.apply(context(current), preview.token)
  assertLock(parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(applied.document)), [])
  expect(() => session.apply(context(current), preview.token)).toThrow(/unknown|consumed/)
  expect(applied.document.catalog[0].configurations.find(c => c.id === 'untouched')).toEqual(before.document.catalog[0].configurations.find(c => c.id === 'untouched'))
  expect(current).toEqual(before)
}, 60_000)

it.each([0, 4])('captures shared local scope against its static frame through %s wrappers and independent proper parent gauges', depth => {
  const current = fixture(true, depth), before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession()
  const preview = session.previewMechanicalEdit(context(current), intent(current))
  expect(preview.verification.accepted).toBe(true)
  expect(preview.verification.reports).toHaveLength(2)
  const applied = session.apply(context(current), preview.token)
  const left = assertLock(applied.document, current.scopePath)
  const right = assertLock(applied.document, ['right', ...current.scopePath.slice(1)])
  expect(left).toEqual(right)
  expect(Math.abs(preview.scene.scene.volume - 96)).toBeLessThanOrEqual(1e-6)
  expect(Math.abs(preview.scene.scene.area - 208)).toBeLessThanOrEqual(1e-6)
  expect(preview.scene.scene.solidCount).toBe(4)
  expect(current).toEqual(before)
}, 60_000)

it('recaptures an existing free relation with unchanged identity and rejects forged retain intent', () => {
  const current = fixture(), authored = intent(current, true)
  if (authored.change.spec.type !== 'concentric') throw Error('Original concentric intent required')
  current.document.catalog[0].configurations[0].mateDeclarations = [{ ...authored.change.spec, rotationLock: null }]
  const before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession()
  expect(() => session.previewMechanicalEdit(context(current), { ...authored, change: { kind: 'replace', mateId: authored.change.spec.id, capture: 'retain', spec: authored.change.spec } })).toThrow(/no rotation lock/)
  const preview = session.previewMechanicalEdit(context(current), authored)
  assertLock(preview.document, [])
  session.discard(preview.token)
  expect(() => session.apply(context(current), preview.token)).toThrow(/unknown|consumed/)
  expect(current).toEqual(before)
}, 60_000)

it('rejects different descendant paths belonging to the same local rigid owner', () => {
  const current = fixture(true), session = new ConfiguredAssemblyWorkerSession(), spec = intent(current).change.spec
  if (spec.type !== 'concentric') throw Error('Original concentric intent required')
  const bad: AssemblyConfiguredMechanicalEdit = { scopePath: [], definition: { id: current.document.source.id, revision: 'r1' }, configuration: 'demo', change: { kind: 'add', spec: {
    ...spec, first: axis(['left', 'moving']), second: { kind: 'principal-axis', axis: 'Z', component: { occurrencePath: ['left'], definition: { id: 'original-origin-axes', revision: 'r1' } } },
  } } }
  expect(() => session.previewMechanicalEdit(context(current), bad)).toThrow(/distinct local rigid owners/)
  expect(() => session.apply(context(current), 'not-published')).toThrow(/unknown|consumed/)
}, 60_000)

it.each(['generation', 'state', 'pose', 'revision'] as const)('invalidates the origin capability after a %s change and ignores edits to the candidate DTO', change => {
  const current = fixture(), session = new ConfiguredAssemblyWorkerSession()
  const stale = session.previewMechanicalEdit(context(current), intent(current))
  const changed = structuredClone(context(current))
  if (change === 'generation') changed.generation++
  if (change === 'state') changed.document.rootConfiguration = 'untouched'
  if (change === 'pose') changed.document.source.occurrences[1].pose.translation[2]++
  if (change === 'revision') {
    changed.document.source.revision = 'r2'
    changed.document.catalog[0].definition.revision = 'r2'
  }
  expect(() => session.apply(changed, stale.token)).toThrow()
  expect(() => session.apply(context(current), stale.token)).toThrow(/unknown|consumed/)
  const preview = session.previewMechanicalEdit(context(current), intent(current)), expected = structuredClone(preview.document)
  const row = preview.document.catalog[0].configurations[0].mateDeclarations![0]
  if (row.type === 'concentric') row.rotationLock = [0, 0, 0, 1]
  expect(session.apply(context(current), preview.token).document).toEqual(expected)
}, 60_000)

it('fails closed when the requested angular band cannot retain original-chain capture precision', () => {
  const current = fixture(true, 4), session = new ConfiguredAssemblyWorkerSession(), before = structuredClone(current)
  expect(() => session.previewMechanicalEdit(context(current), intent(current), { angleToleranceRad: 1e-15 })).toThrow(/precision|tolerance|round|uncertainty/i)
  expect(current).toEqual(before)
  expect(() => session.apply(context(current), 'not-published')).toThrow(/unknown|consumed/)
}, 60_000)

it.each([false, true])('captures ordered mixed material/origin endpoints with reverse order %s', reverse => {
  const current = fixture(), source = current.document.source, cylinder = structuredClone(source.definitions[0])
  if (cylinder.kind !== 'part') throw Error('Original part required')
  cylinder.id = 'original-origin-cylinder'; cylinder.document.id = cylinder.id
  const profile = cylinder.document.features[0]
  if (profile.type !== 'sketch') throw Error('Original sketch required')
  profile.profile = { kind: 'circle', center: [0, 0], radius: 2 }
  source.definitions.push(cylinder)
  source.occurrences[0].definition = { id: cylinder.id, revision: cylinder.revision }
  source.occurrences[0].pose = identityRigidPose()
  const scene = buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(current.document, current.generation))
  const face = scene.scene.bodies.find(body => body.component.occurrencePath[0] === 'ground')!.faces.find(face => face.support?.kind === 'cylinder')!
  expect(face.support?.kind).toBe('cylinder')
  if (face.support?.kind !== 'cylinder') throw Error('Actual current cylinder required')
  near(face.support.axis, [0, 0, -1])
  const material = { kind: 'face' as const, component: { occurrencePath: [...face.selection.component.occurrencePath], definition: { ...face.selection.component.definition } },
    body: face.selection.body ? { ...face.selection.body } : null, face: { ...face.selection.face }, support: 'axis' as const }
  const authored = intent(current)
  if (authored.change.spec.type !== 'concentric') throw Error('Original concentric required')
  authored.change.spec.first = reverse ? material : axis(['moving'])
  authored.change.spec.second = reverse ? axis(['moving']) : material
  authored.change.spec.alignment = 'opposed'
  const session = new ConfiguredAssemblyWorkerSession(), preview = session.previewMechanicalEdit(context(current), authored)
  expect(preview.verification.accepted).toBe(true)
  const mate = effective(preview.document, []).mates[0]
  if (mate.type !== 'concentric' || !mate.rotationLock) throw Error('Current mixed capture required')
  near(mate.rotationLock.map(value => value * (mate.rotationLock![3] < 0 ? -1 : 1)), [0, 0, (reverse ? 1 : -1) * Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
  expect(Math.abs(preview.scene.scene.volume - (24 + 16 * Math.PI))).toBeLessThanOrEqual(1e-6)
  expect(Math.abs(preview.scene.scene.area - (52 + 24 * Math.PI))).toBeLessThanOrEqual(1e-6)
  expect(preview.scene.scene.solidCount).toBe(2)
  session.discard(preview.token)
}, 60_000)

it('captures distinct internal components sharing one global ancestor and retains axial freedom after spin disturbance', () => {
  const current = fixture(true), scope = current.document.source.definitions.find(definition => definition.id === 'original-origin-axes')
  if (scope?.kind !== 'assembly') throw Error('Original shared scope required')
  scope.occurrences[0].pose = identityRigidPose()
  const authored = intent(current)
  if (authored.change.spec.type !== 'concentric') throw Error('Original concentric required')
  authored.change.spec.second = axis(['ground'])
  const session = new ConfiguredAssemblyWorkerSession(), preview = session.previewMechanicalEdit(context(current), authored)
  expect(preview.verification.accepted).toBe(true)
  const applied = session.apply(context(current), preview.token)
  const configuration = applied.document.catalog.find(entry => entry.definition.id === 'original-origin-axes')!.configurations.find(state => state.id === 'demo')!
  const mate = configuration.mateDeclarations![0]
  if (mate.type !== 'concentric' || !mate.rotationLock) throw Error('Current capture required')
  near(mate.rotationLock, [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
  const moving = configuration.occurrences.find(occurrence => occurrence.occurrenceId === 'moving')
  const pose = { translation: [0, 0, 9] as [number, number, number], rotation: [0, 0, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)] as [number, number, number, number] }
  if (moving) moving.pose = pose
  else configuration.occurrences.push({ occurrenceId: 'moving', pose })
  const changed = { document: applied.document, generation: applied.generation }
  const restored = session.preview(changed)
  expect(restored.verification.accepted).toBe(true)
  const body = restored.scene.scene.bodies.find(body => body.component.occurrencePath.join('/') === 'left/moving')!
  near(body.worldPose.rotation, [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
  near(body.bounds.min, [-1.5, 0, 9], 1e-6)
  near(body.bounds.max, [Math.sqrt(3), 1 + 3 * Math.sqrt(3) / 2, 13], 1e-6)
  session.discard(restored.token)
}, 60_000)
