import type { Vec3 } from '../cad/kernel.types'
import { rigidRotationMatrix, validateRigidPose, type Quaternion } from './rigidPose'

/** Numerical infinite planes only; these inputs confer no native reference authority. */
export interface PlaneBisectorSupport {
  ownerId: string | null
  pointMm: Vec3
  normal: Vec3
  /** Absolute point error in mm, including any earlier placement arithmetic. */
  pointErrorMm?: number
  /** Normal direction error in radians, including any earlier placement arithmetic. */
  normalErrorRad?: number
}
export interface PlaneBisectorConditioning {
  originMm: Vec3
  lengthScaleMm: number
  lengthToleranceMm: number
  angleToleranceRad: number
}
export type PlaneBisectorBranch = 'sum' | 'difference'
export type PlaneBisectorPair = readonly [PlaneBisectorSupport, PlaneBisectorSupport]
export type PlaneBisectorNormalDerivative = [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]
export type PlaneBisectorOffsetDerivative = [number, number, number, number, number, number]
/** Columns [vX,vY,vZ,wX,wY,wZ] use the solver's normalized left retraction.
 * v is dimensionless (physical mm = lengthScaleMm*v); w is in radians. */
export interface PlaneBisectorDerivative {
  normal: PlaneBisectorNormalDerivative
  offset: PlaneBisectorOffsetDerivative
}
export interface PlaneBisectorOwnerDerivative extends PlaneBisectorDerivative { ownerId: string }
export interface PlaneBisectorPrecision {
  /** Conservative first-order arithmetic/input-error estimate, not a formal certificate. */
  normal: number
  /** Normalized length relative to conditioning.originMm. */
  offset: number
}
export interface PlaneBisectorDiagnostic { status: 'degenerate' | 'precisionLimit'; message: string }
export interface OrderedPlaneBisector {
  status: 'ok'
  normal: Vec3
  /** n.dot((p-originMm)/lengthScaleMm) = offset. */
  offset: number
  branchLength: number
  precision: PlaneBisectorPrecision
  /** Independent support variations; even a fixed support has an analytical block. */
  supports: [PlaneBisectorDerivative, PlaneBisectorDerivative]
  /** Repeated owners are summed; null denotes the fixed frame and has no columns.
   * Non-null IDs are not a free/fixed declaration: callers select physical solve columns. */
  owners: PlaneBisectorOwnerDerivative[]
}
export interface PlaneBisectorComparison {
  status: 'ok'
  width: OrderedPlaneBisector
  tab: OrderedPlaneBisector
  /** Normal difference expressed in the first width support's current frame. */
  normal: Vec3
  /** Offset difference anchored at that support's point, in normalized length. */
  offset: number
  precision: PlaneBisectorPrecision
  supports: [PlaneBisectorDerivative, PlaneBisectorDerivative, PlaneBisectorDerivative, PlaneBisectorDerivative]
  owners: PlaneBisectorOwnerDerivative[]
}
/** Already expressed in the solver's fixed normalized coordinate frame.
 * No world origin is added back, so small local offsets survive a distant origin. */
