# Feature recipe regeneration

Feature regeneration evaluates selected operations again at each instance
against the current working target. The integrated initial path connects
[recipe declarations](FEATURE_RECIPES.md), explicit-frame native construction,
chronological evaluation and atomic body-catalog publication. It supports
intrinsic rectangle/circle and real solved entity cuts and merge extrusions, blind/ThroughAll/UntilNext endings
or an explicitly fixed principal-plane UpToSurface limit, selected targets
and no variation. Dynamic ALL
currently supports the intrinsic cut subset; additive ALL remains pending.
The entity composition has bounded local native/full/build evidence and one
original circular-entity linear selected-to-ALL UI workflow recorded below.
That single Windows interaction does not establish the broader UI scope.
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
  referencePolicies: FeaturePatternReferencePolicy[];
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
  referencePolicies: FeaturePatternReferencePolicy[];
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

For an intrinsic ALL cut with unilateral ThroughAll, a current closed owner
whose conservative bounding box lies strictly behind the physical extrusion
ray is a geometric no-op. The proof uses the actual transformed profile center
and signed ray (including offset and reflection parity), all eight finite,
ordered box corners, a 1e-6 mm separation guard and a floating-point allowance.
Contact or inconclusive bounds retain the original native path; native query,
validation and release errors propagate. This is an absence proof, never
ownership discovery or a catch-based miss policy. The owner remains in the
complete inventory, application budget, native freshness proof and same-address
virtual output with unchanged revision. Selected scope, bilateral ThroughAll,
other terminations and additive ALL keep their existing behavior. Entity
profiles cannot bypass their required real solve/profile/tool validation
through this intrinsic-only proof.

