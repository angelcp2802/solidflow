import type { Feature, SketchFeature } from "../cad/kernel.types";
import { createDocument, validateDocument } from "../model/document";

function circle(
  id: string,
  center: [number, number],
  radius: number,
  offset = 0,
): SketchFeature {
  return {
    id,
    name: id,
    type: "sketch",
    suppressed: false,
    plane: "XY",
    offset,
    profile: {
      kind: "entities",
      points: [{ id: "center", x: center[0], y: center[1] }],
      entities: [
        {
          id: "circle",
          type: "circle",
          center: "center",
          radius,
          construction: false,
        },
      ],
      constraints: [
        {
          id: "fixed-center",
          type: "fix",
          pointId: "center",
          x: center[0],
          y: center[1],
        },
        { id: "radius", type: "radius", entityId: "circle", value: radius },
      ],
    },
  };
}

function plate(): Feature[] {
  return [
    {
      id: "base-sketch",
      name: "Croquis de placa",
      type: "sketch",
      suppressed: false,
      plane: "XY",
      offset: 0,
      profile: { kind: "rectangle", center: [0, 0], width: 100, height: 70 },
    },
    {
      id: "base",
      name: "Placa · 12 mm",
      type: "extrude",
      suppressed: false,
      sketchId: "base-sketch",
      depth: 12,
      symmetric: false,
    },
  ];
}

export function createLinearPatternExample() {
  const features: Feature[] = [
    ...plate(),
    { ...circle("hole-sketch", [-30, -20], 3), name: "Croquis taladro · R3" },
    {
      id: "hole",
      name: "Taladro original",
      type: "cut",
      suppressed: false,
      sketchId: "hole-sketch",
      depth: 12,
      symmetric: false,
    },
    {
      id: "pattern",
      name: "Matriz lineal · 3 × 2",
      type: "linearPattern",
      suppressed: false,
      baseFeatureId: "hole",
      source: { mode: "features", geometryPattern: true, featureIds: ["hole"] },
      first: { direction: [1, 0, 0], spacing: 25, count: 3 },
      second: { direction: [0, 1, 0], spacing: 30, count: 2 },
      secondSeedOnly: false,
      skipped: [],
    },
  ];
  return validateDocument({
    ...createDocument("Placa con matriz de taladros"),
    features,
  });
}

export function createCircularPatternExample() {
  const features: Feature[] = [
    { ...circle("base-sketch", [0, 0], 40), name: "Croquis de brida · R40" },
    {
      id: "base",
      name: "Brida · 8 mm",
      type: "extrude",
      suppressed: false,
      sketchId: "base-sketch",
      depth: 8,
      symmetric: false,
    },
    { ...circle("hole-sketch", [20, 0], 4), name: "Croquis taladro · R4" },
    {
      id: "hole",
      name: "Taladro original",
      type: "cut",
      suppressed: false,
      sketchId: "hole-sketch",
      depth: 8,
      symmetric: false,
    },
    {
      id: "pattern",
      name: "Matriz circular · 6 taladros",
      type: "circularPattern",
      suppressed: false,
      baseFeatureId: "hole",
      source: { mode: "features", geometryPattern: true, featureIds: ["hole"] },
      axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
      count: 6,
      angle: 360,
      equalSpacing: true,
      reversed: false,
      skipped: [],
    },
  ];
  return validateDocument({
    ...createDocument("Brida con matriz circular"),
    features,
  });
}

export function createMirrorExample() {
  const features: Feature[] = [
    ...plate(),
    {
      ...circle("boss-sketch", [-25, 0], 6, 12),
      name: "Croquis saliente · R6",
    },
    {
      id: "boss",
      name: "Saliente original · 15 mm",
      type: "extrude",
      suppressed: false,
      sketchId: "boss-sketch",
      depth: 15,
      symmetric: false,
    },
    {
      id: "mirror",
      name: "Simetría del saliente",
      type: "mirror",
      suppressed: false,
      baseFeatureId: "boss",
      source: { mode: "features", geometryPattern: true, featureIds: ["boss"] },
      support: { kind: "principal", plane: "YZ" },
      mergeBodies: false,
    },
  ];
  return validateDocument({
    ...createDocument("Placa con salientes simétricos"),
    features,
  });
}
