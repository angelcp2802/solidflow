'use strict';
// Original 2 x 3 x 4 mm prisms: 24 mm3, 52 mm2 each. No external model.
module.exports = function originalOriginAxes(configured = false) {
  const stamp = '2026-10-23T00:00:00.000Z';
  const part = { kind: 'part', id: 'origin-axis-prism', revision: 'r1', document: {
    version: 1, id: 'origin-axis-prism', name: 'Original axis prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
      { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false },
    ],
  } };
  const occurrence = (id, translation, fixed, degrees = 0) => ({ id, name: id,
    definition: { id: part.id, revision: part.revision }, fixed, visible: true, suppressed: false,
    pose: { translation, rotation: [0, 0, Math.sin(degrees * Math.PI / 360), Math.cos(degrees * Math.PI / 360)] } });
  const source = { version: 2, kind: 'assembly', id: 'original-origin-axes', revision: 'r1', name: 'Original origin axes',
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part],
    occurrences: [occurrence('ground', [-15, 0, 0], true), occurrence('moving', [20, 10, 6], false, 20)], mates: [] };
  if (!configured) return source;
  return { version: 3, kind: 'configured-assembly', source, rootConfiguration: 'demo',
    catalog: [{ definition: { id: source.id, revision: source.revision }, configurations: [
      { id: 'demo', name: 'Origin axes demo', occurrences: [], mates: [] },
      { id: 'untouched', name: 'Unchanged original', occurrences: [], mates: [] },
    ] }] };
};
