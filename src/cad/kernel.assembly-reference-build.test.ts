import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { Shape, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type AnyShape } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateDocument } from '../model/document'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { CadEngine, type AssemblyReferenceInventory } from './kernel.engine'
import { AssemblyGeometrySnapshot, MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES, MAX_ASSEMBLY_NATIVE_FACE_REFERENCES } from './kernel.assembly-snapshot'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { UnsupportedAssemblyCurveError } from './kernel.assembly-supports'
import * as supports from './kernel.assembly-supports'
import { validateAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners } from './kernel.native-ownership'
import * as provenance from './kernel.provenance'
import * as semantic from './kernel.semantic-catalogs'
import type { BodyReference, CadResult, EdgeReference, FaceReference, Feature, PickableEdge, PickableFace } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

// Original millimetre fixtures authored here: a 10×6×4 rectangular prism,
// and, for explicit bodies, an independent R2×12 cylinder centred at (20,0).
// Independent oracles are V=240/A=248 and V=48π/A=56π respectively.
type Family = 'legacy' | 'semantic' | 'explicit'
const stamp = '2026-10-16T00:00:00.000Z'
function features(family: Family): Feature[] {
  const explicit = family === 'explicit'
  const result: Feature[] = [
    { id: 'profile', name: 'Original 10 by 6 profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: family === 'semantic'
        ? { kind: 'entities', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 10, y: 6 }, { id: 'd', x: 0, y: 6 }],
          entities: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([start, end], i) => ({ id: 'side-' + i, type: 'line' as const, start, end, construction: false })), constraints: [] }
        : { kind: 'rectangle', center: [5, 3], width: 10, height: 6 } },
    { id: 'base', name: 'Original 4 mm prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      ...(explicit ? { bodyOperation: { mode: 'new' as const, bodyId: 'box' } } : {}) },
  ]
  if (explicit) result.push(
    { id: 'disk', name: 'Original radius 2 disk', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [20, 0], radius: 2 } },
    { id: 'cylinder', name: 'Original 12 mm cylinder', type: 'extrude', sketchId: 'disk', depth: 12, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'cylinder' } },
  )
  return result
}
function assembly(source: Feature[]): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'reference-root', revision: 'r1', name: 'Original reference inventory assembly', units: 'mm',
    createdAt: stamp, updatedAt: stamp, definitions: [{ kind: 'part', id: 'reference-part', revision: 'r1', document: validateDocument({ version: 1,
      id: 'reference-part', name: 'Original reference inventory part', units: 'mm', createdAt: stamp, updatedAt: stamp, features: source }) }],
    occurrences: [{ id: 'part', name: 'Original part', definition: { id: 'reference-part', revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }], mates: [] })
}
function renderedInventory(result: CadResult): AssemblyReferenceInventory {
  const common = { featureErrors: structuredClone(result.featureErrors), warnings: [...result.warnings] }
  if (result.bodyCatalogActive) return { ...common, kind: 'explicit', bodies: result.bodies!.map(body => ({ ref: { ...body.ref },
    faces: body.faces.map(face => ({ ...face.ref })), edges: body.edges.map(edge => ({ ...edge.ref })), vertexRefs: (body.vertexPoints ?? []).map(value => ({ ...value.ref })) })) }
  return result.vertices.length ? { ...common, kind: 'legacy', faces: (result.faces ?? []).map(face => ({ ...face.ref })), edges: result.edges.map(edge => ({ ...edge.ref })), vertexRefs: (result.vertexPoints ?? []).map(value => ({ ...value.ref })) }
    : { ...common, kind: 'empty' }
}
function bodies(value: AssemblyReferenceInventory): { ref: BodyReference | null; faces: FaceReference[]; edges: EdgeReference[] }[] {
  return value.kind === 'explicit' ? value.bodies : value.kind === 'legacy' ? [{ ref: null, faces: value.faces, edges: value.edges }] : []
}
function renderedBodies(result: CadResult): { ref: BodyReference | null; faces: PickableFace[]; edges: PickableEdge[] }[] {
  return result.bodyCatalogActive ? result.bodies! : result.vertices.length ? [{ ref: null, faces: result.faces ?? [], edges: result.edges }] : []
}
function near(actual: number, expected: number, tolerance = 1e-6) { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance) }
function geometry(engine: CadEngine, reference: BodyReference | null, cylinder: boolean): void {
  withNativeOwners(owners => {
    const shape = owners.own(engine.copyCurrentBodyShape(reference)), box = owners.own(shape.boundingBox)
    expect(validateAssemblyShape(shape)).toBe(1)
    near(owners.own(measureShapeVolumeProperties(shape)).volume, cylinder ? 48 * Math.PI : 240)
    near(owners.own(measureShapeSurfaceProperties(shape)).area, cylinder ? 56 * Math.PI : 248)
    const expected = cylinder ? [[18, -2, 0], [22, 2, 12]] : [[0, 0, 0], [10, 6, 4]]
    box.bounds.forEach((side, i) => side.forEach((coordinate, axis) => near(coordinate, expected[i][axis])))
  })
}

