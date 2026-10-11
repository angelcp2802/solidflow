import { describe, expect, it } from "vitest";
import type {
  DimensionalConstraint,
  EntityProfile,
  SketchConstraint,
} from "./types";
import {
  createAngularConstraint,
  createDrivenDimension,
  measureDimension,
  removeSelection,
  setDimensionDriven,
} from "./editing";
import { solveSketch } from "./solver";
import { validateEntityProfile } from "./validation";
import {
  addFeature,
  createDocument,
  DocumentHistory,
  parseDocument,
  serializeDocument,
  updateFeature,
} from "../model/document";
import type { SketchFeature } from "../cad/kernel.types";

const point = (id: string, x: number, y: number) => ({ id, x, y });
function lineProfile(): EntityProfile {
  return {
    kind: "entities",
    points: [point("p", 3, 4), point("x", 10, 0)],
    entities: [
      {
        id: "line",
        type: "line",
        start: "origin",
        end: "p",
        construction: false,
      },
      {
        id: "axis",
        type: "line",
        start: "origin",
        end: "x",
        construction: true,
      },
    ],
    constraints: [
      { id: "fix-p", type: "fix", pointId: "p", x: 3, y: 4 },
      { id: "fix-x", type: "fix", pointId: "x", x: 10, y: 0 },
    ],
  };
}
function angle(value = 123): DimensionalConstraint {
  return {
    id: "angle",
    type: "angle",
    a: "axis",
    b: "line",
    value,
    reversedA: false,
    reversedB: false,
    clockwise: false,
    driven: true,
  };
}
function dimensional(): DimensionalConstraint[] {
  return [
    {
      id: "length",
      type: "length",
      entityId: "line",
      value: 100000,
      driven: true,
    },
    {
      id: "distance",
      type: "distance",
      a: "origin",
      b: "p",
      value: 100000,
      driven: true,
    },
    {
      id: "dx",
      type: "distanceX",
      a: "origin",
      b: "p",
      value: 100000,
      driven: true,
    },
    {
      id: "dy",
      type: "distanceY",
      a: "p",
      b: "origin",
      value: 100000,
      driven: true,
    },
    angle(),
  ];
}
const ok = (input: EntityProfile) => {
  const result = solveSketch(input);
  expect(["fullyDefined", "underdefined"], result.message).toContain(
    result.status,
  );
  return result;
};
function lengthProfile(): EntityProfile {
  return {
    kind: "entities",
    points: [point("p", 10, 0)],
    entities: [
      {
        id: "line",
        type: "line",
        start: "origin",
        end: "p",
        construction: false,
      },
    ],
    constraints: [
      { id: "horizontal", type: "horizontal", entityId: "line" },
      { id: "length", type: "length", entityId: "line", value: 10 },
    ],
  };
}

