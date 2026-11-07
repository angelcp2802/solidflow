'use strict';

// Original analytical fixture authored for the embedded-part editor. Millimeters.
// The legacy rectangle recipe follows desktop-assembly-origin-axes-original.cjs:
// 2 x 3 x 4, V=24 and A=2*(6+8+12)=52 per solid. Both occurrences reuse one
// explicit body. The moving occurrence is ten millimeters above the fixed base.
// A declared root-Z concentric relation with identity relative rotation leaves
// axial travel. The workflow creates the closing material-top distance from
// actual native face choices; this fixture contains no captured topology IDs.
// Width 2->3 and center X 1->1.5 preserve the lower X boundary. Updated solids
// have V=36/A=66 each; total V=72/A=132 and bounds[0,0,0]..[3,3,14].
// No external model, vendor data or solver output is used.
module.exports = function embeddedPartEditOriginal() {
  const stamp = '2026-10-29T00:00:00.000Z';
  const source = { id: 'embedded-edit-prism', revision: 'r0' };
  const part = { kind: 'part', ...source, document: {
    version: 1, id: source.id, name: 'Original shared 2 by 3 by 4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'embedded-profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
      { id: 'embedded-solid', name: 'Original four millimeter extrusion', type: 'extrude', sketchId: 'embedded-profile', depth: 4,
        symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'embedded-body' } },
    ],
  } };
  const occurrence = (id, z, fixed) => ({ id, name: id, definition: { ...source }, fixed, suppressed: false, visible: true,
    pose: { translation: [0, 0, z], rotation: [0, 0, 0, 1] } });
  return { version: 2, kind: 'assembly', id: 'original-embedded-part-edit', revision: 'r1', name: 'Original embedded part editing',
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part],
    occurrences: [occurrence('base', 0, true), occurrence('moving', 10, false)],
    mates: [{ id: 'embedded-root-z', name: 'Original root Z with rotation locked', type: 'concentric', suppressed: false,
      first: { kind: 'principal-axis', component: null, axis: 'Z' },
      second: { kind: 'principal-axis', component: { occurrencePath: ['moving'], definition: { ...source } }, axis: 'Z' },
      alignment: 'aligned', rotationLock: [0, 0, 0, 1] }],
  };
};
