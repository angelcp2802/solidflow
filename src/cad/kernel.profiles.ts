import {
  addHolesInFace, assembleWire, basicFaceExtrusion, Compound, getOC, makeCircle,
  makeFace, makeLine, makeThreePointArc, makeVertex, measureDistanceBetween,
  revolution, Vector, type Edge, type Face, type Shape3D, type Wire,
} from 'replicad';
import { solveSketch } from '../sketch/solver';
import type { EntityProfile, SketchSolveResult } from '../sketch/types';
import type { TopoDS_Compound } from 'replicad-opencascadejs';
import type { Plane, PlaneFrame, Vec3 } from './kernel.types';
import { framePoint, frameYDirection } from './kernel.frames';
import { withNativeOwners } from './kernel.native-ownership';
import { revolutionRadialCoordinate, type ResolvedRevolutionAxis } from './revolutionAxis';

import { JOIN_TOLERANCE, circlePoint, makeProfileCurves, onCircularArc, type Contour, type Curve, type Point2 } from './kernel.profile-curves';
export { JOIN_TOLERANCE, circlePoint, makeProfileCurves, onCircularArc, type Contour, type Curve, type Point2 } from './kernel.profile-curves';

export function onSketchPlane(plane: Plane, u: number, v: number, offset: number): Vec3 {
  if (plane === 'XY') return [u, v, offset];
  if (plane === 'XZ') return [u, -offset, v];
  return [offset, u, v];
}

/** Preserve the real solve result; failed geometry remains explicitly failed. */
export function solveEntityProfileResult(profile: EntityProfile): SketchSolveResult {
  return solveSketch(profile);
}

export function solveEntityProfile(profile: EntityProfile): EntityProfile {
  const solved = solveEntityProfileResult(profile);
  if (solved.status !== 'underdefined' && solved.status !== 'fullyDefined') {
    throw new Error(`No se puede resolver el croquis (${solved.status}): ${solved.message}`);
  }
  return solved.profile;
}

/** Values and annotation roles are absent; legacy constraint roles and connectivity are not. */
export function entityProfileStructure(profile: EntityProfile): unknown {
  const ordinalGroups = (entries: [string, number][]): string[][] => {
    const sorted = [...entries].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const groups: { coordinate: number; ids: string[] }[] = [];
    for (const [id, coordinate] of sorted) {
      const previous = groups.at(-1);
      if (previous && Math.abs(coordinate - previous.coordinate) <= JOIN_TOLERANCE) previous.ids.push(id);
      else groups.push({ coordinate, ids: [id] });
    }
    return groups.map((group) => group.ids.sort());
  };
  return [
    profile.points.map((point) => point.id).sort(),
    profile.entities.map((entity) => entity.type === 'line'
      ? [entity.id, entity.type, entity.construction, entity.start, entity.end]
      : entity.type === 'circle' ? [entity.id, entity.type, entity.construction, entity.center]
        : [entity.id, entity.type, entity.construction, entity.center, entity.start, entity.end, entity.clockwise])
      .sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0),
    // Annotation roles do not identify material. Keep the legacy descriptor for
    // existing driving dimensions when their mode changes to driven and back.
    profile.constraints.filter((constraint) => !('value' in constraint) ||
      (constraint.referenceRole ?? (constraint.driven ? 'annotation' : 'constraint')) !== 'annotation')
      .map((constraint) => {
        // Offset distance seeds are continuous geometry, like dimension values.
        // Keep side, ownership and discrete join branches in the topology key.
        const structural = constraint.type === 'offset' ? { ...constraint, images: constraint.images.map(image => ({
          side: image.side, entityIds: image.entityIds, joins: image.joins,
          // Explicit free and legacy absence have the same topology. Alignment
          // adds endpoint stations and must participate in structural naming.
          ...(image.lineEndpointMode === 'aligned' ? { lineEndpointMode: 'aligned' } : {}),
          // Releasing a following boundary removes a station equation. All
          // released boundaries have the same structure as legacy free mode.
          ...(image.lineEndpointFollowing?.some(Boolean) ? { lineEndpointFollowing: image.lineEndpointFollowing } : {}),
        })) } : constraint.type === 'equalOffsetDistance' ? { ...constraint,
          // Membership is unordered; the solver's first reference is only an
          // equation basis and cannot change the material naming descriptor.
          members: [...constraint.members].sort((a, b) => a.offsetId < b.offsetId ? -1 : a.offsetId > b.offsetId ? 1
            : a.side < b.side ? -1 : a.side > b.side ? 1 : 0),
        } : constraint;
        return Object.fromEntries(Object.entries(structural)
          .filter(([key]) => !['value', 'x', 'y', 'driven', 'referenceRole'].includes(key)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
      })
      .sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0),
    // Ordinal roles contain no coordinates or radii. They guard a symmetric
    // profile whose point/entity IDs exchange geometric roles during an edit.
    ordinalGroups([['origin', 0], ...profile.points.map((point): [string, number] => [point.id, point.x])]),
    ordinalGroups([['origin', 0], ...profile.points.map((point): [string, number] => [point.id, point.y])]),
    ordinalGroups(profile.entities.flatMap((entity): [string, number][] => entity.type === 'circle' ? [[entity.id, entity.radius]] : [])),
  ];
}

