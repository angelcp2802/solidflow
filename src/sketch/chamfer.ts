import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
  SketchSelection,
} from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";

export type ChamferParameters =
  | { mode: "equal"; distance: number }
  | { mode: "distances"; distance1: number; distance2: number }
  | { mode: "angle"; distance: number; angle: number };

export interface ChamferPlan {
  changed: boolean;
  /** Ephemeral transaction guard; never serialized into the document. */
  sourceProfile: EntityProfile;
  profile: EntityProfile;
  message: string;
  affectedEntityIds: string[];
  chamferEntityId: string | null;
  createdEntityIds: string[];
  createdConstraintIds: string[];
  convertedConstraintIds: string[];
}

/** Endpoint proximity in mm; existing point identities are never merged. */
export const CHAMFER_TOLERANCE = 1e-7;
// Match the solver's minimum accepted line length, independently of hit tolerance.
const MIN_LINE_LENGTH = 1e-6;
type Line = Extract<SketchEntity, { type: "line" }>;
type NewConstraint<T = SketchConstraint> = T extends SketchConstraint
  ? Omit<T, "id">
  : never;
type Endpoint = "start" | "end";
type XY = { x: number; y: number };
type CornerLine = {
  entity: Line;
  endpoint: Endpoint;
  corner: SketchPoint;
  far: SketchPoint;
  length: number;
  direction: XY;
};
const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (a: XY, b: XY) => a.x * b.y - a.y * b.x;

function cornerLine(
  entity: Line,
  endpoint: Endpoint,
  points: Map<string, SketchPoint>,
): CornerLine {
  const corner = points.get(entity[endpoint])!;
  const far = points.get(entity[endpoint === "start" ? "end" : "start"])!;
  const length = distance(corner, far);
  if (length < MIN_LINE_LENGTH)
    throw new Error("No se pueden achaflanar líneas degeneradas.");
  return {
    entity,
    endpoint,
    corner,
    far,
    length,
    direction: {
      x: (far.x - corner.x) / length,
      y: (far.y - corner.y) / length,
    },
  };
}

function touches(point: XY, entity: Line, points: Map<string, SketchPoint>) {
  const start = points.get(entity.start)!;
  const end = points.get(entity.end)!;
  const length = distance(start, end);
  if (length <= CHAMFER_TOLERANCE)
    return distance(point, start) <= CHAMFER_TOLERANCE;
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / length ** 2;
  return (
    t >= -CHAMFER_TOLERANCE / length &&
    t <= 1 + CHAMFER_TOLERANCE / length &&
    Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length <=
      CHAMFER_TOLERANCE
  );
}

function selectCorner(profile: EntityProfile, selection: SketchSelection[]) {
  const points = new Map(profile.points.map((point) => [point.id, point]));
  points.set("origin", { id: "origin", x: 0, y: 0 });
  let lines: Line[];
  if (selection.length === 1 && selection[0].kind === "point") {
    const point = points.get(selection[0].id);
    if (!point) throw new Error("El vértice seleccionado no existe.");
    const incident = profile.entities.filter((entity) => {
      if (entity.type === "line") return touches(point, entity, points);
      return (
        entity.type === "arc" &&
        [entity.start, entity.end].some(
          (id) => distance(point, points.get(id)!) <= CHAMFER_TOLERANCE,
        )
      );
    });
    if (
      incident.length !== 2 ||
      incident.some((entity) => entity.type !== "line")
    )
      throw new Error(
        "Selecciona un vértice de dos líneas o elige las dos líneas de la esquina.",
      );
    lines = incident as Line[];
  } else if (
    selection.length === 2 &&
    selection.every((item) => item.kind === "entity") &&
    selection[0].id !== selection[1].id
  ) {
    lines = selection.map((item) => {
      const entity = profile.entities.find((entity) => entity.id === item.id);
      if (!entity || entity.type !== "line")
        throw new Error(
          "El chaflán requiere dos líneas; no admite arcos ni círculos.",
        );
      return entity;
    });
  } else {
    throw new Error(
      "Selecciona un vértice común o dos líneas distintas en orden D1 y D2.",
    );
  }
  const matches: [Endpoint, Endpoint][] = [];
  for (const a of ["start", "end"] as const)
    for (const b of ["start", "end"] as const)
      if (
        distance(points.get(lines[0][a])!, points.get(lines[1][b])!) <=
        CHAMFER_TOLERANCE
      )
        matches.push([a, b]);
  if (matches.length !== 1)
    throw new Error(
      "Las líneas deben tener una única esquina común en sus extremos.",
    );
  const [firstEndpoint, secondEndpoint] = matches[0];
  return [
    cornerLine(lines[0], firstEndpoint, points),
    cornerLine(lines[1], secondEndpoint, points),
  ] as const;
}

