import { createStepSource } from '../model/stepSource'
import { insertAssemblyStep, importAssemblyStep, exportAssemblyStep } from './kernel'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { applyAssemblyPreview, buildAssembly, captureAssemblyComponentLock, captureAssemblyRotationLock, captureAssemblyGear, captureAssemblyScrew, captureAssemblyRackPinion, moveAssemblyComponentMotion,
  discardAssemblyPreview, disposeKernel, initKernel, previewAssembly, reviewAssemblyPartUpdate, inspectAssemblyInterferences, moveAssemblyComponent, moveAssemblyWorldComponent, projectAssemblyDrag, translateAssemblyUntilContact, exportAssemblyCad,
  reviewAssemblyPartReplacement, previewAssemblyPartReplacement, discardAssemblyPartReplacement, measureAssemblyDirectedAngle,
  reviewAssemblyDocumentUpdate, previewAssemblyDocumentUpdate, discardAssemblyDocumentUpdate,
  previewAssemblyPartUpdate, discardAssemblyPartUpdate, previewAssemblyRootRevision } from './kernel'
import type { AssemblyDirectedAngleRequest, AssemblyDirectedAngleReport } from '../model/assemblyDirectedAngle'
import type { KernelRequest, KernelResponse, KernelValue } from './kernel.types'
import type { AssemblyScene } from './kernel.assembly-types'

// Transport-only controlled Worker. These DTOs supply no geometric evidence.
class ControlledWorker {
  static instances: ControlledWorker[] = []
  messages: KernelRequest[] = []
  onmessage: ((event: MessageEvent<KernelResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  constructor() { ControlledWorker.instances.push(this) }
  postMessage(message: KernelRequest) { this.messages.push(structuredClone(message)) }
  terminate() { this.terminated = true }
  reply(index: number, value: KernelValue = null) { this.onmessage?.({ data: { id: this.messages[index].id, ok: true, value } } as MessageEvent<KernelResponse>) }
}
beforeEach(() => { ControlledWorker.instances = []; vi.stubGlobal('Worker', ControlledWorker) })
afterEach(async () => { disposeKernel(); await Promise.resolve(); vi.unstubAllGlobals() })
async function initialized() {
  const promise = initKernel(), worker = ControlledWorker.instances[0]
  expect(worker.messages[0].action).toBe('init'); worker.reply(0); await promise; return worker
}
function scene(id: string): AssemblyScene { return { kind: 'assembly-scene', sceneId: id, bodies: [], volume: 0, area: 0, solidCount: 0,
  prototypeCount: 0, bounds: null, visibleBounds: null, warnings: [] } }

it('captures detached directed-angle input before initialization and correlates its report separately from a scene', async () => {
  const current = createAssemblyExample(), saved = structuredClone(current), request: AssemblyDirectedAngleRequest = { scopePath: [],
    first: { kind: 'principal-plane', component: null, plane: 'YZ' }, second: { kind: 'principal-plane', component: null, plane: 'XZ' },
    guide: { kind: 'principal-plane', component: null, plane: 'XY' } }, original = structuredClone(request)
  const measuring = measureAssemblyDirectedAngle(current, request), worker = ControlledWorker.instances[0]
  current.name = 'Later transport edit'; request.scopePath.push('later')
  if (request.guide.kind === 'principal-plane') request.guide.plane = 'YZ'
  worker.reply(0); await initKernel()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'measure-assembly-directed-angle', current: saved, request: original })
  const building = buildAssembly(saved); await Promise.resolve()
  const report: AssemblyDirectedAngleReport = { coordinate: 'directed-about-axis', angleDegrees: 270, angleToleranceRadians: 1e-8,
    firstKind: 'plane', secondKind: 'plane', guideKind: 'plane', firstDirection: [1, 0, 0], secondDirection: [0, -1, 0], guideDirection: [0, 0, 1],
    projectionLengths: { first: 1, second: 1 }, ...original, supportOnly: true }
  worker.reply(2, scene('measurement-independent-scene')); worker.reply(1, report)
  expect(await measuring).toEqual(report); expect('token' in await measuring).toBe(false)
  expect((await building).sceneId).toBe('measurement-independent-scene')
})

