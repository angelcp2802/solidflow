import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BodyReference, CombineFeature, ExtrudeFeature, PickableBody } from '../cad/kernel.types'
import { BodyFeaturePanel, BodyList } from './BodyManagementPanel'

// Symbolic DTOs test rendered controls, not native bodies or pointer events.
const body = (id: string): PickableBody => ({ ref: { bodyId: id, sourceFeatureId: `source-${id}` }, createdByFeatureId: `source-${id}`,
  name: id, vertices: [], normals: [], triangles: [], edgeLines: [], faces: [], edges: [], volume: 240, bounds: { min: [0, 0, 0], max: [10, 6, 4] } })

describe('incomplete body drafts receive narrow actionable guidance', () => {
  const cut: ExtrudeFeature = { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: 'sketch', depth: 4, symmetric: false, bodyScope: [] }
  const cutError = 'Documento.features[2].bodyScope: se esperaba una lista de entre 1 y 256 elementos'
  const limitError = 'Documento.features[2].endCondition.baseFeatureId: se esperaba texto de entre 1 y 128 caracteres'
  const cutGuidance = 'Selecciona al menos un cuerpo que quieras cortar.'
  const limitGuidance = 'Selecciona un cuerpo límite para calcular hasta dónde llega la extrusión.'
  const noAction = () => { throw Error('Rendering must not invoke an editing callback') }
  const render = (feature: ExtrudeFeature, message: string, selection: BodyReference[] = []) => renderToStaticMarkup(
    <BodyFeaturePanel bodies={[body('A')]} selection={selection} feature={feature} outputBodyId="new-body" existing={false}
      onSelection={noAction} onFeature={noAction} picking={false} onPicking={noAction} message={message} />)
  const separate = (kind: 'throughAll' | 'untilNext'): Extract<ExtrudeFeature, { type: 'extrude' }> => ({
    id: 'boss', name: 'Original separate boss', type: 'extrude', suppressed: false, sketchId: 'sketch', depth: 4, symmetric: false,
    bodyOperation: { mode: 'new', bodyId: 'new-body' },
    endCondition: kind === 'throughAll' ? { kind, baseFeatureId: '', bothDirections: false } : { kind, baseFeatureId: '' },
  })

  it('explains an empty explicit cut scope without replacing other errors or nonempty selections', () => {
    const markup = render(cut, cutError)
    expect(markup).toContain(cutGuidance); expect(markup).not.toContain(cutError)
    expect(markup).toContain('role="status"'); expect(markup).toContain('Seleccionar cuerpos en el visor')
    const { bodyScope: _scope, ...legacy } = cut
    for (const [feature, selection] of [[legacy, []], [cut, [body('A').ref]], [{ ...cut, bodyScope: [body('A').ref] }, []]] as [ExtrudeFeature, BodyReference[]][]) {
      expect(render(feature, cutError, selection)).toContain(cutError)
      expect(render(feature, cutError, selection)).not.toContain(cutGuidance)
    }
    const other = 'Documento.features[2].depth: el valor absoluto debe ser al menos 0.01'
    expect(render(cut, other)).toContain(other)
    expect(render(cut, other)).not.toContain(cutGuidance)
    expect(render(cut, cutError + ' Detalle adicional.')).toContain(cutError + ' Detalle adicional.')
  })

  it.each(['throughAll', 'untilNext'] as const)('explains only the missing explicit new-body limit for %s', kind => {
    const feature = separate(kind), markup = render(feature, limitError)
    expect(markup).toContain(limitGuidance); expect(markup).not.toContain(limitError)
    expect(markup).toContain('Cuerpo límite de la extrusión'); expect(markup).toContain('role="status"')
    const end = feature.endCondition
    if (!end || end.kind === 'upToSurface') throw Error('Original limit fixture required')
    const differentStates: ExtrudeFeature[] = [
      { ...feature, bodyOperation: { mode: 'merge', target: body('A').ref } },
      { ...feature, endCondition: undefined },
      { ...feature, endCondition: { ...end, baseFeatureId: 'source-A' } },
      { ...feature, endCondition: { ...end, baseBody: body('A').ref } },
    ]
    for (const other of differentStates) {
      expect(render(other, limitError)).toContain(limitError)
      expect(render(other, limitError)).not.toContain(limitGuidance)
    }
    const otherError = 'Un cuerpo de la operación no está disponible en el estado mostrado.'
    expect(render(feature, otherError)).toContain(otherError)
    expect(render(feature, otherError)).not.toContain(limitGuidance)
    expect(render(feature, limitError + ' Detalle adicional.')).toContain(limitError + ' Detalle adicional.')
  })
})

describe('body controls expose current and unavailable identities', () => {
  it.each(['missing', 'stale'] as const)('requires an explicit new-body limit and preserves its %s state', mode => {
    const current = body('A')
    const feature: ExtrudeFeature = { id: 'new-extrude', name: 'Separate boss', type: 'extrude', suppressed: false,
      sketchId: 'sketch', depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'new-body' },
      endCondition: { kind: 'untilNext', baseFeatureId: mode === 'stale' ? 'deleted-state' : '',
        ...(mode === 'stale' ? { baseBody: { ...current.ref, sourceFeatureId: 'deleted-state' } } : {}) } }
    const markup = renderToStaticMarkup(<BodyFeaturePanel bodies={[current]} selection={[]}
      feature={feature} outputBodyId="new-body" existing={false} onSelection={() => undefined}
      onFeature={() => undefined} picking={false} onPicking={() => undefined} />)
    expect(markup).toContain('Cuerpo límite de la extrusión')
    expect(markup).toContain('Selecciona un cuerpo límite')
    if (mode === 'stale') {
      expect(markup).toContain('Cuerpo límite no disponible')
      expect(markup).toContain('deleted-state')
    } else expect(markup).not.toContain('Cuerpo límite no disponible')
  })

  it('keeps an unavailable saved selection visible and removable', () => {
    const current = body('A')
    const markup = renderToStaticMarkup(<BodyList bodies={[current]} selection={[{ ...current.ref, sourceFeatureId: 'deleted-state' }]} onSelection={() => undefined} />)
    expect(markup).toContain('Cuerpo no disponible')
    expect(markup).toContain('Quitar cuerpo no disponible')
    expect(markup).not.toContain('checked=""')
  })

  it('distinguishes subtraction target, ordered tools and retention from its preview control', () => {
    const bodies = [body('A'), body('B')]
    const feature: CombineFeature = { id: 'subtract', name: 'Subtract', type: 'combine', suppressed: false,
      operation: 'subtract', target: bodies[1].ref, tools: [bodies[0].ref], keepTools: true }
    const markup = renderToStaticMarkup(<BodyFeaturePanel bodies={bodies} selection={[bodies[1].ref, bodies[0].ref]}
      feature={feature} outputBodyId="unused-new-id" existing={false} onSelection={() => undefined}
      onFeature={() => undefined} picking={true} onPicking={() => undefined} />)
    expect(markup).toContain('Cuerpo objetivo de sustracción')
    expect(markup).toContain('Conservar herramientas')
    expect(markup).toContain('Objetivo: B')
    expect(markup).toContain('Ver vista previa')
  })
})
