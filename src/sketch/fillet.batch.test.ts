import { describe, expect, it } from "vitest";
import {
  planSketchFillet,
  planSketchFilletBatch,
  validateSketchFilletBatchResult,
  type FilletBatchParameters,
} from "./fillet";
import type { EntityProfile, SketchSelection } from "./types";
import { solveSketch } from "./solver";
import { validateEntityProfile } from "./validation";

// Own Cartesian fixtures: millimetres, no external document or generated oracle.
function rectangle(): EntityProfile {
  return {
    kind: "entities",
    points: [
      { id: "br", x: 10, y: 0 },
      { id: "tr", x: 10, y: 6 },
      { id: "tl", x: 0, y: 6 },
    ],
    entities: [
      { id: "bottom", type: "line", start: "origin", end: "br", construction: false },
      { id: "right", type: "line", start: "br", end: "tr", construction: false },
      { id: "top", type: "line", start: "tr", end: "tl", construction: false },
      { id: "left", type: "line", start: "tl", end: "origin", construction: false },
    ],
    constraints: [
      { id: "h-bottom", type: "horizontal", entityId: "bottom" },
      { id: "h-top", type: "horizontal", entityId: "top" },
      { id: "v-right", type: "vertical", entityId: "right" },
      { id: "v-left", type: "vertical", entityId: "left" },
      { id: "width", type: "length", entityId: "bottom", value: 10, driven: false, referenceRole: "annotation" },
      { id: "height", type: "length", entityId: "left", value: 6 },
      { id: "bottom-reading", type: "length", entityId: "bottom", value: 999, driven: true, referenceRole: "annotation" },
    ],
  };
}
const params: FilletBatchParameters = { radius: 2, cornerPolicy: "keep", radiusMode: "individual" };
const corners = (...ids: string[]): SketchSelection[] => ids.map((id) => ({ kind: "point", id }));
const xy = (profile: EntityProfile, id: string) => id === "origin" ? { id, x: 0, y: 0 } : profile.points.find((p) => p.id === id)!;
function line(profile: EntityProfile, id: string) {
  const entity = profile.entities.find((e) => e.id === id)!;
  if (entity.type !== "line") throw new Error("Expected line");
  return entity;
}
function arc(profile: EntityProfile, id: string) {
  const entity = profile.entities.find((e) => e.id === id)!;
  if (entity.type !== "arc") throw new Error("Expected arc");
  return entity;
}
function plan(input = rectangle(), selection = corners("origin", "br"), parameters = params) {
  const result = planSketchFilletBatch(input, selection, parameters);
  expect(result.changed, result.message).toBe(true);
  expect(result.sourceProfile).toBe(input);
  expect(result.profile).not.toBe(input);
  expect(validateEntityProfile(result.profile)).toEqual(result.profile);
  return result;
}
function rejected(input: EntityProfile, selection: SketchSelection[], parameters = params) {
  const snapshot = structuredClone(input);
  const result = planSketchFilletBatch(input, selection, parameters);
  expect(result.changed, result.message).toBe(false);
  expect(result.sourceProfile).toBe(input);
  expect(result.profile).toBe(input);
  expect(input).toEqual(snapshot);
  expect(result.filletEntityId).toBeNull();
  expect(result.filletEntityIds).toEqual([]);
  expect(result.createdEntityIds).toEqual([]);
  expect(result.affectedEntityIds).toEqual([]);
  expect(result.createdConstraintIds).toEqual([]);
  expect(result.convertedConstraintIds).toEqual([]);
  expect(result.deletedConstraintIds).toEqual([]);
  expect(result.sourceEdits).toEqual([]);
  return result;
}
function solved(profile: EntityProfile) {
  const result = solveSketch(profile);
  expect(result.status, result.message).toBe("fullyDefined");
  expect(result.degreesOfFreedom).toBe(0);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}

