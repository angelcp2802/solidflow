import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, type AssemblyVertexReference } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyConfigurationGeometrySnapshot, assemblyConfigurationPlacementArithmetic, type AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000)
function fixture(rootConfiguration: string | null = 'mixed'): AssemblyConfigurationGeometryInput {
  return { ...assemblyConfigurationCoreFixture(), rootConfiguration, generation: 7 }
}
const near = (actual: readonly number[], expected: readonly number[], band = 1e-9) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((x, i) => { expect(Number.isFinite(x)).toBe(true); expect(Math.abs(x - expected[i])).toBeLessThanOrEqual(band) })
}
function point(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, path = ['right', 'b']): AssemblyVertexReference {
  const selections = snapshot.listVertices(input, path)
  expect(selections).toHaveLength(8)
  return { kind: 'vertex', ...selections[0], support: 'point' }
}
const tree = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(tree)] : [error]

it('queries original reused prism vertices and planes in independent variant placements', () => {
  const input = fixture(), before = serializeAssemblyDocument(input.document), catalog = JSON.stringify(input.catalog)
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    expect(build).toHaveBeenCalledTimes(2)
    for (const path of [['left', 'b'], ['right', 'b']]) {
      const selected = snapshot.listVertices(input, path), corners = new Set([0, 1].flatMap(x => [0, 2].flatMap(y => [0, 5].map(z => JSON.stringify([x, y, z])))))
      for (const selection of selected) {
        const witness = snapshot.resolveVertexReference(input, { kind: 'vertex', ...selection, support: 'point' })
        const [x, y, z] = witness.localSupport.point
        expect(corners.delete(JSON.stringify([x, y, z]))).toBe(true)
        near(witness.worldSupport.point, path[0] === 'left' ? [10 + x, y, z] : [30 - y, 4 + x, z])
        expect(witness.kind).toBe('configured-point'); expect(witness.topLevelOwner).toBe(path[0])
        expect(witness.componentPath).toEqual(path); expect(snapshot.assertWitness(witness, input)).toBe(witness)
        expect(witness.configurationAncestry.map(scope => scope.configuration)).toEqual(path[0] === 'left' ? ['mixed', null] : ['mixed', 'compact'])
        expect(Object.isFrozen(witness.worldSupport.point)).toBe(true)
      }
      expect(corners.size).toBe(0)
    }
    const planes = snapshot.listFaces(input, ['right', 'b'])
    expect(planes).toHaveLength(6)
    expect(new Set(planes.map(selection => selection.face.key)).size).toBe(6)
    const directions = new Set<string>()
    for (const selection of planes) {
      const witness = snapshot.resolvePlaneReference(input, { kind: 'face', ...selection, support: 'plane' })
      const [x, y, z] = witness.localSupport.point, [nx, ny, nz] = witness.localSupport.normal
      directions.add(JSON.stringify([nx, ny, nz].map(n => Math.round(n))))
      near(witness.worldSupport.point, [30 - y, 4 + x, z]); near(witness.worldSupport.normal, [-ny, nx, nz])
      expect(witness.kind).toBe('configured-plane'); expect(witness.topLevelOwner).toBe('right')
      const axis = [nx, ny, nz].findIndex(n => Math.abs(n) > .99999)
      expect(axis).toBeGreaterThanOrEqual(0)
      expect([0, [1, 2, 5][axis]].some(bound => Math.abs(witness.localSupport.point[axis] - bound) <= 1e-9)).toBe(true)
    }
    expect(directions).toEqual(new Set(['[1,0,0]', '[-1,0,0]', '[0,1,0]', '[0,-1,0]', '[0,0,1]', '[0,0,-1]']))
    expect(serializeAssemblyDocument(input.document)).toBe(before); expect(JSON.stringify(input.catalog)).toBe(catalog)
  } finally { snapshot.dispose(); build.mockRestore() }
})

