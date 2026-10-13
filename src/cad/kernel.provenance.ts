import {
  Edge, Face, Wire, getOC, makeCircle, makeLine, makeThreePointArc,
  makeVertex, measureDistanceBetween, type AnyShape, type Shape3D,
} from 'replicad';
import type { TopoDS_Shape } from 'replicad-opencascadejs';
import type { EntityProfile } from '../sketch/types';
import { validateEntityProfile } from '../sketch/validation';
import type { Plane, PlaneFrame, Vec3 } from './kernel.types';
import { frameDot, framePoint, planarFaceFrame, principalPlaneFrame } from './kernel.frames';
import { castOwnedNativeShape, castOwnedNativeSolid } from './kernel.native';
import { circlePoint, JOIN_TOLERANCE, makeContours, type Contour, type Curve, type Point2 } from './kernel.profiles';

export type PrismDirection = 'positive' | 'negative';
export interface PrismMaterialRegion {
  outer: readonly string[];
  holes: readonly (readonly string[])[];
}
type SourceRole = { entityId: string; entityType: Curve['type'] };
export type PrismFaceBinding =
  | { role: 'startCap' | 'endCap'; target: Face; frame: PlaneFrame }
  | (SourceRole & { role: 'side'; target: Face; frame: PlaneFrame | null });
export type PrismEdgeBinding = SourceRole & { role: 'startRim' | 'endRim'; target: Edge };
export interface PrismDiagnostic { stage: string; message: string }
export type PrismProvenance =
  | { status: 'verified'; direction: PrismDirection; materialRegion: PrismMaterialRegion;
      faces: readonly PrismFaceBinding[]; edges: readonly PrismEdgeBinding[];
      bodyFaces: readonly Face[]; bodyEdges: readonly Edge[];
      /** Diagnostic count only: vertical edges and circular seams have no claimed role. */
      unboundEdgeCount: number }
  | { status: 'unavailable'; diagnostics: readonly PrismDiagnostic[] };

/** Targets are borrowed views of this owner, not transferable native handles.
 * Do not delete/mutate them or use them after dispose. No native target is a saved ID.
 * takeShape transfers only the solid; the provenance pool remains owned here.
 */
export interface OwnedEntityPrism {
  readonly shape: Shape3D;
  readonly provenance: PrismProvenance;
  takeShape(): Shape3D;
  /** Idempotent; attempts every release and reports errors without retrying handles. */
  dispose(): readonly string[];
}

type Deletable = { delete(): void };
class NativeScope {
  private objects: Deletable[] = [];
  own<T extends Deletable>(value: T): T {
    if (this.objects.includes(value)) throw new Error('A native wrapper cannot have two owners.');
    this.objects.push(value); return value;
  }
  take<T extends Deletable>(value: T): T {
    const index = this.objects.indexOf(value);
    if (index < 0) throw new Error('The native wrapper is not owned by this scope.');
    this.objects.splice(index, 1); return value;
  }
  release(value: Deletable): void { this.take(value).delete(); }
  transfer(values: readonly Deletable[]): void {
    if (new Set(values).size !== values.length || values.some(value => !this.objects.includes(value)))
      throw new Error('Invalid native ownership transfer.');
    const transferred = new Set(values);
    this.objects = this.objects.filter(value => !transferred.has(value));
  }
  dispose(): string[] {
    const errors: string[] = [];
    while (this.objects.length) {
      try { this.objects.pop()!.delete(); }
      catch (error) { errors.push(errorMessage(error)); }
    }
    return errors;
  }
}
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
type AddedSource = { curve: Curve; added: Edge };

/** Opt-in primitive producer. Legacy profile construction and the engine do not call it.
 * Supports one finite material region with holes. start/end mean generation order,
 * including negative depth, not coordinate-sorted planes. Splits, booleans,
 * compounds, islands, vertical edges and artificial circle seams are outside its roles.
 */
