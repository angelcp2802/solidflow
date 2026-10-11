import type { SketchConstraint } from "./types";

type MirrorArcDirection = Extract<SketchConstraint, { type: "mirrorArcDirection" }>;

/** A single source owns each image's discrete direction. Source chains must be acyclic. */
export function orderedMirrorArcDirections(constraints: readonly SketchConstraint[]): MirrorArcDirection[] {
  const relations = constraints.filter((constraint): constraint is MirrorArcDirection => constraint.type === "mirrorArcDirection");
  const byImage = new Map<string, MirrorArcDirection>();
  for (const relation of relations) {
    if (byImage.has(relation.b))
      throw new Error(`El arco ${relation.b} tiene más de una fuente de sentido reflejado.`);
    byImage.set(relation.b, relation);
  }
  const states = new Map<string, "visiting" | "done">();
  const ordered: MirrorArcDirection[] = [];
  const visit = (relation: MirrorArcDirection) => {
    if (states.get(relation.id) === "done") return;
    if (states.get(relation.id) === "visiting")
      throw new Error(`Las relaciones de sentido reflejado contienen un ciclo en ${relation.id}.`);
    states.set(relation.id, "visiting");
    const predecessor = byImage.get(relation.a);
    if (predecessor) visit(predecessor);
    states.set(relation.id, "done");
    ordered.push(relation);
  };
  relations.forEach(visit);
  return ordered;
}
