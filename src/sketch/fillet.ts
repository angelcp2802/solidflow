import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
  SketchSelection,
  TangentBranch,
} from "./types";
import { assertOffsetTopologyEditable, cleanupConstraintDependencies, constraintReferences as constraintRefs } from "./references";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";
import { createSketchIdAllocator } from "./ids";

export interface FilletParameters {
  radius: number;
  cornerPolicy: "keep" | "delete";
  equalRadiusEntityId?: string;
  /** Stable branch slot, not an index into the filtered candidates array. */
  solutionIndex?: number;
}
export interface FilletPlan {
  changed: boolean;
  sourceProfile: EntityProfile;
  profile: EntityProfile;
  message: string;
  affectedEntityIds: string[];
  filletEntityId: string | null;
  createdEntityIds: string[];
  createdConstraintIds: string[];
  deletedConstraintIds: string[];
  convertedConstraintIds: string[];
  sourceEdits: {
    entityId: string;
    endpoint: "start" | "end";
    movement: "trim" | "extend" | "none";
    /** Nonnegative travel along the source, in millimetres. */
    amount: number;
  }[];
  candidates: { index: number; label: string }[];
  selectedSolutionIndex: number | null;
}
export interface FilletBatchParameters extends FilletParameters {
  radiusMode: "individual" | "linked";
}
export interface FilletBatchPlan extends FilletPlan {
  filletEntityIds: string[];
}

/** Millimetres. Proximity does not merge existing point identities. */
export const FILLET_TOLERANCE = 1e-7;
const MIN_LENGTH = 1e-6;
const TAU = 2 * Math.PI;
type XY = { x: number; y: number };
type End = "start" | "end";
type SourceEntity = Exclude<SketchEntity, { type: "circle" }>;
type Curve = {
  entity: SourceEntity;
  start: SketchPoint;
  end: SketchPoint;
  center?: SketchPoint;
  radius: number;
  direction: XY;
  sweep: number;
};
type Locus =
  | {
      type: "line";
      start: XY;
      direction: XY;
      code: number;
      branch: TangentBranch;
    }
  | {
      type: "circle";
      center: XY;
      radius: number;
      code: number;
      branch: TangentBranch;
    };
type Corner = { point: XY | null; ends: [End, End] };
type Candidate = {
  index: number;
  label: string;
  center: XY;
  contacts: [XY, XY];
  clockwise: boolean;
  sweep: number;
  corner: Corner;
  branches: [TangentBranch, TangentBranch];
  sourceEdits: FilletPlan["sourceEdits"];
};
type NewConstraint<T = SketchConstraint> = T extends SketchConstraint
  ? Omit<T, "id">
  : never;
const add = (a: XY, b: XY): XY => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: XY, b: XY): XY => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: XY, k: number): XY => ({ x: a.x * k, y: a.y * k });
const dot = (a: XY, b: XY) => a.x * b.x + a.y * b.y;
const cross = (a: XY, b: XY) => a.x * b.y - a.y * b.x;
const length = (a: XY) => Math.hypot(a.x, a.y);
const distance = (a: XY, b: XY) => length(sub(a, b));
const left = (a: XY): XY => ({ x: -a.y, y: a.x });
const unit = (a: XY): XY => mul(a, 1 / length(a));
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
const ends: End[] = ["start", "end"];
const endLabels: Record<End, string> = { start: "inicio", end: "final" };
const branchLabels: Record<TangentBranch, string> = {
  left: "lado izquierdo",
  right: "lado derecho",
  external: "tangencia exterior",
  aContainsB: "arco fuente contiene al redondeo",
  bContainsA: "redondeo contiene al arco fuente",
};
const pointRefs = (e: SketchEntity) =>
  e.type === "line"
    ? [e.start, e.end]
    : e.type === "circle"
      ? [e.center]
      : [e.center, e.start, e.end];

function convertSourceLengths(profile: EntityProfile, sources: SourceEntity[]) {
  const converted: string[] = [];
  profile.constraints = profile.constraints.map((c) => {
    const source = sources.find(
      (source) => c.type === "length" && c.entityId === source.id,
    );
    if (!source || c.type !== "length" || c.driven) return c;
    const { entityId: _entityId, ...original } = c;
    converted.push(c.id);
    return { ...original, type: "distance", a: source.start, b: source.end };
  });
  return converted;
}

/** Cleanup against the complete surviving topology, not an intermediate corner. */
function deleteSourceCorners(
  profile: EntityProfile,
  sources: Curve[],
  oldCorners: string[],
  filletIds: Set<string>,
) {
  const sourceIds = new Set(sources.map((c) => c.entity.id));
  const sourcePoints = new Set(
    sources.flatMap((c) => [c.start.id, c.end.id, ...(c.center ? [c.center.id] : [])]),
  );
  const externalPoints = new Set(
    profile.entities
      .filter((e) => !sourceIds.has(e.id) && !filletIds.has(e.id))
      .flatMap(pointRefs),
  );
  const retainedCornerPoints = new Set(
    profile.entities.flatMap(pointRefs).filter((id) => oldCorners.includes(id)),
  );
  const corners = new Set(
    oldCorners.filter((id) => id !== "origin" && !retainedCornerPoints.has(id)),
  );
  const deleted: string[] = [];
  profile.constraints = profile.constraints.filter((c) => {
    const refs = constraintRefs(c);
    const exclusive = refs.some((id) => corners.has(id)) && refs.every((id) =>
      sourceIds.has(id) || (sourcePoints.has(id) && id !== "origin" &&
        !retainedCornerPoints.has(id) && !externalPoints.has(id)),
    );
    if (exclusive || (c.type === "length" && !c.driven && sourceIds.has(c.entityId))) {
      deleted.push(c.id);
      return false;
    }
    return true;
  });
  profile.constraints = cleanupConstraintDependencies(profile.constraints);
  const used = new Set([
    ...profile.entities.flatMap(pointRefs),
    ...profile.constraints.flatMap(constraintRefs),
  ]);
  profile.points = profile.points.filter((p) => !corners.has(p.id) || used.has(p.id));
  return {
    deleted,
    sharedCornerKept: oldCorners.some((id) => id === "origin" || externalPoints.has(id) || used.has(id)),
  };
}

