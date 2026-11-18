import { describe, expect, it } from 'vitest';
import type { Feature, SketchFeature } from '../cad/kernel.types';
import { addFeature, DocumentHistory, validateDocument, type Document } from './document';
import { canContinuePartSketch, stagePartSketch, unusedPartSketchPreview } from './partSketchContinuation';

// Original declaration-only fixture; native body reconstruction is checked by renderer workflows.
const sketch = (id: string, width = 2): SketchFeature => ({ id, name: id, type: 'sketch', plane: 'XY',
  offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width, height: 2 } });
const solid = (id: string, sketchId: string, suppressed = false): Feature => ({
  id, name: id, type: 'extrude', sketchId, depth: 4, symmetric: false, suppressed,
});
const fixture = (): Document => validateDocument({ version: 1, id: 'unused-sketch-original', name: 'Unused sketch original', units: 'mm',
  createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  features: [sketch('base-profile'), sketch('unused-profile'), solid('base', 'base-profile')] });

describe('new and saved unused sketch continuation', () => {
  it('admits new and saved unused sketches but rejects consumed, suppressed and colliding identities', () => {
    const doc = fixture();
    expect(canContinuePartSketch(doc, sketch('new-profile'))).toBe(true);
    expect(canContinuePartSketch(doc, sketch('unused-profile'))).toBe(true);
    expect(canContinuePartSketch(doc, sketch('base-profile'))).toBe(false);
    expect(canContinuePartSketch(doc, { ...sketch('unused-profile'), suppressed: true })).toBe(false);
    expect(canContinuePartSketch(doc, sketch('base'))).toBe(false);
    const suppressedConsumer = addFeature(doc, solid('suppressed-consumer', 'unused-profile', true));
    expect(canContinuePartSketch(suppressedConsumer, sketch('unused-profile'))).toBe(false);
    expect(() => stagePartSketch(suppressedConsumer, sketch('unused-profile', 3))).toThrow('Acepta o cancela');
  });

  it('keeps all later features in unused preview and replaces the sketch at its original position', () => {
    const doc = fixture(), original = structuredClone(doc), draft = sketch('unused-profile', 3);
    const preview = unusedPartSketchPreview(doc, draft)!;
    expect(preview.map(feature => feature.id)).toEqual(['base-profile', 'unused-profile', 'base']);
    expect(preview[1]).toBe(draft);
    const candidate = stagePartSketch(doc, draft);
    expect(candidate.features).toEqual(preview);
    expect(candidate.features.filter(feature => feature.id === draft.id)).toHaveLength(1);
    expect(doc).toEqual(original);
    expect(unusedPartSketchPreview(doc, sketch('base-profile', 3))).toBeNull();
    expect(unusedPartSketchPreview(doc, sketch('new-profile'))).toBeNull();
    expect(stagePartSketch(doc, sketch('new-profile')).features.at(-1)?.id).toBe('new-profile');
  });

  it('lets intermediate invalid draft values reach preview without throwing but rejects staging them', () => {
    const doc = fixture(), draft = sketch('unused-profile', NaN);
    expect(() => unusedPartSketchPreview(doc, draft)).not.toThrow();
    expect(unusedPartSketchPreview(doc, draft)?.[1]).toBe(draft);
    expect(() => stagePartSketch(doc, draft)).toThrow();
  });

  it('keeps cancellation outside history and records modified sketch then operation as two reversible steps', () => {
    const doc = fixture(), history = new DocumentHistory(doc), draft = sketch('unused-profile', 3);
    const candidate = stagePartSketch(doc, draft);
    expect(history.current).toEqual(doc); expect(history.canUndo).toBe(false);
    const proposal = addFeature(candidate, solid('new-operation', draft.id));
    history.apply(candidate); history.apply(proposal);
    expect(history.undo()).toEqual(candidate);
    expect(history.undo()).toEqual(doc);
    expect(history.redo()).toEqual(candidate);
    expect(history.redo()).toEqual(proposal);
  });

  it('does not add a timestamp-only sketch history step when the saved sketch is unchanged', () => {
    const doc = fixture(), history = new DocumentHistory(doc);
    const candidate = stagePartSketch(doc, structuredClone(doc.features[1]) as SketchFeature);
    expect(candidate).toBe(doc);
    history.apply(candidate); expect(history.canUndo).toBe(false);
    history.apply(addFeature(candidate, solid('new-operation', 'unused-profile')));
    expect(history.undo()).toEqual(doc); expect(history.canUndo).toBe(false);
  });
});
