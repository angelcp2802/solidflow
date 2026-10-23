import { assemblyDefinitionKey, assemblyOccurrencePathKey, validateAssemblyDocument, MAX_ASSEMBLY_OCCURRENCES,
  type AssemblyComponentReference, type AssemblyDocument, type AssemblyDefinition, type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import type { BodyReference, Vec3 } from '../cad/kernel.types'

/** Admission caps, not bounds on native kernel time or peak memory. */
export const MAX_ASSEMBLY_ANALYSIS_BODIES = 256
export const MAX_ASSEMBLY_ANALYSIS_PAIRS = 32640
export const MAX_ASSEMBLY_ANALYSIS_MESH_NUMBERS = 4000000

export interface AssemblyInterferenceScope {
  mode: 'all' | 'among-selected' | 'selected-against-rest'
  selected: AssemblyComponentReference[]
  excluded: AssemblyComponentReference[]
}
export interface AssemblyInterferenceScopeSummary {
  mode: AssemblyInterferenceScope['mode']
  /** Active leaves matched before exclusions and hidden filtering. */
  selectedLeafCount: number
  /** Active leaves matched by exclusions, including hidden selected leaves. */
  excludedLeafCount: number
  /** Participating leaves after mode, exclusions and hidden filtering; may have no bodies. */
  eligibleLeafCount: number
  /** Eligible body pairs, before the native bounds broad phase. */
  eligiblePairCount: number
}
export interface AssemblyInterferenceOptions {
  /** Millimeters. */
  clearance: number
  /** Millimeters; native per-pair tolerances may require a larger band. */
  lengthTolerance: number
  /** Cubic millimeters; positive intersections below this remain reported. */
  volumeTolerance: number
  includeHidden: boolean
  /** Omission excludes pairs within one leaf component; true also inspects its distinct bodies. */
  includeWithinComponent?: boolean
  /** Omit pairs sharing a document-root child, independently of selection/exclusions. */
  treatSubassembliesAsComponents?: boolean
  /** Omission retains all active leaves with no exclusions. */
  scope?: AssemblyInterferenceScope
}
export interface AssemblyAnalysisBody {
  component: AssemblyComponentReference
  /** Null names a legacy aggregate, never an inferred explicit body. */
  body: BodyReference | null
  componentName: string
  bodyName: string
}
export interface AssemblyInterferencePair {
  id: string
  first: AssemblyAnalysisBody
  second: AssemblyAnalysisBody
  status: 'overlap' | 'small-overlap' | 'contact' | 'clearance'
  intersectionVolume: number
  solidCount: number
  minimumDistance: number
  closestPoints: { first: Vec3; second: Vec3 } | null
  lengthTolerance: number
  volumeTolerance: number
  intersectionMesh: { vertices: number[]; normals: number[]; triangles: number[] } | null
}
/** Per-body-pair observations only; pair intersections are not a union volume. */
export interface AssemblyInterferenceReport {
  kind: 'assembly-interference-report'
  analysisId: string
  options: AssemblyInterferenceOptions
  scopeSummary: AssemblyInterferenceScopeSummary
  bodyCount: number
  componentCount: number
  potentialPairCount: number
  testedPairCount: number
  broadPhaseExcludedCount: number
  pairs: AssemblyInterferencePair[]
  warnings: string[]
}
function fail(message: string): never { throw new Error('Análisis de ensamblaje: ' + message) }
function record(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('se esperaba un objeto de datos.')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail('prototipo no válido.')
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      fail('solo se admiten los campos de datos enumerables declarados.')
    }
    result[key] = descriptor.value
  }
  if (required.some(key => !Object.hasOwn(result, key))) fail('faltan campos obligatorios.')
  return result
}
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(name + ' debe ser un número finito.')
  return value
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('identificador no válido.')
  return value
}
function componentReference(input: unknown): AssemblyComponentReference {
  const source = record(input, ['occurrencePath', 'definition'], ['occurrencePath', 'definition'])
  const path = JSON.parse(assemblyOccurrencePathKey(source.occurrencePath as string[])) as string[]
  if (!path.length) fail('el ámbito necesita una ruta de ocurrencia no vacía.')
  const definition = record(source.definition, ['id', 'revision'], ['id', 'revision'])
  return { occurrencePath: path, definition: { id: identifier(definition.id), revision: identifier(definition.revision) } }
}
function componentList(input: unknown): AssemblyComponentReference[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > MAX_ASSEMBLY_OCCURRENCES) {
    fail('la lista de componentes debe ser una lista de datos acotada.')
  }
  const fields = Object.getOwnPropertyDescriptors(input), keys = Reflect.ownKeys(fields).filter(key => key !== 'length')
  if (keys.length !== input.length) fail('la lista de componentes debe ser densa y sin campos adicionales.')
  for (let index = 0; index < input.length; index++) {
    const field = fields[String(index)]
    if (!field || !field.enumerable || !('value' in field)) fail('la lista de componentes requiere datos enumerables sin accesores.')
  }
  if (keys.some(key => typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) {
    fail('la lista de componentes contiene campos desconocidos.')
  }
  const result = Array.from({ length: input.length }, (_, index) => componentReference(fields[String(index)].value))
  const unique = new Set(result.map(value => JSON.stringify([value.occurrencePath, value.definition.id, value.definition.revision])))
  if (unique.size !== result.length) fail('la lista de componentes repite una referencia exacta.')
  return result
}
function scope(input: unknown): AssemblyInterferenceScope {
  const source = record(input, ['mode', 'selected', 'excluded'], ['mode', 'selected', 'excluded'])
  if (source.mode !== 'all' && source.mode !== 'among-selected' && source.mode !== 'selected-against-rest') fail('modo de ámbito desconocido.')
  const selected = componentList(source.selected), excluded = componentList(source.excluded)
  if (source.mode === 'all' ? selected.length !== 0 : selected.length === 0) {
    fail(source.mode === 'all' ? 'el modo todos requiere una selección vacía.' : 'el modo requiere al menos un componente seleccionado.')
  }
  return { mode: source.mode, selected, excluded }
}

