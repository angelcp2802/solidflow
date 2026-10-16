import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import type { TopoDS_Shape } from 'replicad-opencascadejs';
import { getOC, makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC,
  type Face, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { bodyBoolean, copyBodyShape, validateBodyShape } from './kernel.bodies';
import { countNativeFaceOccurrences } from './kernel.native-face-membership';
import { NativeCleanupError, NativeOwners, withNativeOwners, type NativeOwner } from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';

// Original synthetic 12 x 8 x 4 mm boxes: V=384 mm^3, A=352 mm^2.
// Geometry selects the bottom fixture face only; membership never uses it.
// These component cases do not certify historical supports or enable recipes.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const M = 1e-5, B = 1e-6;
type Fixture = { body: Shape3D; face: Face; faces: readonly Face[] };
function fixture(owners: NativeOwners): Fixture {
  const body = owners.own(makeBox([0, 0, 0], [12, 8, 4])), faces = owners.ownAll(body.faces);
  const bottom = faces.filter(face => {
    const bounds = owners.own(face.boundingBox);
    const result = bounds.bounds.every(point => Math.abs(point[2]) < B);
    owners.release(bounds);
    return result;
  });
  if (bottom.length !== 1) throw new Error('Original box must have one bottom fixture face.');
  return { body, face: bottom[0], faces };
}
function expectBox(shape: Shape3D): void {
  withNativeOwners(owners => {
    validateBodyShape(shape);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 384)).toBeLessThan(M);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 352)).toBeLessThan(M);
    expect(owners.ownAll(shape.solids).length).toBe(1);
    const actual = owners.own(shape.boundingBox).bounds, expected = [[0, 0, 0], [12, 8, 4]];
    actual.forEach((point, side) => point.forEach((x, axis) => expect(Math.abs(x - expected[side][axis])).toBeLessThan(B)));
  });
}
function expectBottom(face: Face): void {
  withNativeOwners(owners => {
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(face.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(face)).area - 96)).toBeLessThan(M);
    const actual = owners.own(face.boundingBox).bounds, expected = [[0, 0, 0], [12, 8, 0]];
    actual.forEach((point, side) => point.forEach((x, axis) => expect(Math.abs(x - expected[side][axis])).toBeLessThan(B)));
  });
}
function expectTranslatedRawBox(raw: TopoDS_Shape): void {
  withNativeOwners(owners => {
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(raw, true, false, false)),
      mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), bounds = owners.own(new oc.Bnd_Box());
    expect(analyzer.IsValid()).toBe(true);
    oc.BRepGProp.VolumeProperties(raw, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(raw, surface, false, false);
    expect(Math.abs(mass.Mass() - 384)).toBeLessThan(M); expect(Math.abs(surface.Mass() - 352)).toBeLessThan(M);
    oc.BRepBndLib.Add(raw, bounds, false);
    const actual = [[bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()]],
      expected = [[20, 0, 0], [32, 8, 4]];
    actual.forEach((point, side) => point.forEach((x, axis) => expect(Math.abs(x - expected[side][axis])).toBeLessThan(B)));
  });
}
function probe(shape: Shape3D, center: Vec3, material: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .1) as Vec3, center.map(x => x + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (material ? .008 : 0))).toBeLessThan(1e-7);
  });
}
function captured(operation: () => unknown): unknown {
  try { operation(); } catch (error) { return error; }
  return undefined;
}
function releaseSpy(value: NativeOwner, failure?: Error): ReturnType<typeof vi.fn> {
  const realDelete = value.delete.bind(value), spy = vi.fn(() => { realDelete(); if (failure) throw failure; });
  Object.defineProperty(value, 'delete', { configurable: true, value: spy });
  return spy;
}
/** Only test instrumentation; every value is a real native query object. */
function observeQueries(observe: (value: NativeOwner, owners: NativeOwners) => void): () => void {
  const realOwn = NativeOwners.prototype.own;
  const spy = vi.spyOn(NativeOwners.prototype, 'own').mockImplementation(function<T extends NativeOwner>(
    this: NativeOwners, value: T): T {
    // Instrument before the arena captures delete; do not allocate replacement
    // native geometry or change the helper's public API for fault injection.
    try { observe(value, this); }
    catch (error) { realOwn.call(this, value); throw error; }
    return realOwn.call(this, value) as T;
  });
  return () => spy.mockRestore();
}
function assertBorrowedHealthy(value: Fixture): void {
  expectBox(value.body); expectBottom(value.face);
  probe(value.body, [6, 4, 2], true); probe(value.body, [13, 4, 2], false);
  expect(countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)).toBe(1);
}

