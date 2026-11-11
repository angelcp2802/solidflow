'use strict';

// Original analytical shapes: two R1 holes, top Z10, at X=-4/+4,Y0.
// Head/shaft and disk/frustum/cone surfaces are derived independently of CAD.
module.exports = function holeVariantOracle(state) {
  const flat = state === 'flat3' || state === 'flat4', shoulder = state === 'shoulder3', tip = state === 'tip3', next = state === 'next90' || state === 'next120';
  if (!flat && !shoulder && !tip && !next) throw Error('Fixed original hole-state oracle required');
  const depth = state === 'flat4' ? 4 : 3, headHeight = state === 'next120' ? 1 / Math.sqrt(3) : 1;
  const shaftHeight = flat ? depth : shoulder ? 3 : tip ? 2 : 4 - headHeight;
  const coneTop = flat ? null : next ? 10 : 10 - shaftHeight;
  const bottom = flat ? 10 - depth : next ? 6 : 10 - shaftHeight - 1;
  const volume = flat ? 2400 - 2 * Math.PI * depth : shoulder ? 2400 - 20 * Math.PI / 3 : tip ? 2400 - 14 * Math.PI / 3
    : 2208 - 8 * Math.PI - 8 * Math.PI * headHeight / 3;
  const area = flat ? 1120 + 4 * Math.PI * depth : shoulder ? 1120 + 10 * Math.PI + 2 * Math.SQRT2 * Math.PI
    : tip ? 1120 + 6 * Math.PI + 2 * Math.SQRT2 * Math.PI : state === 'next90' ? 1392 + 2 * Math.PI + 6 * Math.SQRT2 * Math.PI
      : 1392 + 6 * Math.PI + 8 * Math.PI / Math.sqrt(3);
  return { state, volume, area, min: [-10, -6, 0], max: [10, 6, 10],
    head: next ? { kind: 'countersink', diameter: 4, angle: state === 'next120' ? 120 : 90 } : { kind: 'simple' },
    endCondition: next ? { kind: 'untilNext' } : { kind: 'blind', depth, depthReference: tip ? 'tip' : 'shoulder', tip: flat ? { kind: 'flat' } : { kind: 'conical', angle: 90 } },
    cylinders: [-4, 4].map(x => ({ x, radius: 1, zMin: next ? 6 : 10 - shaftHeight, zMax: next ? 10 - headHeight : 10 })),
    cones: flat ? [] : [-4, 4].map(x => ({ x, radiusMax: next ? 2 : 1, zMin: bottom, zMax: coneTop,
      // Countersink is at the entry, above the cylindrical interval.
      ...(next ? { zMin: 10 - headHeight } : {}), semiAngle: (next && state === 'next120' ? 60 : 45) * Math.PI / 180,
      lateralArea: next ? 3 * Math.PI * Math.hypot(1, headHeight) : Math.SQRT2 * Math.PI })),
    floors: flat ? [-4, 4].map(x => ({ x, z: bottom, area: Math.PI })) : [] };
};
