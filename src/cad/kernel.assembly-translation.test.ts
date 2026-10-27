import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { expandAssemblyParts, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyDocument, type AssemblyOccurrence, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { identityRigidPose } from '../model/rigidPose'
import { prepareAssemblyTranslationPath, type AssemblyTranslationPath } from '../model/assemblyTranslation'
import { traceAssemblyTranslation } from './kernel.assembly-translation'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import * as placements from './kernel.assembly-placements'
import type { Feature, Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original public-feature millimeter boxes. Moving box 16×10×8 has V1280/A736;
// obstacle .2×12×10 at X20 has V24/A248.8. A translation X0→40 starts/ends
// clear but first geometric face contact is X11.9 (fraction .2975). At X12,
// actual positive Common is .1×10×8=8. This is a numerical OC-distance policy
// regression, not a certified SDK error interval, rotation CCD or exact TOI.
const stamp = '2026-10-15T00:00:00.000Z'
const z90 = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const
const near = (actual: number, expected: number, tolerance = 1e-6) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
function part(id: string, width = 16, height = 10, depth = 8, legacy = false): EmbeddedPartDefinition {
  return { kind: 'part', id, revision: 'r1', document: validateDocument({ version: 1, id, name: 'Original translation ' + id,
    units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width, height } },
      { id: 'create', name: 'Original box', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
        ...(legacy ? {} : { bodyOperation: { mode: 'new', bodyId: 'box-body' } as const }) },
    ] }) }
}
function occurrence(id: string, definition: EmbeddedPartDefinition | EmbeddedAssemblyDefinition, translation: Vec3): AssemblyOccurrence {
  return { id, name: 'Original ' + id, definition: { id: definition.id, revision: definition.revision },
    pose: { ...identityRigidPose(), translation }, fixed: false, suppressed: false, visible: true }
}
function tunnel(): AssemblyDocument {
  const input = createEmptyAssembly('Original analytical translation tunnel'), moving = part('moving'), obstacle = part('obstacle', .2, 12, 10)
  input.id = 'translation-original'; input.createdAt = stamp; input.updatedAt = stamp; input.definitions = [moving, obstacle]
  input.occurrences = [occurrence('a', moving, [0, 0, 0]), occurrence('b', obstacle, [20, 0, 0])]
  return validateAssemblyDocument(input)
}
function path(input = tunnel(), translation: Vec3 = [40, 0, 0]): AssemblyTranslationPath {
  const target = structuredClone(input); target.occurrences[0].pose.translation = [...translation]
  return prepareAssemblyTranslationPath(input, target)
}
function nativeFault<T>(context: string, patch: (owner: NativeOwner) => void, action: () => T): T {
  const real = ownership.withNativeOwners
  const replacement: typeof real = <R>(operation: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], actualContext?: string): R => real(owners => {
    if (actualContext === context) {
      const own = owners.own.bind(owners)
      owners.own = <S extends NativeOwner>(owner: S): S => { patch(owner); return own(owner) }
    }
    return operation(owners)
  }, retained, actualContext)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement)
  try { return action() } finally { spy.mockRestore() }
}
function captured(action: () => unknown): unknown {
  try { action() } catch (error) { return error }
  throw new Error('Original regression expected rejection')
}
function errorTree(error: unknown): unknown[] {
  return error instanceof AggregateError ? [error, ...error.errors.flatMap(errorTree)] : [error]
}

