import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { Shape, cast, getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { exportAssemblyCadNative, MAX_ASSEMBLY_EXPORT_BODY_ENTRIES, MAX_ASSEMBLY_EXPORT_BYTES, MAX_ASSEMBLY_EXPORT_SOLIDS } from './kernel.assembly-export'
import { CadEngine } from './kernel.engine'
import * as placements from './kernel.assembly-placements'
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import { stepLengthUnit } from './kernel.step-units'
import type { Feature } from './kernel.types'

let original: AssemblyDocument, nextRead = 0
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
  original = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-flat-export-original.json', import.meta.url), 'utf8'))
}, 60_000)
const fixture = () => validateAssemblyDocument(original)
const near = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const prefix = '/solidflow-assembly-export-'
type Metrics = { volume: number; area: number; bounds: number[][] }
const boxes: Metrics[] = [
  { volume: 240, area: 248, bounds: [[6, 1, -7], [10, 11, -1]] },
  { volume: 24, area: 52, bounds: [[7, -2, 1], [10, 0, 5]] },
  { volume: 6, area: 22, bounds: [[8, 8, 1], [10, 9, 4]] },
  { volume: 240, area: 248, bounds: [[43, 0, -8], [53, 4, -2]] },
  { volume: 24, area: 52, bounds: [[40, 0, 0], [42, 3, 4]] },
  { volume: 6, area: 22, bounds: [[50, 0, 0], [51, 2, 3]] },
  { volume: 240, area: 248, bounds: [[6, 1, -7], [10, 11, -1]] },
]
function measure(shape: Shape3D): Metrics {
  return withNativeOwners(owners => {
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
    expect(analyzer.IsValid()).toBe(true)
    oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false)
    oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
    return { volume: volume.Mass(), area: area.Mass(), bounds: owners.own(shape.boundingBox).bounds }
  })
}
function metrics(actual: Metrics[], expected: Metrics[]): void {
  const key = (item: Metrics) => item.bounds.flat().map(value => Math.round(value * 1e5)).join(',')
  actual.sort((a, b) => key(a).localeCompare(key(b))); expected = [...expected].sort((a, b) => key(a).localeCompare(key(b)))
  expect(actual).toHaveLength(expected.length)
  actual.forEach((item, i) => {
    near(item.volume, expected[i].volume); near(item.area, expected[i].area)
    item.bounds.forEach((side, j) => side.forEach((value, axis) => near(value, expected[i].bounds[j][axis])))
  })
}
/** Fresh reader accepts multiple native solids; the production part importer stays single-solid. */
async function readStep(blob: Blob, inspect?: (shape: Shape3D, index: number) => void): Promise<Metrics[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  expect(stepLengthUnit(bytes)).toEqual({ millimetersPerUnit: 1 })
  return withNativeOwners(owners => {
    const oc = getOC(), path = `/solidflow-flat-export-read-${++nextRead}.step`
    owners.own({ delete: () => { if (oc.FS.readdir('/').includes(path.slice(1))) oc.FS.unlink(path) } })
    oc.FS.writeFile(path, bytes)
    const reader = owners.own(new oc.STEPControl_Reader())
    expect(reader.ReadFile(path)).toBe(oc.IFSelect_ReturnStatus.IFSelect_RetDone)
    reader.SetSystemLengthUnit(1); expect(reader.SystemLengthUnit()).toBe(1)
    const roots = reader.NbRootsForTransfer(); expect(roots).toBeGreaterThan(0); expect(reader.TransferRoots()).toBe(roots)
    const raw = owners.own(reader.OneShape()), explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), result: Metrics[] = []
    expect(raw.IsNull()).toBe(false)
    while (explorer.More()) {
      const current = owners.own(explorer.Current()), shape = owners.own(cast(current)).asShape3D()
      result.push(measure(shape)); inspect?.(shape, result.length - 1); explorer.Next()
    }
    return result
  })
}
function single(explicit = false): AssemblyDocument {
  const result = fixture(), part = result.definitions.find((item): item is EmbeddedPartDefinition => item.kind === 'part' && item.id === (explicit ? 'flat-explicit' : 'flat-legacy'))!
  if (explicit) part.document.features = part.document.features.slice(0, 2)
  result.definitions = [part]
  result.occurrences = [{ id: 'single', name: 'Single original solid', definition: { id: part.id, revision: part.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }]
  return validateAssemblyDocument(result)
}
function noFiles(): void { expect(getOC().FS.readdir('/').filter((name: string) => name.startsWith('solidflow-assembly-export-'))).toEqual([]) }
function caught(operation: () => unknown): unknown { try { operation() } catch (error) { return error } return undefined }
function failureTree(error: unknown): unknown[] { return error instanceof AggregateError ? [error, ...error.errors.flatMap(failureTree)] : [error] }

it('exports every original nested, reused, hidden and coincident solid as fresh millimetre STEP, without source mutation or hierarchy claims', async () => {
  const value = fixture(), saved = serializeAssemblyDocument(value), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), mesh = vi.spyOn(Shape.prototype, 'mesh'), edges = vi.spyOn(Shape.prototype, 'meshEdges')
  let blob: Blob
  try {
    blob = exportAssemblyCadNative(value, 'step')
    expect(blob.type).toBe('application/step'); expect(blob.size).toBeGreaterThan(0)
    expect(build).toHaveBeenCalledTimes(2); expect(mesh).not.toHaveBeenCalled(); expect(edges).not.toHaveBeenCalled()
    expect(serializeAssemblyDocument(value)).toBe(saved); noFiles()
  } finally { build.mockRestore(); mesh.mockRestore(); edges.mockRestore() }
  const text = await blob.text()
  expect(text).not.toMatch(/NEXT_ASSEMBLY_USAGE_OCCURRENCE|flat-subassembly|legacy-child|multi-child/)
  const actual = await readStep(blob)
  metrics(actual, boxes); near(actual.reduce((sum, item) => sum + item.volume, 0), 780); near(actual.reduce((sum, item) => sum + item.area, 0), 892)
  // In particular the two identical bounds retain two separate solids, not one union.
  expect(actual.filter(item => Math.abs(item.bounds[0][0] - 6) < 1e-5)).toHaveLength(2)
}, 60_000)

