export interface SketchPoint {
  id: string;
  x: number;
  y: number;
}
interface EntityBase {
  id: string;
  construction: boolean;
}
export type SketchEntity =
  | (EntityBase & { type: "line"; start: string; end: string })
  | (EntityBase & { type: "circle"; center: string; radius: number })
  | (EntityBase & {
      type: "arc";
      center: string;
      start: string;
      end: string;
      clockwise: boolean;
    });

interface ConstraintBase {
  id: string;
}
interface DimensionBase extends ConstraintBase {
  /** True observes solved geometry; value is retained metadata, not a target or measured result. */
  driven?: boolean;
  /** Stable naming role, independent of whether this dimension currently drives geometry. */
  referenceRole?: "annotation" | "constraint";
}
/** Persisted solution branch; editing dimensions never rededuces it. */
export type TangentBranch =
  "left" | "right" | "external" | "aContainsB" | "bContainsA";
/** Point IDs may also reference the immutable sketch origin, named 'origin'. */
export type SketchConstraint =
  | (ConstraintBase & { type: "fix"; pointId: string; x: number; y: number })
  | (ConstraintBase & { type: "coincident"; a: string; b: string })
  /** Point reflection across the complete supporting line; a and b are point IDs. */
  | (ConstraintBase & { type: "symmetric"; a: string; b: string; axisId: string })
  /** Source arc a owns the opposite clockwise flag of image arc b; point reflection is separate. */
  | (ConstraintBase & { type: "mirrorArcDirection"; a: string; b: string; axisId: string })
  | (ConstraintBase & { type: "horizontal" | "vertical"; entityId: string })
  | (ConstraintBase & {
      type: "parallel" | "perpendicular" | "equal";
      a: string;
      b: string;
    })
  /** Mixed tangency stores the line in a. Arcs use their complete supporting circle. */
  | (ConstraintBase & {
      type: "tangent";
      a: string;
      b: string;
      branch: TangentBranch;
    })
  /** Directed angle between explicit rays. Driving: 0 < value < 360; driven metadata also admits 0. */
  | (DimensionBase & {
      type: "angle";
      a: string;
      b: string;
      value: number;
      reversedA: boolean;
      reversedB: boolean;
      clockwise: boolean;
    })
  | (ConstraintBase & {
      type: "pointOnLine";
      pointId: string;
      entityId: string;
    })
  /** Point on the complete supporting circle of a circle or arc. */
  | (ConstraintBase & {
      type: "pointOnCircle";
      pointId: string;
      entityId: string;
    })
  | (DimensionBase & {
      type: "distance" | "distanceX" | "distanceY";
      a: string;
      b: string;
      value: number;
    })
  | (DimensionBase & {
      type: "length" | "radius";
      entityId: string;
      value: number;
    });

export type DimensionalConstraint = Extract<
  SketchConstraint,
  { value: number }
>;

export interface EntityProfile {
  kind: "entities";
  points: SketchPoint[];
  entities: SketchEntity[];
  constraints: SketchConstraint[];
}
export type LegacyProfile =
  | {
      kind: "rectangle";
      center: [number, number];
      width: number;
      height: number;
    }
  | { kind: "circle"; center: [number, number]; radius: number };
export type SketchTool =
  "select" | "line" | "rectangle" | "circle" | "arc" | "trim" | "extend" | "chamfer" | "fillet" | "mirror";
export type SketchSelection = {
  kind: "point" | "entity" | "constraint";
  id: string;
};
export interface SketchSolveResult {
  profile: EntityProfile;
  status:
    | "underdefined"
    | "fullyDefined"
    | "inconsistent"
    | "invalid"
    | "notConverged";
  degreesOfFreedom: number | null;
  redundantConstraintIds: string[];
  conflictingConstraintIds: string[];
  /** Authoritative driven measurements from profile; null when the solve failed. mm except angle in degrees. */
  drivenValues: Record<string, number | null>;
  maxResidual: number;
  iterations: number;
  message: string;
}
