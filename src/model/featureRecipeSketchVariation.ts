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
export const isRecipeSketchRadius = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= .01 && value <= 100_000;

/** Structural admission only. A real, current source and instance solve remain mandatory. */
export function recipeCircleDrivingRadius(seed: Feature | undefined, sketch: Feature | undefined): { constraintId: string; value: number } | null {
  if (!seed || seed.type !== 'cut' || seed.suppressed || !seed.bodyScope?.length || seed.symmetric !== false
    || !Number.isFinite(seed.depth) || Math.abs(seed.depth) < .01 || Math.abs(seed.depth) > 100_000
    || ['endCondition', 'thinWall', 'secondDirection'].some(key => Object.hasOwn(seed, key))
    || !sketch || sketch.type !== 'sketch' || sketch.id !== seed.sketchId || sketch.suppressed || Object.hasOwn(sketch, 'support')) return null;
  return circleRadiusConstraint(sketch);
}

export function circleRadiusConstraint(sketch: SketchFeature): { constraintId: string; value: number } | null {
  const profile = sketch.profile;
  if (profile.kind !== 'entities' || profile.points.length !== 1 || profile.entities.length !== 1 || profile.constraints.length !== 2) return null;
  const circle = profile.entities[0], point = profile.points[0];
  if (circle.type !== 'circle' || circle.construction || circle.center !== point.id) return null;
  const fix = profile.constraints.find(constraint => constraint.type === 'fix');
  const radius = profile.constraints.find(constraint => constraint.type === 'radius');
  if (!fix || fix.type !== 'fix' || fix.pointId !== point.id || !Number.isFinite(fix.x) || !Number.isFinite(fix.y)
    || !radius || radius.type !== 'radius' || radius.entityId !== circle.id || radius.driven === true
    || radius.referenceRole === 'annotation' || !isRecipeSketchRadius(radius.value)) return null;
  return { constraintId: radius.id, value: radius.value };
}
