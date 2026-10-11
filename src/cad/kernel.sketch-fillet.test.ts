import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import {
  getOC,
  importSTEP,
  measureShapeSurfaceProperties,
  measureShapeVolumeProperties,
  setOC,
} from "replicad";
import { CadEngine } from "./kernel.engine";
import { createFilletSketchDocument } from "../examples/sketch-fillet";
import { parseDocument, serializeDocument, updateFeature, type Document } from "../model/document";
import { planSketchFillet } from "../sketch/fillet";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile } from "../sketch/types";

const engine = new CadEngine();
beforeAll(async () => {
  setOC(await initOpenCascade({
    wasmBinary: await readFile(createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm")),
    print: () => undefined,
  }));
}, 60_000);
afterEach(() => engine.dispose());

it("rebuilds the exact browser-saved pair of linked R1 fillets", async () => {
  const bytes = await readFile(new URL("./fixtures/solidflow-ui/sketch-fillet-linked-r1.solidflow", import.meta.url));
  expect(bytes.byteLength).toBe(5810);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("26df431bdb33e008f6120aacc147e83a44261528a5e491203c3e6f46901fb5ba");
  const document = parseDocument(bytes.toString("utf8"));
  const resolved = solved(document);
  const arcs = resolved.entities.filter(entity => entity.type === "arc");
  expect(arcs).toHaveLength(2);
  expect(resolved.constraints.some(constraint => constraint.type === "equal" &&
    arcs.some(arc => arc.id === constraint.a) && arcs.some(arc => arc.id === constraint.b))).toBe(true);
  const radii = arcs.map(arc => {
    const center = resolved.points.find(point => point.id === arc.center)!;
    const start = resolved.points.find(point => point.id === arc.start)!;
    return Math.hypot(start.x - center.x, start.y - center.y);
  });
  radii.forEach(radius => expect(radius).toBeCloseTo(1, 6));
  await expectReopenedSolid(document, 232 + 2 * Math.PI, 228 + 5 * Math.PI, 10, 6, 6);
});

function profile(document: Document): EntityProfile {
  const sketch = document.features.find(item => item.id === "fillet-sketch");
  if (sketch?.type !== "sketch" || sketch.profile.kind !== "entities")
    throw new Error("Entity sketch expected");
  return sketch.profile;
}

function solved(document: Document) {
  const solution = solveSketch(profile(document));
  expect(solution.status, solution.message).toBe("fullyDefined");
  expect(solution.degreesOfFreedom).toBe(0);
  expect(solution.conflictingConstraintIds).toEqual([]);
  return solution.profile;
}

function build(document: Document) {
  const before = structuredClone(document);
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(document).toEqual(before);
  return result;
}

function expectBounds(actual: number[][], width = 10, height = 6) {
  const expected = [[0, 0, 0], [width, height, 4]];
  for (let side = 0; side < 2; side++)
    for (let axis = 0; axis < 3; axis++)
      expect(actual[side][axis]).toBeCloseTo(expected[side][axis], 5);
}

async function expectStep(volume: number, area: number, width = 10, height = 6) {
  const shape = (await importSTEP(engine.export("step"))).asShape3D();
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  const mass = measureShapeVolumeProperties(shape);
  const surface = measureShapeSurfaceProperties(shape);
  const bounds = shape.boundingBox;
  const solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true);
    expect(solids).toHaveLength(1);
    expect(mass.volume).toBeCloseTo(volume, 5);
    expect(surface.area).toBeCloseTo(area, 5);
    expectBounds(bounds.bounds, width, height);
  } finally {
    solids.forEach(solid => solid.delete());
    bounds.delete();
    surface.delete();
    mass.delete();
    analyzer.delete();
    shape.delete();
  }
}

function prepare() {
  const source = createFilletSketchDocument();
  const resolved = solved(source);
  const before = structuredClone(resolved);
  const serialized = serializeDocument(source);
  const plan = planSketchFillet(resolved, [{ kind: "point", id: "origin" }], {
    radius: 2,
    cornerPolicy: "keep",
  });
  expect(plan.changed, plan.message).toBe(true);
  expect(plan.filletEntityId).not.toBeNull();
  expect(plan.sourceProfile).toBe(resolved);
  expect(plan.profile).not.toBe(resolved);
  expect(resolved).toEqual(before);
  expect(serializeDocument(source)).toBe(serialized);
  return {
    document: updateFeature(source, "fillet-sketch", { profile: plan.profile }),
    filletEntityId: plan.filletEntityId!,
  };
}

