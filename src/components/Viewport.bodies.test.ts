import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pickVisibleBody, pickVisibleFace } from './Viewport'

// Original display triangles only: no native BRep or editor-interaction claim.
function scene() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  const bodies: { ref: { bodyId: string; sourceFeatureId: string }; object: THREE.Mesh }[] = []
  const body = (id: string, z: number) => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    object.position.z = z
    const result = { ref: { bodyId: id, sourceFeatureId: `source-${id}` }, object }
    bodies.push(result)
    return result
  }
  return { camera, bodies, body, dispose() { for (const item of bodies) { item.object.geometry.dispose(); (item.object.material as THREE.Material).dispose() } } }
}

describe('display body picking uses exact catalog identities', () => {
  it('picks the frontmost body independently of catalog enumeration order', () => {
    const input = scene()
    try {
      input.body('back', -3)
      const front = input.body('front', 0)
      const pick = () => pickVisibleBody(input.camera, input.bodies, { x: 50, y: 50 }, { width: 100, height: 100 })
      expect(pick()).toEqual(front.ref)
      input.bodies.reverse()
      expect(pick()).toEqual(front.ref)
    } finally { input.dispose() }
  })

  it('rejects coincident frontmost hits belonging to different bodies', () => {
    const input = scene()
    try {
      input.body('a', 0); input.body('b', 0)
      expect(pickVisibleBody(input.camera, input.bodies, { x: 50, y: 50 }, { width: 100, height: 100 })).toBeNull()
    } finally { input.dispose() }
  })

  it('returns no body outside the viewport or outside actual body triangles', () => {
    const input = scene()
    try {
      input.body('a', 0)
      expect(pickVisibleBody(input.camera, input.bodies, { x: -1, y: 50 }, { width: 100, height: 100 })).toBeNull()
      expect(pickVisibleBody(input.camera, input.bodies, { x: 95, y: 95 }, { width: 100, height: 100 })).toBeNull()
    } finally { input.dispose() }
  })

  it('does not pick a scoped face hidden behind another body in the aggregate mesh', () => {
    const input = scene()
    try {
      const target = input.body('target', -3), occluder = input.body('occluder', 0)
      const face = { ref: { sourceFeatureId: target.ref.sourceFeatureId, key: `face-v1|${'a'.repeat(64)}` }, frame: null, vertices: [], triangles: [] }
      const faces = [{ face, object: target.object }]
      const pointer = { x: 50, y: 50 }, viewport = { width: 100, height: 100 }
      expect(pickVisibleFace(input.camera, faces, pointer, viewport)).toBe(face)
      expect(pickVisibleFace(input.camera, faces, pointer, viewport, target.object)).toBe(face)
      expect(pickVisibleFace(input.camera, faces, pointer, viewport, occluder.object)).toBeNull()
    } finally { input.dispose() }
  })
})
