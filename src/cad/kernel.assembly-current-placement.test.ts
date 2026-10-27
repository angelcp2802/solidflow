import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { CadEngine } from './kernel.engine';
import * as bodies from './kernel.bodies';
import * as placements from './kernel.assembly-placements';
import * as ownership from './kernel.native-ownership';
import * as validation from './kernel.native-validation';
import * as rigid from '../model/rigidPose';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import type { Feature, Vec3 } from './kernel.types';

// Original feature-built2x3x4boxes and R2x12cylinder, mm. No imported model,
// native-engine cast or placement helper supplies an expected physical value.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const REF = { bodyId: 'box', sourceFeatureId: 'solid' }, H = Math.SQRT1_2;
const I: rigid.RigidPose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const Z: rigid.RigidPose = { translation: [10, -3, 2], rotation: [0, 0, H, H] };
function features(explicit = true, second = false, round = false): Feature[] {
  const result: Feature[] = [
    { id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: round ? { kind: 'circle', center: [0, 0], radius: 2 } : { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
    { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: round ? 12 : 4, symmetric: false, suppressed: false,
      ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'box' } } : {}) },
  ];
  if (second) result.push(
    { id: 'second-profile', name: 'Original second profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [6, 1.5], width: 2, height: 3 } },
    { id: 'second-solid', name: 'Original second extrusion', type: 'extrude', sketchId: 'second-profile', depth: 4, symmetric: false, suppressed: false,
      ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'second' } } : {}) },
  );
  return result;
}
function engine(owners: NativeOwners, source = features()): CadEngine {
  const value = new CadEngine(); owners.own({ delete: () => value.dispose() });
  expect(value.build(source).featureErrors).toEqual([]); return value;
}
function metrics(value: placements.PlacedAssemblyShape, count: number, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    expect(value.solidCount).toBe(count); expect(placements.validateAssemblyShape(value.shape)).toBe(count);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(value.shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(value.shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(value.shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((coordinate, j) => expect(Math.abs(bounds[i][j] - coordinate)).toBeLessThan(1e-6)));
  });
}
function separate(a: Shape3D, b: Shape3D): void {
  expect(a).not.toBe(b); expect(a.wrapped.IsPartner(b.wrapped)).toBe(false);
  withNativeOwners(owners => {
    const left = owners.ownAll(a.faces), right = owners.ownAll(b.faces);
    expect(left.every(face => right.every(other => !face.wrapped.IsPartner(other.wrapped)))).toBe(true);
  });
}
function caught(action: () => unknown): unknown { try { action(); } catch (error) { return error; } return undefined; }
function errors(error: unknown): unknown[] { return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errors) : [])]; }
function releaseCount(shape: Shape3D, released: () => void): void {
  const raw = shape.wrapped, remove = raw.delete.bind(raw);
  Object.defineProperty(raw, 'delete', { configurable: true, value: () => { released(); remove(); } });
}
function placementFault<T>(patch: (value: NativeOwner) => void, action: () => T): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof ownership.withNativeOwners = <R>(operation: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === 'Assembly shape placement or release failed.') {
        const own = owners.own.bind(owners); owners.own = <S extends NativeOwner>(value: S): S => { patch(value); return own(value); };
      }
      return operation(owners);
    }, retained, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return action(); } finally { spy.mockRestore(); }
}
function builder(value: NativeOwner): boolean { return 'Perform' in value && 'ModifiedShape' in value && 'IsDone' in value; }

it('places an explicit body independently of its prototype and another result, surviving source disposal', () => withNativeOwners(owners => {
  const source = engine(owners), real = bodies.copyBodyShape; let borrowed: Shape3D | undefined;
  const copy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => { borrowed = value; return real(value); });
  let first: placements.PlacedAssemblyShape;
  try { first = source.placeCurrentAssemblyBody(REF, Z); owners.own(first.shape); }
  finally { copy.mockRestore(); }
  expect(borrowed).toBeDefined(); separate(first!.shape, borrowed!);
  const second = source.placeCurrentAssemblyBody(REF, { ...I, translation: [20, 0, 0] }); owners.own(second.shape);
  separate(first!.shape, second.shape);
  const unchanged = owners.own(source.copyCurrentBodyShape(REF)); separate(first!.shape, unchanged);
  metrics({ shape: unchanged, solidCount: 1 }, 1, 24, 52, [0, 0, 0], [2, 3, 4]); source.dispose();
  metrics(first!, 1, 24, 52, [7, -3, 2], [10, -1, 6]); metrics(second, 1, 24, 52, [20, 0, 0], [22, 3, 4]);
}), 60_000);

