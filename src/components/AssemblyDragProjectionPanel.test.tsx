import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyDragProjectionPanel, { assemblyDragProjectionMatches, type AssemblyDragProjection } from './AssemblyDragProjectionPanel'
import type { AssemblyDragFrame } from '../model/assemblyDrag'
import { identityRigidPose } from '../model/rigidPose'
import type { AssemblyPreviewReply } from '../cad/kernel.assembly-types'

// Original symbolic display/binding fixtures only, never an accepted native
// solve, scene, token, React interaction or CAD proof.
const component = { occurrencePath: ['carrier', 'slider'], definition: { id: 'opaque-part', revision: 'opaque-part-r2' } }
const drivenComponent = { occurrencePath: ['carrier'], definition: { id: 'opaque-group', revision: 'opaque-group-r1' } }
const scope = { id: 'opaque-scope', revision: 'opaque-scope-r1' }
function frame(): AssemblyDragFrame { return { component: structuredClone(component), drivenComponent: structuredClone(drivenComponent), worldPose: identityRigidPose(), ownerPose: identityRigidPose(), relativePose: identityRigidPose(), visible: true, affectedPaths: [['carrier']] } }
function projection(): AssemblyDragProjection {
  return { frame: 'world', component: structuredClone(component), drivenComponent: structuredClone(drivenComponent), scope: { ...scope }, mode: 'translate',
    requestedPose: { ...identityRigidPose(), translation: [13, 4, 5] }, resolvedPose: { ...identityRigidPose(), translation: [10, 0, 5] },
    affectedPaths: [['carrier']], positionResidual: 5, angleResidual: 0, lengthTolerance: 1e-6, angleTolerance: 1e-8, temporaryAnchor: false,
    evidence: { iterations: 3, trials: 4, stationarityNorm: 1e-9, primaryCost: 12.5, secondaryCost: 0, positionResidual: 5, angleResidual: 0, convergence: 'stationary', localOnly: true } }
}
const checks: Extract<AssemblyPreviewReply, { status: 'ready' }>['checks'] = [{ constraintId: 'opaque-mate', lengthResidual: 2e-7, angleResidual: 3e-9, lengthTolerance: 1e-6, angleTolerance: 1e-8, satisfied: true }]
function render(value = projection(), pending = false, relationChecks = checks) {
  return renderToStaticMarkup(<AssemblyDragProjectionPanel projection={value} checks={relationChecks} selectedName="Pasador interior" drivenName="Soporte móvil" pending={pending} />)
}
it('matches exact selected/root identities, mode and scope only as a display binding', () => {
  const value = projection(), expected = frame(), before = JSON.stringify({ value, expected })
  expect(assemblyDragProjectionMatches(value, expected, 'translate', scope)).toBe(true)
  expect(value.positionResidual).toBeGreaterThan(value.lengthTolerance)
  expect(JSON.stringify({ value, expected })).toBe(before); expect(Object.hasOwn(value, 'token')).toBe(false)
})
it('does not display a missing projection as an accepted strict-world target', () => {
  expect(assemblyDragProjectionMatches(undefined, frame(), 'translate', scope)).toBe(false)
})
it.each([
  { name: 'selected path segment', change: (value: AssemblyDragProjection) => { value.component.occurrencePath = ['carrier-long', 'slider'] } },
  { name: 'selected definition', change: (value: AssemblyDragProjection) => { value.component.definition.id = 'another-part' } },
  { name: 'selected revision', change: (value: AssemblyDragProjection) => { value.component.definition.revision = 'older-part' } },
  { name: 'driven root path', change: (value: AssemblyDragProjection) => { value.drivenComponent.occurrencePath = ['other-carrier'] } },
  { name: 'driven definition', change: (value: AssemblyDragProjection) => { value.drivenComponent.definition.id = 'another-group' } },
  { name: 'driven revision', change: (value: AssemblyDragProjection) => { value.drivenComponent.definition.revision = 'older-group' } },
  { name: 'scope identity', change: (value: AssemblyDragProjection) => { value.scope.id = 'another-scope' } },
  { name: 'scope revision', change: (value: AssemblyDragProjection) => { value.scope.revision = 'older-scope' } },
  { name: 'intent mode', change: (value: AssemblyDragProjection) => { value.mode = 'rotate' } },
])('rejects a different $name without inferring a replacement from display names', ({ change }) => {
  const value = projection(); change(value); expect(assemblyDragProjectionMatches(value, frame(), 'translate', scope)).toBe(false)
})
it('separates requested/resolved coordinates and the five-millimeter pointer miss from strict relation tolerances', () => {
  const html = render()
  expect(html).toContain('Proyección local de Pasador interior'); expect(html).toContain('Arrastre de posición'); expect(html).toContain('grupo rígido Soporte móvil')
  expect(html).toContain('13, 4, 5 mm'); expect(html).toContain('10, 0, 5 mm'); expect(html).toContain('Posición: 5 mm')
  expect(html).toContain('1 de 1 dentro de sus tolerancias'); expect(html).toContain('posición 2e-7 / 0.000001 mm'); expect(html).toContain('giro 3e-9 / 1e-8 rad')
  expect(html).toContain('sin un ancla temporal del puntero'); expect(html).not.toContain('grados de libertad con ancla temporal')
  expect(html).not.toContain('opaque-part'); expect(html).not.toContain('opaque-group'); expect(html).not.toContain('opaque-mate')
})
it('shows a rotational pointer miss in radians without converting it into an angular mate failure', () => {
  const value = projection(); value.mode = 'rotate'; value.angleResidual = Math.PI / 4; value.evidence.angleResidual = Math.PI / 4
  const html = render(value); expect(html).toContain('Arrastre de giro'); expect(html).toContain('Giro: 0.7853981634 rad')
  expect(html).toContain('1 de 1 dentro de sus tolerancias'); expect(html).not.toContain('Fuera de tolerancia')
})
it('labels an intermediate verified projection as pending without enabling Apply or Save controls', () => {
  const html = render(projection(), true); expect(html).toContain('Último destino verificado'); expect(html).toContain('Aplicar y Guardar permanecen bloqueados')
  expect(html).not.toContain('<button'); expect(html).not.toContain('Revisa el destino resuelto antes de Aplicar')
})
it('keeps a final display explicitly unapplied and does not mutate either source witness or checks', () => {
  const value = projection(), before = JSON.stringify({ value, checks }), html = render(value)
  expect(html).toContain('Revisa el destino resuelto antes de Aplicar'); expect(html).toContain('El documento confirmado todavía no ha cambiado')
  expect(html).toContain('no añade un bloqueo guardado'); expect(JSON.stringify({ value, checks })).toBe(before)
})
it('does not disguise an out-of-tolerance relation as a successful pointer projection', () => {
  const failed = [{ ...checks[0], lengthResidual: .1, satisfied: false }], html = render(projection(), false, failed)
  expect(html).toContain('0 de 1 dentro de sus tolerancias'); expect(html).toContain('Fuera de tolerancia'); expect(html).toContain('posición 0.1 / 0.000001 mm')
})
it('does not invent a zero DOF or a mate check when the report has no active relations', () => {
  const html = render(projection(), false, []); expect(html).toContain('No hay relaciones activas que comprobar'); expect(html).not.toContain('0 grados de libertad')
})
it.each([{ convergence: 'target' as const, label: 'Destino alcanzado' }, { convergence: 'immobile' as const, label: 'Sin movilidad útil en este destino' }])('renders the local $convergence outcome without claiming a global nearest solution', ({ convergence, label }) => {
  const value = projection(); value.evidence.convergence = convergence; const html = render(value)
  expect(html).toContain(label); expect(html).toContain('proyección local'); expect(html).not.toContain('más cercano global')
})
