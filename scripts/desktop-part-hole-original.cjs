'use strict';

// Original analytical 20 x 12 x 10 mm plate authored for this regression.
// No imported CAD, stored face reference, hole, material or private model.
// The top plane is Z10, with support-frame origin[0,0,10] and world X/Y axes.
// Two authored R1 bores at X=-4/+4,Y=0 remove20*pi mm³ through the plate.
module.exports = () => ({
  version: 1, id: 'original-part-hole', name: 'Original two-centre hole plate', units: 'mm',
  createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
  features: [
    { id: 'original-hole-rectangle', name: 'Original 20 x 12 rectangle', type: 'sketch', plane: 'XY', offset: 0,
      suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 20, height: 12 } },
    { id: 'original-hole-plate', name: 'Original 10 mm plate', type: 'extrude', sketchId: 'original-hole-rectangle',
      depth: 10, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'original-hole-body' } },
  ],
});
