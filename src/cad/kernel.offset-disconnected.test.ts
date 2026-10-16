import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import { getOC, localGC, measureShapeSurfaceProperties, setOC, type Shape3D } from "replicad";
import { CadEngine } from "./kernel.engine";
import type { CadResult } from "./kernel.types";
import { importStepSolid } from "./kernel.step";
import { createStepSource } from "../model/stepSource";
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from "../model/document";
import { planSketchOffset, type OffsetParameters } from "../sketch/offset";
import { solveOffsetApplication } from "../sketch/offsetApplication";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile } from "../sketch/types";

// Original in-memory fixtures in mm: a 50 x 20 plate and two circular holes.
// Expectations use rectangle/circle formulas, independently of the planner.
// STEP writer/reader share OCCT; this is not independent interoperability or UI evidence.
const engine = new CadEngine();
const sketchId = "disconnected-sketch", solidId = "disconnected-solid";
const coordinateTolerance = 5e-7, cadTolerance = 5e-6;
const parameters: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: true, cap: "none", construction: "source", addDimensions: true };
type Metrics = { volume: number; area: number; bounds: readonly (readonly number[])[] };

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm")),
  print: () => undefined, printErr: () => undefined,
})), 60_000);
afterEach(() => engine.dispose());

function profile(document: Document): EntityProfile {
  const feature = document.features.find(feature => feature.id === sketchId);
  if (feature?.type !== "sketch" || feature.profile.kind !== "entities") throw new Error("Entity sketch expected");
  return feature.profile;
}
function healthy(target: EntityProfile) {
  const before = structuredClone(target), result = solveSketch(target);
  expect(target).toEqual(before);
  expect(["fullyDefined", "underdefined"], result.message).toContain(result.status);
  expect(result.conflictingConstraintIds).toEqual([]);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function plate(radiusA = 3, radiusB = 5): Document {
  const corners = [{ id: "plate-a", x: -10, y: -10 }, { id: "plate-b", x: 40, y: -10 },
    { id: "plate-c", x: 40, y: 10 }, { id: "plate-d", x: -10, y: 10 }];
  const target: EntityProfile = {
    kind: "entities", points: [...corners, { id: "center-b", x: 20, y: 0 }],
    entities: [...corners.map((corner, index) => ({ id: `plate-edge-${index}`, type: "line" as const, start: corner.id,
      end: corners[(index + 1) % corners.length].id, construction: false })),
    { id: "circle-a", type: "circle", center: "origin", radius: radiusA, construction: false },
    { id: "circle-b", type: "circle", center: "center-b", radius: radiusB, construction: false }],
    constraints: [...corners.map(corner => ({ id: `fixed-${corner.id}`, type: "fix" as const, pointId: corner.id, x: corner.x, y: corner.y })),
    { id: "fixed-center-b", type: "fix", pointId: "center-b", x: 20, y: 0 },
    { id: "radius-a", type: "radius", entityId: "circle-a", value: radiusA },
    { id: "radius-b", type: "radius", entityId: "circle-b", value: radiusB }],
  };
  return validateDocument({ ...createDocument("Original plate with two offset holes"), features: [
    { id: sketchId, name: "Two hole supports", type: "sketch", plane: "XY", offset: 0, suppressed: false, profile: target },
  ] });
}
function apply(document: Document, options: Partial<OffsetParameters> = {}, ids = ["circle-a", "circle-b"]) {
  const bytes = serializeDocument(document), current = healthy(profile(document)), before = structuredClone(current.profile);
  const plan = planSketchOffset(current.profile, ids.map(id => ({ kind: "entity", id })), { ...parameters, ...options });
  expect(plan.changed, plan.message).toBe(true);
  expect(plan.sourceProfile).toBe(current.profile);
  expect(current.profile).toEqual(before);
  expect(serializeDocument(document)).toBe(bytes);
  const application = solveOffsetApplication(current, plan);
  if (!application.accepted) throw new Error(application.message);
  return updateFeature(document, sketchId, { profile: application.solution.profile });
}
function extrude(document: Document) {
  return addFeature(document, { id: solidId, name: "Plate thickness 4 mm", type: "extrude", sketchId, depth: 4, symmetric: false, suppressed: false });
}
function imageId(document: Document, sourceId: string): string {
  const relation = profile(document).constraints.find(constraint => constraint.type === "offset" && constraint.sources.some(source => source.entityId === sourceId));
  if (relation?.type !== "offset" || relation.images.length !== 1 || relation.images[0].entityIds.length !== 1) throw new Error("Single circular image expected");
  return relation.images[0].entityIds[0];
}
function expectCircle(document: Document, id: string, radius: number, x: number, y: number) {
  const target = profile(document), entity = target.entities.find(entity => entity.id === id);
  if (entity?.type !== "circle") throw new Error("Circle expected");
  const center = entity.center === "origin" ? { x: 0, y: 0 } : target.points.find(point => point.id === entity.center)!;
  expect(Math.abs(entity.radius - radius)).toBeLessThan(coordinateTolerance);
  expect(Math.abs(center.x - x)).toBeLessThan(coordinateTolerance);
  expect(Math.abs(center.y - y)).toBeLessThan(coordinateTolerance);
}
function expectHoles(document: Document, radiusA: number, radiusB: number) {
  expectCircle(document, imageId(document, "circle-a"), radiusA, 0, 0);
  expectCircle(document, imageId(document, "circle-b"), radiusB, 20, 0);
}
function distanceId(document: Document) {
  const dimensions = profile(document).constraints.filter(constraint => constraint.type === "offsetDistance");
  expect(dimensions).toHaveLength(1);
  return dimensions[0].id;
}
function edit(document: Document, id: string, value: number) {
  const target = structuredClone(profile(document)), dimension = target.constraints.find(constraint => constraint.id === id);
  if (!dimension || (dimension.type !== "offsetDistance" && dimension.type !== "radius") || dimension.driven) throw new Error("Driving dimension expected");
  dimension.value = value;
  return updateFeature(document, sketchId, { profile: healthy(target).profile });
}
function expected(radiusA: number, radiusB: number): Metrics {
  // S = 1000 - pi*(rA^2+rB^2), P = 140 + 2*pi*(rA+rB).
  // At thickness 4, V = 4*S and A = 2*S + 4*P.
  const area = 1000 - Math.PI * (radiusA ** 2 + radiusB ** 2), perimeter = 140 + 2 * Math.PI * (radiusA + radiusB);
  return { volume: 4 * area, area: 2 * area + 4 * perimeter, bounds: [[-10, -10, 0], [40, 10, 4]] };
}
function outerReferences(result: CadResult) {
  const faces = result.faces?.filter(face => face.frame && Math.abs(face.frame.normal[2]) < coordinateTolerance) ?? [];
  const edges = result.edges.filter(edge => edge.lines.length >= 6 && edge.lines.every((x, index) => index % 3 !== 0 ||
    Math.abs(x + 10) < coordinateTolerance || Math.abs(x - 40) < coordinateTolerance || Math.abs(Math.abs(edge.lines[index + 1]) - 10) < coordinateTolerance));
  expect(faces).toHaveLength(4); expect(edges).toHaveLength(12);
  return { faces: faces.map(face => face.ref), edges: edges.map(edge => edge.ref) };
}
function measure(shape: Shape3D): Metrics {
  const [own, cleanup] = localGC();
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape)), box = own(shape.boundingBox), solids = shape.solids;
    solids.forEach(own);
    expect(solids).toHaveLength(1);
    expect(analyzer.IsValid()).toBe(true);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    return { volume: mass.Mass(), area: surface.area, bounds: box.bounds };
  } finally { cleanup(); }
}
function expectMetrics(actual: Metrics, wanted: Metrics) {
  expect(Math.abs(actual.volume - wanted.volume)).toBeLessThan(cadTolerance);
  expect(Math.abs(actual.area - wanted.area)).toBeLessThan(cadTolerance);
  actual.bounds.forEach((side, i) => side.forEach((value, j) => expect(Math.abs(value - wanted.bounds[i][j])).toBeLessThan(cadTolerance)));
}
async function rebuilt(document: Document, wanted: Metrics) {
  const before = structuredClone(document), first = engine.build(document.features);
  expect(document).toEqual(before);
  expect(first.featureErrors).toEqual([]); expect(first.warnings).toEqual([]);
  expect(Math.abs(first.volume - wanted.volume)).toBeLessThan(cadTolerance);
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  const restored = engine.build(reopened.features);
  expect(restored.featureErrors).toEqual([]); expect(restored.warnings).toEqual([]);
  expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  const step = importStepSolid(createStepSource(new Uint8Array(await engine.export("step", reopened.features).arrayBuffer())));
  try { expectMetrics(measure(step), wanted); } finally { step.delete(); }
  return first;
}

