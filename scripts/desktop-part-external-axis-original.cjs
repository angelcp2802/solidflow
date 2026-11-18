'use strict';

// Original analytical millimetre recipe. No imported geometry or saved topology.
// Axis prism: [-3,-2] x [-4,4] x [0,1], V=8. Profile: [5,9] x [-3,3].
// Around Y: annulus R9/r5/H6, V336pi. Around x=2: R7/r3/H6, V240pi.
// Around the original prism's x=-2,z=0 vertical edge: R11/r7/H6, V432pi.
module.exports = () => ({
  version: 1, id: 'original-external-revolution-axis', name: 'Original external revolution axes', units: 'mm',
  createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z',
  features: [
    { id: 'axis-sketch', name: 'Original axis prism profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [-2.5, 0], width: 1, height: 8 } },
    { id: 'axis-block', name: 'Original axis prism', type: 'extrude', sketchId: 'axis-sketch', depth: 1, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: 'axis-body' }, suppressed: false },
    { id: 'external-axis', name: 'Original construction axis', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'entities', points: [{ id: 'axis-start', x: 2, y: -5 }, { id: 'axis-end', x: 2, y: 5 }],
        entities: [{ id: 'axis-line', type: 'line', start: 'axis-start', end: 'axis-end', construction: true }], constraints: [] } },
    { id: 'external-profile', name: 'Original annulus profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [7, 0], width: 4, height: 6 } },
  ],
});
