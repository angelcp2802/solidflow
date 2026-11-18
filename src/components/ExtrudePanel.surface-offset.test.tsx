import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ExtrudeFeature, SurfaceOffset } from '../cad/kernel.types'
import { validateSurfaceOffset } from '../cad/extrusionEndCondition'
import ExtrudePanel from './ExtrudePanel'
import { extrusionDirectionInputError, mergeExtrusionDraft } from './extrusionEditorDraft'

// Original declaration-only editor fixtures; native geometry is checked by the desktop limit flow.
const feature: ExtrudeFeature = { id: 'offset-boss', name: 'Original offset editor', type: 'extrude', suppressed: false,
  sketchId: 'original-profile', depth: 13, symmetric: false,
  endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } },
  secondDirection: { enabled: true, depth: 7, endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: 'original-limit' } } },
  bodyOperation: { mode: 'new', bodyId: 'original-body' } }
interface ControlProps {
  'aria-label'?: string; 'aria-invalid'?: boolean; children?: ReactNode; value?: string | number; disabled?: boolean;
  onChange?: (event: { target: { value: string } }) => void
}
function find(root: ReactNode, label: string): ReactElement<ControlProps> {
  let result: ReactElement<ControlProps> | undefined
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<ControlProps>(child)) return
    if (child.props['aria-label'] === label) result = child
    else if (child.props.children) visit(child.props.children)
  })
  visit(root)
  if (!result) throw Error('Missing offset control: ' + label)
  return result
}
function tree(input = feature, flags: Partial<ComponentProps<typeof ExtrudePanel>> = {}) {
  return ExtrudePanel({ feature: input, features: [], planes: [], baseFeatureId: null, preferredTarget: { kind: 'principal', plane: 'XY' },
    picking: false, loading: false, canPickFace: true, onChange: vi.fn(), onTarget: vi.fn(), onPickFace: vi.fn(), ...flags })
}
function changed(input: ExtrudeFeature, label: string, value: string): ExtrudeFeature {
  const onChange = vi.fn()
  find(tree(input, { onChange }), label).props.onChange?.({ target: { value } })
  expect(onChange).toHaveBeenCalledOnce()
  return mergeExtrusionDraft(input, onChange.mock.lastCall![0])
}
function withOffset(side: 'first' | 'second', offset: SurfaceOffset): ExtrudeFeature {
  const result = structuredClone(feature)
  const end = side === 'first' ? result.endCondition : result.secondDirection!.endCondition
  if (end?.kind !== 'upToSurface') throw Error('Original surface end required')
  end.offset = offset
  return result
}

