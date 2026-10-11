import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
  SketchSelection,
  TangentBranch,
} from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";

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
  candidates: { index: number; label: string }[];
  selectedSolutionIndex: number | null;
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
type Corner = { point: XY | null; code: number; ends: [End, End] };
type Candidate = {
  index: number;
  label: string;
  center: XY;
  contacts: [XY, XY];
  clockwise: boolean;
  sweep: number;
  corner: Corner;
  branches: [TangentBranch, TangentBranch];
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
const constraintRefs = (c: SketchConstraint): string[] =>
  "a" in c
    ? [c.a, c.b]
    : "pointId" in c
      ? [c.pointId, ...("entityId" in c ? [c.entityId] : [])]
      : [c.entityId];

function curve(entity: SourceEntity, points: Map<string, SketchPoint>): Curve {
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
    Math.abs(distance(center, end) - radius) > FILLET_TOLERANCE ||
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
        shared.push({ point: cs[0][a], code: 0, ends: [a, b] });
    }
  if (shared.length) return shared;
  if (selectedPoint)
    throw new Error(
      "El punto seleccionado no es un extremo común de las dos entidades.",
    );
  const hits = intersections(support(cs[0]), support(cs[1])).filter((hit) =>
    cs.every((c) => c.entity.type === "line" || contains(c, hit.point)),
  );
  if (!hits.length && cs.every((c) => c.entity.type === "line"))
    throw new Error(
      "Las líneas paralelas o colineales no definen una esquina única.",
    );
  const options = (c: Curve, p: XY): End[] => {
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
        corners.push({ point: hit.point, code: hit.side, ends: [a, b] });
  if (!hits.length)
    for (const a of ends)
      for (const b of ends)
        corners.push({ point: null, code: 2, ends: [a, b] });
  return corners;
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
    if (!contains(c, p)) return false;
    if (corner) {
      const v = parameter(c, corner);
      if (
        endpoint === "start"
          ? t < v - FILLET_TOLERANCE / c.radius
          : t > v + FILLET_TOLERANCE / c.radius
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

function candidates(
  cs: [Curve, Curve],
  corners: Corner[],
  r: number,
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
                  SKETCH_LIMITS.maxCoordinate,
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
          const index =
            (((((corner.ends[0] === "end" ? 1 : 0) * 2 +
              (corner.ends[1] === "end" ? 1 : 0)) *
              3 +
              corner.code) *
              3 +
              a.code) *
              3 +
              b.code) *
              2 +
            hit.side;
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
          result.push({
            index,
            label: `Primera: ${endLabels[corner.ends[0]]}, ${branchLabels[a.branch]} · Segunda: ${endLabels[corner.ends[1]]}, ${branchLabels[b.branch]} · ${clockwise ? "horario" : "antihorario"}${sweep > Math.PI ? " · arco mayor" : ""}`,
            center: hit.point,
            contacts,
            clockwise,
            sweep,
            corner,
            branches: [a.branch, b.branch],
          });
        }
      }
  return result.sort((a, b) => a.index - b.index);
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
 * Pure plan on the displayed solved profile. Preview and commit share this
 * detached profile; IDs and branch slots are deterministic. A caller must solve
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
        ? (possible.find((candidate) => candidate.sweep <= Math.PI) ??
          possible[0])
        : possible.find((c) => c.index === parameters.solutionIndex);
    if (!chosen)
      throw new Error(
        parameters.solutionIndex === undefined
          ? "No existe un redondeo tangente con ese radio y los tramos disponibles."
          : "La rama seleccionada ya no existe para ese radio; elige otra solución explícitamente.",
      );
    const ids = new Set([
      "origin",
      ...profile.points.map((p) => p.id),
      ...profile.entities.map((e) => e.id),
      ...profile.constraints.map((c) => c.id),
    ]);
    const uid = (kind: string) => {
      let index = 1;
      while (ids.has(`fillet-${kind}-${index}`)) index++;
      const id = `fillet-${kind}-${index}`;
      ids.add(id);
      return id;
    };
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
    if (parameters.cornerPolicy === "keep") {
      profile.constraints = profile.constraints.map((c) => {
        const source = cs.find(
          (source) => c.type === "length" && c.entityId === source.entity.id,
        );
        if (!source || c.type !== "length" || c.driven) return c;
        const { entityId: _entityId, ...original } = c;
        convertedConstraintIds.push(c.id);
        return {
          ...original,
          type: "distance",
          a: source.entity.start,
          b: source.entity.end,
        };
      });
    }
    cs.forEach((c, i) => {
      c.entity[chosen.corner.ends[i]] = contacts[i].id;
    });
    profile.points.push(center, ...contacts);
    profile.entities.push(fillet);
    let sharedCornerKept = false;
    if (parameters.cornerPolicy === "delete") {
      const sourcePoints = new Set(
        cs.flatMap((c) => [
          c.start.id,
          c.end.id,
          ...(c.center ? [c.center.id] : []),
        ]),
      );
      const externalPoints = new Set(
        profile.entities
          .filter((e) => !sourceIds.has(e.id) && e.id !== fillet.id)
          .flatMap(pointRefs),
      );
      const corners = new Set(
        oldCorners.filter((id) => id !== "origin" && !externalPoints.has(id)),
      );
      profile.constraints = profile.constraints.filter((c) => {
        const refs = constraintRefs(c),
          touchedCorner = refs.some((id) => corners.has(id));
        const exclusive =
          touchedCorner &&
          refs.every(
            (id) =>
              sourceIds.has(id) ||
              (sourcePoints.has(id) &&
                id !== "origin" &&
                !externalPoints.has(id)),
          );
        const lengthTarget =
          c.type === "length" && !c.driven && sourceIds.has(c.entityId);
        if (exclusive || lengthTarget) {
          deletedConstraintIds.push(c.id);
          return false;
        }
        return true;
      });
      const used = new Set([
        ...profile.entities.flatMap(pointRefs),
        ...profile.constraints.flatMap(constraintRefs),
      ]);
      profile.points = profile.points.filter(
        (p) => !corners.has(p.id) || used.has(p.id),
      );
      sharedCornerKept = oldCorners.some(
        (id) => id === "origin" || externalPoints.has(id) || used.has(id),
      );
    } else {
      cs.forEach((c, i) => {
        const type = c.entity.type === "line" ? "pointOnLine" : "pointOnCircle";
        if (
          !profile.constraints.some(
            (relation) =>
              relation.type === type &&
              relation.pointId === oldCorners[i] &&
              relation.entityId === c.entity.id,
          )
        )
          put({ type, pointId: oldCorners[i], entityId: c.entity.id });
      });
      if (
        chosen.corner.point &&
        distance(cs[0][chosen.corner.ends[0]], chosen.corner.point) <=
          FILLET_TOLERANCE &&
        distance(cs[1][chosen.corner.ends[1]], chosen.corner.point) <=
          FILLET_TOLERANCE &&
        oldCorners[0] !== oldCorners[1]
      ) {
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
      candidates: choices,
      selectedSolutionIndex: null,
    };
  }
}
