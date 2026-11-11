import { expect, it } from 'vitest'
import { compareSymmetrySupports, type SymmetrySupport } from './assemblySymmetryGeometry'

const kinds = ['point', 'line', 'plane', 'sphere', 'cylinder'] as const
const policy = { originMm: [0, 0, 0] as [number, number, number], lengthScaleMm: 1, lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }
const epsilon = 1e-7
for (const kind of kinds) it('retains orthogonal reflection/projection error bounds for original ' + kind + ' supports', () => {
  const support = (target: boolean, perturbed: boolean): SymmetrySupport => {
    const common = { ownerId: target ? 'b' : 'a', pointMm: [target ? 1 : -1, 0, 0] as [number, number, number], pointErrorMm: perturbed ? 0 : epsilon }
    // Both source and target move to negative X by one admitted point error.
    if (perturbed) common.pointMm[0] -= epsilon
    if (kind === 'point') return { ...common, kind }
    if (kind === 'sphere') return { ...common, kind, radiusMm: 2, radiusErrorMm: 0 }
    if (kind === 'plane') return { ...common, kind, normal: [target ? -1 : 1, 0, 0], normalErrorRad: 0 }
    return { ...common, kind, direction: [0, 0, 1], directionErrorRad: 0,
      ...(kind === 'cylinder' ? { radiusMm: 2, radiusErrorMm: 0 } : {}) } as SymmetrySupport
  }
  const mirror: SymmetrySupport & { kind: 'plane' } = { kind: 'plane', ownerId: 'm', pointMm: [0, 0, 0], pointErrorMm: epsilon, normal: [1, 0, 0], normalErrorRad: 0 }
  const alignment = kind === 'point' || kind === 'sphere' ? null : 'aligned'
  const nominal = compareSymmetrySupports(support(false, false), support(true, false), mirror, alignment, [0, 0, 0, 1], policy)
  expect(nominal.status).toBe('ok')
  if (nominal.status !== 'ok') throw Error(nominal.message)
  expect(nominal.positionErrorMm).toBe(0)
  // H is an isometry, so the source contributes e, target e and mirror 2e.
  // Both orthogonal projectors have norm one. Native envelopes of 1e-7 mm
  // therefore fit the unchanged 1e-6 mm requested band for every family.
  expect(nominal.precision.position).toBeCloseTo(4 * epsilon, 11)
  expect(nominal.precision.position).toBeLessThan(policy.lengthToleranceMm)
  const changed = compareSymmetrySupports(support(false, true), support(true, true), { ...mirror, pointMm: [epsilon, 0, 0], pointErrorMm: 0 }, alignment, [0, 0, 0, 1], policy)
  expect(changed.status).toBe('ok')
  if (changed.status !== 'ok') throw Error(changed.message)
  // Literal X reflection: -( -1-e )+2e = 1+3e, target=1-e.
  expect(changed.positionErrorMm).toBeCloseTo(4 * epsilon, 14)
  expect(changed.positionErrorMm).toBeLessThanOrEqual(nominal.precision.position)
})
