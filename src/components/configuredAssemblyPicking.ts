import type { AssemblyScene, AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import { assemblyComponentKey, assemblyFaceKey, assemblyEdgeKey } from './AssemblyViewport'
import { configuredMateUiRoleChoices, configuredMateUiRoleLabels, type ConfiguredMateDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

export interface ConfiguredMatePick { slot: number; kind: 'face' | 'edge' }

/** Display highlights only: resolve each saved role through the same current
 * visible catalog and scoped role checks as a pointer nomination. */
export function configuredMateHighlights(scene: AssemblyScene | null, scope: readonly string[],
  draft: ConfiguredMateDraft | null, choices: readonly ConfiguredMateUiChoice[]): { faces: AssemblySceneFace[]; edges: AssemblySceneEdge[] } {
  const faces: AssemblySceneFace[] = [], edges: AssemblySceneEdge[] = []
  if (!scene || !draft) return { faces, edges }
  draft.references.forEach((reference, slot) => {
    if (!reference || (reference.kind !== 'face' && reference.kind !== 'edge') || !reference.component) return
    const pick = { slot, kind: reference.kind }
    const worldComponent = { ...reference.component, occurrencePath: [...scope, ...reference.component.occurrencePath] }
    const material = reference.kind === 'face' ? reference.face : reference.edge
    const key = JSON.stringify([assemblyComponentKey(worldComponent), reference.body ? [reference.body.bodyId, reference.body.sourceFeatureId] : null, material.sourceFeatureId, material.key])
    const matches = (reference.kind === 'face'
      ? scene.bodies.filter(body => body.visible).flatMap(body => body.faces).filter(hit => assemblyFaceKey(hit) === key)
      : scene.bodies.filter(body => body.visible).flatMap(body => body.edges ?? []).filter(hit => assemblyEdgeKey(hit) === key))
    if (matches.length !== 1) return
    const hit = matches[0]
    const choice = configuredMatePickChoice(scene, scope, draft, choices, pick, hit)
    // The nomination has authenticated component/body/material identity; its
    // purpose must also match, independently of saved object property order.
    if (!choice || choice.reference.kind !== reference.kind || !('support' in choice.reference) || choice.reference.support !== reference.support) return
    if ('face' in hit.selection) { const face = hit as AssemblySceneFace; if (!faces.includes(face)) faces.push(face) }
    else { const edge = hit as AssemblySceneEdge; if (!edges.includes(edge)) edges.push(edge) }
  })
  return { faces, edges }
}

/** Display nomination only. The native preview retains all authentication. */
export function configuredComponentPick(scene: AssemblyScene | null, component: AssemblyComponentReference | null, scope: readonly string[]): string | null {
  if (!scene || !component || component.occurrencePath.length <= scope.length || !scope.every((id, i) => component.occurrencePath[i] === id)) return null
  if (!scene.bodies.some(body => body.visible && assemblyComponentKey(body.component) === assemblyComponentKey(component))) return null
  // A nested leaf selects its immediate rigid owner in the active editing scope.
  return component.occurrencePath[scope.length]
}

/** Resolve only the identity of a hit against the current visible catalog.
 * Never use incoming support metadata to choose a saved reference purpose. */
export function configuredMatePickChoice(scene: AssemblyScene | null, scope: readonly string[], draft: ConfiguredMateDraft,
  choices: readonly ConfiguredMateUiChoice[], pick: ConfiguredMatePick, hit: AssemblySceneFace | AssemblySceneEdge | null): ConfiguredMateUiChoice | null {
  if (!scene || !hit || !Number.isInteger(pick.slot) || pick.slot < 0 || pick.slot >= configuredMateUiRoleLabels(draft).length) return null
  const matches = pick.kind === 'face' && 'face' in hit.selection
    ? scene.bodies.filter(body => body.visible).flatMap(body => body.faces).filter(face => assemblyFaceKey(face) === assemblyFaceKey(hit as AssemblySceneFace))
    : pick.kind === 'edge' && 'edge' in hit.selection
      ? scene.bodies.filter(body => body.visible).flatMap(body => body.edges ?? []).filter(edge => assemblyEdgeKey(edge) === assemblyEdgeKey(hit as AssemblySceneEdge)) : []
  if (matches.length !== 1) return null
  const actual = matches[0], component = actual.selection.component
  if (!configuredComponentPick(scene, component, scope)) return null
  const localComponent = { ...component, occurrencePath: component.occurrencePath.slice(scope.length) }
  const candidates = configuredMateUiRoleChoices(draft, pick.slot, choices).filter(({ reference }) => {
    if (reference.kind !== pick.kind || !reference.component || assemblyComponentKey(reference.component) !== assemblyComponentKey(localComponent)) return false
    if (reference.body === null ? actual.selection.body !== null : actual.selection.body === null
      || reference.body.bodyId !== actual.selection.body.bodyId || reference.body.sourceFeatureId !== actual.selection.body.sourceFeatureId) return false
    return reference.kind === 'face' && 'face' in actual.selection
      ? reference.face.key === actual.selection.face.key && reference.face.sourceFeatureId === actual.selection.face.sourceFeatureId
      : reference.kind === 'edge' && 'edge' in actual.selection && reference.edge.key === actual.selection.edge.key && reference.edge.sourceFeatureId === actual.selection.edge.sourceFeatureId
  })
  return candidates.length === 1 ? structuredClone(candidates[0]) : null
}
