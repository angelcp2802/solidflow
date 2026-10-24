import * as THREE from 'three'
import type { AssemblyGeometryReference } from '../model/assemblyDocument'
import { validateAssemblyGeometryReference } from '../model/assemblyDocument'
import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import { composeRigidPoses, validateRigidPose, type RigidPose } from '../model/rigidPose'

export type AssemblyOriginReference = Extract<AssemblyGeometryReference, { kind: 'principal-axis' | 'principal-plane' }>
export interface AssemblyOriginDisplay {
  key: string
  label: string
  reference: AssemblyOriginReference
  /** Declared current placement for display; never native verification. */
  worldPose: RigidPose
}
export const assemblyOriginDisplayBinding = (entry: AssemblyOriginDisplay): string => JSON.stringify([entry.key, entry.label, entry.worldPose])
export const assemblyOriginReferenceKey = (reference: AssemblyOriginReference): string => JSON.stringify([
  reference.kind, reference.component ? [reference.component.occurrencePath, reference.component.definition.id, reference.component.definition.revision] : null,
  reference.kind === 'principal-axis' ? reference.axis : reference.plane,
])
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** Scope-relative identity, global display pose, including selected child states. */
export function buildAssemblyOriginDisplay(evaluation: AssemblyConfigurationEvaluation, scopePath: readonly string[], ownerPath: readonly string[] | null,
  kinds: { axes: boolean; planes: boolean }): AssemblyOriginDisplay[] {
  const scopes = evaluation.scopes.filter(row => samePath(row.path, scopePath))
  if (scopes.length !== 1 || scopes[0].suppressed || !scopes[0].visible) return []
  const scope = scopes[0]
  let component: AssemblyOriginReference['component'] = null, pose: RigidPose, label = scopePath.length ? `Ámbito ${scopePath.join(' / ')}` : 'Raíz'
  try {
    pose = validateRigidPose(scope.worldPose)
    if (ownerPath !== null) {
      if (ownerPath.length <= scopePath.length || !scopePath.every((id, i) => ownerPath[i] === id)) return []
      const parents = evaluation.scopes.filter(row => samePath(row.path, ownerPath.slice(0, -1)))
      if (parents.length !== 1 || parents[0].suppressed || !parents[0].visible) return []
      const rows = parents[0].occurrences.filter(row => row.id === ownerPath.at(-1))
      if (rows.length !== 1 || rows[0].suppressed || !rows[0].visible) return []
      const row = rows[0]
      component = { occurrencePath: ownerPath.slice(scopePath.length), definition: { ...row.definition } }
      pose = composeRigidPoses(validateRigidPose(parents[0].worldPose), validateRigidPose(row.pose))
      label = row.name
    }
    const refs: AssemblyOriginReference[] = []
    if (kinds.axes) for (const axis of ['X', 'Y', 'Z'] as const) refs.push({ kind: 'principal-axis', component, axis })
    if (kinds.planes) for (const plane of ['XY', 'XZ', 'YZ'] as const) refs.push({ kind: 'principal-plane', component, plane })
    return refs.map(reference => ({ key: assemblyOriginReferenceKey(reference), reference,
      label: `${reference.kind === 'principal-axis' ? 'Eje ' + reference.axis : 'Plano ' + reference.plane} · ${label}`, worldPose: structuredClone(pose) }))
  } catch { return [] }
}

