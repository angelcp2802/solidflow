import { expect, it } from 'vitest'
import { assemblyAnalysisBodyKey, validateAssemblyInterferenceOptions, MAX_ASSEMBLY_ANALYSIS_BODIES,
  MAX_ASSEMBLY_ANALYSIS_PAIRS, MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS, resolveAssemblyInterferenceScope,
  type AssemblyAnalysisBody, type AssemblyInterferenceOptions, type AssemblyInterferenceScope } from './assemblyInterference'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { validateAssemblyDocument, type AssemblyComponentReference, type AssemblyDocument } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'

// Original declaration/option fixtures only. These tests perform no native
// geometry query, classify no fabricated shape and issue no currentness proof.
function body(path = ['left', 'pin']): AssemblyAnalysisBody {
  return { component: { occurrencePath: path, definition: { id: 'original-pin', revision: 'r1' } },
    body: { bodyId: 'pin-body', sourceFeatureId: 'final-cut' }, componentName: 'Same component name', bodyName: 'Same body name' }
}
const options = (value: unknown) => validateAssemblyInterferenceOptions(value as Partial<AssemblyInterferenceOptions>)
const component = (path: string[], id = 'example-pin', revision = 'r1'): AssemblyComponentReference => ({ occurrencePath: path, definition: { id, revision } })
function scopeGraph(): AssemblyDocument {
  const root = createEmptyAssembly('Original scope declarations'), part = createAssemblyExample().definitions.find(value => value.id === 'example-pin')!
  part.revision = 'r1'
  const occurrence = (id: string, source = part.id) => ({ id, name: 'Same display name', definition: { id: source, revision: 'r1' },
    pose: identityRigidPose(), fixed: false, suppressed: false, visible: true })
  root.definitions = [part, { kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original repeated subassembly',
    createdAt: root.createdAt, updatedAt: root.updatedAt, occurrences: [occurrence('a'), occurrence('b')], mates: [] }]
  root.occurrences = [occurrence('left', 'sub'), occurrence('right', 'sub')]
  return validateAssemblyDocument(root)
}
function resolveScope(document: AssemblyDocument, scope: AssemblyInterferenceScope, includeHidden = true, treatSubassembliesAsComponents = false) {
  return resolveAssemblyInterferenceScope(document, validateAssemblyInterferenceOptions({ scope, includeHidden, treatSubassembliesAsComponents }))
}

it('returns independent default option snapshots in the declared physical units', () => {
  const first = validateAssemblyInterferenceOptions(), second = validateAssemblyInterferenceOptions()
  expect(first).toEqual({ clearance: 1, lengthTolerance: 1e-6, volumeTolerance: 1e-6, includeHidden: true, includeWithinComponent: false, treatSubassembliesAsComponents: false })
  expect(second).toEqual(first); expect(second).not.toBe(first)
  first.clearance = 99; first.includeHidden = false; first.includeWithinComponent = true
  expect(validateAssemblyInterferenceOptions()).toEqual(second)
})

it('overrides only explicitly supplied partial options without mutating the input', () => {
  const input = { clearance: 2.5, includeHidden: false }, before = { ...input }, result = validateAssemblyInterferenceOptions(input)
  expect(result).toEqual({ clearance: 2.5, lengthTolerance: 1e-6, volumeTolerance: 1e-6, includeHidden: false, includeWithinComponent: false, treatSubassembliesAsComponents: false })
  result.clearance = 3; expect(input).toEqual(before)
  expect(validateAssemblyInterferenceOptions(Object.create(null))).toEqual(validateAssemblyInterferenceOptions())
})

it('accepts zero clearance/volume threshold and arbitrarily small positive finite length tolerance', () => {
  const input = { clearance: 0, volumeTolerance: 0, lengthTolerance: Number.MIN_VALUE, includeHidden: false }
  expect(validateAssemblyInterferenceOptions(input)).toEqual({ ...input, includeWithinComponent: false, treatSubassembliesAsComponents: false })
  expect(validateAssemblyInterferenceOptions({ clearance: Number.MAX_VALUE }).clearance).toBe(Number.MAX_VALUE)
})

