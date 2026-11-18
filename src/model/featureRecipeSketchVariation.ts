import type { Feature, SketchFeature } from '../cad/kernel.types';

/** Millimetres; exact saved constraint identity, never a solved-profile DTO. */
export interface RecipeSketchDimensionValue {
  address: string;
  sketchId: string;
  constraintId: string;
  value: number;
}
export type RecipeSketchDimensionVariation = { kind: 'sketchDimensions'; values: RecipeSketchDimensionValue[] };
export const MAX_RECIPE_SKETCH_DIMENSIONS = 512;
export const MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE = 2;
export interface RecipeSketchDriver {
  parameter: 'radius' | 'width' | 'height';
  constraintId: string;
  value: number;
}
export const isRecipeSketchDimensionValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= .01 && value <= 100_000;

function recipeVariationSketch(seed: Feature | undefined, sketch: Feature | undefined): SketchFeature | null {
  if (!seed || seed.suppressed
    || !(seed.type === 'cut' && seed.bodyScope?.length || seed.type === 'extrude' && seed.bodyOperation?.mode === 'merge')
    || seed.symmetric !== false
    || !Number.isFinite(seed.depth) || Math.abs(seed.depth) < .01 || Math.abs(seed.depth) > 100_000
    || ['endCondition', 'thinWall', 'secondDirection'].some(key => Object.hasOwn(seed, key))
    || !sketch || sketch.type !== 'sketch' || sketch.id !== seed.sketchId || sketch.suppressed || Object.hasOwn(sketch, 'support')) return null;
  return sketch;
}

/** Structural admission only. A real, current source and instance solve remain mandatory. */
export function recipeSketchDrivingDimensions(seed: Feature | undefined, sketch: Feature | undefined): RecipeSketchDriver[] {
  const input = recipeVariationSketch(seed, sketch);
  if (!input) return [];
  const radius = circleRadiusConstraint(input);
  return radius ? [{ parameter: 'radius', ...radius }] : rectangleDimensions(input);
}

export function recipeCircleDrivingRadius(seed: Feature | undefined, sketch: Feature | undefined): { constraintId: string; value: number } | null {
  const input = recipeVariationSketch(seed, sketch);
  return input ? circleRadiusConstraint(input) : null;
}

function rectangleDimensions(sketch: SketchFeature): RecipeSketchDriver[] {
  const profile = sketch.profile;
  if (profile.kind !== 'entities' || profile.entities.length !== 4 || ![3, 4].includes(profile.points.length)) return [];
  const vertices = new Set(profile.points.map(point => point.id));
  if (vertices.has('origin') || vertices.size !== profile.points.length) return [];
  const anchoredAtOrigin = vertices.size === 3;
  if (anchoredAtOrigin) vertices.add('origin');

  if (profile.constraints.length !== (anchoredAtOrigin ? 6 : 7)) return [];
  const fixed = profile.constraints.filter(constraint => constraint.type === 'fix');
  if (fixed.length !== (anchoredAtOrigin ? 0 : 1)
    || fixed.some(constraint => !vertices.has(constraint.pointId) || !Number.isFinite(constraint.x) || !Number.isFinite(constraint.y))) return [];

  const axes = new Map<string, 'horizontal' | 'vertical'>();
  for (const constraint of profile.constraints) {
    if (constraint.type !== 'horizontal' && constraint.type !== 'vertical') continue;
    if (axes.has(constraint.entityId)) return [];
    axes.set(constraint.entityId, constraint.type);
  }
  if (axes.size !== 4) return [];

  const incidentAxes = new Map<string, Set<'horizontal' | 'vertical'>>();
  const edges = new Set<string>();
  const entityIds = new Set<string>();
  for (const entity of profile.entities) {
    if (entity.type !== 'line' || entity.construction || entityIds.has(entity.id)
      || entity.start === entity.end || !vertices.has(entity.start) || !vertices.has(entity.end)) return [];
    const axis = axes.get(entity.id);
    const edge = JSON.stringify([entity.start, entity.end].sort());
    if (!axis || edges.has(edge)) return [];
    edges.add(edge);
    entityIds.add(entity.id);
    for (const vertex of [entity.start, entity.end]) {
      const incident = incidentAxes.get(vertex) ?? new Set();
      if (incident.has(axis)) return [];
      incident.add(axis);
      incidentAxes.set(vertex, incident);
    }
  }
  if (incidentAxes.size !== 4 || [...incidentAxes.values()].some(incident => incident.size !== 2)) return [];

  const drivers = new Map<'width' | 'height', RecipeSketchDriver>();
  for (const constraint of profile.constraints) {
    if (constraint.type !== 'length') continue;
    const axis = axes.get(constraint.entityId);
    if (!axis || constraint.driven === true || constraint.referenceRole === 'annotation'
      || !isRecipeSketchDimensionValue(constraint.value)) return [];
    const parameter = axis === 'horizontal' ? 'width' : 'height';
    if (drivers.has(parameter)) return [];
    drivers.set(parameter, { parameter, constraintId: constraint.id, value: constraint.value });
  }
  const width = drivers.get('width'), height = drivers.get('height');
  return width && height && width.constraintId !== height.constraintId ? [width, height] : [];
}

function circleRadiusConstraint(sketch: SketchFeature): { constraintId: string; value: number } | null {
  const profile = sketch.profile;
  if (profile.kind !== 'entities' || profile.points.length !== 1 || profile.entities.length !== 1 || profile.constraints.length !== 2) return null;
  const circle = profile.entities[0], point = profile.points[0];
  if (circle.type !== 'circle' || circle.construction || circle.center !== point.id) return null;
  const fix = profile.constraints.find(constraint => constraint.type === 'fix');
  const radius = profile.constraints.find(constraint => constraint.type === 'radius');
  if (!fix || fix.type !== 'fix' || fix.pointId !== point.id || !Number.isFinite(fix.x) || !Number.isFinite(fix.y)
    || !radius || radius.type !== 'radius' || radius.entityId !== circle.id || radius.driven === true
    || radius.referenceRole === 'annotation' || !isRecipeSketchDimensionValue(radius.value)) return null;
  return { constraintId: radius.id, value: radius.value };
}
