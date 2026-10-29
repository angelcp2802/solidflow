import { validateImportedBodiesFeature } from '../model/document';
import { observeAssemblyArcPath, evaluateAssemblyArcPath, type AssemblyArcPathCurve, type AssemblyArcPathEvaluation } from './kernel.assembly-arc-path';
import { observeAssemblyLinePath, type AssemblyLinePathCurve } from './kernel.assembly-line-path';
import {
  getOC,
  cast,
  makeCompound,
  measureShapeVolumeProperties,
  type Shape3D,
  type Sketch,
  type Edge,
  type Vertex,
  type Face,
} from 'replicad';
import type {
  CadExportFormat,
  CadResult,
  Feature,
  EdgeFinishFeature,
  FaceReference,
  EdgeReference,
  VertexReference,
  BodyReference,
  ExtrudeFeature,
  PlaneFrame,
  PlaneSupport,
  SketchFeature,
  RevolutionFeature,
  Vec3,
  PickableFace,
  PickableEdge,
  PickableVertex,
} from './kernel.types';
import { createEdgeCatalog, pickableEdges, pickableEdgesFromCatalog, resolveEdgeReferences, type EdgeCatalog } from './kernel.edges';
import { advanceLineage } from './kernel.naming';
import { entityProfileSolid, entityProfileStructure, entityRevolutionSide, solveEntityProfile } from './kernel.profiles';
import { sketchVisual } from './kernel.sketch-visual';
import { createFaceCatalog, pickableFaces, pickableFacesFromCatalog, resolveSelectedFaces, type FaceCatalog, type FaceDescriptor } from './kernel.faces';
import { clonePlaneFrame, offsetPlaneFrame, principalPlaneFrame } from './kernel.frames';
import { makeOwnedPrimitiveSketch } from './kernel.primitive-sketch';
import { resolveRevolutionAxis, revolutionRadialCoordinate, type ResolvedRevolutionAxis, type RevolutionAxisSources } from './revolutionAxis';
import { isRevolutionFeature, resolveRevolutionExtent } from './revolutionExtent';
import { assertThinWallEndCapsContext, resolveThinWall } from './thinWall';
import { prepareThinSection } from './kernel.thin-wall';
import { buildThinWallEndCaps } from './kernel.thin-caps';
import { loftSolid, sweepSolid } from './kernel.sweep-loft';
import { geometryDelta, isRepetition, patternPlan, repetitionSolid, type FeatureGeometry } from './kernel.patterns';
import { draftSolid, shellSolid } from './kernel.face-operations';
import { throughAllBossTool, throughAllTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';
import { isNativeCleanupFailure, NativeCleanupError, NativeOwners, withNativeOwners } from './kernel.native-ownership';
import { extractAssemblyFaceSupport, extractAssemblyDirectionFaceSupport, extractAssemblyCylinderSurfaceSupport, extractAssemblySphereSurfaceSupport, extractAssemblyEdgeSupport, extractAssemblyVertexSupport, UnsupportedAssemblyCurveError, UnsupportedAssemblySurfaceError, UnsupportedAssemblySphereSurfaceError, type AssemblyNativeFaceSupport, type AssemblyNativeCylinderSurfaceSupport, type AssemblyNativeSphereSurfaceSupport, type AssemblyNativeLineSupport, type AssemblyNativePointSupport } from './kernel.assembly-supports';
import { extractAssemblyProfileSupport, extractAssemblyRectangleAxisSupport, type AssemblyNativeProfileSupport, type AssemblyNativeRectangleAxisSupport } from './kernel.assembly-profile-supports';
import { observeAssemblyPathCurve, evaluateAssemblyPathCurve, type AssemblyPathCurveObservation, type AssemblyPathCurveEvaluation, type AssemblyPathCurveCoordinate, type AssemblyPathCurveBands } from './kernel.assembly-path-curves';
import { placeAssemblyShapeChecked, validateAssemblyShape, type PlacedAssemblyShape } from './kernel.assembly-placements';
import type { RigidPose } from '../model/rigidPose';
import { ownedNativeTopology } from './kernel.native-topology';
import { createVertexCatalog, pickableVerticesFromCatalog, resolveVertexReference, type VertexCatalog } from './kernel.vertices';
import { evaluateFeatureRecipes, stageFeatureRecipeEvaluation, type NativeRecipeSourceState } from './kernel.feature-recipes';
import type { RegenerationRequest } from '../model/featureRecipes';
import { createSourceSketchSolveRegistry, resolveSourceSketchSupport } from './kernel.sketch-solves';
import { resolveNativeRecipeScope } from './kernel.recipe-scopes';
import { holePositionStructure, holeSolid } from './kernel.holes';
import { importStepSolid } from './kernel.step';
import { entityProfilePrismIfSingleRegion, type OwnedEntityPrism } from './kernel.provenance';
import { entityPrismContextFromFeatures } from './kernel.semantic-context';
import { bodyBoolean, copyBodyShape, NativeBodyCatalog, type NativeBodyEntry, type NativeBodyTransaction } from './kernel.bodies';
import { createdBodyIds, featureBodyReferences } from '../model/bodyReferences';
import { MAX_CREATED_BODY_IDS, validateBodyPatternDeclaration } from '../model/bodyPatterns';
import { bodyPatternCopy } from './kernel.body-patterns';
import { MAX_FEATURE_PATTERN_CONTRIBUTIONS, featurePatternApplications, featurePatternSourceReferences, isAllFeaturePattern, validateFeaturePatternDeclaration } from '../model/featurePatterns';
import { FeatureContributionReleaseError, featureContributionKey, featurePatternReplacements, ownedGeometryDelta, type OwnedFeatureGeometry } from './kernel.feature-patterns';
import {
  createSemanticFaceCatalog, createSemanticEdgeCatalog, preparePrismReferencesV2,
  pickableSemanticFaces, pickableSemanticEdges,
  resolveSemanticSelectedFaces, resolveSemanticEdgeReferences,
  type PrismReferences, type SemanticFaceCatalog, type SemanticEdgeCatalog, type SemanticFaceDescriptor,
} from './kernel.semantic-catalogs';

const MESH_OPTIONS = { tolerance: 0.05, angularTolerance: 0.12 };
const MIN_LENGTH = 0.01;
const MAX_LENGTH = 100_000;
class BodyStateReleaseError extends AggregateError {}
class BodyStatePublicationError extends Error {}

type AssemblyReferenceShapeInventory =
  | { kind: 'empty' }
  | { kind: 'legacy'; faces: FaceReference[]; edges: EdgeReference[]; vertexRefs: VertexReference[] }
  | { kind: 'explicit'; bodies: { ref: BodyReference; faces: FaceReference[]; edges: EdgeReference[]; vertexRefs: VertexReference[] }[] };
/** Native current topology only; no tessellation or renderer DTO is implied. */
export type AssemblyReferenceInventory = AssemblyReferenceShapeInventory & {
  featureErrors: CadResult['featureErrors'];
  warnings: string[];
};

/** Detached local picking metadata, never native reference authority or a placed mesh. */
export interface AssemblyPresentationBody {
  body: BodyReference | null;
  name: string;
  faces: PickableFace[];
  edges: PickableEdge[];
  vertexPoints: PickableVertex[];
}
export type AssemblyPartInspection = Pick<CadEngine, 'readCurrentAssemblyPresentation' | 'copyCurrentBodyShape'
  | 'inspectCurrentFaceSupport' | 'inspectCurrentSphereSurfaceSupport' | 'inspectCurrentEdgeSupport'
  | 'inspectCurrentVertexSupport' | 'inspectCurrentArcPathOrigins'> & {
    placeCurrentAssemblyBody(reference: BodyReference | null, pose: RigidPose): PlacedAssemblyShape;
  };

/** Raw worker callers must obey the same body-operation shape as saved documents. */
function validateBodyOperationDeclaration(feature: Extract<Feature, { type: 'extrude' | 'revolve' | 'sweep' | 'loft' }>): void {
  const declared = Object.hasOwn(feature, 'bodyOperation');
  if (!declared && feature.bodyOperation === undefined) return;
  const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const exactKeys = (value: Record<string, unknown>, required: string[]): boolean =>
    Object.keys(value).every(key => required.includes(key)) && required.every(key => Object.hasOwn(value, key));
  const identifier = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0
    && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value);
  const operation = declared ? record(feature.bodyOperation) : null;
  if (operation?.mode === 'new' && exactKeys(operation, ['mode', 'bodyId']) && identifier(operation.bodyId)) return;
  if (operation?.mode === 'merge' && exactKeys(operation, ['mode', 'target'])) {
    const target = record(operation.target);
    if (target && exactKeys(target, ['bodyId', 'sourceFeatureId'])
      && identifier(target.bodyId) && identifier(target.sourceFeatureId)) return;
  }
  throw new Error('La operación explícita de cuerpo debe declarar un cuerpo nuevo válido o una referencia de cuerpo válida para añadir material.');
}

function validateLength(value: number, name: string, signed = false): void {
  const size = signed ? Math.abs(value) : value;
  if (!Number.isFinite(size) || size < MIN_LENGTH || size > MAX_LENGTH) {
    throw new Error(`${name}: introduce un valor ${signed ? 'absoluto ' : ''}entre 0,01 y 100.000 mm.`);
  }
}

function validateSketch(feature: SketchFeature): SketchFeature {
  if (!['XY', 'XZ', 'YZ'].includes(feature.plane)) throw new Error('Plano de croquis desconocido.');
  if (!Number.isFinite(feature.offset) || Math.abs(feature.offset) > 1_000_000) {
    throw new Error('El desplazamiento del plano debe ser finito y no superar 1.000.000 mm.');
  }
  if (feature.profile.kind === 'entities') {
    return { ...feature, profile: solveEntityProfile(feature.profile) };
  }
  if (!feature.profile.center.every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000)) {
    throw new Error('Las coordenadas del croquis deben ser finitas y no superar 1.000.000 mm.');
  }
  if (feature.profile.kind === 'rectangle') {
    validateLength(feature.profile.width, 'Anchura');
    validateLength(feature.profile.height, 'Altura');
  } else if (feature.profile.kind === 'circle') {
    validateLength(feature.profile.radius, 'Radio');
  } else {
    throw new Error('Perfil de croquis no compatible.');
  }
  return feature;
}

function makeSketch(feature: SketchFeature, offset = feature.offset, frame?: PlaneFrame): Sketch {
  return makeOwnedPrimitiveSketch(feature, offset, frame);
}

function shapeVolume(shape: Shape3D): number {
  const properties = measureShapeVolumeProperties(shape);
  try {
    return properties.volume;
  } finally {
    properties.delete();
  }
}

function validateNativeSolid(shape: Shape3D): number {
  if (shape.isNull) throw new Error('La operación no produce un sólido.');
  const volume = shapeVolume(shape);
  if (!Number.isFinite(volume) || volume < 1e-10) {
    throw new Error('La operación elimina todo el sólido o produce una geometría vacía.');
  }
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  try {
    if (!analyzer.IsValid()) throw new Error('OpenCascade ha detectado una geometría no válida.');
  } finally {
    analyzer.delete();
  }
  return volume;
}

function requireSingleSolid(shape: Shape3D, message: string): void {
  const solids = ownedNativeTopology(shape, 'solid');
  try { if (solids.length !== 1) throw new Error(message); }
  finally { solids.forEach((solid) => solid.delete()); }
}

/** Borrow the existing primitive sketch; retain only the completed solid. */
function extrudePrimitiveSketch(sketch: Sketch, depth: number): Shape3D {
  return withNativeOwners(owners => {
    const oc = getOC(), faceMaker = owners.own(new oc.BRepBuilderAPI_MakeFace(sketch.wire.wrapped, false));
    if (!faceMaker.IsDone()) throw new Error('Failed to build the face. Your wire might be non planar.');
    const face = owners.own(faceMaker.Face()), vector = owners.own(new oc.gp_Vec(...sketch.defaultDirection.toTuple()));
    // Match the SDK's normalize-then-multiply arithmetic without temporary
    // Replicad Vector/XYZ wrappers or consuming the borrowed sketch direction.
    vector.Normalize(); vector.Multiply(depth);
    const prism = owners.own(new oc.BRepPrimAPI_MakePrism(face, vector, false, true));
    if (!prism.IsDone()) throw new Error('OpenCascade no ha completado la extrusión.');
    const raw = owners.own(prism.Shape()), result = owners.own(cast(raw));
    // cast owns a separate downcast wrapper; the raw result remains owned too.
    if (result.wrapped.ShapeType() !== oc.TopAbs_ShapeEnum.TopAbs_SOLID) throw new Error('La extrusión no produce un sólido.');
    return result.asShape3D();
  }, result => [result], 'Primitive extrusion construction or release failed.');
}

function featureSolid(feature: ExtrudeFeature | RevolutionFeature, sketchFeature: SketchFeature, resolvedFrame: PlaneFrame,
  validateDepth = true, resolvedAxis?: ResolvedRevolutionAxis,
  thinSection?: ReturnType<typeof prepareThinSection>): Shape3D {
  if (Object.hasOwn(feature, 'thinWall') !== Boolean(thinSection)) {
    throw new Error('La pared delgada requiere su sección resuelta antes de construir material.');
  }
  // Keep the incoming plane/offset: geometric end conditions translate this
  // sketch along its normal while borrowing the same already-solved section.
  if (thinSection) sketchFeature = { ...sketchFeature, profile: thinSection.sketch.profile };
  const derivedArcs = !!thinSection && !!feature.thinWall?.autoCorners?.enabled;
  const frame = sketchFeature.support ? resolvedFrame : undefined;
  if (isRevolutionFeature(feature)) {
    const extent = resolveRevolutionExtent(feature);
    const { profile } = sketchFeature;
    if (!resolvedAxis) throw new Error('La revolución requiere resolver primero su eje en el estado anterior.');
    const axis = resolvedAxis;
    if (profile.kind === 'entities') {
      return entityProfileSolid(profile, sketchFeature.plane, sketchFeature.offset,
        { type: 'revolve', angle: extent.sweepAngle, axis, ...(extent.identity ? { startAngle: extent.startAngle } : {}) }, frame, derivedArcs);
    }
    const halfWidth = profile.kind === 'rectangle'
      ? Math.abs(axis.radialDirection[0]) * profile.width / 2 + Math.abs(axis.radialDirection[1]) * profile.height / 2 : profile.radius;
    const distance = revolutionRadialCoordinate(profile.center, axis);
    if (Math.abs(distance) < halfWidth - 1e-7) {
      throw new Error(`El perfil de revolución cruza ${axis.legacy ? 'el eje Y del croquis' : 'el eje seleccionado'}. Desplaza su centro hacia un lado del eje.`);
    }
    // A circle tangent to the axis creates a singular point; require a torus profile.
    if (profile.kind === 'circle' && Math.abs(distance) <= halfWidth + 1e-7) {
      throw new Error(`El círculo de revolución debe estar separado ${axis.legacy ? 'del eje Y del croquis' : 'del eje seleccionado'}.`);
    }
    const sketch = makeSketch(sketchFeature, sketchFeature.offset, frame);
    if (extent.identity) return withNativeOwners(owners => {
      owners.own(sketch);
      const solid = owners.own(sketch.revolve(axis.direction, { origin: axis.origin, angle: extent.sweepAngle }));
      // One continuous sweep, positioned around its exact solved world axis.
      // No union seam or duplicated volume is introduced at the sketch plane.
      return owners.own(extent.startAngle === 0 ? solid : solid.rotate(extent.startAngle, axis.origin, axis.direction));
    }, result => [result], 'Revolution extent construction or release failed.');
    try {
      return sketch.revolve(axis.direction, {
        origin: axis.origin,
        angle: feature.angle,
      });
    } finally {
      // Replicad consumes successful sketches; delete() is idempotent and also covers failure.
      sketch.delete();
    }
  }
  if (validateDepth) validateLength(feature.depth, 'Profundidad', true);
  else if (!Number.isFinite(feature.depth) || Math.abs(feature.depth)>10_000_000 || Math.abs(feature.depth)<1e-7) throw new Error('La extensión calculada para esta condición final no es válida.');
  const startOffset = sketchFeature.offset - (feature.symmetric ? feature.depth / 2 : 0);
  const startFrame = frame ? offsetPlaneFrame(frame, feature.symmetric ? -feature.depth / 2 : 0) : undefined;
  if (thinSection && feature.thinWall?.endCaps?.enabled) {
    return buildThinWallEndCaps(thinSection, feature.thinWall, sketchFeature.plane, startOffset, feature.depth, startFrame);
  }
  if (sketchFeature.profile.kind === 'entities') {
    return entityProfileSolid(sketchFeature.profile, sketchFeature.plane, startOffset, { type: 'extrude', depth: feature.depth }, startFrame, derivedArcs);
  }
  const sketch = makeSketch(sketchFeature, startOffset, startFrame);
  try {
    return extrudePrimitiveSketch(sketch, feature.depth);
  } finally {
    sketch.delete();
  }
}

