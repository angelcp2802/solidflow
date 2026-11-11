import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { withFeaturePatternSketchDimension } from '../model/featurePatternCommands';
import { createStepSource } from '../model/stepSource';
import type { EntityProfile } from '../sketch/types';
import type { BodyReference, LinearPatternFeature, RepetitionFeature, SketchFeature, Vec3 } from './kernel.types';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import { importStepSolid } from './kernel.step';

const require = createRequire(import.meta.url);
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);
const original = (operation: 'cut' | 'extrude' = 'cut') =>
  validateDocument(require('../../scripts/desktop-part-instance-rectangle-original.cjs')(operation));
const owner: BodyReference = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const output: BodyReference = { bodyId: owner.bodyId, sourceFeatureId: 'rectangle-pattern' };
const width = 'driving-width', height = 'driving-height';

function pattern(spacing = 5): LinearPatternFeature {
  return { id: output.sourceFeatureId, name: 'Original solved rectangular pockets', type: 'linearPattern', suppressed: false, baseFeatureId: 'pocket',
    source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
    first: { direction: [1, 0, 0], count: 3, spacing }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }],
      referencePolicies: [], variation: { kind: 'none' } } };
}
function varied(document: Document, swap: boolean, spacing = 5): LinearPatternFeature {
  let feature: LinearPatternFeature = pattern(spacing);
  const sizes = swap ? [[3, 1], [1, 3]] : [[1, 3], [3, 1]];
  sizes.forEach(([w, h], index) => {
    const address = (index + 1) + ',0';
    feature = withFeaturePatternSketchDimension(feature, document.features, address, width, w) as LinearPatternFeature;
    feature = withFeaturePatternSketchDimension(feature, document.features, address, height, h) as LinearPatternFeature;
  });
  return feature;
}
async function usingEngine(run: (engine: CadEngine) => void | Promise<void>) {
  const engine = new CadEngine(); let failure: unknown;
  try { await run(engine); } catch (error) { failure = error; }
  try { engine.dispose(); } catch (cleanup) { throw new AggregateError(failure ? [failure, cleanup] : [cleanup], 'Rectangle fixture or cleanup failed.'); }
  if (failure) throw failure;
}
function shape(engine: CadEngine, reference: BodyReference): Shape3D {
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!catalog) throw Error('Real body catalog required');
  return catalog.resolve(reference).shape;
}
function build(engine: CadEngine, document: Document): Shape3D {
  const before = serializeDocument(document), result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.bodies?.map(body => body.ref)).toEqual([output]);
  expect(result.bodies?.[0].createdByFeatureId).toBe('plate');
  expect(serializeDocument(document)).toBe(before);
  return shape(engine, output);
}
function near(actual: number, expected: number, tolerance = 1e-5) { expect(Math.abs(actual - expected)).toBeLessThan(tolerance); }
function metrics(material: Shape3D, volume: number, area: number, bounds = [[0, 0, 0], [20, 8, 5]]) {
  validateBodyShape(material);
  withNativeOwners(owners => {
    expect(owners.ownAll(material.solids)).toHaveLength(1);
    near(owners.own(measureShapeVolumeProperties(material)).volume, volume);
    near(owners.own(measureShapeSurfaceProperties(material)).area, area);
    const actual = owners.own(material.boundingBox).bounds;
    bounds.forEach((side, i) => side.forEach((value, j) => near(actual[i][j], value, 1e-6)));
  });
}
function probe(material: Shape3D, center: Vec3, present: boolean) {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .05) as Vec3, center.map(value => value + .05) as Vec3));
    const common = owners.own(bodyBoolean('common', material, cube));
    near(owners.own(measureShapeVolumeProperties(common)).volume, present ? .001 : 0, 1e-8);
  });
}
function endFaces(material: Shape3D, z: number, expected: readonly { center: Vec3; area: number }[]) {
  withNativeOwners(owners => {
    const properties = owners.ownAll(material.faces).filter(face => face.geomType === 'PLANE')
      .map(face => owners.own(measureShapeSurfaceProperties(face)))
      .filter(face => Math.abs(face.centerOfMass[2] - z) < 1e-6);
    expect(properties).toHaveLength(expected.length);
    for (const floor of expected) {
      const actual = properties.filter(face => floor.center.every((value, axis) => Math.abs(value - face.centerOfMass[axis]) < 1e-6));
      expect(actual).toHaveLength(1);
      near(actual[0].area, floor.area);
    }
  });
}
function pockets(material: Shape3D, swap: boolean) {
  metrics(material, 790, 624);
  endFaces(material, 4, [{ center: [3, 4, 4], area: 4 },
    { center: swap ? [8.5, 3.5, 4] : [7.5, 4.5, 4], area: 3 },
    { center: swap ? [12.5, 4.5, 4] : [13.5, 3.5, 4], area: 3 }]);
  probe(material, [8.5, 3.5, 4.5], !swap);
  probe(material, [13.5, 3.5, 4.5], swap);
  probe(material, [7.5, 5.5, 4.5], swap);
  probe(material, [12.5, 5.5, 4.5], !swap);
}