it('stops a thin-obstacle tunnel although both endpoints are actually BRep-clear', () => {
  const input = tunnel(), movement = path(input), before = serializeAssemblyDocument(input)
  expect(analyzeAssemblyInterference(input, { clearance: 0 }).pairs).toEqual([])
  expect(analyzeAssemblyInterference(movement.target, { clearance: 0 }).pairs).toEqual([])
  const crossed = analyzeAssemblyInterference(movement.at(.3), { clearance: 0 })
  expect(crossed.pairs).toHaveLength(1); near(crossed.pairs[0].intersectionVolume, 8)
  const result = traceAssemblyTranslation(movement)
  expect(result.status).toBe('stopped'); expect(result.bodyCount).toBe(2); expect(result.pairCount).toBe(1)
  expect(result.queryCount).toBeGreaterThan(2); expect(result.invariantPairCount).toBe(0)
  near(result.fraction * 40, 11.9, 5e-6); expect(result.fraction * 40).toBeLessThan(11.9)
  const pair = result.blockingPair!
  expect(pair.first.body).toEqual({ bodyId: 'box-body', sourceFeatureId: 'create' })
  expect(pair.first.component.occurrencePath).toEqual(['a']); expect(pair.second.component.occurrencePath).toEqual(['b'])
  expect(pair.minimumDistance).toBeGreaterThan(pair.band)
  expect(pair.minimumDistance - pair.band).toBeLessThanOrEqual(pair.lengthTolerance)
  near(Math.hypot(...pair.closestPoints.first.map((value, axis) => value - pair.closestPoints.second[axis])), pair.minimumDistance)
  const scene = buildAssemblyScene(movement.at(result.fraction)), a = scene.bodies.find(body => body.component.occurrencePath[0] === 'a')!,
    b = scene.bodies.find(body => body.component.occurrencePath[0] === 'b')!
  near(a.volume, 1280); near(a.area, 736); near(b.volume, 24); near(b.area, 248.8)
  expect(a.solidCount).toBe(1); expect(b.solidCount).toBe(1)
  expect(analyzeAssemblyInterference(movement.at(result.fraction), { clearance: 1e-5 }).pairs[0].intersectionVolume).toBe(0)
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('stops at the requested clearance band rather than labeling it exact contact', () => {
  const result = traceAssemblyTranslation(path(), { clearance: .5 })
  expect(result.status).toBe('stopped'); near(result.fraction * 40, 11.4, 5e-6)
  expect(result.blockingPair!.band).toBeGreaterThan(.5); expect(result.blockingPair!.minimumDistance).toBeGreaterThan(.5)
}, 60_000)

it.each([{ translation: [5, 0, 0] as Vec3 }, { translation: [-40, 0, 0] as Vec3 }])('actually queries the complete safe destination $translation', ({ translation }) => {
  const result = traceAssemblyTranslation(path(tunnel(), translation))
  expect(result.status).toBe('complete'); expect(result.fraction).toBe(1); expect(result.queryCount).toBeGreaterThanOrEqual(2)
  expect(result.blockingPair).toBeUndefined()
}, 60_000)

it('uses relative motion when two clear endpoints cross each other', () => {
  const input = tunnel(), box = part('moving'); input.definitions = [box]
  input.occurrences = [occurrence('a', box, [0, 0, 0]), occurrence('b', box, [40, 0, 0])]
  const target = structuredClone(input); target.occurrences[0].pose.translation[0] = 30; target.occurrences[1].pose.translation[0] = 10
  const movement = prepareAssemblyTranslationPath(input, target), result = traceAssemblyTranslation(movement)
  expect(analyzeAssemblyInterference(input, { clearance: 0 }).pairs).toEqual([])
  expect(analyzeAssemblyInterference(target, { clearance: 0 }).pairs).toEqual([])
  expect(result.status).toBe('stopped'); near(result.fraction, .4, 1e-6)
  near(movement.at(result.fraction).occurrences[0].pose.translation[0], 12, 5e-6)
}, 60_000)

it('excludes exactly equal velocities while exposing unchanged initial overlap', () => {
  const input = tunnel(), box = part('moving'); input.definitions = [box]
  input.occurrences = [occurrence('a', box, [0, 0, 0]), occurrence('b', box, [1, 0, 0])]
  const target = structuredClone(input); target.occurrences.forEach(value => { value.pose.translation[0] += 40 })
  const result = traceAssemblyTranslation(prepareAssemblyTranslationPath(input, target))
  expect(result).toEqual({ fraction: 1, status: 'complete', bodyCount: 2, pairCount: 0, invariantPairCount: 1, queryCount: 0 })
  near(analyzeAssemblyInterference(target, { clearance: 0 }).pairs[0].intersectionVolume, 1200)
}, 60_000)

it('does not discard small but nonzero relative velocities', () => {
  const input = tunnel(), target = structuredClone(input)
  target.occurrences[0].pose.translation[0] += 1e-9
  const result = traceAssemblyTranslation(prepareAssemblyTranslationPath(input, target))
  expect(result.pairCount).toBe(1); expect(result.invariantPairCount).toBe(0); expect(result.queryCount).toBe(2)
}, 60_000)

it('includes hidden obstacles and excludes actually suppressed leaf expansions', () => {
  const input = tunnel(); input.occurrences[1].visible = false
  expect(traceAssemblyTranslation(path(input)).status).toBe('stopped')
  input.occurrences[1].suppressed = true
  expect(traceAssemblyTranslation(path(input))).toEqual({ fraction: 1, status: 'complete', bodyCount: 1, pairCount: 0, invariantPairCount: 0, queryCount: 0 })
}, 60_000)

it('preserves full reused nested paths and rotates local velocity into the world', () => {
  const input = tunnel(), moving = input.definitions[0]
  if (moving.kind !== 'part') throw new Error('Original part missing')
  const child = occurrence('leaf', moving, [0, 0, 0])
  const group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'group', revision: 'r1', name: 'Original reused group',
    createdAt: stamp, updatedAt: stamp, occurrences: [child], mates: [] }
  input.definitions.push(group)
  input.occurrences = [occurrence('A', group, [0, 0, 0]), occurrence('B', group, [100, 0, 0]), input.occurrences[1]]
  input.occurrences[0].pose.rotation = [...z90]
  const target = structuredClone(input), targetGroup = target.definitions.find(value => value.id === 'group')
  if (targetGroup?.kind !== 'assembly') throw new Error('Original group missing')
  targetGroup.occurrences[0].pose.translation = [0, -40, 0]
  const movement = prepareAssemblyTranslationPath(input, target)
  const a = movement.leaves.find(value => value.component.occurrencePath[0] === 'A')!,
    b = movement.leaves.find(value => value.component.occurrencePath[0] === 'B')!
  near(a.delta[0], 40); near(a.delta[1], 0); near(b.delta[0], 0); near(b.delta[1], -40)
  const result = traceAssemblyTranslation(movement)
  expect(result.status).toBe('stopped'); expect(result.bodyCount).toBe(3); expect(result.pairCount).toBe(3)
  expect(result.blockingPair!.first.component.occurrencePath).toEqual(['A', 'leaf'])
  // Rz90 turns moving width16 into X width10; leading edge starts at X5.
  near(result.fraction * 40, 14.9, 5e-6)
}, 60_000)

it.each([false, true])('keeps all native solids and exact explicit/null body identity, legacy=%s', legacy => {
  const input = tunnel(), moving = part('moving', 4, 4, 4, legacy)
  moving.document.features = [0, 1].flatMap((index): Feature[] => [
    { id: 'profile-' + index, name: 'Original separate profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, index * 20], width: 4, height: 4 } },
    { id: 'create-' + index, name: 'Original separate solid', type: 'extrude', sketchId: 'profile-' + index,
      depth: 4, symmetric: false, suppressed: false, ...(legacy ? {} : { bodyOperation: { mode: 'new', bodyId: 'body-' + index } }) },
  ])
  input.definitions[0] = moving
  const result = traceAssemblyTranslation(path(input))
  expect(result.status).toBe('stopped'); expect(result.bodyCount).toBe(legacy ? 2 : 3); expect(result.pairCount).toBe(legacy ? 1 : 2)
  if (legacy) expect(result.blockingPair!.first.body).toBeNull()
  else expect(result.blockingPair!.first.body).toEqual({ bodyId: 'body-0', sourceFeatureId: 'create-0' })
  near(result.fraction * 40, 17.9, 5e-6)
}, 60_000)

it('rebuilds each exact prototype once and leaves all source shapes usable until cleanup', () => {
  const input = tunnel(), copy = structuredClone(input.occurrences[0]); copy.id = 'c'; copy.pose.translation = [0, 100, 0]; input.occurrences.push(copy)
  const build = CadEngine.prototype.build, engines: CadEngine[] = []
  const spy = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function(this: CadEngine, features) { engines.push(this); return build.call(this, features) })
  try { expect(traceAssemblyTranslation(path(input)).status).toBe('stopped'); expect(engines).toHaveLength(2) }
  finally { spy.mockRestore() }
  expect(() => engines[0].copyCurrentBodyShape({ bodyId: 'box-body', sourceFeatureId: 'create' })).toThrow('reconstrucción completa')
}, 60_000)

it('rederives geometry from documents without consulting caller leaves or interpolation callback', () => {
  const movement = path(), before = traceAssemblyTranslation(movement); let calls = 0
  Object.defineProperty(movement, 'leaves', { enumerable: true, get: () => { calls++; throw new Error('Must not read caller leaves') } })
  Object.defineProperty(movement, 'at', { enumerable: true, get: () => { calls++; throw new Error('Must not read caller callback') } })
  Object.defineProperty(movement, 'arithmeticMagnitude', { enumerable: true, get: () => { calls++; throw new Error('Must not read caller arithmetic bound') } })
  expect(traceAssemblyTranslation(movement)).toEqual(before); expect(calls).toBe(0)
}, 60_000)

it('rejects source accessors without executing them', () => {
  const movement = path(); let calls = 0
  Object.defineProperty(movement, 'base', { enumerable: true, get: () => { calls++; return tunnel() } })
  expect(() => traceAssemblyTranslation(movement)).toThrow('sin accesores'); expect(calls).toBe(0)
}, 60_000)

it('does not trust same revision labels when actual part contents changed', () => {
  const movement = path(), source = movement.target.definitions[0]
  if (source.kind !== 'part' || source.document.features[0].type !== 'sketch' || source.document.features[0].profile.kind !== 'rectangle') throw new Error('Original profile missing')
  source.document.features[0].profile.width = 17
  expect(() => traceAssemblyTranslation(movement)).toThrow()
}, 60_000)

it('rebuilds actual changed source contents under unchanged opaque labels', () => {
  const input = tunnel(), source = input.definitions[0]
  if (source.kind !== 'part' || source.document.features[0].type !== 'sketch' || source.document.features[0].profile.kind !== 'rectangle') throw new Error('Original profile missing')
  source.document.features[0].profile.width = 21
  const result = traceAssemblyTranslation(path(input))
  expect(result.status).toBe('stopped'); near(result.fraction * 40, 9.4, 5e-6)
  expect(result.blockingPair!.first.component.definition).toEqual({ id: 'moving', revision: 'r1' })
}, 60_000)

it('rejects a real partial feature rebuild before querying any candidate distance', () => {
  const input = tunnel(), source = input.definitions[0]
  if (source.kind !== 'part') throw new Error('Original part missing')
  source.document.features.push({ id: 'remote', name: 'Original missed profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'cut', name: 'Original rejected cut', type: 'cut', sketchId: 'remote', depth: 8, symmetric: false, suppressed: false,
    bodyScope: [{ bodyId: 'box-body', sourceFeatureId: 'create' }] })
  let queries = 0
  expect(() => nativeFault('Assembly translation distance query or release failed.', owner => {
    if ('Perform' in owner && 'Value' in owner) queries++
  }, () => traceAssemblyTranslation(path(input)))).toThrow('No se pudo reconstruir')
  expect(queries).toBe(0)
}, 60_000)

it.each([0, -1, 5e-7])('rejects initial moving-pair contact/overlap/near separation %s instead of ignoring it', gap => {
  const input = tunnel(); input.occurrences[1].pose.translation[0] = 8.1 + gap
  expect(() => traceAssemblyTranslation(path(input))).toThrow('empieza con contacto')
}, 60_000)

it('exhausted query admission rejects the whole candidate without publishing a partial safe fraction', () => {
  let queryCount = 0
  const error = captured(() => nativeFault('Assembly translation distance query or release failed.', owner => {
    if ('Perform' in owner && 'Value' in owner) queryCount++
  }, () => traceAssemblyTranslation(path(), { maxQueries: 1 })))
  expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain('agotó el presupuesto'); expect(queryCount).toBe(1)
}, 60_000)

it.each(['not-done', 'no-solutions', 'invalid-value', 'invalid-point', 'inconsistent-points'] as const)('rejects actual native distance %s', fault => {
  let seen = false, releases = 0, pointSeen = false
  const error = captured(() => nativeFault('Assembly translation distance query or release failed.', owner => {
    if ('Value' in owner && typeof owner.Value === 'function' && 'IsDone' in owner && typeof owner.IsDone === 'function'
      && 'NbSolution' in owner && typeof owner.NbSolution === 'function') {
      seen = true; const value = owner.Value.bind(owner), done = owner.IsDone.bind(owner), count = owner.NbSolution.bind(owner), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove() } })
      if (fault === 'not-done') Object.defineProperty(owner, 'IsDone', { configurable: true, value: () => { done(); return false } })
      if (fault === 'no-solutions') Object.defineProperty(owner, 'NbSolution', { configurable: true, value: () => { count(); return 0 } })
      if (fault === 'invalid-value') Object.defineProperty(owner, 'Value', { configurable: true, value: () => { value(); return NaN } })
    } else if (!pointSeen && 'X' in owner && typeof owner.X === 'function') {
      pointSeen = true; const x = owner.X.bind(owner)
      if (fault === 'invalid-point' || fault === 'inconsistent-points') Object.defineProperty(owner, 'X', { configurable: true, value: () => { const actual = x(); return fault === 'invalid-point' ? NaN : actual + 3 } })
    }
  }, () => traceAssemblyTranslation(path())))
  expect(error).toBeInstanceOf(Error); expect(seen).toBe(true); expect(releases).toBe(1)
  expect(pointSeen).toBe(fault === 'invalid-point' || fault === 'inconsistent-points')
}, 60_000)

