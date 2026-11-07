import { cast, getOC, type AnyShape, type Edge, type Face, type Vertex, type Wire } from 'replicad';
import type { Vec3 } from './kernel.types';
import { withNativeOwners } from './kernel.native-ownership';
import { extractAssemblyFaceSupport, extractAssemblyVertexSupport } from './kernel.assembly-supports';

interface ProfileBase {
  center: Vec3;
  normal: Vec3;
  nativeToleranceMm: number;
  /** First-order input/arithmetic estimates, not a certified metrology bound. */
  uncertainty: { positionErrorMm: number; normalErrorRad: number };
}
export type AssemblyNativeProfileSupport = ProfileBase & (
  | { kind: 'rectangle'; corners: [Vec3, Vec3, Vec3, Vec3]; boundaryAxes: [Vec3, Vec3]; lengthsMm: [number, number] }
  | { kind: 'circle'; radiusMm: number; radiusErrorMm: number }
);
export interface AssemblyNativeRectangleAxisSupport {
  profile: Extract<AssemblyNativeProfileSupport, { kind: 'rectangle' }>;
  xDirection: Vec3;
  xDirectionErrorRad: number;
  edgeLengthMm: number;
  sense: 1 | -1;
}
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
const dot = (a: Vec3, b: Vec3): number => a.reduce((s, v, i) => s + v * b[i], 0);
const norm = (a: Vec3): number => Math.hypot(...a);
function check(value: boolean, message: string): asserts value { if (!value) throw new Error(message); }
/** Bound both occurrences and unique topology before publishing wrappers. */
function topology<K extends 'wire' | 'edge' | 'vertex'>(shape: AnyShape, kind: K, maximum: number): { wire: Wire; edge: Edge; vertex: Vertex }[K][] {
  return withNativeOwners(owners => {
    const oc = getOC(), types = { wire: oc.TopAbs_ShapeEnum.TopAbs_WIRE, edge: oc.TopAbs_ShapeEnum.TopAbs_EDGE, vertex: oc.TopAbs_ShapeEnum.TopAbs_VERTEX };
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, types[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    const result: { wire: Wire; edge: Edge; vertex: Vertex }[K][] = []; let count = 0;
    while (explorer.More()) {
      const raw = owners.own(explorer.Current());
      check(++count <= maximum, 'Unsupported profile topology budget.');
      if (!result.some(value => value.wrapped.IsSame(raw))) result.push(owners.own(cast(raw)) as { wire: Wire; edge: Edge; vertex: Vertex }[K]);
      explorer.Next();
    }
    return result;
  }, result => result, 'Profile topology enumeration or release failed.');
}

/** Borrowed exact face -> detached bounded-profile measurement in mm.
 * No reference identity, currentness, roll correspondence or mate authority.
 * Rectangle axes follow an observed boundary traversal, not a semantic ordering.
 */
export function extractAssemblyProfileSupport(face: Face,
  options: { lengthToleranceMm?: number; angleToleranceRad?: number } = {}): AssemblyNativeProfileSupport {
  const lengthBand = options.lengthToleranceMm ?? 1e-6, angleBand = options.angleToleranceRad ?? 1e-8;
  check(Number.isFinite(lengthBand) && lengthBand > 0 && Number.isFinite(angleBand) && angleBand > 0 && angleBand < Math.PI, 'Invalid profile measurement bands.');
  return withNativeOwners(owners => {
    const oc = getOC(), plane = extractAssemblyFaceSupport(face);
    check(plane.kind === 'plane', 'Profile requires a planar face.');
    const validity = owners.own(new oc.BRepCheck_Analyzer(face.wrapped, true, false, false));
    check(validity.IsValid(), 'Invalid native profile face.');
    const wires = owners.ownAll(topology(face, 'wire', 1));
    check(wires.length === 1 && wires[0].isClosed, 'Profile requires one closed wire without holes.');
    const edges = owners.ownAll(topology(wires[0], 'edge', 4));
    check(edges.length === 1 || edges.length === 4, 'Unsupported profile boundary.');
    const occurrence = owners.own(new oc.TopExp_Explorer(wires[0].wrapped, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0;
    while (occurrence.More()) { owners.own(occurrence.Current()); check(++count <= 4, 'Repeated profile edges.'); occurrence.Next(); }
    check(count === edges.length, 'Repeated profile edges.');
    let tolerance = plane.tolerance;
    const curves = edges.map(edge => {
      const t = oc.BRep_Tool.Tolerance(edge.wrapped);
      check(Number.isFinite(t) && t >= 0, 'Invalid profile edge tolerance.'); tolerance = Math.max(tolerance, t);
      return owners.own(new oc.BRepAdaptor_Curve(edge.wrapped));
    });
    const coordinate = (p: { X(): number; Y(): number; Z(): number }): Vec3 => {
      const v: Vec3 = [p.X(), p.Y(), p.Z()]; check(v.every(Number.isFinite), 'Nonfinite profile coordinates.'); return v;
    };
    const finish = (center: Vec3, span: number): ProfileBase => {
      const arithmetic = 64 * Number.EPSILON * (norm(center) + span);
      const positionErrorMm = tolerance + arithmetic, normalErrorRad = 64 * Number.EPSILON;
      check(Number.isFinite(positionErrorMm) && positionErrorMm <= lengthBand && normalErrorRad <= angleBand, 'Profile precisionLimit.');
      return { center, normal: [...plane.normal], nativeToleranceMm: tolerance, uncertainty: { positionErrorMm, normalErrorRad } };
    };
    if (edges.length === 1) {
      const curve = curves[0];
      check(curve.GetType() === oc.GeomAbs_CurveType.GeomAbs_Circle && edges[0].isClosed, 'Profile requires a complete analytic circle.');
      const first = curve.FirstParameter(), last = curve.LastParameter();
      check(Number.isFinite(first) && Number.isFinite(last) && Math.abs(last - first - 2 * Math.PI) <= 1e-12, 'Partial circular profile.');
      const seam = owners.ownAll(topology(edges[0], 'vertex', 2));
      check(seam.length === 1, 'Complete circle requires one native seam vertex.');
      tolerance = Math.max(tolerance, extractAssemblyVertexSupport(seam[0]).tolerance);
      const circle = owners.own(curve.Circle()), location = owners.own(circle.Location()), center = coordinate(location), radiusMm = circle.Radius();
      check(Number.isFinite(radiusMm) && radiusMm > 0, 'Invalid circle radius.');
      const base = finish(center, radiusMm), radiusErrorMm = tolerance + 32 * Number.EPSILON * radiusMm;
      check(radiusErrorMm <= lengthBand, 'Profile radius precisionLimit.');
      return { ...base, kind: 'circle', radiusMm, radiusErrorMm };
    }
    check(curves.every(curve => curve.GetType() === oc.GeomAbs_CurveType.GeomAbs_Line), 'Rectangle requires four native LINE edges.');
    const vertices = owners.ownAll(topology(wires[0], 'vertex', 8));
    check(vertices.length === 4, 'Rectangle requires four distinct native corners.');
    const points = vertices.map(vertex => { const v = extractAssemblyVertexSupport(vertex); tolerance = Math.max(tolerance, v.tolerance); return v.point; });
    const links = edges.map(edge => {
      const ends = owners.ownAll(topology(edge, 'vertex', 2));
      check(ends.length === 2, 'Degenerate rectangle edge.');
      return ends.map(end => vertices.findIndex(vertex => vertex.wrapped.IsSame(end.wrapped)));
    });
    check(links.every(pair => pair.every(i => i >= 0) && pair[0] !== pair[1]), 'Invalid corner membership.');
    const order = [0]; let previous = -1;
    for (let step = 0; step < 4; step++) {
      const current = order[order.length - 1], adjacent = links.filter(pair => pair.includes(current)).map(pair => pair[0] === current ? pair[1] : pair[0]);
      check(adjacent.length === 2 && adjacent[0] !== adjacent[1], 'Ambiguous rectangle connectivity.');
      const next = adjacent.find(i => i !== previous)!;
      if (step === 3) check(next === 0, 'Open rectangle boundary.');
      else { check(!order.includes(next), 'Self-connected rectangle boundary.'); order.push(next); }
      previous = current;
    }
    const corners = order.map(i => points[i]) as [Vec3, Vec3, Vec3, Vec3];
    const vectors = corners.map((p, i) => sub(corners[(i + 1) % 4], p)), lengths = vectors.map(norm);
    check(lengths.every(l => Number.isFinite(l) && l > 4 * tolerance), 'Degenerate rectangle lengths.');
    const axes = vectors.map((v, i) => v.map(x => x / lengths[i]) as Vec3);
    const span = Math.max(...lengths), roundoff = 64 * Number.EPSILON * Math.max(...points.map(norm), span);
    check(Number.isFinite(roundoff) && roundoff <= lengthBand, 'Profile precisionLimit.');
    const closureBand = 4 * tolerance + roundoff;
    // Shape classification uses the requested angular band (with a stricter
    // ceiling), separately from arithmetic uncertainty of the planar normal.
    // Native length tolerances are not converted into an angular metrology claim.
    const classificationAngle = Math.min(angleBand, 1e-10);
    for (let i = 0; i < 4; i++) check(Math.asin(Math.min(1, Math.abs(dot(axes[i], axes[(i + 1) % 4])))) <= classificationAngle
      && Math.asin(Math.min(1, Math.abs(dot(axes[i], plane.normal)))) <= classificationAngle, 'Nonrectangular boundary directions.');
    check(norm(vectors[0].map((v, i) => v + vectors[2][i]) as Vec3) <= closureBand && norm(vectors[1].map((v, i) => v + vectors[3][i]) as Vec3) <= closureBand, 'Unequal opposite rectangle sides.');
    const center = corners[0].map((v, i) => v + (corners[2][i] - v) / 2) as Vec3;
    const other = corners[1].map((v, i) => v + (corners[3][i] - v) / 2) as Vec3;
    check(norm(sub(center, other)) <= closureBand, 'Ambiguous rectangle center.');
    return { ...finish(center, span), kind: 'rectangle', corners, boundaryAxes: [axes[0], axes[1]], lengthsMm: [lengths[0], lengths[1]] };
  }, undefined, 'Assembly profile support extraction or release failed.');
}

/** Borrowed face AND selected boundary edge -> detached rectangular direction.
 * Sense multiplies increasing native curve-parameter D1, independent of edge
 * TopAbs orientation. No canonical coordinate sign, boundary ordinal, long-axis
 * inference or face traversal axis determines the material direction.
 * Identity is checked before geometric consistency. This grants no reference
 * currentness, saved correspondence or solver authority outside its producer.
 */
export function extractAssemblyRectangleAxisSupport(face: Face, edge: Edge, sense: 1 | -1,
  options: { lengthToleranceMm?: number; angleToleranceRad?: number } = {}): AssemblyNativeRectangleAxisSupport {
  check(sense === 1 || sense === -1, 'Rectangle edge sense must be exactly 1 or -1.');
  const angleBand = options.angleToleranceRad ?? 1e-8;
  return withNativeOwners(owners => {
    const profile = extractAssemblyProfileSupport(face, options);
    check(profile.kind === 'rectangle', 'A circular profile has no rectangular material axis.');
    const oc = getOC();
    check(edge.wrapped && !edge.wrapped.IsNull() && edge.wrapped.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_EDGE, 'Rectangle axis needs an actual native edge.');
    const boundary = owners.ownAll(topology(face, 'edge', 4));
    check(boundary.filter(candidate => candidate.wrapped.IsSame(edge.wrapped)).length === 1, 'Selected edge is not an exact member of the rectangle boundary.');
    const curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped));
    check(curve.GetType() === oc.GeomAbs_CurveType.GeomAbs_Line, 'Rectangle material axis requires a native LINE.');
    const first = curve.FirstParameter(), last = curve.LastParameter();
    check(Number.isFinite(first) && Number.isFinite(last) && last > first, 'Rectangle LINE needs a finite increasing parameter interval.');
    const coordinates = (p: { X(): number; Y(): number; Z(): number }): Vec3 => {
      const v: Vec3 = [p.X(), p.Y(), p.Z()]; check(v.every(Number.isFinite), 'Rectangle axis needs finite native coordinates.'); return v;
    };
    const p0 = coordinates(owners.own(curve.Value(first))), p1 = coordinates(owners.own(curve.Value(last)));
    const position = owners.own(new oc.gp_Pnt()), derivative = owners.own(new oc.gp_Vec());
    curve.D1(first, position, derivative);
    const rawDirection = coordinates(derivative), magnitude = norm(rawDirection), chord = sub(p1, p0), edgeLengthMm = norm(chord);
    check(Number.isFinite(magnitude) && magnitude >= 2 ** -1022 && Number.isFinite(edgeLengthMm) && edgeLengthMm >= 2 ** -1022, 'Rectangle axis precisionLimit.');
    const unit = rawDirection.map(v => v / magnitude) as Vec3, chordUnit = chord.map(v => v / edgeLengthMm) as Vec3;
    const vertices = owners.ownAll(topology(edge, 'vertex', 2));
    check(vertices.length === 2, 'Rectangle LINE requires two distinct native endpoints.');
    const points = vertices.map(vertex => extractAssemblyVertexSupport(vertex));
    const tolerance = Math.max(profile.nativeToleranceMm, ...points.map(p => p.tolerance));
    const arithmetic = 64 * Number.EPSILON * (norm(p0) + norm(p1) + edgeLengthMm);
    check(Number.isFinite(arithmetic), 'Rectangle axis precisionLimit.');
    const endpointBand = 2 * tolerance + arithmetic;
    const consistent = (a: Vec3, b: Vec3): boolean => norm(sub(a, b)) <= endpointBand;
    const direct = consistent(p0, points[0].point) && consistent(p1, points[1].point);
    const reverse = consistent(p0, points[1].point) && consistent(p1, points[0].point);
    check(direct !== reverse, 'Rectangle curve endpoints do not uniquely match its native boundary vertices.');
    check(norm(sub(coordinates(position), p0)) <= endpointBand, 'Rectangle D1 point disagrees with the selected curve endpoint.');
    // Native spatial tolerances govern endpoint consistency only; they are not
    // divided by length to invent certified angular metrology. The direction
    // estimate retains arithmetic before endpoint cancellation, the observed
    // analytical/chord discrepancy and the actual projection correction.
    const discrepancy = Math.atan2(norm([
      unit[1] * chordUnit[2] - unit[2] * chordUnit[1], unit[2] * chordUnit[0] - unit[0] * chordUnit[2], unit[0] * chordUnit[1] - unit[1] * chordUnit[0],
    ]), dot(unit, chordUnit));
    const along = dot(unit, profile.normal), projected = unit.map((v, i) => v - along * profile.normal[i]) as Vec3, projectedLength = norm(projected);
    check(Number.isFinite(projectedLength) && projectedLength > .5, 'Rectangle LINE is not an in-plane direction.');
    const projectedUnit = projected.map(v => v / projectedLength) as Vec3;
    const correction = 2 * Math.asin(Math.min(1, norm(sub(projectedUnit, unit)) / 2));
    const xDirectionErrorRad = 128 * Number.EPSILON + 2 * arithmetic / edgeLengthMm + discrepancy + correction + profile.uncertainty.normalErrorRad;
    check(Number.isFinite(xDirectionErrorRad) && xDirectionErrorRad <= angleBand, 'Rectangle axis precisionLimit.');
    check(Math.abs(dot(projectedUnit, profile.normal)) <= 1e-12 && Math.abs(norm(projectedUnit) - 1) <= 1e-12, 'Rectangle axis projection failed.');
    return { profile, xDirection: projectedUnit.map(v => sense * v) as Vec3, xDirectionErrorRad, edgeLengthMm, sense };
  }, undefined, 'Assembly rectangle axis extraction or release failed.');
}
