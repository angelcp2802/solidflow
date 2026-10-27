import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { identityRigidPose } from '../model/rigidPose'
import { buildConfiguredAssemblyScene, type ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'
import type { AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { buildAssemblyScene, MAX_ASSEMBLY_SCENE_NUMBERS, MAX_ASSEMBLY_SCENE_VERTEX_POINTS } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'
import * as placements from './kernel.assembly-placements'

// Existing GPL-3.0-only original core recipe, no external CAD data:
// A[0,2]×[0,3]×[0,4] V24/A52; B[0,1]×[0,2]×[0,5] V10/A34.
// Local S base B.x10 / compact B.x4. Right parent Rz90+[30,0,0].
// All boxes/points below are literal Cartesian oracles, not Core output.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000)
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const near = (actual: readonly number[], expected: readonly number[], tolerance = 1e-6) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => { expect(Number.isFinite(value)).toBe(true); expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(tolerance) })
}
type Box = { path: string; min: number[]; max: number[]; volume: number; area: number }
const A = (owner: string, min: number[], max: number[]): Box => ({ path: owner + '/a', min, max, volume: 24, area: 52 })
const B = (owner: string, min: number[], max: number[]): Box => ({ path: owner + '/b', min, max, volume: 10, area: 34 })
const leftA = A('left', [0, 0, 0], [2, 3, 4]), rightA = A('right', [27, 0, 0], [30, 2, 4])
const leftBaseB = B('left', [10, 0, 0], [11, 2, 5]), leftCompactB = B('left', [4, 0, 0], [5, 2, 5])
const rightBaseB = B('right', [28, 10, 0], [30, 11, 5]), rightCompactB = B('right', [28, 4, 0], [30, 5, 5])
function fixture(selector: string | null = 'mixed'): AssemblyConfigurationGeometryInput {
  return { ...assemblyConfigurationCoreFixture(), rootConfiguration: selector, generation: 23 }
}
function geometry(output: ConfiguredAssemblyScene, expected: Box[], volume: number, area: number) {
  const scene = output.scene
  expect(output.kind).toBe('configured-assembly-scene'); expect(scene.kind).toBe('assembly-scene')
  expect(scene.warnings).toEqual([]); expect(scene.bodies).toHaveLength(expected.length); expect(scene.solidCount).toBe(expected.length)
  expect(scene.bodies.map(body => body.component.occurrencePath.join('/')).sort()).toEqual(expected.map(box => box.path).sort())
  near([scene.volume, scene.area], [volume, area], 1e-5)
  for (const box of expected) {
    const rows = scene.bodies.filter(body => body.component.occurrencePath.join('/') === box.path)
    expect(rows).toHaveLength(1); const body = rows[0]
    near(body.bounds.min, box.min); near(body.bounds.max, box.max); near([body.volume, body.area], [box.volume, box.area], 1e-5)
    expect(body.solidCount).toBe(1); expect(body.vertices.length).toBeGreaterThan(0); expect(body.normals).toHaveLength(body.vertices.length)
    expect(body.triangles.length).toBeGreaterThan(0); expect(body.faces).toHaveLength(6)
    expect(body.configurationAncestry.map(a => a.path)).toEqual([[], [box.path.split('/')[0]]])
  }
}

it.each([
  { selector: null, boxes: [leftA, leftBaseB, rightA, rightBaseB], volume: 68, area: 172 },
  { selector: 'mixed', boxes: [leftA, leftBaseB, rightA, rightCompactB], volume: 68, area: 172 },
  { selector: 'both-compact', boxes: [leftA, leftCompactB, rightA, rightCompactB], volume: 68, area: 172 },
  { selector: 'single-right', boxes: [leftA, leftBaseB, rightA], volume: 58, area: 138 },
])('builds actual configured BReps for $selector with literal native totals and placements', ({ selector, boxes, volume, area }) => {
  const input = fixture(selector), before = clone(input), build = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const result = buildConfiguredAssemblyScene(input)
    geometry(result, boxes, volume, area); expect(result.scene.prototypeCount).toBe(2); expect(build).toHaveBeenCalledTimes(2)
    expect(result.context).toEqual({ root: { id: input.document.id, revision: input.document.revision }, generation: 23, rootConfiguration: selector,
      sourceSignature: JSON.stringify(evaluateAssemblyConfiguration(input.document, input.catalog, selector).source), catalogSignature: JSON.stringify(evaluateAssemblyConfiguration(input.document, input.catalog, selector).catalog) })
    expect(input).toEqual(before)
  } finally { build.mockRestore() }
}, 60_000)

