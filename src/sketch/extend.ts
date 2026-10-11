import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";
import type { TrimPoint, TrimSegment } from "./trim";
import { validateEntityProfile } from "./validation";

export type ExtendPoint = TrimPoint;
export type ExtendSegment = Exclude<TrimSegment, { type: "circle" }>;
export interface ExtendPreview {
  changed: boolean;
  entityId: string;
  endpoint: "start" | "end" | null;
  segment: ExtendSegment | null;
  intersections: ExtendPoint[];
  message: string;
}
export interface ExtendResult {
  changed: boolean;
  profile: EntityProfile;
  affectedEntityIds: string[];
  deletedEntityIds: string[];
  deletedConstraintIds: string[];
  createdConstraintIds: string[];
  convertedConstraintIds: string[];
  message: string;
}

/** World-space tolerance in mm; native numerical tolerances are not assumed. */
export const EXTEND_TOLERANCE = 1e-7;
const TAU = 2 * Math.PI;
type XY = [number, number];
type Endpoint = "start" | "end";
type LinearEntity = Extract<SketchEntity, { type: "line" }>;
type ArcEntity = Extract<SketchEntity, { type: "arc" }>;
const distance = (a: ExtendPoint, b: ExtendPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const subtract = (a: ExtendPoint, b: ExtendPoint): XY => [a.x - b.x, a.y - b.y];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU;
const xy = (point: ExtendPoint): XY => [point.x, point.y];
interface LineCurve {
  type: "line";
  entity: LinearEntity;
  start: ExtendPoint;
  end: ExtendPoint;
  length: number;
}
interface CircularCurve {
  type: "circle" | "arc";
  entity: Exclude<SketchEntity, { type: "line" }>;
  center: ExtendPoint;
  start: ExtendPoint;
  end: ExtendPoint;
  radius: number;
  angle: number;
  sweep: number;
  length: number;
}
type Curve = LineCurve | CircularCurve;
interface Hit extends ExtendPoint {
  progress: number;
  endpointIds: Set<string>;
  lineIds: Set<string>;
  circularIds: Set<string>;
}
interface Plan {
  profile: EntityProfile;
  curve: LineCurve | (CircularCurve & { entity: ArcEntity });
  endpoint: Endpoint;
  hit: Hit;
  hits: Hit[];
  segment: ExtendSegment;
}
const pointReferences = (entity: SketchEntity): string[] =>
  entity.type === "line"
    ? [entity.start, entity.end]
    : entity.type === "circle"
      ? [entity.center]
      : [entity.center, entity.start, entity.end];
const endpointReferences = (entity: SketchEntity): string[] =>
  entity.type === "circle" ? [] : [entity.start, entity.end];

function makeCurves(profile: EntityProfile): Curve[] {
  const points = new Map<string, ExtendPoint>(
    profile.points.map((point) => [point.id, point]),
  );
  points.set("origin", { x: 0, y: 0 });
  return profile.entities.map((entity): Curve => {
    if (entity.type === "line") {
      const start = points.get(entity.start)!,
        end = points.get(entity.end)!;
      const length = distance(start, end);
      if (length <= EXTEND_TOLERANCE)
        throw new Error("No se pueden extender entidades degeneradas.");
      return { type: "line", entity, start, end, length };
    }
    const center = points.get(entity.center)!;
    const start =
      entity.type === "arc"
        ? points.get(entity.start)!
        : { x: center.x + entity.radius, y: center.y };
    const end = entity.type === "arc" ? points.get(entity.end)! : start;
    const radius =
      entity.type === "circle" ? entity.radius : distance(center, start);
    if (
      radius <= EXTEND_TOLERANCE ||
      Math.abs(distance(center, end) - radius) > EXTEND_TOLERANCE
    )
      throw new Error(
        "El arco necesita un radio positivo y extremos sobre su círculo.",
      );
    const angle =
      entity.type === "circle"
        ? 0
        : Math.atan2(start.y - center.y, start.x - center.x);
    const sign = entity.type === "arc" && entity.clockwise ? -1 : 1;
    const sweep =
      entity.type === "circle"
        ? TAU
        : sign *
          wrap(sign * (Math.atan2(end.y - center.y, end.x - center.x) - angle));
    if (radius * Math.abs(sweep) <= EXTEND_TOLERANCE)
      throw new Error("No se puede extender un arco sin recorrido.");
    return {
      type: entity.type,
      entity,
      center,
      start,
      end,
      radius,
      angle,
      sweep,
      length: radius * Math.abs(sweep),
    };
  });
}

function onCurve(curve: Curve, point: ExtendPoint): boolean {
  if (curve.type === "line") {
    const direction = subtract(curve.end, curve.start),
      delta = subtract(point, curve.start);
    const t = dot(delta, direction) / curve.length ** 2;
    return (
      Math.abs(cross(delta, direction)) / curve.length <= EXTEND_TOLERANCE &&
      t >= -EXTEND_TOLERANCE / curve.length &&
      t <= 1 + EXTEND_TOLERANCE / curve.length
    );
  }
  if (Math.abs(distance(point, curve.center) - curve.radius) > EXTEND_TOLERANCE)
    return false;
  if (
    curve.type === "circle" ||
    distance(point, curve.start) <= EXTEND_TOLERANCE ||
    distance(point, curve.end) <= EXTEND_TOLERANCE
  )
    return true;
  const angle = Math.atan2(point.y - curve.center.y, point.x - curve.center.x);
  return (
    wrap((curve.sweep > 0 ? 1 : -1) * (angle - curve.angle)) <=
    Math.abs(curve.sweep) + EXTEND_TOLERANCE / curve.radius
  );
}

/** Infinite target support against a finite boundary; direction is filtered later. */
function supportIntersections(first: Curve, second: Curve): ExtendPoint[] {
  if (first.type === "line" && second.type === "line") {
    const u = subtract(first.end, first.start),
      v = subtract(second.end, second.start);
    const between = subtract(second.start, first.start),
      divisor = cross(u, v);
    if (Math.abs(divisor) <= 1e-12 * first.length * second.length) {
      if (Math.abs(cross(between, u)) / first.length > EXTEND_TOLERANCE)
        return [];
      return [second.start, second.end];
    }
    const t = cross(between, v) / divisor,
      s = cross(between, u) / divisor;
    if (
      s < -EXTEND_TOLERANCE / second.length ||
      s > 1 + EXTEND_TOLERANCE / second.length
    )
      return [];
    return [{ x: first.start.x + t * u[0], y: first.start.y + t * u[1] }];
  }
  if (first.type === "line" || second.type === "line") {
    const line = first.type === "line" ? first : (second as LineCurve);
    const circle = first.type === "line" ? (second as CircularCurve) : first;
    const direction = subtract(line.end, line.start),
      unit: XY = [direction[0] / line.length, direction[1] / line.length];
    const toCenter = subtract(circle.center, line.start),
      projection = dot(toCenter, unit);
    const perpendicular = Math.abs(cross(toCenter, unit));
    if (perpendicular > circle.radius + EXTEND_TOLERANCE) return [];
    const offset =
      Math.abs(perpendicular - circle.radius) <= EXTEND_TOLERANCE
        ? 0
        : Math.sqrt(Math.max(0, circle.radius ** 2 - perpendicular ** 2));
    return [projection - offset, projection + offset]
      .map((t) => ({
        x: line.start.x + t * unit[0],
        y: line.start.y + t * unit[1],
      }))
      .filter((point) => onCurve(second, point));
  }
  const d = distance(first.center, second.center);
  if (
    d <= EXTEND_TOLERANCE &&
    Math.abs(first.radius - second.radius) <= EXTEND_TOLERANCE
  )
    return [];
  if (
    d <= EXTEND_TOLERANCE ||
    d > first.radius + second.radius + EXTEND_TOLERANCE ||
    d < Math.abs(first.radius - second.radius) - EXTEND_TOLERANCE
  )
    return [];
  const along = (first.radius ** 2 - second.radius ** 2 + d ** 2) / (2 * d);
  const height = Math.sqrt(Math.max(0, first.radius ** 2 - along ** 2));
  const unit: XY = [
    (second.center.x - first.center.x) / d,
    (second.center.y - first.center.y) / d,
  ];
  const base = {
    x: first.center.x + along * unit[0],
    y: first.center.y + along * unit[1],
  };
  return [-1, 1]
    .map((sign) => ({
      x: base.x - sign * height * unit[1],
      y: base.y + sign * height * unit[0],
    }))
    .filter((point) => onCurve(second, point));
}

function chooseEndpoint(curve: Curve, pick: ExtendPoint): Endpoint {
  if (curve.type === "line")
    return dot(subtract(pick, curve.start), subtract(curve.end, curve.start)) <
      curve.length ** 2 / 2
      ? "start"
      : "end";
  if (distance(pick, curve.center) <= EXTEND_TOLERANCE)
    throw new Error(
      "Elige una mitad del recorrido del arco, alejada de su centro.",
    );
  const angle = Math.atan2(pick.y - curve.center.y, pick.x - curve.center.x);
  const along = wrap((curve.sweep > 0 ? 1 : -1) * (angle - curve.angle));
  if (along > Math.abs(curve.sweep) + EXTEND_TOLERANCE / curve.radius)
    return distance(pick, curve.start) <= distance(pick, curve.end)
      ? "start"
      : "end";
  return along <= Math.abs(curve.sweep) / 2 ? "start" : "end";
}

function planExtend(
  input: EntityProfile,
  entityId: string,
  pick: ExtendPoint,
  forcedEndpoint?: Endpoint,
): Plan {
  if (!Number.isFinite(pick?.x) || !Number.isFinite(pick?.y))
    throw new Error("El punto de extensión debe tener coordenadas finitas.");
  const profile = validateEntityProfile(input),
    all = makeCurves(profile);
  const target = all.find((curve) => curve.entity.id === entityId);
  if (!target)
    throw new Error("Selecciona una entidad existente para extender.");
  if (target.entity.type === "circle")
    throw new Error(
      "Los círculos completos delimitan la extensión; selecciona una línea o un arco.",
    );
  const curve = target as Plan["curve"];
  const endpoint = forcedEndpoint ?? chooseEndpoint(curve, pick),
    current = curve[endpoint];
  const outward: XY =
    curve.type === "line"
      ? (subtract(
          endpoint === "end" ? curve.end : curve.start,
          endpoint === "end" ? curve.start : curve.end,
        ).map((coordinate) => coordinate / curve.length) as XY)
      : [0, 0];
  const direction =
    curve.type === "line"
      ? 0
      : (curve.sweep > 0 ? 1 : -1) * (endpoint === "end" ? 1 : -1);
  const angle =
    curve.type === "line"
      ? 0
      : Math.atan2(current.y - curve.center.y, current.x - curve.center.x);
  const available =
    curve.type === "line" ? Infinity : TAU - Math.abs(curve.sweep);
  const progress = (point: ExtendPoint) =>
    curve.type === "line"
      ? dot(subtract(point, current), outward)
      : wrap(
          direction *
            (Math.atan2(point.y - curve.center.y, point.x - curve.center.x) -
              angle),
        ) * curve.radius;
  const pointMap = new Map<string, ExtendPoint>(
    profile.points.map((point) => [point.id, point]),
  );
  pointMap.set("origin", { x: 0, y: 0 });
  const hits: Hit[] = [];
  for (const boundary of all) {
    if (boundary === target) continue;
    let intersections: ExtendPoint[];
    if (
      curve.type === "line" &&
      boundary.type === "line" &&
      Math.abs(cross(outward, subtract(boundary.end, boundary.start))) <=
        1e-12 * boundary.length &&
      Math.abs(cross(subtract(boundary.start, current), outward)) <=
        EXTEND_TOLERANCE
    ) {
      intersections = [boundary.start, boundary.end];
    } else if (
      curve.type !== "line" &&
      boundary.type !== "line" &&
      distance(curve.center, boundary.center) <= EXTEND_TOLERANCE &&
      Math.abs(curve.radius - boundary.radius) <= EXTEND_TOLERANCE
    ) {
      if (boundary.type === "circle")
        throw new Error(
          "La prolongación coincide con una frontera circular completa.",
        );
      const first =
        (boundary.sweep > 0 ? 1 : -1) === direction
          ? boundary.start
          : boundary.end;
      const begin = progress(first) / curve.radius,
        end = begin + Math.abs(boundary.sweep);
      const intervals =
        end <= TAU
          ? [[begin, end]]
          : [
              [begin, TAU],
              [0, end - TAU],
            ];
      intersections = [];
      for (const [low, high] of intervals) {
        const from = Math.max(0, low),
          to = Math.min(available, high);
        if ((to - from) * curve.radius < -EXTEND_TOLERANCE) continue;
        // An overlapping/touching delimiter is exited at its far endpoint.
        // A disjoint delimiter is reached at its first endpoint instead.
        const travel = from * curve.radius <= EXTEND_TOLERANCE ? to : from;
        intersections.push({
          x:
            curve.center.x +
            curve.radius * Math.cos(angle + direction * travel),
          y:
            curve.center.y +
            curve.radius * Math.sin(angle + direction * travel),
        });
      }
    } else intersections = supportIntersections(curve, boundary);
    for (const point of intersections) {
      const amount = progress(point);
      if (
        amount <= EXTEND_TOLERANCE ||
        (curve.type !== "line" &&
          amount >= available * curve.radius - EXTEND_TOLERANCE)
      )
        continue;
      let hit = hits.find(
        (candidate) => distance(candidate, point) <= EXTEND_TOLERANCE,
      );
      if (!hit) {
        hit = {
          ...point,
          progress: amount,
          endpointIds: new Set(),
          lineIds: new Set(),
          circularIds: new Set(),
        };
        hits.push(hit);
      }
      if (boundary.type === "line") hit.lineIds.add(boundary.entity.id);
      else hit.circularIds.add(boundary.entity.id);
      for (const id of endpointReferences(boundary.entity))
        if (distance(pointMap.get(id)!, point) <= EXTEND_TOLERANCE)
          hit.endpointIds.add(id);
    }
  }
  hits.sort((a, b) => a.progress - b.progress);
  const hit = hits[0];
  if (!hit && !forcedEndpoint)
    return planExtend(
      input,
      entityId,
      pick,
      endpoint === "start" ? "end" : "start",
    );
  if (!hit)
    throw new Error(
      "No hay una frontera en la dirección elegida antes de completar el recorrido.",
    );
  const start = xy(current),
    end = xy(hit);
  const segment: ExtendSegment =
    curve.type === "line"
      ? { type: "line", start, end }
      : {
          type: "arc",
          center: xy(curve.center),
          radius: curve.radius,
          start,
          end,
          clockwise:
            endpoint === "end"
              ? curve.entity.clockwise
              : !curve.entity.clockwise,
        };
  return { profile, curve, endpoint, hit, hits, segment };
}

/**
 * Pure geometric preview. Pass the solved profile that is currently displayed.
 * No solver, fresh IDs or input mutation occur. Only the target support extends;
 * all delimiters remain finite, including construction entities. Arc extension
 * cannot overlap its existing sweep or turn into a complete circle.
 * If the selected half has no valid hit, the opposite end is attempted.
 * The preview segment runs from the old endpoint towards the new endpoint;
 * its clockwise flag reverses for a start extension, unlike the stored arc.
 */
export function previewExtendToClosest(
  profile: EntityProfile,
  entityId: string,
  pickPoint: ExtendPoint,
): ExtendPreview {
  try {
    const plan = planExtend(profile, entityId, pickPoint);
    return {
      changed: true,
      entityId,
      endpoint: plan.endpoint,
      segment: plan.segment,
      intersections: plan.hits.map(({ x, y }) => ({ x, y })),
      message: "Extender hasta la primera frontera.",
    };
  } catch (error) {
    return {
      changed: false,
      entityId,
      endpoint: null,
      segment: null,
      intersections: [],
      message:
        error instanceof Error
          ? error.message
          : "No se puede extender la entidad.",
    };
  }
}

function references(constraint: SketchConstraint): string[] {
  if ("a" in constraint) return [constraint.a, constraint.b];
  if ("pointId" in constraint)
    return [
      constraint.pointId,
      ...("entityId" in constraint ? [constraint.entityId] : []),
    ];
  return [constraint.entityId];
}

/** Extend the displayed geometry as one detached editing transaction. */
export function extendToClosest(
  input: EntityProfile,
  entityId: string,
  pickPoint: ExtendPoint,
): ExtendResult {
  try {
    const plan = planExtend(input, entityId, pickPoint);
    const { profile, curve, endpoint, hit } = plan;
    const target = curve.entity,
      oldPointId = target[endpoint];
    const ids = new Set([
      "origin",
      ...profile.points.map((item) => item.id),
      ...profile.entities.map((item) => item.id),
      ...profile.constraints.map((item) => item.id),
    ]);
    const uid = () => {
      const base = crypto.randomUUID();
      let id: string = base,
        suffix = 0;
      while (ids.has(id)) id = `extend-${base}-${++suffix}`;
      ids.add(id);
      return id;
    };
    let pointId: string;
    if (hit.endpointIds.size === 1) pointId = [...hit.endpointIds][0];
    else {
      pointId = uid();
      profile.points.push({ id: pointId, x: hit.x, y: hit.y });
    }
    target[endpoint] = pointId;
    const used = new Set(profile.entities.flatMap(pointReferences));
    const deletedPointIds = new Set(
      oldPointId !== "origin" && !used.has(oldPointId) ? [oldPointId] : [],
    );
    profile.points = profile.points.filter(
      (point) => !deletedPointIds.has(point.id),
    );
    const deletedConstraintIds: string[] = [];
    profile.constraints = profile.constraints.filter((constraint) => {
      const obsoleteReference = references(constraint).some((id) =>
        deletedPointIds.has(id),
      );
      const obsoleteLength =
        target.type === "line" &&
        constraint.type === "length" &&
        constraint.entityId === target.id &&
        !constraint.driven;
      const obsoleteEqual =
        target.type === "line" &&
        constraint.type === "equal" &&
        [constraint.a, constraint.b].includes(target.id);
      const tautological =
        (constraint.type === "pointOnLine" ||
          constraint.type === "pointOnCircle") &&
        constraint.entityId === target.id &&
        [target.start, target.end].includes(constraint.pointId);
      if (
        obsoleteReference ||
        obsoleteLength ||
        obsoleteEqual ||
        tautological
      ) {
        deletedConstraintIds.push(constraint.id);
        return false;
      }
      return true;
    });
    const createdConstraintIds: string[] = [];
    const add = (type: "pointOnLine" | "pointOnCircle", boundaryId: string) => {
      const boundary = profile.entities.find(
        (entity) => entity.id === boundaryId,
      )!;
      if (
        boundary.type !== "circle" &&
        [boundary.start, boundary.end].includes(pointId)
      )
        return;
      if (
        profile.constraints.some(
          (constraint) =>
            constraint.type === type &&
            constraint.pointId === pointId &&
            constraint.entityId === boundaryId,
        )
      )
        return;
      const id = uid();
      profile.constraints.push({ id, type, pointId, entityId: boundaryId });
      createdConstraintIds.push(id);
    };
    for (const id of hit.lineIds) add("pointOnLine", id);
    for (const id of hit.circularIds) add("pointOnCircle", id);
    return {
      changed: true,
      profile: validateEntityProfile(profile),
      affectedEntityIds: [target.id],
      deletedEntityIds: [],
      deletedConstraintIds,
      createdConstraintIds,
      convertedConstraintIds: [],
      message: `Entidad extendida${deletedConstraintIds.length ? `; ${deletedConstraintIds.length} relaciones o cotas eliminadas` : ""}.`,
    };
  } catch (error) {
    return {
      changed: false,
      profile: input,
      affectedEntityIds: [],
      deletedEntityIds: [],
      deletedConstraintIds: [],
      createdConstraintIds: [],
      convertedConstraintIds: [],
      message:
        error instanceof Error
          ? error.message
          : "No se puede extender la entidad.",
    };
  }
}
