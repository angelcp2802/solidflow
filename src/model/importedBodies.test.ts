import { expect, it } from 'vitest'
import type { Feature, ImportedBodiesFeature } from '../cad/kernel.types'
import { createdBodyIds, featureBodyOutputIds, featureBodyOutputIncludes, bodyReferenceCreationFeatureId } from './bodyReferences'
import { addFeature, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, validateImportedBodiesFeature } from './document'
import { featureDependencyIds } from './featureInputs'
import { createStepSource, decodeStepSource } from './stepSource'

// Original tiny Part21 syntax is schema/integrity evidence, not native geometry.
const source = () => createStepSource(new TextEncoder().encode("ISO-10303-21;HEADER;ENDSEC;DATA;#1=ITEM('Original');ENDSEC;END-ISO-10303-21;"))
const base = (): ImportedBodiesFeature => ({ id: 'import', name: 'Original two-body base', type: 'importedBodies', suppressed: false,
  bodies: [{ bodyId: 'left-body', source: source() }, { bodyId: 'right-body', source: source() }] })
const document = (feature: unknown = base()) => validateDocument({ ...createDocument(), features: [feature] })

it('round trips owned sources and distinct body identities without migrating the old legacy base', () => {
  const input = base(), checked = document(input), reopened = parseDocument(serializeDocument(checked))
  expect(reopened).toEqual(checked)
  const imported = reopened.features[0] as ImportedBodiesFeature
  expect(imported).not.toBe(input); expect(imported.bodies[0].source).not.toBe(input.bodies[0].source)
  expect(decodeStepSource(imported.bodies[0].source)).toEqual(decodeStepSource(input.bodies[0].source))
  expect(imported.bodies[0].source).toEqual(imported.bodies[1].source)
  const old = document({ id: 'legacy', name: 'Legacy base', type: 'importedSolid', suppressed: false, source: source() })
  expect(createdBodyIds(old.features[0])).toEqual([])
  expect(parseDocument(serializeDocument(old))).toEqual(old)
})

it('associates every declared body with its exact creation feature and returns detached inventories', () => {
  const imported = base(), ids = createdBodyIds(imported)
  expect(ids).toEqual(['left-body', 'right-body']); ids.reverse()
  expect(featureBodyOutputIds(imported)).toEqual(['left-body', 'right-body'])
  for (const bodyId of ['left-body', 'right-body']) {
    expect(featureBodyOutputIncludes(imported, bodyId, [])).toBe(true)
    expect(bodyReferenceCreationFeatureId([imported], { sourceFeatureId: 'import', bodyId })).toBe('import')
  }
  expect(featureBodyOutputIncludes(imported, 'foreign', [])).toBe(false)
  expect(featureDependencyIds(imported)).toEqual([])
})

it.each([[], Array.from({ length: 257 }, (_, i) => ({ bodyId: 'b' + i, source: source() }))])('rejects empty or over-cap body tables', bodies => {
  expect(() => document({ ...base(), bodies })).toThrow()
})

it('rejects duplicate, blank, overlength and control-character body IDs', () => {
  for (const bodyId of ['left-body', '', 'x'.repeat(129), 'bad\nbody']) {
    const value = base(); value.bodies[1].bodyId = bodyId
    expect(() => document(value)).toThrow()
  }
})

it('rejects holes, extra fields, wrong types and corrupted source integrity even when suppressed', () => {
  const value = base(), holes = Array(2); holes[0] = value.bodies[0]
  const invalid = [
    { ...value, bodies: holes }, { ...value, path: 'not-a-saved-field' },
    { ...value, bodies: [{ ...value.bodies[0], index: 0 }] },
    { ...value, bodies: [{ ...value.bodies[0], source: { ...source(), path: 'not-a-source-field' } }] },
    { ...value, bodies: [{ ...value.bodies[0], source: { ...source(), sha256: '0'.repeat(64) } }] },
    { ...value, bodies: [{ ...value.bodies[0], source: { ...source(), data: 'Zh==' } }] },
    { ...value, bodies: undefined },
  ]
  for (const feature of invalid) expect(() => document({ ...feature, suppressed: true })).toThrow()
})

it('rejects executable fields and array entries without invoking accessors', () => {
  let calls = 0
  const getter = () => { calls++; return source() }
  const body = { bodyId: 'body' }; Object.defineProperty(body, 'source', { enumerable: true, get: getter })
  const data = source(); Object.defineProperty(data, 'data', { enumerable: true, get: getter })
  const list = [base().bodies[0]]; Object.defineProperty(list, '0', { enumerable: true, get: getter })
  const feature = base(); Object.defineProperty(feature, 'name', { enumerable: true, get: getter })
  for (const value of [{ ...base(), bodies: [body] }, { ...base(), bodies: [{ bodyId: 'body', source: data }] }, { ...base(), bodies: list }, feature]) {
    expect(() => validateImportedBodiesFeature(value)).toThrow()
  }
  expect(calls).toBe(0)
})

it('preflights the full encoded byte sum before hashing an individual corrupted source', () => {
  const data = 'A'.repeat(7 * 1024 * 1024 + 4)
  const value = { ...base(), bodies: ['a', 'b', 'c'].map(bodyId => ({ bodyId, source: { ...source(), data, sha256: '0'.repeat(64) } })) }
  expect(() => validateImportedBodiesFeature(value)).toThrow(/20 MiB/)
})

it.each([false, true])('enforces the shared first/unique import base rule, suppressed=%s', suppressed => {
  const old: Feature = { id: 'old', name: 'Old', type: 'importedSolid', suppressed, source: source() }
  const second = base(); second.id = 'second'; second.suppressed = suppressed
  second.bodies.forEach(body => { body.bodyId = 'second-' + body.bodyId })
  for (const features of [[old, base()], [base(), old], [base(), second]]) {
    expect(() => validateDocument({ ...createDocument(), features })).toThrow(/solo se admite/)
  }
  const sketch: Feature = { id: 'sketch', name: 'Sketch', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 2 } }
  const solid: Feature = { id: 'solid', name: 'Solid', type: 'extrude', sketchId: 'sketch', depth: 2, symmetric: false, suppressed }
  expect(() => validateDocument({ ...createDocument(), features: [sketch, solid, base()] })).toThrow(/primera operación sólida/)
  expect(validateDocument({ ...createDocument(), features: [sketch, base()] }).features).toHaveLength(2)
})

it('preserves allocated IDs through edits/history and deletes dependent operations transitively', () => {
  const initial = document(), sketch: Feature = { id: 'sketch', name: 'Independent sketch', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 2 } }
  const withSketch = addFeature(initial, sketch)
  const merged = addFeature(withSketch, { id: 'boss', name: 'Scoped merge', type: 'extrude', sketchId: 'sketch', depth: 2, symmetric: false, suppressed: false,
    bodyOperation: { mode: 'merge', target: { bodyId: 'right-body', sourceFeatureId: 'import' } } })
  expect(featureDependencyIds(merged.features[2])).toEqual(['sketch', 'import'])
  expect(removeFeature(merged, 'import').features.map(f => f.id)).toEqual(['sketch'])
  const changed = base(); changed.bodies.reverse()
  expect(() => updateFeature(initial, 'import', changed)).toThrow(/identificadores/)
  const history = new DocumentHistory(initial), suppressed = updateFeature(initial, 'import', { suppressed: true })
  history.apply(suppressed); expect(history.current.features[0].suppressed).toBe(true)
  history.undo(); expect(history.current).toEqual(initial)
  history.redo(); expect(history.current).toEqual(suppressed)
})
