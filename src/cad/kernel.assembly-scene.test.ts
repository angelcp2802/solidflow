import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { pickAssemblyFace } from '../components/AssemblyViewport'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { identityRigidPose } from '../model/rigidPose'
import { buildAssemblyScene, MAX_ASSEMBLY_SCENE_NUMBERS } from './kernel.assembly-scene'
import { assemblySceneFaceReference } from './kernel.assembly-types'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'
import { UnsupportedAssemblySurfaceError } from './kernel.assembly-supports'
import * as placements from './kernel.assembly-placements'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
function placed(): AssemblyDocument {
  const input = createAssemblyExample()
  input.occurrences[1].pose = { translation: [-10, 0, -8], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  input.occurrences[2].pose = { translation: [10, 0, -8], rotation: [0, 0, 0, 1] }
  return input // Declared inputs to a display builder, not solved fixture seeds.
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-6) {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThan(tolerance))
}
const errors = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(errors)] : [error]

it('builds independent native scene occurrences with exact analytical sums and bounds, reusing two prototypes', () => {
  const input = placed(), before = serializeAssemblyDocument(input), build = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const scene = buildAssemblyScene(input)
    expect(scene.kind).toBe('assembly-scene'); expect(scene.bodies).toHaveLength(3); expect(scene.prototypeCount).toBe(2); expect(build).toHaveBeenCalledTimes(2)
    expect(scene.solidCount).toBe(3); expect(Math.abs(scene.volume - (4800 + 45 * Math.PI / 2))).toBeLessThan(1e-5)
    expect(Math.abs(scene.area - (2960 + 543 * Math.PI / 4))).toBeLessThan(1e-5)
    near(scene.bounds!.min, [-20, -15, -8]); near(scene.bounds!.max, [20, 15, 4])
    for (const body of scene.bodies) {
      expect(body.vertices.length).toBeGreaterThan(0); expect(body.normals).toHaveLength(body.vertices.length); expect(body.triangles.length).toBeGreaterThan(0)
      expect(body.solidCount).toBe(1); expect(body.faces.length).toBeGreaterThan(0)
    }
    const pins = scene.bodies.filter(body => body.component.definition.id === 'example-pin')
    for (const pin of pins) {
      const x = pin.component.occurrencePath[0] === 'left' ? -10 : 10
      near(pin.bounds.min, [x - 2, -2, -8]); near(pin.bounds.max, [x + 2, 2, 4])
      expect(Math.abs(pin.volume - 189 * Math.PI / 4)).toBeLessThan(1e-5); expect(Math.abs(pin.area - 495 * Math.PI / 8)).toBeLessThan(1e-5)
    }
    expect(serializeAssemblyDocument(input)).toBe(before); expect(() => structuredClone(scene)).not.toThrow()
  } finally { build.mockRestore() }
}, 60_000)

it('keeps prototype-local face keys distinct by occurrence and transforms picking meshes with the independent Z90 map', () => {
  const input = placed(), scene = buildAssemblyScene(input), left = scene.bodies.find(body => body.component.occurrencePath[0] === 'left')!, right = scene.bodies.find(body => body.component.occurrencePath[0] === 'right')!
  expect(left.faces.map(face => face.selection.face)).toEqual(right.faces.map(face => face.selection.face))
  for (let i = 0; i < left.faces.length; i++) {
    const a = left.faces[i], b = right.faces[i]
    expect(a.selection.component.occurrencePath).toEqual(['left']); expect(b.selection.component.occurrencePath).toEqual(['right'])
    expect(a.selection.body).toEqual({ bodyId: 'pin-body', sourceFeatureId: 'bore' }); expect(a.triangles).toEqual(b.triangles)
    const expected = b.vertices.flatMap((_, j) => j % 3 ? [] : [-b.vertices[j + 1] - 10, b.vertices[j] - 10, b.vertices[j + 2]])
    near(a.vertices, expected, 1e-8)
  }
  const a = left.faces.find(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - .25) < 1e-12)!, b = right.faces.find(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - .25) < 1e-12)!
  near(a.worldSupport!.point.slice(0, 2), [-10, 1], 1e-9); near(b.worldSupport!.point.slice(0, 2), [11, 0], 1e-9)
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const reference = assemblySceneFaceReference(a)!, witness = snapshot.resolveReference(input, reference)
    expect(witness.componentPath).toEqual(['left']); expect(witness.kind).toBe('support')
    const invalid = structuredClone(reference); invalid.body = { ...invalid.body!, sourceFeatureId: 'base' }
    expect(() => snapshot.resolveReference(input, invalid)).toThrow()
  } finally { snapshot.dispose() }
}, 60_000)

