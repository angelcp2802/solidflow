import { validateAssemblyGeometryReference, type AssemblyDefinitionReference, type AssemblyGeometryReference, type AssemblyMate } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'

export type AssemblyAngleMate = Extract<AssemblyMate, { type: 'angle' }>
export interface AssemblyAngleEditContext {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference & { mates: readonly AssemblyMate[] }
  session: number
}
export interface AssemblyAngleEditTicket {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference
  session: number
  mateId: string
  mateSignature: string
}

/** Retain declaration identity, not a worker token: Cancel may revoke a preview
 * without ending this editor. A document/session/scope change must end it. */
export function retainAssemblyAngleEdit(context: AssemblyAngleEditContext, mate: AssemblyAngleMate): AssemblyAngleEditTicket | null {
  const matches = context.scope.mates.filter(value => value.id === mate.id)
  if (matches.length !== 1 || matches[0].type !== 'angle' || JSON.stringify(matches[0]) !== JSON.stringify(mate)) return null
  return { documentSignature: context.documentSignature, scopePath: [...context.scopePath],
    scope: { id: context.scope.id, revision: context.scope.revision }, session: context.session,
    mateId: mate.id, mateSignature: JSON.stringify(mate) }
}

export function resolveAssemblyAngleEdit(ticket: AssemblyAngleEditTicket | null, context: AssemblyAngleEditContext): AssemblyAngleMate | null {
  if (!ticket || ticket.documentSignature !== context.documentSignature || ticket.session !== context.session
    || JSON.stringify(ticket.scopePath) !== JSON.stringify(context.scopePath)
    || ticket.scope.id !== context.scope.id || ticket.scope.revision !== context.scope.revision) return null
  const matches = context.scope.mates.filter(value => value.id === ticket.mateId)
  return matches.length === 1 && matches[0].type === 'angle' && JSON.stringify(matches[0]) === ticket.mateSignature ? matches[0] : null
}

export function assemblyAngleUiEdit(mate: AssemblyAngleMate, fields: { name: string; angle: string;
  references?: readonly [AssemblyGeometryReference | null, AssemblyGeometryReference | null] }): Extract<NewAssemblyMate, { type: 'angle' }> {
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  if (!fields.angle.trim() || !Number.isFinite(Number(fields.angle)) || Number(fields.angle) < 0 || Number(fields.angle) > 180)
    throw new Error('Escribe un ángulo finito entre 0° y 180°.')
  const references = fields.references === undefined ? [mate.first, mate.second] : fields.references
  if (!Array.isArray(references) || references.length !== 2) throw new Error('Selecciona dos referencias para el ángulo.')
  return { type: 'angle', name: fields.name, angle: Number(fields.angle),
    suppressed: mate.suppressed, first: validateAssemblyGeometryReference(references[0]), second: validateAssemblyGeometryReference(references[1]) }
}
