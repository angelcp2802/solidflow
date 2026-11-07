import type { EntityProfile, OffsetSource, SketchEntity } from '../sketch/types';
import {
  dot2, minus, norm, projectOffsetPoint, sameSupport, support, supportIntersections,
  type OffsetPoint,
} from '../sketch/offset-geometry';
import type { SketchFeature } from './kernel.types';
import { JOIN_TOLERANCE, makeContours, makeProfileCurves, type Contour, type Curve, type Point2 } from './kernel.profiles';
import { profileCurveIntersections } from './kernel.profile-curves';
import type { ResolvedThinWall } from './thinWall';
import { roundThinSource } from './kernel.thin-corners';

const TAU = Math.PI * 2;
const AREA_TOLERANCE = JOIN_TOLERANCE ** 2;
const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const distance = (a: Point2, b: Point2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const positiveAngle = (angle: number) => (angle % TAU + TAU) % TAU;
const point2 = (point: OffsetPoint): Point2 => [point.x, point.y];
type Entry = { curve: Curve; reverse: boolean };
type Chain = { entries: Entry[]; closed: boolean };
type Image = { vertices: Point2[]; radii: (number | undefined)[]; joins: unknown[] };

/** Exact Green integral, including circular sectors rather than tessellated chords. */
export function thinContourArea(contour: Contour): number {
  // Translate before the integral: a small wall far from the origin must not
  // subtract products of large absolute sketch coordinates.
  const origin = contour.curves[0].curve.start;
  const relative = (point: Point2): Point2 => [point[0] - origin[0], point[1] - origin[1]];
  return contour.curves.reduce((sum, { curve, reverse }) => {
    const start = relative(curve.start), end = relative(curve.end);
    if (curve.type === 'line') {
      const value = start[0] * end[1] - end[0] * start[1];
      return sum + (reverse ? -value : value) / 2;
    }
    const center = relative(curve.center);
    const value = center[0] * (end[1] - start[1]) - center[1] * (end[0] - start[0]) + curve.radius ** 2 * curve.sweep;
    return sum + (reverse ? -value : value) / 2;
  }, 0);
}

/** Horizontal-ray winding with half-open endpoint roles for lines and exact arcs. */
function contains(contour: Contour, point: Point2): boolean {
  let winding = 0;
  for (const { curve, reverse } of contour.curves) {
    const start = reverse ? curve.end : curve.start, end = reverse ? curve.start : curve.end;
    if (curve.type === 'line') {
      if ((start[1] > point[1]) === (end[1] > point[1])) continue;
      const x = start[0] + (point[1] - start[1]) * (end[0] - start[0]) / (end[1] - start[1]);
      if (x > point[0]) winding += end[1] > start[1] ? 1 : -1;
      continue;
    }
    const relative = (point[1] - curve.center[1]) / curve.radius;
    if (relative < -1 || relative > 1) continue;
    const angle = reverse ? curve.angle + curve.sweep : curve.angle;
    const sweep = reverse ? -curve.sweep : curve.sweep;
    const root = Math.asin(relative), roots = Math.abs(relative) === 1 ? [root] : [root, Math.PI - root];
    for (const root of roots) {
      const travelled = sweep > 0 ? positiveAngle(root - angle) : positiveAngle(angle - root);
      const position = travelled / Math.abs(sweep);
      const derivative = Math.cos(root) * sweep;
      const atStart = travelled < 1e-12, atEnd = Math.abs(travelled - Math.abs(sweep)) < 1e-12;
      if (position > 1 && !atEnd) continue;
      if (Math.abs(Math.cos(root)) <= 1e-12) {
        // A minimum at an ARC endpoint has only one incident circular side.
        // It must balance the adjoining cap/line at the same ray height. An
        // interior tangent has two sides and contributes no crossing.
        if (relative < 0 && curve.center[0] > point[0] && curve.type === 'arc') {
          if (atStart && !atEnd) winding++;
          else if (atEnd && !atStart) winding--;
        }
        continue;
      }
      if (derivative > 0 && atEnd || derivative < 0 && atStart) continue;
      if (curve.center[0] + curve.radius * Math.cos(root) > point[0]) winding += derivative > 0 ? 1 : -1;
    }
  }
  return winding !== 0;
}

function reverseEntries(entries: Entry[]): Entry[] {
  return [...entries].reverse().map(({ curve, reverse }) => ({ curve, reverse: !reverse }));
}

function chains(curves: Curve[], nodes: Point2[]): Chain[] {
  const adjacency = nodes.map(() => [] as Curve[]);
  for (const curve of curves) for (const node of curve.nodes ?? []) adjacency[node].push(curve);
  if (adjacency.some((edges) => edges.length > 2)) throw new Error('Pared delgada: el perfil contiene una ramificación.');
  const used = new Set<string>(), result: Chain[] = [];
  for (const first of [...curves].sort(byId)) {
    if (used.has(first.id)) continue;
    if (!first.nodes) {
      used.add(first.id);
      result.push({ entries: [{ curve: first, reverse: false }], closed: true });
      continue;
    }
    const members = new Set<Curve>(), pending = [first];
    while (pending.length) {
      const curve = pending.pop()!;
      if (members.has(curve)) continue;
      members.add(curve);
      for (const node of curve.nodes!) pending.push(...adjacency[node]);
    }
    const endpoints = [...new Set([...members].flatMap((curve) => curve.nodes!))]
      .filter((node) => adjacency[node].length === 1);
    const closed = endpoints.length === 0;
    if (!closed && endpoints.length !== 2) throw new Error('Pared delgada: la cadena debe tener exactamente dos extremos.');
    const initial = closed ? first.nodes[0] : endpoints[0];
    let current = initial;
    let entries: Entry[] = [];
    while (entries.length < members.size) {
      const next = adjacency[current].filter((curve) => !used.has(curve.id)).sort(byId)[0];
      if (!next) break;
      const reverse = next.nodes![0] !== current;
      used.add(next.id);
      entries.push({ curve: next, reverse });
      current = next.nodes![reverse ? 0 : 1];
    }
    if (entries.length !== members.size || closed && current !== initial) throw new Error('Pared delgada: no se puede ordenar la cadena.');
    if (closed) {
      const area = thinContourArea({ curves: entries });
      if (!Number.isFinite(area) || Math.abs(area) <= AREA_TOLERANCE) throw new Error('Pared delgada: el contorno cerrado no delimita un área positiva.');
      if (area < 0) entries = reverseEntries(entries);
      const primary = entries.findIndex(({ curve }) => curve.id === first.id);
      entries = [...entries.slice(primary), ...entries.slice(0, primary)];
    } else if (entries.find(({ curve }) => curve.id === first.id)!.reverse) {
      // A stable source role owns the chain direction; entity-array order does not.
      entries = reverseEntries(entries);
    }
    result.push({ entries, closed });
  }
  return result;
}

function entityProfile(sketch: SketchFeature): EntityProfile {
  if (sketch.profile.kind === 'entities') return {
    kind: 'entities', points: sketch.profile.points.map((point) => ({ ...point })),
    entities: sketch.profile.entities.map((entity) => ({ ...entity })).sort(byId), constraints: [],
  };
  const profile = sketch.profile;
  if (profile.kind === 'circle') return {
    kind: 'entities', points: [{ id: 'thin-source-center', x: profile.center[0], y: profile.center[1] }],
    entities: [{ id: 'thin-source-circle', type: 'circle', center: 'thin-source-center', radius: profile.radius, construction: false }], constraints: [],
  };
  const [x, y] = profile.center, w = profile.width / 2, h = profile.height / 2;
  return {
    kind: 'entities', points: [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]]
      .map(([x, y], index) => ({ id: `thin-source-p${index}`, x, y })),
    entities: [0, 1, 2, 3].map((index) => ({ id: `thin-source-e${index}`, type: 'line', construction: false,
      start: `thin-source-p${index}`, end: `thin-source-p${(index + 1) % 4}` })), constraints: [],
  };
}