it('solves both lengths on the original anchored pockets, distinguishing equal-metric swaps through history and STEP', () => usingEngine(async engine => {
  const before = original(), source = serializeDocument(before), history = new DocumentHistory(before);
  const saved = history.apply(addFeature(before, varied(before, false)));
  const reopened = parseDocument(serializeDocument(saved));
  // 20×8×5 plate less 2×2, 1×3 and 3×1 pockets of depth 1.
  // Removed V=10, net wall A=8+8+8; swapped copies have identical V/A.
  pockets(build(engine, reopened), false);
  const swapped = history.apply(updateFeature(saved, output.sourceFeatureId, varied(before, true)));
  pockets(build(engine, swapped), true);
  pockets(build(engine, history.undo()), false);
  pockets(build(engine, history.redo()), true);
  expect(serializeDocument(before)).toBe(source);
  const blob = engine.export('step', swapped.features);
  const step = createStepSource(new Uint8Array(await blob.arrayBuffer()));
  withNativeOwners(owners => pockets(owners.own(importStepSolid(step)), true));
}), 60_000);

it('merges different solved bosses into the exact original owner through history, reopening and STEP', () => usingEngine(async engine => {
  const before = original('extrude'), source = serializeDocument(before), history = new DocumentHistory(before);
  const saved = history.apply(addFeature(before, varied(before, false)));
  const reopened = parseDocument(serializeDocument(saved));
  function bosses(material: Shape3D, swap: boolean) {
    // The same 20×8×5 plate plus 2×2, 1×3 and 3×1 bosses that project
    // 1 mm above it. The embedded millimetre adds no external volume.
    metrics(material, 810, 624, [[0, 0, 0], [20, 8, 6]]);
    endFaces(material, 6, [{ center: [3, 4, 6], area: 4 },
      { center: swap ? [8.5, 3.5, 6] : [7.5, 4.5, 6], area: 3 },
      { center: swap ? [12.5, 4.5, 6] : [13.5, 3.5, 6], area: 3 }]);
    probe(material, [8.5, 3.5, 5.5], swap);
    probe(material, [13.5, 3.5, 5.5], !swap);
    probe(material, [7.5, 5.5, 5.5], !swap);
    probe(material, [12.5, 5.5, 5.5], swap);
  }
  bosses(build(engine, reopened), false);
  const swapped = history.apply(updateFeature(saved, output.sourceFeatureId, varied(before, true)));
  bosses(build(engine, swapped), true);
  bosses(build(engine, history.undo()), false);
  bosses(build(engine, history.redo()), true);
  expect(serializeDocument(before)).toBe(source);
  const blob = engine.export('step', swapped.features);
  const step = createStepSource(new Uint8Array(await blob.arrayBuffer()));
  withNativeOwners(owners => bosses(owners.own(importStepSolid(step)), true));
}), 60_000);