it('rejects unknown or executable directed-angle fields before creating a worker', async () => {
  const current = createEmptyAssembly(), ref = { kind: 'principal-plane' as const, component: null, plane: 'XY' as const }
  const request = { scopePath: [], first: ref, second: ref, guide: ref }, invalid = { ...request, tolerance: 1 }
  await expect(measureAssemblyDirectedAngle(current, invalid)).rejects.toThrow()
  let calls = 0; const executable = { ...request, get guide() { calls++; return ref } }
  await expect(measureAssemblyDirectedAngle(current, executable)).rejects.toThrow()
  expect(calls).toBe(0); expect(ControlledWorker.instances).toHaveLength(0)
})

it('captures a detached committed export before worker initialization resolves', async () => {
  const document = createAssemblyExample(), original = structuredClone(document), pending = exportAssemblyCad(document, 'step')
  const worker = ControlledWorker.instances[0]
  document.name = 'Later edit'; document.occurrences[1].pose.translation[0] = 123
  worker.reply(0); await initKernel()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'export-assembly', document: original, format: 'step' })
  const blob = new Blob(['Original transport-only STEP bytes'])
  worker.reply(1, blob); expect(await pending).toBe(blob)
})

it('correlates two export formats and a display build without sharing their replies', async () => {
  const worker = await initialized(), document = createAssemblyExample()
  const step = exportAssemblyCad(document, 'step'), stl = exportAssemblyCad(document, 'stl'), build = buildAssembly(document)
  await Promise.resolve()
  expect(worker.messages.slice(1).map(value => value.action)).toEqual(['export-assembly', 'export-assembly', 'build-assembly'])
  const stepBlob = new Blob(['transport STEP']), stlBlob = new Blob(['transport STL'])
  worker.reply(3, scene('export-independent-scene')); worker.reply(2, stlBlob); worker.reply(1, stepBlob)
  expect(await step).toBe(stepBlob); expect(await stl).toBe(stlBlob); expect((await build).sceneId).toBe('export-independent-scene')
})

it('rejects invalid export formats and document graphs before initializing a worker', async () => {
  await expect(exportAssemblyCad(createEmptyAssembly(), 'csv' as 'step')).rejects.toThrow('Formato')
  const invalid = createAssemblyExample(); invalid.occurrences[1].definition.revision = 'missing'
  await expect(exportAssemblyCad(invalid, 'step')).rejects.toThrow()
  expect(ControlledWorker.instances).toHaveLength(0)
})

it('does not resurrect a worker disposed while a committed export awaits readiness', async () => {
  await initialized()
  const result = exportAssemblyCad(createAssemblyExample(), 'stl').then(() => 'resolved', (error: Error) => error.message)
  disposeKernel(); await Promise.resolve()
  expect(await result).toContain('cerrado'); expect(ControlledWorker.instances).toHaveLength(1)
  expect(ControlledWorker.instances[0].messages).toHaveLength(1)
})

it('routes assembly documents independently of part Feature arrays and correlates rapid scene replies', async () => {
  const worker = await initialized(), document = createEmptyAssembly(), first = buildAssembly(document), second = buildAssembly(document)
  await Promise.resolve(); expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'build-assembly', document })
  worker.reply(2, scene('second')); worker.reply(1, scene('first'))
  expect((await first).sceneId).toBe('first'); expect((await second).sceneId).toBe('second')
})

it('forwards committed base and proposal separately and returns a rejected solve as data', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), proposed = structuredClone(current); proposed.name = 'Original proposed edit'
  const pending = previewAssembly(current, proposed, { lengthTolerance: 1e-5 }); await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'preview-assembly', current, proposed, options: { lengthTolerance: 1e-5 } })
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'numeric', message: 'Original tested rejection', scopes: [] })
  expect((await pending).status).toBe('rejected')
})

it('preserves the worker token and complete current document for Apply', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), applying = applyAssemblyPreview(current, 'worker-token')
  await Promise.resolve(); expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'apply-assembly', current, token: 'worker-token' })
  worker.reply(1, { kind: 'assembly-applied', document: current, scene: scene('applied') })
  expect((await applying).kind).toBe('assembly-applied')
})

