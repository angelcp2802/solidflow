import { describe, expect, it } from 'vitest'
import type { SketchFeature } from '../cad/kernel.types'
import type { EntityProfile } from '../sketch/types'
import { SKETCH_LIMITS, validateEntityProfile } from '../sketch/validation'
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature } from './document'

function profile(): EntityProfile {
  return {
    kind: 'entities',
    points: [{ id: 'p1', x: -5, y: -5 }, { id: 'p2', x: 5, y: -5 }, { id: 'p3', x: 5, y: 5 }],
    entities: [
      { id: 'l1', type: 'line', construction: false, start: 'p1', end: 'p2' },
      { id: 'l2', type: 'line', construction: true, start: 'origin', end: 'p3' },
      { id: 'c1', type: 'circle', construction: false, center: 'origin', radius: 5 },
      { id: 'a1', type: 'arc', construction: false, center: 'origin', start: 'p2', end: 'p3', clockwise: true },
    ],
    constraints: [
      { id: 'k1', type: 'fix', pointId: 'p1', x: -5, y: -5 },
      { id: 'k2', type: 'coincident', a: 'origin', b: 'p1' },
      { id: 'k3', type: 'horizontal', entityId: 'l1' },
      { id: 'k4', type: 'vertical', entityId: 'l2' },
      { id: 'k5', type: 'parallel', a: 'l1', b: 'l2' },
      { id: 'k6', type: 'perpendicular', a: 'l1', b: 'l2' },
      { id: 'k7', type: 'equal', a: 'l1', b: 'l2' },
      { id: 'k8', type: 'equal', a: 'c1', b: 'a1' },
      { id: 'k9', type: 'pointOnLine', pointId: 'p3', entityId: 'l1' },
      { id: 'k10', type: 'distance', a: 'origin', b: 'p1', value: 0.001 },
      { id: 'k11', type: 'distanceX', a: 'origin', b: 'p1', value: -5 },
      { id: 'k12', type: 'distanceY', a: 'origin', b: 'p1', value: 0 },
      { id: 'k13', type: 'length', entityId: 'l1', value: 10 },
      { id: 'k14', type: 'radius', entityId: 'c1', value: 5 },
      { id: 'k15', type: 'radius', entityId: 'a1', value: 5 },
    ],
  }
}

function sketch(input = profile()): SketchFeature {
  return { id: 'sketch-entities', name: 'Croquis de entidades', type: 'sketch', plane: 'XY', offset: 0, profile: input, suppressed: false }
}

describe('multi-entity sketch persistence', () => {
  it('round trips every entity and constraint family, including construction and origin references', () => {
    const document = addFeature(createDocument(), sketch())
    const loaded = parseDocument(serializeDocument(document))
    expect(loaded).toEqual(document)
    expect((loaded.features[0] as SketchFeature).profile).toEqual(profile())
    expect(document.version).toBe(1)
  })

  it('stores empty and open sketches without solving or imposing a closed region', () => {
    const empty: EntityProfile = { kind: 'entities', points: [], entities: [], constraints: [] }
    expect(parseDocument(serializeDocument(addFeature(createDocument(), sketch(empty))))).toMatchObject({ features: [{ profile: empty }] })
    const open: EntityProfile = {
      kind: 'entities', points: [{ id: 'p', x: 5, y: 10 }],
      entities: [{ id: 'line', type: 'line', construction: false, start: 'origin', end: 'p' }], constraints: [],
    }
    expect(validateEntityProfile(open)).toEqual(open)
  })

  it('preserves contradictions, redundancy and degenerate geometry for solver diagnostics', () => {
    const definition: EntityProfile = {
      kind: 'entities', points: [{ id: 'p', x: 1, y: 2 }],
      entities: [{ id: 'zero-line', type: 'line', construction: false, start: 'p', end: 'p' }],
      constraints: [
        { id: 'f1', type: 'fix', pointId: 'p', x: 0, y: 0 },
        { id: 'f2', type: 'fix', pointId: 'p', x: 10, y: 10 },
        { id: 'f3', type: 'fix', pointId: 'origin', x: 5, y: 0 },
        { id: 'self', type: 'perpendicular', a: 'zero-line', b: 'zero-line' },
        { id: 'h1', type: 'horizontal', entityId: 'zero-line' },
        { id: 'h2', type: 'horizontal', entityId: 'zero-line' },
      ],
    }
    const document = addFeature(createDocument(), sketch(definition))
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(definition.points).toEqual([{ id: 'p', x: 1, y: 2 }])
  })

  it('isolates nested profiles and restores constraints and geometry with undo and redo', () => {
    const initial = addFeature(createDocument(), sketch())
    const history = new DocumentHistory(initial)
    const modified = profile()
    modified.points[0].x = 15
    modified.constraints.push({ id: 'new-radius', type: 'radius', entityId: 'c1', value: 2 })
    const updated = updateFeature(initial, 'sketch-entities', { profile: modified })
    history.apply(updated)
    modified.points[0].y = 999
    const copied = history.current.features[0] as SketchFeature
    if (copied.profile.kind !== 'entities') throw new Error('Expected entity profile')
    copied.profile.constraints[0].id = 'mutated-return-value'
    expect(history.current).toEqual(updated)
    expect(history.undo()).toEqual(initial)
    expect(history.redo()).toEqual(updated)
  })
})

