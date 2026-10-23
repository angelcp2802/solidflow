import { assemblyDefinitionKey, validateAssemblyDocument,
  type AssemblyDefinition, type AssemblyDocument,
  type AssemblyPlaneReference } from '../model/assemblyDocument'
import type { RigidHingeConstraint, RigidMateEndpoint, RigidMateSupport } from '../model/assemblySolveTypes'
import { copyRigidHingeConstraint } from '../model/assemblyHingeNumeric'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, validateRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

import { validateAssemblyHingeReferenceRequest, type AssemblyHingeReferenceRequest } from '../model/assemblyHingeReferences'
export { validateAssemblyHingeReferenceRequest, type AssemblyHingeReferenceRequest } from '../model/assemblyHingeReferences'
export interface AssemblyHingeMeasurementOptions { lengthToleranceMm?: number; angleToleranceRad?: number }
export interface AssemblyResolvedHingeReferences {
  readonly axis: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
  readonly axial: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
  readonly alignment: 'aligned' | 'opposed'
  readonly scopePath: readonly string[]
}
interface ReportBase {
  scopePath: string[]
  componentPaths: { axis: [string[], string[]]; axial: [string[], string[]] }
  alignment: 'aligned' | 'opposed'
  supportOnly: true
}
export type AssemblyNativeHingeMeasurement = ReportBase & (
  | { status: 'precisionLimit'; message: string }
  | { status: 'ok'; qualifiedRotation: true; satisfied: boolean; axisAngleRad: number;
      transverseResidualMm: number; axialOffsetMm: number; axialityRad: [number, number];
      precision: { positionMm: number; directionRad: number };
      lengthToleranceMm: number; angleToleranceRad: number }
)
const proofs = new WeakMap<object, AssemblyGeometrySnapshot>()
const ROUND = 128 * Number.EPSILON
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): number => Math.hypot(...a)
function scopeCopy(value: readonly string[]): string[] {
  if (!Array.isArray(value) || value.length > 32 || Reflect.ownKeys(value).length !== value.length + 1) throw Error('Hinge scope must be a dense occurrence path.')
  return Array.from({ length: value.length }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i))
    if (!d?.enumerable || !('value' in d) || typeof d.value !== 'string' || !d.value.length || d.value.length > 128) throw Error('Hinge scope needs own occurrence IDs.')
    return d.value
  })
}
export function validateAssemblyHingeMeasurementOptions(input: AssemblyHingeMeasurementOptions): Required<AssemblyHingeMeasurementOptions> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('Hinge tolerances require plain data.')
  const config = { lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }
  for (const key of Reflect.ownKeys(input)) {
    const d = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !Object.hasOwn(config, key) || !d.enumerable || !('value' in d)
      || typeof d.value !== 'number' || !Number.isFinite(d.value) || d.value <= 0) throw Error('Hinge tolerances must be positive finite own values.')
    config[key as keyof typeof config] = d.value
  }
  if (config.angleToleranceRad >= Math.PI / 2) throw Error('Hinge angular tolerance must distinguish axial and radial planes.')
  return config
}
function witnesses(value: AssemblyResolvedHingeReferences): AssemblyEndpointWitness[] { return [...value.axis, ...value.axial] }
function owner(witness: AssemblyEndpointWitness, scope: readonly string[]): string | null {
  if (scope.some((id, i) => witness.componentPath[i] !== id)) throw Error('Hinge role is outside its declared scope.')
  return witness.componentPath[0] ?? null
}
export function assertAssemblyHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, value: AssemblyResolvedHingeReferences): void {
  if (!value || proofs.get(value) !== snapshot) throw Error('Hinge references were not issued by this native snapshot.')
  for (const w of witnesses(value)) snapshot.assertWitness(w, document)
}
/** All four fresh queries finish before a private proof is issued. Descendants
 * may differ, but each axis/axial pair belongs to the same document-root rigid
 * owner. Selecting a reference context does not grant child movement. */
