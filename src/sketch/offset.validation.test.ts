import { describe, expect, it } from "vitest";
import type { EntityProfile, SketchOffsetRelation } from "./types";
import { validateEntityProfile } from "./validation";
import { removeSelection } from "./editing";
import {
  cleanupConstraintDependencies, constraintConstraintReferences,
  constraintEntityReferences, constraintPointReferences, constraintReferences,
} from "./references";

function circleProfile(): EntityProfile {
  return {
    kind: "entities",
    points: [{ id: "c", x: 0, y: 0 }, { id: "ci", x: 0, y: 0 }],
    entities: [
      { id: "source", type: "circle", center: "c", radius: 5, construction: true },
      { id: "image", type: "circle", center: "ci", radius: 7, construction: false },
    ],
    constraints: [
      { id: "offset", type: "offset",
        sources: [{ entityId: "source", reversed: false }],
        images: [{ side: "right", distance: 2, entityIds: ["image"], joins: [] }],
        closed: true, cap: "none", capEntityIds: [] },
      { id: "distance", type: "offsetDistance", offsetId: "offset", side: "right", value: 2 },
    ],
  };
}

function lineProfile(): EntityProfile {
  return {
    kind: "entities",
    points: [
      { id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 },
      { id: "ar", x: 0, y: -2 }, { id: "br", x: 10, y: -2 },
      { id: "al", x: 0, y: 2 }, { id: "bl", x: 10, y: 2 },
    ],
    entities: [
      { id: "source", type: "line", start: "a", end: "b", construction: true },
      { id: "right", type: "line", start: "ar", end: "br", construction: false },
      { id: "left", type: "line", start: "al", end: "bl", construction: false },
      { id: "start", type: "line", start: "ar", end: "al", construction: false },
      { id: "end", type: "line", start: "br", end: "bl", construction: false },
    ],
    constraints: [
      { id: "offset", type: "offset",
        sources: [{ entityId: "source", reversed: false }],
        images: [{ side: "right", distance: 2, entityIds: ["right"], joins: [] },
          { side: "left", distance: 2, entityIds: ["left"], joins: [] }],
        closed: false, cap: "line", capEntityIds: ["start", "end"] },
      { id: "distance", type: "offsetDistance", offsetId: "offset", side: "right", value: 2 },
    ],
  };
}

const relation = (profile: EntityProfile): SketchOffsetRelation =>
  profile.constraints.find((constraint): constraint is SketchOffsetRelation => constraint.type === "offset")!;