function expectOriginArc(target: EntityProfile, id: string, radius: number) {
  const arc = target.entities.find(entity => entity.id === id);
  if (arc?.type !== "arc") throw new Error("Fillet arc expected");
  const center = target.points.find(point => point.id === arc.center)!;
  expect(center.x).toBeCloseTo(radius, 6);
  expect(center.y).toBeCloseTo(radius, 6);
  const endpoints = [arc.start, arc.end].map(pointId => target.points.find(point => point.id === pointId)!);
  endpoints.sort((a, b) => a.x - b.x);
  for (const [point, xy] of [[endpoints[0], [0, radius]], [endpoints[1], [radius, 0]]] as const) {
    expect(point.x).toBeCloseTo(xy[0], 6);
    expect(point.y).toBeCloseTo(xy[1], 6);
  }
}

async function expectReopenedSolid(document: Document, volume: number, area: number, width = 10, height = 6, contourSegments = 5) {
  solved(document);
  const first = build(document);
  expect(first.volume).toBeCloseTo(volume, 5);
  expectBounds([first.bounds.min, first.bounds.max], width, height);
  expect(first.faces).toHaveLength(contourSegments + 2);
  expect(first.edges).toHaveLength(contourSegments * 3);
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  solved(reopened);
  const restored = build(reopened);
  expect(restored.volume).toBeCloseTo(volume, 5);
  expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  await expectStep(volume, area, width, height);
}

it("builds the independent fully defined 10×6×4 example as a 240 mm³ box", async () => {
  const document = createFilletSketchDocument();
  solved(document);
  const result = build(document);
  expect(result.volume).toBeCloseTo(240, 5);
  expect(result.faces).toHaveLength(6);
  expect(result.edges).toHaveLength(12);
  expectBounds([result.bounds.min, result.bounds.max]);
  await expectStep(240, 248);
});

it("reopens an R2 origin fillet with analytical quarter-circle mass, surface and stable references", async () => {
  const { document, filletEntityId } = prepare();
  expectOriginArc(solved(document), filletEntityId, 2);
  // Removed area = 2² − π2²/4. Remaining perimeter = 32 − 4 + π.
  await expectReopenedSolid(document, 224 + 4 * Math.PI, 224 + 6 * Math.PI);
});

it("rebuilds an edited R1 radius from saved R2 seeds without moving the original extents", async () => {
  const { document, filletEntityId } = prepare();
  const radius = profile(document).constraints.find(constraint => constraint.type === "radius" && constraint.entityId === filletEntityId);
  if (radius?.type !== "radius") throw new Error("Editable fillet radius expected");
  expect(radius.driven).not.toBe(true);
  expect(radius.value).toBe(2);
  radius.value = 1;
  const reopened = parseDocument(serializeDocument(document));
  expectOriginArc(solved(reopened), filletEntityId, 1);
  // Remaining area = 59 + π/4; perimeter = 30 + π/2; depth = 4.
  await expectReopenedSolid(reopened, 236 + Math.PI, 238 + 2.5 * Math.PI);
});

it("keeps the original 10/6 driving dimensions editable and rebuilds a 14×8 plate with the same R2 fillet", async () => {
  const { document, filletEntityId } = prepare();
  const target = profile(document);
  for (const [id, original, next] of [["plate-width", 10, 14], ["plate-height", 6, 8]] as const) {
    const dimension = target.constraints.find(constraint => constraint.id === id);
    if (!dimension || !("value" in dimension)) throw new Error("Original plate dimension expected");
    expect(dimension.value).toBe(original);
    dimension.value = next;
  }
  expect(target.points.find(point => point.id === "top-right")).toMatchObject({ x: 10, y: 6 });
  const reopened = parseDocument(serializeDocument(document));
  const resolved = solved(reopened);
  expectOriginArc(resolved, filletEntityId, 2);
  const opposite = resolved.points.find(point => point.id === "top-right")!;
  expect(opposite.x).toBeCloseTo(14, 6);
  expect(opposite.y).toBeCloseTo(8, 6);
  // Remaining area = 108 + π; perimeter = 40 + π; depth = 4.
  await expectReopenedSolid(reopened, 432 + 4 * Math.PI, 376 + 6 * Math.PI, 14, 8);
});