export function resolveAssemblyHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, input: unknown,
  scopePath: readonly string[] = []): AssemblyResolvedHingeReferences {
  const request = validateAssemblyHingeReferenceRequest(input), scope = scopeCopy(scopePath)
  try {
    const resolve = (ref: AssemblyHingeReferenceRequest['axis'][number] | AssemblyPlaneReference) => snapshot.resolveReference(document, ref, scope)
    const axis = request.axis.map(resolve) as [AssemblyEndpointWitness, AssemblyEndpointWitness]
    const axial = request.axial.map(resolve) as [AssemblyEndpointWitness, AssemblyEndpointWitness]
    for (let i = 0; i < 2; i++) {
      const a = axis[i], p = axial[i]
      if (a.kind !== 'support' || !['line', 'cylinder'].includes(a.localSupport.kind)
        || p.kind !== 'support' || p.localSupport.kind !== 'plane') throw Error('Hinge roles do not have the requested native purposes.')
      if (owner(a, scope) !== owner(p, scope)) throw Error('Each hinge axis and axial plane must share an effective rigid owner.')
    }
    for (const w of [...axis, ...axial]) snapshot.assertWitness(w, document)
    const result = Object.freeze({ axis: Object.freeze(axis), axial: Object.freeze(axial), alignment: request.alignment, scopePath: Object.freeze(scope) })
    proofs.set(result, snapshot)
    return result
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Hinge resolution or release failed.') }
    throw error
  }
}
function local(w: AssemblyEndpointWitness) {
  if (w.kind !== 'support') throw Error('Hinge reference needs analytic native support.')
  return w.localSupport
}
function supportCopy(w: AssemblyEndpointWitness): RigidMateSupport {
  const s = local(w), base = { point: [...s.point] as Vec3, tolerance: s.tolerance }
  if (s.kind === 'line') return { ...base, kind: 'line', axis: [...s.axis] }
  if (s.kind === 'plane') return { ...base, kind: 'plane', normal: [...s.normal], xDirection: [...s.xDirection] }
  return { ...base, kind: 'cylinder', axis: [...s.axis], xDirection: [...s.xDirection], radius: s.radius }
}
/** Recompose only declarations below the effective owner. Inverting composed
 * world transforms would conceal cancellation in deep or distant placements. */
function frame(document: AssemblyDocument, w: AssemblyEndpointWitness, scope: readonly string[]): Pick<RigidMateEndpoint, 'bodyId' | 'frame'> {
  const table = new Map([document, ...document.definitions].map(d => [assemblyDefinitionKey(d), d]))
  let node: AssemblyDefinition = document, pose = identityRigidPose()
  for (let i = 0; i < w.componentPath.length; i++) {
    if (node.kind !== 'assembly') throw Error('Hinge path crosses a part.')
    const occurrence = node.occurrences.find(o => o.id === w.componentPath[i])
    if (!occurrence || occurrence.suppressed) throw Error('Hinge occurrence is unavailable.')
    if (i > 0) pose = composeRigidPoses(pose, occurrence.pose)
    const next = table.get(assemblyDefinitionKey(occurrence.definition))
    if (!next) throw Error('Hinge source is unavailable.')
    node = next
  }
  return { bodyId: owner(w, scope), frame: pose }
}
function uncertainty(w: AssemblyEndpointWitness, document: AssemblyDocument) {
  const arithmetic = assemblyEndpointPlacementArithmetic(w, document), s = local(w)
  const round = ROUND * (arithmetic.depth + 1)
  const positionErrorMm = s.tolerance + round * (arithmetic.placementSum + norm([...s.point]))
  if (!Number.isFinite(positionErrorMm)) throw new RangeError('Hinge placement uncertainty is not finite.')
  return { positionErrorMm, directionErrorRad: round }
}
function axisDirection(w: AssemblyEndpointWitness): Vec3 {
  const s = local(w)
  if (s.kind !== 'line' && s.kind !== 'cylinder') throw Error('Hinge axis needs a native line or cylinder.')
  return [...s.axis]
}
function planeNormal(w: AssemblyEndpointWitness): Vec3 {
  const s = local(w)
  if (s.kind !== 'plane') throw Error('Hinge axial role needs a native plane.')
  return [...s.normal]
}
function angle(a: Vec3, b: Vec3, unoriented = false): number { return Math.atan2(norm(cross(a, b)), unoriented ? Math.abs(dot(a, b)) : dot(a, b)) }
function axiality(document: AssemblyDocument, value: AssemblyResolvedHingeReferences): [number, number] {
  return [0, 1].map(i => {
    const a = value.axis[i], p = value.axial[i]
    const af = frame(document, a, value.scopePath).frame, pf = frame(document, p, value.scopePath).frame
    const result = angle(transformRigidDirection(af, axisDirection(a)), transformRigidDirection(pf, planeNormal(p)), true)
    // This structural qualification is independent of the requested residual
    // acceptance band. An oblique plane would constrain the supposedly free roll.
    if (result > 1e-12) throw Error('Hinge axial planes must be perpendicular to their own axes; radial planes do not define free rotation.')
    return result
  }) as [number, number]
}
/** Numerical declaration only. Its detached bytes confer no saved-mate,
 * preview, document-editing or Apply authority. */
