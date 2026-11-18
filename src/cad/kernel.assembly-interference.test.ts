import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference,
  type AssemblyMate, type AssemblyComponentReference, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { identityRigidPose } from '../model/rigidPose'
import { MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS, type AssemblyInterferencePair, type AssemblyInterferenceScope } from '../model/assemblyInterference'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, prepareAssemblySolve } from './kernel.assembly-solve'
import { CadEngine } from './kernel.engine'
import { validatePositiveClosedTool } from './kernel.closed-tools'
import { NativeCleanupError, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import * as placements from './kernel.assembly-placements'
import type { Feature, Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original millimeter fixtures made only from public part features. Default
// boxes are 16×10×8. Translation(12,0,0) intersects by 4×10×8=320 mm³;
// Z90+(10,0,0) intersects by 3×10×8=240. Diagonal gaps (.6,.8) have
// Euclidean clearance 1, whereas (.8,.8) exceed 1 despite candidate AABBs.
// Tiny overlaps use native closed solids, not a fabricated mass or mesh result.
// The original plate/pins are actually solved from selected native faces:
// plate holes R3, updated pins R2.5 → radial clearance .5; pin centers20 apart
// give an analytical radial gap15, only used to expect broad-phase exclusion.
const stamp = '2026-10-15T00:00:00.000Z'
const near = (actual: number, expected: number, tolerance = 1e-6) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
function definition(id = 'box', width = 16, height = 10, depth = 8, legacy = false): EmbeddedPartDefinition {
  return { kind: 'part', id, revision: 'r1', document: validateDocument({ version: 1, id, name: 'Original analytical ' + id,
    units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width, height } },
      { id: 'create', name: 'Original box', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
        ...(legacy ? {} : { bodyOperation: { mode: 'new', bodyId: 'box-body' } as const }) },
    ] }) }
}
function boxes(translation: Vec3 = [12, 0, 0], part = definition()): AssemblyDocument {
  const input = createEmptyAssembly('Original native interference boxes'); input.definitions = [part]
  input.occurrences = ['a', 'b'].map((id, index) => ({ id, name: 'Original component ' + id, definition: { id: part.id, revision: part.revision },
    pose: { ...identityRigidPose(), translation: index ? [...translation] as Vec3 : [0, 0, 0] as Vec3 }, fixed: false, suppressed: false, visible: true }))
  return validateAssemblyDocument(input)
}
function fourBoxes(): AssemblyDocument {
  const input = boxes(), original = input.occurrences[0]
  input.occurrences = [0, 12, 24, 40].map((x, index) => ({ ...structuredClone(original), id: 'abcd'[index],
    pose: { ...identityRigidPose(), translation: [x, 0, 0] } }))
  return validateAssemblyDocument(input)
}
// Original 4x6x4 prisms: A x=[1,5], B=[4,8], C=[3,7], common YZ area24.
// Thus AB=24, AC=48, BC=72 mm3. Reusing G repeats occurrences, not material unions.
function groupedBoxes(layout: 'flat' | 'single' | 'nested' | 'reused'): AssemblyDocument {
  const input = createEmptyAssembly('Original root-child grouping'), part = definition('group-box', 4, 6, 4)
  const occurrence = (id: string, source = part.id, x = 0) => ({ id, name: 'Original ' + id, definition: { id: source, revision: 'r1' },
    pose: { ...identityRigidPose(), translation: [x, 0, 0] as Vec3 }, fixed: false, suppressed: false, visible: true })
  const a = occurrence('a', part.id, 3), b = occurrence('b', part.id, 6), c = occurrence('c', part.id, 5)
  input.definitions = [part,
    { kind: 'assembly', id: 'inner', revision: 'r1', name: 'Original inner pair', createdAt: stamp, updatedAt: stamp, occurrences: [a, b], mates: [] },
    { kind: 'assembly', id: 'outer', revision: 'r1', name: 'Original outer group', createdAt: stamp, updatedAt: stamp, occurrences: [occurrence('s', 'inner'), c], mates: [] }]
  input.occurrences = layout === 'flat' ? [a, b, c] : layout === 'single' ? [occurrence('s', 'inner'), c]
    : layout === 'nested' ? [occurrence('g', 'outer')] : [occurrence('g1', 'outer'), occurrence('g2', 'outer')]
  return validateAssemblyDocument(input)
}
const component = (path: string[], id = 'box', revision = 'r1'): AssemblyComponentReference => ({ occurrencePath: path, definition: { id, revision } })
const selectedScope = (mode: AssemblyInterferenceScope['mode'], selected: string[], excluded: string[] = []): AssemblyInterferenceScope =>
  ({ mode, selected: selected.map(id => component([id])), excluded: excluded.map(id => component([id])) })
function pairNames(pair: AssemblyInterferencePair): string {
  return [pair.first.component.occurrencePath.join('/'), pair.second.component.occurrencePath.join('/')].join(' - ')
}
function only(input: AssemblyDocument, options?: Parameters<typeof analyzeAssemblyInterference>[1]): AssemblyInterferencePair {
  const result = analyzeAssemblyInterference(input, options)
  expect(result.pairs).toHaveLength(1); expect(result.potentialPairCount).toBe(result.testedPairCount + result.broadPhaseExcludedCount)
  return result.pairs[0]
}
function assertPoints(pair: AssemblyInterferencePair, expected: number) {
  expect(pair.closestPoints).not.toBeNull()
  const value = pair.closestPoints!
  near(Math.hypot(...value.first.map((coordinate, index) => coordinate - value.second[index])), expected)
}
function multi(legacy = false, spacing = 10): EmbeddedPartDefinition {
  const value = definition('two-boxes', 4, 4, 4, legacy)
  value.document.features = [0, 1].flatMap((index): Feature[] => [
    { id: 'profile-' + index, name: 'Original separate rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [spacing * index, 0], width: 4, height: 4 } },
    { id: 'create-' + index, name: 'Original separate box', type: 'extrude', sketchId: 'profile-' + index, depth: 4, symmetric: false, suppressed: false,
      ...(legacy ? {} : { bodyOperation: { mode: 'new', bodyId: 'body-' + index } }) },
  ])
  return value
}
function solvedPlatePins(): AssemblyDocument {
  const input = createAssemblyExample(), pin = input.definitions.find(value => value.id === 'example-pin')!
  if (pin.kind !== 'part' || pin.document.features[0].type !== 'sketch' || pin.document.features[0].profile.kind !== 'circle') throw new Error('Original pin missing')
  pin.document.features[0].profile.radius = 2.5
  const scene = buildAssemblyScene(input), mates: AssemblyMate[] = []
  const select = (id: string, predicate: (face: AssemblySceneFace) => boolean): AssemblySceneFace => {
    const matches = scene.bodies.filter(body => body.component.occurrencePath[0] === id).flatMap(body => body.faces).filter(predicate)
    expect(matches).toHaveLength(1); return matches[0]
  }
  const axis = (id: string, radius: number, x: number) => select(id, face => face.support?.kind === 'cylinder'
    && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9)
  const cap = (id: string, z: number) => select(id, face => face.support?.kind === 'plane'
    && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99)
  const ref = (face: AssemblySceneFace): AssemblyFaceReference => {
    const value = assemblySceneFaceReference(face); if (!value) throw new Error('Actual analytical support missing'); return value
  }
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const a = axis(id, 2.5, 0), b = axis('plate', 3, x), aSupport = a.support, bSupport = b.support
    if (aSupport?.kind !== 'cylinder' || bSupport?.kind !== 'cylinder') throw new Error('Actual cylinders missing')
    const sign = aSupport.axis.reduce((sum, value, index) => sum + value * bSupport.axis[index], 0)
    mates.push({ id: id + '-axis', name: 'Original concentric ' + id, type: 'concentric', suppressed: false,
      alignment: sign > 0 ? 'aligned' : 'opposed', rotationLock: null,
      first: { ...ref(a), support: 'axis' }, second: { ...ref(b), support: 'axis' } },
    { id: id + '-cap', name: 'Original top cap ' + id, type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { ...ref(cap(id, 12)), support: 'plane' }, second: { ...ref(cap('plate', 4)), support: 'plane' } })
  }
  input.mates = mates
  const preview = prepareAssemblySolve(input)
  expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw new Error(preview.message)
  return applyAssemblySolvePreview(new AssemblyDocumentHistory(input), preview)
}
function captured(action: () => unknown): unknown { try { action() } catch (error) { return error } return undefined }
const errorTree = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(errorTree)] : [error]
/** Patch only the actual native wrappers received by this component, before adoption. */
function nativeFault<T>(context: string, patch: (owner: NativeOwner) => void, action: () => T): T {
  const real = ownership.withNativeOwners
  const replacement: typeof ownership.withNativeOwners = <R>(operation: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], label?: string): R => real(owners => {
    if (context === label) {
      const own = owners.own.bind(owners)
      owners.own = <S extends NativeOwner>(value: S): S => { patch(value); return own(value) }
    }
    return operation(owners)
  }, retained, label)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement)
  try { return action() } finally { spy.mockRestore() }
}

