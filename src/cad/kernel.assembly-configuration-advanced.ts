import { assemblyLinePathFollowAxis, assemblyLinePathRollAxis, coordinateAssemblyLinePathPosition, validateAssemblyLinePathOrientation } from '../model/assemblyLinePathMate'
import { validateAssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { validateAssemblyPathBands } from '../model/assemblyPathReferences'
import { copyRigidProfileCenterConstraint } from '../model/assemblyProfileCenterNumeric'
import { copyRigidLinePathConstraint } from '../model/assemblyLinePathNumeric'
import { copyRigidCircularPathConstraint } from '../model/assemblyCircularPathNumeric'
import { transformRigidDirection, type RigidPose } from '../model/rigidPose'
import type { NumericProfileCenterSupport, RigidMateConstraint, RigidMateEndpoint, RigidProfileCenterEndpoint, RigidLinePathConstraint, RigidCircularPathConstraint } from '../model/assemblySolveTypes'
import { configuredAssemblyEndpoint, configuredAssemblyEndpointFrame } from './kernel.assembly-configuration-endpoints'
import { assertConfiguredAssemblyScopedRelation, type ConfiguredAssemblyNumericalScope } from './kernel.assembly-configuration-scope'
import { assemblyConfigurationPlacementArithmetic, AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput, type AssemblyConfigurationWitness,
  type ConfiguredProfileWitness, type ConfiguredProfileAxisWitness, type ConfiguredDirectionWitness } from './kernel.assembly-configuration-snapshot'
import type { ConfiguredResolvedProfileCenterMate, ConfiguredResolvedLinePathMate, ConfiguredResolvedCircularPathMate } from './kernel.assembly-configuration-relations'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

export type ConfiguredAssemblyAdvancedMate = ConfiguredResolvedProfileCenterMate | ConfiguredResolvedLinePathMate | ConfiguredResolvedCircularPathMate
export interface ConfiguredAssemblyAdvancedOptions { lengthToleranceMm?: number; angleToleranceRad?: number }
type ProfileWitness = ConfiguredProfileWitness | ConfiguredProfileAxisWitness
const ROUND = 128 * Number.EPSILON, MIN = 2 ** -1022
const intrinsicRelation = AssemblyConfigurationGeometrySnapshot.prototype.assertResolvedMate
const intrinsicWitness = AssemblyConfigurationGeometrySnapshot.prototype.assertWitness
const intrinsicArcEvaluation = AssemblyConfigurationGeometrySnapshot.prototype.evaluateArcPathSelection
const intrinsicDispose = AssemblyConfigurationGeometrySnapshot.prototype.dispose
const vector = (v: readonly number[]): Vec3 => [v[0], v[1], v[2]]
const add = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x + b[i]) as Vec3
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((x, i) => x - b[i]) as Vec3
const mul = (v: Vec3, s: number): Vec3 => v.map(x => x * s) as Vec3
const norm = (v: readonly number[]) => Math.hypot(...v)
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const angle = (a: Vec3, b: Vec3) => Math.atan2(norm(cross(a, b)), dot(a, b))
const chord = (v: number) => 2 * Math.sin(Math.min(v, Math.PI) / 2)
const retainedNumber = (v: number) => Number.isFinite(v) && (v === 0 || Math.abs(v) >= MIN)
const finiteOrNull = (v: number | null): number | null => v === null || Number.isFinite(v) ? v : null
function bands(options: ConfiguredAssemblyAdvancedOptions) {
  const checked = validateAssemblyPathBands(options)
  return { lengthToleranceMm: checked.lengthToleranceMm ?? 1e-6, angleToleranceRad: checked.angleToleranceRad ?? 1e-8 }
}
type Bands = ReturnType<typeof bands>
function profileMate(value: ConfiguredAssemblyAdvancedMate): value is ConfiguredResolvedProfileCenterMate { return value.mate.type === 'profile-center' }
function lineMate(value: ConfiguredAssemblyAdvancedMate): value is ConfiguredResolvedLinePathMate { return value.mate.type === 'line-path' }
function assertAdvanced(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, value: ConfiguredAssemblyAdvancedMate) {
  intrinsicRelation.call(snapshot, value, input)
  if (value.mate.type !== 'profile-center' && value.mate.type !== 'line-path' && value.mate.type !== 'circular-path') throw Error('A configured advanced relation is required.')
  if (value.suppressed) throw Error('A suppressed configured relation is not an active numerical constraint.')
}
function budget(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, witness: AssemblyConfigurationWitness) {
  intrinsicWitness.call(snapshot, witness, input)
  const arithmetic = assemblyConfigurationPlacementArithmetic(witness, input)
  return { ...arithmetic, round: ROUND * (arithmetic.depth + 1) }
}
function pose(witness: AssemblyConfigurationWitness): RigidPose {
  return { translation: vector(witness.declaredWorldPose.translation), rotation: [...witness.declaredWorldPose.rotation] }
}
function direction(witness: AssemblyConfigurationWitness, local: readonly number[]): Vec3 { return transformRigidDirection(pose(witness), vector(local)) }
function relativePoint(witness: AssemblyConfigurationWitness, local: readonly number[], origin: readonly number[]): Vec3 {
  return add(direction(witness, local), witness.declaredWorldPose.translation.map((x, i) => x - origin[i]) as Vec3)
}
function profileInput(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, witness: ProfileWitness): NumericProfileCenterSupport {
  const local = witness.kind === 'configured-profile-axis' ? witness.localSupport.profile : witness.localSupport
  const b = budget(snapshot, input, witness)
  const common = { center: vector(local.center), normal: vector(local.normal),
    positionErrorMm: local.uncertainty.positionErrorMm + b.round * (b.placementSum + norm(local.center)), normalErrorRad: local.uncertainty.normalErrorRad + b.round }
  if (witness.kind === 'configured-profile-axis') return { ...common, kind: 'rectangle', xDirection: vector(witness.localSupport.xDirection), xDirectionErrorRad: witness.localSupport.xDirectionErrorRad + b.round }
  if (local.kind !== 'circle') throw Error('A rectangular configured profile requires its explicit material boundary axis.')
  return { ...common, kind: 'circle' }
}
function upEndpoint(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, up: ConfiguredDirectionWitness | undefined, scope?: ConfiguredAssemblyNumericalScope): RigidMateEndpoint {
  if (!up || up.kind !== 'configured-direction' || up.origin !== 'native-face' || up.localSupport.kind !== 'plane') throw Error('Configured UP requires a current material planar-face direction.')
  return configuredAssemblyEndpoint(snapshot, input, up, scope)
}
function finiteBudget(values: number[], lengthError: number, angleErrors: number[], policy: Bands) {
  if (!values.every(Number.isFinite) || ![lengthError, ...angleErrors].every(x => Number.isFinite(x) && x >= 0)
    || lengthError > policy.lengthToleranceMm || angleErrors.some(x => x > policy.angleToleranceRad)) throw new RangeError('Configured native input cannot retain the requested numerical bands.')
}

