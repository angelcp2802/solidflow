import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { BoundingBox, cast, Curve, Edge, Face, Solid, SurfacePhysicalProperties, getOC, makeBox, makeCylinder,
  measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { createFaceCatalog, pickableFaces, resolveFaceReference, resolveSelectedFaces, type FaceCatalog } from './kernel.faces';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import { ownedNativeTopology } from './kernel.native-topology';
import type { Vec3 } from './kernel.types';

// Original analytic box/cylinder fixtures, created here with the real kernel.
// The key oracle uses Cartesian unit-cube faces and Node SHA-256, never the
// catalog's native inspection or naming helper. Faults adapt only received
// native instances, delegate real queries/releases, and do not supply geometry.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const TOP = 'Native face catalog construction or release failed.';
const FRAME = 'Native face frame query or release failed.';
const SAMPLE = 'Native face edge sample query or release failed.';
const PICKABLE = 'Native pickable faces query or release failed.';
const V = 1e-5, B = 1e-6;

function captured(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } return undefined; }
function ownCatalog(owners: NativeOwners, catalog: FaceCatalog): FaceCatalog {
  owners.own({ delete: () => catalog.dispose() }); return catalog;
}
function expectGeometry(shape: Shape3D, volume: number, area: number, minimum: Vec3, maximum: Vec3): void {
  withNativeOwners(owners => {
    expect(owners.own(new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false)).IsValid()).toBe(true);
    expect(owners.ownAll(ownedNativeTopology(shape, 'solid')).length).toBe(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(V);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(V);
    owners.own(shape.boundingBox).bounds.forEach((side, i) => side.forEach((x, axis) =>
      expect(Math.abs(x - [minimum, maximum][i][axis])).toBeLessThan(B)));
  });
}
function expectBox(shape: Shape3D): void { expectGeometry(shape, 24, 52, [0, 0, 0], [2, 3, 4]); }
function expectVector(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, axis) => expect(Math.abs(value - expected[axis])).toBeLessThan(B));
}

/** Six mathematical unit-cube sides; no native topology enumeration is used. */
function analyticBoxFaces(lineage: string) {
  const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const sorted = (values: unknown[]) => values.map(value => JSON.stringify(value)).sort(textOrder);
  const topology = [6, 12, 1, [['PLANE', 6]], [['LINE', 12]]];
  return [0, 1, 2].flatMap(axis => [0, 1].map(side => {
    const free = [0, 1, 2].filter(index => index !== axis);
    const point = (u: number, v: number): Vec3 => {
      const value: Vec3 = [0, 0, 0]; value[axis] = side; value[free[0]] = u; value[free[1]] = v; return value;
    };
    const edges: [Vec3, Vec3][] = [[point(0, 0), point(1, 0)], [point(1, 0), point(1, 1)],
      [point(1, 1), point(0, 1)], [point(0, 1), point(0, 0)]];
    const boundary = edges.map(([a, b]) => ['LINE', false,
      [a.map((value, i) => Math.min(value, b[i])), a.map((value, i) => Math.max(value, b[i]))],
      sorted([a, a.map((value, i) => (value + b[i]) / 2), b])]);
    const normal: Vec3 = [0, 0, 0]; normal[axis] = side ? 1 : -1;
    const xDirection: Vec3 = axis === 0 ? [0, 1, 0] : [1, 0, 0];
    const descriptor = [lineage, topology, 'PLANE', normal, xDirection,
      [point(0, 0), point(1, 1)], point(.5, .5), 1, sorted(boundary)];
    const key = 'face-v1|' + createHash('sha256').update(JSON.stringify(descriptor)).digest('hex');
    return { key, axis, side, normal, xDirection, area: [12, 8, 6][axis] };
  }));
}