it('exports binary STL with all 84 outward box facets, independently measured area/volume and exact committed placements', async () => {
  const value = fixture(), saved = serializeAssemblyDocument(value), bytes = new Uint8Array(await exportAssemblyCadNative(value, 'stl').arrayBuffer()), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(bytes.byteLength).toBe(4284); expect(view.getUint32(80, true)).toBe(84)
  let volume = 0, area = 0
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity]
  for (let offset = 84; offset < bytes.length; offset += 50) {
    const normal = [0, 1, 2].map(axis => view.getFloat32(offset + axis * 4, true)), points = [0, 1, 2].map(vertex => [0, 1, 2].map(axis => view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true)))
    expect([...normal, ...points.flat()].every(Number.isFinite)).toBe(true); near(Math.hypot(...normal), 1, 1e-6)
    const [a, b, c] = points, ab = b.map((value, axis) => value - a[axis]), ac = c.map((value, axis) => value - a[axis]), cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], twiceArea = Math.hypot(...cross)
    expect(twiceArea).toBeGreaterThan(0); near(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0), twiceArea, 1e-5)
    const source = boxes.find(item => points.every(point => point.every((value, axis) => value >= item.bounds[0][axis] - 1e-6 && value <= item.bounds[1][axis] + 1e-6)))
    expect(source).toBeDefined()
    const axis = normal.findIndex(value => Math.abs(value) > .99); expect(axis).toBeGreaterThanOrEqual(0)
    points.forEach(point => near(point[axis], source!.bounds[normal[axis] > 0 ? 1 : 0][axis], 1e-6))
    const bc = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]
    volume += a.reduce((sum, value, axis) => sum + value * bc[axis], 0) / 6; area += twiceArea / 2
    points.forEach(point => point.forEach((value, axis) => { minimum[axis] = Math.min(minimum[axis], value); maximum[axis] = Math.max(maximum[axis], value) }))
    expect(view.getUint16(offset + 48, true)).toBe(0)
  }
  near(volume, 780); near(area, 892)
  ;[minimum, maximum].forEach((side, i) => side.forEach((value, axis) => near(value, [[6, -2, -8], [53, 11, 5]][i][axis], 1e-6)))
  expect(serializeAssemblyDocument(value)).toBe(saved); noFiles()
}, 60_000)

