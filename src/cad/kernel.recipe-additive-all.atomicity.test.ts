import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { serializeDocument, validateDocument } from '../model/document';
import { exactStateKey, type RegenerationRequest } from '../model/featureRecipes';
import type { BodyReference } from './kernel.types';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog } from './kernel.bodies';
import * as bodyHelpers from './kernel.bodies';
import * as bridge from './kernel.recipe-instance';
import * as applicability from './kernel.recipe-additive-applicability';
import { evaluateFeatureRecipes, stageFeatureRecipeEvaluation, type NativeRecipeSourceState, type OwnedRecipeEvaluation } from './kernel.feature-recipes';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';

const require = createRequire(import.meta.url), source: BodyReference = { bodyId: 'A', sourceFeatureId: 'seed-cap' };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);

function fixture(check: (value: ReturnType<typeof setup>) => void, count = 3) {
  const value = setup(count); let primary: unknown;
  try { check(value); } catch (error) { primary = error; }
  vi.restoreAllMocks();
  try { value.engine.dispose(); } catch (error) { throw new AggregateError(primary ? [primary, error] : [error], 'Original additive atomicity fixture cleanup failed.'); }
  if (primary) throw primary;
}
function setup(count: number) {
  let document = validateDocument(require('../../scripts/desktop-part-additive-all-original.cjs')());
  if (count > 2) {
    const index = document.features.findIndex(f => f.id === 'create-c-profile');
    document.features.splice(index, 0,
      { id: 'd-profile', name: 'Original D profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [22, 2], width: 4, height: 4 } },
      { id: 'create-d', name: 'Original D', type: 'extrude', sketchId: 'd-profile', depth: 4, symmetric: false,
        bodyOperation: { mode: 'new', bodyId: 'D' }, suppressed: false });
    document = validateDocument(document);
  }
  const engine = new CadEngine();
  try {
    const result = engine.build(document.features); expect(result.featureErrors).toEqual([]);
    const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog;
    const nativeSource = catalog.resolve(source);
    const historicalStates = new Map<string, NativeRecipeSourceState>([[exactStateKey(source), { ref: source, lineage: nativeSource.lineage, shape: nativeSource.shape }]]);
    const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: 'additive-atomicity', patternKind: 'linearPattern',
      beforeFeatureIndex: document.features.length, sourceFeatureIds: ['seed-cap'], scope: { mode: 'all', reevaluateAt: 'patternInput' },
      targetSnapshot: catalog.entries().map(e => ({ ...e.ref })), bindings: [{ source, targets: 'scope' }], referencePolicies: [], variation: { kind: 'none' },
      plan: { transforms: Array.from({ length: count - 1 }, (_, i) => ({ key: (i + 1) + ',0', translation: [10 * (i + 1), 0, 0] as [number, number, number] })),
        structure: ['original-additive-atomicity', count] } };
    return { engine, document, features: document.features, catalog, request, historicalStates, result };
  } catch (error) {
    try { engine.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Original additive setup and cleanup failed.', { cause: error }); }
    throw error;
  }
}
function snapshot(value: ReturnType<typeof setup>) {
  return { document: serializeDocument(value.document), entries: value.catalog.entries().map(e => ({ ...e })),
    metrics: withNativeOwners(owners => value.catalog.entries().map(e => ({ ref: { ...e.ref }, volume: owners.own(measureShapeVolumeProperties(e.shape)).volume }))) };
}
function unchanged(value: ReturnType<typeof setup>, before: ReturnType<typeof snapshot>) {
  expect(serializeDocument(value.document)).toBe(before.document);
  const after = value.catalog.entries(); expect(after).toHaveLength(before.entries.length);
  after.forEach((entry, i) => { expect(entry).toEqual(before.entries[i]); expect(entry.shape).toBe(before.entries[i].shape); });
  expect(snapshot(value).metrics).toEqual(before.metrics);
  for (const entry of after) expect(() => value.catalog.resolve({ bodyId: entry.ref.bodyId, sourceFeatureId: value.request.patternId })).toThrow();
}

it.each(['classification', 'union', 'release'] as const)('rejects late %s failure after real private growth without any catalog publication', kind => fixture(value => {
  const before = snapshot(value), originalClassify = applicability.classifyAdditiveRecipeOwner, originalBoolean = bodyHelpers.bodyBoolean,
    originalBuild = bridge.buildRecipeInstanceTool, failure = new Error('Original late additive ' + kind);
  let classification = 0, unions = 0, tools = 0, releaseAttempts = 0;
  const staged = vi.spyOn(value.catalog, 'stageReplaceMany');
  vi.spyOn(applicability, 'classifyAdditiveRecipeOwner').mockImplementation((owner, tool) => {
    classification++; if (kind === 'classification' && classification === 7) throw failure;
    return originalClassify(owner, tool);
  });
  vi.spyOn(bodyHelpers, 'bodyBoolean').mockImplementation((operation, owner, tool) => {
    if (operation === 'add') { unions++; if (kind === 'union' && unions === 2) throw failure; }
    return originalBoolean(operation, owner, tool);
  });
  vi.spyOn(bridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    const result = originalBuild(input); tools++;
    if (kind === 'release' && tools === 2) {
      const dispose = result.tool.delete.bind(result.tool);
      vi.spyOn(result.tool, 'delete').mockImplementation(() => { releaseAttempts++; dispose(); throw failure; });
    }
    return result;
  });
  let caught: unknown; try { const result = evaluateFeatureRecipes(value); result.dispose(); } catch (error) { caught = error; }
  expect(caught).toBeDefined(); expect(unions).toBeGreaterThanOrEqual(1); expect(staged).not.toHaveBeenCalled();
  if (kind === 'release') { expect(caught).toBeInstanceOf(NativeCleanupError); expect(releaseAttempts).toBe(1); }
  else expect(caught).toBe(failure);
  vi.restoreAllMocks(); unchanged(value, before);
}), 60_000);

