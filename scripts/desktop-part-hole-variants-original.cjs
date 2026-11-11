'use strict';

// Original 20x12x10 plate from the tracked normal Hole workflow. For UntilNext,
// a sealed 12x8x2 cavity at Z4..6 gives a first exit at Z6 while material remains
// below it. Both bore axes stay at X=-4/+4,Y0. No imported geometry or face keys.
module.exports = function originalHoleVariant(variant = 'flat') {
  if (!['flat', 'conical', 'next'].includes(variant)) throw Error('Fixed original hole variant required');
  const document = require('./desktop-part-hole-original.cjs')();
  document.id = 'original-hole-variant-' + variant;
  document.name = 'Original hole variant ' + variant;
  if (variant === 'next') document.features.push(
    { id: 'original-cavity-profile', name: 'Original sealed cavity profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 4,
      profile: { kind: 'rectangle', center: [0, 0], width: 12, height: 8 } },
    { id: 'original-cavity', name: 'Original sealed cavity', type: 'cut', suppressed: false, sketchId: 'original-cavity-profile', depth: 2, symmetric: false,
      bodyScope: [{ bodyId: 'original-hole-body', sourceFeatureId: 'original-hole-plate' }] });
  return document;
};
