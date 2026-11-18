import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { Surface, getOC, makeBox, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { CadEngine } from './kernel.engine'
import { createFaceCatalog, pickableFacesFromCatalog, resolveFaceReference, type FaceCatalog } from './kernel.faces'
import * as faces from './kernel.faces'
import * as edges from './kernel.edges'
import * as semantic from './kernel.semantic-catalogs'
import * as supports from './kernel.assembly-supports'
import * as provenance from './kernel.provenance'
import * as ownership from './kernel.native-ownership'
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import type { Feature, PickableFace } from './kernel.types'

// Original public Cartesian 2×3×4 box and R2/R3 cylinders; no external model.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
function features(v2 = false, body = false, depth = 4): Feature[] {
  return [{ id: 'profile', name: 'Original face profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: v2 ? { kind: 'entities', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }, { id: 'c', x: 2, y: 3 }, { id: 'd', x: 0, y: 3 }],
      entities: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([start, end], i) => ({ id: 'side-' + i, type: 'line' as const, start, end, construction: false })), constraints: [] }
      : { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
    { id: 'base', name: 'Original face extrusion', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
      ...(body ? { bodyOperation: { mode: 'new' as const, bodyId: 'original-face-body' } } : {}) }]
}
function close(actual: number, expected: number) { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-8) }
function caught(operation: () => unknown): unknown { try { operation() } catch (error) { return error } return undefined }
function failures(value: unknown): unknown[] { return value instanceof AggregateError ? [value, ...value.errors.flatMap(failures)] : [value] }
function top(values: readonly PickableFace[]) { return values.find(value => value.frame && value.frame.normal[2] > .99)! }
function observeCatalogs<T>(releases: number[], operation: () => T, failRelease?: Error): T {
  const actual = ownership.withNativeOwners
  const implementation: typeof actual = <R>(action: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(owners => {
    const result = action(owners)
    if (context === 'Native face catalog construction or release failed.') {
      const catalog = result as R & FaceCatalog, index = releases.push(0) - 1, release = catalog.dispose
      catalog.dispose = () => { releases[index]++; release(); if (failRelease) throw failRelease }
    }
    return result
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { return operation() } finally { spy.mockRestore() }
}

it.each([false, true])('reuses the generation-owned face catalog for DTO and fresh native queries, explicit body=%s', body => {
  const engine = new CadEngine(), releases: number[] = [], query = vi.spyOn(supports, 'extractAssemblyFaceSupport')
  try {
    observeCatalogs(releases, () => {
      const result = engine.build(features(false, body)), source = result.bodies?.[0], picks = source?.faces ?? result.faces!
      expect(releases).toEqual(body ? [0, 1] : [0])
      for (let pass = 0; pass < 2; pass++) for (const pick of picks) expect(engine.inspectCurrentFaceSupport(pick.ref, source?.ref ?? null).kind).toBe('plane')
      expect(query).toHaveBeenCalledTimes(12); expect(releases).toEqual(body ? [0, 1] : [0])
      engine.build(features(false, body, 5)); expect(releases).toEqual(body ? [1, 1, 0, 1] : [1, 0])
      engine.dispose(); expect(releases.every(count => count === 1)).toBe(true)
      expect(() => engine.inspectCurrentFaceSupport(picks[0].ref, source?.ref ?? null)).toThrow('vigente')
    })
  } finally { query.mockRestore(); engine.dispose() }
}, 60_000)

it('meshes one semantic face catalog and retains exact v2 identities and v1 aliases after producer retirement', () => {
  const engine = new CadEngine(), actual = semantic.createSemanticFaceCatalog; let released = 0
  const spy = vi.spyOn(semantic, 'createSemanticFaceCatalog').mockImplementation((...args) => {
    const catalog = actual(...args), release = catalog.dispose
    return { ...catalog, dispose: () => { released++; release() } }
  })
  try {
    const result = engine.build(features(true)); expect(spy).toHaveBeenCalledTimes(1); expect(released).toBe(0)
    expect(result.faces!.some(face => face.ref.key.startsWith('face-v2|'))).toBe(true)
    for (const pick of result.faces!) {
      expect(engine.inspectCurrentFaceSupport(pick.ref, null).kind).toBe('plane')
      for (const alias of pick.aliases ?? []) expect(engine.inspectCurrentFaceSupport(alias, null).kind).toBe('plane')
    }
    expect(spy).toHaveBeenCalledTimes(1)
    expect(() => engine.inspectCurrentFaceSupport({ sourceFeatureId: 'base', key: 'face-v2|' + '0'.repeat(64) }, null)).toThrow(/identificar|versión/)
    engine.dispose(); expect(released).toBe(1)
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it.each([false, true])('detaches DTO face references, aliases and frames from current native identity, semantic=%s', v2 => {
  const engine = new CadEngine(), result = engine.build(features(v2))
  try {
    const face = top(result.faces!), reference = { ...face.ref }, aliases = face.aliases?.map(alias => ({ ...alias })) ?? []
    const before = engine.inspectCurrentFaceSupport(reference, null)
    face.ref.key = 'renderer-face'; face.ref.sourceFeatureId = 'renderer-state'
    for (const alias of face.aliases ?? []) { alias.key = 'renderer-alias'; alias.sourceFeatureId = 'renderer-alias-state' }
    face.frame!.origin.fill(500); face.frame!.normal.fill(0); face.frame!.xDirection.fill(0)
    expect(engine.inspectCurrentFaceSupport(reference, null)).toEqual(before)
    for (const alias of aliases) expect(engine.inspectCurrentFaceSupport(alias, null)).toEqual(before)
    expect(() => engine.inspectCurrentFaceSupport(face.ref, null)).toThrow('estado final')
  } finally { engine.dispose() }
}, 60_000)

it('borrows the catalog for native face meshes and clones all three frame vectors', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), catalog = createFaceCatalog(source, 'box')
  owners.own({ delete: () => catalog.dispose() })
  const output = pickableFacesFromCatalog(catalog), face = top(output), entry = catalog.entries.find(entry => entry.ref.key === face.ref.key)!, original = structuredClone(entry.frame)
  const nativeMesh = entry.face.mesh({ tolerance: .05, angularTolerance: .12 })
  expect(face.vertices).toEqual(nativeMesh.vertices); expect(face.triangles).toEqual(nativeMesh.triangles)
  face.frame!.origin.fill(50); face.frame!.normal.fill(0); face.frame!.xDirection.fill(0); face.ref.key = 'renderer-borrowed-face'
  expect(entry.frame).toEqual(original); expect(resolveFaceReference(catalog, entry.ref, 'box')).toEqual(original)
  const native = supports.extractAssemblyFaceSupport(entry.face)
  if (native.kind !== 'plane') throw new Error('Original box plane missing')
  close(native.point[2], 4); close(native.normal[2], 1)
}), 60_000)

it('keeps a borrowed face catalog usable when an actual face mesh query fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), catalog = createFaceCatalog(source, 'box')
  owners.own({ delete: () => catalog.dispose() })
  const face = catalog.entries[0].face, actual = face.mesh.bind(face), failure = new Error('Original borrowed face mesh fault')
  const spy = vi.spyOn(face, 'mesh').mockImplementation(options => { actual(options); throw failure })
  try { expect(() => pickableFacesFromCatalog(catalog)).toThrow(failure); expect(face.wrapped.IsNull()).toBe(false) }
  finally { spy.mockRestore() }
  expect(pickableFacesFromCatalog(catalog)).toHaveLength(6)
}), 60_000)

it('queries the new actual cylinder radius after rebuilding the same engine', () => {
  const engine = new CadEngine(), input = features()
  if (input[0].type !== 'sketch') throw new Error('Original sketch missing')
  input[0].profile = { kind: 'circle', center: [0, 0], radius: 2 }
  try {
    const first = engine.build(input).faces!.map(face => engine.inspectCurrentFaceSupport(face.ref, null)).find(value => value.kind === 'cylinder')!
    expect(first.kind === 'cylinder' && first.radius).toBe(2)
    input[0].profile.radius = 3
    const second = engine.build(input).faces!.map(face => engine.inspectCurrentFaceSupport(face.ref, null)).find(value => value.kind === 'cylinder')!
    expect(second.kind === 'cylinder' && second.radius).toBe(3); expect(first.kind === 'cylinder' && first.radius).toBe(2)
  } finally { engine.dispose() }
}, 60_000)

it.each([false, true])('rejects a face query whose actual native extraction reenters another generation, semantic=%s', v2 => {
  const engine = new CadEngine(), result = engine.build(features(v2)), actual = supports.extractAssemblyFaceSupport; let changed = false
  const spy = vi.spyOn(supports, 'extractAssemblyFaceSupport').mockImplementation(face => {
    const support = actual(face)
    if (!changed) { changed = true; engine.build(features(v2, false, 5)) }
    return support
  })
  try {
    expect(() => engine.inspectCurrentFaceSupport(top(result.faces!).ref, null)).toThrow('cambió')
    spy.mockRestore(); const fresh = engine.build(features(v2, false, 5)), support = engine.inspectCurrentFaceSupport(top(fresh.faces!).ref, null)
    if (support.kind !== 'plane') throw new Error('Original fresh plane missing')
    close(support.point[2], 5)
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it.each([{ body: false, cleanup: false }, { body: true, cleanup: false }, { body: false, cleanup: true }, { body: true, cleanup: true }])(
  'revokes and drains current face catalogs after a real DTO mesh failure %j', parameters => {
    const engine = new CadEngine(), releases: number[] = [], native = faces.pickableFacesFromCatalog
    const primary = new Error('Original face DTO fault'), cleanup = new Error('Original current face release fault')
    const spy = vi.spyOn(faces, 'pickableFacesFromCatalog').mockImplementation(catalog => {
      const result = native(catalog)
      expect(() => engine.inspectCurrentFaceSupport(result[0].ref, null)).toThrow('reconstrucción completa')
      throw primary
    })
    try {
      const failure = caught(() => observeCatalogs(releases, () => engine.build(features(false, parameters.body)), parameters.cleanup ? cleanup : undefined))
      expect(failures(failure)).toContain(primary); if (parameters.cleanup) expect(failures(failure)).toContain(cleanup)
      expect(releases).toEqual([1]); expect(() => engine.inspectCurrentFaceSupport({ sourceFeatureId: 'base', key: 'old-face' }, null)).toThrow('reconstrucción completa')
      expect(() => engine.dispose()).not.toThrow(); expect(releases).toEqual([1])
      spy.mockRestore(); const result = engine.build(features(false, parameters.body)), body = result.bodies?.[0]
      expect(engine.inspectCurrentFaceSupport(top(body?.faces ?? result.faces!).ref, body?.ref ?? null).kind).toBe('plane')
    } finally { spy.mockRestore(); engine.dispose() }
  }, 60_000)

it('revokes every current owner before a face catalog cleanup failure and still releases the edge catalog', () => {
  const engine = new CadEngine(), releases: number[] = [], actual = edges.createEdgeCatalog; let edgeReleases = 0
  const spy = vi.spyOn(edges, 'createEdgeCatalog').mockImplementation((...args) => {
    const catalog = actual(...args), release = catalog.dispose
    return { ...catalog, dispose: () => { edgeReleases++; release() } }
  })
  try {
    observeCatalogs(releases, () => {
      const result = engine.build(features())
      expect(() => engine.dispose()).toThrow(AggregateError)
      expect(releases).toEqual([1]); expect(edgeReleases).toBe(1)
      expect(() => engine.inspectCurrentFaceSupport(result.faces![0].ref, null)).toThrow('vigente')
      expect(() => engine.dispose()).not.toThrow(); expect(releases).toEqual([1])
    }, new Error('Original retained face release fault'))
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it('withholds semantic inspection after the real producer cleanup fails following final face meshing', () => {
  const engine = new CadEngine(), actual = provenance.entityProfilePrismIfSingleRegion, create = semantic.createSemanticFaceCatalog; let released = 0
  const prism = vi.spyOn(provenance, 'entityProfilePrismIfSingleRegion').mockImplementation((...args) => {
    const owner = actual(...args); if (!owner) throw new Error('Original producer missing')
    const release = owner.dispose.bind(owner)
    return { ...owner, dispose: () => [...release(), 'Original producer release fault'] }
  })
  const catalog = vi.spyOn(semantic, 'createSemanticFaceCatalog').mockImplementation((...args) => {
    const value = create(...args), release = value.dispose
    return { ...value, dispose: () => { released++; release() } }
  })
  try {
    expect(() => engine.build(features(true))).toThrow('Original producer release fault'); expect(released).toBe(1)
    expect(() => engine.inspectCurrentFaceSupport({ sourceFeatureId: 'base', key: 'old-face' }, null)).toThrow('reconstrucción completa')
    expect(() => engine.dispose()).not.toThrow(); expect(released).toBe(1)
  } finally { prism.mockRestore(); catalog.mockRestore(); engine.dispose() }
}, 60_000)

it('owns the native face Surface if its real GetType query fails', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), actual = ownership.withNativeOwners, failure = new Error('Original native face type fault')
  let acquired = 0, released = 0
  const implementation: typeof actual = <R>(action: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(arena => {
    if (context === 'Native face type query or release failed.') {
      const own = arena.own.bind(arena)
      arena.own = <T extends NativeOwner>(value: T): T => {
        if (value instanceof Surface) {
          acquired++; const query = value.wrapped.GetType.bind(value.wrapped), release = value.delete.bind(value)
          Object.defineProperty(value.wrapped, 'GetType', { configurable: true, value: () => { query(); throw failure } })
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { released++; release() } })
        }
        return own(value)
      }
    }
    return action(arena)
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { expect(() => createFaceCatalog(source, 'box')).toThrow(failure); expect(acquired).toBe(1); expect(released).toBe(1); expect(source.wrapped.IsNull()).toBe(false) }
  finally { spy.mockRestore() }
}), 60_000)

it('withholds fresh native support and retains both query and cleanup causes from an owned point', () => {
  const engine = new CadEngine(), result = engine.build(features()), actual = ownership.withNativeOwners
  const primary = new Error('Original face support query fault'), cleanup = new Error('Original face support release fault'); let patched = false, released = 0
  const implementation: typeof actual = <R>(action: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(arena => {
    if (context === 'Assembly face support extraction or release failed.') {
      const own = arena.own.bind(arena)
      arena.own = <T extends NativeOwner>(value: T): T => {
        if (!patched && value instanceof getOC().gp_Pnt) {
          patched = true; const point = value as T & InstanceType<ReturnType<typeof getOC>['gp_Pnt']>, query = point.X.bind(point), release = point.delete.bind(point)
          Object.defineProperty(point, 'X', { configurable: true, value: () => { query(); throw primary } })
          Object.defineProperty(point, 'delete', { configurable: true, value: () => { released++; release(); throw cleanup } })
        }
        return own(value)
      }
    }
    return action(arena)
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try {
    const failure = caught(() => engine.inspectCurrentFaceSupport(top(result.faces!).ref, null))
    expect(failure).toBeInstanceOf(NativeCleanupError); expect(failures(failure)).toContain(primary); expect(failures(failure)).toContain(cleanup)
    expect(released).toBe(1); spy.mockRestore(); expect(engine.inspectCurrentFaceSupport(top(result.faces!).ref, null).kind).toBe('plane')
  } finally { spy.mockRestore(); engine.dispose() }
}, 60_000)
