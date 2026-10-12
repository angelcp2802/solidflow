import {
  addHolesInFace, assembleWire, basicFaceExtrusion, getOC, makeCircle, makeCompound,
  makeFace, makeLine, makeThreePointArc, makeVertex, measureDistanceBetween,
  revolution, Vector, type Edge, type Face, type Shape3D, type Wire,
} from 'replicad';
import { solveSketch } from '../sketch/solver';
import type { EntityProfile } from '../sketch/types';
import type { Plane, PlaneFrame, Vec3 } from './kernel.types';
import { framePoint, frameYDirection } from './kernel.frames';

export type Point2 = [number, number];
type Line = { id: string; type: 'line'; start: Point2; end: Point2; nodes: [number, number] };
type Circular = { id: string; type: 'circle' | 'arc'; center: Point2; radius: number;
  start: Point2; end: Point2; angle: number; sweep: number; nodes?: [number, number] };
export type Curve = Line | Circular;
export type Contour = { curves: { curve: Curve; reverse: boolean }[] };
export const JOIN_TOLERANCE = 1e-5;
const TAU = Math.PI * 2;
const distance = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const normalizeAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;
export const circlePoint = (curve: Circular, angle: number): Point2 => [
  curve.center[0] + curve.radius * Math.cos(angle), curve.center[1] + curve.radius * Math.sin(angle),
];

export function onSketchPlane(plane: Plane, u: number, v: number, offset: number): Vec3 {
  if (plane === 'XY') return [u, v, offset];
  if (plane === 'XZ') return [u, -offset, v];
  return [offset, u, v];
}

