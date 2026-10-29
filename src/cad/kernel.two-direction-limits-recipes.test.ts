import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import { createDocument, parseDocument, serializeDocument, validateDocument } from '../model/document';
import type { Feature, RepetitionFeature } from './kernel.types';
import * as recipeBridge from './kernel.recipe-instance';
import * as profiles from './kernel.profiles';

// Original enclosed stratified owner:20*14*51 minus16*10*(4+20+6).
// Its two near walls are6mm each; the outer upper/lower walls are4/5mm.
// A4*3 footprint therefore removes144/192/204/252 for Next/Next,
// All/Next, Next/All and All/All. Native material never supplies an oracle.
const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url)
  .resolve('replicad-opencascadejs/wasm')), print: () => undefined })), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });
function box(id: string, bodyId: string, x: number, offset: number, depth: number): Feature[] {
  return [{ id: id + '-profile', name: 'Original20x14', type: 'sketch', suppressed: false, plane: 'XY', offset,
    profile: { kind: 'rectangle', center: [x + 10, 7], width: 20, height: 14 } },
  { id, name: 'Original outer box', type: 'extrude', suppressed: false, sketchId: id + '-profile', depth, symmetric: false,
    bodyOperation: { mode: 'new', bodyId } }];
}
function strata(id: string, bodyId: string, x: number): Feature[] {
  const features = box(id + '-outer', bodyId, x, -21, 51); let previous = id + '-outer';
  for (const [index, offset, depth] of [[0, -16, 4], [1, -6, 20], [2, 20, 6]]) {
    const next = index === 2 ? id : id + '-void-' + index, profile = next + '-profile';
    features.push({ id: profile, name: 'Original inner16x10', type: 'sketch', suppressed: false, plane: 'XY', offset,
      profile: { kind: 'rectangle', center: [x + 10, 7], width: 16, height: 10 } },
    { id: next, name: 'Original enclosed void', type: 'cut', suppressed: false, sketchId: profile, depth, symmetric: false,
      bodyScope: [{ bodyId, sourceFeatureId: previous }] });
    previous = next;
  }
  return features;
}
function fixture(first: 'untilNext' | 'throughAll', second: 'untilNext' | 'throughAll', all = false, entity = false) {
  const end = (kind: 'untilNext' | 'throughAll') => kind === 'throughAll'
    ? { kind, baseFeatureId: 'create-S', bothDirections: false } as const : { kind, baseFeatureId: 'create-S' } as const;
  const features: Feature[] = [...strata('create-S', 'S', 0),
    { id: 'profile', name: 'Original4x3 source', type: 'sketch', suppressed: false, plane: 'XY', offset: 5,
      profile: entity ? { kind: 'entities', constraints: [], points: [
        { id: 'a', x: 8, y: 5.5 }, { id: 'b', x: 12, y: 5.5 }, { id: 'c', x: 12, y: 8.5 }, { id: 'd', x: 8, y: 8.5 },
      ], entities: [
        { id: 'ab', type: 'line', start: 'a', end: 'b', construction: false }, { id: 'bc', type: 'line', start: 'b', end: 'c', construction: false },
        { id: 'cd', type: 'line', start: 'c', end: 'd', construction: false }, { id: 'da', type: 'line', start: 'd', end: 'a', construction: false },
      ] } : { kind: 'rectangle', center: [10, 7], width: 4, height: 3 } },
    { id: 'effect', name: 'Original independent limits', type: 'cut', suppressed: false, sketchId: 'profile', depth: 1, symmetric: false,
      endCondition: end(first), secondDirection: { enabled: true, depth: 1, endCondition: end(second) }, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }] },
    ...strata('create-T', 'T', 20), ...(all ? box('create-U', 'U', 100, -9, 6) : [])];
  const pattern: RepetitionFeature = { id: 'pattern', name: 'Original regenerated bilateral cut', type: 'linearPattern', suppressed: false,
    baseFeatureId: all ? 'create-U' : 'create-T', source: { mode: 'features', geometryPattern: false, featureIds: ['effect'] },
    first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: all ? { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
      bindings: [{ source: { bodyId: 'S', sourceFeatureId: 'effect' }, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } }
      : { mode: 'regenerate', scope: 'selected', targets: [{ bodyId: 'T', sourceFeatureId: 'create-T' }],
        bindings: [{ source: { bodyId: 'S', sourceFeatureId: 'effect' }, targetBodyIds: ['T'] }], referencePolicies: [], variation: { kind: 'none' } } };
  features.push(pattern);
  return validateDocument({ ...createDocument('Original two-ray limit recipes'), features });
}
function metrics(bodyId: string, state: string, volume: number, area: number) {
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog;
  const shape = catalog.resolve({ bodyId, sourceFeatureId: state }).shape; validateBodyShape(shape);
  withNativeOwners(owners => {
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
  });
}

const cases = [
  { first: 'untilNext', second: 'untilNext', volume: 9336, area: 6668 },
  { first: 'throughAll', second: 'untilNext', volume: 9288, area: 6700 },
  { first: 'untilNext', second: 'throughAll', volume: 9276, area: 6714 },
  { first: 'throughAll', second: 'throughAll', volume: 9228, area: 6746 },
] as const;
it.each(cases)('regenerates $first/$second from the actual saved seed and current target owners', row => {
  for (const entity of [false, true]) {
    const document = fixture(row.first, row.second, false, entity), bytes = serializeDocument(document);
    const solve = vi.spyOn(profiles, 'solveEntityProfileResult'); solve.mockClear();
    const result = engine.build(parseDocument(bytes).features);
    expect(result.featureErrors).toEqual([]); expect(Math.abs(result.volume - 2 * row.volume)).toBeLessThan(1e-5);
    expect(result.bodies!.map(body => body.ref)).toEqual([{ bodyId: 'S', sourceFeatureId: 'effect' }, { bodyId: 'T', sourceFeatureId: 'pattern' }]);
    metrics('S', 'effect', row.volume, row.area); metrics('T', 'pattern', row.volume, row.area);
    expect(solve).toHaveBeenCalledTimes(entity ? 1 : 0); solve.mockRestore();
    expect(serializeDocument(document)).toBe(bytes);
  }
});
it.each([cases[0], cases[3]])('ALL $first/$second preserves source/remote states with two native absence proofs', row => {
  const real = recipeBridge.resolveRecipeInstanceDirections;
  const guard = vi.spyOn(recipeBridge, 'resolveRecipeInstanceDirections').mockImplementation(input => {
    expect(() => real({ ...input, assertWorkingCurrent: undefined })).toThrow(/working-owner\/revision guard/);
    expect(() => real({ ...input, assertWorkingCurrent: () => { throw Error('Original stale owner'); } })).toThrow('Original stale owner');
    return real(input);
  });
  const document = fixture(row.first, row.second, true), result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]); expect(Math.abs(result.volume - (2 * row.volume + 1680))).toBeLessThan(1e-5);
  expect(result.bodies!.map(body => body.ref)).toEqual([
    { bodyId: 'S', sourceFeatureId: 'effect' }, { bodyId: 'T', sourceFeatureId: 'pattern' }, { bodyId: 'U', sourceFeatureId: 'create-U' }]);
  metrics('T', 'pattern', row.volume, row.area); metrics('U', 'create-U', 1680, 968);
  expect(guard).toHaveBeenCalled();
});
