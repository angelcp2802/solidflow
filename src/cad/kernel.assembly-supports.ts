import { getOC, type Edge, type Face, type Vertex } from 'replicad';
import { frameCross, frameDot, planarFaceFrame } from './kernel.frames';
import { withNativeOwners } from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';
import { canonicalAssemblyRackDirection } from '../model/assemblyRackPinion';

export type AssemblyNativeFaceSupport =
  | { kind: 'plane'; point: Vec3; normal: Vec3; xDirection: Vec3; tolerance: number }
  | { kind: 'cylinder'; point: Vec3; axis: Vec3; xDirection: Vec3; radius: number; tolerance: number };
export type AssemblyNativeLineSupport = { kind: 'line'; point: Vec3; axis: Vec3; tolerance: number };
export type AssemblyNativeSupport = AssemblyNativeFaceSupport | AssemblyNativeLineSupport;
/** Material vertex purpose, deliberately excluded from the directional support union. */
export interface AssemblyNativePointSupport { kind: 'point'; point: Vec3; tolerance: number }

/** Borrowed exact current vertex. This observation alone confers no reference authority. */
export function extractAssemblyVertexSupport(vertex: Vertex): AssemblyNativePointSupport {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = vertex.wrapped;
    if (!raw || raw.IsNull() || raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_VERTEX) throw new Error('El vértice nativo no está disponible.');
    const tolerance = oc.BRep_Tool.Tolerance(raw);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('La tolerancia nativa del vértice debe ser finita y no negativa.');
    const point = owners.own(oc.BRep_Tool.Pnt(raw));
    return { kind: 'point', point: coordinates(point), tolerance };
  }, undefined, 'Assembly vertex point extraction or release failed.');
}
/** Surface purpose is distinct from the pre-existing derived cylinder axis. */
export interface AssemblyNativeCylinderSurfaceSupport {
  kind: 'cylinder-surface'; point: Vec3; axis: Vec3; xDirection: Vec3; radius: number; tolerance: number;
  /** Oriented face normal = this sign times the geometric radial direction. */
  radialMaterialSense: 1 | -1;
}
/** A sphere has a centre and radius; its parameter frame is not a mate axis. */
export interface AssemblyNativeSphereSurfaceSupport {
  kind: 'sphere-surface'; center: Vec3; radius: number; tolerance: number;
  radialMaterialSense: 1 | -1;
}

/** Only a successfully queried, known unsupported analytic surface is skippable. */
export class UnsupportedAssemblySurfaceError extends Error {
  constructor() { super('El ensamblaje requiere una cara analítica plana o cilíndrica.'); this.name = 'UnsupportedAssemblySurfaceError'; }
}
export class UnsupportedAssemblyCurveError extends Error {
  constructor() { super('El ensamblaje requiere una arista rectilínea nativa.'); this.name = 'UnsupportedAssemblyCurveError'; }
}
export class UnsupportedAssemblyCylinderSurfaceError extends Error {
  constructor() { super('La tangencia requiere una superficie cilíndrica nativa.'); this.name = 'UnsupportedAssemblyCylinderSurfaceError'; }
}
export class UnsupportedAssemblySphereSurfaceError extends Error {
  constructor() { super('La tangencia requiere una superficie esférica nativa.'); this.name = 'UnsupportedAssemblySphereSurfaceError'; }
}

interface NativeCoordinates { X(): number; Y(): number; Z(): number }
function coordinates(value: NativeCoordinates): Vec3 {
  const result: Vec3 = [value.X(), value.Y(), value.Z()];
  if (!result.every(Number.isFinite)) throw new Error('El soporte nativo necesita coordenadas finitas.');
  return result;
}
function direction(value: NativeCoordinates): Vec3 {
  const result = coordinates(value), length = Math.hypot(...result);
  if (!Number.isFinite(length) || length < 1e-12 || Math.abs(length - 1) > 1e-8) {
    throw new Error('La dirección nativa del soporte no es unitaria o es degenerada.');
  }
  return result.map(coordinate => coordinate / length) as Vec3;
}
function perpendicular(first: Vec3, second: Vec3): void {
  if (Math.abs(frameDot(first, second)) > 1e-8) throw new Error('Los ejes nativos del soporte no son perpendiculares.');
}

/**
 * BORROWED Face -> detached analytic data, in millimeters. This does not attest
 * owner identity, currentness, a complete trimmed cap or mate applicability.
 * Plane frames match the existing outward-normal/canonical-X face convention.
 * Cylinder axis/X are geometric parameter axes, independent of face reversal.
 */
