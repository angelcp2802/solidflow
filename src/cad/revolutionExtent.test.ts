import { expect, it } from 'vitest';
import { resolveRevolutionExtent } from './revolutionExtent';
import type { RevolveFeature } from './kernel.types';

it('preserves the unilateral interval and absent lineage extension', () => {
  expect(resolveRevolutionExtent({ angle: 60 })).toEqual({ kind: 'one-direction', startAngle: 0, sweepAngle: 60, reversed: false, identity: null });
  expect(resolveRevolutionExtent({ angle: 360, reversed: true })).toMatchObject({ startAngle: 0, sweepAngle: 360, reversed: true, identity: null });
});

it.each([[60, 30, -30, 90], [0, 90, -90, 90], [90, 0, 0, 90], [0, 360, -360, 360], [360, 0, 0, 360], [270, 90, -90, 360]])(
  'resolves independently authored sides %s/%s into one interval', (angle, secondAngle, startAngle, sweepAngle) => {
    const declaration = { angle, extent: { kind: 'two-directions' as const, secondAngle }, reversed: true };
    const before = structuredClone(declaration), result = resolveRevolutionExtent(declaration);
    expect(result).toEqual({ kind: 'two-directions', startAngle, sweepAngle, reversed: true,
      identity: ['revolution-extent-v1', 'two-directions', sweepAngle === 360] });
    expect(result.startAngle + result.sweepAngle).toBe(angle);
    expect(declaration).toEqual(before);
  });

it('uses the mid-plane total angle, ignoring but not modifying the stored reverse declaration', () => {
  const forward = { angle: 90, extent: { kind: 'mid-plane' as const }, reversed: false };
  const reverse = { ...forward, reversed: true };
  expect(resolveRevolutionExtent(forward)).toEqual({ kind: 'mid-plane', startAngle: -45, sweepAngle: 90, reversed: false,
    identity: ['revolution-extent-v1', 'mid-plane', false] });
  expect(resolveRevolutionExtent(reverse)).toEqual(resolveRevolutionExtent(forward));
  expect(reverse.reversed).toBe(true);
});

it.each([
  { angle: 0 }, { angle: -1 }, { angle: Infinity }, { angle: NaN }, { angle: 361 },
  { angle: 90, extent: undefined }, { angle: 90, extent: null },
  { angle: 0, extent: { kind: 'mid-plane' } }, { angle: 90, extent: { kind: 'mid-plane', secondAngle: 0 } },
  { angle: 90, extent: { kind: 'other' } }, { angle: 90, extent: { kind: 'two-directions' } },
  ...[-1, NaN, Infinity, 361, '30', undefined].map(secondAngle => ({ angle: 30, extent: { kind: 'two-directions', secondAngle } })),
  { angle: 0, extent: { kind: 'two-directions', secondAngle: 0 } },
  { angle: 360, extent: { kind: 'two-directions', secondAngle: 0.00001 } },
  { angle: 60, extent: { kind: 'two-directions', secondAngle: 30, hidden: false } },
  { angle: 90, reversed: undefined }, { angle: 90, extent: { kind: 'mid-plane' }, reversed: 'false' },
])('rejects malformed extent intent without silently reverting to one direction: %j', declaration => {
  expect(() => resolveRevolutionExtent(declaration as Pick<RevolveFeature, 'angle' | 'extent' | 'reversed'>)).toThrow();
});

it('rejects executable extent fields without invoking them', () => {
  let calls = 0;
  const extent = { kind: 'two-directions' };
  Object.defineProperty(extent, 'secondAngle', { enumerable: true, get: () => { calls++; return 30; } });
  expect(() => resolveRevolutionExtent({ angle: 60, extent: extent as RevolveFeature['extent'] })).toThrow();
  expect(calls).toBe(0);
});
