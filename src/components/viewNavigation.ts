import { OrthographicCamera, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export const standardViews = [
  { name: 'front', label: 'Frontal', shortcut: 'Ctrl+1', direction: [0, 0, 1], up: [0, 1, 0] },
  { name: 'back', label: 'Posterior', shortcut: 'Ctrl+2', direction: [0, 0, -1], up: [0, 1, 0] },
  { name: 'left', label: 'Izquierda', shortcut: 'Ctrl+3', direction: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'right', label: 'Derecha', shortcut: 'Ctrl+4', direction: [1, 0, 0], up: [0, 1, 0] },
  { name: 'top', label: 'Superior', shortcut: 'Ctrl+5', direction: [0, 1, 0], up: [0, 0, -1] },
  { name: 'bottom', label: 'Inferior', shortcut: 'Ctrl+6', direction: [0, -1, 0], up: [0, 0, 1] },
  { name: 'iso', label: 'Isométrica', shortcut: 'Ctrl+7', direction: [1, 1, 1], up: [0, 1, 0] },
] as const
export type ViewName = typeof standardViews[number]['name'] | 'fit' | 'previous'
type ViewKey = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'defaultPrevented'>
export function viewShortcutCommand(event: ViewKey, editable: boolean): ViewName | null {
  if (editable || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey && event.metaKey) return null
  const key = event.key.toLowerCase(), modified = event.ctrlKey || event.metaKey
  if (modified && event.shiftKey && key === 'z') return 'previous'
  if (event.shiftKey) return null
  if (modified) return standardViews.find(view => view.shortcut === 'Ctrl+' + key)?.name ?? null
  return key === 'f' ? 'fit' : null
}
export interface ViewRequest { name: ViewName; stamp: number }
type Triple = [number, number, number]
export interface CameraView {
  position: Triple; target: Triple; up: Triple
  top: number; bottom: number; zoom: number; near: number; far: number
}
const copy = (value: CameraView): CameraView => ({ ...value, position: [...value.position], target: [...value.target], up: [...value.up] })
const equal = (a: CameraView, b: CameraView) => {
  // Translation precision follows the visible scale, not distance from the
  // world origin: a small scene-space pan can be large on screen at high zoom.
  const tolerance = 1e-10 * Math.min(Math.abs(a.top - a.bottom) / a.zoom, Math.abs(b.top - b.bottom) / b.zoom)
  const coordinates = (v: CameraView) => [...v.position, ...v.target]
  if (!coordinates(a).every((value, index) => {
    const other = coordinates(b)[index]
    // A few arithmetic round trips at a translated origin can move one ULP
    // even for zero input. Keep that rounding floor distinct from view scale.
    const roundoff = 8 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(other))
    return Math.abs(value - other) <= Math.max(tolerance, roundoff)
  })) return false
  const values = (v: CameraView) => [...v.up, v.top, v.bottom, v.zoom, v.near, v.far]
  return values(a).every((value, index) => Math.abs(value - values(b)[index]) <= 1e-10 * Math.max(1, Math.abs(value), Math.abs(values(b)[index])))
}

/** Presentation-only session state. Never serialized or committed to document Undo. */
export function createViewHistory() {
  let current: CameraView | null = null, previous: CameraView[] = [], request: ViewRequest | null = null, attached = false, gesturing = false, revision = 0
  const listeners = new Set<() => void>()
  const publish = () => { revision++; listeners.forEach(listener => listener()) }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    snapshot: () => revision,
    get canPrevious() { return attached && !gesturing && previous.length > 0 },
    get current() { return current && copy(current) },
    get navigating() { return gesturing },
    get depth() { return previous.length },
    remember(value: CameraView) { current = copy(value) },
    record(before: CameraView, after: CameraView) {
      current = copy(after)
      if (equal(before, after)) return
      previous.push(copy(before)); if (previous.length > 10) previous.shift()
      publish()
    },
    previous() { const value = previous.pop(); if (!value) return null; current = copy(value); publish(); return copy(value) },
    gesture(value: boolean) { if (gesturing !== value) { gesturing = value; publish() } },
    attach(value: boolean) { attached = value; publish() },
    consume(next: ViewRequest) { const first = request === null, changed = next !== request; request = next; return { first, changed } },
    reset() { current = null; previous = []; request = null; gesturing = false; publish() },
  }
}
export type ViewHistory = ReturnType<typeof createViewHistory>

export function captureCameraView(camera: OrthographicCamera, controls: Pick<OrbitControls, 'target'>): CameraView {
  return { position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(),
    top: camera.top, bottom: camera.bottom, zoom: camera.zoom, near: camera.near, far: camera.far }
}

