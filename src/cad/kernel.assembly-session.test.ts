import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference, type AssemblyMate, type AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyInterferenceScope } from '../model/assemblyInterference'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose, transformRigidDirection } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblySceneFace } from './kernel.assembly-types'
import * as sceneModule from './kernel.assembly-scene'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
function mated(base = createAssemblyExample()): AssemblyDocument {
  const input = validateAssemblyDocument(base), scene = sceneModule.buildAssemblyScene(input)
  const faces = (id: string) => scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces
  const cylinder = (id: string, radius: number, x: number) => faces(id).find(face => face.support?.kind === 'cylinder'
    && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9)!
  const cap = (id: string, z: number) => faces(id).find(face => face.support?.kind === 'plane' && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99)!
  const axis = (face: AssemblySceneFace) => assemblySceneFaceReference(face)! as AssemblyFaceReference & { support: 'axis' }
  const plane = (face: AssemblySceneFace) => assemblySceneFaceReference(face)! as AssemblyFaceReference & { support: 'plane' }
  const mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = cylinder(id, 2, 0), hole = cylinder('plate', 3, x)
    if (pin.support?.kind !== 'cylinder' || hole.support?.kind !== 'cylinder') throw new Error('Expected real native cylinders')
    mates.push({ id: id + '-axis', name: id + ' axis', type: 'concentric', suppressed: false, rotationLock: null,
      alignment: pin.support.axis[2] * hole.support.axis[2] > 0 ? 'aligned' : 'opposed', first: axis(pin), second: axis(hole) },
    { id: id + '-cap', name: id + ' cap', type: 'coincident', suppressed: false, alignment: 'aligned', first: plane(cap(id, 12)), second: plane(cap('plate', 4)) })
  }
  input.mates = mates; return validateAssemblyDocument(input)
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function dof(value: Extract<AssemblyPreviewReply, { status: 'ready' }>) { return value.scopes.at(-1)!.result.localDOF }

it('moves an actual mated pin with a temporary anchor, preserves declarations and consumes authentic Apply', () => {
  const session = new AssemblyWorkerSession(), initial = mated(), solved = session.apply(initial, ready(session.prepare(initial)).token).document
  const before = serializeAssemblyDocument(solved), older = ready(session.prepare(solved)), occurrence = solved.occurrences.find(value => value.id === 'right')!
  const pose = { translation: [10, 0, -8] as [number, number, number], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] }
  const moved = session.handle({ id: 94, action: 'move-assembly-component', current: solved,
    move: { component: { occurrencePath: ['right'], definition: occurrence.definition }, pose } })
  if (!moved || moved.kind !== 'assembly-preview') throw new Error('Expected actual native movement preview')
  const preview = ready(moved)
  expect(preview.movement?.temporaryAnchor).toBe(true); expect(preview.movement?.targetPose).toEqual(pose)
  expect(preview.document.mates).toEqual(solved.mates); expect(preview.document.definitions).toEqual(solved.definitions)
  expect(preview.document.occurrences.map(value => value.fixed)).toEqual(solved.occurrences.map(value => value.fixed))
  expect(preview.scene.volume).toBeCloseTo(4800 + 45 * Math.PI / 2, 5)
  expect(serializeAssemblyDocument(solved)).toBe(before); expect(() => session.apply(solved, older.token)).toThrow(/disponible/)
  // A mutable RPC response cannot replace the privately authenticated target.
  preview.document.occurrences.find(value => value.id === 'right')!.pose.translation[0] = 999
  const applied = session.apply(solved, preview.token), right = applied.document.occurrences.find(value => value.id === 'right')!
  right.pose.translation.forEach((value, axis) => expect(Math.abs(value - pose.translation[axis])).toBeLessThan(1e-6)); expect(right.fixed).toBe(false)
  expect(applied.document.mates).toEqual(solved.mates); expect(applied.document.definitions).toEqual(solved.definitions)
  expect('movement' in applied.document).toBe(false); expect(() => session.apply(solved, preview.token)).toThrow(/disponible/)
}, 60_000)

