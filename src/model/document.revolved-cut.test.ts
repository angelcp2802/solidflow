import { expect, it } from 'vitest';
import type { Feature, RevolvedCutFeature } from '../cad/kernel.types';
import { createDocument, parseDocument, serializeDocument, validateDocument } from './document';
import { featureDependencyIds, featureSketchIds } from './featureInputs';
import { createdBodyIds, featureBodyOutputIds, featureBodyReferences } from './bodyReferences';

// Original structural fixture, with no external geometry or privileged paths.
const prefix: Feature[] = [{ id: 'disk', name: 'Disk', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'circle', center: [0, 0], radius: 5 } }, {
  id: 'base', name: 'Base', type: 'extrude', sketchId: 'disk', depth: 10, symmetric: false, suppressed: false,
  bodyOperation: { mode: 'new', bodyId: 'body' },
}, { id: 'profile', name: 'Groove', type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [4.5, 5], width: 3, height: 2 } }];
const cut = (patch: Partial<RevolvedCutFeature> = {}): RevolvedCutFeature => ({ id: 'cut', name: 'Groove cut', type: 'revolvedCut',
  suppressed: false, sketchId: 'profile', angle: 360, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'base' }], ...patch });
const document = (feature: unknown) => ({ ...createDocument('Original revolved cut'), features: [...prefix, feature] });

it.each([
  {},
  { angle: 60, extent: { kind: 'two-directions' as const, secondAngle: 30 }, reversed: true },
  { angle: 90, extent: { kind: 'mid-plane' as const }, axis: { kind: 'sketch-axis' as const, axis: 'x' as const } },
])('preserves the distinct subtractive feature, exact references and extent on a saved round trip: %j', patch => {
  const expected = cut(patch), parsed = validateDocument(document(expected));
  const saved = serializeDocument(parsed), reopened = parseDocument(saved);
  expect(reopened.features.at(-1)).toEqual(expected);
  expect(serializeDocument(reopened)).toBe(saved);
  expect(reopened.features.at(-1)?.type).toBe('revolvedCut');
});

it('tracks the sketch and exact target without allocating a body identity', () => {
  const feature = cut();
  expect(featureSketchIds(feature)).toEqual(['profile']);
  expect(featureDependencyIds(feature)).toEqual(['profile', 'base']);
  expect(featureBodyReferences(feature)).toEqual([{ bodyId: 'body', sourceFeatureId: 'base' }]);
  expect(createdBodyIds(feature)).toEqual([]); expect(featureBodyOutputIds(feature)).toEqual(['body']);
});

it('admits a later cut referencing the first cut poststate without turning it into a creator', () => {
  const first = cut(), second = cut({ id: 'next-cut', angle: 90, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'cut' }] });
  const parsed = validateDocument({ ...createDocument(), features: [...prefix, first, second] });
  expect(parsed.features.at(-1)).toEqual(second);
});

it.each([
  { bodyOperation: { mode: 'new', bodyId: 'foreign' } },
  { depth: 20 }, { symmetric: false }, { baseFeatureId: 'base' },
])('rejects additive/extrusion hybrid declarations instead of ignoring their fields: %j', patch => {
  expect(() => validateDocument(document({ ...cut(), ...patch })))
    .toThrow(`Documento.features[3].${Object.keys(patch)[0]}: campo desconocido`);
});

it.each([
  { angle: 0 }, { angle: -1 }, { angle: 361 }, { angle: Infinity },
  { angle: 300, extent: { kind: 'two-directions', secondAngle: 61 } },
  { reversed: 'false' }, { axis: { kind: 'sketch-axis', axis: 'z' } },
  { bodyScope: [] }, { bodyScope: [{ bodyId: 'body', sourceFeatureId: 'base' }, { bodyId: 'body', sourceFeatureId: 'base' }] },
  { bodyScope: [{ bodyId: 'body', sourceFeatureId: 'future' }] },
])('rejects malformed extents/axes or nonexisting/duplicate exact targets: %j', patch => {
  expect(() => validateDocument(document({ ...cut(), ...patch }))).toThrow();
});

it('keeps an existing additive revolution byte-identical on round trip', () => {
  // Literal historical field order, not bytes first produced by the new parser.
  const original = { version: 1, id: 'original-legacy-order', name: 'Original legacy bytes', units: 'mm', features: [
    { id: 'profile', name: 'Profile', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [4.5, 5], width: 3, height: 2 } },
    { id: 'old-revolution', name: 'Legacy boss', suppressed: false, type: 'revolve', sketchId: 'profile', angle: 90 },
  ], createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z' };
  const saved = JSON.stringify(original, null, 2);
  expect(serializeDocument(validateDocument(original))).toBe(saved);
  expect(serializeDocument(parseDocument(saved))).toBe(saved);
  expect(parseDocument(saved).features.at(-1)).not.toHaveProperty('bodyScope');
});
