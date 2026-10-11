import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createMeasuredPlateDocument } from "../examples/driven-dimensions";
import { solveSketch } from "../sketch/solver";
import EntitySketchPanel from "./EntitySketchPanel";
import SketchCanvas from "./SketchCanvas";

function fixture() {
  const sketch = createMeasuredPlateDocument().features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities")
    throw new Error("Entity sketch expected");
  return sketch.profile;
}

it("renders a solved driven length as output and never exposes its obsolete cache as an editable target", () => {
  const profile = fixture();
  const note = profile.constraints.find((c) => c.id === "measured-closing")!;
  if (!("value" in note)) throw new Error("Dimension expected");
  note.value = 999;
  const solution = solveSketch(profile);
  expect(solution.status).toBe("fullyDefined");
  const html = renderToStaticMarkup(
    createElement(EntitySketchPanel, {
      profile: solution.profile,
      selection: [{ kind: "constraint", id: note.id }],
      onChange() {},
      onSelection() {},
      solution,
      focusSection: { name: "dimensions", stamp: 0 },
    }),
  );
  expect(html).toContain('aria-label="Medida de cota conducida"');
  expect(html).toContain("52.915");
  expect(html).toContain("conducida = (");
  expect(html).not.toContain('aria-label="Valor de la cota seleccionada"');
  expect(html).not.toContain("999");
});

it("shows no old driven measurement when the sketch is inconsistent", () => {
  const profile = fixture();
  profile.constraints.push({
    id: "impossible-closing",
    type: "length",
    entityId: "closing",
    value: 10,
  });
  const solution = solveSketch(profile);
  expect(solution.status).toBe("inconsistent");
  expect(solution.drivenValues["measured-closing"]).toBeNull();
  const html = renderToStaticMarkup(
    createElement(EntitySketchPanel, {
      profile,
      selection: [{ kind: "constraint", id: "measured-closing" }],
      onChange() {},
      onSelection() {},
      solution,
      focusSection: { name: "dimensions", stamp: 0 },
    }),
  );
  expect(html).toContain("conducida = (— mm)");
  expect(html).not.toContain("52.915");
});

it("renders the actual reflex angle and its driven mode in the sketch and accessible label", () => {
  const profile = fixture();
  const note = profile.constraints.find((c) => c.id === "measured-reflex")!;
  if (note.type !== "angle") throw new Error("Angular annotation expected");
  note.value = 1;
  const solution = solveSketch(profile);
  const html = renderToStaticMarkup(
    createElement(SketchCanvas, {
      profile: solution.profile,
      onChange() {},
      tool: "select",
      plane: "XY",
      selection: [],
      onSelection() {},
      solution,
      fitStamp: 0,
    }),
  );
  expect(html).toContain('aria-label="Cota conducida angle (300°) grados"');
  expect(html).toContain(">(300°)</text>");
  expect(html).not.toContain(">(1°)</text>");
});

it("uses the solved geometry for the canvas and panel when a reopened document retains old point coordinates", () => {
  const profile = fixture();
  const angle = profile.constraints.find((c) => c.id === "included-angle");
  if (angle?.type !== "angle") throw new Error("Driving angle expected");
  angle.value = 35;
  // Source points still describe 60°. Only the driving parameter was edited.
  const solution = solveSketch(profile);
  expect(solution.status).toBe("fullyDefined");
  const canvas = renderToStaticMarkup(
    createElement(SketchCanvas, {
      profile,
      onChange() {},
      tool: "select",
      plane: "XY",
      selection: [],
      onSelection() {},
      solution,
      fitStamp: 0,
    }),
  );
  expect(canvas).toContain('aria-label="Punto 32.77, 22.94"');
  expect(canvas).not.toContain('aria-label="Punto 20.00, 34.64"');
  expect(canvas).toContain('aria-label="Cota conducida angle (325°) grados"');
  const panel = renderToStaticMarkup(
    createElement(EntitySketchPanel, {
      profile,
      selection: [{ kind: "constraint", id: "measured-closing" }],
      onChange() {},
      onSelection() {},
      solution,
      focusSection: { name: "dimensions", stamp: 0 },
    }),
  );
  expect(panel).toContain("32.77");
  expect(panel).toContain("22.94");
  expect(panel).not.toContain("34.64");
});