interface Observation { value: NativeOwner; context: string | undefined; releases: number }
interface FaultOptions {
  patch?: (value: NativeOwner, context: string | undefined) => void;
  afterOwn?: (value: NativeOwner, context: string | undefined) => void;
  afterRetained?: (values: readonly NativeOwner[], context: string | undefined) => void;
}
/** Observe/adapt instances only in the actual catalog-owned native arenas. */
function inspect<T>(observations: Observation[], options: FaultOptions, operation: () => T): T {
  const real = ownership.withNativeOwners, seen = new Set<NativeOwner>();
  const replacement: typeof ownership.withNativeOwners = <R>(action: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      const own = owners.own.bind(owners);
      owners.own = <S extends NativeOwner>(value: S): S => {
        if ((context?.startsWith('Native face ') || context === PICKABLE) && !seen.has(value)) {
          seen.add(value);
          const observation: Observation = { value, context, releases: 0 };
          observations.push(observation);
          options.patch?.(value, context);
          const release = value.delete.bind(value);
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { observation.releases++; release(); } });
        }
        const result = own(value); options.afterOwn?.(value, context); return result;
      };
      return action(owners);
    }, result => {
      const values = retained(result); options.afterRetained?.(values, context); return values;
    }, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return operation(); } finally { spy.mockRestore(); }
}
function realBoundsFailure(box: BoundingBox, primary: Error, queried: () => void): void {
  const getter = Object.getOwnPropertyDescriptor(BoundingBox.prototype, 'bounds')?.get;
  if (!getter) throw new Error('The native bounding box getter is required.');
  Object.defineProperty(box, 'bounds', { configurable: true, get: () => { getter.call(box); queried(); throw primary; } });
}
function realReleaseFailure(value: NativeOwner, failure: Error): void {
  const release = value.delete.bind(value);
  Object.defineProperty(value, 'delete', { configurable: true, value: () => { release(); throw failure; } });
}
function expectReleasedOnce(observations: readonly Observation[], source: Shape3D): void {
  expect(observations.length).toBeGreaterThan(0); expect(observations.some(item => item.value === source)).toBe(false);
  observations.forEach(item => expect(item.releases).toBe(1));
}
function expectFrameOwners(observed: readonly Observation[], count: number): void {
  const oc = getOC(), frames = observed.filter(item => item.context === FRAME);
  expect(frames).toHaveLength(5 * count);
  expect(frames.filter(item => item.value instanceof oc.gp_Pnt)).toHaveLength(2 * count);
  expect(frames.filter(item => item.value instanceof oc.gp_Vec)).toHaveLength(count);
  expect(frames.filter(item => item.value instanceof oc.BRepGProp_Face)).toHaveLength(count);
  expect(frames.filter(item => item.value instanceof oc.BRepAdaptor_Surface)).toHaveLength(count);
  frames.forEach(item => expect(item.releases).toBe(1));
}

for (const lineage of ['', 'original-cartesian-box-lineage']) it('preserves analytic box keys, frames and exact borrowed picking for lineage ' + JSON.stringify(lineage), () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4]));
  const catalog = ownCatalog(owners, createFaceCatalog(source, 'original-box', lineage)), expected = analyticBoxFaces(lineage);
  expect(catalog.entries.map(entry => entry.ref.key).sort()).toEqual(expected.map(entry => entry.key).sort());
  for (const side of expected) {
    const reference = { sourceFeatureId: 'original-box', key: side.key };
    const selected = resolveSelectedFaces(catalog, [reference], 'original-box');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(catalog.entries.find(entry => entry.ref.key === side.key)?.face);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(selected[0])).area - side.area)).toBeLessThan(V);
    const frame = resolveFaceReference(catalog, reference, 'original-box');
    const origin: Vec3 = [0, 0, 0]; origin[side.axis] = side.side * [2, 3, 4][side.axis];
    expectVector(frame.origin, origin); expectVector(frame.normal, side.normal); expectVector(frame.xDirection, side.xDirection);
  }
  expect(() => resolveSelectedFaces(catalog, [catalog.entries[0].ref], 'stale-source')).toThrow(/otro sólido/);
  expectBox(source);
}), 60_000);