it('retains separate partially overlapping solids instead of fusing their material', async () => {
  const value = single(), second = structuredClone(value.occurrences[0]); second.id = 'overlap'; second.pose.translation = [5, 0, 0]; value.occurrences.push(second)
  metrics(await readStep(exportAssemblyCadNative(value, 'step')), [
    { volume: 240, area: 248, bounds: [[0, 0, 0], [10, 6, 4]] }, { volume: 240, area: 248, bounds: [[5, 0, 0], [15, 6, 4]] },
  ])
}, 60_000)

it('exports both native solids of one placed legacy aggregate through its single null body reference to STEP and binary STL', async () => {
  const value = single(), part = value.definitions[0] as EmbeddedPartDefinition
  part.document.features.push(
    { id: 'second-profile', name: 'Original disjoint legacy rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [20.5, 1], width: 1, height: 2 } },
    { id: 'second-prism', name: 'Original disjoint legacy prism', type: 'extrude', sketchId: 'second-profile', depth: 3, symmetric: false, suppressed: false },
  )
  value.occurrences[0].pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  // Hand-derived map (x,y,z) -> (10-y,20+x,30+z); the part's two
  // disconnected solids remain a single legacy/null body inventory entry.
  const expected: Metrics[] = [
    { volume: 240, area: 248, bounds: [[4, 20, 30], [10, 30, 34]] },
    { volume: 6, area: 22, bounds: [[8, 40, 30], [10, 41, 33]] },
  ], saved = serializeAssemblyDocument(value), copy = vi.spyOn(CadEngine.prototype, 'copyCurrentBodyShape')
  let step: Blob, stl: Blob
  try {
    step = exportAssemblyCadNative(value, 'step'); stl = exportAssemblyCadNative(value, 'stl')
    expect(copy.mock.calls.map(([reference]) => reference)).toEqual([null, null])
    expect(serializeAssemblyDocument(value)).toBe(saved); noFiles()
  } finally { copy.mockRestore() }
  const solids = await readStep(step)
  metrics(solids, expected); near(solids.reduce((sum, item) => sum + item.volume, 0), 246); near(solids.reduce((sum, item) => sum + item.area, 0), 270)
  const bytes = await stl.arrayBuffer(), view = new DataView(bytes)
  expect(bytes.byteLength).toBe(1284); expect(view.getUint32(80, true)).toBe(24)
  const groups = expected.map(item => ({ ...item, facets: 0, faceCounts: Array<number>(6).fill(0), volumeSum: 0, areaSum: 0 })), minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity]
  for (let offset = 84; offset < bytes.byteLength; offset += 50) {
    const normal = [0, 1, 2].map(axis => view.getFloat32(offset + axis * 4, true)), points = [0, 1, 2].map(vertex => [0, 1, 2].map(axis => view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true)))
    expect([...normal, ...points.flat()].every(Number.isFinite)).toBe(true); near(Math.hypot(...normal), 1, 1e-6); expect(view.getUint16(offset + 48, true)).toBe(0)
    const matches = groups.filter(group => points.every(point => point.every((coordinate, axis) => coordinate >= group.bounds[0][axis] - 1e-6 && coordinate <= group.bounds[1][axis] + 1e-6)))
    expect(matches).toHaveLength(1)
    const group = matches[0], axis = normal.findIndex(coordinate => Math.abs(coordinate) > .99), side = normal[axis] > 0 ? 1 : 0
    expect(axis).toBeGreaterThanOrEqual(0)
    points.forEach(point => near(point[axis], group.bounds[side][axis], 1e-6)); group.faceCounts[axis * 2 + side]++; group.facets++
    const [a, b, c] = points, ab = b.map((coordinate, i) => coordinate - a[i]), ac = c.map((coordinate, i) => coordinate - a[i]), product = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], magnitude = Math.hypot(...product)
    expect(magnitude).toBeGreaterThan(0); near(product.reduce((sum, coordinate, i) => sum + coordinate * normal[i], 0), magnitude, 1e-6)
    group.areaSum += magnitude / 2
    group.volumeSum += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    points.forEach(point => point.forEach((coordinate, i) => { minimum[i] = Math.min(minimum[i], coordinate); maximum[i] = Math.max(maximum[i], coordinate) }))
  }
  groups.forEach(group => { expect(group.facets).toBe(12); expect(group.faceCounts).toEqual([2, 2, 2, 2, 2, 2]); near(group.volumeSum, group.volume, 1e-6); near(group.areaSum, group.area, 1e-6) })
  near(groups.reduce((sum, group) => sum + group.volumeSum, 0), 246, 1e-6); near(groups.reduce((sum, group) => sum + group.areaSum, 0), 270, 1e-6)
  ;[minimum, maximum].forEach((side, i) => side.forEach((coordinate, axis) => near(coordinate, [[4, 20, 30], [10, 41, 34]][i][axis], 1e-6)))
  expect(serializeAssemblyDocument(value)).toBe(saved); noFiles()
}, 60_000)

