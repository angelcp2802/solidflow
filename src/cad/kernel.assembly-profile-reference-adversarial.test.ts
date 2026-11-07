import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateDocument } from '../model/document'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyOccurrence,
  type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition, type AssemblyGeometryReference } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyProfilePlacementArithmetic, type AssemblyEndpointWitness,
  type AssemblyFaceSelection, type AssemblyProfileWitness } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'
import { measureAssemblyProfileReferences } from './kernel.assembly-profile-measurement'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original literal recipe: a 6 x 4 x 3 box centered at XY [2,1], plus a
// separate radius-2 disk extrusion. No imported model or native application.
// The box's top profile center is [2,1,3]; translated reuse adds [3,4,2].
const stamp = '2026-10-22T00:00:00.000Z'
function part(): EmbeddedPartDefinition {
  return { kind: 'part', id: 'original-profile-adversarial-part', revision: 'r1', document: validateDocument({
    version: 1, id: 'original-profile-adversarial-part', name: 'Original bounded-profile controls', units: 'mm',
    createdAt: stamp, updatedAt: stamp, features: [
      { id: 'rectangle', name: 'Original 6 by 4 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [2, 1], width: 6, height: 4 } },
      { id: 'box', name: 'Original 3 mm prism', type: 'extrude', sketchId: 'rectangle', depth: 3, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId: 'box-body' } },
      { id: 'circle', name: 'Original separate radius-2 circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'circle', center: [12, 1], radius: 2 } },
      { id: 'disk', name: 'Original separate circular prism', type: 'extrude', sketchId: 'circle', depth: 3, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId: 'disk-body' } },
    ],
  }) }
}
function occurrence(id: string, definition = { id: 'original-profile-adversarial-part', revision: 'r1' }): AssemblyOccurrence {
  return { id, name: id, definition, pose: identityRigidPose(), fixed: true, visible: true, suppressed: false }
}
function fixture(): AssemblyDocument {
  const document = createEmptyAssembly('Original adversarial profile references')
  document.definitions = [part()]
  document.occurrences = [occurrence('first'), occurrence('second')]
  document.occurrences[1].pose.translation = [3, 4, 2]
  return validateAssemblyDocument(document)
}
function top(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, path = ['first']): AssemblyFaceSelection {
  const candidates = snapshot.listFaces(document, path).filter(value => value.body?.bodyId === 'box-body')
  const selected = candidates.filter(selection => {
    const witness = snapshot.resolveReference(document, { kind: 'face', ...selection, support: 'plane' })
    return witness.kind === 'support' && witness.localSupport.kind === 'plane'
      && witness.localSupport.normal[2] > .999 && Math.abs(witness.localSupport.point[2] - 3) < 1e-10
  })
  expect(selected).toHaveLength(1)
  return selected[0]
}
const flatten = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(flatten) : [])]

it('keeps profile proof separate from old binary purposes while the saved-family dispatcher accepts authentic profiles', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const selection = top(snapshot, document), plane = snapshot.resolveReference(document, { kind: 'face', ...selection, support: 'plane' }),
      profile = snapshot.resolveProfileFaceSelection(document, selection)
    expect(() => snapshot.assertProfileWitness(plane as unknown as AssemblyProfileWitness, document)).toThrow()
    expect(() => assemblyProfilePlacementArithmetic(plane as unknown as AssemblyProfileWitness, document)).toThrow()
    expect(() => snapshot.assertWitness(profile as unknown as AssemblyEndpointWitness, document)).toThrow()
    expect(snapshot.assertMateWitness(profile, document)).toBe(profile)
    expect(() => snapshot.assertMateWitness(structuredClone(profile), document)).toThrow()
    expect(() => snapshot.assertMateWitness({ ...plane, kind: 'profile', origin: 'native-profile-face' } as unknown as AssemblyProfileWitness, document)).toThrow()
    expect(() => snapshot.assertMateWitness({ ...profile, kind: 'support', origin: 'native-face' } as unknown as AssemblyEndpointWitness, document)).toThrow()
    expect(() => snapshot.resolveReference(document, profile as unknown as AssemblyGeometryReference)).toThrow()
    expect(snapshot.assertProfileWitness(profile, document)).toBe(profile)
    expect(profile.localSupport.center).toEqual([2, 1, 3])
    expect('token' in profile || 'mate' in profile || 'document' in profile).toBe(false)
  } finally { snapshot.dispose() }
})

it('rejects executable selection/band fields and a sparse scope without reading them or retiring a good snapshot', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const selection = top(snapshot, document), before = snapshot.resolveProfileFaceSelection(document, selection)
    let reads = 0
    const malicious = { component: selection.component, body: selection.body,
      get face() { reads++; return selection.face } }
    const band = { get lengthToleranceMm() { reads++; return 1e-6 } }
    const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
    try {
      expect(() => snapshot.resolveProfileFaceSelection(document, malicious)).toThrow()
      expect(() => snapshot.resolveProfileFaceSelection(document, selection, [], band)).toThrow()
      expect(() => snapshot.resolveProfileFaceSelection(document, selection, new Array<string>(1))).toThrow()
      expect(reads).toBe(0); expect(query).not.toHaveBeenCalled()
    } finally { query.mockRestore() }
    expect(snapshot.assertProfileWitness(before, document)).toBe(before)
    expect(snapshot.resolveProfileFaceSelection(document, selection).localSupport.center).toEqual([2, 1, 3])
  } finally { snapshot.dispose() }
})

