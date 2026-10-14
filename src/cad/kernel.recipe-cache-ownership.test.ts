import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDocument, serializeDocument, validateDocument, type Document } from '../model/document';
import * as bodies from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import * as recipes from './kernel.feature-recipes';
import * as instances from './kernel.recipe-instance';
import * as ownership from './kernel.native-ownership';
import type { BodyReference, CadResult, Feature } from './kernel.types';

// Original mm fixtures. Native factories/geometry remain real; fault injection
// changes only project export wiring and one received owner's Map instance.
// No SDK, global Map or class prototype is patched.
const RealNativeOwners = ownership.NativeOwners, realWithNativeOwners = ownership.withNativeOwners,
  realCopyBodyShape = bodies.copyBodyShape, realEvaluate = recipes.evaluateFeatureRecipes;
const sourceBodyId = 'cache-source', targetBodyId = 'cache-target', patternId = 'cache-recipe-pattern';
const sourceRef = (number: number): BodyReference => ({ bodyId: sourceBodyId, sourceFeatureId: 'cache-seed-' + number });

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function fixture(check: (engine: CadEngine, restore: (callback: () => void) => void) => void): void {
  const engine = new CadEngine(), restorations: (() => void)[] = [], cleanup: unknown[] = [];
  let failed = false, primary: unknown;
  try { check(engine, callback => restorations.push(callback)); }
  catch (error) { failed = true; primary = error; }
  for (const restore of restorations.reverse()) try { restore(); } catch (error) { cleanup.push(error); }
  try { engine.dispose(); } catch (error) { cleanup.push(error); }
  if (cleanup.length) throw new AggregateError(failed ? [primary, ...cleanup] : cleanup,
    'Original recipe cache fixture or release failed.', { cause: failed ? primary : cleanup[0] });
  if (failed) throw primary;
}

function volume(shape: Shape3D): number {
  return realWithNativeOwners(owners => owners.own(measureShapeVolumeProperties(shape)).volume);
}

function originalDocument(twoSeeds: boolean): Document {
  const features: Feature[] = [
    { id: 'cache-source-profile', type: 'sketch', name: 'Original source rectangle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 } },
    { id: 'cache-create-source', type: 'extrude', name: 'Original four-unit source', suppressed: false,
      sketchId: 'cache-source-profile', depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: sourceBodyId } },
  ];
  for (const number of twoSeeds ? [1, 2] : [1]) {
    features.push({ id: 'cache-seed-profile-' + number, type: 'sketch', name: 'Original distinct blind circle ' + number,
      suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'circle', center: [number === 1 ? 3 : 7, 5], radius: 1 } },
    { id: sourceRef(number).sourceFeatureId, type: 'cut', name: 'Original one-unit source pocket ' + number, suppressed: false,
      sketchId: 'cache-seed-profile-' + number, depth: 1, symmetric: false,
      bodyScope: [number === 1 ? { bodyId: sourceBodyId, sourceFeatureId: 'cache-create-source' } : sourceRef(1)] });
  }
  features.push({ id: 'cache-target-profile', type: 'sketch', name: 'Original target rectangle', suppressed: false,
    plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [25, 5], width: 10, height: 10 } },
  { id: 'cache-create-target', type: 'extrude', name: 'Original eight-unit target', suppressed: false,
    sketchId: 'cache-target-profile', depth: 8, symmetric: false, bodyOperation: { mode: 'new', bodyId: targetBodyId } });
  const sources = twoSeeds ? [sourceRef(1), sourceRef(2)] : [sourceRef(1)];
  features.push({ id: patternId, type: 'linearPattern', name: 'Original selected recipe cache boundary', suppressed: false,
    baseFeatureId: 'cache-create-target', source: { mode: 'features', geometryPattern: false,
      featureIds: sources.map(ref => ref.sourceFeatureId) },
    first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected',
      targets: [{ bodyId: targetBodyId, sourceFeatureId: 'cache-create-target' }],
      bindings: sources.map(source => ({ source, targetBodyIds: [targetBodyId] })), referencePolicies: [], variation: { kind: 'none' } } });
  return validateDocument({ ...createDocument('Original cache ownership acceptance'), features });
}

