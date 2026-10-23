import { getOC, type Edge, type Shape3D } from 'replicad';
import type { EdgeReference, PickableEdge, Vec3 } from './kernel.types';
import { ownedNativeTopology } from './kernel.native-topology';
import { withNativeOwners } from './kernel.native-ownership';

interface EdgeEntry {
  edge: Edge;
  ref: EdgeReference;
}

export interface EdgeCatalog {
  entries: EdgeEntry[];
  dispose: () => void;
}

const PRECISION = 1e8;
const KEY_PREFIX = 'edge-v1|';
const round = (value: number): number => Math.round(value * PRECISION) / PRECISION || 0;
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function boundsOf(shape: Shape3D | Edge): [Vec3, Vec3] {
  return withNativeOwners(owners => owners.own(shape.boundingBox).bounds, undefined, 'Native edge bounds query or release failed.');
}

function histogram(items: string[]): [string, number][] {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
  return [...counts].sort(([a], [b]) => compareText(a, b));
}

/**
 * Conservative geometric naming, not a general solution to CAD topological naming.
 *
 * Keys include structural feature lineage, topology counts/types, the edge curve type, normalized exact
 * bounds/sample points and adjacent face types/bounds/planar normals. Each axis
 * is normalized to the whole body's B-rep bounds. Thus ordinary prism width,
 * height and depth edits retain their corner/edge names. The lineage additionally
 * guards against changing a generating plane/direction on a symmetric body whose
 * final geometry alone would be indistinguishable. Native hash codes are
 * only used as temporary lookup accelerators; they never enter the saved key.
 *
 * Rebinding requires exactly one identical key. We never choose a nearest edge,
 * an enumeration index or a hash from another rebuild. A changed topology,
 * moved relative feature, differently parameterized curved edge, or duplicate
 * geometric descriptor may require the user to select again. The 1e-8 normalized
 * quantization absorbs numerical noise, not deliberate topology changes.
 */
export function createEdgeCatalog(shape: Shape3D, sourceFeatureId: string, lineage = ''): EdgeCatalog {
  return withNativeOwners(owners => {
    const edges = ownedNativeTopology(shape, 'edge'); owners.ownAll(edges);
    const faces = ownedNativeTopology(shape, 'face'); owners.ownAll(faces);
    const solids = ownedNativeTopology(shape, 'solid'); owners.ownAll(solids);
    const [minimum, maximum] = boundsOf(shape);
    const spans = maximum.map((value, index) => value - minimum[index]);
    const normalize = (point: Vec3): number[] => point.map((value, index) =>
      round((value - minimum[index]) / (spans[index] || 1)));
    const normalizedBounds = (bounds: [Vec3, Vec3]) => bounds.map(normalize);
    const faceTypes = faces.map(face => withNativeOwners(faceOwners => faceOwners.own(face.surface).surfaceType,
      undefined, 'Native edge face type query or release failed.'));
    const curveTypes = edges.map(edge => withNativeOwners(curveOwners => curveOwners.own(edge.curve).curveType,
      undefined, 'Native edge type query or release failed.'));
    const topology = [edges.length, faces.length, solids.length, histogram(curveTypes), histogram(faceTypes)];
    const adjacency = new Map<Edge, string[]>();
    const edgeBuckets = new Map<number, Edge[]>();
    for (const edge of edges) {
      adjacency.set(edge, []);
      const hash = edge.hashCode;
      edgeBuckets.set(hash, [...(edgeBuckets.get(hash) ?? []), edge]);
    }
    for (const [index, face] of faces.entries()) withNativeOwners(faceOwners => {
      const bounds = faceOwners.own(face.boundingBox).bounds;
      let normal: number[] | null = null;
      if (faceTypes[index] === 'PLANE') {
        const oc = getOC(), uv = face.UVBounds, point = faceOwners.own(new oc.gp_Pnt()), vector = faceOwners.own(new oc.gp_Vec());
        faceOwners.own(new oc.BRepGProp_Face(face.wrapped, false)).Normal((uv.uMin + uv.uMax) * .5, (uv.vMin + uv.vMax) * .5, point, vector);
        normal = [vector.X(), vector.Y(), vector.Z()].map(round);
      }
      const faceKey = JSON.stringify([faceTypes[index], normalizedBounds(bounds), normal]);
      const faceEdges = ownedNativeTopology(face, 'edge'); faceOwners.ownAll(faceEdges);
      const added = new Set<Edge>();
      for (const faceEdge of faceEdges) {
        for (const edge of edgeBuckets.get(faceEdge.hashCode) ?? []) {
          if (!added.has(edge) && edge.isSame(faceEdge)) {
            adjacency.get(edge)!.push(faceKey);
            added.add(edge);
          }
        }
      }
    }, undefined, 'Native edge adjacency query or release failed.');
    const entries = edges.map((edge, index): EdgeEntry => withNativeOwners(edgeOwners => {
      const curve = edgeOwners.own(edge.curve), closed = curve.isClosed;
      const parameters = closed
        ? [0, .125, .25, .375, .5, .625, .75, .875]
        : curveTypes[index] === 'LINE' ? [0, .5, 1] : [0, .25, .5, .75, 1];
      // Sorting makes keys insensitive to the traversal direction of an edge.
      const samples = parameters.map(parameter => withNativeOwners(pointOwners => {
        const first = curve.wrapped.FirstParameter(), point = pointOwners.own(curve.wrapped.Value(first + (curve.wrapped.LastParameter() - first) * parameter));
        return normalize([point.X(), point.Y(), point.Z()]);
      }, undefined, 'Native edge sample query or release failed.')).sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));
      const descriptor = [lineage, topology, curveTypes[index], closed, normalizedBounds(boundsOf(edge)), samples, adjacency.get(edge)!.sort()];
      return { edge, ref: { sourceFeatureId, key: KEY_PREFIX + JSON.stringify(descriptor) } };
    }, undefined, 'Native edge descriptor query or release failed.'));
    let disposed = false;
    return { entries, dispose: () => {
      if (disposed) return;
      disposed = true;
      withNativeOwners(releases => { releases.ownAll(edges); }, undefined, 'Native edge catalog release failed.');
    } };
  }, catalog => catalog.entries.map(entry => entry.edge), 'Native edge catalog construction or release failed.');
}

