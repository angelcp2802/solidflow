import { describe, expect, it, vi } from "vitest";
import { planSketchOffset, type OffsetParameters, type OffsetPlan } from "./offset";
import { solveOffsetApplication } from "./offsetApplication";
import { solveSketch } from "./solver";
import { SKETCH_LIMITS } from "./validation";
import type { EntityProfile, SketchOffsetRelation } from "./types";

// Original analytical fixtures, generated in millimetres below. These tests
// exercise planner/application behavior; they do not claim interactive UI or CAD parity.
const options: OffsetParameters = { distance: 2, reverse: false, bothDirections: false,
  chain: true, cap: "none", construction: "none", addDimensions: true };
const select = (...ids: string[]) => ids.map(id => ({ kind: "entity" as const, id }));
function lines(reverseSecond = false): EntityProfile {
  const points = [{ id: "a-end", x: 10, y: 0 }, { id: "b-start", x: 20, y: 5 }, { id: "b-end", x: 30, y: 5 }];
  return { kind: "entities", points, entities: [
    { id: "a-line", type: "line", start: "origin", end: "a-end", construction: false },
    { id: "b-line", type: "line", start: reverseSecond ? "b-end" : "b-start", end: reverseSecond ? "b-start" : "b-end", construction: false },
  ], constraints: points.map(point => ({ id: `${point.id}-fix`, type: "fix" as const, pointId: point.id, x: point.x, y: point.y })) };
}
function healthy(profile: EntityProfile) {
  const result = solveSketch(profile);
  expect(result.status, result.message).toMatch(/^(underdefined|fullyDefined)$/);
  return result;
}
function group(profile: EntityProfile, id: string): SketchOffsetRelation {
  const relation = profile.constraints.find(constraint => constraint.id === id);
  if (relation?.type !== "offset") throw new Error("Expected offset relation");
  return relation;
}
function imagePoints(profile: EntityProfile, plan: OffsetPlan, componentIndex: number, side: "right" | "left" = "right") {
  const relation = group(profile, plan.components[componentIndex].relationId);
  return relation.images.find(image => image.side === side)!.entityIds.flatMap(id => {
    const entity = profile.entities.find(entity => entity.id === id)!;
    if (entity.type === "circle") return [];
    return [entity.start, entity.end].map(id => profile.points.find(point => point.id === id)!);
  });
}
function driver(profile: EntityProfile, side: "right" | "left" = "right") {
  const dimension = profile.constraints.find(constraint => constraint.type === "offsetDistance" && constraint.side === side);
  if (dimension?.type !== "offsetDistance") throw new Error("Expected offset dimension");
  return dimension;
}
function expectFixedSources(profile: EntityProfile, source: EntityProfile) {
  for (const point of source.points) {
    const actual = profile.points.find(candidate => candidate.id === point.id)!;
    expect(actual.x).toBeCloseTo(point.x, 7);
    expect(actual.y).toBeCloseTo(point.y, 7);
  }
}

