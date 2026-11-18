import {
  assemblyDefinitionKey, validateAssemblyDocument, validateAssemblyMate, MAX_ASSEMBLY_BYTES, MAX_ASSEMBLY_OCCURRENCES, MAX_ASSEMBLY_MATES,
  type AssemblyDocument, type AssemblyDefinitionReference, type AssemblyOccurrence,
  type AssemblyMate, type ExpandedPartOccurrence, type EmbeddedAssemblyDefinition,
} from './assemblyDocument'
import { assemblyMateEndpoints, assemblyMateEndpointComponent, type AssemblyMateEndpointSide } from './assemblyMateEndpoints'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type RigidPose } from './rigidPose'
import {validateAssemblyConfigurationCapture,applyAssemblyConfigurationCapture,type AssemblyConfigurationCapture} from './assemblyConfigurationCapture'

export const MAX_ASSEMBLY_CONFIGURATIONS_PER_OWNER = 64
export const MAX_ASSEMBLY_CONFIGURATIONS = 512
export const MAX_ASSEMBLY_CONFIGURATION_OVERRIDES = 4096

export interface AssemblyConfigurationOccurrenceOverride {
  occurrenceId: string
  pose?: RigidPose
  suppressed?: boolean
  visible?: boolean
  fixed?: boolean
  configuration?: string | null
}
export interface AssemblyConfigurationDefinition {
  id: string
  name: string
  occurrences: AssemblyConfigurationOccurrenceOverride[]
  mates: { mateId: string; suppressed: boolean; capture?: AssemblyConfigurationCapture }[]
  /** Absent inherits Base; an explicit empty list declares no relations. */
  mateDeclarations?: AssemblyMate[]
}
export type AssemblyConfigurationCatalog = {
  definition: AssemblyDefinitionReference
  configurations: AssemblyConfigurationDefinition[]
}[]
export interface AssemblyConfigurationAncestry {
  path: string[]
  definition: AssemblyDefinitionReference
  configuration: string | null
}
export interface AssemblyConfigurationScope extends AssemblyConfigurationAncestry {
  occurrences: AssemblyOccurrence[]
  mates: AssemblyMate[]
  worldPose: RigidPose
  suppressed: boolean
  visible: boolean
}
export interface AssemblyConfigurationDiagnostic {
  scopePath: string[]
  mateId: string
  side: AssemblyMateEndpointSide
  path: string[]
  problem: 'missing-occurrence' | 'path-through-part' | 'stale-definition' | 'suppressed-component'
}
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T
export type AssemblyConfigurationEvaluation = DeepReadonly<{
  kind: 'assembly-configuration-evaluation'
  source: AssemblyDocument
  catalog: AssemblyConfigurationCatalog
  rootConfiguration: string | null
  scopes: AssemblyConfigurationScope[]
  parts: (ExpandedPartOccurrence & { configurationAncestry: AssemblyConfigurationAncestry[] })[]
  diagnostics: AssemblyConfigurationDiagnostic[]
  status: 'ready' | 'references-unavailable'
}>
type ScopeNode = AssemblyDocument | EmbeddedAssemblyDefinition
function fail(message: string): never { throw Error('Configuración rígida: ' + message) }

function record(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('se requiere un registro de datos.')
  const fields = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(fields)) {
    if (typeof key !== 'string' || ![...required, ...optional].includes(key)
      || !fields[key].enumerable || !('value' in fields[key])) fail('campo desconocido o ejecutable.')
    if (fields[key].value === undefined) fail('un campo presente no puede ser undefined.')
  }
  if (required.some(key => !Object.hasOwn(fields, key))) fail('falta un campo obligatorio.')
  return value as Record<string, unknown>
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) fail('lista no densa o fuera de presupuesto.')
  for (let i = 0; i < value.length; i++) {
    const field = Object.getOwnPropertyDescriptor(value, String(i))
    if (!field?.enumerable || !('value' in field) || field.value === undefined) fail('lista ejecutable o incompleta.')
  }
  return value
}
function text(value: unknown, maximum = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) fail('identificador o nombre no válido.')
  return value
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') fail('se requiere booleano.'); return value }
function pose(value: unknown): RigidPose {
  const input = record(value, ['translation', 'rotation'])
  for (const [key, length] of [['translation', 3], ['rotation', 4]] as const) {
    const numbers = array(input[key], length)
    if (numbers.length !== length || numbers.some(n => typeof n !== 'number' || !Number.isFinite(n))) fail('pose de datos finitos no válida.')
  }
  return validateRigidPose(input)
}
function frozen<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    if (seen.has(value)) return value as DeepReadonly<T>
    seen.add(value)
    for (const child of Object.values(value)) frozen(child, seen)
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

