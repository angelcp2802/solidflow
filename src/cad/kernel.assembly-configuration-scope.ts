import { evaluateAssemblyConfiguration, type AssemblyConfigurationAncestry, type AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import { assemblyDefinitionKey, assemblyOccurrencePathKey, type AssemblyDefinitionReference } from '../model/assemblyDocument'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type RigidPose } from '../model/rigidPose'
import type { RigidMateEndpoint } from '../model/assemblySolveTypes'
import { AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput, type AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import type { ConfiguredResolvedMate } from './kernel.assembly-configuration-relations'

type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T
/** Closed numerical context. Material witnesses keep their original physical
 * root owner. This context grants neither a native capture nor an edit. */
export type ConfiguredAssemblyNumericalScope = ReadonlyData<{
  kind: 'configured-numerical-scope'
  scopePath: string[]
  definition: AssemblyDefinitionReference
  configuration: string | null
  configurationAncestry: AssemblyConfigurationAncestry[]
  bodies: { id: string; pose: RigidPose; fixed: boolean }[]
}>
type Scope = AssemblyConfigurationEvaluation['scopes'][number]
interface ScopeEvaluation {
  evaluation: AssemblyConfigurationEvaluation
  scopes: Map<string, Scope>
  parts: Map<string, AssemblyConfigurationEvaluation['parts'][number]>
}
interface ScopeContext extends ScopeEvaluation {
  owner: AssemblyConfigurationGeometrySnapshot
  scope: Scope
}
const contexts = new WeakMap<object, ScopeContext>()
// One detached evaluation per exact native session avoids duplicating source
// bytes for every local scope. Complete native checks still bracket every use.
const evaluations = new WeakMap<AssemblyConfigurationGeometrySnapshot, ScopeEvaluation>()
// Bind authentication to the native implementation, never a caller-supplied
// structural provider or an instance method override. Private fields brand the
// receiver; the existing private registries authenticate the returned objects.
const checkCurrent = AssemblyConfigurationGeometrySnapshot.prototype.assertCurrent
const checkWitness = AssemblyConfigurationGeometrySnapshot.prototype.assertWitness
const checkRelation = AssemblyConfigurationGeometrySnapshot.prototype.assertResolvedMate
function frozen<T>(value: T, seen = new WeakSet<object>()): ReadonlyData<T> {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value)
    for (const child of Object.values(value)) frozen(child, seen)
    Object.freeze(value)
  }
  return value as ReadonlyData<T>
}
function prefix(first: readonly string[], second: readonly string[]): boolean {
  return first.length <= second.length && first.every((id, index) => id === second[index])
}
function samePath(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && prefix(first, second)
}
function owned(snapshot: AssemblyConfigurationGeometrySnapshot, scope: ConfiguredAssemblyNumericalScope): ScopeContext {
  const context = scope && typeof scope === 'object' ? contexts.get(scope) : undefined
  if (!context || context.owner !== snapshot) throw Error('The numerical scope was not created for this configured native session.')
  return context
}

/** Select a real active assembly scope from this exact live native context.
 * Its direct effective children are local numerical bodies, including hidden
 * children, with their authored fixed flags. Suppressed children are absent. */
export function createConfiguredAssemblyNumericalScope(snapshot: AssemblyConfigurationGeometrySnapshot,
  input: AssemblyConfigurationGeometryInput, scopePath: readonly string[]): ConfiguredAssemblyNumericalScope {
  checkCurrent.call(snapshot, input)
  const path = JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
  let retained = evaluations.get(snapshot)
  if (!retained) {
    const evaluation = evaluateAssemblyConfiguration(input.document, input.catalog, input.rootConfiguration)
    retained = { evaluation, scopes: new Map(evaluation.scopes.map(value => [JSON.stringify(value.path), value])),
      parts: new Map(evaluation.parts.map(value => [JSON.stringify(value.path), value])) }
  }
  const { evaluation, scopes } = retained
  const selected = scopes.get(JSON.stringify(path))
  if (!selected || selected.suppressed) throw Error('The numerical scope must be an active exact assembly occurrence.')
  const scope = frozen({ kind: 'configured-numerical-scope' as const, scopePath: path,
    definition: { ...selected.definition }, configuration: selected.configuration,
    configurationAncestry: evaluation.scopes.filter(value => prefix(value.path, path))
      .map(value => ({ path: [...value.path], definition: { ...value.definition }, configuration: value.configuration })),
    bodies: selected.occurrences.filter(value => !value.suppressed)
      .map(value => ({ id: value.id, pose: validateRigidPose(value.pose), fixed: value.fixed })),
  })
  checkCurrent.call(snapshot, input)
  evaluations.set(snapshot, retained)
  contexts.set(scope, { owner: snapshot, ...retained, scope: selected })
  return scope
}