it('keeps pickable renderer references and actual vertices on the independently known box support planes', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), expected = analyticBoxFaces('');
  const pickable = pickableFaces(source, 'original-box'); expect(pickable).toHaveLength(6);
  for (const side of expected) {
    const entry = pickable.find(face => face.ref.key === side.key);
    if (!entry) throw new Error('The Cartesian face key must remain pickable.');
    expect(entry.ref.sourceFeatureId).toBe('original-box'); expect(entry.triangles.length).toBeGreaterThan(0);
    expect(entry.vertices.length).toBeGreaterThan(0); expect(entry.vertices.length % 3).toBe(0);
    for (let i = side.axis; i < entry.vertices.length; i += 3)
      expect(Math.abs(entry.vertices[i] - side.side * [2, 3, 4][side.axis])).toBeLessThan(B);
  }
  expectBox(source);
}), 60_000);

it('retains the real cylindrical side and two planar caps through closed-edge sampling', () => withNativeOwners(owners => {
  const source = owners.own(makeCylinder(2, 3)), catalog = ownCatalog(owners, createFaceCatalog(source, 'original-cylinder'));
  expect(catalog.entries).toHaveLength(3);
  expect(catalog.entries.filter(entry => entry.face.geomType === 'CYLINDRE' && entry.frame === null)).toHaveLength(1);
  const caps = catalog.entries.filter(entry => entry.frame !== null); expect(caps).toHaveLength(2);
  expect(caps.map(entry => entry.frame!.normal[2]).sort()).toEqual([-1, 1]);
  for (const entry of catalog.entries) expect(resolveSelectedFaces(catalog, [entry.ref], 'original-cylinder')[0]).toBe(entry.face);
  expectGeometry(source, 12 * Math.PI, 20 * Math.PI, [-2, -2, 0], [2, 2, 3]);
}), 60_000);

