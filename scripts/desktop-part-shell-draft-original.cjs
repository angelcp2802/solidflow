'use strict';

// Original analytical cube [-5,5] x [-5,5] x [0,10], authored for this test.
// No imported geometry, stored topology, shell/draft feature or private model.
module.exports = () => ({
  version: 1, id: 'original-part-shell-draft', name: 'Original face-operation cube', units: 'mm',
  createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
  features: [
    { id: 'face-square', name: 'Original 10 mm square', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } },
    { id: 'face-create-cube', name: 'Original 10 mm cube', type: 'extrude', sketchId: 'face-square', depth: 10,
      symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'face-operation-body' } },
  ],
});
