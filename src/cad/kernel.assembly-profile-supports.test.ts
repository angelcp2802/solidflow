import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import type { BRepCheck_Analyzer } from 'replicad-opencascadejs';
import { assembleWire, getOC, makeCircle, makeEllipse, makeFace, makeLine, makePolygon, makeSphere, makeThreePointArc, setOC, type Face } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { extractAssemblyProfileSupport } from './kernel.assembly-profile-supports';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';
import { measureOrderedProfileCenters } from '../model/assemblyProfileCenterMeasurement';

// Original planar 6 x 4 rectangle and radius-2 disk. Expected centers are
// literal Cartesian corner midpoints, independent of the extractor.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const corners: Vec3[] = [[1, 2, 3], [7, 2, 3], [7, 6, 3], [1, 6, 3]];
const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(1e-10));
it('measures all four actual rectangle corners and its center, without imposing an axis correspondence', () => withNativeOwners(o => {
  const face = o.own(makePolygon(corners)), r = extractAssemblyProfileSupport(face);
  expect(r.kind).toBe('rectangle'); close(r.center, [4, 4, 3]); close(r.normal, [0, 0, 1]);
  if (r.kind !== 'rectangle') throw new Error('Expected rectangle');
  expect([...r.lengthsMm].sort()).toEqual([4, 6]);
  expect(new Set(r.corners.map(p => p.join(',')))).toEqual(new Set(corners.map(p => p.join(','))));
  expect(r.uncertainty.positionErrorMm).toBeLessThanOrEqual(1e-6);
  expect(face.wrapped.IsNull()).toBe(false);
}));
it('measures a rational oblique rectangle and reversed normal from literal rotated corners', () => withNativeOwners(o => {
  // R=[.6,0,.8;0,1,0;-.8,0,.6], t=[10,-3,5].
  const face = o.own(makePolygon([[13, -1, 6], [16.6, -1, 1.2], [16.6, 3, 1.2], [13, 3, 6]]));
  const r = extractAssemblyProfileSupport(face); close(r.center, [14.8, 1, 3.6]); close(r.normal, [.8, 0, .6]);
  const reversed = o.own(face.flipOrientation()); close(extractAssemblyProfileSupport(reversed).normal, [-.8, 0, -.6]);
  close(extractAssemblyProfileSupport(reversed).center, [14.8, 1, 3.6]);
}));
it('measures a complete circle with no invented roll axis', () => withNativeOwners(o => {
  const edge = o.own(makeCircle(2, [3, -2, 5], [0, 0, 1])), wire = o.own(assembleWire([edge])), face = o.own(makeFace(wire));
  const r = extractAssemblyProfileSupport(face); expect(r.kind).toBe('circle'); close(r.center, [3, -2, 5]);
  if (r.kind !== 'circle') throw new Error('Expected circle');
  expect(r.radiusMm).toBe(2); expect('boundaryAxes' in r).toBe(false); expect(r.radiusErrorMm).toBeLessThanOrEqual(1e-6);
}));
it('includes current seam-vertex tolerance and rejects a band that cannot contain it', () => withNativeOwners(o => {
  const face = o.own(makeFace(o.own(assembleWire([o.own(makeCircle(2, [3, -2, 5]))])))), oc = getOC();
  const original = oc.BRep_Tool.Tolerance;
  const spy = vi.spyOn(oc.BRep_Tool, 'Tolerance').mockImplementation(raw => raw.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_VERTEX ? 2e-6 : original(raw));
  try {
    expect(() => extractAssemblyProfileSupport(face)).toThrow(/precisionLimit/);
    const r = extractAssemblyProfileSupport(face, { lengthToleranceMm: 1e-5 });
    expect(r.nativeToleranceMm).toBe(2e-6); expect(r.uncertainty.positionErrorMm).toBeGreaterThanOrEqual(2e-6);
    if (r.kind !== 'circle') throw new Error('Expected circle');
    expect(r.radiusErrorMm).toBeGreaterThanOrEqual(2e-6);
  } finally { spy.mockRestore(); }
  expect(face.wrapped.IsNull()).toBe(false);
}));
it('rejects an annulus, without discarding the borrowed face', () => withNativeOwners(o => {
  const outer = o.own(assembleWire([o.own(makeCircle(3))])), inner = o.own(assembleWire([o.own(makeCircle(1))]));
  inner.wrapped.Reverse();
  const face = o.own(makeFace(outer, [inner])); expect(() => extractAssemblyProfileSupport(face)).toThrow(/topology budget/); expect(face.wrapped.IsNull()).toBe(false);
}));
it('rejects a valid semicircular cap and an ellipse instead of fitting a circle', () => withNativeOwners(o => {
  const arc = o.own(makeThreePointArc([-2, 0, 0], [0, 2, 0], [2, 0, 0])), chord = o.own(makeLine([2, 0, 0], [-2, 0, 0]));
  const cap = o.own(makeFace(o.own(assembleWire([arc, chord]))));
  expect(() => extractAssemblyProfileSupport(cap)).toThrow(/Unsupported profile boundary/);
  const ellipse = o.own(makeFace(o.own(assembleWire([o.own(makeEllipse(3, 2))]))));
  expect(() => extractAssemblyProfileSupport(ellipse)).toThrow(/complete analytic circle/);
}));
it('rejects a rounded contour with four edges, rather than treating endpoints as rectangle corners', () => withNativeOwners(o => {
  const edges = [o.own(makeLine([-2, -1, 0], [2, -1, 0])), o.own(makeThreePointArc([2, -1, 0], [3, 0, 0], [2, 1, 0])),
    o.own(makeLine([2, 1, 0], [-2, 1, 0])), o.own(makeThreePointArc([-2, 1, 0], [-3, 0, 0], [-2, -1, 0]))];
  const face = o.own(makeFace(o.own(assembleWire(edges)))); expect(() => extractAssemblyProfileSupport(face)).toThrow(/four native LINE/);
}));
it('accepts a square without inventing a unique long-axis or roll correspondence', () => withNativeOwners(o => {
  const face = o.own(makePolygon([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]])), r = extractAssemblyProfileSupport(face);
  expect(r.kind).toBe('rectangle'); close(r.center, [1, 1, 0]); if (r.kind === 'rectangle') expect(r.lengthsMm).toEqual([2, 2]);
}));
it('passes detached native rectangle/disk observations to the independent ordered measurement without reference authority', () => withNativeOwners(o => {
  const rectangle = o.own(makePolygon(corners)); // center [4,4,3], normal +Z
  const disk = o.own(makeFace(o.own(assembleWire([o.own(makeCircle(2, [7, 8, 5]))]))));
  const a = extractAssemblyProfileSupport(rectangle), b = extractAssemblyProfileSupport(disk);
  const observation = (r: typeof a) => ({ centerMm: r.center, normal: r.normal,
    centerErrorMm: r.uncertainty.positionErrorMm, normalErrorRad: r.uncertainty.normalErrorRad });
  const measured = measureOrderedProfileCenters(observation(a), observation(b), { lengthMm: 1e-6, angleRad: 1e-8 });
  expect(measured.status).toBe('ok'); if (measured.status !== 'ok') throw new Error('Expected representable measurement');
  close(measured.deltaMm, [3, 4, 2]); expect(measured.axialMm).toBe(2); close(measured.transverseMm, [3, 4, 0]);
  expect(measured.transverseDistanceMm).toBe(5); expect(measured.centerDistanceMm).toBe(Math.sqrt(29));
  expect(measured.alignedAngleRad).toBe(0); expect(measured.opposedAngleRad).toBe(Math.PI);
}));
it.each(([
  [[0, 0, 0], [4, 0, 0], [5, 3, 0], [1, 3, 0]],
  [[0, 0, 0], [4, 0, 0], [3, 3, 0], [0, 3, 0]],
  [[0, 0, 0], [4, 0, 0], [0, 3, 0]],
] as Vec3[][]).map(points => ({ points })))('rejects a nonrectangular planar polygon $points', ({ points }) => withNativeOwners(o => {
  const face = o.own(makePolygon(points)); expect(() => extractAssemblyProfileSupport(face)).toThrow();
}));
it('rejects a nonplanar surface and unsafe distant arithmetic without changing bands', () => withNativeOwners(o => {
  const sphere = o.own(makeSphere(2)), faces = o.ownAll(sphere.faces);
  expect(() => extractAssemblyProfileSupport(faces[0])).toThrow();
  const far = o.own(makePolygon(corners.map(p => [p[0] + 1e10, p[1], p[2]] as Vec3)));
  expect(() => extractAssemblyProfileSupport(far)).toThrow(/precisionLimit/);
}));
it('rejects invalid bands before native allocation', () => {
  expect(() => extractAssemblyProfileSupport(null as unknown as Face, { lengthToleranceMm: 0 })).toThrow(/bands/);
  expect(() => extractAssemblyProfileSupport(null as unknown as Face, { angleToleranceRad: Math.PI })).toThrow(/bands/);
});
it('classifies rectangle orthogonality against the explicit angular band', () => withNativeOwners(o => {
  const skew = 5e-11;
  const face = o.own(makePolygon([[0, 0, 0], [6, 0, 0], [6 + 4 * skew, 4, 0], [4 * skew, 4, 0]]));
  expect(extractAssemblyProfileSupport(face).kind).toBe('rectangle');
  expect(() => extractAssemblyProfileSupport(face, { angleToleranceRad: 1e-12 })).toThrow(/Nonrectangular/);
}));
it('attempts every owned release after a native query failure, preserving the borrowed face', () => withNativeOwners(o => {
  const face = o.own(makePolygon(corners)), original = ownership.NativeOwners.prototype.own;
  const releases: ReturnType<typeof vi.spyOn>[] = []; let injected = false;
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: ownership.NativeOwners, value: T): T {
    if (value instanceof getOC().BRepCheck_Analyzer && !injected) {
      const analyzer: BRepCheck_Analyzer = value;
      injected = true; releases.push(vi.spyOn(analyzer, 'delete')); vi.spyOn(analyzer, 'IsValid').mockImplementation(() => { throw new Error('Original injected validity failure'); });
    }
    return original.call(this, value) as T;
  });
  try { expect(() => extractAssemblyProfileSupport(face)).toThrow('Original injected validity failure'); expect(injected).toBe(true); releases.forEach(s => expect(s).toHaveBeenCalledTimes(1)); }
  finally { spy.mockRestore(); releases.forEach(s => s.mockRestore()); }
  expect(face.wrapped.IsNull()).toBe(false);
}));
it('aggregates native release failure rather than publishing detached data', () => withNativeOwners(o => {
  const face = o.own(makePolygon(corners)), original = ownership.NativeOwners.prototype.own; let injected = false;
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: ownership.NativeOwners, value: T): T {
    if (value instanceof getOC().BRepCheck_Analyzer && !injected) {
      injected = true; const release = value.delete.bind(value); value.delete = () => { release(); throw new Error('Original release fault'); };
    }
    return original.call(this, value) as T;
  });
  try { expect(() => extractAssemblyProfileSupport(face)).toThrow(NativeCleanupError); expect(injected).toBe(true); }
  finally { spy.mockRestore(); }
}));