it('transfers only faces after successful temporary cleanup and releases every received wrapper once', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [];
  inspect(observed, {}, () => {
    const catalog = ownCatalog(owners, createFaceCatalog(source, 'original-box'));
    const faces = observed.filter(item => item.context === TOP && item.value instanceof Face);
    expect(faces).toHaveLength(6);
    observed.forEach(item => expect(item.releases).toBe(faces.includes(item) ? 0 : 1));
    expectFrameOwners(observed, 6);
    catalog.dispose(); catalog.dispose();
  });
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('cleans every earlier array wrapper when the real top bounds query fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], primary = new Error('Original top bounds query failure');
  let queried = 0;
  const error = captured(() => inspect(observed, { patch: (value, context) => {
    if (context === TOP && value instanceof BoundingBox) realBoundsFailure(value, primary, () => { queried++; });
  } }, () => createFaceCatalog(source, 'original-box')));
  expect(error).toBe(primary); expect(queried).toBe(1);
  expect(observed.filter(item => item.value instanceof Face)).toHaveLength(6);
  expect(observed.filter(item => item.value instanceof Edge)).toHaveLength(12);
  expect(observed.filter(item => item.value instanceof Solid)).toHaveLength(1);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

for (const context of [FRAME, SAMPLE]) it('preserves a real native tuple query failure and cleans acquired temporaries in ' + context, () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], primary = new Error('Original native tuple query failure');
  let patched = false, queried = 0, framePoints = 0;
  const error = captured(() => inspect(observed, { patch: (value, arena) => {
    if (patched || arena !== context) return;
    if (context === FRAME && value instanceof getOC().gp_Pnt && ++framePoints === 2) {
      patched = true; const query = value.X.bind(value);
      Object.defineProperty(value, 'X', { configurable: true, value: () => { query(); queried++; throw primary; } });
    } else if (context === SAMPLE && value instanceof getOC().gp_Pnt) {
      patched = true; const query = value.X.bind(value);
      Object.defineProperty(value, 'X', { configurable: true, value: () => { query(); queried++; throw primary; } });
    }
  } }, () => createFaceCatalog(source, 'original-box')));
  expect(error).toBe(primary); expect(queried).toBe(1);
  expectFrameOwners(observed, 1);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('withholds all otherwise complete faces when a real temporary box release fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], cleanup = new Error('Original top box release failure');
  const error = captured(() => inspect(observed, { patch: (value, context) => {
    if (context === TOP && value instanceof BoundingBox) realReleaseFailure(value, cleanup);
  } }, () => createFaceCatalog(source, 'original-box')));
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as Error).cause).toBe(cleanup);
  expect([...(error as AggregateError).errors]).toEqual([cleanup]);
  expectFrameOwners(observed, 6);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('preserves the primary and multiple physical release failures while attempting the remaining owners', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [];
  const primary = new Error('Original top query primary'), boxFailure = new Error('Original box cleanup'), edgeFailure = new Error('Original edge cleanup');
  let edgePatched = false, queried = 0;
  const error = captured(() => inspect(observed, { patch: (value, context) => {
    if (context !== TOP) return;
    if (value instanceof BoundingBox) { realBoundsFailure(value, primary, () => { queried++; }); realReleaseFailure(value, boxFailure); }
    if (!edgePatched && value instanceof Edge) { edgePatched = true; realReleaseFailure(value, edgeFailure); }
  } }, () => createFaceCatalog(source, 'original-box')));
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as Error).cause).toBe(primary);
  expect([...(error as AggregateError).errors]).toEqual([primary, boxFailure, edgeFailure]); expect(queried).toBe(1);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('attempts every transferred face once on dispose despite two real native release failures', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [];
  const first = new Error('Original first face cleanup'), second = new Error('Original second face cleanup'); let faces = 0;
  inspect(observed, { patch: (value, context) => {
    if (context === TOP && value instanceof Face && faces++ < 2) realReleaseFailure(value, faces === 1 ? first : second);
  } }, () => {
    const catalog = ownCatalog(owners, createFaceCatalog(source, 'original-box'));
    const error = captured(() => catalog.dispose());
    expect(error).toBeInstanceOf(NativeCleanupError); expect((error as Error).cause).toBe(second);
    expect([...(error as AggregateError).errors]).toEqual([second, first]);
    expect(() => catalog.dispose()).not.toThrow();
  });
  expect(observed.filter(item => item.context === TOP && item.value instanceof Face)).toHaveLength(6);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('adopts and retires the complete received face array after one registration reports failure', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], primary = new Error('Original face registration failure');
  let registeredFaces = 0;
  const error = captured(() => inspect(observed, { afterOwn: (value, context) => {
    if (context === TOP && value instanceof Face && ++registeredFaces === 2) throw primary;
  } }, () => createFaceCatalog(source, 'original-box')));
  expect(error).toBe(primary); expect(registeredFaces).toBe(6); expect(observed).toHaveLength(6);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('does not leak the completed faces if declaring the owned transfer result fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], primary = new Error('Original retained-result failure');
  let retainedFaces = 0;
  const error = captured(() => inspect(observed, { afterRetained: (values, context) => {
    if (context === TOP) { retainedFaces = values.filter(value => value instanceof Face).length; throw primary; }
  } }, () => createFaceCatalog(source, 'original-box')));
  expect(error).toBe(primary); expect(retainedFaces).toBe(6);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('preserves a real mesh-query primary together with catalog cleanup failure in the pickable consumer', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [];
  const primary = new Error('Original face mesh query failure'), cleanup = new Error('Original pickable face cleanup');
  let patched = false, queried = 0;
  const error = captured(() => inspect(observed, { patch: (value, context) => {
    if (patched || context !== TOP || !(value instanceof Face)) return;
    patched = true; realReleaseFailure(value, cleanup); const mesh = value.mesh.bind(value);
    const replacement: typeof value.mesh = options => { mesh(options); queried++; throw primary; };
    Object.defineProperty(value, 'mesh', { configurable: true, value: replacement });
  } }, () => pickableFaces(source, 'original-box')));
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as Error).cause).toBe(primary);
  const errors = [...(error as AggregateError).errors]; expect(errors).toHaveLength(2); expect(errors[0]).toBe(primary);
  expect(errors[1]).toBeInstanceOf(NativeCleanupError); expect([...(errors[1] as AggregateError).errors]).toEqual([cleanup]);
  expect(queried).toBe(1); expect(observed.filter(item => item.context === PICKABLE)).toHaveLength(1);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it('owns every descriptor curve, sample point and center point without hidden convenience allocations while preserving Cartesian keys', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [];
  inspect(observed, { patch: value => {
    const forbidden = () => { throw new Error('A descriptor used an allocating convenience getter.'); };
    if (value instanceof Edge) {
      for (const name of ['geomType', 'isClosed']) Object.defineProperty(value, name, { configurable: true, get: forbidden });
      Object.defineProperty(value, 'pointAt', { configurable: true, value: forbidden });
    }
    if (value instanceof Curve) Object.defineProperty(value, 'pointAt', { configurable: true, value: forbidden });
    if (value instanceof SurfacePhysicalProperties) Object.defineProperty(value, 'centerOfMass', { configurable: true, get: forbidden });
  } }, () => {
    const catalog = ownCatalog(owners, createFaceCatalog(source, 'original-owned-box'));
    expect(catalog.entries.map(entry => entry.ref.key).sort()).toEqual(analyticBoxFaces('').map(entry => entry.key).sort());
    expect(observed.filter(item => item.value instanceof Curve)).toHaveLength(36);
    expect(observed.filter(item => item.context === SAMPLE && item.value instanceof getOC().gp_Pnt)).toHaveLength(72);
    expect(observed.filter(item => item.context === 'Native face descriptor query or release failed.' && item.value instanceof getOC().gp_Pnt)).toHaveLength(6);
    catalog.dispose();
  });
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it.each(['topology curve', 'boundary curve', 'center point'] as const)(
  'preserves a real %s query failure and releases its explicitly owned native value', kind => withNativeOwners(owners => {
    const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], primary = new Error('Original explicit descriptor query failure');
    let queried = 0, patched = false;
    const failure = captured(() => inspect(observed, { patch: (value, context) => {
      if (patched) return;
      if (kind === 'center point' && context === 'Native face descriptor query or release failed.' && value instanceof getOC().gp_Pnt) {
        patched = true; const query = value.X.bind(value);
        Object.defineProperty(value, 'X', { configurable: true, value: () => { query(); queried++; throw primary; } });
      } else if (kind !== 'center point' && value instanceof Curve && context === (kind === 'topology curve'
        ? 'Native face topology edge query or release failed.' : 'Native face boundary query or release failed.')) {
        patched = true; const getter = Object.getOwnPropertyDescriptor(Curve.prototype, 'curveType')!.get!;
        Object.defineProperty(value, 'curveType', { configurable: true, get: () => { getter.call(value); queried++; throw primary; } });
      }
    } }, () => createFaceCatalog(source, 'original-box')));
    expect(failure).toBe(primary); expect(queried).toBe(1); expectReleasedOnce(observed, source); expectBox(source);
  }), 60_000);

it.each(['curve', 'center point'] as const)(
  'withholds the catalog and releases all received owners after its real %s release reports failure', kind => withNativeOwners(owners => {
    const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], cleanup = new Error('Original explicit descriptor release failure');
    let patched = false;
    const failure = captured(() => inspect(observed, { patch: (value, context) => {
      if (patched || context !== (kind === 'curve' ? 'Native face boundary query or release failed.' : 'Native face descriptor query or release failed.')) return;
      if (kind === 'curve' ? value instanceof Curve : value instanceof getOC().gp_Pnt) { patched = true; realReleaseFailure(value, cleanup); }
    } }, () => createFaceCatalog(source, 'original-box')));
    expect(failure).toBeInstanceOf(NativeCleanupError); expect((failure as Error).cause).toBe(cleanup);
    expect([...(failure as AggregateError).errors]).toEqual([cleanup]); expectReleasedOnce(observed, source); expectBox(source);
  }), 60_000);

