import { describe, expect, it } from 'vitest'
import { OrthographicCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { configureCadNavigation } from './cadNavigation'
import { bindViewNavigation, captureCameraView, createViewHistory, standardViews, viewShortcutCommand, type ViewHistory, type ViewName, type ViewRequest } from './viewNavigation'

// Real installed controls; only the DOM surface is synthetic. No renderer or CAD.
class Surface extends EventTarget {
  style = { touchAction: '', cursor: '' }
  clientWidth = 400; clientHeight = 400
  ownerDocument = new EventTarget()
  getRootNode() { return this.ownerDocument }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400 } }
}
const emit = (target: EventTarget, type: string, values: object) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), values))
function fixture(history: ViewHistory = createViewHistory(), initial: ViewRequest = { name: 'iso', stamp: 0 }, center: [number, number, number] = [3, 4, 5]) {
  const surface = new Surface(), camera = new OrthographicCamera(-10, 10, 10, -10, .1, 1000)
  camera.position.set(30, 30, 30)
  let controls: OrbitControls, aspect = 1, stamp = initial.stamp
  const makeControls = () => {
    const position = camera.position.clone(), target = controls?.target.clone() ?? new Vector3()
    controls?.dispose()
    controls = new OrbitControls(camera, surface as unknown as HTMLElement)
    configureCadNavigation(controls)
    controls.target.copy(target); camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld()
    return controls
  }
  makeControls()
  const fit = () => {
    const direction = camera.position.clone().sub(controls.target).normalize()
    controls.target.fromArray(center); camera.position.copy(controls.target).addScaledVector(direction, 60)
    camera.top = 12; camera.bottom = -12; camera.left = -12 * aspect; camera.right = 12 * aspect
    camera.near = .01; camera.far = 1000; camera.zoom = 1; camera.updateProjectionMatrix(); controls.update()
  }
  const navigation = bindViewNavigation(history, camera, controls!, fit, () => aspect, makeControls)
  navigation.request(initial)
  const update = (count = 300) => { for (let i = 0; i < count; i++) { navigation.afterUpdate(); camera.updateMatrixWorld() } }
  const forcedUpdate = (count: number) => { for (let i = 0; i < count; i++) { controls.update(); navigation.afterUpdate(); camera.updateMatrixWorld() } }
  const pointer = { pointerId: 1, pointerType: 'mouse', button: 1, clientX: 100, clientY: 100, ctrlKey: false, metaKey: false, shiftKey: false }
  const begin = (shiftKey = false) => emit(surface, 'pointerdown', { ...pointer, shiftKey })
  const move = (x: number, y: number, shiftKey = false) => emit(surface.ownerDocument, 'pointermove', { ...pointer, clientX: x, clientY: y, shiftKey })
  const end = () => emit(surface.ownerDocument, 'pointerup', pointer)
  const drag = (shiftKey = false) => { begin(shiftKey); move(150, 100, shiftKey); move(180, 115, shiftKey); end(); update() }
  return { camera, surface, history, initial, navigation, begin, move, end, drag, update, forcedUpdate,
    controls: () => controls,
    setZoom(value: number) { navigation.automatic(() => { camera.zoom = value; camera.updateProjectionMatrix() }) },
    read: () => captureCameraView(camera, controls),
    direction: () => camera.position.clone().sub(controls.target).normalize(),
    request(name: ViewName) { const request = { name, stamp: ++stamp }; navigation.request(request); update(); return request },
    wheel(deltaY = -100) { emit(surface, 'wheel', { deltaY, deltaMode: 0, clientX: 200, clientY: 200, ctrlKey: false }); update() },
    resize(value: number) { aspect = value; camera.left = -camera.top * value; camera.right = -camera.left; camera.updateProjectionMatrix(); update() },
    dispose() { navigation.dispose(); controls.dispose() },
  }
}

