import { validateDocument } from './document';
import { isAllFeaturePattern } from './featurePatterns';
import { recipeAutoSourceFeaturesSignature } from './featureRecipeAutoScope';

/** Strict provisional ALL candidate, never an empty saved AUTO declaration. */
export function captureRecipeAutoInput(features: unknown, patternId: unknown) {
  if (typeof patternId !== 'string' || !patternId.trim() || patternId.length > 128 || /[\x00-\x1f\x7f]/.test(patternId)) {
    throw Error('La detección automática requiere una operación exacta.');
  }
  const document = validateDocument({ version: 1, id: 'auto-scope-input', name: 'Auto scope input', units: 'mm', features,
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z' });
  const index = document.features.findIndex(feature => feature.id === patternId), feature = document.features[index];
  if (!feature || feature.suppressed || !['linearPattern', 'circularPattern', 'mirror'].includes(feature.type)
    || !('featurePattern' in feature) || !feature.featurePattern || !isAllFeaturePattern(feature.featurePattern)) {
    throw Error('La detección necesita una repetición ALL provisional válida con sus operaciones y geometrías explícitas.');
  }
  return { features: document.features, patternId, index,
    sourceFeaturesSignature: recipeAutoSourceFeaturesSignature(document.features, patternId) };
}
