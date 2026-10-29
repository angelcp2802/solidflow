import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ThinWallDefinition } from '../cad/kernel.types'
import ThinWallPanel, { thinWallInputError, thinWallModeChange } from './ThinWallPanel'

// Original symbolic thickness declarations; these tests exercise controls, not native offsets.
const one: ThinWallDefinition = { kind: 'one-side', thickness: 3, reversed: true }
const mid: ThinWallDefinition = { kind: 'mid-plane', thickness: 6 }
const two: ThinWallDefinition = { kind: 'two-sides', firstThickness: 2, secondThickness: 5 }
interface ControlProps {
  'aria-label'?: string
  children?: ReactNode
  onClick?: () => void
  onChange?: (event: { target: { value: string; checked: boolean } }) => void
  disabled?: boolean
}
function control(root: ReactNode, label: string): ReactElement<ControlProps> {
  let found: ReactElement<ControlProps> | undefined
  const visit = (node: ReactNode) => {
    Children.forEach(node, child => {
      if (!isValidElement<ControlProps>(child)) return
      if (child.props['aria-label'] === label) found = child
      else if (child.props.children) visit(child.props.children)
    })
  }
  visit(root)
  if (!found) throw Error('Missing thin-wall control: ' + label)
  return found
}
const change = (tree: ReactNode, label: string, value: string, checked = false) =>
  control(tree, label).props.onChange?.({ target: { value, checked } })

describe('shared thin-wall property section', () => {
  it('offers a new operation toggle without materializing a wall or changing a draft at render time', () => {
    const onChange = vi.fn(), tree = ThinWallPanel({ onChange }), html = renderToStaticMarkup(tree)
    expect(html).toContain('aria-label="Operación lámina"')
    expect(html).not.toContain('checked=""')
    expect(html).not.toContain('aria-label="Tipo de pared"')
    expect(html).not.toContain('role="alert"')
    expect(onChange).not.toHaveBeenCalled()
    change(tree, 'Operación lámina', '', true)
    expect(onChange).toHaveBeenCalledWith({ kind: 'one-side', thickness: 10, reversed: false })
  })

  it('removes the optional wall only by an explicit new-operation toggle and preserves the supplied declaration', () => {
    const before = structuredClone(one), onChange = vi.fn(), tree = ThinWallPanel({ thinWall: one, onChange })
    change(tree, 'Operación lámina', '', false)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(one).toEqual(before)
  })

  it('does not offer thin-wall conversion while editing an existing regular operation', () => {
    const onChange = vi.fn()
    expect(ThinWallPanel({ existing: true, onChange })).toBeNull()
    expect(ThinWallPanel({ existing: true, disabled: true, onChange })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('retains the existing thin operation kind while permitting parameter and mode editing', () => {
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: one, existing: true, onChange })
    expect(control(tree, 'Operación lámina').props.disabled).toBe(true)
    expect(control(tree, 'Tipo de pared').props.disabled).toBe(false)
    expect(control(tree, 'Espesor de pared').props.disabled).toBe(false)
    change(tree, 'Operación lámina', '', false)
    expect(onChange).not.toHaveBeenCalled()
    change(tree, 'Espesor de pared', '4.5')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'one-side', thickness: 4.5, reversed: true })
    change(tree, 'Tipo de pared', 'mid-plane')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'mid-plane', thickness: 3 })
  })

  it('locks the required open-profile toggle while keeping its wall parameters editable', () => {
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: one, required: true, onChange })
    expect(control(tree, 'Operación lámina').props.disabled).toBe(true)
    expect(renderToStaticMarkup(tree)).toContain('Un perfil abierto requiere una operación lámina.')
    change(tree, 'Operación lámina', '', false)
    expect(onChange).not.toHaveBeenCalled()
    change(tree, 'Espesor de pared', '2.5')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'one-side', thickness: 2.5, reversed: true })
    expect(ThinWallPanel({ existing: true, required: true, onChange })).toBeNull()
  })

  it.each([one, mid, two])('renders the $kind mode with the correct fields and independently enabled side reversal', wall => {
    const tree = ThinWallPanel({ thinWall: wall, onChange: () => undefined }), html = renderToStaticMarkup(tree)
    expect(html).toContain('value="one-side"')
    expect(html).toContain('Una dirección')
    expect(html).toContain('Plano medio')
    expect(html).toContain('Dos direcciones')
    expect(control(tree, 'Invertir lado de pared').props.disabled).toBe(wall.kind !== 'one-side')
    if (wall.kind === 'two-sides') {
      expect(html).toContain('aria-label="Espesor 1"')
      expect(html).toContain('aria-label="Espesor 2"')
      expect(html).not.toContain('aria-label="Espesor de pared"')
    } else {
      expect(html).toContain('aria-label="Espesor de pared"')
      expect(html).not.toContain('aria-label="Espesor 2"')
    }
    expect(html).not.toContain('role="alert"')
  })

  it('reverses only one-side walls without changing thickness or retaining reversal in symmetric modes', () => {
    const onChange = vi.fn(), before = structuredClone(one)
    control(ThinWallPanel({ thinWall: one, onChange }), 'Invertir lado de pared').props.onClick?.()
    expect(onChange).toHaveBeenCalledWith({ kind: 'one-side', thickness: 3, reversed: false })
    onChange.mockClear()
    for (const wall of [mid, two]) control(ThinWallPanel({ thinWall: wall, onChange }), 'Invertir lado de pared').props.onClick?.()
    expect(onChange).not.toHaveBeenCalled()
    expect(one).toEqual(before)
  })

  it('edits either thickness independently and keeps invalid draft values available for correction', () => {
    const onChange = vi.fn(), before = structuredClone(two), tree = ThinWallPanel({ thinWall: two, onChange })
    change(tree, 'Espesor 1', '7.25')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'two-sides', firstThickness: 7.25, secondThickness: 5 })
    change(tree, 'Espesor 2', '-2')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'two-sides', firstThickness: 2, secondThickness: -2 })
    change(tree, 'Espesor 1', '')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'two-sides', firstThickness: 0, secondThickness: 5 })
    expect(two).toEqual(before)
  })

  it.each([one, mid, two])('guards every callback when the $kind panel is disabled', wall => {
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: wall, disabled: true, onChange })
    change(tree, 'Operación lámina', '', false)
    change(tree, 'Tipo de pared', 'mid-plane')
    control(tree, 'Invertir lado de pared').props.onClick?.()
    if (wall.kind === 'two-sides') { change(tree, 'Espesor 1', '12'); change(tree, 'Espesor 2', '14') }
    else change(tree, 'Espesor de pared', '12')
    expect(onChange).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(tree)).toContain('aria-disabled="true"')
  })

  it('does not enable a new wall through a stale disabled checkbox callback', () => {
    const onChange = vi.fn(), tree = ThinWallPanel({ disabled: true, onChange })
    change(tree, 'Operación lámina', '', true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores unknown and already selected wall modes', () => {
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: one, onChange })
    change(tree, 'Tipo de pared', 'unavailable-mode')
    change(tree, 'Tipo de pared', 'one-side')
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'one-side', thickness: 0, reversed: false },
    { kind: 'one-side', thickness: 1e-7, reversed: false },
    { kind: 'mid-plane', thickness: Infinity },
    { kind: 'two-sides', firstThickness: 60_000, secondThickness: 50_000 },
  ] satisfies ThinWallDefinition[])('shows the shared validation error for $kind without correcting or clamping its values', wall => {
    const before = structuredClone(wall), onChange = vi.fn(), tree = ThinWallPanel({ thinWall: wall, onChange })
    const html = renderToStaticMarkup(tree)
    expect(thinWallInputError(wall)).not.toBeNull()
    expect(html).toContain('id="thin-wall-error"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="thin-wall-error"')
    expect(onChange).not.toHaveBeenCalled()
    expect(wall).toEqual(before)
  })

  it('accepts absence, the shared positive tolerance boundary and the exact maximum total', () => {
    expect(thinWallInputError()).toBeNull()
    expect(thinWallInputError({ kind: 'one-side', thickness: 1.0001e-7, reversed: false })).toBeNull()
    expect(thinWallInputError({ kind: 'two-sides', firstThickness: 60_000, secondThickness: 40_000 })).toBeNull()
    expect(thinWallInputError({ kind: 'mid-plane', thickness: 100_000 })).toBeNull()
  })
})