it('correlates a local movement target and rejected native reply independently of a concurrent scene', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), move = {
    component: { occurrencePath: ['sub', 'leaf'], definition: { id: 'original-transport-part', revision: 'r1' } },
    pose: { translation: [3, 4, 5] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] } }
  const moving = moveAssemblyComponent(current, move, { lengthTolerance: 1e-6 }), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'move-assembly-component', current, move, options: { lengthTolerance: 1e-6 } })
  worker.reply(2, scene('concurrent-movement-scene'))
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'numeric', message: 'Original transport-only rejected drive', scopes: [] })
  expect((await moving).status).toBe('rejected'); expect((await building).sceneId).toBe('concurrent-movement-scene')
})

it('transports the complete signed angular increment separately from a legacy absolute pose and correlates both replies', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), component = {
    occurrencePath: ['shared', 'shaft'], definition: { id: 'original-motion-shaft', revision: 'r2' } }
  const motion = { component, translation: [3, 4, 5] as [number, number, number], rotation: { axis: 2 as const, angle: 4 * Math.PI } }
  const moving = moveAssemblyComponentMotion(current, motion, { angleTolerance: 1e-8 })
  const absolute = moveAssemblyComponent(current, { component, pose: { translation: [3, 4, 5], rotation: [0, 0, 0, 1] } })
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'move-assembly-component-motion', current, motion, options: { angleTolerance: 1e-8 } })
  expect(worker.messages[2].action).toBe('move-assembly-component')
  worker.reply(2, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original legacy rejection', scopes: [] })
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'verification', message: 'Original station rejection', scopes: [] })
  const replies = await Promise.all([moving, absolute])
  expect(replies[0].status === 'rejected' && replies[0].message).toBe('Original station rejection')
  expect(replies[1].status === 'rejected' && replies[1].message).toBe('Original legacy rejection')
})

it('requests a private root revision using only the exact base and new label, with no renderer proposal',async()=>{
  const worker=await initialized(),current=createEmptyAssembly(),revision='original-authored-r2'
  const pending=previewAssemblyRootRevision(current,revision)
  await Promise.resolve();expect(worker.messages[1]).toEqual({id:worker.messages[1].id,action:'preview-assembly-root-revision',current,revision})
  worker.reply(1,{kind:'assembly-preview',status:'rejected',reason:'reference',message:'Original transport rejection',scopes:[]})
  expect((await pending).status).toBe('rejected');expect(worker.messages[1]).not.toHaveProperty('proposed')
})

it('correlates a source review with a concurrent scene request without manufacturing an Apply token', async () => {
  const worker = await initialized(), current = createAssemblyExample(), definition = current.definitions.find(value => value.id === 'example-pin')!
  if (definition.kind !== 'part') throw new Error('Expected the original pin source')
  const source = { id: definition.id, revision: definition.revision }, part = structuredClone(definition.document)
  part.name = 'Original transport-only changed source'
  const reviewing = reviewAssemblyPartUpdate(current, source, part, 'transport-r2'), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'review-assembly-part-update', current, source, part, revision: 'transport-r2' })
  worker.reply(2, scene('independent-build'))
  worker.reply(1, { kind: 'assembly-source-review', document: current, source, replacement: { id: source.id, revision: 'transport-r2' },
    scene: scene('review-only'), occurrences: [], endpoints: [] })
  const result = await reviewing
  expect(result.kind).toBe('assembly-source-review'); expect(result.scene.sceneId).toBe('review-only')
  expect('token' in result).toBe(false); expect((await building).sceneId).toBe('independent-build')
})

it('transports link metadata only with source review and targets the private part preview and cancellation',async()=>{
  const worker=await initialized(),current=createAssemblyExample(),definition=current.definitions.find(v=>v.kind==='part')!
  if(definition.kind!=='part')throw Error('Expected part')
  const source={id:definition.id,revision:definition.revision},sourceLink={kind:'local-file' as const,displayName:'original-transport.solidflow',contentSha256:'a'.repeat(64)}
  const reviewing=reviewAssemblyPartUpdate(current,source,definition.document,'r2',sourceLink)
  await Promise.resolve();expect(worker.messages[1]).toMatchObject({action:'review-assembly-part-update',sourceLink})
  worker.reply(1,{kind:'assembly-source-review',reviewId:'retained-part-review',document:current,source,replacement:{...source,revision:'r2'},scene:scene('source'),occurrences:[],endpoints:[]});await reviewing
  const previewing=previewAssemblyPartUpdate(current,'retained-part-review',current)
  await Promise.resolve();expect(worker.messages[2]).toEqual({id:worker.messages[2].id,action:'preview-assembly-part-update',current,reviewId:'retained-part-review',proposed:current})
  worker.reply(2,{kind:'assembly-preview',status:'rejected',reason:'reference',message:'Transport-only rejection',scopes:[]});expect((await previewing).status).toBe('rejected')
  const discarding=discardAssemblyPartUpdate('retained-part-review');await Promise.resolve()
  expect(worker.messages[3]).toEqual({id:worker.messages[3].id,action:'discard-assembly-part-update',reviewId:'retained-part-review'});worker.reply(3);await discarding
})

