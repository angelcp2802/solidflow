import { createDocument, validateDocument } from "../model/document";

/**
 * Authored Cartesian half-profile, in millimetres. Reflect bottom/right/top
 * about axis, explicitly joining origin and top-seam, to close a 10×6 plate.
 * The initial document deliberately contains only the editable open sketch.
 */
export function createSketchMirrorDocument() {
  return validateDocument({
    ...createDocument("Simetría asociativa de croquis"),
    features: [{
      id: "mirror-sketch", name: "Croquis · medio rectángulo 5 × 6", type: "sketch",
      plane: "XY", offset: 0, suppressed: false,
      profile: {
        kind: "entities",
        points: [
          { id: "bottom-right", x: 5, y: 0 },
          { id: "top-right", x: 5, y: 6 },
          { id: "top-seam", x: 0, y: 6 },
          { id: "axis-top", x: 0, y: 8 },
        ],
        entities: [
          { id: "bottom", type: "line", start: "origin", end: "bottom-right", construction: false },
          { id: "right", type: "line", start: "bottom-right", end: "top-right", construction: false },
          { id: "top", type: "line", start: "top-right", end: "top-seam", construction: false },
          { id: "axis", type: "line", start: "origin", end: "axis-top", construction: true },
        ],
        constraints: [
          { id: "bottom-horizontal", type: "horizontal", entityId: "bottom" },
          { id: "right-vertical", type: "vertical", entityId: "right" },
          { id: "top-horizontal", type: "horizontal", entityId: "top" },
          { id: "width", type: "length", entityId: "bottom", value: 5 },
          { id: "height", type: "length", entityId: "right", value: 6 },
          { id: "seam-on-axis", type: "pointOnLine", pointId: "top-seam", entityId: "axis" },
          { id: "axis-vertical", type: "vertical", entityId: "axis" },
          { id: "axis-length", type: "length", entityId: "axis", value: 8 },
          { id: "half-width-reading", type: "length", entityId: "bottom", value: 5, driven: true, referenceRole: "annotation" },
        ],
      },
    }],
  });
}

/** Synthetic right semicircle: its explicit on-axis joins make a full disk. */
export function createSketchMirrorArcDocument() {
  return validateDocument({
    ...createDocument("Simetría de un arco semicircular"),
    features: [{
      id: "mirror-sketch", name: "Croquis · medio disco R5", type: "sketch",
      plane: "XY", offset: 0, suppressed: false,
      profile: {
        kind: "entities",
        points: [
          { id: "arc-bottom", x: 0, y: -5 },
          { id: "arc-top", x: 0, y: 5 },
          { id: "axis-top", x: 0, y: 8 },
        ],
        entities: [
          { id: "half-arc", type: "arc", center: "origin", start: "arc-bottom", end: "arc-top", clockwise: false, construction: false },
          { id: "axis", type: "line", start: "origin", end: "axis-top", construction: true },
        ],
        constraints: [
          { id: "arc-radius", type: "radius", entityId: "half-arc", value: 5 },
          { id: "bottom-on-axis", type: "pointOnLine", pointId: "arc-bottom", entityId: "axis" },
          { id: "top-on-axis", type: "pointOnLine", pointId: "arc-top", entityId: "axis" },
          { id: "axis-vertical", type: "vertical", entityId: "axis" },
          { id: "axis-length", type: "length", entityId: "axis", value: 8 },
        ],
      },
    }],
  });
}
