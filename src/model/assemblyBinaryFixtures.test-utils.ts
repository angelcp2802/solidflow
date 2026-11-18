import type { AssemblyMate, AssemblyBinaryMate, AssemblyDocument } from './assemblyDocument'
import { inspectAssemblyMateReferences, isAssemblyBinaryMateInspection } from './assemblyReferences'

/** Existing binary-only fixtures must fail explicitly if their intent changes. */
export function requireBinaryAssemblyMate(mate: AssemblyMate): AssemblyBinaryMate {
  if (mate.type === 'hinge' || mate.type === 'circular-path' || mate.type === 'line-path' || mate.type === 'width' || mate.type === 'symmetry' || mate.type === 'profile-center') throw new Error('This original fixture requires a binary mate.')
  return mate
}
export function inspectBinaryAssemblyMateReferences(document: AssemblyDocument) {
  return inspectAssemblyMateReferences(document).map(inspection => {
    if (!isAssemblyBinaryMateInspection(inspection)) throw new Error('This original fixture requires binary mate inspections.')
    return inspection
  })
}
