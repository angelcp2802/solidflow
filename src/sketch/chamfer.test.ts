import { describe, expect, it, vi } from "vitest";
import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchSelection,
} from "./types";
import {
  planSketchChamfer,
  CHAMFER_TOLERANCE,
  type ChamferParameters,
} from "./chamfer";
import {
  measureDimension,
  solveSketch,
  SKETCH_SOLVER_TOLERANCE,
} from "./solver";
import { validateEntityProfile } from "./validation";
import {
  createDocument,
  parseDocument,
  serializeDocument,
} from "../model/document";

const point = (id: string, x: number, y: number) => ({ id, x, y });
const line = (
  id: string,
  start: string,
  end: string,
  construction = false,
): SketchEntity => ({ id, type: "line", start, end, construction });
const pair: SketchSelection[] = [
  { kind: "entity", id: "first" },
  { kind: "entity", id: "second" },
];
const getPoint = (profile: EntityProfile, id: string) =>
  id === "origin"
    ? point("origin", 0, 0)
    : profile.points.find((item) => item.id === id)!;
const getLine = (profile: EntityProfile, id: string) => {
  const entity = profile.entities.find((item) => item.id === id)!;
  expect(entity.type).toBe("line");
  return entity as Extract<SketchEntity, { type: "line" }>;
};
const endpoints = (profile: EntityProfile, id: string) => {
  const entity = getLine(profile, id);
  return [
    getPoint(profile, entity.start),
    getPoint(profile, entity.end),
  ] as const;
};
const expectXY = (actual: { x: number; y: number }, x: number, y: number) => {
  expect(actual.x).toBeCloseTo(x, 7);
  expect(actual.y).toBeCloseTo(y, 7);
};
function corner(
  theta = 90,
  rotation = 0,
  reverseFirst = false,
  reverseSecond = false,
): EntityProfile {
  const angle = (degrees: number) => (degrees * Math.PI) / 180;
  return {
    kind: "entities",
    points: [
      point(
        "a",
        40 * Math.cos(angle(rotation)),
        40 * Math.sin(angle(rotation)),
      ),
      point(
        "b",
        30 * Math.cos(angle(rotation + theta)),
        30 * Math.sin(angle(rotation + theta)),
      ),
    ],
    entities: [
      line(
        "first",
        reverseFirst ? "a" : "origin",
        reverseFirst ? "origin" : "a",
      ),
      line(
        "second",
        reverseSecond ? "b" : "origin",
        reverseSecond ? "origin" : "b",
      ),
    ],
    constraints: [],
  };
}
function definedCorner(): EntityProfile {
  const profile = corner(90, 0, false, true);
  profile.constraints = [
    { id: "h", type: "horizontal", entityId: "first" },
    { id: "v", type: "vertical", entityId: "second" },
    {
      id: "original-first-length",
      type: "length",
      entityId: "first",
      value: 40,
      driven: false,
      referenceRole: "annotation",
    },
    {
      id: "original-second-length",
      type: "length",
      entityId: "second",
      value: 30,
    },
    {
      id: "reading",
      type: "length",
      entityId: "first",
      value: 999,
      driven: true,
      referenceRole: "annotation",
    },
  ];
  return profile;
}
function accepted(profile: EntityProfile) {
  const result = solveSketch(profile);
  expect(["underdefined", "fullyDefined"], result.message).toContain(
    result.status,
  );
  expect(result.maxResidual).toBeLessThanOrEqual(SKETCH_SOLVER_TOLERANCE);
  return result;
}
function changed(
  input: EntityProfile,
  parameters: ChamferParameters,
  selection = pair,
) {
  const result = planSketchChamfer(input, selection, parameters);
  expect(result.changed, result.message).toBe(true);
  expect(result.sourceProfile).toBe(input);
  expect(result.profile).not.toBe(input);
  expect(validateEntityProfile(result.profile)).toEqual(result.profile);
  return result;
}
const setValue = (profile: EntityProfile, id: string, value: number) => {
  const dimension = profile.constraints.find((item) => item.id === id)!;
  if (!("value" in dimension)) throw new Error("Expected dimension");
  dimension.value = value;
};

