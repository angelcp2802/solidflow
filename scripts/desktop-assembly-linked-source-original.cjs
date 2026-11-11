'use strict';
// Original GPL-3.0-only test recipe, authored 2026-10-22 from literal rectangles.
// No external CAD data. M0=[0,2]x[0,3]x[0,4], M1=[0,3]x[0,3]x[0,4].
module.exports = function originalLinkedSources() {
  const stamp = '2026-10-22T00:00:00.000Z';
  const part = width => ({ version: 1, id: 'original-linked-part', name: 'Original linked prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [{ id: 'profile', type: 'sketch', name: 'Original rectangle', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [width / 2, 1.5], width, height: 3 } },
    { id: 'solid', type: 'extrude', name: 'Original four mm prism', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'original-linked-body' } }] });
  const occurrence = (id, definition, x = 0) => ({ id, name: id, definition: { ...definition }, pose: { translation: [x, 0, 0], rotation: [0, 0, 0, 1] },
    fixed: true, suppressed: false, visible: true });
  const definition = (width, revision) => ({ kind: 'part', id: 'original-linked-part', revision, document: part(width) });
  const source = (width, revision) => ({ version: 2, kind: 'assembly', id: 'original-linked-subassembly', revision, name: 'Original linked subassembly', units: 'mm',
    createdAt: stamp, updatedAt: stamp, definitions: [definition(width, revision)], occurrences: [occurrence('m', { id: 'original-linked-part', revision })], mates: [] });
  const parent = nested => {
    const s = source(2, 'r0'), embedded = { kind: 'assembly', id: s.id, revision: s.revision, name: s.name, createdAt: stamp, updatedAt: stamp, occurrences: s.occurrences, mates: [] };
    const ref = { id: nested ? s.id : 'original-linked-part', revision: 'r0' };
    return { version: 2, kind: 'assembly', id: 'original-linked-' + (nested ? 'v2' : 'v1') + '-parent', revision: 'r0',
      name: 'Original linked ' + (nested ? 'subassembly' : 'part') + ' parent', units: 'mm', createdAt: stamp, updatedAt: stamp,
      definitions: [definition(2, 'r0'), ...(nested ? [embedded] : [])], occurrences: [occurrence('left', ref, -10), occurrence('right', ref, 20)], mates: [] };
  };
  return { partParent: parent(false), assemblyParent: parent(true), partBefore: part(2), partAfter: part(3),
    assemblyBefore: source(2, 'r0'), assemblyAfter: source(3, 'r1'), assemblySameRevisionChanged: source(3, 'r0') };
};
