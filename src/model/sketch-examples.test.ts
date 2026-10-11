import { describe, expect, it } from "vitest";
import { createConstrainedPlateDocument } from "./sketch-examples";
import { parseDocument, serializeDocument } from "./document";
import { solveSketch } from "../sketch/solver";

describe("deliverable constrained plate", () => {
  it("reopens fully constrained and moving the width keeps each hole offset from its corner", () => {
    const document = parseDocument(
      serializeDocument(createConstrainedPlateDocument()),
    );
    const sketch = document.features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
      throw new Error("Expected entity sketch");
    expect(solveSketch(sketch.profile).degreesOfFreedom).toBe(0);
    const width = sketch.profile.constraints.find(
      (constraint) => constraint.id === "width",
    )!;
    if (!("value" in width)) throw new Error("Expected driving dimension");
    width.value = 120;
    const solved = solveSketch(sketch.profile);
    expect(solved.status).toBe("fullyDefined");
    expect(
      solved.profile.points.find((point) => point.id === "p1")!.x,
    ).toBeCloseTo(70, 6);
    expect(
      solved.profile.points.find((point) => point.id === "h1")!.x,
    ).toBeCloseTo(55, 6);
    expect(
      solved.profile.points.find((point) => point.id === "h0")!.x,
    ).toBeCloseTo(-35, 6);
  });
});
