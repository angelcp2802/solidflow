import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import { getOC, importSTEP, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from "replicad";
import { CadEngine } from "./kernel.engine";
import { entityProfileSolid } from "./kernel.profiles";
import { createSketchMirrorArcDocument, createSketchMirrorDocument } from "../examples/sketch-mirror";
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, type Document } from "../model/document";
import { planSketchMirror } from "../sketch/mirror";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile, SketchSelection } from "../sketch/types";

// Original synthetic Cartesian and circular examples. Expected coordinates,
// area and perimeter below are analytical; no reflection/planner/kernel helper
// calculates the oracle. All lengths are mm and extrusion depths are 4 mm.
const engine = new CadEngine();
const SKETCH = "mirror-sketch", EXTRUDE = "mirror-extrude";
const coordinateTolerance = 5e-7, massTolerance = 5e-6;
type Metrics = { volume: number; area: number; bounds: number[][] };
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
function expectXY(target: EntityProfile, id: string, x: number, y: number) {
  const actual = point(target, id);
  expect(Math.abs(actual.x - x)).toBeLessThan(coordinateTolerance);
  expect(Math.abs(actual.y - y)).toBeLessThan(coordinateTolerance);
}
function solved(target: EntityProfile) {
  const before = structuredClone(target), result = solveSketch(target);
  expect(target).toEqual(before);
  expect(result.status, `${result.message} (${result.maxResidual})`).toBe("fullyDefined");
  expect(result.degreesOfFreedom).toBe(0); expect(result.conflictingConstraintIds).toEqual([]);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function mirror(document: Document, ids = ["bottom", "right", "top"], joins = ["origin", "top-seam"]) {
  const source = solved(profile(document)).profile, before = structuredClone(source), bytes = serializeDocument(document);
  const selection: SketchSelection[] = ids.map(id => ({ kind: "entity", id }));
  const plan = planSketchMirror(source, selection, { axisEntityId: "axis", joinPointIds: joins });
  expect(plan.changed, plan.message).toBe(true); expect(plan.sourceProfile).toBe(source);
  expect(plan.profile).not.toBe(source); expect(plan.imageEntityIds).toHaveLength(ids.length);
  expect(source).toEqual(before); expect(serializeDocument(document)).toBe(bytes);
  const solution = solved(plan.profile);
  return { document: updateFeature(document, SKETCH, { profile: solution.profile }), plan, solution };
}
function extrude(document: Document) {
  return addFeature(document, {
    id: EXTRUDE, name: "Saliente · 4 mm", type: "extrude", sketchId: SKETCH,
    depth: 4, symmetric: false, suppressed: false,
  });
}
function rectangle(width = 5): Metrics {
  // Full rectangle: S=(2w)6; P=2(2w+6); V=4S; A=2S+4P.
  return { volume: 48 * width, area: 40 * width + 48, bounds: [[-width, 0, 0], [width, 6, 4]] };
}
function measure(shape: Shape3D): Metrics {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  const mass = measureShapeVolumeProperties(shape), surface = measureShapeSurfaceProperties(shape), box = shape.boundingBox, solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true); expect(solids).toHaveLength(1);
    return { volume: mass.volume, area: surface.area, bounds: box.bounds };
  } finally { solids.forEach(solid => solid.delete()); box.delete(); surface.delete(); mass.delete(); analyzer.delete(); }
}
function expectMetrics(actual: Metrics, expected: Metrics) {
  expect(Math.abs(actual.volume - expected.volume)).toBeLessThan(massTolerance);
  expect(Math.abs(actual.area - expected.area)).toBeLessThan(massTolerance);
  actual.bounds.forEach((side, i) => side.forEach((value, j) => expect(Math.abs(value - expected.bounds[i][j])).toBeLessThan(massTolerance)));
}
async function expectRebuilt(document: Document, expected: Metrics) {
  const target = solved(profile(document)).profile, before = structuredClone(document), first = engine.build(document.features);
  expect(document).toEqual(before); expect(first.featureErrors).toEqual([]); expect(first.warnings).toEqual([]);
  expect(Math.abs(first.volume - expected.volume)).toBeLessThan(massTolerance);
  const native = entityProfileSolid(target, "XY", 0, { type: "extrude", depth: 4 });
  try { expectMetrics(measure(native), expected); } finally { native.delete(); }
  const reopened = parseDocument(serializeDocument(document)); expect(reopened.features).toEqual(document.features);
  const restored = engine.build(reopened.features);
  expect(restored.featureErrors).toEqual([]); expect(restored.warnings).toEqual([]);
  expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  const step = (await importSTEP(engine.export("step"))).asShape3D();
  try { expectMetrics(measure(step), expected); } finally { step.delete(); }
  return first;
}
function editDimension(document: Document, id: string, value: number) {
  const target = profile(document), dimension = target.constraints.find(constraint => constraint.id === id);
  if (!dimension || !("value" in dimension) || dimension.driven) throw new Error("Driving dimension expected");
  dimension.value = value;
  return updateFeature(document, SKETCH, { profile: solved(target).profile });
}
function expectHalfProfile(target: EntityProfile, pointMap: Record<string, string>, width = 5) {
  expectXY(target, "bottom-right", width, 0); expectXY(target, "top-right", width, 6);
  expectXY(target, pointMap["bottom-right"], -width, 0); expectXY(target, pointMap["top-right"], -width, 6);
  expect(pointMap.origin).toBe("origin"); expect(pointMap["top-seam"]).toBe("top-seam");
  expect(target.points.filter(candidate => candidate.id === "origin")).toEqual([]);
  expectXY(target, "top-seam", 0, 6); expectXY(target, "axis-top", 0, 8);
  for (const seam of ["origin", "top-seam"]) {
    expect(target.entities.filter(entity => !entity.construction && entity.type === "line" && (entity.start === seam || entity.end === seam))).toHaveLength(2);
  }
  expect(target.entities.filter(entity => entity.construction).map(entity => entity.id)).toEqual(["axis"]);
}

