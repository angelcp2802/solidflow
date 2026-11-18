import { writeFileSync } from 'node:fs';

// Original Cartesian boxes. Fixed IDs and timestamp make generation repeatable.
const stamp = '2026-10-19T00:00:00.000Z';
function part(role, width, height, depth) {
  const id = `limit-angle-${role}`;
  return { version: 1, id, name: `Original angular-limit ${width} by ${height} by ${depth} ${role} block`, units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: `${role}-profile`, name: `Original ${width} by ${height} rectangle`, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width, height } },
      { id: `${role}-solid`, name: `Original ${depth} mm block`, type: 'extrude', sketchId: `${role}-profile`, depth, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: `angle-${role}-body` } },
    ] };
}
const fixed = part('fixed', 40, 30, 4), moving = part('moving', 10, 6, 2);
const occurrence = (value, isFixed, translation, rotation) => ({ id: isFixed ? 'fixed' : 'moving', name: isFixed ? 'Bloque angular fijo original' : 'Bloque angular móvil original',
  definition: { id: value.id, revision: 'r1' }, pose: { translation, rotation }, fixed: isFixed, visible: true, suppressed: false });
const assembly = { version: 2, kind: 'assembly', id: 'assembly-limit-angle-original', revision: 'r1', name: 'Intervalo angular original entre direcciones', units: 'mm',
  createdAt: stamp, updatedAt: stamp,
  occurrences: [occurrence(fixed, true, [0, 0, 0], [0, 0, 0, 1]), occurrence(moving, false, [0, 0, 22], [0.5, 0, 0, Math.sqrt(3) / 2])], mates: [],
  definitions: [fixed, moving].map(value => ({ kind: 'part', id: value.id, revision: 'r1', document: value })) };
writeFileSync(new URL('../../src/cad/fixtures/assembly-limit-angle-original.json', import.meta.url), JSON.stringify(assembly, null, 2) + '\n');
