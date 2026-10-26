import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateDocument } from '../model/document'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, withAssemblyGeometryReuse, type AssemblyEndpointWitness, type AssemblySnapshotRunner } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original analytic R2 × 12 pin with an eccentric R.25 through bore at (1,0).
// Its independently placed bore center distinguishes actual local geometry from
// stale world supports when successive snapshots rotate/translate the same part.
const stamp = '2026-10-26T00:00:00.000Z'
function fixture(): AssemblyDocument {
  const part: EmbeddedPartDefinition = { kind: 'part', id: 'pin', revision: 'r1', document: validateDocument({
    version: 1, id: 'pin', name: 'Original reusable native pin', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'profile', name: 'Outer circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
      { id: 'outer', name: 'Pin', type: 'extrude', sketchId: 'profile', depth: 12, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
      { id: 'bore-profile', name: 'Eccentric bore', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [1, 0], radius: .25 } },
      { id: 'bore', name: 'Through bore', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'outer' }] },
    ],
  }) }
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original reusable reference assembly',
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part], mates: [],
    occurrences: [{ id: 'pin', name: 'Pin', definition: { id: part.id, revision: part.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }] })
}
function part(input: AssemblyDocument): EmbeddedPartDefinition {
  const value = input.definitions.find(value => value.id === 'pin')
  if (value?.kind !== 'part') throw new Error('Original pin missing')
  return value
}
function cylinder(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, radius = .25) {
  for (const selection of snapshot.listFaces(input, ['pin'])) {
    const reference: AssemblyFaceReference & { support: 'axis' } = { kind: 'face', ...selection, support: 'axis' }
    try {
      const witness = snapshot.resolveReference(input, reference)
      if (witness.kind === 'support' && witness.localSupport.kind === 'cylinder' && Math.abs(witness.localSupport.radius - radius) < 1e-10) return { reference, witness }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('no coincide con el plano o eje declarado')) throw error
    }
  }
  throw new Error('Original native cylinder missing')
}
function xy(witness: AssemblyEndpointWitness): readonly number[] {
  if (witness.kind !== 'support' || witness.worldSupport.kind !== 'cylinder') throw new Error('Original world cylinder missing')
  return witness.worldSupport.point.slice(0, 2)
}
function close(actual: readonly number[], expected: readonly number[]) {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-9))
}

it('is lazy and revokes a retained runner after its one synchronous operation', () => {
  const input = fixture(), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  let retained: AssemblySnapshotRunner | undefined
  try {
    expect(withAssemblyGeometryReuse(input, run => { retained = run; return 17 })).toBe(17)
    expect(build).not.toHaveBeenCalled()
    expect(() => retained!(input, () => 19)).toThrow('ya no está vigente')
    expect(build).not.toHaveBeenCalled()
  } finally { build.mockRestore() }
})

it('shares local geometry but issues fresh placed witnesses, with independent snapshot lifetime', () => {
  const input = fixture(), moved = structuredClone(input), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  moved.occurrences[0].pose = { translation: [-10, 0, -8], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  let retained: AssemblyGeometrySnapshot | undefined, proof: AssemblyEndpointWitness | undefined
  try {
    withAssemblyGeometryReuse(input, run => run(input, a => {
      const first = cylinder(a, input).witness
      close(xy(first), [1, 0])
      run(moved, b => {
        const second = cylinder(b, moved).witness
        retained = b; proof = second
        close(xy(second), [-10, 1])
        expect(() => b.assertWitness(first, moved)).toThrow('no fue verificada')
        expect(() => a.assertWitness(second, input)).toThrow('no fue verificada')
        expect(() => b.assertWitness(structuredClone(second), moved)).toThrow('no fue verificada')
        expect(() => b.assertWitness(second, input)).toThrow('documento cambió')
        a.dispose()
        expect(() => a.assertWitness(first, input)).toThrow('ya no está vigente')
        expect(b.assertWitness(second, moved)).toBe(second)
      })
    }))
    expect(build).toHaveBeenCalledTimes(1)
    expect(() => retained!.assertWitness(proof!, moved)).toThrow('ya no está vigente')
    // A later operation does not inherit a cache or native owner from the first.
    withAssemblyGeometryReuse(input, run => run(input, snapshot => close(xy(cylinder(snapshot, input).witness), [1, 0])))
    expect(build).toHaveBeenCalledTimes(2)
  } finally { build.mockRestore() }
}, 60_000)

it('rebuilds same-revision changed content privately without replacing the admitted original', () => {
  const input = fixture(), changed = structuredClone(input), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  const sketch = part(changed).document.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original circle missing')
  sketch.profile.radius = 2.5
  try {
    withAssemblyGeometryReuse(input, run => {
      run(input, snapshot => expect(cylinder(snapshot, input, 2).witness.origin).toBe('native-face'))
      run(changed, snapshot => {
        const witness = cylinder(snapshot, changed, 2.5).witness
        if (witness.kind !== 'support' || witness.localSupport.kind !== 'cylinder') throw new Error('Actual changed cylinder missing')
        expect(witness.localSupport.radius).toBeCloseTo(2.5, 12)
      })
      run(input, snapshot => expect(cylinder(snapshot, input, 2).witness.origin).toBe('native-face'))
    })
    expect(build).toHaveBeenCalledTimes(2)
    expect(part(input).revision).toBe(part(changed).revision)
  } finally { build.mockRestore() }
}, 60_000)

it('rejects content mutation during real reconstruction before publishing a reusable entry', () => {
  const input = fixture(), original = JSON.stringify(input), rebuild = CadEngine.prototype.rebuildForAssemblyReferences
  let retained: AssemblySnapshotRunner | undefined
  const built: CadEngine[] = [], released = new Map<CadEngine, number>(), dispose = CadEngine.prototype.dispose
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    released.set(this, (released.get(this) ?? 0) + 1); return dispose.call(this)
  })
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, features) {
    built.push(this)
    const result = rebuild.call(this, features), sketch = features[0]
    if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original circle missing')
    sketch.profile.radius = 2.5
    return result
  })
  try {
    expect(() => withAssemblyGeometryReuse(input, run => { retained = run; return run(input, () => 'not reached') }))
      .toThrow('cambió durante su reconstrucción')
    expect(built).toHaveLength(1)
    // One normal rebuild reset, then exactly one owner release after rejection.
    expect(released.get(built[0])).toBe(2)
    expect(() => retained!(input, () => 0)).toThrow('ya no está vigente')
    expect(JSON.stringify(input)).toBe(original)
  } finally { build.mockRestore(); release.mockRestore() }
}, 60_000)

