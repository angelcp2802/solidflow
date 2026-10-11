import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import { getOC, importSTEP, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from "replicad";
import { CadEngine } from "./kernel.engine";
import { entityProfileSolid } from "./kernel.profiles";
import { createFilletBatchDocument } from "../examples/sketch-fillet-batch";
import { parseDocument, serializeDocument, updateFeature, type Document } from "../model/document";
import { planSketchFilletBatch } from "../sketch/fillet";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile, SketchSelection } from "../sketch/types";

// Synthetic Cartesian rectangle. Removing a square minus a quarter disk at
// each right corner independently gives S=wh-(1-π/4)Σr² and
// P=2(w+h)-(2-π/2)Σr. No planner/kernel helper supplies expected geometry.
const engine = new CadEngine();
const SKETCH = "fillet-batch-sketch";
const massTolerance = 5e-6, coordinateTolerance = 5e-7;
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm")),
  print: () => undefined,
})), 60_000);
afterEach(() => engine.dispose());

function profile(document: Document): EntityProfile {
  const sketch = document.features.find(feature => feature.id === SKETCH);
  if (sketch?.type !== "sketch" || sketch.profile.kind !== "entities") throw new Error("Entity sketch expected");
  return sketch.profile;
}
function point(target: EntityProfile, id: string) {
  const found = id === "origin" ? { id, x: 0, y: 0 } : target.points.find(candidate => candidate.id === id);
  if (!found) throw new Error(`Missing point ${id}`);
  return found;
}
function solved(target: EntityProfile) {
  const before = structuredClone(target), solution = solveSketch(target);
  expect(target).toEqual(before);
  expect(solution.status, `${solution.message} (${solution.maxResidual})`).toBe("fullyDefined");
  expect(solution.degreesOfFreedom).toBe(0); expect(solution.conflictingConstraintIds).toEqual([]);
  expect(solution.maxResidual).toBeLessThanOrEqual(1e-7);
  return solution;
}
function targets(ids: string[]): SketchSelection[] { return ids.map(id => ({ kind: "point", id })); }
function prepare(radiusMode: "individual" | "linked" = "individual", ids = ["origin", "bottom-right"]) {
  const document = createFilletBatchDocument(), source = solved(profile(document)).profile;
  const before = structuredClone(source), bytes = serializeDocument(document);
  const batch = planSketchFilletBatch(source, targets(ids), { radius: 2, cornerPolicy: "keep", radiusMode });
  expect(batch.changed, batch.message).toBe(true);
  expect(batch.sourceProfile).toBe(source); expect(batch.profile).not.toBe(source);
  expect(batch.filletEntityIds).toHaveLength(2);
  expect(source).toEqual(before); expect(serializeDocument(document)).toBe(bytes);
  expect(batch.profile.entities.filter(entity => entity.type === "arc")).toHaveLength(2);
  expect(batch.convertedConstraintIds.filter(id => id === "plate-width")).toHaveLength(1);
  const solution = solved(batch.profile);
  return { document: updateFeature(document, SKETCH, { profile: solution.profile }), ids: batch.filletEntityIds };
}
function metrics(radii: number[], width = 10, height = 6) {
  const S = width * height - (1 - Math.PI / 4) * radii.reduce((sum, r) => sum + r * r, 0);
  const P = 2 * (width + height) - (2 - Math.PI / 2) * radii.reduce((sum, r) => sum + r, 0);
  return { volume: 4 * S, area: 2 * S + 4 * P, bounds: [[0, 0, 0], [width, height, 4]] };
}
function expectXY(actual: { x: number; y: number }, x: number, y: number) {
  expect(Math.abs(actual.x - x)).toBeLessThan(coordinateTolerance);
  expect(Math.abs(actual.y - y)).toBeLessThan(coordinateTolerance);
}
function expectArcs(target: EntityProfile, expected: { center: [number, number]; contacts: [number, number][]; radius: number }[]) {
  const arcs = target.entities.filter(entity => entity.type === "arc");
  expect(arcs).toHaveLength(expected.length);
  const remaining = new Set(arcs);
  expected.forEach(oracle => {
    const arc = [...remaining].sort((a, b) => {
      const ca = point(target, a.center), cb = point(target, b.center);
      return Math.hypot(ca.x - oracle.center[0], ca.y - oracle.center[1]) - Math.hypot(cb.x - oracle.center[0], cb.y - oracle.center[1]);
    })[0];
    remaining.delete(arc);
    const center = point(target, arc.center);
    expectXY(center, ...oracle.center);
    const contacts = [point(target, arc.start), point(target, arc.end)].sort((a, b) => a.x - b.x || a.y - b.y);
    const expectedContacts = [...oracle.contacts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    contacts.forEach((contact, i) => {
      expectXY(contact, ...expectedContacts[i]);
      expect(Math.abs(Math.hypot(contact.x - center.x, contact.y - center.y) - oracle.radius)).toBeLessThan(2 * Math.SQRT2 * coordinateTolerance);
      const occurrences = target.entities.filter(entity => entity.type !== "circle" && (entity.start === contact.id || entity.end === contact.id));
      expect(occurrences).toHaveLength(2); expect(occurrences.filter(entity => entity.type === "line")).toHaveLength(1);
    });
    const start = point(target, arc.start), end = point(target, arc.end);
    const sign = arc.clockwise ? -1 : 1, angle = sign * (Math.atan2(end.y - center.y, end.x - center.x) - Math.atan2(start.y - center.y, start.x - center.x));
    const sweep = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(Math.abs(sweep - Math.PI / 2)).toBeLessThan(2 * Math.asin(2 * Math.SQRT2 * coordinateTolerance / oracle.radius));
  });
}
function expectBottom(target: EntityProfile, left = 2, right = 2, width = 10) {
  expectArcs(target, [
    { center: [left, left], contacts: [[left, 0], [0, left]], radius: left },
    { center: [width - right, right], contacts: [[width - right, 0], [width, right]], radius: right },
  ]);
  const bottom = target.entities.find(entity => entity.id === "bottom");
  if (bottom?.type !== "line") throw new Error("Original bottom line expected");
  expectXY(point(target, bottom.start), left, 0); expectXY(point(target, bottom.end), width - right, 0);
  expect(point(target, bottom.end).x - point(target, bottom.start).x).toBeCloseTo(width - left - right, 6);
  expect(bottom.start).not.toBe("origin"); expect(bottom.end).not.toBe("bottom-right");
  expect(solved(target).drivenValues["bottom-reading"]).toBeCloseTo(width - left - right, 6);
}
function measure(shape: Shape3D) {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  const mass = measureShapeVolumeProperties(shape), surface = measureShapeSurfaceProperties(shape), box = shape.boundingBox, solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true); expect(solids).toHaveLength(1);
    return { volume: mass.volume, area: surface.area, bounds: box.bounds };
  } finally { solids.forEach(solid => solid.delete()); box.delete(); surface.delete(); mass.delete(); analyzer.delete(); }
}
function expectMetrics(actual: ReturnType<typeof measure>, expected: ReturnType<typeof metrics>) {
  expect(Math.abs(actual.volume - expected.volume)).toBeLessThan(massTolerance);
  expect(Math.abs(actual.area - expected.area)).toBeLessThan(massTolerance);
  actual.bounds.forEach((side, i) => side.forEach((value, j) => expect(Math.abs(value - expected.bounds[i][j])).toBeLessThan(5e-6)));
}
async function expectRebuilt(document: Document, expected: ReturnType<typeof metrics>) {
  const resolved = solved(profile(document)).profile, before = structuredClone(document), first = engine.build(document.features);
  expect(document).toEqual(before); expect(first.featureErrors).toEqual([]); expect(first.warnings).toEqual([]);
  expect(Math.abs(first.volume - expected.volume)).toBeLessThan(massTolerance);
  const native = entityProfileSolid(resolved, "XY", 0, { type: "extrude", depth: 4 });
  try { expectMetrics(measure(native), expected); } finally { native.delete(); }
  const reopened = parseDocument(serializeDocument(document)); expect(reopened.features).toEqual(document.features);
  const restored = engine.build(reopened.features);
  expect(restored.featureErrors).toEqual([]); expect(restored.warnings).toEqual([]);
  expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  const step = (await importSTEP(engine.export("step"))).asShape3D();
  try { expectMetrics(measure(step), expected); } finally { step.delete(); }
}
function setRadius(target: EntityProfile, id: string, value: number) {
  const radius = target.constraints.find(c => c.type === "radius" && c.entityId === id && !c.driven);
  if (radius?.type !== "radius") throw new Error("Driving radius expected");
  radius.value = value;
}

