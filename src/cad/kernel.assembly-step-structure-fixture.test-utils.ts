import {
  validateAssemblyDocument,
  type AssemblyDocument,
  type AssemblyOccurrence,
  type EmbeddedAssemblyDefinition,
  type EmbeddedPartDefinition,
} from '../model/assemblyDocument'
import type { Quaternion } from '../model/rigidPose'
import type { Vec3 } from './kernel.types'

const stamp = '2026-10-23T00:00:00.000Z'
const h = Math.SQRT1_2
const identity: Quaternion = [0, 0, 0, 1]
const rx: Quaternion = [h, 0, 0, h]
const ry: Quaternion = [0, h, 0, h]
const rz: Quaternion = [0, 0, h, h]

function part(id: string, revision: string, name: string, size: Vec3): EmbeddedPartDefinition {
  return {
    kind: 'part', id, revision,
    document: {
      version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp,
      features: [
        {
          id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY',
          offset: 0, suppressed: false,
          profile: { kind: 'rectangle', center: [size[0] / 2, size[1] / 2], width: size[0], height: size[1] },
        },
        {
          id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile',
          depth: size[2], symmetric: false, suppressed: false,
          bodyOperation: { mode: 'new', bodyId: 'box' },
        },
      ],
    },
  }
}

function occurrence(
  id: string,
  definition: { id: string; revision: string },
  rotation: Quaternion = identity,
  translation: Vec3 = [0, 0, 0],
): AssemblyOccurrence {
  return {
    id, name: id, definition: { id: definition.id, revision: definition.revision },
    pose: { rotation: [...rotation], translation: [...translation] },
    fixed: false, suppressed: false, visible: true,
  }
}

export interface AssemblyStepStructureFixtureOptions {
  hiddenRight?: boolean
  suppressedRight?: boolean
}

/**
 * Independently authored millimetre boxes and literal proper quarter rotations.
 * P/Q intentionally share BOTH display name and geometry, but not ID/revision.
 * S={a:P, b:Rx90 Q+(10,0,0), c:Rz90 C+(0,10,0)};
 * G={s:Ry90 S+(0,0,20)}; root={left:Rz90 G+(100,0,0),
 * right:Rx90 G+(0,100,0)}. Rotation order is noncommuting.
 *
 * P/Q: V=24, A=52; C: V=10, A=34. Expanded totals: V=116, A=276.
 * Literal world bounds, ordered left a/b/c then right a/b/c:
 * [97,0,18]..[100,4,20]; [100,0,8]..[104,3,10];
 * [89,0,20]..[90,5,22]; [0,80,0]..[4,82,3];
 * [0,90,-4]..[3,92,0]; [0,78,10]..[5,80,11].
 * Hiding right preserves all six export solids under the existing flat policy;
 * suppressing right removes its three descendants (remaining V=58, A=138).
 * This fixture supplies declarations, not evidence of a STEP writer's hierarchy.
 */
export function assemblyStepStructureFixture(options: AssemblyStepStructureFixtureOptions = {}): AssemblyDocument {
  const p = part('structure-part-P', 'p-r1', 'Pieza "gemela" ñ', [2, 3, 4])
  const q = part('structure-part-Q', 'q-r2', 'Pieza "gemela" ñ', [2, 3, 4])
  const c = part('structure-part-C', 'c-r1', 'Pieza distinta Ω', [1, 2, 5])
  const s: EmbeddedAssemblyDefinition = {
    kind: 'assembly', id: 'structure-S', revision: 's-r1', name: 'Módulo "S" ñ',
    createdAt: stamp, updatedAt: stamp, mates: [],
    occurrences: [occurrence('a', p), occurrence('b', q, rx, [10, 0, 0]), occurrence('c', c, rz, [0, 10, 0])],
  }
  const g: EmbeddedAssemblyDefinition = {
    kind: 'assembly', id: 'structure-G', revision: 'g-r1', name: 'Grupo "G" Ω',
    createdAt: stamp, updatedAt: stamp, mates: [],
    occurrences: [occurrence('s', s, ry, [0, 0, 20])],
  }
  const left = occurrence('left', g, rz, [100, 0, 0])
  const right = occurrence('right', g, rx, [0, 100, 0])
  right.visible = !options.hiddenRight
  right.suppressed = options.suppressedRight ?? false
  return validateAssemblyDocument({
    version: 2, kind: 'assembly', id: 'structure-root', revision: 'root-r1',
    name: 'Conjunto "Árbol" Ω', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [p, q, c, s, g], occurrences: [left, right], mates: [],
  })
}
