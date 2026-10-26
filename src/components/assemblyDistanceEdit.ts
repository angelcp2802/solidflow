import { validateAssemblyPlaneReference, type AssemblyDefinitionReference, type AssemblyGeometryReference, type AssemblyMate } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'

export type AssemblyDistanceMate = Extract<AssemblyMate, { type: 'distance' }>
export interface AssemblyDistanceEditContext {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference & { mates: readonly AssemblyMate[] }
  session: number
}
export interface AssemblyDistanceEditTicket {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference
  session: number
  mateId: string
  mateSignature: string
}

/** Retain declaration identity, not a worker token: Cancel may revoke a preview
 * without ending this editor. A document/session/scope change must end it. */
export function retainAssemblyDistanceEdit(context: AssemblyDistanceEditContext, mate: AssemblyDistanceMate): AssemblyDistanceEditTicket | null {
  const matches = context.scope.mates.filter(value => value.id === mate.id)
  if (matches.length !== 1 || matches[0].type !== 'distance' || JSON.stringify(matches[0]) !== JSON.stringify(mate)) return null
  return { documentSignature: context.documentSignature, scopePath: [...context.scopePath],
    scope: { id: context.scope.id, revision: context.scope.revision }, session: context.session,
    mateId: mate.id, mateSignature: JSON.stringify(mate) }
}

export function resolveAssemblyDistanceEdit(ticket: AssemblyDistanceEditTicket | null, context: AssemblyDistanceEditContext): AssemblyDistanceMate | null {
  if (!ticket || ticket.documentSignature !== context.documentSignature || ticket.session !== context.session
    || JSON.stringify(ticket.scopePath) !== JSON.stringify(context.scopePath)
    || ticket.scope.id !== context.scope.id || ticket.scope.revision !== context.scope.revision) return null
  const matches = context.scope.mates.filter(value => value.id === ticket.mateId)
  return matches.length === 1 && matches[0].type === 'distance' && JSON.stringify(matches[0]) === ticket.mateSignature ? matches[0] : null
}

export function assemblyDistanceUiEdit(mate: AssemblyDistanceMate, fields: { name: string; distance: string; alignment: 'aligned' | 'opposed';
  references?: readonly [AssemblyGeometryReference | null, AssemblyGeometryReference | null] }): Extract<NewAssemblyMate, { type: 'distance' }> {
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  if (!fields.distance.trim() || !Number.isFinite(Number(fields.distance))) throw new Error('Escribe una distancia firmada finita.')
  if (fields.alignment !== 'aligned' && fields.alignment !== 'opposed') throw new Error('Selecciona una orientación válida.')
  const references = fields.references === undefined ? [mate.first, mate.second] : fields.references
  if (!Array.isArray(references) || references.length !== 2) throw new Error('Selecciona dos planos para la relación.')
  return { type: 'distance', name: fields.name, distance: Number(fields.distance), alignment: fields.alignment,
    suppressed: mate.suppressed, first: validateAssemblyPlaneReference(references[0]), second: validateAssemblyPlaneReference(references[1]) }
}
