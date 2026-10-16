import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LoftFeature, PickableBody, SweepFeature } from '../cad/kernel.types'
import SweepLoftPanel from './SweepLoftPanel'

// Original symbolic display records only; SSR does not execute pointer events
// or prove sweep/loft geometry, native validity or a real editor interaction.
const body: PickableBody = { ref: { bodyId: 'saved-body-token', sourceFeatureId: 'source-owner-token' },
  createdByFeatureId: 'source-owner-token', name: 'Current solid', vertices: [], normals: [], triangles: [], edgeLines: [],
  faces: [], edges: [], volume: 240, bounds: { min: [0, 0, 0], max: [10, 6, 4] } }
const feature = (kind: 'sweep' | 'loft'): SweepFeature | LoftFeature => kind === 'sweep'
  ? { id: 'sweep', name: 'Sweep', type: kind, suppressed: false, merge: true, profileSketchId: 'profile',
    pathSketchId: 'path', path: [{ entityId: 'line', reversed: false }], orientation: 'followPath' }
  : { id: 'loft', name: 'Loft', type: kind, suppressed: false, merge: true, ruled: false,
    sections: [{ sketchId: 'section-0', startEntityId: null, reversed: false }, { sketchId: 'section-1', startEntityId: null, reversed: false }] }
const editor = () => ({ bodies: [body], selection: [body.ref], outputBodyId: 'output-token-allocated-once',
  existing: false, picking: false, loading: false, onSelection: () => undefined, onPicking: () => undefined })

describe('sweep and loft explicit-body controls', () => {
  it.each(['sweep', 'loft'] as const)('preserves the legacy %s aggregate checkbox without body controls', kind => {
    const markup = renderToStaticMarkup(<SweepLoftPanel feature={feature(kind)} sketches={[]} onChange={() => undefined} onError={() => undefined} />)
    expect(markup).toContain('Fusionar resultado')
    expect(markup).not.toContain('Resultado del cuerpo')
    expect(markup).not.toContain('Cuerpos sólidos')
  })

  it.each(['sweep', 'loft'] as const)('renders explicit %s creation without a legacy checkbox or internal IDs', kind => {
    const draft = { ...feature(kind), merge: false, bodyOperation: { mode: 'new' as const, bodyId: 'output-token-allocated-once' } }
    const markup = renderToStaticMarkup(<SweepLoftPanel feature={draft} sketches={[]} bodyEditor={editor()} onChange={() => undefined} onError={() => undefined} />)
    expect(markup).toContain('Crear cuerpo separado')
    expect(markup).toContain('Añadir material a un cuerpo')
    expect(markup).toContain('Ver vista previa')
    expect(markup).not.toContain('Fusionar resultado')
    expect(markup).not.toContain('source-owner-token')
    expect(markup).not.toContain('output-token-allocated-once')
  })

  it.each(['sweep', 'loft'] as const)('exposes a stale %s merge target for explicit reselection', kind => {
    const stale = { ...body.ref, sourceFeatureId: 'deleted-body-state' }
    const draft = { ...feature(kind), bodyOperation: { mode: 'merge' as const, target: stale } }
    const markup = renderToStaticMarkup(<SweepLoftPanel feature={draft} sketches={[]}
      bodyEditor={{ ...editor(), selection: [stale], message: 'Vuelve a seleccionar el cuerpo.' }} onChange={() => undefined} onError={() => undefined} />)
    expect(markup).toContain('Cuerpo no disponible')
    expect(markup).toContain('Quitar cuerpo no disponible')
    expect(markup).toContain('Seleccionar cuerpo en el visor')
    expect(markup).toContain('Vuelve a seleccionar el cuerpo.')
    expect(markup).not.toContain('checked=""')
  })

  it.each(['sweep', 'loft'] as const)('disables creation-mode replacement for an existing %s output', kind => {
    const draft = { ...feature(kind), merge: false, bodyOperation: { mode: 'new' as const, bodyId: 'output-token-allocated-once' } }
    const markup = renderToStaticMarkup(<SweepLoftPanel feature={draft} sketches={[]} bodyEditor={{ ...editor(), existing: true }} onChange={() => undefined} onError={() => undefined} />)
    expect(markup).toMatch(/<select[^>]*aria-label="Resultado del cuerpo"[^>]*disabled=""/)
  })
})