it('counts each of the six original box faces once without consuming either operand', () => withNativeOwners(owners => {
  const value = fixture(owners), bodyDelete = vi.spyOn(value.body.wrapped, 'delete').mockImplementation(() => {
    throw new Error('Borrowed body must not be deleted by a membership query.');
  });
  const faceDeletes = value.faces.map(face => vi.spyOn(face.wrapped, 'delete').mockImplementation(() => {
    throw new Error('Borrowed face must not be deleted by a membership query.');
  }));
  try {
    expect(value.faces.length).toBe(6);
    for (const face of value.faces) expect(countNativeFaceOccurrences(value.body.wrapped, face.wrapped)).toBe(1);
    expect(bodyDelete).not.toHaveBeenCalled();
    faceDeletes.forEach(spy => expect(spy).not.toHaveBeenCalled());
  } finally { bodyDelete.mockRestore(); faceDeletes.forEach(spy => spy.mockRestore()); }
  assertBorrowedHealthy(value);
}), 60_000);

it('rejects a geometrically coincident independent box and an explicit geometric copy as face owners', () => withNativeOwners(owners => {
  const value = fixture(owners), independent = fixture(owners), copied = owners.own(copyBodyShape(value.body));
  expectBox(independent.body); expectBox(copied);
  expect(value.body.wrapped.IsSame(independent.body.wrapped)).toBe(false);
  expect(value.body.wrapped.IsSame(copied.wrapped)).toBe(false);
  expect(countNativeFaceOccurrences(independent.body.wrapped, value.face.wrapped)).toBe(0);
  expect(countNativeFaceOccurrences(copied.wrapped, value.face.wrapped)).toBe(0);
  expect(countNativeFaceOccurrences(value.body.wrapped, independent.face.wrapped)).toBe(0);
  assertBorrowedHealthy(value); assertBorrowedHealthy(independent);
}), 60_000);

it('accepts independent alias wrappers of the same native body and face', () => withNativeOwners(owners => {
  const value = fixture(owners), body = owners.own(value.body.clone()), face = owners.own(value.face.clone());
  expect(body).not.toBe(value.body); expect(face).not.toBe(value.face);
  expect(body.wrapped.IsSame(value.body.wrapped)).toBe(true);
  expect(face.wrapped.IsSame(value.face.wrapped)).toBe(true);
  expect(countNativeFaceOccurrences(body.wrapped, face.wrapped)).toBe(1);
  expect(countNativeFaceOccurrences(value.body.wrapped, face.wrapped)).toBe(1);
  assertBorrowedHealthy(value); expectBox(body); expectBottom(face);
}), 60_000);

it('counts a reversed orientation of the same native face without treating orientation as placement', () => withNativeOwners(owners => {
  const value = fixture(owners), reversed = owners.own(value.face.wrapped.Reversed());
  expect(reversed.IsSame(value.face.wrapped)).toBe(true);
  expect(reversed.IsEqual(value.face.wrapped)).toBe(false);
  expect(countNativeFaceOccurrences(value.body.wrapped, reversed)).toBe(1);
  assertBorrowedHealthy(value);
}), 60_000);

