import { getOC, type Edge } from 'replicad'
import type { Vec3 } from './kernel.types'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'

export interface AssemblyPathCurveBands { lengthToleranceMm?: number; angleToleranceRad?: number }
export interface AssemblyPathCurvePrecision { positionMm: number; lengthMm: number; tangentRad: number }
/** Arithmetic of the declared current native analytic Float64 parameters;
 * not calibrated physical metrology and independent of topology tolerance. */
export interface AssemblyCircleArithmetic {
 referenceModel:'current-native-analytic-float64'
 /** Center coordinates only, before occurrence placement. */
 positionMm:number
 radiusMm:number
 /** Whole proper analytic frame; material phase is added by the arc purpose. */
 frameRad:number
 sweepRad:number
}
export interface AssemblyCircleFrameDefects {normalNorm:number;xDirectionNorm:number;orthogonality:number}
interface CurveBase {
  parameterDomain: { first: number; last: number }
  sense: 1 | -1
  startParameter: number; endParameter: number
  startPoint: Vec3; endPoint: Vec3
  /** Actual native adaptor flags. A periodic underlying circle can be trimmed. */
  closed: boolean; periodic: boolean; period: number | null
  lengthMm: number; parameterSpeed: number; nativeToleranceMm: number
  precision: AssemblyPathCurvePrecision
  /** A current observation, never a persistent path origin or reference proof. */
  coordinatePolicy: 'native-parameter-times-explicit-sense'
}
export type AssemblyPathCurveObservation = CurveBase & (
  | { kind: 'line'; firstPoint: Vec3; increasingDirection: Vec3 }
  | { kind: 'circle'; center: Vec3; normal: Vec3; xDirection: Vec3; radiusMm: number; analyticArithmetic?:AssemblyCircleArithmetic; rawFrameDefects?:AssemblyCircleFrameDefects }
)
export type AssemblyPathCurveCoordinate = { kind: 'parameter'; parameter: number } | { kind: 'arc-length'; distanceMm: number }
export interface AssemblyPathCurveEvaluation {
  observation: AssemblyPathCurveObservation
  parameter: number; arcLengthMm: number; point: Vec3; tangent: Vec3
  precision: AssemblyPathCurvePrecision
}
export class UnsupportedAssemblyPathCurveError extends Error {
  constructor() { super('Bounded path observation currently requires an actual native LINE or circular edge.'); this.name = 'UnsupportedAssemblyPathCurveError' }
}
export class AssemblyPathCurvePrecisionError extends RangeError {
  constructor() { super('Bounded path curve precisionLimit: requested numerical resolution cannot be retained.'); this.name = 'AssemblyPathCurvePrecisionError' }
}
const ROUND = 128 * Number.EPSILON, MIN = 2 ** -1022
const norm = (v: Vec3) => Math.hypot(...v)
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0)
const tiny = (v: number) => v !== 0 && Math.abs(v) < MIN
function check(ok: boolean, message: string): asserts ok { if (!ok) throw Error(message) }
function scalar(v: unknown): number { check(typeof v === 'number' && Number.isFinite(v), 'Path coordinates must be finite numerical data.'); return v }
function record(value: unknown, allowed: string[], required = allowed): Record<string, unknown> {
  check(!!value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'Path options require plain data.')
  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    check(typeof key === 'string' && allowed.includes(key) && !!field.enumerable && 'value' in field, 'Path options require exact own data fields.')
    result[key] = field.value
  }
  check(required.every(key => Object.hasOwn(result, key)), 'Missing path coordinate fields.')
  return result
}
function bands(value: AssemblyPathCurveBands) {
  const r = record(value, ['lengthToleranceMm', 'angleToleranceRad'], []), length = scalar(r.lengthToleranceMm ?? 1e-6), angle = scalar(r.angleToleranceRad ?? 1e-8)
  check(length > 0 && angle > 0 && angle < Math.PI, 'Path bands must be positive, with angle below pi.')
  if (tiny(length) || tiny(angle)) throw new AssemblyPathCurvePrecisionError()
  return { length, angle }
}
function coordinates(value: { X(): number; Y(): number; Z(): number }): Vec3 {
  const p: Vec3 = [value.X(), value.Y(), value.Z()]
  check(p.every(Number.isFinite), 'Path native coordinates must be finite.')
  if (p.some(tiny)) throw new AssemblyPathCurvePrecisionError()
  return p
}
function unit(p: Vec3): Vec3 {
  const length = norm(p)
  if (!Number.isFinite(length) || length < MIN) throw new AssemblyPathCurvePrecisionError()
  return p.map(v => v / length) as Vec3
}
/** Absolute arithmetic allowance for the raw subtraction of native analytic
 * Float64 parameters. No period reduction or topology tolerance is involved. */
