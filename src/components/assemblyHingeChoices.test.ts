import { expect, it } from 'vitest'
import original from '../cad/fixtures/assembly-hinge-original.json'
import { validateAssemblyDocument, validateAssemblyGeometryReference } from '../model/assemblyDocument'
import type { AssemblyScene, AssemblySceneBody, AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import type { AssemblyNativeFaceSupport } from '../cad/kernel.assembly-supports'
import { identityRigidPose } from '../model/rigidPose'
import { assemblyHingeChoices } from './assemblyHingeChoices'

// Original display-only metadata examples refer to the public hinge recipe.
// Literal support metadata is NOT a CAD execution, BRep check or current proof.
const document = validateAssemblyDocument(original), definition = document.definitions[0]
const component = (path: string[]) => ({ occurrencePath: path, definition: { id: definition.id, revision: definition.revision } })
const bodyRef = { bodyId: 'leaf', sourceFeatureId: 'solid' }
const plane = (z: number): AssemblyNativeFaceSupport => ({ kind: 'plane', point: [0, 0, z], normal: [0, 0, z === 0 ? -1 : 1], xDirection: [1, 0, 0], tolerance: 1e-7 })
function face(key: string, support: AssemblyNativeFaceSupport | null, path = ['left']): AssemblySceneFace {
  return { selection: { component: component(path), body: bodyRef, face: { sourceFeatureId: 'solid', key } }, support, worldSupport: null, vertices: [], triangles: [] }
}
function edge(key: string, path = ['left']): AssemblySceneEdge {
  return { selection: { component: component(path), body: bodyRef, edge: { sourceFeatureId: 'solid', key } }, support: { kind: 'line', point: [2, 0, 0], axis: [0, 0, 1], tolerance: 1e-7 }, worldSupport: null, lines: [] }
}
function body(path = ['left']): AssemblySceneBody {
  return { component: component(path), body: bodyRef, name: 'Original hinge leaf', visible: true, worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [],
    faces: [face('opaque-cap-0', plane(0), path), face('opaque-cap-4', plane(4), path),
      face('opaque-radial', { kind: 'plane', point: [3, 0, 2], normal: [1, 0, 0], xDirection: [0, 1, 0], tolerance: 1e-7 }, path),
      face('opaque-cylinder', { kind: 'cylinder', point: [2, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 1, tolerance: 1e-7 }, path)], edges: [edge('opaque-line', path)],
    volume: 0, area: 0, solidCount: 1, bounds: { min: [0, 0, 0], max: [4, 6, 4] } }
}
function scene(bodies = [body()]): AssemblyScene {
  return { kind: 'assembly-scene', sceneId: 'original-display-only', bodies, volume: 0, area: 0, solidCount: bodies.length, prototypeCount: 1, bounds: null, visibleBounds: null, warnings: [] }
}
it('distinguishes both axial caps, a radial plane, cylindrical axis and LINE edge using local geometry', () => {
  const choices = assemblyHingeChoices(scene(), [])
  expect(choices.planes.map(c => c.label)).toEqual([
    'cara plana · p local (0, 0, 0) mm · n local (0, 0, -1) · left · Original hinge leaf · solid',
    'cara plana · p local (0, 0, 4) mm · n local (0, 0, 1) · left · Original hinge leaf · solid',
    'cara plana · p local (3, 0, 2) mm · n local (1, 0, 0) · left · Original hinge leaf · solid'])
  expect(choices.axes.map(c => c.label)).toEqual([
    'eje de cara cilíndrica · p local (2, 0, 0) mm · dirección local (0, 0, 1) · left · Original hinge leaf · solid',
    'arista LINE · p local (2, 0, 0) mm · dirección local (0, 0, 1) · left · Original hinge leaf · solid'])
  expect([...choices.axes, ...choices.planes].every(c => !c.label.includes('opaque'))).toBe(true)
})
it('retains full normalized identity and does not use labels, rounding or catalog order as keys', () => {
  const input = scene(), before = structuredClone(input), choices = assemblyHingeChoices(input, [])
  for (const c of [...choices.axes, ...choices.planes]) expect(JSON.parse(c.key)).toEqual(validateAssemblyGeometryReference(c.reference))
  expect(input).toEqual(before)
  const changed = structuredClone(input); changed.bodies[0].faces.reverse()
  expect(assemblyHingeChoices(changed, []).planes.map(c => c.key).sort()).toEqual(choices.planes.map(c => c.key).sort())
  choices.planes[0].reference.component!.definition.revision = 'changed'
  expect(input).toEqual(before)
})
it('filters hidden and outside-scope occurrences while preserving reused namespaces and scoped relative paths', () => {
  const left = body(['outer', 'left']), right = body(['outer', 'right']), outside = body(['other', 'left']), hidden = body(['outer', 'hidden']); hidden.visible = false
  const choices = assemblyHingeChoices(scene([left, right, outside, hidden]), ['outer'])
  expect(choices.axes).toHaveLength(4); expect(choices.planes).toHaveLength(6)
  expect(new Set(choices.axes.map(c => c.key)).size).toBe(4)
  expect(choices.axes.map(c => c.reference.component!.occurrencePath[0])).toEqual(['left', 'left', 'right', 'right'])
  expect(choices.planes.every(c => !c.label.includes('outer') && !c.label.includes('hidden'))).toBe(true)
})
it('does not mislabel local coordinates as world values under a nontrivial occurrence pose', () => {
  const b = body(); b.worldPose = { translation: [1e8, -42, 19], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  expect(assemblyHingeChoices(scene([b]), []).planes[1].label).toContain('p local (0, 0, 4) mm')
  expect(assemblyHingeChoices(scene([b]), []).planes[1].label).not.toContain('100000000')
})
it('adds only explicitly declared principal planes and identifies their frame separately from material planes', () => {
  const choices = assemblyHingeChoices(scene(), [], [{ reference: { kind: 'principal-plane', component: null, plane: 'XY' }, label: 'Not authoritative' },
    { reference: { kind: 'principal-plane', component: component(['left']), plane: 'YZ' } }])
  expect(choices.planes).toHaveLength(5)
  expect(choices.planes.at(-2)?.label).toBe('Ámbito actual · plano principal declarado XY · marco local declarado')
  expect(choices.planes.at(-1)?.label).toBe('left · plano principal declarado YZ · marco local declarado')
  expect(assemblyHingeChoices(null, []).axes).toEqual([])
})
it('uses a current-catalog ordinal only for indistinguishable descriptions while preserving distinct topology keys', () => {
  const b = body(); b.faces = [face('different-key-a', plane(4)), face('different-key-b', plane(4))]; b.edges = []
  const { planes } = assemblyHingeChoices(scene([b]), [])
  expect(planes[0].label).toContain('opción del catálogo actual 1'); expect(planes[1].label).toContain('opción del catálogo actual 2')
  expect(planes[0].key).not.toBe(planes[1].key)
  expect(planes[0].key).not.toContain('catálogo')
})
it('formats finite zero consistently and refuses to print nonfinite geometry as a valid descriptor', () => {
  const b = body(); b.faces = [face('zero', { ...plane(0), point: [-0, 1e-12, 4] }), face('nan', { ...plane(4), point: [NaN, Infinity, 4] })]; b.edges = []
  const choices = assemblyHingeChoices(scene([b]), [])
  expect(choices.planes[0].label).toContain('p local (0, 1e-12, 4)')
  expect(choices.planes[1].label).toContain('geometría local no disponible')
  expect(choices.planes.every(c => !/NaN|Infinity|\(-0/.test(c.label))).toBe(true)
})
it('does not promote unsupported supports or material choices passed as principal metadata', () => {
  const b = body(); b.faces.push(face('unsupported', null)); b.edges![0].support = null
  const s = scene([b]), material = assemblyHingeChoices(s, []).planes[0]
  expect(assemblyHingeChoices(s, [], [{ reference: material.reference as import('../model/assemblyDocument').AssemblyPlaneReference }]).planes).toHaveLength(3)
  expect(assemblyHingeChoices(s, []).axes).toHaveLength(1)
  expect(() => assemblyHingeChoices(s, [, 'sparse'] as string[])).toThrow(/dense/)
})
