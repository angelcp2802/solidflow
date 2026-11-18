'use strict';

// Original millimetre-only analytical recipe authored for this regression.
// It contains no solid, stored topology reference, imported CAD or vendor data.
// XY circular sections and the XZ line give a Z-directed cylinder at the origin.
// The other XY circles give a separate coaxial frustum centred at X=20.
// Ordering leaves the two initial loft sections last for the ordinary command.
module.exports = () => ({
  version: 1, id: 'original-part-sweep-loft', name: 'Original sweep and loft', units: 'mm',
  createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
  features: [
    { id: 'sweep-profile-r2', name: 'Original sweep R2', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'sweep-profile-r3', name: 'Original sweep R3', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 3 } },
    { id: 'sweep-path', name: 'Original LINE Z0 to Z20', type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
      profile: { kind: 'entities', points: [{ id: 'path-start', x: 0, y: 0 }, { id: 'path-end', x: 0, y: 20 }],
        entities: [{ id: 'path-line', type: 'line', start: 'path-start', end: 'path-end', construction: false }], constraints: [] } },
    { id: 'loft-top-r5', name: 'Original loft upper R5', type: 'sketch', plane: 'XY', offset: 12, suppressed: false,
      profile: { kind: 'circle', center: [20, 0], radius: 5 } },
    { id: 'loft-base-r2', name: 'Original loft lower R2', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [20, 0], radius: 2 } },
    { id: 'loft-top-r4', name: 'Original loft upper R4', type: 'sketch', plane: 'XY', offset: 12, suppressed: false,
      profile: { kind: 'circle', center: [20, 0], radius: 4 } },
  ],
});
