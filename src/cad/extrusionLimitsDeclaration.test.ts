import { describe, expect, it, vi } from 'vitest';
import { readSecondDirection, resolveExtrusionDirections, resolveExtrusionSpan, validateSecondDirection } from './extrusionDirection';
import { createDocument, parseDocument, serializeDocument, validateDocument } from '../model/document';
import type { ExtrudeFeature, Feature } from './kernel.types';

const owner = { bodyId: 'base-body', sourceFeatureId: 'base' };
function fixture() {
  const document = createDocument('Original independent end data');
  document.features = [
    { id: 'base-profile', name: 'Original base', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } },
    { id: 'base', name: 'Original owner', type: 'extrude', suppressed: false, sketchId: 'base-profile', depth: 4,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: owner.bodyId } },
    { id: 'lower', name: 'Original lower plane', type: 'plane', suppressed: false, support: { kind: 'principal', plane: 'XY' }, offset: -3, reversed: false },
    { id: 'profile', name: 'Original profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 5,
      profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 2 } },
    { id: 'operation', name: 'Original limit declaration', type: 'extrude', suppressed: false, sketchId: 'profile', depth: 1,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'new-body' }, secondDirection: { enabled: false, depth: 7,
        endCondition: { kind: 'untilNext', baseFeatureId: 'base', baseBody: owner } } },
  ];
  return document;
}
function operation(features: Feature[]) { return features[4] as ExtrudeFeature; }
describe('retained exact secondary end declarations', () => {
  it.each([false, true])('detaches every own end record while enabled=%s', enabled => {
    for (const endCondition of [{ kind: 'throughAll', baseFeatureId: 'base', bothDirections: false },
      { kind: 'untilNext', baseFeatureId: 'base', baseBody: owner },
      { kind: 'upToSurface', target: { kind: 'plane', planeId: 'lower' } }] as const) {
      const raw = { enabled, depth: 7, endCondition }, captured = validateSecondDirection(raw);
      expect(captured).toEqual(raw); expect(captured.endCondition).not.toBe(raw.endCondition);
      expect(readSecondDirection({ secondDirection: raw })).toEqual(raw);
    }
  });
  it.each([undefined, null, {}, { kind: 'throughAll', baseFeatureId: 'base', bothDirections: true },
    { kind: 'untilNext', baseFeatureId: 'base', bothDirections: false }, { kind: 'upToSurface', target: undefined },
    { kind: 'upToSurface', target: { kind: 'plane', planeId: 'lower', extra: true } },
    { kind: 'upToSurface', target: { kind: 'face', face: { sourceFeatureId: 'base', key: 'wrong' } } },
  ])('rejects malformed or bilateral nested ends even OFF: %j', endCondition => {
    expect(() => validateSecondDirection({ enabled: false, depth: 7, endCondition })).toThrow();
  });
  it('never invokes nested kind/target/face getters', () => {
    const hook = vi.fn(() => 'lower');
    for (const field of ['kind', 'target']) {
      const endCondition = { kind: 'upToSurface', target: { kind: 'plane', planeId: 'lower' } };
      Object.defineProperty(endCondition, field, { get: hook, enumerable: true });
      expect(() => validateSecondDirection({ enabled: false, depth: 7, endCondition })).toThrow();
    }
    const target = Object.defineProperty({ kind: 'plane' }, 'planeId', { get: hook, enumerable: true });
    expect(() => validateSecondDirection({ enabled: false, depth: 7, endCondition: { kind: 'upToSurface', target } })).toThrow();
    expect(hook).not.toHaveBeenCalled();
  });
  it('preserves exact old Blind identity and admits automatic role plans without solving lengths', () => {
    const old = { depth: -13, symmetric: false, secondDirection: { enabled: true, depth: 7 } };
    expect(resolveExtrusionSpan(old).identity).toEqual(['second-direction-v1', true]);
    const plan = resolveExtrusionDirections({ ...old, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } },
      secondDirection: { enabled: true, depth: 7, endCondition: { kind: 'untilNext', baseFeatureId: 'base' } } });
    expect(plan.allBlind).toBe(false); expect(plan.first.signedDepth).toBe(-13); expect(plan.second?.signedDepth).toBe(7);
    expect(plan.identity).toEqual(['second-direction-v1', true, ['second-direction-end-v1', 'untilNext']]);
  });
  it('keeps OFF references detached through document reopening', () => {
    const document = fixture(), reopened = parseDocument(serializeDocument(document));
    expect(operation(reopened.features).secondDirection).toEqual(operation(document.features).secondDirection);
    expect(operation(reopened.features).secondDirection).not.toBe(operation(document.features).secondDirection);
  });
  it.each(['missing', 'mismatched', 'forbidden'] as const)('reports exact second-end baseBody location for %s data', branch => {
    const document = fixture(), feature = operation(document.features), end = feature.secondDirection!.endCondition!;
    if (feature.type !== 'extrude') throw Error('Fixture');
    if (end.kind !== 'untilNext') throw Error('Fixture');
    if (branch === 'missing') delete end.baseBody;
    else if (branch === 'mismatched') end.baseBody = { ...owner, sourceFeatureId: 'other' };
    else feature.bodyOperation = { mode: 'merge', target: owner };
    expect(() => validateDocument(document)).toThrow(branch === 'mismatched'
      ? 'Documento.features[4].secondDirection.endCondition.baseBody.sourceFeatureId'
      : 'Documento.features[4].secondDirection.endCondition.baseBody');
  });
});
