# Feature recipe regeneration

Feature regeneration evaluates selected operations again at each instance
against the current working target. The integrated initial path connects
[recipe declarations](FEATURE_RECIPES.md), explicit-frame native construction,
chronological evaluation and atomic body-catalog publication. It supports
intrinsic rectangle/circle cuts and merge extrusions, blind/ThroughAll endings,
explicitly selected targets, no reference policies and no variation. Dynamic ALL
currently supports the intrinsic cut subset; additive ALL remains pending.
[Geometry contribution patterns](FEATURE_PATTERNS.md) keep their separate
signed-material-copy contract. This initial path does not complete the full
feature-pattern goal. Source-specific results belong in [VALIDATION](VALIDATION.md).

## Saved regeneration mode

Linear, circular and mirror feature repetitions opt in explicitly:

```ts
source: { mode: 'features', geometryPattern: false, featureIds: string[] }
featurePattern: {
  mode: 'regenerate';
  scope: 'selected';
  targets: BodyReference[];
  bindings: { source: BodyReference; targetBodyIds: string[] }[];
  referencePolicies: [];
  variation: { kind: 'none' };
}
```

Every source names an exact historical output state; selected targets must be
exact current states. Dynamic ALL has a distinct saved variant:

```ts
featurePattern: {
  mode: 'regenerate';
  scope: 'all';
  reevaluateAt: 'patternInput';
  bindings: { source: BodyReference; targetBodyIds: 'scope' }[];
  referencePolicies: [];
  variation: { kind: 'none' };
}
```

ALL uses the same feature source with `geometryPattern:false`. It saves neither
`targets` nor a derived current snapshot; an own targets field is invalid even
when undefined. Every binding follows the scope. AUTO is not an accepted saved
variant. Geometry/true continues to use explicitly selected targets.

Limits are 32 source features, 32 selected targets or 256 current ALL owners,
512 bindings and 512 active source/placement/owner applications. The actual ALL
inventory counts before target copies or tools, including no-op and equivalent
event routes. Separate closure/serialization budgets also apply; exceeding any
budget rejects rather than silently dropping members.
Requested exact recipe states across a rebuild have a separate 512-record
limit. The parser rejects contradictory modes and false without this explicit
declaration. A geometric copy is never a fallback for failed regeneration.
No saved plan, ordinal, closure, native handle or instance body ID is added.
Feature-mode mirror retains `mergeBodies:false`; its transformed tools modify
the routed existing owners rather than using body-copy merge policy.

The property panel exposes `Copiar geometría` and `Recalcular operaciones` for
explicit feature patterns, with the source flag updated together with the saved
mode. That control and programmatic document tests do not establish real editor
interaction or worker preview/Apply coverage.

## Dynamic ALL scope

The engine resolves every current native owner at the pattern-input boundary on
each rebuild. Adding an earlier body or advancing an existing owner's current
state changes the derived snapshot without editing the saved ALL intent. Exact
historical source poststates remain separate: they never follow those current
target updates or acquire ownership from a coincident body.

The complete native inventory participates in the freshness proof, including
remote and no-op owners. Refs, lineages, shape identity, the current definitions,
scope intent and evaluator revision are checked before evaluation and again at
staging. Pure commands attest the whole document, declaration, catalog and empty
manual selection; native availability still requires the real preview. A stale
snapshot, omitted member or copied proof cannot authorize publication. Derived
targets are preview data only and are not written back into the declaration.

The property panel exposes selected versus ALL scope only for regeneration.
Changing selected→ALL removes the target list and routes each exact source to
scope. Changing ALL→selected creates an empty draft requiring explicit target
selection; it never guesses current targets. Geometry copying requires selected
scope first. ALL displays paginated current names rather than target checkboxes.
Render and property labels do not attest materialization or real interaction.

Only finally changed owners receive the pattern poststate. Contextual structural
association can keep an old ref or a potential body@pattern ref loadable for
repair; exact native lookup rejects the latter when that owner was a no-op.
Deleting a creator removes its exact downstream consumers and their dependents,
including consumers through ALL. The dynamic pattern itself does not depend on
every catalog member. Creator association uses the original structural context,
including suppressed/repairable states, and never substitutes a nearby identity.

