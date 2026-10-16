import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CombineFeature, ExtrudeFeature, PickableBody } from '../cad/kernel.types'
import { BodyFeaturePanel, BodyList } from './BodyManagementPanel'

// Symbolic DTOs test rendered controls, not native bodies or pointer events.
const body = (id: string): PickableBody => ({ ref: { bodyId: id, sourceFeatureId: `source-${id}` }, createdByFeatureId: `source-${id}`,
  name: id, vertices: [], normals: [], triangles: [], edgeLines: [], faces: [], edges: [], volume: 240, bounds: { min: [0, 0, 0], max: [10, 6, 4] } })

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
