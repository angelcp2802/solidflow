import { describe, expect, it, vi } from "vitest";
import type { EntityProfile, SketchSelection } from "./types";
import { planSketchOffset, type OffsetParameters } from "./offset";
import { planSketchMirror } from "./mirror";
import { planSketchFillet } from "./fillet";
import { planSketchChamfer } from "./chamfer";
import { canonicalCreatedIdentities } from "./identity.test-helpers";
import { removeSelection } from "./editing";
import { solveSketch } from "./solver";
import { solveOffsetApplication } from "./offsetApplication";
import { createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from "../model/document";

// Original Cartesian fixtures in millimetres; no external files or CAD runtime.
const pick = (...ids: string[]): SketchSelection[] => ids.map(id => ({ kind: "entity", id }));
const options: OffsetParameters = { distance: 2, reverse: false, bothDirections: false,
  chain: true, cap: "none", construction: "none", addDimensions: true };
const identities = (profile: EntityProfile) => [...profile.points, ...profile.entities,
  ...profile.constraints].map(item => item.id);
function corner(): EntityProfile {
  return { kind: "entities", points: [
    { id: "a-end", x: 10, y: 0 }, { id: "b-end", x: 0, y: 10 },
    { id: "axis-a", x: 20, y: -1 }, { id: "axis-b", x: 20, y: 1 },
  ], entities: [
    { id: "a", type: "line", start: "origin", end: "a-end", construction: false },
    { id: "b", type: "line", start: "origin", end: "b-end", construction: false },
    { id: "axis", type: "line", start: "axis-a", end: "axis-b", construction: true },
  ], constraints: [] };
}
const commands = [
  { name: "offset", create: (profile: EntityProfile) => planSketchOffset(profile, pick("a"), options),
    reject: (profile: EntityProfile) => planSketchOffset(profile, pick("a"), { ...options, distance: 0 }) },
  { name: "mirror", create: (profile: EntityProfile) => planSketchMirror(profile, pick("a", "b"), { axisEntityId: "axis" }),
    reject: (profile: EntityProfile) => planSketchMirror(profile, pick("a"), { axisEntityId: "missing" }) },
  { name: "fillet", create: (profile: EntityProfile) => planSketchFillet(profile, pick("a", "b"), { radius: 2, cornerPolicy: "keep" }),
    reject: (profile: EntityProfile) => planSketchFillet(profile, pick("a", "b"), { radius: 0, cornerPolicy: "keep" }) },
  { name: "chamfer", create: (profile: EntityProfile) => planSketchChamfer(profile, pick("a", "b"), { mode: "equal", distance: 2 }),
    reject: (profile: EntityProfile) => planSketchChamfer(profile, pick("a", "b"), { mode: "equal", distance: 0 }) },
];

describe("fresh generated sketch identities", () => {
  it.each(commands)("gives separate $name creations disjoint IDs without changing geometry or retained identities", command => {
    const source = corner(), before = structuredClone(source), retained = new Set(identities(source));
    const first = command.create(source), second = command.create(source);
    expect(first.changed, first.message).toBe(true);
    expect(second.changed, second.message).toBe(true);
    const freshFirst = identities(first.profile).filter(id => !retained.has(id));
    const freshSecond = identities(second.profile).filter(id => !retained.has(id));
    expect(freshFirst.length).toBeGreaterThan(0);
    expect(freshSecond).toHaveLength(freshFirst.length);
    expect(freshSecond.every(id => !freshFirst.includes(id))).toBe(true);
    expect([...retained].every(id => identities(first.profile).includes(id) && identities(second.profile).includes(id))).toBe(true);
    expect(canonicalCreatedIdentities(second.profile, source)).toEqual(canonicalCreatedIdentities(first.profile, source));
    expect(source).toEqual(before);
  });

  it.each(commands)("does not allocate or mutate for an early invalid $name request", command => {
    const source = corner(), before = structuredClone(source), uuid = vi.spyOn(crypto, "randomUUID");
    try {
      const result = command.reject(source);
      expect(result.changed).toBe(false);
      expect(result.profile).toBe(source);
      expect(uuid).not.toHaveBeenCalled();
      expect(source).toEqual(before);
    } finally { uuid.mockRestore(); }
  });

  it("does not alias a deleted offset on recreation and preserves the accepted IDs through edit, reopen and history", () => {
    const source: EntityProfile = { kind: "entities", points: [{ id: "end", x: 10, y: 0 }],
      entities: [{ id: "source", type: "line", start: "origin", end: "end", construction: false }],
      constraints: [{ id: "end-fix", type: "fix", pointId: "end", x: 10, y: 0 }] };
    const current = solveSketch(source);
    expect(current.status).toBe("fullyDefined");
    const document = validateDocument({ ...createDocument("Original identity lifecycle fixture"), features: [
      { id: "sketch", type: "sketch", name: "Offset source", plane: "XY", offset: 0, suppressed: false, profile: current.profile },
    ] });
    const history = new DocumentHistory(document);
    const profileOf = (value: Document): EntityProfile => {
      const feature = value.features[0];
      if (feature.type !== "sketch" || feature.profile.kind !== "entities") throw new Error("Expected entity sketch");
      return feature.profile;
    };
    const retained = new Set(identities(current.profile)), uuid = vi.spyOn(crypto, "randomUUID");
    try {
      const first = planSketchOffset(current.profile, pick("source"), options);
      const acceptedFirst = solveOffsetApplication(current, first);
      expect(acceptedFirst.accepted).toBe(true);
      if (!acceptedFirst.accepted) throw new Error(acceptedFirst.message);
      expect(identities(acceptedFirst.solution.profile)).toEqual(identities(first.profile));
      history.apply(updateFeature(history.current, "sketch", { profile: acceptedFirst.solution.profile }));
      const firstIds = identities(first.profile).filter(id => !retained.has(id));
      const removed = removeSelection(acceptedFirst.solution.profile, pick(...first.imageEntityIds));
      expect(removed).toEqual(current.profile);
      expect(firstIds.every(id => !identities(removed).includes(id))).toBe(true);
      history.apply(updateFeature(history.current, "sketch", { profile: removed }));
      const afterDelete = serializeDocument(history.current), currentAgain = solveSketch(removed);
      const second = planSketchOffset(currentAgain.profile, pick("source"), options);
      const acceptedSecond = solveOffsetApplication(currentAgain, second);
      expect(acceptedSecond.accepted).toBe(true);
      if (!acceptedSecond.accepted) throw new Error(acceptedSecond.message);
      const secondIds = identities(acceptedSecond.solution.profile).filter(id => !retained.has(id));
      expect(secondIds).toHaveLength(firstIds.length);
      expect(secondIds.every(id => !firstIds.includes(id))).toBe(true);
      expect(identities(acceptedSecond.solution.profile)).toEqual(identities(second.profile));
      const image = acceptedSecond.solution.profile.entities.find(entity => entity.id === second.imageEntityIds[0]);
      if (image?.type !== "line") throw new Error("Expected offset line");
      expect(acceptedSecond.solution.profile.points.find(point => point.id === image.start)).toMatchObject({ x: 0, y: -2 });
      expect(acceptedSecond.solution.profile.points.find(point => point.id === image.end)).toMatchObject({ x: 10, y: -2 });
      const stale = planSketchOffset(acceptedSecond.solution.profile, pick(first.imageEntityIds[0]), options);
      expect(stale.changed).toBe(false);
      expect(stale.profile).toBe(acceptedSecond.solution.profile);
      history.apply(updateFeature(history.current, "sketch", { profile: acceptedSecond.solution.profile }));
      const recreated = serializeDocument(history.current);
      expect(identities(profileOf(parseDocument(recreated)))).toEqual(identities(second.profile));
      expect(serializeDocument(history.undo())).toBe(afterDelete);
      expect(serializeDocument(history.redo())).toBe(recreated);
      const edited = profileOf(parseDocument(recreated));
      const distance = edited.constraints.find(constraint => constraint.type === "offsetDistance");
      if (distance?.type !== "offsetDistance") throw new Error("Expected offset driver");
      distance.value = 3;
      const solved = solveSketch(edited);
      expect(solved.status, solved.message).toBe("fullyDefined");
      expect(identities(solved.profile)).toEqual(identities(second.profile));
      expect(solved.profile.points.find(point => point.id === image.start)?.y).toBeCloseTo(-3, 7);
      expect(solved.profile.points.find(point => point.id === image.end)?.y).toBeCloseTo(-3, 7);
      expect(uuid).toHaveBeenCalledTimes(2);
    } finally { uuid.mockRestore(); }
  });
});
