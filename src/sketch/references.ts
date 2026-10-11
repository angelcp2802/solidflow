import type { SketchConstraint } from "./types";

interface ConstraintReferenceGroups {
  pointIds: string[];
  entityIds: string[];
}

/** Keep reference roles explicit: a/b can name points or entities, depending on type. */
function referenceGroups(constraint: SketchConstraint): ConstraintReferenceGroups {
  switch (constraint.type) {
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
  const { pointIds, entityIds } = referenceGroups(constraint);
  return [...pointIds, ...entityIds];
}