ALL additive merge recipes report `ALL_POSITIVE_SCOPE_PENDING` before target
copies or tools. Applicability to a remote owner has not been established;
exceptions are not silently interpreted as misses. Selected additive behavior
is unchanged. AUTO requires genuine native discovery and an explicit saved
capture/follow policy; a final-replacement list cannot stand in for owners
affected by intermediate events. These remain required capabilities, not
successful parity demonstrated by rejection.

The 54 additional authored cases have distinct boundaries:
[17 model/command and seven SSR](PROVENANCE.md#dynamic-all-model-and-rendered-fixtures),
[18 native scope/evaluator](PROVENANCE.md#native-dynamic-recipe-scope-fixtures),
[eight saved-engine](PROVENANCE.md#saved-all-engine-acceptance-fixtures) and
[four creator-deletion](PROVENANCE.md#dynamic-all-creator-deletion-fixtures).
Actual executions and retained failures belong in [VALIDATION](VALIDATION.md).

## Explicit-frame primitive input

The builder accepts one circle or rectangle profile, its already-resolved
orthonormal frame, signed depth, an add/subtract operation, and a termination:
blind, ThroughAll, UntilNext or UpToSurface. It creates an actual native Plane,
Sketch and extrusion using that explicit frame. An intrinsic sketch does not
need a fabricated support or a hidden saved datum. No document IDs or saved
planes are allocated by this component.

The resolved frame origin already includes sketch offset. The local profile
center is applied once with `framePoint`; the local Y axis is `normal × X`.
The recipe evaluator must supply signed reflection parity: X′=QX,
N′=det(Q)QN and depth′=det(Q)depth. This preserves the physical extrusion ray
Q(sign(depth)N). A limiting plane's normal has its separate geometric transform
policy; an evaluator must not substitute a profile's signed normal for it.

Profile dimensions and depth magnitude must be 0.01..100000 mm; local profile
center coordinates stay within ±1000000 mm. Frame coordinates and computed
profile/start/end points must be finite. Frame X and normal must be unit and
orthogonal within 1e-8; the builder rejects arbitrary axes instead of repairing
them. Calculated prism length is 1e-7..10000000 mm and calculated start magnitude
is at most 10000000 mm. This is an internal typed interface after strict recipe
parsing, not a raw-document descriptor/prototype validation boundary.

For physical ray `sign(depth)·normal`, a prism of length L starting at s moves
its profile center by `ray·s` and extrudes by `sign(depth)·L`. Blind symmetry
uses `s=−abs(depth)/2`. There is no second sketch-offset application.

## Current target and termination

ThroughAll and UntilNext require the current detached working owner for the
specific instance. The caller must resolve and attest that exact owner/history;
a scene aggregate is not its substitute. The builder makes a native geometric
copy with `copyBodyShape` before calling the existing termination helpers,
protecting borrowed input topology. `Shape.clone()` shares topology and does
not provide this isolation. This is an input copy, not a copied feature delta.

Subtractive ThroughAll constructs an enclosing tool; its artificial margins
do not become the resulting body's boundary. Additive ThroughAll uses actual
exit surfaces. UntilNext cutting stops at a complete exit and an additive
operation at entry. BothDirections uses the supplied signed physical ray and
the existing native helper's two-direction semantics. UpToSurface requires
exactly one explicit resolved plane frame or available borrowed native face;
the helper constructs/clones its own limit. Saved reference ownership, face
role correspondence and historical/native availability remain caller checks.

The caller supplies a validator for every primitive and final helper result.
It must inspect actual native BRep validity, closed-solid cardinality, positive
finite volume and finite bounds without consuming or mutating the tool.
Finite input scalars alone do not establish valid geometry. The returned tool
is owned by the caller; owner Boolean, no-op comparison and catalog publication
are separate operations.

## Ownership and failure limits

Borrowed input wrappers are never deleted by the builder. Each wrapper received
and owned by it gets at most one explicit delete attempt, marked before calling
native release. Cleanup failure is fatal: a received result is released once,
the primary construction/validation error is retained as cause when present,
and cleanup errors remain observable.

Replicad 1.1.0 `Sketch.extrude` consumes the sketch before returning its solid.
The builder adapts `delete` only on that newly owned Sketch instance, records
its release error and avoids a second attempt. This lets a subsequently
returned solid be observed and released before the failure escapes. It does
not patch a global/prototype or change borrowed objects.

An attempted delete is not proof of successful release. Sketch/Plane release
can be internally sequential; factories and extrusion GC can throw before
returning an allocation. End-condition helpers now hold received wrappers and
candidate results in a shared scope until cleanup succeeds, preserving errors
instead of masking them in finally. SDK allocations lost before return and
unattempted native child releases remain outside that guarantee. Primitive
construction uses the shared scope for both prism and final tool, including
failed registration of a received wrapper. No native OOM or total leak-freedom
claim is made.

## Chronological evaluation and exact ownership

[kernel.feature-recipes.ts](../src/cad/kernel.feature-recipes.ts) extracts a fresh
closure and attests all historical sources and current targets before the first
target copy or tool. The engine captures requested full owner poststates before
their producer's transaction commits. Capture uses detached per-owner shapes,
not scene aggregates or signed deltas. Later modification or consumption does
not replace an exact historical source with the body's latest current state.
An ordinary failed source capture rejects its consumer; classified native
cleanup/Aggregate failures remain fatal. A potential no-op output does not create
a historical state.

The evaluator preserves canonical address order and visits selected operations
in saved history order within each address. Each following address receives the
preceding address's completed working owners. Each actual tool uses the current
progressive target, so a ThroughAll child sees a preceding selected boss. For
the initial fixed intrinsic context, equivalent routes from one feature event
to one target build one full tool after every exact source is attested. All
routes still count against the budget. Differing associative or owner-dependent
contexts require a later explicit evaluation/correspondence policy.

Selected parents publish virtual body roles keyed by exact source poststate,
target body ID, address and role, including a parent that changes no material.
These are local semantic existence/revision records, not saved BodyReferences
or retained parent BReps/faces. Exact event-output correspondence for associative
children remains required; the latest working face cannot supply it.

Working material may temporarily have several native-valid closed solids with
finite bounds and no loose topology. They retain one virtual owner until a later
recipe reconnects them. A successful nonnull topology-free compound is the only
accepted empty state; a sheet, debris, failed builder or near-zero volume alone
does not establish emptiness. A blind operation can restore such an empty state.
Dynamic termination against empty material still needs a separate extent policy.
Every final owner must be one valid closed solid. Every active address and the
complete pattern must change material in some routed owner; equal final volume
alone is insufficient. Only finally changed owners advance to the pattern state.

Staging re-extracts the current closure, checks its fingerprint and evaluator
revision, and rechecks exact native source/target identity and lineage. The
caller must supply the current document. All changed candidates are copied into
one uncommitted catalog proposal and evaluator cleanup finishes before that
proposal returns. The engine prepares complete cache maps before publication,
then adopts catalog/cache ownership together. Ordinary pre-commit geometry or
staging rejection preserves prior owners. Failures identified by the owned
cleanup/publication protocol retain their primary causes and propagate fatally.

The [component fixtures](PROVENANCE.md#chronological-recipe-evaluator-fixtures)
and [saved engine fixtures](PROVENANCE.md#saved-regeneration-engine-fixtures)
have different boundaries. The latter exercise parser/serialization, historical
and current ownership, selected dependent operations, no-op states, undo/redo
and late atomic rejection. They do not establish real picking or independent
export interoperability.

## Per-instance native recipe bridge

`buildRecipeInstanceTool` in [kernel.recipe-instance.ts](../src/cad/kernel.recipe-instance.ts)
connects an extracted fixed-profile recipe to real native tool construction.
It accepts the exact active canonical address and target body ID, obtains its
frame/depth only from `fixedProfileInstanceInput`, checks the operation's route
to the exact extracted target state, and returns an owned add/subtract tool.
It accepts no arbitrary caller transform or source frame and never uses a
captured material delta as a regeneration substitute.

This bridge is limited to the initial `mode:'regenerate'`,
`geometryPattern:false` declaration subset: selected targets or cut-only ALL,
no variation, intrinsic rectangle/circle profiles, owned cut/merge and
blind/ThroughAll termination. Selected scope checks its exact saved target
routes; ALL checks the attested derived target snapshot and scope routes.
UntilNext/UpToSurface declarations retain their pending gates,
even though the primitive constructor can build an explicitly resolved tool.
The bridge itself accepts an extracted declaration; the saved parser and engine
connect it through the explicit mode above.

The caller must extract the closure from current parsed definitions and attest
every exact historical source/current target before native evaluation. A route
check does not attest the supplied native shape's identity. The working target
must be the current detached owner after earlier operations in that same
instance, not its saved source geometry or an aggregate. The chronological DAG,
selected-parent outputs, scope discovery, repeated event routing, no-op policy
and atomic catalog/cache adoption remain evaluator responsibilities. Generic
owner-specific converging routes cannot be deduced from the fixed intrinsic
case. General false-mode scope fidelity remains unestablished.

## Received-wrapper ownership in end-condition helpers

[NativeOwners](../src/cad/kernel.native-ownership.ts) records each received
wrapper before a later acquisition or operation can fail. A separate released
marker survives failed ownership registration; duplicate returned-array handles
are registered once. A failed delete is never retried. Newly fused objects are
registered before releasing predecessors. Helpers retain ownership of their
candidate return until all other cleanup succeeds; if cleanup fails, they
release that candidate and retain the primary and cleanup errors.

The extrusion helpers use this scope for measurements, bounding boxes, faces,
sample vectors, split builders, raw/downcast wrappers, candidates, probes and
forward/backward results. Successful geometric selection, cap thresholds,
adjacency rules, entry/exit direction and enclosure margins stay unchanged.
The split builder must additionally report `IsDone`, and a constructed limit
must be an actual native face before transfer.

`NativeCleanupError` is fatal. At the engine reconstruction boundary,
AggregateErrors are propagated conservatively rather than displayed as an
ordinary recoverable geometric feature error; ordinary geometry rejection
retains the previous valid-body behavior. This cannot guarantee native factory
allocations lost before a return, SDK-internal child releases or native OOM.
Primitive construction uses the same shared scope for its prism and final
end-condition result, while retaining the consumed Sketch's own-instance
adapter. Received-wrapper registration failure has the same once-release
boundary. These boundaries and the original additional
fixtures are recorded in [PROVENANCE](PROVENANCE.md#recipe-bridge-and-native-ownership-fixtures).

Fatal classification covers `NativeCleanupError`, Aggregate failures and the
engine's explicit publication/release failures. Some legacy validator or
measurement cleanup paths can still throw an unclassified plain Error.
Preflight/staging still delegate to those validators; this integration does not
guarantee global cleanup attribution or allocation safety for those paths.

## Executed evidence and remaining work

Earlier selected-scope local Windows checks passed 75 bridge/ownership/termination cases across
six files, 21 standalone evaluator cases, and 18 saved-parser/engine integration
cases. The evaluator's first run had two incorrect radius-.5/depth-two volume
expectations; correcting them to π/2 per hole left production unchanged and the
21-case rerun passed. A separate 19-case primitive run passed before a test-only
typing annotation. These invocation counts overlap and are not a combined total.
Those earlier selected-scope checks also passed build and 11 IPC cases, but
did not establish a successful desktop check for that earlier snapshot. The
current dynamic-ALL source has its own full-suite, build and desktop record. Full-suite and desktop outcomes,
separate readiness/exit diagnostics, retained failures and follow-up checks belong
to their exact source records in [VALIDATION](VALIDATION.md).
No complete feature or platform-support claim follows.

Required continuation includes up-to-surface, offset, until-next and other
end/start conditions; exact face/datum/instance correspondence; arbitrary and
associative solved profiles; dependent sketches/planes/constraints; additive ALL,
dynamic geometry scope and AUTO discovery with saved capture/follow policy;
varying sketches,
dimensions and equations; nested regeneration; creation/split/consumption/Combine
output ledgers; complete stale preview/Apply, suppression/rollback, picking,
document lifecycle and interoperability. Pending diagnostics identify these
gaps without counting rejection as implementation or reference parity.
