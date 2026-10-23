import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { assemblyDefinitionKey } from '../model/assemblyDocument'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type RigidPose } from '../model/rigidPose'
import type { RigidMateEndpoint, RigidMateSupport } from '../model/assemblySolveTypes'
import type { Vec3 } from './kernel.types'
import type { AssemblyConfigurationGeometrySnapshot, AssemblyConfigurationGeometryInput, AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import { configuredAssemblyScopedEndpointFrame, assertConfiguredAssemblyNumericalScope, type ConfiguredAssemblyNumericalScope } from './kernel.assembly-configuration-scope'

/** Actual full-root rigid owner and its effective descendant frame. This is a
 * numerical adapter, not an issuance path for configured or legacy proofs. */
export function configuredAssemblyEndpointFrame(
  snapshot: AssemblyConfigurationGeometrySnapshot,
  input: AssemblyConfigurationGeometryInput,
  witness: AssemblyConfigurationWitness,
  scope?: ConfiguredAssemblyNumericalScope,
): Pick<RigidMateEndpoint, 'bodyId' | 'frame'> {
  if (scope !== undefined) return configuredAssemblyScopedEndpointFrame(snapshot, input, scope, witness)
  snapshot.assertWitness(witness, input)
  const evaluation = evaluateAssemblyConfiguration(input.document, input.catalog, input.rootConfiguration)
  const path = witness.componentPath
  const owner = path[0] ?? null
  if (owner !== witness.topLevelOwner) throw Error('The configured rigid owner does not match the issued reference.')
  const scopes = new Map(evaluation.scopes.map(scope => [JSON.stringify(scope.path), scope]))
  const terminal = evaluation.parts.find(part => samePath(part.path, path)) ?? scopes.get(JSON.stringify(path))
  if (!terminal || terminal.suppressed || assemblyDefinitionKey(terminal.definition) !== assemblyDefinitionKey(witness.definition)) {
    throw Error('The configured endpoint is not an active exact declaration.')
  }
  const ancestry = evaluation.scopes.filter(scope => scope.path.length <= path.length && scope.path.every((id, i) => id === path[i]))
    .map(scope => ({ path: scope.path, definition: scope.definition, configuration: scope.configuration }))
  if (JSON.stringify(ancestry) !== JSON.stringify(witness.configurationAncestry)) {
    throw Error('The configured endpoint ancestry no longer matches its issued context.')
  }
  let frame: RigidPose = identityRigidPose()
  // Deliberately exclude the root owner's pose. Inverting a composed world
  // placement would lose small descendant translations under large parents.
  for (let index = 0; index < path.length; index++) {
    const scope = scopes.get(JSON.stringify(path.slice(0, index)))
    const occurrence = scope?.occurrences.find(value => value.id === path[index])
    if (!occurrence || occurrence.suppressed) throw Error('The effective configured occurrence chain is unavailable.')
    if (index > 0) frame = composeRigidPoses(frame, validateRigidPose(occurrence.pose))
  }
  snapshot.assertWitness(witness, input)
  return { bodyId: owner, frame }
}
function samePath(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index])
}
function vector(value: readonly number[]): Vec3 { return [value[0], value[1], value[2]] }

/** Copy local native values into numerical input. Direction-only witnesses
 * remain direction-only: callers must retain that purpose when choosing an
 * equation, never treat this detached endpoint as positional native authority.
 * Advanced profiles and paths require their dedicated numerical adapters. */
export function configuredAssemblyEndpoint(
  snapshot: AssemblyConfigurationGeometrySnapshot,
  input: AssemblyConfigurationGeometryInput,
  witness: AssemblyConfigurationWitness,
  scope?: ConfiguredAssemblyNumericalScope,
): RigidMateEndpoint {
  const base = configuredAssemblyEndpointFrame(snapshot, input, witness, scope)
  let support: RigidMateSupport
  switch (witness.kind) {
    case 'configured-component': return base
    case 'configured-point':
      support = { kind: 'point', point: vector(witness.localSupport.point), tolerance: witness.localSupport.tolerance }
      break
    case 'configured-sphere-surface':
      support = { kind: 'sphere', point: vector(witness.localSupport.center), radius: witness.localSupport.radius, tolerance: witness.localSupport.tolerance }
      break
    case 'configured-plane': case 'configured-support': case 'configured-direction': case 'configured-cylinder-surface': {
      const local = witness.localSupport
      const common = { point: vector(local.point), tolerance: local.tolerance }
      if (local.kind === 'line') support = { ...common, kind: 'line', axis: vector(local.axis) }
      else if (local.kind === 'plane') support = { ...common, kind: 'plane', normal: vector(local.normal), xDirection: vector(local.xDirection) }
      else support = { ...common, kind: 'cylinder', axis: vector(local.axis), xDirection: vector(local.xDirection), radius: local.radius }
      break
    }
    default: throw Error('Advanced configured profiles and paths require a dedicated numerical endpoint adapter.')
  }
  if (scope === undefined) snapshot.assertWitness(witness, input)
  else assertConfiguredAssemblyNumericalScope(snapshot, input, scope)
  return { ...base, support }
}