function keepSourceCorner(
  profile: EntityProfile,
  cs: [Curve, Curve],
  corner: Corner,
  oldCorners: string[],
  put: (constraint: NewConstraint) => void,
) {
  cs.forEach((c, i) => {
    const type = c.entity.type === "line" ? "pointOnLine" : "pointOnCircle";
    if (!profile.constraints.some((relation) => relation.type === type &&
      relation.pointId === oldCorners[i] && relation.entityId === c.entity.id))
      put({ type, pointId: oldCorners[i], entityId: c.entity.id });
  });
  if (!corner.point || oldCorners[0] === oldCorners[1] ||
    distance(cs[0][corner.ends[0]], corner.point) > FILLET_TOLERANCE ||
    distance(cs[1][corner.ends[1]], corner.point) > FILLET_TOLERANCE) return;
  const connected = new Set([oldCorners[0]]);
  for (let previous = -1; previous !== connected.size;) {
    previous = connected.size;
    for (const c of profile.constraints)
      if (c.type === "coincident") {
        if (connected.has(c.a)) connected.add(c.b);
        if (connected.has(c.b)) connected.add(c.a);
      }
  }
  if (!connected.has(oldCorners[1]))
    put({ type: "coincident", a: oldCorners[0], b: oldCorners[1] });
}

function curve(entity: SourceEntity, points: Map<string, SketchPoint>, radialTolerance = FILLET_TOLERANCE): Curve {
  const start = points.get(entity.start)!,
    end = points.get(entity.end)!;
  if (entity.type === "line") {
    if (distance(start, end) < MIN_LENGTH)
      throw new Error("No se pueden redondear líneas degeneradas.");
    return {
      entity,
      start,
      end,
      radius: 0,
      direction: unit(sub(end, start)),
      sweep: 0,
    };
  }
  const center = points.get(entity.center)!,
    radius = distance(center, start);
  if (
    radius < MIN_LENGTH ||
    Math.abs(distance(center, end) - radius) > radialTolerance ||
    distance(start, end) < MIN_LENGTH
  )
    throw new Error(
      "El arco necesita extremos distintos sobre su circunferencia soporte.",
    );
  const sign = entity.clockwise ? -1 : 1;
  return {
    entity,
    start,
    end,
    center,
    radius,
    direction: { x: 0, y: 0 },
    sweep:
      sign *
      wrap(
        sign *
          (Math.atan2(end.y - center.y, end.x - center.x) -
            Math.atan2(start.y - center.y, start.x - center.x)),
      ),
  };
}

function parameter(c: Curve, p: XY) {
  if (c.entity.type === "line")
    return dot(sub(p, c.start), c.direction) / distance(c.start, c.end);
  if (distance(p, c.start) <= FILLET_TOLERANCE) return 0;
  if (distance(p, c.end) <= FILLET_TOLERANCE) return 1;
  const center = c.center!,
    angle =
      Math.atan2(p.y - center.y, p.x - center.x) -
      Math.atan2(c.start.y - center.y, c.start.x - center.x);
  return wrap(Math.sign(c.sweep) * angle) / Math.abs(c.sweep);
}

function contains(c: Curve, p: XY) {
  const t = parameter(c, p);
  if (c.entity.type === "line")
    return (
      Math.abs(cross(sub(p, c.start), c.direction)) <= FILLET_TOLERANCE &&
      t >= -FILLET_TOLERANCE / distance(c.start, c.end) &&
      t <= 1 + FILLET_TOLERANCE / distance(c.start, c.end)
    );
  return (
    Math.abs(distance(p, c.center!) - c.radius) <= FILLET_TOLERANCE &&
    t <= 1 + FILLET_TOLERANCE / c.radius
  );
}

function intersections(a: Locus, b: Locus): { point: XY; side: number }[] {
  if (a.type === "line" && b.type === "line") {
    const d = cross(a.direction, b.direction);
    return Math.abs(d) <= 1e-12
      ? []
      : [
          {
            point: add(
              a.start,
              mul(a.direction, cross(sub(b.start, a.start), b.direction) / d),
            ),
            side: 0,
          },
        ];
  }
  if (a.type === "circle" && b.type === "line") return intersections(b, a);
  if (a.type === "line" && b.type === "circle") {
    const offset = sub(b.center, a.start),
      along = dot(offset, a.direction),
      perpendicular = cross(a.direction, offset);
    const h2 = b.radius ** 2 - perpendicular ** 2;
    if (h2 < -FILLET_TOLERANCE * Math.max(1, b.radius)) return [];
    const h = Math.sqrt(Math.max(0, h2));
    return [along - h, along + h]
      .map((t, side) => ({ point: add(a.start, mul(a.direction, t)), side }))
      .filter((_, index) => index === 0 || h > FILLET_TOLERANCE);
  }
  if (a.type !== "circle" || b.type !== "circle") return [];
  const delta = sub(b.center, a.center),
    d = length(delta);
  if (
    d <= FILLET_TOLERANCE ||
    d > a.radius + b.radius + FILLET_TOLERANCE ||
    d < Math.abs(a.radius - b.radius) - FILLET_TOLERANCE
  )
    return [];
  const axis = mul(delta, 1 / d),
    along = (d ** 2 + a.radius ** 2 - b.radius ** 2) / (2 * d);
  const h2 =
    (((a.radius + b.radius) ** 2 - d ** 2) *
      (d ** 2 - (a.radius - b.radius) ** 2)) /
    (4 * d ** 2);
  const h = Math.sqrt(Math.max(0, h2)),
    base = add(a.center, mul(axis, along));
  return [1, -1]
    .map((sign, side) => ({
      point: add(base, mul(left(axis), sign * h)),
      side,
    }))
    .filter((_, index) => index === 0 || h > FILLET_TOLERANCE);
}