it.each(['legacy', 'semantic', 'explicit'] as const)('preserves independently rendered %s identity, geometry, aliases and native supports without native tessellation', family => {
  const source = features(family), rendered = new CadEngine(), native = new CadEngine(), input = assembly(source)
  const result = rendered.build(source), picks = renderedBodies(result), expected = renderedInventory(result)
  const mesh = vi.spyOn(Shape.prototype, 'mesh'), edges = vi.spyOn(Shape.prototype, 'meshEdges')
  let snapshot: AssemblyGeometrySnapshot | undefined
  try {
    const inventory = native.rebuildForAssemblyReferences(source), original = structuredClone(inventory), entries = bodies(inventory)
    expect(inventory).toEqual(expected); expect(inventory.featureErrors).toEqual([])
    expect(entries).toHaveLength(family === 'explicit' ? 2 : 1)
    expect(entries[0].faces).toHaveLength(6); expect(entries[0].edges).toHaveLength(12)
    expect(entries[0].faces.every(face => face.key.startsWith(family === 'semantic' ? 'face-v2|' : 'face-v1|'))).toBe(true)
    if (family === 'semantic') {
      expect(picks[0].faces.some(face => face.aliases?.length)).toBe(true)
      expect(picks[0].edges.some(edge => edge.aliases?.length)).toBe(true)
      expect(entries[0].edges.some(edge => edge.key.startsWith('edge-v2|'))).toBe(true)
    }
    snapshot = new AssemblyGeometrySnapshot(input)
    const selections = snapshot.listFaces(input, ['part'])
    expect(selections.map(selection => ({ body: selection.body, face: selection.face }))).toEqual(entries.flatMap(body => body.faces.map(face => ({ body: body.ref, face }))))
    entries.forEach((body, index) => {
      geometry(native, body.ref, index === 1)
      body.faces.forEach((face, faceIndex) => {
        const support = native.inspectCurrentFaceSupport(face, body.ref)
        expect(support).toEqual(rendered.inspectCurrentFaceSupport(picks[index].faces[faceIndex].ref, picks[index].ref))
        for (const alias of picks[index].faces[faceIndex].aliases ?? []) expect(native.inspectCurrentFaceSupport(alias, body.ref)).toEqual(support)
        if (support.kind === 'cylinder') {
          near(support.radius, 2, 1e-10); near(support.point[0], 20, 1e-10); near(support.point[1], 0, 1e-10)
          near(Math.abs(support.axis[2]), 1, 1e-10)
        }
        const selection = selections.find(value => value.face.key === face.key && JSON.stringify(value.body) === JSON.stringify(body.ref))!
        const witness = snapshot!.resolveReference(input, { kind: 'face', ...selection, support: support.kind === 'plane' ? 'plane' : 'axis' })
        expect(witness.kind).toBe('support')
        if (witness.kind !== 'support') throw new Error('Original native support missing')
        expect(witness.localSupport).toEqual(support)
        const world = witness.worldSupport
        expect(world.kind).toBe(support.kind); expect(world.tolerance).toBe(support.tolerance)
        world.point.forEach((coordinate, axis) => near(coordinate, support.point[axis], 1e-10))
        if (world.kind === 'line') throw new Error('Original face resolved as an edge')
        world.xDirection.forEach((coordinate, axis) => near(coordinate, support.xDirection[axis], 1e-10))
        if (world.kind === 'plane' && support.kind === 'plane') world.normal.forEach((coordinate, axis) => near(coordinate, support.normal[axis], 1e-10))
        if (world.kind === 'cylinder' && support.kind === 'cylinder') {
          near(world.radius, 2, 1e-10); world.axis.forEach((coordinate, axis) => near(coordinate, support.axis[axis], 1e-10))
        }
      })
      body.edges.forEach((edge, edgeIndex) => {
        let support: ReturnType<CadEngine['inspectCurrentEdgeSupport']>
        try {
          support = rendered.inspectCurrentEdgeSupport(picks[index].edges[edgeIndex].ref, picks[index].ref)
        } catch (error) {
          if (!(error instanceof UnsupportedAssemblyCurveError)) throw error
          expect(() => native.inspectCurrentEdgeSupport(edge, body.ref)).toThrow(UnsupportedAssemblyCurveError)
          return
        }
        expect(native.inspectCurrentEdgeSupport(edge, body.ref)).toEqual(support)
        for (const alias of picks[index].edges[edgeIndex].aliases ?? []) expect(native.inspectCurrentEdgeSupport(alias, body.ref)).toEqual(support)
      })
    })
    expect('vertices' in inventory).toBe(false); expect('triangles' in inventory).toBe(false)
    const stable = bodies(original)[0], support = native.inspectCurrentFaceSupport(stable.faces[0], stable.ref)
    entries[0].faces[0].key = 'caller-face'; entries[0].edges[0].key = 'caller-edge'
    if (entries[0].ref) entries[0].ref.bodyId = 'caller-body'
    expect(native.inspectCurrentFaceSupport(stable.faces[0], stable.ref)).toEqual(support)
    selections[0].face.key = 'caller-selection'
    expect(snapshot.listFaces(input, ['part'])[0].face.key).toBe(stable.faces[0].key)
    expect(mesh).not.toHaveBeenCalled(); expect(edges).not.toHaveBeenCalled()
  } finally { snapshot?.dispose(); edges.mockRestore(); mesh.mockRestore(); native.dispose(); rendered.dispose() }
}, 60_000)

