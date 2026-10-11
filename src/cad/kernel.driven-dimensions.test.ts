import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import {
  getOC,
  importSTEP,
  measureShapeVolumeProperties,
  setOC,
} from "replicad";
import { CadEngine } from "./kernel.engine";
import { entityProfileStructure } from "./kernel.profiles";
import { createAngularPlateDocument } from "../examples/sketch-relations";
import { createMeasuredPlateDocument } from "../examples/driven-dimensions";
import { parseDocument, serializeDocument } from "../model/document";
import { createDrivenDimension, setDimensionDriven } from "../sketch/editing";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile } from "../sketch/types";
import type { Document as SolidFlowDocument } from "../model/document";
import type {
  CadResult,
  EdgeFinishFeature,
  Feature,
  SketchFeature,
} from "./kernel.types";

const engine = new CadEngine();
beforeAll(async () => {
  setOC(
    await initOpenCascade({
      wasmBinary: await readFile(
        createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm"),
      ),
      print: () => undefined,
    }),
  );
}, 60_000);
afterEach(() => engine.dispose());

function profile(document: SolidFlowDocument): EntityProfile {
  const sketch = document.features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
    throw new Error("Expected entity sketch");
  return sketch.profile;
}

function replaceProfile(document: SolidFlowDocument, next: EntityProfile) {
  const sketch = document.features[0];
  if (sketch.type !== "sketch") throw new Error("Expected sketch");
  sketch.profile = next;
}

function references(result: CadResult) {
  return {
    faces: result.faces?.map((face) => face.ref),
    edges: result.edges.map((edge) => edge.ref),
  };
}

function build(document: SolidFlowDocument) {
  const before = structuredClone(document);
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(document).toEqual(before);
  return result;
}

function addTriangleNotes(target: EntityProfile) {
  target.constraints.push(
    createDrivenDimension(
      target,
      { type: "length", entityId: "closing" },
      { id: "closing-note" },
    ),
    createDrivenDimension(
      target,
      { type: "angle", a: "base", b: "side", clockwise: true },
      { id: "reflex-note" },
    ),
  );
}

async function expectValidStep(expectedVolume: number) {
  const restored = (await importSTEP(engine.export("step"))).asShape3D();
  const analyzer = new (getOC().BRepCheck_Analyzer)(
    restored.wrapped,
    true,
    false,
    false,
  );
  const properties = measureShapeVolumeProperties(restored);
  const solids = restored.solids;
  try {
    expect(analyzer.IsValid()).toBe(true);
    expect(solids).toHaveLength(1);
    expect(properties.volume).toBeCloseTo(expectedVolume, 4);
  } finally {
    solids.forEach((solid) => solid.delete());
    properties.delete();
    analyzer.delete();
    restored.delete();
  }
}

// Frozen 0.10 naming descriptor: adding optional mode/role fields must not
// silently change the keys persisted by documents created before 0.11.
const legacyTriangleStructure = [
  ["base-end", "side-end"],
  [
    ["base", "line", false, "origin", "base-end"],
    ["closing", "line", false, "base-end", "side-end"],
    ["side", "line", false, "origin", "side-end"],
  ],
  [
    { entityId: "base", id: "base-horizontal", type: "horizontal" },
    { entityId: "base", id: "base-length", type: "length" },
    {
      a: "base",
      b: "side",
      clockwise: false,
      id: "included-angle",
      reversedA: false,
      reversedB: false,
      type: "angle",
    },
    { entityId: "side", id: "side-length", type: "length" },
  ],
  [["origin"], ["side-end"], ["base-end"]],
  [["base-end", "origin"], ["side-end"]],
  [],
];