describe('surface offset controls', () => {
  it('shows independent controls only for surface ends and explains oriented normal versus document axes', () => {
    const root = tree(), html = renderToStaticMarkup(root)
    for (const suffix of ['', ' de dirección 2']) {
      expect(find(root, 'Desplazamiento del límite' + suffix).props.value).toBe('none')
      expect(renderToStaticMarkup(find(root, 'Desplazamiento del límite' + suffix))).toContain('Traslación X, Y, Z')
    }
    const blind = { ...feature, endCondition: undefined, secondDirection: { enabled: false, depth: 7 } }
    expect(renderToStaticMarkup(tree(blind))).not.toContain('Desplazamiento del límite')
    expect(html).toContain('ejes del documento')
    expect(renderToStaticMarkup(tree(withOffset('first', { construction: 'normal', signedDistanceMm: -4 })))).toContain('no el sentido de extrusión')
  })

  it.each(['first', 'second'] as const)('adds, switches and explicitly removes only the %s offset', side => {
    const suffix = side === 'second' ? ' de dirección 2' : ''
    const before = structuredClone(feature)
    const normal = changed(feature, 'Desplazamiento del límite' + suffix, 'normal')
    const end = (value: ExtrudeFeature) => side === 'first' ? value.endCondition : value.secondDirection?.endCondition
    expect(end(normal)).toMatchObject({ offset: { construction: 'normal', signedDistanceMm: 0 } })
    const translated = changed(normal, 'Desplazamiento del límite' + suffix, 'translation')
    expect(end(translated)).toMatchObject({ offset: { construction: 'translation', translationWorldMm: [0, 0, 0] } })
    const cleared = changed(translated, 'Desplazamiento del límite' + suffix, 'none')
    expect(end(cleared)).not.toHaveProperty('offset')
    expect(cleared).toEqual(before)
    expect(feature).toEqual(before)
  })

  it('changes signed normal distance and one world coordinate without substituting references or sharing vectors', () => {
    const normal = changed(withOffset('first', { construction: 'normal', signedDistanceMm: 0 }), 'Distancia normal', '-4')
    expect(normal.endCondition).toMatchObject({ target: { kind: 'principal', plane: 'XY' },
      offset: { construction: 'normal', signedDistanceMm: -4 } })
    const original = withOffset('second', { construction: 'translation', translationWorldMm: [2, -7, 4] })
    const next = changed(original, 'Traslación Y de dirección 2', '-9')
    expect(next.secondDirection?.endCondition).toMatchObject({ offset: { translationWorldMm: [2, -9, 4] } })
    expect(original.secondDirection?.endCondition).toMatchObject({ offset: { translationWorldMm: [2, -7, 4] } })
    expect(next.endCondition).toEqual(original.endCondition)
    expect(next).toMatchObject({ bodyOperation: { mode: 'new', bodyId: 'original-body' } })
    expect(extrusionDirectionInputError(next)).toBeNull()
  })

  it.each(['first', 'second'] as const)('retains empty and excessive %s numeric drafts while strict admission blocks them', side => {
    const suffix = side === 'second' ? ' de dirección 2' : ''
    let input = withOffset(side, { construction: 'normal', signedDistanceMm: -4 })
    // The primary condition must also be checked when there is no second-direction declaration.
    if (side === 'first') delete input.secondDirection
    for (const text of ['', '1000001']) {
      const next = changed(input, 'Distancia normal' + suffix, text)
      const control = find(tree(next), 'Distancia normal' + suffix)
      expect(control.props.value).toBe(text === '' ? '' : 1_000_001)
      expect(control.props['aria-invalid']).toBe(true)
      expect(extrusionDirectionInputError(next)).toMatch(/desplazamiento fuera de rango/)
      const end = side === 'first' ? next.endCondition : next.secondDirection?.endCondition
      expect(() => validateSurfaceOffset(end?.kind === 'upToSurface' && end.offset, 'Offset')).toThrow()
      input = next
    }
    const valid = changed(input, 'Distancia normal' + suffix, '-4')
    expect(extrusionDirectionInputError(valid)).toBeNull()
  })

  it.each([{ loading: true }, { picking: true }, { directionDisabled: true }])('blocks offset callbacks while controls are unavailable %j', flags => {
    const onChange = vi.fn()
    const input = withOffset('first', { construction: 'normal', signedDistanceMm: -4 })
    const root = tree(input, { ...flags, onChange })
    for (const [label, value] of [['Desplazamiento del límite', 'translation'], ['Distancia normal', '8'],
      ['Desplazamiento del límite de dirección 2', 'normal']]) {
      const control = find(root, label)
      expect(control.props.disabled).toBe(true)
      control.props.onChange?.({ target: { value } })
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps an empty world coordinate private until corrected, including an inactive second side', () => {
    const input = withOffset('second', { construction: 'translation', translationWorldMm: [2, -7, 4] })
    input.secondDirection!.enabled = false
    const invalid = changed(input, 'Traslación Y de dirección 2', '')
    expect(find(tree(invalid), 'Traslación Y de dirección 2').props.value).toBe('')
    expect(find(tree(invalid), 'Traslación Y de dirección 2').props['aria-invalid']).toBe(true)
    expect(invalid.secondDirection?.endCondition).toMatchObject({ offset: { translationWorldMm: [2, Number.NaN, 4] } })
    expect(extrusionDirectionInputError(invalid)).toMatch(/desplazamiento fuera de rango/)
    expect(extrusionDirectionInputError(changed(invalid, 'Traslación Y de dirección 2', '-7'))).toBeNull()
    expect(input.secondDirection?.endCondition).toMatchObject({ offset: { translationWorldMm: [2, -7, 4] } })
  })

  it('rejects executable or structurally invalid offset draft data without invoking getters', () => {
    const getter = vi.fn(() => 2), vector = [1, 2, 3]
    Object.defineProperty(vector, 1, { get: getter, enumerable: true })
    const patch = (offset: unknown) => ({ endCondition: { kind: 'upToSurface' as const, target: { kind: 'principal' as const, plane: 'XY' as const }, offset: offset as SurfaceOffset } })
    for (const offset of [{ construction: 'translation', translationWorldMm: vector },
      { construction: 'translation', translationWorldMm: [1, 2] },
      { construction: 'normal', signedDistanceMm: '2' },
      { construction: 'normal', signedDistanceMm: 2, translationWorldMm: [0, 0, 0] }]) {
      expect(() => mergeExtrusionDraft(feature, patch(offset))).toThrow()
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('keeps an inactive second offset visible and blocks its callbacks during body picking', () => {
    const input = withOffset('second', { construction: 'translation', translationWorldMm: [2, -7, 4] })
    input.secondDirection!.enabled = false
    expect(find(tree(input), 'Traslación X de dirección 2').props.value).toBe(2)
    const onChange = vi.fn(), root = tree(input, { bodyPicking: true, onChange })
    for (const axis of ['X', 'Y', 'Z']) {
      const control = find(root, `Traslación ${axis} de dirección 2`)
      expect(control.props.disabled).toBe(true)
      control.props.onChange?.({ target: { value: '8' } })
    }
    expect(onChange).not.toHaveBeenCalled()
  })
})
