import { expect, it } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import type { ExtrudeFeature, Feature, ReferencePlaneFeature, SketchFeature } from './kernel.types';
import { entityPrismContextFromFeatures } from './kernel.semantic-context';
import { createEntityPrismIdentityV2 } from './kernel.semantic-references';

// Original unit square: only saved IDs/connectivity enter these pure checks.
const profile: EntityProfile = { kind: 'entities', points: [
  { id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 1, y: 1 }, { id: 'd', x: 0, y: 1 },
], entities: ['a', 'b', 'c', 'd'].map((id, index, points) => ({ id: `edge-${index}`, type: 'line',
  start: id, end: points[(index + 1) % 4], construction: false })), constraints: [] };
const plane = (id: string, previous?: string): ReferencePlaneFeature => ({ id, name: id, type: 'plane', suppressed: false,
  support: previous ? { kind: 'plane', planeId: previous } : { kind: 'principal', plane: 'XY' }, offset: 0, reversed: false });
const sketch = (): SketchFeature => ({ id: 'sketch', name: 'Unit square', type: 'sketch', plane: 'XY', offset: 0,
  suppressed: false, profile: structuredClone(profile), support: { kind: 'plane', planeId: 'plane-b' } });
const extrude = (): ExtrudeFeature => ({ id: 'solid', name: 'Finite solid', type: 'extrude', sketchId: 'sketch',
  depth: 4, symmetric: false, suppressed: false });
const fixture = (): Feature[] => [plane('plane-a'), plane('plane-b', 'plane-a'), sketch(), extrude()];
function identity(features: Feature[]): string {
  const context = entityPrismContextFromFeatures(features, 'solid');
  if (!context) throw new Error('Eligible ordered ancestry expected.');
  return createEntityPrismIdentityV2(profile, context, { outer: ['edge-0', 'edge-1', 'edge-2', 'edge-3'], holes: [] }).lineageDigest;
}

it('uses only ordered dependencies in a large document rather than the entire history', () => {
  const original = fixture(), large = [...Array.from({ length: 1000 }, (_, index) => plane(`unrelated-${index}`)), ...original];
  expect(entityPrismContextFromFeatures(large, 'solid')).toEqual(entityPrismContextFromFeatures(original, 'solid'));
  expect(entityPrismContextFromFeatures(large, 'solid')?.history.map(entry => entry.id)).toEqual(['plane-a', 'plane-b', 'sketch', 'solid']);
  expect(identity(large)).toBe(identity(original));
});

it('excludes names, placements, sketch dimensions and depth magnitude while copying support descriptors', () => {
  const original = fixture(), changed = structuredClone(original), before = entityPrismContextFromFeatures(original, 'solid');
  (changed[0] as ReferencePlaneFeature).offset = 123;
  (changed[1] as ReferencePlaneFeature).offset = -17;
  (changed[2] as SketchFeature).offset = 9;
  (changed[2] as SketchFeature).profile = { ...profile, points: profile.points.map(point => ({ ...point, x: point.x * 30, y: point.y * 20 })) };
  (changed[3] as ExtrudeFeature).depth = 80;
  changed.forEach(feature => feature.name = 'Renamed');
  expect(entityPrismContextFromFeatures(changed, 'solid')).toEqual(before);
  expect(identity(changed)).toBe(identity(original));
  (original[1] as ReferencePlaneFeature).support = { kind: 'principal', plane: 'YZ' };
  expect(before?.history[1]).toMatchObject({ support: { kind: 'plane', planeId: 'plane-a' } });
});

it.each(['direction', 'symmetry', 'planeOrientation', 'principalPlane'] as const)(
  'retains the discrete %s branch in the semantic identity', branch => {
    const original = fixture(), changed = structuredClone(original);
    if (branch === 'direction') (changed[3] as ExtrudeFeature).depth = -4;
    if (branch === 'symmetry') (changed[3] as ExtrudeFeature).symmetric = true;
    if (branch === 'planeOrientation') (changed[1] as ReferencePlaneFeature).reversed = true;
    if (branch === 'principalPlane') (changed[0] as ReferencePlaneFeature).support = { kind: 'principal', plane: 'YZ' };
    expect(identity(changed)).not.toBe(identity(original));
  },
);

