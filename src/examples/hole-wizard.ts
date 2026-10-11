import type {
  CadResult,
  Feature,
  HoleFeature,
  SketchFeature,
  ExtrudeFeature,
} from "../cad/kernel.types";
import {
  createDocument,
  validateDocument,
  type Document,
} from "../model/document";

export type HoleExampleKind = "blind" | "counterbore" | "countersink";

/** Public library factories use the same historical face references as an interactive hole. */
export async function createHoleExample(
  kind: HoleExampleKind,
  build: (features: Feature[]) => Promise<CadResult>,
): Promise<Document> {
  const sketch: SketchFeature = {
    id: "hole-example-base-sketch",
    name: "Croquis de placa · 100 × 70",
    type: "sketch",
    suppressed: false,
    plane: "XY",
    offset: 0,
    profile: { kind: "rectangle", center: [0, 0], width: 100, height: 70 },
  };
  const base: ExtrudeFeature = {
    id: "hole-example-base",
    name: "Placa · 24 mm",
    type: "extrude",
    suppressed: false,
    sketchId: sketch.id,
    depth: 24,
    symmetric: false,
  };
  const initial = [sketch, base];
  const result = await build(initial);
  if (result.featureErrors.length)
    throw new Error(
      result.featureErrors.map((item) => item.message).join(" · "),
    );
  const topFaces =
    result.faces?.filter(
      (face) =>
        face.frame &&
        Math.abs(face.frame.origin[2] - 24) < 1e-6 &&
        face.frame.normal[2] > 0.999999,
    ) ?? [];
  if (topFaces.length !== 1)
    throw new Error(
      "No se pudo identificar la cara de entrada del ejemplo de taladros.",
    );
  const hole: HoleFeature = {
    id: "hole-example-holes",
    name:
      kind === "blind"
        ? "Cuatro taladros ciegos · Ø8"
        : kind === "counterbore"
          ? "Cuatro refrentados · Ø16 / Ø8"
          : "Cuatro avellanados · Ø16 / 90°",
    type: "hole",
    suppressed: false,
    baseFeatureId: base.id,
    support: { kind: "face", face: topFaces[0].ref },
    positions: [
      [-30, -20],
      [30, -20],
      [30, 20],
      [-30, 20],
    ].map(([x, y], index) => ({ id: `hole-center-${index + 1}`, x, y })),
    reversed: false,
    diameter: 8,
    endCondition:
      kind === "blind"
        ? {
            kind: "blind",
            depth: 10,
            depthReference: "shoulder",
            tip: { kind: "conical", angle: 118 },
          }
        : { kind: "throughAll" },
    head:
      kind === "blind"
        ? { kind: "simple" }
        : kind === "counterbore"
          ? { kind: "counterbore", diameter: 16, depth: 4 }
          : { kind: "countersink", diameter: 16, angle: 90 },
  };
  return validateDocument({
    ...createDocument(
      kind === "blind"
        ? "Placa con taladros ciegos"
        : kind === "counterbore"
          ? "Placa con taladros refrentados"
          : "Placa con taladros avellanados",
    ),
    features: [...initial, hole],
  });
}