it('rejects negative, nonfinite, missing-valued or coerced clearance without invoking callbacks', () => {
  let calls = 0
  for (const clearance of [-Number.MIN_VALUE, NaN, Infinity, -Infinity, undefined, '1', 1n, () => { calls++; return 1 }]) {
    expect(() => options({ clearance })).toThrow()
  }
  expect(calls).toBe(0)
})

it('requires a strictly positive finite length tolerance', () => {
  for (const lengthTolerance of [0, -0, -1, NaN, Infinity, undefined, '0.01', null]) expect(() => options({ lengthTolerance })).toThrow()
})

it('requires a nonnegative finite volume tolerance even when clearance is zero', () => {
  for (const volumeTolerance of [-Number.MIN_VALUE, NaN, Infinity, -Infinity, undefined, '0', null]) {
    expect(() => options({ clearance: 0, volumeTolerance })).toThrow()
  }
})

it('does not coerce hidden-body inclusion from truthy values or boxed booleans', () => {
  for (const includeHidden of [undefined, 0, 1, 'true', null, new Boolean(false)]) expect(() => options({ includeHidden })).toThrow()
})

it('requires explicit boolean within-component policy and returns a detached normalized option', () => {
  for (const includeWithinComponent of [undefined, 0, 1, 'true', null, new Boolean(false)]) {
    expect(() => options({ includeWithinComponent })).toThrow()
  }
  const input = { includeWithinComponent: true }, result = validateAssemblyInterferenceOptions(input)
  expect(result.includeWithinComponent).toBe(true)
  result.includeWithinComponent = false
  expect(input.includeWithinComponent).toBe(true)
  expect(validateAssemblyInterferenceOptions({ includeWithinComponent: false }).includeWithinComponent).toBe(false)
})

it('rejects executable or hidden within-component policy without invoking accessors', () => {
  let calls = 0
  const getter = Object.defineProperty({}, 'includeWithinComponent', { enumerable: true, get() { calls++; return true } })
  const setter = Object.defineProperty({}, 'includeWithinComponent', { enumerable: true, set(_value) { calls++ } })
  const hidden = Object.defineProperty({}, 'includeWithinComponent', { value: true })
  for (const input of [getter, setter, hidden]) expect(() => options(input)).toThrow()
  expect(calls).toBe(0)
})

it('normalizes grouping to false and retains detached explicit grouped intent', () => {
  const scope: AssemblyInterferenceScope = { mode: 'all', selected: [], excluded: [] }
  const input = { treatSubassembliesAsComponents: true, scope }, before = structuredClone(input), result = validateAssemblyInterferenceOptions(input)
  expect(result.treatSubassembliesAsComponents).toBe(true); expect(result.scope).toEqual(scope)
  expect(validateAssemblyInterferenceOptions({ treatSubassembliesAsComponents: true }).treatSubassembliesAsComponents).toBe(true)
  result.treatSubassembliesAsComponents = false; result.scope!.excluded.push(component(['left'], 'sub'))
  expect(input).toEqual(before)
  expect(validateAssemblyInterferenceOptions({ treatSubassembliesAsComponents: false })).toEqual(validateAssemblyInterferenceOptions())
})

it('rejects nonboolean, executable or hidden grouping fields without invoking callbacks', () => {
  let calls = 0
  for (const treatSubassembliesAsComponents of [undefined, null, 0, 1, 'true', new Boolean(true), () => { calls++; return true }]) {
    expect(() => options({ treatSubassembliesAsComponents })).toThrow()
  }
  const getter = Object.defineProperty({}, 'treatSubassembliesAsComponents', { enumerable: true, get() { calls++; return true } })
  const setter = Object.defineProperty({}, 'treatSubassembliesAsComponents', { enumerable: true, set(_value) { calls++ } })
  const hidden = Object.defineProperty({}, 'treatSubassembliesAsComponents', { value: true })
  for (const input of [getter, setter, hidden]) expect(() => options(input)).toThrow()
  expect(calls).toBe(0)
})