export function resolveEdgeReferences(catalog: EdgeCatalog, references: EdgeReference[], sourceFeatureId: string): Edge[] {
  if (!references.length) throw new Error('Selecciona al menos una arista para esta operación.');
  const used = new Set<string>();
  return references.map((reference) => {
    if (reference.sourceFeatureId !== sourceFeatureId || !reference.key.startsWith(KEY_PREFIX)) {
      throw new Error('La referencia pertenece a otro sólido. Recupera la selección de aristas.');
    }
    if (used.has(reference.key)) throw new Error('La selección contiene una arista duplicada.');
    used.add(reference.key);
    const matches = catalog.entries.filter((entry) => entry.ref.key === reference.key);
    if (!matches.length) throw new Error('La topología ha cambiado y una arista ya no se puede identificar. Recupera la selección de aristas.');
    if (matches.length > 1) throw new Error('La referencia de arista es ambigua. Recupera la selección de aristas.');
    return matches[0].edge;
  });
}

/** Borrow a current owned catalog; only detached references and native mesh data escape. */
export function pickableEdgesFromCatalog(catalog: {
  readonly entries: readonly { edge: Edge; ref: EdgeReference; aliases?: readonly EdgeReference[] }[];
}): PickableEdge[] {
  return catalog.entries.map(({ edge, ref, aliases }) => ({
    ref: { ...ref },
    ...(aliases ? { aliases: aliases.map(alias => ({ ...alias })) } : {}),
    lines: edge.meshEdges({ tolerance: .05, angularTolerance: .12 }).lines,
  }));
}

export function pickableEdges(shape: Shape3D, sourceFeatureId: string, lineage = ''): PickableEdge[] {
  return withNativeOwners(owners => {
    const catalog = createEdgeCatalog(shape, sourceFeatureId, lineage);
    owners.own({ delete: () => catalog.dispose() });
    return pickableEdgesFromCatalog(catalog);
  }, undefined, 'Native edge mesh or catalog release failed.');
}