it('rejects a structurally mismatched face/body source before native work and preserves the borrowed session', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const selection = top(snapshot, document), witness = snapshot.resolveProfileFaceSelection(document, selection),
      query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
    try {
      expect(() => snapshot.resolveProfileFaceSelection(document, { ...selection,
        body: { bodyId: 'disk-body', sourceFeatureId: 'disk' } })).toThrow()
      expect(query).not.toHaveBeenCalled()
    } finally { query.mockRestore() }
    expect(snapshot.assertProfileWitness(witness, document)).toBe(witness)
  } finally { snapshot.dispose() }
})

it.each(['same-tuple source', 'dormant definition', 'sibling pose'] as const)('rejects profile proof after a %s edit without trusting unchanged labels', edit => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const selection = top(snapshot, document), witness = snapshot.resolveProfileFaceSelection(document, selection), changed = structuredClone(document)
    if (edit === 'same-tuple source') {
      const source = changed.definitions[0]
      if (source.kind !== 'part' || source.document.features[0].type !== 'sketch' || source.document.features[0].profile.kind !== 'rectangle') throw Error('Original rectangle required')
      source.document.features[0].profile.width = 7
    } else if (edit === 'dormant definition') {
      const dormant = part(); dormant.id = dormant.document.id = 'original-dormant-profile'; changed.definitions.push(dormant)
    } else changed.occurrences[1].pose.translation[0] = 4
    expect(() => snapshot.assertProfileWitness(witness, changed)).toThrow(/documento cambió/)
    expect(() => snapshot.resolveProfileFaceSelection(changed, selection)).toThrow(/documento cambió/)
    expect(snapshot.assertProfileWitness(witness, document)).toBe(witness)
  } finally { snapshot.dispose() }
})

it('withholds a witness if the source document changes reentrantly during an actual native profile query', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document), selection = top(snapshot, document),
    original = CadEngine.prototype.inspectCurrentProfileSupport
  let reached = false
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport').mockImplementation(function (this: CadEngine, ...args) {
    const measured = original.apply(this, args)
    const source = document.definitions[0]
    if (source.kind !== 'part' || source.document.features[0].type !== 'sketch' || source.document.features[0].profile.kind !== 'rectangle') throw Error('Original rectangle required')
    source.document.features[0].profile.width = 7; reached = true
    return measured
  })
  try {
    expect(() => snapshot.resolveProfileFaceSelection(document, selection)).toThrow(/documento cambió/)
    expect(reached).toBe(true)
    expect(() => snapshot.listFaces(document, ['first'])).toThrow(/vigente/)
  } finally { query.mockRestore(); snapshot.dispose() }
})

it('preserves both a native query failure and genuine cleanup failure, issuing no reusable profile proof', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document), selection = top(snapshot, document),
    before = snapshot.resolveProfileFaceSelection(document, selection), primary = Error('Original profile query failure'),
    cleanup = Error('Original profile engine release failure'), actualQuery = CadEngine.prototype.inspectCurrentProfileSupport,
    actualDispose = CadEngine.prototype.dispose
  let measured = false, released = 0, observed: unknown
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport').mockImplementation(function (this: CadEngine, ...args) {
    actualQuery.apply(this, args); measured = true; throw primary
  })
  const dispose = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    actualDispose.call(this); released++; throw cleanup
  })
  try {
    try { snapshot.resolveProfileFaceSelection(document, selection) } catch (error) { observed = error }
    expect(measured).toBe(true); expect(released).toBe(1); expect(observed).toBeInstanceOf(NativeCleanupError)
    expect(flatten(observed)).toContain(primary); expect(flatten(observed)).toContain(cleanup)
    expect(() => snapshot.assertProfileWitness(before, document)).toThrow(/vigente/)
  } finally { query.mockRestore(); dispose.mockRestore(); snapshot.dispose() }
  const fresh = new AssemblyGeometrySnapshot(document)
  try { expect(fresh.resolveProfileFaceSelection(document, top(fresh, document)).localSupport.center).toEqual([2, 1, 3]) }
  finally { fresh.dispose() }
})

