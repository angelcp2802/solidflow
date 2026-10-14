import { cast, Face, getOC, measureShapeSurfaceProperties, type Shape3D } from 'replicad';
import { withNativeOwners } from './kernel.native-ownership';
import type { PlaneFrame, Vec3 } from './kernel.types';

const TOLERANCE = 1e-6;
type MakePrism = (length: number, start?: number) => Shape3D;
const dot = (a: number[], b: number[]) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);

/** Takes ownership of raw; cast creates another wrapper and does not consume it. */
function ownedSolid(raw: Parameters<typeof cast>[0], message: string): Shape3D {
  return withNativeOwners(owners => {
    owners.own(raw);
    if (raw.IsNull()) throw new Error(message);
    const shape = owners.own(cast(raw));
    try { return shape.asShape3D(); }
    catch (error) { throw new Error(message, { cause: error }); }
  }, shape => [shape], message);
}
function ownedFace(raw: Parameters<typeof cast>[0]): Face {
  return withNativeOwners(owners => {
    owners.own(raw);
    if (raw.IsNull()) throw new Error('La superficie límite no contiene geometría.');
    const shape = owners.own(cast(raw));
    if (!(shape instanceof Face)) throw new Error('La superficie límite no es una cara nativa.');
    return shape;
  }, face => [face], 'Falló la conversión o liberación de la cara límite.');
}
function volume(shape: Shape3D): number {
  return withNativeOwners(owners => {
    const oc = getOC(), properties = owners.own(new oc.GProp_GProps());
    oc.BRepGProp.VolumeProperties(shape.wrapped, properties, 1e-10, false, false);
    return properties.Mass();
  });
}
function extent(shape: Shape3D | Face, origin: Vec3, direction: Vec3): [number, number] {
  return withNativeOwners<[number, number]>(owners => {
    const box = owners.own(shape.boundingBox), [a, b] = box.bounds, projections: number[] = [];
    for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) {
      projections.push(dot([x - origin[0], y - origin[1], z - origin[2]], direction));
    }
    return [Math.min(...projections), Math.max(...projections)];
  });
}
function capArea(shape: Shape3D, origin: Vec3, direction: Vec3, distance: number): number {
  return withNativeOwners(owners => {
    const faces = shape.faces; owners.ownAll(faces);
    return faces.reduce((sum, face) => {
      if (face.geomType !== 'PLANE') return sum;
      return withNativeOwners(samples => {
        const normal = samples.own(face.normalAt()), point = samples.own(face.pointOnSurface(.5, .5));
        if (Math.abs(Math.abs(dot(normal.toTuple(), direction)) - 1) > 1e-8) return sum;
        const position = dot(point.toTuple().map((value, axis) => value - origin[axis]), direction);
        if (Math.abs(position - distance) > TOLERANCE * 10) return sum;
        const properties = samples.own(measureShapeSurfaceProperties(face));
        return sum + properties.area;
      });
    }, 0);
  });
}

/** Bounds only enclose the cutting tool; the resulting boundary is the exact body B-rep. */
export function throughAllTool(body: Shape3D, origin: Vec3, direction: Vec3, bothDirections: boolean, makePrism: MakePrism): Shape3D {
  const [minimum, maximum] = extent(body, origin, direction);
  const margin = Math.max(1, (maximum - minimum) * .01);
  const start = bothDirections ? Math.min(0, minimum - margin) : 0;
  const end = Math.max(0, maximum) + margin;
  if (!bothDirections && maximum < TOLERANCE) throw new Error('No hay material en el sentido de extrusión elegido. Invierte la dirección.');
  return makePrism(end - start, start);
}

