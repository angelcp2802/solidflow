import { describe, expect, it } from 'vitest'
import type { Feature, RepetitionFeature } from '../cad/kernel.types'
import { parseDocument, removeFeature, serializeDocument, validateDocument } from './document'

// Original symbolic ownership graph. Potential ALL poststates remain suitable
// for load-for-repair; this fixture does not claim native materialization.
function fixture(suppressed: boolean) {
  const features: Feature[] = []
  for (const id of ['S', 'B', 'C']) {
    features.push({ id: `profile-${id}`, type: 'sketch', name: 'Original profile ' + id, suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 } },
    { id: `create-${id}`, type: 'extrude', name: 'Original owner ' + id, suppressed: id === 'B' && suppressed,
      sketchId: `profile-${id}`, depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: id } })
    if (id === 'S') features.push({ id: 'seed', type: 'cut', name: 'Original historical cut', suppressed: false,
      sketchId: 'profile-S', depth: 1, symmetric: false, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }] })
  }
  const pattern: RepetitionFeature = { id: 'all', type: 'linearPattern', name: 'Original dynamic scope', suppressed: false,
    baseFeatureId: 'create-C', source: { mode: 'features', geometryPattern: false, featureIds: ['seed'] },
    first: { count: 2, direction: [1, 0, 0], spacing: 20 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput', bindings: [
      { source: { bodyId: 'S', sourceFeatureId: 'seed' }, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } } }
  features.push(pattern,
    { id: 'exact-B', type: 'cut', name: 'Exact potential B poststate', suppressed: false, sketchId: 'profile-S', depth: 1,
      symmetric: false, bodyScope: [{ bodyId: 'B', sourceFeatureId: 'all' }] },
    { id: 'after-B', type: 'cut', name: 'Transitive B consumer', suppressed: false, sketchId: 'profile-S', depth: 1,
      symmetric: false, bodyScope: [{ bodyId: 'B', sourceFeatureId: 'exact-B' }] },
    { id: 'repair-C', type: 'cut', name: 'Independent potential C state for repair', suppressed: false, sketchId: 'profile-S', depth: 1,
      symmetric: false, bodyScope: [{ bodyId: 'C', sourceFeatureId: 'all' }] })
  return validateDocument({ version: 1, id: 'original-all-deletion', name: 'Original contextual deletion', units: 'mm',
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', features })
}

describe('deleting creators referenced through dynamic ALL', () => {
  it.each([
    { id: 'create-B', suppressed: false }, { id: 'profile-B', suppressed: false },
    { id: 'create-B', suppressed: true }, { id: 'profile-B', suppressed: true },
  ])('removes exact and transitive B consumers but preserves ALL and an independent repair ref: $id/$suppressed', ({ id, suppressed }) => {
    const original = fixture(suppressed), before = structuredClone(original), result = removeFeature(original, id)
    const expected = original.features.filter(feature => ![id, 'create-B', 'exact-B', 'after-B'].includes(feature.id))
    expect(result.features).toEqual(expected)
    expect(result.features.find(feature => feature.id === 'all')).toEqual(original.features.find(feature => feature.id === 'all'))
    expect(result.features.find(feature => feature.id === 'repair-C')).toEqual(original.features.find(feature => feature.id === 'repair-C'))
    expect(parseDocument(serializeDocument(result))).toEqual(result)
    expect(original).toEqual(before)
  })
})
