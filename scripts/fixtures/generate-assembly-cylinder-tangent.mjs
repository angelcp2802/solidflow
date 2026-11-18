// Original cylinder-support fixtures, millimetres; no measured/vendor geometry.
import { writeFile } from 'node:fs/promises'
const stamp = '2026-10-16T00:00:00.000Z'
const part = (id, radius, depth, bodyId) => ({ kind: 'part', id, revision: 'r1', document: {
  version: 1, id, name: `Cilindro original R${radius} por ${depth}`, units: 'mm', createdAt: stamp, updatedAt: stamp,
  features: [
    { id: 'profile', name: 'Círculo original', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius } },
    { id: `${bodyId}-solid`, name: 'Cilindro original', type: 'extrude', sketchId: 'profile', depth, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId } },
  ],
} })
const fixed = part('cylinder-tangent-fixed', 2, 12, 'fixed-body')
const moving = part('cylinder-tangent-moving', 3, 10, 'moving-body')
const occurrence = (definition, id, translation, rotation, grounded) => ({ id, name: id,
  definition: { id: definition.id, revision: definition.revision }, pose: { translation, rotation },
  fixed: grounded, visible: true, suppressed: false })
for (const family of ['skew', 'parallel']) {
  const fixture = { version: 2, kind: 'assembly', id: `assembly-cylinder-tangent-${family}-original`, revision: 'r1',
    name: family === 'skew' ? 'Tangencia original de cilindros con ejes no paralelos' : 'Tangencia original de cilindros con paralelismo',
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [fixed, moving],
    occurrences: [occurrence(fixed, 'fixed', [0, 0, -6], [0, 0, 0, 1], true),
      occurrence(moving, 'moving', family === 'skew' ? [7, -5, 0] : [7, 0, -5],
        family === 'skew' ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1], false)], mates: [] }
  await writeFile(new URL(`../../src/cad/fixtures/assembly-cylinder-tangent-${family}-original.json`, import.meta.url), JSON.stringify(fixture, null, 2) + '\n')
}
