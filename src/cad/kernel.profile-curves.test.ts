import { describe, expect, it } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import { classifyThinWallProfile, makeProfileCurves } from './kernel.profile-curves';
import { makeProfileCurves as nativeEntrypoint } from './kernel.profiles';

function open(): EntityProfile {
  return { kind: 'entities', points: [{ id: 'a', x: 10, y: 0 }, { id: 'b', x: 10, y: 8 }],
    entities: [{ id: 'horizontal', type: 'line', start: 'origin', end: 'a', construction: false },
      { id: 'vertical', type: 'line', start: 'a', end: 'b', construction: false }], constraints: [] };
}
describe('shared native-free resolved profile analysis', () => {
  it('preserves the old entrypoint and its analytic open-curve values', () => {
    const profile = open();
    expect(nativeEntrypoint(profile)).toEqual(makeProfileCurves(profile));
    expect(makeProfileCurves(profile).curves.map((curve) => [curve.id, curve.start, curve.end])).toEqual([
      ['horizontal', [0, 0], [10, 0]], ['vertical', [10, 0], [10, 8]],
    ]);
    expect(classifyThinWallProfile(profile)).toBe('open');
  });
  it('uses solved coordinate connectivity even when coincident endpoint IDs differ', () => {
    const profile = open();
    profile.points.push({ id: 'alias', x: 10, y: 0 });
    profile.entities[1] = { id: 'vertical', type: 'line', start: 'alias', end: 'b', construction: false };
    expect(classifyThinWallProfile(profile)).toBe('open');
    profile.entities.push({ id: 'close', type: 'line', start: 'b', end: 'origin', construction: false });
    expect(classifyThinWallProfile(profile)).toBe('closed');
  });
  it('keeps invalid branches distinct from closed profiles', () => {
    const profile = open();
    profile.points.push({ id: 'c', x: 20, y: 0 });
    profile.entities.push({ id: 'branch', type: 'line', start: 'a', end: 'c', construction: false });
    expect(classifyThinWallProfile(profile)).toBe('invalid');
  });
  it('keeps ambiguous near-coincident endpoints invalid', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'a', x: .000015, y: 0 },
      { id: 'b', x: .0000075, y: 0 }, { id: 'c', x: 1, y: 1 }], constraints: [],
    entities: [{ id: 'first', type: 'line', start: 'origin', end: 'a', construction: false },
      { id: 'second', type: 'line', start: 'b', end: 'c', construction: false }] };
    expect(classifyThinWallProfile(profile)).toBe('invalid');
    expect(() => nativeEntrypoint(profile)).toThrow(/ambig/);
  });
  it('reports empty, construction-only and crossing geometry as invalid', () => {
    const profile = open();
    expect(classifyThinWallProfile({ kind: 'entities', points: [], entities: [], constraints: [] })).toBe('invalid');
    expect(classifyThinWallProfile({ ...profile, entities: profile.entities.map((entity) => ({ ...entity, construction: true })) })).toBe('invalid');
    profile.points.push({ id: 'c', x: 5, y: -5 }, { id: 'd', x: 5, y: 5 });
    profile.entities.push({ id: 'cross', type: 'line', start: 'c', end: 'd', construction: false });
    expect(classifyThinWallProfile(profile)).toBe('invalid');
  });
  it('classifies arcs, circles, primitives and mixed open/closed components', () => {
    const profile = open();
    profile.entities.push({ id: 'circle', type: 'circle', center: 'origin', radius: 1, construction: false });
    // This circle intersects the horizontal line, so it is not an admissible mixed profile.
    expect(classifyThinWallProfile(profile)).toBe('invalid');
    profile.points.push({ id: 'far', x: 30, y: 0 });
    profile.entities[2] = { id: 'circle', type: 'circle', center: 'far', radius: 1, construction: false };
    expect(classifyThinWallProfile(profile)).toBe('open');
    expect(classifyThinWallProfile({ kind: 'circle', center: [0, 0], radius: 5 })).toBe('closed');
    expect(classifyThinWallProfile({ kind: 'rectangle', center: [0, 0], width: 10, height: 6 })).toBe('closed');
    expect(classifyThinWallProfile({ kind: 'circle', center: [0, 0], radius: NaN })).toBe('invalid');
    const arc: EntityProfile = { kind: 'entities', points: [{ id: 's', x: 5, y: 0 }, { id: 'e', x: 0, y: 5 }], constraints: [],
      entities: [{ id: 'arc', type: 'arc', center: 'origin', start: 's', end: 'e', clockwise: false, construction: false }] };
    expect(classifyThinWallProfile(arc)).toBe('open');
  });
});
