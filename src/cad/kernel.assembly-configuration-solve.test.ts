import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC, measureShapeVolumeProperties, measureShapeSurfaceProperties } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import profileOriginal from './fixtures/assembly-profile-center-original.json'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { validateAssemblyDocument, type AssemblyComponentReference, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { identityRigidPose, validateRigidPose } from '../model/rigidPose'
import * as writeback from '../model/assemblyConfigurationWriteback'
import { prepareConfiguredAssemblySolve, applyPreparedConfiguredAssemblySolve } from './kernel.assembly-configuration-solve'
import { verifyConfiguredAssemblyGeometry } from './kernel.assembly-configuration-verification'
import type { AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import type { AssemblySceneBody } from './kernel.assembly-types'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape, validateAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners } from './kernel.native-ownership'

// GPL-3.0-only original recipes already tracked in the core fixture and
// assembly-profile-center-original.json. No private/reference-app geometry.
// A: 2*3*4=24, A52; B: 1*2*5=10, A34. Two S uses: V68/A172.
// The circular source is R2,h3: V12π/A20π. Native metadata nominates IDs;
// every preparation and final gate obtains its own actual current witnesses.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const near = (actual: readonly number[], expected: readonly number[], band = 1e-6) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((v, i) => { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(band) })
}
const options = { solver: { lengthRefinementTolerance: 5e-7, angleRefinementTolerance: 1e-9 } }
const flatten = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? error.errors.flatMap(flatten) : [])]
let boxBodies: Map<string, AssemblySceneBody>, circleBody: AssemblySceneBody

beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
  const core = assemblyConfigurationCoreFixture()
  boxBodies = new Map(buildAssemblyScene(core.document).bodies.map(body => [body.component.occurrencePath.join('/'), body]))
  const original = validateAssemblyDocument(profileOriginal)
  circleBody = buildAssemblyScene(original).bodies.find(body => body.component.definition.id === 'original-profile-circle')!
  expect(circleBody).toBeDefined()
}, 60_000)

