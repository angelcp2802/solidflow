import { assemblyTangentSideSign, type AssemblyTangentSide } from './assemblyTangentMates'
import { assemblyCylinderTangentTarget, validateAssemblyCylinderTangentBranch,
  assemblyCylinderTangentSupportNormalRelation, type AssemblyCylinderTangentBranch } from './assemblyCylinderTangentMates'

export type AssemblySphereTangentMateType = 'plane-sphere-tangent' | 'sphere-sphere-tangent' | 'cylinder-sphere-tangent'
export type AssemblySphereTangentBranch = AssemblyCylinderTangentBranch

/** Saved intent only. Radii and oriented surfaces must be resolved afresh. */
export function validateAssemblySphereTangentBranch(input: unknown): AssemblySphereTangentBranch {
  return validateAssemblyCylinderTangentBranch(input)
}

/** Same conservative radius arithmetic as cylinder tangency, without role flips. */
export function assemblySphereTangentTarget(branch: AssemblySphereTangentBranch, firstRadius: number, secondRadius: number, lengthTolerance?: number): number {
  return assemblyCylinderTangentTarget(branch, firstRadius, secondRadius, lengthTolerance)
}

/** Analytic support normals; no finite face contact or containment is asserted. */
export function assemblySphereTangentSupportNormalRelation(branch: AssemblySphereTangentBranch, epsilonFirst: 1 | -1, epsilonSecond: 1 | -1): 'same' | 'opposed' {
  return assemblyCylinderTangentSupportNormalRelation(branch, epsilonFirst, epsilonSecond)
}

export function assemblyPlaneSphereTangentSupportNormalRelation(side: AssemblyTangentSide, epsilonSphere: 1 | -1): 'same' | 'opposed' {
  const sign = assemblyTangentSideSign(side)
  if (epsilonSphere !== 1 && epsilonSphere !== -1) throw new Error('Sphere radial material sense must be +1 or -1.')
  return sign * epsilonSphere === 1 ? 'opposed' : 'same'
}
