import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { Face, getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, expectTypeOf, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { validateAssemblyDocument, type AssemblyDocument, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { parseDocument, validateDocument, type Document } from '../model/document'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { withAssemblyGeometryReuse } from './kernel.assembly-snapshot'
import { CadEngine, type AssemblyPresentationBody } from './kernel.engine'
import { withNativeOwners } from './kernel.native-ownership'
import { UnsupportedAssemblySurfaceError } from './kernel.assembly-supports'
import type { BodyReference, CadResult, Vec3 } from './kernel.types'

let originalSphere: Document
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  originalSphere = parseDocument(await readFile(new URL('./fixtures/sphere-revolve-original.json', import.meta.url), 'utf8'))
}, 60_000)

// Original symbolic 2 x 3 x 4 prisms and R2/H4 cone. The pin and R3 sphere
// reuse existing independently authored project fixtures, never external CAD.
const stamp = '2026-10-26T00:00:00.000Z'
function document(id: string, features: unknown[]): Document {
  return validateDocument({ version: 1, id, name: 'Original ' + id, units: 'mm', createdAt: stamp, updatedAt: stamp, features })
}
function polygon(points: [number, number][]) {
  return { kind: 'entities', points: points.map(([x, y], i) => ({ id: 'p' + i, x, y })),
    entities: points.map((_, i) => ({ id: 'edge' + i, type: 'line', start: 'p' + i,
      end: 'p' + ((i + 1) % points.length), construction: false })), constraints: [] }
}
function semanticPrism(): Document {
  return document('presentation-semantic-prism', [
    { id: 'profile', name: 'Named sides', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: polygon([[0, 0], [2, 0], [2, 3], [0, 3]]) },
    { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false },
  ])
}
function twoBodies(): Document {
  return document('presentation-two-bodies', [0, 1].flatMap(i => [
    { id: 'profile-' + i, name: 'Profile ' + i, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [10 * i, 0], width: 2, height: 3 } },
    { id: 'solid-' + i, name: 'Named body ' + i, type: 'extrude', sketchId: 'profile-' + i, depth: 4,
      symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body-' + i } },
  ]))
}
function pin(): Document {
  const value = createAssemblyExample().definitions.find(item => item.id === 'example-pin')
  if (value?.kind !== 'part') throw new Error('Original pin fixture missing')
  return value.document
}
function cone(): Document {
  return document('presentation-cone', [
    { id: 'profile', name: 'Original triangle', type: 'sketch', plane: 'XY', offset: 0,
      suppressed: false, profile: polygon([[0, 0], [2, 0], [0, 4]]) },
    { id: 'cone', name: 'Original cone', type: 'revolve', sketchId: 'profile', angle: 360,
      suppressed: false, bodyOperation: { mode: 'new', bodyId: 'cone-body' } },
  ])
}
function assembly(part: Document): AssemblyDocument {
  const root = createEmptyAssembly(), definition: EmbeddedPartDefinition = { kind: 'part', id: part.id, revision: 'r1', document: part }
  root.definitions = [definition]
  root.occurrences = ['a', 'b'].map((id, i) => ({ id, name: 'Original occurrence ' + id,
    definition: { id: part.id, revision: 'r1' }, fixed: false, visible: i === 0, suppressed: false,
    pose: i === 0 ? identityRigidPose() : { translation: [20, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }))
  return validateAssemblyDocument(root)
}
function presentation(result: CadResult): AssemblyPresentationBody[] {
  return result.bodyCatalogActive ? result.bodies!.map(body => ({ body: body.ref, name: body.name,
    faces: body.faces, edges: body.edges, vertexPoints: body.vertexPoints ?? [] }))
    : result.vertices.length ? [{ body: null, name: 'Agregado de pieza', faces: result.faces ?? [],
      edges: result.edges, vertexPoints: result.vertexPoints ?? [] }] : []
}
const near = (actual: number, wanted: number, tolerance = 1e-6) => expect(Math.abs(actual - wanted)).toBeLessThan(tolerance)
function metrics(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    const oc = getOC(), check = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)),
      mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box())
    expect(check.IsValid()).toBe(true)
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false)
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false)
    near(mass.Mass(), volume, 1e-5); near(surface.Mass(), area, 1e-5)
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false)
    for (const [corner, wanted] of [[owners.own(box.CornerMin()), min], [owners.own(box.CornerMax()), max]] as const) {
      ;[corner.X(), corner.Y(), corner.Z()].forEach((value, i) => near(value, wanted[i]))
    }
  })
}
const specimens = [
  { name: 'legacy semantic prism', make: semanticPrism, volume: 24, area: 52, bounds: [[[0, 0, 0], [2, 3, 4]]] },
  { name: 'explicit named multibody', make: twoBodies, volume: 24, area: 52, bounds: [[[-1, -1.5, 0], [1, 1.5, 4]], [[9, -1.5, 0], [11, 1.5, 4]]] },
  { name: 'eccentric bored pin', make: pin, volume: 189 * Math.PI / 4, area: 495 * Math.PI / 8, bounds: [[[-2, -2, 0], [2, 2, 12]]] },
  { name: 'revolved sphere', make: () => structuredClone(originalSphere), volume: 36 * Math.PI, area: 36 * Math.PI, bounds: [[[-3, -3, -3], [3, 3, 3]]] },
  { name: 'revolved cone', make: cone, volume: 16 * Math.PI / 3, area: 4 * Math.PI + 2 * Math.PI * Math.sqrt(20), bounds: [[[-2, 0, -2], [2, 4, 2]]] },
]

