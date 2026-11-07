// Original analytical flat-export fixture; no imported CAD or solver output.
import { writeFile } from 'node:fs/promises'
const stamp = '2026-10-16T00:00:00.000Z', H = Math.SQRT1_2
const pose = (translation = [0, 0, 0], rotation = [0, 0, 0, 1]) => ({ translation, rotation })
const occurrence = (id, definition, placement = pose(), state = {}) => ({ id, name: id, definition: { id: definition, revision: 'r1' },
  pose: placement, fixed: false, visible: true, suppressed: false, ...state })
const prism = (id, min, size, bodyId) => [
  { id: id + '-profile', name: id + ' original rectangle', type: 'sketch', plane: 'XY', offset: min[2], suppressed: false,
    profile: { kind: 'rectangle', center: [min[0] + size[0] / 2, min[1] + size[1] / 2], width: size[0], height: size[1] } },
  { id, name: id + ' original prism', type: 'extrude', sketchId: id + '-profile', depth: size[2], symmetric: false, suppressed: false,
    ...(bodyId ? { bodyOperation: { mode: 'new', bodyId } } : {}) },
]
const part = (id, features) => ({ kind: 'part', id, revision: 'r1', document: { version: 1, id, name: id, units: 'mm',
  createdAt: stamp, updatedAt: stamp, features } })
const fixture = { version: 2, kind: 'assembly', id: 'flat-export-root', revision: 'r1', name: 'Original flat assembly export',
  units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [
    part('flat-legacy', prism('legacy-prism', [0, 0, 0], [10, 6, 4])),
    part('flat-explicit', [...prism('box-a', [0, 0, 0], [2, 3, 4], 'A'), ...prism('box-b', [10, 0, 0], [1, 2, 3], 'B')]),
    part('flat-empty', []),
    { kind: 'assembly', id: 'flat-subassembly', revision: 'r1', name: 'Original shared rigid boxes', createdAt: stamp, updatedAt: stamp, occurrences: [
      occurrence('legacy-child', 'flat-legacy', pose([3, 4, -8], [H, 0, 0, H])),
      occurrence('multi-child', 'flat-explicit'),
      occurrence('suppressed-child', 'flat-legacy', pose([-1000, 0, 0]), { suppressed: true }),
    ], mates: [] },
  ], occurrences: [
    occurrence('first', 'flat-subassembly', pose([10, -2, 1], [0, 0, H, H])),
    occurrence('second', 'flat-subassembly', pose([40, 0, 0]), { visible: false }),
    occurrence('coincident', 'flat-legacy', pose([6, 1, -7], [.5, .5, .5, .5])),
    occurrence('suppressed-empty', 'flat-empty', pose([1000, 0, 0]), { suppressed: true }),
    occurrence('suppressed-assembly', 'flat-subassembly', pose([1000, 0, 0]), { suppressed: true }),
  ], mates: [] }
await writeFile(new URL('../../src/cad/fixtures/assembly-flat-export-original.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n')
