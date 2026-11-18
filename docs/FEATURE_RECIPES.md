# Feature recipe declarations

`src/model/featureRecipes.ts` extracts bounded, detached declarations consumed by
the [per-instance evaluator and engine integration](FEATURE_REGENERATION.md).
The extractor itself does not construct native tools or mutate a body catalog.
The saved parser now has a separate explicit initial regeneration variant.
Current
[scoped feature geometry](FEATURE_PATTERNS.md) uses `geometryPattern:true` and
copies signed material contributions; that path remains separate.

## Boundary and ownership

`extractRecipeClosure` receives parsed feature definitions and an explicit
`RegenerationRequest`. The request's `mode:'regenerate'` and
`geometryPattern:false` identify this internal extraction API. The request is
derived from the explicit saved regeneration mode; the full request is not
persisted. Saved selected targets/routes or dynamic ALL intent/scope routes,
explicit principal-plane limit policies and the admitted variation table are parsed strictly. History
index, canonical plan, target snapshot and
closure are reconstructed. False without the explicit variant still rejects,
and regeneration must not route to geometry-delta replay.

Selected operations are ordered by their saved history. Earlier definitions,
sketches, supports and target ancestry are detached fingerprint inputs; they
are not additional operations to replay. Dependencies must be earlier and
unsuppressed. Each source binding names an exact `(bodyId, sourceFeatureId)`
poststate and its target routes. A selected parent owner must route to the same
target in the same instance. A coincident solid, the latest-looking
state, an aggregate scene or a face's position cannot supply missing ownership.

The extractor returns native requirements for target currentness and source
materialization; the evaluator now resolves the initial body-state requirements
before allocating its working copies. An exact face also needs an explicit owner association and,
for an instance parent, `parentTargetBodyId`. Its opaque key is preserved;
no body ID or role is parsed from the key. External world/transformed reference
policies remain distinct from an instance-parent route and from destination
scope. Native face-role correspondence is still required.

No body, feature, sketch or datum identities are allocated by extraction or
frame math. Actual regeneration must preserve original owners and references,
keep all intermediate working states detached, and publish valid changed
owners atomically. Unchanged targets must not acquire a phantom poststate.

## Bounds, preview identity and strict math

The declaration envelope allows 32 source features, 32 explicitly selected
targets or up to 256 current ALL targets, 512 bindings and 512 active owner
applications. ALL counts the resolved complete catalog, including no-op routes;
it does not persist that derived target list. The separate limits of 256 closure
definitions and 2048 dependency edges still apply: a document with 256 owners
does not automatically fit every other envelope.
Detached data is limited to 50,000 nodes, depth 64 and 1,000,000 UTF-16 code units
across copied record field names and string values. Canonical fingerprint
serialization has its own 1,000,000-unit bound, including escaping, punctuation
and repeated data. A JSON payload that fits the raw-copy bound can still fail
the serialized bound.

