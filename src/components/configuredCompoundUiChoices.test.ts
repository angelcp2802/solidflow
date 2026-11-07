import { expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { identityRigidPose } from '../model/rigidPose'
import type { AssemblySceneBody } from '../cad/kernel.assembly-types'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { configuredCompoundUiChoices, configuredCompoundLineOrigins, configuredCompoundProfileEdgesForFace } from './configuredCompoundUiChoices'

// Original A/B declaration fixture and literal display metadata only. These
// tests execute no CAD and make no claim of native profile/edge incidence.
function fixture() {
  const f = assemblyConfigurationCoreFixture(), document = createAssemblyConfiguredDocument(f.document, f.catalog, 'mixed')
  const evaluation = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration)
  function body(path: string[]): AssemblySceneBody & { configurationAncestry: typeof evaluation.parts[number]['configurationAncestry'] } {
    const part = evaluation.parts.find(row => JSON.stringify(row.path) === JSON.stringify(path))!
    const component = { occurrencePath: path, definition: { id: part.definition.id, revision: part.definition.revision } }
    const ref = { bodyId: 'box', sourceFeatureId: 'solid' }
    const vertices = ['a', 'b', 'c'].map((letter, i) => ({ selection: { component, body: ref, vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + letter.repeat(64) } }, point: [i, 0, 4] as [number, number, number], worldPoint: [100 + i, 0, 4] as [number, number, number], tolerance: 1e-7 }))
    return { component, body: ref, configurationAncestry: structuredClone(part.configurationAncestry), name: 'Original box', visible: true, worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [],
      faces: [0, 4].map(z => ({ selection: { component, body: ref, face: { sourceFeatureId: 'solid', key: 'cap-' + z } }, support: { kind: 'plane' as const, point: [0, 0, z], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null, vertices: [], triangles: [] })),
      edges: [{ selection: { component, body: ref, edge: { sourceFeatureId: 'solid', key: 'edge-v1|line' } }, support: { kind: 'line', point: [0, 0, 4], axis: [1, 0, 0], tolerance: 1e-7 }, worldSupport: null, lines: [] },
        { selection: { component, body: ref, edge: { sourceFeatureId: 'solid', key: 'edge-v1|arc' } }, support: null, worldSupport: null, lines: [], circularPathOrigins: vertices.slice(0, 2).map(v => v.selection.vertex) }],
      vertexPoints: vertices, volume: 24, area: 52, solidCount: 1, bounds: { min: [0, 0, 0], max: [2, 3, 4] } }
  }
  const wrapper = { kind: 'configured-assembly-scene', context: { generation: 7, root: { id: document.source.id, revision: document.source.revision }, rootConfiguration: 'mixed' as string | null, sourceSignature: JSON.stringify(document.source), catalogSignature: JSON.stringify(document.catalog) },
    scene: { kind: 'assembly-scene', sceneId: 'display-only', bodies: [body(['left', 'a']), body(['right', 'a'])], volume: 48, area: 104, solidCount: 2, prototypeCount: 1, bounds: null, visibleBounds: null, warnings: [] }, referenceDiagnostics: [] } satisfies ConfiguredAssemblyScene
  return { document, wrapper, body }
}
it('provides all three purpose-distinct catalogs with scoped full identity and atomic arc origins', () => {
  const { document, wrapper } = fixture(), c = configuredCompoundUiChoices(document, wrapper, 7, ['right'])
  expect([c.profileFaces.length, c.profileEdges.length, c.points.length, c.lineEdges.length, c.circularPaths.length, c.guides.length]).toEqual([2, 1, 3, 1, 2, 2])
  expect(c.profileFaces.map(x => x.reference.face.key)).toEqual(['cap-0', 'cap-4'])
  expect(c.points.every(x => JSON.stringify(x.reference.component.occurrencePath) === '["a"]')).toBe(true)
  expect(c.circularPaths.map(x => x.reference.startVertex.key)).toEqual(['vertex-v1|' + 'a'.repeat(64), 'vertex-v1|' + 'b'.repeat(64)])
  expect(c.circularPaths.every(x => x.reference.edge.key === 'edge-v1|arc')).toBe(true)
  expect(c.lineEdges[0].reference.edge.key).toBe('edge-v1|line')
  expect(c.guides.every(x => x.reference.kind === 'face' && x.reference.support === 'plane')).toBe(true)
  expect(c.profileFaces[1].label).toContain('p local (0, 0, 4) mm')
})
it.each(['generation', 'source', 'catalog', 'selector'] as const)('withholds every nominee for stale %s', field => {
  const { document, wrapper } = fixture(), stale = structuredClone(wrapper)
  if (field === 'generation') stale.context.generation++
  if (field === 'source') stale.context.sourceSignature += ' '
  if (field === 'catalog') stale.context.catalogSignature += ' '
  if (field === 'selector') stale.context.rootConfiguration = null
  expect(Object.values(configuredCompoundUiChoices(document, stale, 7, [])).every(rows => rows.length === 0)).toBe(true)
})
it('keeps reused namespaces distinct, normalizes property order and owns all returned references', () => {
  const { document, wrapper } = fixture(), changed = structuredClone(wrapper)
  changed.scene.bodies[0].faces[0].selection.component = { definition: { revision: 'r1', id: 'configuration-A' }, occurrencePath: ['left', 'a'] }
  const before = structuredClone(changed), c = configuredCompoundUiChoices(document, changed, 7, [])
  expect(c.profileFaces).toHaveLength(4)
  expect(new Set(c.profileFaces.map(x => x.key)).size).toBe(4)
  c.profileFaces[0].reference.component.definition.revision = 'edited'
  c.circularPaths[0].reference.startVertex.key = 'edited'
  expect(changed).toEqual(before)
})
it('filters body/producer namespaces and preserves nonincident LINE origin candidates for native rejection', () => {
  const { document, wrapper } = fixture(), c = configuredCompoundUiChoices(document, wrapper, 7, ['right'])
  expect(configuredCompoundLineOrigins(c.points, c.lineEdges[0].reference)).toHaveLength(3)
  expect(configuredCompoundProfileEdgesForFace(c.profileEdges, c.profileFaces[1].reference)).toHaveLength(1)
  const other = structuredClone(c.profileFaces[1].reference); other.body!.bodyId = 'another'
  expect(configuredCompoundProfileEdgesForFace(c.profileEdges, other)).toEqual([])
  expect(configuredCompoundLineOrigins(c.points, null)).toEqual([])
  expect(configuredCompoundProfileEdgesForFace(c.profileEdges, null)).toEqual([])
})
it('omits hidden, suppressed, wrong tuple and foreign body metadata without promoting unsupported surfaces', () => {
  const { document, wrapper } = fixture(), changed = structuredClone(wrapper)
  changed.scene.bodies[0].visible = false
  changed.scene.bodies[1].faces[0].selection.body = { bodyId: 'foreign', sourceFeatureId: 'solid' }
  changed.scene.bodies[1].edges![0].selection.edge.sourceFeatureId = 'other'
  const c = configuredCompoundUiChoices(document, changed, 7, [])
  expect(c.profileFaces).toHaveLength(1); expect(c.lineEdges).toEqual([])
  expect(configuredCompoundUiChoices(document, wrapper, 7, ['missing']).points).toEqual([])
  const wrong = structuredClone(wrapper); wrong.scene.bodies[1].component.definition.revision = 'old'
  expect(configuredCompoundUiChoices(document, wrong, 7, ['right']).points).toEqual([])
})
it('requires exactly current arc endpoint metadata and rejects duplicate ambiguous identities', () => {
  const { document, wrapper } = fixture(), missing = structuredClone(wrapper)
  missing.scene.bodies[1].vertexPoints!.splice(1, 1)
  const c = configuredCompoundUiChoices(document, missing, 7, ['right'])
  expect(c.circularPaths).toHaveLength(1)
  const repeated = structuredClone(wrapper); repeated.scene.bodies[1].edges![1].circularPathOrigins![1] = repeated.scene.bodies[1].edges![1].circularPathOrigins![0]
  expect(() => configuredCompoundUiChoices(document, repeated, 7, ['right'])).toThrow(/ambigua/)
})
it('enforces candidate and inspection budgets instead of constructing a face-edge-vertex product', () => {
  const { document, wrapper } = fixture(), changed = structuredClone(wrapper), b = changed.scene.bodies[1]
  b.faces = []; b.edges = []
  b.vertexPoints = Array.from({ length: 4097 }, (_, i) => ({ ...structuredClone(b.vertexPoints![0]), selection: { ...structuredClone(b.vertexPoints![0].selection), vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + i.toString(16).padStart(64, '0') } } }))
  expect(() => configuredCompoundUiChoices(document, changed, 7, ['right'])).toThrow(/4096/)
  b.vertexPoints = []; b.faces = Array.from({ length: 16384 }, () => ({ ...structuredClone(wrapper.scene.bodies[1].faces[0]), selection: { ...structuredClone(wrapper.scene.bodies[1].faces[0].selection), body: null } }))
  expect(() => configuredCompoundUiChoices(document, changed, 7, ['right'])).toThrow(/16384/)
})

