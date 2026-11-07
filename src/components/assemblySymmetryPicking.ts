import { assemblySceneFaceReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference, assemblySceneEdgeReference,
  type AssemblyScene, type AssemblySceneFace, type AssemblySceneEdge, type AssemblySceneVertex } from '../cad/kernel.assembly-types'
import { validateAssemblyVertexReference } from '../model/assemblyDocument'
import type { SymmetryUiFamily, SymmetryUiReference, SymmetryUiReferences } from '../model/assemblySymmetryUi'

export type SymmetryPickSlot = 0 | 1 | 2
export type SymmetryPickProducer = 'vertex' | 'plane-face' | 'line-edge' | 'cylinder-axis' | 'sphere-face' | 'cylinder-face'
export interface SymmetryPickTicket {
  slot: SymmetryPickSlot; family: SymmetryUiFamily; producer: SymmetryPickProducer
  lineProducer: 'line-edge' | 'cylinder-axis' | null
  signature: string; scope: string; generation: number; sceneId: string
}
export interface SymmetryPickContext { signature: string; scope: string; generation: number; sceneId: string | null; family: SymmetryUiFamily; blocked: boolean }
export function symmetryPickProducer(family: SymmetryUiFamily, slot: SymmetryPickSlot, lineProducer: SymmetryPickTicket['lineProducer']): SymmetryPickProducer | null {
  if (slot === 2) return 'plane-face'
  switch (family) {
    case 'point': return 'vertex'
    case 'plane': return 'plane-face'
    case 'sphere': return 'sphere-face'
    case 'cylinder': return 'cylinder-face'
    case 'line': return lineProducer
  }
}
export function currentSymmetryPick(ticket: SymmetryPickTicket | null, context: SymmetryPickContext, eventTicket?: SymmetryPickTicket | null): ticket is SymmetryPickTicket {
  return !!ticket && (eventTicket === undefined || eventTicket === ticket) && !context.blocked && ticket.signature === context.signature && ticket.scope === context.scope && ticket.generation === context.generation
    && ticket.sceneId === context.sceneId && ticket.family === context.family && [0, 1, 2].includes(ticket.slot)
    && ticket.producer === symmetryPickProducer(context.family, ticket.slot, ticket.lineProducer)
}
export function nextSymmetryPick(ticket: SymmetryPickTicket, references: SymmetryUiReferences): SymmetryPickTicket | null {
  const missing = [1, 2, 3].map(offset => (ticket.slot + offset) % 3).find(slot => references[slot] === null) as SymmetryPickSlot | undefined
  if (missing === undefined) return null
  const producer = symmetryPickProducer(ticket.family, missing, ticket.lineProducer)
  return producer ? { ...ticket, slot: missing, producer } : null
}
const componentKey = (component: AssemblySceneVertex['selection']['component']): string => JSON.stringify([component.occurrencePath, component.definition.id, component.definition.revision])
const bodyKey = (body: AssemblySceneVertex['selection']['body']): string => JSON.stringify(body ? [body.bodyId, body.sourceFeatureId] : null)
type Selection = AssemblySceneFace['selection'] | AssemblySceneEdge['selection'] | AssemblySceneVertex['selection']
function identity(selection: Selection): string {
  const locator = 'vertex' in selection ? selection.vertex : 'edge' in selection ? selection.edge : selection.face
  return JSON.stringify(['vertex' in selection ? 'vertex' : 'edge' in selection ? 'edge' : 'face', componentKey(selection.component), bodyKey(selection.body), locator.sourceFeatureId, locator.key])
}
/** Selection intent only. Incoming coordinates/supports are ignored. Resolve
 * a unique visible current catalog entry with exact body/owner/locator, then
 * declare its explicit purpose. Only a fresh worker preview grants authority. */
