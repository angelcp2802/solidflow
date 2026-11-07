import { describe, expect, it } from 'vitest'
import type { CadResult } from '../cad/kernel.types'
import { DocumentHistory, parseDocument, serializeDocument, validateDocument, type Document } from './document'
import { createAssemblyFromPart } from './assemblyFromPart'
import { createAssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { parseCadDocument, serializeCadDocument, type CadDocument } from './cadDocument'
import { readCadRecovery, writeCadRecovery } from './cadRecovery'
import { MAX_PART_DENSITY_KG_PER_M3, MAX_PART_MATERIAL_NAME_LENGTH, normalizePartMaterialName,
  partMassKg, setPartProperties, validatePartProperties, type PartMassNativeState, type PartProperties } from './partProperties'

// Original 10 mm cube declaration. The synthetic density 1000 kg/m³ is a test
// input, not a claim about a catalog material: 1000 mm³ gives 0.001 kg.
function originalPartPropertiesCube(): Document {
  return validateDocument({ version: 1, id: 'properties-original-cube', name: 'Original cube', units: 'mm',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z', features: [
      { id: 'profile', name: 'Original 10 mm square', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } },
      { id: 'solid', name: 'Original 10 mm prism', type: 'extrude', sketchId: 'profile', depth: 10,
        symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'cube' } },
    ] })
}
const properties = (): PartProperties => ({ material: { name: 'Material sintético', densityKgPerM3: 1000 }, appearance: { color: '#19aBC0' } })

describe('bounded per-part declarations', () => {
  it('keeps absent fields absent, accepts exact bounds and detaches declared data', () => {
    expect(validatePartProperties({})).toEqual({})
    const input = properties(), copied = validatePartProperties(input)
    expect(copied).toEqual(input); expect(copied).not.toBe(input)
    copied.material!.name = 'Changed'; copied.appearance!.color = '#000000'
    expect(input).toEqual(properties())
    expect(validatePartProperties({ material: { name: 'n'.repeat(MAX_PART_MATERIAL_NAME_LENGTH), densityKgPerM3: MAX_PART_DENSITY_KG_PER_M3 } }).material!.densityKgPerM3).toBe(1_000_000)
    expect(validatePartProperties({ material: { name: 'Tiny', densityKgPerM3: Number.MIN_VALUE } }).material!.densityKgPerM3).toBe(Number.MIN_VALUE)
    expect(validatePartProperties(Object.assign(Object.create(null), input))).toEqual(input)
    expect(normalizePartMaterialName('  Cafe\u0301  ')).toBe('Café')
  })
  it.each(['', ' ', ' padded', 'padded ', 'Cafe\u0301', 'n'.repeat(81), 'line\nbreak', 'nul\u0000', 'control\u0085'])('rejects noncanonical or unbounded material name %j', name => {
    expect(() => validatePartProperties({ material: { name, densityKgPerM3: 1000 } })).toThrow()
  })
  it.each([0, -1, NaN, Infinity, -Infinity, MAX_PART_DENSITY_KG_PER_M3 + 1, '1000', null, undefined])('rejects density %j', densityKgPerM3 => {
    expect(() => validatePartProperties({ material: { name: 'Original', densityKgPerM3 } })).toThrow()
  })
  it.each(['blue', '#abc', '#12345678', '#12345g', ' #123456', '#123456\n', 'url(file:///private)', 12, null, undefined])('rejects nonopaque/nonhex colour %j', color => {
    expect(() => validatePartProperties({ appearance: { color } })).toThrow()
  })
  it.each([null, [], false, { material: undefined }, { appearance: undefined }, { material: null }, { appearance: {} },
    { filePath: 'ungranted.solidflow' }, { material: { name: 'Original', densityKgPerM3: 1000, source: 'untrusted' } },
    { appearance: { color: '#123456', opacity: 0.5 } }])('rejects incomplete or additional declarations %j', input => {
    expect(() => validatePartProperties(input)).toThrow()
  })
  it.each(['root-getter', 'material-getter', 'color-getter', 'root-hidden', 'material-hidden', 'symbol', 'root-prototype', 'material-prototype'] as const)('rejects non-data records %s without executing accessors', kind => {
    const input = properties(); let reads = 0
    if (kind === 'root-getter') Object.defineProperty(input, 'material', { enumerable: true, get() { reads++; return properties().material } })
    if (kind === 'material-getter') Object.defineProperty(input.material, 'name', { enumerable: true, get() { reads++; return 'Original' } })
    if (kind === 'color-getter') Object.defineProperty(input.appearance, 'color', { enumerable: true, get() { reads++; return '#123456' } })
    if (kind === 'root-hidden') Object.defineProperty(input, 'appearance', { value: input.appearance, enumerable: false })
    if (kind === 'material-hidden') Object.defineProperty(input.material, 'name', { value: 'Original', enumerable: false })
    if (kind === 'symbol') Object.defineProperty(input.appearance, Symbol('extra'), { value: true, enumerable: true })
    if (kind === 'root-prototype') Object.setPrototypeOf(input, { inherited: true })
    if (kind === 'material-prototype') Object.setPrototypeOf(input.material, { inherited: true })
    expect(() => validatePartProperties(input)).toThrow(); expect(reads).toBe(0)
  })
  it.each(['material', 'appearance'] as const)('rejects a direct document %s accessor without evaluating it', key => {
    const part = originalPartPropertiesCube(); let reads = 0
    Object.defineProperty(part, key, { enumerable: true, get() { reads++; return properties()[key] } })
    expect(() => validateDocument(part)).toThrow(); expect(reads).toBe(0)
  })
})