/** A declaration-only normalization boundary. No expanded placement validity,
 * reference availability, native purpose or solver admission is implied. */
export type AssemblyConfigurationDeclarations = DeepReadonly<{
  source: AssemblyDocument
  catalog: AssemblyConfigurationCatalog
  rootConfiguration: string|null
}>

function parseAssemblyConfigurationDeclarations(document:AssemblyDocument,inputCatalog:unknown,rootConfiguration:string|null) {
  const source = validateAssemblyDocument(document)
  if (rootConfiguration !== null) rootConfiguration = text(rootConfiguration)
  const nodes = new Map([source, ...source.definitions].map(node => [assemblyDefinitionKey(node), node]))
  const configurations = new Map<string, Map<string, AssemblyConfigurationDefinition>>()
  let variantCount = 0, overrideCount = 0
  const catalog: AssemblyConfigurationCatalog = array(inputCatalog, 513).map(rawOwner => {
    const owner = record(rawOwner, ['definition', 'configurations']), rawDefinition = record(owner.definition, ['id', 'revision'])
    const definition = { id: text(rawDefinition.id), revision: text(rawDefinition.revision) }, key = assemblyDefinitionKey(definition)
    const node = nodes.get(key)
    if (!node || node.kind !== 'assembly' || configurations.has(key)) fail('propietario de variantes ausente, duplicado o no ensamblaje.')
    const variants = new Map<string, AssemblyConfigurationDefinition>(); configurations.set(key, variants)
    const declared = array(owner.configurations, MAX_ASSEMBLY_CONFIGURATIONS_PER_OWNER).map(raw => {
      if (++variantCount > MAX_ASSEMBLY_CONFIGURATIONS) fail('se superan 512 configuraciones.')
      const value = record(raw, ['id', 'name', 'occurrences', 'mates'], ['mateDeclarations']), id = text(value.id), name = text(value.name, 200)
      if (variants.has(id)) fail('identificador de configuración duplicado.')
      const mateDeclarations = Object.hasOwn(value, 'mateDeclarations')
        ? array(value.mateDeclarations, MAX_ASSEMBLY_MATES).map(item => {
          if (++overrideCount > MAX_ASSEMBLY_CONFIGURATION_OVERRIDES) fail('se superan 4096 sustituciones.')
          return validateAssemblyMate(item)
        }) : undefined
      if (mateDeclarations && new Set(mateDeclarations.map(mate => mate.id)).size !== mateDeclarations.length) fail('declaración de relación duplicada.')
      const declaredMates = mateDeclarations ?? node.mates
      const occurrences = array(value.occurrences, MAX_ASSEMBLY_CONFIGURATION_OVERRIDES).map(raw => {
        if (++overrideCount > MAX_ASSEMBLY_CONFIGURATION_OVERRIDES) fail('se superan 4096 sustituciones.')
        const item = record(raw, ['occurrenceId'], ['pose', 'suppressed', 'visible', 'fixed', 'configuration'])
        const occurrenceId = text(item.occurrenceId)
        if (!node.occurrences.some(o => o.id === occurrenceId)) fail('sustitución de ocurrencia ajena al propietario.')
        const result: AssemblyConfigurationOccurrenceOverride = { occurrenceId }
        if (Object.hasOwn(item, 'pose')) result.pose = pose(item.pose)
        if (Object.hasOwn(item, 'suppressed')) result.suppressed = boolean(item.suppressed)
        if (Object.hasOwn(item, 'visible')) result.visible = boolean(item.visible)
        if (Object.hasOwn(item, 'fixed')) result.fixed = boolean(item.fixed)
        if (Object.hasOwn(item, 'configuration')) result.configuration = item.configuration === null ? null : text(item.configuration)
        return result
      })
      if (new Set(occurrences.map(o => o.occurrenceId)).size !== occurrences.length) fail('sustitución de ocurrencia duplicada.')
      const mates = array(value.mates, MAX_ASSEMBLY_CONFIGURATION_OVERRIDES).map(raw => {
        if (++overrideCount > MAX_ASSEMBLY_CONFIGURATION_OVERRIDES) fail('se superan 4096 sustituciones.')
        const item = record(raw, ['mateId', 'suppressed'], ['capture']), mateId = text(item.mateId)
        const original=declaredMates.find(m => m.id === mateId)
        if (!original) fail('sustitución de relación ajena al propietario.')
        return { mateId, suppressed: boolean(item.suppressed),
          ...(Object.hasOwn(item,'capture')?{capture:validateAssemblyConfigurationCapture(original!,item.capture)}:{}) }
      })
      if (new Set(mates.map(m => m.mateId)).size !== mates.length) fail('sustitución de relación duplicada.')
      const result = { id, name, occurrences, mates, ...(mateDeclarations === undefined ? {} : {mateDeclarations}) }; variants.set(id, result); return result
    })
    return { definition, configurations: declared }
  })
  // Validate every selector, including in unused/suppressed/dormant variants.
  for (const owner of catalog) {
    const node = nodes.get(assemblyDefinitionKey(owner.definition)) as ScopeNode
    for (const variant of owner.configurations) for (const override of variant.occurrences) {
      if (!Object.hasOwn(override, 'configuration')) continue
      const child = nodes.get(assemblyDefinitionKey(node.occurrences.find(o => o.id === override.occurrenceId)!.definition))!
      if (child.kind !== 'assembly') fail('una pieza no admite un selector de configuración, ni siquiera base.')
      if (override.configuration !== null && !configurations.get(assemblyDefinitionKey(child))?.has(override.configuration!)) fail('selector de configuración inexistente.')
    }
  }
  if (rootConfiguration !== null && !configurations.get(assemblyDefinitionKey(source))?.has(rootConfiguration)) fail('configuración raíz inexistente.')
  // Count effective declarations even in dormant or suppressed states. Reuse
  // counts by intrinsic state; repeated occurrences still contribute per use.
  const mateCounts = new Map<string, number>()
  function expandedMateCount(node: ScopeNode, selector: string|null): number {
    const key=JSON.stringify([node.id,node.revision,selector]),cached=mateCounts.get(key)
    if(cached!==undefined)return cached
    const variant=selector===null?undefined:configurations.get(assemblyDefinitionKey(node))?.get(selector)
    let count=(variant?.mateDeclarations??node.mates).length
    for(const occurrence of node.occurrences){
      const child=nodes.get(assemblyDefinitionKey(occurrence.definition))!
      if(child.kind==='assembly')count+=expandedMateCount(child,variant?.occurrences.find(row=>row.occurrenceId===occurrence.id)?.configuration??null)
      if(count>MAX_ASSEMBLY_MATES)fail('se supera el presupuesto de relaciones expandidas.')
    }
    mateCounts.set(key,count);return count
  }
  for(const node of nodes.values())if(node.kind==='assembly'){
    expandedMateCount(node,null)
    for(const id of configurations.get(assemblyDefinitionKey(node))?.keys()??[])expandedMateCount(node,id)
  }
  if (new TextEncoder().encode(JSON.stringify({ source, catalog, rootConfiguration }, null, 2)).byteLength > MAX_ASSEMBLY_BYTES) fail('el origen y el catálogo superan 20 MiB.')

  return {source,catalog,rootConfiguration,nodes,configurations}
}

