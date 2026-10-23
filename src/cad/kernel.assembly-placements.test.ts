import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade, { type TopoDS_Solid } from 'replicad-opencascadejs';
import { cast, getOC, makeBox, makeCylinder, measureShapeSurfaceProperties, measureShapeVolumeProperties,
  setOC, Solid, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { createDocument, serializeDocument, validateDocument } from '../model/document';
import { composeRigidPoses, type RigidPose } from '../model/rigidPose';
import { placeAssemblyBody } from './kernel.assembly-placements';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import * as bodies from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import type { Feature, Vec3 } from './kernel.types';

// Original issue45 analytical parts, in mm; no imported model or placement
// helper supplies an oracle. Plate40×30×4 with two through holes R3 at±10X.
// PinR2×12 with a through bore R.25 at(1,0): a physical spin discriminator.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const IDENTITY: RigidPose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
const H = Math.SQRT1_2, VP = 4800 - 72 * Math.PI, AP = 2960 + 12 * Math.PI,
  VN = 189 * Math.PI / 4, AN = 495 * Math.PI / 8;
function parts(owners: NativeOwners) {
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
  const features: Feature[] = [
    { id: 'plate-profile', type: 'sketch', name: 'Original plate rectangle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [0, 0], width: 40, height: 30 } },
    { id: 'plate-create', type: 'extrude', name: 'Original plate', suppressed: false, sketchId: 'plate-profile', depth: 4,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'plate' } },
    { id: 'plate-left-profile', type: 'sketch', name: 'Original left hole', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [-10, 0], radius: 3 } },
    { id: 'plate-left', type: 'cut', name: 'Original left through hole', suppressed: false, sketchId: 'plate-left-profile', depth: 4,
      symmetric: false, bodyScope: [{ bodyId: 'plate', sourceFeatureId: 'plate-create' }] },
    { id: 'plate-right-profile', type: 'sketch', name: 'Original right hole', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [10, 0], radius: 3 } },
    { id: 'plate-right', type: 'cut', name: 'Original right through hole', suppressed: false, sketchId: 'plate-right-profile', depth: 4,
      symmetric: false, bodyScope: [{ bodyId: 'plate', sourceFeatureId: 'plate-left' }] },
    { id: 'pin-profile', type: 'sketch', name: 'Original pin circle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'pin-create', type: 'extrude', name: 'Original pin', suppressed: false, sketchId: 'pin-profile', depth: 12,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'pin' } },
    { id: 'bore-profile', type: 'sketch', name: 'Original eccentric bore', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [1, 0], radius: .25 } },
    { id: 'pin-bore', type: 'cut', name: 'Original eccentric through bore', suppressed: false, sketchId: 'bore-profile', depth: 12,
      symmetric: false, bodyScope: [{ bodyId: 'pin', sourceFeatureId: 'pin-create' }] },
  ];
  const value = validateDocument({ ...createDocument('Original assembly placement parts'), features }), saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true); expect(result.bodies).toHaveLength(2);
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog,
    plate = catalog.resolve({ bodyId: 'plate', sourceFeatureId: 'plate-right' }).shape,
    pin = catalog.resolve({ bodyId: 'pin', sourceFeatureId: 'pin-bore' }).shape;
  return { plate, pin, assertOriginal: () => {
    expect(serializeDocument(value)).toBe(saved); expect(catalog.resolve({ bodyId: 'plate', sourceFeatureId: 'plate-right' }).shape).toBe(plate);
    expect(catalog.resolve({ bodyId: 'pin', sourceFeatureId: 'pin-bore' }).shape).toBe(pin);
    metrics(plate, VP, AP, [-20, -15, 0], [20, 15, 4]); metrics(pin, VN, AN, [-2, -2, 0], [2, 2, 12]);
    probe(plate, [-10, 0, 2], false); probe(plate, [10, 0, 2], false); probe(plate, [0, 0, 2], true);
    probe(pin, [1, 0, 6], false); probe(pin, [0, 1, 6], true);
  } };
}
function metrics(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    validateBodyShape(shape); expect(owners.ownAll(shape.solids)).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((x, j) => expect(Math.abs(bounds[i][j] - x)).toBeLessThan(1e-6)));
  });
}
function probe(shape: Shape3D, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .05) as Vec3, center.map(x => x + .05) as Vec3)),
      common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .001 : 0))).toBeLessThan(1e-8);
  });
}
function independent(a: Shape3D, b: Shape3D): void {
  expect(a).not.toBe(b); expect(a.wrapped.IsPartner(b.wrapped)).toBe(false);
  withNativeOwners(owners => {
    const left = owners.ownAll(a.faces), right = owners.ownAll(b.faces);
    expect(left.every(face => right.every(other => !face.wrapped.IsPartner(other.wrapped)))).toBe(true);
  });
}
function compound(owners: NativeOwners, shapes: readonly Shape3D[]): Shape3D {
  const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound());
  builder.MakeCompound(raw); shapes.forEach(shape => builder.Add(raw, shape.wrapped)); return owners.own(cast(raw)).asShape3D();
}

