import type { EntityProfile, OffsetSource, SketchEntity, SketchOffsetRelation } from "./types";

export type OffsetPoint = { x: number; y: number };
export type OffsetSupport = { kind: "line"; point: OffsetPoint; direction: OffsetPoint } |
  { kind: "circle"; center: OffsetPoint; radius: number };
export const OFFSET_MIN_GEOMETRY = 1e-6;
const EPS = 1e-8;
const TAU = 2 * Math.PI;
export const plus = (a: OffsetPoint, b: OffsetPoint): OffsetPoint => ({ x: a.x + b.x, y: a.y + b.y });
export const minus = (a: OffsetPoint, b: OffsetPoint): OffsetPoint => ({ x: a.x - b.x, y: a.y - b.y });
export const scaled = (a: OffsetPoint, factor: number): OffsetPoint => ({ x: a.x * factor, y: a.y * factor });
export const dot2 = (a: OffsetPoint, b: OffsetPoint): number => a.x * b.x + a.y * b.y;
export const cross2 = (a: OffsetPoint, b: OffsetPoint): number => a.x * b.y - a.y * b.x;
export const norm = (a: OffsetPoint): number => Math.hypot(a.x, a.y);
export const offsetPoint = (profile: EntityProfile, id: string): OffsetPoint => id === "origin" ? { x: 0, y: 0 } : profile.points.find(p => p.id === id)!;
export const offsetEntity = (profile: EntityProfile, id: string): SketchEntity => profile.entities.find(e => e.id === id)!;
export const ends = (entity: SketchEntity, reversed: boolean): [string, string] => {
  if (entity.type === "circle") throw new Error("Un círculo completo no tiene extremos de cadena.");
  return reversed ? [entity.end, entity.start] : [entity.start, entity.end];
};
export function support(profile: EntityProfile, source: OffsetSource, side: "right" | "left", distance: number): OffsetSupport {
  const entity = offsetEntity(profile, source.entityId), sign = side === "right" ? 1 : -1;
  if (entity.type === "line") {
    const [start, end] = ends(entity, source.reversed), p = offsetPoint(profile, start), delta = minus(offsetPoint(profile, end), p), length = norm(delta);
    if (length < OFFSET_MIN_GEOMETRY) throw new Error("La cadena contiene una línea colapsada.");
    const direction = scaled(delta, 1 / length), normal = { x: direction.y, y: -direction.x };
    return { kind: "line", point: plus(p, scaled(normal, distance * sign)), direction };
  }
  const center = offsetPoint(profile, entity.center), radius = entity.type === "circle" ? entity.radius : norm(minus(offsetPoint(profile, entity.start), center));
  const clockwise = entity.type === "arc" && (entity.clockwise !== source.reversed);
  const result = radius + distance * sign * (clockwise ? -1 : 1);
  if (result < OFFSET_MIN_GEOMETRY) throw new Error("La distancia colapsa o invierte un radio de la equidistancia.");
  return { kind: "circle", center, radius: result };
}
export function projectOffsetPoint(profile: EntityProfile, source: OffsetSource, side: "right" | "left", distance: number, pointId: string): OffsetPoint {
  const entity = offsetEntity(profile, source.entityId), target = support(profile, source, side, distance), p = offsetPoint(profile, pointId);
  if (target.kind === "line") {
    const origin = offsetPoint(profile, ends(entity, source.reversed)[0]);
    return plus(target.point, scaled(target.direction, dot2(minus(p, origin), target.direction)));
  }
  const radial = minus(p, target.center);
  return plus(target.center, scaled(radial, target.radius / norm(radial)));
}

