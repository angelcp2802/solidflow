import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SketchMirrorPanel from "./SketchMirrorPanel";
import SketchCanvas from "./SketchCanvas";
import { createSketchMirrorDocument } from "../examples/sketch-mirror";
import { planSketchMirror } from "../sketch/mirror";
import { solveSketch } from "../sketch/solver";
import type { SketchSelection } from "../sketch/types";
const noop = () => {};
function setup() {
  const sketch = createSketchMirrorDocument().features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities") throw new Error("Expected sketch");
  const profile = sketch.profile, solution = solveSketch(profile);
  const selection: SketchSelection[] = ["bottom", "right", "top"].map(id => ({ kind: "entity", id }));
  return { profile, solution, selection, axisEntityId: "axis", pickingAxis: false,
    onAxisChange: noop, onPickAxis: noop, onSelection: noop, onPreview: noop, onApply: noop, onCancel: noop };
}
describe("mirror controls and combined rendered preview", () => {
  it("offers distinct source/axis selection and explicit seam sharing", () => {
    const html = renderToStaticMarkup(<SketchMirrorPanel {...setup()} />);
    expect(html).toContain('aria-label="Eje de simetría"');
    expect(html).toContain('aria-label="Entidades para simetría"');
    expect(html).toContain("Compartir puntos fuente sobre el eje");
    expect(html).toContain("3 copias · 2 puntos compartidos");
    expect(html).toMatch(/aria-label="Aplicar simetría"(?! disabled)/);
  });
  it("blocks missing-axis and unhealthy proposals", () => {
    const props = setup();
    const html = renderToStaticMarkup(<SketchMirrorPanel {...props} axisEntityId="" />);
    expect(html).toMatch(/aria-label="Aplicar simetría" disabled/);
    expect(html).toContain("Elige el eje de simetría.");
    const unhealthy = renderToStaticMarkup(<SketchMirrorPanel {...props} solution={{ ...props.solution, status: "inconsistent" }} />);
    expect(unhealthy).toMatch(/aria-label="Aplicar simetría" disabled/);
    expect(unhealthy).toContain("Resuelve un croquis válido");
  });
  it("shows all image segments without modifying displayed source entities", () => {
    const props = setup(), plan = planSketchMirror(props.solution.profile, props.selection, { axisEntityId: "axis", joinPointIds: ["origin", "top-seam"] });
    expect(plan.changed, plan.message).toBe(true);
    const html = renderToStaticMarkup(<SketchCanvas {...props} tool="mirror" plane="XY" fitStamp={0}
      mirrorAxisEntityId="axis" mirrorPreview={plan} onChange={noop} />);
    expect(html.match(/data-mirror-image=/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Vista previa de simetría"');
    expect(html).toContain('data-selection-id="bottom"');
  });
  it("does not render stale geometry and explains axis picking", () => {
    const props = setup(), plan = planSketchMirror(structuredClone(props.solution.profile), props.selection, { axisEntityId: "axis" });
    const html = renderToStaticMarkup(<SketchCanvas {...props} tool="mirror" plane="XY" fitStamp={0}
      mirrorPickingAxis mirrorPreview={plan} onChange={noop} />);
    expect(html).not.toContain('data-mirror-preview="true"');
    expect(html).toContain("Simetría: selecciona una línea como eje");
  });
});
