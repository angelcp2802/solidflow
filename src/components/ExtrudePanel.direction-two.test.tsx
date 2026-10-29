import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ExtrudeFeature } from '../cad/kernel.types'
import ExtrudePanel from './ExtrudePanel'
import { extrudeModePatch } from './ExtrudePanel'
import { extrusionDirectionInputError, mergeExtrusionDraft } from './extrusionEditorDraft'

// Original declaration-only UI fixtures; no native geometry or source result is fabricated.
const feature: ExtrudeFeature = { id: 'boss', name: 'Original two-direction boss', type: 'extrude', suppressed: false,
  sketchId: 'profile', depth: 20, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'body' } }
const TWO = 'Dirección 2', DEPTH = 'Profundidad de dirección 2'
interface ControlProps {
  'aria-label'?: string
  children?: ReactNode
  disabled?: boolean
  value?: string | number
  onClick?: () => void
  onChange?: (event: { target: { value: string; checked: boolean } }) => void
}
function control(root: ReactNode, label: string): ReactElement<ControlProps> {
  let found: ReactElement<ControlProps> | undefined
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<ControlProps>(child)) return
    const caption = child.type === 'button' ? Children.toArray(child.props.children).filter(item => typeof item === 'string').join('').trim() : ''
    if (child.props['aria-label'] === label || caption === label) found = child
    else if (child.props.children) visit(child.props.children)
  })
  visit(root)
  if (!found) throw Error('Missing extrusion control: ' + label)
  return found
}
function tree(input: ExtrudeFeature = feature, onChange = vi.fn(), flags: Partial<ComponentProps<typeof ExtrudePanel>> = {}) {
  return ExtrudePanel({ feature: input, features: [], planes: [], baseFeatureId: null,
    preferredTarget: { kind: 'principal', plane: 'XY' }, picking: false, loading: false, canPickFace: false,
    onTarget: () => undefined, onPickFace: () => undefined, onChange, ...flags })
}
const change = (root: ReactNode, label: string, value: string, checked = false) =>
  control(root, label).props.onChange?.({ target: { value, checked } })

