import { describe, expect, it } from "vitest";
import type { SketchFeature } from "../cad/kernel.types";
import type { EntityProfile } from "../sketch/types";
import { solveSketch } from "../sketch/solver";
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature } from "./document";

// Original synthetic point-reflection fixture; units are mm, no external assets.
function sketch(): SketchFeature {
  return {
    id: "sketch", name: "Symmetry", type: "sketch", suppressed: false, plane: "XY", offset: 0,
    profile: {
      kind: "entities",
      points: [{ id: "end", x: 0, y: 10 }, { id: "a", x: 3, y: 2 }, { id: "b", x: -3, y: 2 }],
      entities: [{ id: "axis", type: "line", start: "origin", end: "end", construction: true }],
      constraints: [
        { id: "axis-fix", type: "fix", pointId: "end", x: 0, y: 10 },
        { id: "source-fix", type: "fix", pointId: "a", x: 3, y: 2 },
        { id: "reflection", type: "symmetric", a: "a", b: "b", axisId: "axis" },
      ],
    },
  };
}
const getProfile = (document: ReturnType<typeof createDocument>): EntityProfile => {
  const first = document.features[0];
  if (first.type !== "sketch" || first.profile.kind !== "entities") throw new Error("Expected entity sketch");
  return first.profile;
};

describe("version 1 point reflection persistence", () => {
  it("round trips exact constraint fields and stable point/axis identities without a version migration", () => {
    const document = addFeature(createDocument(), sketch());
    const reopened = parseDocument(serializeDocument(document));
    expect(reopened).toEqual(document);
    expect(reopened.version).toBe(1);
    expect(getProfile(reopened).constraints.find(c => c.type === "symmetric")).toEqual(
      { id: "reflection", type: "symmetric", a: "a", b: "b", axisId: "axis" },
    );
    expect(solveSketch(getProfile(reopened)).status).toBe("fullyDefined");
  });

  it.each([
    { kind: "rectangle", center: [0, 0], width: 10, height: 6 },
    { kind: "circle", center: [4, 3], radius: 2 },
    { kind: "entities", points: [], entities: [], constraints: [] },
  ] as SketchFeature["profile"][])("preserves an existing v1 %s profile without added metadata", profile => {
    const document = addFeature(createDocument(), { ...sketch(), profile });
    expect(parseDocument(serializeDocument(document))).toEqual(document);
    expect((document.features[0] as SketchFeature).profile).toEqual(profile);
  });

  it("reopens an edit and continues propagating source dimensions to the same image point", () => {
    const document = addFeature(createDocument(), sketch());
    const reopened = parseDocument(serializeDocument(document));
    const input = getProfile(reopened);
    const fix = input.constraints.find(c => c.id === "source-fix")!;
    if (fix.type === "fix") [fix.x, fix.y] = [7, -3];
    const solved = solveSketch(input);
    expect(solved.status, solved.message).toBe("fullyDefined");
    const edited = updateFeature(reopened, "sketch", { profile: solved.profile });
    const twice = parseDocument(serializeDocument(edited));
    expect(getProfile(twice).points.find(p => p.id === "b")).toMatchObject({ x: expect.closeTo(-7, 6), y: expect.closeTo(-3, 6) });
    expect(getProfile(twice).constraints.find(c => c.id === "reflection")).toEqual(input.constraints.find(c => c.id === "reflection"));
  });

  it("stores associations in detached undo/redo snapshots and discards the edited future branch", () => {
    const before = addFeature(createDocument(), sketch());
    const history = new DocumentHistory(before);
    const input = getProfile(history.current);
    const fix = input.constraints.find(c => c.id === "source-fix")!;
    if (fix.type === "fix") fix.x = 5;
    const solved = solveSketch(input);
    expect(solved.status, solved.message).toBe("fullyDefined");
    const after = updateFeature(before, "sketch", { profile: solved.profile });
    history.apply(after);
    getProfile(after).points[0].y = 99;
    expect(history.undo()).toEqual(before);
    expect(getProfile(history.redo()).points.find(p => p.id === "b")!.x).toBeCloseTo(-5, 6);
    history.undo();
    history.apply(updateFeature(before, "sketch", { name: "Other branch" }));
    expect(history.canRedo).toBe(false);
    expect(getProfile(history.current).constraints.some(c => c.type === "symmetric")).toBe(true);
  });

  it("rejects unknown constraint types and dangling axes explicitly rather than dropping relations", () => {
    const document = addFeature(createDocument(), sketch());
    const unknown = JSON.parse(serializeDocument(document));
    unknown.features[0].profile.constraints[2].type = "futureReflection";
    expect(() => parseDocument(JSON.stringify(unknown))).toThrow("desconocido");
    const dangling = JSON.parse(serializeDocument(document));
    dangling.features[0].profile.constraints[2].axisId = "missing";
    expect(() => parseDocument(JSON.stringify(dangling))).toThrow("axisId");
  });
});
