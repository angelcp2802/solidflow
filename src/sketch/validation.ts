import type {
  EntityProfile,
  DimensionalConstraint,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
} from "./types";

/** File-format limits. A solver may report a lower, explicit computational limit. */
export const SKETCH_LIMITS = Object.freeze({
  maxPoints: 128,
  maxEntities: 128,
  maxConstraints: 256,
  maxCoordinate: 1_000_000,
  maxDimension: 100_000,
  minDimension: 0.01,
});

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "se esperaba un objeto");
  return value as Record<string, unknown>;
}

function keys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, "campo desconocido");
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "campo obligatorio");
  }
}

function identifier(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 128 ||
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    fail(
      path,
      "se esperaba un identificador de entre 1 y 128 caracteres, sin caracteres de control",
    );
  }
  return value;
}

function number(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(path, `se esperaba un número finito entre ${minimum} y ${maximum}`);
  }
  return value;
}

function coordinate(value: unknown, path: string): number {
  return number(
    value,
    path,
    -SKETCH_LIMITS.maxCoordinate,
    SKETCH_LIMITS.maxCoordinate,
  );
}

function dimension(value: unknown, path: string): number {
  return number(
    value,
    path,
    SKETCH_LIMITS.minDimension,
    SKETCH_LIMITS.maxDimension,
  );
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "se esperaba verdadero o falso");
  return value;
}

function array(value: unknown, maximum: number, path: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(path, `se esperaba una lista de hasta ${maximum} elementos`);
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index))
      fail(`${path}[${index}]`, "elemento obligatorio");
  }
  return value;
}

/**
 * Validates only structure and typed references, and returns a detached copy.
 * Open, empty, redundant, contradictory and geometrically degenerate definitions
 * remain valid documents; the solver and solid builder diagnose their geometry.
 * The origin is immutable because it is a reserved reference, never a stored point.
 */
