import { describe, expect, it } from 'vitest'
import { OrthographicCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { configureCadNavigation } from './cadNavigation'
import { bindViewNavigation, captureCameraView, createViewHistory, standardViews, viewShortcutCommand, type CameraView, type ViewHistory, type ViewName, type ViewRequest } from './viewNavigation'
import type { NormalToTarget } from './normalToView'

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
  let controls: OrbitControls, aspect = 1, stamp = initial.stamp, fitCount = 0
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
    fitCount++
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
    fits: () => fitCount,
    setAspect(value: number) { aspect = value },
    setZoom(value: number) { navigation.automatic(() => { camera.zoom = value; camera.updateProjectionMatrix() }) },
    read: () => captureCameraView(camera, controls),
    direction: () => camera.position.clone().sub(controls.target).normalize(),
    request(name: Exclude<ViewName, 'normal'>) { const request = { name, stamp: ++stamp }; navigation.request(request); update(); return request },
    normal(target: NormalToTarget): ViewRequest { const request: ViewRequest = { name: 'normal', stamp: ++stamp, target }; navigation.request(request); update(); return request },
    named(view: CameraView): ViewRequest { const request: ViewRequest = { name: 'named', stamp: ++stamp, view }; navigation.request(request); update(); return request },
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
  it.each(['top', 'bottom', 'dimetric', 'trimetric'] as const)('uses the %s up basis for real horizontal middle orbit and pan', name => {
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
  it.each([
    {
      name: 'dimetric' as const,
      right: [0.9354143467241411, 0, -0.35355339051216605],
      up: [-0.11785113014268137, 0.942809041610104, -0.31180478216719176],
      depth: [0.33333333326677816, 0.33333333325402237, 0.8819171037433291],
    },
    {
      name: 'trimetric' as const,
      right: [0.8844181216774213, 0, -0.4666953889300622],
      up: [-0.24036589468392133, 0.8571673007021341, -0.4555090068042732],
      depth: [0.400036026779314, 0.5150380749100181, 0.7580942940502868],
    },
  ])('projects an asymmetric box in %s through an independent literal screen basis', ({ name, right, up, depth }) => {
    const f = fixture()
    // Literal world-to-screen bases are independent of the preset catalog and
    // camera helpers. A 10 by 6 by 4 box exposes axis swaps, signs and roll.
    const corners = [[0, 0, 0], [10, 0, 0], [0, 6, 0], [0, 0, 4], [10, 6, 0], [10, 0, 4], [0, 6, 4], [10, 6, 4]]
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    const checkBasis = () => {
      expect(f.direction().distanceTo(new Vector3(...depth))).toBeLessThan(1e-12)
      expect(f.camera.up.toArray()).toEqual([0, 1, 0])
      for (const corner of corners) {
        const projected = new Vector3(corner[0] + 3, corner[1] + 4, corner[2] + 5).project(f.camera)
        expect(projected.x).toBeCloseTo(dot(corner, right) / 12, 12)
        expect(projected.y).toBeCloseTo(dot(corner, up) / 12, 12)
        expect(projected.z).toBeCloseTo((2 * (60 - dot(corner, depth)) - (1000 + .01)) / (1000 - .01), 12)
      }
    }
    try {
      f.request(name); checkBasis()
      const pose = f.read(), historyDepth = f.history.depth
      f.forcedUpdate(300); checkBasis(); expect(f.read()).toEqual(pose)
      f.request(name); expect(f.read()).toEqual(pose); expect(f.history.depth).toBe(historyDepth)
      f.named(pose); expect(f.history.depth).toBe(historyDepth)
      f.request('front'); f.request('previous'); expect(f.read()).toEqual(pose)
      f.wheel(); const zoomed = f.read(); expect(zoomed.zoom).toBeGreaterThan(1)
      f.request('fit'); checkBasis()
      f.request('previous'); expect(f.read()).toEqual(zoomed)
    } finally { f.dispose() }
  })
  it('distinguishes two equal dimetric axis scales from three different trimetric scales', () => {
    const f = fixture()
    const lengths = () => {
      const origin = new Vector3(3, 4, 5).project(f.camera)
      return [new Vector3(4, 4, 5), new Vector3(3, 5, 5), new Vector3(3, 4, 6)].map(point => {
        point.project(f.camera); return 12 * Math.hypot(point.x - origin.x, point.y - origin.y)
      })
    }
    try {
      f.request('dimetric'); const dimetric = lengths()
      expect(dimetric[0]).toBeCloseTo(Math.sqrt(8) / 3, 9)
      expect(dimetric[1]).toBeCloseTo(dimetric[0], 10)
      expect(dimetric[2]).toBeCloseTo(Math.sqrt(2) / 3, 9)
      f.request('trimetric'); const trimetric = lengths()
      expect(trimetric[0]).toBeGreaterThan(trimetric[1] + .05)
      expect(trimetric[1]).toBeGreaterThan(trimetric[2] + .05)
      expect(trimetric[2]).toBeGreaterThan(0)
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

describe('named camera view requests', () => {
  // Original rolled camera, translated from the origin, with an asymmetric
  // vertical frustum. Literal witnesses below do not use the restore helper.
  const saved = (): CameraView => ({ position: [11, -7, 53], target: [11, -7, 3], up: [3 / 5, 4 / 5, 0],
    top: 14, bottom: -6, zoom: 2, near: 1, far: 201 })
  const state = (f: ReturnType<typeof fixture>) => {
    f.camera.updateMatrixWorld()
    return { pose: f.read(), quaternion: f.camera.quaternion.toArray(), world: [...f.camera.matrixWorld.elements],
      inverse: [...f.camera.matrixWorldInverse.elements], projection: [...f.camera.projectionMatrix.elements] }
  }
  const checkProjection = (f: ReturnType<typeof fixture>, aspect: number) => {
    // right=(4,-3,0)/5, up=(3,4,0)/5; vertical center4, half-height5
    // after zoom2; camera distance50, near1/far201.
    for (const [point, expected] of [
      [[11, -7, 3], [0, -.8, -.51]], [[15, -10, 3], [1 / aspect, -.8, -.51]],
      [[14, -3, 3], [0, .2, -.51]], [[11, -7, 13], [0, -.8, -.61]],
    ]) new Vector3(...point).project(f.camera).toArray().forEach((value, axis) => {
      expect(Math.abs(value - expected[axis])).toBeLessThan(1e-12)
    })
  }

  it('restores all saved fields without Fit and returns to the complete previous camera exactly', () => {
    const f = fixture()
    try {
      f.drag(true); f.wheel()
      const before = state(f), depth = f.history.depth, fits = f.fits(), view = saved(), original = structuredClone(view)
      f.named(view)
      expect(f.read()).toEqual(original); expect(f.fits()).toBe(fits); expect(f.history.depth).toBe(depth + 1)
      expect([f.camera.left, f.camera.right]).toEqual([-10, 10]); checkProjection(f, 1)
      const recalled = state(f)
      view.position[0] = 999; view.target[1] = 999; view.up[2] = 999; view.zoom = 99
      f.forcedUpdate(1000); expect(state(f)).toEqual(recalled)
      f.request('previous'); expect(state(f)).toEqual(before); expect(f.fits()).toBe(fits)
    } finally { f.dispose() }
  })

  it('preserves vertical framing and roll at the current aspect without stretching the model', () => {
    const f = fixture()
    try {
      f.resize(2); const depth = f.history.depth, fits = f.fits()
      f.named(saved()); expect(f.read()).toEqual(saved())
      expect([f.camera.left, f.camera.right]).toEqual([-20, 20]); checkProjection(f, 2)
      f.resize(.5)
      expect(f.read()).toEqual(saved()); expect([f.camera.left, f.camera.right]).toEqual([-5, 5]); checkProjection(f, .5)
      expect(f.history.depth).toBe(depth + 1); expect(f.fits()).toBe(fits)
    } finally { f.dispose() }
  })

  it('records an effective first named command and treats repeated poses and request identities as no-ops', () => {
    const first = fixture(undefined, { name: 'named', stamp: 0, view: saved() })
    try {
      expect(first.fits()).toBe(0); expect(first.history.depth).toBe(1); expect(first.read()).toEqual(saved())
      first.request('previous')
      expect(first.read()).toEqual({ position: [30, 30, 30], target: [0, 0, 0], up: [0, 1, 0], top: 10, bottom: -10, zoom: 1, near: .1, far: 1000 })
      const request = first.named(saved()), before = state(first), revision = first.history.snapshot()
      first.navigation.request(request); first.named(saved()); first.update()
      expect(state(first)).toEqual(before); expect(first.history.depth).toBe(1)
      expect(first.history.snapshot()).toBe(revision); expect(first.fits()).toBe(0)
    } finally { first.dispose() }
  })

  it('caps named recalls at ten entries and restores their literal poses in reverse order', () => {
    const f = fixture(), views: CameraView[] = []
    try {
      for (let index = 0; index < 14; index++) {
        const view = saved(); view.position[0] += index; view.target[0] += index
        views.push(structuredClone(view)); f.named(view)
      }
      expect(f.history.depth).toBe(10)
      for (let index = 12; index >= 3; index--) { f.request('previous'); expect(f.read()).toEqual(views[index]) }
      expect(f.history.canPrevious).toBe(false); expect(f.fits()).toBe(1)
    } finally { f.dispose() }
  })

  it('keeps the saved camera and previous entry through a viewport remount without reapplying its request', () => {
    const history = createViewHistory(), first = fixture(history)
    const original = state(first), request = first.named(saved()), recalled = state(first)
    first.dispose()
    const second = fixture(history, request)
    try {
      second.forcedUpdate(1000); expect(state(second)).toEqual(recalled)
      expect(history.depth).toBe(1); expect(second.fits()).toBe(0)
      second.request('previous'); expect(state(second)).toEqual(original)
      history.reset(); second.request('iso'); expect(history.depth).toBe(0)
    } finally { second.dispose() }
  })

  it('does not consume a named command during a held gesture, and accepts that same request after cancellation', () => {
    const f = fixture(), request: ViewRequest = { name: 'named', stamp: 10, view: saved() }
    try {
      f.begin(); f.move(150, 100); const during = state(f), depth = f.history.depth, fits = f.fits()
      f.navigation.request(request); expect(state(f)).toEqual(during); expect(f.history.depth).toBe(depth)
      f.navigation.cancelGesture(); const canceled = state(f)
      f.navigation.request(request); f.update()
      expect(f.read()).toEqual(saved()); expect(f.history.depth).toBe(depth + 1); expect(f.fits()).toBe(fits)
      f.request('previous'); expect(state(f)).toEqual(canceled)
    } finally { f.dispose() }
  })

  it.each([0, -1, NaN, Infinity, 1e-100, 1e308])('rejects an unusable current aspect %s without consuming a valid saved view', aspect => {
    const f = fixture(), request: ViewRequest = { name: 'named', stamp: 10, view: saved() }
    try {
      const before = state(f), revision = f.history.snapshot(), fits = f.fits()
      f.setAspect(aspect); f.navigation.request(request)
      expect(state(f)).toEqual(before); expect(f.history.snapshot()).toBe(revision); expect(f.history.depth).toBe(0)
      f.setAspect(1); f.navigation.request(request); f.update()
      expect(f.read()).toEqual(saved()); expect(f.history.depth).toBe(1); expect(f.fits()).toBe(fits)
    } finally { f.setAspect(1); f.dispose() }
  })

  it('preserves the projection safety margin when a narrow current aspect increases the horizontal coefficient', () => {
    const f = fixture(), request: ViewRequest = { name: 'named', stamp: 10, view: {
      position: [1e9, 0, 40], target: [1e9, 0, 0], up: [0, 1, 0], top: 10, bottom: -10, zoom: 2e28, near: 1, far: 201,
    } }
    try {
      const before = state(f), revision = f.history.snapshot(), fits = f.fits()
      // At aspect .001, x scale is2e30 (finite Float32), but its product
      // with a permitted world coordinate1e9 is2e39, beyond Float32.
      f.setAspect(.001); f.navigation.request(request)
      expect(state(f)).toEqual(before); expect(f.history.snapshot()).toBe(revision); expect(f.history.depth).toBe(0)
      // The same declaration is admissible at aspect1: scale2e27 retains
      // the model's stated margin. Rejection must not consume its identity.
      f.setAspect(1); f.navigation.request(request); f.update()
      expect(f.read()).toEqual(request.view); expect(f.history.depth).toBe(1); expect(f.fits()).toBe(fits)
    } finally { f.setAspect(1); f.dispose() }
  })

  it.each([
    ['non-finite position', { position: [Infinity, 0, 2] }], ['zero direction', { position: [11, -7, 3] }],
    ['zero up', { up: [0, 0, 0] }], ['parallel up', { up: [0, 0, 1] }],
    ['empty frustum', { bottom: 14 }], ['zero zoom', { zoom: 0 }], ['reversed clip', { far: .5 }],
  ])('rejects %s before consuming the request or changing Normal To repeat state', (_label, invalid) => {
    const f = fixture(), target: NormalToTarget = { kind: 'plane', key: 'original-horizontal',
      frame: { origin: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] } }
    try {
      f.normal(target); const before = state(f), depth = f.history.depth, fits = f.fits(), revision = f.history.snapshot()
      const request: ViewRequest = { name: 'named', stamp: 10, view: { ...saved(), ...invalid } as CameraView }
      f.navigation.request(request); f.update()
      expect(state(f)).toEqual(before); expect(f.history.depth).toBe(depth); expect(f.fits()).toBe(fits)
      expect(f.history.snapshot()).toBe(revision)
      f.normal(target); expect(f.direction().distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-12)
      request.view = saved(); f.navigation.request(request); f.update(); expect(f.read()).toEqual(saved())
    } finally { f.dispose() }
  })
})

describe('Normal To camera requests', () => {
  const plane: NormalToTarget = { kind: 'plane', key: 'original-3-4-5-frame',
    frame: { origin: [101, -73, 25], normal: [3 / 5, 0, 4 / 5], xDirection: [4 / 5, 0, -3 / 5] } }
  const state = (f: ReturnType<typeof fixture>) => {
    f.camera.updateMatrixWorld()
    return { pose: f.read(), quaternion: f.camera.quaternion.toArray(), world: [...f.camera.matrixWorld.elements], projection: [...f.camera.projectionMatrix.elements] }
  }

  it('fits the selected oblique basis, projects independent coordinates and restores the complete prior view exactly', () => {
    const f = fixture()
    try {
      f.drag(true); f.wheel(); const before = state(f), fits = f.fits(), depth = f.history.depth
      f.normal(plane)
      expect(f.fits()).toBe(fits + 1); expect(f.history.depth).toBe(depth + 1)
      expect(f.camera.zoom).toBe(1); expect(f.camera.up.toArray()).toEqual([0, 1, 0])
      expect(f.controls().target.toArray()).toEqual([3, 4, 5])
      expect(f.camera.position.distanceTo(new Vector3(39, 4, 53))).toBeLessThan(1e-12)
      for (const [x, y, z] of [[3, 4, 5], [8, -6, 15], [-5, 14, -2]]) {
        const actual = new Vector3(x, y, z).project(f.camera)
        expect(Math.abs(actual.x - (4 * (x - 3) - 3 * (z - 5)) / 5 / 12)).toBeLessThan(1e-12)
        expect(Math.abs(actual.y - (y - 4) / 12)).toBeLessThan(1e-12)
      }
      const after = state(f); f.forcedUpdate(1000); expect(state(f)).toEqual(after)
      f.request('previous'); expect(state(f)).toEqual(before); expect(f.fits()).toBe(fits + 1)
    } finally { f.dispose() }
  })

  it('flips the same ordered selection by reversing direction while keeping up, and resets on a changed target', () => {
    const f = fixture()
    try {
      const request = f.normal(plane), first = state(f), depth = f.history.depth
      f.navigation.request(request); f.update(); expect(state(f)).toEqual(first); expect(f.history.depth).toBe(depth)
      f.normal(plane)
      expect(f.direction().distanceTo(new Vector3(-3 / 5, 0, -4 / 5))).toBeLessThan(1e-12)
      expect(f.camera.up.toArray()).toEqual(first.pose.up); expect(f.history.depth).toBe(depth + 1)
      f.request('previous'); expect(state(f)).toEqual(first)
      f.normal(plane); expect(state(f)).toEqual(first) // Previous ends the repeat sequence.
      f.normal(plane)
      f.normal({ ...plane, key: 'different-current-owner' })
      expect(state(f)).toEqual(first)
      f.normal({ ...plane, frame: { ...plane.frame, normal: [-3 / 5, 0, -4 / 5] } })
      expect(f.direction().distanceTo(new Vector3(-3 / 5, 0, -4 / 5))).toBeLessThan(1e-12)
      expect(f.camera.up.toArray()).toEqual([0, -1, 0])
    } finally { f.dispose() }
  })

  it('uses the second ordered plane as screen up and retains it during the reverse view', () => {
    const f = fixture()
    try {
      const target: NormalToTarget = { kind: 'planes', key: 'front/side',
        first: { origin: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] },
        second: { origin: [9, 7, 5], normal: [1, 0, 0], xDirection: [0, 1, 0] } }
      f.normal(target); expect(f.camera.up.toArray()).toEqual([1, 0, 0])
      const center = new Vector3(3, 4, 5).project(f.camera), secondDirection = new Vector3(4, 4, 5).project(f.camera)
      expect(Math.abs(secondDirection.x - center.x)).toBeLessThan(1e-12)
      expect(secondDirection.y - center.y).toBeCloseTo(1 / 12, 12)
      f.normal(target); expect(f.camera.up.toArray()).toEqual([1, 0, 0])
      expect(f.direction().distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-12)
    } finally { f.dispose() }
  })

  it('rejects malformed targets and held-gesture commands without consuming history, repeat state or Fit', () => {
    const f = fixture()
    try {
      f.normal(plane); const before = state(f), depth = f.history.depth, fits = f.fits()
      f.normal({ ...plane, frame: { ...plane.frame, normal: [0, 0, 0] } })
      expect(state(f)).toEqual(before); expect(f.history.depth).toBe(depth); expect(f.fits()).toBe(fits)
      f.begin(); f.normal(plane); f.end(); f.update()
      expect(state(f)).toEqual(before); expect(f.history.depth).toBe(depth); expect(f.fits()).toBe(fits)
      f.normal(plane); expect(f.direction().distanceTo(new Vector3(-3 / 5, 0, -4 / 5))).toBeLessThan(1e-12)
    } finally { f.dispose() }
  })

  it('preserves repeat state over an unchanged viewport remount and resets after effective input or another view', () => {
    const history = createViewHistory(), first = fixture(history)
    const request = first.normal(plane), before = state(first), depth = history.depth
    first.dispose()
    const f = fixture(history, request)
    try {
      expect(state(f)).toEqual(before); expect(history.depth).toBe(depth)
      f.normal(plane); expect(f.direction().distanceTo(new Vector3(-3 / 5, 0, -4 / 5))).toBeLessThan(1e-12)
      f.drag(true); f.normal(plane); expect(state(f)).toEqual(before)
      f.request('top'); f.normal(plane); expect(state(f)).toEqual(before)
      f.normal({ kind: 'none' }); const nearest = state(f), nearestDepth = history.depth
      expect(f.direction().toArray()).toEqual([0, 0, 1]); expect(f.camera.up.toArray()).toEqual([0, 1, 0])
      f.normal({ kind: 'none' }); expect(state(f)).toEqual(nearest); expect(history.depth).toBe(nearestDepth)
    } finally { f.dispose() }
  })
})

describe('shared view key mapping', () => {
  const key = (value: string, changes = {}) => ({ key: value, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, defaultPrevented: false, ...changes })
  it('maps the seven standard views and Previous independently of document undo', () => {
    expect(['1', '2', '3', '4', '5', '6', '7'].map(value => viewShortcutCommand(key(value), false))).toEqual(['front', 'back', 'left', 'right', 'top', 'bottom', 'iso'])
    expect(viewShortcutCommand(key('z', { shiftKey: true }), false)).toBe('previous')
    expect(viewShortcutCommand(key('z'), false)).toBeNull(); expect(viewShortcutCommand(key('y'), false)).toBeNull()
    expect(viewShortcutCommand(key('8'), false)).toBe('normal')
    expect(viewShortcutCommand(key('8', { ctrlKey: false, metaKey: true }), false)).toBe('normal')
    expect(viewShortcutCommand(key('8'), true)).toBeNull()
    expect(viewShortcutCommand(key('8', { shiftKey: true }), false)).toBeNull()
    expect(standardViews.filter(view => view.shortcut).map(view => view.shortcut)).toEqual(['Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6', 'Ctrl+7'])
    expect(viewShortcutCommand(key('9'), false)).toBeNull()
  })
  it('leaves text, composition, modal-owned events and extra modifiers alone', () => {
    expect(viewShortcutCommand(key('1'), true)).toBeNull()
    for (const changes of [{ isComposing: true }, { defaultPrevented: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) expect(viewShortcutCommand(key('1', changes), false)).toBeNull()
    expect(viewShortcutCommand(key('f', { ctrlKey: false }), false)).toBe('fit')
  })
})