export interface ConditionedPlaneBisectorSupport {
  ownerId: string | null
  point: Vec3
  normal: Vec3
  /** Absolute error in the same normalized length coordinates. */
  pointError?: number
  normalErrorRad?: number
}
export type ConditionedPlaneBisectorPair = readonly [ConditionedPlaneBisectorSupport, ConditionedPlaneBisectorSupport]
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const ROUNDING = 64 * Number.EPSILON
const MIN_NORMAL = 2 ** -1022
function vector(input: Vec3, name: string): Vec3 {
  if (!Array.isArray(input) || input.length !== 3) throw new Error(name + ' needs three finite coordinates.')
  return Array.from({ length: 3 }, (_, i) => {
    const field = Object.getOwnPropertyDescriptor(input, String(i))
    if (!field || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw new Error(name + ' needs dense finite numeric data.')
    return field.value
  }) as Vec3
}
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
function add(a: Vec3, b: Vec3): Vec3 { return a.map((v, i) => v + b[i]) as Vec3 }
function sub(a: Vec3, b: Vec3): Vec3 { return a.map((v, i) => v - b[i]) as Vec3 }
function mul(a: Vec3, s: number): Vec3 { return a.map(v => v * s) as Vec3 }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function positive(v: number, name: string): number {
  if (!Number.isFinite(v) || v <= 0) throw new Error(name + ' must be finite and positive.')
  return v
}
function errorBound(v: number | undefined): number {
  if (v === undefined) return 0
  if (!Number.isFinite(v) || v < 0) throw new Error('Plane input errors must be finite and nonnegative.')
  return v
}
function conditioning(value: PlaneBisectorConditioning): PlaneBisectorConditioning {
  return { originMm: vector(value.originMm, 'Conditioning origin'), lengthScaleMm: positive(value.lengthScaleMm, 'Length scale'),
    lengthToleranceMm: positive(value.lengthToleranceMm, 'Length tolerance'), angleToleranceRad: positive(value.angleToleranceRad, 'Angle tolerance') }
}
interface Plane { ownerId: string | null; point: Vec3; normal: Vec3; offset: number; pointError: number; normalError: number; offsetError: number; normalizationUnresolved: boolean }
function plane(value: PlaneBisectorSupport, c: PlaneBisectorConditioning): Plane {
  if (value.ownerId !== null && (typeof value.ownerId !== 'string' || value.ownerId.length === 0)) throw new Error('Plane owner must be an ID or null.')
  const p = vector(value.pointMm, 'Plane point'), n = vector(value.normal, 'Plane normal'), norm = Math.hypot(...n)
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-12) throw new Error('Plane normal must be unit length within 1e-12.')
  let normalizationUnresolved = false
  const normalize = (value: number): number => {
    const normalized = value / c.lengthScaleMm
    if (!Number.isFinite(normalized) || value !== 0 && Math.abs(normalized) < MIN_NORMAL) normalizationUnresolved = true
    return normalized
  }
  const normal = mul(n, 1 / norm), point = p.map((v, i) => normalize(v - c.originMm[i])) as Vec3
  // A world point cannot recover information already lost during composition.
  // Include input uncertainty plus subtraction/normalization magnitudes BEFORE cancellation.
  const pointError = normalize(errorBound(value.pointErrorMm))
    + ROUNDING * (Math.hypot(...p) / c.lengthScaleMm + Math.hypot(...c.originMm) / c.lengthScaleMm + Math.hypot(...point))
  const normalError = errorBound(value.normalErrorRad) + ROUNDING
  const offset = dot(normal, point), offsetError = pointError + normalError * Math.hypot(...point) + ROUNDING * Math.hypot(...point)
  return { ownerId: value.ownerId, point, normal, offset, pointError, normalError, offsetError, normalizationUnresolved }
}
function zeroDerivative(): PlaneBisectorDerivative {
  return { normal: Array.from({ length: 6 }, () => [0, 0, 0] as Vec3) as PlaneBisectorNormalDerivative, offset: [0, 0, 0, 0, 0, 0] }
}
function owners(planes: readonly PlaneBisectorSupport[], derivatives: readonly PlaneBisectorDerivative[]): PlaneBisectorOwnerDerivative[] {
  const result = new Map<string, PlaneBisectorOwnerDerivative>()
  planes.forEach((p, index) => {
    if (p.ownerId === null) return
    let block = result.get(p.ownerId)
    if (!block) { block = { ownerId: p.ownerId, ...zeroDerivative() }; result.set(p.ownerId, block) }
    for (let j = 0; j < 6; j++) {
      block.normal[j] = add(block.normal[j], derivatives[index].normal[j])
      block.offset[j] += derivatives[index].offset[j]
    }
  })
  return [...result.values()]
}
function precisionFailure(precision: PlaneBisectorPrecision, c: PlaneBisectorConditioning): PlaneBisectorDiagnostic | null {
  const tolerance = c.lengthToleranceMm / c.lengthScaleMm
  return !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isFinite(precision.normal) || !Number.isFinite(precision.offset)
    || precision.normal > c.angleToleranceRad || precision.offset > c.lengthToleranceMm / c.lengthScaleMm
    ? { status: 'precisionLimit', message: 'Plane bisector arithmetic or input uncertainty exceeds the requested precision.' } : null
}
function finiteDerivative(block: PlaneBisectorDerivative): boolean {
  return block.offset.every(Number.isFinite) && block.normal.every(v => v.every(Number.isFinite))
}
/** The selected oriented bisector solves d0 = -s*d1, s=+1 for sum, -1 for difference.
 * Branches are never inferred from material, BBoxes, order sorting or proximity. */