export function validateEntityProfile(
  value: unknown,
  path = "Croquis",
): EntityProfile {
  const source = object(value, path);
  keys(source, ["kind", "points", "entities", "constraints"], path);
  if (source.kind !== "entities")
    fail(`${path}.kind`, "se esperaba un perfil de entidades");
  const ids = new Set<string>(["origin"]);
  const uniqueId = (value: unknown, path: string): string => {
    const id = identifier(value, path);
    if (id === "origin")
      fail(
        path,
        "'origin' es una referencia reservada y no se puede guardar como elemento",
      );
    if (ids.has(id)) fail(path, "identificador duplicado en el croquis");
    ids.add(id);
    return id;
  };
  const points: SketchPoint[] = array(
    source.points,
    SKETCH_LIMITS.maxPoints,
    `${path}.points`,
  ).map((value, index) => {
    const location = `${path}.points[${index}]`;
    const point = object(value, location);
    keys(point, ["id", "x", "y"], location);
    return {
      id: uniqueId(point.id, `${location}.id`),
      x: coordinate(point.x, `${location}.x`),
      y: coordinate(point.y, `${location}.y`),
    };
  });
  const pointIds = new Set(["origin", ...points.map((point) => point.id)]);
  const pointReference = (value: unknown, path: string): string => {
    const id = identifier(value, path);
    if (!pointIds.has(id))
      fail(path, "debe referenciar un punto existente o 'origin'");
    return id;
  };
  const entities: SketchEntity[] = array(
    source.entities,
    SKETCH_LIMITS.maxEntities,
    `${path}.entities`,
  ).map((value, index) => {
    const location = `${path}.entities[${index}]`;
    const entity = object(value, location);
    const base = {
      id: uniqueId(entity.id, `${location}.id`),
      construction: boolean(entity.construction, `${location}.construction`),
    };
    if (entity.type === "line") {
      keys(entity, ["id", "type", "construction", "start", "end"], location);
      return {
        ...base,
        type: "line",
        start: pointReference(entity.start, `${location}.start`),
        end: pointReference(entity.end, `${location}.end`),
      };
    }
    if (entity.type === "circle") {
      keys(
        entity,
        ["id", "type", "construction", "center", "radius"],
        location,
      );
      return {
        ...base,
        type: "circle",
        center: pointReference(entity.center, `${location}.center`),
        radius: dimension(entity.radius, `${location}.radius`),
      };
    }
    if (entity.type === "arc") {
      keys(
        entity,
        ["id", "type", "construction", "center", "start", "end", "clockwise"],
        location,
      );
      return {
        ...base,
        type: "arc",
        center: pointReference(entity.center, `${location}.center`),
        start: pointReference(entity.start, `${location}.start`),
        end: pointReference(entity.end, `${location}.end`),
        clockwise: boolean(entity.clockwise, `${location}.clockwise`),
      };
    }
    return fail(`${location}.type`, "tipo de entidad desconocido");
  });
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const entityReference = (
    value: unknown,
    path: string,
    expected: "line" | "circular" | "any" = "any",
  ): SketchEntity => {
    const id = identifier(value, path);
    const entity = entityMap.get(id);
    if (!entity) fail(path, "debe referenciar una entidad existente");
    if (expected === "line" && entity.type !== "line")
      fail(path, "debe referenciar una línea");
    if (
      expected === "circular" &&
      entity.type !== "circle" &&
      entity.type !== "arc"
    )
      fail(path, "debe referenciar un círculo o arco");
    return entity;
  };
  const constraints: SketchConstraint[] = array(
    source.constraints,
    SKETCH_LIMITS.maxConstraints,
    `${path}.constraints`,
  ).map((value, index) => {
    const location = `${path}.constraints[${index}]`;
    const constraint = object(value, location);
    const id = uniqueId(constraint.id, `${location}.id`);
    const dimensionMode = (): Pick<
      DimensionalConstraint,
      "driven" | "referenceRole"
    > => {
      const mode: Pick<DimensionalConstraint, "driven" | "referenceRole"> =
        Object.hasOwn(constraint, "driven")
          ? { driven: boolean(constraint.driven, `${location}.driven`) }
          : {};
      if (Object.hasOwn(constraint, "referenceRole")) {
        if (
          constraint.referenceRole !== "annotation" &&
          constraint.referenceRole !== "constraint"
        )
          fail(
            `${location}.referenceRole`,
            "se esperaba annotation o constraint",
          );
        mode.referenceRole = constraint.referenceRole;
      }
      return mode;
    };
    const dimensionKeys = (required: string[]) =>
      keys(
        constraint,
        [
          ...required,
          ...["driven", "referenceRole"].filter((key) =>
            Object.hasOwn(constraint, key),
          ),
        ],
        location,
      );
    if (constraint.type === "fix") {
      keys(constraint, ["id", "type", "pointId", "x", "y"], location);
      return {
        id,
        type: "fix",
        pointId: pointReference(constraint.pointId, `${location}.pointId`),
        x: coordinate(constraint.x, `${location}.x`),
        y: coordinate(constraint.y, `${location}.y`),
      };
    }
    if (constraint.type === "coincident") {
      keys(constraint, ["id", "type", "a", "b"], location);
      return {
        id,
        type: "coincident",
        a: pointReference(constraint.a, `${location}.a`),
        b: pointReference(constraint.b, `${location}.b`),
      };
    }
    if (constraint.type === "horizontal" || constraint.type === "vertical") {
      keys(constraint, ["id", "type", "entityId"], location);
      return {
        id,
        type: constraint.type,
        entityId: entityReference(
          constraint.entityId,
          `${location}.entityId`,
          "line",
        ).id,
      };
    }
    if (
      constraint.type === "parallel" ||
      constraint.type === "perpendicular" ||
      constraint.type === "equal"
    ) {
      keys(constraint, ["id", "type", "a", "b"], location);
      const expected = constraint.type === "equal" ? "any" : "line";
      const a = entityReference(constraint.a, `${location}.a`, expected);
      const b = entityReference(constraint.b, `${location}.b`, expected);
      if (
        constraint.type === "equal" &&
        (a.type === "line") !== (b.type === "line")
      ) {
        fail(
          location,
          "igualdad requiere dos líneas, o dos entidades circulares",
        );
      }
      return { id, type: constraint.type, a: a.id, b: b.id };
    }
    if (
      constraint.type === "pointOnLine" ||
      constraint.type === "pointOnCircle"
    ) {
      keys(constraint, ["id", "type", "pointId", "entityId"], location);
      return {
        id,
        type: constraint.type,
        pointId: pointReference(constraint.pointId, `${location}.pointId`),
        entityId: entityReference(
          constraint.entityId,
          `${location}.entityId`,
          constraint.type === "pointOnLine" ? "line" : "circular",
        ).id,
      };
    }
    if (constraint.type === "tangent") {
      keys(constraint, ["id", "type", "a", "b", "branch"], location);
      const a = entityReference(constraint.a, `${location}.a`);
      const b = entityReference(constraint.b, `${location}.b`, "circular");
      if (a.id === b.id)
        fail(location, "tangencia requiere dos entidades distintas");
      const branch = constraint.branch;
      if (a.type === "line") {
        if (branch !== "left" && branch !== "right")
          fail(
            `${location}.branch`,
            "tangencia línea-circular requiere lado left o right",
          );
      } else if (
        branch !== "external" &&
        branch !== "aContainsB" &&
        branch !== "bContainsA"
      ) {
        fail(
          `${location}.branch`,
          "tangencia circular requiere rama external, aContainsB o bContainsA",
        );
      }
      return { id, type: "tangent", a: a.id, b: b.id, branch };
    }
    if (constraint.type === "angle") {
      dimensionKeys([
        "id",
        "type",
        "a",
        "b",
        "value",
        "reversedA",
        "reversedB",
        "clockwise",
      ]);
      const mode = dimensionMode();
      const a = entityReference(constraint.a, `${location}.a`, "line");
      const b = entityReference(constraint.b, `${location}.b`, "line");
      if (a.id === b.id)
        fail(location, "una cota angular requiere dos líneas distintas");
      const value = number(
        constraint.value,
        `${location}.value`,
        mode.driven ? 0 : Number.MIN_VALUE,
        360,
      );
      if (value >= 360)
        fail(
          `${location}.value`,
          mode.driven
            ? "el ángulo conducido debe ser mayor o igual que 0 y menor que 360 grados"
            : "el ángulo debe ser mayor que 0 y menor que 360 grados",
        );
      return {
        id,
        type: "angle",
        a: a.id,
        b: b.id,
        value,
        reversedA: boolean(constraint.reversedA, `${location}.reversedA`),
        reversedB: boolean(constraint.reversedB, `${location}.reversedB`),
        clockwise: boolean(constraint.clockwise, `${location}.clockwise`),
        ...mode,
      };
    }
    if (
      constraint.type === "distance" ||
      constraint.type === "distanceX" ||
      constraint.type === "distanceY"
    ) {
      dimensionKeys(["id", "type", "a", "b", "value"]);
      const mode = dimensionMode();
      return {
        id,
        type: constraint.type,
        a: pointReference(constraint.a, `${location}.a`),
        b: pointReference(constraint.b, `${location}.b`),
        value: number(
          constraint.value,
          `${location}.value`,
          constraint.type === "distance"
            ? mode.driven
              ? 0
              : Number.MIN_VALUE
            : -(mode.driven
                ? 2 * SKETCH_LIMITS.maxCoordinate
                : SKETCH_LIMITS.maxDimension),
          mode.driven
            ? (constraint.type === "distance" ? 2 * Math.SQRT2 : 2) *
                SKETCH_LIMITS.maxCoordinate
            : SKETCH_LIMITS.maxDimension,
        ),
        ...mode,
      };
    }
    if (constraint.type === "length" || constraint.type === "radius") {
      dimensionKeys(["id", "type", "entityId", "value"]);
      const mode = dimensionMode();
      return {
        id,
        type: constraint.type,
        entityId: entityReference(
          constraint.entityId,
          `${location}.entityId`,
          constraint.type === "length" ? "line" : "circular",
        ).id,
        value: mode.driven
          ? number(
              constraint.value,
              `${location}.value`,
              0,
              2 * Math.SQRT2 * SKETCH_LIMITS.maxCoordinate,
            )
          : dimension(constraint.value, `${location}.value`),
        ...mode,
      };
    }
    return fail(`${location}.type`, "tipo de restricción desconocido");
  });
  return { kind: "entities", points, entities, constraints };
}
