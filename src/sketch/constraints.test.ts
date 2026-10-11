import { describe, expect, it } from "vitest";
import {
  createAngularConstraint,
  createTangentConstraint,
  measureAngle,
  removeSelection,
  translateSelection,
} from "./editing";
import type { EntityProfile, SketchConstraint } from "./types";
import { validateEntityProfile } from "./validation";

function profile(): EntityProfile {
  return {
    kind: "entities",
    points: [
      { id: "x", x: 10, y: 0 },
      { id: "diagonal", x: 5, y: 5 },
      { id: "c", x: 3, y: 4 },
      { id: "d", x: 9, y: 4 },
      { id: "arcStart", x: 11, y: 4 },
      { id: "arcEnd", x: 9, y: 6 },
    ],
    entities: [
      { id: "a", type: "line", start: "origin", end: "x", construction: false },
      {
        id: "b",
        type: "line",
        start: "origin",
        end: "diagonal",
        construction: true,
      },
      {
        id: "circle",
        type: "circle",
        center: "c",
        radius: 4,
        construction: false,
      },
      {
        id: "arc",
        type: "arc",
        center: "d",
        start: "arcStart",
        end: "arcEnd",
        clockwise: false,
        construction: false,
      },
    ],
    constraints: [],
  };
}
const angular = (): SketchConstraint => ({
  id: "angle",
  type: "angle",
  a: "a",
  b: "b",
  value: 45,
  reversedA: false,
  reversedB: false,
  clockwise: false,
});
const tangent = (): SketchConstraint => ({
  id: "tangent",
  type: "tangent",
  a: "a",
  b: "circle",
  branch: "left",
});

describe("persisted angular and tangent constraint format", () => {
  it.each([0.000001, 180, 359.999999])(
    "accepts every directed sector strictly inside (0,360), including %s",
    (value) => {
      const source = profile();
      source.constraints = [{ ...angular(), value } as SketchConstraint];
      expect(validateEntityProfile(source)).toEqual(source);
    },
  );
  it.each([0, 360, -1, 361, NaN, Infinity, "45"])(
    "rejects an invalid angular value %s",
    (value) => {
      expect(() =>
        validateEntityProfile({
          ...profile(),
          constraints: [{ ...angular(), value }],
        }),
      ).toThrow("value");
    },
  );
  it.each(["reversedA", "reversedB", "clockwise"])(
    "requires an explicit boolean %s",
    (field) => {
      const missing: Record<string, unknown> = { ...angular() };
      delete missing[field];
      expect(() =>
        validateEntityProfile({ ...profile(), constraints: [missing] }),
      ).toThrow("obligatorio");
      expect(() =>
        validateEntityProfile({
          ...profile(),
          constraints: [{ ...angular(), [field]: 1 }],
        }),
      ).toThrow("verdadero o falso");
    },
  );
  it.each([
    { ...angular(), a: "circle" },
    { ...angular(), b: "a" },
    { ...angular(), b: "missing" },
    { ...tangent(), a: "circle", b: "a" },
    { ...tangent(), b: "b" },
    { ...tangent(), a: "circle", b: "circle", branch: "external" },
    { ...tangent(), branch: "external" },
    { ...tangent(), a: "circle", b: "arc", branch: "left" },
    { ...tangent(), branch: "nearest" },
    { ...angular(), sector: "automatic" },
  ])(
    "rejects mismatched references, self references or extra fields: %#",
    (constraint) => {
      expect(() =>
        validateEntityProfile({ ...profile(), constraints: [constraint] }),
      ).toThrow();
    },
  );
  it.each(["external", "aContainsB", "bContainsA"] as const)(
    "preserves circular branch %s and returns detached data",
    (branch) => {
      const source = profile();
      source.constraints = [
        { id: "t", type: "tangent", a: "circle", b: "arc", branch },
      ];
      const copy = validateEntityProfile(source);
      expect(copy).toEqual(source);
      expect(copy.constraints[0]).not.toBe(source.constraints[0]);
    },
  );
});

