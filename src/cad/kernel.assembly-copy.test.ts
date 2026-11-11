import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { CadEngine } from './kernel.engine';
import * as bodies from './kernel.bodies';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import { validateAssemblyShape } from './kernel.assembly-placements';
import type { Feature, Vec3 } from './kernel.types';

// Original feature-built boxes 2x3x4 and cylinder R2x12, mm. No private
// native-engine cast or imported geometry supplies a prototype or oracle.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const REF = { bodyId: 'box', sourceFeatureId: 'solid' };
function features(explicit = true, second = false, round = false): Feature[] {
  const result: Feature[] = [
    { id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: round ? { kind: 'circle', center: [0, 0], radius: 2 } : { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
    { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: round ? 12 : 4, symmetric: false, suppressed: false,
      ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'box' } } : {}) },
  ];
  if (second) result.push(
    { id: 'second-profile', name: 'Original disjoint profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [6, 1.5], width: 2, height: 3 } },
    { id: 'second-solid', name: 'Original disjoint extrusion', type: 'extrude', sketchId: 'second-profile', depth: 4, symmetric: false, suppressed: false,
      ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'second' } } : {}) },
  );
  return result;
}
function engine(owners: NativeOwners, source = features()): CadEngine {
  const value = new CadEngine(); owners.own({ delete: () => value.dispose() });
  expect(value.build(source).featureErrors).toEqual([]); return value;
}
function metrics(shape: Shape3D, count = 1, volume = 24, area = 52, min: Vec3 = [0, 0, 0], max: Vec3 = [2, 3, 4]): void {
  withNativeOwners(owners => {
    expect(validateAssemblyShape(shape)).toBe(count);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(1e-6)));
  });
}
function separate(a: Shape3D, b: Shape3D): void {
  expect(a).not.toBe(b); expect(a.wrapped.IsPartner(b.wrapped)).toBe(false);
  withNativeOwners(owners => {
    const left = owners.ownAll(a.faces), right = owners.ownAll(b.faces);
    expect(left.every(face => right.every(other => !face.wrapped.IsPartner(other.wrapped)))).toBe(true);
  });
}
function captured(action: () => unknown): unknown { try { action(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown): unknown[] {
  return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errorTree) : [])];
}

it('returns independent exact-body copies without consuming or changing the current source', () => withNativeOwners(owners => {
  const source = engine(owners), first = owners.own(source.copyCurrentBodyShape(REF)), second = owners.own(source.copyCurrentBodyShape(REF));
  separate(first, second); metrics(first); metrics(second);
  owners.release(first); metrics(second); metrics(owners.own(source.copyCurrentBodyShape(REF)));
}), 60_000);
it('keeps copied geometry valid after its source engine is disposed', () => withNativeOwners(owners => {
  const source = engine(owners), copy = owners.own(source.copyCurrentBodyShape(REF)); source.dispose(); metrics(copy);
}), 60_000);
it('copies a real analytic cylinder rather than returning display mesh metadata', () => withNativeOwners(owners => {
  const source = engine(owners, features(true, false, true)), copy = owners.own(source.copyCurrentBodyShape(REF));
  metrics(copy, 1, 48 * Math.PI, 56 * Math.PI, [-2, -2, 0], [2, 2, 12]);
}), 60_000);
it('returns the complete legacy two-solid aggregate without invented child body references', () => withNativeOwners(owners => {
  const source = engine(owners, features(false, true)), first = owners.own(source.copyCurrentBodyShape(null)), second = owners.own(source.copyCurrentBodyShape(null));
  metrics(first, 2, 48, 104, [0, 0, 0], [7, 3, 4]); separate(first, second);
  expect(() => source.copyCurrentBodyShape(REF)).toThrow('no tiene un catálogo explícito');
  metrics(owners.own(source.copyCurrentBodyShape(null)), 2, 48, 104, [0, 0, 0], [7, 3, 4]);
}), 60_000);
it('resolves both explicit body states separately and forbids aggregate fallback', () => withNativeOwners(owners => {
  const source = engine(owners, features(true, true));
  expect(() => source.copyCurrentBodyShape(null)).toThrow('Selecciona el cuerpo explícito');
  expect(() => source.copyCurrentBodyShape({ ...REF, sourceFeatureId: 'stale' })).toThrow('otro estado');
  expect(() => source.copyCurrentBodyShape({ bodyId: 'missing', sourceFeatureId: 'solid' })).toThrow();
  metrics(owners.own(source.copyCurrentBodyShape(REF)));
  metrics(owners.own(source.copyCurrentBodyShape({ bodyId: 'second', sourceFeatureId: 'second-solid' })), 1, 24, 52, [5, 0, 0], [7, 3, 4]);
}), 60_000);
it.each(['not built', 'empty build', 'disposed'] as const)('rejects copying an engine that is %s', state => {
  const source = new CadEngine();
  try {
    if (state === 'empty build') source.build([]);
    if (state === 'disposed') { source.build(features()); source.dispose(); }
    expect(() => source.copyCurrentBodyShape(null)).toThrow('reconstrucción completa');
  } finally { source.dispose(); }
}, 60_000);
it('rejects a partial real failed reconstruction while preserving an earlier owned copy', () => withNativeOwners(owners => {
  const source = engine(owners), earlier = owners.own(source.copyCurrentBodyShape(REF)), failed = source.build([...features(),
    { id: 'miss-profile', name: 'Original miss', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [100, 100], radius: 1 } },
    { id: 'miss', name: 'Original missed cut', type: 'cut', sketchId: 'miss-profile', depth: 4, symmetric: false, suppressed: false, bodyScope: [REF] },
  ]);
  expect(failed.featureErrors).toHaveLength(1); expect(() => source.copyCurrentBodyShape(REF)).toThrow('reconstrucción completa'); metrics(earlier);
}), 60_000);
it('rejects an upstream no-op result before adopting or deleting its borrowed source', () => withNativeOwners(owners => {
  const source = engine(owners); let borrowed: Shape3D | undefined;
  const spy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => { borrowed = value; return value; });
  try { expect(() => source.copyCurrentBodyShape(REF)).toThrow('propietario nativo prestado'); }
  finally { spy.mockRestore(); }
  expect(borrowed).toBeDefined(); metrics(borrowed!); expect(() => source.copyCurrentBodyShape(REF)).toThrow('reconstrucción completa');
}), 60_000);
it('withholds and releases a completed copy when the native engine epoch changes', () => withNativeOwners(owners => {
  const source = engine(owners), real = bodies.copyBodyShape; let releases = 0;
  const spy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => {
    const copy = real(value), handle = copy.wrapped, release = handle.delete.bind(handle);
    Object.defineProperty(handle, 'delete', { configurable: true, value: () => { releases++; release(); } });
    source.dispose(); return copy;
  });
  try { expect(() => source.copyCurrentBodyShape(REF)).toThrow('La geometría cambió'); expect(releases).toBe(1); }
  finally { spy.mockRestore(); }
}), 60_000);

