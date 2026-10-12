import { describe, expect, it } from "vitest";
import { entityProfileStructure } from "../cad/kernel.profiles";
import { DocumentHistory, parseDocument, serializeDocument, updateFeature } from "../model/document";
import { removeSelection } from "./editing";
import { repositionSketchPoints } from "./point-reposition";
import {
  cleanupConstraintDependencies, constraintConstraintReferences,
  constraintEntityReferences, constraintPointReferences,
} from "./references";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchConstraint, SketchSolveResult } from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";

type DistanceFamily = Extract<SketchConstraint, { type: "equalOffsetDistance" }>;
const ids = ["a", "b", "c"];
const radii = [2, 7, 15];

/** Original Cartesian circles; analytic image radii are source radius + distance. */
function circles(driver = true): EntityProfile {
  const profile: EntityProfile = { kind: "entities", points: [], entities: [], constraints: [] };
  ids.forEach((id, index) => {
    const x = index * 50;
    profile.points.push({ id: `center-${id}`, x, y: 0 }, { id: `image-center-${id}`, x, y: 0 });
    profile.entities.push(
      { id: `source-${id}`, type: "circle", center: `center-${id}`, radius: radii[index], construction: true },
      { id: `image-${id}`, type: "circle", center: `image-center-${id}`, radius: radii[index] + 2, construction: false },
    );
    profile.constraints.push(
      { id: `fixed-${id}`, type: "fix", pointId: `center-${id}`, x, y: 0 },
      { id: `radius-${id}`, type: "radius", entityId: `source-${id}`, value: radii[index] },
      { id: `offset-${id}`, type: "offset", sources: [{ entityId: `source-${id}`, reversed: false }],
        images: [{ side: "right", distance: 2, entityIds: [`image-${id}`], joins: [] }],
        closed: true, cap: "none", capEntityIds: [] },
    );
  });
  profile.constraints.unshift({ id: "family", type: "equalOffsetDistance",
    members: ids.map(id => ({ offsetId: `offset-${id}`, side: "right" })) });
  if (driver) profile.constraints.push({ id: "driver", type: "offsetDistance", offsetId: "offset-a", side: "right", value: 2 });
  return profile;
}

function family(profile: EntityProfile): DistanceFamily {
  return profile.constraints.find(c => c.id === "family") as DistanceFamily;
}

function healthy(result: SketchSolveResult): void {
  expect(["underdefined", "fullyDefined"], result.message).toContain(result.status);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
}

function expectRadii(profile: EntityProfile, distance: number, surviving = ids): void {
  surviving.forEach(id => {
    const source = profile.entities.find(entity => entity.id === `source-${id}`)!;
    const image = profile.entities.find(entity => entity.id === `image-${id}`)!;
    expect(source.type).toBe("circle");
    expect(image.type).toBe("circle");
    if (source.type !== "circle" || image.type !== "circle") throw new Error("Expected circles");
    expect(source.radius).toBeCloseTo(radii[ids.indexOf(id)], 7);
    expect(image.radius).toBeCloseTo(radii[ids.indexOf(id)] + distance, 7);
    expect(profile.points.find(point => point.id === image.center)?.x).toBeCloseTo(ids.indexOf(id) * 50, 7);
    expect(profile.points.find(point => point.id === image.center)?.y).toBeCloseTo(0, 7);
  });
}