describe('independent second extrusion direction', () => {
  it('initializes only an explicit activation at 10 mm without changing the first direction', () => {
    const onChange = vi.fn(), before = structuredClone(feature), root = tree(feature, onChange)
    expect(control(root, TWO).props.disabled).toBe(false)
    expect(renderToStaticMarkup(root)).not.toContain(`aria-label="${DEPTH}"`)
    expect(onChange).not.toHaveBeenCalled()
    change(root, TWO, '', true)
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ secondDirection: { enabled: true, depth: 10 } })
    expect(feature).toEqual(before)
  })

  it('places the independent block after the first target and before the wall controls', () => {
    const input: ExtrudeFeature = { ...feature, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } }
    const html = renderToStaticMarkup(tree(input))
    expect(html.indexOf('aria-label="Superficie de destino"')).toBeLessThan(html.indexOf('aria-label="Dirección 2"'))
    expect(html.indexOf('aria-label="Dirección 2"')).toBeLessThan(html.indexOf('aria-label="Operación lámina"'))
  })

  it('retains the second length through OFF/ON independently of signed D1, wall and caps', () => {
    const input: ExtrudeFeature = { ...feature, depth: -20, secondDirection: { enabled: true, depth: 12.5 },
      thinWall: { kind: 'two-sides', firstThickness: 2, secondThickness: 1, endCaps: { enabled: true, thickness: 1 } } }
    const before = structuredClone(input), onChange = vi.fn()
    change(tree(input, onChange), TWO, '', false)
    const off = mergeExtrusionDraft(input, onChange.mock.lastCall![0], input)
    expect(off).toEqual({ ...input, secondDirection: { enabled: false, depth: 12.5 } })
    expect(renderToStaticMarkup(tree(off))).toContain('extrude-inactive-second-depth')
    change(tree(off, onChange), TWO, '', true)
    expect(mergeExtrusionDraft(off, onChange.mock.lastCall![0], input)).toEqual(input)
    expect(input).toEqual(before)
  })

  it('keeps global reverse and first-depth editing independent of D2', () => {
    const input: ExtrudeFeature = { ...feature, secondDirection: { enabled: true, depth: 3 } }, onChange = vi.fn()
    const root = tree(input, onChange)
    control(root, 'Invertir dirección').props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith({ depth: -20 })
    expect(mergeExtrusionDraft(input, onChange.mock.lastCall![0]).secondDirection).toEqual({ enabled: true, depth: 3 })
    change(root, 'Profundidad', '7')
    expect(mergeExtrusionDraft(input, onChange.mock.lastCall![0])).toMatchObject({ depth: 7, secondDirection: { enabled: true, depth: 3 } })
    change(root, DEPTH, '4.5')
    expect(mergeExtrusionDraft(input, onChange.mock.lastCall![0])).toMatchObject({ depth: 20, secondDirection: { enabled: true, depth: 4.5 } })
  })

  it.each(['mid', 'throughAll', 'throughAllBoth', 'untilNext', 'upToSurface'])('retains D2 in %s and permits explicit OFF without changing the chosen limit', mode => {
    const input: ExtrudeFeature = { ...feature, secondDirection: { enabled: true, depth: 10 } }, onChange = vi.fn()
    const changed = mergeExtrusionDraft(input, extrudeModePatch(input, mode, 'base', { kind: 'principal', plane: 'XZ' })!)
    const before = structuredClone(changed), root = tree(changed, onChange)
    expect(control(root, TWO).props.disabled).toBe(false)
    expect(control(root, DEPTH).props.disabled).toBe(true)
    expect(extrusionDirectionInputError(changed)).not.toBeNull()
    change(root, TWO, '', true); change(root, DEPTH, '5')
    expect(onChange).not.toHaveBeenCalled()
    change(root, TWO, '', false)
    const off = mergeExtrusionDraft(changed, onChange.mock.lastCall![0])
    expect(off.endCondition).toEqual(changed.endCondition)
    expect(off.symmetric).toBe(changed.symmetric)
    expect(off.secondDirection).toEqual({ enabled: false, depth: 10 })
    expect(extrusionDirectionInputError(off)).toBeNull()
    const offTree = tree(off, onChange)
    expect(control(offTree, TWO).props.disabled).toBe(true)
    change(offTree, TWO, '', true)
    expect(onChange).toHaveBeenCalledOnce()
    expect(changed).toEqual(before)
  })

  it.each([true, false])('does not offer new activation in an ineligible context, axial mid=%s', symmetric => {
    const input: ExtrudeFeature = symmetric ? { ...feature, symmetric: true }
      : { ...feature, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } }
    const onChange = vi.fn(), root = tree(input, onChange)
    expect(control(root, TWO).props.disabled).toBe(true)
    change(root, TWO, '', true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([0, -.01, NaN, Infinity, 100_001])('retains invalid OFF length %s and keeps decimal correction mounted', depth => {
    const input: ExtrudeFeature = { ...feature, secondDirection: { enabled: false, depth } }, onChange = vi.fn()
    let draft: ExtrudeFeature = input
    expect(extrusionDirectionInputError(draft)).not.toBeNull()
    expect(renderToStaticMarkup(tree(draft))).not.toContain('extrude-inactive-second-depth')
    for (const value of ['1', '1.5']) {
      const root = tree(draft, onChange)
      expect(control(root, DEPTH).props.disabled).toBe(false)
      change(root, DEPTH, value)
      draft = mergeExtrusionDraft(draft, onChange.mock.lastCall![0])
      const corrected = tree(draft)
      expect(control(corrected, DEPTH).props.disabled).toBe(false)
      expect(control(corrected, DEPTH).props).not.toHaveProperty('aria-hidden')
      const label = renderToStaticMarkup(corrected).match(/<label[^>]*for="extrude-second-depth"[^>]*>/)?.[0]
      expect(label).toContain('extrude-inactive-second-depth')
      expect(label).not.toContain('aria-hidden')
      expect(label).not.toContain(' hidden')
      expect(draft.secondDirection).toEqual({ enabled: false, depth: Number(value) })
      expect(extrusionDirectionInputError(draft)).toBeNull()
    }
    expect(input.secondDirection?.depth).toBe(depth)
  })

  it.each([{ loading: true }, { picking: true }, { directionDisabled: true }])('blocks callbacks for currentness or selection guard %j', flags => {
    for (const enabled of [true, false]) {
      const input: ExtrudeFeature = { ...feature, secondDirection: { enabled, depth: 0 } }, onChange = vi.fn(), root = tree(input, onChange, flags)
      expect(control(root, TWO).props.disabled).toBe(true)
      expect(control(root, DEPTH).props.disabled).toBe(true)
      change(root, TWO, '', false); change(root, TWO, '', true); change(root, DEPTH, '1.5')
      expect(onChange).not.toHaveBeenCalled()
    }
  })

  it.each([0, NaN, Infinity, -Infinity, 100_001, -100_001])('preserves invalid D1=%s during automatic transitions and leaves its field editable', depth => {
    const input: ExtrudeFeature = { ...feature, depth }, onChange = vi.fn()
    for (const mode of ['throughAll', 'throughAllBoth', 'untilNext', 'upToSurface']) {
      const changed = mergeExtrusionDraft(input, extrudeModePatch(input, mode, 'base', { kind: 'principal', plane: 'XZ' })!)
      expect(changed.depth).toBe(depth)
      const root = tree(changed, onChange)
      expect(control(root, 'Profundidad').props.value).toBe(Number.isFinite(depth) ? depth : '')
      expect(renderToStaticMarkup(root)).toContain('role="alert"')
      change(root, 'Profundidad', '-7')
      const corrected = mergeExtrusionDraft(changed, onChange.mock.lastCall![0])
      expect(corrected.depth).toBe(-7)
      expect(corrected.endCondition).toEqual(changed.endCondition)
      expect(extrusionDirectionInputError(corrected)).toBeNull()
    }
  })

  it('keeps automatic D1 mounted through the first valid digit and complete decimal correction', () => {
    let draft: ExtrudeFeature = { ...feature, depth: 0,
      endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } }
    const onChange = vi.fn()
    for (const value of ['1', '1.5']) {
      change(tree(draft, onChange), 'Profundidad', value)
      draft = mergeExtrusionDraft(draft, onChange.mock.lastCall![0])
      const corrected = tree(draft)
      expect(control(corrected, 'Profundidad').props.value).toBe(Number(value))
      expect(control(corrected, 'Profundidad').props).not.toHaveProperty('aria-hidden')
      expect(renderToStaticMarkup(corrected)).toContain('extrude-inactive-primary-depth')
      expect(draft.endCondition).toEqual({ kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } })
    }
  })

  it('keeps D2 controls available for scoped Blind cuts and leaves caps availability unchanged for both Blind directions', () => {
    const cut: ExtrudeFeature = { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: 'profile', depth: -8,
      symmetric: false, bodyScope: [{ bodyId: 'body', sourceFeatureId: 'base' }], secondDirection: { enabled: true, depth: 3 } }
    const onChange = vi.fn(), root = tree(cut, onChange)
    expect(control(root, TWO).props.disabled).toBe(false)
    change(root, DEPTH, '4')
    expect(mergeExtrusionDraft(cut, onChange.mock.lastCall![0])).toMatchObject({ bodyScope: cut.bodyScope, depth: -8 })
    const capped: ExtrudeFeature = { ...feature, secondDirection: { enabled: true, depth: 10 },
      thinWall: { kind: 'one-side', thickness: 2, reversed: false, endCaps: { enabled: true, thickness: 1 } } }
    expect(renderToStaticMarkup(tree(capped, vi.fn(), { endCapsAvailable: true }))).toContain('aria-label="Tapas de extremos"')
    expect(extrusionDirectionInputError(capped)).toBeNull()
  })
})
