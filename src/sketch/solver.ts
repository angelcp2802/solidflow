import type {
  DimensionalConstraint,
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchSolveResult,
} from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";
import { arcStepPreservesWinding } from "./arc-step";
import { orderedArcDirections } from "./arc-directions";
import { offsetGeometryError } from "./offset-geometry";

/** Accepted equation residual, in mm (angular equations are scaled by line length). */
export const SKETCH_SOLVER_TOLERANCE = 1e-7;
const MIN_GEOMETRY = 1e-6;
// Reflection transports orientation to the image without a copied H/V or fix.
// Refine its coupled equations below the public acceptance threshold so tiny
// off-axis drift does not become a new normal in downstream geometric names.
const SYMMETRY_REFINEMENT_TOLERANCE = 1e-10;
const RANK_TOLERANCE = 1e-8;
const TIME_LIMIT_MS = 4_000;

export function isDimensionalConstraint(
  constraint: SketchConstraint,
): constraint is DimensionalConstraint {
  return "value" in constraint;
}

/** Measures geometry, never the stored value. Invalid/missing geometry has no measurement. */
export function measureDimension(
  profile: EntityProfile,
  constraint: DimensionalConstraint,
): number | null {
  const point = (id: string) =>
    id === "origin"
      ? { x: 0, y: 0 }
      : profile.points.find((candidate) => candidate.id === id);
  const delta = (a: string, b: string): [number, number] | null => {
    const p = point(a),
      q = point(b);
    return p && q && [p.x, p.y, q.x, q.y].every(Number.isFinite)
      ? [q.x - p.x, q.y - p.y]
      : null;
  };
  let value: number;
  if (constraint.type === "offsetDistance") {
    const group = profile.constraints.find(c => c.id === constraint.offsetId);
    if (group?.type !== "offset") return null;
    const image = group.images.find(candidate => candidate.side === constraint.side);
    if (!image) return null;
    const source = group.sources[0], a = profile.entities.find(e => e.id === source.entityId), b = profile.entities.find(e => e.id === image.entityIds[0]);
    if (!a || !b) return null;
    const sign = image.side === "right" ? 1 : -1;
    if (a.type === "line" && b.type === "line") {
      const u = delta(a.start, a.end), v = delta(a.start, b.start);
      if (!u || !v || !Math.hypot(...u)) return null;
      value = -(u[0] * v[1] - u[1] * v[0]) / Math.hypot(...u) * (source.reversed ? -1 : 1) * sign;
    } else if (a.type !== "line" && b.type !== "line") {
      const radius = (entity: typeof a): number | null => {
        if (entity.type === "circle") return entity.radius;
        const radial = delta(entity.center, entity.start); return radial && Math.hypot(...radial);
      };
      const sourceRadius = radius(a), targetRadius = radius(b);
      if (sourceRadius === null || targetRadius === null) return null;
      value = (targetRadius - sourceRadius) * sign * (a.type === "arc" && (a.clockwise !== source.reversed) ? -1 : 1);
    } else return null;
  } else if (constraint.type === "angle") {
    const a = profile.entities.find((entity) => entity.id === constraint.a),
      b = profile.entities.find((entity) => entity.id === constraint.b);
    if (a?.type !== "line" || b?.type !== "line" || a.id === b.id) return null;
    const first = delta(a.start, a.end),
      second = delta(b.start, b.end);
    if (!first || !second) return null;
    const la = Math.hypot(...first),
      lb = Math.hypot(...second);
    if (la <= 0 || lb <= 0) return null;
    const signA = constraint.reversedA ? -1 : 1,
      signB = constraint.reversedB ? -1 : 1;
    const u = first.map((coordinate) => (coordinate * signA) / la),
      v = second.map((coordinate) => (coordinate * signB) / lb);
    const cross = (u[0] * v[1] - u[1] * v[0]) * (constraint.clockwise ? -1 : 1);
    value = (Math.atan2(cross, u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI;
    if (value < 0) value += 360;
    if (value === 360 || Object.is(value, -0)) value = 0;
  } else if (
    constraint.type === "distance" ||
    constraint.type === "distanceX" ||
    constraint.type === "distanceY"
  ) {
    const vector = delta(constraint.a, constraint.b);
    if (!vector) return null;
    value =
      constraint.type === "distance"
        ? Math.hypot(...vector)
        : vector[constraint.type === "distanceX" ? 0 : 1];
  } else if (constraint.type === "length" || constraint.type === "radius") {
    const entity = profile.entities.find(
      (candidate) => candidate.id === constraint.entityId,
    );
    if (!entity || (constraint.type === "length") !== (entity.type === "line"))
      return null;
    if (entity.type === "circle") value = entity.radius;
    else {
      const vector = delta(
        entity.type === "line" ? entity.start : entity.center,
        entity.type === "line" ? entity.end : entity.start,
      );
      if (!vector) return null;
      value = Math.hypot(...vector);
    }
  } else return null;
  return Number.isFinite(value) ? value : null;
}

function drivenMeasurements(
  profile: EntityProfile,
  solved: boolean,
): Record<string, number | null> {
  if (!profile || typeof profile !== "object") return {};
  // Object.fromEntries safely retains arbitrary valid IDs, including '__proto__'.
  return Object.fromEntries(
    (Array.isArray(profile.constraints) ? profile.constraints : [])
      .filter(
        (constraint) =>
          constraint &&
          typeof constraint === "object" &&
          isDimensionalConstraint(constraint) &&
          constraint.driven === true,
      )
      .map((constraint) => [
        constraint.id,
        solved
          ? measureDimension(profile, constraint as DimensionalConstraint)
          : null,
      ]),
  );
}

type Scalar = { value: number; gradient: Map<number, number> };
type Point = [Scalar, Scalar];
interface Equation extends Scalar {
  owner: string | null;
}
interface Evaluation {
  rows: Equation[];
  cost: number;
  maxResidual: number;
  singular: boolean;
}
interface Layout {
  pointIndices: Map<string, number>;
  radiusIndices: Map<string, number>;
  offsetIndices: Map<string, Map<"right" | "left", number>>;
  entities: Map<string, SketchEntity>;
  scale: number;
  offset: [number, number];
  initial: Float64Array;
  angularScales: Map<string, number>;
  tangentJoints: Map<string, [string, string]>;
}

const constant = (value: number): Scalar => ({ value, gradient: new Map() });
const variable = (value: number, index: number): Scalar => ({
  value,
  gradient: new Map([[index, 1]]),
});

// Keep zero derivatives in the map: they still identify equation dependencies.
// Components must not disconnect merely because a derivative happens to be zero.
function combine(
  a: Scalar,
  b: Scalar,
  fa: number,
  fb: number,
  value: number,
): Scalar {
  const gradient = new Map<number, number>();
  a.gradient.forEach((derivative, index) =>
    gradient.set(index, fa * derivative),
  );
  b.gradient.forEach((derivative, index) =>
    gradient.set(index, (gradient.get(index) ?? 0) + fb * derivative),
  );
  return { value, gradient };
}
const add = (a: Scalar, b: Scalar) => combine(a, b, 1, 1, a.value + b.value);
const sub = (a: Scalar, b: Scalar) => combine(a, b, 1, -1, a.value - b.value);
const mul = (a: Scalar, b: Scalar) =>
  combine(a, b, b.value, a.value, a.value * b.value);
const div = (a: Scalar, b: Scalar) =>
  combine(a, b, 1 / b.value, -a.value / (b.value * b.value), a.value / b.value);
const times = (a: Scalar, factor: number) =>
  combine(a, constant(0), factor, 0, a.value * factor);
const difference = (a: Point, b: Point): Point => [
  sub(a[0], b[0]),
  sub(a[1], b[1]),
];
const dot = (a: Point, b: Point) => add(mul(a[0], b[0]), mul(a[1], b[1]));
const cross = (a: Point, b: Point) => sub(mul(a[0], b[1]), mul(a[1], b[0]));
function angleBetween(a: Point, b: Point): Scalar {
  const y = cross(a, b),
    x = dot(a, b);
  const denominator = x.value * x.value + y.value * y.value;
  return combine(
    y,
    x,
    x.value / denominator,
    -y.value / denominator,
    Math.atan2(y.value, x.value),
  );
}
function magnitude(vector: Point): Scalar {
  const value = Math.hypot(vector[0].value, vector[1].value);
  return value > 0
    ? combine(
        vector[0],
        vector[1],
        vector[0].value / value,
        vector[1].value / value,
        value,
      )
    : combine(vector[0], vector[1], 0, 0, 0);
}

function makeLayout(profile: EntityProfile): Layout {
  const points = new Map(profile.points.map((point) => [point.id, point]));
  const rawPoint = (id: string) =>
    id === "origin" ? { x: 0, y: 0 } : points.get(id)!;
  const sizes: number[] = [];
  const rawLength = (entity: SketchEntity): number => {
    if (entity.type === "circle") return entity.radius;
    const a = rawPoint(entity.type === "arc" ? entity.center : entity.start);
    const b = rawPoint(entity.end);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  profile.entities.forEach((entity) => sizes.push(rawLength(entity)));
  profile.constraints.forEach((constraint) => {
    if (
      isDimensionalConstraint(constraint) &&
      !constraint.driven &&
      constraint.type !== "angle"
    )
      sizes.push(Math.abs(constraint.value));
  });
  const positive = sizes
    .filter((size) => size >= MIN_GEOMETRY && Number.isFinite(size))
    .sort((a, b) => a - b);
  const scale = Math.max(
    0.01,
    Math.min(100_000, positive[Math.floor(positive.length / 2)] ?? 1),
  );
  const count = profile.points.length || 1;
  const offset: [number, number] = [
    profile.points.reduce((sum, point) => sum + point.x / count, 0),
    profile.points.reduce((sum, point) => sum + point.y / count, 0),
  ];
  const pointIndices = new Map<string, number>();
  const radiusIndices = new Map<string, number>();
  const values: number[] = [];
  profile.points.forEach((point) => {
    pointIndices.set(point.id, values.length);
    values.push((point.x - offset[0]) / scale, (point.y - offset[1]) / scale);
  });
  profile.entities.forEach((entity) => {
    if (entity.type === "circle") {
      radiusIndices.set(entity.id, values.length);
      values.push(entity.radius / scale);
    }
  });
  const offsetIndices = new Map<string, Map<"right" | "left", number>>();
  for (const relation of profile.constraints) if (relation.type === "offset") {
    const sides = new Map<"right" | "left", number>();
    for (const image of relation.images) { sides.set(image.side, values.length); values.push(image.distance / scale); }
    offsetIndices.set(relation.id, sides);
  }
  const entities = new Map(
    profile.entities.map((entity) => [entity.id, entity]),
  );
  const angularScales = new Map<string, number>();
  profile.constraints.forEach((constraint) => {
    if (isDimensionalConstraint(constraint) && constraint.driven) return;
    if (
      constraint.type === "parallel" ||
      constraint.type === "perpendicular" ||
      constraint.type === "angle" ||
      constraint.type === "tangent"
    ) {
      angularScales.set(
        constraint.id,
        Math.max(
          0.01,
          Math.min(
            rawLength(entities.get(constraint.a)!),
            rawLength(entities.get(constraint.b)!),
          ),
        ) / scale,
      );
    }
  });
  // A declared common endpoint changes the regular equation for tangency. The
  // distance equation has a double root there and would undercount its rank.
  // Only topology / explicit coincidence establishes contact, never proximity.
  const parents = new Map<string, string>(
    ["origin", ...points.keys()].map((id) => [id, id]),
  );
  const root = (id: string): string => {
    while (parents.get(id) !== id) {
      parents.set(id, parents.get(parents.get(id)!)!);
      id = parents.get(id)!;
    }
    return id;
  };
  profile.constraints.forEach((constraint) => {
    if (constraint.type === "coincident")
      parents.set(root(constraint.b), root(constraint.a));
  });
  const tangentJoints = new Map<string, [string, string]>();
  const endpoints = (entity: SketchEntity): string[] =>
    entity.type === "circle" ? [] : [entity.start, entity.end];
  profile.constraints.forEach((constraint) => {
    if (constraint.type !== "tangent") return;
    const a = entities.get(constraint.a)!,
      b = entities.get(constraint.b)!;
    for (const first of endpoints(a))
      for (const second of endpoints(b)) {
        if (!tangentJoints.has(constraint.id) && root(first) === root(second))
          tangentJoints.set(constraint.id, [first, second]);
      }
    if (
      a.type === "line" &&
      b.type === "arc" &&
      !tangentJoints.has(constraint.id)
    ) {
      for (const relation of profile.constraints) {
        if (relation.type !== "pointOnLine" || relation.entityId !== a.id)
          continue;
        const endpoint = endpoints(b).find(
          (id) => root(id) === root(relation.pointId),
        );
        if (endpoint) {
          tangentJoints.set(constraint.id, [relation.pointId, endpoint]);
          break;
        }
      }
    }
  });
  return {
    pointIndices,
    radiusIndices,
    offsetIndices,
    entities,
    scale,
    offset,
    initial: Float64Array.from(values),
    angularScales,
    tangentJoints,
  };
}

function pointAt(layout: Layout, values: Float64Array, id: string): Point {
  if (id === "origin")
    return [
      constant(-layout.offset[0] / layout.scale),
      constant(-layout.offset[1] / layout.scale),
    ];
  const index = layout.pointIndices.get(id)!;
  return [
    variable(values[index], index),
    variable(values[index + 1], index + 1),
  ];
}

function evaluate(
  profile: EntityProfile,
  layout: Layout,
  values: Float64Array,
): Evaluation {
  const rows: Equation[] = [];
  let singular = false;
  const point = (id: string) => pointAt(layout, values, id);
  const line = (id: string): Point => {
    const entity = layout.entities.get(id) as Extract<
      SketchEntity,
      { type: "line" }
    >;
    return difference(point(entity.end), point(entity.start));
  };
  const size = (id: string): Scalar => {
    const entity = layout.entities.get(id)!;
    if (entity.type === "circle") {
      const index = layout.radiusIndices.get(id)!;
      return variable(values[index], index);
    }
    if (entity.type === "line") return magnitude(line(id));
    return magnitude(difference(point(entity.start), point(entity.center)));
  };
  const push = (owner: string | null, value: Scalar) =>
    rows.push({ owner, ...value });
  const pushAngle = (owner: string, a: Point, b: Point, target: number) => {
    if (magnitude(a).value <= 0 || magnitude(b).value <= 0) {
      singular = true;
      return;
    }
    const angular = angleBetween(a, b);
    angular.value -= target;
    angular.value -= Math.round(angular.value / (2 * Math.PI)) * 2 * Math.PI;
    push(owner, times(angular, layout.angularScales.get(owner)!));
  };
  // An arc stores two endpoints and a centre: equal radii are intrinsic, even
  // without a user constraint. They participate in rank and DOF calculations.
  profile.entities.forEach((entity) => {
    if (entity.type === "arc")
      push(
        null,
        sub(
          size(entity.id),
          magnitude(difference(point(entity.end), point(entity.center))),
        ),
      );
  });
  for (const constraint of profile.constraints) {
    if (isDimensionalConstraint(constraint) && constraint.driven) continue;
    const id = constraint.id;
    switch (constraint.type) {
      case "fix": {
        const p = point(constraint.pointId);
        push(
          id,
          sub(p[0], constant((constraint.x - layout.offset[0]) / layout.scale)),
        );
        push(
          id,
          sub(p[1], constant((constraint.y - layout.offset[1]) / layout.scale)),
        );
        break;
      }
      case "coincident": {
        const delta = difference(point(constraint.b), point(constraint.a));
        push(id, delta[0]);
        push(id, delta[1]);
        break;
      }
      case "symmetric": {
        const axis = layout.entities.get(constraint.axisId) as Extract<
          SketchEntity,
          { type: "line" }
        >;
        const direction = line(axis.id);
        const length = magnitude(direction);
        if (length.value <= 0) {
          singular = true;
          break;
        }
        const a = point(constraint.a), b = point(constraint.b);
        const midpoint: Point = [
          times(add(a[0], b[0]), 0.5),
          times(add(a[1], b[1]), 0.5),
        ];
        // Reflection has a perpendicular connecting segment and an on-axis
        // midpoint. Signed residuals exclude coincident off-axis solutions.
        // Normalizing keeps both equations in length units, independent of
        // the finite axis length and its endpoint storage direction.
        push(id, div(dot(direction, difference(b, a)), length));
        push(id, div(cross(direction, difference(midpoint, point(axis.start))), length));
        break;
      }
      case "mirrorArcDirection":
        // A discrete source-owned flag is propagated before continuous solving.
        break;
      case "offsetDistance": {
        const index = layout.offsetIndices.get(constraint.offsetId)!.get(constraint.side)!;
        push(id, sub(variable(values[index], index), constant(constraint.value / layout.scale)));
        break;
      }
      case "offset": {
        const endpoint = (entity: SketchEntity, reversed: boolean, end: 0 | 1): string => {
          if (entity.type === "circle") throw new Error("Un círculo completo no tiene extremos.");
          return (end === 0) !== reversed ? entity.start : entity.end;
        };
        const station = (source: SketchEntity, targetPoint: string, sourcePoint: string, reversed: boolean) => {
          if (source.type === "circle") return;
          if (source.type === "line") {
            const direction = line(source.id), length = magnitude(direction);
            if (length.value <= 0) { singular = true; return; }
            push(id, div(dot(direction, difference(point(targetPoint), point(sourcePoint))), length));
          } else {
            const radial = difference(point(sourcePoint), point(source.center)), imageRadial = difference(point(targetPoint), point(source.center));
            push(id, div(cross(radial, imageRadial), magnitude(radial)));
          }
          void reversed;
        };
        const centers = new Set<string>();
        for (const image of constraint.images) {
          const index = layout.offsetIndices.get(id)!.get(image.side)!, distance = variable(values[index], index), side = image.side === "right" ? 1 : -1;
          constraint.sources.forEach((reference, i) => {
            const source = layout.entities.get(reference.entityId)!, target = layout.entities.get(image.entityIds[i])!;
            if (source.type === "line" && target.type === "line") {
              const direction = line(source.id).map(coordinate => times(coordinate, reference.reversed ? -1 : 1)) as Point, length = magnitude(direction);
              if (length.value <= 0) { singular = true; return; }
              for (const targetPoint of [target.start, target.end]) push(id, add(div(cross(direction, difference(point(targetPoint), point(source.start))), length), times(distance, side)));
            } else if (source.type !== "line" && target.type !== "line") {
              const centerKey = `${source.center}\u0000${target.center}`;
              if (!centers.has(centerKey)) {
                centers.add(centerKey); const delta = difference(point(target.center), point(source.center)); push(id, delta[0]); push(id, delta[1]);
              }
              const radialSign = source.type === "arc" && (source.clockwise !== reference.reversed) ? -1 : 1;
              push(id, sub(sub(size(target.id), size(source.id)), times(distance, side * radialSign)));
            }
          });
          image.joins.forEach((join, i) => {
            if (join.kind !== "continuation") return;
            const reference = constraint.sources[i], source = layout.entities.get(reference.entityId)!, target = layout.entities.get(image.entityIds[i])!;
            station(source, endpoint(target, reference.reversed, 1), endpoint(source, reference.reversed, 1), reference.reversed);
          });
          if (constraint.cap !== "none" || !constraint.closed && image.lineEndpointMode === "aligned") for (const end of [0, 1] as const) {
            const i = end === 0 ? 0 : constraint.sources.length - 1, reference = constraint.sources[i], source = layout.entities.get(reference.entityId)!, target = layout.entities.get(image.entityIds[i])!;
            if (constraint.cap === "none" && source.type !== "line") continue;
            station(source, endpoint(target, reference.reversed, end), endpoint(source, reference.reversed, end), reference.reversed);
          }
        }
        if (constraint.cap === "arc") constraint.capEntityIds.forEach((capId, end) => {
          const cap = layout.entities.get(capId) as Extract<SketchEntity, { type: "arc" }>;
          let center: Point;
          if (constraint.images.length === 2) {
            const i = end === 0 ? 0 : constraint.sources.length - 1, reference = constraint.sources[i], source = layout.entities.get(reference.entityId)!;
            center = point(endpoint(source, reference.reversed, end as 0 | 1));
          } else center = [times(add(point(cap.start)[0], point(cap.end)[0]), .5), times(add(point(cap.start)[1], point(cap.end)[1]), .5)];
          const delta = difference(point(cap.center), center); push(id, delta[0]); push(id, delta[1]);
        });
        break;
      }
      case "horizontal":
        push(id, line(constraint.entityId)[1]);
        break;
      case "vertical":
        push(id, line(constraint.entityId)[0]);
        break;
      case "parallel":
      case "perpendicular": {
        const a = line(constraint.a),
          b = line(constraint.b);
        const lengths = mul(magnitude(a), magnitude(b));
        if (lengths.value <= 0) {
          singular = true;
          break;
        }
        // sin/cos residuals have a zero derivative exactly 90 degrees from the
        // target, falsely making a perfectly solvable relation stationary.
        // A locally wrapped angle has a useful derivative there, with a
        // deterministic nearest branch. Parallel and antiparallel are equal.
        const angular = angleBetween(a, b);
        const target = constraint.type === "parallel" ? 0 : Math.PI / 2;
        angular.value -= target;
        angular.value -= Math.round(angular.value / Math.PI) * Math.PI;
        push(id, times(angular, layout.angularScales.get(id)!));
        break;
      }
      case "equal":
        push(id, sub(size(constraint.a), size(constraint.b)));
        break;
      case "angle": {
        const a = line(constraint.a).map((value) =>
          times(value, constraint.reversedA ? -1 : 1),
        ) as Point;
        const b = line(constraint.b).map((value) =>
          times(value, constraint.reversedB ? -1 : 1),
        ) as Point;
        pushAngle(
          id,
          a,
          b,
          ((constraint.value * Math.PI) / 180) *
            (constraint.clockwise ? -1 : 1),
        );
        break;
      }
      case "tangent": {
        const a = layout.entities.get(constraint.a)!,
          b = layout.entities.get(constraint.b)!;
        const joint = layout.tangentJoints.get(id);
        if (a.type === "line" && b.type !== "line") {
          const direction = line(a.id),
            radius = size(b.id);
          if (joint) {
            const radial = difference(point(joint[1]), point(b.center));
            pushAngle(
              id,
              direction,
              radial,
              constraint.branch === "left" ? -Math.PI / 2 : Math.PI / 2,
            );
          } else {
            const length = magnitude(direction);
            if (length.value <= 0) {
              singular = true;
              break;
            }
            const distance = div(
              cross(direction, difference(point(b.center), point(a.start))),
              length,
            );
            push(
              id,
              sub(
                distance,
                times(radius, constraint.branch === "left" ? 1 : -1),
              ),
            );
          }
        } else if (a.type !== "line" && b.type !== "line") {
          if (joint) {
            pushAngle(
              id,
              difference(point(joint[0]), point(a.center)),
              difference(point(joint[1]), point(b.center)),
              constraint.branch === "external" ? Math.PI : 0,
            );
          } else {
            const distance = magnitude(
              difference(point(b.center), point(a.center)),
            );
            if (distance.value <= 0) {
              singular = true;
              break;
            }
            const target =
              constraint.branch === "external"
                ? add(size(a.id), size(b.id))
                : constraint.branch === "aContainsB"
                  ? sub(size(a.id), size(b.id))
                  : sub(size(b.id), size(a.id));
            push(id, sub(distance, target));
          }
        }
        break;
      }
      case "pointOnLine": {
        const entity = layout.entities.get(constraint.entityId) as Extract<
          SketchEntity,
          { type: "line" }
        >;
        const direction = line(entity.id);
        const length = magnitude(direction);
        if (length.value <= 0) {
          singular = true;
          break;
        }
        push(
          id,
          div(
            cross(
              direction,
              difference(point(constraint.pointId), point(entity.start)),
            ),
            length,
          ),
        );
        break;
      }
      case "pointOnCircle": {
        const entity = layout.entities.get(constraint.entityId) as Exclude<
          SketchEntity,
          { type: "line" }
        >;
        const distance = magnitude(
          difference(point(constraint.pointId), point(entity.center)),
        );
        if (distance.value <= 0) {
          singular = true;
          break;
        }
        push(id, sub(distance, size(entity.id)));
        break;
      }
      case "distance":
      case "distanceX":
      case "distanceY": {
        const delta = difference(point(constraint.b), point(constraint.a));
        const measure =
          constraint.type === "distance"
            ? magnitude(delta)
            : delta[constraint.type === "distanceX" ? 0 : 1];
        if (
          constraint.type === "distance" &&
          measure.value <= 0 &&
          constraint.value > 0
        )
          singular = true;
        push(id, sub(measure, constant(constraint.value / layout.scale)));
        break;
      }
      case "length":
      case "radius":
        push(
          id,
          sub(
            size(constraint.entityId),
            constant(constraint.value / layout.scale),
          ),
        );
        break;
    }
  }
  let cost = 0,
    maxResidual = 0;
  rows.forEach((row) => {
    cost += (row.value * row.value) / 2;
    maxResidual = Math.max(maxResidual, Math.abs(row.value) * layout.scale);
    if (
      !Number.isFinite(row.value) ||
      [...row.gradient.values()].some((value) => !Number.isFinite(value))
    )
      singular = true;
  });
  return { rows, cost, maxResidual, singular };
}

function geometryError(
  profile: EntityProfile,
  layout: Layout,
  values: Float64Array,
  enforceTangentBranch = true,
): string | null {
  const point = (id: string) =>
    pointAt(layout, values, id).map(
      (coordinate) => coordinate.value * layout.scale,
    );
  for (const [id, index] of layout.pointIndices) {
    const x = values[index] * layout.scale + layout.offset[0];
    const y = values[index + 1] * layout.scale + layout.offset[1];
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.max(Math.abs(x), Math.abs(y)) > SKETCH_LIMITS.maxCoordinate
    ) {
      return `El punto ${id} sale del intervalo de coordenadas admitido.`;
    }
  }
  const distance = (a: string, b: string) => {
    const p = point(a),
      q = point(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  };
  for (const entity of profile.entities) {
    if (
      entity.type === "line" &&
      distance(entity.start, entity.end) < MIN_GEOMETRY
    )
      return `La línea ${entity.id} tiene longitud nula o demasiado pequeña.`;
    if (entity.type === "circle") {
      const radius =
        values[layout.radiusIndices.get(entity.id)!] * layout.scale;
      if (
        !Number.isFinite(radius) ||
        radius < SKETCH_LIMITS.minDimension - SKETCH_SOLVER_TOLERANCE ||
        radius > SKETCH_LIMITS.maxDimension
      )
        return `El círculo ${entity.id} tiene un radio fuera del intervalo admitido.`;
    }
    if (entity.type === "arc") {
      if (
        distance(entity.center, entity.start) < MIN_GEOMETRY ||
        distance(entity.center, entity.end) < MIN_GEOMETRY
      )
        return `El arco ${entity.id} tiene radio nulo o demasiado pequeño.`;
      if (distance(entity.start, entity.end) < MIN_GEOMETRY)
        return `El arco ${entity.id} tiene extremos coincidentes; usa un círculo completo.`;
    }
  }
  const radius = (entity: SketchEntity): number =>
    entity.type === "circle"
      ? values[layout.radiusIndices.get(entity.id)!] * layout.scale
      : entity.type === "arc"
        ? distance(entity.center, entity.start)
        : 0;
  for (const constraint of profile.constraints) {
    if (constraint.type === "offset") {
      for (const index of layout.offsetIndices.get(constraint.id)!.values()) {
        const distance = values[index] * layout.scale;
        if (!Number.isFinite(distance) || distance < SKETCH_LIMITS.minDimension - SKETCH_SOLVER_TOLERANCE || distance > SKETCH_LIMITS.maxDimension) return "La distancia equidistante sale del intervalo admitido.";
      }
      if (enforceTangentBranch) {
        const error = offsetGeometryError(outputProfile(profile, layout, values), constraint);
        if (error) return error;
      }
      continue;
    }
    if (constraint.type === "mirrorArcDirection") {
      const source = layout.entities.get(constraint.a) as Extract<SketchEntity, { type: "arc" }>;
      const image = layout.entities.get(constraint.b) as Extract<SketchEntity, { type: "arc" }>;
      if (source.clockwise === image.clockwise)
        return `El sentido del arco ${image.id} no corresponde a su fuente reflejada.`;
      continue;
    }
    if (
      !enforceTangentBranch ||
      constraint.type !== "tangent" ||
      !["aContainsB", "bContainsA"].includes(constraint.branch)
    )
      continue;
    const a = layout.entities.get(constraint.a)!,
      b = layout.entities.get(constraint.b)!;
    const gap =
      constraint.branch === "aContainsB"
        ? radius(a) - radius(b)
        : radius(b) - radius(a);
    if (gap < MIN_GEOMETRY)
      return `La tangencia interna ${constraint.id} requiere radios distintos y conservar el círculo contenedor seleccionado.`;
  }
  return null;
}

function connectedComponents(
  rows: Equation[],
  variableCount: number,
): number[][] {
  const parent = Array.from({ length: variableCount }, (_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  rows.forEach((row) => {
    const indices = [...row.gradient.keys()];
    for (let index = 1; index < indices.length; index++)
      parent[find(indices[index])] = find(indices[0]);
  });
  const groups = new Map<number, number[]>();
  for (let index = 0; index < variableCount; index++) {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(index);
    groups.set(root, group);
  }
  return [...groups.values()];
}

function normalSystem(
  rows: Equation[],
  count: number,
): { matrix: Float64Array; gradient: Float64Array } {
  const matrix = new Float64Array(count * count);
  const gradient = new Float64Array(count);
  rows.forEach((row) => {
    for (const [i, di] of row.gradient) {
      gradient[i] += di * row.value;
      if (di !== 0)
        for (const [j, dj] of row.gradient) matrix[i * count + j] += di * dj;
    }
  });
  return { matrix, gradient };
}

/** Cholesky on each independent component of JᵀJ + λI. */
function dampedStep(
  matrix: Float64Array,
  gradient: Float64Array,
  components: number[][],
  lambda: number,
): Float64Array | null {
  const count = gradient.length;
  const step = new Float64Array(count);
  for (const component of components) {
    if (component.every((index) => gradient[index] === 0)) continue;
    const size = component.length;
    const lower = new Float64Array(size * size);
    const y = new Float64Array(size);
    const x = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j <= i; j++) {
        let value =
          matrix[component[i] * count + component[j]] + (i === j ? lambda : 0);
        for (let k = 0; k < j; k++)
          value -= lower[i * size + k] * lower[j * size + k];
        if (i === j) {
          if (!Number.isFinite(value) || value <= 0) return null;
          lower[i * size + j] = Math.sqrt(value);
        } else lower[i * size + j] = value / lower[j * size + j];
      }
      let value = -gradient[component[i]];
      for (let j = 0; j < i; j++) value -= lower[i * size + j] * y[j];
      y[i] = value / lower[i * size + i];
    }
    for (let i = size - 1; i >= 0; i--) {
      let value = y[i];
      for (let j = i + 1; j < size; j++) value -= lower[j * size + i] * x[j];
      x[i] = value / lower[i * size + i];
      if (!Number.isFinite(x[i])) return null;
      step[component[i]] = x[i];
    }
  }
  return step;
}

/** Twice reorthogonalized row basis, independently within connected components. */
function rankAndRedundancy(
  rows: Equation[],
  components: number[][],
): { rank: number; redundant: string[]; uncertain: boolean } {
  const locations = new Map<number, [number, number]>();
  components.forEach((component, group) =>
    component.forEach((index, local) => locations.set(index, [group, local])),
  );
  const bases: Float64Array[][] = components.map(() => []);
  const gains = new Map<string, number>();
  let rank = 0,
    uncertain = false;
  rows.forEach((row) => {
    if (row.owner !== null && !gains.has(row.owner)) gains.set(row.owner, 0);
    const first = row.gradient.keys().next().value as number | undefined;
    if (first === undefined) return;
    const group = locations.get(first)![0];
    const vector = new Float64Array(components[group].length);
    row.gradient.forEach((value, index) => {
      vector[locations.get(index)![1]] = value;
    });
    let norm = Math.hypot(...vector);
    if (norm === 0) return;
    if (!Number.isFinite(norm)) {
      uncertain = true;
      return;
    }
    for (let index = 0; index < vector.length; index++) vector[index] /= norm;
    for (let pass = 0; pass < 2; pass++)
      for (const basis of bases[group]) {
        let projection = 0;
        for (let index = 0; index < vector.length; index++)
          projection += vector[index] * basis[index];
        for (let index = 0; index < vector.length; index++)
          vector[index] -= projection * basis[index];
      }
    norm = Math.hypot(...vector);
    // Borderline rank is not evidence of complete definition.
    if (norm > RANK_TOLERANCE / 10 && norm < RANK_TOLERANCE * 10)
      uncertain = true;
    if (norm <= RANK_TOLERANCE) return;
    for (let index = 0; index < vector.length; index++) vector[index] /= norm;
    bases[group].push(vector);
    rank++;
    if (row.owner !== null) gains.set(row.owner, gains.get(row.owner)! + 1);
  });
  return {
    rank,
    redundant: [...gains].filter(([, gain]) => gain === 0).map(([id]) => id),
    uncertain,
  };
}

function outputProfile(
  profile: EntityProfile,
  layout: Layout,
  values: Float64Array,
): EntityProfile {
  const result = structuredClone(profile);
  result.points.forEach((point) => {
    const index = layout.pointIndices.get(point.id)!;
    point.x = values[index] * layout.scale + layout.offset[0];
    point.y = values[index + 1] * layout.scale + layout.offset[1];
    if (Math.abs(point.x) < 1e-12) point.x = 0;
    if (Math.abs(point.y) < 1e-12) point.y = 0;
  });
  result.entities.forEach((entity) => {
    if (entity.type === "circle") {
      entity.radius =
        values[layout.radiusIndices.get(entity.id)!] * layout.scale;
      if (
        entity.radius < SKETCH_LIMITS.minDimension &&
        entity.radius >= SKETCH_LIMITS.minDimension - SKETCH_SOLVER_TOLERANCE
      )
        entity.radius = SKETCH_LIMITS.minDimension;
    }
  });
  for (const constraint of result.constraints) if (constraint.type === "offset") for (const image of constraint.images) {
    image.distance = values[layout.offsetIndices.get(constraint.id)!.get(image.side)!] * layout.scale;
    if (image.distance < SKETCH_LIMITS.minDimension && image.distance >= SKETCH_LIMITS.minDimension - SKETCH_SOLVER_TOLERANCE) image.distance = SKETCH_LIMITS.minDimension;
  }
  return result;
}

function fallbackProfile(input: EntityProfile): EntityProfile {
  try {
    return structuredClone(input);
  } catch {
    return { kind: "entities", points: [], entities: [], constraints: [] };
  }
}

function preservesArcSteps(
  profile: EntityProfile,
  layout: Layout,
  before: Float64Array,
  after: Float64Array,
): boolean {
  const point = (values: Float64Array, id: string): [number, number] => {
    if (id === "origin")
      return [-layout.offset[0] / layout.scale, -layout.offset[1] / layout.scale];
    const index = layout.pointIndices.get(id)!;
    return [values[index], values[index + 1]];
  };
  return profile.entities.every(entity => {
    if (entity.type !== "arc") return true;
    const radials = (values: Float64Array) => {
      const center = point(values, entity.center);
      const radial = (id: string): [number, number] => {
        const endpoint = point(values, id);
        return [endpoint[0] - center[0], endpoint[1] - center[1]];
      };
      return { start: radial(entity.start), end: radial(entity.end) };
    };
    return arcStepPreservesWinding(
      radials(before), radials(after), MIN_GEOMETRY / layout.scale,
    );
  });
}

/**
 * Local 2D solver with analytic derivatives,
 * damped least squares and numerical rank; no new runtime dependencies.
 * It preserves a nearby branch, not a globally optimal or unique solution.
 * Geometry/profile validity and closed-contour validity are separate concerns.
 * Failed solves preserve input geometry. Empty sketches are editable documents.
 */
export function solveSketch(
  input: EntityProfile,
  options: { maxIterations?: number } = {},
): SketchSolveResult {
  const started = performance.now();
  let profile: EntityProfile;
  const fail = (
    status: SketchSolveResult["status"],
    message: string,
    details: Partial<SketchSolveResult> = {},
  ): SketchSolveResult => ({
    profile: fallbackProfile(input),
    status,
    degreesOfFreedom: null,
    redundantConstraintIds: [],
    conflictingConstraintIds: [],
    drivenValues: drivenMeasurements(fallbackProfile(input), false),
    maxResidual: Infinity,
    iterations: 0,
    message,
    ...details,
  });
  try {
    profile = validateEntityProfile(input);
  } catch (error) {
    return fail(
      "invalid",
      error instanceof Error
        ? error.message
        : "El croquis no tiene una estructura válida.",
    );
  }
  const requestedIterations = options.maxIterations ?? 80;
  if (
    !Number.isInteger(requestedIterations) ||
    requestedIterations < 0 ||
    requestedIterations > 200
  )
    return fail(
      "invalid",
      "El máximo de iteraciones debe ser un entero entre 0 y 200.",
    );
  // validateEntityProfile returned a detached copy and checked directed
  // ownership. Apply dependencies before any winding/geometry guard so an
  // ordinary source direction edit can also update every reflected descendant.
  const arcEntities = new Map(profile.entities.map(entity => [entity.id, entity]));
  for (const relation of profile.constraints) if (relation.type === "offset" && relation.cap === "arc") relation.capEntityIds.forEach((id, end) => {
    const cap = arcEntities.get(id) as Extract<SketchEntity, { type: "arc" }>;
    cap.clockwise = (relation.images[0].side === "right") === (end === 0);
  });
  for (const relation of orderedArcDirections(profile.constraints, profile.entities)) {
    const source = arcEntities.get(relation.sourceId) as Extract<SketchEntity, { type: "arc" }>;
    const image = arcEntities.get(relation.imageId) as Extract<SketchEntity, { type: "arc" }>;
    image.clockwise = relation.reflected ? !source.clockwise : source.clockwise;
  }
  const layout = makeLayout(profile);
  const refinementTolerance = profile.constraints.some(c => c.type === "symmetric" || c.type === "offset")
    ? SYMMETRY_REFINEMENT_TOLERANCE : SKETCH_SOLVER_TOLERANCE;
  let values = layout.initial.slice();
  // Stored geometry may still reflect the previous dimensions. In particular,
  // newly edited radii can repair equal/reversed internal-tangency radii. The
  // selected containing circle must hold for every accepted step and output,
  // but cannot be required of the stale starting geometry before solving.
  const invalid = geometryError(profile, layout, values, false);
  if (invalid) return fail("invalid", invalid);
  let current = evaluate(profile, layout, values);
  const components = connectedComponents(current.rows, values.length);
  let lambda = 1e-3;
  let iterations = 0;
  let stalled = false;
  let timedOut = false;
  let rejectedGeometry = false;
  while (
    current.maxResidual > refinementTolerance &&
    iterations < requestedIterations
  ) {
    if (performance.now() - started > TIME_LIMIT_MS) {
      timedOut = true;
      break;
    }
    if (current.singular) break;
    const { matrix, gradient } = normalSystem(current.rows, values.length);
    let accepted = false;
    for (let trial = 0; trial < 16; trial++) {
      if (performance.now() - started > TIME_LIMIT_MS) {
        timedOut = true;
        break;
      }
      const step = dampedStep(matrix, gradient, components, lambda);
      if (!step) {
        lambda *= 10;
        continue;
      }
      const candidate = values.map((value, index) => value + step[index]);
      if (
        geometryError(profile, layout, candidate) ||
        !preservesArcSteps(profile, layout, values, candidate)
      ) {
        rejectedGeometry = true;
        lambda *= 10;
        continue;
      }
      const next = evaluate(profile, layout, candidate);
      if (!next.singular && next.cost < current.cost) {
        values = candidate;
        current = next;
        lambda = Math.max(1e-12, lambda / 4);
        accepted = true;
        break;
      }
      lambda *= 10;
      if (!Number.isFinite(lambda) || lambda > 1e18) break;
    }
    iterations++;
    if (!accepted) {
      stalled = true;
      break;
    }
  }
  if (!current.singular && current.maxResidual <= SKETCH_SOLVER_TOLERANCE) {
    const solved = outputProfile(profile, layout, values);
    // Validate the returned representation, not just the working coordinates.
    try {
      validateEntityProfile(solved);
    } catch {
      return fail(
        "notConverged",
        "La solución sale del intervalo de valores que se puede guardar.",
        { iterations, maxResidual: current.maxResidual },
      );
    }
    const finalLayout = makeLayout(solved);
    const final = evaluate(solved, finalLayout, finalLayout.initial);
    if (
      final.singular ||
      final.maxResidual > SKETCH_SOLVER_TOLERANCE ||
      geometryError(solved, finalLayout, finalLayout.initial)
    ) {
      return fail(
        "notConverged",
        "La precisión de la solución no permite confirmar el croquis.",
        { iterations, maxResidual: final.maxResidual },
      );
    }
    const rank = rankAndRedundancy(current.rows, components);
    if (rank.uncertain)
      return fail(
        "notConverged",
        "El sistema está cerca de una singularidad; no se puede determinar su grado de definición con fiabilidad.",
        { iterations, maxResidual: current.maxResidual },
      );
    const degreesOfFreedom = values.length - rank.rank;
    const status =
      degreesOfFreedom === 0 && profile.entities.length > 0
        ? "fullyDefined"
        : "underdefined";
    const suffix = rank.redundant.length
      ? ` ${rank.redundant.length} restricción(es) redundante(s) compatibles.`
      : "";
    return {
      profile: solved,
      status,
      degreesOfFreedom,
      redundantConstraintIds: rank.redundant,
      conflictingConstraintIds: [],
      drivenValues: drivenMeasurements(solved, true),
      maxResidual: final.maxResidual,
      iterations,
      message:
        (profile.entities.length === 0
          ? "Croquis vacío o compuesto solo por puntos; puedes seguir dibujando."
          : status === "fullyDefined"
            ? "Croquis completamente definido."
            : `Croquis subdefinido: ${degreesOfFreedom} grado(s) de libertad local.`) +
        suffix,
    };
  }
  const residualIds = [
    ...new Set(
      current.rows
        .filter(
          (row) =>
            row.owner !== null &&
            Math.abs(row.value) * layout.scale > SKETCH_SOLVER_TOLERANCE,
        )
        .map((row) => row.owner!),
    ),
  ];
  const { gradient } = normalSystem(current.rows, values.length);
  const gradientMax = gradient.reduce(
    (maximum, value) => Math.max(maximum, Math.abs(value)),
    0,
  );
  const stationary =
    gradientMax <= Math.max(1e-10, (current.maxResidual / layout.scale) * 1e-7);
  if (
    !current.singular &&
    !timedOut &&
    (stalled || iterations < requestedIterations) &&
    stationary
  ) {
    return fail(
      "inconsistent",
      "No se pueden satisfacer simultáneamente las restricciones señaladas en esta solución próxima.",
      {
        iterations,
        maxResidual: current.maxResidual,
        conflictingConstraintIds: residualIds,
      },
    );
  }
  return fail(
    "notConverged",
    current.singular
      ? "El sistema contiene una configuración singular; separa los puntos o revisa las referencias."
      : timedOut
        ? "Se alcanzó el tiempo de cálculo admitido; simplifica el croquis o revisa las restricciones."
        : rejectedGeometry
          ? "Resolver estas restricciones colapsaría geometría o saldría de sus límites; revisa cotas y relaciones."
          : "No se alcanzó una solución con la precisión requerida dentro del límite de iteraciones.",
    {
      iterations,
      maxResidual: current.maxResidual,
      conflictingConstraintIds: residualIds,
    },
  );
}
