import { describe, expect, it, vi } from 'vitest';
import type { ExtrudeFeature, Feature } from '../cad/kernel.types';
import { featureDependencyIds, featureSketchIds } from './featureInputs';
import { createdBodyIds, featureBodyReferences } from './bodyReferences';
import { createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument } from './document';

function fixture(type: 'extrude' | 'cut' = 'extrude') {
  const document = createDocument('Original two-direction fixture');
  document.features = [{ id: 'profile', name: 'Original rectangle', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [0, 0], width: 12, height: 8 } },
  { id: 'operation', name: 'Original extrusion', suppressed: false, sketchId: 'profile', depth: 20, symmetric: false, type }];
  return document;
}
function operation(features: Feature[]): ExtrudeFeature { return features[1] as ExtrudeFeature; }

describe('second-direction document compatibility', () => {
  it.each(['extrude', 'cut'] as const)('preserves exact legacy bytes without the optional field: %s', type => {
    const original = fixture(type), bytes = JSON.stringify(original, null, 2);
    expect(serializeDocument(parseDocument(bytes))).toBe(bytes);
  });

  it.each(['extrude', 'cut'] as const)('retains depths, OFF recovery, history and dependency/body declarations: %s', type => {
    const initial = fixture(type), history = new DocumentHistory(initial), secondDirection = { enabled: true, depth: 10 };
    history.apply(updateFeature(history.current, 'operation', { secondDirection }));
    const reopened = parseDocument(serializeDocument(history.current)), feature = operation(reopened.features);
    expect(feature.secondDirection).toEqual(secondDirection); expect(feature.secondDirection).not.toBe(secondDirection);
    expect(featureSketchIds(feature)).toEqual(['profile']); expect(featureDependencyIds(feature)).toEqual(['profile']);
    expect(createdBodyIds(feature)).toEqual([]); expect(featureBodyReferences(feature)).toEqual([]);
    history.apply(updateFeature(reopened, 'operation', { secondDirection: { enabled: false, depth: 10 } }));
    expect(operation(history.undo().features).secondDirection?.enabled).toBe(true);
    expect(operation(history.redo().features).secondDirection).toEqual({ enabled: false, depth: 10 });
    history.apply(updateFeature(history.current, 'operation', { secondDirection: undefined }));
    expect(Object.hasOwn(operation(parseDocument(serializeDocument(history.current)).features), 'secondDirection')).toBe(false);
    expect(history.current.features[0]).toEqual(initial.features[0]);
  });

  it('validates OFF data and rejects executable editor patches before spreading', () => {
    const hook = vi.fn(() => ({ enabled: false, depth: 10 }));
    const patch = Object.defineProperty({}, 'secondDirection', { get: hook, enumerable: true });
    expect(() => updateFeature(fixture(), 'operation', patch)).toThrow(); expect(hook).not.toHaveBeenCalled();
    for (const secondDirection of [undefined, null, { enabled: false, depth: '10' }, { enabled: false, depth: 0 }]) {
      const document = fixture(); Object.assign(operation(document.features), { secondDirection });
      expect(() => validateDocument(document)).toThrow();
    }
  });

  it('retains parseable intent for native context rejection and later OFF recovery', () => {
    const document = fixture(); Object.assign(operation(document.features), { symmetric: true, secondDirection: { enabled: true, depth: 10 } });
    const reopened = parseDocument(serializeDocument(document));
    expect(operation(reopened.features).secondDirection).toEqual({ enabled: true, depth: 10 });
    const repaired = updateFeature(reopened, 'operation', { secondDirection: { enabled: false, depth: 10 } });
    expect(operation(parseDocument(serializeDocument(repaired)).features).secondDirection?.enabled).toBe(false);
  });
});
