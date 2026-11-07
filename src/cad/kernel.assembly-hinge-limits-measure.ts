import type { AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyDirectedAngleArc } from '../model/assemblyLimitDirectedAngle'
import { transformRigidDirection, validateRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { measureResolvedAssemblyHingeReferences, validateAssemblyHingeMeasurementOptions,
  type AssemblyHingeMeasurementOptions, type AssemblyNativeHingeMeasurement } from './kernel.assembly-hinge'
import { assertAssemblyLimitedHingeReferences, getAssemblyLimitedHingeBase, resolveAssemblyLimitedHingeReferences } from './kernel.assembly-hinge-limits'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

interface LimitedHingeReportBase {
  scopePath: string[]
  componentPaths: { axis: [string[], string[]]; axial: [string[], string[]]; angular: [string[], string[]] }
  alignment: 'aligned' | 'opposed'
  coordinate: 'directed-about-axis'
  arcDegrees: AssemblyDirectedAngleArc
  supportOnly: true
}
export type AssemblyNativeLimitedHingeMeasurement = LimitedHingeReportBase & (
  | { status: 'precisionLimit'; message: string }
  | { status: 'ok'; satisfied: boolean; hinge: Extract<AssemblyNativeHingeMeasurement, { status: 'ok' }>;
      angleRadians: number; projectionLengths: { first: number; second: number };
      marginsRadians: { minimum: number; maximum: number }; activity: 'interior' | 'minimum' | 'maximum' | 'both';
      fullCircle: boolean; directionErrorRad: number; angleToleranceRad: number; lengthToleranceMm: number }
)
const TURN = 2 * Math.PI, ROUND = 128 * Number.EPSILON
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Vec3) => Math.hypot(...a)
function direction(witness: AssemblyEndpointWitness, document: AssemblyDocument, axis: boolean): { unit: Vec3; ball: number } {
  if (witness.kind !== 'support') throw Error('Limited hinge measurement requires current analytic support.')
  const support = witness.localSupport
  let local: Vec3
  if (axis && (support.kind === 'line' || support.kind === 'cylinder')) local = [...support.axis]
  else if (!axis && support.kind === 'plane') local = [...support.normal]
  else throw Error('Limited hinge measurement received a mismatched native direction purpose.')
  const rotated = transformRigidDirection(validateRigidPose(witness.declaredWorldPose), local), magnitude = length(rotated)
  if (!Number.isFinite(magnitude) || magnitude < .5 || magnitude > 1.5) throw new RangeError('Native hinge direction is not a resolvable unit vector.')
  const arithmetic = assemblyEndpointPlacementArithmetic(witness, document)
  // Rotation composition and direction normalization are accounted separately
  // from position/translation errors. A topology tolerance is not angular metrology.
  const cone = ROUND * (arithmetic.depth + 2) + Math.abs(length(local) - 1) + Math.abs(magnitude - 1)
  return { unit: rotated.map(x => x / magnitude) as Vec3, ball: 2 * Math.sin(Math.min(Math.PI, cone) / 2) }
}

/** Six fresh queries followed by an independent physical hinge/phase check.
 * The phase uses unnormalized projected dot/triple products and its own finite
 * error disk, not the numerical geometry helper, rows, gradients or solver state. */
