// Original persisted-feature sphere construction and topology gate.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { cast, getOC, setOC, Shape, Vertex, type Edge, type Face, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseDocument, serializeDocument } from '../model/document'
import { CadEngine } from './kernel.engine'
import { validateAssemblyShape } from './kernel.assembly-placements'
import { UnsupportedAssemblyCylinderSurfaceError, UnsupportedAssemblySurfaceError } from './kernel.assembly-supports'
import { withNativeOwners } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import * as edgeCatalogs from './kernel.edges'
import type { BodyReference, EdgeReference, Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)
const bodyRef: BodyReference = { bodyId: 'sphere-body', sourceFeatureId: 'sphere-revolve' }
const near = (actual: number, expected: number, tolerance = 1e-8) => {
  expect(Number.isFinite(actual)).toBe(true)
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}
const tuple = (point: { X(): number; Y(): number; Z(): number }): Vec3 => [point.X(), point.Y(), point.Z()]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
function pointNear(actual: Vec3, expected: Vec3): void { actual.forEach((value, axis) => near(value, expected[axis])) }

/** Own every raw Current AND independent vertex cast; no borrowed wrappers escape. */
function vertices(edge: Edge): Vec3[] {
  return withNativeOwners(owners => {
    const oc = getOC(), explorer = owners.own(new oc.TopExp_Explorer(edge.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE))
    const seen: ReturnType<typeof explorer.Current>[] = [], points: Vec3[] = []
    while (explorer.More()) {
      const raw = owners.own(explorer.Current())
      if (!seen.some(value => value.IsSame(raw))) {
        seen.push(raw)
        const vertex = owners.own(cast(raw))
        if (!(vertex instanceof Vertex)) throw new Error('Actual native pole/seam vertex required')
        points.push(tuple(owners.own(oc.BRep_Tool.Pnt(vertex.wrapped))))
      }
      explorer.Next()
    }
    return points
  }, undefined, 'Original sphere vertex query or release failed.')
}
function poles(points: Vec3[]): void {
  expect(points).toHaveLength(2)
  const ordered = [...points].sort((a, b) => a[1] - b[1])
  pointNear(ordered[0], [0, -3, 0]); pointNear(ordered[1], [0, 3, 0])
}

/** Independent analytical mass/bounds plus actual native spherical classification. */
function physical(shape: Shape3D): void {
  withNativeOwners(owners => {
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)),
      volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps()), bounds = owners.own(new oc.Bnd_Box())
    expect(analyzer.IsValid()).toBe(true); expect(validateAssemblyShape(shape)).toBe(1)
    expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
    oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false)
    oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
    near(volume.Mass(), 36 * Math.PI, 1e-5); near(area.Mass(), 36 * Math.PI, 1e-5)
    pointNear(tuple(owners.own(volume.CentreOfMass())), [0, 0, 0])
    oc.BRepBndLib.AddOptimal(shape.wrapped, bounds, false, false)
    pointNear(tuple(owners.own(bounds.CornerMin())), [-3, -3, -3])
    pointNear(tuple(owners.own(bounds.CornerMax())), [3, 3, 3])
    const faces = owners.ownAll(ownedNativeTopology(shape, 'face'))
    expect(faces).toHaveLength(1)
    surface(faces[0]); seamAndPoles(faces[0])
  }, undefined, 'Original persisted sphere geometry query or release failed.')
}
function surface(face: Face): void {
  withNativeOwners(owners => {
    const oc = getOC(), adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
    expect(adaptor.GetType()).toBe(oc.GeomAbs_SurfaceType.GeomAbs_Sphere)
    const sphere = owners.own(adaptor.Sphere()), frame = owners.own(sphere.Position()), centre = owners.own(sphere.Location()),
      z = owners.own(frame.Direction()), x = owners.own(frame.XDirection()), y = owners.own(frame.YDirection())
    pointNear(tuple(centre), [0, 0, 0]); near(sphere.Radius(), 3)
    for (const direction of [x, y, z]) near(Math.hypot(...tuple(direction)), 1)
    near(dot(tuple(x), tuple(y)), 0); near(dot(tuple(y), tuple(z)), 0); near(dot(tuple(z), tuple(x)), 0)
    // Parameter handedness is observed only; the normal oracle below uses native D1.
    near(Math.abs(dot(cross(tuple(x), tuple(y)), tuple(z))), 1)
    const uv = face.UVBounds
    near(uv.uMax - uv.uMin, 2 * Math.PI); near(uv.vMin, -Math.PI / 2); near(uv.vMax, Math.PI / 2)
    expect(adaptor.IsUPeriodic()).toBe(true); near(adaptor.UPeriod(), 2 * Math.PI)
    expect(adaptor.IsVPeriodic()).toBe(false)
    const u = uv.uMin + .73, polePoints = [uv.vMin, uv.vMax].map(v => tuple(owners.own(adaptor.Value(u, v))))
    poles(polePoints)
    for (const v of [-.4, 0, .4]) {
      const a = tuple(owners.own(adaptor.Value(u, v))), b = tuple(owners.own(adaptor.Value(u + adaptor.UPeriod(), v)))
      pointNear(a, b); near(Math.hypot(...a), 3)
    }
    // Avoid UV poles for D1; the physical radial normal at a pole is still defined.
    const point = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
    adaptor.D1(u, .4, point, du, dv)
    const p = tuple(point), differential = cross(tuple(du), tuple(dv)), norm = Math.hypot(...differential), orientation = face.wrapped.Orientation()
    expect([oc.TopAbs_Orientation.TopAbs_FORWARD, oc.TopAbs_Orientation.TopAbs_REVERSED]).toContain(orientation)
    const sign = orientation === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1
    near(Math.hypot(...p), 3); expect(norm).toBeGreaterThan(0)
    near(sign * dot(differential, p) / (norm * 3), 1)
  }, undefined, 'Original persisted spherical support query or release failed.')
}
function seamAndPoles(face: Face): void {
  withNativeOwners(owners => {
    const oc = getOC(), edges = owners.ownAll(ownedNativeTopology(face, 'edge')), collapsed: Vec3[] = [], seams: Edge[] = []
    // Source-specific conventional full-sphere topology, not a universal CAD claim.
    expect(edges).toHaveLength(3)
    for (const edge of edges) {
      if (oc.BRep_Tool.Degenerated(edge.wrapped)) {
        const points = vertices(edge); expect(points).toHaveLength(1); collapsed.push(points[0])
      } else {
        // Deliberately require the genuine face-aware overload; no shell overload fallback.
        expect(oc.BRep_Tool.IsClosed(edge.wrapped, face.wrapped)).toBe(true)
        seams.push(edge); poles(vertices(edge))
        const curve = owners.own(edge.curve), first = curve.wrapped.FirstParameter(), last = curve.wrapped.LastParameter()
        expect(Number.isFinite(first) && Number.isFinite(last)).toBe(true); expect(last).toBeGreaterThan(first)
        for (const fraction of [0, .25, .5, .75, 1]) {
          const p = tuple(owners.own(curve.wrapped.Value(first + fraction * (last - first))))
          near(p[2], 0); expect(p[0]).toBeGreaterThanOrEqual(-1e-8); near(p[0] ** 2 + p[1] ** 2, 9)
        }
      }
    }
    expect(seams).toHaveLength(1); poles(collapsed)
  }, undefined, 'Original persisted sphere seam/pole query or release failed.')
}

