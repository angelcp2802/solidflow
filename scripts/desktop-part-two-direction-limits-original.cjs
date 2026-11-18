'use strict';

// Original analytical declarations in millimetres; no imported geometry,
// external application files, saved topology or retained native handles.
// The merged stepped base is20*14*18+12*14*12=7056mm3. Two separate read-only
// limit blocks have volumes12*8*3=288 and12*8*6=576. Neither is a cut target.
// The10*6 boss between world planes z-3/16 has V1140/A728. Moving its source
// z5->7 cannot move either anchored end. Its separate second target can be
// edited to z-5: V1260/A792, while the cut keeps its own z-3/16 targets.
// For the4*3 cut crossing the step: removal12*11+6*8=180, leavingV6876.
// Both cut targets remain fixed when the source plane moves, unlike blind11/8.
// Read-only block limits distinguish Next/NextV1140, All/NextV1320,
// Next/AllV1500 and All/AllV1680 for the boss, without using bound margins.
module.exports = () => ({ version: 1, id: 'original-two-direction-limits', name: 'Original independent extrusion limits', units: 'mm',
  createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', features: [
    { id: 'limits-base-profile', name: 'Original lower step profile', type: 'sketch', suppressed: false, plane: 'XY', offset: -10,
      profile: { kind: 'rectangle', center: [10, 7], width: 20, height: 14 } },
    { id: 'limits-base', name: 'Original stepped base', type: 'extrude', suppressed: false, sketchId: 'limits-base-profile',
      depth: 18, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'limits-base-body' } },
    { id: 'limits-upper-profile', name: 'Original upper step profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 8,
      profile: { kind: 'rectangle', center: [6, 7], width: 12, height: 14 } },
    { id: 'limits-upper', name: 'Original upper step', type: 'extrude', suppressed: false, sketchId: 'limits-upper-profile', depth: 12,
      symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'limits-base-body', sourceFeatureId: 'limits-base' } } },
    { id: 'limits-top-profile', name: 'Original upper limit profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 16,
      profile: { kind: 'rectangle', center: [35, 3], width: 12, height: 8 } },
    { id: 'limits-top', name: 'Original upper limit', type: 'extrude', suppressed: false, sketchId: 'limits-top-profile', depth: 3,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'limits-top-body' } },
    { id: 'limits-bottom-profile', name: 'Original lower limit profile', type: 'sketch', suppressed: false, plane: 'XY', offset: -9,
      profile: { kind: 'rectangle', center: [35, 3], width: 12, height: 8 } },
    { id: 'limits-bottom', name: 'Original lower limit', type: 'extrude', suppressed: false, sketchId: 'limits-bottom-profile', depth: 6,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'limits-bottom-body' } },
    { id: 'limits-source-plane', name: 'Original movable source', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 5, reversed: false },
    { id: 'limits-top-plane', name: 'Original upper target', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 16, reversed: false },
    { id: 'limits-bottom-plane', name: 'Original lower target', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: -3, reversed: false },
    { id: 'limits-alternate-plane', name: 'Original independent lower target', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: -5, reversed: false },
    { id: 'limits-plain-profile', name: 'Original boss profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      support: { kind: 'plane', planeId: 'limits-source-plane' }, profile: { kind: 'rectangle', center: [35, 3], width: 10, height: 6 } },
    { id: 'limits-cut-profile', name: 'Original stepped cut profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      support: { kind: 'plane', planeId: 'limits-source-plane' }, profile: { kind: 'rectangle', center: [12, 5.5], width: 4, height: 3 } },
  ] });
