import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { CadResult, PickableFace } from '../cad/kernel.types'
import { currentFaceHoverReference, pickVisibleFace } from './Viewport'

// Original display-only boxes and literal pixel calibration: 10 mm spans 100 px.
// These tests do not attest native BRep, a physical click or worker target acceptance.
function scene() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100)
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix()
  const faces: { face: PickableFace; object: THREE.Mesh }[] = []
  const add = (key: string, z = 0, sourceFeatureId = 'original-owner') => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    object.position.z = z
    const face: PickableFace = { ref: { sourceFeatureId, key: 'face-v1|' + key }, frame: null, vertices: [], triangles: [] }
    const result = { face, object }; faces.push(result); return result
  }
  return { camera, faces, add,
    pick: () => pickVisibleFace(camera, faces, { x: 50, y: 50 }, { width: 100, height: 100 }),
    dispose: () => faces.forEach(({ object }) => { object.geometry.dispose(); (object.material as THREE.Material).dispose() }) }
}

describe('exact visible face identity', () => {
  it.each([false, true])('rejects coincident different references regardless of catalog order, same owner=%s', sameOwner => {
    const input = scene()
    try {
      input.add('a'); input.add('b', 0, sameOwner ? 'original-owner' : 'other-owner')
      expect(input.pick()).toBeNull()
      input.faces.reverse(); expect(input.pick()).toBeNull()
    } finally { input.dispose() }
  })
  it('permits multiple triangle hits on one exact face', () => {
    const input = scene()
    try {
      const target = input.add('a'), ray = new THREE.Raycaster()
      input.camera.updateMatrixWorld(); target.object.updateMatrixWorld()
      ray.setFromCamera(new THREE.Vector2(0, 0), input.camera)
      const hits = ray.intersectObject(target.object, false)
      expect(hits.filter(hit => Math.abs(hit.distance - hits[0].distance) < 1e-10).length).toBeGreaterThan(1)
      expect(input.pick()).toBe(target.face)
    } finally { input.dispose() }
  })
  it('selects only the genuinely nearer face and rejects material occluding a scoped face', () => {
    const input = scene()
    try {
      const back = input.add('back', -2), front = input.add('front', 0)
      expect(input.pick()).toBe(front.face)
      input.faces.reverse(); expect(input.pick()).toBe(front.face)
      expect(pickVisibleFace(input.camera, [back], { x: 50, y: 50 }, { width: 100, height: 100 }, front.object)).toBeNull()
    } finally { input.dispose() }
  })
  it('uses the existing depth tolerance for near-coincident identities', () => {
    const input = scene()
    try {
      input.add('a'); const near = input.add('b', 1e-6)
      expect(input.pick()).toBeNull()
      near.object.position.z = .01
      expect(input.pick()).toBe(near.face)
    } finally { input.dispose() }
  })
})

describe('read-only face hover observation', () => {
  function fixture() {
    const model: CadResult = { vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], volume: 0,
      bounds: { min: [0, 0, 0], max: [1, 1, 1] }, warnings: [], featureErrors: [] }
    const face: PickableFace = { ref: { sourceFeatureId: 'original-owner', key: 'face-v1|original' }, frame: null, vertices: [], triangles: [] }
    const frame = { side: 'first' }, observation = { model, frame, camera: 'camera-a', face }
    return { observation, current: { model, frame, camera: 'camera-a', presentedModel: model, presentedFrame: frame,
      presentedCamera: 'camera-a', face, selectionMode: 'face' as const, disabled: false, navigating: false } }
  }
  it('returns only a detached exact reference from the current presented face', () => {
    const { observation, current } = fixture(), result = currentFaceHoverReference(observation, current)
    expect(result).toEqual(observation.face.ref); expect(result).not.toBe(observation.face.ref)
    expect(Object.keys(result!)).toEqual(['sourceFeatureId', 'key'])
    result!.key = 'changed observer copy'; expect(observation.face.ref.key).toBe('face-v1|original')
    expect(currentFaceHoverReference(observation, { ...current, selectionMode: 'auto' })).toEqual(observation.face.ref)
  })
  it('withholds stale model, role, presentation, camera, unavailable and disabled candidates', () => {
    const { observation, current } = fixture()
    for (const patch of [{ model: structuredClone(current.model) }, { presentedModel: structuredClone(current.model) },
      { frame: { side: 'second' } }, { frame: undefined }, { presentedFrame: undefined }, { camera: 'camera-b' },
      { presentedCamera: undefined }, { face: undefined }, { face: structuredClone(current.face) },
      { disabled: true }, { navigating: true }, { selectionMode: 'body' as const }, { selectionMode: 'edge' as const }]) {
      expect(currentFaceHoverReference(observation, { ...current, ...patch })).toBeNull()
    }
    expect(currentFaceHoverReference(null, current)).toBeNull()
  })
})