it('retains legacy base scene values exactly when no configuration catalog or selector is present', () => {
  const input = fixture(null); input.catalog = []
  const saved = serializeAssemblyDocument(input.document), legacy = buildAssemblyScene(input.document), configured = buildConfiguredAssemblyScene(input)
  const { sceneId: legacyId, ...oldGeometry } = legacy
  const { sceneId: newId, bodies, ...newGeometry } = configured.scene
  expect(legacyId).not.toBe(newId)
  expect({ ...newGeometry, bodies: bodies.map(({ configurationAncestry: _ancestry, ...body }) => body) }).toEqual(oldGeometry)
  expect(serializeAssemblyDocument(input.document)).toBe(saved)
}, 60_000)

it('reuses local topology identities while placing native normals, vertices and meshes in the actual selected root frame', () => {
  const input = fixture('both-compact'), result = buildConfiguredAssemblyScene(input)
  const left = result.scene.bodies.find(body => body.component.occurrencePath.join('/') === 'left/b')!, right = result.scene.bodies.find(body => body.component.occurrencePath.join('/') === 'right/b')!
  expect(left.faces.map(face => face.selection.face)).toEqual(right.faces.map(face => face.selection.face))
  expect(left.body).toEqual(right.body); expect(left.component).not.toEqual(right.component)
  expect(left.configurationAncestry[1].configuration).toBe('compact'); expect(right.configurationAncestry[1].configuration).toBe('compact')
  const corner = right.vertexPoints!.filter(vertex => vertex.point.every((v, i) => Math.abs(v - [1, 2, 5][i]) < 1e-10))
  expect(corner).toHaveLength(1); near(corner[0].worldPoint, [28, 5, 5])
  const faces = right.faces.filter(face => face.support?.kind === 'plane' && face.support.normal[0] > .99)
  expect(faces).toHaveLength(1)
  if (faces[0].worldSupport?.kind !== 'plane') throw Error('Actual native plane absent')
  near(faces[0].worldSupport.normal, [0, 1, 0], 1e-10)
  for (let i = 0; i < left.faces.length; i++) {
    // Left compact vertex world = local+[4,0,0]. Right is (-y,localX+4,z)+[30,0,0].
    const source = left.faces[i].vertices, expected = source.flatMap((_, j) => j % 3 ? [] : [30 - source[j + 1], source[j], source[j + 2]])
    near(right.faces[i].vertices, expected, 1e-8)
  }
}, 60_000)

it('keeps hidden effective occurrences in material totals but excludes them only from visible bounds', () => {
  const input = fixture('both-compact'), row = input.catalog[0].configurations.find(c => c.id === 'both-compact')!
  row.occurrences.find(o => o.occurrenceId === 'right')!.visible = false
  const result = buildConfiguredAssemblyScene(input)
  geometry(result, [leftA, leftCompactB, rightA, rightCompactB], 68, 172)
  expect(result.scene.bodies.filter(b => b.visible).map(b => b.component.occurrencePath.join('/'))).toEqual(['left/a', 'left/b'])
  near(result.scene.visibleBounds!.min, [0, 0, 0]); near(result.scene.visibleBounds!.max, [5, 3, 5])
  row.occurrences.find(o => o.occurrenceId === 'left')!.visible = false
  const hidden = buildConfiguredAssemblyScene(input)
  expect(hidden.scene.visibleBounds).toBeNull(); expect(hidden.scene.bounds).not.toBeNull(); near([hidden.scene.volume, hidden.scene.area], [68, 172], 1e-5)
}, 60_000)

it('omits a suppressed effective scope without removing its source declarations', () => {
  const input = fixture('both-compact'), row = input.catalog[0].configurations.find(c => c.id === 'both-compact')!
  row.occurrences.find(o => o.occurrenceId === 'right')!.suppressed = true
  const before = clone(input), result = buildConfiguredAssemblyScene(input)
  geometry(result, [leftA, leftCompactB], 34, 86); expect(result.scene.prototypeCount).toBe(2)
  expect(input).toEqual(before); expect(input.document.occurrences).toHaveLength(2)
}, 60_000)

it('does not allocate a prototype used only by suppressed effective leaves', () => {
  const input = fixture('only-a')
  input.catalog[0].configurations.push({ id: 'only-a', name: 'Original A uses only', occurrences: ['left', 'right'].map(occurrenceId => ({ occurrenceId, configuration: 'single' })), mates: [] })
  const build = vi.spyOn(CadEngine.prototype, 'build')
  try { const result = buildConfiguredAssemblyScene(input); geometry(result, [leftA, rightA], 48, 104); expect(result.scene.prototypeCount).toBe(1); expect(build).toHaveBeenCalledTimes(1) }
  finally { build.mockRestore() }
}, 60_000)