function support(c: Curve): Locus {
  return c.entity.type === "line"
    ? {
        type: "line",
        start: c.start,
        direction: c.direction,
        code: 0,
        branch: "left",
      }
    : {
        type: "circle",
        center: c.center!,
        radius: c.radius,
        code: 0,
        branch: "external",
      };
}
function loci(c: Curve, r: number): Locus[] {
  if (c.entity.type === "line")
    return [1, -1].map((sign, code) => ({
      type: "line",
      start: add(c.start, mul(left(c.direction), sign * r)),
      direction: c.direction,
      code,
      branch: sign === 1 ? "left" : "right",
    }));
  const result: Locus[] = [
    {
      type: "circle",
      center: c.center!,
      radius: c.radius + r,
      code: 0,
      branch: "external",
    },
  ];
  if (c.radius - r >= MIN_LENGTH)
    result.push({
      type: "circle",
      center: c.center!,
      radius: c.radius - r,
      code: 1,
      branch: "aContainsB",
    });
  if (r - c.radius >= MIN_LENGTH)
    result.push({
      type: "circle",
      center: c.center!,
      radius: r - c.radius,
      code: 2,
      branch: "bContainsA",
    });
  return result;
}
function contact(c: Curve, locus: Locus, center: XY, r: number): XY {
  if (c.entity.type === "line")
    return sub(
      center,
      mul(left(c.direction), locus.branch === "left" ? r : -r),
    );
  return add(
    c.center!,
    mul(
      unit(sub(center, c.center!)),
      locus.branch === "bContainsA" ? -c.radius : c.radius,
    ),
  );
}

function cornerOptions(cs: [Curve, Curve], selectedPoint?: XY): Corner[] {
  const shared: Corner[] = [];
  for (const a of ends)
    for (const b of ends) {
      if (
        distance(cs[0][a], cs[1][b]) <= FILLET_TOLERANCE &&
        (!selectedPoint ||
          distance(cs[0][a], selectedPoint) <= FILLET_TOLERANCE)
      )
        shared.push({ point: cs[0][a], ends: [a, b] });
    }
  // A real common corner identifies the source ends to replace. Prolongation
  // of a separated pair uses virtual support witnesses instead; it must not
  // silently replace the far ends of an already selected physical corner.
  if (shared.length) return shared;
  if (selectedPoint)
    throw new Error(
      "El punto seleccionado no es un extremo común de las dos entidades.",
    );
  const hits = intersections(support(cs[0]), support(cs[1]));
  if (!hits.length && cs.every((c) => c.entity.type === "line"))
    throw new Error(
      "Las líneas paralelas o colineales no definen una esquina única.",
    );
  const options = (c: Curve, p: XY): End[] => {
    if (c.entity.type === "arc" && !contains(c, p)) return ["start", "end"];
    const t = parameter(c, p);
    return t <= FILLET_TOLERANCE
      ? ["start"]
      : t >= 1 - FILLET_TOLERANCE
        ? ["end"]
        : ["start", "end"];
  };
  const corners: Corner[] = [];
  for (const hit of hits)
    for (const a of options(cs[0], hit.point))
      for (const b of options(cs[1], hit.point))
        if (
          !corners.some(
            (corner) =>
              corner.point &&
              corner.ends[0] === a &&
              corner.ends[1] === b &&
              distance(corner.point, hit.point) <= FILLET_TOLERANCE,
          )
        )
          corners.push({ point: hit.point, ends: [a, b] });
  if (!hits.length)
    for (const a of ends)
      for (const b of ends)
        corners.push({ point: null, ends: [a, b] });
  return corners;
}

/**
 * One finite directed interval, anchored at the endpoint that survives.
 * Its unique unwrapped contact lies in (L−2π,L) for start replacement,
 * or (0,2π) for end replacement. This permits extension through the old
 * endpoint and π, but never through the retained endpoint or a full turn.
 */
function retainedSweep(c: Curve, endpoint: End, p: XY): number {
  const far = c[endpoint === "start" ? "end" : "start"];
  const from = sub(endpoint === "start" ? p : far, c.center!);
  const to = sub(endpoint === "start" ? far : p, c.center!);
  return wrap(Math.sign(c.sweep) * Math.atan2(cross(from, to), dot(from, to)));
}

function sourceEdit(
  c: Curve,
  endpoint: End,
  p: XY,
): FilletPlan["sourceEdits"][number] {
  const oldLength =
    c.entity.type === "line"
      ? distance(c.start, c.end)
      : c.radius * Math.abs(c.sweep);
  const newLength =
    c.entity.type === "line"
      ? distance(p, c[endpoint === "start" ? "end" : "start"])
      : c.radius * retainedSweep(c, endpoint, p);
  const difference = newLength - oldLength;
  const unchanged = Math.abs(difference) <= FILLET_TOLERANCE;
  return {
    entityId: c.entity.id,
    endpoint,
    movement: unchanged ? "none" : difference > 0 ? "extend" : "trim",
    amount: unchanged ? 0 : Math.abs(difference),
  };
}

function validContact(
  c: Curve,
  endpoint: End,
  p: XY,
  corner: XY | null,
): boolean {
  const far = c[endpoint === "start" ? "end" : "start"];
  if (distance(far, p) < MIN_LENGTH) return false;
  const t = parameter(c, p);
  if (c.entity.type === "arc") {
    if (Math.abs(distance(p, c.center!) - c.radius) > FILLET_TOLERANCE)
      return false;
    const retained = retainedSweep(c, endpoint, p);
    if (retained <= 0 || retained >= TAU) return false;
    if (corner) {
      if (
        retained >
        retainedSweep(c, endpoint, corner) + FILLET_TOLERANCE / c.radius
      )
        return false;
    }
    return true;
  }
  if (endpoint === "start" ? t >= 1 : t <= 0) return false;
  return !corner || dot(sub(p, corner), sub(far, corner)) > 0;
}
function away(c: Curve, endpoint: End, p: XY): XY {
  if (c.entity.type === "line")
    return unit(sub(c[endpoint === "start" ? "end" : "start"], p));
  return mul(
    unit(left(sub(p, c.center!))),
    Math.sign(c.sweep) * (endpoint === "start" ? 1 : -1),
  );
}