/** Select the second outer validation, then patch its actual nested analyzer before adoption. */
function validationFault<T>(patch: (owner: NativeOwner) => void, operation: () => T): T {
  const real = ownership.withNativeOwners; let validations = 0, selectedDepth = 0;
  const replacement: typeof ownership.withNativeOwners = <R>(action: (owners: NativeOwners) => R,
    kept: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      const selectedOuter = context === 'Assembly aggregate validation or release failed.' && ++validations === 2;
      if (selectedOuter) selectedDepth++;
      try {
        if (selectedDepth > 0 && context === 'Native validation context or analyzer release failed.') {
          const own = owners.own.bind(owners); owners.own = <S extends NativeOwner>(owner: S): S => { patch(owner); return own(owner); };
        }
        return action(owners);
      } finally { if (selectedOuter) selectedDepth--; }
    }, kept, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return operation(); } finally { spy.mockRestore(); }
}
it.each(['query', 'cleanup', 'query and cleanup'] as const)('retains %s failures, releases the candidate once and revokes copying', fault => withNativeOwners(owners => {
  const source = engine(owners), realCopy = bodies.copyBodyShape, primary = new Error('Original copy validation query'), cleanup = new Error('Original copy validation cleanup');
  let releases = 0, analyzers = 0, analyzerQueries = 0, analyzerReleases = 0;
  const spy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => {
    const copy = realCopy(value), handle = copy.wrapped, release = handle.delete.bind(handle);
    Object.defineProperty(handle, 'delete', { configurable: true, value: () => { releases++; release(); } }); return copy;
  });
  let error: unknown;
  try {
    error = captured(() => validationFault(owner => {
      if ('IsValid' in owner && typeof owner.IsValid === 'function') {
        analyzers++; const query = owner.IsValid.bind(owner), release = owner.delete.bind(owner);
        Object.defineProperty(owner, 'IsValid', { configurable: true, value: () => {
          const result = query(); analyzerQueries++;
          if (fault !== 'cleanup' && analyzerQueries === 1) throw primary;
          return result;
        } });
        Object.defineProperty(owner, 'delete', { configurable: true, value: () => {
          release(); analyzerReleases++; if (fault !== 'query') throw cleanup;
        } });
      }
    }, () => source.copyCurrentBodyShape(REF)));
  } finally { spy.mockRestore(); }
  expect(analyzers).toBe(1); expect(analyzerReleases).toBe(1); expect(releases).toBe(1);
  expect(analyzerQueries).toBe(fault === 'cleanup' ? 4 : 2);
  expect(error).toBeInstanceOf(AggregateError);
  if (fault !== 'query') { expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); }
  if (fault !== 'cleanup') expect(errorTree(error)).toContain(primary);
  expect(() => source.copyCurrentBodyShape(REF)).toThrow('reconstrucción completa');
  expect(source.build(features()).featureErrors).toEqual([]); metrics(owners.own(source.copyCurrentBodyShape(REF)));
}), 60_000);