it('reports actual box overlap volume and only world-positioned solid intersection mesh without input mutation', () => {
  const input = boxes(), before = serializeAssemblyDocument(input), build = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const result = analyzeAssemblyInterference(input), pair = result.pairs[0]
    expect(build).toHaveBeenCalledTimes(1); expect(result.bodyCount).toBe(2); expect(result.componentCount).toBe(2)
    expect(result.testedPairCount).toBe(1); expect(result.broadPhaseExcludedCount).toBe(0); expect(pair.status).toBe('overlap')
    near(pair.intersectionVolume, 320); near(pair.minimumDistance, 0); expect(pair.solidCount).toBe(1); assertPoints(pair, 0)
    const mesh = pair.intersectionMesh!; expect(mesh.vertices.length).toBeGreaterThan(0); expect(mesh.normals).toHaveLength(mesh.vertices.length)
    expect(mesh.triangles.length).toBeGreaterThan(0)
    for (let index = 0; index < mesh.vertices.length; index += 3) {
      expect(mesh.vertices[index]).toBeGreaterThanOrEqual(4 - 1e-6); expect(mesh.vertices[index]).toBeLessThanOrEqual(8 + 1e-6)
      expect(Math.abs(mesh.vertices[index + 1])).toBeLessThanOrEqual(5 + 1e-6)
      expect(mesh.vertices[index + 2]).toBeGreaterThanOrEqual(-1e-6); expect(mesh.vertices[index + 2]).toBeLessThanOrEqual(8 + 1e-6)
    }
    expect('token' in result).toBe(false); expect('volume' in result).toBe(false); expect(() => structuredClone(result)).not.toThrow()
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { build.mockRestore() }
}, 60_000)

// Reuse the tracked original public two-body part unchanged. The inner S now
// contains m1 and m2; two document-root G occurrences reuse that same S.
// Four leaves/eight bodies remain coincident at their declared identity poses.
async function scopedMultibodyGroups(): Promise<AssemblyDocument> {
  const input = JSON.parse(await readFile(new URL('./fixtures/assembly-interference-grouping-multibody-original.json', import.meta.url), 'utf8')) as AssemblyDocument
  input.occurrences[0].id = 'g1'; input.occurrences[1].id = 'g2'
  const inner = input.definitions.find(value => value.id === 'original-grouping-multibody-inner')
  if (!inner || inner.kind !== 'assembly') throw new Error('Original public inner assembly missing')
  inner.occurrences = ['m1', 'm2'].map(id => ({ ...structuredClone(inner.occurrences[0]), id }))
  return validateAssemblyDocument(input)
}
const scopeM11 = component(['g1', 's', 'm1'], 'original-analysis-multibody'), scopeM12 = component(['g1', 's', 'm2'], 'original-analysis-multibody'),
  scopeM21 = component(['g2', 's', 'm1'], 'original-analysis-multibody'), scopeM22 = component(['g2', 's', 'm2'], 'original-analysis-multibody'),
  scopeG1 = component(['g1'], 'original-grouping-multibody-outer'), scopeG2 = component(['g2'], 'original-grouping-multibody-outer')

// Literal body-pair matrix for A=[0,2]x[0,3]x[0,4], B=[1,3]x[0,3]x[0,4].
// These four rows and the explicit leaf-pair lists below are acceptance data;
// no production scope/grouping predicate supplies the expected pair set.
const scopedBodyPairs = [
  { first: { bodyId: 'analysis-body-a', sourceFeatureId: 'box-a-extrude' }, second: { bodyId: 'analysis-body-a', sourceFeatureId: 'box-a-extrude' }, volume: 24, min: [0, 0, 0], max: [2, 3, 4] },
  { first: { bodyId: 'analysis-body-a', sourceFeatureId: 'box-a-extrude' }, second: { bodyId: 'analysis-body-b', sourceFeatureId: 'box-b-extrude' }, volume: 12, min: [1, 0, 0], max: [2, 3, 4] },
  { first: { bodyId: 'analysis-body-b', sourceFeatureId: 'box-b-extrude' }, second: { bodyId: 'analysis-body-a', sourceFeatureId: 'box-a-extrude' }, volume: 12, min: [1, 0, 0], max: [2, 3, 4] },
  { first: { bodyId: 'analysis-body-b', sourceFeatureId: 'box-b-extrude' }, second: { bodyId: 'analysis-body-b', sourceFeatureId: 'box-b-extrude' }, volume: 24, min: [1, 0, 0], max: [3, 3, 4] },
]
const groupedScopeCases: { label: string; scope: AssemblyInterferenceScope; selected: number; excluded: number; leaves: number; bodies: number;
  pairs: number; leafPairs: [string, string][] }[] = [
  { label: 'all four leaves', scope: { mode: 'all', selected: [], excluded: [] }, selected: 0, excluded: 0, leaves: 4, bodies: 8, pairs: 16,
    leafPairs: [['g1/s/m1', 'g2/s/m1'], ['g1/s/m1', 'g2/s/m2'], ['g1/s/m2', 'g2/s/m1'], ['g1/s/m2', 'g2/s/m2']] },
  { label: 'all with one excluded reused leaf', scope: { mode: 'all', selected: [], excluded: [scopeM22] }, selected: 0, excluded: 1, leaves: 3, bodies: 6, pairs: 8,
    leafPairs: [['g1/s/m1', 'g2/s/m1'], ['g1/s/m2', 'g2/s/m1']] },
  { label: 'all with an excluded root ancestor', scope: { mode: 'all', selected: [], excluded: [scopeG2] }, selected: 0, excluded: 2, leaves: 2, bodies: 4, pairs: 0, leafPairs: [] },
  { label: 'two selected leaves retain their one document-root group', scope: { mode: 'among-selected', selected: [scopeM11, scopeM12], excluded: [] }, selected: 2, excluded: 0, leaves: 2, bodies: 4, pairs: 0, leafPairs: [] },
  { label: 'one leaf in each reused root remains distinct', scope: { mode: 'among-selected', selected: [scopeM11, scopeM21], excluded: [] }, selected: 2, excluded: 0, leaves: 2, bodies: 4, pairs: 4,
    leafPairs: [['g1/s/m1', 'g2/s/m1']] },
  { label: 'ancestor and descendant selection deduplicate without promoting roots', scope: { mode: 'among-selected', selected: [scopeG1, scopeM11, scopeM21], excluded: [] }, selected: 3, excluded: 0, leaves: 3, bodies: 6, pairs: 8,
    leafPairs: [['g1/s/m1', 'g2/s/m1'], ['g1/s/m2', 'g2/s/m1']] },
  { label: 'selected exclusion removes a leaf without making its sibling a new root', scope: { mode: 'among-selected', selected: [scopeM11, scopeM12], excluded: [scopeM12] }, selected: 2, excluded: 1, leaves: 1, bodies: 2, pairs: 0, leafPairs: [] },
  // XOR is SolidFlow's declared selected/rest policy, not a native-dialog claim.
  { label: 'XOR omits a same-root rest leaf', scope: { mode: 'selected-against-rest', selected: [scopeM11], excluded: [] }, selected: 1, excluded: 0, leaves: 4, bodies: 8, pairs: 8,
    leafPairs: [['g1/s/m1', 'g2/s/m1'], ['g1/s/m1', 'g2/s/m2']] },
  { label: 'XOR expands and deduplicates a selected ancestor', scope: { mode: 'selected-against-rest', selected: [scopeG1, scopeM11], excluded: [] }, selected: 2, excluded: 0, leaves: 4, bodies: 8, pairs: 16,
    leafPairs: [['g1/s/m1', 'g2/s/m1'], ['g1/s/m1', 'g2/s/m2'], ['g1/s/m2', 'g2/s/m1'], ['g1/s/m2', 'g2/s/m2']] },
  { label: 'XOR crosses membership in both original root groups', scope: { mode: 'selected-against-rest', selected: [scopeM11, scopeM21], excluded: [] }, selected: 2, excluded: 0, leaves: 4, bodies: 8, pairs: 8,
    leafPairs: [['g1/s/m1', 'g2/s/m2'], ['g1/s/m2', 'g2/s/m1']] },
  { label: 'XOR excluding its only selected leaf has no candidates', scope: { mode: 'selected-against-rest', selected: [scopeM11], excluded: [scopeM11] }, selected: 1, excluded: 1, leaves: 3, bodies: 6, pairs: 0, leafPairs: [] },
  { label: 'XOR selecting both reused ancestors has no rest', scope: { mode: 'selected-against-rest', selected: [scopeG1, scopeG2], excluded: [] }, selected: 4, excluded: 0, leaves: 4, bodies: 8, pairs: 0, leafPairs: [] },
]

