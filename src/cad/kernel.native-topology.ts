import { cast, getOC, type AnyShape, type Edge, type Face, type Solid, type Wire, type Vertex } from 'replicad';
import { withNativeOwners } from './kernel.native-ownership';

interface NativeTopology { face: Face; edge: Edge; solid: Solid; wire: Wire; vertex: Vertex }

/**
 * Borrow a shape and return owned unique topology wrappers in explorer order.
 * Own every Current value, including duplicate occurrences, independently of
 * the returned downcast wrappers. No upstream iterator hides raw allocations.
 */
export function ownedNativeTopology<K extends keyof NativeTopology>(shape: AnyShape, kind: K): NativeTopology[K][] {
  return withNativeOwners(owners => {
    const oc = getOC(), types = { face: oc.TopAbs_ShapeEnum.TopAbs_FACE, edge: oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      solid: oc.TopAbs_ShapeEnum.TopAbs_SOLID, wire: oc.TopAbs_ShapeEnum.TopAbs_WIRE, vertex: oc.TopAbs_ShapeEnum.TopAbs_VERTEX };
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, types[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    const seen: ReturnType<typeof explorer.Current>[] = [], result: NativeTopology[K][] = [];
    while (explorer.More()) {
      const raw = owners.own(explorer.Current());
      if (!seen.some(value => value.IsSame(raw))) {
        seen.push(raw);
        result.push(owners.own(cast(raw)) as NativeTopology[K]);
      }
      explorer.Next();
    }
    return result;
  }, result => result, 'Native topology enumeration or release failed.');
}