it('routes replacement review, decisions and targeted cancellation without transporting an arbitrary candidate', async () => {
  const worker = await initialized(), current = createAssemblyExample(), definition = current.definitions.find(value => value.kind === 'part')!
  if (definition.kind !== 'part') throw new Error('Expected original transport-only part')
  const part = structuredClone(definition.document); part.id = 'transport-replacement'
  const request = { component: { occurrencePath: ['left'], definition: current.occurrences[1].definition }, mode: 'selected' as const,
    part, revision: 'new-r1', ancestorRevisions: [] }
  const reviewing = reviewAssemblyPartReplacement(current, request), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'review-assembly-part-replacement', current, request })
  worker.reply(2, scene('replacement-independent-scene'))
  worker.reply(1, { kind: 'assembly-replacement-review', reviewId: 'transport-review', document: current, scene: scene('staged-replacement'),
    source: request.component.definition, replacement: { id: part.id, revision: request.revision }, occurrences: [], expandedPaths: [], scopeMap: [],
    endpoints: [], replacementCatalog: scene('source-local-catalog'), mechanicalMates: [] })
  expect((await reviewing).reviewId).toBe('transport-review'); expect('token' in await reviewing).toBe(false)
  expect((await building).sceneId).toBe('replacement-independent-scene')
  const decisions = { repairs: [], removed: [], recapture: [] }, preview = previewAssemblyPartReplacement(current, 'transport-review', decisions)
  await Promise.resolve()
  expect(worker.messages[3]).toEqual({ id: worker.messages[3].id, action: 'preview-assembly-part-replacement', current, reviewId: 'transport-review', decisions })
  expect('proposed' in worker.messages[3]).toBe(false)
  worker.reply(3, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original transport-only pending repair', scopes: [] })
  expect((await preview).status).toBe('rejected')
  const discarded = discardAssemblyPartReplacement('transport-review')
  expect(worker.messages[4]).toEqual({ id: worker.messages[4].id, action: 'discard-assembly-part-replacement', reviewId: 'transport-review' })
  worker.reply(4); await discarded
})

it('does not create a worker to discard a missing replacement review', async () => {
  await discardAssemblyPartReplacement('expired-review'); expect(ControlledWorker.instances).toHaveLength(0)
})

it('keeps a complete v2 source review separate from build replies and transports only explicit decisions to its preview', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), incoming = createEmptyAssembly('Original incoming source')
  incoming.revision = 'transport-r2'
  const source = { id: incoming.id, revision: 'transport-r1' }
  const reviewing = reviewAssemblyDocumentUpdate(current, source, incoming), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'review-assembly-document-update', current, source, incoming })
  worker.reply(2, scene('v2-independent-build'))
  worker.reply(1, { kind: 'assembly-document-source-review', reviewId: 'v2-review', document: current, scene: scene('v2-staged'), source,
    replacement: { id: incoming.id, revision: incoming.revision }, occurrences: [], endpoints: [], unresolvedEndpoints: [], capturedMates: [],
    replacementCatalog: scene('v2-source-local'), components: [] })
  expect((await reviewing).reviewId).toBe('v2-review'); expect('token' in await reviewing).toBe(false)
  expect((await building).sceneId).toBe('v2-independent-build')
  const decisions = { repairs: [], removed: [], recapture: [], unlocked: [] }, preview = previewAssemblyDocumentUpdate(current, 'v2-review', decisions)
  await Promise.resolve()
  expect(worker.messages[3]).toEqual({ id: worker.messages[3].id, action: 'preview-assembly-document-update', current, reviewId: 'v2-review', decisions })
  expect('proposed' in worker.messages[3]).toBe(false)
  worker.reply(3, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original v2 transport-only rejection', scopes: [] })
  expect((await preview).status).toBe('rejected')
  const discarded = discardAssemblyDocumentUpdate('v2-review')
  expect(worker.messages[4]).toEqual({ id: worker.messages[4].id, action: 'discard-assembly-document-update', reviewId: 'v2-review' })
  worker.reply(4); await discarded
})

