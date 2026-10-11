import type {
  CadResult,
  ExtrudeFeature,
  Feature,
  SketchFeature,
} from "../cad/kernel.types";
import {
  createDocument,
  validateDocument,
  type Document,
} from "../model/document";

export type ExtrudeExampleKind = "throughAll" | "untilNext" | "upToSurface";

/** Find the supporting/destination face in the rebuilt history, without saved face indices. */
export async function createExtrudeEndExample(
  kind: ExtrudeExampleKind,
  build: (features: Feature[]) => Promise<CadResult>,
): Promise<Document> {
  const curved = kind === "upToSurface";
  const height = kind === "throughAll" ? 12 : 40;
  const document = createDocument(
    curved
      ? "Saliente hasta techo cilíndrico"
      : kind === "untilNext"
        ? "Caja con corte hasta siguiente"
        : "Placa con corte por todo",
  );
  const sketch: SketchFeature = {
    id: "end-example-base-sketch",
    name: curved ? "Croquis del techo · R20" : "Croquis de base · 80 × 60",
    type: "sketch",
    suppressed: false,
    plane: curved ? "XZ" : "XY",
    offset: curved ? -50 : 0,
    profile: curved
      ? { kind: "circle", radius: 20, center: [0, 30] }
      : { kind: "rectangle", width: 80, height: 60, center: [0, 0] },
  };
  const base: ExtrudeFeature = {
    id: "end-example-base",
    name: curved ? "Techo cilíndrico · 100 mm" : `Saliente · ${height} mm`,
    type: "extrude",
    suppressed: false,
    sketchId: sketch.id,
    depth: curved ? 100 : height,
    symmetric: false,
  };
  const features: Feature[] = [sketch, base];
  let sourceId = base.id;
  if (kind === "untilNext") {
    sourceId = "end-example-shell";
    features.push({
      id: sourceId,
      name: "Vaciado cerrado · 4 mm",
      type: "shell",
      suppressed: false,
      baseFeatureId: base.id,
      thickness: 4,
      direction: "inward",
      removedFaces: [],
    });
  }
  const source = await build(features);
  if (source.featureErrors.length || !source.faces?.length)
    throw new Error("No se pudo construir la base del ejemplo.");
  const matches = source.faces.filter((face) =>
    curved
      ? !face.frame
      : face.frame &&
        Math.abs(face.frame.normal[2] - 1) < 1e-7 &&
        Math.abs(face.frame.origin[2] - height) < 1e-7,
  );
  if (matches.length !== 1)
    throw new Error(
      "No se puede identificar de forma única la cara del ejemplo.",
    );
  const face = matches[0].ref;
  const profile: SketchFeature = {
    id: "end-example-profile",
    name: curved ? "Perfil del saliente · R5" : "Croquis del taladro · R8",
    type: "sketch",
    suppressed: false,
    plane: "XY",
    offset: 0,
    ...(!curved ? { support: { kind: "face" as const, face } } : {}),
    profile: { kind: "circle", radius: curved ? 5 : 8, center: [0, 0] },
  };
  const operation: ExtrudeFeature = {
    id: "end-example-operation",
    name: curved
      ? "Saliente hasta superficie curva"
      : kind === "untilNext"
        ? "Corte hasta siguiente"
        : "Corte por todo",
    type: curved ? "extrude" : "cut",
    suppressed: false,
    sketchId: profile.id,
    depth: curved ? 20 : -20,
    symmetric: false,
    endCondition: curved
      ? { kind: "upToSurface", target: { kind: "face", face } }
      : kind === "untilNext"
        ? { kind: "untilNext", baseFeatureId: sourceId }
        : {
            kind: "throughAll",
            baseFeatureId: sourceId,
            bothDirections: false,
          },
  };
  return validateDocument({
    ...document,
    features: [...features, profile, operation],
  });
}
