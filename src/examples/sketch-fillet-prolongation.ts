import { createDocument, validateDocument } from "../model/document";
import type { EntityProfile, SketchConstraint } from "../sketch/types";

export type FilletProlongationExample = "line-arc" | "arc-arc";

const fix = (pointId: string, x: number, y: number): SketchConstraint => ({
  id: `fix-${pointId}`, type: "fix", pointId, x, y,
});

/**
 * Synthetic millimetre examples authored from explicit Cartesian geometry.
 * The gap between the selected sources is intentional. Filleting them with R2
 * closes the contour; the initial document contains only a sketch.
 * R10 sources use 30°–90° or reflected 75°/105° starts on two fixed supports.
 */
export function createFilletProlongationDocument(kind: FilletProlongationExample = "line-arc") {
  const offsetX = 2.5 * (Math.sqrt(6) - Math.SQRT2);
  const offsetY = 2.5 * (Math.sqrt(6) + Math.SQRT2);
  const profile: EntityProfile = kind === "line-arc" ? {
    kind: "entities",
    points: [
      { id: "line-start", x: 10, y: 0 },
      { id: "line-far", x: 30, y: 0 },
      { id: "arc-start", x: 5 * Math.sqrt(3), y: 5 },
      { id: "arc-far", x: 0, y: 10 },
      { id: "upper-right", x: 30, y: 20 },
      { id: "upper-left", x: 0, y: 20 },
    ],
    entities: [
      { id: "source-line", type: "line", start: "line-start", end: "line-far", construction: false },
      { id: "source-arc", type: "arc", center: "origin", start: "arc-start", end: "arc-far", clockwise: false, construction: false },
      { id: "right", type: "line", start: "line-far", end: "upper-right", construction: false },
      { id: "top", type: "line", start: "upper-right", end: "upper-left", construction: false },
      { id: "left", type: "line", start: "upper-left", end: "arc-far", construction: false },
    ],
    constraints: [
      fix("line-start", 10, 0), fix("arc-start", 5 * Math.sqrt(3), 5),
      fix("line-far", 30, 0), fix("arc-far", 0, 10),
      fix("upper-right", 30, 20), fix("upper-left", 0, 20),
      { id: "source-line-horizontal", type: "horizontal", entityId: "source-line" },
      // Fixed origin/far endpoint and the intrinsic equal arc radii set R10.
      { id: "source-radius-reading", type: "radius", entityId: "source-arc", value: 10, driven: true, referenceRole: "annotation" },
    ],
  } : {
    kind: "entities",
    points: [
      { id: "left-center", x: -6, y: 0 }, { id: "right-center", x: 6, y: 0 },
      { id: "left-start", x: -6 + offsetX, y: offsetY },
      { id: "right-start", x: 6 - offsetX, y: offsetY },
      { id: "left-far", x: -16, y: 0 }, { id: "right-far", x: 16, y: 0 },
      { id: "lower-left", x: -16, y: -10 }, { id: "lower-right", x: 16, y: -10 },
    ],
    entities: [
      { id: "left-source", type: "arc", center: "left-center", start: "left-start", end: "left-far", clockwise: false, construction: false },
      { id: "right-source", type: "arc", center: "right-center", start: "right-start", end: "right-far", clockwise: true, construction: false },
      { id: "left", type: "line", start: "left-far", end: "lower-left", construction: false },
      { id: "bottom", type: "line", start: "lower-left", end: "lower-right", construction: false },
      { id: "right", type: "line", start: "lower-right", end: "right-far", construction: false },
    ],
    constraints: [
      fix("left-center", -6, 0), fix("right-center", 6, 0),
      fix("left-start", -6 + offsetX, offsetY), fix("right-start", 6 - offsetX, offsetY),
      fix("lower-left", -16, -10), fix("lower-right", 16, -10),
      { id: "left-radius", type: "radius", entityId: "left-source", value: 10 },
      { id: "right-radius", type: "radius", entityId: "right-source", value: 10 },
      { id: "left-far-y", type: "distanceY", a: "origin", b: "left-far", value: 0 },
      { id: "right-far-y", type: "distanceY", a: "origin", b: "right-far", value: 0 },
    ],
  };
  return validateDocument({
    ...createDocument(kind === "line-arc" ? "Redondeo con prolongación de arco" : "Redondeo con prolongación de dos arcos"),
    features: [{
      id: "fillet-prolongation-sketch", type: "sketch", plane: "XY", offset: 0, suppressed: false,
      name: kind === "line-arc" ? "Croquis · línea y arco separados" : "Croquis · dos arcos separados",
      profile,
    }],
  });
}