it('retains an ordinary exact-source capture cause and rejects its consumer before constructing a recipe tool', () => fixture((engine, restore) => {
  const document = originalDocument(false), saved = serializeDocument(document),
    baseline = engine.build(document.features.slice(0, -1)), primary = new Error('Original ordinary exact-source copy failure');
  expect(baseline.featureErrors).toEqual([]); expect(Math.abs(baseline.volume - (1200 - Math.PI))).toBeLessThan(1e-5);
  let captureVolume: number | undefined, observedError: unknown, observedRef: BodyReference | undefined,
    observedShape = true, consumerError: unknown;
  const copySpy = vi.spyOn(bodies, 'copyBodyShape').mockImplementationOnce(shape => {
    captureVolume = volume(shape); throw primary;
  });
  restore(() => copySpy.mockRestore());
  const evaluateSpy = vi.spyOn(recipes, 'evaluateFeatureRecipes').mockImplementation(input => {
    const state = input.historicalStates.get(JSON.stringify([sourceBodyId, sourceRef(1).sourceFeatureId]));
    observedError = state?.error; observedRef = state ? { ...state.ref } : undefined; observedShape = !!state?.shape;
    try { return realEvaluate(input); } catch (error) { consumerError = error; throw error; }
  });
  restore(() => evaluateSpy.mockRestore());
  const toolSpy = vi.spyOn(instances, 'buildRecipeInstanceTool');
  restore(() => toolSpy.mockRestore());
  const result = engine.build(document.features);
  expect(copySpy).toHaveBeenCalledTimes(1); expect(evaluateSpy).toHaveBeenCalledTimes(1); expect(toolSpy).not.toHaveBeenCalled();
  expect(Math.abs(captureVolume! - (400 - Math.PI))).toBeLessThan(1e-5);
  expect(observedRef).toEqual(sourceRef(1)); expect(observedError).toBe(primary); expect(observedShape).toBe(false);
  expect(consumerError).toBeInstanceOf(Error); expect((consumerError as Error).cause).toBe(primary);
  expect(result.featureErrors.map(error => error.id)).toEqual([patternId]);
  expect(result.featureErrors[0].message).toContain('exact historical recipe source could not be captured');
  expect(result.bodies).toEqual(baseline.bodies); expect(Math.abs(result.volume - (1200 - Math.PI))).toBeLessThan(1e-5);
  expect(serializeDocument(document)).toBe(saved);
}), 60_000);

type OwnerRecord = { attempted: boolean; release(): void };
type ScopeRecords = { records: Map<ownership.NativeOwner, OwnerRecord> };

it.each(['before', 'after'] as const)('releases a prior cached copy and a fresh copy once when capture registration fails %s insertion', publication => fixture((engine, restore) => {
  const document = originalDocument(true), saved = serializeDocument(document),
    primary = new Error('Original second recipe capture registration ' + publication),
    cleanup = new Error('Original second received native copy release ' + publication);
  const received: { shape: Shape3D; release: ReturnType<typeof vi.fn>; inputVolume: number }[] = [];
  let injected = false, caught: unknown, returned: CadResult | undefined;
  const copySpy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(shape => {
    const inputVolume = volume(shape);
    return realWithNativeOwners(setup => {
      const copy = setup.own(realCopyBodyShape(shape)), ordinal = received.length + 1,
        nativeDelete = copy.delete.bind(copy), release = vi.fn(() => { nativeDelete(); if (ordinal === 2) throw cleanup; });
      Object.defineProperty(copy, 'delete', { configurable: true, value: release });
      received.push({ shape: copy, release, inputVolume });
      return copy;
    }, copy => [copy]);
  });
  restore(() => copySpy.mockRestore());
  class ObservedRecipeOwners extends RealNativeOwners {
    constructor() {
      super();
      const records = (this as unknown as ScopeRecords).records, realSet = records.set.bind(records);
      Object.defineProperty(records, 'set', { configurable: true, value: (key: ownership.NativeOwner, record: OwnerRecord) => {
        if (!injected && received.length === 2 && key === received[1].shape) {
          injected = true;
          if (publication === 'after') realSet(key, record);
          throw primary;
        }
        return realSet(key, record);
      } });
    }
  }
  const scopeSpy = vi.spyOn(ownership, 'NativeOwners').mockImplementation(ObservedRecipeOwners);
  restore(() => scopeSpy.mockRestore());
  const evaluateSpy = vi.spyOn(recipes, 'evaluateFeatureRecipes'), toolSpy = vi.spyOn(instances, 'buildRecipeInstanceTool');
  restore(() => evaluateSpy.mockRestore()); restore(() => toolSpy.mockRestore());
  try { returned = engine.build(document.features); } catch (error) { caught = error; }
  expect(injected).toBe(true); expect(copySpy).toHaveBeenCalledTimes(2); expect(received).toHaveLength(2);
  expect(Math.abs(received[0].inputVolume - (400 - Math.PI))).toBeLessThan(1e-5);
  expect(Math.abs(received[1].inputVolume - (400 - 2 * Math.PI))).toBeLessThan(1e-5);
  expect(received[0].release).toHaveBeenCalledTimes(1); expect(received[1].release).toHaveBeenCalledTimes(1);
  expect(returned).toBeUndefined(); expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).cause).toBe(primary); expect((caught as AggregateError).errors).toEqual([primary, cleanup]);
  expect(evaluateSpy).not.toHaveBeenCalled(); expect(toolSpy).not.toHaveBeenCalled();
  const state = engine as unknown as { shape: Shape3D | null; bodyCatalog: bodies.NativeBodyCatalog | null };
  expect(state.shape).toBeNull(); expect(state.bodyCatalog).toBeNull();
  expect(serializeDocument(document)).toBe(saved);
}), 60_000);
