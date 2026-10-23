import { captureOwnDataRecord } from './ownDataRecord'
import { assemblyDefinitionKey, assemblyOccurrencePathKey, validateAssemblyDocument, validateCadDocument, MAX_ASSEMBLY_DEPTH,
  type AssemblyComponentReference, type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import type { AssemblyMateEndpointLocator } from './assemblySourceUpdates'
import type { Document } from './document'
import { assemblyMateEndpoints, withAssemblyMateEndpoint, assemblyMateEndpointComponent, withAssemblyMateEndpointComponent,
  isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint, type AssemblyMateEndpointReference } from './assemblyMateEndpoints'

export interface AssemblyPartReplacementRequest {
  component: AssemblyComponentReference
  mode: 'selected' | 'all'
  part: Document
  revision: string
  /** Selected: one fresh assembly revision per ancestor, ordered from the root. All: empty. */
  ancestorRevisions: string[]
}
type Node = AssemblyDocument | EmbeddedAssemblyDefinition
type Endpoint = AssemblyMateEndpointReference
export interface AssemblyReplacementEndpointPlan {
  originalLocator: AssemblyMateEndpointLocator
  locator: AssemblyMateEndpointLocator
  /** Original declaration, never promoted by a matching name or topology key. */
  endpoint: Endpoint
  desiredComponent: AssemblyComponentReference
  /** Only an originally current component or principal frame may retain association. */
  retainFrame: boolean
}
export interface AssemblyPartReplacementPlan {
  kind: 'assembly-replacement-plan'
  document: AssemblyDocument
  /** Trusted comparison layout: same COW routing, with the original leaf sources/references. */
  baseline: AssemblyDocument
  source: AssemblyDefinitionReference
  replacement: AssemblyDefinitionReference
  scopeMap: { beforeScope: AssemblyDefinitionReference; afterScope: AssemblyDefinitionReference; scopePath: string[] }[]
  occurrences: { originalScope: AssemblyDefinitionReference; scope: AssemblyDefinitionReference; occurrenceId: string }[]
  /** Root-reachable leaf paths, including suppressed uses; dormant declarations have none. */
  expandedPaths: string[][]
  endpoints: AssemblyReplacementEndpointPlan[]
}
interface Step { node: Node; occurrence: AssemblyOccurrence; definition: AssemblyDefinition }
const key = assemblyDefinitionKey
const ref = (value: AssemblyDefinitionReference): AssemblyDefinitionReference => ({ id: value.id, revision: value.revision })
const nodeKey = (scope: AssemblyDefinitionReference, occurrenceId: string) => JSON.stringify([scope.id, scope.revision, occurrenceId])
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => b[i] === id)
const prefix = (a: readonly string[], b: readonly string[]) => a.length <= b.length && a.every((id, i) => b[i] === id)
function fail(message: string): never { throw new Error('Reemplazo de componente: ' + message) }
function record(input: unknown, names: readonly string[]): ReadonlyMap<string, unknown> {
  return captureOwnDataRecord(input, names, names, 'Reemplazo de componente')
}
function identifier(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128 || /[\x00-\x1f\x7f]/.test(input)) fail('identificador no válido.')
  return input
}
function definitionReference(input: unknown): AssemblyDefinitionReference {
  const value = record(input, ['id', 'revision'])
  return { id: identifier(value.get('id')), revision: identifier(value.get('revision')) }
}
function componentReference(input: unknown): AssemblyComponentReference {
  const value = record(input, ['occurrencePath', 'definition'])
  const occurrencePath = JSON.parse(assemblyOccurrencePathKey(value.get('occurrencePath') as string[])) as string[]
  if (!occurrencePath.length) fail('selecciona una ruta de componente no vacía.')
  return { occurrencePath, definition: definitionReference(value.get('definition')) }
}
function revisions(input: unknown): string[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length >= MAX_ASSEMBLY_DEPTH) fail('lista de revisiones de ancestros no válida.')
  const fields = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(fields).filter(name => name !== 'length')
  if (keys.length !== input.length || keys.some(name => typeof name !== 'string' || !/^(0|[1-9][0-9]*)$/.test(name) || Number(name) >= input.length)) fail('la lista de revisiones debe ser densa y sin campos adicionales.')
  return Array.from({ length: input.length }, (_, index) => {
    const field = fields[String(index)]
    if (!field || !field.enumerable || !('value' in field)) fail('las revisiones requieren datos enumerables sin accesores.')
    return identifier(field.value)
  })
}
function request(input: AssemblyPartReplacementRequest): AssemblyPartReplacementRequest {
  const value = record(input, ['component', 'mode', 'part', 'revision', 'ancestorRevisions'])
  const mode = value.get('mode')
  if (mode !== 'selected' && mode !== 'all') fail('modo de reemplazo desconocido.')
  const component = componentReference(value.get('component')), ancestorRevisions = revisions(value.get('ancestorRevisions'))
  if (ancestorRevisions.length !== (mode === 'selected' ? component.occurrencePath.length - 1 : 0)) fail('el número de revisiones debe coincidir con los ancestros seleccionados.')
  const part = validateCadDocument(value.get('part'))
  if (part.version !== 1) fail('el reemplazo debe ser un documento de pieza.')
  return { component, mode, part, revision: identifier(value.get('revision')), ancestorRevisions }
}
function nodes(document: AssemblyDocument): Node[] {
  return [document, ...document.definitions.filter((value): value is EmbeddedAssemblyDefinition => value.kind === 'assembly')]
}
function table(document: AssemblyDocument): Map<string, AssemblyDefinition> {
  return new Map([document, ...document.definitions].map(value => [key(value), value]))
}
function trace(node: Node, path: readonly string[], definitions: Map<string, AssemblyDefinition>): { steps: Step[]; complete: boolean; definition: AssemblyDefinition } {
  const steps: Step[] = []; let current: AssemblyDefinition = node
  for (const id of path) {
    if (current.kind !== 'assembly') return { steps, complete: false, definition: current }
    const occurrence: AssemblyOccurrence | undefined = current.occurrences.find(value => value.id === id)
    if (!occurrence) return { steps, complete: false, definition: current }
    const definition: AssemblyDefinition = definitions.get(key(occurrence.definition))!
    steps.push({ node: current, occurrence, definition }); current = definition
  }
  return { steps, complete: true, definition: current }
}
function endpointComponent(endpoint: Endpoint): AssemblyComponentReference | null {
  return assemblyMateEndpointComponent(endpoint)
}
function setEndpoint(document: AssemblyDocument, locator: AssemblyMateEndpointLocator, endpoint: Endpoint): void {
  const node = nodes(document).find(value => key(value) === key(locator.scope))!
  const index = node.mates.findIndex(value => value.id === locator.mateId)
  if (index < 0) fail('la relación ya no existe en el ámbito indicado.')
  node.mates[index] = withAssemblyMateEndpoint(node.mates[index], locator.side, endpoint)
}
function rebound(endpoint: Endpoint, desired: AssemblyComponentReference): Endpoint {
  return withAssemblyMateEndpointComponent(endpoint, desired)
}

