import { entityPoints } from './editing';
import { releaseOffsetEndpointFollowing } from './offset-endpoint-following';
import { solveSketch } from './solver';
import type { EntityProfile, SketchSelection, SketchSolveResult } from './types';
import { SKETCH_LIMITS, validateEntityProfile } from './validation';

export interface PointTarget {
  pointId: string;
  x?: number;
  y?: number;
}
/** Absolute coordinate precision, in mm, for explicit repositioning requests. */
export const POINT_TARGET_TOLERANCE = 5e-7;
export interface PointRepositionCommand {
  sourceProfile: EntityProfile;
  targets: readonly PointTarget[];
}
export type PointRepositionResult =
  | { accepted: true; changed: boolean; solution: SketchSolveResult; message: string }
  | { accepted: false; message: string };

function validateTargets(base: EntityProfile, targets: readonly PointTarget[]): PointTarget[] {
  if (!Array.isArray(targets)) throw new Error('Los destinos de puntos deben ser una lista.');
  const points = new Set(base.points.map(point => point.id)), seen = new Set<string>();
  return targets.map(target => {
    if (!target || typeof target !== 'object' || Array.isArray(target) ||
      Object.keys(target).some(key => !['pointId', 'x', 'y'].includes(key)) || !Object.hasOwn(target, 'pointId'))
      throw new Error('Cada destino debe indicar un punto y sus coordenadas solicitadas.');
    if (target.pointId === 'origin') throw new Error('El origen del croquis no se puede reposicionar.');
    if (!points.has(target.pointId)) throw new Error('Algún punto que se intenta reposicionar ya no existe.');
    if (seen.has(target.pointId)) throw new Error('Cada punto debe tener un único destino.');
    seen.add(target.pointId);
    const axes = (['x', 'y'] as const).filter(axis => Object.hasOwn(target, axis));
    if (!axes.length) throw new Error('El destino debe indicar al menos una coordenada.');
    const result: PointTarget = { pointId: target.pointId };
    for (const axis of axes) {
      const value = target[axis];
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > SKETCH_LIMITS.maxCoordinate)
        throw new Error(`La coordenada ${axis.toUpperCase()} debe ser finita y estar entre −${SKETCH_LIMITS.maxCoordinate} y ${SKETCH_LIMITS.maxCoordinate} mm.`);
      result[axis] = value;
    }
    return result;
  });
}
const healthy = (solution: SketchSolveResult) => ['fullyDefined', 'underdefined'].includes(solution.status);
const targetsRealized = (profile: EntityProfile, targets: readonly PointTarget[]) => targets.every(target => {
  const point = profile.points.find(point => point.id === target.pointId);
  return !!point && (target.x === undefined || Math.abs(target.x - point.x) <= POINT_TARGET_TOLERANCE) &&
    (target.y === undefined || Math.abs(target.y - point.y) <= POINT_TARGET_TOLERANCE);
});
const targetFailure = (): PointRepositionResult => ({ accepted: false, message: `No se puede conservar el destino solicitado dentro de ${POINT_TARGET_TOLERANCE} mm.` });

/**
 * Explicit repositioning, not a planner: solve requested coordinates with
 * temporary targets, remove those targets, then solve the saved constraints
 * again for authoritative rank and driven values. Only supplied axes are fixed.
 * Partial targets use a fixed temporary anchor and a zero signed axis distance,
 * retaining the full point-coordinate range without changing dimension limits.
 * Temporary points/constraints count toward normal sketch capacity; overflow
 * rejects atomically. No temporary IDs, points or constraints enter the result.
 * Explicitly changed requested points release their eligible offset-follow
 * endpoints; unchanged coordinates and ordinary parameter edits do not.
 * Requested changes <= POINT_TARGET_TOLERANCE are no-ops. After the final solve,
 * every supplied axis must realize its target within that absolute precision;
 * a small constraint residual alone does not establish coordinate accuracy.
 */