it('rejects a prohibited lateral movement without publishing a token or changing the committed base', () => {
  const session = new AssemblyWorkerSession(), initial = mated(), solved = session.apply(initial, ready(session.prepare(initial)).token).document
  const before = serializeAssemblyDocument(solved), older = ready(session.prepare(solved)), occurrence = solved.occurrences.find(value => value.id === 'right')!
  const pose = structuredClone(occurrence.pose); pose.translation[0] = 11
  const moved = session.move(solved, { component: { occurrencePath: ['right'], definition: occurrence.definition }, pose })
  expect(moved.status).toBe('rejected'); expect('token' in moved).toBe(false)
  expect(serializeAssemblyDocument(solved)).toBe(before); expect(() => session.apply(solved, older.token)).toThrow(/disponible/)
}, 60_000)

it('publishes only the latest authentic world movement and ignores a delayed older discard', () => {
  const session = new AssemblyWorkerSession(), initial = mated(), solved = session.apply(initial, ready(session.prepare(initial)).token).document
  const before = serializeAssemblyDocument(solved), occurrence = solved.occurrences.find(value => value.id === 'right')!
  const move = { component: { occurrencePath: ['right'], definition: occurrence.definition }, pose: {
    translation: [10, 0, -8] as [number, number, number], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] } }
  const first = ready(session.moveWorld(solved, move)), value = session.handle({ id: 95, action: 'move-assembly-world-component', current: solved, move })
  if (!value || value.kind !== 'assembly-preview') throw new Error('Expected a native world movement preview')
  const latest = ready(value)
  expect(latest.movement?.frame).toBe('world'); expect(latest.movement?.drivenComponent).toEqual(move.component)
  expect(latest.scene.volume).toBeCloseTo(4800 + 45 * Math.PI / 2, 5)
  session.discard(first.token)
  const applied = session.apply(solved, latest.token)
  expect(serializeAssemblyDocument(solved)).toBe(before)
  expect(applied.document.mates).toEqual(solved.mates); expect(applied.document.occurrences.map(value => value.fixed)).toEqual(solved.occurrences.map(value => value.fixed))
  expect(applied.document.occurrences.find(value => value.id === 'right')!.pose.rotation[2]).toBeCloseTo(Math.SQRT1_2, 8)
  expect(() => session.apply(solved, latest.token)).toThrow(/disponible/)
}, 60_000)

it('authenticates a projected native slider and commits only its privately verified pose', () => {
  const session = new AssemblyWorkerSession(), initial = mated(), base = session.apply(initial, ready(session.prepare(initial)).token).document
  base.mates = base.mates.filter(value => value.id !== 'right-cap')
  const before = serializeAssemblyDocument(base), right = base.occurrences.find(value => value.id === 'right')!, target = structuredClone(right.pose)
  target.translation[0] += 1; target.translation[2] += 2
  const value = session.handle({ id: 96, action: 'project-assembly-component', current: base,
    drag: { component: { occurrencePath: ['right'], definition: right.definition }, pose: target, mode: 'translate' } })
  if (!value || value.kind !== 'assembly-preview') throw new Error('Expected real native projected movement')
  const preview = ready(value)
  expect(preview.movement).toBeUndefined(); expect(preview.projection?.temporaryAnchor).toBe(false)
  expect(preview.projection?.positionResidual).toBeCloseTo(1, 5)
  expect(preview.checks.every(value => value.satisfied)).toBe(true); expect(preview.scopes.every(value => !value.temporaryAnchor)).toBe(true)
  expect(preview.scene.volume).toBeCloseTo(4800 + 45 * Math.PI / 2, 5)
  preview.document.occurrences.find(value => value.id === 'right')!.pose.translation[0] = 999
  const applied = session.apply(base, preview.token), moved = applied.document.occurrences.find(value => value.id === 'right')!
  expect(moved.pose.translation[0]).toBeCloseTo(10, 5); expect(moved.pose.translation[2]).toBeCloseTo(-6, 5)
  expect(serializeAssemblyDocument(base)).toBe(before); expect(applied.document.mates).toEqual(base.mates)
  expect('projection' in applied.document).toBe(false); expect(() => session.apply(base, preview.token)).toThrow(/disponible/)
}, 60_000)