export function extractAssemblyFaceSupport(face: Face): AssemblyNativeFaceSupport {
  return withNativeOwners<AssemblyNativeFaceSupport>(owners => {
    const oc = getOC(), raw = face.wrapped;
    if (raw.IsNull() || raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_FACE) throw new Error('La cara nativa del ensamblaje no está disponible.');
    const orientation = raw.Orientation();
    if (orientation !== oc.TopAbs_Orientation.TopAbs_FORWARD && orientation !== oc.TopAbs_Orientation.TopAbs_REVERSED) {
      throw new Error('La orientación interna o externa de la cara no define un soporte exterior.');
    }
    const tolerance = oc.BRep_Tool.Tolerance(raw);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('La tolerancia nativa de la cara debe ser finita y no negativa.');
    const adaptor = owners.own(new oc.BRepAdaptor_Surface(raw, false)), kind = adaptor.GetType();
    if (kind === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
      const plane = owners.own(adaptor.Plane()), position = owners.own(plane.Position());
      const point = coordinates(owners.own(position.Location()));
      const x = direction(owners.own(position.XDirection())), y = direction(owners.own(position.YDirection()));
      perpendicular(x, y);
      const geometricNormal = frameCross(x, y), sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
      // The parametric normal is X cross Y, including indirect native frames.
      const frame = planarFaceFrame(point, geometricNormal.map(coordinate => sign * coordinate) as Vec3);
      if (![...frame.origin, ...frame.normal, ...frame.xDirection].every(Number.isFinite)) {
        throw new Error('El marco analítico del plano excede las coordenadas finitas.');
      }
      return { kind: 'plane', point: frame.origin, normal: frame.normal, xDirection: frame.xDirection, tolerance };
    }
    if (kind === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
      const cylinder = owners.own(adaptor.Cylinder()), position = owners.own(cylinder.Position());
      const point = coordinates(owners.own(position.Location())), axis = direction(owners.own(position.Direction()));
      const xDirection = direction(owners.own(position.XDirection())), radius = cylinder.Radius();
      perpendicular(axis, xDirection);
      if (!Number.isFinite(radius) || radius <= 0) throw new Error('El radio nativo del cilindro debe ser finito y positivo.');
      return { kind: 'cylinder', point, axis, xDirection, radius, tolerance };
    }
    if (Object.values(oc.GeomAbs_SurfaceType).includes(kind)) throw new UnsupportedAssemblySurfaceError();
    throw new Error('El tipo nativo de la superficie no es válido.');
  }, undefined, 'Assembly face support extraction or release failed.');
}

/** Fresh direction-purpose query; plane normals are measured from native D1. */
export function extractAssemblyDirectionFaceSupport(face: Face): AssemblyNativeFaceSupport {
  const support = extractAssemblyFaceSupport(face);
  if (support.kind === 'cylinder') return support;
  return withNativeOwners(owners => {
    const oc = getOC(), adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false));
    if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) throw new Error('El plano angular cambió durante su medida nativa.');
    const point = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec());
    adaptor.D1(0, 0, point, du, dv);
    const derivative = frameCross(coordinates(du), coordinates(dv)), length = Math.hypot(...derivative);
    if (!Number.isFinite(length) || length < 1e-12) throw new Error('La normal D1 del plano angular es degenerada.');
    const orientation = face.wrapped.Orientation();
    if (orientation !== oc.TopAbs_Orientation.TopAbs_FORWARD && orientation !== oc.TopAbs_Orientation.TopAbs_REVERSED) {
      throw new Error('La orientación del plano angular no define una normal exterior.');
    }
    const sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1,
      normal = derivative.map(value => sign * value / length) as Vec3,
      frame = planarFaceFrame(coordinates(point), normal);
    return { kind: 'plane' as const, point: frame.origin, normal: frame.normal, xDirection: frame.xDirection, tolerance: support.tolerance };
  }, undefined, 'Assembly direction-plane measurement or release failed.');
}

/** Borrowed exact face -> detached cylindrical surface and oriented radial sense. */
export function extractAssemblyCylinderSurfaceSupport(face: Face): AssemblyNativeCylinderSurfaceSupport {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = face.wrapped;
    if (raw.IsNull() || raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_FACE) throw new Error('La superficie cilíndrica nativa no está disponible.');
    const orientation = raw.Orientation();
    if (orientation !== oc.TopAbs_Orientation.TopAbs_FORWARD && orientation !== oc.TopAbs_Orientation.TopAbs_REVERSED) {
      throw new Error('La orientación de la cara no define una normal de superficie.');
    }
    const tolerance = oc.BRep_Tool.Tolerance(raw);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('La tolerancia nativa de superficie debe ser finita y no negativa.');
    const adaptor = owners.own(new oc.BRepAdaptor_Surface(raw, false)), kind = adaptor.GetType();
    if (kind !== oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
      if (Object.values(oc.GeomAbs_SurfaceType).includes(kind)) throw new UnsupportedAssemblyCylinderSurfaceError();
      throw new Error('El tipo nativo de la superficie no es válido.');
    }
    const cylinder = owners.own(adaptor.Cylinder()), position = owners.own(cylinder.Position());
    const point = coordinates(owners.own(position.Location())), axis = direction(owners.own(position.Direction()));
    const xDirection = direction(owners.own(position.XDirection())), yDirection = direction(owners.own(position.YDirection()));
    perpendicular(axis, xDirection); perpendicular(axis, yDirection); perpendicular(xDirection, yDirection);
    const handedness = frameDot(frameCross(yDirection, axis), xDirection), radius = cylinder.Radius();
    if (!Number.isFinite(handedness) || Math.abs(Math.abs(handedness) - 1) > 1e-8) throw new Error('El marco nativo del cilindro es degenerado.');
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('El radio nativo del cilindro debe ser finito y positivo.');
    // Su cross Sv = r*handedness*radial; face reversal supplies the other sign.
    // Do not reverse/canonicalize the geometric axis used by older mate families.
    const radialMaterialSense: 1 | -1 = (orientation === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1) * (handedness > 0 ? 1 : -1) > 0 ? 1 : -1;
    return { kind: 'cylinder-surface' as const, point, axis, xDirection, radius, tolerance, radialMaterialSense };
  }, undefined, 'Assembly cylinder surface extraction or release failed.');
}