/** Current configured proofs -> detached numerical data. Effective descendant
 * frames retain their actual full-root owners. No legacy proof, saved writeback,
 * solver result, or Apply capability is created here. */
export function buildConfiguredAssemblyAdvancedConstraint(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  value: ConfiguredAssemblyAdvancedMate, id: string, options: ConfiguredAssemblyAdvancedOptions = {}, scope?: ConfiguredAssemblyNumericalScope): RigidMateConstraint {
  const policy = bands(options)
  assertAdvanced(snapshot, input, value)
  if (scope !== undefined) assertConfiguredAssemblyScopedRelation(snapshot, input, scope, value)
  let result: RigidMateConstraint
  if (profileMate(value)) {
    const first: RigidProfileCenterEndpoint = { ...configuredAssemblyEndpointFrame(snapshot, input, value.first, scope), profile: profileInput(snapshot, input, value.first) }
    const second: RigidProfileCenterEndpoint = { ...configuredAssemblyEndpointFrame(snapshot, input, value.second, scope), profile: profileInput(snapshot, input, value.second) }
    const a = first.profile, b = second.profile
    const pe = a.positionErrorMm + b.positionErrorMm + Math.abs(value.mate.offsetMm) * a.normalErrorRad
      + ROUND * (norm(a.center) + norm(b.center) + Math.abs(value.mate.offsetMm))
    const ne = a.normalErrorRad + b.normalErrorRad + ROUND
    const xe = a.kind === 'rectangle' && b.kind === 'rectangle' ? a.xDirectionErrorRad + b.xDirectionErrorRad + a.normalErrorRad + ROUND : 0
    finiteBudget([pe, ne, xe], pe, [ne, xe], policy)
    result = copyRigidProfileCenterConstraint({ id, type: 'profile-center', first, second, alignment: value.mate.alignment, offsetMm: value.mate.offsetMm, orientation: structuredClone(value.mate.orientation) })
  } else if (lineMate(value)) {
    const local = value.second.localCurve, pa = budget(snapshot, input, value.first), pb = budget(snapshot, input, value.second)
    const first = configuredAssemblyEndpoint(snapshot, input, value.first, scope)
    if (first.support?.kind !== 'point') throw Error('A configured LINE path requires a current material point.')
    first.support = { ...first.support, tolerance: value.first.localSupport.tolerance + pa.round * (pa.placementSum + norm(value.first.localSupport.point)) }
    const coordinateMm = coordinateAssemblyLinePathPosition(value.mate.position, local.lengthMm), p = value.mate.position
    const coefficient = p.mode === 'free' ? 0 : p.mode === 'distance' ? (p.reverse ? 1 : 0) : Math.abs(p.reverse ? 1 - p.percent / 100 : p.percent / 100)
    const second = { ...configuredAssemblyEndpointFrame(snapshot, input, value.second, scope), line: { start: vector(local.startPoint), direction: mul(vector(local.increasingDirection), local.sense), lengthMm: local.lengthMm,
      positionErrorMm: local.precision.positionMm + pb.round * (pb.placementSum + norm(local.startPoint)) + coefficient * local.precision.lengthMm,
      directionErrorRad: local.precision.tangentRad + pb.round, lengthErrorMm: local.precision.lengthMm } }
    const orientation = validateAssemblyLinePathOrientation(value.mate.orientation), axis = assemblyLinePathFollowAxis(orientation), rollAxis = assemblyLinePathRollAxis(orientation)
    const follow = axis ? { axis, reverse: typeof value.mate.orientation.pitchYaw === 'object' && value.mate.orientation.pitchYaw.reverse, directionErrorRad: pa.round } : undefined
    let roll: RigidLinePathConstraint['roll']
    if (rollAxis) {
      if (!value.up || typeof value.mate.orientation.roll !== 'object') throw Error('Missing current configured UP proof.')
      const guide = upEndpoint(snapshot, input, value.up, scope), pg = budget(snapshot, input, value.up)
      roll = { axis: rollAxis, reverse: value.mate.orientation.roll.reverse, guide, directionErrorRad: pa.round, guideDirectionErrorRad: pg.round }
    }
    const pe = first.support.tolerance + second.line.positionErrorMm + Math.abs(coordinateMm ?? 0) * second.line.directionErrorRad
    finiteBudget([pe, second.line.lengthMm], pe, [second.line.directionErrorRad, ...(follow ? [follow.directionErrorRad] : []), ...(roll ? [roll.directionErrorRad, roll.guideDirectionErrorRad] : [])], policy)
    result = copyRigidLinePathConstraint({ id, type: 'line-path', first, second, coordinateMm, ...(follow ? { follow } : {}), ...(roll ? { roll } : {}) })
  } else {
    const arc = value.second.localCurve, pa = budget(snapshot, input, value.first), pb = budget(snapshot, input, value.second)
    if (!arc.materialFrame || arc.arithmetic.referenceModel !== 'current-native-analytic-float64') throw Error('Current configured analytic circle arithmetic is required.')
    const first: RigidMateEndpoint = { ...configuredAssemblyEndpointFrame(snapshot, input, value.first, scope), support: { kind: 'point', point: vector(value.first.localSupport.point), tolerance: pa.round * (pa.placementSum + norm(value.first.localSupport.point)) } }
    const positionErrorMm = arc.arithmetic.positionMm + pb.round * (pb.placementSum + norm(arc.center)), frameErrorRad = arc.arithmetic.frameRad + pb.round
    const sweepRad = arc.parameterDomain.last - arc.parameterDomain.first
    const orientation = validateAssemblyLinePathOrientation(value.mate.orientation), axis = assemblyLinePathFollowAxis(orientation), rollAxis = assemblyLinePathRollAxis(orientation)
    const follow = axis ? { axis, reverse: typeof value.mate.orientation.pitchYaw === 'object' && value.mate.orientation.pitchYaw.reverse, directionErrorRad: pa.round } : undefined
    let roll: RigidCircularPathConstraint['roll']
    if (rollAxis) {
      if (!value.up || value.up.localSupport.kind !== 'plane' || typeof value.mate.orientation.roll !== 'object') throw Error('Missing current configured circular UP proof.')
      const pg = budget(snapshot, input, value.up)
      roll = { axis: rollAxis, reverse: value.mate.orientation.roll.reverse, directionErrorRad: pa.round,
        guideDirectionErrorRad: pg.round + Math.abs(norm(value.up.localSupport.normal) - 1), guide: upEndpoint(snapshot, input, value.up, scope) }
    }
    const error = first.support!.tolerance + positionErrorMm + arc.arithmetic.radiusMm + (arc.radiusMm + arc.arithmetic.radiusMm) * chord(frameErrorRad + arc.arithmetic.sweepRad)
    finiteBudget([error, arc.radiusMm, sweepRad], error, [frameErrorRad, arc.arithmetic.sweepRad, ...(follow ? [follow.directionErrorRad] : []), ...(roll ? [roll.directionErrorRad, roll.guideDirectionErrorRad] : [])], policy)
    if (arc.radiusMm - arc.arithmetic.radiusMm <= 0 || sweepRad - arc.arithmetic.sweepRad <= 0 || sweepRad + arc.arithmetic.sweepRad >= 2 * Math.PI) throw new RangeError('Configured circular trim cannot retain its proper domain.')
    if (value.mate.position.mode === 'coordinate' && value.mate.position.distanceMm > arc.lengthMm) throw new RangeError('Configured fixed coordinate exceeds the actual native material trim.')
    result = copyRigidCircularPathConstraint({ id, type: 'circular-path', first,
      second: { ...configuredAssemblyEndpointFrame(snapshot, input, value.second, scope), arc: { center: vector(arc.center), radial: vector(arc.materialFrame.radial), tangent: vector(arc.materialFrame.tangent), radiusMm: arc.radiusMm, sweepRad,
        positionErrorMm, radiusErrorMm: arc.arithmetic.radiusMm, frameErrorRad, sweepErrorRad: arc.arithmetic.sweepRad } }, position: structuredClone(value.mate.position), ...(follow ? { follow } : {}), ...(roll ? { roll } : {}) })
  }
  assertAdvanced(snapshot, input, value)
  if (scope !== undefined) assertConfiguredAssemblyScopedRelation(snapshot, input, scope, value)
  return result
}