type Camera = THREE.OrthographicCamera | THREE.PerspectiveCamera
type Size = { width: number; height: number }
const axes = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] } as const
const planeAxes = { XY: ['X', 'Y'], XZ: ['X', 'Z'], YZ: ['Y', 'Z'] } as const
function currentDisplays(entries: readonly AssemblyOriginDisplay[]): AssemblyOriginDisplay[] {
  if (entries.length > 96) return []
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1)
  return entries.filter(entry => {
    try {
      const reference = validateAssemblyGeometryReference(entry.reference)
      return (reference.kind === 'principal-axis' || reference.kind === 'principal-plane')
        && assemblyOriginReferenceKey(reference) === entry.key && counts.get(entry.key) === 1 && !!validateRigidPose(entry.worldPose)
    } catch { return false }
  })
}
/** Finite display witnesses for infinite analytic references; size has no CAD meaning. */
export function assemblyOriginDisplayPoints(entry: AssemblyOriginDisplay, extent: number): THREE.Vector3[] {
  const pose = validateRigidPose(entry.worldPose), q = new THREE.Quaternion(...pose.rotation), t = new THREE.Vector3(...pose.translation)
  const point = (v: THREE.Vector3) => v.applyQuaternion(q).add(t)
  if (entry.reference.kind === 'principal-axis') {
    const direction = new THREE.Vector3(...axes[entry.reference.axis])
    return [point(direction.clone().multiplyScalar(-extent)), point(direction.multiplyScalar(extent))]
  }
  const [a, b] = planeAxes[entry.reference.plane], u = new THREE.Vector3(...axes[a]), v = new THREE.Vector3(...axes[b])
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => point(u.clone().multiplyScalar(x * extent).addScaledVector(v, y * extent)))
}
export function assemblyOriginExtent(bounds: { min: readonly number[]; max: readonly number[] } | null | undefined): number {
  if (!bounds) return 10
  const diagonal = Math.hypot(...bounds.max.map((value, i) => value - bounds.min[i]))
  return Number.isFinite(diagonal) ? Math.max(1, diagonal * .22) : 10
}
export function createAssemblyOriginOverlay(entries: readonly AssemblyOriginDisplay[], extent: number, selected: readonly AssemblyOriginReference[] = [], hovered: string | null = null): THREE.Group {
  const group = new THREE.Group(), selectedKeys = new Set(selected.map(assemblyOriginReferenceKey))
  if (!Number.isFinite(extent) || extent <= 0) return group
  for (const entry of currentDisplays(entries)) {
    const points = assemblyOriginDisplayPoints(entry, extent), active = selectedKeys.has(entry.key), hot = hovered === entry.key
    const color = active ? 0xe8952d : hot ? 0xffc166 : 0x2385c8
    const owner = new THREE.Group(); owner.name = entry.key; group.add(owner)
    if (entry.reference.kind === 'principal-axis') {
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const line = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({ color, dashSize: extent / 12, gapSize: extent / 24, depthTest: false, depthWrite: false }))
      line.computeLineDistances(); line.renderOrder = 5; owner.add(line)
    } else {
      const geometry = new THREE.BufferGeometry().setFromPoints(points); geometry.setIndex([0, 1, 2, 0, 2, 3])
      const surface = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: active ? .22 : hot ? .18 : .08, side: THREE.DoubleSide, depthTest: false, depthWrite: false }))
      surface.renderOrder = 4; owner.add(surface)
      const border = new THREE.BufferGeometry().setFromPoints([points[0], points[1], points[1], points[2], points[2], points[3], points[3], points[0]])
      const line = new THREE.LineSegments(border, new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false }))
      line.renderOrder = 5; owner.add(line)
    }
  }
  return group
}
function clipPoint(camera: Camera, point: THREE.Vector3): THREE.Vector4 {
  return new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)
}
function screenPoint(clip: THREE.Vector4, size: Size): { x: number; y: number; z: number } | null {
  if (![clip.x, clip.y, clip.z, clip.w].every(Number.isFinite) || clip.w <= 0) return null
  const x = clip.x / clip.w, y = clip.y / clip.w, z = clip.z / clip.w
  return { x: (x + 1) * size.width / 2, y: (1 - y) * size.height / 2, z }
}
function project(camera: Camera, point: THREE.Vector3, size: Size) {
  const clip = clipPoint(camera, point)
  return clip.z < -clip.w || clip.z > clip.w ? null : screenPoint(clip, size)
}
/** Clip before perspective division, matching the renderer's near/far slab.
 * Plane border tests use only original clipped edges, not a synthetic cut edge. */
