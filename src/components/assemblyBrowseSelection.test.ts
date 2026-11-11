import { describe, expect, it } from 'vitest'
import type { AssemblyScene, AssemblySceneBody, AssemblySceneEdge, AssemblySceneFace } from '../cad/kernel.assembly-types'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { buildAssemblyOriginTree } from './assemblyOriginTree'
import { assemblyBrowseSelectionOrComponent, nominateAssemblyBrowseEdge, nominateAssemblyBrowseFace, nominateAssemblyBrowseOrigin,
  nominateAssemblyBrowseUnsupported, resolveAssemblyRelationSelection, type AssemblyBrowseContext, type AssemblyBrowseSelection } from './assemblyBrowseSelection'

// Original display-only plane/LINE witnesses and the existing original configuration
// prism catalog. These cases check UI identity and declaration scope, not native proof.
function fixture() {
  const input = assemblyConfigurationCoreFixture(), evaluation = evaluateAssemblyConfiguration(input.document, input.catalog, 'mixed')
  const origins = buildAssemblyOriginTree(evaluation, [])
  const body = (path: string[]): AssemblySceneBody => {
    const component = { occurrencePath: path, definition: { id: 'configuration-B', revision: 'r1' } }
    const reference = { bodyId: 'browse-body', sourceFeatureId: 'browse-final' }
    const face: AssemblySceneFace = { selection: { component, body: reference, face: { sourceFeatureId: 'browse-final', key: 'face-v1|' + 'a'.repeat(64) } },
      support: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 },
      worldSupport: null, vertices: [], triangles: [] }
    const edge: AssemblySceneEdge = { selection: { component, body: reference, edge: { sourceFeatureId: 'browse-final', key: 'edge-v1|' + 'b'.repeat(64) } },
      support: { kind: 'line', point: [0, 0, 0], axis: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null, lines: [0, 0, 0, 1, 0, 0] }
    return { component, body: reference, name: 'Original browse prism', visible: true,
      worldPose: { translation: [30, 4, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
      vertices: [], normals: [], triangles: [], edgeLines: [], faces: [face], edges: [edge], volume: 1, area: 6, solidCount: 1,
      bounds: { min: [29, 4, 0], max: [30, 6, 1] } }
  }
  const right = body(['right', 'b']), left = body(['left', 'b'])
  const scene: AssemblyScene = { kind: 'assembly-scene', sceneId: 'browse-original', bodies: [right, left], volume: 2, area: 12,
    solidCount: 2, prototypeCount: 1, bounds: right.bounds, visibleBounds: right.bounds, warnings: [] }
  const context: AssemblyBrowseContext = { documentSignature: 'current-original-catalog', scopePath: ['right'], sessionIdentity: {}, scene }
  const origin = (owner: string[], datum: string, rows = origins) => rows.find(entry => JSON.stringify(entry.ownerPath) === JSON.stringify(owner)
    && (entry.display.reference.kind === 'principal-axis' ? entry.display.reference.axis : entry.display.reference.plane) === datum)!
  return { context, origins, origin, scene, right, left, face: right.faces[0], edge: right.edges![0], evaluation }
}

function invalid(selection: AssemblyBrowseSelection | null, context: AssemblyBrowseContext, origins: ReturnType<typeof fixture>['origins']) {
  const result = resolveAssemblyRelationSelection(selection, context, origins)
  expect(result).toMatchObject({ status: 'invalid', references: [], faces: [], edges: [], origins: [] })
  expect(result.message).toBeTruthy()
}

describe('ordered assembly browse selection', () => {
  it('retains a single exact face and scopes a detached declaration without applying its world pose', () => {
    const f = fixture(), before = JSON.stringify([f.scene, f.origins])
    const selection = nominateAssemblyBrowseFace(null, f.face, false, f.context, false)
    const result = resolveAssemblyRelationSelection(selection, f.context, f.origins)
    expect(result.status).toBe('ready')
    expect(result.references).toEqual([{ kind: 'face', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } },
      body: { bodyId: 'browse-body', sourceFeatureId: 'browse-final' }, face: f.face.selection.face, support: 'plane' }])
    expect(result.faces).toEqual([f.face]); expect(result.edges).toEqual([]); expect(result.origins).toEqual([])
    result.references[0].component!.occurrencePath[0] = 'changed-copy'
    expect(JSON.stringify([f.scene, f.origins])).toBe(before)
  })

  it('keeps two face/LINE declarations in click order, including the reverse order', () => {
    const f = fixture(), faceFirst = nominateAssemblyBrowseEdge(nominateAssemblyBrowseFace(null, f.face, false, f.context, false), f.edge, false, f.context, true)
    const edgeFirst = nominateAssemblyBrowseFace(nominateAssemblyBrowseEdge(null, f.edge, false, f.context, false), f.face, false, f.context, true)
    const a = resolveAssemblyRelationSelection(faceFirst, f.context, f.origins), b = resolveAssemblyRelationSelection(edgeFirst, f.context, f.origins)
    expect(a.status).toBe('ready'); expect(b.status).toBe('ready')
    expect(a.references.map(reference => reference.kind)).toEqual(['face', 'edge'])
    expect(b.references).toEqual([...a.references].reverse())
    expect(a.edges).toEqual([f.edge]); expect(a.references[1]).toMatchObject({ support: 'line', component: { occurrencePath: ['b'] }, body: f.edge.selection.body })
  })

  it('uses plain replacement and Ctrl/Meta-style toggles without duplicating an item', () => {
    const f = fixture(), first = nominateAssemblyBrowseFace(null, f.face, false, f.context, false)
    const pair = nominateAssemblyBrowseEdge(first, f.edge, false, f.context, true)
    const onlyEdge = nominateAssemblyBrowseFace(pair, f.face, false, f.context, true)
    expect(onlyEdge.items.map(item => item.kind)).toEqual(['edge'])
    const empty = nominateAssemblyBrowseEdge(onlyEdge, f.edge, false, f.context, true)
    expect(resolveAssemblyRelationSelection(empty, f.context, f.origins)).toEqual({ status: 'empty', references: [], faces: [], edges: [], origins: [] })
    expect(nominateAssemblyBrowseFace(pair, f.face, false, f.context, false).items).toEqual(first.items)
  })

  it('retains every third and fourth identity and rejects the entire excess selection', () => {
    const f = fixture(), xy = f.origin(['right'], 'XY'), yz = f.origin(['right'], 'YZ')
    const pair = nominateAssemblyBrowseEdge(nominateAssemblyBrowseFace(null, f.face, false, f.context, false), f.edge, false, f.context, true)
    const three = nominateAssemblyBrowseOrigin(pair, xy, f.context, true), four = nominateAssemblyBrowseOrigin(three, yz, f.context, true)
    expect(four.items).toHaveLength(4); invalid(four, f.context, f.origins)
    const remaining = nominateAssemblyBrowseOrigin(four, xy, f.context, true)
    expect(remaining.items).toHaveLength(3); expect(remaining.items.at(-1)?.key).toBe(yz.treeKey)
    invalid(remaining, f.context, f.origins)
  })

  it('does not discard an unsupported selected component or treat it as empty space', () => {
    const f = fixture(), selected = nominateAssemblyBrowseUnsupported('component-right-b', f.context)
    invalid(selected, f.context, f.origins)
    const repeated = nominateAssemblyBrowseFace(selected, null, false, f.context, true, 'component-right-b')
    expect(repeated.items).toHaveLength(1)
    const mixed = nominateAssemblyBrowseFace(selected, f.face, false, f.context, true)
    invalid(mixed, f.context, f.origins)
    expect(resolveAssemblyRelationSelection(nominateAssemblyBrowseEdge(mixed, null, true, f.context, false), f.context, f.origins).status).toBe('empty')
  })

  it('keeps component fallback, explicit empty selection and stale retained selection distinct', () => {
    const f = fixture(), empty = nominateAssemblyBrowseFace(null, null, true, f.context, false)
    expect(assemblyBrowseSelectionOrComponent(null, null, f.context)).toBeNull()
    invalid(assemblyBrowseSelectionOrComponent(null, 'component-right-b', f.context), f.context, f.origins)
    expect(assemblyBrowseSelectionOrComponent(empty, 'component-right-b', f.context)).toBe(empty)
    expect(resolveAssemblyRelationSelection(null, f.context, f.origins).status).toBe('empty')
    const changed = { ...f.context, sessionIdentity: {} }
    expect(assemblyBrowseSelectionOrComponent(empty, 'component-right-b', changed)).toBe(empty)
    invalid(empty, changed, f.origins)
  })

  it.each(['document', 'scope', 'session', 'scene'] as const)('rejects stale %s context and begins a new additive list instead of rebinding old candidates', change => {
    const f = fixture(), selected = nominateAssemblyBrowseFace(null, f.face, false, f.context, false)
    const changed = change === 'document' ? { ...f.context, documentSignature: 'different-document' }
      : change === 'scope' ? { ...f.context, scopePath: [] } : change === 'session' ? { ...f.context, sessionIdentity: {} }
        : { ...f.context, scene: structuredClone(f.scene) }
    invalid(selected, changed, f.origins)
    expect(nominateAssemblyBrowseEdge(selected, f.edge, false, changed, true).items.map(item => item.kind)).toEqual(['edge'])
  })

  it.each(['signature', 'session', 'scene'] as const)('does not resolve a selection without a current %s witness', missing => {
    const f = fixture(), selected = nominateAssemblyBrowseFace(null, f.face, false, f.context, false)
    const changed = { ...f.context, ...(missing === 'signature' ? { documentSignature: '' } : missing === 'session' ? { sessionIdentity: null } : { scene: null }) }
    invalid(selected, changed, f.origins)
  })

  it.each(['face', 'edge'] as const)('rejects a missing, duplicated or hidden %s without returning its valid partner', kind => {
    for (const change of ['missing', 'duplicate', 'hidden'] as const) {
      const f = fixture(), origin = f.origin(['right'], 'XY')
      const selected = kind === 'face' ? nominateAssemblyBrowseFace(null, f.face, false, f.context, false) : nominateAssemblyBrowseEdge(null, f.edge, false, f.context, false)
      const pair = nominateAssemblyBrowseOrigin(selected, origin, f.context, true)
      if (change === 'hidden') f.right.visible = false
      else if (kind === 'face') f.right.faces = change === 'missing' ? [] : [f.face, structuredClone(f.face)]
      else f.right.edges = change === 'missing' ? [] : [f.edge, structuredClone(f.edge)]
      invalid(pair, f.context, f.origins)
    }
  })

  it.each(['revision', 'body', 'body-state', 'topology-state', 'key'] as const)('rejects a face or LINE after its exact %s identity changes', field => {
    for (const kind of ['face', 'edge'] as const) {
      const f = fixture(), value = kind === 'face' ? f.face : f.edge
      const selected = kind === 'face' ? nominateAssemblyBrowseFace(null, f.face, false, f.context, false) : nominateAssemblyBrowseEdge(null, f.edge, false, f.context, false)
      if (field === 'revision') value.selection.component.definition.revision = 'r2'
      else if (field === 'body') value.selection.body = null
      else if (field === 'body-state') value.selection.body!.sourceFeatureId = 'different-final'
      else if (field === 'topology-state') ('face' in value.selection ? value.selection.face : value.selection.edge).sourceFeatureId = 'different-final'
      else ('face' in value.selection ? value.selection.face : value.selection.edge).key += '-changed'
      invalid(selected, f.context, f.origins)
    }
  })

  it('distinguishes reused instances with the same definition, body and topology locators', () => {
    const f = fixture(), context = { ...f.context, scopePath: [] }
    const selected = nominateAssemblyBrowseFace(nominateAssemblyBrowseFace(null, f.face, false, context, false), f.left.faces[0], false, context, true)
    const result = resolveAssemblyRelationSelection(selected, context, f.origins)
    expect(result.status).toBe('ready')
    expect(result.references.map(reference => reference.component?.occurrencePath)).toEqual([['right', 'b'], ['left', 'b']])
    expect(result.references[0].component!.definition).toEqual(result.references[1].component!.definition)
    expect(selected.items[0].key).not.toBe(selected.items[1].key)
  })

  it('rejects out-of-scope faces and edges, including an owner equal to the editable scope', () => {
    const f = fixture()
    invalid(nominateAssemblyBrowseFace(null, f.left.faces[0], false, f.context, false), f.context, f.origins)
    invalid(nominateAssemblyBrowseEdge(null, f.left.edges![0], false, f.context, false), f.context, f.origins)
    const context = { ...f.context, scopePath: ['right', 'b'] }
    invalid(nominateAssemblyBrowseFace(null, f.face, false, context, false), context, f.origins)
  })

  it('rejects a supported DTO filed under another visible body owner', () => {
    const f = fixture(), copy = structuredClone(f.face)
    copy.selection.component.occurrencePath = ['right', 'other']
    f.right.faces = [copy]
    invalid(nominateAssemblyBrowseFace(null, copy, false, f.context, false), f.context, f.origins)
  })

  it('never derives a relation axis from a cone camera witness or a LINE from decorative segments', () => {
    const f = fixture()
    f.face.support = null
    f.face.worldViewAxis = { kind: 'axis', point: [30, 4, 0], direction: [0, 1, 0], xDirection: [0, 0, 1] }
    invalid(nominateAssemblyBrowseFace(null, f.face, false, f.context, false), f.context, f.origins)
    f.edge.support = null
    invalid(nominateAssemblyBrowseEdge(null, f.edge, false, f.context, false), f.context, f.origins)
  })

  it('uses a genuine cylindrical support as explicit axis intent rather than a surface tangent', () => {
    const f = fixture()
    f.face.support = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 1e-7 }
    const result = resolveAssemblyRelationSelection(nominateAssemblyBrowseFace(null, f.face, false, f.context, false), f.context, f.origins)
    expect(result.status).toBe('ready'); expect(result.references[0]).toMatchObject({ kind: 'face', support: 'axis' })
  })

  it('converts a global catalog scope root to null and its child to an exact relative owner in selection order', () => {
    const f = fixture(), root = f.origin(['right'], 'YZ'), child = f.origin(['right', 'b'], 'Z'), before = JSON.stringify(f.origins)
    const selected = nominateAssemblyBrowseOrigin(nominateAssemblyBrowseOrigin(null, root, f.context, false), child, f.context, true)
    const result = resolveAssemblyRelationSelection(selected, f.context, f.origins)
    expect(result.status).toBe('ready')
    expect(result.references).toEqual([{ kind: 'principal-plane', component: null, plane: 'YZ' },
      { kind: 'principal-axis', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, axis: 'Z' }])
    expect(result.origins).toEqual([root.display, child.display]); expect(JSON.stringify(f.origins)).toBe(before)
    result.references[1].component!.definition.revision = 'changed-copy'
    expect(JSON.stringify(f.origins)).toBe(before)
  })

  it('preserves root/null and nested-scope catalogs without applying a world pose twice', () => {
    const f = fixture(), rootContext = { ...f.context, scopePath: [] }, root = f.origin([], 'X')
    expect(resolveAssemblyRelationSelection(nominateAssemblyBrowseOrigin(null, root, rootContext, false), rootContext, f.origins).references)
      .toEqual([{ kind: 'principal-axis', component: null, axis: 'X' }])
    const local = buildAssemblyOriginTree(f.evaluation, ['right']), child = f.origin(['right', 'b'], 'XZ', local)
    expect(resolveAssemblyRelationSelection(nominateAssemblyBrowseOrigin(null, child, f.context, false), f.context, local).references)
      .toEqual([{ kind: 'principal-plane', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, plane: 'XZ' }])
  })

  it('rejects outside, removed, rebound and ambiguous origins atomically', () => {
    const f = fixture(), entry = f.origin(['right', 'b'], 'XY'), selected = nominateAssemblyBrowseOrigin(null, entry, f.context, false)
    invalid(nominateAssemblyBrowseOrigin(null, f.origin([], 'XY'), f.context, false), f.context, f.origins)
    invalid(nominateAssemblyBrowseOrigin(null, f.origin(['left', 'b'], 'XY'), f.context, false), f.context, f.origins)
    invalid(selected, f.context, f.origins.filter(value => value !== entry))
    invalid(selected, f.context, f.origins.map(value => value === entry ? { ...value, binding: 'rebound' } : value))
    invalid(selected, f.context, [...f.origins, { ...entry, binding: 'ambiguous-other-binding' }])
  })

  it('rejects duplicate items and two catalog entries declaring the same scoped origin', () => {
    const f = fixture(), selected = nominateAssemblyBrowseFace(null, f.face, false, f.context, false)
    invalid({ ...selected, items: [...selected.items, ...selected.items] }, f.context, f.origins)
    const global = f.origin(['right', 'b'], 'XY'), localRows = buildAssemblyOriginTree(f.evaluation, ['right']), local = f.origin(['right', 'b'], 'XY', localRows)
    const pair = nominateAssemblyBrowseOrigin(nominateAssemblyBrowseOrigin(null, global, f.context, false), local, f.context, true)
    invalid(pair, f.context, [...f.origins, ...localRows])
  })

  it('rejects inconsistent origin owner metadata rather than manufacturing a different component', () => {
    const f = fixture(), entry = structuredClone(f.origin(['right', 'b'], 'XY'))
    entry.definition.revision = 'unbound-revision'
    const selected = nominateAssemblyBrowseOrigin(null, entry, f.context, false)
    invalid(selected, f.context, [entry])
  })
  it('rejects an invalid second item without exposing the already resolved first slot', () => {
    const f = fixture(), face = nominateAssemblyBrowseFace(null, f.face, false, f.context, false)
    const pair = nominateAssemblyBrowseOrigin(face, f.origin(['left', 'b'], 'XY'), f.context, true)
    invalid(pair, f.context, f.origins)
  })

  it('does not reinterpret an unknown item kind as a supported LINE', () => {
    const f = fixture(), edge = nominateAssemblyBrowseEdge(null, f.edge, false, f.context, false)
    const unknown = { ...edge, items: [{ kind: 'unknown', key: edge.items[0].key }] } as unknown as AssemblyBrowseSelection
    invalid(unknown, f.context, f.origins)
  })

})
