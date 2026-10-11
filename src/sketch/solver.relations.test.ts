import { expect, it } from "vitest";
import { solveSketch, SKETCH_SOLVER_TOLERANCE } from "./solver";
import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  TangentBranch,
} from "./types";

const point = (id: string, x: number, y: number) => ({ id, x, y });
const line = (id: string, start: string, end: string): SketchEntity => ({
  id,
  type: "line",
  construction: false,
  start,
  end,
});
const circle = (id: string, center: string, radius: number): SketchEntity => ({
  id,
  type: "circle",
  construction: false,
  center,
  radius,
});
const arc = (
  id: string,
  center: string,
  start: string,
  end: string,
): SketchEntity => ({
  id,
  type: "arc",
  construction: false,
  clockwise: false,
  center,
  start,
  end,
});
const fix = (pointId: string, x: number, y: number): SketchConstraint => ({
  id: `fix-${pointId}`,
  type: "fix",
  pointId,
  x,
  y,
});
const radius = (entityId: string, value: number): SketchConstraint => ({
  id: `radius-${entityId}`,
  type: "radius",
  entityId,
  value,
});
const profile = (
  points: EntityProfile["points"],
  entities: SketchEntity[],
  constraints: SketchConstraint[],
): EntityProfile => ({ kind: "entities", points, entities, constraints });
const get = (value: EntityProfile, id: string) =>
  id === "origin" ? point(id, 0, 0) : value.points.find((p) => p.id === id)!;