it.each([["circle-a", "circle-b"], ["circle-b", "circle-a"]])("builds both unequal offset holes together for selection %s then %s", async (first, second) => {
  const source = plate(), history = new DocumentHistory(source), before = serializeDocument(source);
  const result = apply(history.current, {}, [first, second]);
  expectHoles(result, 5, 7);
  expectCircle(result, "circle-a", 3, 0, 0); expectCircle(result, "circle-b", 5, 20, 0);
  distanceId(result);
  history.apply(result);
  expect(serializeDocument(history.undo())).toBe(before);
  expect(history.canUndo).toBe(false);
  expect(serializeDocument(history.redo())).toBe(serializeDocument(result));
  await rebuilt(extrude(history.current), expected(5, 7));
}, 60_000);

it("updates both holes through one saved distance and retains unchanged outer-boundary references", async () => {
  const result = apply(plate(2, 5), { distance: 1 }), original = await rebuilt(extrude(result), expected(3, 6));
  const changed = edit(parseDocument(serializeDocument(result)), distanceId(result), 1.5);
  expectHoles(changed, 3.5, 6.5);
  expectCircle(changed, "circle-a", 2, 0, 0); expectCircle(changed, "circle-b", 5, 20, 0);
  const after = await rebuilt(extrude(changed), expected(3.5, 6.5));
  expect(outerReferences(after)).toEqual(outerReferences(original));
  const sourceEdited = edit(parseDocument(serializeDocument(changed)), "radius-a", 2.25);
  expectHoles(sourceEdited, 3.75, 6.5);
  const final = await rebuilt(extrude(sourceEdited), expected(3.75, 6.5));
  expect(outerReferences(final)).toEqual(outerReferences(after));
}, 60_000);

