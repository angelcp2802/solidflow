import { describe, expect, it } from 'vitest'
import type { BodyReference, ExtrudeEndCondition, ExtrudeFeature, Feature, SketchFeature } from '../cad/kernel.types'
import { featureBodyReferencePaths, featureBodyReferences, featureCurrentBodyReferences, featureBodyOutputIds } from './bodyReferences'
import { setBodyOperationDraft, withBodySelection } from './bodyCommands'
import { createDocument, parseDocument, removeFeature, serializeDocument, validateDocument } from './document'
import { featureDependencyIds, featureSketchIds } from './featureInputs'

// Original declaration-only fixtures; these tests do not construct or attest native geometry.
const a: BodyReference = { bodyId: 'body-a', sourceFeatureId: 'source-a' }
const b: BodyReference = { bodyId: 'body-b', sourceFeatureId: 'source-b' }
const profile: SketchFeature = { id: 'profile', name: 'Original rectangle', type: 'sketch', suppressed: false,
  plane: 'XY', offset: 5, profile: { kind: 'rectangle', center: [5, 3], width: 10, height: 6 } }
const producer = (ref: BodyReference): Extract<ExtrudeFeature, { type: 'extrude' }> => ({ id: ref.sourceFeatureId,
  name: 'Original owner', type: 'extrude', suppressed: false, sketchId: profile.id, depth: 2, symmetric: false,
  bodyOperation: { mode: 'new', bodyId: ref.bodyId } })
const dynamic = (ref: BodyReference): ExtrudeEndCondition => ({ kind: 'untilNext', baseFeatureId: ref.sourceFeatureId, baseBody: { ...ref } })
const boss = (): Extract<ExtrudeFeature, { type: 'extrude' }> => ({ id: 'boss', name: 'Original two limits', type: 'extrude',
  suppressed: false, sketchId: profile.id, depth: 11, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'output' },
  endCondition: dynamic(a), secondDirection: { enabled: true, depth: 8, endCondition: dynamic(b) } })
const document = (feature: ExtrudeFeature, extra: Feature[] = []) => validateDocument({ ...createDocument('Original reference roles'),
  features: [profile, producer(a), producer(b), ...extra, feature] })

