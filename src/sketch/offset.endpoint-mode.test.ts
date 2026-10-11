import { describe, expect, it } from "vitest";
import { removeSelection, setDimensionDriven } from "./editing";
import { planSketchOffset, type OffsetParameters } from "./offset";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchConstraint, SketchOffsetRelation } from "./types";
import { validateEntityProfile } from "./validation";

// Original analytical fixtures in millimeters: a 10 mm line, a radius-2 quarter
// arc, and a tangent line/arc chain. Coordinate assertions use 1e-7 mm precision.
const parameters: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: true, cap: "none", construction: "none", addDimensions: true };
const select = (id: string) => [{ kind: "entity" as const, id }];
const group = (profile: EntityProfile): SketchOffsetRelation => profile.constraints.find((constraint): constraint is SketchOffsetRelation => constraint.type === "offset")!;
const coordinate = (profile: EntityProfile, id: string) => id === "origin" ? { x: 0, y: 0 } : profile.points.find(point => point.id === id)!;
function line(withLength = true): EntityProfile {
  return { kind: "entities", points: [{ id: "end", x: 10, y: 0 }],
    entities: [{ id: "source", type: "line", start: "origin", end: "end", construction: false }],
    constraints: [{ id: "horizontal", type: "horizontal", entityId: "source" },
      ...(withLength ? [{ id: "source-length", type: "length" as const, entityId: "source", value: 10 }] : [])] };
}
function arc(): EntityProfile {
  return { kind: "entities", points: [{ id: "a", x: 2, y: 0 }, { id: "b", x: 0, y: 2 }],
    entities: [{ id: "source", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: false }],
    constraints: [{ id: "fix-a", type: "fix", pointId: "a", x: 2, y: 0 }, { id: "fix-b", type: "fix", pointId: "b", x: 0, y: 2 }] };
}
function tangentChain(): EntityProfile {
  return { kind: "entities", points: [{ id: "b", x: 4, y: 0 }, { id: "center", x: 4, y: 2 }, { id: "c", x: 6, y: 2 }],
    entities: [{ id: "source", type: "line", start: "origin", end: "b", construction: false },
      { id: "arc", type: "arc", center: "center", start: "b", end: "c", clockwise: false, construction: false }],
    constraints: [{ id: "fix-b", type: "fix", pointId: "b", x: 4, y: 0 }, { id: "fix-center", type: "fix", pointId: "center", x: 4, y: 2 }, { id: "fix-c", type: "fix", pointId: "c", x: 6, y: 2 }] };
}
function planned(input = line(), options: Partial<OffsetParameters> = {}) {
  const plan = planSketchOffset(input, select("source"), { ...parameters, ...options });
  expect(plan.changed, plan.message).toBe(true);
  return plan;
}
function healthy(input: EntityProfile) {
  const result = solveSketch(input);
  expect(result.status, result.message).toMatch(/^(fullyDefined|underdefined)$/);
  return result;
}
function imageLine(profile: EntityProfile, side: "right" | "left" = "right") {
  const id = group(profile).images.find(image => image.side === side)!.entityIds[0];
  const entity = profile.entities.find(entity => entity.id === id)!;
  if (entity.type !== "line") throw Error("Expected a line image.");
  return entity;
}
function dimension(profile: EntityProfile, id: string) {
  const constraint = profile.constraints.find(constraint => constraint.id === id)!;
  if (!("value" in constraint)) throw Error("Expected a dimension.");
  return constraint;
}
function offsetDimension(profile: EntityProfile, side: "right" | "left" = "right") {
  return profile.constraints.find((constraint): constraint is Extract<SketchConstraint, { type: "offsetDistance" }> => constraint.type === "offsetDistance" && constraint.side === side)!;
}
function expectPoint(profile: EntityProfile, id: string, x: number, y: number) {
  expect(coordinate(profile, id).x).toBeCloseTo(x, 7);
  expect(coordinate(profile, id).y).toBeCloseTo(y, 7);
}

