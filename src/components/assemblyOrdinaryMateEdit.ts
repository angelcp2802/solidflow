import type { AssemblyDefinitionReference, AssemblyMate } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'

export type AssemblyOrdinaryMate = Extract<AssemblyMate, { type: 'coincident' | 'concentric' }>
export interface OrdinaryMateEditContext {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference & { mates: readonly AssemblyMate[] }
  session: number
}
export interface OrdinaryMateEditTicket {
  documentSignature: string
  scopePath: readonly string[]
  scope: AssemblyDefinitionReference
  session: number
  mateId: string
  mateType: AssemblyOrdinaryMate['type']
  mateSignature: string
}

/** Declaration authority survives preview Cancel, but never document/scope/session replacement. */
export function retainOrdinaryMateEdit(context: OrdinaryMateEditContext, mate: AssemblyOrdinaryMate): OrdinaryMateEditTicket | null {
  const matches = context.scope.mates.filter(value => value.id === mate.id)
  if ((mate.type !== 'coincident' && mate.type !== 'concentric') || matches.length !== 1
    || matches[0].type !== mate.type || JSON.stringify(matches[0]) !== JSON.stringify(mate)) return null
  return { documentSignature: context.documentSignature, scopePath: [...context.scopePath],
    scope: { id: context.scope.id, revision: context.scope.revision }, session: context.session,
    mateId: mate.id, mateType: mate.type, mateSignature: JSON.stringify(mate) }
}

export function resolveOrdinaryMateEdit(ticket: OrdinaryMateEditTicket | null, context: OrdinaryMateEditContext): AssemblyOrdinaryMate | null {
  if (!ticket || ticket.documentSignature !== context.documentSignature || ticket.session !== context.session
    || JSON.stringify(ticket.scopePath) !== JSON.stringify(context.scopePath)
    || ticket.scope.id !== context.scope.id || ticket.scope.revision !== context.scope.revision) return null
  const matches = context.scope.mates.filter(value => value.id === ticket.mateId), mate = matches[0]
  return matches.length === 1 && (mate.type === 'coincident' || mate.type === 'concentric')
    && mate.type === ticket.mateType && JSON.stringify(mate) === ticket.mateSignature ? mate : null
}

export function assemblyOrdinaryMateUiEdit(mate: AssemblyOrdinaryMate,
  fields: { name: string; alignment: 'aligned' | 'opposed'; releaseRotation: boolean }): NewAssemblyMate | null {
  if (!fields.name.trim() || fields.name.length > 200 || (fields.alignment !== 'aligned' && fields.alignment !== 'opposed')
    || typeof fields.releaseRotation !== 'boolean') return null
  if (fields.releaseRotation && (mate.type !== 'concentric' || mate.rotationLock === null)) return null
  const common = { name: fields.name, alignment: fields.alignment, suppressed: mate.suppressed }
  // Never recapture or normalize a saved lock when merely editing name/orientation.
  if (mate.type === 'concentric') return { ...common, type: 'concentric',
    first: structuredClone(mate.first), second: structuredClone(mate.second),
    rotationLock: fields.releaseRotation ? null : structuredClone(mate.rotationLock) }
  return { ...common, type: 'coincident', first: structuredClone(mate.first), second: structuredClone(mate.second) }
}