/** Syntax/options only. Native bounds, distances, intersections and cleanup are separate. */
export function validateAssemblyInterferenceOptions(input?: Partial<AssemblyInterferenceOptions>): AssemblyInterferenceOptions {
  const source = input === undefined ? Object.create(null) as Record<string, unknown>
    : record(input, ['clearance', 'lengthTolerance', 'volumeTolerance', 'includeHidden', 'includeWithinComponent', 'treatSubassembliesAsComponents', 'scope'])
  const clearance = finite(Object.hasOwn(source, 'clearance') ? source.clearance : 1, 'La holgura')
  const lengthTolerance = finite(Object.hasOwn(source, 'lengthTolerance') ? source.lengthTolerance : 1e-6, 'La tolerancia de longitud')
  const volumeTolerance = finite(Object.hasOwn(source, 'volumeTolerance') ? source.volumeTolerance : 1e-6, 'La tolerancia de volumen')
  const includeHidden = Object.hasOwn(source, 'includeHidden') ? source.includeHidden : true
  const includeWithinComponent = Object.hasOwn(source, 'includeWithinComponent') ? source.includeWithinComponent : false
  const treatSubassembliesAsComponents = Object.hasOwn(source, 'treatSubassembliesAsComponents') ? source.treatSubassembliesAsComponents : false
  if (clearance < 0 || lengthTolerance <= 0 || volumeTolerance < 0) fail('la holgura y tolerancia de volumen deben ser no negativas; la tolerancia de longitud debe ser positiva.')
  if (typeof includeHidden !== 'boolean') fail('la inclusión de cuerpos ocultos debe ser verdadera o falsa.')
  if (typeof includeWithinComponent !== 'boolean') fail('la inclusión de cuerpos de una misma pieza debe ser verdadera o falsa.')
  if (typeof treatSubassembliesAsComponents !== 'boolean') fail('la agrupación de subensamblajes debe ser verdadera o falsa.')
  if (!Number.isFinite(clearance + lengthTolerance)) fail('la suma de holgura y tolerancia excede el intervalo finito.')
  const suppliedScope = Object.hasOwn(source, 'scope') ? scope(source.scope) : undefined
  return { clearance, lengthTolerance, volumeTolerance, includeHidden, includeWithinComponent, treatSubassembliesAsComponents,
    ...(suppliedScope ? { scope: suppliedScope } : {}) }
}

