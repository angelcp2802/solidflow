import type { EntityProfile, OffsetImage, OffsetJoin, OffsetSource, SketchEntity, SketchOffsetRelation, SketchSelection } from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";
import { createSketchIdAllocator } from "./ids";
import { cross2, dot2, ends, minus, norm, offsetEntity, offsetGeometryError, offsetPoint, plus, projectOffsetPoint, sameSupport, scaled, support, supportIntersections, type OffsetPoint } from "./offset-geometry";

export interface OffsetParameters {
  distance: number;
  reverse: boolean;
  bothDirections: boolean;
  chain: boolean;
  cap: "none" | "line" | "arc";
  construction: "none" | "source" | "offset" | "both";
  addDimensions: boolean;
}
export interface OffsetPlan {
  changed: boolean;
  sourceProfile: EntityProfile;
  profile: EntityProfile;
  message: string;
  selectedEntityIds: string[];
  sourceEntityIds: string[];
  imageEntityIds: string[];
  createdConstraintIds: string[];
  capEntityIds: string[];
  components: OffsetPlanComponent[];
}

export interface OffsetPlanComponent {
  relationId: string;
  primaryEntityId: string;
  sourceEntityIds: string[];
  imageEntityIds: string[];
  capEntityIds: string[];
  distanceConstraintIds: string[];
}

/** Follow shared identities, never infer connectivity from coordinate proximity. */
function orderedSources(profile: EntityProfile, selected: string[], chain: boolean): { sources: OffsetSource[]; closed: boolean } {
  const selectedEntities = selected.map(id => offsetEntity(profile, id));
  if (selectedEntities.some(e => !e)) throw new Error("Alguna entidad seleccionada ya no existe.");
  if (selectedEntities.some(e => e.type === "circle")) {
    if (selectedEntities.length !== 1) throw new Error("Selecciona un único círculo completo o una cadena de líneas y arcos.");
    return { sources: [{ entityId: selected[0], reversed: false }], closed: true };
  }
  const ids = new Set(selected), primary = selected[0];
  if (chain) {
    let expanded = true;
    while (expanded) {
      expanded = false;
      const endpoints = new Set(profile.entities.filter(e => ids.has(e.id) && e.type !== "circle").flatMap(e => ends(e, false)));
      for (const entity of profile.entities) if (entity.type !== "circle" && !ids.has(entity.id) && [entity.start, entity.end].some(id => endpoints.has(id))) {
        ids.add(entity.id); expanded = true;
      }
    }
  }
  const entities = [...ids].map(id => offsetEntity(profile, id));
  const adjacency = new Map<string, SketchEntity[]>();
  for (const entity of entities) for (const id of ends(entity, false)) adjacency.set(id, [...(adjacency.get(id) ?? []), entity]);
  if ([...adjacency.values()].some(list => list.length > 2)) throw new Error("La selección contiene una bifurcación; elige una cadena sin ramas.");
  const loose = [...adjacency].filter(([, list]) => list.length === 1).map(([id]) => id).sort();
  const closed = loose.length === 0;
  if (!closed && loose.length !== 2) throw new Error("Selecciona una única cadena conectada.");
  const primaryEntity = offsetEntity(profile, primary), initial = closed ? ends(primaryEntity, false)[0] : loose[0];
  let current = initial;
  const visited = new Set<string>(), sources: OffsetSource[] = [];
  while (sources.length < entities.length) {
    const next = (adjacency.get(current) ?? []).filter(entity => !visited.has(entity.id)).sort((a, b) => a.id === primary ? -1 : b.id === primary ? 1 : a.id.localeCompare(b.id))[0];
    if (!next) break;
    const reversed = ends(next, false)[0] !== current;
    sources.push({ entityId: next.id, reversed }); visited.add(next.id); current = ends(next, reversed)[1];
  }
  if (sources.length !== entities.length || closed && current !== initial) throw new Error("Selecciona una única cadena conectada.");
  // The primary entity's stored direction owns the command's right/left side.
  // Reversing its storage and the command side gives the same physical offset.
  if (!closed && sources.find(source => source.entityId === primary)!.reversed) sources.reverse().forEach(source => source.reversed = !source.reversed);
  if (closed) {
    let twiceArea = 0;
    for (const source of sources) {
      const entity = offsetEntity(profile, source.entityId), [start, end] = ends(entity, source.reversed), a = offsetPoint(profile, start), b = offsetPoint(profile, end);
      if (entity.type === "line") twiceArea += cross2(a, b);
      else if (entity.type === "arc") {
        const center = offsetPoint(profile, entity.center), u = minus(a, center), v = minus(b, center), clockwise = entity.clockwise !== source.reversed;
        const sign = clockwise ? -1 : 1, raw = sign * Math.atan2(cross2(u, v), dot2(u, v)), sweep = ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * sign;
        twiceArea += center.x * (b.y - a.y) - center.y * (b.x - a.x) + dot2(u, u) * sweep;
      }
    }
    if (Math.abs(twiceArea) < 1e-12) throw new Error("La cadena cerrada no delimita un área válida.");
    if (twiceArea < 0) sources.reverse().forEach(source => source.reversed = !source.reversed);
    const first = sources.findIndex(source => source.entityId === [...ids].sort()[0]);
    sources.push(...sources.splice(0, first));
  }
  return { sources, closed };
}