function cancellingChain(): AssemblyDocument {
  const document = fixture(), inner: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-profile-inner', revision: 'r1',
    name: 'Original cancelling inner', createdAt: stamp, updatedAt: stamp, occurrences: document.occurrences, mates: [] },
    middleOccurrence = occurrence('inner', { id: inner.id, revision: inner.revision })
  middleOccurrence.pose.translation = [-1e16, 0, 0]
  const outer: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-profile-outer', revision: 'r1',
    name: 'Original cancelling outer', createdAt: stamp, updatedAt: stamp, occurrences: [middleOccurrence], mates: [] }
  document.definitions.push(inner, outer)
  const root = occurrence('outer', { id: outer.id, revision: outer.revision }); root.pose.translation = [1e16, 0, 0]
  document.occurrences = [root]
  return validateAssemblyDocument(document)
}
it('retains original large-chain magnitudes even when composed profile centers appear ordinary', () => {
  const document = cancellingChain(), before = serializeAssemblyDocument(document), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const selection = top(snapshot, document, ['outer', 'inner', 'first']), witness = snapshot.resolveProfileFaceSelection(document, selection),
      arithmetic = assemblyProfilePlacementArithmetic(witness, document)
    expect(witness.worldSupport.center).toEqual([2, 1, 3])
    expect(arithmetic).toEqual({ placementSum: 2e16, depth: 3 })
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { snapshot.dispose() }
})

it('rejects forged display geometry and executable pair/policy fields before either native query, keeping live proof', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const first = top(snapshot, document), second = top(snapshot, document, ['second']),
      witness = snapshot.resolveProfileFaceSelection(document, first), input = { first, second }
    let reads = 0
    const forged = { first: { ...first, localSupport: { kind: 'rectangle', center: [0, 0, 0] }, mesh: [] }, second },
      executable = { get first() { reads++; return first }, second },
      options = { get lengthResolutionMm() { reads++; return 1e-6 } },
      query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
    try {
      expect(() => measureAssemblyProfileReferences(snapshot, document, forged)).toThrow()
      expect(() => measureAssemblyProfileReferences(snapshot, document, executable)).toThrow()
      expect(() => measureAssemblyProfileReferences(snapshot, document, input, options)).toThrow()
      expect(() => measureAssemblyProfileReferences(snapshot, document, input, {}, new Array<string>(1))).toThrow()
      expect(() => measureAssemblyProfileReferences(snapshot, document, input, { angleResolutionRad: Math.PI })).toThrow()
      expect(query).not.toHaveBeenCalled(); expect(reads).toBe(0)
    } finally { query.mockRestore() }
    expect(snapshot.assertProfileWitness(witness, document)).toBe(witness)
    expect(measureAssemblyProfileReferences(snapshot, document, input).status).toBe('ok')
  } finally { snapshot.dispose() }
})

it('does not repair a missing current body identity using unchanged component/face names', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document), first = top(snapshot, document),
    second = top(snapshot, document, ['second']), before = serializeAssemblyDocument(document)
  try {
    expect(() => measureAssemblyProfileReferences(snapshot, document, { first,
      second: { ...second, body: { bodyId: 'missing-current-body', sourceFeatureId: 'box' } } })).toThrow()
    expect(() => snapshot.listFaces(document, ['first'])).toThrow(/vigente/)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { snapshot.dispose() }
  const fresh = new AssemblyGeometrySnapshot(document)
  try { expect(measureAssemblyProfileReferences(fresh, document, { first: top(fresh, document), second: top(fresh, document, ['second']) }).status).toBe('ok') }
  finally { fresh.dispose() }
})

it('withholds the whole pair after the second actual native query fails and invalidates its prior witness', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document), first = top(snapshot, document), second = top(snapshot, document, ['second']),
    prior = snapshot.resolveProfileFaceSelection(document, first), actual = CadEngine.prototype.inspectCurrentProfileSupport,
    failure = Error('Original second native profile failure'), before = serializeAssemblyDocument(document)
  let calls = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport').mockImplementation(function (this: CadEngine, ...args) {
    const value = actual.apply(this, args)
    if (++calls === 2) throw failure
    return value
  })
  try {
    expect(() => measureAssemblyProfileReferences(snapshot, document, { first, second })).toThrow(failure)
    expect(calls).toBe(2); expect(() => snapshot.assertProfileWitness(prior, document)).toThrow(/vigente/)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { query.mockRestore(); snapshot.dispose() }
})

it('keeps hidden active owners measurable but rejects a suppressed ancestor before native queries', () => {
  const document = cancellingChain()
  document.occurrences[0].pose = identityRigidPose(); document.occurrences[0].visible = false
  const outer = document.definitions.find(value => value.id === 'original-profile-outer')!
  if (outer.kind !== 'assembly') throw Error('Original outer required')
  outer.occurrences[0].pose = identityRigidPose()
  const snapshot = new AssemblyGeometrySnapshot(document)
  let first: AssemblyFaceSelection, second: AssemblyFaceSelection
  try {
    first = top(snapshot, document, ['outer', 'inner', 'first']); second = top(snapshot, document, ['outer', 'inner', 'second'])
    expect(measureAssemblyProfileReferences(snapshot, document, { first, second }).status).toBe('ok')
  } finally { snapshot.dispose() }
  document.occurrences[0].suppressed = true
  const suppressed = new AssemblyGeometrySnapshot(document), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
  try {
    expect(() => measureAssemblyProfileReferences(suppressed, document, { first, second })).toThrow(/suprimida/)
    expect(query).not.toHaveBeenCalled()
  } finally { query.mockRestore(); suppressed.dispose() }
})