it('does not resurrect a worker for an expired v2 review cancellation or a review awaiting readiness', async () => {
  await discardAssemblyDocumentUpdate('expired-v2-review'); expect(ControlledWorker.instances).toHaveLength(0)
  await initialized()
  const incoming = createEmptyAssembly(), pending = reviewAssemblyDocumentUpdate(createEmptyAssembly(), { id: incoming.id, revision: 'r0' }, incoming)
    .then(() => 'resolved', (error: Error) => error.message)
  disposeKernel(); await Promise.resolve()
  expect(await pending).toContain('cerrado'); expect(ControlledWorker.instances).toHaveLength(1)
  expect(ControlledWorker.instances[0].messages).toHaveLength(1)
})

it('preserves a nested world target and solver options through the worker boundary', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), move = {
    component: { occurrencePath: ['rigid-owner', 'fixed-child'], definition: { id: 'original-world-part', revision: 'r2' } },
    pose: { translation: [10, 20, 30] as [number, number, number], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number] } }
  const moving = moveAssemblyWorldComponent(current, move, { angleTolerance: 1e-8 }); await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'move-assembly-world-component', current, move, options: { angleTolerance: 1e-8 } })
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original transport-only missing identity', scopes: [] })
  expect((await moving).status).toBe('rejected')
})

it('keeps the projection mode, original base and policy distinct from a strict world movement', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), drag = {
    component: { occurrencePath: ['owner', 'child'], definition: { id: 'original-projection-part', revision: 'r1' } },
    pose: { translation: [13, 4, 5] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number] }, mode: 'translate' as const }
  const pending = projectAssemblyDrag(current, drag, { projection: { maxIterations: 40 } }); await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'project-assembly-component', current, drag, options: { projection: { maxIterations: 40 } } })
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original transport-only unresolved path', scopes: [] })
  expect((await pending).status).toBe('rejected')
})

it('correlates a rectilinear target and native stopping policy separately from a simultaneous scene', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), translation = {
    component: { occurrencePath: ['owner', 'leaf'], definition: { id: 'original-translation-source', revision: 'r1' } },
    translation: [20, 0, 0] as [number, number, number] }
  const stopping = translateAssemblyUntilContact(current, translation, { clearance: .25, maxQueries: 128 }, { angleTolerance: 1e-8 }), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'translate-assembly-until-contact', current, translation,
    stopOptions: { clearance: .25, maxQueries: 128 }, options: { angleTolerance: 1e-8 } })
  worker.reply(2, scene('independent-translation-scene'))
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'verification', message: 'Original transport-only initial contact', scopes: [] })
  expect((await stopping).status).toBe('rejected'); expect((await building).sceneId).toBe('independent-translation-scene')
})

it('forwards exact nested scope and component identities for both capture families', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), scope = { id: 'sub', revision: 'r1' },
    first = { occurrencePath: ['left', 'child'], definition: { id: 'pin', revision: 'r2' } }, second = { occurrencePath: ['right'], definition: { id: 'pin', revision: 'r2' } }
  const rotation = captureAssemblyRotationLock(current, 'rotation-token', 'mate', scope), components = captureAssemblyComponentLock(current, 'component-token', first, second, scope)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'lock-assembly-rotation', current, token: 'rotation-token', mateId: 'mate', scope })
  expect(worker.messages[2]).toEqual({ id: worker.messages[2].id, action: 'lock-assembly-components', current, token: 'component-token', first, second, scope })
  const rejected = { kind: 'assembly-preview' as const, status: 'rejected' as const, reason: 'reference' as const, message: 'Original missing test reference', scopes: [] }
  worker.reply(2, rejected); worker.reply(1, rejected); await Promise.all([rotation, components])
})