/** Complete-support intersections, with an oriented root independent of array order. */
export function supportIntersections(a: OffsetSupport, b: OffsetSupport): { point: OffsetPoint; branch: -1 | 0 | 1 }[] {
  if (a.kind === "line" && b.kind === "line") {
    const denominator = cross2(a.direction, b.direction);
    if (Math.abs(denominator) < 1e-12) return [];
    return [{ point: plus(a.point, scaled(a.direction, cross2(minus(b.point, a.point), b.direction) / denominator)), branch: 0 }];
  }
  if (a.kind === "line" || b.kind === "line") {
    const line = a.kind === "line" ? a : b as Extract<OffsetSupport, { kind: "line" }>;
    const circle = a.kind === "circle" ? a : b as Extract<OffsetSupport, { kind: "circle" }>;
    const along = dot2(minus(circle.center, line.point), line.direction), projection = plus(line.point, scaled(line.direction, along));
    const h2 = circle.radius ** 2 - norm(minus(projection, circle.center)) ** 2;
    const tolerance = EPS * Math.max(1, circle.radius ** 2);
    if (h2 < -tolerance) return [];
    if (h2 <= tolerance) return [{ point: projection, branch: 0 }];
    const h = Math.sqrt(h2);
    return [{ point: plus(projection, scaled(line.direction, -h)), branch: -1 }, { point: plus(projection, scaled(line.direction, h)), branch: 1 }];
  }
  const vector = minus(b.center, a.center), length = norm(vector);
  if (length < OFFSET_MIN_GEOMETRY) return [];
  const along = (a.radius ** 2 - b.radius ** 2 + length ** 2) / (2 * length), h2 = a.radius ** 2 - along ** 2;
  const tolerance = EPS * Math.max(1, a.radius ** 2, b.radius ** 2);
  if (h2 < -tolerance) return [];
  const direction = scaled(vector, 1 / length), base = plus(a.center, scaled(direction, along));
  if (h2 <= tolerance) return [{ point: base, branch: 0 }];
  const normal = { x: -direction.y, y: direction.x }, h = Math.sqrt(h2);
  return [{ point: plus(base, scaled(normal, -h)), branch: -1 }, { point: plus(base, scaled(normal, h)), branch: 1 }];
}
export function sameSupport(a: OffsetSupport, b: OffsetSupport): boolean {
  if (a.kind === "line" && b.kind === "line") return Math.abs(cross2(a.direction, b.direction)) < 1e-10 && Math.abs(cross2(a.direction, minus(b.point, a.point))) < 1e-7;
  return a.kind === "circle" && b.kind === "circle" && norm(minus(a.center, b.center)) < 1e-7 && Math.abs(a.radius - b.radius) < 1e-7;
}
function entitySupport(profile: EntityProfile, entity: SketchEntity): OffsetSupport {
  return support(profile, { entityId: entity.id, reversed: false }, "right", 0);
}
function positiveAngle(angle: number): number { return (angle % TAU + TAU) % TAU; }
export function onFiniteEntity(profile: EntityProfile, entity: SketchEntity, p: OffsetPoint, tolerance = 1e-7): boolean {
  if (entity.type === "circle") return true;
  const a = offsetPoint(profile, entity.start), b = offsetPoint(profile, entity.end);
  if (entity.type === "line") {
    const direction = minus(b, a), length = norm(direction), position = dot2(minus(p, a), direction) / (length * length);
    return position >= -tolerance / length && position <= 1 + tolerance / length;
  }
  const center = offsetPoint(profile, entity.center), start = minus(a, center), end = minus(b, center), radial = minus(p, center), sign = entity.clockwise ? -1 : 1;
  const sweep = positiveAngle(sign * Math.atan2(cross2(start, end), dot2(start, end))), position = positiveAngle(sign * Math.atan2(cross2(start, radial), dot2(start, radial)));
  return position <= sweep + tolerance / norm(start) || norm(minus(p, a)) <= tolerance;
}

