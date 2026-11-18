import { expect, it } from 'vitest'
import circleOriginal from '../cad/fixtures/assembly-profile-center-original.json'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from './assemblyConfigurationCore'
import { validateAssemblyDocument, serializeAssemblyDocument, MAX_ASSEMBLY_BYTES, type AssemblyMate, type AssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'
import { createDocument } from './document'
import { createStepSource } from './stepSource'
import {
  validateAssemblyConfigurationState, effectiveAssemblyConfigurationMate, updateAssemblyConfigurationState,
  materializeAssemblyConfigurationNamedState, MAX_ASSEMBLY_CONFIGURATION_STATES,
  type AssemblyConfigurationStateEntry, type AssemblyConfigurationStateCatalog, type AssemblyConfigurationMateState,
} from './assemblyConfigurationState'

// Original GPL-3.0-only core A/B prisms and tracked R2x3 circular prism.
// These are pure declaration tests: the explicitly UNATTESTED topology keys
// below confer no native membership, capture, metrology or Apply authority.
// Multi-turn values are independent authored scalars, never solver outputs.
const TAU = 2 * Math.PI
const families = ['concentric', 'lock', 'gear', 'screw', 'rack-pinion'] as const
type Family = typeof families[number]
const owner = { id: 'configuration-S', revision: 's-r1' }
const ids = { concentric: 'capture-concentric', lock: 'capture-lock', gear: 'capture-gear', screw: 'capture-screw', 'rack-pinion': 'capture-rack' }
function node(document: AssemblyDocument): EmbeddedAssemblyDefinition {
  const result = document.definitions.find(d => d.id === owner.id && d.revision === owner.revision)
  if (result?.kind !== 'assembly') throw Error('Original reused S required')
  return result
}
function fixture() {
  const input = assemblyConfigurationCoreFixture(), s = node(input.document)
  const pin = validateAssemblyDocument(circleOriginal).definitions.find(d => d.id === 'original-profile-circle')!
  if (pin.kind !== 'part') throw Error('Tracked original circular prism required')
  input.document.definitions.push(pin)
  s.occurrences.push(...['pin-first', 'pin-second'].map(id => ({ id, name: id, definition: { id: pin.id, revision: pin.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })))
  const component = (id: string) => ({ occurrencePath: [id], definition: { id: pin.id, revision: pin.revision } })
  const axis = (id: string) => ({ kind: 'face', component: component(id), body: { bodyId: 'body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'face-v1|UNATTESTED-original-cylinder' }, support: 'axis' })
  const base = (type: Family) => ({ id: ids[type], name: 'Original ' + type, type, suppressed: false })
  const raw = [
    { ...base('concentric'), first: axis('pin-first'), second: axis('pin-second'), alignment: 'aligned', rotationLock: [0, 0, 0, 1] },
    { ...base('lock'), first: component('pin-first'), second: component('pin-second'), relativePose: { translation: [1, 2, 3], rotation: [0, 0, 0, 1] } },
    { ...base('gear'), first: axis('pin-first'), second: axis('pin-second'), carrier: null, ratio: { numerator: 3, denominator: 2 }, direction: 'opposed', neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 4 * TAU + .25, second: -6 * TAU - .5 }, phase: .75 },
    { ...base('screw'), first: axis('pin-first'), second: axis('pin-second'), lead: 5, reverse: false, alignment: 'aligned', neutralRotation: [0, 0, 0, 1], neutralTravel: 7.5, angle: 8 * TAU + .125 },
    { ...base('rack-pinion'), first: axis('pin-first'), second: { kind: 'edge', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, body: null, edge: { sourceFeatureId: 'solid', key: 'edge-v1|UNATTESTED-original-box' }, support: 'line' }, conversion: { mode: 'diameter', override: 8 }, reverse: true, neutralRotation: [0, 0, 0, 1], neutralTravel: -3, angle: -10 * TAU + .75 },
    { id: 'ordinary-distance', name: 'Nonmechanical intent', type: 'distance', suppressed: false, first: { kind: 'principal-plane', component: null, plane: 'XY' }, second: { kind: 'principal-plane', component: null, plane: 'XY' }, distance: 2, alignment: 'aligned' },
  ]
  s.mates = validateAssemblyDocument({ ...input.document, mates: raw }).mates
  input.catalog[1].configurations.find(c => c.id === 'single')!.mates = [{ mateId: ids.gear, suppressed: true }]
  return input
}
type Fixture = ReturnType<typeof fixture>
function capture(type: Family, variant = 1): AssemblyConfigurationMateState {
  switch (type) {
    case 'concentric': return { type, rotationLock: variant === 1 ? null : [1, 0, 0, 0] }
    case 'lock': return { type, relativePose: { translation: [11 * variant, -2, 3], rotation: [0, 1, 0, 0] } }
    case 'gear': return { type, neutralRotations: { first: [0, 0, 1, 0], second: [0, 0, 0, -1] }, angles: { first: (12 + variant) * TAU + .375, second: -(17 + variant) * TAU - .625 }, phase: 10 + variant }
    case 'screw': return { type, neutralRotation: [0, 1, 0, 0], neutralTravel: 30 + variant, angle: (20 + variant) * TAU + .125 }
    case 'rack-pinion': return { type, neutralRotation: [1, 0, 0, 0], neutralTravel: -40 - variant, angle: -(25 + variant) * TAU - .25 }
  }
}
function entry(type: Family = 'gear', configuration: string | null = 'compact', variant = 1): AssemblyConfigurationStateEntry {
  return { definition: { ...owner }, configuration, mateId: ids[type], state: capture(type, variant) }
}
function effective(f: Fixture, states: unknown, type: Family, configuration: string | null = 'compact') {
  return effectiveAssemblyConfigurationMate(f.document, f.catalog, states, owner, configuration, ids[type])
}
const tuple = (e: { readonly definition: { readonly id: string; readonly revision: string }; readonly configuration: string | null; readonly mateId: string }) => [e.definition.id, e.definition.revision, e.configuration, e.mateId]

it.each(families)('inherits existing %s source state when absent, without changing parameters or claiming recapture', type => {
  const f = fixture(), before = serializeAssemblyDocument(f.document), catalog = JSON.stringify(f.catalog), source = node(f.document).mates.find(m => m.id === ids[type])!
  const base = effective(f, [], type, null), compact = effective(f, [], type, 'compact')
  expect(base).toEqual(source); expect(compact).toEqual(source); expect(base).not.toBe(source); expect(base).not.toBe(compact)
  expect(Object.isFrozen(compact)).toBe(true); expect('nativeAuthority' in compact).toBe(false); expect('recaptured' in compact).toBe(false)
  expect(serializeAssemblyDocument(f.document)).toBe(before); expect(JSON.stringify(f.catalog)).toBe(catalog)
})

it.each(families)('isolates base, compact and single capture/winding for %s under an exact source tuple', type => {
  const f = fixture(), before = serializeAssemblyDocument(f.document), source = node(f.document).mates.find(m => m.id === ids[type])!
  const states = [entry(type, null, 2), entry(type, 'compact', 1), entry(type, 'single', 3)]
  const checked = validateAssemblyConfigurationState(f.document, f.catalog, states)
  expect(checked).toEqual(states)
  for (const [configuration, index] of [[null, 0], ['compact', 1], ['single', 2]] as const) {
    const actual = effective(f, checked, type, configuration)
    expect(actual).toEqual({ ...source, ...states[index].state, suppressed: type === 'gear' && configuration === 'single' })
    expect(actual.id).toBe(ids[type]); expect(actual.name).toBe(source.name)
  }
  expect(serializeAssemblyDocument(f.document)).toBe(before)
})

it('distinguishes an absent capture from explicit null concentric unlock and preserves quaternion sign', () => {
  const f = fixture()
  const inherited = effective(f, [], 'concentric')
  if (inherited.type !== 'concentric') throw Error('Concentric source required')
  expect(inherited.rotationLock).toEqual([0, 0, 0, 1])
  const unlocked = effective(f, [entry('concentric')], 'concentric')
  if (unlocked.type !== 'concentric') throw Error('Concentric source required')
  expect(unlocked.rotationLock).toBeNull()
  const state = entry('concentric'); state.state = { type: 'concentric', rotationLock: [0, 0, 0, -1] }
  expect(effective(f, [state], 'concentric')).toMatchObject({ rotationLock: [0, 0, 0, -1] })
})

it('keeps every lifted turn and travel scalar exact instead of reducing modulo a revolution', () => {
  const f = fixture(), states = families.map(type => entry(type))
  const gear = effective(f, states, 'gear'), screw = effective(f, states, 'screw'), rack = effective(f, states, 'rack-pinion')
  if (gear.type !== 'gear' || screw.type !== 'screw' || rack.type !== 'rack-pinion') throw Error('Mechanical families required')
  expect(gear.angles).toEqual({ first: 13 * TAU + .375, second: -18 * TAU - .625 }); expect(gear.phase).toBe(11)
  expect(screw.angle).toBe(21 * TAU + .125); expect(screw.neutralTravel).toBe(31)
  expect(rack.angle).toBe(-26 * TAU - .25); expect(rack.neutralTravel).toBe(-41)
  expect(gear.ratio).toEqual({ numerator: 3, denominator: 2 }); expect(gear.direction).toBe('opposed'); expect(gear.carrier).toBeNull()
  expect(screw.lead).toBe(5); expect(screw.reverse).toBe(false); expect(rack.conversion).toEqual({ mode: 'diameter', override: 8 }); expect(rack.reverse).toBe(true)
})

it('preserves suppressed and unavailable declarations with their selected capture/winding intact', () => {
  const f = fixture(), s = node(f.document), source = s.mates.find(m => m.type === 'gear')!
  s.occurrences.find(o => o.id === 'pin-second')!.suppressed = true
  expect(evaluateAssemblyConfiguration(f.document, f.catalog, 'single-right').status).toBe('references-unavailable')
  const actual = effective(f, [entry('gear', 'single')], 'gear', 'single')
  expect(actual).toEqual({ ...source, ...capture('gear'), suppressed: true })
  const state = validateAssemblyConfigurationState(f.document, f.catalog, [entry('gear', 'single')])
  expect(state[0].state).toEqual(capture('gear')); expect(node(f.document).mates.find(m => m.id === ids.gear)).toEqual(source)
})

it('keeps reused occurrences keyed by their definition state, not their path or display name', () => {
  const f = fixture(), before = JSON.stringify(f), states = families.map(type => entry(type))
  f.catalog[1].configurations.forEach(c => { c.name = 'Same display label' })
  const materialized = materializeAssemblyConfigurationNamedState(f.document, f.catalog, states)
  const mixed = evaluateAssemblyConfiguration(f.document, materialized, 'mixed'), both = evaluateAssemblyConfiguration(f.document, materialized, 'both-compact')
  const left = mixed.scopes.find(s => s.path.join('/') === 'left')!, right = mixed.scopes.find(s => s.path.join('/') === 'right')!
  expect(left.configuration).toBeNull(); expect(right.configuration).toBe('compact')
  for (const type of families) {
    expect(left.mates.find(m => m.id === ids[type])).toEqual(node(f.document).mates.find(m => m.id === ids[type]))
    expect(right.mates.find(m => m.id === ids[type])).toEqual(effective(f, states, type))
    const uses = both.scopes.filter(s => s.configuration === 'compact').map(s => s.mates.find(m => m.id === ids[type]))
    expect(uses).toHaveLength(2); expect(uses[0]).toEqual(uses[1]); expect(uses[0]).not.toBe(uses[1])
  }
  // Only the deliberate display-label edits above differ from this baseline.
  const baseline = JSON.parse(before) as Fixture; baseline.catalog[1].configurations.forEach(c => { c.name = 'Same display label' })
  expect(f).toEqual(baseline)
})

it('does not alias equal mate IDs across root, source revisions or case-distinct configuration IDs', () => {
  const f = fixture(), s = node(f.document), revised = structuredClone(s)
  revised.revision = 's-r2'; const newer = revised.mates.find(m => m.type === 'gear')!; if (newer.type !== 'gear') throw Error('Gear required'); newer.phase = 99
  f.document.definitions.push(revised)
  f.catalog.push({ definition: { id: revised.id, revision: revised.revision }, configurations: [{ id: 'compact', name: 'Same label', occurrences: [], mates: [] }] })
  f.catalog[1].configurations.push({ id: 'Compact', name: 'Same label', occurrences: [], mates: [] })
  const rootGear = structuredClone(s.mates.find(m => m.type === 'gear')!)
  if (rootGear.type !== 'gear') throw Error('Gear required')
  rootGear.first.component.occurrencePath.unshift('left'); rootGear.second.component.occurrencePath.unshift('left'); f.document.mates.push(rootGear)
  const states = [entry(), { ...entry('gear', 'compact', 2), definition: { id: revised.id, revision: revised.revision } }, { ...entry('gear', null, 3), definition: { id: f.document.id, revision: f.document.revision } }, entry('gear', 'Compact', 4)]
  expect(validateAssemblyConfigurationState(f.document, f.catalog, states)).toHaveLength(4)
  expect(effective(f, states, 'gear')).toMatchObject({ phase: 11 })
  expect(effectiveAssemblyConfigurationMate(f.document, f.catalog, states, { id: revised.id, revision: revised.revision }, 'compact', ids.gear)).toMatchObject({ phase: 12 })
  expect(effectiveAssemblyConfigurationMate(f.document, f.catalog, states, { id: f.document.id, revision: f.document.revision }, null, ids.gear)).toMatchObject({ phase: 13 })
  expect(effective(f, states, 'gear', 'Compact')).toMatchObject({ phase: 14 })
})

it.each(['forward', 'reverse'])('keeps inherited Base and explicit named declaration families separate in a %s sidecar batch', order => {
  const f = fixture(), s = node(f.document), own = f.catalog[1].configurations.find(row => row.id === 'single')!
  const original = s.mates.find(mate => mate.id === ids.concentric)!, gear = structuredClone(s.mates.find(mate => mate.type === 'gear')!)
  if (original.type !== 'concentric' || gear.type !== 'gear') throw Error('Original concentric and gear declarations required')
  gear.id = ids.concentric; gear.name = 'Original explicit named gear'; gear.ratio = { numerator: 5, denominator: 7 }
  own.mateDeclarations = s.mates.map(mate => structuredClone(mate.id === ids.concentric ? gear : mate))
  const states: AssemblyConfigurationStateCatalog = [
    { definition: { ...owner }, configuration: null, mateId: ids.concentric, state: { type: 'concentric', rotationLock: [1, 0, 0, 0] } },
    { definition: { ...owner }, configuration: 'compact', mateId: ids.concentric, state: { type: 'concentric', rotationLock: null } },
    { definition: { ...owner }, configuration: 'single', mateId: ids.concentric, state: capture('gear', 2) },
  ]
  if (order === 'reverse') states.reverse()
  const before = JSON.stringify({ ...f, states }), checked = validateAssemblyConfigurationState(f.document, f.catalog, states)
  expect(checked.map(tuple)).toEqual(states.map(tuple)); expect(checked).toEqual(states)
  const base = effectiveAssemblyConfigurationMate(f.document, f.catalog, checked, owner, null, ids.concentric)
  const inherited = effectiveAssemblyConfigurationMate(f.document, f.catalog, checked, owner, 'compact', ids.concentric)
  const named = effectiveAssemblyConfigurationMate(f.document, f.catalog, checked, owner, 'single', ids.concentric)
  expect(base).toEqual({ ...original, rotationLock: [1, 0, 0, 0] })
  expect(inherited).toEqual({ ...original, rotationLock: null })
  expect(named).toEqual({ ...gear, ...capture('gear', 2) })
  expect(named).toMatchObject({ ratio: { numerator: 5, denominator: 7 }, name: 'Original explicit named gear' })
  expect(JSON.stringify({ ...f, states })).toBe(before)
})

it('updates only the exact state key, preserving order, all other entries and source/catalog bytes', () => {
  const f = fixture(), initial = [entry('gear', null), entry('gear', 'compact'), entry('gear', 'single'), entry('concentric')], before = JSON.stringify({ ...f, initial })
  const changed = updateAssemblyConfigurationState(f.document, f.catalog, initial, entry('gear', 'compact', 7))
  expect(changed.map(e => tuple(e))).toEqual(initial.map(tuple)); expect(changed[1]).toEqual(entry('gear', 'compact', 7))
  expect([changed[0], changed[2], changed[3]]).toEqual([initial[0], initial[2], initial[3]])
  const appended = updateAssemblyConfigurationState(f.document, f.catalog, changed, entry('lock', 'single'))
  expect(appended.slice(0, 4)).toEqual(changed); expect(appended[4]).toEqual(entry('lock', 'single')); expect(Object.isFrozen(appended)).toBe(true)
  expect(JSON.stringify({ ...f, initial })).toBe(before)
})

it('returns detached deeply frozen data after validation, effective lookup and exact update', () => {
  const f = fixture(), state = entry(), states = [state], checked = validateAssemblyConfigurationState(f.document, f.catalog, states)
  const actual = effective(f, states, 'gear'), updated = updateAssemblyConfigurationState(f.document, f.catalog, [], state)
  if (state.state.type !== 'gear' || actual.type !== 'gear' || checked[0].state.type !== 'gear' || updated[0].state.type !== 'gear') throw Error('Gear required')
  state.state.angles.first = 999; state.state.neutralRotations.first[0] = 999; state.definition.revision = 'changed'
  const source = node(f.document).mates.find(m => m.type === 'gear')!; if (source.type !== 'gear') throw Error('Gear required'); source.ratio.numerator = 100
  expect(checked[0].state.angles.first).toBe(13 * TAU + .375); expect(updated[0].state.angles.first).toBe(13 * TAU + .375); expect(actual.ratio.numerator).toBe(3)
  expect(checked[0].definition.revision).toBe('s-r1'); expect(actual.neutralRotations.first).toEqual([0, 0, 1, 0])
  expect(Object.isFrozen(checked[0].state.angles)).toBe(true); expect(Object.isFrozen(updated[0].state.neutralRotations.first)).toBe(true)
  expect(Reflect.set(checked[0].state.angles, 'first', 2)).toBe(false); expect(Reflect.set(actual.ratio, 'numerator', 2)).toBe(false)
})

it('validates dormant owners and prevents a good lookup/update from hiding an invalid dormant state', () => {
  const f = fixture(), dormant = structuredClone(node(f.document)); dormant.id = 'dormant-owner'; dormant.revision = 'd1'; dormant.name = 'Unselected original state'
  f.document.definitions.push(dormant)
  f.catalog.push({ definition: { id: dormant.id, revision: dormant.revision }, configurations: [{ id: 'unused', name: 'Unused', occurrences: [], mates: [{ mateId: ids.gear, suppressed: true }] }] })
  const valid = { ...entry('gear', 'unused'), definition: { id: dormant.id, revision: dormant.revision } }
  expect(validateAssemblyConfigurationState(f.document, f.catalog, [valid])).toEqual([valid])
  const invalid = { ...valid, definition: { ...valid.definition, revision: 'stale' } }, whole = [entry(), invalid]
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, whole)).toThrow()
  expect(() => effective(f, whole, 'gear')).toThrow(); expect(() => updateAssemblyConfigurationState(f.document, f.catalog, whole, entry())).toThrow()
})

it.each(['missing-owner', 'old-revision', 'part-owner', 'missing-configuration', 'missing-mate', 'nonmechanical-mate', 'type-mismatch'] as const)('rejects a %s state instead of matching by name or tuple family', bad => {
  const f = fixture(), e = entry()
  if (bad === 'missing-owner') e.definition.id = 'unknown'
  if (bad === 'old-revision') e.definition.revision = 'stale'
  if (bad === 'part-owner') e.definition = { id: 'configuration-A', revision: 'r1' }
  if (bad === 'missing-configuration') e.configuration = 'unknown'
  if (bad === 'missing-mate') e.mateId = 'unknown'
  if (bad === 'nonmechanical-mate') e.mateId = 'ordinary-distance'
  if (bad === 'type-mismatch') e.state = capture('screw')
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, [e])).toThrow()
})