export function buildAssemblyHingeConstraint(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument,
  value: AssemblyResolvedHingeReferences, id: string, options: AssemblyHingeMeasurementOptions = {}): RigidHingeConstraint {
  assertAssemblyHingeReferences(snapshot, input, value)
  const document = validateAssemblyDocument(input), config = validateAssemblyHingeMeasurementOptions(options)
  if (typeof id !== 'string' || !id.trim()) throw Error('Hinge numerical constraint needs an ID.')
  axiality(document, value)
  const entries = witnesses(value)
  const errors = entries.map(w => uncertainty(w, document)) as NonNullable<RigidHingeConstraint['uncertainty']>
  if (errors.some(e => e.directionErrorRad > config.angleToleranceRad || e.positionErrorMm > config.lengthToleranceMm)) throw new RangeError('Hinge original placement exceeds the requested precision.')
  const project = (w: AssemblyEndpointWitness): RigidMateEndpoint => ({ ...frame(document, w, value.scopePath), support: supportCopy(w) })
  const result: RigidHingeConstraint = { id, type: 'hinge', axis: value.axis.map(project) as RigidHingeConstraint['axis'],
    axial: value.axial.map(project) as RigidHingeConstraint['axial'], alignment: value.alignment, uncertainty: errors }
  assertAssemblyHingeReferences(snapshot, input, value)
  return copyRigidHingeConstraint(result)
}
interface MeasuredSupport { p: Vec3; n: Vec3; pe: number; ne: number }
function measured(w: AssemblyEndpointWitness, document: AssemblyDocument, origin: Vec3, isAxis: boolean): MeasuredSupport {
  const pose = validateRigidPose(w.declaredWorldPose), s = local(w), e = uncertainty(w, document)
  const rotated = transformRigidDirection(pose, [...s.point])
  const p = rotated.map((v, i) => v + (pose.translation[i] - origin[i])) as Vec3
  const pe = e.positionErrorMm + ROUND * (norm(origin) + norm([...pose.translation]) + norm(p))
  return { p, n: transformRigidDirection(pose, isAxis ? axisDirection(w) : planeNormal(w)), pe, ne: e.directionErrorRad }
}
/** Independent current-native physical measurements, without the numerical
 * chart, row residuals or a solver rank. A fresh candidate snapshot is required
 * after any placement change. Analytic infinite supports only. This borrowed
 * composition helper leaves failure cleanup to its fresh-query caller. */
export function measureResolvedAssemblyHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  value: AssemblyResolvedHingeReferences, options: AssemblyHingeMeasurementOptions = {}): AssemblyNativeHingeMeasurement {
  const config = validateAssemblyHingeMeasurementOptions(options)
  assertAssemblyHingeReferences(snapshot, document, value)
    const base: ReportBase = { scopePath: [...value.scopePath], alignment: value.alignment, supportOnly: true,
      componentPaths: { axis: value.axis.map(w => [...w.componentPath]) as [string[], string[]], axial: value.axial.map(w => [...w.componentPath]) as [string[], string[]] } }
    const axialityRad = axiality(document, value)
    const origin: Vec3 = [...value.axis[0].declaredWorldPose.translation]
    const [a, b] = value.axis.map(w => measured(w, document, origin, true))
    const [p, q] = value.axial.map(w => measured(w, document, origin, false))
    const delta = sub(b.p, a.p), planeDelta = sub(q.p, p.p)
    const directionRad = a.ne + b.ne + p.ne + q.ne + 16 * ROUND
    // Conservative support/placement envelopes stay separate from residuals;
    // they never enlarge the requested acceptance bands.
    const positionMm = a.pe + b.pe + p.pe + q.pe + 4 * (norm(delta) + norm(planeDelta)) * directionRad
      + 16 * ROUND * (norm(a.p) + norm(b.p) + norm(p.p) + norm(q.p))
    const signedAxis = a.n.map(v => v * (value.alignment === 'aligned' ? 1 : -1)) as Vec3
    const axisAngleRad = angle(signedAxis, b.n)
    const transverseResidualMm = Math.max(norm(cross(delta, a.n)), norm(cross(delta, b.n)))
    const axialOffsetMm = dot(planeDelta, p.n)
    const finite = [positionMm, directionRad, axisAngleRad, transverseResidualMm, axialOffsetMm, ...axialityRad].every(Number.isFinite)
    const lengthResidual = Math.max(transverseResidualMm, Math.abs(axialOffsetMm))
    const nominal = axisAngleRad <= config.angleToleranceRad && lengthResidual <= config.lengthToleranceMm
    const retained = axisAngleRad + directionRad <= config.angleToleranceRad && lengthResidual + positionMm <= config.lengthToleranceMm
    assertAssemblyHingeReferences(snapshot, document, value)
    if (!finite || positionMm > config.lengthToleranceMm || directionRad > config.angleToleranceRad || nominal && !retained) return {
      ...base, status: 'precisionLimit', message: 'The original hinge placements and analytic supports exceed the requested measurement precision.' }
    return { ...base, status: 'ok', qualifiedRotation: true, axisAngleRad, transverseResidualMm, axialOffsetMm, axialityRad,
      precision: { positionMm, directionRad }, ...config,
      satisfied: retained }
}

/** Fresh four-role query entry point. The resolved measurement is also used
 * after the separate six-role resolver has authenticated its complete set. */
export function measureAssemblyHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, input: unknown,
  options: AssemblyHingeMeasurementOptions = {}, scopePath: readonly string[] = []): AssemblyNativeHingeMeasurement {
  const config = validateAssemblyHingeMeasurementOptions(options)
  const value = resolveAssemblyHingeReferences(snapshot, document, input, scopePath)
  try { return measureResolvedAssemblyHingeReferences(snapshot, document, value, config) }
  catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Hinge measurement or release failed.') }
    throw error
  }
}