it('revokes every borrower after a fatal shared native query and preserves its failure', () => {
  const input = fixture(), failure = new NativeCleanupError(undefined, [new Error('Original native query cleanup fault')], 'Original fatal query'),
    inspect = CadEngine.prototype.inspectCurrentFaceSupport
  let a: AssemblyGeometrySnapshot | undefined, b: AssemblyGeometrySnapshot | undefined, proof: AssemblyEndpointWitness | undefined
  let restore: (() => void) | undefined, caught: unknown
  try {
    withAssemblyGeometryReuse(input, run => run(input, outer => {
      a = outer; const chosen = cylinder(outer, input); proof = chosen.witness
      run(input, inner => {
        b = inner
        const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
          inspect.apply(this, args); throw failure
        })
        restore = () => spy.mockRestore()
        try { inner.resolveReference(input, chosen.reference) }
        catch (error) {
          expect(error).toBe(failure)
          expect(() => outer.assertWitness(chosen.witness, input)).toThrow('ya no está vigente')
          expect(() => run(input, () => 0)).toThrow('ya no está vigente')
          throw error
        }
      })
    }))
  } catch (error) { caught = error }
  finally { restore?.() }
  expect(caught).toBe(failure)
  expect(() => a!.assertWitness(proof!, input)).toThrow('ya no está vigente')
  expect(() => b!.listFaces(input, ['pin'])).toThrow('ya no está vigente')
}, 60_000)

it('applies the expanded-body budget to a warm cached two-body definition', () => {
  const input = fixture(), definition = part(input)
  definition.document.features.push(
    { id: 'second-profile', name: 'Original second disk', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [10, 0], radius: 1 } },
    { id: 'second-body', name: 'Original second body', type: 'extrude', sketchId: 'second-profile', depth: 3, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second' } },
  )
  const expanded = structuredClone(input)
  expanded.occurrences = Array.from({ length: 2049 }, (_, index) => ({ ...structuredClone(input.occurrences[0]), id: 'reuse-' + index }))
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  try {
    withAssemblyGeometryReuse(input, run => {
      run(input, snapshot => expect(snapshot.listFaces(input, ['pin']).length).toBeGreaterThan(0))
      expect(() => run(expanded, () => 'not reached')).toThrow('4096 entradas de cuerpo expandidas')
    })
    expect(build).toHaveBeenCalledTimes(1)
  } finally { build.mockRestore() }
}, 60_000)

it('bounds cumulative retained inventory across separately valid scoped snapshots', () => {
  const input = fixture(), other = structuredClone(part(input))
  other.id = other.document.id = 'other-pin'
  input.definitions.push(other)
  const second = structuredClone(input)
  second.occurrences[0].definition = { id: other.id, revision: other.revision }
  const original = CadEngine.prototype.rebuildForAssemblyReferences
  let builds = 0
  // Negative admission fault: inflate only the first real native inventory's
  // repeated body entries, without making fake geometry or accepting witnesses.
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, features) {
    const result = original.call(this, features)
    builds++
    if (builds === 1) {
      if (result.kind !== 'explicit' || result.bodies.length !== 1) throw new Error('Actual explicit pin inventory missing')
      return { ...result, bodies: Array.from({ length: 4096 }, () => result.bodies[0]) }
    }
    return result
  })
  try {
    expect(() => withAssemblyGeometryReuse(input, run => {
      run(input, () => undefined)
      run(second, () => 'not reached')
    })).toThrow('presupuesto de cuerpos, caras o aristas')
    expect(builds).toBe(2)
  } finally { build.mockRestore() }
}, 60_000)

it('releases all received engines once when a later original feature cannot rebuild', () => {
  const input = fixture(), invalid = structuredClone(part(input))
  invalid.id = invalid.document.id = 'invalid-pin'
  const bore = invalid.document.features[2]
  if (bore.type !== 'sketch' || bore.profile.kind !== 'circle') throw new Error('Original bore missing')
  bore.profile.center = [100, 100]
  input.definitions.push(invalid)
  input.occurrences.push({ ...structuredClone(input.occurrences[0]), id: 'invalid', definition: { id: invalid.id, revision: invalid.revision } })
  const rebuild = CadEngine.prototype.rebuildForAssemblyReferences, dispose = CadEngine.prototype.dispose
  const built: CadEngine[] = [], released = new Map<CadEngine, number>()
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, features) {
    built.push(this); return rebuild.call(this, features)
  })
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    released.set(this, (released.get(this) ?? 0) + 1); return dispose.call(this)
  })
  try {
    expect(() => withAssemblyGeometryReuse(input, run => run(input, () => 'not reached'))).toThrow('No se pudo reconstruir')
    expect(built).toHaveLength(2)
    expect(built.map(engine => released.get(engine))).toEqual([2, 2])
  } finally { build.mockRestore(); release.mockRestore() }
}, 60_000)