describe('part-property persistence and editor history', () => {
  it('preserves legacy canonical bytes across v1, v2 and nested/configured v3', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    for (const legacy of [originalPartPropertiesCube(), document, createAssemblyConfiguredDocument(document, catalog, 'mixed')]) {
      const json = serializeCadDocument(legacy), reopened = parseCadDocument(json)
      expect(serializeCadDocument(reopened)).toBe(json)
      expect(JSON.stringify(reopened)).not.toMatch(/"(?:material|appearance)":/)
    }
  })
  it('roundtrips metadata on reused nested parts, including dormant definitions, without root properties', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    for (const definition of document.definitions) if (definition.kind === 'part') definition.document = setPartProperties(definition.document, properties())
    // The left scope and right B are suppressed; B has no active occurrence,
    // but its metadata still belongs to the complete saved source registry.
    document.occurrences[0].suppressed = true
    const configured = createAssemblyConfiguredDocument(document, catalog, 'single-right')
    for (const enriched of [setPartProperties(originalPartPropertiesCube(), properties()), document, configured]) {
      const json = serializeCadDocument(enriched), reopened = parseCadDocument(json)
      expect(reopened).toEqual(enriched)
      let bytes: string | null = null
      const storage = { setItem(_key: string, value: string) { bytes = value }, getItem() { return bytes } }
      expect(writeCadRecovery(storage, reopened)).toBe(json)
      expect(readCadRecovery(storage)).toEqual({ status: 'recovered', document: enriched, serialized: json })
      if (reopened.version !== 1) expect(Object.hasOwn(reopened, 'material') || Object.hasOwn(reopened, 'appearance')).toBe(false)
    }
    const part = setPartProperties(originalPartPropertiesCube(), properties()), assembled = createAssemblyFromPart(part)
    const definition = assembled.definitions[0]
    if (definition.kind !== 'part') throw Error('Expected original part')
    expect(definition.document).toEqual(part); expect(definition.document.material).not.toBe(part.material)
  })
  it('applies one detached history entry, clones features for a fresh build, and supports removal/undo/redo', () => {
    const original = originalPartPropertiesCube(), saved = serializeDocument(original), history = new DocumentHistory(original)
    const input = properties(), candidate = setPartProperties(original, input)
    expect(serializeDocument(original)).toBe(saved)
    expect(candidate.features).toEqual(original.features); expect(candidate.features).not.toBe(original.features)
    expect(candidate.features[0]).not.toBe(original.features[0])
    const applied = history.apply(candidate)
    input.material!.densityKgPerM3 = 999; candidate.appearance!.color = '#000000'
    expect(applied.material).toEqual(properties().material); expect(history.current.appearance).toEqual(properties().appearance)
    expect(history.undo()).toEqual(original); expect(history.canUndo).toBe(false)
    expect(history.redo().material).toEqual(properties().material)
    const removed = history.apply(setPartProperties(history.current, {}))
    expect(Object.hasOwn(removed, 'material') || Object.hasOwn(removed, 'appearance')).toBe(false)
    expect(parseDocument(serializeDocument(removed))).toEqual(removed)
    expect(history.undo().material).toEqual(properties().material)
  })
  it('does not create a no-op timestamp/history change, and cannot move a future timestamp backwards', () => {
    const original = setPartProperties(originalPartPropertiesCube(), properties()), history = new DocumentHistory(original)
    expect(setPartProperties(original, properties())).toEqual(original)
    history.apply(setPartProperties(original, properties())); expect(history.canUndo).toBe(false)
    original.updatedAt = '9999-01-01T00:00:00.000Z'
    expect(setPartProperties(original, {}).updatedAt).toBe(original.updatedAt)
  })
  it('rejects invalid nested metadata before changing history or recovery bytes', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    const configured = createAssemblyConfiguredDocument(document, catalog, 'single-right'), invalid = structuredClone(configured)
    const definition = invalid.source.definitions.find(value => value.kind === 'part')!
    if (definition.kind !== 'part') throw Error('Expected original part')
    definition.document.material = { name: 'Invalid', densityKgPerM3: 0 }
    let writes = 0
    expect(() => writeCadRecovery({ setItem() { writes++ } }, invalid)).toThrow(); expect(writes).toBe(0)
    expect(() => serializeCadDocument(invalid)).toThrow()
    expect(readCadRecovery({ getItem: () => JSON.stringify(invalid) }).status).toBe('invalid')
    const original = originalPartPropertiesCube(), history = new DocumentHistory(original)
    expect(() => history.apply({ ...original, material: definition.document.material })).toThrow()
    expect(history.current).toEqual(original); expect(history.canUndo).toBe(false)
    for (const root of [document, configured]) {
      expect(() => serializeCadDocument({ ...root, ...properties() } as CadDocument)).toThrow()
    }
  })
})

