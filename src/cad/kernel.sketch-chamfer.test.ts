import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
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
import { createChamferSketchDocument } from "../examples/sketch-chamfer";
import {
  parseDocument,
  serializeDocument,
  updateFeature,
  type Document,
} from "../model/document";
import { planSketchChamfer, type ChamferParameters } from "../sketch/chamfer";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile } from "../sketch/types";
import type { CadResult } from "./kernel.types";

const engine = new CadEngine();
beforeAll(async () => {
  setOC(await initOpenCascade({
    wasmBinary: await readFile(createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm")),
    print: () => undefined,
  }));
}, 60_000);
afterEach(() => engine.dispose());

function profile(document: Document): EntityProfile {
  const feature = document.features.find(item => item.id === "chamfer-sketch");
  if (feature?.type !== "sketch" || feature.profile.kind !== "entities")
    throw new Error("Entity sketch expected");
  return feature.profile;
}

function build(document: Document): CadResult {
  const original = structuredClone(document);
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(document).toEqual(original);
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
  const box = shape.boundingBox;
  const solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true);
    expect(solids).toHaveLength(1);
    expect(mass.volume).toBeCloseTo(volume, 5);
    expect(surface.area).toBeCloseTo(area, 5);
    expectBounds(box.bounds, width, height);
  } finally {
    solids.forEach(solid => solid.delete());
    box.delete();
    surface.delete();
    mass.delete();
    analyzer.delete();
    shape.delete();
  }
}

function prepare(parameters: ChamferParameters) {
  const document = createChamferSketchDocument();
  const initial = solveSketch(profile(document));
  expect(initial.status, initial.message).toBe("fullyDefined");
  expect(initial.degreesOfFreedom).toBe(0);
  const snapshot = serializeDocument(document);
  // Cutting the origin exercises both original driving lengths and the
  // immutable anchor, rather than an unconstrained free corner.
  const plan = planSketchChamfer(initial.profile, [{ kind: "point", id: "origin" }], parameters);
  expect(plan.changed, plan.message).toBe(true);
  expect(serializeDocument(document)).toBe(snapshot);
  const edited = updateFeature(document, "chamfer-sketch", { profile: plan.profile });
  return { document: edited, plan };
}

it.each([
  {
    parameters: { mode: "distances", distance1: 2, distance2: 3 } as ChamferParameters,
    volume: 228,
    area: 222 + 4 * Math.sqrt(13),
  },
  {
    parameters: { mode: "equal", distance: 2 } as ChamferParameters,
    volume: 232,
    area: 228 + 8 * Math.sqrt(2),
  },
  {
    parameters: { mode: "angle", distance: 2, angle: 30 } as ChamferParameters,
    volume: 240 - 8 / Math.sqrt(3),
    area: 240 + 4 / Math.sqrt(3),
  },
])("builds and reopens a 10×6×4 plate in $parameters.mode mode with independent mass and surface oracles", async fixture => {
  // A right-corner chamfer removes a triangular prism. Surface area is twice
  // the remaining polygon area plus its perimeter times the 4 mm depth.
  const { document } = prepare(fixture.parameters);
  const solution = solveSketch(profile(document));
  expect(solution.status, solution.message).toBe("fullyDefined");
  expect(solution.degreesOfFreedom).toBe(0);
  expect(solution.conflictingConstraintIds).toEqual([]);
  const first = build(document);
  expect(first.volume).toBeCloseTo(fixture.volume, 5);
  expectBounds([first.bounds.min, first.bounds.max]);
  expect(first.faces).toHaveLength(7);
  expect(first.edges).toHaveLength(15);

  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  const restored = build(reopened);
  expect(restored.volume).toBeCloseTo(fixture.volume, 5);
  expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
  await expectStep(fixture.volume, fixture.area);
});

