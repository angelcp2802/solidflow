import { assembleWire, cast, Edge, getOC, makeAx2, makeFace, makeLine, makeThreePointArc,
  makeVertex, measureDistanceBetween, type Face, type Shape3D, type Wire } from 'replicad';
import type { EntityProfile } from '../sketch/types';
import type { LoftFeature, LoftSection, PlaneFrame, Profile, SweepFeature, Vec3 } from './kernel.types';
import { circlePoint, JOIN_TOLERANCE, makeContours, makeProfileCurves, onCircularArc, type Contour, type Point2 } from './kernel.profiles';
import { frameCross, frameDot, framePoint, frameYDirection } from './kernel.frames';

export interface ResolvedSection { profile: Profile; frame: PlaneFrame }
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((value, index) => value - b[index]));

/** Legacy seams are the local +X radius or the lower-left rectangle corner, traversed CCW. */
function asEntities(profile: Profile): EntityProfile {
  if (profile.kind === 'entities') return profile;
  const [x, y] = profile.center;
  if (profile.kind === 'circle') return { kind: 'entities', points: [{ id: 'center', x, y }], constraints: [],
    entities: [{ id: 'circle', type: 'circle', center: 'center', radius: profile.radius, construction: false }] };
  const w = profile.width / 2, h = profile.height / 2;
  return { kind: 'entities', constraints: [], points: [
    { id: 'a', x: x - w, y: y - h }, { id: 'b', x: x + w, y: y - h },
    { id: 'c', x: x + w, y: y + h }, { id: 'd', x: x - w, y: y + h }],
  entities: ['a', 'b', 'c', 'd'].map((start, index, ids) => ({
    id: `side-${index}`, type: 'line', start, end: ids[(index + 1) % 4], construction: false,
  })) };
}

function orderedContour(profile: Profile, seam?: Pick<LoftSection, 'startEntityId' | 'reversed'>): Contour {
  const contours = makeContours(asEntities(profile));
  if (contours.length !== 1) throw new Error('Barrido y recubrir requieren un único contorno cerrado simple, sin agujeros ni islas.');
  let entries = contours[0].curves;
  if (!seam) return { curves: entries };
  if (profile.kind !== 'entities') {
    if (seam.startEntityId !== null) throw new Error('El perfil clásico utiliza su unión local; no admite una entidad inicial.');
  } else if (entries.length > 1 && !seam.startEntityId) {
    throw new Error('Selecciona una entidad inicial para fijar la correspondencia de esta sección.');
  }
  const start = seam.startEntityId === null ? 0 : entries.findIndex(({ curve }) => curve.id === seam.startEntityId);
  if (start < 0) throw new Error('La entidad inicial de la sección ha desaparecido o es de construcción. Recupera la correspondencia.');
  entries = [...entries.slice(start), ...entries.slice(0, start)];
  if (entries[0].reverse !== seam.reversed) {
    entries = [entries[0], ...entries.slice(1).reverse()].map(({ curve, reverse }) => ({ curve, reverse: !reverse }));
  }
  return { curves: entries };
}

/** A circle's analytic seam follows frame.X, including on inclined or reversed supports. */
function circleEdge(radius: number, center: Vec3, frame: PlaneFrame, reverse: boolean): Edge {
  const oc = getOC();
  const axis = makeAx2(center, frame.normal, frame.xDirection);
  const circle = new oc.gp_Circ(axis, radius);
  const builder = new oc.BRepBuilderAPI_MakeEdge(circle);
  try {
    const edge = new Edge(builder.Edge());
    if (!reverse) return edge;
    try { return cast(edge.wrapped.Reversed()) as Edge; } finally { edge.delete(); }
  } finally { builder.delete(); circle.delete(); axis.delete(); }
}

