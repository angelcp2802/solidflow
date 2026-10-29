import { Quaternion, Vector3 } from 'three'
import type { AssemblySceneFace } from '../cad/kernel.assembly-types'
import { validateRigidPose } from '../model/rigidPose'
import { assemblyFaceKey } from './AssemblyViewport'
import type { AssemblyOriginDisplay } from './assemblyOriginPicking'
import type { AssemblyOriginTreeEntry } from './assemblyOriginTree'
import { assemblyBrowseSelectionOrComponent, nominateAssemblyBrowseFace, nominateAssemblyBrowseOrigin, nominateAssemblyBrowseUnsupported,
  type AssemblyBrowseContext, type AssemblyBrowseSelection } from './assemblyBrowseSelection'
import { validateNormalToTarget, type NormalToPlane, type NormalToTarget } from './normalToView'

export type AssemblyNormalContext = AssemblyBrowseContext
export type AssemblyNormalSelection = AssemblyBrowseSelection
const sameContext = (a: AssemblyNormalContext, b: AssemblyNormalContext) => a.documentSignature === b.documentSignature
  && Object.is(a.sessionIdentity, b.sessionIdentity) && a.scene === b.scene
  && a.scopePath.length === b.scopePath.length && a.scopePath.every((value, index) => value === b.scopePath[index])

/** Camera nomination shares browse identities; its geometry contract stays separate. */
export function nominateAssemblyNormalFace(previous: AssemblyNormalSelection | null, face: AssemblySceneFace | null,
  empty: boolean, context: AssemblyNormalContext, additive: boolean, unresolvedKey = 'unresolved-visible-surface'): AssemblyNormalSelection {
  return nominateAssemblyBrowseFace(previous, face, empty, context, additive, unresolvedKey)
}
export function nominateAssemblyNormalUnsupported(key: string, context: AssemblyNormalContext): AssemblyNormalSelection {
  return nominateAssemblyBrowseUnsupported(key, context)
}
/** An edit may clear camera nomination while retaining a component's ordinary UI selection. */
export function assemblyNormalSelectionOrComponent(selection: AssemblyNormalSelection | null, componentKey: string | null,
  context: AssemblyNormalContext): AssemblyNormalSelection | null {
  return assemblyBrowseSelectionOrComponent(selection, componentKey, context)
}
export function nominateAssemblyNormalOrigin(previous: AssemblyNormalSelection | null, entry: AssemblyOriginTreeEntry,
  context: AssemblyNormalContext, additive: boolean): AssemblyNormalSelection {
  return nominateAssemblyBrowseOrigin(previous, entry, context, additive)
}

function originPlane(display: AssemblyOriginDisplay): NormalToPlane | null {
  if (display.reference.kind !== 'principal-plane') return null
  try {
    const pose = validateRigidPose(display.worldPose), q = new Quaternion(...pose.rotation)
    const axes = display.reference.plane === 'XY' ? [[1, 0, 0], [0, 0, 1]]
      : display.reference.plane === 'XZ' ? [[1, 0, 0], [0, -1, 0]] : [[0, 1, 0], [1, 0, 0]]
    return { origin: [...pose.translation], xDirection: new Vector3(...axes[0]).applyQuaternion(q).toArray(),
      normal: new Vector3(...axes[1]).applyQuaternion(q).toArray() }
  } catch { return null }
}

/** Re-resolve current world geometry; no inherited or scope-relative pose is applied twice. */
export function resolveAssemblyNormalSelection(selection: AssemblyNormalSelection | null, context: AssemblyNormalContext,
  origins: readonly AssemblyOriginTreeEntry[]): { target: NormalToTarget | null; faces: AssemblySceneFace[]; origins: AssemblyOriginDisplay[] } {
  const result: { target: NormalToTarget | null; faces: AssemblySceneFace[]; origins: AssemblyOriginDisplay[] } = { target: null, faces: [], origins: [] }
  if (!selection) return { ...result, target: { kind: 'none' } }
  if (!context.documentSignature || context.sessionIdentity == null || !context.scene || !sameContext(selection, context)) return result
  if (!selection.items.length) return { ...result, target: { kind: 'none' } }
  if (selection.items.length > 2) return result
  const targets: Exclude<NormalToTarget, { kind: 'none' } | { kind: 'planes' }>[] = []
  for (const item of selection.items) {
    if (item.kind === 'unsupported' || item.kind === 'edge') return result
    if (item.kind === 'origin') {
      const matches = origins.filter(value => value.treeKey === item.key && value.binding === item.binding)
      if (matches.length !== 1) return result
      result.origins.push(matches[0].display)
      const frame = originPlane(matches[0].display)
      if (!frame) return result
      targets.push({ kind: 'plane', key: item.key, frame })
    } else {
      const matches = context.scene.bodies.filter(body => body.visible).flatMap(body => body.faces).filter(face => assemblyFaceKey(face) === item.key)
      if (matches.length !== 1) return result
      const face = matches[0], support = face.worldSupport
      result.faces.push(face)
      if (support?.kind === 'plane') targets.push({ kind: 'plane', key: item.key,
        frame: { origin: support.point, normal: support.normal, xDirection: support.xDirection } })
      else if (face.worldViewAxis) targets.push({ kind: 'axis', key: item.key,
        point: face.worldViewAxis.point, direction: face.worldViewAxis.direction, xDirection: face.worldViewAxis.xDirection })
      else if (support?.kind === 'cylinder') targets.push({ kind: 'axis', key: item.key,
        point: support.point, direction: support.axis, xDirection: support.xDirection })
      else return result
    }
  }
  const target = targets.length === 1 ? targets[0] : targets.length === 2 && targets[0].kind === 'plane' && targets[1].kind === 'plane'
    ? { kind: 'planes' as const, key: JSON.stringify(targets.map(value => value.key)), first: targets[0].frame, second: targets[1].frame } : null
  if (target && validateNormalToTarget(target)) result.target = target
  return result
}
