import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ExtrudeFeature, RevolutionFeature, SketchFeature, ThinWallDefinition } from '../cad/kernel.types'
import ExtrudePanel, { extrudeModePatch } from './ExtrudePanel'
import RevolvePanel, { mergeRevolutionDraft } from './RevolvePanel'
import ThinWallPanel from './ThinWallPanel'
import { mergeThinWallEditorDraft, thinAutoCornersAvailableByProfile, thinEndCapsAvailableByProfile } from './thinWallEditorDraft'

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

  it('offers automatic corners only for explicitly eligible additive extrusions', () => {
    const rounded: ThinWallDefinition = { ...wall, autoCorners: { enabled: true, radius: 3 } }
    const feature = { ...extrude, thinWall: rounded }
    const eligible = extrudeTree(feature, vi.fn(), { autoCornersAvailable: true, thinWallRequired: true })
    expect(wallSection(eligible).props.autoCornersAvailable).toBe(true)
    expect(renderToStaticMarkup(eligible)).toContain('aria-label="Redondeo automático de esquinas"')
    expect(renderToStaticMarkup(eligible)).toContain('aria-label="Radio del redondeo automático"')
    for (const required of [true, false]) {
      const unproven = extrudeTree({ ...extrude, thinWall: wall }, vi.fn(), { thinWallRequired: required })
      expect(wallSection(unproven).props.autoCornersAvailable).toBe(false)
      expect(renderToStaticMarkup(unproven)).not.toContain('aria-label="Redondeo automático de esquinas"')
    }
  })

  it.each([false, true])('keeps corner controls absent in cut and both revolution editors with retained enabled=%s declarations', enabled => {
    const rounded: ThinWallDefinition = { ...wall, autoCorners: { enabled, radius: 3 } }
    const cut: ExtrudeFeature = { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: 'profile',
      depth: -5, symmetric: false, thinWall: rounded, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'state' }] }
    const cutTree = extrudeTree(cut, vi.fn(), { autoCornersAvailable: true })
    expect(wallSection(cutTree).props.autoCornersAvailable).toBe(false)
    expect(wallSection(cutTree).props.allowAutoCornerRecovery).toBe(false)
    expect(renderToStaticMarkup(cutTree)).not.toContain('aria-label="Redondeo automático de esquinas"')
    for (const type of ['revolve', 'revolvedCut'] as const) {
      const feature: RevolutionFeature = type === 'revolve' ? { ...revolve, thinWall: rounded }
        : { id: 'groove', name: 'Original groove', type, sketchId: 'profile', suppressed: false, angle: 90, thinWall: rounded, bodyScope: cut.bodyScope }
      const before = structuredClone(feature)
      const tree = RevolvePanel({ feature, sketch, thinWallRequired: true, onChange: () => undefined, children: 'Angle' })
      expect(wallSection(tree).props.autoCornersAvailable).toBe(false)
      expect(renderToStaticMarkup(tree)).not.toContain('aria-label="Redondeo automático de esquinas"')
      expect(feature).toEqual(before)
    }
  })

  it('forwards a full corner edit without changing termination, signed depth or exact output ownership', () => {
    const onChange = vi.fn(), feature = { ...extrude, thinWall: wall }, before = structuredClone(feature)
    const tree = extrudeTree(feature, onChange, { autoCornersAvailable: true, existing: true })
    wallSection(tree).props.onChange({ ...wall, autoCorners: { enabled: true, radius: 1.5 } })
    const edited = mergeThinWallEditorDraft(feature, onChange.mock.calls[0][0], feature)
    expect(edited).toEqual({ ...feature, thinWall: { ...wall, autoCorners: { enabled: true, radius: 1.5 } } })
    expect(feature).toEqual(before)
  })

  it('keeps a saved extrusion recoverable after a current solved profile stops being open-only', () => {
    const rounded: ThinWallDefinition = { ...wall, autoCorners: { enabled: true, radius: 3 } }
    const feature = { ...extrude, thinWall: rounded }, before = structuredClone(feature), onChange = vi.fn()
    const available = thinAutoCornersAvailableByProfile(sketch.id, { featureErrors: [],
      sketches: [{ id: sketch.id, lines: [], constructionLines: [], profileTopology: 'closed' }] }, true)
    expect(available).toBe(false)
    const tree = extrudeTree(feature, onChange, { existing: true, autoCornersAvailable: available })
    const section = wallSection(tree)
    expect(section.props.allowAutoCornerRecovery).toBe(true)
    expect(section.props.autoCornersAvailable).toBe(false)
    expect(renderToStaticMarkup(tree)).toContain('aria-label="Redondeo automático de esquinas"')
    section.props.onChange({ ...rounded, autoCorners: { enabled: false, radius: 3 } })
    expect(mergeThinWallEditorDraft(feature, onChange.mock.calls[0][0], feature))
      .toEqual({ ...feature, thinWall: { ...rounded, autoCorners: { enabled: false, radius: 3 } } })
    expect(feature).toEqual(before)
  })

  it('offers new caps only on an explicitly eligible additive Blind extrusion', () => {
    const blind = { ...extrude, thinWall: wall }; delete blind.endCondition
    const witness = { id: sketch.id, lines: [], constructionLines: [], profileTopology: 'closed' as const, profileClosedSingle: true as const }
    const available = thinEndCapsAvailableByProfile(sketch.id, { featureErrors: [], sketches: [witness] }, true)
    expect(available).toBe(true)
    const eligible = extrudeTree(blind, vi.fn(), { endCapsAvailable: available })
    expect(wallSection(eligible).props.endCapsAvailable).toBe(true)
    expect(renderToStaticMarkup(eligible)).toContain('aria-label="Tapas de extremos"')
    const notEligible: ExtrudeFeature[] = [
      { ...blind, symmetric: true },
      { ...blind, endCondition: { kind: 'throughAll', baseFeatureId: 'base', bothDirections: false } },
      { ...blind, endCondition: { kind: 'throughAll', baseFeatureId: 'base', bothDirections: true } },
      { ...blind, endCondition: { kind: 'untilNext', baseFeatureId: 'base' } },
      { ...blind, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } },
      { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: sketch.id,
        depth: 8, symmetric: false, thinWall: wall, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'base' }] },
    ]
    for (const feature of notEligible) {
      const tree = extrudeTree(feature, vi.fn(), { endCapsAvailable: true })
      expect(wallSection(tree).props.endCapsAvailable).toBe(false)
      expect(renderToStaticMarkup(tree)).not.toContain('aria-label="Tapas de extremos"')
    }
    const unproven = extrudeTree(blind)
    expect(wallSection(unproven).props.endCapsAvailable).toBe(false)
    expect(renderToStaticMarkup(unproven)).not.toContain('aria-label="Tapas de extremos"')
  })

  it.each(['revolve', 'revolvedCut'] as const)('does not offer new caps for %s but retains explicit document recovery', type => {
    const feature: RevolutionFeature = type === 'revolve' ? revolve
      : { id: 'groove', name: 'Original groove', type, sketchId: sketch.id, suppressed: false, angle: 90,
        bodyScope: [{ bodyId: 'body', sourceFeatureId: 'base' }] }
    const plain = RevolvePanel({ feature: { ...feature, thinWall: wall }, sketch, onChange: () => undefined, children: 'Angle' })
    expect(wallSection(plain).props.endCapsAvailable).toBe(false)
    expect(renderToStaticMarkup(plain)).not.toContain('aria-label="Tapas de extremos"')
    const capped = { ...feature, thinWall: { ...wall, endCaps: { enabled: true, thickness: 1.5 } } }, before = structuredClone(capped)
    const onChange = vi.fn(), tree = RevolvePanel({ feature: capped, sketch, onChange, children: 'Angle' })
    expect(wallSection(tree).props.allowEndCapRecovery).toBe(true)
    expect(renderToStaticMarkup(tree)).toContain('aria-label="Tapas de extremos"')
    wallSection(tree).props.onChange({ ...capped.thinWall, endCaps: { enabled: false, thickness: 1.5 } })
    expect(mergeRevolutionDraft(capped, onChange.mock.lastCall![0]))
      .toEqual({ ...capped, thinWall: { ...capped.thinWall, endCaps: { enabled: false, thickness: 1.5 } } })
    expect(capped).toEqual(before)
  })

  it('recovers retained caps on a cut without changing its exact owner scope', () => {
    const cut: ExtrudeFeature = { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: sketch.id,
      depth: 8, symmetric: false, thinWall: { ...wall, endCaps: { enabled: true, thickness: 1.5 } },
      bodyScope: [{ bodyId: 'body', sourceFeatureId: 'base' }] }
    const before = structuredClone(cut), onChange = vi.fn(), tree = extrudeTree(cut, onChange, { endCapsAvailable: true })
    const section = wallSection(tree)
    expect(section.props).toMatchObject({ endCapsAvailable: false, allowEndCapRecovery: true })
    expect(renderToStaticMarkup(tree)).toContain('aria-label="Tapas de extremos"')
    section.props.onChange({ ...cut.thinWall!, endCaps: { enabled: false, thickness: 1.5 } })
    const next = mergeThinWallEditorDraft(cut, onChange.mock.lastCall![0], cut)
    expect(next.bodyScope).toEqual(cut.bodyScope)
    expect(next).not.toHaveProperty('bodyOperation')
    expect(next.thinWall?.endCaps).toEqual({ enabled: false, thickness: 1.5 })
    expect(cut).toEqual(before)
  })

  it('allows cap recovery after source closure eligibility changes and keeps stale-prefix locking authoritative', () => {
    const capped: ThinWallDefinition = { ...wall, endCaps: { enabled: true, thickness: 1.5 } }
    const feature = { ...extrude, thinWall: capped }; delete feature.endCondition
    const before = structuredClone(feature)
    const available = thinEndCapsAvailableByProfile(sketch.id, { featureErrors: [],
      sketches: [{ id: sketch.id, lines: [], constructionLines: [], profileTopology: 'open' }] }, true)
    expect(available).toBe(false)
    const tree = extrudeTree(feature, vi.fn(), { existing: true, endCapsAvailable: available })
    expect(wallSection(tree).props).toMatchObject({ endCapsAvailable: false, allowEndCapRecovery: true })
    expect(renderToStaticMarkup(tree)).toContain('aria-label="Tapas de extremos"')
    const stale = extrudeTree(feature, vi.fn(), { existing: true, endCapsAvailable: true, thinWallDisabled: true })
    expect(wallSection(stale).props.disabled).toBe(true)
    const loading = extrudeTree(feature, vi.fn(), { endCapsAvailable: true, loading: true })
    expect(wallSection(loading).props.disabled).toBe(true)
    expect(feature).toEqual(before)
  })

  it('retains caps through a Blind/mid/Blind extent transition without silently disabling them', () => {
    const capped: ThinWallDefinition = { ...wall, endCaps: { enabled: true, thickness: 1.5 } }
    const feature = { ...extrude, thinWall: capped }; delete feature.endCondition
    const before = structuredClone(feature)
    const midPatch = extrudeModePatch(feature, 'mid', null, { kind: 'principal', plane: 'XY' })!
    const mid = mergeThinWallEditorDraft(feature, midPatch, feature)
    expect(mid.symmetric).toBe(true)
    expect(mid.thinWall).toEqual(capped)
    const section = wallSection(extrudeTree(mid, vi.fn(), { endCapsAvailable: true }))
    expect(section.props).toMatchObject({ endCapsAvailable: false, allowEndCapRecovery: true })
    const off = mergeThinWallEditorDraft(mid, { thinWall: { ...capped, endCaps: { enabled: false, thickness: 1.5 } } }, feature)
    const back = mergeThinWallEditorDraft(off, extrudeModePatch(off, 'blind', null, { kind: 'principal', plane: 'XY' })!, feature)
    expect(back.symmetric).toBe(false)
    expect(back.thinWall?.endCaps).toEqual({ enabled: false, thickness: 1.5 })
    expect(wallSection(extrudeTree(back, vi.fn(), { endCapsAvailable: true })).props.endCapsAvailable).toBe(true)
    expect(back).toMatchObject({ type: 'extrude', bodyOperation: feature.bodyOperation })
    expect(back.depth).toBe(feature.depth)
    expect(feature).toEqual(before)
  })
})