it('reopens an original semicircle Revolve as an actual full native Sphere through reference-only and rendered catalogs, including seam and pole boundaries', async () => {
  const document = parseDocument(await readFile(new URL('./fixtures/sphere-revolve-original.json', import.meta.url), 'utf8')),
    saved = serializeDocument(document), reopened = parseDocument(saved)
  expect(reopened).toEqual(document)
  withNativeOwners(owners => {
    const native = new CadEngine(); owners.own({ delete: () => native.dispose() })
    const rendered = new CadEngine(); owners.own({ delete: () => rendered.dispose() })
    const mesh = vi.spyOn(Shape.prototype, 'mesh'), meshEdges = vi.spyOn(Shape.prototype, 'meshEdges')
    const inventory = (() => {
      try {
        // This call may reveal the real degenerate-edge catalog failure. Do not catch it.
        const result = native.rebuildForAssemblyReferences(reopened.features)
        expect(mesh).not.toHaveBeenCalled(); expect(meshEdges).not.toHaveBeenCalled()
        return result
      } finally { meshEdges.mockRestore(); mesh.mockRestore() }
    })()
    expect(inventory.featureErrors).toEqual([]); expect(inventory.warnings).toEqual([])
    expect(inventory.kind).toBe('explicit')
    if (inventory.kind !== 'explicit') throw new Error('Original persisted sphere must retain its explicit body')
    expect(inventory.bodies).toHaveLength(1); expect(inventory.bodies[0].ref).toEqual(bodyRef)
    expect(inventory.bodies[0].faces).toHaveLength(1); expect(inventory.bodies[0].edges).toHaveLength(3)
    const nativeEdges = new Map<string, { ref: EdgeReference; degenerated: boolean; vertices: Vec3[] }>(),
      edgeIdentity = (reference: EdgeReference) => JSON.stringify([reference.sourceFeatureId, reference.key]),
      pickable = edgeCatalogs.pickableEdgesFromCatalog
    const edgeMesh = vi.spyOn(edgeCatalogs, 'pickableEdgesFromCatalog').mockImplementation(catalog => {
      for (const entry of catalog.entries) {
        // Observe the exact borrowed native edge before the real mesher runs.
        // The vertex helper owns every wrapper it receives; only coordinates escape.
        const degenerated = getOC().BRep_Tool.Degenerated(entry.edge.wrapped),
          observation = { ref: { ...entry.ref }, degenerated, vertices: vertices(entry.edge) }, identity = edgeIdentity(entry.ref)
        const previous = nativeEdges.get(identity)
        if (previous) expect(observation, 'Repeated exact sphere edge observation changed').toEqual(previous)
        nativeEdges.set(identity, observation)
      }
      return pickable(catalog)
    })
    const result = (() => {
      try { return rendered.build(reopened.features) }
      finally { edgeMesh.mockRestore() }
    })()
    expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]); expect(result.bodyCatalogActive).toBe(true)
    expect(result.bodies).toHaveLength(1)
    const body = result.bodies?.[0]
    if (!body) throw new Error('Original rendered explicit sphere body required')
    expect(body.ref).toEqual(bodyRef)
    expect(body.faces.map(value => value.ref)).toEqual(inventory.bodies[0].faces)
    expect(body.edges.map(value => value.ref)).toEqual(inventory.bodies[0].edges)
    expect(body.faces.every(value => value.frame === null)).toBe(true)
    expect(body.vertices.length).toBeGreaterThan(0); expect(body.triangles.length).toBeGreaterThan(0)
    expect([...body.vertices, ...body.normals, ...body.edgeLines].every(Number.isFinite)).toBe(true)
    expect(body.triangles.every(index => Number.isInteger(index) && index >= 0 && index < body.vertices.length / 3)).toBe(true)
    for (let offset = 0; offset < body.vertices.length; offset += 3) near(Math.hypot(...body.vertices.slice(offset, offset + 3)), 3, 1e-6)
    expect(body.faces[0].vertices.length).toBeGreaterThan(0); expect(body.faces[0].triangles.length).toBeGreaterThan(0)
    expect(body.edges.every(value => value.lines.length % 6 === 0 && value.lines.every(Number.isFinite))).toBe(true)
    const a = owners.own(native.copyCurrentBodyShape(bodyRef)), b = owners.own(rendered.copyCurrentBodyShape(bodyRef))
    expect(a.wrapped.IsPartner(b.wrapped)).toBe(false); physical(a); physical(b)
    // A nonempty Float32 line buffer may still describe a collapsed native edge.
    // Classify by the exact native reference, then check each DTO against original geometry.
    const collapsed: Vec3[] = []; let seamCount = 0
    body.edges.forEach((value, index) => {
      const label = `Original sphere edge ${index} from ${value.ref.sourceFeatureId}`, observation = nativeEdges.get(edgeIdentity(value.ref))
      expect(observation, label + ' was not observed before native meshing').toBeDefined()
      if (!observation) throw new Error(label + ' has no exact native observation')
      expect(observation.ref).toEqual(value.ref)
      let maximumSegment = 0
      for (let offset = 0; offset < value.lines.length; offset += 6) {
        maximumSegment = Math.max(maximumSegment, Math.hypot(value.lines[offset + 3] - value.lines[offset],
          value.lines[offset + 4] - value.lines[offset + 1], value.lines[offset + 5] - value.lines[offset + 2]))
      }
      if (observation.degenerated) {
        expect(observation.vertices, label + ' must collapse to one native pole').toHaveLength(1)
        const vertex = observation.vertices[0], matches = ([-3, 3] as const).filter(y => Math.hypot(vertex[0], vertex[1] - y, vertex[2]) <= 1e-8)
        expect(matches, label + ' must match exactly one original pole').toHaveLength(1)
        const pole: Vec3 = [0, matches[0], 0]; collapsed.push(pole)
        expect(maximumSegment, label + ' must not invent an extended pole segment').toBeLessThanOrEqual(1e-8)
        for (let offset = 0; offset < value.lines.length; offset += 3) {
          expect(Math.hypot(value.lines[offset], value.lines[offset + 1] - pole[1], value.lines[offset + 2]),
            label + ' endpoint left its original pole').toBeLessThanOrEqual(1e-8)
        }
      } else {
        seamCount++; poles(observation.vertices)
        expect(maximumSegment, label + ' must contain an extended meridian').toBeGreaterThan(1e-8)
        for (let offset = 0; offset < value.lines.length; offset += 3) {
          const point: Vec3 = [value.lines[offset], value.lines[offset + 1], value.lines[offset + 2]]
          near(point[2], 0); expect(point[0], label + ' left the original right meridian').toBeGreaterThanOrEqual(-1e-8)
          near(Math.hypot(...point), 3, 1e-6)
        }
      }
    })
    expect(seamCount).toBe(1); poles(collapsed)
    for (const engine of [native, rendered]) {
      const reference = { ...inventory.bodies[0].faces[0] }
      expect(reference.sourceFeatureId).toBe('sphere-revolve'); expect(reference.key.startsWith('face-v1|')).toBe(true)
      expect(() => engine.inspectCurrentFaceSupport(reference, bodyRef)).toThrow(UnsupportedAssemblySurfaceError)
      expect(() => engine.inspectCurrentCylinderSurfaceSupport(reference, bodyRef)).toThrow(UnsupportedAssemblyCylinderSurfaceError)
    }
    expect(serializeDocument(document)).toBe(saved); expect(serializeDocument(reopened)).toBe(saved)
  }, undefined, 'Persisted full sphere gate or native cleanup failed.')
}, 60_000)
