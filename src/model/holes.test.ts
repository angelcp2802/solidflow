import { describe, expect, it } from 'vitest'
import type { ExtrudeFeature, HoleEndCondition, HoleFeature, HoleHead, LinearPatternFeature, PlaneSupport, ReferencePlaneFeature, SketchFeature } from '../cad/kernel.types'
import { createDemoDocument, createDocument, DocumentHistory, MAX_HOLE_POSITIONS, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'
import { featureDependencyIds, featureSketchIds, hasBaseFeature } from './featureInputs'

const sketch = (id = 'profile'): SketchFeature => ({
  id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [0, 0], width: 100, height: 70 },
})
const solid = (id = 'base', sketchId = 'profile'): ExtrudeFeature => ({
  id, name: id, type: 'extrude', sketchId, suppressed: false, depth: 40, symmetric: false,
})
const plane: ReferencePlaneFeature = {
  id: 'entry-plane', name: 'Entrada', type: 'plane', suppressed: false,
  support: { kind: 'principal', plane: 'XY' }, offset: 40, reversed: false,
}
const face = (sourceFeatureId = 'base', key = 'face-v1|stored-top-face') => ({ sourceFeatureId, key })
const hole = (): HoleFeature => ({
  id: 'hole', name: 'Taladros', type: 'hole', suppressed: false, baseFeatureId: 'base',
  support: { kind: 'plane', planeId: plane.id }, reversed: false, diameter: 10,
  positions: [{ id: 'left', x: -20, y: 0 }, { id: 'right', x: 20, y: 0 }],
  endCondition: { kind: 'blind', depth: 20, depthReference: 'shoulder', tip: { kind: 'conical', angle: 118 } },
  head: { kind: 'simple' },
})
const heads: HoleHead[] = [
  { kind: 'simple' }, { kind: 'counterbore', diameter: 18, depth: 4 },
  { kind: 'countersink', diameter: 18, angle: 90 },
]
const ends: HoleEndCondition[] = [
  { kind: 'blind', depth: 20, depthReference: 'shoulder', tip: { kind: 'flat' } },
  { kind: 'blind', depth: 20, depthReference: 'tip', tip: { kind: 'flat' } },
  { kind: 'blind', depth: 20, depthReference: 'shoulder', tip: { kind: 'conical', angle: 118 } },
  { kind: 'blind', depth: 20, depthReference: 'tip', tip: { kind: 'conical', angle: 118 } },
  { kind: 'throughAll' }, { kind: 'untilNext' },
]
const documentWith = (...features: unknown[]) => validateDocument({
  ...createDocument(), features: [sketch(), solid(), plane, ...features],
})