function contourWire(contour: Contour, frame: PlaneFrame): Wire {
  const toWorld = (point: Point2) => framePoint(frame, ...point);
  const edges: Edge[] = [];
  try {
    for (const { curve, reverse } of contour.curves) {
      if (curve.type === 'line') edges.push(makeLine(toWorld(reverse ? curve.end : curve.start), toWorld(reverse ? curve.start : curve.end)));
      else if (curve.type === 'circle') edges.push(circleEdge(curve.radius, toWorld(curve.center), frame, reverse));
      else edges.push(makeThreePointArc(toWorld(reverse ? curve.end : curve.start),
        toWorld(circlePoint(curve, curve.angle + curve.sweep / 2)), toWorld(reverse ? curve.start : curve.end)));
    }
    return assembleWire(edges);
  } finally { edges.forEach((edge) => edge.delete()); }
}

function checkedFace(wire: Wire): Face {
  const face = makeFace(wire);
  const analyzer = new (getOC().BRepCheck_Analyzer)(face.wrapped, true, false, false);
  try {
    if (!analyzer.IsValid()) throw new Error('La sección no forma una cara plana válida. Revisa el cierre y sus intersecciones.');
    return face;
  } catch (error) { face.delete(); throw error; }
  finally { analyzer.delete(); }
}

function orderedPath(feature: SweepFeature, profile: Profile): Contour {
  if (profile.kind !== 'entities') throw new Error('La trayectoria debe ser un croquis de líneas o arcos abiertos.');
  if (!feature.path.length || feature.path.length > 128) throw new Error('Selecciona entre 1 y 128 segmentos para la trayectoria.');
  const ids = feature.path.map((segment) => segment.entityId);
  if (new Set(ids).size !== ids.length) throw new Error('La trayectoria repite una entidad.');
  const entities = ids.map((id) => {
    const entity = profile.entities.find((item) => item.id === id);
    if (!entity || entity.construction) throw new Error('Falta una entidad de la trayectoria o se ha convertido en construcción. Recupera la selección.');
    if (entity.type === 'circle') throw new Error('La trayectoria debe estar abierta; no admite círculos completos.');
    return entity;
  });
  const { curves, nodes } = makeProfileCurves({ ...profile, entities });
  const degrees = nodes.map(() => 0);
  curves.forEach((curve) => curve.nodes!.forEach((node) => degrees[node]++));
  if (degrees.filter((degree) => degree === 1).length !== 2 || degrees.some((degree) => degree > 2)) {
    throw new Error('La trayectoria debe ser una cadena abierta sin ramificaciones ni retornos sobre sí misma.');
  }
  const entries = feature.path.map((segment, index) => ({ curve: curves[index], reverse: segment.reversed }));
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1], current = entries[index];
    const end = previous.reverse ? previous.curve.start : previous.curve.end;
    const start = current.reverse ? current.curve.end : current.curve.start;
    if (distance(end, start) > JOIN_TOLERANCE) throw new Error('El orden o el sentido de los segmentos no forma una trayectoria continua. Recupera la selección.');
  }
  return { curves: entries };
}

function startTangent(entry: Contour['curves'][number], frame: PlaneFrame): Vec3 {
  const { curve, reverse } = entry;
  let tangent: Point2;
  if (curve.type === 'line') tangent = [curve.end[0] - curve.start[0], curve.end[1] - curve.start[1]];
  else {
    const angle = curve.angle + (reverse ? curve.sweep : 0), sign = Math.sign(curve.sweep);
    tangent = [-Math.sin(angle) * sign, Math.cos(angle) * sign];
  }
  const length = Math.hypot(...tangent), sign = reverse ? -1 : 1, y = frameYDirection(frame);
  return frame.xDirection.map((value, index) => sign * (value * tangent[0] + y[index] * tangent[1]) / length) as Vec3;
}

