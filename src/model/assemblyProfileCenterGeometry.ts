import type { Vec3 } from '../cad/kernel.types'
import { rigidRotationMatrix, validateRigidPose, type Quaternion } from './rigidPose'

interface ProfileBase { ownerId: string | null; center: Vec3; normal: Vec3; pointError?: number; normalErrorRad?: number }
export type ConditionedProfileCenterSupport = ProfileBase & ({ kind: 'circle' }
  | { kind: 'rectangle'; xDirection: Vec3; xDirectionErrorRad?: number })
export interface ProfileCenterChoices { alignment: 'aligned' | 'opposed'; offset: number;
  orientation: { mode: 'free' } | { mode: 'rectangle'; quarterTurns: 0 | 1 | 2 | 3 } }
export interface ProfileCenterBands { lengthTolerance: number; angleToleranceRad: number }
export type ProfileCenterColumns = [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]
export interface ProfileCenterDerivative { position: ProfileCenterColumns; normal: ProfileCenterColumns; rectangle: ProfileCenterColumns | null }
export interface ProfileCenterOwnerDerivative extends ProfileCenterDerivative { ownerId: string }
export interface ProfileCenterComparison {
  status: 'ok'; position: Vec3; normal: Vec3; rectangle: Vec3 | null;
  /** Physical normalized-length residual norm, not an uncertainty estimate. */
  positionError: number; normalAngleRadians: number; rectangleAngleRadians: number | null; axial: number;
  /** First-order arithmetic/input estimates, not certified intervals. */
  precision: { position: number; normal: number; rectangle: number | null };
  supports: [ProfileCenterDerivative, ProfileCenterDerivative]; owners: ProfileCenterOwnerDerivative[]
}
export interface ProfileCenterGeometryDiagnostic { status: 'precisionLimit'; message: string }
const R = 128 * Number.EPSILON, MIN = 2 ** -1022
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, s: number): Vec3 => a.map(v => v * s) as Vec3
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: Vec3): number => Math.hypot(...a)
const tiny = (v: number): boolean => v !== 0 && Math.abs(v) < MIN
const angle = (a: Vec3, b: Vec3): number => Math.atan2(norm(cross(a, b)), dot(a, b))
function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Profile geometry requires plain data records.')
  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ![...required, ...optional].includes(key)) throw Error('Unknown profile geometry field.')
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (!field.enumerable || !('value' in field)) throw Error('Profile geometry forbids executable fields.')
    result[key] = field.value
  }
  if (required.some(key => !Object.hasOwn(result, key))) throw Error('Missing profile geometry field.')
  return result
}
function vector(value: unknown): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || Reflect.ownKeys(value).length !== 4) throw Error('Profile geometry requires dense vectors.')
  return [0, 1, 2].map(i => { const f = Object.getOwnPropertyDescriptor(value, String(i));
    if (!f?.enumerable || !('value' in f) || typeof f.value !== 'number' || !Number.isFinite(f.value)) throw Error('Profile geometry requires finite vector data.'); return f.value }) as Vec3
}
function scalar(v: unknown, positive = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || positive && v <= 0) throw Error('Profile geometry requires finite scalars and positive bands.')
  return v
}
function error(v: unknown): number { if (v === undefined) return 0; const n = scalar(v); if (n < 0) throw Error('Profile geometry requires nonnegative errors.'); return n }
interface Support { ownerId: string | null; center: Vec3; normal: Vec3; x: Vec3 | null; pe: number; ne: number; xe: number; unresolved: boolean }
function support(value: ConditionedProfileCenterSupport): Support {
  // Read the discriminant through a descriptor before selecting the exact shape.
  const field = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, 'kind') : undefined
  if (!field || !('value' in field) || !['circle', 'rectangle'].includes(field.value)) throw Error('Profile support kind must be circle or rectangle.')
  const rectangle = field.value === 'rectangle'
  const s = record(value, ['kind', 'ownerId', 'center', 'normal', ...(rectangle ? ['xDirection'] : [])], ['pointError', 'normalErrorRad', ...(rectangle ? ['xDirectionErrorRad'] : [])])
  if (s.ownerId !== null && (typeof s.ownerId !== 'string' || !s.ownerId.length)) throw Error('Profile owner must be an ID or null.')
  const center = vector(s.center), rawN = vector(s.normal), nl = norm(rawN)
  if (Math.abs(nl - 1) > 1e-12) throw Error('Profile normal must be unit within 1e-12.')
  const normal = mul(rawN, 1 / nl); let x: Vec3 | null = null, correction = 0
  if (rectangle) {
    const raw = vector(s.xDirection), length = norm(raw), along = dot(raw, normal)
    if (Math.abs(length - 1) > 1e-12 || Math.abs(along) > 1e-12) throw Error('Rectangle direction must be unit and perpendicular within 1e-12.')
    const projected = sub(raw, mul(normal, along)); x = mul(projected, 1 / norm(projected)); correction = norm(sub(x, raw))
  }
  const pe = error(s.pointError), ne = error(s.normalErrorRad), xe = error(s.xDirectionErrorRad)
  return { ownerId: s.ownerId as string | null, center, normal, x, pe: pe + R * norm(center), ne: ne + Math.abs(nl - 1) + R,
    xe: xe + correction + R, unresolved: [...center, pe, ne, xe].some(tiny) }
}
function zero(rectangle: boolean): ProfileCenterDerivative {
  const cols = () => Array.from({ length: 6 }, () => [0, 0, 0] as Vec3) as ProfileCenterColumns
  return { position: cols(), normal: cols(), rectangle: rectangle ? cols() : null }
}
/** Already-normalized fixed coordinates; no world origin is reconstructed.
 * Columns are normalized left retraction [vX,vY,vZ,wX,wY,wZ]. The caller must
 * attach firstFrameRotation to the FIRST support owner, also off solution.
 * Formal null blocks are retained; physical owner blocks omit null and sum
 * repeated IDs. Non-null does not declare an owner free. Chords are not radians;
 * antipodal chart admission belongs to the caller's solver, not this helper.
 */
