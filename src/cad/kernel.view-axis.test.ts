import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { Face, getOC, makeBox, makeCylinder, makePolygon, makeSphere, measureShapeSurfaceProperties, revolution, setOC } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { faceViewAxis } from './kernel.view-axis';
import { createFaceCatalog, pickableFacesFromCatalog } from './kernel.faces';
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';
import { createAssemblyExample } from '../examples/assembly';
import { serializeAssemblyDocument } from '../model/assemblyDocument';
import { buildAssemblyScene } from './kernel.assembly-scene';

// Original analytic faces: radius 2, slant/axial interval 0..4, optional
// cone angle pi/6. Construction axes and literal rigid transforms are oracles.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
function near(actual: readonly number[] | undefined, expected: Vec3): void {
  expect(actual).toHaveLength(3);
  expected.forEach((value, i) => expect(Math.abs(actual![i] - value)).toBeLessThan(1e-8));
}
function analyticFace(owners: NativeOwners, cone: boolean): Face {
  const oc = getOC(), point = owners.own(new oc.gp_Pnt(3, 4, 5)), direction = owners.own(new oc.gp_Dir(0, 1, 0)),
    x = owners.own(new oc.gp_Dir(1, 0, 0)), axes = owners.own(new oc.gp_Ax3(point, direction, x));
  const surface = cone ? owners.own(new oc.Geom_ConicalSurface(axes, Math.PI / 6, 2))
    : owners.own(new oc.Geom_CylindricalSurface(axes, 2));
  const builder = owners.own(new oc.BRepBuilderAPI_MakeFace(surface, 0, 2 * Math.PI, 0, 4, 1e-7));
  return owners.own(new Face(builder.Face()));
}

it.each([false, true])('reads a native axis with unchanged geometric area (cone=%s)', cone => withNativeOwners(owners => {
  const face = analyticFace(owners, cone), orientation = face.wrapped.Orientation(), axis = faceViewAxis(face)!;
  expect(axis.kind).toBe('axis'); near(axis.point, [3, 4, 5]); near(axis.direction, [0, 1, 0]); near(axis.xDirection, [1, 0, 0]);
  expect(face.wrapped.Orientation()).toBe(orientation);
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(face)).area - (cone ? 24 : 16) * Math.PI)).toBeLessThan(1e-7);
  const repeated = faceViewAxis(face)!; expect(repeated).toEqual(axis); expect(repeated.direction).not.toBe(axis.direction);
  axis.point[0] = 900; near(faceViewAxis(face)!.point, [3, 4, 5]);
}));

it.each([false, true])('applies native TopLoc rotation/translation and ignores face reversal (cone=%s)', cone => withNativeOwners(owners => {
  const oc = getOC(), face = analyticFace(owners, cone), transform = owners.own(new oc.gp_Trsf()),
    origin = owners.own(new oc.gp_Pnt(0, 0, 0)), x = owners.own(new oc.gp_Dir(1, 0, 0)), rotation = owners.own(new oc.gp_Ax1(origin, x));
  transform.SetRotation(rotation, Math.PI / 2);
  transform.SetTranslationPart(owners.own(new oc.gp_Vec(8, -2, 3)));
  face.wrapped.Move(owners.own(new oc.TopLoc_Location(transform)), false);
  const axis = faceViewAxis(face)!;
  near(axis.point, [11, -7, 7]); near(axis.direction, [0, 0, 1]); near(axis.xDirection, [1, 0, 0]);
  face.wrapped.Reverse(); expect(faceViewAxis(face)).toEqual(axis);
}));

it.each([false, true])('adds detached display metadata without replacing planar frames or reference keys (cone=%s)', cone => withNativeOwners(owners => {
  const shape = cone ? owners.own(revolution(owners.own(makePolygon([[0, 0, 0], [2, 0, 0], [0, 0, 4]])), [0, 0, 0], [0, 0, 1], 360))
    : owners.own(makeCylinder(2, 4, [3, 4, 5], [0, 1, 0]));
  const catalog = createFaceCatalog(shape, 'original-native-axis'); owners.own({ delete: () => catalog.dispose() });
  const keys = catalog.entries.map(entry => entry.ref.key), faces = pickableFacesFromCatalog(catalog);
  expect(faces.map(face => face.ref.key)).toEqual(keys);
  expect(faces.filter(face => face.frame)).toHaveLength(cone ? 1 : 2);
  expect(faces.filter(face => face.viewAxis)).toHaveLength(1);
  const curved = faces.find(face => face.viewAxis)!; expect(curved.frame).toBeNull();
  const direction: Vec3 = cone ? [0, 0, 1] : [0, 1, 0];
  near(curved.viewAxis!.direction, direction); expect(curved.vertices.length).toBeGreaterThan(0);
  curved.viewAxis!.direction[0] = 999;
  near(pickableFacesFromCatalog(catalog).find(face => face.viewAxis)!.viewAxis!.direction, direction);
}));

it('publishes a detached assembly-world axis under a literal X90 transform without changing mate supports', () => {
  const document = createAssemblyExample(), left = document.occurrences.find(value => value.id === 'left')!;
  left.pose = { translation: [7, 11, 13], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
  const before = serializeAssemblyDocument(document), scene = buildAssemblyScene(document);
  const body = scene.bodies.find(value => value.component.occurrencePath[0] === 'left')!;
  const face = body.faces.find(value => value.support?.kind === 'cylinder' && value.support.radius === 2)!;
  // A boolean may reverse the parameter axis without changing the cylinder.
  // Check the independent geometric line, then the literal X90 component map.
  const sign = face.viewAxis!.direction[2], x = face.viewAxis!.xDirection!;
  expect(Math.abs(sign)).toBe(1);
  near(face.viewAxis!.point, [0, 0, 0]); near(face.viewAxis!.direction, [0, 0, sign]);
  near(face.worldViewAxis!.point, [7, 11, 13]); near(face.worldViewAxis!.direction, [0, -sign, 0]);
  near(face.worldViewAxis!.xDirection, [x[0], -x[2], x[1]]);
  expect(face.worldSupport?.kind).toBe('cylinder'); expect(face.viewAxis).not.toBe(face.worldViewAxis);
  expect(body.faces.filter(value => value.support?.kind === 'plane').every(value => value.viewAxis === undefined && value.worldViewAxis === undefined)).toBe(true);
  expect(serializeAssemblyDocument(document)).toBe(before);
});

it('does not invent axes for planar or spherical faces', () => withNativeOwners(owners => {
  for (const shape of [owners.own(makeBox([0, 0, 0], [1, 2, 3])), owners.own(makeSphere(2))]) {
    for (const face of owners.ownAll(shape.faces)) expect(faceViewAxis(face)).toBeNull();
  }
}));

it('propagates an actual native frame-query failure without altering the borrowed face', () => withNativeOwners(owners => {
  const oc = getOC(), face = analyticFace(owners, true), expected = faceViewAxis(face), failure = new Error('Original native frame query failed');
  const query = vi.spyOn(oc.Geom_ElementarySurface.prototype, 'Position').mockImplementation(() => { throw failure; });
  try { expect(() => faceViewAxis(face)).toThrow(failure); }
  finally { query.mockRestore(); }
  expect(faceViewAxis(face)).toEqual(expected);
}));