/** BRepCheck does not detect a spindle torus: explicitly guard the local curvature singularity. */
function checkCurvature(contour: Contour, section: PlaneFrame, chain: Contour, path: PlaneFrame, start: Vec3, tangent: Vec3) {
  const left = frameCross(path.normal, tangent), y = frameYDirection(section);
  const coefficients: Point2 = [frameDot(section.xDirection, left), frameDot(y, left)];
  const projection = (point: Point2) => {
    const world = framePoint(section, ...point);
    return frameDot(world.map((value, index) => value - start[index]) as Vec3, left);
  };
  const values = contour.curves.flatMap(({ curve }) => {
    const points = [curve.start, curve.end];
    if (curve.type !== 'line') {
      const extremum = Math.atan2(coefficients[1], coefficients[0]);
      for (const angle of [extremum, extremum + Math.PI]) {
        const point = circlePoint(curve, angle);
        if (onCircularArc(curve, point)) points.push(point);
      }
    }
    return points.map(projection);
  });
  const minimum = Math.min(...values), maximum = Math.max(...values);
  for (const { curve, reverse } of chain.curves) {
    if (curve.type !== 'arc') continue;
    const sign = Math.sign(curve.sweep) * (reverse ? -1 : 1);
    const inward = sign > 0 ? maximum : -minimum;
    if (inward >= curve.radius - JOIN_TOLERANCE) {
      throw new Error('El perfil alcanza o cruza el centro de curvatura del recorrido. Reduce su tamaño o aumenta el radio del arco.');
    }
  }
}

/** Detect a ruled surface whose section tangent vanishes inside an interval. */
function checkRuledCorrespondence(contours: Contour[], sections: ResolvedSection[]) {
  const derivative = ({ curve, reverse }: Contour['curves'][number], frame: PlaneFrame, u: number): Vec3 => {
    let local: Point2;
    if (curve.type === 'line') local = [curve.end[0] - curve.start[0], curve.end[1] - curve.start[1]];
    else {
      const angle = curve.angle + curve.sweep * (reverse ? 1 - u : u);
      local = [-Math.sin(angle) * curve.radius * curve.sweep, Math.cos(angle) * curve.radius * curve.sweep];
    }
    const y = frameYDirection(frame), sign = reverse ? -1 : 1;
    return frame.xDirection.map((value, axis) => sign * (value * local[0] + y[axis] * local[1])) as Vec3;
  };
  for (let section = 1; section < sections.length; section++) {
    contours[section].curves.forEach((entry, edge) => {
      const previous = contours[section - 1].curves[edge];
      // Line derivatives are constant: this check is exact for their entire ruled patch.
      // Circular derivatives also test the periodic seam and quarter/eighth-turn samples.
      const parameters = entry.curve.type === 'line' ? [0] : [0, .125, .25, .375, .5, .625, .75, .875, 1];
      for (const u of parameters) {
        const a = derivative(previous, sections[section - 1].frame, u), b = derivative(entry, sections[section].frame, u);
        const delta = b.map((value, axis) => value - a[axis]) as Vec3;
        const denominator = frameDot(delta, delta);
        if (denominator === 0) continue;
        const t = -frameDot(a, delta) / denominator;
        if (t <= 0 || t >= 1) continue;
        const minimum = Math.hypot(...a.map((value, axis) => value + t * delta[axis]));
        if (minimum <= JOIN_TOLERANCE) {
          throw new Error('La correspondencia de secciones colapsa una arista en el interior del recubrimiento. Cambia la entidad inicial o el sentido de la sección.');
        }
      }
    });
  }
}

/** A reversal across parallel sections places both adjacent volumes on the same side of their shared face. */
function checkParallelProgression(sections: ResolvedSection[]) {
  for (let index = 2; index < sections.length; index++) {
    const a = sections[index - 2].frame, b = sections[index - 1].frame, c = sections[index].frame;
    // Only floating-point noise is tolerated here; arbitrary inclined sequences remain supported.
    if (Math.hypot(...frameCross(a.normal, b.normal)) > 1e-12 || Math.hypot(...frameCross(a.normal, c.normal)) > 1e-12) continue;
    const first = frameDot(b.origin.map((value, axis) => value - a.origin[axis]) as Vec3, a.normal);
    const second = frameDot(c.origin.map((value, axis) => value - b.origin[axis]) as Vec3, a.normal);
    if (Math.abs(first) <= JOIN_TOLERANCE || Math.abs(second) <= JOIN_TOLERANCE || Math.sign(first) !== Math.sign(second)) {
      throw new Error('El orden de las secciones paralelas retrocede o coincide en un plano. Reordena las secciones para avanzar siempre en el mismo sentido.');
    }
  }
}

