import { expect, it, vi } from "vitest";
import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";
import { solveSketch, SKETCH_SOLVER_TOLERANCE } from "./solver";
import {
  createDocument,
  parseDocument,
  serializeDocument,
} from "../model/document";
import { createExtendSketchDocument } from "../examples/sketch-extend";
import { extendToClosest, previewExtendToClosest } from "./extend";

const p = (id: string, x: number, y: number) => ({ id, x, y });
const polar = (id: string, radius: number, degrees: number) =>
  p(
    id,
    radius * Math.cos((degrees * Math.PI) / 180),
    radius * Math.sin((degrees * Math.PI) / 180),
  );
const line = (
  id: string,
  start: string,
  end: string,
  construction = false,
): SketchEntity => ({ id, type: "line", start, end, construction });
const profile = (
  points: EntityProfile["points"],
  entities: SketchEntity[],
  constraints: SketchConstraint[] = [],
): EntityProfile => ({ kind: "entities", points, entities, constraints });
const fix = (pointId: string, x: number, y: number): SketchConstraint => ({
  id: `fix-${pointId}`,
  type: "fix",
  pointId,
  x,
  y,
});
const point = (input: EntityProfile, id: string) =>
  id === "origin"
    ? p("origin", 0, 0)
    : input.points.find((item) => item.id === id)!;
const get = (input: EntityProfile, id: string) =>
  input.entities.find((entity) => entity.id === id)!;