it('places the same reused states under a literal noncommuting proper 3D gauge', () => {
  const input = fixture('mixed')
  input.document.occurrences[0].pose = { translation: [7, -11, 13], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  input.document.occurrences[1].pose = { translation: [37, -11, 13], rotation: [.5, -.5, .5, .5] }
  // Independent Rx90 maps(x,y,z)->(x,-z,y), then translation.
  const expected = [leftA, leftBaseB, rightA, rightCompactB].map(box => ({ ...box, min: [box.min[0] + 7, -box.max[2] - 11, box.min[1] + 13], max: [box.max[0] + 7, -box.min[2] - 11, box.max[1] + 13] }))
  const before = clone(input), result = buildConfiguredAssemblyScene(input)
  geometry(result, expected, 68, 172); expect(input).toEqual(before)
  const body = result.scene.bodies.find(b => b.component.occurrencePath.join('/') === 'right/b')!
  const corner = body.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [1, 2, 5][i]) < 1e-10))!
  near(corner.worldPoint, [35, -16, 18])
}, 60_000)

it('publishes detached frozen scene context while changed source content under the same tuple gets a distinct signature and geometry', () => {
  const input = fixture(), original = buildConfiguredAssemblyScene(input), signature = original.context.sourceSignature
  expect(Object.isFrozen(original)).toBe(true); expect(Object.isFrozen(original.scene.bodies[0].faces[0].selection.component)).toBe(true)
  expect(Object.isFrozen(original.scene.bodies[0].configurationAncestry)).toBe(true); expect(() => structuredClone(original)).not.toThrow()
  const a = input.document.definitions.find(d => d.id === 'configuration-A')!
  if (a.kind !== 'part' || a.document.features[1].type !== 'extrude') throw Error('Original A missing')
  a.document.features[1].depth = 6
  const changed = buildConfiguredAssemblyScene(input)
  expect(original.context.sourceSignature).toBe(signature); near([original.scene.volume, original.scene.area], [68, 172], 1e-5)
  expect(changed.context.sourceSignature).not.toBe(signature); expect(changed.context.catalogSignature).toBe(original.context.catalogSignature)
  expect(changed.context.root).toEqual(original.context.root); expect(changed.context.generation).toBe(original.context.generation)
  expect(changed.scene.sceneId).not.toBe(original.scene.sceneId); near([changed.scene.volume, changed.scene.area], [92, 212], 1e-5)
}, 60_000)

it('returns explicit unresolved relation diagnostics alongside renderable geometry without pretending to verify a relation', () => {
  const input = fixture(), definition = { id: 'configuration-A', revision: 'r1' }
  input.document.mates = [{ id: 'original-unresolved-lock', name: 'Unresolved original lock', type: 'lock', suppressed: false,
    first: { occurrencePath: ['missing'], definition }, second: { occurrencePath: ['left', 'a'], definition }, relativePose: identityRigidPose() }]
  const result = buildConfiguredAssemblyScene(input)
  geometry(result, [leftA, leftBaseB, rightA, rightCompactB], 68, 172)
  expect(result.referenceDiagnostics).toHaveLength(1); expect(result.referenceDiagnostics[0]).toMatchObject({ mateId: 'original-unresolved-lock', problem: 'missing-occurrence', path: ['missing'] })
  expect(Object.hasOwn(result, 'satisfied')).toBe(false); expect(Object.hasOwn(result, 'token')).toBe(false)
}, 60_000)

it.each(['document', 'catalog', 'rootConfiguration', 'generation'] as const)('withholds the entire scene when an actual native query changes %s during construction', field => {
  const input = fixture(), original = CadEngine.prototype.inspectCurrentFaceSupport
  let changed = false, published: unknown
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = original.apply(this, args)
    if (!changed) {
      changed = true
      if (field === 'document') input.document.name += ' changed'
      if (field === 'catalog') input.catalog[0].configurations[0].name += ' changed'
      if (field === 'rootConfiguration') input.rootConfiguration = 'both-compact'
      if (field === 'generation') input.generation++
    }
    return result
  })
  try { expect(() => { published = buildConfiguredAssemblyScene(input) }).toThrow(/context changed/); expect(changed).toBe(true); expect(published).toBeUndefined() }
  finally { query.mockRestore() }
}, 60_000)

