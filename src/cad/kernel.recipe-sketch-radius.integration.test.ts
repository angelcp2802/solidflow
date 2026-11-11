import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { withFeaturePatternSketchRadius } from '../model/featurePatternCommands';
import { createStepSource } from '../model/stepSource';
import type { BodyReference, LinearPatternFeature, RepetitionFeature, SketchFeature, Vec3 } from './kernel.types';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import { importStepSolid } from './kernel.step';
import * as profiles from './kernel.profiles';
import * as bridge from './kernel.recipe-instance';
import * as bodies from './kernel.bodies';
import { createSourceSketchSolveRegistry, type SourceSketchSupportContext } from './kernel.sketch-solves';
import { evaluateFeatureRecipes } from './kernel.feature-recipes';
import { exactStateKey, type RegenerationRequest } from '../model/featureRecipes';
import { patternPlan } from './kernel.patterns';

const require = createRequire(import.meta.url);
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);
const original = () => validateDocument(require('../../scripts/desktop-part-instance-radius-original.cjs')());
const owner: BodyReference = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const output: BodyReference = { bodyId: owner.bodyId, sourceFeatureId: 'radius-pattern' };
function pattern(): LinearPatternFeature {
  return { id: output.sourceFeatureId, name: 'Original solved radius copies', type: 'linearPattern', suppressed: false, baseFeatureId: 'pocket',
    source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
    first: { direction: [1, 0, 0], count: 3, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }],
      referencePolicies: [], variation: { kind: 'none' } } };
}
function varied(first = .5, second: number | null = 1.5): LinearPatternFeature {
  const features = original().features;
  return withFeaturePatternSketchRadius(withFeaturePatternSketchRadius(pattern(), features, '1,0', first), features, '2,0', second) as LinearPatternFeature;
}
async function usingEngine(run: (engine: CadEngine) => void | Promise<void>) {
  const engine = new CadEngine(); let failure: unknown;
  try { await run(engine); } catch (error) { failure = error; }
  try { engine.dispose(); } catch (cleanup) { throw new AggregateError(failure ? [failure, cleanup] : [cleanup], 'Radius fixture or cleanup failed.'); }
  if (failure) throw failure;
}
function shape(engine: CadEngine, reference = output): Shape3D {
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!catalog) throw Error('Real body catalog required');
  return catalog.resolve(reference).shape;
}
function build(engine: CadEngine, document: Document): Shape3D {
  const bytes = serializeDocument(document), result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.bodies?.map(body => body.ref)).toEqual([output]);
  expect(result.bodies?.[0].createdByFeatureId).toBe('plate');
  expect(serializeDocument(document)).toBe(bytes);
  return shape(engine);
}
function near(actual: number, expected: number, tolerance = 1e-5) { expect(Math.abs(actual - expected)).toBeLessThan(tolerance); }
function metrics(material: Shape3D, volume: number, area: number, bounds = [[0, 0, 0], [20, 8, 5]]) {
  validateBodyShape(material);
  withNativeOwners(owners => {
    expect(owners.ownAll(material.solids)).toHaveLength(1);
    near(owners.own(measureShapeVolumeProperties(material)).volume, volume);
    near(owners.own(measureShapeSurfaceProperties(material)).area, area);
    const box = owners.own(material.boundingBox).bounds;
    bounds.forEach((side, i) => side.forEach((value, j) => near(box[i][j], value, 1e-6)));
  });
}
function probe(material: Shape3D, center: Vec3, present: boolean) {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .05) as Vec3, center.map(value => value + .05) as Vec3));
    const common = owners.own(bodyBoolean('common', material, cube));
    near(owners.own(measureShapeVolumeProperties(common)).volume, present ? .001 : 0, 1e-8);
  });
}
function pockets(material: Shape3D, swapped: boolean) {
  withNativeOwners(owners => {
    const walls = owners.ownAll(material.faces).filter(face => face.geomType === 'CYLINDRE');
    expect(walls).toHaveLength(3);
    const centres: Vec3[] = [[3, 4, 4.5], [8, 4, 4.5], [13, 4, 4.5]];
    const radii = swapped ? [1, 1.5, .5] : [1, .5, 1.5];
    for (let index = 0; index < centres.length; index++) {
      const matching = walls.filter(face => {
        const surface = owners.own(measureShapeSurfaceProperties(face));
        return centres[index].every((value, axis) => Math.abs(surface.centerOfMass[axis] - value) < 1e-6);
      });
      expect(matching).toHaveLength(1);
      near(owners.own(measureShapeSurfaceProperties(matching[0])).area, 2 * Math.PI * radii[index]);
    }
  });
  probe(material, [8.9, 4, 4.5], !swapped);
  probe(material, [13.9, 4, 4.5], swapped);
}