it('preserves primary native query failure and actual release failure without double delete', () => {
  const primary = new Error('Original translation distance query fault'), cleanup = new Error('Original translation distance release fault'); let releases = 0
  const error = captured(() => nativeFault('Assembly translation distance query or release failed.', owner => {
    if ('Value' in owner && typeof owner.Value === 'function') {
      const value = owner.Value.bind(owner), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'Value', { configurable: true, value: () => { value(); throw primary } })
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }
  }, () => traceAssemblyTranslation(path())))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(primary); expect(errorTree(error)).toContain(cleanup); expect(releases).toBe(1)
}, 60_000)

it('withholds a computed round when actual placed-shape release fails', () => {
  const cleanup = new Error('Original translation placed release fault'); let seen = false, releases = 0
  const error = captured(() => nativeFault('Assembly translation round placement or release failed.', owner => {
    if (!seen && 'asShape3D' in owner && 'wrapped' in owner) {
      seen = true; const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }
  }, () => traceAssemblyTranslation(path())))
  expect(seen).toBe(true); expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); expect(releases).toBe(1)
}, 60_000)

it('rejects body capacity before placing 257 occurrences rather than clipping them', () => {
  const input = tunnel(), source = input.occurrences[0]
  input.occurrences = Array.from({ length: 257 }, (_, index) => ({ ...structuredClone(source), id: 'entry-' + index }))
  const spy = vi.spyOn(placements, 'placeAssemblyShape')
  try { expect(() => traceAssemblyTranslation(path(input))).toThrow('presupuesto de cuerpos'); expect(spy).not.toHaveBeenCalled() }
  finally { spy.mockRestore() }
}, 60_000)