it.each(['outer', 'definition', 'state', 'ratio', 'references', 'suppression', 'angle-extra', 'neutral-extra'] as const)('rejects unknown %s fields and parameter/reference edits disguised as capture state', bad => {
  const f = fixture(), e = entry()
  if (e.state.type !== 'gear') throw Error('Gear required')
  const state = e.state
  const raw: unknown = bad === 'outer' ? { ...e, path: ['left'] }
    : bad === 'definition' ? { ...e, definition: { ...e.definition, name: 'display alias' } }
    : bad === 'angle-extra' ? { ...e, state: { ...state, angles: { ...state.angles, turns: 13 } } }
    : bad === 'neutral-extra' ? { ...e, state: { ...state, neutralRotations: { ...state.neutralRotations, third: [0, 0, 0, 1] } } }
    : { ...e, state: { ...state, [bad === 'ratio' ? 'ratio' : bad === 'references' ? 'first' : bad === 'suppression' ? 'suppressed' : 'unknown']: bad === 'suppression' ? true : {} } }
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, [raw])).toThrow()
})

it.each(['definition', 'definition.revision', 'configuration', 'mateId', 'state', 'state.type', 'state.angles.first', 'state.neutralRotations.first.0'] as const)('rejects executable %s without invoking it', path => {
  const f = fixture(), e = entry(); let reads = 0
  const fields = path.split('.'), key = fields.pop()!, target = fields.reduce((current, field) => (current as Record<string, unknown>)[field], e as unknown) as object
  Object.defineProperty(target, key, { enumerable: true, configurable: true, get() { reads++; return undefined } })
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, [e])).toThrow(); expect(reads).toBe(0)
})