it.each(['Normal', 'D0'] as const)('drains the actual frame owners after the native %s query runs and then throws', queryKind => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], primary = new Error('Original frame ' + queryKind + ' failure');
  let patched = false, queried = 0, catalog: FaceCatalog | undefined;
  const failure = captured(() => inspect(observed, { patch: (value, context) => {
    if (patched || context !== FRAME) return;
    if (queryKind === 'Normal' && value instanceof getOC().BRepGProp_Face) {
      patched = true; const query = value.Normal.bind(value);
      const replacement: typeof value.Normal = (...args) => { query(...args); queried++; throw primary; };
      Object.defineProperty(value, 'Normal', { configurable: true, value: replacement });
    } else if (queryKind === 'D0' && value instanceof getOC().BRepAdaptor_Surface) {
      patched = true; const query = value.D0.bind(value);
      const replacement: typeof value.D0 = (...args) => { query(...args); queried++; throw primary; };
      Object.defineProperty(value, 'D0', { configurable: true, value: replacement });
    }
  } }, () => { catalog = createFaceCatalog(source, 'original-query-box'); }));
  expect(failure).toBe(primary); expect(queried).toBe(1); expect(catalog).toBeUndefined();
  expect(observed.filter(item => item.context === FRAME)).toHaveLength(queryKind === 'Normal' ? 3 : 5);
  expectReleasedOnce(observed, source); expectBox(source);
}), 60_000);

