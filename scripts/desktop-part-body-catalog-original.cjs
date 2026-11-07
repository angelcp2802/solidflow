'use strict';

// Original presentation variant of the original finishing two-prism recipe.
// Only names change. A=[0,10]x[0,6]x[0,4], B=A+[20,0,0]; V240/A248 each.
// No imported geometry, external assets or stored topology references.
module.exports = () => {
  const document = require('./desktop-part-finishing-original.cjs')();
  document.name = 'Original compact body catalog';
  for (const feature of document.features) if (feature.type === 'extrude')
    feature.name = 'Original body ' + (feature.id === 'create-a' ? 'A' : 'B') + ' with a complete descriptive name for keyboard inspection';
  return document;
};