/** Detached declaration/COW plan only. Native repair, solve and one-use Apply are separate. */
export function prepareAssemblyPartReplacement(input: AssemblyDocument, supplied: AssemblyPartReplacementRequest): AssemblyPartReplacementPlan {
  const before = validateAssemblyDocument(input), intent = request(supplied), definitions = table(before)
  const selected = trace(before, intent.component.occurrencePath, definitions)
  if (!selected.complete || selected.definition.kind !== 'part' || key(selected.definition) !== key(intent.component.definition)) fail('la selección no identifica una pieza actual en esa ruta.')
  const source = ref(selected.definition), replacement = { id: intent.part.id, revision: intent.revision }
  if (source.id === replacement.id) fail('el reemplazo debe tener otra identidad de pieza; usa la actualización de origen para una revisión.')
  const occupied = definitions.get(key(replacement))
  if (occupied && (occupied.kind !== 'part' || JSON.stringify(occupied.document) !== JSON.stringify(intent.part))) fail('el tuple de reemplazo ya contiene otro origen.')
  if ([...definitions.values()].some(value => value.id === replacement.id && value.kind !== 'part')) fail('la identidad del reemplazo pertenece a un ensamblaje.')
  const ancestorSteps = selected.steps.slice(0, -1)
  const scopeMap: AssemblyPartReplacementPlan['scopeMap'] = intent.mode === 'all' ? [] : ancestorSteps.map((step, index) => ({
    beforeScope: ref(step.definition), afterScope: { id: step.definition.id, revision: intent.ancestorRevisions[index] }, scopePath: intent.component.occurrencePath.slice(0, index + 1),
  }))
  const newKeys = new Set<string>()
  for (const mapping of scopeMap) {
    if (definitions.has(key(mapping.afterScope)) || newKeys.has(key(mapping.afterScope))) fail('una revisión nueva de ancestro ya existe o está repetida.')
    newKeys.add(key(mapping.afterScope))
  }
  const time = Math.max(Date.now(), Date.parse(before.updatedAt) + 1, ...ancestorSteps.map(step => Date.parse((step.definition as Node).updatedAt) + 1))
  const date = new Date(time)
  if (!Number.isFinite(date.getTime())) fail('fecha de modificación no válida.')
  const updatedAt = date.toISOString(), layout = validateAssemblyDocument(before)
  if (!occupied) layout.definitions.push({ kind: 'part', ...replacement, document: structuredClone(intent.part) })
  for (const mapping of scopeMap) {
    const original = definitions.get(key(mapping.beforeScope))!
    if (original.kind !== 'assembly') fail('un ancestro no identifica un ensamblaje.')
    layout.definitions.push({ ...structuredClone(original), revision: mapping.afterScope.revision, updatedAt })
  }
  for (let index = 0; index < scopeMap.length; index++) {
    const parent = index === 0 ? layout : layout.definitions.find(value => key(value) === key(scopeMap[index - 1].afterScope))! as EmbeddedAssemblyDefinition
    parent.occurrences.find(value => value.id === intent.component.occurrencePath[index])!.definition = ref(scopeMap[index].afterScope)
  }
  const occurrences: AssemblyPartReplacementPlan['occurrences'] = intent.mode === 'selected'
    ? [{ originalScope: ref(selected.steps.at(-1)!.node), scope: scopeMap.length ? ref(scopeMap.at(-1)!.afterScope) : ref(before), occurrenceId: selected.steps.at(-1)!.occurrence.id }]
    : nodes(before).flatMap(node => node.occurrences.filter(value => key(value.definition) === key(source)).map(value => ({ originalScope: ref(node), scope: ref(node), occurrenceId: value.id })))
  const affected = new Set(occurrences.map(value => nodeKey(value.originalScope, value.occurrenceId)))
  const expandedPaths: string[][] = []
  const expand = (node: Node, path: string[]) => {
    for (const occurrence of node.occurrences) {
      const fullPath = [...path, occurrence.id], definition = definitions.get(key(occurrence.definition))!
      if (definition.kind === 'assembly') expand(definition, fullPath)
      else if (affected.has(nodeKey(node, occurrence.id)) && (intent.mode === 'all' || samePath(fullPath, intent.component.occurrencePath))) expandedPaths.push(fullPath)
    }
  }
  expand(before, [])
  const document = structuredClone(layout), baseline = intent.mode === 'all' ? validateAssemblyDocument(before) : structuredClone(layout)
  for (const occurrence of occurrences) {
    const node = nodes(document).find(value => key(value) === key(occurrence.scope))!
    node.occurrences.find(value => value.id === occurrence.occurrenceId)!.definition = ref(replacement)
  }
  const contexts = intent.mode === 'all' ? nodes(before).map(node => ({ node, scope: ref(node), scopePath: [] as string[] }))
    : [{ node: before as Node, scope: ref(before), scopePath: [] as string[] }, ...scopeMap.map(mapping => ({
      node: definitions.get(key(mapping.beforeScope))! as EmbeddedAssemblyDefinition, scope: ref(mapping.afterScope), scopePath: [...mapping.scopePath],
    }))]
  const endpoints: AssemblyReplacementEndpointPlan[] = []
  for (const context of contexts) for (const mate of context.node.mates) for (const { side, reference: endpoint } of assemblyMateEndpoints(mate)) {
    const component = endpoint && endpointComponent(endpoint)
    if (!endpoint || !component) continue
    const resolved = trace(context.node, component.occurrencePath, definitions)
    let desired: AssemblyDefinitionReference | undefined, ancestor = false, desiredPath = component.occurrencePath
    if (intent.mode === 'all') {
      const changedIndex = resolved.steps.findIndex(step => affected.has(nodeKey(step.node, step.occurrence.id)))
      if (changedIndex >= 0) { desired = replacement; desiredPath = component.occurrencePath.slice(0, changedIndex + 1) }
    } else {
      const fullPath = [...context.scopePath, ...component.occurrencePath]
      if (prefix(intent.component.occurrencePath, fullPath)) {
        desired = replacement; desiredPath = intent.component.occurrencePath.slice(context.scopePath.length)
      }
      else {
        const mapping = scopeMap.find(value => samePath(value.scopePath, fullPath))
        if (mapping) { desired = mapping.afterScope; ancestor = true }
      }
    }
    if (!desired) continue
    const desiredComponent = { occurrencePath: [...desiredPath], definition: ref(desired) }
    const retainFrame = !isAssemblyProfileCenterEndpoint(endpoint) && !isAssemblyPathEndpoint(endpoint) && (!('kind' in endpoint) || endpoint.kind === 'principal-plane') && resolved.complete && key(resolved.definition) === key(component.definition)
    const locator = { scope: ref(context.scope), mateId: mate.id, side }, originalLocator = { ...locator, scope: ref(context.node) }
    endpoints.push({ originalLocator, locator, endpoint: structuredClone(endpoint), desiredComponent, retainFrame })
    if (retainFrame) {
      const updated = rebound(endpoint, desiredComponent)
      setEndpoint(document, locator, updated)
      if (ancestor) setEndpoint(baseline, locator, updated)
    }
  }
  document.updatedAt = updatedAt
  return { kind: 'assembly-replacement-plan', document: validateAssemblyDocument(document), baseline: validateAssemblyDocument(baseline),
    source, replacement: ref(replacement), scopeMap, occurrences, expandedPaths, endpoints }
}
