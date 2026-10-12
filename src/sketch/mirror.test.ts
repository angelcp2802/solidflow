import { describe, expect, it, vi } from "vitest";
import { planSketchMirror, mirrorAxisPointIds } from "./mirror";
import { solveMirrorApplication } from "./mirrorApplication";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchConstraint, SketchSelection } from "./types";
import { SKETCH_LIMITS, validateEntityProfile } from "./validation";

const pick = (...ids: string[]): SketchSelection[] => ids.map(id => ({ kind: "entity", id }));
function fixture(axis: [[number, number], [number, number]] = [[0, -1], [0, 1]]): EntityProfile {
  return {
    kind: "entities",
    points: [
      { id: "axis-a", x: axis[0][0], y: axis[0][1] }, { id: "axis-b", x: axis[1][0], y: axis[1][1] },
      { id: "p", x: 3, y: 2 }, { id: "q", x: 5, y: 2 },
    ],
    entities: [
      { id: "axis", type: "line", start: "axis-a", end: "axis-b", construction: true },
      { id: "source", type: "line", start: "p", end: "q", construction: false },
    ],
    constraints: [],
  };
}
const imagePoint = (plan: ReturnType<typeof planSketchMirror>, source: string) => plan.profile.points.find(p => p.id === plan.pointMap[source])!;
function anchor(profile: EntityProfile) {
  profile.constraints.push(...profile.points.map(p => ({ id: `fix-${p.id}`, type: "fix", pointId: p.id, x: p.x, y: p.y } as const)));
  return profile;
}

