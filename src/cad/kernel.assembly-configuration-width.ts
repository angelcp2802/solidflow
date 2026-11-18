import type { Vec3 } from './kernel.types'
import type { AssemblyConfigurationGeometryInput, AssemblyConfigurationGeometrySnapshot } from './kernel.assembly-configuration-snapshot'
import type { ConfiguredResolvedWidthMate } from './kernel.assembly-configuration-relations'
import {
  authenticateConfiguredMeasurement, configuredMeasurementBands, measureConfiguredSupport,
  metadataConfiguredMeasurement, ConfiguredMeasurementPrecisionError,
  type ConfiguredMeasurementOptions,
} from './kernel.assembly-configuration-measurement'

export type ConfiguredAssemblyWidthOptions = ConfiguredMeasurementOptions
const ROUND = 128 * Number.EPSILON
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (v: Vec3) => Math.hypot(...v)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const chord = (angle: number) => 2 * Math.sin(Math.min(Math.PI, angle) / 2)
interface Plane { point: Vec3; normal: Vec3; pe: number; ne: number }
interface Pair { normal: Vec3; offset: number; length: number; normalError: number; offsetError: number }
function finite(values: number[]): void {
  if (!values.every(Number.isFinite)) throw new ConfiguredMeasurementPrecisionError('Configured Width composition exceeds finite measurement arithmetic.')
}
function pair(a: Plane, b: Plane, branch: 'sum' | 'difference'): Pair {
  const sign = branch === 'sum' ? 1 : -1
  const combined = a.normal.map((value, i) => value + sign * b.normal[i]) as Vec3
  const length = norm(combined)
  // A ball about the nonzero combined normal gives an angular cone; a branch
  // whose ball contains zero has no observable bisector and is not replaced.
  const directionBall = chord(a.ne) + chord(b.ne) + ROUND
  finite([length, directionBall])
  if (!(length > directionBall)) throw new ConfiguredMeasurementPrecisionError('The selected configured Width bisector has no retained normal.')
  const normal = combined.map(value => value / length) as Vec3
  const numerator = dot(a.normal, a.point) + sign * dot(b.normal, b.point)
  const offset = numerator / length
  const normalError = Math.asin(directionBall / length) + ROUND
  const numeratorError = a.pe + b.pe + (norm(a.point) + a.pe) * chord(a.ne)
    + (norm(b.point) + b.pe) * chord(b.ne) + ROUND * (norm(a.point) + norm(b.point) + Math.abs(numerator))
  const offsetError = (numeratorError + Math.abs(offset) * directionBall) / (length - directionBall)
    + ROUND * Math.abs(offset)
  finite([...normal, numerator, offset, normalError, offsetError])
  return { normal, offset, length, normalError, offsetError }
}

/** Independent ordered pair-plane measurement over configured native grants.
 * No numerical residual, Jacobian or solved midpoint is reused. The snapshot is
 * borrowed: this function never releases it, including precision-limit paths. */
export function measureConfiguredAssemblyWidth(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  value: ConfiguredResolvedWidthMate, options: ConfiguredAssemblyWidthOptions = {}) {
  const bands = configuredMeasurementBands(options)
  authenticateConfiguredMeasurement(snapshot, input, value)
  if (value.mate.type !== 'width' || value.mate.mode !== 'centered') throw Error('Configured Width measurement requires explicit centered intent.')
  const base = { ...metadataConfiguredMeasurement(value), family: 'width' as const, mode: 'centered' as const,
    widthBranch: value.mate.widthBranch, tabBranch: value.mate.tabBranch, alignment: value.mate.alignment, bands,
    componentPaths: { width: value.width.map(w => [...w.componentPath]), tab: value.tab.map(w => [...w.componentPath]) } }
  try {
    const origin: Vec3 = [...value.width[0].declaredWorldPose.translation]
    const planes: Plane[] = [...value.width, ...value.tab].map(witness => {
      if (witness.kind !== 'configured-plane' || witness.localSupport.kind !== 'plane') throw Error('Configured Width requires four positional plane purposes.')
      const measured = measureConfiguredSupport(snapshot, input, witness, origin)
      if (measured.kind !== 'plane' || !measured.direction || measured.directionErrorRad === null) throw Error('Configured Width has a foreign native support purpose.')
      return { point: measured.pointMm, normal: measured.direction, pe: measured.positionErrorMm, ne: measured.directionErrorRad }
    })
    const width = pair(planes[0], planes[1], value.mate.widthBranch)
    const tab = pair(planes[2], planes[3], value.mate.tabBranch)
    const sign = value.mate.alignment === 'aligned' ? 1 : -1
    const first = width.normal.map(component => sign * component) as Vec3
    const angleRadians = Math.atan2(norm(cross(first, tab.normal)), dot(first, tab.normal))
    const offsetMm = tab.offset - sign * width.offset
    const positionMm = width.offsetError + tab.offsetError + ROUND * (Math.abs(width.offset) + Math.abs(tab.offset))
    const angleRad = width.normalError + tab.normalError + ROUND
    finite([angleRadians, offsetMm, positionMm, angleRad])
    const outside = Math.abs(offsetMm) - positionMm > bands.lengthToleranceMm || angleRadians - angleRad > bands.angleToleranceRad
    const retained = Math.abs(offsetMm) + positionMm <= bands.lengthToleranceMm && angleRadians + angleRad <= bands.angleToleranceRad
    // An uncertainty interval touching the boundary proves neither outcome,
    // even when its nominal residual is just outside the requested band.
    const precise = positionMm <= bands.lengthToleranceMm && angleRad <= bands.angleToleranceRad && (retained || outside)
    authenticateConfiguredMeasurement(snapshot, input, value)
    return { ...base, status: precise ? 'ok' as const : 'precisionLimit' as const, satisfied: precise && retained,
      angleRadians, offsetMm, branchLengths: { width: width.length, tab: tab.length }, precision: { positionMm, angleRad },
      ...(!precise ? { message: 'Configured Width uncertainty cannot retain the requested bands.' } : {}) }
  } catch (error) {
    if (!(error instanceof ConfiguredMeasurementPrecisionError)) throw error
    authenticateConfiguredMeasurement(snapshot, input, value)
    return { ...base, status: 'precisionLimit' as const, satisfied: false,
      angleRadians: null, offsetMm: null, branchLengths: { width: null, tab: null }, precision: { positionMm: null, angleRad: null }, message: error.message }
  }
}
export type ConfiguredAssemblyWidthMeasurement = ReturnType<typeof measureConfiguredAssemblyWidth>
