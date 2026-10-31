// Original analytical mechanism, authored from rectangles and circular supports.
// This generator supplies initial placements only; it does not solve or save mates.
import fs from 'node:fs';
const stamp = '2026-10-16T00:00:00.000Z';
const pose = translation => ({ translation, rotation: [0, 0, 0, 1] });
function part(id, name, profile, depth, holeRadius, holeCenter = [0, 0]) {
  const bodyId = id + '-body';
  return { kind: 'part', id, revision: 'r1', document: { version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'profile', name: 'Perfil original', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile },
      { id: 'base', name: 'Extrusión original', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId } },
      { id: 'hole-profile', name: 'Círculo del taladro', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'circle', center: holeCenter, radius: holeRadius } },
      { id: 'hole', name: 'Taladro pasante', type: 'cut', sketchId: 'hole-profile', depth, symmetric: false, suppressed: false,
        bodyScope: [{ bodyId, sourceFeatureId: 'base' }] },
    ] } };
}
const definitions = [
  part('screw-ground', 'Soporte original', { kind: 'rectangle', center: [0, 0], width: 40, height: 30 }, 4, 3),
  part('screw-shaft', 'Eje original con marcador', { kind: 'circle', center: [0, 0], radius: 2 }, 30, .25, [1, 0]),
  part('screw-nut', 'Corredera original', { kind: 'rectangle', center: [0, 0], width: 10, height: 10 }, 6, 2.5),
];
const occurrence = (id, name, definition, translation, fixed = false) => ({ id, name,
  definition: { id: definition, revision: 'r1' }, pose: pose(translation), fixed, visible: true, suppressed: false });
const document = { version: 2, kind: 'assembly', id: 'assembly-screw-original', revision: 'r1', name: 'Eje y corredera originales', units: 'mm',
  createdAt: stamp, updatedAt: stamp, definitions,
  occurrences: [occurrence('ground', 'Soporte fijo', 'screw-ground', [0, 0, 0], true),
    occurrence('shaft', 'Eje giratorio', 'screw-shaft', [0, 0, -8]),
    occurrence('nut', 'Corredera deslizante', 'screw-nut', [0, 0, 10])], mates: [] };
fs.writeFileSync(new URL('../../src/cad/fixtures/assembly-screw-original.json', import.meta.url), JSON.stringify(document, null, 2) + '\n');
