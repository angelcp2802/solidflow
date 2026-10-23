import { configureCadNavigation, createCadSelectionGesture } from './cadNavigation'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import type { AssemblyScene, AssemblySceneBody, AssemblySceneFace, AssemblySceneEdge, AssemblySceneVertex } from '../cad/kernel.assembly-types'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyInterferenceReport } from '../model/assemblyInterference'
import type { AssemblyDragFrame } from '../model/assemblyDrag'
import { identityRigidPose, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { assemblyReferencePickMode, assemblyVertexKey, pickAssemblyVertex, createAssemblyVertexMarkers, disposeAssemblyVertexMarkers } from './assemblyVertexPicking'
type AnalysisPair = AssemblyInterferenceReport['pairs'][number]

/** Intent only: this empty proxy never owns or transforms a body mesh. */
export function createAssemblyDragProxy(pose: RigidPose): THREE.Object3D {
  const checked = validateRigidPose(pose), proxy = new THREE.Object3D()
  proxy.position.fromArray(checked.translation); proxy.quaternion.fromArray(checked.rotation)
  return proxy
}
export function assemblyDragWorldTarget(proxy: THREE.Object3D): RigidPose {
  proxy.updateWorldMatrix(true, false)
  return validateRigidPose({ translation: proxy.getWorldPosition(new THREE.Vector3()).toArray(),
    rotation: proxy.getWorldQuaternion(new THREE.Quaternion()).normalize().toArray() })
}

export const assemblyComponentKey = (component: AssemblyComponentReference): string =>
  JSON.stringify([component.occurrencePath, component.definition.id, component.definition.revision])
export const assemblyFaceKey = (face: AssemblySceneFace): string => JSON.stringify([
  assemblyComponentKey(face.selection.component), face.selection.body ? [face.selection.body.bodyId, face.selection.body.sourceFeatureId] : null, face.selection.face.sourceFeatureId, face.selection.face.key,
])
export const assemblyBodyKey = (component: AssemblyComponentReference, body: AssemblySceneBody['body']): string =>
  JSON.stringify([assemblyComponentKey(component), body ? [body.bodyId, body.sourceFeatureId] : null])
export const assemblyEdgeKey = (edge: AssemblySceneEdge): string => JSON.stringify([
  assemblyComponentKey(edge.selection.component), edge.selection.body ? [edge.selection.body.bodyId, edge.selection.body.sourceFeatureId] : null, edge.selection.edge.sourceFeatureId, edge.selection.edge.key,
])
export interface AssemblyPickBody { body: AssemblySceneBody; object: THREE.Mesh }
export interface AssemblyPickFace { face: AssemblySceneFace; object: THREE.Mesh }
export interface AssemblyPickEdge { edge: AssemblySceneEdge; object: THREE.LineSegments; highlight?: LineSegments2 }
export function assemblyAnalysisBodySelected(body: AssemblySceneBody, pair: AnalysisPair | null | undefined): boolean {
  return !!pair && [pair.first, pair.second].some(value => assemblyBodyKey(value.component, value.body) === assemblyBodyKey(body.component, body.body))
}
/** Detached world-space display witnesses. No pose, bounds or inferred mesh is substituted. */
export function createAssemblyInterferenceOverlay(pair: AnalysisPair | null): THREE.Group {
  const group = new THREE.Group()
  if (!pair) return group
  group.name = pair.id
  if ((pair.status === 'overlap' || pair.status === 'small-overlap') && pair.solidCount > 0 && pair.intersectionVolume > 0 && pair.intersectionMesh) {
    const geometry = new THREE.BufferGeometry(), mesh = pair.intersectionMesh
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3)); geometry.setIndex(mesh.triangles)
    const object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xd82d3b, opacity: .9, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
    object.renderOrder = 2; object.name = 'Intersección nativa'; group.add(object)
  }
  if (pair.closestPoints) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([...pair.closestPoints.first, ...pair.closestPoints.second], 3))
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x1678b6, depthTest: false }))
    line.renderOrder = 3; line.name = 'Distancia nativa'; group.add(line)
  }
  return group
}
function disposeDisplay(group: THREE.Object3D): void {
  group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()) } })
}
type Camera = THREE.OrthographicCamera | THREE.PerspectiveCamera
function rayAt(camera: Camera, pointer: { x: number; y: number }, size: { width: number; height: number }): THREE.Raycaster | null {
  if (size.width <= 0 || size.height <= 0 || pointer.x < 0 || pointer.y < 0 || pointer.x > size.width || pointer.y > size.height) return null
  camera.updateMatrixWorld()
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(pointer.x / size.width * 2 - 1, 1 - pointer.y / size.height * 2), camera)
  ray.near = camera.near; ray.far = camera.far; return ray
}
/** Triangle picking is display selection only; the worker authenticates saved refs. */
export function pickAssemblyFace(camera: Camera, bodies: readonly AssemblyPickBody[], faces: readonly AssemblyPickFace[], pointer: { x: number; y: number }, size: { width: number; height: number }): AssemblySceneFace | null {
  const ray = rayAt(camera, pointer, size); if (!ray) return null
  const visible = bodies.filter(item => item.body.visible)
  const components = new Set(visible.map(item => assemblyBodyKey(item.body.component, item.body.body)))
  const available = faces.filter(item => components.has(assemblyBodyKey(item.face.selection.component, item.face.selection.body)))
  visible.forEach(item => item.object.updateMatrixWorld()); available.forEach(item => item.object.updateMatrixWorld())
  const hits = ray.intersectObjects(available.map(item => item.object), false); if (!hits.length) return null
  const nearest = hits[0].distance, tolerance = Math.max(1e-5, nearest * 1e-7)
  const matches = new Map<string, AssemblySceneFace>()
  for (const hit of hits) {
    if (hit.distance > nearest + tolerance) break
    const face = available.find(item => item.object === hit.object)?.face
    if (face) matches.set(assemblyFaceKey(face), face)
  }
  if (matches.size !== 1) return null
  const selected = matches.values().next().value!, owner = assemblyBodyKey(selected.selection.component, selected.selection.body)
  // The body's display tessellation can be coarser than its face catalog.
  // Same-body depth comes from frontmost face hits, including unsupported
  // surfaces; a nearer chord from that body's coarse mesh is not an occluder.
  const surface = ray.intersectObjects(visible.filter(item => assemblyBodyKey(item.body.component, item.body.body) !== owner).map(item => item.object), false)[0]
  if (surface && surface.distance < nearest - tolerance) return null
  return selected
}
export function pickAssemblyComponent(camera: Camera, bodies: readonly AssemblyPickBody[], pointer: { x: number; y: number }, size: { width: number; height: number }): AssemblyComponentReference | null {
  const ray = rayAt(camera, pointer, size); if (!ray) return null
  const visible = bodies.filter(item => item.body.visible); visible.forEach(item => item.object.updateMatrixWorld())
  const hits = ray.intersectObjects(visible.map(item => item.object), false); if (!hits.length) return null
  const nearest = hits[0].distance, tolerance = Math.max(1e-5, nearest * 1e-7), matches = new Map<string, AssemblyComponentReference>()
  for (const hit of hits) {
    if (hit.distance > nearest + tolerance) break
    const body = visible.find(item => item.object === hit.object)?.body
    if (body) matches.set(assemblyComponentKey(body.component), body.component)
  }
  return matches.size === 1 ? structuredClone(matches.values().next().value!) : null
}
/** Individual native-edge display DTOs select identity; mesh segments confer no support authority. */
export function pickAssemblyEdge(camera: Camera, bodies: readonly AssemblyPickBody[], edges: readonly AssemblyPickEdge[], pointer: { x: number; y: number }, size: { width: number; height: number }, tolerance = 8): AssemblySceneEdge | null {
  const ray = rayAt(camera, pointer, size)
  if (!ray || !Number.isFinite(tolerance) || tolerance <= 0) return null
  const visible = bodies.filter(value => value.body.visible), keys = new Set(visible.map(value => assemblyBodyKey(value.body.component, value.body.body)))
  const available = edges.filter(value => value.edge.support?.kind === 'line' && keys.has(assemblyBodyKey(value.edge.selection.component, value.edge.selection.body)))
  if (!available.length) return null
  const box = new THREE.Box3()
  visible.forEach(value => { value.object.updateMatrixWorld(); box.expandByObject(value.object) })
  available.forEach(value => value.object.updateMatrixWorld())
  const span = box.getSize(new THREE.Vector3()).length(), depth = camera.position.distanceTo(box.getCenter(new THREE.Vector3())) + span / 2
  const perPixel = camera instanceof THREE.OrthographicCamera ? (camera.top - camera.bottom) / (camera.zoom * size.height)
    : 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (camera.zoom * size.height)
  if (!Number.isFinite(perPixel) || perPixel <= 0) return null
  ray.params.Line.threshold = tolerance * perPixel
  const candidates: { edge: AssemblySceneEdge; pixels: number; depth: number }[] = [], surfaceRay = new THREE.Raycaster()
  const depthTolerance = Math.max(span * 1e-7, Math.min(.06, perPixel * .15))
  for (const hit of ray.intersectObjects(available.map(value => value.object), false)) {
    const projected = hit.point.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) continue
    const pixels = Math.hypot((projected.x + 1) * size.width / 2 - pointer.x, (1 - projected.y) * size.height / 2 - pointer.y)
    if (pixels > tolerance) continue
    surfaceRay.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera)
    const edgeDepth = hit.point.clone().sub(surfaceRay.ray.origin).dot(surfaceRay.ray.direction)
    const surface = surfaceRay.intersectObjects(visible.map(value => value.object), false)[0]
    if (surface && surface.distance < edgeDepth - depthTolerance) continue
    const edge = available.find(value => value.object === hit.object)?.edge
    if (edge) candidates.push({ edge, pixels, depth: edgeDepth })
  }
  candidates.sort((a, b) => a.pixels - b.pixels || a.depth - b.depth)
  const first = candidates[0]
  if (!first) return null
  const matches = new Map(candidates.filter(value => Math.abs(value.pixels - first.pixels) <= .15 && Math.abs(value.depth - first.depth) <= depthTolerance).map(value => [assemblyEdgeKey(value.edge), value.edge]))
  return matches.size === 1 ? first.edge : null
}
export interface AssemblyViewportProps {
  scene: AssemblyScene | null
  selectedPath?: readonly string[]
  selectedFaces?: readonly AssemblySceneFace[]
  selectedEdges?: readonly AssemblySceneEdge[]
  selectedVertices?: readonly AssemblySceneVertex[]
  selectedAnalysisPair?: AnalysisPair | null
  pickingFaces?: boolean
  pickingEdges?: boolean
  pickingVertices?: boolean
  disabled?: boolean
  drag?: { frame: AssemblyDragFrame; mode: 'translate' | 'rotate'; active: boolean }
  onDragStart?: () => boolean
  onDragTarget?: (worldPose: RigidPose) => void
  onDragEnd?: () => void
  onDragCancel?: () => void
  view?: { name: 'iso' | 'front' | 'top' | 'fit'; stamp: number }
  onComponent: (component: AssemblyComponentReference | null) => void
  onFace: (face: AssemblySceneFace | null) => void
  onEdge?: (edge: AssemblySceneEdge | null) => void
  onVertex?: (vertex: AssemblySceneVertex | null) => void
}
export default function AssemblyViewport(props: AssemblyViewportProps) {
  const host = useRef<HTMLDivElement>(null), input = useRef(props); input.current = props
  const [dragAxis, setDragAxis] = useState<string | null>(null)
  const context = useRef<{ group: THREE.Group; analysis: THREE.Group; markers: THREE.Group; clearHover: () => void; camera: THREE.OrthographicCamera; controls: OrbitControls; bodies: AssemblyPickBody[]; faces: AssemblyPickFace[]; edges: AssemblyPickEdge[]; fit: () => void; highlight: () => void; syncDrag: () => void } | null>(null)
  useEffect(() => {
    const element = host.current!, world = new THREE.Scene(), group = new THREE.Group(), analysis = new THREE.Group(), markers = new THREE.Group()
    const camera = new THREE.OrthographicCamera(-80, 80, 60, -60, .01, 100000); camera.up.set(0, 0, 1); camera.position.set(100, -130, 100)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor(0xffffff, 0)
    element.appendChild(renderer.domElement); world.add(group, analysis, markers)
    world.add(new THREE.HemisphereLight(0xffffff, 0x647e98, 2.4)); const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(70, -80, 120); world.add(light)
    // Register the manipulator first so it can claim a pointer before camera orbit.
    const transform = new TransformControls(camera, renderer.domElement), proxy = createAssemblyDragProxy(identityRigidPose())
    const helper = transform.getHelper(); world.add(proxy, helper); transform.enabled = false
    transform.setSize(.9)
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.screenSpacePanning = true
    configureCadNavigation(controls)
    const selectionGesture = createCadSelectionGesture()
    let acceptedGesture = false, dragConsumed = false
    const cancelDrag = (notify = true) => {
      const wasAccepted = acceptedGesture; acceptedGesture = false
      transform.reset(); transform.pointerUp(null); controls.enabled = true
      if (wasAccepted && notify) input.current.onDragCancel?.()
    }
    const syncDrag = () => {
      const value = input.current, drag = value.drag
      if (!drag || !drag.frame.visible || assemblyReferencePickMode(value) !== null || value.disabled && !drag.active) {
        cancelDrag(); transform.detach(); transform.enabled = false; setDragAxis(null); return
      }
      if (!acceptedGesture) {
        proxy.position.fromArray(drag.frame.worldPose.translation); proxy.quaternion.fromArray(drag.frame.worldPose.rotation)
        proxy.updateMatrixWorld(true); transform.setMode(drag.mode); transform.setSpace(drag.mode === 'rotate' ? 'local' : 'world')
        transform.attach(proxy)
      }
      transform.enabled = true
    }
    const dragStart = () => {
      dragConsumed = true
      const value = input.current
      if (!value.drag || value.disabled || assemblyReferencePickMode(value) !== null || value.onDragStart?.() !== true) { cancelDrag(false); return }
      acceptedGesture = true; controls.enabled = false
    }
    const dragTarget = () => { if (acceptedGesture) input.current.onDragTarget?.(assemblyDragWorldTarget(proxy)) }
    const dragEnd = () => {
      if (!acceptedGesture) return
      acceptedGesture = false; controls.enabled = true; input.current.onDragEnd?.()
    }
    const axisChanged = () => setDragAxis(transform.axis)
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && acceptedGesture) { event.preventDefault(); cancelDrag() } }
    const pointerCancel = () => { selectionGesture.cancel(); cancelDrag() }
    transform.addEventListener('mouseDown', dragStart); transform.addEventListener('objectChange', dragTarget)
    transform.addEventListener('mouseUp', dragEnd); transform.addEventListener('axis-changed', axisChanged)
    window.addEventListener('keydown', keyDown); window.addEventListener('blur', pointerCancel); renderer.domElement.addEventListener('pointercancel', pointerCancel)
    const fit = () => {
      let bounds = input.current.scene?.visibleBounds
      const ghosts = input.current.scene?.bodies.filter(body => !body.visible && assemblyAnalysisBodySelected(body, input.current.selectedAnalysisPair)) ?? []
      if (ghosts.length) {
        const box = new THREE.Box3()
        if (bounds) box.set(new THREE.Vector3(...bounds.min), new THREE.Vector3(...bounds.max))
        for (const body of ghosts) { box.expandByPoint(new THREE.Vector3(...body.bounds.min)); box.expandByPoint(new THREE.Vector3(...body.bounds.max)) }
        bounds = { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }
      }
      if (!bounds) return
      const center = new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(.5)
      const span = Math.max(1, new THREE.Vector3(...bounds.max).sub(new THREE.Vector3(...bounds.min)).length())
      const direction = camera.position.clone().sub(controls.target).normalize(); if (direction.lengthSq() === 0) direction.set(1, -1, 1).normalize()
      controls.target.copy(center); camera.position.copy(center).addScaledVector(direction, span * 2)
      const aspect = Math.max(element.clientWidth, 1) / Math.max(element.clientHeight, 1)
      camera.top = span * .65; camera.bottom = -camera.top; camera.right = camera.top * aspect; camera.left = -camera.right
      camera.near = Math.max(.001, span * .001); camera.far = span * 20; camera.zoom = 1; camera.updateProjectionMatrix(); controls.update()
    }
    let hovered: string | null = null, hoveredEdge: string | null = null, hoveredVertex: string | null = null
    const clearHover = () => { hovered = null; hoveredEdge = null; hoveredVertex = null }
    const highlight = () => {
      const current = context.current; if (!current) return
      disposeAssemblyVertexMarkers(markers)
      const nextMarkers = createAssemblyVertexMarkers(current.bodies, input.current.disabled ? [] : input.current.selectedVertices ?? [], input.current.disabled ? null : hoveredVertex)
      while (nextMarkers.children.length) markers.add(nextMarkers.children[0])
      const selected = input.current.selectedPath ?? [], faceKeys = new Set((input.current.selectedFaces ?? []).map(assemblyFaceKey))
      current.bodies.forEach(({ body, object }) => {
        const active = selected.length > 0 && selected.every((id, i) => body.component.occurrencePath[i] === id)
        const paired = assemblyAnalysisBodySelected(body, input.current.selectedAnalysisPair), material = object.material as THREE.MeshStandardMaterial
        material.color.setHex(active ? 0x429ce0 : 0x89abc8); material.transparent = paired; material.opacity = paired ? .28 : 1; material.depthWrite = !paired
      })
      current.faces.forEach(({ face, object }) => {
        const key = assemblyFaceKey(face), material = object.material as THREE.MeshBasicMaterial
        material.opacity = faceKeys.has(key) ? .55 : key === hovered ? .3 : 0
        material.color.setHex(faceKeys.has(key) ? 0xe8952d : 0xffc166)
      })
      const edgeKeys = new Set((input.current.selectedEdges ?? []).map(assemblyEdgeKey))
      current.edges.forEach(({ edge, highlight }) => {
        if (!highlight) return
        const key = assemblyEdgeKey(edge), active = edgeKeys.has(key)
        highlight.visible = active || key === hoveredEdge
        const material = highlight.material as LineMaterial
        material.color.setHex(active ? 0xe8952d : 0xffc166)
        material.resolution.set(element.clientWidth, element.clientHeight)
      })
    }
    context.current = { group, analysis, markers, clearHover, camera, controls, bodies: [], faces: [], edges: [], fit, highlight, syncDrag }
    const size = () => ({ width: element.clientWidth, height: element.clientHeight })
    const resize = new ResizeObserver(() => { renderer.setSize(element.clientWidth, element.clientHeight); const aspect = Math.max(element.clientWidth, 1) / Math.max(element.clientHeight, 1); camera.right = camera.top * aspect; camera.left = -camera.right; camera.updateProjectionMatrix(); context.current?.highlight() })
    resize.observe(element)
    const point = (event: PointerEvent) => { const rect = element.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
    const pointerDown = (event: PointerEvent) => { selectionGesture.down(event); dragConsumed = false }
    const pointerMove = (event: PointerEvent) => {
      selectionGesture.move(event)
      const current = context.current
      hovered = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'face' && !event.buttons ? (() => { const face = pickAssemblyFace(camera, current.bodies, current.faces, point(event), size()); return face ? assemblyFaceKey(face) : null })() : null
      hoveredEdge = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'edge' && !event.buttons ? (() => { const edge = pickAssemblyEdge(camera, current.bodies, current.edges, point(event), size()); return edge ? assemblyEdgeKey(edge) : null })() : null
      hoveredVertex = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'vertex' && !event.buttons ? (() => { const vertex = pickAssemblyVertex(camera, current.bodies, point(event), size()); return vertex ? assemblyVertexKey(vertex) : null })() : null
      renderer.domElement.style.cursor = acceptedGesture ? 'grabbing' : input.current.disabled ? 'wait' : transform.axis ? 'move' : assemblyReferencePickMode(input.current) !== null ? (hovered || hoveredEdge || hoveredVertex ? 'pointer' : 'crosshair') : event.buttons === 4 ? 'grabbing' : 'default'; highlight()
    }
    const pointerLeave = () => { clearHover(); highlight() }
    controls.addEventListener('start', pointerLeave)
    window.addEventListener('blur', pointerLeave); renderer.domElement.addEventListener('pointercancel', pointerLeave)
    const pointerUp = (event: PointerEvent) => {
      const current = context.current
      const select = selectionGesture.up(event)
      if (dragConsumed) { dragConsumed = false; return }
      if (!current || input.current.disabled || !select) return
      const mode = assemblyReferencePickMode(input.current)
      if (mode === 'conflict') return
      if (mode === 'vertex') input.current.onVertex?.(pickAssemblyVertex(camera, current.bodies, point(event), size()))
      else if (mode === 'edge') input.current.onEdge?.(pickAssemblyEdge(camera, current.bodies, current.edges, point(event), size()))
      else if (mode === 'face') input.current.onFace(pickAssemblyFace(camera, current.bodies, current.faces, point(event), size()))
      else input.current.onComponent(pickAssemblyComponent(camera, current.bodies, point(event), size()))
    }
    renderer.domElement.addEventListener('pointerdown', pointerDown, true); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerleave', pointerLeave); renderer.domElement.addEventListener('pointerup', pointerUp)
    let frame = 0; const draw = () => { controls.update(); renderer.render(world, camera); frame = requestAnimationFrame(draw) }; draw()
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); cancelDrag(); controls.removeEventListener('start', pointerLeave); controls.dispose()
      window.removeEventListener('blur', pointerLeave); renderer.domElement.removeEventListener('pointercancel', pointerLeave)
      disposeAssemblyVertexMarkers(markers)
      transform.removeEventListener('mouseDown', dragStart); transform.removeEventListener('objectChange', dragTarget)
      transform.removeEventListener('mouseUp', dragEnd); transform.removeEventListener('axis-changed', axisChanged); transform.dispose()
      window.removeEventListener('keydown', keyDown); window.removeEventListener('blur', pointerCancel); renderer.domElement.removeEventListener('pointercancel', pointerCancel)
      renderer.domElement.removeEventListener('pointerdown', pointerDown, true); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerleave', pointerLeave); renderer.domElement.removeEventListener('pointerup', pointerUp)
      disposeDisplay(group); disposeDisplay(analysis)
      renderer.dispose(); renderer.domElement.remove(); context.current = null
    }
  }, [])
  useEffect(() => {
    const current = context.current; if (!current) return
    const first = current.bodies.length === 0
    current.clearHover()
    disposeDisplay(current.group)
    current.group.clear(); current.bodies = []; current.faces = []; current.edges = []
    for (const body of props.scene?.bodies ?? []) {
      if (!body.visible && !assemblyAnalysisBodySelected(body, props.selectedAnalysisPair)) continue
      // DTO vertices already come from the placed BRep in world coordinates;
      // applying worldPose again would double-transform the occurrence.
      const occurrence = new THREE.Group(); occurrence.name = assemblyComponentKey(body.component); current.group.add(occurrence)
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(body.vertices, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(body.normals, 3)); geometry.setIndex(body.triangles)
      const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x89abc8, metalness: .25, roughness: .42, side: THREE.DoubleSide })); occurrence.add(object); current.bodies.push({ body, object })
      if (body.edgeLines.length) { const edges = new THREE.BufferGeometry(); edges.setAttribute('position', new THREE.Float32BufferAttribute(body.edgeLines, 3)); occurrence.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x305c7e, transparent: true, opacity: .7 }))) }
      for (const face of body.faces) {
        const mesh = new THREE.BufferGeometry(); mesh.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices, 3)); mesh.setIndex(face.triangles)
        const overlay = new THREE.Mesh(mesh, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, color: 0xe8952d, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
        occurrence.add(overlay); current.faces.push({ face, object: overlay })
      }
      for (const edge of body.edges ?? []) {
        if (edge.lines.length < 6) continue
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(edge.lines, 3))
        const object = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x305c7e, transparent: true, opacity: .7 }))
        const highlightGeometry = new LineSegmentsGeometry(); highlightGeometry.setPositions(edge.lines)
        const highlight = new LineSegments2(highlightGeometry, new LineMaterial({ color: 0xe8952d, linewidth: 3.3, depthTest: true, depthWrite: false }))
        highlight.visible = false; highlight.renderOrder = 3; occurrence.add(object, highlight); current.edges.push({ edge, object, highlight })
      }
    }
    current.highlight(); if (first || props.selectedAnalysisPair) current.fit()
  }, [props.scene, props.selectedAnalysisPair])
  useEffect(() => {
    const current = context.current; if (!current) return
    disposeDisplay(current.analysis); current.analysis.clear()
    const pair = props.selectedAnalysisPair, keys = new Set(props.scene?.bodies.map(body => assemblyBodyKey(body.component, body.body)))
    if (pair && [pair.first, pair.second].every(value => keys.has(assemblyBodyKey(value.component, value.body)))) current.analysis.add(createAssemblyInterferenceOverlay(pair))
  }, [props.scene, props.selectedAnalysisPair])
  useEffect(() => { context.current?.highlight() }, [props.selectedPath, props.selectedFaces, props.selectedEdges, props.selectedVertices])
  useEffect(() => { context.current?.clearHover(); context.current?.highlight(); context.current?.syncDrag() }, [props.drag, props.disabled, props.pickingFaces, props.pickingEdges, props.pickingVertices])
  useEffect(() => {
    const current = context.current; if (!current || !props.view) return
    if (props.view.name !== 'fit') { const direction = props.view.name === 'front' ? new THREE.Vector3(0, -1, 0) : props.view.name === 'top' ? new THREE.Vector3(0, -.0001, 1) : new THREE.Vector3(1, -1.3, 1); current.camera.position.copy(current.controls.target).addScaledVector(direction.normalize(), 100) }
    current.fit()
  }, [props.view])
  return <div className="assembly-viewport" ref={host} aria-label="Visor 3D del ensamblaje" data-analysis-pair={props.selectedAnalysisPair?.id} data-drag-axis={dragAxis ?? ''} data-reference-picking={assemblyReferencePickMode(props) ?? ''}><span className="assembly-axis-label">X · Y · Z{props.drag && <output aria-label="Eje del manipulador"> · {dragAxis ?? 'Selecciona un eje'}</output>}</span></div>
}
