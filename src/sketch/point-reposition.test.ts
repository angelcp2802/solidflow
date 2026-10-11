import { describe, expect, it } from 'vitest';
import { createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument } from '../model/document';
import { planSketchOffset, type OffsetParameters } from './offset';
import { POINT_TARGET_TOLERANCE, repositionDisplayedSketch, repositionSketchPoints, selectionPointTargets, type PointTarget } from './point-reposition';
import { solveSketch } from './solver';
import type { EntityProfile, SketchOffsetRelation, SketchSelection } from './types';
import { SKETCH_LIMITS } from './validation';

// Original Cartesian fixtures in mm. A point on R10 uses the independent
// 6²+8²=10² oracle; partial edits must preserve the other coordinate's freedom.
// Coordinates use 5e-7 mm tolerance; the normal solver residual is <=1e-7.
const coordinate = (profile: EntityProfile, id: string) => profile.points.find(point => point.id === id)!;
function circle(centerX = 0, centerY = 0): EntityProfile {
  return { kind: 'entities', points: [{ id: 'center', x: centerX, y: centerY }, { id: 'p', x: centerX+6, y: centerY+8 }],
    entities: [{ id: 'circle', type: 'circle', center: 'center', radius: 10, construction: true }], constraints: [
      { id: 'center-fix', type: 'fix', pointId: 'center', x: centerX, y: centerY },
      { id: 'radius', type: 'radius', entityId: 'circle', value: 10 }, { id: 'on-circle', type: 'pointOnCircle', pointId: 'p', entityId: 'circle' },
      { id: 'reading', type: 'distance', a: 'center', b: 'p', value: 99, driven: true }] };
}
function accepted(base: EntityProfile, targets: readonly PointTarget[]) {
  const before = structuredClone(base), requests = structuredClone(targets), result = repositionSketchPoints(base, targets);
  expect(base).toEqual(before); expect(targets).toEqual(requests); expect(result.accepted, result.message).toBe(true);
  if (!result.accepted) throw new Error(result.message);
  expect(result.solution.maxResidual).toBeLessThanOrEqual(1e-7);
  expect(result.solution.profile.points.map(point => point.id)).toEqual(base.points.map(point => point.id));
  expect(result.solution.profile.constraints.map(constraint => constraint.id)).toEqual(base.constraints.map(constraint => constraint.id));
  return result.solution;
}
function rejected(base: EntityProfile, targets: readonly PointTarget[]) {
  const before = structuredClone(base), requests = structuredClone(targets), result = repositionSketchPoints(base, targets);
  expect(result.accepted).toBe(false); expect(result.message.length).toBeGreaterThan(0); expect(base).toEqual(before); expect(targets).toEqual(requests);
  return result;
}
function offset(legacy: boolean, addDimensions = true) {
  const source: EntityProfile = { kind: 'entities', points: [{ id: 'end', x: 10, y: 0 }], entities: [{ id: 'source', type: 'line', start: 'origin', end: 'end', construction: false }],
    constraints: [{ id: 'horizontal', type: 'horizontal', entityId: 'source' }, { id: 'length', type: 'length', entityId: 'source', value: 10 }] };
  const options: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: true, cap: 'none', construction: 'none', addDimensions };
  const plan = planSketchOffset(source, [{ kind: 'entity', id: 'source' }], options);
  expect(plan.changed, plan.message).toBe(true);
  const group = plan.profile.constraints.find(constraint => constraint.type === 'offset') as SketchOffsetRelation;
  if (legacy) delete group.images[0].lineEndpointMode;
  const solved = solveSketch(plan.profile); expect(solved.status).toMatch(/^(fullyDefined|underdefined)$/);
  const image = solved.profile.entities.find(entity => entity.id === plan.imageEntityIds[0])!;
  if (image.type !== 'line') throw new Error('Expected a line image');
  return { profile: solved.profile, image };
}
const offsetGroup = (profile: EntityProfile) => profile.constraints.find(constraint => constraint.type === 'offset') as SketchOffsetRelation;
function editSourceLength(profile: EntityProfile, value: number) {
  const next = structuredClone(profile), length = next.constraints.find(constraint => constraint.id === 'length');
  if (length?.type !== 'length') throw new Error('Source length expected');
  length.value = value;
  const result = solveSketch(next); expect(result.status, result.message).toMatch(/^(fullyDefined|underdefined)$/);
  return result.profile;
}

