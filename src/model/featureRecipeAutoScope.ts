import type { Feature } from '../cad/kernel.types';
import { sha256Bytes } from '../shared/sha256';

export const RECIPE_EVALUATOR_REVISION = 'intrinsic-auto-selected-sketch-dimensions-v12';
export const RECIPE_AUTO_CAPTURE_REVISION = 'auto-scope-v1';
export interface RecipeAutoScopeIntent {
  mode: 'auto';
  capturedBodyIds: string[];
  captureFingerprint: string;
  follow: 'sameIdentityAtPatternInput';
}
/** Detached intent/provenance only. No native ownership capability crosses the worker. */
export interface RecipeAutoScopeCapture {
  kind: 'feature-recipe-auto-scope';
  patternId: string;
  sourceFeaturesSignature: string;
  evaluatorRevision: typeof RECIPE_EVALUATOR_REVISION;
  scope: RecipeAutoScopeIntent;
}
export const validRecipeAutoCaptureFingerprint = (value: unknown): value is string =>
  typeof value === 'string' && /^auto-scope-v1:[a-f0-9]{64}$/.test(value);

const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value);
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Respuesta de detección no válida.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== fields.length || fields.some(field => !descriptors[field]?.enumerable || !Object.hasOwn(descriptors[field], 'value'))) {
    throw Error('La respuesta de detección debe contener sólo datos explícitos.');
  }
  return Object.fromEntries(fields.map(field => [field, descriptors[field].value]));
}
/** Wire shape only. A valid or forged provenance string never authenticates a past capture. */
export function readRecipeAutoScopeCapture(value: unknown): RecipeAutoScopeCapture {
  const outer = record(value, ['kind', 'patternId', 'sourceFeaturesSignature', 'evaluatorRevision', 'scope']);
  const scope = record(outer.scope, ['mode', 'capturedBodyIds', 'captureFingerprint', 'follow']);
  const ids = scope.capturedBodyIds;
  if (outer.kind !== 'feature-recipe-auto-scope' || !id(outer.patternId) || outer.evaluatorRevision !== RECIPE_EVALUATOR_REVISION
    || typeof outer.sourceFeaturesSignature !== 'string' || !/^[a-f0-9]{64}$/.test(outer.sourceFeaturesSignature)
    || scope.mode !== 'auto' || scope.follow !== 'sameIdentityAtPatternInput' || !validRecipeAutoCaptureFingerprint(scope.captureFingerprint)
    || !Array.isArray(ids) || Object.getPrototypeOf(ids) !== Array.prototype || ids.length < 1 || ids.length > 256
    || Reflect.ownKeys(ids).length !== ids.length + 1) throw Error('La respuesta de detección no declara su ámbito y procedencia.');
  const captured: string[] = [];
  for (let index = 0; index < ids.length; index++) {
    const entry = Object.getOwnPropertyDescriptor(ids, String(index));
    if (!entry?.enumerable || !Object.hasOwn(entry, 'value') || !id(entry.value) || captured.includes(entry.value)) throw Error('Las identidades capturadas deben ser datos únicos y explícitos.');
    captured.push(entry.value);
  }
  return { kind: 'feature-recipe-auto-scope', patternId: outer.patternId, sourceFeaturesSignature: outer.sourceFeaturesSignature,
    evaluatorRevision: RECIPE_EVALUATOR_REVISION, scope: { mode: 'auto', capturedBodyIds: captured,
      captureFingerprint: scope.captureFingerprint, follow: 'sameIdentityAtPatternInput' } };
}

/** Equality/provenance label, never a credential or native geometry authority. */
export function recipeAutoScopeDigest(value: unknown): string {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') throw Error('La procedencia del ámbito automático no es serializable.');
  return sha256Bytes(new TextEncoder().encode(text));
}
/** Called only on cloned/parsed source data; currentness, not native admission. */
export function recipeAutoSourceFeaturesSignature(features: readonly Feature[], patternId: string): string {
  return recipeAutoScopeDigest({ patternId, features });
}
