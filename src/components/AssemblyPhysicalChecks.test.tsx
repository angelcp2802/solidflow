import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyDocument, type AssemblyDocument, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { RigidMateEvaluation } from '../model/assemblySolveTypes'
import AssemblyPhysicalChecks from './AssemblyPhysicalChecks'

// Original presentation-only scopes and names; no model, solver or native authority fixture.
const localId = 'same-relation'
function mate(name: string): AssemblyMate {
  return { id: localId, name, suppressed: false, type: 'parallel', alignment: 'aligned',
    first: { kind: 'principal-plane', component: null, plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XZ' } }
}
function fixture(): AssemblyDocument {
  const root = createAssemblyDocument('Ensamblaje original')
  const shared: EmbeddedAssemblyDefinition = { id: 'shared', revision: 'r1', kind: 'assembly', name: 'Definición compartida',
    createdAt: root.createdAt, updatedAt: root.updatedAt, occurrences: [], mates: [mate('Relación compartida')] }
  const occurrence = (id: string, name: string, definition: EmbeddedAssemblyDefinition) => ({ id, name,
    definition: { id: definition.id, revision: definition.revision }, pose: { translation: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] },
    fixed: false, suppressed: false, visible: true })
  const middle: EmbeddedAssemblyDefinition = { ...shared, id: 'middle', name: 'Contenedor', mates: [], occurrences: [occurrence('inner', 'Interior', shared)] }
  return { ...root, definitions: [shared, middle], occurrences: [occurrence('left', 'Izquierda', middle), occurrence('right', 'Derecha', middle)], mates: [mate('Guía sobre eje X raíz')] }
}
function check(scope: string[] = [], satisfied = true): RigidMateEvaluation['checks'][number] {
  return { constraintId: JSON.stringify([scope, localId]), satisfied, lengthResidual: 1.25e-9, lengthTolerance: 1e-6,
    angleResidual: 2.5e-11, angleTolerance: 1e-8 }
}
const html = (document: AssemblyDocument, checks = [check()]) => renderToStaticMarkup(<AssemblyPhysicalChecks document={document} checks={checks} />)

it('uses the preview document relation name and retains physical results without exposing the scoped key', () => {
  const document = fixture(), checks = [check()], before = JSON.stringify([document, checks])
  const rendered = html(document, checks)
  expect(rendered).toContain('Guía sobre eje X raíz'); expect(rendered).not.toContain(localId)
  expect(rendered).toContain('✓'); expect(rendered).toContain('1.25e-9 / 1.00e-6 mm · 2.50e-11 / 1.00e-8 rad')
  expect(JSON.stringify([document, checks])).toBe(before)
})
it('distinguishes a local ID reused at root and in both expansions of a shared nested definition', () => {
  const rendered = html(fixture(), [check(), check(['left', 'inner']), check(['right', 'inner'], false)])
  expect(rendered).toContain('Guía sobre eje X raíz'); expect(rendered).toContain('Izquierda / Interior · Relación compartida')
  expect(rendered).toContain('Derecha / Interior · Relación compartida'); expect(rendered).toContain('⚠')
  expect(rendered).not.toContain(localId)
})
it('retains the nested scope when its saved occurrence name equals the document name', () => {
  const document = fixture()
  document.occurrences[0].name = document.name
  const rendered = html(document, [check(['left', 'inner'])])
  expect(rendered).toContain('Ensamblaje original / Interior · Relación compartida')
})
it.each(['missing-scope', 'wrong-revision', 'suppressed-scope', 'suppressed-relation', 'duplicate-occurrence', 'duplicate-definition', 'duplicate-mate'] as const)('does not borrow another relation name for %s', fault => {
  const document = fixture(), shared = document.definitions[0] as EmbeddedAssemblyDefinition
  if (fault === 'missing-scope') document.occurrences.shift()
  if (fault === 'wrong-revision') document.occurrences[0].definition.revision = 'r2'
  if (fault === 'suppressed-scope') document.occurrences[0].suppressed = true
  if (fault === 'suppressed-relation') shared.mates[0].suppressed = true
  // Deliberately ambiguous raw presentation data: never choose its first match.
  if (fault === 'duplicate-occurrence') document.occurrences.push({ ...document.occurrences[0], name: 'Otra ocurrencia' })
  if (fault === 'duplicate-definition') document.definitions.push({ ...shared, name: 'Otra definición' })
  if (fault === 'duplicate-mate') shared.mates.push(mate('Otra relación'))
  const rendered = html(document, [check(['left', 'inner'])])
  expect(rendered).toContain('Relación no disponible en este ámbito')
  expect(rendered).not.toContain('Relación compartida'); expect(rendered).not.toContain('Guía sobre eje X raíz')
  expect(rendered).not.toContain('Otra'); expect(rendered).not.toContain(localId)
})
it.each(['same-relation', '[[],"missing"]', '[["left"],"same-relation",0]', '[[],7]', '[[0],"same-relation"]', '[ [ ], "same-relation" ]'])('does not render or reinterpret an unavailable/noncanonical key %s', constraintId => {
  const rendered = html(fixture(), [{ ...check(), constraintId }])
  expect(rendered).toContain('Relación no disponible en este ámbito'); expect(rendered).not.toContain('Guía sobre eje X raíz')
  expect(rendered).not.toContain(constraintId); expect(rendered).not.toContain(localId)
})
it('escapes the actual saved relation and scope names', () => {
  const document = fixture(), shared = document.definitions[0] as EmbeddedAssemblyDefinition
  document.occurrences[0].name = '<left>'; shared.mates[0].name = '<img src=x onerror=bad()>'
  const rendered = html(document, [check(['left', 'inner'])])
  expect(rendered).toContain('&lt;left&gt; / Interior · &lt;img src=x onerror=bad()&gt;')
  expect(rendered).not.toContain('<img'); expect(rendered).not.toContain('<left>')
})