it('rejects missing/undefined, inherited, symbolic and sparse executable catalog data', () => {
  const f = fixture(), e = entry(); let reads = 0
  const { configuration: _unused, ...missing } = e, symbol = { ...e, [Symbol('unknown')]: true }, inherited = Object.assign(Object.create(e), { state: e.state })
  const sparse = new Array(1), executable: unknown[] = new Array(1)
  Object.defineProperty(executable, '0', { enumerable: true, get() { reads++; return e } })
  for (const state of [[missing], [{ ...e, configuration: undefined }], [symbol], [inherited], sparse, executable, { 0: e, length: 1 }]) expect(() => validateAssemblyConfigurationState(f.document, f.catalog, state)).toThrow()
  expect(reads).toBe(0)
})

it.each(['nonfinite-angle', 'nonfinite-phase', 'bad-quaternion', 'bad-pose', 'incomplete-capture'] as const)('rejects %s without resetting the state to a default', bad => {
  const f = fixture(), e = entry()
  const raw = bad === 'nonfinite-angle' ? { ...e, state: { ...capture('screw'), angle: Infinity }, mateId: ids.screw }
    : bad === 'nonfinite-phase' ? { ...e, state: { ...capture('gear'), phase: NaN } }
    : bad === 'bad-quaternion' ? { ...e, state: { type: 'concentric', rotationLock: [0, 0, 0, 2] }, mateId: ids.concentric }
    : bad === 'bad-pose' ? { ...e, state: { type: 'lock', relativePose: { translation: [1, 2], rotation: [0, 0, 0, 1] } }, mateId: ids.lock }
    : { ...e, state: { type: 'gear', angles: { first: 0, second: 0 }, phase: 0 } }
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, [raw])).toThrow()
})

