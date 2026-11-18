import { expect, it } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import type { AssemblyGeometryReference, AssemblySphereTangentReference, AssemblyTangentReference } from '../model/assemblyDocument'
import { assemblyTreeRows } from './assemblyContextTarget'
import { assemblyReferenceCardLabel } from './assemblyReferenceCardLabel'

// Original symbolic documents; these tests exercise presentation, not a native solve.
function fixture() {
  const document = createAssemblyExample()
  document.occurrences[1].name = 'Pieza1'
  document.occurrences[2].name = 'Pieza2'
  return document
}
function plane(path = ['left']): AssemblyGeometryReference {
  return { kind: 'principal-plane', component: { occurrencePath: path, definition: { id: 'example-pin', revision: 'r1' } }, plane: 'YZ' }
}
function nested() {
  const document = fixture(), child = { ...structuredClone(document.occurrences[1]), id: 'child', name: 'Pasador' }
  document.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original shared group',
    createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: [child], mates: [] })
  document.occurrences = [
    { ...structuredClone(document.occurrences[1]), id: 'a', name: 'Grupo izquierdo', definition: { id: 'sub', revision: 'r1' } },
    { ...structuredClone(document.occurrences[2]), id: 'b', name: 'Grupo derecho', definition: { id: 'sub', revision: 'r1' } },
  ]
  return document
}

it('shows current occurrence names for two uses of one definition, keeping exact reference bytes', () => {
  const document = fixture(), first = plane(), second = plane(['right'])
  const before = JSON.stringify([document, first, second]), rows = assemblyTreeRows(document)
  expect(assemblyReferenceCardLabel(first, rows, [])).toBe('Pieza1 · YZ')
  expect(assemblyReferenceCardLabel(second, rows, [])).toBe('Pieza2 · YZ')
  expect(JSON.stringify([document, first, second])).toBe(before)
})

it('keeps empty and current-scope datum labels distinct from component references', () => {
  const rows = assemblyTreeRows(fixture())
  expect(assemblyReferenceCardLabel(null, rows, [])).toBe('Sin seleccionar')
  expect(assemblyReferenceCardLabel({ kind: 'principal-plane', component: null, plane: 'XY' }, rows, [])).toBe('Ámbito actual · XY')
  expect(assemblyReferenceCardLabel({ kind: 'principal-axis', component: null, axis: 'Z' }, rows, [])).toBe('Ámbito actual · Eje de origen Z')
})

it('resolves scope-relative paths to the intended reused nested occurrence', () => {
  const rows = assemblyTreeRows(nested())
  expect(assemblyReferenceCardLabel(plane(['child']), rows, ['a'])).toBe('Grupo izquierdo / Pasador · YZ')
  expect(assemblyReferenceCardLabel(plane(['child']), rows, ['b'])).toBe('Grupo derecho / Pasador · YZ')
  expect(assemblyReferenceCardLabel(plane(['b', 'child']), rows, [])).toBe('Grupo derecho / Pasador · YZ')
  expect(assemblyReferenceCardLabel(plane(['child']), rows, [])).toBe('Referencia no vigente')
})

it('distinguishes same-named siblings at each level without exposing their IDs', () => {
  const document = nested()
  document.occurrences.forEach(value => { value.name = 'Grupo' })
  const sub = document.definitions.find(value => value.kind === 'assembly')!
  if (sub.kind !== 'assembly') throw Error('Original nested fixture required')
  sub.occurrences.push({ ...structuredClone(sub.occurrences[0]), id: 'second-child' })
  const rows = assemblyTreeRows(document)
  expect(assemblyReferenceCardLabel(plane(['child']), rows, ['a'])).toBe('Grupo (instancia 1) / Pasador (instancia 1) · YZ')
  expect(assemblyReferenceCardLabel(plane(['second-child']), rows, ['b'])).toBe('Grupo (instancia 2) / Pasador (instancia 2) · YZ')
})

