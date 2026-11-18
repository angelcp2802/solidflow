'use strict';

// Original analytical declarations in millimetres, without imported geometry,
// external application files, saved topology or retained native handles.
// The merged stepped base has V20*14*18+12*14*12=7056 and bounds
// [0,0,-10]..[20,14,20]. The three unused profiles follow the original z5 plane.
// Plain10*6, D1=13/D2=7: V1200, z[-2,18]; reverse z[-8,12].
// Closed12*8, outsidewall2, totalH20/caps4: V16*12*20-12*8*12=2688.
// This leaves one core over both branches, including the source plane; treating
// each branch as a separately capped prism cannot produce that geometry.
// Cut[10,14]x[4,7], D1=11/D2=8: z[-3,16], removes12*11+6*8=180,
// leaving V6876. Moving only the source plane5->7 shifts z[-1,18], removes
// 12*9+6*10=168, and leaves V6888. These are fixed depths, not anchored ends.
module.exports = () => ({ version: 1, id: 'original-two-direction-extrusions', name: 'Original two-direction extrusions', units: 'mm',
  createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', features: [
    { id: 'two-base-profile', name: 'Original lower step profile', type: 'sketch', suppressed: false, plane: 'XY', offset: -10,
      profile: { kind: 'rectangle', center: [10, 7], width: 20, height: 14 } },
    { id: 'two-base', name: 'Original stepped base', type: 'extrude', suppressed: false, sketchId: 'two-base-profile',
      depth: 18, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'two-base-body' } },
    { id: 'two-upper-profile', name: 'Original upper step profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 8,
      profile: { kind: 'rectangle', center: [6, 7], width: 12, height: 14 } },
    { id: 'two-upper', name: 'Original upper step', type: 'extrude', suppressed: false, sketchId: 'two-upper-profile', depth: 12,
      symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'two-base-body', sourceFeatureId: 'two-base' } } },
    { id: 'two-source-plane', name: 'Original source plane', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 5, reversed: false },
    { id: 'two-limit-plane', name: 'Original recovery limit', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 16, reversed: false },
    { id: 'two-plain-profile', name: 'Original plain profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      support: { kind: 'plane', planeId: 'two-source-plane' }, profile: { kind: 'rectangle', center: [35, 3], width: 10, height: 6 } },
    { id: 'two-caps-profile', name: 'Original capped profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      support: { kind: 'plane', planeId: 'two-source-plane' }, profile: { kind: 'rectangle', center: [61, 4], width: 12, height: 8 } },
    { id: 'two-cut-profile', name: 'Original stepped cut profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      support: { kind: 'plane', planeId: 'two-source-plane' }, profile: { kind: 'rectangle', center: [12, 5.5], width: 4, height: 3 } },
  ] });