it('rejects duplicate exact keys regardless of record order, while retaining independent variant keys', () => {
  const f = fixture(), first = entry(), reordered = { state: first.state, mateId: first.mateId, configuration: first.configuration, definition: { revision: owner.revision, id: owner.id } }
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, [first, reordered])).toThrow(/duplicad/i)
  expect(validateAssemblyConfigurationState(f.document, f.catalog, [first, entry('gear', null), entry('gear', 'single')])).toHaveLength(3)
})

it('materializes only named captures while preserving all other variant data and explicit suppression', () => {
  const f = fixture(), before = JSON.stringify(f), states = [entry('gear', 'single'), entry('lock', 'compact')]
  const result = materializeAssemblyConfigurationNamedState(f.document, f.catalog, states)
  const single = result[1].configurations.find(c => c.id === 'single')!, compact = result[1].configurations.find(c => c.id === 'compact')!
  expect(single.mates).toEqual([{ mateId: ids.gear, suppressed: true, capture: capture('gear') }])
  expect(compact.mates).toEqual([{ mateId: ids.lock, suppressed: false, capture: capture('lock') }])
  expect(single.occurrences).toEqual(f.catalog[1].configurations[1].occurrences); expect(compact.occurrences).toEqual(f.catalog[1].configurations[0].occurrences)
  expect(result[0]).toEqual(f.catalog[0]); expect(JSON.stringify(f)).toBe(before); expect(Object.isFrozen(result[1].configurations[0].mates[0].capture)).toBe(true)
  expect(() => materializeAssemblyConfigurationNamedState(f.document, f.catalog, [entry('gear', null)])).toThrow(/base/i)
})