/** Validate all source/catalog declarations, including dormant selectors,
 * captures and the unchanged combined byte limits, without expanding poses. */
export function validateAssemblyConfigurationDeclarations(document:AssemblyDocument,inputCatalog:unknown,rootConfiguration:string|null=null):AssemblyConfigurationDeclarations {
  const {source,catalog,rootConfiguration:selector}=parseAssemblyConfigurationDeclarations(document,inputCatalog,rootConfiguration)
  return frozen({source,catalog,rootConfiguration:selector})
}

/** Strict standalone declarations, never a saved configuration or native proof. */
export function evaluateAssemblyConfiguration(
  document: AssemblyDocument,
  inputCatalog: unknown,
  rootConfiguration: string | null = null,
): AssemblyConfigurationEvaluation {
  const parsed=parseAssemblyConfigurationDeclarations(document,inputCatalog,rootConfiguration)
  const {source,catalog,nodes,configurations}=parsed
  rootConfiguration=parsed.rootConfiguration
  const scopes: AssemblyConfigurationScope[] = [], parts: (ExpandedPartOccurrence & { configurationAncestry: AssemblyConfigurationAncestry[] })[] = []
  const byPath = new Map<string, AssemblyConfigurationScope>()
  let expanded = 0, expandedMates = 0
  function walk(node: ScopeNode, selector: string | null, path: string[], worldPose: RigidPose,
    chain: AssemblyOccurrence[], ancestry: AssemblyConfigurationAncestry[], suppressed: boolean, visible: boolean): void {
    const variant = selector === null ? undefined : configurations.get(assemblyDefinitionKey(node))!.get(selector)!
    const occurrences = node.occurrences.map(original => {
      const override = variant?.occurrences.find(o => o.occurrenceId === original.id)
      return { ...structuredClone(original), ...(override?.pose ? { pose: structuredClone(override.pose) } : {}),
        ...(override?.suppressed === undefined ? {} : { suppressed: override.suppressed }),
        ...(override?.fixed === undefined ? {} : { fixed: override.fixed }),
        ...(override?.visible === undefined ? {} : { visible: override.visible }) }
    })
    const mates = (variant?.mateDeclarations ?? node.mates).map(original => {
      const override=variant?.mates.find(m=>m.mateId===original.id)
      return { ...(override?.capture?applyAssemblyConfigurationCapture(original,override.capture):structuredClone(original)),
        suppressed: override?.suppressed ?? original.suppressed }
    })
    if ((expandedMates += mates.length) > MAX_ASSEMBLY_MATES) fail('se supera el presupuesto de relaciones expandidas.')
    const identity = { path: [...path], definition: { id: node.id, revision: node.revision }, configuration: selector }
    const scope = { ...identity, occurrences, mates, worldPose, suppressed, visible }
    scopes.push(scope); byPath.set(JSON.stringify(path), scope)
    const nextAncestry = [...ancestry, identity]
    for (const occurrence of occurrences) {
      if (++expanded > MAX_ASSEMBLY_OCCURRENCES) fail('se supera el presupuesto de ocurrencias expandidas.')
      const child = nodes.get(assemblyDefinitionKey(occurrence.definition))!, nextPath = [...path, occurrence.id]
      const placed = composeRigidPoses(worldPose, occurrence.pose), nextChain = [...chain, occurrence]
      const childSuppressed = suppressed || occurrence.suppressed, childVisible = visible && occurrence.visible
      if (child.kind === 'part') parts.push({ path: nextPath, definition: child, occurrence, chain: nextChain, worldPose: placed,
        suppressed: childSuppressed, visible: childVisible, configurationAncestry: nextAncestry })
      else {
        const override = variant?.occurrences.find(o => o.occurrenceId === occurrence.id)
        walk(child, override?.configuration ?? null, nextPath, placed, nextChain, nextAncestry, childSuppressed, childVisible)
      }
    }
  }
  walk(source, rootConfiguration, [], identityRigidPose(), [], [], false, true)
  const diagnostics: AssemblyConfigurationDiagnostic[] = []
  for (const scope of scopes) {
    if (scope.suppressed) continue
    for (const mate of scope.mates) {
      if (mate.suppressed) continue
      for (const endpoint of assemblyMateEndpoints(mate)) {
        if (endpoint.reference === null) continue
        const component = assemblyMateEndpointComponent(endpoint.reference)
        if (component === null) continue // The actual declaring scope frame.
        const fullPath = [...scope.path, ...component.occurrencePath]
        let currentScope = scope
        let suppressed: boolean = scope.suppressed
        let problem: AssemblyConfigurationDiagnostic['problem'] | undefined
        for (let index = 0; index < component.occurrencePath.length; index++) {
          const id = component.occurrencePath[index], occurrence = currentScope.occurrences.find(o => o.id === id)
          if (!occurrence) { problem = 'missing-occurrence'; break }
          suppressed ||= occurrence.suppressed
          const child = nodes.get(assemblyDefinitionKey(occurrence.definition))!
          if (index === component.occurrencePath.length - 1) {
            if (assemblyDefinitionKey(component.definition) !== assemblyDefinitionKey(child)) problem = 'stale-definition'
            else if (suppressed) problem = 'suppressed-component'
          } else {
            if (child.kind !== 'assembly') { problem = 'path-through-part'; break }
            currentScope = byPath.get(JSON.stringify([...scope.path, ...component.occurrencePath.slice(0, index + 1)]))!
          }
        }
        if (problem) diagnostics.push({ scopePath: [...scope.path], mateId: mate.id, side: endpoint.side, path: fullPath, problem })
      }
    }
  }
  return frozen({ kind: 'assembly-configuration-evaluation', source, catalog, rootConfiguration, scopes, parts, diagnostics,
    status: diagnostics.length ? 'references-unavailable' : 'ready' })
}