export function evaluateOrderedPlaneBisector(pair: PlaneBisectorPair, branch: PlaneBisectorBranch,
  input: PlaneBisectorConditioning): OrderedPlaneBisector | PlaneBisectorDiagnostic {
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error('An ordered pair of planes is required.')
  if (branch !== 'sum' && branch !== 'difference') throw new Error('An explicit sum or difference branch is required.')
  const c = conditioning(input), policyFailure = precisionFailure({ normal: 0, offset: 0 }, c)
  if (policyFailure) return policyFailure
  const p = [plane(pair[0], c), plane(pair[1], c)], sign = branch === 'sum' ? 1 : -1
  if (p.some(value => value.normalizationUnresolved)) return { status: 'precisionLimit', message: 'Plane point or input error cannot be normalized at ordinary Float64 precision.' }
  const u = add(p[0].normal, mul(p[1].normal, sign)), length = Math.hypot(...u)
  if (length === 0) return { status: 'degenerate', message: 'The selected bisector normal cancels exactly; no unique plane exists on this branch.' }
  const uError = p[0].normalError + p[1].normalError + ROUNDING
  if (!(length > 2 * uError)) return { status: 'precisionLimit', message: 'The selected bisector branch is too close to normal cancellation.' }
  const normal = mul(u, 1 / length), numerator = p[0].offset + sign * p[1].offset, offset = numerator / length
  const precision = { normal: 2 * uError / length,
    offset: (p[0].offsetError + p[1].offsetError + Math.abs(offset) * uError + ROUNDING * (Math.abs(p[0].offset) + Math.abs(p[1].offset))) / (length - uError) }
  const failure = precisionFailure(precision, c)
  if (failure) return failure
  const supports = p.map((current, i) => {
    const derivative = zeroDerivative(), factor = i === 0 ? 1 : sign
    for (let j = 0; j < 6; j++) {
      const du = j < 3 ? [0, 0, 0] as Vec3 : mul(cross(AXES[j - 3], current.normal), factor), dLength = dot(normal, du)
      derivative.normal[j] = mul(sub(du, mul(normal, dLength)), 1 / length)
      // Under a left retraction dn=w×n and dx=v+w×x, hence da=n.dot(v).
      const da = j < 3 ? factor * current.normal[j] : 0
      derivative.offset[j] = (da - offset * dLength) / length
    }
    return derivative
  }) as [PlaneBisectorDerivative, PlaneBisectorDerivative]
  const ownerBlocks = owners(pair, supports)
  if (!supports.every(finiteDerivative) || !ownerBlocks.every(finiteDerivative)) {
    return { status: 'precisionLimit', message: 'Plane bisector derivatives exceed finite arithmetic.' }
  }
  return { status: 'ok', normal, offset, branchLength: length, precision, supports, owners: ownerBlocks }
}

/** Compare in the current frame and at the point of width[0], including away from coincidence.
 * firstWidthFrameRotation is a world rotation attached to that same support's owner.
 * The caller must compose it from that same owner; it confers no native authority.
 * Its derivative follows width[0], not a separately moving frame. Formal support
 * blocks may be nonzero for null owners; only owners supplies physical owner blocks. */
