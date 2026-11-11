import type { Feature } from '../cad/kernel.types';

export interface RecipeInstanceDepthValue {
  address: string;
  featureId: string;
  parameter: 'depth';
  /** Signed millimetres in the original seed frame, before instance parity. */
  value: number;
}

export type RecipeInstanceDepthVariation = { kind: 'dimensions'; values: RecipeInstanceDepthValue[] };

export const MAX_RECIPE_DEPTH_VALUES = 512;

export function isRecipeInstanceDepth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) >= .01 && Math.abs(value) <= 100_000;
}

/** Structural eligibility only. Current native owners and tool validity are checked later. */
export function isRecipeInstanceDepthSeed(seed: Feature | undefined, sketch: Feature | undefined): boolean {
  return !!seed && seed.suppressed === false
    && (seed.type === 'cut' && !!seed.bodyScope?.length || seed.type === 'extrude' && seed.bodyOperation?.mode === 'merge')
    && seed.symmetric === false && isRecipeInstanceDepth(seed.depth)
    && !Object.hasOwn(seed, 'endCondition') && !Object.hasOwn(seed, 'thinWall') && !Object.hasOwn(seed, 'secondDirection')
    && sketch?.type === 'sketch' && sketch.id === seed.sketchId && sketch.suppressed === false && !Object.hasOwn(sketch, 'support')
    && (sketch.profile?.kind === 'rectangle' || sketch.profile?.kind === 'circle');
}