function metadata(value: ConfiguredAssemblyAdvancedMate, policy: Bands) {
  return { mateId: value.mate.id, scopePath: [...value.scopePath], scope: { ...value.scope }, configuration: value.configuration,
    configurationAncestry: structuredClone(value.configurationAncestry), bands: policy, verificationOnly: true as const, compatibilityAuthority: false as const }
}
function profileMeasurement(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, value: ConfiguredResolvedProfileCenterMate, policy: Bands) {
  const origin = value.first.declaredWorldPose.translation
  const observe = (w: ProfileWitness) => {
    const axis = w.kind === 'configured-profile-axis' ? w.localSupport : null, p = w.kind === 'configured-profile-axis' ? w.localSupport.profile : w.localSupport
    const b = budget(snapshot, input, w), center = relativePoint(w, p.center, origin), normal = direction(w, p.normal), x = axis ? direction(w, axis.xDirection) : null
    return { center, normal, x, kind: p.kind, pe: p.uncertainty.positionErrorMm + b.round * (b.placementSum + norm(p.center) + norm(origin) + norm(center)), ne: p.uncertainty.normalErrorRad + b.round, xe: axis ? axis.xDirectionErrorRad + b.round : 0 }
  }
  const a = observe(value.first), b = observe(value.second), defect = sub(sub(b.center, a.center), mul(a.normal, value.mate.offsetMm))
  const positionResidualMm = norm(defect), normalAngleRadians = angle(mul(a.normal, value.mate.alignment === 'aligned' ? 1 : -1), b.normal)
  let rectangleAngleRadians: number | null = null
  if (value.mate.orientation.mode === 'rectangle') {
    if (!a.x || !b.x || a.kind !== 'rectangle' || b.kind !== 'rectangle') throw Error('Current explicit configured rectangular axes are required.')
    const q = value.mate.orientation.quarterTurns, c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q]
    rectangleAngleRadians = angle(add(mul(a.x, c), mul(cross(a.normal, a.x), s)), b.x)
  }
  const precision = { positionMm: a.pe + b.pe + Math.abs(value.mate.offsetMm) * a.ne + ROUND * (norm(a.center) + norm(b.center) + Math.abs(value.mate.offsetMm) + positionResidualMm), normalRad: a.ne + b.ne + ROUND, rectangleRad: a.x && b.x ? a.xe + b.xe + a.ne + ROUND : null }
  const all = [value.mate.offsetMm, ...a.center, ...b.center, ...defect, positionResidualMm, normalAngleRadians, ...(rectangleAngleRadians === null ? [] : [rectangleAngleRadians]), ...Object.values(precision).filter((x): x is number => x !== null)]
  const nominal = positionResidualMm <= policy.lengthToleranceMm && normalAngleRadians <= policy.angleToleranceRad && (rectangleAngleRadians === null || rectangleAngleRadians <= policy.angleToleranceRad)
  const retained = positionResidualMm + precision.positionMm <= policy.lengthToleranceMm && normalAngleRadians + precision.normalRad <= policy.angleToleranceRad
    && (rectangleAngleRadians === null || rectangleAngleRadians + precision.rectangleRad! <= policy.angleToleranceRad)
  const precise = all.every(retainedNumber) && precision.positionMm <= policy.lengthToleranceMm && precision.normalRad <= policy.angleToleranceRad && (precision.rectangleRad === null || precision.rectangleRad <= policy.angleToleranceRad) && !(nominal && !retained)
  const result = { ...metadata(value, policy), family: 'profile-center' as const, coordinateFrame: 'world-axes-relative-to-first-placement' as const,
    componentPaths: { first: [...value.first.componentPath], second: [...value.second.componentPath] }, profileKinds: { first: a.kind, second: b.kind }, alignment: value.mate.alignment, offsetMm: value.mate.offsetMm, orientation: structuredClone(value.mate.orientation),
    positionResidualMm: finiteOrNull(positionResidualMm), normalAngleRadians: finiteOrNull(normalAngleRadians), rectangleAngleRadians: finiteOrNull(rectangleAngleRadians), precision: { positionMm: finiteOrNull(precision.positionMm), normalRad: finiteOrNull(precision.normalRad), rectangleRad: finiteOrNull(precision.rectangleRad) } }
  return precise ? { ...result, status: 'ok' as const, satisfied: retained } : { ...result, status: 'precisionLimit' as const, satisfied: false as const, message: 'Configured profile composition cannot retain the requested numerical bands.' }
}