function coincidentFiniteSupportsConflict(profile: EntityProfile, a: SketchEntity, b: SketchEntity, shared: string[], tolerance: number): boolean {
  if (a.type === "line" && b.type === "line") {
    const origin = offsetPoint(profile, a.start), vector = minus(offsetPoint(profile, a.end), origin), length = norm(vector), unit = scaled(vector, 1 / length);
    const first = dot2(minus(offsetPoint(profile, b.start), origin), unit), second = dot2(minus(offsetPoint(profile, b.end), origin), unit), low = Math.max(0, Math.min(first, second)), high = Math.min(length, Math.max(first, second));
    if (high - low > tolerance) return true;
    if (high < low - tolerance) return false;
    const contact = plus(origin, scaled(unit, (high + low) / 2));
    return !shared.some(id => norm(minus(offsetPoint(profile, id), contact)) <= tolerance);
  }
  if (a.type === "circle" || b.type === "circle") return true;
  if (a.type !== "arc" || b.type !== "arc") return false;
  const center = offsetPoint(profile, a.center), radius = norm(minus(offsetPoint(profile, a.start), center)), angularTolerance = tolerance / radius;
  const intervals = (entity: typeof a): [number, number][] => {
    const start = minus(offsetPoint(profile, entity.clockwise ? entity.end : entity.start), center), end = minus(offsetPoint(profile, entity.clockwise ? entity.start : entity.end), center);
    const angle = positiveAngle(Math.atan2(start.y, start.x)), sweep = positiveAngle(Math.atan2(cross2(start, end), dot2(start, end))), limit = angle + sweep;
    return limit <= TAU ? [[angle, limit]] : [[angle, TAU], [0, limit - TAU]];
  };
  for (const first of intervals(a)) for (const second of intervals(b)) if (Math.min(first[1], second[1]) - Math.max(first[0], second[0]) > angularTolerance) return true;
  for (const id of [a.start, a.end]) if (onFiniteEntity(profile, b, offsetPoint(profile, id), tolerance) && !shared.some(sharedId => norm(minus(offsetPoint(profile, sharedId), offsetPoint(profile, id))) <= tolerance)) return true;
  for (const id of [b.start, b.end]) if (onFiniteEntity(profile, a, offsetPoint(profile, id), tolerance) && !shared.some(sharedId => norm(minus(offsetPoint(profile, sharedId), offsetPoint(profile, id))) <= tolerance)) return true;
  return false;
}

