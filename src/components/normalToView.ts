export type NormalToVector = readonly [number, number, number]
export interface NormalToPlane {
  origin: NormalToVector
  normal: NormalToVector
  xDirection: NormalToVector
}

/** World-space display inputs, resolved from the current selection by its workspace.
 * The axis shape supports analytic surface axes; it does not admit standalone
 * model axes or edges to a workspace's selection policy. */
export type NormalToTarget =
  | { kind: 'none' }
  | { kind: 'plane'; key: string; frame: NormalToPlane }
  | { kind: 'axis'; key: string; point: NormalToVector; direction: NormalToVector; xDirection?: NormalToVector }
  | { kind: 'planes'; key: string; first: NormalToPlane; second: NormalToPlane }

type Vector = [number, number, number]
export interface NormalToOrientation {
  direction: Vector
  up: Vector
  /** Includes ordered selection identity and current geometry, not camera position. */
  repeatKey: string | null
}
const frameTolerance = 1e-6
const parallelTolerance = 1e-8
const cleanZero = (value: number) => value === 0 ? 0 : value
const dot = (a: NormalToVector, b: NormalToVector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: NormalToVector, b: NormalToVector): Vector => [cleanZero(a[1] * b[2] - a[2] * b[1]), cleanZero(a[2] * b[0] - a[0] * b[2]), cleanZero(a[0] * b[1] - a[1] * b[0])]
const scale = (a: NormalToVector, amount: number): Vector => [cleanZero(a[0] * amount), cleanZero(a[1] * amount), cleanZero(a[2] * amount)]
const finite = (value: unknown): value is Vector => Array.isArray(value) && value.length === 3 && value.every(v => typeof v === 'number' && Number.isFinite(v))
function unit(value: unknown, requireUnit = false): Vector | null {
  if (!finite(value)) return null
  const length = Math.hypot(...value)
  if (!Number.isFinite(length) || length <= parallelTolerance || requireUnit && Math.abs(length - 1) > frameTolerance) return null
  return scale(value, 1 / length)
}
function transverse(value: NormalToVector, direction: NormalToVector): Vector | null {
  const along = dot(value, direction)
  return unit([value[0] - along * direction[0], value[1] - along * direction[1], value[2] - along * direction[2]])
}
function frame(value: NormalToPlane | null | undefined): { origin: Vector; normal: Vector; xDirection: Vector; up: Vector } | null {
  if (!value || !finite(value.origin)) return null
  const normal = unit(value.normal, true), x = unit(value.xDirection, true)
  if (!normal || !x || Math.abs(dot(normal, x)) > frameTolerance) return null
  const xDirection = transverse(x, normal)
  if (!xDirection) return null
  return { origin: [...value.origin], normal, xDirection, up: cross(normal, xDirection) }
}

// Stable tie order: front/back, left/right, top/bottom, then natural up before
// quarter-turn alternatives. Nearest means minimum full orientation rotation,
// including screen up, rather than independently rounding the viewing axis.
const cardinalViews = [
  { direction: [0, 0, 1], up: [0, 1, 0] }, { direction: [0, 0, -1], up: [0, 1, 0] },
  { direction: [-1, 0, 0], up: [0, 1, 0] }, { direction: [1, 0, 0], up: [0, 1, 0] },
  { direction: [0, 1, 0], up: [0, 0, -1] }, { direction: [0, -1, 0], up: [0, 0, 1] },
] satisfies { direction: Vector; up: Vector }[]
function nearest(directionValue: NormalToVector, upValue: NormalToVector): NormalToOrientation | null {
  const direction = unit(directionValue), upInput = unit(upValue)
  if (!direction || !upInput) return null
  const up = transverse(upInput, direction)
  if (!up) return null
  const right = cross(up, direction)
  let best: NormalToOrientation | null = null, bestScore = -Infinity
  for (const candidate of cardinalViews) {
    const naturalUp = candidate.up, naturalRight = cross(naturalUp, candidate.direction)
    for (const candidateUp of [naturalUp, naturalRight, scale(naturalUp, -1), scale(naturalRight, -1)]) {
      const score = dot(direction, candidate.direction) + dot(up, candidateUp) + dot(right, cross(candidateUp, candidate.direction))
      if (score > bestScore + 1e-12) {
        bestScore = score; best = { direction: [...candidate.direction], up: [...candidateUp], repeatKey: null }
      }
    }
  }
  return best
}

/** SolidFlow's display convention: natural frame Y, ordered second-plane normal
 * projected as up, and the closest proper cardinal orientation for no selection.
 * Invalid input is distinct from no selection and changes no camera or history. */
export function resolveNormalToView(target: NormalToTarget, cameraDirection: NormalToVector, cameraUp: NormalToVector): NormalToOrientation | null {
  if (!target || typeof target !== 'object') return null
  if (target.kind === 'none') return nearest(cameraDirection, cameraUp)
  if (typeof target.key !== 'string' || !target.key.length) return null
  if (target.kind === 'plane') {
    const selected = frame(target.frame)
    return selected && { direction: selected.normal, up: selected.up, repeatKey: JSON.stringify(['plane', target.key, selected]) }
  }
  if (target.kind === 'planes') {
    const first = frame(target.first), second = frame(target.second)
    if (!first || !second) return null
    const up = transverse(second.normal, first.normal)
    return up && { direction: first.normal, up, repeatKey: JSON.stringify(['planes', target.key, first, second]) }
  }
  if (target.kind === 'axis') {
    if (!finite(target.point)) return null
    const direction = unit(target.direction, true)
    if (!direction) return null
    let x: Vector | null
    if (target.xDirection !== undefined) {
      x = unit(target.xDirection, true)
      if (!x || Math.abs(dot(x, direction)) > frameTolerance) return null
    } else {
      // No natural radial axis is supplied: project the least parallel global
      // basis, with X/Y/Z as the deterministic tie order.
      const basis: Vector[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
      x = basis.reduce((best, value) => Math.abs(dot(value, direction)) < Math.abs(dot(best, direction)) ? value : best)
    }
    const xDirection = transverse(x, direction)
    if (!xDirection) return null
    return { direction, up: cross(direction, xDirection), repeatKey: JSON.stringify(['axis', target.key, target.point, direction, xDirection]) }
  }
  return null
}

/** Selection admission only; a no-selection request additionally needs a valid
 * current camera basis when it is executed. */
export function validateNormalToTarget(target: NormalToTarget): boolean {
  return resolveNormalToView(target, [0, 0, 1], [0, 1, 0]) !== null
}