/** One entry per effective controls gesture (including each wheel event), not per animation frame. */
export function bindViewNavigation(history: ViewHistory, camera: OrthographicCamera, initialControls: OrbitControls, fit: () => void, aspect: () => number, replaceControls: () => OrbitControls) {
  let controls = initialControls
  let suspended = false, baseline: CameraView | null = null, restoring = history.current, anchored: CameraView | null = null
  const read = () => captureCameraView(camera, controls)
  const quiet = (action: () => void) => { const previous = suspended; suspended = true; try { action() } finally { suspended = previous } }
  const drain = () => { const damping = controls.enableDamping; controls.enableDamping = false; controls.update(); controls.enableDamping = damping }
  const install = (value: CameraView) => {
    camera.position.fromArray(value.position); controls.target.fromArray(value.target); camera.up.fromArray(value.up)
    camera.top = value.top; camera.bottom = value.bottom; camera.left = -value.top * aspect(); camera.right = -camera.left
    camera.zoom = value.zoom; camera.near = value.near; camera.far = value.far; camera.updateProjectionMatrix()
    camera.lookAt(controls.target); camera.updateMatrixWorld()
  }
  const recreateControls = () => {
    controls.removeEventListener('start', start); controls.removeEventListener('change', change); controls.removeEventListener('end', end)
    // OrbitControls captures its up basis in the constructor. Recreate through
    // the public API rather than writing its private spherical transform.
    controls = replaceControls()
    controls.addEventListener('start', start); controls.addEventListener('change', change); controls.addEventListener('end', end)
  }
  const changeUp = (up: readonly number[]) => {
    if (camera.up.x === up[0] && camera.up.y === up[1] && camera.up.z === up[2]) return
    camera.up.set(up[0], up[1], up[2]); recreateControls()
  }
  const restore = (value: CameraView) => quiet(() => {
    // Clear residual OrbitControls rotation/pan before installing the saved pose.
    drain(); changeUp(value.up); install(value); anchored = read(); history.remember(anchored)
  })
  const start = () => { if (!suspended) { if (anchored) install(anchored); baseline = read(); anchored = null; history.gesture(true) } }
  const change = () => {
    if (suspended || restoring || anchored) return
    const after = read()
    if (baseline && !equal(baseline, after)) { history.record(baseline, after); baseline = null }
    else history.remember(after)
  }
  const finishedInput = () => {
    const after = read(), before = baseline
    baseline = null
    // Controls suppress change events for small scene-space displacements.
    // At high zoom those can still be visible, so finalize from the actual pose.
    if (!before) return after
    if (equal(before, after)) return before
    history.record(before, after)
    return after
  }
  const end = () => {
    if (suspended) return
    // Empty gestures retain the exact starting pose. Effective gestures keep
    // their last input pose, before subsequent frames or commands can drift.
    anchored = finishedInput(); install(anchored); history.remember(anchored)
    history.gesture(false)
  }
  controls.addEventListener('start', start); controls.addEventListener('change', change); controls.addEventListener('end', end)
  history.attach(true)
  return {
    cancelGesture() {
      if (!history.navigating) return
      const value = finishedInput()
      quiet(() => { recreateControls(); install(value) })
      baseline = null; anchored = read(); history.remember(anchored); history.gesture(false)
    },
    automatic(action: () => void) {
      const direction = anchored && new Vector3().fromArray(anchored.position).sub(new Vector3().fromArray(anchored.target)).normalize()
      quiet(action)
      if (direction) { const distance = camera.position.distanceTo(controls.target); camera.position.copy(controls.target).addScaledVector(direction, distance); camera.lookAt(controls.target); anchored = read() }
      if (!restoring) history.remember(read())
    },
    // Preserve exact named, restored and completed-input poses before rendering;
    // controls may otherwise round-trip coordinates or clamp a polar view.
    afterUpdate() { if (anchored) install(anchored) },
    request(value: ViewRequest) {
      if (history.navigating) return
      const consumed = history.consume(value)
      if (restoring) { restore(restoring); restoring = null; if (!consumed.changed) return }
      if (!consumed.changed) return
      baseline = null
      if (value.name === 'previous') { const previous = history.previous(); if (previous) restore(previous); return }
      const before = read()
      quiet(() => {
        drain()
        let direction = new Vector3().fromArray(before.position).sub(new Vector3().fromArray(before.target)).normalize()
        if (value.name !== 'fit') {
          const view = standardViews.find(view => view.name === value.name)!
          direction = new Vector3(...view.direction).normalize()
          changeUp(view.up)
        }
        camera.position.copy(controls.target).addScaledVector(direction, 400)
        fit()
        const distance = camera.position.distanceTo(controls.target)
        camera.position.copy(controls.target).addScaledVector(direction, distance)
        camera.lookAt(controls.target); camera.updateMatrixWorld(); anchored = read()
      })
      if (consumed.first) history.remember(read()); else history.record(before, read())
    },
    dispose() {
      if (anchored) install(anchored)
      if (!restoring) history.remember(read())
      controls.removeEventListener('start', start); controls.removeEventListener('change', change); controls.removeEventListener('end', end)
      history.gesture(false); history.attach(false)
    },
  }
}
