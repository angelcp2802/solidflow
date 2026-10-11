import { describe, expect, it } from 'vitest';
import { appendArc, appendCircle, appendLine, appendRectangle, emptySketch, removeSelection, sketchBounds, sketchPoint, snapSketchPoint, translateSelection } from './editing';
import { validateEntityProfile } from './validation';
import type { EntityProfile } from './types';

describe('sketch editing geometry', () => {
  it('creates a connected rectangle with four inferred H/V relations and reuses both snapped corners', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'opposite', x: 20, y: 10 }] };
    const next = appendRectangle(source, [0, 0], [20, 10], 'origin', 'opposite');
    expect(next.points).toHaveLength(3);
    expect(next.entities).toHaveLength(4);
    expect(next.entities[0]).toMatchObject({ start: 'origin' });
    expect(next.entities[1]).toMatchObject({ end: 'opposite' });
    expect(next.constraints.map(constraint => constraint.type)).toEqual(['horizontal', 'vertical', 'horizontal', 'vertical']);
    expect(validateEntityProfile(next)).toEqual(next);
    expect(source.points).toHaveLength(1);
  });

  it('connects lines to an existing point and immutable origin without duplicating coordinates', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'p', x: 20, y: 0 }] };
    const next = appendLine(source, [0, 0], [20, 0], 'origin', 'p');
    expect(next.points).toEqual(source.points);
    expect(next.entities[0]).toMatchObject({ type: 'line', start: 'origin', end: 'p' });
    expect(next.constraints[0]).toMatchObject({ type: 'horizontal' });
    expect(appendLine(source, [20, 0], [20, 0], 'p', 'p')).toBe(source);
  });

  it('projects the third arc click onto its radius and defaults to anticlockwise', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'start', x: 10, y: 0 }, { id: 'offCircle', x: 0, y: 20 }] };
    const next = appendArc(source, [0, 0], [10, 0], [0, 20], 'origin', 'start', 'offCircle');
    const arc = next.entities[0];
    expect(arc).toMatchObject({ type: 'arc', center: 'origin', start: 'start', clockwise: false });
    if (arc.type !== 'arc') throw new Error('Expected arc');
    expect(arc.end).not.toBe('offCircle');
    expect(sketchPoint(next, arc.end)).toMatchObject({ x: 0, y: 10 });
    expect(sketchPoint(next, 'offCircle')).toMatchObject({ x: 0, y: 20 });
    expect(validateEntityProfile(next)).toEqual(next);
  });

  it('reuses an arc endpoint only when the snapped point lies on the circle', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'end', x: 0, y: 10 }] };
    const next = appendArc(source, [0, 0], [10, 0], [0, 10], 'origin', undefined, 'end');
    expect(next.entities[0]).toMatchObject({ end: 'end' });
    expect(next.points).toHaveLength(2);
    expect(appendArc(source, [0, 0], [10, 0], [20, 0])).toBe(source);
    expect(appendArc(source, [0, 0], [0, 0], [20, 0])).toBe(source);
  });

  it.each([.25, 1, 10])('keeps snapping within eight screen pixels at scale %s', scale => {
    const source = emptySketch();
    expect(snapSketchPoint(source, [7.9 / scale, 0], scale).id).toBe('origin');
    expect(snapSketchPoint(source, [8.1 / scale, 0], scale).id).toBeUndefined();
  });

  it('excludes dragged points from snapping and favors the nearest remaining point', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'moving', x: 15, y: 0 }, { id: 'target', x: 20, y: 0 }] };
    expect(snapSketchPoint(source, [15, 0], 1, new Set(['moving']))).toEqual({ id: 'target', x: 20, y: 0 });
    expect(snapSketchPoint(source, [20, 0], 1, new Set(['moving', 'target'])).id).toBeUndefined();
  });

  it('translates shared points once and cannot move the origin', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'p', x: 10, y: 0 }, { id: 'q', x: 10, y: 10 }], entities: [
      { id: 'first', type: 'line', construction: false, start: 'origin', end: 'p' },
      { id: 'second', type: 'line', construction: false, start: 'p', end: 'q' },
    ] };
    const next = translateSelection(source, [{ kind: 'entity', id: 'first' }, { kind: 'entity', id: 'second' }, { kind: 'point', id: 'p' }], 2, 3);
    expect(sketchPoint(next, 'origin')).toEqual({ id: 'origin', x: 0, y: 0 });
    expect(next.points).toEqual([{ id: 'p', x: 12, y: 3 }, { id: 'q', x: 12, y: 13 }]);
    expect(source.points[0]).toMatchObject({ x: 10, y: 0 });
    expect(translateSelection(source, [{ kind: 'point', id: 'origin' }], 10, 10)).toBe(source);
  });

  it('fits circles by their extents rather than only by their center points', () => {
    const source = appendCircle(emptySketch(), [70, -30], 20);
    expect(sketchBounds(source)).toEqual({ minX: 50, minY: -50, maxX: 90, maxY: -10 });
  });
});

describe('sketch deletion', () => {
  it('deleting a constraint preserves unrelated standalone points', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'p', x: 5, y: 5 }], constraints: [{ id: 'fix', type: 'fix', pointId: 'p', x: 5, y: 5 }] };
    expect(removeSelection(source, [{ kind: 'constraint', id: 'fix' }])).toEqual({ ...source, constraints: [] });
    expect(removeSelection(source, [{ kind: 'point', id: 'origin' }])).toEqual(source);
  });

  it('removes dependent entities and constraints while preserving shared and unrelated points', () => {
    const source: EntityProfile = { ...emptySketch(), points: [{ id: 'p', x: 10, y: 0 }, { id: 'q', x: 10, y: 10 }, { id: 'orphan', x: 30, y: 20 }], entities: [
      { id: 'first', type: 'line', construction: false, start: 'origin', end: 'p' },
      { id: 'second', type: 'line', construction: false, start: 'p', end: 'q' },
    ], constraints: [{ id: 'equal', type: 'equal', a: 'first', b: 'second' }, { id: 'fixedQ', type: 'fix', pointId: 'q', x: 10, y: 10 }] };
    const removedLine = removeSelection(source, [{ kind: 'entity', id: 'second' }]);
    expect(removedLine.entities).toHaveLength(1);
    expect(removedLine.points.map(point => point.id)).toEqual(['p', 'orphan']);
    expect(removedLine.constraints).toEqual([]);
    expect(validateEntityProfile(removedLine)).toEqual(removedLine);
    const removedPoint = removeSelection(source, [{ kind: 'point', id: 'p' }]);
    expect(removedPoint.entities).toEqual([]);
    expect(removedPoint.points.map(point => point.id)).toEqual(['orphan']);
    expect(removedPoint.constraints).toEqual([]);
  });
});
