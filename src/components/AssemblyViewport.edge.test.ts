import { expect, it } from 'vitest'
import * as THREE from 'three'
import { assemblyEdgeKey, pickAssemblyEdge, type AssemblyPickBody, type AssemblyPickEdge } from './AssemblyViewport'
import type { AssemblySceneEdge, AssemblySceneBody } from '../cad/kernel.assembly-types'
import { identityRigidPose } from '../model/rigidPose'

// Original display primitives exercise picking identity/occlusion, not native support authority.
function fixture() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 100); camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix()
  const bodies: AssemblyPickBody[] = [], edges: AssemblyPickEdge[] = []
  function add(path: string[], z = 0, visible = true) {
    const component = { occurrencePath: path, definition: { id: 'original-reused', revision: 'r1' } }, bodyRef = { bodyId: 'original-body', sourceFeatureId: 'final' }
    const edge: AssemblySceneEdge = { selection: { component, body: bodyRef, edge: { sourceFeatureId: 'final', key: 'edge-v1|original' } },
      support: { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null, lines: [-1, 0, z + .5, 1, 0, z + .5] }
    const body: AssemblySceneBody = { component, body: bodyRef, name: path.join('/'), visible, worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [], faces: [], edges: [edge], volume: 4, area: 16, solidCount: 1, bounds: { min: [-1, -1, z - .5], max: [1, 1, z + .5] } }
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); object.position.z = z
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(edge.lines, 3))
    const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial())
    bodies.push({ body, object }); edges.push({ edge, object: line }); return edge
  }
  return { camera, bodies, edges, add, dispose: () => [...bodies, ...edges].forEach(({ object }) => { object.geometry.dispose(); (object.material as THREE.Material).dispose() }) }
}
const point = { x: 50, y: 50 }, size = { width: 100, height: 100 }
it('selects a native-edge DTO by its complete occurrence identity independently of array order', () => {
  const f = fixture(); try { f.add(['a', 'rack'], -3); const front = f.add(['b', 'rack'])
    expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, point, size)).toBe(front)
    f.bodies.reverse(); f.edges.reverse(); expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, point, size)).toBe(front)
  } finally { f.dispose() }
})
it('rejects coincident edges from distinct occurrence paths rather than choosing the first', () => {
  const f = fixture(); try { f.add(['a']); f.add(['b']); expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, point, size)).toBeNull() } finally { f.dispose() }
})
it('does not select an edge through another opaque body', () => {
  const f = fixture(); try { f.add(['back'], -3); const only = [f.edges[0]]; f.add(['front']); expect(pickAssemblyEdge(f.camera, f.bodies, only, point, size)).toBeNull() } finally { f.dispose() }
})
it('excludes hidden bodies and their edges from picking and occlusion', () => {
  const f = fixture(); try { const back = f.add(['back'], -3); f.add(['hidden'], 0, false); expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, point, size)).toBe(back) } finally { f.dispose() }
})
it('requires an actual line support even when a decorative segment is straight', () => {
  const f = fixture(); try { const edge = f.add(['rack']); edge.support = null; expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, point, size)).toBeNull() } finally { f.dispose() }
})
it.each([{ x: -1, y: 50 }, { x: 50, y: 101 }, { x: 95, y: 95 }])('rejects outside/empty pixel location %j', pointer => {
  const f = fixture(); try { f.add(['rack']); expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, pointer, size)).toBeNull() } finally { f.dispose() }
})
it('uses world edge buffers without applying occurrence metadata a second time', () => {
  const f = fixture(); try { const edge = f.add(['rack']); f.bodies[0].body.worldPose.translation = [100, 200, 300]
    expect(pickAssemblyEdge(f.camera, f.bodies, f.edges, point, size)).toBe(edge)
  } finally { f.dispose() }
})
it.each(['path', 'revision', 'body', 'body-state', 'edge-state', 'edge-key'] as const)('distinguishes exact %s in an edge key', field => {
  const f = fixture(); try { const original = f.add(['rack']), changed = structuredClone(original)
    if (field === 'path') changed.selection.component.occurrencePath = ['other', 'rack']
    else if (field === 'revision') changed.selection.component.definition.revision = 'r2'
    else if (field === 'body') changed.selection.body = null
    else if (field === 'body-state') changed.selection.body!.sourceFeatureId = 'earlier'
    else if (field === 'edge-state') changed.selection.edge.sourceFeatureId = 'earlier'
    else changed.selection.edge.key += 'changed'
    expect(assemblyEdgeKey(changed)).not.toBe(assemblyEdgeKey(original))
  } finally { f.dispose() }
})
