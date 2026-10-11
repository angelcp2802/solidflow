import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";
import { validateEntityProfile } from "./validation";
import { assertOffsetTopologyEditable, cleanupConstraintDependencies, constraintReferences } from "./references";

export interface TrimPoint {
  x: number;
  y: number;
}
type XY = [number, number];
export type TrimSegment =
  | { type: "line"; start: XY; end: XY }
  | { type: "circle"; center: XY; radius: number }
  | {
      type: "arc";
      center: XY;
      start: XY;
      end: XY;
      clockwise: boolean;
      radius: number;
    };
export interface TrimPreview {
  changed: boolean;
  entityId: string;
  segment: TrimSegment | null;
  intersections: TrimPoint[];
  message: string;
}
export interface TrimResult {
  changed: boolean;
  profile: EntityProfile;
  affectedEntityIds: string[];
  deletedEntityIds: string[];
  deletedConstraintIds: string[];
  createdConstraintIds: string[];
  convertedConstraintIds: string[];
  message: string;
}

/** World-space tolerance in mm; unrelated coincident point IDs are never merged. */
export const TRIM_TOLERANCE = 1e-7;
const TAU = Math.PI * 2;
const distance = (a: TrimPoint, b: TrimPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const subtract = (a: TrimPoint, b: TrimPoint): XY => [a.x - b.x, a.y - b.y];
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU;
const xy = (point: TrimPoint): XY => [point.x, point.y];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
type Interval = [number, number];
interface LineCurve {
  type: "line";
  entity: Extract<SketchEntity, { type: "line" }>;
  start: TrimPoint;
  end: TrimPoint;
  length: number;
}
interface CircularCurve {
  type: "circle" | "arc";
  entity: Exclude<SketchEntity, { type: "line" }>;
  center: TrimPoint;
  start: TrimPoint;
  end: TrimPoint;
  radius: number;
  angle: number;
  sweep: number;
  length: number;
}
type Curve = LineCurve | CircularCurve;
interface Hit extends TrimPoint {
  t: number;
  endpointIds: Set<string>;
  lineIds: Set<string>;
  circularIds: Set<string>;
}
interface Plan {
  profile: EntityProfile;
  curve: Curve;
  cuts: Hit[];
  removed: Interval;
  retained: Interval[];
}
const pointReferences = (entity: SketchEntity): string[] =>
  entity.type === "line"
    ? [entity.start, entity.end]
    : entity.type === "circle"
      ? [entity.center]
      : [entity.center, entity.start, entity.end];
const endpointReferences = (entity: SketchEntity): string[] =>
  entity.type === "circle" ? [] : [entity.start, entity.end];

function curves(profile: EntityProfile): Curve[] {
  const points = new Map<string, TrimPoint>(
    profile.points.map((point) => [point.id, point]),
  );
  points.set("origin", { x: 0, y: 0 });
  const point = (id: string) => points.get(id)!;
  return profile.entities.map((entity): Curve => {
    if (entity.type === "line") {
      const start = point(entity.start),
        end = point(entity.end);
      const length = distance(start, end);
      if (length <= TRIM_TOLERANCE)
        throw new Error("No se pueden recortar entidades degeneradas.");
      return { type: "line", entity, start, end, length };
    }
    const center = point(entity.center);
    const start =
      entity.type === "arc"
        ? point(entity.start)
        : { x: center.x + entity.radius, y: center.y };
    const end = entity.type === "arc" ? point(entity.end) : start;
    const radius =
      entity.type === "circle" ? entity.radius : distance(center, start);
    if (
      radius <= TRIM_TOLERANCE ||
      Math.abs(distance(center, end) - radius) > TRIM_TOLERANCE
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
    const length = radius * Math.abs(sweep);
    if (length <= TRIM_TOLERANCE)
      throw new Error("No se puede recortar un arco sin recorrido.");
    return {
      type: entity.type,
      entity,
      center,
      start,
      end,
      radius,
      angle,
      sweep,
      length,
    };
  });
}

function at(curve: Curve, t: number): TrimPoint {
  if (curve.type === "line")
    return {
      x: curve.start.x + (curve.end.x - curve.start.x) * t,
      y: curve.start.y + (curve.end.y - curve.start.y) * t,
    };
  const angle = curve.angle + curve.sweep * t;
  return {
    x: curve.center.x + curve.radius * Math.cos(angle),
    y: curve.center.y + curve.radius * Math.sin(angle),
  };
}

function parameter(curve: Curve, point: TrimPoint): number {
  if (curve.type === "line") {
    const direction = subtract(curve.end, curve.start),
      delta = subtract(point, curve.start);
    return (
      (delta[0] * direction[0] + delta[1] * direction[1]) / curve.length ** 2
    );
  }
  const angle = Math.atan2(point.y - curve.center.y, point.x - curve.center.x);
  if (distance(point, curve.start) <= TRIM_TOLERANCE) return 0;
  if (curve.type === "arc" && distance(point, curve.end) <= TRIM_TOLERANCE)
    return 1;
  return (
    wrap((curve.sweep > 0 ? 1 : -1) * (angle - curve.angle)) /
    Math.abs(curve.sweep)
  );
}

function contains(curve: Curve, point: TrimPoint): boolean {
  const t = parameter(curve, point),
    tolerance = TRIM_TOLERANCE / curve.length;
  if (curve.type === "line") {
    const direction = subtract(curve.end, curve.start);
    return (
      Math.abs(cross(subtract(point, curve.start), direction)) / curve.length <=
        TRIM_TOLERANCE &&
      t >= -tolerance &&
      t <= 1 + tolerance
    );
  }
  return (
    Math.abs(distance(point, curve.center) - curve.radius) <= TRIM_TOLERANCE &&
    (curve.type === "circle" || t <= 1 + tolerance)
  );
}

function circularIntervals(curve: CircularCurve): Interval[] {
  if (curve.type === "circle") return [[0, TAU]];
  const start = wrap(curve.sweep > 0 ? curve.angle : curve.angle + curve.sweep);
  const end = start + Math.abs(curve.sweep);
  return end <= TAU
    ? [[start, end]]
    : [
        [start, TAU],
        [0, end - TAU],
      ];
}

function intersections(first: Curve, second: Curve): TrimPoint[] {
  if (first.type === "line" && second.type === "line") {
    const u = subtract(first.end, first.start),
      v = subtract(second.end, second.start);
    const between = subtract(second.start, first.start),
      divisor = cross(u, v);
    if (Math.abs(divisor) <= 1e-12 * first.length * second.length) {
      if (Math.abs(cross(between, u)) / first.length > TRIM_TOLERANCE)
        return [];
      const interval = [
        parameter(first, second.start),
        parameter(first, second.end),
      ].sort((a, b) => a - b);
      const low = Math.max(0, interval[0]),
        high = Math.min(1, interval[1]);
      if ((high - low) * first.length < -TRIM_TOLERANCE) return [];
      if ((high - low) * first.length > TRIM_TOLERANCE)
        throw new Error(
          "No se puede elegir un recorte entre entidades superpuestas.",
        );
      return [at(first, clamp((low + high) / 2))];
    }
    const t = cross(between, v) / divisor,
      s = cross(between, u) / divisor;
    if (
      t < -TRIM_TOLERANCE / first.length ||
      t > 1 + TRIM_TOLERANCE / first.length ||
      s < -TRIM_TOLERANCE / second.length ||
      s > 1 + TRIM_TOLERANCE / second.length
    )
      return [];
    return [at(first, clamp(t))];
  }
  if (first.type === "line" || second.type === "line") {
    const line = first.type === "line" ? first : (second as LineCurve);
    const circle = first.type === "line" ? (second as CircularCurve) : first;
    const direction = subtract(line.end, line.start),
      unit: XY = [direction[0] / line.length, direction[1] / line.length];
    const toCenter = subtract(circle.center, line.start);
    const projection = toCenter[0] * unit[0] + toCenter[1] * unit[1];
    const perpendicular = Math.abs(cross(toCenter, unit));
    if (perpendicular > circle.radius + TRIM_TOLERANCE) return [];
    const offset =
      Math.abs(perpendicular - circle.radius) <= TRIM_TOLERANCE
        ? 0
        : Math.sqrt(Math.max(0, circle.radius ** 2 - perpendicular ** 2));
    return [projection - offset, projection + offset]
      .filter((t) => t >= -TRIM_TOLERANCE && t <= line.length + TRIM_TOLERANCE)
      .map((t) => at(line, clamp(t / line.length)))
      .filter((point) => contains(circle, point));
  }
  const d = distance(first.center, second.center);
  if (
    d <= TRIM_TOLERANCE &&
    Math.abs(first.radius - second.radius) <= TRIM_TOLERANCE
  ) {
    const hits: TrimPoint[] = [];
    for (const a of circularIntervals(first))
      for (const b of circularIntervals(second)) {
        const low = Math.max(a[0], b[0]),
          high = Math.min(a[1], b[1]);
        if ((high - low) * first.radius > TRIM_TOLERANCE)
          throw new Error(
            "No se puede elegir un recorte entre entidades circulares superpuestas.",
          );
        if ((high - low) * first.radius >= -TRIM_TOLERANCE)
          hits.push({
            x: first.center.x + first.radius * Math.cos(low),
            y: first.center.y + first.radius * Math.sin(low),
          });
      }
    for (const point of [first.start, first.end, second.start, second.end])
      if (contains(first, point) && contains(second, point)) hits.push(point);
    return hits;
  }
  if (
    d <= TRIM_TOLERANCE ||
    d > first.radius + second.radius + TRIM_TOLERANCE ||
    d < Math.abs(first.radius - second.radius) - TRIM_TOLERANCE
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
    .filter((point) => contains(first, point) && contains(second, point));
}

function planTrim(
  input: EntityProfile,
  entityId: string,
  pickPoint: TrimPoint,
): Plan {
  if (!Number.isFinite(pickPoint?.x) || !Number.isFinite(pickPoint?.y))
    throw new Error("El punto de recorte debe tener coordenadas finitas.");
  const profile = validateEntityProfile(input),
    all = curves(profile);
  const curve = all.find((candidate) => candidate.entity.id === entityId);
  if (!curve)
    throw new Error("Selecciona una entidad existente para recortar.");
  assertOffsetTopologyEditable(profile.constraints, [entityId]);
  const pointMap = new Map<string, TrimPoint>(
    profile.points.map((point) => [point.id, point]),
  );
  pointMap.set("origin", { x: 0, y: 0 });
  const cuts: Hit[] = [];
  for (const other of all) {
    if (other === curve) continue;
    for (const point of intersections(curve, other)) {
      let hit = cuts.find(
        (candidate) => distance(candidate, point) <= TRIM_TOLERANCE,
      );
      if (!hit) {
        hit = {
          ...point,
          t: parameter(curve, point),
          endpointIds: new Set(),
          lineIds: new Set(),
          circularIds: new Set(),
        };
        cuts.push(hit);
      }
      if (other.type === "line") hit.lineIds.add(other.entity.id);
      else hit.circularIds.add(other.entity.id);
      for (const id of endpointReferences(other.entity))
        if (distance(pointMap.get(id)!, point) <= TRIM_TOLERANCE)
          hit.endpointIds.add(id);
    }
  }
  cuts.sort((a, b) => a.t - b.t);
  const tolerance = TRIM_TOLERANCE / curve.length;
  const interior = cuts.filter(
    (hit) => hit.t > tolerance && hit.t < 1 - tolerance,
  );
  if (
    (curve.type === "circle" && cuts.length < 2) ||
    (curve.type !== "circle" && !interior.length)
  )
    return { profile, curve, cuts, removed: [0, 1], retained: [] };
  if (
    curve.type !== "line" &&
    distance(pickPoint, curve.center) <= TRIM_TOLERANCE
  )
    throw new Error(
      "Elige un punto sobre el recorrido circular, alejado del centro.",
    );
  let picked = parameter(curve, pickPoint);
  if (curve.type !== "circle") {
    if (picked > 1)
      picked =
        distance(pickPoint, curve.start) <= distance(pickPoint, curve.end)
          ? 0
          : 1;
    picked = clamp(picked);
  }
  const boundaries =
    curve.type === "circle"
      ? cuts.map((hit) => hit.t)
      : [0, ...interior.map((hit) => hit.t), 1];
  if (
    cuts.some(
      (hit) =>
        Math.min(
          Math.abs(picked - hit.t),
          curve.type === "circle" ? 1 - Math.abs(picked - hit.t) : Infinity,
        ) <= tolerance,
    )
  )
    throw new Error("Elige el interior del tramo, no su intersección.");
  let removed: Interval;
  let retained: Interval[];
  if (curve.type === "circle") {
    const upperIndex = boundaries.findIndex((value) => value > picked);
    const low =
      upperIndex === 0 || upperIndex === -1
        ? boundaries.at(-1)!
        : boundaries[upperIndex - 1];
    const high =
      upperIndex === 0 || upperIndex === -1
        ? boundaries[0] + 1
        : boundaries[upperIndex];
    removed = [low, high];
    retained = [[high, low + 1]];
  } else {
    const upperIndex = boundaries.findIndex(
      (value, index) =>
        index > 0 && (value > picked || index === boundaries.length - 1),
    );
    removed = [boundaries[upperIndex - 1], boundaries[upperIndex]];
    retained = [];
    if (removed[0] > tolerance) retained.push([0, removed[0]]);
    if (removed[1] < 1 - tolerance) retained.push([removed[1], 1]);
  }
  if ((removed[1] - removed[0]) * curve.length <= TRIM_TOLERANCE)
    throw new Error("No hay un tramo de longitud positiva que recortar.");
  return { profile, curve, cuts, removed, retained };
}

function segment(curve: Curve, interval: Interval): TrimSegment {
  if (curve.type === "circle" && interval[1] - interval[0] === 1)
    return { type: "circle", center: xy(curve.center), radius: curve.radius };
  const start = xy(at(curve, interval[0])),
    end = xy(at(curve, interval[1]));
  return curve.type === "line"
    ? { type: "line", start, end }
    : {
        type: "arc",
        center: xy(curve.center),
        start,
        end,
        clockwise: curve.sweep < 0,
        radius: curve.radius,
      };
}

/**
 * Pure geometric preview: no solve, ID generation, constraints, or input mutation.
 * Pass the solved profile that is currently displayed, exactly as for commit.
 * Construction entities delimit trims; prolongations do not. Zero interior cuts
 * and circles with fewer than two cuts remove the entire entity. Overlapping
 * supports and boundary picks are explicitly rejected.
 */
export function previewTrimToClosest(
  profile: EntityProfile,
  entityId: string,
  pickPoint: TrimPoint,
): TrimPreview {
  try {
    const plan = planTrim(profile, entityId, pickPoint);
    return {
      changed: true,
      entityId,
      segment: segment(plan.curve, plan.removed),
      intersections: plan.cuts.map(({ x, y }) => ({ x, y })),
      message: plan.retained.length
        ? "Recortar el tramo seleccionado."
        : "Eliminar la entidad completa.",
    };
  } catch (error) {
    return {
      changed: false,
      entityId,
      segment: null,
      intersections: [],
      message:
        error instanceof Error
          ? error.message
          : "No se puede recortar la entidad.",
    };
  }
}

/**
 * Cut the displayed (already solved) geometry without moving other entities.
 * The first retained piece keeps the original ID and orientation. New boundaries
 * reuse an unambiguous cutter endpoint; otherwise line cutters receive a
 * pointOnLine/pointOnCircle relations to their cutter supports. The caller solves afterwards for fresh drivenValues
 * and commits the whole result as one undo operation.
 * A driving line length becomes an outer-endpoint distance when splitting;
 * a driven length continues observing the retained original entity ID.
 */
export function trimToClosest(
  input: EntityProfile,
  entityId: string,
  pickPoint: TrimPoint,
): TrimResult {
  try {
    const plan = planTrim(input, entityId, pickPoint);
    const { profile, curve, retained, cuts } = plan;
    const target = curve.entity;
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
      while (ids.has(id)) id = `trim-${base}-${++suffix}`;
      ids.add(id);
      return id;
    };
    const createdConstraintIds: string[] = [];
    const addConstraint = (
      constraint:
        | {
            type: "pointOnLine" | "pointOnCircle";
            pointId: string;
            entityId: string;
          }
        | { type: "parallel" | "equal"; a: string; b: string },
    ) => {
      if (
        constraint.type === "pointOnLine" ||
        constraint.type === "pointOnCircle"
      ) {
        const entity = profile.entities.find(
          (entity) => entity.id === constraint.entityId,
        );
        if (
          entity &&
          entity.type !== "circle" &&
          [entity.start, entity.end].includes(constraint.pointId)
        )
          return;
        if (
          profile.constraints.some(
            (existing) =>
              (existing.type === "pointOnLine" ||
                existing.type === "pointOnCircle") &&
              existing.type === constraint.type &&
              existing.pointId === constraint.pointId &&
              existing.entityId === constraint.entityId,
          )
        )
          return;
      }
      const id = uid();
      profile.constraints.push({ ...constraint, id } as SketchConstraint);
      createdConstraintIds.push(id);
    };
    const newBoundaries: { pointId: string; hit: Hit }[] = [];
    const pointAt = (t: number): string => {
      const tolerance = TRIM_TOLERANCE / curve.length;
      if (target.type !== "circle") {
        if (Math.abs(t) <= tolerance) return target.start;
        if (Math.abs(t - 1) <= tolerance) return target.end;
      }
      const point = at(curve, t);
      const hit = cuts.find(
        (candidate) => distance(candidate, point) <= TRIM_TOLERANCE,
      );
      if (hit?.endpointIds.size === 1) {
        const id = [...hit.endpointIds][0];
        newBoundaries.push({ pointId: id, hit });
        return id;
      }
      const id = uid();
      profile.points.push({ id, ...point });
      if (hit) newBoundaries.push({ pointId: id, hit });
      return id;
    };
    const pieces = retained.map(([low, high], index): SketchEntity => {
      const base = {
        id: index === 0 ? target.id : uid(),
        construction: target.construction,
      };
      const start = pointAt(low),
        end = pointAt(high);
      return target.type === "line"
        ? { ...base, type: "line", start, end }
        : {
            ...base,
            type: "arc",
            center: target.center,
            start,
            end,
            clockwise: curve.type !== "line" && curve.sweep < 0,
          };
    });
    profile.entities.splice(
      profile.entities.findIndex((item) => item.id === target.id),
      1,
      ...pieces,
    );
    const used = new Set(profile.entities.flatMap(pointReferences));
    const deletedPoints = new Set(
      pointReferences(target).filter((id) => id !== "origin" && !used.has(id)),
    );
    profile.points = profile.points.filter(
      (point) => !deletedPoints.has(point.id),
    );
    const deletedConstraintIds: string[] = [];
    const convertedConstraintIds: string[] = [];
    profile.constraints = profile.constraints
      .map((constraint): SketchConstraint => {
        if (
          target.type === "line" &&
          pieces.length === 2 &&
          constraint.type === "length" &&
          constraint.entityId === target.id &&
          !constraint.driven
        ) {
          // Native closest trim retains a driving dimension across the two
          // original outer endpoints. It must never constrain either fragment
          // to the complete pre-trim length and undo the cut on the next solve.
          const { entityId: _entityId, ...dimension } = constraint;
          convertedConstraintIds.push(constraint.id);
          return {
            ...dimension,
            type: "distance",
            a: target.start,
            b: target.end,
          };
        }
        return constraint;
      })
      .filter((constraint) => {
        const obsoleteReference = constraintReferences(constraint).some(
          (id) => deletedPoints.has(id) || (!pieces.length && id === target.id),
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
        const retainedLine = pieces[0];
        const tautologicalPointOnLine =
          constraint.type === "pointOnLine" &&
          constraint.entityId === target.id &&
          retainedLine?.type === "line" &&
          [retainedLine.start, retainedLine.end].includes(constraint.pointId);
        const tautologicalPointOnCircle =
          constraint.type === "pointOnCircle" &&
          constraint.entityId === target.id &&
          retainedLine?.type === "arc" &&
          [retainedLine.start, retainedLine.end].includes(constraint.pointId);
        if (
          obsoleteReference ||
          obsoleteLength ||
          obsoleteEqual ||
          tautologicalPointOnLine ||
          tautologicalPointOnCircle
        ) {
          deletedConstraintIds.push(constraint.id);
          return false;
        }
        return true;
      });
    profile.constraints = cleanupConstraintDependencies(profile.constraints);
    for (const boundary of newBoundaries)
      for (const lineId of boundary.hit.lineIds)
        addConstraint({
          type: "pointOnLine",
          pointId: boundary.pointId,
          entityId: lineId,
        });
    for (const boundary of newBoundaries)
      for (const circularId of boundary.hit.circularIds)
        addConstraint({
          type: "pointOnCircle",
          pointId: boundary.pointId,
          entityId: circularId,
        });
    for (const piece of pieces.slice(1)) {
      if (piece.type === "line") {
        addConstraint({ type: "parallel", a: target.id, b: piece.id });
        addConstraint({
          type: "pointOnLine",
          pointId: piece.start,
          entityId: target.id,
        });
      } else addConstraint({ type: "equal", a: target.id, b: piece.id });
    }
    const validated = validateEntityProfile(profile);
    return {
      changed: true,
      profile: validated,
      affectedEntityIds: [
        target.id,
        ...pieces.slice(1).map((piece) => piece.id),
      ],
      deletedEntityIds: pieces.length ? [] : [target.id],
      deletedConstraintIds,
      createdConstraintIds,
      convertedConstraintIds,
      message: `${pieces.length ? "Tramo recortado" : "Entidad eliminada"}${deletedConstraintIds.length ? `; ${deletedConstraintIds.length} relaciones o cotas eliminadas` : ""}${convertedConstraintIds.length ? `; ${convertedConstraintIds.length} cotas conservadas entre los extremos exteriores` : ""}.`,
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
          : "No se puede recortar la entidad.",
    };
  }
}
