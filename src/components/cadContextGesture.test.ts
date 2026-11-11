import { describe, expect, it } from 'vitest'
import { createCadContextGesture } from './cadContextGesture'

describe('completed right-click contexts', () => {
  const press = { pointerId: 7, button: 2, clientX: 100, clientY: 50 }
  const frame = {}

  it.each(['early', 'late'] as const)('waits for intent and release, once, with %s context intent', order => {
    const gesture = createCadContextGesture()
    gesture.down(press, frame)
    const release = { ...press, clientX: 103 }
    if (order === 'early') {
      expect(gesture.request(press, frame)).toBeNull()
      expect(gesture.up(release, frame)).toEqual({ x: 103, y: 50 })
    } else {
      expect(gesture.up(release, frame)).toBeNull()
      expect(gesture.request(release, frame)).toEqual({ x: 103, y: 50 })
    }
    expect(gesture.request(release, frame)).toBeNull()
    expect(gesture.up(release, frame)).toBeNull()
  })

  it.each(['early', 'late'] as const)('rejects a twelve-pixel drag and a return to press with %s intent', order => {
    for (const returnsToPress of [false, true]) {
      const gesture = createCadContextGesture()
      gesture.down(press, frame)
      if (order === 'early') expect(gesture.request(press, frame)).toBeNull()
      const moved = { ...press, clientX: 112 }
      gesture.move(moved)
      const release = returnsToPress ? press : moved
      expect(gesture.up(release, frame)).toBeNull()
      expect(gesture.request(release, frame)).toBeNull()
    }
  })

  it('checks release and late-request coordinates even without intermediate moves', () => {
    const gesture = createCadContextGesture()
    const moved = { ...press, clientX: 112 }
    gesture.down(press, frame)
    expect(gesture.request(press, frame)).toBeNull()
    expect(gesture.up(moved, frame)).toBeNull()
    gesture.down(press, frame)
    expect(gesture.up(press, frame)).toBeNull()
    expect(gesture.request(moved, frame)).toBeNull()
    gesture.down(press, frame)
    expect(gesture.request(moved, frame)).toBeNull()
    expect(gesture.up(press, frame)).toBeNull()
  })

  it.each(['release', 'request'] as const)('requires the exact interaction frame at %s', changedAt => {
    const gesture = createCadContextGesture()
    gesture.down(press, frame)
    if (changedAt === 'release') {
      expect(gesture.request(press, frame)).toBeNull()
      expect(gesture.up(press, {})).toBeNull()
    } else {
      expect(gesture.up(press, frame)).toBeNull()
      expect(gesture.request(press, {})).toBeNull()
    }
    expect(gesture.request(press, frame)).toBeNull()
    expect(gesture.up(press, frame)).toBeNull()
  })

  it.each(['before-release', 'before-request'] as const)('revokes intent on cancellation %s', phase => {
    const gesture = createCadContextGesture()
    gesture.down(press, frame)
    if (phase === 'before-release') gesture.request(press, frame)
    else gesture.up(press, frame)
    gesture.cancel()
    expect(gesture.up(press, frame)).toBeNull()
    expect(gesture.request(press, frame)).toBeNull()
  })

  it('rejects a changed pointer and replacement presses', () => {
    const gesture = createCadContextGesture()
    gesture.down(press, frame)
    gesture.request(press, frame)
    expect(gesture.up({ ...press, pointerId: 8 }, frame)).toBeNull()
    for (const button of [0, 1]) {
      gesture.down(press, frame)
      gesture.request(press, frame)
      gesture.down({ ...press, button }, frame)
      expect(gesture.up(press, frame)).toBeNull()
    }
    gesture.down(press, frame)
    gesture.request(press, frame)
    gesture.move({ ...press, pointerId: 8 })
    expect(gesture.up(press, frame)).toBeNull()
  })

  it('rejects unpaired requests, releases and non-right requests', () => {
    const gesture = createCadContextGesture()
    expect(gesture.request(press, frame)).toBeNull()
    expect(gesture.up(press, frame)).toBeNull()
    gesture.down(press, frame)
    expect(gesture.up(press, frame)).toBeNull()
    expect(gesture.request({ ...press, button: 0 }, frame)).toBeNull()
    expect(gesture.request(press, frame)).toBeNull()
  })

  it('reads native-style prototype fields and snapshots the released coordinates', () => {
    const gesture = createCadContextGesture()
    // DOM event coordinates are prototype fields, not enumerable own fields.
    const event = Object.create(press)
    gesture.down(event, frame)
    expect(gesture.request(event, frame)).toBeNull()
    expect(gesture.up(event, frame)).toEqual({ x: 100, y: 50 })
    gesture.down(event, frame)
    expect(gesture.up(event, frame)).toBeNull()
    event.clientX = 102
    expect(gesture.request(event, frame)).toEqual({ x: 100, y: 50 })
  })

  it('revokes a repeated release before a late context request', () => {
    const gesture = createCadContextGesture()
    gesture.down(press, frame)
    expect(gesture.up(press, frame)).toBeNull()
    expect(gesture.up({ ...press, clientX: 103 }, frame)).toBeNull()
    expect(gesture.request(press, frame)).toBeNull()
  })

  it.each([4, 4.001])('keeps the existing four-pixel boundary at %s pixels', distance => {
    const gesture = createCadContextGesture()
    const release = { ...press, clientX: press.clientX + distance }
    gesture.down(press, frame)
    expect(gesture.request(press, frame)).toBeNull()
    expect(gesture.up(release, frame)).toEqual(distance === 4 ? { x: 104, y: 50 } : null)
  })

  it.each([0, 1])('rejects a release from button %s without leaving delayed authority', button => {
    const gesture = createCadContextGesture()
    gesture.down(press, frame)
    expect(gesture.request(press, frame)).toBeNull()
    expect(gesture.up({ ...press, button }, frame)).toBeNull()
    expect(gesture.up(press, frame)).toBeNull()
    expect(gesture.request(press, frame)).toBeNull()
  })
})
