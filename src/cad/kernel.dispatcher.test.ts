import * as assemblyScenes from './kernel.assembly-scene'
import { createStepSource } from '../model/stepSource'
import { assemblyStepStructureFixture } from './kernel.assembly-step-structure-fixture.test-utils'
import type { AssemblyDocument } from '../model/assemblyDocument'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { importSTEP, measureShapeVolumeProperties, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { serializeAssemblyDocument } from '../model/assemblyDocument'
import { withNativeOwners } from './kernel.native-ownership'
import { KernelDispatcher } from './kernel.dispatcher'
import type { CadResult, Feature, KernelRequest } from './kernel.types'
import type { AssemblyPreviewReply } from './kernel.assembly-types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const features: Feature[] = [
  { id: 'profile', name: 'Original 2x3 box profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
  { id: 'solid', name: 'Original depth4 box', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false },
]

it('keeps the exact pending assembly capability through successful and rejected flat exports', async () => {
  const dispatcher = new KernelDispatcher(), current = createAssemblyExample(), original = serializeAssemblyDocument(current)
  try {
    const preview = dispatcher.handle({ id: 1, action: 'preview-assembly', current, proposed: current }) as AssemblyPreviewReply
    expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw new Error(preview.message)
    expect(() => dispatcher.handle({ id: 2, action: 'export-assembly', document: createEmptyAssembly(), format: 'step' })).toThrow()
    const blob = dispatcher.handle({ id: 3, action: 'export-assembly', document: current, format: 'step' })
    expect(blob).toBeInstanceOf(Blob); expect((blob as Blob).size).toBeGreaterThan(0)
    const applied = dispatcher.handle({ id: 4, action: 'apply-assembly', current, token: preview.token })
    expect(applied && !(applied instanceof Blob) && 'kind' in applied && applied.kind).toBe('assembly-applied')
    expect(serializeAssemblyDocument(current)).toBe(original)
    expect(() => dispatcher.handle({ id: 5, action: 'apply-assembly', current, token: preview.token })).toThrow('ya no está disponible')
  } finally { dispatcher.dispose() }
}, 60_000)

it('exports an independent assembly without replacing the cached native part', async () => {
  const dispatcher = new KernelDispatcher()
  try {
    dispatcher.handle({ id: 1, action: 'build', features })
    dispatcher.handle({ id: 2, action: 'export-assembly', document: createAssemblyExample(), format: 'stl' })
    const blob = dispatcher.handle({ id: 3, action: 'export', format: 'step' }) as Blob
    const shape = await importSTEP(blob)
    withNativeOwners(owners => {
      owners.own(shape)
      expect(Math.abs(owners.own(measureShapeVolumeProperties(shape.asShape3D())).volume - 24)).toBeLessThan(1e-5)
    })
  } finally { dispatcher.dispose() }
}, 60_000)

it('preserves the new native part after a late canceled assembly capability discard', async () => {
  const dispatcher = new KernelDispatcher(), current = createAssemblyExample()
  try {
    const preview = dispatcher.handle({ id: 1, action: 'preview-assembly', current, proposed: current }) as AssemblyPreviewReply
    expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw new Error(preview.message)
    const part = dispatcher.handle({ id: 2, action: 'build', features }) as CadResult
    expect(Math.abs(part.volume - 24)).toBeLessThan(1e-5)
    expect(dispatcher.handle({ id: 3, action: 'discard-assembly', token: preview.token })).toBeNull()
    const exported = dispatcher.handle({ id: 4, action: 'export', format: 'stl' })
    expect(exported).toBeInstanceOf(Blob); expect((exported as Blob).size).toBeGreaterThan(84)
    expect(() => dispatcher.handle({ id: 5, action: 'apply-assembly', current, token: preview.token })).toThrow('ya no está disponible')
  } finally { dispatcher.dispose() }
}, 60_000)

it('rejects unknown transport actions before changing the cached native part', () => {
  const dispatcher = new KernelDispatcher()
  try {
    dispatcher.handle({ id: 1, action: 'build', features })
    expect(() => dispatcher.handle({ id: 2, action: 'unknown' } as unknown as KernelRequest)).toThrow('no admitida')
    const exported = dispatcher.handle({ id: 3, action: 'export', format: 'stl' })
    expect(exported).toBeInstanceOf(Blob); expect((exported as Blob).size).toBeGreaterThan(84)
  } finally { dispatcher.dispose() }
}, 60_000)


it('prepares structural imports independently and preserves an existing part and pending preview across success and scene failure', async () => {
  const exporter = new KernelDispatcher(), sourceDocument = assemblyStepStructureFixture()
  let source: ReturnType<typeof createStepSource>
  try {
    const blob = exporter.handle({id:1,action:'export-assembly-step',document:sourceDocument}) as Blob
    source = createStepSource(new Uint8Array(await blob.arrayBuffer()))
  } finally { exporter.dispose() }
  const part = new KernelDispatcher(), assembly = new KernelDispatcher(), current = createAssemblyExample()
  try {
    part.handle({id:1,action:'build',features})
    const preview = assembly.handle({id:1,action:'preview-assembly',current,proposed:current}) as AssemblyPreviewReply
    expect(preview.status).toBe('ready'); if(preview.status !== 'ready') throw Error(preview.message)
    const candidate = part.handle({id:2,action:'import-assembly-step',source}) as AssemblyDocument
    expect(candidate.kind).toBe('assembly'); expect(candidate.occurrences).toHaveLength(2)
    assembly.handle({id:2,action:'export-assembly-step',document:sourceDocument})
    const failure = vi.spyOn(assemblyScenes,'buildAssemblyScene').mockImplementationOnce(()=>{throw Error('Independent scene preparation rejected')}).mockImplementationOnce(()=>{throw Error('Independent scene preparation rejected')})
    try {
      expect(()=>part.handle({id:3,action:'import-assembly-step',source})).toThrow('Independent scene preparation rejected')
      expect(()=>assembly.handle({id:3,action:'import-assembly-step',source})).toThrow('Independent scene preparation rejected')
    } finally { failure.mockRestore() }
    const blob = part.handle({id:4,action:'export',format:'step'}) as Blob
    const shape = await importSTEP(blob)
    withNativeOwners(owners=>{owners.own(shape);expect(Math.abs(owners.own(measureShapeVolumeProperties(shape.asShape3D())).volume-24)).toBeLessThan(1e-5)})
    const applied = assembly.handle({id:4,action:'apply-assembly',current,token:preview.token})
    expect(applied && 'kind' in applied && applied.kind).toBe('assembly-applied')
    expect(()=>assembly.handle({id:5,action:'apply-assembly',current,token:preview.token})).toThrow('ya no está disponible')
  } finally { part.dispose();assembly.dispose() }
},60_000)