it("keeps the exact 0.10 triangle descriptor and face/edge keys when reading legacy JSON or explicit constraint defaults", async () => {
  const saved = parseDocument(
    await readFile(
      new URL(
        "./fixtures/solidflow-ui/solidflow-0.10-angular-60-programmatic.solidflow",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const factory = createAngularPlateDocument();
  expect(factory.features).toEqual(saved.features);
  expect(JSON.stringify(entityProfileStructure(profile(saved)))).toBe(
    JSON.stringify(legacyTriangleStructure),
  );
  expect(parseDocument(serializeDocument(saved)).features).toEqual(
    saved.features,
  );
  const before = build(saved);
  expect(references(build(factory))).toEqual(references(before));
  for (const dimension of profile(factory).constraints) {
    if ("value" in dimension) {
      dimension.driven = false;
      dimension.referenceRole = "constraint";
    }
  }
  expect(JSON.stringify(entityProfileStructure(profile(factory)))).toBe(
    JSON.stringify(legacyTriangleStructure),
  );
  expect(references(build(parseDocument(serializeDocument(factory))))).toEqual(
    references(before),
  );
});

it.each([false, true])(
  "adding and deleting driven length/angle annotations preserves the solid and every reference, implicit annotation role=%s",
  (implicitRole) => {
    const document = createAngularPlateDocument();
    const baseline = build(document);
    const target = profile(document);
    addTriangleNotes(target);
    if (implicitRole)
      for (const dimension of target.constraints) {
        if ("value" in dimension && dimension.driven)
          delete dimension.referenceRole;
      }
    const solution = solveSketch(target);
    expect(solution.status, solution.message).toBe("fullyDefined");
    expect(solution.degreesOfFreedom).toBe(0);
    expect(solution.redundantConstraintIds).toEqual([]);
    expect(solution.drivenValues["closing-note"]).toBeCloseTo(
      Math.sqrt(2800),
      7,
    );
    expect(solution.drivenValues["reflex-note"]).toBeCloseTo(300, 7);
    const annotated = build(parseDocument(serializeDocument(document)));
    expect(annotated.volume).toBeCloseTo(baseline.volume, 7);
    expect(references(annotated)).toEqual(references(baseline));
    target.constraints = target.constraints.filter(
      (dimension) => !("value" in dimension && dimension.driven),
    );
    const removed = build(document);
    expect(removed.volume).toBeCloseTo(baseline.volume, 7);
    expect(references(removed)).toEqual(references(baseline));
  },
);

it.each([60, 35])(
  "rebuilds the public measured plate at %s° with fresh length/X/Y/reflex readings, reopens stale seeds and exports a valid solid",
  async (value) => {
    const document = createMeasuredPlateDocument();
    const target = profile(document);
    const angle = target.constraints.find(
      (dimension) => dimension.id === "included-angle",
    );
    if (angle?.type !== "angle") throw new Error("Expected driving angle");
    angle.value = value;
    for (const dimension of target.constraints) {
      if ("value" in dimension && dimension.driven) dimension.value = 1;
    }
    const reopened = parseDocument(serializeDocument(document));
    const solution = solveSketch(profile(reopened));
    expect(solution.status, solution.message).toBe("fullyDefined");
    expect(solution.degreesOfFreedom).toBe(0);
    expect(solution.drivenValues["measured-closing"]).toBeCloseTo(
      Math.sqrt(
        60 ** 2 + 40 ** 2 - 2 * 60 * 40 * Math.cos((value * Math.PI) / 180),
      ),
      6,
    );
    expect(solution.drivenValues["measured-x"]).toBeCloseTo(
      40 * Math.cos((value * Math.PI) / 180),
      6,
    );
    expect(solution.drivenValues["measured-y"]).toBeCloseTo(
      40 * Math.sin((value * Math.PI) / 180),
      6,
    );
    expect(solution.drivenValues["measured-reflex"]).toBeCloseTo(
      360 - value,
      6,
    );
    expect(
      profile(reopened)
        .constraints.filter(
          (dimension) => "value" in dimension && dimension.driven,
        )
        .map((dimension) => ("value" in dimension ? dimension.value : null)),
    ).toEqual([1, 1, 1, 1]);
    const expectedVolume =
      (60 * 40 * Math.sin((value * Math.PI) / 180) * 8) / 2;
    const original = build(document);
    const restored = build(reopened);
    expect(restored.volume).toBeCloseTo(expectedVolume, 4);
    expect(references(restored)).toEqual(references(original));
    await expectValidStep(expectedVolume);
  },
);

it("retains the legacy constraint naming role while a driving angle becomes driven and driving again", () => {
  const document = createAngularPlateDocument();
  const baseline = build(document);
  replaceProfile(
    document,
    setDimensionDriven(profile(document), "included-angle", true),
  );
  const released = solveSketch(profile(document));
  expect(released.status).toBe("underdefined");
  expect(released.degreesOfFreedom).toBe(1);
  expect(
    profile(document).constraints.find(
      (dimension) => dimension.id === "included-angle",
    ),
  ).toMatchObject({ driven: true, referenceRole: "constraint" });
  expect(references(build(parseDocument(serializeDocument(document))))).toEqual(
    references(baseline),
  );
  replaceProfile(
    document,
    setDimensionDriven(profile(document), "included-angle", false),
  );
  expect(solveSketch(profile(document)).status).toBe("fullyDefined");
  const restoredAngle = profile(document).constraints.find(
    (dimension) => dimension.id === "included-angle",
  );
  expect(restoredAngle).toMatchObject({
    driven: false,
    referenceRole: "constraint",
  });
  if (restoredAngle?.type !== "angle")
    throw new Error("Expected restored angle");
  expect(restoredAngle.value).toBeCloseTo(60, 12);
  expect(references(build(document))).toEqual(references(baseline));
  expect(JSON.stringify(entityProfileStructure(profile(document)))).toBe(
    JSON.stringify(legacyTriangleStructure),
  );
});

it.each(["closing-note", "reflex-note"])(
  "keeps a new annotation's naming role when %s temporarily drives the same geometry",
  (id) => {
    const document = createAngularPlateDocument();
    const baseline = build(document);
    addTriangleNotes(profile(document));
    replaceProfile(document, setDimensionDriven(profile(document), id, false));
    expect(
      profile(document).constraints.find((dimension) => dimension.id === id),
    ).toMatchObject({ driven: false, referenceRole: "annotation" });
    const driving = build(parseDocument(serializeDocument(document)));
    expect(driving.volume).toBeCloseTo(baseline.volume, 7);
    expect(references(driving)).toEqual(references(baseline));
    replaceProfile(document, setDimensionDriven(profile(document), id, true));
    expect(
      profile(document).constraints.find((dimension) => dimension.id === id),
    ).toMatchObject({ driven: true, referenceRole: "annotation" });
    expect(references(build(document))).toEqual(references(baseline));
  },
);

it("keeps a selected chamfer and a historical face-supported boss working when notes are added to their generating sketch", async () => {
  const boxProfile: EntityProfile = {
    kind: "entities",
    points: [
      { id: "a", x: -20, y: -15 },
      { id: "b", x: 20, y: -15 },
      { id: "c", x: 20, y: 15 },
      { id: "d", x: -20, y: 15 },
    ],
    entities: [
      { id: "ab", type: "line", construction: false, start: "a", end: "b" },
      { id: "bc", type: "line", construction: false, start: "b", end: "c" },
      { id: "cd", type: "line", construction: false, start: "c", end: "d" },
      { id: "da", type: "line", construction: false, start: "d", end: "a" },
    ],
    constraints: [
      { id: "anchor", type: "fix", pointId: "a", x: -20, y: -15 },
      { id: "bottom", type: "horizontal", entityId: "ab" },
      { id: "right", type: "vertical", entityId: "bc" },
      { id: "top", type: "horizontal", entityId: "cd" },
      { id: "left", type: "vertical", entityId: "da" },
      { id: "width", type: "length", entityId: "ab", value: 40 },
      { id: "height", type: "length", entityId: "bc", value: 30 },
    ],
  };
  const sketch: SketchFeature = {
    id: "box-sketch",
    name: "Box",
    type: "sketch",
    plane: "XY",
    offset: 0,
    suppressed: false,
    profile: boxProfile,
  };
  const features: Feature[] = [
    sketch,
    {
      id: "box-extrude",
      name: "Box extrusion",
      type: "extrude",
      sketchId: sketch.id,
      depth: 8,
      symmetric: false,
      suppressed: false,
    },
  ];
  const base = engine.build(features);
  expect(base.featureErrors).toEqual([]);
  const edge = base.edges.find((candidate) =>
    candidate.lines.every((coordinate, index) =>
      index % 3 === 0
        ? Math.abs(coordinate - 20) < 1e-6
        : index % 3 === 1
          ? Math.abs(coordinate - 15) < 1e-6
          : true,
    ),
  );
  const top = base.faces?.find(
    (face) => face.frame && face.frame.normal[2] > 1 - 1e-7,
  );
  if (!edge || !top) throw new Error("Expected corner edge and planar top");
  const chamfer: EdgeFinishFeature = {
    id: "corner-chamfer",
    name: "Selected chamfer",
    type: "chamfer",
    baseFeatureId: "box-extrude",
    size: 1,
    selection: { mode: "selected", edges: [structuredClone(edge.ref)] },
    suppressed: false,
  };
  features.push(
    chamfer,
    {
      id: "boss-sketch",
      name: "Historical face sketch",
      type: "sketch",
      plane: "XY",
      support: { kind: "face", face: structuredClone(top.ref) },
      offset: 0,
      suppressed: false,
      profile: { kind: "circle", center: [0, 0], radius: 2 },
    },
    {
      id: "boss",
      name: "Boss",
      type: "extrude",
      sketchId: "boss-sketch",
      depth: 3,
      symmetric: false,
      suppressed: false,
    },
  );
  const document = {
    ...createAngularPlateDocument(),
    name: "Notes with dependents",
    features,
  };
  const baseline = build(document);
  const expectedVolume = 40 * 30 * 8 - 8 / 2 + Math.PI * 2 ** 2 * 3;
  expect(baseline.volume).toBeCloseTo(expectedVolume, 5);
  boxProfile.constraints.push(
    createDrivenDimension(
      boxProfile,
      { type: "distance", a: "a", b: "c" },
      { id: "diagonal-note" },
    ),
    createDrivenDimension(
      boxProfile,
      { type: "angle", a: "ab", b: "bc" },
      { id: "corner-note" },
    ),
  );
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features[2]).toEqual(chamfer);
  expect(reopened.features[3]).toEqual(features[3]);
  const annotated = build(reopened);
  expect(annotated.volume).toBeCloseTo(expectedVolume, 5);
  expect(references(annotated)).toEqual(references(baseline));
  expect(
    annotated.sketches?.find((candidate) => candidate.id === "boss-sketch")
      ?.frame,
  ).toEqual(
    baseline.sketches?.find((candidate) => candidate.id === "boss-sketch")
      ?.frame,
  );
  await expectValidStep(expectedVolume);
});
