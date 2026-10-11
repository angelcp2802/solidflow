import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SketchFilletPanel from "./SketchFilletPanel";
import SketchCanvas from "./SketchCanvas";
import { createFilletSketchDocument } from "../examples/sketch-fillet";
import { planSketchFillet } from "../sketch/fillet";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile, SketchSelection } from "../sketch/types";

function setup() {
  const feature = createFilletSketchDocument().features[0];
  if (feature.type !== "sketch" || feature.profile.kind !== "entities") throw new Error("Expected entity sketch");
  const profile = feature.profile;
  const solution = solveSketch(profile);
  const selection: SketchSelection[] = [{ kind: "point", id: "origin" }];
  return { profile, solution, selection };
}
const noop = () => undefined;
describe("sketch fillet rendering", () => {
  it("offers radius, corner policy, consecutive radii, candidate choice and an applicable preview", () => {
    const source = setup();
    const html = renderToStaticMarkup(<SketchFilletPanel {...source} previousFilletId={null}
      onSelection={noop} onApply={noop} onCancel={noop} onPreview={noop} />);
    expect(html).toContain('aria-label="Radio del redondeo"');
    expect(html).toContain('aria-label="Esquina original"');
    expect(html).toContain("Enlazar redondeos consecutivos");
    expect(html).toContain('aria-label="Solución geométrica"');
    expect(html).toMatch(/aria-label="Aplicar redondeo"(?! disabled)/);
  });
  it("blocks an unhealthy source and exposes its diagnosis", () => {
    const source = setup();
    const html = renderToStaticMarkup(<SketchFilletPanel {...source}
      solution={{ ...source.solution, status: "inconsistent" }} previousFilletId={null}
      onSelection={noop} onApply={noop} onCancel={noop} onPreview={noop} />);
    expect(html).toContain("Resuelve un croquis válido");
    expect(html).toMatch(/aria-label="Aplicar redondeo" disabled/);
  });
  it("rejects a missing consecutive radius reference explicitly", () => {
    const source = setup();
    const html = renderToStaticMarkup(<SketchFilletPanel {...source} previousFilletId="removed-arc"
      onSelection={noop} onApply={noop} onCancel={noop} onPreview={noop} />);
    expect(html).toContain("El radio de referencia ya no está disponible");
    expect(html).toMatch(/aria-label="Aplicar redondeo" disabled/);
  });
  it("draws the actual planned tangent arc and replacement segments without new hit targets", () => {
    const source = setup();
    const plan = planSketchFillet(source.solution.profile, source.selection, { radius: 2, cornerPolicy: "keep" });
    expect(plan.changed, plan.message).toBe(true);
    const html = renderToStaticMarkup(<SketchCanvas {...source} tool="fillet" plane="XY" fitStamp={0}
      filletPreview={plan} onSelection={noop} onChange={noop} />);
    expect(html).toContain('data-fillet-preview="true"');
    expect(html).toMatch(/data-fillet-segment="fillet" d="M[^\"]+A/);
    expect(html.match(/data-fillet-segment="trimmed"/g)).toHaveLength(2);
    expect(html).toContain('pointer-events="none"');
  });
  it("hides a plan after the solved source reference changes", () => {
    const source = setup();
    const plan = planSketchFillet(source.solution.profile, source.selection, { radius: 2, cornerPolicy: "keep" });
    const updated = solveSketch(structuredClone(source.profile) as EntityProfile);
    const html = renderToStaticMarkup(<SketchCanvas {...source} solution={updated} tool="fillet" plane="XY" fitStamp={0}
      filletPreview={plan} onSelection={noop} onChange={noop} />);
    expect(html).not.toContain('data-fillet-preview="true"');
  });
});