it('distinguishes changed Location on shared topology using a direct isometry with copyGeom=false', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), translation = owners.own(new oc.gp_Trsf()),
    vector = owners.own(new oc.gp_Vec(20, 0, 0));
  translation.SetTranslation(vector);
  const bodyBuilder = owners.own(new oc.BRepBuilderAPI_Transform(value.body.wrapped, translation, false, false));
  if (!bodyBuilder.IsDone()) throw new Error('Original translation fixture did not build.');
  const movedBody = owners.own(bodyBuilder.Shape()), explorer = owners.own(new oc.TopExp_Explorer(
    movedBody, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  let movedFace: TopoDS_Shape | undefined, matches = 0;
  while (explorer.More()) {
    const current = owners.own(explorer.Current());
    if (current.IsPartner(value.face.wrapped)) { matches++; if (!movedFace) movedFace = current; }
    else owners.release(current);
    explorer.Next();
  }
  owners.release(explorer);
  expect(matches).toBe(1);
  if (!movedFace) throw new Error('Translated fixture lost its original face topology.');
  // Take the real occurrence from this one transformed body. Two independent
  // builders need not create equal TopLoc datum chains from equal matrices.
  // This fixture lookup is not a proposed support-correspondence algorithm.
  expect(movedFace.IsPartner(value.face.wrapped)).toBe(true);
  expect(movedFace.IsSame(value.face.wrapped)).toBe(false);
  expect(movedBody.IsPartner(value.body.wrapped)).toBe(true);
  expect(movedBody.IsSame(value.body.wrapped)).toBe(false);
  expectTranslatedRawBox(movedBody);
  expect(countNativeFaceOccurrences(value.body.wrapped, movedFace)).toBe(0);
  expect(countNativeFaceOccurrences(movedBody, value.face.wrapped)).toBe(0);
  expect(countNativeFaceOccurrences(movedBody, movedFace)).toBe(1);
  assertBorrowedHealthy(value);
}), 60_000);

it('counts repeated native occurrences in a compound instead of returning after its first match', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), compound = owners.own(new oc.TopoDS_Compound()),
    builder = owners.own(new oc.TopoDS_Builder());
  builder.MakeCompound(compound); builder.Add(compound, value.body.wrapped); builder.Add(compound, value.body.wrapped);
  expect(compound.NbChildren()).toBe(2);
  expect(countNativeFaceOccurrences(compound, value.face.wrapped)).toBe(2);
  assertBorrowedHealthy(value);
}), 60_000);

it('returns zero for an actual non-null empty compound', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), compound = owners.own(new oc.TopoDS_Compound()),
    builder = owners.own(new oc.TopoDS_Builder());
  builder.MakeCompound(compound);
  expect(compound.IsNull()).toBe(false);
  expect(countNativeFaceOccurrences(compound, value.face.wrapped)).toBe(0);
  assertBorrowedHealthy(value);
}), 60_000);

it('keeps native body and face clones alive after every original catalog wrapper is retired', () => withNativeOwners(owners => {
  const value = fixture(owners), body = owners.own(value.body.clone()), face = owners.own(value.face.clone());
  value.faces.forEach(original => owners.release(original));
  owners.release(value.body);
  // Actual BRep, mass, area, bounds and independent interior/exterior probes,
  // not a copied frame or retained string identity, establish clone lifetime.
  expectBox(body); expectBottom(face);
  probe(body, [6, 4, 2], true); probe(body, [13, 4, 2], false);
  expect(countNativeFaceOccurrences(body.wrapped, face.wrapped)).toBe(1);
}), 60_000);

it('rejects a null body without consuming its non-null face operand', () => withNativeOwners(owners => {
  const value = fixture(owners), empty = owners.own(new (getOC().TopoDS_Shape)());
  expect(() => countNativeFaceOccurrences(empty, value.face.wrapped)).toThrow('non-null body shape');
  expect(empty.IsNull()).toBe(true); assertBorrowedHealthy(value);
}), 60_000);

it('rejects a null face without consuming its body operand', () => withNativeOwners(owners => {
  const value = fixture(owners), empty = owners.own(new (getOC().TopoDS_Shape)());
  expect(() => countNativeFaceOccurrences(value.body.wrapped, empty)).toThrow('non-null FACE operand');
  expect(empty.IsNull()).toBe(true); assertBorrowedHealthy(value);
}), 60_000);

it('rejects a real solid supplied as the face operand without changing the solid', () => withNativeOwners(owners => {
  const value = fixture(owners);
  expect(() => countNativeFaceOccurrences(value.body.wrapped, value.body.wrapped)).toThrow('non-null FACE operand');
  assertBorrowedHealthy(value);
}), 60_000);