it('inspects actual committed assembly clearances read-only while revoking an older Apply capability', () => {
  const session = new AssemblyWorkerSession(), base = mated()
  for (const occurrence of base.occurrences) if (occurrence.id !== 'plate') occurrence.pose = {
    translation: [occurrence.id === 'left' ? -10 : 10, 0, -8], rotation: [0, 0, 0, 1] }
  const before = serializeAssemblyDocument(base), older = ready(session.prepare(base))
  const value = session.handle({ id: 92, action: 'inspect-assembly-interferences', current: base, options: { clearance: 1 } })
  if (!value || value.kind !== 'assembly-interference-report') throw new Error('Expected actual native analysis')
  expect(value.bodyCount).toBe(3); expect(value.potentialPairCount).toBe(3)
  expect(value.scopeSummary).toEqual({ mode: 'all', selectedLeafCount: 0, excludedLeafCount: 0, eligibleLeafCount: 3, eligiblePairCount: 3 })
  expect(value.testedPairCount).toBe(2); expect(value.broadPhaseExcludedCount).toBe(1); expect(value.pairs).toHaveLength(2)
  expect(value.pairs.every(pair => pair.status === 'clearance' && Math.abs(pair.minimumDistance - 1) < 1e-6 && pair.intersectionVolume === 0)).toBe(true)
  expect('token' in value).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  expect(() => session.apply(base, older.token)).toThrow(/disponible/)
}, 60_000)

it('routes selected and cross-group native analysis over reused nested occurrences with exact exclusions', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), originalPin = base.occurrences[1]
  const sub = { id: 'original-analysis-subassembly', revision: 'r1' }
  base.definitions.push({ ...sub, kind: 'assembly', name: 'Original shared analysis carrier',
    occurrences: [{ ...structuredClone(originalPin), id: 'child', name: 'Original shared child', fixed: false, pose: identityRigidPose() }],
    mates: [], createdAt: base.createdAt, updatedAt: base.updatedAt })
  base.occurrences = [base.occurrences[0], ...(['left', 'right'] as const).map(id => ({
    ...structuredClone(originalPin), id, definition: sub,
    pose: { ...identityRigidPose(), translation: [id === 'left' ? -10 : 10, 0, -8] as [number, number, number] },
  }))]
  const before = serializeAssemblyDocument(base), older = ready(session.prepare(base))
  const selected: AssemblyComponentReference[] = ['left', 'right'].map(id => ({ occurrencePath: [id], definition: { ...sub } }))
  const inspect = (mode: AssemblyInterferenceScope['mode'], excluded: AssemblyComponentReference[] = []) => {
    const options = { clearance: 1, scope: { mode, selected, excluded } }, optionsBefore = structuredClone(options)
    const value = session.handle({ id: 97, action: 'inspect-assembly-interferences', current: base, options })
    if (!value || value.kind !== 'assembly-interference-report') throw new Error('Expected actual scoped native analysis')
    expect(options).toEqual(optionsBefore); expect(serializeAssemblyDocument(base)).toBe(before); expect('token' in value).toBe(false)
    return value
  }
  const among = inspect('among-selected')
  expect(among.scopeSummary).toEqual({ mode: 'among-selected', selectedLeafCount: 2, excludedLeafCount: 0, eligibleLeafCount: 2, eligiblePairCount: 1 })
  expect(among.bodyCount).toBe(2); expect(among.componentCount).toBe(2); expect(among.potentialPairCount).toBe(1)
  expect(among.testedPairCount).toBe(0); expect(among.broadPhaseExcludedCount).toBe(1); expect(among.pairs).toEqual([])
  expect(() => session.apply(base, older.token)).toThrow(/disponible/)
  const cross = inspect('selected-against-rest')
  expect(cross.scopeSummary).toEqual({ mode: 'selected-against-rest', selectedLeafCount: 2, excludedLeafCount: 0, eligibleLeafCount: 3, eligiblePairCount: 2 })
  expect(cross.potentialPairCount).toBe(2); expect(cross.testedPairCount).toBe(2); expect(cross.broadPhaseExcludedCount).toBe(0)
  expect(cross.pairs).toHaveLength(2)
  for (const pair of cross.pairs) {
    expect(pair.status).toBe('clearance'); expect(pair.minimumDistance).toBeCloseTo(1, 6)
    const paths = [pair.first.component.occurrencePath, pair.second.component.occurrencePath]
    expect(paths).toContainEqual(['plate']); expect(paths.some(path => path.length === 2 && path[1] === 'child')).toBe(true)
  }
  const excluded = inspect('selected-against-rest', [{ occurrencePath: ['left', 'child'], definition: { ...originalPin.definition } }])
  expect(excluded.scopeSummary).toEqual({ mode: 'selected-against-rest', selectedLeafCount: 2, excludedLeafCount: 1, eligibleLeafCount: 2, eligiblePairCount: 1 })
  expect(excluded.bodyCount).toBe(2); expect(excluded.potentialPairCount).toBe(1); expect(excluded.testedPairCount).toBe(1)
  expect(excluded.pairs).toHaveLength(1)
  expect([excluded.pairs[0].first.component.occurrencePath, excluded.pairs[0].second.component.occurrencePath].sort()).toEqual([['plate'], ['right', 'child']])
  expect(excluded.pairs[0].minimumDistance).toBeCloseTo(1, 6)
}, 60_000)

