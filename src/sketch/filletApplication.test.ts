import { describe, expect, it, vi } from "vitest";
import { createFilletBatchDocument } from "../examples/sketch-fillet-batch";
import { planSketchFilletBatch } from "./fillet";
import { solveFilletApplication } from "./filletApplication";
import { solveSketch } from "./solver";
import type { EntityProfile } from "./types";

function setup() {
  const sketch = createFilletBatchDocument().features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities") throw new Error("Expected entity sketch");
  const current = solveSketch(sketch.profile);
  const plan = planSketchFilletBatch(current.profile, [
    { kind: "point", id: "origin" }, { kind: "point", id: "bottom-right" },
  ], { radius: 2, cornerPolicy: "keep", radiusMode: "linked" });
  expect(plan.changed, plan.message).toBe(true);
  return { current, plan };
}

describe("atomic fillet application boundary", () => {
  it("solves the complete displayed proposal once and returns both tangent arcs", () => {
    const { current, plan } = setup();
    const snapshot = structuredClone(current);
    const solver = vi.fn(solveSketch);
    const result = solveFilletApplication(current, plan, solver);
    expect(result.accepted).toBe(true);
    expect(solver).toHaveBeenCalledExactlyOnceWith(plan.profile);
    if (!result.accepted) throw new Error(result.message);
    expect(result.solution.profile.entities.filter(entity => entity.type === "arc")).toHaveLength(2);
    expect(current).toEqual(snapshot);
  });

  it("rejects stale and unhealthy displayed sources without invoking the solver", () => {
    const { current, plan } = setup();
    const solver = vi.fn(solveSketch);
    expect(solveFilletApplication({ ...current, profile: structuredClone(current.profile) }, plan, solver).accepted).toBe(false);
    expect(solveFilletApplication({ ...current, status: "inconsistent" }, plan, solver).accepted).toBe(false);
    expect(solveFilletApplication(null, plan, solver).accepted).toBe(false);
    expect(solver).not.toHaveBeenCalled();
  });

  it("returns no accepted prefix after a complete solver failure", () => {
    const { current, plan } = setup();
    const snapshot = structuredClone(current.profile);
    const solver = vi.fn(() => ({ ...current, status: "notConverged" as const, message: "Synthetic conflict" }));
    const result = solveFilletApplication(current, plan, solver);
    expect(result).toEqual({ accepted: false, message: "No se puede aplicar el redondeo: Synthetic conflict" });
    expect(solver).toHaveBeenCalledTimes(1);
    expect(current.profile).toEqual(snapshot);
  });

  it("rejects a real conflicting retained-edge equality without changing the displayed source", () => {
    const sketch = createFilletBatchDocument().features[0];
    if (sketch.type !== "sketch" || sketch.profile.kind !== "entities") throw new Error("Expected sketch");
    sketch.profile.constraints.push({ id: "opposite-equal", type: "equal", a: "bottom", b: "top" });
    const current = solveSketch(sketch.profile);
    expect(current.status).toBe("fullyDefined");
    const plan = planSketchFilletBatch(current.profile, [
      { kind: "point", id: "origin" }, { kind: "point", id: "bottom-right" },
    ], { radius: 2, cornerPolicy: "keep", radiusMode: "linked" });
    expect(plan.changed, plan.message).toBe(true);
    const snapshot = structuredClone(current);
    const solver = vi.fn(solveSketch);
    const result = solveFilletApplication(current, plan, solver);
    expect(result.accepted).toBe(false);
    expect(solver).toHaveBeenCalledTimes(1);
    expect(current).toEqual(snapshot);
  });

  it("rejects a solver result which reverses the shared retained source", () => {
    const { current, plan } = setup();
    const profile: EntityProfile = structuredClone(plan.profile);
    const bottom = profile.entities.find(entity => entity.id === "bottom");
    if (bottom?.type !== "line") throw new Error("Expected shared bottom edge");
    const start = profile.points.find(point => point.id === bottom.start)!;
    const end = profile.points.find(point => point.id === bottom.end)!;
    [start.x, end.x] = [end.x, start.x];
    const solver = vi.fn(() => ({ ...current, profile }));
    expect(solveFilletApplication(current, plan, solver).accepted).toBe(false);
    expect(solver).toHaveBeenCalledTimes(1);
  });
});
