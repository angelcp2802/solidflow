import type { EntityProfile } from '../sketch/types';
import type { Profile } from './kernel.types';

export type Point2 = [number, number];
type Line = { id: string; type: 'line'; start: Point2; end: Point2; nodes: [number, number] };
type Circular = { id: string; type: 'circle' | 'arc'; center: Point2; radius: number;
  start: Point2; end: Point2; angle: number; sweep: number; nodes?: [number, number] };
export type Curve = Line | Circular;
export type Contour = { curves: { curve: Curve; reverse: boolean }[] };
export const JOIN_TOLERANCE = 1e-5;
const TAU = Math.PI * 2;
const distance = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0];
const subtract = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const normalizeAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;
export const circlePoint = (curve: Circular, angle: number): Point2 => [
  curve.center[0] + curve.radius * Math.cos(angle), curve.center[1] + curve.radius * Math.sin(angle),
];

export function onCircularArc(curve: Circular, point: Point2): boolean {
  if (curve.type === 'circle') return true;
  if (distance(point, curve.start) <= JOIN_TOLERANCE || distance(point, curve.end) <= JOIN_TOLERANCE) return true;
  const angle = Math.atan2(point[1] - curve.center[1], point[0] - curve.center[0]);
  const delta = normalizeAngle(curve.sweep > 0 ? angle - curve.angle : curve.angle - angle);
  return delta <= Math.abs(curve.sweep) + JOIN_TOLERANCE / curve.radius;
}

function circularIntervals(curve: Circular): [number, number][] {
  if (curve.type === 'circle') return [[0, TAU]];
  const start = normalizeAngle(curve.sweep > 0 ? curve.angle : curve.angle + curve.sweep);
  const end = start + Math.abs(curve.sweep);
  return end <= TAU ? [[start, end]] : [[start, TAU], [0, end - TAU]];
}

export function profileCurveIntersections(first: Curve, second: Curve): Point2[] {
  if (first.type === 'line' && second.type === 'line') {
    const u = subtract(first.end, first.start), v = subtract(second.end, second.start);
    const between = subtract(second.start, first.start), divisor = cross(u, v);
    const firstLength = Math.hypot(...u), secondLength = Math.hypot(...v);
    if (Math.abs(divisor) < 1e-12 * firstLength * secondLength) {
      if (Math.abs(cross(between, u)) / firstLength > JOIN_TOLERANCE) return [];
      const projection = (point: Point2) => ((point[0] - first.start[0]) * u[0] + (point[1] - first.start[1]) * u[1]) / firstLength;
      const interval = [projection(second.start), projection(second.end)].sort((a, b) => a - b);
      const lower = Math.max(0, interval[0]), upper = Math.min(firstLength, interval[1]);
      if (upper < lower - JOIN_TOLERANCE) return [];
      if (upper - lower > JOIN_TOLERANCE) throw new Error('El croquis contiene líneas superpuestas. Elimina los duplicados.');
      return [[first.start[0] + u[0] * lower / firstLength, first.start[1] + u[1] * lower / firstLength]];
    }
    const t = cross(between, v) / divisor, s = cross(between, u) / divisor;
    if (t < -JOIN_TOLERANCE / firstLength || t > 1 + JOIN_TOLERANCE / firstLength ||
      s < -JOIN_TOLERANCE / secondLength || s > 1 + JOIN_TOLERANCE / secondLength) return [];
    return [[first.start[0] + t * u[0], first.start[1] + t * u[1]]];
  }
  if (first.type === 'line' || second.type === 'line') {
    const line = first.type === 'line' ? first : second as Line;
    const circle = first.type === 'line' ? second as Circular : first;
    const direction = subtract(line.end, line.start), length = Math.hypot(...direction);
    const unit: Point2 = [direction[0] / length, direction[1] / length];
    const toCenter = subtract(circle.center, line.start);
    const projection = toCenter[0] * unit[0] + toCenter[1] * unit[1];
    const perpendicular = Math.abs(cross(toCenter, unit));
    if (perpendicular > circle.radius + JOIN_TOLERANCE) return [];
    const delta = Math.sqrt(Math.max(0, circle.radius ** 2 - perpendicular ** 2));
    return [...new Set([projection - delta, projection + delta])]
      .filter((t) => t >= -JOIN_TOLERANCE && t <= length + JOIN_TOLERANCE)
      .map((t): Point2 => [line.start[0] + t * unit[0], line.start[1] + t * unit[1]])
      .filter((point) => onCircularArc(circle, point));
  }
  const d = distance(first.center, second.center);
  if (d <= JOIN_TOLERANCE && Math.abs(first.radius - second.radius) <= JOIN_TOLERANCE) {
    const hits: Point2[] = [];
    for (const a of circularIntervals(first)) for (const b of circularIntervals(second)) {
      const lower = Math.max(a[0], b[0]), upper = Math.min(a[1], b[1]);
      if ((upper - lower) * first.radius > JOIN_TOLERANCE) throw new Error('El croquis contiene arcos o círculos superpuestos.');
      if ((upper - lower) * first.radius >= -JOIN_TOLERANCE) hits.push(circlePoint(first, lower));
    }
    // The periodic seam is also a possible shared endpoint.
    for (const point of [first.start, first.end, second.start, second.end]) {
      if (onCircularArc(first, point) && onCircularArc(second, point)) hits.push(point);
    }
    return hits;
  }
  if (d <= JOIN_TOLERANCE || d > first.radius + second.radius + JOIN_TOLERANCE ||
    d < Math.abs(first.radius - second.radius) - JOIN_TOLERANCE) return [];
  const along = (first.radius ** 2 - second.radius ** 2 + d ** 2) / (2 * d);
  const height = Math.sqrt(Math.max(0, first.radius ** 2 - along ** 2));
  const unit: Point2 = [(second.center[0] - first.center[0]) / d, (second.center[1] - first.center[1]) / d];
  const base: Point2 = [first.center[0] + along * unit[0], first.center[1] + along * unit[1]];
  return [-1, 1].map((sign): Point2 => [base[0] - sign * height * unit[1], base[1] + sign * height * unit[0]])
    .filter((point) => onCircularArc(first, point) && onCircularArc(second, point));
}

