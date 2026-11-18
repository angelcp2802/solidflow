import type { Feature, ReferencePlaneFeature } from '../cad/kernel.types';

export const MAX_RECIPE_DEFINITIONS = 256;

/** Root-first datum ancestry. A face-rooted chain needs its own native owner/role policy. */
export function principalRecipeDatumChain(planeId: string, lookup: (id: string) => Feature | undefined): ReferencePlaneFeature[] | null {
  const chain: ReferencePlaneFeature[] = [], seen = new Set<string>();
  let id = planeId;
  while (!seen.has(id) && chain.length < MAX_RECIPE_DEFINITIONS) {
    const plane = lookup(id);
    if (plane?.type !== 'plane' || plane.suppressed || !Number.isFinite(plane.offset) || Math.abs(plane.offset) > 1_000_000 ||
        typeof plane.reversed !== 'boolean') return null;
    chain.push(plane); seen.add(id);
    if (plane.support.kind === 'principal') return chain.reverse();
    if (plane.support.kind !== 'plane') return null;
    id = plane.support.planeId;
  }
  return null;
}