it('rejects stale ancestry and source-hidden or suppressed descendants even when display metadata remains visible', () => {
  const { document, wrapper } = fixture(), changed = structuredClone(wrapper)
  changed.scene.bodies[1].configurationAncestry = []
  expect(configuredCompoundUiChoices(document, changed, 7, ['right']).points).toEqual([])
  for (const field of ['visible', 'suppressed'] as const) {
    const next = structuredClone(document)
    const owner = next.catalog.find(row => row.definition.id === next.source.id)!
    Object.assign(owner.configurations.find(row => row.id === 'mixed')!.occurrences[0], { [field]: field === 'suppressed' })
    const scene = structuredClone(wrapper); scene.context.catalogSignature = JSON.stringify(next.catalog)
    expect(configuredCompoundUiChoices(next, scene, 7, ['right']).points).toEqual([])
  }
})

it('retains atomic circular nominees when equivalent owner and selection body fields arrive in another order', () => {
  const { document, wrapper } = fixture(), changed = structuredClone(wrapper)
  const reversed = { sourceFeatureId: 'solid', bodyId: 'box' }
  changed.scene.bodies[1].body = reversed
  for (const vertex of changed.scene.bodies[1].vertexPoints!) vertex.selection.body = { ...reversed }
  for (const edge of changed.scene.bodies[1].edges!) edge.selection.body = { ...reversed }
  for (const face of changed.scene.bodies[1].faces) face.selection.body = { ...reversed }
  const before = structuredClone(changed)
  const actual = configuredCompoundUiChoices(document, changed, 7, ['right'])
  const baseline = configuredCompoundUiChoices(document, wrapper, 7, ['right'])
  expect(actual).toEqual(baseline)
  expect(actual.circularPaths).toHaveLength(2)
  expect(changed).toEqual(before)
})
