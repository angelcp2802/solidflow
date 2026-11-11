// Original analytical direction-mate fixture, in millimetres.
import { writeFile } from 'node:fs/promises'
const stamp = '2026-10-16T00:00:00.000Z'
const definition = { kind: 'part', id: 'direction-block', revision: 'r1', document: {
  version: 1, id: 'direction-block', name: 'Bloque original con plano, eje y arista LINE', units: 'mm', createdAt: stamp, updatedAt: stamp,
  features: [
    { id: 'profile', name: 'Rectángulo original 10 por 6', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 } },
    { id: 'base', name: 'Prisma original 4 mm', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'block-body' } },
    { id: 'bore-profile', name: 'Círculo original excéntrico R1', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [2, 0], radius: 1 } },
    { id: 'bore', name: 'Taladro original pasante', type: 'cut', sketchId: 'bore-profile', depth: 4, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'block-body', sourceFeatureId: 'base' }] },
  ],
} }
const occurrence = (id, translation, rotation, fixed) => ({ id, name: id, definition: { id: definition.id, revision: definition.revision },
  pose: { translation, rotation }, fixed, visible: true, suppressed: false })
const fixture = { version: 2, kind: 'assembly', id: 'assembly-direction-original', revision: 'r1', name: 'Relaciones de dirección originales',
  units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [definition], occurrences: [
    occurrence('ground', [0, 0, 0], [0, 0, 0, 1], true),
    occurrence('moving', [20, 10, 6], [Math.sin(Math.PI / 12), 0, 0, Math.cos(Math.PI / 12)], false),
  ], mates: [] }
await writeFile(new URL('../../src/cad/fixtures/assembly-direction-mates-original.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n')
