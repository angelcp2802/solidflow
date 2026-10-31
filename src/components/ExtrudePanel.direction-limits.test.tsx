import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ExtrudeEndCondition, ExtrudeFeature, PickableBody } from '../cad/kernel.types'
import ExtrudePanel, { extrudeSideModePatch } from './ExtrudePanel'
import { BodyFeaturePanel } from './BodyManagementPanel'
import ThinWallPanel from './ThinWallPanel'
import { mergeExtrusionDraft, extrusionDirectionInputError } from './extrusionEditorDraft'

// Original declarations exercise editor contracts only; no native geometry or pointer result is fabricated.
const surface = (planeId: string): ExtrudeEndCondition => ({ kind: 'upToSurface', target: { kind: 'plane', planeId } })
const feature: ExtrudeFeature = { id: 'boss', name: 'Original independent limits', suppressed: false, type: 'extrude', sketchId: 'profile',
  depth: -13, symmetric: false, endCondition: surface('top'), secondDirection: { enabled: true, depth: 7, endCondition: surface('bottom') },
  bodyOperation: { mode: 'new', bodyId: 'new-body' }, thinWall: { kind: 'one-side', thickness: 2, reversed: false } }
interface ControlProps {
  'aria-label'?: string; children?: ReactNode; value?: string | number; disabled?: boolean;
  onChange?: (event: { target: { value: string; checked: boolean } }) => void; onClick?: () => void;
}
function find(root: ReactNode, label: string): ReactElement<ControlProps> {
  let result: ReactElement<ControlProps> | undefined
  const visit = (node: ReactNode) => Children.forEach(node, child => {
    if (!isValidElement<ControlProps>(child)) return
    const caption = child.type === 'button' ? Children.toArray(child.props.children).filter(item => typeof item === 'string').join('').trim() : ''
    if (child.props['aria-label'] === label || caption === label) result = child
    else if (child.props.children) visit(child.props.children)
  })
  visit(root)
  if (!result) throw Error('Missing limit control: ' + label)
  return result
}
function tree(input: ExtrudeFeature = feature, callbacks: Partial<ComponentProps<typeof ExtrudePanel>> = {}) {
  return ExtrudePanel({ feature: input, features: [], planes: [], baseFeatureId: 'source-body', preferredTarget: { kind: 'principal', plane: 'XY' },
    picking: false, loading: false, canPickFace: true, onChange: vi.fn(), onTarget: vi.fn(), onPickFace: vi.fn(), ...callbacks })
}
function change(root: ReactNode, label: string, value: string, checked = false) {
  find(root, label).props.onChange?.({ target: { value, checked } })
}