const accepted = (input: EntityProfile) => {
  const result = solveSketch(input);
  expect(["fullyDefined", "underdefined"], result.message).toContain(
    result.status,
  );
  expect(result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
  return result;
};

it("keeps a line endpoint attached to a circle whose radius is edited", () => {
  const input = profile(
    [p("end", 5, 0), p("center", 15, 0)],
    [
      line("target", "origin", "end"),
      {
        id: "boundary",
        type: "circle",
        center: "center",
        radius: 5,
        construction: true,
      },
    ],
    [
      { id: "horizontal", type: "horizontal", entityId: "target" },
      {
        id: "reading",
        type: "length",
        entityId: "target",
        value: 123,
        driven: true,
        referenceRole: "annotation",
      },
      fix("center", 15, 0),
      { id: "radius", type: "radius", entityId: "boundary", value: 5 },
    ],
  );
  const original = structuredClone(input);
  const extended = extendToClosest(input, "target", { x: 4, y: 0 });
  expect(extended.changed, extended.message).toBe(true);
  expect(extended.profile.constraints).toContainEqual(
    expect.objectContaining({ type: "pointOnCircle", entityId: "boundary" }),
  );
  expect(input).toEqual(original);
  let solved = accepted(extended.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(solved.drivenValues.reading).toBeCloseTo(10, 7);
  const modified = structuredClone(solved.profile);
  const radius = modified.constraints.find(
    (constraint) => constraint.id === "radius",
  );
  if (radius?.type !== "radius") throw new Error("Expected radius");
  radius.value = 7;
  solved = accepted(modified);
  expect(solved.drivenValues.reading).toBeCloseTo(8, 6);
  expect(
    solved.profile.constraints.find(
      (constraint) => constraint.id === "reading",
    ),
  ).toMatchObject({ value: 123, driven: true });
});

it("preserves an arc's supporting circle and associative endpoint after another circle's radius changes", () => {
  const input = profile(
    [p("start", 10, 0), p("end", 0, 10), p("boundary-center", -10, 0)],
    [
      {
        id: "target",
        type: "arc",
        center: "origin",
        start: "start",
        end: "end",
        clockwise: false,
        construction: false,
      },
      {
        id: "boundary",
        type: "circle",
        center: "boundary-center",
        radius: 10,
        construction: true,
      },
    ],
    [
      { id: "radius", type: "radius", entityId: "target", value: 10 },
      { id: "start-y", type: "distanceY", a: "origin", b: "start", value: 0 },
      fix("boundary-center", -10, 0),
      {
        id: "boundary-radius",
        type: "radius",
        entityId: "boundary",
        value: 10,
      },
    ],
  );
  const extended = extendToClosest(input, "target", { x: 1, y: 9 });
  expect(extended.changed, extended.message).toBe(true);
  let solved = accepted(extended.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  const arc = get(solved.profile, "target");
  if (arc.type !== "arc") throw new Error("Expected arc");
  expect(point(solved.profile, arc.end).x).toBeCloseTo(-5, 7);
  expect(point(solved.profile, arc.end).y).toBeCloseTo(5 * Math.sqrt(3), 7);
  const modified = structuredClone(solved.profile);
  const radius = modified.constraints.find(
    (constraint) => constraint.id === "boundary-radius",
  );
  if (radius?.type !== "radius") throw new Error("Expected cutter radius");
  radius.value = 12;
  solved = accepted(modified);
  const changedArc = get(solved.profile, "target");
  if (changedArc.type !== "arc") throw new Error("Expected arc");
  expect(point(solved.profile, changedArc.end).x).toBeCloseTo(-2.8, 6);
  expect(point(solved.profile, changedArc.end).y).toBeCloseTo(9.6, 6);
  expect(changedArc.clockwise).toBe(false);
  expect(solved.degreesOfFreedom).toBe(0);
});

it.each([
  {
    clockwise: false,
    start: 30,
    end: 110,
    pick: 40,
    boundary: -20,
    endpoint: "start",
    previewClockwise: true,
  },
  {
    clockwise: false,
    start: 30,
    end: 110,
    pick: 100,
    boundary: 160,
    endpoint: "end",
    previewClockwise: false,
  },
  {
    clockwise: true,
    start: 110,
    end: 30,
    pick: 100,
    boundary: 160,
    endpoint: "start",
    previewClockwise: false,
  },
  {
    clockwise: true,
    start: 110,
    end: 30,
    pick: 40,
    boundary: -20,
    endpoint: "end",
    previewClockwise: true,
  },
] as const)(
  "extends $endpoint across the angular seam, clockwise=$clockwise",
  (test) => {
    const input = profile(
      [
        polar("start", 10, test.start),
        polar("end", 10, test.end),
        polar("boundary-start", 5, test.boundary),
        polar("boundary-end", 15, test.boundary),
      ],
      [
        {
          id: "target",
          type: "arc",
          center: "origin",
          start: "start",
          end: "end",
          clockwise: test.clockwise,
          construction: false,
        },
        line("boundary", "boundary-start", "boundary-end"),
      ],
    );
    const pick = polar("pick", 10, test.pick);
    const preview = previewExtendToClosest(input, "target", pick);
    expect(preview.changed, preview.message).toBe(true);
    expect(preview.endpoint).toBe(test.endpoint);
    expect(preview.segment).toMatchObject({
      type: "arc",
      clockwise: test.previewClockwise,
      radius: 10,
    });
    if (preview.segment?.type !== "arc")
      throw new Error("Expected arc preview");
    expect(preview.segment.start[0]).toBeCloseTo(
      point(input, test.endpoint).x,
      7,
    );
    expect(preview.segment.start[1]).toBeCloseTo(
      point(input, test.endpoint).y,
      7,
    );
    const expected = polar("expected", 10, test.boundary);
    expect(preview.segment.end[0]).toBeCloseTo(expected.x, 7);
    expect(preview.segment.end[1]).toBeCloseTo(expected.y, 7);
    const extended = extendToClosest(input, "target", pick);
    expect(extended.changed, extended.message).toBe(true);
    const arc = get(extended.profile, "target");
    if (arc.type !== "arc") throw new Error("Expected arc");
    expect(arc.clockwise).toBe(test.clockwise);
    expect(point(extended.profile, arc[test.endpoint]).x).toBeCloseTo(
      expected.x,
      7,
    );
    expect(point(extended.profile, arc[test.endpoint]).y).toBeCloseTo(
      expected.y,
      7,
    );
  },
);

it("keeps a shared endpoint and its fixed neighbor untouched while changing only the target reference", () => {
  const input = profile(
    [
      p("shared", 5, 0),
      p("neighbor-end", 5, 5),
      p("lower", 10, -5),
      p("upper", 10, 5),
    ],
    [
      line("target", "origin", "shared"),
      line("neighbor", "shared", "neighbor-end"),
      line("boundary", "lower", "upper"),
    ],
    [fix("shared", 5, 0)],
  );
  const original = structuredClone(input);
  const extended = extendToClosest(input, "target", { x: 4, y: 0 });
  expect(extended.changed, extended.message).toBe(true);
  expect(get(extended.profile, "neighbor")).toEqual(get(input, "neighbor"));
  expect(point(extended.profile, "shared")).toEqual(point(input, "shared"));
  expect(extended.profile.constraints).toContainEqual(fix("shared", 5, 0));
  expect(input).toEqual(original);
  const target = get(extended.profile, "target");
  if (target.type !== "line") throw new Error("Expected line");
  expect(target.end).not.toBe("shared");
  expect(point(extended.profile, target.end)).toMatchObject({ x: 10, y: 0 });
});

it("uses only a finite boundary arc, skipping its nearer supporting-circle intersection", () => {
  const input = profile(
    [
      p("end", 2, 0),
      p("center", 10, 0),
      p("arc-start", 13, 0),
      p("arc-end", 10, 3),
    ],
    [
      line("target", "origin", "end"),
      {
        id: "boundary",
        type: "arc",
        center: "center",
        start: "arc-start",
        end: "arc-end",
        clockwise: false,
        construction: true,
      },
    ],
  );
  const preview = previewExtendToClosest(input, "target", { x: 1.8, y: 0 });
  expect(preview.changed, preview.message).toBe(true);
  expect(preview.intersections).toEqual([{ x: 13, y: 0 }]);
  const extended = extendToClosest(input, "target", { x: 1.8, y: 0 });
  const target = get(extended.profile, "target");
  if (target.type !== "line") throw new Error("Expected line");
  expect(target.end).toBe("arc-start");
  expect(extended.createdConstraintIds).toEqual([]);
});

it("keeps previews pure and uses displayed coordinates instead of solving stale dimension parameters", () => {
  const input = profile(
    [p("end", 5, 0), p("lower", 10, -5), p("upper", 10, 5)],
    [line("target", "origin", "end"), line("boundary", "lower", "upper")],
    [{ id: "stale", type: "length", entityId: "target", value: 20 }],
  );
  const original = structuredClone(input);
  const random = vi.spyOn(crypto, "randomUUID");
  try {
    const preview = previewExtendToClosest(input, "target", { x: 4, y: 0 });
    expect(preview.segment).toEqual({
      type: "line",
      start: [5, 0],
      end: [10, 0],
    });
    expect(random).not.toHaveBeenCalled();
    expect(input).toEqual(original);
  } finally {
    random.mockRestore();
  }
});

it("closes the public R20 example with shared endpoints and persists the resulting geometry", () => {
  const document = createExtendSketchDocument();
  const sketch = document.features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
    throw new Error("Expected entity sketch");
  let input = accepted(sketch.profile).profile;
  for (const x of [-8, 8]) {
    const extended = extendToClosest(input, "extend-line", { x, y: 0 });
    expect(extended.changed, extended.message).toBe(true);
    input = accepted(extended.profile).profile;
  }
  const arc = get(input, "extend-arc"),
    diameter = get(input, "extend-line");
  if (arc.type !== "arc" || diameter.type !== "line")
    throw new Error("Expected closed D profile");
  expect(diameter.start).toBe(arc.start);
  expect(diameter.end).toBe(arc.end);
  expect(point(input, diameter.start)).toMatchObject({
    x: expect.closeTo(-20, 6),
    y: expect.closeTo(0, 6),
  });
  expect(point(input, diameter.end)).toMatchObject({
    x: expect.closeTo(20, 6),
    y: expect.closeTo(0, 6),
  });
  const saved = {
    ...createDocument("Extensión cerrada"),
    features: [{ ...sketch, profile: input }],
  };
  expect(parseDocument(serializeDocument(saved))).toEqual(saved);
});

it("rolls back when a shared endpoint would require exceeding the point budget", () => {
  const input = profile(
    [
      p("shared", 5, 0),
      p("neighbor-end", 5, 5),
      p("lower", 10, -5),
      p("upper", 10, 5),
      ...Array.from({ length: 124 }, (_, index) =>
        p(`unused-${index}`, index, 100),
      ),
    ],
    [
      line("target", "origin", "shared"),
      line("neighbor", "shared", "neighbor-end"),
      line("boundary", "lower", "upper"),
    ],
  );
  const original = structuredClone(input);
  const extended = extendToClosest(input, "target", { x: 4, y: 0 });
  expect(extended.changed).toBe(false);
  expect(extended.message).toMatch(/128/);
  expect(extended.profile).toBe(input);
  expect(extended.createdConstraintIds).toEqual([]);
  expect(input).toEqual(original);
});

it("rejects full circles as targets without deleting or generating anything", () => {
  const input = profile(
    [],
    [
      {
        id: "target",
        type: "circle",
        center: "origin",
        radius: 10,
        construction: false,
      },
    ],
  );
  const random = vi.spyOn(crypto, "randomUUID");
  try {
    expect(
      previewExtendToClosest(input, "target", { x: 10, y: 0 }).changed,
    ).toBe(false);
    const extended = extendToClosest(input, "target", { x: 10, y: 0 });
    expect(extended.changed).toBe(false);
    expect(extended.profile).toBe(input);
    expect(extended.deletedEntityIds).toEqual([]);
    expect(random).not.toHaveBeenCalled();
  } finally {
    random.mockRestore();
  }
});

it.each([
  [10, 40],
  [40, 60],
  [20, 40],
])("shares the first usable collinear boundary endpoint for %s→%s", (a, b) => {
  const input = profile(
    [p("end", 20, 0), p("boundary-start", a, 0), p("boundary-end", b, 0)],
    [
      line("target", "origin", "end"),
      line("boundary", "boundary-start", "boundary-end"),
    ],
  );
  const original = structuredClone(input);
  const extended = extendToClosest(input, "target", { x: 18, y: 0 });
  expect(extended.changed, extended.message).toBe(true);
  const target = get(extended.profile, "target");
  if (target.type !== "line") throw new Error("Expected line");
  expect(target.end).toBe(a === 40 ? "boundary-start" : "boundary-end");
  expect(point(extended.profile, target.end)).toMatchObject({ x: 40, y: 0 });
  expect(extended.createdConstraintIds).toEqual([]);
  expect(get(extended.profile, "boundary")).toEqual(get(input, "boundary"));
  expect(input).toEqual(original);
});

it.each([
  [45, 135, "boundary-end"],
  [180, 270, "boundary-start"],
  [90, 180, "boundary-end"],
] as const)(
  "shares the first usable co-circular endpoint for %s°→%s°",
  (a, b, expectedId) => {
    const input = profile(
      [
        polar("start", 10, 0),
        polar("end", 10, 90),
        polar("boundary-start", 10, a),
        polar("boundary-end", 10, b),
      ],
      [
        {
          id: "target",
          type: "arc",
          center: "origin",
          start: "start",
          end: "end",
          clockwise: false,
          construction: false,
        },
        {
          id: "boundary",
          type: "arc",
          center: "origin",
          start: "boundary-start",
          end: "boundary-end",
          clockwise: false,
          construction: false,
        },
      ],
    );
    const extended = extendToClosest(input, "target", polar("pick", 10, 80));
    expect(extended.changed, extended.message).toBe(true);
    const target = get(extended.profile, "target");
    if (target.type !== "arc") throw new Error("Expected arc");
    expect(target.end).toBe(expectedId);
    expect(extended.createdConstraintIds).toEqual([]);
    expect(get(extended.profile, "boundary")).toEqual(get(input, "boundary"));
  },
);

it("chooses the end at a line's exact midpoint when both directions have boundaries", () => {
  const input = profile(
    [
      p("end", 20, 0),
      p("left-low", -20, -5),
      p("left-high", -20, 5),
      p("right-low", 40, -5),
      p("right-high", 40, 5),
    ],
    [
      line("target", "origin", "end"),
      line("left", "left-low", "left-high"),
      line("right", "right-low", "right-high"),
    ],
  );
  expect(
    previewExtendToClosest(input, "target", { x: 10, y: 0 }),
  ).toMatchObject({
    changed: true,
    endpoint: "end",
    segment: { start: [20, 0], end: [40, 0] },
  });
});

it("removes the obsolete driving length and orphan fix while retaining a fresh driven measurement", () => {
  const input = profile(
    [p("end", 100, 0), p("lower", 140, -5), p("upper", 140, 5)],
    [line("target", "origin", "end"), line("boundary", "lower", "upper")],
    [
      { id: "horizontal", type: "horizontal", entityId: "target" },
      { id: "length", type: "length", entityId: "target", value: 100 },
      {
        id: "note",
        type: "length",
        entityId: "target",
        value: 999,
        driven: true,
      },
      fix("end", 100, 0),
      fix("lower", 140, -5),
      fix("upper", 140, 5),
    ],
  );
  const extended = extendToClosest(input, "target", { x: 90, y: 0 });
  expect(extended.changed, extended.message).toBe(true);
  expect(extended.deletedConstraintIds).toEqual(["length", "fix-end"]);
  expect(extended.profile.points.some((item) => item.id === "end")).toBe(false);
  expect(extended.profile.constraints).toContainEqual(input.constraints[0]);
  const solved = accepted(extended.profile);
  expect(solved.degreesOfFreedom).toBe(0);
  expect(solved.redundantConstraintIds).toEqual([]);
  expect(solved.drivenValues.note).toBeCloseTo(140, 7);
  expect(solved.profile.constraints).toContainEqual(input.constraints[2]);
});