/** Borrowed exact face; parameter handedness attests only oriented radial sense. */
export function extractAssemblySphereSurfaceSupport(face: Face): AssemblyNativeSphereSurfaceSupport {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = face.wrapped;
    if (raw.IsNull() || raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_FACE) throw new Error('La superficie esférica nativa no está disponible.');
    const orientation = raw.Orientation();
    if (orientation !== oc.TopAbs_Orientation.TopAbs_FORWARD && orientation !== oc.TopAbs_Orientation.TopAbs_REVERSED) {
      throw new Error('La orientación de la cara no define una normal de superficie.');
    }
    const tolerance = oc.BRep_Tool.Tolerance(raw);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('La tolerancia nativa de superficie debe ser finita y no negativa.');
    const adaptor = owners.own(new oc.BRepAdaptor_Surface(raw, false)), kind = adaptor.GetType();
    if (kind !== oc.GeomAbs_SurfaceType.GeomAbs_Sphere) {
      if (Object.values(oc.GeomAbs_SurfaceType).includes(kind)) throw new UnsupportedAssemblySphereSurfaceError();
      throw new Error('El tipo nativo de la superficie no es válido.');
    }
    const sphere = owners.own(adaptor.Sphere()), position = owners.own(sphere.Position());
    const center = coordinates(owners.own(position.Location())), z = direction(owners.own(position.Direction()));
    const x = direction(owners.own(position.XDirection())), y = direction(owners.own(position.YDirection()));
    perpendicular(x, y); perpendicular(y, z); perpendicular(z, x);
    const determinant = frameDot(frameCross(x, y), z), radius = sphere.Radius();
    if (!Number.isFinite(determinant) || Math.abs(Math.abs(determinant) - 1) > 1e-8) throw new Error('El marco nativo de la esfera es degenerado.');
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('El radio nativo de la esfera debe ser finito y positivo.');
    const radialMaterialSense: 1 | -1 = (orientation === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1) * (determinant > 0 ? 1 : -1) > 0 ? 1 : -1;
    return { kind: 'sphere-surface' as const, center, radius, tolerance, radialMaterialSense };
  }, undefined, 'Assembly sphere surface extraction or release failed.');
}

/** Borrowed exact current edge; only native LINE geometry gives a canonical direction. */
export function extractAssemblyEdgeSupport(edge: Edge): AssemblyNativeLineSupport {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = edge.wrapped;
    if (raw.IsNull() || raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_EDGE) throw new Error('La arista nativa del ensamblaje no está disponible.');
    const tolerance = oc.BRep_Tool.Tolerance(raw);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('La tolerancia nativa de la arista debe ser finita y no negativa.');
    const curve = owners.own(new oc.BRepAdaptor_Curve(raw)), kind = curve.GetType();
    if (kind !== oc.GeomAbs_CurveType.GeomAbs_Line) {
      if (Object.values(oc.GeomAbs_CurveType).includes(kind)) throw new UnsupportedAssemblyCurveError();
      throw new Error('El tipo nativo de curva no es válido.');
    }
    // gp_Lin is not exposed by this WASM binding. Native LINE classification
    // plus its analytical derivative supplies the same undirected axis without
    // subtracting distant endpoint coordinates or relying on traversal order.
    const parameter = curve.FirstParameter();
    if (!Number.isFinite(parameter)) throw new Error('La arista rectilínea necesita un parámetro nativo finito.');
    const point = owners.own(new oc.gp_Pnt()), derivative = owners.own(new oc.gp_Vec());
    curve.D1(parameter, point, derivative);
    return { kind: 'line' as const, point: coordinates(point), axis: canonicalAssemblyRackDirection(coordinates(derivative)), tolerance };
  }, undefined, 'Assembly edge support extraction or release failed.');
}
