import type { AssemblyDefinitionReference, AssemblyMate } from '../model/assemblyDocument'

export type AssemblyDirectionMate = Extract<AssemblyMate, { type: 'parallel' | 'perpendicular' }>
export interface AssemblyDirectionEditContext {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference & { mates: readonly AssemblyMate[] }
  session: number
}
export interface AssemblyDirectionEditTicket {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference
  session: number
  mateId: string
  mateType: AssemblyDirectionMate['type']
  mateSignature: string
}

/** Retain the saved declaration, not a preview token or the draft's family.
 * Preview Cancel keeps this identity; a document/scope/session change revokes it. */
export function retainAssemblyDirectionEdit(context: AssemblyDirectionEditContext, mate: AssemblyDirectionMate): AssemblyDirectionEditTicket | null {
  const matches = context.scope.mates.filter(value => value.id === mate.id)
  if ((mate.type !== 'parallel' && mate.type !== 'perpendicular') || matches.length !== 1
    || matches[0].type !== mate.type || JSON.stringify(matches[0]) !== JSON.stringify(mate)) return null
  return { documentSignature: context.documentSignature, scopePath: [...context.scopePath],
    scope: { id: context.scope.id, revision: context.scope.revision }, session: context.session,
    mateId: mate.id, mateType: mate.type, mateSignature: JSON.stringify(mate) }
}

export function resolveAssemblyDirectionEdit(ticket: AssemblyDirectionEditTicket | null, context: AssemblyDirectionEditContext): AssemblyDirectionMate | null {
  if (!ticket || ticket.documentSignature !== context.documentSignature || ticket.session !== context.session
    || JSON.stringify(ticket.scopePath) !== JSON.stringify(context.scopePath)
    || ticket.scope.id !== context.scope.id || ticket.scope.revision !== context.scope.revision) return null
  const matches = context.scope.mates.filter(value => value.id === ticket.mateId), mate = matches[0]
  return matches.length === 1 && (mate.type === 'parallel' || mate.type === 'perpendicular')
    && mate.type === ticket.mateType && JSON.stringify(mate) === ticket.mateSignature ? mate : null
}
