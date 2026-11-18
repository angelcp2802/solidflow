import type { Vec3 } from '../cad/kernel.types'
import { validateRigidPose } from './rigidPose'
import type { NumericProfileCenterSupport, RigidProfileCenterConstraint, RigidProfileCenterEndpoint } from './assemblySolveTypes'

function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Profile declarations require plain data records.')
  const fields = Reflect.ownKeys(value), result: Record<string, unknown> = {}
  if (fields.length !== keys.length) throw Error('Profile declaration fields must be exact.')
  for (const key of fields) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) throw Error('Profile declarations require own data without accessors.')
    result[key] = field.value
  }
  return result
}
function discriminant(value: unknown, key: string): unknown {
  const field = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined
  if (!field?.enumerable || !('value' in field)) throw Error('Profile discriminants must be explicit data.')
  return field.value
}
function scalar(value: unknown, nonnegative = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || nonnegative && value < 0) throw Error('Profile scalars must be finite; errors must be nonnegative.')
  return value
}
function vector(value: unknown): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || Reflect.ownKeys(value).length !== 4) throw Error('Profile vectors must be dense triples.')
  return [0, 1, 2].map(i => { const f = Object.getOwnPropertyDescriptor(value, String(i));
    if (!f?.enumerable || !('value' in f)) throw Error('Profile vectors require own data.'); return scalar(f.value) }) as Vec3
}
function endpoint(value: unknown): RigidProfileCenterEndpoint {
  const e = record(value, ['bodyId', 'frame', 'profile'])
  if (e.bodyId !== null && (typeof e.bodyId !== 'string' || !e.bodyId.length)) throw Error('Profile owner must be an ID or null.')
  const kind = discriminant(e.profile, 'kind')
  if (kind !== 'circle' && kind !== 'rectangle') throw Error('Profile kind must be circle or rectangle.')
  const p = record(e.profile, ['kind', 'center', 'normal', 'positionErrorMm', 'normalErrorRad', ...(kind === 'rectangle' ? ['xDirection', 'xDirectionErrorRad'] : [])])
  const normal = vector(p.normal)
  if (Math.abs(Math.hypot(...normal) - 1) > 1e-12) throw Error('Profile normal must be unit within 1e-12.')
  let profile: NumericProfileCenterSupport = { kind: 'circle', center: vector(p.center), normal,
    positionErrorMm: scalar(p.positionErrorMm, true), normalErrorRad: scalar(p.normalErrorRad, true) }
  if (kind === 'rectangle') {
    const xDirection = vector(p.xDirection)
    if (Math.abs(Math.hypot(...xDirection) - 1) > 1e-12 || Math.abs(xDirection.reduce((sum, x, i) => sum + x * normal[i], 0)) > 1e-12) throw Error('Rectangle axes must be unit and perpendicular within 1e-12.')
    profile = { ...profile, kind: 'rectangle', xDirection, xDirectionErrorRad: scalar(p.xDirectionErrorRad, true) }
  }
  return { bodyId: e.bodyId as string | null, frame: validateRigidPose(e.frame), profile }
}
/** Strict detached numerical copy; never authenticates a native selection. */
export function copyRigidProfileCenterConstraint(value: unknown): RigidProfileCenterConstraint {
  const c = record(value, ['id', 'type', 'first', 'second', 'alignment', 'offsetMm', 'orientation'])
  if (typeof c.id !== 'string' || !c.id.length || c.type !== 'profile-center' || c.alignment !== 'aligned' && c.alignment !== 'opposed') throw Error('Profile identity, family and alignment must be explicit.')
  const mode = discriminant(c.orientation, 'mode')
  if (mode !== 'free' && mode !== 'rectangle') throw Error('Profile orientation must be free or rectangle.')
  const o = record(c.orientation, mode === 'free' ? ['mode'] : ['mode', 'quarterTurns'])
  const first = endpoint(c.first), second = endpoint(c.second)
  let orientation: RigidProfileCenterConstraint['orientation'] = { mode: 'free' }
  if (mode === 'rectangle') {
    if (first.profile.kind !== 'rectangle' || second.profile.kind !== 'rectangle' || ![0, 1, 2, 3].includes(o.quarterTurns as number)) throw Error('Rectangle orientation needs two rectangles and explicit quarterTurns 0..3.')
    orientation = { mode: 'rectangle', quarterTurns: o.quarterTurns as 0 | 1 | 2 | 3 }
  }
  return { id: c.id, type: 'profile-center', first, second, alignment: c.alignment, offsetMm: scalar(c.offsetMm), orientation }
}