it('derives renames and their reversal from current rows while leaving the saved endpoint unchanged', () => {
  const original = nested(), renamed = structuredClone(original), reference = plane(['child']), before = JSON.stringify(reference)
  renamed.occurrences[1].name = 'Grupo renombrado'
  const sub = renamed.definitions.find(value => value.kind === 'assembly')!
  if (sub.kind !== 'assembly') throw Error('Original nested fixture required')
  sub.occurrences[0].name = 'Pasador nuevo'
  expect(assemblyReferenceCardLabel(reference, assemblyTreeRows(original), ['b'])).toBe('Grupo derecho / Pasador · YZ')
  expect(assemblyReferenceCardLabel(reference, assemblyTreeRows(renamed), ['b'])).toBe('Grupo renombrado / Pasador nuevo · YZ')
  expect(assemblyReferenceCardLabel(reference, assemblyTreeRows(original), ['b'])).toBe('Grupo derecho / Pasador · YZ')
  expect(JSON.stringify(reference)).toBe(before)
})

it.each([{ id: 'other-part', revision: 'r1' }, { id: 'example-pin', revision: 'r2' }])('never borrows the same-path name for a different definition $id/$revision', definition => {
  const reference = plane()
  reference.component!.definition = definition
  expect(assemblyReferenceCardLabel(reference, assemblyTreeRows(fixture()), [])).toBe('Referencia no vigente')
})

it('rejects missing, empty, ambiguous and incomplete paths rather than guessing a name', () => {
  const rows = assemblyTreeRows(nested()), selected = rows.find(row => row.path.join('/') === 'b/child')!
  expect(assemblyReferenceCardLabel(plane(['absent']), rows, ['b'])).toBe('Referencia no vigente')
  expect(assemblyReferenceCardLabel(plane([]), rows, ['b'])).toBe('Referencia no vigente')
  expect(assemblyReferenceCardLabel(plane(['child']), [...rows, selected], ['b'])).toBe('Referencia no vigente')
  expect(assemblyReferenceCardLabel(plane(['b', 'child']), rows.filter(row => row.path.join('/') !== 'b'), [])).toBe('Referencia no vigente')
  expect(assemblyReferenceCardLabel(plane(['child']), rows, ['absent'])).toBe('Referencia no vigente')
  expect(assemblyReferenceCardLabel({ kind: 'principal-plane', component: null, plane: 'XY' }, rows, ['b', 'child'])).toBe('Referencia no vigente')
})

it('retains the name of a hidden or suppressed declaration without claiming it is pickable', () => {
  const document = fixture()
  document.occurrences[1].visible = false
  document.occurrences[1].suppressed = true
  expect(assemblyReferenceCardLabel(plane(), assemblyTreeRows(document), [])).toBe('Pieza1 · YZ')
})

it('labels face and edge families without leaking feature/body IDs or changing their identities', () => {
  const component = plane().component!, face = { sourceFeatureId: 'internal-feature-id', key: 'face-v1|original' }
  const body = { bodyId: 'internal-body-id', sourceFeatureId: 'internal-feature-id' }
  const references: Array<AssemblyGeometryReference | AssemblyTangentReference | AssemblySphereTangentReference> = [
    { kind: 'face', component, body, face, support: 'plane' }, { kind: 'face', component, body, face, support: 'axis' },
    { kind: 'face', component, body, face, support: 'cylinder-surface' }, { kind: 'face', component, body, face, support: 'sphere-surface' },
    { kind: 'edge', component, body, edge: { sourceFeatureId: 'internal-edge-feature', key: 'edge-v1|original' }, support: 'line' },
  ]
  const before = JSON.stringify(references), rows = assemblyTreeRows(fixture())
  expect(references.map(reference => assemblyReferenceCardLabel(reference, rows, []))).toEqual([
    'Pieza1 · Plano', 'Pieza1 · Cilindro', 'Pieza1 · Superficie cilíndrica', 'Pieza1 · Superficie esférica', 'Pieza1 · Arista lineal',
  ])
  expect(JSON.stringify(references)).toBe(before)
})
