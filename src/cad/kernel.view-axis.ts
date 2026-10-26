import { getOC, type Face } from 'replicad';
import { withNativeOwners } from './kernel.native-ownership';
import type { FaceViewAxis, Vec3 } from './kernel.types';

/** Presentation only. The exact current face supplies the analytic axis;
 * meshes, feature parameters and saved mate supports are not substitutes. */
export function faceViewAxis(face: Face): FaceViewAxis | null {
  return withNativeOwners<FaceViewAxis | null>(owners => {
    const oc = getOC(), raw = face.wrapped;
    if (raw.IsNull() || raw.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_FACE) throw new Error('La cara de vista no está disponible.');
    const adaptor = owners.own(new oc.BRepAdaptor_Surface(raw, false)), kind = adaptor.GetType();
    if (kind !== oc.GeomAbs_SurfaceType.GeomAbs_Cylinder && kind !== oc.GeomAbs_SurfaceType.GeomAbs_Cone) return null;
    // This overload applies TopLoc placement. Cone() itself has no bound gp_Cone
    // in the current kernel; the polymorphic surface exposes its native frame.
    const surface = owners.own(oc.BRep_Tool.Surface(raw));
    if (!(surface instanceof oc.Geom_CylindricalSurface) && !(surface instanceof oc.Geom_ConicalSurface)) return null;
    const position = owners.own(surface.Position());
    const tuple = (value: { X(): number; Y(): number; Z(): number }): Vec3 => [value.X(), value.Y(), value.Z()];
    const point = tuple(owners.own(position.Location())), direction = tuple(owners.own(position.Direction())),
      xDirection = tuple(owners.own(position.XDirection()));
    if (![...point, ...direction, ...xDirection].every(Number.isFinite)
      || Math.abs(Math.hypot(...direction) - 1) > 1e-8 || Math.abs(Math.hypot(...xDirection) - 1) > 1e-8
      || Math.abs(direction.reduce((sum, value, index) => sum + value * xDirection[index], 0)) > 1e-8) {
      throw new Error('El eje nativo de vista necesita un marco ortonormal finito.');
    }
    return { kind: 'axis', point, direction, xDirection };
  }, undefined, 'Native face view-axis query or release failed.');
}
