import { describe, expect, it } from 'vitest'
import { SKETCH_SOLVER_TOLERANCE, solveSketch } from './solver'
import type { EntityProfile, SketchConstraint, SketchEntity } from './types'

const line = (id: string, start: string, end: string): SketchEntity => ({ id, type: 'line', start, end, construction: false })
const circle = (id: string, center: string, radius: number): SketchEntity => ({ id, type: 'circle', center, radius, construction: false })
const point = (id: string, x: number, y: number) => ({ id, x, y })
const fix = (id: string, pointId: string, x: number, y: number): SketchConstraint => ({ id, type: 'fix', pointId, x, y })
const length = (id: string, entityId: string, value: number): SketchConstraint => ({ id, type: 'length', entityId, value })
const coordinate = (profile: EntityProfile, id: string) => profile.points.find((item) => item.id === id)!
const profile = (points: EntityProfile['points'], entities: SketchEntity[], constraints: SketchConstraint[] = []): EntityProfile => ({ kind: 'entities', points, entities, constraints })

function rectangle(): EntityProfile {
  return profile(
    [point('a', 2, 3), point('b', 92, 5), point('c', 95, 70), point('d', 0, 68)],
    [line('ab', 'a', 'b'), line('bc', 'b', 'c'), line('cd', 'c', 'd'), line('da', 'd', 'a')],
    [
      { id: 'atOrigin', type: 'coincident', a: 'a', b: 'origin' },
      { id: 'h1', type: 'horizontal', entityId: 'ab' }, { id: 'h2', type: 'horizontal', entityId: 'cd' },
      { id: 'v1', type: 'vertical', entityId: 'bc' }, { id: 'v2', type: 'vertical', entityId: 'da' },
      { id: 'width', type: 'distanceX', a: 'a', b: 'b', value: 100 },
      { id: 'height', type: 'distanceY', a: 'b', b: 'c', value: 70 },
    ],
  )
}

