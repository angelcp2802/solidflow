# Feature recipe declarations

`src/model/featureRecipes.ts` extracts bounded, detached declarations for a future
per-instance feature evaluator. It does not construct native tools, mutate a body
catalog or accept a new saved-document grammar. Current
[scoped feature geometry](FEATURE_PATTERNS.md) uses `geometryPattern:true` and
copies signed material contributions; that path remains separate.

## Boundary and ownership

`extractRecipeClosure` receives parsed feature definitions and an explicit
`RegenerationRequest`. The request's `mode:'regenerate'` and
`geometryPattern:false` identify this internal extraction API. They are not a
persisted `featurePattern` variant and must not be accepted by relaxing the
current parser or routed to geometry-delta replay.

Selected operations are ordered by their saved history. Earlier definitions,
sketches, supports and target ancestry are detached fingerprint inputs; they
are not additional operations to replay. Dependencies must be earlier and
unsuppressed. Each source binding names an exact `(bodyId, sourceFeatureId)`
poststate and its target routes. A selected parent owner must route to the same
target in the same future instance. A coincident solid, the latest-looking
state, an aggregate scene or a face's position cannot supply missing ownership.

Target currentness and source materialization remain unresolved native
requirements. An exact face also needs an explicit owner association and,
for an instance parent, `parentTargetBodyId`. Its opaque key is preserved;
no body ID or role is parsed from the key. External world/transformed reference
policies remain distinct from an instance-parent route and from destination
scope. Native face-role correspondence is still required.

No body, feature, sketch or datum identities are allocated by extraction or
frame math. Actual regeneration must preserve original owners and references,
keep all intermediate working states detached, and publish valid changed
owners atomically. Unchanged targets must not acquire a phantom poststate.

## Bounds, preview identity and strict math

The declaration envelope allows 32 source features, 32 targets, 512 bindings and
512 active owner applications, 256 closure definitions and 2048 dependency edges.
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
Apply. Full all/auto discovery inputs may extend beyond selected target ancestry.

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
The initial declarations describe fixed intrinsic rectangle/circle sketches,
owned cut or merge extrusions, blind/through-all endings and selected targets.
All native requirements remain unresolved even for that subset.

Until-next, up-to-surface, associative supports and face correspondence are
retained with explicit pending diagnostics. The offset-intent validator is a
future contract utility; it does not add offset to the current end-condition
union or evaluate a surface. A normal distance and an explicit world
translation are different intents. A valid parent-route field alone does not
attest the route's native existence.

Required work still includes actual per-instance evaluation for linear,
circular and mirror patterns, through-all and other end/start conditions,
current/historical recipes, multiple features/owners, selected-parent remapping,
dependent sketches/planes/constraints, varying dimensions/sketches and equations,
all/auto discovery policies, nested recipes, creation/split/consumption/Combine
identity ledgers, rollback/release ownership, stale previews, picking and
save/reopen/undo/suppression. Pending diagnostics block the initial gate;
rejection does not count as implementing these capabilities.

An explicit-frame primitive constructor is another component in this work.
It can resolve one tool against a caller-supplied working owner without being a
recipe-closure evaluator. Integration still needs an explicit frame path in
the engine, exact reference resolution, instance DAG evaluation and one atomic
catalog replacement. Passing a frame to a legacy builder that ignores it for
intrinsic sketches, or adding a fake support/datum, is not regeneration.

## Evidence scope

Four self-contained pure suites declare 51 original cases:24 closure/frame
cases,4 input-envelope cases,3 raw-boundary cases and 20 additional regression
cases. They check data identity, routing, budgets and independent Cartesian
expectations. They do not initialize WASM or prove BRep validity, material
results, native cleanup, target fidelity or platform support. See
[fixture provenance](PROVENANCE.md#feature-recipe-declaration-fixtures) and
[validation](VALIDATION.md) for source-specific execution records. A passing
prototype or earlier geometry-pattern suite is not validation of a later
integrated native evaluator.
