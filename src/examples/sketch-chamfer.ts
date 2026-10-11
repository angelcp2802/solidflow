import { createDocument, validateDocument } from "../model/document";

/** A fully defined 10 × 6 mm plate; the origin corner has two driving lengths. */
export function createChamferSketchDocument() {
  return validateDocument({
    ...createDocument("Placa para achaflanar"),
    features: [
      {
        id: "chamfer-sketch",
        name: "Croquis · rectángulo 10 × 6",
        type: "sketch",
        plane: "XY",
        offset: 0,
        suppressed: false,
        profile: {
          kind: "entities",
          points: [
            { id: "bottom-right", x: 10, y: 0 },
            { id: "top-right", x: 10, y: 6 },
            { id: "top-left", x: 0, y: 6 },
          ],
          entities: [
            { id: "bottom", type: "line", start: "origin", end: "bottom-right", construction: false },
            { id: "right", type: "line", start: "bottom-right", end: "top-right", construction: false },
            { id: "top", type: "line", start: "top-right", end: "top-left", construction: false },
            { id: "left", type: "line", start: "top-left", end: "origin", construction: false },
          ],
          constraints: [
            { id: "bottom-horizontal", type: "horizontal", entityId: "bottom" },
            { id: "right-vertical", type: "vertical", entityId: "right" },
            { id: "top-horizontal", type: "horizontal", entityId: "top" },
            { id: "left-vertical", type: "vertical", entityId: "left" },
            { id: "plate-width", type: "length", entityId: "bottom", value: 10 },
            { id: "plate-height", type: "length", entityId: "left", value: 6 },
          ],
        },
      },
      {
        id: "chamfer-extrude",
        name: "Saliente · 4 mm",
        type: "extrude",
        sketchId: "chamfer-sketch",
        depth: 4,
        symmetric: false,
        suppressed: false,
      },
    ],
  });
}
