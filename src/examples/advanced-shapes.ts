import type { Feature, SketchFeature } from "../cad/kernel.types";
import { createDocument, validateDocument } from "../model/document";
import type { EntityProfile } from "../sketch/types";

const circle = (radius: number): EntityProfile => ({
  kind: "entities",
  points: [],
  entities: [
    {
      id: "circle",
      type: "circle",
      center: "origin",
      radius,
      construction: false,
    },
  ],
  constraints: [
    { id: "radius", type: "radius", entityId: "circle", value: radius },
  ],
});

export function createSweepExample() {
  const doc = createDocument("Conducto barrido");
  const points = [
    { id: "a", x: 0, y: 20 },
    { id: "c", x: 20, y: 20 },
    { id: "b", x: 20, y: 40 },
    { id: "end", x: 40, y: 40 },
  ];
  const features: Feature[] = [
    {
      id: "section",
      name: "Perfil circular · R4",
      type: "sketch",
      suppressed: false,
      plane: "XY",
      offset: 0,
      profile: circle(4),
    },
    {
      id: "path",
      name: "Recorrido · recta, arco y recta",
      type: "sketch",
      suppressed: false,
      plane: "XZ",
      offset: 0,
      profile: {
        kind: "entities",
        points,
        entities: [
          {
            id: "line-1",
            type: "line",
            start: "origin",
            end: "a",
            construction: false,
          },
          {
            id: "bend",
            type: "arc",
            center: "c",
            start: "a",
            end: "b",
            clockwise: true,
            construction: false,
          },
          {
            id: "line-2",
            type: "line",
            start: "b",
            end: "end",
            construction: false,
          },
        ],
        constraints: points.map((point) => ({
          id: `fixed-${point.id}`,
          type: "fix",
          pointId: point.id,
          x: point.x,
          y: point.y,
        })),
      },
    },
    {
      id: "sweep",
      name: "Saliente-Barrido1",
      type: "sweep",
      suppressed: false,
      profileSketchId: "section",
      pathSketchId: "path",
      path: ["line-1", "bend", "line-2"].map((entityId) => ({
        entityId,
        reversed: false,
      })),
      orientation: "followPath",
      merge: true,
    },
  ];
  return validateDocument({ ...doc, features });
}

export function createLoftExample() {
  const doc = createDocument("Transición de tres secciones");
  const radii = [16, 10, 14];
  const offsets = [0, 25, 55];
  const features: Feature[] = radii.map((radius, index): SketchFeature => ({
    id: `section-${index + 1}`,
    name: `Sección ${index + 1} · R${radius}`,
    type: "sketch",
    suppressed: false,
    plane: "XY",
    offset: offsets[index],
    profile: circle(radius),
  }));
  features.push({
    id: "loft",
    name: "Saliente-Recubrir1",
    type: "loft",
    suppressed: false,
    ruled: false,
    merge: true,
    sections: radii.map((_, index) => ({
      sketchId: `section-${index + 1}`,
      startEntityId: "circle",
      reversed: false,
    })),
  });
  return validateDocument({ ...doc, features });
}
