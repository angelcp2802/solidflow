'use strict';

// Original analytical millimetre fixture; no imported geometry or saved topology.
// The separate R2/H3 cylinder is a read-only body owner: V12*pi.
// Open L: (0,0)->(20,0)->(20,15), extruded10, wall2, inner corner radius3.
// Right: V580+40*pi; left: V500+40*pi; midpoint total2: V540+40*pi.
// Two sides positive2/negative1: V810+67.5*pi. Left radius.001: V619.96+10.01*pi.
// These follow the smoothed spine length L=35-2*rho+rho*pi/2 and the parallel
// band area (p+n)*L+(p*p-n*n)*pi/4, with rho=R+n for this left-turn chain.
module.exports = () => ({ version: 1, id: 'original-auto-corner-workflow', name: 'Original automatic corner workflow', units: 'mm',
  createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', features: [
    { id: 'corner-base-profile', name: 'Original separate cylinder profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [40, 0], radius: 2 } },
    { id: 'corner-base', name: 'Original separate cylinder', type: 'extrude', suppressed: false, sketchId: 'corner-base-profile',
      depth: 3, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'corner-base-body' } },
    { id: 'corner-L', name: 'Original open L profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'entities', points: [{ id: 'start', x: 0, y: 0 }, { id: 'join', x: 20, y: 0 }, { id: 'end', x: 20, y: 15 }],
        entities: [{ id: 'a-horizontal', type: 'line', start: 'start', end: 'join', construction: false },
          { id: 'b-vertical', type: 'line', start: 'join', end: 'end', construction: false }], constraints: [] } },
  ] });