/** Whether a center belongs to an ordered offset-intersection slot. */
function matchesIntersectionSide(
  a: Locus,
  b: Locus,
  center: XY,
  side: number,
): boolean {
  if (a.type === "circle" && b.type === "line")
    return matchesIntersectionSide(b, a, center, side);
  if (a.type === "line" && b.type === "circle") {
    const along = dot(sub(center, b.center), a.direction);
    // At a tangent birth both ordered roots meet, even though intersections()
    // returns just slot zero at the double root.
    return Math.abs(along) <= FILLET_TOLERANCE || side === (along < 0 ? 0 : 1);
  }
  if (a.type !== "circle" || b.type !== "circle") return false;
  const axis = sub(b.center, a.center), d = length(axis);
  if (d <= FILLET_TOLERANCE) return false;
  const height = cross(axis, sub(center, a.center)) / d;
  return Math.abs(height) <= FILLET_TOLERANCE || side === (height > 0 ? 0 : 1);
}

/**
 * Each source arc has at most one retained-end crossing per tangent-locus pair.
 * There the fillet center is F(r)=Q+r*n. Substitution in the other offset
 * support is linear in r: the quadratic terms cancel because |n|=1.
 */
function retainedEndCriticalRadius(
  cs: [Curve, Curve],
  corner: Corner,
  currentLoci: [Locus, Locus],
  sourceIndex: number,
  side: number,
  limits: { minimum: number; maximum: number } = { minimum: SKETCH_LIMITS.minDimension, maximum: SKETCH_LIMITS.maxDimension },
): number | undefined {
  const source = cs[sourceIndex];
  if (source.entity.type !== "arc") return undefined;
  const otherIndex = sourceIndex === 0 ? 1 : 0,
    other = cs[otherIndex],
    sourceLocus = currentLoci[sourceIndex],
    otherLocus = currentLoci[otherIndex];
  const far = source[corner.ends[sourceIndex] === "start" ? "end" : "start"];
  const radial = unit(sub(far, source.center!));
  // The accepted input may have a tiny endpoint radial residual. Project Q to
  // the measured support so the cancellation uses one exact source radius.
  const q = add(source.center!, mul(radial, source.radius));
  const normal = mul(radial, sourceLocus.branch === "external" ? 1 : -1);
  let numerator: number, denominator: number;
  if (other.entity.type === "line") {
    const lineNormal = left(other.direction),
      branchSign = otherLocus.branch === "left" ? 1 : -1;
    numerator = -dot(sub(q, other.start), lineNormal);
    denominator = dot(normal, lineNormal) - branchSign;
  } else {
    const offset = sub(q, other.center!),
      d = length(offset),
      branchSign = otherLocus.branch === "external" ? 1 : -1;
    numerator = (other.radius - d) * (other.radius + d);
    denominator = 2 * (dot(offset, normal) - branchSign * other.radius);
  }
  if (denominator === 0) return undefined;
  const radius = numerator / denominator;
  if (
    !Number.isFinite(radius) ||
    radius < limits.minimum ||
    radius > limits.maximum
  )
    return undefined;
  const criticalLoci = cs.map((c, i) =>
    loci(c, radius).find((locus) => locus.code === currentLoci[i].code),
  );
  if (!criticalLoci[0] || !criticalLoci[1]) return undefined;
  const center = add(q, mul(normal, radius));
  const onLocus = (locus: Locus) =>
    locus.type === "line"
      ? Math.abs(cross(sub(center, locus.start), locus.direction)) <= FILLET_TOLERANCE
      : Math.abs(distance(center, locus.center) - locus.radius) <= FILLET_TOLERANCE;
  if (
    !onLocus(criticalLoci[0]) ||
    !onLocus(criticalLoci[1]) ||
    !matchesIntersectionSide(criticalLoci[0], criticalLoci[1], center, side)
  )
    return undefined;
  return radius;
}

function radiusFamily(
  cs: [Curve, Curve],
  corner: Corner,
  currentLoci: [Locus, Locus],
  side: number,
  radius: number,
  limits: { minimum: number; maximum: number } = { minimum: SKETCH_LIMITS.minDimension, maximum: SKETCH_LIMITS.maxDimension },
): number {
  return cs.reduce((mask, _, i) => {
    const critical = retainedEndCriticalRadius(cs, corner, currentLoci, i, side, limits);
    return critical !== undefined && radius > critical ? mask | (1 << i) : mask;
  }, 0);
}

