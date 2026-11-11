import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { withFeaturePatternInstanceDepth } from '../model/featurePatternCommands';
import { createStepSource } from '../model/stepSource';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import { importStepSolid } from './kernel.step';
import type { BodyReference, LinearPatternFeature, RepetitionFeature, Vec3 } from './kernel.types';

const require = createRequire(import.meta.url);
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);
const original = () => validateDocument(require('../../scripts/desktop-part-instance-depth-original.cjs')());
const seed: BodyReference = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const output: BodyReference = { bodyId: seed.bodyId, sourceFeatureId: 'depth-pattern' };
function common(owner: BodyReference) {
  return { id: output.sourceFeatureId, name: 'Original depth variation', suppressed: false, baseFeatureId: owner.sourceFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: [owner.sourceFeatureId] },
    featurePattern: { mode: 'regenerate' as const, scope: 'selected' as const, targets: [owner],
      bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }], referencePolicies: [], variation: { kind: 'none' as const } } };
}
function linear(): LinearPatternFeature {
  return { ...common(seed), type: 'linearPattern', first: { direction: [1, 0, 0], count: 4, spacing: 5 },
    second: null, secondSeedOnly: false, skipped: [] };
}
function linearDepths(first: number, second: number): RepetitionFeature {
  return withFeaturePatternInstanceDepth(withFeaturePatternInstanceDepth(linear(), '1,0', first), '2,0', second);
}
async function fixture(run: (engine: CadEngine) => void | Promise<void>): Promise<void> {
  const engine = new CadEngine();
  let failure: unknown;
  try { await run(engine); } catch (error) { failure = error; }
  try { engine.dispose(); } catch (cleanup) {
    throw new AggregateError(failure ? [failure, cleanup] : [cleanup], 'Instance-depth fixture or cleanup failed.');
  }
  if (failure) throw failure;
}
function actualShape(engine: CadEngine, ref: BodyReference): Shape3D {
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!catalog) throw Error('Expected the real native body catalog');
  return catalog.resolve(ref).shape;
}
function healthy(engine: CadEngine, document: Document, reference = output) {
  const bytes = serializeDocument(document);
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.bodies?.map(body => body.ref)).toEqual([reference]);
  expect(result.bodies?.[0].createdByFeatureId).toBe('plate');
  expect(serializeDocument(document)).toBe(bytes);
  return actualShape(engine, reference);
}
function near(actual: number, expected: number, tolerance = 1e-6): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}
function metrics(shape: Shape3D, volume: number, area: number, box: [Vec3, Vec3]): void {
  validateBodyShape(shape);
  withNativeOwners(owners => {
    expect(owners.ownAll(shape.solids)).toHaveLength(1);
    near(owners.own(measureShapeVolumeProperties(shape)).volume, volume, 1e-5);
    near(owners.own(measureShapeSurfaceProperties(shape)).area, area, 1e-5);
    owners.own(shape.boundingBox).bounds.forEach((side, i) => side.forEach((coordinate, j) => near(coordinate, box[i][j])));
  });
}
function horizontalFaces(shape: Shape3D, centres: Vec3[], area: number): void {
  withNativeOwners(owners => {
    const planes = owners.ownAll(shape.faces).filter(face => face.geomType === 'PLANE');
    for (const wanted of centres) {
      const matches = planes.filter(face => withNativeOwners(local => {
        const measured = local.own(measureShapeSurfaceProperties(face));
        return measured.centerOfMass.every((coordinate, i) => Math.abs(coordinate - wanted[i]) < 1e-6)
          && Math.abs(measured.area - area) < 1e-5;
      }));
      expect(matches, `Physical planar face centred at ${wanted.join(',')}`).toHaveLength(1);
      const normal = owners.own(matches[0].normalAt(wanted)).toTuple();
      normal.forEach((coordinate, i) => near(coordinate, [0, 0, 1][i], 1e-8));
    }
  });
}

it('rebuilds addressed pockets, distinguishes equal-volume edits, and reimports STEP with literal floor positions', () => fixture(async engine => {
  const before = original(), pattern = linearDepths(-2, -3);
  const saved = addFeature(before, pattern), history = new DocumentHistory(saved);
  const box: [Vec3, Vec3] = [[0, 0, 0], [20, 8, 5]];
  const floors: Vec3[] = [[3, 4, 4], [8, 4, 3], [13, 4, 2], [18, 4, 4]];
  const swappedFloors: Vec3[] = [[3, 4, 4], [8, 4, 2], [13, 4, 3], [18, 4, 4]];
  const reopened = parseDocument(serializeDocument(saved));
  expect(reopened.features).toEqual([...before.features, pattern]);
  const shape = healthy(engine, reopened);
  metrics(shape, 772, 656, box);
  horizontalFaces(shape, floors, 4);
  const changed = history.apply(updateFeature(saved, pattern.id, linearDepths(-3, -2)));
  const edited = healthy(engine, changed);
  metrics(edited, 772, 656, box);
  horizontalFaces(edited, swappedFloors, 4);
  horizontalFaces(healthy(engine, history.undo()), floors, 4);
  horizontalFaces(healthy(engine, history.redo()), swappedFloors, 4);
  const blob = engine.export('step', changed.features);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  withNativeOwners(owners => {
    const imported = owners.own(importStepSolid(createStepSource(bytes)));
    metrics(imported, 772, 656, box);
    horizontalFaces(imported, swappedFloors, 4);
  });
}), 60_000);

