import { describe, expect, it } from "vitest";
import { releaseOffsetEndpointFollowing } from "./offset-endpoint-following";
import { planSketchOffset, type OffsetParameters } from "./offset";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchOffsetRelation } from "./types";
import { validateEntityProfile } from "./validation";

// Original Cartesian fixtures in millimeters. The fixed source is 10 mm long;
// its right image starts 2 mm below it. Coordinate tolerance is 5e-7 mm.
// DOF assertions describe this local station policy, not an external solver.
const parameters: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: true, cap: "none", construction: "none", addDimensions: false };
const group = (profile: EntityProfile) => profile.constraints.find((constraint): constraint is SketchOffsetRelation => constraint.type === "offset")!;
const coordinate = (profile: EntityProfile, id: string) => id === "origin" ? { x: 0, y: 0 } : profile.points.find(point => point.id === id)!;
function line(): EntityProfile {
  return { kind: "entities", points: [{ id: "end", x: 10, y: 0 }],
    entities: [{ id: "source", type: "line", start: "origin", end: "end", construction: false }],
    constraints: [{ id: "horizontal", type: "horizontal", entityId: "source" }, { id: "length", type: "length", entityId: "source", value: 10 }] };
}
function arc(): EntityProfile {
  return { kind: "entities", points: [{ id: "a", x: 2, y: 0 }, { id: "b", x: 0, y: 2 }],
    entities: [{ id: "source", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: false }],
    constraints: [{ id: "fix-a", type: "fix", pointId: "a", x: 2, y: 0 }, { id: "fix-b", type: "fix", pointId: "b", x: 0, y: 2 }] };
}
function mixed(): EntityProfile {
  return { kind: "entities", points: [{ id: "b", x: 4, y: 0 }, { id: "center", x: 4, y: 2 }, { id: "c", x: 6, y: 2 }],
    entities: [{ id: "source", type: "line", start: "origin", end: "b", construction: false }, { id: "arc", type: "arc", center: "center", start: "b", end: "c", clockwise: false, construction: false }],
    constraints: [{ id: "fix-b", type: "fix", pointId: "b", x: 4, y: 0 }, { id: "fix-center", type: "fix", pointId: "center", x: 4, y: 2 }, { id: "fix-c", type: "fix", pointId: "c", x: 6, y: 2 }] };
}
function planned(input = line(), options: Partial<OffsetParameters> = {}) {
  const plan = planSketchOffset(input, [{ kind: "entity", id: "source" }], { ...parameters, ...options });
  expect(plan.changed, plan.message).toBe(true);
  return plan;
}
function healthy(profile: EntityProfile) {
  const result = solveSketch(profile);
  expect(result.status, result.message).toMatch(/^(fullyDefined|underdefined)$/);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function imageLine(profile: EntityProfile, side: "right" | "left" = "right", index = 0) {
  const entity = profile.entities.find(entity => entity.id === group(profile).images.find(image => image.side === side)!.entityIds[index])!;
  if (entity.type !== "line") throw Error("Expected a line image.");
  return entity;
}
function changeLength(profile: EntityProfile, value: number) {
  const length = profile.constraints.find(constraint => constraint.id === "length")!;
  if (length.type !== "length") throw Error("Expected the source length.");
  length.value = value;
}
function expectCoordinate(profile: EntityProfile, id: string, x: number, y?: number) {
  expect(Math.abs(coordinate(profile, id).x - x)).toBeLessThan(5e-7);
  if (y !== undefined) expect(Math.abs(coordinate(profile, id).y - y)).toBeLessThan(5e-7);
}

describe("releasable offset endpoint stations", () => {
  it("creates two following boundaries for a no-dimension line with one local normal DOF", () => {
    const input = line(), before = structuredClone(input), profile = planned(input).profile;
    expect(input).toEqual(before);
    expect(group(profile).images[0].lineEndpointFollowing).toEqual([true, true]);
    expect(Object.hasOwn(group(profile).images[0], "lineEndpointMode")).toBe(false);
    expect(healthy(profile).degreesOfFreedom).toBe(1);
  });

  it.each([false, true])("follows an untouched endpoint when the source target changes, coordinates already edited=%s", coordinatesEdited => {
    const profile = healthy(planned().profile).profile, image = imageLine(profile);
    changeLength(profile, 14);
    if (coordinatesEdited) coordinate(profile, "end").x = 14;
    const result = healthy(profile);
    expectCoordinate(result.profile, "end", 14, 0);
    expectCoordinate(result.profile, image.start, 0);
    expectCoordinate(result.profile, image.end, 14);
    expect(coordinate(result.profile, image.end).y).toBeCloseTo(coordinate(result.profile, image.start).y, 7);
    expect(result.degreesOfFreedom).toBe(1);
  });

  it("releases only the requested end and preserves its Cartesian station after the source becomes 14 mm", () => {
    const base = healthy(planned().profile).profile, before = structuredClone(base), profile = structuredClone(base), image = imageLine(profile);
    releaseOffsetEndpointFollowing(profile, new Set([image.end]));
    coordinate(profile, image.end).x = 12;
    expect(base).toEqual(before);
    expect(group(profile).images[0].lineEndpointFollowing).toEqual([true, false]);
    expect(healthy(profile).degreesOfFreedom).toBe(2);
    changeLength(profile, 14);
    const result = healthy(profile);
    expectCoordinate(result.profile, "end", 14, 0);
    expectCoordinate(result.profile, image.end, 12, -2);
    expectCoordinate(result.profile, image.start, 0, -2);
  });

  it("releases the start independently while the end keeps following", () => {
    const profile = healthy(planned().profile).profile, image = imageLine(profile);
    releaseOffsetEndpointFollowing(profile, new Set([image.start]));
    coordinate(profile, image.start).x = -2;
    changeLength(profile, 14);
    const result = healthy(profile);
    expect(group(result.profile).images[0].lineEndpointFollowing).toEqual([false, true]);
    expectCoordinate(result.profile, image.start, -2);
    expectCoordinate(result.profile, image.end, 14);
    expect(result.degreesOfFreedom).toBe(2);
  });

  it("releases a requested endpoint identity without requiring a tangential coordinate delta", () => {
    const profile = healthy(planned().profile).profile, image = imageLine(profile);
    // Explicit-intent callers supply the IDs whose requested axes changed.
    // A normal move still releases this identity although its x remains 10.
    releaseOffsetEndpointFollowing(profile, new Set([image.end]));
    coordinate(profile, image.start).y = -3;
    coordinate(profile, image.end).y = -3;
    group(profile).images[0].distance = 3;
    changeLength(profile, 14);
    const result = healthy(profile);
    expectCoordinate(result.profile, image.end, 10, -3);
    expectCoordinate(result.profile, image.start, 0, -3);
    expect(group(result.profile).images[0].lineEndpointFollowing).toEqual([true, false]);
  });

  it("keeps release states and all three local freedoms through reopening and repeated solves", () => {
    const profile = healthy(planned().profile).profile, image = imageLine(profile);
    releaseOffsetEndpointFollowing(profile, new Set([image.start, image.end]));
    expect(group(profile).images[0].lineEndpointFollowing).toEqual([false, false]);
    const reopened = validateEntityProfile(JSON.parse(JSON.stringify(profile))), first = healthy(reopened), second = healthy(first.profile);
    expect(first.profile).toEqual(reopened);
    expect(second.profile).toEqual(first.profile);
    expect(first.degreesOfFreedom).toBe(3);
    changeLength(second.profile, 14);
    expectCoordinate(healthy(second.profile).profile, image.end, 10, -2);
  });

  it("does not release a source point, another endpoint or another side", () => {
    const profile = planned(line(), { bothDirections: true }).profile, right = imageLine(profile);
    releaseOffsetEndpointFollowing(profile, new Set(["end", "origin", "missing"]));
    expect(group(profile).images.map(image => image.lineEndpointFollowing)).toEqual([[true, true], [true, true]]);
    releaseOffsetEndpointFollowing(profile, new Set([right.end]));
    expect(group(profile).images.map(image => image.lineEndpointFollowing)).toEqual([[true, false], [true, true]]);
    changeLength(profile, 14);
    const result = healthy(profile);
    expectCoordinate(result.profile, right.end, 10);
    expectCoordinate(result.profile, imageLine(result.profile, "left").end, 14);
    expect(result.degreesOfFreedom).toBe(3);
  });

  it("uses traversal ends when a source member is stored in reverse", () => {
    const input: EntityProfile = { kind: "entities", points: [{ id: "b", x: 10, y: 0 }, { id: "c", x: 20, y: 0 }], entities: [
      { id: "source", type: "line", start: "origin", end: "b", construction: false }, { id: "backward", type: "line", start: "c", end: "b", construction: false }],
      constraints: [{ id: "fix-b", type: "fix", pointId: "b", x: 10, y: 0 }, { id: "fix-c", type: "fix", pointId: "c", x: 20, y: 0 }] };
    const profile = planned(input).profile, relation = group(profile), last = imageLine(profile, "right", 1);
    expect(relation.sources[1].reversed).toBe(true);
    releaseOffsetEndpointFollowing(profile, new Set([last.end]));
    expect(relation.images[0].lineEndpointFollowing).toEqual([true, true]);
    releaseOffsetEndpointFollowing(profile, new Set([last.start]));
    expect(relation.images[0].lineEndpointFollowing).toEqual([true, false]);
    coordinate(profile, last.start).x = 22;
    expectCoordinate(healthy(profile).profile, last.start, 22, -2);
  });

  it("follows only the line boundary of a mixed chain", () => {
    const profile = planned(mixed(), { distance: 1 }).profile, relation = group(profile);
    expect(relation.images[0].lineEndpointFollowing).toEqual([true, false]);
    const imageArc = profile.entities.find(entity => entity.id === relation.images[0].entityIds[1])!;
    if (imageArc.type !== "arc") throw Error();
    releaseOffsetEndpointFollowing(profile, new Set([imageArc.end]));
    expect(relation.images[0].lineEndpointFollowing).toEqual([true, false]);
    expect(healthy(profile).degreesOfFreedom).toBe(2);
    relation.images[0].lineEndpointFollowing![1] = true;
    expect(() => validateEntityProfile(profile)).toThrow(/lineEndpointFollowing/);
  });

  it("keeps aligned stations permanent and legacy fields absent", () => {
    const aligned = planned(line(), { addDimensions: true }).profile, image = imageLine(aligned);
    releaseOffsetEndpointFollowing(aligned, new Set([image.start, image.end]));
    expect(group(aligned).images[0].lineEndpointMode).toBe("aligned");
    expect(Object.hasOwn(group(aligned).images[0], "lineEndpointFollowing")).toBe(false);
    const legacy = planned().profile;
    delete group(legacy).images[0].lineEndpointFollowing;
    const before = structuredClone(legacy);
    releaseOffsetEndpointFollowing(legacy, new Set(legacy.points.map(point => point.id)));
    expect(legacy).toEqual(before);
    expect(healthy(legacy).degreesOfFreedom).toBe(3);
  });

  it("treats output driving dimensions as hard targets without silently releasing stations", () => {
    const profile = planned().profile, image = imageLine(profile);
    profile.constraints.push({ id: "output-length", type: "length", entityId: image.id, value: 12 });
    const before = structuredClone(profile);
    expect(solveSketch(profile).status).not.toMatch(/^(fullyDefined|underdefined)$/);
    expect(profile).toEqual(before);
    releaseOffsetEndpointFollowing(profile, new Set([image.end]));
    const result = healthy(profile);
    expectCoordinate(result.profile, image.end, 12);
    expectCoordinate(result.profile, "end", 10, 0);
  });

  it("follows an oblique 3-4-5 source and preserves a released tangential station", () => {
    const input: EntityProfile = { kind: "entities", points: [{ id: "end", x: 6, y: 8 }],
      entities: [{ id: "source", type: "line", start: "origin", end: "end", construction: false }],
      constraints: [{ id: "source-fix", type: "fix", pointId: "end", x: 6, y: 8 }] };
    const profile = planned(input).profile, relation = group(profile), image = imageLine(profile);
    // The unit tangent is (0.6,0.8); the right unit normal is (0.8,-0.6).
    profile.constraints.push({ id: "normal-target", type: "offsetDistance", offsetId: relation.id, side: "right", value: 2 });
    const initial = healthy(profile);
    expectCoordinate(initial.profile, image.start, 1.6, -1.2);
    expectCoordinate(initial.profile, image.end, 7.6, 6.8);
    expect(group(initial.profile).images[0].lineEndpointFollowing).toEqual([true, true]);
    expect(Object.hasOwn(group(initial.profile).images[0], "lineEndpointMode")).toBe(false);
    const sourceEdit = structuredClone(initial.profile);
    Object.assign(sourceEdit.constraints.find(constraint => constraint.id === "source-fix")!, { x: 8.4, y: 11.2 });
    const followed = healthy(sourceEdit);
    expectCoordinate(followed.profile, image.start, 1.6, -1.2);
    expectCoordinate(followed.profile, image.end, 10, 10);
    const released = structuredClone(followed.profile);
    releaseOffsetEndpointFollowing(released, new Set([image.end]));
    Object.assign(coordinate(released, image.end), { x: 11.2, y: 11.6 });
    const repositioned = healthy(released);
    expect(repositioned.degreesOfFreedom).toBe(1);
    Object.assign(repositioned.profile.constraints.find(constraint => constraint.id === "source-fix")!, { x: 12, y: 16 });
    const result = healthy(repositioned.profile);
    expectCoordinate(result.profile, "end", 12, 16);
    expectCoordinate(result.profile, image.end, 11.2, 11.6);
    expectCoordinate(result.profile, image.start, 1.6, -1.2);
    expect(group(result.profile).images[0].lineEndpointFollowing).toEqual([true, false]);
  });

  it("lets a following output length drive an unfixed source length with only normal freedom remaining", () => {
    const input = line();
    input.constraints = input.constraints.filter(constraint => constraint.id !== "length");
    const profile = planned(input).profile, image = imageLine(profile);
    profile.constraints.push({ id: "output-length", type: "length", entityId: image.id, value: 12 });
    const result = healthy(profile);
    expectCoordinate(result.profile, "end", 12, 0);
    expectCoordinate(result.profile, image.start, 0);
    expectCoordinate(result.profile, image.end, 12);
    expect(coordinate(result.profile, image.end).y).toBeCloseTo(coordinate(result.profile, image.start).y, 7);
    expect(result.degreesOfFreedom).toBe(1);
    expect(group(result.profile).images[0].lineEndpointFollowing).toEqual([true, true]);
  });

  it.each([undefined, null, true, [], [true], [true, false, false], [true, 1]])("rejects malformed following states %j", value => {
    const profile = planned().profile;
    Object.assign(group(profile).images[0], { lineEndpointFollowing: value });
    expect(() => validateEntityProfile(profile)).toThrow(/lineEndpointFollowing/);
  });

  it("rejects sparse following tuples instead of materializing missing entries", () => {
    const partial = new Array<boolean>(2);
    partial[0] = true;
    for (const value of [new Array<boolean>(2), partial]) {
      const profile = planned().profile;
      Object.assign(group(profile).images[0], { lineEndpointFollowing: value });
      expect(() => validateEntityProfile(profile)).toThrow(/lineEndpointFollowing/);
    }
  });

  it.each(["aligned", "free"] as const)("rejects following state combined with permanent mode %s", mode => {
    const profile = planned().profile;
    group(profile).images[0].lineEndpointMode = mode;
    expect(() => validateEntityProfile(profile)).toThrow(/no pueden coexistir/);
  });

  it.each(["arc", "circle", "line-cap", "arc-cap"] as const)("rejects even released following state on an ineligible %s group", kind => {
    const input = kind === "arc" ? arc() : kind === "circle" ? { kind: "entities" as const, points: [],
      entities: [{ id: "source", type: "circle" as const, center: "origin", radius: 5, construction: false }], constraints: [{ id: "radius", type: "radius" as const, entityId: "source", value: 5 }] } : line();
    const profile = planned(input, { cap: kind === "line-cap" ? "line" : kind === "arc-cap" ? "arc" : "none" }).profile;
    expect(Object.hasOwn(group(profile).images[0], "lineEndpointFollowing")).toBe(false);
    group(profile).images[0].lineEndpointFollowing = [false, false];
    expect(() => validateEntityProfile(profile)).toThrow(/lineEndpointFollowing/);
  });
});