function cloneFinishEdges(edges: readonly Edge[]): Edge[] {
  const clones: Edge[] = [];
  try {
    for (const edge of edges) clones.push(edge.clone());
    return clones;
  } catch (error) {
    const failures: unknown[] = [error];
    for (const clone of clones) { try { clone.delete(); } catch (releaseError) { failures.push(releaseError); } }
    if (failures.length === 1) throw error;
    throw new AggregateError(failures, 'Native selected edge clone and release failed.');
  }
}

function finishEdges(body: Shape3D, feature: EdgeFinishFeature, lineage: string, semantic?: PrismReferences): Shape3D {
  validateLength(feature.size, feature.type === 'fillet' ? 'Radio' : 'Distancia');
  const operation = feature.type === 'fillet' ? 'redondeo' : 'chaflán';
  if (feature.selection.mode === 'all') {
    try { return body[feature.type](feature.size); }
    catch { throw new Error(`No se puede construir el ${operation} con este tamaño. Reduce el valor o cambia las aristas.`); }
  }
  const catalog = semantic ? createSemanticEdgeCatalog(body, feature.baseFeatureId, lineage, semantic)
    : createEdgeCatalog(body, feature.baseFeatureId, lineage);
  let candidate: Shape3D | undefined, operationError: unknown, operationFailed = false;
  try {
    const edges = 'semanticStatus' in catalog
      ? resolveSemanticEdgeReferences(catalog, feature.selection.edges, feature.baseFeatureId)
      : resolveEdgeReferences(catalog, feature.selection.edges, feature.baseFeatureId);
    try {
      // The finder owns its input edges; clone them so the catalog keeps its own lifetime.
      candidate = body[feature.type](feature.size, (finder) => finder.inList(cloneFinishEdges(edges)));
    } catch (error) {
      throw new Error(`No se puede construir el ${operation} en las aristas seleccionadas. Reduce el tamaño o recupera la selección.`, { cause: error });
    }
  } catch (error) {
    operationFailed = true; operationError = error; throw error;
  } finally {
    try { catalog.dispose(); }
    catch (releaseError) {
      const failures = operationFailed ? [operationError, releaseError] : [releaseError];
      // Transfer the result only after the catalog released successfully.
      try { candidate?.delete(); } catch (error) { failures.push(error); }
      throw new AggregateError(failures, 'Native edge finish release failed: ' +
        failures.map(error => error instanceof Error ? error.message : String(error)).join('; '));
    }
  }
  return candidate!;
}

/** Bindings stay alive through historical consumers and final picking. */
function withPrismOwners<T>(owners: readonly OwnedEntityPrism[], operation: () => T, onFailure: () => void): T {
  const failures: unknown[] = [];
  let result!: T;
  try { result = operation(); } catch (error) { failures.push(error); }
  for (const owner of owners) {
    try { failures.push(...owner.dispose().map(message => new Error(message))); }
    catch (error) { failures.push(error); }
  }
  if (failures.length) {
    try { onFailure(); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(failures, 'Native reconstruction or release failed: ' +
      failures.map(error => error instanceof Error ? error.message : String(error)).join('; '));
  }
  return result;
}

function emptyResult(): CadResult {
  return {
    vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], faces: [], planes: [], sketches: [], holes: [], volume: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] }, warnings: [], featureErrors: [],
  };
}

/** Retains both legacy aggregate picks and exact body-scoped picks at this historical step. */
function historicalBodyFaceCatalog(body: Shape3D, sourceFeatureId: string, lineage: string, bodies: NativeBodyCatalog): FaceCatalog {
  const catalogs: FaceCatalog[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    for (const catalog of catalogs) { try { catalog.dispose(); } catch (error) { failures.push(error); } }
    if (failures.length) throw new AggregateError(failures, 'Historical body face catalog release failed.');
  };
  try {
    catalogs.push(createFaceCatalog(body, sourceFeatureId, lineage));
    for (const entry of bodies.entries()) {
      if (entry.ref.sourceFeatureId === sourceFeatureId) {
        catalogs.push(createFaceCatalog(entry.shape, sourceFeatureId, entry.lineage));
      }
    }
    return { entries: catalogs.flatMap(catalog => catalog.entries), dispose };
  } catch (error) {
    try { dispose(); } catch (releaseError) { throw new AggregateError([error, releaseError], 'Historical body face construction and release failed.'); }
    throw error;
  }
}

/** Owns the native shape; rendering data never retains pointers into the WASM heap. */
export class CadEngine {
  private shape: Shape3D | null = null;
  private bodyCatalog: NativeBodyCatalog | null = null;
  private hasErrors = false;
  private inspectionReady = false;
  private inspectionEpoch = 0;
  private finalState: { sourceFeatureId: string; lineage: string } | null = null;
  private finalSemanticFaces: SemanticFaceCatalog | null = null;
  private finalSemanticEdges: SemanticEdgeCatalog | null = null;
  private currentFaceCatalogs = new Map<string, FaceCatalog>();
  private currentEdgeCatalogs = new Map<string, EdgeCatalog>();
  private currentVertexCatalogs = new Map<string, VertexCatalog>();

  private retainCurrentVertexCatalog(shape: Shape3D, sourceFeatureId: string, lineage: string, identity: string,
    faces: readonly { face: Face; ref: FaceReference }[], edges: readonly { edge: Edge; ref: EdgeReference }[]): VertexCatalog {
    const existing = this.currentVertexCatalogs.get(identity);
    if (existing) return existing;
    return withNativeOwners(owners => {
      const catalog = createVertexCatalog(shape, sourceFeatureId, lineage, faces, edges), lease = owners.own({ delete: () => catalog.dispose() });
      this.currentVertexCatalogs.set(identity, catalog);
      return { catalog, lease };
    }, value => [value.lease], 'Current vertex catalog construction or release failed.').catalog;
  }

  private retainCurrentFaceCatalog(shape: Shape3D, sourceFeatureId: string, lineage: string, identity: string): FaceCatalog {
    const existing = this.currentFaceCatalogs.get(identity);
    if (existing) return existing;
    return withNativeOwners(owners => {
      const catalog = createFaceCatalog(shape, sourceFeatureId, lineage), lease = owners.own({ delete: () => catalog.dispose() });
      this.currentFaceCatalogs.set(identity, catalog);
      return { catalog, lease };
    }, value => [value.lease], 'Current face catalog construction or release failed.').catalog;
  }

  /** Build-time ownership only; inspection stays sealed until producer cleanup succeeds. */
  private retainCurrentEdgeCatalog(shape: Shape3D, sourceFeatureId: string, lineage: string, identity: string): EdgeCatalog {
    const existing = this.currentEdgeCatalogs.get(identity);
    if (existing) return existing;
    return withNativeOwners(owners => {
      const catalog = createEdgeCatalog(shape, sourceFeatureId, lineage), lease = owners.own({ delete: () => catalog.dispose() });
      this.currentEdgeCatalogs.set(identity, catalog);
      return { catalog, lease };
    }, value => [value.lease], 'Current edge catalog construction or release failed.').catalog;
  }