describe('explicit point repositioning', () => {
  it.each(['x', 'y'] as const)('solves only requested axis %s on R10 and removes targets before reporting freedom', axis => {
    const input = circle(), solution = accepted(input, [{ pointId: 'p', [axis]: axis === 'x' ? 8 : 6 }]);
    expect(Math.abs(coordinate(solution.profile, 'p').x-8)).toBeLessThan(5e-7); expect(Math.abs(coordinate(solution.profile, 'p').y-6)).toBeLessThan(5e-7);
    expect(solution.status).toBe('underdefined'); expect(solution.degreesOfFreedom).toBe(1); expect(Math.abs(solution.drivenValues.reading!-10)).toBeLessThan(5e-7);
    expect(solution.profile.constraints).toEqual(input.constraints);
  });
  it('rejects a full target outside the circle without changing any input', () => { rejected(circle(), [{ pointId: 'p', x: 8, y: 8 }]); });
  it('accepts a full target on the circle without retaining its temporary fix or rank', () => {
    const solution = accepted(circle(), [{ pointId: 'p', x: 8, y: 6 }]);
    expect(solution.degreesOfFreedom).toBe(1); expect(coordinate(solution.profile, 'p')).toMatchObject({ x: 8, y: 6 });
  });
  it('supports partial coordinates beyond the dimensional limit within the point-coordinate range', () => {
    const solution = accepted(circle(500_000, 600_000), [{ pointId: 'p', x: 500_008 }]);
    expect(coordinate(solution.profile, 'p').x).toBeCloseTo(500_008, 6); expect(coordinate(solution.profile, 'p').y).toBeCloseTo(600_006, 6);
    expect(solution.degreesOfFreedom).toBe(1); expect(solution.drivenValues.reading).toBeCloseTo(10, 6);
  });
  it.each([true, false])('rejects a normal target against a driving offset, legacy=%s', legacy => {
    const { profile, image } = offset(legacy); rejected(profile, [{ pointId: image.end, y: -3 }]);
  });
  it('allows tangential repositioning of a legacy free endpoint without an offset policy change', () => {
    const { profile, image } = offset(true), solution = accepted(profile, [{ pointId: image.end, x: 12 }]);
    expect(coordinate(solution.profile, image.end).x).toBeCloseTo(12, 7); expect(coordinate(solution.profile, image.end).y).toBeCloseTo(-2, 7);
    expect(coordinate(solution.profile, 'end').x).toBeCloseTo(10, 7); expect(solution.degreesOfFreedom).toBe(2);
  });
  it('preserves hard alignment and rejects a conflicting tangential endpoint target', () => {
    const { profile, image } = offset(false); rejected(profile, [{ pointId: image.end, x: 12 }]);
  });
  it('allocates temporary IDs around existing point, entity and constraint identities', () => {
    const input = circle(); input.points.push({ id: 'reposition-point-1', x: 20, y: 20 });
    input.entities[0].id = 'reposition-constraint-1';
    for (const constraint of input.constraints) if ('entityId' in constraint) constraint.entityId = 'reposition-constraint-1';
    input.constraints[0].id = 'reposition-constraint-2';
    const solution = accepted(input, [{ pointId: 'p', x: 8 }]);
    expect(coordinate(solution.profile, 'reposition-point-1')).toEqual(input.points[2]); expect(solution.profile.constraints).toEqual(input.constraints);
  });
  it('rejects invalid destinations before solving and keeps all requests and source geometry intact', () => {
    const invalid: unknown[] = [
      [{ pointId: 'missing', x: 8 }], [{ pointId: 'origin', x: 8 }], [{ pointId: 'p' }], [{ pointId: 'p', x: undefined }],
      [{ pointId: 'p', x: NaN }], [{ pointId: 'p', y: Infinity }], [{ pointId: 'p', x: SKETCH_LIMITS.maxCoordinate+1 }],
      [{ pointId: 'p', y: -SKETCH_LIMITS.maxCoordinate-1 }], [{ pointId: 'p', x: '8' }], [{ pointId: 'p', x: 8, extra: true }],
      [{ pointId: 'p', x: 8 }, { pointId: 'p', y: 6 }], [null], null,
    ];
    for (const targets of invalid) rejected(circle(), targets as readonly PointTarget[]);
  });
  it('rejects an invalid base profile without mutating it', () => {
    const input = circle(), entity = input.entities[0];
    if (entity.type !== 'circle') throw new Error('Expected circle');
    entity.center = 'missing'; rejected(input, [{ pointId: 'p', x: 8 }]);
  });
  it('rejects temporary capacity overflow without increasing sketch limits', () => {
    const points: EntityProfile = { kind: 'entities', points: Array.from({ length: SKETCH_LIMITS.maxPoints }, (_, i) => ({ id: `p${i}`, x: i, y: 0 })), entities: [], constraints: [] };
    expect(rejected(points, [{ pointId: 'p0', x: 1 }]).message).toMatch(/capacidad/);
    const constraints: EntityProfile = { kind: 'entities', points: [{ id: 'p', x: 0, y: 0 }], entities: [], constraints: Array.from({ length: SKETCH_LIMITS.maxConstraints }, (_, i) => ({ id: `note${i}`, type: 'distanceX', a: 'origin', b: 'p', value: 0, driven: true })) };
    expect(rejected(constraints, [{ pointId: 'p', x: 1, y: 1 }]).message).toMatch(/capacidad/);
  });
  it('accepts empty and unchanged targets as no-op geometry with no temporary leftovers', () => {
    const input: EntityProfile = { kind: 'entities', points: [{ id: 'p', x: 4, y: -3 }], entities: [], constraints: [] };
    expect(accepted(input, []).profile).toEqual(input); expect(accepted(input, [{ pointId: 'p', x: 4, y: -3 }]).profile).toEqual(input);
    expect(repositionSketchPoints(input, [])).toMatchObject({ accepted: true, changed: false });
    expect(repositionSketchPoints(input, [{ pointId: 'p', x: 4 }])).toMatchObject({ accepted: true, changed: false });
  });
  it('does not consume temporary capacity for a no-op at the constraint limit', () => {
    const input: EntityProfile = { kind: 'entities', points: [{ id: 'p', x: 4, y: -3 }], entities: [],
      constraints: Array.from({ length: SKETCH_LIMITS.maxConstraints }, (_, i) => ({ id: `note${i}`, type: 'distanceX', a: 'origin', b: 'p', value: 4, driven: true })) };
    expect(repositionSketchPoints(input, [{ pointId: 'p', x: 4 }])).toMatchObject({ accepted: true, changed: false });
  });
  it('rejects commands for a stale, absent or unhealthy displayed solution', () => {
    const current = solveSketch(circle()), targets = [{ pointId: 'p', x: 8 }], before = structuredClone(current.profile);
    expect(repositionDisplayedSketch(current, { sourceProfile: structuredClone(current.profile), targets }).accepted).toBe(false);
    expect(repositionDisplayedSketch(null, { sourceProfile: current.profile, targets }).accepted).toBe(false);
    expect(repositionDisplayedSketch({ ...current, status: 'inconsistent' }, { sourceProfile: current.profile, targets }).accepted).toBe(false);
    expect(current.profile).toEqual(before);
    const result = repositionDisplayedSketch(current, { sourceProfile: current.profile, targets });
    expect(result).toMatchObject({ accepted: true, changed: true });
    if (!result.accepted) throw new Error(result.message);
    expect(Math.abs(coordinate(result.solution.profile, 'p').y-6)).toBeLessThan(5e-7); expect(current.profile).toEqual(before);
  });
  it('releases only the repositioned start while the untouched end follows the next source edit', () => {
    const { profile, image } = offset(false, false), solution = accepted(profile, [{ pointId: image.start, x: -2, y: -2 }]);
    expect(offsetGroup(solution.profile).images[0].lineEndpointFollowing).toEqual([false, true]);
    const changed = editSourceLength(solution.profile, 14);
    expect(coordinate(changed, image.start).x).toBeCloseTo(-2, 7); expect(coordinate(changed, image.end).x).toBeCloseTo(14, 7);
  });
  it('releases the requested end even for a normal-only edit and keeps its new station after a source edit', () => {
    const { profile, image } = offset(false, false), solution = accepted(profile, [{ pointId: image.end, y: -3 }]);
    expect(offsetGroup(solution.profile).images[0].lineEndpointFollowing).toEqual([true, false]);
    expect(coordinate(solution.profile, image.end).y).toBeCloseTo(-3, 7);
    // X is intentionally untargeted. Preserve its realized free station across
    // the later source edit, rather than treating the original X as a target.
    const freeStation = coordinate(solution.profile, image.end).x;
    const changed = editSourceLength(solution.profile, 14);
    expect(coordinate(changed, image.start).x).toBeCloseTo(0, 7); expect(coordinate(changed, image.end).x).toBeCloseTo(freeStation, 7);
  });
  it('retains following for unchanged requested points and for an entirely unchanged command', () => {
    const { profile, image } = offset(false, false), start = coordinate(profile, image.start), end = coordinate(profile, image.end);
    const noop = repositionSketchPoints(profile, [{ pointId: image.end, x: end.x, y: end.y }]);
    expect(noop).toMatchObject({ accepted: true, changed: false });
    if (!noop.accepted) throw new Error(noop.message);
    expect(offsetGroup(noop.solution.profile).images[0].lineEndpointFollowing).toEqual([true, true]);
    const solution = accepted(profile, [{ pointId: image.start, x: start.x, y: start.y }, { pointId: image.end, x: 12, y: end.y }]);
    expect(offsetGroup(solution.profile).images[0].lineEndpointFollowing).toEqual([true, false]);
  });
  it('does not release persisted following when a requested target conflicts with an existing fix', () => {
    const { profile, image } = offset(false, false), point = coordinate(profile, image.end);
    profile.constraints.push({ id: 'end-fix', type: 'fix', pointId: image.end, x: point.x, y: point.y });
    rejected(profile, [{ pointId: image.end, x: 12 }]); expect(offsetGroup(profile).images[0].lineEndpointFollowing).toEqual([true, true]);
  });
  it('treats a fixed following endpoint request inside coordinate precision as a no-op without releasing it', () => {
    const { profile, image } = offset(false, false), point = coordinate(profile, image.end);
    profile.constraints.push({ id: 'end-fix', type: 'fix', pointId: image.end, x: point.x, y: point.y });
    const before = structuredClone(profile), targets = [{ pointId: image.end, x: 10.00000021 }], result = repositionSketchPoints(profile, targets);
    expect(result).toMatchObject({ accepted: true, changed: false }); expect(profile).toEqual(before);
    if (!result.accepted) throw new Error(result.message);
    expect(offsetGroup(result.solution.profile).images[0].lineEndpointFollowing).toEqual([true, true]);
    expect(Math.abs(coordinate(result.solution.profile, image.end).x - targets[0].x)).toBeLessThanOrEqual(POINT_TARGET_TOLERANCE);
    rejected(profile, [{ pointId: image.end, x: point.x + 2 * POINT_TARGET_TOLERANCE }]);
    expect(offsetGroup(profile).images[0].lineEndpointFollowing).toEqual([true, true]);
  });
  it('uses an inclusive coordinate precision boundary for no-op requests', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'p', x: 0, y: 0 }], entities: [],
      constraints: [{ id: 'fix-p', type: 'fix', pointId: 'p', x: 0, y: 0 }] };
    expect(POINT_TARGET_TOLERANCE).toBe(5e-7);
    for (const x of [-POINT_TARGET_TOLERANCE, POINT_TARGET_TOLERANCE])
      expect(repositionSketchPoints(profile, [{ pointId: 'p', x }])).toMatchObject({ accepted: true, changed: false });
    rejected(profile, [{ pointId: 'p', x: 2 * POINT_TARGET_TOLERANCE }]);
  });
  it('rejects an apparently unchanged request when solving its stale seed would move the requested axis', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'p', x: 0, y: 0 }], entities: [],
      constraints: [{ id: 'fix-p', type: 'fix', pointId: 'p', x: 1, y: 0 }] };
    expect(rejected(profile, [{ pointId: 'p', x: 0 }]).message).toMatch(/destino solicitado/);
  });
  it('rejects a final coordinate that drifts far from its target despite small near-parallel support residuals', () => {
    // Independent original fixture: these two distinct supports intersect only
    // at (0,0); a low equation residual near their intersection is not a target.
    const base: EntityProfile = { kind: 'entities', points: [
      { id: 'a', x: 10, y: 0 }, { id: 'b', x: 10, y: 0.000002 }, { id: 'p', x: 0, y: 0 },
      { id: 'q', x: 0, y: 1 }, { id: 'r', x: 0, y: -1 }], entities: [
      { id: 'line-a', type: 'line', start: 'origin', end: 'a', construction: true },
      { id: 'line-b', type: 'line', start: 'origin', end: 'b', construction: true }], constraints: [
      { id: 'fix-a', type: 'fix', pointId: 'a', x: 10, y: 0 }, { id: 'fix-b', type: 'fix', pointId: 'b', x: 10, y: 0.000002 },
      { id: 'on-a', type: 'pointOnLine', pointId: 'p', entityId: 'line-a' }, { id: 'on-b', type: 'pointOnLine', pointId: 'p', entityId: 'line-b' },
      { id: 'fix-q', type: 'fix', pointId: 'q', x: 0, y: 1 }, { id: 'sym', type: 'symmetric', a: 'q', b: 'r', axisId: 'line-a' }] };
    const initial = solveSketch(base); expect(initial.status).toBe('fullyDefined');
    expect(rejected(initial.profile, [{ pointId: 'p', x: 0.5 }]).message).toMatch(/destino solicitado/);
  });
  it('preserves accepted endpoint-follow release through a saved one-entry history step', () => {
    const { profile, image } = offset(false, false), document = validateDocument({ ...createDocument('Original reposition history'), features: [
      { id: 'sketch', name: 'Original line offset', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile }] });
    const history = new DocumentHistory(document), solution = accepted(profile, [{ pointId: image.end, x: 12 }]);
    history.apply(parseDocument(serializeDocument(updateFeature(history.current, 'sketch', { profile: solution.profile }))));
    const undone = history.undo(); expect(history.canUndo).toBe(false); expect(undone.features).toEqual(document.features);
    const restored = history.redo(), sketch = restored.features[0]; expect(history.canRedo).toBe(false);
    if (sketch.type !== 'sketch' || sketch.profile.kind !== 'entities') throw new Error('Entity sketch expected');
    expect(offsetGroup(sketch.profile).images[0].lineEndpointFollowing).toEqual([true, false]); expect(coordinate(sketch.profile, image.end).x).toBeCloseTo(12, 7);
  });
});