/** Native-profile analysis snaps shared endpoints; feed those same points to the supports. */
function supportProfile(curves: Curve[]): EntityProfile {
  const profile: EntityProfile = { kind: 'entities', points: [], entities: [], constraints: [] };
  curves.forEach((curve, index) => {
    const put = (role: string, point: Point2) => {
      const id = `thin-analysis:${index}:${role}`;
      profile.points.push({ id, x: point[0], y: point[1] });
      return id;
    };
    if (curve.type === 'circle') profile.entities.push({ id: curve.id, type: 'circle', construction: false,
      center: put('center', curve.center), radius: curve.radius });
    else {
      const start = put('start', curve.start), end = put('end', curve.end);
      if (curve.type === 'line') profile.entities.push({ id: curve.id, type: 'line', construction: false, start, end });
      else profile.entities.push({ id: curve.id, type: 'arc', construction: false, start, end,
        center: put('center', curve.center), clockwise: curve.sweep < 0 });
    }
  });
  return profile;
}

function image(profile: EntityProfile, chain: Chain, side: 'left' | 'right', thickness: number): Image {
  const sources: OffsetSource[] = chain.entries.map(({ curve, reverse }) => ({ entityId: curve.id, reversed: reverse }));
  const supports = sources.map((source) => support(profile, source, side, thickness));
  const radii = supports.map((support) => support.kind === 'circle' ? support.radius : undefined);
  if (radii.some((radius) => radius !== undefined && (!Number.isFinite(radius) || radius <= JOIN_TOLERANCE))) {
    throw new Error('Pared delgada: el espesor colapsa o invierte un radio.');
  }
  if (chain.entries[0].curve.type === 'circle') return { vertices: [], radii, joins: [] };
  const endpoint = (index: number, end: 0 | 1) => {
    const entity = profile.entities.find((entity) => entity.id === sources[index].entityId)!;
    if (entity.type === 'circle') throw new Error('Pared delgada: círculo inesperado en una cadena.');
    const pointId = sources[index].reversed === (end === 0) ? entity.end : entity.start;
    return projectOffsetPoint(profile, sources[index], side, thickness, pointId);
  };
  const joints: Point2[] = [], joins: unknown[] = [];
  const count = chain.closed ? sources.length : sources.length - 1;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % sources.length, seed = endpoint(index, 1);
    if (sameSupport(supports[index], supports[next])) {
      joints.push(point2(seed)); joins.push(['continuation']); continue;
    }
    const hits = supportIntersections(supports[index], supports[next])
      .map((hit) => ({ ...hit, distance: norm(minus(hit.point, seed)) })).sort((a, b) => a.distance - b.distance);
    if (!hits.length || hits.length > 1 && Math.abs(hits[0].distance - hits[1].distance) <= JOIN_TOLERANCE) {
      throw new Error('Pared delgada: la esquina no tiene una intersección inequívoca.');
    }
    joints.push(point2(hits[0].point)); joins.push(['intersection', hits[0].branch]);
  }
  const vertices = chain.closed ? [joints[joints.length - 1], ...joints.slice(0, -1)]
    : [point2(endpoint(0, 0)), ...joints, point2(endpoint(sources.length - 1, 1))];
  return { vertices, radii, joins };
}

