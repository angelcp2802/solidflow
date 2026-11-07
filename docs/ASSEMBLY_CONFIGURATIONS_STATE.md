# Configuration capture and winding state

The standalone [solve/writeback transaction](ASSEMBLY_CONFIGURATIONS_SOLVE.md)
preserves these complete captures while updating exact-state lifted angles.
Its base writeback explicitly isolates named inheritance. Native recapture and
saved/editor lifecycle remain separate.

The [selected-state planner and scoped numerical adapter](ASSEMBLY_CONFIGURATIONS_SCOPE.md)
retain these effective capture declarations while separating local numerical
bodies from placed physical owners. They do not recapture values or implement
the remaining state-specific solve/writeback transaction.

This standalone layer separates mechanical capture/winding values from
configuration parameters and native capture authority. It extends the
[configuration core](ASSEMBLY_CONFIGURATIONS_CORE.md) with optional named-state
capture overrides. It adds no saved v2 field, editor operation, configured solve
transaction or Apply capability.

## Exact state identity

The sidecar state catalog is an array of complete entries:

```ts
{
  definition: { id, revision },
  configuration: string | null,
  mateId: string,
  state: { type, /* complete family-specific capture fields */ }
}
```

The exact key is `(definition.id, definition.revision, configuration, mateId)`.
Null denotes the source base state and is distinct from every named variant.
Occurrence paths, display names and equal current poses do not identify a
state. A reused assembly selecting the same state shares that intrinsic data;
its placed occurrences and native proofs remain distinct.

Every entry must name an existing assembly definition, declared configuration
(or null base), direct mate and matching supported mechanical family. Unknown,
stale, duplicate, unused and dormant entries are checked rather than ignored.
Suppression does not erase retained multi-turn values or capture frames.

## Complete capture records

| `type` | Required capture fields besides `type` |
| --- | --- |
| `concentric` | `rotationLock`: quaternion or explicit null |
| `lock` | `relativePose` |
| `gear` | `neutralRotations`, lifted `angles`, `phase` |
| `screw` | `neutralRotation`, `neutralTravel`, lifted `angle` |
| `rack-pinion` | `neutralRotation`, `neutralTravel`, lifted `angle` |

These are complete replacements of the selected family's capture data, not
partial field patches. Existing family syntax validates finite scalars, poses
and quaternions. Lifted radians are not wrapped. Gear phase and the declared
neutral travel retain their existing family units: angles and gear phase are
radians (gear phase is weighted); neutral travel and pose translations are mm.
Reference roles, ratio,
lead, conversion, alignment and other authored parameters are not capture
fields and cannot be smuggled into a state record.

The low-level `validateAssemblyConfigurationCapture(baseMate, input)` and
`applyAssemblyConfigurationCapture(baseMate, capture)` detach and validate the
capture or resulting full mate. They do not depend on the configuration core,
mutate the base mate or authenticate how the values were obtained.

A closed batch validator may retain its own validated, frozen source mate.
State processing caches that validator only within one operation and by the
exact source tuple, declaration origin and mate ID. A named state inheriting
Base shares Base's declaration validator; an explicit named relation list has
its own configuration key. The sidecar state key still includes its selected
configuration. Every capture passes the complete nested syntax parser, and
every selected configuration is checked even on a declaration-validator cache hit.
No caller-owned input or native proof is cached across operations.

## Pure state operations and the core bridge

`validateAssemblyConfigurationState(document, catalog, state)` returns a
validated owned, deeply frozen sidecar. `effectiveAssemblyConfigurationMate`
returns the complete selected mechanical declaration: parameters and references
from that state's explicit relation list or inherited Base, effective mate
suppression, and capture data for the exact state.
An explicit sidecar entry takes precedence over that named variant's existing
capture; an absent sidecar entry uses its existing named capture, then the
source declaration. This inheritance never means that a variant was freshly
recaptured.

`updateAssemblyConfigurationState` inserts or replaces one complete exact-key
entry while preserving other states and their order. It validates the entire
candidate before returning it; rejection leaves the source, catalog and prior
state unchanged.

`materializeAssemblyConfigurationNamedState` connects the sidecar to the actual
core catalog. It rejects any null/base entry. For each named entry it writes
only `capture` on the exact variant's mate override. Existing suppression is
preserved; a newly created mate row inherits the source mate's suppression.
Occurrence poses, visibility, child selectors, other mates, other captures and
other variants remain unchanged. All output is revalidated and owned/frozen.
Base capture still belongs to the source mate and needs a separate explicit
source transaction.

The core admits `{ mateId, suppressed, capture? }` on named mate overrides and
applies capture when constructing effective `scopes.mates`. The
[native context](ASSEMBLY_CONFIGURATIONS_NATIVE.md) still receives exactly
`{ document, catalog, rootConfiguration, generation }`. Its normalized catalog
signature includes these captures, so changing capture data invalidates its
current witnesses and relation aggregates. The
[relation inventory](ASSEMBLY_CONFIGURATIONS_RELATIONS.md) and
[numerical bridge](ASSEMBLY_CONFIGURATIONS_NUMERIC.md) consume those effective
mate values without writing them into source declarations.

## Bounds and authority

Inputs use exact own data records and dense arrays. Accessors, hooks, unknown
fields, explicit undefined and malformed nested data reject. The sidecar admits
at most 4096 distinct entries and bounds the combined owned source, catalog and
state JSON envelope to 20 MiB. Materialization also retains the core's existing
configuration/override and combined byte limits; no budget is raised.

These values are **authored declaration data**. An exact tuple and valid syntax
do not prove historical capture validity, current material correspondence or
satisfaction. In particular, changing source references while retaining a tuple
and mate ID requires a separately bound repair/recapture policy. This layer
cannot detect that history or invent a valid capture to fit a relation.

Complete configuration support still requires a variant-keyed solve dependency
and writeback transaction, complete-context freshness, independent final native
verification, capture/parameter-change policy, saved selectors, history/editor
integration and all source/repair/BOM/export consumers. Relation parameters and
part feature variants remain distinct missing contracts; capture fields do not
stand in for them. Independently solved flexible instances and full assembly
acceptance remain open. Executed checks belong to the validation record, not
this contract.