export function assemblyCircleSweepArithmetic(first:number,last:number):number{
 const span=last-first
 check(Number.isFinite(first)&&Number.isFinite(last)&&Number.isFinite(span)&&span>0,'Circular sweep needs finite increasing native parameters.')
 const error=ROUND*(Math.abs(first)+Math.abs(last)+Math.abs(span))
 if(!Number.isFinite(error)||error===0||tiny(error))throw new AssemblyPathCurvePrecisionError()
 return error
}
function observe(edge: Edge, sense: 1 | -1, requested: ReturnType<typeof bands>, owners: NativeOwners) {
  const oc = getOC(), raw = edge?.wrapped
  check(raw && !raw.IsNull() && raw.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_EDGE, 'Path observation requires an actual native edge.')
  const orientation = raw.Orientation()
  check(orientation === oc.TopAbs_Orientation.TopAbs_FORWARD || orientation === oc.TopAbs_Orientation.TopAbs_REVERSED, 'Path edge orientation must be forward or reversed.')
  check(owners.own(new oc.BRepCheck_Analyzer(raw, true, false, false)).IsValid(), 'Path edge is not a valid BRep.')
  const curve = owners.own(new oc.BRepAdaptor_Curve(raw)), type = curve.GetType()
  if (type !== oc.GeomAbs_CurveType.GeomAbs_Line && type !== oc.GeomAbs_CurveType.GeomAbs_Circle) throw new UnsupportedAssemblyPathCurveError()
  const first = curve.FirstParameter(), last = curve.LastParameter(), span = last - first
  check(Number.isFinite(first) && Number.isFinite(last) && last > first && Number.isFinite(span), 'Path needs a finite increasing native parameter domain.')
  if ([first, last, span].some(tiny)) throw new AssemblyPathCurvePrecisionError()
  let tolerance = oc.BRep_Tool.Tolerance(raw)
  check(Number.isFinite(tolerance) && tolerance >= 0, 'Path edge tolerance must be finite and nonnegative.')
  if (tiny(tolerance)) throw new AssemblyPathCurvePrecisionError()
  // Edge endpoint occurrences are bounded before ownership publication. A
  // complete circle has one unique seam vertex occurring twice; arcs/segments
  // have two unique vertices. Coordinates never establish identity.
  const explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE))
  const vertices: ReturnType<typeof explorer.Current>[] = []; let count = 0
  while (explorer.More()) {
    const v = owners.own(explorer.Current()); check(++count <= 2, 'Path edge exceeds its endpoint topology budget.')
    if (!vertices.some(p => p.IsSame(v))) vertices.push(v)
    explorer.Next()
  }
  const endpoints = vertices.map(v => {
    // Downcast via the public wrapper, retaining both raw and cast ownership.
    const vertex = owners.own(oc.TopoDS.Vertex(v)), t = oc.BRep_Tool.Tolerance(vertex)
    check(Number.isFinite(t) && t >= 0, 'Path vertex tolerance must be finite and nonnegative.')
    if (tiny(t)) throw new AssemblyPathCurvePrecisionError()
    tolerance = Math.max(tolerance, t)
    return coordinates(owners.own(oc.BRep_Tool.Pnt(vertex)))
  })
  const p0 = coordinates(owners.own(curve.Value(first))), p1 = coordinates(owners.own(curve.Value(last)))
  const point = owners.own(new oc.gp_Pnt()), derivative = owners.own(new oc.gp_Vec())
  curve.D1(first, point, derivative)
  const rawTangent = coordinates(derivative), speed = norm(rawTangent), increasingDirection = unit(rawTangent)
  const closed = curve.IsClosed(), periodic = curve.IsPeriodic(), period = periodic ? curve.Period() : null
  check(typeof closed === 'boolean' && typeof periodic === 'boolean' && (period === null || Number.isFinite(period) && period > 0), 'Invalid native periodic path metadata.')
  let analytic: { kind: 'line'; firstPoint: Vec3; increasingDirection: Vec3 } | { kind: 'circle'; center: Vec3; normal: Vec3; xDirection: Vec3; radiusMm: number }
  let parameterSpeed: number, radius = 0, frameError = ROUND
  let analyticArithmetic:AssemblyCircleArithmetic|undefined,rawFrameDefects:AssemblyCircleFrameDefects|undefined
  if (type === oc.GeomAbs_CurveType.GeomAbs_Line) {
    check(!closed && !periodic && endpoints.length === 2, 'Finite LINE must have two distinct endpoints and no periodic seam.')
    parameterSpeed = speed
    analytic = { kind: 'line', firstPoint: p0, increasingDirection }
  } else {
    const circle = owners.own(curve.Circle()), position = owners.own(circle.Position())
    const center = coordinates(owners.own(circle.Location())),rawNormal=coordinates(owners.own(position.Direction())),rawX=coordinates(owners.own(position.XDirection()))
    radius = circle.Radius(); check(Number.isFinite(radius) && radius > 0, 'Path circle needs a positive finite radius.')
    if (tiny(radius)) throw new AssemblyPathCurvePrecisionError()
    const normal=unit(rawNormal),rawXUnit=unit(rawX),orthogonality=dot(normal,rawXUnit)
    rawFrameDefects={normalNorm:Math.abs(norm(rawNormal)-1),xDirectionNorm:Math.abs(norm(rawX)-1),orthogonality:Math.abs(orthogonality)}
    check(rawFrameDefects.normalNorm<=1e-8&&rawFrameDefects.xDirectionNorm<=1e-8&&rawFrameDefects.orthogonality<=1e-12,'Path circle raw frame is unresolved.')
    const xDirection=unit(sub(rawXUnit,normal.map(v=>orthogonality*v) as Vec3))
    const correction=rawFrameDefects.normalNorm+rawFrameDefects.xDirectionNorm+Math.asin(Math.min(1,rawFrameDefects.orthogonality))
    const axesArithmetic=ROUND*(1+norm(rawNormal)+norm(rawX))+correction
    // Explicit scalar representation/calculation allowances for current native
    // analytic data. No edge/vertex tolerance enters these radius/angle fields.
    const centerArithmetic=ROUND*norm(center),radiusArithmetic=ROUND*radius,sweepArithmetic=assemblyCircleSweepArithmetic(first,last)
    if(![axesArithmetic,centerArithmetic,radiusArithmetic,sweepArithmetic].every(Number.isFinite)||radiusArithmetic===0||sweepArithmetic===0||[centerArithmetic,radiusArithmetic,sweepArithmetic].some(tiny)||norm(center)>0&&centerArithmetic===0)throw new AssemblyPathCurvePrecisionError()
    analyticArithmetic={referenceModel:'current-native-analytic-float64',positionMm:centerArithmetic,radiusMm:radiusArithmetic,frameRad:axesArithmetic,sweepRad:sweepArithmetic}
    frameError+=correction
    check(Math.abs(dot(normal, xDirection)) <= 1e-12, 'Path circle frame is not orthonormal.')
    check(span <= 2 * Math.PI + 64 * Number.EPSILON, 'A single circular edge may not encode multiple turns.')
    check(endpoints.length === (closed ? 1 : 2), 'Circle trim/seam endpoint topology is inconsistent.')
    if (closed) check(Math.abs(span - 2 * Math.PI) <= 1e-12, 'Closed circle must cover exactly one native period.')
    if (period !== null) check(Math.abs(period - 2 * Math.PI) <= 1e-12, 'Circle native period is inconsistent.')
    parameterSpeed = radius; frameError += ROUND * (1 + Math.abs(first) + Math.abs(last))
    analytic = { kind: 'circle', center, normal, xDirection, radiusMm: radius }
  }
  const lengthMm = parameterSpeed * span
  if (!Number.isFinite(lengthMm) || lengthMm < MIN || !Number.isFinite(speed) || speed < MIN) throw new AssemblyPathCurvePrecisionError()
  const magnitude = norm(p0) + norm(p1) + (analytic.kind === 'circle' ? norm(analytic.center) + radius * (1 + Math.abs(first) + Math.abs(last)) : lengthMm)
  const arithmetic = ROUND * (magnitude + lengthMm), positionMm = tolerance + arithmetic
  const lengthError = 2 * tolerance + (analytic.kind === 'circle' ? tolerance * span : 0) + arithmetic
  const precision = { positionMm, lengthMm: lengthError, tangentRad: frameError }
  if (!Object.values(precision).every(Number.isFinite) || positionMm > requested.length || lengthError > requested.length || frameError > requested.angle) throw new AssemblyPathCurvePrecisionError()
  const endpointBand = 2 * tolerance + arithmetic, near = (a: Vec3, b: Vec3) => norm(sub(a, b)) <= endpointBand
  if (closed) check(near(p0, endpoints[0]) && near(p1, endpoints[0]), 'Native circle seam points disagree with its vertex.')
  else {
    const forward = near(p0, endpoints[0]) && near(p1, endpoints[1]), reversed = near(p0, endpoints[1]) && near(p1, endpoints[0])
    check(forward !== reversed, 'Native path parameter endpoints do not uniquely match its vertices.')
  }
  check(near(coordinates(point), p0), 'Native path D1 point disagrees with its endpoint.')
  const expected = (u: number): Vec3 => analytic.kind === 'line' ? p0.map((v, i) => v + (u - first) * parameterSpeed * increasingDirection[i]) as Vec3
    : analytic.center.map((v, i) => v + radius * (Math.cos(u) * analytic.xDirection[i] + Math.sin(u) * cross(analytic.normal, analytic.xDirection)[i])) as Vec3
  check(near(expected(first), p0) && near(expected(last), p1), 'Native curve geometry disagrees with its trimmed endpoints.')
  check(Math.abs(speed - parameterSpeed) <= ROUND * Math.max(speed, parameterSpeed) * 8, 'Native path speed disagrees with its analytic curve.')
  const expectedTangent = (u: number): Vec3 => analytic.kind === 'line' ? unit(sub(p1, p0))
    : unit(analytic.xDirection.map((v, i) => -Math.sin(u) * v + Math.cos(u) * cross(analytic.normal, analytic.xDirection)[i]) as Vec3)
  const tangentDiscrepancy = Math.atan2(norm(cross(increasingDirection, expectedTangent(first))), dot(increasingDirection, expectedTangent(first)))
  precision.tangentRad += tangentDiscrepancy
  if (precision.tangentRad > requested.angle) throw new AssemblyPathCurvePrecisionError()
  const observation: AssemblyPathCurveObservation = { ...analytic, parameterDomain: { first, last }, sense,
    startParameter: sense === 1 ? first : last, endParameter: sense === 1 ? last : first,
    startPoint: sense === 1 ? p0 : p1, endPoint: sense === 1 ? p1 : p0, closed, periodic, period,
    lengthMm, parameterSpeed, nativeToleranceMm: tolerance, precision,...(analytic.kind==='circle'?{analyticArithmetic,rawFrameDefects}:{}), coordinatePolicy: 'native-parameter-times-explicit-sense' }
  return { observation, curve, expected, expectedTangent, endpointBand, requested }
}