it('preserves a native More query failure and releases its real explorer once', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), primary = new Error('Original native More failure');
  let release: ReturnType<typeof vi.fn> | undefined, nativeMore = false, currents = 0;
  const restore = observeQueries(query => {
    if (query instanceof oc.TopExp_Explorer) {
      release = releaseSpy(query); const more = query.More.bind(query);
      Object.defineProperty(query, 'More', { configurable: true, value: () => { nativeMore = more(); throw primary; } });
    } else currents++;
  });
  let error: unknown;
  try { error = captured(() => countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)); }
  finally { restore(); }
  expect(nativeMore).toBe(true); expect(currents).toBe(0);
  expect(error).toBe(primary); expect(release).toHaveBeenCalledTimes(1);
  assertBorrowedHealthy(value);
}), 60_000);

it('still traverses after a matching occurrence and preserves a later native Next failure', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), primary = new Error('Original post-match native Next failure');
  let matched = false, nativeNextAfterMatch = false, explorerRelease: ReturnType<typeof vi.fn> | undefined;
  const currentReleases: Array<ReturnType<typeof vi.fn>> = [];
  const restore = observeQueries(query => {
    if (query instanceof oc.TopExp_Explorer) {
      explorerRelease = releaseSpy(query); const next = query.Next.bind(query);
      Object.defineProperty(query, 'Next', { configurable: true, value: () => {
        next();
        if (matched) { nativeNextAfterMatch = true; throw primary; }
      } });
    } else {
      const current = query as TopoDS_Shape, same = current.IsSame.bind(current);
      currentReleases.push(releaseSpy(current));
      Object.defineProperty(current, 'IsSame', { configurable: true, value: (face: TopoDS_Shape) => {
        const result = same(face); if (result) matched = true; return result;
      } });
    }
  });
  let error: unknown;
  try { error = captured(() => countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)); }
  finally { restore(); }
  expect(matched).toBe(true); expect(nativeNextAfterMatch).toBe(true);
  expect(error).toBe(primary); expect(explorerRelease).toHaveBeenCalledTimes(1);
  expect(currentReleases.length).toBeGreaterThan(0);
  currentReleases.forEach(release => expect(release).toHaveBeenCalledTimes(1));
  assertBorrowedHealthy(value);
}), 60_000);

it('preserves the actual IsSame failure and both Current and explorer cleanup failures', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), primary = new Error('Original native IsSame failure'),
    currentCleanup = new Error('Original Current cleanup failure'), explorerCleanup = new Error('Original explorer cleanup failure');
  let currentRelease: ReturnType<typeof vi.fn> | undefined, explorerRelease: ReturnType<typeof vi.fn> | undefined,
    nativeCurrentWasFace = false, isSameReached = false;
  const restore = observeQueries(query => {
    if (query instanceof oc.TopExp_Explorer) explorerRelease = releaseSpy(query, explorerCleanup);
    else {
      const current = query as TopoDS_Shape;
      nativeCurrentWasFace = !current.IsNull() && current.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE;
      currentRelease = releaseSpy(current, currentCleanup);
      Object.defineProperty(current, 'IsSame', { configurable: true, value: () => { isSameReached = true; throw primary; } });
    }
  });
  let error: unknown;
  try { error = captured(() => countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)); }
  finally { restore(); }
  expect(nativeCurrentWasFace).toBe(true); expect(isSameReached).toBe(true);
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as NativeCleanupError).cause).toBe(primary);
  expect((error as NativeCleanupError).errors).toEqual([primary, currentCleanup, explorerCleanup]);
  expect(currentRelease).toHaveBeenCalledTimes(1); expect(explorerRelease).toHaveBeenCalledTimes(1);
  assertBorrowedHealthy(value);
}), 60_000);

