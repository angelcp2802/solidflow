import { describe, expect, it, vi } from "vitest";
import type { EntityProfile, SketchEntity, SketchSelection } from "./types";
import { planSketchFillet, type FilletParameters } from "./fillet";
import { solveSketch } from "./solver";
import { validateEntityProfile } from "./validation";
import {
  createDocument,
  parseDocument,
  serializeDocument,
} from "../model/document";

const p = (id: string, x: number, y: number) => ({ id, x, y });
const line = (
  id: string,
  start: string,
  end: string,
  construction = false,
): SketchEntity => ({ id, type: "line", start, end, construction });
const arc = (
  id: string,
  center: string,
  start: string,
  end: string,
  clockwise = false,
): SketchEntity => ({
  id,
  type: "arc",
  center,
  start,
  end,
  clockwise,
  construction: false,
});
const pair: SketchSelection[] = [
  { kind: "entity", id: "a" },
  { kind: "entity", id: "b" },
];
const params: FilletParameters = { radius: 2, cornerPolicy: "keep" };
const xy = (profile: EntityProfile, id: string) =>
  id === "origin"
    ? p("origin", 0, 0)
    : profile.points.find((point) => point.id === id)!;
const entity = (profile: EntityProfile, id: string) =>
  profile.entities.find((e) => e.id === id)!;