/** Partition the original topology before allocating any images or caps. */
function orderedComponents(profile: EntityProfile, selected: string[], chain: boolean) {
  const entities = new Map(profile.entities.map(entity => [entity.id, entity]));
  if (selected.some(id => !entities.has(id))) throw new Error("Alguna entidad seleccionada ya no existe.");
  const candidates = chain ? profile.entities : selected.map(id => entities.get(id)!);
  const adjacent = new Map<string, string[]>();
  for (const entity of candidates) if (entity.type !== "circle") for (const pointId of ends(entity, false)) {
    adjacent.set(pointId, [...(adjacent.get(pointId) ?? []), entity.id]);
  }
  const assigned = new Set<string>();
  const components = selected.flatMap(primaryEntityId => {
    if (assigned.has(primaryEntityId)) return [];
    const members = new Set<string>(), pending = [primaryEntityId];
    while (pending.length) {
      const id = pending.pop()!;
      if (members.has(id)) continue;
      members.add(id); assigned.add(id);
      const entity = entities.get(id)!;
      if (entity.type !== "circle") for (const pointId of ends(entity, false)) pending.push(...(adjacent.get(pointId) ?? []));
    }
    const ids = [primaryEntityId, ...[...members].filter(id => id !== primaryEntityId).sort()];
    return [{ ...orderedSources(profile, ids, false), primaryEntityId }];
  });
  return components;
}

