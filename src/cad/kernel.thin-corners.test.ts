import { afterEach, describe, expect, it, vi } from 'vitest';
import * as sketchSolver from '../sketch/solver';
import type { EntityProfile } from '../sketch/types';
import { makeContours } from './kernel.profiles';
import { prepareThinSection, thinContourArea } from './kernel.thin-wall';
import { resolveThinWall } from './thinWall';
import { consumedArcCorner, cornerOracles, cornerPolyline, cornerSketch, cornerWall } from './kernel.thin-corners.test-helpers';

afterEach(() => vi.restoreAllMocks());
const prepare = (profile: EntityProfile, p = 2, n = 0, radius = 3) => prepareThinSection(cornerSketch(profile), resolveThinWall({ thinWall: cornerWall(p, n, radius) })!);
const output = (result: ReturnType<typeof prepare>): EntityProfile => {
  if (result.sketch.profile.kind !== 'entities') throw Error('Expected derived entity profile');
  return result.sketch.profile;
};

describe('automatic constant-thickness corner sections', () => {
  it.each(cornerOracles())('matches the independent band area for $name', row => {
    const before = structuredClone(row.profile), result = prepareThinSection(cornerSketch(row.profile), resolveThinWall({ thinWall: row.wall })!);
    const contours = makeContours(output(result), true);
    // All cases are open independent bands, so no hole/nesting helper supplies
    // the expected area or chooses a first component.
    const area = contours.reduce((sum, contour) => sum + Math.abs(thinContourArea(contour)), 0);
    expect(Math.abs(area - row.sectionArea)).toBeLessThan(1e-7);
    expect(contours).toHaveLength(row.solids ?? 1);
    expect(row.profile).toEqual(before); expect(output(result).constraints).toEqual([]);
  });

  it('keeps the minimum material radius at the requested value on both wall sides', () => {
    for (const [p, n] of [[2, 0], [0, 2], [2, 1], [2, 2]]) {
      const profile = output(prepare(cornerPolyline([[0, 0], [20, 0], [20, 15]]), p, n));
      const points = new Map(profile.points.map(point => [point.id, point]));
      const radii = profile.entities.flatMap(entity => entity.type === 'arc' ? [Math.hypot(points.get(entity.start)!.x - points.get(entity.center)!.x,
        points.get(entity.start)!.y - points.get(entity.center)!.y)] : []).sort((a, b) => a - b);
      expect(radii).toHaveLength(2); expect(radii[0]).toBeCloseTo(3, 8); expect(radii[1]).toBeCloseTo(3 + p + n, 8);
    }
  });

  it.each([0, 1, 2, 3])('does not confuse disjoint bands at a horizontal ARC-end tangent after quarter-turn %s', turns => {
    const row = cornerOracles().find(row => row.solids === 2)!;
    const profile = structuredClone(row.profile);
    for (const point of profile.points) for (let index = 0; index < turns; index++) [point.x, point.y] = [-point.y, point.x];
    const result = prepareThinSection(cornerSketch(profile), resolveThinWall({ thinWall: row.wall })!);
    const contours = makeContours(output(result), true);
    expect(contours).toHaveLength(2);
    expect(Math.abs(contours.reduce((sum, contour) => sum + Math.abs(thinContourArea(contour)), 0) - row.sectionArea)).toBeLessThan(1e-7);
  });

  it('does not solve a temporary source or modify original constraints/support', () => {
    const solve = vi.spyOn(sketchSolver, 'solveSketch'), source = cornerSketch(cornerPolyline([[0, 0], [20, 0], [20, 15]]));
    if (source.profile.kind !== 'entities') throw Error('Fixture');
    source.profile.constraints.push({ id: 'original-length', type: 'length', entityId: 'e0', value: 20 });
    source.support = { kind: 'plane', planeId: 'original-plane' };
    const before = structuredClone(source), result = prepareThinSection(source, resolveThinWall({ thinWall: cornerWall(2, 0, 3) })!);
    expect(solve).not.toHaveBeenCalled(); expect(source).toEqual(before);
    expect(result.sketch.support).toEqual(source.support); expect(result.sketch.support).not.toBe(source.support);
  });

  it('retains deterministic source/corner roles without continuous radius in identity', () => {
    const source = cornerPolyline([[0, 0], [20, 0], [20, 15]]), initial = prepare(source);
    const reversedArrays = structuredClone(source); reversedArrays.points.reverse(); reversedArrays.entities.reverse();
    reversedArrays.entities.push({ id: 'construction-decoration', type: 'line', start: 'p0', end: 'p2', construction: true });
    expect(prepare(reversedArrays)).toEqual(initial);
    expect(prepare(source, 2, 0, 4).identity).toEqual(initial.identity);
    expect(prepare(source, 0, 2).identity).not.toEqual(initial.identity);
  });

  it('keeps an already tangent LINE/ARC continuation without adding another corner arc', () => {
    const source = cornerPolyline([[0, 0], [10, 0], [15, 5]]);
    source.points.push({ id: 'center', x: 10, y: 5 });
    source.entities[1] = { id: 'e1', type: 'arc', start: 'p1', end: 'p2', center: 'center', clockwise: false, construction: false };
    const result = prepare(source, 1, 0, 10);
    expect(output(result).entities.filter(entity => entity.type === 'arc')).toHaveLength(2);
    expect(JSON.stringify(result.identity)).toContain('tangent-continuation');
  });

  it('keeps one straight source LINE unchanged even when automatic corners are active', () => {
    const source = cornerPolyline([[0, 0], [20, 0]]), regular = prepareThinSection(cornerSketch(source), resolveThinWall({ thinWall: { kind: 'one-side', thickness: 2, reversed: false } })!);
    expect(output(prepare(source))).toEqual(output(regular));
  });

  it('preserves absent option identity and leaves an explicitly disabled option geometrically inactive', () => {
    const source = cornerSketch(cornerPolyline([[0, 0], [20, 0], [20, 15]]));
    const base = { kind: 'one-side' as const, thickness: 2, reversed: false };
    const before = prepareThinSection(source, resolveThinWall({ thinWall: base })!);
    const disabled = prepareThinSection(source, resolveThinWall({ thinWall: { ...base, autoCorners: { enabled: false, radius: 3 } } })!);
    expect(output(disabled)).toEqual(output(before));
    expect(before.identity).toHaveLength(3); expect(disabled.identity).toHaveLength(3);
    expect(disabled.identity).not.toEqual(before.identity);
  });

  it('rejects joint fillets that independently fit but consume a shared LINE', () => {
    const source = cornerPolyline([[0, 0], [12, 0], [12, 4], [24, 4]]), before = structuredClone(source);
    expect(() => prepare(source, 1, 0, 2)).toThrow(/consumen.*línea compartida/);
    expect(source).toEqual(before);
  });

  it('rejects joint fillets that independently fit but consume a shared ARC', () => {
    const source = consumedArcCorner(), before = structuredClone(source);
    expect(() => prepare(source, 1, 0, 14)).toThrow(/consumen.*arco compartido/);
    expect(source).toEqual(before);
  });

  it('rejects closed or mixed sources explicitly rather than guessing eligibility', () => {
    const closed = cornerSketch({ kind: 'rectangle', center: [6, 4], width: 12, height: 8 });
    expect(() => prepareThinSection(closed, resolveThinWall({ thinWall: cornerWall(2, 0, 3) })!)).toThrow(/únicamente cadenas abiertas/);
    const mixed = cornerPolyline([[0, 0], [20, 0], [20, 15]]);
    mixed.points.push({ id: 'circle-center', x: 60, y: 40 });
    mixed.entities.push({ id: 'circle', type: 'circle', center: 'circle-center', radius: 4, construction: false });
    expect(() => prepare(mixed)).toThrow(/cerrados o mixtos/);
  });

  it('rejects a reversing cusp without selecting an arbitrary rounding side', () => {
    const source: EntityProfile = { kind: 'entities', constraints: [], points: [{ id: 'a', x: 0, y: 0 }, { id: 'joint', x: 10, y: 0 },
      { id: 'center', x: 10, y: -5 }, { id: 'b', x: 5, y: -5 }], entities: [
      { id: 'first', type: 'line', start: 'a', end: 'joint', construction: false },
      { id: 'second', type: 'arc', start: 'joint', end: 'b', center: 'center', clockwise: false, construction: false },
    ] };
    expect(() => prepare(source)).toThrow(/cúspide/);
  });
});
