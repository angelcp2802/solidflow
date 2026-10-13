import type { BodyReference, CadResult, PickableEdge, PickableFace } from './kernel.types'

export interface BodySelectionDtos {
  faces: PickableFace[]
  edges: PickableEdge[]
}

type SelectionModel = Pick<CadResult, 'faces' | 'edges' | 'bodies' | 'bodyCatalogActive'>

/**
 * Selection uses each body's own reference namespace. The aggregate mesh may
 * remain visible, but its independently generated reference catalog is never
 * used as a substitute for an explicit body's missing or obsolete state.
 */
export function bodySelectionDtos(model: SelectionModel | null, scope?: readonly BodyReference[]): BodySelectionDtos {
  const empty = (): BodySelectionDtos => ({ faces: [], edges: [] })
  if (!model) return empty()
  if (!model.bodyCatalogActive) return scope === undefined
    ? { faces: model.faces ?? [], edges: model.edges ?? [] }
    : empty()

  const bodies = model.bodies ?? []
  const ids = new Set<string>()
  for (const body of bodies) {
    if (ids.has(body.ref.bodyId)) return empty()
    ids.add(body.ref.bodyId)
  }
  const selected = scope === undefined ? bodies : []
  if (scope !== undefined) {
    const requested = new Set<string>()
    for (const reference of scope) {
      if (requested.has(reference.bodyId)) return empty()
      requested.add(reference.bodyId)
      const matches = bodies.filter(body => body.ref.bodyId === reference.bodyId && body.ref.sourceFeatureId === reference.sourceFeatureId)
      if (matches.length !== 1) return empty()
      selected.push(matches[0])
    }
  }
  return { faces: selected.flatMap(body => body.faces), edges: selected.flatMap(body => body.edges) }
}