it.each(['clearance', 'scope revision'] as const)('keeps committed data unchanged and revokes old Apply when interference %s rejects', cause => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), before = serializeAssemblyDocument(base), older = ready(session.prepare(base))
  const options = cause === 'clearance' ? { clearance: -1 } : { scope: { mode: 'among-selected' as const,
    selected: [{ occurrencePath: ['plate'], definition: { ...base.occurrences[0].definition, revision: 'obsolete' } }], excluded: [] } }
  expect(() => session.handle({ id: 93, action: 'inspect-assembly-interferences', current: base, options })).toThrow()
  expect(serializeAssemblyDocument(base)).toBe(before); expect(() => session.apply(base, older.token)).toThrow(/disponible/)
}, 60_000)

it('reviews both reused part occurrences without committing or retaining an older Apply capability', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), before = serializeAssemblyDocument(base)
  const preview = ready(session.prepare(base)), definition = base.definitions.find(value => value.id === 'example-pin')!
  if (definition.kind !== 'part') throw new Error('Expected the original shared pin source')
  const part = structuredClone(definition.document), profile = part.features[0]
  if (profile.type !== 'sketch' || profile.profile.kind !== 'circle') throw new Error('Expected the original pin circle')
  profile.profile.radius = 2.5
  const result = session.handle({ id: 90, action: 'review-assembly-part-update', current: base,
    source: { id: definition.id, revision: definition.revision }, part, revision: 'session-r2' })
  if (!result || result.kind !== 'assembly-source-review') throw new Error('Expected native review data')
  expect(result.occurrences).toHaveLength(2); expect(result.endpoints).toHaveLength(0); expect('token' in result).toBe(false)
  expect(result.scene.volume).toBeCloseTo(4800 + 153 * Math.PI / 2, 5)
  expect(serializeAssemblyDocument(base)).toBe(before)
  expect(() => session.apply(base, preview.token)).toThrow(/disponible/)
}, 60_000)

it('revokes an older Apply capability even when a source-review request fails validation', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), before = serializeAssemblyDocument(base)
  const preview = ready(session.prepare(base)), definition = base.definitions.find(value => value.id === 'example-pin')!
  if (definition.kind !== 'part') throw new Error('Expected the original shared pin source')
  expect(() => session.handle({ id: 91, action: 'review-assembly-part-update', current: base,
    source: { id: definition.id, revision: definition.revision }, part: definition.document, revision: definition.revision })).toThrow()
  expect(() => session.apply(base, preview.token)).toThrow(/disponible/)
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('previews a real mate proposal against an unchanged committed base and authenticates one Apply over RPC', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), proposed = mated(base), before = serializeAssemblyDocument(base), proposalBefore = serializeAssemblyDocument(proposed)
  const preview = ready(session.prepare(base, proposed)); expect(dof(preview)).toBe(2); expect(preview.scene.solidCount).toBe(3)
  expect(serializeAssemblyDocument(base)).toBe(before); expect(serializeAssemblyDocument(proposed)).toBe(proposalBefore)
  expect(() => JSON.stringify(preview)).not.toThrow(); expect(typeof preview.token).toBe('string')
  const history = new AssemblyDocumentHistory(base), applied = session.apply(history.current, preview.token)
  expect(applied.kind).toBe('assembly-applied'); expect(applied.document.mates).toHaveLength(4)
  expect(Math.abs(applied.document.occurrences[1].pose.translation[0] + 10)).toBeLessThan(1e-6)
  expect(Math.abs(applied.document.occurrences[2].pose.translation[0] - 10)).toBeLessThan(1e-6)
  expect(Math.abs(applied.document.occurrences[1].pose.translation[2] + 8)).toBeLessThan(1e-6)
  history.commitDocument(applied.document); expect(serializeAssemblyDocument(history.undo())).toBe(before)
  expect(() => session.apply(base, preview.token)).toThrow('ya no está disponible')
}, 60_000)

