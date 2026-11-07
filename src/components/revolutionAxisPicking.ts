import * as THREE from 'three'
import type { CadResult, RevolutionAxis, Vec3 } from '../cad/kernel.types'

/** Presentation candidates carry declarations, never an authoritative geometric axis. */
export interface RevolutionAxisCandidate {
  key: string
  axis: RevolutionAxis
  lines: readonly number[]
  label: string
  material: boolean
}

export function revolutionAxisCandidateKey(axis: RevolutionAxis): string {
  switch (axis.kind) {
    case 'sketch-axis': case 'principal-axis': return JSON.stringify([axis.kind, axis.axis])
    case 'sketch-line': return JSON.stringify([axis.kind, axis.entityId])
    case 'external-sketch-line': return JSON.stringify([axis.kind, axis.sketchId, axis.entityId])
    case 'linear-edge': return JSON.stringify([axis.kind, axis.body?.bodyId ?? null,
      axis.body?.sourceFeatureId ?? null, axis.edge.sourceFeatureId, axis.edge.key])
  }
}

export function revolutionAxisCandidates(model: CadResult | null, profileId: string): RevolutionAxisCandidate[] {
  if (!model || model.featureErrors.length) return []
  const result: RevolutionAxisCandidate[] = []
  const add = (axis: RevolutionAxis, lines: readonly number[], label: string, material = false) => {
    if (lines.length < 6 || lines.length % 6 || !lines.every(Number.isFinite)) return
    result.push({ key: revolutionAxisCandidateKey(axis), axis, lines, label, material })
  }
  let extent = 30
  const include = (values: readonly number[]) => {
    for (const value of values) if (Number.isFinite(value)) extent = Math.max(extent, Math.abs(value))
  }
  include(model.bounds.min); include(model.bounds.max)
  for (const body of model.bodies ?? []) { include(body.bounds.min); include(body.bounds.max) }
  for (const sketch of model.sketches ?? []) {
    include(sketch.lines); include(sketch.constructionLines)
    if (sketch.frame) include(sketch.frame.origin)
  }
  const span = extent * 1.5
  const axisLine = (origin: Vec3, direction: Vec3): number[] =>
    [-1, 1].flatMap(sign => origin.map((value, index) => value + sign * span * direction[index]))
  for (const [index, axis] of ['X', 'Y', 'Z'].entries()) {
    const direction: Vec3 = [0, 0, 0]; direction[index] = 1
    add({ kind: 'principal-axis', axis: axis as 'X' | 'Y' | 'Z' }, axisLine([0, 0, 0], direction), `Eje ${axis} del origen`)
  }
  for (const sketch of model.sketches ?? []) {
    if (sketch.id === profileId && sketch.frame) {
      const frame = sketch.frame
      const y = new THREE.Vector3(...frame.normal).cross(new THREE.Vector3(...frame.xDirection)).normalize().toArray() as Vec3
      add({ kind: 'sketch-axis', axis: 'x' }, axisLine(frame.origin, frame.xDirection), 'Eje X del croquis')
      add({ kind: 'sketch-axis', axis: 'y' }, axisLine(frame.origin, y), 'Eje Y del croquis')
    }
    const entities = sketch.lineEntities ?? [], counts = new Map<string, number>()
    for (const entity of entities) counts.set(entity.entityId, (counts.get(entity.entityId) ?? 0) + 1)
    for (const entity of entities) {
      if (counts.get(entity.entityId) !== 1) continue
      const axis: RevolutionAxis = sketch.id === profileId
        ? { kind: 'sketch-line', entityId: entity.entityId }
        : { kind: 'external-sketch-line', sketchId: sketch.id, entityId: entity.entityId }
      add(axis, [...entity.start, ...entity.end], `Línea ${entity.entityId} · ${sketch.id}`)
    }
  }
  // The explicit body's namespace must travel with its edge, including identical bodies.
  if (model.bodyCatalogActive) {
    for (const body of model.bodies ?? []) for (const edge of body.edges)
      add({ kind: 'linear-edge', body: { ...body.ref }, edge: { ...edge.ref } }, edge.lines, `Arista · ${body.name} · ${body.ref.bodyId}`, true)
  } else for (const edge of model.edges ?? [])
    add({ kind: 'linear-edge', body: null, edge: { ...edge.ref } }, edge.lines, 'Arista de la pieza', true)
  return result
}