/** A detached support-based proposal. No solver or source mutation is hidden here. */
export function planSketchOffset(input: EntityProfile, selection: SketchSelection[], parameters: OffsetParameters): OffsetPlan {
  const selectedEntityIds = selection.filter(item => item.kind === "entity").map(item => item.id);
  const rejected = (message: string): OffsetPlan => ({ changed: false, sourceProfile: input, profile: input, message, selectedEntityIds, sourceEntityIds: [], imageEntityIds: [], createdConstraintIds: [], capEntityIds: [], components: [] });
  try {
    const profile = validateEntityProfile(input);
    if (!parameters || !Number.isFinite(parameters.distance) || parameters.distance < SKETCH_LIMITS.minDimension || parameters.distance > SKETCH_LIMITS.maxDimension ||
      ![parameters.reverse, parameters.bothDirections, parameters.chain, parameters.addDimensions].every(value => typeof value === "boolean") ||
      !["none", "line", "arc"].includes(parameters.cap) || !["none", "source", "offset", "both"].includes(parameters.construction)) return rejected("Revisa la distancia y las opciones de equidistancia.");
    if (!selection.length || selection.some(item => item.kind !== "entity") || new Set(selectedEntityIds).size !== selectedEntityIds.length) return rejected("Selecciona líneas, arcos o círculos sin repetir entidades.");
    const chains = orderedComponents(profile, selectedEntityIds, parameters.chain);
    const allocate = createSketchIdAllocator(profile, "offset");
    const createPoint = (p: OffsetPoint) => { const id = allocate("point"); profile.points.push({ id, x: p.x, y: p.y }); return id; };
    const sides: ("right" | "left")[] = parameters.bothDirections ? [parameters.reverse ? "left" : "right", parameters.reverse ? "right" : "left"] : [parameters.reverse ? "left" : "right"];
    const components: OffsetPlanComponent[] = [], relations: SketchOffsetRelation[] = [];
    const sourceEntityIds: string[] = [], allImageEntityIds: string[] = [], allCapEntityIds: string[] = [], createdConstraintIds: string[] = [];
    for (const { sources, closed, primaryEntityId } of chains) {
      const cap = closed ? "none" : parameters.cap;
      const images: OffsetImage[] = [], imageEntityIds: string[] = [], capEntityIds: string[] = [];
      const outputConstruction = parameters.construction === "offset" || parameters.construction === "both";
      for (const side of sides) {
        const supports = sources.map(source => support(profile, source, side, parameters.distance));
        const joins: OffsetJoin[] = [], joints: OffsetPoint[] = [];
        const count = closed && sources.length > 1 ? sources.length : sources.length - 1;
        for (let i = 0; i < count; i++) {
          const j = (i + 1) % sources.length, endpoint = ends(offsetEntity(profile, sources[i].entityId), sources[i].reversed)[1];
          const seed = projectOffsetPoint(profile, sources[i], side, parameters.distance, endpoint);
          if (sameSupport(supports[i], supports[j])) { joins.push({ kind: "continuation", branch: 0 }); joints.push(seed); continue; }
          const hits = supportIntersections(supports[i], supports[j]).map(hit => ({ ...hit, distance: norm(minus(hit.point, seed)) })).sort((a, b) => a.distance - b.distance);
          if (!hits.length || hits.length > 1 && Math.abs(hits[0].distance - hits[1].distance) < 1e-7) throw new Error("La unión equidistante no tiene una intersección inequívoca.");
          const tangentContinuation = hits.length === 1 && hits[0].branch === 0 && (supports[i].kind === "circle" || supports[j].kind === "circle");
          joins.push({ kind: tangentContinuation ? "continuation" : "intersection", branch: hits[0].branch }); joints.push(hits[0].point);
        }
        const vertices = closed && sources.length > 1 ? [joints[joints.length - 1], ...joints.slice(0, -1)] : sources.length === 1 && offsetEntity(profile, sources[0].entityId).type === "circle" ? [] : [projectOffsetPoint(profile, sources[0], side, parameters.distance, ends(offsetEntity(profile, sources[0].entityId), sources[0].reversed)[0]), ...joints, projectOffsetPoint(profile, sources[sources.length - 1], side, parameters.distance, ends(offsetEntity(profile, sources[sources.length - 1].entityId), sources[sources.length - 1].reversed)[1])];
        const vertexIds = vertices.map(createPoint), centers = new Map<string, string>(), entityIds: string[] = [];
        sources.forEach((source, i) => {
          const original = offsetEntity(profile, source.entityId), id = allocate("entity");
          let entity: SketchEntity;
          if (original.type === "circle") {
            entity = { id, type: "circle", construction: outputConstruction, center: createPoint(offsetPoint(profile, original.center)), radius: (supports[i] as Extract<typeof supports[number], { kind: "circle" }>).radius };
          } else {
            const start = vertexIds[i], end = vertexIds[(i + 1) % vertexIds.length];
            if (original.type === "line") entity = { id, type: "line", construction: outputConstruction, start: source.reversed ? end : start, end: source.reversed ? start : end };
            else {
              if (!centers.has(original.center)) centers.set(original.center, createPoint(offsetPoint(profile, original.center)));
              entity = { id, type: "arc", construction: outputConstruction, center: centers.get(original.center)!, start: source.reversed ? end : start, end: source.reversed ? start : end, clockwise: original.clockwise };
            }
          }
          profile.entities.push(entity); entityIds.push(id); imageEntityIds.push(id);
        });
        const lineEnds: [boolean, boolean] = [offsetEntity(profile, sources[0].entityId).type === "line",
          offsetEntity(profile, sources[sources.length - 1].entityId).type === "line"];
        const hasLineEnds = !closed && cap === "none" && lineEnds.some(Boolean);
        images.push({ side, distance: parameters.distance, entityIds, joins,
          ...(hasLineEnds ? parameters.addDimensions ? { lineEndpointMode: "aligned" as const }
            : { lineEndpointFollowing: lineEnds } : {}) });
      }
      if (cap !== "none") for (const endIndex of [0, 1]) {
        const index = endIndex === 0 ? 0 : sources.length - 1, source = sources[index], entity = offsetEntity(profile, source.entityId), sourceEndpoint = ends(entity, source.reversed)[endIndex];
        const aId = ends(offsetEntity(profile, images[0].entityIds[index]), source.reversed)[endIndex], bId = images.length === 2 ? ends(offsetEntity(profile, images[1].entityIds[index]), source.reversed)[endIndex] : sourceEndpoint;
        const a = offsetPoint(profile, aId), b = offsetPoint(profile, bId), id = allocate("cap");
        let capEntity: SketchEntity;
        if (cap === "line") capEntity = { id, type: "line", construction: outputConstruction, start: aId, end: bId };
        else {
          const center = scaled(plus(a, b), .5), radial = minus(a, center), sourceSupport = support(profile, source, images[0].side, 0);
          let tangent: OffsetPoint;
          if (sourceSupport.kind === "line") tangent = sourceSupport.direction;
          else { const r = minus(offsetPoint(profile, sourceEndpoint), sourceSupport.center), cw = entity.type === "arc" && (entity.clockwise !== source.reversed); tangent = scaled({ x: -r.y, y: r.x }, (cw ? -1 : 1) / norm(r)); }
          const outward = scaled(tangent, endIndex === 0 ? -1 : 1), clockwise = dot2({ x: radial.y, y: -radial.x }, outward) > 0;
          capEntity = { id, type: "arc", construction: outputConstruction, center: createPoint(center), start: aId, end: bId, clockwise };
        }
        profile.entities.push(capEntity); capEntityIds.push(id);
      }
      if (parameters.construction === "source" || parameters.construction === "both") for (const source of sources) offsetEntity(profile, source.entityId).construction = true;
      const relationId = allocate("relation");
      const relation: SketchOffsetRelation = { id: relationId, type: "offset", sources, images, closed, cap, capEntityIds };
      profile.constraints.push(relation);
      const error = offsetGeometryError(profile, relation);
      if (error) return rejected(error);
      relations.push(relation); createdConstraintIds.push(relationId);
      components.push({ relationId, primaryEntityId, sourceEntityIds: sources.map(source => source.entityId), imageEntityIds, capEntityIds, distanceConstraintIds: [] });
      sourceEntityIds.push(...sources.map(source => source.entityId)); allImageEntityIds.push(...imageEntityIds); allCapEntityIds.push(...capEntityIds);
    }
    for (const side of sides) if (relations.length > 1) {
      const id = allocate("family");
      profile.constraints.push({ id, type: "equalOffsetDistance", members: relations.map(relation => ({ offsetId: relation.id, side })) });
      createdConstraintIds.push(id);
    }
    const symmetricSides = relations.some(relation => relation.cap === "arc" && relation.images.length === 2);
    if (parameters.addDimensions) for (let i = 0; i < sides.length; i++) {
      const id = allocate("distance");
      profile.constraints.push({ id, type: "offsetDistance", offsetId: relations[0].id, side: sides[i], value: parameters.distance, ...(i === 1 && symmetricSides ? { driven: true } : {}) });
      createdConstraintIds.push(id); components[0].distanceConstraintIds.push(id);
    }
    if (profile.points.length > SKETCH_LIMITS.maxPoints || profile.entities.length > SKETCH_LIMITS.maxEntities || profile.constraints.length > SKETCH_LIMITS.maxConstraints) return rejected("La equidistancia completa supera la capacidad del croquis.");
    return { changed: true, sourceProfile: input, profile: validateEntityProfile(profile), message: `${allImageEntityIds.length} entidades equidistantes en ${components.length} cadenas con separación compartida.`, selectedEntityIds, sourceEntityIds, imageEntityIds: allImageEntityIds, createdConstraintIds, capEntityIds: allCapEntityIds, components };
  } catch (error) { return rejected(error instanceof Error ? error.message : "No se puede preparar la equidistancia."); }
}