it('rejects executable or invalid dormant declarations before any native build', () => {
  const build = vi.spyOn(CadEngine.prototype, 'build'); let reads = 0
  try {
    const input = fixture(); Object.defineProperty(input, 'catalog', { enumerable: true, get() { reads++; throw Error('Getter must not run') } })
    expect(() => buildConfiguredAssemblyScene(input)).toThrow(); expect(reads).toBe(0)
    const dormant = fixture(); dormant.catalog[1].configurations[1].occurrences[0].occurrenceId = 'missing'
    expect(() => buildConfiguredAssemblyScene(dormant)).toThrow(); expect(build).not.toHaveBeenCalled()
  } finally { build.mockRestore() }
})

it('rejects expanded world overflow before native allocation rather than trusting only finite declarations', () => {
  const input = fixture(null), s = input.document.definitions.find(d => d.kind === 'assembly')!
  if (s.kind !== 'assembly') throw Error('S')
  input.document.occurrences[0].pose.translation = [Number.MAX_VALUE, 0, 0]
  s.occurrences[0].pose.translation = [Number.MAX_VALUE, 0, 0]
  const build = vi.spyOn(CadEngine.prototype, 'build')
  try { expect(() => buildConfiguredAssemblyScene(input)).toThrow(); expect(build).not.toHaveBeenCalled() } finally { build.mockRestore() }
})

it('retains native numeric display caps after actual mesh retrieval', () => {
  const input = fixture(), original = placements.placeAssemblyShapeChecked
  const place = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    const placed = original(source, pose), shape = placed.shape, mesh = shape.mesh.bind(shape)
    vi.spyOn(shape, 'mesh').mockImplementation(options => { const result = mesh(options); return { ...result, vertices: Array(MAX_ASSEMBLY_SCENE_NUMBERS + 2).fill(result.vertices[0]) } })
    return placed
  })
  try { expect(() => buildConfiguredAssemblyScene(input)).toThrow(/presupuesto de números/) } finally { place.mockRestore() }
}, 60_000)

it('omits a whole oversized optional prototype point catalog while keeping its actual BRep geometry', () => {
  const input = fixture(), actual = CadEngine.prototype.build
  const build = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function (this: CadEngine, ...args) {
    const result = actual.apply(this, args)
    expect(result.bodyCatalogActive).toBe(false)
    return { ...result, vertexPoints: Array(MAX_ASSEMBLY_SCENE_VERTEX_POINTS + 1).fill(result.vertexPoints![0]) }
  })
  try {
    const result = buildConfiguredAssemblyScene(input)
    near([result.scene.volume, result.scene.area], [68, 172], 1e-5); expect(result.scene.solidCount).toBe(4)
    expect(result.scene.bodies.every(body => body.vertexPoints!.length === 0)).toBe(true)
    expect(result.scene.warnings.filter(w => w.includes('catálogo opcional'))).toHaveLength(2)
  } finally { build.mockRestore() }
}, 60_000)

it('withholds all earlier bodies when a later actual placed mesh and native release both fail', () => {
  const input = fixture(), before = clone(input), realPlace = placements.placeAssemblyShapeChecked, realBuild = CadEngine.prototype.build
  const primary = Error('Original configured placed mesh failure'), cleanup = Error('Original configured placed release failure'), engines: CadEngine[] = []
  let count = 0, released = 0, candidate: Shape3D | undefined, published: unknown, caught: unknown
  const build = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function (this: CadEngine, ...args) { engines.push(this); return realBuild.apply(this, args) })
  const place = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    const placed = realPlace(source, pose), shape = placed.shape
    if (++count === 4) {
      const mesh = shape.mesh.bind(shape), remove = shape.delete.bind(shape); candidate = shape
      vi.spyOn(shape, 'mesh').mockImplementation(options => { mesh(options); throw primary })
      vi.spyOn(shape, 'delete').mockImplementation(() => { released++; remove(); throw cleanup })
    }
    return placed
  })
  const errors = (e: unknown): unknown[] => [e, ...(e instanceof AggregateError ? e.errors.flatMap(errors) : [])]
  try {
    try { published = buildConfiguredAssemblyScene(input) } catch (e) { caught = e }
    expect(candidate).toBeDefined(); expect(caught).toBeInstanceOf(NativeCleanupError); expect(errors(caught)).toContain(primary); expect(errors(caught)).toContain(cleanup)
    expect(released).toBe(1); expect(engines).toHaveLength(2); for (const engine of engines) expect(() => engine.copyCurrentBodyShape(null)).toThrow()
    expect(published).toBeUndefined(); expect(input).toEqual(before)
  } finally { place.mockRestore(); build.mockRestore() }
}, 60_000)
