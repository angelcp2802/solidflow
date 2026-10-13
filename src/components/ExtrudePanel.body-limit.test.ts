import { describe, expect, it } from 'vitest'
import type { ExtrudeFeature, PlaneSupport } from '../cad/kernel.types'
import { extrudeModePatch } from './ExtrudePanel'

// Original draft records only. These transitions do not build native geometry.
const limit = { bodyId: 'body-a', sourceFeatureId: 'shared-cut' }
const target: PlaneSupport = { kind: 'principal', plane: 'XY' }
const feature = (): Extract<ExtrudeFeature, { type: 'extrude' }> => ({
  id: 'new-boss', name: 'Separate boss', suppressed: false, type: 'extrude',
  sketchId: 'original-sketch', depth: 4, symmetric: false,
  bodyOperation: { mode: 'new', bodyId: 'new-body' },
  endCondition: { kind: 'throughAll', baseFeatureId: limit.sourceFeatureId, baseBody: limit, bothDirections: false },
})

describe('explicit new-body geometric termination draft transitions', () => {
  it('preserves the exact saved limit across geometric modes instead of adopting another base', () => {
    const input = feature(), before = structuredClone(input)
    for (const mode of ['untilNext', 'throughAll', 'throughAllBoth']) {
      const patch = extrudeModePatch(input, mode, 'aggregate-or-merge-source', target)
      expect(patch).toMatchObject({ endCondition: { baseBody: limit, baseFeatureId: limit.sourceFeatureId } })
      expect(patch?.endCondition && 'baseBody' in patch.endCondition && patch.endCondition.baseBody).not.toBe(limit)
    }
    expect(input).toEqual(before)
  })

  it('leaves a missing explicit limit unassigned and clears it for blind or surface termination', () => {
    const input = feature(); input.endCondition = undefined
    expect(extrudeModePatch(input, 'untilNext', 'aggregate-source', target)).toMatchObject({ endCondition: { kind: 'untilNext', baseFeatureId: '' } })
    expect(extrudeModePatch(input, 'untilNext', 'aggregate-source', target)?.endCondition).not.toHaveProperty('baseBody')
    expect(extrudeModePatch(feature(), 'blind', null, target)?.endCondition).toBeUndefined()
    expect(extrudeModePatch(feature(), 'upToSurface', null, target)?.endCondition).toEqual({ kind: 'upToSurface', target })
  })

  it('retains legacy and merge termination semantics without a body-limit field', () => {
    const input = feature(); delete input.bodyOperation; input.endCondition = undefined
    expect(extrudeModePatch(input, 'untilNext', null, target)).toBeNull()
    expect(extrudeModePatch(input, 'throughAll', 'legacy-base', target)).toMatchObject({ endCondition: { baseFeatureId: 'legacy-base' } })
    input.bodyOperation = { mode: 'merge', target: { bodyId: 'body-b', sourceFeatureId: 'merge-base' } }
    const patch = extrudeModePatch(input, 'untilNext', 'merge-base', target)
    expect(patch?.endCondition).toEqual({ kind: 'untilNext', baseFeatureId: 'merge-base' })
  })
})
