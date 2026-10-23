import {validateAssemblySourceLink,type AssemblySourceLink} from './assemblySourceLink'
import { assemblyDefinitionKey, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { assemblyMateEndpoints, assemblyMateEndpointComponent, isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint, type AssemblyMateEndpointReference, type AssemblyMateEndpointSide } from './assemblyMateEndpoints'
import type { AssemblyMateEndpointLocator } from './assemblySourceUpdates'

type Node = AssemblyDocument | EmbeddedAssemblyDefinition
type Endpoint = AssemblyMateEndpointReference
type CapturedType = 'concentric' | 'lock' | 'gear' | 'screw' | 'rack-pinion'
export interface AssemblyDocumentUpdateEndpoint {
  locator: AssemblyMateEndpointLocator
  endpoint: Endpoint
  boundary: { occurrencePath: string[]; source: AssemblyDefinitionReference }
  suffix: string[]
  /** Exact staged path/terminal declaration only, never retained native geometry. */
  desiredComponent?: AssemblyComponentReference
  status: 'needs-repair'
  beforeResolution: 'current' | 'stale-path' | 'stale-terminal'
  afterResolution: 'current' | 'missing-path' | 'non-component' | 'stale-terminal'
}
export interface AssemblyDocumentUpdatePlan {
  kind: 'assembly-document-source-plan'
  document: AssemblyDocument
  source: AssemblyDefinitionReference
  replacement: AssemblyDefinitionReference
  /** BEFORE declaration addresses, including dormant and suppressed scopes. */
  occurrences: { scope: AssemblyDefinitionReference; occurrenceId: string }[]
  endpoints: AssemblyDocumentUpdateEndpoint[]
  /** Preexisting unresolved paths; boundaryCrossed alone identifies source impact. */
  unresolvedEndpoints: { locator: AssemblyMateEndpointLocator; endpoint: Endpoint;
    reason: 'stale-path' | 'stale-terminal'; boundaryCrossed: boolean }[]
  capturedMates: { scope: AssemblyDefinitionReference; mateId: string; type: CapturedType;
    suppressed: boolean; affectedRoles: AssemblyMateEndpointSide[] }[]
}
const key = assemblyDefinitionKey
const ref = (value: AssemblyDefinitionReference): AssemblyDefinitionReference => ({ id: value.id, revision: value.revision })
function fail(message: string): never { throw new Error('Actualización de subensamblaje: ' + message) }
function selectedReference(value: unknown): AssemblyDefinitionReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('el origen debe ser una referencia de datos.')
  const fields = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(fields)
  if (names.length !== 2 || names.some(name => typeof name !== 'string' || !['id', 'revision'].includes(name)
    || !fields[name].enumerable || !('value' in fields[name]))) fail('el origen requiere identidad y revisión de datos exactas.')
  const result: Record<string, string> = Object.create(null)
  for (const name of ['id', 'revision']) {
    const item: unknown = fields[name].value
    if (typeof item !== 'string' || !item.trim() || item.length > 128 || /[\x00-\x1f\x7f]/.test(item)) fail('identificador de origen no válido.')
    result[name] = item
  }
  return { id: result.id, revision: result.revision }
}
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((value, i) => sameData(value, b[i]))
  if (Array.isArray(b)) return false
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>, names = Object.keys(left)
  return names.length === Object.keys(right).length && names.every(name => Object.hasOwn(right, name) && sameData(left[name], right[name]))
}
function nodes(document: AssemblyDocument): Node[] {
  return [document, ...document.definitions.filter((item): item is EmbeddedAssemblyDefinition => item.kind === 'assembly')]
}
function table(document: AssemblyDocument): Map<string, AssemblyDefinition> {
  return new Map([document, ...document.definitions].map(item => [key(item), item]))
}
function component(endpoint: Endpoint): AssemblyComponentReference | null {
  return assemblyMateEndpointComponent(endpoint)
}
function permitsAssembly(endpoint: Endpoint): boolean { return !isAssemblyProfileCenterEndpoint(endpoint) && !isAssemblyPathEndpoint(endpoint) && ('occurrencePath' in endpoint || endpoint.kind === 'principal-plane') }
interface Trace { terminal?: AssemblyDefinition; boundary?: string[]; stalePath: boolean }
function trace(node: Node, path: string[], definitions: Map<string, AssemblyDefinition>, source: AssemblyDefinitionReference): Trace {
  let current: AssemblyDefinition = node, boundary: string[] | undefined
  for (let i = 0; i < path.length; i++) {
    if (current.kind !== 'assembly') return { boundary, stalePath: true }
    const occurrence = current.occurrences.find(item => item.id === path[i])
    if (!occurrence) return { boundary, stalePath: true }
    const child = definitions.get(key(occurrence.definition))
    if (!child) return { boundary, stalePath: true }
    if (key(child) === key(source)) boundary = path.slice(0, i + 1)
    current = child
  }
  return { terminal: current, boundary, stalePath: false }
}
function captured(mate: AssemblyMate): CapturedType | null {
  switch (mate.type) {
    case 'concentric': return mate.rotationLock === null ? null : mate.type
    case 'lock': case 'gear': case 'screw': case 'rack-pinion': return mate.type
    case 'hinge': case 'circular-path': case 'line-path': case 'profile-center': case 'symmetry': case 'width': case 'limit-directed-angle': case 'limit-angle': case 'limit-distance':
    case 'coincident': case 'distance': case 'angle': case 'parallel': case 'perpendicular': case 'tangent':
    case 'skew-cylinder-tangent': case 'parallel-cylinder-tangent': case 'plane-sphere-tangent':
    case 'sphere-sphere-tangent': case 'cylinder-sphere-tangent': return null
    default: return unsupported(mate)
  }
}
function unsupported(_mate: never): never { return fail('familia de relación desconocida.') }