export function compareOrderedPlaneBisectors(widthPair: PlaneBisectorPair, widthBranch: PlaneBisectorBranch,
  tabPair: PlaneBisectorPair, tabBranch: PlaneBisectorBranch, alignment: 1 | -1,
  firstWidthFrameRotation: Quaternion, input: PlaneBisectorConditioning): PlaneBisectorComparison | PlaneBisectorDiagnostic {
  if (alignment !== 1 && alignment !== -1) throw new Error('Bisector alignment must explicitly be +1 or -1.')
  const c = conditioning(input), rotation = rigidRotationMatrix(validateRigidPose({ translation: [0, 0, 0], rotation: firstWidthFrameRotation }).rotation)
  const local = (v: Vec3): Vec3 => [rotation[0] * v[0] + rotation[3] * v[1] + rotation[6] * v[2],
    rotation[1] * v[0] + rotation[4] * v[1] + rotation[7] * v[2], rotation[2] * v[0] + rotation[5] * v[1] + rotation[8] * v[2]]
  const width = evaluateOrderedPlaneBisector(widthPair, widthBranch, c), tab = evaluateOrderedPlaneBisector(tabPair, tabBranch, c)
  if (width.status !== 'ok') return width
  if (tab.status !== 'ok') return tab
  const anchor = plane(widthPair[0], c), world = sub(tab.normal, mul(width.normal, alignment)), normal = local(world)
  const offset = tab.offset - alignment * width.offset - dot(world, anchor.point)
  const precision = { normal: width.precision.normal + tab.precision.normal + ROUNDING,
    offset: width.precision.offset + tab.precision.offset + (width.precision.normal + tab.precision.normal) * Math.hypot(...anchor.point)
      + Math.hypot(...world) * anchor.pointError + ROUNDING * (Math.abs(tab.offset) + Math.abs(width.offset) + Math.hypot(...world) * Math.hypot(...anchor.point)) }
  const failure = precisionFailure(precision, c)
  if (failure) return failure
  const blocks = [...width.supports, ...tab.supports], supports = blocks.map((block, i) => {
    const derivative = zeroDerivative(), factor = i < 2 ? -alignment : 1
    for (let j = 0; j < 6; j++) {
      const dWorld = mul(block.normal[j], factor), omega = i === 0 && j >= 3 ? AXES[j - 3] : [0, 0, 0] as Vec3
      const dx = i !== 0 ? [0, 0, 0] as Vec3 : j < 3 ? AXES[j] : cross(omega, anchor.point)
      derivative.normal[j] = local(sub(dWorld, cross(omega, world)))
      derivative.offset[j] = factor * block.offset[j] - dot(dWorld, anchor.point) - dot(world, dx)
    }
    return derivative
  }) as PlaneBisectorComparison['supports']
  const ownerBlocks = owners([...widthPair, ...tabPair], supports)
  if (!Number.isFinite(offset) || !supports.every(finiteDerivative) || !ownerBlocks.every(finiteDerivative)) {
    return { status: 'precisionLimit', message: 'Plane bisector comparison exceeds finite arithmetic.' }
  }
  return { status: 'ok', width, tab, normal, offset, precision, supports, owners: ownerBlocks }
}

/** The same algebra in nondimensional coordinates; its unit scale is one.
 * Translation columns and the returned offset already use the solve frame.
 * This does not compose placements or authenticate an upstream error estimate. */
export function compareConditionedPlaneBisectors(widthPair: ConditionedPlaneBisectorPair, widthBranch: PlaneBisectorBranch,
  tabPair: ConditionedPlaneBisectorPair, tabBranch: PlaneBisectorBranch, alignment: 1 | -1,
  firstWidthFrameRotation: Quaternion, lengthTolerance: number, angleToleranceRad: number): PlaneBisectorComparison | PlaneBisectorDiagnostic {
  const unitScalePair = (pair: ConditionedPlaneBisectorPair): PlaneBisectorPair => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error('An ordered pair of conditioned planes is required.')
    return pair.map(value => ({ ownerId: value.ownerId, pointMm: value.point, normal: value.normal,
      pointErrorMm: value.pointError, normalErrorRad: value.normalErrorRad })) as [PlaneBisectorSupport, PlaneBisectorSupport]
  }
  return compareOrderedPlaneBisectors(unitScalePair(widthPair), widthBranch, unitScalePair(tabPair), tabBranch,
    alignment, firstWidthFrameRotation, { originMm: [0, 0, 0], lengthScaleMm: 1,
      lengthToleranceMm: lengthTolerance, angleToleranceRad })
}
