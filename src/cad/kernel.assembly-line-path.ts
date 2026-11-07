import { getOC, type Edge, type Vertex } from 'replicad'
import { withNativeOwners } from './kernel.native-ownership'
import { observeAssemblyPathCurve, type AssemblyPathCurveObservation, type AssemblyPathCurveBands } from './kernel.assembly-path-curves'

export type AssemblyLinePathCurve = Extract<AssemblyPathCurveObservation, { kind: 'line' }>
/** Borrow exact same-body native topology. Identity comes only from IsSame;
 * BRep_Tool.Parameter associates that material endpoint with the current trim. */
export function observeAssemblyLinePath(edge: Edge, startVertex: Vertex, bands: AssemblyPathCurveBands = {}): AssemblyLinePathCurve {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = edge?.wrapped, chosen = startVertex?.wrapped
    if (!raw || !chosen || raw.IsNull() || chosen.IsNull() || chosen.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_VERTEX) throw new Error('A current material start vertex is required.')
    const observed = observeAssemblyPathCurve(edge, 1, bands)
    if (observed.kind !== 'line') throw new Error('A material line path requires an actual finite LINE.')
    const explorer = owners.own(new oc.TopExp_Explorer(raw, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE))
    const vertices: ReturnType<typeof explorer.Current>[] = []
    let occurrences = 0
    while (explorer.More()) {
      const vertex = owners.own(explorer.Current())
      if (++occurrences > 2) throw new Error('A material line requires exactly two endpoint occurrences.')
      if (!vertices.some(v => v.IsSame(vertex))) vertices.push(vertex)
      explorer.Next()
    }
    if (vertices.length !== 2) throw new Error('A material line requires two distinct native endpoints.')
    const matches = vertices.map((v,i) => v.IsSame(chosen) ? i : -1).filter(i => i >= 0)
    if (matches.length !== 1) throw new Error('The material start is not an exact endpoint of this edge.')
    const parameters = vertices.map(v => oc.BRep_Tool.Parameter(owners.own(oc.TopoDS.Vertex(v)), raw))
    const { first, last } = observed.parameterDomain
    if (!parameters.every(Number.isFinite) || !((parameters[0] === first && parameters[1] === last) || (parameters[1] === first && parameters[0] === last))) throw new Error('Native endpoint parameters do not identify the exact finite LINE trim.')
    const sense = parameters[matches[0]] === first ? 1 : -1
    const result = sense === 1 ? observed : observeAssemblyPathCurve(edge, -1, bands)
    if (result.kind !== 'line') throw new Error('Native LINE kind changed during material origin query.')
    return result
  }, undefined, 'Material line origin query or release failed.')
}
