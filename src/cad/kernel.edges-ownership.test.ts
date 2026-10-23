import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { Curve, Edge, Shape, Surface, getOC, makeBox, makeCircle, makeLine, measureShapeVolumeProperties, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEdgeCatalog, pickableEdges } from './kernel.edges'
import * as catalogs from './kernel.edges'
import { extractAssemblyEdgeSupport, UnsupportedAssemblyCurveError } from './kernel.assembly-supports'
import * as supports from './kernel.assembly-supports'
import * as semanticCatalogs from './kernel.semantic-catalogs'
import * as provenance from './kernel.provenance'
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { CadEngine } from './kernel.engine'
import type { Feature } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
// Original Cartesian box. Expected edge-v1 JSON comes from twelve analytical
// unit-box edges and their two plane neighbors, independently of kernel catalogs.
function boxKeys(lineage: string): string[] {
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
  const topology = [12, 6, 1, [['LINE', 12]], [['PLANE', 6]]]
  return [0, 1, 2].flatMap(axis => [0, 1].flatMap(a => [0, 1].map(b => {
    const others = [0, 1, 2].filter(i => i !== axis), low = [0, 0, 0], high = [0, 0, 0]
    low[others[0]] = high[others[0]] = a; low[others[1]] = high[others[1]] = b; high[axis] = 1
    const middle = low.map((v, i) => (v + high[i]) / 2), samples = [low, middle, high].sort((x, y) => compare(JSON.stringify(x), JSON.stringify(y)))
    const neighbors = others.map((normalAxis, i) => {
      const side = [a, b][i], minimum = [0, 0, 0], maximum = [1, 1, 1], normal = [0, 0, 0]
      minimum[normalAxis] = maximum[normalAxis] = side; normal[normalAxis] = side ? 1 : -1
      return JSON.stringify(['PLANE', [minimum, maximum], normal])
    }).sort()
    return 'edge-v1|' + JSON.stringify([lineage, topology, 'LINE', false, [low, high], samples, neighbors])
  })))
}
interface Observed { value: NativeOwner; context?: string; releases: number }
function observe<T>(records: Observed[], patch: (record: Observed) => void, operation: () => T): T {
  const actual = ownership.withNativeOwners, seen = new Set<NativeOwner>()
  const implementation: typeof actual = <R>(action: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(owners => {
    if (context?.startsWith('Native edge ') || context === 'Native topology enumeration or release failed.' || context === 'Assembly edge support extraction or release failed.') {
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
function caught(operation: () => unknown): unknown { try { operation() } catch (error) { return error } return undefined }
function failureTree(value: unknown): unknown[] { return value instanceof AggregateError ? [value, ...value.errors.flatMap(failureTree)] : [value] }
function sourceValid(source: ReturnType<typeof makeBox>) {
  withNativeOwners(owners => {
    expect(owners.own(new (getOC().BRepCheck_Analyzer)(source.wrapped, true, false, false)).IsValid()).toBe(true)
    expect(Math.abs(owners.own(measureShapeVolumeProperties(source)).volume - 24)).toBeLessThan(1e-8)
  })
}
function features(semantic = false, depth = 4): Feature[] {
  return [{ id: 'profile', name: 'Original edge profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: semantic ? { kind: 'entities', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }, { id: 'c', x: 2, y: 3 }, { id: 'd', x: 0, y: 3 }],
      entities: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([start, end], i) => ({ id: 'line-' + i, type: 'line' as const, start, end, construction: false })), constraints: [] }
      : { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
    { id: 'base', name: 'Original edge extrusion', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false }]
}

it.each(['', 'original-edge-lineage'])('preserves all independent Cartesian edge-v1 keys and borrowed source geometry for lineage %j', lineage => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), records: Observed[] = []
  observe(records, () => {}, () => {
    const catalog = createEdgeCatalog(source, 'box', lineage)
    try { expect(catalog.entries.map(entry => entry.ref.key).sort()).toEqual(boxKeys(lineage).sort()) } finally { catalog.dispose(); catalog.dispose() }
  })
  expect(records.length).toBeGreaterThan(0); records.forEach(record => expect(record.releases).toBe(1)); sourceValid(source)
}), 60_000)

it('uses only explicitly owned curves and raw sample points for the unchanged edge naming descriptor', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), records: Observed[] = []
  observe(records, record => {
    if (record.value instanceof Curve) Object.defineProperty(record.value, 'pointAt', { configurable: true, value: () => { throw new Error('Hidden point allocation') } })
  }, () => { const catalog = createEdgeCatalog(source, 'box'); try { expect(catalog.entries.map(entry => entry.ref.key).sort()).toEqual(boxKeys('').sort()) } finally { catalog.dispose() } })
  expect(records.filter(record => record.value instanceof Curve)).toHaveLength(24)
  expect(records.filter(record => record.context === 'Native edge sample query or release failed.' && record.value instanceof getOC().gp_Pnt)).toHaveLength(36)
  records.forEach(record => expect(record.releases).toBe(1)); sourceValid(source)
}), 60_000)