it('keeps hidden occurrences in native material totals while suppression excludes them from the scene', () => {
  const input = placed(); input.occurrences[1].visible = input.occurrences[2].visible = false
  const hidden = buildAssemblyScene(input)
  expect(hidden.bodies).toHaveLength(3); expect(hidden.bodies.filter(body => body.visible)).toHaveLength(1)
  expect(hidden.solidCount).toBe(3); near(hidden.visibleBounds!.min, [-20, -15, 0]); near(hidden.visibleBounds!.max, [20, 15, 4])
  input.occurrences[1].suppressed = true
  const suppressed = buildAssemblyScene(input)
  expect(suppressed.bodies).toHaveLength(2); expect(suppressed.solidCount).toBe(2)
  expect(Math.abs(suppressed.volume - (4800 - 99 * Math.PI / 4))).toBeLessThan(1e-5)
  input.occurrences.forEach(occurrence => occurrence.visible = false)
  expect(buildAssemblyScene(input).visibleBounds).toBeNull()
}, 60_000)

it('has explicit empty and all-suppressed scenes without manufacturing native bodies', () => {
  const empty = buildAssemblyScene(createEmptyAssembly())
  expect(empty.bodies).toEqual([]); expect(empty.bounds).toBeNull(); expect(empty.volume).toBe(0); expect(empty.prototypeCount).toBe(0)
  const input = placed(); input.occurrences.forEach(occurrence => occurrence.suppressed = true)
  const scene = buildAssemblyScene(input); expect(scene.bodies).toEqual([]); expect(scene.solidCount).toBe(0); expect(scene.bounds).toBeNull()
}, 60_000)

it('composes a reused nested source with independent Cartesian parent/local coordinates and inherited state', () => {
  const input = placed(), child = { ...input.occurrences[1], id: 'child', pose: { ...identityRigidPose(), translation: [1, 2, 3] as [number, number, number] } }
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original nested render source', createdAt: input.createdAt,
    updatedAt: input.updatedAt, occurrences: [child], mates: [] })
  const a = { ...input.occurrences[1], id: 'sub-a', definition: { id: 'sub', revision: 'r1' }, pose: { translation: [4, 5, 6] as [number, number, number], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] } },
    b = { ...a, id: 'sub-b', visible: false, pose: { ...identityRigidPose(), translation: [-4, -5, -6] as [number, number, number] } }
  input.occurrences = [a, b]
  const scene = buildAssemblyScene(input)
  expect(scene.prototypeCount).toBe(1); expect(scene.bodies.map(body => body.component.occurrencePath)).toEqual([['sub-a', 'child'], ['sub-b', 'child']])
  near(scene.bodies[0].worldPose.translation, [2, 6, 9]); near(scene.bodies[0].bounds.min, [0, 4, 9]); near(scene.bodies[0].bounds.max, [4, 8, 21])
  near(scene.bodies[1].worldPose.translation, [-3, -3, -3]); near(scene.bodies[1].bounds.min, [-5, -5, -3]); near(scene.bodies[1].bounds.max, [-1, -1, 9])
  expect(scene.bodies[1].visible).toBe(false)
}, 60_000)

