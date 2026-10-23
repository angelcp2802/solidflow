import { validateAssemblyCylinderSurfaceReference, validateAssemblyGeometryReference, validateAssemblyPlaneReference,
  validateAssemblySphereSurfaceReference, validateAssemblyVertexReference, type AssemblyAxisReference, type AssemblyCylinderSurfaceReference,
  type AssemblyEdgeReference, type AssemblyPlaneReference, type AssemblySphereSurfaceReference, type AssemblyVertexReference } from './assemblyDocument'

/** A selected infinite line may be an actual LINE edge or a cylinder's explicit
 * derived axis. Neither purpose authenticates a cylindrical surface. */
export type AssemblySymmetryLineReference = AssemblyEdgeReference | AssemblyAxisReference
interface Mirror { mirror: AssemblyPlaneReference }
/** Standalone selection syntax, not a saved mate or native verification. */
export type AssemblySymmetryReferenceSet = Mirror & (
  | { entityKind: 'point'; source: AssemblyVertexReference; target: AssemblyVertexReference; alignment: null }
  | { entityKind: 'line'; source: AssemblySymmetryLineReference; target: AssemblySymmetryLineReference; alignment: 'aligned' | 'opposed' }
  | { entityKind: 'plane'; source: AssemblyPlaneReference; target: AssemblyPlaneReference; alignment: 'aligned' | 'opposed' }
  | { entityKind: 'sphere'; source: AssemblySphereSurfaceReference; target: AssemblySphereSurfaceReference; alignment: null }
  | { entityKind: 'cylinder'; source: AssemblyCylinderSurfaceReference; target: AssemblyCylinderSurfaceReference; alignment: 'aligned' | 'opposed' }
)
function fields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Symmetry selection requires a plain data record.')
  const allowed = ['entityKind', 'source', 'target', 'mirror', 'alignment'], data = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(data)
  if (keys.length !== allowed.length || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) throw new Error('Symmetry selection has missing or unknown fields.')
  return Object.fromEntries(allowed.map(key => {
    const field = data[key]
    if (!field || !field.enumerable || !('value' in field)) throw new Error('Symmetry selection requires own data fields.')
    return [key, field.value]
  }))
}
function line(value: unknown): AssemblySymmetryLineReference {
  const ref = validateAssemblyGeometryReference(value)
  if (ref.kind === 'edge') return ref
  if (ref.kind === 'face' && ref.support === 'axis') return { ...ref, support: 'axis' }
  throw new Error('Symmetry line purpose requires an actual LINE edge or an explicit face axis.')
}
function scoped<T extends AssemblyPlaneReference | AssemblyVertexReference | AssemblySymmetryLineReference | AssemblySphereSurfaceReference | AssemblyCylinderSurfaceReference>(ref: T): T {
  if (ref.kind !== 'principal-plane' && ref.body !== null) {
    const locator = ref.kind === 'vertex' ? ref.vertex : ref.kind === 'edge' ? ref.edge : ref.face
    if (ref.body.sourceFeatureId !== locator.sourceFeatureId) throw new Error('Symmetry body and topology source must match exactly.')
  }
  return ref
}
/** Detached strict declaration only. Current native membership, ownership and
 * physical correspondence must be verified by a separate snapshot operation. */
export function validateAssemblySymmetryReferenceSet(value: unknown): AssemblySymmetryReferenceSet {
  const data = fields(value), mirror = scoped(validateAssemblyPlaneReference(data.mirror))
  const directed = (): 'aligned' | 'opposed' => {
    if (data.alignment !== 'aligned' && data.alignment !== 'opposed') throw new Error('Directional symmetry needs an explicit alignment.')
    return data.alignment
  }
  const undirected = (): null => { if (data.alignment !== null) throw new Error('Point/sphere symmetry requires null alignment.'); return null }
  switch (data.entityKind) {
    case 'point': return { entityKind: 'point', source: scoped(validateAssemblyVertexReference(data.source)), target: scoped(validateAssemblyVertexReference(data.target)), mirror, alignment: undirected() }
    case 'line': return { entityKind: 'line', source: scoped(line(data.source)), target: scoped(line(data.target)), mirror, alignment: directed() }
    case 'plane': return { entityKind: 'plane', source: scoped(validateAssemblyPlaneReference(data.source)), target: scoped(validateAssemblyPlaneReference(data.target)), mirror, alignment: directed() }
    case 'sphere': return { entityKind: 'sphere', source: scoped(validateAssemblySphereSurfaceReference(data.source)), target: scoped(validateAssemblySphereSurfaceReference(data.target)), mirror, alignment: undirected() }
    case 'cylinder': return { entityKind: 'cylinder', source: scoped(validateAssemblyCylinderSurfaceReference(data.source)), target: scoped(validateAssemblyCylinderSurfaceReference(data.target)), mirror, alignment: directed() }
    default: throw new Error('Unknown symmetry entity family.')
  }
}