it.each(['face type', 'adjacency', 'sample', 'curve release', 'raw release'] as const)('releases every acquired owner and withholds the catalog after a real %s failure', fault => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), records: Observed[] = [], failure = new Error('Original edge ownership fault')
  let patched = false
  const result = caught(() => observe(records, record => {
    if (patched) return
    const value = record.value, oc = getOC()
    if (fault === 'face type' && value instanceof Surface) {
      patched = true; const query = value.wrapped.GetType.bind(value.wrapped)
      Object.defineProperty(value.wrapped, 'GetType', { configurable: true, value: () => { query(); throw failure } })
    } else if (fault === 'adjacency' && value instanceof oc.BRepGProp_Face) {
      patched = true; const query = value.Normal.bind(value)
      Object.defineProperty(value, 'Normal', { configurable: true, value: (...args: Parameters<typeof query>) => { query(...args); throw failure } })
    } else if (fault === 'sample' && record.context === 'Native edge sample query or release failed.' && value instanceof oc.gp_Pnt) {
      patched = true; const query = value.X.bind(value)
      Object.defineProperty(value, 'X', { configurable: true, value: () => { query(); throw failure } })
    } else if (fault === 'curve release' && value instanceof Curve || fault === 'raw release' && !(value instanceof Shape) && value instanceof oc.TopoDS_Shape) {
      patched = true; const release = value.delete.bind(value)
      Object.defineProperty(value, 'delete', { configurable: true, value: () => { release(); throw failure } })
    }
  }, () => createEdgeCatalog(source, 'box')))
  expect(patched).toBe(true)
  if (fault.endsWith('release')) expect(result).toBeInstanceOf(NativeCleanupError); else expect(result).toBe(failure)
  records.forEach(record => expect(record.releases).toBe(1)); sourceValid(source)
}), 60_000)

it('extracts a true LINE direction canonically regardless of edge orientation and rejects a real circle', () => withNativeOwners(owners => {
  const line = owners.own(makeLine([4, 3, 2], [-2, 3, 2])), raw = owners.own(line.wrapped.Reversed()),
    reversed = owners.own(new Edge(getOC().TopoDS.Edge(raw))), circle = owners.own(makeCircle(2))
  const first = extractAssemblyEdgeSupport(line), second = extractAssemblyEdgeSupport(reversed)
  first.axis.forEach((value, i) => expect(Math.abs(value - [1, 0, 0][i])).toBeLessThanOrEqual(1e-12)); expect(second.axis).toEqual(first.axis)
  expect(first.point.slice(1)).toEqual([3, 2]); expect(first.tolerance).toBe(getOC().BRep_Tool.Tolerance(line.wrapped))
  expect('xDirection' in first).toBe(false); expect(() => extractAssemblyEdgeSupport(circle)).toThrow(UnsupportedAssemblyCurveError)
  expect(line.wrapped.IsNull()).toBe(false); expect(circle.wrapped.IsNull()).toBe(false)
}), 60_000)