type PathMate = ConfiguredResolvedLinePathMate | ConfiguredResolvedCircularPathMate
function followMeasurement(value: PathMate, tangent: Vec3 | null, tangentError: number, pointRound: number) {
  const axis = assemblyLinePathFollowAxis(validateAssemblyLinePathOrientation(value.mate.orientation))
  if (axis === null) return { residual: null, error: null }
  const observed = direction(value.first, axis), reverse = typeof value.mate.orientation.pitchYaw === 'object' && value.mate.orientation.pitchYaw.reverse
  return { residual: tangent ? angle(observed, mul(tangent, reverse ? -1 : 1)) : null, error: tangentError + pointRound + Math.abs(norm(observed) - 1) }
}
function rollMeasurement(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, value: PathMate, tangent: Vec3 | null, tangentError: number, pointRound: number) {
  const axis = assemblyLinePathRollAxis(validateAssemblyLinePathOrientation(value.mate.orientation))
  if (axis === null) return { residual: null, error: null }
  const up = value.up
  if (!up || up.origin !== 'native-face' || up.localSupport.kind !== 'plane' || typeof value.mate.orientation.roll !== 'object') throw Error('Current configured UP material direction is missing.')
  if (tangent === null) return { residual: null, error: Infinity }
  const a = direction(value.first, axis), g = direction(up, up.localSupport.normal), pg = budget(snapshot, input, up)
  const project = (v: Vec3) => sub(v, mul(tangent, dot(tangent, v))), ap = project(a), gp = project(g), la = norm(ap), lg = norm(gp)
  const cone = (error: number, length: number) => { const change = chord(error) + Math.sin(Math.min(tangentError, Math.PI / 2)) + ROUND; return change < length ? Math.asin(change / length) : Infinity }
  const error = cone(pointRound + Math.abs(norm(a) - 1), la) + cone(pg.round + Math.abs(norm(g) - 1), lg) + ROUND
  return { residual: la > 0 && lg > 0 ? angle(mul(ap, 1 / la), mul(gp, (value.mate.orientation.roll.reverse ? -1 : 1) / lg)) : null, error }
}
function pathMetadata(value: PathMate, policy: Bands) {
  return { ...metadata(value, policy), componentPaths: { point: [...value.first.componentPath], path: [...value.second.componentPath], ...(value.up ? { up: [...value.up.componentPath] } : {}) },
    position: structuredClone(value.mate.position), orientation: structuredClone(value.mate.orientation), materialOrigin: true as const }
}
function lineMeasurement(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, value: ConfiguredResolvedLinePathMate, policy: Bands) {
  const pa = budget(snapshot, input, value.first), pb = budget(snapshot, input, value.second), local = value.second.localCurve, origin = value.first.declaredWorldPose.translation
  const p = relativePoint(value.first, value.first.localSupport.point, origin), start = relativePoint(value.second, local.startPoint, origin), tangent = direction(value.second, mul(vector(local.increasingDirection), local.sense)), delta = sub(p, start)
  const coordinateMm = dot(delta, tangent), targetCoordinateMm = coordinateAssemblyLinePathPosition(value.mate.position, local.lengthMm)
  const transverseResidualMm = norm(sub(delta, mul(tangent, coordinateMm))), coordinateResidualMm = targetCoordinateMm === null ? null : coordinateMm - targetCoordinateMm
  const positionResidualMm = targetCoordinateMm === null ? transverseResidualMm : norm(sub(delta, mul(tangent, targetCoordinateMm)))
  const pointError = value.first.localSupport.tolerance + pa.round * (pa.placementSum + norm(value.first.localSupport.point) + norm(origin) + norm(p))
  const pathError = local.precision.positionMm + pb.round * (pb.placementSum + norm(local.startPoint) + norm(origin) + norm(start)), directionErrorRad = local.precision.tangentRad + pb.round + Math.abs(norm(tangent) - 1)
  const position = value.mate.position, coefficient = position.mode === 'free' ? 0 : position.mode === 'distance' ? (position.reverse ? 1 : 0) : Math.abs(position.reverse ? 1 - position.percent / 100 : position.percent / 100)
  const positionErrorMm = pointError + pathError + (targetCoordinateMm === null ? norm(delta) : Math.abs(targetCoordinateMm)) * directionErrorRad + coefficient * local.precision.lengthMm
    + ROUND * (norm(p) + norm(start) + norm(delta) + Math.abs(targetCoordinateMm ?? 0))
  const follow = followMeasurement(value, tangent, directionErrorRad, pa.round), roll = rollMeasurement(snapshot, input, value, tangent, directionErrorRad, pa.round)
  const scalars = [...p, ...start, ...tangent, coordinateMm, local.lengthMm, transverseResidualMm, positionResidualMm, positionErrorMm, directionErrorRad, ...(targetCoordinateMm === null ? [] : [targetCoordinateMm, coordinateResidualMm!]), ...(follow.residual === null ? [] : [follow.residual])]
  const nominal = positionResidualMm <= policy.lengthToleranceMm && (follow.residual === null || follow.residual <= policy.angleToleranceRad) && (roll.residual === null || roll.residual <= policy.angleToleranceRad)
  const retained = positionResidualMm + positionErrorMm <= policy.lengthToleranceMm && (follow.error === null || follow.residual !== null && follow.residual + follow.error <= policy.angleToleranceRad)
    && (roll.error === null || roll.residual !== null && roll.residual + roll.error <= policy.angleToleranceRad)
  const precise = scalars.every(retainedNumber) && positionErrorMm <= policy.lengthToleranceMm && directionErrorRad <= policy.angleToleranceRad
    && (follow.error === null || Number.isFinite(follow.error) && follow.error <= policy.angleToleranceRad) && (roll.error === null || Number.isFinite(roll.error) && roll.error <= policy.angleToleranceRad) && !(nominal && !retained)
  const result = { ...pathMetadata(value, policy), family: 'line-path' as const, underlyingLine: true as const, curveLengthMm: local.lengthMm, coordinateMm: finiteOrNull(coordinateMm), targetCoordinateMm, transverseResidualMm: finiteOrNull(transverseResidualMm), coordinateResidualMm: finiteOrNull(coordinateResidualMm), positionResidualMm: finiteOrNull(positionResidualMm),
    orientationResidualRad: finiteOrNull(follow.residual), rollResidualRad: finiteOrNull(roll.residual), precision: { positionErrorMm: finiteOrNull(positionErrorMm), directionErrorRad: finiteOrNull(directionErrorRad), orientationErrorRad: finiteOrNull(follow.error), rollErrorRad: finiteOrNull(roll.error) } }
  return precise ? { ...result, status: 'ok' as const, satisfied: retained } : { ...result, status: 'precisionLimit' as const, satisfied: false as const, message: 'Configured LINE path measurement cannot retain the requested numerical bands.' }
}