describe("initial constraint geometry", () => {
  it.each([
    [{}, 45],
    [{ clockwise: true }, 315],
    [{ reversedA: true }, 225],
    [{ reversedB: true }, 225],
    [{ reversedA: true, reversedB: true }, 45],
    [{ reversedA: true, clockwise: true }, 135],
  ] as const)(
    "measures explicit oriented rays %j as %s degrees",
    (options, expected) => {
      expect(measureAngle(profile(), "a", "b", options)).toBeCloseTo(
        expected,
        10,
      );
    },
  );
  it("creates an independent reflex constraint and preserves requested dimension and orientation", () => {
    const source = profile(),
      before = structuredClone(source);
    expect(
      createAngularConstraint(source, "a", "b", {
        id: "sector",
        clockwise: true,
      }),
    ).toEqual({ ...angular(), id: "sector", value: 315, clockwise: true });
    expect(
      createAngularConstraint(source, "a", "b", {
        id: "driving",
        value: 230,
        reversedA: true,
        reversedB: true,
      }),
    ).toMatchObject({ value: 230, reversedA: true, reversedB: true });
    expect(source).toEqual(before);
  });
  it("distinguishes straight from zero sectors and rejects zero-length lines", () => {
    const source = profile();
    source.points.find((p) => p.id === "diagonal")!.y = 0;
    expect(measureAngle(source, "a", "b")).toBe(0);
    expect(() => createAngularConstraint(source, "a", "b")).toThrow(
      "mayor que 0",
    );
    expect(
      createAngularConstraint(source, "a", "b", { reversedB: true }),
    ).toMatchObject({ value: 180 });
    source.points.find((p) => p.id === "x")!.x = 0;
    expect(() => measureAngle(source, "a", "b")).toThrow("longitud positiva");
  });
  it("normalizes a mixed selection while keeping the geometric side of the directed line", () => {
    const source = profile();
    expect(createTangentConstraint(source, "circle", "a", { id: "t" })).toEqual(
      { ...tangent(), id: "t" },
    );
    source.points.find((p) => p.id === "c")!.y = -4;
    expect(createTangentConstraint(source, "a", "circle")).toMatchObject({
      branch: "right",
    });
    const line = source.entities[0];
    if (line.type !== "line") throw new Error("Expected line");
    [line.start, line.end] = [line.end, line.start];
    expect(createTangentConstraint(source, "a", "circle")).toMatchObject({
      branch: "left",
    });
  });
  it("infers external and both internal circular branches from their geometric residual", () => {
    const source = profile();
    expect(createTangentConstraint(source, "circle", "arc")).toMatchObject({
      branch: "external",
    });
    source.points.find((p) => p.id === "c")!.x = 7;
    expect(createTangentConstraint(source, "circle", "arc")).toMatchObject({
      branch: "aContainsB",
    });
    expect(createTangentConstraint(source, "arc", "circle")).toMatchObject({
      branch: "bContainsA",
    });
  });
  it("uses the full supporting circle of an arc and infinite supporting line", () => {
    const source = profile();
    source.points.find((p) => p.id === "d")!.y = 2;
    source.points.find((p) => p.id === "arcStart")!.y = 2;
    source.points.find((p) => p.id === "arcEnd")!.y = 4;
    // The contact (9,0) lies outside the upper-right quarter arc and beyond this short line.
    source.points.find((p) => p.id === "x")!.x = 1;
    expect(
      createTangentConstraint(source, "a", "arc", { id: "t" }),
    ).toMatchObject({ a: "a", b: "arc", branch: "left" });
  });
  it("rejects incompatible creation requests and preserves an explicitly chosen valid branch", () => {
    const source = profile();
    expect(() => createTangentConstraint(source, "a", "b")).toThrow(
      "entidad circular",
    );
    expect(() => createTangentConstraint(source, "circle", "circle")).toThrow(
      "distintas",
    );
    expect(() => createAngularConstraint(source, "a", "circle")).toThrow(
      "dos líneas",
    );
    expect(() =>
      createTangentConstraint(source, "a", "circle", { branch: "external" }),
    ).toThrow("branch");
    expect(
      createTangentConstraint(source, "circle", "arc", {
        branch: "bContainsA",
      }),
    ).toMatchObject({ branch: "bContainsA" });
  });
});

describe("editing preserves or removes persisted branches", () => {
  it("does not rededuce the tangent side when translating its centre across the line", () => {
    const source = profile();
    source.constraints = [tangent(), angular()];
    const moved = translateSelection(
      source,
      [{ kind: "point", id: "c" }],
      0,
      -10,
    );
    expect(moved.constraints).toEqual(source.constraints);
    expect(createTangentConstraint(moved, "a", "circle")).toMatchObject({
      branch: "right",
    });
  });
  it("removes both dependent relations when deleting a shared line or its endpoint", () => {
    const source = profile();
    source.constraints = [tangent(), angular()];
    for (const selected of [
      { kind: "entity", id: "a" },
      { kind: "point", id: "x" },
    ] as const) {
      const removed = removeSelection(source, [selected]);
      expect(removed.constraints).toEqual([]);
      expect(validateEntityProfile(removed)).toEqual(removed);
    }
    expect(
      removeSelection(source, [{ kind: "entity", id: "circle" }]).constraints,
    ).toEqual([angular()]);
  });
});
