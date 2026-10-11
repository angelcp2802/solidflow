import { describe, expect, it } from 'vitest'
import type { Feature, SketchFeature, SweepFeature } from '../cad/kernel.types'
import type { EntityProfile, SketchEntity, SketchPoint } from '../sketch/types'
import { featureSketchIds, orderedSweepPath } from './featureInputs'

const point = (id: string, x: number, y = 0): SketchPoint => ({ id, x, y })
const line = (id: string, start: string, end: string, construction = false): SketchEntity =>
  ({ id, type: 'line', start, end, construction })
function sketch(points: SketchPoint[], entities: SketchEntity[]): SketchFeature {
  return {
    id: 'path', name: 'Trayectoria', type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
    profile: { kind: 'entities', points, entities, constraints: [] },
  }
}

describe('ordered sweep path', () => {
  it('orders a mixed chain by adjacency and records traversal against each entity direction', () => {
    const path = sketch(
      [point('a', 0), point('b', 10), point('c', 20, 10), point('d', 20, 20), point('center', 10, 10)],
      [line('tail', 'd', 'c'),
        { id: 'arc', type: 'arc', start: 'b', end: 'c', center: 'center', clockwise: false, construction: false },
        line('head', 'a', 'b')],
    )
    const snapshot = structuredClone(path)
    expect(orderedSweepPath(path)).toEqual([
      { entityId: 'head', reversed: false }, { entityId: 'arc', reversed: false }, { entityId: 'tail', reversed: true },
    ])
    expect(path).toEqual(snapshot)
  })

  it('keeps direction through array permutations and dimensional edits that reorder coordinates', () => {
    const path = sketch([point('a', 0), point('b', 10), point('c', 20)], [line('z', 'a', 'b'), line('a', 'c', 'b')])
    const expected = [{ entityId: 'a', reversed: false }, { entityId: 'z', reversed: true }]
    expect(orderedSweepPath(path)).toEqual(expected)
    const changed = structuredClone(path)
    const profile = changed.profile as EntityProfile
    profile.entities.reverse()
    profile.points.reverse().forEach((point) => { point.x = 100 - point.x })
    expect(orderedSweepPath(changed)).toEqual(expected)
  })

  it('uses the stored start role for a single line or clockwise arc', () => {
    expect(orderedSweepPath(sketch([point('b', 30)], [line('line', 'b', 'origin')]))).toEqual([{ entityId: 'line', reversed: false }])
    expect(orderedSweepPath(sketch([point('a', 10), point('b', 0, -10)], [{
      id: 'arc', type: 'arc', center: 'origin', start: 'a', end: 'b', clockwise: true, construction: false,
    }]))).toEqual([{ entityId: 'arc', reversed: false }])
  })

  it('joins distinct point IDs by local coordinate tolerance and ignores construction', () => {
    const path = sketch([point('a', 0), point('b', 10), point('b-copy', 10 + 0.5e-5), point('c', 20)], [
      line('a-line', 'a', 'b'), line('b-line', 'b-copy', 'c'), line('aux', 'a', 'c', true),
      { id: 'aux-circle', type: 'circle', center: 'a', radius: 5, construction: true },
    ])
    expect(orderedSweepPath(path)).toHaveLength(2)
    const outside = structuredClone(path)
    ;(outside.profile as EntityProfile).points[2].x = 10 + 2e-5
    expect(() => orderedSweepPath(outside)).toThrow('conectada')
  })

  it('rejects a branch and cannot overlook disconnected closed components', () => {
    expect(() => orderedSweepPath(sketch(
      [point('a', 0), point('b', 10), point('c', 20), point('d', 10, 10)],
      [line('a-line', 'a', 'b'), line('b-line', 'b', 'c'), line('branch', 'b', 'd')],
    ))).toThrow('ramificaciones')
    expect(() => orderedSweepPath(sketch(
      [point('a', 0), point('b', 10), point('c', 100), point('d', 110), point('e', 110, 10)],
      [line('a-line', 'a', 'b'), line('cycle1', 'c', 'd'), line('cycle2', 'd', 'e'), line('cycle3', 'e', 'c')],
    ))).toThrow('desconectadas')
  })

  it('rejects closed loops, productive circles, zero length curves and empty paths', () => {
    expect(() => orderedSweepPath(sketch([point('a', 0), point('b', 10)], [line('one', 'a', 'b'), line('two', 'b', 'a')]))).toThrow('abierta')
    expect(() => orderedSweepPath(sketch([], [{ id: 'circle', type: 'circle', center: 'origin', radius: 5, construction: false }]))).toThrow('círculos')
    expect(() => orderedSweepPath(sketch([], [line('zero', 'origin', 'origin')]))).toThrow('abierta')
    expect(() => orderedSweepPath(sketch([], []))).toThrow('1 y 128')
    expect(() => orderedSweepPath({ ...sketch([], []), profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } })).toThrow('cadena abierta')
  })

  it('reports malformed endpoint references and duplicate entities before producing an order', () => {
    expect(() => orderedSweepPath(sketch([], [line('missing', 'origin', 'lost')]))).toThrow('punto válido')
    expect(() => orderedSweepPath(sketch([point('end', 10)], [line('same', 'origin', 'end'), line('same', 'end', 'origin')]))).toThrow('duplicados')
  })

  it('does not silently merge endpoints beyond tolerance through an intermediate near point', () => {
    const path = sketch([point('a', -10), point('b', 0), point('c', 0.75e-5), point('d', 1.5e-5), point('e', 10), point('f', 20)], [
      line('one', 'a', 'b'), line('two', 'c', 'e'), line('three', 'd', 'f'),
    ])
    expect(() => orderedSweepPath(path)).toThrow('ambigua')
  })
})

describe('feature sketch inputs', () => {
  it('preserves semantic input order and gives detached arrays for every feature family', () => {
    const sweep: SweepFeature = {
      id: 'sweep', name: 'Barrido', type: 'sweep', suppressed: false,
      profileSketchId: 'profile', pathSketchId: 'path', path: [{ entityId: 'line', reversed: false }], orientation: 'followPath', merge: true,
    }
    const loft: Feature = {
      id: 'loft', name: 'Recubrimiento', type: 'loft', suppressed: false, ruled: false, merge: true,
      sections: [{ sketchId: 'last-in-tree', startEntityId: null, reversed: false }, { sketchId: 'first-in-tree', startEntityId: 'line', reversed: true }],
    }
    expect(featureSketchIds(sweep)).toEqual(['profile', 'path'])
    const ids = featureSketchIds(loft)
    expect(ids).toEqual(['last-in-tree', 'first-in-tree'])
    ids.reverse()
    expect(featureSketchIds(loft)[0]).toBe('last-in-tree')
    expect(featureSketchIds(sketch([], []))).toEqual([])
    expect(featureSketchIds({ id: 'extrude', name: 'Extrusión', type: 'extrude', suppressed: false, sketchId: 'profile', depth: 10, symmetric: false })).toEqual(['profile'])
    expect(featureSketchIds({ id: 'plane', name: 'Plano', type: 'plane', suppressed: false, offset: 10, reversed: false, support: { kind: 'principal', plane: 'XY' } })).toEqual([])
  })
})