export interface ResolvedAssemblyInterferenceScope {
  mode: AssemblyInterferenceScope['mode']
  selectedLeafPaths: string[][]
  excludedLeafPaths: string[][]
  eligibleLeafPaths: string[][]
}
/** Current declaration scope only, never a native geometry or reference witness. */
export function resolveAssemblyInterferenceScope(input: AssemblyDocument, supplied: AssemblyInterferenceOptions): ResolvedAssemblyInterferenceScope {
  const document = validateAssemblyDocument(input), options = validateAssemblyInterferenceOptions(supplied)
  const policy = options.scope ?? { mode: 'all' as const, selected: [], excluded: [] }
  const definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  for (const reference of [...policy.selected, ...policy.excluded]) {
    let node: AssemblyDefinition = document
    for (const id of reference.occurrencePath) {
      if (node.kind !== 'assembly') fail('la ruta del ámbito atraviesa una pieza.')
      const occurrence: AssemblyOccurrence | undefined = node.occurrences.find(value => value.id === id)
      if (!occurrence) fail('un componente del ámbito ya no existe.')
      node = definitions.get(assemblyDefinitionKey(occurrence.definition))!
    }
    if (assemblyDefinitionKey(node) !== assemblyDefinitionKey(reference.definition)) fail('la revisión de un componente del ámbito ya no coincide.')
  }
  const selectedLeafPaths: string[][] = [], excludedLeafPaths: string[][] = [], eligibleLeafPaths: string[][] = []
  const matches = (path: string[], references: AssemblyComponentReference[]) => references.some(value =>
    value.occurrencePath.length <= path.length && value.occurrencePath.every((id, index) => path[index] === id))
  const walk = (node: AssemblyDocument | EmbeddedAssemblyDefinition, prefix: string[], hidden: boolean) => {
    for (const occurrence of node.occurrences) {
      if (occurrence.suppressed) continue
      const path = [...prefix, occurrence.id], nextHidden = hidden || !occurrence.visible
      const definition = definitions.get(assemblyDefinitionKey(occurrence.definition))!
      if (definition.kind === 'assembly') { walk(definition, path, nextHidden); continue }
      const selected = matches(path, policy.selected), excluded = matches(path, policy.excluded)
      if (selected) selectedLeafPaths.push([...path])
      if (excluded) excludedLeafPaths.push([...path])
      if (!excluded && (!nextHidden || options.includeHidden) && (policy.mode !== 'among-selected' || selected)) eligibleLeafPaths.push(path)
    }
  }
  walk(document, [], false)
  return { mode: policy.mode, selectedLeafPaths, excludedLeafPaths, eligibleLeafPaths }
}

/** Scoped identity only. Names and this JSON key cannot attest a current native body. */
export function assemblyAnalysisBodyKey(body: AssemblyAnalysisBody): string {
  const fields = ['component', 'body', 'componentName', 'bodyName']
  const source = record(body, fields, fields), component = record(source.component, ['occurrencePath', 'definition'], ['occurrencePath', 'definition'])
  const path = assemblyOccurrencePathKey(component.occurrencePath as readonly string[])
  if (path === '[]') fail('la identidad necesita una ruta de ocurrencia no vacía.')
  const definition = record(component.definition, ['id', 'revision'], ['id', 'revision'])
  if (typeof source.componentName !== 'string' || typeof source.bodyName !== 'string') fail('los nombres deben ser texto.')
  let owner: [string, string] | null = null
  if (source.body !== null) {
    const explicit = record(source.body, ['bodyId', 'sourceFeatureId'], ['bodyId', 'sourceFeatureId'])
    owner = [identifier(explicit.bodyId), identifier(explicit.sourceFeatureId)]
  }
  return JSON.stringify([JSON.parse(path), identifier(definition.id), identifier(definition.revision), owner])
}