Fingerprint input includes the exact declarations, prerequisites, target
ancestry, source and target references, routes, remap/scope/variation policies,
and complete canonical transform placements. It is canonical data, not a hash
or native availability certificate. Native preview must additionally attest
actual owner/face/plane lineages, scope discovery and evaluator revision before
Apply. ALL additionally attests the complete current catalog, including owners
that will not change, and rechecks exact refs, lineages and native shape identity
at staging. Its scope is resolved at the actual pattern-input boundary rather
than reconstructed from a saved target snapshot. [AUTO](FEATURE_REGENERATION.md#detect-and-follow-bodies-automatically-auto)
uses a native discovery pass for capture and follows exact saved body identities
through fresh native evaluations. The editable capture fingerprint records the
original provenance. Current catalog attestation supplies publication authority.

Math exports check plain dense saved data and descriptors before reading
operands. Accessors, hidden/symbol fields, sparse arrays and custom prototypes
are outside that JSON input contract. Normalization, angle conversion and
computed vector/frame arithmetic must remain finite. The angular envelope
matches the existing canonical plan: at most255 extra positions and a step
no greater than 360 degrees. Stored angles inside that envelope are not silently
reduced or repaired. Intermediate arithmetic overflow is rejected conservatively.

For an orthogonal transform Q with parity d, a fixed profile uses X′=QX and
N′=dQN. Its right-handed Y′=N′×X′ is QY, so local profile coordinates/winding
stay unchanged. Signed depth is multiplied by d, preserving the physical ray
Q(source ray). A limiting plane instead uses normal QN; sketch parity does not
reverse the meaning of an oriented limit. These formulas do not establish
trimmed-face or UV correspondence.

## Declaration gate and required implementation

`requireInitialRecipeDeclaration` accepts only the extracted initial
declarative subset. It does not certify a successful native preview.
The declarations describe fixed intrinsic rectangle/circle or entity sketches,
owned cut or merge extrusions, blind/through-all/UntilNext
endings or an explicitly fixed principal-plane up-to-surface limit, and selected targets.
The native evaluator separately requires authentic solved entity results;
declaration eligibility does not issue that authority.
The explicit ALL regeneration variant admits cuts from this intrinsic subset
and the [bounded Blind primitive additive slice](FEATURE_REGENERATION.md#blind-primitive-additive-all).
That additive slice requires a rectangle/circle sketch on a principal plane and
omitted support/end-condition/thin-wall/second-direction fields. Other positive
recipes report `ALL_POSITIVE_SCOPE_PENDING` before target copies or tools.
Every current native owner is classified before union; a failed or inconclusive
query is not a geometric miss. Multiowner contact rejects rather than consuming
or implicitly fusing IDs. This limit is not evidence of external parity.
Extraction alone does not resolve any native requirement. The initial native
bridge/evaluator supports that subset, and the engine connects it to the
explicit saved selected or dynamic ALL mode with its bounded operation/plane policies
and the [selected Blind depth table](FEATURE_REGENERATION.md#depth-per-instance)
or the [driving circle radius](FEATURE_REGENERATION.md#driving-sketch-radius-per-instance)
and [anchored rectangle dimensions](FEATURE_REGENERATION.md#driving-rectangle-dimensions-per-instance).
The geometry/true branch retains explicitly selected targets.

UntilNext retains its exact historical source base in the extracted termination;
the saved bindings separately route evaluation to each current progressive owner.
Extraction does not find a limit or certify an absent owner. The native
[UntilNext contract](FEATURE_REGENERATION.md#per-owner-untilnext-regeneration)
distinguishes complete tools, separated forward misses, contact and incomplete
limits, including the selected/ALL rules. No additional reference-policy field
or document version is introduced for this termination.

A world limit can reference a principal plane, a principal-rooted datum or a face of an explicitly
identified historical body. For a face, each saved policy includes
`owner: { bodyId, sourceFeatureId }` and the extrusion side's locator. The
normal property panel asks for the historical owner. Existing principal-plane
declarations retain their original form. The evaluator resolves the scoped
v1 face locator within that owner's catalog, checks native occurrence and
orientation, and uses the copy builder's modification history to identify the
oriented occurrence in the detached historical body. A missing, ambiguous,
forged or retired face fails. The face lease and owner are build-local.
A world limit stays at the historical location through pattern placements.
Transformed face limits, same-instance parent face roles and face-supported sketches
still require their own correspondence evidence. An optional saved surface offset carries either
a signed distance on the oriented support or a translation in document axes.
Both extrusion directions retain the declaration. The world-principal recipe
applies the offset to its own limit before native termination. A valid
parent-route field alone does not attest the route's native existence.
Ordinary extrusions can also translate an exact trimmed curved face. Normal
offsets of curved faces and other recipe placements remain open. The ordinary
extrusion editor offers independent normal/translation controls on each surface
end; clearing an offset restores the absent legacy field. These offset controls
do not select a recipe reference placement. See the [saved contract](../src/cad/extrude-end-conditions.md).

The current evaluator handles canonical linear/circular/mirror placements,
ordered intrinsic operations, exact historical sources, current targets and
same-address semantic parent body roles. Native and integrated fixtures check
selected multi-feature/owner, no-op, late rejection and document-history paths.
Parent roles retain semantic revisions, not parent BRep/face correspondence.
Required work still includes other end/start conditions, exact dependent
sketch/plane/face/constraint remapping, other varying dimensions/sketches and equations,
broader positive ALL and dynamic geometry scope, nested recipes,
creation/split/consumption/Combine
identity ledgers, complete stale preview/Apply, suppression/rollback, picking,
document lifecycle and export interoperability. Pending diagnostics block the
initial gate; rejection does not count as implementing these capabilities.

An explicit-frame primitive constructor is another component in this work.
It resolves one tool against a caller-supplied working owner. The chronological
evaluator now supplies exact frames and progressive owners, and stages changed
targets into one atomic catalog proposal after cleanup. The engine captures full
requested historical owner states before commit and publishes complete cache
maps with the catalog. It does not fake intrinsic supports/datums or pass frames
through a legacy builder that ignores them. See the
[regeneration contract](FEATURE_REGENERATION.md#chronological-evaluation-and-exact-ownership)
for intermediate islands/empty material and failure ownership.

## Evidence scope

Four self-contained pure suites declare 51 original cases:24 closure/frame
cases,4 input-envelope cases,3 raw-boundary cases and 20 additional regression
cases. They check data identity, routing, budgets and independent Cartesian
expectations. They do not initialize WASM or prove BRep validity, material
results, native cleanup, target fidelity or platform support. See
[fixture provenance](PROVENANCE.md#feature-recipe-declaration-fixtures) and
[validation](VALIDATION.md) for source-specific execution records. A passing
prototype or earlier geometry-pattern suite is not validation of a later
integrated native evaluator. Separate original suites define 21 standalone
evaluator cases and 18 saved engine cases; their fixtures, native results and
current execution scope are linked from [FEATURE_REGENERATION](FEATURE_REGENERATION.md).

Dynamic ALL has 54 additional authored cases at separate boundaries: 17 symbolic
model/command, seven SSR, 18 native scope/evaluator, eight saved-engine and four
contextual deletion cases. Their provenance is linked from the
[regeneration contract](FEATURE_REGENERATION.md#dynamic-all-scope). These counts
describe written fixtures, not a combined execution result or interaction proof.

### Explicitly transformed sketch supports

For a selected extruded cut or merge with fixed local dimensions, a sketch
on an active principal-rooted datum chain may name `support` on the actual
sketch ID and on each ancestor datum ID. Each record contains only `featureId`,
`path` and `placement: "transform"`. The selected feature owns the sketch
through its earlier `sketchId`; a datum belongs through the earlier support
chain. Repeated locators and disconnected or future nodes are rejected.
Suppression retains historical IDs on file and prevents evaluation of an
unavailable support. Empty or partially assigned chains require an explicit
editor choice before native Apply. Existing files with absent support policy
retain their authored graph. The support table shares the closure limit of 256
definitions and the existing end-policy count stays capped at 32.

Datum offsets and the sketch's own signed offset resolve on the original support
before the single occurrence transform. The physical sketch frame uses the
existing parity rule, keeping local winding and constraint IDs fixed. Each
entity occurrence requires a fresh fully defined solve in the original chart
and checks branch and driven values against the source checkpoint. Out-of-date
owner, address, datum, target shape or source solve rejects the proposal.
An end-condition offset is independent of those intrinsic offsets. Its normal
follows its placed support and a literal XYZ translation uses world coordinates
after support placement. World/mixed sketch placement, face-supported sketches,
variable local constraints and same-instance face roles remain open.

The support selector keeps existing per-instance variations intact. Remove those
variations explicitly before changing support placement; the editor disables the
selector and explains that requirement while any remain. Support rows show the
saved plane or sketch names. Exact IDs remain in the document and native request.
The production-renderer routes are available through
`npm run test:desktop:pattern-datum-limit` and
`npm run test:desktop:pattern-sketch-support`; CI runs them in each persistence
batch. Configured checks are not evidence that a platform has passed them.
