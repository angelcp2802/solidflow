import { readFileSync, writeFileSync } from 'node:fs';

const baseSphere = JSON.parse(readFileSync(new URL('../../src/cad/fixtures/sphere-revolve-original.json', import.meta.url), 'utf8'));
const stamp = '2026-10-16T00:00:00.000Z';
const document = (id, name, features) => ({ version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp, features });
function sphere(radius) {
  const value = structuredClone(baseSphere);
  value.id = `sphere-source-r${radius}`; value.name = `Original R${radius} revolved sphere`;
  value.features[0].profile.points = [{ id: 'south', x: 0, y: -radius }, { id: 'north', x: 0, y: radius }];
  return value;
}
const block = document('sphere-tangent-plane', 'Original 40 by 30 by 4 plane block', [
  { id: 'plane-profile', name: 'Original 40 by 30 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', center: [0, 0], width: 40, height: 30 } },
  { id: 'plane-solid', name: 'Original 4 mm block', type: 'extrude', sketchId: 'plane-profile', depth: 4, symmetric: false,
    suppressed: false, bodyOperation: { mode: 'new', bodyId: 'sphere-plane-body' } },
]);
const cylinder = document('sphere-tangent-cylinder', 'Original R2 by 12 cylinder', [
  { id: 'cylinder-profile', name: 'Original R2 circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [0, 0], radius: 2 } },
  { id: 'cylinder-solid', name: 'Original 12 mm cylinder', type: 'extrude', sketchId: 'cylinder-profile', depth: 12, symmetric: false,
    suppressed: false, bodyOperation: { mode: 'new', bodyId: 'sphere-cylinder-body' } },
]);
const cases = [
  { family: 'plane-sphere', name: 'Original unmated plane and sphere', fixedName: 'Fixed original block', fixed: block, fixedTranslation: [0, 0, 0], movingTranslation: [0, 0, 10] },
  { family: 'sphere-sphere', name: 'Original unmated pair of spheres', fixedName: 'Fixed original R2 sphere', fixed: sphere(2), fixedTranslation: [0, 0, 0], movingTranslation: [7, 0, 0] },
  { family: 'cylinder-sphere', name: 'Original unmated cylinder and sphere', fixedName: 'Fixed original cylinder', fixed: cylinder, fixedTranslation: [0, 0, -6], movingTranslation: [7, 0, 0] },
];
for (const value of cases) {
  const moving = sphere(3), id = `assembly-${value.family}-tangent-original`;
  const occurrence = (part, fixed, name, translation) => ({ id: fixed ? 'fixed' : 'moving', name,
    definition: { id: part.id, revision: 'r1' }, pose: { translation, rotation: [0, 0, 0, 1] }, fixed, visible: true, suppressed: false });
  const assembly = { version: 2, kind: 'assembly', id, revision: 'r1', name: value.name, units: 'mm', createdAt: stamp, updatedAt: stamp,
    occurrences: [occurrence(value.fixed, true, value.fixedName, value.fixedTranslation), occurrence(moving, false, 'Free original R3 sphere', value.movingTranslation)],
    mates: [], definitions: [value.fixed, moving].map(part => ({ kind: 'part', id: part.id, revision: 'r1', document: part })) };
  writeFileSync(new URL(`../../src/cad/fixtures/${id}.json`, import.meta.url), JSON.stringify(assembly, null, 2) + '\n');
}