The focused local Windows correction passed the complete two affected files
(41 cases, including 15 new cases), the full suite/build and the existing
initial-model and selected-to-ALL desktop checks. Source pins, exact outcomes,
the retained earlier failure and remaining limits are recorded in
[VALIDATION](VALIDATION.md#all-unilateral-forward-material-correction-2026-10-15).

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

## Fixed principal-plane end reference

An UpToSurface seed can explicitly retain its selected principal plane:

```ts
referencePolicies: [{
  featureId: 'the-selected-seed',
  path: 'endCondition.target',
  placement: 'world',
}]
```

The source's existing end condition supplies the exact XY, XZ or YZ identity.
The profile and physical extrusion ray follow the canonical instance transform;
the limiting plane stays in document coordinates. Every copy constructs a new
tool from that instance's start to the plane. Copying the source's finished tool
does not implement this declaration. Negative depths and reflection parity
retain the physical ray, and sketch offset is applied once.

The policy must be explicit, unique and associated with a selected seed.
Missing policies reject during extraction; unused policies also reject.
The saved boundary accepts only enumerable own data for this policy table,
its dense entries and the three exact fields. Getter, hidden, duplicate and
unsupported transform/instance entries cannot silently change saved intent.
Old documents with empty policy tables retain their previous behavior. Older
builds that only accept empty tables reject this new declaration.

The property panel exposes the fixed-plane choice and allows removal of a
stale choice after its source changes. Scope changes preserve the choice;
removing a seed prunes its policy. Switching to geometry copying removes
regeneration policies; switching back requires an explicit new choice.
Changed source definitions or saved policies stale the existing preview.

Selected cut/merge and cut-only dynamic ALL use the same fixed-plane limit.
Parallel planes, limits behind the instance ray and failed tool construction
reject the pattern atomically. Datum/face ownership and correspondence,
transformed/instance references, other endings and additive ALL remain required.
These are SolidFlow's explicit semantics; the analytical fixtures do not prove
interoperability or complete interaction coverage.
Their original inputs, formulas and tolerances are recorded in the
[fixed-plane fixture provenance](FEATURE_WORLD_LIMIT_FIXTURES.md).

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
does not establish emptiness. A blind operation or an independently fixed
principal-plane limit can construct a tool without borrowing an extent from
empty material. Owner-dependent dynamic termination against empty material
still needs a separate extent policy.
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
frame/depth from the intrinsic placement adapter (with the primitive compatibility adapter retained), checks the operation's route
to the exact extracted target state, and returns an owned add/subtract tool.
It accepts no arbitrary caller transform or source frame and never uses a
captured material delta as a regeneration substitute.

This bridge is limited to the initial `mode:'regenerate'`,
`geometryPattern:false` declaration subset: selected targets or cut-only ALL,
no variation, intrinsic primitive or authentic real-solved entity profiles, owned cut/merge and
blind/ThroughAll/UntilNext or explicit principal-plane/world UpToSurface termination.
Selected scope checks its exact saved target
routes; ALL checks the attested derived target snapshot and scope routes.
Other UpToSurface reference declarations retain their pending gates,
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

Required continuation includes broader up-to-surface, offset and other
end/start conditions; exact face/datum/instance correspondence; arbitrary and
associative solved profiles; dependent sketches/planes/constraints; additive ALL,
dynamic geometry scope and AUTO discovery with saved capture/follow policy;
varying sketches,
dimensions and equations; nested regeneration; creation/split/consumption/Combine
output ledgers; complete stale preview/Apply, suppression/rollback, picking,
document lifecycle and interoperability. Pending diagnostics identify these
gaps without counting rejection as implementation or reference parity.

## Production-renderer ALL regression

`npm run test:desktop:pattern-all` is a reproducible scripted DOM-event check for
one linear cut workflow: selected-A to dynamic ALL, genuine worker preview,
Apply, native-bridge Save As and reopen. It observes distinct worker requests
and checks exact per-owner identities, analytical volumes and bounds. Dialog
choices use only the test's temporary files; its hidden fresh child keeps the
original production main/preload and worker/WASM. CDP observation uses a preceding
test-owned blank page, which also executes the original preload.

This command is separate from the standard initial-model desktop smoke and from
symbolic, SSR and programmatic engine tests. Its [fixture provenance](PROVENANCE.md#instrumented-dynamic-all-desktop-fixture)
and [actual results](VALIDATION.md) define the evidence boundary. Circular/mirror
interaction, picking, stale-prefix rejection, binding edits, undo/redo, AUTO,
additive ALL and the broader recipe/lifecycle requirements remain open.

## Real source solves and native component foundations

The source-solve registry in
[kernel.sketch-solves.ts](../src/cad/kernel.sketch-solves.ts) records the actual
entity-sketch solve performed at its historical engine step. The full
`SketchSolveResult` is retained, including status, degrees of freedom, residual,
conflicts, iteration count and fresh driven measurements. A failed solve
publishes neither fallback geometry nor a success handle. Underdefined results
remain underdefined; retaining them does not establish a unique solution.

Definitions are admitted inside the existing per-feature guards without
invoking raw accessors. Certification requires a representable, unchanged
historical prefix. An otherwise usable raw sketch with a noncloneable ignored
extra can still render normally, but receives no certificate; a later source
cannot certify a prefix containing that unrepresentable definition. Publication
follows successful visual/map staging and a second prefix/support check.
Returned views are detached copies. Private WeakMaps bind handles, checkpoints
and the actual reader to one build; copied reader methods, forged/cross-build
handles, edits and revocation cannot supply authority. Reconstruction finally
revokes the session. Evaluation checks its source-solve checkpoint before target
allocation and rechecks it before staging.

This is evidence of the actual solve, historical definitions and resolved
frame/support metadata. The retained support object is not a native face/body
ownership witness. Associative entity recipes remain gated; the separate
intrinsic entity increment below does not need a native support association.
`entityProfileSolid` materializes an already supplied profile without a hidden
second solve. Its received edges, wires, faces, containment vertices, directions
and region solids now use the shared ownership scope. Nested transfers and the
non-consuming native compound assembly retain results until sibling cleanup
succeeds; raw compound adoption has one deletion owner. A cleanup error
withholds and retires the candidate while preserving primary causes. This
does not cover allocations lost inside an SDK factory before it returns.

[validatePositiveClosedTool](../src/cad/kernel.closed-tools.ts) inspects borrowed
temporary tools non-destructively. A tool needs valid BRep, finite bounds and
one or more closed, strictly positive finite-volume solid occurrences. Repeated
native occurrences, inverted/invalid/open solids and loose topology reject.
Completed native Common distinguishes interior overlap from permitted boundary
contact; query failures cannot become proof of separation. The evaluator uses
this validator only for tools. Historical sources, current targets and final
persistent owners still require one valid closed solid. Existing temporary
working-island and genuinely empty-compound rules remain unchanged.

[resolveUntilNextAdd](../src/cad/kernel.until-next-resolution.ts) adds the first
complete material-entry component alongside the first-exit Cut component.
Forward Common reports existing owner material, separately from tool volume and
actual added/removed volume. A completed topology-free compound and completed
native separation beyond the contact floor, actual native tolerance envelopes
and floating-point allowance establish an empty-forward observation. The
current guard is specified in the UntilNext integration section below.
Contact/near geometry and material lacking a complete whole-profile face remain
distinct observations. Borrowed owners, repeated prism wrappers/handles and
construction/query/cleanup failures cannot be silently treated as misses.
The caller still owes the exact owner route, progressive revision, physical ray
and selected/ALL applicability policy. These components alone do not activate
saved pattern recipes or additive ALL; the UntilNext bridge and evaluator below
provide the bounded saved integration.

[countNativeFaceOccurrences](../src/cad/kernel.native-face-membership.ts) counts
all native FACE occurrences sharing TShape and Location with a borrowed face;
orientation is deliberately excluded by `IsSame`. It rejects null/non-FACE
operands, owns only the query objects and withholds the count if traversal,
registration or cleanup fails. The query accepts non-null shape containers and
is not a body validator. A count is not a historical owner certificate, epoch,
lineage or same-instance parent-output correspondence. Build-local issuance,
safe retained lifetimes, datum chains and rechecks before allocation/publication
remain required; keys, normals, bounds, proximity and transformed old faces
cannot replace that work.

The [original component fixtures](PROVENANCE.md#source-solve-and-native-component-fixtures)
add 90 cases. Exact-source executions are recorded in
[VALIDATION](VALIDATION.md#source-solve-and-native-component-composition--2026-10-15).
These foundations alone do not enable the separate intrinsic entity increment, associative profiles, saved
UntilNext, transformed or instance references, additive ALL, AUTO, variation,
nested regeneration or the complete creation/split/consumption/lifecycle scope.

## Intrinsic entity-profile regeneration increment

The native entity route accepts unchanged local entity sketches without a
saved support and with variation none. Model eligibility does not issue a
solve or native certificate. The primitive compatibility adapter still rejects
entity declarations; the placement adapter returns only the exact sketch ID,
source frame, canonical instance frame/ray and signed depth.

The evaluator obtains a real build-issued source checkpoint before cloning a
target. The entity constructor reads only an authentic handle included in that
checkpoint through the registry's private reader map. It reads the full actual
solve result, including fresh driven measurements in result.drivenValues, and
constructs native geometry from result.profile. Nominal driven values remain
profile metadata; saved nominal coordinates/radii are not a substitute. Underdefined solutions
retain their actual status and degrees of freedom. A failed solve, copied
reader, forged/foreign checkpoint, uncovered source, prefix edit or revoked
epoch cannot supply geometry. Returned views are detached from the issuer.

For this fixed intrinsic case local constraints are invariant under the rigid
canonical Q. Source solving occurs at the original historical engine step;
entityProfileSolid constructs a fresh native contour/region tool without another
solve for each address/current owner. It handles line/arc/circle contours and
even/odd holes and regions. The evaluator's guard closes over the actual
working shape and local input revision, not a caller-declared revision token.
Source/current checks surround construction and Boolean evaluation, and staging
rechecks the complete closure, source epoch and actual catalog/history objects.

The existing transformedExtrusionFrame applies mirror parity once:
X'=QX, N'=det(Q)QN and depth'=det(Q)depth. Local coordinates, arc orientation
and winding are unchanged, so the physical ray remains Q(source ray). Resolved
frame origin includes sketch offset once; finite prism start translation is
applied once along that ray. ThroughAll uses the current detached owner's
extent/exit, and an explicitly chosen principal world limit stays in document
coordinates. Blind, symmetric blind, one/both-direction ThroughAll and the
existing principal/world UpToSurface path retain their saved syntax. No new
document version, user-visible native handle or hidden support is introduced.

Selected cut/merge and cut-only dynamic ALL retain existing route/lifecycle
rules. Temporary tools use the closed positive-tool validator; historical
sources, current targets and persistent results still require one valid solid.
Associative/explicit support placement, varying constraints, native face/datum
correspondence, additive ALL, AUTO, nested regeneration and
broader lifecycle work remain incomplete. Their rejection is not implementation
or reference parity. Existing commands/panel declarations can request this
unchanged regenerate mode and receive real engine preview; no new UI interaction
or stale-Apply coverage is claimed from that source wiring alone.

The 27 original entity/source/declaration cases and 25 composition/tolerance
additions ran in the complete affected files and full suite on the exact source
recorded in [VALIDATION](VALIDATION.md#entity-all-profile-composition--local-evidence-2026-10-15).
That evidence includes native construction, source checkpoints, actual owner
state and tolerance failure paths. A separate scripted production-renderer
entity case covers geometry, selected-regenerate preview, ALL preview, Apply,
save and reopen with a behind-plane B. The existing primitive ALL/world desktop
workflows retain their own fixtures and evidence boundaries.

### Entity ALL absence requires native profile evidence

For cut-only ALL with unilateral ThroughAll, a current owner entirely behind
the physical ray can remain unchanged. A conservative native box including
BRep tolerances is queried through `createConservativeBodyBounds`, using
`BRepBndLib.AddOptimal(shape, box, false, true)` and a further
`box.Enlarge(maximumNativeShapeTolerance(shape))`. The detached maximum queries
all native vertex/edge/face tolerances and rejects nonfinite or negative values;
global enlargement covers subshapes not individually represented by the
initial box algorithm. The SDK's tolerance-excluding bounding-box getter is
not an absence certificate. Eight finite ordered corners must first have
maximum projection below `-(1e-6 + 32*Number.EPSILON*arithmeticScale)`.
Contact, near-plane, general misses and inconclusive envelopes retain the
ordinary native route. No owner is removed from ALL inventory or budgets.

For an entity this box is only a candidate. The shared entity-prism factory
reads the full authentic checkpoint-covered `result.profile`, verifies the
source frame/depth and constructs a native witness of length `abs(signedDepth)`
at the canonical frame origin along its physical ray. The ordinary tool builder
uses that same factory. The witness must pass `validatePositiveClosedTool` and
be released successfully, with source epoch and actual owner/revision guards
before/after construction and after cleanup, before a no-op is accepted. It is
never Boolean-applied or published. Only after cleanup and those checks does
the witness procedure return its detached actual maximum native tolerance.
Final separation must also exceed `witnessTolerance * length(physicalRay)`;
if that wider guard is inconclusive the original native route remains active.
Raw JSON, nominal driven values, healthy
solve status or a caught native exception cannot replace that evidence.

The common virtual output still carries the real body role and unchanged local
revision for that owner. Per-address/global no-material rejection, final
single-solid validation, complete inventory freshness and atomic staging remain
in force. Selected scope, bilateral ThroughAll and other endings keep their
original paths. There is no nullable tool, new saved syntax, hidden solve,
additive ALL or associative/varying profile policy in this increment. Its one
scripted circular-entity linear UI case is recorded separately from native
BRep/closed-tool proofs and does not establish other interactive workflows.
The [new fixture provenance](PROVENANCE.md#entity-all-absence-composition-fixtures)
and [recorded validation](VALIDATION.md#entity-all-profile-composition--local-evidence-2026-10-15)
separate this source from earlier V4 and primitive-only results.

## Per-owner UntilNext regeneration

The saved unilateral `untilNext` termination is evaluated again for each
canonical instance and exact progressive owner. Its historical
`endCondition.baseFeatureId` must still agree with the source's original owner
input; the existing saved bindings express the distinct destination route.
The source base is not rewritten to the target, and a scene aggregate or
captured source tool is not substituted for that target. No new saved option,
document version or inferred surface-reference policy is introduced.

Selected cuts use the first complete material exit. Selected additive merge
extrusions use the first complete material entry. Both consume the actual
current owner after preceding operations and addresses. Whole-profile cap
coverage is required, including holes and disconnected regions; a center ray,
the nearest partial face or a separately chosen limit for each region is not
enough. Native construction uses the shared primitive factory or the full
authentic checkpoint-covered entity `result.profile`, with no second solve.
Canonical reflection parity, signed direction and sketch offset apply once.

`resolveRecipeInstanceUntilNext` returns a discriminated native observation:

| Outcome | Native evidence and saved policy |
| --- | --- |
| `complete` | A validated owned tool reaches a complete whole-profile limit. Selected Cut, selected Add and cut ALL can apply it. Tool volume, existing forward material and actual material change remain separate quantities. |
| `empty-forward` | Common completed with a non-null topology-free native compound and a completed separation query proves a distance beyond the conservative guard. Selected scope rejects; cut ALL can retain that owner as a no-op. |
| `contact-or-near` | Lower-dimensional intersection or insufficient proven separation. Both scopes reject atomically; contact is not an absence certificate. |
| `incomplete-limit` | Actual positive forward material exists, but no compatible complete limit was found. Both scopes reject atomically; there is no ThroughAll fallback. |

The forward query is enclosed using conservative native bounds that account for
vertex, edge and face tolerances. Those bounds only size the prism; the real
Common and separation query establish absence. The separation guard includes
the `1e-7 mm` contact floor, the actual maximum native tolerances of owner and
query prism, and a `32 * Number.EPSILON * coordinateScale` allowance. Native
query, construction, validation, registration or cleanup errors propagate;
an exception, small volume or geometric box miss cannot become `empty-forward`.

The strict `buildRecipeInstanceTool` API still returns an owned tool or throws.
The evaluator uses the explicit resolution API for cut ALL and accepts only
its proven separated miss as a no-op. That owner remains in the complete
inventory, application budget, freshness proof and same-address virtual output,
with unchanged local revision. Each active address and the complete pattern
still need material change somewhere. Contact, incomplete limits, stale source
epochs, changed owner revisions and late failures withhold all replacements.
Persistent owners still require one valid closed solid; a temporary multiregion
tool or progressive island state does not allocate additional body identities.

The source and actual working-owner guards surround native construction and
resolution, including the resolver's cleanup, and staging revalidates the
document, source epoch and complete native catalog. The evaluator revision
changes so an earlier preview cannot authorize this implementation's Apply.
The saved syntax and exact source/target references survive serialization;
reopening rebuilds the limit from the then-current model rather than a saved
distance or cached native face.

These are SolidFlow's explicit per-owner rules. General reference-application
scope parity is unverified. Additive ALL, AUTO discovery, bilateral UntilNext,
associative or varying profiles, broader start/end references and lifecycle
policies remain required work. Authored tests and declared workflows are not
executed results; the source-specific [validation record](VALIDATION.md) must
establish the actual checked cases and tolerances before claiming a pass.