it('resolves scope-relative material points and null planes in the actual rotated declaring frame', () => {
  const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const selected = point(snapshot, input)
    selected.component.occurrencePath = ['b']
    const witness = snapshot.resolveVertexReference(input, selected, ['right']), [x, y, z] = witness.localSupport.point
    near(witness.worldSupport.point, [30 - y, 4 + x, z]); expect(witness.topLevelOwner).toBe('right')
    expect(assemblyConfigurationPlacementArithmetic(witness, input)).toEqual({ placementSum: 34, depth: 2 })
    const local = snapshot.resolvePlaneReference(input, { kind: 'principal-plane', component: null, plane: 'YZ' }, ['right'])
    near(local.worldSupport.point, [30, 0, 0]); near(local.worldSupport.normal, [0, 1, 0])
    expect(local.componentPath).toEqual(['right']); expect(local.topLevelOwner).toBe('right')
    const root = snapshot.resolvePlaneReference(input, { kind: 'principal-plane', component: null, plane: 'XY' })
    near(root.worldSupport.point, [0, 0, 0]); expect(root.topLevelOwner).toBeNull()
  } finally { snapshot.dispose() }
})

it('reuses one local prototype for the same variant while keeping actual occurrence proofs distinct', () => {
  const input=fixture('both-compact'),snapshot=new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const a=snapshot.resolveVertexReference(input,point(snapshot,input,['left','b']))
    const b=snapshot.resolveVertexReference(input,point(snapshot,input,['right','b']))
    const [x,y,z]=a.localSupport.point
    near(a.worldSupport.point,[4+x,y,z]);near(b.localSupport.point,[x,y,z]);near(b.worldSupport.point,[30-y,4+x,z])
    expect(a).not.toBe(b);expect(a.topLevelOwner).toBe('left');expect(b.topLevelOwner).toBe('right')
    expect(a.configurationAncestry.at(-1)?.configuration).toBe('compact');expect(b.configurationAncestry.at(-1)?.configuration).toBe('compact')
  }finally{snapshot.dispose()}
})

it('keeps hidden material queryable, omits only the configured suppressed occurrence and activates base-suppressed material', () => {
  const input = fixture('single-right')
  input.document.occurrences[0].visible = false
  const snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const selected = point(snapshot, input, ['left', 'b'])
    expect(snapshot.resolveVertexReference(input, selected).topLevelOwner).toBe('left')
    expect(() => snapshot.listVertices(input, ['right', 'b'])).toThrow()
    expect(snapshot.listVertices(input, ['right', 'a'])).toHaveLength(8)
  } finally { snapshot.dispose() }
  const active = fixture(), node = active.document.definitions.find(d => d.id === 'configuration-S')
  if (node?.kind !== 'assembly') throw Error('Original S missing')
  node.occurrences[1].suppressed = true
  active.catalog[1].configurations[0].occurrences[0].suppressed = false
  const activated = new AssemblyConfigurationGeometrySnapshot(active)
  try {
    const witness = activated.resolveVertexReference(active, point(activated, active))
    const [x, y, z] = witness.localSupport.point; near(witness.worldSupport.point, [30 - y, 4 + x, z])
    expect(() => activated.listVertices(active, ['left', 'b'])).toThrow()
  } finally { activated.dispose() }
})

it.each(['catalog', 'selector', 'generation', 'document'] as const)('revokes permanently after a complete current-input mismatch: %s', change => {
  const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input), witness = snapshot.resolveVertexReference(input, point(snapshot, input))
  const changed = structuredClone(input)
  if (change === 'catalog') changed.catalog[1].configurations[0].occurrences[0].pose!.translation[0] = 6
  if (change === 'selector') changed.rootConfiguration = 'both-compact'
  if (change === 'generation') changed.generation++
  if (change === 'document') changed.document.name = 'Changed source, same tuple'
  try {
    expect(() => snapshot.assertWitness(witness, changed)).toThrow()
    expect(() => snapshot.assertWitness(witness, input)).toThrow()
    expect(() => snapshot.listVertices(input, ['left', 'a'])).toThrow()
  } finally { snapshot.dispose() }
})

