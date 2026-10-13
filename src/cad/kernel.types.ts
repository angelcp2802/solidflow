/** Coordinates and lengths are millimetres; angles are degrees. */
export type Plane = 'XY' | 'XZ' | 'YZ';
export type Vec3 = [number, number, number];

/** Right-handed local sketch coordinates; Y = normal cross xDirection. */
export interface PlaneFrame {
  origin: Vec3;
  xDirection: Vec3;
  normal: Vec3;
}

export interface FaceReference {
  sourceFeatureId: string;
  key: string;
}

/** Exact modeled body state; never a native solid index or geometric signature. */
export interface BodyReference {
  bodyId: string;
  sourceFeatureId: string;
}

export type BodyOperation =
  | { mode: 'new'; bodyId: string }
  | { mode: 'merge'; target: BodyReference };

export type SketchSupport =
  | { kind: 'plane'; planeId: string }
  | { kind: 'face'; face: FaceReference };
export type PlaneSupport = SketchSupport | { kind: 'principal'; plane: Plane };

import type { EntityProfile, LegacyProfile } from '../sketch/types';
import type { StepSource } from '../model/stepSource';
export type Profile = LegacyProfile | EntityProfile;

interface FeatureBase {
  id: string;
  name: string;
  suppressed: boolean;
}

/** A self-contained STEP base, reconstructed from exact owned bytes. */
export interface ImportedSolidFeature extends FeatureBase {
  type: 'importedSolid';
  source: StepSource;
}

export interface SketchFeature extends FeatureBase {
  type: 'sketch';
  plane: Plane;
  /** Optional associative support; absence retains the legacy principal plane. */
  support?: SketchSupport;
  /** Distance along the plane normal, in mm. */
  offset: number;
  profile: Profile;
}

export interface ReferencePlaneFeature extends FeatureBase {
  type: 'plane';
  support: PlaneSupport;
  offset: number;
  /** Reverse the normal after applying the offset. */
  reversed: boolean;
}

/** Geometric termination; absence preserves the legacy signed blind/mid-plane definition. */
export type ExtrudeEndCondition =
  | { kind: 'throughAll'; baseFeatureId: string; bothDirections: boolean; baseBody?: BodyReference }
  | { kind: 'untilNext'; baseFeatureId: string; baseBody?: BodyReference }
  | { kind: 'upToSurface'; target: PlaneSupport };

interface ExtrudeDefinition extends FeatureBase {
  sketchId: string;
  /** Signed blind length; with a geometric end condition only its sign selects direction. */
  depth: number;
  /** Legacy mid-plane spans -depth/2 to +depth/2; false for geometric end conditions. */
  symmetric: boolean;
  endCondition?: ExtrudeEndCondition;
}

/** Absence of body fields retains the legacy aggregate operation. */
export type ExtrudeFeature = ExtrudeDefinition & (
  | { type: 'extrude'; bodyOperation?: BodyOperation }
  | { type: 'cut'; bodyScope?: BodyReference[] }
);
export type CutFeature = Extract<ExtrudeFeature, { type: 'cut' }>;

export interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketchId: string;
  /** Revolves around the sketch plane's local Y axis through its origin. */
  angle: number;
  bodyOperation?: BodyOperation;
}

export type CombineFeature = FeatureBase & (
  | { type: 'combine'; operation: 'add' | 'common'; operands: BodyReference[]; resultBodyId: string; keepTools: boolean }
  | { type: 'combine'; operation: 'subtract'; target: BodyReference; tools: BodyReference[]; keepTools: boolean }
);

/** Hole centres in the support's local coordinates, with stable editable identity. */
export interface HolePosition {
  id: string;
  x: number;
  y: number;
}

export type HoleEndCondition =
  | { kind: 'blind'; depth: number; depthReference: 'shoulder' | 'tip'; tip: { kind: 'flat' } | { kind: 'conical'; angle: number } }
  | { kind: 'throughAll' }
  | { kind: 'untilNext' };

export type HoleHead =
  | { kind: 'simple' }
  | { kind: 'counterbore'; diameter: number; depth: number }
  | { kind: 'countersink'; diameter: number; angle: number };