it("rebuilds a selected outer-corner fillet after common-distance and source-radius edits", async () => {
  const result = apply(plate(2, 5), { distance: 1 }), base = extrude(result), first = engine.build(base.features);
  expect(first.featureErrors).toEqual([]);
  const corner = first.edges.filter(edge => edge.lines.length >= 6 && edge.lines.every((value, index) =>
    index % 3 === 0 ? Math.abs(value - 40) < coordinateTolerance : index % 3 === 1 ? Math.abs(value - 10) < coordinateTolerance : true));
  expect(corner).toHaveLength(1);
  const finished = addFeature(base, { id: "disconnected-fillet", name: "Outer corner R1", type: "fillet", baseFeatureId: solidId,
    size: 1, selection: { mode: "selected", edges: [corner[0].ref] }, suppressed: false });
  for (const [distance, sourceRadius] of [[1, 2], [1.5, 2], [1.5, 2.25]]) {
    const changed = edit(edit(parseDocument(serializeDocument(finished)), distanceId(result), distance), "radius-a", sourceRadius);
    const bare = expected(sourceRadius + distance, 5 + distance);
    // R1 rounding removes one square-minus-quarter-disk prism at height 4.
    await rebuilt(changed, { ...bare, volume: bare.volume - 4 + Math.PI, area: bare.area - 10 + 2.5 * Math.PI });
  }
}, 60_000);