export function entityProfilePrismWithProvenance(
  profile: EntityProfile, plane: Plane, offset: number, depth: number, frame?: PlaneFrame,
): OwnedEntityPrism {
  if (!Number.isFinite(depth) || Math.abs(depth) < 1e-7)
    throw new Error('La extrusión finita necesita una profundidad distinta de cero.');
  const placement = checkedPlacement(frame ?? principalPlaneFrame(plane, offset));
  const contours = makeContours(validateEntityProfile(profile));
  const scope = new NativeScope();
  let result: OwnedEntityPrism | undefined;
  let constructionFailed = false, constructionError: unknown;
  try {
    const toWorld = (point: Point2): Vec3 => framePoint(placement, ...point);
    const sources: AddedSource[] = [];
    const wires: Wire[] = [], contourFaces: Face[] = [];
    const oc = getOC();
    for (const contour of contours) {
      const maker = scope.own(new oc.BRepBuilderAPI_MakeWire());
      for (const { curve, reverse } of contour.curves) {
        const original = scope.own(curve.type === 'line'
          ? makeLine(toWorld(reverse ? curve.end : curve.start), toWorld(reverse ? curve.start : curve.end))
          : curve.type === 'circle' ? makeCircle(curve.radius, toWorld(curve.center), placement.normal)
            : makeThreePointArc(toWorld(reverse ? curve.end : curve.start),
              toWorld(circlePoint(curve, curve.angle + curve.sweep / 2)), toWorld(reverse ? curve.start : curve.end)));
        maker.Add(original.wrapped);
        if (!maker.IsDone() || maker.Error() !== oc.BRepBuilderAPI_WireError.BRepBuilderAPI_WireDone)
          throw new Error('No se puede construir el contorno de la extrusión.');
        // Edge() is the value copy of the edge actually added, not the original
        // input edge. A later Add or face fix still requires exact final membership.
        sources.push({ curve, added: scope.own(new Edge(maker.Edge())) });
      }
      maker.Build();
      const wire = scope.own(new Wire(maker.Wire()));
      wires.push(wire);
      const faceMaker = scope.own(new oc.BRepBuilderAPI_MakeFace(wire.wrapped, false));
      if (!faceMaker.IsDone()) throw new Error('El contorno no forma una cara.');
      const face = scope.own(new Face(faceMaker.Face()));
      requireValid(face.wrapped, scope, 'El contorno no forma una cara plana válida.');
      contourFaces.push(face);
    }
    const containers = contours.map((contour, index) => {
      const vertex = scope.own(makeVertex(toWorld(contour.curves[0].curve.start)));
      return contourFaces.flatMap((face, candidate) => candidate !== index &&
        measureDistanceBetween(vertex, face) <= JOIN_TOLERANCE ? [candidate] : []);
    });
    const material = containers.flatMap((parents, index) => parents.length % 2 === 0 ? [index] : []);
    if (material.length !== 1 || containers.some(parents => parents.length > 1))
      throw new Error('La correspondencia de extrusión admite un único exterior con agujeros, sin islas.');
    const outer = material[0];
    const holes = containers.flatMap((parents, index) => parents.length === 1 && parents[0] === outer ? [index] : []);
    const faceMaker = scope.own(new oc.BRepBuilderAPI_MakeFace(contourFaces[outer].wrapped));
    holes.forEach(index => faceMaker.Add(wires[index].wrapped));
    if (!faceMaker.IsDone()) throw new Error('No se pueden incorporar los agujeros de la extrusión.');
    const beforeFix = scope.own(new Face(faceMaker.Face()));
    const fixer = scope.own(new oc.ShapeFix_Face(beforeFix.wrapped));
    fixer.FixOrientation();
    // Face() may replace the face; keep both owned copies until cleanup.
    const base = scope.own(new Face(fixer.Face()));
    requireValid(base.wrapped, scope, 'La cara de extrusión corregida no es válida.');
    const vector = scope.own(new oc.gp_Vec(...placement.normal.map(value => value * depth) as Vec3));
    const prism = scope.own(new oc.BRepPrimAPI_MakePrism(base.wrapped, vector, false, true));
    // castOwnedNativeSolid consumes Shape() and owns only its downcast copy.
    const body = scope.own(castOwnedNativeSolid(prism.Shape(), 'La extrusión no produjo un sólido.'));
    requireValid(body.wrapped, scope, 'La extrusión no produjo un BRep válido.');
    const solids = explore(body.wrapped, 'SOLID', scope);
    if (solids.length !== 1) throw new Error('La extrusión debe producir exactamente un sólido.');
    const region: PrismMaterialRegion = { outer: contourIds(contours[outer]), holes: holes.map(index => contourIds(contours[index])) };
    const pool: AnyShape[] = [];
    let provenance: PrismProvenance;
    try {
      const bodyFaces = explore(body.wrapped, 'FACE', scope) as Face[];
      const bodyEdges = explore(body.wrapped, 'EDGE', scope) as Edge[];
      const finalEdges = explore(base.wrapped, 'EDGE', scope) as Edge[];
      const claimedFaces: Face[] = [], claimedEdges: Edge[] = [];
      const bindFace = (raw: TopoDS_Shape, stage: string): Face => {
        const target = uniqueTypedMember(raw, bodyFaces, 'FACE', stage);
        if (claimedFaces.some(face => face.isSame(target))) throw new Error(`${stage}: duplicate face ownership.`);
        claimedFaces.push(target); return target;
      };
      const bindEdge = (raw: TopoDS_Shape, cap: Face, stage: string): Edge => {
        const target = uniqueTypedMember(raw, bodyEdges, 'EDGE', stage);
        const capEdges = explore(cap.wrapped, 'EDGE', scope) as Edge[];
        uniqueTypedMember(target.wrapped, capEdges, 'EDGE', stage + ':cap');
        if (claimedEdges.some(edge => edge.isSame(target))) throw new Error(`${stage}: duplicate rim ownership.`);
        claimedEdges.push(target); return target;
      };
      // Whole-prism calls have no source argument. They identify actual body faces.
      const firstRaw = scope.own(prism.FirstShape()), lastRaw = scope.own(prism.LastShape());
      const first = bindFace(firstRaw, 'startCap'), last = bindFace(lastRaw, 'endCap');
      const faces: PrismFaceBinding[] = [
        { role: 'startCap', target: first, frame: capFrame(first, placement.origin, placement.normal, -Math.sign(depth)) },
        { role: 'endCap', target: last, frame: capFrame(last, addScaled(placement.origin, placement.normal, depth), placement.normal, Math.sign(depth)) },
      ];
      const edges: PrismEdgeBinding[] = [];
      for (const source of sources) {
        const sourceRaw = uniqueTypedMember(source.added.wrapped, finalEdges, 'EDGE', source.curve.id + ':final-source').wrapped;
        if (sources.filter(candidate => candidate.added.wrapped.IsSame(sourceRaw)).length !== 1)
          throw new Error('A final profile edge has multiple source owners.');
        const list = scope.own(prism.Generated(sourceRaw));
        let generated: TopoDS_Shape | undefined, queryError: unknown, queryFailed = false;
        try {
          if (list.Size() !== 1) throw new Error(source.curve.id + ': expected one generated side face.');
          generated = scope.own(list.First());
          const side = bindFace(generated, source.curve.id + ':side');
          const role = { entityId: source.curve.id, entityType: source.curve.type };
          faces.push({ ...role, role: 'side', target: side, frame: source.curve.type === 'line'
            ? anchoredPlanarFrame(side, toWorld(source.curve.start)) : null });
          const startRaw = scope.own(prism.FirstShape(sourceRaw)), endRaw = scope.own(prism.LastShape(sourceRaw));
          edges.push({ ...role, role: 'startRim', target: bindEdge(startRaw, first, source.curve.id + ':startRim') },
            { ...role, role: 'endRim', target: bindEdge(endRaw, last, source.curve.id + ':endRim') });
        } catch (error) { queryError = error; queryFailed = true; }
        finally {
          // Generated returns a copied list; First returns a copied shape value.
          // Always release both, even when a history query or binding fails.
          const releaseErrors: string[] = [];
          for (const value of [generated, list]) if (value) {
            try { scope.release(value); } catch (error) { releaseErrors.push(errorMessage(error)); }
          }
          if (releaseErrors.length) throw new Error([queryFailed ? errorMessage(queryError) : '',
            'History release failed: ' + releaseErrors.join('; ')].filter(Boolean).join('; '));
        }
        if (queryFailed) throw queryError;
      }
      if (finalEdges.length !== sources.length || claimedFaces.length !== bodyFaces.length)
        throw new Error('The primitive face/source inventory is incomplete.');
      pool.push(...bodyFaces, ...bodyEdges);
      provenance = { status: 'verified', direction: depth > 0 ? 'positive' : 'negative', materialRegion: region,
        faces, edges, bodyFaces, bodyEdges, unboundEdgeCount: bodyEdges.length - claimedEdges.length };
    } catch (error) {
      provenance = { status: 'unavailable', diagnostics: [{ stage: 'primitive-history', message: errorMessage(error) }] };
    }
    // A valid primitive survives unavailable correspondence. Never infer a nearest
    // face/edge, enumeration position or replacement source to fill a missing role.
    // Validate the entire transfer before removing any object from the local owner.
    scope.transfer([body, ...pool]);
    result = ownResult(body, pool, provenance);
  } catch (error) {
    constructionFailed = true; constructionError = error; throw error;
  } finally {
    const errors = scope.dispose();
    if (errors.length) {
      const resultErrors = result?.dispose() ?? [];
      throw new Error([constructionFailed ? errorMessage(constructionError) : '',
        `Native primitive cleanup failed: ${[...errors, ...resultErrors].join('; ')}`].filter(Boolean).join('; '));
    }
  }
  return result!;
}

