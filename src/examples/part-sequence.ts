import type { Feature, SketchFeature } from '../cad/kernel.types';
import { createDocument, validateDocument, type Document } from '../model/document';
import initialDocument from '../cad/fixtures/part-sequence-original.json';

// Original Cartesian geometry in mm; no imported models or external assets.
const bodyId = 'seq-body';
const target = (sourceFeatureId: string) => ({ bodyId, sourceFeatureId });
const rectangle = (id: string, name: string, width: number, height: number, x: number, offset: number): SketchFeature => ({
  id, name, type: 'sketch', plane: 'XY', offset, suppressed: false,
  profile: { kind: 'rectangle', width, height, center: [x, 0] },
});

export function createCompletedPartSequenceDocument(baseDepth = 4): Document {
  const features: Feature[] = [
    rectangle('seq-base-sketch', 'Base profile', 20, 12, 0, 0),
    { id: 'seq-base', name: 'Base', type: 'extrude', sketchId: 'seq-base-sketch', depth: baseDepth, symmetric: false,
      suppressed: false, bodyOperation: { mode: 'new', bodyId } },
    rectangle('seq-cut-left-sketch', 'Left cut profile', 2, 2, -6, 0),
    { id: 'seq-cut-left', name: 'Left cut', type: 'cut', sketchId: 'seq-cut-left-sketch', depth: baseDepth,
      symmetric: false, suppressed: false, bodyScope: [target('seq-base')] },
    rectangle('seq-cut-right-sketch', 'Right cut profile', 2, 2, 6, 0),
    { id: 'seq-cut-right', name: 'Right cut', type: 'cut', sketchId: 'seq-cut-right-sketch', depth: baseDepth,
      symmetric: false, suppressed: false, bodyScope: [target('seq-cut-left')] },
    rectangle('seq-boss-sketch', 'Boss profile', 4, 4, 0, baseDepth),
    { id: 'seq-boss', name: 'Boss', type: 'extrude', sketchId: 'seq-boss-sketch', depth: 3, symmetric: false,
      suppressed: false, bodyOperation: { mode: 'merge', target: target('seq-cut-right') } },
    rectangle('seq-cap-sketch', 'Cap profile', 2, 2, 0, baseDepth + 3),
    { id: 'seq-cap', name: 'Cap', type: 'extrude', sketchId: 'seq-cap-sketch', depth: 2, symmetric: false,
      suppressed: false, bodyOperation: { mode: 'merge', target: target('seq-boss') } },
  ];
  return validateDocument({ ...createDocument('Original sequential part'), features });
}

/** Starting model for authoring four successive operations through real controls. */
export function createPartSequenceDocument(): Document {
  return validateDocument(structuredClone(initialDocument));
}
