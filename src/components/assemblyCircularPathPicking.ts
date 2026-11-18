import { nativeReferencePickContextIsCurrent, type NativeReferencePickContext } from './assemblyNativeReferencePicking'
import { currentMaterialArcPaths, materialArcKeys } from './assemblyMaterialArcPicking'
import type { AssemblyVertexReference, AssemblyFaceReference } from '../model/assemblyDocument'
import type { AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'

export type CircularPickRole = 'point' | 'arc' | 'origin' | 'up'
export type CircularPickProducer = 'vertex' | 'material-arc' | 'face'
export const CIRCULAR_PICK_LABELS: Record<CircularPickRole, string> = {
  point: 'Punto del trayecto circular', arc: 'Arco del trayecto circular', origin: 'Origen del trayecto circular', up: 'Guía UP del trayecto circular',
}
export interface CircularPathInputs {
  owner: object
  point: AssemblyVertexReference | null
  arcKey: string | null
  path: AssemblyArcPathSelection | null
  guide: AssemblyFaceReference & { support: 'plane' } | null
  following: boolean
  upEnabled: boolean
}
export type CircularPathInputChange = { point: CircularPathInputs['point'] } | { path: CircularPathInputs['path'] } | { arcKey: string }
  | { guide: CircularPathInputs['guide'] } | { following: boolean } | { upEnabled: boolean }
export type CircularPathCurrentChoices = readonly { reference: AssemblyArcPathSelection }[]
export interface CircularPickContext extends NativeReferencePickContext { inputs: CircularPathInputs; editor: string | null; pathChoices: CircularPathCurrentChoices }
export interface CircularPickTicket extends CircularPickContext { role: CircularPickRole; producer: CircularPickProducer }
export interface CircularPathPickerControls {
  inputs: CircularPathInputs
  enabled: boolean
  role: CircularPickRole | null
  onPick: (role: CircularPickRole) => void
  onChange: (change: CircularPathInputChange) => void
  onCancel: () => void
}
export function circularPickProducer(role: CircularPickRole): CircularPickProducer | null {
  return role === 'point' || role === 'origin' ? 'vertex' : role === 'arc' ? 'material-arc' : role === 'up' ? 'face' : null
}
export function circularRoleIsAvailable(role: CircularPickRole, inputs: CircularPathInputs, paths: CircularPathCurrentChoices): boolean {
  return role === 'point' || role === 'arc' && materialArcKeys(paths).length > 0
    || role === 'origin' && currentMaterialArcPaths(inputs.arcKey, paths).length === 2 || role === 'up' && inputs.upEnabled
}
export function circularContextIsCurrent(expected: CircularPickContext, current: CircularPickContext): boolean {
  return expected.family === 'circular-path' && expected.phase === 'committed' && nativeReferencePickContextIsCurrent(expected, current)
    && expected.inputs === current.inputs && expected.editor === current.editor
}
export function currentCircularPick(expected: CircularPickTicket | null, latest: CircularPickTicket | null,
  current: CircularPickContext | null, blocked: boolean): expected is CircularPickTicket {
  return !blocked && expected !== null && expected === latest && current !== null && expected.producer === circularPickProducer(expected.role)
    && circularRoleIsAvailable(expected.role, current.inputs, current.pathChoices) && circularContextIsCurrent(expected, current)
}
