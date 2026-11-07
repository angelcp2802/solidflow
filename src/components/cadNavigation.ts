import { MOUSE } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/** OrbitControls itself turns modified ROTATE into PAN (Shift, Ctrl or Meta). */
export function configureCadNavigation(controls: OrbitControls): void {
  controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.ROTATE, RIGHT: null }
  controls.enableZoom = true
  controls.screenSpacePanning = true
  // Direct CAD manipulation ends with the input; there is no inertial tail.
  controls.enableDamping = false
  controls.autoRotate = false
}

type Pointer = Pick<PointerEvent, 'pointerId' | 'button' | 'clientX' | 'clientY'>

/** A navigation/canceled/dragged gesture must never become a selection on release. */
export function createCadSelectionGesture() {
  let down: (Pointer & { context: unknown }) | null = null
  const cancel = () => { down = null }
  const move = (event: Pointer) => {
    if (down && (event.pointerId !== down.pointerId || Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 4)) cancel()
  }
  return {
    cancel,
    down(event: Pointer, context?: unknown) {
      down = event.button === 0 ? { pointerId: event.pointerId, button: event.button, clientX: event.clientX, clientY: event.clientY, context } : null
    },
    move,
    up(event: Pointer, context?: unknown): boolean {
      move(event)
      const select = down !== null && event.button === 0 && Object.is(down.context, context)
      cancel()
      return select
    },
  }
}
