import { describe, expect, it } from "vitest";
import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";
import { solveSketch } from "./solver";
import { validateEntityProfile } from "./validation";
import { constraintEntityReferences, constraintPointReferences } from "./references";
import { removeSelection } from "./editing";
import { orderedMirrorArcDirections } from "./mirror-directions";
import { addFeature, createDocument, parseDocument, serializeDocument, updateFeature } from "../model/document";

type Direction = Extract<SketchConstraint, { type: "mirrorArcDirection" }>;
type Arc = Extract<SketchEntity, { type: "arc" }>;
const relation = (id: string, a: string, b: string, axisId = "vertical-axis"): Direction =>
  ({ id, type: "mirrorArcDirection", a, b, axisId });

// Original authored R2 Cartesian quarter arcs. The isolated direction relation
// transports only the discrete flag; point reflection is tested separately.
function fixture(): EntityProfile {
  const profile: EntityProfile = {
    kind: "entities",
    points: [{ id: "axis-y", x: 0, y: 8 }, { id: "axis-x", x: 8, y: 0 }],
    entities: [
      { id: "vertical-axis", type: "line", construction: true, start: "origin", end: "axis-y" },
      { id: "horizontal-axis", type: "line", construction: true, start: "origin", end: "axis-x" },
    ],
    constraints: [],
  };
  for (const [id, cx, cy, sx, sy, ex, ey, clockwise] of [
    ["a", 3, 2, 5, 2, 3, 4, false], ["b", -3, 2, -5, 2, -3, 4, true],
    ["c", -3, -2, -5, -2, -3, -4, false], ["d", 3, -2, 5, -2, 3, -4, true],
  ] as [string, number, number, number, number, number, number, boolean][]) {
    profile.points.push({ id: `${id}-center`, x: cx, y: cy }, { id: `${id}-start`, x: sx, y: sy }, { id: `${id}-end`, x: ex, y: ey });
    profile.entities.push({ id, type: "arc", center: `${id}-center`, start: `${id}-start`, end: `${id}-end`, clockwise, construction: false });
  }
  profile.constraints = profile.points.map(p => ({ id: `fix-${p.id}`, type: "fix", pointId: p.id, x: p.x, y: p.y }));
  profile.constraints.push(relation("a-to-b", "a", "b"));
  return profile;
}
const arc = (profile: EntityProfile, id: string): Arc => profile.entities.find(entity => entity.id === id) as Arc;
const accepted = (input: EntityProfile) => {
  const before = structuredClone(input);
  const result = solveSketch(input);
  expect(result.status, result.message).toBe("fullyDefined");
  expect(result.degreesOfFreedom).toBe(0);
  expect(input).toEqual(before);
  return result.profile;
};