it('keeps separate exact body states in two reused multibody parts, without inventing occurrence body identities', () => {
  const input = createEmptyAssembly(), stamp = input.createdAt
  const definition: EmbeddedPartDefinition = { kind: 'part', id: 'two-boxes', revision: 'r1', document: validateDocument({ version: 1,
    id: 'two-boxes', name: 'Original two boxes', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [0, 1].flatMap(i => [
      { id: 'profile-' + i, name: 'Box profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [10 * i, 0], width: 2, height: 3 } },
      { id: 'create-' + i, name: 'Separate box', type: 'extrude', sketchId: 'profile-' + i, depth: 4, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId: 'body-' + i } },
    ]) }) }
  input.definitions = [definition]
  input.occurrences = ['a', 'b'].map(id => ({ id, name: id, definition: { id: 'two-boxes', revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }))
  const scene = buildAssemblyScene(input)
  expect(scene.prototypeCount).toBe(1); expect(scene.bodies).toHaveLength(4); expect(scene.solidCount).toBe(4)
  expect(Math.abs(scene.volume - 96)).toBeLessThan(1e-5); expect(Math.abs(scene.area - 208)).toBeLessThan(1e-5)
  expect(scene.bodies.map(body => body.body)).toEqual([{ bodyId: 'body-0', sourceFeatureId: 'create-0' }, { bodyId: 'body-1', sourceFeatureId: 'create-1' },
    { bodyId: 'body-0', sourceFeatureId: 'create-0' }, { bodyId: 'body-1', sourceFeatureId: 'create-1' }])
  expect(new Set(scene.bodies.map(body => JSON.stringify([body.component.occurrencePath, body.body]))).size).toBe(4)
}, 60_000)

it('retains null aggregate identity for a legacy single-solid part', () => {
  const input = placed(); input.occurrences = [input.occurrences[1]]
  const part = input.definitions.find(definition => definition.id === 'example-pin')!
  if (part.kind !== 'part') throw new Error('Expected part')
  for (const feature of part.document.features) {
    if (feature.type === 'extrude') delete feature.bodyOperation
    if (feature.type === 'cut') delete feature.bodyScope
  }
  const scene = buildAssemblyScene(input)
  expect(scene.bodies).toHaveLength(1); expect(scene.bodies[0].body).toBeNull(); expect(scene.bodies[0].faces.every(face => face.selection.body === null)).toBe(true)
  expect(Math.abs(scene.volume - 189 * Math.PI / 4)).toBeLessThan(1e-5)
}, 60_000)

it('withholds the complete scene when a source has a real later failed feature', () => {
  const input = placed(), part = input.definitions.find(definition => definition.id === 'example-pin')!
  if (part.kind !== 'part') throw new Error('Expected part')
  part.document.features.push({ id: 'remote-profile', name: 'Original remote cut', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'remote-cut', name: 'Rejected remote cut', type: 'cut', sketchId: 'remote-profile', depth: 12, symmetric: false, suppressed: false,
    bodyScope: [{ bodyId: 'pin-body', sourceFeatureId: 'bore' }] })
  const before = serializeAssemblyDocument(input)
  expect(() => buildAssemblyScene(input)).toThrow('No se pudo reconstruir'); expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('skips only an explicitly typed unsupported classification after a real native query; other query failures stay fatal', () => {
  const input = placed(), real = CadEngine.prototype.inspectCurrentFaceSupport, primary = new Error('Original face query fault')
  let spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function(this: CadEngine, face, body) {
    real.call(this, face, body); throw new UnsupportedAssemblySurfaceError()
  })
  try { const scene = buildAssemblyScene(input); expect(scene.bodies.flatMap(body => body.faces).every(face => face.support === null && assemblySceneFaceReference(face) === null)).toBe(true) }
  finally { spy.mockRestore() }
  spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function(this: CadEngine, face, body) { real.call(this, face, body); throw primary })
  try { expect(() => buildAssemblyScene(input)).toThrow(primary) } finally { spy.mockRestore() }
}, 60_000)

it('releases the actual placed owner and all prototypes when real mesh retrieval then cleanup fail', () => {
  const input = placed(), original = placements.placeAssemblyShapeChecked, primary = new Error('Original placed mesh fault'), cleanup = new Error('Original placed release fault')
  const realBuild = CadEngine.prototype.build, engines: CadEngine[] = []
  const builds = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function(this: CadEngine, features) { engines.push(this); return realBuild.call(this, features) })
  let released = 0, placedCount = 0, candidate: Shape3D | null = null
  const spy = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    const placed = original(source, pose), shape = placed.shape
    if (++placedCount === 1) return placed // Fail after both real prototypes exist.
    const mesh = shape.mesh.bind(shape), remove = shape.delete.bind(shape); candidate = shape
    vi.spyOn(shape, 'mesh').mockImplementation(options => { mesh(options); throw primary })
    vi.spyOn(shape, 'delete').mockImplementation(() => { released++; remove(); throw cleanup })
    return placed
  })
  try {
    let failure: unknown
    try { buildAssemblyScene(input) } catch (error) { failure = error }
    expect(candidate).not.toBeNull(); expect(failure).toBeInstanceOf(NativeCleanupError); expect(errors(failure)).toContain(primary); expect(errors(failure)).toContain(cleanup); expect(released).toBe(1)
    expect(engines).toHaveLength(2)
    for (const engine of engines) expect(() => engine.copyCurrentBodyShape(null)).toThrow('reconstrucción completa')
  } finally { spy.mockRestore(); builds.mockRestore() }
  expect(buildAssemblyScene(input).solidCount).toBe(3)
}, 60_000)

