import type { BodyReference } from './kernel.types';
import type { NativeBodyCatalog } from './kernel.bodies';
import type { RecipeScopeIntent } from '../model/featureRecipes';

/** The selected limit stays 32; native ALL can visit the complete 256-owner catalog. */
export const RECIPE_DYNAMIC_SCOPE_TARGETS = 256;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const key = (ref: Readonly<BodyReference>): string => JSON.stringify([ref.bodyId, ref.sourceFeatureId]);
const sameRef = (a: Readonly<BodyReference>, b: Readonly<BodyReference>): boolean => key(a) === key(b);
const copyRef = (ref: Readonly<BodyReference>): BodyReference => ({ bodyId: ref.bodyId, sourceFeatureId: ref.sourceFeatureId });

export interface NativeRecipeScopeAttestation {
  readonly intent: RecipeScopeIntent;
  /** Derived current refs; never persist these as ALL intent or AUTO capture. */
  readonly targets: readonly Readonly<BodyReference>[];
  readonly inventoryFingerprintInput: string;
}
interface ScopeProof {
  catalog: NativeBodyCatalog;
  inventory: readonly { ref: BodyReference; lineage: string; shape: unknown }[];
}
const proofs = new WeakMap<NativeRecipeScopeAttestation, ScopeProof>();

/**
 * Resolve an already parsed scope using current native identity only. No shape
 * is cloned/deleted and no geometric miss, failed Boolean or face proximity is
 * used as an ownership fallback. AUTO here is captured-identity following;
 * this helper does not discover or authorize a new automatic capture.
 */
export function resolveNativeRecipeScope(intent: RecipeScopeIntent, catalog: NativeBodyCatalog): BodyReference[] {
  const inventory = catalog.entries();
  if (!inventory.length || inventory.length > RECIPE_DYNAMIC_SCOPE_TARGETS) throw new Error('Recipe scope needs 1..256 current native owners.');
  const byId = new Map(inventory.map(entry => [entry.ref.bodyId, entry]));
  if (byId.size !== inventory.length) throw new Error('Current native recipe scope contains duplicate identities.');
  let result: BodyReference[];
  if (intent.mode === 'selected') {
    if (!intent.targets.length || intent.targets.length > 32) throw new Error('Selected recipe scope needs 1..32 exact current targets.');
    result = intent.targets.map(ref => copyRef(catalog.resolve(ref).ref));
  } else if (intent.mode === 'all') {
    if (intent.reevaluateAt !== 'patternInput') throw new Error('ALL must resolve at the actual pattern-input boundary.');
    result = inventory.map(entry => copyRef(catalog.resolve(entry.ref).ref));
  } else if (intent.mode === 'auto') {
    if (intent.follow !== 'sameIdentityAtPatternInput' || !intent.captureFingerprint
      || !intent.capturedBodyIds.length || intent.capturedBodyIds.length > RECIPE_DYNAMIC_SCOPE_TARGETS) {
      throw new Error('AUTO needs an explicit captured-identity policy and capture receipt.');
    }
    result = intent.capturedBodyIds.map(bodyId => {
      const current = byId.get(bodyId);
      if (!current) throw new Error('A captured AUTO identity is unavailable; repair or explicitly recapture its scope.');
      // A legitimate rebuild can advance the state of this same owner. Never
      // adopt a new Combine result or a coincident replacement body instead.
      return copyRef(catalog.resolve(current.ref).ref);
    });
  } else throw new Error('Unknown native recipe scope intent.');
  if (new Set(result.map(ref => ref.bodyId)).size !== result.length) throw new Error('Recipe scope contains repeated owner identities.');
  return result.sort((a, b) => compare(a.bodyId, b.bodyId));
}

/** Match the engine-derived snapshot before target clones or native tools. */
export function attestNativeRecipeScope(intent: RecipeScopeIntent, snapshot: readonly BodyReference[],
  catalog: NativeBodyCatalog): NativeRecipeScopeAttestation {
  const targets = resolveNativeRecipeScope(intent, catalog);
  const actual = [...snapshot].sort((a, b) => compare(a.bodyId, b.bodyId));
  if (actual.length !== targets.length || actual.some((ref, index) => !sameRef(ref, targets[index]))) {
    throw new Error('Recipe scope snapshot does not match the complete current native membership.');
  }
  // Include every current owner, even an ALL no-op, in discovery freshness.
  // AUTO's original capture fingerprint remains an intent field; it is not
  // required to equal the current inventory or follow would be impossible.
  const inventory = catalog.entries().map(entry => ({ ref: copyRef(entry.ref), lineage: entry.lineage, shape: entry.shape }))
    .sort((a, b) => compare(a.ref.bodyId, b.ref.bodyId));
  if (inventory.some(entry => typeof entry.lineage !== 'string' || !entry.lineage.length)) throw new Error('Recipe scope needs current owner lineages.');
  const detachedIntent = structuredClone(intent);
  if (detachedIntent.mode === 'selected') {
    detachedIntent.targets = detachedIntent.targets.map(ref => Object.freeze(copyRef(ref)));
    Object.freeze(detachedIntent.targets);
  } else if (detachedIntent.mode === 'auto') {
    detachedIntent.capturedBodyIds.sort(compare);
    Object.freeze(detachedIntent.capturedBodyIds);
  }
  Object.freeze(detachedIntent);
  const inventoryFingerprintInput = JSON.stringify({ intent: detachedIntent,
    owners: inventory.map(entry => [entry.ref, entry.lineage]) });
  if (inventoryFingerprintInput.length > 1_000_000) throw new Error('Recipe scope inventory fingerprint exceeds its bounded envelope.');
  const result: NativeRecipeScopeAttestation = Object.freeze({ intent: detachedIntent,
    targets: Object.freeze(targets.map(ref => Object.freeze(ref))), inventoryFingerprintInput });
  proofs.set(result, { catalog, inventory });
  return result;
}

/** Re-resolve ALL membership, AUTO identity following and native shape identity. */
export function assertNativeRecipeScopeCurrent(proof: NativeRecipeScopeAttestation, intent: RecipeScopeIntent,
  snapshot: readonly BodyReference[], catalog: NativeBodyCatalog): void {
  const original = proofs.get(proof);
  if (!original || original.catalog !== catalog) throw new Error('Recipe scope attestation is forged or belongs to another native catalog.');
  const fresh = attestNativeRecipeScope(intent, snapshot, catalog), current = proofs.get(fresh)!;
  if (fresh.inventoryFingerprintInput !== proof.inventoryFingerprintInput || current.inventory.length !== original.inventory.length
    || current.inventory.some((entry, index) => !sameRef(entry.ref, original.inventory[index].ref)
      || entry.lineage !== original.inventory[index].lineage || entry.shape !== original.inventory[index].shape)) {
    throw new Error('The native recipe scope membership or owner state changed after preview.');
  }
}
