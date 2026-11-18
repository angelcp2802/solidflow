import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { embeddedPartInputsReady, PartWorkspace } from '../App'
import { createDocument } from '../model/document'
import { serializeCadDocument } from '../model/cadDocument'
import type { CadResult } from '../cad/kernel.types'
import type { EmbeddedPartBuildSnapshot, EmbeddedPartEditorProps } from './embeddedPartEditor'
import { createEmbeddedPartWork } from './embeddedPartWork'
import { buildModel, exportCad, initKernel } from '../cad/kernel'

vi.mock('../cad/kernel', () => ({ buildModel: vi.fn(), exportCad: vi.fn(), initKernel: vi.fn(), importAssemblyStep: vi.fn() }))

// Original synthetic document and display-only DTOs authored for these input
// and SSR cases. No worker, native geometry, DOM interaction or file write runs.
function fixture() {
  const document = createDocument('Original embedded input fixture')
  const work = createEmbeddedPartWork<EmbeddedPartBuildSnapshot>(), activation = work.activate()
  const snapshot: EmbeddedPartBuildSnapshot = { document, features: document.features, sourceFeatures: null }
  const model: CadResult = { vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], volume: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] }, warnings: [], featureErrors: [] }
  const editor: EmbeddedPartEditorProps = { sessionId: 'original-session', assemblyName: 'Original parent',
    componentName: 'Original component', initialDocument: document, baselineSerialized: serializeCadDocument(document),
    work, activation, active: true, onReturn: vi.fn(() => true), onDiscard: vi.fn(), onDirtyChange: vi.fn() }
  const inputs = { buildSnapshot: snapshot, builtFeatures: document.features, sourceBuiltFeatures: null,
    sourceLoading: false, model, ready: true, busy: false, error: '', unfinished: false, filePending: false,
    dialogOpen: false, builtActivation: activation }
  return { document, work, activation, snapshot, model, editor, inputs }
}

describe('temporary embedded part editor inputs', () => {
  it('keeps Return disabled on the first rendered editor and labels Save as an independent copy', () => {
    const { document, editor, work } = fixture(), before = serializeCadDocument(document), state = work.getState()
    const html = renderToStaticMarkup(<PartWorkspace initialDocument={document} embeddedEdit={editor} onOpenAssembly={vi.fn()} />)
    expect(html).toContain('aria-label="Edición de pieza en el ensamblaje"')
    expect(html).toContain('Original parent')
    expect(html).toContain('Guardar copia… (Ctrl+S)')
    expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>Volver al ensamblaje<\/button>/)
    expect(html).toMatch(/<button(?=[^>]*aria-label="Abrir \(Ctrl\+O\)")(?=[^>]*disabled="")[^>]*>/)
    expect(serializeCadDocument(document)).toBe(before)
    expect(work.getState()).toEqual(state)
    expect(editor.onReturn).not.toHaveBeenCalled()
    expect(editor.onDirtyChange).not.toHaveBeenCalled()
    expect(buildModel).not.toHaveBeenCalled(); expect(initKernel).not.toHaveBeenCalled(); expect(exportCad).not.toHaveBeenCalled()
  })

  it('retains standalone commands without exposing embedded handoff controls', () => {
    const { document } = fixture()
    const html = renderToStaticMarkup(<PartWorkspace initialDocument={document} onOpenAssembly={vi.fn()} />)
    expect(html).toContain('aria-label="Guardar (Ctrl+S)"')
    expect(html).not.toContain('Volver al ensamblaje')
    expect(html).not.toContain('Descartar edición')
    expect(html).not.toContain('Guardar copia…')
  })

  it('requires the exact completed feature and source arrays', () => {
    const { activation, inputs, document } = fixture()
    expect(embeddedPartInputsReady(activation, inputs)).toBe(true)
    expect(embeddedPartInputsReady(activation, { ...inputs, builtFeatures: [...document.features] })).toBe(false)
    expect(embeddedPartInputsReady(activation, { ...inputs, buildSnapshot: { ...inputs.buildSnapshot, features: [...document.features] } })).toBe(false)
    const sourceFeatures = [...document.features]
    const source = { ...inputs, buildSnapshot: { ...inputs.buildSnapshot, sourceFeatures } }
    expect(embeddedPartInputsReady(activation, source)).toBe(false)
    expect(embeddedPartInputsReady(activation, { ...source, sourceBuiltFeatures: sourceFeatures })).toBe(true)
    expect(embeddedPartInputsReady(activation, { ...source, sourceBuiltFeatures: sourceFeatures, sourceLoading: true })).toBe(false)
  })

  it('rejects unfinished, pending, unavailable and invalid model states', () => {
    const { activation, inputs, model } = fixture()
    for (const patch of [{ unfinished: true }, { filePending: true }, { dialogOpen: true }, { busy: true }, { ready: false },
      { error: 'Original rejected input' }, { model: null }, { model: { ...model, featureErrors: [{ id: 'original', message: 'Original failure' }] } }])
      expect(embeddedPartInputsReady(activation, { ...inputs, ...patch })).toBe(false)
  })

  it('does not reuse cached build equality after review Cancel resumes an activation', async () => {
    const { activation, work, snapshot, inputs } = fixture()
    work.setSnapshot(activation, snapshot)
    await work.run(activation, async () => undefined)
    expect(work.markReady(activation, snapshot)).toBe(true)
    work.suspend(activation); work.acknowledgeCleanup(activation); await work.awaitSuspended(activation)
    const resumed = work.resume()
    work.setSnapshot(resumed, snapshot)
    expect(embeddedPartInputsReady(resumed, inputs)).toBe(false)
    expect(work.markReady(resumed, snapshot)).toBe(false)
    await work.run(resumed, async () => undefined)
    expect(embeddedPartInputsReady(resumed, { ...inputs, builtActivation: resumed })).toBe(true)
    expect(work.markReady(resumed, snapshot)).toBe(true)
  })

  it('keeps a queued build and its actual promise separate from cached input readiness', async () => {
    const { activation, work, snapshot, inputs } = fixture()
    work.setSnapshot(activation, snapshot)
    await work.run(activation, async () => undefined)
    work.markReady(activation, snapshot)
    const timer = work.registerTimer(activation, vi.fn())!
    expect(embeddedPartInputsReady(activation, inputs)).toBe(true)
    expect(work.isReady(activation, snapshot)).toBe(false)
    let finish!: () => void
    const build = work.runTimer(timer, () => new Promise<void>(resolve => { finish = resolve }))
    expect(work.getState()).toMatchObject({ timers: 0, pending: 1 })
    expect(work.markReady(activation, snapshot)).toBe(false)
    finish(); await build
    expect(work.markReady(activation, snapshot)).toBe(true)
  })
})