it('rejects coordinate precision loss without widening the requested distance deflection', () => {
  const input = tunnel(); input.occurrences.forEach(value => { value.pose.translation[0] += 1e8 })
  expect(() => traceAssemblyTranslation(path(input, [1e8 + 40, 0, 0]))).toThrow('precisión solicitada')
}, 60_000)

function cancellingParent(offset: number): AssemblyDocument {
  const input = tunnel(), moving = input.definitions[0]
  if (moving.kind !== 'part') throw new Error('Original part missing')
  const group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'cancelling-group', revision: 'r1', name: 'Original cancelling placement',
    createdAt: stamp, updatedAt: stamp, occurrences: [occurrence('leaf', moving, [-offset, 0, 0])], mates: [] }
  input.definitions.push(group); input.occurrences[0] = occurrence('A', group, [offset, 0, 0])
  return validateAssemblyDocument(input)
}

it('rejects large parent/child cancellation even when both WORLD endpoints are small and representable', () => {
  const input = cancellingParent(1e12), movement = path(input, [1e12 + 40, 0, 0])
  expect(movement.leaves[0].start.translation).toEqual([0, 0, 0]); expect(movement.leaves[0].delta).toEqual([40, 0, 0])
  expect(expandAssemblyParts(movement.at(1))[0].worldPose.translation).toEqual([40, 0, 0])
  // The exact affine location is 11.9, while the actual declaration addition
  // at 1e12 quantizes the intermediate WORLD location by more than 1e-5 mm.
  const actual = expandAssemblyParts(movement.at(.2975))[0].worldPose.translation[0]
  expect(Math.abs(actual - 11.9)).toBeGreaterThan(1e-5)
  expect(() => traceAssemblyTranslation(movement)).toThrow('aritmética local y mundial')
}, 60_000)