export function solveEntityProfile(profile: EntityProfile): EntityProfile {
  const solved = solveSketch(profile);
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

export function onCircularArc(curve: Circular, point: Point2): boolean {
  if (curve.type === 'circle') return true;
  if (distance(point, curve.start) <= JOIN_TOLERANCE || distance(point, curve.end) <= JOIN_TOLERANCE) return true;
  const angle = Math.atan2(point[1] - curve.center[1], point[0] - curve.center[0]);
  const delta = normalizeAngle(curve.sweep > 0 ? angle - curve.angle : curve.angle - angle);
  return delta <= Math.abs(curve.sweep) + JOIN_TOLERANCE / curve.radius;
}

function circularIntervals(curve: Circular): [number, number][] {
  if (curve.type === 'circle') return [[0, TAU]];
  const start = normalizeAngle(curve.sweep > 0 ? curve.angle : curve.angle + curve.sweep);
  const end = start + Math.abs(curve.sweep);
  return end <= TAU ? [[start, end]] : [[start, TAU], [0, end - TAU]];
}

function intersections(first: Curve, second: Curve): Point2[] {
  if (first.type === 'line' && second.type === 'line') {
    const u = subtract(first.end, first.start), v = subtract(second.end, second.start);
    const between = subtract(second.start, first.start), divisor = cross(u, v);
    const firstLength = Math.hypot(...u), secondLength = Math.hypot(...v);
    if (Math.abs(divisor) < 1e-12 * firstLength * secondLength) {
      if (Math.abs(cross(between, u)) / firstLength > JOIN_TOLERANCE) return [];
      const projection = (point: Point2) => ((point[0] - first.start[0]) * u[0] + (point[1] - first.start[1]) * u[1]) / firstLength;
      const interval = [projection(second.start), projection(second.end)].sort((a, b) => a - b);
      const lower = Math.max(0, interval[0]), upper = Math.min(firstLength, interval[1]);
      if (upper < lower - JOIN_TOLERANCE) return [];
      if (upper - lower > JOIN_TOLERANCE) throw new Error('El croquis contiene líneas superpuestas. Elimina los duplicados.');
      return [[first.start[0] + u[0] * lower / firstLength, first.start[1] + u[1] * lower / firstLength]];
    }
    const t = cross(between, v) / divisor, s = cross(between, u) / divisor;
    if (t < -JOIN_TOLERANCE / firstLength || t > 1 + JOIN_TOLERANCE / firstLength ||
      s < -JOIN_TOLERANCE / secondLength || s > 1 + JOIN_TOLERANCE / secondLength) return [];
    return [[first.start[0] + t * u[0], first.start[1] + t * u[1]]];
  }
  if (first.type === 'line' || second.type === 'line') {
    const line = first.type === 'line' ? first : second as Line;
    const circle = first.type === 'line' ? second as Circular : first;
    const direction = subtract(line.end, line.start), length = Math.hypot(...direction);
    const unit: Point2 = [direction[0] / length, direction[1] / length];
    const toCenter = subtract(circle.center, line.start);
    const projection = toCenter[0] * unit[0] + toCenter[1] * unit[1];
    const perpendicular = Math.abs(cross(toCenter, unit));
    if (perpendicular > circle.radius + JOIN_TOLERANCE) return [];
    const delta = Math.sqrt(Math.max(0, circle.radius ** 2 - perpendicular ** 2));
    return [...new Set([projection - delta, projection + delta])]
      .filter((t) => t >= -JOIN_TOLERANCE && t <= length + JOIN_TOLERANCE)
      .map((t): Point2 => [line.start[0] + t * unit[0], line.start[1] + t * unit[1]])
      .filter((point) => onCircularArc(circle, point));
  }
  const d = distance(first.center, second.center);
  if (d <= JOIN_TOLERANCE && Math.abs(first.radius - second.radius) <= JOIN_TOLERANCE) {
    const hits: Point2[] = [];
    for (const a of circularIntervals(first)) for (const b of circularIntervals(second)) {
      const lower = Math.max(a[0], b[0]), upper = Math.min(a[1], b[1]);
      if ((upper - lower) * first.radius > JOIN_TOLERANCE) throw new Error('El croquis contiene arcos o círculos superpuestos.');
      if ((upper - lower) * first.radius >= -JOIN_TOLERANCE) hits.push(circlePoint(first, lower));
    }
    // The periodic seam is also a possible shared endpoint.
    for (const point of [first.start, first.end, second.start, second.end]) {
      if (onCircularArc(first, point) && onCircularArc(second, point)) hits.push(point);
    }
    return hits;
  }
  if (d <= JOIN_TOLERANCE || d > first.radius + second.radius + JOIN_TOLERANCE ||
    d < Math.abs(first.radius - second.radius) - JOIN_TOLERANCE) return [];
  const along = (first.radius ** 2 - second.radius ** 2 + d ** 2) / (2 * d);
  const height = Math.sqrt(Math.max(0, first.radius ** 2 - along ** 2));
  const unit: Point2 = [(second.center[0] - first.center[0]) / d, (second.center[1] - first.center[1]) / d];
  const base: Point2 = [first.center[0] + along * unit[0], first.center[1] + along * unit[1]];
  return [-1, 1].map((sign): Point2 => [base[0] - sign * height * unit[1], base[1] + sign * height * unit[0]])
    .filter((point) => onCircularArc(first, point) && onCircularArc(second, point));
}

/** Shared analytic validation for selected open paths and closed material contours. */
export function makeProfileCurves(profile: EntityProfile): { curves: Curve[]; nodes: Point2[] } {
  const points = new Map(profile.points.map((point) => [point.id, [point.x, point.y] as Point2]));
  points.set('origin', [0, 0]);
  const nodes: Point2[] = [];
  const node = (point: Point2): number => {
    const matches = nodes.flatMap((candidate, index) => distance(candidate, point) <= JOIN_TOLERANCE ? [index] : []);
    if (matches.length > 1) throw new Error('Hay extremos demasiado próximos para identificar un contorno sin ambigüedad.');
    if (matches.length) return matches[0];
    nodes.push(point);
    return nodes.length - 1;
  };
  const point = (id: string): Point2 => {
    const found = points.get(id);
    if (!found) throw new Error(`No se encuentra el punto ${id}.`);
    return found;
  };
  const curves: Curve[] = profile.entities.filter((entity) => !entity.construction).map((entity): Curve => {
    if (entity.type === 'circle') {
      const center = point(entity.center), start: Point2 = [center[0] + entity.radius, center[1]];
      return { id: entity.id, type: 'circle', center, radius: entity.radius, start, end: start, angle: 0, sweep: TAU };
    }
    const ids: [number, number] = [node(point(entity.start)), node(point(entity.end))];
    const start = nodes[ids[0]], end = nodes[ids[1]];
    if (ids[0] === ids[1]) throw new Error('Una línea o arco tiene extremos coincidentes. Usa un círculo para un contorno circular completo.');
    if (entity.type === 'line') return { id: entity.id, type: 'line', start, end, nodes: ids };
    const center = point(entity.center), radius = distance(center, start);
    if (radius < .01 || Math.abs(radius - distance(center, end)) > JOIN_TOLERANCE * 2) {
      throw new Error('El arco no tiene un radio válido y constante tras resolver el croquis.');
    }
    const angle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
    const sweep = entity.clockwise ? -normalizeAngle(angle - endAngle) : normalizeAngle(endAngle - angle);
    return { id: entity.id, type: 'arc', center, radius, start, end, angle, sweep, nodes: ids };
  });
  if (!curves.length) throw new Error('El croquis está vacío o sólo contiene geometría de construcción. Dibuja un contorno cerrado.');
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
    const first = curves[i], second = curves[j];
    for (const hit of intersections(first, second)) {
      const sharedEndpoint = first.nodes && second.nodes && first.nodes.some((id) =>
        second.nodes!.includes(id) && distance(nodes[id], hit) <= JOIN_TOLERANCE * 2);
      if (!sharedEndpoint) throw new Error('Los contornos se cruzan o se tocan. Separa las intersecciones y los contactos ambiguos.');
    }
  }
  return { curves, nodes };
}