describe("sketch chamfer analytical geometry", () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "cuts a right corner with first reversed=%s and second reversed=%s",
    (a, b) => {
      const input = corner(90, 0, a, b),
        original = structuredClone(input);
      const result = changed(input, { mode: "equal", distance: 5 });
      const [start, end] = endpoints(result.profile, result.chamferEntityId!);
      expectXY(start, 5, 0);
      expectXY(end, 0, 5);
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(
        5 * Math.sqrt(2),
        7,
      );
      expect(result.affectedEntityIds).toEqual(["first", "second"]);
      expect(result.profile.points).toHaveLength(4);
      expect(result.createdEntityIds).toHaveLength(3);
      expect(input).toEqual(original);
      for (const entity of original.entities) {
        if (entity.type !== "line") continue;
        const current = getLine(result.profile, entity.id);
        expect(current[entity.start === "origin" ? "end" : "start"]).toBe(
          entity.start === "origin" ? entity.end : entity.start,
        );
      }
    },
  );

  it.each([60, 120, -60, -120])(
    "uses two setbacks on a %s degree corner",
    (theta) => {
      const result = changed(corner(theta), {
        mode: "distances",
        distance1: 3,
        distance2: 7,
      });
      const [start, end] = endpoints(result.profile, result.chamferEntityId!);
      expectXY(start, 3, 0);
      expectXY(
        end,
        theta === 60 || theta === -60 ? 3.5 : -3.5,
        Math.sign(theta) * 3.5 * Math.sqrt(3),
      );
      // Pythagoras with the independent Cartesian coordinates above.
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(
        Math.sqrt(theta === 60 || theta === -60 ? 37 : 79),
        7,
      );
    },
  );

  it("assigns D1 to the first selected line even when the selection order is reversed", () => {
    const result = changed(
      corner(),
      { mode: "distances", distance1: 4, distance2: 9 },
      [...pair].reverse(),
    );
    const [start, end] = endpoints(result.profile, result.chamferEntityId!);
    expectXY(start, 0, 4);
    expectXY(end, 9, 0);
    expect(result.affectedEntityIds).toEqual(["second", "first"]);
  });

  it.each([
    { theta: 90, rotation: 0, alpha: 30, secondDistance: 2 * Math.sqrt(3) },
    { theta: -90, rotation: 0, alpha: 30, secondDistance: 2 * Math.sqrt(3) },
    { theta: 60, rotation: 35, alpha: 60, secondDistance: 6 },
    { theta: -60, rotation: 170, alpha: 60, secondDistance: 6 },
    { theta: 120, rotation: -110, alpha: 30, secondDistance: 6 },
    { theta: -120, rotation: 210, alpha: 30, secondDistance: 6 },
  ])(
    "measures alpha=$alpha on theta=$theta with rotation=$rotation",
    (fixture) => {
      for (const reversed of [false, true]) {
        const input = corner(
          fixture.theta,
          fixture.rotation,
          reversed,
          !reversed,
        );
        const result = changed(input, {
          mode: "angle",
          distance: 6,
          angle: fixture.alpha,
        });
        const [a, b] = endpoints(result.profile, result.chamferEntityId!);
        expect(Math.hypot(a.x, a.y)).toBeCloseTo(6, 7);
        expect(Math.hypot(b.x, b.y)).toBeCloseTo(fixture.secondDistance, 7);
        const angle = result.profile.constraints.find(
          (item) => item.type === "angle",
        );
        expect(angle?.type).toBe("angle");
        if (angle?.type === "angle")
          expect(measureDimension(result.profile, angle)).toBeCloseTo(
            fixture.alpha,
            7,
          );
        // Independent unsigned angle at the first setback, using corner-to-point geometry.
        const cosine =
          (-a.x * (b.x - a.x) - a.y * (b.y - a.y)) /
          (Math.hypot(a.x, a.y) * Math.hypot(b.x - a.x, b.y - a.y));
        expect((Math.acos(cosine) * 180) / Math.PI).toBeCloseTo(
          fixture.alpha,
          7,
        );
      }
    },
  );

  it("accepts an explicit vertex and preserves separate coincident corner IDs", () => {
    const input = corner();
    input.points.push(point("corner-a", 0, 0), point("corner-b", 0, 0));
    (input.entities[0] as Extract<SketchEntity, { type: "line" }>).start =
      "corner-a";
    (input.entities[1] as Extract<SketchEntity, { type: "line" }>).start =
      "corner-b";
    input.constraints.push({
      id: "fixed",
      type: "fix",
      pointId: "corner-a",
      x: 0,
      y: 0,
    });
    const result = changed(input, { mode: "equal", distance: 4 }, [
      { kind: "point", id: "corner-a" },
    ]);
    expect(getPoint(result.profile, "corner-a")).toEqual(
      point("corner-a", 0, 0),
    );
    expect(getPoint(result.profile, "corner-b")).toEqual(
      point("corner-b", 0, 0),
    );
    expect(result.profile.constraints).toContainEqual({
      id: "fixed",
      type: "fix",
      pointId: "corner-a",
      x: 0,
      y: 0,
    });
    expect(
      result.profile.constraints.filter((item) => item.type === "coincident"),
    ).toHaveLength(1);
    accepted(result.profile);
  });

  it("uses the declared endpoint tolerance without merging points or duplicating a coincidence chain", () => {
    const input = corner();
    input.points.push(
      point("corner-a", CHAMFER_TOLERANCE / 2, 0),
      point("corner-b", 0, 0),
      point("bridge", 0, 0),
    );
    (input.entities[0] as Extract<SketchEntity, { type: "line" }>).start =
      "corner-a";
    (input.entities[1] as Extract<SketchEntity, { type: "line" }>).start =
      "corner-b";
    input.constraints.push(
      { id: "c1", type: "coincident", a: "corner-a", b: "bridge" },
      { id: "c2", type: "coincident", a: "bridge", b: "corner-b" },
    );
    const result = changed(input, { mode: "equal", distance: 3 });
    expect(
      result.profile.constraints.filter((item) => item.type === "coincident"),
    ).toHaveLength(2);
    expect(getPoint(result.profile, "corner-a").x).toBe(CHAMFER_TOLERANCE / 2);
    expect(input.points).toHaveLength(5);
    const far = structuredClone(input);
    far.points.find((item) => item.id === "corner-a")!.x =
      CHAMFER_TOLERANCE * 2;
    expect(
      planSketchChamfer(far, pair, { mode: "equal", distance: 3 }).changed,
    ).toBe(false);
  });

  it("rejects an ambiguous T vertex but leaves its neighbor unchanged with an explicit pair", () => {
    const input = corner();
    input.points.push(point("neighbor", -20, 0));
    input.entities.push(line("third", "origin", "neighbor"));
    input.constraints.push({
      id: "third-fixed",
      type: "fix",
      pointId: "neighbor",
      x: -20,
      y: 0,
    });
    const rejected = planSketchChamfer(
      input,
      [{ kind: "point", id: "origin" }],
      { mode: "equal", distance: 5 },
    );
    expect(rejected.changed).toBe(false);
    expect(rejected.profile).toBe(input);
    const result = changed(input, { mode: "equal", distance: 5 });
    expect(result.profile.entities.find((item) => item.id === "third")).toEqual(
      input.entities[2],
    );
    expect(getPoint(result.profile, "neighbor")).toEqual(
      point("neighbor", -20, 0),
    );
    expect(result.profile.constraints).toContainEqual(input.constraints[0]);
  });

  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])(
    "preserves construction flags %s/%s and gives the chamfer flag %s",
    (a, b, expected) => {
      const input = corner();
      input.entities[0].construction = a;
      input.entities[1].construction = b;
      const result = changed(input, { mode: "equal", distance: 3 });
      expect(getLine(result.profile, "first").construction).toBe(a);
      expect(getLine(result.profile, "second").construction).toBe(b);
      expect(
        getLine(result.profile, result.chamferEntityId!).construction,
      ).toBe(expected);
      expect(
        result.profile.entities
          .filter(
            (item) =>
              result.createdEntityIds.includes(item.id) &&
              item.id !== result.chamferEntityId,
          )
          .every((item) => item.construction),
      ).toBe(true);
    },
  );
});

