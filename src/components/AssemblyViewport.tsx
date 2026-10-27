import { bindViewNavigation, createViewHistory, type ViewHistory, type ViewRequest } from './viewNavigation'
import { configureCadNavigation, createCadSelectionGesture } from './cadNavigation'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { assemblyOriginDisplayBinding, assemblyOriginExtent, assemblyOriginLabels, assemblyOriginReferenceKey, createAssemblyOriginOverlay, pickAssemblyOrigin, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { layoutAssemblyOriginLabels, type AssemblyOriginLabelAnchor } from './assemblyOriginLabelLayout'
import './assembly-origin-display.css'
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
type AssemblyViewportContextSelection =
  | { kind: 'component'; component: AssemblyComponentReference }
  | { kind: 'origin'; reference: AssemblyOriginReference }
  | { kind: 'background' }
export type AssemblyViewportContextTarget = AssemblyViewportContextSelection & {
  point: { x: number; y: number }
  restoreFocusElement: HTMLElement
}
export interface AssemblyViewportViewSelection {
  scene: AssemblyScene
  face: AssemblySceneFace | null
  component: AssemblyComponentReference | null
  /** False for an ambiguous/unsupported visible surface, which is not empty selection. */
  empty: boolean
  additive: boolean
}
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
/** Browsing context never assigns a material reference or changes the document. */
export function resolveAssemblyViewportContext(
  camera: Camera, bodies: readonly AssemblyPickBody[], pointer: { x: number; y: number } | null,
  size: { width: number; height: number },
  state: Pick<AssemblyViewportProps, 'scene' | 'selectedPath' | 'originReferences' | 'selectedOrigins' | 'selectedFaces' | 'disabled' | 'pickingFaces' | 'pickingEdges' | 'pickingVertices' | 'pickingOrigins'>
    & { presentedScene: AssemblyScene | null; originsCurrent: boolean; dragActive: boolean },
): AssemblyViewportContextSelection | null {
  if (state.disabled || state.dragActive || assemblyReferencePickMode(state) !== null
    || !state.scene || state.presentedScene !== state.scene || !state.originsCurrent) return null
  if (!pointer) {
    const selectedOrigins = state.selectedOrigins ?? []
    if (selectedOrigins.length > 1 || selectedOrigins.length && (state.selectedFaces?.length ?? 0)) return { kind: 'background' }
    if (selectedOrigins.length === 1) {
      const key = assemblyOriginReferenceKey(selectedOrigins[0])
      const matches = (state.originReferences ?? []).filter(entry => assemblyOriginReferenceKey(entry.reference) === key)
      return matches.length === 1 ? { kind: 'origin', reference: structuredClone(matches[0].reference) } : null
    }
    // A subassembly prefix or two revisions at the same path is not an exact
    // selected rendered component. Multiple bodies of one component are valid.
    const selected = JSON.stringify(state.selectedPath ?? [])
    const matches = new Map(bodies.filter(({ body }) => body.visible && JSON.stringify(body.component.occurrencePath) === selected)
      .map(({ body }) => [assemblyComponentKey(body.component), body.component]))
    return matches.size === 1 ? { kind: 'component', component: structuredClone(matches.values().next().value!) } : { kind: 'background' }
  }
  const reference = pickAssemblyOrigin(camera, state.originReferences ?? [], assemblyOriginExtent(state.scene.visibleBounds), pointer, size)
  if (reference) return { kind: 'origin', reference }
  const component = pickAssemblyComponent(camera, bodies, pointer, size)
  return component ? { kind: 'component', component } : { kind: 'background' }
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
  originReferences?: readonly AssemblyOriginDisplay[]
  /** Reserved presentation band for an owning workspace toolbar; witnesses stay unchanged. */
  originLabelTopInset?: number
  selectedOrigins?: readonly AssemblyOriginReference[]
  pickingOrigins?: boolean
  onOrigin?: (reference: AssemblyOriginReference | null) => void
  selectedAnalysisPair?: AnalysisPair | null
  pickingFaces?: boolean
  pickingEdges?: boolean
  pickingVertices?: boolean
  disabled?: boolean
  /** UI navigation ownership, independent of the native scene generation. */
  interactionRevision?: number
  drag?: { frame: AssemblyDragFrame; mode: 'translate' | 'rotate'; active: boolean }
  onDragStart?: () => boolean
  onDragTarget?: (worldPose: RigidPose) => void
  onDragEnd?: () => void
  onDragCancel?: () => void
  view?: ViewRequest
  viewHistory?: ViewHistory
  onComponent: (component: AssemblyComponentReference | null) => void
  onViewSelection?: (selection: AssemblyViewportViewSelection) => void
  onFace: (face: AssemblySceneFace | null) => void
  onEdge?: (edge: AssemblySceneEdge | null) => void
  onVertex?: (vertex: AssemblySceneVertex | null) => void
  onContextTarget?: (target: AssemblyViewportContextTarget) => void
}
export default function AssemblyViewport(props: AssemblyViewportProps) {
  const localViewHistory = useRef(createViewHistory())
  const navigationHistory = props.viewHistory ?? localViewHistory.current
  const host = useRef<HTMLDivElement>(null), input = useRef(props); input.current = props
  const [dragAxis, setDragAxis] = useState<string | null>(null)
  const [originLabelState, setOriginLabelState] = useState(() => ({ layout: layoutAssemblyOriginLabels([], { width: 0, height: 0 }, { topInset: props.originLabelTopInset }), signature: '', width: 0, height: 0, topInset: props.originLabelTopInset ?? 0 }))
  const originLabelFrame = useRef(''), originLabelPress = useRef<{ key: string; signature: string; revision: number | undefined } | null>(null)
  const originFrame = useRef('')
  const originCatalog = (value: AssemblyViewportProps) => JSON.stringify([value.originReferences, value.scene?.visibleBounds])
  const context = useRef<{ scene: AssemblyScene | null; group: THREE.Group; analysis: THREE.Group; markers: THREE.Group; clearHover: () => void; camera: THREE.OrthographicCamera; controls: OrbitControls; bodies: AssemblyPickBody[]; faces: AssemblyPickFace[]; edges: AssemblyPickEdge[]; fit: () => void; navigation: ReturnType<typeof bindViewNavigation>; highlight: () => void; syncDrag: () => void } | null>(null)
  useEffect(() => {
    const element = host.current!, world = new THREE.Scene(), group = new THREE.Group(), analysis = new THREE.Group(), markers = new THREE.Group(), origins = new THREE.Group()
    const camera = new THREE.OrthographicCamera(-80, 80, 60, -60, .01, 100000); camera.up.set(0, 1, 0); camera.position.set(100, 100, 140)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setClearColor(0xffffff, 0)
    element.appendChild(renderer.domElement); world.add(group, analysis, markers, origins)
    world.add(new THREE.HemisphereLight(0xffffff, 0x647e98, 2.4)); const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(70, -80, 120); world.add(light)
    // Register the manipulator first so it can claim a pointer before camera orbit.
    const transform = new TransformControls(camera, renderer.domElement), proxy = createAssemblyDragProxy(identityRigidPose())
    const helper = transform.getHelper(); world.add(proxy, helper); transform.enabled = false
    transform.setSize(.9)
    let controls = new OrbitControls(camera, renderer.domElement)
    configureCadNavigation(controls)
    const selectionGesture = createCadSelectionGesture()
    let acceptedGesture = false, dragConsumed = false
    let contextPress: { x: number; y: number; scene: AssemblyScene | null; catalog: string; moved: boolean; revision: number | undefined } | null = null
    let presentedScene: AssemblyScene | null = null
    let viewPressScene: AssemblyScene | null = null
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
    const pointerCancel = () => { selectionGesture.cancel(); contextPress = null; viewPressScene = null; cancelDrag(); navigation.cancelGesture() }
    transform.addEventListener('mouseDown', dragStart); transform.addEventListener('objectChange', dragTarget)
    transform.addEventListener('mouseUp', dragEnd); transform.addEventListener('axis-changed', axisChanged)
    window.addEventListener('keydown', keyDown); window.addEventListener('blur', pointerCancel); renderer.domElement.addEventListener('pointercancel', pointerCancel)
    const fitRaw = () => {
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
      const direction = camera.position.clone().sub(controls.target).normalize(); if (direction.lengthSq() === 0) direction.set(1, 1, 1).normalize()
      controls.target.copy(center); camera.position.copy(center).addScaledVector(direction, span * 2)
      const aspect = Math.max(element.clientWidth, 1) / Math.max(element.clientHeight, 1)
      camera.top = span * .65; camera.bottom = -camera.top; camera.right = camera.top * aspect; camera.left = -camera.right
      camera.near = Math.max(.001, span * .001); camera.far = span * 20; camera.zoom = 1; camera.updateProjectionMatrix(); controls.update()
    }
    const navigation = bindViewNavigation(navigationHistory, camera, controls, fitRaw, () => Math.max(element.clientWidth, 1) / Math.max(element.clientHeight, 1), () => {
      const position = camera.position.clone(), target = controls.target.clone(), enabled = controls.enabled
      controls.removeEventListener('start', pointerLeave); controls.dispose()
      controls = new OrbitControls(camera, renderer.domElement)
      configureCadNavigation(controls); controls.enabled = enabled
      controls.target.copy(target); camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld()
      controls.addEventListener('start', pointerLeave)
      if (context.current) context.current.controls = controls
      return controls
    })
    const fit = () => navigation.automatic(fitRaw)
    let hovered: string | null = null, hoveredEdge: string | null = null, hoveredVertex: string | null = null, hoveredOrigin: string | null = null, originVisualSignature = '', labelSignature = '', displayedOriginCatalog = '', originPressCatalog = ''
    const clearHover = () => { hovered = null; hoveredEdge = null; hoveredVertex = null; hoveredOrigin = null }
    const highlight = () => {
      const current = context.current; if (!current) return
      const signature = JSON.stringify([input.current.originReferences, input.current.selectedOrigins, input.current.disabled ? null : hoveredOrigin, input.current.scene?.visibleBounds])
      if (signature !== originVisualSignature) {
        originVisualSignature = signature; disposeDisplay(origins); origins.clear()
        origins.add(createAssemblyOriginOverlay(input.current.originReferences ?? [], assemblyOriginExtent(input.current.scene?.visibleBounds), input.current.selectedOrigins, input.current.disabled ? null : hoveredOrigin))
        displayedOriginCatalog = originCatalog(input.current)
      }
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
    context.current = { navigation, scene: null, group, analysis, markers, clearHover, camera, controls, bodies: [], faces: [], edges: [], fit, highlight, syncDrag }
    const size = () => ({ width: element.clientWidth, height: element.clientHeight })
    const renderFrame = () => {
      // Direct controls update in their input handlers and explicit Fit calls.
      navigation.afterUpdate(); renderer.render(world, camera)
      presentedScene = context.current?.scene ?? null
      originFrame.current = displayedOriginCatalog
      const width = element.clientWidth, height = element.clientHeight
      const topInset = input.current.originLabelTopInset ?? 0
      const labels = assemblyOriginLabels(camera, input.current.originReferences ?? [], assemblyOriginExtent(input.current.scene?.visibleBounds), { width, height }), signature = JSON.stringify([width, height, topInset, labels])
      originLabelFrame.current = signature
      if (signature !== labelSignature) { labelSignature = signature; setOriginLabelState({ layout: layoutAssemblyOriginLabels(labels, { width, height }, { topInset }), signature, width, height, topInset }) }
    }
    const resize = new ResizeObserver(() => {
      renderer.setSize(element.clientWidth, element.clientHeight)
      const aspect = Math.max(element.clientWidth, 1) / Math.max(element.clientHeight, 1)
      camera.right = camera.top * aspect; camera.left = -camera.right; camera.updateProjectionMatrix(); context.current?.highlight()
      // A newly opened status/tool row changes the viewport. Its labels must
      // follow that resize before the next pointer press, even in a hidden tab.
      renderFrame()
    })
    resize.observe(element)
    const point = (event: PointerEvent) => { const rect = element.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
    const pointerDown = (event: PointerEvent) => {
      selectionGesture.down(event, input.current.interactionRevision); dragConsumed = false
      const value = input.current
      viewPressScene = event.button === 0 && !value.disabled && assemblyReferencePickMode(value) === null
        && presentedScene === value.scene ? presentedScene : null
      contextPress = event.button === 2 && value.onContextTarget && !value.disabled && !acceptedGesture && !value.drag?.active && assemblyReferencePickMode(value) === null
        ? { x: event.clientX, y: event.clientY, scene: presentedScene, catalog: originFrame.current, moved: false, revision: value.interactionRevision } : null
      originPressCatalog = assemblyReferencePickMode(input.current) === 'origin' && originFrame.current === originCatalog(input.current) ? originFrame.current : ''
    }
    const pointerMove = (event: PointerEvent) => {
      selectionGesture.move(event)
      if (contextPress && Math.hypot(event.clientX - contextPress.x, event.clientY - contextPress.y) > 4) contextPress.moved = true
      const current = context.current
      hovered = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'face' && !event.buttons ? (() => { const face = pickAssemblyFace(camera, current.bodies, current.faces, point(event), size()); return face ? assemblyFaceKey(face) : null })() : null
      hoveredEdge = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'edge' && !event.buttons ? (() => { const edge = pickAssemblyEdge(camera, current.bodies, current.edges, point(event), size()); return edge ? assemblyEdgeKey(edge) : null })() : null
      hoveredVertex = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'vertex' && !event.buttons ? (() => { const vertex = pickAssemblyVertex(camera, current.bodies, point(event), size()); return vertex ? assemblyVertexKey(vertex) : null })() : null
      hoveredOrigin = current && !input.current.disabled && assemblyReferencePickMode(input.current) === 'origin' && originFrame.current === originCatalog(input.current) && !event.buttons ? (() => { const origin = pickAssemblyOrigin(camera, input.current.originReferences ?? [], assemblyOriginExtent(input.current.scene?.visibleBounds), point(event), size()); return origin ? assemblyOriginReferenceKey(origin) : null })() : null
      renderer.domElement.style.cursor = acceptedGesture ? 'grabbing' : input.current.disabled ? 'wait' : transform.axis ? 'move' : assemblyReferencePickMode(input.current) !== null ? (hovered || hoveredEdge || hoveredVertex || hoveredOrigin ? 'pointer' : 'crosshair') : event.buttons === 4 ? 'grabbing' : 'default'; highlight()
    }
    const pointerLeave = () => { clearHover(); highlight() }
    controls.addEventListener('start', pointerLeave)
    window.addEventListener('blur', pointerLeave); renderer.domElement.addEventListener('pointercancel', pointerLeave)
    const nominateView = (pointer: { x: number; y: number }, additive: boolean) => {
      const current = context.current, value = input.current
      if (!current || !value.onViewSelection || !value.scene || value.scene !== presentedScene || current.scene !== value.scene
        || value.disabled || acceptedGesture || value.drag?.active || assemblyReferencePickMode(value) !== null) return
      const face = pickAssemblyFace(camera, current.bodies, current.faces, pointer, size())
      const component = pickAssemblyComponent(camera, current.bodies, pointer, size())
      const ray = rayAt(camera, pointer, size())
      const hit = !!ray?.intersectObjects(current.bodies.filter(item => item.body.visible).map(item => item.object), false).length
      value.onViewSelection({ scene: value.scene, face, component, empty: !face && !component && !hit, additive })
    }
    const pointerUp = (event: PointerEvent) => {
      const current = context.current
      const select = selectionGesture.up(event, input.current.interactionRevision)
      const pressedScene = viewPressScene; viewPressScene = null
      if (dragConsumed) { dragConsumed = false; return }
      if (!current || input.current.disabled || !select) return
      const mode = assemblyReferencePickMode(input.current)
      if (mode === 'conflict') return
      if (mode === 'origin') {
        if (originPressCatalog === originFrame.current && originFrame.current === originCatalog(input.current)) input.current.onOrigin?.(pickAssemblyOrigin(camera, input.current.originReferences ?? [], assemblyOriginExtent(input.current.scene?.visibleBounds), point(event), size()))
      }
      else if (mode === 'vertex') input.current.onVertex?.(pickAssemblyVertex(camera, current.bodies, point(event), size()))
      else if (mode === 'edge') input.current.onEdge?.(pickAssemblyEdge(camera, current.bodies, current.edges, point(event), size()))
      else if (mode === 'face') input.current.onFace(pickAssemblyFace(camera, current.bodies, current.faces, point(event), size()))
      else {
        if (pressedScene && pressedScene === presentedScene) nominateView(point(event), event.ctrlKey || event.metaKey)
        input.current.onComponent(pickAssemblyComponent(camera, current.bodies, point(event), size()))
      }
    }
    const openContext = (clientPoint: { x: number; y: number }, keyboard: boolean) => {
      const current = context.current, value = input.current
      if (!current || !value.onContextTarget) return
      const rect = renderer.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0 || Math.abs(rect.width - element.clientWidth) >= 1 || Math.abs(rect.height - element.clientHeight) >= 1) return
      const target = resolveAssemblyViewportContext(camera, current.bodies,
        keyboard ? null : { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top }, size(),
        { ...value, presentedScene, originsCurrent: originFrame.current === originCatalog(value), dragActive: acceptedGesture || !!value.drag?.active })
      if (target) {
        if (!keyboard && target.kind === 'component') nominateView({ x: clientPoint.x - rect.left, y: clientPoint.y - rect.top }, false)
        value.onContextTarget({ ...target, point: clientPoint, restoreFocusElement: element })
      }
    }
    const contextMenu = (event: MouseEvent) => {
      if (!input.current.onContextTarget) return
      event.preventDefault(); event.stopPropagation()
      const press = contextPress; contextPress = null
      if (!press || press.moved || !Object.is(press.revision, input.current.interactionRevision) || press.scene !== presentedScene || press.catalog !== originFrame.current || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) return
      openContext({ x: event.clientX, y: event.clientY }, false)
    }
    const contextKey = (event: KeyboardEvent) => {
      if (event.target !== element || !input.current.onContextTarget || event.altKey || event.ctrlKey || event.metaKey
        || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey)) return
      event.preventDefault(); event.stopPropagation()
      const rect = renderer.domElement.getBoundingClientRect()
      openContext({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, true)
    }
    renderer.domElement.addEventListener('contextmenu', contextMenu); element.addEventListener('keydown', contextKey)
    renderer.domElement.addEventListener('pointerdown', pointerDown, true); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerleave', pointerLeave); renderer.domElement.addEventListener('pointerup', pointerUp)
    let frame = 0; const draw = () => {
      renderFrame()
      frame = requestAnimationFrame(draw)
    }; draw()
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); cancelDrag(); controls.removeEventListener('start', pointerLeave); navigation.dispose(); controls.dispose()
      window.removeEventListener('blur', pointerLeave); renderer.domElement.removeEventListener('pointercancel', pointerLeave)
      disposeAssemblyVertexMarkers(markers)
      transform.removeEventListener('mouseDown', dragStart); transform.removeEventListener('objectChange', dragTarget)
      transform.removeEventListener('mouseUp', dragEnd); transform.removeEventListener('axis-changed', axisChanged); transform.dispose()
      window.removeEventListener('keydown', keyDown); window.removeEventListener('blur', pointerCancel); renderer.domElement.removeEventListener('pointercancel', pointerCancel)
      renderer.domElement.removeEventListener('pointerdown', pointerDown, true); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerleave', pointerLeave); renderer.domElement.removeEventListener('pointerup', pointerUp)
      renderer.domElement.removeEventListener('contextmenu', contextMenu); element.removeEventListener('keydown', contextKey)
      disposeDisplay(group); disposeDisplay(analysis); disposeDisplay(origins)
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
    current.scene = props.scene
    current.highlight(); if (first || props.selectedAnalysisPair) current.fit()
  }, [props.scene, props.selectedAnalysisPair])
  useEffect(() => {
    const current = context.current; if (!current) return
    disposeDisplay(current.analysis); current.analysis.clear()
    const pair = props.selectedAnalysisPair, keys = new Set(props.scene?.bodies.map(body => assemblyBodyKey(body.component, body.body)))
    if (pair && [pair.first, pair.second].every(value => keys.has(assemblyBodyKey(value.component, value.body)))) current.analysis.add(createAssemblyInterferenceOverlay(pair))
  }, [props.scene, props.selectedAnalysisPair])
  useEffect(() => { context.current?.highlight() }, [props.selectedPath, props.selectedFaces, props.selectedEdges, props.selectedVertices, props.originReferences, props.selectedOrigins])
  useEffect(() => { context.current?.clearHover(); context.current?.highlight(); context.current?.syncDrag() }, [props.drag, props.disabled, props.pickingFaces, props.pickingEdges, props.pickingVertices, props.pickingOrigins])
  useEffect(() => {
    const current = context.current; if (!current || !props.view) return
    current.navigation.request(props.view)
  }, [props.view])
  const originButton = (label: AssemblyOriginLabelAnchor, style?: CSSProperties) => <button key={label.key} type="button"
      className={(props.selectedOrigins ?? []).some(ref => assemblyOriginReferenceKey(ref) === label.key) ? 'selected' : ''}
      style={style} aria-label={`Seleccionar ${label.label}`} title={label.label} data-origin-key={label.key}
      disabled={!!props.disabled || originLabelState.topInset !== (props.originLabelTopInset ?? 0) || !originLabelState.layout.usable || assemblyReferencePickMode(props) !== 'origin'}
      onPointerDown={() => { originLabelPress.current = { key: label.key, signature: originLabelState.signature, revision: input.current.interactionRevision } }}
      onPointerCancel={() => { originLabelPress.current = null }} onClick={event => {
        const press = originLabelPress.current; originLabelPress.current = null
        if (originLabelState.topInset !== (input.current.originLabelTopInset ?? 0) || originLabelFrame.current !== originLabelState.signature || host.current?.clientWidth !== originLabelState.width || host.current?.clientHeight !== originLabelState.height
          || event.detail > 0 && (press?.key !== label.key || press.signature !== originLabelState.signature || !Object.is(press.revision, input.current.interactionRevision))) return
        const value = input.current, matches = (value.originReferences ?? []).filter(entry => entry.key === label.key)
          if (!value.disabled && assemblyReferencePickMode(value) === 'origin' && originFrame.current === originCatalog(value) && matches.length === 1 && assemblyOriginDisplayBinding(matches[0]) === label.binding) value.onOrigin?.(structuredClone(matches[0].reference))
      }}>{label.label}</button>
  return <div className="assembly-viewport" ref={host} tabIndex={props.onContextTarget ? 0 : undefined} aria-label="Visor 3D del ensamblaje" data-analysis-pair={props.selectedAnalysisPair?.id} data-drag-axis={dragAxis ?? ''} data-reference-picking={assemblyReferencePickMode(props) ?? ''}>
    <div className="assembly-origin-labels" aria-label="Referencias de origen visibles">
      <svg className="assembly-origin-leaders" aria-hidden="true">{originLabelState.layout.labels.map(label => <line key={label.key}
        x1={label.x} y1={label.y} x2={Math.max(label.left, Math.min(label.left + label.width, label.x))} y2={Math.max(label.top, Math.min(label.top + label.height, label.y))} />)}</svg>
      {originLabelState.layout.labels.map(label => originButton(label, { left: label.left, top: label.top, width: label.width, height: label.height }))}
      {originLabelState.layout.overflow.length > 0 && <div className="assembly-origin-overflow" role="group" aria-label="Referencias de origen en lista" style={{ width: originLabelState.layout.width, top: originLabelState.topInset + 4, maxHeight: `calc(100% - ${originLabelState.topInset + 8}px)` }}>
        <span>Referencias de origen · {originLabelState.layout.overflow.length}</span>
        {originLabelState.layout.overflow.map(label => originButton(label))}
      </div>}
    </div>
    <span className="assembly-axis-label">X · Y · Z{props.drag && <output aria-label="Eje del manipulador"> · {dragAxis ?? 'Selecciona un eje'}</output>}</span></div>
}