it.each(specimens)('preserves exact rendering catalogs and placed scene for $name with independent native measures', specimen => {
  const input = specimen.make(), before = JSON.stringify(input), rendered = new CadEngine(), referenced = new CadEngine()
  try {
    const result = rendered.build(input.features), inventory = referenced.rebuildForAssemblyReferences(input.features)
    expect(result.featureErrors).toEqual([]); expect(inventory.featureErrors).toEqual([])
    expect(inventory.warnings).toEqual(result.warnings)
    const current = referenced.readCurrentAssemblyPresentation()
    // Includes exact face triangles/vertices, edge lines, keys, aliases, planar
    // frames, curved view axes, vertex identities, body names and ordering.
    expect(current).toEqual(presentation(result)); expect(current).toHaveLength(specimen.bounds.length)
    current.forEach((body, i) => withNativeOwners(owners => metrics(owners.own(referenced.copyCurrentBodyShape(body.body)),
      specimen.volume, specimen.area, specimen.bounds[i][0] as Vec3, specimen.bounds[i][1] as Vec3)))
    if (specimen.name === 'legacy semantic prism') {
      expect(current[0].body).toBeNull()
      expect(current[0].faces.every(face => !!face.aliases?.length)).toBe(true)
      expect(current[0].edges.every(edge => !!edge.aliases?.length)).toBe(true)
      const face = current[0].faces[0]
      expect(referenced.inspectCurrentFaceSupport(face.aliases![0], null)).toEqual(referenced.inspectCurrentFaceSupport(face.ref, null))
      face.aliases![0].key = 'Mutated display alias'
      expect(referenced.readCurrentAssemblyPresentation()).toEqual(presentation(result))
    }
    if (specimen.name === 'explicit named multibody') expect(inventory.warnings).toContain('La pieza contiene 2 sólidos separados.')
    if (specimen.name === 'revolved sphere') expect(current[0].faces.every(face => !face.viewAxis)).toBe(true)
    if (specimen.name === 'revolved cone') {
      const axes = current[0].faces.flatMap(face => face.viewAxis ? [face.viewAxis] : [])
      expect(axes).toHaveLength(1); near(Math.abs(axes[0].direction[1]), 1, 1e-8)
      near(axes[0].direction[0], 0, 1e-8); near(axes[0].direction[2], 0, 1e-8)
    }
    const declaration = assembly(input), regular = buildAssemblyScene(declaration)
    const reused = withAssemblyGeometryReuse(declaration, (_snapshots, parts) => buildAssemblyScene(declaration, parts))
    const { sceneId: regularId, ...regularData } = regular, { sceneId: reusedId, ...reusedData } = reused
    expect(regularId).not.toBe(reusedId); expect(reusedData).toEqual(regularData)
    near(reused.volume, specimen.volume * specimen.bounds.length * 2, 1e-5)
    near(reused.area, specimen.area * specimen.bounds.length * 2, 1e-5)
    expect(reused.solidCount).toBe(specimen.bounds.length * 2)
    expect(JSON.stringify(input)).toBe(before)
  } finally { referenced.dispose(); rendered.dispose() }
}, 60_000)

