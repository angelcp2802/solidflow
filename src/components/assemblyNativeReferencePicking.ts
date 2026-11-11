import type { AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyScene } from '../cad/kernel.assembly-types'

/** UI ownership only, never a native reference, witness or Apply capability. */
export interface NativeReferencePickContext {
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
export function nativeReferencePickContextIsCurrent(ticket: NativeReferencePickContext, current: NativeReferencePickContext): boolean {
  return ticket.family === current.family
    && ticket.phase === current.phase && ticket.owner !== null && ticket.owner === current.owner
    && (ticket.phase === 'preview' ? ticket.preview !== null && !!ticket.token : ticket.preview === null && ticket.token === null && ticket.candidateSignature === null)
    && ticket.document === current.document && ticket.preview === current.preview
    && ticket.scene !== null && ticket.scene === current.scene && ticket.token === current.token
    && ticket.signature === current.signature && ticket.candidateSignature === current.candidateSignature
    && ticket.generation === current.generation && ticket.scope === current.scope && ticket.scopeDefinition === current.scopeDefinition
    && ticket.session === current.session
}
export interface NativeReferencePickLiveState {
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
export function liveNativeReferencePickContextIsCurrent(ticket: NativeReferencePickContext, live: NativeReferencePickLiveState): boolean {
  return live.mounted && live.eligible && ticket.phase === live.phase && ticket.owner === live.owner
    && ticket.document === live.document && ticket.preview === live.preview
    && ticket.scene === live.scene && ticket.signature === live.signature && ticket.candidateSignature === live.candidateSignature
    && ticket.token === live.token && ticket.generation === live.generation && ticket.scope === live.scope && ticket.session === live.session
}

/** A press belongs to one role ticket and scene, never a later keyboard owner. */
export interface NativeReferencePress { owner: object; scene: NativeReferencePickContext['scene']; mode: string | null; revision?: number; purpose?: string | null }
export function nativeReferencePressIsCurrent(press: NativeReferencePress, owner: object | null | undefined, scene: NativeReferencePickContext['scene'], mode: string | null, revision?: number, purpose?: string | null): boolean {
  return press.owner === owner && press.scene !== null && press.scene === scene && press.mode === mode && press.revision === revision && press.purpose === purpose
}

/** An unowned down cannot turn into an explicitly armed reference gesture. */
export function nativeReferencePressMatches(press: NativeReferencePress | null, owner: object | null | undefined, scene: NativeReferencePickContext['scene'], mode: string | null, revision?: number, purpose?: string | null): boolean {
  return press ? nativeReferencePressIsCurrent(press, owner, scene, mode, revision, purpose) : owner == null
}