export function makeContours(profile: EntityProfile, derivedArcs = false): Contour[] {
  const { curves, nodes } = makeProfileCurves(profile, derivedArcs);
  const adjacency = nodes.map(() => [] as number[]);
  curves.forEach((curve, index) => curve.nodes?.forEach((id) => adjacency[id].push(index)));
  if (adjacency.some((edges) => edges.length !== 2)) {
    throw new Error('El croquis contiene un contorno abierto o una ramificación. Cada extremo debe unir exactamente dos entidades.');
  }
  const used = new Set<number>();
  const contours: Contour[] = [];
  curves.forEach((curve, index) => {
    if (used.has(index)) return;
    if (!curve.nodes) { used.add(index); contours.push({ curves: [{ curve, reverse: false }] }); return; }
    const entries: Contour['curves'] = [];
    const startNode = curve.nodes[0];
    let currentNode = startNode, currentEdge = index;
    do {
      if (used.has(currentEdge)) throw new Error('No se puede ordenar el contorno cerrado sin ambigüedad.');
      used.add(currentEdge);
      const current = curves[currentEdge], reverse = current.nodes![0] !== currentNode;
      entries.push({ curve: current, reverse });
      currentNode = current.nodes![reverse ? 0 : 1];
      currentEdge = adjacency[currentNode].find((edge) => !used.has(edge)) ?? -1;
    } while (currentNode !== startNode && currentEdge >= 0);
    if (currentNode !== startNode) throw new Error('El contorno no está cerrado.');
    contours.push({ curves: entries });
  });
  return contours;
}

function curveRadialBounds(curve: Curve, axis?: ResolvedRevolutionAxis): [number, number] {
  const radial = (point: Point2) => axis ? revolutionRadialCoordinate(point, axis) : point[0];
  const coordinates = [radial(curve.start), radial(curve.end)];
  const extremum = axis ? Math.atan2(axis.radialDirection[1], axis.radialDirection[0]) : 0;
  if (curve.type !== 'line') for (const angle of [extremum, extremum + Math.PI]) {
    const point = circlePoint(curve, angle);
    if (onCircularArc(curve, point)) coordinates.push(radial(point));
  }
  return [Math.min(...coordinates), Math.max(...coordinates)];
}

export function entityRevolutionSide(profile: EntityProfile, axis?: ResolvedRevolutionAxis, derivedArcs = false): number {
  const curves = makeContours(profile, derivedArcs).flatMap((contour) => contour.curves.map(({ curve }) => curve));
  const bounds = curves.map(curve => curveRadialBounds(curve, axis));
  const minimum = Math.min(...bounds.map(([min]) => min)), maximum = Math.max(...bounds.map(([, max]) => max));
  if (minimum < -JOIN_TOLERANCE && maximum > JOIN_TOLERANCE) {
    throw new Error(`El perfil de revolución cruza ${!axis || axis.legacy ? 'el eje Y del croquis' : 'el eje seleccionado'}. Sitúa todos los contornos a un lado del eje.`);
  }
  if (curves.some((curve) => curve.type === 'circle' && Math.abs(axis ? revolutionRadialCoordinate(curve.center, axis) : curve.center[0]) - curve.radius <= JOIN_TOLERANCE)) {
    throw new Error(`Un círculo de revolución debe estar separado ${!axis || axis.legacy ? 'del eje Y' : 'del eje seleccionado'} para evitar un punto singular.`);
  }
  return minimum < -JOIN_TOLERANCE ? -1 : 1;
}

