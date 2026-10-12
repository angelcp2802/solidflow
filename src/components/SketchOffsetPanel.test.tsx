import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SketchOffsetPanel from "./SketchOffsetPanel";
import SketchCanvas from "./SketchCanvas";
import EntitySketchPanel from "./EntitySketchPanel";
import { createSketchOffsetDocument } from "../examples/sketch-offset";
import { planSketchOffset, type OffsetParameters } from "../sketch/offset";
import { solveSketch } from "../sketch/solver";
import type { EntityProfile, SketchSelection } from "../sketch/types";

const noop = () => {};
const options: OffsetParameters = { distance: 1, reverse: false, bothDirections: false,
  chain: true, cap: "none", construction: "none", addDimensions: true };
function setup(kind: "rectangle" | "circle" | "concave" = "rectangle") {
  const sketch = createSketchOffsetDocument(kind).features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities") throw new Error("Expected entity sketch");
  const profile = sketch.profile, solution = solveSketch(profile);
  const selection: SketchSelection[] = [{ kind: "entity", id: kind === "circle" ? "circle" : "edge-0" }];
  return { profile, solution, selection, onSelection: noop, onPreview: noop, onApply: noop, onCancel: noop };
}

describe("offset controls and server-rendered preview", () => {
  it("offers distance, connected selection, side, caps, construction and optional dimension controls", () => {
    const html = renderToStaticMarkup(<SketchOffsetPanel {...setup()} />);
    for (const text of ["Distancia de equidistancia", "Invertir dirección", "Ambas direcciones",
      "Seleccionar cadena conectada", "Cierre de extremos", "Geometría de construcción", "Añadir cota de distancia"])
      expect(html).toContain(text);
    expect(html).toContain("4 entidades fuente · 4 copias · 0 cierres");
    expect(html).toMatch(/aria-label="Aplicar equidistancia"(?! disabled)/);
  });

  it.each(["rectangle", "circle", "concave"] as const)("supplies a constrained original %s library example", kind => {
    const props = setup(kind);
    expect(props.solution.status).toBe("fullyDefined");
    const plan = planSketchOffset(props.solution.profile, props.selection, options);
    expect(plan.changed, plan.message).toBe(true);
    expect(plan.sourceEntityIds).toHaveLength(kind === "circle" ? 1 : kind === "rectangle" ? 4 : 6);
    expect(props.profile.constraints.some(constraint => constraint.type === "offset")).toBe(false);
  });

  it("blocks empty, non-entity and unhealthy selections", () => {
    const props = setup();
    const empty = renderToStaticMarkup(<SketchOffsetPanel {...props} selection={[]} />);
    expect(empty).toMatch(/aria-label="Aplicar equidistancia" disabled/);
    const point = renderToStaticMarkup(<SketchOffsetPanel {...props} selection={[{ kind: "point", id: "origin" }]} />);
    expect(point).toContain('role="alert"');
    expect(point).toMatch(/aria-label="Aplicar equidistancia" disabled/);
    const unhealthy = renderToStaticMarkup(<SketchOffsetPanel {...props} solution={{ ...props.solution, status: "inconsistent" }} />);
    expect(unhealthy).toContain("Resuelve un croquis válido");
    expect(unhealthy).toMatch(/aria-label="Aplicar equidistancia" disabled/);
  });

  it("renders every chain image and retains the selectable source", () => {
    const props = setup(), before = JSON.stringify(props.solution.profile);
    const plan = planSketchOffset(props.solution.profile, props.selection, options);
    expect(plan.changed, plan.message).toBe(true);
    const html = renderToStaticMarkup(<SketchCanvas {...props} tool="offset" plane="XY" fitStamp={0}
      offsetPreview={plan} onChange={noop} />);
    expect(html.match(/data-offset-image=/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Vista previa de equidistancia"');
    expect(html).toContain('data-selection-id="edge-0"');
    expect(JSON.stringify(props.solution.profile)).toBe(before);
  });

  it("renders a complete disconnected proposal and hides it after an ordered selection change", () => {
    const points = [{ id: "a-end", x: 10, y: 0 }, { id: "b-start", x: 20, y: 5 }, { id: "b-end", x: 30, y: 5 }];
    const profile: EntityProfile = { kind: "entities", points, entities: [
      { id: "a-line", type: "line", start: "origin", end: "a-end", construction: false },
      { id: "b-line", type: "line", start: "b-start", end: "b-end", construction: false },
    ], constraints: points.map(point => ({ id: `${point.id}-fix`, type: "fix" as const, pointId: point.id, x: point.x, y: point.y })) };
    const solution = solveSketch(profile), selection: SketchSelection[] = [
      { kind: "entity", id: "a-line" }, { kind: "entity", id: "b-line" },
    ];
    const props = { profile: solution.profile, solution, selection, onSelection: noop, onPreview: noop, onApply: noop, onCancel: noop };
    const plan = planSketchOffset(solution.profile, selection, options);
    expect(plan.changed, plan.message).toBe(true);
    const panel = renderToStaticMarkup(<SketchOffsetPanel {...props} />);
    expect(panel).toContain("2 cadenas · 2 entidades fuente · 2 copias · 0 cierres");
    expect(panel).toContain("La separación se comparte entre las cadenas de cada lado.");
    const preview = renderToStaticMarkup(<SketchCanvas {...props} tool="offset" plane="XY" fitStamp={0} offsetPreview={plan} onChange={noop} />);
    expect(preview.match(/data-offset-image=/g)).toHaveLength(2);
    const stale = renderToStaticMarkup(<SketchCanvas {...props} selection={[...selection].reverse()}
      tool="offset" plane="XY" fitStamp={0} offsetPreview={plan} onChange={noop} />);
    expect(stale).not.toContain('data-offset-preview="true"');
    const applied = solveSketch(plan.profile), family = applied.profile.constraints.find(constraint => constraint.type === "equalOffsetDistance");
    if (!family) throw new Error("Expected shared separation family");
    const familySelection: SketchSelection[] = [{ kind: "constraint", id: family.id }];
    const canvas = renderToStaticMarkup(<SketchCanvas {...props} profile={applied.profile} solution={applied} selection={familySelection}
      tool="select" plane="XY" fitStamp={0} onChange={noop} />);
    expect(canvas).toContain("d =");
    const relations = renderToStaticMarkup(<EntitySketchPanel profile={applied.profile} solution={applied} selection={familySelection}
      onSelection={noop} onChange={noop} focusSection={{ name: "relations", stamp: 0 }} />);
    expect(relations).toContain("Separación compartida de equidistancias");
  });

  it("shows two sides and both end caps together, including construction styling", () => {
    const profile: EntityProfile = { kind: "entities", points: [{ id: "end", x: 10, y: 0 }],
      entities: [{ id: "line", type: "line", start: "origin", end: "end", construction: false }],
      constraints: [{ id: "h", type: "horizontal", entityId: "line" }, { id: "l", type: "length", entityId: "line", value: 10 }] };
    const solution = solveSketch(profile), selection: SketchSelection[] = [{ kind: "entity", id: "line" }];
    const plan = planSketchOffset(solution.profile, selection, { ...options, bothDirections: true, cap: "arc", construction: "offset" });
    expect(plan.changed, plan.message).toBe(true);
    const html = renderToStaticMarkup(<SketchCanvas profile={profile} solution={solution} selection={selection}
      onSelection={noop} onChange={noop} tool="offset" plane="XY" fitStamp={0} offsetPreview={plan} />);
    expect(html.match(/data-offset-image=/g)).toHaveLength(4);
    expect(html).toMatch(/data-offset-image=[^>]*stroke-dasharray="7 5"/);
  });

  it("hides proposals from an old profile and from other tools", () => {
    const props = setup(), plan = planSketchOffset(structuredClone(props.solution.profile), props.selection, options);
    expect(plan.changed, plan.message).toBe(true);
    const stale = renderToStaticMarkup(<SketchCanvas {...props} tool="offset" plane="XY" fitStamp={0} offsetPreview={plan} onChange={noop} />);
    expect(stale).not.toContain('data-offset-preview="true"');
    const inactive = renderToStaticMarkup(<SketchCanvas {...props} tool="select" plane="XY" fitStamp={0}
      offsetPreview={planSketchOffset(props.solution.profile, props.selection, options)} onChange={noop} />);
    expect(inactive).not.toContain('data-offset-preview="true"');
  });

  it("identifies each distance side and renders a fresh driven cap measurement", () => {
    const profile: EntityProfile = { kind: "entities", points: [{ id: "end", x: 10, y: 0 }],
      entities: [{ id: "line", type: "line", start: "origin", end: "end", construction: false }],
      constraints: [{ id: "h", type: "horizontal", entityId: "line" }, { id: "l", type: "length", entityId: "line", value: 10 }] };
    const source = solveSketch(profile), plan = planSketchOffset(source.profile, [{ kind: "entity", id: "line" }],
      { ...options, bothDirections: true, cap: "arc" });
    expect(plan.changed, plan.message).toBe(true);
    const edited = structuredClone(plan.profile);
    const driving = edited.constraints.find(constraint => constraint.type === "offsetDistance" && !constraint.driven);
    const driven = edited.constraints.find(constraint => constraint.type === "offsetDistance" && constraint.driven);
    if (driving?.type !== "offsetDistance" || driven?.type !== "offsetDistance") throw new Error("Expected two distance dimensions");
    driving.value = 1.5;
    const solution = solveSketch(edited);
    expect(["fullyDefined", "underdefined"]).toContain(solution.status);
    expect(solution.drivenValues[driven.id]).toBeCloseTo(1.5, 7);
    expect(driven.value).toBe(1);
    const html = renderToStaticMarkup(<EntitySketchPanel profile={solution.profile} solution={solution}
      selection={[{ kind: "constraint", id: driven.id }]} onSelection={noop} onChange={noop}
      focusSection={{ name: "dimensions", stamp: 0 }} />);
    expect(html).toContain("lado derecho");
    expect(html).toContain("lado izquierdo");
    expect(html).toContain("conducida = (1.5 mm)");
    expect(html).toContain('aria-label="Geometría asociada de equidistancia"');
    expect(html).toContain("Eliminar la cota deja libre la separación");
  });
});