it('never trusts mutated response documents, numerical supports or fabricated tokens as native authority', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), preview = ready(session.prepare(base, mated(base))), token = preview.token
  preview.document.occurrences[1].pose.translation[0] = 999
  preview.scene.bodies[1].faces[0].selection.face.key = 'forged'
  preview.scopes[0].result.localDOF = 0
  expect(() => session.apply(base, 'forged')).toThrow('ya no está disponible')
  const actual = session.apply(base, token)
  expect(Math.abs(actual.document.occurrences[1].pose.translation[0] + 10)).toBeLessThan(1e-6)
  expect(actual.scene.bodies[1].faces[0].selection.face.key).not.toBe('forged')
}, 60_000)

it('keeps only the newest preview token and does not let a late discard revoke its replacement', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), first = ready(session.prepare(base)), second = ready(session.prepare(base))
  expect(first.token).not.toBe(second.token); session.discard(first.token)
  expect(() => session.apply(base, first.token)).toThrow('ya no está disponible')
  expect(session.apply(base, second.token).document.occurrences).toHaveLength(3)
}, 60_000)

it.each(['metadata', 'source parameter', 'malformed'] as const)('revokes a preview on a changed current %s even with unchanged revision labels', change => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), preview = ready(session.prepare(base)), current = validateAssemblyDocument(base)
  if (change === 'metadata') current.occurrences[1].name = 'Changed current occurrence'
  else if (change === 'malformed') current.units = 'cm' as 'mm'
  else {
    const pin = current.definitions.find(definition => definition.id === 'example-pin')!
    if (pin.kind !== 'part' || pin.document.features[0].type !== 'sketch' || pin.document.features[0].profile.kind !== 'circle') throw new Error('Expected circle')
    pin.document.features[0].profile.radius = 2.5
  }
  expect(() => session.apply(current, preview.token)).toThrow(); expect(() => session.apply(base, preview.token)).toThrow('ya no está disponible')
}, 60_000)

it('revokes capabilities on a rebuild, explicit discard and replacement worker session', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), first = ready(session.prepare(base))
  expect(session.build(base).solidCount).toBe(3); expect(() => session.apply(base, first.token)).toThrow('ya no está disponible')
  const second = ready(session.prepare(base)); session.discard(); expect(() => session.apply(base, second.token)).toThrow('ya no está disponible')
  const third = ready(session.prepare(base)); expect(() => new AssemblyWorkerSession().apply(base, third.token)).toThrow('ya no está disponible'); session.discard()
}, 60_000)

it('captures a fresh actual concentric quarter-turn and returns a replacement solved token with one remaining spin', () => {
  const session = new AssemblyWorkerSession(), initial = mated(), solved = session.apply(initial, ready(session.prepare(initial)).token).document
  solved.occurrences[1].pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const preview = ready(session.prepare(solved)), captured = ready(session.captureRotation(solved, preview.token, 'left-axis'))
  expect(dof(preview)).toBe(2); expect(dof(captured)).toBe(1); expect(captured.token).not.toBe(preview.token)
  expect(() => session.apply(solved, preview.token)).toThrow('ya no está disponible')
  const applied = session.apply(solved, captured.token), mate = applied.document.mates.find(mate => mate.id === 'left-axis')!
  expect(mate.type).toBe('concentric'); if (mate.type !== 'concentric') throw new Error('Expected concentric')
  expect(mate.rotationLock).not.toBeNull(); expect(transformRigidDirection(applied.document.occurrences[1].pose, [1, 0, 0])[1]).toBeCloseTo(1, 8)
}, 60_000)

