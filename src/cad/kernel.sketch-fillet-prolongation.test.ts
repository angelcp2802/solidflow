import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import {
  getOC, importSTEP, measureShapeSurfaceProperties, measureShapeVolumeProperties,
  setOC, type Shape3D,
} from "replicad";
import { CadEngine } from "./kernel.engine";
import { entityProfileSolid } from "./kernel.profiles";
import { createFilletProlongationDocument, type FilletProlongationExample } from "../examples/sketch-fillet-prolongation";
import { addFeature, parseDocument, serializeDocument, updateFeature, type Document } from "../model/document";
import { planSketchFillet } from "../sketch/fillet";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile, SketchSelection } from "../sketch/types";

// Independently authored synthetic millimetre contours. Offset-circle equations,
// similar triangles and Green integration supply coordinates and mass oracles.
// No planner or kernel geometry helper calculates an expected coordinate/mass.
const engine = new CadEngine();
const kinds = ["line-arc", "arc-arc"] as const;
const SKETCH = "fillet-prolongation-sketch";
const coordinateTolerance = 5e-7;
const pointNormTolerance = Math.SQRT2 * coordinateTolerance;
const massTolerance = 5e-6;
const TAU = Math.PI * 2;

beforeAll(async () => {
  setOC(await initOpenCascade({
    wasmBinary: await readFile(createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm")),
    print: () => undefined,
  }));
}, 60_000);
afterEach(() => engine.dispose());

function profile(document: Document): EntityProfile {
  const sketch = document.features.find(feature => feature.id === SKETCH);
  if (sketch?.type !== "sketch" || sketch.profile.kind !== "entities") throw new Error("Entity sketch expected");
  return sketch.profile;
}
function point(target: EntityProfile, id: string) {
  if (id === "origin") return { id, x: 0, y: 0 };
  const found = target.points.find(candidate => candidate.id === id);
  if (!found) throw new Error(`Missing point ${id}`);
  return found;
}
function arc(target: EntityProfile, id: string) {
  const found = target.entities.find(entity => entity.id === id);
  if (found?.type !== "arc") throw new Error(`Missing arc ${id}`);
  return found;
}
function sweep(target: EntityProfile, id: string) {
  const entity = arc(target, id), c = point(target, entity.center);
  const a = point(target, entity.start), b = point(target, entity.end);
  const start = Math.atan2(a.y - c.y, a.x - c.x), end = Math.atan2(b.y - c.y, b.x - c.x);
  const travel = entity.clockwise ? start - end : end - start;
  return (entity.clockwise ? -1 : 1) * (((travel % TAU) + TAU) % TAU);
}
function solved(target: EntityProfile) {
  const before = structuredClone(target), result = solveSketch(target);
  expect(target).toEqual(before);
  expect(result.status, `${result.message} (${result.maxResidual})`).toBe("fullyDefined");
  expect(result.degreesOfFreedom).toBe(0);
  expect(result.conflictingConstraintIds).toEqual([]);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result.profile;
}
function selection(kind: FilletProlongationExample): SketchSelection[] {
  return (kind === "line-arc" ? ["source-line", "source-arc"] : ["left-source", "right-source"])
    .map(id => ({ kind: "entity", id }));
}
function prepare(kind: FilletProlongationExample) {
  const source = createFilletProlongationDocument(kind), resolved = solved(profile(source));
  const before = structuredClone(resolved), serialized = serializeDocument(source);
  const plan = planSketchFillet(resolved, selection(kind), { radius: 2, cornerPolicy: "keep" });
  expect(plan.changed, plan.message).toBe(true);
  expect(plan.filletEntityId).not.toBeNull();
  expect(plan.sourceProfile).toBe(resolved);
  expect(resolved).toEqual(before);
  expect(serializeDocument(source)).toBe(serialized);
  expect(plan.sourceEdits.map(edit => edit.movement)).toEqual(kind === "line-arc" ? ["trim", "extend"] : ["extend", "extend"]);
  const oldPoints = kind === "line-arc" ? ["line-start", "arc-start"] : ["left-start", "right-start"];
  expect([...plan.deletedConstraintIds].sort()).toEqual(oldPoints.map(id => `fix-${id}`).sort());
  for (const id of oldPoints) expect(plan.profile.points.some(p => p.id === id)).toBe(false);
  const oldFixes = resolved.constraints.filter(constraint => constraint.type === "fix" && !oldPoints.includes(constraint.pointId));
  for (const constraint of oldFixes) expect(plan.profile.constraints).toContainEqual(constraint);
  const document = updateFeature(source, SKETCH, { profile: solved(plan.profile) });
  return { document, filletId: plan.filletEntityId! };
}
function withExtrusion(document: Document) {
  return addFeature(document, {
    id: "fillet-prolongation-extrude", name: "Saliente · 4 mm", type: "extrude",
    sketchId: SKETCH, depth: 4, symmetric: false, suppressed: false,
  });
}
function analytic(kind: FilletProlongationExample, radius: number) {
  if (kind === "line-arc") {
    const t = Math.sqrt(100 + 20 * radius), theta = Math.asin(radius / (10 + radius)), delta = Math.PI / 2 - theta;
    // Boundary polyline contributes 600; source arc contributes -50*delta;
    // the fillet contributes (radius²*delta-radius*t)/2 to Green's integral.
    const area2D = 600 - (100 - radius ** 2) * delta / 2 - radius * t / 2;
    const perimeter = 90 - t + (10 + radius) * delta;
    return {
      area2D, perimeter, volume: 4 * area2D, area: 2 * area2D + 4 * perimeter,
      bounds: [[0, 0, 0], [30, 20, 4]],
      center: [t, radius], contacts: [[t, 0], [10 * t / (10 + radius), 10 * radius / (10 + radius)]],
      sourceSweep: delta, filletSweep: -delta,
    };
  }
  const h = Math.sqrt((10 + radius) ** 2 - 36), alpha = Math.atan2(h, 6);
  // Two outer R10 arcs and a reversed inner fillet give the curved cap.
  // The bottom rectangle adds 32*10 mm² and 20 mm to the perimeter.
  const area2D = 320 + 100 * (Math.PI - alpha) - radius ** 2 / 2 * (Math.PI - 2 * alpha) + 6 * h;
  const perimeter = 52 + 20 * (Math.PI - alpha) + radius * (Math.PI - 2 * alpha);
  return {
    area2D, perimeter, volume: 4 * area2D, area: 2 * area2D + 4 * perimeter,
    bounds: [[-16, -10, 0], [16, 10, 4]],
    center: [0, h], contacts: [[-6 * radius / (10 + radius), 10 * h / (10 + radius)], [6 * radius / (10 + radius), 10 * h / (10 + radius)]],
    sourceSweep: Math.PI - alpha, filletSweep: Math.PI - 2 * alpha,
  };
}
function expectPoint(target: EntityProfile, id: string, xy: number[]) {
  const actual = point(target, id);
  expect(Math.abs(actual.x - xy[0])).toBeLessThan(coordinateTolerance);
  expect(Math.abs(actual.y - xy[1])).toBeLessThan(coordinateTolerance);
}
function expectRadius(target: EntityProfile, id: string, radius: number) {
  const entity = arc(target, id), c = point(target, entity.center);
  // Two independently checked point positions can differ by 2*d in norm.
  for (const endpointId of [entity.start, entity.end]) {
    const endpoint = point(target, endpointId);
    expect(Math.abs(Math.hypot(endpoint.x - c.x, endpoint.y - c.y) - radius)).toBeLessThan(2 * pointNormTolerance);
  }
}
function expectSweep(target: EntityProfile, id: string, expected: number, radius: number) {
  // Coordinate errors <=d at endpoint and center imply angular error
  // <=asin(2d/R) per ray, hence this sufficient two-ray sweep bound.
  expect(Math.abs(sweep(target, id) - expected)).toBeLessThan(2 * Math.asin(2 * pointNormTolerance / radius));
}
function expectGeometry(target: EntityProfile, kind: FilletProlongationExample, filletId: string, radius: number) {
  const expected = analytic(kind, radius), fillet = arc(target, filletId);
  expectPoint(target, fillet.center, expected.center);
  expectPoint(target, fillet.start, expected.contacts[0]);
  expectPoint(target, fillet.end, expected.contacts[1]);
  expectRadius(target, filletId, radius);
  expectSweep(target, filletId, expected.filletSweep, radius);
  if (kind === "line-arc") {
    const source = arc(target, "source-arc");
    expect(source).toMatchObject({ center: "origin", end: "arc-far", start: fillet.end, clockwise: false });
    const line = target.entities.find(entity => entity.id === "source-line");
    expect(line).toMatchObject({ start: fillet.start, end: "line-far" });
    expectPoint(target, "line-far", [30, 0]); expectPoint(target, "arc-far", [0, 10]);
    expectPoint(target, "upper-right", [30, 20]); expectPoint(target, "upper-left", [0, 20]);
    expectRadius(target, source.id, 10); expectSweep(target, source.id, expected.sourceSweep, 10);
    expect(target.constraints).toContainEqual({ id: "source-radius-reading", type: "radius", entityId: source.id, value: 10, driven: true, referenceRole: "annotation" });
  } else {
    expect(arc(target, "left-source")).toMatchObject({ center: "left-center", end: "left-far", start: fillet.start, clockwise: false });
    expect(arc(target, "right-source")).toMatchObject({ center: "right-center", end: "right-far", start: fillet.end, clockwise: true });
    expectPoint(target, "left-center", [-6, 0]); expectPoint(target, "right-center", [6, 0]);
    expectPoint(target, "left-far", [-16, 0]); expectPoint(target, "right-far", [16, 0]);
    expectPoint(target, "lower-left", [-16, -10]); expectPoint(target, "lower-right", [16, -10]);
    for (const id of ["left-source", "right-source"]) expectRadius(target, id, 10);
    expectSweep(target, "left-source", expected.sourceSweep, 10); expectSweep(target, "right-source", -expected.sourceSweep, 10);
  }
  expect(target.constraints.filter(constraint => constraint.type === "tangent").map(constraint => constraint.branch))
    .toEqual(kind === "line-arc" ? ["left", "external"] : ["external", "external"]);
}
function measure(shape: Shape3D) {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  const mass = measureShapeVolumeProperties(shape), surface = measureShapeSurfaceProperties(shape);
  const box = shape.boundingBox, solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true); expect(solids).toHaveLength(1);
    return { volume: mass.volume, area: surface.area, bounds: box.bounds };
  } finally {
    solids.forEach(solid => solid.delete()); box.delete(); surface.delete(); mass.delete(); analyzer.delete();
  }
}
type Metrics = { volume: number; area: number; bounds: number[][] };
function expectMetrics(actual: Metrics, expected: Metrics) {
  expect(Math.abs(actual.volume - expected.volume)).toBeLessThan(massTolerance);
  expect(Math.abs(actual.area - expected.area)).toBeLessThan(massTolerance);
  actual.bounds.forEach((side, i) => side.forEach((value, axis) => expect(Math.abs(value - expected.bounds[i][axis])).toBeLessThan(5e-6)));
}
async function expectSolid(document: Document, expected: Metrics) {
  const sourceProfile = solved(profile(document));
  const before = structuredClone(document), first = engine.build(document.features);
  expect(document).toEqual(before); expect(first.featureErrors).toEqual([]); expect(first.warnings).toEqual([]);
  expect(Math.abs(first.volume - expected.volume)).toBeLessThan(massTolerance);
  expect(first.faces).toHaveLength(8); expect(first.edges).toHaveLength(18);
  const native = entityProfileSolid(sourceProfile, "XY", 0, { type: "extrude", depth: 4 });
  try { expectMetrics(measure(native), expected); } finally { native.delete(); }
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  const rebuilt = engine.build(reopened.features);
  expect(rebuilt.featureErrors).toEqual([]); expect(rebuilt.warnings).toEqual([]);
  expect(rebuilt.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(rebuilt.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  const imported = (await importSTEP(engine.export("step"))).asShape3D();
  try { expectMetrics(measure(imported), expected); } finally { imported.delete(); }
}
function setRadius(target: EntityProfile, id: string, value: number) {
  const dimension = target.constraints.find(constraint => constraint.type === "radius" && constraint.entityId === id && !constraint.driven);
  if (dimension?.type !== "radius") throw new Error("Driving radius expected");
  dimension.value = value;
}

/** Independent Green integration of the solved, closed line/circular contour.
 * A slightly inexact arc seed is realized through its endpoints and angular
 * midpoint. Solve its circumcircle directly instead of using a kernel helper.
 * This isolates CAD reconstruction accuracy from the solver's accepted seed
 * error; exact analytical final profiles keep the strict ideal-mass controls.
 */
function integratedSolvedContour(target: EntityProfile) {
  const entries = target.entities.filter(entity => !entity.construction);
  const used = new Set<string>();
  const initial = entries[0];
  if (initial.type === "circle") throw new Error("Line/arc contour expected");
  let current = initial.start, signedArea = 0, perimeter = 0;
  for (let index = 0; index < entries.length; index++) {
    const entity = entries.find(candidate => candidate.type !== "circle" && !used.has(candidate.id) && (candidate.start === current || candidate.end === current));
    if (!entity || entity.type === "circle") throw new Error("Closed contour expected");
    used.add(entity.id);
    const reversed = entity.end === current;
    const start = point(target, reversed ? entity.end : entity.start), end = point(target, reversed ? entity.start : entity.end);
    if (entity.type === "line") {
      signedArea += (start.x * end.y - end.x * start.y) / 2;
      perimeter += Math.hypot(end.x - start.x, end.y - start.y);
    } else {
      const center = point(target, entity.center), originalStart = point(target, entity.start);
      const storedRadius = Math.hypot(originalStart.x - center.x, originalStart.y - center.y);
      const originalAngle = Math.atan2(originalStart.y - center.y, originalStart.x - center.x);
      const midpointAngle = originalAngle + sweep(target, entity.id) / 2;
      const middle = { x: center.x + storedRadius * Math.cos(midpointAngle), y: center.y + storedRadius * Math.sin(midpointAngle) };
      const ux = middle.x - start.x, uy = middle.y - start.y, vx = end.x - start.x, vy = end.y - start.y;
      const u2 = ux * ux + uy * uy, v2 = vx * vx + vy * vy, denominator = 2 * (ux * vy - uy * vx);
      const cx = start.x + (u2 * vy - v2 * uy) / denominator;
      const cy = start.y + (ux * v2 - vx * u2) / denominator;
      const radius = Math.hypot(start.x - cx, start.y - cy);
      const a = Math.atan2(start.y - cy, start.x - cx), b = Math.atan2(end.y - cy, end.x - cx);
      const clockwise = reversed ? !entity.clockwise : entity.clockwise;
      const travel = clockwise ? a - b : b - a;
      const directed = (clockwise ? -1 : 1) * (((travel % TAU) + TAU) % TAU);
      signedArea += (radius ** 2 * directed + radius * cx * (Math.sin(b) - Math.sin(a)) - radius * cy * (Math.cos(b) - Math.cos(a))) / 2;
      perimeter += radius * Math.abs(directed);
    }
    current = reversed ? entity.start : entity.end;
  }
  expect(current).toBe(initial.start); expect(used.size).toBe(entries.length);
  const area2D = Math.abs(signedArea);
  return { volume: 4 * area2D, area: 2 * area2D + 4 * perimeter };
}

it.each(kinds)("loads the original gapped %s example as a fully defined sketch without a failing extrusion", kind => {
  const document = createFilletProlongationDocument(kind);
  expect(document.features).toHaveLength(1); expect(document.features[0].type).toBe("sketch");
  solved(profile(document));
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]); expect(result.volume).toBe(0);
  expect(parseDocument(serializeDocument(document)).features).toEqual(document.features);
});

