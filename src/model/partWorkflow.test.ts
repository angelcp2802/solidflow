import { describe, expect, it } from 'vitest';
import type { PickableBody, SketchFeature } from '../cad/kernel.types';
import { initialPartTargets } from './partWorkflow';

// Original synthetic catalog records: these tests exercise draft choice, not geometry.
const sketch = (): SketchFeature => ({ id: 'profile', name: 'Profile', type: 'sketch', plane: 'XY',
  offset: 0, suppressed: false, profile: { kind: 'rectangle', width: 10, height: 6, center: [0, 0] } });
function body(id: string, source: string): PickableBody {
  return { ref: { bodyId: id, sourceFeatureId: source }, createdByFeatureId: 'base', name: id,
    vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], volume: 240,
    bounds: { min: [0, 0, 0], max: [10, 6, 4] },
    faces: [{ ref: { sourceFeatureId: source, key: `face-v2|${id}` }, frame: null, vertices: [], triangles: [] }] };
}
describe('sequential part draft targets', () => {
  it('follows the sole current body through many accepted operations without retaining an old source', () => {
    for (let step = 1; step <= 12; step++) {
      const current = body('part', `operation-${step}`);
      const target = initialPartTargets([current], [], sketch());
      expect(target).toEqual([current.ref]);
      expect(target[0]).not.toBe(current.ref);
      expect(initialPartTargets([current], [{ bodyId: 'part', sourceFeatureId: `operation-${step - 1}` }], sketch())).toEqual([]);
    }
  });
  it('selects only the current owner of the sketch support in a multibody part', () => {
    const a = body('a', 'cut-a'), b = body('b', 'boss-b');
    const profile = { ...sketch(), support: { kind: 'face' as const, face: b.faces[0].ref } };
    const before = structuredClone([a, b, profile]);
    expect(initialPartTargets([a, b], [], profile)).toEqual([b.ref]);
    expect(initialPartTargets([a, b], [a.ref], profile)).toEqual([a.ref]);
    expect([a, b, profile]).toEqual(before);
  });
  it('leaves absent, stale and ambiguous support or body choices explicit', () => {
    const a = body('a', 'base'), b = body('b', 'base');
    expect(initialPartTargets([], [], sketch())).toEqual([]);
    expect(initialPartTargets([a, b], [], sketch())).toEqual([]);
    expect(initialPartTargets([a, a], [], sketch())).toEqual([]);
    expect(initialPartTargets([a], [a.ref, a.ref], sketch())).toEqual([]);
    const profile = { ...sketch(), support: { kind: 'face' as const, face: b.faces[0].ref } };
    expect(initialPartTargets([a], [], profile)).toEqual([]);
    a.faces = b.faces;
    expect(initialPartTargets([a, b], [], profile)).toEqual([]);
  });
  it('retains explicit multiple cut targets in their authored order', () => {
    const a = body('a', 'cut'), b = body('b', 'cut');
    expect(initialPartTargets([a, b], [b.ref, a.ref], sketch())).toEqual([b.ref, a.ref]);
  });
});
