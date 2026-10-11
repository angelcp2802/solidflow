import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import {
  getOC,
  importSTEP,
  measureShapeVolumeProperties,
  setOC,
} from "replicad";
import { CadEngine } from "../cad/kernel.engine";
import { createTrimSketchDocument } from "../examples/sketch-trim";
import {
  addFeature,
  DocumentHistory,
  parseDocument,
  serializeDocument,
  updateFeature,
} from "../model/document";
import { solveSketch } from "./solver";
import { previewTrimToClosest, trimToClosest } from "./trim";
import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";

const point = (id: string, x: number, y: number) => ({ id, x, y });
const line = (
  id: string,
  start: string,
  end: string,
  construction = false,
): SketchEntity => ({ id, type: "line", start, end, construction });

function fixture(
  points: EntityProfile["points"],
  entities: SketchEntity[],
  constraints: SketchConstraint[] = [],
): EntityProfile {
  return { kind: "entities", points, entities, constraints };
}

function xy(profile: EntityProfile, id: string): [number, number] {
  if (id === "origin") return [0, 0];
  const p = profile.points.find((item) => item.id === id);
  if (!p) throw new Error(`Missing point ${id}`);
  return [p.x, p.y];
}

function expectXY(actual: [number, number], expected: [number, number]) {
  expect(actual[0]).toBeCloseTo(expected[0], 7);
  expect(actual[1]).toBeCloseTo(expected[1], 7);
}

function horizontalSpans(profile: EntityProfile) {
  return profile.entities
    .filter((entity) => entity.type === "line")
    .map((entity) => [xy(profile, entity.start), xy(profile, entity.end)])
    .filter(([a, b]) => Math.abs(a[1]) < 1e-8 && Math.abs(b[1]) < 1e-8)
    .map(([a, b]) =>
      [a[0], b[0]].sort((x, y) => x - y).map((x) => Number(x.toFixed(8)) || 0),
    )
    .sort((a, b) => a[0] - b[0]);
}

function onlyArc(profile: EntityProfile) {
  const arcs = profile.entities.filter((entity) => entity.type === "arc");
  expect(arcs).toHaveLength(1);
  return arcs[0];
}

// Evaluate the retained arc's midpoint for an independent geometric oracle.
// No production intersections, trim intervals or picking helpers are reused.
function arcMeasure(profile: EntityProfile, arc: ReturnType<typeof onlyArc>) {
  const center = xy(profile, arc.center),
    start = xy(profile, arc.start),
    end = xy(profile, arc.end);
  const a = Math.atan2(start[1] - center[1], start[0] - center[0]),
    b = Math.atan2(end[1] - center[1], end[0] - center[0]);
  const sweep = ((arc.clockwise ? a - b : b - a) + 2 * Math.PI) % (2 * Math.PI);
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const middleAngle = a + ((arc.clockwise ? -1 : 1) * sweep) / 2;
  return {
    radius,
    sweep,
    length: radius * sweep,
    midpoint: [
      center[0] + radius * Math.cos(middleAngle),
      center[1] + radius * Math.sin(middleAngle),
    ] as [number, number],
  };
}

function oneLineCut(construction = false) {
  return fixture(
    [
      point("a", -10, 0),
      point("b", 10, 0),
      point("c", 3, -5),
      point("d", 3, 5),
    ],
    [line("target", "a", "b", construction), line("cutter", "c", "d", true)],
  );
}

function circleAndDiameter(radius = 5, extent = radius) {
  return fixture(
    [
      point("center", 0, 0),
      point("left", -extent, 0),
      point("right", extent, 0),
    ],
    [
      {
        id: "target",
        type: "circle",
        center: "center",
        radius,
        construction: false,
      },
      line("diameter", "left", "right"),
    ],
  );
}

