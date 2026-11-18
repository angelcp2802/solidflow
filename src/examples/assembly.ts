import { validateAssemblyDocument, type AssemblyDocument, type AssemblyOccurrence, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { identityRigidPose } from '../model/rigidPose'
import { rotationExp } from '../model/assemblyKinematics'
import type { Feature } from '../cad/kernel.types'

export function createEmptyAssembly(name = 'Ensamblaje'): AssemblyDocument {
  const stamp = new Date().toISOString()
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: crypto.randomUUID(), revision: 'r1', name, units: 'mm',
    createdAt: stamp, updatedAt: stamp, definitions: [], occurrences: [], mates: [] })
}
function part(id: string, name: string, features: Feature[]): EmbeddedPartDefinition {
  const stamp = '2026-10-15T00:00:00.000Z'
  return { kind: 'part', id, revision: 'r1', document: validateDocument({ version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp, features }) }
}
/** Original analytical parts. No mates or solved target placements are supplied. */
export function createAssemblyExample(): AssemblyDocument {
  const document = createEmptyAssembly('Placa y dos pasadores')
  document.definitions = [part('example-plate', 'Placa original', [
    { id: 'profile', name: 'Rectángulo 40 × 30', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, 0], width: 40, height: 30 } },
    { id: 'base', name: 'Placa 4 mm', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'plate-body' } },
    ...([-10, 10] as const).flatMap((x, index): Feature[] => [
      { id: `hole-profile-${index}`, name: `Taladro ${index + 1}`, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'circle', center: [x, 0], radius: 3 } },
      { id: `hole-${index}`, name: `Corte ${index + 1}`, type: 'cut', sketchId: `hole-profile-${index}`, depth: 4, symmetric: false, suppressed: false,
        bodyScope: [{ bodyId: 'plate-body', sourceFeatureId: index === 0 ? 'base' : 'hole-0' }] },
    ]),
  ]), part('example-pin', 'Pasador original', [
    { id: 'profile', name: 'Círculo R2', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'base', name: 'Pasador 12 mm', type: 'extrude', sketchId: 'profile', depth: 12, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'pin-body' } },
    { id: 'bore-profile', name: 'Taladro excéntrico R0,25', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [1, 0], radius: .25 } },
    { id: 'bore', name: 'Corte excéntrico', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'pin-body', sourceFeatureId: 'base' }] },
  ])]
  const occurrence = (id: string, name: string, definition: string, fixed = false): AssemblyOccurrence => ({ id, name,
    definition: { id: definition, revision: 'r1' }, pose: identityRigidPose(), fixed, visible: true, suppressed: false })
  const plate = occurrence('plate', 'Placa', 'example-plate', true), left = occurrence('left', 'Pasador izquierdo', 'example-pin'),
    right = occurrence('right', 'Pasador derecho', 'example-pin')
  left.pose = { translation: [-4, 3, -2], rotation: rotationExp([.23, -.17, .31]) }
  right.pose.translation = [14, -7, -1]
  document.occurrences = [plate, left, right]
  return validateAssemblyDocument(document)
}
