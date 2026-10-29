import { describe, expect, it } from 'vitest'
import type { Feature, SketchVisual, ThinWallDefinition } from '../cad/kernel.types'
import { defaultThinWallDefinition, isThinWallOperation, mergeThinWallEditorDraft, thinWallRequiredByProfile, withRequiredThinWall, type ThinWallOperation } from './thinWallEditorDraft'

// Original declaration-only operations. No topology or native solve is fabricated by these tests.
const target = { bodyId: 'original-body', sourceFeatureId: 'original-state' }
const wall: ThinWallDefinition = { kind: 'one-side', thickness: 2.5, reversed: true }
const operations: ThinWallOperation[] = [
  { id: 'extrude', name: 'Original boss', type: 'extrude', suppressed: false, sketchId: 'profile', depth: -12, symmetric: false,
    bodyOperation: { mode: 'merge', target }, endCondition: { kind: 'untilNext', baseFeatureId: target.sourceFeatureId } },
  { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: 'profile', depth: 9, symmetric: true,
    bodyScope: [target], endCondition: { kind: 'throughAll', baseFeatureId: target.sourceFeatureId, bothDirections: true } },
  { id: 'revolve', name: 'Original turn', type: 'revolve', suppressed: false, sketchId: 'profile', angle: 160, reversed: true,
    axis: { kind: 'external-sketch-line', sketchId: 'axis-source', entityId: 'axis-line' }, extent: { kind: 'two-directions', secondAngle: 40 },
    bodyOperation: { mode: 'new', bodyId: 'turn-body' } },
  { id: 'revolvedCut', name: 'Original groove', type: 'revolvedCut', suppressed: false, sketchId: 'profile', angle: 80,
    axis: { kind: 'principal-axis', axis: 'Y' }, extent: { kind: 'mid-plane' }, bodyScope: [target] },
]
const witness = (topology?: SketchVisual['profileTopology']): SketchVisual => ({ id: 'profile', lines: [], constructionLines: [],
  ...(topology ? { profileTopology: topology } : {}) })

describe('thin-wall editor draft isolation', () => {
  it.each(operations)('adds, edits and clears a new $type wall without changing its profile, body or extent contract', operation => {
    const before = structuredClone(operation)
    const enabled = mergeThinWallEditorDraft(operation, { thinWall: wall })
    expect(enabled).toEqual({ ...operation, thinWall: wall })
    const changed = mergeThinWallEditorDraft(enabled, { thinWall: { kind: 'two-sides', firstThickness: 3, secondThickness: 1 } })
    expect(changed.thinWall).toEqual({ kind: 'two-sides', firstThickness: 3, secondThickness: 1 })
    const cleared = mergeThinWallEditorDraft(changed, { thinWall: undefined })
    expect(cleared).not.toHaveProperty('thinWall')
    expect(cleared).toEqual(before)
    expect(operation).toEqual(before)
    expect(enabled.thinWall).toEqual(wall)
  })

  it.each(operations)('keeps the existing regular/thin $type kind while allowing thickness edits', operation => {
    const before = structuredClone(operation)
    expect(() => mergeThinWallEditorDraft(operation, { thinWall: wall }, operation)).toThrow('se conserva al editar')
    const thin: ThinWallOperation = { ...operation, thinWall: wall }
    expect(() => mergeThinWallEditorDraft(thin, { thinWall: undefined }, thin)).toThrow('se conserva al editar')
    const changed = mergeThinWallEditorDraft(thin, { thinWall: { kind: 'mid-plane', thickness: 7 } }, thin)
    expect(changed).toEqual({ ...operation, thinWall: { kind: 'mid-plane', thickness: 7 } })
    expect(thin.thinWall).toEqual(wall)
    expect(operation).toEqual(before)
  })

  it('retains transient invalid dimensions so a field can be corrected instead of throwing during React editing', () => {
    const original = { ...operations[0], thinWall: wall }
    const edited = mergeThinWallEditorDraft(original, { thinWall: { kind: 'one-side', thickness: 0, reversed: true } }, original)
    expect(edited.thinWall).toEqual({ kind: 'one-side', thickness: 0, reversed: true })
    const corrected = mergeThinWallEditorDraft(edited, { thinWall: { kind: 'one-side', thickness: 1.5, reversed: true } }, original)
    expect(corrected.thinWall).toEqual({ kind: 'one-side', thickness: 1.5, reversed: true })
    expect(original.thinWall).toEqual(wall)
  })

  it('does not give unsupported operations a wall or accept an unrelated saved operation as the original', () => {
    const sketch: Feature = { id: 'profile', name: 'Original sketch', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [0, 0], width: 5, height: 3 } }
    expect(isThinWallOperation(sketch)).toBe(false)
    expect(() => mergeThinWallEditorDraft(sketch, { thinWall: wall } as Partial<typeof sketch>)).toThrow('no admite')
    expect(() => mergeThinWallEditorDraft(operations[0], { name: 'Updated' }, { ...operations[0], id: 'other' })).toThrow('ha cambiado')
  })
})

describe('automatic walls from current native sketch topology', () => {
  it('requires one current successful open-profile witness, rather than nominal coordinates or anonymous segments', () => {
    expect(thinWallRequiredByProfile('profile', { sketches: [witness('open')], featureErrors: [] }, true)).toBe(true)
    for (const topology of ['closed', 'invalid', undefined] as const)
      expect(thinWallRequiredByProfile('profile', { sketches: [{ ...witness(topology), lines: [0, 0, 0, 10, 0, 0] }], featureErrors: [] }, true)).toBe(false)
    expect(thinWallRequiredByProfile('profile', { sketches: [witness('open')], featureErrors: [] }, false)).toBe(false)
    expect(thinWallRequiredByProfile('profile', { sketches: [witness('open')], featureErrors: [{ id: 'failed', message: 'Original failure' }] }, true)).toBe(false)
    expect(thinWallRequiredByProfile('profile', { sketches: [witness('open'), witness('open')], featureErrors: [] }, true)).toBe(false)
    expect(thinWallRequiredByProfile('other-profile', { sketches: [witness('open')], featureErrors: [] }, true)).toBe(false)
    expect(thinWallRequiredByProfile('profile', null, true)).toBe(false)
  })

  it.each(operations)('initializes only a new required $type wall with independent deterministic defaults', operation => {
    const before = structuredClone(operation), enabled = withRequiredThinWall(operation, undefined, true)
    expect(enabled).toEqual({ ...operation, thinWall: { kind: 'one-side', thickness: 10, reversed: false } })
    expect(enabled).not.toHaveProperty('profileTopology')
    expect(operation).toEqual(before)
    expect(withRequiredThinWall(operation, undefined, false)).toBe(operation)
    expect(withRequiredThinWall(operation, operation, true)).toBe(operation)
    const typed = { ...operation, thinWall: { kind: 'mid-plane' as const, thickness: 0 } }
    expect(withRequiredThinWall(typed, undefined, true)).toBe(typed)
  })

  it('creates detached defaults without remembered thickness or reversal state', () => {
    const first = defaultThinWallDefinition(), second = defaultThinWallDefinition()
    expect(first).toEqual({ kind: 'one-side', thickness: 10, reversed: false })
    expect(second).toEqual(first); expect(second).not.toBe(first)
  })
})