it('rebuilds two opaque revisions of one ID independently and exports their distinct geometry', async () => {
  const value = single(), first = value.definitions[0] as EmbeddedPartDefinition, second = structuredClone(first)
  second.revision = 'r2'; (second.document.features[1] as Extract<Feature, { type: 'extrude' }>).depth = 8
  value.definitions.push(second); value.occurrences.push({ ...structuredClone(value.occurrences[0]), id: 'revision-two', definition: { id: first.id, revision: 'r2' }, pose: { ...identityRigidPose(), translation: [20, 0, 0] } })
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  let blob: Blob
  try { blob = exportAssemblyCadNative(value, 'step'); expect(build).toHaveBeenCalledTimes(2) } finally { build.mockRestore() }
  metrics(await readStep(blob), [{ volume: 240, area: 248, bounds: [[0, 0, 0], [10, 6, 4]] }, { volume: 480, area: 376, bounds: [[20, 0, 0], [30, 6, 8]] }])
}, 60_000)

it('exports committed geometry despite an incompatible declared mate, without solving or changing its intention', async () => {
  const value = single(), plane = { kind: 'principal-plane' as const, component: null, plane: 'XY' as const }
  value.mates.push({ id: 'incompatible', name: 'Original unsatisfied declaration', type: 'distance', first: plane, second: plane, alignment: 'aligned', distance: 5, suppressed: false })
  const saved = serializeAssemblyDocument(value)
  metrics(await readStep(exportAssemblyCadNative(value, 'step')), [{ volume: 240, area: 248, bounds: [[0, 0, 0], [10, 6, 4]] }])
  expect(serializeAssemblyDocument(value)).toBe(saved)
}, 60_000)

it('keeps explicit body references exact and leaves independently built source geometry and references valid', async () => {
  const value = fixture(), engine = new CadEngine(), part = value.definitions.find((item): item is EmbeddedPartDefinition => item.kind === 'part' && item.id === 'flat-explicit')!, inventory = engine.rebuildForAssemblyReferences(part.document.features)
  if (inventory.kind !== 'explicit') throw new Error('Original body inventory missing')
  const reference = inventory.bodies[0].ref, before = engine.inspectCurrentFaceSupport(inventory.bodies[0].faces[0], reference), copy = vi.spyOn(CadEngine.prototype, 'copyCurrentBodyShape')
  try {
    exportAssemblyCadNative(value, 'step')
    expect(copy.mock.calls.map(([body]) => body)).toEqual([null, { bodyId: 'A', sourceFeatureId: 'box-a' }, { bodyId: 'B', sourceFeatureId: 'box-b' }])
    expect(engine.inspectCurrentFaceSupport(inventory.bodies[0].faces[0], reference)).toEqual(before)
    withNativeOwners(owners => metrics([measure(owners.own(engine.copyCurrentBodyShape(reference)))], [{ volume: 24, area: 52, bounds: [[0, 0, 0], [2, 3, 4]] }]))
  } finally { copy.mockRestore(); engine.dispose() }
}, 60_000)

it('owns the validated source before callbacks can mutate the caller document', async () => {
  const value = single(), actual = CadEngine.prototype.rebuildForAssemblyReferences
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, features) {
    const result = actual.call(this, features); value.occurrences[0].pose.translation[0] = 1000; return result
  })
  let blob: Blob
  try { blob = exportAssemblyCadNative(value, 'step') } finally { spy.mockRestore() }
  metrics(await readStep(blob), [{ volume: 240, area: 248, bounds: [[0, 0, 0], [10, 6, 4]] }]); expect(value.occurrences[0].pose.translation[0]).toBe(1000)
}, 60_000)