it("requires reselecting a resized hole edge saved with a v1 reference instead of silently rebinding its fillet", () => {
  const result = apply(plate(2, 5), { distance: 1 }), base = extrude(result), first = engine.build(base.features);
  expect(first.featureErrors).toEqual([]);
  const rim = first.edges.filter(edge => edge.lines.length > 6 && edge.lines.every((x, index) => index % 3 !== 0 ||
    Math.abs(Math.hypot(x, edge.lines[index + 1]) - 3) < coordinateTolerance && Math.abs(edge.lines[index + 2] - 4) < coordinateTolerance));
  expect(rim).toHaveLength(1);
  const legacy = rim[0].aliases?.find(reference => reference.key.startsWith('edge-v1|')) ?? rim[0].ref;
  expect(legacy.key).toMatch(/^edge-v1\|/);
  const finished = addFeature(base, { id: "hole-rim-fillet", name: "Hole rim R0.25", type: "fillet", baseFeatureId: solidId,
    size: 0.25, selection: { mode: "selected", edges: [legacy] }, suppressed: false });
  expect(engine.build(finished.features).featureErrors).toEqual([]);
  const changed = edit(parseDocument(serializeDocument(finished)), distanceId(result), 1.5), before = serializeDocument(changed);
  const stale = engine.build(changed.features);
  expect(stale.featureErrors).toHaveLength(1);
  expect(stale.featureErrors[0].id).toBe("hole-rim-fillet");
  expect(stale.featureErrors[0].message).toMatch(/identificar|topolog/i);
  expect(() => engine.export("step", changed.features)).toThrow(/errores/);
  expect(serializeDocument(changed)).toBe(before);
}, 60_000);

it.each(["absent", "driven", "deleted"] as const)("keeps the shared separation geometric when its distance is %s", async mode => {
  const result = apply(plate(2, 5), { distance: 1, addDimensions: mode !== "absent" });
  const target = structuredClone(profile(parseDocument(serializeDocument(result))));
  if (mode === "deleted") target.constraints = target.constraints.filter(constraint => constraint.type !== "offsetDistance");
  if (mode === "driven") {
    const dimension = target.constraints.find(constraint => constraint.type === "offsetDistance");
    if (dimension?.type !== "offsetDistance") throw new Error("Distance expected");
    dimension.driven = true;
  }
  // An original new radius target on one image must move the other image too.
  target.constraints.push({ id: "image-radius-target", type: "radius", entityId: imageId(result, "circle-a"), value: 4 });
  const changed = updateFeature(result, sketchId, { profile: healthy(target).profile });
  expectHoles(changed, 4, 7);
  expectCircle(changed, "circle-a", 2, 0, 0); expectCircle(changed, "circle-b", 5, 20, 0);
  if (mode === "driven") expect(profile(changed).constraints.find(constraint => constraint.type === "offsetDistance"))
    .toMatchObject({ driven: true, value: 1 });
  await rebuilt(extrude(changed), expected(4, 7));
}, 60_000);

it("rejects invalid global material after a shared edit instead of exporting an earlier valid plate", async () => {
  const result = apply(plate(2, 5), { distance: 1 }), valid = extrude(result);
  await rebuilt(valid, expected(3, 6));
  const changed = extrude(edit(result, distanceId(result), 6)), bytes = serializeDocument(changed);
  expectHoles(changed, 8, 11);
  const invalid = engine.build(changed.features);
  expect(invalid.featureErrors).toHaveLength(1);
  expect(invalid.featureErrors[0].id).toBe(solidId);
  expect(invalid.volume).toBe(0);
  expect(() => engine.export("step", changed.features)).toThrow(/errores/);
  expect(serializeDocument(changed)).toBe(bytes);
}, 60_000);