describe("offset separation families", () => {
  it("validates forward references and copies nested members with explicit reference roles", () => {
    const input = circles();
    const result = validateEntityProfile(input);
    expect(result).toEqual(input);
    expect(family(result).members).not.toBe(family(input).members);
    expect(family(result).members[0]).not.toBe(family(input).members[0]);
    expect(constraintConstraintReferences(family(result))).toEqual(["offset-a", "offset-b", "offset-c"]);
    expect(constraintEntityReferences(family(result))).toEqual([]);
    expect(constraintPointReferences(family(result))).toEqual([]);
  });

  it("keeps arbitrary valid identifiers as typed group references rather than object keys", () => {
    const input = circles();
    const renamed = ["__proto__", "constructor", "offset-a,right"];
    const replacements = new Map(ids.map((id, index) => [`offset-${id}`, renamed[index]]));
    for (const constraint of input.constraints) {
      if (constraint.type === "offset") constraint.id = replacements.get(constraint.id)!;
      else if (constraint.type === "offsetDistance") constraint.offsetId = replacements.get(constraint.offsetId)!;
      else if (constraint.type === "equalOffsetDistance") for (const member of constraint.members) member.offsetId = replacements.get(member.offsetId)!;
    }
    const validated = validateEntityProfile(input), solved = solveSketch(validated);
    healthy(solved);
    expect(solved.degreesOfFreedom).toBe(0);
    expect(constraintConstraintReferences(family(solved.profile))).toEqual(renamed);
    expectRadii(solved.profile, 2);
  });

  it("adds N-1 equations and one driver controls all three circles after reopening", () => {
    const input = circles(false);
    const unlinked = structuredClone(input);
    unlinked.constraints = unlinked.constraints.filter(c => c.id !== "family");
    const independent = solveSketch(unlinked), shared = solveSketch(input);
    healthy(independent); healthy(shared);
    expect(independent.degreesOfFreedom).toBe(3);
    expect(shared.degreesOfFreedom).toBe(1);
    const reopened = validateEntityProfile(JSON.parse(JSON.stringify(shared.profile)));
    reopened.constraints.push({ id: "driver", type: "offsetDistance", offsetId: "offset-b", side: "right", value: 3 });
    const before = structuredClone(reopened), solved = solveSketch(reopened);
    healthy(solved);
    expect(solved.degreesOfFreedom).toBe(0);
    expectRadii(solved.profile, 3);
    expect(reopened).toEqual(before);
    expect(family(solved.profile)).toEqual(family(input));
  });

  it("measures driven members without adding targets or treating retained values as measurements", () => {
    const input = circles();
    input.constraints = input.constraints.map(c => c.id === "driver" && "value" in c ? { ...c, value: 3 } : c);
    input.constraints.push(
      { id: "read-b", type: "offsetDistance", offsetId: "offset-b", side: "right", value: 99, driven: true },
      { id: "read-c", type: "offsetDistance", offsetId: "offset-c", side: "right", value: 123, driven: true },
    );
    const solved = solveSketch(input);
    healthy(solved);
    expect(solved.degreesOfFreedom).toBe(0);
    expect(solved.drivenValues["read-b"]).toBeCloseTo(3, 7);
    expect(solved.drivenValues["read-c"]).toBeCloseTo(3, 7);
    expect(solved.profile.constraints.find(c => c.id === "read-b")).toMatchObject({ value: 99, driven: true });
    expectRadii(solved.profile, 3);
  });

  it.each(["delete", "driven"] as const)("keeps equality after the sole driver is %s, with one free separation", mode => {
    const input = circles();
    input.constraints = input.constraints.flatMap(c => c.id !== "driver" ? [c] : mode === "delete" ? [] : [{ ...c, driven: true }]);
    const free = solveSketch(input);
    healthy(free);
    expect(free.degreesOfFreedom).toBe(1);
    // A geometric radius target on another member controls the surviving family.
    const edited = structuredClone(free.profile);
    edited.constraints.push({ id: "image-radius", type: "radius", entityId: "image-c", value: 18 });
    const solved = solveSketch(edited);
    healthy(solved);
    expect(solved.degreesOfFreedom).toBe(0);
    expectRadii(solved.profile, 3);
    if (mode === "driven") expect(solved.drivenValues.driver).toBeCloseTo(3, 7);
  });

  it("diagnoses incompatible targets without mutating the input or silently unlinking members", () => {
    const input = circles();
    input.constraints.push({ id: "conflict", type: "offsetDistance", offsetId: "offset-c", side: "right", value: 4 });
    const before = structuredClone(input), solved = solveSketch(input);
    expect(["inconsistent", "notConverged"]).toContain(solved.status);
    expect(input).toEqual(before);
    expect(family(solved.profile)).toEqual(family(input));
  });

  it("shares a no-dimension normal drag across oppositely stored lines and retains it without temporary targets after reopen", () => {
    const input: EntityProfile = { kind: "entities", points: [], entities: [], constraints: [] };
    const coordinates = [[0, 0, 10, 0], [30, 5, 20, 5]];
    coordinates.forEach(([sx, sy, ex, ey], index) => {
      const id = String(index);
      input.points.push({ id: `s${id}`, x: sx, y: sy }, { id: `e${id}`, x: ex, y: ey },
        { id: `is${id}`, x: sx, y: sy + (index === 0 ? -2 : 2) },
        { id: `ie${id}`, x: ex, y: ey + (index === 0 ? -2 : 2) });
      input.entities.push({ id: `source${id}`, type: "line", start: `s${id}`, end: `e${id}`, construction: true },
        { id: `image${id}`, type: "line", start: `is${id}`, end: `ie${id}`, construction: false });
      input.constraints.push({ id: `fixs${id}`, type: "fix", pointId: `s${id}`, x: sx, y: sy },
        { id: `fixe${id}`, type: "fix", pointId: `e${id}`, x: ex, y: ey },
        { id: `offset${id}`, type: "offset", sources: [{ entityId: `source${id}`, reversed: false }],
          images: [{ side: "right", distance: 2, entityIds: [`image${id}`], joins: [], lineEndpointFollowing: [true, true] }],
          closed: false, cap: "none", capEntityIds: [] });
    });
    input.constraints.push({ id: "family", type: "equalOffsetDistance", members: [
      { offsetId: "offset0", side: "right" }, { offsetId: "offset1", side: "right" },
    ] });
    const initial = solveSketch(input);
    healthy(initial);
    expect(initial.degreesOfFreedom).toBe(1);
    const before = structuredClone(initial.profile);
    const moved = repositionSketchPoints(initial.profile, [{ pointId: "ie0", x: 10, y: -3 }]);
    expect(moved.accepted, moved.message).toBe(true);
    if (!moved.accepted) throw new Error(moved.message);
    expect(moved.changed).toBe(true);
    expect(initial.profile).toEqual(before);
    const reopened = validateEntityProfile(JSON.parse(JSON.stringify(moved.solution.profile)));
    const solved = solveSketch(reopened);
    healthy(solved);
    for (const pointId of ["is0", "ie0"]) expect(solved.profile.points.find(p => p.id === pointId)?.y).toBeCloseTo(-3, 7);
    for (const pointId of ["is1", "ie1"]) expect(solved.profile.points.find(p => p.id === pointId)?.y).toBeCloseTo(8, 7);
    for (const pointId of ["s0", "e0", "s1", "e1"]) {
      const actual = solved.profile.points.find(p => p.id === pointId)!, expected = before.points.find(p => p.id === pointId)!;
      expect(actual.x).toBeCloseTo(expected.x, 7);
      expect(actual.y).toBeCloseTo(expected.y, 7);
    }
    expect(solved.profile.constraints.map(c => c.id)).toEqual(before.constraints.map(c => c.id));
    for (const group of solved.profile.constraints.filter(c => c.type === "offset")) expect(group.images[0].distance).toBeCloseTo(3, 7);
  });

  it("reduces a family after deleting its master, preserves the two survivors, and does not promote a driver", () => {
    const input = circles(), before = structuredClone(input);
    const removed = removeSelection(input, [{ kind: "constraint", id: "offset-a" }]);
    expect(family(removed)).toEqual({ id: "family", type: "equalOffsetDistance", members: [
      { offsetId: "offset-b", side: "right" }, { offsetId: "offset-c", side: "right" },
    ] });
    expect(removed.constraints.filter(c => c.type === "offsetDistance")).toEqual([]);
    expect(input).toEqual(before);
    // The now-unassociated image A is removed from this focused survivor solve.
    removed.entities = removed.entities.filter(entity => entity.id !== "image-a");
    removed.points = removed.points.filter(point => point.id !== "image-center-a");
    removed.constraints.push({ id: "survivor-driver", type: "offsetDistance", offsetId: "offset-c", side: "right", value: 3 });
    const solved = solveSketch(removed);
    healthy(solved);
    expectRadii(solved.profile, 3, ["b", "c"]);
    expect(solved.degreesOfFreedom).toBe(0);
  });

  it("drops a singleton family, preserves explicit unlinking and cleans without mutating or inventing IDs", () => {
    const input = circles(), before = structuredClone(input);
    const removed = removeSelection(input, [{ kind: "constraint", id: "offset-b" }, { kind: "constraint", id: "offset-c" }]);
    expect(removed.constraints.some(c => c.type === "equalOffsetDistance")).toBe(false);
    expect(removed.constraints.find(c => c.id === "driver")).toBeDefined();
    const unlinked = removeSelection(input, [{ kind: "constraint", id: "family" }]);
    expect(unlinked.constraints.filter(c => c.type === "offset")).toHaveLength(3);
    expect(unlinked.constraints.find(c => c.id === "driver")).toBeDefined();
    expect(cleanupConstraintDependencies(removed.constraints)).toEqual(removed.constraints);
    expect(input).toEqual(before);
  });

  it("filters a deleted side while retaining the group and the remaining family identity", () => {
    const input = circles();
    const group = input.constraints.find(c => c.id === "offset-a");
    if (group?.type !== "offset") throw new Error("Expected offset");
    input.points.push({ id: "inner-center", x: 0, y: 0 });
    input.entities.push({ id: "inner", type: "circle", center: "inner-center", radius: 1, construction: false });
    group.images.push({ side: "left", distance: 1, entityIds: ["inner"], joins: [] });
    family(input).members[0].side = "left";
    validateEntityProfile(input);
    group.images = group.images.filter(image => image.side === "right");
    const before = structuredClone(input.constraints);
    const cleaned = cleanupConstraintDependencies(input.constraints);
    expect(cleaned.find(c => c.id === "offset-a")).toBeDefined();
    expect(cleaned.find(c => c.id === "family")).toEqual({ id: "family", type: "equalOffsetDistance", members: [
      { offsetId: "offset-b", side: "right" }, { offsetId: "offset-c", side: "right" },
    ] });
    expect(input.constraints).toEqual(before);
    expect(cleanupConstraintDependencies(cleaned)).toEqual(cleaned);
  });

  it("round-trips a reduced family in document version 1 and restores its driver with one undo", () => {
    const profile = circles();
    const document = parseDocument(JSON.stringify({ version: 1, id: "family-document", name: "Original circle family", units: "mm",
      features: [{ id: "sketch", name: "Three circles", type: "sketch", plane: "XY", offset: 0, profile, suppressed: false }],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));
    const history = new DocumentHistory(document);
    const removed = removeSelection(profile, [{ kind: "constraint", id: "offset-a" }]);
    const committed = history.apply(updateFeature(history.current, "sketch", { profile: removed }));
    expect(history.canUndo).toBe(true);
    const reopened = parseDocument(serializeDocument(committed));
    expect(reopened).toEqual(committed);
    const afterSketch = reopened.features[0];
    if (afterSketch.type !== "sketch" || afterSketch.profile.kind !== "entities") throw new Error("Expected entity sketch");
    expect(family(afterSketch.profile).members).toHaveLength(2);
    expect(afterSketch.profile.constraints.some(c => c.id === "driver")).toBe(false);
    expect(history.undo()).toEqual(document);
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toEqual(committed);
  });

  it("includes family membership in naming, independent of equation basis and continuous values", () => {
    const input = circles(), reordered = structuredClone(input);
    family(reordered).members.reverse();
    expect(entityProfileStructure(reordered)).toEqual(entityProfileStructure(input));
    const continuous = structuredClone(input);
    continuous.constraints = continuous.constraints.map(c => c.type === "offset" ? {
      ...c, images: c.images.map(image => ({ ...image, distance: 3 })),
    } : c.id === "driver" && "value" in c ? { ...c, value: 3 } : c);
    expect(entityProfileStructure(continuous)).toEqual(entityProfileStructure(input));
    family(reordered).members.pop();
    expect(entityProfileStructure(reordered)).not.toEqual(entityProfileStructure(input));
    const renamed = structuredClone(input);
    family(renamed).id = "other-family";
    expect(entityProfileStructure(renamed)).not.toEqual(entityProfileStructure(input));
  });
});

describe("strict distance-family document boundaries", () => {
  it.each([
    ["empty", []], ["singleton", [{ offsetId: "offset-a", side: "right" }]],
    ["duplicate", [{ offsetId: "offset-a", side: "right" }, { offsetId: "offset-a", side: "right" }]],
    ["missing group", [{ offsetId: "missing", side: "right" }, { offsetId: "offset-b", side: "right" }]],
    ["wrong constraint role", [{ offsetId: "radius-a", side: "right" }, { offsetId: "offset-b", side: "right" }]],
    ["missing side", [{ offsetId: "offset-a", side: "left" }, { offsetId: "offset-b", side: "right" }]],
    ["unknown side", [{ offsetId: "offset-a", side: "up" }, { offsetId: "offset-b", side: "right" }]],
    ["unknown member key", [{ offsetId: "offset-a", side: "right", value: 2 }, { offsetId: "offset-b", side: "right" }]],
    ["sparse", [undefined, { offsetId: "offset-b", side: "right" }]],
    ["capacity", Array.from({ length: SKETCH_LIMITS.maxConstraints + 1 }, () => ({ offsetId: "offset-a", side: "right" }))],
  ])("rejects %s membership", (_name, members) => {
    const input = circles();
    (family(input) as unknown as { members: unknown }).members = members;
    if (_name === "sparse") delete (family(input).members as unknown[])[0];
    const before = structuredClone(input);
    expect(() => validateEntityProfile(input)).toThrow();
    expect(input).toEqual(before);
  });

  it("forbids treating the family itself as a driving or driven dimension", () => {
    const input = circles();
    Object.assign(family(input), { driven: true, value: 2 });
    expect(() => validateEntityProfile(input)).toThrow(/desconocido/);
  });
});
