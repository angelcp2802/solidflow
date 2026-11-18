import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateDocument } from '../model/document'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference, type AssemblyOccurrence,
  type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import type { NativeOwner, NativeOwners } from './kernel.native-ownership'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)
const stamp = '2026-10-15T00:00:00.000Z'
function pin(explicit = true): EmbeddedPartDefinition {
  return { kind: 'part', id: 'pin', revision: 'r1', document: validateDocument({ version: 1, id: 'pin', name: 'Original eccentric pin', units: 'mm',
    createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Outer circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
      { id: 'outer', name: 'Pin', type: 'extrude', sketchId: 'profile', depth: 12, symmetric: false, suppressed: false,
        ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'body' } } : {}) },
      { id: 'bore-profile', name: 'Eccentric bore', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [1, 0], radius: .25 } },
      { id: 'bore', name: 'Through bore', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false,
        ...(explicit ? { bodyScope: [{ bodyId: 'body', sourceFeatureId: 'outer' }] } : {}) },
    ] }) }
}
function occurrence(id: string): AssemblyOccurrence {
  return { id, name: id, definition: { id: 'pin', revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }
}
function document(explicit = true): AssemblyDocument {
  const left = occurrence('left'), right = occurrence('right')
  left.pose = { translation: [-10, 0, -8], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  right.pose.translation = [10, 0, -8]
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original native reference assembly', units: 'mm',
    createdAt: stamp, updatedAt: stamp, definitions: [pin(explicit)], occurrences: [left, right], mates: [] })
}
function close(actual: readonly number[], expected: readonly number[], tolerance = 1e-9) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance))
}
function find(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, path: string[], radius: number): { reference: AssemblyFaceReference & { support: 'axis' }; witness: AssemblyEndpointWitness } {
  for (const selection of snapshot.listFaces(input, path)) {
    const reference: AssemblyFaceReference & { support: 'axis' } = { kind: 'face', ...selection, support: 'axis' }
    try {
      const witness = snapshot.resolveReference(input, reference)
      if (witness.kind === 'support' && witness.localSupport.kind === 'cylinder' && Math.abs(witness.localSupport.radius - radius) < 1e-10) return { reference, witness }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('no coincide con el plano o eje declarado')) throw error
    }
  }
  throw new Error('Expected actual original cylindrical face')
}

it('builds a reused part once while native cylinder witnesses retain independent occurrence paths and poses', () => {
  const input = document(), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    expect(build).toHaveBeenCalledTimes(1)
    const a = find(snapshot, input, ['left'], .25).witness, b = find(snapshot, input, ['right'], .25).witness
    expect(a.componentPath).toEqual(['left']); expect(b.componentPath).toEqual(['right'])
    if (a.kind !== 'support' || b.kind !== 'support' || a.localSupport.kind !== 'cylinder' || b.localSupport.kind !== 'cylinder'
      || a.worldSupport.kind !== 'cylinder' || b.worldSupport.kind !== 'cylinder') throw new Error('Expected native cylinders')
    expect(a.origin).toBe('native-face'); close(a.localSupport.point.slice(0, 2), [1, 0]); close(a.worldSupport.point.slice(0, 2), [-10, 1])
    close(b.worldSupport.point.slice(0, 2), [11, 0])
    // Cylinder parameter axes can use either sign along the same physical line.
    // Retain that native sign and check the independent Cartesian Z90 map.
    close(a.localSupport.axis.map(Math.abs), [0, 0, 1])
    for (const key of ['axis', 'xDirection'] as const) {
      const native = a.localSupport[key]
      close(a.worldSupport[key], [-native[1], native[0], native[2]])
      close(b.worldSupport[key], b.localSupport[key])
    }
    expect(a.worldSupport.radius).toBeCloseTo(.25, 12); expect(a.worldSupport.tolerance).toBeGreaterThanOrEqual(0)
    expect(snapshot.assertWitness(a, structuredClone(input))).toBe(a)
  } finally { snapshot.dispose(); build.mockRestore() }
}, 60_000)