function inner(input: AssemblyConfigurationGeometryInput): EmbeddedAssemblyDefinition {
  const value = input.document.definitions.find(d => d.kind === 'assembly')
  if (value?.kind !== 'assembly') throw Error('Original S missing')
  return value
}
function component(body: AssemblySceneBody, path: string[]): AssemblyComponentReference {
  return { ...clone(body.component), occurrencePath: path }
}
function plane(owner: 'a' | 'b') {
  const body = boxBodies.get('left/' + owner)!, x = owner === 'a' ? 2 : 1
  const rows = body.faces.filter(face => face.support?.kind === 'plane' && face.support.normal[0] > .99 && Math.abs(face.support.point[0] - x) < 1e-10)
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...clone(rows[0].selection), component: component(body, [owner]), support: 'plane' as const }
}
function prismFixture(parent = true): AssemblyConfigurationGeometryInput {
  const data = assemblyConfigurationCoreFixture(), input = { ...data, rootConfiguration: 'both-compact', generation: 17 }
  const s = inner(input)
  s.occurrences[0].fixed = true
  s.mates = validateAssemblyDocument({ ...input.document, mates: [
    { id: 'child-plane', name: 'Original signed X distance', type: 'distance', suppressed: false, first: plane('a'), second: plane('b'), alignment: 'aligned', distance: -2 },
    { id: 'child-lock', name: 'Original full child pose', type: 'lock', suppressed: false, first: component(boxBodies.get('left/a')!, ['a']), second: component(boxBodies.get('left/b')!, ['b']), relativePose: { translation: [3, 0, 0], rotation: [0, 0, 0, 1] } },
  ] }).mates
  // Child max faces solve 2-(bx+1)=-2 -> bx3; independent lock removes
  // otherwise free roll/two translations. Parent can then seat right/B at A.
  input.document.occurrences[0].fixed = true
  input.document.mates = parent ? validateAssemblyDocument({ ...input.document, mates: [
    { id: 'parent-lock', name: 'Original parent seat', type: 'lock', suppressed: false,
      first: component(boxBodies.get('left/a')!, ['left', 'a']), second: component(boxBodies.get('left/b')!, ['right', 'b']), relativePose: identityRigidPose() },
  ] }).mates : []
  return input
}
function physicalPrisms(input: AssemblyConfigurationGeometryInput) {
  const evaluation = evaluateAssemblyConfiguration(input.document, input.catalog, input.rootConfiguration)
  const expected = new Map([
    ['left/a', [[0, 0, 0], [2, 3, 4], 24, 52]], ['left/b', [[3, 0, 0], [4, 2, 5], 10, 34]],
    ['right/a', [[-3, 0, 0], [-1, 3, 4], 24, 52]], ['right/b', [[0, 0, 0], [1, 2, 5], 10, 34]],
  ] as const)
  expect(evaluation.parts.filter(p => !p.suppressed)).toHaveLength(4)
  withNativeOwners(owners => {
    let volume = 0, area = 0
    for (const p of evaluation.parts.filter(p => !p.suppressed)) {
      const box = expected.get(p.path.join('/') as 'left/a')!
      expect(box).toBeDefined()
      const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      expect(engine.build(validateDocument(p.definition.document).features).featureErrors).toEqual([])
      const local = owners.own(engine.copyCurrentBodyShape(null)), placed = owners.own(placeAssemblyShape(local, validateRigidPose(p.worldPose)))
      expect(validateAssemblyShape(placed)).toBe(1)
      const v = owners.own(measureShapeVolumeProperties(placed)).volume, a = owners.own(measureShapeSurfaceProperties(placed)).area
      near([v, a], [box[2], box[3]], 1e-5)
      const bounds = owners.own(placed.boundingBox).bounds; near(bounds[0], box[0]); near(bounds[1], box[1])
      volume += v; area += a
    }
    near([volume, area], [68, 172], 1e-5)
  })
}
function circularAxis(owner: string) {
  const rows = circleBody.faces.filter(face => face.support?.kind === 'cylinder')
  expect(rows).toHaveLength(1)
  const support = rows[0].support
  if (support?.kind !== 'cylinder') throw Error('Native original cylinder missing')
  near(support.axis, [0, 0, -1], 1e-12)
  return { kind: 'face' as const, ...clone(rows[0].selection), component: component(circleBody, [owner]), support: 'axis' as const }
}
function gearFixture(far = false): AssemblyConfigurationGeometryInput {
  const input = prismFixture(false), s = inner(input)
  const source = validateAssemblyDocument(profileOriginal).definitions.find(d => d.id === 'original-profile-circle')!
  input.document.definitions = [clone(source), s]
  s.occurrences = ['a', 'b', ...(far ? ['carrier'] : [])].map(id => ({ id, name: id, definition: { id: source.id, revision: source.revision },
    pose: { translation: [far ? (id === 'b' ? -1e12 : 1e12) : 0, 0, 0], rotation: id === 'a' || far ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : [0, 0, 0, 1] },
    fixed: id !== 'b', suppressed: false, visible: true }))
  const baseAngles = far ? { first: 4 * Math.PI, second: -4 * Math.PI } : { first: -Math.PI / 2, second: 0 }
  const workAngles = far ? baseAngles : { first: 7 * Math.PI / 2, second: -4 * Math.PI }
  const raw = (id: string, suppressed: boolean, phase: number) => ({ id, name: id, type: 'gear', suppressed, first: circularAxis('a'), second: circularAxis('b'),
    carrier: far ? component(circleBody, ['carrier']) : null, ratio: { numerator: 1, denominator: 1 }, direction: 'opposed',
    neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: baseAngles, phase })
  s.mates = validateAssemblyDocument({ ...input.document, mates: [raw('active-gear', false, 0), raw('passive-gear', true, 123)] }).mates
  const captures = (angles: { first: number; second: number }) => s.mates.map(mate => {
    if (mate.type !== 'gear') throw Error('gear')
    return { mateId: mate.id, suppressed: mate.suppressed, capture: { type: 'gear' as const, neutralRotations: clone(mate.neutralRotations), angles: { ...angles }, phase: mate.phase } }
  })
  input.catalog[1].configurations = [
    { id: 'work', name: 'Original complete turns', occurrences: [], mates: captures(workAngles) },
    { id: 'idle', name: 'Unselected complete turns', occurrences: [], mates: captures(far ? workAngles : { first: 15 * Math.PI / 2, second: -8 * Math.PI }) },
  ]
  input.catalog[0].configurations = [{ id: 'both-compact', name: 'Both work states', occurrences: ['left', 'right'].map(occurrenceId => ({ occurrenceId, configuration: 'work' })), mates: [] }]
  input.document.occurrences.forEach(o => { o.fixed = true })
  if (far) input.document.occurrences[1].pose.translation = [-1e12, 0, 0]
  return input
}