function appendImage(output: EntityProfile, chain: Chain, image: Image, prefix: string): string[] {
  const ids: string[] = [];
  const put = (role: string, point: Point2) => {
    if (!point.every(Number.isFinite) || point.some((coordinate) => Math.abs(coordinate) > 2_000_000)) {
      throw new Error('Pared delgada: la esquina excede el dominio geométrico permitido.');
    }
    const id = `${prefix}:${role}`;
    output.points.push({ id, x: point[0], y: point[1] }); return id;
  };
  const vertexIds = image.vertices.map((point, index) => put(`v${index}`, point));
  chain.entries.forEach(({ curve, reverse }, index) => {
    const id = `${prefix}:e${index}`;
    let entity: SketchEntity;
    if (curve.type === 'circle') entity = { id, type: 'circle', construction: false,
      center: put(`c${index}`, curve.center), radius: image.radii[index]! };
    else {
      const startIndex = index, endIndex = (index + 1) % vertexIds.length;
      const start = image.vertices[startIndex], end = image.vertices[endIndex];
      const sourceStart = reverse ? curve.end : curve.start, sourceEnd = reverse ? curve.start : curve.end;
      if (distance(start, end) <= JOIN_TOLERANCE) throw new Error('Pared delgada: el espesor consume un tramo.');
      if (curve.type === 'line') {
        const forward = (end[0] - start[0]) * (sourceEnd[0] - sourceStart[0]) + (end[1] - start[1]) * (sourceEnd[1] - sourceStart[1]);
        if (forward <= AREA_TOLERANCE) throw new Error('Pared delgada: una esquina invierte una línea.');
        entity = { id, type: 'line', construction: false, start: vertexIds[startIndex], end: vertexIds[endIndex] };
      } else {
        const radial = (point: Point2) => ({ x: point[0] - curve.center[0], y: point[1] - curve.center[1] });
        if (dot2(radial(start), radial(sourceStart)) <= AREA_TOLERANCE || dot2(radial(end), radial(sourceEnd)) <= AREA_TOLERANCE) {
          throw new Error('Pared delgada: una esquina cambiaría de extremo radial.');
        }
        const clockwise = (curve.sweep < 0) !== reverse;
        const angle = Math.atan2(start[1] - curve.center[1], start[0] - curve.center[0]);
        const endAngle = Math.atan2(end[1] - curve.center[1], end[0] - curve.center[0]);
        const sweep = positiveAngle(clockwise ? angle - endAngle : endAngle - angle);
        if (Math.abs(sweep - Math.abs(curve.sweep)) >= Math.PI) throw new Error('Pared delgada: una esquina envolvería de nuevo el arco.');
        entity = { id, type: 'arc', construction: false, center: put(`c${index}`, curve.center),
          start: vertexIds[startIndex], end: vertexIds[endIndex], clockwise };
      }
    }
    output.entities.push(entity); ids.push(id);
  });
  return ids;
}