it('retains grouped selection, crossing and exclusions without dropping either body flag or exact references', () => {
  for (const scope of [
    { mode: 'among-selected' as const, selected: [component(['left'], 'sub')], excluded: [] },
    { mode: 'selected-against-rest' as const, selected: [component(['left'], 'sub')], excluded: [] },
    { mode: 'all' as const, selected: [], excluded: [component(['left'], 'sub')] },
  ]) for (const includeWithinComponent of [false, true]) {
    const input = { treatSubassembliesAsComponents: true, includeWithinComponent, scope }, before = structuredClone(input)
    const result = validateAssemblyInterferenceOptions(input)
    expect(result).toMatchObject(input); expect(result.scope).not.toBe(input.scope)
    result.scope!.selected.push(component(['other'], 'sub')); result.scope!.excluded.push(component(['elsewhere'], 'sub'))
    expect(input).toEqual(before)
    expect(validateAssemblyInterferenceOptions({ ...input, treatSubassembliesAsComponents: false }).scope).toEqual(before.scope)
  }
  expect(validateAssemblyInterferenceOptions({ treatSubassembliesAsComponents: true, includeWithinComponent: true })).toMatchObject({ treatSubassembliesAsComponents: true, includeWithinComponent: true })
  expect(validateAssemblyInterferenceOptions({ treatSubassembliesAsComponents: false, includeWithinComponent: true }).includeWithinComponent).toBe(true)
})

it('validates every supplied grouped scope field without evaluating executable data', () => {
  let calls = 0
  const scope = Object.defineProperty({ mode: 'all', selected: [] }, 'excluded', { enumerable: true, get() { calls++; return [] } })
  expect(() => options({ treatSubassembliesAsComponents: true, scope })).toThrow()
  expect(() => options({ treatSubassembliesAsComponents: true, scope: { mode: 'all', selected: [], excluded: [component(['left'], 'sub')], extra: true } })).toThrow()
  expect(calls).toBe(0)
})

it('rejects nonrecord options and inherited executable policy', () => {
  for (const input of [null, [], 1, 'options', () => ({}), new Date(), Object.create({ clearance: 5 })]) {
    expect(() => options(input)).toThrow()
  }
})

it('rejects accessors, symbols, hidden/unknown fields and toJSON without executing them', () => {
  let calls = 0
  const getter = Object.defineProperty({}, 'clearance', { enumerable: true, get() { calls++; return 1 } })
  const setter = Object.defineProperty({}, 'clearance', { enumerable: true, set(_value) { calls++ } })
  const hidden = Object.defineProperty({}, 'clearance', { value: 1 })
  const symbol = { [Symbol('untrusted-policy')]: true }, callback = { toJSON() { calls++; return {} } }
  for (const input of [getter, setter, hidden, symbol, callback, { extra: true }]) expect(() => options(input)).toThrow()
  expect(calls).toBe(0)
})

it('rejects overflow of the finite clearance band before any native calculation', () => {
  expect(() => validateAssemblyInterferenceOptions({ clearance: Number.MAX_VALUE, lengthTolerance: Number.MAX_VALUE })).toThrow(/suma/)
  expect(validateAssemblyInterferenceOptions({ clearance: 2, lengthTolerance: .001, volumeTolerance: Number.MAX_VALUE }))
    .toEqual({ clearance: 2, lengthTolerance: .001, volumeTolerance: Number.MAX_VALUE, includeHidden: true, includeWithinComponent: false, treatSubassembliesAsComponents: false })
})

it('builds detached scoped identity from data while ignoring duplicate or changed display names', () => {
  const input = body(), before = structuredClone(input), original = assemblyAnalysisBodyKey(input)
  expect(JSON.parse(original)).toEqual([['left', 'pin'], 'original-pin', 'r1', ['pin-body', 'final-cut']])
  expect(assemblyAnalysisBodyKey(structuredClone(input))).toBe(original)
  input.componentName = 'Renamed occurrence'; input.bodyName = 'Renamed body'
  expect(assemblyAnalysisBodyKey(input)).toBe(original)
  expect(before.component).toEqual(input.component)
})

it('distinguishes complete nested occurrence paths and JSON tuple boundaries rather than names or delimiters', () => {
  const values = [body(['left', 'pin']), body(['right', 'pin']), body(['left/pin']), body(['left', 'p/in']), body(['left|pin'])]
  expect(new Set(values.map(assemblyAnalysisBodyKey)).size).toBe(values.length)
  expect(values.every(value => value.componentName === values[0].componentName && value.bodyName === values[0].bodyName)).toBe(true)
})