describe("associative sketch mirror planning", () => {
  it.each([
    ["vertical", [[0, -1], [0, 1]], [-3, 2]],
    ["horizontal", [[-1, 0], [1, 0]], [3, -2]],
    ["diagonal", [[0, 0], [1, 1]], [2, 3]],
    ["offset diagonal", [[0, 1], [1, 2]], [1, 4]],
  ] as const)("reflects about the complete %s support", (_name, axis, expected) => {
    const input = fixture(axis.map(p => [...p]) as [[number, number], [number, number]]);
    const before = structuredClone(input);
    const plan = planSketchMirror(input, pick("source"), { axisEntityId: "axis" });
    expect(plan.changed, plan.message).toBe(true);
    expect(imagePoint(plan, "p").x).toBeCloseTo(expected[0], 12);
    expect(imagePoint(plan, "p").y).toBeCloseTo(expected[1], 12);
    expect(input).toEqual(before);
    expect(plan.sourceProfile).toBe(input);
    expect(plan.profile).not.toBe(input);
    expect(plan.profile.entities.slice(0, 2)).toEqual(input.entities);
    expect(plan.profile.constraints).toContainEqual(expect.objectContaining({ type: "symmetric", a: "p", b: plan.pointMap.p, axisId: "axis" }));
  });
  it("is invariant to axis endpoint reversal and input selection order", () => {
    const input = fixture([[0, 1], [1, 2]]);
    input.entities.push({ id: "circle", type: "circle", center: "p", radius: 1, construction: true });
    const a = planSketchMirror(input, pick("source", "circle"), { axisEntityId: "axis" });
    const reversed = structuredClone(input);
    const axis = reversed.entities[0];
    if (axis.type === "line") [axis.start, axis.end] = [axis.end, axis.start];
    const b = planSketchMirror(reversed, pick("circle", "source"), { axisEntityId: "axis" });
    expect(a.changed && b.changed).toBe(true);
    expect(Object.keys(a.pointMap)).toEqual(Object.keys(b.pointMap));
    expect(Object.keys(a.entityMap)).toEqual(Object.keys(b.entityMap));
    const pointRoles = (plan: typeof a) => {
      const sources = new Map(Object.entries(plan.pointMap).map(([source, image]) => [image, `image:${source}`]));
      return plan.profile.points.map(({ id, ...coordinates }) => ({ ...coordinates, id: sources.get(id) ?? id }));
    };
    expect(pointRoles(a)).toEqual(pointRoles(b));
    const boundImages = (plan: typeof a) => {
      const points = new Map(Object.entries(plan.pointMap).filter(([source, image]) => source !== image)
        .map(([source, image]) => [image, `image:${source}`]));
      const pointRole = (id: string) => points.get(id) ?? id;
      return Object.fromEntries(Object.entries(plan.entityMap).map(([source, image]) => {
        const entity = plan.profile.entities.find(candidate => candidate.id === image);
        if (!entity) throw new Error(`Missing image for source ${source}`);
        const { id: _identity, ...geometry } = entity;
        if (entity.type === "circle") return [source, { ...geometry, center: pointRole(entity.center) }];
        if (entity.type === "line") return [source, { ...geometry, start: pointRole(entity.start), end: pointRole(entity.end) }];
        return [source, { ...geometry, center: pointRole(entity.center), start: pointRole(entity.start), end: pointRole(entity.end) }];
      }));
    };
    expect(boundImages(a)).toEqual(boundImages(b));
    expect(a.imageEntityIds.every(id => !b.imageEntityIds.includes(id))).toBe(true);
  });
  it.each([false, true])("reflects shared contacts and reverses a %s clockwise arc", clockwise => {
    const input = fixture();
    input.points.push({ id: "end", x: 3, y: 4 });
    input.entities.push({ id: "arc", type: "arc", center: "p", start: "q", end: "end", clockwise, construction: false });
    const plan = planSketchMirror(input, pick("source", "arc"), { axisEntityId: "axis" });
    expect(plan.changed, plan.message).toBe(true);
    const image = plan.profile.entities.find(e => e.id === plan.entityMap.arc)!;
    const line = plan.profile.entities.find(e => e.id === plan.entityMap.source)!;
    expect(image).toMatchObject({ type: "arc", center: plan.pointMap.p, start: plan.pointMap.q, end: plan.pointMap.end, clockwise: !clockwise });
    expect(line).toMatchObject({ start: plan.pointMap.p, end: plan.pointMap.q });
    expect(imagePoint(plan, "end")).toMatchObject({ x: -3, y: 4 });
    expect(plan.profile.points).toHaveLength(input.points.length + 3);
  });
  it("preserves construction flags and links full circle radii without copying source drivers", () => {
    const input = anchor(fixture());
    input.entities.push({ id: "circle", type: "circle", center: "p", radius: 1, construction: true });
    input.constraints.push({ id: "radius", type: "radius", entityId: "circle", value: 1 });
    const current = solveSketch(input);
    expect(current.status).toBe("fullyDefined");
    const plan = planSketchMirror(current.profile, pick("source", "circle"), { axisEntityId: "axis" });
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.profile.constraints.filter(c => c.type === "fix")).toEqual(input.constraints.filter(c => c.type === "fix"));
    expect(plan.profile.entities.find(e => e.id === plan.entityMap.circle)).toMatchObject({ construction: true, radius: 1 });
    expect(plan.profile.constraints).toContainEqual(expect.objectContaining({ type: "equal", a: "circle", b: plan.entityMap.circle }));
    const edited = structuredClone(plan.profile);
    const radius = edited.constraints.find(c => c.id === "radius")!;
    if ("value" in radius) radius.value = 2;
    const solved = solveSketch(edited);
    expect(solved.status, solved.message).toBe("fullyDefined");
    expect(solved.profile.entities.find(e => e.id === plan.entityMap.circle)).toMatchObject({ radius: expect.closeTo(2, 6) });
  });
  it("joins only explicitly named source points on the axis, with a persistent seam relation", () => {
    const input = fixture();
    input.points[2] = { id: "p", x: 0, y: 2 };
    input.points.push({ id: "unrelated", x: 0, y: 2 });
    expect(mirrorAxisPointIds(input, ["source"], "axis")).toEqual(["p"]);
    const separate = planSketchMirror(input, pick("source"), { axisEntityId: "axis" });
    expect(separate.pointMap.p).not.toBe("p");
    const joined = planSketchMirror(input, pick("source"), { axisEntityId: "axis", joinPointIds: ["p"] });
    expect(joined.changed, joined.message).toBe(true);
    expect(joined.pointMap.p).toBe("p");
    expect(joined.profile.constraints).toContainEqual(expect.objectContaining({ type: "pointOnLine", pointId: "p", entityId: "axis" }));
    expect(joined.profile.points.find(p => p.id === "unrelated")).toEqual(input.points.at(-1));
  });
  it("reflects the immutable origin to a normal new point about an offset axis", () => {
    const input = fixture([[1, -1], [1, 1]]);
    input.entities[1] = { id: "source", type: "line", start: "origin", end: "q", construction: false };
    const plan = planSketchMirror(input, pick("source"), { axisEntityId: "axis" });
    expect(plan.changed).toBe(true);
    expect(plan.pointMap.origin).not.toBe("origin");
    expect(imagePoint(plan, "origin")).toMatchObject({ x: 2, y: 0 });
    expect(plan.profile.points.some(p => p.id === "origin")).toBe(false);
  });
  it("does not derive new global horizontal/vertical/fix/angle constraints", () => {
    const input = fixture([[0, 1], [1, 2]]);
    input.constraints.push({ id: "horizontal", type: "horizontal", entityId: "source" });
    const plan = planSketchMirror(input, pick("source"), { axisEntityId: "axis" });
    expect(plan.profile.constraints.slice(0, 1)).toEqual(input.constraints);
    expect(plan.profile.constraints.slice(1).every(c => c.type === "symmetric")).toBe(true);
  });
  it.each([
    [[], { axisEntityId: "axis" }],
    [pick("missing"), { axisEntityId: "axis" }],
    [pick("source", "source"), { axisEntityId: "axis" }],
    [pick("source", "axis"), { axisEntityId: "axis" }],
    [pick("source"), { axisEntityId: "missing" }],
    [pick("source"), { axisEntityId: "axis", joinPointIds: ["p"] }],
    [pick("source"), { axisEntityId: "axis", joinPointIds: ["unknown"] }],
    [[{ kind: "point", id: "p" }], { axisEntityId: "axis" }],
  ] as const)("rejects invalid selection or seam references atomically (%#)", (selection, parameters) => {
    const input = fixture(), before = structuredClone(input);
    const plan = planSketchMirror(input, selection.map(item => ({ ...item })), { ...parameters, ...("joinPointIds" in parameters ? { joinPointIds: [...parameters.joinPointIds] } : {}) });
    expect(plan.changed).toBe(false);
    expect(plan.profile).toBe(input);
    expect(plan.createdConstraintIds).toEqual([]);
    expect(input).toEqual(before);
  });
  it.each([0, 1e-8])("rejects a degenerate axis of length %s", length => {
    const input = fixture([[0, 0], [0, length]]);
    expect(planSketchMirror(input, pick("source"), { axisEntityId: "axis" }).changed).toBe(false);
  });
  it("rejects exact overlapping images rather than committing duplicate contours", () => {
    const input = fixture();
    input.points[2] = { id: "p", x: 0, y: 2 }; input.points[3] = { id: "q", x: 0, y: 4 };
    const plan = planSketchMirror(input, pick("source"), { axisEntityId: "axis", joinPointIds: ["p", "q"] });
    expect(plan.changed).toBe(false);
    expect(plan.message).toMatch(/coincide/);
  });
  it("allows crossing sketches while leaving solid contour validity to the CAD builder", () => {
    const input = fixture(); input.points[3] = { id: "q", x: -2, y: -1 };
    const plan = planSketchMirror(input, pick("source"), { axisEntityId: "axis" });
    expect(plan.changed, plan.message).toBe(true);
    expect(imagePoint(plan, "q")).toMatchObject({ x: 2, y: -1 });
  });
  it.each(["points", "entities", "constraints"] as const)("rejects whole-result %s overflow without a prefix", field => {
    const input = fixture();
    if (field === "points") while (input.points.length < SKETCH_LIMITS.maxPoints - 1)
      input.points.push({ id: `extra-point-${input.points.length}`, x: 40, y: 40 });
    if (field === "entities") while (input.entities.length < SKETCH_LIMITS.maxEntities)
      input.entities.push({ id: `extra-entity-${input.entities.length}`, type: "circle", center: "p", radius: 2, construction: true });
    if (field === "constraints") while (input.constraints.length < SKETCH_LIMITS.maxConstraints - 1)
      input.constraints.push({ id: `extra-constraint-${input.constraints.length}`, type: "horizontal", entityId: "source" });
    validateEntityProfile(input);
    const before = structuredClone(input), plan = planSketchMirror(input, pick("source"), { axisEntityId: "axis" });
    expect(plan.changed).toBe(false); expect(plan.profile).toBe(input); expect(input).toEqual(before);
  });
});