  dispose(): void {
    const shape = this.shape;
    const catalog = this.bodyCatalog;
    const faces = this.finalSemanticFaces;
    const edges = this.finalSemanticEdges;
    const currentFaces = [...this.currentFaceCatalogs.values()]; this.currentFaceCatalogs.clear();
    const currentEdges = [...this.currentEdgeCatalogs.values()]; this.currentEdgeCatalogs.clear();
    const currentVertices = [...this.currentVertexCatalogs.values()]; this.currentVertexCatalogs.clear();
    this.inspectionReady = false;
    this.inspectionEpoch++;
    this.finalState = null;
    this.finalSemanticFaces = null;
    this.finalSemanticEdges = null;
    this.shape = null;
    this.bodyCatalog = null;
    this.hasErrors = false;
    const failures: unknown[] = [];
    for (const current of currentVertices.reverse()) { try { current.dispose(); } catch (error) { failures.push(error); } }
    try { faces?.dispose(); } catch (error) { failures.push(error); }
    try { edges?.dispose(); } catch (error) { failures.push(error); }
    for (const current of currentFaces.reverse()) { try { current.dispose(); } catch (error) { failures.push(error); } }
    for (const current of currentEdges.reverse()) { try { current.dispose(); } catch (error) { failures.push(error); } }
    try { shape?.delete(); } catch (error) { failures.push(error); }
    try { catalog?.dispose(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failures, 'Native engine release failed.');
  }

  /** Numeric analytic geometry only. Native faces never escape this adapter. */
  inspectCurrentFaceSupport(reference: FaceReference, bodyReference: BodyReference | null): AssemblyNativeFaceSupport {
    return this.inspectCurrentFaceValue(reference, bodyReference, extractAssemblyFaceSupport);
  }

  /** Fresh bounded-profile measurement, distinct from the directional plane purpose. */
  inspectCurrentProfileSupport(reference: FaceReference, bodyReference: BodyReference | null,
    bands?: { lengthToleranceMm?: number; angleToleranceRad?: number }): AssemblyNativeProfileSupport {
    return this.inspectCurrentFaceValue(reference, bodyReference, face => extractAssemblyProfileSupport(face, bands));
  }

  /** One current body/catalog epoch binds BOTH identities and exact incidence.
   * Separate face and LINE observations cannot authenticate a profile axis. */
  inspectCurrentProfileAxisSupport(faceReference: FaceReference, edgeReference: EdgeReference, bodyReference: BodyReference | null,
    sense: 1 | -1, bands?: { lengthToleranceMm?: number; angleToleranceRad?: number }): AssemblyNativeRectangleAxisSupport {
    if (faceReference.sourceFeatureId !== edgeReference.sourceFeatureId) throw new Error('La cara y la arista de perfil pertenecen a estados distintos.');
    return this.inspectCurrentFaceValue(faceReference, bodyReference, face => {
      const entry = bodyReference === null ? null : this.bodyCatalog!.resolve(bodyReference);
      const sourceFeatureId = entry?.ref.sourceFeatureId ?? this.finalState!.sourceFeatureId;
      if (sourceFeatureId !== edgeReference.sourceFeatureId) throw new Error('La arista de perfil no pertenece al estado final vigente.');
      if (bodyReference === null && this.finalSemanticEdges) {
        const edge = resolveSemanticEdgeReferences(this.finalSemanticEdges, [edgeReference], sourceFeatureId)[0];
        return extractAssemblyRectangleAxisSupport(face, edge, sense, bands);
      }
      return withNativeOwners(owners => {
        const identity = entry ? JSON.stringify(entry.ref) : JSON.stringify(['legacy', sourceFeatureId, this.finalState!.lineage]);
        const retained = this.currentEdgeCatalogs.get(identity);
        const catalog = retained ?? createEdgeCatalog(entry?.shape ?? this.shape!, sourceFeatureId, entry?.lineage ?? this.finalState!.lineage);
        if (!retained) owners.own({ delete: () => catalog.dispose() });
        const edge = resolveEdgeReferences(catalog, [edgeReference], sourceFeatureId)[0];
        return extractAssemblyRectangleAxisSupport(face, edge, sense, bands);
      }, undefined, 'Current profile face/edge inspection or release failed.');
    });
  }

  /** Exact current direction purpose; a plane is remeasured from oriented D1. */
  inspectCurrentDirectionFaceSupport(reference: FaceReference, bodyReference: BodyReference | null): AssemblyNativeFaceSupport {
    return this.inspectCurrentFaceValue(reference, bodyReference, extractAssemblyDirectionFaceSupport);
  }

  /** Fresh explicit surface-purpose observation; never substitutes for a derived axis. */
  inspectCurrentCylinderSurfaceSupport(reference: FaceReference, bodyReference: BodyReference | null): AssemblyNativeCylinderSurfaceSupport {
    return this.inspectCurrentFaceValue(reference, bodyReference, extractAssemblyCylinderSurfaceSupport);
  }

  /** Fresh spherical purpose; no parameter axis is exposed to older mate families. */
  inspectCurrentSphereSurfaceSupport(reference: FaceReference, bodyReference: BodyReference | null): AssemblyNativeSphereSurfaceSupport {
    return this.inspectCurrentFaceValue(reference, bodyReference, extractAssemblySphereSurfaceSupport);
  }

  private inspectCurrentFaceValue<T>(reference: FaceReference, bodyReference: BodyReference | null, read: (face: Face) => T): T {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) {
      throw new Error('La pieza necesita una reconstrucción completa y vigente antes de resolver sus caras.');
    }
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    let support: T;
    if (bodyReference !== null) {
      if (!catalog) throw new Error('La pieza antigua no tiene un catálogo explícito de cuerpos.');
      const entry = catalog.resolve(bodyReference);
      if (reference.sourceFeatureId !== entry.ref.sourceFeatureId) throw new Error('La cara y el cuerpo pertenecen a estados distintos.');
      const faces = this.currentFaceCatalogs.get(JSON.stringify(entry.ref));
      if (!faces) throw new Error('La reconstrucción no publicó el catálogo de caras del cuerpo actual.');
      support = read(resolveSelectedFaces(faces, [reference], entry.ref.sourceFeatureId)[0]);
    } else {
      if (catalog) throw new Error('Selecciona el cuerpo explícito; el agregado no sustituye su identidad.');
      if (reference.sourceFeatureId !== this.finalState.sourceFeatureId) throw new Error('La cara no pertenece al estado final vigente de la pieza.');
      if (this.finalSemanticFaces) {
        support = read(resolveSemanticSelectedFaces(this.finalSemanticFaces, [reference], this.finalState.sourceFeatureId)[0]);
      } else {
        const faces = this.currentFaceCatalogs.get(JSON.stringify(['legacy', this.finalState.sourceFeatureId, this.finalState.lineage]));
        if (!faces) throw new Error('La reconstrucción no publicó el catálogo de caras del estado actual.');
        support = read(resolveSelectedFaces(faces, [reference], this.finalState.sourceFeatureId)[0]);
      }
    }
    if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) {
      throw new Error('La geometría cambió mientras se resolvía la referencia de cara.');
    }
    return support;
  }

  /** Exact current body/edge identity and analytic LINE data; no native handle escapes. */
  inspectCurrentEdgeSupport(reference: EdgeReference, bodyReference: BodyReference | null): AssemblyNativeLineSupport {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) throw new Error('La pieza necesita una reconstrucción completa y vigente antes de resolver sus aristas.');
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    const inspect = (source: Shape3D, sourceFeatureId: string, lineage: string, identity: string): AssemblyNativeLineSupport => {
      const queried = withNativeOwners(owners => {
        const retained = this.currentEdgeCatalogs.get(identity), edges = retained ?? createEdgeCatalog(source, sourceFeatureId, lineage);
        const lease = retained ? undefined : owners.own({ delete: () => edges.dispose() });
        const edge = resolveEdgeReferences(edges, [reference], sourceFeatureId)[0];
        let support: AssemblyNativeLineSupport | undefined, unsupported: UnsupportedAssemblyCurveError | undefined;
        try { support = extractAssemblyEdgeSupport(edge); }
        catch (error) { if (!(error instanceof UnsupportedAssemblyCurveError)) throw error; unsupported = error; }
        if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) throw new Error('La geometría cambió mientras se resolvía la referencia de arista.');
        // A clean unsupported analytic classification still authenticates this
        // exact current catalog. Every later edge query extracts native data again.
        return { support, unsupported, edges, lease };
      }, result => result.lease ? [result.lease] : [], 'Current edge inspection or release failed.');
      withNativeOwners(owners => {
        if (queried.lease) owners.own(queried.lease);
        if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) throw new Error('La geometría cambió mientras se resolvía la referencia de arista.');
        // A reentrant current query may already own another catalog. Only the
        // engine receives the transferred lease, after query cleanup succeeded.
        const publish = queried.lease && !this.currentEdgeCatalogs.has(identity);
        if (publish) this.currentEdgeCatalogs.set(identity, queried.edges);
        return publish ? queried.lease : undefined;
      }, lease => lease ? [lease] : [], 'Current edge catalog publication or release failed.');
      if (queried.unsupported) throw queried.unsupported;
      return queried.support!;
    };
    let support: AssemblyNativeLineSupport;
    if (bodyReference !== null) {
      if (!catalog) throw new Error('La pieza antigua no tiene un catálogo explícito de cuerpos.');
      const entry = catalog.resolve(bodyReference);
      if (reference.sourceFeatureId !== entry.ref.sourceFeatureId) throw new Error('La arista y el cuerpo pertenecen a estados distintos.');
      support = inspect(entry.shape, entry.ref.sourceFeatureId, entry.lineage, JSON.stringify(entry.ref));
    } else {
      if (catalog) throw new Error('Selecciona el cuerpo explícito; el agregado no sustituye su identidad.');
      if (reference.sourceFeatureId !== this.finalState.sourceFeatureId) throw new Error('La arista no pertenece al estado final vigente de la pieza.');
      support = this.finalSemanticEdges
        ? extractAssemblyEdgeSupport(resolveSemanticEdgeReferences(this.finalSemanticEdges, [reference], this.finalState.sourceFeatureId)[0])
        : inspect(shape, this.finalState.sourceFeatureId, this.finalState.lineage, JSON.stringify(['legacy', this.finalState.sourceFeatureId, this.finalState.lineage]));
    }
    if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) throw new Error('La geometría cambió mientras se resolvía la referencia de arista.');
    return support;
  }

  /** Fresh finite native curve purpose. Infinite LINE observations do not
   * establish the trim domain, length, endpoints or circular seam. */
  inspectCurrentPathCurve(reference: EdgeReference, bodyReference: BodyReference | null, sense: 1 | -1,
    bands?: AssemblyPathCurveBands): AssemblyPathCurveObservation {
    return this.inspectCurrentPathEdgeValue(reference, bodyReference, edge => observeAssemblyPathCurve(edge, sense, bands));
  }

  inspectCurrentPathEvaluation(reference: EdgeReference, bodyReference: BodyReference | null, sense: 1 | -1,
    coordinate: AssemblyPathCurveCoordinate, bands?: AssemblyPathCurveBands): AssemblyPathCurveEvaluation {
    return this.inspectCurrentPathEdgeValue(reference, bodyReference, edge => evaluateAssemblyPathCurve(edge, sense, coordinate, bands));
  }

  /** Current native display candidates only. Exact endpoint identity is queried,
   * but the consumer must still obtain a fresh purpose-specific arc witness. */
  inspectCurrentArcPathOrigins(reference: EdgeReference, bodyReference: BodyReference | null): VertexReference[] {
    const entry = bodyReference === null ? null : this.bodyCatalog?.resolve(bodyReference);
    const source = entry?.ref.sourceFeatureId ?? this.finalState?.sourceFeatureId;
    const identity = entry ? JSON.stringify(entry.ref) : JSON.stringify(['legacy', source, this.finalState?.lineage]);
    const vertices = this.currentVertexCatalogs.get(identity);
    return this.inspectCurrentPathEdgeValue(reference, bodyReference, edge => withNativeOwners(owners => {
      if (!vertices) throw new Error('Current material vertex catalog unavailable.');
      vertices.assertAlive();
      const oc = getOC(), curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped));
      if (curve.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Circle || oc.BRep_Tool.IsClosed(edge.wrapped) || oc.BRep_Tool.Degenerated(edge.wrapped)) return [];
      const first = curve.FirstParameter(), last = curve.LastParameter(), span = last - first;
      if (![first,last,span].every(Number.isFinite) || span <= 0 || span >= 2*Math.PI) return [];
      const explorer = owners.own(new oc.TopExp_Explorer(edge.wrapped,oc.TopAbs_ShapeEnum.TopAbs_VERTEX,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      const endpoints: ReturnType<typeof explorer.Current>[] = [];
      while(explorer.More()) { if(endpoints.length >= 2)return []; endpoints.push(owners.own(explorer.Current())); explorer.Next(); }
      if(endpoints.length !== 2 || endpoints[0].IsSame(endpoints[1]))return [];
      const parameters = endpoints.map(vertex => oc.BRep_Tool.Parameter(owners.own(oc.TopoDS.Vertex(vertex)),edge.wrapped));
      if(!((parameters[0]===first&&parameters[1]===last)||(parameters[1]===first&&parameters[0]===last)))return [];
      const result: VertexReference[] = [];
      for(const endpoint of endpoints) {
        const matches = vertices.entries.filter(item => item.vertex.wrapped.IsSame(endpoint));
        if(matches.length !== 1)return [];
        result.push({...matches[0].ref});
      }
      if(vertices !== this.currentVertexCatalogs.get(identity))throw new Error('Material vertex catalog changed during origin query.');
      vertices.assertAlive();return result;
    },undefined,'Current circular origin catalog or release failed.'));
  }

  private inspectCurrentPathEdgeValue<T>(reference: EdgeReference, bodyReference: BodyReference | null, read: (edge: Edge) => T): T {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) throw new Error('Reconstruye la pieza antes de medir su trayecto.');
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    const current = () => {
      if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) throw new Error('La geometría cambió durante la consulta del trayecto.');
    };
    try {
      let result: T;
      if (bodyReference === null && this.finalSemanticEdges) {
        if (catalog || reference.sourceFeatureId !== this.finalState.sourceFeatureId) throw new Error('Selecciona el cuerpo y productor exactos del trayecto.');
        result = read(resolveSemanticEdgeReferences(this.finalSemanticEdges, [reference], this.finalState.sourceFeatureId)[0]);
      } else {
        const entry = bodyReference === null ? null : catalog?.resolve(bodyReference);
        if (bodyReference !== null && !entry || bodyReference === null && catalog) throw new Error('El trayecto requiere la identidad explícita de su cuerpo actual.');
        const sourceFeatureId = entry?.ref.sourceFeatureId ?? this.finalState.sourceFeatureId;
        if (reference.sourceFeatureId !== sourceFeatureId) throw new Error('La arista del trayecto pertenece a otro productor.');
        const identity = entry ? JSON.stringify(entry.ref) : JSON.stringify(['legacy', sourceFeatureId, this.finalState.lineage]);
        result = withNativeOwners(owners => {
          const retained = this.currentEdgeCatalogs.get(identity), edges = retained ?? createEdgeCatalog(entry?.shape ?? shape, sourceFeatureId, entry?.lineage ?? this.finalState!.lineage);
          if (!retained) owners.own({ delete: () => edges.dispose() });
          const value = read(resolveEdgeReferences(edges, [reference], sourceFeatureId)[0]);
          current();
          return value;
        }, undefined, 'Current bounded path inspection or release failed.');
      }
      current();
      return result;
    } catch (error) {
      if (isNativeCleanupFailure(error)) { this.inspectionReady = false; this.inspectionEpoch++; }
      throw error;
    }
  }

  /** Joint current same-body material origin; no coordinate or old LINE alias. */
  inspectCurrentLinePath(reference: EdgeReference, startVertex: VertexReference, bodyReference: BodyReference | null,
    bands?: AssemblyPathCurveBands): AssemblyLinePathCurve {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) throw new Error('Rebuild the current material line body first.');
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    const entry = bodyReference === null ? null : catalog?.resolve(bodyReference);
    if (bodyReference !== null && !entry || bodyReference === null && catalog) throw new Error('Exact material line body required.');
    const source = entry?.ref.sourceFeatureId ?? this.finalState.sourceFeatureId;
    if (reference.sourceFeatureId !== source || startVertex.sourceFeatureId !== source) throw new Error('Material origin and edge must share the current producer.');
    const identity = entry ? JSON.stringify(entry.ref) : JSON.stringify(['legacy',source,this.finalState.lineage]);
    const vertices = this.currentVertexCatalogs.get(identity);
    if (!vertices) throw new Error('Current material vertex catalog unavailable.');
    const current = () => { if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog || vertices !== this.currentVertexCatalogs.get(identity)) throw new Error('Material line geometry changed during query.'); vertices.assertAlive(); };
    try {
      const result = this.inspectCurrentPathEdgeValue(reference,bodyReference,edge => {
        const vertex = resolveVertexReference(vertices,startVertex,source);
        const curve = observeAssemblyLinePath(edge,vertex,bands); current(); return curve;
      });
      current(); return result;
    } catch (error) { if (isNativeCleanupFailure(error)) { this.inspectionReady=false; this.inspectionEpoch++; } throw error; }
  }

  /** Joint current topology proof, separate from LINE and finite observer purposes. */
  inspectCurrentArcPath(reference:EdgeReference,startVertex:VertexReference,bodyReference:BodyReference|null,bands?:AssemblyPathCurveBands):AssemblyArcPathCurve{
    return this.inspectCurrentArcPathValue(reference,startVertex,bodyReference,(edge,vertex)=>observeAssemblyArcPath(edge,vertex,bands));
  }
  inspectCurrentArcPathEvaluation(reference:EdgeReference,startVertex:VertexReference,bodyReference:BodyReference|null,coordinate:AssemblyPathCurveCoordinate,bands?:AssemblyPathCurveBands):AssemblyArcPathEvaluation{
    return this.inspectCurrentArcPathValue(reference,startVertex,bodyReference,(edge,vertex)=>evaluateAssemblyArcPath(edge,vertex,coordinate,bands));
  }
  private inspectCurrentArcPathValue<T>(reference: EdgeReference, startVertex: VertexReference, bodyReference: BodyReference | null,
    read: (edge: Edge, vertex: Vertex) => T): T {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) throw new Error('Rebuild the current material arc body first.');
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    const entry = bodyReference === null ? null : catalog?.resolve(bodyReference);
    if (bodyReference !== null && !entry || bodyReference === null && catalog) throw new Error('Exact material arc body required.');
    const source = entry?.ref.sourceFeatureId ?? this.finalState.sourceFeatureId;
    if (reference.sourceFeatureId !== source || startVertex.sourceFeatureId !== source) throw new Error('Material origin and edge must share the current producer.');
    const identity = entry ? JSON.stringify(entry.ref) : JSON.stringify(['legacy',source,this.finalState.lineage]);
    const vertices = this.currentVertexCatalogs.get(identity);
    if (!vertices) throw new Error('Current material vertex catalog unavailable.');
    const current = () => { if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog || vertices !== this.currentVertexCatalogs.get(identity)) throw new Error('Material arc geometry changed during query.'); vertices.assertAlive(); };
    try {
      const result = this.inspectCurrentPathEdgeValue(reference,bodyReference,edge => {
        const vertex = resolveVertexReference(vertices,startVertex,source);
        const value = read(edge,vertex); current(); return value;
      });
      current(); return result;
    } catch (error) { if (isNativeCleanupFailure(error)) { this.inspectionReady=false; this.inspectionEpoch++; } throw error; }
  }

  /** Exact current material vertex. A point has neither an axis nor native authority outside this query. */
  inspectCurrentVertexSupport(reference: VertexReference, bodyReference: BodyReference | null): AssemblyNativePointSupport {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) throw new Error('La pieza necesita una reconstrucción completa y vigente antes de resolver sus vértices.');
    const epoch = this.inspectionEpoch, shape = this.shape, bodyCatalog = this.bodyCatalog;
    let identity: string, sourceFeatureId: string;
    if (bodyReference !== null) {
      if (!bodyCatalog) throw new Error('La pieza antigua no tiene un catálogo explícito de cuerpos.');
      const entry = bodyCatalog.resolve(bodyReference);
      sourceFeatureId = entry.ref.sourceFeatureId; identity = JSON.stringify(entry.ref);
    } else {
      if (bodyCatalog) throw new Error('Selecciona el cuerpo explícito; el agregado no sustituye su identidad.');
      sourceFeatureId = this.finalState.sourceFeatureId;
      identity = JSON.stringify(['legacy', sourceFeatureId, this.finalState.lineage]);
    }
    const vertices = this.currentVertexCatalogs.get(identity);
    if (!vertices) throw new Error('La reconstrucción no publicó el catálogo de vértices del cuerpo actual.');
    try {
      const vertex = resolveVertexReference(vertices, reference, sourceFeatureId), support = extractAssemblyVertexSupport(vertex);
      if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || bodyCatalog !== this.bodyCatalog
        || vertices !== this.currentVertexCatalogs.get(identity)) throw new Error('La geometría cambió mientras se resolvía la referencia de vértice.');
      vertices.assertAlive();
      return support;
    } catch (error) {
      if (isNativeCleanupFailure(error)) { this.inspectionReady = false; this.inspectionEpoch++; }
      throw error;
    }
  }

  /** Internal borrowed source and its exact synchronous owner checkpoint. */
  private captureCurrentBody(reference: BodyReference | null): { source: Shape3D; current: () => void } {
    if (!this.inspectionReady || this.hasErrors || !this.shape || !this.finalState) {
      throw new Error('La pieza necesita una reconstrucción completa y vigente antes de copiar sus cuerpos.');
    }
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    if (reference === null && catalog) throw new Error('Selecciona el cuerpo explícito; el agregado no sustituye su identidad.');
    if (reference !== null && !catalog) throw new Error('La pieza antigua no tiene un catálogo explícito de cuerpos.');
    const source = reference === null ? shape : catalog!.resolve(reference).shape;
    const current = (): void => {
      if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) {
        throw new Error('La geometría cambió mientras se copiaba el cuerpo.');
      }
    };
    return { source, current };
  }

  /** OWNED independent copy of an exact current body, or the complete legacy aggregate. */
  copyCurrentBodyShape(reference: BodyReference | null): Shape3D {
    const { source, current } = this.captureCurrentBody(reference), sourceRaw = source.wrapped;
    try {
      return withNativeOwners(owners => {
        const sourceCount = validateAssemblyShape(source); current();
        const copy = copyBodyShape(source);
        if (copy === source || copy.wrapped === sourceRaw) throw new Error('La copia no puede reutilizar el propietario nativo prestado.');
        owners.own(copy); current();
        if (copy.wrapped.IsPartner(sourceRaw)) throw new Error('La copia conserva topología compartida con el cuerpo original.');
        if (validateAssemblyShape(copy) !== sourceCount) throw new Error('La copia no conserva todos los sólidos del agregado.');
        current();
        return copy;
      }, result => [result], 'Current body copy or release failed.');
    } catch (error) {
      this.inspectionReady = false; this.inspectionEpoch++;
      throw error;
    }
  }

  /** OWNED placed body/count; the prototype remains borrowed and never escapes.
   * Guard every borrowed-source boundary and withhold the result after cleanup
   * if either this build or an enclosing owner's lease was invalidated. */
  placeCurrentAssemblyBody(reference: BodyReference | null, pose: RigidPose, assertOwnerCurrent?: () => void): PlacedAssemblyShape {
    assertOwnerCurrent?.();
    const { source, current: currentBody } = this.captureCurrentBody(reference);
    const current = (): void => { assertOwnerCurrent?.(); currentBody(); };
    try {
      return withNativeOwners(owners => {
        const placed = placeAssemblyShapeChecked(source, pose, current);
        owners.own(placed.shape); current();
        return placed;
      }, result => [result.shape], 'Current body placement or release failed.');
    } catch (error) {
      this.inspectionReady = false; this.inspectionEpoch++;
      throw error;
    }
  }

  /** A read-only lease bound to this exact completed build and its owner. The
   * caller owns every copied body; no borrowed native object escapes. */
  borrowCurrentAssemblyInspection(assertOwnerCurrent: () => void, onFailure: (error: unknown) => void): AssemblyPartInspection {
    if (!this.inspectionReady || this.hasErrors) throw new Error('La pieza necesita una reconstrucción completa y vigente antes de prestar su geometría.');
    const epoch = this.inspectionEpoch;
    const current = (): void => {
      assertOwnerCurrent();
      if (!this.inspectionReady || this.hasErrors || epoch !== this.inspectionEpoch) throw new Error('La geometría prestada ya no está vigente.');
    };
    const read = <T>(operation: () => T, unsupported?: (error: unknown) => boolean): T => {
      // Guard failures are never unsupported geometry, even if an owner throws
      // the same exception class as an ordinary analytic-family rejection.
      try { current(); } catch (error) { onFailure(error); throw error; }
      let result: T;
      try { result = operation(); }
      catch (error) {
        if (!unsupported?.(error)) onFailure(error);
        else { try { current(); } catch { onFailure(error); } }
        throw error;
      }
      try { current(); } catch (error) { onFailure(error); throw error; }
      return result;
    };
    return {
      readCurrentAssemblyPresentation: () => read(() => this.readCurrentAssemblyPresentation()),
      inspectCurrentFaceSupport: (...args) => read(() => this.inspectCurrentFaceSupport(...args), error => error instanceof UnsupportedAssemblySurfaceError),
      inspectCurrentSphereSurfaceSupport: (...args) => read(() => this.inspectCurrentSphereSurfaceSupport(...args), error => error instanceof UnsupportedAssemblySphereSurfaceError),
      inspectCurrentEdgeSupport: (...args) => read(() => this.inspectCurrentEdgeSupport(...args), error => error instanceof UnsupportedAssemblyCurveError),
      inspectCurrentVertexSupport: (...args) => read(() => this.inspectCurrentVertexSupport(...args)),
      inspectCurrentArcPathOrigins: (...args) => read(() => this.inspectCurrentArcPathOrigins(...args)),
      copyCurrentBodyShape: reference => {
        try {
          return withNativeOwners(owners => read(() => owners.own(this.copyCurrentBodyShape(reference))),
            result => [result], 'Borrowed body copy or release failed.');
        } catch (error) { onFailure(error); throw error; }
      },
      placeCurrentAssemblyBody: (reference, pose) => {
        try {
          return withNativeOwners(owners => read(() => {
            const placed = this.placeCurrentAssemblyBody(reference, pose, current);
            owners.own(placed.shape);
            return placed;
          }), result => [result.shape], 'Borrowed body placement or release failed.');
        } catch (error) { onFailure(error); throw error; }
      },
    };
  }

  /** Read the catalogs from an already completed native build. Preserve render
   * meshing order/cache effects without rebuilding or replacing native topology. */
  readCurrentAssemblyPresentation(): AssemblyPresentationBody[] {
    if (!this.inspectionReady || this.hasErrors) throw new Error('La pieza necesita una reconstrucción completa y vigente antes de mostrar sus referencias.');
    const epoch = this.inspectionEpoch, shape = this.shape, catalog = this.bodyCatalog;
    const current = (): void => {
      if (!this.inspectionReady || epoch !== this.inspectionEpoch || shape !== this.shape || catalog !== this.bodyCatalog) {
        throw new Error('La geometría cambió mientras se preparaba su presentación.');
      }
    };
    try {
      // A successfully rebuilt empty part is valid; a new/disposed engine is not.
      if (!shape) { current(); return []; }
      const state = this.finalState;
      if (!state) throw new Error('La reconstrucción no publicó un estado nativo vigente.');
      const bodies = catalog ? catalog.entries().map(entry => ({ body: { ...entry.ref }, name: entry.name, shape: entry.shape,
        identity: JSON.stringify(entry.ref) })) : [{ body: null, name: 'Agregado de pieza', shape,
        identity: JSON.stringify(['legacy', state.sourceFeatureId, state.lineage]) }];
      const result = bodies.map(({ body, name, identity, shape: bodyShape }) => {
        const faces = body ? this.currentFaceCatalogs.get(identity) : this.finalSemanticFaces ?? this.currentFaceCatalogs.get(identity);
        const edges = body ? this.currentEdgeCatalogs.get(identity) : this.finalSemanticEdges ?? this.currentEdgeCatalogs.get(identity);
        const points = this.currentVertexCatalogs.get(identity);
        if (!faces || !edges || !points) throw new Error('La reconstrucción no publicó los catálogos de presentación actuales.');
        // Render build triangulates each body before its picking catalogs.
        // Keep this order: lazy per-face triangulation can differ at seams.
        bodyShape.mesh(MESH_OPTIONS); current();
        bodyShape.meshEdges(MESH_OPTIONS); current();
        const edgeData = pickableEdgesFromCatalog(edges); current();
        const faceData = pickableFacesFromCatalog(faces); current();
        const vertexPoints = pickableVerticesFromCatalog(points); current();
        return { body, name, faces: faceData, edges: edgeData, vertexPoints };
      });
      if (catalog) {
        // The ordinary render route also meshes the aggregate after explicit
        // bodies. Retain those cache effects before making placed copies.
        shape.mesh(MESH_OPTIONS); current();
        shape.meshEdges(MESH_OPTIONS); current();
        pickableEdges(shape, state.sourceFeatureId, state.lineage); current();
        pickableFaces(shape, state.sourceFeatureId, state.lineage); current();
      }
      return result;
    } catch (error) {
      this.inspectionReady = false; this.inspectionEpoch++;
      throw error;
    }
  }

  build(features: Feature[]): CadResult {
    return this.rebuild(features, 'render');
  }

  /** Internal assembly route: the complete native rebuild without visual meshing. */
  rebuildForAssemblyReferences(features: Feature[]): AssemblyReferenceInventory {
    return this.rebuild(features, 'assembly-references');
  }

  private rebuild(features: Feature[], mode: 'render'): CadResult;
  private rebuild(features: Feature[], mode: 'assembly-references'): AssemblyReferenceInventory;
  private rebuild(features: Feature[], mode: 'render' | 'assembly-references'): CadResult | AssemblyReferenceInventory {
    this.dispose();
    // This scan chooses numerical precision, not operand validity. Do not walk
    // raw reference arrays before the per-feature declaration boundary.
    const accurateMeasurements = features.some(feature => !feature.suppressed && (
      feature.type === 'hole' || feature.type === 'combine' || feature.type === 'revolvedCut'
      || ('bodyScope' in feature && feature.bodyScope !== undefined)
      || (isRepetition(feature) && (feature.source?.mode === 'bodies' || feature.bodyPattern !== undefined || 'featurePattern' in feature))
      || ((feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') && !!feature.bodyOperation)
      || ((feature.type === 'extrude' || feature.type === 'cut') && !!feature.endCondition)));
    const measuredVolume=(shape:Shape3D):number=>{
      if(!accurateMeasurements)return shapeVolume(shape);
      const oc=getOC(),properties=new oc.GProp_GProps();
      try{oc.BRepGProp.VolumeProperties(shape.wrapped,properties,1e-10,false,false);return properties.Mass();}finally{properties.delete();}
    };
    const validateSolid=(shape:Shape3D):number=>{validateNativeSolid(shape);return measuredVolume(shape);};
    const result = emptyResult();
    const sketches = new Map<string, SketchFeature>();
    const sketchFrames = new Map<string, PlaneFrame>();
    const sketchSupportLineages = new Map<string, string>();
    const planes = new Map<string, { frame: PlaneFrame; lineage: string }>();
    const planeFeatureIds = new Set<string>();
    const seenIds = new Set<string>();
    const seenBodyIds = new Set<string>();
    const solidFeatureIds = new Set<string>();
    const unavailableFeatureIds = new Set<string>();
    let body: Shape3D | null = null;
    let bodyCatalog: NativeBodyCatalog | null = this.bodyCatalog;
    let currentVolume = 0;
    let sourceFeatureId = '';
    let lineage = '';
    let semantic: PrismReferences | undefined;
    let legacySolidSeen = false;
    let featureBodyCommitted = false;
    const prismOwners: OwnedEntityPrism[] = [];
    const repetitions = features.filter(isRepetition).filter((feature) => !feature.suppressed);
    // Raw consumers are validated before cache planning, but their errors stay
    // attributable to that feature rather than preventing its predecessors.
    const repetitionDeclarationErrors = new Map<Feature, unknown>();
    const validRepetitions = repetitions.filter(feature => {
      try { validateBodyPatternDeclaration(feature); validateFeaturePatternDeclaration(feature); return true; }
      catch (error) { repetitionDeclarationErrors.set(feature, error); return false; }
    });
    const wantedDeltas = new Set(validRepetitions.flatMap((feature) => feature.source?.mode === 'features' && !feature.featurePattern ? feature.source.featureIds : []));
    const wantedBodies = new Set(validRepetitions.flatMap((feature) => feature.source?.mode === 'body' ? [feature.source.sourceFeatureId] : []));
    const historicalDeltas = new Map<string, FeatureGeometry>();
    let historicalOwnedDeltas = new Map<string, OwnedFeatureGeometry>();
    let historicalRecipeStates = new Map<string, NativeRecipeSourceState>();
    const wantedRecipeStates = new Map<string, BodyReference>();
    const recipeSourceBudgetErrors = new Set<Feature>();
    const wantedOwnedContributions = new Map<string, BodyReference>();
    const ownedContributionBudgetErrors = new Set<Feature>();
    for (const repetition of validRepetitions) {
      if (repetition.featurePattern?.mode !== 'geometry') continue;
      const refs = featurePatternSourceReferences(repetition);
      const newRefs = refs.filter(ref => !wantedOwnedContributions.has(featureContributionKey(ref)));
      if (wantedOwnedContributions.size + newRefs.length > MAX_FEATURE_PATTERN_CONTRIBUTIONS) {
        ownedContributionBudgetErrors.add(repetition); continue;
      }
      for (const ref of refs) wantedOwnedContributions.set(featureContributionKey(ref), ref);
    }
    for (const repetition of validRepetitions) {
      if (repetition.featurePattern?.mode !== 'regenerate') continue;
      const refs = featurePatternSourceReferences(repetition);
      const additions = refs.filter(ref => !wantedRecipeStates.has(featureContributionKey(ref)));
      if (wantedRecipeStates.size + additions.length > MAX_FEATURE_PATTERN_CONTRIBUTIONS) {
        recipeSourceBudgetErrors.add(repetition); continue;
      }
      for (const ref of refs) wantedRecipeStates.set(featureContributionKey(ref), { ...ref });
    }
    const historicalBodies = new Map<string, { body: Shape3D; lineage: string }>();
    const exactBodyKey = (ref: BodyReference) => JSON.stringify([ref.bodyId, ref.sourceFeatureId]);
    const wantedExactBodies = new Map<string, BodyReference>();
    const historicalBodyBudgetErrors = new Set<string>();
    const historicalExactBodies = new Map<string, NativeBodyEntry>();
    for (const repetition of validRepetitions) {
      if (repetition.source?.mode !== 'bodies' || repetition.source.scope !== 'historical' || !Array.isArray(repetition.source.bodies)) continue;
      for (const ref of repetition.source.bodies) {
        if (!ref || typeof ref.bodyId !== 'string' || typeof ref.sourceFeatureId !== 'string') continue;
        const key = exactBodyKey(ref);
        if (wantedExactBodies.has(key)) continue;
        if (wantedExactBodies.size >= 512) { historicalBodyBudgetErrors.add(repetition.id); continue; }
        wantedExactBodies.set(key, { ...ref });
      }
    }
    const wantedLimitFaces = new Set(features.flatMap(feature => !feature.suppressed && (feature.type==='extrude'||feature.type==='cut')
      && feature.endCondition?.kind==='upToSurface' && feature.endCondition.target?.kind==='face'
      && typeof feature.endCondition.target.face?.sourceFeatureId === 'string'
      ? [feature.endCondition.target.face.sourceFeatureId] : []));
    const historicalLimitFaces = new Map<string, FaceCatalog | SemanticFaceCatalog>();
    const referencedSources = new Set([...wantedLimitFaces, ...features.flatMap((feature) =>
      !feature.suppressed && 'support' in feature && feature.support?.kind === 'face'
        && typeof feature.support.face?.sourceFeatureId === 'string'
        ? [feature.support.face.sourceFeatureId] : [])]);
    const historicalFaces = new Map<string, { entries: SemanticFaceDescriptor[]; lineage: string; semantic: boolean }>();
    const adoptBodyTransaction = (transaction: NativeBodyTransaction): void => {
      let next: ReturnType<NativeBodyTransaction['commit']> | undefined;
      const captured = new Map<string, OwnedFeatureGeometry>();
      const capturedRecipes = new Map<string, NativeRecipeSourceState>();
      const recipeOwners = new NativeOwners();
      let capturedTransferred = false;
      let operationFailed = false, operationError: unknown;
      const failures: unknown[] = [];
      try {
        // Capture only requested exact outputs while both detached candidate
        // and prior owner still exist. Consumed entries are never negatives.
        for (const output of transaction.nextEntries) {
          const key = featureContributionKey(output.ref);
          if (!wantedOwnedContributions.has(key) || historicalOwnedDeltas.has(key)) continue;
          const record: OwnedFeatureGeometry = { ref: { ...output.ref }, order: seenIds.size, lineage: output.lineage };
          try { captured.set(key, record); }
          catch (error) { throw new BodyStatePublicationError('Historical body contribution staging failed before state transfer.', { cause: error }); }
          const before = bodyCatalog?.entries().find(item => item.ref.bodyId === output.ref.bodyId);
          try { record.delta = ownedGeometryDelta(before?.shape ?? null, output.shape, validateSolid, measuredVolume); }
          catch (error) {
            if (error instanceof FeatureContributionReleaseError) throw error;
            record.error = error instanceof Error ? error.message : 'No se pudo aislar la aportación material exacta.';
          }
        }
        // Capture full exact recipe poststates before either catalog/cache adopts.
        // A source declaration or signed delta does not attest a native poststate.
        for (const output of transaction.nextEntries) {
          const key = featureContributionKey(output.ref);
          if (!wantedRecipeStates.has(key) || historicalRecipeStates.has(key)) continue;
          const record: { ref: BodyReference; lineage: string; shape?: Shape3D; error?: unknown } = {
            ref: { ...output.ref }, lineage: output.lineage,
          };
          try { capturedRecipes.set(key, record); }
          catch (error) { throw new BodyStatePublicationError('Historical recipe staging failed before state transfer.', { cause: error }); }
          // Transaction outputs are valid; preflight independently rechecks the
          // copied source before any recipe tool. Do not swallow a legacy raw
          // validator cleanup error as an ordinary capture error here.
          try { record.shape = recipeOwners.own(copyBodyShape(output.shape)); }
          catch (error) {
            if (isNativeCleanupFailure(error) || recipeOwners.cleanupErrors().length) throw error;
            record.error = error; // Preserve the exact ordinary capture cause for its consumer.
          }
        }
        // Prepare the complete cache without publishing partial ownership. Its
        // old records remain borrowed from the existing cache; only captured
        // records belong to this proposal until all state transfers succeed.
        let nextOwnedDeltas: Map<string, OwnedFeatureGeometry>;
        let nextRecipeStates: Map<string, NativeRecipeSourceState>;
        try {
          nextOwnedDeltas = new Map(historicalOwnedDeltas);
          for (const [key, record] of captured) nextOwnedDeltas.set(key, record);
          nextRecipeStates = new Map(historicalRecipeStates);
          for (const [key, record] of capturedRecipes) nextRecipeStates.set(key, record);
        } catch (error) {
          throw new BodyStatePublicationError('Historical body contribution publication failed before state transfer.', { cause: error });
        }
        next = transaction.commit();
        const nextBody = next.aggregate, nextCatalog = next.catalog;
        const volume = validateSolid(nextBody);
        const previousBody = body, previousCatalog = bodyCatalog;
        // Only local assignments occur during publication. Disarm candidate
        // cleanup immediately after adoption, before any fallible release.
        body = nextBody; bodyCatalog = nextCatalog;
        next = undefined;
        historicalOwnedDeltas = nextOwnedDeltas;
        historicalRecipeStates = nextRecipeStates;
        capturedTransferred = true; // Plain disarm: no fallible registry mutation after adoption.
        currentVolume = volume; featureBodyCommitted = true;
        try { previousBody?.delete(); } catch (error) { failures.push(error); }
        try { previousCatalog?.dispose(); } catch (error) { failures.push(error); }
        if (failures.length) throw new BodyStateReleaseError(failures.splice(0), 'Previous body catalog release failed after state transfer.');
      } catch (error) {
        operationFailed = true; operationError = error;
      } finally {
        if (!capturedTransferred) for (const record of captured.values()) {
          try { record.delta?.dispose(); } catch (error) { failures.push(error); }
        }
        if (!capturedTransferred) {
          recipeOwners.releaseExcept(new Set());
          failures.push(...recipeOwners.cleanupErrors());
        }
        if (next) {
          try { next.aggregate.delete(); } catch (error) { failures.push(error); }
          try { next.catalog.dispose(); } catch (error) { failures.push(error); }
        }
        try { transaction.dispose(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new BodyStateReleaseError(operationFailed ? [operationError, ...failures] : failures,
        'Body transaction operation or release failed.', operationFailed ? { cause: operationError } : undefined);
      if (operationFailed) throw operationError;
    };
    const rememberReferencedSource = (before: Shape3D | null) => {
      if (!body) return;
      if (bodyCatalog) {
        for (const [key, ref] of wantedExactBodies) {
          if (ref.sourceFeatureId !== sourceFeatureId || historicalExactBodies.has(key)) continue;
          const entry = bodyCatalog.entries().find(item => item.ref.bodyId === ref.bodyId && item.ref.sourceFeatureId === ref.sourceFeatureId);
          if (entry) historicalExactBodies.set(key, { ...entry, shape: copyBodyShape(entry.shape) });
        }
      }
      if (!bodyCatalog && wantedBodies.has(sourceFeatureId)) historicalBodies.set(sourceFeatureId, { body: body.clone(), lineage });
      if (!bodyCatalog && wantedDeltas.has(sourceFeatureId)) {
        const record: FeatureGeometry = { id: sourceFeatureId, order: seenIds.size, lineage };
        historicalDeltas.set(sourceFeatureId, record);
        try {
          record.delta = geometryDelta(before, body, validateSolid);
        }
        catch (error) {
          record.error = error instanceof Error ? error.message : 'OpenCascade no pudo aislar la aportación geométrica.';
        }
      }
      if (!referencedSources.has(sourceFeatureId)) return;
      const catalog = bodyCatalog ? historicalBodyFaceCatalog(body, sourceFeatureId, lineage, bodyCatalog)
        : semantic ? createSemanticFaceCatalog(body, sourceFeatureId, lineage, semantic)
          : createFaceCatalog(body, sourceFeatureId, lineage);
      let retained = false, copyFailed = false, copyError: unknown;
      try {
        historicalFaces.set(sourceFeatureId, { lineage, semantic: !!semantic,
          entries: catalog.entries.map((entry: FaceDescriptor & { readonly aliases?: readonly FaceReference[] }) => ({
          ref: { ...entry.ref }, frame: entry.frame ? clonePlaneFrame(entry.frame) : null,
          aliases: entry.aliases?.map(alias => ({ ...alias })) ?? [],
        })) });
        if (wantedLimitFaces.has(sourceFeatureId)) {
          historicalLimitFaces.set(sourceFeatureId, catalog); retained = true;
        }
      } catch (error) { copyFailed = true; copyError = error; throw error; }
      finally {
        if (!retained) {
          try { catalog.dispose(); }
          catch (error) {
            if (copyFailed) throw new AggregateError([copyError, error], 'Historical face copy and release failed.');
            throw error;
          }
        }
      }
    };
    const sketchSupportContext = { planeFeatureIds, solidFeatureIds, unavailableFeatureIds, planes, historicalFaces };
    const resolveSupport = (support: PlaneSupport) => resolveSourceSketchSupport(sketchSupportContext, support);
    const sourceSketchSolveSession = createSourceSketchSolveRegistry(features, sketchSupportContext);
    const sourceSketchSolves = sourceSketchSolveSession.reader;
    const revolutionSources: RevolutionAxisSources = {
      sketchLine: (sketchId, entityId) => {
        const source = sketches.get(sketchId), frame = sketchFrames.get(sketchId);
        if (!source || source.suppressed || unavailableFeatureIds.has(sketchId) || !frame || source.profile.kind !== 'entities') {
          throw new Error('El croquis anterior del eje está suprimido, no está resuelto o no contiene líneas.');
        }
        const axis = resolveRevolutionAxis({ axis: { kind: 'sketch-line', entityId } }, source, frame);
        return { origin: axis.origin, direction: axis.direction,
          identity: ['external-sketch-line', sketchId, entityId, source.plane,
            entityProfileStructure(source.profile), sketchSupportLineages.get(sketchId) ?? null] };
      },
      linearEdge: (reference, bodyReference) => {
        const currentBody = body;
        if (!currentBody) throw new Error('El eje requiere una arista de un sólido anterior vigente.');
        return withNativeOwners(owners => {
          if (bodyReference !== null) {
            if (!bodyCatalog) throw new Error('La pieza antigua no tiene un catálogo explícito de cuerpos.');
            const entry = bodyCatalog.resolve(bodyReference);
            if (reference.sourceFeatureId !== entry.ref.sourceFeatureId) throw new Error('La arista y el cuerpo del eje pertenecen a estados distintos.');
            const catalog = createEdgeCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage);
            owners.own({ delete: () => catalog.dispose() });
            const edge = resolveEdgeReferences(catalog, [reference], entry.ref.sourceFeatureId)[0];
            const support = extractAssemblyEdgeSupport(edge);
            return { origin: support.point, direction: support.axis,
              identity: ['linear-edge', { ...entry.ref }, { ...reference }, entry.lineage] };
          }
          if (bodyCatalog) throw new Error('Selecciona el cuerpo explícito de la arista; el agregado no sustituye su identidad.');
          if (reference.sourceFeatureId !== sourceFeatureId) throw new Error('La arista del eje no pertenece al estado anterior vigente.');
          const catalog = createSemanticEdgeCatalog(currentBody, sourceFeatureId, lineage, semantic);
          owners.own({ delete: () => catalog.dispose() });
          const edge = resolveSemanticEdgeReferences(catalog, [reference], sourceFeatureId)[0];
          const support = extractAssemblyEdgeSupport(edge);
          return { origin: support.point, direction: support.axis,
            identity: ['linear-edge', null, { ...reference }, lineage] };
        }, undefined, 'Revolution axis extraction or native catalog release failed.');
      },
    };

    const built = withPrismOwners<CadResult | AssemblyReferenceInventory>(prismOwners, () => {
    let reconstructionFailed = false, reconstructionError: unknown;
    let featureIndex = -1;
    try { for (const feature of features) {
      featureIndex++;
      featureBodyCommitted = false;
      let tool: Shape3D | null = null;
      let candidate: Shape3D | null = null;
      let beforeForRecord: Shape3D | null = null;
      const extraCandidates: Shape3D[] = [];
      let toolSemantic: PrismReferences | undefined;
      let featureFailed = false, featureError: unknown;
      let bodyAware = false;
      try {
        const thinWall = resolveThinWall(feature);
        assertThinWallEndCapsContext(thinWall?.definition, feature.type === 'extrude' ? 'add' : 'subtract',
          feature.type === 'extrude' && feature.endCondition === undefined,
          feature.type !== 'extrude' || feature.symmetric !== false);
        if (thinWall && feature.type !== 'extrude' && feature.type !== 'cut'
          && feature.type !== 'revolve' && feature.type !== 'revolvedCut') {
          throw new Error('La pared delgada solo corresponde a extrusiones y revoluciones de material o corte.');
        }
        const importedBase = Object.getOwnPropertyDescriptor(feature, 'type')?.value === 'importedBodies' ? validateImportedBodiesFeature(feature) : undefined;
        if (isRepetition(feature)) {
          if (repetitionDeclarationErrors.has(feature)) throw repetitionDeclarationErrors.get(feature);
          validateBodyPatternDeclaration(feature); validateFeaturePatternDeclaration(feature);
        }
        if (feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') {
          validateBodyOperationDeclaration(feature);
        }
        bodyAware = createdBodyIds(importedBase ?? feature).length > 0 || featureBodyReferences(feature).length > 0;
        if (seenIds.has(feature.id)) throw new Error('El identificador de esta operación está duplicado.');
        seenIds.add(feature.id);
        for (const id of createdBodyIds(importedBase ?? feature)) {
          if (seenBodyIds.has(id)) throw new Error('El identificador de un cuerpo creado está duplicado, incluso entre operaciones suprimidas.');
          seenBodyIds.add(id);
          if (seenBodyIds.size > MAX_CREATED_BODY_IDS) throw new Error('El documento supera 65536 identidades de cuerpo guardadas, incluidas las retiradas.');
        }
        if (feature.type !== 'sketch' && feature.type !== 'plane' && !bodyAware) legacySolidSeen = true;
        sourceSketchSolveSession.observeFeature(feature, featureIndex);
        if (feature.type === 'plane') {
          planeFeatureIds.add(feature.id);
          if (feature.suppressed) { unavailableFeatureIds.add(feature.id); continue; }
          if (!Number.isFinite(feature.offset) || Math.abs(feature.offset) > 1_000_000 || typeof feature.reversed !== 'boolean') {
            throw new Error('El desplazamiento del plano debe ser finito, no superar 1.000.000 mm y tener una orientación válida.');
          }
          const support = resolveSupport(feature.support);
          if (!support) {
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su soporte está suprimido o no está disponible.`);
            continue;
          }
          const frame = offsetPlaneFrame(support.frame, feature.offset, feature.reversed);
          planes.set(feature.id, { frame, lineage: advanceLineage(support.lineage, [feature.id, 'plane', feature.reversed]) });
          result.planes!.push({ id: feature.id, frame: clonePlaneFrame(frame) });
          continue;
        }
        if (feature.type === 'sketch') {
          sketches.set(feature.id, feature);
          if (feature.suppressed) { unavailableFeatureIds.add(feature.id); continue; }
          if (feature.profile.kind === 'entities') {
            const accepted = sourceSketchSolveSession.solveAndStage(feature, featureIndex, (resolved, frame, supportLineage, visual) => {
              sketches.set(feature.id, resolved);
              sketchFrames.set(feature.id, frame);
              if (supportLineage !== null) sketchSupportLineages.set(feature.id, supportLineage);
              result.sketches!.push(visual);
            });
            if (accepted.kind === 'support-unavailable') {
              unavailableFeatureIds.add(feature.id);
              result.warnings.push(`${feature.name}: omitida porque su soporte está suprimido o no está disponible.`);
            }
            continue;
          }
          const support = feature.support ? resolveSupport(feature.support) : null;
          if (feature.support && !support) {
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su soporte está suprimido o no está disponible.`);
            continue;
          }
          const resolved = feature.suppressed ? feature : validateSketch(feature);
          sketches.set(feature.id, resolved);
          const frame = support ? offsetPlaneFrame(support.frame, feature.offset) : principalPlaneFrame(feature.plane, feature.offset);
          sketchFrames.set(feature.id, frame);
          if (support) sketchSupportLineages.set(feature.id, support.lineage);
          result.sketches!.push(sketchVisual(resolved, frame));
          continue;
        }
        if (importedBase) {
          if (solidFeatureIds.size || body || bodyCatalog) throw new Error('La base STEP de cuerpos debe ser la primera y unica base importada, incluso con operaciones suprimidas.');
          solidFeatureIds.add(importedBase.id);
          if (importedBase.suppressed) { unavailableFeatureIds.add(importedBase.id); continue; }
          // Every source is independently one closed solid. No enumeration of
          // an aggregate, geometric matching or union invents body identities.
          const nextLineage = advanceLineage('', [importedBase.id, 'importedBodies',
            importedBase.bodies.map(item => [item.bodyId, item.source.sha256])]);
          withNativeOwners(owners => {
            const catalog = new NativeBodyCatalog(); owners.own({ delete: () => catalog.dispose() });
            // Resolve all sources before staging anything. stageNewMany copies
            // its borrowed inputs and publishes one validated transaction only.
            const additions = importedBase.bodies.map(item => ({
              metadata: { ref: { bodyId: item.bodyId, sourceFeatureId: importedBase.id },
                createdByFeatureId: importedBase.id, name: importedBase.name + ' / ' + item.bodyId,
                lineage: advanceLineage('', [importedBase.id, 'importedBodies', item.bodyId, item.source.sha256]) },
              shape: owners.own(importStepSolid(item.source)),
            }));
            adoptBodyTransaction(catalog.stageNewMany(additions));
          }, undefined, 'Imported body base operation or temporary source release failed.');
          sourceFeatureId = importedBase.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(null);
          continue;
        }
        if (feature.type === 'importedSolid') {
          if (solidFeatureIds.size || body) throw new Error('La importación STEP debe ser la primera y única importación sólida, incluso si las operaciones anteriores están suprimidas.');
          solidFeatureIds.add(feature.id);
          if (feature.suppressed) { unavailableFeatureIds.add(feature.id); continue; }
          tool = importStepSolid(feature.source);
          currentVolume = validateSolid(tool);
          body = tool; tool = null; sourceFeatureId = feature.id;
          lineage = advanceLineage('', [feature.id, 'importedSolid', feature.source.sha256]);
          rememberReferencedSource(null);
          continue;
        }
        if (feature.suppressed) {
          solidFeatureIds.add(feature.id);
          unavailableFeatureIds.add(feature.id);
          continue;
        }
        if (!bodyCatalog && wantedDeltas.has(feature.id)) beforeForRecord = body?.clone() ?? null;
        if (bodyCatalog && feature.type === 'hole' && !feature.bodyScope?.length) throw new Error('Selecciona los cuerpos exactos sobre los que aplicar los taladros.');
        if (bodyCatalog && (feature.type === 'fillet' || feature.type === 'chamfer' || feature.type === 'shell' || feature.type === 'draft') && !feature.bodyScope) {
          throw new Error('Selecciona un cuerpo exacto para esta operación.');
        }
        if (feature.type === 'combine') {
          solidFeatureIds.add(feature.id);
          if (!bodyCatalog) throw new Error('Combinar requiere cuerpos creados explícitamente; los compuestos antiguos no reciben identidades automáticamente.');
          const nextLineage = advanceLineage(lineage, [feature.id, 'combine', feature.operation,
            featureBodyReferences(feature), feature.keepTools,
            feature.operation === 'subtract' ? null : feature.resultBodyId]);
          adoptBodyTransaction(bodyCatalog.stageCombine(feature, nextLineage));
          sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (isRepetition(feature) && feature.source.mode === 'bodies') {
          solidFeatureIds.add(feature.id);
          if (!bodyCatalog || !body) throw new Error('Las copias explícitas requieren un catálogo de cuerpos; la geometría antigua no se adopta automáticamente.');
          if (!solidFeatureIds.has(feature.baseFeatureId) || feature.baseFeatureId === feature.id
            || unavailableFeatureIds.has(feature.baseFeatureId) || sourceFeatureId !== feature.baseFeatureId) {
            throw new Error('El predecesor de la matriz o simetría no está disponible. Recupera la base.');
          }
          if (historicalBodyBudgetErrors.has(feature.id)) throw new Error('El documento supera 512 estados históricos de cuerpo requeridos por patrones.');
          const source = feature.source, operation = feature.bodyPattern!;
          const seeds = source.bodies.map(ref => {
            if (source.scope === 'current') return bodyCatalog!.resolve(ref);
            const entry = historicalExactBodies.get(exactBodyKey(ref));
            if (!entry) throw new Error('No está disponible el estado histórico exacto del cuerpo semilla. Recupera la selección.');
            return entry;
          });
          // Resolve every operand before constructing any candidate.
          if (operation.mode === 'merge') bodyCatalog.resolve(operation.target);
          const support = feature.type === 'mirror' ? resolveSupport(feature.support) : null;
          if (feature.type === 'mirror' && !support) throw new Error('No está disponible el plano de la simetría de cuerpos.');
          const plan = patternPlan(feature, support?.frame);
          const applications = seeds.length * plan.transforms.length;
          if (applications > 512) throw new Error('La matriz supera 512 aplicaciones de cuerpos semilla.');
          if (operation.mode === 'new' && bodyCatalog.entries().length + applications > 256) throw new Error('Las copias superan el límite de 256 cuerpos activos.');
          const nextLineage = advanceLineage(lineage, [feature.id, feature.type, 'owned-body-pattern', source.scope,
            seeds.map(seed => [seed.ref, seed.lineage]), plan.structure, support?.lineage ?? null,
            operation.mode, operation.mode === 'merge' ? operation.target : null]);
          const slots = operation.mode === 'new'
            ? new Map(operation.instances.filter(slot => !slot.retired).map(slot => [JSON.stringify([slot.seedBodyId, slot.address]), slot])) : null;
          const copies: { metadata: Omit<NativeBodyEntry, 'shape'>; shape: Shape3D }[] = [];
          for (const transform of plan.transforms) for (const seed of seeds) {
            const copy = bodyPatternCopy(seed.shape, transform);
            extraCandidates.push(copy);
            const slot = slots?.get(JSON.stringify([seed.ref.bodyId, transform.key]));
            if (operation.mode === 'new' && !slot) throw new Error('Falta la identidad guardada de una copia. Edita el patrón para reconstruir su registro.');
            copies.push({ shape: copy, metadata: {
              ref: { bodyId: slot?.bodyId ?? seed.ref.bodyId, sourceFeatureId: feature.id },
              createdByFeatureId: feature.id, name: `${feature.name} · ${seed.name} · ${transform.key}`,
              lineage: advanceLineage(seed.lineage, [feature.id, source.scope, seed.ref, transform.key,
                plan.structure, support?.lineage ?? null, slot?.bodyId ?? null, 'body-copy']),
            } });
          }
          adoptBodyTransaction(operation.mode === 'new' ? bodyCatalog.stageNewMany(copies)
            : bodyCatalog.stageMergeMany(operation.target, copies.map(copy => copy.shape), { sourceFeatureId: feature.id, lineage: nextLineage }));
          sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (isRepetition(feature) && feature.featurePattern?.mode === 'regenerate') {
          solidFeatureIds.add(feature.id);
          if (!bodyCatalog || !body) throw new Error('El recálculo de operaciones requiere cuerpos con identidad explícita.');
          if (feature.source.mode !== 'features' || feature.source.geometryPattern !== false) throw new Error('Selecciona el método de recalcular operaciones.');
          if (!solidFeatureIds.has(feature.baseFeatureId) || feature.baseFeatureId === feature.id
            || unavailableFeatureIds.has(feature.baseFeatureId) || sourceFeatureId !== feature.baseFeatureId) {
            throw new Error('El predecesor del recálculo no está disponible. Recupera la base.');
          }
          if (feature.source.featureIds.some(id => !solidFeatureIds.has(id) || id === feature.id || unavailableFeatureIds.has(id))) {
            throw new Error('Una operación semilla está ausente, suprimida o no es anterior a la repetición.');
          }
          if (recipeSourceBudgetErrors.has(feature)) throw new Error('El documento supera 512 estados históricos exactos requeridos para recalcular operaciones.');
          const support = feature.type === 'mirror' ? resolveSupport(feature.support) : null;
          if (feature.type === 'mirror' && !support) throw new Error('El plano de simetría no está disponible. Recupera el soporte.');
          const plan = patternPlan(feature, support?.frame), operation = feature.featurePattern;
          const scope: RegenerationRequest['scope'] = isAllFeaturePattern(operation)
            ? { mode: 'all', reevaluateAt: 'patternInput' } : { mode: 'selected', targets: operation.targets };
          const targetSnapshot = resolveNativeRecipeScope(scope, bodyCatalog);
          featurePatternApplications(feature, targetSnapshot.length);
          const request: RegenerationRequest = {
            mode: 'regenerate', geometryPattern: false, patternId: feature.id, patternKind: feature.type,
            beforeFeatureIndex: features.indexOf(feature), sourceFeatureIds: [...feature.source.featureIds],
            plan: { transforms: plan.transforms, structure: plan.structure },
            scope, targetSnapshot,
            bindings: operation.bindings.map(binding => ({ source: binding.source, targets: binding.targetBodyIds })),
            referencePolicies: operation.referencePolicies, variation: operation.variation,
          };
          const evaluation = evaluateFeatureRecipes({ features, request, catalog: bodyCatalog, historicalStates: historicalRecipeStates, sourceSketchSolves });
          let nextLineage: string;
          try {
            const proof = evaluation.attestation;
            nextLineage = advanceLineage(lineage, [feature.id, feature.type, 'owned-feature-regeneration',
              proof.evaluatorRevision, proof.recipeFingerprintInput, proof.sources.map(item => [item.ref, item.lineage]),
              proof.targets.map(item => [item.ref, item.lineage]), plan.structure, support?.lineage ?? null]);
          } catch (error) {
            try { evaluation.dispose(); }
            catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Recipe lineage preparation and release failed.'); }
            throw error;
          }
          // Stage consumes all evaluator candidates before returning its owned proposal.
          // The existing adoption boundary prepares every cache before one transfer.
          const transaction = stageFeatureRecipeEvaluation(evaluation, bodyCatalog,
            { sourceFeatureId: feature.id, lineage: nextLineage }, { features, request, sourceSketchSolves });
          adoptBodyTransaction(transaction);
          sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (isRepetition(feature) && feature.featurePattern?.mode === 'geometry') {
          solidFeatureIds.add(feature.id);
          if (!bodyCatalog || !body) throw new Error('La repetición de aportaciones requiere cuerpos explícitos; la geometría antigua no se adopta automáticamente.');
          if (feature.source.mode !== 'features') throw new Error('Selecciona operaciones semilla para repetir sus aportaciones.');
          if (!solidFeatureIds.has(feature.baseFeatureId) || feature.baseFeatureId === feature.id
            || unavailableFeatureIds.has(feature.baseFeatureId) || sourceFeatureId !== feature.baseFeatureId) {
            throw new Error('El predecesor de la repetición no está disponible. Recupera la base.');
          }
          if (feature.source.featureIds.some(id => !solidFeatureIds.has(id) || id === feature.id || unavailableFeatureIds.has(id))) {
            throw new Error('Una operación semilla está ausente, suprimida o no es anterior al patrón.');
          }
          if (ownedContributionBudgetErrors.has(feature)) throw new Error('El documento supera 512 aportaciones históricas exactas requeridas por patrones.');
          const support = feature.type === 'mirror' ? resolveSupport(feature.support) : null;
          if (feature.type === 'mirror' && !support) throw new Error('El plano de simetría no está disponible. Recupera el soporte.');
          const plan = patternPlan(feature, support?.frame);
          const operation = feature.featurePattern;
          const replacements = featurePatternReplacements(feature, plan, bodyCatalog, historicalOwnedDeltas, validateSolid, measuredVolume);
          extraCandidates.push(...replacements.map(item => item.shape));
          const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
          const canonicalTargets = [...operation.targets].sort((a, b) => compare(a.bodyId, b.bodyId));
          const canonicalBindings = [...operation.bindings].sort((a, b) => {
            const first = historicalOwnedDeltas.get(featureContributionKey(a.source))!;
            const second = historicalOwnedDeltas.get(featureContributionKey(b.source))!;
            return first.order - second.order || compare(featureContributionKey(a.source), featureContributionKey(b.source));
          });
          const nextLineage = advanceLineage(lineage, [feature.id, feature.type, 'owned-feature-pattern', operation.mode,
            canonicalTargets, canonicalBindings.map(binding => [binding.source, [...binding.targetBodyIds].sort(compare),
              historicalOwnedDeltas.get(featureContributionKey(binding.source))?.lineage]), plan.structure, support?.lineage ?? null]);
          adoptBodyTransaction(bodyCatalog.stageReplaceMany(replacements, { sourceFeatureId: feature.id, lineage: nextLineage }));
          sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (bodyCatalog && isRepetition(feature)) {
          throw new Error('Esta operación aún no define sus salidas individuales en el catálogo de cuerpos. Los documentos antiguos conservan su comportamiento.');
        }
        if(feature.type==='hole'){
          if(!solidFeatureIds.has(feature.baseFeatureId))throw new Error('No se encuentra la operación base anterior de los taladros.');
          solidFeatureIds.add(feature.id);
          if(unavailableFeatureIds.has(feature.baseFeatureId)){
            if (feature.bodyScope) throw new Error('La base de los taladros seleccionados está suprimida o no está disponible.');
            unavailableFeatureIds.add(feature.id);result.warnings.push(`${feature.name}: omitida porque su base está suprimida o no está disponible.`);continue;
          }
          if (feature.bodyScope && feature.baseFeatureId !== feature.bodyScope[0]?.sourceFeatureId) throw new Error('La base de los taladros debe coincidir con el primer cuerpo seleccionado.');
          if(!body||(!feature.bodyScope&&sourceFeatureId!==feature.baseFeatureId))throw new Error('El cuerpo anterior ha cambiado. Recupera la base del asistente para taladro.');
          const support=resolveSupport(feature.support);
          if (!support && bodyAware) throw new Error('El soporte de los taladros seleccionados está suprimido o no está disponible.');
          if(!support){unavailableFeatureIds.add(feature.id);result.warnings.push(`${feature.name}: omitida porque su soporte está suprimido o no está disponible.`);continue;}
          // The editor still needs the historical plane when an empty/invalid position list prevents a solid.
          result.holes!.push({id:feature.id,frame:clonePlaneFrame(support.frame)});
          if (bodyCatalog || feature.bodyScope) {
            if (!bodyCatalog || !feature.bodyScope?.length) throw new Error('Selecciona los cuerpos exactos sobre los que aplicar los taladros.');
            const replacements = feature.bodyScope.map(ref => {
              const entry = bodyCatalog!.resolve(ref);
              const isolated = copyBodyShape(entry.shape);
              extraCandidates.push(isolated);
              const shape = holeSolid(isolated, feature, support.frame, validateSolid);
              extraCandidates.push(shape);
              return { ref, shape };
            });
            const nextLineage = advanceLineage(lineage, [feature.id, 'hole', featureBodyReferences(feature),
              support.lineage, holePositionStructure(feature.positions), feature.reversed, feature.head.kind, feature.endCondition.kind,
              feature.endCondition.kind === 'blind' ? [feature.endCondition.depthReference, feature.endCondition.tip.kind] : null]);
            adoptBodyTransaction(bodyCatalog.stageReplaceMany(replacements, { sourceFeatureId: feature.id, lineage: nextLineage }));
            sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
            rememberReferencedSource(beforeForRecord); continue;
          }
          candidate=holeSolid(body,feature,support.frame,validateSolid);
          currentVolume=validateSolid(candidate);body.delete();body=candidate;candidate=null;sourceFeatureId=feature.id;
          semantic = undefined;
          lineage=advanceLineage(lineage,[feature.id,'hole',feature.baseFeatureId,support.lineage,feature.reversed,
            holePositionStructure(feature.positions),feature.head.kind,feature.endCondition.kind,
            feature.endCondition.kind==='blind'?[feature.endCondition.depthReference,feature.endCondition.tip.kind]:null]);
          rememberReferencedSource(beforeForRecord);continue;
        }
        if (isRepetition(feature)) {
          if (feature.source.mode === 'bodies') throw new Error('La repetición explícita no pudo resolver su catálogo de cuerpos.');
          solidFeatureIds.add(feature.id);
          if (!solidFeatureIds.has(feature.baseFeatureId) || feature.baseFeatureId === feature.id) throw new Error('No se encuentra la operación base anterior de la matriz o simetría.');
          const ids = feature.source.mode === 'features' ? feature.source.featureIds : [feature.source.sourceFeatureId];
          if (!ids.length || new Set(ids).size !== ids.length || (feature.source.mode === 'features' && ids.length > 32)) throw new Error('Selecciona entre 1 y 32 semillas anteriores, sin repetir identificadores.');
          if (feature.source.mode === 'features' && feature.source.geometryPattern !== true) throw new Error('Esta versión requiere copiar la geometría de las operaciones. El recálculo de condiciones finales aún no está disponible.');
          if (ids.some((id) => !solidFeatureIds.has(id) || id === feature.id)) throw new Error('La semilla debe ser una operación sólida anterior. Recupera la selección.');
          if (unavailableFeatureIds.has(feature.baseFeatureId) || ids.some((id) => unavailableFeatureIds.has(id))) {
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su base o una semilla está suprimida o no está disponible.`);
            continue;
          }
          if (!body || sourceFeatureId !== feature.baseFeatureId) throw new Error('El sólido anterior ha cambiado. Recupera la selección de la base de la matriz o simetría.');
          const support = feature.type === 'mirror' ? resolveSupport(feature.support) : null;
          if (feature.type === 'mirror' && !support) {
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su plano de simetría está suprimido o no está disponible.`);
            continue;
          }
          const plan = patternPlan(feature, support?.frame);
          const seeds = feature.source.mode === 'features' ? ids.map((id) => {
            const seed = historicalDeltas.get(id);
            if (!seed) throw new Error('No se encuentra la aportación geométrica histórica de una semilla.');
            return seed;
          }).sort((a, b) => a.order - b.order) : null;
          const sourceBody = feature.source.mode === 'body' ? historicalBodies.get(feature.source.sourceFeatureId) : null;
          if (!seeds && !sourceBody) throw new Error('No se encuentra el cuerpo histórico de la semilla.');
          candidate = repetitionSolid(feature, plan, body, seeds ? { seeds } : { body: sourceBody!.body }, validateSolid);
          const volume = validateSolid(candidate);
          body.delete(); body = candidate; candidate = null;
          currentVolume = volume; sourceFeatureId = feature.id;
          semantic = undefined;
          lineage = advanceLineage(lineage, [feature.id, feature.type, feature.baseFeatureId, feature.source.mode,
            seeds ? seeds.map((seed) => [seed.id, seed.lineage]) : [feature.source.mode === 'body' ? feature.source.sourceFeatureId : '', sourceBody!.lineage],
            plan.structure, support?.lineage ?? null]);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (feature.type === 'shell' || feature.type === 'draft') {
          if (!solidFeatureIds.has(feature.baseFeatureId)) throw new Error('No se encuentra la operación base anterior. Recupera la selección de caras.');
          solidFeatureIds.add(feature.id);
          if (unavailableFeatureIds.has(feature.baseFeatureId)) {
            if (feature.bodyScope) throw new Error('La base del cuerpo seleccionado está suprimida o no está disponible.');
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su operación base está suprimida o no está disponible.`);
            continue;
          }
          const scopedBody = bodyCatalog && feature.bodyScope ? bodyCatalog.resolve(feature.bodyScope) : null;
          if ((bodyCatalog || feature.bodyScope) && !scopedBody) throw new Error('Selecciona un cuerpo exacto para esta operación de caras.');
          if (scopedBody && feature.baseFeatureId !== scopedBody.ref.sourceFeatureId) throw new Error('La base y el estado del cuerpo seleccionado no coinciden.');
          if (!body || (!scopedBody && sourceFeatureId !== feature.baseFeatureId)) throw new Error('El sólido anterior ha cambiado. Recupera la selección de caras sobre la base actual.');
          const support = feature.type === 'draft' ? resolveSupport(feature.support) : null;
          if (feature.type === 'draft' && !support) {
            if (bodyAware) throw new Error('El plano neutro del cuerpo seleccionado está suprimido o no está disponible.');
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su plano neutro está suprimido o no está disponible.`);
            continue;
          }
          const operationShape = scopedBody ? copyBodyShape(scopedBody.shape) : body;
          if (scopedBody) extraCandidates.push(operationShape);
          candidate = feature.type === 'shell' ? shellSolid(operationShape, feature, scopedBody?.lineage ?? lineage, validateSolid, scopedBody ? undefined : semantic)
            : draftSolid(operationShape, feature, support!.frame, scopedBody?.lineage ?? lineage, validateSolid, scopedBody ? undefined : semantic);
          const volume = validateSolid(candidate);
          if (scopedBody) {
            const nextLineage = advanceLineage(lineage, [feature.id, feature.type, feature.bodyScope,
              feature.type === 'shell' ? [feature.direction, feature.removedFaces.map(face => face.key).sort()]
                : [feature.reversed, feature.propagation, feature.faces.map(face => face.key).sort(), support!.lineage]]);
            adoptBodyTransaction(bodyCatalog!.stageReplace(scopedBody.ref, candidate, { sourceFeatureId: feature.id, lineage: nextLineage }));
            sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
            rememberReferencedSource(beforeForRecord); continue;
          }
          body.delete(); body = candidate; candidate = null;
          currentVolume = volume; sourceFeatureId = feature.id;
          semantic = undefined;
          lineage = advanceLineage(lineage, [feature.id, feature.type, feature.baseFeatureId,
            feature.type === 'shell' ? [feature.direction, feature.removedFaces.map((face) => face.key).sort()]
              : [feature.reversed, feature.propagation, feature.faces.map((face) => face.key).sort(), support!.lineage]]);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (feature.type === 'fillet' || feature.type === 'chamfer') {
          if (!solidFeatureIds.has(feature.baseFeatureId)) {
            throw new Error('No se encuentra la operación base de este acabado. Recupera la selección de aristas.');
          }
          solidFeatureIds.add(feature.id);
          if (unavailableFeatureIds.has(feature.baseFeatureId)) {
            if (feature.bodyScope) throw new Error('La base del cuerpo seleccionado está suprimida o no está disponible.');
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su operación base está suprimida o no está disponible.`);
            continue;
          }
          const scopedBody = bodyCatalog && feature.bodyScope ? bodyCatalog.resolve(feature.bodyScope) : null;
          if ((bodyCatalog || feature.bodyScope) && !scopedBody) throw new Error('Selecciona un cuerpo exacto para este acabado.');
          if (scopedBody && feature.baseFeatureId !== scopedBody.ref.sourceFeatureId) throw new Error('La base y el estado del cuerpo seleccionado no coinciden.');
          if (!body || (!scopedBody && sourceFeatureId !== feature.baseFeatureId)) {
            throw new Error('El sólido anterior ha cambiado. Recupera la selección de aristas sobre la operación base actual.');
          }
          const operationShape = scopedBody ? copyBodyShape(scopedBody.shape) : body;
          if (scopedBody) extraCandidates.push(operationShape);
          candidate = finishEdges(operationShape, feature, scopedBody?.lineage ?? lineage, scopedBody ? undefined : semantic);
          const volume = validateSolid(candidate);
          if (scopedBody) {
            const nextLineage = advanceLineage(lineage, [feature.id, feature.type, feature.bodyScope, feature.selection.mode,
              feature.selection.mode === 'selected' ? feature.selection.edges.map(reference => reference.key).sort() : null]);
            adoptBodyTransaction(bodyCatalog!.stageReplace(scopedBody.ref, candidate, { sourceFeatureId: feature.id, lineage: nextLineage }));
            sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
            rememberReferencedSource(beforeForRecord); continue;
          }
          body.delete();
          body = candidate;
          candidate = null;
          currentVolume = volume;
          sourceFeatureId = feature.id;
          semantic = undefined;
          lineage = advanceLineage(lineage, [feature.id, feature.type, feature.baseFeatureId, feature.selection.mode,
            feature.selection.mode === 'selected' ? feature.selection.edges.map((reference) => reference.key).sort() : null]);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (feature.type === 'sweep' || feature.type === 'loft') {
          if (bodyCatalog && !feature.bodyOperation) throw new Error('Elige crear un cuerpo nuevo o añadir material a un cuerpo seleccionado.');
          solidFeatureIds.add(feature.id);
          const ids = feature.type === 'sweep' ? [feature.profileSketchId, feature.pathSketchId]
            : feature.sections.map((section) => section.sketchId);
          const inputs = ids.map((id) => {
            const sketch = sketches.get(id);
            if (!sketch) throw new Error('No se encuentra uno de los croquis anteriores de esta operación.');
            return sketch;
          });
          if (inputs.some((sketch) => unavailableFeatureIds.has(sketch.id))) {
            if (bodyAware) throw new Error('Uno de los croquis del cuerpo seleccionado está suprimido o su soporte no está disponible.');
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque uno de sus croquis o soportes está suprimido.`);
            continue;
          }
          if (typeof feature.merge !== 'boolean' || (feature.type === 'loft' && typeof feature.ruled !== 'boolean')) {
            throw new Error('Las opciones de fusión o recubrimiento no son válidas.');
          }
          if (feature.bodyOperation && feature.merge !== (feature.bodyOperation.mode === 'merge')) {
            throw new Error('La opción de fusión debe coincidir con la operación explícita de cuerpo.');
          }
          const sections = inputs.map((sketch) => ({ profile: sketch.profile, frame: sketchFrames.get(sketch.id)! }));
          tool = feature.type === 'sweep' ? sweepSolid(feature, sections[0], sections[1]) : loftSolid(feature, sections);
          validateSolid(tool);
          requireSingleSolid(tool, 'La operación no produce un único sólido cerrado. Revisa las secciones y su correspondencia.');
          const inputStructures = inputs.map((sketch) => [sketch.id, sketch.plane, sketch.profile.kind,
            sketch.profile.kind === 'entities' ? entityProfileStructure(sketch.profile) : null,
            sketch.support ? [sketch.support.kind, sketch.support.kind === 'plane' ? sketch.support.planeId : sketch.support.face.sourceFeatureId,
              sketchSupportLineages.get(sketch.id)] : null]);
          const structure = [feature.id, feature.type, feature.merge, inputStructures,
            feature.type === 'sweep' ? [feature.orientation, feature.path.map(({ entityId, reversed }) => [entityId, reversed])]
              : [feature.ruled, feature.sections.map(({ sketchId, startEntityId, reversed }) => [sketchId, startEntityId, reversed])]];
          if (feature.bodyOperation) {
            const operation = feature.bodyOperation;
            const nextLineage = advanceLineage(lineage, [...structure, ['bodyOperation', operation]]);
            if (operation.mode === 'new') {
              if (!bodyCatalog && legacySolidSeen) throw new Error('Los cuerpos explícitos deben comenzar antes de cualquier operación sólida antigua, incluso suprimida. Crea una pieza nueva.');
              if (body && !bodyCatalog) throw new Error('No se pueden asignar cuerpos individuales a un compuesto antiguo de forma implícita. Crea una pieza con cuerpos explícitos.');
              const emptyCatalog = bodyCatalog === null;
              const catalog = bodyCatalog ?? new NativeBodyCatalog();
              try {
                adoptBodyTransaction(catalog.stageNew({ ref: { bodyId: operation.bodyId, sourceFeatureId: feature.id },
                  createdByFeatureId: feature.id, name: feature.name, lineage: nextLineage }, tool));
              } finally { if (emptyCatalog) catalog.dispose(); }
            } else {
              if (!bodyCatalog) throw new Error('Selecciona un cuerpo explícito al que añadir material.');
              adoptBodyTransaction(bodyCatalog.stageMerge(operation.target, tool, { sourceFeatureId: feature.id, lineage: nextLineage }));
            }
            sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
            rememberReferencedSource(beforeForRecord); continue;
          }
          if (body) {
            candidate = feature.merge ? body.fuse(tool) : makeCompound([body, tool]).asShape3D();
            validateSolid(candidate);
            if (feature.merge) requireSingleSolid(candidate, 'No se puede fusionar: el barrido o recubrimiento debe conectar con el sólido existente.');
            body.delete();
            body = candidate; candidate = null;
          } else { body = tool; tool = null; }
          currentVolume = measuredVolume(body);
          sourceFeatureId = feature.id;
          semantic = undefined;
          lineage = advanceLineage(lineage, structure);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (!('sketchId' in feature)) throw new Error('Tipo de operación no compatible.');
        if (bodyCatalog && (feature.type === 'cut' || feature.type === 'revolvedCut') && !feature.bodyScope?.length) throw new Error('Selecciona los cuerpos exactos sobre los que aplicar el corte.');
        if (bodyCatalog && (feature.type === 'extrude' || feature.type === 'revolve') && !feature.bodyOperation) {
          throw new Error('Elige crear un cuerpo nuevo o añadir material a un cuerpo seleccionado.');
        }
        solidFeatureIds.add(feature.id);
        const sketchFeature = sketches.get(feature.sketchId);
        if (!sketchFeature) throw new Error('No se encuentra un croquis anterior para esta operación.');
        if (sketchFeature.suppressed || unavailableFeatureIds.has(sketchFeature.id)) {
          if (bodyAware) throw new Error('El croquis del cuerpo seleccionado está suprimido o su soporte no está disponible.');
          result.warnings.push(`${feature.name}: omitida porque su croquis está suprimido o su soporte no está disponible.`);
          unavailableFeatureIds.add(feature.id);
          continue;
        }
        const revolutionExtent = isRevolutionFeature(feature) ? resolveRevolutionExtent(feature) : undefined;
        const axisField = isRevolutionFeature(feature) ? Object.getOwnPropertyDescriptor(feature, 'axis') : undefined;
        if (axisField && (!('value' in axisField) || !axisField.enumerable)) throw new Error('El eje de revolución no es un campo de datos válido.');
        const revolutionAxis = isRevolutionFeature(feature) ? resolveRevolutionAxis({
          ...(axisField ? { axis: axisField.value } : {}), reversed: revolutionExtent!.reversed,
        }, sketchFeature, sketchFrames.get(sketchFeature.id)!, revolutionSources) : undefined;
        // Resolve axes against the original solved sketch (including its
        // construction lines), then derive material without editing that sketch.
        const thinSection = thinWall ? prepareThinSection(sketchFeature, thinWall) : undefined;
        const materialProfile = thinSection?.sketch.profile ?? sketchFeature.profile;
        let limitLineage: unknown = null;
        let operationBase = body;
        if (bodyCatalog && (feature.type === 'extrude' || feature.type === 'revolve') && feature.bodyOperation?.mode === 'merge') {
          operationBase = bodyCatalog.resolve(feature.bodyOperation.target).shape;
        } else if (bodyCatalog && (feature.type === 'cut' || feature.type === 'revolvedCut') && feature.bodyScope?.length === 1) {
          operationBase = bodyCatalog.resolve(feature.bodyScope[0]).shape;
        }
        if (!isRevolutionFeature(feature) && feature.endCondition) {
          validateLength(feature.depth, 'Profundidad', true);
          if (feature.symmetric) throw new Error('La extrusión simétrica sólo está disponible con profundidad fija.');
          const end=feature.endCondition, frame=sketchFrames.get(sketchFeature.id)!, sign=Math.sign(feature.depth);
          const direction=frame.normal.map(value=>value*sign) as Vec3;
          const makePrism=(length:number,start=0) => featureSolid({...feature,endCondition:undefined,depth:sign*length,symmetric:false},
            {...sketchFeature,offset:sketchFeature.offset+sign*start}, offsetPlaneFrame(frame,sign*start),false,undefined,thinSection);
          if(end.kind==='throughAll'||end.kind==='untilNext') {
            const scopedBase = feature.type === 'cut' ? feature.bodyScope?.[0]
              : feature.bodyOperation?.mode === 'merge' ? feature.bodyOperation.target
                : feature.bodyOperation?.mode === 'new' ? end.baseBody : undefined;
            if (feature.type === 'extrude' && feature.bodyOperation?.mode === 'new') {
              if (!bodyCatalog || !end.baseBody) throw new Error('Selecciona el cuerpo límite de la nueva extrusión.');
              operationBase = bodyCatalog.resolve(end.baseBody).shape;
            } else if (end.baseBody !== undefined) throw new Error('El cuerpo límite explícito corresponde a una extrusión de cuerpo nuevo.');
            if(!solidFeatureIds.has(end.baseFeatureId)||end.baseFeatureId===feature.id) throw new Error('La condición final requiere una operación sólida anterior como base.');
            if(unavailableFeatureIds.has(end.baseFeatureId)) {
              if (bodyAware) throw new Error('El cuerpo seleccionado para la condición final está suprimido o no está disponible.');
              unavailableFeatureIds.add(feature.id);
              result.warnings.push(`${feature.name}: omitida porque la base de su condición final está suprimida o no está disponible.`);
              continue;
            }
            if(!body||(scopedBase ? scopedBase.sourceFeatureId !== end.baseFeatureId : sourceFeatureId!==end.baseFeatureId)) throw new Error('El cuerpo de la condición final ha cambiado. Recupera su operación base.');
            if (bodyCatalog && feature.type === 'cut' && feature.bodyScope && feature.bodyScope.length > 1) {
              if (end.kind === 'throughAll' && typeof end.bothDirections !== 'boolean') throw new Error('Selecciona si Por todo se aplica en uno o ambos sentidos.');
              const replacements = feature.bodyScope.map(ref => {
                const entry = bodyCatalog!.resolve(ref);
                const isolated = copyBodyShape(entry.shape); extraCandidates.push(isolated);
                if (end.kind === 'untilNext') requireSingleSolid(isolated, 'Hasta la siguiente requiere un sólido cerrado por cuerpo seleccionado.');
                const targetTool = end.kind === 'throughAll'
                  ? throughAllTool(isolated, frame.origin, direction, end.bothDirections, makePrism)
                  : untilNextTool(isolated, frame.origin, direction, makePrism, true);
                extraCandidates.push(targetTool); validateSolid(targetTool);
                const shape = bodyBoolean('subtract', entry.shape, targetTool);
                extraCandidates.push(shape);
                const previous = measuredVolume(entry.shape), volume = validateSolid(shape);
                if (previous - volume <= Math.max(1e-9, previous * 1e-10)) throw new Error('El corte no elimina material de cada cuerpo seleccionado.');
                return { ref, shape };
              });
              const nextLineage = advanceLineage(lineage, [feature.id, 'cut', feature.sketchId, sketchFeature.plane,
                sketchFeature.profile.kind, sketchFeature.profile.kind === 'entities' ? entityProfileStructure(sketchFeature.profile) : null,
                Math.sign(feature.depth), feature.bodyScope, end.kind, end.kind === 'throughAll' ? end.bothDirections : null,
                sketchSupportLineages.get(sketchFeature.id) ?? null,
                ...(thinSection ? [['thinWall', thinWall!.identity, thinSection.identity]] : [])]);
              adoptBodyTransaction(bodyCatalog.stageReplaceMany(replacements, { sourceFeatureId: feature.id, lineage: nextLineage }));
              sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
              rememberReferencedSource(beforeForRecord); continue;
            }
            if (bodyCatalog) { operationBase = copyBodyShape(operationBase!); extraCandidates.push(operationBase); }
            if(end.kind==='untilNext') requireSingleSolid(operationBase!,'Hasta la siguiente requiere un único cuerpo para identificar la superficie siguiente.');
            if(end.kind==='throughAll'&&typeof end.bothDirections!=='boolean') throw new Error('Selecciona si Por todo se aplica en uno o ambos sentidos.');
            tool=end.kind==='throughAll'?(feature.type==='cut'?throughAllTool:throughAllBossTool)(operationBase!,frame.origin,direction,end.bothDirections,makePrism)
              :untilNextTool(operationBase!,frame.origin,direction,makePrism,feature.type==='cut');
            limitLineage=[end.kind,end.baseFeatureId,end.kind==='throughAll'?end.bothDirections:null];
            if (end.baseBody) (limitLineage as unknown[]).push(['baseBody', end.baseBody]);
          } else if(end.kind==='upToSurface') {
            if(end.target.kind==='face') {
              const id=end.target.face.sourceFeatureId;
              if(!solidFeatureIds.has(id)||id===feature.id) throw new Error('La superficie límite debe pertenecer a una operación sólida anterior.');
              if(unavailableFeatureIds.has(id)) {
                if (bodyAware) throw new Error('La superficie límite del cuerpo seleccionado está suprimida o no está disponible.');
                unavailableFeatureIds.add(feature.id);
                result.warnings.push(`${feature.name}: omitida porque la superficie límite está suprimida o no está disponible.`);continue;
              }
              const catalog=historicalLimitFaces.get(id);
              if(!catalog) throw new Error('No se encuentra la superficie límite histórica. Recupera la selección.');
              const face=('semanticStatus' in catalog ? resolveSemanticSelectedFaces(catalog,[end.target.face],id)
                : resolveSelectedFaces(catalog,[end.target.face],id))[0];
              tool=upToSurfaceTool({face},frame.origin,direction,makePrism);
              limitLineage=['upToSurface','face',id,end.target.face.key,historicalFaces.get(id)!.lineage];
            } else {
              const support=resolveSupport(end.target);
              if (!support && bodyAware) throw new Error('El plano límite del cuerpo seleccionado está suprimido o no está disponible.');
              if(!support) {unavailableFeatureIds.add(feature.id);result.warnings.push(`${feature.name}: omitida porque el plano límite está suprimido o no está disponible.`);continue;}
              tool=upToSurfaceTool({frame:support.frame},frame.origin,direction,makePrism);
              limitLineage=['upToSurface',end.target.kind,support.lineage];
            }
          } else throw new Error('Condición final de extrusión no compatible.');
        } else if (!body && feature.type === 'extrude' && !feature.bodyOperation && sketchFeature.profile.kind === 'entities') {
          validateLength(feature.depth, 'Profundidad', true);
          const context = entityPrismContextFromFeatures(features, feature.id);
          if (context) {
            const startOffset = sketchFeature.offset - (feature.symmetric ? feature.depth / 2 : 0);
            const startFrame = sketchFeature.support ? offsetPlaneFrame(sketchFrames.get(sketchFeature.id)!,
              feature.symmetric ? -feature.depth / 2 : 0) : undefined;
            const owner = entityProfilePrismIfSingleRegion(sketchFeature.profile, sketchFeature.plane,
              startOffset, feature.depth, startFrame);
            if (owner) {
              prismOwners.push(owner);
              tool = owner.takeShape();
              const prepared = preparePrismReferencesV2(sketchFeature.profile, context, owner.provenance);
              if (prepared.status === 'verified') toolSemantic = prepared.references;
            } else tool = featureSolid(feature, sketchFeature, sketchFrames.get(sketchFeature.id)!, true, undefined, thinSection);
          } else tool = featureSolid(feature, sketchFeature, sketchFrames.get(sketchFeature.id)!, true, undefined, thinSection);
        } else tool = featureSolid(feature, sketchFeature, sketchFrames.get(sketchFeature.id)!, true, revolutionAxis, thinSection);
        if ((feature.type === 'cut' || feature.type === 'revolvedCut') && !body) throw new Error('Crea primero un sólido antes de aplicar un corte.');
        validateSolid(tool);
        const structure: unknown[] = [feature.id, feature.type, feature.sketchId, sketchFeature.plane, sketchFeature.profile.kind,
          isRevolutionFeature(feature) ? [revolutionAxis!.legacy ? 'local-Y' : revolutionAxis!.identity, materialProfile.kind === 'entities'
            ? entityRevolutionSide(materialProfile, revolutionAxis, !!thinWall?.definition.autoCorners?.enabled) : Math.sign(revolutionRadialCoordinate(materialProfile.center, revolutionAxis!)), revolutionExtent!.sweepAngle === 360]
            : [feature.symmetric, Math.sign(feature.depth)]];
        // Keep the legacy descriptor byte-identical for existing saved edge references.
        if (revolutionExtent?.identity) structure.push(revolutionExtent.identity);
        if (thinSection) structure.push(['thinWall', thinWall!.identity, thinSection.identity]);
        if (sketchFeature.profile.kind === 'entities') structure.push(entityProfileStructure(sketchFeature.profile));
        if (sketchFeature.support) structure.push(['support', sketchFeature.support.kind,
          sketchFeature.support.kind === 'plane' ? sketchFeature.support.planeId : sketchFeature.support.face.sourceFeatureId,
          sketchSupportLineages.get(sketchFeature.id)]);
        if (limitLineage) structure.push(['endCondition',limitLineage]);
        if ((feature.type === 'cut' || feature.type === 'revolvedCut') && feature.bodyScope) {
          if (!bodyCatalog) throw new Error('El corte seleccionado requiere un catálogo de cuerpos explícitos.');
          const nextLineage = advanceLineage(lineage, [...structure, ['bodyScope', feature.bodyScope]]);
          adoptBodyTransaction(bodyCatalog.stageScopedCut(feature.bodyScope, tool, { sourceFeatureId: feature.id, lineage: nextLineage }));
          sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(beforeForRecord); continue;
        }
        if ((feature.type === 'extrude' || feature.type === 'revolve') && feature.bodyOperation) {
          const operation = feature.bodyOperation;
          const nextLineage = advanceLineage(lineage, [...structure, ['bodyOperation', operation]]);
          if (operation.mode === 'new') {
            if (!bodyCatalog && legacySolidSeen) throw new Error('Los cuerpos explícitos deben comenzar antes de cualquier operación sólida antigua, incluso suprimida. Crea una pieza nueva.');
            if (body && !bodyCatalog) throw new Error('No se pueden asignar cuerpos individuales a un compuesto antiguo de forma implícita. Crea una pieza con cuerpos explícitos.');
            const emptyCatalog = bodyCatalog === null;
            const catalog = bodyCatalog ?? new NativeBodyCatalog();
            try {
              adoptBodyTransaction(catalog.stageNew({ ref: { bodyId: operation.bodyId, sourceFeatureId: feature.id },
                createdByFeatureId: feature.id, name: feature.name, lineage: nextLineage }, tool));
            } finally { if (emptyCatalog) catalog.dispose(); }
          } else {
            if (!bodyCatalog) throw new Error('Selecciona un cuerpo explícito al que añadir material.');
            const transaction = bodyCatalog.stageMerge(operation.target, tool, { sourceFeatureId: feature.id, lineage: nextLineage });
            try {
              if (feature.type === 'extrude' && feature.endCondition) {
                const previous = measuredVolume(bodyCatalog.resolve(operation.target).shape);
                const nextEntry = transaction.nextEntries.find(entry => entry.ref.bodyId === operation.target.bodyId)!;
                if (measuredVolume(nextEntry.shape) - previous <= Math.max(1e-9, previous * 1e-10)) {
                  throw new Error('El saliente con esta condición final no añade material al cuerpo seleccionado.');
                }
              }
            } catch (error) {
              try { transaction.dispose(); } catch (releaseError) { throw new BodyStateReleaseError([error, releaseError], 'Body merge validation and release failed.'); }
              throw error;
            }
            adoptBodyTransaction(transaction);
          }
          sourceFeatureId = feature.id; lineage = nextLineage; semantic = undefined;
          rememberReferencedSource(beforeForRecord); continue;
        }
        if (!body) {
          body = tool;
          tool = null;
          currentVolume = measuredVolume(body);
          sourceFeatureId = feature.id;
          semantic = toolSemantic;
          lineage = advanceLineage(lineage, structure);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        candidate = feature.type === 'cut' || feature.type === 'revolvedCut' ? body.cut(tool) : body.fuse(tool);
        const volume = validateSolid(candidate);
        if ((feature.type === 'cut' || feature.type === 'revolvedCut') && currentVolume - volume <= Math.max(1e-9, currentVolume * 1e-10)) {
          throw new Error(feature.type === 'revolvedCut' ? 'El corte no intersecta el sólido. Revisa el croquis, el eje y el ángulo.'
            : 'El corte no intersecta el sólido. Revisa el plano, el centro y la profundidad.');
        }
        if (feature.type === 'extrude' && feature.endCondition && volume-currentVolume<=Math.max(1e-9,currentVolume*1e-10)) {
          throw new Error('El saliente con esta condición final no añade material al sólido.');
        }
        body.delete();
        body = candidate;
        candidate = null;
        currentVolume = volume;
        sourceFeatureId = feature.id;
        semantic = undefined;
        lineage = advanceLineage(lineage, structure);
        rememberReferencedSource(beforeForRecord);
      } catch (error) {
        featureFailed = true; featureError = error;
        // Finalization after transfer cannot restore already retired geometry.
        if (error instanceof BodyStateReleaseError || error instanceof BodyStatePublicationError || error instanceof FeatureContributionReleaseError || isNativeCleanupFailure(error) || featureBodyCommitted) throw error;
        result.featureErrors.push({
          id: feature.id,
          message: error instanceof Error ? error.message : 'OpenCascade no pudo construir esta operación. Revisa sus parámetros.',
        });
        result.warnings.push(`Reconstrucción detenida en «${feature.name}». Se muestra el último sólido válido.`);
        break;
      } finally {
        const failures: unknown[] = [];
        for (const owned of [tool, candidate, beforeForRecord, ...extraCandidates.reverse()]) {
          try { owned?.delete(); } catch (error) { failures.push(error); }
        }
        if (failures.length) throw new AggregateError(featureFailed ? [featureError, ...failures] : failures,
          'Native feature reconstruction or release failed.');
      }
    } } catch (error) { reconstructionFailed = true; reconstructionError = error; throw error; }
    finally {
      sourceSketchSolveSession.revoke();
      const failures: unknown[] = [];
      const releases = [
        ...[...historicalDeltas.values()].map(record => () => record.delta?.dispose()),
        ...[...historicalOwnedDeltas.values()].map(record => () => record.delta?.dispose()),
        ...[...historicalRecipeStates.values()].map(record => () => record.shape?.delete()),
        ...[...historicalBodies.values()].map(record => () => record.body.delete()),
        ...[...historicalExactBodies.values()].map(record => () => record.shape.delete()),
        ...[...historicalLimitFaces.values()].map(catalog => () => catalog.dispose()),
      ];
      for (const release of releases) { try { release(); } catch (error) { failures.push(error); } }
      if (failures.length) throw new AggregateError(reconstructionFailed ? [reconstructionError, ...failures] : failures,
        'Historical native catalog reconstruction or release failed.');
    }

    this.shape = body;
    this.bodyCatalog = bodyCatalog;
    result.bodyCatalogActive = bodyCatalog !== null;
    const inventory = (value: AssemblyReferenceShapeInventory): AssemblyReferenceInventory => ({ ...value,
      featureErrors: result.featureErrors.map(error => ({ ...error })), warnings: [...result.warnings] });
    let references: AssemblyReferenceShapeInventory | undefined;
    if (bodyCatalog) {
      if (mode === 'assembly-references') {
        references = { kind: 'explicit', bodies: bodyCatalog.entries().map(entry => {
          const identity = JSON.stringify(entry.ref);
          const faces = this.retainCurrentFaceCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage, identity);
          const edges = this.retainCurrentEdgeCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage, identity);
          const points = this.retainCurrentVertexCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage, identity, faces.entries, edges.entries);
          return { ref: { ...entry.ref }, faces: faces.entries.map(value => ({ ...value.ref })), edges: edges.entries.map(value => ({ ...value.ref })),
            vertexRefs: points.entries.map(value => ({ ...value.ref })) };
        }) };
      } else result.bodies = bodyCatalog.entries().map(entry => {
        const mesh = entry.shape.mesh(MESH_OPTIONS), box = entry.shape.boundingBox;
        try {
          const [min, max] = box.bounds;
          const edges = this.retainCurrentEdgeCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage, JSON.stringify(entry.ref));
          const faces = this.retainCurrentFaceCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage, JSON.stringify(entry.ref));
          const points = this.retainCurrentVertexCatalog(entry.shape, entry.ref.sourceFeatureId, entry.lineage, JSON.stringify(entry.ref), faces.entries, edges.entries);
          return { ref: { ...entry.ref }, createdByFeatureId: entry.createdByFeatureId, name: entry.name,
            vertices: mesh.vertices, normals: mesh.normals, triangles: mesh.triangles,
            edgeLines: entry.shape.meshEdges(MESH_OPTIONS).lines,
            edges: pickableEdgesFromCatalog(edges),
            faces: pickableFacesFromCatalog(faces),
            vertexPoints: pickableVerticesFromCatalog(points),
            volume: measuredVolume(entry.shape), bounds: { min, max } };
        } finally { box.delete(); }
      });
    }
    this.hasErrors = result.featureErrors.length > 0;
    if (!body) return mode === 'render' ? result : inventory({ kind: 'empty' });
      this.finalState = { sourceFeatureId, lineage };
      // Semantic binding targets belong to prism producers that retire below.
      // This catalog owns fresh body-face wrappers and remains usable afterward.
      if (!bodyCatalog && semantic && !this.hasErrors) this.finalSemanticFaces = createSemanticFaceCatalog(body, sourceFeatureId, lineage, semantic);
      if (!bodyCatalog && semantic && !this.hasErrors) this.finalSemanticEdges = createSemanticEdgeCatalog(body, sourceFeatureId, lineage, semantic);
      const legacyPoints = !bodyCatalog ? withNativeOwners(owners => {
        const identity = JSON.stringify(['legacy', sourceFeatureId, lineage]);
        const faces = this.finalSemanticFaces ?? (semantic ? createSemanticFaceCatalog(body!, sourceFeatureId, lineage, semantic)
          : this.retainCurrentFaceCatalog(body!, sourceFeatureId, lineage, identity));
        if (semantic && !this.finalSemanticFaces) owners.own({ delete: () => faces.dispose() });
        const edges = this.finalSemanticEdges ?? (semantic ? createSemanticEdgeCatalog(body!, sourceFeatureId, lineage, semantic)
          : this.retainCurrentEdgeCatalog(body!, sourceFeatureId, lineage, identity));
        if (semantic && !this.finalSemanticEdges) owners.own({ delete: () => edges.dispose() });
        return this.retainCurrentVertexCatalog(body!, sourceFeatureId, lineage, identity, faces.entries, edges.entries);
      }, undefined, 'Legacy vertex incidence construction or temporary catalog release failed.') : null;
      if (mode === 'assembly-references') {
        if (!bodyCatalog) {
          if (this.finalSemanticFaces && this.finalSemanticEdges) {
            references = { kind: 'legacy', faces: this.finalSemanticFaces.entries.map(value => ({ ...value.ref })),
              edges: this.finalSemanticEdges.entries.map(value => ({ ...value.ref })), vertexRefs: legacyPoints!.entries.map(value => ({ ...value.ref })) };
          } else if (semantic) {
            // Failed later features still report the same last valid semantic
            // picking as render build, without enabling native inspection.
            references = withNativeOwners(owners => {
              const faces = createSemanticFaceCatalog(body!, sourceFeatureId, lineage, semantic);
              owners.own({ delete: () => faces.dispose() });
              const edges = createSemanticEdgeCatalog(body!, sourceFeatureId, lineage, semantic);
              owners.own({ delete: () => edges.dispose() });
              return { kind: 'legacy' as const, faces: faces.entries.map(value => ({ ...value.ref })), edges: edges.entries.map(value => ({ ...value.ref })),
                vertexRefs: legacyPoints!.entries.map(value => ({ ...value.ref })) };
            }, undefined, 'Assembly reference inventory or temporary catalog release failed.');
          } else {
            const identity = JSON.stringify(['legacy', sourceFeatureId, lineage]);
            const faces = this.retainCurrentFaceCatalog(body, sourceFeatureId, lineage, identity);
            const edges = this.retainCurrentEdgeCatalog(body, sourceFeatureId, lineage, identity);
            references = { kind: 'legacy', faces: faces.entries.map(value => ({ ...value.ref })), edges: edges.entries.map(value => ({ ...value.ref })),
              vertexRefs: legacyPoints!.entries.map(value => ({ ...value.ref })) };
          }
        }
      } else {
      const mesh = body.mesh(MESH_OPTIONS);
      result.vertices = mesh.vertices;
      result.normals = mesh.normals;
      result.triangles = mesh.triangles;
      result.edgeLines = body.meshEdges(MESH_OPTIONS).lines;
      if (legacyPoints) result.vertexPoints = pickableVerticesFromCatalog(legacyPoints);
      result.edges = this.finalSemanticEdges ? pickableEdgesFromCatalog(this.finalSemanticEdges)
        : semantic ? pickableSemanticEdges(body, sourceFeatureId, lineage, semantic)
          : bodyCatalog ? pickableEdges(body, sourceFeatureId, lineage)
            : pickableEdgesFromCatalog(this.retainCurrentEdgeCatalog(body, sourceFeatureId, lineage,
              JSON.stringify(['legacy', sourceFeatureId, lineage])));
      result.faces = this.finalSemanticFaces ? pickableFacesFromCatalog(this.finalSemanticFaces)
        : semantic ? pickableSemanticFaces(body, sourceFeatureId, lineage, semantic)
          : bodyCatalog ? pickableFaces(body, sourceFeatureId, lineage)
            : pickableFacesFromCatalog(this.retainCurrentFaceCatalog(body, sourceFeatureId, lineage,
              JSON.stringify(['legacy', sourceFeatureId, lineage])));
      result.volume = currentVolume;
      const box = body.boundingBox;
      try {
        const [min, max] = box.bounds;
        result.bounds = { min, max };
      } finally {
        box.delete();
      }
      }
      const solids = ownedNativeTopology(body, 'solid');
      if (solids.length > 1) result.warnings.push(`La pieza contiene ${solids.length} sólidos separados.`);
      solids.forEach((solid) => solid.delete());
      if (mode === 'render') return result;
      if (!references) throw new Error('La reconstrucción nativa no publicó su inventario de referencias.');
      return inventory(references);
    }, () => {
      const failedBody = body;
      const failedCatalog = bodyCatalog;
      const failedFaces = this.finalSemanticFaces;
      const failedEdges = this.finalSemanticEdges;
      const failedCurrentFaces = [...this.currentFaceCatalogs.values()]; this.currentFaceCatalogs.clear();
      const failedCurrentEdges = [...this.currentEdgeCatalogs.values()]; this.currentEdgeCatalogs.clear();
      const failedCurrentVertices = [...this.currentVertexCatalogs.values()]; this.currentVertexCatalogs.clear();
      this.finalSemanticFaces = null;
      this.finalSemanticEdges = null;
      this.finalState = null;
      this.inspectionReady = false;
      body = null;
      bodyCatalog = null;
      this.shape = null;
      this.bodyCatalog = null;
      this.hasErrors = false;
      const failures: unknown[] = [];
      for (const vertices of failedCurrentVertices.reverse()) { try { vertices.dispose(); } catch (error) { failures.push(error); } }
      try { failedFaces?.dispose(); } catch (error) { failures.push(error); }
      try { failedEdges?.dispose(); } catch (error) { failures.push(error); }
      for (const faces of failedCurrentFaces.reverse()) { try { faces.dispose(); } catch (error) { failures.push(error); } }
      for (const edges of failedCurrentEdges.reverse()) { try { edges.dispose(); } catch (error) { failures.push(error); } }
      try { failedBody?.delete(); } catch (error) { failures.push(error); }
      try { failedCatalog?.dispose(); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'Failed body state release failed.');
    });
    // Seal only after producer cleanup completes; failure paths cannot inspect
    // a partly published shape or retain stale analytic reference authority.
    this.inspectionReady = !this.hasErrors;
    return built;
  }

  export(format: CadExportFormat, features?: Feature[]): Blob {
    if (features) {
      // Export a committed snapshot atomically, independent of an outstanding preview.
      // A temporary engine also preserves the visible preview in this engine.
      const snapshot = new CadEngine();
      try {
        snapshot.build(features);
        return snapshot.export(format);
      } finally {
        snapshot.dispose();
      }
    }
    if (this.hasErrors) throw new Error('Corrige las operaciones con errores antes de exportar la pieza.');
    if (!this.shape) throw new Error('No hay ningún sólido para exportar.');
    if (format === 'step') return this.shape.blobSTEP();
    if (format === 'stl') return this.shape.blobSTL({ tolerance: 0.01, angularTolerance: 0.08, binary: true });
    throw new Error('Formato de exportación desconocido.');
  }
}
