import type { SketchConstraint, SketchEntity } from "./types";

export interface ArcDirectionDependency { owner: string; sourceId: string; imageId: string; reflected: boolean }

/** All source-owned winding metadata shares one acyclic dependency graph. */
export function orderedArcDirections(constraints: readonly SketchConstraint[], entities: readonly SketchEntity[]): ArcDirectionDependency[] {
  const arcs = new Set(entities.filter(e => e.type === "arc").map(e => e.id));
  const dependencies: ArcDirectionDependency[] = [];
  for (const relation of constraints) {
    if (relation.type === "mirrorArcDirection") dependencies.push({ owner: relation.id, sourceId: relation.a, imageId: relation.b, reflected: true });
    if (relation.type === "offset") for (const image of relation.images) relation.sources.forEach((source, i) => {
      if (arcs.has(source.entityId)) dependencies.push({ owner: relation.id, sourceId: source.entityId, imageId: image.entityIds[i], reflected: false });
    });
  }
  const byImage = new Map<string, ArcDirectionDependency>();
  for (const dependency of dependencies) {
    if (byImage.has(dependency.imageId)) throw new Error(`El arco ${dependency.imageId} tiene más de una fuente de sentido.`);
    byImage.set(dependency.imageId, dependency);
  }
  const visiting = new Set<string>(), done = new Set<string>(), result: ArcDirectionDependency[] = [];
  const visit = (dependency: ArcDirectionDependency) => {
    if (done.has(dependency.imageId)) return;
    if (visiting.has(dependency.imageId)) throw new Error(`Las relaciones de sentido contienen un ciclo en ${dependency.owner}.`);
    visiting.add(dependency.imageId);
    const predecessor = byImage.get(dependency.sourceId);
    if (predecessor) visit(predecessor);
    visiting.delete(dependency.imageId); done.add(dependency.imageId); result.push(dependency);
  };
  dependencies.forEach(visit);
  return result;
}
