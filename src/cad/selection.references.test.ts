import { describe, expect, it } from "vitest";
import type { EdgeReference, FaceReference, PickableEdge, PickableFace } from "./kernel.types";
import {
  createEdgeSelectionIndex,
  createFaceSelectionIndex,
  referenceIdentity,
  sameSelectionReference,
} from "./selection.references";

// Original symbolic reference DTOs. These tests exercise UI selection policy,
// not native topology, geometry or provenance attestation.
const ref = (kind: "face" | "edge", version: 1 | 2, digit: string, sourceFeatureId = "extrude-a") => ({
  sourceFeatureId,
  key: `${kind}-v${version}|${digit.repeat(64)}`,
});

describe.each(["face", "edge"] as const)("%s reference selection", (kind) => {
  const createIndex = kind === "face" ? createFaceSelectionIndex : createEdgeSelectionIndex;

  it("highlights a saved v1 alias through one current entry without changing the saved value", () => {
    const saved = ref(kind, 1, "1");
    const current = { ref: ref(kind, 2, "2"), aliases: [saved, saved] };
    const before = JSON.stringify({ saved, current });
    const index = createIndex([current]);
    expect(index.find(saved)).toBe(current);
    expect(index.selectedKeys([saved, current.ref])).toEqual(new Set([referenceIdentity(current.ref)]));
    expect(JSON.stringify({ saved, current })).toBe(before);
  });

  it("removes the original saved v1 on a primary-v2 click without appending or migrating it", () => {
    const saved = ref(kind, 1, "1"), unrelated = ref(kind, 1, "3");
    const current = { ref: ref(kind, 2, "2"), aliases: [saved] };
    const selected = [saved, unrelated];
    const index = createIndex([current]);
    expect(index.toggle(selected, current.ref)).toEqual([unrelated]);
    expect(selected).toEqual([saved, unrelated]);
    expect(index.toggle([saved, current.ref], current.ref)).toEqual([]);
  });

  it("stores only a plain primary reference on a new click and requires a current primary click", () => {
    const saved = ref(kind, 1, "1");
    const current = { ref: ref(kind, 2, "2"), aliases: [saved] };
    const index = createIndex([current]);
    const selected = index.toggle([], current.ref);
    expect(selected).toEqual([current.ref]);
    expect(selected?.[0]).not.toBe(current.ref);
    expect(Object.keys(selected![0]).sort()).toEqual(["key", "sourceFeatureId"]);
    expect(index.toggle([], saved)).toBeUndefined();
    expect(index.findPrimary(saved)).toBeUndefined();
  });

  it("never resolves a stored v2 through an alias or through a matching v1 primary", () => {
    const savedV2 = ref(kind, 2, "2"), savedV1 = ref(kind, 1, "1");
    const index = createIndex([
      { ref: ref(kind, 2, "3"), aliases: [savedV1, savedV2] },
      { ref: { ...savedV1, key: `${kind}-v1|${"2".repeat(64)}` }, aliases: [] },
    ]);
    expect(index.find(savedV2)).toBeUndefined();
    expect(index.selectedKeys([savedV2])).toEqual(new Set());
  });

  it("keeps kind and source scopes exact and supports legacy entries without aliases", () => {
    const saved = ref(kind, 1, "1");
    const wrongKind = ref(kind === "face" ? "edge" : "face", 1, "4");
    const entry = { ref: ref(kind, 2, "2"), aliases: [saved, { ...saved, sourceFeatureId: "other" }, wrongKind] };
    const index = createIndex([entry, { ref: ref(kind, 1, "3") }]);
    expect(index.find({ ...saved, sourceFeatureId: "other" })).toBeUndefined();
    expect(index.find(wrongKind)).toBeUndefined();
    expect(index.find(ref(kind, 1, "3"))?.ref).toEqual(ref(kind, 1, "3"));
  });

  it("rejects ambiguous aliases and primary collisions without arbitrary highlighting or toggling", () => {
    const saved = ref(kind, 1, "1");
    const a = { ref: ref(kind, 2, "2"), aliases: [saved] };
    const b = { ref: ref(kind, 2, "3"), aliases: [saved] };
    const selected = [saved];
    const index = createIndex([a, b]);
    expect(index.find(saved)).toBeUndefined();
    expect(index.selectedKeys(selected)).toEqual(new Set());
    expect(index.toggle(selected, a.ref)).toBeUndefined();
    expect(selected).toEqual([saved]);
    const duplicatePrimary = createIndex([a, { ref: { ...a.ref } }]);
    expect(duplicatePrimary.findPrimary(a.ref)).toBeUndefined();
    expect(duplicatePrimary.toggle([], a.ref)).toBeUndefined();
    const primaryAliasCollision = createIndex([a, { ref: saved }]);
    expect(primaryAliasCollision.find(saved)).toBeUndefined();
  });
});

it("preserves serializable aliases outside saved refs and returns the current planar frame", () => {
  const saved: FaceReference = ref("face", 1, "1");
  const frame = { origin: [7, -4, 9] as [number, number, number], xDirection: [1, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number] };
  const face: PickableFace = { ref: ref("face", 2, "2"), aliases: [saved], frame, vertices: [], triangles: [] };
  const edge: PickableEdge = { ref: ref("edge", 2, "2"), aliases: [ref("edge", 1, "1")], lines: [] };
  const transport = JSON.parse(JSON.stringify({ face, edge })) as { face: PickableFace; edge: PickableEdge };
  expect(createFaceSelectionIndex([transport.face]).find(saved)?.frame).toEqual(frame);
  expect(createEdgeSelectionIndex([transport.edge]).find(edge.aliases![0])?.ref).toEqual(edge.ref);
  expect(Object.keys(transport.face.ref).sort()).toEqual(["key", "sourceFeatureId"]);
  expect(createFaceSelectionIndex([{ ...face, frame: null }]).find(saved)?.frame).toBeNull();
});

it("compares saved list items exactly even when stale and avoids tuple-key collisions", () => {
  const saved: EdgeReference = ref("edge", 1, "1");
  expect(sameSelectionReference(saved, { ...saved })).toBe(true);
  expect(sameSelectionReference(saved, { ...saved, key: ref("edge", 2, "2").key })).toBe(false);
  expect(referenceIdentity({ sourceFeatureId: "a|b", key: "c" })).not.toBe(referenceIdentity({ sourceFeatureId: "a", key: "b|c" }));
});
