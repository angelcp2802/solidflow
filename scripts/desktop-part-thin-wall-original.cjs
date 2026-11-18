'use strict';

// Original analytical mm recipe, with no imported geometry or saved topology.
// Base cylinder R12/H20: V2880pi. Other sketches start unused.
// Rectangle W8/H6 outside wall1/depth6: V192. LINE L10 wall2 cut depth20: V400.
// Vertical LINE r5/H6 right wall1 about x25: V66pi. Interior groove r5.5..6/H4
// removes23pi, leaving43pi. The visible axis is construction geometry.
const open = (id, name, x, low, high, offset, withAxis = false) => ({
  id, name, type: 'sketch', suppressed: false, plane: 'XY', offset,
  profile: { kind: 'entities', points: [{ id: 'start', x, y: low }, { id: 'end', x, y: high },
    ...(withAxis ? [{ id: 'axis-start', x: 25, y: -4 }, { id: 'axis-end', x: 25, y: 4 }] : [])],
  entities: [{ id: 'profile-line', type: 'line', start: 'start', end: 'end', construction: false },
    ...(withAxis ? [{ id: 'axis-line', type: 'line', start: 'axis-start', end: 'axis-end', construction: true }] : [])], constraints: [] },
});
module.exports = () => ({ version: 1, id: 'original-thin-wall-operations', name: 'Original thin-wall operations', units: 'mm',
  createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z', features: [
    { id: 'base-profile', name: 'Original R12 cylinder', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [0, 0], radius: 12 } },
    { id: 'base-cylinder', name: 'Original base cylinder', type: 'extrude', suppressed: false, sketchId: 'base-profile',
      depth: 20, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'base-body' } },
    { id: 'wall-rectangle', name: 'Original rectangle wall profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [30, 0], width: 8, height: 6 } },
    { id: 'slot-line', name: 'Original open slot profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 20,
      profile: { kind: 'entities', points: [{ id: 'start', x: -5, y: 0 }, { id: 'end', x: 5, y: 0 }],
        entities: [{ id: 'profile-line', type: 'line', start: 'start', end: 'end', construction: false }], constraints: [] } },
    open('revolve-line', 'Original open revolution profile', 30, -3, 3, 30, true),
    open('groove-line', 'Original open groove profile', 30.5, -2, 2, 30, true),
  ] });