it("keeps the synthetic half-profile open and fully defined before the mirror", () => {
  const document = createSketchMirrorDocument(), before = serializeDocument(document);
  expect(solved(profile(document)).drivenValues["half-width-reading"]).toBeCloseTo(5, 7);
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]); expect(result.volume).toBe(0);
  expect(serializeDocument(document)).toBe(before);
});
it("joins the two declared seams into one analytical 10×6×4 solid and reopens its relations", async () => {
  const mirrored = mirror(createSketchMirrorDocument()), target = profile(mirrored.document);
  expectHalfProfile(target, mirrored.plan.pointMap);
  expect(target.constraints.filter(constraint => constraint.type === "symmetric")).toHaveLength(2);
  await expectRebuilt(extrude(mirrored.document), rectangle());
});
it("edits the source half-width after reopening and refreshes a full-width driven measurement", async () => {
  const mirrored = mirror(createSketchMirrorDocument()), target = profile(mirrored.document);
  target.constraints.push({ id: "full-width-reading", type: "distanceX", a: mirrored.plan.pointMap["bottom-right"], b: "bottom-right", value: 10, driven: true, referenceRole: "annotation" });
  const firstDocument = extrude(updateFeature(mirrored.document, SKETCH, { profile: solved(target).profile }));
  const first = engine.build(firstDocument.features);
  expect(first.featureErrors).toEqual([]);
  const changed = editDimension(parseDocument(serializeDocument(firstDocument)), "width", 7), solution = solved(profile(changed));
  expectHalfProfile(solution.profile, mirrored.plan.pointMap, 7);
  expect(solution.drivenValues["half-width-reading"]).toBeCloseTo(7, 7);
  expect(solution.drivenValues["full-width-reading"]).toBeCloseTo(14, 7);
  expect(profile(changed).constraints.find(constraint => constraint.id === "full-width-reading")).toMatchObject({ value: 10, driven: true });
  const result = await expectRebuilt(changed, rectangle(7));
  expect(result.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(result.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
});
it("retains the same solid when the construction axis endpoint order is reversed", async () => {
  const document = createSketchMirrorDocument(), axis = profile(document).entities.find(entity => entity.id === "axis");
  if (axis?.type !== "line") throw new Error("Axis expected");
  [axis.start, axis.end] = [axis.end, axis.start];
  const mirrored = mirror(document);
  expectHalfProfile(profile(mirrored.document), mirrored.plan.pointMap);
  await expectRebuilt(extrude(mirrored.document), rectangle());
});
it("records the entire associative mirror as one document-history change", () => {
  const source = createSketchMirrorDocument(), history = new DocumentHistory(source), mirrored = mirror(history.current);
  expect(history.canUndo).toBe(false); expect(history.current).toEqual(source);
  history.apply(mirrored.document);
  expect(history.canUndo).toBe(true); expect(history.current).toEqual(mirrored.document);
  expect(history.undo()).toEqual(source); expect(history.canUndo).toBe(false);
  expect(history.redo()).toEqual(mirrored.document); expect(history.canRedo).toBe(false);
});
it("keeps a downstream selected-edge fillet bound after editing the reopened source width", async () => {
  const mirrored = mirror(createSketchMirrorDocument()), base = extrude(mirrored.document), initial = engine.build(base.features);
  expect(initial.featureErrors).toEqual([]);
  const corner = initial.edges.filter(edge => edge.lines.every((value, index) => index % 3 === 0 ? Math.abs(value - 5) < coordinateTolerance : index % 3 === 1 ? Math.abs(value - 6) < coordinateTolerance : true));
  expect(corner).toHaveLength(1);
  const finished = addFeature(base, { id: "mirror-edge-fillet", name: "Redondeo de arista · R1", type: "fillet", baseFeatureId: EXTRUDE, size: 1, selection: { mode: "selected", edges: [corner[0].ref] }, suppressed: false });
  for (const width of [5, 7]) {
    const document = editDimension(parseDocument(serializeDocument(finished)), "width", width), result = engine.build(document.features);
    expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]);
    const expected = rectangle(width);
    // One extruded square-minus-quarter-disk corner is removed at R1.
    const step = (await importSTEP(engine.export("step"))).asShape3D();
    try { expectMetrics(measure(step), { ...expected, volume: expected.volume - 4 + Math.PI, area: expected.area - 10 + 2.5 * Math.PI }); }
    finally { step.delete(); }
  }
});