function rounded(profile: EntityProfile, id: string) {
  const e = entity(profile, id);
  if (e.type !== "arc") throw new Error("Expected arc");
  return {
    ...e,
    c: xy(profile, e.center),
    s: xy(profile, e.start),
    e: xy(profile, e.end),
  };
}
const expectXY = (
  actual: { x: number; y: number },
  x: number,
  y: number,
  precision = 7,
) => {
  expect(actual.x).toBeCloseTo(x, precision);
  expect(actual.y).toBeCloseTo(y, precision);
};
function corner(
  theta = 90,
  reversedA = false,
  reversedB = false,
): EntityProfile {
  return {
    kind: "entities",
    points: [
      p("far-a", 40, 0),
      p(
        "far-b",
        30 * Math.cos((theta * Math.PI) / 180),
        30 * Math.sin((theta * Math.PI) / 180),
      ),
    ],
    entities: [
      line("a", reversedA ? "far-a" : "origin", reversedA ? "origin" : "far-a"),
      line("b", reversedB ? "far-b" : "origin", reversedB ? "origin" : "far-b"),
    ],
    constraints: [],
  };
}
function definedCorner() {
  const profile = corner(90, false, true);
  profile.constraints = [
    { id: "h", type: "horizontal", entityId: "a" },
    { id: "v", type: "vertical", entityId: "b" },
    {
      id: "old-a",
      type: "length",
      entityId: "a",
      value: 40,
      driven: false,
      referenceRole: "annotation",
    },
    { id: "old-b", type: "length", entityId: "b", value: 30 },
    {
      id: "reading",
      type: "length",
      entityId: "a",
      value: 999,
      driven: true,
      referenceRole: "annotation",
    },
  ];
  return profile;
}
function plan(input: EntityProfile, parameters = params, selection = pair) {
  const result = planSketchFillet(input, selection, parameters);
  expect(result.changed, result.message).toBe(true);
  expect(result.sourceProfile).toBe(input);
  expect(result.profile).not.toBe(input);
  expect(validateEntityProfile(result.profile)).toEqual(result.profile);
  return result;
}
function solve(input: EntityProfile) {
  const result = solveSketch(input);
  expect(["underdefined", "fullyDefined"], result.message).toContain(
    result.status,
  );
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function dimension(profile: EntityProfile, id: string, value: number) {
  const c = profile.constraints.find((c) => c.id === id)!;
  if (!("value" in c)) throw new Error("Expected dimension");
  c.value = value;
}
function radiusDimension(profile: EntityProfile, arcId: string) {
  return profile.constraints.find(
    (c) => c.type === "radius" && c.entityId === arcId,
  )!.id;
}
function dShape(): EntityProfile {
  return {
    kind: "entities",
    points: [p("right", 20, 0), p("left", -20, 0)],
    entities: [line("a", "left", "right"), arc("b", "origin", "right", "left")],
    constraints: [],
  };
}
function externalLineArc(): EntityProfile {
  return {
    kind: "entities",
    points: [p("corner", 10, 0), p("far-a", 30, 0), p("far-b", 0, 10)],
    entities: [
      line("a", "corner", "far-a"),
      arc("b", "origin", "corner", "far-b"),
    ],
    constraints: [],
  };
}
function arcPair(): EntityProfile {
  return {
    kind: "entities",
    points: [
      p("ca", -6, 0),
      p("cb", 6, 0),
      p("corner", 0, 8),
      p("far-a", -16, 0),
      p("far-b", 16, 0),
    ],
    entities: [
      arc("a", "ca", "corner", "far-a"),
      arc("b", "cb", "corner", "far-b", true),
    ],
    constraints: [],
  };
}

describe("fillet analytical candidates", () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "rounds a right corner with source endpoint orientations %s/%s",
    (a, b) => {
      const input = corner(90, a, b),
        snapshot = structuredClone(input),
        result = plan(input);
      const f = rounded(result.profile, result.filletEntityId!);
      expectXY(f.c, 2, 2);
      expectXY(f.s, 2, 0);
      expectXY(f.e, 0, 2);
      expect(f.clockwise).toBe(true);
      expect(input).toEqual(snapshot);
      expect(result.createdEntityIds).toEqual([f.id]);
      expect(result.affectedEntityIds).toEqual(["a", "b"]);
      expect(
        result.profile.constraints.filter((c) => c.type === "tangent"),
      ).toHaveLength(2);
      solve(result.profile);
    },
  );

  it.each([60, -60, 120, -120])(
    "has independent right-triangle oracles for a %s degree corner",
    (theta) => {
      const r = 2,
        setback = Math.abs(theta) === 60 ? 2 * Math.sqrt(3) : 2 / Math.sqrt(3);
      const result = plan(corner(theta));
      const f = rounded(result.profile, result.filletEntityId!);
      expectXY(f.c, setback, Math.sign(theta) * r);
      expectXY(f.s, setback, 0);
      expectXY(
        f.e,
        Math.abs(theta) === 60 ? setback / 2 : -setback / 2,
        (Math.sign(theta) * setback * Math.sqrt(3)) / 2,
      );
      expect(f.clockwise).toBe(theta > 0);
      solve(result.profile);
    },
  );

  it("reverses the traversal but not geometry when A/B are exchanged", () => {
    const first = plan(corner()),
      second = plan(corner(), params, [...pair].reverse());
    const a = rounded(first.profile, first.filletEntityId!),
      b = rounded(second.profile, second.filletEntityId!);
    expectXY(b.c, a.c.x, a.c.y);
    expectXY(b.s, a.e.x, a.e.y);
    expectXY(b.e, a.s.x, a.s.y);
    expect(b.clockwise).toBe(false);
  });

  it.each([5, 15])(
    "extends or trims separated lines towards a virtual corner with R%s",
    (radius) => {
      const input: EntityProfile = {
        kind: "entities",
        points: [
          p("a0", 20, 10),
          p("a1", 50, 10),
          p("b0", 10, 20),
          p("b1", 10, 40),
        ],
        entities: [line("a", "a0", "a1"), line("b", "b0", "b1")],
        constraints: [],
      };
      const result = plan(input, { ...params, radius }),
        f = rounded(result.profile, result.filletEntityId!);
      expectXY(f.c, 10 + radius, 10 + radius);
      expectXY(f.s, 10 + radius, 10);
      expectXY(f.e, 10, 10 + radius);
      expectXY(xy(result.profile, "a0"), 20, 10);
      expectXY(xy(result.profile, "b0"), 10, 20);
      expect(
        planSketchFillet(input, pair, { ...params, radius: 50 }).changed,
      ).toBe(false);
      solve(result.profile);
    },
  );

  it.each(["right", "left"])(
    "uses one selected vertex when line/arc share both corners: %s",
    (id) => {
      const input = dShape(),
        result = plan(input, { ...params, radius: 5 }, [{ kind: "point", id }]);
      const f = rounded(result.profile, result.filletEntityId!),
        sign = id === "right" ? 1 : -1;
      expectXY(f.c, sign * 10 * Math.sqrt(2), 5);
      // Similar triangles in the R20/R15 concentric offset circles.
      expectXY(f.e, (sign * 40 * Math.sqrt(2)) / 3, 20 / 3);
      expect(result.profile.constraints).toContainEqual(
        expect.objectContaining({
          type: "tangent",
          a: "b",
          b: f.id,
          branch: "aContainsB",
        }),
      );
      solve(result.profile);
    },
  );

  it("requires a vertex or explicit candidate when a pair shares two distinct corners", () => {
    const input = dShape(),
      rejected = planSketchFillet(input, pair, { ...params, radius: 5 });
    expect(rejected.changed).toBe(false);
    expect(rejected.profile).toBe(input);
    expect(rejected.candidates.length).toBeGreaterThan(1);
    const chosen = plan(input, {
      ...params,
      radius: 5,
      solutionIndex: rejected.candidates[0].index,
    });
    expect(chosen.selectedSolutionIndex).toBe(rejected.candidates[0].index);
  });

  it("finds external line/arc tangency with analytic center and contact coordinates", () => {
    const result = plan(externalLineArc()),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 2 * Math.sqrt(35), 2);
    expectXY(f.s, 2 * Math.sqrt(35), 0);
    expectXY(f.e, (5 * Math.sqrt(35)) / 3, 5 / 3);
    expect(result.profile.constraints).toContainEqual(
      expect.objectContaining({
        type: "tangent",
        a: "b",
        b: f.id,
        branch: "external",
      }),
    );
    solve(result.profile);
  });

  it("finds the finite arc/arc solution with two external tangencies", () => {
    const result = plan(arcPair()),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 0, 6 * Math.sqrt(3));
    expectXY(f.s, -1, 5 * Math.sqrt(3));
    expectXY(f.e, 1, 5 * Math.sqrt(3));
    expect(f.clockwise).toBe(false);
    expect(
      result.profile.constraints
        .filter((c) => c.type === "tangent")
        .map((c) => c.type === "tangent" && c.branch),
    ).toEqual(["external", "external"]);
    solve(result.profile);
  });

  it("handles mixed external/internal arc tangency with independent Cartesian coordinates", () => {
    const input: EntityProfile = {
      kind: "entities",
      points: [
        p("cb", 12, 0),
        p("corner", 6, 8),
        p("far-a", 10, 0),
        p("far-b", 22, 0),
      ],
      entities: [
        arc("a", "origin", "corner", "far-a", true),
        arc("b", "cb", "corner", "far-b", true),
      ],
      constraints: [],
    };
    const result = plan(input),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 28 / 3, (16 * Math.sqrt(2)) / 3);
    expectXY(f.s, 70 / 9, (40 * Math.sqrt(2)) / 9);
    expectXY(f.e, 26 / 3, (20 * Math.sqrt(2)) / 3);
    expect(
      result.profile.constraints
        .filter((c) => c.type === "tangent")
        .map((c) => c.type === "tangent" && c.branch),
    ).toEqual(["external", "aContainsB"]);
    solve(result.profile);
  });

  it("represents a fillet containing a smaller disjoint source arc without exchanging its branch", () => {
    const input: EntityProfile = {
      kind: "entities",
      points: [
        p("far-a", 40, 0),
        p("cb", 0, 10),
        p("arc-start", 0, 5),
        p("far-b", -5, 10),
      ],
      entities: [
        line("a", "origin", "far-a"),
        arc("b", "cb", "arc-start", "far-b", true),
      ],
      constraints: [],
    };
    const result = plan(input, { ...params, radius: 20 }),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 5 * Math.sqrt(5), 20);
    expectXY(f.s, 5 * Math.sqrt(5), 0);
    expectXY(f.e, (-5 * Math.sqrt(5)) / 3, 20 / 3);
    expect(result.profile.constraints).toContainEqual(
      expect.objectContaining({
        type: "tangent",
        a: "b",
        b: f.id,
        branch: "bContainsA",
      }),
    );
    solve(result.profile);
  });

  it("reverses selection order for a line/arc pair without changing the external solution", () => {
    const result = plan(externalLineArc(), params, [...pair].reverse()),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 2 * Math.sqrt(35), 2);
    expectXY(f.e, 2 * Math.sqrt(35), 0);
    expectXY(f.s, (5 * Math.sqrt(35)) / 3, 5 / 3);
    expect(f.clockwise).toBe(false);
    solve(result.profile);
  });

  it("respects original clockwise and counterclockwise source arcs under reversed endpoint storage", () => {
    const input = arcPair();
    for (const source of input.entities)
      if (source.type === "arc") {
        [source.start, source.end] = [source.end, source.start];
        source.clockwise = !source.clockwise;
      }
    const result = plan(input),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 0, 6 * Math.sqrt(3));
    expectXY(f.s, -1, 5 * Math.sqrt(3));
    expectXY(f.e, 1, 5 * Math.sqrt(3));
    solve(result.profile);
  });

  it("rejects contacts outside the finite source arc instead of using its whole circle", () => {
    const input = externalLineArc();
    input.points.find((point) => point.id === "far-b")!.x =
      10 * Math.cos(Math.PI / 180);
    input.points.find((point) => point.id === "far-b")!.y =
      10 * Math.sin(Math.PI / 180);
    const result = planSketchFillet(input, pair, params);
    expect(result.changed).toBe(false);
    expect(result.profile).toBe(input);
  });

  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])(
    "preserves construction flags %s/%s and fillet flag %s",
    (a, b, expected) => {
      const input = corner();
      input.entities[0].construction = a;
      input.entities[1].construction = b;
      const result = plan(input);
      expect(entity(result.profile, "a").construction).toBe(a);
      expect(entity(result.profile, "b").construction).toBe(b);
      expect(entity(result.profile, result.filletEntityId!).construction).toBe(
        expected,
      );
    },
  );
});