export function repositionSketchPoints(base: EntityProfile, targets: readonly PointTarget[]): PointRepositionResult {
  try {
    const candidate = validateEntityProfile(base), requested = validateTargets(candidate, targets), original = JSON.stringify(candidate);
    const changedPointIds = requested.filter(target => {
      const point = candidate.points.find(point => point.id === target.pointId)!;
      return (target.x !== undefined && Math.abs(target.x - point.x) > POINT_TARGET_TOLERANCE) ||
        (target.y !== undefined && Math.abs(target.y - point.y) > POINT_TARGET_TOLERANCE);
    }).map(target => target.pointId);
    if (!changedPointIds.length) {
      const solution = solveSketch(candidate);
      if (!healthy(solution)) return { accepted: false, message: `No se puede reposicionar: ${solution.message}` };
      return targetsRealized(solution.profile, requested) ? { accepted: true, changed: false, solution, message: 'No hay puntos que reposicionar.' } : targetFailure();
    }
    const pointCount = requested.filter(target => target.x === undefined || target.y === undefined).length;
    const constraintCount = requested.reduce((sum, target) => sum + (target.x !== undefined && target.y !== undefined ? 1 : 2), 0);
    if (candidate.points.length + pointCount > SKETCH_LIMITS.maxPoints || candidate.constraints.length + constraintCount > SKETCH_LIMITS.maxConstraints)
      throw new Error('El reposicionamiento temporal supera la capacidad del croquis.');
    releaseOffsetEndpointFollowing(candidate, new Set(changedPointIds));
    const allocated = new Set(['origin', ...candidate.points.map(point => point.id), ...candidate.entities.map(entity => entity.id), ...candidate.constraints.map(constraint => constraint.id)]);
    const temporaryPoints = new Set<string>(), temporaryConstraints = new Set<string>();
    const allocate = (kind: 'point' | 'constraint') => {
      let index = 1;
      while (allocated.has(`reposition-${kind}-${index}`)) index++;
      const id = `reposition-${kind}-${index}`; allocated.add(id);
      (kind === 'point' ? temporaryPoints : temporaryConstraints).add(id);
      return id;
    };
    for (const target of requested) {
      const point = candidate.points.find(point => point.id === target.pointId)!;
      if (target.x !== undefined && target.y !== undefined) {
        point.x = target.x; point.y = target.y;
        candidate.constraints.push({ id: allocate('constraint'), type: 'fix', pointId: point.id, x: target.x, y: target.y });
      } else {
        const axis = target.x !== undefined ? 'x' : 'y', value = target[axis]!;
        const anchor = { ...point, id: allocate('point'), [axis]: value };
        point[axis] = value; candidate.points.push(anchor);
        candidate.constraints.push({ id: allocate('constraint'), type: 'fix', pointId: anchor.id, x: anchor.x, y: anchor.y },
          { id: allocate('constraint'), type: axis === 'x' ? 'distanceX' : 'distanceY', a: anchor.id, b: point.id, value: 0 });
      }
    }
    const targeted = solveSketch(candidate);
    if (!healthy(targeted)) return { accepted: false, message: `No se puede reposicionar: ${targeted.message}` };
    const cleaned = targeted.profile;
    cleaned.points = cleaned.points.filter(point => !temporaryPoints.has(point.id));
    cleaned.constraints = cleaned.constraints.filter(constraint => !temporaryConstraints.has(constraint.id));
    const solution = solveSketch(cleaned);
    if (!healthy(solution)) return { accepted: false, message: `No se puede conservar el reposicionamiento: ${solution.message}` };
    if (!targetsRealized(solution.profile, requested)) return targetFailure();
    return { accepted: true, changed: JSON.stringify(solution.profile) !== original, solution, message: 'Puntos reposicionados con las relaciones existentes.' };
  } catch (error) {
    return { accepted: false, message: error instanceof Error ? error.message : 'No se puede reposicionar el croquis.' };
  }
}

/** Reject commands made against a solved profile other than the displayed one. */
export function repositionDisplayedSketch(current: SketchSolveResult | null, command: PointRepositionCommand): PointRepositionResult {
  if (!current || !healthy(current) || command.sourceProfile !== current.profile)
    return { accepted: false, message: 'El croquis ha cambiado. Revisa el punto que quieres reposicionar.' };
  return repositionSketchPoints(current.profile, command.targets);
}

/** Build explicit translation targets once per shared point; zero is a no-op. */
export function selectionPointTargets(base: EntityProfile, selection: readonly SketchSelection[], dx: number, dy: number): PointTarget[] {
  const profile = validateEntityProfile(base);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('El desplazamiento debe ser finito.');
  if (!Array.isArray(selection)) throw new Error('La selección debe ser una lista.');
  const pointIds = new Set<string>(), points = new Set(['origin', ...profile.points.map(point => point.id)]), entities = new Map(profile.entities.map(entity => [entity.id, entity]));
  for (const item of selection) {
    if (item?.kind === 'point' && points.has(item.id)) pointIds.add(item.id);
    else if (item?.kind === 'entity' && entities.has(item.id)) entityPoints(entities.get(item.id)!).forEach(id => pointIds.add(id));
    else if (item?.kind !== 'constraint' || !profile.constraints.some(constraint => constraint.id === item.id)) throw new Error('Algún elemento seleccionado ya no existe.');
  }
  pointIds.delete('origin');
  if (dx === 0 && dy === 0) return [];
  return validateTargets(profile, profile.points.filter(point => pointIds.has(point.id)).map(point => ({ pointId: point.id, x: point.x + dx, y: point.y + dy })));
}