it('distinguishes exact part revision, explicit body state and legacy null aggregate', () => {
  const original = body(), revision = body(), state = body(), distinctBody = body(), legacy = body()
  revision.component.definition.revision = 'r2'; state.body!.sourceFeatureId = 'other-cut'; distinctBody.body!.bodyId = 'second-body'; legacy.body = null
  expect(new Set([original, revision, state, distinctBody, legacy].map(assemblyAnalysisBodyKey)).size).toBe(5)
  expect(JSON.parse(assemblyAnalysisBodyKey(legacy)).at(-1)).toBeNull()
})

it('rejects executable or malformed identity fields without reading getters or invoking serialization callbacks', () => {
  let calls = 0
  const top = Object.defineProperty(body(), 'component', { enumerable: true, get() { calls++; return body().component } })
  const nested = body(); Object.defineProperty(nested.body!, 'sourceFeatureId', { enumerable: true, get() { calls++; return 'executed' } })
  const callback = Object.assign(body(), { toJSON() { calls++; return body() } })
  const symbol = Object.assign(body(), { [Symbol('untrusted-identity')]: true })
  const invalid = body(); invalid.component.definition.id = 'broken\u0000id'
  for (const value of [top, nested, callback, symbol, invalid]) expect(() => assemblyAnalysisBodyKey(value)).toThrow()
  expect(calls).toBe(0)
})

it('uses the existing nonempty bounded dense occurrence path grammar without claiming the declaration exists', () => {
  const full = body(Array.from({ length: 32 }, (_, index) => 'original-' + index))
  expect(JSON.parse(assemblyAnalysisBodyKey(full))[0]).toHaveLength(32)
  expect(() => assemblyAnalysisBodyKey(body([]))).toThrow()
  expect(() => assemblyAnalysisBodyKey(body([...full.component.occurrencePath, 'too-deep']))).toThrow()
  const sparse = body(); sparse.component.occurrencePath = Array(2)
  expect(() => assemblyAnalysisBodyKey(sparse)).toThrow()
  const unattested = body(['unknown-occurrence']); unattested.component.definition.revision = 'retired-label'
  expect(JSON.parse(assemblyAnalysisBodyKey(unattested))[0]).toEqual(['unknown-occurrence'])
})

it('keeps the pair admission cap consistent with all unordered pairs at the maximum body admission', () => {
  expect(MAX_ASSEMBLY_ANALYSIS_PAIRS).toBe(MAX_ASSEMBLY_ANALYSIS_BODIES * (MAX_ASSEMBLY_ANALYSIS_BODIES - 1) / 2)
  expect([MAX_ASSEMBLY_ANALYSIS_BODIES, MAX_ASSEMBLY_ANALYSIS_PAIRS, MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS]
    .every(value => Number.isSafeInteger(value) && value > 0)).toBe(true)
})

it('retains omitted default scope and returns detached exact scope references when supplied', () => {
  const input: AssemblyInterferenceScope = { mode: 'among-selected', selected: [component(['left', 'a'])], excluded: [] }
  const before = structuredClone(input), result = validateAssemblyInterferenceOptions({ scope: input })
  expect(Object.hasOwn(validateAssemblyInterferenceOptions(), 'scope')).toBe(false)
  expect(result.scope).toEqual(input); expect(result.scope).not.toBe(input)
  result.scope!.selected[0].occurrencePath[0] = 'changed'; result.scope!.selected[0].definition.revision = 'changed'
  expect(input).toEqual(before)
})

it('requires explicit complete scope policy, nonempty selection for selected modes and empty selection for all', () => {
  for (const scope of [undefined, null, {}, { mode: 'all', selected: [] }, { mode: 'unknown', selected: [], excluded: [] },
    { mode: 'all', selected: [component(['a'])], excluded: [] },
    { mode: 'among-selected', selected: [], excluded: [] }, { mode: 'selected-against-rest', selected: [], excluded: [] }]) {
    expect(() => options({ scope })).toThrow()
  }
  expect(options({ scope: { mode: 'all', selected: [], excluded: [component(['a'])] } }).scope?.excluded).toHaveLength(1)
})

