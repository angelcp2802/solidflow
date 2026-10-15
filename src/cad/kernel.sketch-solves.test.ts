import { describe, expect, it, vi } from 'vitest';
import type { Feature, ReferencePlaneFeature, SketchFeature } from './kernel.types';
import { offsetPlaneFrame, principalPlaneFrame } from './kernel.frames';
import { sketchVisual } from './kernel.sketch-visual';
import * as profiles from './kernel.profiles';
import { SKETCH_SOLVER_TOLERANCE } from '../sketch/solver';
import {
  createSourceSketchSolveRegistry, resolveSourceSketchSupport, checkpointSourceSketchSolves, assertSourceSketchSolvesCurrent,
  type SourceSketchSolveHandle, type SourceSketchSupportContext,
} from './kernel.sketch-solves';

// Original coordinates. Radius 2 and fixed centre (3,0) are independent solver
// oracles; the driven nominal 999 must be replaced by a fresh measurement 2.
function circle(): SketchFeature {
  return { id: 'source-sketch', name: 'Original solved circle', type: 'sketch', suppressed: false,
    plane: 'XY', offset: 0, profile: { kind: 'entities', points: [{ id: 'c', x: 3, y: 0 }],
      entities: [{ id: 'circle', type: 'circle', center: 'c', radius: 1, construction: false }],
      constraints: [{ id: 'fix-centre', type: 'fix', pointId: 'c', x: 3, y: 0 },
        { id: 'driving-radius', type: 'radius', entityId: 'circle', value: 2 },
        { id: 'measured-radius', type: 'radius', entityId: 'circle', value: 999, driven: true }] } };
}
function context() {
  return { planeFeatureIds: new Set<string>(), solidFeatureIds: new Set<string>(), unavailableFeatureIds: new Set<string>(),
    planes: new Map<string, { frame: ReturnType<typeof principalPlaneFrame>; lineage: string }>(),
    historicalFaces: new Map() } satisfies SourceSketchSupportContext;
}
function staged(features: Feature[], support = context()) {
  const registry = createSourceSketchSolveRegistry(features, support);
  features.forEach((feature, index) => registry.observeFeature(feature, index));
  const sketches = new Map<string, SketchFeature>();
  const frames = new Map<string, ReturnType<typeof principalPlaneFrame>>();
  const visuals: ReturnType<typeof sketchVisual>[] = [];
  const stage = (feature: SketchFeature, frame: ReturnType<typeof principalPlaneFrame>, _lineage: string | null,
    visual: ReturnType<typeof sketchVisual>) => {
    sketches.set(feature.id, feature); frames.set(feature.id, frame); visuals.push(visual);
  };
  return { registry, sketches, frames, visuals, stage };
}
function publish(state: ReturnType<typeof staged>, feature: SketchFeature, index: number): SourceSketchSolveHandle {
  const result = state.registry.solveAndStage(feature, index, state.stage);
  if (result.kind !== 'staged' || !result.handle) throw new Error('Original JSON fixture must publish a real solve handle.');
  return result.handle;
}

