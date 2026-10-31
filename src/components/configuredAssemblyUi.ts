import { assemblyDefinitionKey } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { validateAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { composeRigidPoses, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { rotationExp } from '../model/assemblyKinematics'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import type { AssemblyScene } from '../cad/kernel.assembly-types'
import type { ConfiguredAssemblyBomMember, ConfiguredAssemblyBomReport, ConfiguredAssemblyBomOptions } from '../model/assemblyConfiguredBom'
import { serializeConfiguredAssemblyBomCsv } from '../model/assemblyConfiguredBomCsv'
import { validateAssemblyMate } from '../model/assemblyDocument'
import type { AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { validateAssemblyConfiguredMechanicalEdit, configuredMechanicalMateSpec, type AssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'
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
export interface ConfiguredUiTicket { serialized: string; generation: number; scope: string; path?: string; occurrence?: string; draftRevision?: number; navigationRevision?: number }
export function configuredUiTicket(document: AssemblyConfiguredDocument, generation: number, scope: string, path?: string, occurrence?: string, draftRevision?: number, navigationRevision?: number): ConfiguredUiTicket {
  return { serialized: serializeAssemblyConfiguredDocument(document), generation, scope, path, occurrence, draftRevision, navigationRevision }
}
export function configuredUiTicketMatches(ticket: ConfiguredUiTicket, current: ConfiguredUiTicket): boolean {
  return ticket.serialized === current.serialized && ticket.generation === current.generation && ticket.scope === current.scope && ticket.path === current.path && ticket.occurrence === current.occurrence && ticket.draftRevision === current.draftRevision && ticket.navigationRevision === current.navigationRevision
}
export interface ConfiguredMateUiTicket { context: ConfiguredUiTicket; revision: number; draft: string; sceneId: string | null }
export function configuredMateUiTicketMatches(before: ConfiguredMateUiTicket, after: ConfiguredMateUiTicket): boolean {
  return configuredUiTicketMatches(before.context, after.context) && before.revision === after.revision && before.draft === after.draft && before.sceneId === after.sceneId
}
/** Display consistency only. The private worker token remains Apply authority. */
export function configuredMateUiPreviewMatches(document: AssemblyConfiguredDocument, edit: AssemblyConfiguredMateEdit): boolean {
  try {
    const evaluation = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration)
    const scope = evaluation.scopes.find(value => JSON.stringify(value.path) === JSON.stringify(edit.scopePath))
    if (!scope || assemblyDefinitionKey(scope.definition) !== assemblyDefinitionKey(edit.definition) || scope.configuration !== edit.configuration) return false
    const change = edit.change, id = change.kind === 'add' ? change.mate.id : change.mateId, mates = scope.mates.filter(value => value.id === id)
    if (change.kind === 'remove') return mates.length === 0
    if (mates.length !== 1) return false
    return change.kind === 'suppression' ? mates[0].suppressed === change.suppressed : JSON.stringify(validateAssemblyMate(mates[0])) === JSON.stringify(validateAssemblyMate(change.mate))
  } catch { return false }
}
/** Authored intent consistency only. Generated captures and private Apply
 * authority belong to the worker, never to this display comparison. */
export function configuredMechanicalUiPreviewMatches(document: AssemblyConfiguredDocument, intent: AssemblyConfiguredMechanicalEdit): boolean {
  try {
    const edit = validateAssemblyConfiguredMechanicalEdit(intent), evaluation = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration)
    const scope = evaluation.scopes.find(value => JSON.stringify(value.path) === JSON.stringify(edit.scopePath))
    if (!scope || assemblyDefinitionKey(scope.definition) !== assemblyDefinitionKey(edit.definition) || scope.configuration !== edit.configuration) return false
    const spec = edit.change.spec, mates = scope.mates.filter(value => value.id === spec.id)
    if (mates.length === 1 && mates[0].type === 'concentric' && mates[0].rotationLock === null) return false
    return mates.length === 1 && JSON.stringify(configuredMechanicalMateSpec(validateAssemblyMate(mates[0]))) === JSON.stringify(spec)
  } catch { return false }
}
export interface ConfiguredBomUiTicket { context: ConfiguredUiTicket; view: string; revision: number }
/** The local revision also rejects close/reopen and option away/back callbacks. */
export function configuredBomUiTicket(context: ConfiguredUiTicket, open: boolean, revision: number, options: ConfiguredAssemblyBomOptions): ConfiguredBomUiTicket {
  return { context: { ...context }, view: JSON.stringify({ open, options }), revision }
}
export function configuredBomUiTicketMatches(before: ConfiguredBomUiTicket, after: ConfiguredBomUiTicket): boolean {
  return configuredUiTicketMatches(before.context, after.context) && before.view === after.view && before.revision === after.revision
}
export function configuredBomUiSelectedPath(report: ConfiguredAssemblyBomReport | null, serialized: string,
  selection: { serialized: string; member: ConfiguredAssemblyBomMember } | null): string[] {
  if (!report || !selection || selection.serialized !== serialized) return []
  const expected = JSON.stringify(selection.member)
  const member = report.rows.flatMap(row => row.members).find(value => JSON.stringify(value) === expected)
  return member ? [...member.component.occurrencePath] : []
}
export interface ConfiguredCsvDownloadEnvironment {
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  createLink: () => { href: string; download: string; click: () => void }
  schedule: (callback: () => void, milliseconds: number) => void
}
/** Browser-only alternative to the desktop CSV bridge; owns its exact bytes. */
export function downloadConfiguredBomCsv(bytes: Uint8Array, name: string, environment: ConfiguredCsvDownloadEnvironment = {
  createObjectURL: blob => URL.createObjectURL(blob), revokeObjectURL: url => URL.revokeObjectURL(url),
  createLink: () => window.document.createElement('a'), schedule: (callback, milliseconds) => { setTimeout(callback, milliseconds) },
}): void {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw Error('El CSV está vacío o supera 20 MiB.')
  const url = environment.createObjectURL(new Blob([bytes.slice().buffer], { type: 'text/csv;charset=utf-8' }))
  try {
    const link = environment.createLink(); link.href = url; link.download = name + '.csv'; link.click()
    environment.schedule(() => environment.revokeObjectURL(url), 2000)
  } catch (reason) { environment.revokeObjectURL(url); throw reason }
}
export async function runConfiguredBomCsvExport(document: AssemblyConfiguredDocument, options: ConfiguredAssemblyBomOptions, io: {
  isCurrent: () => boolean
  write?: (bytes: Uint8Array, name: string) => Promise<string | null>
  download: (bytes: Uint8Array, name: string) => void
}): Promise<'stale' | 'cancelled' | 'exported'> {
  // Serialize this complete committed context before the first await. A report
  // or display scene is deliberately not an accepted input.
  const bytes = new TextEncoder().encode(serializeConfiguredAssemblyBomCsv(document, options)), name = document.source.name + '-materiales-configurados'
  if (!io.isCurrent()) return 'stale'
  if (io.write) {
    // The dialog/write cannot be canceled by closing the table. Its caller
    // retains the shared file-operation gate until this promise settles.
    const target = await io.write(bytes, name)
    if (!io.isCurrent()) return 'stale'
    return target === null ? 'cancelled' : 'exported'
  }
  io.download(bytes, name)
  return io.isCurrent() ? 'exported' : 'stale'
}
export function configuredUiSceneMatches(scene: ConfiguredAssemblyScene, document: AssemblyConfiguredDocument, generation: number): boolean {
  const checked = validateAssemblyConfiguredDocument(document), context = scene?.context
  return scene?.kind === 'configured-assembly-scene' && scene.scene?.kind === 'assembly-scene' && context?.generation === generation
    && context.root?.id === checked.source.id && context.root.revision === checked.source.revision && context.rootConfiguration === checked.rootConfiguration
    && context.sourceSignature === JSON.stringify(checked.source) && context.catalogSignature === JSON.stringify(checked.catalog)
}
