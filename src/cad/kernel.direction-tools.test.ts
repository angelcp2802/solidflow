import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { beforeAll, expect, it, vi } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, setOC } from 'replicad';
import { resolveDirectionTools } from './kernel.direction-tools';
import { NativeCleanupError } from './kernel.native-ownership';
import { validateBodyShape } from './kernel.bodies';

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url)
  .resolve('replicad-opencascadejs/wasm')), print: () => undefined })), 60_000);
it.each([0, 1])('rejects %s branches before any native acquisition or absence classification', count => {
  const build = vi.fn(() => makeBox([0, 0, 0], [1, 1, 1]));
  expect(() => resolveDirectionTools(Array.from({ length: count }, () => ({ build })), true, validateBodyShape)).toThrow(/exactamente dos/);
  expect(build).not.toHaveBeenCalled();
});
it('retains a later branch error and a real native cleanup failure instead of publishing absence', () => {
  const shape = makeBox([0, 0, 0], [1, 1, 1]), primary = new Error('Original later-branch failure'), cleanup = new Error('Original native release failure');
  const rawDelete = shape.delete.bind(shape), release = vi.spyOn(shape, 'delete').mockImplementation(() => { rawDelete(); throw cleanup; });
  let caught: unknown;
  try { resolveDirectionTools([{ build: () => shape }, { build: () => { throw primary; } }], true, validateBodyShape); }
  catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as AggregateError).cause).toBe(primary);
  expect((caught as AggregateError).errors).toEqual([primary, cleanup]); expect(release).toHaveBeenCalledOnce();
});
