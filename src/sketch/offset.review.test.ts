import { describe, expect, it } from "vitest";
import { planSketchOffset, type OffsetParameters } from "./offset";
import { planSketchMirror } from "./mirror";
import { solveSketch, measureDimension } from "./solver";
import { removeSelection } from "./editing";
import { trimToClosest } from "./trim";
import { extendToClosest } from "./extend";
import { planSketchFillet, planSketchFilletBatch } from "./fillet";
import { planSketchChamfer } from "./chamfer";
import { validateEntityProfile } from "./validation";
import { offsetGeometryError } from "./offset-geometry";
import type { EntityProfile, SketchEntity, SketchOffsetRelation } from "./types";

const parameters: OffsetParameters = { distance: 2, reverse: false, bothDirections: false, chain: true, cap: "none", construction: "none", addDimensions: true };
const selected = (...ids: string[]) => ids.map(id => ({ kind: "entity" as const, id }));
const at = (profile: EntityProfile, id: string) => id === "origin" ? { x: 0, y: 0 } : profile.points.find(p => p.id === id)!;
const relation = (profile: EntityProfile) => profile.constraints.find(c => c.type === "offset") as SketchOffsetRelation;
const healthy = (profile: EntityProfile) => { const result = solveSketch(profile); expect(result.status, result.message).toMatch(/^(fullyDefined|underdefined)$/); return result; };
function fixed(profile: EntityProfile): EntityProfile { profile.constraints = profile.points.map(p => ({ id: `fix-${p.id}`, type: "fix", pointId: p.id, x: p.x, y: p.y })); return profile; }
function polygon(coords: [number, number][]): EntityProfile { return fixed({ kind: "entities", points: coords.map(([x, y], i) => ({ id: `p${i}`, x, y })), entities: coords.map((_, i) => ({ id: `edge-${i}`, type: "line", start: `p${i}`, end: `p${(i + 1) % coords.length}`, construction: false })), constraints: [] }); }
const area = (profile: EntityProfile, ids: string[]) => Math.abs(ids.reduce((sum, id) => { const entity = profile.entities.find(e => e.id === id)!; if (entity.type !== "line") throw Error(); const a = at(profile, entity.start), b = at(profile, entity.end); return sum + a.x * b.y - a.y * b.x; }, 0) / 2);