it('rejects local prototype coordinates cancelled by placement instead of trusting a small final body box', () => {
  const input = tunnel(), moving = input.definitions[0]
  if (moving.kind !== 'part' || moving.document.features[0].type !== 'sketch' || moving.document.features[0].profile.kind !== 'rectangle') throw new Error('Original profile missing')
  moving.document.features[0].profile.center = [100000, 0]
  input.occurrences[0].pose.translation[0] = -100000
  const movement = path(input, [-99960, 0, 0]), scene = buildAssemblyScene(input)
  const a = scene.bodies.find(body => body.component.occurrencePath[0] === 'a')!
  near(a.bounds.min[0], -8); near(a.bounds.max[0], 8); near(a.volume, 1280); near(a.area, 736)
  expect(() => traceAssemblyTranslation(movement, { lengthTolerance: 1e-9 })).toThrow('aritmética local y mundial')
}, 60_000)

it('queries the actual interpolated nested-document placement at the final stopped fraction', () => {
  const input = cancellingParent(10000.3), movement = path(input, [10040.3, 0, 0]), received: Vec3[] = []
  const real = placements.placeAssemblyShape
  const spy = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation((source, pose) => {
    received.push([...pose.translation]); return real(source, pose)
  })
  const checked = placements.placeAssemblyShapeChecked
  const scene = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    received.push([...pose.translation]); return checked(source, pose)
  })
  try {
    const result = traceAssemblyTranslation(movement), actual = expandAssemblyParts(movement.at(result.fraction))
    expect(result.status).toBe('stopped'); expect(received.at(-2)).toEqual(actual[0].worldPose.translation)
    expect(received.at(-1)).toEqual(actual[1].worldPose.translation)
    near(actual[0].worldPose.translation[0], 11.9, 5e-6)
  } finally { scene.mockRestore(); spy.mockRestore() }
}, 60_000)

