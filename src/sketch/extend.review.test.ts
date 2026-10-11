import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import initOpenCascade from "replicad-opencascadejs";
import {
  getOC,
  importSTEP,
  measureShapeVolumeProperties,
  setOC,
} from "replicad";
import { CadEngine } from "../cad/kernel.engine";
import { createExtendSketchDocument } from "../examples/sketch-extend";
import {
  addFeature,
  createDocument,
  DocumentHistory,
  parseDocument,
  serializeDocument,
  updateFeature,
} from "../model/document";
import { extendToClosest, previewExtendToClosest } from "./extend";
import { solveSketch } from "./solver";
import type { EntityProfile, SketchConstraint, SketchEntity } from "./types";

const point = (id: string, x: number, y: number) => ({ id, x, y });
const polar = (id: string, degrees: number, radius = 5) =>
  point(
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

function fixture(
  points: EntityProfile["points"],
  entities: SketchEntity[],
  constraints: SketchConstraint[] = [],
): EntityProfile {
  return { kind: "entities", points, entities, constraints };
}

function xy(profile: EntityProfile, id: string): [number, number] {
  if (id === "origin") return [0, 0];
  const value = profile.points.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing point ${id}`);
  return [value.x, value.y];
}

function expectXY(
  actual: [number, number],
  expected: [number, number],
  digits = 7,
) {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
}

function openEntity(profile: EntityProfile, id = "target") {
  const entity = profile.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.type === "circle")
    throw new Error("Open curve expected");
  return entity;
}

function lineWithBounds() {
  return fixture(
    [
      point("a", 0, 0),
      point("b", 4, 0),
      point("left-low", -6, -3),
      point("left-high", -6, 3),
      point("right-low", 10, -3),
      point("right-high", 10, 3),
    ],
    [
      line("target", "a", "b"),
      line("left", "left-low", "left-high", true),
      line("right", "right-low", "right-high", true),
    ],
  );
}

function sketchDocument(profile: EntityProfile) {
  return addFeature(createDocument("Independent extension fixture"), {
    id: "sketch",
    name: "Sketch",
    type: "sketch",
    plane: "XY",
    offset: 0,
    suppressed: false,
    profile,
  });
}

describe("independent analytical extension review", () => {
  it.each([
    { endpoint: "start", pickX: 1, expected: [-6, 0] },
    { endpoint: "end", pickX: 3, expected: [10, 0] },
  ] as const)(
    "extends the selected $endpoint half without moving the other end or boundaries",
    ({ endpoint, pickX, expected }) => {
      const profile = lineWithBounds(),
        source = structuredClone(profile);
      const preview = previewExtendToClosest(profile, "target", {
        x: pickX,
        y: 0,
      });
      expect(preview.changed, preview.message).toBe(true);
      expect(preview.endpoint).toBe(endpoint);
      expect(preview.segment).toEqual({
        type: "line",
        start: endpoint === "start" ? [0, 0] : [4, 0],
        end: [...expected],
      });
      const result = extendToClosest(profile, "target", { x: pickX, y: 0 });
      expect(result.changed, result.message).toBe(true);
      expectXY(xy(result.profile, openEntity(result.profile)[endpoint]), [
        ...expected,
      ]);
      const other = endpoint === "start" ? "end" : "start";
      expect(openEntity(result.profile)[other]).toBe(openEntity(source)[other]);
      expect(result.profile.entities.filter((e) => e.id !== "target")).toEqual(
        source.entities.filter((e) => e.id !== "target"),
      );
      expect(profile).toEqual(source);
      expect(result.deletedEntityIds).toEqual([]);
    },
  );

  it.each([false, true])(
    "chooses x=7 before x=12 independently of boundary array order: reverse=%s",
    (reverse) => {
      const profile = fixture(
        [
          point("a", 0, 0),
          point("b", 4, 0),
          point("c", 7, -3),
          point("d", 7, 3),
          point("e", 12, -3),
          point("f", 12, 3),
        ],
        [
          line("target", "a", "b"),
          ...(reverse
            ? [line("far", "e", "f"), line("near", "c", "d")]
            : [line("near", "c", "d"), line("far", "e", "f")]),
        ],
      );
      const result = extendToClosest(profile, "target", { x: 3, y: 0 });
      expect(result.changed, result.message).toBe(true);
      expectXY(xy(result.profile, openEntity(result.profile).end), [7, 0]);
    },
  );

  it("skips current contact and reaches the next boundary on repeated extension", () => {
    const profile = fixture(
      [
        point("a", 0, 0),
        point("b", 20, 0),
        point("c", 20, -5),
        point("d", 20, 5),
        point("e", 40, -5),
        point("f", 40, 5),
        point("g", 60, -5),
        point("h", 60, 5),
      ],
      [
        line("target", "a", "b"),
        line("touching", "c", "d"),
        line("first", "e", "f"),
        line("second", "g", "h"),
      ],
    );
    const first = extendToClosest(profile, "target", { x: 18, y: 0 });
    expect(first.changed, first.message).toBe(true);
    expectXY(xy(first.profile, openEntity(first.profile).end), [40, 0]);
    const second = extendToClosest(first.profile, "target", { x: 35, y: 0 });
    expect(second.changed, second.message).toBe(true);
    expectXY(xy(second.profile, openEntity(second.profile).end), [60, 0]);
    expectXY(xy(second.profile, openEntity(second.profile).start), [0, 0]);
  });

  it("chooses the end at the exact midpoint when both directions have a boundary", () => {
    const profile = lineWithBounds();
    const preview = previewExtendToClosest(profile, "target", { x: 2, y: 0 });
    expect(preview.changed, preview.message).toBe(true);
    expect(preview.endpoint).toBe("end");
    const result = extendToClosest(profile, "target", { x: 2, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expectXY(xy(result.profile, openEntity(result.profile).start), [0, 0]);
    expectXY(xy(result.profile, openEntity(result.profile).end), [10, 0]);
  });

  it.each([
    { begin: 10, end: 40, hitId: "d" },
    { begin: 40, end: 60, hitId: "c" },
    { begin: 20, end: 40, hitId: "d" },
  ])(
    "extends across a collinear boundary [$begin,$end] to its first positive boundary",
    ({ begin, end, hitId }) => {
      const profile = fixture(
        [
          point("a", 0, 0),
          point("b", 20, 0),
          point("c", begin, 0),
          point("d", end, 0),
        ],
        [line("target", "a", "b"), line("boundary", "c", "d", true)],
      );
      const source = structuredClone(profile);
      const result = extendToClosest(profile, "target", { x: 18, y: 0 });
      expect(result.changed, result.message).toBe(true);
      expectXY(xy(result.profile, openEntity(result.profile).end), [40, 0]);
      expect(openEntity(result.profile).end).toBe(hitId);
      expect(result.createdConstraintIds).toEqual([]);
      expect(profile).toEqual(source);
    },
  );

  it("reports the opposite endpoint when the selected half has no candidate", () => {
    const profile = fixture(
      [
        point("a", 0, 0),
        point("b", 20, 0),
        point("c", -20, -5),
        point("d", -20, 5),
      ],
      [line("target", "a", "b"), line("only-boundary", "c", "d")],
    );
    const preview = previewExtendToClosest(profile, "target", { x: 18, y: 0 });
    expect(preview.changed, preview.message).toBe(true);
    expect(preview.endpoint).toBe("start");
    expect(preview.segment).toEqual({
      type: "line",
      start: [0, 0],
      end: [-20, 0],
    });
    const result = extendToClosest(profile, "target", { x: 18, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expectXY(xy(result.profile, openEntity(result.profile).start), [-20, 0]);
    expectXY(xy(result.profile, openEntity(result.profile).end), [20, 0]);
  });

  it("ignores a closer boundary whose finite segment misses the target support", () => {
    const profile = fixture(
      [
        point("a", 0, 0),
        point("b", 20, 0),
        point("c", 40, 10),
        point("d", 40, 20),
        point("e", 60, -5),
        point("f", 60, 5),
      ],
      [
        line("target", "a", "b"),
        line("extension-only", "c", "d"),
        line("finite-boundary", "e", "f"),
      ],
    );
    const result = extendToClosest(profile, "target", { x: 18, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expectXY(xy(result.profile, openEntity(result.profile).end), [60, 0]);
  });

  it.each([
    { targetY: 0, expectedX: 5 },
    { targetY: 5, expectedX: 10 },
  ])(
    "uses the first line/circle root at y=$targetY, including a single tangent contact",
    ({ targetY, expectedX }) => {
      const profile = fixture(
        [point("a", 0, targetY), point("b", 2, targetY), point("o", 10, 0)],
        [
          line("target", "a", "b"),
          {
            id: "circle",
            type: "circle",
            center: "o",
            radius: 5,
            construction: true,
          },
        ],
      );
      const result = extendToClosest(profile, "target", { x: 1.8, y: targetY });
      expect(result.changed, result.message).toBe(true);
      expectXY(xy(result.profile, openEntity(result.profile).end), [
        expectedX,
        targetY,
      ]);
    },
  );

  it.each([-3, 3])(
    "filters the missing half of an arc boundary for target line y=%s",
    (targetY) => {
      const profile = fixture(
        [
          point("a", 0, targetY),
          point("b", 2, targetY),
          point("o", 10, 0),
          point("r", 15, 0),
          point("l", 5, 0),
        ],
        [
          line("target", "a", "b"),
          {
            id: "upper-arc",
            type: "arc",
            center: "o",
            start: "r",
            end: "l",
            clockwise: false,
            construction: true,
          },
        ],
      );
      const source = structuredClone(profile);
      const result = extendToClosest(profile, "target", { x: 1.8, y: targetY });
      expect(result.changed, result.message).toBe(targetY > 0);
      if (result.changed)
        expectXY(xy(result.profile, openEntity(result.profile).end), [6, 3]);
      else expect(result.profile).toEqual(source);
      expect(profile).toEqual(source);
    },
  );

  it.each([
    { clockwise: false, endpoint: "end", pick: 70, expected: [-3, 4] },
    { clockwise: false, endpoint: "start", pick: 20, expected: [4, -3] },
    { clockwise: true, endpoint: "end", pick: 20, expected: [4, -3] },
    { clockwise: true, endpoint: "start", pick: 70, expected: [-3, 4] },
  ] as const)(
    "extends an arc $endpoint with clockwise=$clockwise while retaining the circular support",
    ({ clockwise, endpoint, pick, expected }) => {
      const vertical = expected[0] === -3;
      const profile = fixture(
        [
          polar("a", clockwise ? 90 : 0),
          polar("b", clockwise ? 0 : 90),
          point("c", vertical ? -3 : 3, vertical ? 3 : -3),
          point("d", vertical ? -3 : 5, vertical ? 5 : -3),
        ],
        [
          {
            id: "target",
            type: "arc",
            center: "origin",
            start: "a",
            end: "b",
            clockwise,
            construction: false,
          },
          line("boundary", "c", "d", true),
        ],
      );
      const source = structuredClone(profile),
        picked = polar("pick", pick);
      const preview = previewExtendToClosest(profile, "target", picked);
      expect(preview.changed, preview.message).toBe(true);
      expect(preview.endpoint).toBe(endpoint);
      expect(preview.segment?.type).toBe("arc");
      if (preview.segment?.type !== "arc")
        throw new Error("Arc preview expected");
      expectXY(
        preview.segment.start,
        xy(profile, openEntity(profile)[endpoint]),
      );
      expectXY(preview.segment.end, [...expected]);
      expect(preview.segment.clockwise).toBe(
        endpoint === "start" ? !clockwise : clockwise,
      );
      const result = extendToClosest(profile, "target", picked);
      expect(result.changed, result.message).toBe(true);
      const arc = openEntity(result.profile);
      if (arc.type !== "arc") throw new Error("Arc expected");
      expect(arc.center).toBe("origin");
      expect(arc.clockwise).toBe(clockwise);
      expectXY(xy(result.profile, arc[endpoint]), [...expected]);
      for (const id of [arc.start, arc.end]) {
        const [x, y] = xy(result.profile, id);
        expect(Math.hypot(x, y)).toBeCloseTo(5, 7);
      }
      expect(profile).toEqual(source);
    },
  );

  it.each(["circle", "upper-arc"] as const)(
    "uses the correct analytic circle/circle root with boundary %s",
    (boundaryType) => {
      const profile = fixture(
        [
          polar("a", 180),
          polar("b", 270),
          point("o", 6, 0),
          point("r", 11, 0),
          point("l", 1, 0),
        ],
        [
          {
            id: "target",
            type: "arc",
            center: "origin",
            start: "a",
            end: "b",
            clockwise: false,
            construction: false,
          },
          boundaryType === "circle"
            ? {
                id: "boundary",
                type: "circle",
                center: "o",
                radius: 5,
                construction: true,
              }
            : {
                id: "boundary",
                type: "arc",
                center: "o",
                start: "r",
                end: "l",
                clockwise: false,
                construction: true,
              },
        ],
      );
      const result = extendToClosest(profile, "target", polar("pick", 250));
      expect(result.changed, result.message).toBe(true);
      expectXY(xy(result.profile, openEntity(result.profile).end), [
        3,
        boundaryType === "circle" ? -4 : 4,
      ]);
    },
  );

  it("extends the end of a 350°→20° arc through the angular wrap to 90°", () => {
    const profile = fixture(
      [polar("a", 350), polar("b", 20), point("c", 0, 4), point("d", 0, 6)],
      [
        {
          id: "target",
          type: "arc",
          center: "origin",
          start: "a",
          end: "b",
          clockwise: false,
          construction: false,
        },
        line("boundary", "c", "d", true),
      ],
    );
    const result = extendToClosest(profile, "target", polar("pick", 15));
    expect(result.changed, result.message).toBe(true);
    expectXY(
      xy(result.profile, openEntity(result.profile).start),
      xy(profile, "a"),
    );
    expectXY(xy(result.profile, openEntity(result.profile).end), [0, 5]);
  });

  it.each([
    { begin: 45, end: 135, expectedAngle: 135, hitId: "d" },
    { begin: 180, end: 270, expectedAngle: 180, hitId: "c" },
    { begin: 90, end: 180, expectedAngle: 180, hitId: "d" },
  ])(
    "extends a cocircular arc boundary $begin°→$end° to $expectedAngle°",
    ({ begin, end, expectedAngle, hitId }) => {
      const profile = fixture(
        [polar("a", 0), polar("b", 90), polar("c", begin), polar("d", end)],
        [
          {
            id: "target",
            type: "arc",
            center: "origin",
            start: "a",
            end: "b",
            clockwise: false,
            construction: false,
          },
          {
            id: "boundary",
            type: "arc",
            center: "origin",
            start: "c",
            end: "d",
            clockwise: false,
            construction: true,
          },
        ],
      );
      const source = structuredClone(profile);
      const result = extendToClosest(profile, "target", polar("pick", 70));
      expect(result.changed, result.message).toBe(true);
      const expected = polar("expected", expectedAngle);
      expectXY(xy(result.profile, openEntity(result.profile).end), [
        expected.x,
        expected.y,
      ]);
      expect(openEntity(result.profile).end).toBe(hitId);
      expect(result.createdConstraintIds).toEqual([]);
      expect(profile).toEqual(source);
    },
  );

  it("rejects completing a 360° arc and leaves its existing sweep intact", () => {
    const profile = fixture(
      [polar("a", 0), polar("b", 90), point("c", 5, 0), point("d", 6, 0)],
      [
        {
          id: "target",
          type: "arc",
          center: "origin",
          start: "a",
          end: "b",
          clockwise: false,
          construction: false,
        },
        line("boundary", "c", "d", true),
      ],
    );
    const source = structuredClone(profile);
    const result = extendToClosest(profile, "target", polar("pick", 70));
    expect(result.changed).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.profile).toEqual(source);
    expect(profile).toEqual(source);
  });

  it("does not delete an entity when neither end has a boundary", () => {
    const profile = fixture(
      [point("a", 0, 0), point("b", 4, 0)],
      [line("target", "a", "b")],
    );
    const source = structuredClone(profile);
    const result = extendToClosest(profile, "target", { x: 3, y: 0 });
    expect(result.changed).toBe(false);
    expect(result.deletedEntityIds).toEqual([]);
    expect(result.profile).toEqual(source);
    expect(profile).toEqual(source);
  });

  it("rejects a complete circle as target without changing its geometry", () => {
    const profile = fixture(
      [],
      [
        {
          id: "target",
          type: "circle",
          center: "origin",
          radius: 5,
          construction: false,
        },
      ],
    );
    const source = structuredClone(profile);
    const result = extendToClosest(profile, "target", { x: 5, y: 0 });
    expect(result.changed).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.profile).toEqual(source);
    expect(profile).toEqual(source);
  });

  it("keeps preview repeatable and free of persistent IDs", () => {
    const profile = lineWithBounds(),
      source = structuredClone(profile);
    const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      const first = previewExtendToClosest(profile, "target", { x: 3, y: 0 });
      const second = previewExtendToClosest(profile, "target", { x: 3, y: 0 });
      expect(first.changed, first.message).toBe(true);
      expect(first).toEqual(second);
      expect(uuid).not.toHaveBeenCalled();
      expect(profile).toEqual(source);
    } finally {
      uuid.mockRestore();
    }
  });

  it("extends the supplied geometry without solving a stale length target first", () => {
    const profile = lineWithBounds();
    profile.constraints.push({
      id: "stale",
      type: "length",
      entityId: "target",
      value: 3,
    });
    const source = structuredClone(profile);
    const preview = previewExtendToClosest(profile, "target", { x: 3.5, y: 0 });
    expect(preview.changed, preview.message).toBe(true);
    expect(preview.segment).toMatchObject({
      type: "line",
      start: [4, 0],
      end: [10, 0],
    });
    const result = extendToClosest(profile, "target", { x: 3.5, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expectXY(xy(result.profile, openEntity(result.profile).start), [0, 0]);
    expectXY(xy(result.profile, openEntity(result.profile).end), [10, 0]);
    expect(profile).toEqual(source);
  });

  it("detaches a shared fixed endpoint without moving the neighboring entity", () => {
    const profile = lineWithBounds();
    profile.points.push(point("n", 4, 3));
    profile.entities.push(line("neighbor", "b", "n"));
    profile.constraints.push({
      id: "shared-fix",
      type: "fix",
      pointId: "b",
      x: 4,
      y: 0,
    });
    const source = structuredClone(profile);
    const result = extendToClosest(profile, "target", { x: 3, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(openEntity(result.profile).end).not.toBe("b");
    expectXY(xy(result.profile, "b"), [4, 0]);
    expectXY(xy(result.profile, openEntity(result.profile).end), [10, 0]);
    expect(result.profile.entities.find((e) => e.id === "neighbor")).toEqual(
      source.entities.find((e) => e.id === "neighbor"),
    );
    expect(result.profile.constraints).toContainEqual(source.constraints[0]);
    expect(result.deletedConstraintIds).not.toContain("shared-fix");
    expect(profile).toEqual(source);
  });

  it("retains construction when it is the target of extension", () => {
    const profile = lineWithBounds();
    profile.entities[0].construction = true;
    const result = extendToClosest(profile, "target", { x: 3, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(openEntity(result.profile).construction).toBe(true);
    expectXY(xy(result.profile, openEntity(result.profile).end), [10, 0]);
  });

  it("cleans the old fixed endpoint and driving length while measuring the extended line freshly", () => {
    const profile = lineWithBounds();
    profile.points.push(point("ra", 0, 10), point("rb", 4, 10));
    profile.entities.push(line("reference", "ra", "rb", true));
    profile.constraints.push(
      { id: "a-fixed", type: "fix", pointId: "a", x: 0, y: 0 },
      { id: "old-end-fixed", type: "fix", pointId: "b", x: 4, y: 0 },
      { id: "h", type: "horizontal", entityId: "target" },
      {
        id: "length",
        type: "length",
        entityId: "target",
        value: 4,
        driven: false,
        referenceRole: "constraint",
      },
      { id: "equal", type: "equal", a: "target", b: "reference" },
      {
        id: "observed",
        type: "length",
        entityId: "target",
        value: 999,
        driven: true,
        referenceRole: "annotation",
      },
    );
    const source = structuredClone(profile);
    const result = extendToClosest(profile, "target", { x: 3, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(result.deletedConstraintIds).toEqual(
      expect.arrayContaining(["old-end-fixed", "length", "equal"]),
    );
    expect(result.convertedConstraintIds).toEqual([]);
    expect(result.profile.points.some((p) => p.id === "b")).toBe(false);
    for (const id of ["a-fixed", "h", "observed"])
      expect(result.profile.constraints.find((c) => c.id === id)).toEqual(
        source.constraints.find((c) => c.id === id),
      );
    const solution = solveSketch(result.profile);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expect(solution.drivenValues.observed).toBeCloseTo(10, 6);
    expectXY(xy(solution.profile, openEntity(solution.profile).end), [10, 0]);
    expect(profile).toEqual(source);
  });

  it("persists an interior line association and follows a boundary translated from x=10 to x=12", () => {
    const profile = fixture(
      [
        point("a", 0, 0),
        point("b", 2, 0),
        point("c", 10, -5),
        point("d", 10, 5),
      ],
      [line("target", "a", "b"), line("boundary", "c", "d", true)],
      [
        { id: "a-fixed", type: "fix", pointId: "a", x: 0, y: 0 },
        { id: "c-fixed", type: "fix", pointId: "c", x: 10, y: -5 },
        { id: "d-fixed", type: "fix", pointId: "d", x: 10, y: 5 },
        { id: "h", type: "horizontal", entityId: "target" },
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
    const result = extendToClosest(profile, "target", { x: 1.8, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(result.profile.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "pointOnLine",
          pointId: openEntity(result.profile).end,
          entityId: "boundary",
        }),
      ]),
    );
    const saved = sketchDocument(result.profile),
      reopened = parseDocument(serializeDocument(saved));
    expect(reopened.features).toEqual(saved.features);
    const sketch = reopened.features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
      throw new Error("Entity sketch expected");
    const edited = structuredClone(sketch.profile);
    for (const c of edited.constraints)
      if (c.type === "fix" && ["c-fixed", "d-fixed"].includes(c.id)) c.x = 12;
    const solution = solveSketch(edited);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expectXY(xy(solution.profile, openEntity(solution.profile).end), [12, 0]);
    expect(solution.drivenValues.observed).toBeCloseTo(12, 6);
    expect(
      solution.profile.constraints.find((c) => c.id === "observed"),
    ).toMatchObject({ value: 999, driven: true });
  });

  it("persists a circular association and follows the near root as radius changes 5→7", () => {
    const profile = fixture(
      [point("a", 0, 0), point("b", 2, 0), point("o", 10, 0)],
      [
        line("target", "a", "b"),
        {
          id: "boundary",
          type: "circle",
          center: "o",
          radius: 5,
          construction: true,
        },
      ],
      [
        { id: "a-fixed", type: "fix", pointId: "a", x: 0, y: 0 },
        { id: "o-fixed", type: "fix", pointId: "o", x: 10, y: 0 },
        { id: "h", type: "horizontal", entityId: "target" },
        { id: "r", type: "radius", entityId: "boundary", value: 5 },
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
    const result = extendToClosest(profile, "target", { x: 1.8, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(result.profile.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "pointOnCircle",
          pointId: openEntity(result.profile).end,
          entityId: "boundary",
        }),
      ]),
    );
    const saved = sketchDocument(result.profile),
      reopened = parseDocument(serializeDocument(saved));
    expect(reopened.features).toEqual(saved.features);
    const sketch = reopened.features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
      throw new Error("Entity sketch expected");
    const edited = structuredClone(sketch.profile);
    const radius = edited.constraints.find((c) => c.id === "r");
    if (radius?.type !== "radius") throw new Error("Driving radius expected");
    radius.value = 7;
    const solution = solveSketch(edited);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expectXY(xy(solution.profile, openEntity(solution.profile).end), [3, 0]);
    expect(solution.drivenValues.observed).toBeCloseTo(3, 6);
    expect(
      solution.profile.constraints.find((c) => c.id === "observed"),
    ).toMatchObject({ value: 999, driven: true });
  });

  it("rolls back atomically when retaining a shared endpoint would exceed the 128-point limit", () => {
    const profile = lineWithBounds();
    profile.points.push(point("n", 4, 3));
    profile.entities.push(line("neighbor", "b", "n"));
    while (profile.points.length < 128) {
      const index = profile.points.length;
      profile.points.push(point(`unused-${index}`, index, 100));
    }
    const source = structuredClone(profile);
    const preview = previewExtendToClosest(profile, "target", { x: 3, y: 0 });
    expect(preview.changed, preview.message).toBe(true);
    const result = extendToClosest(profile, "target", { x: 3, y: 0 });
    expect(result.changed).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.profile).toEqual(source);
    expect(profile).toEqual(source);
  });

  it("preserves arc radius dimensions and measures the edited support after extension", () => {
    const profile = fixture(
      [
        polar("a", 0),
        polar("b", 90),
        point("c", -3, 3),
        point("d", -3, 5),
        point("axis-end", 10, 0),
      ],
      [
        {
          id: "target",
          type: "arc",
          center: "origin",
          start: "a",
          end: "b",
          clockwise: false,
          construction: false,
        },
        line("boundary", "c", "d", true),
        line("axis", "origin", "axis-end", true),
      ],
      [
        { id: "c-fixed", type: "fix", pointId: "c", x: -3, y: 3 },
        { id: "d-fixed", type: "fix", pointId: "d", x: -3, y: 5 },
        { id: "axis-fixed", type: "fix", pointId: "axis-end", x: 10, y: 0 },
        {
          id: "start-on-axis",
          type: "pointOnLine",
          pointId: "a",
          entityId: "axis",
        },
        {
          id: "r",
          type: "radius",
          entityId: "target",
          value: 5,
          referenceRole: "constraint",
        },
        {
          id: "observed-radius",
          type: "radius",
          entityId: "target",
          value: 999,
          driven: true,
          referenceRole: "annotation",
        },
      ],
    );
    const result = extendToClosest(profile, "target", polar("pick", 70));
    expect(result.changed, result.message).toBe(true);
    for (const id of ["r", "observed-radius"])
      expect(result.profile.constraints.find((c) => c.id === id)).toEqual(
        profile.constraints.find((c) => c.id === id),
      );
    const edited = structuredClone(result.profile);
    const radius = edited.constraints.find((c) => c.id === "r");
    if (radius?.type !== "radius") throw new Error("Driving radius expected");
    radius.value = 7;
    const solution = solveSketch(edited);
    expect(["underdefined", "fullyDefined"], solution.message).toContain(
      solution.status,
    );
    expectXY(
      xy(solution.profile, openEntity(solution.profile).start),
      [7, 0],
      6,
    );
    expectXY(
      xy(solution.profile, openEntity(solution.profile).end),
      [-3, Math.sqrt(40)],
      6,
    );
    expect(solution.drivenValues["observed-radius"]).toBeCloseTo(7, 6);
    expect(
      solution.profile.constraints.find((c) => c.id === "observed-radius"),
    ).toMatchObject({ value: 999, driven: true });
  });
});

describe("extension document and exact-solid integration", () => {
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

  async function checkSolid(
    document: ReturnType<typeof createDocument>,
    volume: number,
  ) {
    const reopened = parseDocument(serializeDocument(document));
    expect(reopened.features).toEqual(document.features);
    const built = engine.build(reopened.features);
    expect(built.featureErrors).toEqual([]);
    expect(built.warnings).toEqual([]);
    expect(built.volume).toBeCloseTo(volume, 5);
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
      expect(properties.volume).toBeCloseTo(volume, 5);
    } finally {
      solids.forEach((solid) => solid.delete());
      properties.delete();
      analyzer.delete();
      imported.delete();
    }
  }

  it("closes a 10×6 rectangle, preserves undo/reopen and exports a 240 mm³ solid", async () => {
    const profile = fixture(
      [
        point("a", 0, 0),
        point("b", 8, 0),
        point("c", 10, 0),
        point("d", 10, 6),
        point("e", 0, 6),
      ],
      [
        line("target", "a", "b"),
        line("right", "c", "d"),
        line("top", "d", "e"),
        line("left", "e", "a"),
      ],
    );
    const document = sketchDocument(profile),
      source = structuredClone(profile);
    const result = extendToClosest(profile, "target", { x: 7, y: 0 });
    expect(result.changed, result.message).toBe(true);
    expect(openEntity(result.profile).end).toBe("c");
    expect(result.createdConstraintIds).toEqual([]);
    expect(profile).toEqual(source);
    const history = new DocumentHistory(document);
    history.apply(
      updateFeature(history.current, "sketch", { profile: result.profile }),
    );
    expect(history.undo().features).toEqual(document.features);
    expect(history.redo().features[0]).toMatchObject({
      profile: result.profile,
    });
    const final = addFeature(history.current, {
      id: "extrude",
      name: "Rectangle",
      type: "extrude",
      suppressed: false,
      sketchId: "sketch",
      depth: 4,
      symmetric: false,
    });
    await checkSolid(final, 240);
  });

  it("extends both ends of the public R20 example and exports a 1600π solid", async () => {
    const document = createExtendSketchDocument(),
      sketch = document.features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
      throw new Error("Entity sketch expected");
    const source = structuredClone(sketch.profile);
    const first = extendToClosest(sketch.profile, "extend-line", {
      x: -8,
      y: 0,
    });
    expect(first.changed, first.message).toBe(true);
    const second = extendToClosest(first.profile, "extend-line", {
      x: 8,
      y: 0,
    });
    expect(second.changed, second.message).toBe(true);
    const diameter = openEntity(second.profile, "extend-line"),
      arc = openEntity(second.profile, "extend-arc");
    expect(new Set([diameter.start, diameter.end])).toEqual(
      new Set([arc.start, arc.end]),
    );
    expectXY(xy(second.profile, diameter.start), [-20, 0]);
    expectXY(xy(second.profile, diameter.end), [20, 0]);
    expect(sketch.profile).toEqual(source);
    const edited = updateFeature(document, "extend-sketch", {
      profile: second.profile,
    });
    const final = addFeature(edited, {
      id: "extrude",
      name: "D solid",
      type: "extrude",
      suppressed: false,
      sketchId: "extend-sketch",
      depth: 8,
      symmetric: false,
    });
    await checkSolid(final, 1600 * Math.PI);
  });
});