describe('independent local sketch solver', () => {
  it('fully defines a rectangle relative to the immutable origin and moves it on a dimension edit', () => {
    const first = solveSketch(rectangle())
    expect(first.status, first.message).toBe('fullyDefined')
    expect(first.degreesOfFreedom).toBe(0)
    expect(first.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE)
    expect(coordinate(first.profile, 'a').x).toBeCloseTo(0, 6)
    expect(coordinate(first.profile, 'c').x).toBeCloseTo(100, 6)
    expect(coordinate(first.profile, 'c').y).toBeCloseTo(70, 6)
    const edited = structuredClone(first.profile)
    const width = edited.constraints.find((item) => item.id === 'width')!
    if (width.type === 'distanceX') width.value = 135
    const second = solveSketch(edited)
    expect(second.status, second.message).toBe('fullyDefined')
    expect(coordinate(second.profile, 'b').x).toBeCloseTo(135, 6)
    expect(coordinate(second.profile, 'd').x).toBeCloseTo(0, 6)
    expect(coordinate(second.profile, 'c').y).toBeCloseTo(70, 6)
  })

  it('counts rigid translations as free when the rectangle is not anchored', () => {
    const input = rectangle()
    input.constraints = input.constraints.filter((constraint) => constraint.id !== 'atOrigin')
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(2)
    const centroid = (value: EntityProfile, axis: 'x' | 'y') => value.points.reduce((sum, p) => sum + p[axis], 0) / value.points.length
    expect(centroid(result.profile, 'x')).toBeCloseTo(centroid(input, 'x'), 5)
    expect(centroid(result.profile, 'y')).toBeCloseTo(centroid(input, 'y'), 5)
  })

  it('solves circle centre and radius independently', () => {
    const input = profile([point('p', 5, 8)], [circle('c', 'p', 3)], [
      { id: 'centre', type: 'coincident', a: 'p', b: 'origin' }, { id: 'radius', type: 'radius', entityId: 'c', value: 12 },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(coordinate(result.profile, 'p').x).toBeCloseTo(0, 6)
    const solvedCircle = result.profile.entities[0]
    expect(solvedCircle.type).toBe('circle')
    if (solvedCircle.type === 'circle') expect(solvedCircle.radius).toBeCloseTo(12, 6)
    expect(result.degreesOfFreedom).toBe(0)
  })

  it('does not constrain the centre of an equal-radius circle', () => {
    const input = profile([point('a', 3, 7), point('b', 20, 30)], [circle('ca', 'a', 4), circle('cb', 'b', 7)], [
      { id: 'same', type: 'equal', a: 'ca', b: 'cb' }, { id: 'r', type: 'radius', entityId: 'ca', value: 9 },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(4)
    expect(result.profile.points).toEqual(input.points)
    for (const entity of result.profile.entities) if (entity.type === 'circle') expect(entity.radius).toBeCloseTo(9, 6)
  })

  it('solves a right triangle and identifies a consistent dependent length', () => {
    const input = profile([point('a', 0, 0), point('b', 39, 2), point('c', -2, 28)], [line('ab', 'a', 'b'), line('ac', 'a', 'c'), line('bc', 'b', 'c')], [
      fix('anchor', 'a', 0, 0), { id: 'horizontal', type: 'horizontal', entityId: 'ab' },
      { id: 'perp', type: 'perpendicular', a: 'ab', b: 'ac' }, length('w', 'ab', 40), length('h', 'ac', 30), length('hypotenuse', 'bc', 50),
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(result.degreesOfFreedom).toBe(0)
    expect(result.redundantConstraintIds).toContain('hypotenuse')
    expect(coordinate(result.profile, 'c').x).toBeCloseTo(0, 5)
    expect(coordinate(result.profile, 'c').y).toBeCloseTo(30, 5)
  })

  it('applies parallelism and equal lengths without collapsing either line', () => {
    const input = profile([point('a', 0, 0), point('b', 20, 0), point('c', 0, 8), point('d', 12, 10)], [line('ab', 'a', 'b'), line('cd', 'c', 'd')], [
      fix('fa', 'a', 0, 0), fix('fb', 'b', 20, 0), fix('fc', 'c', 0, 8),
      { id: 'parallel', type: 'parallel', a: 'ab', b: 'cd' }, { id: 'equal', type: 'equal', a: 'ab', b: 'cd' },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(coordinate(result.profile, 'd').x).toBeCloseTo(20, 6)
    expect(coordinate(result.profile, 'd').y).toBeCloseTo(8, 6)
  })

  it('uses signed distanceX/Y from a to b', () => {
    const input = profile([point('p', 2, 4)], [circle('c', 'p', 1)], [
      { id: 'dx', type: 'distanceX', a: 'origin', b: 'p', value: -25 },
      { id: 'dy', type: 'distanceY', a: 'origin', b: 'p', value: 18 },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(1)
    expect(coordinate(result.profile, 'p').x).toBeCloseTo(-25, 6)
    expect(coordinate(result.profile, 'p').y).toBeCloseTo(18, 6)
  })

  it('retains the nearby reflected branch of an unsigned distance', () => {
    const input = profile([point('p', -9, 0)], [line('l', 'origin', 'p')], [
      { id: 'h', type: 'horizontal', entityId: 'l' }, { id: 'distance', type: 'distance', a: 'origin', b: 'p', value: 20 },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(coordinate(result.profile, 'p').x).toBeCloseTo(-20, 6)
  })

  it('puts a point on the infinite extension of a line', () => {
    const input = profile([point('b', 10, 0), point('p', 25, 3)], [line('l', 'origin', 'b')], [
      fix('end', 'b', 10, 0), { id: 'onLine', type: 'pointOnLine', pointId: 'p', entityId: 'l' },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(1)
    expect(coordinate(result.profile, 'p').x).toBeCloseTo(25, 4)
    expect(coordinate(result.profile, 'p').y).toBeCloseTo(0, 6)
  })

  it('includes the equal-radius intrinsic arc equation without a user relation', () => {
    const input = profile([point('c', 0, 0), point('s', 5, 0), point('e', 0, 7)], [{ id: 'arc', type: 'arc', center: 'c', start: 's', end: 'e', clockwise: false, construction: false }])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(5)
    const center = coordinate(result.profile, 'c'), start = coordinate(result.profile, 's'), end = coordinate(result.profile, 'e')
    expect(Math.hypot(start.x - center.x, start.y - center.y)).toBeCloseTo(Math.hypot(end.x - center.x, end.y - center.y), 6)
    expect(result.profile.entities[0]).toMatchObject({ clockwise: false })
  })

  it('solves an arc radius with fixed centre and endpoint directions', () => {
    const input = profile([point('s', 4, 0), point('e', 0, 6)], [
      { id: 'arc', type: 'arc', center: 'origin', start: 's', end: 'e', clockwise: true, construction: false },
    ], [
      { id: 'ys', type: 'distanceY', a: 'origin', b: 's', value: 0 },
      { id: 'xe', type: 'distanceX', a: 'origin', b: 'e', value: 0 },
      { id: 'radius', type: 'radius', entityId: 'arc', value: 10 },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(coordinate(result.profile, 's').x).toBeCloseTo(10, 6)
    expect(coordinate(result.profile, 'e').y).toBeCloseTo(10, 6)
    expect(result.profile.entities[0]).toMatchObject({ clockwise: true })
  })

  it('reports compatible duplicated constraints separately without reducing DOF twice', () => {
    const input = profile([point('a', 0, 0), point('b', 10, 2)], [line('l', 'a', 'b')], [
      { id: 'h1', type: 'horizontal', entityId: 'l' }, { id: 'h2', type: 'horizontal', entityId: 'l' },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(3)
    expect(result.redundantConstraintIds).toEqual(['h2'])
    expect(result.conflictingConstraintIds).toEqual([])
  })

  it('identifies incompatible dimensions and preserves the original geometry', () => {
    const input = profile([point('p', 12, 0)], [line('l', 'origin', 'p')], [
      { id: 'h', type: 'horizontal', entityId: 'l' }, length('length10', 'l', 10), length('length20', 'l', 20),
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('inconsistent')
    expect(result.degreesOfFreedom).toBeNull()
    expect(result.conflictingConstraintIds).toEqual(expect.arrayContaining(['length10', 'length20']))
    expect(result.profile).toEqual(input)
    expect(result.maxResidual).toBeGreaterThan(1)
  })

  it('never moves the immutable origin, even for an impossible fix constraint', () => {
    const result = solveSketch(profile([], [], [fix('badOrigin', 'origin', 5, 0)]))
    expect(result.status, result.message).toBe('inconsistent')
    expect(result.conflictingConstraintIds).toEqual(['badOrigin'])
    expect(result.profile.points).toEqual([])
  })

  it('does not fake a solution to a line perpendicular to itself', () => {
    const result = solveSketch(profile([point('p', 10, 0)], [line('l', 'origin', 'p')], [{ id: 'perp', type: 'perpendicular', a: 'l', b: 'l' }]))
    expect(result.status, result.message).toBe('inconsistent')
    expect(result.conflictingConstraintIds).toContain('perp')
  })

  it.each(['parallel', 'perpendicular'] as const)('solves %s even at the stationary extremum of a sine/cosine residual', (relation) => {
    const input = profile([point('a', 10, 0), point('b', relation === 'parallel' ? 0 : 10, relation === 'parallel' ? 10 : 0)], [line('la', 'origin', 'a'), line('lb', 'origin', 'b')], [
      fix('anchorA', 'a', 10, 0), length('bLength', 'lb', 10), { id: 'orientation', type: relation, a: 'la', b: 'lb' },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    const b = coordinate(result.profile, 'b')
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(10, 6)
    expect(relation === 'parallel' ? Math.abs(b.y) : Math.abs(b.x)).toBeLessThan(SKETCH_SOLVER_TOLERANCE)
  })

  it('does not collapse a line to satisfy horizontal and vertical together', () => {
    const input = profile([point('p', 10, 5)], [line('l', 'origin', 'p')], [
      { id: 'h', type: 'horizontal', entityId: 'l' }, { id: 'v', type: 'vertical', entityId: 'l' },
    ])
    const result = solveSketch(input)
    expect(['invalid', 'inconsistent', 'notConverged']).toContain(result.status)
    expect(result.profile).toEqual(input)
    expect(result.degreesOfFreedom).toBeNull()
  })

  it.each([
    profile([point('p', 0, 0)], [line('l', 'origin', 'p')]),
    profile([], [circle('c', 'origin', 0)]),
    profile([point('p', 2, 0)], [{ id: 'a', type: 'arc', center: 'origin', start: 'p', end: 'p', clockwise: false, construction: false }]),
    profile([point('p', Number.NaN, 0)], [circle('c', 'p', 2)]),
    profile([point('p', Infinity, 0)], [circle('c', 'p', 2)]),
  ])('rejects zero or invalid geometry (%#)', (input) => {
    const result = solveSketch(input)
    expect(result.status).toBe('invalid')
    expect(result.degreesOfFreedom).toBeNull()
  })

  it('reports a singular positive-distance constraint instead of false full definition', () => {
    const input = profile([point('p', 0, 0)], [], [{ id: 'distance', type: 'distance', a: 'origin', b: 'p', value: 20 }])
    const result = solveSketch(input)
    expect(result.status).toBe('notConverged')
    expect(result.message).toContain('singular')
    expect(result.degreesOfFreedom).toBeNull()
  })

  it('allows empty and open sketches and counts unconstrained points', () => {
    expect(solveSketch(profile([], []))).toMatchObject({ status: 'underdefined', degreesOfFreedom: 0, maxResidual: 0 })
    const result = solveSketch(profile([point('a', 0, 0), point('b', 10, 4), point('unused', 7, 8)], [line('l', 'a', 'b')]))
    expect(result).toMatchObject({ status: 'underdefined', degreesOfFreedom: 6, maxResidual: 0 })
  })

  it('does not mutate frozen inputs and always returns detached nested data', () => {
    const input = rectangle()
    const snapshot = structuredClone(input)
    input.points.forEach(Object.freeze); input.entities.forEach(Object.freeze); input.constraints.forEach(Object.freeze)
    Object.freeze(input.points); Object.freeze(input.entities); Object.freeze(input.constraints); Object.freeze(input)
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(input).toEqual(snapshot)
    result.profile.points[0].x = 999
    expect(input.points[0].x).toBe(2)
    expect(result.profile.entities[0]).not.toBe(input.entities[0])
    expect(result.profile.constraints[0]).not.toBe(input.constraints[0])
  })

  it('is deterministic for the same profile', () => {
    expect(solveSketch(rectangle())).toEqual(solveSketch(rectangle()))
  })

  it('reports the explicit iteration limit without presenting a successful solution', () => {
    const input = rectangle()
    const result = solveSketch(input, { maxIterations: 0 })
    expect(result.status).toBe('notConverged')
    expect(result.profile).toEqual(input)
    expect(result.iterations).toBe(0)
    expect(result.degreesOfFreedom).toBeNull()
  })

  it('handles all 384 independent variables allowed by the file format', () => {
    const points = Array.from({ length: 128 }, (_, i) => point(`p${i}`, i * 4, 1))
    const entities = points.map((p, i) => circle(`c${i}`, p.id, 1))
    const constraints: SketchConstraint[] = points.flatMap((p, i) => [
      fix(`f${i}`, p.id, i * 4, 2), { id: `r${i}`, type: 'radius', entityId: `c${i}`, value: 2 },
    ])
    const result = solveSketch(profile(points, entities, constraints))
    expect(result.status, result.message).toBe('fullyDefined')
    expect(result.degreesOfFreedom).toBe(0)
    expect(result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE)
  })

  it('solves small geometry at a large world-coordinate offset', () => {
    const input = profile([point('a', 900000, 900000), point('b', 900000.05, 900000.002)], [line('l', 'a', 'b')], [
      fix('f', 'a', 900000, 900000), { id: 'h', type: 'horizontal', entityId: 'l' }, length('n', 'l', .02),
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('fullyDefined')
    expect(coordinate(result.profile, 'b').x).toBeCloseTo(900000.02, 6)
    expect(coordinate(result.profile, 'b').y).toBeCloseTo(900000, 6)
  })

  it('handles a fully connected 128-point system instead of imposing a smaller format cap', () => {
    const points = Array.from({ length: 128 }, (_, i) => point(`p${i}`, i * 2 + .03, .05 * Math.sin(i)))
    const entities = points.slice(1).map((_, i) => line(`l${i}`, `p${i}`, `p${i + 1}`))
    const constraints: SketchConstraint[] = [
      ...points.map((p, i) => fix(`f${i}`, p.id, i * 2, 0)),
      ...entities.map((entity, i) => length(`length${i}`, entity.id, 2)),
    ]
    const result = solveSketch(profile(points, entities, constraints))
    expect(result.status, result.message).toBe('fullyDefined')
    expect(result.degreesOfFreedom).toBe(0)
    expect(result.redundantConstraintIds).toHaveLength(127)
  })

  it('supports equal radius between an arc and a circle without adding concentricity', () => {
    const input = profile([point('s', 4, 0), point('e', 0, 5), point('c', 30, 10)], [
      { id: 'arc', type: 'arc', center: 'origin', start: 's', end: 'e', clockwise: false, construction: false }, circle('circle', 'c', 7),
    ], [
      { id: 'equal', type: 'equal', a: 'arc', b: 'circle' },
      { id: 'radius', type: 'radius', entityId: 'circle', value: 9 },
    ])
    const result = solveSketch(input)
    expect(result.status, result.message).toBe('underdefined')
    expect(result.degreesOfFreedom).toBe(4)
    expect(coordinate(result.profile, 'c')).toEqual(coordinate(input, 'c'))
    for (const id of ['s', 'e']) {
      const p = coordinate(result.profile, id)
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(9, 6)
    }
  })
})