it('places an analytic cylinder with independent Y90 mass, area and bounds', () => withNativeOwners(owners => {
  const source = engine(owners, features(true, false, true)), value = source.placeCurrentAssemblyBody(REF, { translation: [10, 20, 30], rotation: [0, H, 0, H] });
  owners.own(value.shape); source.dispose(); metrics(value, 1, 48 * Math.PI, 56 * Math.PI, [10, 18, 28], [22, 22, 32]);
}), 60_000);

it('places the entire two-solid legacy aggregate without inventing child identities', () => withNativeOwners(owners => {
  const source = engine(owners, features(false, true)), value = source.placeCurrentAssemblyBody(null, Z); owners.own(value.shape);
  const copy = owners.own(source.copyCurrentBodyShape(null)); separate(value.shape, copy); source.dispose();
  metrics(value, 2, 48, 104, [7, -3, 2], [10, 4, 6]);
}), 60_000);

it('rejects null, missing and stale explicit references without revoking a healthy body', () => withNativeOwners(owners => {
  const source = engine(owners), place = vi.spyOn(placements, 'placeAssemblyShapeChecked');
  try {
    expect(() => source.placeCurrentAssemblyBody(null, I)).toThrow('Selecciona el cuerpo explícito');
    expect(() => source.placeCurrentAssemblyBody({ ...REF, sourceFeatureId: 'older' }, I)).toThrow();
    expect(() => source.placeCurrentAssemblyBody({ ...REF, bodyId: 'missing' }, I)).toThrow();
    expect(place).not.toHaveBeenCalled();
  } finally { place.mockRestore(); }
  const value = source.placeCurrentAssemblyBody(REF, I); owners.own(value.shape); metrics(value, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it.each(['empty', 'failed', 'disposed'] as const)('withholds placement from an %s engine', state => withNativeOwners(owners => {
  const source = new CadEngine(); owners.own({ delete: () => source.dispose() });
  if (state === 'disposed') { source.build(features()); source.dispose(); }
  if (state === 'failed') { const invalid = features(); if (invalid[1].type !== 'extrude') throw Error('Original extrusion absent'); invalid[1].depth = 0; expect(source.build(invalid).featureErrors.length).toBeGreaterThan(0); }
  const place = vi.spyOn(placements, 'placeAssemblyShapeChecked');
  try { expect(() => source.placeCurrentAssemblyBody(REF, I)).toThrow('reconstrucción completa'); expect(place).not.toHaveBeenCalled(); }
  finally { place.mockRestore(); }
}), 60_000);

it.each(['rebuild', 'dispose', 'owner'] as const)('rejects the retained placement lease after %s', state => withNativeOwners(owners => {
  const source = engine(owners); let alive = true; const failures: unknown[] = [];
  const lease = source.borrowCurrentAssemblyInspection(() => { if (!alive) throw Error('Original owner closed'); }, error => failures.push(error));
  const value = lease.placeCurrentAssemblyBody(REF, I); owners.own(value.shape);
  if (state === 'rebuild') source.build(features()); else if (state === 'dispose') source.dispose(); else alive = false;
  const copy = vi.spyOn(bodies, 'copyBodyShape');
  try { expect(() => lease.placeCurrentAssemblyBody(REF, I)).toThrow(); expect(copy).not.toHaveBeenCalled(); }
  finally { copy.mockRestore(); }
  expect(failures.length).toBeGreaterThan(0); metrics(value, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('checks currentness after pose inspection before any native source validation', () => withNativeOwners(owners => {
  const source = engine(owners), real = rigid.validateRigidPose, validate = vi.spyOn(validation, 'withNativeValidationContext');
  const pose = vi.spyOn(rigid, 'validateRigidPose').mockImplementation(value => { const result = real(value); source.dispose(); return result; });
  try { expect(() => source.placeCurrentAssemblyBody(REF, I)).toThrow('La geometría cambió'); expect(validate).not.toHaveBeenCalled(); }
  finally { pose.mockRestore(); validate.mockRestore(); }
}), 60_000);

it('withholds placement if source validation invalidates the engine before copying', () => withNativeOwners(owners => {
  const source = engine(owners), real = validation.withNativeValidationContext, copy = vi.spyOn(bodies, 'copyBodyShape');
  let queries = 0;
  const validate = vi.spyOn(validation, 'withNativeValidationContext').mockImplementation((seed, action) => {
    const result = real(seed, action); queries++; source.dispose(); return result;
  });
  try { expect(() => source.placeCurrentAssemblyBody(REF, I)).toThrow('La geometría cambió'); expect(queries).toBe(1); expect(copy).not.toHaveBeenCalled(); }
  finally { validate.mockRestore(); copy.mockRestore(); }
}), 60_000);

it('adopts and releases a completed copy before rejecting epoch loss, without querying a freed prototype', () => withNativeOwners(owners => {
  const source = engine(owners), real = bodies.copyBodyShape; let released = 0, unsafeQueries = 0;
  const copy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => {
    const shape = real(value); releaseCount(shape, () => released++);
    Object.defineProperty(shape.wrapped, 'IsPartner', { configurable: true, value: () => { unsafeQueries++; throw Error('Freed prototype must not reach native IsPartner'); } });
    source.dispose(); return shape;
  });
  try { expect(() => source.placeCurrentAssemblyBody(REF, I)).toThrow('La geometría cambió'); }
  finally { copy.mockRestore(); }
  expect(released).toBe(1); expect(unsafeQueries).toBe(0);
}), 60_000);

it('adopts the raw placement before a builder callback revokes the source, without native partner queries', () => withNativeOwners(owners => {
  const source = engine(owners); let rawReleased = 0, unsafeQueries = 0;
  const failure = caught(() => placementFault(value => {
    if (builder(value)) {
      const typed = value as NativeOwner & { IsDone(): boolean }, done = typed.IsDone.bind(typed);
      Object.defineProperty(value, 'IsDone', { configurable: true, value: () => { const result = done(); source.dispose(); return result; } });
    } else if ('IsPartner' in value && 'IsNull' in value) {
      const remove = value.delete.bind(value);
      Object.defineProperty(value, 'IsPartner', { configurable: true, value: () => { unsafeQueries++; throw Error('Freed prototype must not reach raw partner query'); } });
      Object.defineProperty(value, 'delete', { configurable: true, value: () => { rawReleased++; remove(); } });
    }
  }, () => source.placeCurrentAssemblyBody(REF, I)));
  expect(failure).toBeInstanceOf(Error); expect((failure as Error).message).toContain('La geometría cambió');
  expect(rawReleased).toBe(1); expect(unsafeQueries).toBe(0);
}), 60_000);

it.each(['engine', 'owner'] as const)('withholds and releases the final pair if %s becomes invalid during native cleanup', state => withNativeOwners(owners => {
  const source = engine(owners), primary = new Error('Original owner invalidated during builder cleanup'); let closed = false, shapes = 0, released = 0, published: unknown;
  const guard = () => { if (closed) throw primary; };
  const failure = caught(() => placementFault(value => {
    if ('asShape3D' in value && 'wrapped' in value && ++shapes === 2) releaseCount(value as Shape3D, () => released++);
    if (builder(value)) {
      const remove = value.delete.bind(value);
      Object.defineProperty(value, 'delete', { configurable: true, value: () => { remove(); if (state === 'engine') source.dispose(); else closed = true; } });
    }
  }, () => { published = source.placeCurrentAssemblyBody(REF, I, guard); }));
  expect(published).toBeUndefined(); expect(shapes).toBe(2); expect(released).toBe(1);
  if (state === 'owner') expect(failure).toBe(primary); else expect((failure as Error).message).toContain('La geometría cambió');
}), 60_000);

it('preserves currentness and copy-release causes together and revokes further placement', () => withNativeOwners(owners => {
  const source = engine(owners), real = bodies.copyBodyShape, primary = Error('Original placement owner closed'), cleanup = Error('Original placement copy cleanup');
  let closed = false, released = 0, published: unknown;
  const copy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => {
    const result = real(value), raw = result.wrapped, remove = raw.delete.bind(raw);
    Object.defineProperty(raw, 'delete', { configurable: true, value: () => { released++; remove(); throw cleanup; } }); closed = true; return result;
  });
  let failure: unknown;
  try { failure = caught(() => { published = source.placeCurrentAssemblyBody(REF, I, () => { if (closed) throw primary; }); }); }
  finally { copy.mockRestore(); }
  expect(published).toBeUndefined(); expect(failure).toBeInstanceOf(NativeCleanupError); expect(errors(failure)).toContain(primary); expect(errors(failure)).toContain(cleanup); expect(released).toBe(1);
  expect(() => source.copyCurrentBodyShape(REF)).toThrow('reconstrucción completa');
}), 60_000);

it('releases the candidate and revokes the borrowed lease when its owner closes during copying', () => withNativeOwners(owners => {
  const source = engine(owners), real = bodies.copyBodyShape, primary = Error('Original enclosing owner closed'), failures: unknown[] = [];
  let alive = true, released = 0;
  const lease = source.borrowCurrentAssemblyInspection(() => { if (!alive) throw primary; }, error => failures.push(error));
  const copy = vi.spyOn(bodies, 'copyBodyShape').mockImplementation(value => { const result = real(value); releaseCount(result, () => released++); alive = false; return result; });
  try { expect(() => lease.placeCurrentAssemblyBody(REF, I)).toThrow(primary); } finally { copy.mockRestore(); }
  expect(released).toBe(1); expect(failures).toContain(primary); expect(() => lease.readCurrentAssemblyPresentation()).toThrow(primary);
}), 60_000);

it('adopts and releases a placed pair if the lease closes after engine delivery', () => withNativeOwners(owners => {
  const source = engine(owners), real = source.placeCurrentAssemblyBody.bind(source), primary = Error('Original owner closed before delivery'), failures: unknown[] = [];
  let alive = true, released = 0, published: unknown;
  const lease = source.borrowCurrentAssemblyInspection(() => { if (!alive) throw primary; }, error => failures.push(error));
  const place = vi.spyOn(source, 'placeCurrentAssemblyBody').mockImplementation((...args) => { const result = real(...args); releaseCount(result.shape, () => released++); alive = false; return result; });
  try { expect(() => { published = lease.placeCurrentAssemblyBody(REF, I); }).toThrow(primary); } finally { place.mockRestore(); }
  expect(published).toBeUndefined(); expect(released).toBe(1); expect(failures).toContain(primary);
}), 60_000);

it.each(['query', 'cleanup', 'query and cleanup'] as const)('retains native %s causes, withholds the pair and revokes the engine', fault => withNativeOwners(owners => {
  const source = engine(owners), primary = Error('Original placement builder query'), cleanup = Error('Original placement builder release');
  let shapes = 0, copyReleased = 0, resultReleased = 0, published: unknown;
  const failure = caught(() => placementFault(value => {
    if ('asShape3D' in value && 'wrapped' in value) { const first = ++shapes === 1; releaseCount(value as Shape3D, () => { if (first) copyReleased++; else resultReleased++; }); }
    if (builder(value)) {
      const typed = value as NativeOwner & { IsDone(): boolean }, done = typed.IsDone.bind(typed), remove = value.delete.bind(value);
      Object.defineProperty(value, 'IsDone', { configurable: true, value: () => { const result = done(); if (fault !== 'cleanup') throw primary; return result; } });
      Object.defineProperty(value, 'delete', { configurable: true, value: () => { remove(); if (fault !== 'query') throw cleanup; } });
    }
  }, () => { published = source.placeCurrentAssemblyBody(REF, I); }));
  expect(published).toBeUndefined(); expect(copyReleased).toBe(1); expect(resultReleased).toBe(fault === 'cleanup' ? 1 : 0);
  if (fault !== 'cleanup') expect(errors(failure)).toContain(primary); if (fault !== 'query') expect(errors(failure)).toContain(cleanup);
  expect(() => source.copyCurrentBodyShape(REF)).toThrow('reconstrucción completa');
}), 60_000);
