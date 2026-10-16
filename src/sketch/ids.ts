import type { EntityProfile } from "./types";

type GeneratedSketchOperation = "offset" | "mirror" | "fillet" | "chamfer";

/** Allocate opaque identities only for geometry newly created by this proposal. */
export function createSketchIdAllocator(
  profile: EntityProfile,
  operation: GeneratedSketchOperation,
  idFactory: () => string = () => crypto.randomUUID(),
): (kind: string) => string {
  const occupied = new Set([
    "origin",
    ...profile.points.map(point => point.id),
    ...profile.entities.map(entity => entity.id),
    ...profile.constraints.map(constraint => constraint.id),
  ]);
  let namespace: string | undefined;
  let counter = 1;

  return kind => {
    namespace ??= idFactory();
    // N occupied IDs cannot exhaust N + 1 distinct counter candidates. This
    // also terminates if an injected factory repeats an existing namespace.
    const attempts = occupied.size + 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const id = `${operation}-${kind}-${namespace}-${counter++}`;
      if (!occupied.has(id)) {
        occupied.add(id);
        return id;
      }
    }
    throw new Error("Unable to allocate a sketch identity.");
  };
}