it('solves actual driving radii and preserves exact physical pockets through swap, history, reopen and STEP', () => usingEngine(async engine => {
  const before = original(), bytes = serializeDocument(before), history = new DocumentHistory(before);
  const saved = history.apply(addFeature(before, varied())), reopened = parseDocument(serializeDocument(saved));
  const material = build(engine, reopened);
  // Independent original formula: three blind pockets of height 1 and radii 1, .5, 1.5.
  metrics(material, 800 - 3.5 * Math.PI, 600 + 6 * Math.PI); pockets(material, false);
  expect(serializeDocument(before)).toBe(bytes);
  const changed = history.apply(updateFeature(saved, output.sourceFeatureId, varied(1.5, .5)));
  const swapped = build(engine, changed);
  metrics(swapped, 800 - 3.5 * Math.PI, 600 + 6 * Math.PI); pockets(swapped, true);
  pockets(build(engine, history.undo()), false); pockets(build(engine, history.redo()), true);
  const exported = engine.export('step', changed.features);
  const step = createStepSource(new Uint8Array(await exported.arrayBuffer()));
  withNativeOwners(owners => {
    const imported = owners.own(importStepSolid(step));
    metrics(imported, 800 - 3.5 * Math.PI, 600 + 6 * Math.PI); pockets(imported, true);
  });
}), 60_000);

it('inherits the real solved source radius rather than its nominal geometry for an unassigned copy', () => usingEngine(engine => {
  const document = addFeature(original(), varied(.5, null));
  const source = document.features[2] as SketchFeature;
  expect(source.profile).toMatchObject({ entities: [{ radius: .8 }], constraints: [{}, { value: 1 }] });
  const material = build(engine, document);
  metrics(material, 800 - 2.25 * Math.PI, 600 + 5 * Math.PI);
  probe(material, [13.9, 4, 4.5], false);
}), 60_000);