describe("independent analytical trim review", () => {
  it.each([
    { pickX: -5, remaining: [3, 10], length: 7 },
    { pickX: 8, remaining: [-10, 3], length: 13 },
  ])(
    "one intersection removes the picked side at x=$pickX",
    ({ pickX, remaining, length }) => {
      const profile = oneLineCut(),
        source = structuredClone(profile);
      const result = trimToClosest(profile, "target", { x: pickX, y: 0 });
      expect(result.changed, result.message).toBe(true);
      expect(profile).toEqual(source);
      expect(horizontalSpans(result.profile)).toEqual([remaining]);
      expect(remaining[1] - remaining[0]).toBe(length);
      expect(result.profile.entities.find((e) => e.id === "cutter")).toEqual(
        source.entities[1],
      );
      expectXY(xy(result.profile, "c"), [3, -5]);
      expectXY(xy(result.profile, "d"), [3, 5]);
    },
  );

  it("uses the two analytic line/circle roots to remove only the central interval", () => {
    const profile = fixture(
      [point("a", -10, 0), point("b", 10, 0), point("center", 0, 0)],
      [
        line("target", "a", "b"),
        {
          id: "cutter",
          type: "circle",
          center: "center",
          radius: 5,
          construction: true,
        },
      ],
    );
    const result = trimToClosest(profile, "target", { x: 0, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(horizontalSpans(result.profile)).toEqual([
      [-10, -5],
      [5, 10],
    ]);
    expect(result.profile.entities.find((e) => e.id === "target")?.type).toBe(
      "line",
    );
    expect(
      result.profile.entities
        .filter((e) => e.type === "line")
        .every((e) => !e.construction),
    ).toBe(true);
  });

  it("retains construction on both surviving pieces of a construction target", () => {
    const profile = fixture(
      [point("a", -10, 0), point("b", 10, 0), point("center", 0, 0)],
      [
        line("target", "a", "b", true),
        {
          id: "cutter",
          type: "circle",
          center: "center",
          radius: 5,
          construction: false,
        },
      ],
    );
    const result = trimToClosest(profile, "target", { x: 0, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(horizontalSpans(result.profile)).toEqual([
      [-10, -5],
      [5, 10],
    ]);
    expect(
      result.profile.entities
        .filter((e) => e.type === "line")
        .every((e) => e.construction),
    ).toBe(true);
  });

  it.each([1, -1])(
    "circle converts to the opposite semicircle when picked at y=%sR",
    (sign) => {
      const profile = circleAndDiameter(),
        source = structuredClone(profile);
      const result = trimToClosest(profile, "target", { x: 0, y: sign * 5 });
      expect(result.changed, result.message).toBe(true);
      expect(profile).toEqual(source);
      const arc = onlyArc(result.profile),
        geometry = arcMeasure(result.profile, arc);
      expect(arc.id).toBe("target");
      expect(arc.center).toBe("center");
      expect(new Set([arc.start, arc.end])).toEqual(new Set(["left", "right"]));
      expect(geometry.radius).toBeCloseTo(5, 8);
      expect(geometry.length).toBeCloseTo(5 * Math.PI, 8);
      expectXY(geometry.midpoint, [0, -sign * 5]);
    },
  );

  it("finds both circle/circle roots (3, ±4) and keeps the major complementary arc", () => {
    const profile = fixture(
      [point("o", 0, 0), point("c", 6, 0)],
      [
        {
          id: "target",
          type: "circle",
          center: "o",
          radius: 5,
          construction: false,
        },
        {
          id: "cutter",
          type: "circle",
          center: "c",
          radius: 5,
          construction: true,
        },
      ],
    );
    const result = trimToClosest(profile, "target", { x: 5, y: 0 });
    expect(result.changed, result.message).toBe(true);
    const arc = onlyArc(result.profile),
      geometry = arcMeasure(result.profile, arc);
    const ends = [
      xy(result.profile, arc.start),
      xy(result.profile, arc.end),
    ].sort((a, b) => a[1] - b[1]);
    expectXY(ends[0], [3, -4]);
    expectXY(ends[1], [3, 4]);
    expect(geometry.length).toBeCloseTo(10 * (Math.PI - Math.acos(3 / 5)), 7);
    expectXY(geometry.midpoint, [-5, 0]);
  });

  it.each([false, true])(
    "preserves the retained upper quarter-circle orientation, clockwise=%s",
    (clockwise) => {
      const profile = fixture(
        [
          point("o", 0, 0),
          point("r", 5, 0),
          point("l", -5, 0),
          point("a", 0, -6),
          point("b", 0, 6),
        ],
        [
          {
            id: "target",
            type: "arc",
            center: "o",
            start: clockwise ? "l" : "r",
            end: clockwise ? "r" : "l",
            clockwise,
            construction: false,
          },
          line("cutter", "a", "b", true),
        ],
      );
      const result = trimToClosest(profile, "target", { x: -3, y: 4 });
      expect(result.changed, result.message).toBe(true);
      const arc = onlyArc(result.profile),
        geometry = arcMeasure(result.profile, arc);
      expect(arc.clockwise).toBe(clockwise);
      expect(geometry.length).toBeCloseTo((5 * Math.PI) / 2, 7);
      expectXY(geometry.midpoint, [5 / Math.sqrt(2), 5 / Math.sqrt(2)]);
    },
  );

  it("uses only the upper common root of two upper semicircular arcs", () => {
    const profile = fixture(
      [
        point("o", 0, 0),
        point("r", 5, 0),
        point("l", -5, 0),
        point("c", 6, 0),
        point("cr", 11, 0),
        point("cl", 1, 0),
      ],
      [
        {
          id: "target",
          type: "arc",
          center: "o",
          start: "r",
          end: "l",
          clockwise: false,
          construction: false,
        },
        {
          id: "cutter",
          type: "arc",
          center: "c",
          start: "cr",
          end: "cl",
          clockwise: false,
          construction: true,
        },
      ],
    );
    const result = trimToClosest(profile, "target", { x: -3, y: 4 });
    expect(result.changed, result.message).toBe(true);
    const arc = result.profile.entities.find((e) => e.id === "target");
    if (arc?.type !== "arc") throw new Error("Retained arc expected");
    expectXY(xy(result.profile, arc.start), [5, 0]);
    expectXY(xy(result.profile, arc.end), [3, 4]);
    expect(arcMeasure(result.profile, arc).length).toBeCloseTo(
      5 * Math.acos(3 / 5),
      7,
    );
  });

  it("deletes the whole unbounded interval instead of inventing a crossing on a line extension", () => {
    const profile = oneLineCut();
    profile.points.find((p) => p.id === "c")!.y = 1;
    const source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: 0, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(
      result.profile.entities.find((e) => e.id === "target"),
    ).toBeUndefined();
    expect(result.profile.entities.find((e) => e.id === "cutter")).toEqual(
      source.entities[1],
    );
    expect(profile).toEqual(source);
  });

  it("does not cut a line at the missing half of a circular arc boundary", () => {
    const profile = fixture(
      [
        point("a", -10, -3),
        point("b", 10, -3),
        point("o", 0, 0),
        point("r", 5, 0),
        point("l", -5, 0),
      ],
      [
        line("target", "a", "b"),
        {
          id: "cutter",
          type: "arc",
          center: "o",
          start: "r",
          end: "l",
          clockwise: false,
          construction: true,
        },
      ],
    );
    const result = trimToClosest(profile, "target", { x: 0, y: -3 });
    expect(result.changed, result.message).toBe(true);
    expect(
      result.profile.entities.find((e) => e.id === "target"),
    ).toBeUndefined();
    expect(result.profile.entities.find((e) => e.id === "cutter")).toEqual(
      profile.entities[1],
    );
  });

  it("defines pointOnCircle on the complete support of an arc, without a finite-arc range", () => {
    const profile = fixture(
      [point("r", 5, 0), point("l", -5, 0), point("q", 0, -5)],
      [
        {
          id: "arc",
          type: "arc",
          center: "origin",
          start: "r",
          end: "l",
          clockwise: false,
          construction: false,
        },
      ],
      [
        { id: "r-fixed", type: "fix", pointId: "r", x: 5, y: 0 },
        { id: "l-fixed", type: "fix", pointId: "l", x: -5, y: 0 },
        { id: "q-fixed", type: "fix", pointId: "q", x: 0, y: -5 },
        {
          id: "incidence",
          type: "pointOnCircle",
          pointId: "q",
          entityId: "arc",
        },
      ],
    );
    const solution = solveSketch(profile);
    expect(solution.status, solution.message).toBe("fullyDefined");
    expectXY(xy(solution.profile, "q"), [0, -5]);
    expect(onlyArc(solution.profile).clockwise).toBe(false);
  });

  it("deduplicates a tangent root and removes the circle instead of creating a degenerate arc", () => {
    const profile = circleAndDiameter();
    profile.points.find((p) => p.id === "left")!.y = 5;
    profile.points.find((p) => p.id === "right")!.y = 5;
    const source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: 0, y: -5 });
    expect(result.changed, result.message).toBe(true);
    expect(
      result.profile.entities.find((e) => e.id === "target"),
    ).toBeUndefined();
    expect(result.profile.entities.find((e) => e.id === "diameter")).toEqual(
      source.entities[1],
    );
    expect(profile).toEqual(source);
  });

  it("rejects an overlapping boundary atomically instead of choosing an arbitrary cut", () => {
    const profile = fixture(
      [
        point("a", -10, 0),
        point("b", 10, 0),
        point("c", -3, 0),
        point("d", 4, 0),
      ],
      [line("target", "a", "b"), line("cutter", "c", "d", true)],
    );
    const source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: 0, y: 0 });
    expect(result.changed).toBe(false);
    expect(result.message).toBeTruthy();
    expect(profile).toEqual(source);
    expect(result.profile).toEqual(source);
  });

  it("preview is repeatable, leaves its input intact and matches the committed interval", () => {
    const profile = oneLineCut(),
      source = structuredClone(profile);
    const preview = previewTrimToClosest(profile, "target", { x: -5, y: 0 });
    expect(preview).toEqual(
      previewTrimToClosest(profile, "target", { x: -5, y: 0 }),
    );
    expect(profile).toEqual(source);
    expect(preview.changed, preview.message).toBe(true);
    if (preview.segment?.type !== "line")
      throw new Error("Line preview expected");
    expectXY(preview.segment.start, [-10, 0]);
    expectXY(preview.segment.end, [3, 0]);
    const result = trimToClosest(profile, "target", { x: -5, y: 0 });
    expect(horizontalSpans(result.profile)).toEqual([[3, 10]]);
    expect(profile).toEqual(source);
  });

  it("uses the supplied displayed geometry without a hidden solve of stale targets", () => {
    const profile = oneLineCut();
    profile.constraints.push(
      { id: "fixed-a", type: "fix", pointId: "a", x: -10, y: 0 },
      { id: "stale-target", type: "length", entityId: "target", value: 15 },
    );
    const source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: -5, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(horizontalSpans(result.profile)).toEqual([[3, 10]]);
    expectXY(xy(result.profile, "b"), [10, 0]);
    expect(result.deletedConstraintIds).toContain("stale-target");
    expect(profile).toEqual(source);
  });

  it("rejects an exact boundary pick without selecting either adjacent interval", () => {
    const profile = oneLineCut(),
      source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: 3, y: 0 });
    expect(result.changed).toBe(false);
    expect(result.message).toBeTruthy();
    expect(profile).toEqual(source);
    expect(result.profile).toEqual(source);
  });

  it("drops obsolete driving length/equality while preserving a fresh driven observation and shared neighbor", () => {
    const profile = oneLineCut();
    profile.points.push(
      point("n", -10, 5),
      point("ra", -10, 10),
      point("rb", 10, 10),
    );
    profile.entities.push(
      line("neighbor", "a", "n"),
      line("reference", "ra", "rb", true),
    );
    profile.constraints.push(
      { id: "h", type: "horizontal", entityId: "target" },
      { id: "length", type: "length", entityId: "target", value: 20 },
      { id: "equal", type: "equal", a: "target", b: "reference" },
      {
        id: "observed",
        type: "length",
        entityId: "target",
        value: 999,
        driven: true,
        referenceRole: "annotation",
      },
      { id: "fixed-shared", type: "fix", pointId: "a", x: -10, y: 0 },
    );
    const source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: -5, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(result.deletedConstraintIds).toEqual(
      expect.arrayContaining(["length", "equal"]),
    );
    for (const id of ["length", "equal"])
      expect(result.profile.constraints.map((c) => c.id)).not.toContain(id);
    expect(result.profile.constraints).toEqual(
      expect.arrayContaining(
        source.constraints.filter((c) =>
          ["h", "observed", "fixed-shared"].includes(c.id),
        ),
      ),
    );
    expectXY(xy(result.profile, "a"), [-10, 0]);
    expect(result.profile.entities.find((e) => e.id === "neighbor")).toEqual(
      source.entities.find((e) => e.id === "neighbor"),
    );
    const solution = solveSketch(result.profile);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expect(solution.drivenValues.observed).toBeCloseTo(7, 7);
    expect(horizontalSpans(solution.profile)).toContainEqual([3, 10]);
    expect(profile).toEqual(source);
  });

  it("preserves a driving span across a split and measures only the original-ID fragment", () => {
    const profile = fixture(
      [
        point("a", 0, 0),
        point("b", 100, 0),
        point("c", 40, -20),
        point("d", 40, 20),
        point("e", 70, -20),
        point("f", 70, 20),
      ],
      [
        line("target", "a", "b"),
        line("left-cutter", "c", "d", true),
        line("right-cutter", "e", "f", true),
      ],
      [
        { id: "h", type: "horizontal", entityId: "target" },
        {
          id: "span",
          type: "length",
          entityId: "target",
          value: 100,
          driven: false,
          referenceRole: "annotation",
        },
        {
          id: "observed",
          type: "length",
          entityId: "target",
          value: 999,
          driven: true,
          referenceRole: "annotation",
        },
        ...[
          point("a", 0, 0),
          point("c", 40, -20),
          point("d", 40, 20),
          point("e", 70, -20),
          point("f", 70, 20),
        ].map(({ id, x, y }) => ({
          id: `fix-${id}`,
          type: "fix" as const,
          pointId: id,
          x,
          y,
        })),
      ],
    );
    const source = structuredClone(profile);
    const result = trimToClosest(profile, "target", { x: 55, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(profile).toEqual(source);
    expect(horizontalSpans(result.profile)).toEqual([
      [0, 40],
      [70, 100],
    ]);
    expect(result.deletedConstraintIds).not.toContain("span");
    expect(result.convertedConstraintIds).toContain("span");
    const span = result.profile.constraints.find((c) => c.id === "span");
    expect(span).toEqual({
      id: "span",
      type: "distance",
      a: "a",
      b: "b",
      value: 100,
      driven: false,
      referenceRole: "annotation",
    });
    const saved = updateFeature(createTrimSketchDocument(), "trim-sketch", {
      profile: result.profile,
    });
    const reopened = parseDocument(serializeDocument(saved));
    expect(reopened.features).toEqual(saved.features);
    const sketch = reopened.features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
      throw new Error("Entity sketch expected");
    const edited = structuredClone(sketch.profile);
    const dimension = edited.constraints.find((c) => c.id === "span");
    if (dimension?.type !== "distance") throw new Error("Span expected");
    dimension.value = 120;
    const solution = solveSketch(edited);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expect(horizontalSpans(solution.profile)).toEqual([
      [0, 40],
      [70, 120],
    ]);
    expect(solution.drivenValues.observed).toBeCloseTo(40, 6);
    expect(
      solution.profile.constraints.find((c) => c.id === "observed"),
    ).toMatchObject({ value: 999, driven: true });
  });

  it("removes constraints of a trimmed orphan endpoint without moving unrelated geometry", () => {
    const profile = oneLineCut();
    profile.constraints.push({
      id: "fixed-orphan",
      type: "fix",
      pointId: "a",
      x: -10,
      y: 0,
    });
    const result = trimToClosest(profile, "target", { x: -5, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(result.profile.points.some((p) => p.id === "a")).toBe(false);
    expect(result.deletedConstraintIds).toContain("fixed-orphan");
    expectXY(xy(result.profile, "c"), [3, -5]);
    expectXY(xy(result.profile, "d"), [3, 5]);
  });

  it("keeps radius and circular equality when a circle becomes an arc", () => {
    const profile = circleAndDiameter();
    profile.points.push(point("other-center", 20, 0));
    profile.entities.push({
      id: "reference",
      type: "circle",
      center: "other-center",
      radius: 5,
      construction: true,
    });
    profile.constraints.push(
      { id: "radius", type: "radius", entityId: "target", value: 5 },
      { id: "equal", type: "equal", a: "target", b: "reference" },
    );
    const result = trimToClosest(profile, "target", { x: 0, y: 5 });
    expect(result.changed, result.message).toBe(true);
    expect(result.deletedConstraintIds).not.toContain("radius");
    expect(result.deletedConstraintIds).not.toContain("equal");
    expect(result.profile.constraints).toEqual(
      expect.arrayContaining(profile.constraints),
    );
    const solution = solveSketch(result.profile);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expect(
      arcMeasure(solution.profile, onlyArc(solution.profile)).radius,
    ).toBeCloseTo(5, 7);
  });

  it("keeps circular cut boundaries associated when the cutter radius changes from 5 to 7", () => {
    const profile = fixture(
      [point("a", -10, 0), point("b", 10, 0)],
      [
        line("target", "a", "b"),
        {
          id: "cutter",
          type: "circle",
          center: "origin",
          radius: 5,
          construction: true,
        },
      ],
      [
        { id: "a-fixed", type: "fix", pointId: "a", x: -10, y: 0 },
        { id: "b-fixed", type: "fix", pointId: "b", x: 10, y: 0 },
        { id: "h", type: "horizontal", entityId: "target" },
        { id: "r", type: "radius", entityId: "cutter", value: 5 },
        {
          id: "observed",
          type: "length",
          entityId: "target",
          value: 999,
          driven: true,
          referenceRole: "annotation",
        },
      ],
    );
    const result = trimToClosest(profile, "target", { x: 0, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(horizontalSpans(result.profile)).toEqual([
      [-10, -5],
      [5, 10],
    ]);
    const incidence = result.profile.constraints.filter(
      (c) => c.type === "pointOnCircle",
    );
    expect(incidence).toHaveLength(2);
    expect(incidence.every((c) => c.entityId === "cutter")).toBe(true);
    const saved = updateFeature(createTrimSketchDocument(), "trim-sketch", {
      profile: result.profile,
    });
    const reopened = parseDocument(serializeDocument(saved));
    expect(reopened.features).toEqual(saved.features);
    const reopenedSketch = reopened.features[0];
    if (
      reopenedSketch.type !== "sketch" ||
      reopenedSketch.profile.kind !== "entities"
    )
      throw new Error("Entity sketch expected");
    const malformed = structuredClone(reopened);
    const malformedSketch = malformed.features[0];
    if (
      malformedSketch.type !== "sketch" ||
      malformedSketch.profile.kind !== "entities"
    )
      throw new Error("Entity sketch expected");
    const wrongBoundary = malformedSketch.profile.constraints.find(
      (c) => c.type === "pointOnCircle",
    );
    if (wrongBoundary?.type !== "pointOnCircle")
      throw new Error("Circular incidence expected");
    wrongBoundary.entityId = "target";
    expect(() => parseDocument(JSON.stringify(malformed))).toThrow();
    const edited = structuredClone(reopenedSketch.profile);
    const radius = edited.constraints.find((c) => c.id === "r");
    if (radius?.type !== "radius") throw new Error("Driving radius expected");
    radius.value = 7;
    const solution = solveSketch(edited);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expect(horizontalSpans(solution.profile)).toEqual([
      [-10, -7],
      [7, 10],
    ]);
    expect(solution.drivenValues.observed).toBeCloseTo(3, 6);
    expect(
      solution.profile.constraints.find((c) => c.id === "observed"),
    ).toMatchObject({ value: 999, driven: true });
  });
});

describe("trim document and exact-solid integration", () => {
  const engine = new CadEngine();
  beforeAll(async () => {
    setOC(
      await initOpenCascade({
        wasmBinary: await readFile(
          createRequire(import.meta.url).resolve("replicad-opencascadejs/wasm"),
        ),
        print: () => undefined,
      }),
    );
  }, 60_000);
  afterAll(() => engine.dispose());

  it("closes the public example, preserves history/reopening and exports a valid 1600π solid", async () => {
    const document = createTrimSketchDocument();
    const sketch = document.features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
      throw new Error("Entity sketch expected");
    const original = sketch.profile,
      source = structuredClone(original);
    let profile = trimToClosest(original, "trim-circle", {
      x: 0,
      y: 20,
    }).profile;
    profile = trimToClosest(profile, "trim-line", { x: -25, y: 0 }).profile;
    const last = trimToClosest(profile, "trim-line", { x: 25, y: 0 });
    expect(last.changed, last.message).toBe(true);
    profile = last.profile;
    expect(original).toEqual(source);
    expect(profile.entities).toHaveLength(2);
    expect(horizontalSpans(profile)).toEqual([[-20, 20]]);
    const arc = onlyArc(profile),
      diameter = profile.entities.find((e) => e.id === "trim-line");
    if (diameter?.type !== "line") throw new Error("Diameter expected");
    expect(new Set([arc.start, arc.end])).toEqual(
      new Set([diameter.start, diameter.end]),
    );
    expect(
      profile.constraints.filter((c) => c.type === "coincident"),
    ).toHaveLength(0);
    expectXY(arcMeasure(profile, arc).midpoint, [0, -20]);
    const history = new DocumentHistory(document);
    history.apply(updateFeature(history.current, "trim-sketch", { profile }));
    expect(history.undo().features).toEqual(document.features);
    expect(history.redo().features[0]).toMatchObject({ profile });
    const final = addFeature(history.current, {
      id: "extrude",
      name: "D solid",
      type: "extrude",
      suppressed: false,
      sketchId: "trim-sketch",
      depth: 8,
      symmetric: false,
    });
    const reopened = parseDocument(serializeDocument(final));
    expect(reopened.features).toEqual(final.features);
    const built = engine.build(reopened.features);
    expect(built.featureErrors).toEqual([]);
    expect(built.warnings).toEqual([]);
    expect(built.volume).toBeCloseTo(1600 * Math.PI, 5);

    const imported = (await importSTEP(engine.export("step"))).asShape3D();
    const analyzer = new (getOC().BRepCheck_Analyzer)(
      imported.wrapped,
      true,
      false,
      false,
    );
    const properties = measureShapeVolumeProperties(imported),
      solids = imported.solids;
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(solids).toHaveLength(1);
      expect(properties.volume).toBeCloseTo(1600 * Math.PI, 5);
    } finally {
      solids.forEach((solid) => solid.delete());
      properties.delete();
      analyzer.delete();
      imported.delete();
    }
  });
});
