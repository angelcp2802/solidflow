import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { CadEngine } from './kernel.engine';
import * as limits from './kernel.extrusion-limits';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import type { Feature } from './kernel.types';

// Original legacy-box call-site discriminators. Throwing helper faults return
// no fake geometry and patch no SDK/global/prototype. Native helper release
// behavior itself has separate received-instance fault cases.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
function features(): Feature[] {
  return [{ id: 'base-sketch', type: 'sketch', name: 'Original legacy 10 by 10 box', suppressed: false,
    plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 } },
  { id: 'base', type: 'extrude', name: 'Original eight-unit box', suppressed: false, sketchId: 'base-sketch', depth: 8, symmetric: false },
  { id: 'cut-sketch', type: 'sketch', name: 'Original boundary circle', suppressed: false,
    plane: 'XY', offset: 0, profile: { kind: 'circle', center: [5, 5], radius: 1 } },
  { id: 'cut', type: 'cut', name: 'Original boundary ThroughAll', suppressed: false, sketchId: 'cut-sketch', depth: 1, symmetric: false,
    endCondition: { kind: 'throughAll', baseFeatureId: 'base', bothDirections: false } }];
}
it('propagates a native cleanup failure out of engine reconstruction instead of recording a recoverable feature error', () => withNativeOwners(owners => {
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
  const cleanup = new Error('Original helper release'), fatal = new NativeCleanupError(undefined, [cleanup], 'Original fatal helper boundary');
  let calls = 0, caught: unknown;
  const spy = vi.spyOn(limits, 'throughAllTool').mockImplementationOnce(() => { calls++; throw fatal; });
  try { engine.build(features()); } catch (error) { caught = error; } finally { spy.mockRestore(); }
  expect(calls).toBe(1);
  expect(caught).toBe(fatal); expect((caught as AggregateError).cause).toBe(cleanup);
  const state = engine as unknown as { shape: unknown; bodyCatalog: unknown };
  expect(state.shape).toBeNull(); expect(state.bodyCatalog).toBeNull();
}), 60_000);
it('retains ordinary geometry rejection as a feature error with the healthy previous legacy body', () => withNativeOwners(owners => {
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
  const ordinary = new Error('Original complete-profile geometry rejection'),
    spy = vi.spyOn(limits, 'throughAllTool').mockImplementationOnce(() => { throw ordinary; });
  const result = (() => { try { return engine.build(features()); } finally { spy.mockRestore(); } })();
  expect(result.featureErrors).toEqual([{ id: 'cut', message: ordinary.message }]);
  expect(Math.abs(result.volume - 800)).toBeLessThan(1e-5);
  [result.bounds.min, result.bounds.max].forEach((side, i) => side.forEach((value, j) =>
    expect(Math.abs(value - [[0, 0, 0], [10, 10, 8]][i][j])).toBeLessThan(1e-6)));
}), 60_000);