it('uses actual native shape tolerances in the safety band and requested deflection in the real query', () => {
  const deflections: number[] = []
  const result = nativeFault('Assembly translation distance query or release failed.', owner => {
    if ('SetDeflection' in owner && typeof owner.SetDeflection === 'function') {
      const set = owner.SetDeflection.bind(owner)
      Object.defineProperty(owner, 'SetDeflection', { configurable: true, value: (value: number) => { deflections.push(value); set(value) } })
    }
  }, () => traceAssemblyTranslation(path(), { lengthTolerance: 1e-6 }))
  expect(result.status).toBe('stopped'); expect(result.blockingPair!.band).toBeGreaterThan(1.19e-6)
  expect(deflections).toHaveLength(result.queryCount); expect(deflections.every(value => value === 1e-6)).toBe(true)
}, 60_000)

it('rejects the observed tight native distance/point disagreement without widening deflection and releases every received owner', () => {
  type Sample = { deflection: number | null; value: number | null; points: number[][]; releases: number }
  const samples: Sample[] = []; let current: Sample | undefined
  const error = captured(() => nativeFault('Assembly translation distance query or release failed.', owner => {
    if ('SetDeflection' in owner && typeof owner.SetDeflection === 'function' && 'Value' in owner && typeof owner.Value === 'function') {
      const sample: Sample = { deflection: null, value: null, points: [], releases: 0 }; samples.push(sample); current = sample
      const set = owner.SetDeflection.bind(owner), value = owner.Value.bind(owner), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'SetDeflection', { configurable: true, value: (number: number) => { sample.deflection = number; return set(number) } })
      Object.defineProperty(owner, 'Value', { configurable: true, value: () => { const number = value(); sample.value = number; return number } })
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { sample.releases++; return remove() } })
    } else if (current && 'X' in owner && 'Y' in owner && 'Z' in owner
      && typeof owner.X === 'function' && typeof owner.Y === 'function' && typeof owner.Z === 'function') {
      const sample = current, coordinates = [NaN, NaN, NaN]; sample.points.push(coordinates)
      const reads = { X: owner.X.bind(owner), Y: owner.Y.bind(owner), Z: owner.Z.bind(owner) }
      // Observe only the X/Y/Z reads already made by production, after own().
      // Do not request extra points, supply coordinates or change their values.
      for (const [index, name] of (['X', 'Y', 'Z'] as const).entries()) {
        const read = reads[name]
        Object.defineProperty(owner, name, { configurable: true, value: () => { const value = read(); coordinates[index] = value; return value } })
      }
      const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { sample.releases++; return remove() } })
    }
  }, () => traceAssemblyTranslation(path(), { lengthTolerance: 1e-8 })))
  expect(error).toBeInstanceOf(Error); expect((error as Error).message).toMatch(/distancia BRep y sus puntos no concuerdan/)
  expect(samples.length).toBeGreaterThan(1)
  expect(samples.every(sample => sample.deflection === 1e-8 && sample.releases === 3 && sample.points.length === 2)).toBe(true)
  const last = samples.at(-1)!, pointSeparation = Math.hypot(...last.points[0].map((value, axis) => value - last.points[1][axis]))
  expect(Number.isFinite(last.value)).toBe(true); expect(Number.isFinite(pointSeparation)).toBe(true)
  expect(Math.abs(pointSeparation - last.value!)).toBeGreaterThan(1e-8)
  // Durable native observation for this original fixture/runtime, not a
  // general SDK precision claim or successful geometry supplied by the test.
  console.info('NATIVE_TRANSLATION_DISTANCE_REJECTION', JSON.stringify({ deflection: last.deflection,
    minimumDistance: last.value, pointSeparation, difference: Math.abs(pointSeparation - last.value!), queries: samples.length }))
}, 60_000)
