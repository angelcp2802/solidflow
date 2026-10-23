import { captureOwnDataRecord } from './ownDataRecord'
import {validateAssemblySourceLink,type AssemblySourceLink} from './assemblySourceLink'
import { assemblyDefinitionKey, validateAssemblyDocument, validateCadDocument, type AssemblyComponentReference,
  type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument,
  type EmbeddedAssemblyDefinition, type AssemblyMate } from './assemblyDocument'
import { applyAssemblyEdit } from './assemblyEditing'
import type { Document } from './document'
import { assemblyMateEndpoint, assemblyMateEndpoints, isAssemblyMateEndpointSide, withAssemblyMateEndpoint,
  assemblyMateEndpointComponent, assemblyMatePathKind, isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint,
  type AssemblyMateEndpointReference, type AssemblyMateEndpointSide } from './assemblyMateEndpoints'

export interface AssemblyMateEndpointLocator {
  scope: AssemblyDefinitionReference
  mateId: string
  side: AssemblyMateEndpointSide
}
type Endpoint = AssemblyMateEndpointReference
export interface AssemblySourceUpdatePlan {
  kind: 'assembly-source-plan'
  document: AssemblyDocument
  source: AssemblyDefinitionReference
  replacement: AssemblyDefinitionReference
  /** Unique declaration addresses, including dormant and suppressed sources. */
  occurrences: { scope: AssemblyDefinitionReference; occurrenceId: string }[]
  /** Original endpoints, never rebound or promoted to native authority. */
  endpoints: { locator: AssemblyMateEndpointLocator; endpoint: Endpoint }[]
}
type Node = AssemblyDocument | EmbeddedAssemblyDefinition
const key = assemblyDefinitionKey
function fail(message: string): never { throw new Error('Actualización de origen: ' + message) }
function record(value: unknown, fields: readonly string[]): ReadonlyMap<string, unknown> {
  return captureOwnDataRecord(value, fields, fields, 'Actualización de origen')
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('identificador no válido.')
  return value
}
function reference(value: unknown): AssemblyDefinitionReference {
  const data = record(value, ['id', 'revision'])
  return { id: identifier(data.get('id')), revision: identifier(data.get('revision')) }
}
function nodes(document: AssemblyDocument): Node[] {
  return [document, ...document.definitions.filter((value): value is EmbeddedAssemblyDefinition => value.kind === 'assembly')]
}
function table(document: AssemblyDocument): Map<string, AssemblyDefinition> {
  return new Map([document, ...document.definitions].map(value => [key(value), value]))
}
function scopeNode(document: AssemblyDocument, scope: AssemblyDefinitionReference): Node {
  const result = table(document).get(key(scope))
  if (!result || result.kind !== 'assembly') fail('el ámbito no identifica una declaración actual de ensamblaje.')
  return result
}
function component(endpoint: Endpoint): AssemblyComponentReference | null {
  return assemblyMateEndpointComponent(endpoint)
}
function resolvesSource(node: Node, endpoint: Endpoint, source: AssemblyDefinitionReference,
  definitions: Map<string, AssemblyDefinition>): boolean {
  const target = component(endpoint)
  if (!target || key(target.definition) !== key(source)) return false
  let current: AssemblyDefinition = node
  for (const id of target.occurrencePath) {
    if (current.kind !== 'assembly') return false
    const occurrence = current.occurrences.find(value => value.id === id)
    if (!occurrence) return false
    const next = definitions.get(key(occurrence.definition))
    if (!next) return false
    current = next
  }
  // A matching endpoint label alone cannot identify a deleted, stale or
  // path-through-part component. Face/body diagnostics remain manual repair.
  return current.kind === 'part' && key(current) === key(source)
}