function accepted(input: EntityProfile) {
  const result = solveSketch(input);
  expect(["fullyDefined", "underdefined"], result.message).toContain(
    result.status,
  );
  expect(result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
  return result;
}
function angular(
  value = 60,
  reversedA = false,
  reversedB = false,
  clockwise = false,
): EntityProfile {
  return profile(
    [point("a", 10, 0), point("b", 7, 7)],
    [line("a-line", "origin", "a"), line("b-line", "origin", "b")],
    [
      fix("a", 10, 0),
      { id: "length", type: "length", entityId: "b-line", value: 10 },
      {
        id: "angle",
        type: "angle",
        a: "a-line",
        b: "b-line",
        value,
        reversedA,
        reversedB,
        clockwise,
      },
    ],
  );
}
it.each([0.001, 30, 90, 120, 180, 240, 359.99])(
  "solves the persisted directed angular sector at %s degrees",
  (value) => {
    const result = accepted(angular(value)),
      b = get(result.profile, "b");
    expect(result.degreesOfFreedom).toBe(0);
    expect(b.x).toBeCloseTo(10 * Math.cos((value * Math.PI) / 180), 6);
    expect(b.y).toBeCloseTo(10 * Math.sin((value * Math.PI) / 180), 6);
  },
);
it.each([
  [false, false, true],
  [true, false, false],
  [false, true, false],
  [true, true, true],
])("respects reversed rays and clockwise sense (%s/%s/%s)", (a, b, cw) => {
  const result = accepted(angular(35, a, b, cw)),
    p = get(result.profile, "b"),
    theta =
      ((cw ? -35 : 35) * Math.PI) / 180 + (a ? Math.PI : 0) - (b ? Math.PI : 0);
  expect(result.degreesOfFreedom).toBe(0);
  expect(p.x).toBeCloseTo(10 * Math.cos(theta), 6);
  expect(p.y).toBeCloseTo(10 * Math.sin(theta), 6);
});
it("changes the numerical angle without silently choosing its supplementary/reflected branch", () => {
  let current = accepted(angular(240, false, false, true)).profile;
  for (const value of [230, 200, 181, 179, 120, 35]) {
    const constraint = current.constraints.find((c) => c.id === "angle")!;
    if (constraint.type !== "angle") throw new Error("angle");
    constraint.value = value;
    current = accepted(current).profile;
    const b = get(current, "b");
    expect(b.x).toBeCloseTo(10 * Math.cos((-value * Math.PI) / 180), 6);
    expect(b.y).toBeCloseTo(10 * Math.sin((-value * Math.PI) / 180), 6);
    expect(current.constraints.find((c) => c.id === "angle")).toMatchObject({
      value,
      clockwise: true,
      reversedA: false,
      reversedB: false,
    });
  }
});
it("reports conflicting angular dimensions and preserves all input geometry and branch fields", () => {
  const input = angular();
  input.constraints.push({
    ...input.constraints.at(-1)!,
    id: "other-angle",
    value: 120,
  } as SketchConstraint);
  const original = structuredClone(input),
    result = solveSketch(input);
  expect(result.status).toBe("inconsistent");
  expect(result.profile).toEqual(original);
  expect(input).toEqual(original);
  expect(result.conflictingConstraintIds).toEqual(
    expect.arrayContaining(["angle", "other-angle"]),
  );
});
it("reports duplicate angular equations as compatible redundancy, without removing DOF twice", () => {
  const input = angular();
  input.constraints.push({ ...input.constraints.at(-1)!, id: "duplicate" });
  const result = accepted(input);
  expect(result.degreesOfFreedom).toBe(0);
  expect(result.redundantConstraintIds).toContain("duplicate");
});
function lineCircle(branch: "left" | "right"): EntityProfile {
  return profile(
    [point("end", 10, 0), point("center", 25, branch === "left" ? 8 : -8)],
    [line("line", "origin", "end"), circle("circle", "center", 3)],
    [
      fix("end", 10, 0),
      { id: "x", type: "distanceX", a: "origin", b: "center", value: 25 },
      radius("circle", 3),
      { id: "tangent", type: "tangent", a: "line", b: "circle", branch },
    ],
  );
}
it.each(["left", "right"] as const)(
  "keeps the %s tangent side and permits contact on the extension of a short line",
  (branch) => {
    const result = accepted(lineCircle(branch));
    expect(result.degreesOfFreedom).toBe(0);
    expect(get(result.profile, "center").x).toBeCloseTo(25, 6);
    expect(get(result.profile, "center").y).toBeCloseTo(
      branch === "left" ? 3 : -3,
      6,
    );
    const changed = result.profile;
    const dimension = changed.constraints.find(
      (c) => c.id === "radius-circle",
    )!;
    if (dimension.type !== "radius") throw new Error("radius");
    dimension.value = 6;
    expect(get(accepted(changed).profile, "center").y).toBeCloseTo(
      branch === "left" ? 6 : -6,
      6,
    );
  },
);
it("uses a full circle support for an arc even when contact is outside its trimmed sweep", () => {
  const input = profile(
    [
      point("end", 10, 0),
      point("c", 25, 3),
      point("s", 28, 3),
      point("e", 25, 6),
    ],
    [line("line", "origin", "end"), arc("arc", "c", "s", "e")],
    [
      fix("end", 10, 0),
      fix("c", 25, 3),
      fix("s", 28, 3),
      fix("e", 25, 6),
      { id: "tangent", type: "tangent", a: "line", b: "arc", branch: "left" },
    ],
  );
  const result = accepted(input);
  expect(result.degreesOfFreedom).toBe(0);
  expect(result.profile.entities[1]).toMatchObject({
    start: "s",
    end: "e",
    clockwise: false,
  });
});
it.each([false, true])(
  "uses a regular angular equation for a line/arc joint, explicit coincidence=%s",
  (separate) => {
    const input = profile(
      [
        point("joint", 10, 0),
        ...(separate ? [point("joint-copy", 10, 0)] : []),
        point("c", 5, 0),
        point("e", 5, 5),
      ],
      [
        line("line", "origin", "joint"),
        arc("arc", "c", separate ? "joint-copy" : "joint", "e"),
      ],
      [
        fix("joint", 10, 0),
        radius("arc", 5),
        {
          id: "endpoint-direction",
          type: "distanceY",
          a: "c",
          b: "e",
          value: 0,
        },
        { id: "tangent", type: "tangent", a: "line", b: "arc", branch: "left" },
        ...(separate
          ? [
              {
                id: "join",
                type: "coincident",
                a: "joint",
                b: "joint-copy",
              } as SketchConstraint,
            ]
          : []),
      ],
    );
    const result = accepted(input);
    expect(result.degreesOfFreedom).toBe(0);
    expect(result.redundantConstraintIds).not.toContain("tangent");
    expect(get(result.profile, "c").x).toBeCloseTo(10, 6);
    expect(get(result.profile, "c").y).toBeCloseTo(5, 6);
    expect(Math.abs(get(result.profile, "e").x - 10)).toBeCloseTo(5, 6);
    expect(get(result.profile, "e").y).toBeCloseTo(5, 6);
  },
);
it("counts the remaining arc endpoint rotation when its tangent joint and radius are fixed", () => {
  const input = profile(
    [point("joint", 10, 0), point("c", 10, 5), point("e", 15, 5)],
    [line("line", "origin", "joint"), arc("arc", "c", "joint", "e")],
    [
      fix("joint", 10, 0),
      radius("arc", 5),
      { id: "tangent", type: "tangent", a: "line", b: "arc", branch: "left" },
    ],
  );
  expect(accepted(input)).toMatchObject({
    status: "underdefined",
    degreesOfFreedom: 1,
    redundantConstraintIds: [],
  });
});
it("regularizes a declared arc-endpoint contact on an infinite line without adding coincidence to either line endpoint", () => {
  const input = profile(
    [
      point("line-end", 10, 0),
      point("joint", 25, 0),
      point("c", 25, 5),
      point("e", 30, 5),
    ],
    [line("line", "origin", "line-end"), arc("arc", "c", "joint", "e")],
    [
      fix("line-end", 10, 0),
      {
        id: "contact",
        type: "pointOnLine",
        pointId: "joint",
        entityId: "line",
      },
      radius("arc", 5),
      { id: "tangent", type: "tangent", a: "line", b: "arc", branch: "left" },
    ],
  );
  const result = accepted(input);
  expect(result.degreesOfFreedom).toBe(2);
  expect(result.redundantConstraintIds).not.toContain("tangent");
  expect(result.profile.constraints).toEqual(input.constraints);
});
it("resolves point-on-line contact through transitive coincidence IDs regardless of relation order", () => {
  const input = profile(
    [
      point("line-end", 10, 0),
      point("alias", 25, 0),
      point("middle", 25, 0),
      point("joint", 25, 0),
      point("c", 25, 5),
      point("e", 30, 5),
    ],
    [line("line", "origin", "line-end"), arc("arc", "c", "joint", "e")],
    [
      fix("line-end", 10, 0),
      { id: "tangent", type: "tangent", a: "line", b: "arc", branch: "left" },
      {
        id: "contact",
        type: "pointOnLine",
        pointId: "alias",
        entityId: "line",
      },
      radius("arc", 5),
      { id: "join2", type: "coincident", a: "middle", b: "joint" },
      { id: "join1", type: "coincident", a: "alias", b: "middle" },
    ],
  );
  const snapshot = structuredClone(input),
    result = accepted(input);
  expect(result.degreesOfFreedom).toBe(2);
  expect(result.redundantConstraintIds).not.toContain("tangent");
  expect(result.profile.constraints).toEqual(snapshot.constraints);
  expect(input).toEqual(snapshot);
  const reordered = structuredClone(input);
  reordered.constraints.reverse();
  expect(accepted(reordered).degreesOfFreedom).toBe(2);
});
function pair(branch: TangentBranch): EntityProfile {
  return profile(
    [point("b", branch === "external" ? 9 : 3, 0)],
    [
      circle("a", "origin", branch === "bContainsA" ? 3 : 5),
      circle("b-circle", "b", branch === "bContainsA" ? 5 : 3),
    ],
    [
      radius("a", branch === "bContainsA" ? 3 : 5),
      radius("b-circle", branch === "bContainsA" ? 5 : 3),
      { id: "y", type: "distanceY", a: "origin", b: "b", value: 0 },
      { id: "tangent", type: "tangent", a: "a", b: "b-circle", branch },
    ],
  );
}
it.each(["external", "aContainsB", "bContainsA"] as const)(
  "retains the persisted circular branch %s",
  (branch) => {
    const result = accepted(pair(branch));
    expect(result.degreesOfFreedom).toBe(0);
    expect(get(result.profile, "b").x).toBeCloseTo(
      branch === "external" ? 8 : 2,
      6,
    );
  },
);
it.each(["external", "aContainsB", "bContainsA"] as const)(
  "regularizes the rank of two arcs with a shared endpoint, branch %s",
  (branch) => {
    const ra = branch === "bContainsA" ? 3 : 5,
      rb = branch === "bContainsA" ? 5 : 3;
    const input = profile(
      [
        point("a-center", -ra, 0),
        point("a-end", -ra, ra),
        point("b-center", 0, rb),
        point("b-end", 0, 2 * rb),
      ],
      [
        arc("a", "a-center", "origin", "a-end"),
        arc("b", "b-center", "origin", "b-end"),
      ],
      [
        fix("a-center", -ra, 0),
        fix("a-end", -ra, ra),
        radius("b", rb),
        { id: "end-x", type: "distanceX", a: "b-center", b: "b-end", value: 0 },
        { id: "tangent", type: "tangent", a: "a", b: "b", branch },
      ],
    );
    const result = accepted(input);
    expect(result.degreesOfFreedom).toBe(0);
    expect(result.redundantConstraintIds).not.toContain("tangent");
    expect(get(result.profile, "b-center").x).toBeCloseTo(
      branch === "external" ? rb : -rb,
      6,
    );
    expect(get(result.profile, "b-center").y).toBeCloseTo(0, 6);
  },
);
it.each([5, 7])(
  "repairs stale internal-tangency radii (%s) when the driving dimensions retain the selected container",
  (staleRadius) => {
    const input = pair("aContainsB");
    if (input.entities[1].type === "circle")
      input.entities[1].radius = staleRadius;
    const result = accepted(input);
    expect(result.degreesOfFreedom).toBe(0);
    expect(get(result.profile, "b").x).toBeCloseTo(2, 6);
    const circular = result.profile.entities[1];
    if (circular.type !== "circle") throw new Error("circle");
    expect(circular.radius).toBeCloseTo(3, 7);
    expect(result.profile.constraints.at(-1)).toMatchObject({
      branch: "aContainsB",
    });
  },
);
it("rejects impossible equal-radius internal tangency and never silently exchanges its containing circle", () => {
  const equal = pair("aContainsB");
  if (equal.entities[1].type === "circle") equal.entities[1].radius = 5;
  const equalDimension = equal.constraints.find(
    (c) => c.id === "radius-b-circle",
  )!;
  if (equalDimension.type === "radius") equalDimension.value = 5;
  const result = solveSketch(equal);
  expect(["inconsistent", "notConverged"]).toContain(result.status);
  expect(result.profile).toEqual(equal);
  expect(result.degreesOfFreedom).toBeNull();
  const changed = accepted(pair("aContainsB")).profile;
  const dimension = changed.constraints.find((c) => c.id === "radius-a")!;
  if (dimension.type !== "radius") throw new Error("radius");
  dimension.value = 2;
  const failed = solveSketch(changed);
  expect(["inconsistent", "notConverged"]).toContain(failed.status);
  expect(failed.profile).toEqual(changed);
  expect(failed.degreesOfFreedom).toBeNull();
});
it("reports an incompatible tangent relation without returning the moved least-squares geometry", () => {
  const input = lineCircle("left");
  input.constraints.push(fix("center", 25, 8));
  const result = solveSketch(input);
  expect(result.status).toBe("inconsistent");
  expect(result.conflictingConstraintIds).toContain("tangent");
  expect(result.profile).toEqual(input);
});
it("preserves input on a singular coincident-centre external tangency", () => {
  const input = pair("external");
  input.points[0].x = 0;
  const result = solveSketch(input);
  expect(result.status).toBe("notConverged");
  expect(result.degreesOfFreedom).toBeNull();
  expect(result.profile).toEqual(input);
});
it("solves a small tangent circle at a large coordinate offset without mixing angle units into the length scale", () => {
  const input = lineCircle("left");
  input.points.unshift(point("start", 900000, 900000));
  input.points[1] = point("end", 900000.1, 900000);
  input.points[2] = point("center", 900000.3, 900000.04);
  input.entities[0] = line("line", "start", "end");
  input.entities[1] = circle("circle", "center", 0.02);
  input.constraints = [
    fix("start", 900000, 900000),
    fix("end", 900000.1, 900000),
    { id: "x", type: "distanceX", a: "start", b: "center", value: 0.3 },
    radius("circle", 0.02),
    { id: "tangent", type: "tangent", a: "line", b: "circle", branch: "left" },
  ];
  expect(get(accepted(input).profile, "center").y).toBeCloseTo(900000.02, 6);
});
