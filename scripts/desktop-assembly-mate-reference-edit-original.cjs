'use strict';

// Original analytical construction, reusing the tracked 3 x 2 x 4 mm prism.
// Five occurrences: V=120 mm3, A=260 mm2 before and after rigid placement.
// Each moving occurrence has its own constraint against the root. No vendor
// file, private model, captured topology identifier or imported solver result.
module.exports = function originalMateReferenceEdit() {
  const document = require('./desktop-assembly-basic-authoring-original.cjs')();
  const definition = { id: document.id, revision: 'r1' };
  const ref = (kind, id, value) => ({ kind, component: id ? { occurrencePath: [id], definition: { ...definition } } : null,
    [kind === 'principal-plane' ? 'plane' : 'axis']: value });
  const occurrence = (id, translation, fixed = false, degrees = 0) => ({ id, name: id, definition: { ...definition }, fixed,
    visible: true, suppressed: false, pose: { translation, rotation: [0, 0, Math.sin(degrees * Math.PI / 360), Math.cos(degrees * Math.PI / 360)] } });
  const mate = (type, first, second, fields = {}) => ({ id: 'original-' + type, name: 'Original ' + type, type, first, second, suppressed: false, ...fields });
  return { version: 2, kind: 'assembly', id: 'original-mate-reference-edit', revision: 'r1', name: 'Original reference editing', units: 'mm',
    createdAt: document.createdAt, updatedAt: document.updatedAt, definitions: [{ ...definition, kind: 'part', document }],
    occurrences: [occurrence('ground', [-8, 0, 0], true), occurrence('distance', [8, 0, 0]), occurrence('angle', [0, 8, 0]),
      occurrence('coincident', [-8, 8, 0]), occurrence('concentric', [0, 0, 8], false, 30)],
    mates: [
      mate('distance', ref('principal-plane', null, 'YZ'), ref('principal-plane', 'distance', 'YZ'), { distance: -8, alignment: 'aligned' }),
      mate('angle', ref('principal-axis', null, 'Z'), ref('principal-axis', 'angle', 'X'), { angle: 90 }),
      mate('coincident', ref('principal-plane', null, 'XY'), ref('principal-plane', 'coincident', 'XY'), { alignment: 'aligned' }),
      mate('concentric', ref('principal-axis', null, 'Z'), ref('principal-axis', 'concentric', 'Z'),
        { alignment: 'aligned', rotationLock: [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] }),
    ] };
};
