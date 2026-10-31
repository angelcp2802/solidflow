'use strict';

// Original analytical profiles in millimetres, authored for this regression.
// No solid, downstream operation, external model or reference application data.
// GUI previews an independent axis rectangle, cancels, changes sleeve height
// 8 -> 10 and revolves x=[0,4] around local Y, then cuts R1.
// Two unused original rectangles support successive outer revolved grooves.
module.exports = () => ({
  version: 1, id: 'original-revolution-sequence', name: 'Original revolved sleeve', units: 'mm',
  createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  features: [
    { id: 'sleeve-profile', name: 'Sleeve profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [2, 0], width: 4, height: 8 } },
    { id: 'bore-profile', name: 'Bore profile', type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 1 } },
    { id: 'axis-profile', name: 'Axis selection profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'entities', points: [
        { id: 'a', x: 3, y: 0 }, { id: 'b', x: 7, y: 0 },
        { id: 'c', x: 7, y: 10 }, { id: 'd', x: 3, y: 10 },
        { id: 'axis-start', x: 3, y: -2 }, { id: 'axis-end', x: 3, y: 12 },
      ], entities: [
        { id: 'bottom', type: 'line', start: 'a', end: 'b', construction: false },
        { id: 'right', type: 'line', start: 'b', end: 'c', construction: false },
        { id: 'top', type: 'line', start: 'c', end: 'd', construction: false },
        { id: 'left', type: 'line', start: 'd', end: 'a', construction: false },
        { id: 'axis-line', type: 'line', start: 'axis-start', end: 'axis-end', construction: true },
      ], constraints: [] } },
    { id: 'outer-groove-one', name: 'First outer groove', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [4, 1], width: 2, height: 2 } },
    { id: 'outer-groove-two', name: 'Second outer groove', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [4.25, -3.5], width: 1.5, height: 1 } },
  ],
});
