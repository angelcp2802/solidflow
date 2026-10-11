import { createDocument, validateDocument } from "../model/document";

/** Three clicks turn the intersecting circle and line into a closed D profile. */
export function createTrimSketchDocument() {
  return validateDocument({
    ...createDocument("Croquis para recortar"),
    features: [
      {
        id: "trim-sketch",
        name: "Croquis · círculo y línea para recortar",
        type: "sketch",
        plane: "XY",
        offset: 0,
        suppressed: false,
        profile: {
          kind: "entities",
          points: [
            { id: "left-tail", x: -30, y: 0 },
            { id: "right-tail", x: 30, y: 0 },
          ],
          entities: [
            {
              id: "trim-circle",
              type: "circle",
              center: "origin",
              radius: 20,
              construction: false,
            },
            {
              id: "trim-line",
              type: "line",
              start: "left-tail",
              end: "right-tail",
              construction: false,
            },
          ],
          constraints: [
            {
              id: "circle-radius",
              type: "radius",
              entityId: "trim-circle",
              value: 20,
            },
            {
              id: "line-horizontal",
              type: "horizontal",
              entityId: "trim-line",
            },
            {
              id: "anchor-left",
              type: "fix",
              pointId: "left-tail",
              x: -30,
              y: 0,
            },
            {
              id: "line-length",
              type: "length",
              entityId: "trim-line",
              value: 60,
            },
          ],
        },
      },
    ],
  });
}
