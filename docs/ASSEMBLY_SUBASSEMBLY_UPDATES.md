# Subassembly source updates

`src/model/assemblySubassemblyUpdates.ts` provides the detached declaration plan
for an explicit update of an embedded assembly source. A separate worker-owned
review obtains current native catalogs and accepts explicit repair decisions;
only a fresh authenticated solve can provide Apply authority. The existing
[component import](ASSEMBLY_COMPONENT_IMPORT.md) and
[component replacement](ASSEMBLY_COMPONENT_REPLACEMENT.md) are separate actions.

An explicit [linked-source read](ASSEMBLY_LINKED_SOURCES.md) can supply an
optional final `sourceLink` argument. Its validated descriptor is retained in
the private plan and accepted outer cache together. Omitting that argument
clears the new outer cache's stale link; historical and nested definitions keep
their own metadata. This descriptor grants no file access or native authority.

## Identity and complete source content

`prepareAssemblyDocumentUpdate(input, source, incoming)` accepts the current
assembly, an exact embedded assembly `{id, revision}` and a complete version-2
incoming document. The incoming ID must match the selected source; its authored
revision must differ. The destination document root cannot be selected.

Both documents and the source reference pass strict data-only validation before
the planner reads their fields. Accessors, hidden/extra fields, invalid
prototypes and malformed graphs reject. The planner preserves the incoming root
as an embedded assembly and merges its entire registry, including dormant
definitions. A matching ID/revision is reused only when all normalized data
agree. Object field order is irrelevant; array order and declared content remain
significant. Different revisions can coexist. One ID cannot denote both a part
and an assembly. No source IDs, child paths or mate IDs are renamed.

Any incoming dependency claiming the exact destination-root tuple rejects. An
incoming definition also cannot alias a destination scope whose child references
must change during this update: that would silently rewrite the incoming
declaration. Existing definitions and inputs remain unchanged on failure.

## All-use declaration changes

Before merging, the planner records each declaration address referencing the
selected old tuple. It retargets exactly those occurrences to the new tuple,
including addresses in shared, suppressed and dormant scopes. This is an all-use
source update, without a selected-instance replacement or placement-scope mode.
Reused occurrences still have their own outer paths and poses.

The existing occurrence IDs, names, poses and flags remain unchanged. New
source-local contents come from the incoming document. References newly imported
with that document are not part of the earlier write set: an explicit dependency
on a historical revision remains historical. Descendant part revisions are not
globally replaced merely because their IDs match. An independent use outside
the updated source therefore retains its original part tuple.

The old source remains stored. Only the enclosing document's modification time
advances; incoming and historical definition metadata remain declared content.
The complete resulting graph is validated, including dormant cycles and current
definition, declaration, expanded-hierarchy, mate and part-feature limits. The
existing pretty UTF-8 serialization boundary of 20 MiB also applies before a
plan document can be returned. No budget is enlarged or declaration clipped.

## Affected references and local frames

Every existing mate is visited through the exhaustive saved endpoint inventory,
including Width's four roles, Symmetry's three roles, directed guides and gear
carriers. The planner traces each non-null component path in its own original
scope. Any actual crossing of the selected old assembly tuple identifies an
affected endpoint, even when the terminal part tuple stays the same.

Each affected entry contains its original locator and endpoint, the old
`boundary.occurrencePath` and source definition, the remaining `suffix`, and
before/after declaration-resolution diagnostics. A `desiredComponent` appears
only when the same full path resolves to a purpose-compatible terminal in the
staged graph. Component and principal-plane purposes may address an assembly;
face, edge and vertex purposes require a part. This correspondence is declaration
data only. Every affected entry remains `needs-repair`; it does not claim a
current face, vertex, native support or satisfied mate.

A missing path or wrong terminal label is reported separately in
`unresolvedEndpoints`. If tracing fails before the source boundary, the planner
does not infer source impact from that stale label. Deleted or renamed children
are not matched by display name, coordinates, ordinal or proximity.

A null component remains the fixed frame of its own declaration scope. A null
gear carrier remains a real fixed-scope role, with no fabricated component path.
Incoming local references are never prefixed to a chosen global occurrence.
Original endpoints are preserved for later explicit repair rather than silently
rewritten to the new terminal tuple.

`capturedMates` inventories affected concentric rotation locks, component locks,
gears, screws and rack-and-pinion declarations. It records scope, mate ID,
family, suppression and affected roles. It neither recomputes captured zeros nor
decides that they can be retained. An unlocked concentric mate is not a captured
rotation lock.