describe('selection point targets', () => {
  function chain(): EntityProfile { return { kind: 'entities', points: [{ id: 'p', x: 10, y: 0 }, { id: 'q', x: 10, y: 10 }], entities: [
    { id: 'a', type: 'line', start: 'origin', end: 'p', construction: false }, { id: 'b', type: 'line', start: 'p', end: 'q', construction: false }], constraints: [] }; }
  it('expands entities and selected shared points once while leaving the origin fixed', () => {
    const input = chain(), before = structuredClone(input), selection: SketchSelection[] = [{ kind: 'entity', id: 'a' }, { kind: 'entity', id: 'b' }, { kind: 'point', id: 'p' }, { kind: 'point', id: 'origin' }];
    expect(selectionPointTargets(input, selection, 2, -3)).toEqual([{ pointId: 'p', x: 12, y: -3 }, { pointId: 'q', x: 12, y: 7 }]); expect(input).toEqual(before);
  });
  it('returns no targets for a zero translation, empty selection or origin-only selection', () => {
    expect(selectionPointTargets(chain(), [{ kind: 'entity', id: 'a' }], 0, 0)).toEqual([]);
    expect(selectionPointTargets(chain(), [], 2, 3)).toEqual([]); expect(selectionPointTargets(chain(), [{ kind: 'point', id: 'origin' }], 2, 3)).toEqual([]);
  });
  it('rejects stale IDs, nonfinite movement and coordinates outside the existing point range', () => {
    const input = chain(), before = structuredClone(input);
    for (const selection of [[{ kind: 'point', id: 'missing' }], [{ kind: 'entity', id: 'missing' }]] as SketchSelection[][])
      expect(() => selectionPointTargets(input, selection, 1, 1)).toThrow(/existe/);
    expect(() => selectionPointTargets(input, [], NaN, 0)).toThrow(/finito/);
    expect(() => selectionPointTargets(input, [{ kind: 'point', id: 'p' }], SKETCH_LIMITS.maxCoordinate, 0)).toThrow(/coordenada/);
    expect(input).toEqual(before);
  });
});
