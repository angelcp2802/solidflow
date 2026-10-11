import { expect, it } from "vitest";
import type { SketchFeature } from "../cad/kernel.types";
import type { EntityProfile } from "../sketch/types";
import {
  addFeature,
  createDocument,
  DocumentHistory,
  parseDocument,
  serializeDocument,
  updateFeature,
} from "./document";

function sketch(): SketchFeature {
  const profile: EntityProfile = {
    kind: "entities",
    points: [
      { id: "x", x: 10, y: 0 },
      { id: "y", x: 0, y: 10 },
      { id: "c", x: 4, y: -2 },
    ],
    entities: [
      {
        id: "lineA",
        type: "line",
        start: "origin",
        end: "x",
        construction: false,
      },
      {
        id: "lineB",
        type: "line",
        start: "origin",
        end: "y",
        construction: false,
      },
      {
        id: "circle",
        type: "circle",
        center: "c",
        radius: 2,
        construction: false,
      },
    ],
    constraints: [
      {
        id: "tangent",
        type: "tangent",
        a: "lineA",
        b: "circle",
        branch: "right",
      },
      {
        id: "angle",
        type: "angle",
        a: "lineA",
        b: "lineB",
        value: 270,
        reversedA: false,
        reversedB: false,
        clockwise: true,
      },
    ],
  };
  return {
    id: "sketch",
    name: "Sectores y tangencias",
    type: "sketch",
    plane: "XY",
    offset: 0,
    suppressed: false,
    profile,
  };
}

it("round trips both new constraints without losing directed-sector flags or tangent side", () => {
  const document = addFeature(createDocument(), sketch());
  expect(parseDocument(serializeDocument(document))).toEqual(document);
});

it.each(["external", "aContainsB", "bContainsA"] as const)(
  "retains the circular branch %s when persisting a document",
  (branch) => {
    const feature = sketch();
    const profile = feature.profile as EntityProfile;
    profile.points.push({ id: "d", x: 9, y: -2 });
    profile.entities.push({
      id: "secondCircle",
      type: "circle",
      center: "d",
      radius: 3,
      construction: false,
    });
    profile.constraints.push({
      id: "circularTangent",
      type: "tangent",
      a: "circle",
      b: "secondCircle",
      branch,
    });
    const document = addFeature(createDocument(), feature);
    expect(parseDocument(serializeDocument(document))).toEqual(document);
  },
);

it("retains the branch across coordinate/dimension edits, undo, redo and serialization", () => {
  const feature = sketch(),
    document = addFeature(createDocument(), feature),
    history = new DocumentHistory(document);
  const profile = structuredClone(feature.profile) as EntityProfile;
  profile.points.find((point) => point.id === "c")!.y = 5;
  const angle = profile.constraints.find(
    (constraint) => constraint.type === "angle",
  );
  if (angle?.type !== "angle") throw new Error("Expected angle");
  angle.value = 225;
  angle.reversedB = true;
  const changed = history.apply(
    updateFeature(document, feature.id, { profile }),
  );
  expect(history.undo()).toEqual(document);
  expect(history.redo()).toEqual(changed);
  expect(parseDocument(serializeDocument(changed)).features[0]).toMatchObject({
    profile: {
      constraints: [
        { type: "tangent", branch: "right" },
        {
          type: "angle",
          value: 225,
          reversedA: false,
          reversedB: true,
          clockwise: true,
        },
      ],
    },
  });
  expect(document.features[0]).toEqual(feature);
});
