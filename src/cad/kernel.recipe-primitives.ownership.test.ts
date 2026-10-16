import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeVolumeProperties, setOC, Sketch, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { validateBodyShape } from './kernel.bodies';
import * as ownership from './kernel.native-ownership';
import { buildExplicitFramePrimitive } from './kernel.recipe-primitives';

// Original native acquisition-failure cases. They retain actual Sketch/native
// geometry and change only a project scope's private Map instance, not any SDK
// prototype/global or returned geometric result.
const realWithNativeOwners = ownership.withNativeOwners;
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
for (const publication of ['before', 'after'] as const) it('releases an actual received Sketch once when registration fails ' + publication + ' insertion', () => realWithNativeOwners(fixture => {
  const target = fixture.own(makeBox([0, 0, 0], [10, 10, 4])), primary = new Error('Original Sketch registration ' + publication),
    cleanup = new Error('Original received Sketch release ' + publication);
  let injected = false, release: ReturnType<typeof vi.fn> | undefined, caught: unknown;
  const injectedOperation: typeof ownership.withNativeOwners = (operation, resultOwners, context) => realWithNativeOwners(owners => {
    const records = (owners as unknown as { records: Map<ownership.NativeOwner, { attempted: boolean; release(): void }> }).records,
      realSet = records.set.bind(records);
    Object.defineProperty(records, 'set', { configurable: true,
      value: (key: ownership.NativeOwner, record: { attempted: boolean; release(): void }) => {
        if (!injected && key instanceof Sketch) {
          injected = true;
          const rawRelease = record.release;
          const receivedRelease = vi.fn(() => { rawRelease(); throw cleanup; });
          release = receivedRelease;
          record.release = receivedRelease;
          if (publication === 'after') realSet(key, record);
          throw primary;
        }
        return realSet(key, record);
      } });
    return operation(owners);
  }, resultOwners, context);
  // Only project-owned scope wiring is intercepted. Every factory and native
  // delete remains real; the injected release error follows the real delete.
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(injectedOperation), validator = vi.fn((shape: Shape3D) => { validateBodyShape(shape); });
  try { fixture.own(buildExplicitFramePrimitive({ profile: { kind: 'circle', center: [5, 5], radius: 1 },
    frame: { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] }, signedDepth: 1,
    termination: { kind: 'throughAll', bothDirections: false }, operation: 'subtract', workingTarget: target, validateTool: validator }));
  } catch (error) { caught = error; } finally { spy.mockRestore(); }
  expect(injected).toBe(true); expect(caught).toBeInstanceOf(ownership.NativeCleanupError);
  expect((caught as AggregateError).cause).toBe(primary); expect((caught as AggregateError).errors).toEqual([primary, cleanup]);
  expect(release).toHaveBeenCalledTimes(1); expect(validator).not.toHaveBeenCalled();
  validateBodyShape(target);
  realWithNativeOwners(measure => expect(Math.abs(measure.own(measureShapeVolumeProperties(target)).volume - 400)).toBeLessThan(1e-5));
  realWithNativeOwners(measure => measure.own(target.boundingBox).bounds.forEach((side, i) => side.forEach((value, j) =>
    expect(Math.abs(value - [[0, 0, 0], [10, 10, 4]][i][j])).toBeLessThan(1e-6))));
}), 60_000);
