import { describe, expect, it } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import type { SketchFeature, ThinWallDefinition } from './kernel.types';
import { makeContours } from './kernel.profiles';
import { prepareThinSection, thinContourArea } from './kernel.thin-wall';
import { resolveThinWall } from './thinWall';

function sketch(profile: SketchFeature['profile']): SketchFeature {
  return { id: 'source', name: 'Croquis', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile };
}
function chain(points: [number, number][], closed = false, prefix = 'a'): EntityProfile {
  return { kind: 'entities', points: points.map(([x, y], index) => ({ id: `${prefix}p${index}`, x, y })),
    entities: points.slice(0, closed ? points.length : -1).map((_, index) => ({ id: `${prefix}e${index}`, type: 'line', construction: false,
      start: `${prefix}p${index}`, end: `${prefix}p${(index + 1) % points.length}` })), constraints: [] };
}
function prepare(profile: SketchFeature['profile'], definition: ThinWallDefinition = { kind: 'one-side', thickness: 1, reversed: false }) {
  return prepareThinSection(sketch(profile), resolveThinWall({ thinWall: definition })!);
}
function outputProfile(result: ReturnType<typeof prepare>): EntityProfile {
  if (result.sketch.profile.kind !== 'entities') throw new Error('Expected derived entity profile');
  return result.sketch.profile;
}
function regionArea(profile: EntityProfile): number {
  const areas = makeContours(profile).map((contour) => Math.abs(thinContourArea(contour))).sort((a, b) => b - a);
  return areas.reduce((total, area, index) => total + (index % 2 ? -area : area), 0);
}
const oneSide = (thickness = 1, reversed = false): ThinWallDefinition => ({ kind: 'one-side', thickness, reversed });