function candidates(
  cs: [Curve, Curve],
  corners: Corner[],
  r: number,
  limits: { minimum: number; maximum: number; coordinate: number } = {
    minimum: SKETCH_LIMITS.minDimension, maximum: SKETCH_LIMITS.maxDimension, coordinate: SKETCH_LIMITS.maxCoordinate },
): Candidate[] {
  const result: Candidate[] = [];
  for (const corner of corners)
    for (const a of loci(cs[0], r))
      for (const b of loci(cs[1], r)) {
        for (const hit of intersections(a, b)) {
          const contacts = [
            contact(cs[0], a, hit.point, r),
            contact(cs[1], b, hit.point, r),
          ] as [XY, XY];
          if (
            [hit.point, ...contacts].some(
              (point) =>
                !Number.isFinite(point.x) ||
                !Number.isFinite(point.y) ||
                Math.max(Math.abs(point.x), Math.abs(point.y)) >
                  limits.coordinate,
            )
          )
            continue;
          if (
            distance(contacts[0], contacts[1]) < MIN_LENGTH ||
            !cs.every((c, i) =>
              validContact(c, corner.ends[i], contacts[i], corner.point),
            )
          )
            continue;
          const startTangent = unit(left(sub(contacts[0], hit.point))),
            incoming = mul(away(cs[0], corner.ends[0], contacts[0]), -1);
          const clockwise = dot(startTangent, incoming) < 0,
            sign = clockwise ? -1 : 1;
          const endTangent = mul(unit(left(sub(contacts[1], hit.point))), sign);
          if (
            dot(mul(startTangent, sign), incoming) < 1 - 1e-6 ||
            dot(endTangent, away(cs[1], corner.ends[1], contacts[1])) < 1 - 1e-6
          )
            continue;
          // Fixed physical slots; support-corner witnesses never enter the
          // key. A retained-end crossing splits disconnected radius families,
          // so an explicit choice cannot reappear across a zero/full-turn gap.
          const physicalIndex =
            ((((corner.ends[0] === "end" ? 1 : 0) * 2 +
              (corner.ends[1] === "end" ? 1 : 0)) *
              3 +
              a.code) *
              3 +
              b.code) *
              2 +
            hit.side;
          const index =
            physicalIndex + 72 * radiusFamily(cs, corner, [a, b], hit.side, r, limits);
          if (result.some((candidate) => candidate.index === index)) continue;
          const sweep = wrap(
            sign *
              (Math.atan2(
                contacts[1].y - hit.point.y,
                contacts[1].x - hit.point.x,
              ) -
                Math.atan2(
                  contacts[0].y - hit.point.y,
                  contacts[0].x - hit.point.x,
                )),
          );
          const sourceEdits = cs.map((c, i) =>
            sourceEdit(c, corner.ends[i], contacts[i]),
          );
          const sourceLabel = (i: number, branch: TangentBranch) => {
            const c = cs[i],
              edit = sourceEdits[i];
            const major =
              c.entity.type === "arc" &&
              retainedSweep(c, corner.ends[i], contacts[i]) > Math.PI;
            return `${i === 0 ? "Primera" : "Segunda"}: ${endLabels[corner.ends[i]]}, ${branchLabels[branch]}${edit.movement === "extend" ? ", prolonga" : ""}${major ? ", arco fuente mayor" : ""}`;
          };
          result.push({
            index,
            label: `${sourceLabel(0, a.branch)} · ${sourceLabel(1, b.branch)} · ${clockwise ? "horario" : "antihorario"}${sweep > Math.PI ? " · arco mayor" : ""}`,
            center: hit.point,
            contacts,
            clockwise,
            sweep,
            corner,
            branches: [a.branch, b.branch],
            sourceEdits,
          });
        }
      }
  return result.sort((a, b) => a.index - b.index);
}

/**
 * Entity-only default: minor fillet, then minimum total source travel in mm.
 * It is invariant under rigid transforms and scaling beyond geometric tolerance.
 * A genuine tie needs an explicit branch; a latched choice never uses this rule.
 */
function defaultCandidate(possible: Candidate[]): Candidate | undefined {
  const minor = possible.filter((candidate) => candidate.sweep <= Math.PI);
  const eligible = minor.length ? minor : possible;
  if (!eligible.length) return undefined;
  const travel = (candidate: Candidate) =>
    candidate.sourceEdits.reduce((sum, edit) => sum + edit.amount, 0);
  const minimum = Math.min(...eligible.map(travel));
  const closest = eligible.filter(
    (candidate) => Math.abs(travel(candidate) - minimum) <= FILLET_TOLERANCE,
  );
  if (closest.length !== 1)
    throw new Error(
      "Varias ramas tienen el mismo desplazamiento; elige una solución explícita.",
    );
  return closest[0];
}

/** Already-resolved analytic sources, directed into and out of one common corner. */
export type FilletCornerSource = {
  id: string;
  start: XY;
  end: XY;
} & ({ type: "line" } | { type: "arc"; center: XY; clockwise: boolean });

export interface FilletCornerGeometry {
  center: XY;
  contacts: [XY, XY];
  clockwise: boolean;
  /** Stable physical locus/intersection family; continuous radius is not identity. */
  branchIndex: number;
  branches: [TangentBranch, TangentBranch];
}

/**
 * Pure transient corner geometry. It reuses the sketch tool's analytic loci and
 * branch selection without allocating sketch IDs/constraints or solving/editing
 * a profile. The wider bounds apply only to internal derived CAD geometry.
 */
export function resolveTrimmedCornerFillet(first: FilletCornerSource, second: FilletCornerSource,
  radius: number, clockwise: boolean, joinTolerance: number): FilletCornerGeometry {
  const limits = { minimum: MIN_LENGTH, maximum: 200_000, coordinate: 2_000_000 };
  if (!Number.isFinite(radius) || radius < limits.minimum || radius > limits.maximum
    || !Number.isFinite(joinTolerance) || joinTolerance <= 0 || joinTolerance > .01) {
    throw new Error("El redondeo automático requiere un radio y una tolerancia geométrica válidos.");
  }
  if (!first.id || !second.id || first.id === second.id
    || distance(first.end, second.start) > joinTolerance) {
    throw new Error("El redondeo automático requiere dos tramos distintos unidos por una esquina.");
  }
  const sources = [first, second].map((source, index) => {
    const values = [source.start, source.end, ...(source.type === "arc" ? [source.center] : [])];
    if (values.some(point => ![point.x, point.y].every(Number.isFinite)
      || Math.max(Math.abs(point.x), Math.abs(point.y)) > limits.coordinate)) {
      throw new Error("La esquina del redondeo automático contiene coordenadas no válidas.");
    }
    const prefix = `derived-corner-${index}`, start = { ...source.start, id: prefix + "-start" },
      end = { ...source.end, id: prefix + "-end" };
    const points = new Map<string, SketchPoint>([[start.id, start], [end.id, end]]);
    if (source.type === "line") return curve({ id: source.id, type: "line", start: start.id, end: end.id, construction: false }, points);
    const center = { ...source.center, id: prefix + "-center" }; points.set(center.id, center);
    return curve({ id: source.id, type: "arc", start: start.id, end: end.id, center: center.id,
      clockwise: source.clockwise, construction: false }, points, 2 * joinTolerance);
  }) as [Curve, Curve];
  const possible = candidates(sources, [{ point: { ...first.end }, ends: ["end", "start"] }], radius, limits)
    .filter(candidate => candidate.clockwise === clockwise
      && candidate.sourceEdits.every(edit => edit.movement !== "extend"));
  const chosen = defaultCandidate(possible);
  if (!chosen) throw new Error("La esquina no admite un redondeo tangente de ese radio dentro de sus tramos.");
  return { center: { ...chosen.center }, contacts: chosen.contacts.map(point => ({ ...point })) as [XY, XY],
    clockwise: chosen.clockwise, branchIndex: chosen.index, branches: [...chosen.branches] };
}

