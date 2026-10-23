import { cast, getOC, Sketch, Wire } from 'replicad';
import { framePoint } from './kernel.frames';
import { withNativeOwners } from './kernel.native-ownership';
import type { PlaneFrame, SketchFeature, Vec3 } from './kernel.types';

/** Ordinary primitive construction only; entity profiles retain their own route. */
export function makeOwnedPrimitiveSketch(feature: SketchFeature, offset = feature.offset, frame?: PlaneFrame): Sketch {
  if (feature.profile.kind === 'entities') throw new Error('El croquis multientidad requiere construir sus contornos.');
  const profile = feature.profile;
  return withNativeOwners(owners => {
    const oc = getOC(), normalInput: Vec3 = frame ? [...frame.normal] : feature.plane === 'XY' ? [0, 0, 1]
      : feature.plane === 'XZ' ? [0, -1, 0] : [1, 0, 0],
      xInput: Vec3 = frame ? [...frame.xDirection] : feature.plane === 'YZ' ? [0, 1, 0] : [1, 0, 0],
      center: Vec3 = frame ? framePoint(frame, profile.center[0], profile.center[1]) : feature.plane === 'XY'
        ? [profile.center[0], profile.center[1], offset] : feature.plane === 'XZ'
          ? [profile.center[0], -offset, profile.center[1]] : [offset, profile.center[0], profile.center[1]];
    const normal = owners.own(new oc.gp_Vec(...normalInput)), x = owners.own(new oc.gp_Vec(...xInput));
    // A support Plane was constructed and then cloned by the SDK factories.
    // Named planes were constructed once. Preserve both normalization stages.
    for (let stage = 0; stage < (frame ? 2 : 1); stage++) { normal.Normalize(); x.Normalize(); }
    const coordinates = (point: { X(): number; Y(): number; Z(): number }): Vec3 => [point.X(), point.Y(), point.Z()];
    const direction = coordinates(normal), location = owners.own(new oc.gp_Pnt(...center)),
      normalDirection = owners.own(new oc.gp_Dir(...direction)), xDirection = owners.own(new oc.gp_Dir(...coordinates(x))),
      global = owners.own(new oc.gp_Ax3()), local = owners.own(new oc.gp_Ax3(location, normalDirection, xDirection)),
      toLocal = owners.own(new oc.gp_Trsf()), toWorld = owners.own(new oc.gp_Trsf());
    toLocal.SetTransformation(global, local); toWorld.SetTransformation(local, global);
    const transform = (point: Vec3, transformation: typeof toLocal): Vec3 => {
      const input = owners.own(new oc.gp_Pnt(...point)), result = owners.own(input.Transformed(transformation));
      return coordinates(result);
    };
    const edges: ReturnType<InstanceType<typeof oc.BRepBuilderAPI_MakeEdge>['Edge']>[] = [];
    if (profile.kind === 'rectangle') {
      let previous = transform([-profile.width / 2, -profile.height / 2, 0], toWorld);
      for (const [du, dv] of [[profile.width, 0], [0, profile.height], [-profile.width, 0], [0, -profile.height]]) {
        const p = transform(previous, toLocal), next = transform([p[0] + du, p[1] + dv, 0], toWorld),
          first = owners.own(new oc.gp_Pnt(...previous)), second = owners.own(new oc.gp_Pnt(...next)),
          builder = owners.own(new oc.BRepBuilderAPI_MakeEdge(first, second));
        edges.push(owners.own(builder.Edge())); previous = next;
      }
    } else {
      // Keep the SDK circle's native default X/seam; its Plane.xDir was unused.
      const axis = owners.own(new oc.gp_Ax2(location, normalDirection)), circle = owners.own(new oc.gp_Circ(axis, profile.radius)),
        builder = owners.own(new oc.BRepBuilderAPI_MakeEdge(circle));
      edges.push(owners.own(builder.Edge()));
    }
    const builder = owners.own(new oc.BRepBuilderAPI_MakeWire());
    for (const edge of edges) builder.Add(edge);
    builder.Build();
    const error = builder.Error();
    if (error !== oc.BRepBuilderAPI_WireError.BRepBuilderAPI_WireDone) {
      const names = new Map([[oc.BRepBuilderAPI_WireError.BRepBuilderAPI_EmptyWire, 'empty wire'],
        [oc.BRepBuilderAPI_WireError.BRepBuilderAPI_NonManifoldWire, 'non manifold wire'],
        [oc.BRepBuilderAPI_WireError.BRepBuilderAPI_DisconnectedWire, 'disconnected wire']]);
      throw new Error('Failed to build the wire, ' + (names.get(error) ?? 'unknown error'));
    }
    const raw = owners.own(builder.Wire()), wire = owners.own(cast(raw));
    if (!(wire instanceof Wire)) throw new Error('El perfil primitivo no produjo un contorno.');
    const sketch = new Sketch(wire, { defaultOrigin: [...center], defaultDirection: [...direction] });
    // Sketch is a JS aggregate. Own its received children separately so a
    // failed result transfer still drains all three after any release failure.
    owners.ownAll([sketch.defaultOrigin, sketch.defaultDirection]);
    return sketch;
  }, sketch => [sketch.wire, sketch.defaultOrigin, sketch.defaultDirection], 'Primitive sketch construction or release failed.');
}
