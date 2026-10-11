import { createDocument, validateDocument } from "./document";
import type { EntityProfile } from "../sketch/types";

/** One constrained sketch owns the outside contour and the four hole contours. */
export function createConstrainedPlateDocument() {
  const document = createDocument("Placa con croquis acotado");
  const profile: EntityProfile = {
    kind: "entities",
    points: [
      { id: "p0", x: -50, y: -35 },
      { id: "p1", x: 50, y: -35 },
      { id: "p2", x: 50, y: 35 },
      { id: "p3", x: -50, y: 35 },
      { id: "h0", x: -35, y: -20 },
      { id: "h1", x: 35, y: -20 },
      { id: "h2", x: 35, y: 20 },
      { id: "h3", x: -35, y: 20 },
    ],
    entities: [0, 1, 2, 3].map((index) => ({
      id: `line${index}`,
      type: "line",
      start: `p${index}`,
      end: `p${(index + 1) % 4}`,
      construction: false,
    })),
    constraints: [
      ...[0, 1, 2, 3].map((index) => ({
        id: `align${index}`,
        type: index % 2 ? ("vertical" as const) : ("horizontal" as const),
        entityId: `line${index}`,
      })),
      { id: "anchor", type: "fix", pointId: "p0", x: -50, y: -35 },
      { id: "width", type: "length", entityId: "line0", value: 100 },
      { id: "height", type: "length", entityId: "line1", value: 70 },
    ],
  };
  for (let index = 0; index < 4; index++) {
    profile.entities.push({
      id: `hole${index}`,
      type: "circle",
      center: `h${index}`,
      radius: 5,
      construction: false,
    });
    profile.constraints.push(
      {
        id: `holeX${index}`,
        type: "distanceX",
        a: `p${index}`,
        b: `h${index}`,
        value: index === 0 || index === 3 ? 15 : -15,
      },
      {
        id: `holeY${index}`,
        type: "distanceY",
        a: `p${index}`,
        b: `h${index}`,
        value: index < 2 ? 15 : -15,
      },
      {
        id: `holeR${index}`,
        type: "radius",
        entityId: `hole${index}`,
        value: 5,
      },
    );
  }
  const sketchId = crypto.randomUUID();
  return validateDocument({
    ...document,
    features: [
      {
        id: sketchId,
        name: "Croquis acotado · placa y taladros",
        type: "sketch",
        plane: "XY",
        offset: 0,
        suppressed: false,
        profile,
      },
      {
        id: crypto.randomUUID(),
        name: "Saliente-Extruir1",
        type: "extrude",
        sketchId,
        depth: 12,
        symmetric: false,
        suppressed: false,
      },
    ],
  });
}
