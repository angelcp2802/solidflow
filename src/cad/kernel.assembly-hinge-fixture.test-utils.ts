import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { identityRigidPose } from '../model/rigidPose'

/** Original GPL-3.0-only recipe: twelve by four leaf, four deep, R1 axial hole.
 * Literal independent mass/point oracles belong in the acceptance test. */
export function originalHingeDocument(): AssemblyDocument {
  const stamp = '2026-10-23T00:00:00.000Z', part = validateDocument({ version: 1, id: 'original-hinge-leaf', name: 'Original drilled hinge leaf', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'profile', name: 'Original leaf rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [4, 0], width: 12, height: 4 } },
      { id: 'base', name: 'Original four mm leaf', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'original-hinge-body' } },
      { id: 'hole-profile', name: 'Original hinge axis circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 1 } },
      { id: 'hole', name: 'Original through hole', type: 'cut', sketchId: 'hole-profile', depth: 4, symmetric: false, suppressed: false, bodyScope: [{ bodyId: 'original-hinge-body', sourceFeatureId: 'base' }] },
    ] })
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'original-hinge', revision: 'r0', name: 'Original two-leaf hinge control', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', id: part.id, revision: 'r0', document: part }],
    occurrences: ['ground', 'moving'].map(id => ({ id, name: id, definition: { id: part.id, revision: 'r0' },
      pose: id === 'ground' ? identityRigidPose() : { translation: [0, 0, 4], rotation: [0, 0, 0, 1] }, fixed: id === 'ground', suppressed: false, visible: true })), mates: [] })
}
