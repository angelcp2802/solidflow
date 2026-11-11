import { expect, it, vi } from 'vitest'
import { MAX_ASSEMBLY_TRANSLATION_QUERIES, prepareAssemblyTranslationPath,
  validateAssemblyTranslationRequest, validateAssemblyTranslationStopOptions,
  type AssemblyTranslationRequest, type AssemblyTranslationStopOptions } from './assemblyTranslation'
import { expandAssemblyParts, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { validateDocument } from './document'
import { identityRigidPose, type RigidPose } from './rigidPose'

// Original declaration-only 2×3×4 extrusion and reused hierarchy, in mm.
// A=Rz90+[10,20,30], B=Rz180+[-10,0,4], leaf=Rx90+[1,2,3].
// Independent Cartesian starts: A/leaf=[8,21,33], B/leaf=[-11,-2,7].
// Root A delta [2,4,6] plus leaf LOCAL delta [3,5,7] yields WORLD
// A/leaf delta [-3,7,13], B/leaf delta [-3,-5,7]. These are not BRep proofs.
const date = '2026-10-15T00:00:00.000Z', s = Math.SQRT1_2
const partRef = { id: 'translation-part', revision: 'p1' }, sharedRef = { id: 'translation-shared', revision: 'a1' }
const dormantRef = { id: 'translation-dormant', revision: 'd1' }
function occurrence(id: string, definition = partRef, pose = identityRigidPose()): AssemblyOccurrence {
  return { id, name: 'Original occurrence', definition: { ...definition }, pose, fixed: false, visible: true, suppressed: false }
}
function component(path = ['A', 'leaf'], definition = partRef): AssemblyComponentReference {
  return { occurrencePath: [...path], definition: { ...definition } }
}
function document(): AssemblyDocument {
  const leaf = occurrence('leaf', partRef, { translation: [1, 2, 3], rotation: [s, 0, 0, s] })
  const suppressed = occurrence('own-suppressed'); suppressed.suppressed = true
  const shared: EmbeddedAssemblyDefinition = { kind: 'assembly', ...sharedRef, name: 'Original shared scope', createdAt: date,
    updatedAt: date, occurrences: [leaf, suppressed], mates: [{ id: 'plane', name: 'Original declared plane', type: 'coincident',
      suppressed: false, alignment: 'aligned', first: { kind: 'principal-plane', component: component(['leaf']), plane: 'XY' },
      second: { kind: 'principal-plane', component: null, plane: 'XY' } }] }
  const dormant: EmbeddedAssemblyDefinition = { kind: 'assembly', ...dormantRef, name: 'Original unused scope', createdAt: date,
    updatedAt: date, occurrences: [occurrence('unused')], mates: [] }
  const a = occurrence('A', sharedRef, { translation: [10, 20, 30], rotation: [0, 0, s, s] })
  const b = occurrence('B', sharedRef, { translation: [-10, 0, 4], rotation: [0, 0, 1, 0] })
  const inactive = occurrence('inactive', sharedRef); inactive.suppressed = true
  const hidden = occurrence('hidden'); hidden.visible = false; hidden.fixed = true
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'translation-root', revision: 'r1', name: 'Original translation graph',
    units: 'mm', createdAt: date, updatedAt: date, definitions: [{ kind: 'part', ...partRef,
      document: validateDocument({ version: 1, id: partRef.id, name: 'Original box', units: 'mm', createdAt: date, updatedAt: date,
        features: [{ id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
          profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
        { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false }] }) },
    shared, dormant], occurrences: [a, b, inactive, hidden], mates: [] })
}
function scope(input: AssemblyDocument, ref: AssemblyDefinitionReference = sharedRef): EmbeddedAssemblyDefinition {
  const result = input.definitions.find(value => value.id === ref.id && value.revision === ref.revision)
  if (!result || result.kind !== 'assembly') throw new Error('Original fixture scope missing')
  return result
}
function target(input: AssemblyDocument): AssemblyDocument {
  const result = structuredClone(input)
  result.occurrences[0].pose.translation = [12, 24, 36]
  scope(result).occurrences[0].pose.translation = [4, 7, 10]
  return result
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-12): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, axis) => expect(Math.abs(value - expected[axis])).toBeLessThan(tolerance))
}
function request(): AssemblyTranslationRequest { return { component: component(), translation: [50, 60, 70] } }
function options(value: unknown) { return validateAssemblyTranslationStopOptions(value as Partial<AssemblyTranslationStopOptions>) }

