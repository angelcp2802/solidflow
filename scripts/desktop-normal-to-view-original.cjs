'use strict';

// Independently authored analytical solids, without imported CAD or vendor data.
// Each 20 x 12 x 4 mm prism has a blind cylindrical pocket: radius 1.5 mm,
// centre (-4, 1), depth 2 mm from Z=4. V = 960 - 4.5*pi mm3.
// Native BRep area = 736 + 6*pi mm2; tessellated curved area is not that oracle.
function createNormalToDocuments() {
  const stamp = '2026-10-26T00:00:00.000Z';
  const part = { version: 1, id: 'normal-view-original-part', name: 'Original normal-view pocket', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'normal-profile', name: 'Original base profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 20, height: 12 } },
      { id: 'normal-base', name: 'Original base', type: 'extrude', sketchId: 'normal-profile', depth: 4, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId: 'normal-body' } },
      { id: 'normal-pocket-profile', name: 'Original pocket profile', type: 'sketch', plane: 'XY', offset: 4, suppressed: false,
        profile: { kind: 'entities', points: [{ id: 'pocket-centre', x: -4, y: 1 }],
          entities: [{ id: 'pocket-circle', type: 'circle', center: 'pocket-centre', radius: 1.5, construction: false }], constraints: [] } },
      { id: 'normal-pocket', name: 'Original blind pocket', type: 'cut', sketchId: 'normal-pocket-profile', depth: -2, symmetric: false,
        suppressed: false, bodyScope: [{ bodyId: 'normal-body', sourceFeatureId: 'normal-base' }] },
    ] };
  const definition = { kind: 'part', id: part.id, revision: 'r1', document: structuredClone(part) };
  const occurrence = (id, translation, rotation) => ({ id, name: id, definition: { id: definition.id, revision: definition.revision },
    fixed: true, visible: true, suppressed: false, pose: { translation, rotation } });
  const standard = { version: 2, kind: 'assembly', id: 'normal-view-original-assembly', revision: 'r1', name: 'Original normal-view assembly',
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [definition],
    occurrences: [occurrence('ground', [0, 0, 0], [0, 0, 0, 1]), occurrence('turned', [30, 0, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2])], mates: [] };
  const configured = { version: 3, kind: 'configured-assembly', source: structuredClone(standard), rootConfiguration: 'original',
    catalog: [{ definition: { id: standard.id, revision: standard.revision }, configurations: [
      { id: 'original', name: 'Original state', occurrences: [], mates: [] },
    ] }] };
  return { part, standard, configured };
}

module.exports = { createNormalToDocuments };
