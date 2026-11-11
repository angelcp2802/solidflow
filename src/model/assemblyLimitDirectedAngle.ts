import { RotationChartError } from './assemblyKinematics'

/** An inclusive positive circular arc in degrees. It never records turns. */
export interface AssemblyDirectedAngleArc { start: number; sweep: number }
export interface AssemblyDirectedAngleArcEvaluation {
  angleRadians: number
  arcDegrees: AssemblyDirectedAngleArc
  marginsRadians: { minimum: number; maximum: number }
  angleToleranceRadians: number
  activity: 'interior' | 'minimum' | 'maximum' | 'both'
  fullCircle: boolean
}
const TURN = 2 * Math.PI

export function validateAssemblyDirectedAngleArc(value: unknown): AssemblyDirectedAngleArc {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Circular angular arc must be plain data.')
  const keys = Reflect.ownKeys(value)
  if (keys.length !== 2 || !keys.includes('start') || !keys.includes('sweep')) throw new Error('Circular angular arc requires start and sweep only.')
  const read = (key: string): number => {
    const field = Object.getOwnPropertyDescriptor(value, key)
    if (!field?.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw new Error('Circular arc values must be finite own numeric data.')
    return field.value
  }
  const start = read('start'), sweep = read('sweep')
  if (start < 0 || start >= 360 || sweep < 0 || sweep > 360) throw new Error('Circular arc requires 0 <= start < 360 and 0 <= sweep <= 360 degrees.')
  return { start, sweep }
}

export function assemblyDirectedAngleArcRadians(value: AssemblyDirectedAngleArc): { start: number; sweep: number; center: number } {
  const arc = validateAssemblyDirectedAngleArc(value), start = arc.start * (Math.PI / 180), sweep = arc.sweep * (Math.PI / 180), center = start + sweep / 2
  if (arc.start !== 0 && start === 0 || arc.sweep !== 0 && sweep === 0 || start === TURN
    || arc.sweep !== 360 && sweep === TURN || sweep !== 0 && (center - sweep / 2 === center + sweep / 2 || start + sweep === start)) throw new RangeError('Circular arc conversion loses a declared endpoint or interval.')
  return { start, sweep, center }
}

/**
 * A local lift centred on the feasible arc. The branch cut lies opposite its
 * centre, outside every proper arc. An ambiguous tie rejects instead of
 * inventing a restoration direction or claiming global infeasibility.
 */
export function evaluateAssemblyDirectedAngleArc(angleRadians: number, arcDegrees: AssemblyDirectedAngleArc,
  angleToleranceRadians: number): AssemblyDirectedAngleArcEvaluation {
  if (!Number.isFinite(angleRadians) || angleRadians < 0 || angleRadians >= TURN) throw new RangeError('Circular angle must be finite radians in [0,2*pi).')
  if (!Number.isFinite(angleToleranceRadians) || angleToleranceRadians <= 0 || angleToleranceRadians >= Math.PI) throw new RangeError('Circular arc precision must be positive and less than pi radians.')
  const arc = validateAssemblyDirectedAngleArc(arcDegrees), radians = assemblyDirectedAngleArcRadians(arc), fullCircle = arc.sweep === 360,
    branchAllowance = 64 * Number.EPSILON * (1 + Math.abs(radians.center) + Math.abs(angleRadians))
  let offset = Math.atan2(Math.sin(angleRadians - radians.center), Math.cos(angleRadians - radians.center))
  // This is floating branch uncertainty, not the much larger physical
  // acceptance tolerance. A resolvable near-full arc keeps its endpoints.
  if (!fullCircle && Math.PI - radians.sweep / 2 <= branchAllowance) throw new RangeError('The circular arc complement cannot be resolved from the local chart cut.')
  if (!fullCircle && Math.PI - Math.abs(offset) <= branchAllowance) throw new RotationChartError('Circular arc restoration is ambiguous opposite the arc centre.')
  if (fullCircle) {
    // Only descriptive margins: a complete turn creates no artificial seam stop.
    const relative = ((angleRadians - radians.start) % TURN + TURN) % TURN
    return { angleRadians, arcDegrees: arc, marginsRadians: { minimum: relative, maximum: TURN - relative }, angleToleranceRadians, activity: 'interior', fullCircle }
  }
  if (Object.is(offset, -0)) offset = 0
  const marginsRadians = { minimum: offset + radians.sweep / 2, maximum: radians.sweep / 2 - offset },
    minimum = Math.abs(marginsRadians.minimum) <= angleToleranceRadians, maximum = Math.abs(marginsRadians.maximum) <= angleToleranceRadians
  return { angleRadians, arcDegrees: arc, marginsRadians, angleToleranceRadians,
    activity: minimum && maximum ? 'both' : minimum ? 'minimum' : maximum ? 'maximum' : 'interior', fullCircle }
}