describe("source-owned reflected arc directions", () => {
  it("propagates a normal source clockwise edit before continuous winding checks", () => {
    const input = fixture(), points = structuredClone(input.points), constraints = structuredClone(input.constraints);
    arc(input, "a").clockwise = true;
    expect(() => validateEntityProfile(input)).not.toThrow();
    const result = accepted(input);
    expect(arc(input, "b").clockwise).toBe(true);
    expect(arc(result, "a").clockwise).toBe(true);
    expect(arc(result, "b").clockwise).toBe(false);
    for (const point of points) {
      const actual = result.points.find(p => p.id === point.id)!;
      expect(actual.x).toBeCloseTo(point.x, 12);
      expect(actual.y).toBeCloseTo(point.y, 12);
    }
    expect(result.constraints).toEqual(constraints);
    arc(result, "a").clockwise = false;
    expect(arc(accepted(result), "b").clockwise).toBe(true);
  });

  it("restores a direct image direction edit from its persisted source ownership", () => {
    const input = fixture();
    arc(input, "b").clockwise = false;
    const result = accepted(input);
    expect(arc(result, "a").clockwise).toBe(false);
    expect(arc(result, "b").clockwise).toBe(true);
    expect(arc(input, "b").clockwise).toBe(false);
  });

  it.each([false, true])("propagates a repeated mirror chain regardless of constraint storage order (%s)", reverse => {
    const input = fixture();
    input.constraints.push(relation("b-to-c", "b", "c", "horizontal-axis"), relation("a-to-d", "a", "d", "horizontal-axis"));
    if (reverse) input.constraints.reverse();
    arc(input, "a").clockwise = true;
    arc(input, "b").clockwise = true;
    arc(input, "c").clockwise = false;
    const result = accepted(input);
    expect(["a", "b", "c", "d"].map(id => arc(result, id).clockwise)).toEqual([true, false, true, false]);
    const order = orderedMirrorArcDirections(input.constraints).map(c => c.id);
    expect(order.indexOf("a-to-b")).toBeLessThan(order.indexOf("b-to-c"));
  });

  it("adds no continuous degrees-of-freedom equation and does not copy point fixes", () => {
    const input = fixture();
    input.constraints = input.constraints.filter(c => c.type === "mirrorArcDirection");
    const without = structuredClone(input);
    without.constraints = [];
    const result = solveSketch(input), baseline = solveSketch(without);
    expect(result.status).toBe("underdefined");
    expect(result.degreesOfFreedom).toBe(baseline.degreesOfFreedom);
    expect(result.profile.points).toEqual(baseline.profile.points);
    expect(result.profile.constraints).toEqual(input.constraints);
  });

  it("persists corrected output flags and directed ownership through save, reopen and a second edit", () => {
    const input = fixture();
    arc(input, "a").clockwise = true;
    const document = addFeature(createDocument(), { id: "sketch", name: "Arc direction", type: "sketch", plane: "XY", offset: 0, suppressed: false, profile: accepted(input) });
    const reopened = parseDocument(serializeDocument(document));
    const first = reopened.features[0];
    if (first.type !== "sketch" || first.profile.kind !== "entities") throw new Error("Expected entity sketch");
    expect(arc(first.profile, "a").clockwise).toBe(true);
    expect(arc(first.profile, "b").clockwise).toBe(false);
    expect(first.profile.constraints.find(c => c.type === "mirrorArcDirection")).toEqual(relation("a-to-b", "a", "b"));
    arc(first.profile, "a").clockwise = false;
    const edited = updateFeature(reopened, "sketch", { profile: accepted(first.profile) });
    const second = parseDocument(serializeDocument(edited)).features[0];
    if (second.type !== "sketch" || second.profile.kind !== "entities") throw new Error("Expected entity sketch");
    expect(arc(second.profile, "b").clockwise).toBe(true);
    expect(second.profile.entities.map(e => e.id)).toEqual(input.entities.map(e => e.id));
  });

  it("rejects a later continuous conflict atomically, including previously stale image flags", () => {
    const input = fixture();
    arc(input, "a").clockwise = true;
    input.constraints.push({ id: "conflict", type: "fix", pointId: "a-center", x: 9, y: 2 });
    const before = structuredClone(input), result = solveSketch(input);
    expect(result.status, result.message).toBe("inconsistent");
    expect(result.profile).toEqual(before);
    expect(input).toEqual(before);
    expect(arc(result.profile, "b").clockwise).toBe(true);
  });
});

describe("arc direction typed references and structural ownership", () => {
  it("classifies all three IDs as entities and none as points", () => {
    const constraint = relation("r", "a", "b");
    expect(constraintEntityReferences(constraint)).toEqual(["a", "b", "vertical-axis"]);
    expect(constraintPointReferences(constraint)).toEqual([]);
  });

  it.each(["a", "b", "vertical-axis"])("removes the relation if referenced entity %s is deleted", id => {
    const input = fixture(), result = removeSelection(input, [{ kind: "entity", id }]);
    expect(result.constraints.some(c => c.type === "mirrorArcDirection")).toBe(false);
    expect(() => validateEntityProfile(result)).not.toThrow();
    expect(input.constraints.some(c => c.type === "mirrorArcDirection")).toBe(true);
  });

  it.each([
    { a: "vertical-axis" }, { b: "missing" }, { b: "a" }, { axisId: "a" },
    { axisId: "missing" }, { driven: false }, { clockwise: false },
  ])("rejects invalid fields %s", patch => {
    const input = fixture();
    Object.assign(input.constraints.find(c => c.type === "mirrorArcDirection")!, patch);
    expect(() => validateEntityProfile(input)).toThrow();
    const before = structuredClone(input), result = solveSketch(input);
    expect(result.status).toBe("invalid");
    expect(result.profile).toEqual(before);
    expect(input).toEqual(before);
  });

  it("rejects a circle masquerading as a source arc", () => {
    const input = fixture();
    input.entities[input.entities.findIndex(e => e.id === "a")] = { id: "a", type: "circle", center: "a-center", radius: 2, construction: false };
    expect(() => validateEntityProfile(input)).toThrow("dos arcos");
  });

  it.each([
    relation("duplicate", "a", "b"), relation("other-owner", "c", "b"),
  ])("rejects multiple incoming ownership even if its flag would currently agree (%s)", duplicate => {
    const input = fixture();
    input.constraints.push(duplicate);
    expect(() => validateEntityProfile(input)).toThrow("más de una fuente");
    expect(solveSketch(input).status).toBe("invalid");
  });

  it.each([
    { additions: [relation("b-to-a", "b", "a")] },
    { additions: [relation("b-to-c", "b", "c"), relation("c-to-a", "c", "a")] },
  ])("rejects directed cycles of any parity explicitly", ({ additions }) => {
    const input = fixture();
    input.constraints.push(...additions);
    const before = structuredClone(input);
    expect(() => validateEntityProfile(input)).toThrow("ciclo");
    const result = solveSketch(input);
    expect(result.status).toBe("invalid");
    expect(result.profile).toEqual(before);
    expect(input).toEqual(before);
  });
});
