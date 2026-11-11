import { getOC, measureShapeSurfaceProperties, type Face, type Shape3D } from 'replicad';
import type { FaceReference, PickableFace, PlaneFrame, Vec3 } from './kernel.types';
import { clonePlaneFrame, planarFaceFrame } from './kernel.frames';
import { namingDigest } from './kernel.naming';
import { withNativeOwners } from './kernel.native-ownership';
import { ownedNativeTopology } from './kernel.native-topology';
import { faceViewAxis } from './kernel.view-axis';

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

/** Preserve the SDK's two sampling maps without its GC-only native temporaries. */
function ownedPlanarCatalogFrame(face: Face): PlaneFrame {
  return withNativeOwners(owners => {
    const oc = getOC(), raw = face.wrapped;
    const normalBounds = oc.BRepTools.UVBounds(raw, 0, 0, 0, 0);
    const normalPoint = owners.own(new oc.gp_Pnt()), normal = owners.own(new oc.gp_Vec()),
      normalQuery = owners.own(new oc.BRepGProp_Face(raw, false));
    normalQuery.Normal(.5 * (normalBounds.UMin + normalBounds.UMax),
      .5 * (normalBounds.VMin + normalBounds.VMax), normalPoint, normal);
    const outward: Vec3 = [normal.X(), normal.Y(), normal.Z()];
    const pointBounds = oc.BRepTools.UVBounds(raw, 0, 0, 0, 0);
    const surface = owners.own(new oc.BRepAdaptor_Surface(raw, false)), point = owners.own(new oc.gp_Pnt());
    surface.D0(.5 * (pointBounds.UMax - pointBounds.UMin) + pointBounds.UMin,
      .5 * (pointBounds.VMax - pointBounds.VMin) + pointBounds.VMin, point);
    return planarFaceFrame([point.X(), point.Y(), point.Z()], outward);
  }, undefined, 'Native face frame query or release failed.');
}

/** No enumeration indices or native hashes persist. Rebinding requires one exact key. */
export function createFaceCatalog(shape: Shape3D, sourceFeatureId: string, lineage = ''): FaceCatalog {
  return withNativeOwners(owners => {
    // Enumeration transfers every returned wrapper. Adopt the complete array
    // before a later enumeration or descriptor query can fail; shape stays borrowed.
    const faces = ownedNativeTopology(shape, 'face'); owners.ownAll(faces);
    const allEdges = ownedNativeTopology(shape, 'edge'); owners.ownAll(allEdges);
    const solids = ownedNativeTopology(shape, 'solid'); owners.ownAll(solids);
    const box = owners.own(shape.boundingBox);
    const [minimum, maximum] = box.bounds;
    const spans = maximum.map((value, axis) => value - minimum[axis]);
    const normalize = (point: Vec3) => point.map((value, axis) => round((value - minimum[axis]) / (spans[axis] || 1)));
    const faceTypes = faces.map(face => withNativeOwners(typeOwners => typeOwners.own(face.surface).surfaceType,
      undefined, 'Native face type query or release failed.'));
    const topology = [faces.length, allEdges.length, solids.length,
      histogram(faceTypes), histogram(allEdges.map((edge) => withNativeOwners(curveOwners => {
        // Edge convenience getters allocate hidden adaptors with GC-only lifetimes.
        const curve = curveOwners.own(edge.curve);
        return curve.curveType;
      }, undefined, 'Native face topology edge query or release failed.')))];
    const entries = faces.map((face, index) => withNativeOwners(faceOwners => {
      const faceBox = faceOwners.own(face.boundingBox);
      const properties = faceOwners.own(measureShapeSurfaceProperties(face));
      const edges = ownedNativeTopology(face, 'edge'); faceOwners.ownAll(edges);
      const wires = ownedNativeTopology(face, 'wire'); faceOwners.ownAll(wires);
      let frame: PlaneFrame | null = null;
      if (faceTypes[index] === 'PLANE') {
        frame = ownedPlanarCatalogFrame(face);
      }
      const boundary = edges.map((edge) => withNativeOwners(edgeOwners => {
        const edgeBox = edgeOwners.own(edge.boundingBox);
        const curve = edgeOwners.own(edge.curve), curveType = curve.curveType, closed = curve.isClosed;
        const parameters = closed ? [0, .125, .25, .375, .5, .625, .75, .875]
          : curveType === 'LINE' ? [0, .5, 1] : [0, .25, .5, .75, 1];
        const samples = parameters.map((parameter) => withNativeOwners(pointOwners => {
          // Keep the exact upstream parameter map without its hidden gp_Pnt/XYZ clones.
          const first = curve.wrapped.FirstParameter();
          const point = pointOwners.own(curve.wrapped.Value(first + (curve.wrapped.LastParameter() - first) * parameter));
          return normalize([point.X(), point.Y(), point.Z()]);
        }, undefined, 'Native face edge sample query or release failed.'));
        return [curveType, closed, edgeBox.bounds.map(normalize), sorted(samples)];
      }, undefined, 'Native face boundary query or release failed.'));
      // Own the actual gp_Pnt instead of deferring its release through centerOfMass.
      const center = faceOwners.own(properties.wrapped.CentreOfMass());
      const centerCoordinates: Vec3 = [center.X(), center.Y(), center.Z()];
      const descriptor = [lineage, topology, faceTypes[index], frame?.normal.map(round) ?? null, frame?.xDirection.map(round) ?? null,
        faceBox.bounds.map(normalize), normalize(centerCoordinates), wires.length, sorted(boundary)];
      return { face, frame, ref: { sourceFeatureId, key: 'face-v1|' + namingDigest(JSON.stringify(descriptor)) } };
    }, undefined, 'Native face descriptor query or release failed.'));
    let disposed = false;
    return { entries, dispose: () => {
      if (disposed) return;
      disposed = true;
      withNativeOwners(disposeOwners => { disposeOwners.ownAll(faces); }, undefined, 'Native face catalog release failed.');
    } };
  }, catalog => catalog.entries.map(entry => entry.face), 'Native face catalog construction or release failed.');
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

/** Borrow an owned current catalog; metadata never aliases its native identities or frames. */
export function pickableFacesFromCatalog(catalog: {
  readonly entries: readonly { face: Face; frame: PlaneFrame | null; ref: FaceReference; aliases?: readonly FaceReference[] }[];
}): PickableFace[] {
  return catalog.entries.map(({ face, frame, ref, aliases }) => {
    const mesh = face.mesh({ tolerance: .05, angularTolerance: .12 });
    const viewAxis = frame ? null : faceViewAxis(face);
    return { ref: { ...ref }, ...(aliases ? { aliases: aliases.map(alias => ({ ...alias })) } : {}),
      frame: frame ? clonePlaneFrame(frame) : null, ...(viewAxis ? { viewAxis } : {}), vertices: mesh.vertices, triangles: mesh.triangles };
  });
}

export function pickableFaces(shape: Shape3D, sourceFeatureId: string, lineage = ''): PickableFace[] {
  return withNativeOwners(owners => {
    const catalog = createFaceCatalog(shape, sourceFeatureId, lineage);
    owners.own({ delete: () => catalog.dispose() });
    return pickableFacesFromCatalog(catalog);
  }, undefined, 'Native pickable faces query or release failed.');
}
