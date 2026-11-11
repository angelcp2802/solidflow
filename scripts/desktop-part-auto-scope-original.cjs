'use strict';
// Original analytical millimetre recipe. No imported model or saved repetition.
module.exports = () => {
  const box = (id, bodyId, x, z, depth) => [
    { id: id + '-profile', name: 'Original profile ' + bodyId, type: 'sketch', plane: 'XY', offset: z, suppressed: false,
      profile: { kind: 'rectangle', center: [x + 2, 2], width: 4, height: 4 } },
    { id, name: 'Original body ' + bodyId, type: 'extrude', sketchId: id + '-profile', depth, symmetric: false,
      bodyOperation: { mode: 'new', bodyId }, suppressed: false },
  ];
  return { version: 1, id: 'auto-scope-original', name: 'Original captured recipe scope', units: 'mm',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z', features: [
      ...box('create-s', 'S', 0, 2, 2),
      { id: 'source-cut-profile', name: 'Original corner cut profile', type: 'sketch', plane: 'XY', offset: 4,
        profile: { kind: 'rectangle', center: [1, 1], width: 2, height: 2 }, suppressed: false },
      { id: 'source-cut', name: 'Original corner cut', type: 'cut', sketchId: 'source-cut-profile', depth: -2, symmetric: false,
        bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-s' }],
        endCondition: { kind: 'throughAll', baseFeatureId: 'create-s', bothDirections: false }, suppressed: false },
      { id: 'source-fill-profile', name: 'Original corner fill profile', type: 'sketch', plane: 'XY', offset: 2,
        profile: { kind: 'rectangle', center: [1, 1], width: 2, height: 2 }, suppressed: false },
      { id: 'source-fill', name: 'Original corner fill', type: 'extrude', sketchId: 'source-fill-profile', depth: 2, symmetric: false,
        bodyOperation: { mode: 'merge', target: { bodyId: 'S', sourceFeatureId: 'source-cut' } }, suppressed: false },
      ...box('create-a', 'A', 10, 2, 2), ...box('create-b', 'B', 10, -4, 4),
      ...box('create-d', 'D', 20, -4, 4), ...box('create-c', 'C', 30, -4, 4),
    ] };
};
