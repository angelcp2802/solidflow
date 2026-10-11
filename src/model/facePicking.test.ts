import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { PickableFace } from '../cad/kernel.types'
import { pickVisibleFace, pickVisiblePlane } from '../components/Viewport'

const viewport = { width: 400, height: 300 }
const resources: { dispose(): void }[] = []
function camera(perspective = false) {
  const camera = perspective ? new THREE.PerspectiveCamera(45, 4 / 3, .1, 1000) : new THREE.OrthographicCamera(-40, 40, 30, -30, .1, 1000)
  camera.position.set(0, 0, 100)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}
function face(key: string, z: number, curved = false, positions = [-10, -10, z, 10, -10, z, 10, 10, z, -10, 10, z], triangles = [0, 1, 2, 0, 2, 3]) {
  const face: PickableFace = { ref: { sourceFeatureId: 'solid', key: `face-v1|${key}` }, frame: curved ? null : { origin: [0, 0, z], xDirection: [1, 0, 0], normal: [0, 0, 1] }, vertices: positions, triangles }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(triangles)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const object = new THREE.Mesh(geometry, material)
  resources.push(geometry, material)
  return { face, object }
}
afterEach(() => resources.splice(0).forEach(resource => resource.dispose()))

describe('frontmost CAD face picking', () => {
  it.each([false, true])('selects the closest actual face regardless of input order (perspective=%s)', perspective => {
    const view = camera(perspective), front = face('front', 10), back = face('back', -10)
    expect(pickVisibleFace(view, [back, front], { x: 200, y: 150 }, viewport)).toBe(front.face)
    expect(pickVisibleFace(view, [front, back], { x: 200, y: 150 }, viewport)).toBe(front.face)
  })

  it('returns an unsupported curved face instead of selecting a planar face behind it', () => {
    const front = face('curved', 10, true), back = face('planar-behind', -10)
    expect(pickVisibleFace(camera(), [back, front], { x: 200, y: 150 }, viewport)).toBe(front.face)
    expect(front.face.frame).toBeNull()
  })

  it('tests triangles rather than their bounding boxes, so holes do not intercept clicks', () => {
    const front = face('triangle-away-from-center', 10, false, [-10, -10, 10, 10, -10, 10, -10, 10, 10], [0, 1, 2])
    const back = face('visible-through-opening', -10)
    // (5,5) is inside both bounding boxes but outside the front triangle.
    expect(pickVisibleFace(camera(), [front, back], { x: 225, y: 125 }, viewport)).toBe(back.face)
  })

  it('maps both triangles of a tessellated face to the same persistent reference', () => {
    const top = face('top', 10)
    for (const pointer of [{ x: 225, y: 175 }, { x: 175, y: 125 }]) expect(pickVisibleFace(camera(), [top], pointer, viewport)?.ref).toEqual(top.face.ref)
  })

  it('picks unhighlighted meshes and correctly updates their world transforms', () => {
    const top = face('translated', 10)
    top.object.visible = false // A picking mesh is hidden until hovered or selected.
    top.object.position.x = 20
    expect(pickVisibleFace(camera(), [top], { x: 300, y: 150 }, viewport)).toBe(top.face)
    expect(pickVisibleFace(camera(), [top], { x: 200, y: 150 }, viewport)).toBeNull()
  })

  it('returns null for empty/outside viewports and background pixels', () => {
    const top = face('top', 10), view = camera()
    expect(pickVisibleFace(view, [], { x: 200, y: 150 }, viewport)).toBeNull()
    expect(pickVisibleFace(view, [top], { x: 200, y: 150 }, { width: 0, height: 0 })).toBeNull()
    expect(pickVisibleFace(view, [top], { x: -1, y: 150 }, viewport)).toBeNull()
    expect(pickVisibleFace(view, [top], { x: 20, y: 20 }, viewport)).toBeNull()
  })
})

describe('reference plane picking', () => {
  it('selects only visible actual plane quads', () => {
    const near = face('near', 20), far = face('far', -10), view = camera()
    const planes = [{ id: 'far-plane', object: far.object }, { id: 'near-plane', object: near.object }]
    expect(pickVisiblePlane(view, null, planes, { x: 200, y: 150 }, viewport)).toBe('near-plane')
    near.object.visible = false
    expect(pickVisiblePlane(view, null, planes, { x: 200, y: 150 }, viewport)).toBe('far-plane')
    expect(pickVisiblePlane(view, null, planes, { x: 10, y: 10 }, viewport)).toBeNull()
  })

  it('does not select a plane hidden behind opaque body geometry', () => {
    const surface = face('surface', 10), behind = face('behind', -10), ahead = face('ahead', 20), view = camera()
    expect(pickVisiblePlane(view, surface.object, [{ id: 'hidden', object: behind.object }], { x: 200, y: 150 }, viewport)).toBeNull()
    expect(pickVisiblePlane(view, surface.object, [{ id: 'visible', object: ahead.object }], { x: 200, y: 150 }, viewport)).toBe('visible')
  })
})