/**
 * A temporary solved section, never a saved sketch edit. Public positive means
 * outward on closed loops and right on canonical open chains. No native distance
 * sign or first-wire selection supplies that semantic decision.
 */
export interface PreparedThinSection {
  sketch: SketchFeature;
  identity: readonly unknown[];
  /** Ephemeral analytic profiles; never saved or inferred from generated ID spellings. */
  closedRegions: readonly { outer: EntityProfile; inner: EntityProfile }[];
  openComponents: number;
}

export function prepareThinSection(solvedSketch: SketchFeature, wall: ResolvedThinWall): PreparedThinSection {
  if (![wall.positive, wall.negative].every((value) => Number.isFinite(value) && value >= 0)
    || wall.positive + wall.negative <= JOIN_TOLERANCE || wall.positive + wall.negative > 100_000) {
    throw new Error('Pared delgada: espesor resuelto no válido o inferior a la tolerancia de unión.');
  }
  let source = entityProfile(solvedSketch);
  if (source.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    || source.entities.some((entity) => entity.type === 'circle' && (!Number.isFinite(entity.radius) || entity.radius <= JOIN_TOLERANCE))) {
    throw new Error('Pared delgada: el perfil contiene coordenadas o radios no válidos.');
  }
  const original = makeProfileCurves(source), originalChains = chains(original.curves, original.nodes);
  if (wall.definition.endCaps?.enabled && (originalChains.length !== 1 || !originalChains[0].closed)) {
    throw new Error('Tapas de pared delgada: requieren un único contorno fuente cerrado simple.');
  }
  const derivedArcs = wall.definition.autoCorners?.enabled === true;
  let cornerIdentity: readonly unknown[] | undefined;
  if (derivedArcs) {
    const rounded = roundThinSource(originalChains, wall);
    source = rounded.profile; cornerIdentity = rounded.identity;
  }
  const { curves, nodes } = derivedArcs ? makeProfileCurves(source, true) : original;
  const ordered = derivedArcs ? chains(curves, nodes) : originalChains;
  const analysis = supportProfile(curves), output: EntityProfile = { kind: 'entities', points: [], entities: [], constraints: [] };
  const identities: unknown[] = [], regions: { outerIds: string[]; innerIds?: string[] }[] = [];
  ordered.forEach((chain, index) => {
    const positive = image(analysis, chain, 'right', wall.positive);
    const negative = image(analysis, chain, 'left', wall.negative);
    const positiveIds = appendImage(output, chain, positive, `thin-v1:c${index}:positive`);
    const negativeIds = appendImage(output, chain, negative, `thin-v1:c${index}:negative`);
    for (const [thickness, ids] of [[wall.positive, positiveIds], [wall.negative, negativeIds]] as const) {
      if (!thickness) continue;
      const members = new Set(ids);
      const imageCurves = makeProfileCurves({ ...output, entities: output.entities.filter((entity) => members.has(entity.id)) }, derivedArcs).curves;
      for (const { curve: original } of chain.entries) for (const derived of imageCurves) {
        if (profileCurveIntersections(original, derived).length) throw new Error('Pared delgada: una equidistancia vuelve a entrar o toca su fuente.');
      }
    }
    if (!chain.closed) {
      const positiveFirst = output.entities.find((entity) => entity.id === positiveIds[0])!;
      const positiveLast = output.entities.find((entity) => entity.id === positiveIds.at(-1))!;
      const negativeFirst = output.entities.find((entity) => entity.id === negativeIds[0])!;
      const negativeLast = output.entities.find((entity) => entity.id === negativeIds.at(-1))!;
      if (positiveFirst.type === 'circle' || positiveLast.type === 'circle' || negativeFirst.type === 'circle' || negativeLast.type === 'circle') {
        throw new Error('Pared delgada: círculo inesperado en los extremos.');
      }
      const caps: SketchEntity[] = [
        { id: `thin-v1:c${index}:cap:start`, type: 'line', construction: false, start: positiveFirst.start, end: negativeFirst.start },
        { id: `thin-v1:c${index}:cap:end`, type: 'line', construction: false, start: positiveLast.end, end: negativeLast.end },
      ];
      output.entities.push(...caps);
      regions.push({ outerIds: [...positiveIds, ...negativeIds, ...caps.map((cap) => cap.id)] });
    } else regions.push({ outerIds: positiveIds, innerIds: negativeIds });
    identities.push([chain.closed ? 'closed-outward' : 'open-right',
      chain.entries.map(({ curve, reverse }) => [curve.id, curve.type, reverse]), positive.joins, negative.joins]);
  });
  // This validates every source/image/cap intersection, contact, branch and loop;
  // no clipping, split reduction or selection of one component is permitted.
  const contours = makeContours(output, derivedArcs);
  if (contours.some((contour) => !Number.isFinite(thinContourArea(contour)) || Math.abs(thinContourArea(contour)) <= AREA_TOLERANCE)) {
    throw new Error('Pared delgada: una región se ha colapsado.');
  }
  const contourFor = (ids: string[]) => {
    const found = contours.filter((contour) => contour.curves.some(({ curve }) => ids.includes(curve.id)));
    if (found.length !== 1 || found[0].curves.length !== ids.length) throw new Error('Pared delgada: cambió la topología del contorno.');
    return found[0];
  };
  const bands = regions.map(({ outerIds, innerIds }, index) => {
    const outer = contourFor(outerIds), inner = innerIds ? contourFor(innerIds) : undefined;
    if (inner) {
      const original = { curves: ordered[index].entries };
      const originalArea = Math.abs(thinContourArea(original)), outerArea = Math.abs(thinContourArea(outer)), innerArea = Math.abs(thinContourArea(inner));
      if (outerArea - innerArea <= AREA_TOLERANCE || outerArea < originalArea - AREA_TOLERANCE || innerArea > originalArea + AREA_TOLERANCE
        || !contains(outer, inner.curves[0].curve.start)
        || wall.positive > 0 && !contains(outer, original.curves[0].curve.start)
        || wall.negative > 0 && !contains(original, inner.curves[0].curve.start)) {
        throw new Error('Pared delgada: el espesor colapsa o invierte el contorno cerrado.');
      }
    }
    return { outer, inner };
  });
  for (let index = 0; index < bands.length; index++) for (let other = index + 1; other < bands.length; other++) {
    const inBand = (point: Point2, band: typeof bands[number]) => contains(band.outer, point) && (!band.inner || !contains(band.inner, point));
    if (inBand(bands[index].outer.curves[0].curve.start, bands[other]) || inBand(bands[other].outer.curves[0].curve.start, bands[index])) {
      throw new Error('Pared delgada: dos paredes se superponen; no se recortan componentes de forma implícita.');
    }
  }
  const support = solvedSketch.support;
  const regionProfile = (ids: readonly string[]): EntityProfile => {
    const members = new Set(ids), entities = output.entities.filter(entity => members.has(entity.id));
    const points = new Set(entities.flatMap(entity => entity.type === 'circle' ? [entity.center]
      : entity.type === 'arc' ? [entity.start, entity.end, entity.center] : [entity.start, entity.end]));
    return { kind: 'entities', entities: entities.map(entity => ({ ...entity })),
      points: output.points.filter(point => points.has(point.id)).map(point => ({ ...point })), constraints: [] };
  };
  return { sketch: { ...solvedSketch, profile: output,
    ...(support ? { support: support.kind === 'face' ? { ...support, face: { ...support.face } } : { ...support } } : {}) },
  identity: ['thin-section-v1', [...wall.identity], identities, ...(cornerIdentity ? [cornerIdentity] : [])],
  closedRegions: regions.flatMap(region => region.innerIds ? [{ outer: regionProfile(region.outerIds), inner: regionProfile(region.innerIds) }] : []),
  openComponents: ordered.filter(chain => !chain.closed).length };
}
