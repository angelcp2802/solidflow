import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { PickableFace } from '../cad/kernel.types'
import { pickVisibleEdge, pickVisibleFace } from './Viewport'
import { pickPartReference, type PartSelectionMode } from './partSelection'

// Original display-only square and boundary segment; no native model or vendor data.
function fixture() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100)
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix()
  const object = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-4, 4, 0), new THREE.Vector3(4, 4, 0),
  ]), new THREE.LineBasicMaterial())
  const reference = { sourceFeatureId: 'original-square', key: `edge-v1|${'a'.repeat(64)}` }
  const face: PickableFace = { ref: { sourceFeatureId: 'original-square', key: `face-v1|${'b'.repeat(64)}` }, frame: null, vertices: [], triangles: [] }
  const pick = (mode: Exclude<PartSelectionMode, 'body'>, x: number, y: number, occluder = object) => {
    const pointer = { x, y }, viewport = { width: 200, height: 200 }
    return pickPartReference(mode, {
      edge: () => pickVisibleEdge(camera, occluder, [{ ref: reference, object: line }], pointer, viewport),
      face: () => pickVisibleFace(camera, [{ face, object }], pointer, viewport, occluder),
      plane: () => null,
    })
  }
  return { pick, object, reference, face, dispose() { object.geometry.dispose(); object.material.dispose(); line.geometry.dispose(); line.material.dispose() } }
}

describe('normal part reference selection', () => {
  it('selects the visible boundary near the pointer and the actual face in its interior', () => {
    const f = fixture()
    try {
      expect(f.pick('auto', 100, 24)).toEqual({ kind: 'edge', reference: f.reference })
      expect(f.pick('auto', 100, 100)).toEqual({ kind: 'face', face: f.face })
      expect(f.pick('auto', 190, 190)).toBeNull()
    } finally { f.dispose() }
  })
  it('explicit face and edge filters retain their own geometric hit policy', () => {
    const f = fixture()
    try {
      expect(f.pick('face', 100, 24)).toEqual({ kind: 'face', face: f.face })
      expect(f.pick('edge', 100, 100)).toBeNull()
      expect(f.pick('edge', 100, 24)).toEqual({ kind: 'edge', reference: f.reference })
    } finally { f.dispose() }
  })
  it('does not turn hidden edges or faces behind opaque material into an automatic hit', () => {
    const f = fixture(), occluder = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    occluder.position.z = 1
    try {
      expect(f.pick('auto', 100, 24, occluder)).toBeNull()
      expect(f.pick('auto', 100, 100, occluder)).toBeNull()
    } finally { f.dispose(); occluder.geometry.dispose(); occluder.material.dispose() }
  })
})
