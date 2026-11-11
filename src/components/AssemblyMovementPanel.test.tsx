import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyMovementPanel, { assemblyMovementTarget } from './AssemblyMovementPanel'
import { identityRigidPose, rigidRotationMatrix, transformRigidPoint, type RigidPose } from '../model/rigidPose'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyMovementWitness } from '../cad/kernel.assembly-solve'

// Original Cartesian/quaternion fixtures and symbolic witness display data.
// No native geometry, accepted kernel response or human interaction is seeded.
const component: AssemblyComponentReference = { occurrencePath: ['original-sub', 'original-child'], definition: { id: 'original-part', revision: 'r1' } }
function near(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-12))
}
it('keeps absolute local translations and full revision-scoped selection detached from the current pose', () => {
  const pose: RigidPose = { ...identityRigidPose(), translation: [10, 20, 30] }, before = JSON.stringify({ component, pose })
  const target = assemblyMovementTarget(component, pose, ['7', '8', '9'], 2, '0')
  expect(target.pose.translation).toEqual([7, 8, 9]); expect(target.pose.rotation).toEqual([0, 0, 0, 1]); expect(target.component).toEqual(component)
  target.component.occurrencePath[0] = 'changed'; target.pose.translation[0] = 999
  expect(JSON.stringify({ component, pose })).toBe(before)
})
it('applies local X90 after current Z90 with the independent Hamilton quaternion and Cartesian map', () => {
  const pose: RigidPose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const target = assemblyMovementTarget(component, pose, ['7', '8', '9'], 0, '90')
  near(target.pose.rotation, [.5, .5, .5, .5]); near(transformRigidPoint(target.pose, [4, 5, 6]), [13, 12, 14])
})
it('preserves noncommutative local multiplication for current X90 and a local Z90 increment', () => {
  const pose: RigidPose = { translation: [0, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  const target = assemblyMovementTarget(component, pose, ['0', '0', '0'], 2, '90')
  near(target.pose.rotation, [.5, -.5, .5, .5]); near(transformRigidPoint(target.pose, [4, 5, 6]), [-5, -6, 4])
})
it('treats opposite quaternion signs as the same target rotation without a world-axis shortcut', () => {
  const pose: RigidPose = { translation: [0, 0, 0], rotation: [0, 0, 0, -1] }
  const target = assemblyMovementTarget(component, pose, ['0', '0', '0'], 2, '90')
  near(rigidRotationMatrix(target.pose.rotation), [0, -1, 0, 1, 0, 0, 0, 0, 1])
})
it('admits a Y180 numeric target without confusing translation and direction', () => {
  const target = assemblyMovementTarget(component, identityRigidPose(), ['1', '2', '3'], 1, '180')
  near(transformRigidPoint(target.pose, [4, 5, 6]), [-3, 7, -3]); expect(target.pose.translation).toEqual([1, 2, 3])
})
it.each([
  { name: 'empty X', position: ['', '2', '3'], degrees: '0' },
  { name: 'blank Y', position: ['1', ' ', '3'], degrees: '0' },
  { name: 'invalid Z', position: ['1', '2', 'abc'], degrees: '0' },
  { name: 'infinite X', position: ['Infinity', '2', '3'], degrees: '0' },
  { name: 'overflow Y', position: ['1', '1e309', '3'], degrees: '0' },
  { name: 'empty rotation', position: ['1', '2', '3'], degrees: '' },
  { name: 'infinite rotation', position: ['1', '2', '3'], degrees: 'Infinity' },
  { name: 'overflow rotation', position: ['1', '2', '3'], degrees: '1e309' },
])('rejects $name instead of converting invalid intent to zero', ({ position, degrees }) => {
  expect(() => assemblyMovementTarget(component, identityRigidPose(), [position[0], position[1], position[2]], 2, degrees)).toThrow('finito')
})
it.each([3, -1, NaN])('rejects an unavailable local axis %s', axis => {
  expect(() => assemblyMovementTarget(component, identityRigidPose(), ['0', '0', '0'], axis, '90')).toThrow('eje local')
})
it.each([{ rotation: [0, 0, 0, 0] }, { rotation: [0, 0, 0, 2] }, { rotation: [0, 0, NaN, 1] }])('does not normalize an invalid source quaternion %#', ({ rotation }) => {
  expect(() => assemblyMovementTarget(component, { translation: [0, 0, 0], rotation: [rotation[0], rotation[1], rotation[2], rotation[3]] }, ['0', '0', '0'], 2, '0')).toThrow()
})
it('renders local-frame numeric intent with no default rotation or implicit preview during SSR', () => {
  const callback = vi.fn(), pose: RigidPose = { ...identityRigidPose(), translation: [1, 2, 3] }
  const html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={pose} name="Pasador original" scopeName="Soporte original" fixed={false} suppressed={false} disabled={false} onPreview={callback} />)
  expect(html).toContain('Mover Pasador original'); expect(html).toContain('marco local de Soporte original'); expect(html).toContain('todos sus usos equivalentes')
  expect(html).toMatch(/<input(?=[^>]*aria-label="Destino local X del componente")(?=[^>]*value="1")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Giro local del movimiento en grados")(?=[^>]*value="0")[^>]*>/)
  expect(html).toContain('aria-label="Vista previa del movimiento"'); expect(html).not.toContain('Aplicar giro declarado'); expect(callback).not.toHaveBeenCalled()
})
it.each([{ fixed: true, suppressed: false, disabled: false }, { fixed: false, suppressed: true, disabled: false }, { fixed: false, suppressed: false, disabled: true }])('blocks fixed, inherited-suppressed or pending movement %#', options => {
  const html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={identityRigidPose()} name="Original blocked child" scopeName="Original parent" {...options} onPreview={() => undefined} />)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa del movimiento")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Destino local Z del componente")(?=[^>]*disabled="")[^>]*>/)
  if (options.fixed) expect(html).toContain('fijo respecto a su padre')
  if (options.suppressed) expect(html).toContain('directamente o por un padre')
})
it('labels symbolic movement measurements as temporary anchored evidence, not saved mobility or a new lock', () => {
  const pose = identityRigidPose(), witness: AssemblyMovementWitness = { frame: 'local', component, drivenComponent: component, scope: { id: 'original-sub', revision: 'r1' }, targetPose: pose, resolvedPose: pose,
    affectedPaths: [['a', 'original-child'], ['b', 'original-child']], lengthResidual: 2e-8, angleResidual: 2e-9, lengthTolerance: 1e-6, angleTolerance: 1e-8, temporaryAnchor: true }
  const before = JSON.stringify(witness), html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={pose} name="Original driven child" scopeName="Original parent" fixed={false} suppressed={false} disabled witness={witness} onPreview={() => undefined} />)
  expect(html).toContain('2 usos dirigidos'); expect(html).toContain('Posición resuelta local: 0, 0, 0 mm'); expect(html).toContain('mm.'); expect(html).toContain('rad.')
  expect(html).toContain('incluyen el ancla temporal'); expect(html).toContain('no añade un bloqueo guardado'); expect(html).toContain('vuelve a Resolver')
  expect(JSON.stringify(witness)).toBe(before)
})
it('distinguishes a world target on a selected child from its driven rigid root without exposing opaque IDs', () => {
  const pose: RigidPose = { translation: [11, 12, 13], rotation: [0, 0, 0, 1] }
  const witness: AssemblyMovementWitness = { frame: 'world', component, drivenComponent: { occurrencePath: ['original-sub'], definition: { id: 'opaque-root', revision: 'opaque-revision' } },
    scope: { id: 'opaque-scope', revision: 'opaque-r' }, targetPose: pose, resolvedPose: pose, affectedPaths: [['original-sub']],
    lengthResidual: 0, angleResidual: 0, lengthTolerance: 1e-6, angleTolerance: 1e-8, temporaryAnchor: true }
  const html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={identityRigidPose()} name="Pasador interior" drivenName="Soporte móvil" scopeName="Soporte" fixed suppressed={false} disabled witness={witness} onPreview={() => undefined} />)
  expect(html).toContain('Mover Pasador interior'); expect(html).toContain('Grupo rígido dirigido: Soporte móvil')
  expect(html).toContain('Posición resuelta global: 11, 12, 13 mm'); expect(html).not.toContain('Posición resuelta local:')
  expect(html).not.toContain('opaque-root'); expect(html).not.toContain('opaque-scope'); expect(html).toContain('incluyen el ancla temporal')
})
