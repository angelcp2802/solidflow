import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { BodyReference, CadResult, EdgeReference, FaceReference, PickableFace, PlaneFrame } from "../cad/kernel.types";
import { sameBodyReference } from "../model/bodyCommands";
import { createEdgeSelectionIndex, createFaceSelectionIndex, referenceIdentity } from "../cad/selection.references";

interface PickableVisual {
  ref: EdgeReference;
  aliases?: readonly EdgeReference[];
  object: THREE.LineSegments;
  highlight?: LineSegments2;
}

interface SketchVisualObjects {
  id: string;
  objects: LineSegments2[];
}

interface FaceVisualObject { face: PickableFace; object: THREE.Mesh }
interface BodyVisualObject { ref: BodyReference; object: THREE.Mesh }
interface PlaneVisualObject { id: string; object: THREE.Mesh; border?: THREE.LineSegments; normal?: THREE.ArrowHelper }

function screenRay(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, pointer: { x: number; y: number }, viewport: { width: number; height: number }): THREE.Raycaster | null {
  if (viewport.width <= 0 || viewport.height <= 0 || pointer.x < 0 || pointer.y < 0 || pointer.x > viewport.width || pointer.y > viewport.height) return null;
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(pointer.x / viewport.width * 2 - 1, 1 - pointer.y / viewport.height * 2), camera);
  ray.near = camera.near; ray.far = camera.far;
  return ray;
}

/** Pick actual triangles on the frontmost face, including unsupported curved faces. */
export function pickVisibleFace(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, faces: FaceVisualObject[], pointer: { x: number; y: number }, viewport: { width: number; height: number }, body: THREE.Mesh | null = null): PickableFace | null {
  const ray = screenRay(camera, pointer, viewport);
  if (!ray) return null;
  faces.forEach(face => face.object.updateMatrixWorld());
  const byObject = new Map(faces.map(face => [face.object, face.face]));
  const hit = ray.intersectObjects(faces.map(face => face.object), false)[0];
  if (!hit) return null;
  body?.updateMatrixWorld();
  const surface = body ? ray.intersectObject(body, false)[0] : undefined;
  if (surface && surface.distance < hit.distance - Math.max(1e-5, hit.distance * 1e-7)) return null;
  return hit ? byObject.get(hit.object as THREE.Mesh) ?? null : null;
}

/** Frontmost body triangles; coincident hits on different bodies are ambiguous. */
export function pickVisibleBody(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, bodies: BodyVisualObject[], pointer: { x: number; y: number }, viewport: { width: number; height: number }): BodyReference | null {
  const ray = screenRay(camera, pointer, viewport);
  if (!ray) return null;
  bodies.forEach(body => body.object.updateMatrixWorld());
  const hits = ray.intersectObjects(bodies.map(body => body.object), false);
  if (!hits.length) return null;
  const nearest = hits[0].distance, tolerance = Math.max(1e-5, nearest * 1e-7);
  const references = new Map<string, BodyReference>();
  for (const hit of hits) {
    if (hit.distance > nearest + tolerance) break;
    const reference = bodies.find(body => body.object === hit.object)?.ref;
    if (reference) references.set(JSON.stringify([reference.bodyId, reference.sourceFeatureId]), reference);
  }
  return references.size === 1 ? { ...references.values().next().value! } : null;
}

/** Hidden planes and planes behind opaque material cannot receive a click. */
export function pickVisiblePlane(camera: THREE.OrthographicCamera | THREE.PerspectiveCamera, body: THREE.Mesh | null, planes: PlaneVisualObject[], pointer: { x: number; y: number }, viewport: { width: number; height: number }): string | null {
  const ray = screenRay(camera, pointer, viewport);
  if (!ray) return null;
  const visible = planes.filter(plane => plane.object.visible);
  visible.forEach(plane => plane.object.updateMatrixWorld());
  const hit = ray.intersectObjects(visible.map(plane => plane.object), false)[0];
  if (!hit) return null;
  body?.updateMatrixWorld();
  const surface = body ? ray.intersectObject(body, false)[0] : undefined;
  if (surface && surface.distance < hit.distance - Math.max(1e-5, hit.distance * 1e-7)) return null;
  return visible.find(plane => plane.object === hit.object)?.id ?? null;
}

