import type { EntityProfile } from "./types";
import { validateEntityProfile } from "./validation";

/** Compare complete geometry/connectivity while allowing fresh creation IDs. */
export function canonicalCreatedIdentities(profile: EntityProfile, source: EntityProfile): EntityProfile {
  validateEntityProfile(source);
  validateEntityProfile(profile);
  const retained = new Set(["origin", ...source.points.map(p => p.id),
    ...source.entities.map(e => e.id), ...source.constraints.map(c => c.id)]);
  const roles = new Map<string, string>();
  for (const [kind, items] of [["point", profile.points], ["entity", profile.entities],
    ["constraint", profile.constraints]] as const) {
    items.filter(item => !retained.has(item.id)).forEach((item, index) => roles.set(item.id, `created:${kind}:${index}`));
  }
  return JSON.parse(JSON.stringify(profile, (_key, value: unknown) =>
    typeof value === "string" ? roles.get(value) ?? value : value)) as EntityProfile;
}