it.each(['no features', 'sketch only'] as const)('represents %s as actual empty native geometry without a fabricated rendered result', kind => {
  const source = kind === 'no features' ? [] : features('legacy').slice(0, 1), rendered = new CadEngine(), native = new CadEngine()
  const result = rendered.build(source), mesh = vi.spyOn(Shape.prototype, 'mesh'), edges = vi.spyOn(Shape.prototype, 'meshEdges')
  try {
    const inventory = native.rebuildForAssemblyReferences(source)
    expect(inventory).toEqual(renderedInventory(result)); expect(inventory.kind).toBe('empty')
    const input = assembly(source), snapshot = new AssemblyGeometrySnapshot(input)
    try { expect(snapshot.listFaces(input, ['part'])).toEqual([]) } finally { snapshot.dispose() }
    expect(() => native.copyCurrentBodyShape(null)).toThrow('reconstrucción completa')
    expect(mesh).not.toHaveBeenCalled(); expect(edges).not.toHaveBeenCalled()
  } finally { edges.mockRestore(); mesh.mockRestore(); native.dispose(); rendered.dispose() }
}, 60_000)

it.each(['legacy', 'semantic'] as const)('retains the same real failed-cut diagnostics and partial %s identities without publishing snapshot authority', family => {
  const source = features(family)
  source.push({ id: 'remote', name: 'Original nonintersecting tool', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 100], radius: 1 } },
  { id: 'miss', name: 'Original rejected cut', type: 'cut', sketchId: 'remote', depth: 4, symmetric: false, suppressed: false })
  const rendered = new CadEngine(), native = new CadEngine()
  try {
    const result = rendered.build(source), inventory = native.rebuildForAssemblyReferences(source)
    expect(inventory).toEqual(renderedInventory(result)); expect(inventory.featureErrors).toHaveLength(1)
    expect(inventory.featureErrors[0]).toMatchObject({ id: 'miss' })
    const body = bodies(inventory)[0]
    expect(() => native.inspectCurrentFaceSupport(body.faces[0], body.ref)).toThrow('reconstrucción completa')
    expect(() => new AssemblyGeometrySnapshot(assembly(source))).toThrow('No se pudo reconstruir')
  } finally { native.dispose(); rendered.dispose() }
}, 60_000)

