import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ExtrudeFeature, RevolutionFeature, SketchFeature, ThinWallDefinition } from '../cad/kernel.types'
import ExtrudePanel from './ExtrudePanel'
import RevolvePanel, { mergeRevolutionDraft } from './RevolvePanel'
import ThinWallPanel from './ThinWallPanel'
import { mergeThinWallEditorDraft } from './thinWallEditorDraft'

const sketch: SketchFeature = { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [5, 0], width: 4, height: 6 } }
const wall: ThinWallDefinition = { kind: 'two-sides', firstThickness: 1.5, secondThickness: .5 }
const revolve: RevolutionFeature = { id: 'turn', name: 'Original turn', type: 'revolve', suppressed: false, sketchId: sketch.id,
  angle: 120, reversed: true, axis: { kind: 'principal-axis', axis: 'Y' }, extent: { kind: 'two-directions', secondAngle: 30 },
  bodyOperation: { mode: 'new', bodyId: 'original-turn-body' } }
const extrude: ExtrudeFeature = { id: 'boss', name: 'Original boss', type: 'extrude', suppressed: false, sketchId: sketch.id,
  depth: -8, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'original-boss-body' },
  endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } }

function wallSection(root: ReactNode): ReactElement<ComponentProps<typeof ThinWallPanel>> {
  let found: ReactElement<ComponentProps<typeof ThinWallPanel>> | undefined
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return
    if (child.type === ThinWallPanel) found = child as ReactElement<ComponentProps<typeof ThinWallPanel>>
    else if (child.props.children) visit(child.props.children)
  })
  visit(root)
  if (!found) throw Error('One mounted shared thin-wall section required')
  return found
}
function extrudeTree(feature = extrude, onChange = vi.fn(), flags: Partial<ComponentProps<typeof ExtrudePanel>> = {}) {
  return ExtrudePanel({ feature, features: [sketch], planes: [], baseFeatureId: null,
    preferredTarget: { kind: 'principal', plane: 'XY' }, picking: false, loading: false, canPickFace: false,
    onTarget: () => undefined, onPickFace: () => undefined, onChange, ...flags })
}

describe('shared wall wiring into production operation editors', () => {
  it('places the revolution wall after both angular directions and preserves their independent values', () => {
    const onChange = vi.fn(), feature = { ...revolve, thinWall: wall }, before = structuredClone(feature)
    const tree = RevolvePanel({ feature, sketch, onChange, children: <input aria-label="Ángulo" value={120} readOnly /> })
    const html = renderToStaticMarkup(tree)
    expect(html.indexOf('aria-label="Ángulo de dirección 2"')).toBeLessThan(html.indexOf('aria-label="Operación lámina"'))
    const section = wallSection(tree)
    expect(section.props.thinWall).toEqual(wall)
    section.props.onChange({ kind: 'one-side', thickness: 2, reversed: false })
    expect(onChange).toHaveBeenLastCalledWith({ thinWall: { kind: 'one-side', thickness: 2, reversed: false } })
    const next = mergeRevolutionDraft(feature, onChange.mock.calls[0][0])
    expect(next).toEqual({ ...feature, thinWall: { kind: 'one-side', thickness: 2, reversed: false } })
    expect(feature).toEqual(before)
  })

  it('places the extrusion wall after direction and destination controls, leaving signed depth and termination untouched', () => {
    const onChange = vi.fn(), feature = { ...extrude, thinWall: wall }, before = structuredClone(feature), tree = extrudeTree(feature, onChange)
    const html = renderToStaticMarkup(tree)
    expect(html.indexOf('aria-label="Superficie de destino"')).toBeLessThan(html.indexOf('aria-label="Operación lámina"'))
    wallSection(tree).props.onChange({ kind: 'mid-plane', thickness: 4 })
    expect(onChange).toHaveBeenLastCalledWith({ thinWall: { kind: 'mid-plane', thickness: 4 } })
    expect(mergeThinWallEditorDraft(feature, onChange.mock.calls[0][0])).toEqual({ ...feature, thinWall: { kind: 'mid-plane', thickness: 4 } })
    expect(feature).toEqual(before)
  })

  it.each(['extrude', 'revolve'] as const)('clears a new %s wall as real absence rather than an own undefined declaration', family => {
    const onChange = vi.fn(), feature = family === 'extrude' ? { ...extrude, thinWall: wall } : { ...revolve, thinWall: wall }
    const tree = family === 'extrude' ? extrudeTree(feature as ExtrudeFeature, onChange)
      : RevolvePanel({ feature: feature as RevolutionFeature, sketch, onChange, children: 'Angle' })
    wallSection(tree).props.onChange(undefined)
    expect(onChange).toHaveBeenCalledWith({ thinWall: undefined })
    const next = family === 'extrude' ? mergeThinWallEditorDraft(feature, onChange.mock.calls[0][0])
      : mergeRevolutionDraft(feature as RevolutionFeature, onChange.mock.calls[0][0])
    expect(next).not.toHaveProperty('thinWall')
    const { thinWall: removed, ...originalFields } = feature
    expect(removed).toEqual(wall); expect(next).toEqual(originalFields)
  })

  it('retains existing regular kinds, exposes existing wall parameters and forwards prefix availability/required state', () => {
    const regularRevolve = RevolvePanel({ feature: revolve, sketch, existing: true, onChange: () => undefined, children: 'Angle' })
    const regularExtrude = extrudeTree(extrude, vi.fn(), { existing: true })
    expect(renderToStaticMarkup(regularRevolve)).not.toContain('aria-label="Operación lámina"')
    expect(renderToStaticMarkup(regularExtrude)).not.toContain('aria-label="Operación lámina"')
    const thinRevolve = RevolvePanel({ feature: { ...revolve, thinWall: wall }, sketch, existing: true,
      thinWallRequired: true, thinWallDisabled: true, onChange: () => undefined, children: 'Angle' })
    expect(wallSection(thinRevolve).props).toMatchObject({ existing: true, required: true, disabled: true, thinWall: wall })
    expect(wallSection(extrudeTree({ ...extrude, thinWall: wall }, vi.fn(), { thinWallRequired: true, loading: true })).props)
      .toMatchObject({ required: true, disabled: true, thinWall: wall })
  })

  it('uses the same independent wall controls for subtractive operations without introducing additive body fields', () => {
    const cut: ExtrudeFeature = { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: 'profile', depth: -5,
      symmetric: false, thinWall: wall, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'state' }] }
    const revolvedCut: RevolutionFeature = { id: 'groove', name: 'Original groove', type: 'revolvedCut', suppressed: false,
      sketchId: 'profile', angle: 90, thinWall: wall, bodyScope: cut.bodyScope }
    const onChange = vi.fn()
    wallSection(extrudeTree(cut, onChange)).props.onChange({ kind: 'mid-plane', thickness: 3 })
    expect(mergeThinWallEditorDraft(cut, onChange.mock.calls[0][0])).toEqual({ ...cut, thinWall: { kind: 'mid-plane', thickness: 3 } })
    const tree = RevolvePanel({ feature: revolvedCut, sketch, onChange, children: 'Angle' })
    wallSection(tree).props.onChange({ kind: 'one-side', thickness: 1, reversed: false })
    const changed = mergeRevolutionDraft(revolvedCut, onChange.mock.calls.at(-1)![0])
    expect(changed.bodyScope).toEqual(cut.bodyScope); expect(changed).not.toHaveProperty('bodyOperation')
  })
})
