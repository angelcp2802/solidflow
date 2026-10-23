import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { buildConfiguredAssembly, previewConfiguredAssembly, previewConfiguredAssemblyRelationEdit, applyConfiguredAssembly, discardConfiguredAssembly, disposeKernel, initKernel } from './kernel'
import type { AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import type { ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-context'
import type { ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'
import type { ConfiguredAssemblyPreviewReply, ConfiguredAssemblyAppliedReply } from './kernel.assembly-configuration-session'
import type { KernelRequest, KernelResponse, KernelValue } from './kernel.types'

// Transport-only controlled Worker. Replies below are detached DTO fixtures;
// they establish request capture/correlation, never native proof or Apply rights.
class ControlledConfiguredWorker {
 static instances: ControlledConfiguredWorker[] = []
 messages: KernelRequest[] = []
 onmessage: ((event: MessageEvent<KernelResponse>) => void) | null = null
 onerror: ((event: ErrorEvent) => void) | null = null
 terminated = false
 constructor() { ControlledConfiguredWorker.instances.push(this) }
 postMessage(message: KernelRequest) { this.messages.push(structuredClone(message)) }
 terminate() { this.terminated = true }
 reply(index: number, value: KernelValue = null) { this.onmessage?.({ data: { id: this.messages[index].id, ok: true, value } } as MessageEvent<KernelResponse>) }
 reject(index: number, error: string) { this.onmessage?.({ data: { id: this.messages[index].id, ok: false, error } } as MessageEvent<KernelResponse>) }
 crash(message = 'Original controlled worker restart') { this.onerror?.({ message } as ErrorEvent) }
}
beforeEach(() => { ControlledConfiguredWorker.instances = []; vi.stubGlobal('Worker', ControlledConfiguredWorker) })
afterEach(async () => { disposeKernel(); await Promise.resolve(); vi.unstubAllGlobals() })
function context(): ConfiguredAssemblyWorkerContext {
 const { document, catalog } = assemblyConfigurationCoreFixture()
 return { document: createAssemblyConfiguredDocument(document, catalog, 'mixed'), generation: 7 }
}
async function initialized() {
 const initializing = initKernel(), worker = ControlledConfiguredWorker.instances[0]
 expect(worker.messages[0].action).toBe('init'); worker.reply(0); await initializing; return worker
}
function relationEdit(current: ConfiguredAssemblyWorkerContext): AssemblyConfiguredMateEdit {
 return { scopePath: [], definition: { id: current.document.source.id, revision: current.document.source.revision }, configuration: current.document.rootConfiguration,
  change: { kind: 'remove', mateId: 'original-declaration' } }
}
it('captures relation-edit intent and complete baseline before init; preview DTO grants no extra commands', async () => {
 const current = context(), edit = relationEdit(current), options = { solver: { maxIterations: 4 } }
 const baseline = structuredClone(current), intent = structuredClone(edit)
 const pending = previewConfiguredAssemblyRelationEdit(current, edit, options), worker = ControlledConfiguredWorker.instances[0]
 edit.scopePath.push('later'); edit.definition.revision = 'later'; current.generation++; options.solver.maxIterations = 99
 worker.reply(0); await initKernel()
 expect(worker.messages[1]).toMatchObject({ action: 'preview-configured-assembly-relation-edit', current: baseline, edit: intent, options: { solver: { maxIterations: 4 } } })
 worker.reply(1, preview(baseline, 'edit-token')); expect((await pending).token).toBe('edit-token')
 expect(worker.messages).toHaveLength(2)
})
it('rejects executable edit data before init and rejects restart during edit initialization', async () => {
 const current = context(), edit = relationEdit(current); let reads = 0
 Object.defineProperty(edit, 'change', { enumerable: true, get() { reads++; return {} } })
 await expect(previewConfiguredAssemblyRelationEdit(current, edit)).rejects.toThrow(); expect(reads).toBe(0); expect(ControlledConfiguredWorker.instances).toHaveLength(0)
 const pending = previewConfiguredAssemblyRelationEdit(current, relationEdit(current))
 const rejected = expect(pending).rejects.toThrow(); disposeKernel(); await rejected
})
function scene(current: ConfiguredAssemblyWorkerContext, id: string): ConfiguredAssemblyScene {
 return { kind: 'configured-assembly-scene', context: { generation: current.generation,
  root: { id: current.document.source.id, revision: current.document.source.revision }, rootConfiguration: current.document.rootConfiguration,
  sourceSignature: JSON.stringify(current.document.source), catalogSignature: JSON.stringify(current.document.catalog) },
  scene: { kind: 'assembly-scene', sceneId: id, bodies: [], volume: 0, area: 0, solidCount: 0, prototypeCount: 0, bounds: null, visibleBounds: null, warnings: [] }, referenceDiagnostics: [] }
}
function preview(current: ConfiguredAssemblyWorkerContext, token: string): ConfiguredAssemblyPreviewReply {
 const next = { ...current, generation: current.generation + 1 }
 return { kind: 'configured-assembly-preview', token, generation: current.generation, candidateGeneration: next.generation,
  document: structuredClone(current.document), scene: scene(next, 'transport-candidate'), states: [], changed: false,
  verification: { status: 'verified', accepted: true, root: { id: current.document.source.id, revision: current.document.source.revision, configuration: current.document.rootConfiguration },
   generation: current.generation, bands: { lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }, reports: [], passiveUnavailable: [], verificationOnly: true } }
}
function applied(current: ConfiguredAssemblyWorkerContext): ConfiguredAssemblyAppliedReply {
 const next = { ...current, generation: current.generation + 1 }
 return { kind: 'configured-assembly-applied', generation: next.generation, document: structuredClone(current.document), scene: scene(next, 'transport-applied') }
}

it.each(['build', 'preview', 'apply'] as const)('captures complete %s context before initialization can yield', async action => {
 const current = context(), original = structuredClone(current)
 const pending = action === 'build' ? buildConfiguredAssembly(current) : action === 'preview' ? previewConfiguredAssembly(current) : applyConfiguredAssembly(current, 'opaque-worker-token')
 const worker = ControlledConfiguredWorker.instances[0]
 current.document.source.name = 'Later caller source edit'
 current.document.source.occurrences[0].pose.translation[0] = 999
 current.document.catalog[1].configurations[0].occurrences[0].pose!.translation[0] = 555
 current.document.rootConfiguration = null; current.generation = 999
 expect(worker.messages).toHaveLength(1)
 worker.reply(0); await initKernel()
 expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: action === 'build' ? 'build-configured-assembly' : action === 'preview' ? 'preview-configured-assembly' : 'apply-configured-assembly',
  current: original, ...(action === 'preview' ? { options: {} } : {}), ...(action === 'apply' ? { token: 'opaque-worker-token' } : {}) })
 const result = action === 'build' ? scene(original, 'transport-built') : action === 'preview' ? preview(original, 'opaque-worker-token') : applied(original)
 worker.reply(1, result); expect(await pending).toEqual(result)
})

it('detaches nested solver options and does not transport an arbitrary renderer candidate', async () => {
 const current = context(), options = { lengthToleranceMm: 1e-5, angleToleranceRad: 1e-7, solver: { maxIterations: 4, svd: { maxSweeps: 5 } } }, original = structuredClone(options)
 const pending = previewConfiguredAssembly(current, options), worker = ControlledConfiguredWorker.instances[0]
 options.lengthToleranceMm = 1; options.angleToleranceRad = 1; options.solver.maxIterations = 99; options.solver.svd.maxSweeps = 99
 worker.reply(0); await initKernel()
 expect(worker.messages[1]).toMatchObject({ action: 'preview-configured-assembly', options: original })
 expect(worker.messages[1]).not.toHaveProperty('candidate'); expect(worker.messages[1]).not.toHaveProperty('proposed'); expect(worker.messages[1]).not.toHaveProperty('handle')
 worker.reply(1, preview(current, 'private-worker-reference')); expect((await pending).token).toBe('private-worker-reference')
})

it('correlates independent build, preview and Apply response values without minting commands from reports', async () => {
 const worker = await initialized(), current = context()
 const building = buildConfiguredAssembly(current), preparing = previewConfiguredAssembly(current), applying = applyConfiguredAssembly(current, 'actual-opaque-token')
 await Promise.resolve()
 expect(worker.messages.slice(1).map(request => request.action)).toEqual(['build-configured-assembly', 'preview-configured-assembly', 'apply-configured-assembly'])
 worker.reply(3, applied(current)); worker.reply(1, scene(current, 'separate-build')); worker.reply(2, preview(current, 'reported-token'))
 expect((await building).scene.sceneId).toBe('separate-build'); expect((await preparing).token).toBe('reported-token'); expect((await applying).kind).toBe('configured-assembly-applied')
 await Promise.resolve(); expect(worker.messages).toHaveLength(4)
})

it.each(['document', 'generation', 'source', 'catalog', 'selector', 'options'] as const)('rejects executable %s data without reading it or creating a worker', async field => {
 const current = context(); let reads = 0
 const getter = () => { reads++; return undefined }
 let pending: Promise<unknown>
 if (field === 'document') Object.defineProperty(current, 'document', { enumerable: true, get: getter })
 if (field === 'generation') Object.defineProperty(current, 'generation', { enumerable: true, get: getter })
 if (field === 'source') Object.defineProperty(current.document.source, 'name', { enumerable: true, get: getter })
 if (field === 'catalog') Object.defineProperty(current.document.catalog[1].configurations[0], 'occurrences', { enumerable: true, get: getter })
 if (field === 'selector') Object.defineProperty(current.document, 'rootConfiguration', { enumerable: true, get: getter })
 if (field === 'options') {
  const options = { solver: {} }; Object.defineProperty(options.solver, 'maxIterations', { enumerable: true, get: getter })
  pending = previewConfiguredAssembly(current, options)
 } else pending = buildConfiguredAssembly(current)
 await expect(pending).rejects.toThrow(); expect(reads).toBe(0); expect(ControlledConfiguredWorker.instances).toHaveLength(0)
})

it('rejects malformed complete contexts before initialization and preserves independent caller data', async () => {
 const current = context(), before = structuredClone(current)
 await expect(buildConfiguredAssembly({ ...current, generation: -1 })).rejects.toThrow()
 await expect(previewConfiguredAssembly({ ...current, generation: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow()
 await expect(applyConfiguredAssembly({ ...current, generation: undefined } as unknown as ConfiguredAssemblyWorkerContext, 'token')).rejects.toThrow()
 const invalid = structuredClone(current); invalid.document.rootConfiguration = 'missing-state'
 await expect(buildConfiguredAssembly(invalid)).rejects.toThrow()
 expect(current).toEqual(before); expect(ControlledConfiguredWorker.instances).toHaveLength(0)
})

it('forwards only opaque token strings and rejects reports, candidate data and overlong tokens as Apply authority', async () => {
 const current = context(), report = preview(current, 'reported-token')
 for (const token of ['', 'x'.repeat(129), report, report.document, report.verification]) {
  await expect(applyConfiguredAssembly(current, token as string)).rejects.toThrow()
  await expect(discardConfiguredAssembly(token as string)).rejects.toThrow()
 }
 expect(ControlledConfiguredWorker.instances).toHaveLength(0)
 const worker = await initialized(), request = applyConfiguredAssembly(current, 'forged-but-opaque-string')
 await Promise.resolve(); expect(worker.messages[1]).toMatchObject({ action: 'apply-configured-assembly', token: 'forged-but-opaque-string' })
 worker.reject(1, 'Configured preview token is unknown or consumed.')
 await expect(request).rejects.toThrow('unknown or consumed')
})

it.each(['build', 'preview', 'apply', 'discard'] as const)('does not resurrect a disposed worker while %s awaits initialization', async action => {
 const current = context()
 const pending = (action === 'build' ? buildConfiguredAssembly(current) : action === 'preview' ? previewConfiguredAssembly(current) : action === 'apply' ? applyConfiguredAssembly(current, 'old-token') : discardConfiguredAssembly('old-token'))
  .then(() => 'resolved', (error: Error) => error.message)
 const worker = ControlledConfiguredWorker.instances[0]
 disposeKernel(); await Promise.resolve()
 expect(await pending).toContain('cerrado'); expect(worker.terminated).toBe(true); expect(worker.messages).toHaveLength(1); expect(ControlledConfiguredWorker.instances).toHaveLength(1)
})

it('rejects posted requests on worker failure and ignores replies from the obsolete worker after restart', async () => {
 const oldWorker = await initialized(), current = context()
 const stale = previewConfiguredAssembly(current).then(() => 'resolved', (error: Error) => error.message)
 await Promise.resolve(); oldWorker.crash()
 expect(await stale).toContain('controlled worker restart'); expect(oldWorker.terminated).toBe(true)
 const fresh = buildConfiguredAssembly(current); let completed = false
 void fresh.then(() => { completed = true })
 const newWorker = ControlledConfiguredWorker.instances[1]; newWorker.reply(0); await initKernel()
 oldWorker.reply(1, preview(current, 'obsolete-token')); await Promise.resolve()
 expect(completed).toBe(false); expect(newWorker.messages).toHaveLength(2)
 newWorker.reply(1, scene(current, 'new-worker-scene')); expect((await fresh).scene.sceneId).toBe('new-worker-scene')
})

it('targets asynchronous discard by token only while preserving newer request correlation', async () => {
 const worker = await initialized(), current = context(), first = previewConfiguredAssembly(current)
 await Promise.resolve(); worker.reply(1, preview(current, 'older-token')); await first
 const second = previewConfiguredAssembly(current); await Promise.resolve(); worker.reply(2, preview(current, 'newer-token')); await second
 const discarding = discardConfiguredAssembly('older-token'), applying = applyConfiguredAssembly(current, 'newer-token')
 await Promise.resolve()
 expect(worker.messages[3]).toEqual({ id: worker.messages[3].id, action: 'discard-configured-assembly', token: 'older-token' })
 expect(worker.messages[3]).not.toHaveProperty('current'); expect(worker.messages[4]).toMatchObject({ action: 'apply-configured-assembly', token: 'newer-token' })
 worker.reply(4, applied(current)); worker.reply(3)
 expect(await discarding).toBeNull(); expect((await applying).kind).toBe('configured-assembly-applied')
})
