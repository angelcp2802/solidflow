import type { EntityProfile, SketchEntity, SketchPoint, SketchSelection } from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";
import { createSketchIdAllocator } from "./ids";

export interface MirrorParameters {
  axisEntityId: string;
  /** Explicitly reuse these source points on the axis; never join unrelated identities. */
  joinPointIds?: readonly string[];
}
export interface MirrorPlan {
  changed: boolean;
  /** Ephemeral guard against committing a preview of an older solved sketch. */
  sourceProfile: EntityProfile;
  profile: EntityProfile;
  message: string;
  axisEntityId: string;
  sourceEntityIds: string[];
  imageEntityIds: string[];
  pointMap: Record<string, string>;
  entityMap: Record<string, string>;
  createdConstraintIds: string[];
  joinedPointIds: string[];
}

export const MIRROR_TOLERANCE = 1e-7;
const MIN_AXIS_LENGTH = 1e-6;
const refs = (entity: SketchEntity): string[] => entity.type === "line"
  ? [entity.start, entity.end] : entity.type === "circle"
    ? [entity.center] : [entity.center, entity.start, entity.end];
const point = (profile: EntityProfile, id: string): SketchPoint => id === "origin"
  ? { id, x: 0, y: 0 } : profile.points.find(p => p.id === id)!;

function axisGeometry(profile: EntityProfile, axisId: string) {
  const axis = profile.entities.find(entity => entity.id === axisId);
  if (axis?.type !== "line") throw new Error("Elige una línea recta como eje de simetría.");
  // A consistent reference endpoint also makes reversed-axis previews bitwise stable.
  const [aId, bId] = [axis.start, axis.end].sort();
  const a = point(profile, aId), b = point(profile, bId);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < MIN_AXIS_LENGTH) throw new Error("El eje de simetría tiene longitud nula o demasiado pequeña.");
  const ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
  return {
    axis,
    distance: (p: SketchPoint) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux),
    reflect: (p: SketchPoint) => {
      const along = (p.x - a.x) * ux + (p.y - a.y) * uy;
      return { x: 2 * (a.x + along * ux) - p.x, y: 2 * (a.y + along * uy) - p.y };
    },
  };
}

/** Source points eligible for explicit seam sharing, including centers and origin. */
export function mirrorAxisPointIds(profile: EntityProfile, entityIds: string[], axisId: string): string[] {
  try {
    const geometry = axisGeometry(profile, axisId);
    return [...new Set(profile.entities.filter(entity => entityIds.includes(entity.id)).flatMap(refs))]
      .filter(id => geometry.distance(point(profile, id)) <= MIRROR_TOLERANCE).sort();
  } catch { return []; }
}

function sameGeometry(profile: EntityProfile, a: SketchEntity, b: SketchEntity): boolean {
  if (a.type !== b.type || a.construction !== b.construction) return false;
  const near = (aId: string, bId: string) => {
    const p = point(profile, aId), q = point(profile, bId);
    return Math.hypot(p.x - q.x, p.y - q.y) <= MIRROR_TOLERANCE;
  };
  if (a.type === "line" && b.type === "line")
    return near(a.start, b.start) && near(a.end, b.end) || near(a.start, b.end) && near(a.end, b.start);
  if (a.type === "circle" && b.type === "circle")
    return near(a.center, b.center) && Math.abs(a.radius - b.radius) <= MIRROR_TOLERANCE;
  return a.type === "arc" && b.type === "arc" && near(a.center, b.center) && (
    a.clockwise === b.clockwise && near(a.start, b.start) && near(a.end, b.end) ||
    a.clockwise !== b.clockwise && near(a.start, b.end) && near(a.end, b.start)
  );
}