it('retains the same document root for partial leaf selection under both flags and exclusion', async () => {
  const input = await scopedMultibodyGroups(), before = serializeAssemblyDocument(input)
  const scope: AssemblyInterferenceScope = { mode: 'among-selected', selected: [scopeM11, scopeM12], excluded: [] }
  const ungrouped = analyzeAssemblyInterference(input, { scope })
  expect(ungrouped.pairs).toHaveLength(4); expect(ungrouped.pairs.map(pair => pair.intersectionVolume)).toEqual([24, 12, 12, 24])
  for (const within of [false, true]) {
    const report = analyzeAssemblyInterference(input, { scope, treatSubassembliesAsComponents: true, includeWithinComponent: within })
    expect(report.potentialPairCount).toBe(0); expect(report.pairs).toEqual([]); expect(report.bodyCount).toBe(4)
    expect(report.options).toMatchObject({ scope, treatSubassembliesAsComponents: true, includeWithinComponent: within })
  }
  const internal = analyzeAssemblyInterference(input, { scope, includeWithinComponent: true })
  expect(internal.pairs).toHaveLength(6); expect(internal.pairs.map(pair => pair.intersectionVolume).sort((a, b) => a - b)).toEqual([12, 12, 12, 12, 24, 24])
  const excluded = analyzeAssemblyInterference(input, { scope: { ...scope, excluded: [scopeM12] }, includeWithinComponent: true })
  expect(excluded.potentialPairCount).toBe(1); expect(excluded.pairs).toHaveLength(1)
  const pair = excluded.pairs[0]
  expect(pair.id).toBe(JSON.stringify([
    JSON.stringify([['g1', 's', 'm1'], 'original-analysis-multibody', 'r1', ['analysis-body-a', 'box-a-extrude']]),
    JSON.stringify([['g1', 's', 'm1'], 'original-analysis-multibody', 'r1', ['analysis-body-b', 'box-b-extrude']]),
  ]))
  near(pair.intersectionVolume, 12, 1e-5); expect(pair.first.component).toEqual(scopeM11); expect(pair.second.component).toEqual(scopeM11)
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('keeps inherited visibility and suppressed ancestry separate from document-root grouping', async () => {
  const input = await scopedMultibodyGroups(), scope: AssemblyInterferenceScope = { mode: 'among-selected', selected: [scopeM11, scopeM21], excluded: [] }
  input.occurrences[0].visible = false
  const before = serializeAssemblyDocument(input), included = analyzeAssemblyInterference(input, { scope, treatSubassembliesAsComponents: true })
  expect(included.pairs).toHaveLength(4); expect(included.pairs.map(pair => pair.intersectionVolume)).toEqual([24, 12, 12, 24])
  const hidden = analyzeAssemblyInterference(input, { scope, treatSubassembliesAsComponents: true, includeHidden: false, includeWithinComponent: true })
  expect(hidden.scopeSummary).toEqual({ mode: 'among-selected', selectedLeafCount: 2, excludedLeafCount: 0, eligibleLeafCount: 1, eligiblePairCount: 0 })
  expect(hidden.bodyCount).toBe(2); expect(hidden.pairs).toEqual([]); expect(serializeAssemblyDocument(input)).toBe(before)
  input.occurrences[1].suppressed = true
  const suppressedBefore = serializeAssemblyDocument(input)
  const suppressed = analyzeAssemblyInterference(input, { scope, treatSubassembliesAsComponents: true, includeWithinComponent: true })
  expect(suppressed.scopeSummary).toEqual({ mode: 'among-selected', selectedLeafCount: 1, excludedLeafCount: 0, eligibleLeafCount: 1, eligiblePairCount: 0 })
  expect(suppressed.bodyCount).toBe(2); expect(suppressed.pairs).toEqual([]); expect(serializeAssemblyDocument(input)).toBe(suppressedBefore)
}, 60_000)

it.each(groupedScopeCases)('keeps document-root grouping and exact original body pairs under $label', async fixture => {
  const input = await scopedMultibodyGroups(), before = serializeAssemblyDocument(input), place = placements.placeAssemblyShape
  const material: { before: ReturnType<typeof bodyMaterial>; after?: ReturnType<typeof bodyMaterial> }[] = []
  const spy = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation((...args) => {
    const shape = place(...args), entry = { before: bodyMaterial(shape) } as typeof material[number], remove = shape.delete.bind(shape)
    material.push(entry)
    Object.defineProperty(shape, 'delete', { configurable: true, value: () => { try { entry.after = bodyMaterial(shape) } finally { remove() } } })
    return shape
  })
  try {
    const report = analyzeAssemblyInterference(input, { scope: fixture.scope, treatSubassembliesAsComponents: true, includeWithinComponent: true })
    expect(report.options.scope).toEqual(fixture.scope); expect(report.options).toMatchObject({ treatSubassembliesAsComponents: true, includeWithinComponent: true })
    expect(report.scopeSummary).toEqual({ mode: fixture.scope.mode, selectedLeafCount: fixture.selected, excludedLeafCount: fixture.excluded,
      eligibleLeafCount: fixture.leaves, eligiblePairCount: fixture.pairs })
    expect(report.componentCount).toBe(fixture.leaves); expect(report.bodyCount).toBe(fixture.bodies)
    expect(report.potentialPairCount).toBe(fixture.pairs); expect(report.testedPairCount).toBe(fixture.pairs); expect(report.broadPhaseExcludedCount).toBe(0)
    const expected = fixture.leafPairs.flatMap(([firstPath, secondPath]) => scopedBodyPairs.map(row => ({ ...row,
      firstPath: firstPath.split('/'), secondPath: secondPath.split('/'),
      id: JSON.stringify([
        JSON.stringify([firstPath.split('/'), 'original-analysis-multibody', 'r1', [row.first.bodyId, row.first.sourceFeatureId]]),
        JSON.stringify([secondPath.split('/'), 'original-analysis-multibody', 'r1', [row.second.bodyId, row.second.sourceFeatureId]]),
      ]) })))
    expect(report.pairs.map(pair => pair.id).sort()).toEqual(expected.map(pair => pair.id).sort())
    for (const row of expected) {
      const pair = report.pairs.find(value => value.id === row.id)!
      expect(pair.first.component).toEqual({ occurrencePath: row.firstPath, definition: { id: 'original-analysis-multibody', revision: 'r1' } })
      expect(pair.second.component).toEqual({ occurrencePath: row.secondPath, definition: { id: 'original-analysis-multibody', revision: 'r1' } })
      expect(pair.first.body).toEqual(row.first); expect(pair.second.body).toEqual(row.second)
      expect(pair.status).toBe('overlap'); expect(pair.solidCount).toBe(1); near(pair.intersectionVolume, row.volume, 1e-5); near(pair.minimumDistance, 0)
      const mesh = pair.intersectionMesh!
      expect(mesh.vertices.length).toBeGreaterThan(0); expect(mesh.normals).toHaveLength(mesh.vertices.length); expect(mesh.triangles.length).toBeGreaterThanOrEqual(36)
      for (let axis = 0; axis < 3; axis++) {
        const coordinates = mesh.vertices.filter((_, index) => index % 3 === axis)
        near(Math.min(...coordinates), row.min[axis]); near(Math.max(...coordinates), row.max[axis])
      }
    }
    expect(material).toHaveLength(fixture.bodies)
    for (const body of material) {
      expect(body.before.solidCount).toBe(1); near(body.before.volumeMm3, 24, 1e-5); near(body.before.areaMm2, 52, 1e-5)
      expect(body.after).toEqual(body.before)
    }
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { spy.mockRestore() }
}, 60_000)

it('detects containment as positive material instead of measuring only boundary-to-boundary separation', () => {
  const input = boxes([0, 0, 2]), inner = definition('inner', 4, 2, 2); input.definitions.push(inner); input.occurrences[1].definition = { id: 'inner', revision: 'r1' }
  const pair = only(input); expect(pair.status).toBe('overlap'); near(pair.intersectionVolume, 16); near(pair.minimumDistance, 0); assertPoints(pair, 0)
}, 60_000)

it.each([{ translation: [16, 0, 0] as Vec3 }, { translation: [16, 10, 0] as Vec3 }, { translation: [16, 10, 8] as Vec3 }])('reports native face/edge/point contact without a material overlay %#', ({ translation }) => {
  const pair = only(boxes(translation)); expect(pair.status).toBe('contact'); near(pair.intersectionVolume, 0)
  near(pair.minimumDistance, 0); expect(pair.solidCount).toBe(0); expect(pair.intersectionMesh).toBeNull(); assertPoints(pair, 0)
}, 60_000)

it.each([{ height: .1, depth: .1, overlap: 1e-5, expected: 1e-7 }, { height: .01, depth: .01, overlap: 8e-7, expected: 8e-11 }])('reports every positive small overlap, including below the source-body volume floor %#', fixture => {
  const pair = only(boxes([16 - fixture.overlap, 0, 0], definition('tiny', 16, fixture.height, fixture.depth)))
  expect(pair.status).toBe('small-overlap'); expect(pair.intersectionVolume).toBeGreaterThan(0)
  near(pair.intersectionVolume, fixture.expected, fixture.expected * 1e-5)
  expect(pair.solidCount).toBe(1); expect(pair.intersectionMesh!.vertices.length).toBeGreaterThan(0)
}, 60_000)

it('returns a measured half-millimeter clearance and consistent closest points', () => {
  const pair = only(boxes([16.5, 0, 0])); expect(pair.status).toBe('clearance'); near(pair.minimumDistance, .5); assertPoints(pair, .5)
  expect(pair.intersectionVolume).toBe(0); expect(pair.intersectionMesh).toBeNull()
}, 60_000)

it('reports near contact as tolerance-qualified instead of claiming exact zero distance', () => {
  const pair = only(boxes([16 + 5e-7, 0, 0])); expect(pair.status).toBe('contact')
  expect(pair.minimumDistance).toBeLessThanOrEqual(pair.lengthTolerance); expect(pair.lengthTolerance).toBeGreaterThanOrEqual(1e-6)
  expect(pair.intersectionMesh).toBeNull()
}, 60_000)

it('reports the effective native tolerance when requested length tolerance is smaller', () => {
  const deflections: number[] = []
  const pair = nativeFault('Assembly distance query or release failed.', owner => {
    if ('SetDeflection' in owner && typeof owner.SetDeflection === 'function') {
      const set = owner.SetDeflection.bind(owner)
      Object.defineProperty(owner, 'SetDeflection', { configurable: true, value: (value: number) => { deflections.push(value); set(value) } })
    }
  }, () => only(boxes([16, 0, 0]), { lengthTolerance: 1e-10 }))
  expect(pair.status).toBe('contact'); expect(pair.lengthTolerance).toBeGreaterThan(1e-10)
  expect(deflections).toEqual([pair.lengthTolerance])
}, 60_000)

it('uses Euclidean native distance for diagonal clearance instead of the largest AABB axis gap', () => {
  const pair = only(boxes([16.6, 10.8, 0])); expect(pair.status).toBe('clearance'); near(pair.minimumDistance, 1); assertPoints(pair, 1)
  const far = analyzeAssemblyInterference(boxes([16.8, 10.8, 0]))
  expect(far.potentialPairCount).toBe(1); expect(far.testedPairCount).toBe(1); expect(far.broadPhaseExcludedCount).toBe(0); expect(far.pairs).toEqual([])
}, 60_000)

it('excludes clearly distant native bounds without inventing an exact pair distance', () => {
  const result = analyzeAssemblyInterference(boxes([18, 0, 0]))
  expect(result.potentialPairCount).toBe(1); expect(result.testedPairCount).toBe(0); expect(result.broadPhaseExcludedCount).toBe(1); expect(result.pairs).toEqual([])
}, 60_000)

it('uses actual rotated solids with an independent Z90 Cartesian intersection formula', () => {
  const input = boxes([10, 0, 0]); input.occurrences[1].pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const pair = only(input); expect(pair.status).toBe('overlap'); near(pair.intersectionVolume, 240); near(pair.minimumDistance, 0)
}, 60_000)

it('skips same-component multibody pairs and retains exact states across different occurrences', () => {
  const input = boxes([1, 0, 0], multi()), report = analyzeAssemblyInterference(input)
  expect(report.bodyCount).toBe(4); expect(report.componentCount).toBe(2); expect(report.potentialPairCount).toBe(4)
  expect(report.testedPairCount).toBe(2); expect(report.broadPhaseExcludedCount).toBe(2); expect(report.pairs).toHaveLength(2)
  for (const pair of report.pairs) { near(pair.intersectionVolume, 48); expect(pair.first.body).toEqual(pair.second.body); expect(pair.first.component.occurrencePath).not.toEqual(pair.second.component.occurrencePath) }
  input.occurrences.pop(); const single = analyzeAssemblyInterference(input)
  expect(single.bodyCount).toBe(2); expect(single.componentCount).toBe(1); expect(single.potentialPairCount).toBe(0); expect(single.pairs).toEqual([])
}, 60_000)

// Two independent 4x4x4 bodies, not a union: X overlap (4-spacing)*4*4.
// Native material is measured on the actual placed inputs before pair work
// and immediately before their normal disposal, not inferred from report mesh.
function bodyMaterial(shape: Shape3D) {
  return ownership.withNativeOwners(owners => {
    const summary = validatePositiveClosedTool(shape), area = owners.own(new (getOC().GProp_GProps)()), box = owners.own(shape.boundingBox)
    getOC().BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
    return { ...summary, areaMm2: area.Mass(), bounds: box.bounds }
  })
}
it.each([
  { spacing: 3, status: 'overlap', volume: 16, distance: 0 },
  { spacing: 4, status: 'contact', volume: 0, distance: 0 },
  { spacing: 4.5, status: 'clearance', volume: 0, distance: .5 },
  { spacing: 7, status: null, volume: 0, distance: null },
])('optionally inspects distinct bodies of one leaf at separation $spacing without changing material', fixture => {
  const input = boxes([0, 0, 0], multi(false, fixture.spacing)); input.occurrences.pop()
  const before = serializeAssemblyDocument(input)
  for (const options of [undefined, { includeWithinComponent: false }]) {
    const omitted = analyzeAssemblyInterference(input, options)
    expect(omitted.bodyCount).toBe(2); expect(omitted.componentCount).toBe(1)
    expect(omitted.potentialPairCount).toBe(0); expect(omitted.testedPairCount).toBe(0); expect(omitted.pairs).toEqual([])
  }
  const place = placements.placeAssemblyShape, materials: { before: ReturnType<typeof bodyMaterial>; after?: ReturnType<typeof bodyMaterial> }[] = []
  const spy = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation((...args) => {
    const shape = place(...args), entry = { before: bodyMaterial(shape) } as typeof materials[number], remove = shape.delete.bind(shape)
    materials.push(entry)
    Object.defineProperty(shape, 'delete', { configurable: true, value: () => { try { entry.after = bodyMaterial(shape) } finally { remove() } } })
    return shape
  })
  try {
    const report = analyzeAssemblyInterference(input, { includeWithinComponent: true })
    expect(report.potentialPairCount).toBe(1); expect(report.scopeSummary.eligiblePairCount).toBe(1)
    expect(report.testedPairCount).toBe(fixture.status ? 1 : 0); expect(report.broadPhaseExcludedCount).toBe(fixture.status ? 0 : 1)
    expect(report.pairs).toHaveLength(fixture.status ? 1 : 0)
    if (fixture.status) {
      const pair = report.pairs[0]
      expect(pair.status).toBe(fixture.status); expect(pair.first.component).toEqual(pair.second.component)
      expect(pair.first.body).not.toEqual(pair.second.body)
      expect([pair.first.body?.bodyId, pair.second.body?.bodyId].sort()).toEqual(['body-0', 'body-1'])
      near(pair.intersectionVolume, fixture.volume); near(pair.minimumDistance, fixture.distance!); assertPoints(pair, fixture.distance!)
      expect(pair.solidCount).toBe(fixture.volume ? 1 : 0)
      if (!fixture.volume) expect(pair.intersectionMesh).toBeNull()
    }
    expect(materials).toHaveLength(2)
    const bounds = materials.map(value => value.before.bounds).sort((a, b) => a[0][0] - b[0][0])
    bounds.forEach((box, i) => { box.flat().forEach((v, j) => near(v, [[-2, -2, 0], [2, 2, 4]].flat()[j] + (j % 3 === 0 ? i * fixture.spacing : 0))) })
    for (const value of materials) {
      expect(value.before.solidCount).toBe(1); near(value.before.volumeMm3, 64); near(value.before.areaMm2, 96)
      expect(value.after).toEqual(value.before)
    }
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { spy.mockRestore() }
}, 60_000)

it.each([
  { mode: 'all' as const, selected: [] as string[], enabled: 6, disabled: 4, bodies: 4, internal: 2 },
  { mode: 'among-selected' as const, selected: ['a'], enabled: 1, disabled: 0, bodies: 2, internal: 1 },
  { mode: 'selected-against-rest' as const, selected: ['a'], enabled: 4, disabled: 4, bodies: 4, internal: 0 },
])('keeps exact multibody selection policy in $mode with the internal-pair flag', fixture => {
  const input = boxes([20, 0, 0], multi(false, 3)), before = serializeAssemblyDocument(input)
  const scope: AssemblyInterferenceScope = { mode: fixture.mode, selected: fixture.selected.map(id => component([id], 'two-boxes')), excluded: [] }
  const disabled = analyzeAssemblyInterference(input, { scope, clearance: 30 })
  const enabled = analyzeAssemblyInterference(input, { scope, clearance: 30, includeWithinComponent: true })
  expect(disabled.potentialPairCount).toBe(fixture.disabled); expect(enabled.potentialPairCount).toBe(fixture.enabled)
  expect(enabled.scopeSummary.eligiblePairCount).toBe(fixture.enabled); expect(enabled.bodyCount).toBe(fixture.bodies)
  expect(enabled.pairs).toHaveLength(fixture.enabled)
  const internal = enabled.pairs.filter(pair => pair.first.component.occurrencePath.join('/') === pair.second.component.occurrencePath.join('/'))
  expect(internal).toHaveLength(fixture.internal)
  for (const pair of internal) { expect(pair.first.body).not.toEqual(pair.second.body); near(pair.intersectionVolume, 16) }
  if (fixture.mode === 'selected-against-rest') for (const pair of enabled.pairs) expect(pair.first.component.occurrencePath).not.toEqual(pair.second.component.occurrencePath)
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('retains internal body identities in reused nested leaves and filters whole leaves before admission', () => {
  const original = boxes([20, 0, 0], multi(false, 3)), leaf = original.occurrences[0], input = createEmptyAssembly('Original nested multibody inspection')
  input.definitions = [...original.definitions, { kind: 'assembly', id: 'multi-sub', revision: 'r1', name: 'Original multibody leaf',
    createdAt: stamp, updatedAt: stamp, occurrences: [{ ...structuredClone(leaf), id: 'leaf' }], mates: [] }]
  input.occurrences = original.occurrences.map(value => ({ ...structuredClone(value), definition: { id: 'multi-sub', revision: 'r1' } }))
  const before = serializeAssemblyDocument(input), options = { includeWithinComponent: true, clearance: 30 }
  const report = analyzeAssemblyInterference(input, options)
  expect(report.potentialPairCount).toBe(6); expect(report.bodyCount).toBe(4)
  const internal = report.pairs.filter(pair => pair.first.component.occurrencePath.join('/') === pair.second.component.occurrencePath.join('/'))
  expect(internal.map(pairNames)).toEqual(['a/leaf - a/leaf', 'b/leaf - b/leaf'])
  for (const pair of internal) { expect(pair.first.body).not.toEqual(pair.second.body); near(pair.intersectionVolume, 16) }
  input.occurrences.reverse()
  expect(analyzeAssemblyInterference(input, options).pairs.map(pair => pair.id)).toEqual(report.pairs.map(pair => pair.id))
  input.occurrences.reverse(); expect(serializeAssemblyDocument(input)).toBe(before)
  const excluded = analyzeAssemblyInterference(input, { ...options, scope: { mode: 'all', selected: [], excluded: [component(['a'], 'multi-sub')] } })
  expect(excluded.potentialPairCount).toBe(1); expect(excluded.bodyCount).toBe(2); expect(pairNames(excluded.pairs[0])).toBe('b/leaf - b/leaf')
  input.occurrences[0].visible = false
  expect(analyzeAssemblyInterference(input, options).potentialPairCount).toBe(6)
  expect(analyzeAssemblyInterference(input, { ...options, includeHidden: false }).potentialPairCount).toBe(1)
  input.occurrences[0].visible = true; input.occurrences[0].suppressed = true
  expect(analyzeAssemblyInterference(input, options).potentialPairCount).toBe(1)
}, 60_000)

it.each([
  { layout: 'flat' as const, pairs: ['a - b', 'a - c', 'b - c'], volumes: [24, 48, 72] },
  { layout: 'single' as const, pairs: ['c - s/a', 'c - s/b'], volumes: [48, 72] },
  { layout: 'nested' as const, pairs: [] as string[], volumes: [] as number[] },
])('groups by root-child occurrence while retaining original leaf/body reports in $layout', fixture => {
  const input = groupedBoxes(fixture.layout), before = serializeAssemblyDocument(input)
  const omitted = analyzeAssemblyInterference(input), disabled = analyzeAssemblyInterference(input, { treatSubassembliesAsComponents: false })
  expect(omitted.pairs).toEqual(disabled.pairs); expect(omitted.potentialPairCount).toBe(3)
  expect(omitted.pairs.map(pair => pair.intersectionVolume).sort((a, b) => a - b)).toEqual(expect.arrayContaining([expect.closeTo(24, 5), expect.closeTo(48, 5), expect.closeTo(72, 5)]))
  const report = analyzeAssemblyInterference(input, { treatSubassembliesAsComponents: true })
  expect(report.options.treatSubassembliesAsComponents).toBe(true)
  expect(report.componentCount).toBe(3); expect(report.bodyCount).toBe(3)
  expect(report.scopeSummary.eligibleLeafCount).toBe(3)
  expect(report.potentialPairCount).toBe(fixture.pairs.length); expect(report.testedPairCount).toBe(fixture.pairs.length)
  expect(report.broadPhaseExcludedCount).toBe(0); expect(report.scopeSummary.eligiblePairCount).toBe(fixture.pairs.length)
  expect(report.pairs.map(pairNames)).toEqual(fixture.pairs)
  report.pairs.forEach((pair, i) => {
    expect(pair.status).toBe('overlap'); near(pair.intersectionVolume, fixture.volumes[i]); near(pair.minimumDistance, 0)
    expect(pair.solidCount).toBe(1); expect(pair.first.body).toEqual({ bodyId: 'box-body', sourceFeatureId: 'create' })
    expect(pair.second.body).toEqual(pair.first.body)
    expect(pair.first.component.occurrencePath[0]).not.toBe(pair.second.component.occurrencePath[0])
  })
  const dto = JSON.parse(JSON.stringify(report))
  expect(dto.options.treatSubassembliesAsComponents).toBe(true)
  expect(structuredClone(report).pairs).toEqual(report.pairs)
  // JSON deliberately normalizes signed zero in mesh normals; structured cloning does not.
  expect(JSON.stringify(dto.pairs)).toBe(JSON.stringify(report.pairs))
  expect('token' in dto).toBe(false); expect('unionVolume' in dto).toBe(false)
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('keeps nine original cross pairs for two reused root groups without merging definitions or summing a union', () => {
  const input = groupedBoxes('reused'), before = serializeAssemblyDocument(input), build = vi.spyOn(CadEngine.prototype, 'build')
  const place = placements.placeAssemblyShape, material: ReturnType<typeof bodyMaterial>[] = []
  const spy = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation((...args) => {
    const shape = place(...args); material.push(bodyMaterial(shape)); return shape
  })
  try {
    const report = analyzeAssemblyInterference(input, { treatSubassembliesAsComponents: true })
    expect(build).toHaveBeenCalledTimes(1); expect(report.bodyCount).toBe(6); expect(report.componentCount).toBe(6)
    expect(report.potentialPairCount).toBe(9); expect(report.testedPairCount).toBe(9); expect(report.pairs).toHaveLength(9)
    expect(report.broadPhaseExcludedCount).toBe(0)
    const paths = ['s/a', 's/b', 'c'], matrix = [[96, 24, 48], [24, 96, 72], [48, 72, 96]]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const pairs = report.pairs.filter(pair => pairNames(pair) === 'g1/' + paths[i] + ' - g2/' + paths[j])
      expect(pairs).toHaveLength(1); near(pairs[0].intersectionVolume, matrix[i][j]); expect(pairs[0].solidCount).toBe(1)
      near(pairs[0].minimumDistance, 0); assertPoints(pairs[0], 0)
    }
    // Pair sum576 has multiplicity; the original geometric union is only7*6*4=168.
    near(report.pairs.reduce((sum, pair) => sum + pair.intersectionVolume, 0), 576)
    expect('volume' in report).toBe(false); expect('unionVolume' in report).toBe(false)
    expect(material).toHaveLength(6)
    for (const body of material) { expect(body.solidCount).toBe(1); near(body.volumeMm3, 96); near(body.areaMm2, 128) }
    const ids = report.pairs.map(pair => pair.id)
    input.occurrences.reverse()
    expect(analyzeAssemblyInterference(input, { treatSubassembliesAsComponents: true }).pairs.map(pair => pair.id)).toEqual(ids)
    input.occurrences.reverse(); expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { spy.mockRestore(); build.mockRestore() }
}, 60_000)

it('rejects stale grouped scope identities with either body policy before allocating native geometry', () => {
  const input = groupedBoxes('single'), ref = component(['s'], 'inner'), build = vi.spyOn(CadEngine.prototype, 'build'), place = vi.spyOn(placements, 'placeAssemblyShape')
  try {
    input.occurrences[0].suppressed = true
    for (const stale of [{ ...ref, definition: { ...ref.definition, revision: 'retired' } }, component(['missing'])]) {
      for (const options of [
        ...(['among-selected', 'selected-against-rest'] as const).map(mode => ({ treatSubassembliesAsComponents: true, scope: { mode, selected: [stale], excluded: [] } })),
        { treatSubassembliesAsComponents: true, scope: { mode: 'all' as const, selected: [], excluded: [stale] } },
      ]) for (const includeWithinComponent of [false, true]) expect(() => analyzeAssemblyInterference(input, { ...options, includeWithinComponent })).toThrow()
    }
    expect(build).not.toHaveBeenCalled(); expect(place).not.toHaveBeenCalled()
  } finally { build.mockRestore(); place.mockRestore() }
}, 60_000)

it('keeps an entire legacy mult solid aggregate as one null-identity body per occurrence', () => {
  const report = analyzeAssemblyInterference(boxes([1, 0, 0], multi(true))), pair = report.pairs[0]
  expect(report.bodyCount).toBe(2); expect(report.potentialPairCount).toBe(1); expect(report.pairs).toHaveLength(1)
  expect(pair.first.body).toBeNull(); expect(pair.second.body).toBeNull(); expect(pair.solidCount).toBe(2); near(pair.intersectionVolume, 96)
}, 60_000)

it('distinguishes reused nested leaf paths and stable pair identities independently of sibling order', () => {
  const original = boxes(), leaf = original.occurrences[0], root = createEmptyAssembly('Original nested interference')
  root.definitions = [...original.definitions, { kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original shared leaf', createdAt: stamp, updatedAt: stamp, occurrences: [{ ...leaf, id: 'leaf' }], mates: [] }]
  root.occurrences = original.occurrences.map(value => ({ ...value, id: 'sub-' + value.id, definition: { id: 'sub', revision: 'r1' } }))
  const first = only(root); expect(first.first.component.occurrencePath).toEqual(['sub-a', 'leaf']); expect(first.second.component.occurrencePath).toEqual(['sub-b', 'leaf'])
  root.occurrences.reverse(); const reordered = only(root); expect(reordered.id).toBe(first.id); near(reordered.intersectionVolume, 320)
}, 60_000)

it('includes hidden bodies by default, excludes suppression and honors explicit hidden exclusion', () => {
  const input = boxes(); input.occurrences[1].visible = false
  expect(analyzeAssemblyInterference(input).pairs).toHaveLength(1)
  const hidden = analyzeAssemblyInterference(input, { includeHidden: false }); expect(hidden.bodyCount).toBe(1); expect(hidden.potentialPairCount).toBe(0)
  input.occurrences[1].visible = true; input.occurrences[1].suppressed = true
  expect(analyzeAssemblyInterference(input).bodyCount).toBe(1)
}, 60_000)

it('uses genuine solved plate/pin BReps: half-millimeter hole clearance, no overlap and far pin pair excluded', () => {
  const current = solvedPlatePins(), before = serializeAssemblyDocument(current), report = analyzeAssemblyInterference(current)
  expect(report.bodyCount).toBe(3); expect(report.potentialPairCount).toBe(3); expect(report.testedPairCount).toBe(2); expect(report.broadPhaseExcludedCount).toBe(1)
  expect(report.pairs).toHaveLength(2)
  for (const pair of report.pairs) { expect(pair.status).toBe('clearance'); near(pair.minimumDistance, .5, 1e-5); expect(pair.intersectionVolume).toBe(0); expect(pair.intersectionMesh).toBeNull() }
  const narrower = analyzeAssemblyInterference(current, { clearance: .1 })
  expect(narrower.testedPairCount).toBe(2); expect(narrower.pairs).toEqual([]) // AABBs overlap, native hole clearance exceeds .1.
  expect(serializeAssemblyDocument(current)).toBe(before)
}, 60_000)

it('rebuilds changed source content under the same definition revision instead of caching old intersections', () => {
  const input = boxes(), before = analyzeAssemblyInterference(input), part = input.definitions[0]
  if (part.kind !== 'part' || part.document.features[0].type !== 'sketch' || part.document.features[0].profile.kind !== 'rectangle') throw new Error('Original rectangle missing')
  part.document.features[0].profile.width = 18
  const after = analyzeAssemblyInterference(input)
  near(before.pairs[0].intersectionVolume, 320); near(after.pairs[0].intersectionVolume, 480)
  expect(after.analysisId).not.toBe(before.analysisId); expect(after.pairs[0].first.component.definition.revision).toBe('r1')
}, 60_000)

it('admits empty scenes explicitly and refuses partial source rebuilds', () => {
  const empty = analyzeAssemblyInterference(createEmptyAssembly()); expect(empty.bodyCount).toBe(0); expect(empty.potentialPairCount).toBe(0); expect(empty.pairs).toEqual([])
  const input = boxes(), part = input.definitions[0]
  if (part.kind !== 'part') throw new Error('Original part missing')
  part.document.features.push({ id: 'remote', name: 'Original missed cut', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'cut', name: 'Original rejected cut', type: 'cut', sketchId: 'remote', depth: 8, symmetric: false, suppressed: false,
    bodyScope: [{ bodyId: 'box-body', sourceFeatureId: 'create' }] })
  expect(() => analyzeAssemblyInterference(input)).toThrow('No se pudo reconstruir')
}, 60_000)

it.each([false, true])('rejects body admission before placed-body or pair work instead of clipping 257 occurrences, grouped=%s', grouped => {
  const input = boxes(), source = input.occurrences[0]; input.occurrences = Array.from({ length: 257 }, (_, index) => ({ ...source, id: 'instance-' + index }))
  const place = vi.spyOn(placements, 'placeAssemblyShape')
  try { expect(() => analyzeAssemblyInterference(input, { treatSubassembliesAsComponents: grouped })).toThrow('presupuesto de cuerpos'); expect(place).not.toHaveBeenCalled() }
  finally { place.mockRestore() }
}, 60_000)

it('rejects coordinate precision loss without silently widening the reported length tolerance', () => {
  const input = boxes(); input.occurrences[0].pose.translation[0] = 1e8; input.occurrences[1].pose.translation[0] = 1e8 + 12
  expect(() => analyzeAssemblyInterference(input)).toThrow('precisión')
}, 60_000)

it.each(['not-done', 'no-solutions', 'nonfinite-value', 'nonfinite-point', 'inconsistent-points'] as const)('rejects native distance %s on an actual completed tool/point', fault => {
  const input = boxes([16.5, 0, 0]); let toolSeen = false, pointSeen = false, releases = 0
  const error = captured(() => nativeFault('Assembly distance query or release failed.', owner => {
    if ('LoadS1' in owner && 'Value' in owner && 'IsDone' in owner && typeof owner.IsDone === 'function' && 'NbSolution' in owner && typeof owner.NbSolution === 'function' && typeof owner.Value === 'function') {
      toolSeen = true; const done = owner.IsDone.bind(owner), count = owner.NbSolution.bind(owner), value = owner.Value.bind(owner), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove() } })
      if (fault === 'not-done') Object.defineProperty(owner, 'IsDone', { configurable: true, value: () => { done(); return false } })
      if (fault === 'no-solutions') Object.defineProperty(owner, 'NbSolution', { configurable: true, value: () => { count(); return 0 } })
      if (fault === 'nonfinite-value') Object.defineProperty(owner, 'Value', { configurable: true, value: () => { value(); return NaN } })
    } else if (!pointSeen && 'X' in owner && typeof owner.X === 'function') {
      pointSeen = true; const x = owner.X.bind(owner)
      if (fault === 'nonfinite-point' || fault === 'inconsistent-points') Object.defineProperty(owner, 'X', { configurable: true, value: () => fault === 'nonfinite-point' ? (x(), NaN) : x() + 3 })
    }
  }, () => analyzeAssemblyInterference(input)))
  expect(error).toBeInstanceOf(Error); expect(toolSeen).toBe(true); expect(releases).toBe(1)
  expect(pointSeen).toBe(fault === 'nonfinite-point' || fault === 'inconsistent-points')
}, 60_000)

it('retains real native distance query and cleanup failures together, withholding the report', () => {
  const primary = new Error('Original interference distance query fault'), cleanup = new Error('Original interference distance release fault'); let releases = 0
  const error = captured(() => nativeFault('Assembly distance query or release failed.', owner => {
    if ('Value' in owner && typeof owner.Value === 'function') {
      const value = owner.Value.bind(owner), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'Value', { configurable: true, value: () => { value(); throw primary } })
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }
  }, () => analyzeAssemblyInterference(boxes([16.5, 0, 0]))))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(primary); expect(errorTree(error)).toContain(cleanup); expect(releases).toBe(1)
}, 60_000)

it.each(['unfinished', 'cleanup'] as const)('withholds analysis when the actual native Common has %s failure', fault => {
  const cleanup = new Error('Original interference Common release fault'); let seen = false, releases = 0
  const error = captured(() => nativeFault('Assembly pair analysis or release failed.', owner => {
    if ('SetArguments' in owner && 'NonDestructive' in owner && 'IsDone' in owner && typeof owner.IsDone === 'function') {
      seen = true; const done = owner.IsDone.bind(owner), remove = owner.delete.bind(owner)
      if (fault === 'unfinished') Object.defineProperty(owner, 'IsDone', { configurable: true, value: () => { done(); return false } })
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); if (fault === 'cleanup') throw cleanup } })
    }
  }, () => analyzeAssemblyInterference(boxes())))
  expect(seen).toBe(true); expect(releases).toBe(1); expect(error).toBeInstanceOf(Error)
  if (fault === 'cleanup') { expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup) }
}, 60_000)

it('rejects mesh admission after real Common meshing without clipping a positive intersection', () => {
  let seen = false
  const error = captured(() => nativeFault('Assembly intersection solid inspection or release failed.', owner => {
    if ('asShape3D' in owner && 'mesh' in owner && typeof owner.mesh === 'function') {
      seen = true; const shape = owner as Shape3D, mesh = shape.mesh.bind(shape)
      vi.spyOn(shape, 'mesh').mockImplementation(options => { const actual = mesh(options); return { ...actual, vertices: Array(MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS + 2).fill(actual.vertices[0]) } })
    }
  }, () => analyzeAssemblyInterference(boxes())))
  expect(seen).toBe(true); expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain('presupuesto de malla')
}, 60_000)

it('withholds a completed numeric candidate if placed-owner cleanup fails and revokes prototype seals', () => {
  const cleanup = new Error('Original interference placed release fault'), build = CadEngine.prototype.build, engines: CadEngine[] = []; let shapeCount = 0, releases = 0
  const spy = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function(this: CadEngine, features) { engines.push(this); return build.call(this, features) })
  try {
    const error = captured(() => nativeFault('Assembly interference analysis or release failed.', owner => {
      if ('asShape3D' in owner && 'wrapped' in owner && ++shapeCount === 2) {
        const remove = owner.delete.bind(owner)
        Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
      }
    }, () => analyzeAssemblyInterference(boxes())))
    expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); expect(releases).toBe(1); expect(engines).toHaveLength(1)
    expect(() => engines[0].copyCurrentBodyShape({ bodyId: 'box-body', sourceFeatureId: 'create' })).toThrow('reconstrucción completa')
  } finally { spy.mockRestore() }
}, 60_000)

