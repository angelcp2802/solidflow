import { expect, it, vi } from "vitest";
import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";
import { solveSketch, SKETCH_SOLVER_TOLERANCE } from "./solver";
import { validateEntityProfile } from "./validation";
import {
  parseDocument,
  createDocument,
  serializeDocument,
} from "../model/document";
import { previewTrimToClosest, trimToClosest } from "./trim";

const p = (id: string, x: number, y: number) => ({ id, x, y });
const line = (id: string, start: string, end: string): SketchEntity => ({
  id,
  type: "line",
  start,
  end,
  construction: false,
});
const fix = (pointId: string, x: number, y: number): SketchConstraint => ({
  id: `fix-${pointId}`,
  type: "fix",
  pointId,
  x,
  y,
});
const profile = (
  points: EntityProfile["points"],
  entities: SketchEntity[],
  constraints: SketchConstraint[] = [],
): EntityProfile => ({ kind: "entities", points, entities, constraints });
const point = (input: EntityProfile, id: string) =>
  id === "origin"
    ? p("origin", 0, 0)
    : input.points.find((item) => item.id === id)!;
const accepted = (input: EntityProfile) => {
  const result = solveSketch(input);
  expect(["fullyDefined", "underdefined"], result.message).toContain(
    result.status,
  );
  expect(result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
  return result;
};
const entity = (input: EntityProfile, id: string) =>
  input.entities.find((item) => item.id === id)!;

it("moves a freshly trimmed boundary when its line cutter is edited, without restoring the old driving length", () => {
  const input = profile(
    [p("end", 10, 0), p("bottom", 4, -5), p("top", 4, 5)],
    [line("target", "origin", "end"), line("cutter", "bottom", "top")],
    [
      { id: "horizontal", type: "horizontal", entityId: "target" },
      { id: "old-length", type: "length", entityId: "target", value: 10 },
      {
        id: "reading",
        type: "length",
        entityId: "target",
        value: 42,
        driven: true,
        referenceRole: "annotation",
      },
      fix("bottom", 4, -5),
      fix("top", 4, 5),
    ],
  );
  const original = structuredClone(input);
  const cut = trimToClosest(input, "target", { x: 8, y: 0 });
  expect(cut.changed, cut.message).toBe(true);
  expect(cut.deletedConstraintIds).toEqual(["old-length"]);
  expect(input).toEqual(original);
  let solved = accepted(cut.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(solved.drivenValues.reading).toBeCloseTo(4, 7);
  const modified = structuredClone(solved.profile);
  for (const constraint of modified.constraints)
    if (constraint.type === "fix") constraint.x = 6;
  solved = accepted(modified);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.drivenValues.reading).toBeCloseTo(6, 6);
  expect(
    solved.profile.constraints.find((item) => item.id === "reading"),
  ).toMatchObject({ value: 42, driven: true });
  const trimmed = entity(solved.profile, "target");
  expect(trimmed.type).toBe("line");
  if (trimmed.type === "line")
    expect(point(solved.profile, trimmed.end).x).toBeCloseTo(6, 6);
});

it("keeps both split pieces collinear and attached while the two cutters move", () => {
  const input = profile(
    [
      p("end", 10, 0),
      p("a0", 3, -4),
      p("a1", 3, 4),
      p("b0", 7, -4),
      p("b1", 7, 4),
    ],
    [
      line("target", "origin", "end"),
      line("a", "a0", "a1"),
      line("b", "b0", "b1"),
    ],
    [
      { id: "horizontal", type: "horizontal", entityId: "target" },
      { id: "end-x", type: "distanceX", a: "origin", b: "end", value: 10 },
      fix("a0", 3, -4),
      fix("a1", 3, 4),
      fix("b0", 7, -4),
      fix("b1", 7, 4),
    ],
  );
  const cut = trimToClosest(input, "target", { x: 5, y: 0 });
  expect(cut.changed, cut.message).toBe(true);
  expect(cut.affectedEntityIds).toHaveLength(2);
  const [firstId, secondId] = cut.affectedEntityIds;
  expect(firstId).toBe("target");
  expect(
    cut.profile.constraints.filter((item) => item.type === "horizontal"),
  ).toHaveLength(1);
  expect(cut.profile.constraints).toContainEqual(
    expect.objectContaining({ type: "parallel", a: firstId, b: secondId }),
  );
  let solved = accepted(cut.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  const modified = structuredClone(solved.profile);
  for (const constraint of modified.constraints)
    if (constraint.type === "fix")
      constraint.x = constraint.pointId.startsWith("a") ? 4 : 6;
  solved = accepted(modified);
  expect(solved.degreesOfFreedom).toBe(0);
  const first = entity(solved.profile, firstId),
    second = entity(solved.profile, secondId);
  if (first.type !== "line" || second.type !== "line")
    throw new Error("Expected split lines");
  expect(point(solved.profile, first.end).x).toBeCloseTo(4, 6);
  expect(point(solved.profile, second.start).x).toBeCloseTo(6, 6);
  expect(point(solved.profile, second.end)).toMatchObject({
    x: expect.closeTo(10, 6),
    y: expect.closeTo(0, 6),
  });
});

it("keeps a line trim attached to a circular cutter after its radius changes and after saving", () => {
  const input = profile(
    [p("left", -10, 0), p("right", 10, 0)],
    [
      line("target", "left", "right"),
      {
        id: "cutter",
        type: "circle",
        center: "origin",
        radius: 5,
        construction: true,
      },
    ],
    [
      fix("right", 10, 0),
      { id: "horizontal", type: "horizontal", entityId: "target" },
      { id: "radius", type: "radius", entityId: "cutter", value: 5 },
      {
        id: "reading",
        type: "length",
        entityId: "target",
        value: 20,
        driven: true,
      },
    ],
  );
  const cut = trimToClosest(input, "target", { x: -8, y: 0 });
  expect(cut.changed, cut.message).toBe(true);
  expect(cut.profile.constraints).toContainEqual(
    expect.objectContaining({ type: "pointOnCircle", entityId: "cutter" }),
  );
  const solved = accepted(cut.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(solved.drivenValues.reading).toBeCloseTo(15, 7);
  const changed = structuredClone(solved.profile);
  const radius = changed.constraints.find((item) => item.id === "radius");
  if (radius?.type !== "radius") throw new Error("Expected radius dimension");
  radius.value = 7;
  const resized = accepted(changed);
  expect(resized.drivenValues.reading).toBeCloseTo(17, 6);
  expect(resized.redundantConstraintIds).toEqual([]);
  const document = {
    ...createDocument("Recorte asociativo"),
    features: [
      {
        id: "sketch",
        type: "sketch" as const,
        name: "Croquis",
        plane: "XY" as const,
        offset: 0,
        suppressed: false,
        profile: resized.profile,
      },
    ],
  };
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened).toEqual(document);
  const savedSketch = reopened.features[0];
  if (savedSketch.type !== "sketch" || savedSketch.profile.kind !== "entities")
    throw new Error("Expected entity sketch");
  expect(accepted(savedSketch.profile).drivenValues.reading).toBeCloseTo(17, 6);
});

it("retains a split line's driving length across its original outer endpoints when 100 is edited to 120", () => {
  const input = profile(
    [
      p("end", 100, 0),
      p("a0", 30, -10),
      p("a1", 30, 10),
      p("b0", 70, -10),
      p("b1", 70, 10),
    ],
    [
      line("target", "origin", "end"),
      line("a", "a0", "a1"),
      line("b", "b0", "b1"),
    ],
    [
      { id: "horizontal", type: "horizontal", entityId: "target" },
      {
        id: "span",
        type: "length",
        entityId: "target",
        value: 100,
        driven: false,
        referenceRole: "constraint",
      },
      {
        id: "reading",
        type: "length",
        entityId: "target",
        value: 100,
        driven: true,
        referenceRole: "annotation",
      },
      fix("a0", 30, -10),
      fix("a1", 30, 10),
      fix("b0", 70, -10),
      fix("b1", 70, 10),
    ],
  );
  const original = structuredClone(input);
  const cut = trimToClosest(input, "target", { x: 50, y: 0 });
  expect(cut.changed, cut.message).toBe(true);
  expect(cut.convertedConstraintIds).toEqual(["span"]);
  expect(cut.deletedConstraintIds).not.toContain("span");
  expect(cut.profile.constraints.find((item) => item.id === "span")).toEqual({
    id: "span",
    type: "distance",
    a: "origin",
    b: "end",
    value: 100,
    driven: false,
    referenceRole: "constraint",
  });
  expect(input).toEqual(original);
  let solved = accepted(cut.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(solved.drivenValues.reading).toBeCloseTo(30, 6);
  const modified = structuredClone(solved.profile);
  const span = modified.constraints.find((item) => item.id === "span");
  if (span?.type !== "distance")
    throw new Error("Expected outer-endpoint distance");
  span.value = 120;
  solved = accepted(modified);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(point(solved.profile, "end").x).toBeCloseTo(120, 6);
  const first = entity(solved.profile, "target"),
    second = entity(solved.profile, cut.affectedEntityIds[1]);
  if (first.type !== "line" || second.type !== "line")
    throw new Error("Expected retained lines");
  expect(point(solved.profile, first.end).x).toBeCloseTo(30, 6);
  expect(point(solved.profile, second.start).x).toBeCloseTo(70, 6);
  expect(point(solved.profile, second.end).y).toBeCloseTo(0, 6);
  expect(solved.drivenValues.reading).toBeCloseTo(30, 6);
});

it.each(["line", "missing"])(
  "rejects a pointOnCircle reference to %s",
  (badId) => {
    const input = profile(
      [p("end", 5, 0)],
      [line("line", "origin", "end")],
      [
        {
          id: "relation",
          type: "pointOnCircle",
          pointId: "end",
          entityId: badId,
        },
      ],
    );
    expect(() => validateEntityProfile(input)).toThrow();
  },
);

it("validates the pointOnCircle relation strictly and uses an arc's full supporting circle", () => {
  const input = profile(
    [p("start", 5, 0), p("end", 0, 5), p("outside-arc", -5, 0)],
    [
      {
        id: "quarter",
        type: "arc",
        center: "origin",
        start: "start",
        end: "end",
        clockwise: false,
        construction: false,
      },
    ],
    [
      {
        id: "relation",
        type: "pointOnCircle",
        pointId: "outside-arc",
        entityId: "quarter",
      },
    ],
  );
  expect(validateEntityProfile(input)).toEqual(input);
  expect(accepted(input).iterations).toBe(0);
  const withExtra = structuredClone(input);
  Object.assign(withExtra.constraints[0], { driven: true });
  expect(() => validateEntityProfile(withExtra)).toThrow(/desconocido/);
  const dangling = structuredClone(input);
  Object.assign(dangling.constraints[0], { pointId: "missing" });
  expect(() => validateEntityProfile(dangling)).toThrow(/existente/);
});

it("deletes an isolated circle and all its relations without erasing unrelated standalone points", () => {
  const input = profile(
    [p("standalone", 10, 0)],
    [
      {
        id: "target",
        type: "circle",
        center: "origin",
        radius: 10,
        construction: false,
      },
    ],
    [
      { id: "radius", type: "radius", entityId: "target", value: 10 },
      {
        id: "reading",
        type: "radius",
        entityId: "target",
        value: 8,
        driven: true,
      },
      {
        id: "on-circle",
        type: "pointOnCircle",
        entityId: "target",
        pointId: "standalone",
      },
    ],
  );
  const preview = previewTrimToClosest(input, "target", { x: 10, y: 0 });
  expect(preview.segment).toEqual({
    type: "circle",
    center: [0, 0],
    radius: 10,
  });
  const cut = trimToClosest(input, "target", { x: 10, y: 0 });
  expect(cut.changed).toBe(true);
  expect(cut.deletedEntityIds).toEqual(["target"]);
  expect(cut.affectedEntityIds).toEqual(["target"]);
  expect(cut.deletedConstraintIds).toEqual(["radius", "reading", "on-circle"]);
  expect(cut.profile).toEqual(profile([p("standalone", 10, 0)], []));
});

it("previews circular wraparound without generating IDs or mutating the profile", () => {
  const input = profile(
    [p("bottom", 0, -20), p("top", 0, 20)],
    [
      {
        id: "target",
        type: "circle",
        center: "origin",
        radius: 10,
        construction: false,
      },
      line("cutter", "bottom", "top"),
    ],
  );
  const original = structuredClone(input);
  const random = vi.spyOn(crypto, "randomUUID");
  try {
    const preview = previewTrimToClosest(input, "target", { x: 10, y: 0 });
    expect(preview.changed, preview.message).toBe(true);
    expect(preview.segment).toMatchObject({
      type: "arc",
      clockwise: false,
      radius: 10,
    });
    if (preview.segment?.type !== "arc")
      throw new Error("Expected preview arc");
    expect(preview.segment.start[0]).toBeCloseTo(0, 7);
    expect(preview.segment.start[1]).toBeCloseTo(-10, 7);
    expect(preview.segment.end[1]).toBeCloseTo(10, 7);
    expect(random).not.toHaveBeenCalled();
    expect(input).toEqual(original);
  } finally {
    random.mockRestore();
  }
});

it("rolls back a trim that would exceed the persisted point budget", () => {
  const input = profile(
    [
      p("left", -20, 0),
      p("right", 20, 0),
      ...Array.from({ length: 126 }, (_, index) =>
        p(`unused-${index}`, index, 100),
      ),
    ],
    [
      {
        id: "target",
        type: "circle",
        center: "origin",
        radius: 10,
        construction: false,
      },
      line("cutter", "left", "right"),
    ],
  );
  const original = structuredClone(input);
  const cut = trimToClosest(input, "target", { x: 0, y: 10 });
  expect(cut.changed).toBe(false);
  expect(cut.message).toMatch(/128/);
  expect(cut.profile).toBe(input);
  expect(cut.createdConstraintIds).toEqual([]);
  expect(cut.deletedConstraintIds).toEqual([]);
  expect(input).toEqual(original);
});

it("deduplicates a tangent contact at large translated coordinates", () => {
  const input = profile(
    [p("left", 998000, 0), p("right", 1000000, 0), p("center", 999980, 10)],
    [
      line("target", "left", "right"),
      {
        id: "cutter",
        type: "circle",
        center: "center",
        radius: 10,
        construction: true,
      },
    ],
  );
  const preview = previewTrimToClosest(input, "target", { x: 999000, y: 0 });
  expect(preview.changed, preview.message).toBe(true);
  expect(preview.intersections).toHaveLength(1);
  expect(preview.intersections[0]).toEqual({ x: 999980, y: 0 });
  const cut = trimToClosest(input, "target", { x: 999000, y: 0 });
  const trimmed = entity(cut.profile, "target");
  if (trimmed.type !== "line") throw new Error("Expected line");
  expect(point(cut.profile, trimmed.start)).toMatchObject({ x: 999980, y: 0 });
  expect(entity(cut.profile, "cutter")).toEqual(entity(input, "cutter"));
});