describe('strict entity profile structure', () => {
  it('requires every discriminated field and rejects fields from another entity type', () => {
    const original = profile()
    for (const entity of original.entities) {
      for (const key of Object.keys(entity)) {
        const incomplete: Record<string, unknown> = { ...entity }
        delete incomplete[key]
        expect(() => validateEntityProfile({ ...original, entities: [incomplete], constraints: [] })).toThrow()
      }
    }
    for (const constraint of original.constraints) {
      for (const key of Object.keys(constraint)) {
        const incomplete: Record<string, unknown> = { ...constraint }
        delete incomplete[key]
        expect(() => validateEntityProfile({ ...original, constraints: [incomplete] })).toThrow()
      }
    }
    expect(() => validateEntityProfile({ ...original, entities: [{ ...original.entities[0], radius: 2 }], constraints: [] })).toThrow('campo desconocido')
    expect(() => validateEntityProfile({ ...original, constraints: [{ ...original.constraints[0], value: 4 }] })).toThrow('campo desconocido')
    expect(() => validateEntityProfile({ ...original, solved: true })).toThrow('campo desconocido')
  })

  it('keeps identifiers unique across points, entities and constraints and reserves origin', () => {
    const input = profile()
    expect(() => validateEntityProfile({ ...input, points: [...input.points, input.points[0]] })).toThrow('duplicado')
    expect(() => validateEntityProfile({ ...input, entities: [{ ...input.entities[0], id: 'p1' }], constraints: [] })).toThrow('duplicado')
    expect(() => validateEntityProfile({ ...input, constraints: [{ ...input.constraints[0], id: 'c1' }] })).toThrow('duplicado')
    expect(() => validateEntityProfile({ ...input, constraints: [input.constraints[0], input.constraints[0]] })).toThrow('duplicado')
    expect(() => validateEntityProfile({ ...input, points: [{ id: 'origin', x: 0, y: 0 }] })).toThrow('reservada')
    expect(() => validateEntityProfile({ ...input, entities: [{ ...input.entities[0], id: 'origin' }], constraints: [] })).toThrow('reservada')
    expect(() => validateEntityProfile({ ...input, constraints: [{ ...input.constraints[0], id: 'origin' }] })).toThrow('reservada')
  })

  it('rejects dangling and cross-kind references in entities', () => {
    const input = profile()
    for (const entity of [
      { id: 'l', type: 'line', construction: false, start: 'missing', end: 'p1' },
      { id: 'c', type: 'circle', construction: false, center: 'l1', radius: 5 },
      { id: 'a', type: 'arc', construction: false, center: 'origin', start: 'p1', end: 'missing', clockwise: true },
    ]) {
      expect(() => validateEntityProfile({ ...input, entities: [entity], constraints: [] })).toThrow('punto existente')
    }
  })

  it.each([
    { id: 'bad', type: 'fix', pointId: 'l1', x: 0, y: 0 },
    { id: 'bad', type: 'coincident', a: 'p1', b: 'c1' },
    { id: 'bad', type: 'horizontal', entityId: 'c1' },
    { id: 'bad', type: 'vertical', entityId: 'a1' },
    { id: 'bad', type: 'parallel', a: 'l1', b: 'c1' },
    { id: 'bad', type: 'perpendicular', a: 'a1', b: 'l1' },
    { id: 'bad', type: 'equal', a: 'l1', b: 'a1' },
    { id: 'bad', type: 'equal', a: 'p1', b: 'p2' },
    { id: 'bad', type: 'pointOnLine', pointId: 'p1', entityId: 'c1' },
    { id: 'bad', type: 'pointOnLine', pointId: 'l1', entityId: 'l2' },
    { id: 'bad', type: 'distance', a: 'l1', b: 'p1', value: 1 },
    { id: 'bad', type: 'distanceX', a: 'p1', b: 'missing', value: -1 },
    { id: 'bad', type: 'distanceY', a: 'missing', b: 'origin', value: 0 },
    { id: 'bad', type: 'length', entityId: 'c1', value: 2 },
    { id: 'bad', type: 'radius', entityId: 'l1', value: 2 },
  ])('rejects invalid references for $type', (constraint) => {
    expect(() => validateEntityProfile({ ...profile(), constraints: [constraint] })).toThrow()
  })

  it.each([NaN, Infinity, -Infinity, 1_000_001, -1_000_001])('rejects invalid coordinate %s in points and fixed coordinates', (coordinate) => {
    expect(() => validateEntityProfile({ ...profile(), points: [{ id: 'p', x: coordinate, y: 0 }] })).toThrow('points[0].x')
    expect(() => validateEntityProfile({ ...profile(), constraints: [{ id: 'fix', type: 'fix', pointId: 'origin', x: 0, y: coordinate }] })).toThrow('constraints[0].y')
  })

  it('enforces positive distance, signed X/Y distance and minimum length/radius', () => {
    for (const value of [0, -1, NaN, Infinity, 100_001]) {
      expect(() => validateEntityProfile({ ...profile(), constraints: [{ id: 'd', type: 'distance', a: 'origin', b: 'p1', value }] })).toThrow('value')
    }
    for (const type of ['distanceX', 'distanceY'] as const) {
      for (const value of [-100_000, 0, 100_000]) {
        expect(() => validateEntityProfile({ ...profile(), constraints: [{ id: 'd', type, a: 'origin', b: 'p1', value }] })).not.toThrow()
      }
    }
    for (const value of [-1, 0, 0.009, NaN, 100_001]) {
      expect(() => validateEntityProfile({ ...profile(), constraints: [{ id: 'l', type: 'length', entityId: 'l1', value }] })).toThrow('value')
      expect(() => validateEntityProfile({ ...profile(), constraints: [{ id: 'r', type: 'radius', entityId: 'a1', value }] })).toThrow('value')
      expect(() => validateEntityProfile({ ...profile(), entities: [{ id: 'c', type: 'circle', center: 'origin', construction: false, radius: value }], constraints: [] })).toThrow('radius')
    }
    expect(() => validateEntityProfile({ ...profile(), constraints: [{ id: 'l', type: 'length', entityId: 'l1', value: 0.01 }] })).not.toThrow()
  })

  it('enforces structural collection limits without limiting solver variables', () => {
    const largest: EntityProfile = {
      kind: 'entities',
      points: Array.from({ length: SKETCH_LIMITS.maxPoints }, (_, index) => ({ id: `p${index}`, x: index, y: index })),
      entities: Array.from({ length: SKETCH_LIMITS.maxEntities }, (_, index) => ({ id: `c${index}`, type: 'circle', center: `p${index}`, radius: 2, construction: false })),
      constraints: Array.from({ length: SKETCH_LIMITS.maxConstraints }, (_, index) => ({ id: `constraint${index}`, type: 'radius', entityId: `c${index % SKETCH_LIMITS.maxEntities}`, value: 2 })),
    }
    expect(validateEntityProfile(largest)).toEqual(largest)
    expect(() => validateEntityProfile({ ...largest, points: [...largest.points, { id: 'extra', x: 0, y: 0 }] })).toThrow('hasta 128')
    expect(() => validateEntityProfile({ ...largest, entities: [...largest.entities, { ...largest.entities[0], id: 'extra' }] })).toThrow('hasta 128')
    expect(() => validateEntityProfile({ ...largest, constraints: [...largest.constraints, { ...largest.constraints[0], id: 'extra' }] })).toThrow('hasta 256')
  })

  it('does not coerce scalar types or accept sparse arrays', () => {
    expect(() => validateEntityProfile({ ...profile(), points: [{ id: 'p', x: '1', y: 0 }] })).toThrow('número finito')
    expect(() => validateEntityProfile({ ...profile(), entities: [{ ...profile().entities[0], construction: 'false' }] })).toThrow('verdadero o falso')
    expect(() => validateEntityProfile({ ...profile(), entities: [{ ...profile().entities[3], clockwise: 0 }] })).toThrow('verdadero o falso')
    expect(() => validateEntityProfile({ kind: 'entities', points: new Array(1), entities: [], constraints: [] })).toThrow('elemento obligatorio')
  })

  it('does not mutate a deeply frozen input definition', () => {
    const original = profile()
    original.points.forEach(Object.freeze)
    original.entities.forEach(Object.freeze)
    original.constraints.forEach(Object.freeze)
    Object.freeze(original.points)
    Object.freeze(original.entities)
    Object.freeze(original.constraints)
    Object.freeze(original)
    expect(validateEntityProfile(original)).toEqual(original)
  })
})