it('inherits the solved height and source orientation of the reversed, origin-snapped rectangle', () => usingEngine(engine => {
  const document = original(), plate = document.features[0] as SketchFeature;
  if (plate.profile.kind !== 'rectangle') throw Error('Original plate required');
  plate.profile.center = [8, 1];
  const profile = (document.features[2] as SketchFeature).profile as EntityProfile;
  profile.points = profile.points.filter(point => point.id !== 'p0')
    .map(point => ({ ...point, x: (point.x - 2) * .9, y: (point.y - 3) * 1.1 })).reverse();
  profile.entities.reverse();
  profile.constraints = profile.constraints.filter(constraint => constraint.type !== 'fix').reverse();
  for (const entity of profile.entities) {
    if (entity.type !== 'line') throw Error('Original rectangular edge required');
    [entity.start, entity.end] = [entity.end === 'p0' ? 'origin' : entity.end, entity.start === 'p0' ? 'origin' : entity.start];
  }
  const feature = withFeaturePatternSketchDimension(pattern(), document.features, '1,0', width, 1);
  const result = build(engine, addFeature(document, feature));
  // The source and unassigned copy solve 2×2; the partial override solves 1×2.
  metrics(result, 790, 622, [[-2, -3, 0], [18, 5, 5]]);
  endFaces(result, 4, [{ center: [1, 1, 4], area: 4 }, { center: [5.5, 1, 4], area: 2 }, { center: [11, 1, 4], area: 4 }]);
  probe(result, [5.5, 1.5, 4.5], false);
  probe(result, [4.5, 1.5, 4.5], true);
}), 60_000);

it.each(['mirror', 'circularPattern'] as const)('applies the solved rectangle in its actual %s frame', kind => usingEngine(engine => {
  const document = original(), plate = document.features[0] as SketchFeature;
  if (plate.profile.kind !== 'rectangle') throw Error('Original plate required');
  if (kind === 'mirror') plate.profile.center = [0, 4];
  const { first: _first, second: _second, secondSeedOnly: _only, skipped: _skipped, ...common } = pattern();
  const operation: RepetitionFeature = kind === 'mirror'
    ? { ...common, type: 'mirror', support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
    : { ...common, type: 'circularPattern', count: 2, axis: { origin: [10, 4, 0], direction: [0, 0, 1] },
      angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  const address = kind === 'mirror' ? 'mirror' : '1';
  const feature = withFeaturePatternSketchDimension(
    withFeaturePatternSketchDimension(operation, document.features, address, width, 1), document.features, address, height, 3);
  const result = build(engine, parseDocument(serializeDocument(addFeature(document, feature))));
  const mirror = kind === 'mirror';
  metrics(result, 793, 616, mirror ? [[-10, 0, 0], [10, 8, 5]] : [[0, 0, 0], [20, 8, 5]]);
  endFaces(result, 4, [{ center: [3, 4, 4], area: 4 }, { center: mirror ? [-2.5, 4.5, 4] : [17.5, 3.5, 4], area: 3 }]);
  probe(result, mirror ? [-2.5, 5.5, 4.5] : [17.5, 2.5, 4.5], false);
  probe(result, mirror ? [-3.5, 5.5, 4.5] : [16.5, 2.5, 4.5], true);
}), 60_000);

it('keeps the original body when a later solved instance misses the selected target', () => usingEngine(engine => {
  const before = original(), initial = engine.build(before.features);
  const rejected = engine.build(addFeature(before, varied(before, false, 10)).features);
  expect(initial.featureErrors).toEqual([]);
  expect(rejected.featureErrors.map(error => error.id)).toEqual([output.sourceFeatureId]);
  expect(rejected.featureErrors[0].message).toMatch(/changes no material/);
  expect(rejected.bodies).toEqual(initial.bodies);
  metrics(shape(engine, owner), 796, 608);
  endFaces(shape(engine, owner), 4, [{ center: [3, 4, 4], area: 4 }]);
}), 60_000);
