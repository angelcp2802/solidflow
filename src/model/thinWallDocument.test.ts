import { describe, expect, it, vi } from 'vitest';
import type { Feature, SketchFeature, ThinWallDefinition } from '../cad/kernel.types';
import { DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, type Document } from './document';
import { featureDependencyIds, featureSketchIds } from './featureInputs';
import { createdBodyIds, featureBodyReferences } from './bodyReferences';

type WallOperation = Extract<Feature, { type: 'extrude' | 'cut' | 'revolve' | 'revolvedCut' }>;
const operations = ['extrude', 'cut', 'revolve', 'revolvedCut'] as const;
const definitions: ThinWallDefinition[] = [
  { kind: 'one-side', thickness: 2, reversed: false },
  { kind: 'mid-plane', thickness: 3 },
  { kind: 'two-sides', firstThickness: 1, secondThickness: 2 },
];
// Original synthetic declarations. Open LINE/ARC parsing is not native wall acceptance.
const sketch: SketchFeature = {
  id: 'profile', name: 'Original open chain', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'entities', points: [
    { id: 'center', x: 0, y: 0 }, { id: 'start', x: 2, y: 0 },
    { id: 'join', x: 0, y: 2 }, { id: 'end', x: -2, y: 2 },
  ], entities: [
    { id: 'arc', construction: false, type: 'arc', center: 'center', start: 'start', end: 'join', clockwise: false },
    { id: 'line', construction: false, type: 'line', start: 'join', end: 'end' },
  ], constraints: [] },
};
function operation(type: WallOperation['type']): WallOperation {
  const base = { id: 'wall', name: 'Original operation', suppressed: false };
  return type === 'extrude' || type === 'cut'
    ? { ...base, sketchId: 'profile', depth: 4, symmetric: false, type }
    : { ...base, type, sketchId: 'profile', angle: 90 };
}
function fixture(type: WallOperation['type']): Document {
  return { version: 1, id: 'original-thin-wall', name: 'Thin declaration', units: 'mm',
    features: [structuredClone(sketch), operation(type)],
    createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' };
}
function wall(document: Document): WallOperation {
  const feature = document.features.find(feature => feature.id === 'wall');
  if (!feature || !operations.some(type => type === feature.type)) throw new Error('Original wall fixture missing.');
  return feature as WallOperation;
}

describe('thin-wall document compatibility', () => {
  it.each(operations)('retains active/inactive cap intent through save and history on %s without granting native eligibility', type => {
    const initial = fixture(type), history = new DocumentHistory(initial);
    const thinWall: ThinWallDefinition = { ...definitions[0], endCaps: { enabled: true, thickness: 1 } };
    history.apply(updateFeature(history.current, 'wall', { thinWall }));
    const reopened = parseDocument(serializeDocument(history.current));
    expect(wall(reopened).thinWall).toEqual(thinWall);
    expect(wall(reopened).thinWall?.endCaps).not.toBe(thinWall.endCaps);
    history.apply(updateFeature(reopened, 'wall', { thinWall: { ...thinWall, endCaps: { enabled: false, thickness: 1 } } }));
    expect(wall(history.undo()).thinWall?.endCaps).toEqual({ enabled: true, thickness: 1 });
    expect(wall(history.redo()).thinWall?.endCaps).toEqual({ enabled: false, thickness: 1 });
    expect(wall(parseDocument(serializeDocument(history.current))).thinWall?.endCaps).toEqual({ enabled: false, thickness: 1 });
    expect(history.current.features[0]).toEqual(initial.features[0]);
  });

  it.each(operations)('rejects executable and malformed cap records on %s before native work', type => {
    const hook = vi.fn(() => 1), accessor = { enabled: true, thickness: 1 };
    Object.defineProperty(accessor, 'thickness', { get: hook, enumerable: true });
    for (const endCaps of [accessor, undefined, { enabled: true, thickness: '1' }, { enabled: false, thickness: NaN }]) {
      const document = fixture(type);
      Object.assign(wall(document), { thinWall: { ...definitions[0], endCaps } });
      expect(() => validateDocument(document)).toThrow();
    }
    expect(hook).not.toHaveBeenCalled();
  });

  it.each(operations)('round-trips and histories detached corner settings on %s', type => {
    const initial = fixture(type), history = new DocumentHistory(initial);
    const thinWall: ThinWallDefinition = { ...definitions[0], autoCorners: { enabled: true, radius: .001 } };
    history.apply(updateFeature(history.current, 'wall', { thinWall }));
    const saved = parseDocument(serializeDocument(history.current));
    expect(wall(saved).thinWall).toEqual(thinWall);
    expect(wall(saved).thinWall?.autoCorners).not.toBe(thinWall.autoCorners);
    expect(saved.features[0]).toEqual(initial.features[0]);
    history.apply(updateFeature(saved, 'wall', { thinWall: { ...thinWall, autoCorners: { enabled: false, radius: .001 } } }));
    expect(wall(history.undo()).thinWall?.autoCorners).toEqual({ enabled: true, radius: .001 });
    expect(wall(history.redo()).thinWall?.autoCorners).toEqual({ enabled: false, radius: .001 });
    expect(wall(parseDocument(serializeDocument(history.current))).thinWall?.autoCorners).toEqual({ enabled: false, radius: .001 });
  });

  it.each(operations)('rejects executable or invalid saved corner settings on %s', type => {
    const hook = vi.fn(() => 3);
    const autoCorners = { enabled: true, radius: 3 };
    Object.defineProperty(autoCorners, 'radius', { get: hook, enumerable: true });
    for (const option of [autoCorners, undefined, { enabled: true, radius: '3' }, { enabled: false, radius: NaN }]) {
      const original = fixture(type);
      Object.assign(wall(original), { thinWall: { ...definitions[0], autoCorners: option } });
      expect(() => validateDocument(original)).toThrow();
    }
    expect(hook).not.toHaveBeenCalled();
  });

  it.each(operations)('preserves exact absent legacy bytes for %s, including open sketches', type => {
    const original = fixture(type), bytes = JSON.stringify(original, null, 2);
    expect(serializeDocument(validateDocument(original))).toBe(bytes);
    expect(serializeDocument(parseDocument(bytes))).toBe(bytes);
    expect(Object.hasOwn(wall(parseDocument(bytes)), 'thinWall')).toBe(false);
  });

  it.each(operations)('round-trips each thin-wall variant for %s without mutating declarations', type => {
    for (const thinWall of definitions) {
      const original = fixture(type);
      wall(original).thinWall = thinWall;
      const normalized = validateDocument(original);
      expect(wall(normalized).thinWall).toEqual(thinWall);
      expect(wall(normalized).thinWall).not.toBe(thinWall);
      expect(parseDocument(serializeDocument(normalized))).toEqual(normalized);
      expect((normalized.features[0] as SketchFeature).profile).toEqual(sketch.profile);
    }
  });

  it.each(operations)('rejects invalid or explicitly undefined thinWall on %s', type => {
    for (const thinWall of [undefined, null, { kind: 'mid-plane', thickness: 1e-7 },
      { kind: 'two-sides', firstThickness: 60_000, secondThickness: 40_001 },
      { kind: 'one-side', thickness: 2 }, { kind: 'mid-plane', thickness: 2, extra: true }]) {
      const document = fixture(type);
      Object.assign(wall(document), { thinWall });
      expect(() => validateDocument(document)).toThrow();
    }
  });

  it.each(operations)('rejects outer and nested accessors without invoking them on %s', type => {
    const hook = vi.fn(() => definitions[0]);
    const document = fixture(type);
    Object.defineProperty(wall(document), 'thinWall', { enumerable: true, get: hook });
    expect(() => validateDocument(document)).toThrow();
    const nested = fixture(type);
    const thinWall = { kind: 'mid-plane', thickness: 2 };
    Object.defineProperty(thinWall, 'thickness', { enumerable: true, get: hook });
    Object.assign(wall(nested), { thinWall });
    expect(() => validateDocument(nested)).toThrow();
    expect(hook).not.toHaveBeenCalled();
  });

  it.each(operations)('edits, clears, undoes, redoes and reopens %s without changing profile consumption', type => {
    const initial = fixture(type), history = new DocumentHistory(initial);
    history.apply(updateFeature(history.current, 'wall', { thinWall: definitions[0] }));
    history.apply(updateFeature(history.current, 'wall', { thinWall: definitions[2] }));
    expect(wall(history.undo()).thinWall).toEqual(definitions[0]);
    expect(wall(history.redo()).thinWall).toEqual(definitions[2]);
    const restored = parseDocument(serializeDocument(history.current)), feature = wall(restored);
    expect(featureSketchIds(feature)).toEqual(['profile']);
    expect(featureDependencyIds(feature)).toEqual(['profile']);
    expect(featureBodyReferences(feature)).toEqual([]);
    expect(createdBodyIds(feature)).toEqual([]);
    expect(removeFeature(restored, 'profile').features).toEqual([]);
    history.apply(updateFeature(restored, 'wall', { thinWall: undefined }));
    expect(Object.hasOwn(wall(history.current), 'thinWall')).toBe(false);
    expect(wall(history.undo()).thinWall).toEqual(definitions[2]);
    expect(Object.hasOwn(wall(history.redo()), 'thinWall')).toBe(false);
    expect(wall(parseDocument(serializeDocument(history.current)))).toEqual(wall(initial));
  });

  it.each(operations)('preserves exact body declarations and dependency roles on %s', type => {
    const document = fixture(type), owner = { bodyId: 'base-body', sourceFeatureId: 'base' };
    document.features.unshift({ ...sketch, id: 'base-sketch', profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } },
      { id: 'base', name: 'Original owner', suppressed: false, type: 'extrude', sketchId: 'base-sketch', depth: 8,
        symmetric: false, bodyOperation: { mode: 'new', bodyId: owner.bodyId } });
    const feature = wall(document);
    if (feature.type === 'extrude' || feature.type === 'revolve') feature.bodyOperation = { mode: 'merge', target: owner };
    else feature.bodyScope = [owner];
    const before = validateDocument(document), edited = updateFeature(before, 'wall', { thinWall: definitions[1] });
    expect(featureBodyReferences(wall(edited))).toEqual(featureBodyReferences(wall(before)));
    expect(createdBodyIds(wall(edited))).toEqual(createdBodyIds(wall(before)));
    expect(featureDependencyIds(wall(edited))).toEqual(['profile', 'base']);
    expect(featureSketchIds(wall(edited))).toEqual(['profile']);
    expect(removeFeature(edited, 'base').features.map(feature => feature.id)).toEqual(['base-sketch', 'profile']);
  });
});