export function sweepSolid(feature: SweepFeature, section: ResolvedSection, path: ResolvedSection): Shape3D {
  if (feature.orientation !== 'followPath') throw new Error('La orientación del barrido no es compatible.');
  const contour = orderedContour(section.profile), chain = orderedPath(feature, path.profile);
  const first = chain.curves[0];
  const start = framePoint(path.frame, ...(first.reverse ? first.curve.end : first.curve.start));
  const tangent = startTangent(first, path.frame);
  if (Math.abs(frameDot(tangent, section.frame.normal)) < 1 - 1e-7) {
    throw new Error('El plano del perfil debe ser perpendicular a la tangente inicial de la trayectoria.');
  }
  checkCurvature(contour, section.frame, chain, path.frame, start, tangent);
  const wire = contourWire(contour, section.frame);
  let spine: Wire | undefined, face: Face | undefined;
  try {
    face = checkedFace(wire);
    const location = makeVertex(start);
    try {
      if (measureDistanceBetween(location, face) > JOIN_TOLERANCE) {
        throw new Error('El inicio de la trayectoria debe estar sobre la región cerrada del perfil.');
      }
      spine = contourWire(chain, path.frame);
      const oc = getOC(), builder = new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped);
      try {
        builder.SetMode(false); // Corrected Frenet: follow the path without an additional twist law.
        builder.SetTransitionMode(oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner);
        builder.Add(wire.wrapped, location.wrapped, false, false);
        builder.Build();
        if (!builder.IsDone() || !builder.MakeSolid()) throw new Error('No se puede cerrar el barrido como sólido. Revisa el tamaño y las esquinas de la trayectoria.');
        return cast(builder.Shape()).asShape3D();
      } finally { builder.delete(); }
    } finally { location.delete(); }
  } finally { spine?.delete(); face?.delete(); wire.delete(); }
}

export function loftSolid(feature: LoftFeature, sections: ResolvedSection[]): Shape3D {
  if (sections.length < 2 || sections.length > 32 || sections.length !== feature.sections.length) {
    throw new Error('Recubrir necesita entre 2 y 32 secciones cerradas.');
  }
  if (new Set(feature.sections.map((section) => section.sketchId)).size !== sections.length) {
    throw new Error('Las secciones de recubrir no pueden repetir el mismo croquis.');
  }
  checkParallelProgression(sections);
  const contours = sections.map((section, index) => orderedContour(section.profile, feature.sections[index]));
  const signature = (contour: Contour) => contour.curves.map(({ curve }) => curve.type).join(',');
  if (contours.some((contour) => signature(contour) !== signature(contours[0]))) {
    throw new Error('Las secciones deben tener el mismo número y orden de líneas, arcos o círculos desde la entidad inicial.');
  }
  if (feature.ruled || sections.length === 2) checkRuledCorrespondence(contours, sections);
  const wires: Wire[] = [], faces: Face[] = [];
  const builder = new (getOC().BRepOffsetAPI_ThruSections)(true, feature.ruled, 1e-6);
  try {
    builder.CheckCompatibility(false); // Never allow native seam rotation or silent edge splitting.
    sections.forEach((section, index) => {
      const wire = contourWire(contours[index], section.frame);
      wires.push(wire); faces.push(checkedFace(wire));
      builder.AddWire(wire.wrapped);
    });
    // Touching/intersecting sections make correspondence physically ambiguous, even when a native builder accepts them.
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const a = sections[i].frame, b = sections[j].frame;
      const exactlyParallel = frameCross(a.normal, b.normal).every((value) => value === 0);
      const separation = Math.abs(frameDot(b.origin.map((value, axis) => value - a.origin[axis]) as Vec3, a.normal));
      if (exactlyParallel && separation > JOIN_TOLERANCE) continue;
      if (measureDistanceBetween(faces[i], faces[j]) <= JOIN_TOLERANCE) {
        throw new Error('Las secciones de recubrir se tocan o se intersectan. Separa sus regiones.');
      }
    }
    builder.Build();
    if (!builder.IsDone()) throw new Error('No se puede construir el recubrimiento con esta correspondencia de secciones.');
    return cast(builder.Shape()).asShape3D();
  } finally { builder.delete(); faces.forEach((face) => face.delete()); wires.forEach((wire) => wire.delete()); }
}
