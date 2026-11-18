'use strict';

// Original analytical 10 × 10 × 10 mm cube, authored for this regression.
// Volume 1000 mm³, surface 600 mm²; no imported CAD, saved topology or private data.
// Density 1000 kg/m³ used by the workflow is synthetic, not a material preset.
module.exports = () => ({
  version: 1, id: 'original-part-properties', name: 'Original material cube', units: 'mm',
  createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
  features: [
    { id: 'original-properties-square', name: 'Original 10 mm square', type: 'sketch', plane: 'XY', offset: 0,
      suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } },
    { id: 'original-properties-extrusion', name: 'Original 10 mm cube', type: 'extrude', sketchId: 'original-properties-square',
      depth: 10, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'original-properties-cube-body' } },
  ],
});