it('inherits an existing variant capture, with an explicit sidecar replacement taking precedence only for that exact key', () => {
  const f = fixture(), variant = f.catalog[1].configurations.find(c => c.id === 'compact')!
  variant.mates.push({ mateId: ids.gear, suppressed: true, capture: capture('gear', 2) })
  expect(effective(f, [], 'gear')).toMatchObject({ ...capture('gear', 2), suppressed: true })
  expect(effective(f, [entry('gear', 'compact', 7)], 'gear')).toMatchObject({ ...capture('gear', 7), suppressed: true })
  expect(effective(f, [entry('gear', 'single', 7)], 'gear')).toMatchObject({ ...capture('gear', 2), suppressed: true })
  const materialized = materializeAssemblyConfigurationNamedState(f.document, f.catalog, [entry('gear', 'compact', 7)])
  expect(materialized[1].configurations[0].mates[0]).toEqual({ mateId: ids.gear, suppressed: true, capture: capture('gear', 7) })
  expect(variant.mates[0].capture).toEqual(capture('gear', 2))
})

function maximum() {
  const f = fixture(), s = node(f.document), source = s.mates.find(m => m.type === 'concentric')!
  s.mates = Array.from({ length: 64 }, (_, i) => ({ ...structuredClone(source), id: 'capture-' + i }))
  f.catalog[1].configurations = Array.from({ length: 64 }, (_, i) => ({ id: i === 0 ? 'compact' : i === 1 ? 'single' : 'state-' + i, name: 'Original bounded state ' + i, occurrences: [], mates: [] }))
  const states: AssemblyConfigurationStateCatalog = f.catalog[1].configurations.flatMap(c => s.mates.map(m => ({ definition: { ...owner }, configuration: c.id, mateId: m.id, state: { type: 'concentric' as const, rotationLock: null } })))
  return { ...f, states }
}
it('admits 4096 distinct states and rejects the 4097th new exact key atomically', () => {
  const f = maximum(), before = JSON.stringify(f.states)
  expect(f.states).toHaveLength(4096); expect(MAX_ASSEMBLY_CONFIGURATION_STATES).toBe(4096)
  expect(validateAssemblyConfigurationState(f.document, f.catalog, f.states)).toHaveLength(4096)
  const added = { ...f.states[0], configuration: null }
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, [...f.states, added])).toThrow(/presupuesto|4096/i)
  expect(() => updateAssemblyConfigurationState(f.document, f.catalog, f.states, added)).toThrow(/presupuesto|4096/i)
  expect(JSON.stringify(f.states)).toBe(before)
})