export function measureAssemblyLimitedHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  input: unknown, options: AssemblyHingeMeasurementOptions = {}, scopePath: readonly string[] = []): AssemblyNativeLimitedHingeMeasurement {
  const config = validateAssemblyHingeMeasurementOptions(options)
  const value = resolveAssemblyLimitedHingeReferences(snapshot, document, input, scopePath)
  try {
    const paths = (pair: readonly AssemblyEndpointWitness[]) => pair.map(w => [...w.componentPath]) as [string[], string[]]
    const base: LimitedHingeReportBase = { scopePath: [...value.scopePath], alignment: value.alignment,
      coordinate: value.stops.coordinate, arcDegrees: { ...value.stops.arc }, supportOnly: true,
      componentPaths: { axis: paths(value.axis), axial: paths(value.axial), angular: paths(value.stops.angular) } }
    const precision = (message: string): AssemblyNativeLimitedHingeMeasurement => {
      assertAssemblyLimitedHingeReferences(snapshot, document, value)
      return { ...base, status: 'precisionLimit', message }
    }
    const hinge = measureResolvedAssemblyHingeReferences(snapshot, document, getAssemblyLimitedHingeBase(snapshot, document, value), config)
    if (hinge.status !== 'ok') return precision(hinge.message)
    const first = direction(value.stops.angular[0], document, false), second = direction(value.stops.angular[1], document, false),
      guide = direction(value.axis[0], document, true), a = first.unit, b = second.unit, g = guide.unit,
      ga = dot(g, a), gb = dot(g, b), la = length(cross(g, a)), lb = length(cross(g, b))
    if (la <= first.ball + 2 * guide.ball || lb <= second.ball + 2 * guide.ball) return precision('A native angular normal cannot be distinguished from the hinge axis within its retained error cone.')

    // atan2 of the raw projected dot and oriented triple product has the same
    // phase without normalizing either projection. Its nominal radius is la*lb.
    const x = dot(a, b) - ga * gb, y = dot(g, cross(a, b)), radius = Math.hypot(x, y),
      gaError = guide.ball + first.ball, gbError = guide.ball + second.ball,
      productError = Math.min(1, Math.abs(ga) + gaError) * gbError + Math.abs(gb) * gaError,
      xError = first.ball + second.ball + productError, yError = guide.ball + first.ball + second.ball,
      phaseBall = Math.hypot(xError, yError), arithmetic = 512 * Number.EPSILON * (1 + 1 / radius)
    if (!Number.isFinite(radius) || radius <= phaseBall) return precision('The native projected angular phase has an unresolved error disk.')
    const directionErrorRad = Math.asin(phaseBall / radius) + arithmetic
    if (!Number.isFinite(directionErrorRad) || directionErrorRad > config.angleToleranceRad) return precision('Native angular direction errors exceed the requested band.')
    const signed = Math.atan2(y, x)
    let angleRadians = signed < 0 ? signed + TURN : signed
    if (angleRadians === TURN || Object.is(angleRadians, -0)) angleRadians = 0

    const start = value.stops.arc.start * Math.PI / 180, sweep = value.stops.arc.sweep * Math.PI / 180,
      end = start + sweep, center = start + sweep / 2, fullCircle = value.stops.arc.sweep === 360
    if (value.stops.arc.start !== 0 && start === 0 || value.stops.arc.sweep !== 0 && sweep === 0 || start === TURN
      || !fullCircle && sweep === TURN || sweep !== 0 && (end === start || center - sweep / 2 === center + sweep / 2)) {
      return precision('The declared native angular interval loses an endpoint during radian conversion.')
    }
    let marginsRadians: { minimum: number; maximum: number }, activity: 'interior' | 'minimum' | 'maximum' | 'both' = 'interior'
    if (fullCircle) {
      let relative = angleRadians - start
      if (relative < 0) relative += TURN
      marginsRadians = { minimum: relative, maximum: TURN - relative }
    } else {
      let offset = angleRadians - center
      offset -= TURN * Math.floor((offset + Math.PI) / TURN)
      const branchError = 64 * Number.EPSILON * (1 + Math.abs(center) + Math.abs(angleRadians))
      if (Math.PI - sweep / 2 <= branchError || Math.PI - Math.abs(offset) <= directionErrorRad + branchError) {
        return precision('Native angular uncertainty intersects the interval chart cut.')
      }
      marginsRadians = { minimum: offset + sweep / 2, maximum: sweep / 2 - offset }
      const minimum = Math.abs(marginsRadians.minimum) <= config.angleToleranceRad,
        maximum = Math.abs(marginsRadians.maximum) <= config.angleToleranceRad
      activity = minimum && maximum ? 'both' : minimum ? 'minimum' : maximum ? 'maximum' : 'interior'
    }
    const violation = fullCircle ? 0 : Math.max(0, -marginsRadians.minimum, -marginsRadians.maximum),
      retained = violation + directionErrorRad <= config.angleToleranceRad
    if (violation <= config.angleToleranceRad && !retained) return precision('The measured native stop fits nominally but its retained error consumes the remaining angular band.')
    assertAssemblyLimitedHingeReferences(snapshot, document, value)
    return { ...base, status: 'ok', satisfied: hinge.satisfied && retained, hinge, angleRadians,
      projectionLengths: { first: la, second: lb }, marginsRadians, activity, fullCircle, directionErrorRad, ...config }
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Limited hinge measurement or release failed.') }
    throw error
  }
}