function planeCorners(frame: PlaneFrame, span: number): number[] {
  const origin = new THREE.Vector3(...frame.origin), x = new THREE.Vector3(...frame.xDirection).normalize();
  const y = new THREE.Vector3(...frame.normal).cross(x).normalize();
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([u, v]) => origin.clone().addScaledVector(x, u * span / 2).addScaledVector(y, v * span / 2).toArray());
}

const edgeIdentity = referenceIdentity;

/** Pixel-sized picking, followed by a face-depth test at the actual edge point. */
export function pickVisibleEdge(
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera,
  body: THREE.Mesh,
  edges: PickableVisual[],
  pointer: { x: number; y: number },
  viewport: { width: number; height: number },
  tolerance = 8,
): EdgeReference | null {
  if (!edges.length || viewport.width <= 0 || viewport.height <= 0) return null;
  camera.updateMatrixWorld();
  body.updateMatrixWorld();
  const bounds = new THREE.Box3().setFromObject(body);
  const size = bounds.getSize(new THREE.Vector3()).length();
  const farDepth = camera.position.distanceTo(bounds.getCenter(new THREE.Vector3())) + size / 2;
  const worldPerPixel = camera instanceof THREE.OrthographicCamera
    ? (camera.top - camera.bottom) / (camera.zoom * viewport.height)
    : 2 * farDepth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (camera.zoom * viewport.height);
  const ray = new THREE.Raycaster();
  ray.params.Line.threshold = tolerance * worldPerPixel;
  ray.setFromCamera(new THREE.Vector2(pointer.x / viewport.width * 2 - 1, -pointer.y / viewport.height * 2 + 1), camera);
  const byObject = new Map(edges.map((edge) => [edge.object, edge.ref]));
  const hits = ray.intersectObjects(edges.map((edge) => edge.object), false);
  const surfaceRay = new THREE.Raycaster();
  let selected: EdgeReference | null = null;
  let bestDistance = tolerance;
  let bestDepth = Infinity;
  const depthTolerance = Math.max(size * 1e-7, Math.min(0.06, worldPerPixel * 0.15));
  for (const hit of hits) {
    const projected = hit.point.clone().project(camera);
    if (projected.z < -1 || projected.z > 1) continue;
    const dx = (projected.x + 1) * viewport.width / 2 - pointer.x;
    const dy = (1 - projected.y) * viewport.height / 2 - pointer.y;
    const pixels = Math.hypot(dx, dy);
    if (pixels > tolerance || pixels > bestDistance + 0.15) continue;
    surfaceRay.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
    const depth = hit.point.clone().sub(surfaceRay.ray.origin).dot(surfaceRay.ray.direction);
    const surface = surfaceRay.intersectObject(body, false)[0];
    if (surface && surface.distance < depth - depthTolerance) continue;
    if (pixels < bestDistance - 0.15 || depth < bestDepth) {
      selected = byObject.get(hit.object as THREE.LineSegments) ?? null;
      bestDistance = pixels;
      bestDepth = depth;
    }
  }
  return selected;
}

export type ViewName =
  "iso" | "front" | "back" | "left" | "right" | "top" | "bottom" | "fit";
