import { createDocument, validateDocument } from "../model/document";
import type { EntityProfile, SketchConstraint } from "../sketch/types";

/** Original Cartesian examples, in mm; offsets are applied by the editing tool. */
export function createSketchOffsetDocument(kind: "rectangle" | "circle" | "concave" = "rectangle") {
  let profile: EntityProfile;
  if (kind === "circle") {
    profile = { kind: "entities", points: [], entities: [{ id: "circle", type: "circle", center: "origin", radius: 3, construction: false }],
      constraints: [{ id: "source-radius", type: "radius", entityId: "circle", value: 3 }] };
  } else {
    const vertices = kind === "rectangle" ? [[0, 0], [10, 0], [10, 6], [0, 6]]
      : [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    const pointId = (index: number) => index === 0 ? "origin" : `vertex-${index}`;
    const constraints: SketchConstraint[] = vertices.map((a, index) => ({ id: `direction-${index}`,
      type: a[1] === vertices[(index + 1) % vertices.length][1] ? "horizontal" : "vertical", entityId: `edge-${index}` }));
    constraints.push({ id: "source-width", type: "length", entityId: "edge-0", value: 10 });
    if (kind === "rectangle") constraints.push({ id: "source-height", type: "length", entityId: "edge-1", value: 6 });
    else constraints.push({ id: "source-height", type: "length", entityId: "edge-5", value: 10 },
      { id: "notch-y", type: "length", entityId: "edge-1", value: 4 },
      { id: "notch-x", type: "length", entityId: "edge-4", value: 4 });
    profile = { kind: "entities", points: vertices.slice(1).map(([x, y], index) => ({ id: pointId(index + 1), x, y })),
      entities: vertices.map((_, index) => ({ id: `edge-${index}`, type: "line", start: pointId(index), end: pointId((index + 1) % vertices.length), construction: false })), constraints };
  }
  return validateDocument({ ...createDocument(kind === "circle" ? "Equidistancia circular" : kind === "concave" ? "Equidistancia de un contorno cóncavo" : "Equidistancia de una placa"),
    features: [{ id: "offset-sketch", name: kind === "circle" ? "Croquis · círculo R3" : kind === "concave" ? "Croquis · contorno en L" : "Croquis · rectángulo 10 × 6", type: "sketch", plane: "XY", offset: 0, suppressed: false, profile }] });
}
