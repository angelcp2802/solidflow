'use strict';

// Original analytical profiles in millimetres, authored for this regression.
// No solid, downstream operation, external model or reference application data.
// GUI changes height 8 -> 10 and revolves x=[0,4] around local Y, then cuts R1.
module.exports = () => ({
  version: 1, id: 'original-revolution-sequence', name: 'Original revolved sleeve', units: 'mm',
  createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  features: [
    { id: 'sleeve-profile', name: 'Sleeve profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [2, 0], width: 4, height: 8 } },
    { id: 'bore-profile', name: 'Bore profile', type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 1 } },
  ],
});