export interface HoleFeature extends FeatureBase {
  type: 'hole';
  baseFeatureId: string;
  support: PlaneSupport;
  positions: HolePosition[];
  /** False cuts into the support's negative normal; true reverses the direction. */
  reversed: boolean;
  diameter: number;
  /** Blind depth explicitly measures to the drill shoulder or to its tip. */
  endCondition: HoleEndCondition;
  head: HoleHead;
  bodyScope?: BodyReference[];
}

/** Explicit ordered traversal, independent of the sketch entity array order. */
export interface SweepPathSegment {
  entityId: string;
  reversed: boolean;
}

export interface SweepFeature extends FeatureBase {
  type: 'sweep';
  profileSketchId: string;
  pathSketchId: string;
  path: SweepPathSegment[];
  /** Follow the path without additional twist. */
  orientation: 'followPath';
  merge: boolean;
  /** When present, merge must match the explicit operation mode. */
  bodyOperation?: BodyOperation;
}

export interface LoftSection {
  sketchId: string;
  /** Start edge for entity contours; null uses the legacy/circle local seam. */
  startEntityId: string | null;
  reversed: boolean;
}

export interface LoftFeature extends FeatureBase {
  type: 'loft';
  sections: LoftSection[];
  ruled: boolean;
  merge: boolean;
  /** When present, merge must match the explicit operation mode. */
  bodyOperation?: BodyOperation;
}

/** Exact geometry of selected historical features, or a single complete historical body. */
export type PatternSource =
  | { mode: 'features'; geometryPattern: true; featureIds: string[] }
  | { mode: 'body'; sourceFeatureId: string }
  | { mode: 'bodies'; scope: 'current' | 'historical'; bodies: BodyReference[] };

/** A saved command output slot, never a position in native solid enumeration. */
export interface BodyPatternInstance {
  seedBodyId: string;
  /** Canonical grid address, circular index, or the literal "mirror". */
  address: string;
  bodyId: string;
  /** Retired slots reserve their identity permanently; undo restores the old record. */
  retired: boolean;
}

export type BodyPatternOperation =
  | { mode: 'new'; instances: BodyPatternInstance[] }
  | { mode: 'merge'; target: BodyReference };

interface RepetitionBase extends FeatureBase {
  /** The immediately preceding active solid operation at creation. */
  baseFeatureId: string;
  source: PatternSource;
  /** Required with source.mode=bodies; absence preserves the aggregate legacy path. */
  bodyPattern?: BodyPatternOperation;
}

export interface LinearPatternDirection {
  /** World-space direction, normalized by the kernel. Negate to reverse. */
  direction: Vec3;
  spacing: number;
  /** Includes the original seed; 1 only makes sense with another direction. */
  count: number;
}

export interface LinearPatternFeature extends RepetitionBase {
  type: 'linearPattern';
  first: LinearPatternDirection;
  second: LinearPatternDirection | null;
  /** When true, the second direction repeats only the original seed. */
  secondSeedOnly: boolean;
  /** Zero-based grid addresses, stable if row/column counts change; excludes [0,0]. */
  skipped: [number, number][];
}

export interface CircularPatternFeature extends RepetitionBase {
  type: 'circularPattern';
  axis: { origin: Vec3; direction: Vec3 };
  count: number;
  /** Degrees: total span when equally spaced; otherwise the increment. */
  angle: number;
  equalSpacing: boolean;
  reversed: boolean;
  /** Zero-based instance indices; index zero is the original seed. */
  skipped: number[];
}

export interface MirrorFeature extends RepetitionBase {
  type: 'mirror';
  support: PlaneSupport;
  /** Applies to body copies only; feature geometry follows its original boolean effects. */
  mergeBodies: boolean;
}

export type RepetitionFeature = LinearPatternFeature | CircularPatternFeature | MirrorFeature;

/** A conservative, versioned geometric reference; never a native pointer or edge index. */
export interface EdgeReference {
  sourceFeatureId: string;
  key: string;
}

export type EdgeSelection =
  | { mode: 'all' }
  | { mode: 'selected'; edges: EdgeReference[] };