function contourIds(contour: Contour): string[] { return contour.curves.map(({ curve }) => curve.id); }
function checkedPlacement(frame: PlaneFrame): PlaneFrame {
  const copy = { origin: [...frame.origin] as Vec3, normal: [...frame.normal] as Vec3, xDirection: [...frame.xDirection] as Vec3 };
  if (![...copy.origin, ...copy.normal, ...copy.xDirection].every(Number.isFinite) ||
      Math.abs(Math.hypot(...copy.normal) - 1) > 1e-9 || Math.abs(Math.hypot(...copy.xDirection) - 1) > 1e-9 ||
      Math.abs(frameDot(copy.normal, copy.xDirection)) > 1e-9)
    throw new Error('El marco de extrusión debe ser finito y ortonormal.');
  return copy;
}
function addScaled(point: Vec3, direction: Vec3, distance: number): Vec3 {
  return point.map((value, axis) => value + direction[axis] * distance) as Vec3;
}
function anchoredPlanarFrame(face: Face, anchor: Vec3): PlaneFrame {
  if (face.geomType !== 'PLANE') throw new Error('A claimed planar face is not planar.');
  const vectors = new NativeScope();
  let frameFailed = false, frameError: unknown;
  try {
    const normal = vectors.own(face.normalAt()), sample = vectors.own(face.pointOnSurface(.5, .5));
    const outward = normal.toTuple(), sampled = sample.toTuple();
    if (![...anchor, ...sampled, ...outward].every(Number.isFinite) ||
        Math.abs(frameDot(sampled.map((value, axis) => value - anchor[axis]) as Vec3, outward)) > JOIN_TOLERANCE)
      throw new Error('The generating anchor is not on the actual support plane.');
    // The anchor verifies this plane. Preserve the existing support-frame rule:
    // origin is the world origin projected onto the plane, not a tangent anchor.
    return planarFaceFrame(anchor, outward);
  } catch (error) { frameFailed = true; frameError = error; throw error; }
  finally {
    const errors = vectors.dispose();
    if (errors.length) throw new Error([frameFailed ? errorMessage(frameError) : '',
      'Frame temporary release failed: ' + errors.join('; ')].filter(Boolean).join('; '));
  }
}
function capFrame(face: Face, anchor: Vec3, normal: Vec3, sign: number): PlaneFrame {
  const frame = anchoredPlanarFrame(face, anchor);
  if (Math.abs(frameDot(frame.normal, normal) - sign) > 1e-7)
    throw new Error('The actual cap normal disagrees with generation order.');
  return frame;
}
function requireValid(raw: TopoDS_Shape, scope: NativeScope, message: string): void {
  const analyzer = scope.own(new (getOC().BRepCheck_Analyzer)(raw, true, false, false));
  if (!analyzer.IsValid()) throw new Error(message);
}
function explore(raw: TopoDS_Shape, type: 'FACE' | 'EDGE' | 'SOLID', scope: NativeScope): AnyShape[] {
  const oc = getOC(), expected = oc.TopAbs_ShapeEnum[`TopAbs_${type}`];
  const explorer = scope.own(new oc.TopExp_Explorer(raw, expected, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
  const result: AnyShape[] = [];
  while (explorer.More()) {
    // Current() is a copied Shape value. cast consumes it via the existing helper.
    const current = scope.own(castOwnedNativeShape(explorer.Current()));
    if (current.wrapped.ShapeType() !== expected || current.wrapped.IsNull()) {
      throw new Error('Unexpected primitive inventory type.');
    }
    if (result.some(value => value.isSame(current))) scope.release(current);
    else result.push(current);
    explorer.Next();
  }
  return result;
}
function uniqueTypedMember<T extends Face | Edge>(raw: TopoDS_Shape, universe: readonly T[], type: 'FACE' | 'EDGE', stage: string): T {
  if (raw.IsNull() || raw.ShapeType() !== getOC().TopAbs_ShapeEnum[`TopAbs_${type}`])
    throw new Error(`${stage}: expected ${type}.`);
  const matches = universe.filter(value => value.wrapped.IsSame(raw));
  if (matches.length !== 1) throw new Error(`${stage}: expected one exact body member, found ${matches.length}.`);
  return matches[0];
}
function ownResult(initialBody: Shape3D, targets: AnyShape[], provenance: PrismProvenance): OwnedEntityPrism {
  let body: Shape3D | undefined = initialBody, disposed = false;
  const errors: string[] = [];
  return {
    get shape() {
      if (disposed || !body) throw new Error('The primitive body has been transferred or disposed.');
      return body;
    },
    get provenance() {
      if (disposed) throw new Error('The primitive provenance has been disposed.');
      return provenance;
    },
    takeShape() {
      if (disposed || !body) throw new Error('The primitive body has been transferred or disposed.');
      const transferred = body; body = undefined; return transferred;
    },
    dispose() {
      if (disposed) return errors;
      disposed = true;
      for (const target of [...targets].reverse()) {
        try { target.delete(); } catch (error) { errors.push(errorMessage(error)); }
      }
      if (body) { try { body.delete(); } catch (error) { errors.push(errorMessage(error)); } body = undefined; }
      return errors;
    },
  };
}
