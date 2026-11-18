'use strict';
// Original Cartesian 10 x 6 x 4 mm explicit body. Shared saved point identities
// and fixed corners preserve the original profile; this body-catalog path uses
// the actual v1 cap references observed by the native and renderer scenarios.
module.exports = () => {
  const points = [[-5, -3], [5, -3], [5, 3], [-5, 3]].map(([x, y], i) => ({ id: 'corner-' + i, x, y }));
  return { version: 1, id: 'reference-repair-original', name: 'Original support recovery', units: 'mm',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z', features: [
      { id: 'reference-profile', name: 'Original 10 by 6 profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'entities', points,
          entities: points.map((point, i) => ({ id: 'boundary-' + i, type: 'line', start: point.id, end: points[(i + 1) % points.length].id, construction: false })),
          constraints: points.map(point => ({ id: 'fixed-' + point.id, type: 'fix', pointId: point.id, x: point.x, y: point.y })) } },
      { id: 'reference-base', name: 'Original base', type: 'extrude', sketchId: 'reference-profile', depth: 4, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: 'reference-body' } },
    ] };
};