it('rejects an unobserved away/back with an advanced controller generation and malformed current envelopes', () => {
  const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const witness = snapshot.resolveVertexReference(input, point(snapshot, input)), returned = structuredClone(input)
    returned.generation += 2
    expect(() => snapshot.assertWitness(witness, returned)).toThrow()
    expect(() => snapshot.assertWitness(witness, input)).toThrow()
  } finally { snapshot.dispose() }
  for (const malformed of [{ document: input.document, catalog: input.catalog, rootConfiguration: 'mixed' }, { ...input, generation: -1 }, { ...input, generation: .5 }, { ...input, extra: true }]) {
    expect(() => new AssemblyConfigurationGeometrySnapshot(malformed as never)).toThrow()
  }
})

it('rejects clone, foreign, disposed and cross-legacy proofs without broadening old purpose', () => {
  const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input), other = new AssemblyConfigurationGeometrySnapshot(input), legacy = new AssemblyGeometrySnapshot(input.document)
  try {
    const witness = snapshot.resolveVertexReference(input, point(snapshot, input)), copied = structuredClone(witness)
    expect(() => snapshot.assertWitness(copied, input)).toThrow(); expect(() => other.assertWitness(witness, input)).toThrow()
    expect(() => assemblyConfigurationPlacementArithmetic(copied, input)).toThrow()
    expect(() => legacy.assertPointWitness(witness as never, input.document)).toThrow()
    const selected = legacy.listVertices(input.document, ['right', 'b'])[0]
    const old = legacy.resolveVertexReference(input.document, { kind: 'vertex', ...selected, support: 'point' })
    expect(() => snapshot.assertWitness(old, input)).toThrow()
    expect(snapshot.assertWitness(witness, input)).toBe(witness)
    snapshot.dispose(); expect(() => snapshot.assertWitness(witness, input)).toThrow()
  } finally { snapshot.dispose(); other.dispose(); legacy.dispose() }
})

it('rejects wrong producer/tuple and executable selections before native access without killing a valid session', () => {
  const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const selected = point(snapshot, input), inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport')
    let getters = 0
    const executable = { ...selected }; Object.defineProperty(executable, 'vertex', { enumerable: true, get() { getters++; return selected.vertex } })
    try {
      expect(() => snapshot.resolveVertexReference(input, executable)).toThrow()
      expect(() => snapshot.resolveVertexReference(input, { ...selected, component: { ...selected.component, definition: { ...selected.component.definition, revision: 'old' } } })).toThrow()
      expect(() => snapshot.resolveVertexReference(input, { ...selected, support: 'plane' } as never)).toThrow()
      expect(inspect).not.toHaveBeenCalled(); expect(getters).toBe(0)
      expect(snapshot.resolveVertexReference(input, selected).kind).toBe('configured-point')
    } finally { inspect.mockRestore() }
  } finally { snapshot.dispose() }
})

it('rejects executable required context fields without invoking them and revokes on malformed current input', () => {
  let calls=0
  const input=fixture(),accessor={...input};Object.defineProperty(accessor,'generation',{enumerable:true,get(){calls++;return input.generation}})
  const build=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences')
  try {expect(()=>new AssemblyConfigurationGeometrySnapshot(accessor)).toThrow();expect(build).not.toHaveBeenCalled();expect(calls).toBe(0)}finally{build.mockRestore()}
  const snapshot=new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const witness=snapshot.resolveVertexReference(input,point(snapshot,input))
    expect(()=>snapshot.assertWitness(witness,accessor)).toThrow();expect(calls).toBe(0)
    expect(()=>snapshot.assertWitness(witness,input)).toThrow()
  }finally{snapshot.dispose()}
})