describe('independent extrusion limit references', () => {
  it('inventories two detached declared reads with exact paths and one created output', () => {
    const feature = boss(), before = structuredClone(feature)
    expect(featureBodyReferences(feature)).toEqual([a, b])
    expect(featureCurrentBodyReferences(feature)).toEqual([a, b])
    expect(featureBodyReferencePaths(feature)).toEqual(['endCondition.baseBody', 'secondDirection.endCondition.baseBody'])
    expect(featureDependencyIds(feature)).toEqual([profile.id, a.sourceFeatureId, b.sourceFeatureId])
    expect(featureSketchIds(feature)).toEqual([profile.id])
    expect(featureBodyOutputIds(feature)).toEqual(['output'])
    const references = featureBodyReferences(feature); references[1].bodyId = 'external-edit'
    expect(feature).toEqual(before)
    expect(parseDocument(serializeDocument(document(feature))).features.at(-1)).toEqual(feature)
  })

  it('retains OFF declaration/deletion dependencies without requiring that inactive native owner', () => {
    const feature = boss(); feature.secondDirection!.enabled = false
    expect(featureBodyReferences(feature)).toEqual([a, b])
    expect(featureCurrentBodyReferences(feature)).toEqual([a])
    const saved = document(feature)
    expect(parseDocument(serializeDocument(saved)).features.at(-1)).toEqual(feature)
    expect(removeFeature(saved, b.sourceFeatureId).features.some(item => item.id === feature.id)).toBe(false)
  })

  it('retains the second locator when the first branch is Blind', () => {
    const feature = boss(); delete feature.endCondition
    expect(featureBodyReferences(feature)).toEqual([b])
    expect(featureCurrentBodyReferences(feature)).toEqual([b])
    expect(featureBodyReferencePaths(feature)).toEqual(['secondDirection.endCondition.baseBody'])
    expect(() => document({ ...feature, secondDirection: { ...feature.secondDirection!, endCondition: dynamic({ ...b, sourceFeatureId: 'missing' }) } }))
      .toThrow('secondDirection.endCondition.baseBody.sourceFeatureId')
  })

  it('deduplicates identical limit reads without hiding different states or changing operand semantics', () => {
    const feature = boss(); feature.secondDirection!.endCondition = dynamic(a)
    expect(featureBodyReferences(feature)).toEqual([a])
    expect(featureBodyReferencePaths(feature)).toEqual(['endCondition.baseBody'])
    expect(document(feature).features.at(-1)).toEqual(feature)
    feature.secondDirection!.endCondition = dynamic({ ...a, sourceFeatureId: 'later-a' })
    expect(featureBodyReferences(feature)).toEqual([a, { ...a, sourceFeatureId: 'later-a' }])
    expect(featureBodyReferencePaths(feature)).toHaveLength(2)
    const duplicateOperands: Feature = { id: 'combine', name: 'Invalid duplicate operands', type: 'combine', suppressed: false,
      operation: 'add', operands: [a, a], resultBodyId: 'combined', keepTools: false }
    expect(featureBodyReferences(duplicateOperands)).toEqual([a, a])
    expect(featureBodyReferencePaths(duplicateOperands)).toEqual(['operands[0]', 'operands[1]'])
  })

  it('tracks both plane limits even while OFF and does not turn them into body or sketch operands', () => {
    const feature = boss(); feature.endCondition = { kind: 'upToSurface', target: { kind: 'plane', planeId: 'upper' } }
    feature.secondDirection = { enabled: false, depth: 8, endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: 'lower' } } }
    const planes: Feature[] = ['upper', 'lower'].map((id, index) => ({ id, name: 'Original datum', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: index ? -3 : 16, reversed: false }))
    expect(featureDependencyIds(feature)).toEqual([profile.id, 'upper', 'lower'])
    expect(featureBodyReferences(feature)).toEqual([])
    expect(featureSketchIds(feature)).toEqual([profile.id])
    const saved = document(feature, planes)
    expect(removeFeature(saved, 'lower').features.some(item => item.id === feature.id)).toBe(false)
    expect(parseDocument(serializeDocument(saved)).features.at(-1)).toEqual(feature)
    feature.secondDirection.endCondition = { kind: 'upToSurface', target: { kind: 'face', face: { sourceFeatureId: a.sourceFeatureId, key: 'face-v1|original' } } }
    expect(featureDependencyIds(feature)).toEqual([profile.id, 'upper', a.sourceFeatureId])
  })

  it('preserves explicit limits in new-to-new edits and does not adopt a merge target on new creation', () => {
    const feature = boss(); feature.secondDirection!.enabled = false; feature.secondDirection!.depth = 0
    const before = structuredClone(feature)
    const sameMode = setBodyOperationDraft(feature, { mode: 'new', bodyId: 'output' })
    expect(sameMode).toEqual(feature)
    const merged = setBodyOperationDraft(feature, { mode: 'merge', target: a }) as ExtrudeFeature
    expect(merged.endCondition).toEqual({ kind: 'untilNext', baseFeatureId: a.sourceFeatureId })
    expect(merged.secondDirection).toEqual({ enabled: false, depth: 0, endCondition: { kind: 'untilNext', baseFeatureId: a.sourceFeatureId } })
    const recreated = setBodyOperationDraft(merged as Extract<ExtrudeFeature, { type: 'extrude' }>, { mode: 'new', bodyId: 'output' }) as ExtrudeFeature
    expect(recreated.endCondition).toEqual({ kind: 'untilNext', baseFeatureId: '' })
    expect(recreated.secondDirection).toEqual({ enabled: false, depth: 0, endCondition: { kind: 'untilNext', baseFeatureId: '' } })
    expect(feature).toEqual(before)
  })

  it('updates both dynamic cut scopes on an explicit selection while retaining invalid editable OFF depth', () => {
    const feature: Extract<ExtrudeFeature, { type: 'cut' }> = { id: 'cut', name: 'Original scoped cut', type: 'cut', suppressed: false,
      sketchId: profile.id, depth: 11, symmetric: false, bodyScope: [a], endCondition: { kind: 'untilNext', baseFeatureId: a.sourceFeatureId },
      secondDirection: { enabled: false, depth: 0, endCondition: { kind: 'throughAll', baseFeatureId: a.sourceFeatureId, bothDirections: false } } }
    const before = structuredClone(feature), next = withBodySelection(feature, [b]) as Extract<ExtrudeFeature, { type: 'cut' }>
    expect(next.bodyScope).toEqual([b]); expect(next.bodyScope![0]).not.toBe(b)
    expect(next.endCondition).toEqual({ kind: 'untilNext', baseFeatureId: b.sourceFeatureId })
    expect(next.secondDirection).toEqual({ enabled: false, depth: 0, endCondition: { kind: 'throughAll', baseFeatureId: b.sourceFeatureId, bothDirections: false } })
    expect(feature).toEqual(before)
    const cleared = withBodySelection(next, []) as ExtrudeFeature
    expect(cleared.endCondition).toMatchObject({ baseFeatureId: '' })
    expect(cleared.secondDirection?.endCondition).toMatchObject({ baseFeatureId: '' })
  })
})