export function makeContours(profile: EntityProfile): Contour[] {
  const { curves, nodes } = makeProfileCurves(profile);
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

function curveXBounds(curve: Curve): [number, number] {
  const coordinates = [curve.start[0], curve.end[0]];
  if (curve.type !== 'line') for (const angle of [0, Math.PI]) {
    const point = circlePoint(curve, angle);
    if (onCircularArc(curve, point)) coordinates.push(point[0]);
  }
  return [Math.min(...coordinates), Math.max(...coordinates)];
}

export function entityRevolutionSide(profile: EntityProfile): number {
  const curves = makeContours(profile).flatMap((contour) => contour.curves.map(({ curve }) => curve));
  const bounds = curves.map(curveXBounds);
  const minimum = Math.min(...bounds.map(([min]) => min)), maximum = Math.max(...bounds.map(([, max]) => max));
  if (minimum < -JOIN_TOLERANCE && maximum > JOIN_TOLERANCE) {
    throw new Error('El perfil de revolución cruza el eje Y del croquis. Sitúa todos los contornos a un lado del eje.');
  }
  if (curves.some((curve) => curve.type === 'circle' && Math.abs(curve.center[0]) - curve.radius <= JOIN_TOLERANCE)) {
    throw new Error('Un círculo de revolución debe estar separado del eje Y para evitar un punto singular.');
  }
  return minimum < -JOIN_TOLERANCE ? -1 : 1;
}

/** Closed contours use even/odd nesting: material, hole, island, hole, ... */
export function entityProfileSolid(profile: EntityProfile, plane: Plane, offset: number,
  operation: { type: 'extrude'; depth: number } | { type: 'revolve'; angle: number }, frame?: PlaneFrame): Shape3D {
  const contours = makeContours(profile);
  if (operation.type === 'revolve') entityRevolutionSide(profile);
  const toWorld = (point: Point2) => frame ? framePoint(frame, point[0], point[1]) : onSketchPlane(plane, point[0], point[1], offset);
  const normal: Vec3 = frame?.normal ?? (plane === 'XY' ? [0, 0, 1] : plane === 'XZ' ? [0, -1, 0] : [1, 0, 0]);
  const wires: Wire[] = [], faces: Face[] = [], solids: Shape3D[] = [];
  try {
    for (const contour of contours) {
      const edges: Edge[] = [];
      try {
        for (const { curve, reverse } of contour.curves) {
          if (curve.type === 'line') edges.push(makeLine(toWorld(reverse ? curve.end : curve.start), toWorld(reverse ? curve.start : curve.end)));
          else if (curve.type === 'circle') edges.push(makeCircle(curve.radius, toWorld(curve.center), normal));
          else edges.push(makeThreePointArc(toWorld(reverse ? curve.end : curve.start),
            toWorld(circlePoint(curve, curve.angle + curve.sweep / 2)), toWorld(reverse ? curve.start : curve.end)));
        }
        const wire = assembleWire(edges);
        wires.push(wire);
        const face = makeFace(wire);
        faces.push(face);
        const analyzer = new (getOC().BRepCheck_Analyzer)(face.wrapped, true, false, false);
        try { if (!analyzer.IsValid()) throw new Error('Un contorno no forma una cara plana válida. Revisa sus intersecciones y cierre.'); }
        finally { analyzer.delete(); }
      } finally { edges.forEach((edge) => edge.delete()); }
    }
    const containers = contours.map((contour, index) => {
      const vertex = makeVertex(toWorld(contour.curves[0].curve.start));
      try { return faces.flatMap((face, candidate) => candidate !== index && measureDistanceBetween(vertex, face) <= JOIN_TOLERANCE ? [candidate] : []); }
      finally { vertex.delete(); }
    });
    for (let index = 0; index < contours.length; index++) {
      const depth = containers[index].length;
      if (depth % 2) continue;
      const holes = wires.filter((_, hole) => containers[hole].length === depth + 1 && containers[hole].includes(index));
      const face = holes.length ? addHolesInFace(faces[index], holes) : faces[index].clone();
      try {
        if (operation.type === 'extrude') {
          const direction = new Vector(normal.map((value) => value * operation.depth) as Vec3);
          try { solids.push(basicFaceExtrusion(face, direction)); } finally { direction.delete(); }
        } else {
          solids.push(revolution(face, frame?.origin ?? onSketchPlane(plane, 0, 0, offset),
            frame ? frameYDirection(frame) : plane === 'XY' ? [0, 1, 0] : [0, 0, 1], operation.angle));
        }
      } finally { face.delete(); }
    }
    if (solids.length === 1) return solids.pop()!;
    return makeCompound(solids).asShape3D();
  } finally {
    solids.forEach((solid) => solid.delete()); faces.forEach((face) => face.delete()); wires.forEach((wire) => wire.delete());
  }
}
