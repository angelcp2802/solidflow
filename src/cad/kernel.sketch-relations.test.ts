import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import { getOC, importSTEP, setOC } from "replicad";
import { CadEngine } from "./kernel.engine";
import {
  createAngularPlateDocument,
  createTangentPlateDocument,
} from "../examples/sketch-relations";
import { parseDocument, serializeDocument } from "../model/document";
import { solveSketch, SKETCH_SOLVER_TOLERANCE } from "../sketch/solver";
import type { EntityProfile } from "../sketch/types";
import type { Document as SolidFlowDocument } from "../model/document";

const engine = new CadEngine();
beforeAll(
  async () =>
    setOC(
      await initOpenCascade({
        wasmBinary: await readFile(
          createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm"),
        ),
        print: () => undefined,
      }),
    ),
  60_000,
);
afterEach(() => engine.dispose());

function sketchProfile(document: SolidFlowDocument): EntityProfile {
  const sketch = document.features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
    throw new Error("Entity sketch expected");
  return sketch.profile;
}

async function verifyDocument(
  document: SolidFlowDocument,
  expectedVolume: number,
) {
  const input = structuredClone(document),
    profile = sketchProfile(document);
  const solved = solveSketch(profile);
  expect(solved.status, solved.message).toBe("fullyDefined");
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(solved.profile.entities.map((entity) => entity.id)).toEqual(
    profile.entities.map((entity) => entity.id),
  );
  expect(solved.profile.constraints).toEqual(profile.constraints);
  const result = engine.build(document.features);
  expect(document).toEqual(input);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.volume).toBeCloseTo(expectedVolume, 4);
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  const rebuilt = engine.build(reopened.features);
  expect(rebuilt.featureErrors).toEqual([]);
  expect(rebuilt.volume).toBeCloseTo(expectedVolume, 4);
  expect(rebuilt.faces?.map((face) => face.ref)).toEqual(
    result.faces?.map((face) => face.ref),
  );
  const shape = (await importSTEP(engine.export("step"))).asShape3D();
  const analyzer = new (getOC().BRepCheck_Analyzer)(
    shape.wrapped,
    true,
    false,
    false,
  );
  const properties = new (getOC().GProp_GProps)(),
    solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true);
    expect(solids).toHaveLength(1);
    getOC().BRepGProp.VolumeProperties(
      shape.wrapped,
      properties,
      1e-10,
      false,
      false,
    );
    expect(properties.Mass()).toBeCloseTo(expectedVolume, 4);
  } finally {
    properties.delete();
    analyzer.delete();
    solids.forEach((solid) => solid.delete());
    shape.delete();
  }
}

it.each([60, 35])(
  "regenerates the public angular plate at %s° with its persisted oriented rays and exact solid",
  async (value) => {
    const document = createAngularPlateDocument(),
      profile = sketchProfile(document);
    const angle = profile.constraints.find(
      (constraint) => constraint.id === "included-angle",
    );
    if (angle?.type !== "angle") throw new Error("Angle expected");
    angle.value = value;
    await verifyDocument(
      document,
      (60 * 40 * Math.sin((value * Math.PI) / 180) * 8) / 2,
    );
    expect(angle).toMatchObject({
      a: "base",
      b: "side",
      reversedA: false,
      reversedB: false,
      clockwise: false,
    });
  },
);

it.each([15, 20])(
  "regenerates the public tangent plate at R%s with the declared contacts and exact circular end",
  async (value) => {
    const document = createTangentPlateDocument(),
      profile = sketchProfile(document);
    const radius = profile.constraints.find(
      (constraint) => constraint.id === "end-radius",
    );
    if (radius?.type !== "radius") throw new Error("Radius expected");
    radius.value = value;
    await verifyDocument(
      document,
      (50 * 2 * value + (Math.PI * value * value) / 2) * 8,
    );
    expect(
      profile.constraints.filter((constraint) => constraint.type === "tangent"),
    ).toEqual([
      {
        id: "bottom-tangent",
        type: "tangent",
        a: "bottom",
        b: "round-end",
        branch: "left",
      },
      {
        id: "top-tangent",
        type: "tangent",
        a: "top",
        b: "round-end",
        branch: "left",
      },
    ]);
  },
);