it.each(['normal point', 'normal vector', 'normal query', 'point adaptor', 'surface point'] as const)(
  'withholds the catalog and drains every frame owner when the physical %s deletion reports failure', kind => withNativeOwners(owners => {
    const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), observed: Observation[] = [], cleanup = new Error('Original frame ' + kind + ' cleanup');
    const index = ['normal point', 'normal vector', 'normal query', 'point adaptor', 'surface point'].indexOf(kind);
    let received = 0, patched = false, catalog: FaceCatalog | undefined;
    const failure = captured(() => inspect(observed, { patch: (value, context) => {
      if (patched || context !== FRAME) return;
      if (received++ === index) { patched = true; realReleaseFailure(value, cleanup); }
    } }, () => { catalog = createFaceCatalog(source, 'original-release-box'); }));
    expect(patched).toBe(true); expect(catalog).toBeUndefined();
    expect(failure).toBeInstanceOf(NativeCleanupError); expect((failure as Error).cause).toBe(cleanup);
    expect([...(failure as AggregateError).errors]).toEqual([cleanup]);
    expectFrameOwners(observed, 1); expectReleasedOnce(observed, source); expectBox(source);
  }), 60_000);

type Matrix = [number, number, number, number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1], QUARTER: Matrix = [0, -1, 0, 1, 0, 0, 0, 0, 1],
  OBLIQUE: Matrix = [2 / 3, -1 / 3, 2 / 3, 2 / 3, 2 / 3, -1 / 3, -1 / 3, 2 / 3, 2 / 3], SHIFT: Vec3 = [7, -5, 11];
/** Original box corners, transformed with explicit matrices, supply every
 * support and descriptor input. No native frame/descriptor helper is an oracle. */
function mappedBoxFaces(matrix: Matrix, reversed: boolean) {
  const map = (p: Vec3): Vec3 => [0, 1, 2].map(row => SHIFT[row]
    + matrix[3 * row] * p[0] + matrix[3 * row + 1] * p[1] + matrix[3 * row + 2] * p[2]) as Vec3;
  const corners = [0, 2].flatMap(x => [0, 3].flatMap(y => [0, 4].map(z => map([x, y, z]))));
  const minimum = [0, 1, 2].map(axis => Math.min(...corners.map(p => p[axis]))) as Vec3,
    maximum = [0, 1, 2].map(axis => Math.max(...corners.map(p => p[axis]))) as Vec3;
  const round = (value: number) => Math.round(value * 1e8) / 1e8 || 0,
    normalized = (p: Vec3) => p.map((value, axis) => round((value - minimum[axis]) / (maximum[axis] - minimum[axis]))),
    sorted = (values: unknown[]) => values.map(value => JSON.stringify(value)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const sides = [0, 1, 2].flatMap(axis => [0, 1].map(side => {
    const free = [0, 1, 2].filter(i => i !== axis), dimensions = [2, 3, 4];
    const point = (u: number, v: number): Vec3 => {
      const p: Vec3 = [0, 0, 0]; p[axis] = side * dimensions[axis]; p[free[0]] = u * dimensions[free[0]]; p[free[1]] = v * dimensions[free[1]];
      return map(p);
    };
    const points = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)], center = point(.5, .5),
      low = [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))) as Vec3,
      high = [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) as Vec3;
    const sign = (side ? 1 : -1) * (reversed ? -1 : 1), directed = [0, 1, 2].map(i => sign * matrix[3 * i + axis]),
      normal = directed.map(value => value / Math.hypot(...directed)) as Vec3;
    let projection = [1 - normal[0] * normal[0], -normal[0] * normal[1], -normal[0] * normal[2]];
    if (Math.hypot(...projection) < 1e-6) projection = [-normal[1] * normal[0], 1 - normal[1] * normal[1], -normal[1] * normal[2]];
    const xDirection = projection.map(value => value / Math.hypot(...projection)),
      offset = normal.reduce((sum, value, i) => sum + value * center[i], 0), origin = normal.map(value => value * offset);
    const boundary = points.map((a, i) => {
      const b = points[(i + 1) % 4], lowEdge = a.map((value, j) => Math.min(value, b[j])) as Vec3,
        highEdge = a.map((value, j) => Math.max(value, b[j])) as Vec3;
      return ['LINE', false, [normalized(lowEdge), normalized(highEdge)],
        sorted([normalized(a), normalized(a.map((value, j) => (value + b[j]) / 2) as Vec3), normalized(b)])];
    });
    const descriptor = ['', [6, 12, 1, [['PLANE', 6]], [['LINE', 12]]], 'PLANE', normal.map(round), xDirection.map(round),
      [normalized(low), normalized(high)], normalized(center), 1, sorted(boundary)];
    return { normal, xDirection, origin, key: 'face-v1|' + createHash('sha256').update(JSON.stringify(descriptor)).digest('hex') };
  }));
  return { sides, minimum, maximum };
}