/** Shared analytic validation for selected open paths and closed material contours. */
export function makeProfileCurves(profile: EntityProfile, derivedArcs = false): { curves: Curve[]; nodes: Point2[] } {
  const points = new Map(profile.points.map((point) => [point.id, [point.x, point.y] as Point2]));
  points.set('origin', [0, 0]);
  const nodes: Point2[] = [];
  const node = (point: Point2): number => {
    const matches = nodes.flatMap((candidate, index) => distance(candidate, point) <= JOIN_TOLERANCE ? [index] : []);
    if (matches.length > 1) throw new Error('Hay extremos demasiado próximos para identificar un contorno sin ambigüedad.');
    if (matches.length) return matches[0];
    nodes.push(point);
    return nodes.length - 1;
  };
  const point = (id: string): Point2 => {
    const found = points.get(id);
    if (!found) throw new Error(`No se encuentra el punto ${id}.`);
    return found;
  };
  const curves: Curve[] = profile.entities.filter((entity) => !entity.construction).map((entity): Curve => {
    if (entity.type === 'circle') {
      const center = point(entity.center), start: Point2 = [center[0] + entity.radius, center[1]];
      return { id: entity.id, type: 'circle', center, radius: entity.radius, start, end: start, angle: 0, sweep: TAU };
    }
    const ids: [number, number] = [node(point(entity.start)), node(point(entity.end))];
    const start = nodes[ids[0]], end = nodes[ids[1]];
    if (ids[0] === ids[1]) throw new Error('Una línea o arco tiene extremos coincidentes. Usa un círculo para un contorno circular completo.');
    if (entity.type === 'line') return { id: entity.id, type: 'line', start, end, nodes: ids };
    const center = point(entity.center), radius = distance(center, start);
    if (radius < (derivedArcs ? JOIN_TOLERANCE : .01) || Math.abs(radius - distance(center, end)) > JOIN_TOLERANCE * 2) {
      throw new Error('El arco no tiene un radio válido y constante tras resolver el croquis.');
    }
    const angle = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
    const sweep = entity.clockwise ? -normalizeAngle(angle - endAngle) : normalizeAngle(endAngle - angle);
    return { id: entity.id, type: 'arc', center, radius, start, end, angle, sweep, nodes: ids };
  });
  if (!curves.length) throw new Error('El croquis está vacío o sólo contiene geometría de construcción. Dibuja un contorno cerrado.');
  for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
    const first = curves[i], second = curves[j];
    for (const hit of profileCurveIntersections(first, second)) {
      const sharedEndpoint = first.nodes && second.nodes && first.nodes.some((id) =>
        second.nodes!.includes(id) && distance(nodes[id], hit) <= JOIN_TOLERANCE * 2);
      if (!sharedEndpoint) throw new Error('Los contornos se cruzan o se tocan. Separa las intersecciones y los contactos ambiguos.');
    }
  }
  return { curves, nodes };
}

/** Classify resolved geometry, not nominal point IDs or an unsolved draft. */
export function analyzeThinWallProfile(profile: Profile): { topology: 'open' | 'closed' | 'invalid'; openOnly: boolean; closedSingle?: true } {
  const invalid = { topology: 'invalid' as const, openOnly: false };
  if (profile.kind !== 'entities') {
    const dimensions = profile.kind === 'circle' ? [profile.radius] : [profile.width, profile.height];
    return [...profile.center, ...dimensions].every(Number.isFinite) && dimensions.every((value) => value > JOIN_TOLERANCE)
      ? { topology: 'closed', openOnly: false, closedSingle: true } : invalid;
  }
  if (profile.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    || profile.entities.some((entity) => entity.type === 'circle' && (!Number.isFinite(entity.radius) || entity.radius <= JOIN_TOLERANCE))) return invalid;
  try {
    const { curves, nodes } = makeProfileCurves(profile);
    if (new Set(curves.map((curve) => curve.id)).size !== curves.length) return invalid;
    const adjacency = nodes.map(() => [] as number[]);
    curves.forEach((curve, index) => curve.nodes?.forEach((node) => adjacency[node].push(index)));
    if (adjacency.some((edges) => edges.length > 2)) return invalid;
    let open = false, closedCount = curves.filter(curve => !curve.nodes).length;
    const seen = new Set<number>();
    for (let index = 0; index < curves.length; index++) {
      if (seen.has(index) || !curves[index].nodes) continue;
      const component = new Set<number>(), pending = [index];
      while (pending.length) {
        const next = pending.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        for (const node of curves[next].nodes!) {
          component.add(node); pending.push(...adjacency[node]);
        }
      }
      const endpoints = [...component].filter((node) => adjacency[node].length === 1).length;
      if (endpoints !== 0 && endpoints !== 2) return invalid;
      if (endpoints === 2) open = true;
      else closedCount++;
    }
    return { topology: open ? 'open' : 'closed', openOnly: open && closedCount === 0,
      ...(!open && closedCount === 1 ? { closedSingle: true as const } : {}) };
  } catch { return invalid; }
}

export function classifyThinWallProfile(profile: Profile): 'open' | 'closed' | 'invalid' {
  return analyzeThinWallProfile(profile).topology;
}
