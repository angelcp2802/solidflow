import { createDocument, validateDocument } from "../model/document";

/** Fully defined straight or circular-sided plate with an anchored origin corner. */
export function createFilletSketchDocument(kind: "rectangle" | "curved" = "rectangle") {
  return validateDocument({
    ...createDocument(kind === "curved" ? "Placa curva para redondear" : "Placa para redondear"),
    features: [
      {
        id: "fillet-sketch",
        name: kind === "curved" ? "Croquis · esquina de línea y arco" : "Croquis · rectángulo 10 × 6",
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
            ...(kind === "curved" ? [{ id: "left-center", x: -4, y: 3 }] : []),
          ],
          entities: [
            { id: "bottom", type: "line", start: "origin", end: "bottom-right", construction: false },
            { id: "right", type: "line", start: "bottom-right", end: "top-right", construction: false },
            { id: "top", type: "line", start: "top-right", end: "top-left", construction: false },
            kind === "curved"
              ? { id: "left", type: "arc", center: "left-center", start: "top-left", end: "origin", clockwise: true, construction: false }
              : { id: "left", type: "line", start: "top-left", end: "origin", construction: false },
          ],
          constraints: [
            { id: "bottom-horizontal", type: "horizontal", entityId: "bottom" },
            { id: "right-vertical", type: "vertical", entityId: "right" },
            { id: "top-horizontal", type: "horizontal", entityId: "top" },
            { id: "plate-width", type: "length", entityId: "bottom", value: 10 },
            ...(kind === "curved" ? [
              { id: "plate-height", type: "distanceY", a: "origin", b: "top-right", value: 6 },
              { id: "left-center-fixed", type: "fix", pointId: "left-center", x: -4, y: 3 },
              { id: "left-radius", type: "radius", entityId: "left", value: 5 },
            ] : [
              { id: "left-vertical", type: "vertical", entityId: "left" },
              { id: "plate-height", type: "length", entityId: "left", value: 6 },
            ]),
          ],
        },
      },
      {
        id: "fillet-extrude",
        name: "Saliente · 4 mm",
        type: "extrude",
        sketchId: "fillet-sketch",
        depth: 4,
        symmetric: false,
        suppressed: false,
      },
    ],
  });
}
