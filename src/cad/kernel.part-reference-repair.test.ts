import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { addFeature, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { CadEngine } from './kernel.engine';
import type { CadResult, FaceReference } from './kernel.types';

const require = createRequire(import.meta.url);
const original = () => validateDocument(require('../../scripts/desktop-part-reference-repair-original.cjs')());
const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);
afterEach(() => engine.dispose());
const build = (doc: Document) => engine.build(doc.features);
const near = (value: number, wanted: number, tolerance = 1e-5) => expect(Math.abs(value - wanted)).toBeLessThanOrEqual(tolerance);
function metrics(result: CadResult, volume: number, area: number, zMin: number, zMax: number) {
  near(result.volume, volume);
  let planarMeshArea = 0;
  for (let i = 0; i < result.triangles.length; i += 3) {
    const points = result.triangles.slice(i, i + 3).map(index => result.vertices.slice(3 * index, 3 * index + 3));
    const a = points[1].map((v, axis) => v - points[0][axis]), b = points[2].map((v, axis) => v - points[0][axis]);
    planarMeshArea += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
  }
  near(planarMeshArea, area);
  [-5, -3, zMin].forEach((v, i) => near(result.bounds.min[i], v, 1e-6));
  [5, 3, zMax].forEach((v, i) => near(result.bounds.max[i], v, 1e-6));
}
function endCap(result: CadResult, sign: number, z: number): FaceReference {
  const faces = result.faces?.filter(face => face.frame && Math.abs(face.frame.normal[2] - sign) < 1e-7 && Math.abs(face.frame.origin[2] - z) < 1e-6) ?? [];
  expect(faces).toHaveLength(1); expect(faces[0].ref.sourceFeatureId).toBe('reference-base');
  expect(faces[0].ref.key).toMatch(/^face-v1\|[a-f0-9]{64}$/); return structuredClone(faces[0].ref);
}
it('preserves the actual explicit-body v1 end cap across scalar depth edits and requires explicit support replacement across a signed branch', () => {
  const bare = original(), initial = build(bare);
  const face = endCap(initial, 1, 4);
  metrics(initial, 240, 248, 0, 4);
  let supported = addFeature(bare, { id: 'attached-profile', name: 'Original supported square', type: 'sketch', plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 2 }, support: { kind: 'face', face }, suppressed: false });
  supported = addFeature(supported, { id: 'attached-boss', name: 'Original supported boss', type: 'extrude', sketchId: 'attached-profile', depth: 2, symmetric: false,
    bodyOperation: { mode: 'merge', target: { bodyId: 'reference-body', sourceFeatureId: 'reference-base' } }, suppressed: false });
  const accepted = build(supported); expect(accepted.featureErrors).toEqual([]); metrics(accepted, 248, 264, 0, 6);
  const deeper = updateFeature(supported, 'reference-base', { depth: 6 }), deeperResult = build(deeper);
  expect(deeperResult.featureErrors).toEqual([]); metrics(deeperResult, 368, 328, 0, 8);
  const moved = deeperResult.sketches?.find(s => s.id === 'attached-profile');
  expect(moved?.frame?.normal).toEqual([0, 0, 1]); near(moved!.frame!.origin[2], 6, 1e-6);
  expect(deeper.features[2]).toEqual(supported.features[2]);
  const deeperBare = updateFeature(bare, 'reference-base', { depth: 6 });
  expect(endCap(build(deeperBare), 1, 6)).toEqual(face);
  const inverted = updateFeature(deeper, 'reference-base', { depth: -6 }), before = serializeDocument(inverted), failed = build(inverted);
  expect(failed.featureErrors.map(e => e.id)).toContain('attached-profile');
  expect(failed.featureErrors.find(e => e.id === 'attached-profile')?.message).toMatch(/cara|referencia|versión/i);
  metrics(failed, 360, 312, -6, 0); expect(failed.sketches?.some(s => s.id === 'attached-profile')).toBe(false);
  expect(() => engine.export('step')).toThrow(/errores/);
  const replacement = endCap(failed, -1, -6); expect(replacement).not.toEqual(face);
  const repaired = parseDocument(serializeDocument(updateFeature(inverted, 'attached-profile', { support: { kind: 'face', face: replacement } })));
  const restored = build(repaired); expect(restored.featureErrors).toEqual([]); metrics(restored, 368, 328, -8, 0);
  const restoredNormal = restored.sketches?.find(s => s.id === 'attached-profile')?.frame?.normal;
  expect(restoredNormal).toBeDefined(); restoredNormal!.forEach((v, i) => near(v, [0, 0, -1][i], 1e-9));
  expect(serializeDocument(inverted)).toBe(before); expect(repaired.features[3]).toEqual(supported.features[3]);
  const suppressed = updateFeature(repaired, 'reference-base', { suppressed: true }), omitted = build(suppressed);
  expect(omitted.featureErrors.map(e => e.id)).toEqual(['attached-boss']);
  expect(omitted.featureErrors[0].message).toMatch(/croquis.*suprimido.*soporte no está disponible/i);
  expect(omitted.warnings.some(w => /soporte está suprimido/.test(w))).toBe(true);
  expect(omitted.volume).toBe(0); expect(omitted.triangles).toEqual([]);
  expect(suppressed.features.slice(2)).toEqual(repaired.features.slice(2));
  const reactivated = build(updateFeature(suppressed, 'reference-base', { suppressed: false }));
  expect(reactivated.featureErrors).toEqual([]); metrics(reactivated, 368, 328, -8, 0);
});