/** Pixel picking of the displayed declaration; the kernel still authenticates LINE and coplanarity. */
export function pickRevolutionAxisChoices(camera: THREE.OrthographicCamera, candidates: readonly RevolutionAxisCandidate[],
  pointer: { x: number; y: number }, viewport: { width: number; height: number }, body: THREE.Mesh | null,
  tolerance = 8): RevolutionAxisCandidate[] {
  if (viewport.width <= 0 || viewport.height <= 0 || pointer.x < 0 || pointer.y < 0
    || pointer.x > viewport.width || pointer.y > viewport.height) return []
  camera.updateMatrixWorld(); body?.updateMatrixWorld()
  const hits = new Map<string, { candidate: RevolutionAxisCandidate; pixels: number; depth: number }>()
  const ray = new THREE.Raycaster()
  const worldPerPixel = (camera.top - camera.bottom) / (camera.zoom * viewport.height)
  for (const candidate of candidates) for (let index = 0; index + 5 < candidate.lines.length; index += 6) {
    let start = new THREE.Vector3(...candidate.lines.slice(index, index + 3) as Vec3)
    let end = new THREE.Vector3(...candidate.lines.slice(index + 3, index + 6) as Vec3)
    let a = start.clone().project(camera), b = end.clone().project(camera)
    // Match the renderer's visible clipped segment, rather than discarding a
    // long reference when one endpoint lies beyond the camera's clipping planes.
    let low = 0, high = 1
    for (const coordinate of ['x', 'y', 'z'] as const) {
      const delta = b[coordinate] - a[coordinate]
      if (Math.abs(delta) < 1e-12) {
        if (a[coordinate] < -1 || a[coordinate] > 1) { high = -1; break }
      } else {
        const first = (-1 - a[coordinate]) / delta, second = (1 - a[coordinate]) / delta
        low = Math.max(low, Math.min(first, second)); high = Math.min(high, Math.max(first, second))
      }
    }
    if (low > high) continue
    const originalStart = start
    start = originalStart.clone().lerp(end, low); end = originalStart.clone().lerp(end, high)
    a = start.clone().project(camera); b = end.clone().project(camera)
    const ax = (a.x + 1) * viewport.width / 2, ay = (1 - a.y) * viewport.height / 2
    const dx = (b.x - a.x) * viewport.width / 2, dy = (a.y - b.y) * viewport.height / 2
    const length2 = dx * dx + dy * dy
    if (length2 < 1) continue
    const fraction = Math.max(0, Math.min(1, ((pointer.x - ax) * dx + (pointer.y - ay) * dy) / length2))
    const pixels = Math.hypot(ax + fraction * dx - pointer.x, ay + fraction * dy - pointer.y)
    if (pixels > tolerance) continue
    const point = start.lerp(end, fraction), projected = point.clone().project(camera)
    ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera)
    const depth = point.clone().sub(ray.ray.origin).dot(ray.ray.direction)
    if (candidate.material && body) {
      const surface = ray.intersectObject(body, false)[0]
      if (surface && surface.distance < depth - Math.max(1e-5, worldPerPixel * .15)) continue
    }
    const previous = hits.get(candidate.key)
    if (!previous || pixels < previous.pixels) hits.set(candidate.key, { candidate, pixels, depth })
  }
  const ordered = [...hits.values()].sort((a, b) => a.pixels - b.pixels || a.depth - b.depth)
  if (!ordered.length) return []
  // Return the exact overlapping declarations so the user can choose ownership.
  return ordered.filter(hit => Math.abs(ordered[0].pixels - hit.pixels) < .25
    && Math.abs(ordered[0].depth - hit.depth) < Math.max(1e-5, worldPerPixel * .15)).map(hit => hit.candidate)
}

export function pickRevolutionAxis(camera: THREE.OrthographicCamera, candidates: readonly RevolutionAxisCandidate[],
  pointer: { x: number; y: number }, viewport: { width: number; height: number }, body: THREE.Mesh | null,
  tolerance = 8): RevolutionAxisCandidate | null {
  const choices = pickRevolutionAxisChoices(camera, candidates, pointer, viewport, body, tolerance)
  return choices.length === 1 ? choices[0] : null
}