it('captures full component-relative placement from authenticated solved frames and freshly solves it', () => {
  const session = new AssemblyWorkerSession(), input = mated(), solved = session.apply(input, ready(session.prepare(input)).token).document
  solved.occurrences[1].pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const first = { occurrencePath: ['left'], definition: solved.occurrences[1].definition }, second = { occurrencePath: ['plate'], definition: solved.occurrences[0].definition }
  const preview = ready(session.prepare(solved)), captured = ready(session.captureComponents(solved, preview.token, first, second))
  expect(dof(captured)).toBe(1); const mate = captured.document.mates.at(-1)!
  expect(mate.type).toBe('lock'); if (mate.type !== 'lock') throw new Error('Expected lock')
  mate.relativePose.translation.forEach((value, i) => expect(Math.abs(value - [0, -10, 8][i])).toBeLessThan(1e-6))
  expect(transformRigidDirection(mate.relativePose, [1, 0, 0])[1]).toBeCloseTo(-1, 8)
  const committed = session.apply(solved, captured.token).document; expect(committed.mates.at(-1)!.id).toBe(mate.id)
}, 60_000)

it('captures nested component frames while keeping reused parents rigid and their common six DOF', () => {
  const session = new AssemblyWorkerSession(), input = createAssemblyExample(), child = { ...input.occurrences[1], id: 'child', fixed: true,
    pose: { ...identityRigidPose(), translation: [1, 2, 3] as [number, number, number] } }
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original nested lock source', occurrences: [child], mates: [], createdAt: input.createdAt, updatedAt: input.updatedAt })
  input.occurrences = [{ ...child, id: 'a', fixed: false, definition: { id: 'sub', revision: 'r1' }, pose: { translation: [4, 5, 6], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } },
    { ...child, id: 'b', fixed: false, definition: { id: 'sub', revision: 'r1' }, pose: { ...identityRigidPose(), translation: [-4, -5, -6] } }]
  const preview = ready(session.prepare(input)), captured = ready(session.captureComponents(input, preview.token,
    { occurrencePath: ['a', 'child'], definition: child.definition }, { occurrencePath: ['b', 'child'], definition: child.definition }))
  expect(dof(preview)).toBe(12); expect(dof(captured)).toBe(6)
  const mate = captured.document.mates.at(-1)!; if (mate.type !== 'lock') throw new Error('Expected lock')
  mate.relativePose.translation.forEach((value, i) => expect(Math.abs(value - [-9, 5, -12][i])).toBeLessThan(1e-6)); session.discard()
}, 60_000)

it('rejects an incompatible proposal without changing the committed history or retaining an earlier token', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), earlier = ready(session.prepare(base)), proposed = mated(base), cap = proposed.mates.find(mate => mate.id === 'left-cap')!
  if (cap.type !== 'coincident') throw new Error('Expected cap')
  proposed.mates.push({ ...cap, id: 'contradiction', type: 'distance', name: 'Original 1mm contradiction', distance: 1 })
  const history = new AssemblyDocumentHistory(base), before = serializeAssemblyDocument(history.current), result = session.prepare(base, proposed)
  expect(result.status).toBe('rejected'); expect('token' in result).toBe(false); expect(serializeAssemblyDocument(history.current)).toBe(before); expect(history.canUndo).toBe(false)
  expect(() => session.apply(base, earlier.token)).toThrow('ya no está disponible')
}, 60_000)

it.each(['prepare', 'apply'] as const)('publishes no candidate or reusable capability when actual scene construction then fails during %s', stage => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), original = sceneModule.buildAssemblyScene, primary = new Error('Original scene publication fault')
  let count = 0
  const spy = vi.spyOn(sceneModule, 'buildAssemblyScene').mockImplementation(document => {
    const result = original(document); if (++count === (stage === 'prepare' ? 1 : 2)) throw primary; return result
  })
  const before = serializeAssemblyDocument(base)
  try {
    if (stage === 'prepare') expect(() => session.prepare(base)).toThrow(primary)
    else { const preview = ready(session.prepare(base)); expect(() => session.apply(base, preview.token)).toThrow(primary); expect(() => session.apply(base, preview.token)).toThrow('ya no está disponible') }
    expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { spy.mockRestore(); session.discard() }
}, 60_000)

it('keeps a valid original capability after a failed capture that changed no document', () => {
  const session = new AssemblyWorkerSession(), base = mated(), preview = ready(session.prepare(base))
  expect(() => session.captureRotation(base, preview.token, 'missing')).toThrow('Selecciona una relación')
  expect(session.apply(base, preview.token).document.mates).toHaveLength(4)
}, 60_000)
