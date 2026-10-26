import { describe, expect, it } from 'vitest'
import { OrthographicCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { configureCadNavigation, createCadSelectionGesture } from './cadNavigation'

// Actual installed OrbitControls with a minimal DOM event surface, no WebGL or native CAD.
class Surface extends EventTarget {
  style = { touchAction: '', cursor: '' }
  clientWidth = 400
  clientHeight = 400
  ownerDocument = new EventTarget()
  getRootNode() { return this.ownerDocument }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400 } }
}
function emit(target: EventTarget, type: string, values: object) {
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), values))
}
function fixture() {
  const surface = new Surface(), camera = new OrthographicCamera(-10, 10, 10, -10, .1, 1000)
  camera.position.set(20, -30, 20)
  const controls = new OrbitControls(camera, surface as unknown as HTMLElement)
  configureCadNavigation(controls)
  const position = camera.position.clone(), target = controls.target.clone(), direction = position.clone().sub(target).normalize()
  const drag = (button: number, modifiers = {}) => {
    const pointer = { pointerId: 1, pointerType: 'mouse', button, clientX: 100, clientY: 100, ctrlKey: false, metaKey: false, shiftKey: false, ...modifiers }
    emit(surface, 'pointerdown', pointer)
    emit(surface.ownerDocument, 'pointermove', { ...pointer, clientX: 150, clientY: 120 })
    emit(surface.ownerDocument, 'pointerup', { ...pointer, clientX: 150, clientY: 120 })
  }
  return { surface, camera, controls, position, target, direction, drag }
}
describe('CAD camera controls', () => {
  it('disables inertial and automatic movement even when reconfiguring existing controls', () => {
    const f = fixture()
    try {
      f.controls.enableDamping = true; f.controls.autoRotate = true
      configureCadNavigation(f.controls)
      expect(f.controls.enableDamping).toBe(false); expect(f.controls.autoRotate).toBe(false)
    } finally { f.controls.dispose() }
  })
  it.each([{}, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }])('keeps left drag out of camera navigation: %j', modifiers => {
    const f = fixture()
    try { f.drag(0, modifiers); expect(f.camera.position.distanceTo(f.position)).toBeLessThan(1e-12); expect(f.controls.target.equals(f.target)).toBe(true); expect(f.camera.zoom).toBe(1) }
    finally { f.controls.dispose() }
  })
  it('orbits with the middle button without changing target or zoom', () => {
    const f = fixture()
    try { f.drag(1); expect(f.camera.position.distanceTo(f.position)).toBeGreaterThan(1); expect(f.controls.target.equals(f.target)).toBe(true); expect(f.camera.zoom).toBe(1); expect(f.camera.position.distanceTo(f.target)).toBeCloseTo(f.position.distanceTo(f.target), 10) }
    finally { f.controls.dispose() }
  })
  it.each([{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }])('pans with modified middle button without orbiting: %j', modifiers => {
    const f = fixture()
    try {
      f.drag(1, modifiers)
      expect(f.controls.target.distanceTo(f.target)).toBeGreaterThan(1)
      expect(f.camera.position.clone().sub(f.controls.target).normalize().distanceTo(f.direction)).toBeLessThan(1e-12)
      expect(f.camera.zoom).toBe(1)
    } finally { f.controls.dispose() }
  })
  it('zooms in and out with the wheel while keeping the view direction', () => {
    const f = fixture()
    try {
      emit(f.surface, 'wheel', { deltaY: -100, deltaMode: 0, clientX: 200, clientY: 200, ctrlKey: false })
      expect(f.camera.zoom).toBeGreaterThan(1)
      emit(f.surface, 'wheel', { deltaY: 100, deltaMode: 0, clientX: 200, clientY: 200, ctrlKey: false })
      expect(f.camera.zoom).toBeCloseTo(1, 12)
      expect(f.camera.position.clone().sub(f.controls.target).normalize().distanceTo(f.direction)).toBeLessThan(1e-12)
    } finally { f.controls.dispose() }
  })
})
describe('CAD selection gesture', () => {
  const pointer = { pointerId: 1, button: 0, clientX: 100, clientY: 100 }
  it('selects only a matching left click, once, within four pixels', () => {
    const gesture = createCadSelectionGesture()
    expect(gesture.up(pointer)).toBe(false)
    gesture.down(pointer); expect(gesture.up({ ...pointer, clientX: 104 })).toBe(true)
    expect(gesture.up(pointer)).toBe(false)
    gesture.down(pointer); expect(gesture.up({ ...pointer, pointerId: 2 })).toBe(false)
  })
  it('rejects navigation, canceled gestures, and a drag returning to its starting point', () => {
    const gesture = createCadSelectionGesture()
    for (const button of [1, 2]) { gesture.down({ ...pointer, button }); expect(gesture.up({ ...pointer, button })).toBe(false) }
    gesture.down(pointer); gesture.cancel(); expect(gesture.up(pointer)).toBe(false)
    gesture.down(pointer); gesture.move({ ...pointer, clientX: 110 }); expect(gesture.up(pointer)).toBe(false)
    gesture.down(pointer); gesture.down({ ...pointer, button: 1 }); expect(gesture.up(pointer)).toBe(false)
  })
})