/** Closed contours use even/odd nesting: material, hole, island, hole, ... */
export function entityProfileSolid(profile: EntityProfile, plane: Plane, offset: number,
  operation: { type: 'extrude'; depth: number } | { type: 'revolve'; angle: number; axis?: ResolvedRevolutionAxis; startAngle?: number }, frame?: PlaneFrame, derivedArcs = false): Shape3D {
  const contours = makeContours(profile, derivedArcs);
  if (operation.type === 'revolve') entityRevolutionSide(profile, operation.axis, derivedArcs);
  const toWorld = (point: Point2) => frame ? framePoint(frame, point[0], point[1]) : onSketchPlane(plane, point[0], point[1], offset);
  const normal: Vec3 = frame?.normal ?? (plane === 'XY' ? [0, 0, 1] : plane === 'XZ' ? [0, -1, 0] : [1, 0, 0]);
  return withNativeOwners(owners => {
    const wires: Wire[] = [], faces: Face[] = [], solids: Shape3D[] = [];
    for (const contour of contours) {
      // Transfer wire/face together only after their edges/analyzer release succeeds.
      const built = withNativeOwners(contourOwners => {
        const edges: Edge[] = [];
        for (const { curve, reverse } of contour.curves) {
          if (curve.type === 'line') edges.push(contourOwners.own(makeLine(toWorld(reverse ? curve.end : curve.start), toWorld(reverse ? curve.start : curve.end))));
          else if (curve.type === 'circle') edges.push(contourOwners.own(makeCircle(curve.radius, toWorld(curve.center), normal)));
          else edges.push(contourOwners.own(makeThreePointArc(toWorld(reverse ? curve.end : curve.start),
            toWorld(circlePoint(curve, curve.angle + curve.sweep / 2)), toWorld(reverse ? curve.start : curve.end))));
        }
        const wire = contourOwners.own(assembleWire(edges));
        const face = contourOwners.own(makeFace(wire));
        const analyzer = contourOwners.own(new (getOC().BRepCheck_Analyzer)(face.wrapped, true, false, false));
        if (!analyzer.IsValid()) throw new Error('Un contorno no forma una cara plana válida. Revisa sus intersecciones y cierre.');
        return { wire, face };
      }, result => [result.wire, result.face], 'Entity contour construction or release failed.');
      owners.ownAll([built.wire, built.face]);
      wires.push(built.wire);
      faces.push(built.face);
    }
    const containers = contours.map((contour, index) => withNativeOwners(vertexOwners => {
      const vertex = vertexOwners.own(makeVertex(toWorld(contour.curves[0].curve.start)));
      return faces.flatMap((face, candidate) => candidate !== index && measureDistanceBetween(vertex, face) <= JOIN_TOLERANCE ? [candidate] : []);
    }, undefined, 'Entity contour containment or release failed.'));
    for (let index = 0; index < contours.length; index++) {
      const depth = containers[index].length;
      if (depth % 2) continue;
      const holes = wires.filter((_, hole) => containers[hole].length === depth + 1 && containers[hole].includes(index));
      // Retain the result until its temporary face/direction have been released.
      const solid = withNativeOwners(regionOwners => {
        const face = regionOwners.own(holes.length ? addHolesInFace(faces[index], holes) : faces[index].clone());
        if (operation.type === 'extrude') {
          const direction = regionOwners.own(new Vector(normal.map((value) => value * operation.depth) as Vec3));
          return regionOwners.own(basicFaceExtrusion(face, direction));
        }
        const origin = operation.axis?.origin ?? frame?.origin ?? onSketchPlane(plane, 0, 0, offset);
        const direction: Vec3 = operation.axis?.direction ?? (frame ? frameYDirection(frame) : plane === 'XY' ? [0, 1, 0] : [0, 0, 1]);
        const solid = regionOwners.own(revolution(face, origin, direction, operation.angle));
        return regionOwners.own(operation.startAngle ? solid.rotate(operation.startAngle, origin, direction) : solid);
      }, result => [result], 'Entity region construction or release failed.');
      solids.push(owners.own(solid));
    }
    if (solids.length === 1) return solids[0];
    // makeCompound consumes its inputs. Build the same compound without consuming
    // these arena-owned solids, and keep exactly one owner of its raw embind object.
    const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder());
    let nativeCompound: TopoDS_Compound | undefined, adopted = false;
    owners.own({ delete: () => { if (!adopted) nativeCompound?.delete(); } });
    nativeCompound = new oc.TopoDS_Compound();
    builder.MakeCompound(nativeCompound);
    for (const solid of solids) builder.Add(nativeCompound, solid.wrapped);
    const compound = new Compound(nativeCompound);
    adopted = true; // Plain disarm before fallible wrapper registration.
    return owners.own(compound).asShape3D();
  }, result => [result], 'Entity profile construction or release failed.');
}