/** Borrowed bounded native edge -> detached LINE/circle data. TopAbs reversal
 * does not alter the explicit increasing-parameter sense. A current closed seam
 * is observed, never authenticated by a direction-insensitive edge key. */
export function observeAssemblyPathCurve(edge: Edge, sense: 1 | -1, options: AssemblyPathCurveBands = {}): AssemblyPathCurveObservation {
  check(sense === 1 || sense === -1, 'Path sense must be exactly +1 or -1.'); const requested = bands(options)
  return withNativeOwners(owners => observe(edge, sense, requested, owners).observation, undefined, 'Assembly path curve observation or release failed.')
}
/** Fresh exact analytic length-coordinate query; no nearest point, extrapolation,
 * clamping, periodic wrapping, saved origin or external mate-mode semantics. */
export function evaluateAssemblyPathCurve(edge: Edge, sense: 1 | -1, coordinate: AssemblyPathCurveCoordinate,
  options: AssemblyPathCurveBands = {}): AssemblyPathCurveEvaluation {
  check(sense === 1 || sense === -1, 'Path sense must be exactly +1 or -1.')
  const kind = coordinate && typeof coordinate === 'object' ? Object.getOwnPropertyDescriptor(coordinate, 'kind') : undefined
  check(!!kind?.enumerable && 'value' in kind && (kind.value === 'parameter' || kind.value === 'arc-length'), 'Path coordinate kind must be explicit.')
  const data = record(coordinate, kind.value === 'parameter' ? ['kind', 'parameter'] : ['kind', 'distanceMm']), value = scalar(data[kind.value === 'parameter' ? 'parameter' : 'distanceMm']), requested = bands(options)
  if (tiny(value)) throw new AssemblyPathCurvePrecisionError()
  return withNativeOwners(owners => {
    const { observation: o, curve, expected, expectedTangent, endpointBand } = observe(edge, sense, requested, owners), { first, last } = o.parameterDomain
    let parameter: number, arcLengthMm: number
    if (kind.value === 'parameter') {
      check(value >= first && value <= last, 'Path parameter is outside the selected trim.'); parameter = value
      arcLengthMm = (sense === 1 ? value - first : last - value) * o.parameterSpeed
    } else {
      check(value >= 0 && value <= o.lengthMm, 'Path distance is outside the selected bounded curve.'); arcLengthMm = value
      parameter = value === 0 ? o.startParameter : value === o.lengthMm ? o.endParameter : o.startParameter + sense * value / o.parameterSpeed
    }
    if (!Number.isFinite(parameter) || !Number.isFinite(arcLengthMm) || tiny(parameter) || tiny(arcLengthMm)) throw new AssemblyPathCurvePrecisionError()
    check(parameter >= first && parameter <= last, 'Path length inversion exceeded its selected trim.')
    const point = owners.own(new (getOC().gp_Pnt)()), tangent = owners.own(new (getOC().gp_Vec)())
    curve.D1(parameter, point, tangent)
    const p = coordinates(point), raw = coordinates(tangent), speed = norm(raw), t = unit(raw).map(v => sense * v) as Vec3
    check(norm(sub(p, expected(parameter))) <= endpointBand, 'Native evaluated point disagrees with its bounded analytic curve.')
    check(Math.abs(speed - o.parameterSpeed) <= ROUND * Math.max(speed, o.parameterSpeed) * 8, 'Native evaluated curve speed changed.')
    const additional = ROUND * (norm(p) + Math.abs(parameter) * o.parameterSpeed + o.lengthMm)
    const analyticTangent = expectedTangent(parameter).map(v => sense * v) as Vec3
    const discrepancy = Math.atan2(norm(cross(t, analyticTangent)), dot(t, analyticTangent))
    const precision = { positionMm: o.precision.positionMm + additional, lengthMm: o.precision.lengthMm + additional,
      tangentRad: o.precision.tangentRad + ROUND * (1 + Math.abs(parameter)) + discrepancy }
    if (!Object.values(precision).every(Number.isFinite) || precision.positionMm > requested.length || precision.lengthMm > requested.length || precision.tangentRad > requested.angle) throw new AssemblyPathCurvePrecisionError()
    return { observation: o, parameter, arcLengthMm, point: p, tangent: t, precision }
  }, undefined, 'Assembly path curve evaluation or release failed.')
}