describe('explicit thin-wall mode transitions', () => {
  it('retains the first thickness and uses a visible deterministic 10 mm second side without hidden draft state', () => {
    const before = structuredClone(one)
    expect(thinWallModeChange(one, 'mid-plane')).toEqual({ kind: 'mid-plane', thickness: 3 })
    const next = thinWallModeChange(one, 'two-sides')
    expect(next).toEqual({ kind: 'two-sides', firstThickness: 3, secondThickness: 10 })
    expect(thinWallModeChange(two, 'mid-plane')).toEqual({ kind: 'mid-plane', thickness: 2 })
    expect(thinWallModeChange(two, 'one-side')).toEqual({ kind: 'one-side', thickness: 2, reversed: false })
    expect(thinWallModeChange(mid, 'one-side')).toEqual({ kind: 'one-side', thickness: 6, reversed: false })
    expect(thinWallModeChange(one, 'one-side')).toBe(one)
    expect(thinWallModeChange(one, 'unknown')).toBeNull()
    expect(one).toEqual(before)
  })

  it('keeps a rejected first thickness instead of silently substituting a valid value during mode changes', () => {
    const invalid: ThinWallDefinition = { kind: 'mid-plane', thickness: -2 }
    expect(thinWallModeChange(invalid, 'one-side')).toEqual({ kind: 'one-side', thickness: -2, reversed: false })
    expect(thinWallModeChange(invalid, 'two-sides')).toEqual({ kind: 'two-sides', firstThickness: -2, secondThickness: 10 })
  })
})
