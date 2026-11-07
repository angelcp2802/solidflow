import { describe, expect, it } from 'vitest'
import type { CadResult, ExtrudeFeature, Feature } from '../cad/kernel.types'
import { createDocument } from '../model/document'
import { createCadSelectionGesture } from './cadNavigation'
import { extrusionEndForSide, extrusionEndPatch, extrusionEndPickCurrent, type ExtrusionEndPickingRequest } from './extrusionEndPicking'
import { referencePickingPresentationCurrent } from './partReferencePicking'

// Original data-only request and display contracts; not native or physical pointer evidence.
function fixture() {
  const draft: ExtrudeFeature = { id: 'boss', name: 'Original two-target boss', type: 'extrude', suppressed: false,
    sketchId: 'sketch', depth: 13, symmetric: false, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } },
    secondDirection: { enabled: false, depth: 7, endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: 'limit' } } } }
  const document = createDocument('Original role requests'), features: Feature[] = []
  const model: CadResult = { vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], volume: 0,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] }, warnings: [], featureErrors: [] }
  const request: ExtrusionEndPickingRequest = { side: 'second', draft, document, epoch: 2, model, features }
  return { request, state: { draft, document, epoch: 2, model, features, builtFeatures: features, loading: false, blocked: false } }
}

describe('side-specific current extrusion requests', () => {
  it('admits a retained OFF target for explicit repair without activating the branch', () => {
    const { request, state } = fixture(), before = structuredClone(request.draft)
    expect(extrusionEndPickCurrent(request, state)).toBe(true)
    const patch = extrusionEndPatch(request.draft, request.side, { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } })
    expect(patch).toEqual({ secondDirection: { enabled: false, depth: 7, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } } })
    expect(extrusionEndForSide(request.draft, 'first')).toEqual(before.endCondition)
    expect(request.draft).toEqual(before)
  })
  it('rejects every changed authority even when document/model contents compare equal', () => {
    const { request, state } = fixture()
    for (const patch of [{ draft: structuredClone(state.draft) }, { document: structuredClone(state.document) }, { epoch: 3 },
      { model: structuredClone(state.model) }, { features: [...state.features] }, { builtFeatures: [...state.features] }, { loading: true }, { blocked: true }]) {
      expect(extrusionEndPickCurrent(request, { ...state, ...patch })).toBe(false)
    }
    expect(extrusionEndPickCurrent(null, state)).toBe(false)
    state.model.featureErrors = [{ id: 'earlier', message: 'Original failed prefix' }]
    expect(extrusionEndPickCurrent(request, state)).toBe(false)
  })
  it('does not redirect a second-side request after its own mode changes', () => {
    const { request, state } = fixture()
    delete request.draft.secondDirection!.endCondition
    expect(extrusionEndPickCurrent(request, state)).toBe(false)
    expect(extrusionEndPickCurrent({ ...request, side: 'first' }, state)).toBe(true)
  })
})

describe('presented role and camera selection ticket', () => {
  function presentation() {
    const model = {}, frame = { request: { side: 'first' } }
    return { frame, downPresentedFrame: frame, presentedFrame: frame, model, presentedModel: model, camera: 'camera-a', downCamera: 'camera-a', downPresentedCamera: 'camera-a', presentedCamera: 'camera-a',
      navigating: false, width: 800, height: 600, clientWidth: 800, clientHeight: 600 }
  }
  it('accepts a stationary current click and rejects role switches, unpresented scenes and navigation', () => {
    const input = presentation()
    expect(referencePickingPresentationCurrent(input)).toBe(true)
    for (const patch of [{ frame: { request: { side: 'second' } } }, { presentedFrame: undefined }, { downPresentedFrame: {} }, { presentedModel: {} },
      { camera: 'camera-b' }, { downCamera: 'camera-b' }, { downPresentedCamera: 'camera-b' }, { presentedCamera: undefined }, { navigating: true }, { width: 802 }, { height: 602 }]) {
      expect(referencePickingPresentationCurrent({ ...input, ...patch })).toBe(false)
    }
  })
  it('rejects release under another role request even with unchanged source geometry', () => {
    const gesture = createCadSelectionGesture(), pointer = { pointerId: 1, button: 0, clientX: 200, clientY: 150 }
    const first = { side: 'first', model: {} }, second = { side: 'second', model: first.model }
    gesture.down(pointer, first)
    expect(gesture.up(pointer, second)).toBe(false)
    gesture.down(pointer, second)
    expect(gesture.up(pointer, second)).toBe(true)
  })
})
