import { describe, expect, it, vi } from "vitest";
import type { EntityProfile } from "./types";
import { createSketchIdAllocator } from "./ids";

const empty = (): EntityProfile => ({ kind: "entities", points: [], entities: [], constraints: [] });
const namespace = "b9d3d321-4dba-4e64-a75a-032b94b149ef";

describe("generated sketch identity allocation", () => {
  it("allocates lazily with one namespace for every kind in a proposal", () => {
    const factory = vi.fn(() => namespace);
    const allocate = createSketchIdAllocator(empty(), "offset", factory);
    expect(factory).not.toHaveBeenCalled();
    const ids = [allocate("point"), allocate("entity"), allocate("constraint"), allocate("point")];
    expect(factory).toHaveBeenCalledTimes(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => id.length <= 128 && id.includes(namespace))).toBe(true);
  });

  it("terminates with a repeated namespace and checks points, entities and constraints together", () => {
    const first = createSketchIdAllocator(empty(), "mirror", () => namespace);
    const occupiedIds = [first("entity"), first("entity"), first("entity")];
    const profile: EntityProfile = {
      kind: "entities",
      points: [{ id: occupiedIds[0], x: 1, y: 0 }],
      entities: [{ id: occupiedIds[1], type: "line", start: "origin", end: occupiedIds[0], construction: false }],
      constraints: [{ id: occupiedIds[2], type: "horizontal", entityId: occupiedIds[1] }],
    };
    const before = structuredClone(profile);
    const factory = vi.fn(() => namespace);
    const allocate = createSketchIdAllocator(profile, "mirror", factory);
    const created = [allocate("entity"), allocate("point"), allocate("constraint")];
    expect(created.every(id => !occupiedIds.includes(id) && id !== "origin")).toBe(true);
    expect(new Set([...occupiedIds, ...created]).size).toBe(6);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(profile).toEqual(before);
  });
});