it('rejects cloned and cross-session witnesses and freezes issued numeric geometry', () => {
  const input = document(), a = new AssemblyGeometrySnapshot(input), b = new AssemblyGeometrySnapshot(input)
  try {
    const witness = find(a, input, ['left'], 2).witness
    expect(() => a.assertWitness(structuredClone(witness), input)).toThrow('no fue verificada')
    expect(() => b.assertWitness(witness, input)).toThrow('no fue verificada')
    if (witness.kind !== 'support') throw new Error('Expected support')
    expect(() => { (witness.localSupport.point as unknown as number[])[0] = 999 }).toThrow()
    expect(witness.localSupport.point).toEqual([0, 0, 0])
    a.dispose(); expect(() => a.assertWitness(witness, input)).toThrow('ya no está vigente')
  } finally { a.dispose(); b.dispose() }
}, 60_000)

for (const change of ['source parameter', 'pose', 'visibility', 'definition revision', 'dormant definition'] as const) it('rejects a witness after changing ' + change + ' in the complete document', () => {
  const input = document(), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const witness = find(snapshot, input, ['left'], 2).witness, edited = structuredClone(input)
    if (change === 'source parameter') {
      const definition = edited.definitions[0]
      if (definition.kind !== 'part' || definition.document.features[0].type !== 'sketch' || definition.document.features[0].profile.kind !== 'circle') throw new Error('Original circle missing')
      definition.document.features[0].profile.radius = 2.5 // Intentionally retain the same revision label.
    } else if (change === 'pose') edited.occurrences[1].pose.translation[0] = 11
    else if (change === 'visibility') edited.occurrences[0].visible = false
    else if (change === 'definition revision') {
      edited.definitions[0].revision = 'r2'; edited.occurrences.forEach(value => value.definition.revision = 'r2')
    } else { const extra = pin(); extra.id = extra.document.id = 'dormant'; edited.definitions.push(extra) }
    expect(() => snapshot.assertWitness(witness, edited)).toThrow('El documento cambió')
    expect(() => snapshot.listFaces(edited, ['left'])).toThrow('El documento cambió')
  } finally { snapshot.dispose() }
}, 60_000)

it('resolves legacy aggregate faces without fabricating a body identity', () => {
  const input = document(false), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const { reference, witness } = find(snapshot, input, ['left'], .25)
    expect(reference.body).toBeNull(); expect(witness.kind).toBe('support')
    reference.body = { bodyId: 'invented', sourceFeatureId: 'bore' }
    expect(() => snapshot.resolveReference(input, reference)).toThrow('no tiene un catálogo explícito')
  } finally { snapshot.dispose() }
}, 60_000)

it('refuses null-body fallback, stale body states and invented face keys in explicit catalogs', () => {
  const input = document(), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const { reference } = find(snapshot, input, ['left'], 2)
    expect(() => snapshot.resolveReference(input, { ...reference, body: null })).toThrow('Selecciona el cuerpo explícito')
    expect(() => snapshot.resolveReference(input, { ...reference, body: { ...reference.body!, sourceFeatureId: 'outer' } })).toThrow()
    expect(() => snapshot.resolveReference(input, { ...reference, face: { ...reference.face, key: 'face-v1|invented' } })).toThrow('ya no se puede identificar')
    expect(() => snapshot.resolveReference(input, { ...reference, component: { ...reference.component, definition: { id: 'pin', revision: 'stale' } } })).toThrow('otra revisión')
    expect(() => snapshot.resolveReference(input, { ...reference, support: 'plane' })).toThrow('no coincide')
  } finally { snapshot.dispose() }
}, 60_000)

it('keeps principal planes distinct from native faces and honors a nested declaring assembly frame', () => {
  const input = document(), sub = { kind: 'assembly' as const, id: 'sub', revision: 'r1', name: 'Original nested datum',
    createdAt: stamp, updatedAt: stamp, occurrences: [occurrence('pin')], mates: [] }
  input.definitions.push(sub); input.occurrences = [{ ...occurrence('scope'), definition: { id: 'sub', revision: 'r1' },
    pose: { translation: [4, 5, 6], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }]
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const witness = snapshot.resolveReference(input, { kind: 'principal-plane', component: null, plane: 'YZ' }, ['scope'])
    if (witness.kind !== 'support' || witness.worldSupport.kind !== 'plane') throw new Error('Expected principal datum')
    expect(witness.origin).toBe('principal-plane'); expect(witness.componentPath).toEqual(['scope'])
    close(witness.worldSupport.point, [4, 5, 6]); close(witness.worldSupport.normal, [0, 1, 0]); expect(witness.worldSupport.tolerance).toBe(0)
  } finally { snapshot.dispose() }
}, 60_000)

