import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { planSketchChamfer } from "../sketch/chamfer";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile, SketchSelection, SketchSolveResult } from "../sketch/types";
import SketchChamferPanel from "./SketchChamferPanel";
import SketchCanvas from "./SketchCanvas";

function rectangle(): EntityProfile {
  return {
    kind: "entities",
    points: [
      { id: "corner", x: 10, y: 0 },
      { id: "top-right", x: 10, y: 6 },
      { id: "top-left", x: 0, y: 6 },
    ],
    entities: [
      { id: "bottom", type: "line", start: "origin", end: "corner", construction: false },
      { id: "right", type: "line", start: "corner", end: "top-right", construction: false },
      { id: "top", type: "line", start: "top-right", end: "top-left", construction: false },
      { id: "left", type: "line", start: "top-left", end: "origin", construction: false },
    ],
    constraints: [
      { id: "h-bottom", type: "horizontal", entityId: "bottom" },
      { id: "v-right", type: "vertical", entityId: "right" },
      { id: "h-top", type: "horizontal", entityId: "top" },
      { id: "v-left", type: "vertical", entityId: "left" },
      { id: "width", type: "length", entityId: "bottom", value: 10 },
      { id: "height", type: "length", entityId: "right", value: 6 },
    ],
  };
}
const pair: SketchSelection[] = [
  { kind: "entity", id: "bottom" },
  { kind: "entity", id: "right" },
];
const noop = () => {};
function panel(profile: EntityProfile, solution: SketchSolveResult | null, selection = pair) {
  return renderToStaticMarkup(createElement(SketchChamferPanel, {
    profile, solution, selection,
    onSelection: noop, onApply: noop, onCancel: noop, onPreview: noop,
  }));
}
function applyControl(html: string): string {
  const control = html.match(/<button\b[^>]*aria-label="Aplicar chaflán"[^>]*>/)?.[0];
  expect(control).toBeDefined();
  return control!;
}

it("enables applying a valid solved corner and exposes ordered selection and preview status", () => {
  const profile = rectangle();
  const solution = solveSketch(profile);
  expect(solution.status).toBe("fullyDefined");
  const html = panel(profile, solution);
  expect(applyControl(html)).not.toContain("disabled");
  expect(html).toContain('aria-label="Orden de las líneas del chaflán"');
  expect(html).toContain('aria-label="Quitar línea A"');
  expect(html).toContain('aria-label="Quitar línea B"');
  expect(html).toContain('aria-live="polite"');
  expect(html).not.toContain('role="alert"');
});

it("blocks the command for an inconsistent solver result rather than planning from retained coordinates", () => {
  const profile = rectangle();
  profile.constraints.push({ id: "conflict", type: "length", entityId: "bottom", value: 11 });
  const solution = solveSketch(profile);
  expect(solution.status).toBe("inconsistent");
  const html = panel(profile, solution);
  expect(applyControl(html)).toContain("disabled");
  expect(html).toContain('role="alert"');
  expect(applyControl(panel(rectangle(), null))).toContain("disabled");
});

it("blocks an incomplete line selection and provides an accessible error", () => {
  const profile = rectangle();
  const html = panel(profile, solveSketch(profile), [pair[0]]);
  expect(applyControl(html)).toContain("disabled");
  expect(html).toContain('role="alert"');
});

it("renders the two shortened lines and actual diagonal without adding preview entities to the hit targets", () => {
  const source = rectangle();
  const solution = solveSketch(source);
  const plan = planSketchChamfer(solution.profile, pair, { mode: "equal", distance: 2 });
  expect(plan.changed, plan.message).toBe(true);
  const html = renderToStaticMarkup(createElement(SketchCanvas, {
    profile: source, solution, selection: pair, onSelection: noop, onChange: noop,
    tool: "chamfer", plane: "XY", fitStamp: 0, chamferPreview: plan,
  }));
  expect(html).toContain('data-chamfer-preview="true" pointer-events="none"');
  expect(html.match(/data-chamfer-segment="trimmed-line"/g)).toHaveLength(2);
  expect(html.match(/data-chamfer-segment="chamfer"/g)).toHaveLength(1);
  // The SSR view has scale 3 and screen origin (0.5, 0.5). A 2×2 cut joins
  // (8,0) to (10,2); these coordinates are independent of the planner's output.
  expect(html).toMatch(/data-chamfer-segment="chamfer" d="M24\.5 0\.5L30\.5 -5\.5"/);
  expect(html).toContain('data-selection-id="bottom"');
  expect(html).toContain('data-selection-id="right"');
  for (const id of plan.createdEntityIds)
    expect(html).not.toContain(`data-selection-id="${id}"`);
});

it("hides a plan captured before the displayed solution changed or after leaving the tool", () => {
  const source = rectangle();
  const initial = solveSketch(source);
  const stalePlan = planSketchChamfer(initial.profile, pair, { mode: "equal", distance: 2 });
  const next = structuredClone(source);
  const width = next.constraints.find(item => item.id === "width");
  if (width?.type !== "length") throw new Error("Driving width expected");
  width.value = 12;
  const current = solveSketch(next);
  for (const [solution, tool] of [[current, "chamfer"], [initial, "select"]] as const) {
    const html = renderToStaticMarkup(createElement(SketchCanvas, {
      profile: source, solution, selection: pair, onSelection: noop, onChange: noop,
      tool, plane: "XY", fitStamp: 0, chamferPreview: stalePlan,
    }));
    expect(html).not.toContain('data-chamfer-preview="true"');
  }
});
