import {
  getOC,
  makeCompound,
  measureShapeVolumeProperties,
  sketchCircle,
  sketchRectangle,
  Plane as ReplicadPlane,
  type Shape3D,
  type Sketch,
} from 'replicad';
import type {
  CadExportFormat,
  CadResult,
  Feature,
  EdgeFinishFeature,
  ExtrudeFeature,
  Plane,
  PlaneFrame,
  PlaneSupport,
  SketchFeature,
  RevolveFeature,
  Vec3,
} from './kernel.types';
import { createEdgeCatalog, pickableEdges, resolveEdgeReferences } from './kernel.edges';
import { advanceLineage } from './kernel.naming';
import { entityProfileSolid, entityProfileStructure, entityRevolutionSide, solveEntityProfile } from './kernel.profiles';
import { sketchVisual } from './kernel.sketch-visual';
import { createFaceCatalog, pickableFaces, resolveFaceReference, resolveSelectedFaces, type FaceCatalog, type FaceDescriptor } from './kernel.faces';
import { clonePlaneFrame, framePoint, frameYDirection, offsetPlaneFrame, principalPlaneFrame } from './kernel.frames';
import { loftSolid, sweepSolid } from './kernel.sweep-loft';
import { geometryDelta, isRepetition, patternPlan, repetitionSolid, type FeatureGeometry } from './kernel.patterns';
import { draftSolid, shellSolid } from './kernel.face-operations';
import { throughAllBossTool, throughAllTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';
import { holePositionStructure, holeSolid } from './kernel.holes';

const MESH_OPTIONS = { tolerance: 0.05, angularTolerance: 0.12 };
const MIN_LENGTH = 0.01;
const MAX_LENGTH = 100_000;

/** Matching Replicad's right-handed named sketch planes. */
function onPlane(plane: Plane, u: number, v: number, offset: number): Vec3 {
  if (plane === 'XY') return [u, v, offset];
  if (plane === 'XZ') return [u, -offset, v];
  return [offset, u, v];
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
  const { profile, plane } = feature;
  if (profile.kind === 'entities') throw new Error('El croquis multientidad requiere construir sus contornos.');
  if (frame) {
    const nativePlane = new ReplicadPlane(framePoint(frame, profile.center[0], profile.center[1]), frame.xDirection, frame.normal);
    try {
      return profile.kind === 'rectangle' ? sketchRectangle(profile.width, profile.height, { plane: nativePlane })
        : sketchCircle(profile.radius, { plane: nativePlane });
    } finally { nativePlane.delete(); }
  }
  const origin = onPlane(plane, profile.center[0], profile.center[1], offset);
  const config = { plane, origin };
  return profile.kind === 'rectangle'
    ? sketchRectangle(profile.width, profile.height, config)
    : sketchCircle(profile.radius, config);
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
  const solids = shape.solids;
  try { if (solids.length !== 1) throw new Error(message); }
  finally { solids.forEach((solid) => solid.delete()); }
}

function featureSolid(feature: ExtrudeFeature | RevolveFeature, sketchFeature: SketchFeature, resolvedFrame: PlaneFrame, validateDepth = true): Shape3D {
  const frame = sketchFeature.support ? resolvedFrame : undefined;
  if (feature.type === 'revolve') {
    if (!Number.isFinite(feature.angle) || feature.angle <= 0 || feature.angle > 360) {
      throw new Error('El ángulo de revolución debe ser mayor que 0° y como máximo 360°.');
    }
    const { profile } = sketchFeature;
    if (profile.kind === 'entities') {
      return entityProfileSolid(profile, sketchFeature.plane, sketchFeature.offset, { type: 'revolve', angle: feature.angle }, frame);
    }
    const halfWidth = profile.kind === 'rectangle' ? profile.width / 2 : profile.radius;
    if (Math.abs(profile.center[0]) < halfWidth - 1e-7) {
      throw new Error('El perfil de revolución cruza el eje Y del croquis. Desplaza su centro hacia un lado del eje.');
    }
    // A circle tangent to the axis creates a singular point; require a torus profile.
    if (profile.kind === 'circle' && Math.abs(profile.center[0]) <= halfWidth + 1e-7) {
      throw new Error('El círculo de revolución debe estar separado del eje Y del croquis.');
    }
    const sketch = makeSketch(sketchFeature, sketchFeature.offset, frame);
    try {
      const axis: Vec3 = frame ? frameYDirection(frame) : sketchFeature.plane === 'XY' ? [0, 1, 0] : [0, 0, 1];
      return sketch.revolve(axis, {
        origin: frame?.origin ?? onPlane(sketchFeature.plane, 0, 0, sketchFeature.offset),
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
  if (sketchFeature.profile.kind === 'entities') {
    return entityProfileSolid(sketchFeature.profile, sketchFeature.plane, startOffset, { type: 'extrude', depth: feature.depth }, startFrame);
  }
  const sketch = makeSketch(sketchFeature, startOffset, startFrame);
  try {
    return sketch.extrude(feature.depth);
  } finally {
    sketch.delete();
  }
}

function finishEdges(body: Shape3D, feature: EdgeFinishFeature, lineage: string): Shape3D {
  validateLength(feature.size, feature.type === 'fillet' ? 'Radio' : 'Distancia');
  const operation = feature.type === 'fillet' ? 'redondeo' : 'chaflán';
  if (feature.selection.mode === 'all') {
    try { return body[feature.type](feature.size); }
    catch { throw new Error(`No se puede construir el ${operation} con este tamaño. Reduce el valor o cambia las aristas.`); }
  }
  const catalog = createEdgeCatalog(body, feature.baseFeatureId, lineage);
  try {
    const edges = resolveEdgeReferences(catalog, feature.selection.edges, feature.baseFeatureId);
    try {
      // The finder owns its input edges; clone them so the catalog keeps its own lifetime.
      return body[feature.type](feature.size, (finder) => finder.inList(edges.map((edge) => edge.clone())));
    } catch {
      throw new Error(`No se puede construir el ${operation} en las aristas seleccionadas. Reduce el tamaño o recupera la selección.`);
    }
  } finally {
    catalog.dispose();
  }
}

function emptyResult(): CadResult {
  return {
    vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], faces: [], planes: [], sketches: [], holes: [], volume: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] }, warnings: [], featureErrors: [],
  };
}

/** Owns the native shape; rendering data never retains pointers into the WASM heap. */
export class CadEngine {
  private shape: Shape3D | null = null;
  private hasErrors = false;

  dispose(): void {
    this.shape?.delete();
    this.shape = null;
    this.hasErrors = false;
  }

  build(features: Feature[]): CadResult {
    this.dispose();
    const accurateMeasurements=features.some(feature=>!feature.suppressed&&(feature.type==='hole'||((feature.type==='extrude'||feature.type==='cut')&&!!feature.endCondition)));
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
    const solidFeatureIds = new Set<string>();
    const unavailableFeatureIds = new Set<string>();
    let body: Shape3D | null = null;
    let currentVolume = 0;
    let sourceFeatureId = '';
    let lineage = '';
    const repetitions = features.filter(isRepetition).filter((feature) => !feature.suppressed);
    const wantedDeltas = new Set(repetitions.flatMap((feature) => feature.source.mode === 'features' ? feature.source.featureIds : []));
    const wantedBodies = new Set(repetitions.flatMap((feature) => feature.source.mode === 'body' ? [feature.source.sourceFeatureId] : []));
    const historicalDeltas = new Map<string, FeatureGeometry>();
    const historicalBodies = new Map<string, { body: Shape3D; lineage: string }>();
    const wantedLimitFaces = new Set(features.flatMap(feature => !feature.suppressed && (feature.type==='extrude'||feature.type==='cut')
      && feature.endCondition?.kind==='upToSurface' && feature.endCondition.target.kind==='face'
      ? [feature.endCondition.target.face.sourceFeatureId] : []));
    const historicalLimitFaces = new Map<string, FaceCatalog>();
    const referencedSources = new Set([...wantedLimitFaces, ...features.flatMap((feature) =>
      !feature.suppressed && 'support' in feature && feature.support?.kind === 'face'
        ? [feature.support.face.sourceFeatureId] : [])]);
    const historicalFaces = new Map<string, { entries: FaceDescriptor[]; lineage: string }>();
    const rememberReferencedSource = (before: Shape3D | null) => {
      if (!body) return;
      if (wantedBodies.has(sourceFeatureId)) historicalBodies.set(sourceFeatureId, { body: body.clone(), lineage });
      if (wantedDeltas.has(sourceFeatureId)) {
        const record: FeatureGeometry = { id: sourceFeatureId, order: seenIds.size, lineage };
        try { record.delta = geometryDelta(before, body, validateSolid); }
        catch (error) { record.error = error instanceof Error ? error.message : 'OpenCascade no pudo aislar la aportación geométrica.'; }
        historicalDeltas.set(sourceFeatureId, record);
      }
      if (!referencedSources.has(sourceFeatureId)) return;
      const catalog = createFaceCatalog(body, sourceFeatureId, lineage);
      try {
        historicalFaces.set(sourceFeatureId, { lineage, entries: catalog.entries.map(({ ref, frame }) => ({
          ref: { ...ref }, frame: frame ? clonePlaneFrame(frame) : null,
        })) });
        if (wantedLimitFaces.has(sourceFeatureId)) historicalLimitFaces.set(sourceFeatureId, catalog);
      } finally { if (!wantedLimitFaces.has(sourceFeatureId)) catalog.dispose(); }
    };
    const resolveSupport = (support: PlaneSupport): { frame: PlaneFrame; lineage: string } | null => {
      if (support.kind === 'principal') return { frame: principalPlaneFrame(support.plane),
        lineage: advanceLineage('', ['principal', support.plane]) };
      if (support.kind === 'plane') {
        if (!planeFeatureIds.has(support.planeId)) throw new Error('No se encuentra un plano de referencia anterior para este soporte.');
        if (unavailableFeatureIds.has(support.planeId)) return null;
        const plane = planes.get(support.planeId);
        if (!plane) throw new Error('El plano de soporte no está disponible o no es anterior a esta operación.');
        return { frame: clonePlaneFrame(plane.frame), lineage: plane.lineage };
      }
      if (!solidFeatureIds.has(support.face.sourceFeatureId)) {
        throw new Error('La cara de soporte debe pertenecer a una operación sólida anterior. Recupera la selección de la cara.');
      }
      if (unavailableFeatureIds.has(support.face.sourceFeatureId)) return null;
      const source = historicalFaces.get(support.face.sourceFeatureId);
      if (!source) throw new Error('No se encuentra la geometría de la operación que contiene la cara de soporte. Recupera la selección de la cara.');
      return { frame: resolveFaceReference(source, support.face, support.face.sourceFeatureId),
        lineage: advanceLineage(source.lineage, ['face', support.face.sourceFeatureId, support.face.key]) };
    };

    try { for (const feature of features) {
      let tool: Shape3D | null = null;
      let candidate: Shape3D | null = null;
      let beforeForRecord: Shape3D | null = null;
      try {
        if (seenIds.has(feature.id)) throw new Error('El identificador de esta operación está duplicado.');
        seenIds.add(feature.id);
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
        if (feature.suppressed) {
          solidFeatureIds.add(feature.id);
          unavailableFeatureIds.add(feature.id);
          continue;
        }
        if (wantedDeltas.has(feature.id)) beforeForRecord = body?.clone() ?? null;
        if(feature.type==='hole'){
          if(!solidFeatureIds.has(feature.baseFeatureId))throw new Error('No se encuentra la operación base anterior de los taladros.');
          solidFeatureIds.add(feature.id);
          if(unavailableFeatureIds.has(feature.baseFeatureId)){
            unavailableFeatureIds.add(feature.id);result.warnings.push(`${feature.name}: omitida porque su base está suprimida o no está disponible.`);continue;
          }
          if(!body||sourceFeatureId!==feature.baseFeatureId)throw new Error('El cuerpo anterior ha cambiado. Recupera la base del asistente para taladro.');
          const support=resolveSupport(feature.support);
          if(!support){unavailableFeatureIds.add(feature.id);result.warnings.push(`${feature.name}: omitida porque su soporte está suprimido o no está disponible.`);continue;}
          // The editor still needs the historical plane when an empty/invalid position list prevents a solid.
          result.holes!.push({id:feature.id,frame:clonePlaneFrame(support.frame)});
          candidate=holeSolid(body,feature,support.frame,validateSolid);
          currentVolume=validateSolid(candidate);body.delete();body=candidate;candidate=null;sourceFeatureId=feature.id;
          lineage=advanceLineage(lineage,[feature.id,'hole',feature.baseFeatureId,support.lineage,feature.reversed,
            holePositionStructure(feature.positions),feature.head.kind,feature.endCondition.kind,
            feature.endCondition.kind==='blind'?[feature.endCondition.depthReference,feature.endCondition.tip.kind]:null]);
          rememberReferencedSource(beforeForRecord);continue;
        }
        if (isRepetition(feature)) {
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
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su operación base está suprimida o no está disponible.`);
            continue;
          }
          if (!body || sourceFeatureId !== feature.baseFeatureId) throw new Error('El sólido anterior ha cambiado. Recupera la selección de caras sobre la base actual.');
          const support = feature.type === 'draft' ? resolveSupport(feature.support) : null;
          if (feature.type === 'draft' && !support) {
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su plano neutro está suprimido o no está disponible.`);
            continue;
          }
          candidate = feature.type === 'shell' ? shellSolid(body, feature, lineage, validateSolid)
            : draftSolid(body, feature, support!.frame, lineage, validateSolid);
          const volume = validateSolid(candidate);
          body.delete(); body = candidate; candidate = null;
          currentVolume = volume; sourceFeatureId = feature.id;
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
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque su operación base está suprimida o no está disponible.`);
            continue;
          }
          if (!body || sourceFeatureId !== feature.baseFeatureId) {
            throw new Error('El sólido anterior ha cambiado. Recupera la selección de aristas sobre la operación base actual.');
          }
          candidate = finishEdges(body, feature, lineage);
          const volume = validateSolid(candidate);
          body.delete();
          body = candidate;
          candidate = null;
          currentVolume = volume;
          sourceFeatureId = feature.id;
          lineage = advanceLineage(lineage, [feature.id, feature.type, feature.baseFeatureId, feature.selection.mode,
            feature.selection.mode === 'selected' ? feature.selection.edges.map((reference) => reference.key).sort() : null]);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (feature.type === 'sweep' || feature.type === 'loft') {
          solidFeatureIds.add(feature.id);
          const ids = feature.type === 'sweep' ? [feature.profileSketchId, feature.pathSketchId]
            : feature.sections.map((section) => section.sketchId);
          const inputs = ids.map((id) => {
            const sketch = sketches.get(id);
            if (!sketch) throw new Error('No se encuentra uno de los croquis anteriores de esta operación.');
            return sketch;
          });
          if (inputs.some((sketch) => unavailableFeatureIds.has(sketch.id))) {
            unavailableFeatureIds.add(feature.id);
            result.warnings.push(`${feature.name}: omitida porque uno de sus croquis o soportes está suprimido.`);
            continue;
          }
          if (typeof feature.merge !== 'boolean' || (feature.type === 'loft' && typeof feature.ruled !== 'boolean')) {
            throw new Error('Las opciones de fusión o recubrimiento no son válidas.');
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
          if (body) {
            candidate = feature.merge ? body.fuse(tool) : makeCompound([body, tool]).asShape3D();
            validateSolid(candidate);
            if (feature.merge) requireSingleSolid(candidate, 'No se puede fusionar: el barrido o recubrimiento debe conectar con el sólido existente.');
            body.delete();
            body = candidate; candidate = null;
          } else { body = tool; tool = null; }
          currentVolume = measuredVolume(body);
          sourceFeatureId = feature.id;
          lineage = advanceLineage(lineage, structure);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        if (!('sketchId' in feature)) throw new Error('Tipo de operación no compatible.');
        solidFeatureIds.add(feature.id);
        const sketchFeature = sketches.get(feature.sketchId);
        if (!sketchFeature) throw new Error('No se encuentra un croquis anterior para esta operación.');
        if (sketchFeature.suppressed || unavailableFeatureIds.has(sketchFeature.id)) {
          result.warnings.push(`${feature.name}: omitida porque su croquis está suprimido o su soporte no está disponible.`);
          unavailableFeatureIds.add(feature.id);
          continue;
        }
        let limitLineage: unknown = null;
        if (feature.type !== 'revolve' && feature.endCondition) {
          validateLength(feature.depth, 'Profundidad', true);
          if (feature.symmetric) throw new Error('La extrusión simétrica sólo está disponible con profundidad fija.');
          const end=feature.endCondition, frame=sketchFrames.get(sketchFeature.id)!, sign=Math.sign(feature.depth);
          const direction=frame.normal.map(value=>value*sign) as Vec3;
          const makePrism=(length:number,start=0) => featureSolid({...feature,endCondition:undefined,depth:sign*length,symmetric:false},
            {...sketchFeature,offset:sketchFeature.offset+sign*start}, offsetPlaneFrame(frame,sign*start),false);
          if(end.kind==='throughAll'||end.kind==='untilNext') {
            if(!solidFeatureIds.has(end.baseFeatureId)||end.baseFeatureId===feature.id) throw new Error('La condición final requiere una operación sólida anterior como base.');
            if(unavailableFeatureIds.has(end.baseFeatureId)) {
              unavailableFeatureIds.add(feature.id);
              result.warnings.push(`${feature.name}: omitida porque la base de su condición final está suprimida o no está disponible.`);
              continue;
            }
            if(!body||sourceFeatureId!==end.baseFeatureId) throw new Error('El cuerpo de la condición final ha cambiado. Recupera su operación base.');
            if(end.kind==='untilNext') requireSingleSolid(body,'Hasta la siguiente requiere un único cuerpo para identificar la superficie siguiente.');
            if(end.kind==='throughAll'&&typeof end.bothDirections!=='boolean') throw new Error('Selecciona si Por todo se aplica en uno o ambos sentidos.');
            tool=end.kind==='throughAll'?(feature.type==='cut'?throughAllTool:throughAllBossTool)(body,frame.origin,direction,end.bothDirections,makePrism)
              :untilNextTool(body,frame.origin,direction,makePrism,feature.type==='cut');
            limitLineage=[end.kind,end.baseFeatureId,end.kind==='throughAll'?end.bothDirections:null];
          } else if(end.kind==='upToSurface') {
            if(end.target.kind==='face') {
              const id=end.target.face.sourceFeatureId;
              if(!solidFeatureIds.has(id)||id===feature.id) throw new Error('La superficie límite debe pertenecer a una operación sólida anterior.');
              if(unavailableFeatureIds.has(id)) {
                unavailableFeatureIds.add(feature.id);
                result.warnings.push(`${feature.name}: omitida porque la superficie límite está suprimida o no está disponible.`);continue;
              }
              const catalog=historicalLimitFaces.get(id);
              if(!catalog) throw new Error('No se encuentra la superficie límite histórica. Recupera la selección.');
              const face=resolveSelectedFaces(catalog,[end.target.face],id)[0];
              tool=upToSurfaceTool({face},frame.origin,direction,makePrism);
              limitLineage=['upToSurface','face',id,end.target.face.key,historicalFaces.get(id)!.lineage];
            } else {
              const support=resolveSupport(end.target);
              if(!support) {unavailableFeatureIds.add(feature.id);result.warnings.push(`${feature.name}: omitida porque el plano límite está suprimido o no está disponible.`);continue;}
              tool=upToSurfaceTool({frame:support.frame},frame.origin,direction,makePrism);
              limitLineage=['upToSurface',end.target.kind,support.lineage];
            }
          } else throw new Error('Condición final de extrusión no compatible.');
        } else tool = featureSolid(feature, sketchFeature, sketchFrames.get(sketchFeature.id)!);
        if (feature.type === 'cut' && !body) throw new Error('Crea primero un sólido antes de aplicar un corte.');
        validateSolid(tool);
        const structure: unknown[] = [feature.id, feature.type, feature.sketchId, sketchFeature.plane, sketchFeature.profile.kind,
          feature.type === 'revolve' ? ['local-Y', sketchFeature.profile.kind === 'entities'
            ? entityRevolutionSide(sketchFeature.profile) : Math.sign(sketchFeature.profile.center[0]), feature.angle === 360]
            : [feature.symmetric, Math.sign(feature.depth)]];
        // Keep the legacy descriptor byte-identical for existing saved edge references.
        if (sketchFeature.profile.kind === 'entities') structure.push(entityProfileStructure(sketchFeature.profile));
        if (sketchFeature.support) structure.push(['support', sketchFeature.support.kind,
          sketchFeature.support.kind === 'plane' ? sketchFeature.support.planeId : sketchFeature.support.face.sourceFeatureId,
          sketchSupportLineages.get(sketchFeature.id)]);
        if (limitLineage) structure.push(['endCondition',limitLineage]);
        if (!body) {
          body = tool;
          tool = null;
          currentVolume = measuredVolume(body);
          sourceFeatureId = feature.id;
          lineage = advanceLineage(lineage, structure);
          rememberReferencedSource(beforeForRecord);
          continue;
        }
        candidate = feature.type === 'cut' ? body.cut(tool) : body.fuse(tool);
        const volume = validateSolid(candidate);
        if (feature.type === 'cut' && currentVolume - volume <= Math.max(1e-9, currentVolume * 1e-10)) {
          throw new Error('El corte no intersecta el sólido. Revisa el plano, el centro y la profundidad.');
        }
        if (feature.type === 'extrude' && feature.endCondition && volume-currentVolume<=Math.max(1e-9,currentVolume*1e-10)) {
          throw new Error('El saliente con esta condición final no añade material al sólido.');
        }
        body.delete();
        body = candidate;
        candidate = null;
        currentVolume = volume;
        sourceFeatureId = feature.id;
        lineage = advanceLineage(lineage, structure);
        rememberReferencedSource(beforeForRecord);
      } catch (error) {
        result.featureErrors.push({
          id: feature.id,
          message: error instanceof Error ? error.message : 'OpenCascade no pudo construir esta operación. Revisa sus parámetros.',
        });
        result.warnings.push(`Reconstrucción detenida en «${feature.name}». Se muestra el último sólido válido.`);
        break;
      } finally {
        tool?.delete();
        candidate?.delete();
        beforeForRecord?.delete();
      }
    } } finally {
      historicalDeltas.forEach((record) => record.delta?.dispose());
      historicalBodies.forEach((record) => record.body.delete());
      historicalLimitFaces.forEach(catalog=>catalog.dispose());
    }

    this.shape = body;
    this.hasErrors = result.featureErrors.length > 0;
    if (!body) return result;
    try {
      const mesh = body.mesh(MESH_OPTIONS);
      result.vertices = mesh.vertices;
      result.normals = mesh.normals;
      result.triangles = mesh.triangles;
      result.edgeLines = body.meshEdges(MESH_OPTIONS).lines;
      result.edges = pickableEdges(body, sourceFeatureId, lineage);
      result.faces = pickableFaces(body, sourceFeatureId, lineage);
      result.volume = currentVolume;
      const box = body.boundingBox;
      try {
        const [min, max] = box.bounds;
        result.bounds = { min, max };
      } finally {
        box.delete();
      }
      const solids = body.solids;
      if (solids.length > 1) result.warnings.push(`La pieza contiene ${solids.length} sólidos separados.`);
      solids.forEach((solid) => solid.delete());
      return result;
    } catch (error) {
      this.dispose();
      throw error;
    }
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