it('resolves active stored mates through actual native witnesses while suppressed mates retain their declarations', () => {
  const input = document(), picker = new AssemblyGeometrySnapshot(input)
  const first = find(picker, input, ['left'], 2).reference, second = find(picker, input, ['right'], 2).reference
  picker.dispose()
  input.mates = [{ id: 'axis', name: 'Original real cylinders', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first, second },
    { id: 'disabled', name: 'Retained missing relation', type: 'concentric', suppressed: true, alignment: 'aligned', rotationLock: null,
      first: { ...first, component: { ...first.component, occurrencePath: ['deleted'] } }, second }]
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const resolved = snapshot.resolveActiveMates(input).map(requireResolvedBinaryMate)
    expect(resolved).toHaveLength(1); expect(resolved[0].mate.id).toBe('axis'); expect(resolved[0].first.origin).toBe('native-face')
    expect(input.mates).toHaveLength(2); expect(Object.isFrozen(resolved[0].mate)).toBe(true)
  } finally { snapshot.dispose() }
}, 60_000)

it('rejects repairable active mate endpoints instead of solving a substitute component', () => {
  const input = document()
  input.mates = [{ id: 'bad', name: 'Missing component', type: 'lock', suppressed: false,
    first: { occurrencePath: ['missing'], definition: { id: 'pin', revision: 'r1' } },
    second: { occurrencePath: ['right'], definition: { id: 'pin', revision: 'r1' } }, relativePose: identityRigidPose() }]
  const snapshot = new AssemblyGeometrySnapshot(input)
  try { expect(() => snapshot.resolveActiveMates(input)).toThrow('Repara las referencias') }
  finally { snapshot.dispose() }
}, 60_000)

it('revokes proof authority before a real engine-disposal failure can escape', () => {
  const input = document(), snapshot = new AssemblyGeometrySnapshot(input), witness = find(snapshot, input, ['left'], 2).witness
  const real = CadEngine.prototype.dispose, cleanup = new Error('Original forced disposal failure')
  const spy = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { real.call(this); throw cleanup })
  try {
    expect(() => snapshot.dispose()).toThrow(AggregateError)
    expect(() => snapshot.assertWitness(witness, input)).toThrow('ya no está vigente')
    expect(() => snapshot.dispose()).not.toThrow()
  } finally { spy.mockRestore(); snapshot.dispose() }
}, 60_000)

it('revokes the whole session after a native query/cleanup failure', () => {
  const input = document(), snapshot = new AssemblyGeometrySnapshot(input), { reference, witness } = find(snapshot, input, ['left'], 2)
  const real = CadEngine.prototype.inspectCurrentFaceSupport, forced = new NativeCleanupError(undefined, [new Error('Original forced query cleanup')], 'Original test cleanup')
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function(this: CadEngine, ...args) { real.apply(this, args); throw forced })
  try {
    expect(() => snapshot.resolveReference(input, reference)).toThrow(forced)
    expect(() => snapshot.assertWitness(witness, input)).toThrow('ya no está vigente')
  } finally { spy.mockRestore(); snapshot.dispose() }
}, 60_000)

