'use strict';
// Original Cartesian millimetre recipe. No saved topology, imported CAD model
// or prepared pattern: the desktop scenario authors the positive ALL pattern.
module.exports = () => {
  const box = (id, bodyId, x) => [
    { id: id + '-profile', name: 'Original profile ' + bodyId, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [x + 2, 2], width: 4, height: 4 } },
    { id, name: 'Original body ' + bodyId, type: 'extrude', sketchId: id + '-profile', depth: 4, symmetric: false,
      suppressed: false, bodyOperation: { mode: 'new', bodyId } },
  ];
  return { version: 1, id: 'positive-all-original', name: 'Original dynamic additive scope', units: 'mm',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z', features: [
      ...box('create-a', 'A', 0),
      { id: 'cap-profile', name: 'Original cap profile', type: 'sketch', plane: 'XY', offset: 4, suppressed: false,
        profile: { kind: 'rectangle', center: [1, 1], width: 2, height: 2 } },
      { id: 'seed-cap', name: 'Original cap', type: 'extrude', sketchId: 'cap-profile', depth: 2, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'merge', target: { bodyId: 'A', sourceFeatureId: 'create-a' } } },
      ...box('create-b', 'B', 10), ...box('create-c', 'C', 30),
    ] };
};