it.each(['missing', 'forward', 'cycle', 'duplicate'] as const)('rejects %s ancestry instead of guessing a source', kind => {
  const features = fixture();
  if (kind === 'missing') (features[1] as ReferencePlaneFeature).support = { kind: 'plane', planeId: 'missing' };
  if (kind === 'forward') (features[0] as ReferencePlaneFeature).support = { kind: 'plane', planeId: 'plane-b' };
  if (kind === 'cycle') (features[1] as ReferencePlaneFeature).support = { kind: 'plane', planeId: 'plane-b' };
  if (kind === 'duplicate') features.unshift(plane('plane-a'));
  expect(entityPrismContextFromFeatures(features, 'solid')).toBeUndefined();
});

it('keeps the exact closure bound of 256 without applying it to unrelated features', () => {
  const chain = (count: number): Feature[] => [...Array.from({ length: count }, (_, index) => plane(`p-${index}`, index ? `p-${index - 1}` : undefined)),
    { ...sketch(), support: { kind: 'plane', planeId: `p-${count - 1}` } }, extrude()];
  expect(entityPrismContextFromFeatures(chain(254), 'solid')?.history).toHaveLength(256);
  expect(entityPrismContextFromFeatures(chain(255), 'solid')).toBeUndefined();
});

it('rejects an active earlier solid as ancestry for a standalone producer', () => {
  const features = fixture(), earlier: ExtrudeFeature = { ...extrude(), id: 'earlier-solid' };
  features.splice(3, 0, earlier);
  const supported: SketchFeature = { ...sketch(), id: 'supported', support: { kind: 'face',
    face: { sourceFeatureId: earlier.id, key: 'face-v2|' + 'a'.repeat(64) } } };
  features.splice(4, 0, supported);
  (features[5] as ExtrudeFeature).sketchId = supported.id;
  expect(entityPrismContextFromFeatures(features, 'solid')).toBeUndefined();
});

it('excludes thin-wall producers and their suppressed ancestry from filled-prism provenance', () => {
  const features = fixture();
  (features[3] as ExtrudeFeature).thinWall = { kind: 'mid-plane', thickness: 1 };
  expect(entityPrismContextFromFeatures(features, 'solid')).toBeUndefined();
  const earlier: ExtrudeFeature = { ...extrude(), id: 'earlier', suppressed: true,
    thinWall: { kind: 'one-side', thickness: 1, reversed: false } };
  const supported: SketchFeature = { ...sketch(), id: 'supported', support: { kind: 'face',
    face: { sourceFeatureId: earlier.id, key: 'face-v2|' + 'a'.repeat(64) } } };
  const source = { ...extrude(), sketchId: supported.id };
  expect(entityPrismContextFromFeatures([...fixture().slice(0, 3), earlier, supported, source], 'solid')).toBeUndefined();
});

it('does not read an executable thin-wall declaration while declining filled-prism provenance', () => {
  const features = fixture();
  let calls = 0;
  Object.defineProperty(features[3], 'thinWall', { enumerable: true, get: () => { calls++; throw new Error('untrusted getter'); } });
  expect(entityPrismContextFromFeatures(features, 'solid')).toBeUndefined();
  expect(calls).toBe(0);
});

it.each(['cut', 'suppressed', 'endCondition', 'zero', 'nonfinite'] as const)(
  'does not enable a standalone finite extrusion context for %s', kind => {
    const features = fixture(), source = features[3] as ExtrudeFeature;
    if (kind === 'cut') source.type = 'cut';
    if (kind === 'suppressed') source.suppressed = true;
    if (kind === 'endCondition') source.endCondition = { kind: 'throughAll', baseFeatureId: 'base', bothDirections: false };
    if (kind === 'zero') source.depth = 0;
    if (kind === 'nonfinite') source.depth = Number.NaN;
    expect(entityPrismContextFromFeatures(features, 'solid')).toBeUndefined();
  },
);
