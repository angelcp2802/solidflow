export type AssemblyCylinderTangentMateType = 'skew-cylinder-tangent' | 'parallel-cylinder-tangent'
export type AssemblyCylinderTangentBranch = { kind: 'external' } | { kind: 'internal'; larger: 'first' | 'second' }

/** Intent only: native surface purpose/radii are supplied by the CAD boundary. */
export function validateAssemblyCylinderTangentBranch(input: unknown): AssemblyCylinderTangentBranch {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Cylinder tangency branch must be plain data.')
  const keys = Reflect.ownKeys(input)
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !['kind', 'larger'].includes(key) || !field.enumerable || !('value' in field)) throw new Error('Cylinder tangency branch fields must be declared own data.')
  }
  const kind = Object.getOwnPropertyDescriptor(input, 'kind')?.value
  if (kind === 'external' && keys.length === 1) return { kind: 'external' }
  const larger = Object.getOwnPropertyDescriptor(input, 'larger')?.value
  if (kind === 'internal' && keys.length === 2 && (larger === 'first' || larger === 'second')) return { kind: 'internal', larger }
  throw new Error('Cylinder tangency requires external or internal with an explicit larger-radius endpoint.')
}
function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Cylinder tangency radii must be finite and positive.')
  return value
}
/** Current radius arithmetic; no radius, target or material orientation is saved. */
export function assemblyCylinderTangentTarget(branch: AssemblyCylinderTangentBranch, firstRadius: number, secondRadius: number, lengthTolerance?: number): number {
  const intent = validateAssemblyCylinderTangentBranch(branch), first = positive(firstRadius), second = positive(secondRadius), sum = first + second
  if (!Number.isFinite(sum)) throw new RangeError('Cylinder tangency radius sum overflows.')
  const target = intent.kind === 'external' ? sum : intent.larger === 'first' ? first - second : second - first
  if (!(target > 0)) throw new Error('Internal cylinder tangency requires the declared larger radius to be strictly larger.')
  const rounding = 32 * Number.EPSILON * sum
  if (!Number.isFinite(rounding) || intent.kind === 'internal' && target <= rounding) throw new RangeError('Internal cylinder tangency radius gap is not resolvable.')
  if (lengthTolerance !== undefined && (!Number.isFinite(lengthTolerance) || lengthTolerance <= 0)) throw new Error('Cylinder tangency precision must be finite and positive.')
  if (lengthTolerance !== undefined && rounding > lengthTolerance) throw new RangeError('Cylinder tangency radii exceed the requested length precision.')
  return target
}

/** Oriented infinite-support normals, never finite contact or body containment. */
export function assemblyCylinderTangentSupportNormalRelation(branch: AssemblyCylinderTangentBranch, epsilonFirst: 1 | -1, epsilonSecond: 1 | -1): 'same' | 'opposed' {
  const intent = validateAssemblyCylinderTangentBranch(branch)
  if (![epsilonFirst, epsilonSecond].every(value => value === 1 || value === -1)) throw new Error('Cylinder radial material senses must be +1 or -1.')
  const dot = (intent.kind === 'external' ? -1 : 1) * epsilonFirst * epsilonSecond
  return dot === -1 ? 'opposed' : 'same'
}