it.each(['coordinate query', 'coordinate release', 'derivative query', 'D1 query'] as const)('withholds native LINE data on %s failure and releases the extractor owners', fault => withNativeOwners(owners => {
  const line = owners.own(makeLine([0, 0, 0], [2, 0, 0])), records: Observed[] = [], failure = new Error('Original LINE fault'); let patched = false
  const result = caught(() => observe(records, record => {
    if (patched) return
    const value = record.value, oc = getOC()
    if ((fault === 'coordinate query' || fault === 'coordinate release') && value instanceof oc.gp_Pnt) {
      patched = true
      if (fault === 'coordinate query') {
        const query = value.X.bind(value)
        Object.defineProperty(value, 'X', { configurable: true, value: () => { query(); throw failure } })
      } else {
        const release = value.delete.bind(value)
        Object.defineProperty(value, 'delete', { configurable: true, value: () => { release(); throw failure } })
      }
    } else if (fault === 'derivative query' && value instanceof oc.gp_Vec) {
      patched = true; const query = value.X.bind(value)
      Object.defineProperty(value, 'X', { configurable: true, value: () => { query(); throw failure } })
    } else if (fault === 'D1 query' && value instanceof oc.BRepAdaptor_Curve) {
      patched = true; const query = value.D1.bind(value)
      Object.defineProperty(value, 'D1', { configurable: true, value: (...args: Parameters<typeof query>) => { query(...args); throw failure } })
    }
  }, () => extractAssemblyEdgeSupport(line)))
  expect(patched).toBe(true)
  if (fault === 'coordinate release') expect(result).toBeInstanceOf(NativeCleanupError); else expect(result).toBe(failure)
  records.forEach(record => expect(record.releases).toBe(1)); expect(line.wrapped.IsNull()).toBe(false)
}), 60_000)

