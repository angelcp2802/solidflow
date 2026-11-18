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

describe('automatic corner controls from explicit solved eligibility', () => {
  const AUTO = 'Redondeo automático de esquinas', RADIUS = 'Radio del redondeo automático'

  it('offers no corner option from required/closed assumptions or a retained declaration alone', () => {
    const rounded: ThinWallDefinition = { ...one, autoCorners: { enabled: true, radius: 3 } }
    for (const required of [false, true]) {
      const html = renderToStaticMarkup(ThinWallPanel({ thinWall: rounded, required, onChange: () => undefined }))
      expect(html).not.toContain(`aria-label="${AUTO}"`)
      expect(html).not.toContain(`aria-label="${RADIUS}"`)
    }
    expect(ThinWallPanel({ existing: true, autoCornersAvailable: true, onChange: () => undefined })).toBeNull()
  })

  it('does not materialize a default option during render and initializes only an explicit enable at 5 mm', () => {
    const before = structuredClone(one), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: one, autoCornersAvailable: true, required: true, onChange })
    expect(control(tree, AUTO).props.disabled).toBe(false)
    expect(renderToStaticMarkup(tree)).not.toContain(`aria-label="${RADIUS}"`)
    expect(onChange).not.toHaveBeenCalled()
    change(tree, AUTO, '', true)
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...one, autoCorners: { enabled: true, radius: 5 } })
    expect(one).toEqual(before)
  })

  it('remembers a disabled radius and re-enables it without changing wall dimensions or side', () => {
    const remembered: ThinWallDefinition = { ...one, autoCorners: { enabled: false, radius: 2.75 } }
    const before = structuredClone(remembered), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: remembered, autoCornersAvailable: true, existing: true, onChange })
    expect(control(tree, 'Operación lámina').props.disabled).toBe(true)
    expect(renderToStaticMarkup(tree)).toContain('class="number-field thin-wall-inactive-radius"')
    expect(control(tree, RADIUS).props.disabled).toBe(false)
    change(tree, AUTO, '', true)
    expect(onChange).toHaveBeenCalledWith({ ...remembered, autoCorners: { enabled: true, radius: 2.75 } })
    const enabled = onChange.mock.calls[0][0] as ThinWallDefinition
    const enabledTree = ThinWallPanel({ thinWall: enabled, autoCornersAvailable: true, existing: true, onChange })
    change(enabledTree, AUTO, '', false)
    expect(onChange).toHaveBeenLastCalledWith(remembered)
    expect(remembered).toEqual(before)
  })

  it.each([one, mid, two])('edits radius independently in the $kind wall', mode => {
    const rounded: ThinWallDefinition = { ...mode, autoCorners: { enabled: true, radius: 3 } }
    const before = structuredClone(rounded), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: rounded, autoCornersAvailable: true, onChange })
    expect(renderToStaticMarkup(tree)).toContain(`aria-label="${RADIUS}"`)
    change(tree, RADIUS, '1.25')
    expect(onChange).toHaveBeenCalledWith({ ...rounded, autoCorners: { enabled: true, radius: 1.25 } })
    expect(rounded).toEqual(before)
  })

  it.each(['', '-2', 'NaN'])('retains a rejected radius draft %s so it can be corrected', value => {
    const rounded: ThinWallDefinition = { ...one, autoCorners: { enabled: true, radius: 3 } }
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: rounded, autoCornersAvailable: true, onChange })
    change(tree, RADIUS, value)
    const next = onChange.mock.calls[0][0] as ThinWallDefinition
    expect(next.autoCorners?.radius).toBe(value === '' ? 0 : Number(value))
    expect(thinWallInputError(next)).not.toBeNull()
    const html = renderToStaticMarkup(ThinWallPanel({ thinWall: next, autoCornersAvailable: true, onChange }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="thin-wall-error"')
    expect(rounded.autoCorners?.radius).toBe(3)
  })

  it('preserves corner configuration through thickness and one-sided reversal', () => {
    const rounded: ThinWallDefinition = { ...one, autoCorners: { enabled: true, radius: 3 } }
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: rounded, autoCornersAvailable: true, onChange })
    change(tree, 'Espesor de pared', '4')
    expect(onChange).toHaveBeenLastCalledWith({ ...rounded, thickness: 4 })
    control(tree, 'Invertir lado de pared').props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith({ ...rounded, reversed: false })
  })

  it('keeps an invalid remembered radius visible as an error and recoverable after off/on', () => {
    const rounded: ThinWallDefinition = { ...one, autoCorners: { enabled: true, radius: 3 } }
    const onChange = vi.fn()
    change(ThinWallPanel({ thinWall: rounded, autoCornersAvailable: true, onChange }), RADIUS, '')
    const invalid = onChange.mock.calls[0][0] as ThinWallDefinition
    change(ThinWallPanel({ thinWall: invalid, autoCornersAvailable: true, onChange }), AUTO, '', false)
    const off = onChange.mock.calls[1][0] as ThinWallDefinition
    expect(off.autoCorners).toEqual({ enabled: false, radius: 0 })
    expect(thinWallInputError(off)).not.toBeNull()
    const offTree = ThinWallPanel({ thinWall: off, autoCornersAvailable: true, onChange })
    expect(renderToStaticMarkup(offTree)).toContain('role="alert"')
    expect(control(offTree, AUTO).props.disabled).toBe(false)
    change(offTree, AUTO, '', true)
    const retry = onChange.mock.calls[2][0] as ThinWallDefinition
    expect(retry.autoCorners).toEqual({ enabled: true, radius: 0 })
    change(ThinWallPanel({ thinWall: retry, autoCornersAvailable: true, onChange }), RADIUS, '2')
    const corrected = onChange.mock.calls[3][0] as ThinWallDefinition
    expect(corrected).toEqual({ ...one, autoCorners: { enabled: true, radius: 2 } })
    expect(thinWallInputError(corrected)).toBeNull()
    expect(rounded.autoCorners?.radius).toBe(3)
  })

  it('guards both corner callbacks while the shared panel is disabled', () => {
    const rounded: ThinWallDefinition = { ...one, autoCorners: { enabled: true, radius: 3 } }
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: rounded, disabled: true, autoCornersAvailable: true, onChange })
    expect(control(tree, AUTO).props.disabled).toBe(true)
    expect(control(tree, RADIUS).props.disabled).toBe(true)
    change(tree, AUTO, '', false); change(tree, RADIUS, '1')
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([true, false])('preserves detached known options through every mode transition with enabled=%s', enabled => {
    const rounded: ThinWallDefinition = { kind: 'one-side', thickness: 2, reversed: true, autoCorners: { enabled, radius: 3 } }
    const before = structuredClone(rounded)
    Object.freeze(rounded.autoCorners); Object.freeze(rounded)
    const midpoint = thinWallModeChange(rounded, 'mid-plane')!
    const twoSides = thinWallModeChange(midpoint, 'two-sides')!
    const oneSide = thinWallModeChange(twoSides, 'one-side')!
    expect(midpoint).toEqual({ kind: 'mid-plane', thickness: 2, autoCorners: { enabled, radius: 3 } })
    expect(twoSides).toEqual({ kind: 'two-sides', firstThickness: 2, secondThickness: 10, autoCorners: { enabled, radius: 3 } })
    expect(oneSide).toEqual({ kind: 'one-side', thickness: 2, reversed: false, autoCorners: { enabled, radius: 3 } })
    expect(midpoint.autoCorners).not.toBe(rounded.autoCorners)
    expect(twoSides.autoCorners).not.toBe(midpoint.autoCorners)
    expect(oneSide.autoCorners).not.toBe(twoSides.autoCorners)
    expect(rounded).toEqual(before)
  })

  it('allows an ineligible retained option to be disabled without offering a new activation', () => {
    const rounded: ThinWallDefinition = { ...one, autoCorners: { enabled: true, radius: 3 } }
    const before = structuredClone(rounded), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: rounded, existing: true, autoCornersAvailable: false,
      allowAutoCornerRecovery: true, onChange })
    expect(control(tree, AUTO).props.disabled).toBe(false)
    change(tree, AUTO, '', true)
    expect(onChange).not.toHaveBeenCalled()
    change(tree, AUTO, '', false)
    expect(onChange).toHaveBeenCalledWith({ ...rounded, autoCorners: { enabled: false, radius: 3 } })
    const off = onChange.mock.calls[0][0] as ThinWallDefinition
    const offTree = ThinWallPanel({ thinWall: off, autoCornersAvailable: false, allowAutoCornerRecovery: true, onChange })
    expect(control(offTree, AUTO).props.disabled).toBe(true)
    expect(renderToStaticMarkup(offTree)).toContain('class="number-field thin-wall-inactive-radius"')
    expect(control(offTree, RADIUS).props.disabled).toBe(false)
    change(offTree, AUTO, '', true)
    expect(onChange).toHaveBeenCalledOnce()
    expect(rounded).toEqual(before)
  })

  it.each([0, -1, NaN, Infinity, 100_001])('corrects remembered invalid radius %s while off and ineligible without reactivation', radius => {
    const invalid: ThinWallDefinition = { ...one, autoCorners: { enabled: false, radius } }
    const before = structuredClone(invalid), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: invalid, autoCornersAvailable: false, allowAutoCornerRecovery: true, onChange })
    expect(control(tree, AUTO).props.disabled).toBe(true)
    expect(control(tree, RADIUS).props.disabled).toBe(false)
    expect(renderToStaticMarkup(tree)).toContain('role="alert"')
    expect(renderToStaticMarkup(tree)).not.toContain('thin-wall-inactive-radius')
    expect(thinWallInputError(invalid)).not.toBeNull()
    change(tree, RADIUS, '2.5')
    const corrected = onChange.mock.calls[0][0] as ThinWallDefinition
    expect(corrected).toEqual({ ...one, autoCorners: { enabled: false, radius: 2.5 } })
    expect(thinWallInputError(corrected)).toBeNull()
    expect(invalid).toEqual(before)
  })

  it('keeps an off radius mounted across the first valid digit and a complete decimal correction', () => {
    const invalid: ThinWallDefinition = { ...one, autoCorners: { enabled: false, radius: 0 } }
    const before = structuredClone(invalid), onChange = vi.fn()
    let draft: ThinWallDefinition = invalid
    for (const value of ['2', '2.5']) {
      const tree = ThinWallPanel({ thinWall: draft, autoCornersAvailable: false, allowAutoCornerRecovery: true, onChange })
      change(tree, RADIUS, value)
      draft = onChange.mock.lastCall![0] as ThinWallDefinition
      const nextTree = ThinWallPanel({ thinWall: draft, autoCornersAvailable: false, allowAutoCornerRecovery: true, onChange })
      expect(control(nextTree, RADIUS).props.disabled).toBe(false)
      expect(control(nextTree, RADIUS).props).not.toHaveProperty('aria-hidden')
      const html = renderToStaticMarkup(nextTree)
      const label = html.match(/<label[^>]*for="thin-wall-auto-corner-radius"[^>]*>/)?.[0]
      expect(label).toContain('thin-wall-inactive-radius')
      expect(label).not.toContain('aria-hidden')
      expect(label).not.toContain(' hidden')
      expect(draft.autoCorners).toEqual({ enabled: false, radius: Number(value) })
      expect(thinWallInputError(draft)).toBeNull()
    }
    expect(invalid).toEqual(before)
  })

  it('does not offer recovery on a new ineligible wall without a retained corner declaration', () => {
    const onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: one, autoCornersAvailable: false, allowAutoCornerRecovery: true, onChange })
    expect(renderToStaticMarkup(tree)).not.toContain(`aria-label="${AUTO}"`)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps stale-prefix recovery controls disabled, including retained off invalid radius', () => {
    const invalid: ThinWallDefinition = { ...one, autoCorners: { enabled: false, radius: 0 } }
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: invalid, autoCornersAvailable: false,
      allowAutoCornerRecovery: true, disabled: true, onChange })
    expect(control(tree, AUTO).props.disabled).toBe(true)
    expect(control(tree, RADIUS).props.disabled).toBe(true)
    change(tree, AUTO, '', false); change(tree, AUTO, '', true); change(tree, RADIUS, '2')
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('end cap controls from explicit solved eligibility', () => {
  const CAPS = 'Tapas de extremos', CAP_T = 'Espesor de tapas'

  it('initializes an explicit cap activation at 1 mm without materializing settings during render', () => {
    const onChange = vi.fn(), before = structuredClone(one)
    const tree = ThinWallPanel({ thinWall: one, endCapsAvailable: true, onChange })
    expect(control(tree, CAPS).props.disabled).toBe(false)
    expect(renderToStaticMarkup(tree)).not.toContain(`aria-label="${CAP_T}"`)
    expect(onChange).not.toHaveBeenCalled()
    change(tree, CAPS, '', true)
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...one, endCaps: { enabled: true, thickness: 1 } })
    expect(one).toEqual(before)
  })

  it('does not infer cap eligibility from required state or a retained declaration alone', () => {
    const capped: ThinWallDefinition = { ...one, endCaps: { enabled: true, thickness: 1 } }
    for (const required of [false, true]) {
      const html = renderToStaticMarkup(ThinWallPanel({ thinWall: capped, required, onChange: () => undefined }))
      expect(html).not.toContain(`aria-label="${CAPS}"`)
      expect(html).not.toContain(`aria-label="${CAP_T}"`)
    }
    expect(ThinWallPanel({ existing: true, endCapsAvailable: true, onChange: () => undefined })).toBeNull()
  })

  it.each([one, mid, two])('edits cap thickness independently in the $kind wall', mode => {
    const capped: ThinWallDefinition = { ...mode, endCaps: { enabled: true, thickness: 1 } }
    const before = structuredClone(capped), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: capped, endCapsAvailable: true, onChange })
    change(tree, CAP_T, '1.5')
    expect(onChange).toHaveBeenCalledWith({ ...capped, endCaps: { enabled: true, thickness: 1.5 } })
    expect(capped).toEqual(before)
  })

  it('retains the declared cap thickness through OFF/ON and leaves other options unchanged', () => {
    const capped: ThinWallDefinition = { ...one, autoCorners: { enabled: false, radius: 3 }, endCaps: { enabled: true, thickness: 1.5 } }
    const before = structuredClone(capped), onChange = vi.fn()
    change(ThinWallPanel({ thinWall: capped, endCapsAvailable: true, existing: true, onChange }), CAPS, '', false)
    const off = onChange.mock.lastCall![0] as ThinWallDefinition
    expect(off).toEqual({ ...capped, endCaps: { enabled: false, thickness: 1.5 } })
    const offTree = ThinWallPanel({ thinWall: off, endCapsAvailable: true, existing: true, onChange })
    expect(renderToStaticMarkup(offTree)).toContain('class="number-field thin-wall-inactive-cap-thickness"')
    change(offTree, CAPS, '', true)
    expect(onChange).toHaveBeenLastCalledWith(capped)
    expect(capped).toEqual(before)
  })

  it.each(['', '-2', 'NaN', '100001'])('keeps an invalid cap thickness draft %s editable and rejected', value => {
    const capped: ThinWallDefinition = { ...one, endCaps: { enabled: true, thickness: 1 } }
    const onChange = vi.fn()
    change(ThinWallPanel({ thinWall: capped, endCapsAvailable: true, onChange }), CAP_T, value)
    const invalid = onChange.mock.lastCall![0] as ThinWallDefinition
    expect(invalid.endCaps?.thickness).toBe(value === '' ? 0 : Number(value))
    expect(thinWallInputError(invalid)).not.toBeNull()
    const tree = ThinWallPanel({ thinWall: invalid, endCapsAvailable: true, onChange })
    expect(control(tree, CAP_T).props.disabled).toBe(false)
    expect(renderToStaticMarkup(tree)).toContain('role="alert"')
    expect(renderToStaticMarkup(tree)).toContain('aria-describedby="thin-wall-error"')
    expect(capped.endCaps?.thickness).toBe(1)
  })

  it.each([true, false])('preserves detached cap and corner declarations through wall modes with cap enabled=%s', enabled => {
    const capped: ThinWallDefinition = { ...one, autoCorners: { enabled: false, radius: 3 }, endCaps: { enabled, thickness: 1.5 } }
    const before = structuredClone(capped)
    Object.freeze(capped.endCaps); Object.freeze(capped.autoCorners); Object.freeze(capped)
    let previous: ThinWallDefinition = capped
    for (const mode of ['mid-plane', 'two-sides', 'one-side']) {
      const next: ThinWallDefinition = thinWallModeChange(previous, mode)!
      expect(next.endCaps).toEqual(capped.endCaps)
      expect(next.autoCorners).toEqual(capped.autoCorners)
      expect(next.endCaps).not.toBe(previous.endCaps)
      expect(next.autoCorners).not.toBe(previous.autoCorners)
      previous = next
    }
    expect(capped).toEqual(before)
  })

  it('keeps caps through thickness and side edits without changing their declaration', () => {
    const capped: ThinWallDefinition = { ...one, endCaps: { enabled: true, thickness: 1.5 } }
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: capped, endCapsAvailable: true, onChange })
    change(tree, 'Espesor de pared', '4')
    expect(onChange).toHaveBeenLastCalledWith({ ...capped, thickness: 4 })
    control(tree, 'Invertir lado de pared').props.onClick?.()
    expect(onChange).toHaveBeenLastCalledWith({ ...capped, reversed: false })
  })

  it('allows only explicit disabling of an active retained setting when the context becomes ineligible', () => {
    const capped: ThinWallDefinition = { ...one, endCaps: { enabled: true, thickness: 1.5 } }
    const before = structuredClone(capped), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: capped, endCapsAvailable: false, allowEndCapRecovery: true, onChange })
    expect(control(tree, CAPS).props.disabled).toBe(false)
    expect(control(tree, CAP_T).props.disabled).toBe(true)
    change(tree, CAP_T, '2'); change(tree, CAPS, '', true)
    expect(onChange).not.toHaveBeenCalled()
    change(tree, CAPS, '', false)
    const off = onChange.mock.lastCall![0] as ThinWallDefinition
    expect(off).toEqual({ ...capped, endCaps: { enabled: false, thickness: 1.5 } })
    const offTree = ThinWallPanel({ thinWall: off, endCapsAvailable: false, allowEndCapRecovery: true, onChange })
    expect(control(offTree, CAPS).props.disabled).toBe(true)
    change(offTree, CAPS, '', true)
    expect(onChange).toHaveBeenCalledOnce()
    expect(capped).toEqual(before)
  })

  it.each([0, -1, 1e-7, NaN, Infinity, 100_001])('corrects retained invalid cap thickness %s while OFF and ineligible', thickness => {
    const invalid: ThinWallDefinition = { ...one, endCaps: { enabled: false, thickness } }
    const before = structuredClone(invalid), onChange = vi.fn()
    const tree = ThinWallPanel({ thinWall: invalid, allowEndCapRecovery: true, onChange })
    expect(control(tree, CAPS).props.disabled).toBe(true)
    expect(control(tree, CAP_T).props.disabled).toBe(false)
    expect(renderToStaticMarkup(tree)).not.toContain('thin-wall-inactive-cap-thickness')
    expect(thinWallInputError(invalid)).not.toBeNull()
    change(tree, CAP_T, '1.5')
    const corrected = onChange.mock.lastCall![0] as ThinWallDefinition
    expect(corrected).toEqual({ ...one, endCaps: { enabled: false, thickness: 1.5 } })
    expect(thinWallInputError(corrected)).toBeNull()
    expect(invalid).toEqual(before)
  })

  it('keeps the inactive cap field mounted across the first valid digit and decimal correction', () => {
    const invalid: ThinWallDefinition = { ...one, endCaps: { enabled: false, thickness: 0 } }
    const onChange = vi.fn()
    let draft: ThinWallDefinition = invalid
    for (const value of ['1', '1.5']) {
      change(ThinWallPanel({ thinWall: draft, allowEndCapRecovery: true, onChange }), CAP_T, value)
      draft = onChange.mock.lastCall![0] as ThinWallDefinition
      const nextTree = ThinWallPanel({ thinWall: draft, allowEndCapRecovery: true, onChange })
      expect(control(nextTree, CAP_T).props.disabled).toBe(false)
      expect(control(nextTree, CAP_T).props).not.toHaveProperty('aria-hidden')
      const label = renderToStaticMarkup(nextTree).match(/<label[^>]*for="thin-wall-cap-thickness"[^>]*>/)?.[0]
      expect(label).toContain('thin-wall-inactive-cap-thickness')
      expect(label).not.toContain('aria-hidden')
      expect(label).not.toContain(' hidden')
      expect(draft.endCaps).toEqual({ enabled: false, thickness: Number(value) })
    }
    expect(invalid.endCaps?.thickness).toBe(0)
  })

  it.each([true, false])('guards cap recovery callbacks while the prefix is stale, enabled=%s', enabled => {
    const invalid: ThinWallDefinition = { ...one, endCaps: { enabled, thickness: 0 } }
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: invalid, endCapsAvailable: true, allowEndCapRecovery: true, disabled: true, onChange })
    expect(control(tree, CAPS).props.disabled).toBe(true)
    expect(control(tree, CAP_T).props.disabled).toBe(true)
    change(tree, CAPS, '', false); change(tree, CAPS, '', true); change(tree, CAP_T, '1.5')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not offer recovery without a retained setting or erase the existing wall kind', () => {
    const onChange = vi.fn(), tree = ThinWallPanel({ thinWall: one, existing: true, allowEndCapRecovery: true, onChange })
    expect(renderToStaticMarkup(tree)).not.toContain(`aria-label="${CAPS}"`)
    expect(control(tree, 'Operación lámina').props.disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})