it('accepts completed empty builds but rejects new, disposed and failed-feature presentation', () => {
  const engine = new CadEngine(), empty = document('empty-presentation', [])
  try {
    expect(() => engine.readCurrentAssemblyPresentation()).toThrow('reconstrucción completa')
    expect(() => engine.borrowCurrentAssemblyInspection(() => {}, () => {})).toThrow('reconstrucción completa')
    expect(engine.rebuildForAssemblyReferences([]).kind).toBe('empty')
    expect(engine.readCurrentAssemblyPresentation()).toEqual([])
    const declaration = assembly(empty), regular = buildAssemblyScene(declaration),
      reused = withAssemblyGeometryReuse(declaration, (_snapshots, parts) => buildAssemblyScene(declaration, parts))
    expect(reused.bodies).toEqual([]); expect(reused.warnings).toEqual(regular.warnings)
    expect(reused.warnings.some(value => value.includes('no contiene cuerpos'))).toBe(true)
    engine.dispose(); expect(() => engine.readCurrentAssemblyPresentation()).toThrow('reconstrucción completa')
    const failed = pin()
    failed.features.push({ id: 'remote', name: 'Original remote cut profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [100, 0], radius: 1 } },
    { id: 'failed-cut', name: 'Original remote cut', type: 'cut', sketchId: 'remote', depth: 12, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'pin-body', sourceFeatureId: 'bore' }] })
    expect(engine.rebuildForAssemblyReferences(failed.features).featureErrors.length).toBeGreaterThan(0)
    expect(() => engine.readCurrentAssemblyPresentation()).toThrow('reconstrucción completa')
    expect(() => engine.borrowCurrentAssemblyInspection(() => {}, () => {})).toThrow('reconstrucción completa')
  } finally { engine.dispose() }
}, 60_000)

it('keeps current native supports and detached presentation intact after returned DTO mutation', () => {
  const engine = new CadEngine(), input = pin()
  try {
    const inventory = engine.rebuildForAssemblyReferences(input.features)
    if (inventory.kind !== 'explicit') throw new Error('Original explicit pin required')
    const body = inventory.bodies[0], candidates = body.faces.flatMap(face => {
      try { return [{ face, support: engine.inspectCurrentFaceSupport(face, body.ref) }] }
      catch (error) { if (error instanceof UnsupportedAssemblySurfaceError) return []; throw error }
    })
    const cylinder = candidates.find(value => value.support.kind === 'cylinder' && Math.abs(value.support.radius - .25) < 1e-10)!
    expect(cylinder).toBeDefined(); near(cylinder.support.point[0], 1); near(cylinder.support.point[1], 0)
    const beforeSupport = structuredClone(cylinder.support), first = engine.readCurrentAssemblyPresentation(), exact = structuredClone(first)
    expect(engine.inspectCurrentFaceSupport(cylinder.face, body.ref)).toEqual(beforeSupport)
    first[0].name = 'Changed display only'; first[0].body!.bodyId = 'changed'
    first[0].faces[0].ref.key = 'changed'; first[0].faces[0].vertices[0] = 999
    const planar = first[0].faces.find(value => value.frame)
    if (planar?.frame) planar.frame.origin[0] = 999
    first[0].edges[0].ref.key = 'changed'; first[0].edges[0].lines[0] = 999
    const curved = first[0].faces.find(value => value.viewAxis)!
    expect(curved).toBeDefined(); curved.viewAxis!.direction[0] = 999
    if (first[0].vertexPoints.length) first[0].vertexPoints[0].point[0] = 999
    expect(engine.readCurrentAssemblyPresentation()).toEqual(exact)
    expect(engine.inspectCurrentFaceSupport(cylinder.face, body.ref)).toEqual(beforeSupport)
  } finally { engine.dispose() }
}, 60_000)