## Original declaration tests

The original test graph uses two root uses of one source, two uses of a shared
carrier, a suppressed use in a dormant declaration and an independent part use.
The part recipes are rectangle extrusions of 2 by 3 by 4 mm and 3 by 3 by 4 mm.
Tests here inspect declarations only; they do not measure either solid.

Tests exercise exact registry reuse and conflicts, all-use write addresses,
historical incoming dependencies, local null frames, stale paths and labels,
renamed descendants, grouped roles and captured-family inventories. They also
check accessor rejection, detached inputs, syntax history/save round trips,
definition/expanded occurrence/mate/depth/feature limits and the compact-input
versus pretty-saved-byte boundary. Fixture reference keys are unattested syntax
examples. Passing results belong in the validation record after execution.

## Worker review and explicit repairs

`reviewAssemblyDocumentSourceUpdate` reconstructs the complete new source and
the staged parent scene before returning a review. Its source-local catalog
includes suppressed descendants in a detached inspection copy. That catalog
does not attest suppressed placements, dormant scope relations or satisfaction
in the parent. Native reconstruction, query or cleanup failure withholds the
review. The private worker retains the exact base, plan, catalog and review;
the returned document and scene are detached display data without Apply power.

Every affected role requires an explicit purpose-compatible current reference
inside its updated source boundary, or explicit removal of its mate. Choices
include the new source's current descendants, so a renamed or removed old child
can be repaired without a guessed name, nearest geometry or automatic match.
Assembly/component and principal-plane choices have declared frames; material
face, LINE edge and vertex choices require current source-native catalogs.
Vertices also undergo a fresh private native point query. Each null frame keeps
its own declaring scope. Unrelated stale paths remain separate diagnostics.

The worker validates dense bounded data-only decisions, exact locators, distinct
roles, catalog identity and the source boundary. Renderer documents, scene IDs,
repaired flags and captured values cannot authorize a candidate. All pending
roles must be covered, including suppressed mates and dormant declarations.
Choosing a current source-local reference does not claim that an inactive mate
has passed a parent-placement physical check.

Every affected captured mate also needs an explicit decision. Component locks,
gears, screws and racks must be recaptured natively or removed. A concentric spin
lock may additionally be released. Recapture discards the old captured state,
solves and captures anew, then solves again before publication. A suppressed
concentric relation is active only for that explicit capture; its saved
suppression is restored afterward. An unavailable scope or incompatible capture
fails closed. Incoming source-authored local mates retain their declarations;
active root and nested relations receive fresh solve checks. No automatic
correspondence or retention of captured zeros is inferred from unchanged IDs.

## Editor, capabilities and persistence

Selecting an assembly occurrence exposes **Actualizar subensamblaje**. The file
must be a complete v2 source with the same assembly ID and a different authored
revision. Selecting a part keeps the separate existing v1 update flow. File
tickets bind the committed document, generation, scope, selected path and source
kind; a late picker result cannot update a different selection.

Repairs and capture decisions revoke a previous preview while retaining the
review. Canceling a ready toolbar preview retains those decisions for retry.
Canceling the source panel revokes its private review and any linked preview.
Build, competing commands, changed bases and worker disposal also invalidate
capabilities; a delayed discard targets only its matching review or token.

Apply consumes the worker's authenticated candidate and commits one history
entry. Review, repair, rejected solve and Cancel preserve the confirmed document,
recovery bytes and parent save path. One Undo restores the prior complete graph;
Redo restores the authored new revision and explicit repairs. No source disk
path, automatic external link, scene, review ID or native witness is saved.

`npm run test:desktop:assembly-source-update` exercises the tracked original
fixed-prism fixture through production controls, the real worker and restricted
file IPC. Test-owned dialog paths are separate from human dialog interaction.
Actual cases, tolerances and execution results belong in [validation](VALIDATION.md).
The separate `test:desktop:assembly-source-update-save-pending` command withholds
one real successful Save return after verifying its written bytes. The flow
releases that return before waiting for clean actual header/path, enabled file
controls, no Apply capability and exact committed recovery. The ordinary flow
uses the same readiness checks after both Save As operations and normal Save.
The controlled ordering establishes a possible race; it does not identify a
historical hosted failure's cause or change application file semantics.
This increment does not establish selected-instance subassembly replacement,
configuration support, a complete assembly demo or general platform acceptance.