describe("persisted offset line endpoint modes", () => {
  it("creates aligned stations for a new dimensioned uncapped line without mutating its source", () => {
    const input = line(), before = structuredClone(input), plan = planned(input);
    expect(input).toEqual(before);
    expect(group(plan.profile).images[0].lineEndpointMode).toBe("aligned");
    const solved = healthy(plan.profile), image = imageLine(solved.profile);
    expect(solved.status).toBe("fullyDefined");
    expect(solved.degreesOfFreedom).toBe(0);
    expectPoint(solved.profile, image.start, 0, -2);
    expectPoint(solved.profile, image.end, 10, -2);
  });

  it("follows a source length target and a subsequent distance target", () => {
    const first = healthy(planned().profile), lengthEdit = structuredClone(first.profile);
    dimension(lengthEdit, "source-length").value = 12;
    const second = healthy(lengthEdit), distanceEdit = structuredClone(second.profile);
    offsetDimension(distanceEdit).value = 3;
    distanceEdit.constraints.push({ id: "reading", type: "length", entityId: imageLine(distanceEdit).id, value: 99, driven: true });
    const third = healthy(distanceEdit), image = imageLine(third.profile);
    expectPoint(third.profile, "end", 12, 0);
    expectPoint(third.profile, image.start, 0, -3);
    expectPoint(third.profile, image.end, 12, -3);
    expect(third.drivenValues.reading).toBeCloseTo(12, 7);
  });

  it("rejects a conflicting output-end target atomically", () => {
    const profile = healthy(planned().profile).profile, image = imageLine(profile);
    profile.constraints.push({ id: "drag-target", type: "fix", pointId: image.end, x: 12, y: -2 });
    const before = structuredClone(profile), result = solveSketch(profile);
    expect(result.status).not.toMatch(/^(fullyDefined|underdefined)$/);
    expect(profile).toEqual(before);
  });

  it("allows an output length dimension to drive a free source length bidirectionally", () => {
    const profile = planned(line(false)).profile, image = imageLine(profile);
    profile.constraints.push({ id: "image-length", type: "length", entityId: image.id, value: 12 });
    const result = healthy(profile);
    expect(result.degreesOfFreedom).toBe(0);
    expectPoint(result.profile, "end", 12, 0);
    expectPoint(result.profile, image.end, 12, -2);
  });

  it("keeps legacy dimensioned images free when the optional field is absent", () => {
    const profile = planned().profile;
    delete group(profile).images[0].lineEndpointMode;
    const initial = healthy(profile);
    expect(initial.degreesOfFreedom).toBe(2);
    const edited = structuredClone(initial.profile);
    dimension(edited, "source-length").value = 12;
    const result = healthy(edited);
    expectPoint(result.profile, "end", 12, 0);
    expectPoint(result.profile, imageLine(result.profile).end, 10, -2);
    expect(Object.hasOwn(group(result.profile).images[0], "lineEndpointMode")).toBe(false);
  });

  it("keeps a no-dimension endpoint at its edited Cartesian station after a source length edit", () => {
    const profile = planned(line(), { addDimensions: false }).profile;
    expect(Object.hasOwn(group(profile).images[0], "lineEndpointMode")).toBe(false);
    const image = imageLine(profile);
    coordinate(profile, image.end).x = 12;
    const dragged = healthy(profile);
    expectPoint(dragged.profile, "end", 10, 0);
    const sourceEdit = structuredClone(dragged.profile);
    dimension(sourceEdit, "source-length").value = 14;
    const result = healthy(sourceEdit);
    expectPoint(result.profile, image.end, 12, -2);
    expectPoint(result.profile, "end", 14, 0);
    expect(result.degreesOfFreedom).toBe(3);
  });

  it("preserves explicit free mode and does not infer stations from a driving distance", () => {
    const profile = planned().profile;
    group(profile).images[0].lineEndpointMode = "free";
    const image = imageLine(profile);
    profile.constraints.push({ id: "drag-target", type: "fix", pointId: image.end, x: 12, y: -2 });
    const result = healthy(profile);
    expectPoint(result.profile, image.end, 12, -2);
    expectPoint(result.profile, "end", 10, 0);
    expect(group(validateEntityProfile(result.profile)).images[0].lineEndpointMode).toBe("free");
  });

  it("keeps endpoint modes independent on the two offset sides", () => {
    const profile = planned(line(), { bothDirections: true }).profile;
    expect(group(profile).images.map(image => image.lineEndpointMode)).toEqual(["aligned", "aligned"]);
    group(profile).images.find(image => image.side === "left")!.lineEndpointMode = "free";
    dimension(profile, "source-length").value = 12;
    const result = healthy(profile);
    expect(result.degreesOfFreedom).toBe(2);
    expectPoint(result.profile, imageLine(result.profile).end, 12, -2);
    expectPoint(result.profile, imageLine(result.profile, "left").end, 10, 2);
  });

  it.each(["driven", "deleted"] as const)("keeps aligned stations when the distance dimension is %s", transition => {
    const initial = healthy(planned().profile).profile, offset = offsetDimension(initial);
    const profile = transition === "driven" ? setDimensionDriven(initial, offset.id, true)
      : removeSelection(initial, [{ kind: "constraint", id: offset.id }]);
    expect(group(profile).images[0].lineEndpointMode).toBe("aligned");
    expect(healthy(profile).degreesOfFreedom).toBe(1);
    const conflicting = structuredClone(profile), image = imageLine(conflicting);
    conflicting.constraints.push({ id: "drag-target", type: "fix", pointId: image.end, x: 12, y: -2 });
    const before = structuredClone(conflicting);
    expect(solveSketch(conflicting).status).not.toMatch(/^(fullyDefined|underdefined)$/);
    expect(conflicting).toEqual(before);
    const sourceEdit = structuredClone(profile);
    dimension(sourceEdit, "source-length").value = 14;
    const result = healthy(sourceEdit);
    // The normal distance is free after either transition. Check the station
    // and uniform normal displacement rather than treating its seed as a target.
    const normalDistance = -coordinate(result.profile, image.start).y;
    expectPoint(result.profile, image.start, 0, -normalDistance);
    expectPoint(result.profile, image.end, 14, -normalDistance);
    expectPoint(result.profile, "end", 14, 0);
    expect(group(result.profile).images[0].distance).toBeCloseTo(normalDistance, 7);
    if (transition === "driven") expect(result.drivenValues[offset.id]).toBeCloseTo(normalDistance, 7);
  });

  it.each(["reversed", "vertical"] as const)("uses source endpoint identity and direction for a %s line", orientation => {
    const source = line();
    if (orientation === "reversed") {
      const entity = source.entities[0];
      if (entity.type !== "line") throw Error();
      [entity.start, entity.end] = [entity.end, entity.start];
    } else {
      Object.assign(source.points[0], { x: 0, y: 10 });
      source.constraints[0] = { id: "vertical", type: "vertical", entityId: "source" };
    }
    const profile = planned(source).profile;
    dimension(profile, "source-length").value = 12;
    const result = healthy(profile), image = imageLine(result.profile);
    if (orientation === "reversed") {
      expectPoint(result.profile, image.start, 12, 2);
      expectPoint(result.profile, image.end, 0, 2);
    } else {
      expectPoint(result.profile, image.start, 2, 0);
      expectPoint(result.profile, image.end, 2, 12);
    }
  });

  it("does not add line stations to an uncapped arc or transport its source sweep", () => {
    const profile = planned(arc(), { distance: 1 }).profile;
    expect(Object.hasOwn(group(profile).images[0], "lineEndpointMode")).toBe(false);
    const initial = healthy(profile), imageId = group(profile).images[0].entityIds[0];
    const edited = structuredClone(initial.profile);
    Object.assign(coordinate(edited, "b"), { x: -2, y: 0 });
    Object.assign(edited.constraints.find(constraint => constraint.id === "fix-b")!, { x: -2, y: 0 });
    const result = healthy(edited), image = result.profile.entities.find(entity => entity.id === imageId)!;
    if (image.type !== "arc") throw Error();
    expect(result.degreesOfFreedom).toBe(2);
    expectPoint(result.profile, image.start, 3, 0);
    expectPoint(result.profile, image.end, 0, 3);
  });

  it("aligns only the free line end of a tangent line/arc chain", () => {
    const profile = planned(tangentChain(), { distance: 1 }).profile;
    expect(group(profile).images[0].lineEndpointMode).toBe("aligned");
    const initial = healthy(profile), imageIds = group(profile).images[0].entityIds;
    expect(initial.degreesOfFreedom).toBe(1);
    expectPoint(initial.profile, imageLine(initial.profile).start, 0, -1);
    const imageArc = initial.profile.entities.find(entity => entity.id === imageIds[1])!;
    if (imageArc.type !== "arc") throw Error();
    const edited = structuredClone(initial.profile);
    Object.assign(coordinate(edited, imageArc.end), { x: 4 + 3 / Math.sqrt(2), y: 2 + 3 / Math.sqrt(2) });
    const result = healthy(edited);
    expectPoint(result.profile, imageArc.end, 4 + 3 / Math.sqrt(2), 2 + 3 / Math.sqrt(2));
    expectPoint(result.profile, "c", 6, 2);
  });

  it.each(["line", "arc"] as const)("uses the existing %s-cap stations without adding endpoint mode", cap => {
    const profile = planned(line(), { cap }).profile;
    expect(Object.hasOwn(group(profile).images[0], "lineEndpointMode")).toBe(false);
    expect(healthy(profile).degreesOfFreedom).toBe(0);
  });

  it.each([undefined, null, "automatic", 1])("rejects a present invalid endpoint mode %s", value => {
    const profile = planned().profile;
    Object.assign(group(profile).images[0], { lineEndpointMode: value });
    expect(() => validateEntityProfile(profile)).toThrow(/lineEndpointMode/);
  });

  it.each(["arc", "circle", "line-cap", "arc-cap"] as const)("rejects aligned mode on an ineligible %s image", kind => {
    const input = kind === "arc" ? arc() : kind === "circle" ? {
      kind: "entities" as const, points: [], entities: [{ id: "source", type: "circle" as const, center: "origin", radius: 5, construction: false }],
      constraints: [{ id: "radius", type: "radius" as const, entityId: "source", value: 5 }],
    } : line();
    const profile = planned(input, { cap: kind === "line-cap" ? "line" : kind === "arc-cap" ? "arc" : "none" }).profile;
    group(profile).images[0].lineEndpointMode = "aligned";
    expect(() => validateEntityProfile(profile)).toThrow(/lineEndpointMode/);
  });

  it("preserves mode through reopening and repeated solve, and removes stations when unlinked", () => {
    const initial = healthy(planned().profile), reopened = validateEntityProfile(JSON.parse(JSON.stringify(initial.profile)));
    expect(reopened).toEqual(initial.profile);
    const again = healthy(reopened);
    expect(again.profile).toEqual(initial.profile);
    const detached = removeSelection(again.profile, [{ kind: "constraint", id: group(again.profile).id }]);
    expect(detached.constraints.some(constraint => constraint.type === "offset" || constraint.type === "offsetDistance")).toBe(false);
    const image = imageLine(again.profile);
    detached.constraints.push({ id: "detached-end", type: "fix", pointId: image.end, x: 12, y: -2 });
    expectPoint(healthy(detached).profile, image.end, 12, -2);
  });
});
