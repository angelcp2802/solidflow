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
  it("shows which source extends and draws the retained arc from its new tangent contact", () => {
    const profile: EntityProfile = {
      kind: "entities",
      points: [
        { id: "line-start", x: 10, y: 0 }, { id: "line-end", x: 30, y: 0 },
        { id: "arc-start", x: 5 * Math.sqrt(3), y: 5 }, { id: "arc-end", x: 0, y: 10 },
      ],
      entities: [
        { id: "line", type: "line", start: "line-start", end: "line-end", construction: false },
        { id: "arc", type: "arc", center: "origin", start: "arc-start", end: "arc-end", clockwise: false, construction: false },
      ],
      constraints: [],
    };
    const solution = solveSketch(profile);
    const selection: SketchSelection[] = [{ kind: "entity", id: "line" }, { kind: "entity", id: "arc" }];
    const plan = planSketchFillet(solution.profile, selection, { radius: 2, cornerPolicy: "keep" });
    expect(plan.changed, plan.message).toBe(true);
    const retained = plan.profile.entities.find(entity => entity.id === "arc");
    if (retained?.type !== "arc") throw new Error("Expected retained source arc");
    const contact = plan.profile.points.find(point => point.id === retained.start)!;
    expect(contact.x).toBeCloseTo(5 * Math.sqrt(35) / 3, 7);
    expect(contact.y).toBeCloseTo(5 / 3, 7);
    expect(retained.end).toBe("arc-end");
    const panel = renderToStaticMarkup(<SketchFilletPanel profile={profile} solution={solution}
      selection={selection} previousFilletId={null} onSelection={noop} onApply={noop} onCancel={noop} onPreview={noop} />);
    expect(panel).toContain('aria-label="Cambios en los tramos"');
    expect(panel).toContain("A · Línea 1: recorta");
    expect(panel).toContain("B · Arco 2: prolonga");
    const canvas = renderToStaticMarkup(<SketchCanvas profile={profile} solution={solution} selection={selection}
      tool="fillet" plane="XY" fitStamp={0} filletPreview={plan} onSelection={noop} onChange={noop} />);
    expect(canvas).toContain('data-fillet-preview="true"');
    expect(canvas.match(/data-fillet-segment="trimmed"/g)).toHaveLength(2);
    expect(canvas).toMatch(/data-fillet-segment="fillet" d="M[^\"]+A/);
  });
  it("keeps tied geometric branches selectable while blocking an ambiguous application", () => {
    const profile: EntityProfile = {
      kind: "entities",
      points: [
        { id: "left", x: -30, y: 0 }, { id: "right", x: 30, y: 0 },
        { id: "top", x: 0, y: 10 }, { id: "bottom", x: 0, y: -10 },
      ],
      entities: [
        { id: "line", type: "line", start: "left", end: "right", construction: false },
        { id: "arc", type: "arc", center: "origin", start: "top", end: "bottom", clockwise: false, construction: false },
      ],
      constraints: [],
    };
    const solution = solveSketch(profile);
    const selection: SketchSelection[] = [{ kind: "entity", id: "line" }, { kind: "entity", id: "arc" }];
    const plan = planSketchFillet(solution.profile, selection, { radius: 2, cornerPolicy: "keep" });
    expect(plan.changed).toBe(false);
    expect(plan.candidates.length).toBeGreaterThan(1);
    const html = renderToStaticMarkup(<SketchFilletPanel profile={profile} solution={solution}
      selection={selection} previousFilletId={null} onSelection={noop} onApply={noop} onCancel={noop} onPreview={noop} />);
    expect(html).toContain("Elige una solución disponible");
    expect(html).toContain("mismo desplazamiento");
    expect(html).toContain('aria-label="Solución geométrica"');
    expect(html).toMatch(/aria-label="Aplicar redondeo" disabled/);
    expect(html).not.toContain('aria-label="Cambios en los tramos"');
  });
});
