import type { EntityProfile, SketchEntity, SketchPoint } from '../sketch/types';
import { resolveTrimmedCornerFillet, type FilletCornerGeometry, type FilletCornerSource } from '../sketch/fillet';
import { JOIN_TOLERANCE, type Curve, type Point2 } from './kernel.profile-curves';
import type { ResolvedThinWall } from './thinWall';

type Entry = { curve: Curve; reverse: boolean };
export interface ThinCornerChain { entries: Entry[]; closed: boolean }
type Point = { x: number; y: number };
type DirectedSource = FilletCornerSource;
type CornerPlan = { chain: number; joint: number; first: DirectedSource; second: DirectedSource;
  turn: -1 | 1; geometry: FilletCornerGeometry };
const TAU = Math.PI * 2;
const angular = (angle: number) => (angle % TAU + TAU) % TAU;
const identifier = (value: number) => String(value).padStart(6, '0');
const point = ([x, y]: Point2): Point => ({ x, y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const vector = (a: Point, b: Point): Point => ({ x: b.x - a.x, y: b.y - a.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const unit = (value: Point): Point => {
  const length = Math.hypot(value.x, value.y);
  if (!Number.isFinite(length) || length <= JOIN_TOLERANCE) throw new Error('Redondeo automático: un tramo está colapsado.');
  return { x: value.x / length, y: value.y / length };
};

function directed(entry: Entry, id: string): DirectedSource {
  const { curve, reverse } = entry;
  if (curve.type === 'circle') throw new Error('El redondeo automático requiere únicamente cadenas abiertas.');
  const start = point(reverse ? curve.end : curve.start), end = point(reverse ? curve.start : curve.end);
  return curve.type === 'line' ? { id, type: 'line', start, end }
    : { id, type: 'arc', start, end, center: point(curve.center), clockwise: (curve.sweep < 0) !== reverse };
}

function tangent(source: DirectedSource, endpoint: 'start' | 'end'): Point {
  if (source.type === 'line') return unit(vector(source.start, source.end));
  const radial = vector(source.center, source[endpoint]), direction = source.clockwise ? -1 : 1;
  return unit({ x: -radial.y * direction, y: radial.x * direction });
}

/** Validate both endpoint replacements against the same original finite interval. */
function validateRemainingSource(source: DirectedSource, start: Point, end: Point): void {
  if (source.type === 'line') {
    if (distance(start, end) <= JOIN_TOLERANCE
      || dot(vector(start, end), vector(source.start, source.end)) <= JOIN_TOLERANCE ** 2) {
      throw new Error('Los redondeos automáticos consumen o invierten una línea compartida.');
    }
    return;
  }
  const sign = source.clockwise ? -1 : 1, radius = distance(source.start, source.center);
  const angle = (position: Point) => Math.atan2(position.y - source.center.y, position.x - source.center.x);
  const total = angular(sign * (angle(source.end) - angle(source.start)));
  const position = (value: Point, endpoint: 'start' | 'end') => {
    if (value.x === source[endpoint].x && value.y === source[endpoint].y) return endpoint === 'start' ? 0 : total;
    return angular(sign * (angle(value) - angle(source.start)));
  };
  const first = position(start, 'start'), last = position(end, 'end'), tolerance = JOIN_TOLERANCE / radius;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last - first <= tolerance
    || first > total + tolerance || last > total + tolerance) {
    throw new Error('Los redondeos automáticos consumen, invierten o prolongan un arco compartido.');
  }
}

/**
 * Round an already-solved source, not its two wall contours independently. A
 * common source keeps the resulting wall arcs concentric and exactly one
 * thickness apart. All corner candidates and joint trim checks precede output.
 */
export function roundThinSource(chains: readonly ThinCornerChain[], wall: ResolvedThinWall): {
  profile: EntityProfile; identity: readonly unknown[];
} {
  const option = wall.definition.autoCorners;
  if (!option?.enabled || !Number.isFinite(option.radius) || option.radius <= 0) {
    throw new Error('El redondeo automático requiere una activación y un radio válidos.');
  }
  if (!chains.length || chains.some(chain => chain.closed)) {
    throw new Error('El redondeo automático requiere únicamente cadenas abiertas; no admite perfiles cerrados o mixtos.');
  }
  const profile: EntityProfile = { kind: 'entities', points: [], entities: [], constraints: [] };
  const sources: DirectedSource[] = [], plans: CornerPlan[] = [], roles: unknown[] = [];
  chains.forEach((chain, chainIndex) => {
    const prefix = `thin-corner-v1:c${identifier(chainIndex)}`;
    const directedSources = chain.entries.map((entry, index) => directed(entry, `${prefix}:a-source:${identifier(index)}`));
    directedSources.forEach(source => {
      const start = { ...source.start, id: source.id + ':start' }, end = { ...source.end, id: source.id + ':end' };
      profile.points.push(start, end);
      if (source.type === 'line') profile.entities.push({ id: source.id, type: 'line', start: start.id, end: end.id, construction: false });
      else {
        const center = { ...source.center, id: source.id + ':center' }; profile.points.push(center);
        profile.entities.push({ id: source.id, type: 'arc', start: start.id, end: end.id, center: center.id,
          clockwise: source.clockwise, construction: false });
      }
      sources.push(source);
    });
    const cornerRoles: unknown[] = [];
    for (let index = 0; index < directedSources.length - 1; index++) {
      const first = directedSources[index], second = directedSources[index + 1];
      const incoming = tangent(first, 'end'), outgoing = tangent(second, 'start');
      const cross = incoming.x * outgoing.y - incoming.y * outgoing.x, alignment = dot(incoming, outgoing);
      if (Math.abs(cross) <= 1e-12 && alignment > 0) {
        cornerRoles.push([index, 'tangent-continuation']); continue;
      }
      if (Math.abs(cross) <= 1e-12 && alignment <= 0) throw new Error('Una cúspide no define un redondeo automático inequívoco.');
      const turn = cross > 0 ? 1 : -1;
      // The requested radius belongs to the inner material wall. On a left
      // turn the source is n farther out; on a right turn it is p farther out.
      const radius = option.radius + (turn > 0 ? wall.negative : wall.positive);
      const geometry = resolveTrimmedCornerFillet(first, second, radius, turn < 0, JOIN_TOLERANCE);
      plans.push({ chain: chainIndex, joint: index, first, second, turn, geometry });
      cornerRoles.push([index, turn, geometry.branchIndex, geometry.branches]);
    }
    roles.push([chain.entries.map(({ curve, reverse }) => [curve.id, curve.type, reverse]), cornerRoles]);
  });
  const replacements = new Map<string, Partial<Record<'start' | 'end', Point>>>();
  const replace = (source: DirectedSource, endpoint: 'start' | 'end', value: Point) => {
    const endpoints = replacements.get(source.id) ?? {};
    if (endpoints[endpoint]) throw new Error('El redondeo automático repite un extremo físico.');
    endpoints[endpoint] = value; replacements.set(source.id, endpoints);
  };
  for (const { first, second, geometry } of plans) {
    replace(first, 'end', geometry.contacts[0]); replace(second, 'start', geometry.contacts[1]);
  }
  for (const source of sources) {
    const changes = replacements.get(source.id);
    validateRemainingSource(source, changes?.start ?? source.start, changes?.end ?? source.end);
  }
  const entities = new Map(profile.entities.map(entity => [entity.id, entity]));
  for (const { chain, joint, first, second, geometry } of plans) {
    const prefix = `thin-corner-v1:c${identifier(chain)}:b-round:${identifier(joint)}`;
    const add = (role: string, value: Point): SketchPoint => {
      const created = { ...value, id: `${prefix}:${role}` }; profile.points.push(created); return created;
    };
    const start = add('in', geometry.contacts[0]), end = add('out', geometry.contacts[1]), center = add('center', geometry.center);
    if (distance(start, end) <= JOIN_TOLERANCE) throw new Error('El redondeo automático es menor que la tolerancia de unión.');
    const incoming = entities.get(first.id)!, outgoing = entities.get(second.id)!;
    if (incoming.type === 'circle' || outgoing.type === 'circle') throw new Error('Fuente circular inesperada en un redondeo abierto.');
    incoming.end = start.id; outgoing.start = end.id;
    const fillet: SketchEntity = { id: prefix, type: 'arc', start: start.id, end: end.id, center: center.id,
      clockwise: geometry.clockwise, construction: false };
    profile.entities.push(fillet);
  }
  return { profile, identity: ['thin-corners-v1', roles] };
}
