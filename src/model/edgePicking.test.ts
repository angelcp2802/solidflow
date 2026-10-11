import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pickVisibleEdge } from '../components/Viewport'

const viewport = { width: 400, height: 300 }
const resources: { dispose(): void }[] = []

function fixture(perspective = false) {
  const camera = perspective
    ? new THREE.PerspectiveCamera(45, viewport.width / viewport.height, 0.1, 1000)
    : new THREE.OrthographicCamera(-40, 40, 30, -30, 0.1, 1000)
  camera.position.set(0, 0, 100)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const geometry = new THREE.BoxGeometry(20, 20, 20)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const body = new THREE.Mesh(geometry, material)
  resources.push(geometry, material)
  return { camera, body }
}

function edge(key: string, lines: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
  const material = new THREE.LineBasicMaterial()
  const object = new THREE.LineSegments(geometry, material)
  resources.push(geometry, material)
  return { ref: { sourceFeatureId: 'extrude-1', key: `edge-v1|${key}` }, object }
}

function screen(camera: THREE.Camera, point: [number, number, number]) {
  const projected = new THREE.Vector3(...point).project(camera)
  return { x: (projected.x + 1) * viewport.width / 2, y: (1 - projected.y) * viewport.height / 2 }
}

afterEach(() => {
  resources.splice(0).forEach((item) => item.dispose())
})

describe('screen-space CAD edge picking', () => {
  it('rejects edges behind a visible solid face and selects the visible overlapping edge', () => {
    const { camera, body } = fixture()
    const back = edge('back', [-8, 0, -10, 8, 0, -10])
    const front = edge('front', [-8, 0, 10, 8, 0, 10])
    const pointer = screen(camera, [0, 0, 10])
    expect(pickVisibleEdge(camera, body, [back], pointer, viewport)).toBeNull()
    expect(pickVisibleEdge(camera, body, [back, front], pointer, viewport)).toEqual(front.ref)
  })

  it.each([1, 4, 0.25])('keeps the same eight-pixel tolerance at zoom %s', (zoom) => {
    const { camera, body } = fixture()
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    const boundary = edge('upper', [-10, 10, 10, 10, 10, 10])
    const point = screen(camera, [0, 10, 10])
    expect(pickVisibleEdge(camera, body, [boundary], { x: point.x, y: point.y - 6 }, viewport)).toEqual(boundary.ref)
    expect(pickVisibleEdge(camera, body, [boundary], { x: point.x, y: point.y - 9 }, viewport)).toBeNull()
  })

  it('picks in perspective with the same pixel tolerance', () => {
    const { camera, body } = fixture(true)
    const boundary = edge('upper', [-10, 10, 10, 10, 10, 10])
    const point = screen(camera, [0, 10, 10])
    expect(pickVisibleEdge(camera, body, [boundary], { x: point.x, y: point.y - 5 }, viewport)).toEqual(boundary.ref)
    expect(pickVisibleEdge(camera, body, [boundary], { x: point.x, y: point.y - 10 }, viewport)).toBeNull()
  })

  it('returns the same geometric reference for different tessellated segments of a curved edge', () => {
    const { camera, body } = fixture()
    const curve = edge('curved', [-8, 0, 10, -4, 4, 10, -4, 4, 10, 0, 6, 10, 0, 6, 10, 4, 4, 10])
    for (const point of [[-6, 2, 10], [-2, 5, 10], [2, 5, 10]] as [number, number, number][]) {
      expect(pickVisibleEdge(camera, body, [curve], screen(camera, point), viewport)).toEqual(curve.ref)
    }
  })

  it('handles empty geometry and zero-sized viewports', () => {
    const { camera, body } = fixture()
    const boundary = edge('upper', [-10, 10, 10, 10, 10, 10])
    expect(pickVisibleEdge(camera, body, [], { x: 0, y: 0 }, viewport)).toBeNull()
    expect(pickVisibleEdge(camera, body, [boundary], { x: 0, y: 0 }, { width: 0, height: 0 })).toBeNull()
  })
})