describe('real source sketch solve records', () => {
  it('solves once, stages the actual visual/maps and retains full status and driven measurements', () => {
    const feature = circle(), input = structuredClone(feature), state = staged([feature]);
    const realSolve = vi.spyOn(profiles, 'solveEntityProfileResult');
    try {
      const handle = publish(state, feature, 0);
      expect(realSolve).toHaveBeenCalledTimes(1);
      const view = state.registry.read(handle, [feature]);
      expect(view.result.status, view.result.message).toBe('fullyDefined');
      expect(view.result.degreesOfFreedom).toBe(0);
      expect(view.result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
      expect(view.result.conflictingConstraintIds).toEqual([]);
      expect(view.result.drivenValues['measured-radius']).toBeCloseTo(2, 7);
      expect(view.result.iterations).toBeGreaterThanOrEqual(0);
      // Radius is in mm; 1e-7 mm is an independent absolute fixture bound.
      const solvedCircle = view.result.profile.entities[0];
      expect(solvedCircle).toMatchObject({ id: 'circle', type: 'circle' });
      if (solvedCircle.type !== 'circle') throw new Error('Original fixture must solve a circle.');
      expect(Math.abs(solvedCircle.radius - 2)).toBeLessThanOrEqual(1e-7);
      expect(view.resolved.profile).toEqual(view.result.profile);
      expect(state.sketches.get(feature.id)?.profile).toEqual(view.result.profile);
      expect(state.frames.get(feature.id)).toEqual({ origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] });
      expect(state.visuals[0].lines.length).toBeGreaterThan(6);
      expect(feature).toEqual(input);
    } finally { realSolve.mockRestore(); state.registry.revoke(); }
  });

  it('retains underdefined geometry and its actual two free translations without claiming uniqueness', () => {
    const feature = circle();
    if (feature.profile.kind !== 'entities') throw new Error('Original fixture kind changed.');
    feature.profile.constraints = feature.profile.constraints.filter(item => item.id !== 'fix-centre');
    const state = staged([feature]);
    try {
      const view = state.registry.read(publish(state, feature, 0), [feature]);
      expect(view.result.status, view.result.message).toBe('underdefined');
      expect(view.result.degreesOfFreedom).toBe(2);
      expect(view.result.profile.points).toEqual([{ id: 'c', x: 3, y: 0 }]);
      expect(view.result.drivenValues['measured-radius']).toBeCloseTo(2, 7);
    } finally { state.registry.revoke(); }
  });

  it('preserves a real failed solve result but publishes no fallback geometry or success record', () => {
    const feature = circle();
    if (feature.profile.kind !== 'entities') throw new Error('Original fixture kind changed.');
    feature.profile.constraints.push({ id: 'conflicting-centre', type: 'fix', pointId: 'c', x: 4, y: 0 });
    const result = profiles.solveEntityProfileResult(feature.profile);
    expect(['underdefined', 'fullyDefined']).not.toContain(result.status);
    expect(result.degreesOfFreedom).toBeNull();
    expect(result.conflictingConstraintIds.length).toBeGreaterThan(0);
    expect(result.drivenValues['measured-radius']).toBeNull();
    const inputProfile = feature.profile;
    expect(() => profiles.solveEntityProfile(inputProfile))
      .toThrow('No se puede resolver el croquis');
    const state = staged([feature]), stage = vi.fn(state.stage);
    try {
      expect(() => state.registry.solveAndStage(feature, 0, stage)).toThrow('No se puede resolver el croquis');
      expect(stage).not.toHaveBeenCalled();
      expect(state.registry.handleFor(feature.id)).toBeUndefined();
      expect(() => state.registry.checkpoint([feature], [feature.id])).toThrow('No published real source sketch solve');
    } finally { state.registry.revoke(); }
  });

  it('does not accept suppression or a raw sketches Map entry as a solved source', () => {
    const feature = circle(); feature.suppressed = true;
    const state = staged([feature]); state.sketches.set(feature.id, feature);
    try {
      expect(() => state.registry.solveAndStage(feature, 0, state.stage)).toThrow('active entity sketch');
      expect(state.registry.handleFor(feature.id)).toBeUndefined();
    } finally { state.registry.revoke(); }
  });

  it('omits an unavailable associative plane before solving or staging', () => {
    const feature = circle(), support = context(); feature.support = { kind: 'plane', planeId: 'datum' };
    support.planeFeatureIds.add('datum'); support.unavailableFeatureIds.add('datum');
    const datum: ReferencePlaneFeature = { id: 'datum', type: 'plane', name: 'Datum', suppressed: true,
      support: { kind: 'principal', plane: 'XY' }, offset: 5, reversed: false };
    const state = staged([datum, feature], support), realSolve = vi.spyOn(profiles, 'solveEntityProfileResult');
    try {
      expect(state.registry.solveAndStage(feature, 1, state.stage)).toEqual({ kind: 'support-unavailable' });
      expect(realSolve).not.toHaveBeenCalled();
      expect(state.visuals).toEqual([]);
      expect(state.registry.handleFor(feature.id)).toBeUndefined();
    } finally { realSolve.mockRestore(); state.registry.revoke(); }
  });

  it('does not publish when the actual visual was built but a later map staging step fails', () => {
    const feature = circle(), state = staged([feature]), primary = new Error('Original map staging fault');
    try {
      expect(() => state.registry.solveAndStage(feature, 0, (resolved, _frame, _lineage, visual) => {
        state.visuals.push(visual);
        state.sketches.set(resolved.id, resolved);
        throw primary;
      })).toThrow(primary);
      expect(state.visuals).toHaveLength(1);
      expect(state.sketches.has(feature.id)).toBe(true);
      expect(state.registry.handleFor(feature.id)).toBeUndefined();
    } finally { state.registry.revoke(); }
  });

  it('isolates all returned result, definition and frame views from retained authority', () => {
    const feature = circle(), state = staged([feature]);
    try {
      const handle = publish(state, feature, 0);
      const copy = state.registry.read(handle, [feature]);
      copy.result.status = 'invalid'; copy.result.drivenValues['measured-radius'] = 999;
      copy.result.profile.points[0].x = 100; copy.input.name = 'Changed DTO'; copy.frame.origin[2] = 30;
      const actual = state.registry.read(handle, [feature]);
      expect(actual.result.status).toBe('fullyDefined');
      expect(actual.result.drivenValues['measured-radius']).toBeCloseTo(2, 7);
      expect(actual.result.profile.points[0].x).toBeCloseTo(3, 7);
      expect(actual.input.name).toBe('Original solved circle');
      expect(actual.frame.origin).toEqual([0, 0, 0]);
    } finally { state.registry.revoke(); }
  });

  it('rejects an edited source definition and an edited earlier historical prefix', () => {
    const earlier = circle(); earlier.id = 'earlier-sketch';
    const feature = circle(), original: Feature[] = [earlier, feature], state = staged(original);
    try {
      const handle = publish(state, feature, 1);
      const editedSource = structuredClone(original);
      (editedSource[1] as SketchFeature).offset = 1;
      expect(() => state.registry.read(handle, editedSource)).toThrow('historical definitions');
      const editedPrefix = structuredClone(original);
      (editedPrefix[0] as SketchFeature).offset = 2;
      expect(() => state.registry.read(handle, editedPrefix)).toThrow('historical definitions');
    } finally { state.registry.revoke(); }
  });

  it('keeps the source prefix distinct from later current target definitions', () => {
    const feature = circle(), later = circle(); later.id = 'later-target-sketch';
    const original: Feature[] = [feature, later], state = staged(original);
    try {
      const handle = publish(state, feature, 0);
      const current = structuredClone(original); (current[1] as SketchFeature).offset = 50;
      expect(state.registry.read(handle, current).frame.origin).toEqual([0, 0, 0]);
      const proof = state.registry.checkpoint(original, [feature.id]);
      expect(() => state.registry.assertCheckpoint(proof, current)).not.toThrow();
    } finally { state.registry.revoke(); }
  });

  it('rejects forged handles, cross-build handles and cross-build checkpoints with identical saved IDs', () => {
    const feature = circle(), first = staged([feature]), second = staged([structuredClone(feature)]);
    try {
      const handle = publish(first, feature, 0);
      const proof = first.registry.checkpoint([feature], [feature.id]);
      expect(() => first.registry.read({} as SourceSketchSolveHandle, [feature])).toThrow('not published by this build');
      expect(() => second.registry.read(handle, [feature])).toThrow('not published by this build');
      expect(() => second.registry.assertCheckpoint(proof, [feature])).toThrow('not from this build');
    } finally { first.registry.revoke(); second.registry.revoke(); }
  });

  it('rejects copied reader methods as authority before evaluation or staging can call them', () => {
    const feature = circle(), state = staged([feature]);
    try {
      state.registry.solveAndStage(feature, 0, state.stage);
      const reader = state.registry.reader;
      const proof = checkpointSourceSketchSolves(reader, [feature], [feature.id]);
      const copiedMethods = { ...reader };
      expect(() => checkpointSourceSketchSolves(copiedMethods, [feature], [feature.id])).toThrow('not issued');
      expect(() => assertSourceSketchSolvesCurrent(copiedMethods, proof, [feature])).toThrow('not issued');
      expect(() => assertSourceSketchSolvesCurrent(reader, proof, [feature])).not.toThrow();
    } finally { state.registry.revoke(); }
  });

  it('revokes every handle/checkpoint at build abort and cannot publish after callback revocation', () => {
    const feature = circle(), state = staged([feature]);
    const handle = publish(state, feature, 0);
    const proof = state.registry.checkpoint([feature], [feature.id]);
    state.registry.revoke();
    expect(() => state.registry.read(handle, [feature])).toThrow('revoked');
    expect(() => state.registry.assertCheckpoint(proof, [feature])).toThrow('revoked');
    const aborted = staged([feature]);
    expect(() => aborted.registry.solveAndStage(feature, 0, () => aborted.registry.revoke())).toThrow('revoked');
  });

  it('uses the real shared datum resolver and applies sketch offset once with non-null support lineage', () => {
    const support = context(), feature = circle();
    const datum: ReferencePlaneFeature = { id: 'datum', type: 'plane', name: 'XZ datum', suppressed: false,
      support: { kind: 'principal', plane: 'XZ' }, offset: 5, reversed: false };
    const principal = resolveSourceSketchSupport(support, datum.support)!;
    support.planeFeatureIds.add(datum.id);
    support.planes.set(datum.id, { frame: offsetPlaneFrame(principal.frame, datum.offset), lineage: principal.lineage });
    feature.support = { kind: 'plane', planeId: datum.id }; feature.offset = 3;
    const original: Feature[] = [datum, feature], state = staged(original, support);
    try {
      const handle = publish(state, feature, 1);
      const view = state.registry.read(handle, original);
      expect(view.frame).toEqual({ origin: [0, -8, 0], xDirection: [1, 0, 0], normal: [0, -1, 0] });
      expect(view.supportLineage).toBe(principal.lineage);
      expect(view.supportLineage).not.toBeNull();
      support.planes.get(datum.id)!.frame.origin[1] = -6;
      expect(() => state.registry.read(handle, original)).toThrow('support or result');
    } finally { state.registry.revoke(); }
  });

  it('rejects a source edit made while its real visual and map entries are staged', () => {
    const feature = circle(), state = staged([feature]);
    try {
      expect(() => state.registry.solveAndStage(feature, 0, (resolved, frame, lineage, visual) => {
        state.stage(resolved, frame, lineage, visual);
        feature.offset = 10;
      })).toThrow('historical definitions');
      expect(state.visuals).toHaveLength(1);
      expect(state.registry.handleFor(feature.id)).toBeUndefined();
    } finally { state.registry.revoke(); }
  });

  it('withdraws a published support when the earlier datum becomes unavailable despite retained map entries', () => {
    const support = context(), feature = circle();
    const datum: ReferencePlaneFeature = { id: 'datum', type: 'plane', name: 'Datum', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 5, reversed: false };
    const principal = resolveSourceSketchSupport(support, datum.support)!;
    support.planeFeatureIds.add(datum.id);
    support.planes.set(datum.id, { frame: offsetPlaneFrame(principal.frame, 5), lineage: principal.lineage });
    feature.support = { kind: 'plane', planeId: datum.id };
    const original: Feature[] = [datum, feature], state = staged(original, support);
    try {
      const handle = publish(state, feature, 1);
      const proof = state.registry.checkpoint(original, [feature.id]);
      support.unavailableFeatureIds.add(datum.id);
      expect(state.sketches.has(feature.id)).toBe(true);
      expect(() => state.registry.read(handle, original)).toThrow('support or result');
      expect(() => state.registry.assertCheckpoint(proof, original)).toThrow('support or result');
    } finally { state.registry.revoke(); }
  });
});
