import { getOC, type Edge, type Face, type Shape3D, type Vertex } from 'replicad'
import type { EdgeReference, FaceReference, PickableVertex, VertexReference } from './kernel.types'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners } from './kernel.native-ownership'
import { createVertexReference, validateVertexReference } from './kernel.vertex-references'
import { extractAssemblyVertexSupport } from './kernel.assembly-supports'

interface Entry { vertex: Vertex; ref: VertexReference }
export interface VertexCatalog { entries: Entry[]; unresolvedCount: number; assertAlive(): void; dispose(): void }
interface FaceEntry { face: Face; ref: FaceReference }
interface EdgeEntry { edge: Edge; ref: EdgeReference }
function catalogResult(entries: Entry[], unresolvedCount: number): VertexCatalog {
  let disposed = false
  return { entries, unresolvedCount,
    assertAlive:() => {if (disposed) throw new Error('El catálogo nativo de vértices ya no está vigente.')},
    dispose:() => {if (disposed) return;disposed=true;withNativeOwners(releases => {releases.ownAll(entries.map(v => v.vertex))},undefined,'Native vertex catalog release failed.')} }
}

/** Borrow exact complete PRIMARY catalogs of this current body. No aliases or geometric matching. */
export function createVertexCatalog(shape: Shape3D, sourceFeatureId: string, lineage: string,
  faces: readonly FaceEntry[], edges: readonly EdgeEntry[]): VertexCatalog {
  return withNativeOwners(owners => {
    const vertices = ownedNativeTopology(shape, 'vertex'); owners.ownAll(vertices)
    const nativeFaces = ownedNativeTopology(shape, 'face'); owners.ownAll(nativeFaces)
    const nativeEdges = ownedNativeTopology(shape, 'edge'); owners.ownAll(nativeEdges)
    const match = <T extends { isSame(other: T): boolean }>(native: readonly T[], entries: readonly { target: T; ref: FaceReference | EdgeReference }[]) => {
      if (native.length !== entries.length) throw new Error('Los catálogos incidentes no cubren el cuerpo nativo actual.');
      const keys = new Map<string, number>()
      for (const entry of entries) {
        if (entry.ref.sourceFeatureId !== sourceFeatureId || native.filter(v => v.isSame(entry.target)).length !== 1) throw new Error('Una referencia incidente pertenece a otro cuerpo o estado.');
        keys.set(entry.ref.key, (keys.get(entry.ref.key) ?? 0) + 1)
      }
      for (const target of native) if (entries.filter(v => target.isSame(v.target)).length !== 1) throw new Error('El catálogo incidente repite o pierde una identidad nativa.');
      return keys
    }
    const faceKeys = match(nativeFaces, faces.map(v => ({target:v.face,ref:v.ref}))), edgeKeys = match(nativeEdges, edges.map(v => ({target:v.edge,ref:v.ref})))
    // Point references are an optional capability. Their admission bound must
    // not invalidate an otherwise valid older body. Native enumeration,
    // membership and cleanup faults still propagate; no expanded naming claim.
    if (vertices.length > 8192 || nativeEdges.length > 4096 || nativeFaces.length > 256) return catalogResult([],vertices.length)
    const faceIncidence = vertices.map(() => [] as FaceReference[]), edgeIncidence = vertices.map(() => [] as EdgeReference[]), openEdges = vertices.map(() => 0), ambiguous = vertices.map(() => false)
    const incident = (target: Face | Edge): number[] => withNativeOwners(local => {
      const points = ownedNativeTopology(target,'vertex'); local.ownAll(points)
      return points.map(point => { const matches = vertices.map((v,i) => v.isSame(point) ? i : -1).filter(i => i >= 0); if (matches.length !== 1) throw new Error('La incidencia no identifica un vértice único del cuerpo.'); return matches[0] })
    },undefined,'Native vertex incidence query or release failed.')
    for (const entry of faces) for (const index of incident(entry.face)) { faceIncidence[index].push(entry.ref); if (faceKeys.get(entry.ref.key) !== 1) ambiguous[index] = true }
    for (const entry of edges) {
      const indexes = incident(entry.edge), oc = getOC()
      const open = indexes.length === 2 && indexes[0] !== indexes[1] && !oc.BRep_Tool.IsClosed(entry.edge.wrapped) && !oc.BRep_Tool.Degenerated(entry.edge.wrapped)
      for (const index of indexes) { edgeIncidence[index].push(entry.ref); if (edgeKeys.get(entry.ref.key) !== 1) ambiguous[index] = true; if (open) openEdges[index]++ }
    }
    const candidates: Entry[] = []
    vertices.forEach((vertex,index) => {
      // Closed/degenerate-only seams do not acquire identity from accidental uniqueness.
      if (ambiguous[index] || openEdges[index] < 2 || !faceIncidence[index].length) return
      candidates.push({ vertex, ref:createVertexReference({sourceFeatureId,lineage,faces:faceIncidence[index],edges:edgeIncidence[index],counts:{vertices:vertices.length,edges:nativeEdges.length,faces:nativeFaces.length}}) })
    })
    const entries = candidates.filter(entry => candidates.filter(other => other.ref.key === entry.ref.key).length === 1)
    return catalogResult(entries,vertices.length-entries.length)
  },catalog => catalog.entries.map(entry => entry.vertex),'Native vertex catalog construction or release failed.')
}

/** Unique exact current key only. Returned native vertex remains borrowed from the catalog. */
export function resolveVertexReference(catalog: VertexCatalog, input: VertexReference, sourceFeatureId: string): Vertex {
  catalog.assertAlive(); const reference=validateVertexReference(input)
  if(reference.sourceFeatureId!==sourceFeatureId)throw new Error('El vértice pertenece a otro estado del cuerpo.')
  const matches=catalog.entries.filter(entry => entry.ref.key===reference.key)
  if(matches.length!==1)throw new Error('El vértice ya no se identifica de forma única; recupera la selección.')
  return matches[0].vertex
}

/** Detached display points, freshly measured from actual vertices, never point authority. */
export function pickableVerticesFromCatalog(catalog: VertexCatalog): PickableVertex[] {
  catalog.assertAlive()
  return catalog.entries.map(({vertex,ref}) => ({ref:validateVertexReference(ref),point:extractAssemblyVertexSupport(vertex).point}))
}
