import type {
  EntityProfile,
  DimensionalConstraint,
  LegacyProfile,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
  SketchSelection,
  TangentBranch,
} from "./types";
import { validateEntityProfile } from "./validation";
import { constraintReferences } from "./references";
export { constraintReferences } from "./references";
import {
  isDimensionalConstraint,
  measureDimension,
  solveSketch,
} from "./solver";
export { isDimensionalConstraint, measureDimension } from "./solver";

export const emptySketch = (): EntityProfile => ({
  kind: "entities",
  points: [],
  entities: [],
  constraints: [],
});
export const sketchPoint = (profile: EntityProfile, id: string): SketchPoint =>
  id === "origin"
    ? { id, x: 0, y: 0 }
    : profile.points.find((point) => point.id === id)!;
export const entityPoints = (entity: SketchEntity): string[] =>
  entity.type === "line"
    ? [entity.start, entity.end]
    : entity.type === "circle"
      ? [entity.center]
      : [entity.center, entity.start, entity.end];
const uid = () => crypto.randomUUID();
export function addPoint(
  profile: EntityProfile,
  x: number,
  y: number,
  snapId?: string,
): string {
  if (
    snapId &&
    (snapId === "origin" || profile.points.some((point) => point.id === snapId))
  )
    return snapId;
  const id = uid();
  profile.points.push({ id, x, y });
  return id;
}
export function appendLine(
  profile: EntityProfile,
  a: [number, number],
  b: [number, number],
  snapA?: string,
  snapB?: string,
): EntityProfile {
  const next = structuredClone(profile);
  const start = addPoint(next, ...a, snapA),
    end = addPoint(next, ...b, snapB);
  if (start === end || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01)
    return profile;
  const entity: SketchEntity = {
    id: uid(),
    type: "line",
    start,
    end,
    construction: false,
  };
  next.entities.push(entity);
  if (Math.abs(a[1] - b[1]) < 1e-8)
    next.constraints.push({
      id: uid(),
      type: "horizontal",
      entityId: entity.id,
    });
  else if (Math.abs(a[0] - b[0]) < 1e-8)
    next.constraints.push({ id: uid(), type: "vertical", entityId: entity.id });
  return next;
}
export function appendRectangle(
  profile: EntityProfile,
  a: [number, number],
  b: [number, number],
  anchor?: string,
  opposite?: string,
): EntityProfile {
  if (Math.abs(b[0] - a[0]) < 0.01 || Math.abs(b[1] - a[1]) < 0.01)
    return profile;
  const next = structuredClone(profile);
  const ids = [
    addPoint(next, ...a, anchor),
    addPoint(next, b[0], a[1]),
    addPoint(next, ...b, opposite),
    addPoint(next, a[0], b[1]),
  ];
  ids.forEach((id, index) => {
    const entityId = uid();
    next.entities.push({
      id: entityId,
      type: "line",
      start: id,
      end: ids[(index + 1) % 4],
      construction: false,
    });
    next.constraints.push({
      id: uid(),
      type: index % 2 ? "vertical" : "horizontal",
      entityId,
    });
  });
  return next;
}
export function appendCircle(
  profile: EntityProfile,
  center: [number, number],
  radius: number,
  snap?: string,
): EntityProfile {
  if (radius < 0.01) return profile;
  const next = structuredClone(profile);
  next.entities.push({
    id: uid(),
    type: "circle",
    center: addPoint(next, ...center, snap),
    radius,
    construction: false,
  });
  return next;
}
/** The third click sets an angle; its distance never changes the arc radius. */
export function appendArc(
  profile: EntityProfile,
  center: [number, number],
  start: [number, number],
  end: [number, number],
  snapCenter?: string,
  snapStart?: string,
  snapEnd?: string,
): EntityProfile {
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const endRadius = Math.hypot(end[0] - center[0], end[1] - center[1]);
  if (radius < 0.01 || endRadius < 0.01) return profile;
  const projected: [number, number] = [
    center[0] + ((end[0] - center[0]) * radius) / endRadius,
    center[1] + ((end[1] - center[1]) * radius) / endRadius,
  ];
  if (Math.hypot(projected[0] - start[0], projected[1] - start[1]) < 0.01)
    return profile;
  const next = structuredClone(profile);
  next.entities.push({
    id: uid(),
    type: "arc",
    construction: false,
    clockwise: false,
    center: addPoint(next, ...center, snapCenter),
    start: addPoint(next, ...start, snapStart),
    end: addPoint(
      next,
      ...projected,
      Math.abs(radius - endRadius) < 1e-7 ? snapEnd : undefined,
    ),
  });
  return next;
}