describe('independent automatic linear end controls', () => {
  it('offers a separate second selector with no midpoint or both-senses option, after its toggle and before the wall', () => {
    const root = tree(), selector = find(root, 'Condición final de dirección 2')
    const html = renderToStaticMarkup(root), options = renderToStaticMarkup(selector)
    expect(selector.props.value).toBe('upToSurface')
    for (const mode of ['blind', 'throughAll', 'untilNext', 'upToSurface']) expect(options).toContain(`value="${mode}"`)
    for (const mode of ['mid', 'throughAllBoth', 'upToVertex', 'upToBody', 'offsetFromSurface']) expect(options).not.toContain(`value="${mode}"`)
    expect(html.indexOf('aria-label="Dirección 2"')).toBeLessThan(html.indexOf('aria-label="Condición final de dirección 2"'))
    expect(html.indexOf('aria-label="Superficie de destino de dirección 2"')).toBeLessThan(html.indexOf('aria-label="Operación lámina"'))
    expect(find(root, 'Dirección 2').props.disabled).toBe(false)
    expect(extrusionDirectionInputError(feature)).toBeNull()
  })

  it.each(['first', 'second'] as const)('changes only the %s condition and explicitly clears only that optional end on Blind', side => {
    const before = structuredClone(feature)
    for (const mode of ['blind', 'throughAll', 'untilNext', 'upToSurface']) {
      const next = mergeExtrusionDraft(feature, extrudeSideModePatch(feature, side, mode, 'source-body', { kind: 'principal', plane: 'XZ' })!)
      expect(next.depth).toBe(-13); expect(next.secondDirection?.depth).toBe(7)
      expect(next).toHaveProperty('bodyOperation', feature.bodyOperation); expect(next.thinWall).toEqual(feature.thinWall)
      if (side === 'first') {
        expect(next.secondDirection).toEqual(feature.secondDirection)
        if (mode === 'blind') expect(next).not.toHaveProperty('endCondition')
      } else {
        expect(next.endCondition).toEqual(feature.endCondition)
        if (mode === 'blind') expect(next.secondDirection).not.toHaveProperty('endCondition')
      }
    }
    expect(extrudeSideModePatch(feature, 'second', 'mid', 'source-body', { kind: 'principal', plane: 'XY' })).toBeNull()
    expect(extrudeSideModePatch(feature, 'second', 'throughAllBoth', 'source-body', { kind: 'principal', plane: 'XY' })).toBeNull()
    expect(feature).toEqual(before)
  })

  it('retains second target/condition through OFF/ON and allows an explicit correction while OFF', () => {
    const onChange = vi.fn(), onTarget = vi.fn(), before = structuredClone(feature)
    change(tree(feature, { onChange }), 'Dirección 2', '', false)
    const off = mergeExtrusionDraft(feature, onChange.mock.lastCall![0])
    expect(off.secondDirection).toEqual({ ...feature.secondDirection, enabled: false })
    change(tree(off, { onTarget }), 'Superficie de destino de dirección 2', 'principal:YZ')
    expect(onTarget).toHaveBeenCalledExactlyOnceWith({ kind: 'principal', plane: 'YZ' }, 'second')
    change(tree(off, { onChange }), 'Dirección 2', '', true)
    expect(mergeExtrusionDraft(off, onChange.mock.lastCall![0])).toEqual(feature)
    expect(feature).toEqual(before)
  })

  it('labels and dispatches each face/plane selector to its own side without changing the global sign', () => {
    const onPickFace = vi.fn(), onTarget = vi.fn(), onChange = vi.fn(), root = tree(feature, { onPickFace, onTarget, onChange })
    find(root, 'Seleccionar cara de destino').props.onClick?.()
    find(root, 'Seleccionar cara de destino de dirección 2').props.onClick?.()
    expect(onPickFace.mock.calls).toEqual([['first'], ['second']])
    change(root, 'Superficie de destino', 'principal:XZ')
    change(root, 'Superficie de destino de dirección 2', 'plane:bottom-new')
    expect(onTarget.mock.calls).toEqual([[{ kind: 'principal', plane: 'XZ' }, 'first'], [{ kind: 'plane', planeId: 'bottom-new' }, 'second']])
    expect(onChange).not.toHaveBeenCalled(); expect(feature.depth).toBe(-13)
    const picking = tree(feature, { picking: true, pickingSide: 'second', onPickFace })
    expect(find(picking, 'Condición final').props.disabled).toBe(true)
    expect(find(picking, 'Condición final de dirección 2').props.disabled).toBe(true)
    find(picking, 'Volver a vista previa').props.onClick?.()
    expect(onPickFace).toHaveBeenLastCalledWith('second')
  })

  it.each([{ loading: true }, { directionDisabled: true }])('blocks mode, target, depth, reverse and face callbacks when global state is unavailable %j', flags => {
    const onChange = vi.fn(), onTarget = vi.fn(), onPickFace = vi.fn(), root = tree(feature, { ...flags, onChange, onTarget, onPickFace })
    for (const label of ['Condición final', 'Condición final de dirección 2', 'Superficie de destino', 'Superficie de destino de dirección 2', 'Profundidad', 'Profundidad de dirección 2']) {
      expect(find(root, label).props.disabled).toBe(true)
      change(root, label, label.startsWith('Superficie') ? 'principal:XY' : label.startsWith('Profundidad') ? '2' : 'blind')
    }
    find(root, 'Invertir dirección').props.onClick?.(); find(root, 'Seleccionar cara de destino de dirección 2').props.onClick?.()
    expect(onChange).not.toHaveBeenCalled(); expect(onTarget).not.toHaveBeenCalled(); expect(onPickFace).not.toHaveBeenCalled()
  })

  it('preserves D1 draft editing during the body picker while D2 and facial picking remain blocked', () => {
    const owner = { bodyId: 'owner', sourceFeatureId: 'owner-state' }
    const input: ExtrudeFeature = { ...feature, type: 'cut', bodyScope: [owner] }
    const onChange = vi.fn(), onTarget = vi.fn(), onPickFace = vi.fn(), root = tree(input, { bodyPicking: true, onChange, onTarget, onPickFace })
    for (const label of ['Condición final', 'Profundidad', 'Superficie de destino']) expect(find(root, label).props.disabled).toBe(false)
    for (const label of ['Dirección 2', 'Condición final de dirección 2', 'Profundidad de dirección 2', 'Superficie de destino de dirección 2']) expect(find(root, label).props.disabled).toBe(true)
    change(root, 'Profundidad', '-11')
    const changed = mergeExtrusionDraft(input, onChange.mock.lastCall![0])
    expect(changed).toMatchObject({ depth: -11, bodyScope: [owner], secondDirection: input.secondDirection, endCondition: input.endCondition })
    change(root, 'Condición final', 'blind')
    expect(mergeExtrusionDraft(input, onChange.mock.lastCall![0])).toMatchObject({ bodyScope: [owner], secondDirection: input.secondDirection })
    change(root, 'Superficie de destino', 'principal:XZ')
    expect(onTarget).toHaveBeenCalledExactlyOnceWith({ kind: 'principal', plane: 'XZ' }, 'first')
    change(root, 'Condición final de dirección 2', 'blind'); change(root, 'Profundidad de dirección 2', '9')
    expect(onChange).toHaveBeenCalledTimes(2)
    find(root, 'Seleccionar cara de destino').props.onClick?.()
    expect(onPickFace).not.toHaveBeenCalled()
  })

  it('keeps automatic inactive depth correction mounted across the first valid digit and the decimal', () => {
    let draft: ExtrudeFeature = { ...feature, secondDirection: { ...feature.secondDirection!, enabled: false, depth: 0 } }
    const onChange = vi.fn()
    expect(extrusionDirectionInputError(draft)).not.toBeNull()
    for (const value of ['2', '2.5']) {
      change(tree(draft, { onChange }), 'Profundidad de dirección 2', value)
      draft = mergeExtrusionDraft(draft, onChange.mock.lastCall![0])
      expect(draft.secondDirection).toEqual({ ...feature.secondDirection, enabled: false, depth: Number(value) })
      expect(find(tree(draft), 'Profundidad de dirección 2').props.value).toBe(Number(value))
      expect(renderToStaticMarkup(tree(draft))).toContain('extrude-inactive-second-depth')
      expect(extrusionDirectionInputError(draft)).toBeNull()
    }
  })

  it('allows cap recovery but blocks new caps while either active branch is automatic', () => {
    const section = (node: ReactNode): ReactElement<ComponentProps<typeof ThinWallPanel>> => {
      const children = Children.toArray((node as ReactElement<{ children: ReactNode }>).props.children)
      return children.find(item => isValidElement(item) && item.type === ThinWallPanel) as ReactElement<ComponentProps<typeof ThinWallPanel>>
    }
    for (const input of [feature, { ...feature, endCondition: undefined }]) {
      const wall = section(tree(input, { endCapsAvailable: true }))
      expect(wall.props.endCapsAvailable).toBe(false); expect(wall.props.allowEndCapRecovery).toBe(true)
    }
    const off: ExtrudeFeature = { ...feature, endCondition: undefined, secondDirection: { ...feature.secondDirection!, enabled: false } }
    expect(section(tree(off, { endCapsAvailable: true })).props.endCapsAvailable).toBe(true)
  })
})

