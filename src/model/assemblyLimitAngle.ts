export interface AssemblyLimitAngleLimits { minimum: number; maximum: number }
export interface AssemblyLimitAngleBoundsRadians { minimum: number; maximum: number }
export type AssemblyLimitAngleActivity = 'interior' | 'minimum' | 'maximum' | 'both'
export type AssemblyLimitAngleStratum = 'regular' | 'parallel' | 'antiparallel'

/** Saved principal direction bounds are degrees, never a signed angular lift. */
export function validateAssemblyLimitAngleLimits(value: unknown): AssemblyLimitAngleLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Angular limits must be plain data.')
  const keys = Reflect.ownKeys(value)
  if (keys.length !== 2 || !keys.includes('minimum') || !keys.includes('maximum')) throw new Error('Angular limits require minimum and maximum only.')
  const read = (key: string): number => {
    const field = Object.getOwnPropertyDescriptor(value, key)
    if (!field || !field.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw new Error('Angular limits must be finite own numeric data.')
    return field.value
  }
  const minimum = read('minimum'), maximum = read('maximum')
  if (minimum < 0 || maximum > 180 || minimum > maximum) throw new Error('Principal angular limits must satisfy 0 <= minimum <= maximum <= 180 degrees.')
  return { minimum, maximum }
}

export function assemblyLimitAngleRadians(limitsDegrees: AssemblyLimitAngleLimits): AssemblyLimitAngleBoundsRadians {
  const limits = validateAssemblyLimitAngleLimits(limitsDegrees), minimum = limits.minimum * (Math.PI / 180), maximum = limits.maximum * (Math.PI / 180)
  if (limits.minimum !== 0 && minimum === 0 || limits.maximum !== 0 && maximum === 0
    || limits.minimum !== limits.maximum && minimum === maximum
    || limits.minimum !== 180 && minimum === Math.PI || limits.maximum !== 180 && maximum === Math.PI) throw new RangeError('Angular bound conversion loses its declared interval or domain endpoint.')
  return { minimum, maximum }
}

export function classifyAssemblyLimitAngleStratum(angleRadians: number): AssemblyLimitAngleStratum {
  if (!Number.isFinite(angleRadians) || angleRadians < 0 || angleRadians > Math.PI) throw new RangeError('Principal angle must be finite radians in [0,pi].')
  return angleRadians === 0 ? 'parallel' : angleRadians === Math.PI ? 'antiparallel' : 'regular'
}

/** Geometric proximity only. Domain endpoint bounds may still be tautologies. */
export function assemblyLimitAngleActivity(angleRadians: number, limitsDegrees: AssemblyLimitAngleLimits, angleToleranceRadians: number): AssemblyLimitAngleActivity {
  classifyAssemblyLimitAngleStratum(angleRadians)
  if (!Number.isFinite(angleToleranceRadians) || angleToleranceRadians <= 0) throw new RangeError('Angular activity needs positive finite radian precision.')
  const limitsRadians = assemblyLimitAngleRadians(limitsDegrees), minimum = Math.abs(angleRadians - limitsRadians.minimum) <= angleToleranceRadians,
    maximum = Math.abs(angleRadians - limitsRadians.maximum) <= angleToleranceRadians
  return minimum && maximum ? 'both' : minimum ? 'minimum' : maximum ? 'maximum' : 'interior'
}
