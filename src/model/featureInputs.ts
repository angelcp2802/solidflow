import type { Feature, SketchFeature, SweepPathSegment } from '../cad/kernel.types'
import type { SketchPoint } from '../sketch/types'
import { featureBodyReferences } from './bodyReferences'
import { featureRevolutionAxisBodyReferences } from './revolutionAxisReferences'

export type FeatureWithBase = Extract<Feature, { baseFeatureId: string }>

/** Operations built from an earlier body; does not imply an edge/face selector. */
export function hasBaseFeature(feature: Feature | null | undefined): feature is FeatureWithBase {
  return !!feature && 'baseFeatureId' in feature
}

/** Ordered sketch inputs, detached from the feature's editable arrays. */
export function featureSketchIds(feature: Feature): string[] {
  switch (feature.type) {
    case 'extrude':
    case 'cut':
    case 'revolve':
    case 'revolvedCut':
      return [feature.sketchId]
    case 'sweep':
      return [feature.profileSketchId, feature.pathSketchId]
    case 'loft':
      return feature.sections.map((section) => section.sketchId)
    default:
      return []
  }
}

/** Direct graph dependencies, including supports and historical pattern sources. */
export function featureDependencyIds(feature: Feature): string[] {
  const ids = featureSketchIds(feature)
  ids.push(...featureBodyReferences(feature).map(reference => reference.sourceFeatureId))
  if (feature.type === 'revolve' || feature.type === 'revolvedCut') {
    if (feature.axis?.kind === 'external-sketch-line') ids.push(feature.axis.sketchId)
    if (feature.axis?.kind === 'linear-edge') ids.push(feature.axis.edge.sourceFeatureId)
  }
  ids.push(...featureRevolutionAxisBodyReferences(feature).map(reference => reference.sourceFeatureId))
  if (hasBaseFeature(feature)) ids.push(feature.baseFeatureId)
  if (feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') {
    if (feature.source.mode === 'features') ids.push(...feature.source.featureIds)
    else if (feature.source.mode === 'body') ids.push(feature.source.sourceFeatureId)
  }
  if ('support' in feature && feature.support) {
    if (feature.support.kind === 'plane') ids.push(feature.support.planeId)
    if (feature.support.kind === 'face') ids.push(feature.support.face.sourceFeatureId)
  }
  if ((feature.type === 'extrude' || feature.type === 'cut') && feature.endCondition) {
    const endCondition = feature.endCondition
    if (endCondition.kind === 'upToSurface') {
      if (endCondition.target.kind === 'plane') ids.push(endCondition.target.planeId)
      if (endCondition.target.kind === 'face') ids.push(endCondition.target.face.sourceFeatureId)
    } else ids.push(endCondition.baseFeatureId)
  }
  return [...new Set(ids)]
}

/** Endpoint coincidence in local sketch coordinates, in millimetres. */
const PATH_JOIN_TOLERANCE = 1e-5

interface Endpoint {
  point: SketchPoint
  entityId: string
  role: 0 | 1 // Start precedes end when the same entity owns both chain ends.
}

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const compareEndpoints = (a: Endpoint, b: Endpoint): number =>
  compareText(a.entityId, b.entityId) || a.role - b.role

/**
 * Orders every producing line/arc into one open chain without mutating the sketch.
 * Direction comes from endpoint entity IDs and roles, never point coordinates or
 * array order. Callers can pass a solved sketch when constraints move endpoints.
 * Geometry validity (arc radius, crossings, tangency, etc.) belongs to the kernel.
 */
export function orderedSweepPath(sketch: SketchFeature): SweepPathSegment[] {
  const profile = sketch.profile
  if (profile.kind !== 'entities') {
    throw new Error('La trayectoria requiere un croquis de líneas o arcos con una cadena abierta.')
  }
  const curves = profile.entities.filter((entity) => !entity.construction)
    .sort((a, b) => compareText(a.id, b.id))
  if (curves.length < 1 || curves.length > 128) {
    throw new Error('La trayectoria debe contener entre 1 y 128 líneas o arcos.')
  }
  if (curves.some((entity) => entity.type === 'circle')) {
    throw new Error('La trayectoria debe ser abierta; no puede contener círculos productores.')
  }
  if (new Set(curves.map((entity) => entity.id)).size !== curves.length) {
    throw new Error('La trayectoria contiene identificadores de entidad duplicados.')
  }
  const points = new Map(profile.points.map((point) => [point.id, point]))
  points.set('origin', { id: 'origin', x: 0, y: 0 })
  const endpoints: Endpoint[] = []
  for (const curve of curves) {
    if (curve.type === 'circle') continue // Narrow the discriminated union.
    for (const role of [0, 1] as const) {
      const point = points.get(role === 0 ? curve.start : curve.end)
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('Un extremo de la trayectoria no referencia un punto válido.')
      }
      endpoints.push({ point, entityId: curve.id, role })
    }
  }

  const parents = endpoints.map((_, index) => index)
  const root = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  for (let a = 0; a < endpoints.length; a++) {
    for (let b = a + 1; b < endpoints.length; b++) {
      const pa = endpoints[a].point
      const pb = endpoints[b].point
      if (pa.id === pb.id || Math.hypot(pa.x - pb.x, pa.y - pb.y) <= PATH_JOIN_TOLERANCE) {
        parents[root(b)] = root(a)
      }
    }
  }
  // A chain of near points must not silently merge two endpoints farther apart
  // than the stated tolerance. Such a cluster needs an explicit sketch correction.
  for (let a = 0; a < endpoints.length; a++) {
    for (let b = a + 1; b < endpoints.length; b++) {
      if (root(a) === root(b) && Math.hypot(
        endpoints[a].point.x - endpoints[b].point.x,
        endpoints[a].point.y - endpoints[b].point.y,
      ) > PATH_JOIN_TOLERANCE) {
        throw new Error('La trayectoria tiene una unión de extremos ambigua dentro de la tolerancia.')
      }
    }
  }
  const nodes = new Map<number, number[]>()
  endpoints.forEach((_, index) => {
    const node = root(index)
    const incident = nodes.get(node) ?? []
    incident.push(index)
    nodes.set(node, incident)
  })
  if ([...nodes.values()].some((incident) => incident.length > 2)) {
    throw new Error('La trayectoria tiene ramificaciones; debe formar una sola cadena abierta.')
  }
  const ends = [...nodes.values()].filter((incident) => incident.length === 1)
    .map((incident) => incident[0])
    .sort((a, b) => compareEndpoints(endpoints[a], endpoints[b]))
  if (ends.length !== 2) {
    throw new Error('La trayectoria debe formar una sola cadena abierta y conectada.')
  }
  const ordered: SweepPathSegment[] = []
  const visited = new Set<string>()
  let entering = ends[0]
  while (true) {
    const endpoint = endpoints[entering]
    if (visited.has(endpoint.entityId)) {
      throw new Error('La trayectoria contiene un ciclo; debe formar una sola cadena abierta.')
    }
    visited.add(endpoint.entityId)
    ordered.push({ entityId: endpoint.entityId, reversed: endpoint.role === 1 })
    const leaving = entering ^ 1
    const next = nodes.get(root(leaving))!.filter((index) => index !== leaving)
    if (next.length === 0) break
    entering = next[0]
  }
  if (ordered.length !== curves.length) {
    throw new Error('La trayectoria contiene curvas desconectadas; debe formar una sola cadena abierta.')
  }
  return ordered
}
