import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument } from '../model/document';
import type { HoleFeature } from './kernel.types';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';

const require = createRequire(import.meta.url), oracle = require('../../scripts/desktop-part-hole-variants-oracles.cjs');
const readStep = require('../../scripts/desktop-part-hole-step.cjs') as (bytes: Buffer, check: (condition: unknown, label: string) => void, state: string) => Promise<unknown>;
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => {} })), 60_000);
const cases = [{ variant: 'flat', first: 'flat3', second: 'flat4' }, { variant: 'conical', first: 'shoulder3', second: 'tip3' }, { variant: 'next', first: 'next90', second: 'next120' }] as const;

it.each(cases)('preserves native/saved $variant geometry with independent surface/depth STEP observations', async row => {
  const original = validateDocument(require('../../scripts/desktop-part-hole-variants-original.cjs')(row.variant)), originalBytes = serializeDocument(original), engine = new CadEngine();
  let failure: unknown;
  try {
    const base = engine.build(original.features); expect(base.featureErrors).toEqual([]); expect(base.bodies).toHaveLength(1);
    const reference = base.bodies![0].ref, tops = base.bodies![0].faces.filter(face => face.frame && Math.abs(face.frame.normal[2] - 1) < 1e-6 && Math.abs(face.frame.origin[2] - 10) < 1e-6);
    expect(tops).toHaveLength(1);
    const first = oracle(row.first), feature: HoleFeature = { id: 'original-hole-variant', name: 'Original variant ' + row.variant, type: 'hole', suppressed: false,
      baseFeatureId: reference.sourceFeatureId, bodyScope: [reference], support: { kind: 'face', face: tops[0].ref }, reversed: false, diameter: 2,
      positions: [{ id: 'left', x: -4, y: 0 }, { id: 'right', x: 4, y: 0 }], head: first.head, endCondition: first.endCondition };
    const history = new DocumentHistory(original), created = history.apply(addFeature(original, feature));
    const check = async (document: typeof original, state: string) => {
      const expected = oracle(state), result = engine.build(document.features); expect(result.featureErrors).toEqual([]); expect(result.bodies).toHaveLength(1);
      expect(result.bodies![0].ref).toEqual({ bodyId: reference.bodyId, sourceFeatureId: feature.id });
      expect(result.bodies![0].createdByFeatureId).toBe('original-hole-plate');
      const shape = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog.resolve(result.bodies![0].ref).shape; validateBodyShape(shape);
      withNativeOwners(owners => {
        expect(owners.ownAll(shape.solids)).toHaveLength(1);
        expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - expected.volume)).toBeLessThan(1e-5);
        expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - expected.area)).toBeLessThan(1e-5);
      });
      const step = engine.export('step', document.features);
      await readStep(Buffer.from(await step.arrayBuffer()), (condition, label) => expect(condition, label).toBeTruthy(), state);
      expect(serializeDocument(original)).toBe(originalBytes);
    };
    await check(parseDocument(serializeDocument(created)), row.first);
    const second = oracle(row.second), edited = history.apply(updateFeature(created, feature.id, { head: second.head, endCondition: second.endCondition }));
    await check(parseDocument(serializeDocument(edited)), row.second);
    await check(history.undo(), row.first); await check(history.redo(), row.second);
    const savedFeature = edited.features.at(-1) as HoleFeature;
    expect(savedFeature.positions).toEqual(feature.positions); expect(savedFeature.support).toEqual(feature.support); expect(edited.features.slice(0, -1)).toEqual(original.features);
  } catch (error) { failure = error; }
  try { engine.dispose(); } catch (cleanup) { throw new AggregateError(failure ? [failure, cleanup] : [cleanup], 'Original hole variant fixture or cleanup failed'); }
  if (failure) throw failure;
}, 60_000);