function circleDocument() {
  const document = createSketchMirrorDocument(), target = profile(document);
  target.points.push({ id: "hole-center", x: 3, y: 3 });
  target.entities.push({ id: "hole", type: "circle", center: "hole-center", radius: 1, construction: false });
  target.constraints.push(
    { id: "hole-x", type: "distanceX", a: "origin", b: "hole-center", value: 3 },
    { id: "hole-y", type: "distanceY", a: "origin", b: "hole-center", value: 3 },
    { id: "hole-radius", type: "radius", entityId: "hole", value: 1 },
  );
  return updateFeature(document, SKETCH, { profile: target });
}
it.each([1, 1.5])("reflects a circle as a second hole and keeps its associated radius R%s after reopening", async radius => {
  const mirrored = mirror(circleDocument(), ["bottom", "right", "top", "hole"]), reopened = parseDocument(serializeDocument(mirrored.document));
  const changed = editDimension(reopened, "hole-radius", radius), target = profile(changed);
  expectXY(target, "hole-center", 3, 3); expectXY(target, mirrored.plan.pointMap["hole-center"], -3, 3);
  const circles = target.entities.filter(entity => entity.type === "circle");
  expect(circles).toHaveLength(2);
  for (const circle of circles) expect(Math.abs(circle.radius - radius)).toBeLessThan(coordinateTolerance);
  expect(target.constraints.filter(constraint => constraint.type === "equal" && circles.some(circle => circle.id === constraint.a) && circles.some(circle => circle.id === constraint.b))).toHaveLength(1);
  // S=60−2πr²; P=32+4πr; extrusion: V=4S, A=2S+4P.
  await expectRebuilt(extrude(changed), {
    volume: 240 - 8 * Math.PI * radius ** 2,
    area: 248 - 4 * Math.PI * radius ** 2 + 16 * Math.PI * radius,
    bounds: [[-5, 0, 0], [5, 6, 4]],
  });
});
it.each([5, 7])("joins a reflected semicircle into a complete disk and propagates R%s", async radius => {
  const mirrored = mirror(createSketchMirrorArcDocument(), ["half-arc"], ["origin", "arc-bottom", "arc-top"]);
  const changed = editDimension(parseDocument(serializeDocument(mirrored.document)), "arc-radius", radius), target = profile(changed);
  const source = target.entities.find(entity => entity.id === "half-arc"), image = target.entities.find(entity => entity.id === mirrored.plan.imageEntityIds[0]);
  expect(source).toMatchObject({ type: "arc", center: "origin", start: "arc-bottom", end: "arc-top", clockwise: false });
  expect(image).toMatchObject({ type: "arc", center: "origin", start: "arc-bottom", end: "arc-top", clockwise: true });
  expectXY(target, "arc-bottom", 0, -radius); expectXY(target, "arc-top", 0, radius);
  await expectRebuilt(extrude(changed), { volume: 4 * Math.PI * radius ** 2, area: 2 * Math.PI * radius ** 2 + 8 * Math.PI * radius, bounds: [[-radius, -radius, 0], [radius, radius, 4]] });
});
it("preserves the 270° arc when reflecting two segment-shaped holes", async () => {
  const document = createSketchMirrorDocument(), target = profile(document);
  target.points.push({ id: "segment-center", x: 3, y: 3 }, { id: "segment-start", x: 4, y: 3 }, { id: "segment-end", x: 3, y: 2 });
  target.entities.push(
    { id: "segment-arc", type: "arc", center: "segment-center", start: "segment-start", end: "segment-end", clockwise: false, construction: false },
    { id: "segment-chord", type: "line", start: "segment-end", end: "segment-start", construction: false },
  );
  for (const id of ["segment-center", "segment-start", "segment-end"]) {
    const p = point(target, id); target.constraints.push({ id: `fix-${id}`, type: "fix", pointId: id, x: p.x, y: p.y });
  }
  const mirrored = mirror(updateFeature(document, SKETCH, { profile: target }), ["bottom", "right", "top", "segment-arc", "segment-chord"]), reflected = profile(mirrored.document);
  expectXY(reflected, mirrored.plan.pointMap["segment-center"], -3, 3);
  expectXY(reflected, mirrored.plan.pointMap["segment-start"], -4, 3);
  expectXY(reflected, mirrored.plan.pointMap["segment-end"], -3, 2);
  const imageArc = reflected.entities.find(entity => entity.type === "arc" && entity.id !== "segment-arc");
  expect(imageArc).toMatchObject({ clockwise: true, center: mirrored.plan.pointMap["segment-center"], start: mirrored.plan.pointMap["segment-start"], end: mirrored.plan.pointMap["segment-end"] });
  // Each major segment has area 3π/4+1/2 and perimeter 3π/2+√2.
  await expectRebuilt(extrude(mirrored.document), { volume: 236 - 6 * Math.PI, area: 246 + 9 * Math.PI + 8 * Math.SQRT2, bounds: [[-5, 0, 0], [5, 6, 4]] });
});
it("propagates a source arc winding edit after reopening and retains a complete disk", async () => {
  const mirrored = mirror(createSketchMirrorArcDocument(), ["half-arc"], ["origin", "arc-bottom", "arc-top"]);
  const imageId = mirrored.plan.imageEntityIds[0], reopened = parseDocument(serializeDocument(mirrored.document));
  const expected = { volume: 100 * Math.PI, area: 90 * Math.PI, bounds: [[-5, -5, 0], [5, 5, 4]] };
  let document = reopened;
  for (const clockwise of [true, false]) {
    const target = profile(parseDocument(serializeDocument(document))), source = target.entities.find(entity => entity.id === "half-arc");
    if (source?.type !== "arc") throw new Error("Arc expected");
    source.clockwise = clockwise;
    const before = structuredClone(target), solution = solved(target);
    expect(target).toEqual(before);
    expect(solution.profile.entities.find(entity => entity.id === imageId)).toMatchObject({ type: "arc", clockwise: !clockwise });
    expect(solution.profile.constraints).toContainEqual(expect.objectContaining({ type: "mirrorArcDirection", a: "half-arc", b: imageId, axisId: "axis" }));
    expect(solution.profile.entities.map(entity => entity.id)).toEqual(target.entities.map(entity => entity.id));
    expect(solution.profile.constraints.map(constraint => constraint.id)).toEqual(target.constraints.map(constraint => constraint.id));
    document = updateFeature(document, SKETCH, { profile: solution.profile });
    await expectRebuilt(extrude(document), expected);
  }
});
it("rejects an off-axis join without altering the persisted solid or its history", async () => {
  const mirrored = mirror(createSketchMirrorDocument()), document = extrude(mirrored.document), history = new DocumentHistory(document);
  const source = solved(profile(history.current)).profile, before = structuredClone(source), bytes = serializeDocument(history.current);
  const rejected = planSketchMirror(source, [{ kind: "entity", id: "right" }], { axisEntityId: "axis", joinPointIds: ["bottom-right"] });
  expect(rejected.changed).toBe(false); expect(rejected.sourceProfile).toBe(source); expect(rejected.profile).toBe(source);
  expect(rejected.imageEntityIds).toEqual([]); expect(source).toEqual(before);
  expect(serializeDocument(history.current)).toBe(bytes); expect(history.canUndo).toBe(false);
  await expectRebuilt(history.current, rectangle());
});
