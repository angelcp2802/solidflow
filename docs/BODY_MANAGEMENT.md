# Body management and Combine

## Status and scope

This is the proposed implementation contract for [issue #26](https://github.com/angelcp2802/solidflow/issues/26), not a record of implemented behavior or passing validation. It covers an editable body catalog, explicit body creation, union/subtract/common, selective cuts, persistence, selection, history and committed-snapshot export. A catalog helper or a panel alone does not complete this workflow.

The proposed [explicit body-pattern increment](BODY_PATTERNS.md) specifies
individual outputs for linear/circular patterns and mirror, including exact
current/historical seeds and committed retirement. Its evidence and remaining
limits do not replace the broader acceptance checklist below.

The separate [scoped feature-pattern increment](FEATURE_PATTERNS.md) defines
exact historical owner contributions routed to selected current targets.
It preserves target IDs rather than allocating per-instance bodies. Its
22 original native fixture definitions are documented in
[PROVENANCE](PROVENANCE.md#scoped-feature-geometry-contribution-fixtures);
written tests or a successful build do not complete native or editor acceptance.

The proposal is an independent design. No corresponding local Combine runtime observation has been retained. Reviewed operation documentation distinguishes subtraction's principal target from the collection of bodies used by union/intersection. This is documentation-level evidence, not a runtime result; it does not establish persistent identity, tool consumption or retention. Operand consumption, retained tools, identity and rejection policies below are local proposals. Assemblies, drawings and manufacturing remain separate [roadmap](ROADMAP.md) work.

## Existing behavior to preserve

The legacy [feature types](../src/cad/kernel.types.ts) and [engine path](../src/cad/kernel.engine.ts) use an accumulated shape, its mesh and face/edge picking. Ordinary legacy extrusions fuse with that shape and ordinary legacy cuts cut it. Sweep/loft `merge:false` can retain separate solids in a compound. Body patterns use a historical `sourceFeatureId`; mirrors also have their existing `mergeBodies` policy. These aggregate semantics remain distinct from the new explicitly identified catalog.

Existing version-1 documents must retain their geometry, feature IDs, saved selections and operation semantics. Absence of new body fields selects the legacy behavior. In particular:

- Do not silently fuse, discard or relabel the separate solids of legacy `merge:false` features or body-mode patterns/mirrors.
- Do not reinterpret legacy `sourceFeatureId` as a newly selected individual body.
- Do not populate persistent IDs while loading, rebuilding, rendering or exporting an old document.
- Preserve the [single-solid STEP import contract](STEP_IMPORT.md). This work does not enable multi-solid import into the editor.

Legacy aggregates without proved individual provenance can remain visible and exportable under their existing rules. They cannot acquire durable individual targets by enumerating their solids. Any future adoption or migration must be explicit and must prove the producer-to-output correspondence; ambiguous legacy outputs remain unavailable for individual targeting.

The current opt-in boundary is strict: start the catalog with an explicitly saved new-body extrusion, revolution, sweep or loft before any legacy solid feature. An earlier legacy solid blocks opt-in even when it is suppressed or currently produces no geometry. Suppressing it is not migration. Earlier explicitly identified body features are not classified as legacy merely because they are suppressed. Mixed documents may remain structurally loadable for repair, but execution must reject unsupported transitions rather than assign identities to their old geometry.

## Identity, provenance and snapshots

A body has an opaque ID saved with its creating command's output slot. New creation allocates that ID once, before its proposal is displayed; Apply uses the same proposal and IDs. Editing an existing output, saving/reopening and undo/redo retain its ID. Deleting and separately recreating identical geometry allocates a fresh ID. Names and list positions are editable presentation, not identity.

Keep these concepts separate:

| Record | Required meaning |
| --- | --- |
| Persistent body identity | Opaque saved ID and exact creating feature/output-instance ownership. |
| Current catalog entry | That body's available state at one exact document revision, including its last modifying feature and serializable display/selection metadata. |
| Historical body snapshot | The state produced at a specified earlier feature, with its exact body ID, creation owner and ordered generating/modifying lineage. |
| Operation operand | An explicitly selected body identity in the required current or historical scope; the two scopes are not interchangeable. |

The additive schema below is the selected local design. Union/intersection do not privilege an input body: they create a new result identity. Subtraction modifies its explicit target and retains that target's identity. These are design decisions, not runtime compatibility findings. A current DTO is not the source of persistent IDs. Native handles, pointers, native hashes and meshes never enter the document.

| Saved field | Meaning |
| --- | --- |
| `BodyReference { bodyId, sourceFeatureId }` | Exact body state at its explicit creating or modifying feature. Current execution must match both fields. |
| `bodyOperation: { mode:'new', bodyId }` | Explicit new output on an extrusion, revolution, sweep or loft. |
| `bodyOperation: { mode:'merge', target:BodyReference }` | Add material to that exact existing target; retain its body ID. |
| `bodyScope:BodyReference[]` | Nonempty explicit targets of a cut or hole, at most 256 distinct body IDs. |
| `bodyScope:BodyReference` | One exact target for fillet, chamfer, shell or draft. |
| Automatic new-body extrusion `endCondition.baseBody` | Exact current body used by through-all/until-next; its source must equal `endCondition.baseFeatureId`. |
| Combine `operation:'add'\|'common'` | Ordered `operands` (2–256), a fresh persisted `resultBodyId`, and required `keepTools`. |
| Combine `operation:'subtract'` | One `target`, ordered `tools` (1–255), and required `keepTools`; no new result ID. |

`bodyOperation` belongs to material extrusion, revolution, sweep and loft, never to a cut. Sweep and loft retain their required legacy `merge` boolean; with an explicit body operation it must equal `bodyOperation.mode === 'merge'`. Parsing and execution reject contradictory settings rather than rewriting them. Absence of these fields retains the legacy path without inserting metadata. Once a body catalog is active, a modifying operation needs its explicit scope; unsupported legacy operations must report an error for repair instead of guessing a single body's ownership. The serializable `PickableBody` DTO includes its exact reference, creating feature, name, display mesh/normals/triangles/edge lines, individual face/edge picking, native volume and bounds. `CadResult.bodies` and `bodyCatalogActive` remain optional for legacy results.

Each supported catalog entry must be bound to exactly one valid closed solid by the producing operation's ownership or verified generation history. An independent body-copy output needs its persisted instance identity and exact source/instance provenance under [BODY_PATTERNS](BODY_PATTERNS.md). A command-defined instance address may locate that saved output slot; it is not a native solid index. Removing a new-body instance and creating another must not resurrect its retired ID. Parameter edits may preserve a surviving slot only when that correspondence is established. Explicit body-copy merges and selected feature geometry instead retain their target IDs; neither allocates an independent body for each transformed contribution.

Sweep and loft each own one explicit closed-solid output, staged as a new catalog entry or fused with one exact selected target. Their generated tool never implicitly fuses with the scene aggregate. A suppressed input of an explicit producer is a feature error that blocks export; legacy-only documents retain their existing omission behavior. Explicit linear/circular/mirror body-copy outputs and merges are defined by [BODY_PATTERNS](BODY_PATTERNS.md). Selected feature geometry uses its separate [opt-in declaration](FEATURE_PATTERNS.md), exact historical contributions and one atomic replacement set of finally changed targets. Neither route executes an aggregate result and guesses individual owners afterward. Unsupported undeclared repetitions still reject. Per-instance regeneration, varying sketches, dynamic/automatic scopes and broader nested/dependent ownership lifecycle remain required body-management work, not removed scope or completed validation.

Never identify or reassign a body using native traversal order, an index into `shape.solids`, volume, bounds, position, geometric rank, nearest geometry or a geometric sort. A rebuild may enumerate differently while the saved identities remain unchanged. A split, merge or replaced source does not authorize guessing an output assignment.

Keeping a target ID through subtraction identifies the surviving modeled body, not an unchanged snapshot or unchanged faces. Union/intersection instead allocate a new result ID even when the result happens to equal an input's geometry. Store and check the applicable history scope independently. A historical selection must resolve the requested earlier state; it must not be redirected to the current state merely because a body ID is equal. Missing, consumed, suppressed, replaced, foreign or ambiguous current operands fail closed. Forward and cyclic dependencies are invalid.

## Creation and current catalog

The editor must distinguish creating a separate body from adding material to one selected existing body. Make the choice and body scope visible in the feature proposal. New-body creation owns its output and persists its ID; adding material modifies only its explicitly selected target and preserves that target ID. An operation must not fuse into all displayed bodies because they share one viewport mesh.

The first supported independent output is one closed solid per catalog entry. Separate entries may overlap: the issue's two input boxes deliberately overlap before Combine. The current scene can contain several entries. The temporary single-output restriction below applies to one modifying operation's result, not to the whole document.

Return a serializable per-body catalog alongside any aggregate viewport mesh. It must contain exact body identity and provenance, available state, bounds and body-associated picking data. The body list and 3D selection must select the same body. Highlighting, visibility and presentation order must not change saved identity or operation scope. Consumed or suppressed bodies must not remain selectable as current operands; their producing history can still exist.

## Combine operation contract

Subtraction saves a principal target and a nonempty ordered list of distinct tools. Union/intersection act on an ordered collection of at least two distinct bodies and save a new `resultBodyId`. Each variant saves its operation and an explicit `keepTools` boolean. No body may occur twice, including through references to different historical modifying states. Resolve every operand from the same validated document state before any Boolean is committed. Do not reorder operands by geometry or enumeration.

| Operation | Defined result |
| --- | --- |
| Union/add | Bodies fused in their saved order; a new result body owns the output. |
| Subtract | Target minus each tool in saved order. The first operand is the target; exchanging it with a tool changes the result. |
| Common/intersection | Bodies intersected in their saved order; a new result body owns the output. |

Set operations can be mathematically commutative or associative while native construction/history differs. Retain the explicit order in the document, execution and provenance. Subtract must show separate Target and Tools controls, not one unordered selection list.

The selected initial local policy is:

- Preserve the subtraction target's body ID and record the Combine feature as its new modifying state. Union/intersection allocate a new result ID owned by the Combine feature.
- With `keepTools:false`, subtraction consumes its tools and retains its modified target; union/intersection consume every input and retain their new result. Consumption is not deletion of creating features or historical snapshots.
- With `keepTools:true`, subtraction retains its original tools; union/intersection retain all original operands and add the new result. Retained bodies keep their IDs, creating ownership and geometry. Entries may overlap. Aggregate mass counts each body's material; it is not the geometric union of all visible entries.
- Reject an invalid, empty, non-solid or multi-solid target result atomically. Reject a subtraction that removes no material rather than silently consuming unrelated tools.
- Empty and multiple-result support is deferred explicitly. A later extension must specify output identities, split/merge lineage and downstream references before relaxing this restriction. It is not excluded from the longer-term scope.

Changing `keepTools` or operands requires a newly validated proposal. Generic parameter edits preserve exactly the command's created output IDs. Changing add to common or vice versa retains `resultBodyId`; changing new-body creation to merge or changing add/common to subtraction requires a future explicit replacement/repair transaction, rather than hidden creation in an ordinary edit. Restoring consumed inputs through undo or `keepTools` restores their existing identities. Unsupported structural source/output changes reject or require explicit new creation, rather than rebinding an old ID.

## Selective cuts and downstream operations

A body-targeted cut or hole resolves its explicit current target and constructs/evaluates the cutting tool against that target's geometry and termination rules. It must preserve every unselected catalog entry, its ID, geometry and appropriate reference metadata. Through-all/until-next bounds and intersections come from the selected target, not the aggregate scene. Unsupported split or empty target output follows the temporary rejection policy above.

For scoped holes, `baseFeatureId` must equal `bodyScope[0].sourceFeatureId`. A scoped cut's through-all/until-next base likewise names the first selected body's source; a scoped material addition uses its merge target's source. This first entry is saved selection order, never native solid order. Each selected cut target receives its own through-all/until-next tool, with all replacements committed together. Fillet, chamfer, shell and draft require `baseFeatureId` to equal their single body scope's source. These are execution checks; structurally valid but unavailable or mismatched saved states can still require repair.

A new-body extrusion with through-all or until-next also saves `endCondition.baseBody:{bodyId,sourceFeatureId}`. That reference is required, must name an earlier explicit output and must have `sourceFeatureId === endCondition.baseFeatureId`. Its geometry, rather than the scene aggregate, supplies the limit. Saving only a feature ID or selecting the only current body with that source is insufficient: editing an earlier operation's scope must not redirect the saved target to another body. `baseBody` is forbidden on merge, cut and legacy automatic limits, whose existing target fields already define their scope; up-to-surface retains its historical face/plane target grammar. The base is a dependency, not an output of the new extrusion. Structurally owned stale, consumed and suppressed references remain loadable for repair; a scope edit that removes that source/body association rejects rather than rewriting the saved reference.

Body-aware finishes, shell/draft and supports must likewise establish which body owns each selected face/edge. A body ID is not proof of face/edge correspondence. Follow the [semantic reference contract](SEMANTIC_REFERENCES.md): retain exact v1 keys and aliases where supported; use v2 only with verified provenance. Boolean descendants must not inherit finite-prism keys whose mapping has not been proved. An ambiguous alias or a foreign-body face/edge rejects.

Historical face supports, historical body-pattern sources and up-to-surface targets remain explicitly historical. Keep owned historical geometry/catalogs only for the consumers that require them, with bounded lifetimes and separate current-state lookup. A current body selection must never accidentally resolve a historical snapshot, or vice versa.

## Transactions, validation and compatibility

Preview and Apply must consume one detached proposal containing its allocated IDs, exact source document revision, operand identities/scopes, settings and candidate result. An edit to the document, selection, operation, tool order or `keepTools` invalidates it. Apply checks the complete source revision and displayed settings, resolves all operands, validates every candidate and commits one document/history entry. Cancellation, stale proposals and any failure leave the document, history and original body set unchanged. No first operand may be consumed before a later operand fails.

Engine reconstruction must also validate before replacing its last valid catalog. On an error, report the failed feature, retain the last valid display state and block export of the incomplete rebuild. Do not present that retained preview as a successful committed result. Release candidates, operand clones and catalogs on all success, rejection and exception paths; state transfers and native ownership must be explicit.

An unsuppressed body-aware operation with an unavailable sketch, base, support or end-condition target is an error, not a warning-only omission accepted as a healthy preview. In an active catalog, a modifying feature missing its required body scope/operation also errors before unavailable-input shortcuts. Legacy-only omission/warning behavior remains unchanged. Blind-hole lineage includes both the depth-reference choice and flat/conical tip kind, so structural branch changes do not silently keep the old namespace.

Initial bounds are 256 active catalog bodies, 2–256 operands for union/intersection, and at most 255 tools plus one target for subtraction. New body IDs and body-state producer/modifier IDs contain 1–128 characters with no control characters; legacy feature-ID syntax remains unchanged. Do not impose the active-catalog bound silently on legacy aggregates. Preserve existing feature, pattern, face and edge selection limits. Reject extra keys, nonfinite values, sparse arrays, malformed IDs, duplicate output IDs/operands, foreign owners and forward references. Exhausting a cumulative body/operand limit rejects the whole proposal.

Body dependencies must join [feature dependency analysis](../src/model/featureInputs.ts), parser validation and [document history](../src/model/document.ts). Creation ownership alone is insufficient: include each operand's exact generating/modifying source dependency and its transitive creation chain. Feature deletion preserves the dependency cascade with body consumers included; undo restores the original records and IDs. The parser requires an existing earlier source structurally capable of producing that body ID and rejects missing, later or foreign owners. References to stale, consumed or suppressed states can load for repair when that structural association remains valid; execution rejects unavailable current states without substituting another solid. Loading for repair is distinct from accepting an executable proposal.

The schema is additive within version 1; absent fields preserve legacy behavior. New readers must preserve old version-1 documents. Do not claim that old strict readers accept new fields. Parsing/serialization must preserve surviving IDs, operand order, options, history scopes and saved v1/v2 references without silent migration or reassignment. Created body IDs are unique across the whole saved document, including suppressed features; current catalog capacity is a separate engine limit.

## Committed-snapshot export

Export reconstructs the committed document in an independent engine snapshot, as the existing [export path](../src/cad/kernel.engine.ts) does. Export every active supported body, including retained tools, without an implicit union or silent omission. A failed current or historical reference blocks export. An outstanding or cancelled preview must not alter the exported document.

A native STEP export/reimport test can inspect a multi-solid compound and verify its bodies. This is a same-kernel geometric round trip; it does not establish independent interoperability or extend the editor's single-solid STEP import policy. STEP/STL must not be described as preserving the document's opaque IDs or parametric history without separate evidence.

## Original analytical acceptance fixtures

All fixtures below are original Cartesian inputs in millimeters. They are acceptance requirements, not executed passes. Use native closed-BRep validity, solid count, volume, surface area and bounds. Do not compute expected values with the implementation under test or identify outputs by sorting their measured geometry.

Let A occupy `(0,0,0)` to `(10,6,4)` and B occupy `(5,0,0)` to `(15,6,4)`. Each box has `V=10*6*4=240 mm³` and `A=2*(10*6+10*4+6*4)=248 mm²`. Create them as two explicitly identified bodies even though they overlap. With default tool consumption:

| Result | Volume (mm³) | Area (mm²) | Bounds min → max |
| --- | ---: | ---: | --- |
| Union A+B | 360 | 348 | `(0,0,0)` → `(15,6,4)` |
| Common A∩B | 120 | 148 | `(5,0,0)` → `(10,6,4)` |
| Subtract A−B | 120 | 148 | `(0,0,0)` → `(5,6,4)` |
| Subtract B−A | 120 | 148 | `(10,0,0)` → `(15,6,4)` |

Each result has exactly one valid closed solid. Subtraction retains its designated target ID; union/intersection use their new persisted result ID. Translating B by +1 mm along X gives B bounds `6…16`; its creating body's ID remains unchanged:

| Result after edit | Volume (mm³) | Area (mm²) | Bounds min → max |
| --- | ---: | ---: | --- |
| Union A+B | 384 | 368 | `(0,0,0)` → `(16,6,4)` |
| Common A∩B | 96 | 128 | `(6,0,0)` → `(10,6,4)` |
| Subtract A−B | 144 | 168 | `(0,0,0)` → `(6,6,4)` |

Test `keepTools` separately: subtraction leaves its analytical target result plus the unchanged tool, for two active bodies. Union/intersection leave the analytical new result plus both original boxes (`V240/A248` each), for three active bodies. All original retained IDs remain unchanged. Check each body independently; aggregate volume/area is the sum of those entries, including overlapping material.

For selective cutting, place B at `(20,0,0)` to `(30,6,4)`. Apply a radius-1 through-hole centered at `(5,3)` to A only. The cylinder removes `4π` volume, removes two disks of total area `2π` and adds cylindrical wall area `8π`:

| Body/result | Volume (mm³) | Area (mm²) | Bounds min → max |
| --- | ---: | ---: | --- |
| Target A after hole | `240−4π` | `248+6π` | `(0,0,0)` → `(10,6,4)` |
| Unselected B | 240 | 248 | `(20,0,0)` → `(30,6,4)` |
| Aggregate, exactly two solids | `480−4π` | `496+6π` | `(0,0,0)` → `(30,6,4)` |

Verify the target ID and the separate unchanged B binding, not only aggregate mass. Repeat the same hole proposal with B selected: it must reject because the tool does not intersect B, even though it intersects A in the aggregate. This distinguishes actual body scope from an aggregate cut that happens to leave distant geometry unchanged.

Useful rejection inputs include disjoint union/common, a tool covering the entire target, and subtraction of a full-height slab `X4…6/Y0…6/Z0…4` from A, which would split A into two solids. Reject without losing either operand. Also cover a missing/suppressed/consumed operand, duplicate target/tool, changed source before Apply and an invalid later tool after a valid first one.

For automatic new-body limits, use two differently sized current bodies and select the smaller one explicitly. Both through-all and until-next must use that body's limits, preserve the base reference on reopening/history and leave both inputs unchanged. Cover a missing or mismatched `baseBody`, a multi-output source and an upstream scope substitution. The parser must not treat the base input as an output of the new extrusion, and execution must not resolve a stale base to another current body.

Proposed absolute tolerances are `5e−7 mm` per native coordinate and `5e−6` for native volume (mm³), area (mm²) and bounds (mm). Mesh/display precision is a separate contract; Float32 rendering values must not be used as the native geometric oracle. State any explicit display-rounding bound separately. Fresh committed-snapshot export/reimport must repeat the relevant validity, count and analytical geometry checks.

## Implementation and acceptance checklist

Every item is pending for this proposal. Record executed evidence against the exact source head in [VALIDATION.md](VALIDATION.md); do not check an item merely because a helper or a test file exists.

### Model and identity

- [ ] Implement and validate the selected body fields, owner/snapshot scopes, explicit creation/merge choice, fresh union/intersection identity, Combine operands/options and additive version-1 compatibility.
- [ ] Persist opaque output/instance IDs; preserve them through supported parameter edits, exact save/reopen and undo/redo.
- [ ] Reject malformed, sparse, duplicate, missing, foreign, forward or ambiguous operands at the appropriate parser/proposal/rebuild boundary.
- [ ] Include creation and modifying/historical dependencies in deletion cascades and suppression handling; test source replacement and delete/recreate without stale rebinding.
- [ ] Enforce cumulative body/operand bounds atomically without changing legacy aggregate limits.

### Engine, ownership and transport

- [ ] Build an exact per-body catalog from supported producer-owned outputs; never assign identities from native solid enumeration or measured geometry.
- [ ] Implement explicit separate creation, targeted material addition and all three ordered Combine operations, the reviewed identity policy, consumption and `keepTools`.
- [ ] Reject invalid/empty/multiple outputs and late failures without partial target replacement or tool consumption.
- [ ] Implement actual body-targeted cuts/holes and appropriate downstream finishes/supports; leave unselected bodies and their identities intact.
- [ ] Preserve legacy `merge:false`, body-pattern/mirror, STEP import and conservative v1 behavior; keep unproved Boolean face/edge correspondence unavailable.
- [ ] Check the strict opt-in boundary, including suppressed legacy predecessors, without adopting old aggregates or silently skipping unsupported transitions.
- [ ] Complete validation of explicit sweep/loft and body-pattern outputs against their contracts; reject unproved instance ownership.
- [ ] Validate opt-in selected feature geometry and complete the remaining regeneration, varying-sketch, dynamic/automatic-scope and broader nested/dependent lifecycle requirements; retain exact source/target ownership throughout.
- [ ] Bound and dispose current/historical native owners, clones, catalogs and candidates; send complete serializable body/picking metadata through the worker.
- [ ] Export the committed body set from a fresh engine snapshot and block incomplete/error-state export.

### Application and editor

- [ ] Expose body list, viewport body selection/highlight and available/consumed/suppressed status with the same identities.
- [ ] Expose separate-body/add-material choice, ordered operand collection for union/intersection, distinct Target/Tools controls for subtraction, operation and `keepTools`; make cut scope explicit.
- [ ] Preview one exact candidate and reject document/settings/selection staleness; Apply commits one history entry and Cancel commits none.
- [ ] Reconcile saved body/face/edge selections after edits, undo/redo and reopening without replacing stale identities by nearby shapes.
- [ ] Exercise the real editor workflow for creation, each operation, selective hole/cut, cancellation, rejection, save/reopen and history. Component rendering alone is insufficient.

### Geometry, provenance and actual results

- [ ] Publish original fixture coordinates/formulas and generation steps; check both operand orders for subtraction and the shifted-B edit.
- [ ] Check valid closed BReps, exact solid counts, native V/A/bounds, per-body target scope, retained tools and all useful rejection cases above.
- [ ] Check downstream supported finishes/historical selections and fresh same-kernel STEP reconstruction, with limitations stated.
- [ ] Run `npm test`, `npm run build` and `npm run test:desktop` on the implemented source; preserve failures, timeouts, crashes and skipped phases as actual results.
- [ ] Record hosted Windows/macOS/Linux results separately, including exact head, runtime/tool versions and commands; distinguish packaging, initial-model smoke and real editor interaction.
- [ ] Keep unexecuted platform/interaction/independent interoperability cases explicitly pending. These fixtures do not establish general body naming or complete CAD support.
