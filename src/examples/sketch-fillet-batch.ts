import { createDocument, validateDocument } from "../model/document";

/**
 * Authored synthetic 10×6 mm plate, anchored at the immutable sketch origin.
 * Select origin/bottom-right for two bottom corners, or origin/top-left for
 * two corners sharing the 6 mm left edge. The existing extrusion is 4 mm.
 * Cartesian dimensions are independent of the fillet planner and CAD kernel.
 */
export function createFilletBatchDocument() {
  return validateDocument({
    ...createDocument("Redondeos de croquis en grupo"),
    features: [
      {
        id: "fillet-batch-sketch", name: "Croquis · rectángulo 10 × 6", type: "sketch",
        plane: "XY", offset: 0, suppressed: false,
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
            { id: "bottom-reading", type: "length", entityId: "bottom", value: 10, driven: true, referenceRole: "annotation" },
          ],
        },
      },
      {
        id: "fillet-batch-extrude", name: "Saliente · 4 mm", type: "extrude",
        sketchId: "fillet-batch-sketch", depth: 4, symmetric: false, suppressed: false,
      },
    ],
  });
}