it('preserves native cylindrical STEP surfaces and uses the declared approximate STL policy', async () => {
  const value = single(), part = value.definitions[0] as EmbeddedPartDefinition
  part.document.features = [
    { id: 'disk', name: 'Original R2 circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'cylinder', name: 'Original cylinder 12', type: 'extrude', sketchId: 'disk', depth: 12, symmetric: false, suppressed: false },
  ]
  metrics(await readStep(exportAssemblyCadNative(value, 'step'), shape => withNativeOwners(owners => {
    const faces = owners.ownAll(ownedNativeTopology(shape, 'face'))
    expect(faces.map(face => owners.own(face.surface).surfaceType).sort()).toEqual(['CYLINDRE', 'PLANE', 'PLANE'].sort())
  })), [{ volume: 48 * Math.PI, area: 56 * Math.PI, bounds: [[-2, -2, 0], [2, 2, 12]] }])
  const oc = getOC(), mesh = vi.spyOn(oc.StlAPI, 'Write')
  try {
    const blob = exportAssemblyCadNative(value, 'stl')
    expect(mesh).toHaveBeenCalledTimes(1); expect(mesh.mock.calls[0][2]).toBe(false)
    const bytes = await blob.arrayBuffer(), view = new DataView(bytes), facets = view.getUint32(80, true)
    expect(facets).toBeGreaterThan(12); expect(bytes.byteLength).toBe(84 + 50 * facets)
    let volume = 0
    for (let offset = 84; offset < bytes.byteLength; offset += 50) {
      const [a, b, c] = [0, 1, 2].map(vertex => [0, 1, 2].map(axis => view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true)))
      expect([...a, ...b, ...c].every(Number.isFinite)).toBe(true)
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
    near(volume, 48 * Math.PI, 1)
  } finally { mesh.mockRestore() }
}, 60_000)

it.each(['empty assembly', 'active empty part', 'native feature failure'] as const)('rejects the entire %s before any placement or file publication', fault => {
  const value = fixture()
  if (fault === 'empty assembly') value.occurrences = []
  else if (fault === 'active empty part') value.occurrences.find(item => item.id === 'suppressed-empty')!.suppressed = false
  else {
    const part = value.definitions.find((item): item is EmbeddedPartDefinition => item.kind === 'part' && item.id === 'flat-legacy')!
    part.document.features.push(
      { id: 'outside-profile', name: 'Original disjoint cut circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [1000, 1000], radius: 1 } },
      { id: 'outside-cut', name: 'Original impossible cut', type: 'cut', sketchId: 'outside-profile', depth: 4, symmetric: false, suppressed: false },
    )
  }
  const saved = serializeAssemblyDocument(value), place = vi.spyOn(placements, 'placeAssemblyShape')
  try { expect(() => exportAssemblyCadNative(value, 'step')).toThrow(/activos|activa|reconstruir/); expect(place).not.toHaveBeenCalled(); expect(serializeAssemblyDocument(value)).toBe(saved); noFiles() } finally { place.mockRestore() }
}, 60_000)

it.each(['csv', 'STEP', '', null] as const)('rejects invalid format %s before native reconstruction', format => {
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  try { expect(() => exportAssemblyCadNative(fixture(), format as never)).toThrow('Formato'); expect(build).not.toHaveBeenCalled() } finally { build.mockRestore() }
})

// These are injected cardinality admission checks over real small native builds,
// not a capacity or performance claim for 4096 independently constructed bodies.
it.each([4096, 4097])('admits prototype metadata count %i only through the inclusive 4096 boundary', count => {
  const value = single(true), actual = CadEngine.prototype.rebuildForAssemblyReferences, stop = new Error('Original post-admission copy sentinel')
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, features) {
    const inventory = actual.call(this, features)
    if (inventory.kind !== 'explicit') throw new Error('Original explicit inventory missing')
    return { ...inventory, bodies: Array.from({ length: count }, () => structuredClone(inventory.bodies[0])) }
  }), copy = vi.spyOn(CadEngine.prototype, 'copyCurrentBodyShape').mockImplementation(() => { throw stop })
  try {
    const error = caught(() => exportAssemblyCadNative(value, 'step'))
    if (count === 4096) { expect(error).toBe(stop); expect(copy).toHaveBeenCalledTimes(1) }
    else { expect(String(error)).toContain('prototipos'); expect(copy).not.toHaveBeenCalled() }
    noFiles()
  } finally { build.mockRestore(); copy.mockRestore() }
}, 60_000)