it('attests an unchanged remote owner native identity again before staging a positive result', () => fixture(value => {
  const before = snapshot(value), oldEntries = value.catalog.entries.bind(value.catalog);
  withNativeOwners(lifetime => {
    const evaluation = evaluateFeatureRecipes(value);
    lifetime.own({ delete: () => evaluation.dispose() });
    withNativeOwners(owners => {
      const replacement = owners.own(bodyHelpers.copyBodyShape(value.catalog.resolve({ bodyId: 'C', sourceFeatureId: 'create-c' }).shape));
      vi.spyOn(value.catalog, 'entries').mockImplementation(() => oldEntries().map(e => e.ref.bodyId === 'C' ? { ...e, shape: replacement } : e));
      const staged = vi.spyOn(value.catalog, 'stageReplaceMany');
      expect(() => stageFeatureRecipeEvaluation(evaluation, value.catalog, { sourceFeatureId: value.request.patternId, lineage: 'original-positive-state' }, value)).toThrow(/membership or owner state changed/);
      expect(staged).not.toHaveBeenCalled(); vi.restoreAllMocks();
    });
  }, undefined, 'Original additive remote-owner test or retained evaluation release failed.');
  unchanged(value, before);
}, 2), 60_000);

it('records no-op revisions for every remote owner and rejects copied positive evaluation authority', () => fixture(value => {
  const before = snapshot(value); let evaluation: OwnedRecipeEvaluation | undefined;
  try {
    evaluation = evaluateFeatureRecipes(value);
    expect(evaluation.replacements.map(e => e.ref.bodyId)).toEqual(['B']);
    expect(evaluation.attestation.evaluatorRevision).toBe('intrinsic-blind-additive-all-v7');
    for (const owner of ['A', 'C']) expect(evaluation.attestation.virtualOutputs.filter(o => o.targetBodyId === owner)).toEqual([
      { sourcePoststate: source, targetBodyId: owner, address: '1,0', role: 'body', inputRevision: 0, outputRevision: 0, materialChanged: false }]);
    const copied: OwnedRecipeEvaluation = { ...evaluation };
    expect(() => stageFeatureRecipeEvaluation(copied, value.catalog,
      { sourceFeatureId: value.request.patternId, lineage: 'copied-positive-receipt' }, value)).toThrow(/forged/);
  } finally { evaluation?.dispose(); }
  unchanged(value, before);
}, 2), 60_000);

it('rejects the wrong exact ALL native target snapshot before copies, tools or publication', () => fixture(value => {
  const before = snapshot(value);
  value.request.targetSnapshot = value.request.targetSnapshot.map(ref => ref.bodyId === 'B' ? { bodyId: 'B', sourceFeatureId: 'seed-cap' } : ref);
  const copied = vi.spyOn(bodyHelpers, 'copyBodyShape'), built = vi.spyOn(bridge, 'buildRecipeInstanceTool'), staged = vi.spyOn(value.catalog, 'stageReplaceMany');
  expect(() => evaluateFeatureRecipes(value)).toThrow(/complete current native membership/);
  expect(copied).not.toHaveBeenCalled(); expect(built).not.toHaveBeenCalled(); expect(staged).not.toHaveBeenCalled();
  vi.restoreAllMocks(); unchanged(value, before);
}, 2), 60_000);