it('stages one shared named child before its named parent, then independently checks all four original BReps', () => {
  const input = prismFixture(), before = clone(input), handle = prepareConfiguredAssemblySolve(input, options)
  expect(input).toEqual(before); expect(handle.changed).toBe(true); expect(handle.propagation).toBe('shared-intrinsic-states')
  expect(handle.states.map(s => [s.definition.id, s.configuration])).toEqual([['configuration-S', 'compact'], ['configuration-root', 'both-compact']])
  expect(handle.states[0].scopePaths).toEqual([['left'], ['right']]); expect(handle.candidate.generation).toBeGreaterThan(input.generation)
  expect(handle.candidate.document).toEqual(input.document)
  expect(handle.candidate.catalog[1].configurations[1]).toEqual(input.catalog[1].configurations[1])
  expect(handle.candidate.catalog[0].configurations.slice(0, 2)).toEqual(input.catalog[0].configurations.slice(0, 2))
  expect(handle.verification.accepted).toBe(true); expect(handle.verification.reports).toHaveLength(5)
  expect(handle.verification.reports.filter(r => r.measurement.scopePath.length === 1)).toHaveLength(4)
  const result = applyPreparedConfiguredAssemblySolve(input, handle)
  expect(result).toEqual(handle.candidate); expect(result).not.toBe(handle.candidate)
  expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.catalog[1].configurations[0].occurrences)).toBe(true)
  const candidate = clone(result) as AssemblyConfigurationGeometryInput
  physicalPrisms(candidate); expect(verifyConfiguredAssemblyGeometry(candidate).accepted).toBe(true)
  expect(input).toEqual(before); expect(() => applyPreparedConfiguredAssemblySolve(input, handle)).toThrow(/consumed|missing/)
}, 60_000)

it('never promotes a copied handle, candidate or physical verification into transaction authority', () => {
  const input = prismFixture(), handle = prepareConfiguredAssemblySolve(input, options)
  for (const fake of [clone(handle), handle.candidate, handle.verification]) expect(() => applyPreparedConfiguredAssemblySolve(input, fake)).toThrow(/copied|missing/)
  expect(applyPreparedConfiguredAssemblySolve(input, handle)).toEqual(handle.candidate)
}, 60_000)

it.each(['document', 'catalog', 'rootConfiguration', 'generation'] as const)('consumes a genuine preparation after a stale %s attempt, even if exact data is restored', field => {
  const input = prismFixture(), handle = prepareConfiguredAssemblySolve(input, options), saved = clone(input)
  if (field === 'document') input.document.name += ' changed'
  if (field === 'catalog') input.catalog[0].configurations[0].name += ' changed'
  if (field === 'rootConfiguration') input.rootConfiguration = 'mixed'
  if (field === 'generation') input.generation += 2
  expect(() => applyPreparedConfiguredAssemblySolve(input, handle)).toThrow(/baseline/)
  Object.assign(input, saved)
  expect(() => applyPreparedConfiguredAssemblySolve(input, handle)).toThrow(/consumed|missing/)
}, 60_000)

