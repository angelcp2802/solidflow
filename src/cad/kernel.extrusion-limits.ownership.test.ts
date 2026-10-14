import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { validateBodyShape } from './kernel.bodies';
import { throughAllBossTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import { buildExplicitFramePrimitive } from './kernel.recipe-primitives';
import type { PlaneFrame } from './kernel.types';

// Original causal faults on received native instances only: no SDK prototype,
// global replacement, fake geometric result or external model is used.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const frame: PlaneFrame = { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] };
function make(length: number, start = 0): Shape3D {
  return buildExplicitFramePrimitive({ profile: { kind: 'circle', center: [5, 5], radius: 1 },
    frame: { ...frame, origin: [0, 0, start] }, signedDepth: length, operation: 'subtract',
    termination: { kind: 'blind', symmetric: false }, validateTool: shape => { validateBodyShape(shape); } });
}
function unchanged(target: Shape3D): void {
  validateBodyShape(target);
  withNativeOwners(owners => expect(Math.abs(owners.own(measureShapeVolumeProperties(target)).volume - 800)).toBeLessThan(1e-5));
}
function failingDelete(shape: Shape3D, cleanup: Error): ReturnType<typeof vi.fn> {
  const rawDelete = shape.delete.bind(shape), release = vi.fn(() => { rawDelete(); throw cleanup; });
  Object.defineProperty(shape, 'delete', { configurable: true, value: release });
  return release;
}
it('releases a received UntilNext prism if the subsequent body.faces acquisition fails, preserving both errors', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8])), primary = new Error('Original face acquisition'),
    cleanup = new Error('Original prism release');
  let release: ReturnType<typeof vi.fn> | undefined, caught: unknown;
  Object.defineProperty(target, 'faces', { configurable: true, get: () => { throw primary; } });
  try { untilNextTool(target, [5, 5, 0], [0, 0, 1], (length, start) => {
    const prism = make(length, start); release = failingDelete(prism, cleanup); return prism;
  }, true); } catch (error) { caught = error; }
  finally { Reflect.deleteProperty(target, 'faces'); }
  expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(primary);
  expect((caught as NativeCleanupError).errors).toEqual([primary, cleanup]); expect(release).toHaveBeenCalledTimes(1);
  unchanged(target);
}), 60_000);
it('owns the actual boss intersection before a later cut fails and attempts its release once', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8])), primary = new Error('Original beyond-limit cut'),
    cleanup = new Error('Original occupied release'), rawIntersect = target.intersect.bind(target);
  let release: ReturnType<typeof vi.fn> | undefined, caught: unknown;
  Object.defineProperty(target, 'intersect', { configurable: true, value: (prism: Shape3D) => {
    const occupied = rawIntersect(prism); release = failingDelete(occupied, cleanup);
    Object.defineProperty(occupied, 'cut', { configurable: true, value: () => { throw primary; } });
    return occupied;
  } });
  try { throughAllBossTool(target, [5, 5, 0], [0, 0, 1], false, make); } catch (error) { caught = error; }
  finally { Reflect.deleteProperty(target, 'intersect'); }
  expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(primary);
  expect((caught as NativeCleanupError).errors).toEqual([primary, cleanup]); expect(release).toHaveBeenCalledTimes(1);
  unchanged(target);
}), 60_000);
it('preserves an UpToSurface construction primary when probe release also fails', () => {
  const primary = new Error('Original final prism construction'), cleanup = new Error('Original probe release'),
    limit = { frame: { ...frame, origin: [0, 0, 8] as [number, number, number] } }, before = JSON.stringify(limit);
  let calls = 0, release: ReturnType<typeof vi.fn> | undefined, caught: unknown;
  try { upToSurfaceTool(limit, [5, 5, 0], [0, 0, 1], (length, start) => {
    if (++calls === 2) throw primary;
    const probe = make(length, start); release = failingDelete(probe, cleanup); return probe;
  }); } catch (error) { caught = error; }
  expect(calls).toBe(2); expect(caught).toBeInstanceOf(NativeCleanupError);
  expect((caught as NativeCleanupError).cause).toBe(primary); expect((caught as NativeCleanupError).errors).toEqual([primary, cleanup]);
  expect(release).toHaveBeenCalledTimes(1); expect(JSON.stringify(limit)).toBe(before);
}, 60_000);
it('turns cleanup after a successful UpToSurface split into a fatal failure instead of returning or losing an unowned result', () => {
  const cleanup = new Error('Original successful-prism release'), releases: ReturnType<typeof vi.fn>[] = [];
  let caught: unknown;
  try { upToSurfaceTool({ frame: { ...frame, origin: [0, 0, 8] } }, [5, 5, 0], [0, 0, 1], (length, start) => {
    const prism = make(length, start), rawDelete = prism.delete.bind(prism), index = releases.length;
    const release = vi.fn(() => { rawDelete(); if (index === 1) throw cleanup; });
    releases.push(release); Object.defineProperty(prism, 'delete', { configurable: true, value: release }); return prism;
  }); } catch (error) { caught = error; }
  expect(releases).toHaveLength(2); releases.forEach(release => expect(release).toHaveBeenCalledTimes(1));
  expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(cleanup);
  expect((caught as NativeCleanupError).errors).toEqual([cleanup]);
  // Exact received-result release is separately asserted by the ownership
  // protocol case; this test observes the actual native helper's late path.
}, 60_000);
