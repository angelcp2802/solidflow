import * as THREE from 'three'
import type { AssemblySceneBody, AssemblySceneVertex } from '../cad/kernel.assembly-types'
import { isVertexReferenceKey } from '../cad/kernel.vertex-references'

type Camera = THREE.OrthographicCamera | THREE.PerspectiveCamera
export interface VertexPickBody { body: AssemblySceneBody; object: THREE.Mesh }
const bodyKey = (component: AssemblySceneBody['component'], body: AssemblySceneBody['body']) =>
  JSON.stringify([component.occurrencePath, component.definition.id, component.definition.revision, body ? [body.bodyId, body.sourceFeatureId] : null])
export const assemblyVertexKey = (vertex: AssemblySceneVertex): string => JSON.stringify([
  bodyKey(vertex.selection.component, vertex.selection.body), vertex.selection.vertex.sourceFeatureId, vertex.selection.vertex.key,
])
const finite3 = (value: readonly number[]) => value.length === 3 && value.every(Number.isFinite)

export function assemblyReferencePickMode(value: { pickingVertices?: boolean; pickingEdges?: boolean; pickingFaces?: boolean }): 'vertex' | 'edge' | 'face' | 'conflict' | null {
  if (Number(!!value.pickingVertices) + Number(!!value.pickingEdges) + Number(!!value.pickingFaces) > 1) return 'conflict'
  return value.pickingVertices ? 'vertex' : value.pickingEdges ? 'edge' : value.pickingFaces ? 'face' : null
}

/** Bounded display markers rebind selection identities to the current catalog. */
export function createAssemblyVertexMarkers(bodies: readonly VertexPickBody[], selected: readonly AssemblySceneVertex[], hovered: string | null): THREE.Group {
  const group = new THREE.Group(), current = new Map<string, AssemblySceneVertex[]>()
  if (bodies.reduce((n,v)=>n+(v.body.visible ? v.body.vertexPoints?.length ?? 0 : 0),0)>65536) return group
  for (const { body } of bodies) if (body.visible) for (const vertex of body.vertexPoints ?? []) {
    if (!isVertexReferenceKey(vertex.selection.vertex.key) || body.body !== null && vertex.selection.vertex.sourceFeatureId !== body.body.sourceFeatureId
      || bodyKey(vertex.selection.component, vertex.selection.body) !== bodyKey(body.component, body.body)) continue
    const key = assemblyVertexKey(vertex), entries = current.get(key) ?? []; entries.push(vertex); current.set(key, entries)
  }
  const chosen = new Set(selected.slice(0,4).map(assemblyVertexKey)), keys = new Set(chosen)
  if (hovered) keys.add(hovered)
  for (const key of keys) {
    const entries = current.get(key); if (entries?.length !== 1 || !finite3(entries[0].worldPoint)) continue
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0],3))
    const marker = new THREE.Points(geometry, new THREE.PointsMaterial({ color: chosen.has(key) ? 0xe8952d : 0x1678b6, size:9, sizeAttenuation:false, depthTest:true, depthWrite:false }))
    marker.position.fromArray(entries[0].worldPoint); marker.name=key; group.add(marker)
  }
  return group
}
export function disposeAssemblyVertexMarkers(group: THREE.Group): void {
  group.traverse(object => { if (object instanceof THREE.Points) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()) } })
  group.clear()
}

/** Current display intent only. Native coordinates supply projection, never identity or proof. */
export function pickAssemblyVertex(camera: Camera, bodies: readonly VertexPickBody[], pointer: { x: number; y: number },
  size: { width: number; height: number }, tolerancePx = 8): AssemblySceneVertex | null {
  if (![pointer.x, pointer.y, size.width, size.height, tolerancePx].every(Number.isFinite)
    || size.width <= 0 || size.height <= 0 || tolerancePx <= 0 || tolerancePx > 32
    || pointer.x < 0 || pointer.y < 0 || pointer.x > size.width || pointer.y > size.height) return null
  camera.updateMatrixWorld()
  if (![...camera.projectionMatrix.elements, ...camera.matrixWorldInverse.elements].every(Number.isFinite)) return null
  const visible = bodies.filter(value => value.body.visible)
  for (const value of visible) { value.object.updateWorldMatrix(true, false); if (!value.object.matrixWorld.elements.every(Number.isFinite)) return null }
  if (visible.reduce((count, value) => count + (value.body.vertexPoints?.length ?? 0), 0) > 65536) return null
  const projected: { vertex: AssemblySceneVertex; key: string; pixel: THREE.Vector2; ndc: THREE.Vector2; world: THREE.Vector3; pixels: number }[] = []
  const counts = new Map<string, number>()
  for (const { body } of visible) for (const vertex of body.vertexPoints ?? []) {
    if (bodyKey(vertex.selection.component, vertex.selection.body) !== bodyKey(body.component, body.body)
      || !isVertexReferenceKey(vertex.selection.vertex.key)
      || body.body !== null && vertex.selection.vertex.sourceFeatureId !== body.body.sourceFeatureId) continue
    // Count identity before coordinate validation: an invalid duplicate must not
    // turn an ambiguous catalog identity into a selectable singleton.
    const key = assemblyVertexKey(vertex); counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!finite3(vertex.worldPoint)) continue
    const world = new THREE.Vector3(...vertex.worldPoint)
    // Vector4 retains clip w: project() alone loses the behind-camera test.
    const clip = new THREE.Vector4(...vertex.worldPoint, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix)
    if (![clip.x, clip.y, clip.z, clip.w].every(Number.isFinite) || clip.w <= 0) continue
    const x = clip.x / clip.w, y = clip.y / clip.w, z = clip.z / clip.w
    if (![x,y,z].every(Number.isFinite) || Math.abs(x) > 1 || Math.abs(y) > 1 || z < -1 || z > 1) continue
    const pixel = new THREE.Vector2((x + 1) * size.width / 2, (1 - y) * size.height / 2)
    const pixels = pixel.distanceTo(new THREE.Vector2(pointer.x, pointer.y))
    if (pixels <= tolerancePx) projected.push({ vertex, key, pixel, ndc: new THREE.Vector2(x,y), world, pixels })
  }
  const candidates = projected.filter(candidate => {
    if (counts.get(candidate.key) !== 1) return false
    const ray = new THREE.Raycaster(); ray.setFromCamera(candidate.ndc, camera)
    const depth = ray.ray.direction.dot(candidate.world.clone().sub(ray.ray.origin))
    if (!Number.isFinite(depth) || depth < 0) return false
    // Display tessellation tolerance, not CAD/support tolerance. Include OWN body.
    const depthSlack = Math.max(1e-7, Math.abs(depth) * 32 * Number.EPSILON)
    return !ray.intersectObjects(visible.map(value => value.object), false).some(hit => hit.distance < depth - depthSlack)
  }).sort((a,b) => a.pixels - b.pixels)
  if (!candidates.length) return null
  // Conservative CSS-pixel tie band; depth is only occlusion, not a tie-breaker.
  if (candidates.length > 1 && candidates[1].pixels <= candidates[0].pixels + .5) return null
  return candidates[0].vertex
}
