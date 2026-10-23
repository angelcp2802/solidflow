import { expect, it } from 'vitest'
import * as THREE from 'three'
import { assemblyAnalysisBodySelected, assemblyBodyKey, assemblyComponentKey, assemblyFaceKey, assemblyDragWorldTarget, createAssemblyDragProxy, createAssemblyInterferenceOverlay, pickAssemblyComponent, pickAssemblyFace, type AssemblyPickBody, type AssemblyPickFace } from './AssemblyViewport'
import type { AssemblySceneBody, AssemblySceneFace } from '../cad/kernel.assembly-types'
import { identityRigidPose } from '../model/rigidPose'
import type { AssemblyInterferencePair } from '../model/assemblyInterference'

// Original display triangles/boxes, symbolic identities. No native geometry,
// worker result, saved mate satisfaction or human pointer interaction is claimed.
function fixture() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix()
  const bodies: AssemblyPickBody[] = [], faces: AssemblyPickFace[] = []
  const add = (path: string[], z: number, visible = true) => {
    const component = { occurrencePath: path, definition: { id: 'reused-pin', revision: 'r1' } }, bodyRef = { bodyId: 'shared-body', sourceFeatureId: 'shared-final' }
    const face: AssemblySceneFace = { selection: { component, body: bodyRef, face: { sourceFeatureId: 'shared-final', key: 'face-v1|' + 'a'.repeat(64) } },
      support: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null,
      vertices: [-1, -1, z + .5, 1, -1, z + .5, 0, 1, z + .5], triangles: [0, 1, 2] }
    const body: AssemblySceneBody = { component, body: bodyRef, name: path.join('/'), visible, worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [], faces: [face],
      volume: 4, area: 16, solidCount: 1, bounds: { min: [-1, -1, z - .5], max: [1, 1, z + .5] } }
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); object.position.z = z
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(face.vertices, 3)); geometry.setIndex(face.triangles)
    const overlay = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    const entry = { body, object }, faceEntry = { face, object: overlay }; bodies.push(entry); faces.push(faceEntry); return { entry, faceEntry }
  }
  return { camera, bodies, faces, add, dispose: () => { [...bodies, ...faces].forEach(({ object }) => { object.geometry.dispose(); (object.material as THREE.Material).dispose() }) } }
}
const pointer = { x: 50, y: 50 }, size = { width: 100, height: 100 }
it('keeps a manipulable intent proxy empty and reads its actual world frame instead of a parent-local target', () => {
  const parent = new THREE.Group(), proxy = createAssemblyDragProxy({ translation: [2, 3, 4], rotation: [0, 0, 0, 1] })
  parent.position.set(10, 20, 30); parent.quaternion.set(0, 0, Math.SQRT1_2, Math.SQRT1_2); parent.add(proxy)
  expect(proxy.children).toHaveLength(0)
  const target = assemblyDragWorldTarget(proxy)
  // Independent Cartesian Z90: (2,3,4) -> (-3,2,4), then the parent translation.
  target.translation.forEach((value, axis) => expect(value).toBeCloseTo([7, 22, 34][axis], 12))
  expect(target.rotation[2]).toBeCloseTo(Math.SQRT1_2, 12); expect(target.rotation[3]).toBeCloseTo(Math.SQRT1_2, 12)
  target.translation[0] = 999; expect(proxy.position.toArray()).toEqual([2, 3, 4])
})
it('separates two occurrences with identical definition, native body and face keys', () => {
  const f = fixture()
  try { const a = f.add(['sub-a', 'pin'], -3), b = f.add(['sub-b', 'pin'], 0)
    expect(assemblyComponentKey(a.entry.body.component)).not.toBe(assemblyComponentKey(b.entry.body.component))
    expect(assemblyFaceKey(a.faceEntry.face)).not.toBe(assemblyFaceKey(b.faceEntry.face))
    expect(pickAssemblyComponent(f.camera, f.bodies, pointer, size)).toEqual(b.entry.body.component)
    expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBe(b.faceEntry.face)
    f.bodies.reverse(); f.faces.reverse(); expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBe(b.faceEntry.face)
  } finally { f.dispose() }
})
it('rejects coincident face and component hits from different occurrence paths', () => {
  const f = fixture(); try { f.add(['a'], 0); f.add(['b'], 0); expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBeNull(); expect(pickAssemblyComponent(f.camera, f.bodies, pointer, size)).toBeNull() } finally { f.dispose() }
})
it('does not select a face hidden behind another opaque occurrence', () => {
  const f = fixture(); try { const back = f.add(['back'], -3); f.add(['front'], 0); expect(pickAssemblyFace(f.camera, f.bodies, [back.faceEntry], pointer, size)).toBeNull() } finally { f.dispose() }
})
it('does not mistake a coarser same-body display chord for occlusion of its finer face triangles', () => {
  const f = fixture(); try { const target = f.add(['pin'], 0); target.entry.object.position.z += .1
    expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBe(target.faceEntry.face)
    // A nearer mesh of another occurrence still occludes this target face.
    f.add(['other'], .2)
    expect(pickAssemblyFace(f.camera, f.bodies, [target.faceEntry], pointer, size)).toBeNull()
  } finally { f.dispose() }
})
it('excludes hidden occurrence meshes from both picking and occlusion', () => {
  const f = fixture(); try { const back = f.add(['back'], -3); f.add(['hidden'], 0, false); expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBe(back.faceEntry.face); expect(pickAssemblyComponent(f.camera, f.bodies, pointer, size)).toEqual(back.entry.body.component) } finally { f.dispose() }
})
it('keeps an unsupported front surface visible to selection instead of picking a supported face behind it', () => {
  const f = fixture(); try { f.add(['back'], -3); const front = f.add(['front'], 0); front.faceEntry.face.support = null; expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBe(front.faceEntry.face) } finally { f.dispose() }
})
it.each([{ point: { x: -1, y: 50 } }, { point: { x: 50, y: 101 } }, { point: { x: 98, y: 98 } }])('rejects outside-display or empty-space clicks %#', ({ point }) => {
  const f = fixture(); try { f.add(['pin'], 0); expect(pickAssemblyFace(f.camera, f.bodies, f.faces, point, size)).toBeNull(); expect(pickAssemblyComponent(f.camera, f.bodies, point, size)).toBeNull() } finally { f.dispose() }
})
it('preserves exact body state, revision and legacy-null identities in display keys', () => {
  const f = fixture(); try { const a = f.add(['pin'], 0), copy = structuredClone(a.faceEntry.face), original = assemblyFaceKey(copy)
    copy.selection.component.definition.revision = 'r2'; expect(assemblyFaceKey(copy)).not.toBe(original)
    copy.selection.component.definition.revision = 'r1'; copy.selection.body = null; expect(assemblyFaceKey(copy)).not.toBe(original)
    expect(assemblyBodyKey(a.entry.body.component, null)).not.toBe(assemblyBodyKey(a.entry.body.component, a.entry.body.body))
    copy.selection.body = { bodyId: 'shared-body', sourceFeatureId: 'earlier' }; expect(assemblyFaceKey(copy)).not.toBe(original)
  } finally { f.dispose() }
})
it('returns a detached component selection while retaining all nested path segments', () => {
  const f = fixture(); try { const a = f.add(['a', 'nested', 'pin'], 0), result = pickAssemblyComponent(f.camera, f.bodies, pointer, size)!
    result.occurrencePath[0] = 'changed'; expect(a.entry.body.component.occurrencePath).toEqual(['a', 'nested', 'pin'])
  } finally { f.dispose() }
})

