import { describe, expect, it } from 'vitest';
import { sketchVisual } from './kernel.sketch-visual';
import type { Plane, SketchFeature } from './kernel.types';

const feature = (plane: Plane = 'XY'): SketchFeature => ({ id: 'sketch', name: 'Croquis', type: 'sketch',
  plane, offset: 7, suppressed: false, profile: { kind: 'rectangle', center: [10, 20], width: 4, height: 6 } });

describe('accepted sketch display geometry', () => {
  it.each([
    ['XY', [8, 17, 7, 12, 17, 7]],
    ['XZ', [8, -7, 17, 12, -7, 17]],
    ['YZ', [7, 8, 17, 7, 12, 17]],
  ] as [Plane, number[]][])('projects legacy rectangles onto %s with the sketch offset', (plane, firstSegment) => {
    const result = sketchVisual(feature(plane));
    expect(result.lines).toHaveLength(24);
    expect(result.lines.slice(0, 6)).toEqual(firstSegment);
    expect(result.lines.slice(-3)).toEqual(firstSegment.slice(0, 3));
    expect(result.constructionLines).toEqual([]);
  });

  it('displays an open entity line separately from construction geometry', () => {
    const sketch = feature('YZ');
    sketch.profile = { kind: 'entities', points: [{ id: 'a', x: 3, y: 4 }, { id: 'b', x: 10, y: 4 }], constraints: [],
      entities: [{ id: 'open', type: 'line', start: 'a', end: 'b', construction: false },
        { id: 'helper', type: 'line', start: 'origin', end: 'a', construction: true }] };
    const result = sketchVisual(sketch);
    expect(result.lines).toEqual([7, 3, 4, 7, 10, 4]);
    expect(result.constructionLines).toEqual([7, 0, 0, 7, 3, 4]);
  });

  it.each([false, true])('discretizes the correct arc side with clockwise=%s', (clockwise) => {
    const sketch = feature();
    sketch.profile = { kind: 'entities', points: [{ id: 'a', x: 10, y: 0 }, { id: 'b', x: -10, y: 0 }], constraints: [],
      entities: [{ id: 'arc', type: 'arc', center: 'origin', start: 'a', end: 'b', clockwise, construction: false }] };
    const result = sketchVisual(sketch);
    expect(result.lines.slice(0, 3)).toEqual([10, 0, 7]);
    expect(result.lines.slice(-3)).toEqual([-10, 0, 7]);
    const y = result.lines.filter((_, index) => index % 3 === 1);
    expect(clockwise ? Math.min(...y) : Math.max(...y)).toBeCloseTo(clockwise ? -10 : 10, 8);
    expect(y.every((coordinate) => clockwise ? coordinate <= 1e-12 : coordinate >= -1e-12)).toBe(true);
  });

  it('discretizes a circle on its plane as a closed display wire', () => {
    const sketch = feature('XZ');
    sketch.profile = { kind: 'circle', center: [3, 4], radius: 10 };
    const result = sketchVisual(sketch);
    expect(result.lines.length).toBeGreaterThanOrEqual(48 * 6);
    for (let index = 0; index < result.lines.length; index += 3) {
      expect(result.lines[index + 1]).toBe(-7);
      expect(Math.hypot(result.lines[index] - 3, result.lines[index + 2] - 4)).toBeCloseTo(10, 10);
    }
    expect(result.lines.slice(-3)[0]).toBeCloseTo(result.lines[0], 10);
    expect(result.lines.slice(-3)[2]).toBeCloseTo(result.lines[2], 10);
  });

  it('returns a valid empty visual for an accepted empty sketch', () => {
    const sketch = feature();
    sketch.profile = { kind: 'entities', points: [], entities: [], constraints: [] };
    expect(sketchVisual(sketch)).toEqual({ id: 'sketch', lines: [], constructionLines: [],
      frame: { origin: [0, 0, 7], xDirection: [1, 0, 0], normal: [0, 0, 1] } });
  });
});
