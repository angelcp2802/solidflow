import { getOC } from 'replicad';
import type { TopoDS_Shape } from 'replicad-opencascadejs';
import { withNativeOwners } from './kernel.native-ownership';

/**
 * Count native FACE occurrences with the same TShape and Location as face.
 * Both operands are borrowed and must remain alive throughout this synchronous
 * query. Orientation is deliberately not part of IsSame identity.
 *
 * This is an occurrence query, not a body validator, ownership certificate,
 * historical witness or permission to activate a recipe/support declaration.
 */
export function countNativeFaceOccurrences(body: TopoDS_Shape, face: TopoDS_Shape): number {
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
      if (current.IsSame(face)) count++;
      // Each received Current is independently owned. Early release bounds
      // native lifetime; a failed release remains fatal at the arena boundary.
      owners.release(current);
      explorer.Next();
    }
    return count;
  }, () => [], 'Native face membership query or release failed.');
}
