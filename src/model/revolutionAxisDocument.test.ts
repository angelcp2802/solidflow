import { describe, expect, it } from 'vitest'
import type { RevolutionAxis, RevolveFeature, SketchFeature } from '../cad/kernel.types'
import type { Document } from './document'
import { DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'

// Original synthetic persistence fixture; no imported geometry or external model.
// Property order is the pre-axis version-1 canonical serialization contract.
const sourceSketch: SketchFeature = {
  id: 'profile', name: 'Perfil', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [3, 0], width: 2, height: 4 },
}
const legacyRevolve: RevolveFeature = {
  id: 'revolution', name: 'Revolución', suppressed: false, type: 'revolve', sketchId: 'profile', angle: 360,
}
function fixture(patch: Record<string, unknown> = {}): Document {
  return {
    version: 1, id: 'original-revolution-axis', name: 'Eje editable', units: 'mm',
    features: [structuredClone(sourceSketch), { ...legacyRevolve, ...patch }],
    createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  }
}
function revolution(document: Document): RevolveFeature {
  const feature = document.features[1]
  if (feature?.type !== 'revolve') throw new Error('Expected the original revolution fixture')
  return feature
}

describe('revolution axis document compatibility', () => {
  it('keeps legacy canonical bytes and absent defaults through normalization and round trip', () => {
    const oldDocument = fixture()
    const oldBytes = JSON.stringify(oldDocument, null, 2)
    const normalized = validateDocument(oldDocument)
    expect(serializeDocument(normalized)).toBe(oldBytes)
    const restored = parseDocument(oldBytes)
    expect(serializeDocument(restored)).toBe(oldBytes)
    for (const document of [normalized, restored]) {
      expect(Object.hasOwn(revolution(document), 'axis')).toBe(false)
      expect(Object.hasOwn(revolution(document), 'reversed')).toBe(false)
    }
  })

  it.each<RevolutionAxis>([
    { kind: 'sketch-axis', axis: 'x' },
    { kind: 'sketch-axis', axis: 'y' },
    { kind: 'sketch-line', entityId: 'construction-line' },
  ])('retains the exact axis and explicit direction with body identity: %j', (axis) => {
    for (const reversed of [false, true]) {
      const document = fixture({ axis, reversed, bodyOperation: { mode: 'new', bodyId: 'turned-body' } })
      const restored = parseDocument(serializeDocument(document))
      expect(restored).toEqual(document)
      expect(revolution(restored)).toMatchObject({ axis, reversed, bodyOperation: { mode: 'new', bodyId: 'turned-body' } })
    }
    const axisOnly = parseDocument(serializeDocument(fixture({ axis })))
    expect(revolution(axisOnly).axis).toEqual(axis)
    expect(Object.hasOwn(revolution(axisOnly), 'reversed')).toBe(false)
  })

  it('retains direction without materializing the default axis', () => {
    const restored = parseDocument(serializeDocument(fixture({ reversed: true })))
    expect(revolution(restored).reversed).toBe(true)
    expect(Object.hasOwn(revolution(restored), 'axis')).toBe(false)
  })

  it('keeps unresolved same-sketch line identity exact for kernel validation and repair', () => {
    const axis = { kind: 'sketch-line', entityId: ' retained-line-id ' } as const
    const original = fixture({ axis })
    const restored = parseDocument(serializeDocument(original))
    expect(revolution(restored).axis).toEqual(axis)
    const copy = revolution(validateDocument(original)).axis!
    if (copy.kind !== 'sketch-line') throw new Error('Expected a line reference')
    copy.entityId = 'changed-outside'
    expect(revolution(original).axis).toEqual(axis)
  })

  it('retains the existing sketch dependency rather than treating entity IDs as features', () => {
    const document = fixture({ axis: { kind: 'sketch-line', entityId: 'not-a-feature' } })
    expect(() => validateDocument({ ...document, features: [document.features[1]] })).toThrow('croquis anterior')
    expect(() => validateDocument({ ...document, features: [...document.features].reverse() })).toThrow('croquis anterior')
    expect(removeFeature(document, 'profile').features).toEqual([])
  })

  it('undoes an explicit axis change back to absent legacy fields and redoes the exact choice', () => {
    const initial = fixture()
    const history = new DocumentHistory(initial)
    history.apply(updateFeature(initial, 'revolution', {
      axis: { kind: 'sketch-line', entityId: 'construction-line' }, reversed: true, angle: 90,
    }))
    expect(serializeDocument(history.undo())).toBe(JSON.stringify(initial, null, 2))
    expect(revolution(history.redo())).toMatchObject({
      axis: { kind: 'sketch-line', entityId: 'construction-line' }, reversed: true, angle: 90,
    })
  })
})

describe('strict revolution axis parsing', () => {
  it.each([
    undefined, null, [], 'x', {}, { kind: 'unknown' },
    { kind: 'sketch-axis' }, { kind: 'sketch-axis', axis: 'X' }, { kind: 'sketch-axis', axis: 'z' },
    { kind: 'sketch-axis', axis: 'x', entityId: 'line' },
    { kind: 'sketch-axis', axis: 'x', extra: false },
    { kind: 'sketch-line' }, { kind: 'sketch-line', entityId: 'line', axis: 'x' },
    { kind: 'sketch-line', entityId: 'line', extra: false },
    ...[undefined, null, 42, '', '   ', 'x'.repeat(129), 'line\nnext', 'line\u007f'].map(entityId => ({ kind: 'sketch-line', entityId })),
  ])('rejects malformed axis %j rather than falling back to local Y', (axis) => {
    expect(() => validateDocument(fixture({ axis }))).toThrow('axis')
  })

  it.each([undefined, null, 0, 1, 'false', [], {}])('rejects nonboolean direction %j', (reversed) => {
    expect(() => validateDocument(fixture({ reversed }))).toThrow('reversed')
  })

  it.each([0, -90, 360.0001, NaN, Infinity, -Infinity])('rejects invalid positive sweep %s', (angle) => {
    expect(() => validateDocument(fixture({ angle, reversed: true }))).toThrow('angle')
  })

  it.each([0.001, 90, 360])('retains positive sweep %s regardless of direction', (angle) => {
    expect(revolution(validateDocument(fixture({ angle, reversed: true }))).angle).toBe(angle)
  })
})