/** Detached proposal. It consumes displayed solved geometry and never solves or edits it. */
export function planSketchMirror(input: EntityProfile, selection: SketchSelection[], parameters: MirrorParameters): MirrorPlan {
  const rejected = (message: string): MirrorPlan => ({
    changed: false, sourceProfile: input, profile: input, message,
    axisEntityId: parameters?.axisEntityId ?? "", sourceEntityIds: [], imageEntityIds: [],
    pointMap: {}, entityMap: {}, createdConstraintIds: [], joinedPointIds: [],
  });
  try {
    const profile = validateEntityProfile(input);
    if (!parameters || typeof parameters.axisEntityId !== "string") return rejected("Elige el eje de simetría.");
    if (!selection.length || selection.some(item => item.kind !== "entity"))
      return rejected("Selecciona una o varias líneas, círculos o arcos para reflejar.");
    const sourceIds = selection.map(item => item.id);
    if (new Set(sourceIds).size !== sourceIds.length) return rejected("La selección contiene entidades repetidas.");
    if (sourceIds.includes(parameters.axisEntityId)) return rejected("El eje no puede formar parte de las entidades que se reflejan.");
    const geometry = axisGeometry(profile, parameters.axisEntityId);
    const sources = sourceIds.sort().map(id => profile.entities.find(entity => entity.id === id));
    if (sources.some(entity => !entity)) return rejected("Alguna entidad seleccionada ya no existe.");
    const sourcePoints = [...new Set(sources.flatMap(entity => refs(entity!)))].sort();
    const joins = parameters.joinPointIds ?? [];
    if (!Array.isArray(joins) || new Set(joins).size !== joins.length ||
      joins.some(id => !sourcePoints.includes(id) || geometry.distance(point(profile, id)) > MIRROR_TOLERANCE))
      return rejected("Solo se pueden compartir puntos fuente que estén sobre el eje.");
    const joinSet = new Set(joins);
    const allocate = createSketchIdAllocator(profile, "mirror");
    const pointMap = new Map<string, string>();
    const createdConstraintIds: string[] = [];
    for (const sourceId of sourcePoints) {
      if (joinSet.has(sourceId)) {
        pointMap.set(sourceId, sourceId);
        if (![geometry.axis.start, geometry.axis.end].includes(sourceId) && !profile.constraints.some(c =>
          c.type === "pointOnLine" && c.pointId === sourceId && c.entityId === geometry.axis.id)) {
          const id = allocate("seam");
          profile.constraints.push({ id, type: "pointOnLine", pointId: sourceId, entityId: geometry.axis.id });
          createdConstraintIds.push(id);
        }
      } else {
        const imageId = allocate("point");
        profile.points.push({ id: imageId, ...geometry.reflect(point(profile, sourceId)) });
        pointMap.set(sourceId, imageId);
        const id = allocate("relation");
        profile.constraints.push({ id, type: "symmetric", a: sourceId, b: imageId, axisId: geometry.axis.id });
        createdConstraintIds.push(id);
      }
    }
    const entityMap = new Map<string, string>();
    const imageEntityIds: string[] = [];
    for (const source of sources as SketchEntity[]) {
      const id = allocate("entity");
      const image: SketchEntity = source.type === "line"
        ? { ...source, id, start: pointMap.get(source.start)!, end: pointMap.get(source.end)! }
        : source.type === "circle"
          ? { ...source, id, center: pointMap.get(source.center)! }
          : { ...source, id, center: pointMap.get(source.center)!, start: pointMap.get(source.start)!, end: pointMap.get(source.end)!, clockwise: !source.clockwise };
      if (profile.entities.some(entity => sameGeometry(profile, entity, image)))
        return rejected("Una imagen coincide con otra entidad. Cambia la selección o el eje para evitar duplicados.");
      profile.entities.push(image);
      entityMap.set(source.id, id);
      imageEntityIds.push(id);
      if (source.type === "circle") {
        const relationId = allocate("radius");
        profile.constraints.push({ id: relationId, type: "equal", a: source.id, b: id });
        createdConstraintIds.push(relationId);
      }
      if (source.type === "arc") {
        const relationId = allocate("direction");
        profile.constraints.push({ id: relationId, type: "mirrorArcDirection", a: source.id, b: id, axisId: geometry.axis.id });
        createdConstraintIds.push(relationId);
      }
    }
    if (profile.points.length > SKETCH_LIMITS.maxPoints || profile.entities.length > SKETCH_LIMITS.maxEntities ||
      profile.constraints.length > SKETCH_LIMITS.maxConstraints)
      return rejected("La simetría completa supera la capacidad del croquis. No se ha añadido ninguna entidad.");
    return {
      changed: true, sourceProfile: input, profile: validateEntityProfile(profile),
      message: `${imageEntityIds.length} entidades reflejadas con relaciones de simetría.`,
      axisEntityId: geometry.axis.id, sourceEntityIds: sources.map(entity => entity!.id),
      imageEntityIds, pointMap: Object.fromEntries(pointMap), entityMap: Object.fromEntries(entityMap),
      createdConstraintIds, joinedPointIds: [...joins].sort(),
    };
  } catch (error) { return rejected(error instanceof Error ? error.message : "No se puede preparar la simetría."); }
}