it('does not publish child staging when a later fixed parent cannot satisfy its actual lock', () => {
  const input = prismFixture(); input.document.occurrences[1].fixed = true
  const saved = clone(input), original = writeback.stageAssemblyConfigurationSolveState, staged: string[] = []
  const stage = vi.spyOn(writeback, 'stageAssemblyConfigurationSolveState').mockImplementation((...args) => {
    const result = original(...args); staged.push(args[3].definition.id)
    if (args[3].definition.id === 'configuration-S') near(args[3].poses.find(p => p.id === 'b')!.pose.translation, [3, 0, 0])
    return result
  })
  let published: unknown
  try { expect(() => { published = prepareConfiguredAssemblySolve(input, options) }).toThrow(); expect(staged).toContain('configuration-S'); expect(published).toBeUndefined(); expect(input).toEqual(saved) }
  finally { stage.mockRestore() }
}, 60_000)

it('checks the far second placed use rather than publishing the precise representative alone', () => {
  const input = prismFixture(false); input.document.occurrences[1].pose.translation = [1e14, 0, 0]
  const saved = clone(input); let published: unknown
  expect(() => { published = prepareConfiguredAssemblySolve(input, options) }).toThrow(/precision|conditioning|geometry|uncertainty/i)
  expect(published).toBeUndefined(); expect(input).toEqual(saved)
}, 60_000)

it('rechecks the raw caller baseline after a real query reenters and changes its generation', () => {
  const input = prismFixture(), original = CadEngine.prototype.inspectCurrentFaceSupport
  let changed = false, published: unknown
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = original.apply(this, args); if (!changed) { changed = true; input.generation++ } return result
  })
  try { expect(() => { published = prepareConfiguredAssemblySolve(input, options) }).toThrow(/baseline|changed/); expect(changed).toBe(true); expect(published).toBeUndefined() }
  finally { query.mockRestore() }
}, 60_000)

it('withholds a solved stage on release failure and attempts every owned native prototype once', () => {
  const input = prismFixture(), saved = clone(input), failure = Error('Original owned stage release failure')
  const inspect = CadEngine.prototype.inspectCurrentFaceSupport, dispose = CadEngine.prototype.dispose
  const releases = new Map<CadEngine, number>(); let queried = false, published: unknown, caught: unknown
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) { const result = inspect.apply(this, args); queried = true; return result })
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    dispose.call(this); if (queried) { releases.set(this, (releases.get(this) ?? 0) + 1); throw failure }
  })
  try {
    try { published = prepareConfiguredAssemblySolve(input, options) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(AggregateError); expect(flatten(caught)).toContain(failure)
    expect(releases.size).toBe(2); expect([...releases.values()]).toEqual([1, 1]); expect(published).toBeUndefined(); expect(input).toEqual(saved)
  } finally { query.mockRestore(); release.mockRestore() }
}, 60_000)

it('rejects executable policy before allocating a native prototype and never invokes its accessor', () => {
  const input = prismFixture(), rebuild = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'); let calls = 0
  const bad = Object.defineProperty({}, 'lengthToleranceMm', { enumerable: true, get: () => { calls++; return 1e-6 } })
  try { expect(() => prepareConfiguredAssemblySolve(input, bad)).toThrow(); expect(calls).toBe(0); expect(rebuild).not.toHaveBeenCalled() } finally { rebuild.mockRestore() }
})

it('does not overflow the controller generation while staging changed geometry', () => {
  const input = prismFixture(); input.generation = Number.MAX_SAFE_INTEGER; const saved = clone(input)
  expect(() => prepareConfiguredAssemblySolve(input, options)).toThrow(/generation/); expect(input).toEqual(saved)
}, 60_000)