function circularMeasurement(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, value: ConfiguredResolvedCircularPathMate, policy: Bands) {
  const point = value.first, path = value.second, arc = path.localCurve, radius = arc.radiusMm, sweep = arc.parameterDomain.last - arc.parameterDomain.first, length = radius * sweep
  if (!Number.isFinite(length) || length <= 0 || sweep <= 0 || sweep >= 2 * Math.PI) throw new RangeError('The current configured material arc has no proper finite trim.')
  const targetCoordinateMm = value.mate.position.mode === 'coordinate' ? value.mate.position.distanceMm : null
  if (targetCoordinateMm !== null && (targetCoordinateMm > length || targetCoordinateMm > arc.lengthMm)) throw new RangeError('Configured fixed coordinate exceeds the actual native material trim.')
  // A fixed coordinate retains its own current native D1 query and arithmetic;
  // no symbolic circle point is substituted for that finite native evaluation.
  const evaluated = targetCoordinateMm === null ? null : intrinsicArcEvaluation.call(snapshot, input, validateAssemblyArcPathSelection(value.mate.path), { kind: 'arc-length', distanceMm: targetCoordinateMm }, value.scopePath, policy)
  const pa = budget(snapshot, input, point), pb = budget(snapshot, input, path), origin = point.declaredWorldPose.translation
  const p = relativePoint(point, point.localSupport.point, origin), center = relativePoint(path, arc.center, origin), delta = sub(p, center)
  const u = direction(path, arc.materialFrame.radial), v = direction(path, arc.materialFrame.tangent), n = direction(path, arc.materialFrame.normal), magnitude = norm(delta)
  const pointError = pa.round * (pa.placementSum + norm(point.localSupport.point) + norm(origin) + norm(p))
  const centerError = arc.arithmetic.positionMm + pb.round * (pb.placementSum + norm(arc.center) + norm(origin) + norm(center))
  const frameError = arc.arithmetic.frameRad + pb.round + Math.abs(norm(u) - 1) + Math.abs(norm(v) - 1) + Math.abs(norm(n) - 1), radiusError = arc.arithmetic.radiusMm, sweepError = arc.arithmetic.sweepRad
  if (arc.arithmetic.referenceModel !== 'current-native-analytic-float64') throw Error('Current configured analytic circle arithmetic is required.')
  const arithmetic = ROUND * (magnitude + radius + 1), z = dot(n, delta), planar = sub(delta, mul(n, z)), rho = norm(planar)
  let coordinateMm: number | null = null, domainMarginsMm: { minimum: number; maximum: number } | null = null, domainMarginErrorMm: number | null = null
  let positionResidualMm: number, positionErrorMm: number, tangent: Vec3 | null = null, tangentErrorRad: number
  if (evaluated) {
    const observed = evaluated.localEvaluation, target = relativePoint(evaluated, observed.point, origin)
    if (observed.arithmetic.referenceModel !== 'current-native-analytic-float64' || ![observed.arithmetic.positionMm, observed.arithmetic.tangentRad].every(x => Number.isFinite(x) && x > 0 && x >= MIN)) throw new RangeError('Current configured native D1 arithmetic is unavailable.')
    tangent = direction(evaluated, observed.tangent); coordinateMm = targetCoordinateMm; positionResidualMm = norm(sub(p, target))
    const minimumRadius = radius - radiusError, phase = targetCoordinateMm! / radius, phaseError = minimumRadius > 0 ? Math.abs(phase) * radiusError / minimumRadius + ROUND * (1 + Math.abs(phase)) : Infinity
    positionErrorMm = pointError + observed.arithmetic.positionMm + pb.round * (pb.placementSum + norm(observed.point) + norm(origin) + norm(target)) + radiusError + (radius + radiusError) * chord(frameError + phaseError) + arithmetic
    tangentErrorRad = observed.arithmetic.tangentRad + frameError + phaseError + Math.abs(norm(tangent) - 1)
  } else {
    const half = sweep / 2, mid = add(mul(u, Math.cos(half)), mul(v, Math.sin(half))), side = add(mul(u, -Math.sin(half)), mul(v, Math.cos(half)))
    const alpha = Math.atan2(dot(side, planar), dot(mid, planar)), theta = alpha + half
    coordinateMm = rho > 0 ? radius * theta : null
    if (rho > 0) tangent = cross(n, mul(planar, 1 / rho))
    const coefficientError = Math.SQRT2 * (pointError + centerError + magnitude * chord(frameError) + arithmetic)
    const phaseError = coefficientError < rho ? Math.asin(coefficientError / rho) + ROUND : Infinity
    if (!(coefficientError < rho)) { coordinateMm = null; tangent = null }
    tangentErrorRad = frameError + phaseError + ROUND
    if (value.mate.position.mode !== 'free') throw Error('Missing current configured fixed evaluation.')
    if (value.mate.position.domain === 'trim') {
      const first = add(center, mul(u, radius)), last = add(center, mul(add(mul(u, Math.cos(sweep)), mul(v, Math.sin(sweep))), radius))
      positionResidualMm = theta >= 0 && theta <= sweep ? Math.hypot(z, rho - radius) : Math.min(norm(sub(p, first)), norm(sub(p, last)))
      domainMarginsMm = { minimum: radius * (half + alpha), maximum: radius * (half - alpha) }
      domainMarginErrorMm = (radius + radiusError) * (phaseError + sweepError) + radiusError * (Math.abs(alpha) + half) + arithmetic
      if (Math.PI - Math.abs(alpha) <= phaseError + sweepError / 2 + ROUND) { coordinateMm = null; domainMarginErrorMm = Infinity }
    } else positionResidualMm = Math.hypot(z, rho - radius)
    positionErrorMm = pointError + centerError + radiusError + (radius + radiusError) * chord(frameError + (value.mate.position.domain === 'trim' ? sweepError : 0)) + arithmetic
  }
  const follow = followMeasurement(value, tangent, tangentErrorRad, pa.round), roll = rollMeasurement(snapshot, input, value, tangent, tangentErrorRad, pa.round)
  const finiteValues = [...p, ...center, ...u, ...v, ...n, radius, sweep, length, positionResidualMm, positionErrorMm, frameError, radiusError, sweepError]
  const nominalPosition = positionResidualMm <= policy.lengthToleranceMm, nominalDomain = domainMarginsMm === null || Object.values(domainMarginsMm).every(x => x >= -policy.lengthToleranceMm)
  const retainedPosition = positionResidualMm + positionErrorMm <= policy.lengthToleranceMm, retainedDomain = domainMarginsMm === null || Object.values(domainMarginsMm).every(x => x - domainMarginErrorMm! >= -policy.lengthToleranceMm)
  const nominalAngles = (follow.residual === null || follow.residual <= policy.angleToleranceRad) && (roll.residual === null || roll.residual <= policy.angleToleranceRad)
  const retainedAngles = (follow.error === null || follow.residual !== null && follow.residual + follow.error <= policy.angleToleranceRad) && (roll.error === null || roll.residual !== null && roll.residual + roll.error <= policy.angleToleranceRad)
  const errorFits = finiteValues.every(retainedNumber) && positionErrorMm <= policy.lengthToleranceMm && radius > radiusError && Number.isFinite(tangentErrorRad) && tangentErrorRad <= policy.angleToleranceRad
    && (domainMarginsMm === null || Number.isFinite(domainMarginErrorMm)) && (coordinateMm === null || Number.isFinite(coordinateMm))
    && (follow.error === null || Number.isFinite(follow.error) && follow.error <= policy.angleToleranceRad) && (roll.error === null || Number.isFinite(roll.error) && roll.error <= policy.angleToleranceRad)
  const precise = errorFits && !(nominalPosition && nominalDomain && nominalAngles && (!retainedPosition || !retainedDomain || !retainedAngles))
  if (evaluated) intrinsicWitness.call(snapshot, evaluated, input)
  const result = { ...pathMetadata(value, policy), family: 'circular-path' as const, radiusMm: radius, sweepRad: sweep, curveLengthMm: arc.lengthMm, coordinateMm: finiteOrNull(coordinateMm), targetCoordinateMm, positionResidualMm: finiteOrNull(positionResidualMm),
    orientationResidualRad: finiteOrNull(follow.residual), rollResidualRad: finiteOrNull(roll.residual), domainMarginsMm: domainMarginsMm === null ? null : { minimum: finiteOrNull(domainMarginsMm.minimum), maximum: finiteOrNull(domainMarginsMm.maximum) }, precision: { positionErrorMm: finiteOrNull(positionErrorMm), tangentErrorRad: finiteOrNull(tangentErrorRad), orientationErrorRad: finiteOrNull(follow.error), rollErrorRad: finiteOrNull(roll.error), domainMarginErrorMm: finiteOrNull(domainMarginErrorMm) },
    uncertaintyModel: 'current-native-analytic-float64' as const, topologyTolerancesMm: { point: point.localSupport.tolerance, path: arc.nativeToleranceMm } }
  return precise ? { ...result, status: 'ok' as const, satisfied: retainedPosition && retainedDomain && retainedAngles } : { ...result, status: 'precisionLimit' as const, satisfied: false as const, message: 'Configured circular measurement cannot retain the requested numerical bands.' }
}

/** Independent physical formulas over the authenticated current native
 * observations. Candidate poses require a new configured snapshot and newly
 * resolved aggregates; reports and detached numerical inputs grant no proof.
 * This deliberately does not re-resolve the entire relation inventory. */
export function measureConfiguredAssemblyAdvanced(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  value: ConfiguredAssemblyAdvancedMate, options: ConfiguredAssemblyAdvancedOptions = {}) {
  const policy = bands(options)
  assertAdvanced(snapshot, input, value)
  try {
    const result = profileMate(value) ? profileMeasurement(snapshot, input, value, policy) : lineMate(value) ? lineMeasurement(snapshot, input, value, policy) : circularMeasurement(snapshot, input, value, policy)
    assertAdvanced(snapshot, input, value)
    return result
  } catch (error) {
    try { intrinsicDispose.call(snapshot) } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Configured advanced measurement or native release failed.') }
    throw error
  }
}

export type ConfiguredAssemblyAdvancedMeasurement = ReturnType<typeof measureConfiguredAssemblyAdvanced>