it('validates a detached absolute WORLD destination without interpreting it as a displacement', () => {
  const input = request(), checked = validateAssemblyTranslationRequest(input)
  expect(checked).toEqual(input); expect(checked).not.toBe(input)
  input.translation[0] = 999; input.component.occurrencePath[0] = 'caller'; input.component.definition.revision = 'caller'
  expect(checked.translation).toEqual([50, 60, 70]); expect(checked.component).toEqual(component())
  expect(checked).not.toHaveProperty('token'); expect(checked).not.toHaveProperty('native')
})

it('checks request identity syntax without inventing graph or native acceptance', () => {
  expect(validateAssemblyTranslationRequest({ component: component(['not-current']), translation: [Number.MAX_VALUE, 0, 0] }).translation[0])
    .toBe(Number.MAX_VALUE)
  for (const value of [{ component: component([]), translation: [0, 0, 0] }, { component: component(), translation: [NaN, 0, 0] },
    { component: component(), translation: [Infinity, 0, 0] }, { component: component(), translation: [0, 0] },
    { component: component(), translation: ['0', 0, 0] }]) expect(() => validateAssemblyTranslationRequest(value)).toThrow()
})

it('rejects unknown, hidden, symbolic, executable and nonplain request fields', () => {
  const serializer = vi.fn(), hidden = request(); Object.defineProperty(hidden, 'extra', { value: true })
  for (const value of [null, undefined, [], {}, { component: component() }, { ...request(), extra: 1 },
    { ...request(), toJSON: serializer }, { ...request(), [Symbol('extra')]: 1 }, hidden,
    Object.assign(Object.create({ inherited: true }), request())]) expect(() => validateAssemblyTranslationRequest(value)).toThrow()
  expect(serializer).not.toHaveBeenCalled()
})

it('rejects request, nested identity and tuple getters without invoking them', () => {
  for (const name of ['component', 'translation', 'definition', 'occurrencePath', 'revision', 'coordinate']) {
    const input = request(), getter = vi.fn(() => { throw new Error('Accessor must not execute') })
    const owner = name === 'component' || name === 'translation' ? input
      : name === 'definition' || name === 'occurrencePath' ? input.component
        : name === 'revision' ? input.component.definition : input.translation
    Object.defineProperty(owner, name === 'coordinate' ? '0' : name, { get: getter, enumerable: true })
    expect(() => validateAssemblyTranslationRequest(input)).toThrow(); expect(getter).not.toHaveBeenCalled()
  }
})

it('rejects sparse, extended and nonplain request arrays while accepting null-prototype records', () => {
  for (const name of ['path', 'translation']) {
    const sparse = request(), array = name === 'path' ? sparse.component.occurrencePath : sparse.translation
    Reflect.deleteProperty(array, '0'); expect(() => validateAssemblyTranslationRequest(sparse)).toThrow()
    const extended = request(), extra = name === 'path' ? extended.component.occurrencePath : extended.translation
    Object.defineProperty(extra, 'extra', { value: 1, enumerable: true }); expect(() => validateAssemblyTranslationRequest(extended)).toThrow()
    const inherited = request(), changed = name === 'path' ? inherited.component.occurrencePath : inherited.translation
    Object.setPrototypeOf(changed, { inherited: true }); expect(() => validateAssemblyTranslationRequest(inherited)).toThrow()
  }
  const input = request(); [input, input.component, input.component.definition].forEach(value => Object.setPrototypeOf(value, null))
  expect(validateAssemblyTranslationRequest(input)).toEqual(request())
})

it('uses explicit defaults and a bounded query budget without imposing a coordinate cap', () => {
  expect(validateAssemblyTranslationStopOptions()).toEqual({ clearance: 0, lengthTolerance: 1e-6, maxQueries: 1024 })
  expect(MAX_ASSEMBLY_TRANSLATION_QUERIES).toBe(8192)
  expect(options({ clearance: 3, maxQueries: 8192 })).toEqual({ clearance: 3, lengthTolerance: 1e-6, maxQueries: 8192 })
  expect(options({ lengthTolerance: Number.MIN_VALUE, maxQueries: 1 }).lengthTolerance).toBe(Number.MIN_VALUE)
  const input = { clearance: 2 }, result = options(input); input.clearance = 9; expect(result.clearance).toBe(2)
})

