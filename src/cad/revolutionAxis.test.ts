import { describe, expect, it } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import type { RevolveFeature, SketchFeature } from './kernel.types';
import { principalPlaneFrame } from './kernel.frames';
import { entityRevolutionSide } from './kernel.profiles';
import { resolveRevolutionAxis, revolutionRadialCoordinate } from './revolutionAxis';

const profile = (): EntityProfile => ({ kind: 'entities', points: [{ id: 'a', x: 1, y: 2 }, { id: 'b', x: 4, y: 6 }],
  entities: [{ id: 'axis', type: 'line', start: 'a', end: 'b', construction: true }], constraints: [] });
const sketch = (value = profile()): SketchFeature => ({ id: 's', name: 'Original axis sketch', type: 'sketch', plane: 'XY',
  offset: 0, suppressed: false, profile: value });
const line = { axis: { kind: 'sketch-line', entityId: 'axis' } } as const;

describe('current solved sketch revolution axis', () => {
  it('maps an oriented line through the supported frame without mutating its source', () => {
    const source = sketch(), before = JSON.stringify(source);
    const axis = resolveRevolutionAxis({ ...line, reversed: true }, source,
      { origin: [10, 20, 30], xDirection: [0, 1, 0], normal: [1, 0, 0] });
    expect(axis.localDirection).toEqual([.6, .8]);
    expect(axis.origin).toEqual([10, 21, 32]);
    expect(axis.direction).toEqual([-0, -.6, -.8]);
    expect(revolutionRadialCoordinate([5, -1], axis)).toBeCloseTo(5, 12);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('retains the implicit origin and exact legacy direction for all principal planes', () => {
    for (const [plane, origin, direction] of [
      ['XY', [0, 0, 2], [0, 1, 0]], ['XZ', [0, -2, 0], [0, 0, 1]], ['YZ', [2, 0, 0], [0, 0, 1]],
    ] as const) {
      expect(resolveRevolutionAxis({ reversed: false }, sketch(), principalPlaneFrame(plane, 2)))
        .toMatchObject({ legacy: true, origin, direction });
    }
    const source = profile(); source.entities[0] = { id: 'axis', type: 'line', start: 'origin', end: 'b', construction: false };
    expect(resolveRevolutionAxis(line, sketch(source), principalPlaneFrame('XY')).origin).toEqual([0, 0, 0]);
  });

  it.each(['missing', 'duplicate-entity', 'circle', 'missing-point', 'duplicate-point', 'origin-shadow', 'collapsed', 'nonfinite'])(
    'rejects a %s line identity instead of falling back to Y', kind => {
      const value = profile();
      if (kind === 'missing') value.entities = [];
      if (kind === 'duplicate-entity') value.entities.push({ ...value.entities[0] });
      if (kind === 'circle') value.entities[0] = { id: 'axis', type: 'circle', center: 'a', radius: 1, construction: true };
      if (kind === 'missing-point') value.points.pop();
      if (kind === 'duplicate-point') value.points.push({ ...value.points[0] });
      if (kind === 'origin-shadow') { value.points[0].id = 'origin'; value.entities[0] = { id: 'axis', type: 'line', start: 'origin', end: 'b', construction: true }; }
      if (kind === 'collapsed') Object.assign(value.points[1], { x: 1, y: 2 });
      if (kind === 'nonfinite') value.points[1].x = NaN;
      expect(() => resolveRevolutionAxis(line, sketch(value), principalPlaneFrame('XY'))).toThrow(/eje de revolución/);
    });

  it.each([{ axis: undefined }, { axis: { kind: 'sketch-axis', axis: 'z' } }, { axis: { kind: 'sketch-axis', axis: 'x', ignored: true } }, { reversed: 1 }])(
    'rejects malformed raw declarations at the native boundary', value => {
      expect(() => resolveRevolutionAxis(value as Pick<RevolveFeature, 'axis' | 'reversed'>, sketch(), principalPlaneFrame('XY'))).toThrow();
    });

  it('checks interior arc extrema against a translated line rather than just endpoints', () => {
    const value: EntityProfile = { kind: 'entities', points: [
      { id: 'a', x: -2, y: 0 }, { id: 'b', x: 2, y: 0 }, { id: 'c', x: -3, y: -1 }, { id: 'd', x: 3, y: -1 }],
    entities: [{ id: 'upper', type: 'arc', center: 'origin', start: 'b', end: 'a', clockwise: false, construction: false },
      { id: 'lower', type: 'arc', center: 'origin', start: 'a', end: 'b', clockwise: false, construction: false },
      { id: 'axis', type: 'line', start: 'c', end: 'd', construction: true }], constraints: [] };
    const axis = resolveRevolutionAxis(line, sketch(value), principalPlaneFrame('XY'));
    expect(() => entityRevolutionSide(value, axis)).toThrow('cruza el eje seleccionado');
    value.points[2].y = -3; value.points[3].y = -3;
    expect(entityRevolutionSide(value, resolveRevolutionAxis(line, sketch(value), principalPlaneFrame('XY')))).toBe(-1);
  });
});