it('uses the physical downward ray after reflection and preserves the original seed depth', () => fixture(engine => {
  const before = original();
  const profile = before.features[0];
  if (profile.type !== 'sketch' || profile.profile.kind !== 'rectangle') throw Error('Original rectangle required');
  profile.profile.center = [0, 4];
  const mirror: RepetitionFeature = { ...common(seed), type: 'mirror', support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
  const saved = addFeature(before, withFeaturePatternInstanceDepth(mirror, 'mirror', -3));
  const shape = healthy(engine, saved);
  metrics(shape, 784, 632, [[-10, 0, 0], [10, 8, 5]]);
  horizontalFaces(shape, [[3, 4, 4], [-3, 4, 2]], 4);
}), 60_000);

it('applies a positive depth to a circular instance of a merge, with unchanged seed cap', () => fixture(engine => {
  const before = original(), [profile, base, cap] = before.features;
  if (profile.type !== 'sketch' || base.type !== 'extrude' || cap.type !== 'sketch') throw Error('Original prefix required');
  profile.profile = { kind: 'rectangle', center: [0, 0], width: 8, height: 8 };
  base.depth = 2;
  cap.offset = 2;
  cap.profile = { kind: 'circle', center: [2.5, 0], radius: 1 };
  const seedCap = { bodyId: 'plate-body', sourceFeatureId: 'cap' };
  before.features[3] = { type: 'extrude', id: 'cap', name: 'Original merged cap', suppressed: false, sketchId: cap.id,
    depth: 1, symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'plate-body', sourceFeatureId: 'plate' } } };
  const circular: RepetitionFeature = { ...common(seedCap), type: 'circularPattern', axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
    count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  const saved = addFeature(before, withFeaturePatternInstanceDepth(circular, '1', 2));
  const shape = healthy(engine, saved);
  metrics(shape, 128 + 3 * Math.PI, 192 + 6 * Math.PI, [[-4, -4, 0], [4, 4, 4]]);
  horizontalFaces(shape, [[2.5, 0, 3], [-2.5, 0, 4]], Math.PI);
}), 60_000);

it('retains the exact prior material when a late varied pattern address misses the owner', () => fixture(engine => {
  const before = original();
  const initial = engine.build(before.features);
  const operation = linearDepths(-2, -3);
  if (operation.type !== 'linearPattern') throw Error('Original linear pattern required');
  operation.first.spacing = 8;
  const saved = addFeature(before, operation);
  const rejected = engine.build(saved.features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual([operation.id]);
  expect(rejected.featureErrors[0].message).toMatch(/instance 3,0 changes no material/);
  expect(rejected.bodies).toEqual(initial.bodies);
  const retained = actualShape(engine, seed);
  metrics(retained, 796, 608, [[0, 0, 0], [20, 8, 5]]);
  horizontalFaces(retained, [[3, 4, 4]], 4);
  expect(() => engine.export('step')).toThrow();
}), 60_000);

it('keeps explicit depths while the original seed changes and rebuilds the unassigned copy', () => fixture(engine => {
  const before = original(), operation = linearDepths(-2, -3);
  const saved = addFeature(before, operation), table = structuredClone(operation.featurePattern);
  const changed = updateFeature(saved, 'pocket', { depth: -.5 });
  const shape = healthy(engine, parseDocument(serializeDocument(changed)));
  metrics(shape, 776, 648, [[0, 0, 0], [20, 8, 5]]);
  horizontalFaces(shape, [[3, 4, 4.5], [8, 4, 3], [13, 4, 2], [18, 4, 4.5]], 4);
  expect((changed.features.at(-1) as RepetitionFeature).featurePattern).toEqual(table);
  const reversed = updateFeature(updateFeature(changed, 'pocket-profile', { offset: 0 }), 'pocket', { depth: .5 });
  const result = engine.build(reversed.features);
  expect(result.featureErrors.map(error => error.id)).toContain(operation.id);
}), 60_000);