describe("disconnected offset plans", () => {
  it("creates one persistent distance family and one driver for two disconnected sources", () => {
    const source = lines(), before = structuredClone(source);
    const plan = planSketchOffset(source, select("a-line", "b-line"), options);
    expect(plan.changed, plan.message).toBe(true);
    expect(source).toEqual(before);
    expect(plan.sourceProfile).toBe(source);
    expect(plan.components.map(component => component.sourceEntityIds)).toEqual([["a-line"], ["b-line"]]);
    expect(plan.profile.constraints.filter(constraint => constraint.type === "equalOffsetDistance")).toEqual([
      { id: expect.any(String), type: "equalOffsetDistance", members: plan.components.map(component => ({ offsetId: component.relationId, side: "right" })) },
    ]);
    expect(plan.profile.constraints.filter(constraint => constraint.type === "offsetDistance")).toHaveLength(1);
    expect(plan.components.flatMap(component => component.distanceConstraintIds)).toEqual([driver(plan.profile).id]);
    expect(plan.components.flatMap(component => component.imageEntityIds)).toEqual(plan.imageEntityIds);
    expect(plan.components.flatMap(component => component.capEntityIds)).toEqual(plan.capEntityIds);
    const allIds = [...plan.profile.points, ...plan.profile.entities, ...plan.profile.constraints].map(item => item.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    const solved = healthy(plan.profile);
    expect(solved.degreesOfFreedom).toBe(0);
    expect(imagePoints(solved.profile, plan, 0).map(point => point.y)).toEqual([-2, -2]);
    expect(imagePoints(solved.profile, plan, 1).map(point => point.y)).toEqual([3, 3]);
  });

  it("keeps physical images independent of component selection order", () => {
    const source = lines();
    const forward = planSketchOffset(source, select("a-line", "b-line"), options);
    const reverse = planSketchOffset(source, select("b-line", "a-line"), options);
    expect(forward.changed, forward.message).toBe(true);
    expect(reverse.changed, reverse.message).toBe(true);
    expect(reverse.selectedEntityIds).toEqual(["b-line", "a-line"]);
    expect(reverse.components.map(component => component.primaryEntityId)).toEqual(["b-line", "a-line"]);
    expect(driver(reverse.profile).offsetId).toBe(reverse.components[0].relationId);
    const coordinates = (profile: EntityProfile, plan: OffsetPlan, index: number) => imagePoints(profile, plan, index).map(point => [point.x, point.y]);
    expect(coordinates(reverse.profile, reverse, 0)).toEqual(coordinates(forward.profile, forward, 1));
    expect(coordinates(reverse.profile, reverse, 1)).toEqual(coordinates(forward.profile, forward, 0));
  });

  it("uses each open component's primary stored direction for the shared side", () => {
    const plan = planSketchOffset(lines(true), select("a-line", "b-line"), options);
    expect(plan.changed, plan.message).toBe(true);
    const edited = structuredClone(healthy(plan.profile).profile);
    driver(edited).value = 3;
    const result = healthy(edited);
    for (const point of imagePoints(result.profile, plan, 0)) expect(point.y).toBeCloseTo(-3, 7);
    for (const point of imagePoints(result.profile, plan, 1)) expect(point.y).toBeCloseTo(8, 7);
    expectFixedSources(result.profile, lines(true));
  });

  it("moves the common separation without any nominal distance dimension", () => {
    const plan = planSketchOffset(lines(), select("a-line", "b-line"), { ...options, addDimensions: false });
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.profile.constraints.some(constraint => constraint.type === "offsetDistance")).toBe(false);
    expect(healthy(plan.profile).degreesOfFreedom).toBe(1);
    const edited = structuredClone(plan.profile), end = imagePoints(edited, plan, 0)[1];
    edited.constraints.push({ id: "normal-target", type: "fix", pointId: end.id, x: 10, y: -3 });
    const result = healthy(edited);
    for (const point of imagePoints(result.profile, plan, 0)) expect(point.y).toBeCloseTo(-3, 7);
    for (const point of imagePoints(result.profile, plan, 1)) expect(point.y).toBeCloseTo(2, 7);
    expectFixedSources(result.profile, lines());
  });

  it("expands and deduplicates connected seeds using the original topology", () => {
    const source = lines();
    source.points.push({ id: "a-corner", x: 10, y: 5 });
    source.entities.push({ id: "a-rise", type: "line", start: "a-end", end: "a-corner", construction: false });
    const plan = planSketchOffset(source, select("a-rise", "b-line", "a-line"), { ...options, cap: "line" });
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.components).toHaveLength(2);
    expect(plan.components[0].primaryEntityId).toBe("a-rise");
    expect(new Set(plan.sourceEntityIds)).toEqual(new Set(["a-line", "a-rise", "b-line"]));
    expect(plan.sourceEntityIds).toHaveLength(3);
    expect(plan.capEntityIds).toHaveLength(4);
    expect(plan.imageEntityIds).toHaveLength(3);
  });

  it("offsets every explicitly selected disconnected component with chain expansion disabled", () => {
    const source = lines();
    source.points.push({ id: "a-corner", x: 10, y: 5 });
    source.entities.push({ id: "a-rise", type: "line", start: "a-end", end: "a-corner", construction: false });
    const plan = planSketchOffset(source, select("a-line", "b-line"), { ...options, chain: false });
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.components).toHaveLength(2);
    expect(plan.sourceEntityIds).toEqual(["a-line", "b-line"]);
    expect(plan.imageEntityIds).toHaveLength(2);
  });

  it("does not merge coordinate-coincident endpoints with different identities", () => {
    const source = lines();
    Object.assign(source.points[1], { x: 10, y: 0 });
    Object.assign(source.points[2], { x: 10, y: 10 });
    source.constraints = [];
    const plan = planSketchOffset(source, select("a-line", "b-line"), options);
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.components).toHaveLength(2);
  });

  it("creates independent full-circle components and retains the family on reopening", () => {
    const source: EntityProfile = { kind: "entities", points: [{ id: "other-center", x: 20, y: 0 }], entities: [
      { id: "a-circle", type: "circle", center: "origin", radius: 3, construction: false },
      { id: "b-circle", type: "circle", center: "other-center", radius: 5, construction: false },
    ], constraints: [{ id: "center-fix", type: "fix", pointId: "other-center", x: 20, y: 0 },
      { id: "radius-a", type: "radius", entityId: "a-circle", value: 3 }, { id: "radius-b", type: "radius", entityId: "b-circle", value: 5 }] };
    const plan = planSketchOffset(source, select("b-circle", "a-circle"), options);
    expect(plan.changed, plan.message).toBe(true);
    const solved = healthy(plan.profile);
    expect(plan.components).toHaveLength(2);
    expect(plan.capEntityIds).toEqual([]);
    expect(plan.imageEntityIds.map(id => {
      const entity = solved.profile.entities.find(entity => entity.id === id)!;
      return entity.type === "circle" ? entity.radius : null;
    })).toEqual([7, 5]);
    const reopened = healthy(JSON.parse(JSON.stringify(solved.profile)) as EntityProfile);
    expect(reopened.profile.constraints).toEqual(solved.profile.constraints);
    expect(healthy(reopened.profile).profile).toEqual(reopened.profile);
  });

  it("keeps both side families independently driven when there are no round caps", () => {
    const plan = planSketchOffset(lines(), select("a-line", "b-line"), { ...options, bothDirections: true, cap: "line" });
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.profile.constraints.filter(constraint => constraint.type === "equalOffsetDistance")).toHaveLength(2);
    const edited = structuredClone(healthy(plan.profile).profile);
    driver(edited).value = 3;
    const result = healthy(edited);
    for (const point of imagePoints(result.profile, plan, 1, "right")) expect(point.y).toBeCloseTo(2, 7);
    for (const point of imagePoints(result.profile, plan, 1, "left")) expect(point.y).toBeCloseTo(7, 7);
    expect(driver(result.profile, "left").driven).toBeUndefined();
  });

  it("avoids a competing second driver when any round-capped component joins both sides", () => {
    const source = lines();
    source.entities[1] = { id: "b-circle", type: "circle", center: "b-start", radius: 5, construction: false };
    source.constraints.push({ id: "circle-radius", type: "radius", entityId: "b-circle", value: 5 });
    const plan = planSketchOffset(source, select("b-circle", "a-line"), { ...options, bothDirections: true, cap: "arc", distance: 2 });
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.components.map(component => group(plan.profile, component.relationId).cap)).toEqual(["none", "arc"]);
    expect(driver(plan.profile, "left").driven).toBe(true);
    const edited = structuredClone(healthy(plan.profile).profile);
    driver(edited).value = 2.5;
    const result = healthy(edited);
    for (const solution of [result, healthy(JSON.parse(JSON.stringify(result.profile)) as EntityProfile)]) {
      const profile = solution.profile, circleGroup = group(profile, plan.components[0].relationId);
      const lineGroup = group(profile, plan.components[1].relationId);
      expect(solution.drivenValues[driver(profile, "left").id]).toBeCloseTo(2.5, 7);
      expect(driver(profile, "left").value).toBe(2);
      for (const relation of [circleGroup, lineGroup]) for (const image of relation.images) expect(image.distance).toBeCloseTo(2.5, 7);
      for (const image of circleGroup.images) {
        const circle = profile.entities.find(entity => entity.id === image.entityIds[0])!;
        if (circle.type !== "circle") throw new Error("Expected circle image");
        expect(circle.radius).toBeCloseTo(image.side === "right" ? 7.5 : 2.5, 7);
        const center = profile.points.find(point => point.id === circle.center)!;
        expect(center.x).toBeCloseTo(20, 7); expect(center.y).toBeCloseTo(5, 7);
      }
      for (const side of ["right", "left"] as const) {
        const points = imagePoints(profile, plan, 1, side);
        expect(points[0].x).toBeCloseTo(0, 7); expect(points[1].x).toBeCloseTo(10, 7);
        for (const point of points) expect(point.y).toBeCloseTo(side === "right" ? -2.5 : 2.5, 7);
      }
      expect(lineGroup.capEntityIds).toHaveLength(2);
      lineGroup.capEntityIds.forEach((id, index) => {
        const cap = profile.entities.find(entity => entity.id === id)!;
        if (cap.type !== "arc") throw new Error("Expected round cap");
        const center = profile.points.find(point => point.id === cap.center)!;
        expect(center.x).toBeCloseTo(index === 0 ? 0 : 10, 7); expect(center.y).toBeCloseTo(0, 7);
        expect(cap.clockwise).toBe(index === 0);
        for (const endpoint of [cap.start, cap.end]) {
          const point = profile.points.find(point => point.id === endpoint)!;
          expect(Math.hypot(point.x - center.x, point.y - center.y)).toBeCloseTo(2.5, 7);
        }
      });
    }
  });

  it("rejects the complete detached proposal when a later component collapses", () => {
    const source = lines();
    source.entities[1] = { id: "z-circle", type: "circle", center: "b-start", radius: 1, construction: false };
    const before = structuredClone(source);
    for (const ids of [["a-line", "z-circle"], ["z-circle", "a-line"]]) {
      const plan = planSketchOffset(source, select(...ids), { ...options, reverse: true });
      expect(plan.changed).toBe(false);
      expect(plan.profile).toBe(source);
      expect(source).toEqual(before);
      expect(plan.components).toEqual([]);
      expect(plan.imageEntityIds).toEqual([]);
      expect(plan.createdConstraintIds).toEqual([]);
    }
  });

  it("rejects the combined allocation when each component alone fits the point limit", () => {
    const source = lines();
    for (let index = source.points.length; index < SKETCH_LIMITS.maxPoints - 3; index++) {
      source.points.push({ id: `filler-${index}`, x: index + 100, y: 100 });
    }
    const before = structuredClone(source);
    for (const id of ["a-line", "b-line"]) {
      const single = planSketchOffset(source, select(id), options);
      expect(single.changed, single.message).toBe(true);
      expect(single.profile.points.length).toBeLessThanOrEqual(SKETCH_LIMITS.maxPoints);
    }
    const batch = planSketchOffset(source, select("a-line", "b-line"), options);
    expect(batch.changed).toBe(false);
    expect(batch.message).toContain("capacidad");
    expect(batch.profile).toBe(source);
    expect(batch.components).toEqual([]);
    expect(source).toEqual(before);
  });

  it.each(["none", "source", "offset", "both"] as const)("offsets a mixed line/arc chain and an independent circle with %s construction", construction => {
    const points = [{ id: "a-start", x: 0, y: -2 }, { id: "a-joint", x: 6, y: -2 },
      { id: "a-center", x: 6, y: 0 }, { id: "a-far", x: 6, y: 2 }, { id: "b-center", x: 20, y: 0 }];
    const source: EntityProfile = { kind: "entities", points, entities: [
      { id: "a-line", type: "line", start: "a-start", end: "a-joint", construction: true },
      { id: "a-arc", type: "arc", center: "a-center", start: "a-joint", end: "a-far", clockwise: false, construction: false },
      { id: "b-circle", type: "circle", center: "b-center", radius: 3, construction: false },
    ], constraints: [...points.map(point => ({ id: `${point.id}-fix`, type: "fix" as const, pointId: point.id, x: point.x, y: point.y })),
      { id: "circle-radius", type: "radius", entityId: "b-circle", value: 3 }] };
    const before = structuredClone(source);
    const plan = planSketchOffset(source, select("a-line", "b-circle"), { ...options, distance: 1, cap: "line", construction });
    expect(plan.changed, plan.message).toBe(true);
    expect(source).toEqual(before);
    expect(plan.components.map(component => component.sourceEntityIds)).toEqual([["a-line", "a-arc"], ["b-circle"]]);
    expect(plan.capEntityIds).toHaveLength(2);
    const solved = healthy(plan.profile), output = solved.profile;
    const lineImage = output.entities.find(entity => entity.id === plan.components[0].imageEntityIds[0])!;
    if (lineImage.type !== "line") throw new Error("Expected line image");
    for (const id of [lineImage.start, lineImage.end]) expect(output.points.find(point => point.id === id)!.y).toBeCloseTo(-3, 7);
    const arcImage = output.entities.find(entity => entity.id === plan.components[0].imageEntityIds[1])!;
    if (arcImage.type !== "arc") throw new Error("Expected arc image");
    const center = output.points.find(point => point.id === arcImage.center)!, start = output.points.find(point => point.id === arcImage.start)!;
    expect(Math.hypot(start.x - center.x, start.y - center.y)).toBeCloseTo(3, 7);
    expect(lineImage.end).toBe(arcImage.start);
    const circleImage = output.entities.find(entity => entity.id === plan.components[1].imageEntityIds[0])!;
    if (circleImage.type !== "circle") throw new Error("Expected circle image");
    expect(circleImage.radius).toBeCloseTo(4, 7);
    const sourceConstruction = construction === "source" || construction === "both";
    expect(output.entities.filter(entity => source.entities.some(original => original.id === entity.id)).map(entity => entity.construction))
      .toEqual(sourceConstruction ? [true, true, true] : [true, false, false]);
    const outputConstruction = construction === "offset" || construction === "both";
    for (const id of [...plan.imageEntityIds, ...plan.capEntityIds]) expect(output.entities.find(entity => entity.id === id)!.construction).toBe(outputConstruction);
  });

  it("solves the combined candidate once and leaves the source untouched on conflict or staleness", () => {
    const current = healthy(lines()), before = structuredClone(current.profile);
    const plan = planSketchOffset(current.profile, select("a-line", "b-line"), options);
    expect(plan.changed, plan.message).toBe(true);
    const solver = vi.fn(solveSketch);
    expect(solveOffsetApplication(current, plan, solver).accepted).toBe(true);
    expect(solver).toHaveBeenCalledTimes(1);
    expect(solveOffsetApplication({ ...current, profile: structuredClone(current.profile) }, plan, solver).accepted).toBe(false);
    expect(solver).toHaveBeenCalledTimes(1);
    const conflicting = structuredClone(plan.profile), secondEnd = imagePoints(conflicting, plan, 1)[1];
    conflicting.constraints.push({ id: "conflicting-image", type: "fix", pointId: secondEnd.id, x: 30, y: 9 });
    expect(solveOffsetApplication(current, { ...plan, profile: conflicting }, solver).accepted).toBe(false);
    expect(solver).toHaveBeenCalledTimes(2);
    expect(current.profile).toEqual(before);
  });
});
