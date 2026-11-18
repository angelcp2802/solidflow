'use strict';

// Original analytical derivative of the tracked embedded-editor fixture.
// Three nonoverlapping 2*3*4 mm prisms, V24/A52 each, millimetres.
// Same body/feature IDs intentionally occur in two exact source revisions.
// Densities are synthetic test inputs, not a material database/preset.
module.exports = function originalAssemblyPartProperties() {
  const document = require('./desktop-assembly-embedded-part-edit-original.cjs')();
  document.id = 'original-assembly-part-properties';
  document.name = 'Original three-use material assembly';
  const shared = document.definitions[0];
  shared.document.material = { name: 'Synthetic shared', densityKgPerM3: 1000 };
  shared.document.appearance = { color: '#cc6633' };
  const control = structuredClone(shared);
  control.revision = 'r-control';
  control.document.name = 'Original independent revision control';
  control.document.material = { name: 'Synthetic control', densityKgPerM3: 2000 };
  control.document.appearance = { color: '#3366cc' };
  document.definitions.push(control);
  document.occurrences.push({ id: 'control', name: 'control', definition: { id: control.id, revision: control.revision },
    fixed: true, suppressed: false, visible: true, pose: { translation: [10, 0, 0], rotation: [0, 0, 0, 1] } });
  return document;
};