describe('hole wizard persistence', () => {
  it('round trips every head, end condition and direction without changing legacy documents', () => {
    for (const head of heads) for (const endCondition of ends) for (const reversed of [false, true]) {
      const feature = { ...hole(), head, endCondition, reversed }
      const document = documentWith(feature)
      expect(document.version).toBe(1)
      expect(parseDocument(serializeDocument(document))).toEqual(document)
      expect(document.features.at(-1)).toEqual(feature)
    }
    const legacy = createDemoDocument()
    expect(parseDocument(serializeDocument(legacy))).toEqual(legacy)
  })

  it('preserves stable position identity and order through edits, without geometric reassignment', () => {
    const initial = documentWith(hole())
    const positions = [{ id: 'right', x: -40, y: 5 }, { id: 'left', x: 40, y: -5 }]
    const changed = updateFeature(initial, 'hole', { positions })
    expect(parseDocument(serializeDocument(changed)).features.at(-1)).toMatchObject({ positions })
    expect(initial.features.at(-1)).toMatchObject({ positions: hole().positions })
    // Coincident centres and positions beyond the body require geometric checks,
    // not renumbering or silent removal during parsing.
    expect(() => documentWith({ ...hole(), positions: [
      { id: 'a', x: 1_000_000, y: -1_000_000 }, { id: 'b', x: 1_000_000, y: -1_000_000 },
    ] })).not.toThrow()
  })

  it('detaches positions, conical tips, head dimensions and face references', () => {
    const feature: HoleFeature = { ...hole(), support: { kind: 'face', face: face() }, head: heads[1] }
    const document = documentWith(feature)
    const copy = validateDocument(document).features.at(-1) as HoleFeature
    copy.positions[0].x = 999
    copy.positions.reverse()
    if (copy.endCondition.kind !== 'blind' || copy.endCondition.tip.kind !== 'conical' || copy.head.kind !== 'counterbore' || copy.support.kind !== 'face') throw new Error('Unexpected fixture')
    copy.endCondition.tip.angle = 90
    copy.head.depth = 5
    copy.support.face.key = 'face-v1|changed-copy'
    expect(document.features.at(-1)).toEqual(feature)
    feature.positions[0].id = 'changed-input'
    expect(document.features.at(-1)).toMatchObject({ positions: hole().positions })
  })

  it('requires every feature field and every nested variant field', () => {
    for (const head of heads) for (const endCondition of ends) {
      const feature = { ...hole(), head, endCondition }
      for (const key of Object.keys(feature)) {
        const candidate = { ...feature } as Record<string, unknown>
        delete candidate[key]
        expect(() => documentWith(candidate), key).toThrow()
      }
      for (const [field, value] of [['head', head], ['endCondition', endCondition], ['positions', feature.positions[0]]] as const) {
        for (const key of Object.keys(value)) {
          const candidate = { ...value } as Record<string, unknown>
          delete candidate[key]
          expect(() => documentWith({ ...feature, [field]: field === 'positions' ? [candidate] : candidate })).toThrow(field)
        }
      }
      if (endCondition.kind === 'blind') {
        for (const key of Object.keys(endCondition.tip)) {
          const tip = { ...endCondition.tip } as Record<string, unknown>
          delete tip[key]
          expect(() => documentWith({ ...feature, endCondition: { ...endCondition, tip } })).toThrow('endCondition.tip')
        }
      }
    }
  })

  it('rejects unknown fields and incompatible contracts without coercion', () => {
    for (const candidate of [
      { ...hole(), sketchId: 'profile' }, { ...hole(), reversed: 1 }, { ...hole(), reversed: 'false' },
      { ...hole(), baseFeatureId: 'base\n' }, { ...hole(), support: null },
      { ...hole(), head: { kind: 'none' } }, { ...hole(), head: { kind: 'simple', diameter: 10 } },
      { ...hole(), head: { kind: 'counterbore', diameter: 18, depth: 4, angle: 90 } },
      { ...hole(), head: { kind: 'countersink', diameter: 18, angle: 90, depth: 4 } },
      { ...hole(), endCondition: { kind: 'untilNext', baseFeatureId: 'base' } },
      { ...hole(), endCondition: { kind: 'throughAll', bothDirections: false } },
      { ...hole(), endCondition: { kind: 'upToSurface', target: hole().support } },
      { ...hole(), endCondition: { kind: 'blind', depth: 20, depthReference: 'cylinder', tip: { kind: 'flat' } } },
      { ...hole(), endCondition: { kind: 'blind', depth: 20, depthReference: 'tip', tip: { kind: 'flat', angle: 118 } } },
      { ...hole(), endCondition: { kind: 'blind', depth: 20, depthReference: 'tip', tip: { kind: 'round' } } },
      { ...hole(), positions: [{ id: 'a', x: 0, y: 0, z: 0 }] },
    ]) expect(() => documentWith(candidate)).toThrow()
    for (const invalid of [null, [], true, 2, 'blind']) {
      expect(() => documentWith({ ...hole(), endCondition: invalid })).toThrow('endCondition')
      expect(() => documentWith({ ...hole(), head: invalid })).toThrow('head')
    }
  })

  it('requires one to 128 dense positions with unique valid identifiers', () => {
    const positions = Array.from({ length: MAX_HOLE_POSITIONS }, (_, index) => ({ id: `position-${index}`, x: index, y: -index }))
    expect(documentWith({ ...hole(), positions }).features.at(-1)).toMatchObject({ positions })
    for (const invalid of [
      [], new Array(1), null, [null], [...positions, { id: 'too-many', x: 0, y: 0 }],
      [{ id: 'a', x: 0, y: 0 }, { id: 'a', x: 5, y: 5 }],
      [{ id: '', x: 0, y: 0 }], [{ id: 'bad\nidentifier', x: 0, y: 0 }],
      [{ id: 'x'.repeat(129), x: 0, y: 0 }], [{ id: 1, x: 0, y: 0 }],
    ]) expect(() => documentWith({ ...hole(), positions: invalid })).toThrow('positions')
  })

  it('bounds finite local coordinates without clipping them to the selected face', () => {
    for (const coordinate of [NaN, Infinity, -Infinity, -1_000_001, 1_000_001, '3']) {
      for (const axis of ['x', 'y']) expect(() => documentWith({ ...hole(), positions: [{ id: 'a', x: 0, y: 0, [axis]: coordinate }] })).toThrow(`positions[0].${axis}`)
    }
    for (const coordinate of [-1_000_000, 0, 1_000_000]) {
      expect(() => documentWith({ ...hole(), positions: [{ id: 'a', x: coordinate, y: coordinate }] })).not.toThrow()
    }
  })

  it('bounds all physical dimensions and included angles', () => {
    for (const value of [NaN, Infinity, -Infinity, -1, 0, 0.001, 100_001, '10']) {
      expect(() => documentWith({ ...hole(), diameter: value })).toThrow('diameter')
      expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth: value, depthReference: 'shoulder', tip: { kind: 'flat' } } })).toThrow('endCondition.depth')
      expect(() => documentWith({ ...hole(), head: { kind: 'counterbore', diameter: value, depth: 4 } })).toThrow('head.diameter')
      expect(() => documentWith({ ...hole(), head: { kind: 'counterbore', diameter: 18, depth: value } })).toThrow('head.depth')
      expect(() => documentWith({ ...hole(), head: { kind: 'countersink', diameter: value, angle: 90 } })).toThrow('head.diameter')
    }
    for (const angle of [NaN, Infinity, -1, 0, 0.99, 179.01, 180, '118']) {
      expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth: 20, depthReference: 'shoulder', tip: { kind: 'conical', angle } } })).toThrow('endCondition.tip.angle')
      expect(() => documentWith({ ...hole(), head: { kind: 'countersink', diameter: 18, angle } })).toThrow('head.angle')
    }
    for (const diameter of [0.01, 100_000]) expect(() => documentWith({ ...hole(), diameter })).not.toThrow()
    for (const depth of [0.01, 100_000]) expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth, depthReference: 'shoulder', tip: { kind: 'flat' } } })).not.toThrow()
    for (const angle of [1, 179]) {
      expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth: 20, depthReference: 'shoulder', tip: { kind: 'conical', angle } } })).not.toThrow()
      expect(() => documentWith({ ...hole(), endCondition: { kind: 'throughAll' }, head: { kind: 'countersink', diameter: 18, angle } })).not.toThrow()
    }
  })

  it('requires counterbore and countersink entrances to exceed the shaft diameter', () => {
    for (const diameter of [5, 10]) {
      expect(() => documentWith({ ...hole(), head: { kind: 'counterbore', diameter, depth: 4 } })).toThrow('head.diameter')
      expect(() => documentWith({ ...hole(), head: { kind: 'countersink', diameter, angle: 90 } })).toThrow('head.diameter')
    }
  })

  it('requires a positive cylinder when blind depth measures to the conical tip', () => {
    // A 90 degree included tip with diameter 10 has an axial height of 5 mm.
    for (const depth of [4, 5]) {
      expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth, depthReference: 'tip', tip: { kind: 'conical', angle: 90 } } })).toThrow('tramo cilíndrico positivo')
      expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth, depthReference: 'shoulder', tip: { kind: 'conical', angle: 90 } } })).not.toThrow()
    }
    expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth: 5.01, depthReference: 'tip', tip: { kind: 'conical', angle: 90 } } })).not.toThrow()
    expect(() => documentWith({ ...hole(), endCondition: { kind: 'blind', depth: 0.01, depthReference: 'tip', tip: { kind: 'flat' } } })).not.toThrow()
  })

  it('limits counterbore depth to the effective cylinder for both blind depth references', () => {
    for (const depthReference of ['shoulder', 'tip'] as const) {
      const endCondition: HoleEndCondition = { kind: 'blind', depth: 15, depthReference, tip: { kind: 'conical', angle: 90 } }
      const maximum = depthReference === 'shoulder' ? 15 : 10
      expect(() => documentWith({ ...hole(), endCondition, head: { kind: 'counterbore', diameter: 18, depth: maximum } })).not.toThrow()
      expect(() => documentWith({ ...hole(), endCondition, head: { kind: 'counterbore', diameter: 18, depth: maximum + 0.01 } })).toThrow('head.depth')
    }
  })

  it('limits countersink geometric depth and handles equality without a floating-point false rejection', () => {
    // Diameter 16 to diameter 10 at 90 degrees occupies exactly 3 mm axially.
    const head: HoleHead = { kind: 'countersink', diameter: 16, angle: 90 }
    for (const depthReference of ['shoulder', 'tip'] as const) {
      const depth = depthReference === 'shoulder' ? 3 : 8
      expect(() => documentWith({ ...hole(), head, endCondition: { kind: 'blind', depth, depthReference, tip: { kind: 'conical', angle: 90 } } })).not.toThrow()
      expect(() => documentWith({ ...hole(), head, endCondition: { kind: 'blind', depth: depth - 0.01, depthReference, tip: { kind: 'conical', angle: 90 } } })).toThrow('head.angle')
    }
    // Automatic ends have no stored depth; the kernel determines their geometry.
    for (const endCondition of [{ kind: 'throughAll' }, { kind: 'untilNext' }] as HoleEndCondition[]) {
      expect(() => documentWith({ ...hole(), endCondition, head: { kind: 'counterbore', diameter: 18, depth: 100_000 } })).not.toThrow()
    }
  })
})