export interface EdgeFinishFeature extends FeatureBase {
  type: 'fillet' | 'chamfer';
  /** Radius for a fillet, equal face distances for a symmetric chamfer, in mm. */
  size: number;
  selection: EdgeSelection;
  /** The immediately preceding active solid operation when the selection was made. */
  baseFeatureId: string;
  bodyScope?: BodyReference;
}

export interface ShellFeature extends FeatureBase {
  type: 'shell';
  baseFeatureId: string;
  thickness: number;
  direction: 'inward' | 'outward';
  /** Empty removes no faces and creates a closed cavity. */
  removedFaces: FaceReference[];
  bodyScope?: BodyReference;
}

export interface DraftFeature extends FeatureBase {
  type: 'draft';
  baseFeatureId: string;
  /** Positive angle in degrees; reversed switches its sign along the support normal. */
  angle: number;
  reversed: boolean;
  /** The neutral plane: sections in this plane remain unchanged. */
  support: PlaneSupport;
  faces: FaceReference[];
  /** The native builder also modifies tangent-connected faces. */
  propagation: 'tangent';
  bodyScope?: BodyReference;
}

export type FaceOperationFeature = ShellFeature | DraftFeature;

export type Feature = ImportedSolidFeature | SketchFeature | ReferencePlaneFeature | ExtrudeFeature | RevolveFeature | CombineFeature | HoleFeature | SweepFeature | LoftFeature | EdgeFinishFeature | RepetitionFeature | FaceOperationFeature;

/** Serializable display/picking metadata; identity comes from saved producers. */
export interface PickableBody {
  ref: BodyReference;
  createdByFeatureId: string;
  name: string;
  vertices: number[];
  normals: number[];
  triangles: number[];
  edgeLines: number[];
  edges: PickableEdge[];
  faces: PickableFace[];
  volume: number;
  bounds: { min: Vec3; max: Vec3 };
}

export interface PickableFace {
  ref: FaceReference;
  /** UI-only legacy aliases; saved selections keep their original reference. */
  aliases?: readonly FaceReference[];
  /** Null for curved faces: they cannot support a planar sketch. */
  frame: PlaneFrame | null;
  /** A face-local display mesh; triangle picking never persists an index. */
  vertices: number[];
  triangles: number[];
}

export interface ReferencePlaneVisual {
  id: string;
  frame: PlaneFrame;
}

export interface PickableEdge {
  ref: EdgeReference;
  /** UI-only legacy aliases; never persisted inside an EdgeReference. */
  aliases?: readonly EdgeReference[];
  /** Consecutive endpoint pairs for the individual B-rep edge. */
  lines: number[];
}

export interface FeatureError {
  id: string;
  message: string;
}

export interface SketchVisual {
  id: string;
  frame?: PlaneFrame;
  /** Solved sketch curves as consecutive XYZ endpoint pairs, in millimetres. */
  lines: number[];
  /** Construction geometry is displayed separately and never creates material. */
  constructionLines: number[];
}

export interface CadResult {
  bodies?: PickableBody[];
  /** False/absent retains the legacy aggregate scene. */
  bodyCatalogActive?: boolean;
  /** Resolved placement frames, including an edited hole still awaiting centres. */
  holes?: { id: string; frame: PlaneFrame }[];
  faces?: PickableFace[];
  planes?: ReferencePlaneVisual[];
  /** Active, successfully resolved sketches, including open and empty sketches. */
  sketches?: SketchVisual[];
  vertices: number[];
  normals: number[];
  triangles: number[];
  /** Consecutive endpoint pairs, suitable for THREE.LineSegments. */
  edgeLines: number[];
  /** Individual B-rep edges with references suitable for persistent selections. */
  edges: PickableEdge[];
  /** Exact B-rep mass property, in mm³. */
  volume: number;
  bounds: { min: Vec3; max: Vec3 };
  warnings: string[];
  featureErrors: FeatureError[];
}

export type CadExportFormat = 'step' | 'stl';

export type KernelRequest =
  | { id: number; action: 'init' }
  | { id: number; action: 'build'; features: Feature[] }
  | { id: number; action: 'export'; format: CadExportFormat; features?: Feature[] };

export type KernelResponse =
  | { id: number; ok: true; value: CadResult | Blob | null }
  | { id: number; ok: false; error: string };