it('reconstructs independent engines for byte-identical snapshots and freshly queries their native supports', () => {
  const input = assembly(features('legacy')), real = CadEngine.prototype.rebuildForAssemblyReferences, engines: CadEngine[] = []
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, source) { engines.push(this); return real.call(this, source) })
  const query = vi.spyOn(supports, 'extractAssemblyFaceSupport')
  let first: AssemblyGeometrySnapshot | undefined, second: AssemblyGeometrySnapshot | undefined
  try {
    first = new AssemblyGeometrySnapshot(input); second = new AssemblyGeometrySnapshot(input)
    expect(engines).toHaveLength(2); expect(engines[0]).not.toBe(engines[1])
    const selection = first.listFaces(input, ['part'])[0], reference = { kind: 'face' as const, ...selection, support: 'plane' as const }
    const a = first.resolveReference(input, reference), b = second.resolveReference(input, reference), again = second.resolveReference(input, reference)
    expect(query).toHaveBeenCalledTimes(3); expect(a).not.toBe(b); expect(b).not.toBe(again)
    expect(() => second!.assertWitness(a, input)).toThrow('no fue verificada')
    first.dispose(); expect(second.assertWitness(b, input)).toBe(b)
    expect(() => engines[0].inspectCurrentFaceSupport(selection.face, null)).toThrow('reconstrucción completa')
  } finally { second?.dispose(); first?.dispose(); query.mockRestore(); build.mockRestore() }
}, 60_000)

it.each(['faces', 'edges'] as const)('preserves exact native %s inventory admission and releases a rejected oversized snapshot', field => {
  const input = assembly(features('legacy')), real = CadEngine.prototype.rebuildForAssemblyReferences
  const limit = field === 'faces' ? MAX_ASSEMBLY_NATIVE_FACE_REFERENCES : MAX_ASSEMBLY_NATIVE_EDGE_REFERENCES
  let count = limit, engine: CadEngine | undefined, reference: FaceReference | undefined
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, source) {
    const inventory = real.call(this, source)
    if (inventory.kind !== 'legacy') throw new Error('Original legacy inventory missing')
    engine = this; reference = { ...inventory.faces[0] }
    // Inject inventory cardinality only; all actual geometry is still built.
    return field === 'faces' ? { ...inventory, faces: Array.from({ length: count }, () => ({ ...inventory.faces[0] })) }
      : { ...inventory, edges: Array.from({ length: count }, () => ({ ...inventory.edges[0] })) }
  })
  try {
    const admitted = new AssemblyGeometrySnapshot(input)
    try { expect(admitted.listFaces(input, ['part'])).toHaveLength(field === 'faces' ? limit : 6) } finally { admitted.dispose() }
    count++
    expect(() => new AssemblyGeometrySnapshot(input)).toThrow('presupuesto de cuerpos, caras o aristas')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(() => engine!.inspectCurrentFaceSupport(reference!, null)).toThrow('reconstrucción completa')
  } finally { spy.mockRestore(); engine?.dispose() }
}, 60_000)