it.each([
  { mode: 'all' as const, selected: [], expected: ['a - b', 'a - c', 'a - d', 'b - c', 'b - d', 'c - d'], selectedLeaves: 0 },
  { mode: 'among-selected' as const, selected: ['a', 'c'], expected: ['a - c'], selectedLeaves: 2 },
  { mode: 'selected-against-rest' as const, selected: ['a', 'c'], expected: ['a - b', 'a - d', 'b - c', 'c - d'], selectedLeaves: 2 },
])('queries only the manually enumerated four-box pairs in $mode mode', ({ mode, selected, expected, selectedLeaves }) => {
  const input = fourBoxes(), before = serializeAssemblyDocument(input), report = analyzeAssemblyInterference(input, { clearance: 30, scope: selectedScope(mode, selected) })
  expect(report.pairs.map(pairNames)).toEqual(expected)
  expect(report.scopeSummary).toEqual({ mode, selectedLeafCount: selectedLeaves, excludedLeafCount: 0,
    eligibleLeafCount: mode === 'among-selected' ? 2 : 4, eligiblePairCount: expected.length })
  expect(report.potentialPairCount).toBe(expected.length); expect(report.testedPairCount).toBe(expected.length); expect(report.broadPhaseExcludedCount).toBe(0)
  const distances: Record<string, number> = { 'a - b': 0, 'a - c': 8, 'a - d': 24, 'b - c': 0, 'b - d': 12, 'c - d': 0 }
  for (const pair of report.pairs) {
    near(pair.minimumDistance, distances[pairNames(pair)]); assertPoints(pair, distances[pairNames(pair)])
    near(pair.intersectionVolume, pairNames(pair) === 'a - b' || pairNames(pair) === 'b - c' ? 320 : 0)
  }
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('applies exclusions before native construction and body admission while retaining exact selection counts', () => {
  const input = boxes(), original = input.occurrences[0]
  input.occurrences = Array.from({ length: 257 }, (_, index) => ({ ...structuredClone(original), id: 'instance-' + index }))
  const excluded = input.occurrences.slice(0, 256).map(value => component([value.id])), build = vi.spyOn(CadEngine.prototype, 'build'), place = vi.spyOn(placements, 'placeAssemblyShape')
  try {
    const report = analyzeAssemblyInterference(input, { scope: { mode: 'all', selected: [], excluded } })
    expect(report.bodyCount).toBe(1); expect(report.componentCount).toBe(1); expect(report.pairs).toEqual([])
    expect(report.scopeSummary).toEqual({ mode: 'all', selectedLeafCount: 0, excludedLeafCount: 256, eligibleLeafCount: 1, eligiblePairCount: 0 })
    expect(build).toHaveBeenCalledTimes(1); expect(place).toHaveBeenCalledTimes(1)
  } finally { build.mockRestore(); place.mockRestore() }
}, 60_000)

it('prunes unselected sources in among-selected mode and admits an active selection with no bodies', () => {
  const input = fourBoxes(), empty = definition('empty'); empty.document.features = []; input.definitions.push(empty)
  input.occurrences[0].definition = { id: 'empty', revision: 'r1' }
  const build = vi.spyOn(CadEngine.prototype, 'build'), place = vi.spyOn(placements, 'placeAssemblyShape')
  try {
    const report = analyzeAssemblyInterference(input, { scope: { mode: 'among-selected', selected: [component(['a'], 'empty')], excluded: [] } })
    expect(report.scopeSummary).toEqual({ mode: 'among-selected', selectedLeafCount: 1, excludedLeafCount: 0, eligibleLeafCount: 1, eligiblePairCount: 0 })
    expect(report.bodyCount).toBe(0); expect(report.componentCount).toBe(0); expect(build).toHaveBeenCalledTimes(1); expect(place).not.toHaveBeenCalled()
  } finally { build.mockRestore(); place.mockRestore() }
}, 60_000)

it('does not rebuild an explicitly excluded source whose native operation would fail', () => {
  const input = boxes(), broken = definition('excluded-broken')
  broken.document.features.push({ id: 'remote', name: 'Original remote profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'missed-cut', name: 'Original missed cut', type: 'cut', sketchId: 'remote', depth: 8, symmetric: false, suppressed: false,
    bodyScope: [{ bodyId: 'box-body', sourceFeatureId: 'create' }] })
  input.definitions.push(broken); input.occurrences[1].definition = { id: broken.id, revision: broken.revision }
  const build = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const report = analyzeAssemblyInterference(input, { scope: { mode: 'all', selected: [], excluded: [component(['b'], broken.id)] } })
    expect(report.bodyCount).toBe(1); expect(report.pairs).toEqual([]); expect(build).toHaveBeenCalledTimes(1)
    expect(report.scopeSummary).toEqual({ mode: 'all', selectedLeafCount: 0, excludedLeafCount: 1, eligibleLeafCount: 1, eligiblePairCount: 0 })
  } finally { build.mockRestore() }
}, 60_000)

it('does not invent XOR pairs when exclusions remove the entire active selection or when every leaf is selected', () => {
  const input = fourBoxes()
  const removed = analyzeAssemblyInterference(input, { scope: selectedScope('selected-against-rest', ['a'], ['a']) })
  expect(removed.scopeSummary).toEqual({ mode: 'selected-against-rest', selectedLeafCount: 1, excludedLeafCount: 1, eligibleLeafCount: 3, eligiblePairCount: 0 })
  expect(removed.potentialPairCount).toBe(0); expect(removed.testedPairCount).toBe(0); expect(removed.pairs).toEqual([])
  const all = analyzeAssemblyInterference(input, { scope: selectedScope('selected-against-rest', ['a', 'b', 'c', 'd']) })
  expect(all.scopeSummary.eligiblePairCount).toBe(0); expect(all.potentialPairCount).toBe(0); expect(all.pairs).toEqual([])
}, 60_000)

it('expands a selected reused subassembly and filters exclusions without selecting its other occurrence', () => {
  const input = boxes(), leaf = input.occurrences[0]
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original paired subassembly', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(leaf), id: 'a' }, { ...structuredClone(leaf), id: 'b', pose: { ...identityRigidPose(), translation: [12, 0, 0] } }], mates: [] })
  input.occurrences = ['left', 'right'].map((id, index) => ({ ...structuredClone(leaf), id, definition: { id: 'sub', revision: 'r1' },
    pose: { ...identityRigidPose(), translation: [index * 24, 0, 0] } }))
  const report = analyzeAssemblyInterference(input, { clearance: 30, scope: { mode: 'selected-against-rest',
    selected: [component(['left'], 'sub')], excluded: [component(['right', 'a'])] } })
  expect(report.pairs.map(pairNames)).toEqual(['left/a - right/b', 'left/b - right/b'])
  expect(report.scopeSummary).toEqual({ mode: 'selected-against-rest', selectedLeafCount: 2, excludedLeafCount: 1, eligibleLeafCount: 3, eligiblePairCount: 2 })
  near(report.pairs[0].minimumDistance, 20); near(report.pairs[1].minimumDistance, 8)
}, 60_000)

it('counts active selection/exclusion before hidden filtering and excludes suppressed ancestry', () => {
  const input = boxes(), leaf = input.occurrences[0]
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original single leaf', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(leaf), id: 'leaf', visible: true }], mates: [] })
  input.occurrences = ['hidden', 'suppressed', 'shown'].map(id => ({ ...structuredClone(leaf), id, definition: { id: 'sub', revision: 'r1' },
    visible: id !== 'hidden', suppressed: id === 'suppressed' }))
  const report = analyzeAssemblyInterference(input, { includeHidden: false, scope: { mode: 'among-selected',
    selected: [component(['hidden'], 'sub'), component(['suppressed'], 'sub'), component(['shown'], 'sub')], excluded: [component(['shown', 'leaf'])] } })
  expect(report.scopeSummary).toEqual({ mode: 'among-selected', selectedLeafCount: 2, excludedLeafCount: 1, eligibleLeafCount: 0, eligiblePairCount: 0 })
  expect(report.bodyCount).toBe(0); expect(report.pairs).toEqual([])
}, 60_000)

it('rejects stale selected and excluded identities before any native allocation, including suppressed occurrences', () => {
  const input = boxes(); input.occurrences[0].suppressed = true
  const build = vi.spyOn(CadEngine.prototype, 'build'), place = vi.spyOn(placements, 'placeAssemblyShape')
  try {
    for (const scope of [selectedScope('among-selected', ['missing']), { mode: 'all' as const, selected: [], excluded: [component(['a'], 'box', 'old-revision')] }]) {
      expect(() => analyzeAssemblyInterference(input, { scope })).toThrow()
    }
    expect(build).not.toHaveBeenCalled(); expect(place).not.toHaveBeenCalled()
  } finally { build.mockRestore(); place.mockRestore() }
}, 60_000)

it('retains same-leaf multibody exclusion under selected modes and rejects cleanup after filtered pair work', () => {
  const input = boxes([1, 0, 0], multi()), report = analyzeAssemblyInterference(input, { scope: {
    mode: 'selected-against-rest', selected: [component(['a'], 'two-boxes')], excluded: [] } })
  expect(report.potentialPairCount).toBe(4); expect(report.scopeSummary.eligiblePairCount).toBe(4); expect(report.pairs).toHaveLength(2)
  const cleanup = new Error('Original scoped interference Common release fault'); let releases = 0
  const error = captured(() => nativeFault('Assembly pair analysis or release failed.', owner => {
    if ('SetArguments' in owner && 'NonDestructive' in owner) {
      const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }
  }, () => analyzeAssemblyInterference(fourBoxes(), { scope: selectedScope('among-selected', ['a', 'b']) })))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); expect(releases).toBe(1)
}, 60_000)

