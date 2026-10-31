import type { HingeUiReferences, HingeUiSlot } from './AssemblyHingeMatePanel'
export interface HingeUiTicket { signature: string; scope: string; generation: number; sceneId: string | null; family: string; epoch: number; limited?: boolean }
export interface HingePickTicket extends HingeUiTicket { slot: HingeUiSlot; producer: 'face' | 'line-edge' }
export function hingeTicketIsCurrent(ticket: HingeUiTicket, current: HingeUiTicket): boolean {
  return ticket.family === 'hinge' && current.family === 'hinge' && ticket.signature === current.signature && ticket.scope === current.scope
    && ticket.generation === current.generation && ticket.sceneId !== null && ticket.sceneId === current.sceneId && ticket.epoch === current.epoch && !!ticket.limited === !!current.limited
}
export interface HingeLiveState { mounted: boolean; signature: string; generation: number; scope: string; sceneId: string | null; confirmedSignature: string | null; sceneSignature: string }
/** Mutable refs can advance before React renders a replacement callback. */
export function liveHingeTicketIsCurrent(ticket: HingeUiTicket, context: HingeUiTicket | null, live: HingeLiveState): boolean {
  return live.mounted && context !== null && hingeTicketIsCurrent(ticket, context)
    && ticket.signature === live.signature && ticket.generation === live.generation && ticket.scope === live.scope
    && ticket.sceneId === live.sceneId && live.confirmedSignature === ticket.signature && live.sceneSignature === ticket.signature
}
export function currentHingePick(ticket: HingePickTicket | null, current: HingeUiTicket, blocked: boolean): ticket is HingePickTicket {
  return !blocked && !!ticket && hingeTicketIsCurrent(ticket, current) && (current.limited?[0,1,2,3,4,5]:[0,1,2,3]).includes(ticket.slot)
    && (ticket.producer === 'face' || ticket.producer === 'line-edge' && ticket.slot < 2)
}
/** A late event belongs to the rendered intent, never to a newer chosen slot. */
export function renderedHingePick(expected: HingePickTicket | null, latest: HingePickTicket | null, current: HingeUiTicket, blocked: boolean): expected is HingePickTicket {
  return expected !== null && expected === latest && currentHingePick(expected, current, blocked)
}
export function nextHingePick(ticket: HingePickTicket, references: HingeUiReferences): HingePickTicket | null {
  const slot = Array.from({ length: references.length }, (_, i) => (ticket.slot + i + 1) % references.length).find(i => references[i] === null)
  return slot === undefined ? null : { ...ticket, slot: slot as HingeUiSlot, producer: slot < 2 ? ticket.producer : 'face' }
}
