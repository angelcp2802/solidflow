import { describe, expect, it } from "vitest";
import type { SketchFeature } from "../cad/kernel.types";
import type { EntityProfile, SketchEntity } from "../sketch/types";
import { initialLoftSection, resolvedSweepPath } from "./advancedInputs";
import { orderedSweepPath } from "./featureInputs";

function sketch(profile: EntityProfile): SketchFeature {
  return {
    id: "section",
    name: "Sección",
    type: "sketch",
    plane: "XY",
    offset: 0,
    suppressed: false,
    profile,
  };
}

describe("resolved sweep inputs", () => {
  it("orders coincident endpoints using solved coordinates without changing persisted seeds", () => {
    const path = sketch({
      kind: "entities",
      points: [
        { id: "a", x: 0, y: 10 },
        { id: "b", x: 0, y: 10.1 },
        { id: "end", x: 0, y: 20 },
      ],
      entities: [
        {
          id: "one",
          type: "line",
          start: "origin",
          end: "a",
          construction: false,
        },
        {
          id: "two",
          type: "line",
          start: "b",
          end: "end",
          construction: false,
        },
      ],
      constraints: [
        { id: "fix-a", type: "fix", pointId: "a", x: 0, y: 10 },
        { id: "join", type: "coincident", a: "a", b: "b" },
        { id: "fix-end", type: "fix", pointId: "end", x: 0, y: 20 },
      ],
    });
    const before = structuredClone(path);
    expect(() => orderedSweepPath(path)).toThrow("conectada");
    expect(resolvedSweepPath(path)).toEqual([
      { entityId: "one", reversed: false },
      { entityId: "two", reversed: false },
    ]);
    expect(path).toEqual(before);
  });

  it("does not silently use the original chain when constraints fail", () => {
    const path = sketch({
      kind: "entities",
      points: [{ id: "end", x: 10, y: 0 }],
      entities: [
        {
          id: "line",
          type: "line",
          start: "origin",
          end: "end",
          construction: false,
        },
      ],
      constraints: [
        { id: "fixed", type: "fix", pointId: "end", x: 10, y: 0 },
        { id: "length", type: "length", entityId: "line", value: 20 },
      ],
    });
    expect(orderedSweepPath(path)).toHaveLength(1);
    expect(() => resolvedSweepPath(path)).toThrow(
      "No se puede resolver el croquis",
    );
  });
});

function rectangle(
  ids: string[],
  order: number[],
  reversedMask: number,
): SketchFeature {
  const pointIds = ["bottom-left", "bottom-right", "top-right", "top-left"];
  const edges = pointIds.map((start, index): SketchEntity => {
    const end = pointIds[(index + 1) % 4];
    return {
      id: ids[index],
      type: "line",
      construction: false,
      start: reversedMask & (1 << index) ? end : start,
      end: reversedMask & (1 << index) ? start : end,
    };
  });
  return sketch({
    kind: "entities",
    constraints: [],
    points: [
      { id: pointIds[0], x: -10, y: -5 },
      { id: pointIds[1], x: 10, y: -5 },
      { id: pointIds[2], x: 10, y: 5 },
      { id: pointIds[3], x: -10, y: 5 },
      { id: "aux-low", x: -100, y: -100 },
    ],
    entities: [
      {
        id: "000-construction",
        type: "line",
        construction: true,
        start: "aux-low",
        end: "origin",
      },
      ...order.map((index) => edges[index]),
    ],
  });
}

describe("initial loft correspondence", () => {
  it.each([
    { ids: ["z", "a", "b", "c"], order: [0, 1, 2, 3], reversedMask: 0 },
    { ids: ["p", "q", "r", "a"], order: [3, 2, 1, 0], reversedMask: 15 },
    {
      ids: ["bottom", "right", "top", "left"],
      order: [2, 0, 3, 1],
      reversedMask: 5,
    },
    { ids: ["4", "3", "2", "1"], order: [1, 3, 0, 2], reversedMask: 10 },
  ])(
    "chooses the same corner and traversal despite IDs, array order and stored directions: $reversedMask",
    ({ ids, order, reversedMask }) => {
      const section = rectangle(ids, order, reversedMask);
      const before = structuredClone(section);
      const seam = initialLoftSection(section);
      expect(seam).toEqual({
        sketchId: section.id,
        startEntityId: ids[0],
        reversed: !!(reversedMask & 1),
      });
      expect(section).toEqual(before);
    },
  );

  it("groups almost coincident endpoints at the stated positional tolerance before comparing tangents", () => {
    const section = rectangle(
      ["bottom", "right", "top", "left"],
      [3, 2, 1, 0],
      0,
    );
    const profile = section.profile as EntityProfile;
    profile.points.push({
      id: "left-bottom-copy",
      x: -10 - 4e-9,
      y: -5 - 4e-9,
    });
    const left = profile.entities.find((entity) => entity.id === "left")!;
    if (left.type === "line") left.end = "left-bottom-copy";
    expect(initialLoftSection(section)).toEqual({
      sketchId: section.id,
      startEntityId: "bottom",
      reversed: false,
    });
  });

  it.each([false, true])(
    "uses the outgoing arc tangent, accounting for reversed storage (%s)",
    (reversed) => {
      const section = sketch({
        kind: "entities",
        constraints: [],
        points: [
          { id: "end", x: 10, y: 10 },
          { id: "center", x: 0, y: 10 },
        ],
        entities: [
          {
            id: "first-lexically",
            type: "line",
            start: "end",
            end: "origin",
            construction: false,
          },
          {
            id: "arc",
            type: "arc",
            center: "center",
            start: reversed ? "end" : "origin",
            end: reversed ? "origin" : "end",
            clockwise: reversed,
            construction: false,
          },
        ],
      });
      expect(initialLoftSection(section)).toEqual({
        sketchId: section.id,
        startEntityId: "arc",
        reversed,
      });
    },
  );

  it("keeps circle and legacy seam contracts", () => {
    const circle = sketch({
      kind: "entities",
      points: [],
      constraints: [],
      entities: [
        {
          id: "circle",
          type: "circle",
          center: "origin",
          radius: 5,
          construction: false,
        },
      ],
    });
    expect(initialLoftSection(circle)).toEqual({
      sketchId: circle.id,
      startEntityId: "circle",
      reversed: false,
    });
    expect(
      initialLoftSection({
        ...circle,
        profile: { kind: "rectangle", center: [0, 0], width: 20, height: 10 },
      }),
    ).toEqual({ sketchId: circle.id, startEntityId: null, reversed: false });
  });
});
