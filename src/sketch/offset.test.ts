import { describe, expect, it, vi } from "vitest";
import { planSketchOffset, type OffsetParameters } from "./offset";
import { solveOffsetApplication } from "./offsetApplication";
import { measureDimension, solveSketch } from "./solver";
import { removeSelection } from "./editing";
import type { EntityProfile, SketchConstraint, SketchOffsetRelation } from "./types";

const options: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: true, cap: "none", construction: "none", addDimensions: true };
const select = (...ids: string[]) => ids.map(id => ({ kind: "entity" as const, id }));
function line(): EntityProfile { return { kind: "entities", points: [{ id: "end", x: 10, y: 0 }], entities: [{ id: "line", type: "line", start: "origin", end: "end", construction: false }], constraints: [{ id: "end-fix", type: "fix", pointId: "end", x: 10, y: 0 }] }; }
function rectangle(): EntityProfile { return { kind: "entities", points: [{ id: "b", x: 10, y: 0 }, { id: "c", x: 10, y: 6 }, { id: "d", x: 0, y: 6 }], entities: [
  { id: "a-bottom", type: "line", start: "origin", end: "b", construction: false }, { id: "b-right", type: "line", start: "b", end: "c", construction: false },
  { id: "c-top", type: "line", start: "c", end: "d", construction: false }, { id: "d-left", type: "line", start: "d", end: "origin", construction: false }], constraints: [
  { id: "b-fix", type: "fix", pointId: "b", x: 10, y: 0 }, { id: "c-fix", type: "fix", pointId: "c", x: 10, y: 6 }, { id: "d-fix", type: "fix", pointId: "d", x: 0, y: 6 }] }; }
const group = (profile: EntityProfile): SketchOffsetRelation => profile.constraints.find(c => c.type === "offset") as SketchOffsetRelation;
const point = (profile: EntityProfile, id: string) => { const p = id === "origin" ? { x: 0, y: 0 } : profile.points.find(p => p.id === id)!; return { x: p.x, y: p.y }; };
function imageEnds(profile: EntityProfile, side: "left" | "right" = "right") { const image = group(profile).images.find(image => image.side === side)!; return image.entityIds.flatMap(id => { const e = profile.entities.find(e => e.id === id)!; return e.type === "circle" ? [] : [point(profile, e.start), point(profile, e.end)]; }); }
const healthy = (profile: EntityProfile) => { const result = solveSketch(profile); expect(result.status, result.message).toMatch(/^(fullyDefined|underdefined)$/); return result; };
const dimension = (profile: EntityProfile, side: "left" | "right" = "right") => profile.constraints.find(c => c.type === "offsetDistance" && c.side === side) as Extract<SketchConstraint, { type: "offsetDistance" }>;

