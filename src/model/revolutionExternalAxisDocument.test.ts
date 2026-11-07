import { describe, expect, it } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature, RevolutionAxis, RevolutionFeature, SketchFeature } from '../cad/kernel.types'
import { DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, type Document } from './document'
import { featureDependencyIds, featureSketchIds } from './featureInputs'
import { featureBodyOutputIds, featureBodyReferences, featureCurrentBodyReferences } from './bodyReferences'
import { featureRevolutionAxisBodyReferences } from './revolutionAxisReferences'
import { buildPartFeatureTree } from './partFeatureTree'
import { canContinuePartSketch } from './partSketchContinuation'

// Original symbolic documents and opaque topology keys. These cases establish
// schema/ownership/editor dependencies, not native LINE, coplanarity or geometry.
const profile: SketchFeature = { id: 'profile', name: 'Original profile', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [7, 0], width: 4, height: 6 } }
const axisSketch: SketchFeature = { id: 'axis-sketch', name: 'Original construction axis', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'entities', points: [{ id: 'a', x: 2, y: -5 }, { id: 'b', x: 2, y: 5 }],
    entities: [{ id: 'axis-line', type: 'line', start: 'a', end: 'b', construction: true }], constraints: [] } }
const axisBody: BodyReference = { bodyId: 'axis-body', sourceFeatureId: 'axis-source' }
const targetBody: BodyReference = { bodyId: 'target-body', sourceFeatureId: 'target-source' }
const producer = (body: BodyReference): Feature => ({ id: body.sourceFeatureId, name: 'Original body source', suppressed: false,
  type: 'extrude', sketchId: profile.id, depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: body.bodyId } })