describe("sketch chamfer associativity and atomic plans", () => {
  it("retains original driving spans and fresh driven fragment length through edits and serialization", () => {
    const input = definedCorner(),
      original = structuredClone(input);
    expect(accepted(input).degreesOfFreedom).toBe(0);
    const plan = changed(input, { mode: "equal", distance: 5 });
    expect(plan.convertedConstraintIds).toEqual([
      "original-first-length",
      "original-second-length",
    ]);
    expect(
      plan.profile.constraints.find(
        (item) => item.id === "original-first-length",
      ),
    ).toEqual({
      id: "original-first-length",
      type: "distance",
      a: "origin",
      b: "a",
      value: 40,
      driven: false,
      referenceRole: "annotation",
    });
    expect(
      plan.profile.constraints.find(
        (item) => item.id === "original-second-length",
      ),
    ).toEqual({
      id: "original-second-length",
      type: "distance",
      a: "b",
      b: "origin",
      value: 30,
    });
    let solved = accepted(plan.profile);
    expect(solved.degreesOfFreedom).toBe(0);
    expect(solved.redundantConstraintIds).toEqual([]);
    expect(solved.drivenValues.reading).toBeCloseTo(35, 7);
    const edited = structuredClone(solved.profile);
    const setback = edited.constraints.find(
      (item) =>
        plan.createdConstraintIds.includes(item.id) && item.type === "length",
    )!;
    setValue(edited, setback.id, 8);
    setValue(edited, "original-first-length", 50);
    solved = accepted(edited);
    const [a, b] = endpoints(solved.profile, plan.chamferEntityId!);
    expectXY(a, 8, 0);
    expectXY(b, 0, 8);
    expectXY(getPoint(solved.profile, "a"), 50, 0);
    expect(solved.drivenValues.reading).toBeCloseTo(42, 6);
    expect(
      solved.profile.constraints.find((item) => item.id === "reading"),
    ).toEqual(input.constraints[4]);
    const document = createDocument("Analytical chamfer");
    document.features.push({
      id: "sketch",
      name: "Sketch",
      type: "sketch",
      plane: "XY",
      offset: 0,
      suppressed: false,
      profile: solved.profile,
    });
    const reopened = parseDocument(serializeDocument(document));
    expect(reopened.features).toEqual(document.features);
    expect(input).toEqual(original);
  });

  it("edits each setback independently in distances mode", () => {
    const plan = changed(definedCorner(), {
      mode: "distances",
      distance1: 4,
      distance2: 7,
    });
    const firstSolution = accepted(plan.profile);
    const edited = structuredClone(firstSolution.profile);
    const dimensions = edited.constraints.filter(
      (item) =>
        plan.createdConstraintIds.includes(item.id) && item.type === "length",
    );
    setValue(edited, dimensions[0].id, 6);
    setValue(edited, dimensions[1].id, 9);
    const solved = accepted(edited),
      [a, b] = endpoints(solved.profile, plan.chamferEntityId!);
    expectXY(a, 6, 0);
    expectXY(b, 0, 9);
    expect(solved.drivenValues.reading).toBeCloseTo(34, 6);
  });

  it("edits the angle without moving the virtual origin or reviving the removed corner", () => {
    const plan = changed(definedCorner(), {
      mode: "angle",
      distance: 6,
      angle: 30,
    });
    const solved = accepted(plan.profile);
    expectXY(
      endpoints(solved.profile, plan.chamferEntityId!)[1],
      0,
      2 * Math.sqrt(3),
    );
    const edited = structuredClone(solved.profile),
      angle = edited.constraints.find(
        (item) =>
          plan.createdConstraintIds.includes(item.id) && item.type === "angle",
      )!;
    setValue(edited, angle.id, 45);
    const next = accepted(edited),
      [a, b] = endpoints(next.profile, plan.chamferEntityId!);
    expectXY(a, 6, 0);
    expectXY(b, 0, 6);
    expect(getLine(next.profile, "first").start).not.toBe("origin");
    expect(getLine(next.profile, "second").end).not.toBe("origin");
  });

  it.each([
    { theta: 60, initial: 60, edited: 30, secondDistance: 3 },
    { theta: -60, initial: 60, edited: 30, secondDistance: 3 },
    {
      theta: 120,
      initial: 30,
      edited: 45,
      secondDistance: 6 * (Math.sqrt(3) + 1),
    },
    {
      theta: -120,
      initial: 30,
      edited: 45,
      secondDistance: 6 * (Math.sqrt(3) + 1),
    },
  ])(
    "keeps the selected rays when editing an acute/obtuse angle: $theta",
    (fixture) => {
      for (const reversed of [false, true]) {
        const input = corner(fixture.theta, 0, reversed, !reversed);
        input.constraints = input.points.map((item) => ({
          id: `fixed-${item.id}`,
          type: "fix",
          pointId: item.id,
          x: item.x,
          y: item.y,
        }));
        const plan = changed(input, {
          mode: "angle",
          distance: 6,
          angle: fixture.initial,
        });
        const solved = accepted(plan.profile);
        expect(solved.degreesOfFreedom).toBe(0);
        const edited = structuredClone(solved.profile);
        const angle = edited.constraints.find(
          (item) =>
            plan.createdConstraintIds.includes(item.id) &&
            item.type === "angle",
        )!;
        setValue(edited, angle.id, fixture.edited);
        const next = accepted(edited),
          [a, b] = endpoints(next.profile, plan.chamferEntityId!);
        expect(a.x).toBeCloseTo(6, 6);
        expect(a.y).toBeCloseTo(0, 6);
        expect(b.x).toBeCloseTo(
          (Math.abs(fixture.theta) === 60 ? 0.5 : -0.5) *
            fixture.secondDistance,
          6,
        );
        expect(b.y).toBeCloseTo(
          ((Math.sign(fixture.theta) * Math.sqrt(3)) / 2) *
            fixture.secondDistance,
          6,
        );
        expect(next.redundantConstraintIds).toEqual([]);
      }
    },
  );

  it("keeps a fixed translated virtual corner and its unselected neighbor during dimension edits", () => {
    const input = definedCorner();
    input.points.forEach((item) => {
      item.x += 17;
      item.y -= 23;
    });
    input.points.push(point("vertex", 17, -23), point("neighbor", 7, -33));
    for (const entity of input.entities) {
      if (entity.type !== "line") continue;
      if (entity.start === "origin") entity.start = "vertex";
      if (entity.end === "origin") entity.end = "vertex";
    }
    input.entities.push(line("third", "vertex", "neighbor"));
    input.constraints.push(
      { id: "fixed-vertex", type: "fix", pointId: "vertex", x: 17, y: -23 },
      { id: "fixed-neighbor", type: "fix", pointId: "neighbor", x: 7, y: -33 },
    );
    const plan = changed(input, { mode: "equal", distance: 5 });
    const edited = structuredClone(accepted(plan.profile).profile);
    const setback = edited.constraints.find(
      (item) =>
        plan.createdConstraintIds.includes(item.id) && item.type === "length",
    )!;
    setValue(edited, setback.id, 8);
    const solved = accepted(edited),
      [a, b] = endpoints(solved.profile, plan.chamferEntityId!);
    expectXY(a, 25, -23);
    expectXY(b, 17, -15);
    expectXY(getPoint(solved.profile, "vertex"), 17, -23);
    expectXY(getPoint(solved.profile, "neighbor"), 7, -33);
    expect(getLine(solved.profile, "third")).toEqual(input.entities[2]);
    expect(solved.drivenValues.reading).toBeCloseTo(32, 6);
    expect(solved.degreesOfFreedom).toBe(0);
  });

  it("does not solve stale inputs, allocate UUIDs or mutate frozen input", () => {
    const input = definedCorner();
    setValue(input, "original-first-length", 80);
    input.points.forEach(Object.freeze);
    input.entities.forEach(Object.freeze);
    input.constraints.forEach(Object.freeze);
    Object.freeze(input.points);
    Object.freeze(input.entities);
    Object.freeze(input.constraints);
    Object.freeze(input);
    const uuid = vi.spyOn(crypto, "randomUUID");
    try {
      const a = changed(input, { mode: "equal", distance: 5 }),
        b = changed(input, { mode: "equal", distance: 5 });
      expect(a).toEqual(b);
      expect(uuid).not.toHaveBeenCalled();
      expectXY(getPoint(a.profile, "a"), 40, 0);
      expect(getPoint(a.profile, "a")).not.toBe(input.points[0]);
    } finally {
      uuid.mockRestore();
    }
  });

  it("allocates globally unique bounded IDs even when all generated prefixes already exist", () => {
    const input = corner();
    input.points.push(
      point("chamfer-point-1", 200, 100),
      point("chamfer-support-1", 200, 110),
      point("chamfer-edge-1", 200, 120),
    );
    input.entities.push(
      line(
        "chamfer-constraint-1",
        "chamfer-point-1",
        "chamfer-support-1",
        true,
      ),
    );
    const result = changed(input, { mode: "equal", distance: 3 });
    const ids = [
      ...result.profile.points,
      ...result.profile.entities,
      ...result.profile.constraints,
    ].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length <= 128)).toBe(true);
  });

  it.each([
    { mode: "equal", distance: 0 },
    { mode: "equal", distance: -1 },
    { mode: "equal", distance: Number.NaN },
    { mode: "equal", distance: Infinity },
    { mode: "equal", distance: 100001 },
    { mode: "equal", distance: 30 },
    { mode: "distances", distance1: 40, distance2: 1 },
    { mode: "distances", distance1: 1, distance2: 30 },
    { mode: "angle", distance: 3, angle: 0 },
    { mode: "angle", distance: 3, angle: 90 },
    { mode: "angle", distance: 3, angle: Number.NaN },
    { mode: "angle", distance: 25, angle: 80 },
  ] as ChamferParameters[])(
    "rejects invalid or excessive parameters atomically: %j",
    (parameters) => {
      const input = corner(),
        original = structuredClone(input),
        result = planSketchChamfer(input, pair, parameters);
      expect(result.changed).toBe(false);
      expect(result.profile).toBe(input);
      expect(result.sourceProfile).toBe(input);
      expect(result.chamferEntityId).toBeNull();
      expect(result.affectedEntityIds).toEqual([]);
      expect(result.createdEntityIds).toEqual([]);
      expect(result.createdConstraintIds).toEqual([]);
      expect(result.convertedConstraintIds).toEqual([]);
      expect(result.message.length).toBeGreaterThan(0);
      expect(input).toEqual(original);
    },
  );

  it.each([0, 180])("rejects collinear corner angle %s", (theta) => {
    expect(
      planSketchChamfer(corner(theta), pair, { mode: "equal", distance: 3 })
        .changed,
    ).toBe(false);
  });

  it("rejects sub-solver-length remnants and chamfers atomically", () => {
    const input = corner();
    expect(
      planSketchChamfer(input, pair, { mode: "equal", distance: 30 - 5e-7 })
        .changed,
    ).toBe(false);
    expect(
      planSketchChamfer(corner(0.001), pair, { mode: "equal", distance: 0.01 })
        .changed,
    ).toBe(false);
    const small = changed(input, { mode: "equal", distance: 30 - 2e-6 });
    accepted(small.profile);
    expect(input.points).toEqual(corner().points);
  });

  it("rejects non-endpoint crossings, duplicate selection, circles and invalid references", () => {
    const input = corner();
    expect(
      planSketchChamfer(input, [pair[0], pair[0]], {
        mode: "equal",
        distance: 3,
      }).changed,
    ).toBe(false);
    expect(
      planSketchChamfer(input, [], { mode: "equal", distance: 3 }).changed,
    ).toBe(false);
    const crossed = structuredClone(input);
    crossed.points.push(point("left", -10, 0), point("down", 0, -10));
    (crossed.entities[0] as Extract<SketchEntity, { type: "line" }>).start =
      "left";
    (crossed.entities[1] as Extract<SketchEntity, { type: "line" }>).start =
      "down";
    expect(
      planSketchChamfer(crossed, pair, { mode: "equal", distance: 3 }).changed,
    ).toBe(false);
    const circular = structuredClone(input);
    circular.entities[1] = {
      id: "second",
      type: "circle",
      center: "origin",
      radius: 10,
      construction: false,
    };
    expect(
      planSketchChamfer(circular, pair, { mode: "equal", distance: 3 }).changed,
    ).toBe(false);
    const invalid = structuredClone(input);
    invalid.points[0].x = Number.NaN;
    expect(
      planSketchChamfer(invalid, pair, { mode: "equal", distance: 3 }).profile,
    ).toBe(invalid);
    (invalid.entities[0] as Extract<SketchEntity, { type: "line" }>).end =
      "missing";
    invalid.points[0].x = 40;
    expect(
      planSketchChamfer(invalid, pair, { mode: "equal", distance: 3 }).changed,
    ).toBe(false);
  });

  it.each(["points", "entities", "constraints"] as const)(
    "rolls back when the %s file limit would be exceeded",
    (kind) => {
      const input = corner();
      if (kind === "points")
        for (let i = input.points.length; i < 128; i++)
          input.points.push(point(`extra-${i}`, i, 100));
      if (kind === "entities")
        for (let i = input.entities.length; i < 128; i++)
          input.entities.push(line(`extra-${i}`, "a", "b", true));
      if (kind === "constraints")
        for (let i = 0; i < 256; i++)
          input.constraints.push({
            id: `extra-${i}`,
            type: "horizontal",
            entityId: "first",
          });
      const original = structuredClone(input),
        result = planSketchChamfer(input, pair, { mode: "equal", distance: 3 });
      expect(result.changed).toBe(false);
      expect(result.profile).toBe(input);
      expect(input).toEqual(original);
    },
  );
});
