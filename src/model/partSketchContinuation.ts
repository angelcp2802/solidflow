import type { SketchFeature } from '../cad/kernel.types';
import { addFeature, updateFeature, type Document } from './document';
import { featureDependencyIds } from './featureInputs';

/** Draft eligibility only; suppressed consumers still own their dependencies. */
export function canContinuePartSketch(document: Document, sketch: SketchFeature): boolean {
  const matching = document.features.filter(feature => feature.id === sketch.id);
  return !sketch.suppressed && (matching.length === 0 || matching.length === 1 && matching[0].type === 'sketch')
    && !document.features.some(feature => feature.id !== sketch.id && featureDependencyIds(feature).includes(sketch.id));
}

/** Unvalidated preview input: invalid intermediate fields belong to the build error path. */
export function unusedPartSketchPreview(document: Document, sketch: SketchFeature): Document['features'] | null {
  if (!canContinuePartSketch(document, sketch) || !document.features.some(feature => feature.id === sketch.id)) return null;
  return document.features.map(feature => feature.id === sketch.id ? sketch : feature);
}

/** Admission happens at the command boundary, before staging is rendered. */
export function stagePartSketch(document: Document, sketch: SketchFeature): Document {
  if (!canContinuePartSketch(document, sketch)) throw new Error('Acepta o cancela la edición de este croquis antes de continuar.');
  if (!document.features.some(feature => feature.id === sketch.id)) return addFeature(document, sketch);
  const candidate = updateFeature(document, sketch.id, sketch);
  // updateFeature updates the timestamp even for a no-op. Preserve the original
  // document so history does not acquire an unchanged-sketch entry.
  return JSON.stringify(candidate.features) === JSON.stringify(document.features) ? document : candidate;
}