describe('native-volume mass display guard', () => {
  function ready(document: Document): PartMassNativeState {
    // Display-only DTO with independently specified 10³ mm³ volume. Native
    // validity/shape preservation are exercised in partProperties.native.test.
    const model: CadResult = { vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], volume: 1000,
      bounds: { min: [-5, -5, 0], max: [5, 5, 10] }, warnings: [], featureErrors: [] }
    return { model, builtFeatures: document.features, busy: false, sourceLoading: false, editing: false, staged: false }
  }
  it('converts mm³ and kg/m³ to kg only with assigned density and the current full result', () => {
    const original = originalPartPropertiesCube(), assigned = setPartProperties(original, properties())
    expect(partMassKg(original, ready(original))).toBeNull()
    expect(partMassKg(assigned, ready(assigned))).toBeCloseTo(0.001, 15)
    expect(partMassKg(assigned, ready(original))).toBeNull()
    const current = ready(assigned); current.model!.volume = 0
    expect(partMassKg(assigned, current)).toBe(0)
  })
  it.each(['busy', 'sourceLoading', 'editing', 'staged'] as const)('rejects %s even when the feature identity matches', key => {
    const document = setPartProperties(originalPartPropertiesCube(), properties()), current = ready(document)
    current[key] = true
    expect(partMassKg(document, current)).toBeNull()
  })
  it('rejects missing/stale/error builds and nonrepresentable volume or mass', () => {
    const document = setPartProperties(originalPartPropertiesCube(), properties()), current = ready(document)
    expect(partMassKg(document, { ...current, model: null })).toBeNull()
    expect(partMassKg(document, { ...current, builtFeatures: null })).toBeNull()
    expect(partMassKg(document, { ...current, builtFeatures: structuredClone(document.features) })).toBeNull()
    current.model!.featureErrors = [{ id: 'solid', message: 'Original failure' }]
    expect(partMassKg(document, current)).toBeNull(); current.model!.featureErrors = []
    for (const volume of [-1, NaN, Infinity, Number.MIN_VALUE]) {
      current.model!.volume = volume; expect(partMassKg(document, current)).toBeNull()
    }
    document.material!.densityKgPerM3 = 1_000_000; current.model!.volume = Number.MAX_VALUE
    expect(partMassKg(document, current)).not.toBeNull()
  })
})
