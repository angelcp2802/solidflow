import { cast, getOC, type Shape3D } from 'replicad';
import { rigidRotationMatrix, validateRigidPose, type RigidPose } from '../model/rigidPose';
import { copyBodyShape, validateBodyShape, validateBodyShapeInContext } from './kernel.bodies';
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import { ownedNativeTopology } from './kernel.native-topology';
import { withNativeValidationContext } from './kernel.native-validation';
import type { Vec3 } from './kernel.types';

function finiteBounds(shape: Shape3D, owners: NativeOwners): [Vec3, Vec3] {
  const bounds = owners.own(shape.boundingBox).bounds;
  if (bounds.length !== 2 || bounds.some(side => side.length !== 3 || ![0, 1, 2].every(i =>
    Object.hasOwn(side, i) && Number.isFinite(side[i]))) || bounds[0].some((value, i) => value > bounds[1][i])) {
    throw new Error('El cuerpo del ensamblaje necesita límites finitos y ordenados.');
  }
  return bounds as [Vec3, Vec3];
}

/** Closed solid cardinality only; it never invents body identities in an aggregate. */
export function validateAssemblyShape(shape: Shape3D): number {
  return withNativeOwners(owners => {
    if (shape.isNull) throw new Error('El agregado del ensamblaje no contiene geometría.');
    // The outer arena holds every child until its nested checker has closed.
    return withNativeValidationContext(shape, context => {
      const oc = getOC();
      if (!context.check(shape)) throw new Error('El agregado del ensamblaje no es un BRep válido.');
      const solids = owners.ownAll(ownedNativeTopology(shape, 'solid'));
      if (!solids.length) throw new Error('El agregado del ensamblaje necesita al menos un sólido cerrado.');
      for (const solid of solids) validateBodyShapeInContext(solid, context);
      for (const kind of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
        const loose = owners.own(new oc.TopExp_Explorer(shape.wrapped,
          oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SOLID));
        if (loose.More()) throw new Error('El agregado del ensamblaje contiene geometría suelta fuera de sus sólidos.');
      }
      finiteBounds(shape, owners);
      return solids.length;
    });
  }, undefined, 'Assembly aggregate validation or release failed.');
}

export interface PlacedAssemblyShape {
  readonly shape: Shape3D;
  /** Native count for this returned shape before any caller mutation. */
  readonly solidCount: number;
}

function placeShape(source: Shape3D, pose: RigidPose, validate: (shape: Shape3D) => number, context: string,
  assertSourceCurrent?: () => void): PlacedAssemblyShape {
  const checked = validateRigidPose(pose), r = rigidRotationMatrix(checked.rotation), t = checked.translation;
  return withNativeOwners(owners => {
    assertSourceCurrent?.();
    const sourceSolids = validate(source);
    assertSourceCurrent?.();
    const sourceRaw = source.wrapped;
    assertSourceCurrent?.();
    const bounds = finiteBounds(source, owners);
    assertSourceCurrent?.();
    // Reject arithmetic overflow before passing the placement into native code.
    for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
      if (![r[0] * x + r[1] * y + r[2] * z + t[0], r[3] * x + r[4] * y + r[5] * z + t[1],
        r[6] * x + r[7] * y + r[8] * z + t[2]].every(Number.isFinite)) {
        throw new Error('La colocación del cuerpo excede las coordenadas finitas.');
      }
    }
    const copy = copyBodyShape(source);
    if (copy === source || copy.wrapped === sourceRaw) throw new Error('La copia del prototipo no puede reutilizar su propietario nativo.');
    owners.own(copy);
    assertSourceCurrent?.();
    if (copy.wrapped.IsPartner(sourceRaw)) throw new Error('La copia del prototipo conserva topología compartida.');
    assertSourceCurrent?.();
    const oc = getOC(), transform = owners.own(new oc.gp_Trsf());
    transform.SetValues(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2]);
    const scale = transform.ScaleFactor();
    if (transform.IsNegative() || !Number.isFinite(scale) || Math.abs(scale - 1) > 1e-10) {
      throw new Error('La colocación nativa debe ser una isometría directa sin escala.');
    }
    // CopyGeom=true is essential: a direct isometry with false merely assigns
    // a new location to shared TShape geometry. CopyMesh=false needs no mesh.
    const builder = owners.own(new oc.BRepBuilderAPI_Transform(copy.wrapped, transform, true, false));
    if (!builder.IsDone()) throw new Error('No se pudo colocar el cuerpo del ensamblaje.');
    const raw = owners.own(builder.Shape());
    if (raw.IsNull()) throw new Error('La colocación del cuerpo no tiene topología independiente.');
    assertSourceCurrent?.();
    if (raw.IsPartner(sourceRaw) || raw.IsPartner(copy.wrapped)) {
      throw new Error('La colocación del cuerpo no tiene topología independiente.');
    }
    assertSourceCurrent?.();
    // cast owns a distinct downcast wrapper; raw remains separately owned.
    const result = owners.own(cast(raw)).asShape3D();
    const solidCount = validate(result);
    if (solidCount !== sourceSolids) throw new Error('La colocación no conserva todos los sólidos del agregado.');
    finiteBounds(result, owners);
    assertSourceCurrent?.();
    return { shape: result, solidCount };
  }, result => [result.shape], context);
}

/** BORROWED one-solid prototype → OWNED independent one-solid occurrence, in mm. */
export function placeAssemblyBody(source: Shape3D, pose: RigidPose): Shape3D {
  return placeShape(source, pose, shape => { validateBodyShape(shape); return 1; }, 'Assembly body placement or release failed.').shape;
}

/**
 * BORROWED closed-solid aggregate → OWNED independent placed aggregate.
 * R·p+t applies to every solid without fusion, child selection or invented IDs.
 * The caller retains occurrence identity; this performs no reference or mate solve.
 */
export function placeAssemblyShape(source: Shape3D, pose: RigidPose): Shape3D {
  return placeAssemblyShapeChecked(source, pose).shape;
}

/** Same owned placement and native admission, with its already measured count.
 * Consume synchronously without mutating shape; this is not a retained validator.
 * Native cleanup must finish successfully before either field is returned. */
export function placeAssemblyShapeChecked(source: Shape3D, pose: RigidPose, assertSourceCurrent?: () => void): PlacedAssemblyShape {
  return placeShape(source, pose, validateAssemblyShape, 'Assembly shape placement or release failed.', assertSourceCurrent);
}
