import { createDocument, validateDocument } from "../model/document";
import type { EntityProfile } from "../sketch/types";

function plate(name: string, sketchName: string, profile: EntityProfile) {
  return validateDocument({
    ...createDocument(name),
    features: [
      {
        id: "relations-sketch",
        type: "sketch",
        name: sketchName,
        plane: "XY",
        offset: 0,
        suppressed: false,
        profile,
      },
      {
        id: "relations-extrude",
        type: "extrude",
        name: "Saliente · 8 mm",
        sketchId: "relations-sketch",
        depth: 8,
        symmetric: false,
        suppressed: false,
      },
    ],
  });
}

export function createAngularPlateDocument() {
  return plate("Placa con cota angular", "Croquis angular · 60°", {
    kind: "entities",
    points: [
      { id: "base-end", x: 60, y: 0 },
      { id: "side-end", x: 20, y: 20 * Math.sqrt(3) },
    ],
    entities: [
      {
        id: "base",
        type: "line",
        start: "origin",
        end: "base-end",
        construction: false,
      },
      {
        id: "side",
        type: "line",
        start: "origin",
        end: "side-end",
        construction: false,
      },
      {
        id: "closing",
        type: "line",
        start: "base-end",
        end: "side-end",
        construction: false,
      },
    ],
    constraints: [
      { id: "base-horizontal", type: "horizontal", entityId: "base" },
      { id: "base-length", type: "length", entityId: "base", value: 60 },
      { id: "side-length", type: "length", entityId: "side", value: 40 },
      {
        id: "included-angle",
        type: "angle",
        a: "base",
        b: "side",
        value: 60,
        reversedA: false,
        reversedB: false,
        clockwise: false,
      },
    ],
  });
}

export function createTangentPlateDocument() {
  return plate("Placa con arco tangente", "Croquis tangente · R15", {
    kind: "entities",
    points: [
      { id: "bl", x: 0, y: -15 },
      { id: "br", x: 50, y: -15 },
      { id: "tr", x: 50, y: 15 },
      { id: "tl", x: 0, y: 15 },
      { id: "center", x: 50, y: 0 },
    ],
    entities: [
      {
        id: "bottom",
        type: "line",
        start: "bl",
        end: "br",
        construction: false,
      },
      {
        id: "round-end",
        type: "arc",
        center: "center",
        start: "br",
        end: "tr",
        clockwise: false,
        construction: false,
      },
      { id: "top", type: "line", start: "tr", end: "tl", construction: false },
      { id: "left", type: "line", start: "tl", end: "bl", construction: false },
    ],
    constraints: [
      { id: "anchor", type: "fix", pointId: "bl", x: 0, y: -15 },
      { id: "left-vertical", type: "vertical", entityId: "left" },
      { id: "bottom-horizontal", type: "horizontal", entityId: "bottom" },
      { id: "top-horizontal", type: "horizontal", entityId: "top" },
      { id: "straight-length", type: "length", entityId: "bottom", value: 50 },
      { id: "end-radius", type: "radius", entityId: "round-end", value: 15 },
      {
        id: "bottom-tangent",
        type: "tangent",
        a: "bottom",
        b: "round-end",
        branch: "left",
      },
      {
        id: "top-tangent",
        type: "tangent",
        a: "top",
        b: "round-end",
        branch: "left",
      },
    ],
  });
}