it('places the original plate at identity with independent solid and face topology', () => withNativeOwners(owners => {
  const source = parts(owners), placed = owners.own(placeAssemblyBody(source.plate, IDENTITY));
  independent(placed, source.plate); metrics(placed, VP, AP, [-20, -15, 0], [20, 15, 4]);
  probe(placed, [-10, 0, 2], false); probe(placed, [10, 0, 2], false); probe(placed, [0, 0, 2], true); source.assertOriginal();
}), 60_000);
it('keeps plate and two independently owned pins as separate occurrences without fusion', () => withNativeOwners(owners => {
  const source = parts(owners), plate = owners.own(placeAssemblyBody(source.plate, IDENTITY)),
    left = owners.own(placeAssemblyBody(source.pin, { translation: [-10, 0, -8], rotation: [0, 0, 0, 1] })),
    right = owners.own(placeAssemblyBody(source.pin, { translation: [10, 0, -8], rotation: [0, 0, 0, 1] }));
  for (const [pin, x] of [[left, -10], [right, 10]] as const) {
    metrics(pin, VN, AN, [x - 2, -2, -8], [x + 2, 2, 4]); independent(pin, source.pin);
    const common = owners.own(bodyBoolean('common', plate, pin)); expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume)).toBeLessThan(1e-8);
  }
  independent(left, right);
  const scene = compound(owners, [plate, left, right]); expect(owners.ownAll(scene.solids)).toHaveLength(3);
  expect(Math.abs(owners.own(measureShapeVolumeProperties(scene)).volume - (4800 + 45 * Math.PI / 2))).toBeLessThan(1e-5);
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(scene)).area - (2960 + 543 * Math.PI / 4))).toBeLessThan(1e-5);
  owners.release(left); metrics(right, VN, AN, [8, -2, -8], [12, 2, 4]); source.assertOriginal();
}), 60_000);
it('spins the physical eccentric bore ninety degrees without changing the source or another instance', () => withNativeOwners(owners => {
  const source = parts(owners), fixed = owners.own(placeAssemblyBody(source.pin, { translation: [-10, 0, -8], rotation: [0, 0, 0, 1] })),
    spun = owners.own(placeAssemblyBody(source.pin, { translation: [-10, 0, -8], rotation: [0, 0, H, H] }));
  independent(spun, fixed); metrics(spun, VN, AN, [-12, -2, -8], [-8, 2, 4]);
  probe(fixed, [-9, 0, -2], false); probe(fixed, [-10, 1, -2], true);
  probe(spun, [-9, 0, -2], true); probe(spun, [-10, 1, -2], false); source.assertOriginal();
}), 60_000);
it('uses row-major R·p+t for a translated quarter-turn plate and its two holes', () => withNativeOwners(owners => {
  const source = parts(owners), pose: RigidPose = { translation: [5, -7, 2], rotation: [0, 0, H, H] }, savedPose = JSON.stringify(pose),
    placed = owners.own(placeAssemblyBody(source.plate, pose));
  metrics(placed, VP, AP, [-10, -27, 2], [20, 13, 6]); probe(placed, [5, -17, 4], false); probe(placed, [5, 3, 4], false); probe(placed, [5, -7, 4], true);
  expect(JSON.stringify(pose)).toBe(savedPose); source.assertOriginal();
}), 60_000);
it('places the pin on a different physical axis with an X quarter-turn', () => withNativeOwners(owners => {
  const source = parts(owners), placed = owners.own(placeAssemblyBody(source.pin, { translation: [7, 8, 9], rotation: [H, 0, 0, H] }));
  metrics(placed, VN, AN, [5, -4, 7], [9, 8, 11]); probe(placed, [8, 2, 9], false); probe(placed, [7, 2, 10], true); source.assertOriginal();
}), 60_000);
it('matches sequential native parent/local placement to noncommuting composed rigid poses', () => withNativeOwners(owners => {
  const source = parts(owners), parent: RigidPose = { translation: [10, -2, 1], rotation: [0, 0, H, H] },
    local: RigidPose = { translation: [3, 4, -8], rotation: [H, 0, 0, H] },
    first = owners.own(placeAssemblyBody(source.pin, local)), sequential = owners.own(placeAssemblyBody(first, parent)),
    composed = owners.own(placeAssemblyBody(source.pin, composeRigidPoses(parent, local)));
  // Independent Cartesian map (x,y,z)→(z+6,x+1,y−7), not an expected matrix from the helper.
  for (const shape of [sequential, composed]) {
    metrics(shape, VN, AN, [6, -1, -9], [18, 3, -5]); probe(shape, [12, 2, -7], false); probe(shape, [12, 1, -6], true);
  }
  independent(sequential, composed); source.assertOriginal();
}), 60_000);
it('does not collapse coincident placements or share their native topology', () => withNativeOwners(owners => {
  const source = parts(owners), first = owners.own(placeAssemblyBody(source.pin, IDENTITY)), second = owners.own(placeAssemblyBody(source.pin, IDENTITY));
  independent(first, second); const scene = compound(owners, [first, second]); expect(owners.ownAll(scene.solids)).toHaveLength(2);
  expect(Math.abs(owners.own(measureShapeVolumeProperties(scene)).volume - 2 * VN)).toBeLessThan(1e-5);
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(scene)).area - 2 * AN)).toBeLessThan(1e-5); source.assertOriginal();
}), 60_000);
it('keeps the owned occurrence valid after its source engine and prototype owners are disposed', () => withNativeOwners(owners => {
  const placed = owners.own(withNativeOwners(local => {
    const source = parts(local); return local.own(placeAssemblyBody(source.pin, { translation: [10, 0, -8], rotation: [0, 0, H, H] }));
  }, result => [result]));
  metrics(placed, VN, AN, [8, -2, -8], [12, 2, 4]); probe(placed, [10, 1, -2], false); probe(placed, [11, 0, -2], true);
}), 60_000);
it('places opposite quaternion signs as the same rotation with separately owned geometry', () => withNativeOwners(owners => {
  const source = parts(owners), first = owners.own(placeAssemblyBody(source.pin, { translation: [-10, 0, -8], rotation: [0, 0, H, H] })),
    second = owners.own(placeAssemblyBody(source.pin, { translation: [-10, 0, -8], rotation: [0, 0, -H, -H] }));
  for (const shape of [first, second]) { metrics(shape, VN, AN, [-12, -2, -8], [-8, 2, 4]); probe(shape, [-10, 1, -2], false); }
  independent(first, second); source.assertOriginal();
}), 60_000);

