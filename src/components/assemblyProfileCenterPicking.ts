import { nativeReferencePickContextIsCurrent, type NativeReferencePickContext } from './assemblyNativeReferencePicking'
import type { AssemblyProfileCenterSelection } from '../model/assemblyProfileCenterReferences'

export type ProfileCenterMode = 'free' | 'rectangle'
export type ProfileCenterSlot = 0 | 1
export type ProfileCenterProducer = 'face' | 'line-edge'
export interface ProfileCenterInputs {
  owner: object
  mode: ProfileCenterMode
  selections: [AssemblyProfileCenterSelection | null, AssemblyProfileCenterSelection | null]
}
export interface ProfileCenterPickContext extends NativeReferencePickContext {
  inputs: ProfileCenterInputs
  editor: string | null
}
export interface ProfileCenterPickTicket extends ProfileCenterPickContext { slot: ProfileCenterSlot; producer: ProfileCenterProducer }
export interface ProfileCenterPickerControls {
  inputs: ProfileCenterInputs
  enabled: boolean
  slot: ProfileCenterSlot | null
  producer: ProfileCenterProducer | null
  onChange: (slot: ProfileCenterSlot, selection: AssemblyProfileCenterSelection | null) => void
  onMode: (mode: ProfileCenterMode) => void
  onPick: (slot: ProfileCenterSlot, producer: ProfileCenterProducer) => void
  onCancel: () => void
}
export function profileCenterContextIsCurrent(expected: ProfileCenterPickContext, current: ProfileCenterPickContext): boolean {
  return expected.family === 'profile-center' && expected.phase === 'committed' && nativeReferencePickContextIsCurrent(expected, current)
    && expected.inputs === current.inputs && expected.editor === current.editor
}
export function currentProfileCenterPick(expected: ProfileCenterPickTicket | null, latest: ProfileCenterPickTicket | null,
  current: ProfileCenterPickContext | null, blocked: boolean): expected is ProfileCenterPickTicket {
  return !blocked && expected !== null && expected === latest && current !== null && (expected.slot === 0 || expected.slot === 1)
    && (expected.producer === 'face' || expected.producer === 'line-edge' && expected.inputs.mode === 'rectangle' && !!expected.inputs.selections[expected.slot])
    && profileCenterContextIsCurrent(expected, current)
}