it('retains one exact current edge catalog per immutable engine generation and retires it on rebuild and dispose', () => {
  const engine = new CadEngine(), actual = catalogs.createEdgeCatalog, releases: number[] = []
  const spy = vi.spyOn(catalogs, 'createEdgeCatalog').mockImplementation((...args) => {
    const catalog = actual(...args), index = releases.push(0) - 1, dispose = catalog.dispose
    return { ...catalog, dispose: () => { releases[index]++; dispose() } }
  })
  try {
    const result = engine.build(features())
    for (const edge of result.edges) expect(engine.inspectCurrentEdgeSupport(edge.ref, null).kind).toBe('line')
    expect(spy).toHaveBeenCalledTimes(1); expect(releases).toEqual([0])
    engine.build(features(false, 5)); expect(spy).toHaveBeenCalledTimes(2); expect(releases).toEqual([1, 0])
    engine.dispose(); expect(releases).toEqual([1, 1]); expect(() => engine.inspectCurrentEdgeSupport(result.edges[0].ref, null)).toThrow('vigente')
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it('resolves current semantic edge-v2 LINE references after their prism producer has retired', () => {
  const engine = new CadEngine(), result = engine.build(features(true))
  try {
    expect(result.featureErrors).toEqual([])
    const edge = result.edges.find(edge => edge.ref.key.startsWith('edge-v2|') && edge.lines.every((value, i) => i % 3 !== 2 || Math.abs(value) < 1e-9))
    if (!edge) throw new Error('Original semantic rim missing')
    const support = engine.inspectCurrentEdgeSupport(edge.ref, null)
    expect(support.kind).toBe('line'); expect(support.axis.every(Number.isFinite)).toBe(true)
    expect(() => engine.inspectCurrentEdgeSupport({ ...edge.ref, key: 'edge-v2|' + '0'.repeat(64) }, null)).toThrow(/identificar|versión/)
    expect(() => engine.inspectCurrentEdgeSupport(edge.ref, { bodyId: 'invented', sourceFeatureId: 'base' })).toThrow('catálogo')
  } finally { engine.dispose() }
}, 60_000)

it('retains a clean current catalog for unsupported circle edges while querying their native type afresh', () => {
  const input = features(); if (input[0].type !== 'sketch') throw new Error('Original sketch missing')
  input[0].profile = { kind: 'circle', center: [0, 0], radius: 2 }
  const engine = new CadEngine(), actual = catalogs.createEdgeCatalog
  const catalog = vi.spyOn(catalogs, 'createEdgeCatalog').mockImplementation(actual), query = vi.spyOn(supports, 'extractAssemblyEdgeSupport')
  let unsupported = 0
  try {
    const result = engine.build(input)
    for (let pass = 0; pass < 2; pass++) for (const edge of result.edges) {
      try { expect(engine.inspectCurrentEdgeSupport(edge.ref, null).kind).toBe('line') }
      catch (error) { expect(error).toBeInstanceOf(UnsupportedAssemblyCurveError); unsupported++ }
    }
    expect(unsupported).toBe(4); expect(catalog).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledTimes(2 * result.edges.length)
  } finally { catalog.mockRestore(); query.mockRestore(); engine.dispose() }
}, 60_000)

it('withholds support after real extraction and cleanup failures while retaining exact generation ownership for a fresh query', () => {
  const engine = new CadEngine(), result = engine.build(features()), records: Observed[] = []
  const primary = new Error('Original current edge query fault'), cleanup = new Error('Original current edge support release fault'); let patched = false
  try {
    const failure = caught(() => observe(records, record => {
      if (patched || !(record.value instanceof getOC().gp_Pnt)) return
      patched = true; const point = record.value as InstanceType<ReturnType<typeof getOC>['gp_Pnt']>, query = point.X.bind(point), release = point.delete.bind(point)
      Object.defineProperty(point, 'X', { configurable: true, value: () => { query(); throw primary } })
      Object.defineProperty(point, 'delete', { configurable: true, value: () => { release(); throw cleanup } })
    }, () => engine.inspectCurrentEdgeSupport(result.edges[0].ref, null)))
    expect(patched).toBe(true); expect(failure).toBeInstanceOf(NativeCleanupError)
    expect((failure as AggregateError).errors).toContain(primary); expect((failure as AggregateError).errors).toContain(cleanup)
    records.forEach(record => expect(record.releases).toBe(1))
    expect(engine.inspectCurrentEdgeSupport(result.edges[0].ref, null).kind).toBe('line')
  } finally { engine.dispose() }
}, 60_000)

it('retires all current native state even when its retained edge catalog release fails', () => {
  const engine = new CadEngine(), actual = catalogs.createEdgeCatalog; let released = 0
  const spy = vi.spyOn(catalogs, 'createEdgeCatalog').mockImplementation((...args) => {
    const catalog = actual(...args), release = catalog.dispose
    return { ...catalog, dispose: () => { released++; release(); throw new Error('Original retained edge release fault') } }
  })
  try {
    const result = engine.build(features())
    engine.inspectCurrentEdgeSupport(result.edges[0].ref, null)
    expect(() => engine.dispose()).toThrow(AggregateError); expect(released).toBe(1)
    expect(() => engine.inspectCurrentEdgeSupport(result.edges[0].ref, null)).toThrow('vigente')
    expect(() => engine.dispose()).not.toThrow()
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it.each([false, true])('rejects an edge inspection when its real native query reenters a newer source generation, semantic=%s', semantic => {
  const engine = new CadEngine(), result = engine.build(features(semantic)), query = supports.extractAssemblyEdgeSupport
  let changed = false, next: ReturnType<CadEngine['build']> | undefined
  const spy = vi.spyOn(supports, 'extractAssemblyEdgeSupport').mockImplementation(edge => {
    const support = query(edge)
    if (!changed) { changed = true; next = engine.build(features(semantic, 5)) }
    return support
  })
  try {
    expect(() => engine.inspectCurrentEdgeSupport(result.edges[0].ref, null)).toThrow('cambió')
    expect(changed).toBe(true); spy.mockRestore()
    expect(next?.featureErrors).toEqual([]); expect(engine.inspectCurrentEdgeSupport(next!.edges[0].ref, null).kind).toBe('line')
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it('keeps renderer edge meshes tied to their actual independently named native edge', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), edges = pickableEdges(source, 'box')
  expect(edges.map(edge => edge.ref.key).sort()).toEqual(boxKeys('').sort())
  for (const edge of edges) { expect(edge.lines.length).toBeGreaterThan(0); expect(edge.lines.length % 6).toBe(0); expect(edge.lines.every(Number.isFinite)).toBe(true) }
  const dimensions = [2, 3, 4], expected = [0, 1, 2].flatMap(axis => [0, 1].flatMap(a => [0, 1].map(b => {
    const others = [0, 1, 2].filter(i => i !== axis), first = [0, 0, 0], second = [0, 0, 0]
    first[others[0]] = second[others[0]] = a * dimensions[others[0]]
    first[others[1]] = second[others[1]] = b * dimensions[others[1]]; second[axis] = dimensions[axis]
    return JSON.stringify([first, second].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))))
  })))
  expect(edges.map(edge => {
    expect(edge.lines).toHaveLength(6)
    return JSON.stringify([edge.lines.slice(0, 3), edge.lines.slice(3)].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))))
  }).sort()).toEqual(expected.sort())
  sourceValid(source)
}), 60_000)

