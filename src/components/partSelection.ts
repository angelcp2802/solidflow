import type { EdgeReference, PickableFace } from '../cad/kernel.types'

export type PartSelectionMode = 'auto' | 'face' | 'edge' | 'body'
export type PartReferenceCandidate =
  | { kind: 'edge'; reference: EdgeReference }
  | { kind: 'face'; face: PickableFace }
  | { kind: 'plane'; id: string }

/** Hover and activation share the same visible-geometry policy. Pickers retain
 * their own pixel tolerance, clipping, occlusion and exact-reference checks. */
export function pickPartReference(
  mode: Exclude<PartSelectionMode, 'body'>,
  pickers: { edge: () => EdgeReference | null; face: () => PickableFace | null; plane: () => string | null },
): PartReferenceCandidate | null {
  if (mode !== 'face') {
    const reference = pickers.edge()
    if (reference) return { kind: 'edge', reference }
    if (mode === 'edge') return null
  }
  const face = pickers.face()
  if (face) return { kind: 'face', face }
  const id = pickers.plane()
  return id ? { kind: 'plane', id } : null
}