for (const [name, pose] of [
  ['non-unit quaternion', { translation: [0, 0, 0], rotation: [0, 0, 0, 2] }],
  ['zero quaternion', { translation: [0, 0, 0], rotation: [0, 0, 0, 0] }],
  ['short quaternion', { translation: [0, 0, 0], rotation: [0, 0, 1] }],
  ['sparse quaternion', { translation: [0, 0, 0], rotation: new Array(4) }],
  ['NaN translation', { translation: [NaN, 0, 0], rotation: [0, 0, 0, 1] }],
  ['infinite translation', { translation: [0, Infinity, 0], rotation: [0, 0, 0, 1] }],
] as const) it('rejects ' + name + ' before native prototype copying', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), copy = vi.spyOn(bodies, 'copyBodyShape');
  try { expect(() => owners.own(placeAssemblyBody(source, pose as unknown as RigidPose))).toThrow(); expect(copy).not.toHaveBeenCalled(); }
  finally { copy.mockRestore(); }
  metrics(source, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);
it('rejects an inverted closed prototype without consuming it', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])); source.wrapped.Reverse();
  expect(() => owners.own(placeAssemblyBody(source, IDENTITY))).toThrow();
  expect(Math.abs(owners.own(measureShapeVolumeProperties(source)).volume + 24)).toBeLessThan(1e-5);
}), 60_000);
it('rejects a two-solid prototype instead of merging or silently selecting one child', () => withNativeOwners(owners => {
  const first = owners.own(makeBox([0, 0, 0], [2, 3, 4])), second = owners.own(makeBox([5, 0, 0], [7, 3, 4])), source = compound(owners, [first, second]);
  expect(() => owners.own(placeAssemblyBody(source, IDENTITY))).toThrow(/exactamente un sólido/); expect(owners.ownAll(source.solids)).toHaveLength(2);
  metrics(first, 24, 52, [0, 0, 0], [2, 3, 4]); metrics(second, 24, 52, [5, 0, 0], [7, 3, 4]);
}), 60_000);
it('rejects an actual open five-face native solid without consuming its original closed box', () => withNativeOwners(owners => {
  const oc = getOC(), source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), faces = owners.ownAll(source.faces),
    builder = owners.own(new oc.TopoDS_Builder()), shell = owners.own(new oc.TopoDS_Shell());
  let raw: TopoDS_Solid | undefined, adopted = false; owners.own({ delete: () => { if (!adopted) raw?.delete(); } });
  builder.MakeShell(shell); faces.slice(0, 5).forEach(face => builder.Add(shell, face.wrapped));
  raw = new oc.TopoDS_Solid(); builder.MakeSolid(raw); builder.Add(raw, shell); const wrapped = new Solid(raw); adopted = true; const open = owners.own(wrapped);
  expect(oc.BRep_Tool.IsClosed(shell)).toBe(false); expect(() => owners.own(placeAssemblyBody(open, IDENTITY))).toThrow();
  metrics(source, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

function captured(action: () => unknown): unknown { try { action(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown, seen = new Set<unknown>()): unknown[] {
  if (seen.has(error)) return []; seen.add(error);
  return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(item => errorTree(item, seen)) : []),
    ...(error instanceof Error && error.cause !== undefined ? errorTree(error.cause, seen) : [])];
}
/** Adapt only actual objects received by this component, before arena adoption. */
function placementFault<T>(patch: (owner: NativeOwner) => void, action: () => T): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof ownership.withNativeOwners = <R>(operation: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === 'Assembly body placement or release failed.') {
        const own = owners.own.bind(owners); owners.own = <S extends NativeOwner>(value: S): S => { patch(value); return own(value); };
      }
      return operation(owners);
    }, retained, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return action(); } finally { spy.mockRestore(); }
}
for (const fault of ['matrix-query', 'build-query', 'matrix-release', 'builder-release', 'validation-and-release'] as const)
  it('retains native ' + fault + ' failure and withholds/releases a completed candidate exactly once', () => withNativeOwners(owners => {
    const source = owners.own(makeCylinder(2, 12)), primary = new Error('Original assembly placement primary ' + fault), cleanup = new Error('Original assembly placement cleanup ' + fault),
      released: Record<string, number> = { copy: 0, matrix: 0, builder: 0, result: 0 };
    let shapeCount = 0, matrixSeen = false, builderSeen = false, validationSeen = false;
    const originalValidate = bodies.validateBodyShape, validate = vi.spyOn(bodies, 'validateBodyShape').mockImplementation(shape => {
      const volume = originalValidate(shape);
      if (fault === 'validation-and-release' && shape !== source) { validationSeen = true; throw primary; }
      return volume;
    });
    let error: unknown;
    try {
      error = captured(() => placementFault(value => {
        if ('asShape3D' in value && typeof value.asShape3D === 'function' && 'wrapped' in value) {
          const shape = value as Shape3D, name = ++shapeCount === 1 ? 'copy' : 'result', handle = shape.wrapped, rawDelete = handle.delete.bind(handle);
          Object.defineProperty(handle, 'delete', { configurable: true, value: () => { released[name]++; rawDelete(); } });
        } else if ('SetValues' in value && typeof value.SetValues === 'function' && 'ScaleFactor' in value) {
          matrixSeen = true; const realDelete = value.delete.bind(value), realSet = value.SetValues.bind(value);
          Object.defineProperty(value, 'delete', { configurable: true, value: () => {
            released.matrix++; realDelete(); if (fault === 'matrix-release' || fault === 'validation-and-release') throw cleanup;
          } });
          if (fault === 'matrix-query') Object.defineProperty(value, 'SetValues', { configurable: true, value: (...args: number[]) => { realSet(...args); throw primary; } });
        } else if ('Perform' in value && 'ModifiedShape' in value && 'IsDone' in value && typeof value.IsDone === 'function') {
          builderSeen = true; const realDelete = value.delete.bind(value), realDone = value.IsDone.bind(value);
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { released.builder++; realDelete(); if (fault === 'builder-release') throw cleanup; } });
          if (fault === 'build-query') Object.defineProperty(value, 'IsDone', { configurable: true, value: () => { realDone(); throw primary; } });
        }
      }, () => owners.own(placeAssemblyBody(source, { translation: [10, 0, -8], rotation: [0, 0, H, H] }))));
    } finally { validate.mockRestore(); }
    expect(matrixSeen).toBe(true); expect(released.copy).toBe(1); expect(released.matrix).toBe(1);
    expect(builderSeen).toBe(fault !== 'matrix-query'); expect(released.builder).toBe(fault === 'matrix-query' ? 0 : 1);
    expect(released.result).toBe(fault === 'matrix-query' || fault === 'build-query' ? 0 : 1);
    if (fault.endsWith('release')) { expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); }
    if (fault === 'validation-and-release') { expect(validationSeen).toBe(true); expect(errorTree(error)).toContain(primary); }
    if (fault === 'matrix-query' || fault === 'build-query') expect(error).toBe(primary);
    metrics(source, 48 * Math.PI, 56 * Math.PI, [-2, -2, 0], [2, 2, 12]);
  }), 60_000);
