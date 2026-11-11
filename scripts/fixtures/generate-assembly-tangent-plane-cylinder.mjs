// Original infinite-support tangent fixture; no vendor geometry, in millimetres.
import { writeFile } from 'node:fs/promises'
const stamp = '2026-10-16T00:00:00.000Z'
const part = (id, name, profile, depth, bodyId, producer) => ({ kind: 'part', id, revision: 'r1', document: {
  version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Perfil original', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile },
    { id: producer, name: 'Sólido original', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId } },
  ],
} })
const ground = part('tangent-ground', 'Plano original 40 por 30 por 4', { kind: 'rectangle', center: [0, 0], width: 40, height: 30 }, 4, 'ground-body', 'ground-solid')
const roller = part('tangent-roller', 'Cilindro original R2 por 12', { kind: 'circle', center: [0, 0], radius: 2 }, 12, 'roller-body', 'roller-solid')
const occurrence = (definition, id, translation, rotation, fixed) => ({ id, name: id, definition: { id: definition.id, revision: definition.revision }, pose: { translation, rotation }, fixed, visible: true, suppressed: false })
const fixture = { version: 2, kind: 'assembly', id: 'assembly-tangent-plane-cylinder-original', revision: 'r1', name: 'Tangencia original de soportes plano y cilindro', units: 'mm', createdAt: stamp, updatedAt: stamp,
  definitions: [ground, roller], occurrences: [occurrence(ground, 'ground', [0, 0, 0], [0, 0, 0, 1], true), occurrence(roller, 'roller', [-6, 0, 10], [0, Math.SQRT1_2, 0, Math.SQRT1_2], false)], mates: [] }
await writeFile(new URL('../../src/cad/fixtures/assembly-tangent-plane-cylinder-original.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n')