describe("driven dimension solver contract", () => {
  it("measures all point/line dimensions after solving, while preserving every inactive value and input", () => {
    const input = lineProfile();
    input.constraints.push(...dimensional());
    const fixed = input.constraints[0];
    if (fixed.type !== "fix") throw new Error("fix");
    fixed.x = 6;
    fixed.y = 8;
    const snapshot = structuredClone(input),
      result = ok(input);
    expect(result.degreesOfFreedom).toBe(0);
    expect(result.redundantConstraintIds).toEqual([]);
    expect(result.conflictingConstraintIds).toEqual([]);
    for (const [id, value] of Object.entries({
      length: 10,
      distance: 10,
      dx: 6,
      dy: -8,
    }))
      expect(result.drivenValues[id]).toBeCloseTo(value, 7);
    expect(result.drivenValues.angle).toBeCloseTo(
      (Math.atan2(8, 6) * 180) / Math.PI,
      6,
    );
    expect(result.profile.constraints).toEqual(snapshot.constraints);
    expect(input).toEqual(snapshot);
  });
  it("does not alter iterations, scale, rank, residuals or redundancy when large inactive dimensions are added", () => {
    const base = lineProfile();
    const fixed = base.constraints[0];
    if (fixed.type !== "fix") throw new Error("fix");
    fixed.x = 0.03;
    fixed.y = 0.04;
    const input = structuredClone(base);
    input.constraints.push(...dimensional());
    const original = ok(base),
      withDriven = ok(input);
    expect(withDriven.profile.points).toEqual(original.profile.points);
    for (const key of [
      "status",
      "degreesOfFreedom",
      "iterations",
      "maxResidual",
      "redundantConstraintIds",
      "conflictingConstraintIds",
    ] as const)
      expect(withDriven[key]).toEqual(original[key]);
  });
  it("leaves unconstrained geometry underdefined and excludes an observed duplicate from redundancy", () => {
    const input = lengthProfile();
    input.constraints.push({
      ...input.constraints[1],
      id: "observed",
      driven: true,
    } as SketchConstraint);
    expect(ok(input)).toMatchObject({
      degreesOfFreedom: 0,
      redundantConstraintIds: [],
      drivenValues: { observed: 10 },
    });
    input.constraints = input.constraints.filter(
      (constraint) => constraint.id !== "length",
    );
    expect(ok(input)).toMatchObject({
      status: "underdefined",
      degreesOfFreedom: 1,
      redundantConstraintIds: [],
      drivenValues: { observed: 10 },
    });
  });
  it("observes the intrinsic radius of an arc and the independent radius of a circle", () => {
    const input: EntityProfile = {
      kind: "entities",
      points: [point("s", 5, 0), point("e", 0, 5), point("center", 30, 20)],
      entities: [
        {
          id: "arc",
          type: "arc",
          center: "origin",
          start: "s",
          end: "e",
          clockwise: false,
          construction: true,
        },
        {
          id: "circle",
          type: "circle",
          center: "center",
          radius: 7,
          construction: false,
        },
      ],
      constraints: [
        {
          id: "arc-radius",
          type: "radius",
          entityId: "arc",
          value: 99,
          driven: true,
        },
        {
          id: "circle-radius",
          type: "radius",
          entityId: "circle",
          value: 99,
          driven: true,
        },
      ],
    };
    expect(ok(input)).toMatchObject({
      degreesOfFreedom: 6,
      drivenValues: { "arc-radius": 5, "circle-radius": 7 },
      redundantConstraintIds: [],
    });
  });
  it.each([
    [{}, 53.13010235415598],
    [{ clockwise: true }, 306.869897645844],
    [{ reversedA: true }, 233.130102354156],
    [{ reversedB: true, clockwise: true }, 126.86989764584402],
  ] as const)(
    "preserves the angular sector for a driven observation: %j",
    (flags, expected) => {
      const input = lineProfile();
      input.constraints.push({ ...angle(), ...flags });
      expect(ok(input).drivenValues.angle).toBeCloseTo(expected, 7);
    },
  );
  it("returns unavailable measurements on failed solves and never exposes the failed least-squares attempt", () => {
    const input = lineProfile();
    input.constraints.push(...dimensional(), {
      id: "conflict",
      type: "fix",
      pointId: "p",
      x: 10,
      y: 10,
    });
    const result = solveSketch(input);
    expect(result.status).toBe("inconsistent");
    expect(result.profile).toEqual(input);
    expect(Object.values(result.drivenValues)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(result.conflictingConstraintIds).not.toContain("length");
    expect(result.redundantConstraintIds).toEqual([]);
  });
});

describe("driven dimension creation and conversion", () => {
  it("seeds new driven observations from freshly solved geometry without changing the source", () => {
    const input = lineProfile(),
      fixed = input.constraints[0];
    if (fixed.type !== "fix") throw new Error("fix");
    fixed.x = 0;
    fixed.y = 10;
    const snapshot = structuredClone(input);
    const length = createDrivenDimension(input, {
      type: "length",
      entityId: "line",
    });
    expect(length.value).toBeCloseTo(10, 7);
    expect(length.driven).toBe(true);
    const angle = createAngularConstraint(input, "axis", "line", {
      driven: true,
    });
    expect(angle.value).toBeCloseTo(90, 7);
    expect(input).toEqual(snapshot);
  });
  it("converts from freshly solved geometry instead of stale input points or an inactive value", () => {
    const conductor = lengthProfile();
    conductor.points[0].x = 5;
    const reference = setDimensionDriven(conductor, "length", true);
    expect(reference.points[0].x).toBeCloseTo(10, 7);
    const input = lineProfile();
    input.constraints.push({ ...dimensional()[0], value: 999 });
    const fixed = input.constraints[0];
    if (fixed.type !== "fix") throw new Error("fix");
    fixed.x = 6;
    fixed.y = 8;
    const restored = setDimensionDriven(input, "length", false),
      dimension = restored.constraints.at(-1)!;
    if (!("value" in dimension)) throw new Error("dimension");
    expect(dimension.value).toBeCloseTo(10, 7);
    expect(restored.points[0].x).toBeCloseTo(6, 7);
    expect(restored.points[0].y).toBeCloseTo(8, 7);
    expect(input.points[0]).toEqual(point("p", 3, 4));
  });
  it("creates parallel 0° and coincident 0mm observations without inventing a driving target", () => {
    const input = lineProfile();
    input.points[0].y = 0;
    const fixed = input.constraints[0];
    if (fixed.type === "fix") fixed.y = 0;
    const angular = createAngularConstraint(input, "axis", "line", {
      driven: true,
      id: "parallel-angle",
    });
    const distance = createDrivenDimension(
      input,
      { type: "distance", a: "origin", b: "origin" },
      { id: "zero-distance" },
    );
    expect(angular).toMatchObject({
      value: 0,
      driven: true,
      referenceRole: "annotation",
    });
    expect(distance).toMatchObject({
      value: 0,
      driven: true,
      referenceRole: "annotation",
    });
    input.constraints.push(angular, distance);
    expect(ok(input).drivenValues).toEqual({
      "parallel-angle": 0,
      "zero-distance": 0,
    });
    expect(() => setDimensionDriven(input, "parallel-angle", false)).toThrow(
      /medida actual.*conductora/,
    );
    expect(() => setDimensionDriven(input, "zero-distance", false)).toThrow(
      /medida actual.*conductora/,
    );
  });
  it.each(["distance", "distanceX", "distanceY", "length"] as const)(
    "creates a %s measurement beyond the driving dimension range and refuses conversion without clipping",
    (type) => {
      const input: EntityProfile = {
        kind: "entities",
        points: [point("p", -900000, -900000), point("q", 900000, 900000)],
        entities: [
          {
            id: "line",
            type: "line",
            start: "p",
            end: "q",
            construction: true,
          },
        ],
        constraints: [],
      };
      const dimension =
        type === "length"
          ? createDrivenDimension(
              input,
              { type, entityId: "line" },
              { id: "observed" },
            )
          : createDrivenDimension(
              input,
              { type, a: "p", b: "q" },
              { id: "observed" },
            );
      input.constraints.push(dimension);
      const before = structuredClone(input),
        result = ok(input);
      expect(result.drivenValues.observed).toBeGreaterThan(100000);
      expect(result.drivenValues.observed).toBeCloseTo(
        type === "distance" || type === "length"
          ? Math.hypot(1800000, 1800000)
          : 1800000,
        6,
      );
      expect(() => setDimensionDriven(input, "observed", false)).toThrow(
        /medida actual.*conductora/,
      );
      expect(input).toEqual(before);
    },
  );
  it("converts driving→driven→driving using the fresh solved length and preserves its reference role and ID", () => {
    const original = lengthProfile(),
      reference = setDimensionDriven(original, "length", true);
    expect(reference.constraints[1]).toMatchObject({
      id: "length",
      value: 10,
      driven: true,
      referenceRole: "constraint",
    });
    reference.points[0].x = 25;
    expect(ok(reference).drivenValues.length).toBe(25);
    const snapshot = structuredClone(reference),
      restored = setDimensionDriven(reference, "length", false),
      solved = ok(restored);
    expect(restored.constraints[1]).toMatchObject({
      id: "length",
      value: 25,
      driven: false,
      referenceRole: "constraint",
    });
    expect(solved.profile.points[0]).toEqual(point("p", 25, 0));
    expect(solved.degreesOfFreedom).toBe(0);
    expect(reference).toEqual(snapshot);
    expect(original.constraints[1]).not.toHaveProperty("driven");
  });
  it("retains annotation naming when a new driven dimension becomes driving, without changing angular rays", () => {
    const input = lineProfile();
    const observation = createDrivenDimension(
      input,
      { type: "angle", a: "axis", b: "line", clockwise: true },
      { id: "sector" },
    );
    input.constraints.push(observation);
    const converted = setDimensionDriven(input, "sector", false);
    expect(converted.constraints.at(-1)).toMatchObject({
      id: "sector",
      driven: false,
      referenceRole: "annotation",
      clockwise: true,
      reversedA: false,
      reversedB: false,
    });
    expect(converted.constraints.at(-1)).toHaveProperty(
      "value",
      measureDimension(ok(input).profile, observation),
    );
  });
  it("repairs an overdefined sketch by converting only the conflicting dimension to driven", () => {
    const input = lineProfile();
    input.constraints.push({
      id: "bad-target",
      type: "length",
      entityId: "line",
      value: 20,
    });
    expect(solveSketch(input).status).toBe("inconsistent");
    const repaired = setDimensionDriven(input, "bad-target", true);
    expect(ok(repaired)).toMatchObject({
      degreesOfFreedom: 0,
      drivenValues: { "bad-target": 5 },
    });
    expect(repaired.constraints.at(-1)).toMatchObject({
      value: 20,
      driven: true,
      referenceRole: "constraint",
    });
  });
  it("preserves frozen input when a failed solve prevents conversion back to driving", () => {
    const input = lineProfile();
    input.constraints.push(angle(), {
      id: "conflict",
      type: "fix",
      pointId: "p",
      x: 20,
      y: 20,
    });
    const snapshot = structuredClone(input);
    input.constraints.forEach(Object.freeze);
    Object.freeze(input.constraints);
    Object.freeze(input);
    expect(() => setDimensionDriven(input, "angle", false)).toThrow(
      /No se puede cambiar/,
    );
    expect(input).toEqual(snapshot);
  });
});

describe("strict driven persistence and restoration", () => {
  it.each([null, undefined, 42, { kind: "entities", constraints: "invalid" }])(
    "reports invalid profiles without throwing while building unavailable measurements: %j",
    (input) => {
      expect(solveSketch(input as unknown as EntityProfile)).toMatchObject({
        status: "invalid",
        drivenValues: {},
      });
    },
  );
  it("retains arbitrary valid driven IDs as own map properties", () => {
    const input = lineProfile();
    input.constraints.push({ ...dimensional()[0], id: "__proto__" });
    const result = ok(input);
    expect(Object.hasOwn(result.drivenValues, "__proto__")).toBe(true);
    expect(result.drivenValues.__proto__).toBe(5);
  });
  it.each([undefined, false, true])(
    "round trips the optional driven mode %s without adding a default field",
    (driven) => {
      const input = lengthProfile();
      if (driven !== undefined && "value" in input.constraints[1])
        input.constraints[1].driven = driven;
      const sketch: SketchFeature = {
        id: "sketch",
        type: "sketch",
        name: "Croquis",
        suppressed: false,
        plane: "XY",
        offset: 0,
        profile: input,
      };
      const document = addFeature(createDocument(), sketch),
        reopened = parseDocument(serializeDocument(document));
      expect(reopened.features[0]).toEqual(sketch);
      expect(validateEntityProfile(input)).toEqual(input);
    },
  );
  it.each([
    { driven: "true" },
    { driven: null },
    { driven: 1 },
    { driven: undefined },
    { driven: true, referenceRole: "automatic" },
    { driven: true, referenceRole: undefined },
    { driven: true, entityId: "missing" },
    { driven: true, entityId: "origin" },
    { driven: true, value: Infinity },
    { driven: true, value: -1 },
  ])(
    "rejects malformed mode/role/values/references %# even for nonparticipating dimensions",
    (patch) => {
      const input = lengthProfile();
      input.constraints[1] = {
        ...input.constraints[1],
        ...patch,
      } as SketchConstraint;
      expect(() => validateEntityProfile(input)).toThrow();
    },
  );
  it("rejects driven metadata on geometric relations and cleans observations when a referenced entity is deleted", () => {
    const input = lengthProfile();
    input.constraints[0] = {
      ...input.constraints[0],
      driven: true,
    } as SketchConstraint;
    expect(() => validateEntityProfile(input)).toThrow("campo desconocido");
    input.constraints[0] = {
      id: "horizontal",
      type: "horizontal",
      entityId: "line",
    };
    input.constraints.push(
      createDrivenDimension(
        input,
        { type: "length", entityId: "line" },
        { id: "observed" },
      ),
    );
    expect(
      removeSelection(input, [{ kind: "entity", id: "line" }]).constraints,
    ).toEqual([]);
  });
  it("undoes/redoes converted dimensions, measured geometry and naming metadata through the public document history", () => {
    const sketch: SketchFeature = {
      id: "sketch",
      type: "sketch",
      name: "Croquis",
      suppressed: false,
      plane: "XY",
      offset: 0,
      profile: lengthProfile(),
    };
    const initial = addFeature(createDocument(), sketch),
      history = new DocumentHistory(initial);
    const reference = setDimensionDriven(
      sketch.profile as EntityProfile,
      "length",
      true,
    );
    reference.points[0].x = 25;
    const changed = history.apply(
      updateFeature(initial, "sketch", { profile: reference }),
    );
    const conducting = setDimensionDriven(reference, "length", false);
    const restored = history.apply(
      updateFeature(changed, "sketch", { profile: conducting }),
    );
    expect(history.undo()).toEqual(changed);
    expect(history.undo()).toEqual(initial);
    expect(history.redo()).toEqual(changed);
    expect(history.redo()).toEqual(restored);
    expect(parseDocument(serializeDocument(restored))).toEqual(restored);
    conducting.points[0].x = 999;
    expect(history.current).toEqual(restored);
  });
});