it('withholds a real native return after reentrant catalog mutation and after reentrant disposal', () => {
  for (const dispose of [false, true]) {
    const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input), selected = point(snapshot, input), actual = CadEngine.prototype.inspectCurrentVertexSupport
    const inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport').mockImplementation(function(this: CadEngine, ...args) {
      const value = actual.apply(this, args)
      if (dispose) snapshot.dispose(); else input.catalog[1].configurations[0].name = 'Reentrant change'
      return value
    })
    try {
      expect(() => snapshot.resolveVertexReference(input, selected)).toThrow()
      expect(() => snapshot.listFaces(input, ['left', 'a'])).toThrow()
    } finally { inspect.mockRestore(); snapshot.dispose() }
  }
})

it('retains original effective-chain magnitudes when huge translations cancel, without asserting precision admission', () => {
  const input = fixture()
  input.document.occurrences[1].pose = { translation: [1e16, 0, 0], rotation: [0, 0, 0, 1] }
  input.catalog[1].configurations[0].occurrences[0].pose = { translation: [-1e16, 0, 0], rotation: [0, 0, 0, 1] }
  const snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const witnesses = snapshot.listVertices(input, ['right', 'b']).map(selection => snapshot.resolveVertexReference(input, { kind: 'vertex', ...selection, support: 'point' }))
    const origin = witnesses.find(w => w.localSupport.point.every(x => x === 0))!
    expect(origin).toBeDefined(); near(origin.worldSupport.point, [0, 0, 0])
    expect(assemblyConfigurationPlacementArithmetic(origin, input)).toEqual({ placementSum: 2e16, depth: 2 })
  } finally { snapshot.dispose() }
})

it('drains every allocated prototype exactly once after partial-constructor native failure', () => {
  const input = fixture(), actualBuild = CadEngine.prototype.rebuildForAssemblyReferences, actualDispose = CadEngine.prototype.dispose
  const failure = Error('Original second prototype failure'), counts = new Map<CadEngine, number>(), resets = new Map<CadEngine, number>(), rebuilding = new WeakSet<CadEngine>(); let builds = 0
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) {
    const phase = rebuilding.has(this) ? resets : counts
    phase.set(this, (phase.get(this) ?? 0) + 1); actualDispose.call(this)
  })
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function(this: CadEngine, ...args) {
    // rebuild resets the engine internally; it is not the context's release.
    rebuilding.add(this)
    let value: ReturnType<typeof actualBuild>
    try { value = actualBuild.apply(this, args) } finally { rebuilding.delete(this) }
    if (++builds === 2) throw failure
    return value
  })
  try {
    let caught: unknown; try { new AssemblyConfigurationGeometrySnapshot(input) } catch (error) { caught = error }
    expect(tree(caught)).toContain(failure); expect(counts.size).toBe(2); expect([...counts.values()]).toEqual([1, 1])
    expect(new Set(resets.keys())).toEqual(new Set(counts.keys())); expect([...resets.values()]).toEqual([1, 1])
  } finally { build.mockRestore(); release.mockRestore() }
})

it('withholds construction and drains real prototypes once after reentrant generation mutation', () => {
  const input=fixture(),actualBuild=CadEngine.prototype.rebuildForAssemblyReferences,actualDispose=CadEngine.prototype.dispose
  const allocated=new Set<CadEngine>(),released=new Map<CadEngine,number>(),resets=new Map<CadEngine,number>(),rebuilding=new WeakSet<CadEngine>()
  const build=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences').mockImplementation(function(this:CadEngine,...args){
    allocated.add(this)
    rebuilding.add(this)
    let result:ReturnType<typeof actualBuild>
    try{result=actualBuild.apply(this,args)}finally{rebuilding.delete(this)}
    input.generation++
    return result
  })
  const release=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){const phase=rebuilding.has(this)?resets:released;phase.set(this,(phase.get(this)??0)+1);actualDispose.call(this)})
  try {
    let published:AssemblyConfigurationGeometrySnapshot|undefined
    expect(()=>{published=new AssemblyConfigurationGeometrySnapshot(input)}).toThrow()
    expect(published).toBeUndefined();expect(allocated.size).toBeGreaterThan(0)
    expect(new Set(released.keys())).toEqual(allocated)
    expect([...released.values()].every(count=>count===1)).toBe(true)
    expect(new Set(resets.keys())).toEqual(allocated);expect([...resets.values()].every(count=>count===1)).toBe(true)
  }finally{build.mockRestore();release.mockRestore()}
})