/** Detached declaration plan only; neither a native association nor Apply proof. */
export function prepareAssemblyPartUpdate(input: AssemblyDocument, source: AssemblyDefinitionReference,
  part: Document, revision: string, sourceLink?: AssemblySourceLink): AssemblySourceUpdatePlan {
  const before = validateAssemblyDocument(input), selected = reference(source), nextRevision = identifier(revision)
  // The union boundary rejects executable fields before the legacy part parser.
  const replacementPart = validateCadDocument(part)
  if (replacementPart.version !== 1 || replacementPart.id !== selected.id) fail('la pieza debe conservar la identidad del origen.')
  const definitions = table(before), original = definitions.get(key(selected))
  if (!original || original.kind !== 'part') fail('el origen no identifica una revisión actual de pieza.')
  const replacement = { id: selected.id, revision: nextRevision }
  if (nextRevision === selected.revision || definitions.has(key(replacement))) fail('la revisión nueva ya existe o coincide con la anterior.')
  const occurrences: AssemblySourceUpdatePlan['occurrences'] = [], endpoints: AssemblySourceUpdatePlan['endpoints'] = []
  for (const node of nodes(before)) {
    const scope = { id: node.id, revision: node.revision }
    for (const occurrence of node.occurrences) if (key(occurrence.definition) === key(selected)) {
      occurrences.push({ scope: { ...scope }, occurrenceId: occurrence.id })
    }
    for (const mate of node.mates) for (const { side, reference: endpoint } of assemblyMateEndpoints(mate)) {
      if (endpoint && resolvesSource(node, endpoint, selected, definitions)) endpoints.push({
        locator: { scope: { ...scope }, mateId: mate.id, side }, endpoint,
      })
    }
  }
  const next = validateAssemblyDocument(before)
  next.definitions.push({ kind: 'part', ...replacement, document: replacementPart, ...(sourceLink === undefined ? {} : { sourceLink: validateAssemblySourceLink(sourceLink) }) })
  for (const node of nodes(next)) for (const occurrence of node.occurrences) {
    if (key(occurrence.definition) === key(selected)) occurrence.definition = { ...replacement }
  }
  const time = Math.max(Date.now(), Date.parse(next.updatedAt) + 1), date = new Date(time)
  if (!Number.isFinite(date.getTime())) fail('fecha de modificación no válida.')
  next.updatedAt = date.toISOString()
  return { kind: 'assembly-source-plan', document: validateAssemblyDocument(next), source: selected,
    replacement, occurrences, endpoints }
}
function support(endpoint: Endpoint, mate: AssemblyMate, side: AssemblyMateEndpointSide): 'component' | 'plane' | 'axis' | 'line' | 'cylinder-surface' | 'sphere-surface' | 'point' | 'profile-free' | 'profile-rectangle' | 'line-path' | 'circular-path' {
  return isAssemblyPathEndpoint(endpoint) ? assemblyMatePathKind(mate, side) ?? fail('propósito de trayecto desconocido.') : isAssemblyProfileCenterEndpoint(endpoint) ? endpoint.axis === null ? 'profile-free' : 'profile-rectangle'
    : 'occurrencePath' in endpoint ? 'component' : endpoint.kind === 'principal-plane' ? 'plane' : endpoint.support
}

/** Explicit syntax repair. Current native support and mate satisfaction need Solve. */
export function repairAssemblyEndpoint(input: AssemblyDocument, locator: AssemblyMateEndpointLocator, endpoint: Endpoint): AssemblyDocument {
  const document = validateAssemblyDocument(input), address = record(locator, ['scope', 'mateId', 'side'])
  const scope = reference(address.get('scope')), mateId = identifier(address.get('mateId'))
  const side = address.get('side')
  if (!isAssemblyMateEndpointSide(side)) fail('extremo de relación desconocido.')
  const node = scopeNode(document, scope), original = node.mates.find(value => value.id === mateId)
  if (!original) fail('la relación ya no existe en el ámbito indicado.')
  const originalEndpoint = assemblyMateEndpoint(original, side)?.reference
  if (!originalEndpoint) fail('el extremo no identifica una referencia actual de la relación.')
  const { id: _id, ...declaration } = withAssemblyMateEndpoint(original, side, endpoint)
  // applyAssemblyEdit validates every nested replacement before JSON comparison
  // can invoke accessors/toJSON; it preserves the existing mate ID and family.
  const next = applyAssemblyEdit(document, { type: 'update-mate', scope, mateId,
    mate: declaration })
  const updated = scopeNode(next, scope).mates.find(value => value.id === mateId)!
  const updatedEndpoint = assemblyMateEndpoint(updated, side)?.reference
  if (!updatedEndpoint || support(updatedEndpoint, updated, side) !== support(originalEndpoint, original, side)) fail('la reparación debe conservar el tipo de soporte del extremo.')
  return next
}

/** Actual occurrence namespaces, including suppressed paths; dormant has none. */
export function assemblySourceScopePaths(input: AssemblyDocument, scope: AssemblyDefinitionReference): string[][] {
  const document = validateAssemblyDocument(input), selected = reference(scope), definitions = table(document)
  scopeNode(document, selected)
  const result: string[][] = []
  const walk = (node: Node, path: string[]) => {
    if (key(node) === key(selected)) result.push([...path])
    for (const occurrence of node.occurrences) {
      const child = definitions.get(key(occurrence.definition))!
      if (child.kind === 'assembly') walk(child, [...path, occurrence.id])
    }
  }
  // The complete validator bounds the expanded graph, including suppressed and
  // dormant definitions, before this walk; no unbounded name-based discovery.
  walk(document, [])
  return result
}