describe("atomic common-line-corner batches", () => {
  it("changes both ends of the same original bottom line, with shared contact IDs and original dimensions", () => {
    const input = rectangle(), snapshot = structuredClone(input), result = plan(input);
    expect(input).toEqual(snapshot);
    expect(result.filletEntityIds).toHaveLength(2);
    expect(result.createdEntityIds).toEqual(result.filletEntityIds);
    expect(result.filletEntityId).toBe(result.filletEntityIds[0]);
    expect(result.affectedEntityIds).toEqual(["bottom", "left", "right"]);
    expect(result.sourceEdits.filter((e) => e.entityId === "bottom")).toEqual([
      { entityId: "bottom", endpoint: "end", movement: "trim", amount: 2 },
      { entityId: "bottom", endpoint: "start", movement: "trim", amount: 2 },
    ]);
    const bottom = line(result.profile, "bottom");
    expect(xy(result.profile, bottom.start)).toMatchObject({ x: 2, y: 0 });
    expect(xy(result.profile, bottom.end)).toMatchObject({ x: 8, y: 0 });
    const centers = result.filletEntityIds.map((id) => xy(result.profile, arc(result.profile, id).center));
    expect(centers).toEqual([
      { id: expect.any(String), x: 8, y: 2 },
      { id: expect.any(String), x: 2, y: 2 },
    ]);
    for (const id of result.filletEntityIds) {
      const fillet = arc(result.profile, id);
      expect(result.profile.entities.filter((e) => e.type === "line" &&
        [e.start, e.end].includes(fillet.start))).toHaveLength(1);
      expect(result.profile.entities.filter((e) => e.type === "line" &&
        [e.start, e.end].includes(fillet.end))).toHaveLength(1);
    }
    expect(result.convertedConstraintIds.sort()).toEqual(["height", "width"]);
    expect(result.profile.constraints.find((c) => c.id === "width")).toEqual({
      id: "width", type: "distance", a: "origin", b: "br", value: 10,
      driven: false, referenceRole: "annotation",
    });
    expect(result.profile.constraints.filter((c) => c.type === "radius")).toHaveLength(2);
    expect(result.profile.constraints.filter((c) => c.type === "equal")).toHaveLength(0);
    const solution = solved(result.profile);
    expect(solution.drivenValues["bottom-reading"]).toBeCloseTo(6, 7);
    expect(validateSketchFilletBatchResult(result, solution.profile)).toBeNull();
  });

  it("uses canonical target/source IDs independently of selection and entity array order", () => {
    const input = rectangle();
    const a = plan(input);
    const reordered = structuredClone(input);
    reordered.entities.reverse();
    const b = plan(reordered, corners("br", "origin"));
    expect(b.filletEntityIds).toEqual(a.filletEntityIds);
    expect(b.sourceEdits).toEqual(a.sourceEdits);
    expect(b.profile.points).toEqual(a.profile.points);
    expect(b.profile.constraints).toEqual(a.profile.constraints);
    expect([...b.profile.entities].sort((x, y) => x.id.localeCompare(y.id)))
      .toEqual([...a.profile.entities].sort((x, y) => x.id.localeCompare(y.id)));
  });

  it.each([false, true])("preserves physical geometry when source endpoint storage is reversed: %s", (reverseArray) => {
    const input = rectangle();
    for (const e of input.entities) if (e.type === "line") [e.start, e.end] = [e.end, e.start];
    if (reverseArray) input.entities.reverse();
    const result = plan(input, corners("br", "origin"));
    const bottom = line(result.profile, "bottom");
    expect(xy(result.profile, bottom.start)).toMatchObject({ x: 8, y: 0 });
    expect(xy(result.profile, bottom.end)).toMatchObject({ x: 2, y: 0 });
    expect(result.sourceEdits.filter((e) => e.entityId === "bottom").map((e) => e.endpoint)).toEqual(["start", "end"]);
    solved(result.profile);
  });

  it("can round all four corners without losing any original source ID", () => {
    const result = plan(rectangle(), corners("tl", "origin", "tr", "br"));
    expect(result.filletEntityIds).toHaveLength(4);
    expect(result.sourceEdits).toHaveLength(8);
    expect(result.affectedEntityIds).toEqual(["bottom", "left", "right", "top"]);
    expect(new Set(result.convertedConstraintIds).size).toBe(result.convertedConstraintIds.length);
    solved(result.profile);
  });

  it("allocates collision-free deterministic IDs across points, entities and constraints", () => {
    const input = rectangle();
    input.points.push({ id: "fillet-arc-1", x: 20, y: 20 }, { id: "fillet-point-1", x: 21, y: 20 });
    input.constraints.push({ id: "fillet-center-1", type: "fix", pointId: "fillet-point-1", x: 21, y: 20 });
    const result = plan(input);
    expect(result.filletEntityIds).toEqual(["fillet-arc-2", "fillet-arc-3"]);
    expect(result.profile.points.find((p) => p.id === "fillet-center-1")).toBeUndefined();
    expect(plan(input).profile).toEqual(result.profile);
  });

  it("preserves construction status per corner", () => {
    const input = rectangle();
    line(input, "bottom").construction = true;
    line(input, "right").construction = true;
    const result = plan(input);
    expect(result.filletEntityIds.map((id) => arc(result.profile, id).construction)).toEqual([true, false]);
  });

  it("links all peer fillets directly to one canonical master and edits from saved coordinates", () => {
    const result = plan(rectangle(), corners("origin", "br"), { ...params, radiusMode: "linked" });
    const [master, peer] = result.filletEntityIds;
    const radius = result.profile.constraints.find((c) => c.type === "radius")!;
    expect(radius).toMatchObject({ entityId: master, value: 2 });
    expect(result.profile.constraints.filter((c) => c.type === "equal")).toEqual([
      { id: expect.any(String), type: "equal", a: peer, b: master },
    ]);
    const reopened = JSON.parse(JSON.stringify(result.profile)) as EntityProfile;
    const driving = reopened.constraints.find((c) => c.id === radius.id)!;
    if (driving.type !== "radius") throw new Error("Expected radius");
    driving.value = 1;
    const solution = solved(reopened);
    const bottom = line(solution.profile, "bottom");
    expect(xy(solution.profile, bottom.start).x).toBeCloseTo(1, 6);
    expect(xy(solution.profile, bottom.end).x).toBeCloseTo(9, 6);
    expect(solution.drivenValues["bottom-reading"]).toBeCloseTo(8, 6);
  });

  it("links every arc to an external circular reference without creating a second master", () => {
    const input = rectangle();
    input.points.push({ id: "reference-center", x: 30, y: 30 });
    input.entities.push({ id: "reference", type: "circle", center: "reference-center", radius: 2, construction: true });
    input.constraints.push({ id: "reference-radius", type: "radius", entityId: "reference", value: 2 });
    const result = plan(input, corners("origin", "br"), { ...params, radiusMode: "linked", equalRadiusEntityId: "reference" });
    expect(result.profile.entities.find((e) => e.id === "reference")).toEqual(input.entities.at(-1));
    expect(result.profile.constraints.filter((c) => c.type === "radius")).toEqual([input.constraints.at(-1)]);
    expect(result.profile.constraints.filter((c) => c.type === "equal").map((c) => c.type === "equal" ? c.b : null)).toEqual(["reference", "reference"]);
  });

  it("delete cleans the complete batch corner topology once and keeps external dimensions and fresh readings", () => {
    const input = rectangle();
    input.points.push({ id: "external", x: 20, y: 5 });
    input.constraints.push(
      { id: "old-fix", type: "fix", pointId: "br", x: 10, y: 0 },
      { id: "outside-distance", type: "distance", a: "br", b: "external", value: Math.hypot(10, 5) },
    );
    const result = plan(input, corners("origin", "br"), { ...params, cornerPolicy: "delete" });
    expect(result.deletedConstraintIds.sort()).toEqual(["height", "old-fix", "width"]);
    expect(result.convertedConstraintIds).toEqual([]);
    expect(result.profile.points.find((p) => p.id === "br")).toEqual({ id: "br", x: 10, y: 0 });
    expect(result.profile.constraints.find((c) => c.id === "outside-distance")).toEqual(input.constraints.at(-1));
    expect(result.profile.constraints.find((c) => c.id === "bottom-reading")).toEqual(input.constraints.find((c) => c.id === "bottom-reading"));
    const solution = solveSketch(result.profile);
    expect(solution.status).toBe("underdefined");
    expect(solution.drivenValues["bottom-reading"]).toBeCloseTo(6, 7);
  });

  it("delete removes unused selected corner points while retaining origin and far anchors", () => {
    const input = rectangle();
    input.constraints.push(
      { id: "corner-fix", type: "fix", pointId: "br", x: 10, y: 0 },
      { id: "far-fix", type: "fix", pointId: "tr", x: 10, y: 6 },
      { id: "origin-fix", type: "fix", pointId: "origin", x: 0, y: 0 },
    );
    const result = plan(input, corners("origin", "br"), { ...params, cornerPolicy: "delete" });
    expect(result.profile.points.some((p) => p.id === "br")).toBe(false);
    expect(result.profile.constraints.some((c) => c.id === "corner-fix")).toBe(false);
    expect(result.profile.constraints.filter((c) => ["far-fix", "origin-fix"].includes(c.id))).toHaveLength(2);
  });

  it.each([3, 3.1])("rejects joint shared-edge collapse/reversal R%s although each corner is individually valid", (radius) => {
    const input = rectangle();
    for (const id of ["origin", "tl"])
      expect(planSketchFillet(input, corners(id), { radius, cornerPolicy: "keep" }).changed).toBe(true);
    for (const ids of [["origin", "tl"], ["tl", "origin"]])
      expect(rejected(input, corners(...ids), { ...params, radius }).message).toMatch(/consumen o invierten/);
  });

  it("respects the existing signed 1e-6 mm retained-line minimum", () => {
    plan(rectangle(), corners("origin", "tl"), { ...params, radius: 3 - 0.6e-6 });
    rejected(rectangle(), corners("origin", "tl"), { ...params, radius: 3 - 0.4e-6 });
    rejected(rectangle(), corners("origin", "br"), { ...params, radius: 5 });
  });

  it("rejects an invalid later corner without exposing a valid prefix", () => {
    const input = rectangle();
    input.points.push(
      { id: "small", x: 20, y: 20 },
      { id: "small-x", x: 21, y: 20 },
      { id: "small-y", x: 20, y: 21 },
    );
    input.entities.push(
      { id: "small-a", type: "line", start: "small", end: "small-x", construction: false },
      { id: "small-b", type: "line", start: "small", end: "small-y", construction: false },
    );
    expect(planSketchFillet(input, corners("br"), params).changed).toBe(true);
    expect(rejected(input, corners("br", "small")).message).toMatch(/small/);
    input.points.push({ id: "alias-origin", x: 0, y: 0 });
    rejected(input, corners("origin", "alias-origin"));
    rejected(input, corners("origin", "missing"));
    rejected(input, corners("origin", "origin"));
  });

  it("rejects curved or high-valence corners and mixed selections without mutating input", () => {
    const curved = rectangle();
    curved.points.push({ id: "center", x: -4, y: 3 });
    curved.entities[3] = { id: "left", type: "arc", center: "center", start: "tl", end: "origin", clockwise: true, construction: false };
    rejected(curved, corners("origin", "br"));
    const branched = rectangle();
    branched.points.push({ id: "diagonal-far", x: 1, y: 1 });
    branched.entities.push({ id: "diagonal", type: "line", start: "origin", end: "diagonal-far", construction: false });
    rejected(branched, corners("origin", "br"));
    rejected(rectangle(), [{ kind: "point", id: "origin" }, { kind: "entity", id: "right" }]);
    rejected(rectangle(), corners("origin"));
  });

  it.each(["points", "entities", "constraints"] as const)("rejects complete %s limit overflow even when each separate plan fits", (kind) => {
    const input = rectangle();
    if (kind === "points") while (input.points.length < 123)
      input.points.push({ id: `unused-${input.points.length}`, x: 20, y: 20 });
    if (kind === "entities") while (input.entities.length < 127)
      input.entities.push({ id: `circle-${input.entities.length}`, type: "circle", center: "origin", radius: 20, construction: true });
    if (kind === "constraints") while (input.constraints.length < 247)
      input.constraints.push({ id: `redundant-${input.constraints.length}`, type: "horizontal", entityId: "bottom" });
    for (const id of ["origin", "br"])
      expect(planSketchFillet(input, corners(id), params).changed).toBe(true);
    rejected(input, corners("origin", "br"));
  });

  it("rejects invalid batch parameters and unavailable radius references atomically", () => {
    for (const parameters of [
      { ...params, radius: NaN }, { ...params, radius: 0 },
      { ...params, radiusMode: "unsupported" },
      { ...params, cornerPolicy: "unsupported" },
      { ...params, solutionIndex: 0 },
      { ...params, equalRadiusEntityId: "missing" },
      { ...params, radiusMode: "linked", equalRadiusEntityId: "bottom" },
    ]) rejected(rectangle(), corners("origin", "br"), parameters as FilletBatchParameters);
    const input = rectangle();
    input.entities.push({ id: "reference", type: "circle", center: "origin", radius: 3, construction: true });
    rejected(input, corners("origin", "br"), { ...params, radiusMode: "linked", equalRadiusEntityId: "reference" });
  });

  it("post-solve acceptance catches source reversal, collapse and changed identities", () => {
    const result = plan();
    for (const collapse of [false, true]) {
      const changed = structuredClone(result.profile), bottom = line(changed, "bottom");
      Object.assign(xy(changed, bottom.start), { x: collapse ? 8 : 9, y: 0 });
      Object.assign(xy(changed, bottom.end), { x: 8, y: 0 });
      expect(validateSketchFilletBatchResult(result, changed)).toMatch(/consumido o invertido/);
    }
    const changed = structuredClone(result.profile);
    line(changed, "bottom").start = "origin";
    expect(validateSketchFilletBatchResult(result, changed)).toMatch(/topología/);
    const changedArc = structuredClone(result.profile);
    arc(changedArc, result.filletEntityIds[0]).clockwise = !arc(changedArc, result.filletEntityIds[0]).clockwise;
    expect(validateSketchFilletBatchResult(result, changedArc)).toMatch(/topología/);
  });

  it.each([3, 3.1])("checks linked radius editing cannot silently reverse the shared left source at R%s", (radius) => {
    const result = plan(rectangle(), corners("origin", "tl"), { ...params, radiusMode: "linked" });
    const edited = structuredClone(solved(result.profile).profile);
    const driving = edited.constraints.find((c) => c.type === "radius")!;
    if (driving.type !== "radius") throw new Error("Expected radius");
    driving.value = radius;
    const snapshot = structuredClone(edited);
    const solution = solveSketch(edited);
    const left = line(solution.profile, "left");
    const signedLength = xy(solution.profile, left.start).y - xy(solution.profile, left.end).y;
    expect(["inconsistent", "invalid", "notConverged"], JSON.stringify({ status: solution.status, signedLength, maxResidual: solution.maxResidual })).toContain(solution.status);
    expect(solution.profile).toEqual(snapshot);
    expect(edited).toEqual(snapshot);
  });
});
