import { createCadSelectionGesture } from './cadNavigation'

type Pointer = Pick<PointerEvent, 'pointerId' | 'button' | 'clientX' | 'clientY'>
type ContextRequest = Pick<MouseEvent, 'button' | 'clientX' | 'clientY'>
type Point = { x: number; y: number }

/** Context intent can precede release; neither alone is a completed right click. */
export function createCadContextGesture() {
  const gesture = createCadSelectionGesture()
  let pending: { pointerId: number; frame: unknown; requested: boolean; released: Pointer | null } | null = null
  const cancel = () => { pending = null; gesture.cancel() }
  const complete = (): Point | null => {
    if (!pending?.requested || !pending.released) return null
    const { released, frame } = pending
    const valid = gesture.up(released, frame)
    cancel()
    return valid ? { x: released.clientX, y: released.clientY } : null
  }
  return {
    cancel,
    down(event: Pointer, frame?: unknown) {
      cancel()
      if (event.button !== 2) return
      pending = { pointerId: event.pointerId, frame, requested: false, released: null }
      gesture.down({ pointerId: event.pointerId, button: 0, clientX: event.clientX, clientY: event.clientY }, frame)
    },
    move: gesture.move,
    up(event: Pointer, frame?: unknown): Point | null {
      if (!pending || pending.released || event.button !== 2 || event.pointerId !== pending.pointerId || !Object.is(frame, pending.frame)) {
        cancel()
        return null
      }
      gesture.move(event)
      pending.released = { pointerId: event.pointerId, button: 0, clientX: event.clientX, clientY: event.clientY }
      return complete()
    },
    request(event: ContextRequest, frame?: unknown): Point | null {
      if (!pending || event.button !== 2 || !Object.is(frame, pending.frame)) {
        cancel()
        return null
      }
      gesture.move({ pointerId: pending.pointerId, button: event.button, clientX: event.clientX, clientY: event.clientY })
      pending.requested = true
      return complete()
    },
  }
}