it('rejects invalid options, nonfinite safety sums and unbounded query requests', () => {
  for (const value of [null, [], { extra: 1 }, { clearance: -1 }, { clearance: NaN }, { clearance: Infinity },
    { lengthTolerance: 0 }, { lengthTolerance: -1 }, { lengthTolerance: '1e-6' },
    { clearance: Number.MAX_VALUE, lengthTolerance: Number.MAX_VALUE }, { maxQueries: 0 },
    { maxQueries: 8193 }, { maxQueries: 2.5 }, { maxQueries: Infinity }, { maxQueries: undefined }]) expect(() => options(value)).toThrow()
})

it('never calls options accessors or serializers and rejects hidden, symbolic and inherited fields', () => {
  const getter = vi.fn(() => 1), access = {}; Object.defineProperty(access, 'maxQueries', { get: getter, enumerable: true })
  const hidden = {}; Object.defineProperty(hidden, 'clearance', { value: 1 })
  const serializer = vi.fn()
  for (const value of [access, hidden, { [Symbol('extra')]: 1 }, { toJSON: serializer }, Object.create({ clearance: 1 })]) {
    expect(() => options(value)).toThrow()
  }
  expect(getter).not.toHaveBeenCalled(); expect(serializer).not.toHaveBeenCalled()
  expect(options(Object.create(null))).toEqual(validateAssemblyTranslationStopOptions())
})

it('derives constant WORLD deltas from independent Cartesian parent and local translations', () => {
  const input = document(), path = prepareAssemblyTranslationPath(input, target(input))
  expect(path.leaves.map(value => value.component.occurrencePath)).toEqual([['A', 'leaf'], ['B', 'leaf'], ['hidden']])
  near(path.leaves[0].start.translation, [8, 21, 33]); near(path.leaves[1].start.translation, [-11, -2, 7])
  near(path.leaves[0].delta, [-3, 7, 13]); near(path.leaves[1].delta, [-3, -5, 7]); near(path.leaves[2].delta, [0, 0, 0])
  expect(path.leaves.every(value => value.component.definition.id === partRef.id && value.component.definition.revision === partRef.revision)).toBe(true)
})

it('interpolates the independent WORLD affine positions at several fractions and preserves rotations', () => {
  const input = document(), path = prepareAssemblyTranslationPath(input, target(input))
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const leaves = expandAssemblyParts(path.at(fraction))
    near(leaves[0].worldPose.translation, [8 - 3 * fraction, 21 + 7 * fraction, 33 + 13 * fraction])
    near(leaves[1].worldPose.translation, [-11 - 3 * fraction, -2 - 5 * fraction, 7 + 7 * fraction])
    expect(leaves[0].occurrence.pose.rotation).toEqual([s, 0, 0, s])
    expect(path.at(fraction).occurrences[0].pose.rotation).toEqual([0, 0, s, s])
  }
})

it('includes hidden active parts and omits own or inherited suppression and dormant definitions', () => {
  const input = document(); input.occurrences[0].visible = false
  const path = prepareAssemblyTranslationPath(input, target(input))
  expect(path.leaves.map(value => value.component.occurrencePath)).toEqual([['A', 'leaf'], ['B', 'leaf'], ['hidden']])
  expect(path.target.occurrences[0].visible).toBe(false)
  expect(path.target.occurrences[2]).toEqual(input.occurrences[2]); expect(scope(path.target, dormantRef)).toEqual(scope(input, dormantRef))
})

it('allows a shared active declaration even when another expansion is under a suppressed root owner', () => {
  const input = document(), path = prepareAssemblyTranslationPath(input, target(input))
  expect(scope(path.target).occurrences[0].pose.translation).toEqual([4, 7, 10])
  expect(path.target.occurrences[2].suppressed).toBe(true)
  expect(expandAssemblyParts(path.target, true).filter(value => value.path[0] === 'inactive')[0].occurrence.pose.translation).toEqual([4, 7, 10])
  expect(path.leaves.some(value => value.component.occurrencePath[0] === 'inactive')).toBe(false)
})