it('routes gear capture intent and its prior token without accepting renderer zero frames or lifted angles', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), scope = { id: 'nested-carrier', revision: 'r2' }
  const first = { kind: 'face' as const, support: 'axis' as const, component: { occurrencePath: ['left'], definition: { id: 'shaft', revision: 'r1' } },
    body: { bodyId: 'shaft-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'original-transport-axis' } }
  const intent = { first, second: { ...structuredClone(first), component: { ...first.component, occurrencePath: ['right'] } },
    carrier: null, ratio: { numerator: 2, denominator: 1 }, direction: 'opposed' as const, name: 'Original transport gear', phase: .25 }
  const pending = captureAssemblyGear(current, 'native-token', intent, scope); await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'capture-assembly-gear', current, token: 'native-token', request: intent, scope })
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original transport-only unknown scope', scopes: [] })
  expect((await pending).status).toBe('rejected')
})

it('correlates native screw capture with an independent scene and forwards only declared intent', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), scope = { id: 'screw-scope', revision: 'r2' }
  const first = { kind: 'face' as const, support: 'axis' as const, component: { occurrencePath: ['shaft'], definition: { id: 'shaft', revision: 'r1' } },
    body: { bodyId: 'shaft-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'original-screw-axis' } }
  const request = { first, second: { ...structuredClone(first), component: { occurrencePath: ['nut'], definition: { id: 'nut', revision: 'r1' } } },
    lead: 2, reverse: false, alignment: 'aligned' as const, name: 'Original transport screw' }
  const capturing = captureAssemblyScrew(current, 'original-screw-token', request, scope), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'capture-assembly-screw', current, token: 'original-screw-token', request, scope })
  worker.reply(2, scene('independent-screw-scene'))
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original missing screw scope', scopes: [] })
  expect((await capturing).status).toBe('rejected'); expect((await building).sceneId).toBe('independent-screw-scene')
})

it('correlates native rack LINE capture with a scene and preserves exact body, scope and prior capability', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), scope = { id: 'rack-scope', revision: 'r2' }
  const request = {
    first: { kind: 'face' as const, support: 'axis' as const, component: { occurrencePath: ['motor', 'pinion'], definition: { id: 'pinion', revision: 'r1' } },
      body: { bodyId: 'pinion-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'original-pinion-axis' } },
    second: { kind: 'edge' as const, support: 'line' as const, component: { occurrencePath: ['slider'], definition: { id: 'rack', revision: 'r3' } },
      body: { bodyId: 'rack-body', sourceFeatureId: 'cut' }, edge: { sourceFeatureId: 'cut', key: 'original-rack-LINE' } },
    conversion: { mode: 'travel' as const, override: 12 }, reverse: true, name: 'Original transport rack',
  }
  const capturing = captureAssemblyRackPinion(current, 'original-rack-token', request, scope), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'capture-assembly-rack-pinion', current, token: 'original-rack-token', request, scope })
  worker.reply(2, scene('independent-rack-scene'))
  worker.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'reference', message: 'Original missing native LINE', scopes: [] })
  expect((await capturing).status).toBe('rejected'); expect((await building).sceneId).toBe('independent-rack-scene')
})

it('does not create a replacement worker just to discard a missing preview', async () => {
  await discardAssemblyPreview('old-token'); expect(ControlledWorker.instances).toHaveLength(0)
})

it('correlates read-only interference options and replies without conflating them with a scene or Apply capability', async () => {
  const worker = await initialized(), current = createEmptyAssembly(), options = { clearance: .5, includeHidden: false }
  const analyzing = inspectAssemblyInterferences(current, options), building = buildAssembly(current)
  await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'inspect-assembly-interferences', current, options })
  worker.reply(2, scene('independent-analysis-scene'))
  worker.reply(1, { kind: 'assembly-interference-report', analysisId: 'transport-only', options: { ...options, lengthTolerance: 1e-6, volumeTolerance: 1e-6 },
    scopeSummary: { mode: 'all', selectedLeafCount: 0, excludedLeafCount: 0, eligibleLeafCount: 0, eligiblePairCount: 0 },
    bodyCount: 0, componentCount: 0, potentialPairCount: 0, testedPairCount: 0, broadPhaseExcludedCount: 0, pairs: [], warnings: [] })
  const report = await analyzing
  expect(report.kind).toBe('assembly-interference-report'); expect(report.options.includeHidden).toBe(false)
  expect('token' in report).toBe(false); expect((await building).sceneId).toBe('independent-analysis-scene')
})