/** Translate each selected/shared point once; the reserved origin stays fixed. */
export function translateSelection(
  profile: EntityProfile,
  selection: SketchSelection[],
  dx: number,
  dy: number,
): EntityProfile {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0))
    return profile;
  const pointIds = new Set(
    selection.filter((item) => item.kind === "point").map((item) => item.id),
  );
  const entityIds = new Set(
    selection.filter((item) => item.kind === "entity").map((item) => item.id),
  );
  profile.entities.forEach((entity) => {
    if (entityIds.has(entity.id))
      entityPoints(entity).forEach((id) => pointIds.add(id));
  });
  pointIds.delete("origin");
  if (pointIds.size === 0) return profile;
  const next = structuredClone(profile);
  next.points = next.points.map((point) =>
    pointIds.has(point.id)
      ? { ...point, x: point.x + dx, y: point.y + dy }
      : point,
  );
  return next;
}

export interface SnapPoint {
  x: number;
  y: number;
  id?: string;
}
/** Pixel tolerance is independent of zoom. Ties consistently prefer the origin. */
export function snapSketchPoint(
  profile: EntityProfile,
  point: [number, number],
  scale: number,
  excluded: ReadonlySet<string> = new Set(),
  tolerance = 8,
): SnapPoint {
  let nearest: SketchPoint | undefined;
  let distance = tolerance / Math.max(scale, 1e-9);
  for (const candidate of [{ id: "origin", x: 0, y: 0 }, ...profile.points]) {
    if (excluded.has(candidate.id)) continue;
    const nextDistance = Math.hypot(
      candidate.x - point[0],
      candidate.y - point[1],
    );
    if (nextDistance <= distance && (!nearest || nextDistance < distance)) {
      nearest = candidate;
      distance = nextDistance;
    }
  }
  return nearest
    ? { x: nearest.x, y: nearest.y, id: nearest.id }
    : {
        x: Math.round(point[0] * 1000) / 1000,
        y: Math.round(point[1] * 1000) / 1000,
      };
}

