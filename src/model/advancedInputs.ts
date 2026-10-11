import type {
  LoftSection,
  SketchFeature,
  SweepPathSegment,
} from "../cad/kernel.types";
import type { SketchPoint } from "../sketch/types";
import { solveSketch } from "../sketch/solver";
import { orderedSweepPath } from "./featureInputs";

/** Use the same resolved coordinates that the kernel displays and builds. */
export function resolvedSweepPath(sketch: SketchFeature): SweepPathSegment[] {
  if (sketch.profile.kind !== "entities") return orderedSweepPath(sketch);
  const solved = solveSketch(sketch.profile);
  if (solved.status !== "underdefined" && solved.status !== "fullyDefined") {
    throw new Error(
      `No se puede resolver el croquis (${solved.status}): ${solved.message}`,
    );
  }
  return orderedSweepPath({ ...sketch, profile: solved.profile });
}

const SEAM_POINT_TOLERANCE = 1e-8;
const compareId = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;
interface SeamCandidate {
  entityId: string;
  reversed: boolean;
  point: SketchPoint;
  tangentAngle: number;
}

/**
 * Choose a geometric seam only when a section is first selected. The returned
 * entity ID and direction must remain stored through subsequent dimension edits.
 * Use the lowest endpoint, then the leftmost, then the outgoing tangent closest
 * counterclockwise to local +X. IDs only break geometrically indistinguishable ties.
 */
export function initialLoftSection(sketch: SketchFeature): LoftSection {
  const section: LoftSection = {
    sketchId: sketch.id,
    startEntityId: null,
    reversed: false,
  };
  if (sketch.profile.kind !== "entities") return section;
  const solved = solveSketch(sketch.profile);
  // Invalid geometry is diagnosed by the model preview. Still allow the property
  // panel to open so the user can choose a different section without an exception.
  const profile =
    solved.status === "underdefined" || solved.status === "fullyDefined"
      ? solved.profile
      : sketch.profile;
  const entities = profile.entities.filter((entity) => !entity.construction);
  const fallback = [...entities].sort((a, b) => compareId(a.id, b.id))[0];
  if (!fallback) return section;
  if (entities.length === 1 && fallback.type === "circle") {
    return { ...section, startEntityId: fallback.id };
  }
  const points = new Map(profile.points.map((point) => [point.id, point]));
  points.set("origin", { id: "origin", x: 0, y: 0 });
  const candidates: SeamCandidate[] = [];
  for (const entity of entities) {
    if (entity.type === "circle") continue;
    const start = points.get(entity.start),
      end = points.get(entity.end);
    if (!start || !end) continue;
    for (const reversed of [false, true]) {
      const point = reversed ? end : start;
      let dx: number, dy: number;
      if (entity.type === "line") {
        const other = reversed ? start : end;
        dx = other.x - point.x;
        dy = other.y - point.y;
      } else {
        const center = points.get(entity.center);
        if (!center) continue;
        const direction = (entity.clockwise ? -1 : 1) * (reversed ? -1 : 1);
        dx = -(point.y - center.y) * direction;
        dy = (point.x - center.x) * direction;
      }
      if (
        ![point.x, point.y, dx, dy].every(Number.isFinite) ||
        Math.hypot(dx, dy) === 0
      )
        continue;
      const angle = Math.atan2(dy, dx);
      candidates.push({
        entityId: entity.id,
        reversed,
        point,
        tangentAngle: angle < 0 ? angle + 2 * Math.PI : angle,
      });
    }
  }
  if (!candidates.length) return { ...section, startEntityId: fallback.id };
  // Anchor each tolerance group at its actual minimum, avoiding a non-transitive
  // approximate comparator or dependence on the sketch's entity array order.
  const minimumY = Math.min(
    ...candidates.map((candidate) => candidate.point.y),
  );
  const lowest = candidates.filter(
    (candidate) => candidate.point.y - minimumY <= SEAM_POINT_TOLERANCE,
  );
  const minimumX = Math.min(...lowest.map((candidate) => candidate.point.x));
  const first = lowest
    .filter((candidate) => candidate.point.x - minimumX <= SEAM_POINT_TOLERANCE)
    .sort(
      (a, b) =>
        a.tangentAngle - b.tangentAngle ||
        compareId(a.entityId, b.entityId) ||
        Number(a.reversed) - Number(b.reversed),
    )[0];
  return {
    ...section,
    startEntityId: first.entityId,
    reversed: first.reversed,
  };
}
