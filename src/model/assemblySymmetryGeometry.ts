import type { Vec3 } from '../cad/kernel.types'
import { rigidRotationMatrix, validateRigidPose, type Quaternion } from './rigidPose'

/** Original analytic infinite-support geometry; no native or saved-reference authority. */
export interface SymmetryConditioning { originMm: Vec3; lengthScaleMm: number; lengthToleranceMm: number; angleToleranceRad: number }
export type SymmetryAlignment = 'aligned' | 'opposed' | null
interface WorldBase { ownerId: string | null; pointMm: Vec3; pointErrorMm?: number }
interface NormalizedBase { ownerId: string | null; point: Vec3; pointError?: number }
type Shape = { kind: 'point' } | { kind: 'line'; direction: Vec3; directionErrorRad?: number }
  | { kind: 'plane'; normal: Vec3; normalErrorRad?: number }
  | { kind: 'sphere'; radiusMm: number; radiusErrorMm?: number }
  | { kind: 'cylinder'; direction: Vec3; directionErrorRad?: number; radiusMm: number; radiusErrorMm?: number }
type NormalizedShape = { kind: 'point' } | { kind: 'line'; direction: Vec3; directionErrorRad?: number }
  | { kind: 'plane'; normal: Vec3; normalErrorRad?: number }
  | { kind: 'sphere'; radius: number; radiusError?: number }
  | { kind: 'cylinder'; direction: Vec3; directionErrorRad?: number; radius: number; radiusError?: number }