/** Complete-context checks apply even to an empty scope or a body-only caller.
 * Copies, foreign sessions and obsolete contexts cannot acquire this closure. */
export function assertConfiguredAssemblyNumericalScope(snapshot: AssemblyConfigurationGeometrySnapshot,
  input: AssemblyConfigurationGeometryInput, scope: ConfiguredAssemblyNumericalScope): ConfiguredAssemblyNumericalScope {
  checkCurrent.call(snapshot, input)
  owned(snapshot, scope)
  checkCurrent.call(snapshot, input)
  return scope
}

/** A local problem contains relations declared in that exact placed scope.
 * Equal intrinsic states in sibling instances retain distinct native grants. */
export function assertConfiguredAssemblyScopedRelation(snapshot: AssemblyConfigurationGeometrySnapshot,
  input: AssemblyConfigurationGeometryInput, scope: ConfiguredAssemblyNumericalScope, value: ConfiguredResolvedMate): void {
  checkRelation.call(snapshot, value, input)
  const context = owned(snapshot, scope)
  if (!samePath(context.scope.path, value.scopePath)
    || assemblyDefinitionKey(context.scope.definition) !== assemblyDefinitionKey(value.scope)
    || context.scope.configuration !== value.configuration) {
    throw Error('The configured relation is not declared in this exact numerical scope.')
  }
  checkCurrent.call(snapshot, input)
}

/** Recompose below the immediate numerical child without inverting a world
 * pose. The witness's genuine physical owner and original-chain arithmetic are
 * never rewritten. A reference to the scope itself is its static local frame. */
export function configuredAssemblyScopedEndpointFrame(snapshot: AssemblyConfigurationGeometrySnapshot,
  input: AssemblyConfigurationGeometryInput, scope: ConfiguredAssemblyNumericalScope,
  witness: AssemblyConfigurationWitness): Pick<RigidMateEndpoint, 'bodyId' | 'frame'> {
  checkWitness.call(snapshot, witness, input)
  const context = owned(snapshot, scope), path = witness.componentPath, start = context.scope.path.length
  if (!prefix(context.scope.path, path)) throw Error('The configured reference lies outside its numerical scope.')
  if ((path[0] ?? null) !== witness.topLevelOwner) throw Error('The configured reference lost its physical root owner.')
  const terminal = context.parts.get(JSON.stringify(path)) ?? context.scopes.get(JSON.stringify(path))
  if (!terminal || terminal.suppressed || assemblyDefinitionKey(terminal.definition) !== assemblyDefinitionKey(witness.definition)) {
    throw Error('The numerical endpoint is not an active exact configured declaration.')
  }
  const ancestry = context.evaluation.scopes.filter(value => prefix(value.path, path))
    .map(value => ({ path: value.path, definition: value.definition, configuration: value.configuration }))
  if (JSON.stringify(ancestry) !== JSON.stringify(witness.configurationAncestry)) throw Error('The configured endpoint ancestry differs from its numerical scope context.')
  const bodyId = path[start] ?? null
  if (bodyId !== null && !context.scope.occurrences.some(value => value.id === bodyId && !value.suppressed)) {
    throw Error('The configured numerical owner is unavailable.')
  }
  let frame = identityRigidPose()
  for (let index = start + 1; index < path.length; index++) {
    const parent = context.scopes.get(JSON.stringify(path.slice(0, index)))
    const occurrence = parent?.occurrences.find(value => value.id === path[index])
    if (!occurrence || occurrence.suppressed) throw Error('The effective numerical descendant chain is unavailable.')
    frame = composeRigidPoses(frame, validateRigidPose(occurrence.pose))
  }
  checkWitness.call(snapshot, witness, input)
  return { bodyId, frame }
}
