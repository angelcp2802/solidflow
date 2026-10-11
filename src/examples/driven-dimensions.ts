import { validateDocument } from "../model/document";
import { createDrivenDimension } from "../sketch/editing";
import { createAngularPlateDocument } from "./sketch-relations";

/** A fully constrained triangle with four independent read-only annotations. */
export function createMeasuredPlateDocument() {
  const document = createAngularPlateDocument();
  document.name = "Placa con cotas conducidas";
  const sketch = document.features[0];
  if (sketch.type !== "sketch" || sketch.profile.kind !== "entities") {
    throw new Error("El ejemplo necesita un croquis de entidades.");
  }
  sketch.name = "Croquis · medidas de referencia";
  const profile = sketch.profile;
  for (const [id, definition] of [
    ["measured-closing", { type: "length", entityId: "closing" }],
    ["measured-x", { type: "distanceX", a: "origin", b: "side-end" }],
    ["measured-y", { type: "distanceY", a: "origin", b: "side-end" }],
    [
      "measured-reflex",
      { type: "angle", a: "base", b: "side", clockwise: true },
    ],
  ] as const) {
    profile.constraints.push(
      createDrivenDimension(profile, definition, { id }),
    );
  }
  return validateDocument(document);
}
