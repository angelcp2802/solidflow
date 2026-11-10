import { nativeReferencePickContextIsCurrent, liveNativeReferencePickContextIsCurrent,
  type NativeReferencePickContext, type NativeReferencePickLiveState } from './assemblyNativeReferencePicking'

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
export interface MechanicalAxisContext extends NativeReferencePickContext {}
export interface MechanicalAxisPickTicket extends MechanicalAxisContext { slot: MechanicalAxisSlot }
export function mechanicalAxisContextIsCurrent(ticket: MechanicalAxisContext, current: MechanicalAxisContext): boolean {
  return (ticket.family === 'gear' || ticket.family === 'screw') && nativeReferencePickContextIsCurrent(ticket, current)
}
/** The expected callback must still own the exact currently armed role. */
export function currentMechanicalAxisPick(expected: MechanicalAxisPickTicket | null, latest: MechanicalAxisPickTicket | null,
  current: MechanicalAxisContext | null, blocked: boolean): expected is MechanicalAxisPickTicket {
  return !blocked && expected !== null && expected === latest && current !== null && (expected.slot === 0 || expected.slot === 1)
    && mechanicalAxisContextIsCurrent(expected, current)
}
export interface MechanicalAxisLiveState extends NativeReferencePickLiveState {}
/** Mutable owners can advance before a replacement React callback is committed. */
export function liveMechanicalAxisContextIsCurrent(ticket: MechanicalAxisContext, live: MechanicalAxisLiveState): boolean {
  return liveNativeReferencePickContextIsCurrent(ticket, live)
}