export function compareConditionedProfileCenters(first: ConditionedProfileCenterSupport, second: ConditionedProfileCenterSupport,
  choices: ProfileCenterChoices, firstFrameRotation: Quaternion, bands: ProfileCenterBands): ProfileCenterComparison | ProfileCenterGeometryDiagnostic {
  const a = support(first), b = support(second), c = record(choices, ['alignment', 'offset', 'orientation']), band = record(bands, ['lengthTolerance', 'angleToleranceRad'])
  if (c.alignment !== 'aligned' && c.alignment !== 'opposed') throw Error('Profile alignment must be explicit.')
  const offset = scalar(c.offset), lengthBand = scalar(band.lengthTolerance, true), angleBand = scalar(band.angleToleranceRad, true)
  if (angleBand >= Math.PI) throw Error('Profile angle band must be below pi.')
  const orientationKind = c.orientation && typeof c.orientation === 'object' ? Object.getOwnPropertyDescriptor(c.orientation, 'mode') : undefined
  if (!orientationKind || !('value' in orientationKind) || !['free', 'rectangle'].includes(orientationKind.value)) throw Error('Profile orientation must be explicit.')
  const rect = orientationKind.value === 'rectangle', orientation = record(c.orientation, rect ? ['mode', 'quarterTurns'] : ['mode'])
  let q = 0
  if (rect) { if (!a.x || !b.x) throw Error('Rectangle orientation requires two rectangles.'); q = scalar(orientation.quarterTurns); if (![0, 1, 2, 3].includes(q)) throw Error('Rectangle quarterTurns must be 0, 1, 2 or 3.') }
  const matrix = rigidRotationMatrix(validateRigidPose({ translation: [0, 0, 0], rotation: firstFrameRotation }).rotation)
  const local = (v: Vec3): Vec3 => [0, 1, 2].map(i => matrix[i] * v[0] + matrix[3 + i] * v[1] + matrix[6 + i] * v[2]) as Vec3
  const sign = c.alignment === 'aligned' ? 1 : -1, delta = sub(b.center, a.center)
  const worldPosition = sub(delta, mul(a.normal, offset)), worldNormal = sub(b.normal, mul(a.normal, sign))
  const goal = rect ? add(mul(a.x!, [1, 0, -1, 0][q]), mul(cross(a.normal, a.x!), [0, 1, 0, -1][q])) : null
  const worldRectangle = goal ? sub(b.x!, goal) : null
  const position = local(worldPosition), normal = local(worldNormal), rectangle = worldRectangle ? local(worldRectangle) : null
  const precision = { position: a.pe + b.pe + Math.abs(offset) * a.ne + R * (norm(delta) + Math.abs(offset) + norm(worldPosition)),
    normal: a.ne + b.ne + 4 * R, rectangle: rect ? a.xe + b.xe + (q % 2 ? a.ne : 0) + 6 * R : null }
  const fail = (): ProfileCenterGeometryDiagnostic => ({ status: 'precisionLimit', message: 'Profile geometry exceeds the requested numerical resolution.' })
  if (a.unresolved || b.unresolved || tiny(offset) || tiny(lengthBand) || tiny(angleBand)
    || !Object.values(precision).every(v => v === null || Number.isFinite(v)) || precision.position > lengthBand || precision.normal > angleBand || precision.rectangle !== null && precision.rectangle > angleBand) return fail()
  const supports: [ProfileCenterDerivative, ProfileCenterDerivative] = [zero(rect), zero(rect)]
  for (let role = 0; role < 2; role++) for (let column = 0; column < 6; column++) {
    const s = role === 0 ? a : b, rotation = column >= 3, axis = AXES[column % 3], dc = rotation ? cross(axis, s.center) : axis
    const dn = rotation ? cross(axis, s.normal) : [0, 0, 0] as Vec3
    const dp = role === 0 ? mul(add(dc, mul(dn, offset)), -1) : dc
    const dnormal = mul(dn, role === 0 ? -sign : 1)
    const anchored = (derivative: Vec3, residual: Vec3): Vec3 => local(role === 0 && rotation ? sub(derivative, cross(axis, residual)) : derivative)
    supports[role].position[column] = anchored(dp, worldPosition)
    supports[role].normal[column] = anchored(dnormal, worldNormal)
    if (worldRectangle) {
      const derivative = rotation ? cross(axis, role === 0 ? mul(goal!, -1) : b.x!) : [0, 0, 0] as Vec3
      supports[role].rectangle![column] = anchored(derivative, worldRectangle)
    }
  }
  const owners: ProfileCenterOwnerDerivative[] = []
  for (let role = 0; role < 2; role++) {
    const ownerId = (role === 0 ? a : b).ownerId
    if (ownerId === null) continue
    let owner = owners.find(value => value.ownerId === ownerId)
    if (!owner) { owner = { ...zero(rect), ownerId }; owners.push(owner) }
    for (let column = 0; column < 6; column++) {
      owner.position[column] = add(owner.position[column], supports[role].position[column]); owner.normal[column] = add(owner.normal[column], supports[role].normal[column])
      if (rect) owner.rectangle![column] = add(owner.rectangle![column], supports[role].rectangle![column])
    }
  }
  const derivatives = [...supports, ...owners].flatMap(value => [...value.position.flat(), ...value.normal.flat(), ...(value.rectangle?.flat() ?? [])])
  const positionError = norm(worldPosition), normalAngleRadians = angle(b.normal, mul(a.normal, sign)), rectangleAngleRadians = goal ? angle(b.x!, goal) : null, axial = dot(a.normal, delta)
  if (![...position, ...normal, ...(rectangle ?? []), positionError, normalAngleRadians, ...(rectangleAngleRadians === null ? [] : [rectangleAngleRadians]), axial, ...derivatives].every(Number.isFinite)) return fail()
  return { status: 'ok', position, normal, rectangle, positionError, normalAngleRadians, rectangleAngleRadians, axial, precision, supports, owners }
}