it.each([{ name: 'translated', matrix: IDENTITY, reversed: false }, { name: 'quarter-turn', matrix: QUARTER, reversed: false },
  { name: 'native-reversed', matrix: IDENTITY, reversed: true }, { name: 'oblique', matrix: OBLIQUE, reversed: false }])(
  'preserves independent original $name box frames, descriptor keys and physical geometry', ({ matrix, reversed }) => withNativeOwners(owners => {
    const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), oc = getOC(), transform = owners.own(new oc.gp_Trsf());
    transform.SetValues(matrix[0], matrix[1], matrix[2], SHIFT[0], matrix[3], matrix[4], matrix[5], SHIFT[1], matrix[6], matrix[7], matrix[8], SHIFT[2]);
    const builder = owners.own(new oc.BRepBuilderAPI_Transform(source.wrapped, transform, true, false));
    expect(builder.IsDone()).toBe(true);
    const raw = owners.own(builder.Shape()), placed = owners.own(cast(raw)).asShape3D(), expected = mappedBoxFaces(matrix, reversed);
    const catalogShape = reversed ? owners.own(cast(owners.own(placed.wrapped.Reversed()))).asShape3D() : placed;
    const observed: Observation[] = [];
    inspect(observed, {}, () => {
      const catalog = ownCatalog(owners, createFaceCatalog(catalogShape, 'original-mapped-box'));
      expect(catalog.entries.map(entry => entry.ref.key).sort()).toEqual(expected.sides.map(side => side.key).sort());
      for (const side of expected.sides) {
        const entry = catalog.entries.find(value => value.ref.key === side.key);
        if (!entry?.frame) throw new Error('Original transformed plane reference required.');
        expectVector(entry.frame.normal, side.normal); expectVector(entry.frame.xDirection, side.xDirection); expectVector(entry.frame.origin, side.origin);
      }
      expectFrameOwners(observed, 6); catalog.dispose();
    });
    expectReleasedOnce(observed, catalogShape);
    expectGeometry(placed, 24, 52, expected.minimum, expected.maximum); expectBox(source);
    if (reversed) {
      // This is an actual reversed native wrapper, not a positive-volume body
      // admission claim. Its outward source remains valid and independent.
      expect(Math.abs(owners.own(measureShapeVolumeProperties(catalogShape)).volume + 24)).toBeLessThan(V);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(catalogShape)).area - 52)).toBeLessThan(V);
      owners.own(catalogShape.boundingBox).bounds.forEach((side, i) => expectVector(side, [expected.minimum, expected.maximum][i]));
    }
  }), 60_000);