function failureTree(value: unknown): unknown[] { return value instanceof AggregateError ? [value, ...value.errors.flatMap(failureTree)] : [value] }
it.each([false, true])('withholds native inventory after real producer cleanup and drains both final catalogs, face cleanup fault=%s', cleanupFault => {
  const engine = new CadEngine(), producer = provenance.entityProfilePrismIfSingleRegion, createFaces = semantic.createSemanticFaceCatalog, createEdges = semantic.createSemanticEdgeCatalog
  const cleanup = new Error('Original inventory face release fault')
  let facesReleased = 0, edgesReleased = 0, sealedEarly = false, reference: FaceReference | undefined, escaped: AssemblyReferenceInventory | undefined
  const prism = vi.spyOn(provenance, 'entityProfilePrismIfSingleRegion').mockImplementation((...args) => {
    const owner = producer(...args); if (!owner) throw new Error('Original prism producer missing')
    const release = owner.dispose.bind(owner)
    return { ...owner, dispose: () => {
      if (reference) {
        try { engine.inspectCurrentFaceSupport(reference, null); sealedEarly = true }
        catch (error) { if (!(error instanceof Error) || !error.message.includes('reconstrucción completa')) throw error }
      }
      return [...release(), 'Original inventory producer release fault']
    } }
  })
  const faces = vi.spyOn(semantic, 'createSemanticFaceCatalog').mockImplementation((...args) => {
    const catalog = createFaces(...args), release = catalog.dispose; reference = { ...catalog.entries[0].ref }
    return { ...catalog, dispose: () => { facesReleased++; release(); if (cleanupFault) throw cleanup } }
  })
  const edges = vi.spyOn(semantic, 'createSemanticEdgeCatalog').mockImplementation((...args) => {
    const catalog = createEdges(...args), release = catalog.dispose
    return { ...catalog, dispose: () => { edgesReleased++; release() } }
  })
  try {
    let failure: unknown
    try { escaped = engine.rebuildForAssemblyReferences(features('semantic')) } catch (error) { failure = error }
    expect(escaped).toBeUndefined(); expect(sealedEarly).toBe(false)
    expect(failureTree(failure).some(value => value instanceof Error && value.message.includes('Original inventory producer release fault'))).toBe(true)
    if (cleanupFault) expect(failureTree(failure)).toContain(cleanup)
    expect(facesReleased).toBe(1); expect(edgesReleased).toBe(1)
    expect(() => engine.inspectCurrentFaceSupport(reference!, null)).toThrow('reconstrucción completa')
    expect(() => engine.dispose()).not.toThrow(); expect(facesReleased).toBe(1); expect(edgesReleased).toBe(1)
  } finally { edges.mockRestore(); faces.mockRestore(); prism.mockRestore(); engine.dispose() }
}, 60_000)

it.each(['prepare', 'apply'] as const)('publishes no Apply authority when actual final-scene tessellation fails during %s after meshless checks', stage => {
  const session = new AssemblyWorkerSession(), input = assembly(features('legacy')), before = serializeAssemblyDocument(input)
  const older = session.prepare(input)
  if (older.status !== 'ready') throw new Error(older.message)
  const original = Shape.prototype.mesh, renderBuild = CadEngine.prototype.build, referenceBuild = CadEngine.prototype.rebuildForAssemblyReferences,
    constructed = new Set<CadEngine>(), failure = new Error('Original final scene mesh fault')
  // Register before either real build can throw. Ordinary prepare shares a
  // reference build with presentation; Apply still constructs its render scene.
  const build = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function (this: CadEngine, source) { constructed.add(this); return renderBuild.call(this, source) })
  const references = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, source) { constructed.add(this); return referenceBuild.call(this, source) })
  const mesh = vi.spyOn(Shape.prototype, 'mesh').mockImplementation(function (this: AnyShape, options) { original.call(this, options); throw failure })
  try {
    if (stage === 'prepare') expect(() => session.prepare(input)).toThrow(failure)
    else expect(() => session.apply(input, older.token)).toThrow(failure)
    expect(mesh).toHaveBeenCalled(); expect(constructed.size).toBe(1)
    expect(stage === 'prepare' ? references : build).toHaveBeenCalledTimes(1)
    expect(stage === 'prepare' ? build : references).not.toHaveBeenCalled()
    expect(() => session.apply(input, older.token)).toThrow('ya no está disponible')
    expect(serializeAssemblyDocument(input)).toBe(before)
    for (const engine of constructed) expect(() => engine.copyCurrentBodyShape(null)).toThrow('reconstrucción completa')
  } finally { mesh.mockRestore(); references.mockRestore(); build.mockRestore(); session.discard() }
}, 60_000)