/** Same geometric selection: retain the full initial cap and lose the artificial final cap. */
function splitAtFace(prism: Shape3D, target: Face, origin: Vec3, direction: Vec3, length: number, materialSense?: number, farthest = false): Shape3D | null {
  return withNativeOwners(owners => {
    const oc = getOC(), argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()),
      tools = owners.own(new oc.NCollection_List_TopoDS_Shape()), builder = owners.own(new oc.BRepAlgoAPI_Splitter());
    owners.own(argumentsList.Append(prism.wrapped)); owners.own(tools.Append(target.wrapped));
    builder.SetArguments(argumentsList); builder.SetTools(tools);
    builder.SetNonDestructive(true);
    if (!builder.NonDestructive()) throw new Error('No se puede proteger la geometría original al dividir la extrusión.');
    builder.Build();
    if (!builder.IsDone()) throw new Error('No se puede dividir la extrusión con esta superficie.');
    const result = owners.own(ownedSolid(builder.Shape(), 'No se puede dividir la extrusión con esta superficie.'));
    const solids = result.solids; owners.ownAll(solids);
    const solidFaces = solids.map(solid => { const faces = solid.faces; owners.ownAll(faces); return faces; });
    const initialArea = capArea(prism, origin, direction, 0), chosen = new Set<number>();
    for (const [index, solid] of solids.entries()) {
      const area = capArea(solid, origin, direction, 0);
      if (area <= TOLERANCE * TOLERANCE) continue;
      chosen.add(index);
    }
    if (farthest) {
      chosen.clear();
      solids.forEach((solid, index) => { if (capArea(solid, origin, direction, length) <= TOLERANCE * TOLERANCE) chosen.add(index); });
    }
    if (materialSense) for (let pass = 0; pass < solids.length; pass++) {
      let added = false;
      for (const index of [...chosen]) for (const face of solidFaces[index]) for (let other = 0; other < solids.length; other++) {
        if (chosen.has(other) || !solidFaces[other].some(neighbor => neighbor.isSame(face))) continue;
        const signs = [.25, .5, .75].map(parameter => withNativeOwners(samples => {
          const point = samples.own(face.pointOnSurface(parameter, .5)), normal = samples.own(target.normalAt(point));
          return dot(normal.toTuple(), direction) * materialSense;
        }));
        if (signs.some(sign => sign > TOLERANCE) && signs.some(sign => sign < -TOLERANCE)) {
          throw new Error('La superficie siguiente cambia de sentido sobre el perfil. Selecciona una cara límite explícita.');
        }
        if (signs.every(sign => sign <= TOLERANCE)) { if (farthest) return null; chosen.add(other); added = true; }
      }
      if (!added) break;
    }
    let retainedArea = 0;
    const selected: Shape3D[] = [];
    for (const index of chosen) {
      if (capArea(solids[index], origin, direction, length) > TOLERANCE * TOLERANCE) return null;
      retainedArea += capArea(solids[index], origin, direction, 0);
      selected.push(owners.own(solids[index].clone()));
    }
    if (!selected.length || Math.abs(retainedArea - initialArea) > Math.max(1e-7, initialArea * 1e-8)) return null;
    let united = owners.own(selected[0].clone());
    for (const next of selected.slice(1)) {
      const fused = owners.own(united.fuse(next)); // Register replacement BEFORE old release can fail.
      owners.release(united); united = fused;
    }
    return owners.own(united.clone()); // Retain ownership until all other release succeeds.
  }, result => result ? [result] : [], 'Falló la división o liberación de la extrusión.');
}

function planeFace(frame: PlaneFrame): Face {
  return withNativeOwners(owners => {
    const oc = getOC(), origin = owners.own(new oc.gp_Pnt(...frame.origin)), normal = owners.own(new oc.gp_Dir(...frame.normal)),
      plane = owners.own(new oc.gp_Pln(origin, normal)), builder = owners.own(new oc.BRepBuilderAPI_MakeFace(plane));
    return owners.own(ownedFace(builder.Face()));
  }, face => [face], 'Falló la construcción o liberación del plano límite.');
}

/** A planar target extends analytically; a curved target retains its selected face's trim and branch. */
export function upToSurfaceTool(target: { frame: PlaneFrame } | { face: Face }, origin: Vec3, direction: Vec3, makePrism: MakePrism): Shape3D {
  return withNativeOwners(owners => {
    let face: Face;
    if ('frame' in target) face = owners.own(planeFace(target.frame));
    else if (target.face.geomType === 'PLANE') {
      face = owners.own(withNativeOwners(construct => {
        const surface = construct.own(getOC().BRep_Tool.Surface(target.face.wrapped)),
          builder = construct.own(new (getOC().BRepBuilderAPI_MakeFace)(surface, TOLERANCE));
        return construct.own(ownedFace(builder.Face()));
      }, result => [result], 'Falló la construcción o liberación de la superficie límite.'));
    } else face = owners.own(target.face.clone());
    const probe = owners.own(makePrism(1));
    const length = withNativeOwners(samples => {
      if (face.geomType === 'PLANE') {
        const n = samples.own(face.normalAt()), point = samples.own(face.pointOnSurface(.5, .5));
        const normal = n.toTuple(), divisor = dot(normal, direction);
        if (Math.abs(divisor) < 1e-10) throw new Error('La superficie límite es paralela a la dirección de extrusión.');
        const [minimum, maximum] = extent(probe, point.toTuple(), normal), distances = [-minimum / divisor, -maximum / divisor];
        const value = Math.max(...distances) + 2;
        if (value <= TOLERANCE) throw new Error('La superficie límite está detrás del croquis. Invierte la dirección.');
        return value;
      }
      const [minimum, maximum] = extent(face, origin, direction);
      return Math.max(1, maximum) + Math.max(1, (maximum - minimum) * .05);
    });
    if (!Number.isFinite(length) || length > 10_000_000) throw new Error('La superficie límite queda demasiado lejos en esta dirección.');
    const prism = owners.own(makePrism(length)), result = splitAtFace(prism, face, origin, direction, length);
    if (!result) throw new Error('La superficie límite no cierra todo el perfil en el sentido elegido. Revisa el contorno, la cara o la dirección.');
    return owners.own(result);
  }, result => [result], 'Falló la extrusión Hasta superficie o su liberación.');
}

