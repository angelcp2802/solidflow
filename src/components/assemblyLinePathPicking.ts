import { nativeReferencePickContextIsCurrent, type NativeReferencePickContext } from './assemblyNativeReferencePicking'
import type { AssemblyVertexReference, AssemblyEdgeReference, AssemblyFaceReference } from '../model/assemblyDocument'
import type { VertexReference } from '../cad/kernel.types'

export type LinePathPickRole = 'point' | 'edge' | 'origin' | 'up'
export type LinePathPickProducer = 'vertex' | 'line-edge' | 'face'
export const LINE_PATH_PICK_LABELS: Record<LinePathPickRole, string> = {
  point: 'Punto del trayecto LINE', edge: 'Arista del trayecto LINE', origin: 'Origen del trayecto LINE', up: 'Guía UP del trayecto LINE',
}
export interface LinePathInputs {
  owner: object
  point: AssemblyVertexReference | null
  edge: AssemblyEdgeReference | null
  origin: VertexReference | null
  guide: AssemblyFaceReference & { support: 'plane' } | null
  following: boolean
  upEnabled: boolean
}
export type LinePathInputChange = { point: LinePathInputs['point'] } | { edge: LinePathInputs['edge'] } | { origin: LinePathInputs['origin'] }
  | { guide: LinePathInputs['guide'] } | { following: boolean } | { upEnabled: boolean }
export type LinePathCurrentEdges = readonly { reference: AssemblyEdgeReference }[]
export interface LinePathPickContext extends NativeReferencePickContext { inputs: LinePathInputs; editor: string | null; edgeChoices: LinePathCurrentEdges }
export interface LinePathPickTicket extends LinePathPickContext { role: LinePathPickRole; producer: LinePathPickProducer }
export interface LinePathPickerControls {
  inputs: LinePathInputs
  enabled: boolean
  role: LinePathPickRole | null
  onPick: (role: LinePathPickRole) => void
  onChange: (change: LinePathInputChange) => void
  onCancel: () => void
}
export function linePathPickProducer(role: LinePathPickRole): LinePathPickProducer | null {
  return role === 'point' || role === 'origin' ? 'vertex' : role === 'edge' ? 'line-edge' : role === 'up' ? 'face' : null
}
/** Current identity only; a nominated origin still needs native incidence verification. */
export function currentLinePathOriginEdge(edge: AssemblyEdgeReference | null, choices: LinePathCurrentEdges): AssemblyEdgeReference | null {
  const matches = edge ? choices.filter(choice => JSON.stringify(choice.reference) === JSON.stringify(edge)) : []
  return matches.length === 1 ? matches[0].reference : null
}
export function linePathRoleIsAvailable(role: LinePathPickRole, inputs: LinePathInputs, edges: LinePathCurrentEdges = []): boolean {
  return role === 'point' || role === 'edge' || role === 'origin' && currentLinePathOriginEdge(inputs.edge, edges) !== null || role === 'up' && inputs.upEnabled
}
export function linePathPickContextIsCurrent(expected: LinePathPickContext, current: LinePathPickContext): boolean {
  return expected.family === 'line-path' && expected.phase === 'committed' && nativeReferencePickContextIsCurrent(expected, current)
    && expected.inputs === current.inputs && expected.editor === current.editor
}
export function currentLinePathPick(expected: LinePathPickTicket | null, latest: LinePathPickTicket | null,
  current: LinePathPickContext | null, blocked: boolean): expected is LinePathPickTicket {
  return !blocked && expected !== null && expected === latest && current !== null && expected.producer === linePathPickProducer(expected.role)
    && linePathRoleIsAvailable(expected.role, current.inputs, current.edgeChoices) && linePathPickContextIsCurrent(expected, current)
}