it('keeps exact nested interference selections and exclusions distinct across concurrent scope modes', async () => {
  const worker = await initialized(), current = createEmptyAssembly()
  const selected = [{ occurrencePath: ['left', 'child'], definition: { id: 'reused-original-part', revision: 'r2' } }]
  const excluded = [{ occurrencePath: ['right', 'child'], definition: { id: 'reused-original-part', revision: 'r2' } }]
  const amongOptions = { clearance: .25, scope: { mode: 'among-selected' as const, selected, excluded } }
  const crossOptions = { clearance: .25, scope: { mode: 'selected-against-rest' as const,
    selected: structuredClone(selected), excluded: structuredClone(excluded) } }
  const expectedAmong = structuredClone(amongOptions), expectedCross = structuredClone(crossOptions)
  const among = inspectAssemblyInterferences(current, amongOptions), cross = inspectAssemblyInterferences(current, crossOptions)
  const building = buildAssembly(current); await Promise.resolve()
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'inspect-assembly-interferences', current, options: expectedAmong })
  expect(worker.messages[2]).toEqual({ id: worker.messages[2].id, action: 'inspect-assembly-interferences', current, options: expectedCross })
  // postMessage has already copied the DTO; later caller edits cannot retarget it.
  selected[0].occurrencePath[0] = 'later-selection'; excluded[0].definition.revision = 'later-revision'
  expect(worker.messages[1]).toMatchObject({ options: expectedAmong })
  const report = (mode: 'among-selected' | 'selected-against-rest', options: typeof expectedAmong | typeof expectedCross) => ({
    kind: 'assembly-interference-report' as const, analysisId: mode,
    options: { ...options, includeHidden: true, lengthTolerance: 1e-6, volumeTolerance: 1e-6 },
    scopeSummary: { mode, selectedLeafCount: 0, excludedLeafCount: 0, eligibleLeafCount: 0, eligiblePairCount: 0 },
    bodyCount: 0, componentCount: 0, potentialPairCount: 0, testedPairCount: 0, broadPhaseExcludedCount: 0, pairs: [], warnings: [],
  })
  worker.reply(3, scene('scope-independent-scene')); worker.reply(2, report('selected-against-rest', expectedCross))
  worker.reply(1, report('among-selected', expectedAmong))
  expect((await among).analysisId).toBe('among-selected'); expect((await cross).scopeSummary.mode).toBe('selected-against-rest')
  expect((await building).sceneId).toBe('scope-independent-scene')
  expect('token' in await among).toBe(false); expect('token' in await cross).toBe(false)
})

it('discards the supplied capability through the existing worker without reopening initialization', async () => {
  const worker = await initialized(), pending = discardAssemblyPreview('current-token')
  expect(worker.messages[1]).toEqual({ id: worker.messages[1].id, action: 'discard-assembly', token: 'current-token' }); worker.reply(1)
  await pending; expect(ControlledWorker.instances).toHaveLength(1)
})

it('cancels an assembly request awaiting resolved initialization instead of resurrecting a disposed worker', async () => {
  await initialized(); const pending = buildAssembly(createEmptyAssembly()).then(() => 'resolved', (error: Error) => error.message)
  disposeKernel(); await Promise.resolve(); expect(await pending).toContain('cerrado'); expect(ControlledWorker.instances).toHaveLength(1)
})

it('rejects pending assembly work on worker failure and ignores a late response after replacement', async () => {
  const old = await initialized(), pending = previewAssembly(createEmptyAssembly()).catch((error: Error) => error.message)
  await Promise.resolve(); old.onerror?.({ message: 'Original worker failure' } as ErrorEvent)
  expect(await pending).toBe('Original worker failure'); expect(old.terminated).toBe(true)
  const initialization = initKernel(), replacement = ControlledWorker.instances[1]; replacement.reply(0); await initialization
  const building = buildAssembly(createEmptyAssembly()); await Promise.resolve(); old.reply(1, { kind: 'assembly-preview', status: 'rejected', reason: 'numeric', message: 'Stale response', scopes: [] })
  replacement.reply(1, scene('replacement')); expect((await building).sceneId).toBe('replacement')
})


