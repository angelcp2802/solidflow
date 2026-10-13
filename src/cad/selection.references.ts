import type { EdgeReference, FaceReference } from "./kernel.types";

type SelectionReference = FaceReference | EdgeReference;

interface ReferenceCandidate {
  readonly ref: SelectionReference;
  readonly aliases?: readonly SelectionReference[];
}

/** Identity of a saved reference, including its exact historical source. */
export const referenceIdentity = (ref: SelectionReference): string =>
  JSON.stringify([ref.sourceFeatureId, ref.key]);

/** Exact comparison for removing a saved list item, including a stale item. */
export const sameSelectionReference = (
  a: SelectionReference,
  b: SelectionReference,
): boolean => a.sourceFeatureId === b.sourceFeatureId && a.key === b.key;

export interface ReferenceSelectionIndex<T> {
  /** A stored v1 reference may resolve through one v1 alias; v2 is primary-only. */
  find(reference: SelectionReference): T | undefined;
  /** Clicks must identify a unique primary entry in the currently displayed model. */
  findPrimary(reference: SelectionReference): T | undefined;
  selectedKeys(references: readonly SelectionReference[]): Set<string>;
  /** Undefined rejects stale or ambiguous clicks without changing the selection. */
  toggle(
    references: readonly SelectionReference[],
    clicked: SelectionReference,
  ): SelectionReference[] | undefined;
}

function createReferenceSelectionIndex<T extends ReferenceCandidate>(
  kind: "face" | "edge",
  available: readonly T[],
): ReferenceSelectionIndex<T> {
  const primary = new Map<string, Set<T>>();
  const legacy = new Map<string, Set<T>>();
  const isLegacy = (ref: SelectionReference) =>
    ref.key.startsWith(`${kind}-v1|`);
  const isPrimaryKind = (ref: SelectionReference) =>
    isLegacy(ref) || ref.key.startsWith(`${kind}-v2|`);
  const add = (map: Map<string, Set<T>>, ref: SelectionReference, entry: T) => {
    const key = referenceIdentity(ref);
    const matches = map.get(key) ?? new Set<T>();
    matches.add(entry);
    map.set(key, matches);
  };
  for (const entry of available) {
    if (!isPrimaryKind(entry.ref)) continue;
    add(primary, entry.ref, entry);
    if (isLegacy(entry.ref)) add(legacy, entry.ref, entry);
    for (const alias of entry.aliases ?? []) {
      if (isLegacy(alias) && alias.sourceFeatureId === entry.ref.sourceFeatureId)
        add(legacy, alias, entry);
    }
  }
  const unique = (matches: Set<T> | undefined): T | undefined =>
    matches?.size === 1 ? matches.values().next().value : undefined;
  const candidates = (reference: SelectionReference): Set<T> | undefined =>
    isPrimaryKind(reference)
      ? (isLegacy(reference) ? legacy : primary).get(referenceIdentity(reference))
      : undefined;
  const find = (reference: SelectionReference) => unique(candidates(reference));
  const findPrimary = (reference: SelectionReference) =>
    isPrimaryKind(reference)
      ? unique(primary.get(referenceIdentity(reference)))
      : undefined;
  return {
    find,
    findPrimary,
    selectedKeys(references) {
      const keys = new Set<string>();
      for (const reference of references) {
        const entry = find(reference);
        if (entry) keys.add(referenceIdentity(entry.ref));
      }
      return keys;
    },
    toggle(references, clicked) {
      const entry = findPrimary(clicked);
      if (!entry) return undefined;
      let selected = false;
      for (const reference of references) {
        const matches = candidates(reference);
        if (!matches?.has(entry)) continue;
        // Do not append a primary key beside an ambiguous saved alias, or
        // choose which target that alias was intended to select.
        if (matches.size !== 1) return undefined;
        selected = true;
      }
      return selected
        ? references.filter((reference) => find(reference) !== entry)
        : [...references, {
            sourceFeatureId: entry.ref.sourceFeatureId,
            key: entry.ref.key,
          }];
    },
  };
}

/** Plain DTO matching only: no geometry, native identities or document migration. */
export const createFaceSelectionIndex = <T extends ReferenceCandidate>(available: readonly T[]) =>
  createReferenceSelectionIndex("face", available);

export const createEdgeSelectionIndex = <T extends ReferenceCandidate>(available: readonly T[]) =>
  createReferenceSelectionIndex("edge", available);