it('rejects translation or quaternion drift in own-suppressed and dormant declarations', () => {
  for (const name of ['root', 'shared', 'dormant']) for (const field of ['translation', 'rotation']) {
    const input = document(), next = structuredClone(input)
    const occurrence = name === 'root' ? next.occurrences[2] : scope(next, name === 'dormant' ? dormantRef : sharedRef).occurrences[name === 'shared' ? 1 : 0]
    if (field === 'translation') occurrence.pose.translation[0] += 1
    else occurrence.pose.rotation = occurrence.pose.rotation.map(value => -value) as RigidPose['rotation']
    expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/suprimida|no utilizada/)
  }
})

it('rejects pose drift in a scope reached only through suppressed expansions', () => {
  const input = document(); input.occurrences[0].suppressed = true; input.occurrences[1].suppressed = true
  const next = structuredClone(input); scope(next).occurrences[0].pose.translation[2] += 1
  expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/suprimida|no utilizada/)
})

it('forbids fixed local translation changes but lets a locally fixed child follow its free parent', () => {
  const input = document(); scope(input).occurrences[0].fixed = true
  const next = structuredClone(input); next.occurrences[0].pose.translation[0] += 5
  const path = prepareAssemblyTranslationPath(input, next)
  near(path.leaves[0].delta, [5, 0, 0]); near(path.leaves[1].delta, [0, 0, 0])
  expect(scope(path.target).occurrences[0].fixed).toBe(true)
  scope(next).occurrences[0].pose.translation[0] += 1
  expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/fijada/)
})

it('rejects movement of a fixed root owner even when its descendants are free', () => {
  const input = document(); input.occurrences[0].fixed = true
  const next = structuredClone(input); next.occurrences[0].pose.translation[0] += 1
  expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/fijada/)
})

it('restores the exact original active quaternion including q sign and accepted near-unit values', () => {
  const input = document(); input.occurrences[3].pose.rotation = [0, 0, 0, 1 + 5e-11]
  const next = structuredClone(input)
  next.occurrences[0].pose.rotation = [0, 0, -s, -s]
  next.occurrences[3].pose.rotation = [0, 0, 0, -1]
  const before = structuredClone(next), path = prepareAssemblyTranslationPath(input, next)
  expect(path.target.occurrences[0].pose.rotation).toEqual([0, 0, s, s])
  expect(path.target.occurrences[3].pose.rotation).toEqual([0, 0, 0, 1 + 5e-11])
  expect(path.at(0.5).occurrences[3].pose.rotation).toEqual(input.occurrences[3].pose.rotation)
  expect(next).toEqual(before)
})

it('restores an active angular difference within policy instead of interpolating any rotation', () => {
  const input = document(), next = structuredClone(input), theta = 5e-9
  next.occurrences[3].pose.rotation = [0, 0, Math.sin(theta / 2), Math.cos(theta / 2)]
  const path = prepareAssemblyTranslationPath(input, next)
  expect(path.target.occurrences[3].pose.rotation).toEqual([0, 0, 0, 1])
  expect(path.at(0.25).occurrences[3].pose.rotation).toEqual([0, 0, 0, 1])
  expect(next.occurrences[3].pose.rotation[2]).toBeGreaterThan(0)
})

it('rejects excessive rotations at root or nested declarations without relaxing policy', () => {
  for (const nested of [false, true]) {
    const input = document(), next = structuredClone(input), occurrence = nested ? scope(next).occurrences[0] : next.occurrences[0]
    occurrence.pose.rotation = [0, 0, 0, 1]
    expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/rotación/)
  }
  const input = document(), next = structuredClone(input); next.occurrences[3].pose.rotation = [0, 0, Math.sin(1e-7), Math.cos(1e-7)]
  expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/rotación/)
})

it('checks an explicit angular policy in radians and rejects invalid tolerances', () => {
  const input = document(), next = structuredClone(input); next.occurrences[3].pose.rotation = [0, 0, Math.sin(1e-6), Math.cos(1e-6)]
  expect(prepareAssemblyTranslationPath(input, next, 3e-6).target.occurrences[3].pose.rotation).toEqual([0, 0, 0, 1])
  for (const tolerance of [-1, NaN, Infinity, Math.PI]) expect(() => prepareAssemblyTranslationPath(input, input, tolerance)).toThrow()
  expect(prepareAssemblyTranslationPath(input, input, 0).leaves).toHaveLength(3)
})

