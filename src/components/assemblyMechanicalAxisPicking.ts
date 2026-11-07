import type { AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyScene } from '../cad/kernel.assembly-types'

export type MechanicalAxisSlot = 0 | 1
export type MechanicalAxisFamily = 'gear' | 'screw'
export interface MechanicalAxisControls {
  enabled: boolean
  keys: readonly [string, string]
  slot: MechanicalAxisSlot | null
  onChoice: (slot: MechanicalAxisSlot, key: string) => void
  onPick: (slot: MechanicalAxisSlot) => void
  onCancel: () => void
}
/** UI ownership only, never a native reference, witness or Apply capability. */
export interface MechanicalAxisContext {
  phase: 'committed' | 'preview'
  owner: object | null
  document: AssemblyDocument
  preview: object | null
  scene: AssemblyScene | null
  signature: string
  candidateSignature: string | null
  token: string | null
  generation: number
  scope: string
  scopeDefinition: string
  family: string
  session: object
}
export interface MechanicalAxisPickTicket extends MechanicalAxisContext { slot: MechanicalAxisSlot }
export function mechanicalAxisContextIsCurrent(ticket: MechanicalAxisContext, current: MechanicalAxisContext): boolean {
  return (ticket.family === 'gear' || ticket.family === 'screw') && ticket.family === current.family
    && ticket.phase === current.phase && ticket.owner !== null && ticket.owner === current.owner
    && (ticket.phase === 'preview' ? ticket.preview !== null && !!ticket.token : ticket.preview === null && ticket.token === null && ticket.candidateSignature === null)
    && ticket.document === current.document && ticket.preview === current.preview
    && ticket.scene !== null && ticket.scene === current.scene && ticket.token === current.token
    && ticket.signature === current.signature && ticket.candidateSignature === current.candidateSignature
    && ticket.generation === current.generation && ticket.scope === current.scope && ticket.scopeDefinition === current.scopeDefinition
    && ticket.session === current.session
}
/** The expected callback must still own the exact currently armed role. */
export function currentMechanicalAxisPick(expected: MechanicalAxisPickTicket | null, latest: MechanicalAxisPickTicket | null,
  current: MechanicalAxisContext | null, blocked: boolean): expected is MechanicalAxisPickTicket {
  return !blocked && expected !== null && expected === latest && current !== null && (expected.slot === 0 || expected.slot === 1)
    && mechanicalAxisContextIsCurrent(expected, current)
}
export interface MechanicalAxisLiveState {
  phase: 'committed' | 'preview'
  owner: object | null
  mounted: boolean
  document: AssemblyDocument
  preview: object | null
  scene: AssemblyScene | null
  signature: string
  candidateSignature: string | null
  token: string | null
  generation: number
  scope: string
  session: object
  eligible: boolean
}
/** Mutable owners can advance before a replacement React callback is committed. */
export function liveMechanicalAxisContextIsCurrent(ticket: MechanicalAxisContext, live: MechanicalAxisLiveState): boolean {
  return live.mounted && live.eligible && ticket.phase === live.phase && ticket.owner === live.owner
    && ticket.document === live.document && ticket.preview === live.preview
    && ticket.scene === live.scene && ticket.signature === live.signature && ticket.candidateSignature === live.candidateSignature
    && ticket.token === live.token && ticket.generation === live.generation && ticket.scope === live.scope && ticket.session === live.session
}
