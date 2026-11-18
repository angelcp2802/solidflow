'use strict';

// Original analytical millimetre declarations, without imported geometry,
// external application files, saved topology or retained native handles.
// The separate R2/H3 cylinder at(40,0) is read-only: V12*pi.
// Rectangle[0,12]x[0,8], outside wall2, depth20:
// outer16*12*20 minus inner12*8*(20-2*c) gives V1920+192*c.
// Caps1: V2112/A2416; caps1.5: V2208/A2376; caps2: V2304/A2336.
// All capped cases share bounds[-2,-2,0]..[14,10,20]. The uncapped tube V1920
// has area2112. Axial midpoint without caps changes only z bounds to[-10,10].
module.exports = () => ({ version: 1, id: 'original-axial-end-caps', name: 'Original axial end caps', units: 'mm',
  createdAt: '2026-10-29T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z', features: [
    { id: 'caps-base-profile', name: 'Original separate cylinder profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [40, 0], radius: 2 } },
    { id: 'caps-base', name: 'Original separate cylinder', type: 'extrude', suppressed: false, sketchId: 'caps-base-profile',
      depth: 3, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'caps-base-body' } },
    { id: 'caps-rectangle', name: 'Original closed cap profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [6, 4], width: 12, height: 8 } },
  ] });