it.each([false, true])('checks expanded body metadata at 4096/+1 before copies (extra=%s)', extra => {
  const value = single(true), second = structuredClone(value.occurrences[0]); second.id = 'reused'; value.occurrences.push(second)
  if (extra) {
    const part = structuredClone(value.definitions[0]) as EmbeddedPartDefinition; part.id = part.document.id = 'other-part'; value.definitions.push(part)
    value.occurrences.push({ ...structuredClone(second), id: 'other', definition: { id: part.id, revision: part.revision } })
  }
  const actual = CadEngine.prototype.rebuildForAssemblyReferences, stop = new Error('Original expanded-admission sentinel'); let first = true
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, features) {
    const inventory = actual.call(this, features)
    if (inventory.kind !== 'explicit' || !first) return inventory
    first = false; return { ...inventory, bodies: Array.from({ length: 2048 }, () => structuredClone(inventory.bodies[0])) }
  }), copy = vi.spyOn(CadEngine.prototype, 'copyCurrentBodyShape').mockImplementation(() => { throw stop })
  try {
    const error = caught(() => exportAssemblyCadNative(value, 'step'))
    if (extra) { expect(String(error)).toContain('entradas de cuerpo expandidas'); expect(copy).not.toHaveBeenCalled() }
    else { expect(error).toBe(stop); expect(copy).toHaveBeenCalledTimes(1) }
    noFiles()
  } finally { build.mockRestore(); copy.mockRestore() }
}, 60_000)

function repeatedNativeSolid(shape: Shape3D, count: number): Shape3D {
  return withNativeOwners(owners => {
    const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound())
    builder.MakeCompound(raw)
    for (let i = 0; i < count; i++) builder.Add(raw, shape.wrapped)
    return owners.own(cast(raw)).asShape3D()
  }, result => [result])
}
it.each([4095, 4096, 4097])('checks actual native SOLID visits at %i with bounded enumeration and no truncated export', count => {
  const value = single(), other = structuredClone(value.definitions[0]) as EmbeddedPartDefinition; other.id = other.document.id = 'second-part'
  value.definitions.push(other); value.occurrences.push({ ...structuredClone(value.occurrences[0]), id: 'second', definition: { id: other.id, revision: other.revision } })
  const actual = CadEngine.prototype.copyCurrentBodyShape, stop = new Error('Original solid-admission placement sentinel'); let first = true
  const copy = vi.spyOn(CadEngine.prototype, 'copyCurrentBodyShape').mockImplementation(function (this: CadEngine, reference) {
    if (!first) return actual.call(this, reference)
    first = false
    return withNativeOwners(owners => {
      const source = owners.own(actual.call(this, reference))
      // Repeating one real native child injects visitation cardinality only;
      // this is not 4096 independent physical solids or an accepted export.
      return owners.own(repeatedNativeSolid(source, count))
    }, result => [result])
  }), place = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation(() => { throw stop })
  try {
    const error = caught(() => exportAssemblyCadNative(value, 'step'))
    if (count === 4095) { expect(error).toBe(stop); expect(place).toHaveBeenCalledTimes(1) }
    else { expect(String(error)).toContain('4096 sólidos'); expect(place).not.toHaveBeenCalled() }
    noFiles()
  } finally { copy.mockRestore(); place.mockRestore() }
}, 60_000)