export function scopedAssemblySymmetryPick(scene: AssemblyScene | null, payload: AssemblySceneVertex | AssemblySceneFace | AssemblySceneEdge | null,
  scopePath: readonly string[], family: SymmetryUiFamily, slot: SymmetryPickSlot, producer: SymmetryPickProducer): { reference: SymmetryUiReference; actual: AssemblySceneVertex | AssemblySceneFace | AssemblySceneEdge } | null {
  if (!scene || !payload) return null
  const lineProducer = producer === 'line-edge' || producer === 'cylinder-axis' ? producer : null
  if (symmetryPickProducer(family, slot, lineProducer) !== producer) return null
  const expected = producer === 'vertex' ? 'vertex' : producer === 'line-edge' ? 'edge' : 'face'
  if (!payload.selection || !(expected in payload.selection)) return null
  let wanted: string
  try { wanted = identity(payload.selection) } catch { return null }
  const matches: (AssemblySceneVertex | AssemblySceneFace | AssemblySceneEdge)[] = []
  for (const body of scene.bodies) {
    if (!body.visible || body.component.occurrencePath.length <= scopePath.length || !scopePath.every((value, index) => body.component.occurrencePath[index] === value)) continue
    const candidates = producer === 'vertex' ? body.vertexPoints ?? [] : producer === 'line-edge' ? body.edges ?? [] : body.faces
    for (const value of candidates) {
      if (componentKey(value.selection.component) !== componentKey(body.component) || bodyKey(value.selection.body) !== bodyKey(body.body)) continue
      if (identity(value.selection) === wanted) matches.push(value)
    }
  }
  if (matches.length !== 1) return null
  const actual = matches[0]
  let reference: SymmetryUiReference | null = null
  if (producer === 'vertex' && 'vertex' in actual.selection) { try { reference = validateAssemblyVertexReference({ kind: 'vertex', ...actual.selection, support: 'point' }) } catch { return null } }
  else if (producer === 'line-edge' && 'edge' in actual.selection) reference = assemblySceneEdgeReference(actual as AssemblySceneEdge)
  else if ('face' in actual.selection) {
    const face = actual as AssemblySceneFace
    if (producer === 'plane-face' && face.support?.kind === 'plane') reference = assemblySceneFaceReference(face)
    if (producer === 'sphere-face') reference = assemblySceneSphereSurfaceReference(face)
    if (producer === 'cylinder-face') reference = assemblySceneCylinderSurfaceReference(face)
    if (producer === 'cylinder-axis' && face.support?.kind === 'cylinder') reference = assemblySceneFaceReference(face)
  }
  if (!reference || !reference.component || (producer === 'cylinder-axis' && (!('support' in reference) || reference.support !== 'axis'))) return null
  reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
  return { actual, reference }
}

/** Highlight saved intent using actual current catalog entries; no incoming
 * display coordinates or opaque copied witness is promoted to authority. */
export function symmetryPickForReference(scene: AssemblyScene | null, scopePath: readonly string[], family: SymmetryUiFamily,
  slot: SymmetryPickSlot, reference: SymmetryUiReference | null): ReturnType<typeof scopedAssemblySymmetryPick> {
  if (!scene || !reference || !reference.component || reference.kind === 'principal-plane') return null
  const producer = symmetryPickProducer(family, slot, reference.kind === 'edge' ? 'line-edge' : reference.kind === 'face' && reference.support === 'axis' ? 'cylinder-axis' : null)
  if (!producer) return null
  const component = { ...reference.component, occurrencePath: [...scopePath, ...reference.component.occurrencePath] }
  const wanted = reference.kind === 'vertex' ? identity({ component, body: reference.body, vertex: reference.vertex })
    : reference.kind === 'edge' ? identity({ component, body: reference.body, edge: reference.edge }) : identity({ component, body: reference.body, face: reference.face })
  const entries = scene.bodies.filter(body => body.visible).flatMap<AssemblySceneVertex | AssemblySceneFace | AssemblySceneEdge>(body => producer === 'vertex' ? body.vertexPoints ?? [] : producer === 'line-edge' ? body.edges ?? [] : body.faces) as (AssemblySceneVertex | AssemblySceneFace | AssemblySceneEdge)[]
  const matching = entries.filter(value => identity(value.selection) === wanted)
  return matching.length === 1 ? scopedAssemblySymmetryPick(scene, matching[0], scopePath, family, slot, producer) : null
}

/** Compare complete saved intent, independently of object property insertion order. */
export function sameSymmetryReference(a: SymmetryUiReference | null, b: SymmetryUiReference | null): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  const owner = (value: SymmetryUiReference) => value.component ? componentKey(value.component) : null
  if (owner(a) !== owner(b)) return false
  if (a.kind === 'principal-plane' || b.kind === 'principal-plane') return a.kind === 'principal-plane' && b.kind === 'principal-plane' && a.plane === b.plane
  if (a.support !== b.support || bodyKey(a.body) !== bodyKey(b.body)) return false
  const locator = (value: Exclude<SymmetryUiReference, {kind: 'principal-plane'}>) => value.kind === 'vertex' ? value.vertex : value.kind === 'edge' ? value.edge : value.face
  const x = locator(a), y = locator(b)
  return x.sourceFeatureId === y.sourceFeatureId && x.key === y.key
}