it('rejects an oversized numeric display response after a real mesh query instead of clipping it', () => {
  const input = placed(), original = placements.placeAssemblyShapeChecked
  const spy = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    const placed = original(source, pose), shape = placed.shape, mesh = shape.mesh.bind(shape)
    vi.spyOn(shape, 'mesh').mockImplementation(options => { const real = mesh(options); return { ...real, vertices: Array(MAX_ASSEMBLY_SCENE_NUMBERS + 2).fill(real.vertices[0]) } })
    return placed
  })
  try { expect(() => buildAssemblyScene(input)).toThrow('presupuesto de números') } finally { spy.mockRestore() }
}, 60_000)

it('changes display generation and actual geometry when source content changes under the same revision label', () => {
  const input = placed(), first = buildAssemblyScene(input), changed = validateAssemblyDocument(input), pin = changed.definitions.find(definition => definition.id === 'example-pin')!
  if (pin.kind !== 'part' || pin.document.features[0].type !== 'sketch' || pin.document.features[0].profile.kind !== 'circle') throw new Error('Expected original circle')
  pin.document.features[0].profile.radius = 2.5
  const second = buildAssemblyScene(changed)
  expect(first.sceneId).not.toBe(second.sceneId); expect(Math.abs(second.volume - (4800 + 153 * Math.PI / 2))).toBeLessThan(1e-5)
  expect(second.bodies.filter(body => body.component.definition.id === 'example-pin').every(body => body.component.definition.revision === 'r1')).toBe(true)
}, 60_000)

it('picks a real concave cylindrical wall through native body and prototype-face meshes with complete scope', () => {
  const input = placed(); input.occurrences[1].suppressed = input.occurrences[2].suppressed = true
  const scene = buildAssemblyScene(input), geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const mesh = (vertices: number[], triangles: number[]) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(triangles)
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); geometries.push(geometry); materials.push(material)
    return new THREE.Mesh(geometry, material)
  }
  try {
    const bodies = scene.bodies.map(body => ({ body, object: mesh(body.vertices, body.triangles) })),
      faces = scene.bodies.flatMap(body => body.faces.map(face => ({ face, object: mesh(face.vertices, face.triangles) })))
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 20)
    camera.position.set(-10, 0, 2); camera.up.set(0, 0, 1); camera.lookAt(-10 + Math.cos(.14), Math.sin(.14), 2); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
    const face = pickAssemblyFace(camera, bodies, faces, { x: 50, y: 50 }, { width: 100, height: 100 })
    expect(face).not.toBeNull(); expect(face!.selection.component.occurrencePath).toEqual(['plate'])
    expect(face!.support?.kind).toBe('cylinder'); if (face!.support?.kind !== 'cylinder') throw new Error('Expected actual hole cylinder')
    expect(face!.support.radius).toBeCloseTo(3, 12); expect(face!.support.point[0]).toBeCloseTo(-10, 9)
    bodies[0].body.visible = false; expect(pickAssemblyFace(camera, bodies, faces, { x: 50, y: 50 }, { width: 100, height: 100 })).toBeNull()
  } finally { geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()) }
}, 60_000)