describe("offset persistence and typed references", () => {
  it("preserves a detached circle group and a dimension that precedes its group", () => {
    const profile = circleProfile();
    profile.constraints.reverse();
    const result = validateEntityProfile(profile);
    expect(result).toEqual(profile);
    relation(result).sources[0].reversed = true;
    expect(relation(profile).sources[0].reversed).toBe(false);
  });

  it("accepts open two-sided lines with explicit start and end caps", () => {
    expect(validateEntityProfile(lineProfile())).toEqual(lineProfile());
  });

  it("accepts open single-sided lines capped against the source", () => {
    const profile = lineProfile();
    relation(profile).images.pop();
    const start = profile.entities.find(entity => entity.id === "start")!;
    const end = profile.entities.find(entity => entity.id === "end")!;
    if (start.type === "line" && end.type === "line") { start.end = "a"; end.end = "b"; }
    expect(validateEntityProfile(profile)).toEqual(profile);
  });

  it("accepts matching open arcs without evaluating their stored geometry", () => {
    const profile = circleProfile();
    profile.points.push({ id: "a", x: 1, y: 0 }, { id: "b", x: 0, y: 1 });
    profile.entities = profile.entities.map(entity => ({ id: entity.id, construction: entity.construction,
      type: "arc", center: entity.type === "circle" ? entity.center : "c", start: "a", end: "b", clockwise: false }));
    relation(profile).closed = false;
    expect(validateEntityProfile(profile)).toEqual(profile);
  });

  it("validates structure without rejecting a degenerate source line", () => {
    const profile = lineProfile();
    profile.points[1] = { id: "b", x: 0, y: 0 };
    expect(validateEntityProfile(profile)).toEqual(profile);
  });

  it.each([
    ["empty sources", (group: SketchOffsetRelation) => { group.sources = []; }],
    ["repeated source", (group: SketchOffsetRelation) => { group.sources.push({ ...group.sources[0] }); }],
    ["missing source", (group: SketchOffsetRelation) => { group.sources[0].entityId = "missing"; }],
    ["source reused as image", (group: SketchOffsetRelation) => { group.images[0].entityIds[0] = "source"; }],
    ["empty images", (group: SketchOffsetRelation) => { group.images = []; }],
    ["empty correspondence", (group: SketchOffsetRelation) => { group.images[0].entityIds = []; }],
    ["repeated side", (group: SketchOffsetRelation) => { group.images.push(structuredClone(group.images[0])); }],
    ["circle open", (group: SketchOffsetRelation) => { group.closed = false; }],
    ["circle joins", (group: SketchOffsetRelation) => { group.images[0].joins.push({ kind: "intersection", branch: 0 }); }],
    ["closed cap", (group: SketchOffsetRelation) => { group.cap = "line"; }],
    ["seed zero", (group: SketchOffsetRelation) => { group.images[0].distance = 0; }],
    ["seed nonfinite", (group: SketchOffsetRelation) => { group.images[0].distance = Number.NaN; }],
  ] as const)("rejects %s", (_name, mutate) => {
    const profile = circleProfile();
    mutate(relation(profile));
    expect(() => validateEntityProfile(profile)).toThrow();
  });

  it("rejects an image of a different curve type", () => {
    const profile = circleProfile();
    profile.entities[1] = { id: "image", type: "line", start: "c", end: "ci", construction: false };
    expect(() => validateEntityProfile(profile)).toThrow(/mismo tipo/);
  });

  it.each([
    ["one cap", (group: SketchOffsetRelation) => { group.capEntityIds.pop(); }],
    ["wrong cap type", (group: SketchOffsetRelation) => { group.cap = "arc"; }],
    ["duplicate cap", (group: SketchOffsetRelation) => { group.capEntityIds[1] = group.capEntityIds[0]; }],
    ["cap reused as image", (group: SketchOffsetRelation) => { group.capEntityIds[0] = "right"; }],
    ["uncapped with caps", (group: SketchOffsetRelation) => { group.cap = "none"; }],
    ["open source with join", (group: SketchOffsetRelation) => { group.images[0].joins.push({ kind: "intersection", branch: 0 }); }],
  ] as const)("rejects %s", (_name, mutate) => {
    const profile = lineProfile();
    mutate(relation(profile));
    expect(() => validateEntityProfile(profile)).toThrow();
  });

  it("accepts ordered line joins and rejects invalid persisted branches", () => {
    const profile = lineProfile();
    const group = relation(profile);
    group.cap = "none"; group.capEntityIds = []; group.closed = false;
    profile.entities.push({ id: "source-next", type: "line", start: "b", end: "bl", construction: true });
    group.sources.push({ entityId: "source-next", reversed: false });
    group.images = [{ side: "right", distance: 2, entityIds: ["right", "end"],
      joins: [{ kind: "continuation", branch: 0 }] }];
    expect(validateEntityProfile(profile)).toEqual(profile);
    group.images[0].joins[0].branch = 1;
    expect(() => validateEntityProfile(profile)).toThrow(/rama 0/);
    group.images[0].joins[0] = { kind: "intersection", branch: 2 } as never;
    expect(() => validateEntityProfile(profile)).toThrow(/-1, 0 o 1/);
  });
  it("rejects disconnected persisted source/image chains, false closure and cap endpoint references", () => {
    const profile = lineProfile();
    for (const mutate of [
      (p: EntityProfile) => { relation(p).closed = true; relation(p).cap = "none"; relation(p).capEntityIds = []; relation(p).images.forEach(image => image.joins.push({ kind: "intersection", branch: 0 })); },
      (p: EntityProfile) => { const cap = p.entities.find(e => e.id === "start")!; if (cap.type === "line") cap.end = "b"; },
    ]) { const invalid = structuredClone(profile); mutate(invalid); expect(() => validateEntityProfile(invalid)).toThrow(); }
  });
  it("rejects repeated interior vertex identities in a persisted closed chain", () => {
    const coords = [[0, 0], [2, 0], [2, 2], [0, 2], [-2, 0], [-2, -2], [0, -2]];
    const vertices = [0, 1, 2, 3, 0, 4, 5, 6];
    const points = coords.map(([x, y], index) => ({ id: `p${index}`, x, y }));
    const sourceEntities = vertices.map((vertex, index) => ({ id: `s${index}`, type: "line" as const, construction: true, start: `p${vertex}`, end: `p${vertices[(index + 1) % vertices.length]}` }));
    const images = vertices.map((_, index) => ({ id: `i${index}`, x: index, y: 10 }));
    const imageEntities = images.map((p, index) => ({ id: `t${index}`, type: "line" as const, construction: false, start: p.id, end: images[(index + 1) % images.length].id }));
    const profile: EntityProfile = { kind: "entities", points: [...points, ...images], entities: [...sourceEntities, ...imageEntities], constraints: [{ id: "offset", type: "offset", sources: sourceEntities.map(e => ({ entityId: e.id, reversed: false })), images: [{ side: "right", distance: .2, entityIds: imageEntities.map(e => e.id), joins: imageEntities.map(() => ({ kind: "intersection", branch: 0 })) }], closed: true, cap: "none", capEntityIds: [] }] };
    expect(() => validateEntityProfile(profile)).toThrow(/vértices interiores/);
  });

  it("rejects an image owned by two groups", () => {
    const profile = circleProfile();
    profile.constraints.push({ ...structuredClone(relation(profile)), id: "other-offset" });
    expect(() => validateEntityProfile(profile)).toThrow(/dos equidistancias/);
  });

  it.each(["missing", "source", "c", "distance"])("rejects offsetDistance referencing %s", (offsetId) => {
    const profile = circleProfile();
    profile.constraints[1] = { id: "distance", type: "offsetDistance", offsetId, side: "right", value: 2 };
    expect(() => validateEntityProfile(profile)).toThrow(/relación de equidistancia/);
  });

  it("preserves dimension modes and validates driving and driven bounds", () => {
    const profile = circleProfile();
    const dimension = { id: "distance", type: "offsetDistance" as const, offsetId: "offset", side: "right" as const, value: 0,
      driven: true, referenceRole: "annotation" as const };
    profile.constraints[1] = dimension;
    expect(validateEntityProfile(profile)).toEqual(profile);
    dimension.driven = false;
    expect(() => validateEntityProfile(profile)).toThrow();
    dimension.value = 100_001;
    expect(() => validateEntityProfile(profile)).toThrow();
  });

  it("preserves independent per-side seeds and dimensions", () => {
    const profile = lineProfile();
    relation(profile).cap = "none";
    relation(profile).capEntityIds = [];
    relation(profile).images[1].distance = 3;
    profile.constraints.push({ id: "left-distance", type: "offsetDistance", offsetId: "offset",
      side: "left", value: 3, driven: true, referenceRole: "annotation" });
    expect(validateEntityProfile(profile)).toEqual(profile);
  });

  it("rejects a dimension targeting an absent side", () => {
    const profile = circleProfile();
    profile.constraints[1] = { id: "distance", type: "offsetDistance", offsetId: "offset", side: "left", value: 2 };
    expect(() => validateEntityProfile(profile)).toThrow(/lado existente/);
    expect(cleanupConstraintDependencies(profile.constraints).map(constraint => constraint.id)).toEqual(["offset"]);
  });

  it("rejects missing side seeds and a removed group-level seed field", () => {
    const missingSeed = circleProfile();
    delete (relation(missingSeed).images[0] as Partial<SketchOffsetRelation["images"][number]>).distance;
    expect(() => validateEntityProfile(missingSeed)).toThrow(/campo obligatorio/);
    const oldSeed = circleProfile();
    Object.assign(relation(oldSeed), { distance: 2 });
    expect(() => validateEntityProfile(oldSeed)).toThrow(/campo desconocido/);
  });

  it("requires a typed dimension side", () => {
    const profile = circleProfile();
    Object.assign(profile.constraints[1], { side: "front" });
    expect(() => validateEntityProfile(profile)).toThrow(/right o left/);
    delete (profile.constraints[1] as { side?: string }).side;
    expect(() => validateEntityProfile(profile)).toThrow(/campo obligatorio/);
  });

  it("rejects unknown fields on group, source, image and dimension", () => {
    const profile = lineProfile();
    for (const locate of [
      (p: EntityProfile) => relation(p),
      (p: EntityProfile) => relation(p).sources[0],
      (p: EntityProfile) => relation(p).images[0],
      (p: EntityProfile) => p.constraints[1],
    ]) {
      const candidate = structuredClone(profile);
      Object.assign(locate(candidate), { unexpected: true });
      expect(() => validateEntityProfile(candidate)).toThrow(/campo desconocido/);
    }
  });

  it.each(["duplicate owner", "cycle"])("rejects an arc direction %s across offset and mirror", (failure) => {
    const profile = circleProfile();
    profile.points.push({ id: "a", x: 1, y: 0 }, { id: "b", x: 0, y: 1 });
    profile.entities = profile.entities.map(entity => ({ id: entity.id, construction: entity.construction,
      type: "arc", center: entity.type === "circle" ? entity.center : "c", start: "a", end: "b", clockwise: false }));
    profile.entities.push({ id: "axis", type: "line", start: "a", end: "b", construction: true });
    relation(profile).closed = false;
    profile.constraints.push({ id: "mirror", type: "mirrorArcDirection", axisId: "axis",
      a: failure === "cycle" ? "image" : "source", b: failure === "cycle" ? "source" : "image" });
    expect(() => validateEntityProfile(profile)).toThrow(failure === "cycle" ? /ciclo/ : /más de una fuente/);
  });

  it("reports geometry and constraint references in their own roles", () => {
    const profile = lineProfile();
    expect(constraintPointReferences(relation(profile))).toEqual([]);
    expect(constraintEntityReferences(relation(profile))).toEqual(["source", "right", "left", "start", "end"]);
    expect(constraintConstraintReferences(profile.constraints[1])).toEqual(["offset"]);
    expect(constraintEntityReferences(profile.constraints[1])).toEqual([]);
    expect(constraintReferences(profile.constraints[1])).toEqual(["offset"]);
  });

  it.each(["offset", "source", "image"])("deleting %s cleans the dependent distance atomically", (id) => {
    const profile = circleProfile();
    const snapshot = structuredClone(profile);
    const result = removeSelection(profile, [{ kind: id === "offset" ? "constraint" : "entity", id }]);
    expect(result.constraints).toEqual([]);
    expect(profile).toEqual(snapshot);
    expect(validateEntityProfile(result)).toEqual(result);
  });

  it("deleting only the distance retains its geometric association", () => {
    const result = removeSelection(circleProfile(), [{ kind: "constraint", id: "distance" }]);
    expect(result.constraints.map(constraint => constraint.id)).toEqual(["offset"]);
    expect(validateEntityProfile(result)).toEqual(result);
  });

  it("cleans orphan distances after an external tool filter without mutating its input", () => {
    const profile = circleProfile();
    const filtered = profile.constraints.filter(constraint => constraint.type !== "offset");
    expect(cleanupConstraintDependencies(filtered)).toEqual([]);
    expect(filtered).toHaveLength(1);
    expect(cleanupConstraintDependencies(profile.constraints)).toEqual(profile.constraints);
  });
});
