import { measureShapeSurfaceProperties, type Face, type Shape3D } from 'replicad';
import type { FaceReference, PickableFace, PlaneFrame, Vec3 } from './kernel.types';
import { clonePlaneFrame, planarFaceFrame } from './kernel.frames';
import { namingDigest } from './kernel.naming';

export interface FaceDescriptor { ref: FaceReference; frame: PlaneFrame | null }
export interface FaceCatalog {
  entries: (FaceDescriptor & { face: Face })[];
  dispose: () => void;
}
const round = (value: number): number => Math.round(value * 1e8) / 1e8 || 0;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = (items: unknown[]) => items.map((item) => JSON.stringify(item)).sort(compareText);
function histogram(types: string[]): [string, number][] {
  const counts = new Map<string, number>();
  types.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1));
  return [...counts].sort(([a], [b]) => compareText(a, b));
}

/** No enumeration indices or native hashes persist. Rebinding requires one exact key. */
export function createFaceCatalog(shape: Shape3D, sourceFeatureId: string, lineage = ''): FaceCatalog {
  const faces = shape.faces, allEdges = shape.edges, solids = shape.solids;
  const box = shape.boundingBox;
  try {
    const [minimum, maximum] = box.bounds;
    const spans = maximum.map((value, axis) => value - minimum[axis]);
    const normalize = (point: Vec3) => point.map((value, axis) => round((value - minimum[axis]) / (spans[axis] || 1)));
    const topology = [faces.length, allEdges.length, solids.length,
      histogram(faces.map((face) => face.geomType)), histogram(allEdges.map((edge) => edge.geomType))];
    const entries = faces.map((face) => {
      const faceBox = face.boundingBox;
      const properties = measureShapeSurfaceProperties(face);
      const edges = face.edges, wires = face.wires;
      try {
        let frame: PlaneFrame | null = null;
        if (face.geomType === 'PLANE') {
          const normal = face.normalAt(), point = face.pointOnSurface(.5, .5);
          try { frame = planarFaceFrame(point.toTuple(), normal.toTuple()); }
          finally { normal.delete(); point.delete(); }
        }
        const boundary = edges.map((edge) => {
          const edgeBox = edge.boundingBox;
          try {
            const parameters = edge.isClosed ? [0, .125, .25, .375, .5, .625, .75, .875]
              : edge.geomType === 'LINE' ? [0, .5, 1] : [0, .25, .5, .75, 1];
            const samples = parameters.map((parameter) => {
              const point = edge.pointAt(parameter);
              try { return normalize(point.toTuple()); } finally { point.delete(); }
            });
            return [edge.geomType, edge.isClosed, edgeBox.bounds.map(normalize), sorted(samples)];
          } finally { edgeBox.delete(); }
        });
        const descriptor = [lineage, topology, face.geomType, frame?.normal.map(round) ?? null, frame?.xDirection.map(round) ?? null,
          faceBox.bounds.map(normalize), normalize(properties.centerOfMass), wires.length, sorted(boundary)];
        return { face, frame, ref: { sourceFeatureId, key: 'face-v1|' + namingDigest(JSON.stringify(descriptor)) } };
      } finally {
        faceBox.delete(); properties.delete(); edges.forEach((edge) => edge.delete()); wires.forEach((wire) => wire.delete());
      }
    });
    return { entries, dispose: () => faces.forEach((face) => face.delete()) };
  } catch (error) {
    faces.forEach((face) => face.delete());
    throw error;
  } finally {
    box.delete(); allEdges.forEach((edge) => edge.delete()); solids.forEach((solid) => solid.delete());
  }
}

/** Historical catalogs may contain only copied keys/frames, never live native objects. */
export function resolveFaceReference(catalog: { entries: FaceDescriptor[] }, reference: FaceReference, sourceFeatureId: string): PlaneFrame {
  if (reference.sourceFeatureId !== sourceFeatureId || !reference.key.startsWith('face-v1|')) {
    throw new Error('La referencia de cara pertenece a otro sólido. Recupera la selección de la cara de soporte.');
  }
  const matches = catalog.entries.filter((entry) => entry.ref.key === reference.key);
  if (!matches.length) throw new Error('La cara de soporte ya no se puede identificar tras el cambio de topología. Recupera la selección de la cara.');
  if (matches.length > 1) throw new Error('La referencia de cara es ambigua. Recupera la selección de la cara de soporte.');
  const frame = matches[0].frame;
  if (!frame) throw new Error('La cara seleccionada es curva. Selecciona una cara plana para apoyar el croquis o el plano.');
  return clonePlaneFrame(frame);
}

/** Resolves actual selected faces, including curved faces; the catalog retains ownership. */
export function resolveSelectedFaces(catalog: FaceCatalog, references: FaceReference[], sourceFeatureId: string): Face[] {
  if (references.length > 256) throw new Error('Selecciona como máximo 256 caras.');
  const used = new Set<string>();
  return references.map((reference) => {
    if (reference.sourceFeatureId !== sourceFeatureId || !reference.key.startsWith('face-v1|')) {
      throw new Error('Una cara pertenece a otro sólido. Recupera la selección de caras.');
    }
    if (used.has(reference.key)) throw new Error('La selección contiene una cara duplicada.');
    used.add(reference.key);
    const matches = catalog.entries.filter((entry) => entry.ref.key === reference.key);
    if (!matches.length) throw new Error('Una cara ya no se puede identificar tras el cambio de geometría. Recupera la selección de caras.');
    if (matches.length > 1) throw new Error('Una referencia de cara es ambigua. Recupera la selección de caras.');
    return matches[0].face;
  });
}

export function pickableFaces(shape: Shape3D, sourceFeatureId: string, lineage = ''): PickableFace[] {
  const catalog = createFaceCatalog(shape, sourceFeatureId, lineage);
  try {
    return catalog.entries.map(({ face, frame, ref }) => {
      const mesh = face.mesh({ tolerance: .05, angularTolerance: .12 });
      return { ref, frame, vertices: mesh.vertices, triangles: mesh.triangles };
    });
  } finally { catalog.dispose(); }
}
