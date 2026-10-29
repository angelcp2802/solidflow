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