describe("associative support offsets", () => {
  it("seeds positive right of stored traversal and aligns new dimensioned line endpoints", () => {
    const input = line(), before = structuredClone(input), plan = planSketchOffset(input, select("line"), options);
    expect(plan.changed, plan.message).toBe(true); expect(input).toEqual(before);
    expect(imageEnds(plan.profile)).toEqual([{ x: 0, y: -2 }, { x: 10, y: -2 }]);
    const solved = healthy(plan.profile); expect(solved.degreesOfFreedom).toBe(0);
    const reversed = line(); if (reversed.entities[0].type !== "line") throw Error(); [reversed.entities[0].start, reversed.entities[0].end] = ["end", "origin"];
    expect(imageEnds(planSketchOffset(reversed, select("line"), options).profile)).toEqual([{ x: 10, y: 2 }, { x: 0, y: 2 }]);
    expect(imageEnds(planSketchOffset(reversed, select("line"), { ...options, reverse: true }).profile, "left")).toEqual([{ x: 10, y: -2 }, { x: 0, y: -2 }]);
  });
  it("keeps no-dimension association with a free uniform distance and fresh driven measurement", () => {
    const plan = planSketchOffset(line(), select("line"), { ...options, addDimensions: false });
    expect(healthy(plan.profile).degreesOfFreedom).toBe(3);
    const target = plan.profile.entities.find(e => e.id === plan.imageEntityIds[0])!; if (target.type !== "line") throw Error();
    const edited = structuredClone(plan.profile); edited.constraints.push({ id: "image-end-target", type: "fix", pointId: target.end, x: 12, y: -4 });
    const solved = healthy(edited); expect(imageEnds(solved.profile)[1].x).toBeCloseTo(12, 7); expect(imageEnds(solved.profile).every(p => Math.abs(p.y + 4) < 1e-7)).toBe(true);
    expect(group(solved.profile).images[0].distance).toBeCloseTo(4, 7);
    const driven = { id: "reading", type: "offsetDistance" as const, offsetId: group(edited).id, side: "right" as const, value: 99, driven: true };
    edited.constraints.push(driven); const measured = healthy(edited); expect(measured.drivenValues.reading).toBeCloseTo(4, 7); expect(measureDimension(measured.profile, driven)).toBeCloseTo(4, 7);
  });
  it("moves to an edited driving distance while the retained nominal driven value is ignored", () => {
    const solved = healthy(planSketchOffset(line(), select("line"), options).profile), edited = structuredClone(solved.profile);
    dimension(edited).value = 3;
    const next = healthy(edited); expect(imageEnds(next.profile).every(p => Math.abs(p.y + 3) < 1e-8)).toBe(true);
    dimension(edited).driven = true; dimension(edited).value = 77;
    // Converting the distance releases only the normal translation; endpoint
    // stations belong to the persisted image rather than the dimension mode.
    expect(healthy(edited).degreesOfFreedom).toBe(1);
  });
  it.each(["none", "line"] as const)("keeps both %s-cap distances independent", cap => {
    const plan = planSketchOffset(line(), select("line"), { ...options, bothDirections: true, cap }), edited = structuredClone(healthy(plan.profile).profile);
    dimension(edited).value = 3; const solved = healthy(edited);
    expect(imageEnds(solved.profile, "right").every(p => Math.abs(p.y + 3) < 1e-8)).toBe(true); expect(imageEnds(solved.profile, "left").every(p => Math.abs(p.y - 2) < 1e-8)).toBe(true);
    expect(solved.degreesOfFreedom).toBe(0);
  });
  it("round caps make the two distances equal geometrically and keep the second dimension driven", () => {
    const plan = planSketchOffset(line(), select("line"), { ...options, bothDirections: true, cap: "arc", construction: "source" });
    expect(plan.changed, plan.message).toBe(true); const edited = structuredClone(healthy(plan.profile).profile);
    expect(dimension(edited, "left").driven).toBe(true); dimension(edited).value = 3;
    const solved = healthy(edited); expect(solved.degreesOfFreedom).toBe(0);
    expect(solved.drivenValues[dimension(edited, "left").id]).toBeCloseTo(3, 7);
    for (const id of plan.capEntityIds) { const cap = solved.profile.entities.find(e => e.id === id)!; if (cap.type !== "arc") throw Error(); const c = point(solved.profile, cap.center); expect(c.y).toBeCloseTo(0, 8); expect(Math.hypot(point(solved.profile, cap.start).x - c.x, point(solved.profile, cap.start).y - c.y)).toBeCloseTo(3, 8); }
  });
  it.each(["line", "arc"] as const)("creates single-side %s caps connected to original endpoint identities", cap => {
    const plan = planSketchOffset(line(), select("line"), { ...options, cap }); expect(plan.changed, plan.message).toBe(true);
    const solved = healthy(plan.profile); expect(solved.degreesOfFreedom).toBe(0);
    expect(plan.capEntityIds).toHaveLength(2); const first = solved.profile.entities.find(e => e.id === plan.capEntityIds[0])!;
    expect(first.type !== "circle" && [first.start, first.end].includes("origin")).toBe(true);
    if (first.type === "arc") expect(point(solved.profile, first.center)).toEqual({ x: 0, y: -1 });
  });
  it("expands a connected rectangle, preserves canonical topology and rejects collapsed/reversed inner offsets atomically", () => {
    const input = rectangle(), before = structuredClone(input), plan = planSketchOffset(input, select("a-bottom"), { ...options, distance: 1 });
    expect(plan.changed, plan.message).toBe(true); expect(plan.sourceEntityIds).toHaveLength(4); expect(plan.selectedEntityIds).toEqual(["a-bottom"]);
    const solved = healthy(plan.profile); expect(solved.status).toBe("fullyDefined");
    expect(imageEnds(solved.profile)).toEqual([{ x: -1, y: -1 }, { x: 11, y: -1 }, { x: 11, y: -1 }, { x: 11, y: 7 }, { x: 11, y: 7 }, { x: -1, y: 7 }, { x: -1, y: 7 }, { x: -1, y: -1 }]);
    const permuted = structuredClone(input); permuted.entities.reverse(); permuted.points.reverse();
    const permutedPlan = planSketchOffset(permuted, select("d-left", "c-top", "a-bottom", "b-right"), { ...options, distance: 1, chain: false });
    expect(imageEnds(permutedPlan.profile)).toEqual(imageEnds(plan.profile)); expect(group(permutedPlan.profile)).toEqual(group(plan.profile));
    for (const distance of [3, 3.1]) { const invalid = planSketchOffset(input, select("a-bottom"), { ...options, reverse: true, distance }); expect(invalid.changed).toBe(false); expect(invalid.profile).toBe(input); }
    expect(input).toEqual(before);
    const inner = healthy(planSketchOffset(input, select("a-bottom"), { ...options, reverse: true, distance: 2 }).profile), edited = structuredClone(inner.profile); dimension(edited, "left").value = 3.1;
    const editedBefore = structuredClone(edited); expect(solveSketch(edited).status).not.toMatch(/^(underdefined|fullyDefined)$/); expect(edited).toEqual(editedBefore);
  });
  it("uses concentric circle support and preserves direction/source ownership through reopening and source edits", () => {
    const input: EntityProfile = { kind: "entities", points: [], entities: [{ id: "circle", type: "circle", center: "origin", radius: 5, construction: false }], constraints: [{ id: "radius", type: "radius", entityId: "circle", value: 5 }] };
    const plan = planSketchOffset(input, select("circle"), { ...options, bothDirections: true }); const solved = healthy(plan.profile);
    expect(solved.degreesOfFreedom).toBe(0); expect(group(solved.profile).images.map(image => (solved.profile.entities.find(e => e.id === image.entityIds[0]) as { radius: number }).radius)).toEqual([7, 3]);
    const reopened = JSON.parse(JSON.stringify(solved.profile)) as EntityProfile; (reopened.constraints.find(c => c.id === "radius") as { value: number }).value = 7;
    const next = healthy(reopened); const radii = group(next.profile).images.map(image => (next.profile.entities.find(e => e.id === image.entityIds[0]) as { radius: number }).radius); expect(radii[0]).toBeCloseTo(9, 8); expect(radii[1]).toBeCloseTo(5, 8);
  });
  it("canonicalizes a closed contour outward despite clockwise storage and a different primary pick", () => {
    for (const reverseStorage of [false, true]) {
      const input = rectangle();
      if (reverseStorage) for (const entity of input.entities) if (entity.type === "line") [entity.start, entity.end] = [entity.end, entity.start];
      for (const primary of ["a-bottom", "c-top"]) {
        const plan = planSketchOffset(input, select(primary), { ...options, distance: 2 }); expect(plan.changed, plan.message).toBe(true);
        const result = healthy(plan.profile); const coords = imageEnds(result.profile);
        expect(Math.min(...coords.map(p => p.x))).toBeCloseTo(-2, 8); expect(Math.max(...coords.map(p => p.x))).toBeCloseTo(12, 8);
        expect(Math.min(...coords.map(p => p.y))).toBeCloseTo(-2, 8); expect(Math.max(...coords.map(p => p.y))).toBeCloseTo(8, 8);
      }
    }
  });
  it("associates arc radius and center while source sweep edits leave free image endpoint angles", () => {
    const input: EntityProfile = { kind: "entities", points: [{ id: "a", x: 5, y: 0 }, { id: "b", x: 0, y: 5 }], entities: [{ id: "arc", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: false }], constraints: [{ id: "fa", type: "fix", pointId: "a", x: 5, y: 0 }, { id: "fb", type: "fix", pointId: "b", x: 0, y: 5 }] };
    const plan = planSketchOffset(input, select("arc"), options), solved = healthy(plan.profile); expect(solved.degreesOfFreedom).toBe(2); expect(imageEnds(solved.profile)).toEqual([{ x: 7, y: 0 }, { x: 0, y: 7 }]);
    const edited = structuredClone(solved.profile); Object.assign(edited.points.find(p => p.id === "b")!, { x: -5, y: 0 }); Object.assign(edited.constraints.find(c => c.id === "fb")!, { x: -5, y: 0 });
    const next = healthy(edited); expect(imageEnds(next.profile)).toEqual(imageEnds(solved.profile));
    const flip = structuredClone(solved.profile); (flip.entities[0] as { clockwise: boolean }).clockwise = true;
    const result = healthy(flip); expect((result.profile.entities.find(e => e.id === plan.imageEntityIds[0]) as { clockwise: boolean }).clockwise).toBe(true);
  });
  it("keeps linked dimensions and geometry cleanup separate, with atomic stale/solver failures", () => {
    const current = healthy(line()), plan = planSketchOffset(current.profile, select("line"), options), solver = vi.fn(solveSketch);
    expect(solveOffsetApplication(current, plan, solver).accepted).toBe(true); expect(solver).toHaveBeenCalledTimes(1);
    const stale = { ...current, profile: structuredClone(current.profile) }; expect(solveOffsetApplication(stale, plan, solver).accepted).toBe(false); expect(solver).toHaveBeenCalledTimes(1);
    const detached = removeSelection(plan.profile, [{ kind: "constraint", id: group(plan.profile).id }]); expect(detached.constraints.some(c => c.type === "offsetDistance")).toBe(false); expect(detached.entities).toEqual(plan.profile.entities);
    const onlyDimRemoved = removeSelection(plan.profile, [{ kind: "constraint", id: dimension(plan.profile).id }]); expect(group(onlyDimRemoved)).toBeTruthy(); expect(healthy(onlyDimRemoved).degreesOfFreedom).toBe(1);
    const conflicting = structuredClone(plan.profile), target = conflicting.entities.find(e => e.id === plan.imageEntityIds[0])!; if (target.type !== "line") throw Error(); conflicting.constraints.push({ id: "conflict", type: "fix", pointId: target.start, x: 0, y: 2 });
    const badPlan = { ...plan, profile: conflicting }; expect(solveOffsetApplication(current, badPlan).accepted).toBe(false); expect(current.profile).toEqual(line());
  });
});
