# Rigid assembly configuration evaluation

The separate [state solve planner](ASSEMBLY_CONFIGURATIONS_SCOPE.md) groups
active states by exact source tuple and selector, retaining every placed
instance and ordering dependencies child before parent. A declaration plan
does not establish current native reference availability or solvability.

`validateAssemblyConfigurationDeclarations` shares the evaluator's source,
catalog, dormant-selector, capture and byte-envelope parser. It returns only
owned normalized declarations. It counts effective relation budgets for all
intrinsic states, but does not expand occurrence placements, compute availability
diagnostics or grant native authority. Consumers
that need a complete evaluated graph must still call the full evaluator.

This standalone model layer evaluates named states of an existing assembly
graph. It is a prerequisite for saved configurations, rather than an editor or
document-format integration. The current v2 parser still rejects configuration
fields. Existing documents and their production traversal remain unchanged.

## Declarations and identity

`evaluateAssemblyConfiguration(document, catalog, rootConfiguration)` receives
an existing assembly document and a separate configuration catalog. Each catalog
entry owns an exact assembly definition tuple and an array of named
configurations. The root may own an entry too. A part cannot own assembly
configurations. IDs are local to their owning assembly; display names and
geometric equality do not identify configurations or source revisions.

Each configuration has an ID, name and two explicit override arrays:

| Record | Allowed fields |
| --- | --- |
| Occurrence override | Exact direct `occurrenceId`; optional `pose`, `suppressed`, `visible`, child assembly `configuration`. |
| Mate override | Exact direct `mateId`, explicit `suppressed` boolean and optional complete mechanical `capture`. |

The optional `mateDeclarations` list replaces Base's entire relation list for
that named state; absence inherits Base and `[]` declares no relations. Mate
overrides address the resulting list. See the [editing contract](ASSEMBLY_CONFIGURED_RELATION_EDITING.md)
for exact-state changes and Base isolation.

Omitting a selector, or using null, means the existing base state. Named
variants inherit directly from base declarations, without chains of variant
inheritance. A configuration may select a named variant on a direct child
assembly. Selection is local to that occurrence: another occurrence of the
same source may select base or a different variant. A part occurrence rejects
a configuration selector, including null. This layer does not override fixed
state, source revisions, names, material geometry or feature dimensions.

The source graph remains the same declaration graph. Selecting a variant does
not duplicate definitions, generate a new revision or make a rigid child into
a flexible instance. Two uses of the same selected state share its local
declaration, while their complete placement and reference paths stay distinct.

Named mate captures use the strict [capture/winding contract](ASSEMBLY_CONFIGURATIONS_STATE.md).
Only concentric/lock/gear/screw/rack-pinion capture fields use capture overrides;
references and parameters belong to the selected declaration list. Core evaluation
applies the selected capture before exposing effective mates. These are
authored values, without historical recapture or native satisfaction authority.

## Owned, bounded evaluation

The source and catalog are detached before evaluation. Catalog validation uses
own data fields and dense arrays; unknown fields, accessors, hooks, explicit
undefined, duplicate identities and foreign direct-child overrides reject.
All declared variants are checked, including unselected ones. Child selectors
must name a variant at the exact referenced assembly tuple.

There may be at most 64 configurations per owner, 512 across the catalog and
4,096 occurrence/mate override and explicit relation-declaration rows in total.
Effective expanded relation counts are also capped at 4,096 in every intrinsic
state, including dormant variants and repeated uses. The combined owned source, catalog
and root selector must fit 20 MiB of UTF-8 JSON with two-space indentation.
Existing source
definition, depth, feature and expanded declaration budgets remain in force;
suppression does not bypass their validation. These are declaration limits,
not a promise about native kernel execution time or memory.

The deeply frozen result contains the owned inputs, effective scopes and
expanded parts with full paths, source identities, local state chains,
composed world placements and configuration ancestry. Suppressed declarations
remain in the evaluation with inherited flags. Visibility is display state;
it does not suppress material geometry or disable a relation. The top-level
rigid owner remains the first occurrence in the full path.
The result is an in-memory view with shared owned definitions, rather than a
saved-file or worker-transport representation of the expanded graph.

## Relation availability

Every effective active relation in an active scope retains its ordered
endpoint roles. Component paths resolve through the effective selected state.
Missing occurrences, paths through parts, stale terminal source tuples and
suppressed endpoints are reported with scope path, relation ID, role and
component path. Repeated roles are not merged. Null endpoints retain the
declaring scope's frame.

A configuration cannot silently retarget an unavailable endpoint or disable
its relation. Explicit relation suppression may disable that relation in the
selected state. Hidden endpoints remain available. The result distinguishes
available declarations from unavailable component references; neither status
attests a native face, body, analytic purpose, solved pose or satisfied mate.

## Evidence and remaining integration

Original tests use two boxes with independent volumes, areas and literal
transformed bounds. Separate native tests build the actual source BReps and
place them using evaluated poses. They inspect material geometry without
inventing a current document snapshot or issuing private solve/Apply authority.
See [fixture provenance](PROVENANCE.md) and [actual validation](VALIDATION.md)
for executed cases and bands; configured tests do not imply a passing result.

The separate [configured native context](ASSEMBLY_CONFIGURATIONS_NATIVE.md)
adds purpose-specific native observations and private context-bound assertions.
It does not turn this evaluation into a saved document or solver capability.

The [effective relation layer](ASSEMBLY_CONFIGURATIONS_RELATIONS.md) inspects
selected declarations and resolves native roles with a separate aggregate
lifetime. Neither its diagnostics nor reference admission proves satisfaction.

The separate [numerical layer](ASSEMBLY_CONFIGURATIONS_NUMERIC.md) adds detached
constraints and bounded independent hinge/profile/path support measurements.
Saved syntax, authoring and selection in the editor, production variant-aware
solving/writeback, BOM/export/source-update behavior and the complete
configuration lifecycle still need integration. Direct selectors on
base occurrences also need representation in that integration; the standalone
catalog selects child variants through explicit named parent states. This is
not a requirement to create a hidden parent variant in the editor. In particular, a
solver keyed only by source tuple must not write a configured pose into base
or another named state. Flexible per-instance solving, part configurations,
broader configuration parameters and the complete assembly/demo acceptance
remain separate requirements. This layer does not establish external
application parity or platform support.
