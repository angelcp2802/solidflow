// Original analytical rack mechanism. No mates, captured zeros or solved replies.
import fs from 'node:fs';
const stamp = '2026-10-16T00:00:00.000Z';
const I = [0, 0, 0, 1], Y90 = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
function part(id, name, profile, depth, holeRadius, holeCenter = [0, 0]) {
  const bodyId = id + '-body';
  const features = [
    { id: 'profile', name: 'Perfil original', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile },
    { id: 'base', name: 'Extrusión original', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId } },
  ];
  if (holeRadius !== undefined) features.push(
    { id: 'hole-profile', name: 'Perfil del taladro', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: holeCenter, radius: holeRadius } },
    { id: 'hole', name: 'Taladro pasante', type: 'cut', sketchId: 'hole-profile', depth, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId, sourceFeatureId: 'base' }] },
  );
  return { kind: 'part', id, revision: 'r1', document: { version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp, features } };
}
const definitions = [
  part('rack-ground', 'Soporte original del piñón', { kind: 'rectangle', center: [0, 0], width: 40, height: 30 }, 4, 3),
  part('rack-pinion', 'Piñón original con marcador', { kind: 'circle', center: [0, 0], radius: 2 }, 30, .25, [1, 0]),
  part('rack-slider', 'Cremallera prismática original', { kind: 'rectangle', center: [0, 0], width: 10, height: 10 }, 60, 2.5),
  part('rack-guide', 'Guía cilíndrica original', { kind: 'circle', center: [0, 0], radius: 2 }, 80),
];
const occurrence = (id, name, definition, translation, rotation = I, fixed = false) => ({ id, name,
  definition: { id: definition, revision: 'r1' }, pose: { translation, rotation: [...rotation] }, fixed, visible: true, suppressed: false });
const document = { version: 2, kind: 'assembly', id: 'assembly-rack-pinion-original', revision: 'r1', name: 'Cremallera y piñón originales', units: 'mm',
  createdAt: stamp, updatedAt: stamp, definitions,
  occurrences: [occurrence('ground', 'Soporte fijo del piñón', 'rack-ground', [0, 0, 0], I, true),
    occurrence('pinion', 'Piñón giratorio', 'rack-pinion', [0, 0, -8]),
    occurrence('rack', 'Cremallera deslizante', 'rack-slider', [-10, 10, 10], Y90),
    occurrence('guide', 'Guía fija de la cremallera', 'rack-guide', [-40, 10, 10], Y90, true)], mates: [] };
fs.writeFileSync(new URL('../../src/cad/fixtures/assembly-rack-pinion-original.json', import.meta.url), JSON.stringify(document, null, 2) + '\n');
