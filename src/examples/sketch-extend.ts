import { createDocument, validateDocument } from "../model/document";

/** Extend both ends of the short diameter to close the lower R20 semicircle. */
export function createExtendSketchDocument() {
  return validateDocument({
    ...createDocument("Croquis para extender"),
    features: [
      {
        id: "extend-sketch",
        name: "Croquis · arco y línea para extender",
        type: "sketch",
        plane: "XY",
        offset: 0,
        suppressed: false,
        profile: {
          kind: "entities",
          points: [
            { id: "arc-left", x: -20, y: 0 },
            { id: "arc-right", x: 20, y: 0 },
            { id: "line-left", x: -10, y: 0 },
            { id: "line-right", x: 10, y: 0 },
          ],
          entities: [
            {
              id: "extend-arc",
              type: "arc",
              center: "origin",
              start: "arc-left",
              end: "arc-right",
              clockwise: false,
              construction: false,
            },
            {
              id: "extend-line",
              type: "line",
              start: "line-left",
              end: "line-right",
              construction: false,
            },
          ],
          constraints: [
            {
              id: "arc-radius",
              type: "radius",
              entityId: "extend-arc",
              value: 20,
            },
            {
              id: "line-horizontal",
              type: "horizontal",
              entityId: "extend-line",
            },
            {
              id: "line-anchor",
              type: "fix",
              pointId: "line-left",
              x: -10,
              y: 0,
            },
            {
              id: "line-length",
              type: "length",
              entityId: "extend-line",
              value: 20,
            },
            {
              id: "arc-left-on-diameter",
              type: "pointOnLine",
              pointId: "arc-left",
              entityId: "extend-line",
            },
            {
              id: "arc-right-on-diameter",
              type: "pointOnLine",
              pointId: "arc-right",
              entityId: "extend-line",
            },
          ],
        },
      },
    ],
  });
}
