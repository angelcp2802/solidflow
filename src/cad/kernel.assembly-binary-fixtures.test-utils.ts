import { isResolvedAssemblyBinaryMate, type ResolvedAssemblyMate, type ResolvedAssemblyBinaryMate } from './kernel.assembly-snapshot'

/** Narrow original binary fixtures while leaving the resolver's general API intact. */
export function requireResolvedBinaryMate(mate: ResolvedAssemblyMate): ResolvedAssemblyBinaryMate {
  if (!isResolvedAssemblyBinaryMate(mate)) throw new Error('This original native fixture requires a binary mate.')
  return mate
}