it('enforces the combined source/catalog/state 20MiB bound when each input separately fits', () => {
  const f = maximum(), source = createStepSource(new Uint8Array(7_650_000))
  // Original zero bytes exercise opaque storage/encoding only, not valid STEP
  // geometry or import. Two autonomous source records contain20,400,000chars.
  for (const id of ['original-state-storage-A', 'original-state-storage-B']) f.document.definitions.push({ kind: 'part', id, revision: 'r1', document: { ...createDocument(id), id,
    features: [{ id: 'base', name: 'Original opaque byte budget', type: 'importedSolid', suppressed: false, source }] } })
  expect(source.data.length * 2).toBe(20_400_000)
  expect(new TextEncoder().encode(serializeAssemblyDocument(f.document)).byteLength).toBeLessThan(MAX_ASSEMBLY_BYTES)
  expect(new TextEncoder().encode(JSON.stringify(f.catalog, null, 2)).byteLength).toBeLessThan(MAX_ASSEMBLY_BYTES)
  expect(new TextEncoder().encode(JSON.stringify(f.states, null, 2)).byteLength).toBeLessThan(MAX_ASSEMBLY_BYTES)
  expect(new TextEncoder().encode(JSON.stringify({ source: f.document, catalog: f.catalog, states: f.states }, null, 2)).byteLength).toBeGreaterThan(MAX_ASSEMBLY_BYTES)
  expect(validateAssemblyConfigurationState(f.document, f.catalog, [])).toEqual([])
  expect(() => validateAssemblyConfigurationState(f.document, f.catalog, f.states)).toThrow(/20 MiB/)
})
