import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyProfilePlacementArithmetic, type AssemblyFaceSelection } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const stamp = '2026-10-22T00:00:00.000Z'
// Original 4x6x4 prism and radius-2 cylinder at offset [3,-2]. Faces are
// selected by their independent +Z native plane, never an ordinal or bounds.
function original(explicit = false, circle = false, multi = false): AssemblyDocument {
  const features: unknown[] = [{ id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: circle ? { kind: 'circle', center: [3, -2], radius: 2 } : { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
  { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'first' } } : {}) }]
  if (multi) features.push({ id: 'remote-profile', name: 'Remote rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', center: [20, 0], width: 4, height: 6 } },
  { id: 'remote', name: 'Remote prism', type: 'extrude', sketchId: 'remote-profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second' } })
  const part = { kind: 'part', id: 'original-profile-part', revision: 'r1', document: { version: 1, id: 'original-profile-part', name: 'Original profile body', units: 'mm', createdAt: stamp, updatedAt: stamp, features } }
  const occurrence = (id: string) => ({ id, name: id, definition: { id: part.id, revision: part.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })
  const a = occurrence('a'), b = occurrence('b'); a.pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }; b.pose.translation = [-10, 0, 0]
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original profile occurrences', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part], occurrences: [a, b], mates: [] })
}
function top(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, path = ['a']): AssemblyFaceSelection {
  const choices = snapshot.listFaces(input, path).filter(selection => {
    const w = snapshot.resolveReference(input, { ...selection, kind: 'face', support: 'plane' })
    return w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[2] > .99
  })
  if (!choices.length) throw new Error('Original top face missing')
  return choices[0]
}
const near = (actual: readonly number[], expected: readonly number[]) => actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThan(1e-10))
for (const explicit of [false, true]) it('issues separate frozen rectangle proofs for reused native geometry, explicit=' + explicit, () => {
  const input = original(explicit), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), snapshot = new AssemblyGeometrySnapshot(input)
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
  try {
    const first = snapshot.resolveProfileFaceSelection(input, top(snapshot, input)), second = snapshot.resolveProfileFaceSelection(input, top(snapshot, input, ['b']))
    expect(build).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledTimes(2)
    near(first.localSupport.center, [0, 0, 4]); near(first.worldSupport.center, [10, 20, 34]); near(second.worldSupport.center, [-10, 0, 4])
    expect(first.kind).toBe('profile'); expect(first.origin).toBe('native-profile-face'); expect(first.worldSupport.kind).toBe('rectangle')
    if (first.worldSupport.kind !== 'rectangle' || first.localSupport.kind !== 'rectangle') throw new Error('Expected rectangle')
    const expected = new Set([-2, 2].flatMap(x => [-3, 3].map(y => JSON.stringify([10 - y, 20 + x, 34]))))
    expect(new Set(first.worldSupport.corners.map(p => JSON.stringify(p.map(v => Math.round(v * 1e10) / 1e10))))).toEqual(expected)
    first.localSupport.boundaryAxes.forEach((v, i) => near(first.worldSupport.kind === 'rectangle' ? first.worldSupport.boundaryAxes[i] : [], [-v[1], v[0], v[2]]))
    expect(Object.isFrozen(first.worldSupport.corners[0])).toBe(true); expect(snapshot.assertProfileWitness(first, input)).toBe(first)
    expect(() => snapshot.assertWitness(first as never, input)).toThrow(); expect(() => snapshot.assertPointWitness(first as never, input)).toThrow()
    snapshot.resolveProfileFaceSelection(input, top(snapshot, input)); expect(query).toHaveBeenCalledTimes(3)
  } finally { snapshot.dispose(); build.mockRestore(); query.mockRestore() }
})
it('resolves a circular cap without introducing a roll axis', () => {
  const input = original(true, true), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const selections = snapshot.listFaces(input, ['a'])
    // Native cylindrical side is intentionally not a profile; find the cap by
    // fresh plane observations, ignoring only the known cylinder direction.
    let selected: AssemblyFaceSelection | undefined
    for (const s of selections) {
      try {
        const w = snapshot.resolveReference(input, { ...s, kind: 'face', support: 'plane' })
        if (w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[2] > .99) selected = s
      } catch (error) { if (!(error instanceof Error) || !error.message.includes('no coincide')) throw error }
    }
    if (!selected) throw new Error('Circle cap missing')
    const w = snapshot.resolveProfileFaceSelection(input, selected); near(w.localSupport.center, [3, -2, 4]); near(w.worldSupport.center, [12, 23, 34])
    expect(w.worldSupport.kind).toBe('circle'); expect(w.worldSupport).not.toHaveProperty('boundaryAxes')
  } finally { snapshot.dispose() }
})
it('composes a nested scoped profile and retains original chain magnitudes', () => {
  const input = original(true), part = input.definitions[0]
  input.definitions.push({ kind: 'assembly', id: 'nested', revision: 'r1', name: 'Nested', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ id: 'inner', name: 'Inner', definition: { id: part.id, revision: part.revision }, pose: { translation: [2, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }], mates: [] })
  input.occurrences = [{ id: 'outer', name: 'Outer', definition: { id: 'nested', revision: 'r1' }, pose: { translation: [100, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false }]
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const selected = top(snapshot, input, ['outer', 'inner']); selected.component.occurrencePath = ['inner']
    const w = snapshot.resolveProfileFaceSelection(input, selected, ['outer']); near(w.worldSupport.center, [100, 2, 4])
    expect(assemblyProfilePlacementArithmetic(w, input)).toEqual({ placementSum: 102, depth: 2 }); expect(w.componentPath).toEqual(['outer', 'inner'])
  } finally { snapshot.dispose() }
})
it('keeps distinct explicit body identities for a real two-body part', () => {
  const input = original(true, false, true), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const selections = snapshot.listFaces(input, ['a']), bodies = new Map(selections.map(s => [s.body?.bodyId, s.body]))
    expect(bodies.size).toBe(2)
    for (const body of bodies.values()) {
      const choices = selections.filter(s => s.body?.bodyId === body?.bodyId)
      const selected = choices.find(s => { const w = snapshot.resolveReference(input, { ...s, kind: 'face', support: 'plane' }); return w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[2] > .99 })!
      const w = snapshot.resolveProfileFaceSelection(input, selected)
      near(w.localSupport.center, body?.bodyId === 'first' ? [0, 0, 4] : [20, 0, 4])
    }
  } finally { snapshot.dispose() }
})
it('exposes larger world uncertainty after a large cancelled placement chain while retaining local error', () => {
  const input = original(true), part = input.definitions[0]
  input.definitions.push({ kind: 'assembly', id: 'cancelled', revision: 'r1', name: 'Original cancelling placements', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ id: 'inner', name: 'Inner', definition: { id: part.id, revision: part.revision }, pose: { translation: [-1e16, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }], mates: [] })
  input.occurrences = [{ id: 'outer', name: 'Outer', definition: { id: 'cancelled', revision: 'r1' }, pose: { translation: [1e16, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }]
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const w = snapshot.resolveProfileFaceSelection(input, top(snapshot, input, ['outer', 'inner']))
    near(w.localSupport.center, [0, 0, 4]); near(w.worldSupport.center, [0, 0, 4])
    expect(w.localSupport.uncertainty.positionErrorMm).toBeLessThan(1e-6)
    expect(w.worldSupport.uncertainty.positionErrorMm).toBeGreaterThan(100)
    expect(w.worldSupport.uncertainty.normalErrorRad).toBeGreaterThan(w.localSupport.uncertainty.normalErrorRad)
    expect(assemblyProfilePlacementArithmetic(w, input)).toEqual({ placementSum: 2e16, depth: 2 })
  } finally { snapshot.dispose() }
})
it('rejects cloned, foreign, stale and disposed proof objects', () => {
  const input = original(), snapshot = new AssemblyGeometrySnapshot(input), foreign = new AssemblyGeometrySnapshot(input)
  try {
    const w = snapshot.resolveProfileFaceSelection(input, top(snapshot, input))
    expect(() => snapshot.assertProfileWitness(structuredClone(w), input)).toThrow(); expect(() => foreign.assertProfileWitness(w, input)).toThrow()
    expect(() => assemblyProfilePlacementArithmetic(structuredClone(w), input)).toThrow()
    const changed = structuredClone(input); changed.occurrences[0].pose.translation[0]++
    expect(() => snapshot.assertProfileWitness(w, changed)).toThrow()
    snapshot.dispose(); expect(() => snapshot.assertProfileWitness(w, input)).toThrow()
  } finally { snapshot.dispose(); foreign.dispose() }
})
it('does not invoke accessors or close the snapshot for malformed selection data', () => {
  const input = original(), snapshot = new AssemblyGeometrySnapshot(input); let called = false
  try {
    const selected = top(snapshot, input), bad = { ...selected, get face() { called = true; throw new Error('not data') } }
    expect(() => snapshot.resolveProfileFaceSelection(input, bad as unknown as AssemblyFaceSelection)).toThrow(); expect(called).toBe(false)
    expect(snapshot.resolveProfileFaceSelection(input, selected).kind).toBe('profile')
  } finally { snapshot.dispose() }
})
it('withholds a profile after reentrant disposal and closes on native query/cleanup errors', () => {
  for (const reentrant of [true, false]) {
    const input = original(), snapshot = new AssemblyGeometrySnapshot(input), selected = top(snapshot, input), originalQuery = CadEngine.prototype.inspectCurrentProfileSupport
    const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport').mockImplementation(function(this: CadEngine, ...args) {
      if (!reentrant) throw new NativeCleanupError({ error: new Error('Original query fault') }, [new Error('Original cleanup fault')], 'Original combined failure')
      const value = originalQuery.apply(this, args); snapshot.dispose(); return value
    })
    try { expect(() => snapshot.resolveProfileFaceSelection(input, selected)).toThrow(); expect(() => snapshot.listFaces(input, ['b'])).toThrow() }
    finally { spy.mockRestore(); snapshot.dispose() }
  }
})