export type SymmetrySupport = WorldBase & Shape
export type ConditionedSymmetrySupport = NormalizedBase & NormalizedShape
export type SymmetryColumns = [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3]
/** Formal normalized left-retraction columns [vX,vY,vZ,wX,wY,wZ]. */
export interface SymmetryDerivative { position: SymmetryColumns; normal: SymmetryColumns | null }
export interface SymmetryOwnerDerivative extends SymmetryDerivative { ownerId: string }
export interface SymmetryDiagnostic { status: 'precisionLimit' | 'incompatibleRadius'; message: string }
export interface SymmetryComparison {
  status: 'ok'; reflected: { point: Vec3; direction: Vec3 | null }; position: Vec3; normal: Vec3 | null
  angleRadians: number | null; positionErrorMm: number; radiusDifferenceMm: number | null
  /** Conservative first-order arithmetic/input estimates, not a formal certificate. */
  precision: { normal: number; position: number }
  supports: [SymmetryDerivative, SymmetryDerivative, SymmetryDerivative]; owners: SymmetryOwnerDerivative[]
}
interface Support { ownerId: string | null; kind: SymmetrySupport['kind']; p: Vec3; n: Vec3 | null; radius: number | null; pe: number; ne: number; re: number; unresolved: boolean }
const axes: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const round = 128 * Number.EPSILON, minNormal = 2 ** -1022
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): number => Math.hypot(...a)
function vector(v: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || Reflect.ownKeys(v).length !== 4) throw new Error('Expected a dense three-coordinate vector.')
  return [0, 1, 2].map(i => { const d = Object.getOwnPropertyDescriptor(v, String(i)); if (!d || !('value' in d) || typeof d.value !== 'number' || !Number.isFinite(d.value)) throw new Error('Expected finite own numeric coordinates.'); return d.value }) as Vec3
}
function positive(n: number): number { if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) throw new Error('Expected a positive finite scale, tolerance or radius.'); return n }
function error(n: number | undefined): number { if (n === undefined) return 0; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error('Expected a finite nonnegative uncertainty.'); return n }
function config(c: SymmetryConditioning): SymmetryConditioning { return { originMm: vector(c.originMm), lengthScaleMm: positive(c.lengthScaleMm), lengthToleranceMm: positive(c.lengthToleranceMm), angleToleranceRad: positive(c.angleToleranceRad) } }
function read(s: ConditionedSymmetrySupport): Support {
  if (s.ownerId !== null && (typeof s.ownerId !== 'string' || !s.ownerId.length)) throw new Error('Support owner must be an ID or null.')
  let n: Vec3 | null = null, ne = 0, radius: number | null = null, re = 0
  switch (s.kind) {
    case 'point': break
    case 'sphere': radius = positive(s.radius); re = error(s.radiusError); break
    case 'plane': n = vector(s.normal); ne = error(s.normalErrorRad); break
    case 'line': n = vector(s.direction); ne = error(s.directionErrorRad); break
    case 'cylinder': n = vector(s.direction); ne = error(s.directionErrorRad); radius = positive(s.radius); re = error(s.radiusError); break
    default: throw new Error('Unsupported symmetry support kind.')
  }
  if (n) { const l = norm(n); if (Math.abs(l - 1) > 1e-12) throw new Error('Support direction must be unit within 1e-12.'); n = mul(n, 1 / l) }
  const p = vector(s.point), pe = error(s.pointError)
  const subnormal = (v: number): boolean => v !== 0 && Math.abs(v) < minNormal
  return { ownerId: s.ownerId, kind: s.kind, p, n, radius, pe: pe + round * norm(p), ne: ne + (n ? round : 0), re,
    unresolved: p.some(subnormal) || subnormal(pe) || subnormal(re) || radius !== null && subnormal(radius) }
}
function world(s: SymmetrySupport, c: SymmetryConditioning): Support {
  let unresolved = false
  const scaled = (n: number): number => { const v = n / c.lengthScaleMm; if (!Number.isFinite(v) || n !== 0 && Math.abs(v) < minNormal) unresolved = true; return v }
  const p = vector(s.pointMm), point = p.map((v, i) => scaled(v - c.originMm[i])) as Vec3
  const pointError = scaled(error(s.pointErrorMm)) + round * (norm(p) / c.lengthScaleMm + norm(c.originMm) / c.lengthScaleMm + norm(point))
  // Validate declarations before returning a numerical precision diagnostic.
  const normalized = { ...s, point, pointError: 0 } as unknown as ConditionedSymmetrySupport
  if (s.kind === 'sphere' || s.kind === 'cylinder') { positive(s.radiusMm); error(s.radiusErrorMm); Object.assign(normalized, { radius: scaled(s.radiusMm), radiusError: 0 }) }
  // Overflow and underflow are diagnostic, not malformed input.
  const safe = { ...normalized, point: point.map(v => Number.isFinite(v) ? v : 0) as Vec3 }
  if (safe.kind === 'sphere' || safe.kind === 'cylinder') { if (!(safe.radius > 0) || !Number.isFinite(safe.radius)) safe.radius = 1 }
  const result = read(safe)
  result.p = point; result.pe = pointError; result.unresolved = unresolved
  if (s.kind === 'sphere' || s.kind === 'cylinder') { result.radius = scaled(s.radiusMm); result.re = scaled(error(s.radiusErrorMm)) + round * Math.abs(result.radius) }
  return result
}
function zero(hasNormal: boolean): SymmetryDerivative { const cols = (): SymmetryColumns => axes.concat(axes).map(() => [0, 0, 0] as Vec3) as SymmetryColumns; return { position: cols(), normal: hasNormal ? cols() : null } }
function evaluate(a: Support, b: Support, m: Support, alignment: SymmetryAlignment, frame: Quaternion, c: SymmetryConditioning): SymmetryComparison | SymmetryDiagnostic {
  if (a.kind !== b.kind || m.kind !== 'plane') throw new Error('Symmetry requires matching entity kinds and a mirror plane.')
  const directional = a.n !== null
  if (directional ? alignment !== 'aligned' && alignment !== 'opposed' : alignment !== null) throw new Error('Alignment must be explicit for oriented supports and null for point/sphere.')
  const pose = validateRigidPose({ translation: [0, 0, 0], rotation: frame }), R = rigidRotationMatrix(pose.rotation)
  const rt = (v: Vec3): Vec3 => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]]
  const tol = c.lengthToleranceMm / c.lengthScaleMm
  const fail = (): SymmetryDiagnostic => ({ status: 'precisionLimit', message: 'Symmetry geometry or its first-order uncertainty is not representable within the requested tolerances.' })
  if (!Number.isFinite(tol) || tol < minNormal || [a, b, m].some(s => s.unresolved)) return fail()
  const mn = m.n!, u = sub(a.p, m.p), h = dot(mn, u), y = sub(a.p, mul(mn, 2 * h))
  const reflectedN = a.n ? sub(a.n, mul(mn, 2 * dot(mn, a.n))) : null
  const delta = sub(b.p, y), n = b.n, t = n ? dot(n, delta) : 0
  const pos = !n ? delta : a.kind === 'plane' ? mul(n, t) : sub(delta, mul(n, t))
  const sign = alignment === 'opposed' ? -1 : 1, q = n && reflectedN ? sub(n, mul(reflectedN, sign)) : null
  const geometryMagnitude = norm(a.p) + norm(b.p) + norm(m.p)
  // For a fixed unit mirror normal H is orthogonal: source-point error has
  // norm multiplier one, not the triangle bound of its expanded expression.
  // Mirror point error contributes 2*dm; varying the unit normal contributes
  // 2*(|a-s|+|m.(a-s)|)*dn before second-order terms.
  const reflectedError = a.pe + 2 * m.pe + 2 * (norm(u) + Math.abs(h)) * m.ne + round * geometryMagnitude
  const de = b.pe + reflectedError + round * (norm(b.p) + norm(y))
  // Both target-normal and target-transverse projectors have operator norm
  // one; only variation of the target direction adds the separate lever arm.
  const pe = !n ? de : de + 2 * norm(delta) * b.ne + round * (geometryMagnitude + norm(delta))
  const ne = directional ? a.ne + b.ne + 4 * m.ne + round : 0
  const radiusDelta = a.radius === null ? null : b.radius! - a.radius
  const radiusDifference = radiusDelta === null ? null : radiusDelta * c.lengthScaleMm
  const re = a.re + b.re + round * ((a.radius ?? 0) + (b.radius ?? 0))
  if (![pe, ne, re, radiusDifference ?? 0, ...y, ...pos, ...(q ?? [])].every(Number.isFinite) || pe > tol || ne > c.angleToleranceRad || re > tol
    || radiusDelta !== null && radiusDelta !== 0 && Math.abs(radiusDifference!) < minNormal) return fail()
  if (radiusDifference !== null && Math.abs(radiusDifference) > c.lengthToleranceMm) return { status: 'incompatibleRadius', message: 'Symmetry radii differ beyond the requested length tolerance.' }
  const blocks = [zero(directional), zero(directional), zero(directional)] as SymmetryComparison['supports']
  for (let role = 0; role < 3; role++) for (let col = 0; col < 6; col++) {
    const w: Vec3 = col < 3 ? [0, 0, 0] : axes[col - 3], v: Vec3 = col < 3 ? axes[col] : [0, 0, 0]
    const dp = (s: Support, r: number): Vec3 => role === r ? add(v, cross(w, s.p)) : [0, 0, 0]
    const dn = (s: Support, r: number): Vec3 => role === r && s.n ? cross(w, s.n) : [0, 0, 0]
    const da = dp(a, 0), db = dp(b, 1), dm = dp(m, 2), na = dn(a, 0), nb = dn(b, 1), nm = dn(m, 2)
    const dh = dot(nm, u) + dot(mn, sub(da, dm))
    const dy = sub(da, mul(add(mul(nm, h), mul(mn, dh)), 2)), dd = sub(db, dy)
    const dt = n ? dot(nb, delta) + dot(n, dd) : 0
    const projected = n ? add(mul(nb, t), mul(n, dt)) : [0, 0, 0] as Vec3
    let dpos = !n ? dd : a.kind === 'plane' ? projected : sub(dd, projected)
    if (role === 0) dpos = sub(dpos, cross(w, pos))
    blocks[role].position[col] = rt(dpos)
    if (a.n && q) {
      const dr = sub(na, mul(add(mul(nm, dot(mn, a.n)), mul(mn, dot(nm, a.n) + dot(mn, na))), 2))
      let dq = sub(nb, mul(dr, sign)); if (role === 0) dq = sub(dq, cross(w, q))
      blocks[role].normal![col] = rt(dq)
    }
  }
  const owners = new Map<string, SymmetryOwnerDerivative>()
  ;[a, b, m].forEach((s, i) => { if (s.ownerId === null) return; let block = owners.get(s.ownerId); if (!block) { block = { ownerId: s.ownerId, ...zero(directional) }; owners.set(s.ownerId, block) } for (let j = 0; j < 6; j++) { block.position[j] = add(block.position[j], blocks[i].position[j]); if (block.normal) block.normal[j] = add(block.normal[j], blocks[i].normal![j]) } })
  if ([...blocks, ...owners.values()].some(block => [...block.position, ...(block.normal ?? [])].some(v => !v.every(Number.isFinite)))) return fail()
  const position = rt(pos), normal = q ? rt(q) : null, positionErrorMm = norm(pos) * c.lengthScaleMm
  if (![...position, ...(normal ?? []), positionErrorMm].every(Number.isFinite) || norm(pos) !== 0 && positionErrorMm < minNormal) return fail()
  return { status: 'ok', reflected: { point: y, direction: reflectedN }, position, normal, angleRadians: n && reflectedN ? Math.atan2(norm(cross(n, mul(reflectedN, sign))), dot(n, mul(reflectedN, sign))) : null,
    positionErrorMm, radiusDifferenceMm: radiusDifference, precision: { normal: ne, position: pe }, supports: blocks, owners: [...owners.values()] }
}
/** Frame must be composed from the SOURCE owner's current proper rotation.
 * Position is the target-normal projection (plane), target-transverse projection
 * (line/cylinder), or full point defect. Away from orientation agreement it is
 * an anchored chart, not minimum separation between general supports.
 * Normal is a dimensionless chord vector; angleRadians is the physical report.
 * Non-null IDs do not declare mobility; callers choose physical solver columns. */
export function compareSymmetrySupports(source: SymmetrySupport, target: SymmetrySupport, mirror: SymmetrySupport & { kind: 'plane' }, alignment: SymmetryAlignment, firstFrameRotation: Quaternion, conditioning: SymmetryConditioning): SymmetryComparison | SymmetryDiagnostic {
  const c = config(conditioning)
  return evaluate(world(source, c), world(target, c), world(mirror, c), alignment, firstFrameRotation, c)
}
/** Points, radii and absolute errors are already normalized; no world add-back. */
export function compareConditionedSymmetrySupports(source: ConditionedSymmetrySupport, target: ConditionedSymmetrySupport, mirror: ConditionedSymmetrySupport & { kind: 'plane' }, alignment: SymmetryAlignment, firstFrameRotation: Quaternion, conditioning: SymmetryConditioning): SymmetryComparison | SymmetryDiagnostic {
  const c = config(conditioning)
  return evaluate(read(source), read(target), read(mirror), alignment, firstFrameRotation, c)
}