describe('temporary analytic thin sections', () => {
  it.each([
    [oneSide(2), -2, 0, 20],
    [oneSide(2, true), 0, 2, 20],
    [{ kind: 'mid-plane', thickness: 4 }, -2, 2, 40],
    [{ kind: 'two-sides', firstThickness: 2, secondThickness: 1 }, -2, 1, 30],
  ] as const)('creates a capped LINE strip for %j', (definition, minimum, maximum, area) => {
    const source = chain([[0, 0], [10, 0]]), before = JSON.stringify(source);
    const result = outputProfile(prepare(source, definition));
    expect(makeContours(result)).toHaveLength(1);
    expect(result.entities.every((entity) => entity.type === 'line')).toBe(true);
    expect(result.entities).toHaveLength(4);
    expect(Math.min(...result.points.map((point) => point.y))).toBe(minimum);
    expect(Math.max(...result.points.map((point) => point.y))).toBe(maximum);
    expect(regionArea(result)).toBeCloseTo(area, 9);
    expect(result.constraints).toEqual([]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('preserves single-LINE stored start→end as the positive-right role', () => {
    const source = chain([[10, 0], [0, 0]]);
    const result = outputProfile(prepare(source, oneSide(2)));
    expect(result.points.map((point) => point.y).sort()).toEqual([0, 0, 2, 2]);
    expect(regionArea(result)).toBeCloseTo(20, 9);
  });

  it.each([
    [oneSide(), 19], [oneSide(1, true), 17],
    [{ kind: 'mid-plane', thickness: 2 }, 36],
    [{ kind: 'two-sides', firstThickness: .5, secondThickness: 1 }, 26.25],
  ] as const)('joins an open L with sharp corners for %j', (definition, area) => {
    const result = outputProfile(prepare(chain([[0, 0], [10, 0], [10, 8]]), definition));
    expect(result.entities).toHaveLength(6);
    expect(regionArea(result)).toBeCloseTo(area, 8);
  });

  it('uses analytic ARC supports and a tangent LINE continuation, with straight caps', () => {
    const source = chain([[0, 0], [10, 0], [15, 5]]);
    source.points.push({ id: 'center', x: 10, y: 5 });
    source.entities[1] = { id: 'ae1', type: 'arc', construction: false, center: 'center', start: 'ap1', end: 'ap2', clockwise: false };
    const result = outputProfile(prepare(source));
    expect(result.entities.filter((entity) => entity.type === 'arc')).toHaveLength(2);
    expect(result.entities.filter((entity) => entity.type === 'line')).toHaveLength(4);
    expect(regionArea(result)).toBeCloseTo(10 + 11 * Math.PI / 4, 7);
  });

  it('uses exact circular sectors for a quarter-arc midpoint section', () => {
    const source: EntityProfile = { kind: 'entities', points: [{ id: 's', x: 5, y: 0 }, { id: 'e', x: 0, y: 5 }],
      entities: [{ id: 'arc', type: 'arc', construction: false, center: 'origin', start: 's', end: 'e', clockwise: false }], constraints: [] };
    const result = outputProfile(prepare(source, { kind: 'mid-plane', thickness: 2 }));
    expect(regionArea(result)).toBeCloseTo(5 * Math.PI, 8);
    expect(result.entities.filter((entity) => entity.type === 'arc')).toHaveLength(2);
  });

  it('resolves a sharp LINE/ARC miter to the near analytic intersection', () => {
    const source = chain([[-5, 0], [0, 5], [5, 0]]);
    source.entities[1] = { id: 'ae1', type: 'arc', center: 'origin', start: 'ap1', end: 'ap2', clockwise: true, construction: false };
    const result = outputProfile(prepare(source));
    // Positive-right gives y=x+5−sqrt(2) and the circle x²+y²=16.
    const intercept = 5 - Math.SQRT2, x = (-intercept + Math.sqrt(32 - intercept ** 2)) / 2;
    const join = result.points.find((point) => point.id === 'thin-v1:c0:positive:v1')!;
    expect(join.x).toBeCloseTo(x, 9);
    expect(join.y).toBeCloseTo(x + intercept, 9);
    expect(makeContours(result)).toHaveLength(1);
  });

  it.each([false, true])('normalizes a closed rectangle outward, reversed storage=%s', (reverse) => {
    const vertices: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    const source = chain(reverse ? [...vertices].reverse() : vertices, true);
    const outside = outputProfile(prepare(source));
    expect(makeContours(outside)).toHaveLength(2);
    expect(regionArea(outside)).toBeCloseTo(36, 9);
    expect(Math.min(...outside.points.map((point) => point.x))).toBe(-1);
    expect(Math.max(...outside.points.map((point) => point.y))).toBe(7);
    expect(regionArea(outputProfile(prepare(source, oneSide(1, true))))).toBeCloseTo(28, 9);
  });

  it('keeps legacy rectangle/circle inputs unchanged and returns closed entity contours', () => {
    const rectangle = { kind: 'rectangle', center: [5, 3], width: 10, height: 6 } as const;
    const mutableRectangle = { ...rectangle, center: [...rectangle.center] as [number, number] };
    const before = JSON.stringify(mutableRectangle);
    expect(regionArea(outputProfile(prepare(mutableRectangle)))).toBeCloseTo(36, 9);
    expect(JSON.stringify(mutableRectangle)).toBe(before);
    const circular = outputProfile(prepare({ kind: 'circle', center: [0, 0], radius: 5 }));
    expect(regionArea(circular)).toBeCloseTo(11 * Math.PI, 8);
    expect(circular.entities.map((entity) => entity.type)).toEqual(['circle', 'circle']);
  });

  it('preserves every disconnected component and nested source loop', () => {
    const source: EntityProfile = { kind: 'entities', points: [{ id: 'distant', x: 30, y: 0 }], entities: [
      { id: 'outer', type: 'circle', construction: false, center: 'origin', radius: 10 },
      { id: 'hole', type: 'circle', construction: false, center: 'origin', radius: 5 },
      { id: 'other', type: 'circle', construction: false, center: 'distant', radius: 2 },
    ], constraints: [] };
    const result = outputProfile(prepare(source));
    expect(makeContours(result)).toHaveLength(6);
    expect(result.entities.filter((entity) => entity.type === 'circle').map((entity) => entity.radius).sort((a, b) => a - b))
      .toEqual([2, 3, 5, 6, 10, 11]);
  });

  it('uses stable source roles despite point/entity array permutation and construction decoration', () => {
    const source = chain([[0, 0], [10, 0], [10, 8]]), original = prepare(source);
    const permuted = structuredClone(source);
    permuted.points.reverse(); permuted.entities.reverse();
    permuted.entities.push({ id: 'decoration', type: 'line', construction: true, start: 'ap0', end: 'ap2' });
    expect(prepare(permuted)).toEqual(original);
    expect(prepare(source, oneSide(2)).identity).toEqual(original.identity);
    expect(prepare(source, oneSide(1, true)).identity).not.toEqual(original.identity);
  });

  it('detaches derived geometry and leaves solved constraints and source support alone', () => {
    const source = sketch(chain([[0, 0], [10, 0]]));
    if (source.profile.kind !== 'entities') throw new Error('Expected source entities');
    source.profile.constraints.push({ id: 'length', type: 'length', entityId: 'ae0', value: 10 });
    source.support = { kind: 'plane', planeId: 'datum' };
    const before = JSON.stringify(source), result = prepareThinSection(source, resolveThinWall({ thinWall: oneSide() })!);
    const derived = outputProfile(result);
    derived.points[0].x = 123;
    expect(JSON.stringify(source)).toBe(before);
    expect(result.sketch.support).toEqual(source.support);
    expect(result.sketch.support).not.toBe(source.support);
  });

  it('does not lose the small section area far from the sketch origin', () => {
    const result = outputProfile(prepare({ kind: 'rectangle', center: [900_000, -900_000], width: .1, height: .06 }, oneSide(.001)));
    // (0.102 × 0.062) − (0.1 × 0.06), independent of the translation.
    expect(regionArea(result)).toBeCloseTo(.000324, 10);
  });

  it.each([
    [chain([[0, 0], [10, 0], [10, 6], [0, 6]], true), oneSide(3, true)],
    [{ kind: 'circle', center: [0, 0], radius: 2 }, oneSide(2, true)],
    [chain([[0, 0], [10, 0], [10, .5]]), oneSide(1, true)],
    [chain([[0, 0], [10, 10], [0, 10], [10, 0]], true), oneSide()],
  ] as [SketchFeature['profile'], ThinWallDefinition][])('rejects collapse, line inversion and self-intersection', (source, definition) => {
    expect(() => prepare(source, definition)).toThrow();
  });

  it('rejects a branch rather than choosing one outgoing path', () => {
    const source = chain([[0, 0], [10, 0], [10, 8]]);
    source.points.push({ id: 'branchEnd', x: 20, y: 0 });
    source.entities.push({ id: 'branch', type: 'line', construction: false, start: 'ap1', end: 'branchEnd' });
    expect(() => prepare(source)).toThrow(/ramificación/);
  });

  it('rejects touching/overlapping bands instead of silently combining or cancelling loops', () => {
    const source: EntityProfile = { kind: 'entities', points: [], entities: [
      { id: 'first', type: 'circle', center: 'origin', radius: 5, construction: false },
      { id: 'second', type: 'circle', center: 'origin', radius: 5.5, construction: false },
    ], constraints: [] };
    expect(() => prepare(source)).toThrow(/superponen/);
  });

  it('rejects a neck whose inward wall would split or consume original segments', () => {
    const neck: [number, number][] = [[0, 0], [4, 0], [4, 1.5], [6, 1.5], [6, 0], [10, 0],
      [10, 4], [6, 4], [6, 2.5], [4, 2.5], [4, 4], [0, 4]];
    expect(() => prepare(chain(neck, true), oneSide(1, true))).toThrow();
  });

  it('rejects nonfinite solved geometry and a forged resolved thickness', () => {
    const source = chain([[0, 0], [10, 0]]);
    source.points[1].x = Infinity;
    expect(() => prepare(source)).toThrow(/no válidos/);
    expect(() => prepareThinSection(sketch(chain([[0, 0], [10, 0]])), {
      definition: oneSide(), positive: Infinity, negative: 0, identity: [],
    })).toThrow(/espesor/);
  });
});
