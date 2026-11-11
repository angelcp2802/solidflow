import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyMovementPanel, { assemblyMotionMatches, assemblyMovementMotion } from './AssemblyMovementPanel'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyComponentMotion } from '../model/assemblyMotion'
import type { AssemblyMotionWitness } from '../cad/kernel.assembly-solve'
import { identityRigidPose } from '../model/rigidPose'

// Original numeric intent and symbolic display DTOs only. No native station,
// accepted reply, Apply token, browser interaction or continuous path is seeded.
const component: AssemblyComponentReference = { occurrencePath: ['original-sub', 'original-shaft'], definition: { id: 'original-shaft-source', revision: 'r1' } }
const scope = { id: 'original-sub-source', revision: 's1' }
function request(degrees = '720'): AssemblyComponentMotion { return assemblyMovementMotion(component, ['7', '-8', '9'], 2, degrees) }
function witness(): AssemblyMotionWitness {
  const input = request(), pose = { ...identityRigidPose(), translation: [...input.translation] as [number, number, number] }
  return { frame: 'local', component: structuredClone(component), drivenComponent: structuredClone(component), scope: { ...scope }, targetPose: pose, resolvedPose: structuredClone(pose),
    affectedPaths: [['original-sub', 'original-shaft']], lengthResidual: 0, lengthTolerance: 1e-6, angleResidual: 0, angleTolerance: 1e-8, temporaryAnchor: true,
    axis: 2, requestedAngle: 4 * Math.PI, evaluatedAngle: 4 * Math.PI, stationCount: 12, verifiedStations: 12,
    maxAngularStep: Math.PI / 3, sampledOnly: true, windingResidual: 0, windingTolerance: 1e-8 }
}
it.each([{ degrees: '720', radians: 4 * Math.PI }, { degrees: '-450', radians: -2.5 * Math.PI }])('retains the complete signed $degrees-degree increment without a quaternion endpoint', ({ degrees, radians }) => {
  const before = JSON.stringify(component), result = request(degrees)
  expect(result.rotation).toEqual({ axis: 2, angle: radians }); expect(result.translation).toEqual([7, -8, 9])
  expect(Object.keys(result).sort()).toEqual(['component', 'rotation', 'translation']); expect(Object.hasOwn(result, 'pose')).toBe(false)
  result.component.occurrencePath[0] = 'changed'; result.component.definition.revision = 'changed'; result.translation[0] = 999
  expect(JSON.stringify(component)).toBe(before)
})
it.each([0, 1, 2])('preserves intrinsic local axis %s in plain intent', axis => {
  expect(assemblyMovementMotion(component, ['1', '2', '3'], axis, '180').rotation).toEqual({ axis, angle: Math.PI })
})
it.each([
  { label: 'empty X', position: ['', '2', '3'], degrees: '0' }, { label: 'blank Y', position: ['1', ' ', '3'], degrees: '0' },
  { label: 'nonfinite Z', position: ['1', '2', 'Infinity'], degrees: '0' }, { label: 'empty angle', position: ['1', '2', '3'], degrees: '' },
  { label: 'blank angle', position: ['1', '2', '3'], degrees: ' ' }, { label: 'nonfinite angle', position: ['1', '2', '3'], degrees: 'NaN' },
])('rejects $label without replacing missing intent with zero', ({ position, degrees }) => {
  expect(() => assemblyMovementMotion(component, [position[0], position[1], position[2]], 2, degrees)).toThrow('finito')
})
it.each([3, -1, NaN])('rejects unsupported local axis %s before motion submission', axis => {
  expect(() => assemblyMovementMotion(component, ['1', '2', '3'], axis, '720')).toThrow('eje local')
})
it('enforces the existing 128-station envelope without truncating an excessive typed angle', () => {
  expect(assemblyMovementMotion(component, ['1', '2', '3'], 2, '7680').rotation.angle).toBeCloseTo(128 * Math.PI / 3, 12)
  for (const angle of ['7680.01', '-7680.01', '1e100']) expect(() => request(angle)).toThrow('128 estaciones')
})
it('rejects a nonzero degree value that would underflow to a zero-radian request', () => {
  expect(() => request('5e-324')).toThrow('precisión representable')
})
it('binds a complete two-turn witness to the exact source scope and request without granting Apply authority', () => {
  const value = witness(), input = request(), before = JSON.stringify({ value, input })
  expect(assemblyMotionMatches(value, input, scope, identityRigidPose())).toBe(true); expect(assemblyMotionMatches(undefined, input, scope, identityRigidPose())).toBe(false)
  expect(JSON.stringify({ value, input })).toBe(before); expect(Object.hasOwn(value, 'token')).toBe(false)
})
it.each([
  { label: 'leaf suffix', change: (value: AssemblyMotionWitness) => { value.component.occurrencePath = ['original-shaft'] } },
  { label: 'selected revision', change: (value: AssemblyMotionWitness) => { value.component.definition.revision = 'stale' } },
  { label: 'driven component', change: (value: AssemblyMotionWitness) => { value.drivenComponent.occurrencePath = ['another-owner'] } },
  { label: 'scope revision', change: (value: AssemblyMotionWitness) => { value.scope.revision = 'stale' } },
  { label: 'local axis', change: (value: AssemblyMotionWitness) => { value.axis = 1 } },
  { label: 'quaternion-equivalent zero request', change: (value: AssemblyMotionWitness) => { value.requestedAngle = 0; value.evaluatedAngle = 0 } },
  { label: 'target translation', change: (value: AssemblyMotionWitness) => { value.targetPose.translation[0] = 8 } },
  { label: 'contradictory target rotation', change: (value: AssemblyMotionWitness) => { value.targetPose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] } },
  { label: 'contradictory resolved rotation', change: (value: AssemblyMotionWitness) => { value.resolvedPose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] } },
  { label: 'target and resolved rotated together', change: (value: AssemblyMotionWitness) => { value.targetPose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]; value.resolvedPose.rotation = [...value.targetPose.rotation] } },
  { label: 'incorrect small pose residual', change: (value: AssemblyMotionWitness) => { value.resolvedPose.rotation = [0, 0, Math.sin(5e-10), Math.cos(5e-10)]; value.angleResidual = 0 } },
  { label: 'unreached translation', change: (value: AssemblyMotionWitness) => { value.resolvedPose.translation[0] += .01 } },
  { label: 'incomplete stations', change: (value: AssemblyMotionWitness) => { value.verifiedStations = 11 } },
  { label: 'fractional station count', change: (value: AssemblyMotionWitness) => { value.stationCount = 12.5 } },
  { label: 'larger angular step', change: (value: AssemblyMotionWitness) => { value.maxAngularStep = Math.PI / 2 } },
  { label: 'continuous-path assertion', change: (value: AssemblyMotionWitness) => { value.sampledOnly = false as true } },
  { label: 'unmeasured winding error', change: (value: AssemblyMotionWitness) => { value.evaluatedAngle = 0 } },
  { label: 'excessive winding residual', change: (value: AssemblyMotionWitness) => { value.evaluatedAngle += .1; value.windingResidual = Math.abs(value.evaluatedAngle - value.requestedAngle) } },
  { label: 'nonfinite winding residual', change: (value: AssemblyMotionWitness) => { value.windingResidual = NaN } },
  { label: 'relaxed angle tolerance', change: (value: AssemblyMotionWitness) => { value.angleTolerance = .01; value.windingTolerance = .01 } },
  { label: 'missing temporary anchor', change: (value: AssemblyMotionWitness) => { value.temporaryAnchor = false as true } },
])('rejects a different or incomplete $label instead of accepting the same final quaternion', ({ change }) => {
  const value = witness(); change(value); expect(assemblyMotionMatches(value, request(), scope, identityRigidPose())).toBe(false)
})
it('displays complete turns, verified stations and winding error separately from final-pose residuals', () => {
  const value = witness(), callback = vi.fn(), before = JSON.stringify(value)
  const html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={identityRigidPose()} resetKey={3} name="Original shaft" scopeName="Original scope"
    fixed={false} suppressed={false} disabled motionWitness={value} onPreview={callback} />)
  expect(html).toContain('aria-label="Continuación angular del movimiento"'); expect(html).toContain('Giro solicitado: 720° · 2 vueltas')
  expect(html).toContain('Giro evaluado: 720° · 2 vueltas'); expect(html).toContain('12 de 12 estaciones verificadas · paso angular máximo 60°')
  expect(html).toContain('Error de continuación:'); expect(html).toContain('Error angular de pose final:'); expect(html).toContain('Error de posición final:')
  expect(html).toContain('estaciones discretas'); expect(html).toContain('colisiones requieren comprobaciones independientes')
  expect(html).toContain('incluyen el ancla temporal'); expect(html).not.toContain('0 grados de libertad'); expect(html).toContain('vuelve a Resolver')
  expect(callback).not.toHaveBeenCalled(); expect(JSON.stringify(value)).toBe(before)
})
it('displays a negative increment beyond one turn without normalizing its text', () => {
  const value = witness(); value.requestedAngle = -2.5 * Math.PI; value.evaluatedAngle = value.requestedAngle; value.stationCount = 8; value.verifiedStations = 8
  value.targetPose.rotation = [0, 0, -Math.SQRT1_2, Math.SQRT1_2]; value.resolvedPose.rotation = [...value.targetPose.rotation]
  const html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={identityRigidPose()} name="Original shaft" scopeName="Original scope"
    fixed={false} suppressed={false} disabled motionWitness={value} onPreview={() => undefined} />)
  expect(html).toContain('Giro solicitado: -450° · -1.25 vueltas'); expect(html).toContain('Giro evaluado: -450° · -1.25 vueltas')
})
it('retains legacy witness rendering without fabricating continuation measurements', () => {
  const value = witness(), { axis: _axis, requestedAngle: _request, evaluatedAngle: _evaluated, stationCount: _count, verifiedStations: _verified,
    maxAngularStep: _step, sampledOnly: _sampled, windingResidual: _residual, windingTolerance: _tolerance, ...legacy } = value
  const html = renderToStaticMarkup(<AssemblyMovementPanel component={component} pose={identityRigidPose()} name="Original shaft" scopeName="Original scope"
    fixed={false} suppressed={false} disabled witness={legacy} onPreview={() => undefined} />)
  expect(html).toContain('Posición resuelta local:'); expect(html).not.toContain('aria-label="Continuación angular del movimiento"')
})