describe("offset geometric boundaries and integration", () => {
  it("supports a concave L contour in both directions with independent analytical areas", () => {
    const input = polygon([[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]);
    for (const [reverse, expected] of [[false, 108], [true, 28]] as const) {
      const plan = planSketchOffset(input, selected("edge-0"), { ...parameters, distance: 1, reverse }); expect(plan.changed, plan.message).toBe(true);
      const result = healthy(plan.profile); expect(result.status).toBe("fullyDefined"); expect(area(result.profile, plan.imageEntityIds)).toBeCloseTo(expected, 7);
    }
  });
  it("allows disjoint finite collinear supports in a U contour and rejects notch consumption", () => {
    const input = polygon([[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]]);
    const plan = planSketchOffset(input, selected("edge-0"), { ...parameters, distance: .5 }); expect(plan.changed, plan.message).toBe(true);
    expect(area(healthy(plan.profile).profile, plan.imageEntityIds)).toBeCloseTo(100, 7);
    for (const distance of [2, 2.1]) { const rejected = planSketchOffset(input, selected("edge-0"), { ...parameters, distance }); expect(rejected.changed).toBe(false); expect(rejected.profile).toBe(input); }
  });
  it("allows complementary semicircles sharing a center and two endpoint identities", () => {
    const input = fixed({ kind: "entities", points: [{ id: "a", x: 5, y: 0 }, { id: "b", x: -5, y: 0 }], entities: [
      { id: "top", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: false },
      { id: "bottom", type: "arc", center: "origin", start: "b", end: "a", clockwise: false, construction: false }], constraints: [] });
    const plan = planSketchOffset(input, selected("top"), parameters); expect(plan.changed, plan.message).toBe(true);
    const result = healthy(plan.profile); expect(result.status).toBe("fullyDefined");
    expect(plan.imageEntityIds.map(id => { const e = result.profile.entities.find(e => e.id === id)!; if (e.type !== "arc") throw Error(); return Math.hypot(at(result.profile, e.start).x, at(result.profile, e.start).y); })).toEqual([7, 7]);
  });
  it("regularizes a tangent line/arc chain at its physical shared joint", () => {
    const input = fixed({ kind: "entities", points: [{ id: "joint", x: 10, y: 0 }, { id: "center", x: 10, y: 5 }, { id: "far", x: 15, y: 5 }], entities: [
      { id: "line", type: "line", start: "origin", end: "joint", construction: false }, { id: "arc", type: "arc", center: "center", start: "joint", end: "far", clockwise: false, construction: false }], constraints: [] });
    const before = structuredClone(input), plan = planSketchOffset(input, selected("line"), parameters); expect(plan.changed, plan.message).toBe(true); expect(input).toEqual(before);
    const result = healthy(plan.profile); const group = relation(result.profile); expect(group.images[0].joins).toEqual([{ kind: "continuation", branch: 0 }]);
    const image = result.profile.entities.find(e => e.id === group.images[0].entityIds[0])!; if (image.type !== "line") throw Error();
    expect(at(result.profile, image.end)).toMatchObject({ x: 10, y: -2 });
    const arc = result.profile.entities.find(e => e.id === group.images[0].entityIds[1])!; if (arc.type !== "arc") throw Error(); expect(arc.start).toBe(image.end); expect(at(result.profile, arc.center)).toMatchObject({ x: 10, y: 5 }); expect(arc.center).not.toBe("center");
  });
  it("freezes the chosen nontangent line/arc root over a distance edit", () => {
    const input = fixed({ kind: "entities", points: [{ id: "joint", x: 10, y: 0 }, { id: "center", x: 5, y: 0 }, { id: "far", x: 5, y: 5 }], entities: [
      { id: "line", type: "line", start: "origin", end: "joint", construction: false }, { id: "arc", type: "arc", center: "center", start: "joint", end: "far", clockwise: false, construction: false }], constraints: [] });
    const plan = planSketchOffset(input, selected("line"), parameters); expect(plan.changed, plan.message).toBe(true); const result = healthy(plan.profile);
    const image = result.profile.entities.find(e => e.id === plan.imageEntityIds[0])!; if (image.type !== "line") throw Error(); expect(at(result.profile, image.end).x).toBeCloseTo(5 + Math.sqrt(45), 8);
    const edited = structuredClone(result.profile), dimension = edited.constraints.find(c => c.type === "offsetDistance")!; if (dimension.type !== "offsetDistance") throw Error(); dimension.value = 3;
    const next = healthy(edited); expect(at(next.profile, image.end).x).toBeCloseTo(5 + Math.sqrt(55), 7); expect(at(next.profile, image.end).y).toBeCloseTo(-3, 8); expect(relation(next.profile).images[0].joins).toEqual(relation(result.profile).images[0].joins);
    const wrong = structuredClone(result.profile); relation(wrong).images[0].joins[0].branch = -1; expect(solveSketch(wrong).status).not.toMatch(/^(fullyDefined|underdefined)$/);
  });
  it("supports an arc/arc chain and rejects the finite-arc disappearance boundary", () => {
    const input = fixed({ kind: "entities", points: [{ id: "start", x: 5, y: 0 }, { id: "joint", x: 3, y: 4 }, { id: "second-center", x: 6, y: 0 }, { id: "end", x: 11, y: 0 }], entities: [
      { id: "first", type: "arc", center: "origin", start: "start", end: "joint", clockwise: false, construction: false }, { id: "second", type: "arc", center: "second-center", start: "joint", end: "end", clockwise: true, construction: false }], constraints: [] });
    const plan = planSketchOffset(input, selected("first"), parameters); expect(plan.changed, plan.message).toBe(true); const result = healthy(plan.profile), first = result.profile.entities.find(e => e.id === plan.imageEntityIds[0])!; if (first.type !== "arc") throw Error();
    expect(at(result.profile, first.end).x).toBeCloseTo(19 / 3, 8); expect(at(result.profile, first.end).y).toBeCloseTo(4 * Math.sqrt(5) / 3, 8);
    const bad = planSketchOffset(input, selected("first"), { ...parameters, distance: 3 }); expect(bad.changed).toBe(false); expect(bad.profile).toBe(input);
  });
  it("preserves major arcs, translated centers and chained offset/mirror direction ownership", () => {
    const input = fixed({ kind: "entities", points: [{ id: "center", x: 20, y: 30 }, { id: "a", x: 25, y: 30 }, { id: "b", x: 20, y: 25 }, { id: "axis-end", x: 0, y: 50 }], entities: [
      { id: "major", type: "arc", center: "center", start: "a", end: "b", clockwise: false, construction: false }, { id: "axis", type: "line", start: "origin", end: "axis-end", construction: true }], constraints: [] });
    const first = planSketchOffset(input, selected("major"), { ...parameters, chain: false }); expect(first.changed, first.message).toBe(true); const result = healthy(first.profile);
    const second = planSketchOffset(result.profile, selected(first.imageEntityIds[0]), { ...parameters, chain: false }); expect(second.changed, second.message).toBe(true); healthy(second.profile);
    const mirrored = planSketchMirror(result.profile, selected(first.imageEntityIds[0]), { axisEntityId: "axis" }); expect(mirrored.changed, mirrored.message).toBe(true);
    const third = planSketchOffset(healthy(mirrored.profile).profile, selected(mirrored.imageEntityIds[0]), { ...parameters, chain: false }); expect(third.changed, third.message).toBe(true); const solved = healthy(third.profile);
    expect(validateEntityProfile(JSON.parse(JSON.stringify(solved.profile)))).toEqual(solved.profile); expect(input.points[0]).toEqual({ id: "center", x: 20, y: 30 });
  });
  it("rejects structural limits and malformed direct measurements without input changes", () => {
    const input = polygon([[0, 0], [10, 0], [10, 6], [0, 6]]); for (let i = input.points.length; i < 128; i++) input.points.push({ id: `unused-${i}`, x: i, y: 50 });
    const before = structuredClone(input), rejected = planSketchOffset(input, selected("edge-0"), parameters); expect(rejected.changed).toBe(false); expect(rejected.profile).toBe(input); expect(input).toEqual(before);
    const source = fixed({ kind: "entities", points: [{ id: "a", x: 5, y: 0 }, { id: "b", x: 0, y: 5 }], entities: [{ id: "arc", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: false }], constraints: [] });
    const plan = planSketchOffset(source, selected("arc"), parameters), malformed = structuredClone(plan.profile); malformed.points = malformed.points.filter(p => p.id !== "a"); const dimension = malformed.constraints.find(c => c.type === "offsetDistance")!;
    if (dimension.type !== "offsetDistance") throw Error(); expect(measureDimension(malformed, dimension)).toBeNull();
  });
  it.each([false, true])("restores owned exterior cap winding after metadata edits, reverse=%s", reverse => {
    const input = fixed({ kind: "entities", points: [{ id: "end", x: 10, y: 0 }], entities: [{ id: "line", type: "line", start: "origin", end: "end", construction: false }], constraints: [] });
    const plan = planSketchOffset(input, selected("line"), { ...parameters, cap: "arc", bothDirections: true, reverse }); expect(plan.changed, plan.message).toBe(true);
    const initial = healthy(plan.profile), edited = structuredClone(initial.profile);
    for (const id of plan.capEntityIds) { const cap = edited.entities.find(e => e.id === id)!; if (cap.type !== "arc") throw Error(); cap.clockwise = !cap.clockwise; }
    const before = structuredClone(edited), result = healthy(JSON.parse(JSON.stringify(edited))); expect(edited).toEqual(before);
    expect(plan.capEntityIds.map(id => (result.profile.entities.find(e => e.id === id) as Extract<SketchEntity, { type: "arc" }>).clockwise)).toEqual([!reverse, reverse]);
    expect(result.profile.constraints).toEqual(initial.profile.constraints);
  });
  it.each(["line", "arc"] as const)("rejects antipodal capped arc stations for %s caps", cap => {
    for (const bothDirections of [false, true]) {
      const input = fixed({ kind: "entities", points: [{ id: "a", x: 2, y: 0 }, { id: "b", x: 0, y: 2 }], entities: [{ id: "source", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: true }], constraints: [] });
      const plan = planSketchOffset(input, selected("source"), { ...parameters, distance: 1, cap, bothDirections }); expect(plan.changed, plan.message).toBe(true);
      const edited = structuredClone(healthy(plan.profile).profile), image = edited.entities.find(e => e.id === plan.imageEntityIds[0])!; if (image.type !== "arc") throw Error();
      at(edited, image.start).x = -3;
      expect(offsetGeometryError(edited, relation(edited))).not.toBeNull(); const before = structuredClone(edited); expect(solveSketch(edited).status).not.toMatch(/^(underdefined|fullyDefined)$/); expect(edited).toEqual(before);
    }
  });
  it("rejects the antipodal radial branch of a continuation arc joint", () => {
    const input = fixed({ kind: "entities", points: [{ id: "a", x: 0, y: -5 }, { id: "b", x: 5, y: 0 }, { id: "c", x: 0, y: 5 }], entities: [
      { id: "first", type: "arc", center: "origin", start: "a", end: "b", clockwise: false, construction: false }, { id: "second", type: "arc", center: "origin", start: "b", end: "c", clockwise: false, construction: false }], constraints: [] });
    const plan = planSketchOffset(input, selected("first"), parameters); expect(plan.changed, plan.message).toBe(true); const edited = structuredClone(healthy(plan.profile).profile), image = edited.entities.find(e => e.id === plan.imageEntityIds[0])!; if (image.type !== "arc") throw Error(); at(edited, image.end).x = -7;
    expect(offsetGeometryError(edited, relation(edited))).toMatch(/rayo radial/); expect(solveSketch(edited).status).not.toMatch(/^(underdefined|fullyDefined)$/);
  });
  it("restores exterior cap ownership on translated rotated chains, either side and one/two images", () => {
    for (const angle of [0, Math.PI / 6, Math.PI / 2, 2 * Math.PI / 3]) for (const reverse of [false, true]) for (const bothDirections of [false, true]) {
      const input = fixed({ kind: "entities", points: [{ id: "a", x: 20, y: 30 }, { id: "b", x: 20 + 10 * Math.cos(angle), y: 30 + 10 * Math.sin(angle) }], entities: [{ id: "line", type: "line", start: "a", end: "b", construction: true }], constraints: [] });
      const plan = planSketchOffset(input, selected("line"), { ...parameters, cap: "arc", reverse, bothDirections }); expect(plan.changed, plan.message).toBe(true); const edited = structuredClone(healthy(plan.profile).profile);
      for (const id of plan.capEntityIds) { const cap = edited.entities.find(e => e.id === id)!; if (cap.type !== "arc") throw Error(); cap.clockwise = !cap.clockwise; }
      const result = healthy(JSON.parse(JSON.stringify(edited))); expect(offsetGeometryError(result.profile, relation(result.profile))).toBeNull();
      expect(plan.capEntityIds.map(id => (result.profile.entities.find(e => e.id === id) as Extract<SketchEntity, { type: "arc" }>).clockwise)).toEqual([!reverse, reverse]);
    }
  });
  it("guards topology-changing tools until explicit unlink, while allowing unrelated members", () => {
    const input = polygon([[0, 0], [10, 0], [10, 6], [0, 6]]), plan = planSketchOffset(input, selected("edge-0"), { ...parameters, distance: 1 });
    const profile = healthy(plan.profile).profile, before = structuredClone(profile);
    const operations = [
      () => trimToClosest(profile, "edge-0", { x: 5, y: 0 }), () => extendToClosest(profile, "edge-0", { x: 9, y: 0 }),
      () => planSketchFillet(profile, [{ kind: "point", id: "p1" }], { radius: 1, cornerPolicy: "keep" }),
      () => planSketchFilletBatch(profile, [{ kind: "point", id: "p1" }, { kind: "point", id: "p2" }], { radius: 1, cornerPolicy: "keep", radiusMode: "linked" }),
      () => planSketchChamfer(profile, [{ kind: "point", id: "p1" }], { mode: "equal", distance: 1 }),
    ];
    for (const operation of operations) { const result = operation(); expect(result.changed).toBe(false); expect(result.profile).toBe(profile); expect(result.message).toMatch(/equidistancia/); } expect(profile).toEqual(before);
    const detached = removeSelection(profile, [{ kind: "constraint", id: relation(profile).id }]); expect(planSketchFillet(detached, [{ kind: "point", id: "p1" }], { radius: 1, cornerPolicy: "keep" }).changed).toBe(true); expect(planSketchChamfer(detached, [{ kind: "point", id: "p1" }], { mode: "equal", distance: 1 }).changed).toBe(true); expect(trimToClosest(detached, "edge-0", { x: 5, y: 0 }).changed).toBe(true);
    const unrelated = structuredClone(profile); unrelated.points.push({ id: "u", x: 30, y: 0 }, { id: "v", x: 40, y: 0 }); unrelated.entities.push({ id: "unrelated", type: "line", start: "u", end: "v", construction: false }); expect(trimToClosest(unrelated, "unrelated", { x: 35, y: 0 }).changed).toBe(true);
  });
});