describe("mirror application boundary", () => {
  it("solves the complete detached proposal once and leaves history ownership to the caller", () => {
    const current = solveSketch(anchor(fixture()));
    const plan = planSketchMirror(current.profile, pick("source"), { axisEntityId: "axis" });
    const solver = vi.fn(solveSketch), result = solveMirrorApplication(current, plan, solver);
    expect(result.accepted).toBe(true); expect(solver).toHaveBeenCalledTimes(1);
    if (result.accepted) expect(result.solution.status).toBe("fullyDefined");
  });
  it("rejects stale and unhealthy previews before any solve", () => {
    const current = solveSketch(anchor(fixture()));
    const plan = planSketchMirror(current.profile, pick("source"), { axisEntityId: "axis" });
    const solver = vi.fn(solveSketch);
    expect(solveMirrorApplication({ ...current, profile: structuredClone(current.profile) }, plan, solver).accepted).toBe(false);
    expect(solveMirrorApplication({ ...current, status: "inconsistent" }, plan, solver).accepted).toBe(false);
    expect(solveMirrorApplication(null, plan, solver).accepted).toBe(false);
    expect(solver).not.toHaveBeenCalled();
  });
  it("rejects a conflicting whole proposal without changing the displayed source", () => {
    const current = solveSketch(anchor(fixture())), before = structuredClone(current.profile);
    const plan = planSketchMirror(current.profile, pick("source"), { axisEntityId: "axis" });
    plan.profile.constraints.push({ id: "conflicting-image", type: "fix", pointId: plan.pointMap.p, x: 100, y: 100 } satisfies SketchConstraint);
    const solver = vi.fn(solveSketch), result = solveMirrorApplication(current, plan, solver);
    expect(result.accepted).toBe(false); expect(solver).toHaveBeenCalledTimes(1);
    expect(current.profile).toEqual(before);
  });
});