it.each(['rebuild', 'dispose', 'owner'] as const)('rejects a retained inspection lease after %s without exposing engine controls', action => {
  const engine = new CadEngine(), failures: unknown[] = []; let alive = true
  try {
    engine.rebuildForAssemblyReferences(semanticPrism().features)
    const lease = engine.borrowCurrentAssemblyInspection(() => { if (!alive) throw new Error('Original owner closed') }, error => { failures.push(error) })
    expectTypeOf(lease.placeCurrentAssemblyBody).parameters.toEqualTypeOf<[BodyReference | null, RigidPose]>()
    expect(Object.keys(lease).sort()).toEqual(['copyCurrentBodyShape', 'placeCurrentAssemblyBody', 'inspectCurrentArcPathOrigins', 'inspectCurrentEdgeSupport',
      'inspectCurrentFaceSupport', 'inspectCurrentSphereSurfaceSupport', 'inspectCurrentVertexSupport', 'readCurrentAssemblyPresentation'].sort())
    expect(lease.readCurrentAssemblyPresentation()).toHaveLength(1)
    if (action === 'rebuild') engine.rebuildForAssemblyReferences(semanticPrism().features)
    else if (action === 'dispose') engine.dispose()
    else alive = false
    expect(() => lease.readCurrentAssemblyPresentation()).toThrow()
    expect(() => lease.copyCurrentBodyShape(null)).toThrow()
    expect(() => lease.placeCurrentAssemblyBody(null, { translation: [0, 0, 0], rotation: [0, 0, 0, 1] })).toThrow()
    expect(failures.length).toBeGreaterThanOrEqual(2)
    if (action !== 'dispose') expect(engine.readCurrentAssemblyPresentation()).toHaveLength(1)
  } finally { engine.dispose() }
}, 60_000)

it('releases an actual copied body if the owner becomes invalid before copy delivery', () => {
  const engine = new CadEngine(), primary = new Error('Original owner invalidated during copy'), failures: unknown[] = []
  let checks = 0, released = 0
  try {
    engine.rebuildForAssemblyReferences(semanticPrism().features)
    const real = engine.copyCurrentBodyShape.bind(engine), copy = vi.spyOn(engine, 'copyCurrentBodyShape').mockImplementation(reference => {
      const shape = real(reference), remove = shape.delete.bind(shape)
      vi.spyOn(shape, 'delete').mockImplementation(() => { released++; remove() }); return shape
    })
    try {
      const lease = engine.borrowCurrentAssemblyInspection(() => { if (++checks === 2) throw primary }, error => { failures.push(error) })
      expect(() => lease.copyCurrentBodyShape(null)).toThrow(primary)
      expect(copy).toHaveBeenCalledTimes(1); expect(released).toBe(1); expect(failures).toContain(primary)
    } finally { copy.mockRestore() }
  } finally { engine.dispose(); vi.restoreAllMocks() }
}, 60_000)

it('propagates real face-meshing failure and invalidates the engine and retained lease', () => {
  const engine = new CadEngine(), primary = new Error('Original presentation mesh failure'), failures: unknown[] = []
  try {
    engine.rebuildForAssemblyReferences(semanticPrism().features)
    const lease = engine.borrowCurrentAssemblyInspection(() => {}, error => { failures.push(error) }), actual = Face.prototype.mesh
    const mesh = vi.spyOn(Face.prototype, 'mesh').mockImplementation(function (this: Face, ...args) {
      actual.apply(this, args); throw primary
    })
    try { expect(() => lease.readCurrentAssemblyPresentation()).toThrow(primary) } finally { mesh.mockRestore() }
    expect(failures).toContain(primary)
    expect(() => engine.readCurrentAssemblyPresentation()).toThrow('reconstrucción completa')
    expect(() => lease.copyCurrentBodyShape(null)).toThrow()
  } finally { engine.dispose() }
}, 60_000)
