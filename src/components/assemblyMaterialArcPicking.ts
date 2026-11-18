import type { AssemblyScene, AssemblySceneEdge, AssemblySceneBody } from '../cad/kernel.assembly-types'
import { assemblyCircularPathCatalogChoices } from '../cad/kernel.assembly-document-update-types'
import type { AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'

/** Display locator only. Neither the key nor the request is a native proof. */
export function materialArcKey(reference: Pick<AssemblyArcPathSelection, 'component' | 'body' | 'edge'>): string {
  return JSON.stringify([reference.component.occurrencePath, reference.component.definition.id, reference.component.definition.revision,
    reference.body ? [reference.body.bodyId, reference.body.sourceFeatureId] : null, reference.edge.sourceFeatureId, reference.edge.key])
}
export function currentMaterialArcPaths<T extends { reference: AssemblyArcPathSelection }>(key: string | null, paths: readonly T[]): T[] {
  const matches = key ? paths.filter(choice => materialArcKey(choice.reference) === key) : []
  return matches.length === 2 && JSON.stringify(matches[0].reference.startVertex) !== JSON.stringify(matches[1].reference.startVertex) ? matches : []
}
export function materialArcKeys(paths: readonly { reference: AssemblyArcPathSelection }[]): string[] {
  const grouped = new Map<string, AssemblyArcPathSelection[]>()
  for (const choice of paths) { const key = materialArcKey(choice.reference), entries = grouped.get(key) ?? []; entries.push(choice.reference); grouped.set(key, entries) }
  return [...grouped].filter(([, entries]) => entries.length === 2 && JSON.stringify(entries[0].startVertex) !== JSON.stringify(entries[1].startVertex)).map(([key]) => key)
}
export interface MaterialArcEdgePickRequest {
  purpose: 'material-arc'
  scene: AssemblyScene
  scopePath: readonly string[]
  edgeKeys: readonly string[]
}
/** The existing positive native catalogue is the only source of open-circle
 * display candidates. Missing LINE support and polyline shape classify nothing. */
export function materialArcEdgeKeys(scene: AssemblyScene, scopePath: readonly string[]): string[] {
  const paths = assemblyCircularPathCatalogChoices({ ...scene, bodies: scene.bodies.filter(body => body.visible) })
    .filter(choice => choice.reference.component.occurrencePath.length > scopePath.length
      && scopePath.every((id, i) => choice.reference.component.occurrencePath[i] === id))
  return materialArcKeys(paths)
}
/** Revalidate the complete whitelist against the exact scene and actual DTO
 * owners at the point of picking. Invalid requests reject without LINE fallback. */
export function currentMaterialArcEdges(request: MaterialArcEdgePickRequest | null, scene: AssemblyScene | null | undefined,
  bodies: readonly AssemblySceneBody[]): Set<AssemblySceneEdge> | null {
  if (!request || request.purpose !== 'material-arc' || !scene || request.scene !== scene
    || !Array.isArray(request.scopePath) || !request.scopePath.every(id => typeof id === 'string')
    || !Array.isArray(request.edgeKeys) || !request.edgeKeys.length || request.edgeKeys.length > 4096
    || !request.edgeKeys.every(key => typeof key === 'string') || new Set(request.edgeKeys).size !== request.edgeKeys.length) return null
  const sceneBodies = new Set(scene.bodies)
  if (bodies.some(body => !sceneBodies.has(body))) return null
  try {
    const current = new Set(materialArcEdgeKeys(scene, request.scopePath))
    if (current.size !== request.edgeKeys.length || request.edgeKeys.some(key => !current.has(key))) return null
    const owners = new Set(bodies.filter(body => body.visible)), grouped = new Map<string, AssemblySceneEdge[]>()
    for (const body of scene.bodies) if (owners.has(body)) for (const edge of body.edges ?? []) {
      const key = materialArcKey(edge.selection)
      if (current.has(key)) { const entries = grouped.get(key) ?? []; entries.push(edge); grouped.set(key, entries) }
    }
    if (grouped.size !== current.size || [...grouped.values()].some(entries => entries.length !== 1)) return null
    return new Set([...grouped.values()].map(entries => entries[0]))
  } catch { return null }
}