it('preserves a no-constraint selected closure without introducing a generation or pose change', () => {
  const input = { ...assemblyConfigurationCoreFixture(), rootConfiguration: 'both-compact', generation: 3 }, saved = clone(input)
  const handle = prepareConfiguredAssemblySolve(input, options)
  expect(handle.changed).toBe(false); expect(handle.candidate).toEqual(saved); expect(handle.states.every(s => !s.changed)).toBe(true)
  expect(handle.verification.accepted).toBe(true); expect(handle.verification.reports).toEqual([])
  expect(applyPreparedConfiguredAssemblySolve(input, handle)).toEqual(saved)
}, 60_000)

it('writes active and passive complete-turn state while retaining their distinct phase and neutral captures', () => {
  const input = gearFixture(), saved = clone(input), handle = prepareConfiguredAssemblySolve(input, options)
  expect(handle.states.filter(s => s.definition.id === 'configuration-S')).toHaveLength(1)
  expect(handle.verification.reports).toHaveLength(4)
  const candidate = clone(handle.candidate) as AssemblyConfigurationGeometryInput, evaluated = evaluateAssemblyConfiguration(candidate.document, candidate.catalog, candidate.rootConfiguration)
  for (const scope of evaluated.scopes.filter(s => s.path.length === 1)) for (const mate of scope.mates) {
    if (mate.type !== 'gear') throw Error('gear')
    near([mate.angles.first, mate.angles.second], [7 * Math.PI / 2, -7 * Math.PI / 2], 1e-8)
    expect(mate.neutralRotations).toEqual({ first: [0, 0, 0, 1], second: [0, 0, 0, 1] }); expect(mate.phase).toBe(mate.suppressed ? 123 : 0)
  }
  expect(handle.candidate.document).toEqual(saved.document); expect(handle.candidate.catalog[1].configurations[1]).toEqual(saved.catalog[1].configurations[1])
  for (const r of handle.verification.reports) {
    expect(r.measurement.status).toBe('ok')
    if (r.measurement.status !== 'ok' || r.measurement.family !== 'gear') throw Error('gear measurement')
    near([r.measurement.liftedAngles!.first, r.measurement.liftedAngles!.second], [7 * Math.PI / 2, -7 * Math.PI / 2], 1e-8)
    if (r.passive) { expect(r.measurement.travelMm).toBeNull(); near([r.measurement.phaseResidualRad!], [-123], 1e-8) }
  }
  expect(verifyConfiguredAssemblyGeometry(candidate).accepted).toBe(true); expect(input).toEqual(saved)
}, 60_000)

it('refuses stale authored winding instead of inventing a child or carrier movement trajectory', () => {
  const input = gearFixture(), row = input.catalog[1].configurations[0].mates[0]
  if (row.capture?.type !== 'gear') throw Error('capture')
  row.capture.angles.first += .25
  const saved = clone(input); expect(() => prepareConfiguredAssemblySolve(input, options)).toThrow(/capture|trajectory|winding|continuity|anchor/i); expect(input).toEqual(saved)
}, 60_000)

it('admits angular-only active and passive gear state with an actual carrier at far opposed translations', () => {
  const input = gearFixture(true), saved = clone(input), handle = prepareConfiguredAssemblySolve(input, options)
  expect(handle.verification.accepted).toBe(true); expect(handle.verification.reports).toHaveLength(4)
  for (const r of handle.verification.reports) {
    expect(r.measurement.status).toBe('ok')
    if (r.measurement.status !== 'ok' || r.measurement.family !== 'gear') throw Error('gear measurement')
    expect(r.measurement.componentPaths.carrier).toEqual([...r.measurement.scopePath, 'carrier'])
    near([r.measurement.liftedAngles!.first, r.measurement.liftedAngles!.second], [4 * Math.PI, -4 * Math.PI], 1e-8)
    expect(r.measurement.travelMm).toBeNull(); expect(r.measurement.positionResidualMm).toBeNull()
  }
  expect(input).toEqual(saved)
}, 60_000)