describe("fillet constraints and transactions", () => {
  it("keeps driving spans, fixed origin and fresh driven lengths through radius edits and reopening", () => {
    const input = definedCorner(),
      snapshot = structuredClone(input),
      result = plan(input);
    expect(result.convertedConstraintIds).toEqual(["old-a", "old-b"]);
    expect(result.profile.constraints.find((c) => c.id === "old-a")).toEqual({
      id: "old-a",
      type: "distance",
      a: "origin",
      b: "far-a",
      value: 40,
      driven: false,
      referenceRole: "annotation",
    });
    let solved = solve(result.profile);
    expect(solved.degreesOfFreedom).toBe(0);
    expect(solved.redundantConstraintIds).toEqual([]);
    expect(solved.drivenValues.reading).toBeCloseTo(38, 7);
    const edited = structuredClone(solved.profile);
    dimension(edited, radiusDimension(edited, result.filletEntityId!), 3);
    dimension(edited, "old-a", 50);
    solved = solve(edited);
    const f = rounded(solved.profile, result.filletEntityId!);
    expectXY(f.c, 3, 3, 6);
    expectXY(f.s, 3, 0, 6);
    expectXY(f.e, 0, 3, 6);
    expectXY(xy(solved.profile, "far-a"), 50, 0, 6);
    expect(solved.drivenValues.reading).toBeCloseTo(47, 6);
    expect(solved.profile.constraints.find((c) => c.id === "reading")).toEqual(
      input.constraints[4],
    );
    const doc = createDocument("Analytical fillet");
    doc.features.push({
      id: "sketch",
      type: "sketch",
      name: "Sketch",
      plane: "XY",
      offset: 0,
      suppressed: false,
      profile: solved.profile,
    });
    expect(parseDocument(serializeDocument(doc)).features).toEqual(
      doc.features,
    );
    expect(input).toEqual(snapshot);
  });

  it("links a new fillet to an existing measured radius and follows later master edits", () => {
    const input = definedCorner();
    input.points.push(p("master-center", 100, 100));
    input.entities.push({
      id: "master",
      type: "circle",
      center: "master-center",
      radius: 2,
      construction: true,
    });
    input.constraints.push(
      {
        id: "master-fix",
        type: "fix",
        pointId: "master-center",
        x: 100,
        y: 100,
      },
      { id: "master-radius", type: "radius", entityId: "master", value: 2 },
    );
    const result = plan(input, { ...params, equalRadiusEntityId: "master" });
    expect(result.profile.constraints).toContainEqual(
      expect.objectContaining({
        type: "equal",
        a: result.filletEntityId,
        b: "master",
      }),
    );
    expect(
      result.profile.constraints.some(
        (c) => c.type === "radius" && c.entityId === result.filletEntityId,
      ),
    ).toBe(false);
    const edited = structuredClone(solve(result.profile).profile);
    dimension(edited, "master-radius", 3);
    const solved = solve(edited),
      f = rounded(solved.profile, result.filletEntityId!);
    expectXY(f.c, 3, 3, 6);
    expect(solved.drivenValues.reading).toBeCloseTo(37, 6);
    expect(solved.degreesOfFreedom).toBe(0);
  });

  it("keeps source arc radius and fresh observations when its driving radius changes", () => {
    const input = externalLineArc();
    input.constraints = [
      { id: "far-fix", type: "fix", pointId: "far-a", x: 30, y: 0 },
      { id: "h", type: "horizontal", entityId: "a" },
      { id: "source-radius", type: "radius", entityId: "b", value: 10 },
      { id: "far-x", type: "distanceX", a: "origin", b: "far-b", value: 0 },
      {
        id: "source-reading",
        type: "radius",
        entityId: "b",
        value: 999,
        driven: true,
      },
    ];
    expect(solve(input).degreesOfFreedom).toBe(0);
    const result = plan(input),
      edited = structuredClone(solve(result.profile).profile);
    expect(result.deletedConstraintIds).toEqual([]);
    dimension(edited, "source-radius", 12);
    const solved = solve(edited),
      f = rounded(solved.profile, result.filletEntityId!);
    expectXY(f.c, 8 * Math.sqrt(3), 2, 6);
    expectXY(f.s, 8 * Math.sqrt(3), 0, 6);
    expectXY(f.e, (48 * Math.sqrt(3)) / 7, 12 / 7, 6);
    expectXY(xy(solved.profile, "corner"), 12, 0, 6);
    expectXY(xy(solved.profile, "far-b"), 0, 12, 6);
    expect(solved.drivenValues["source-reading"]).toBeCloseTo(12, 6);
    expect(
      solved.profile.constraints.find((c) => c.id === "source-reading"),
    ).toEqual(input.constraints[4]);
    expect(solved.degreesOfFreedom).toBe(0);
  });

  it("edits an arc/arc fillet radius while preserving both source circles and tangent branches", () => {
    const input = arcPair();
    input.constraints = input.points.map((point) => ({
      id: `fix-${point.id}`,
      type: "fix",
      pointId: point.id,
      x: point.x,
      y: point.y,
    }));
    const result = plan(input),
      edited = structuredClone(solve(result.profile).profile);
    edited.constraints.push({
      id: "fillet-reading",
      type: "radius",
      entityId: result.filletEntityId!,
      value: 777,
      driven: true,
    });
    dimension(edited, radiusDimension(edited, result.filletEntityId!), 3);
    const solved = solve(edited),
      f = rounded(solved.profile, result.filletEntityId!);
    expectXY(f.c, 0, Math.sqrt(133), 6);
    expectXY(f.s, -18 / 13, (10 * Math.sqrt(133)) / 13, 6);
    expectXY(f.e, 18 / 13, (10 * Math.sqrt(133)) / 13, 6);
    expect(solved.drivenValues["fillet-reading"]).toBeCloseTo(3, 6);
    expect(solved.degreesOfFreedom).toBe(0);
  });

  it("does not silently jump through a collapsed source when an edited radius exceeds its retained side", () => {
    const result = plan(definedCorner()),
      edited = structuredClone(solve(result.profile).profile);
    dimension(edited, radiusDimension(edited, result.filletEntityId!), 31);
    const snapshot = structuredClone(edited),
      failed = solveSketch(edited);
    expect(["invalid", "inconsistent", "notConverged"]).toContain(
      failed.status,
    );
    expect(failed.profile).toEqual(snapshot);
    expect(edited).toEqual(snapshot);
  });

  it("keeps separate coincident corner identities and avoids duplicating an existing coincidence chain", () => {
    const input = corner();
    input.points.push(p("corner-a", 0, 0), p("corner-b", 0, 0));
    for (const [i, id] of [
      [0, "corner-a"],
      [1, "corner-b"],
    ] as const) {
      const e = input.entities[i];
      if (e.type === "line") e.start = id;
    }
    input.constraints.push({
      id: "coincidence",
      type: "coincident",
      a: "corner-a",
      b: "corner-b",
    });
    const result = plan(input);
    expect(
      result.profile.constraints.filter((c) => c.type === "coincident"),
    ).toEqual([input.constraints[0]]);
    expectXY(xy(result.profile, "corner-a"), 0, 0);
    expectXY(xy(result.profile, "corner-b"), 0, 0);
    solve(result.profile);
  });

  it("allocates bounded globally unique IDs across points, entities and constraints", () => {
    const input = corner();
    input.points.push(
      p("fillet-center-1", 100, 100),
      p("fillet-arc-1", 100, 110),
      p("fillet-constraint-1", 100, 120),
    );
    input.entities.push(
      line("fillet-point-1", "fillet-center-1", "fillet-arc-1", true),
    );
    const result = plan(input),
      ids = [
        ...result.profile.points,
        ...result.profile.entities,
        ...result.profile.constraints,
      ].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length <= 128)).toBe(true);
  });

  it("handles a small valid fillet close to the coordinate envelope", () => {
    const input = corner();
    input.points.forEach((point) => {
      point.x += 999960;
      point.y -= 999960;
    });
    input.points.push(p("vertex", 999960, -999960));
    for (const e of input.entities) if (e.type === "line") e.start = "vertex";
    const result = plan(input, { ...params, radius: 0.01 }),
      f = rounded(result.profile, result.filletEntityId!);
    expectXY(f.c, 999960.01, -999959.99, 6);
    solve(result.profile);
  });

  it("deletes exclusive corner constraints and driving lengths while retaining driven observations", () => {
    const input = definedCorner();
    input.points.push(p("vertex", 0, 0));
    for (const e of input.entities)
      if (e.type === "line") {
        if (e.start === "origin") e.start = "vertex";
        if (e.end === "origin") e.end = "vertex";
      }
    input.constraints.push({
      id: "fix-corner",
      type: "fix",
      pointId: "vertex",
      x: 0,
      y: 0,
    });
    const result = plan(input, { ...params, cornerPolicy: "delete" });
    expect(result.deletedConstraintIds).toEqual([
      "old-a",
      "old-b",
      "fix-corner",
    ]);
    expect(result.convertedConstraintIds).toEqual([]);
    expect(result.profile.points.some((point) => point.id === "vertex")).toBe(
      false,
    );
    expect(
      result.profile.constraints.some(
        (c) => c.type === "pointOnLine" || c.type === "pointOnCircle",
      ),
    ).toBe(false);
    expect(solve(result.profile).drivenValues.reading).toBeCloseTo(38, 7);
  });

  it("protects shared corner points/fixes and constraints referring to unrelated geometry in delete mode", () => {
    const input = corner();
    input.points.push(p("vertex", 0, 0), p("neighbor", -20, -20));
    for (const e of input.entities)
      if (e.type === "line" && e.start === "origin") e.start = "vertex";
    input.entities.push(line("third", "vertex", "neighbor"));
    input.constraints.push(
      { id: "fix-corner", type: "fix", pointId: "vertex", x: 0, y: 0 },
      { id: "fix-neighbor", type: "fix", pointId: "neighbor", x: -20, y: -20 },
    );
    const result = plan(input, { ...params, cornerPolicy: "delete" });
    expect(result.deletedConstraintIds).toEqual([]);
    expect(result.profile.constraints).toContainEqual(input.constraints[0]);
    expect(entity(result.profile, "third")).toEqual(input.entities[2]);
    expectXY(xy(result.profile, "vertex"), 0, 0);
    expect(result.message).toContain("esquina compartida");
    expect(
      result.profile.constraints.some(
        (c) => c.type === "pointOnLine" || c.type === "pointOnCircle",
      ),
    ).toBe(false);
    expect(
      planSketchFillet(input, [{ kind: "point", id: "vertex" }], params)
        .changed,
    ).toBe(false);
  });

  it.each([false, true])(
    "keeps an old endpoint's anchor when its source partner retains it as an arc center (reversed selection %s)",
    (reversed) => {
      const input: EntityProfile = {
        kind: "entities",
        points: [
          p("center", 50, -10),
          p("far-a", 80, -10),
          p("old-arc-start", 58, -10),
          p("far-b", 50, -2),
        ],
        entities: [
          line("a", "center", "far-a"),
          arc("b", "center", "old-arc-start", "far-b"),
        ],
        constraints: [
          {
            id: "center-anchor",
            type: "fix",
            pointId: "center",
            x: 50,
            y: -10,
          },
          { id: "line-anchor", type: "fix", pointId: "far-a", x: 80, y: -10 },
          { id: "arc-anchor", type: "fix", pointId: "far-b", x: 50, y: -2 },
          { id: "line-horizontal", type: "horizontal", entityId: "a" },
          {
            id: "original-contact",
            type: "pointOnLine",
            pointId: "old-arc-start",
            entityId: "a",
          },
        ],
      };
      expect(solve(input).degreesOfFreedom).toBe(0);
      const snapshot = structuredClone(input);
      const result = plan(
        input,
        { ...params, cornerPolicy: "delete" },
        reversed ? [...pair].reverse() : pair,
      );
      expect(input).toEqual(snapshot);
      expect(result.deletedConstraintIds).toEqual(["original-contact"]);
      expect(result.profile.constraints).toContainEqual(input.constraints[0]);
      expect(
        result.profile.points.some((point) => point.id === "old-arc-start"),
      ).toBe(false);
      expect(entity(result.profile, "b")).toMatchObject({ center: "center" });
      const committed = solve(result.profile);
      expect(committed.degreesOfFreedom).toBe(0);
      expectXY(
        rounded(committed.profile, result.filletEntityId!).c,
        50 + 4 * Math.sqrt(6),
        -8,
        6,
      );
      const document = createDocument("Retained circular support");
      document.features.push({
        id: "sketch",
        name: "Sketch",
        type: "sketch",
        suppressed: false,
        plane: "XY",
        offset: 0,
        profile: committed.profile,
      });
      const reopened = parseDocument(serializeDocument(document));
      const sketch = reopened.features[0];
      if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
        throw new Error("Expected entity sketch");
      expect(sketch.profile.constraints).toContainEqual(input.constraints[0]);
      dimension(
        sketch.profile,
        radiusDimension(sketch.profile, result.filletEntityId!),
        3,
      );
      const edited = solve(sketch.profile);
      expect(edited.degreesOfFreedom).toBe(0);
      expectXY(xy(edited.profile, "center"), 50, -10, 6);
      expectXY(
        rounded(edited.profile, result.filletEntityId!).c,
        50 + 4 * Math.sqrt(7),
        -7,
        6,
      );
    },
  );

  it("keeps origin constraints in delete mode without adding virtual-corner supports", () => {
    const input = corner();
    input.constraints.push({
      id: "origin-constraint",
      type: "distance",
      a: "origin",
      b: "far-a",
      value: 40,
    });
    const result = plan(input, { ...params, cornerPolicy: "delete" });
    expect(result.profile.constraints).toContainEqual(input.constraints[0]);
    expect(result.deletedConstraintIds).toEqual([]);
    expect(
      result.profile.constraints.some((c) => c.type === "pointOnLine"),
    ).toBe(false);
  });

  it("keeps stable branch slots across radius edits and never falls back from a missing explicit branch", () => {
    const input = externalLineArc(),
      first = plan(input),
      next = plan(input, {
        ...params,
        radius: 3,
        solutionIndex: first.selectedSolutionIndex!,
      });
    expect(next.selectedSolutionIndex).toBe(first.selectedSolutionIndex);
    const rejected = planSketchFillet(input, pair, {
      ...params,
      solutionIndex: 999,
    });
    expect(rejected.changed).toBe(false);
    expect(rejected.profile).toBe(input);
    expect(rejected.candidates.length).toBeGreaterThan(0);
    expect(rejected.selectedSolutionIndex).toBeNull();
  });

  it("is deterministic and pure on frozen stale input, without solving or allocating UUIDs", () => {
    const input = definedCorner();
    dimension(input, "old-a", 80);
    input.points.forEach(Object.freeze);
    input.entities.forEach(Object.freeze);
    input.constraints.forEach(Object.freeze);
    Object.freeze(input.points);
    Object.freeze(input.entities);
    Object.freeze(input.constraints);
    Object.freeze(input);
    const random = vi.spyOn(crypto, "randomUUID");
    try {
      const first = plan(input),
        second = plan(input);
      expect(first).toEqual(second);
      expect(random).not.toHaveBeenCalled();
      expectXY(xy(first.profile, "far-a"), 40, 0);
    } finally {
      random.mockRestore();
    }
  });

  it.each([0, -1, Number.NaN, Infinity, 100001, 30, 50])(
    "rejects invalid or excessive radius %s atomically",
    (radius) => {
      const input = corner(),
        snapshot = structuredClone(input),
        result = planSketchFillet(input, pair, { ...params, radius });
      expect(result.changed).toBe(false);
      expect(result.profile).toBe(input);
      expect(result.sourceProfile).toBe(input);
      expect(result.filletEntityId).toBeNull();
      expect(result.createdEntityIds).toEqual([]);
      expect(result.createdConstraintIds).toEqual([]);
      expect(result.deletedConstraintIds).toEqual([]);
      expect(result.convertedConstraintIds).toEqual([]);
      expect(input).toEqual(snapshot);
    },
  );

  it("rejects unsupported sources, malformed references and invalid equality targets", () => {
    const input = corner();
    expect(planSketchFillet(input, [pair[0], pair[0]], params).changed).toBe(
      false,
    );
    expect(planSketchFillet(input, [], params).changed).toBe(false);
    expect(
      planSketchFillet(input, pair, { ...params, equalRadiusEntityId: "a" })
        .changed,
    ).toBe(false);
    input.points.push(p("master-center", 100, 100));
    input.entities.push({
      id: "master",
      type: "circle",
      center: "master-center",
      radius: 3,
      construction: true,
    });
    expect(
      planSketchFillet(input, pair, {
        ...params,
        equalRadiusEntityId: "master",
      }).changed,
    ).toBe(false);
    expect(
      planSketchFillet(
        input,
        [pair[0], { kind: "entity", id: "master" }],
        params,
      ).changed,
    ).toBe(false);
    input.points[0].x = Number.NaN;
    expect(planSketchFillet(input, pair, params).profile).toBe(input);
  });

  it.each(["points", "entities", "constraints"] as const)(
    "rolls back atomically at the %s file limit",
    (kind) => {
      const input = corner();
      if (kind === "points")
        for (let i = input.points.length; i < 128; i++)
          input.points.push(p(`extra-${i}`, i, 100));
      if (kind === "entities")
        for (let i = input.entities.length; i < 128; i++)
          input.entities.push(line(`extra-${i}`, "far-a", "far-b", true));
      if (kind === "constraints")
        for (let i = 0; i < 256; i++)
          input.constraints.push({
            id: `extra-${i}`,
            type: "horizontal",
            entityId: "a",
          });
      const snapshot = structuredClone(input),
        result = planSketchFillet(input, pair, params);
      expect(result.changed).toBe(false);
      expect(result.profile).toBe(input);
      expect(input).toEqual(snapshot);
    },
  );
});
