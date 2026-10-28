import type { PlaneFrame, SketchFeature, SketchVisual } from './kernel.types';
import { clonePlaneFrame, framePoint, principalPlaneFrame } from './kernel.frames';

type Point2 = [number, number];
const TAU = Math.PI * 2;
const positiveAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** Display tessellation only. Solid modelling always uses the native analytic curves. */
export function sketchVisual(feature: SketchFeature, frame: PlaneFrame = principalPlaneFrame(feature.plane, feature.offset)): SketchVisual {
  const visual: SketchVisual = { id: feature.id, frame: clonePlaneFrame(frame), lines: [], constructionLines: [] };
  const toWorld = ([u, v]: Point2) => framePoint(frame, u, v);
  const line = (a: Point2, b: Point2, construction = false) => {
    (construction ? visual.constructionLines : visual.lines).push(...toWorld(a), ...toWorld(b));
  };
  const circular = (center: Point2, radius: number, angle: number, sweep: number, construction = false,
    start?: Point2, end?: Point2) => {
    const step = Math.min(Math.PI / 24, 2 * Math.acos(Math.max(-1, 1 - .08 / radius)));
    const count = Math.min(2048, Math.max(2, Math.ceil(Math.abs(sweep) / step)));
    const at = (t: number): Point2 => [center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)];
    let previous = start ?? at(angle);
    for (let index = 1; index <= count; index++) {
      const next = index === count && end ? end : at(angle + sweep * index / count);
      line(previous, next, construction);
      previous = next;
    }
  };
  const profile = feature.profile;
  if (profile.kind === 'rectangle') {
    const [x, y] = profile.center, halfWidth = profile.width / 2, halfHeight = profile.height / 2;
    const corners: Point2[] = [[x - halfWidth, y - halfHeight], [x + halfWidth, y - halfHeight],
      [x + halfWidth, y + halfHeight], [x - halfWidth, y + halfHeight]];
    corners.forEach((point, index) => line(point, corners[(index + 1) % corners.length]));
  } else if (profile.kind === 'circle') {
    circular(profile.center, profile.radius, 0, TAU);
  } else {
    const points = new Map(profile.points.map((point) => [point.id, [point.x, point.y] as Point2]));
    points.set('origin', [0, 0]);
    const point = (id: string): Point2 => {
      const value = points.get(id);
      if (!value) throw new Error(`No se encuentra el punto ${id} del croquis.`);
      return value;
    };
    const entityCounts = new Map<string, number>();
    for (const entity of profile.entities) entityCounts.set(entity.id, (entityCounts.get(entity.id) ?? 0) + 1);
    for (const entity of profile.entities) {
      if (entity.type === 'line') {
        const start = point(entity.start), end = point(entity.end);
        line(start, end, entity.construction);
        // Only an actual solved LINE entity receives a selectable identity.
        // Arc/circle tessellation and primitive rectangle segments do not.
        if (entityCounts.get(entity.id) === 1
          && [...start, ...end].every(Number.isFinite) && Math.hypot(end[0] - start[0], end[1] - start[1]) > 1e-5) {
          const from = toWorld(start), to = toWorld(end);
          if ([...from, ...to].every(Number.isFinite)) {
            (visual.lineEntities ??= []).push({ entityId: entity.id, start: from, end: to, construction: entity.construction });
          }
        }
      } else if (entity.type === 'circle') circular(point(entity.center), entity.radius, 0, TAU, entity.construction);
      else {
        const center = point(entity.center), start = point(entity.start), end = point(entity.end);
        const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
        const angle = Math.atan2(start[1] - center[1], start[0] - center[0]);
        const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
        const sweep = entity.clockwise ? -positiveAngle(angle - endAngle) : positiveAngle(endAngle - angle);
        circular(center, radius, angle, sweep, entity.construction, start, end);
      }
    }
  }
  return visual;
}
