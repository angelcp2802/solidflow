import type { Vec3 } from '../cad/kernel.types'
import { assemblyOccurrencePathKey, validateAssemblyGeometryReference, type AssemblyGeometryReference } from './assemblyDocument'

export const ASSEMBLY_DIRECTED_ANGLE_TOLERANCE_RADIANS = 1e-8
export interface AssemblyDirectedAngleRequest {
  scopePath: string[]
  first: AssemblyGeometryReference
  second: AssemblyGeometryReference
  guide: AssemblyGeometryReference
}
export interface AssemblyDirectedAngleReport extends AssemblyDirectedAngleRequest {
  coordinate: 'directed-about-axis'
  angleDegrees: number
  angleToleranceRadians: number
  firstKind: 'plane' | 'cylinder' | 'line'
  secondKind: 'plane' | 'cylinder' | 'line'
  guideKind: 'plane' | 'cylinder' | 'line'
  firstDirection: Vec3
  secondDirection: Vec3
  guideDirection: Vec3
  projectionLengths: { first: number; second: number }
  supportOnly: true
}

/** Selection syntax only. Neither a request nor a report grants native authority. */
export function validateAssemblyDirectedAngleRequest(input: unknown): AssemblyDirectedAngleRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('La medida angular necesita datos simples.')
  const names = ['scopePath', 'first', 'second', 'guide'], keys = Reflect.ownKeys(input)
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) throw new Error('La medida angular necesita un ámbito y tres referencias explícitas.')
  const values: Record<string, unknown> = {}
  for (const name of names) {
    const field = Object.getOwnPropertyDescriptor(input, name)
    if (!field?.enumerable || !('value' in field)) throw new Error('La medida angular solo admite campos de datos.')
    values[name] = field.value
  }
  // The shared path boundary validates dense own string data and the graph depth cap.
  const scopePath = JSON.parse(assemblyOccurrencePathKey(values.scopePath as string[])) as string[]
  return { scopePath, first: validateAssemblyGeometryReference(values.first), second: validateAssemblyGeometryReference(values.second),
    guide: validateAssemblyGeometryReference(values.guide) }
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function unit(input: Vec3): Vec3 {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length !== 3
    || Reflect.ownKeys(input).length !== 4) throw new Error('La dirección debe contener tres coordenadas propias.')
  const data = [0, 1, 2].map(index => {
    const field = Object.getOwnPropertyDescriptor(input, String(index))
    if (!field?.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw new Error('La dirección debe contener datos numéricos finitos.')
    return field.value as number
  }) as Vec3
  const length = Math.hypot(...data)
  if (Math.abs(length - 1) > 1e-8) throw new Error('La dirección angular debe ser unitaria.')
  return data.map(value => value / length) as Vec3
}

/**
 * Right-handed circular angle from first to second after projection normal to guide.
 * No hidden axis, alignment constraint, accumulated turn or saved angular zero.
 * Numeric inputs alone are not evidence of a current native geometric support.
 */
export function measureDirectedAngle(first: Vec3, second: Vec3, guide: Vec3,
  angleToleranceRadians = ASSEMBLY_DIRECTED_ANGLE_TOLERANCE_RADIANS): { angleRadians: number; projectionLengths: { first: number; second: number } } {
  if (!Number.isFinite(angleToleranceRadians) || angleToleranceRadians <= 0 || angleToleranceRadians >= Math.PI) throw new RangeError('La precisión angular debe ser positiva y menor que pi radianes.')
  const a = unit(first), b = unit(second), g = unit(guide), ga = cross(g, a), gb = cross(g, b),
    firstLength = Math.hypot(...ga), secondLength = Math.hypot(...gb)
  // Float64 admission policy for projection conditioning, not a certified native-kernel error bound.
  // It rejects an unobservable direction instead of inventing its azimuth or relaxing precision.
  const arithmeticAllowance = 64 * Number.EPSILON * (1 + 1 / firstLength + 1 / secondLength)
  if (!Number.isFinite(arithmeticAllowance) || arithmeticAllowance > angleToleranceRadians) throw new RangeError('Una dirección es paralela o demasiado próxima al eje guía para medir este ángulo con la precisión solicitada.')
  const u = cross(ga, g).map(value => value / firstLength) as Vec3,
    v = cross(gb, g).map(value => value / secondLength) as Vec3,
    signed = Math.atan2(dot(g, cross(u, v)), dot(u, v))
  let angleRadians = signed < 0 ? signed + 2 * Math.PI : signed
  // A negative sub-ULP angle may round to exactly one turn. The circular endpoint is zero.
  if (angleRadians === 2 * Math.PI || Object.is(angleRadians, -0)) angleRadians = 0
  return { angleRadians, projectionLengths: { first: firstLength, second: secondLength } }
}
