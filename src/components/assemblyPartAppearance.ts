import type { AssemblyDocument, AssemblyDefinitionReference } from '../model/assemblyDocument'
import type { AssemblyScene } from '../cad/kernel.assembly-types'

/** Display lookup only. It cannot authorize a reference, solve or source update. */
export function assemblyPartAppearanceKey(definition: AssemblyDefinitionReference): string {
  return JSON.stringify([definition.id, definition.revision])
}
export function assemblyPartColors(document: AssemblyDocument): ReadonlyMap<string, string> {
  const colors = new Map<string, string>()
  for (const definition of document.definitions) if (definition.kind === 'part' && definition.document.appearance)
    colors.set(assemblyPartAppearanceKey(definition), definition.document.appearance.color)
  return colors
}

/** Native scene includes hidden active uses and omits suppressed uses. The owner
 * must first match that scene to the exact current committed document. */
export function assemblyMassKg(document: AssemblyDocument, scene: AssemblyScene | null, current: boolean): number | null {
  if (!current || !scene) return null
  const parts = new Map(document.definitions.filter(definition => definition.kind === 'part')
    .map(definition => [assemblyPartAppearanceKey(definition), definition.document]))
  let total = 0
  for (const body of scene.bodies) {
    const part = parts.get(assemblyPartAppearanceKey(body.component.definition))
    if (!part?.material || !Number.isFinite(body.volume) || body.volume < 0) return null
    const mass = body.volume / 1e9 * part.material.densityKgPerM3
    if (!Number.isFinite(mass) || body.volume > 0 && mass <= 0) return null
    total += mass
    if (!Number.isFinite(total)) return null
  }
  return total
}