it('preserves every metadata, definition, state and mate field and rejects edits outside poses', () => {
  const changes: ((next: AssemblyDocument) => void)[] = [next => { next.name = 'changed' }, next => { next.updatedAt = '2026-10-16T00:00:00.000Z' },
    next => { next.revision = 'r2' }, next => { next.occurrences[0].name = 'changed' }, next => { next.occurrences[0].visible = false },
    next => { next.occurrences[0].fixed = true }, next => { next.occurrences[0].suppressed = true },
    next => { scope(next).name = 'changed' }, next => { scope(next).mates[0].suppressed = true },
    next => { scope(next).mates[0].name = 'changed' }, next => { next.occurrences.reverse() }, next => { next.definitions.reverse() },
    next => { next.occurrences.push(occurrence('new')) }, next => { next.occurrences.pop() },
    next => { const part = next.definitions[0]; if (part.kind === 'part') part.document.name = 'changed' }]
  for (const change of changes) { const input = document(), next = structuredClone(input); change(next)
    expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/grafo|datos|poses/)
  }
})

it('preserves source bytes, metadata, declared mates and definitions apart from accepted poses', () => {
  const input = document(), before = serializeAssemblyDocument(input), next = target(input), nextBefore = serializeAssemblyDocument(next)
  const path = prepareAssemblyTranslationPath(input, next)
  expect(serializeAssemblyDocument(input)).toBe(before); expect(serializeAssemblyDocument(next)).toBe(nextBefore)
  expect(path.base).toEqual(input); expect(path.target.updatedAt).toBe(date)
  expect(scope(path.target).mates).toEqual(scope(input).mates)
  expect(path.target.definitions[0]).toEqual(input.definitions[0]); expect(scope(path.target, dormantRef)).toEqual(scope(input, dormantRef))
  expect(path).not.toHaveProperty('token'); expect(path).not.toHaveProperty('native'); expect(path).not.toHaveProperty('solver')
})

it('isolates interpolation from every returned DTO and subsequent caller mutation', () => {
  const input = document(), next = target(input), path = prepareAssemblyTranslationPath(input, next), expected = path.at(0.5)
  input.occurrences[0].pose.translation[0] = 999; next.occurrences[0].pose.translation[0] = 998
  path.base.occurrences[0].pose.translation[0] = 997; path.target.occurrences[0].pose.translation[0] = 996
  path.leaves[0].start.translation[0] = 995; path.leaves[0].delta[0] = 994; path.leaves[0].component.occurrencePath[0] = 'caller'
  const first = path.at(0.5); expect(first).toEqual(expected); first.occurrences[0].pose.translation[0] = 993
  expect(path.at(0.5)).toEqual(expected); expect(path.at(0).occurrences[0].pose.translation[0]).toBe(10)
  expect(path.at(1).occurrences[0].pose.translation[0]).toBe(12)
})

it('returns exact detached endpoints and fresh zero-motion paths', () => {
  const input = document(), path = prepareAssemblyTranslationPath(input, input)
  expect(path.at(0)).toEqual(input); expect(path.at(1)).toEqual(input); expect(path.at(0.5)).toEqual(input)
  expect(path.at(0)).not.toBe(path.base); expect(path.at(1)).not.toBe(path.target)
  expect(path.leaves.every(value => value.delta.every(coordinate => coordinate === 0))).toBe(true)
  const empty = document(); empty.occurrences = []; expect(prepareAssemblyTranslationPath(empty, empty).leaves).toEqual([])
})

it('rejects invalid fractions without coercion or clamping', () => {
  const input = document(), path = prepareAssemblyTranslationPath(input, target(input))
  for (const fraction of [-Number.MIN_VALUE, 1.0000001, NaN, Infinity, '0.5', null]) {
    expect(() => path.at(fraction as number)).toThrow()
  }
})

it('rejects executable or malformed source and target graphs before interpolation', () => {
  const getter = vi.fn(() => []), input = document(); Object.defineProperty(input, 'definitions', { get: getter, enumerable: true })
  expect(() => prepareAssemblyTranslationPath(input, document())).toThrow(); expect(getter).not.toHaveBeenCalled()
  const next = document(); scope(next, dormantRef).occurrences[0].definition.revision = 'missing'
  expect(() => prepareAssemblyTranslationPath(document(), next)).toThrow()
  const accessorTarget = document(); Object.defineProperty(accessorTarget.occurrences[0].pose.translation, '0', { get: getter, enumerable: true })
  expect(() => prepareAssemblyTranslationPath(document(), accessorTarget)).toThrow(); expect(getter).not.toHaveBeenCalled()
})

