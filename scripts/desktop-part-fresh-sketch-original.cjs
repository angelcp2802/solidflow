'use strict';
// Original analytical box; no external geometry or prepared downstream sketches.
module.exports = () => ({ version: 1, id: 'fresh-support-original', name: 'Original fresh face sketches', units: 'mm',
  createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', features: [
    { id: 'fresh-base-profile', name: 'Original base profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, 0], width: 20, height: 12 } },
    { id: 'fresh-base', name: 'Original base', type: 'extrude', sketchId: 'fresh-base-profile', depth: 4, symmetric: false,
      suppressed: false, bodyOperation: { mode: 'new', bodyId: 'fresh-body' } },
  ] });