it.each(['mirror', 'circularPattern'] as const)('solves the driving radius in its actual %s frame without changing source depth', kind => usingEngine(engine => {
  const document = original(), base = document.features[0] as SketchFeature, circle = document.features[2] as SketchFeature;
  if (base.profile.kind !== 'rectangle' || circle.profile.kind !== 'entities' || circle.profile.constraints[0].type !== 'fix') throw Error('Original profiles required');
  base.profile.center = kind === 'mirror' ? [0, 4] : [0, 0];
  if (kind === 'circularPattern') { circle.profile.points[0].y = 0; circle.profile.constraints[0].y = 0; }
  const { first: _first, second: _second, secondSeedOnly: _only, skipped: _skipped, ...common } = pattern();
  const operation: RepetitionFeature = kind === 'mirror'
    ? { ...common, type: 'mirror', support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
    : { ...common, type: 'circularPattern', count: 2, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  const saved = addFeature(document, withFeaturePatternSketchRadius(operation, document.features, kind === 'mirror' ? 'mirror' : '1', 1.5));
  const material = build(engine, parseDocument(serializeDocument(saved)));
  metrics(material, 800 - 3.25 * Math.PI, 600 + 5 * Math.PI, kind === 'mirror' ? [[-10, 0, 0], [10, 8, 5]] : [[-10, -4, 0], [10, 4, 5]]);
  probe(material, [-4.3, kind === 'mirror' ? 4 : 0, 4.5], false);
  probe(material, [4.3, kind === 'mirror' ? 4 : 0, 4.5], true);
}), 60_000);

it('keeps the exact prior material when a later varied instance misses its selected owner', () => usingEngine(engine => {
  const before = original(), initial = engine.build(before.features), operation = varied();
  operation.first.spacing = 10;
  const rejected = engine.build(addFeature(before, operation).features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual([output.sourceFeatureId]);
  expect(rejected.featureErrors[0].message).toMatch(/changes no material/);
  expect(rejected.bodies).toEqual(initial.bodies);
  metrics(shape(engine, owner), 800 - Math.PI, 600 + 2 * Math.PI);
  expect(() => engine.export('step')).toThrow();
}), 60_000);

it('rejects a failed real instance solve after an earlier copy without publishing that partial material', () => usingEngine(engine => {
  const before = original(), initial = engine.build(before.features), solve = profiles.solveEntityProfileResult;
  let variedSolves = 0;
  const fault = vi.spyOn(profiles, 'solveEntityProfileResult').mockImplementation(profile => {
    const result = solve(profile), radius = profile.constraints.find(item => item.type === 'radius');
    if (radius?.type === 'radius' && radius.value !== 1) variedSolves++;
    return radius?.type === 'radius' && radius.value === 1.5 ? { ...result, status: 'inconsistent', message: 'Original injected late instance solve failure' } : result;
  });
  try {
    const rejected = engine.build(addFeature(before, varied()).features);
    expect(variedSolves).toBe(2);
    expect(rejected.featureErrors.map(error => error.id)).toEqual([output.sourceFeatureId]);
    expect(rejected.featureErrors[0].message).toMatch(/inconsistent/);
    expect(rejected.bodies).toEqual(initial.bodies);
    metrics(shape(engine, owner), 800 - Math.PI, 600 + 2 * Math.PI);
  } finally { fault.mockRestore(); }
}), 60_000);

function directEvaluation(engine: CadEngine) {
  const document = original(); expect(engine.build(document.features).featureErrors).toEqual([]);
  const context: SourceSketchSupportContext = { planeFeatureIds: new Set(), solidFeatureIds: new Set(), unavailableFeatureIds: new Set(), planes: new Map(), historicalFaces: new Map() };
  const actual = createSourceSketchSolveRegistry(document.features, context);
  document.features.forEach((feature, index) => actual.observeFeature(feature, index));
  actual.solveAndStage(document.features[2] as SketchFeature, 2, () => {});
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog, source = catalog.resolve(owner), operation = varied();
  const variation = operation.featurePattern;
  if (variation?.mode !== 'regenerate') throw Error('Original regeneration required');
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: operation.id, patternKind: operation.type,
    beforeFeatureIndex: document.features.length, sourceFeatureIds: ['pocket'], plan: patternPlan(operation),
    scope: { mode: 'selected', targets: [owner] }, targetSnapshot: [owner], bindings: [{ source: owner, targets: [owner.bodyId] }],
    referencePolicies: [], variation: variation.variation };
  return { actual, document, input: { features: document.features, request, catalog,
    historicalStates: new Map([[exactStateKey(owner), { ref: owner, lineage: source.lineage, shape: source.shape }]]), sourceSketchSolves: actual.reader } };
}

it.each(['source-change', 'revoked-solve', 'solver-throw', 'tool-release'] as const)('rejects late %s atomically and preserves the original catalog owner', fault => usingEngine(engine => {
  const setup = directEvaluation(engine), before = setup.input.catalog.resolve(owner), sourceBytes = serializeDocument(setup.document);
  const primary = new Error('Original late radius ' + fault), solve = profiles.solveEntityProfileResult, buildTool = bridge.buildRecipeInstanceTool;
  const staged = vi.spyOn(setup.input.catalog, 'stageReplaceMany'); let solves = 0, releases = 0;
  const solver = vi.spyOn(profiles, 'solveEntityProfileResult').mockImplementation(profile => {
    const radius = profile.constraints.find(item => item.type === 'radius');
    if (radius?.type !== 'radius' || radius.value === 1) return solve(profile);
    solves++;
    if (radius.value === 1.5 && fault === 'solver-throw') throw primary;
    const result = solve(profile);
    if (radius.value === 1.5 && fault === 'source-change') {
      const source = setup.document.features[2] as SketchFeature;
      if (source.profile.kind !== 'entities' || source.profile.constraints[1].type !== 'radius') throw Error('Original driver required');
      source.profile.constraints[1].value = 2;
    }
    if (radius.value === 1.5 && fault === 'revoked-solve') setup.actual.revoke();
    return result;
  });
  const tools = vi.spyOn(bridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    const result = buildTool(input);
    if (fault === 'tool-release' && input.address === '2,0') {
      const release = result.tool.delete.bind(result.tool);
      vi.spyOn(result.tool, 'delete').mockImplementation(() => { releases++; release(); throw primary; });
    }
    return result;
  });
  let caught: unknown;
  try { const evaluation = evaluateFeatureRecipes(setup.input); evaluation.dispose(); } catch (error) { caught = error; }
  try {
    expect(solves).toBe(2); expect(caught).toBeDefined(); expect(staged).not.toHaveBeenCalled();
    if (fault === 'tool-release') { expect(caught).toBeInstanceOf(NativeCleanupError); expect(releases).toBe(1); }
    if (fault === 'solver-throw') expect(caught).toBe(primary);
    expect(setup.input.catalog.resolve(owner)).toEqual(before);
    expect(setup.input.catalog.resolve(owner).shape).toBe(before.shape);
    metrics(before.shape, 800 - Math.PI, 600 + 2 * Math.PI);
    if (fault !== 'source-change') expect(serializeDocument(setup.document)).toBe(sourceBytes);
  } finally { solver.mockRestore(); tools.mockRestore(); staged.mockRestore(); setup.actual.revoke(); }
}), 60_000);

it('rejects forged or revoked source-solve authority before any native clone', () => usingEngine(engine => {
  const setup = directEvaluation(engine), clone = vi.spyOn(bodies, 'copyBodyShape');
  try {
    expect(() => evaluateFeatureRecipes({ ...setup.input, sourceSketchSolves: { ...setup.actual.reader } })).toThrow(/not issued/);
    setup.actual.revoke();
    expect(() => evaluateFeatureRecipes(setup.input)).toThrow(/revoked/);
    expect(clone).not.toHaveBeenCalled();
    metrics(setup.input.catalog.resolve(owner).shape, 800 - Math.PI, 600 + 2 * Math.PI);
  } finally { clone.mockRestore(); setup.actual.revoke(); }
}), 60_000);

it('rejects an over-budget selected sketch table before any native target clone or lookup', () => usingEngine(engine => {
  const setup = directEvaluation(engine), feature = pattern(); feature.first.count = 130;
  const targets = [owner];
  for (let i = 1; i < 4; i++) {
    const id = `budget-target-${i}`, creator = `budget-owner-${i}`, sketch = `budget-profile-${i}`;
    setup.input.features.push({ id: sketch, name: 'Original budget-only rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [50 * i, 4], width: 20, height: 8 } },
    { id: creator, name: 'Original budget-only owner', type: 'extrude', suppressed: false, sketchId: sketch, depth: 5, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: id } });
    targets.push({ bodyId: id, sourceFeatureId: creator });
  }
  const request = { ...setup.input.request, beforeFeatureIndex: setup.input.features.length, plan: patternPlan(feature),
    scope: { mode: 'selected' as const, targets }, targetSnapshot: targets, bindings: [{ source: owner, targets: targets.map(target => target.bodyId) }] };
  const clone = vi.spyOn(bodies, 'copyBodyShape'), lookup = vi.spyOn(setup.input.catalog, 'resolve');
  try {
    expect(() => evaluateFeatureRecipes({ ...setup.input, request })).toThrow(/512/);
    expect(clone).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
  } finally { clone.mockRestore(); lookup.mockRestore(); setup.actual.revoke(); }
}), 60_000);