it('rejects nonfinite local displacement and composed WORLD arithmetic', () => {
  const input = document(); input.occurrences[0].pose.translation = [-1e308, 0, 0]
  const next = structuredClone(input); next.occurrences[0].pose.translation = [1e308, 0, 0]
  expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/finita/)
  const overflow = document(); overflow.occurrences[0].pose = { translation: [1e308, 0, 0], rotation: [0, 0, 0, 1] }
  scope(overflow).occurrences[0].pose.translation = [1e308, 0, 0]
  expect(() => prepareAssemblyTranslationPath(overflow, overflow)).toThrow(/non-finite|finito/)
})

it('rejects a real local displacement swallowed by a large WORLD endpoint coordinate', () => {
  const input = document(); input.occurrences[0].pose = { translation: [1e16, 0, 0], rotation: [0, 0, 0, 1] }
  scope(input).occurrences[0].pose.translation = [0, 0, 0]
  const next = structuredClone(input); scope(next).occurrences[0].pose.translation = [1, 0, 0]
  expect(() => prepareAssemblyTranslationPath(input, next)).toThrow(/pierde|representable/)
})

it('keeps a representable motion at large coordinates without claiming native precision', () => {
  const input = document(); input.occurrences[0].pose = { translation: [1e16, 0, 0], rotation: [0, 0, 0, 1] }
  scope(input).occurrences[0].pose.translation = [0, 0, 0]
  const next = structuredClone(input); scope(next).occurrences[0].pose.translation = [4, 0, 0]
  const path = prepareAssemblyTranslationPath(input, next)
  near(path.leaves[0].delta, [4, 0, 0]); expect(path.leaves[0].start.translation[0]).toBe(1e16)
  expect(path.arithmeticMagnitude).toBeGreaterThanOrEqual(2e16)
  expect(expandAssemblyParts(path.at(1))[0].worldPose.translation[0]).toBe(1e16 + 4)
  expect(path).not.toHaveProperty('lengthTolerance')
})

it('exposes large local cancellation even with small, representable WORLD endpoints', () => {
  const input = document(); input.occurrences[0].pose = { translation: [-1e16, 0, 0], rotation: [0, 0, 0, 1] }
  scope(input).occurrences[0].pose.translation = [1e16, 0, 0]
  const next = structuredClone(input)
  next.occurrences[0].pose.translation[0] += 4; scope(next).occurrences[0].pose.translation[0] += 4
  const path = prepareAssemblyTranslationPath(input, next)
  expect(path.leaves[0].start.translation).toEqual([0, 0, 0]); near(path.leaves[0].delta, [8, 0, 0])
  expect(expandAssemblyParts(path.at(1))[0].worldPose.translation).toEqual([8, 0, 0])
  // At .25, each local increment is 1, below the Float64 spacing at 1e16.
  // Both round away although the independently affine WORLD position is 2.
  expect(expandAssemblyParts(path.at(.25))[0].worldPose.translation).toEqual([0, 0, 0])
  expect(path.arithmeticMagnitude).toBeGreaterThanOrEqual(4e16)
  expect(128 * Number.EPSILON * path.arithmeticMagnitude).toBeGreaterThan(1e-6)
  // No length policy is accepted here: native tracing must reject this scale
  // using its own requested tolerance, rather than snap or alter the document.
  expect(path.base).toEqual(input); expect(path.target).toEqual(next)
})

it('permits opposing local motions that cancel in WORLD without inventing a moving leaf', () => {
  const input = document(), next = structuredClone(input)
  next.occurrences[0].pose.translation[1] += 3; scope(next).occurrences[0].pose.translation[0] -= 3
  const path = prepareAssemblyTranslationPath(input, next)
  near(path.leaves[0].delta, [0, 0, 0]); near(path.leaves[1].delta, [3, 0, 0])
  near(expandAssemblyParts(path.at(0.5))[0].worldPose.translation, [8, 21, 33])
})