interface Observed { value: NativeOwner; context: string; releases: number }
function observe<T>(records: Observed[], patch: (record: Observed) => void, operation: () => T): T {
  const actual = ownership.withNativeOwners, seen = new Set<NativeOwner>()
  const implementation: typeof actual = <R>(action: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(owners => {
    if (context?.startsWith('Assembly ')) {
      const own = owners.own.bind(owners)
      owners.own = <S extends NativeOwner>(value: S): S => {
        if (!seen.has(value)) {
          seen.add(value); const record = { value, context, releases: 0 }; records.push(record); patch(record)
          const release = value.delete.bind(value)
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { record.releases++; release() } })
        }
        return own(value)
      }
    }
    return action(owners)
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { return operation() } finally { spy.mockRestore() }
}
function patchMethod<T extends object, K extends keyof T>(target: T, name: K, failure: Error): void {
  const method = target[name] as (...args: unknown[]) => unknown
  Object.defineProperty(target, name, { configurable: true, value: (...args: unknown[]) => { method.apply(target, args); throw failure } })
}
function settings(): unknown[] {
  const oc = getOC()
  return [oc.Interface_Static.CVal('xstep.cascade.unit'), oc.Interface_Static.CVal('write.step.unit'), oc.Interface_Static.IVal('write.step.schema'), oc.Interface_Static.IVal('write.step.assembly')]
}

it.each(['step', 'stl'] as const)('releases every received export owner exactly once before returning %s bytes', format => {
  const records: Observed[] = []
  const blob = observe(records, () => {}, () => exportAssemblyCadNative(single(), format))
  expect(blob.size).toBeGreaterThan(0); expect(records.length).toBeGreaterThan(0); records.forEach(record => expect(record.releases).toBe(1)); noFiles()
}, 60_000)

it.each(['compound add', 'compound validation', 'STEP transfer', 'STEP write', 'STEP writer release', 'STL mesh query', 'prototype release'] as const)('withholds all bytes and drains owners after actual %s failure', fault => {
  const oc = getOC(), records: Observed[] = [], failure = new Error('Original flat export native fault')
  // Initialize STEP settings before capturing their original values.
  withNativeOwners(owners => { owners.own(new oc.STEPControl_Writer()) })
  const before = settings(), value = single(), saved = serializeAssemblyDocument(value); let patched = false
  const error = caught(() => observe(records, record => {
    if (patched) return
    const { value, context } = record
    if (fault === 'compound add' && context === 'Assembly flat export or release failed.' && value instanceof oc.TopoDS_Builder) { patchMethod(value, 'Add', failure); patched = true }
    else if (fault === 'compound validation' && context === 'Assembly flat export or release failed.' && value instanceof oc.BRepCheck_Analyzer) { patchMethod(value, 'IsValid', failure); patched = true }
    else if (fault.startsWith('STEP') && value instanceof oc.STEPControl_Writer) { patchMethod(value, fault === 'STEP transfer' ? 'Transfer' : fault === 'STEP write' ? 'Write' : 'delete', failure); patched = true }
    else if (fault === 'STL mesh query' && value instanceof oc.BRepMesh_IncrementalMesh) { patchMethod(value, 'GetStatusFlags', failure); patched = true }
    else if (fault === 'prototype release' && context === 'Assembly flat export or release failed.' && records.length === 1) { patchMethod(value, 'delete', failure); patched = true }
  }, () => exportAssemblyCadNative(value, fault === 'STL mesh query' ? 'stl' : 'step')))
  expect(patched).toBe(true); expect(failureTree(error)).toContain(failure)
  if (fault.endsWith('release')) expect(error).toBeInstanceOf(NativeCleanupError)
  records.forEach(record => expect(record.releases).toBe(1)); expect(settings()).toEqual(before); expect(serializeAssemblyDocument(value)).toBe(saved); noFiles()
  expect(exportAssemblyCadNative(single(), 'step').size).toBeGreaterThan(0)
}, 60_000)

it('rejects a native STL write failure after real file production and releases mesh/file/shape owners', () => {
  const oc = getOC(), actual = oc.StlAPI.Write.bind(oc.StlAPI), failure = new Error('Original STL write fault'), records: Observed[] = []
  const spy = vi.spyOn(oc.StlAPI, 'Write').mockImplementation((...args) => { actual(...args); throw failure })
  try { expect(caught(() => observe(records, () => {}, () => exportAssemblyCadNative(single(), 'stl')))).toBe(failure); records.forEach(record => expect(record.releases).toBe(1)); noFiles() } finally { spy.mockRestore() }
}, 60_000)

it.each(['read', 'unlink', 'restore setting'] as const)('treats an actual %s failure as fatal before Blob publication', fault => {
  const oc = getOC(), failure = new Error('Original export file/setting fault'), records: Observed[] = []
  withNativeOwners(owners => { owners.own(new oc.STEPControl_Writer()) })
  const before = settings(), read = oc.FS.readFile.bind(oc.FS), unlink = oc.FS.unlink.bind(oc.FS), set = oc.Interface_Static.SetCVal.bind(oc.Interface_Static)
  let patched = false, writes = 0
  const readSpy = vi.spyOn(oc.FS, 'readFile').mockImplementation((path, options) => {
    const bytes = read(path, options as { encoding: 'binary' })
    if (fault === 'read' && path.startsWith(prefix)) { patched = true; throw failure }
    return bytes
  }), unlinkSpy = vi.spyOn(oc.FS, 'unlink').mockImplementation(path => {
    unlink(path)
    if (fault === 'unlink' && path.startsWith(prefix)) { patched = true; throw failure }
  }), setSpy = vi.spyOn(oc.Interface_Static, 'SetCVal').mockImplementation((name, value) => {
    const result = set(name, value)
    if (name === 'xstep.cascade.unit' && ++writes === 2 && fault === 'restore setting') { patched = true; throw failure }
    return result
  })
  try {
    const error = caught(() => observe(records, () => {}, () => exportAssemblyCadNative(single(), 'step')))
    expect(patched).toBe(true); expect(failureTree(error)).toContain(failure)
    if (fault !== 'read') expect(error).toBeInstanceOf(NativeCleanupError)
    records.forEach(record => expect(record.releases).toBe(1)); expect(settings()).toEqual(before); noFiles()
  } finally { readSpy.mockRestore(); unlinkSpy.mockRestore(); setSpy.mockRestore() }
}, 60_000)

it.each([0, MAX_ASSEMBLY_EXPORT_BYTES + 1])('rejects output size %i before reading or publishing native bytes', size => {
  const oc = getOC(), stat = oc.FS.stat.bind(oc.FS), read = vi.spyOn(oc.FS, 'readFile')
  const spy = vi.spyOn(oc.FS, 'stat').mockImplementation((path, ...args) => { const result = stat(path, ...args); return path.startsWith(prefix) ? { ...result, size } : result })
  try { expect(() => exportAssemblyCadNative(single(), 'step')).toThrow('vacía o supera 256 MiB'); expect(read.mock.calls.some(([path]) => path.startsWith(prefix))).toBe(false); noFiles() } finally { spy.mockRestore(); read.mockRestore() }
}, 60_000)

it('rejects a truncated file read rather than publishing a prefix and deletes the actual complete native file', () => {
  const oc = getOC(), actual = oc.FS.readFile.bind(oc.FS)
  const spy = vi.spyOn(oc.FS, 'readFile').mockImplementation((path, options) => {
    const bytes = actual(path, options as { encoding: 'binary' }); return path.startsWith(prefix) ? bytes.subarray(0, bytes.length - 1) : bytes
  })
  try { expect(() => exportAssemblyCadNative(single(), 'step')).toThrow('incompletos'); noFiles() } finally { spy.mockRestore() }
}, 60_000)

it('forces millimetres and restores another export unit/schema/assembly setting on success', async () => {
  const oc = getOC(); withNativeOwners(owners => { owners.own(new oc.STEPControl_Writer()) })
  const before = settings()
  try {
    expect(oc.Interface_Static.SetCVal('xstep.cascade.unit', 'M')).toBe(true); expect(oc.Interface_Static.SetCVal('write.step.unit', 'INCH')).toBe(true)
    expect(oc.Interface_Static.SetIVal('write.step.schema', 3)).toBe(true); expect(oc.Interface_Static.SetIVal('write.step.assembly', 2)).toBe(true)
    const other = settings(), blob = exportAssemblyCadNative(single(), 'step')
    expect(settings()).toEqual(other)
    metrics(await readStep(blob), [{ volume: 240, area: 248, bounds: [[0, 0, 0], [10, 6, 4]] }])
  } finally {
    oc.Interface_Static.SetCVal('xstep.cascade.unit', before[0] as string); oc.Interface_Static.SetCVal('write.step.unit', before[1] as string)
    oc.Interface_Static.SetIVal('write.step.schema', before[2] as number); oc.Interface_Static.SetIVal('write.step.assembly', before[3] as number)
  }
}, 60_000)

it('returns owned bytes that survive later exports and declares the exact unchanged transport/capacity limits', async () => {
  const first = exportAssemblyCadNative(single(), 'step'), saved = new Uint8Array(await first.arrayBuffer())
  exportAssemblyCadNative(fixture(), 'stl'); expect(new Uint8Array(await first.arrayBuffer())).toEqual(saved); noFiles()
  expect(MAX_ASSEMBLY_EXPORT_BYTES).toBe(268435456); expect(MAX_ASSEMBLY_EXPORT_BODY_ENTRIES).toBe(4096); expect(MAX_ASSEMBLY_EXPORT_SOLIDS).toBe(4096)
}, 60_000)
