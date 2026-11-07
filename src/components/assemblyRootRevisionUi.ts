import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { createAssemblyRootRevision } from '../model/assemblyRevisions'
import type { AssemblyPreviewReply } from '../cad/kernel.assembly-types'

export interface AssemblyRootRevisionTicket { signature: string; generation: number; revision: string }
/** Display/request binding only. The worker owns the proposal and Apply capability. */
export function assemblyRootRevisionTicket(document: AssemblyDocument, generation: number, revision: string): AssemblyRootRevisionTicket {
  createAssemblyRootRevision(document, revision)
  return { signature: serializeAssemblyDocument(document), generation, revision }
}
export function assemblyRootRevisionTicketIsCurrent(ticket: AssemblyRootRevisionTicket, document: AssemblyDocument, generation: number, mounted: boolean): boolean {
  return mounted && ticket.generation === generation && ticket.signature === serializeAssemblyDocument(document)
}
export function assemblyRootRevisionReplyMatches(reply: AssemblyPreviewReply, ticket: AssemblyRootRevisionTicket, document: AssemblyDocument): boolean {
  try {
    if (reply.status !== 'ready' || ticket.signature !== serializeAssemblyDocument(document)) return false
    const actual = validateAssemblyDocument(reply.document), expected = createAssemblyRootRevision(document, ticket.revision)
    if (Date.parse(actual.updatedAt) <= Date.parse(document.updatedAt)) return false
    // Modification time is assigned when the worker constructs its private proposal.
    expected.updatedAt = actual.updatedAt
    return serializeAssemblyDocument(expected) === serializeAssemblyDocument(actual)
  } catch { return false }
}
