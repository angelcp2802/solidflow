import { assemblyDefinitionKey } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { validateAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { composeRigidPoses, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { rotationExp } from '../model/assemblyKinematics'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import type { AssemblyScene } from '../cad/kernel.assembly-types'
type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
/** A detached mutable display copy; this never invokes a legacy CAD producer. */
export function configuredUiDisplayScene(scene: ConfiguredAssemblyScene): AssemblyScene {
  return structuredClone(scene.scene) as Mutable<ConfiguredAssemblyScene['scene']>
}

export function createConfiguredUiRootVariant(document: AssemblyConfiguredDocument, id: string): AssemblyConfiguredDocument {
  return createConfiguredUiScopeVariant(document, [], id, id)
}
export function createConfiguredUiScopeVariant(document: AssemblyConfiguredDocument, scopePath: string[], name: string, id = name): AssemblyConfiguredDocument {
  const next = validateAssemblyConfiguredDocument(document), evaluation = evaluateAssemblyConfiguration(next.source, next.catalog, next.rootConfiguration)
  if (!name.trim() || !id.trim()) throw Error('Escribe un nombre para la configuración.')
  const scope = evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify(scopePath))
  if (!scope) throw Error('El ámbito de la nueva configuración ya no está disponible.')
  const parent = scopePath.length ? evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify(scopePath.slice(0, -1)))! : null
  if (parent?.configuration === null) throw Error('Crea una configuración del padre primero para seleccionar esta nueva variante hija.')
  const definition = { ...scope.definition }
  let owner = next.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(definition))
  if (!owner) { owner = { definition, configurations: [] }; next.catalog.push(owner) }
  if (owner.configurations.some(row => row.id === id)) throw Error('Ya existe una configuración con ese nombre.')
  owner.configurations.push({ id, name, occurrences: [], mates: [] })
  if (parent) {
    const parentOwner = next.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(parent.definition))!
    const variant = parentOwner.configurations.find(row => row.id === parent.configuration)!
    let row = variant.occurrences.find(row => row.occurrenceId === scopePath.at(-1))
    if (!row) { row = { occurrenceId: scopePath.at(-1)! }; variant.occurrences.push(row) }
    row.configuration = id
  } else next.rootConfiguration = id
  return validateAssemblyConfiguredDocument(next)
}
/** Explicit local incremental rotation; a zero increment preserves the declared
 * orientation and requires no knowledge of its quaternion representation. */
export function configuredUiPose(initial: { readonly translation: readonly number[]; readonly rotation: readonly number[] }, translation: number[], axis: 'X' | 'Y' | 'Z', degrees: number): RigidPose {
  const base = validateRigidPose({ translation, rotation: initial.rotation })
  if (!['X', 'Y', 'Z'].includes(axis) || !Number.isFinite(degrees)) throw Error('Elige un eje y un giro finito en grados.')
  if (degrees === 0) return base
  const angle = degrees * Math.PI / 180, vector: [number, number, number] = [0, 0, 0]
  if (!Number.isFinite(angle)) throw Error('El giro excede la precisión numérica disponible.')
  vector[['X', 'Y', 'Z'].indexOf(axis)] = angle
  return composeRigidPoses(base, { translation: [0, 0, 0], rotation: rotationExp(vector) })
}
export function editConfiguredUiOccurrence(document: AssemblyConfiguredDocument, scopePath: string[], occurrenceId: string,
  change: { pose?: RigidPose; visible?: boolean; suppressed?: boolean; configuration?: string | null }): AssemblyConfiguredDocument {
  const next = validateAssemblyConfiguredDocument(document), evaluation = evaluateAssemblyConfiguration(next.source, next.catalog, next.rootConfiguration)
  const scope = evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify(scopePath))
  if (!scope || !scope.occurrences.some(row => row.id === occurrenceId)) throw Error('La ocurrencia ya no pertenece al ámbito actual.')
  const pose = change.pose === undefined ? {} : { pose: validateRigidPose(change.pose) }
  if (scope.configuration === null) {
    if (Object.hasOwn(change, 'configuration')) throw Error('Crea primero una configuración del padre para elegir una variante hija.')
    const owner = scopePath.length === 0 ? next.source : next.source.definitions.find(row => assemblyDefinitionKey(row) === assemblyDefinitionKey(scope.definition))
    if (!owner || owner.kind !== 'assembly') throw Error('El ámbito de ensamblaje ya no está disponible.')
    const row = owner.occurrences.find(row => row.id === occurrenceId)!
    Object.assign(row, change, pose)
  } else {
    const owner = next.catalog.find(row => assemblyDefinitionKey(row.definition) === assemblyDefinitionKey(scope.definition))!
    const variant = owner.configurations.find(row => row.id === scope.configuration)!
    let override = variant.occurrences.find(row => row.occurrenceId === occurrenceId)
    if (!override) { override = { occurrenceId }; variant.occurrences.push(override) }
    Object.assign(override, change, pose)
  }
  return validateAssemblyConfiguredDocument(next)
}
export interface ConfiguredUiTicket { serialized: string; generation: number; scope: string; path?: string; occurrence?: string }
export function configuredUiTicket(document: AssemblyConfiguredDocument, generation: number, scope: string, path?: string, occurrence?: string): ConfiguredUiTicket {
  return { serialized: serializeAssemblyConfiguredDocument(document), generation, scope, path, occurrence }
}
export function configuredUiTicketMatches(ticket: ConfiguredUiTicket, current: ConfiguredUiTicket): boolean {
  return ticket.serialized === current.serialized && ticket.generation === current.generation && ticket.scope === current.scope && ticket.path === current.path && ticket.occurrence === current.occurrence
}
export function configuredUiSceneMatches(scene: ConfiguredAssemblyScene, document: AssemblyConfiguredDocument, generation: number): boolean {
  const checked = validateAssemblyConfiguredDocument(document), context = scene?.context
  return scene?.kind === 'configured-assembly-scene' && scene.scene?.kind === 'assembly-scene' && context?.generation === generation
    && context.root?.id === checked.source.id && context.root.revision === checked.source.revision && context.rootConfiguration === checked.rootConfiguration
    && context.sourceSignature === JSON.stringify(checked.source) && context.catalogSignature === JSON.stringify(checked.catalog)
}
