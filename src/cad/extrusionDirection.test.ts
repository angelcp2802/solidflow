import { describe, expect, it, vi } from 'vitest';
import { assertExtrusionDirectionContext, readSecondDirection, readSecondDirectionDraft,
  resolveExtrusionDirections, resolveExtrusionSpan, validateSecondDirection } from './extrusionDirection';

describe('strict independent second extrusion direction', () => {
  it.each([.01, 10, 100_000])('captures and detaches depth%s even when OFF', depth => {
    for (const enabled of [false, true]) {
      const raw = { enabled, depth }, captured = validateSecondDirection(raw);
      expect(captured).toEqual(raw); expect(captured).not.toBe(raw);
      raw.depth = 1; expect(captured.depth).toBe(depth);
      expect(validateSecondDirection(Object.assign(Object.create(null), captured))).toEqual(captured);
    }
  });

  it.each([undefined, null, 1, false, [], {}, { enabled: true }, { depth: 3 },
    { enabled: 1, depth: 3 }, { enabled: false, depth: '3' }, { enabled: true, depth: new Number(3) },
    { enabled: false, depth: 0 }, { enabled: false, depth: -.01 }, { enabled: false, depth: .009999 },
    { enabled: false, depth: 100_000.01 }, { enabled: true, depth: NaN }, { enabled: false, depth: Infinity },
    { enabled: true, depth: 3, extra: 1 },
  ])('rejects malformed raw records including OFF: %j', raw => {
    expect(() => validateSecondDirection(raw)).toThrow();
  });

  it('does not invoke nested/top-level accessors or accept hidden, inherited or symbol fields', () => {
    const hook = vi.fn(() => 3);
    for (const key of ['enabled', 'depth']) {
      const secondDirection = { enabled: true, depth: 3 };
      Object.defineProperty(secondDirection, key, { enumerable: true, get: hook });
      expect(() => validateSecondDirection(secondDirection)).toThrow();
    }
    for (const raw of [Object.assign(Object.create({}), { enabled: true, depth: 3 }),
      Object.defineProperty({ enabled: true, depth: 3 }, 'hidden', { value: 1 }),
      { enabled: true, depth: 3, [Symbol('extra')]: 1 }]) expect(() => validateSecondDirection(raw)).toThrow();
    expect(() => readSecondDirection(Object.defineProperty({}, 'secondDirection', { get: hook, enumerable: true }))).toThrow();
    expect(() => readSecondDirection(Object.defineProperty({}, 'secondDirection', { value: { enabled: true, depth: 3 } }))).toThrow();
    expect(readSecondDirection(Object.create({ secondDirection: { enabled: true, depth: 3 } }))).toBeUndefined();
    expect(hook).not.toHaveBeenCalled();
  });

  it('distinguishes absence from explicit undefined, allowing clearing only in editor patches', () => {
    expect(readSecondDirection({})).toBeUndefined();
    expect(() => readSecondDirection({ secondDirection: undefined })).toThrow();
    expect(readSecondDirectionDraft({ secondDirection: undefined })).toBeUndefined();
    expect(() => readSecondDirectionDraft({ secondDirection: null })).toThrow();
  });

  it.each([
    { depth: 20, second: 10, startShift: -10, span: 30 },
    { depth: -20, second: 10, startShift: 10, span: -30 },
    { depth: .01, second: .01, startShift: -.01, span: .02 },
    { depth: 100_000, second: 100_000, startShift: -100_000, span: 200_000 },
  ])('resolves independent directed bounds depth$depth/second$second', row => {
    expect(resolveExtrusionSpan({ depth: row.depth, symmetric: false, secondDirection: { enabled: true, depth: row.second } }))
      .toEqual({ startShift: row.startShift, signedDepth: row.span, identity: ['second-direction-v1', true] });
  });

  it('preserves absent legacy spans and keeps OFF distinct without continuous dimensions', () => {
    expect(resolveExtrusionSpan({ depth: 20, symmetric: false })).toEqual({ startShift: 0, signedDepth: 20, identity: null });
    expect(resolveExtrusionSpan({ depth: -20, symmetric: true })).toEqual({ startShift: 10, signedDepth: -20, identity: null });
    expect(resolveExtrusionSpan({ depth: 20, symmetric: true, secondDirection: { enabled: false, depth: 10 } }))
      .toEqual({ startShift: -10, signedDepth: 20, identity: ['second-direction-v1', false] });
  });

  it('rejects active midpoint, malformed or bilateral context without invoking accessors', () => {
    const secondDirection = { enabled: true, depth: 10 }, hook = vi.fn(() => undefined);
    for (const context of [{ symmetric: true }, { symmetric: false, endCondition: { kind: 'untilNext' } },
      { symmetric: false, endCondition: { kind: 'throughAll', baseFeatureId: 'base', bothDirections: true } },
      { symmetric: false, endCondition: null }, Object.defineProperty({ symmetric: false }, 'endCondition', { get: hook, enumerable: true })]) {
      Object.defineProperty(context, 'secondDirection', { value: secondDirection, enumerable: true });
      expect(() => assertExtrusionDirectionContext(context)).toThrow();
    }
    const raw = { secondDirection, symmetric: false };
    Object.defineProperty(raw, 'symmetric', { get: hook, enumerable: true });
    expect(() => assertExtrusionDirectionContext(raw)).toThrow();
    expect(hook).not.toHaveBeenCalled();
    expect(() => assertExtrusionDirectionContext({ type: 'revolve', secondDirection })).toThrow(/lineales/);
    expect(() => assertExtrusionDirectionContext({ symmetric: true, secondDirection: { enabled: false, depth: 10 } })).not.toThrow();
  });

  it.each([20, -20])('plans independent native limits on opposite rays without substituting nominal D1=%s', depth => {
    const endCondition = { kind: 'upToSurface' as const, target: { kind: 'plane' as const, planeId: 'first-limit' } };
    const secondEnd = { kind: 'untilNext' as const, baseFeatureId: 'second-owner' };
    const feature = { depth, symmetric: false, endCondition,
      secondDirection: { enabled: true, depth: 7, endCondition: secondEnd } };
    expect(() => assertExtrusionDirectionContext(feature)).not.toThrow();
    const plan = resolveExtrusionDirections(feature);
    expect(plan.first).toEqual({ signedDepth: depth, endCondition });
    expect(plan.second).toEqual({ signedDepth: -Math.sign(depth) * 7, endCondition: secondEnd });
    expect(plan.allBlind).toBe(false);
    expect(feature.secondDirection.endCondition).toEqual(secondEnd);
  });

  it('keeps a detached inactive nested reference without making it an active native direction', () => {
    const raw = { enabled: false, depth: 7, endCondition: { kind: 'upToSurface' as const,
      target: { kind: 'plane' as const, planeId: 'retained-limit' } } };
    const captured = validateSecondDirection(raw);
    raw.endCondition.target.planeId = 'external-edit';
    expect(captured.endCondition).toEqual({ kind: 'upToSurface', target: { kind: 'plane', planeId: 'retained-limit' } });
    const plan = resolveExtrusionDirections({ depth: 20, symmetric: false, secondDirection: captured });
    expect(plan.second).toBeUndefined(); expect(plan.allBlind).toBe(true);
  });

  it.each([undefined, null, { kind: 'untilNext' }, { kind: 'unknown' },
    { kind: 'throughAll', baseFeatureId: 'owner', bothDirections: true },
    { kind: 'upToSurface', target: { kind: 'plane', planeId: 'limit', extra: 1 } },
  ])('rejects malformed nested end data while OFF: %j', endCondition => {
    expect(() => validateSecondDirection({ enabled: false, depth: 7, endCondition })).toThrow();
  });

  it('does not invoke nested end/target accessors while validating inactive data', () => {
    const hook = vi.fn(() => ({ kind: 'plane', planeId: 'limit' }));
    const endCondition = Object.defineProperty({ kind: 'upToSurface' }, 'target', { get: hook, enumerable: true });
    expect(() => validateSecondDirection({ enabled: false, depth: 7, endCondition })).toThrow();
    const raw = Object.defineProperty({ enabled: false, depth: 7 }, 'endCondition', { get: hook, enumerable: true });
    expect(() => validateSecondDirection(raw)).toThrow(); expect(hook).not.toHaveBeenCalled();
  });
});