function select(
  profile: EntityProfile,
  selection: SketchSelection[],
  points: Map<string, SketchPoint>,
): { curves: [Curve, Curve]; point?: XY } {
  let entities: SourceEntity[], selectedPoint: XY | undefined;
  if (selection.length === 1 && selection[0].kind === "point") {
    selectedPoint = points.get(selection[0].id);
    if (!selectedPoint) throw new Error("El punto seleccionado no existe.");
    const incident = profile.entities.filter(
      (e) => e.type !== "circle" && contains(curve(e, points), selectedPoint!),
    );
    if (incident.length !== 2)
      throw new Error(
        "Selecciona un vértice de dos entidades o elige explícitamente el par a redondear.",
      );
    entities = incident as SourceEntity[];
  } else if (
    selection.length === 2 &&
    selection.every((s) => s.kind === "entity") &&
    selection[0].id !== selection[1].id
  ) {
    entities = selection.map((s) => {
      const entity = profile.entities.find((e) => e.id === s.id);
      if (!entity || entity.type === "circle")
        throw new Error(
          "Selecciona dos líneas o arcos distintos; los círculos completos no se recortan.",
        );
      return entity;
    });
  } else
    throw new Error("Selecciona un vértice o dos líneas/arcos en orden A / B.");
  return {
    curves: entities.map((e) => curve(e, points)) as [Curve, Curve],
    point: selectedPoint,
  };
}

/**
 * Detached plan on the displayed solved profile. Preview and commit share this
 * detached profile and its new identities; branch slots are deterministic.
 * A caller must solve
 * before committing. Tangency branches and arc winding persist in normal data.
 */
export function planSketchFillet(
  input: EntityProfile,
  selection: SketchSelection[],
  parameters: FilletParameters,
): FilletPlan {
  let choices: FilletPlan["candidates"] = [];
  try {
    const profile = validateEntityProfile(input),
      points = new Map(profile.points.map((p) => [p.id, p]));
    points.set("origin", { id: "origin", x: 0, y: 0 });
    const r = parameters.radius;
    if (
      !Number.isFinite(r) ||
      r < SKETCH_LIMITS.minDimension ||
      r > SKETCH_LIMITS.maxDimension
    )
      throw new Error("El radio debe estar entre 0.01 y 100000 mm.");
    if (
      parameters.cornerPolicy !== "keep" &&
      parameters.cornerPolicy !== "delete"
    )
      throw new Error("La política de esquina no es válida.");
    if (
      parameters.solutionIndex !== undefined &&
      (!Number.isSafeInteger(parameters.solutionIndex) ||
        parameters.solutionIndex < 0)
    )
      throw new Error("La solución seleccionada no es válida.");
    const selected = select(profile, selection, points),
      cs = selected.curves;
    assertOffsetTopologyEditable(profile.constraints, cs.map(c => c.entity.id));
    const sourceIds = new Set(cs.map((c) => c.entity.id));
    if (parameters.equalRadiusEntityId !== undefined) {
      const reference = profile.entities.find(
        (e) => e.id === parameters.equalRadiusEntityId,
      );
      if (
        !reference ||
        reference.type === "line" ||
        sourceIds.has(reference.id)
      )
        throw new Error(
          "La igualdad de radio requiere otra entidad circular existente.",
        );
      const measured =
        reference.type === "circle"
          ? reference.radius
          : distance(
              points.get(reference.center)!,
              points.get(reference.start)!,
            );
      if (Math.abs(measured - r) > FILLET_TOLERANCE)
        throw new Error(
          "El radio debe coincidir con el radio medido de la entidad de referencia.",
        );
    }
    const corners = cornerOptions(cs, selected.point);
    const possible = candidates(cs, corners, r);
    choices = possible.map(({ index, label }) => ({ index, label }));
    if (
      !selected.point &&
      parameters.solutionIndex === undefined &&
      corners.filter(
        (c) =>
          c.point &&
          cs.every(
            (source, i) =>
              distance(source[c.ends[i]], c.point!) <= FILLET_TOLERANCE,
          ),
      ).length > 1
    )
      throw new Error(
        "El par comparte más de una esquina; selecciona un vértice o una solución explícita.",
      );
    const chosen =
      parameters.solutionIndex === undefined
        ? defaultCandidate(possible)
        : possible.find((c) => c.index === parameters.solutionIndex);
    if (!chosen)
      throw new Error(
        parameters.solutionIndex === undefined
          ? "No existe un redondeo tangente con ese radio y los tramos disponibles."
          : "La rama seleccionada ya no existe para ese radio; elige otra solución explícitamente.",
      );
    const commonOriginalCorner = ends.some((a) =>
      ends.some((b) => distance(cs[0][a], cs[1][b]) <= FILLET_TOLERANCE),
    );
    // A separated curved pair does not have an original shared corner to
    // preserve. Its replaced exclusive endpoints and anchors are cleaned up
    // for both policies; surviving/external points still use the same guards.
    const deleteCorners =
      parameters.cornerPolicy === "delete" ||
      (!commonOriginalCorner && cs.some((c) => c.entity.type === "arc"));
    const uid = createSketchIdAllocator(profile, "fillet");
    const createdConstraintIds: string[] = [],
      convertedConstraintIds: string[] = [],
      deletedConstraintIds: string[] = [];
    const put = (c: NewConstraint) => {
      const id = uid("constraint");
      profile.constraints.push({ ...c, id } as SketchConstraint);
      createdConstraintIds.push(id);
    };
    const oldCorners = cs.map((c, i) => c.entity[chosen.corner.ends[i]]);
    const center = { id: uid("center"), ...chosen.center };
    const contacts = chosen.contacts.map((p) => ({ id: uid("point"), ...p }));
    const fillet: Extract<SketchEntity, { type: "arc" }> = {
      id: uid("arc"),
      type: "arc",
      construction: cs.every((c) => c.entity.construction),
      center: center.id,
      start: contacts[0].id,
      end: contacts[1].id,
      clockwise: chosen.clockwise,
    };
    if (!deleteCorners) {
      convertedConstraintIds.push(...convertSourceLengths(profile, cs.map((c) => c.entity)));
    }
    cs.forEach((c, i) => {
      c.entity[chosen.corner.ends[i]] = contacts[i].id;
    });
    profile.points.push(center, ...contacts);
    profile.entities.push(fillet);
    let sharedCornerKept = false;
    if (deleteCorners) {
      const cleanup = deleteSourceCorners(profile, cs, oldCorners, new Set([fillet.id]));
      deletedConstraintIds.push(...cleanup.deleted);
      sharedCornerKept = cleanup.sharedCornerKept;
    } else {
      keepSourceCorner(profile, cs, chosen.corner, oldCorners, put);
    }
    cs.forEach((c, i) =>
      put({
        type: "tangent",
        a: c.entity.id,
        b: fillet.id,
        branch: chosen.branches[i],
      }),
    );
    if (parameters.equalRadiusEntityId !== undefined)
      put({ type: "equal", a: fillet.id, b: parameters.equalRadiusEntityId });
    else put({ type: "radius", entityId: fillet.id, value: r });
    return {
      changed: true,
      sourceProfile: input,
      profile: validateEntityProfile(profile),
      message: `Redondeo creado${sharedCornerKept ? "; el origen o la esquina compartida se conserva sin nuevas relaciones de soporte" : ""}.`,
      affectedEntityIds: cs.map((c) => c.entity.id),
      filletEntityId: fillet.id,
      createdEntityIds: [fillet.id],
      createdConstraintIds,
      deletedConstraintIds,
      convertedConstraintIds,
      sourceEdits: chosen.sourceEdits,
      candidates: choices,
      selectedSolutionIndex: chosen.index,
    };
  } catch (error) {
    return {
      changed: false,
      sourceProfile: input,
      profile: input,
      message:
        error instanceof Error
          ? error.message
          : "No se puede preparar el redondeo.",
      affectedEntityIds: [],
      filletEntityId: null,
      createdEntityIds: [],
      createdConstraintIds: [],
      deletedConstraintIds: [],
      convertedConstraintIds: [],
      sourceEdits: [],
      candidates: choices,
      selectedSolutionIndex: null,
    };
  }
}

