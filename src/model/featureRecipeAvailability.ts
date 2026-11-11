import type { Feature, RepetitionFeature } from '../cad/kernel.types';
import { isInitialAdditiveAllRecipe } from './featureRecipes';

export type RecipeAvailabilityScope = 'selected' | 'dynamic';

/** UI guidance over parsed metadata only. No solve, extraction or native authority. */
export function recipeSeedUnavailableReason(seed: Feature | undefined, features: ReadonlyMap<string, Feature>, scope: RecipeAvailabilityScope): string | null {
  if (!seed) return 'La operación ya no está disponible. Quita su referencia para elegir otra.';
  if (seed.suppressed) return 'La operación está suprimida. Actívala o quita su referencia.';
  if (seed.type !== 'cut' && seed.type !== 'extrude') {
    return 'Esta operación admite su uso normal, pero no Recalcular dentro de un patrón. Puedes usar Copiar geometría cuando su material esté disponible.';
  }
  if (seed.type === 'extrude' && seed.bodyOperation?.mode !== 'merge') {
    return seed.bodyOperation?.mode === 'new'
      ? 'Recalcular requiere un saliente fusionado con un cuerpo existente. La creación de cuerpos conserva su modo de copia.'
      : 'Recalcular requiere el cuerpo explícito del saliente; no asigna propietarios a una operación antigua.';
  }
  if (seed.type === 'cut' && !seed.bodyScope?.length) {
    return 'Recalcular requiere los cuerpos explícitos del corte; no asigna propietarios a una operación antigua.';
  }
  const sketch = features.get(seed.sketchId);
  if (sketch?.type !== 'sketch' || sketch.suppressed) return 'El croquis de la operación no está disponible. Recupera el croquis o quita la referencia.';
  if (sketch.support) return 'Recalcular todavía no admite croquis apoyados en caras o planos asociados. Elige otra semilla o Copiar geometría.';
  const ends = [seed.endCondition, ...(seed.secondDirection?.enabled ? [seed.secondDirection.endCondition] : [])];
  if (ends.some(end => end?.kind === 'upToSurface' && end.target.kind !== 'principal')) {
    return 'Recalcular Hasta superficie admite un plano principal fijo. Los límites por cara o plano asociado conservan su uso normal.';
  }
  if (scope === 'dynamic' && seed.type === 'extrude' && !isInitialAdditiveAllRecipe(seed, sketch)) {
    if (sketch.profile.kind === 'entities') return 'Este perfil de saliente sólo admite Cuerpos seleccionados al recalcular. Todos los cuerpos y Detectar cuerpos todavía no lo admiten.';
    if (Object.hasOwn(seed, 'endCondition')) return 'Este límite geométrico del saliente sólo admite Cuerpos seleccionados al recalcular.';
    if (Object.hasOwn(seed, 'thinWall')) return 'Este saliente con lámina sólo admite Cuerpos seleccionados al recalcular.';
    return 'Este saliente conserva una definición de Dirección 2 y sólo admite Cuerpos seleccionados al recalcular.';
  }
  return null;
}

/** At most 32 selected IDs; callers memoize the history index independently of draft fields. */
export function recipeSelectionUnavailableReason(feature: RepetitionFeature, features: ReadonlyMap<string, Feature>, scope: RecipeAvailabilityScope): string | null {
  if (feature.source.mode !== 'features' || !feature.source.featureIds.length) return 'Selecciona una operación con geometría para recalcular.';
  if (scope === 'dynamic' && feature.featurePattern?.mode === 'regenerate' && feature.featurePattern.variation.kind !== 'none') {
    return 'Quita las variaciones por instancia antes de usar Todos los cuerpos o Detectar cuerpos.';
  }
  for (const id of feature.source.featureIds) {
    const seed = features.get(id), reason = recipeSeedUnavailableReason(seed, features, scope);
    if (reason) return seed ? `${seed.name}: ${reason}` : reason;
  }
  return null;
}
