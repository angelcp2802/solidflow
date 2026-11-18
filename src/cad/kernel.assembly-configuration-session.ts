import { applyAssemblyConfiguredOccurrenceEdit, validateAssemblyConfiguredOccurrenceEdit, type AssemblyConfiguredOccurrenceEdit } from '../model/assemblyConfiguredOccurrenceEditing'
import { MAX_ASSEMBLY_BYTES } from '../model/assemblyDocument'
import { applyAssemblyConfiguredMateEdit, validateAssemblyConfiguredMateEdit, type AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { inspectAssemblyConfiguredMechanicalEdit, type AssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'
import { prepareConfiguredAssemblyMechanicalProposal } from './kernel.assembly-configuration-mechanical-capture'
import { assemblyConfiguredGeometryInput, validateAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument,
  type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { applyPreparedConfiguredAssemblySolve, prepareConfiguredAssemblySolve, validateConfiguredAssemblySolvePolicy,
  type ConfiguredAssemblySolveOptions, type ConfiguredAssemblySolvePreparation } from './kernel.assembly-configuration-solve'
import { buildConfiguredAssemblyScene, type ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'
import { captureConfiguredAssemblyWorkerContext, type ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-context'
export type { ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-context'

export interface ConfiguredAssemblyPreviewReply {
  kind: 'configured-assembly-preview'
  token: string
  generation: number
  candidateGeneration: number
  document: AssemblyConfiguredDocument
  scene: ConfiguredAssemblyScene
  states: ConfiguredAssemblySolvePreparation['states']
  verification: ConfiguredAssemblySolvePreparation['verification']
  changed: boolean
}
export interface ConfiguredAssemblyAppliedReply {
  kind: 'configured-assembly-applied'
  generation: number
  document: AssemblyConfiguredDocument
  scene: ConfiguredAssemblyScene
}
export type ConfiguredAssemblyKernelRequest =
  | { id: number; action: 'build-configured-assembly'; current: ConfiguredAssemblyWorkerContext }
  | { id: number; action: 'preview-configured-assembly'; current: ConfiguredAssemblyWorkerContext; options?: ConfiguredAssemblySolveOptions }
  | { id: number; action: 'preview-configured-assembly-occurrence-edit'; current: ConfiguredAssemblyWorkerContext; edit: AssemblyConfiguredOccurrenceEdit; options?: ConfiguredAssemblySolveOptions }
  | { id: number; action: 'preview-configured-assembly-relation-edit'; current: ConfiguredAssemblyWorkerContext; edit: AssemblyConfiguredMateEdit; options?: ConfiguredAssemblySolveOptions }
  | { id: number; action: 'preview-configured-assembly-mechanical-edit'; current: ConfiguredAssemblyWorkerContext; intent: AssemblyConfiguredMechanicalEdit; options?: ConfiguredAssemblySolveOptions }
  | { id: number; action: 'apply-configured-assembly'; current: ConfiguredAssemblyWorkerContext; token: string }
  | { id: number; action: 'discard-configured-assembly'; token: string }

function signature(current: ConfiguredAssemblyWorkerContext): string {
  // The file has its own exact 20 MiB cap. The small runtime envelope must not
  // turn a valid maximum-size file into an unbounded transport or false reject.
  const value = JSON.stringify(current)
  if (new TextEncoder().encode(value).byteLength > MAX_ASSEMBLY_BYTES + 1024) throw Error('Configured worker context exceeds its transport budget.')
  return value
}
interface Pending {
  token: string
  baseline: string
  handle: ConfiguredAssemblySolvePreparation
  candidate: string
  generation: number
  preparedInput: ReturnType<typeof assemblyConfiguredGeometryInput>
}

/** Copied capture fields are declarations, never fresh configured producers. */
export function captureConfiguredAssemblyRelationEdit(edit: unknown): AssemblyConfiguredMateEdit {
  const owned = validateAssemblyConfiguredMateEdit(edit)
  if (owned.change.kind === 'add' || owned.change.kind === 'replace') {
    const mate = owned.change.mate
    if (mate.type === 'lock' || mate.type === 'gear' || mate.type === 'screw' || mate.type === 'rack-pinion'
      || (mate.type === 'concentric' && mate.rotationLock !== null)) throw Error('This relation requires a fresh configured capture producer before authoring.')
  }
  return owned
}

/** No native object outlives a call. The genuine in-process preparation stays
 * private here: structured-cloned reports, candidates or scene tags cannot Apply. */
export class ConfiguredAssemblyWorkerSession {
  #pending: Pending | null = null
  build(current: ConfiguredAssemblyWorkerContext): ConfiguredAssemblyScene {
    const owned = captureConfiguredAssemblyWorkerContext(current), baseline = signature(owned)
    const scene = buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(owned.document, owned.generation))
    if (signature(captureConfiguredAssemblyWorkerContext(current)) !== baseline) throw Error('Configured build context changed during native work.')
    return scene
  }
  preview(current: ConfiguredAssemblyWorkerContext, options: ConfiguredAssemblySolveOptions = {}): ConfiguredAssemblyPreviewReply {
    const owned = captureConfiguredAssemblyWorkerContext(current), baseline = signature(owned)
    validateConfiguredAssemblySolvePolicy(options)
    return this.#prepare(current, owned, owned, baseline, options)
  }
  previewEdit(current: ConfiguredAssemblyWorkerContext, edit: AssemblyConfiguredMateEdit, options: ConfiguredAssemblySolveOptions = {}): ConfiguredAssemblyPreviewReply {
    const owned = captureConfiguredAssemblyWorkerContext(current), baseline = signature(owned)
    const intent = captureConfiguredAssemblyRelationEdit(edit)
    validateConfiguredAssemblySolvePolicy(options)
    const proposed = { document: applyAssemblyConfiguredMateEdit(owned.document, intent), generation: owned.generation }
    return this.#prepare(current, owned, proposed, baseline, options)
  }
  previewOccurrenceEdit(current: ConfiguredAssemblyWorkerContext, edit: AssemblyConfiguredOccurrenceEdit, options: ConfiguredAssemblySolveOptions = {}): ConfiguredAssemblyPreviewReply {
    const owned = captureConfiguredAssemblyWorkerContext(current), baseline = signature(owned)
    const intent = validateAssemblyConfiguredOccurrenceEdit(edit)
    validateConfiguredAssemblySolvePolicy(options)
    const proposed = { document: applyAssemblyConfiguredOccurrenceEdit(owned.document, intent), generation: owned.generation }
    return this.#prepare(current, owned, proposed, baseline, options)
  }
  previewMechanicalEdit(current: ConfiguredAssemblyWorkerContext, intent: AssemblyConfiguredMechanicalEdit, options: ConfiguredAssemblySolveOptions = {}): ConfiguredAssemblyPreviewReply {
    const owned = captureConfiguredAssemblyWorkerContext(current), baseline = signature(owned)
    const inspected = inspectAssemblyConfiguredMechanicalEdit(owned.document, intent)
    validateConfiguredAssemblySolvePolicy(options)
    this.#pending = null
    const proposed = prepareConfiguredAssemblyMechanicalProposal(owned, inspected.edit, options)
    if (signature(captureConfiguredAssemblyWorkerContext(current)) !== baseline) throw Error('Configured mechanical edit context changed during native work.')
    return this.#prepare(current, owned, proposed, baseline, options)
  }
  #prepare(current: ConfiguredAssemblyWorkerContext, owned: ConfiguredAssemblyWorkerContext, proposed: ConfiguredAssemblyWorkerContext,
    baseline: string, options: ConfiguredAssemblySolveOptions): ConfiguredAssemblyPreviewReply {
    this.#pending = null
    const preparedInput = assemblyConfiguredGeometryInput(proposed.document, proposed.generation)
    const handle = prepareConfiguredAssemblySolve(preparedInput, options)
    const candidate = validateAssemblyConfiguredDocument({ version: 3, kind: 'configured-assembly', source: handle.candidate.document,
      catalog: handle.candidate.catalog, rootConfiguration: handle.candidate.rootConfiguration })
    const nextGeneration = Math.max(handle.candidate.generation, owned.generation + 1)
    if (!Number.isSafeInteger(nextGeneration)) throw Error('Configured worker generation cannot advance safely.')
    // A matching actual effective scene is required before the token exists.
    const scene = buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(candidate, nextGeneration))
    if (signature(captureConfiguredAssemblyWorkerContext(current)) !== baseline) throw Error('Configured preview context changed during native work.')
    const token = crypto.randomUUID(), serialized = serializeAssemblyConfiguredDocument(candidate)
    const result: ConfiguredAssemblyPreviewReply = { kind: 'configured-assembly-preview', token, generation: owned.generation,
      candidateGeneration: nextGeneration, document: candidate, scene, states: structuredClone(handle.states), verification: structuredClone(handle.verification),
      changed: serialized !== serializeAssemblyConfiguredDocument(owned.document) }
    this.#pending = { token, baseline, handle, candidate: serialized, generation: nextGeneration, preparedInput }
    return result
  }
  apply(current: ConfiguredAssemblyWorkerContext, token: string): ConfiguredAssemblyAppliedReply {
    const pending = this.#pending
    if (!pending || typeof token !== 'string' || token !== pending.token) throw Error('Configured preview token is unknown or consumed.')
    // A matching attempt consumes before validation, including malformed/stale
    // input or a later scene failure. Unrelated tokens do not revoke a newer one.
    this.#pending = null
    const owned = captureConfiguredAssemblyWorkerContext(current), baseline = signature(owned)
    if (baseline !== pending.baseline) throw Error('Configured Apply requires its exact complete baseline.')
    const applied = applyPreparedConfiguredAssemblySolve(pending.preparedInput, pending.handle)
    const document = validateAssemblyConfiguredDocument({ version: 3, kind: 'configured-assembly', source: applied.document,
      catalog: applied.catalog, rootConfiguration: applied.rootConfiguration })
    if (serializeAssemblyConfiguredDocument(document) !== pending.candidate) throw Error('Configured private candidate changed before Apply.')
    const scene = buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(document, pending.generation))
    if (signature(captureConfiguredAssemblyWorkerContext(current)) !== baseline) throw Error('Configured Apply context changed during native work.')
    return { kind: 'configured-assembly-applied', generation: pending.generation, document, scene }
  }
  /** Drop only the requested capability after an asynchronously stale reply. */
  discard(token?: string): void { if (token === undefined || this.#pending?.token === token) this.#pending = null }
}