it("keeps the origin and both original plate dimensions editable, then rebuilds a changed chamfer setback after reopening stale seeds", async () => {
  const { document, plan } = prepare({ mode: "equal", distance: 2 });
  const original = build(document);
  expect(original.volume).toBeCloseTo(232, 5);
  const target = profile(document);
  for (const [id, before, after] of [["plate-width", 10, 14], ["plate-height", 6, 8]] as const) {
    const dimension = target.constraints.find(item => item.id === id);
    if (!dimension || !("value" in dimension)) throw new Error("Original dimension missing");
    expect(dimension.value).toBe(before);
    dimension.value = after;
  }
  // Coordinates remain those of the 10×6 source; the driving parameters alone
  // must rebuild a 14×8 plate while retaining the 2×2 triangular corner cut.
  expect(target.points.find(point => point.id === "top-right")).toMatchObject({ x: 10, y: 6 });
  const reopened = parseDocument(serializeDocument(document));
  const solution = solveSketch(profile(reopened));
  expect(solution.status, solution.message).toBe("fullyDefined");
  expect(solution.degreesOfFreedom).toBe(0);
  expect(solution.profile.points.find(point => point.id === "bottom-right")?.x).toBeCloseTo(14, 6);
  expect(solution.profile.points.find(point => point.id === "bottom-right")?.y).toBeCloseTo(0, 6);
  expect(solution.profile.points.find(point => point.id === "top-left")?.x).toBeCloseTo(0, 6);
  expect(solution.profile.points.find(point => point.id === "top-left")?.y).toBeCloseTo(8, 6);
  const resized = build(reopened);
  expect(resized.volume).toBeCloseTo(440, 5);
  expectBounds([resized.bounds.min, resized.bounds.max], 14, 8);

  // The generated setback remains an ordinary editable dimension. Equality
  // updates its partner, so a 1×1 cut removes exactly 2 mm³ from the 448 mm³ box.
  const setback = profile(reopened).constraints.find(item => plan.createdConstraintIds.includes(item.id) && item.type === "length");
  if (setback?.type !== "length") throw new Error("Chamfer setback missing");
  setback.value = 1;
  const adjusted = parseDocument(serializeDocument(reopened));
  const adjustedSolution = solveSketch(profile(adjusted));
  expect(adjustedSolution.status, adjustedSolution.message).toBe("fullyDefined");
  expect(adjustedSolution.degreesOfFreedom).toBe(0);
  const result = build(adjusted);
  expect(result.volume).toBeCloseTo(446, 5);
  expectBounds([result.bounds.min, result.bounds.max], 14, 8);
  // Polygon area 111.5; perimeter 44−2+√2; depth 4.
  await expectStep(446, 391 + 4 * Math.sqrt(2), 14, 8);
});

it("reopens the exact browser-saved 2×3 origin chamfer and exports a valid single-solid STEP", async () => {
  // This is the actual browser download, not a plan regenerated by this test.
  const bytes = await readFile(new URL("./fixtures/solidflow-ui/sketch-chamfer-distances-2-3.solidflow", import.meta.url));
  expect(bytes.byteLength).toBe(4092);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("8b8f27f25606f4a7dc8e4c9fc8208772e44d54108fa0187ca249d765b517c6f1");
  const document = parseDocument(bytes.toString("utf8"));
  const solution = solveSketch(profile(document));
  expect(solution.status, solution.message).toBe("fullyDefined");
  expect(solution.degreesOfFreedom).toBe(0);
  expect(solution.conflictingConstraintIds).toEqual([]);
  expect(solution.profile.points.find(point => point.id === "chamfer-point-1")).toMatchObject({ x: 2, y: 0 });
  expect(solution.profile.points.find(point => point.id === "chamfer-point-2")).toMatchObject({ x: 0, y: 3 });

  // 10×6×4 minus the 2×3/2 triangular prism: 228 mm³.
  const result = build(document);
  expect(result.volume).toBeCloseTo(228, 5);
  expectBounds([result.bounds.min, result.bounds.max]);
  expect(result.faces).toHaveLength(7);
  expect(result.edges).toHaveLength(15);
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  const restored = build(reopened);
  expect(restored.volume).toBeCloseTo(228, 5);
  expect(restored.faces?.map(face => face.ref)).toEqual(result.faces?.map(face => face.ref));
  expect(restored.edges.map(edge => edge.ref)).toEqual(result.edges.map(edge => edge.ref));
  // Polygon area 57; perimeter 27+√13; depth 4.
  await expectStep(228, 222 + 4 * Math.sqrt(13));
});
