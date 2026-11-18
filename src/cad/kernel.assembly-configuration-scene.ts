import { MAX_ASSEMBLY_BYTES } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration, validateAssemblyConfigurationDeclarations, type AssemblyConfigurationAncestry, type AssemblyConfigurationDiagnostic } from '../model/assemblyConfigurationCore'
import type { AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { buildAssemblySceneFromOccurrences } from './kernel.assembly-scene'
import type { AssemblyScene, AssemblySceneBody } from './kernel.assembly-types'

type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T
export type ConfiguredAssemblySceneBody = ReadonlyData<AssemblySceneBody & { configurationAncestry: AssemblyConfigurationAncestry[] }>
/** A display context and current material metadata, never a native witness or
 * a private solver/Apply capability. The wrapper cannot pass a legacy guard. */
export interface ConfiguredAssemblyScene {
  readonly kind: 'configured-assembly-scene'
  readonly context: ReadonlyData<{
    generation: number
    root: { id: string; revision: string }
    rootConfiguration: string | null
    sourceSignature: string
    catalogSignature: string
  }>
  readonly scene: ReadonlyData<Omit<AssemblyScene, 'bodies'>> & { readonly bodies: readonly ConfiguredAssemblySceneBody[] }
  readonly referenceDiagnostics: readonly ReadonlyData<AssemblyConfigurationDiagnostic>[]
}
function freeze<T>(value: T, seen = new WeakSet<object>()): ReadonlyData<T> {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value); for (const child of Object.values(value)) freeze(child, seen); Object.freeze(value)
  }
  return value as ReadonlyData<T>
}
function fields(input: AssemblyConfigurationGeometryInput) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('Configured scene requires plain own context data.')
  const descriptors = Object.getOwnPropertyDescriptors(input), names = ['document', 'catalog', 'rootConfiguration', 'generation'] as const
  if (Reflect.ownKeys(descriptors).length !== names.length || names.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]) || descriptors[key].value === undefined)) throw Error('Configured scene requires its four exact data fields.')
  const generation = descriptors.generation.value
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) throw Error('Configured scene generation must be a nonnegative safe integer.')
  return { document: descriptors.document.value!, catalog: descriptors.catalog.value!, rootConfiguration: descriptors.rootConfiguration.value!, generation }
}
function signature(source: unknown, catalog: unknown, rootConfiguration: string | null, generation: number) {
  const value = JSON.stringify({ document: source, catalog, rootConfiguration, generation })
  if (new TextEncoder().encode(value).byteLength > MAX_ASSEMBLY_BYTES) throw Error('Configured scene context exceeds its byte budget.')
  return value
}

/** Build actual placed BReps from the effective Core inventory, without
 * manufacturing an effective v2 document or changing the legacy base path.
 * Hidden parts retain physical totals; suppressed parts allocate no body.
 * Reference diagnostics do not pretend that renderable geometry is solved. */
export function buildConfiguredAssemblyScene(input: AssemblyConfigurationGeometryInput): ConfiguredAssemblyScene {
  const raw = fields(input), evaluation = evaluateAssemblyConfiguration(raw.document, raw.catalog, raw.rootConfiguration)
  const baseline = signature(evaluation.source, evaluation.catalog, evaluation.rootConfiguration, raw.generation)
  const parts = evaluation.parts.filter(part => !part.suppressed), byPath = new Map(parts.map(part => [JSON.stringify(part.path), part]))
  // This call owns every prototype/copy and releases all of them before its
  // detached DTO can return, including when native meshing or cleanup fails.
  const nativeScene = buildAssemblySceneFromOccurrences(parts)
  const bodies = nativeScene.bodies.map(body => {
    const part = byPath.get(JSON.stringify(body.component.occurrencePath))
    if (!part) throw Error('Configured scene lost its actual effective part path.')
    return { ...body, configurationAncestry: structuredClone(part.configurationAncestry) }
  })
  const current = fields(input), declarations = validateAssemblyConfigurationDeclarations(current.document, current.catalog, current.rootConfiguration)
  if (signature(declarations.source, declarations.catalog, declarations.rootConfiguration, current.generation) !== baseline) throw Error('Configured scene context changed during native construction.')
  return freeze({ kind: 'configured-assembly-scene' as const,
    context: { generation: raw.generation, root: { id: evaluation.source.id, revision: evaluation.source.revision }, rootConfiguration: evaluation.rootConfiguration,
      sourceSignature: JSON.stringify(evaluation.source), catalogSignature: JSON.stringify(evaluation.catalog) },
    scene: { ...nativeScene, bodies }, referenceDiagnostics: structuredClone(evaluation.diagnostics) })
}