/**
 * Atomic common-corner line batch on the displayed solved geometry. Every
 * candidate uses the same original supports; joint intervals are checked before
 * any detached topology is changed. The caller solves once before committing.
 */
export function planSketchFilletBatch(
  input: EntityProfile,
  selection: SketchSelection[],
  parameters: FilletBatchParameters,
): FilletBatchPlan {
  try {
    const profile = validateEntityProfile(input);
    const { radius: r, cornerPolicy, radiusMode, equalRadiusEntityId } = parameters;
    if (!Number.isFinite(r) || r < SKETCH_LIMITS.minDimension || r > SKETCH_LIMITS.maxDimension)
      throw new Error("El radio debe estar entre 0.01 y 100000 mm.");
    if (cornerPolicy !== "keep" && cornerPolicy !== "delete")
      throw new Error("La política de esquina no es válida.");
    if (radiusMode !== "individual" && radiusMode !== "linked")
      throw new Error("Elige radios individuales o enlazados para el lote.");
    if (parameters.solutionIndex !== undefined)
      throw new Error("Las soluciones de pareja no se aplican a un lote de vértices.");
    if (equalRadiusEntityId !== undefined && radiusMode !== "linked")
      throw new Error("Una referencia externa requiere radios enlazados.");
    if (selection.length < 2 || selection.some((s) => s.kind !== "point"))
      throw new Error("Selecciona al menos dos vértices comunes entre líneas.");
    if (new Set(selection.map((s) => s.id)).size !== selection.length)
      throw new Error("El lote contiene una esquina repetida.");
    const compareIds = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const points = new Map(profile.points.map((p) => [p.id, p]));
    points.set("origin", { id: "origin", x: 0, y: 0 });
    if (equalRadiusEntityId !== undefined) {
      const reference = profile.entities.find((e) => e.id === equalRadiusEntityId);
      if (!reference || reference.type === "line")
        throw new Error("La igualdad de radio requiere otra entidad circular existente.");
      const measured = reference.type === "circle" ? reference.radius :
        distance(points.get(reference.center)!, points.get(reference.start)!);
      if (Math.abs(measured - r) > FILLET_TOLERANCE)
        throw new Error("El radio debe coincidir con el radio medido de la entidad de referencia.");
    }
    const editedEnds = new Set<string>();
    const targets = [...selection].sort(compareIds).map((target) => {
      const selected = select(profile, [target], points);
      if (selected.curves.some((c) => c.entity.type !== "line"))
        throw new Error("El lote admite únicamente esquinas comunes entre líneas.");
      const cs = [...selected.curves].sort((a, b) => compareIds(a.entity, b.entity)) as [Curve, Curve];
      assertOffsetTopologyEditable(profile.constraints, cs.map(c => c.entity.id));
      const chosen = defaultCandidate(candidates(cs, cornerOptions(cs, selected.point), r));
      if (!chosen)
        throw new Error(`La esquina ${target.id} no admite ese radio con los tramos disponibles.`);
      const oldCorners = cs.map((c, i) => c.entity[chosen.corner.ends[i]]);
      cs.forEach((c, i) => {
        const key = `${c.entity.id}\0${chosen.corner.ends[i]}`;
        if (editedEnds.has(key)) throw new Error("El lote contiene una esquina física repetida.");
        editedEnds.add(key);
      });
      return { cs, chosen, oldCorners };
    });
    const sources = new Map<string, Curve>();
    const contacts = new Map<string, Partial<Record<End, XY>>>();
    targets.forEach(({ cs, chosen }) => cs.forEach((c, i) => {
      sources.set(c.entity.id, c);
      const edits = contacts.get(c.entity.id) ?? {};
      edits[chosen.corner.ends[i]] = chosen.contacts[i];
      contacts.set(c.entity.id, edits);
    }));
    // An individually valid pair can cross the other contact on a shared line.
    // Signed order on the ORIGINAL support catches both zero and reversal.
    for (const [id, edits] of contacts) {
      const source = sources.get(id)!;
      const start = edits.start ?? source.start, end = edits.end ?? source.end;
      if (dot(sub(end, start), source.direction) < MIN_LENGTH)
        throw new Error(`Los redondeos consumen o invierten el tramo compartido ${id}.`);
    }
    const uid = createSketchIdAllocator(profile, "fillet");
    const createdConstraintIds: string[] = [];
    const put = (c: NewConstraint) => {
      const id = uid("constraint");
      profile.constraints.push({ ...c, id } as SketchConstraint);
      createdConstraintIds.push(id);
    };
    const convertedConstraintIds = cornerPolicy === "keep" ?
      convertSourceLengths(profile, [...sources.values()].map((c) => c.entity)) : [];
    const filletEntityIds: string[] = [];
    for (const { cs, chosen, oldCorners } of targets) {
      const center = { id: uid("center"), ...chosen.center };
      const contactPoints = chosen.contacts.map((p) => ({ id: uid("point"), ...p }));
      const fillet: Extract<SketchEntity, { type: "arc" }> = {
        id: uid("arc"), type: "arc", construction: cs.every((c) => c.entity.construction),
        center: center.id, start: contactPoints[0].id, end: contactPoints[1].id,
        clockwise: chosen.clockwise,
      };
      cs.forEach((c, i) => { c.entity[chosen.corner.ends[i]] = contactPoints[i].id; });
      profile.points.push(center, ...contactPoints);
      profile.entities.push(fillet);
      filletEntityIds.push(fillet.id);
      if (cornerPolicy === "keep") keepSourceCorner(profile, cs, chosen.corner, oldCorners, put);
      cs.forEach((c, i) => put({ type: "tangent", a: c.entity.id, b: fillet.id, branch: chosen.branches[i] }));
      const reference = equalRadiusEntityId ?? (radiusMode === "linked" ? filletEntityIds[0] : undefined);
      if (reference !== undefined && reference !== fillet.id)
        put({ type: "equal", a: fillet.id, b: reference });
      else put({ type: "radius", entityId: fillet.id, value: r });
    }
    const deletedConstraintIds = cornerPolicy === "delete" ?
      deleteSourceCorners(profile, [...sources.values()], targets.flatMap((t) => t.oldCorners), new Set(filletEntityIds)).deleted : [];
    return {
      changed: true, sourceProfile: input, profile: validateEntityProfile(profile),
      message: `${filletEntityIds.length} redondeos preparados como un único lote.`,
      affectedEntityIds: [...sources.keys()].sort(),
      filletEntityId: filletEntityIds[0], filletEntityIds,
      createdEntityIds: [...filletEntityIds], createdConstraintIds,
      deletedConstraintIds, convertedConstraintIds,
      sourceEdits: targets.flatMap((t) => t.chosen.sourceEdits),
      candidates: [], selectedSolutionIndex: null,
    };
  } catch (error) {
    return {
      changed: false, sourceProfile: input, profile: input,
      message: error instanceof Error ? error.message : "No se puede preparar el lote de redondeos.",
      affectedEntityIds: [], filletEntityId: null, filletEntityIds: [],
      createdEntityIds: [], createdConstraintIds: [], deletedConstraintIds: [],
      convertedConstraintIds: [], sourceEdits: [], candidates: [], selectedSolutionIndex: null,
    };
  }
}

