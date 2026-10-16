import { expect, it, vi } from 'vitest';
import type { Feature, SketchFeature } from './kernel.types';
import * as profiles from './kernel.profiles';
import { createSourceSketchSolveRegistry, readCheckpointSourceSketchSolve,
  type SourceSketchSolveCheckpoint, type SourceSketchSolveRegistry, type SourceSketchSupportContext } from './kernel.sketch-solves';

// Original source-only fixtures. The circle must actually solve r1 -> r2;
// nominal driven999 is metadata, never a measured radius or native capability.
function sketch(id = 'circle'): SketchFeature {
  return { id, name: 'Original checkpoint circle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'entities', points: [{ id: 'c', x: 3, y: 0 }],
      entities: [{ id: 'edge', type: 'circle', center: 'c', radius: 1, construction: false }],
      constraints: [{ id: 'center', type: 'fix', pointId: 'c', x: 3, y: 0 },
        { id: 'radius', type: 'radius', entityId: 'edge', value: 2 },
        { id: 'measurement', type: 'radius', entityId: 'edge', value: 999, driven: true }] } };
}
function session(features: Feature[]) {
  const context: SourceSketchSupportContext = { planeFeatureIds: new Set(), solidFeatureIds: new Set(), unavailableFeatureIds: new Set(),
    planes: new Map(), historicalFaces: new Map() };
  const actual = createSourceSketchSolveRegistry(features, context);
  features.forEach((feature, index) => actual.observeFeature(feature, index));
  return actual;
}
function publish(actual: ReturnType<typeof session>, feature: SketchFeature, index: number): void {
  const result = actual.solveAndStage(feature, index, () => {});
  expect(result.kind).toBe('staged'); if (result.kind !== 'staged') throw new Error('Original fixture did not stage.'); expect(result.handle).not.toBeNull();
}

it('reads only the authentic solved profile/full result covered by its issued checkpoint', () => {
  const feature = sketch(), features = [feature], actual = session(features), solve = vi.spyOn(profiles, 'solveEntityProfileResult');
  try {
    publish(actual, feature, 0); const proof = actual.reader.checkpoint(features, [feature.id]);
    const view = readCheckpointSourceSketchSolve(actual.reader, proof, features, feature.id);
    expect(solve).toHaveBeenCalledTimes(1); expect(view.result.status).toBe('fullyDefined'); expect(view.result.degreesOfFreedom).toBe(0);
    const measured = view.result.drivenValues.measurement;
    if (typeof measured !== 'number') throw new Error('Original circle must have a real driven radius measurement.');
    expect(Math.abs(measured - 2)).toBeLessThanOrEqual(1e-7);
    const edge = view.result.profile.entities[0]; if (edge.type !== 'circle') throw new Error('Original circle missing.');
    expect(Math.abs(edge.radius - 2)).toBeLessThanOrEqual(1e-7); edge.radius = 42;
    const fresh = readCheckpointSourceSketchSolve(actual.reader, proof, features, feature.id).result.profile.entities[0];
    if (fresh.type !== 'circle') throw new Error('Original circle missing.'); expect(Math.abs(fresh.radius - 2)).toBeLessThanOrEqual(1e-7);
    expect(solve).toHaveBeenCalledTimes(1);
  } finally { solve.mockRestore(); actual.revoke(); }
});
it('rejects a cloned reader, forged checkpoint and checkpoint from another real build', () => {
  const feature = sketch(), features = [feature], first = session(features), second = session(features);
  try {
    publish(first, feature, 0); publish(second, feature, 0);
    const checkpoint = first.reader.checkpoint(features, [feature.id]);
    expect(() => readCheckpointSourceSketchSolve({ ...first.reader }, checkpoint, features, feature.id)).toThrow('not issued');
    expect(() => readCheckpointSourceSketchSolve(first.reader, {} as SourceSketchSolveCheckpoint, features, feature.id)).toThrow('not from this build');
    expect(() => readCheckpointSourceSketchSolve(second.reader, checkpoint, features, feature.id)).toThrow('not from this build');
  } finally { first.revoke(); second.revoke(); }
});
it('rejects a genuine source handle omitted from this checkpoint', () => {
  const a = sketch('a'), b = sketch('b'), features = [a, b], actual = session(features);
  try {
    publish(actual, a, 0); publish(actual, b, 1); const checkpoint = actual.reader.checkpoint(features, ['a']);
    expect(() => readCheckpointSourceSketchSolve(actual.reader, checkpoint, features, 'b')).toThrow('not included');
  } finally { actual.revoke(); }
});
it('rejects an upstream edit or revoked epoch instead of re-solving a stale source silently', () => {
  const feature = sketch(), features = [feature], actual = session(features);
  try {
    publish(actual, feature, 0); const checkpoint = actual.reader.checkpoint(features, [feature.id]);
    const edited = structuredClone(features); if (edited[0].profile.kind !== 'entities') throw new Error('Original source missing.');
    const constraint = edited[0].profile.constraints.find(item => item.id === 'radius');
    if (!constraint || constraint.type !== 'radius') throw new Error('Original radius missing.'); constraint.value = 3;
    expect(() => readCheckpointSourceSketchSolve(actual.reader, checkpoint, edited, feature.id)).toThrow('changed');
    actual.revoke(); expect(() => readCheckpointSourceSketchSolve(actual.reader, checkpoint, features, feature.id)).toThrow('revoked');
  } finally { actual.revoke(); }
});
it('publishes no source/checkpoint authority when the real solver fails', () => {
  const feature = sketch(); if (feature.profile.kind !== 'entities') throw new Error('Original source missing.');
  feature.profile.constraints.push({ id: 'conflict', type: 'radius', entityId: 'edge', value: 3 });
  const features = [feature], actual = session(features), solve = vi.spyOn(profiles, 'solveEntityProfileResult');
  try {
    expect(() => actual.solveAndStage(feature, 0, () => {})).toThrow('resolver');
    expect(solve).toHaveBeenCalledTimes(1); expect(actual.handleFor(feature.id)).toBeUndefined();
    expect(() => actual.reader.checkpoint(features, [feature.id])).toThrow('No published');
    expect(() => readCheckpointSourceSketchSolve({} as SourceSketchSolveRegistry, {} as SourceSketchSolveCheckpoint, features, feature.id)).toThrow('not issued');
  } finally { solve.mockRestore(); actual.revoke(); }
});