function analysisPair(body: AssemblySceneBody): AssemblyInterferencePair {
  const first = { component: structuredClone(body.component), body: structuredClone(body.body), componentName: 'Original chosen component', bodyName: 'Original chosen body' }
  return { id: 'original-world-space-pair', first, second: { ...structuredClone(first), component: { ...structuredClone(first.component), occurrencePath: ['other', 'pin'] } },
    status: 'overlap', intersectionVolume: 2, solidCount: 1, minimumDistance: 0, lengthTolerance: 1e-6, volumeTolerance: 1e-6,
    closestPoints: { first: [8, 21, 30], second: [8, 21, 30] },
    intersectionMesh: { vertices: [8, 21, 30, 8, 23, 30, 6, 21, 30], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] } }
}
function releaseOverlay(group: THREE.Group): void {
  group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose()) } })
}
it('keeps an actual supplied Common triangle in world coordinates instead of applying the component quaternion again', () => {
  const f = fixture(); let group: THREE.Group | null = null
  try {
    const { body } = f.add(['sub-a', 'pin'], 0).entry
    body.worldPose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
    // Independent Z90 + (10,20,30): (1,2,0),(3,2,0),(1,4,0)
    // become (8,21,30),(8,23,30),(6,21,30).
    const pair = analysisPair(body); group = createAssemblyInterferenceOverlay(pair); group.updateMatrixWorld(true)
    const mesh = group.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh
    expect(mesh).toBeDefined(); expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual([8, 21, 30, 8, 23, 30, 6, 21, 30])
    expect(new THREE.Vector3(8, 21, 30).applyMatrix4(mesh.matrixWorld).toArray()).toEqual([8, 21, 30])
    expect(Array.from(mesh.geometry.index!.array)).toEqual([0, 1, 2]); expect((mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xd82d3b)
    expect(assemblyAnalysisBodySelected(body, pair)).toBe(true)
  } finally { if (group) releaseOverlay(group); f.dispose() }
})
it('draws only the two supplied native closest points as a world-space witness line', () => {
  const f = fixture(); let group: THREE.Group | null = null
  try {
    const pair = analysisPair(f.add(['a'], 0).entry.body); pair.status = 'clearance'; pair.solidCount = 0; pair.intersectionVolume = 0
    pair.closestPoints = { first: [10, 20, 30], second: [10, 20, 30.5] }; pair.minimumDistance = .5
    group = createAssemblyInterferenceOverlay(pair)
    expect(group.children).toHaveLength(1); expect(group.children[0]).toBeInstanceOf(THREE.LineSegments)
    expect(Array.from((group.children[0] as THREE.LineSegments).geometry.getAttribute('position').array)).toEqual([10, 20, 30, 10, 20, 30.5])
  } finally { if (group) releaseOverlay(group); f.dispose() }
})
it.each(['contact', 'clearance'] as const)('does not promote a %s witness or incidental mesh metadata to a solid intersection', status => {
  const f = fixture(); let group: THREE.Group | null = null
  try { const pair = analysisPair(f.add(['a'], 0).entry.body); pair.status = status
    group = createAssemblyInterferenceOverlay(pair); expect(group.children.some(object => object instanceof THREE.Mesh)).toBe(false)
  } finally { if (group) releaseOverlay(group); f.dispose() }
})
it('keeps a positive small-overlap mesh visible and withholds it for a non-solid Common result', () => {
  const f = fixture(); let first: THREE.Group | null = null, second: THREE.Group | null = null
  try { const pair = analysisPair(f.add(['a'], 0).entry.body); pair.status = 'small-overlap'; pair.intersectionVolume = 1e-8
    first = createAssemblyInterferenceOverlay(pair); expect(first.children.some(object => object instanceof THREE.Mesh)).toBe(true)
    pair.solidCount = 0; second = createAssemblyInterferenceOverlay(pair); expect(second.children.some(object => object instanceof THREE.Mesh)).toBe(false)
  } finally { if (first) releaseOverlay(first); if (second) releaseOverlay(second); f.dispose() }
})
it.each(['path', 'revision', 'body-state', 'legacy-body'] as const)('does not highlight a different %s using a reused component name', field => {
  const f = fixture()
  try { const body = f.add(['sub', 'pin'], 0).entry.body, pair = analysisPair(body), changed = structuredClone(body)
    if (field === 'path') changed.component.occurrencePath = ['other-sub', 'pin']
    if (field === 'revision') changed.component.definition.revision = 'r2'
    if (field === 'body-state') changed.body!.sourceFeatureId = 'earlier'
    if (field === 'legacy-body') changed.body = null
    expect(assemblyAnalysisBodySelected(changed, pair)).toBe(false); expect(assemblyAnalysisBodySelected(body, pair)).toBe(true)
  } finally { f.dispose() }
})
it('recognizes a selected hidden analysis body without making it pickable or mutating its saved visibility', () => {
  const f = fixture()
  try { const body = f.add(['hidden', 'pin'], 0, false).entry.body, pair = analysisPair(body), before = JSON.stringify(body)
    expect(assemblyAnalysisBodySelected(body, pair)).toBe(true); expect(pickAssemblyComponent(f.camera, f.bodies, pointer, size)).toBeNull()
    expect(pickAssemblyFace(f.camera, f.bodies, f.faces, pointer, size)).toBeNull(); expect(JSON.stringify(body)).toBe(before)
    expect(assemblyAnalysisBodySelected(body, null)).toBe(false)
  } finally { f.dispose() }
})
it('selects both exact bodies of an internal pair without selecting another body of that component', () => {
  const f = fixture()
  try {
    const first = f.add(['one-part'], 0).entry.body, second = structuredClone(first), other = structuredClone(first)
    second.body = { ...first.body!, bodyId: 'second-body' }; other.body = { ...first.body!, bodyId: 'other-body' }
    const pair = analysisPair(first)
    pair.second = { ...structuredClone(pair.first), body: structuredClone(second.body) }
    const before = JSON.stringify([first, second, other, pair])
    expect(assemblyAnalysisBodySelected(first, pair)).toBe(true)
    expect(assemblyAnalysisBodySelected(second, pair)).toBe(true)
    expect(assemblyAnalysisBodySelected(other, pair)).toBe(false)
    expect(JSON.stringify([first, second, other, pair])).toBe(before)
  } finally { f.dispose() }
})
it('copies display buffers without changing the analysis report and clears the overlay when no pair is selected', () => {
  const f = fixture(); let group: THREE.Group | null = null, empty: THREE.Group | null = null
  try { const pair = analysisPair(f.add(['a'], 0).entry.body), before = JSON.stringify(pair)
    group = createAssemblyInterferenceOverlay(pair); const mesh = group.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh
    mesh.geometry.getAttribute('position').setX(0, 999); expect(JSON.stringify(pair)).toBe(before)
    empty = createAssemblyInterferenceOverlay(null); expect(empty.children).toHaveLength(0)
  } finally { if (group) releaseOverlay(group); if (empty) releaseOverlay(empty); f.dispose() }
})
