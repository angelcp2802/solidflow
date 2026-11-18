import { validateAssemblyGeometryReference, validateAssemblyPlaneReference,
  type AssemblyAxisReference, type AssemblyEdgeReference, type AssemblyPlaneReference } from './assemblyDocument'

/** Saved syntax only. Actual axiality and effective rigid ownership require
 * current native proof; paths or matching owner labels alone do not prove it. */
export interface AssemblyHingeReferenceRequest {
  axis: [AssemblyAxisReference | AssemblyEdgeReference, AssemblyAxisReference | AssemblyEdgeReference]
  axial: [AssemblyPlaneReference, AssemblyPlaneReference]
  alignment: 'aligned' | 'opposed'
}
function fields(value: unknown, required: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Hinge references require plain data.')
  const keys = Reflect.ownKeys(value)
  if (keys.length !== required.length) throw Error('Hinge reference fields must be exact.')
  return Object.fromEntries(keys.map(key => {
    const d = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !required.includes(key) || !d.enumerable || !('value' in d)) throw Error('Hinge references require own data fields.')
    return [key, d.value]
  }))
}
function pair<T>(value: unknown, parse: (entry: unknown) => T): [T, T] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 2 || Reflect.ownKeys(value).length !== 3) throw Error('Hinge groups need two dense references.')
  return [0, 1].map(i => {
    const d = Object.getOwnPropertyDescriptor(value, String(i))
    if (!d?.enumerable || !('value' in d)) throw Error('Hinge groups require own data references.')
    return parse(d.value)
  }) as [T, T]
}
export function validateAssemblyHingeReferenceRequest(input: unknown): AssemblyHingeReferenceRequest {
  const value = fields(input, ['axis', 'axial', 'alignment'])
  if (value.alignment !== 'aligned' && value.alignment !== 'opposed') throw Error('Hinge axis alignment must be explicit.')
  const axis = pair(value.axis, entry => {
    const ref = validateAssemblyGeometryReference(entry)
    if (ref.kind === 'edge') return ref
    if (ref.kind === 'face' && ref.support === 'axis') return { ...ref, support: 'axis' as const }
    throw Error('Hinge axes require actual LINE edges or explicit cylindrical face axes.')
  })
  return { axis, axial: pair(value.axial, validateAssemblyPlaneReference), alignment: value.alignment }
}
