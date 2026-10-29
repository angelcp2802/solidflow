import { describe, expect, it } from 'vitest'
import type { AssemblyScene, AssemblySceneBody, AssemblySceneEdge, AssemblySceneFace } from '../cad/kernel.assembly-types'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { buildAssemblyOriginTree } from './assemblyOriginTree'
import { assemblyNormalSelectionOrComponent, nominateAssemblyNormalFace, nominateAssemblyNormalOrigin, nominateAssemblyNormalUnsupported, resolveAssemblyNormalSelection, type AssemblyNormalContext } from './assemblyNormalTo'
import { resolveNormalToView } from './normalToView'
import { nominateAssemblyBrowseEdge, resolveAssemblyRelationSelection } from './assemblyBrowseSelection'

// Original display-only witnesses. The nested datum catalog reuses the documented
// configuration prisms; these tests do not establish native surface extraction.
function fixture() {
  const source = assemblyConfigurationCoreFixture()
  const origins = buildAssemblyOriginTree(evaluateAssemblyConfiguration(source.document, source.catalog, 'mixed'), [])
  const component = { occurrencePath: ['right', 'b'], definition: { id: 'configuration-B', revision: 'r1' } }
  const face: AssemblySceneFace = { selection: { component, body: null, face: { key: 'face-v1|' + 'a'.repeat(64), sourceFeatureId: 'original-prism' } },
    support: { kind: 'plane', point: [2, 0, 0], normal: [0, -1, 0], xDirection: [1, 0, 0], tolerance: 1e-7 },
    worldSupport: { kind: 'plane', point: [30, 6, 0], normal: [1, 0, 0], xDirection: [0, 1, 0], tolerance: 1e-7 }, vertices: [], triangles: [] }
  const body: AssemblySceneBody = { component, body: null, name: 'Nested original prism', visible: true,
    worldPose: { translation: [30, 4, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
    vertices: [], normals: [], triangles: [], edgeLines: [], faces: [face], volume: 1, area: 6, solidCount: 1,
    bounds: { min: [29, 4, 0], max: [30, 6, 1] } }
  const scene: AssemblyScene = { kind: 'assembly-scene', sceneId: 'normal-original', bodies: [body], volume: 1, area: 6,
    solidCount: 1, prototypeCount: 1, bounds: body.bounds, visibleBounds: body.bounds, warnings: [] }
  const context: AssemblyNormalContext = { documentSignature: 'document-and-current-configurations', scopePath: ['right'], sessionIdentity: {}, scene }
  const origin = (owner: string[], datum: string) => origins.find(row => row.ownerPath.join('/') === owner.join('/')
    && (row.display.reference.kind === 'principal-plane' ? row.display.reference.plane : row.display.reference.axis) === datum)!
  return { context, scene, body, face, origins, origin }
}

describe('assembly Normal To selection isolation and world frames', () => {
  it('uses the current face world support once, retaining its nested occurrence identity without changing the scene', () => {
    const f = fixture(), before = JSON.stringify(f.scene), selection = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    const result = resolveAssemblyNormalSelection(selection, f.context, f.origins)
    expect(result.target).toMatchObject({ kind: 'plane', frame: { origin: [30, 6, 0], normal: [1, 0, 0], xDirection: [0, 1, 0] } })
    expect(result.faces).toEqual([f.face])
    expect(resolveNormalToView(result.target!, [0, 0, 1], [0, 1, 0])).toMatchObject({ direction: [1, 0, 0], up: [0, 0, 1] })
    expect(JSON.stringify(f.scene)).toBe(before)
  })
  it('resolves a configured nested origin in world coordinates, independent of the editable scope', () => {
    const f = fixture(), entry = f.origin(['right', 'b'], 'XZ'), selection = nominateAssemblyNormalOrigin(null, entry, f.context, false)
    const result = resolveAssemblyNormalSelection(selection, f.context, f.origins)
    expect(result.target?.kind).toBe('plane')
    if (result.target?.kind !== 'plane') throw Error('Expected current datum plane')
    result.target.frame.origin.forEach((v, i) => expect(v).toBeCloseTo([30, 4, 0][i], 12))
    result.target.frame.normal.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0][i], 12))
    result.target.frame.xDirection.forEach((v, i) => expect(v).toBeCloseTo([0, 1, 0][i], 12))
  })
  it('keeps the ordered face/datum pair and obtains screen up from the second normal', () => {
    const f = fixture(), entry = f.origin([], 'XY')
    const faceFirst = nominateAssemblyNormalOrigin(nominateAssemblyNormalFace(null, f.face, false, f.context, false), entry, f.context, true)
    const datumFirst = nominateAssemblyNormalFace(nominateAssemblyNormalOrigin(null, entry, f.context, false), f.face, false, f.context, true)
    const first = resolveAssemblyNormalSelection(faceFirst, f.context, f.origins).target!
    const second = resolveAssemblyNormalSelection(datumFirst, f.context, f.origins).target!
    expect(first.kind).toBe('planes'); expect(second.kind).toBe('planes')
    expect(resolveNormalToView(first, [0, 0, 1], [0, 1, 0])).toMatchObject({ direction: [1, 0, 0], up: [0, 0, 1] })
    expect(resolveNormalToView(second, [0, 0, 1], [0, 1, 0])).toMatchObject({ direction: [0, 0, 1], up: [1, 0, 0] })
    expect(first).not.toEqual(second)
  })
  it('allows an ordered pair of root/component datum planes and rejects parallel pairs before camera requests', () => {
    const f = fixture(), root = f.origin([], 'XY'), child = f.origin(['right', 'b'], 'XZ')
    const pair = nominateAssemblyNormalOrigin(nominateAssemblyNormalOrigin(null, root, f.context, false), child, f.context, true)
    expect(resolveAssemblyNormalSelection(pair, f.context, f.origins).target?.kind).toBe('planes')
    const parallel = nominateAssemblyNormalOrigin(nominateAssemblyNormalFace(null, f.face, false, f.context, false), child, f.context, true)
    expect(resolveAssemblyNormalSelection(parallel, f.context, f.origins).target).toBeNull()
  })
  it('resolves a cylinder along its actual world axis without treating the face as a plane', () => {
    const f = fixture()
    f.face.worldSupport = { kind: 'cylinder', point: [30, 6, 0], axis: [0, 1, 0], xDirection: [1, 0, 0], radius: 2, tolerance: 1e-7 }
    const selection = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    expect(resolveAssemblyNormalSelection(selection, f.context, f.origins).target).toMatchObject({ kind: 'axis', point: [30, 6, 0], direction: [0, 1, 0] })
    const pair = nominateAssemblyNormalOrigin(selection, f.origin([], 'XY'), f.context, true)
    expect(resolveAssemblyNormalSelection(pair, f.context, f.origins).target).toBeNull()
  })
  it('distinguishes genuine empty selection from unsupported or ambiguous visible surfaces', () => {
    const f = fixture()
    expect(resolveAssemblyNormalSelection(null, f.context, f.origins).target).toEqual({ kind: 'none' })
    const unsupported = nominateAssemblyNormalFace(null, null, false, f.context, false)
    expect(resolveAssemblyNormalSelection(unsupported, f.context, f.origins).target).toBeNull()
    const empty = nominateAssemblyNormalFace(unsupported, null, true, f.context, false)
    expect(resolveAssemblyNormalSelection(empty, f.context, f.origins).target).toEqual({ kind: 'none' })
    f.face.worldSupport = null
    const face = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    expect(resolveAssemblyNormalSelection(face, f.context, f.origins)).toMatchObject({ target: null, faces: [f.face] })
    const axis = nominateAssemblyNormalOrigin(null, f.origin([], 'Z'), f.context, false)
    expect(resolveAssemblyNormalSelection(axis, f.context, f.origins).target).toBeNull()
  })
  it('uses a conical presentation axis in world space without admitting it to solver supports', () => {
    const f = fixture()
    f.face.support = null; f.face.worldSupport = null
    f.face.viewAxis = { kind: 'axis', point: [0, 0, 0], direction: [1, 0, 0], xDirection: [0, 0, 1] }
    f.face.worldViewAxis = { kind: 'axis', point: [30, 4, 0], direction: [0, 1, 0], xDirection: [0, 0, 1] }
    const selection = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    expect(resolveAssemblyNormalSelection(selection, f.context, f.origins).target).toMatchObject({ kind: 'axis', point: [30, 4, 0], direction: [0, 1, 0], xDirection: [0, 0, 1] })
    expect(f.face.support).toBeNull(); expect(f.face.worldSupport).toBeNull()
  })
  it.each(['document', 'scope', 'session', 'scene'] as const)('rejects a retained selection after a %s replacement instead of requesting nearest', change => {
    const f = fixture(), selection = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    const changed = change === 'document' ? { ...f.context, documentSignature: 'new-document' }
      : change === 'scope' ? { ...f.context, scopePath: [] } : change === 'session' ? { ...f.context, sessionIdentity: {} }
        : { ...f.context, scene: structuredClone(f.scene) }
    expect(resolveAssemblyNormalSelection(selection, changed, f.origins).target).toBeNull()
  })
  it.each(['hidden', 'missing', 'duplicate', 'revision'] as const)('rejects a %s face in the current catalog', change => {
    const f = fixture(), selection = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    if (change === 'hidden') f.body.visible = false
    if (change === 'missing') f.body.faces = []
    if (change === 'duplicate') f.body.faces.push(structuredClone(f.face))
    if (change === 'revision') f.face.selection.component.definition.revision = 'r2'
    expect(resolveAssemblyNormalSelection(selection, f.context, f.origins).target).toBeNull()
  })
  it('rejects removed or rebound datums and selections with more than two references', () => {
    const f = fixture(), entry = f.origin([], 'XY'), selection = nominateAssemblyNormalOrigin(null, entry, f.context, false)
    expect(resolveAssemblyNormalSelection(selection, f.context, []).target).toBeNull()
    expect(resolveAssemblyNormalSelection(selection, f.context, [{ ...entry, binding: 'changed-configuration-or-placement' }]).target).toBeNull()
    const two = nominateAssemblyNormalOrigin(selection, f.origin([], 'XZ'), f.context, true)
    const three = nominateAssemblyNormalOrigin(two, f.origin([], 'YZ'), f.context, true)
    expect(resolveAssemblyNormalSelection(three, f.context, f.origins).target).toBeNull()
  })
  it('plain selection replaces while modified selection toggles the same identity without editing the CAD data', () => {
    const f = fixture(), entry = f.origin([], 'XY'), before = JSON.stringify(f.origins)
    const first = nominateAssemblyNormalOrigin(null, entry, f.context, false)
    const two = nominateAssemblyNormalFace(first, f.face, false, f.context, true)
    const one = nominateAssemblyNormalOrigin(two, entry, f.context, true)
    expect(resolveAssemblyNormalSelection(one, f.context, f.origins).target?.kind).toBe('plane')
    expect(one.items).toHaveLength(1)
    const empty = nominateAssemblyNormalFace(one, f.face, false, f.context, true)
    expect(resolveAssemblyNormalSelection(empty, f.context, f.origins)).toEqual({ target: { kind: 'none' }, faces: [], origins: [] })
    expect(nominateAssemblyNormalFace(two, f.face, false, f.context, false).items).toHaveLength(1)
    expect(JSON.stringify(f.origins)).toBe(before)
  })
  it('removes the last origin highlight when modified selection toggles it off', () => {
    const f = fixture(), entry = f.origin([], 'XY')
    const selected = nominateAssemblyNormalOrigin(null, entry, f.context, false)
    const cleared = nominateAssemblyNormalOrigin(selected, entry, f.context, true)
    expect(cleared.items).toEqual([])
    expect(resolveAssemblyNormalSelection(cleared, f.context, f.origins)).toEqual({ target: { kind: 'none' }, faces: [], origins: [] })
  })
  it('retains the fourth identity so removing the third cannot silently enable a two-reference command', () => {
    const f = fixture(), xy = f.origin([], 'XY'), xz = f.origin([], 'XZ'), yz = f.origin([], 'YZ')
    let selection = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    for (const entry of [xy, xz, yz]) selection = nominateAssemblyNormalOrigin(selection, entry, f.context, true)
    expect(selection.items).toHaveLength(4)
    expect(resolveAssemblyNormalSelection(selection, f.context, f.origins).target).toBeNull()
    selection = nominateAssemblyNormalOrigin(selection, xz, f.context, true)
    expect(selection.items).toHaveLength(3)
    expect(selection.items.some(item => item.key === yz.treeKey)).toBe(true)
    expect(resolveAssemblyNormalSelection(selection, f.context, f.origins).target).toBeNull()
  })
  it('retains an unsupported component descriptor and never changes it into an empty-selection request', () => {
    const f = fixture(), key = JSON.stringify(['component', ['right', 'b']])
    const selection = nominateAssemblyNormalUnsupported(key, f.context)
    expect(selection.items).toEqual([{ kind: 'unsupported', key }])
    expect(resolveAssemblyNormalSelection(selection, f.context, f.origins).target).toBeNull()
    const repeated = nominateAssemblyNormalFace(selection, null, false, f.context, true, key)
    expect(repeated.items).toHaveLength(1)
    expect(resolveAssemblyNormalSelection(repeated, f.context, f.origins).target).toBeNull()
  })
  it('keeps a component selected after rebuild invalid while preserving explicit empty and stale camera selections', () => {
    const f = fixture(), key = JSON.stringify(['component', ['right', 'b']])
    const fallback = assemblyNormalSelectionOrComponent(null, key, f.context)
    expect(fallback?.items).toEqual([{ kind: 'unsupported', key }])
    expect(resolveAssemblyNormalSelection(fallback, f.context, f.origins).target).toBeNull()
    expect(assemblyNormalSelectionOrComponent(null, null, f.context)).toBeNull()
    const empty = nominateAssemblyNormalFace(null, null, true, f.context, false)
    expect(assemblyNormalSelectionOrComponent(empty, key, f.context)).toBe(empty)
    expect(resolveAssemblyNormalSelection(empty, f.context, f.origins).target).toEqual({ kind: 'none' })
    const selected = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    const changed = { ...f.context, sessionIdentity: {} }
    expect(assemblyNormalSelectionOrComponent(selected, key, changed)).toBe(selected)
    expect(resolveAssemblyNormalSelection(selected, changed, f.origins).target).toBeNull()
  })
  it('retains shared LINE and mixed browse selection without turning either into a camera target', () => {
    const f = fixture(), edge: AssemblySceneEdge = {
      selection: { component: structuredClone(f.face.selection.component), body: null,
        edge: { sourceFeatureId: 'original-prism', key: 'edge-v1|' + 'b'.repeat(64) } },
      support: { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null, lines: [0, 0, 0, 1, 0, 0],
    }
    f.body.edges = [edge]
    const first = nominateAssemblyBrowseEdge(null, edge, false, f.context, false)
    const mixed = nominateAssemblyNormalFace(first, f.face, false, f.context, true), before = JSON.stringify(mixed)
    expect(resolveAssemblyNormalSelection(first, f.context, f.origins).target).toBeNull()
    expect(resolveAssemblyNormalSelection(mixed, f.context, f.origins).target).toBeNull()
    expect(mixed.items.map(item => item.kind)).toEqual(['edge', 'face'])
    expect(JSON.stringify(mixed)).toBe(before)
    expect(resolveAssemblyRelationSelection(mixed, f.context, f.origins).status).toBe('ready')
    const faceOnly = nominateAssemblyBrowseEdge(mixed, edge, false, f.context, true)
    expect(resolveAssemblyNormalSelection(faceOnly, f.context, f.origins).target?.kind).toBe('plane')
  })
  it('keeps a conical camera axis independent from relation preselection eligibility', () => {
    const f = fixture()
    f.face.support = null; f.face.worldSupport = null
    f.face.worldViewAxis = { kind: 'axis', point: [30, 4, 0], direction: [0, 1, 0], xDirection: [0, 0, 1] }
    const selected = nominateAssemblyNormalFace(null, f.face, false, f.context, false)
    expect(resolveAssemblyNormalSelection(selected, f.context, f.origins).target?.kind).toBe('axis')
    expect(resolveAssemblyRelationSelection(selected, f.context, f.origins)).toMatchObject({ status: 'invalid', references: [], faces: [], edges: [], origins: [] })
  })

})