const edge = (sourceFeatureId = axisBody.sourceFeatureId, key = 'edge-v1|original-symbolic-LINE') => ({ sourceFeatureId, key })
const externalLine: RevolutionAxis = { kind: 'external-sketch-line', sketchId: axisSketch.id, entityId: 'axis-line' }
function operation(axis: unknown, type: RevolutionFeature['type'] = 'revolve') {
  return { id: 'revolution', name: 'Original revolution', suppressed: false, type, sketchId: profile.id, angle: 90,
    axis, reversed: true, ...(type === 'revolve' ? { bodyOperation: { mode: 'new', bodyId: 'turned-body' } } : { bodyScope: [targetBody] }) }
}
function input(features: unknown[]) {
  return { version: 1, id: 'original-external-revolution-axis', name: 'Original external axes', units: 'mm', features,
    createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' }
}
function fixture(axis: unknown = externalLine, type: RevolutionFeature['type'] = 'revolve'): Document {
  return validateDocument(input([profile, axisSketch, producer(axisBody), producer(targetBody), operation(axis, type)]))
}
function revolution(document: Document): RevolutionFeature {
  const value = document.features.find(feature => feature.id === 'revolution')
  if (!value || value.type !== 'revolve' && value.type !== 'revolvedCut') throw new Error('Expected original revolution')
  return value
}

describe('external revolution axis persistence', () => {
  it.each<RevolutionAxis>([
    { kind: 'principal-axis', axis: 'X' }, { kind: 'principal-axis', axis: 'Y' }, { kind: 'principal-axis', axis: 'Z' },
    externalLine, { kind: 'linear-edge', edge: edge(), body: axisBody },
    { kind: 'linear-edge', edge: edge(axisBody.sourceFeatureId, 'edge-v2|' + 'a'.repeat(64)), body: axisBody },
  ])('round trips an exact external declaration for additive and subtractive revolutions: %j', axis => {
    for (const type of ['revolve', 'revolvedCut'] as const) {
      const original = fixture(axis, type), bytes = serializeDocument(original), restored = parseDocument(bytes)
      expect(restored).toEqual(original); expect(serializeDocument(restored)).toBe(bytes)
      expect(revolution(restored)).toMatchObject({ type, axis, reversed: true })
      expect(revolution(restored).axis).not.toBe(axis)
    }
  })

  it('retains the explicit null owner of a legacy aggregate edge without inventing a body', () => {
    const axis: RevolutionAxis = { kind: 'linear-edge', edge: edge('legacy'), body: null }
    const stock: Feature = { id: 'legacy', name: 'Legacy aggregate', type: 'extrude', suppressed: false,
      sketchId: profile.id, depth: 4, symmetric: false }
    const original = validateDocument(input([profile, stock, { id: 'revolution', name: 'Legacy aggregate revolution', suppressed: false,
      type: 'revolve', sketchId: profile.id, angle: 360, axis }]))
    const restored = parseDocument(serializeDocument(original))
    expect(revolution(restored).axis).toEqual(axis)
    expect(featureRevolutionAxisBodyReferences(revolution(restored))).toEqual([])
    expect(Object.hasOwn(revolution(restored), 'bodyOperation')).toBe(false)
    expect(Object.hasOwn(revolution(restored), 'reversed')).toBe(false)
  })

  it('detaches the saved edge and owner and restores exact axis changes through history', () => {
    const original = fixture(), before = serializeDocument(original), history = new DocumentHistory(original)
    const axis: RevolutionAxis = { kind: 'linear-edge', edge: edge(), body: { ...axisBody } }
    const changed = updateFeature(original, 'revolution', { axis }), changedBytes = serializeDocument(changed)
    axis.edge.key = 'edge-v1|changed-after-edit'; axis.body!.bodyId = 'changed-after-edit'
    expect(serializeDocument(changed)).toBe(changedBytes); expect(serializeDocument(original)).toBe(before)
    history.apply(changed)
    expect(serializeDocument(history.undo())).toBe(before)
    expect(serializeDocument(history.redo())).toBe(changedBytes)
  })

  it('retains unresolved entity IDs and structurally owned suppressed/stale sources for explicit repair', () => {
    const original = fixture({ kind: 'external-sketch-line', sketchId: axisSketch.id, entityId: 'missing-or-retyped-line' })
    expect(revolution(parseDocument(serializeDocument(original))).axis).toEqual({
      kind: 'external-sketch-line', sketchId: axisSketch.id, entityId: 'missing-or-retyped-line',
    })
    const suppressed = fixture({ kind: 'linear-edge', edge: edge(), body: axisBody })
    const source = suppressed.features.find(feature => feature.id === axisBody.sourceFeatureId)!
    source.suppressed = true
    expect(parseDocument(serializeDocument(suppressed))).toEqual(suppressed)
  })
})

describe('strict external axis declarations and producer order', () => {
  it.each([
    { kind: 'principal-axis' }, { kind: 'principal-axis', axis: 'x' }, { kind: 'principal-axis', axis: 'W' },
    { kind: 'principal-axis', axis: 'Z', origin: [0, 0, 0] },
    { kind: 'external-sketch-line', entityId: 'axis-line' }, { kind: 'external-sketch-line', sketchId: axisSketch.id },
    { kind: 'external-sketch-line', sketchId: axisSketch.id, entityId: 'axis-line', direction: [0, 1, 0] },
    { kind: 'external-sketch-line', sketchId: 'x'.repeat(129), entityId: 'axis-line' },
    { kind: 'external-sketch-line', sketchId: axisSketch.id, entityId: 'bad\nline' },
    { kind: 'linear-edge', edge: edge() }, { kind: 'linear-edge', edge: edge(), body: undefined },
    { kind: 'linear-edge', edge: edge(), body: { bodyId: axisBody.bodyId } },
    { kind: 'linear-edge', edge: { ...edge(), key: 'circle-index-1' }, body: axisBody },
    { kind: 'linear-edge', edge: { ...edge(), key: 'edge-v1|' + 'x'.repeat(4096) }, body: axisBody },
    { kind: 'linear-edge', edge: { ...edge(), index: 0 }, body: axisBody },
    { kind: 'linear-edge', edge: edge(), body: { ...axisBody, lineage: 'caller-lineage' } },
    { kind: 'linear-edge', edge: edge(), body: axisBody, point: [2, 0, 0] },
  ])('rejects incomplete, calculated or unknown axis fields: %j', axis => {
    expect(() => fixture(axis)).toThrow('axis')
  })

  it('rejects executable axis/edge/owner fields without invoking getters', () => {
    let calls = 0
    const accessor = { enumerable: true, get() { calls++; return 'axis-source' } }
    const axisGetter = Object.defineProperty({ axis: 'X' }, 'kind', accessor)
    const edgeGetter = { kind: 'linear-edge', body: axisBody, edge: Object.defineProperty({ key: edge().key }, 'sourceFeatureId', accessor) }
    const ownerGetter = { kind: 'linear-edge', edge: edge(), body: Object.defineProperty({ bodyId: axisBody.bodyId }, 'sourceFeatureId', accessor) }
    for (const axis of [axisGetter, edgeGetter, ownerGetter]) expect(() => fixture(axis)).toThrow('axis')
    expect(calls).toBe(0)
  })

  it.each(['missing', 'axis-source', 'revolution', 'later-sketch'])('requires an earlier sketch producer, never a body or future sketch: %s', sketchId => {
    const features = fixture().features
    features.push({ ...axisSketch, id: 'later-sketch' })
    const candidate = operation({ kind: 'external-sketch-line', sketchId, entityId: 'axis-line' })
    expect(() => validateDocument(input(features.map(feature => feature.id === 'revolution' ? candidate : feature)))).toThrow('axis.sketchId')
  })

  it.each(['missing', 'profile', 'revolution', 'later-solid'])('requires an earlier solid edge producer: %s', sourceFeatureId => {
    const candidate = operation({ kind: 'linear-edge', edge: edge(sourceFeatureId), body: null })
    expect(() => validateDocument(input([profile, producer(axisBody), candidate,
      producer({ bodyId: 'later-body', sourceFeatureId: 'later-solid' })]))).toThrow('axis.edge.sourceFeatureId')
  })

  it('rejects an edge/owner state mismatch and a body not produced by the declared source', () => {
    expect(() => fixture({ kind: 'linear-edge', edge: edge(), body: targetBody })).toThrow('axis.body.sourceFeatureId')
    expect(() => fixture({ kind: 'linear-edge', edge: edge(), body: { ...axisBody, bodyId: targetBody.bodyId } })).toThrow('axis.body.bodyId')
  })

  it('rejects reordering a valid external source past the revolution', () => {
    const original = fixture(), features = original.features.filter(feature => feature.id !== axisSketch.id)
    features.push(original.features.find(feature => feature.id === axisSketch.id)!)
    expect(() => validateDocument({ ...original, features })).toThrow('axis.sketchId')
  })
})

describe('external axes are dependencies and read-only bodies', () => {
  it('keeps only the profile consumed while the external sketch remains a dependency and cannot be staged as unused', () => {
    const document = fixture(), feature = revolution(document)
    expect(featureSketchIds(feature)).toEqual([profile.id])
    expect(featureDependencyIds(feature)).toEqual([profile.id, axisSketch.id])
    const groups = buildPartFeatureTree(document.features, new Set(['revolution']), '')
    expect(groups.find(group => group.feature.id === 'revolution')?.children.map(child => child.id)).toEqual([profile.id])
    expect(groups.some(group => group.feature.id === axisSketch.id)).toBe(true)
    expect(canContinuePartSketch(document, document.features.find(value => value.id === axisSketch.id) as SketchFeature)).toBe(false)
  })

  it.each(['revolve', 'revolvedCut'] as const)('does not make the axis body a %s target or output', type => {
    const document = fixture({ kind: 'linear-edge', edge: edge(), body: axisBody }, type), feature = revolution(document)
    expect(featureSketchIds(feature)).toEqual([profile.id])
    expect(featureDependencyIds(feature)).toEqual(type === 'revolve'
      ? [profile.id, axisBody.sourceFeatureId] : [profile.id, targetBody.sourceFeatureId, axisBody.sourceFeatureId])
    expect(featureRevolutionAxisBodyReferences(feature)).toEqual([axisBody])
    expect(featureBodyReferences(feature)).toEqual(type === 'revolve' ? [] : [targetBody])
    expect(featureCurrentBodyReferences(feature)).toEqual(type === 'revolve' ? [] : [targetBody])
    expect(featureBodyOutputIds(feature)).toEqual(type === 'revolve' ? ['turned-body'] : [targetBody.bodyId])
    const detached = featureRevolutionAxisBodyReferences(feature); detached[0].bodyId = 'outside-mutation'
    expect(featureRevolutionAxisBodyReferences(feature)).toEqual([axisBody])
  })

  it('removes the axis consumer and its downstream body states without deleting unrelated bodies', () => {
    const original = fixture(), dependent: Feature = { id: 'downstream', name: 'Downstream body state', type: 'extrude', suppressed: false,
      sketchId: profile.id, depth: 1, symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'turned-body', sourceFeatureId: 'revolution' } } }
    const document = validateDocument({ ...original, features: [...original.features, dependent] })
    expect(removeFeature(document, axisSketch.id).features.map(value => value.id)).toEqual([profile.id, axisBody.sourceFeatureId, targetBody.sourceFeatureId])
    const edgeDocument = fixture({ kind: 'linear-edge', edge: edge(), body: axisBody })
    expect(removeFeature(edgeDocument, axisBody.sourceFeatureId).features.map(value => value.id)).toEqual([profile.id, axisSketch.id, targetBody.sourceFeatureId])
  })

  it('removes an axis consumer when its body creator disappears behind a surviving potential ALL state', () => {
    const all: RepetitionFeature = { id: 'all-state', name: 'Original potential ALL state', type: 'linearPattern', suppressed: false,
      baseFeatureId: targetBody.sourceFeatureId, source: { mode: 'features', geometryPattern: false, featureIds: [targetBody.sourceFeatureId] },
      first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
      featurePattern: { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput', bindings: [{ source: targetBody, targetBodyIds: 'scope' }],
        referencePolicies: [], variation: { kind: 'none' } } }
    const read: RevolutionAxis = { kind: 'linear-edge', edge: edge(all.id), body: { ...axisBody, sourceFeatureId: all.id } }
    const document = validateDocument(input([profile, producer(axisBody), producer(targetBody), all, operation(read)]))
    expect(featureDependencyIds(revolution(document))).toEqual([profile.id, all.id])
    const removed = removeFeature(document, axisBody.sourceFeatureId)
    expect(removed.features.map(value => value.id)).toEqual([profile.id, targetBody.sourceFeatureId, all.id])
    expect(parseDocument(serializeDocument(removed))).toEqual(removed)
  })
})
