import type { Feature, ReferencePlaneFeature } from '../cad/kernel.types';

export const MAX_RECIPE_DEFINITIONS = 256;

/** Root-first datum ancestry. A face-rooted chain needs its own native owner/role policy. */
export function principalRecipeDatumChain(planeId: string, lookup: (id: string) => Feature | undefined, includeSuppressed = false): ReferencePlaneFeature[] | null {
  const chain: ReferencePlaneFeature[] = [], seen = new Set<string>();
  let id = planeId;
  while (!seen.has(id) && chain.length < MAX_RECIPE_DEFINITIONS) {
    const plane = lookup(id);
    if (plane?.type !== 'plane' || plane.suppressed && !includeSuppressed || !Number.isFinite(plane.offset) || Math.abs(plane.offset) > 1_000_000 ||
        typeof plane.reversed !== 'boolean') return null;
    chain.push(plane); seen.add(id);
    if (plane.support.kind === 'principal') return chain.reverse();
    if (plane.support.kind !== 'plane') return null;
    id = plane.support.planeId;
  }
  return null;
}

/** Exact selected sketch/datum locator membership. Suppressed declarations retain their saved identity. */
export function transformedSketchSupports(seed: Feature | undefined, lookup: (id: string) => Feature | undefined, purpose: 'active' | 'membership' = 'active'): Feature[] {
  const includeSuppressed = purpose === 'membership';
  if (!seed || seed.type !== 'extrude' && seed.type !== 'cut' || seed.suppressed && !includeSuppressed) return [];
  if (purpose === 'active') {
    if (seed.type === 'cut' ? !seed.bodyScope?.length : seed.bodyOperation?.mode !== 'merge') return [];
    if (Object.hasOwn(seed, 'thinWall')) return [];
  }
  const sketch = lookup(seed.sketchId);
  if (sketch?.type !== 'sketch' || sketch.suppressed && !includeSuppressed || sketch.support?.kind !== 'plane') return [];
  const chain = principalRecipeDatumChain(sketch.support.planeId, lookup, includeSuppressed);
  return chain ? [...chain, sketch] : [];
}
