import type { SketchConstraint } from "./types";

interface ConstraintReferenceGroups {
  pointIds: string[];
  entityIds: string[];
  constraintIds?: string[];
}

/** Keep reference roles explicit: a/b can name points or entities, depending on type. */
function referenceGroups(constraint: SketchConstraint): ConstraintReferenceGroups {
  switch (constraint.type) {
    case "offset":
      return { pointIds: [], entityIds: [
        ...constraint.sources.map(source => source.entityId),
        ...constraint.images.flatMap(image => image.entityIds),
        ...constraint.capEntityIds,
      ] };
    case "offsetDistance":
      return { pointIds: [], entityIds: [], constraintIds: [constraint.offsetId] };
    case "equalOffsetDistance":
      return { pointIds: [], entityIds: [], constraintIds: [...new Set(constraint.members.map(member => member.offsetId))] };
    case "fix":
      return { pointIds: [constraint.pointId], entityIds: [] };
    case "coincident":
    case "distance":
    case "distanceX":
    case "distanceY":
      return { pointIds: [constraint.a, constraint.b], entityIds: [] };
    case "symmetric":
      return { pointIds: [constraint.a, constraint.b], entityIds: [constraint.axisId] };
    case "mirrorArcDirection":
      return { pointIds: [], entityIds: [constraint.a, constraint.b, constraint.axisId] };
    case "pointOnLine":
    case "pointOnCircle":
      return { pointIds: [constraint.pointId], entityIds: [constraint.entityId] };
    case "horizontal":
    case "vertical":
    case "length":
    case "radius":
      return { pointIds: [], entityIds: [constraint.entityId] };
    case "parallel":
    case "perpendicular":
    case "equal":
    case "tangent":
    case "angle":
      return { pointIds: [], entityIds: [constraint.a, constraint.b] };
  }
  const exhaustive: never = constraint;
  return exhaustive;
}

export function constraintPointReferences(constraint: SketchConstraint): string[] {
  return referenceGroups(constraint).pointIds;
}

export function constraintEntityReferences(constraint: SketchConstraint): string[] {
  return referenceGroups(constraint).entityIds;
}

export function constraintReferences(constraint: SketchConstraint): string[] {
  const { pointIds, entityIds, constraintIds = [] } = referenceGroups(constraint);
  return [...pointIds, ...entityIds, ...constraintIds];
}

export function constraintConstraintReferences(constraint: SketchConstraint): string[] {
  return referenceGroups(constraint).constraintIds ?? [];
}

/** Remove dependent dimensions and reduce distance families after an offset side was deleted. */
export function cleanupConstraintDependencies(constraints: SketchConstraint[]): SketchConstraint[] {
  const offsets = new Map(constraints.filter(constraint => constraint.type === "offset")
    .map(constraint => [constraint.id, constraint]));
  return constraints.flatMap((constraint): SketchConstraint[] => {
    if (constraint.type === "offsetDistance")
      return offsets.get(constraint.offsetId)?.images.some(image => image.side === constraint.side) ? [constraint] : [];
    if (constraint.type === "equalOffsetDistance") {
      const members = constraint.members.filter(member =>
        offsets.get(member.offsetId)?.images.some(image => image.side === member.side));
      return members.length < 2 ? [] : [members.length === constraint.members.length ? constraint : { ...constraint, members }];
    }
    return [constraint];
  });
}

/** Topology-changing tools require an explicit unlink before editing an associated member. */
export function assertOffsetTopologyEditable(constraints: readonly SketchConstraint[], entityIds: readonly string[]): void {
  const changed = new Set(entityIds);
  if (constraints.some(constraint => constraint.type === "offset" && constraintEntityReferences(constraint).some(id => changed.has(id))))
    throw new Error("Elimina primero la relación de equidistancia para cambiar la topología de sus entidades.");
}
