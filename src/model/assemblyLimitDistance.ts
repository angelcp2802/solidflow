export interface AssemblyLimitDistanceLimits { minimum: number; maximum: number }
export type AssemblyLimitDistanceActivity = 'interior' | 'minimum' | 'maximum' | 'both'

/** Signed inclusive bounds; equality remains two unilateral declarations. */
export function validateAssemblyLimitDistanceLimits(value: unknown): AssemblyLimitDistanceLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Distance limits must be plain data.')
  const keys = Reflect.ownKeys(value)
  if (keys.length !== 2 || !keys.includes('minimum') || !keys.includes('maximum')) throw new Error('Distance limits require only minimum and maximum.')
  const read = (key: string): number => {
    const field = Object.getOwnPropertyDescriptor(value, key)
    if (!field || !field.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw new Error('Distance limits must be finite own numeric data.')
    return field.value
  }
  const minimum = read('minimum'), maximum = read('maximum')
  if (minimum > maximum) throw new Error('Minimum distance must not exceed maximum distance.')
  return { minimum, maximum }
}

/** Geometric proximity only; this is neither a working set nor a multiplier. */
export function assemblyLimitDistanceActivity(coordinate: number, limits: AssemblyLimitDistanceLimits, tolerance: number): AssemblyLimitDistanceActivity {
  const bounds = validateAssemblyLimitDistanceLimits(limits)
  if (!Number.isFinite(coordinate) || !Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('Distance activity needs finite coordinates and positive precision.')
  const lower = coordinate - bounds.minimum, upper = coordinate - bounds.maximum
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) throw new RangeError('Distance activity subtraction exceeds finite precision.')
  const minimum = Math.abs(lower) <= tolerance, maximum = Math.abs(upper) <= tolerance
  return minimum && maximum ? 'both' : minimum ? 'minimum' : maximum ? 'maximum' : 'interior'
}