function projectedSegment(camera: Camera, first: THREE.Vector3, second: THREE.Vector3, size: Size) {
  const a = clipPoint(camera, first), b = clipPoint(camera, second)
  if (![...a.toArray(), ...b.toArray()].every(Number.isFinite)) return null
  let start = 0, end = 1
  for (const [da, db] of [[a.z + a.w, b.z + b.w], [a.w - a.z, b.w - b.z]]) {
    if (da < 0 && db < 0) return null
    if (da < 0) start = Math.max(start, da / (da - db))
    if (db < 0) end = Math.min(end, da / (da - db))
  }
  if (start > end) return null
  const p = screenPoint(a.clone().lerp(b, start), size), q = screenPoint(a.clone().lerp(b, end), size)
  return p && q ? [p, q] as const : null
}
export function assemblyOriginLabels(camera: Camera, entries: readonly AssemblyOriginDisplay[], extent: number, size: Size) {
  camera.updateMatrixWorld()
  return currentDisplays(entries).flatMap(entry => {
    const points = assemblyOriginDisplayPoints(entry, extent), p = project(camera, points[entry.reference.kind === 'principal-axis' ? 1 : 2], size)
    return p && p.x >= 0 && p.y >= 0 && p.x <= size.width && p.y <= size.height ? [{ key: entry.key, label: entry.label, binding: assemblyOriginDisplayBinding(entry), x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }] : []
  })
}
function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
  if (length2 < 1) return Infinity // End-on axes remain selectable by their explicit label.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
/** Reference overlays intentionally remain visible through solids; no material hit is fabricated. */
export function pickAssemblyOrigin(camera: Camera, entries: readonly AssemblyOriginDisplay[], extent: number, pointer: { x: number; y: number }, size: Size, tolerancePx = 7): AssemblyOriginReference | null {
  if (![pointer.x, pointer.y, size.width, size.height, extent, tolerancePx].every(Number.isFinite) || extent <= 0 || size.width <= 0 || size.height <= 0
    || tolerancePx <= 0 || tolerancePx > 24 || pointer.x < 0 || pointer.y < 0 || pointer.x > size.width || pointer.y > size.height) return null
  camera.updateMatrixWorld()
  const rays = new THREE.Raycaster(); rays.setFromCamera(new THREE.Vector2(pointer.x / size.width * 2 - 1, 1 - pointer.y / size.height * 2), camera)
  const hits: { entry: AssemblyOriginDisplay; pixels: number; depth: number; axis: boolean }[] = []
  for (const entry of currentDisplays(entries)) {
    const points = assemblyOriginDisplayPoints(entry, extent)
    const distance = (a: THREE.Vector3, b: THREE.Vector3) => { const segment = projectedSegment(camera, a, b, size); return segment ? segmentDistance(pointer, segment[0], segment[1]) : Infinity }
    const pixels = entry.reference.kind === 'principal-axis' ? distance(points[0], points[1]) : Math.min(...points.map((point, i) => distance(point, points[(i + 1) % 4])))
    if (entry.reference.kind === 'principal-axis') { if (pixels <= tolerancePx) hits.push({ entry, pixels, depth: 0, axis: true }); continue }
    const point = new THREE.Vector3(), hit = rays.ray.intersectTriangle(points[0], points[1], points[2], false, point) ?? rays.ray.intersectTriangle(points[0], points[2], points[3], false, point)
    if (hit && project(camera, hit, size) && rays.ray.direction.dot(hit.clone().sub(rays.ray.origin)) >= 0)
      hits.push({ entry, pixels: pixels <= tolerancePx ? pixels : tolerancePx + 1, depth: hit.distanceTo(rays.ray.origin), axis: false })
  }
  hits.sort((a, b) => Number(b.axis) - Number(a.axis) || a.pixels - b.pixels || a.depth - b.depth)
  const first = hits[0], second = hits[1]
  if (!first || second && first.axis === second.axis && Math.abs(first.pixels - second.pixels) <= .5 && (first.axis || Math.abs(first.depth - second.depth) < 1e-6)) return null
  return structuredClone(first.entry.reference)
}