it('preserves native and cleanup failures and never disposes the same prototype twice', () => {
  const input = fixture(), snapshot = new AssemblyConfigurationGeometrySnapshot(input), selected = point(snapshot, input)
  const primary = Error('Original native point fault'), cleanup = Error('Original cleanup fault'), actual = CadEngine.prototype.dispose, counts = new Map<CadEngine, number>()
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { counts.set(this, (counts.get(this) ?? 0) + 1); actual.call(this); throw cleanup })
  const inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentVertexSupport').mockImplementation(() => { throw primary })
  try {
    let caught: unknown; try { snapshot.resolveVertexReference(input, selected) } catch (error) { caught = error }
    expect(tree(caught)).toContain(primary); expect(tree(caught)).toContain(cleanup)
    snapshot.dispose(); expect(counts.size).toBe(2); expect([...counts.values()]).toEqual([1, 1])
    expect(() => snapshot.assertWitness({}, input)).toThrow()
  } finally { inspect.mockRestore(); release.mockRestore(); snapshot.dispose() }
})

it('rejects 8192 real expanded body entries under a valid 4096-occurrence declaration and releases its one prototype', () => {
  const input = fixture(null), part = input.document.definitions.find(d => d.id === 'configuration-A')
  if (part?.kind !== 'part') throw Error('Original part missing')
  const first = part.document.features[1]
  if (first.type !== 'extrude') throw Error('Original prism missing')
  first.bodyOperation = { mode: 'new', bodyId: 'first' }
  part.document.features.push(
    { id: 'second-profile', name: 'Original disjoint rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [10.5, 1], width: 1, height: 2 } },
    { id: 'second-solid', name: 'Original second prism', type: 'extrude', sketchId: 'second-profile', depth: 5, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second' } },
  )
  input.document.definitions = [part]
  input.document.occurrences = Array.from({ length: 4096 }, (_, i) => ({ id: 'o' + i, name: 'o' + i, definition: { id: part.id, revision: part.revision }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true }))
  input.catalog = []
  const actualBuild=CadEngine.prototype.rebuildForAssemblyReferences,actualDispose=CadEngine.prototype.dispose
  const rebuilding=new WeakSet<CadEngine>(),releases=new Map<CadEngine,number>(),resets=new Map<CadEngine,number>()
  const inventories:ReturnType<typeof actualBuild>[]=[]
  const dispose=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){const phase=rebuilding.has(this)?resets:releases;phase.set(this,(phase.get(this)??0)+1);actualDispose.call(this)})
  const build=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences').mockImplementation(function(this:CadEngine,...args){rebuilding.add(this);try{const result=actualBuild.apply(this,args);inventories.push(result);return result}finally{rebuilding.delete(this)}})
  try {
    expect(() => new AssemblyConfigurationGeometrySnapshot(input)).toThrow(/cuerpos expandidos/); expect(build).toHaveBeenCalledTimes(1)
    expect(inventories).toHaveLength(1);expect(inventories[0].featureErrors).toEqual([]);expect(inventories[0].kind).toBe('explicit')
    if(inventories[0].kind!=='explicit')throw Error('Expected actual explicit two-body prototype')
    expect(inventories[0].bodies).toHaveLength(2)
    expect(releases.size).toBe(1);expect([...releases.values()]).toEqual([1])
    expect(new Set(resets.keys())).toEqual(new Set(releases.keys()));expect([...resets.values()]).toEqual([1])
  }
  finally { build.mockRestore(); dispose.mockRestore() }
})