it('captures structural STEP bytes and export graph before initialization, then validates the imported document', async () => {
  const source = createStepSource(new TextEncoder().encode('original STEP bytes')), saved = structuredClone(source)
  const importing = importAssemblyStep(source), worker = ControlledWorker.instances[0]
  source.data = 'changed'; source.sha256 = 'changed'
  const document = createAssemblyExample(), original = structuredClone(document)
  const exporting = exportAssemblyStep(document); document.name = 'Changed after request'
  worker.reply(0); await initKernel(); await Promise.resolve()
  expect(worker.messages[1]).toMatchObject({ action: 'import-assembly-step', source: saved })
  expect(worker.messages[2]).toMatchObject({ action: 'export-assembly-step', document: original })
  worker.reply(1, original); worker.reply(2, new Blob(['STEP']))
  expect(await importing).toEqual(original); expect((await exporting).size).toBe(4)
})

it('rejects source accessors without executing them or creating a worker', async () => {
  let reads = 0
  const source = { format: 'step', encoding: 'base64', sha256: '0'.repeat(64), get data() { reads++; return 'YQ==' } }
  await expect(importAssemblyStep(source as import('../model/stepSource').StepSource)).rejects.toThrow()
  expect(reads).toBe(0); expect(ControlledWorker.instances).toHaveLength(0)
})

it.each(['import', 'export'])('does not revive a disposed structural %s request waiting for initialization', async action => {
  const pending = action === 'import' ? importAssemblyStep(createStepSource(new Uint8Array([1]))) : exportAssemblyStep(createAssemblyExample())
  const outcome = pending.catch(error => error.message)
  disposeKernel()
  expect(await outcome).toContain('cerrado'); expect(ControlledWorker.instances).toHaveLength(1)
})

it('rejects malformed structural replies rather than publishing a document or Blob', async () => {
  const worker = await initialized()
  const importing = importAssemblyStep(createStepSource(new Uint8Array([1]))); await Promise.resolve()
  worker.reply(1, null); await expect(importing).rejects.toThrow()
  const exporting = exportAssemblyStep(createAssemblyExample()); await Promise.resolve()
  worker.reply(2, new Blob([])); await expect(exporting).rejects.toThrow('Respuesta STEP')
})


it('captures all insertion inputs before initialization, including the exact shared scope tuple', async () => {
  const current = createAssemblyExample(), original = structuredClone(current), source = createStepSource(new Uint8Array([1, 2, 3])), bytes = structuredClone(source)
  const scope = {id:current.id,revision:current.revision}, target = {...scope}
  const inserting = insertAssemblyStep(current, source, scope), worker = ControlledWorker.instances[0]
  current.name = 'Later parent'; source.data = 'changed'; scope.id = 'later scope'
  worker.reply(0); await initKernel(); await Promise.resolve()
  expect(worker.messages[1]).toMatchObject({action:'insert-assembly-step',current:original,source:bytes,scope:target})
  worker.reply(1, original); expect(await inserting).toEqual(original)
})

it('rejects insertion scope getters and foreign tuples before worker creation', async () => {
  let reads=0;const current=createAssemblyExample(),source=createStepSource(new Uint8Array([1]))
  const scope={get id(){reads++;return current.id},revision:current.revision}
  await expect(insertAssemblyStep(current,source,scope)).rejects.toThrow('Ámbito')
  await expect(insertAssemblyStep(current,source,{id:'foreign',revision:'r1'})).rejects.toThrow('ámbito')
  expect(reads).toBe(0);expect(ControlledWorker.instances).toHaveLength(0)
})

it('does not revive an insertion after disposal and refuses a malformed candidate', async () => {
  const current=createAssemblyExample(),source=createStepSource(new Uint8Array([1]))
  const pending=insertAssemblyStep(current,source),outcome=pending.catch(error=>error.message)
  disposeKernel();expect(await outcome).toContain('cerrado');expect(ControlledWorker.instances).toHaveLength(1)
  ControlledWorker.instances=[]
  const worker=await initialized();const retry=insertAssemblyStep(current,source);await Promise.resolve()
  worker.reply(1,null);await expect(retry).rejects.toThrow()
})
