'use strict';

// Original analytical plate, millimetres. This is the editable prefix only.
module.exports = () => ({
  version: 1,
  id: 'original-instance-depth-plate',
  name: 'Original instance-depth plate',
  units: 'mm',
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  features: [
    { id: 'plate-profile', name: 'Placa 20 × 8', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [10, 4], width: 20, height: 8 } },
    { id: 'plate', name: 'Placa', type: 'extrude', suppressed: false, sketchId: 'plate-profile', depth: 5, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: 'plate-body' } },
    { id: 'pocket-profile', name: 'Bolsillo 2 × 2', type: 'sketch', suppressed: false, plane: 'XY', offset: 5,
      profile: { kind: 'rectangle', center: [3, 4], width: 2, height: 2 } },
    { id: 'pocket', name: 'Corte semilla', type: 'cut', suppressed: false, sketchId: 'pocket-profile', depth: -1, symmetric: false,
      bodyScope: [{ bodyId: 'plate-body', sourceFeatureId: 'plate' }] },
  ],
});