describe('camera view commands and session history', () => {
  it.each([
    ['front', [0, 0, 1], [0, 1, 0]], ['back', [0, 0, -1], [0, 1, 0]],
    ['left', [-1, 0, 0], [0, 1, 0]], ['right', [1, 0, 0], [0, 1, 0]],
    ['top', [0, 1, 0], [0, 0, -1]], ['bottom', [0, -1, 0], [0, 0, 1]],
  ] as const)('keeps the exact %s direction and screen up after updates', (name, direction, up) => {
    const f = fixture()
    try { f.request(name); expect(f.direction().distanceTo(new Vector3(...direction))).toBeLessThan(1e-12); expect(f.camera.up.toArray()).toEqual(up) }
    finally { f.dispose() }
  })
  it('projects three unit axes with equal isometric foreshortening', () => {
    const f = fixture()
    try {
      const origin = new Vector3(3, 4, 5).project(f.camera)
      const lengths = [new Vector3(4, 4, 5), new Vector3(3, 5, 5), new Vector3(3, 4, 6)].map(point => {
        point.project(f.camera); return Math.hypot(point.x - origin.x, point.y - origin.y)
      })
      expect(lengths[0]).toBeGreaterThan(0)
      expect(lengths[1]).toBeCloseTo(lengths[0], 12); expect(lengths[2]).toBeCloseTo(lengths[0], 12)
    } finally { f.dispose() }
  })
  it('does not record repeated views, consumes previous without redo, and bounds history to ten', () => {
    const f = fixture()
    try {
      f.request('iso'); expect(f.history.depth).toBe(0)
      const iso = f.read(); f.request('front'); const front = f.read(); f.request('top')
      f.request('previous'); expect(f.read()).toEqual(front)
      f.request('previous'); expect(f.read()).toEqual(iso); expect(f.history.canPrevious).toBe(false)
      for (let i = 0; i < 14; i++) f.request(i % 2 ? 'top' : 'front')
      expect(f.history.depth).toBe(10)
      for (let i = 0; i < 10; i++) f.request('previous')
      expect(f.history.canPrevious).toBe(false)
    } finally { f.dispose() }
  })
  it.each(['top', 'bottom'] as const)('uses the %s up basis for real horizontal middle orbit and pan', name => {
    const f = fixture()
    try {
      f.request(name); const before = f.read(), direction = f.direction()
      f.begin(); expect(f.history.canPrevious).toBe(false); f.move(150, 100)
      expect(f.direction().distanceTo(direction)).toBeGreaterThan(.05)
      f.end(); f.update(); expect(f.history.depth).toBe(2)
      f.request('previous'); expect(f.read()).toEqual(before)
      f.drag(true); expect(f.direction().distanceTo(direction)).toBeLessThan(1e-12)
      expect(new Vector3(...f.read().target).distanceTo(new Vector3(...before.target))).toBeGreaterThan(1)
      f.request('previous'); expect(f.read()).toEqual(before)
      f.wheel(); expect(f.camera.zoom).toBeGreaterThan(1); expect(f.direction().distanceTo(direction)).toBeLessThan(1e-12)
      f.request('previous'); expect(f.read()).toEqual(before)
    } finally { f.dispose() }
  })
  it.each(['orbit', 'pan', 'wheel'] as const)('records one %s gesture and restores target, zoom, orientation and crop across a preset', gesture => {
    const f = fixture()
    try {
      const initial = f.read()
      if (gesture === 'wheel') f.wheel(); else f.drag(gesture === 'pan')
      expect(f.history.depth).toBe(1)
      const moved = f.read(); expect(moved).not.toEqual(initial)
      f.request('front'); f.request('previous'); expect(f.read()).toEqual(moved)
      f.request('previous'); expect(f.read()).toEqual(initial)
    } finally { f.dispose() }
  })
  it.each(['orbit', 'pan', 'wheel'] as const)('ends %s at its last input pose and stays exact across later frames and controls updates', gesture => {
    const f = fixture()
    const state = () => {
      f.camera.updateMatrixWorld()
      return { view: f.read(), quaternion: f.camera.quaternion.toArray(), world: [...f.camera.matrixWorld.elements], projection: [...f.camera.projectionMatrix.elements] }
    }
    try {
      const initial = state()
      if (gesture === 'wheel') f.wheel()
      else {
        f.begin(gesture === 'pan')
        for (let step = 1; step <= 6; step++) f.move(100 + step * 10, 100 + step * 4, gesture === 'pan')
        const lastInput = state()
        f.end()
        expect(state()).toEqual(lastInput) // No accumulated motion is applied on release.
      }
      const released = state()
      expect(released).not.toEqual(initial); expect(f.history.depth).toBe(1)
      expect(f.history.navigating).toBe(false)
      for (const count of [1, 6, 30, 300, 10000]) {
        f.update(count); expect(state()).toEqual(released)
        f.forcedUpdate(count); expect(state()).toEqual(released)
      }
      f.request('front'); f.request('previous'); expect(state()).toEqual(released)
      f.request('previous'); expect(state()).toEqual(initial)
    } finally { f.dispose() }
  })
  it.each(['orbit', 'pan'] as const)('gives the same %s result with zero or many rendered frames between pointer movements', gesture => {
    const immediate = fixture(), framed = fixture()
    try {
      for (const f of [immediate, framed]) {
        f.begin(gesture === 'pan')
        for (let step = 1; step <= 6; step++) {
          f.move(100 + step * 10, 100 + step * 4, gesture === 'pan')
          if (f === framed) f.update(step * 17)
        }
        f.end(); f.update()
      }
      expect(framed.read()).toEqual(immediate.read())
      expect(framed.camera.matrixWorld.elements).toEqual(immediate.camera.matrixWorld.elements)
      expect(framed.history.depth).toBe(1)
    } finally { immediate.dispose(); framed.dispose() }
  })
  it.each([
    ['release', [3, 4, 5]], ['cancel', [3, 4, 5]],
    ['release', [1000000, 1000000, 1000000]], ['cancel', [1000000, 1000000, 1000000]],
  ] as const)('retains a visible high-zoom pan below the controls change-event threshold on %s at %j', (completion, center) => {
    const f = fixture(undefined, undefined, [...center])
    try {
      f.setZoom(100000); f.update()
      const before = f.read(), point = new Vector3(...center).project(f.camera)
      let changes = 0
      f.controls().addEventListener('change', () => { changes++ })
      f.begin(true); f.move(110, 100, true); f.update()
      const lastInput = f.read(), projected = new Vector3(...center).project(f.camera)
      // 0.002 CSS px allows arithmetic cancellation at the translated origin;
      // the captured complete pose still has to survive release exactly.
      expect(Math.abs(Math.abs(projected.x - point.x) - 2 * 10 / 400)).toBeLessThan(1e-5)
      expect(changes).toBe(0); expect(f.history.depth).toBe(0)
      if (completion === 'release') f.end(); else f.navigation.cancelGesture()
      expect(f.read()).toEqual(lastInput); expect(f.history.depth).toBe(1)
      f.forcedUpdate(1000); expect(f.read()).toEqual(lastInput)
      f.request('previous'); expect(f.read()).toEqual(before)
      f.begin(true); f.move(100, 100, true); f.end(); f.update()
      expect(f.read()).toEqual(before); expect(f.history.depth).toBe(0)
    } finally { f.dispose() }
  })
  it.each(['iso', 'top', 'bottom'] as const)('keeps empty input and held frames out of %s history and preserves direct navigation after recreation', name => {
    const f = fixture()
    try {
      f.request(name); const before = f.read(), depth = f.history.depth
      expect(f.controls().enableDamping).toBe(false); expect(f.controls().autoRotate).toBe(false)
      f.begin(); f.update(700); f.move(100, 100); f.update(20); f.end(); f.forcedUpdate(300)
      expect(f.read()).toEqual(before); expect(f.history.depth).toBe(depth)
      f.wheel(0); expect(f.read()).toEqual(before); expect(f.history.depth).toBe(depth)
      f.begin(); f.update(); f.move(100, 100); f.navigation.cancelGesture(); f.update()
      expect(f.read()).toEqual(before); expect(f.history.depth).toBe(depth)
      expect(f.controls().enableDamping).toBe(false); expect(f.controls().autoRotate).toBe(false)
      f.drag(); expect(f.history.depth).toBe(depth + 1)
      f.request('previous'); expect(f.read()).toEqual(before)
    } finally { f.dispose() }
  })
  it('restores zoom after Fit, ignores empty clicks, and keeps resize out of history', () => {
    const f = fixture()
    try {
      f.begin(); f.end(); f.update(); expect(f.history.depth).toBe(0)
      f.wheel(); const zoomed = f.read(); f.request('fit'); expect(f.camera.zoom).toBe(1)
      f.request('previous'); expect(f.read()).toEqual(zoomed)
      const depth = f.history.depth; f.resize(2); expect(f.history.depth).toBe(depth)
      expect(f.camera.right / f.camera.top).toBe(2)
    } finally { f.dispose() }
  })
  it('recomputes Fit after wheel with the same geometric framing, without requiring floating-point identity', () => {
    const f = fixture()
    try {
      const points = [[3, 4, 5], [4, 4, 5], [3, 6, 5], [2, 1, 9], [-5, 7, 2]]
      const baseline = points.map(point => new Vector3(...point).project(f.camera).toArray())
      f.wheel(); const zoomed = f.read()
      expect(zoomed.zoom).toBeGreaterThan(1)
      f.request('fit')
      expect(f.camera.zoom).toBe(1)
      expect(new Vector3(...f.read().target).distanceTo(new Vector3(3, 4, 5))).toBeLessThan(1e-12)
      expect(f.camera.up.toArray()).toEqual([0, 1, 0])
      expect([f.camera.left, f.camera.right, f.camera.bottom, f.camera.top, f.camera.near, f.camera.far]).toEqual([-12, 12, -12, 12, .01, 1000])
      expect(f.direction().distanceTo(new Vector3(1, 1, 1).normalize())).toBeLessThan(1e-12)
      for (const [index, point] of points.entries()) {
        const actual = new Vector3(...point).project(f.camera)
        const [x, y, z] = [point[0] - 3, point[1] - 4, point[2] - 5]
        // Independent isometric camera basis: right=(X-Z)/sqrt(2),
        // screen-up=(-X+2Y-Z)/sqrt(6), with half-height12 and distance60.
        const expected = [(x - z) / Math.sqrt(2) / 12, (-x + 2 * y - z) / Math.sqrt(6) / 12,
          (2 * (60 - (x + y + z) / Math.sqrt(3)) - (1000 + .01)) / (1000 - .01)]
        actual.toArray().forEach((value, axis) => {
          expect(Math.abs(value - expected[axis])).toBeLessThan(1e-12)
          expect(Math.abs(value - baseline[index][axis])).toBeLessThan(1e-12)
        })
      }
      f.request('previous'); expect(f.read()).toEqual(zoomed)
    } finally { f.dispose() }
  })
  it('retains a session over a sketch viewport remount and clears it on document replacement', () => {
    const history = createViewHistory(), first = fixture(history)
    const lastRequest = first.request('top'); first.drag(true); first.wheel(); const before = first.read(), depth = history.depth
    first.dispose(); expect(history.canPrevious).toBe(false)
    const second = fixture(history, lastRequest)
    try {
      second.update(); expect(second.read()).toEqual(before); expect(history.depth).toBe(depth)
      history.reset(); second.request('iso'); expect(history.depth).toBe(0); expect(history.canPrevious).toBe(false)
      expect(second.camera.zoom).toBe(1)
    } finally { second.dispose() }
  })
  it('blocks commands during a held gesture and releases the camera on focus-loss cancellation', () => {
    const f = fixture()
    try {
      f.request('front'); f.begin(); f.move(150, 100)
      const during = f.read(), depth = f.history.depth
      f.request('top'); expect(f.read()).toEqual(during)
      expect(f.history.depth).toBe(depth); expect(f.history.canPrevious).toBe(false)
      f.navigation.cancelGesture(); const canceled = f.read(); f.update()
      expect(f.read()).toEqual(canceled); expect(f.history.canPrevious).toBe(true)
      f.request('previous'); expect(f.direction().distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-12)
      f.drag(); expect(f.history.canPrevious).toBe(true)
    } finally { f.dispose() }
  })
  it('copies snapshots rather than retaining external mutable arrays', () => {
    const f = fixture()
    try { const snapshot = f.history.current!; snapshot.position[0] = 999; expect(f.history.current!.position[0]).not.toBe(999) }
    finally { f.dispose() }
  })
})

describe('shared view key mapping', () => {
  const key = (value: string, changes = {}) => ({ key: value, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, defaultPrevented: false, ...changes })
  it('maps the seven standard views and Previous independently of document undo', () => {
    expect(['1', '2', '3', '4', '5', '6', '7'].map(value => viewShortcutCommand(key(value), false))).toEqual(['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'])
    expect(viewShortcutCommand(key('z', { shiftKey: true }), false)).toBe('previous')
    expect(viewShortcutCommand(key('z'), false)).toBeNull(); expect(viewShortcutCommand(key('y'), false)).toBeNull()
    expect(viewShortcutCommand(key('8'), false)).toBeNull()
    expect(standardViews.map(view => view.shortcut)).toEqual(['Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7'])
  })
  it('leaves text, composition, modal-owned events and extra modifiers alone', () => {
    expect(viewShortcutCommand(key('1'), true)).toBeNull()
    for (const changes of [{ isComposing: true }, { defaultPrevented: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) expect(viewShortcutCommand(key('1', changes), false)).toBeNull()
    expect(viewShortcutCommand(key('f', { ctrlKey: false }), false)).toBe('fit')
  })
})