it('withholds analytic output when native epoch changes during temporary point cleanup of a retained face query', () => {
  const definition = pin(), engine = new CadEngine(), result = engine.build(definition.document.features)
  const body = result.bodies![0], reference = body.faces.find(value => value.frame)?.ref
  if (!reference) throw new Error('Original planar face missing')
  const real = ownership.withNativeOwners
  let patched = false, reentered = false
  const implementation: typeof real = <T>(operation: (owners: NativeOwners) => T,
    retained: (result: T) => readonly NativeOwner[] = () => [], context?: string): T => real(owners => {
      if (context === 'Assembly face support extraction or release failed.') {
        const own = owners.own.bind(owners)
        owners.own = <V extends NativeOwner>(value: V): V => {
          if (!patched && value instanceof getOC().gp_Pnt) {
            patched = true
            const release = value.delete.bind(value)
            Object.defineProperty(value, 'delete', { configurable: true, value: () => {
              release(); reentered = true
              engine.rebuildForAssemblyReferences(definition.document.features)
            } })
          }
          return own(value)
        }
      }
      return operation(owners)
    }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try {
    expect(() => engine.inspectCurrentFaceSupport(reference, body.ref)).toThrow('La geometría cambió')
    expect(patched).toBe(true); expect(reentered).toBe(true)
    spy.mockRestore(); expect(engine.inspectCurrentFaceSupport(reference, body.ref).kind).toBe('plane')
  }
  finally { spy.mockRestore(); engine.dispose() }
}, 60_000)

it('rejects geometry-reference getters without invoking them at the standalone selection boundary', () => {
  const input = document(), snapshot = new AssemblyGeometrySnapshot(input); let reads = 0
  try {
    const value = Object.defineProperty({}, 'kind', { enumerable: true, get() { reads++; return 'face' } })
    expect(() => snapshot.resolveReference(input, value as AssemblyFaceReference)).toThrow(); expect(reads).toBe(0)
  } finally { snapshot.dispose() }
}, 60_000)

it('retains authenticated semantic v2 faces after native prism producers retire at the end of build', () => {
  const definition = pin(false)
  definition.document.features = [
    { id: 'entities', name: 'Original analytic disk', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'entities', points: [], entities: [{ id: 'circle', type: 'circle', center: 'origin', radius: 2, construction: false }], constraints: [] } },
    { id: 'prism', name: 'Original entity extrusion', type: 'extrude', sketchId: 'entities', depth: 12, symmetric: false, suppressed: false },
  ]
  const engine = new CadEngine()
  try {
    const result = engine.build(definition.document.features)
    expect(result.featureErrors).toEqual([]); expect(result.faces?.every(value => value.ref.key.startsWith('face-v2|'))).toBe(true)
    const reference = result.faces!.find(value => value.frame && value.frame.normal[2] > .99)!.ref
    const support = engine.inspectCurrentFaceSupport(reference, null)
    if (support.kind !== 'plane') throw new Error('Expected actual v2 endcap plane')
    close(support.point, [0, 0, 12]); close(support.normal, [0, 0, 1])
    const original = { ...reference }
    expect(() => engine.inspectCurrentFaceSupport({ ...reference, key: 'face-v2|' + '0'.repeat(64) }, null)).toThrow('ya no se puede identificar')
    engine.dispose(); expect(() => engine.inspectCurrentFaceSupport(original, null)).toThrow('reconstrucción completa')
  } finally { engine.dispose() }
}, 60_000)

it('releases every built definition when a later real feature fails instead of publishing a partial native session', () => {
  const input = document(), invalid = pin()
  invalid.id = invalid.document.id = 'invalid-part'
  const sketch = invalid.document.features[2]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original bore profile missing')
  sketch.profile.center = [100, 100] // Actual tool misses the actual native pin.
  input.definitions.push(invalid); input.occurrences.push({ ...occurrence('invalid'), definition: { id: invalid.id, revision: invalid.revision } })
  const originalBuild = CadEngine.prototype.rebuildForAssemblyReferences, originalDispose = CadEngine.prototype.dispose
  const built: CadEngine[] = [], released = new Map<CadEngine, number>()
  const dispose = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) {
    released.set(this, (released.get(this) ?? 0) + 1); return originalDispose.call(this)
  })
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function(this: CadEngine, features) {
    built.push(this); return originalBuild.call(this, features)
  })
  try {
    expect(() => new AssemblyGeometrySnapshot(input)).toThrow('No se pudo reconstruir')
    expect(built).toHaveLength(2); expect(built.map(engine => released.get(engine))).toEqual([2, 2])
  } finally { build.mockRestore(); dispose.mockRestore() }
}, 60_000)

it('bounds expanded native body entries while rebuilding a reused two-body prototype only once', () => {
  const input = document(), definition = input.definitions[0]
  if (definition.kind !== 'part') throw new Error('Original part missing')
  definition.document.features.push(
    { id: 'second-profile', name: 'Original second disk', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [10, 0], radius: 1 } },
    { id: 'second-body', name: 'Original second body', type: 'extrude', sketchId: 'second-profile', depth: 3, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second' } },
  )
  input.occurrences = Array.from({ length: 2049 }, (_, index) => occurrence('reuse-' + index))
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  try {
    expect(() => new AssemblyGeometrySnapshot(input)).toThrow('4096 entradas de cuerpo expandidas')
    expect(build).toHaveBeenCalledTimes(1)
  } finally { build.mockRestore() }
}, 60_000)
import { requireResolvedBinaryMate } from './kernel.assembly-binary-fixtures.test-utils'
