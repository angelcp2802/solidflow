import { validateAssemblyPlaneReference, validateAssemblyVertexReference, type AssemblyFaceReference, type AssemblyVertexReference } from './assemblyDocument'
import { validateAssemblyLinePathSelection, type AssemblyLinePathSelection } from './assemblyLinePathReferences'

export type AssemblyLinePathPosition = { mode: 'free' }
  | { mode: 'distance'; distanceMm: number; reverse: boolean }
  | { mode: 'percent'; percent: number; reverse: boolean }
export type AssemblyLinePathAxis = 'x' | 'y' | 'z'
/** A declared material face only; current native planar support needs a fresh witness. */
export type AssemblyLinePathUpReference = AssemblyFaceReference & { support: 'plane' }
export interface AssemblyLinePathRollUp { mode: 'up'; axis: AssemblyLinePathAxis; reverse: boolean; guide: AssemblyLinePathUpReference }
export type AssemblyLinePathOrientation = { pitchYaw: 'free'; roll: 'free' }
  | { pitchYaw: { mode: 'follow'; axis: AssemblyLinePathAxis; reverse: boolean }; roll: 'free' | AssemblyLinePathRollUp }
export interface AssemblyLinePathMateRequest {
  point: AssemblyVertexReference
  path: AssemblyLinePathSelection
  position: AssemblyLinePathPosition
  orientation: AssemblyLinePathOrientation
}
export function validateAssemblyLinePathOrientation(value: unknown): AssemblyLinePathOrientation {
  const r = record(value, ['pitchYaw', 'roll'])
  if (r.pitchYaw === 'free') {
    if (r.roll !== 'free') throw Error('LINE UP roll requires explicit axis Follow.')
    return { pitchYaw: 'free', roll: 'free' }
  }
  const follow = record(r.pitchYaw, ['mode', 'axis', 'reverse'])
  if (follow.mode !== 'follow' || !['x', 'y', 'z'].includes(follow.axis as string) || typeof follow.reverse !== 'boolean') throw Error('LINE follow requires an explicit component axis and reverse flag.')
  const pitchYaw = { mode: 'follow' as const, axis: follow.axis as AssemblyLinePathAxis, reverse: follow.reverse }
  if (r.roll === 'free') return { pitchYaw, roll: 'free' }
  const up = record(r.roll, ['mode', 'axis', 'reverse', 'guide'])
  if (up.mode !== 'up' || !['x', 'y', 'z'].includes(up.axis as string) || typeof up.reverse !== 'boolean') throw Error('LINE UP roll requires an explicit component axis, reverse and material guide.')
  if (up.axis === pitchYaw.axis) throw Error('LINE Follow and UP axes must differ.')
  const guide = validateAssemblyPlaneReference(up.guide)
  if (guide.kind !== 'face') throw Error('LINE UP guide must be a material planar face.')
  if (guide.body !== null && guide.body.sourceFeatureId !== guide.face.sourceFeatureId) throw Error('LINE UP guide face and body producers must match.')
  return { pitchYaw, roll: { mode: 'up', axis: up.axis as AssemblyLinePathAxis, reverse: up.reverse, guide } }
}
/** Unsigned canonical point-component axis; the explicit reverse flag stays separate. */
export function assemblyLinePathFollowAxis(value: AssemblyLinePathOrientation): [number, number, number] | null {
  const orientation = validateAssemblyLinePathOrientation(value)
  if (orientation.pitchYaw === 'free') return null
  return orientation.pitchYaw.axis === 'x' ? [1, 0, 0] : orientation.pitchYaw.axis === 'y' ? [0, 1, 0] : [0, 0, 1]
}
/** Unsigned point-component roll axis. A guide direction and its reverse stay explicit. */
export function assemblyLinePathRollAxis(value: AssemblyLinePathOrientation): [number, number, number] | null {
  const orientation = validateAssemblyLinePathOrientation(value)
  if (orientation.roll === 'free') return null
  return orientation.roll.axis === 'x' ? [1, 0, 0] : orientation.roll.axis === 'y' ? [0, 1, 0] : [0, 0, 1]
}
function record(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('LINE path requires plain data.')
  if (Reflect.ownKeys(value).length !== names.length) throw Error('LINE path fields must be exact.')
  const result: Record<string, unknown> = {}
  for (const name of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, name)!
    if (typeof name !== 'string' || !names.includes(name) || !field.enumerable || !('value' in field)) throw Error('LINE path requires own data fields.')
    result[name] = field.value
  }
  return result
}
/** Saved explicit coordinate conversion only; neither native support nor bounds authority. */
export function coordinateAssemblyLinePathPosition(position: AssemblyLinePathPosition, lengthMm: number): number | null {
  if (typeof lengthMm !== 'number' || !Number.isFinite(lengthMm) || lengthMm <= 0) throw Error('A finite positive LINE length is required.')
  const mode = position && typeof position === 'object' ? Object.getOwnPropertyDescriptor(position, 'mode') : undefined
  if (!mode?.enumerable || !('value' in mode) || !['free', 'distance', 'percent'].includes(mode.value)) throw Error('Explicit LINE position data required.')
  const p = record(position, mode.value === 'free' ? ['mode'] : mode.value === 'distance' ? ['mode', 'distanceMm', 'reverse'] : ['mode', 'percent', 'reverse'])
  if (p.mode === 'free') return null
  const value = p.mode === 'distance' ? p.distanceMm : p.percent
  if (typeof value !== 'number' || !Number.isFinite(value) || typeof p.reverse !== 'boolean') throw Error('Finite explicit LINE position required.')
  if (value < 0 || p.mode === 'distance' && value > lengthMm || p.mode === 'percent' && value > 100) throw new RangeError('LINE position is outside its inclusive material interval.')
  const fraction = value / 100
  if (p.mode === 'percent' && value !== 0 && fraction === 0) throw Error('LINE percentage underflow.')
  const factor = p.reverse ? 1 - fraction : fraction
  const coordinate = p.mode === 'distance' ? p.reverse ? lengthMm - value : value : lengthMm * factor
  if (p.mode === 'percent' && factor !== 0 && (coordinate === 0 || Math.abs(coordinate) < 2.2250738585072014e-308)) throw Error('LINE coordinate underflow.')
  if (!Number.isFinite(coordinate)) throw Error('LINE coordinate overflow.')
  return coordinate
}
/** Saved syntax only. Current exact incidence and placement require worker proofs. */
export function validateAssemblyLinePathMateRequest(value: unknown): AssemblyLinePathMateRequest {
  const r = record(value, ['point', 'path', 'position', 'orientation'])
  const mode = r.position && typeof r.position === 'object' ? Object.getOwnPropertyDescriptor(r.position, 'mode') : undefined
  if (!mode?.enumerable || !('value' in mode) || !['free', 'distance', 'percent'].includes(mode.value)) throw Error('LINE path position mode must be explicit data.')
  const p = record(r.position, mode.value === 'free' ? ['mode'] : mode.value === 'distance' ? ['mode', 'distanceMm', 'reverse'] : ['mode', 'percent', 'reverse'])
  let position: AssemblyLinePathPosition = { mode: 'free' }
  if (p.mode !== 'free') {
    const n = p.mode === 'distance' ? p.distanceMm : p.percent
    if (typeof n !== 'number' || !Number.isFinite(n) || typeof p.reverse !== 'boolean') throw Error('LINE path quantity and reverse must be finite explicit data.')
    if (n < 0 || p.mode === 'percent' && n > 100) throw new RangeError('LINE distance must be nonnegative and percent must be in [0,100].')
    position = p.mode === 'distance' ? { mode: 'distance', distanceMm: n, reverse: p.reverse } : { mode: 'percent', percent: n, reverse: p.reverse }
  }
  return { point: validateAssemblyVertexReference(r.point), path: validateAssemblyLinePathSelection(r.path), position, orientation: validateAssemblyLinePathOrientation(r.orientation) }
}