export function sketchBounds(profile: EntityProfile): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const samples = profile.points.map((point) => [point.x, point.y]);
  profile.entities.forEach((entity) => {
    if (entity.type === "line") {
      for (const id of [entity.start, entity.end]) {
        const p = sketchPoint(profile, id);
        samples.push([p.x, p.y]);
      }
    } else {
      const c = sketchPoint(profile, entity.center),
        radius = measureEntity(profile, entity);
      samples.push([c.x - radius, c.y - radius], [c.x + radius, c.y + radius]);
    }
  });
  if (!samples.length) return { minX: -100, minY: -70, maxX: 100, maxY: 70 };
  return {
    minX: Math.min(...samples.map((p) => p[0])),
    minY: Math.min(...samples.map((p) => p[1])),
    maxX: Math.max(...samples.map((p) => p[0])),
    maxY: Math.max(...samples.map((p) => p[1])),
  };
}
export function convertProfile(profile: LegacyProfile): EntityProfile {
  if (profile.kind === "circle") {
    const next = appendCircle(emptySketch(), profile.center, profile.radius);
    const circle = next.entities[0];
    if (circle.type !== "circle") return next;
    next.constraints.push(
      {
        id: uid(),
        type: "fix",
        pointId: circle.center,
        x: profile.center[0],
        y: profile.center[1],
      },
      { id: uid(), type: "radius", entityId: circle.id, value: profile.radius },
    );
    return next;
  }
  const a: [number, number] = [
    profile.center[0] - profile.width / 2,
    profile.center[1] - profile.height / 2,
  ];
  const next = appendRectangle(emptySketch(), a, [
    a[0] + profile.width,
    a[1] + profile.height,
  ]);
  next.constraints.push(
    { id: uid(), type: "fix", pointId: next.points[0].id, x: a[0], y: a[1] },
    {
      id: uid(),
      type: "length",
      entityId: next.entities[0].id,
      value: profile.width,
    },
    {
      id: uid(),
      type: "length",
      entityId: next.entities[1].id,
      value: profile.height,
    },
  );
  return next;
}
export function removeSelection(
  profile: EntityProfile,
  selection: SketchSelection[],
): EntityProfile {
  const next = structuredClone(profile);
  const removedEntities = new Set(
    selection.filter((item) => item.kind === "entity").map((item) => item.id),
  );
  const removedPoints = new Set(
    selection
      .filter((item) => item.kind === "point" && item.id !== "origin")
      .map((item) => item.id),
  );
  next.entities.forEach((entity) => {
    if (entityPoints(entity).some((id) => removedPoints.has(id)))
      removedEntities.add(entity.id);
  });
  const candidates = new Set(
    next.entities
      .filter((entity) => removedEntities.has(entity.id))
      .flatMap(entityPoints),
  );
  next.entities = next.entities.filter(
    (entity) => !removedEntities.has(entity.id),
  );
  const usedPoints = new Set(next.entities.flatMap(entityPoints));
  // Deleting a constraint must not silently erase unrelated standalone points.
  candidates.forEach((id) => {
    if (id !== "origin" && !usedPoints.has(id)) removedPoints.add(id);
  });
  next.points = next.points.filter((point) => !removedPoints.has(point.id));
  const removedConstraints = new Set(
    selection
      .filter((item) => item.kind === "constraint")
      .map((item) => item.id),
  );
  next.constraints = next.constraints.filter(
    (constraint) =>
      !removedConstraints.has(constraint.id) &&
      !constraintReferences(constraint).some(
        (id) => removedEntities.has(id) || removedPoints.has(id),
      ),
  );
  return next;
}
export function measureEntity(
  profile: EntityProfile,
  entity: SketchEntity,
): number {
  if (entity.type === "circle") return entity.radius;
  const a = sketchPoint(
      profile,
      entity.type === "line" ? entity.start : entity.center,
    ),
    b = sketchPoint(
      profile,
      entity.type === "line" ? entity.end : entity.start,
    );
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export interface AngleOptions {
  reversedA?: boolean;
  reversedB?: boolean;
  clockwise?: boolean;
}
type AngularConstraint = Extract<SketchConstraint, { type: "angle" }>;
type TangentConstraint = Extract<SketchConstraint, { type: "tangent" }>;

function selectedEntities(
  profile: EntityProfile,
  a: string,
  b: string,
): [SketchEntity, SketchEntity] {
  if (a === b) throw new Error("Selecciona dos entidades distintas.");
  const first = profile.entities.find((entity) => entity.id === a),
    second = profile.entities.find((entity) => entity.id === b);
  if (!first || !second)
    throw new Error("No se encuentra una de las entidades seleccionadas.");
  return [first, second];
}

function lineDirection(
  profile: EntityProfile,
  entity: SketchEntity,
  reversed = false,
): [number, number] {
  if (entity.type !== "line")
    throw new Error("Una cota angular requiere dos líneas.");
  const start = sketchPoint(profile, entity.start),
    end = sketchPoint(profile, entity.end);
  if (!start || !end)
    throw new Error("No se encuentran los extremos de la línea.");
  const dx = end.x - start.x,
    dy = end.y - start.y,
    length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0)
    throw new Error("La línea seleccionada no tiene una longitud positiva.");
  const sign = reversed ? -1 : 1;
  return [(sign * dx) / length, (sign * dy) / length];
}

