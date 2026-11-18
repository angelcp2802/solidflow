import { cast, Face, getOC } from 'replicad';
import type { TopoDS_Shape } from 'replicad-opencascadejs';
import { withNativeOwners } from './kernel.native-ownership';

/**
 * Count native FACE occurrences with the same TShape and Location as face.
 * Both operands are borrowed and must remain alive throughout this synchronous
 * query. The default count ignores orientation. Oriented callers also require the body occurrence orientation.
 *
 * This is an occurrence query, not a body validator, ownership certificate,
 * historical witness or permission to activate a recipe/support declaration.
 */
export function countNativeFaceOccurrences(body: TopoDS_Shape, face: TopoDS_Shape, requireOrientation = false): number {
  const oc = getOC(), faceType = oc.TopAbs_ShapeEnum.TopAbs_FACE;
  if (body.IsNull()) throw new Error('Native face membership requires a non-null body shape.');
  if (face.IsNull() || face.ShapeType() !== faceType)
    throw new Error('Native face membership requires a non-null FACE operand.');
  return withNativeOwners(owners => {
    const explorer = owners.own(new oc.TopExp_Explorer(body, faceType, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0;
    while (explorer.More()) {
      const current = owners.own(explorer.Current());
      if (current.IsNull() || current.ShapeType() !== faceType)
        throw new Error('Native face traversal returned a null or non-FACE occurrence.');
      if (current.IsSame(face)) {
        if (requireOrientation && !current.IsEqual(face)) throw Error('The native face orientation differs from its body occurrence.');
        count++;
      }
      // Each received Current is independently owned. Early release bounds
      // native lifetime; a failed release remains fatal at the arena boundary.
      owners.release(current);
      explorer.Next();
    }
    return count;
  }, () => [], 'Native face membership query or release failed.');
}

/** ModifiedShape can return a canonical orientation. Return the actual oriented
 * occurrence in the result body, matched only by native TShape and Location.
 */
export function uniqueNativeFaceOccurrence(body: TopoDS_Shape, image: TopoDS_Shape): Face {
  const oc = getOC(), faceType = oc.TopAbs_ShapeEnum.TopAbs_FACE;
  if (body.IsNull() || image.IsNull() || image.ShapeType() !== faceType) throw Error('Se requiere una imagen de cara nativa.');
  return withNativeOwners(owners => {
    const explorer = owners.own(new oc.TopExp_Explorer(body, faceType, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let face: Face | undefined;
    while (explorer.More()) {
      const raw = owners.own(explorer.Current());
      if (raw.IsNull() || raw.ShapeType() !== faceType) throw Error('La travesía de caras devolvió una forma no válida.');
      if (raw.IsSame(image)) {
        if (face) throw Error('El cuerpo contiene varias ocurrencias de la misma imagen de cara.');
        const occurrence = owners.own(cast(raw));
        if (!(occurrence instanceof Face)) throw Error('La ocurrencia seleccionada no es una cara.');
        face = occurrence;
      }
      owners.release(raw); explorer.Next();
    }
    if (!face) throw Error('La imagen de cara no pertenece al cuerpo de destino.');
    return face;
  }, face => [face], 'Native face occurrence resolution or release failed.');
}
