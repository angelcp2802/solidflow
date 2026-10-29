import { describe, expect, it, vi } from 'vitest';
import type { ThinWallDefinition } from './kernel.types';
import { mergeThinWallDraft, readThinWall, resolveThinWall, validateThinWallDefinition } from './thinWall';

const definitions: ThinWallDefinition[] = [
  { kind: 'one-side', thickness: 2, reversed: false },
  { kind: 'one-side', thickness: 2, reversed: true },
  { kind: 'mid-plane', thickness: 3 },
  { kind: 'two-sides', firstThickness: 2, secondThickness: 5 },
];

describe('strict thin-wall declarations and abstract offsets', () => {
  it.each(definitions)('detaches optional corner settings without changing wall offsets: %j', definition => {
    for (const enabled of [false, true]) {
      const autoCorners = { enabled, radius: .001 };
      const source = { ...definition, autoCorners };
      const captured = validateThinWallDefinition(source);
      expect(captured).toEqual(source);
      expect(captured.autoCorners).not.toBe(autoCorners);
      autoCorners.radius = 7;
      expect(captured.autoCorners?.radius).toBe(.001);
      const resolved = resolveThinWall({ thinWall: captured })!;
      expect([resolved.positive, resolved.negative]).toEqual([
        resolveThinWall({ thinWall: definition })!.positive, resolveThinWall({ thinWall: definition })!.negative,
      ]);
    }
  });

  it.each([undefined, null, false, [], {}, { enabled: true }, { radius: 3 },
    { enabled: 1, radius: 3 }, { enabled: true, radius: '3' }, { enabled: false, radius: 0 },
    { enabled: true, radius: 1e-7 }, { enabled: true, radius: Infinity },
    { enabled: true, radius: NaN }, { enabled: true, radius: 100_001 },
    { enabled: true, radius: 3, extra: 1 },
  ])('rejects malformed corner options, including explicit undefined: %j', autoCorners => {
    expect(() => validateThinWallDefinition({ ...definitions[0], autoCorners })).toThrow();
  });

  it('never invokes corner accessors, inherited fields, hidden data or symbols', () => {
    const hook = vi.fn(() => 3);
    for (const key of ['enabled', 'radius']) {
      const autoCorners = { enabled: true, radius: 3 };
      Object.defineProperty(autoCorners, key, { enumerable: true, get: hook });
      expect(() => validateThinWallDefinition({ ...definitions[0], autoCorners })).toThrow();
    }
    const source = { ...definitions[0] };
    Object.defineProperty(source, 'autoCorners', { enumerable: true, get: hook });
    expect(() => validateThinWallDefinition(source)).toThrow();
    for (const autoCorners of [Object.assign(Object.create({}), { enabled: true, radius: 3 }),
      Object.defineProperty({ enabled: true, radius: 3 }, 'extra', { value: 1 }),
      { enabled: true, radius: 3, [Symbol('extra')]: 1 }]) {
      expect(() => validateThinWallDefinition({ ...definitions[0], autoCorners })).toThrow();
    }
    expect(hook).not.toHaveBeenCalled();
  });

  it('keeps absent identities exact and identifies activation without using a continuous radius', () => {
    const identity = (autoCorners?: { enabled: boolean; radius: number }) => resolveThinWall({
      thinWall: { ...definitions[0], ...(autoCorners ? { autoCorners } : {}) },
    })!.identity;
    expect(identity()).toEqual(['thin-wall-v1', 'one-side', false]);
    expect(identity({ enabled: true, radius: 3 })).toEqual(identity({ enabled: true, radius: .001 }));
    expect(identity({ enabled: true, radius: 3 })).not.toEqual(identity({ enabled: false, radius: 3 }));
    expect(identity({ enabled: false, radius: 3 })).not.toEqual(identity());
  });

  it.each(definitions)('captures detached data for %j', definition => {
    const captured = validateThinWallDefinition(definition);
    expect(captured).toEqual(definition);
    expect(captured).not.toBe(definition);
    expect(validateThinWallDefinition(Object.assign(Object.create(null), definition))).toEqual(definition);
  });

  it.each([
    [definitions[0], 2, 0], [definitions[1], 0, 2], [definitions[2], 1.5, 1.5], [definitions[3], 2, 5],
  ] as const)('resolves the declared offsets without choosing a physical wire side: %j', (thinWall, positive, negative) => {
    expect(resolveThinWall({ thinWall })).toMatchObject({ definition: thinWall, positive, negative });
  });

  it('uses only discrete modes/roles in identity, keeping continuous dimensions out', () => {
    const identity = (thinWall: ThinWallDefinition) => resolveThinWall({ thinWall })!.identity;
    expect(identity(definitions[0])).toEqual(identity({ kind: 'one-side', thickness: 40, reversed: false }));
    expect(identity(definitions[2])).toEqual(identity({ kind: 'mid-plane', thickness: 40 }));
    expect(identity(definitions[3])).toEqual(identity({ kind: 'two-sides', firstThickness: 7, secondThickness: 9 }));
    expect(new Set(definitions.map(definition => JSON.stringify(identity(definition)))).size).toBe(4);
  });

  it.each([undefined, null, false, 1, [], {}, { kind: 'unknown' },
    { kind: 'one-side', thickness: 2 }, { kind: 'one-side', thickness: 2, reversed: 0 },
    { kind: 'one-side', thickness: 2, reversed: false, secondThickness: 1 },
    { kind: 'mid-plane', thickness: 2, reversed: false },
    { kind: 'two-sides', firstThickness: 2 },
    { kind: 'two-sides', firstThickness: 2, secondThickness: 3, thickness: 5 },
    { kind: 'mid-plane', thickness: '2' }, { kind: 'mid-plane', thickness: new Number(2) },
  ])('rejects a malformed declaration: %j', value => {
    expect(() => validateThinWallDefinition(value)).toThrow();
  });

  it.each([0, -1, 1e-7, 100_000.0001, NaN, Infinity, -Infinity])('rejects out-of-bound thickness %s in every role', value => {
    for (const definition of [
      { kind: 'one-side', thickness: value, reversed: false }, { kind: 'mid-plane', thickness: value },
      { kind: 'two-sides', firstThickness: value, secondThickness: 1 },
      { kind: 'two-sides', firstThickness: 1, secondThickness: value },
    ]) expect(() => validateThinWallDefinition(definition)).toThrow();
  });

  it('accepts exact upper and strict lower boundaries and bounds two-side total', () => {
    for (const thickness of [1.0000001e-7, 100_000]) {
      expect(validateThinWallDefinition({ kind: 'mid-plane', thickness })).toEqual({ kind: 'mid-plane', thickness });
    }
    expect(validateThinWallDefinition({ kind: 'two-sides', firstThickness: 60_000, secondThickness: 40_000 })).toBeDefined();
    expect(() => validateThinWallDefinition({ kind: 'two-sides', firstThickness: 60_000, secondThickness: 40_001 })).toThrow('total');
  });

  it('rejects accessors and unusual record fields without invoking hooks', () => {
    const hook = vi.fn(() => 2);
    for (const field of ['kind', 'thickness', 'reversed']) {
      const declaration = { kind: 'one-side', thickness: 2, reversed: false };
      Object.defineProperty(declaration, field, { get: hook, enumerable: true });
      expect(() => validateThinWallDefinition(declaration)).toThrow();
    }
    const hidden = Object.defineProperty({ kind: 'mid-plane', thickness: 2 }, 'extra', { value: 1 });
    const symbol = { kind: 'mid-plane', thickness: 2, [Symbol('extra')]: 1 };
    const custom = Object.assign(Object.create({}), { kind: 'mid-plane', thickness: 2 });
    for (const declaration of [hidden, symbol, custom]) expect(() => validateThinWallDefinition(declaration)).toThrow();
    expect(hook).not.toHaveBeenCalled();
  });

  it('distinguishes absent, inherited, hidden and executable feature fields', () => {
    expect(readThinWall({})).toBeUndefined();
    expect(resolveThinWall({})).toBeUndefined();
    expect(readThinWall(Object.create({ thinWall: definitions[0] }))).toBeUndefined();
    for (const thinWall of [undefined, null, false]) expect(() => readThinWall({ thinWall })).toThrow();
    const getter = vi.fn(() => definitions[0]);
    expect(() => readThinWall(Object.defineProperty({}, 'thinWall', { get: getter, enumerable: true }))).toThrow();
    expect(() => readThinWall(Object.defineProperty({}, 'thinWall', { value: definitions[0] }))).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });

  it('removes only explicitly cleared draft fields without mutating either input', () => {
    const feature = { id: 'wall', thinWall: definitions[0], depth: 5 };
    const kept = mergeThinWallDraft(feature, { depth: 8 });
    expect(kept).toEqual({ ...feature, depth: 8 });
    const cleared = mergeThinWallDraft(feature, { thinWall: undefined });
    expect(cleared).toEqual({ id: 'wall', depth: 5 });
    expect(Object.hasOwn(cleared, 'thinWall')).toBe(false);
    expect(feature.thinWall).toBe(definitions[0]);
    const replacement = mergeThinWallDraft(feature, { thinWall: definitions[2] });
    expect(replacement.thinWall).toEqual(definitions[2]);
    expect(replacement.thinWall).not.toBe(definitions[2]);
  });

  it('rejects a draft accessor before spreading or invoking it', () => {
    const hook = vi.fn(() => undefined);
    const patch = Object.defineProperty({}, 'thinWall', { get: hook, enumerable: true });
    expect(() => mergeThinWallDraft({ id: 'wall' }, patch)).toThrow();
    expect(hook).not.toHaveBeenCalled();
  });
});