describe('separate exact new-body limit selectors', () => {
  const body = (id: string): PickableBody => ({ ref: { bodyId: id, sourceFeatureId: `source-${id}` }, createdByFeatureId: `creator-${id}`,
    name: id, vertices: [], normals: [], triangles: [], edgeLines: [], faces: [], edges: [], volume: 1, bounds: { min: [0, 0, 0], max: [1, 1, 1] } })
  it.each([true, false])('changes only the second owned limit, retaining enabled=%s and an invalid draft length', enabled => {
    const a = body('A'), b = body('B'), onFeature = vi.fn()
    const input: ExtrudeFeature = { ...feature, endCondition: { kind: 'untilNext', baseFeatureId: a.ref.sourceFeatureId, baseBody: a.ref },
      secondDirection: { enabled, depth: 0, endCondition: { kind: 'throughAll', bothDirections: false, baseFeatureId: a.ref.sourceFeatureId, baseBody: a.ref } } }
    const before = structuredClone(input), root = BodyFeaturePanel({ feature: input, outputBodyId: 'new-body', existing: false,
      bodies: [a, b], selection: [], picking: false, onPicking: vi.fn(), onSelection: vi.fn(), onFeature })
    change(root, 'Cuerpo límite de dirección 2', JSON.stringify([b.ref.bodyId, b.ref.sourceFeatureId]))
    expect(onFeature).toHaveBeenCalledOnce()
    const next = onFeature.mock.lastCall![0] as ExtrudeFeature
    expect(next.endCondition).toEqual(input.endCondition); expect(next).toHaveProperty('bodyOperation', input.bodyOperation)
    expect(next.secondDirection).toEqual({ ...input.secondDirection, endCondition: { kind: 'throughAll', bothDirections: false, baseFeatureId: b.ref.sourceFeatureId, baseBody: b.ref } })
    expect(input).toEqual(before)
  })
})
