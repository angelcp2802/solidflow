'use strict';

// Original analytical 4 mm cube, centre (6,0,2), and YZ-offset datum X2.
// Authored for this test; no imported model, pattern, stored topology or vendor data.
module.exports = () => ({
  version: 1, id: 'original-part-pattern-create', name: 'Original pattern cube', units: 'mm',
  createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
  features: [
    { id: 'pattern-square', name: 'Original 4 mm square', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [6, 0], width: 4, height: 4 } },
    { id: 'pattern-create-cube', name: 'Original off-axis cube', type: 'extrude', sketchId: 'pattern-square', depth: 4,
      symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'pattern-seed-body' } },
    { id: 'pattern-plane-x2', name: 'Original mirror plane X2', type: 'plane', support: { kind: 'principal', plane: 'YZ' },
      offset: 2, reversed: false, suppressed: false },
  ],
});
