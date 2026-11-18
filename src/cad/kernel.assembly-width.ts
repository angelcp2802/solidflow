import type { Vec3 } from './kernel.types'
import { assemblyEndpointPlacementArithmetic, type AssemblyGeometrySnapshot,
  type ResolvedAssemblyWidthMate } from './kernel.assembly-snapshot'
import type { AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyWidthCenteredSupportReport } from './kernel.assembly-types'

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** Independent physical final measurement from four fresh authenticated native
 * plane witnesses. No numerical residual/Jacobian or solved midpoint is reused. */
export function measureAssemblyWidthWitnesses(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  item: ResolvedAssemblyWidthMate, requestedLengthTolerance: number, angleTolerance: number): AssemblyWidthCenteredSupportReport {
  if (!Number.isFinite(requestedLengthTolerance) || requestedLengthTolerance <= 0 || !Number.isFinite(angleTolerance)
    || angleTolerance <= 0 || angleTolerance >= Math.PI) throw new Error('Tolerancias de verificación de anchura no válidas.')
  const planes = [...item.width, ...item.tab].map(witness => {
    snapshot.assertWitness(witness, document)
    if (witness.kind !== 'support' || witness.localSupport.kind !== 'plane' || witness.worldSupport.kind !== 'plane') throw new Error('La anchura necesita cuatro planos nativos actuales.')
    const arithmetic = assemblyEndpointPlacementArithmetic(witness, document)
    return { point: [...witness.worldSupport.point] as Vec3, normal: [...witness.worldSupport.normal] as Vec3,
      tolerance: witness.localSupport.tolerance,
      pointError: 128 * Number.EPSILON * (arithmetic.depth + 1) * (arithmetic.placementSum + Math.hypot(...witness.localSupport.point)),
      normalError: 128 * Number.EPSILON * (arithmetic.depth + 1) }
  })
  const anchor = planes[0].point
  const pair = (first: number, branch: 'sum' | 'difference') => {
    const a = planes[first], b = planes[first + 1], sign = branch === 'sum' ? 1 : -1
    const combined = a.normal.map((value, axis) => value + sign * b.normal[axis]) as Vec3
    const length = Math.hypot(...combined), directionError = a.normalError + b.normalError
    if (!(length > 2 * directionError)) throw new RangeError('La bisectriz seleccionada no conserva una normal verificable.')
    const normal = combined.map(value => value / length) as Vec3
    const relative = (point: Vec3): Vec3 => point.map((value, axis) => value - anchor[axis]) as Vec3
    const pa = relative(a.point), pb = relative(b.point)
    const offset = (dot(a.normal, pa) + sign * dot(b.normal, pb)) / length
    const magnitude = Math.hypot(...a.point) + Math.hypot(...b.point) + 2 * Math.hypot(...anchor)
    const normalError = 2 * directionError / length
    const offsetError = (a.pointError + b.pointError + 128 * Number.EPSILON * magnitude
      + a.normalError * Math.hypot(...pa) + b.normalError * Math.hypot(...pb) + Math.abs(offset) * directionError) / (length - directionError)
    return { normal, offset, length, normalError, offsetError }
  }
  const width = pair(0, item.mate.widthBranch), tab = pair(2, item.mate.tabBranch), sign = item.mate.alignment === 'aligned' ? 1 : -1
  const a = width.normal.map(value => sign * value) as Vec3, b = tab.normal
  const cross: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const angleRadians = Math.atan2(Math.hypot(...cross), dot(a, b)), offsetMm = tab.offset - sign * width.offset
  const lengthTolerance = Math.max(requestedLengthTolerance, planes.reduce((sum, plane) => sum + plane.tolerance, 0))
  if (![angleRadians, offsetMm, lengthTolerance, width.offsetError, tab.offsetError, width.normalError, tab.normalError].every(Number.isFinite)
    || width.offsetError + tab.offsetError > lengthTolerance || width.normalError + tab.normalError > angleTolerance) throw new RangeError('Las cuatro referencias exceden la precisión de verificación solicitada.')
  if (angleRadians > angleTolerance || Math.abs(offsetMm) > lengthTolerance) throw new Error('La verificación nativa no conserva el centrado de los cuatro planos.')
  return { kind: 'width', mode: 'centered', scopePath: [...item.scopePath], mateId: item.mate.id,
    widthBranch: item.mate.widthBranch, tabBranch: item.mate.tabBranch, alignment: item.mate.alignment,
    angleRadians, offsetMm, lengthTolerance, angleTolerance,
    branchLengths: { width: width.length, tab: tab.length }, supportOnly: true }
}
