import type { FeaturePatternOperation } from '../model/featurePatterns';

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
/** Exact current native vertex incidence; never a mesh vertex index. */
export interface VertexReference { sourceFeatureId: string; key: string }

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

/** Explicit persistent identities; each source reconstructs one closed solid. */
export interface ImportedBodiesFeature extends FeatureBase {
  type: 'importedBodies';
  bodies: { bodyId: string; source: StepSource }[];
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

/** Optional planar wall thickness; absence retains a filled profile. */
export type ThinWallDefinition = (
  | { kind: 'one-side'; thickness: number; reversed: boolean }
  | { kind: 'mid-plane'; thickness: number }
  | { kind: 'two-sides'; firstThickness: number; secondThickness: number }
) & {
  /** Optional original-chain corner rounding; radius is the inner material radius. */
  autoCorners?: { enabled: boolean; radius: number };
};

interface ExtrudeDefinition extends FeatureBase {
  sketchId: string;
  /** Signed blind length; with a geometric end condition only its sign selects direction. */
  depth: number;
  /** Legacy mid-plane spans -depth/2 to +depth/2; false for geometric end conditions. */
  symmetric: boolean;
  endCondition?: ExtrudeEndCondition;
  thinWall?: ThinWallDefinition;
}

/** Absence of body fields retains the legacy aggregate operation. */
export type ExtrudeFeature = ExtrudeDefinition & (
  | { type: 'extrude'; bodyOperation?: BodyOperation }
  | { type: 'cut'; bodyScope?: BodyReference[] }
);
export type CutFeature = Extract<ExtrudeFeature, { type: 'cut' }>;

export type RevolutionAxis =
  | { kind: 'sketch-axis'; axis: 'x' | 'y' }
  | { kind: 'sketch-line'; entityId: string }
  | { kind: 'principal-axis'; axis: 'X' | 'Y' | 'Z' }
  | { kind: 'external-sketch-line'; sketchId: string; entityId: string }
  | { kind: 'linear-edge'; edge: EdgeReference; body: BodyReference | null };

export type RevolutionExtent =
  | { kind: 'two-directions'; secondAngle: number }
  | { kind: 'mid-plane' };

export interface RevolveFeature extends FeatureBase {
  type: 'revolve';
  sketchId: string;
  /** Degrees: first side for two directions, total for mid-plane; otherwise the legacy positive sweep. */
  angle: number;
  /** Absent preserves the legacy one-direction declaration and reference lineage. */
  extent?: RevolutionExtent;
  /** Absent preserves the sketch plane's local +Y axis through its origin. */
  axis?: RevolutionAxis;
  /** Absent preserves positive rotation about the selected directed axis. */
  reversed?: boolean;
  thinWall?: ThinWallDefinition;
  bodyOperation?: BodyOperation;
}

/** A subtractive revolution. Older readers reject this distinct feature type. */
export interface RevolvedCutFeature extends Omit<RevolveFeature, 'type' | 'bodyOperation'> {
  type: 'revolvedCut';
  /** Absence retains aggregate-body editing; explicit catalogs require exact targets. */
  bodyScope?: BodyReference[];
}
export type RevolutionFeature = RevolveFeature | RevolvedCutFeature;

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

/** Selected feature operations or explicitly referenced historical/current bodies. */
export type PatternSource =
  | { mode: 'features'; geometryPattern: boolean; featureIds: string[] }
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
  /** Explicit selected targets and exact historical contributions; allocates no bodies. */
  featurePattern?: FeaturePatternOperation;
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

export type Feature = ImportedSolidFeature | ImportedBodiesFeature | SketchFeature | ReferencePlaneFeature | ExtrudeFeature | RevolutionFeature | CombineFeature | HoleFeature | SweepFeature | LoftFeature | EdgeFinishFeature | RepetitionFeature | FaceOperationFeature;

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
  vertexPoints?: PickableVertex[];
  volume: number;
  bounds: { min: Vec3; max: Vec3 };
}

/** Analytic display orientation only; never a sketch support or mate authority. */
export interface FaceViewAxis {
  kind: 'axis';
  point: Vec3;
  direction: Vec3;
  xDirection?: Vec3;
}

export interface PickableFace {
  ref: FaceReference;
  /** UI-only legacy aliases; saved selections keep their original reference. */
  aliases?: readonly FaceReference[];
  /** Null for curved faces: they cannot support a planar sketch. */
  frame: PlaneFrame | null;
  /** Current cylindrical/conical native axis, independent of face reversal. */
  viewAxis?: FaceViewAxis;
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
/** Display measurement only; fresh native inspection supplies solve authority. */
export interface PickableVertex { ref: VertexReference; point: Vec3 }

export interface FeatureError {
  id: string;
  message: string;
}

export interface SketchVisual {
  id: string;
  frame?: PlaneFrame;
  /** Classification of this resolved profile; absence is unknown to older consumers. */
  profileTopology?: 'open' | 'closed' | 'invalid';
  /** True only when every resolved material component is an open chain. */
  profileOpenOnly?: true;
  /** Solved sketch curves as consecutive XYZ endpoint pairs, in millimetres. */
  lines: number[];
  /** Construction geometry is displayed separately and never creates material. */
  constructionLines: number[];
  /** Resolved world-space LINE witnesses for picking; native rebuilds retain authority. */
  lineEntities?: { entityId: string; start: Vec3; end: Vec3; construction: boolean }[];
}

export interface CadResult {
  vertexPoints?: PickableVertex[];
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

export type KernelRequest = import('./kernel.assembly-types').AssemblyKernelRequest
  | import('./kernel.assembly-configuration-session').ConfiguredAssemblyKernelRequest
  | import('./kernel.assembly-types').AssemblyDirectedAngleKernelRequest
  | { id: number; action: 'insert-assembly-step'; current: import('../model/assemblyDocument').AssemblyDocument; source: StepSource; scope?: import('../model/assemblyDocument').AssemblyDefinitionReference }
  | { id: number; action: 'import-assembly-step'; source: StepSource }
  | { id: number; action: 'export-assembly-step'; document: import('../model/assemblyDocument').AssemblyDocument }
  | { id: number; action: 'init' }
  | { id: number; action: 'build'; features: Feature[] }
  | { id: number; action: 'export-assembly'; document: import('../model/assemblyDocument').AssemblyDocument; format: CadExportFormat }
  | { id: number; action: 'export'; format: CadExportFormat; features?: Feature[] };

export type KernelValue = import('../model/assemblyDocument').AssemblyDocument | CadResult | Blob | null | import('./kernel.assembly-types').AssemblyScene
  | import('./kernel.assembly-configuration-scene').ConfiguredAssemblyScene
  | import('./kernel.assembly-configuration-session').ConfiguredAssemblyPreviewReply
  | import('./kernel.assembly-configuration-session').ConfiguredAssemblyAppliedReply
  | import('./kernel.assembly-types').AssemblyPreviewReply | import('./kernel.assembly-types').AssemblyAppliedReply
  | import('./kernel.assembly-source-updates').AssemblySourceUpdateReview
  | import('./kernel.assembly-replacement').AssemblyReplacementReview
  | import('./kernel.assembly-document-update-types').AssemblyDocumentUpdateReview
  | import('../model/assemblyInterference').AssemblyInterferenceReport
  | import('../model/assemblyDirectedAngle').AssemblyDirectedAngleReport
export type KernelResponse =
  | { id: number; ok: true; value: KernelValue }
  | { id: number; ok: false; error: string };
