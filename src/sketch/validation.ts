import type {
  EntityProfile,
  DimensionalConstraint,
  SketchConstraint,
  SketchEntity,
  SketchPoint,
  SketchOffsetRelation,
  OffsetJoin,
  OffsetImage,
  OffsetDistanceReference,
} from "./types";
import { orderedArcDirections } from "./arc-directions";

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
    if (constraint.type === "offset") {
      keys(constraint, ["id", "type", "sources", "images", "closed", "cap", "capEntityIds"], location);
      const closed = boolean(constraint.closed, `${location}.closed`);
      const sourceIds = new Set<string>();
      const sources = array(constraint.sources, SKETCH_LIMITS.maxEntities, `${location}.sources`).map((value, index) => {
        const sourcePath = `${location}.sources[${index}]`;
        const source = object(value, sourcePath);
        keys(source, ["entityId", "reversed"], sourcePath);
        const entityId = entityReference(source.entityId, `${sourcePath}.entityId`).id;
        if (sourceIds.has(entityId)) fail(`${sourcePath}.entityId`, "fuente de equidistancia duplicada");
        sourceIds.add(entityId);
        return { entityId, reversed: boolean(source.reversed, `${sourcePath}.reversed`) };
      });
      if (!sources.length) fail(`${location}.sources`, "se requiere al menos una entidad fuente");
      const hasCircle = sources.some(source => entityMap.get(source.entityId)!.type === "circle");
      if (hasCircle && (sources.length !== 1 || !closed))
        fail(`${location}.sources`, "un círculo debe ser la única fuente y formar una equidistancia cerrada");
      const endpoint = (entityId: string, reversed: boolean, end: 0 | 1): string => {
        const entity = entityMap.get(entityId)!;
        if (entity.type === "circle") return fail(location, "un círculo completo no tiene extremos de cadena");
        return (end === 0) !== reversed ? entity.start : entity.end;
      };
      const validateChain = (entityIds: string[], chainPath: string) => {
        if (hasCircle) return;
        for (let i = 0; i < entityIds.length - 1; i++) if (endpoint(entityIds[i], sources[i].reversed, 1) !== endpoint(entityIds[i + 1], sources[i + 1].reversed, 0))
          fail(chainPath, "las entidades ordenadas deben compartir la identidad de cada extremo de unión");
        const sameEnds = endpoint(entityIds[0], sources[0].reversed, 0) === endpoint(entityIds[entityIds.length - 1], sources[sources.length - 1].reversed, 1);
        if (sameEnds !== closed) fail(chainPath, "el cierre de la cadena no corresponde a las identidades de sus extremos");
        const vertices = entityIds.map((id, index) => endpoint(id, sources[index].reversed, 0));
        if (!closed) vertices.push(endpoint(entityIds[entityIds.length - 1], sources[sources.length - 1].reversed, 1));
        if (new Set(vertices).size !== vertices.length) fail(chainPath, "la cadena no puede repetir vértices interiores ni contener bifurcaciones");
      };
      validateChain(sources.map(source => source.entityId), `${location}.sources`);
      const members = new Set(sourceIds);
      const sides = new Set<string>();
      const images = array(constraint.images, 2, `${location}.images`).map((value, index): OffsetImage => {
        const imagePath = `${location}.images[${index}]`;
        const image = object(value, imagePath);
        keys(image, ["side", "distance", "entityIds", "joins", ...["lineEndpointMode", "lineEndpointFollowing"].filter(key => Object.hasOwn(image, key))], imagePath);
        if (Object.hasOwn(image, "lineEndpointMode") && Object.hasOwn(image, "lineEndpointFollowing"))
          fail(imagePath, "lineEndpointMode y lineEndpointFollowing no pueden coexistir");
        const lineEnds = [sources[0], sources[sources.length - 1]].map(source => entityMap.get(source.entityId)!.type === "line");
        const eligibleLineEnds = !closed && constraint.cap === "none" && lineEnds.some(Boolean);
        const lineEndpointMode = image.lineEndpointMode;
        if (Object.hasOwn(image, "lineEndpointMode") && lineEndpointMode !== "aligned" && lineEndpointMode !== "free")
          fail(`${imagePath}.lineEndpointMode`, "se esperaba aligned o free");
        if (lineEndpointMode === "aligned" && !eligibleLineEnds)
          fail(`${imagePath}.lineEndpointMode`, "la alineación requiere extremos libres de línea en una cadena abierta sin tapas");
        let lineEndpointFollowing: [boolean, boolean] | undefined;
        if (Object.hasOwn(image, "lineEndpointFollowing")) {
          const followingPath = `${imagePath}.lineEndpointFollowing`;
          if (!eligibleLineEnds) fail(followingPath, "el seguimiento requiere extremos libres de línea en una cadena abierta sin tapas");
          const following = Array.from(array(image.lineEndpointFollowing, 2, followingPath)).map((value, end) => {
            const follows = boolean(value, `${followingPath}[${end}]`);
            if (follows && !lineEnds[end]) fail(`${followingPath}[${end}]`, "solo un extremo de línea puede seguir a su fuente");
            return follows;
          });
          if (following.length !== 2) fail(followingPath, "se requieren los estados inicial y final de seguimiento");
          lineEndpointFollowing = [following[0], following[1]];
        }
        if (image.side !== "right" && image.side !== "left") fail(`${imagePath}.side`, "se esperaba right o left");
        if (sides.has(image.side)) fail(`${imagePath}.side`, "lado de equidistancia duplicado");
        sides.add(image.side);
        const entityIds = array(image.entityIds, SKETCH_LIMITS.maxEntities, `${imagePath}.entityIds`).map((value, sourceIndex) => {
          const entityPath = `${imagePath}.entityIds[${sourceIndex}]`;
          const entity = entityReference(value, entityPath);
          if (members.has(entity.id)) fail(entityPath, "cada fuente, imagen y tapa debe ser una entidad distinta");
          members.add(entity.id);
          if (sourceIndex >= sources.length || entity.type !== entityMap.get(sources[sourceIndex].entityId)!.type)
            fail(entityPath, "la imagen debe tener el mismo tipo que su fuente correspondiente");
          return entity.id;
        });
        if (entityIds.length !== sources.length) fail(`${imagePath}.entityIds`, "se requiere una imagen por cada fuente");
        validateChain(entityIds, `${imagePath}.entityIds`);
        const joins = array(image.joins, SKETCH_LIMITS.maxEntities, `${imagePath}.joins`).map((value, joinIndex): OffsetJoin => {
          const joinPath = `${imagePath}.joins[${joinIndex}]`;
          const join = object(value, joinPath);
          keys(join, ["kind", "branch"], joinPath);
          if (join.kind !== "intersection" && join.kind !== "continuation") fail(`${joinPath}.kind`, "unión de equidistancia desconocida");
          if (join.branch !== -1 && join.branch !== 0 && join.branch !== 1) fail(`${joinPath}.branch`, "se esperaba -1, 0 o 1");
          if (join.kind === "continuation" && join.branch !== 0) fail(`${joinPath}.branch`, "una continuación tiene rama 0");
          if (entityMap.get(entityIds[joinIndex])?.type === "line" && entityMap.get(entityIds[(joinIndex + 1) % entityIds.length])?.type === "line" && join.branch !== 0)
            fail(`${joinPath}.branch`, "la intersección entre líneas tiene rama 0");
          return { kind: join.kind, branch: join.branch };
        });
        const expectedJoins = hasCircle ? 0 : closed ? sources.length : sources.length - 1;
        if (joins.length !== expectedJoins) fail(`${imagePath}.joins`, "el número de uniones no corresponde a la cadena fuente");
        return { side: image.side, distance: dimension(image.distance, `${imagePath}.distance`), entityIds, joins,
          ...(lineEndpointMode === "aligned" || lineEndpointMode === "free" ? { lineEndpointMode } : {}),
          ...(lineEndpointFollowing ? { lineEndpointFollowing } : {}) };
      });
      if (!images.length) fail(`${location}.images`, "se requiere al menos un lado de equidistancia");
      if (constraint.cap !== "none" && constraint.cap !== "line" && constraint.cap !== "arc") fail(`${location}.cap`, "se esperaba none, line o arc");
      if (constraint.cap !== "none" && closed) fail(`${location}.cap`, "las tapas requieren una cadena abierta");
      const capEntityIds = array(constraint.capEntityIds, 2, `${location}.capEntityIds`).map((value, index) => {
        const capPath = `${location}.capEntityIds[${index}]`;
        const entity = entityReference(value, capPath);
        if (entity.type !== constraint.cap) fail(capPath, "la entidad de tapa no corresponde al tipo indicado");
        if (members.has(entity.id)) fail(capPath, "cada fuente, imagen y tapa debe ser una entidad distinta");
        members.add(entity.id);
        return entity.id;
      });
      if (capEntityIds.length !== (constraint.cap === "none" ? 0 : 2)) fail(`${location}.capEntityIds`, "se requieren las tapas inicial y final, o ninguna para una cadena sin tapas");
      for (const [end, capId] of capEntityIds.entries()) {
        const index = end === 0 ? 0 : sources.length - 1, reversed = sources[index].reversed, first = endpoint(images[0].entityIds[index], reversed, end as 0 | 1), second = endpoint(images.length === 2 ? images[1].entityIds[index] : sources[index].entityId, reversed, end as 0 | 1), capEntity = entityMap.get(capId)!;
        if (capEntity.type === "circle" || capEntity.start !== first || capEntity.end !== second)
          fail(`${location}.capEntityIds[${end}]`, "la tapa debe compartir los extremos correspondientes de la cadena");
      }
      return { id, type: "offset", sources,
        images, closed, cap: constraint.cap, capEntityIds } satisfies SketchOffsetRelation;
    }
    if (constraint.type === "equalOffsetDistance") {
      keys(constraint, ["id", "type", "members"], location);
      const seen = new Set<string>();
      const members = array(constraint.members, SKETCH_LIMITS.maxConstraints, `${location}.members`).map((value, index): OffsetDistanceReference => {
        const memberPath = `${location}.members[${index}]`;
        const member = object(value, memberPath);
        keys(member, ["offsetId", "side"], memberPath);
        const offsetId = identifier(member.offsetId, `${memberPath}.offsetId`);
        if (member.side !== "right" && member.side !== "left") fail(`${memberPath}.side`, "se esperaba right o left");
        const side = member.side;
        const key = JSON.stringify([offsetId, side]);
        if (seen.has(key)) fail(memberPath, "referencia de separación duplicada");
        seen.add(key);
        return { offsetId, side };
      });
      if (members.length < 2) fail(`${location}.members`, "se requieren al menos dos separaciones");
      return { id, type: "equalOffsetDistance", members };
    }
    if (constraint.type === "offsetDistance") {
      dimensionKeys(["id", "type", "offsetId", "side", "value"]);
      const mode = dimensionMode();
      if (constraint.side !== "right" && constraint.side !== "left") fail(`${location}.side`, "se esperaba right o left");
      return { id, type: "offsetDistance", offsetId: identifier(constraint.offsetId, `${location}.offsetId`), side: constraint.side,
        value: mode.driven ? number(constraint.value, `${location}.value`, 0, SKETCH_LIMITS.maxDimension)
          : dimension(constraint.value, `${location}.value`), ...mode };
    }
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
    if (constraint.type === "symmetric") {
      keys(constraint, ["id", "type", "a", "b", "axisId"], location);
      const a = pointReference(constraint.a, `${location}.a`);
      const b = pointReference(constraint.b, `${location}.b`);
      if (a === b)
        fail(location, "simetría requiere dos puntos distintos; para un punto del eje usa pointOnLine");
      return {
        id,
        type: "symmetric",
        a,
        b,
        axisId: entityReference(constraint.axisId, `${location}.axisId`, "line").id,
      };
    }
    if (constraint.type === "mirrorArcDirection") {
      keys(constraint, ["id", "type", "a", "b", "axisId"], location);
      const a = entityReference(constraint.a, `${location}.a`, "circular");
      const b = entityReference(constraint.b, `${location}.b`, "circular");
      if (a.type !== "arc" || b.type !== "arc")
        fail(location, "sentido reflejado requiere dos arcos");
      if (a.id === b.id)
        fail(location, "sentido reflejado requiere dos arcos distintos");
      return {
        id,
        type: "mirrorArcDirection",
        a: a.id,
        b: b.id,
        axisId: entityReference(constraint.axisId, `${location}.axisId`, "line").id,
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
  const constraintMap = new Map(constraints.map(constraint => [constraint.id, constraint]));
  const offsetOwners = new Map<string, string>();
  for (const [index, constraint] of constraints.entries()) {
    const location = `${path}.constraints[${index}]`;
    if (constraint.type === "equalOffsetDistance") {
      for (const [memberIndex, member] of constraint.members.entries()) {
        const memberPath = `${location}.members[${memberIndex}]`;
        const offset = constraintMap.get(member.offsetId);
        if (offset?.type !== "offset") fail(`${memberPath}.offsetId`, "debe referenciar una relación de equidistancia existente");
        if (!offset.images.some(image => image.side === member.side))
          fail(`${memberPath}.side`, "debe referenciar un lado existente de la equidistancia");
      }
    }
    if (constraint.type === "offsetDistance") {
      const offset = constraintMap.get(constraint.offsetId);
      if (offset?.type !== "offset") fail(`${location}.offsetId`, "debe referenciar una relación de equidistancia existente");
      if (!offset.images.some(image => image.side === constraint.side))
        fail(`${location}.side`, "debe referenciar un lado existente de la equidistancia");
    }
    if (constraint.type !== "offset") continue;
    for (const entityId of [...constraint.images.flatMap(image => image.entityIds), ...constraint.capEntityIds]) {
      if (offsetOwners.has(entityId)) fail(location, "una entidad imagen o tapa no puede pertenecer a dos equidistancias");
      offsetOwners.set(entityId, constraint.id);
    }
  }
  const ownedCaps = new Set(constraints.flatMap(constraint => constraint.type === "offset" && constraint.cap === "arc" ? constraint.capEntityIds : []));
  if (constraints.some(constraint => constraint.type === "mirrorArcDirection" && ownedCaps.has(constraint.b))) fail(`${path}.constraints`, "una tapa equidistante no puede tener otra fuente de sentido");
  try {
    orderedArcDirections(constraints, entities);
  } catch (error) {
    fail(`${path}.constraints`, error instanceof Error ? error.message : "Relaciones de sentido reflejado no válidas.");
  }
  return { kind: "entities", points, entities, constraints };
}