/** Complete detached syntax/graph plan only. Every affected role still needs
 * repair/review; no current native correspondence, solve or Apply is supplied. */
export function prepareAssemblyDocumentUpdate(input: AssemblyDocument, source: AssemblyDefinitionReference,
  incoming: AssemblyDocument, sourceLink?: AssemblySourceLink): AssemblyDocumentUpdatePlan {
  const before = validateAssemblyDocument(input), selected = selectedReference(source), imported = validateAssemblyDocument(incoming)
  const definitions = table(before), original = definitions.get(key(selected))
  if (key(selected) === key(before) || !original || original.kind !== 'assembly') fail('el origen debe ser un subensamblaje existente, no la raíz.')
  if (imported.id !== selected.id || imported.revision === selected.revision) fail('la fuente v2 debe conservar la identidad y declarar una revisión diferente.')
  const replacement = ref(imported), occurrences: AssemblyDocumentUpdatePlan['occurrences'] = []
  for (const node of nodes(before)) for (const occurrence of node.occurrences) if (key(occurrence.definition) === key(selected)) {
    occurrences.push({ scope: ref(node), occurrenceId: occurrence.id })
  }
  const writingScopes = new Set(occurrences.map(item => key(item.scope)))
  const root: EmbeddedAssemblyDefinition = { kind: 'assembly', ...ref(imported), name: imported.name,
    createdAt: imported.createdAt, updatedAt: imported.updatedAt, occurrences: imported.occurrences, mates: imported.mates, ...(sourceLink === undefined ? {} : { sourceLink: validateAssemblySourceLink(sourceLink) }) }
  const next = validateAssemblyDocument(before), merged = table(next), kinds = new Map([next, ...next.definitions].map(item => [item.id, item.kind]))
  for (const candidate of [root, ...imported.definitions]) {
    const identity = key(candidate)
    if (identity === key(before)) fail('una dependencia entrante no puede aportar la raíz del destino.')
    if (writingScopes.has(identity)) fail('una dependencia entrante coincide con un ámbito del destino que debe cambiar.')
    if (kinds.has(candidate.id) && kinds.get(candidate.id) !== candidate.kind) fail('una identidad no puede ser pieza y ensamblaje.')
    const existing = merged.get(identity)
    if (existing) { if (!sameData(existing, candidate)) fail('la revisión ya existe con contenido distinto: ' + identity) }
    else { next.definitions.push(candidate); merged.set(identity, candidate); kinds.set(candidate.id, candidate.kind) }
  }
  // Only addresses captured BEFORE the merge are edited. New source-local
  // declarations, including references to historical revisions, are preserved.
  for (const address of occurrences) {
    const node = merged.get(key(address.scope))
    if (!node || node.kind !== 'assembly') fail('el ámbito anterior ya no existe.')
    const occurrence = node.occurrences.find(item => item.id === address.occurrenceId)
    if (!occurrence || key(occurrence.definition) !== key(selected)) fail('la dirección anterior ya no identifica el origen.')
    occurrence.definition = ref(replacement)
  }
  const time = Math.max(Date.now(), Date.parse(next.updatedAt) + 1), date = new Date(time)
  if (!Number.isFinite(date.getTime())) fail('fecha de modificación no válida.')
  next.updatedAt = date.toISOString()
  const document = validateAssemblyDocument(next)
  serializeAssemblyDocument(document)
  const after = table(document), endpoints: AssemblyDocumentUpdatePlan['endpoints'] = [],
    unresolvedEndpoints: AssemblyDocumentUpdatePlan['unresolvedEndpoints'] = [], capturedMates: AssemblyDocumentUpdatePlan['capturedMates'] = []
  for (const node of nodes(before)) for (const mate of node.mates) {
    const affectedRoles: AssemblyMateEndpointSide[] = []
    for (const { side, reference: endpoint } of assemblyMateEndpoints(mate)) {
      if (!endpoint) continue // A fixed null carrier has no component path.
      const owner = component(endpoint)
      if (!owner) continue // Preserve the declaration's local scope frame.
      const locator = { scope: ref(node), mateId: mate.id, side }, old = trace(node, owner.occurrencePath, definitions, selected)
      const beforeResolution = old.stalePath ? 'stale-path' : !old.terminal || key(old.terminal) !== key(owner.definition)
        || old.terminal.kind !== 'part' && !permitsAssembly(endpoint) ? 'stale-terminal' : 'current'
      if (beforeResolution !== 'current') unresolvedEndpoints.push({ locator, endpoint, reason: beforeResolution, boundaryCrossed: !!old.boundary })
      if (!old.boundary) continue // Stale labels cannot manufacture source impact.
      const newScope = after.get(key(node))
      if (!newScope || newScope.kind !== 'assembly') fail('el ámbito de una referencia afectada ya no existe.')
      const staged = trace(newScope, owner.occurrencePath, after, replacement)
      const afterResolution = staged.stalePath ? 'missing-path' : !staged.terminal ? 'stale-terminal'
        : staged.terminal.kind !== 'part' && !permitsAssembly(endpoint) ? 'non-component' : 'current'
      endpoints.push({ locator, endpoint, boundary: { occurrencePath: old.boundary, source: ref(selected) },
        suffix: owner.occurrencePath.slice(old.boundary.length), status: 'needs-repair', beforeResolution, afterResolution,
        ...(afterResolution === 'current' && staged.terminal ? { desiredComponent: { occurrencePath: [...owner.occurrencePath], definition: ref(staged.terminal) } } : {}) })
      affectedRoles.push(side)
    }
    const type = captured(mate)
    if (type && affectedRoles.length) capturedMates.push({ scope: ref(node), mateId: mate.id, type, suppressed: mate.suppressed, affectedRoles })
  }
  return { kind: 'assembly-document-source-plan', document, source: selected, replacement, occurrences, endpoints, unresolvedEndpoints, capturedMates }
}
