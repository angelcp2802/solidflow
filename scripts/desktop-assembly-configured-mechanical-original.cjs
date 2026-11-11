'use strict';
// Original millimetre cylinders and prism. No external model or captured data.
// A: R2,H4 -> V16pi,A24pi; B: R1,H3 -> V3pi,A8pi.
// Rack: 2x3x4 -> V24,A52. Two rigid placements reuse the same named state.
module.exports = function createOriginalMechanicalDocument(family = 'lock') {
  if (!['lock', 'concentric', 'gear', 'screw', 'rack-pinion'].includes(family)) throw Error('Fixed original mechanical family required.');
  const stamp = '2026-10-23T00:00:00.000Z';
  const pose = (x = 0, y = 0) => ({ translation: [x, y, 0], rotation: [0, 0, 0, 1] });
  const part = (id, profile, depth) => ({ kind: 'part', id, revision: 'r1', document: { version: 1, id, name: id, units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile },
    { id: 'solid', name: 'Original solid', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false }
  ] } });
  const a = part('mechanical-A', { kind: 'circle', center: [0, 0], radius: 2 }, 4);
  const b = part('mechanical-B', { kind: 'circle', center: [0, 0], radius: 1 }, 3);
  const rack = part('mechanical-rack', { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 }, 4);
  const occurrence = (id, definition, p, fixed) => ({ id, name: id, definition: { id: definition.id, revision: definition.revision }, pose: p, fixed, suppressed: false, visible: true });
  const s = { kind: 'assembly', id: 'mechanical-S', revision: 's-r1', name: 'Original mechanical scope', createdAt: stamp, updatedAt: stamp,
    occurrences: [occurrence('a', a, pose(), true), occurrence('b', b, pose(8), false), occurrence('rack', rack, pose(0, 8), family !== 'rack-pinion')], mates: [] };
  const left = occurrence('left', s, pose(), true), right = occurrence('right', s, pose(30), true);
  right.pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const source = { version: 2, kind: 'assembly', id: 'mechanical-root-' + family, revision: 'root-r1', name: 'Original configured ' + family,
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [a, b, rack, s], occurrences: [left, right], mates: [] };
  const catalog = [
    { definition: { id: source.id, revision: source.revision }, configurations: [
      { id: 'both-compact', name: 'Both compact', occurrences: [{ occurrenceId: 'left', configuration: 'compact' }, { occurrenceId: 'right', configuration: 'compact' }], mates: [] },
      { id: 'mixed', name: 'Right compact', occurrences: [{ occurrenceId: 'right', configuration: 'compact' }], mates: [] }
    ] },
    { definition: { id: s.id, revision: s.revision }, configurations: [
      { id: 'compact', name: 'Compact', occurrences: [{ occurrenceId: 'b', pose: pose(6) }], mates: [] },
      { id: 'dormant', name: 'Dormant original', occurrences: [{ occurrenceId: 'b', pose: pose(12) }], mates: [] }
    ] }
  ];
  return { version: 3, kind: 'configured-assembly', source, catalog, rootConfiguration: 'both-compact' };
};