// Independent original 2x3x4 solids at x=[0,2] and [1,3].
// Per-body V24/A52; cross matrix [[24,12],[12,24]], no geometric union.
it.each(['root', 'nested', 'single'] as const)('retains both body flags while root identity excludes internal pairs: %s', layout => {
  const part = multi(false, 1)
  part.document.features = part.document.features.map(feature => feature.type === 'sketch'
    ? { ...feature, profile: { kind: 'rectangle', center: [feature.id === 'profile-0' ? 1 : 2, 1.5], width: 2, height: 3 } } : feature)
  const input = boxes([0, 0, 0], part)
  if (layout !== 'root') {
    input.definitions.push({ kind: 'assembly', id: 's', revision: 'r1', name: 'Original shared solid pair', createdAt: stamp, updatedAt: stamp,
      occurrences: [structuredClone(input.occurrences[0])], mates: [] })
    input.occurrences = (layout === 'single' ? ['g1'] : ['g1', 'g2']).map(id => ({ ...structuredClone(input.occurrences[0]), id,
      definition: { id: 's', revision: 'r1' } }))
  }
  const current = validateAssemblyDocument(input), before = serializeAssemblyDocument(current)
  const originalPlace = placements.placeAssemblyShape, material: ReturnType<typeof bodyMaterial>[] = []
  const spy = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation((...args) => {
    const shape = originalPlace(...args); material.push(bodyMaterial(shape)); return shape
  })
  try {
    const ungrouped = analyzeAssemblyInterference(current, { includeWithinComponent: true })
    const grouped = analyzeAssemblyInterference(current, { includeWithinComponent: true, treatSubassembliesAsComponents: true })
    const restored = analyzeAssemblyInterference(current, { includeWithinComponent: true, treatSubassembliesAsComponents: false })
    expect(ungrouped.potentialPairCount).toBe(layout === 'single' ? 1 : 6)
    expect(grouped.potentialPairCount).toBe(layout === 'single' ? 0 : 4)
    expect(restored.pairs).toEqual(ungrouped.pairs)
    expect(grouped.options).toMatchObject({ includeWithinComponent: true, treatSubassembliesAsComponents: true })
    expect(grouped.bodyCount).toBe(layout === 'single' ? 2 : 4)
    expect(grouped.componentCount).toBe(layout === 'single' ? 1 : 2)
    expect(grouped.testedPairCount).toBe(grouped.potentialPairCount); expect(grouped.broadPhaseExcludedCount).toBe(0)
    expect(grouped.pairs).toHaveLength(grouped.potentialPairCount)
    const roots = layout === 'root' ? ['a', 'b'] : ['g1', 'g2']
    for (const pair of grouped.pairs) {
      expect(pair.first.component.occurrencePath[0]).toBe(roots[0]); expect(pair.second.component.occurrencePath[0]).toBe(roots[1])
      const i = Number(pair.first.body!.bodyId.slice(-1)), j = Number(pair.second.body!.bodyId.slice(-1))
      expect(pair.first.body).toEqual({ bodyId: 'body-' + i, sourceFeatureId: 'create-' + i })
      expect(pair.second.body).toEqual({ bodyId: 'body-' + j, sourceFeatureId: 'create-' + j })
      near(pair.intersectionVolume, i === j ? 24 : 12); near(pair.minimumDistance, 0); expect(pair.solidCount).toBe(1)
      const vertices = pair.intersectionMesh!.vertices
      const low = [Math.max(i, j), 0, 0], high = [Math.min(i + 2, j + 2), 3, 4]
      for (let axis = 0; axis < 3; axis++) {
        const coordinates = vertices.filter((_, index) => index % 3 === axis)
        near(Math.min(...coordinates), low[axis]); near(Math.max(...coordinates), high[axis])
      }
    }
    for (const body of material) { expect(body.solidCount).toBe(1); near(body.volumeMm3, 24); near(body.areaMm2, 52) }
    expect(serializeAssemblyDocument(current)).toBe(before)
  } finally { spy.mockRestore() }
}, 60_000)