interface Props {
  model: CadResult | null;
  view: { name: ViewName; stamp: number };
  display: "shaded" | "edges" | "wire";
  grid: boolean;
  selected: boolean;
  onSelect: () => void;
  selectedBodies?: readonly BodyReference[];
  onSelectBody?: (reference: BodyReference) => void;
  selectionMode?: "body" | "edge" | "face";
  selectedEdges?: EdgeReference[];
  onSelectEdge?: (ref: EdgeReference) => void;
  selectedFace?: FaceReference | null;
  selectedFaces?: FaceReference[];
  onSelectFace?: (face: PickableFace | null) => void;
  selectedPlaneId?: string;
  showPlanes?: boolean;
  onSelectPlane?: (planeId: string) => void;
  visibleSketchIds?: string[];
  selectedSketchId?: string;
}
export default function Viewport({
  model,
  view,
  display,
  grid,
  selected,
  onSelect,
  selectedBodies = [],
  onSelectBody,
  selectionMode = "body",
  selectedEdges = [],
  onSelectEdge,
  selectedFace,
  selectedFaces = [],
  onSelectFace,
  selectedPlaneId,
  showPlanes = false,
  onSelectPlane,
  visibleSketchIds,
  selectedSketchId,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const context = useRef<{
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    group: THREE.Group;
    sketchGroup: THREE.Group;
    faceGroup: THREE.Group;
    planeGroup: THREE.Group;
    sketches: SketchVisualObjects[];
    body: THREE.Mesh | null;
    bodies: BodyVisualObject[];
    edges: PickableVisual[];
    faces: FaceVisualObject[];
    planes: PlaneVisualObject[];
    updateHighlights: () => void;
    updateSketches: (autoFit?: boolean) => void;
    updatePlanes: (autoFit?: boolean) => void;
    grid: THREE.GridHelper;
    fit: () => void;
  } | null>(null);
  const edgeReferences = useMemo(() => createEdgeSelectionIndex(model?.edges ?? []), [model]);
  const faceReferences = useMemo(() => createFaceSelectionIndex(model?.faces ?? []), [model]);
  const interaction = useRef({ onSelect, onSelectBody, selectedBodies, onSelectEdge, selectionMode, selectedEdges, visibleSketchIds, selectedSketchId, selectedFace, selectedFaces, onSelectFace, selectedPlaneId, showPlanes, onSelectPlane, edgeReferences, faceReferences });
  interaction.current = { onSelect, onSelectBody, selectedBodies, onSelectEdge, selectionMode, selectedEdges, visibleSketchIds, selectedSketchId, selectedFace, selectedFaces, onSelectFace, selectedPlaneId, showPlanes, onSelectPlane, edgeReferences, faceReferences };
  useEffect(() => {
    const el = host.current!;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -130,
      130,
      100,
      -100,
      0.1,
      10000,
    );
    camera.up.set(0, 1, 0);
    camera.position.set(150, 150, 210);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    scene.add(new THREE.HemisphereLight(0xf5f9ff, 0x657b92, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-120, 250, 160);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcdcff, 1.8);
    fill.position.set(150, 70, -80);
    scene.add(fill);
    const group = new THREE.Group();
    scene.add(group);
    const sketchGroup = new THREE.Group();
    scene.add(sketchGroup);
    const faceGroup = new THREE.Group(), planeGroup = new THREE.Group();
    scene.add(faceGroup, planeGroup);
    const floor = new THREE.GridHelper(400, 40, 0x9fb2c5, 0xd6dfe6);
    floor.position.y = -0.05;
    floor.material.transparent = true;
    floor.material.opacity = 0.42;
    scene.add(floor);
    const fit = () => {
      const box = new THREE.Box3().setFromObject(group);
      context.current?.sketches.forEach((sketch) => sketch.objects.forEach((object) => {
        if (object.visible) box.expandByObject(object);
      }));
      context.current?.planes.forEach(plane => { if (plane.object.visible) box.expandByObject(plane.object); });
      const center = box.isEmpty()
        ? new THREE.Vector3()
        : box.getCenter(new THREE.Vector3());
      const size = box.isEmpty()
        ? 120
        : Math.max(...box.getSize(new THREE.Vector3()).toArray(), 30);
      const dir = camera.position.clone().sub(controls.target).normalize();
      if (dir.lengthSq() === 0) dir.set(1, 1, 1.4).normalize();
      controls.target.copy(center);
      camera.position.copy(center).add(dir.multiplyScalar(size * 3));
      const aspect = Math.max(el.clientWidth, 1) / Math.max(el.clientHeight, 1);
      const extent = (size * 0.82) / Math.min(aspect, 1);
      camera.top = extent;
      camera.bottom = -extent;
      camera.left = -extent * aspect;
      camera.right = extent * aspect;
      camera.near = 0.1;
      camera.far = Math.max(size * 20, 10000);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    };
    context.current = {
      scene,
      camera,
      renderer,
      controls,
      group,
      sketchGroup,
      faceGroup,
      planeGroup,
      sketches: [],
      body: null,
      bodies: [],
      edges: [],
      faces: [],
      planes: [],
      updateHighlights: () => {},
      updateSketches: () => {},
      updatePlanes: () => {},
      grid: floor,
      fit,
    };
    context.current.updatePlanes = (autoFit = true) => {
      const current = context.current;
      if (!current) return;
      const previouslyVisible = !!current.body || current.sketches.some(sketch => sketch.objects.some(object => object.visible)) || current.planes.some(plane => plane.object.visible);
      for (const plane of current.planes) {
        const selected = plane.id === interaction.current.selectedPlaneId;
        plane.object.visible = selected || interaction.current.showPlanes;
        const material = plane.object.material as THREE.MeshBasicMaterial;
        material.color.setHex(selected ? 0xe58b23 : 0x3c8fcd);
        material.opacity = selected ? .16 : .08;
        if (plane.border) {
          plane.border.visible = plane.object.visible;
          (plane.border.material as THREE.LineBasicMaterial).color.setHex(selected ? 0xe58b23 : 0x3c8fcd);
        }
        if (plane.normal) {
          plane.normal.visible = plane.object.visible;
          plane.normal.setColor(selected ? 0xe58b23 : 0x3c8fcd);
        }
      }
      if (autoFit && !previouslyVisible && current.planes.some(plane => plane.object.visible)) fit();
    };
    context.current.updateSketches = (autoFit = true) => {
      const current = context.current;
      if (!current) return;
      const previouslyVisible = !!current.body || current.sketches.some((sketch) => sketch.objects.some((object) => object.visible));
      const visible = interaction.current.visibleSketchIds === undefined ? null : new Set(interaction.current.visibleSketchIds);
      for (const sketch of current.sketches) {
        const isSelected = sketch.id === interaction.current.selectedSketchId;
        for (const object of sketch.objects) {
          const construction = object.userData.construction === true;
          object.visible = isSelected || visible === null || visible.has(sketch.id);
          object.material.color.setHex(isSelected ? 0xe58b23 : construction ? 0x5798cc : 0x1678cb);
          object.material.linewidth = isSelected ? 2.5 : construction ? 1.3 : 1.8;
          object.material.opacity = construction ? .72 : 1;
        }
      }
      if (autoFit && !previouslyVisible && current.sketches.some((sketch) => sketch.objects.some((object) => object.visible))) fit();
    };
    const triad = document.createElement("canvas");
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    triad.width = 90 * pixelRatio;
    triad.height = 80 * pixelRatio;
    triad.setAttribute("role", "img");
    triad.setAttribute("aria-label", "Orientación actual: ejes X, Y y Z");
    Object.assign(triad.style, {
      position: "absolute",
      bottom: "35px",
      left: "18px",
      width: "90px",
      height: "80px",
      pointerEvents: "none",
      zIndex: "3",
    });
    el.appendChild(triad);
    const pen = triad.getContext("2d");
    pen?.scale(pixelRatio, pixelRatio);
    const inverseCamera = new THREE.Quaternion();
    const axes = [
      {
        label: "X",
        color: "#c84f4b",
        direction: new THREE.Vector3(1, 0, 0),
        projected: new THREE.Vector3(),
      },
      {
        label: "Y",
        color: "#43995d",
        direction: new THREE.Vector3(0, 1, 0),
        projected: new THREE.Vector3(),
      },
      {
        label: "Z",
        color: "#267fc1",
        direction: new THREE.Vector3(0, 0, 1),
        projected: new THREE.Vector3(),
      },
    ];
    const drawTriad = () => {
      if (!pen) return;
      pen.clearRect(0, 0, 90, 80);
      inverseCamera.copy(camera.quaternion).invert();
      axes.forEach((axis) =>
        axis.projected.copy(axis.direction).applyQuaternion(inverseCamera),
      );
      axes.sort((a, b) => a.projected.z - b.projected.z);
      pen.font = "600 11px Segoe UI, sans-serif";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.lineWidth = 1.8;
      pen.lineCap = "round";
      const x = 42,
        y = 43,
        length = 27;
      for (const axis of axes) {
        const dx = axis.projected.x,
          dy = -axis.projected.y,
          screenLength = Math.hypot(dx, dy);
        pen.strokeStyle = axis.color;
        pen.fillStyle = axis.color;
        if (screenLength < 0.08) {
          // An axis pointing toward the viewer appears as a dot at the origin.
          pen.beginPath();
          pen.arc(x, y, 2.8, 0, Math.PI * 2);
          pen.fill();
          pen.fillText(axis.label, x + 11, y + 10);
          continue;
        }
        const endX = x + dx * length,
          endY = y + dy * length,
          ux = dx / screenLength,
          uy = dy / screenLength;
        pen.beginPath();
        pen.moveTo(x, y);
        pen.lineTo(endX, endY);
        pen.stroke();
        pen.beginPath();
        pen.moveTo(endX, endY);
        pen.lineTo(endX - ux * 5 - uy * 2.5, endY - uy * 5 + ux * 2.5);
        pen.lineTo(endX - ux * 5 + uy * 2.5, endY - uy * 5 - ux * 2.5);
        pen.closePath();
        pen.fill();
        pen.fillText(axis.label, endX + ux * 9, endY + uy * 9);
      }
      pen.fillStyle = "#748697";
      pen.beginPath();
      pen.arc(x, y, 2, 0, Math.PI * 2);
      pen.fill();
    };
    const resize = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      const half = camera.top;
      camera.left = (-half * Math.max(el.clientWidth, 1)) / Math.max(el.clientHeight, 1);
      camera.right = -camera.left;
      camera.updateProjectionMatrix();
      context.current?.edges.forEach((edge) => edge.highlight?.material.resolution.set(el.clientWidth, el.clientHeight));
      context.current?.sketches.forEach((sketch) => sketch.objects.forEach((object) => object.material.resolution.set(el.clientWidth, el.clientHeight)));
    });
    resize.observe(el);
    let down = [0, 0];
    let hoverPointer: { x: number; y: number } | null = null;
    let hoverDirty = false;
    let hovered: string | null = null;
    let hoveredFace: string | null = null;
    let hoveredPlane: string | null = null;
    const updateHighlights = () => {
      context.current?.bodies.forEach(body => {
        const material = body.object.material as THREE.MeshBasicMaterial;
        material.opacity = interaction.current.selectedBodies.some(reference => sameBodyReference(reference, body.ref)) ? .36 : 0;
      });
      const selectedKeys = interaction.current.edgeReferences.selectedKeys(interaction.current.selectedEdges);
      if (interaction.current.selectionMode !== 'edge' || !context.current?.edges.some((edge) => edgeIdentity(edge.ref) === hovered)) hovered = null;
      context.current?.edges.forEach((edge) => {
        if (!edge.highlight) return;
        const key = edgeIdentity(edge.ref);
        const isSelected = selectedKeys.has(key);
        const isHovered = key === hovered;
        edge.highlight.visible = isSelected || isHovered;
        edge.highlight.material.color.setHex(isSelected ? 0xe58b23 : 0xffbd57);
        edge.highlight.material.linewidth = isSelected ? 3.3 : 2.8;
      });
      if (interaction.current.selectionMode !== 'face') hoveredFace = null;
      const selectedFaces = interaction.current.selectedFace
        ? [...interaction.current.selectedFaces, interaction.current.selectedFace]
        : interaction.current.selectedFaces;
      const selectedFaceKeys = interaction.current.faceReferences.selectedKeys(selectedFaces);
      context.current?.faces.forEach(face => {
        const key = edgeIdentity(face.face.ref);
        const isSelected = selectedFaceKeys.has(key);
        face.object.visible = isSelected || key === hoveredFace;
        const material = face.object.material as THREE.MeshBasicMaterial;
        material.color.setHex(isSelected ? 0xe58b23 : 0xffbd57);
        material.opacity = isSelected ? .48 : .24;
      });
      context.current?.planes.forEach(plane => {
        if (plane.border) (plane.border.material as THREE.LineBasicMaterial).color.setHex(plane.id === interaction.current.selectedPlaneId ? 0xe58b23 : plane.id === hoveredPlane ? 0xffbd57 : 0x3c8fcd);
      });
      renderer.domElement.style.cursor = interaction.current.selectionMode === 'edge' ? (hovered ? 'pointer' : 'crosshair') : interaction.current.selectionMode === 'face' ? (hoveredFace || hoveredPlane ? 'pointer' : 'crosshair') : hoveredPlane ? 'pointer' : '';
    };
    context.current.updateHighlights = updateHighlights;
    const pick = (x: number, y: number) => {
      const current = context.current;
      if (!current?.body) return null;
      return pickVisibleEdge(camera, current.body, current.edges, { x, y }, { width: el.clientWidth, height: el.clientHeight });
    };
    const pickFace = (x: number, y: number) => pickVisibleFace(camera, context.current?.faces ?? [], { x, y }, { width: el.clientWidth, height: el.clientHeight }, context.current?.body ?? null);
    const pickPlane = (x: number, y: number) => interaction.current.onSelectPlane ? pickVisiblePlane(camera, context.current?.body ?? null, context.current?.planes ?? [], { x, y }, { width: el.clientWidth, height: el.clientHeight }) : null;
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
      hovered = null;
      hoveredFace = null; hoveredPlane = null;
      updateHighlights();
    };
    const pointerMove = (e: PointerEvent) => {
      if (e.buttons) {
        hoverPointer = null;
        hovered = null;
        hoveredFace = null; hoveredPlane = null;
        updateHighlights();
        return;
      }
      const rect = el.getBoundingClientRect();
      hoverPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      hoverDirty = true;
    };
    const pointerLeave = () => {
      hoverPointer = null;
      hovered = null;
      hoveredFace = null; hoveredPlane = null;
      updateHighlights();
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4
      )
        return;
      const rect = el.getBoundingClientRect();
      hoverPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      hoverDirty = true;
      if (interaction.current.selectionMode === 'edge') {
        const ref = pick(hoverPointer.x, hoverPointer.y);
        if (ref) interaction.current.onSelectEdge?.({ ...ref });
        return;
      }
      if (interaction.current.selectionMode === 'face') {
        const face = pickFace(hoverPointer.x, hoverPointer.y);
        if (face) interaction.current.onSelectFace?.(face);
        else {
          const planeId = pickPlane(hoverPointer.x, hoverPointer.y);
          if (planeId) interaction.current.onSelectPlane?.(planeId);
          else interaction.current.onSelectFace?.(null);
        }
        return;
      }
      const planeId = pickPlane(hoverPointer.x, hoverPointer.y);
      if (planeId) { interaction.current.onSelectPlane?.(planeId); return; }
      if (interaction.current.onSelectBody && context.current?.bodies.length) {
        const reference = pickVisibleBody(camera, context.current.bodies, hoverPointer, { width: el.clientWidth, height: el.clientHeight });
        if (reference) interaction.current.onSelectBody(reference);
        return;
      }
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const body = context.current?.body;
      if (body && ray.intersectObject(body, false).length) interaction.current.onSelect();
    };
    const cameraChanged = () => { hoverDirty = true; };
    controls.addEventListener('change', cameraChanged);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);
    renderer.setAnimationLoop(() => {
      controls.update();
      if (hoverDirty) {
        hoverDirty = false;
        const ref = hoverPointer && interaction.current.selectionMode === 'edge' ? pick(hoverPointer.x, hoverPointer.y) : null;
        const next = ref ? edgeIdentity(ref) : null;
        const face = hoverPointer && interaction.current.selectionMode === 'face' ? pickFace(hoverPointer.x, hoverPointer.y) : null;
        const nextFace = face ? edgeIdentity(face.ref) : null;
        const nextPlane = hoverPointer && interaction.current.selectionMode !== 'edge' && !face ? pickPlane(hoverPointer.x, hoverPointer.y) : null;
        if (next !== hovered || nextFace !== hoveredFace || nextPlane !== hoveredPlane) {
          hovered = next;
          hoveredFace = nextFace;
          hoveredPlane = nextPlane;
          updateHighlights();
        }
      }
      renderer.render(scene, camera);
      drawTriad();
    });
    return () => {
      resize.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      controls.removeEventListener('change', cameraChanged);
      controls.dispose();
      for (const content of [group, sketchGroup, faceGroup, planeGroup]) content.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      el.replaceChildren();
      context.current = null;
    };
  }, []);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    const previouslyEmpty = c.group.children.length === 0;
    c.body = null;
    c.bodies = [];
    c.edges = [];
    for (const child of [...c.group.children]) {
      c.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (Array.isArray(child.material)
          ? child.material
          : [child.material]
        ).forEach((m) => m.dispose());
      }
    }
    if (!model?.vertices.length) {
      c.updateHighlights();
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(model.vertices, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(model.normals, 3),
    );
    geometry.setIndex(model.triangles);
    const mat = new THREE.MeshStandardMaterial({
      color: selected && selectionMode === 'body' ? 0x57a7ef : 0x8cabc3,
      metalness: 0.38,
      roughness: 0.36,
      side: THREE.DoubleSide,
      wireframe: display === "wire",
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    c.body = new THREE.Mesh(geometry, mat);
    c.group.add(c.body);
    if (model.bodyCatalogActive) for (const body of model.bodies ?? []) {
      const bodyGeometry = new THREE.BufferGeometry();
      bodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(body.vertices, 3));
      bodyGeometry.setIndex(body.triangles);
      const material = new THREE.MeshBasicMaterial({ color: 0xe58b23, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const object = new THREE.Mesh(bodyGeometry, material);
      c.group.add(object);
      c.bodies.push({ ref: { ...body.ref }, object });
    }
    if (model.edges?.length) {
      for (const edge of model.edges) {
        if (edge.lines.length < 6) continue;
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edge.lines, 3));
        const object = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({
          color: selected && selectionMode === 'body' ? 0x145b97 : 0x253f53,
          transparent: true, opacity: 0.82,
        }));
        object.visible = display === 'edges' || selectionMode === 'edge';
        const highlightGeometry = new LineSegmentsGeometry();
        highlightGeometry.setPositions(edge.lines);
        const highlightMaterial = new LineMaterial({
          color: 0xe58b23, linewidth: 3.3, depthTest: true, depthWrite: false,
          transparent: true, opacity: 1,
        });
        highlightMaterial.resolution.set(host.current!.clientWidth, host.current!.clientHeight);
        const highlight = new LineSegments2(highlightGeometry, highlightMaterial);
        highlight.visible = false;
        highlight.renderOrder = 2;
        c.group.add(object, highlight);
        c.edges.push({ ref: edge.ref, aliases: edge.aliases, object, highlight });
      }
    } else if (display === "edges" && model.edgeLines.length) {
      const edges = new THREE.BufferGeometry();
      edges.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(model.edgeLines, 3),
      );
      c.group.add(
        new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: selected ? 0x145b97 : 0x253f53,
            transparent: true,
            opacity: 0.82,
          }),
        ),
      );
    }
    c.updateHighlights();
    // A new document fits once its first body arrives; parameter edits preserve the camera.
    if (previouslyEmpty) c.fit();
  }, [model, display, selected, selectionMode]);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    for (const child of [...c.faceGroup.children, ...c.planeGroup.children]) {
      child.removeFromParent();
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose());
      }
      if (child instanceof THREE.ArrowHelper) child.dispose();
    }
    const previouslyVisible = !!c.body || c.sketches.some(sketch => sketch.objects.some(object => object.visible)) || c.planes.some(plane => plane.object.visible);
    c.faces = [];
    c.planes = [];
    for (const face of model?.faces ?? []) {
      if (face.vertices.length < 9 || face.triangles.length < 3) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices, 3));
      geometry.setIndex(face.triangles);
      const material = new THREE.MeshBasicMaterial({ color: 0xe58b23, transparent: true, opacity: .48,
        side: THREE.DoubleSide, depthTest: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      const object = new THREE.Mesh(geometry, material);
      object.visible = false;
      object.renderOrder = 2;
      c.faceGroup.add(object);
      c.faces.push({ face, object });
    }
    const bodySize = c.body ? new THREE.Box3().setFromObject(c.body).getSize(new THREE.Vector3()) : new THREE.Vector3();
    const span = Math.max(100, Math.max(...bodySize.toArray()) * 1.35);
    for (const plane of model?.planes ?? []) {
      const corners = planeCorners(plane.frame, span);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      const material = new THREE.MeshBasicMaterial({ color: 0x3c8fcd, transparent: true, opacity: .08,
        side: THREE.DoubleSide, depthTest: true, depthWrite: false });
      const object = new THREE.Mesh(geometry, material);
      object.visible = false;
      object.renderOrder = 1;
      const borderGeometry = new THREE.BufferGeometry();
      borderGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 1, 2, 2, 3, 3, 0].flatMap(index => corners.slice(index * 3, index * 3 + 3)), 3));
      const border = new THREE.LineSegments(borderGeometry, new THREE.LineBasicMaterial({ color: 0x3c8fcd, depthTest: true, transparent: true, opacity: .9 }));
      border.visible = false;
      border.renderOrder = 1;
      const normal = new THREE.ArrowHelper(new THREE.Vector3(...plane.frame.normal).normalize(), new THREE.Vector3(...plane.frame.origin), span * .18, 0x3c8fcd, span * .045, span * .025);
      normal.visible = false;
      for (const part of [normal.line, normal.cone]) (Array.isArray(part.material) ? part.material : [part.material]).forEach(material => { material.depthTest = false; });
      normal.line.renderOrder = 3;
      normal.cone.renderOrder = 3;
      c.planeGroup.add(object, border, normal);
      c.planes.push({ id: plane.id, object, border, normal });
    }
    c.updatePlanes(false);
    c.updateHighlights();
    if (!previouslyVisible && c.planes.some(plane => plane.object.visible)) c.fit();
  }, [model]);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    const previouslyVisible = !!c.body || c.sketches.some((sketch) => sketch.objects.some((object) => object.visible));
    for (const sketch of c.sketches) for (const object of sketch.objects) {
      c.sketchGroup.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
    c.sketches = [];
    for (const sketch of model?.sketches ?? []) {
      const objects: LineSegments2[] = [];
      for (const [lines, construction] of [[sketch.lines, false], [sketch.constructionLines, true]] as const) {
        if (lines.length < 6) continue;
        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(lines);
        const material = new LineMaterial({ color: 0x1678cb, linewidth: 1.8,
          depthTest: false, depthWrite: false, transparent: true, opacity: 1,
          dashed: construction, dashSize: 3, gapSize: 2 });
        material.resolution.set(host.current!.clientWidth, host.current!.clientHeight);
        const object = new LineSegments2(geometry, material);
        object.userData.construction = construction;
        object.visible = false;
        object.renderOrder = 3;
        if (construction) object.computeLineDistances();
        c.sketchGroup.add(object);
        objects.push(object);
      }
      c.sketches.push({ id: sketch.id, objects });
    }
    c.updateSketches(false);
    if (!previouslyVisible && c.sketches.some((sketch) => sketch.objects.some((object) => object.visible))) c.fit();
  }, [model]);
  useEffect(() => {
    context.current?.updateSketches();
  }, [visibleSketchIds, selectedSketchId]);
  useEffect(() => {
    context.current?.updateHighlights();
  }, [selectedBodies, selectedEdges, selectedFace, selectedFaces, selectionMode]);
  useEffect(() => {
    context.current?.updatePlanes();
    context.current?.updateHighlights();
  }, [selectedPlaneId, showPlanes]);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    const dirs: Record<string, [number, number, number]> = {
      iso: [1, 1, 1.4],
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
    };
    if (view.name !== "fit") {
      const dir = new THREE.Vector3(...dirs[view.name]);
      c.camera.up.set(0, 1, 0);
      if (view.name === "top" || view.name === "bottom")
        c.camera.up.set(0, 0, -1);
      c.camera.position.copy(c.controls.target).add(dir.multiplyScalar(400));
    }
    c.fit();
  }, [view]);
  useEffect(() => {
    if (context.current) context.current.grid.visible = grid;
  }, [grid]);
  return (
    <div
      ref={host}
      className="viewport-canvas"
      aria-label="Vista 3D de la pieza"
    />
  );
}
