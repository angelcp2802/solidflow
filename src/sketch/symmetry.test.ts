import { describe, expect, it } from "vitest";
import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";
import { SKETCH_SOLVER_TOLERANCE, solveSketch } from "./solver";
import { validateEntityProfile } from "./validation";
import { constraintEntityReferences, constraintPointReferences, constraintReferences } from "./references";
import { constraintReferences as editingReferences, removeSelection } from "./editing";
import { trimToClosest } from "./trim";
import { extendToClosest } from "./extend";
import { planSketchFillet } from "./fillet";

// Synthetic analytical fixtures, in mm. Expected reflections are stated
// independently of the planner and solver equations.
type XY = [number, number];
const p = (id: string, [x, y]: XY) => ({ id, x, y });
const line = (id: string, start: string, end: string, construction = false): SketchEntity =>
  ({ id, type: "line", start, end, construction });
const fixed = (pointId: string, [x, y]: XY): SketchConstraint =>
  ({ id: `fix-${pointId}`, type: "fix", pointId, x, y });
const xy = (profile: EntityProfile, id: string) => id === "origin"
  ? { x: 0, y: 0 } : profile.points.find(point => point.id === id)!;
const expectXY = (profile: EntityProfile, id: string, expected: XY) => {
  expect(xy(profile, id).x).toBeCloseTo(expected[0], 6);
  expect(xy(profile, id).y).toBeCloseTo(expected[1], 6);
};
function fixture(axisStart: XY = [0, -4], axisEnd: XY = [0, 4], source: XY = [3, 2]): EntityProfile {
  return {
    kind: "entities",
    points: [p("axis-start", axisStart), p("axis-end", axisEnd), p("source", source), p("image", [4, 1])],
    entities: [line("axis", "axis-start", "axis-end", true)],
    constraints: [fixed("axis-start", axisStart), fixed("axis-end", axisEnd), fixed("source", source),
      { id: "symmetry", type: "symmetric", a: "source", b: "image", axisId: "axis" }],
  };
}
function accepted(profile: EntityProfile) {
  const original = structuredClone(profile);
  const result = solveSketch(profile);
  expect(result.status, result.message).toBe("fullyDefined");
  expect(result.degreesOfFreedom).toBe(0);
  expect(result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
  expect(profile).toEqual(original);
  return result;
}
function changeFix(profile: EntityProfile, id: string, target: XY) {
  const constraint = profile.constraints.find(c => c.id === `fix-${id}`)!;
  if (constraint.type !== "fix") throw new Error("Expected fixture fix");
  [constraint.x, constraint.y] = target;
}

describe("associative point reflection equations", () => {
  it.each([
    { axis: [[0, -4], [0, 4]], source: [3, 2], image: [-3, 2] },
    { axis: [[-4, 0], [4, 0]], source: [3, 2], image: [3, -2] },
    { axis: [[-4, -4], [4, 4]], source: [3, 2], image: [2, 3] },
    { axis: [[-4, -3], [4, 5]], source: [3, 2], image: [1, 4] },
    { axis: [[2, -2], [2, 2]], source: [3, 20], image: [1, 20] },
    { axis: [[100000, 99996], [100000, 100004]], source: [100003, 100002], image: [99997, 100002] },
  ] as { axis: [XY, XY]; source: XY; image: XY }[])("reflects $source through $axis, including its support beyond endpoints", ({ axis, source, image }) => {
    for (const [start, end] of [axis, [axis[1], axis[0]]]) {
      const input = fixture(start, end, source);
      const solved = accepted(input);
      expectXY(solved.profile, "source", source);
      expectXY(solved.profile, "image", image);
      expect(solved.redundantConstraintIds).toEqual([]);
    }
  });

  it("repairs coincident off-axis starting coordinates and is invariant to swapping the point roles", () => {
    for (const reversed of [false, true]) {
      const input = fixture();
      Object.assign(input.points.find(p => p.id === "image")!, { x: 3, y: 2 });
      const relation = input.constraints.find(c => c.type === "symmetric")!;
      if (relation.type === "symmetric" && reversed) [relation.a, relation.b] = [relation.b, relation.a];
      const solved = accepted(input);
      expectXY(solved.profile, "image", [-3, 2]);
    }
  });

  it("propagates successive source edits without fixing the image", () => {
    let profile = accepted(fixture()).profile;
    for (const [source, image] of [[[5, -3], [-5, -3]], [[-2, 7], [2, 7]]] as [XY, XY][]) {
      changeFix(profile, "source", source);
      profile = accepted(profile).profile;
      expectXY(profile, "source", source);
      expectXY(profile, "image", image);
      expect(profile.constraints.filter(c => c.type === "fix").map(c => c.pointId)).not.toContain("image");
    }
  });

  it("propagates translation and rotation of a movable axis with analytic axis derivatives", () => {
    let profile = accepted(fixture()).profile;
    for (const [start, end, image] of [
      [[1, -4], [1, 4], [-1, 2]],
      [[-4, -3], [4, 5], [1, 4]],
      [[-4, 0], [4, 0], [3, -2]],
    ] as [XY, XY, XY][]) {
      changeFix(profile, "axis-start", start);
      changeFix(profile, "axis-end", end);
      profile = accepted(profile).profile;
      expectXY(profile, "axis-start", start);
      expectXY(profile, "axis-end", end);
      expectXY(profile, "image", image);
    }
  });

  it("solves a free axis location from an anchored source and image", () => {
    const input = fixture([1, -4], [1, 4]);
    input.constraints = [fixed("source", [3, 2]), fixed("image", [-3, 2]),
      { id: "axis-vertical", type: "vertical", entityId: "axis" },
      { id: "axis-start-height", type: "distanceY", a: "origin", b: "axis-start", value: -4 },
      { id: "axis-end-height", type: "distanceY", a: "origin", b: "axis-end", value: 4 },
      { id: "symmetry", type: "symmetric", a: "source", b: "image", axisId: "axis" }];
    const solved = accepted(input);
    expectXY(solved.profile, "axis-start", [0, -4]);
    expectXY(solved.profile, "axis-end", [0, 4]);
  });

  it("reflects the immutable origin through an offset axis without creating or moving origin", () => {
    const input = fixture([3, -4], [3, 4]);
    input.points = input.points.filter(p => p.id !== "source");
    input.constraints = input.constraints.filter(c => c.id !== "fix-source");
    const relation = input.constraints.find(c => c.type === "symmetric")!;
    if (relation.type === "symmetric") relation.a = "origin";
    const solved = accepted(input);
    expectXY(solved.profile, "image", [6, 0]);
    expect(solved.profile.points.some(p => p.id === "origin")).toBe(false);
  });

  it("allows distinct point identities to meet on an axis endpoint", () => {
    const input = fixture();
    input.points = input.points.filter(p => p.id !== "source");
    input.constraints = input.constraints.filter(c => c.id !== "fix-source");
    const relation = input.constraints.find(c => c.type === "symmetric")!;
    if (relation.type === "symmetric") relation.a = "axis-start";
    const solved = accepted(input);
    expectXY(solved.profile, "image", [0, -4]);
    expect(solved.profile.points.map(p => p.id)).toContain("image");
  });

  it("counts exactly two relations without fixing the source or axis", () => {
    const input = fixture();
    input.constraints = input.constraints.filter(c => c.type === "symmetric");
    const result = solveSketch(input);
    expect(result.status, result.message).toBe("underdefined");
    expect(result.degreesOfFreedom).toBe(6);
    expect(result.redundantConstraintIds).toEqual([]);
  });

  it("keeps a separate circle radius equality associative", () => {
    const input = fixture();
    input.entities.push(
      { id: "source-circle", type: "circle", center: "source", radius: 2, construction: false },
      { id: "image-circle", type: "circle", center: "image", radius: 3, construction: false },
    );
    input.constraints.push(
      { id: "radius", type: "radius", entityId: "source-circle", value: 2 },
      { id: "equal-radii", type: "equal", a: "source-circle", b: "image-circle" },
    );
    let solved = accepted(input);
    const edited = structuredClone(solved.profile);
    const radius = edited.constraints.find(c => c.id === "radius")!;
    if (radius.type === "radius") radius.value = 5;
    changeFix(edited, "source", [7, 1]);
    solved = accepted(edited);
    expectXY(solved.profile, "image", [-7, 1]);
    for (const entity of solved.profile.entities)
      if (entity.type === "circle") expect(entity.radius).toBeCloseTo(5, 6);
  });

  it("refines transported line orientations after a source dimension edit", () => {
    const input: EntityProfile = {
      kind: "entities",
      points: [p("a", [5, 0]), p("b", [5, 6]), p("seam", [0, 6]), p("axis-top", [0, 8]),
        p("image-a", [-5, 0]), p("image-b", [-5, 6])],
      entities: [line("bottom", "origin", "a"), line("right", "a", "b"), line("top", "b", "seam"),
        line("axis", "origin", "axis-top", true), line("image-bottom", "origin", "image-a"),
        line("image-right", "image-a", "image-b"), line("image-top", "image-b", "seam")],
      constraints: [
        { id: "h-bottom", type: "horizontal", entityId: "bottom" },
        { id: "v-right", type: "vertical", entityId: "right" },
        { id: "h-top", type: "horizontal", entityId: "top" },
        { id: "width", type: "length", entityId: "bottom", value: 5 },
        { id: "height", type: "length", entityId: "right", value: 6 },
        { id: "on-axis", type: "pointOnLine", pointId: "seam", entityId: "axis" },
        { id: "v-axis", type: "vertical", entityId: "axis" },
        { id: "axis-length", type: "length", entityId: "axis", value: 8 },
        { id: "s-a", type: "symmetric", a: "a", b: "image-a", axisId: "axis" },
        { id: "s-b", type: "symmetric", a: "b", b: "image-b", axisId: "axis" },
      ],
    };
    let profile = accepted(input).profile;
    for (const width of [7, 3, 9]) {
      const dimension = profile.constraints.find(c => c.id === "width")!;
      if (dimension.type === "length") dimension.value = width;
      const result = accepted(profile);
      expect(result.maxResidual).toBeLessThanOrEqual(1e-10);
      profile = result.profile;
      expectXY(profile, "image-a", [-width, 0]);
      expectXY(profile, "image-b", [-width, 6]);
      const bottom = xy(profile, "image-a"), top = xy(profile, "image-b");
      // Independent unit-normal components must stay below the 1e-8 naming
      // quantization boundary without imposing H/V on the image entities.
      expect(Math.abs(bottom.y / Math.hypot(bottom.x, bottom.y))).toBeLessThan(1e-11);
      expect(Math.abs((top.x - bottom.x) / Math.hypot(top.x - bottom.x, top.y - bottom.y))).toBeLessThan(1e-11);
    }
  });

  it("propagates an arc radius through its reflected points without changing either stored sweep direction", () => {
    const input = fixture();
    input.points = [p("axis-start", [0, -4]), p("axis-end", [0, 4]), p("source", [3, 2]),
      p("source-start", [5, 2]), p("source-end", [3, 4]), p("image", [-3, 2]),
      p("image-start", [-5, 2]), p("image-end", [-3, 4])];
    input.entities.push(
      { id: "source-arc", type: "arc", center: "source", start: "source-start", end: "source-end", clockwise: false, construction: false },
      { id: "image-arc", type: "arc", center: "image", start: "image-start", end: "image-end", clockwise: true, construction: false },
      line("radial-start", "source", "source-start", true), line("radial-end", "source", "source-end", true),
    );
    input.constraints.push(
      { id: "radius", type: "radius", entityId: "source-arc", value: 2 },
      { id: "h-radial", type: "horizontal", entityId: "radial-start" },
      { id: "v-radial", type: "vertical", entityId: "radial-end" },
      { id: "s-start", type: "symmetric", a: "source-start", b: "image-start", axisId: "axis" },
      { id: "s-end", type: "symmetric", a: "source-end", b: "image-end", axisId: "axis" },
    );
    const profile = accepted(input).profile;
    const radius = profile.constraints.find(c => c.id === "radius")!;
    if (radius.type === "radius") radius.value = 3;
    const result = accepted(profile);
    expectXY(result.profile, "source-start", [6, 2]);
    expectXY(result.profile, "source-end", [3, 5]);
    expectXY(result.profile, "image-start", [-6, 2]);
    expectXY(result.profile, "image-end", [-3, 5]);
    expect(result.profile.entities.find(e => e.id === "source-arc")).toMatchObject({ clockwise: false });
    expect(result.profile.entities.find(e => e.id === "image-arc")).toMatchObject({ clockwise: true });
  });

  it("reports redundant point reflection and conflicting fixes without mutating rejected geometry", () => {
    const consistent = accepted(fixture()).profile;
    consistent.constraints.push({ id: "duplicate", type: "symmetric", a: "image", b: "source", axisId: "axis" });
    expect(accepted(consistent).redundantConstraintIds).toContain("duplicate");
    const conflicting = fixture();
    conflicting.constraints.push(fixed("image", [3, 2]));
    const original = structuredClone(conflicting);
    const result = solveSketch(conflicting);
    expect(result.status, result.message).toBe("inconsistent");
    expect(result.conflictingConstraintIds).toContain("symmetry");
    expect(result.profile).toEqual(original);
    expect(conflicting).toEqual(original);
  });

  it.each([0, 5e-7])("rejects a degenerate %s mm axis and preserves the complete input", length => {
    const input = fixture([0, 0], [0, length]);
    const original = structuredClone(input);
    expect(() => validateEntityProfile(input)).not.toThrow();
    const result = solveSketch(input);
    expect(result.status).toBe("invalid");
    expect(result.profile).toEqual(original);
    expect(input).toEqual(original);
  });
});

describe("point reflection validation and typed references", () => {
  it.each([
    { a: "missing" }, { b: "axis" }, { axisId: "missing" }, { a: "source", b: "source" },
    { driven: false }, { sourceId: "source" },
  ])("rejects malformed symmetric fields %s", patch => {
    const input = fixture();
    Object.assign(input.constraints.find(c => c.type === "symmetric")!, patch);
    expect(() => validateEntityProfile(input)).toThrow();
  });

  it("requires a line axis, accepts either construction state, and returns detached data", () => {
    const input = fixture();
    input.entities[0].construction = false;
    const copy = validateEntityProfile(input);
    expect(copy).toEqual(input);
    copy.points[0].x = 999;
    expect(input.points[0].x).toBe(0);
    input.entities[0] = { id: "axis", type: "circle", construction: true, center: "axis-start", radius: 4 };
    expect(() => validateEntityProfile(input)).toThrow();
  });

  it.each([
    [{ id: "c", type: "fix", pointId: "p", x: 1, y: 2 }, ["p"], []],
    [{ id: "c", type: "coincident", a: "p", b: "q" }, ["p", "q"], []],
    [{ id: "c", type: "symmetric", a: "p", b: "q", axisId: "l" }, ["p", "q"], ["l"]],
    [{ id: "c", type: "mirrorArcDirection", a: "arc-a", b: "arc-b", axisId: "l" }, [], ["arc-a", "arc-b", "l"]],
    ...["distance", "distanceX", "distanceY"].map(type => [{ id: "c", type, a: "p", b: "q", value: 2 }, ["p", "q"], []]),
    ...["pointOnLine", "pointOnCircle"].map(type => [{ id: "c", type, pointId: "p", entityId: "l" }, ["p"], ["l"]]),
    ...["horizontal", "vertical"].map(type => [{ id: "c", type, entityId: "l" }, [], ["l"]]),
    ...["length", "radius"].map(type => [{ id: "c", type, entityId: "l", value: 2 }, [], ["l"]]),
    ...["parallel", "perpendicular", "equal"].map(type => [{ id: "c", type, a: "l", b: "m" }, [], ["l", "m"]]),
    [{ id: "c", type: "tangent", a: "l", b: "m", branch: "left" }, [], ["l", "m"]],
    [{ id: "c", type: "angle", a: "l", b: "m", value: 45, reversedA: false, reversedB: false, clockwise: false }, [], ["l", "m"]],
  ] as [SketchConstraint, string[], string[]][])("classifies the references of %s", (constraint, points, entities) => {
    expect(constraintPointReferences(constraint)).toEqual(points);
    expect(constraintEntityReferences(constraint)).toEqual(entities);
    expect(constraintReferences(constraint)).toEqual([...points, ...entities]);
    expect(editingReferences(constraint)).toEqual([...points, ...entities]);
  });

  it.each(["source", "image", "axis-start"])("deleting referenced point %s removes its reflection constraint", id => {
    const input = fixture();
    const original = structuredClone(input);
    const removed = removeSelection(input, [{ kind: "point", id }]);
    expect(removed.constraints.some(c => c.type === "symmetric")).toBe(false);
    expect(() => validateEntityProfile(removed)).not.toThrow();
    expect(input).toEqual(original);
  });

  it("deleting the axis removes reflection and leaves standalone image/source points", () => {
    const input = fixture();
    const removed = removeSelection(input, [{ kind: "entity", id: "axis" }]);
    expect(removed.constraints.map(c => c.id)).toEqual(["fix-source"]);
    expect(removed.points.map(p => p.id)).toEqual(["source", "image"]);
    expect(() => validateEntityProfile(removed)).not.toThrow();
  });

  it("retains valid point associations when their original source entity alone is removed", () => {
    const input = fixture();
    input.entities.push(line("source-line", "source", "image"), line("other-use", "source", "axis-end"));
    input.entities.push(line("image-use", "image", "axis-start"));
    const removed = removeSelection(input, [{ kind: "entity", id: "source-line" }]);
    expect(removed.constraints.find(c => c.id === "symmetry")).toEqual(input.constraints.find(c => c.id === "symmetry"));
    expect(() => validateEntityProfile(removed)).not.toThrow();
  });

  it("whole-axis trim removes the relation through the shared reference helper", () => {
    const input = fixture();
    input.entities[0].construction = false;
    const original = structuredClone(input);
    const cut = trimToClosest(input, "axis", { x: 0, y: 0 });
    expect(cut.changed, cut.message).toBe(true);
    expect(cut.deletedEntityIds).toContain("axis");
    expect(cut.deletedConstraintIds).toContain("symmetry");
    expect(() => validateEntityProfile(cut.profile)).not.toThrow();
    expect(input).toEqual(original);
  });

  it("endpoint replacement drops only a relation whose old source point disappears", () => {
    const input = fixture();
    input.points.push(p("far", [7, 2]), p("cutter-start", [1, -1]), p("cutter-end", [1, 4]));
    input.entities.push(line("target", "source", "far"), line("cutter", "cutter-start", "cutter-end"));
    const original = structuredClone(input);
    const extended = extendToClosest(input, "target", { x: 3, y: 2 });
    expect(extended.changed, extended.message).toBe(true);
    expect(extended.deletedConstraintIds).toContain("symmetry");
    expect(extended.profile.points.some(p => p.id === "source")).toBe(false);
    expect(() => validateEntityProfile(extended.profile)).not.toThrow();
    expect(input).toEqual(original);
  });

  it("delete-corner fillet retains an old point required by an external reflection relation", () => {
    const input = fixture();
    Object.assign(input.points.find(p => p.id === "source")!, { x: 3, y: 0 });
    input.points.push(p("far-a", [13, 0]), p("far-b", [3, 10]));
    input.entities.push(line("a", "source", "far-a"), line("b", "source", "far-b"));
    const original = structuredClone(input);
    const result = planSketchFillet(input, [{ kind: "point", id: "source" }], { radius: 2, cornerPolicy: "delete" });
    expect(result.changed, result.message).toBe(true);
    expect(result.deletedConstraintIds).not.toContain("symmetry");
    expect(result.profile.constraints.find(c => c.id === "symmetry")).toEqual(input.constraints.find(c => c.id === "symmetry"));
    expect(result.profile.points.find(p => p.id === "source")).toEqual(input.points.find(p => p.id === "source"));
    expect(() => validateEntityProfile(result.profile)).not.toThrow();
    expect(input).toEqual(original);
  });
});