it("links consecutive opposite-corner radii and rebuilds both fillets after one radius is edited and reopened", async () => {
  const first = prepare();
  const resolved = solved(first.document);
  const before = structuredClone(resolved);
  const second = planSketchFillet(resolved, [{ kind: "point", id: "top-right" }], {
    radius: 2,
    cornerPolicy: "keep",
    equalRadiusEntityId: first.filletEntityId,
  });
  expect(second.changed, second.message).toBe(true);
  expect(second.filletEntityId).not.toBeNull();
  expect(resolved).toEqual(before);
  const document = updateFeature(first.document, "fillet-sketch", { profile: second.profile });
  // Two disjoint quarter-circle corners remove twice the single-corner area.
  await expectReopenedSolid(document, 208 + 8 * Math.PI, 200 + 12 * Math.PI, 10, 6, 6);

  const radius = profile(document).constraints.find(constraint => constraint.type === "radius" && constraint.entityId === first.filletEntityId);
  if (radius?.type !== "radius") throw new Error("Original editable radius expected");
  radius.value = 1;
  const reopened = parseDocument(serializeDocument(document));
  const adjusted = solved(reopened);
  expectOriginArc(adjusted, first.filletEntityId, 1);
  const linkedArc = adjusted.entities.find(entity => entity.id === second.filletEntityId);
  if (linkedArc?.type !== "arc") throw new Error("Linked fillet arc expected");
  const center = adjusted.points.find(point => point.id === linkedArc.center)!;
  expect(center.x).toBeCloseTo(9, 6);
  expect(center.y).toBeCloseTo(5, 6);
  const endpoints = [linkedArc.start, linkedArc.end].map(id => adjusted.points.find(point => point.id === id)!);
  endpoints.sort((a, b) => a.x - b.x);
  expect(endpoints[0].x).toBeCloseTo(9, 6);
  expect(endpoints[0].y).toBeCloseTo(6, 6);
  expect(endpoints[1].x).toBeCloseTo(10, 6);
  expect(endpoints[1].y).toBeCloseTo(5, 6);
  await expectReopenedSolid(reopened, 232 + 2 * Math.PI, 228 + 5 * Math.PI, 10, 6, 6);
});

it("reconstructs a closed line–arc fillet with a fixed R5 support and independently integrated mass and area", async () => {
  const source = createFilletSketchDocument("curved");
  const resolved = solved(source);
  const alpha = Math.atan2(3, 4);
  // The unfilleted left boundary removes an R5 circular segment from the box.
  const initialArea = 72 - 25 * alpha;
  const initialPerimeter = 26 + 10 * alpha;
  const initial = build(source);
  expect(initial.volume).toBeCloseTo(4 * initialArea, 5);
  expect(initial.faces).toHaveLength(6);
  expect(initial.edges).toHaveLength(12);
  await expectStep(4 * initialArea, 2 * initialArea + 4 * initialPerimeter);
  const before = structuredClone(resolved);
  const plan = planSketchFillet(resolved, [{ kind: "point", id: "origin" }], {
    radius: 1,
    cornerPolicy: "keep",
  });
  expect(plan.changed, plan.message).toBe(true);
  expect(resolved).toEqual(before);
  const document = updateFeature(source, "fillet-sketch", { profile: plan.profile });
  const solution = solved(document);
  const support = solution.entities.find(entity => entity.id === "left");
  if (support?.type !== "arc") throw new Error("Original circular support expected");
  const supportCenter = solution.points.find(point => point.id === support.center)!;
  expect(supportCenter.x).toBeCloseTo(-4, 6);
  expect(supportCenter.y).toBeCloseTo(3, 6);
  const arc = solution.entities.find(entity => entity.id === plan.filletEntityId);
  if (arc?.type !== "arc") throw new Error("Tangent fillet arc expected");
  const center = solution.points.find(point => point.id === arc.center)!;
  expect(center.x).toBeCloseTo(-4 + 4 * Math.SQRT2, 6);
  expect(center.y).toBeCloseTo(1, 6);
  const contacts = [arc.start, arc.end].map(id => solution.points.find(point => point.id === id)!);
  contacts.sort((a, b) => a.y - b.y);
  expect(contacts[0].x).toBeCloseTo(-4 + 4 * Math.SQRT2, 6);
  expect(contacts[0].y).toBeCloseTo(0, 6);
  expect(contacts[1].x).toBeCloseTo(-4 + 10 * Math.SQRT2 / 3, 6);
  expect(contacts[1].y).toBeCloseTo(4 / 3, 6);
  // Green integration of three straight edges, the clockwise R5 support and
  // the new counterclockwise R1 arc. All inputs below are analytical constants,
  // independent of the planner's output and the kernel's boundary helpers.
  const beta = Math.asin(1 / 3);
  const planarArea = 78 - 8 * Math.SQRT2 - 12.5 * alpha - 12 * beta + Math.PI / 4;
  const perimeter = 30 - 4 * Math.SQRT2 + 5 * alpha + 6 * beta + Math.PI / 2;
  await expectReopenedSolid(document, 4 * planarArea, 2 * planarArea + 4 * perimeter);
});