describe('hole dependencies, repair and history', () => {
  it('accepts earlier bases and all support kinds while requiring correct reference types', () => {
    for (const support of [{ kind: 'principal', plane: 'XZ' }, { kind: 'plane', planeId: plane.id }, { kind: 'face', face: face() }] as PlaneSupport[]) {
      expect(() => documentWith({ ...hole(), support })).not.toThrow()
    }
    for (const baseFeatureId of ['profile', plane.id, 'hole', 'missing', 'later']) {
      expect(() => documentWith({ ...hole(), baseFeatureId, suppressed: true }, solid('later'))).toThrow('baseFeatureId')
    }
    for (const planeId of ['profile', 'base', 'hole', 'missing', 'later']) {
      expect(() => documentWith({ ...hole(), support: { kind: 'plane', planeId } }, { ...plane, id: 'later' })).toThrow('support.planeId')
    }
    for (const sourceFeatureId of ['profile', plane.id, 'hole', 'missing', 'later']) {
      expect(() => documentWith({ ...hole(), support: { kind: 'face', face: face(sourceFeatureId) } }, solid('later'))).toThrow('support.face.sourceFeatureId')
    }
    expect(() => documentWith(solid('newer'), hole())).not.toThrow()
  })

  it('retains lost support faces for repair but rejects malformed or transient face references', () => {
    const original = documentWith({ ...hole(), support: { kind: 'face', face: face('base', 'face-v1|no-longer-resolvable') } })
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    for (const key of ['face-v1|', 'edge-v1|wrong-kind', 'face-v2|future', 'face-v1|bad\nkey']) {
      expect(() => documentWith({ ...hole(), support: { kind: 'face', face: face('base', key) } })).toThrow('support.face.key')
    }
    expect(() => documentWith({ ...hole(), support: { kind: 'face', face: { ...face(), index: 2 } } })).toThrow('desconocido')
  })

  it('collects body and support dependencies once and does not consume a sketch', () => {
    expect(hasBaseFeature(hole())).toBe(true)
    expect(featureSketchIds(hole())).toEqual([])
    expect(featureDependencyIds(hole())).toEqual(['base', plane.id])
    expect(featureDependencyIds({ ...hole(), support: { kind: 'face', face: face() } })).toEqual(['base'])
    expect(featureDependencyIds({ ...hole(), support: { kind: 'face', face: face('historical') } })).toEqual(['base', 'historical'])
    expect(featureDependencyIds({ ...hole(), support: { kind: 'principal', plane: 'XY' } })).toEqual(['base'])
  })

  const pattern = (): LinearPatternFeature => ({
    id: 'pattern', name: 'Matriz de taladros', type: 'linearPattern', suppressed: false,
    baseFeatureId: 'hole', source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] },
    first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
  })
  const chain = () => documentWith(
    hole(), pattern(),
    { ...sketch('child-profile'), support: { kind: 'face', face: face('pattern') } }, solid('child', 'child-profile'),
    sketch('independent'),
  )

  it('allows holes as pattern seeds and as historical body, face and end-condition owners', () => {
    const document = chain()
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(document.features.find(feature => feature.id === 'pattern')).toMatchObject({ source: { featureIds: ['hole'] } })
    const bodyPattern = documentWith(hole(), { ...pattern(), source: { mode: 'body', sourceFeatureId: 'hole' } })
    expect(parseDocument(serializeDocument(bodyPattern))).toEqual(bodyPattern)
    const descendants = documentWith(hole(),
      { ...plane, id: 'after-hole', support: { kind: 'face', face: face('hole') } },
      { ...solid('later'), endCondition: { kind: 'throughAll', baseFeatureId: 'hole', bothDirections: false } },
    )
    expect(parseDocument(serializeDocument(descendants))).toEqual(descendants)
  })

  it('cascades base, support and hole deletion through patterns and supported sketches', () => {
    expect(removeFeature(chain(), 'base').features.map(feature => feature.id)).toEqual(['profile', plane.id, 'independent'])
    expect(removeFeature(chain(), plane.id).features.map(feature => feature.id)).toEqual(['profile', 'base', 'independent'])
    expect(removeFeature(chain(), 'hole').features.map(feature => feature.id)).toEqual(['profile', 'base', plane.id, 'independent'])
    const historical = documentWith(solid('old-support'), { ...hole(), support: { kind: 'face', face: face('old-support') } }, pattern())
    expect(removeFeature(historical, 'old-support').features.map(feature => feature.id)).toEqual(['profile', 'base', plane.id])
  })

  it('keeps suppression local and removes a dependency only after explicit support reassignment', () => {
    const original = chain()
    for (const id of ['base', plane.id, 'hole']) {
      const suppressed = updateFeature(original, id, { suppressed: true })
      expect(suppressed.features.filter(feature => feature.suppressed).map(feature => feature.id)).toEqual([id])
      expect(updateFeature(parseDocument(serializeDocument(suppressed)), id, { suppressed: false }).features).toEqual(original.features)
    }
    const changed = updateFeature(original, 'hole', { support: { kind: 'principal', plane: 'XY' } })
    expect(removeFeature(changed, plane.id).features.some(feature => feature.id === 'child')).toBe(true)
    expect(removeFeature(changed, 'base').features.some(feature => feature.id === 'hole')).toBe(false)
  })

  it('restores positions, ends and cascades with detached undo and redo snapshots', () => {
    const original = chain(), history = new DocumentHistory(original)
    const changed = history.apply(updateFeature(original, 'hole', {
      positions: [...hole().positions].reverse(), reversed: true, head: heads[2], endCondition: { kind: 'throughAll' },
    }))
    history.apply(removeFeature(changed, plane.id))
    expect(history.undo()).toEqual(changed)
    const restored = history.undo()
    expect(restored).toEqual(original)
    ;(restored.features.find(feature => feature.id === 'hole') as HoleFeature).positions[0].x = 999
    expect(history.current).toEqual(original)
    expect(history.redo()).toEqual(changed)
    expect(history.redo().features.map(feature => feature.id)).toEqual(['profile', 'base', 'independent'])
  })
})
