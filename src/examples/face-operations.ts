import type {
  CadResult,
  FaceOperationFeature,
  Feature,
} from "../cad/kernel.types";
import {
  createDocument,
  validateDocument,
  type Document,
} from "../model/document";

/** Select references from the built example, never from native face indices. */
export async function createFaceOperationExample(
  kind: FaceOperationFeature["type"],
  build: (features: Feature[]) => Promise<CadResult>,
): Promise<Document> {
  const name = kind === "shell" ? "Caja con vaciado" : "Bloque con desmoldeo";
  const doc = createDocument(name);
  const sketch: Feature = {
    id: "face-example-sketch",
    type: "sketch",
    name: "Croquis de base",
    suppressed: false,
    plane: "XY",
    offset: 0,
    profile: {
      kind: "rectangle",
      center: [0, 0],
      width: kind === "shell" ? 100 : 80,
      height: kind === "shell" ? 70 : 50,
    },
  };
  const base: Feature = {
    id: "face-example-base",
    type: "extrude",
    name: "Saliente · 40 mm",
    suppressed: false,
    sketchId: sketch.id,
    depth: 40,
    symmetric: false,
  };
  const source = await build([sketch, base]);
  if (source.featureErrors.length || !source.faces?.length)
    throw new Error("No se pudo construir la base del ejemplo.");
  const selected = source.faces.filter(
    (face) =>
      face.frame &&
      (kind === "shell"
        ? Math.abs(face.frame.normal[2] - 1) < 1e-7 &&
          Math.abs(face.frame.origin[2] - 40) < 1e-7
        : Math.abs(face.frame.normal[2]) < 1e-7),
  );
  if (selected.length !== (kind === "shell" ? 1 : 4))
    throw new Error(
      "No se pueden identificar de forma única las caras del ejemplo.",
    );
  const common = {
    id: "face-example-operation",
    name: kind === "shell" ? "Vaciado · 3 mm" : "Desmoldeo · 5°",
    suppressed: false,
    baseFeatureId: base.id,
  };
  const operation: FaceOperationFeature =
    kind === "shell"
      ? {
          ...common,
          type: kind,
          thickness: 3,
          direction: "inward",
          removedFaces: selected.map((face) => face.ref),
        }
      : {
          ...common,
          type: kind,
          angle: 5,
          reversed: false,
          support: { kind: "principal", plane: "XY" },
          propagation: "tangent",
          faces: selected.map((face) => face.ref),
        };
  return validateDocument({ ...doc, features: [sketch, base, operation] });
}