/** Measures the directed sector of two rays; opposite rays are 180°, coincident rays 0°. */
export function measureAngle(
  profile: EntityProfile,
  a: string,
  b: string,
  options: AngleOptions = {},
): number {
  const [first, second] = selectedEntities(profile, a, b);
  const u = lineDirection(profile, first, options.reversedA),
    v = lineDirection(profile, second, options.reversedB);
  const cross = (u[0] * v[1] - u[1] * v[0]) * (options.clockwise ? -1 : 1);
  const degrees =
    (Math.atan2(cross, u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI;
  const value = degrees < 0 ? degrees + 360 : degrees;
  return value === 360 ? 0 : value || 0;
}

/** Chooses a sector once; subsequent dimension edits retain all three orientation flags. */
export function createAngularConstraint(
  profile: EntityProfile,
  a: string,
  b: string,
  options: AngleOptions & {
    id?: string;
    value?: number;
    driven?: boolean;
  } = {},
): AngularConstraint {
  const measured = measureAngle(
    options.driven ? solvedMeasurementProfile(profile) : profile,
    a,
    b,
    options,
  );
  const value = options.value ?? measured;
  if (
    !Number.isFinite(value) ||
    (options.driven ? value < 0 : value <= 0) ||
    value >= 360
  )
    throw new Error(
      options.driven
        ? "El ángulo de una cota conducida debe ser mayor o igual que 0 y menor que 360 grados."
        : "El ángulo debe ser mayor que 0 y menor que 360 grados. Usa una relación de paralelismo para 0°.",
    );
  const constraint: AngularConstraint = {
    id: options.id ?? uid(),
    type: "angle",
    a,
    b,
    value,
    reversedA: options.reversedA ?? false,
    reversedB: options.reversedB ?? false,
    clockwise: options.clockwise ?? false,
    ...(options.driven !== undefined ? { driven: options.driven } : {}),
    ...(options.driven ? { referenceRole: "annotation" as const } : {}),
  };
  validateEntityProfile({
    ...profile,
    constraints: [...profile.constraints, constraint],
  });
  return constraint;
}

export type DrivenDimensionDefinition =
  | { type: "distance" | "distanceX" | "distanceY"; a: string; b: string }
  | { type: "length" | "radius"; entityId: string }
  | ({ type: "angle"; a: string; b: string } & AngleOptions);

function solvedMeasurementProfile(profile: EntityProfile): EntityProfile {
  const solution = solveSketch(profile);
  if (solution.status !== "fullyDefined" && solution.status !== "underdefined")
    throw new Error(`No se puede medir la cota conducida: ${solution.message}`);
  return solution.profile;
}

/** A new observation stores its initial measured seed, but solved drivenValues remain authoritative. */
export function createDrivenDimension(
  profile: EntityProfile,
  definition: DrivenDimensionDefinition,
  options: { id?: string } = {},
): DimensionalConstraint {
  if (definition.type === "angle")
    return createAngularConstraint(profile, definition.a, definition.b, {
      ...definition,
      ...options,
      driven: true,
    });
  const constraint: DimensionalConstraint = {
    ...definition,
    id: options.id ?? uid(),
    value: 0,
    driven: true,
    referenceRole: "annotation",
  };
  const measured = measureDimension(
    solvedMeasurementProfile(profile),
    constraint,
  );
  if (measured === null)
    throw new Error("No se puede medir la geometría de la cota conducida.");
  constraint.value = measured;
  validateEntityProfile({
    ...profile,
    constraints: [...profile.constraints, constraint],
  });
  return constraint;
}

/** Converts using current solved geometry; any failure leaves the supplied profile intact. */
export function setDimensionDriven(
  profile: EntityProfile,
  constraintId: string,
  driven: boolean,
): EntityProfile {
  if (typeof driven !== "boolean")
    throw new Error("El modo de la cota debe ser verdadero o falso.");
  const source = validateEntityProfile(profile);
  const original = source.constraints.find(
    (constraint) => constraint.id === constraintId,
  );
  if (!original || !isDimensionalConstraint(original))
    throw new Error("Selecciona una cota dimensional existente.");
  const role =
    original.referenceRole ?? (original.driven ? "annotation" : "constraint");
  let solution = solveSketch(source);
  const succeeded = () =>
    solution.status === "fullyDefined" || solution.status === "underdefined";
  if (!succeeded() && driven) {
    // Reclassifying the offending dimension can repair an overdefined sketch.
    original.driven = true;
    solution = solveSketch(source);
  }
  if (!succeeded())
    throw new Error(
      `No se puede cambiar el modo de la cota: ${solution.message}`,
    );
  const next = solution.profile;
  const dimension = next.constraints.find(
    (constraint) => constraint.id === constraintId,
  )!;
  if (!isDimensionalConstraint(dimension))
    throw new Error("La referencia ya no es una cota dimensional.");
  if (!driven) {
    const measured = measureDimension(next, dimension);
    if (measured === null)
      throw new Error("La medida actual de la cota no está disponible.");
    dimension.value = measured;
  }
  dimension.driven = driven;
  dimension.referenceRole = role;
  try {
    return validateEntityProfile(next);
  } catch (error) {
    throw new Error(
      `No se puede convertir la medida actual en cota conductora: ${error instanceof Error ? error.message : "valor fuera del intervalo admitido"}`,
    );
  }
}

/** Uses infinite lines and complete supporting circles. Equal-error ties prefer left/external. */
export function createTangentConstraint(
  profile: EntityProfile,
  a: string,
  b: string,
  options: { id?: string; branch?: TangentBranch } = {},
): TangentConstraint {
  let [first, second] = selectedEntities(profile, a, b);
  if (first.type === "line" && second.type === "line")
    throw new Error(
      "Tangencia requiere una línea y una entidad circular, o dos entidades circulares.",
    );
  if (second.type === "line") [first, second] = [second, first];
  // A line in first and a circular entity in second is the canonical persisted order.
  if (second.type === "line")
    throw new Error("Selecciona al menos un círculo o arco.");
  const circular = (entity: Exclude<SketchEntity, { type: "line" }>) => {
    const center = sketchPoint(profile, entity.center);
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y))
      throw new Error("El centro circular no es válido.");
    const radius = measureEntity(profile, entity);
    if (!Number.isFinite(radius) || radius <= 0)
      throw new Error("La entidad circular no tiene un radio positivo.");
    return { center, radius };
  };
  const secondCircle = circular(second);
  let branch: TangentBranch;
  if (first.type === "line") {
    const direction = lineDirection(profile, first),
      start = sketchPoint(profile, first.start);
    const signedDistance =
      direction[0] * (secondCircle.center.y - start.y) -
      direction[1] * (secondCircle.center.x - start.x);
    branch = options.branch ?? (signedDistance < 0 ? "right" : "left");
  } else {
    const firstCircle = circular(first),
      distance = Math.hypot(
        secondCircle.center.x - firstCircle.center.x,
        secondCircle.center.y - firstCircle.center.y,
      );
    const choices: { branch: TangentBranch; error: number }[] = [
      {
        branch: "external",
        error: Math.abs(distance - firstCircle.radius - secondCircle.radius),
      },
      {
        branch: "aContainsB",
        error: Math.abs(distance - firstCircle.radius + secondCircle.radius),
      },
      {
        branch: "bContainsA",
        error: Math.abs(distance - secondCircle.radius + firstCircle.radius),
      },
    ];
    branch =
      options.branch ??
      choices.reduce((best, candidate) =>
        candidate.error < best.error ? candidate : best,
      ).branch;
  }
  const constraint: TangentConstraint = {
    id: options.id ?? uid(),
    type: "tangent",
    a: first.id,
    b: second.id,
    branch,
  };
  validateEntityProfile({
    ...profile,
    constraints: [...profile.constraints, constraint],
  });
  return constraint;
}
export const entityLabel = (entity: SketchEntity, index: number) =>
  `${entity.type === "line" ? "Línea" : entity.type === "circle" ? "Círculo" : "Arco"} ${index + 1}`;