it("builds the anchored synthetic 10×6×4 plate before any batch", async () => {
  await expectRebuilt(createFilletBatchDocument(), metrics([]));
});
it.each(["individual", "linked"] as const)("rounds both ends of the bottom edge in one %s batch and rebuilds analytical R2 mass", async radiusMode => {
  const prepared = prepare(radiusMode), target = profile(prepared.document);
  expectBottom(target);
  expect(target.constraints.filter(c => c.type === "radius" && prepared.ids.includes(c.entityId) && !c.driven)).toHaveLength(radiusMode === "individual" ? 2 : 1);
  expect(target.constraints.filter(c => c.type === "equal" && prepared.ids.includes(c.a) && prepared.ids.includes(c.b))).toHaveLength(radiusMode === "individual" ? 0 : 1);
  await expectRebuilt(prepared.document, metrics([2, 2]));
});
it("rounds two adjacent left corners without confusing their mass with bottom adjacency", async () => {
  const prepared = prepare("individual", ["origin", "top-left"]), target = profile(prepared.document);
  expectArcs(target, [
    { center: [2, 2], contacts: [[0, 2], [2, 0]], radius: 2 },
    { center: [2, 4], contacts: [[0, 4], [2, 6]], radius: 2 },
  ]);
  const left = target.entities.find(entity => entity.id === "left");
  if (left?.type !== "line") throw new Error("Original left line expected");
  expectXY(point(target, left.start), 0, 4); expectXY(point(target, left.end), 0, 2);
  expect(point(target, left.start).y - point(target, left.end).y).toBeCloseTo(2, 6);
  await expectRebuilt(prepared.document, metrics([2, 2]));
});
it("reopens a linked batch and edits its canonical master from R2 to R1 for both corners", async () => {
  const prepared = prepare("linked"), reopened = parseDocument(serializeDocument(prepared.document)), target = profile(reopened);
  setRadius(target, prepared.ids[0], 1);
  const solution = solved(target).profile; expectBottom(solution, 1, 1);
  await expectRebuilt(updateFeature(reopened, SKETCH, { profile: solution }), metrics([1, 1]));
});
it("edits one individual radius after reopening while the other remains R2", async () => {
  const prepared = prepare(), reopened = parseDocument(serializeDocument(prepared.document)), target = profile(reopened);
  // Canonical point-ID order makes bottom-right the first target/master.
  const first = target.entities.find(entity => entity.id === prepared.ids[0]);
  if (first?.type !== "arc") throw new Error("Canonical arc expected");
  expectXY(point(target, first.center), 8, 2);
  setRadius(target, first.id, 1);
  const solution = solved(target).profile; expectBottom(solution, 2, 1);
  await expectRebuilt(updateFeature(reopened, SKETCH, { profile: solution }), metrics([2, 1]));
});
it("retains the original converted width/height dimensions for downstream reconstruction", async () => {
  const prepared = prepare(), target = profile(prepared.document);
  for (const [id, value] of [["plate-width", 12], ["plate-height", 8]] as const) {
    const dimension = target.constraints.find(c => c.id === id);
    if (dimension?.type !== "distance") throw new Error("Converted original distance expected");
    dimension.value = value;
  }
  const adjusted = solved(target).profile; expectBottom(adjusted, 2, 2, 12);
  await expectRebuilt(updateFeature(prepared.document, SKETCH, { profile: adjusted }), metrics([2, 2], 12, 8));
});
it.each([[3, false], [3, true], [3.1, false], [3.1, true]] as const)("rejects joint left-edge collapse/reversal at R%s with reversed selection %s", async (radius, reversed) => {
  const document = createFilletBatchDocument(), target = solved(profile(document)).profile;
  const before = structuredClone(target), bytes = serializeDocument(document);
  const ids = reversed ? ["top-left", "origin"] : ["origin", "top-left"];
  const rejected = planSketchFilletBatch(target, targets(ids), { radius, cornerPolicy: "keep", radiusMode: "individual" });
  expect(rejected.changed).toBe(false); expect(rejected.sourceProfile).toBe(target); expect(rejected.profile).toBe(target);
  expect(rejected.filletEntityIds).toEqual([]); expect(rejected.createdEntityIds).toEqual([]);
  expect(target).toEqual(before); expect(serializeDocument(document)).toBe(bytes);
  await expectRebuilt(document, metrics([]));
});
