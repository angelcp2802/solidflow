import { assemblyOccurrencePathKey, type AssemblyDocument } from '../model/assemblyDocument'
import { validateAssemblyProfileCenterReferenceRequest } from '../model/assemblyProfileCenterReferences'
import { transformRigidDirection, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyProfilePlacementArithmetic, assemblyProfileAxisPlacementArithmetic,
  type AssemblyProfileWitness, type AssemblyProfileAxisWitness } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

export interface AssemblyProfileCenterEvaluationOptions { lengthToleranceMm?: number; angleToleranceRad?: number }
const R = 128 * Number.EPSILON, MIN = 2 ** -1022
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3
const mul = (a: Vec3, s: number): Vec3 => a.map(v => v * s) as Vec3
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, v, i) => sum + v * b[i], 0)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v: Vec3) => Math.hypot(...v)
const angle = (a: Vec3, b: Vec3) => Math.atan2(norm(cross(a, b)), dot(a, b))
function policy(input: AssemblyProfileCenterEvaluationOptions) {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('Profile evaluation bands require plain data.')
  const result = { lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }
  for (const name of Reflect.ownKeys(input)) {
    const f = Object.getOwnPropertyDescriptor(input, name)!
    if (typeof name !== 'string' || !Object.hasOwn(result, name) || !f.enumerable || !('value' in f) || typeof f.value !== 'number' || !Number.isFinite(f.value) || f.value <= 0) throw Error('Invalid profile evaluation band.')
    result[name as keyof typeof result] = f.value
  }
  if (result.angleToleranceRad >= Math.PI) throw Error('Profile angular band must be below pi.')
  return result
}
/** Fresh native physical verification only; no solved pose or Apply authority. */
export function evaluateAssemblyProfileCenterReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, input: unknown,
  options: AssemblyProfileCenterEvaluationOptions = {}, scopePath: readonly string[] = []) {
  const request = validateAssemblyProfileCenterReferenceRequest(input), bands = policy(options), scope = JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
  type Witness = AssemblyProfileWitness | AssemblyProfileAxisWitness
  try {
    const resolve = (s: typeof request.first): Witness => s.axis === null ? snapshot.resolveProfileFaceSelection(document, s.face, scope, bands)
      : snapshot.resolveProfileAxisSelection(document, { ...s.face, ...s.axis }, scope, bands)
    const first = resolve(request.first), second = resolve(request.second)
    const assert = (w: Witness) => { if ('profile' in w.localSupport) snapshot.assertProfileAxisWitness(w as AssemblyProfileAxisWitness, document); else snapshot.assertProfileWitness(w as AssemblyProfileWitness, document) }
    const origin = [...first.declaredWorldPose.translation] as Vec3
    const observed = (w: Witness) => {
      assert(w)
      const axis = 'profile' in w.localSupport ? w.localSupport : null, p = axis ? axis.profile : (w as AssemblyProfileWitness).localSupport
      const budget = axis ? assemblyProfileAxisPlacementArithmetic(w as AssemblyProfileAxisWitness, document) : assemblyProfilePlacementArithmetic(w as AssemblyProfileWitness, document)
      const round = R * (budget.depth + 1), pose: RigidPose = { translation: [...w.declaredWorldPose.translation], rotation: [...w.declaredWorldPose.rotation] }
      const rotated = transformRigidDirection(pose, [...p.center] as Vec3), center = rotated.map((v, i) => v + (pose.translation[i] - origin[i])) as Vec3
      const normal = transformRigidDirection(pose, [...p.normal] as Vec3), x = axis ? transformRigidDirection(pose, [...axis.xDirection] as Vec3) : null
      const pe = p.uncertainty.positionErrorMm + round * (budget.placementSum + norm([...p.center]) + norm(origin) + norm(center))
      const ne = p.uncertainty.normalErrorRad + round, xe = axis ? axis.xDirectionErrorRad + round : 0
      assert(w)
      return { center, normal, x, pe, ne, xe, kind: p.kind }
    }
    const a = observed(first), b = observed(second), delta = sub(b.center, a.center), defect = sub(delta, mul(a.normal, request.offsetMm))
    const positionResidualMm = norm(defect), normalAngleRadians = angle(mul(a.normal, request.alignment === 'aligned' ? 1 : -1), b.normal)
    let rectangleAngleRadians: number | null = null
    if (request.orientation.mode === 'rectangle') {
      if (!a.x || !b.x || a.kind !== 'rectangle' || b.kind !== 'rectangle') throw Error('Explicit rectangular material proofs required.')
      const q = request.orientation.quarterTurns, c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q], v = cross(a.normal, a.x)
      const target = a.x.map((x, i) => c * x + s * v[i]) as Vec3
      rectangleAngleRadians = angle(target, b.x)
    }
    const precision = { positionMm: a.pe + b.pe + Math.abs(request.offsetMm) * a.ne + R * (norm(a.center) + norm(b.center) + Math.abs(request.offsetMm) + positionResidualMm),
      normalRad: a.ne + b.ne + R, rectangleRad: a.x && b.x ? a.xe + b.xe + a.ne + R : null }
    const scalars = [request.offsetMm, bands.lengthToleranceMm, bands.angleToleranceRad, ...a.center, ...b.center, ...defect, positionResidualMm, normalAngleRadians, ...(rectangleAngleRadians === null ? [] : [rectangleAngleRadians]), ...Object.values(precision).filter((v): v is number => v !== null)]
    const precise = scalars.every(v => Number.isFinite(v) && (v === 0 || Math.abs(v) >= MIN)) && precision.positionMm <= bands.lengthToleranceMm
      && precision.normalRad <= bands.angleToleranceRad && (precision.rectangleRad === null || precision.rectangleRad <= bands.angleToleranceRad)
    // Reentrant native queries cannot turn earlier proofs into publication authority.
    assert(first); assert(second)
    const metadata = { verificationOnly: true as const, compatibilityAuthority: false as const, coordinateFrame: 'world-axes-relative-to-first-placement' as const,
      scopePath: scope, componentPaths: { first: [...first.componentPath], second: [...second.componentPath] }, profileKinds: { first: a.kind, second: b.kind },
      alignment: request.alignment, offsetMm: request.offsetMm, orientation: request.orientation, bands,
      precision: { positionMm: Number.isFinite(precision.positionMm) ? precision.positionMm : null, normalRad: Number.isFinite(precision.normalRad) ? precision.normalRad : null,
        rectangleRad: precision.rectangleRad === null || Number.isFinite(precision.rectangleRad) ? precision.rectangleRad : null } }
    const residuals = { positionResidualMm: Number.isFinite(positionResidualMm) ? positionResidualMm : null, normalAngleRadians: Number.isFinite(normalAngleRadians) ? normalAngleRadians : null,
      rectangleAngleRadians: rectangleAngleRadians === null || Number.isFinite(rectangleAngleRadians) ? rectangleAngleRadians : null }
    return precise ? { ...metadata, ...residuals, status: 'ok' as const, satisfied: positionResidualMm <= bands.lengthToleranceMm && normalAngleRadians <= bands.angleToleranceRad
      && (rectangleAngleRadians === null || rectangleAngleRadians <= bands.angleToleranceRad) }
      : { ...metadata, ...residuals, status: 'precisionLimit' as const, message: 'Native profile composition cannot certify the requested numerical bands.' }
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Profile center verification or release failed.') }
    throw error
  }
}