it('rejects a successful count when a real Current release fails and still completes all six comparisons', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), cleanup = new Error('Original matched Current cleanup failure');
  let comparisons = 0, matched = false, explorerRelease: ReturnType<typeof vi.fn> | undefined;
  const currentReleases: Array<ReturnType<typeof vi.fn>> = [];
  const restore = observeQueries(query => {
    if (query instanceof oc.TopExp_Explorer) explorerRelease = releaseSpy(query);
    else {
      const current = query as TopoDS_Shape, same = current.IsSame.bind(current);
      // Choose the failure by the actual native face identity, never a
      // registration ordinal. All other Current wrappers delete normally.
      const isOperand = same(value.face.wrapped);
      currentReleases.push(releaseSpy(current, isOperand ? cleanup : undefined));
      Object.defineProperty(current, 'IsSame', { configurable: true, value: (face: TopoDS_Shape) => {
        comparisons++; const result = same(face); if (result) matched = true; return result;
      } });
    }
  });
  let error: unknown;
  try { error = captured(() => countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)); }
  finally { restore(); }
  expect(matched).toBe(true); expect(comparisons).toBe(6); expect(currentReleases.length).toBe(6);
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as NativeCleanupError).errors).toEqual([cleanup]);
  currentReleases.forEach(release => expect(release).toHaveBeenCalledTimes(1));
  expect(explorerRelease).toHaveBeenCalledTimes(1); assertBorrowedHealthy(value);
}), 60_000);

it('rejects a completed numeric result when final explorer cleanup fails', () => withNativeOwners(owners => {
  const value = fixture(owners), oc = getOC(), cleanup = new Error('Original final explorer cleanup failure');
  let comparisons = 0, explorerRelease: ReturnType<typeof vi.fn> | undefined;
  const currentReleases: Array<ReturnType<typeof vi.fn>> = [];
  const restore = observeQueries(query => {
    if (query instanceof oc.TopExp_Explorer) explorerRelease = releaseSpy(query, cleanup);
    else {
      const current = query as TopoDS_Shape, same = current.IsSame.bind(current);
      currentReleases.push(releaseSpy(current));
      Object.defineProperty(current, 'IsSame', { configurable: true, value: (face: TopoDS_Shape) => {
        comparisons++; return same(face);
      } });
    }
  });
  let error: unknown;
  try { error = captured(() => countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)); }
  finally { restore(); }
  expect(comparisons).toBe(6); expect(currentReleases.length).toBe(6);
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as NativeCleanupError).errors).toEqual([cleanup]);
  expect(explorerRelease).toHaveBeenCalledTimes(1);
  currentReleases.forEach(release => expect(release).toHaveBeenCalledTimes(1));
  assertBorrowedHealthy(value);
}), 60_000);

for (const afterInsertion of [false, true]) it('preserves a received Current registration failure and cleanup errors, afterInsertion=' + afterInsertion,
  () => withNativeOwners(owners => {
    const value = fixture(owners), oc = getOC(), primary = new Error('Original native Current registration failure'),
      currentCleanup = new Error('Original registration Current cleanup failure'),
      explorerCleanup = new Error('Original registration explorer cleanup failure');
    let currentRelease: ReturnType<typeof vi.fn> | undefined, explorerRelease: ReturnType<typeof vi.fn> | undefined,
      actualCurrentWasFace = false, inserted = false;
    const restore = observeQueries((query, local) => {
      if (query instanceof oc.TopExp_Explorer) explorerRelease = releaseSpy(query, explorerCleanup);
      else {
        const current = query as TopoDS_Shape;
        actualCurrentWasFace = !current.IsNull() && current.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE;
        currentRelease = releaseSpy(current, currentCleanup);
        // Fault only this query arena's private Map instance and this received
        // native Current identity. No global Map or SDK prototype is replaced.
        const records = (local as unknown as { records: Map<unknown, unknown> }).records, realSet = records.set.bind(records);
        Object.defineProperty(records, 'set', { configurable: true, value: (key: unknown, record: unknown) => {
          if (key === current) {
            if (afterInsertion) { realSet(key, record); inserted = true; }
            throw primary;
          }
          return realSet(key, record);
        } });
      }
    });
    let error: unknown;
    try { error = captured(() => countNativeFaceOccurrences(value.body.wrapped, value.face.wrapped)); }
    finally { restore(); }
    expect(actualCurrentWasFace).toBe(true); expect(inserted).toBe(afterInsertion);
    expect(error).toBeInstanceOf(NativeCleanupError); expect((error as NativeCleanupError).cause).toBe(primary);
    expect((error as NativeCleanupError).errors).toEqual([primary, currentCleanup, explorerCleanup]);
    expect(currentRelease).toHaveBeenCalledTimes(1); expect(explorerRelease).toHaveBeenCalledTimes(1);
    assertBorrowedHealthy(value);
  }), 60_000);
