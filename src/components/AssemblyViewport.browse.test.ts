import { expect, it } from 'vitest'
import { assemblyViewportBrowseMode, assemblyViewportInteractionFrameCurrent, type AssemblyViewportInteractionFrame } from './AssemblyViewport'
import type { AssemblyScene } from '../cad/kernel.assembly-types'
import { createCadSelectionGesture } from './cadNavigation'
import { createViewHistory } from './viewNavigation'

// Original data-only scene/tickets. These cases attest selection ownership and
// navigation history, not WebGL rendering, a native BRep or physical input.
const scene = (): AssemblyScene => ({ kind: 'assembly-scene', sceneId: 'original-browse-owner', bodies: [], volume: 0,
  area: 0, solidCount: 0, prototypeCount: 0, bounds: null, visibleBounds: null, warnings: [] })
const pointer = { pointerId: 1, button: 0, clientX: 50, clientY: 40 }
const frame = (source: AssemblyScene): AssemblyViewportInteractionFrame => ({ scene: source, revision: 3,
  camera: 'original-camera-and-800x600-viewport', viewRevision: 7, browseMode: 'edge' })
const onViewSelection = () => {}

it('offers opt-in native edge browsing while leaving callback-free configured browsing unchanged', () => {
  expect(assemblyViewportBrowseMode({})).toBeNull()
  expect(assemblyViewportBrowseMode({ browseSelectionMode: 'edge' })).toBeNull()
  expect(assemblyViewportBrowseMode({ onViewSelection })).toBe('face')
  expect(assemblyViewportBrowseMode({ onViewSelection, browseSelectionMode: 'edge' })).toBe('edge')
})
it.each(['pickingFaces', 'pickingEdges', 'pickingVertices', 'pickingOrigins', 'disabled'] as const)('keeps %s exclusive over browsing', owner => {
  expect(assemblyViewportBrowseMode({ onViewSelection, browseSelectionMode: 'edge', [owner]: true })).toBeNull()
})
it('does not browse when two reference roles conflict', () => {
  expect(assemblyViewportBrowseMode({ onViewSelection, browseSelectionMode: 'edge', pickingFaces: true, pickingEdges: true })).toBeNull()
})
it('rejects a held click across a replacement scene even if its display ID and contents are equal', () => {
  const source = scene(), down = frame(source), gesture = createCadSelectionGesture()
  gesture.down(pointer, down)
  const current = frame(structuredClone(source)), valid = assemblyViewportInteractionFrameCurrent(down, current)
  expect(valid).toBe(false); expect(gesture.up(pointer, valid ? down : null)).toBe(false)
})
it.each([
  { browseMode: 'face' as const }, { revision: 4 }, { camera: 'different-camera-same-viewport' },
  { camera: 'same-camera-resized-viewport' }, { viewRevision: 8 },
])('rejects a held browse click whose frame changed: %j', change => {
  const down = frame(scene())
  expect(assemblyViewportInteractionFrameCurrent(down, { ...down, ...change })).toBe(false)
})
it('permits camera movement between separate clicks but rejects navigation away and back during a hold', () => {
  const source = scene(), history = createViewHistory(), gesture = createCadSelectionGesture()
  const first = { ...frame(source), viewRevision: history.snapshot() }
  const camera = { position: [0, 0, 10] as [number, number, number], target: [0, 0, 0] as [number, number, number],
    up: [0, 1, 0] as [number, number, number], top: 5, bottom: -5, zoom: 1, near: .1, far: 100 }
  const moved = { ...camera, position: [10, 0, 10] as [number, number, number] }
  gesture.down(pointer, first)
  history.record(camera, moved); history.record(moved, camera)
  const returned = { ...first, viewRevision: history.snapshot() }
  expect(assemblyViewportInteractionFrameCurrent(first, returned)).toBe(false)
  expect(gesture.up(pointer, null)).toBe(false)
  gesture.down(pointer, returned)
  expect(assemblyViewportInteractionFrameCurrent(returned, { ...returned })).toBe(true)
  expect(gesture.up(pointer, returned)).toBe(true)
})
