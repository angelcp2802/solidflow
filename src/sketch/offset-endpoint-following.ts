import type { EntityProfile } from "./types";

/** Release requested boundary identities in a validated, detached edit candidate. */
export function releaseOffsetEndpointFollowing(profile: EntityProfile, pointIds: ReadonlySet<string>): void {
  if (!pointIds.size) return;
  const entities = new Map(profile.entities.map(entity => [entity.id, entity]));
  for (const relation of profile.constraints) {
    if (relation.type !== "offset" || relation.closed || relation.cap !== "none") continue;
    for (const image of relation.images) {
      if (image.lineEndpointMode === "aligned" || !image.lineEndpointFollowing) continue;
      for (const end of [0, 1] as const) {
        if (!image.lineEndpointFollowing[end]) continue;
        const index = end === 0 ? 0 : relation.sources.length - 1, source = relation.sources[index];
        const entity = entities.get(image.entityIds[index])!;
        if (entity.type !== "line") continue;
        const pointId = (end === 0) !== source.reversed ? entity.start : entity.end;
        if (pointIds.has(pointId)) image.lineEndpointFollowing[end] = false;
      }
    }
  }
}