/** An offset never clips loops or silently changes its source/image topology. */
export function offsetGeometryError(profile: EntityProfile, relation: SketchOffsetRelation, tolerance = 1e-7): string | null {
  const sources = relation.sources.map(s => offsetEntity(profile, s.entityId));
  const allMembers = [...sources, ...relation.images.flatMap(image => image.entityIds.map(id => offsetEntity(profile, id))), ...relation.capEntityIds.map(id => offsetEntity(profile, id))];
  for (const entity of allMembers) {
    if (entity.type !== "circle" && norm(minus(offsetPoint(profile, entity.end), offsetPoint(profile, entity.start))) < OFFSET_MIN_GEOMETRY) return "La equidistancia colapsa un tramo o completa una vuelta de arco.";
    if (entity.type === "arc" && norm(minus(offsetPoint(profile, entity.start), offsetPoint(profile, entity.center))) < OFFSET_MIN_GEOMETRY) return "La equidistancia colapsa el radio de un arco.";
  }
  if (relation.cap === "arc") for (const [end, id] of relation.capEntityIds.entries()) {
    const cap = offsetEntity(profile, id) as Extract<SketchEntity, { type: "arc" }>;
    if (cap.clockwise !== ((relation.images[0].side === "right") === (end === 0))) return "La tapa semicircular debe conservar el sentido exterior de la cadena.";
    const reference = relation.sources[end === 0 ? 0 : relation.sources.length - 1], source = offsetEntity(profile, reference.entityId), sourceEndpoint = ends(source, reference.reversed)[end], sourceCenter = source.type === "arc" ? offsetPoint(profile, source.center) : null;
    const tangent = source.type === "line" ? minus(offsetPoint(profile, ends(source, reference.reversed)[1]), offsetPoint(profile, ends(source, reference.reversed)[0])) : (() => {
      const radial = minus(offsetPoint(profile, sourceEndpoint), sourceCenter!); return scaled({ x: -radial.y, y: radial.x }, source.type === "arc" && (source.clockwise !== reference.reversed) ? -1 : 1);
    })();
    const radial = minus(offsetPoint(profile, cap.start), offsetPoint(profile, cap.center)), midpoint = cap.clockwise ? { x: radial.y, y: -radial.x } : { x: -radial.y, y: radial.x };
    if (dot2(midpoint, scaled(tangent, end === 0 ? -1 : 1)) <= 0) return "La tapa semicircular se orientaría hacia el interior de la cadena.";
  }
  for (const image of relation.images) {
    const entities = image.entityIds.map(id => offsetEntity(profile, id));
    for (let i = 0; i < entities.length; i++) {
      const source = sources[i], target = entities[i];
      if (source.type === "line" && target.type === "line" && dot2(minus(offsetPoint(profile, source.end), offsetPoint(profile, source.start)), minus(offsetPoint(profile, target.end), offsetPoint(profile, target.start))) <= OFFSET_MIN_GEOMETRY ** 2)
        return "La equidistancia invertiría o consumiría una línea de la cadena.";
      if (source.type === "arc" && target.type === "arc" && source.clockwise !== target.clockwise)
        return "El sentido del arco equidistante no corresponde a su fuente.";
    }
    const positiveStation = (index: number, end: 0 | 1): boolean => {
      const source = sources[index], target = entities[index];
      if (source.type !== "arc" || target.type !== "arc") return true;
      const reference = relation.sources[index], center = offsetPoint(profile, source.center);
      return dot2(minus(offsetPoint(profile, ends(source, reference.reversed)[end]), center), minus(offsetPoint(profile, ends(target, reference.reversed)[end]), center)) > 0;
    };
    if (relation.cap !== "none" && (!positiveStation(0, 0) || !positiveStation(entities.length - 1, 1))) return "Una tapa no puede cambiar al extremo radial opuesto de su fuente.";
    for (let i = 0; i < image.joins.length; i++) if (image.joins[i].kind === "continuation" && !positiveStation(i, 1)) return "La continuación equidistante cambiaría de rayo radial.";
    for (let i = 0; i < image.joins.length; i++) {
      const j = (i + 1) % entities.length, first = entitySupport(profile, entities[i]), second = entitySupport(profile, entities[j]);
      const join = image.joins[i], pointId = ends(entities[i], relation.sources[i].reversed)[1], p = offsetPoint(profile, pointId);
      if (join.kind === "intersection" && join.branch !== 0) {
        let signed: number;
        if (first.kind === "line" || second.kind === "line") {
          const index = first.kind === "line" ? i : j, lineEntity = entities[index], circle = first.kind === "circle" ? first : second as Extract<OffsetSupport, { kind: "circle" }>;
          const direction = minus(offsetPoint(profile, ends(lineEntity, relation.sources[index].reversed)[1]), offsetPoint(profile, ends(lineEntity, relation.sources[index].reversed)[0]));
          signed = dot2(minus(p, circle.center), scaled(direction, 1 / norm(direction)));
        } else signed = cross2(minus(second.center, first.center), minus(p, first.center)) / Math.max(OFFSET_MIN_GEOMETRY, norm(minus(second.center, first.center)));
        if (signed * join.branch < -tolerance) return "La equidistancia cambiaría la intersección elegida de la cadena.";
      }
    }
  }
  // A closed source and every image must remain simple. Open chains have the
  // same nonadjacent crossing rule; caps are checked together with their sides.
  const groups: SketchEntity[][] = [sources, ...relation.images.map(image => image.entityIds.map(id => offsetEntity(profile, id)))];
  if (relation.capEntityIds.length) groups.push([...(relation.images.length === 1 ? sources : groups[1]), ...groups[groups.length - 1], ...relation.capEntityIds.map(id => offsetEntity(profile, id))]);
  for (const entities of groups) for (let i = 0; i < entities.length; i++) for (let j = i + 1; j < entities.length; j++) {
    const a = entities[i], b = entities[j], first = entitySupport(profile, a), second = entitySupport(profile, b);
    const endpoints = (e: SketchEntity) => e.type === "circle" ? [] : [e.start, e.end];
    const shared = endpoints(a).filter(id => endpoints(b).includes(id));
    if (sameSupport(first, second)) {
      if (coincidentFiniteSupportsConflict(profile, a, b, shared, tolerance)) return "La equidistancia contiene soportes superpuestos.";
      continue;
    }
    for (const hit of supportIntersections(first, second)) if (onFiniteEntity(profile, a, hit.point, tolerance) && onFiniteEntity(profile, b, hit.point, tolerance) && !shared.some(id => norm(minus(hit.point, offsetPoint(profile, id))) <= tolerance))
      return "La equidistancia produciría una intersección o un cambio de topología.";
  }
  return null;
}