/** Conservative post-solve command check; this is not a generic solver path guard. */
export function validateSketchFilletBatchResult(
  plan: FilletBatchPlan,
  solved: EntityProfile,
): string | null {
  if (!plan.changed) return "El lote no contiene una propuesta válida.";
  const points = new Map(solved.points.map((p) => [p.id, p]));
  points.set("origin", { id: "origin", x: 0, y: 0 });
  const previewPoints = new Map(plan.profile.points.map((p) => [p.id, p]));
  previewPoints.set("origin", { id: "origin", x: 0, y: 0 });
  for (const id of plan.affectedEntityIds) {
    const source = plan.profile.entities.find((e) => e.id === id);
    const result = solved.entities.find((e) => e.id === id);
    if (!source || source.type !== "line" || !result || result.type !== "line" ||
      result.start !== source.start || result.end !== source.end)
      return "El solver ha cambiado la topología de una línea del lote.";
    const start = points.get(result.start), end = points.get(result.end);
    const previewStart = previewPoints.get(source.start), previewEnd = previewPoints.get(source.end);
    if (!start || !end || !previewStart || !previewEnd)
      return "El lote ha perdido un punto de contacto.";
    const signed = dot(sub(end, start), unit(sub(previewEnd, previewStart)));
    if (!Number.isFinite(signed) || signed < MIN_LENGTH)
      return "El solver ha consumido o invertido una línea del lote.";
  }
  for (const id of plan.filletEntityIds) {
    const arc = solved.entities.find((e) => e.id === id);
    const preview = plan.profile.entities.find((e) => e.id === id);
    if (!arc || arc.type !== "arc" || !preview || preview.type !== "arc" ||
      arc.start !== preview.start || arc.end !== preview.end ||
      arc.center !== preview.center || arc.clockwise !== preview.clockwise)
      return "El lote ha perdido la topología de un arco de redondeo.";
    const start = points.get(arc.start), end = points.get(arc.end), center = points.get(arc.center);
    if (!start || !end || !center || distance(start, end) < MIN_LENGTH ||
      distance(center, start) < MIN_LENGTH || distance(center, end) < MIN_LENGTH)
      return "El solver ha colapsado un arco de redondeo del lote.";
  }
  return null;
}