it.each(kinds)("prolongs the actual %s sources and rebuilds a strict analytical R2 solid through save/reopen and STEP", async kind => {
  const { document, filletId } = prepare(kind);
  expectGeometry(profile(document), kind, filletId, 2);
  await expectSolid(withExtrusion(document), analytic(kind, 2));
});

it.each(kinds)("builds the exact analytical R3 %s final coordinates as a strict ideal-mass control", async kind => {
  const { document, filletId } = prepare(kind), target = profile(document), fillet = arc(target, filletId), expected = analytic(kind, 3);
  for (const [id, xy] of [[fillet.center, expected.center], [fillet.start, expected.contacts[0]], [fillet.end, expected.contacts[1]]] as const) {
    Object.assign(point(target, id), { x: xy[0], y: xy[1] });
  }
  setRadius(target, filletId, 3);
  const solution = solveSketch(target);
  expect(solution.iterations).toBe(0);
  expectGeometry(solved(target), kind, filletId, 3);
  await expectSolid(withExtrusion(document), expected);
});

it.each(kinds)("edits the reopened %s R2 radius to R3 and separately verifies coordinates and reconstructed mass", async kind => {
  const prepared = prepare(kind), reopened = parseDocument(serializeDocument(prepared.document)), target = profile(reopened);
  setRadius(target, prepared.filletId, 3);
  const adjusted = solved(target);
  expectGeometry(adjusted, kind, prepared.filletId, 3);
  const integrated = integratedSolvedContour(adjusted), expected = analytic(kind, 3);
  // Edited solver seeds are checked against their own independently integrated
  // realized contour. Their discrepancy from ideal analytical R3 is distinct
  // from kernel reconstruction error; the exact R3 test above checks that ideal.
  const document = updateFeature(reopened, SKETCH, { profile: adjusted });
  await expectSolid(withExtrusion(document), { ...integrated, bounds: expected.bounds });
});

it("rejects the retained-line collapse on the selected prolongation branch without changing the sketch", () => {
  const source = createFilletProlongationDocument(), target = solved(profile(source));
  const first = planSketchFillet(target, selection("line-arc"), { radius: 2, cornerPolicy: "keep" });
  expect(first.changed, first.message).toBe(true);
  const before = structuredClone(target), serialized = serializeDocument(source);
  const rejected = planSketchFillet(target, selection("line-arc"), { radius: 40, cornerPolicy: "keep", solutionIndex: first.selectedSolutionIndex! });
  expect(rejected.changed).toBe(false); expect(rejected.profile).toBe(target); expect(rejected.sourceEdits).toEqual([]);
  expect(target).toEqual(before); expect(serializeDocument(source)).toBe(serialized);
});
