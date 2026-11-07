'use strict';

// Original analytical boxes, authored for this regression. No imported CAD,
// stored topology or Combine operation. A/B overlap over5 x10 x10 mm;
// the distant4 mm cubeC is an unrelated witness throughout every operation.
module.exports = () => ({
  version: 1, id: 'original-part-combine', name: 'Original ordered body combinations', units: 'mm',
  createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z',
  features: [
    ['a', 5, 5, 10, 10, 10], ['b', 10, 5, 10, 10, 10], ['c', 32, 2, 4, 4, 4],
  ].flatMap(([id, x, y, width, height, depth]) => [
    { id: 'combine-sketch-' + id, name: 'Original rectangle ' + id.toUpperCase(), type: 'sketch', plane: 'XY', offset: 0,
      suppressed: false, profile: { kind: 'rectangle', center: [x, y], width, height } },
    { id: 'combine-create-' + id, name: 'Original body ' + id.toUpperCase(), type: 'extrude', sketchId: 'combine-sketch-' + id,
      depth, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'combine-body-' + id } },
  ]),
});