it('rejects sparse, overbudget, extra-field and accessor scope lists without invoking executable input', () => {
  let calls = 0
  const getter = Object.defineProperty([component(['a'])], '0', { enumerable: true, get() { calls++; return component(['a']) } })
  const extra = Object.assign([component(['a'])], { extra: true })
  const symbol = Object.assign([component(['a'])], { [Symbol('extra')]: true })
  const hidden = Object.defineProperty([component(['a'])], '0', { value: component(['a']), enumerable: false })
  for (const selected of [Array(1), getter, extra, symbol, hidden, Array.from({ length: 4097 }, (_, i) => component(['a' + i]))]) {
    expect(() => options({ scope: { mode: 'among-selected', selected, excluded: [] } })).toThrow()
  }
  expect(calls).toBe(0)
})

it('rejects malformed exact component references and duplicates without inspecting getters', () => {
  let calls = 0
  const getter = Object.defineProperty(component(['a']), 'definition', { enumerable: true, get() { calls++; return { id: 'pin', revision: 'r1' } } })
  const inputs = [getter, component([]), component(['a'], 'pin', ''), { ...component(['a']), extra: 1 },
    { occurrencePath: ['a'], definition: { id: 'pin', revision: 'r1', name: 'not identity' } }]
  for (const value of inputs) expect(() => options({ scope: { mode: 'among-selected', selected: [value], excluded: [] } })).toThrow()
  expect(() => options({ scope: { mode: 'among-selected', selected: [component(['a']), component(['a'])], excluded: [] } })).toThrow('repite')
  expect(calls).toBe(0)
})

it.each([false, true])('resolves reused subassembly selections to exact active leaf namespaces with exclusions dominating, grouped=%s', grouped => {
  const document = scopeGraph(), before = structuredClone(document)
  const result = resolveScope(document, { mode: 'among-selected', selected: [component(['left'], 'sub'), component(['left', 'a'])], excluded: [component(['left', 'b'])] }, true, grouped)
  expect(result).toEqual({ mode: 'among-selected', selectedLeafPaths: [['left', 'a'], ['left', 'b']], excludedLeafPaths: [['left', 'b']], eligibleLeafPaths: [['left', 'a']] })
  expect(document).toEqual(before); result.eligibleLeafPaths[0][0] = 'outside mutation'; expect(document).toEqual(before)
})

it.each([false, true])('validates suppressed selections against the complete graph but counts only active leaves before hidden filtering, grouped=%s', grouped => {
  const document = scopeGraph(); document.occurrences[0].visible = false; document.occurrences[1].suppressed = true
  const policy: AssemblyInterferenceScope = { mode: 'selected-against-rest', selected: [component(['right'], 'sub'), component(['left', 'a'])], excluded: [component(['left'], 'sub')] }
  expect(resolveScope(document, policy, false, grouped)).toEqual({ mode: policy.mode, selectedLeafPaths: [['left', 'a']], excludedLeafPaths: [['left', 'a'], ['left', 'b']], eligibleLeafPaths: [] })
  expect(resolveScope(document, { mode: 'all', selected: [], excluded: [] }, false, grouped).eligibleLeafPaths).toEqual([])
  expect(resolveScope(document, { mode: 'all', selected: [], excluded: [] }, true, grouped).eligibleLeafPaths).toEqual([['left', 'a'], ['left', 'b']])
})

it.each([false, true])('rejects stale paths, paths through parts and mismatched tuples even when excluded or suppressed, grouped=%s', grouped => {
  const document = scopeGraph(); document.occurrences[0].suppressed = true
  for (const reference of [component(['left'], 'sub', 'wrong-revision'), component(['missing']), component(['left', 'a', 'child']), component(['left', 'a'], 'other-pin')]) {
    expect(() => resolveScope(document, { mode: 'all', selected: [], excluded: [reference] }, true, grouped)).toThrow()
  }
  expect(resolveScope(document, { mode: 'among-selected', selected: [component(['left'], 'sub')], excluded: [] }, true, grouped).eligibleLeafPaths).toEqual([])
})