function dimension(value: number): number {
  if (
    !Number.isFinite(value) ||
    value < SKETCH_LIMITS.minDimension ||
    value > SKETCH_LIMITS.maxDimension
  )
    throw new Error(
      `Las distancias del chaflán deben estar entre ${SKETCH_LIMITS.minDimension} y ${SKETCH_LIMITS.maxDimension} mm.`,
    );
  return value;
}

function alreadyCoincident(
  profile: EntityProfile,
  a: string,
  b: string,
): boolean {
  const visited = new Set([a]);
  let previous = 0;
  while (visited.size !== previous) {
    previous = visited.size;
    for (const constraint of profile.constraints) {
      if (constraint.type !== "coincident") continue;
      if (visited.has(constraint.a)) visited.add(constraint.b);
      if (visited.has(constraint.b)) visited.add(constraint.a);
    }
  }
  return visited.has(b);
}

/**
 * Plan a chamfer on the displayed, already solved profile. The returned detached
 * profile is shared by preview and commit; no solver or random ID source runs.
 * Virtual corners and construction legs keep the original dimensions editable.
 * Callers solve after committing, including fresh driven measurements.
 */
export function planSketchChamfer(
  input: EntityProfile,
  selection: SketchSelection[],
  parameters: ChamferParameters,
): ChamferPlan {
  try {
    const profile = validateEntityProfile(input);
    const [first, second] = selectCorner(profile, selection);
    const turn = cross(first.direction, second.direction);
    if (Math.abs(turn) <= 1e-12)
      throw new Error(
        "Las líneas paralelas o colineales no forman una esquina achaflanable.",
      );
    const theta = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          first.direction.x * second.direction.x +
            first.direction.y * second.direction.y,
        ),
      ),
    );
    let d1: number, d2: number;
    if (parameters.mode === "equal") {
      d1 = d2 = dimension(parameters.distance);
    } else if (parameters.mode === "distances") {
      d1 = dimension(parameters.distance1);
      d2 = dimension(parameters.distance2);
    } else if (parameters.mode === "angle") {
      d1 = dimension(parameters.distance);
      const alpha = (parameters.angle * Math.PI) / 180;
      if (!Number.isFinite(alpha) || alpha <= 0 || alpha >= Math.PI - theta)
        throw new Error(
          "El ángulo debe ser positivo y menor que el suplemento del ángulo de la esquina.",
        );
      d2 = dimension((d1 * Math.sin(alpha)) / Math.sin(theta + alpha));
    } else {
      throw new Error("Modo de chaflán no válido.");
    }
    if (
      first.length - d1 < MIN_LINE_LENGTH ||
      second.length - d2 < MIN_LINE_LENGTH
    )
      throw new Error(
        "Las distancias del chaflán deben dejar un tramo positivo en ambas líneas.",
      );

    const ids = new Set([
      "origin",
      ...profile.points.map((item) => item.id),
      ...profile.entities.map((item) => item.id),
      ...profile.constraints.map((item) => item.id),
    ]);
    const uid = (kind: string): string => {
      let index = 1;
      while (ids.has(`chamfer-${kind}-${index}`)) index++;
      const id = `chamfer-${kind}-${index}`;
      ids.add(id);
      return id;
    };
    const newPoints = [first, second].map((line, index) => ({
      id: uid("point"),
      x: line.corner.x + line.direction.x * (index === 0 ? d1 : d2),
      y: line.corner.y + line.direction.y * (index === 0 ? d1 : d2),
    }));
    if (distance(newPoints[0], newPoints[1]) < MIN_LINE_LENGTH)
      throw new Error("El chaflán resultante no tiene longitud suficiente.");
    const convertedConstraintIds: string[] = [];
    profile.constraints = profile.constraints.map(
      (constraint): SketchConstraint => {
        const line = [first, second].find(
          (item) =>
            constraint.type === "length" &&
            constraint.entityId === item.entity.id,
        );
        if (!line || constraint.type !== "length" || constraint.driven)
          return constraint;
        const { entityId: _entityId, ...original } = constraint;
        convertedConstraintIds.push(constraint.id);
        return {
          ...original,
          type: "distance",
          a: line.entity.start,
          b: line.entity.end,
        };
      },
    );
    profile.points.push(...newPoints);
    const legs = [first, second].map((line, index): Line => ({
      id: uid("support"),
      type: "line",
      construction: true,
      start: line.corner.id,
      end: newPoints[index].id,
    }));
    first.entity[first.endpoint] = newPoints[0].id;
    second.entity[second.endpoint] = newPoints[1].id;
    const chamfer: Line = {
      id: uid("edge"),
      type: "line",
      construction: first.entity.construction && second.entity.construction,
      start: newPoints[0].id,
      end: newPoints[1].id,
    };
    profile.entities.push(...legs, chamfer);
    const createdConstraintIds: string[] = [];
    const add = (constraint: NewConstraint) => {
      const id = uid("constraint");
      profile.constraints.push({ ...constraint, id } as SketchConstraint);
      createdConstraintIds.push(id);
    };
    for (const line of [first, second]) {
      if (
        !profile.constraints.some(
          (constraint) =>
            constraint.type === "pointOnLine" &&
            constraint.pointId === line.corner.id &&
            constraint.entityId === line.entity.id,
        )
      )
        add({
          type: "pointOnLine",
          pointId: line.corner.id,
          entityId: line.entity.id,
        });
    }
    if (!alreadyCoincident(profile, first.corner.id, second.corner.id))
      add({ type: "coincident", a: first.corner.id, b: second.corner.id });
    add({ type: "length", entityId: legs[0].id, value: d1 });
    if (parameters.mode === "equal") {
      add({ type: "equal", a: legs[0].id, b: legs[1].id });
    } else if (parameters.mode === "distances") {
      add({ type: "length", entityId: legs[1].id, value: d2 });
    } else {
      add({
        type: "angle",
        a: first.entity.id,
        b: chamfer.id,
        value: parameters.angle,
        reversedA: first.endpoint === "start",
        reversedB: false,
        clockwise: turn > 0,
      });
    }
    return {
      changed: true,
      sourceProfile: input,
      profile: validateEntityProfile(profile),
      message:
        "Chaflán creado; las cotas originales conservan sus extremos virtuales.",
      affectedEntityIds: [first.entity.id, second.entity.id],
      chamferEntityId: chamfer.id,
      createdEntityIds: [...legs.map((line) => line.id), chamfer.id],
      createdConstraintIds,
      convertedConstraintIds,
    };
  } catch (error) {
    return {
      changed: false,
      sourceProfile: input,
      profile: input,
      message:
        error instanceof Error
          ? error.message
          : "No se puede crear el chaflán.",
      affectedEntityIds: [],
      chamferEntityId: null,
      createdEntityIds: [],
      createdConstraintIds: [],
      convertedConstraintIds: [],
    };
  }
}
