'use strict';
// Original non-axisymmetric 2 x 3 x 4 mm prism recipe. The moving Z axis is
// already concentric with root Z; the independently authored roll is +30 deg.
module.exports = function originalOriginAxisLock(configured = false) {
  const document = require('./desktop-assembly-origin-axes-original.cjs')(configured);
  const source = configured ? document.source : document;
  source.occurrences[1].pose = { translation: [0, 0, 6], rotation: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] };
  const mate = { id: 'original-axis-lock', name: 'Original axis spin', type: 'concentric', suppressed: false,
    first: { kind: 'principal-axis', axis: 'Z', component: { occurrencePath: ['moving'], definition: { id: 'origin-axis-prism', revision: 'r1' } } },
    second: { kind: 'principal-axis', axis: 'Z', component: null }, alignment: 'aligned', rotationLock: null };
  if (configured) document.catalog[0].configurations[0].mateDeclarations = [mate];
  else source.mates = [mate];
  return document;
};