/** Typed ordinary geometry outcome; never use it to classify native/cleanup failure as a miss. */
export class NextBoundaryUnavailableError extends Error {
  constructor(readonly reason: 'NO_FORWARD_EXTENT' | 'NO_COMPLETE_FACE' | 'INCOMPATIBLE_FACES', message: string) {
    super(message);
    this.name = 'NextBoundaryUnavailableError';
  }
}

/** Candidate is an actual trimmed face closing all contours; no average-depth ranking. */
export function untilNextTool(body: Shape3D, origin: Vec3, direction: Vec3, makePrism: MakePrism, cutting: boolean): Shape3D {
  return withNativeOwners(owners => {
    const [, maximum] = extent(body, origin, direction);
    if (maximum <= TOLERANCE) throw new NextBoundaryUnavailableError('NO_FORWARD_EXTENT', 'No hay una superficie siguiente en el sentido elegido.');
    const length = maximum + Math.max(1, Math.abs(maximum) * .01), prism = owners.own(makePrism(length)), faces = body.faces;
    owners.ownAll(faces);
    const candidates: Shape3D[] = [];
    for (const face of faces) {
      const [minimum, maximumFace] = extent(face, origin, direction);
      if (maximumFace <= TOLERANCE || minimum >= length - TOLERANCE) continue;
      const candidate = splitAtFace(prism, face, origin, direction, length, cutting ? 1 : -1);
      if (candidate) candidates.push(owners.own(candidate));
    }
    if (!candidates.length) throw new NextBoundaryUnavailableError('NO_COMPLETE_FACE', 'Ninguna superficie siguiente del cuerpo intercepta todo el perfil.');
    candidates.sort((a, b) => volume(a) - volume(b));
    const nearest = candidates[0], tolerance = Math.max(1e-7, volume(nearest) * 1e-8);
    for (const candidate of candidates.slice(1)) withNativeOwners(check => {
      const outside = check.own(nearest.cut(candidate));
      if (Math.abs(volume(outside)) > tolerance) throw new NextBoundaryUnavailableError('INCOMPATIBLE_FACES', 'Hay superficies siguientes incompatibles sobre el perfil. Selecciona una cara límite explícita.');
    });
    return owners.own(nearest.clone());
  }, result => [result], 'Falló la extrusión Hasta siguiente o su liberación.');
}

/** Additive ThroughAll ends at actual exits; enclosing margins never become a boss boundary. */
export function throughAllBossTool(body: Shape3D, origin: Vec3, direction: Vec3, bothDirections: boolean, makePrism: MakePrism): Shape3D {
  const oneDirection = (axis: Vec3, make: MakePrism): Shape3D | null => withNativeOwners(owners => {
    const [, maximum] = extent(body, origin, axis);
    if (maximum <= TOLERANCE) return null;
    const length = maximum + Math.max(1, maximum * .01), prism = owners.own(make(length)), faces = body.faces;
    owners.ownAll(faces);
    const candidates: Shape3D[] = [];
    for (const face of faces) {
      if (extent(face, origin, axis)[1] <= TOLERANCE) continue;
      const candidate = splitAtFace(prism, face, origin, axis, length, 1, true);
      if (candidate) candidates.push(owners.own(candidate));
    }
    if (!candidates.length) throw new Error('Por todo no encuentra una superficie de salida que cierre todo el perfil del saliente.');
    candidates.sort((a, b) => volume(b) - volume(a));
    const farthest = candidates[0], tolerance = Math.max(1e-7, volume(farthest) * 1e-8);
    withNativeOwners(check => {
      const occupied = check.own(body.intersect(prism)), beyond = check.own(occupied.cut(farthest));
      if (Math.abs(volume(beyond)) > tolerance) throw new Error('La salida Por todo tiene varios límites parciales. Selecciona una superficie límite explícita.');
    });
    return owners.own(farthest.clone());
  }, result => result ? [result] : [], 'Falló el límite de salida Por todo o su liberación.');
  return withNativeOwners(owners => {
    const forward = oneDirection(direction, makePrism);
    if (forward) owners.own(forward);
    const backward = bothDirections ? oneDirection(direction.map(value => -value) as Vec3,
      (length, start = 0) => makePrism(length, -start - length)) : null;
    if (backward) owners.own(backward);
    if (forward && backward) return owners.own(forward.fuse(backward));
    if (forward || backward) return owners.own((forward ?? backward)!.clone());
    throw new Error('No hay material que limite el saliente Por todo en el sentido elegido.');
  }, result => [result], 'Falló la extrusión Por todo o su liberación.');
}
