import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument } from '../model/document';
import type { EdgeFinishFeature } from './kernel.types';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';

const require = createRequire(import.meta.url);
const oracle = require('../../scripts/desktop-part-finishing-oracles.cjs') as (kind: 'fillet' | 'chamfer', mode: 'all', size: number) => { volume: number; area: number };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => {} })), 60_000);

it.each(['fillet', 'chamfer'] as const)('preserves original owners and exact independent all-edge %s geometry through edit/history/reopen', kind => {
  const original = validateDocument(require('../../scripts/desktop-part-finishing-original.cjs')()), bytes = serializeDocument(original), engine = new CadEngine();
  const feature: EdgeFinishFeature = { id: 'original-all-' + kind, name: 'Original all-edge ' + kind, type: kind, size: .5,
    selection: { mode: 'all' }, baseFeatureId: 'create-a', bodyScope: { bodyId: 'workflow-body-a', sourceFeatureId: 'create-a' }, suppressed: false };
  let failure: unknown;
  try {
    const initial = engine.build(original.features); expect(initial.featureErrors).toEqual([]);
    const untouched = initial.bodies!.find(body => body.ref.bodyId === 'workflow-body-b');
    const history = new DocumentHistory(original), created = history.apply(addFeature(original, feature));
    const check = (document: typeof original, size: .5 | 1) => {
      const result = engine.build(document.features); expect(result.featureErrors).toEqual([]);
      expect(result.bodies).toHaveLength(2);
      expect(result.bodies!.find(body => body.ref.bodyId === 'workflow-body-b')).toEqual(untouched);
      const entry = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog.resolve({ bodyId: 'workflow-body-a', sourceFeatureId: feature.id });
      const shape = entry.shape, expected = oracle(kind, 'all', size); validateBodyShape(shape);
      withNativeOwners(owners => {
        expect(owners.ownAll(shape.solids)).toHaveLength(1);
        expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - expected.volume)).toBeLessThan(5e-6);
        expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - expected.area)).toBeLessThan(5e-6);
        const bounds = owners.own(shape.boundingBox).bounds;
        [[0, 0, 0], [10, 6, 4]].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(5e-6)));
        const faces = owners.ownAll(shape.faces); expect(faces).toHaveLength(26);
        if (kind === 'fillet') {
          expect(faces.filter(face => face.geomType === 'PLANE')).toHaveLength(6);
          expect(faces.filter(face => face.geomType === 'CYLINDRE')).toHaveLength(12);
          expect(faces.filter(face => face.geomType === 'SPHERE')).toHaveLength(8);
        } else {
          expect(faces.every(face => face.geomType === 'PLANE')).toBe(true);
          const counts = [0, 0, 0];
          for (const face of faces) {
            const measured = owners.own(measureShapeSurfaceProperties(face));
            const normal = owners.own(face.normalAt(measured.centerOfMass)).toTuple(), active = normal.map((value, i) => Math.abs(value) > 1e-8 ? i : -1).filter(i => i >= 0);
            expect(active.length).toBeGreaterThanOrEqual(1); expect(active.length).toBeLessThanOrEqual(3);
            active.forEach(axis => expect(Math.abs(Math.abs(normal[axis]) - 1 / Math.sqrt(active.length))).toBeLessThan(1e-8));
            counts[active.length - 1]++;
            const lengths = [10, 6, 4];
            const wanted = lengths.map((length, axis) => !active.includes(axis) ? length / 2 : normal[axis] < 0
              ? active.length === 1 ? 0 : active.length === 2 ? size / 2 : 2 * size / 3
              : length - (active.length === 1 ? 0 : active.length === 2 ? size / 2 : 2 * size / 3));
            wanted.forEach((value, axis) => expect(Math.abs(measured.centerOfMass[axis] - value)).toBeLessThan(5e-6));
          }
          expect(counts).toEqual([6, 12, 8]);
        }
      });
      expect(serializeDocument(original)).toBe(bytes);
    };
    check(parseDocument(serializeDocument(created)), .5);
    const edited = history.apply(updateFeature(created, feature.id, { size: 1 })); check(edited, 1);
    check(history.undo(), .5); check(history.redo(), 1);
    check(parseDocument(serializeDocument(edited)), 1);
  } catch (error) { failure = error; }
  try { engine.dispose(); } catch (cleanup) { throw new AggregateError(failure ? [failure, cleanup] : [cleanup], 'Original all-edge fixture or cleanup failed'); }
  if (failure) throw failure;
}, 60_000);