it('uses one exact body catalog for its DTO and fresh native support queries while preserving the separate aggregate picks', () => {
  const input = features(); if (input[1].type !== 'extrude') throw new Error('Original extrusion missing')
  input[1].bodyOperation = { mode: 'new', bodyId: 'original-owned-body' }
  const engine = new CadEngine(), actual = ownership.withNativeOwners, releases: number[] = []
  // The aggregate picker calls its local factory directly. Observe the actual
  // construction arena so both that catalog and the engine's imported one count.
  const implementation: typeof actual = <R>(action: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(owners => {
    const result = action(owners)
    if (context === 'Native edge catalog construction or release failed.') {
      const catalog = result as R & ReturnType<typeof createEdgeCatalog>, index = releases.push(0) - 1, release = catalog.dispose
      catalog.dispose = () => { releases[index]++; release() }
    }
    return result
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try {
    const result = engine.build(input), body = result.bodies![0]
    expect(releases).toEqual([0, 1])
    for (const edge of body.edges) expect(engine.inspectCurrentEdgeSupport(edge.ref, body.ref).kind).toBe('line')
    expect(releases).toEqual([0, 1])
    expect(result.edges).toHaveLength(12); expect(body.edges).toHaveLength(12)
    engine.dispose(); expect(releases).toEqual([1, 1])
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it('meshes one retained semantic catalog and reuses it for exact current v2 and v1-alias queries', () => {
  const engine = new CadEngine(), actual = semanticCatalogs.createSemanticEdgeCatalog; let released = 0
  const spy = vi.spyOn(semanticCatalogs, 'createSemanticEdgeCatalog').mockImplementation((...args) => {
    const catalog = actual(...args), release = catalog.dispose
    return { ...catalog, dispose: () => { released++; release() } }
  })
  try {
    const result = engine.build(features(true)); expect(spy).toHaveBeenCalledTimes(1); expect(released).toBe(0)
    for (const edge of result.edges) {
      expect(engine.inspectCurrentEdgeSupport(edge.ref, null).kind).toBe('line')
      for (const alias of edge.aliases ?? []) expect(engine.inspectCurrentEdgeSupport(alias, null).kind).toBe('line')
    }
    expect(spy).toHaveBeenCalledTimes(1); engine.dispose(); expect(released).toBe(1)
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it.each([false, true])('detaches every DTO edge key and alias from the retained native catalog, semantic=%s', semantic => {
  const engine = new CadEngine(), result = engine.build(features(semantic))
  try {
    const edge = result.edges.find(edge => !semantic || edge.ref.key.startsWith('edge-v2|'))!
    const reference = { ...edge.ref }, aliases = edge.aliases?.map(alias => ({ ...alias })) ?? []
    edge.ref.sourceFeatureId = 'renderer-other-state'; edge.ref.key = 'renderer-forged-edge'
    for (const alias of edge.aliases ?? []) { alias.sourceFeatureId = 'renderer-other-alias'; alias.key = 'renderer-forged-alias' }
    expect(engine.inspectCurrentEdgeSupport(reference, null).kind).toBe('line')
    for (const alias of aliases) expect(engine.inspectCurrentEdgeSupport(alias, null).kind).toBe('line')
    expect(() => engine.inspectCurrentEdgeSupport(edge.ref, null)).toThrow('estado final')
  } finally { engine.dispose() }
}, 60_000)

it('leaves a borrowed catalog owned and usable after a real edge mesh query fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), catalog = createEdgeCatalog(source, 'box')
  owners.own({ delete: () => catalog.dispose() })
  const edge = catalog.entries[0].edge, actual = edge.meshEdges.bind(edge), failure = new Error('Original borrowed mesh fault')
  const spy = vi.spyOn(edge, 'meshEdges').mockImplementation(options => { actual(options); throw failure })
  try {
    expect(() => catalogs.pickableEdgesFromCatalog(catalog)).toThrow(failure)
    expect(edge.wrapped.IsNull()).toBe(false); sourceValid(source)
  } finally { spy.mockRestore() }
  expect(catalogs.pickableEdgesFromCatalog(catalog)).toHaveLength(12)
}), 60_000)

it.each([{ body: false, cleanup: false }, { body: true, cleanup: false }, { body: false, cleanup: true }, { body: true, cleanup: true }])(
  'withholds a build and retires its current edge catalogs after real DTO mesh failure %j', parameters => {
    const engine = new CadEngine(), input = features(), actual = catalogs.createEdgeCatalog, mesh = catalogs.pickableEdgesFromCatalog
    if (parameters.body) {
      if (input[1].type !== 'extrude') throw new Error('Original extrusion missing')
      input[1].bodyOperation = { mode: 'new', bodyId: 'original-failed-body' }
    }
    const primary = new Error('Original current DTO mesh fault'), cleanup = new Error('Original current build edge release fault'); let released = 0
    const create = vi.spyOn(catalogs, 'createEdgeCatalog').mockImplementation((...args) => {
      const catalog = actual(...args), release = catalog.dispose
      return { ...catalog, dispose: () => { released++; release(); if (parameters.cleanup) throw cleanup } }
    })
    const render = vi.spyOn(catalogs, 'pickableEdgesFromCatalog').mockImplementation(catalog => {
      const result = mesh(catalog)
      expect(() => engine.inspectCurrentEdgeSupport(result[0].ref, null)).toThrow('reconstrucción completa')
      throw primary
    })
    try {
      const failure = caught(() => engine.build(input))
      expect(failureTree(failure)).toContain(primary); if (parameters.cleanup) expect(failureTree(failure)).toContain(cleanup)
      expect(released).toBe(1); expect(() => engine.inspectCurrentEdgeSupport({ sourceFeatureId: 'base', key: 'original-old-edge' }, null)).toThrow('reconstrucción completa')
      expect(() => engine.dispose()).not.toThrow(); expect(released).toBe(1)
      create.mockRestore(); render.mockRestore()
      const fresh = engine.build(input), body = fresh.bodies?.[0]
      expect(engine.inspectCurrentEdgeSupport((body?.edges ?? fresh.edges)[0].ref, body?.ref ?? null).kind).toBe('line')
    } finally { create.mockRestore(); render.mockRestore(); engine.dispose() }
  }, 60_000)

it('does not publish semantic inspection when the actual prism producer cleanup reports failure after final meshing', () => {
  const engine = new CadEngine(), producer = provenance.entityProfilePrismIfSingleRegion, create = semanticCatalogs.createSemanticEdgeCatalog
  let producerReleases = 0, catalogReleases = 0
  const prism = vi.spyOn(provenance, 'entityProfilePrismIfSingleRegion').mockImplementation((...args) => {
    const owner = producer(...args)
    if (!owner) throw new Error('Original simple prism missing')
    const release = owner.dispose.bind(owner)
    return { ...owner, dispose: () => { producerReleases++; return [...release(), 'Original producer cleanup fault'] } }
  })
  const catalog = vi.spyOn(semanticCatalogs, 'createSemanticEdgeCatalog').mockImplementation((...args) => {
    const result = create(...args), release = result.dispose
    return { ...result, dispose: () => { catalogReleases++; release() } }
  })
  try {
    expect(() => engine.build(features(true))).toThrow('Original producer cleanup fault')
    expect(prism).toHaveBeenCalledTimes(1); expect(catalog).toHaveBeenCalledTimes(1)
    expect(producerReleases).toBe(1); expect(catalogReleases).toBe(1)
    expect(() => engine.inspectCurrentEdgeSupport({ sourceFeatureId: 'base', key: 'original-semantic-edge' }, null)).toThrow('reconstrucción completa')
    expect(() => engine.dispose()).not.toThrow(); expect(catalogReleases).toBe(1)
  } finally { prism.mockRestore(); catalog.mockRestore(); engine.dispose() }
}, 60_000)
