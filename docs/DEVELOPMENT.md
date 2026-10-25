# Development guide

The assembly workspaces share a compact viewport toolbar. Existing view,
selection and manipulation callbacks, accessible names and busy guards remain
in place. Context labels stay below it, and configured picking instructions
retain their separate layout row. The original origin-lock renderer workflows
inspect actual command containment and center hit targets, activate front and
isometric views with pointer input, and check document/history/CAD-request
invariants. Their command reveal waits for the manager's scheduled focus before
scrolling the target; it still requires stationary, fully contained hit targets.
Both workspace callers reserve a 44 px top band for the toolbar in origin-label
layout. Boxes and the overflow list begin below that band; projected witness
coordinates and reference bindings remain unchanged. The optional inset defaults
to zero outside those workspaces, participates in the layout signature, and
invalidates a press from a prior layout. The origin-picking renderer audits the
actual visible labels against the toolbar bounds as well as their hit targets.

While a part operation is edited, its current resolved source sketches are
visible in orange even when ordinary browsing hides consumed sketches. The
source includes an unaccepted staged sketch. Pending, mismatched or failed source
builds provide no active overlay; stale displayed-model copies are removed for
those input IDs. Suppressed sketches remain excluded. The overlay changes no
selection, document, history or body/face/edge identity. Revealing it does not
trigger a camera fit; the existing first-body fit still applies. Any source
feature error conservatively hides all active inputs. Multiple sweep/loft inputs
currently share the same highlight, without separate role colors.

The original revolution renderer checks a staged height change, active input
identity after reopening a consumed profile, selector changes, Cancel and the
existing geometry/history/save/export oracles. Optional captures retain two
presented editor states separately from the clean final-document capture.
Screenshots require visual inspection; DOM input IDs are not pixel evidence.

The standard assembly renderer records bounded gear-gesture dispatch/release
stages and remaining time against its unchanged child deadline. Idle polling
returns a bounded read-only projection with the latest matching request and
response summaries, retaining the final full-history audit. These diagnostics
do not by themselves establish a timeout cause or fix.

Concentric rotation capture accepts current principal-axis references and
material-cylinder axis references. Other mechanical families retain their
existing material support requirements. The saved quaternion uses ordered full
owner frames, inverse(first) times second; it fixes relative orientation while
leaving axial travel free. New origin captures require distinct local rigid
owners in the declaring scope, with the scope frame as a valid static endpoint.
Native witnesses, original placement-chain precision, final physical checks
and private preview/Apply authority remain required. No format version changes;
older readers may reject principal-axis declarations with a non-null lock.

The standard manager captures through its verified preview. The configured
manager exposes an explicit Lock rotation action for an existing free concentric
relation; replacement retains the relation ID, name, ordered roles and alignment.
Its mechanical editor requires recapture when no saved lock exists. The renderer
sends reference intent, never a captured quaternion. Named-state edits retain the
source and inactive configurations. Original production-renderer commands are
`test:desktop:assembly-origin-axis-lock` and
`test:desktop:assembly-configured-origin-axis-lock`.

The part tree reserves the selection-action strip even when no operation is
selected. Its disabled actions retain their existing guards, preventing selection
from shortening the scrollable tree between the two presses of a double click.
The compact revolution renderer checks actual CDP click counts at the lower tree
edge, unchanged row geometry and exact Cancel after reopening the saved operation.

Part operation commands use labelled `CommandGroup` containers without changing
their callback, order or availability. The fixed-height ribbon keeps horizontal
overflow; group-specific icon and row sizing makes space for labels. Direct
commands no longer draw a dropdown chevron. The part property editor keeps its
existing title and confirmation row inside a sticky header, with scroll padding
for field navigation. These are presentation changes, not new CAD capabilities.

Configured origin-picking instructions occupy a separate flex row before the
viewport. They previously used an absolute overlay above projected origin
labels. The existing ResizeObserver updates viewport projection when the row
appears; current layout and identity checks remain required. Origin-label audits
include the bounded actual hit element to make future covering elements visible
in diagnostics, without relaxing containment, separation or center-hit checks.

`RevolveFeature.axis` optionally selects a local X/Y axis or stable line entity
ID in its existing `sketchId`; `reversed` changes axis direction while the angle
stays positive. Absence retains local +Y and false without materializing fields
on read/write. The strict parser rejects unsupported fields; older readers may
reject new declarations. Same-sketch lines need no additional feature graph edge.
The native resolver reads current solved endpoints and the resolved sketch frame,
rejecting missing, ambiguous, nonfinite or degenerate axes. Radial profile checks
include exact circular-arc extrema. Implicit Y with absent/false reversal keeps
the historical lineage descriptor; explicit axes use a versioned declaration
identity. Rebuilding after axis edits must never expose a prior valid export.

`RevolvePanel` derives options from the operation's current staged source sketch,
retains unavailable declarations visibly, and updates through the existing draft
and preview freshness path. It does not grant Apply authority or change body plans.
The original staged-sketch Cancel and acceptance transactions remain required.

`test:desktop:part-revolution` uses a tracked original sketch recipe and the
existing hidden production harness at the production minimum 1040 by 700 window.
It previews X/Y and a construction-line axis, reversed partial turns and exact
Cancel, then tests a reversed explicit-Y revolution and subsequent cut through
history, Save/reopen and one restricted STEP export. Its independent reader
checks the exported solid. The harness reveals controls with DOM scrolling and
requires unique visible enabled hit-tested targets before field changes; command
activation remains actual pointer input. Field setters and test-owned native
dialogs are distinct from human typing/dialog operation. CI configuration for
three systems is not executed platform evidence.

Ordinary part browsing uses `partSelection.ts` to share the edge/face/plane
candidate policy between hover and activation. It reuses the existing visible
geometry pickers and their pixel thresholds, clipping and occlusion checks.
Explicit body selection remains separate. Busy or stale browsing is disabled;
operation-owned face, edge and body modes retain their own callbacks and guards.
Clearing ordinary selection changes only local presentation state, never an
operation draft, recovery or document history.

`assemblyOriginLabelLayout.ts` lays out fixed CSS-pixel rectangles independently
of `assemblyOriginLabels`' geometric projection. Key order resolves ties and a
bounded fallback grid packs remaining space. Insufficient capacity moves the
whole set to one scrolling list without dropping identities. Anchor coordinates,
bindings and geometric picking remain unchanged. Layout is recomputed only when
projected anchors or viewport dimensions change; a pointer press from an older
layout cannot activate after a resize or layout change. Existing current-catalog,
scope and reference-compatibility checks remain required.

The assembly component trees share `assemblyTreeNavigation.ts` and
`useAssemblyTreeNavigation.ts`. Keys identify the full occurrence path and exact
definition revision, so reused subassemblies expand independently. The configured
tree also identifies its configuration actions separately. Expansion and keyboard
focus are presentation state; they are never serialized into the CAD document.
Collapsed descendants remain mounted under hidden groups, retaining selection.
New external selection, returning to the model pane or replacing the document
reveals the selected ancestry; ordinary renders do not undo an explicit collapse.
Removed or revised identities are pruned. Up/Down/Home/End move focus; Right opens
or enters a branch and Left closes it or returns to its parent. Enter/Space use
the row's existing activation. A disclosure returns focus to its owning row.

Selecting a component keeps the model tree visible. The explicit component
properties command opens a separate standard Properties pane or the configured
occurrence inspector. The standard editor fieldset is mounted once in that pane;
changing panes preserves its controlled and uncontrolled values. Its tab can
show empty guidance without a selection; component commands still require a
selected component. The Move command aligns the existing movement section below
the sticky header so its fields are visible, even when the heading was already
near the bottom of the pane. Individual control destinations retain minimal scrolling.
Returning through the pane header reveals and focuses the selected tree row.
Document replacement resets the standard manager to Model. Configured selection may
still rebuild when its declaring scope changes; it must retain the fresh-build
guard. Disclosure and keyboard focus themselves do not issue CAD requests.
The component tree also exposes principal planes and axes for the document root
and each visible, unsuppressed occurrence. `assemblyOriginTree.ts` separates the
complete declaration catalog from the viewport's bounded display list: browsing
draws only the selected datum. Its full owner path, definition revision, selected
configuration lineage, world pose and current document/scope/session binding
must still resolve before selection or highlighting. Root browsing always uses
the document frame, independently of the current relation-editing scope.

Datum browsing is presentation-only. It neither changes component selection or
scope nor assigns a relation role, and collapse retains its highlight. Selecting
a component clears it. Selecting a datum disarms an idle standard manipulator;
arming a manipulator clears datum browsing. Active drag sessions remain guarded.
While a datum is selected, component Properties access is disabled and standard
component editors stay mounted but hidden and disabled, retaining their fields.
The standard workspace keeps guarded datum rows focusable
with `aria-disabled` when component browsing remains available; activation stays
blocked. The configured model tree remains disabled during a relation draft.
Armed origin roles retain the existing relation editor and its current display,
ticket and compatibility checks. A point-origin producer is not added.

The configured relation editor uses a native details/summary disclosure for
origin references. Controls remain mounted when closed. Disclosure alone changes
neither picking intent, owner nor assigned roles. A new explicit visibility or
origin-picking request opens the section; ordinary rerenders do not undo a user's
collapse. Inspector reveal chooses an enabled, rendered control outside closed
details content so a new relation focuses its main form without opening origins.
The renderer navigator reveals these controls through the actual summary before
using them; it never assigns the details open state directly.

`desktop-assembly-tree-navigation.cjs` discovers mounted ancestry and opens its
real disclosure controls before a hidden target can be selected. It does not
unhide nodes or write application state. The bounded tree-controls scenario uses
the existing original reused BOM fixtures and actual pointer/keyboard input;
its acceptance and subsequent persistence checks remain separate. See
[validation](VALIDATION.md) for executed cases and limits.

`desktop-assembly-origin-tree-controls.cjs` uses actual pointer input on the
original origin-axis and reused BOM fixtures. It checks root/component plane
and axis selection, retained highlight when collapsed, and exact recovery,
history controls, owner/scope and native request invariants before restoring
the original component. Existing relation and file-persistence oracles follow.

Tree navigation and serial-only boundaries in the standard persistence workflow
use the observer's request serial, assembly count and worker-error count through
a read-only projection calculated in the renderer.
Each helper's existing idle entry also compares those counters with a full
snapshot and records payload sizes and read durations. A mismatch fails the
workflow. Standard persistence response polling projects the last completed
matching record, including failures, and all worker errors before transport.
Its serial/action filters and ordering are unchanged. Idle audits compare the
complete projected record against the full snapshot, plus an empty result after
the current serial. Source-repair correlation, gesture streams and final error
audits retain full snapshots; no observation is pruned. These measurements do
not by themselves identify the cause of an earlier workflow deadline.

The standard persistence workflow passes its existing `assemblyNavigation`
instance to all eight subflows. Their `withNavigation` entry reuses the already
wrapped click instead of wrapping it again and revealing every target twice.
Explicit subflow pane changes use that same navigator and its actual pointer
transport when available. Target uniqueness, visibility, enabled controls and
native response checks remain. One unused pre-save gear snapshot is removed;
the subsequent full audit and all consumed observations remain. Measure the
complete workflow before making any performance or deadline-stability claim.

Part and assembly top-level menus use `AssemblyMenuBar.tsx`. Callers provide existing
actions and their current guards; closed menus do not mount duplicate controls.
Focus transfers after the menu commit, before a following keyboard action.
Escape within the menu closes it and restores trigger focus without reaching
the workspace's draft-cancellation handler. The part keyboard handler respects
consumed events. Menu availability follows the current edit and history state.

`AssemblyCommandTabs.tsx` controls a separate `ribbonTab` in both assembly
workspaces. Selecting Ensamblaje, Relaciones or Evaluar changes command visibility
without navigating the inspector, altering a draft or disarming reference picking.
Each command remains mounted once in its owned tab panel; inactive panels use
`hidden`. Ensamblaje contains insertion and the primary relation command,
Relaciones contains the relation list, and Evaluar contains the available analysis
commands. Solve/Apply/Cancel remain outside the hidden panels with their existing
guards. Left/Right wrap between tabs; Home/End select the first/last tab. Only the
selected tab is in the Tab sequence. Closing BOM reveals Evaluar and restores
focus after commit; document replacement resets the ribbon to Ensamblaje.

Starting a profile operation from a new or saved unused part sketch stages it
without accepting it. The operation's source build, body-command validation,
preview and acceptance use the same `operationDocument`, including the staged
sketch. Saved sketches update in place; new sketches append. Its profile selector
is locked and acceptance requires that sketch ID.
The persisted `doc`, serialized document and recovery remain unchanged during
the preview. Cancel restores the sketch draft and its local undo/redo; document
replacement clears staging. Acceptance validates the final document before
recording the sketch change then operation, with no intermediate document render
or recovery write. An unchanged saved sketch retains the original document and
does not add a redundant history entry. Document Undo removes the operation first,
matching the explicit exit-sketch route. Saved unused sketch previews build the
complete modified feature list before admission; any dependent feature, including
a suppressed one, excludes the shortcut. Consumed sketch edits retain rollback.
A stale or unhealthy preview and unfinished sketch
chamfer, fillet, mirror or offset tools must not start the transition.

`PartFeatureContextMenu` renders caller-owned tree editing actions in a portal.
Each opening has a fresh request identity; actions identify the selected feature
and each distinct sketch input. Pointer, context-menu key and Shift+F10 routes
share the same guards. Escape is consumed before workspace keyboard handlers.

`partFeatureTree.ts` derives root features and distinct sketch inputs without
changing the document. Expansion belongs to the workspace, and filtering only
forces the displayed branches open. Shared inputs have parent-specific occurrence
keys. Disclosures are siblings of the actionable rows; collapsed groups retain
their ARIA target but unmount their child rows. Focus navigation does not select
a feature. Editing remembers the input occurrence, reveals its owner and returns
focus after the tree remounts; document replacement clears this presentation state.

The prepared part renderer exercises disclosure, selection retention, Right/Left
navigation and temporary filtering before the existing geometry sequence. Tree
pointer targets are scrolled into view through the DOM API, observed stationary
and hit-tested before CDP press/release. A failure includes bounded rectangle,
viewport, scrolling and hit-target diagnostics. Deadlines and geometry checks are
unchanged; see [validation](VALIDATION.md) for executed and hosted results.

The two origin-axis renderer flows also exercise actual menu pointer/keyboard
input through `desktop-assembly-menu-controls.cjs`, including Escape, Tab,
disabled history, tree/editor navigation and retained references. Keyboard
transport is restricted to these hidden, test-owned windows and fixed keys.
The configured flow additionally changes the displayed origin owner inside its
current draft, transiently selecting both components before restoring the
original root/component pair for the unchanged native oracle. Owner selection
is scripted; origin-label selection uses actual CDP input. See
[validation](VALIDATION.md) for executed cases and limits.

Assembly renderer workflows use the application's contextual manager tabs.
`desktop-assembly-navigation.cjs` and `desktop-configured-navigation.cjs` reveal
the owning panel before a scripted control action; neither unhides DOM nodes nor
changes application state directly. Pointer workflows retain actual CDP input,
hit testing and bounded wheel events. After a wheel event, the configured pointer
case observes a stationary target before pressing; it does not retry a missed
click or extend the existing deadlines. A panel-navigation pass is separate from
native geometry, file persistence and platform acceptance.

The hosted [CI run for `a709556`](https://github.com/angelcp2802/solidflow/actions/runs/40129262044)
failed symmetry authoring on all three operating systems before its first
preview: tab navigation called the pointer helper, whose scenario guard omitted
that workflow. The failure was `Expected actual pointer input in the hidden
test-owned assembly window.` The targeted guard correction passes the Windows
symmetry renderer's 174 checkpoints, including five Save As/reopen pairs; see
[validation](VALIDATION.md). It does not change solver checks or deadlines,
and hosted recovery still requires new-head execution evidence. The same
commit's [Security run](https://github.com/angelcp2802/solidflow/actions/runs/40129262048)
passed. These results apply to that commit, not to the origin-selection changes.

The later hosted [CI run for `0075cf9`](https://github.com/angelcp2802/solidflow/actions/runs/40131849382)
fails rigid assembly persistence and symmetry viewport selection on Linux and
Windows. All macOS renderer jobs, configured authoring on all three systems and
the three relations jobs pass; Desktop jobs stop at the renderer prerequisite
gate. Dedicated logs were unavailable, so the failed stages alone do not
establish an assertion-level cause. Its
[Security run](https://github.com/angelcp2802/solidflow/actions/runs/40131849385)
passes both CodeQL and dependency audit. This is partial hosted evidence, not
complete acceptance of that commit or the subsequent menu/owner increment.

After building, `npm run test:desktop:assembly-configured-picking` checks actual
component and general face/LINE role selection in an original configured
assembly, with preview, history and real file IPC. See
[core workflows](CORE_WORKFLOWS.md) for the signed-distance example and current
UI feedback. This fixed command uses the existing isolated hidden harness;
configured CI does not establish a platform pass.

Run `npm run test:desktop:assembly-configured-picking-compact` after building
for the fixed 1040 × 700 variant. Both pointer workflows exercise upper-command
access and application-owned left-inspector reveal/focus; the compact case also
checks the available viewport layout. Current execution evidence is limited to
the recorded Windows cases in [validation](VALIDATION.md).

The [configured component authoring contract](ASSEMBLY_CONFIGURED_COMPONENT_AUTHORING.md)
covers insertion, registered reuse and parent-relative fixed/floating state.
After building, run `npm run test:desktop:assembly-configured-components` for
its original shared-state import, preview/history and file-persistence workflow.
Keep the complete v3 catalog and selected imported state; never flatten them.

The [origin-axis contract](ASSEMBLY_ORIGIN_AXES.md) covers explicit root/component
X/Y/Z line references and their native relation lifecycle. After building, run
`npm run test:desktop:assembly-origin-axes` and
`npm run test:desktop:assembly-configured-origin-axes` for the original form,
preview, history and file-persistence workflows. Keep free axial/spin coordinates
separate from constrained coordinates. Concentric origin capture is handled by
the separate lock workflows; other mechanical families retain their material
reference requirements.

Visible origin selection shares `assemblyOriginPicking.ts` for owner-relative
identity, displayed placement, projected labels and axis/plane hit testing.
The standard and configured adapters nominate existing compatible reference
roles; they do not grant native verification or Apply authority. Keep visibility
separate from material picking, reject stale display/context events, and stop
temporary picking when the owner, visibility or active editor changes. Hidden or
suppressed owners must not contribute selectable overlays. The user steps are
in [core workflows](CORE_WORKFLOWS.md).

The origin-axis renderer flows reuse the original two-prism recipe in
`scripts/desktop-assembly-origin-axes-original.cjs`; see [provenance](PROVENANCE.md).
Their visible-selection route uses actual pointer input for visibility, role
and projected-label controls, while owner/type/value form changes remain
scripted. Preserve the independent geometry, Cancel/retry, Apply, history and
Save/reopen checks. A projected-label click is not evidence of a geometry hit
on an axis line or plane surface. Report those routes separately, with the
actual platform and execution results in [validation](VALIDATION.md); this
description adds no new passing or platform-support claim.

The [core workflow walkthrough](CORE_WORKFLOWS.md) prioritizes successive cuts,
additive extrusions, consistent mouse navigation and basic assembly selection.
After building, `npm run test:desktop:part-sequence` exercises its original
prepared-sketch workflow through the production renderer and real file IPC.
After building, `npm run test:desktop:part-fresh-sketch` exercises the separate
fresh face-supported rectangle/boss/pocket workflow described in that guide.
Its configured checks are not an execution claim; see the validation record.

The [configured compound authoring contract](ASSEMBLY_CONFIGURED_COMPOUND_AUTHORING.md)
connects profile-center, material LINE and circular-path forms to the existing
private configured declaration preview. After building, the fixed aggregate
`npm run test:desktop:assembly-configured-compound` runs rectangle profiles,
free circular profiles, LINE and circular material-path workflows sequentially.
Keep their current compound identities and independent geometric oracles separate
from syntax nominees, copied reports and Apply authority. The Configured relation
authoring CI job configures this aggregate and the five mechanical cases on
three operating systems; this listing is not an execution or support claim.

The [configured mechanical capture contract](ASSEMBLY_CONFIGURED_MECHANICAL_CAPTURE.md)
separates references/parameters from native capture authority for all five
mechanical families. Run `npm run test:desktop:assembly-configured-mechanical`
after building for the five bounded renderer workflows. Each also has a fixed
`test:desktop:assembly-configured-<family>` command. CI configures a separate
three-OS job; this listing is not an execution or platform-support claim.

The [configured relation editing contract](ASSEMBLY_CONFIGURED_RELATION_EDITING.md)
adds exact-state declaration lists and private intent previews. Preserve the
original baseline separately from the prepared proposal, materialize named
inheritance before Base edits and keep caller-authored captures gated outside
the separate configured native producer. New fixture and renderer evidence
must remain separate from general family or platform coverage.

The [configured BOM contract](ASSEMBLY_CONFIGURED_BOM.md) counts effective v3
occurrences with selected state, complete ancestry and root-relative member
paths. Keep its declaration-only report and literal-text CSV separate from
native geometry, solver authority and the legacy Base-only BOM. Changes should
retain pure grouping/CSV cases and current-context UI/export guards.

The [prototype hardening contract](PROTOTYPE_HARDENING.md) covers own-data
records, descriptor-first bounded reads, worker queue recovery and current
renderer oracles. The desktop baseline now includes an independent production
worker malformed-input/recovery probe; record it separately from UI controls.

The [persisted configuration integration](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md)
uses a strict v3 envelope around a v2 source and named-state catalog, an actual
effective native scene and private configured worker capabilities. Keep the
complete context together through history, recovery and file operations. Legacy
source/BOM/export routes must not silently unwrap it to a base assembly.

The standalone [selected-state transaction](ASSEMBLY_CONFIGURATIONS_SOLVE.md)
stages child solves before parents, isolates named inheritance on base writes,
preserves complete captures and gates all placed uses before atomic publication.
Its private single-use handle is separate from saved/editor transport. Never
infer an angular trajectory when an authored capture is stale.

The standalone [configured geometry gate](ASSEMBLY_CONFIGURATIONS_VERIFICATION.md)
owns fresh native observations for each placed relation. Keep physical
measurements independent of numerical residual rows, preserve original chain
error and native purpose, and withhold reports on fatal query/currentness/release
failure. A geometry report is not a saved configuration transaction or Apply grant.

The [closed numerical scope and state planner](ASSEMBLY_CONFIGURATIONS_SCOPE.md)
is separate from saved/editor integration. Preserve exact selected-state keys,
all placed native instances and full-chain numerical conditioning; local
numerical bodies do not replace physical root ownership. Scoped publication
requires the complete live native context before and after execution.

The standalone [capture/winding contract](ASSEMBLY_CONFIGURATIONS_STATE.md)
adds strict exact-state operations and named-capture materialization into core
evaluation. Keep authored captures, selected-state numerical inputs and native
capture authority separate. Base sidecar entries cannot be materialized as
named overrides; saved/editor variant solve/writeback remains a separate integration.

Use Node.js 24 and npm. Dependency versions are recorded in `package-lock.json`; install them with `npm ci`. Git is needed for the contribution workflow. Windows is the platform with the current local desktop evidence; macOS and Linux are targets whose build and runtime results must be recorded separately.

The public Vitest suite retains isolated fork workers and each test's existing
deadline. Concurrent workers are capped at four (or one fewer than the available
CPU count, with a minimum of one), because individual CAD workers can own large
native/WASM heaps. A targeted filtered run is diagnostic evidence, not a
replacement for the complete `npm test` acceptance.

## Choose a branch and runtime

Start ordinary contributions from `main`. The [project status and review queue](PROJECT_STATUS.md)
lists dependent draft increments and their intended bases; review a stacked
change against that base rather than treating its prerequisites as merged.
Consult the selected branch's own contracts and validation record for behavior
that is still proposed.

The [native structural STEP prerequisite](ASSEMBLY_STEP_STRUCTURE.md) supplies
standalone AP242 product/instance export, a bounded graph reader and autonomous
v2 saved import, including [explicit multibody bases](IMPORTED_BODIES.md). The
separate [editor integration](ASSEMBLY_STEP_EDITOR.md) connects explicit worker
requests and the existing restricted file bridge.
Its original native and pure cases run in the public unit suite; changes to the
shared STEP reader also require build and the desktop smoke. Keep programmatic
round trips separate from real file-IPC/editor acceptance and complete assembly
interchange. Keep the original multibody product-boundary cases separate from
arbitrary STEP representation or geometric compatibility claims.

Node runtime major migrations should update `engines`, the CI runtime, this
guide and matching `@types/node` together in a focused proposal. While Node 24
is the documented target, Dependabot is configured to ignore semver-major
`@types/node` version proposals. Other configured update rules and the security
workflows remain in place; report and review audit findings separately.

## Run locally

From the repository root:

```sh
npm ci
npm run desktop
```

The desktop development command starts Vite on `127.0.0.1:5173` and opens Electron. The port is fixed; close an earlier instance if it is occupied. Closing the application ends its development server.

For production-loader testing:

```sh
npm run build
npm start
```

`npm run dev` provides a browser view. Browser downloads and native desktop dialogs are different paths; testing one does not validate the other. Use a synthetic document for experiments and keep a copy before changing a model you need.

## Checks

| Command | Scope |
| --- | --- |
| `npm test` | The public unit/CAD suite and desktop-security checks from a fresh checkout. |
| `npm run test:unit` | Unit and CAD regressions that can run from a fresh public checkout. |
| `npm run test:ipc` | The desktop-security suite without opening a desktop window. Retains Node's spec output and adds bounded failed-leaf annotations only in GitHub Actions; it never overrides test outcomes. |
| `npm run build` | TypeScript checking and production compilation of UI, worker and WASM integration. |
| `npm run test:desktop` | Real Electron production-loader smoke check after building, with a hidden window and isolated temporary user data. |
| `npm run test:desktop:imported-bodies` | Configured production-renderer opening of an original v1 explicit STEP body base, real worker/body identity checks, suppression/history and Save As/reopen through restricted file IPC. Run after building; test-owned dialogs and planar mesh-area checks are separate from native BRep unit evidence. |
| `npm run test:desktop:assembly-step` | Configured production-renderer structural STEP export/import in both workspaces, cancellation/rejection, autonomous Save As/reopen and reexport. Run after building; real worker and output bytes with original fixtures and test-owned dialogs. Record source-specific execution separately. |
| `npm run test:desktop:assembly-step-insertion` | Configured production-renderer insertion of an original structural STEP into a saved parent, cancellation/rejection, exact history, component reuse and autonomous saved reopening. Run after building; real worker and restricted file IPC with test-owned dialogs. Record actual execution separately. |
| `npm run test:desktop:pattern-all` | Scripted production-renderer selected-to-ALL cut interaction, Apply, Save As and reopen, after building. |
| `npm run test:desktop:pattern-until-next` | Scripted production-renderer UntilNext selected cut, cut ALL and selected additive merge, real rejection, Apply, Save As and reopen, after building. |
| `npm run test:desktop:assembly` | Scripted production-renderer rigid assembly relations, authenticated Apply, source revision/repair, constrained numeric movement, read-only interference/clearance, rejection preservation, Save As and reopen, after building. |
| `npm run test:desktop:assembly-configurations` | Production-renderer selected root/child states, named placement editing, real configured Solve/Cancel/retry/Apply, complete history/recovery and Save As/normal Save/reopen. Also exercises committed configured BOM modes/ranges/members, visibility/suppression and actual CSV cancel/error/write through restricted file IPC. Run after building; original reused prisms and test-owned dialogs. Record actual execution separately from platform support. |
| `npm run test:desktop:assembly-configured-relations` | Production-renderer named relation parameter editing, private Cancel/retry/Apply, shared selected-state propagation, add/suppress/remove, Base isolation, full history/recovery and actual Save As/Save/reopen. Run after building; original reused prisms, literal geometry and exact placed verification identities with test-owned dialogs. |
| `npm run test:desktop:assembly-import` | Scripted production-renderer assembly import and reuse, transformed native bounds, local-frame mate solve, incompatible-content rejection, history, Save As and reopening. Run after building; no external-format interchange or human-dialog claim. |
| `npm run test:desktop:assembly-source-update` | Scripted production-renderer all-use subassembly source update, explicit renamed-descendant plane repairs, review/preview cancellation, rejection, Apply/history, parent save identity and saved reopening. Run after building; original fixed-prism case with real worker/file IPC and test-owned dialogs. |
| `npm run test:desktop:assembly-source-update-save-pending` | The same original source-update lifecycle with one actual successful Save result withheld after its real bytes are written. The flow releases that result, then requires clean renderer controls, exact file identity and recovery before continuing. Run after building; the unchanged deadlines and test-owned file grants remain in force. |
| `npm run test:desktop:assembly-linked-source` | Production-renderer explicit link/reload for original parts and reused rigid subassemblies, unchanged bytes, changed-cache review, Cancel/Apply/history, source-byte preservation and offline saved reopening. Run after building; native source selections are test-owned dialog substitutions. Configured cases do not imply an executed result or another platform. |
| `npm run test:desktop:assembly-source-revision` | Production-renderer source editing/movement, explicit root revision Cancel/Apply/history, canceled Save As and normal source Save, then linked parent review/Apply/history/save/reopen using the actually authored bytes. Run after building; original fixture and test-owned native dialog substitutions, without a prefabricated updated source file. |
| `npm run test:desktop:assembly-profile-center` | Configured production-renderer circle/free and rectangle/material-edge authoring, incidence rejection, preview cancellation, Apply/edit/history, suppression/deletion and Save As/reopen. Run after building; original tracked geometry and test-owned dialogs, no viewport-picking or external compatibility claim. |
| `npm run test:desktop:assembly-line-path` | Production-renderer explicit material point/LINE/start authoring, Free/Distance/Percentage, optional component-axis Follow and projected material-face UP with independent reversals, nonincident-origin and actual-length rejection, Cancel/Apply, edit/history, suppression/deletion and Save As/reopen. Run after building; original reused prisms and test-owned dialogs, no viewport-picking or general-path claim. |
| `npm run test:desktop:assembly-circular-path` | Production-renderer material point/open arc/origin authoring, explicit Free trim, Follow/UP, actual-length rejection, Cancel/retry/Apply, editing, history, suppression/deletion and Save As/reopen with a fresh native solve. Run after building; original reused sectors and test-owned dialogs, no viewport-picking, external policy or general-path claim. |
| `npm run test:desktop:assembly-interference-multibody` | Scripted production-renderer optional within-component body inspection, exact pair identities, option/scope invalidation and unchanged history/recovery, after building. One original two-body case; no human-dialog or continuous-collision claim. |
| `npm run test:desktop:assembly-interference-grouping` | Scripted production-renderer root grouping for two reused twice-nested original groups, fifteen/nine/restored-fifteen exact body pairs, option/highlight invalidation and unchanged history/recovery, after building. No selected-scope grouping, internal-body combination or continuous-collision claim. |
| `npm run test:desktop:assembly-interference-grouping-multibody` | Scripted production controls retain internal-body inclusion through six/four/restored-six body pairs in two reused nested groups. Checks option/highlight invalidation and unchanged history/recovery after building; no union or human-dialog claim. |
| `npm run test:desktop:assembly-interference-grouping-scope` | Scripted production inspection with four original multibody leaves in two reused nested groups: same-root selection, cross-root selection, exclusions and selected-against-rest, with exact pair identities and unchanged history/recovery. Run after building; no union, human-dialog or general platform claim. |
| `npm run test:desktop:assembly-screw` | Scripted production-renderer native screw capture, bidirectional drive, history, parameter editing and Save As/reopen, after building. |
| `npm run test:desktop:assembly-rack-pinion` | Scripted production-renderer rack coupling, native edge pointer selection, bidirectional drive, history and Save As/reopen, after building. |
| `npm run test:desktop:assembly-export` | Scripted production-renderer flat assembly STEP/STL export, cancellation, committed history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-direction` | Scripted production-renderer parallel/perpendicular assembly authoring, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-angle-measurement` | Scripted production-renderer circular angular measurement from three current directions, invalidation, rejection and unchanged saved-document reopening, after building. |
| `npm run test:desktop:assembly-directed-angle` | Scripted production-renderer directed circular stops, strict rejection, local-X pointer projection/release/zero crossing, suppression/reactivation, shared-source three-reference/LINE-guide repair, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-tangent` | Scripted production-renderer plane/cylindrical-surface support tangency, signed side, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-cylinder-tangent` | Scripted production-renderer nonparallel and explicitly parallel cylinder support tangency, branch/radius roles, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-sphere-tangent` | Scripted production-renderer plane/sphere, sphere/sphere and cylinder/sphere support tangency, purpose-specific sphere selection, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-limit-distance` | Scripted production-renderer signed plane-distance intervals, boundary movement/projection, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-limit-distance-compact` | The same original interval fixture and complete workflow at a fixed 1040×700 test-owned window. Records actual canvas bounds, canvas hit targets and settled hover state before acquiring either Z-handle half. Run after building; unchanged physical targets, calibration, tolerances and deadlines. |
| `npm run test:desktop:assembly-width` | Scripted production-renderer centered width with four-role viewport plane selection, editing reselection, constant-rotation contact-stop, rejection/cancellation, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-hinge` | Production-renderer unlimited hinge dropdown authoring with four explicit roles, native radial-plane rejection, Cancel/Apply, editing/reselection, history, physical 90-degree spin, suppression/deletion and Save As/reopen. Run after building; original drilled leaves and test-owned dialogs, no angular-stop or viewport-picking execution claim. |
| `npm run test:desktop:assembly-hinge-picking` | Production-renderer hinge face/LINE pointer selection using original separated drilled leaves, rejected selections, authoring/editing and saved reopening. Run after building; configured scope, with actual execution recorded separately. No general visibility or angular-stop claim. |
| `npm run test:desktop:assembly-hinge-repair` | Production-renderer four-role hinge shared-source repair and selected/all replacement with original H4/H5/H6 leaves, pending-role rejection, ready Cancel/retry, Apply, history and saved reopening. Run after building; configured scope, with actual execution recorded separately. No nested-repair or pointer claim. |
| `npm run test:desktop:assembly-hinge-limits` | Production-renderer six-role limited hinge authoring/editing, projection rejection, wrapped-arc strict motion and outside-stop rejection, Cancel/Apply/history, suppression/deletion and saved reopening. Run after building; original H4 leaves and test-owned dialogs. No pointer or continuous-motion claim. |
| `npm run test:desktop:assembly-hinge-limits-repair` | Production-renderer limited hinge source repair and selected/all replacement with original H4/H5/H6 leaves: six/three/six explicit repairs, incomplete rejection, ready Cancel/retry, Apply/history and saved reopening. Run after building; no pointer, general correspondence or nested renderer claim. |
| `npm run test:desktop:assembly-hinge-limits-picking` | Configured production-renderer six-role face selection, angular reselection, wrong-purpose/hidden/canceled input controls, local-Z stop projection and inward release, Cancel/Apply/history and saved reopening. Run after building; actual results are recorded separately. Original H4 leaves, real CDP input and test-owned dialogs, without a general visibility or continuous-motion claim. |
| `npm run test:desktop:assembly-symmetry` | Scripted production-renderer five-family symmetry authoring through three-role dropdowns, independent native reports/material bounds, edit reselection/cancellation, history and Save As/reopen, after building. No viewport point picking. |
| `npm run test:desktop:assembly-symmetry-repair` | Scripted production-renderer material-point symmetry with three explicit shared-source/all-replacement repairs, pending-role rejection/blocking, ready-preview Cancel/retry, Apply, history and Save As/reopen, after building. One original point-family scenario; no viewport picking or other-family repair claim. |
| `npm run test:desktop:assembly-symmetry-picking` | Scripted production-renderer native vertex/face/LINE and explicit cylinder-axis pointer selection for five symmetry families, authoring, edit reselection, history and saved reopening, after building. Fixed original isometric cases; no general visibility or platform claim. |
| `npm run test:desktop:assembly-symmetry-line-repair` | Dedicated production-renderer workflow for material LINE edges: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-plane-repair` | Dedicated production-renderer workflow for planar faces: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-sphere-repair` | Dedicated production-renderer workflow for full spherical surfaces, including an incompatible-radius selected replacement: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-cylinder-repair` | Dedicated production-renderer workflow for full cylindrical surfaces, including an incompatible-radius selected replacement: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-axisline-repair` | Dedicated production-renderer workflow for explicit cylinder-face line axes, including unequal-radius selected replacement as a line-purpose control: two-role shared-source repair, replacement, ready Cancel/retry, Apply, history and Save As/reopen, after building. Configured acceptance scope; this command listing records no execution result or viewport-picking claim. |
| `npm run test:desktop:assembly-symmetry-nested-selected` | Scripted production-renderer point symmetry in a twice-nested reused assembly, isolated selected replacement, source-only repair, Cancel/retry, history, saved reopening and suppressed-copy reactivation, after building. Original dropdown workflow; no nested pointer claim. |
| `npm run test:desktop:assembly-symmetry-nested-source` | Separate scripted production-renderer shared-source point repair in the same original reused assembly, all three roles, Cancel/retry, history, saved reopening and suppressed-copy reactivation, after building. |
| `npm run test:desktop:assembly-limit-angle` | Scripted production-renderer principal direction-angle intervals, boundary movement/projection, history and saved-document reopening, after building. |
| `npm run test:desktop:assembly-replacement` | Scripted production-renderer selected/all part replacement, explicit face/LINE repair, native gear recapture, cancellation, history and saved-document reopening, after building. |
| `npx --no-install vitest run --config vitest.config.ts src/sketch/extend.review.test.ts` | A focused sketch/CAD regression file using the public project configuration; replace the path with the relevant test. |

The symmetry renderer workflow uses the tracked original 15-occurrence fixture,
current native dropdown choices, actual worker responses and test-owned file
dialogs. It checks all five families' support reports and independent material
properties/bounds, with authoring, history and editing cancellation. It is not
manual dialog or viewport vertex-click evidence. An optional
`SOLIDFLOW_UI_CAPTURE=1` capture is separate from those assertions; record actual
execution and visual limits in validation rather than inferring a pass here.

The desktop smoke check loads the initial model, preload, worker and WASM and checks readiness and console errors. It does not click the editor's tools or launch the packaged installer. On a headless Linux machine, a display server is needed for Electron; CI can use `xvfb-run -a npm run test:desktop` after installing the required system libraries. Do not disable Electron's sandbox to make a check pass.

Run focused tests while developing, then the checks relevant to the complete change. The [CI workflow](../.github/workflows/ci.yml) is configured for Node 24 on Windows 2025 x64, Ubuntu 24.04 x64 and macOS 15 arm64: install, build, unit tests, IPC tests, Electron smoke check and packaging. Linux uses Xvfb. A configured job is not an executed result; check Actions for the actual commit and platform before claiming a pass.

The 51 longer renderer commands run in three fixed batches of 17 per operating
system, separately from unit/CAD and packaging. The configured mechanical and
compound workflows retain their separate job. The original Desktop check names
depend on every renderer and configured job: after pinned Node setup, an
unconditional result guard fails unless both dependencies succeeded. A skipped
or canceled dependency cannot satisfy that guard. Existing 35-minute general
job and 20-minute configured job limits, scenario deadlines, sandbox settings
and no-publish packaging remain unchanged. This split is tracked in issue #53;
command-inventory parity does not replace hosted execution.

CI packages have no signing or notarization credentials and are built with `--publish never`. Binary upload is disabled until the CAD library's complete corresponding-source bundle is verified. They are not automatically published releases. Local packaging commands are `npm run package:win`, `npm run package:mac` and `npm run package:linux`; use the command appropriate to the host. Packaging success does not prove interactive operation, signing or acceptance by the platform's application controls. Current evidence and its limits belong in [VALIDATION.md](VALIDATION.md).

Pull-request CI and security checks run for every target branch, including
stacked pull requests based on a feature branch. The workflow-dispatch entry
points can also validate a published branch explicitly. Inspect the actual
head and run results before reporting a pass.

## Pattern interaction regression

After building, run `npm run test:desktop:pattern-all`. On headless Linux,
use `xvfb-run -a npm run test:desktop:pattern-all` with the same Electron libraries
and sandbox helper as the standard smoke. CI is configured to run this command on each
platform before packaging; inspect the actual run before reporting a pass.

The command starts its own hidden production-loader child and isolated temporary
profile. Scripted DOM events edit the original selected-A pattern to dynamic ALL,
wait for the actual worker preview, Apply, Save As and reopen the saved output.
It checks per-owner geometry, exact refs and saved intent. Native file-dialog
choices are substituted with test-owned paths. A blank bootstrap initializes CDP
before the production page; the original preload also runs on that blank page.
This instrumentation does not supply CAD responses or replace document state.

See the [original fixture](../src/cad/fixtures/pattern-all-original.json),
[fixture provenance](PROVENANCE.md#instrumented-dynamic-all-desktop-fixture) and
[recorded validation](VALIDATION.md). The one linear cut workflow does not prove
human pointer/native-dialog interaction, other pattern families, stale-prefix
Apply, general ownership lifecycle or platform support. Its complete 180-second deadline
is separate from the unchanged standard smoke deadlines.

The separate `test:desktop:pattern-until-next` command uses three original
synthetic documents in one hidden, isolated child. It changes geometry copying
to regeneration, checks selected cut and additive merge, changes cut scope to
ALL with unchanged remote/behind owners, and observes a partial-profile
rejection that keeps Apply blocked. Successful cases use real Apply,
preload/IPC Save As and reopen. Dialog choices are restricted to test-owned
paths; actual worker responses supply volume, bounds and exact owner refs.
The existing budgets remain unchanged: 180 seconds for the parent,
170 seconds for the child workflow and 35 seconds for each step.
This command does not query native BRep, area or material probes through the UI,
run installed packages, or establish general platform support. Its original
fixture parameters and formulas belong in the provenance and validation record.
No result is implied by adding the command; record actual source-specific runs.

## Find the right layer

The standalone [rigid configuration core](ASSEMBLY_CONFIGURATIONS_CORE.md)
evaluates a separate named-state catalog without accepting new saved v2 fields.
Its pure and original native-placement cases run in the ordinary public unit
suite. Keep this prerequisite separate from configuration-aware native
references, scoped solve/writeback, source/BOM/export handling and the editor
lifecycle; those still require integration and source-specific acceptance.
The separate [configured reference context](ASSEMBLY_CONFIGURATIONS_NATIVE.md)
has original native frame/geometry/surface/profile/path, currentness and cleanup
regressions in that same suite. Its full current input and private proofs do not grant legacy
snapshot or configured solver authority. Run build and desktop smoke after
native integration changes, recording the baseline separately from feature
execution.

The [effective relation inventory](ASSEMBLY_CONFIGURATIONS_RELATIONS.md) has
separate pure declaration and native aggregate cases in the public unit suite.
Keep effective suppression, declaring-scope frames and compound incidence
distinct from solved physical satisfaction. Missing declaration diagnostics
are repairable data; a native processing failure must revoke the configured
session and cannot become an ordinary unavailable passive-state entry.

The [configured numerical bridge](ASSEMBLY_CONFIGURATIONS_NUMERIC.md) keeps
effective root-owner endpoint frames, detached all-family constraints and
independent bounded hinge/profile/path measurements separate from production
configured solving or Apply. Its original authored controls include fresh
native candidate reconstruction after standalone numerical experiments; they
do not implement catalog writeback, saved selectors or an editor lifecycle.
Keep native input/error policies and physical oracles distinct, and record
actual test/build/desktop execution separately in the validation record.

| Path | Responsibility |
| --- | --- |
| `src/model/` | Document schema, parsing, dependencies, references and history. |
| `src/sketch/` | Entity geometry, editing, structural validation and the local constraint solver. |
| `src/cad/` | Replicad/OpenCascade operations, BRep validation, worker transport and export. |
| `src/components/` | Sketch editor, 3D viewer and property panels. |
| `src/examples/` | Small reproducible documents exposed through the library. |
| `electron/` | Window, local application protocol, native file dialogs and the restricted IPC bridge. |

Keep geometry out of presentation-only mockups. A new tool should change the saved model through the editing layer and rebuild through the public CAD engine. In sketch trim/extend, preview and commit consume the solved geometry being displayed; they do not run a hidden solve. Driven values come from the solver result, not from a retained nominal value. Read the relevant contract before changing those rules.

Generated sketch IDs are opaque saved identities. Read the [identity contract](SKETCH_IDENTITY.md) before changing creation, preview/application or deletion behavior; a new creation and an edit of an existing object have different identity requirements.

Saved assembly mate endpoints are enumerated by
`src/model/assemblyMateEndpoints.ts`. Source updates and component replacement
share its exhaustive family switch and role lookup. A gear's explicit null
carrier is a fixed declaring scope; a missing role is a different condition.
The helper consumes validated declarations and provides no native authority.
Adding a relation with grouped references also requires explicit changes to
the parser, repair writes, native resolution and numerical owner incidence;
updating this saved-reference inventory alone does not implement the relation.

Numerical incidence uses the separate exhaustive visitor in
`src/model/assemblyNumericMateEndpoints.ts`. The numerical centered-width
constraint retains four original plane supports and has no binary endpoints.
Its [geometry and solver contract](ASSEMBLY_WIDTH_GEOMETRY.md#numerical-centered-solver)
confers no native reference authority. The separate
[saved centered-width integration](ASSEMBLY_WIDTH.md) authenticates all four
planes, preserves their grouped repair roles and provides editor controls.

The [numerical hinge-stop extension](ASSEMBLY_HINGE_STOPS_NUMERIC.md) adds two
co-owned angular planes and an explicit directed interval to the numerical
hinge. Its bilateral rank, active cone and finite direction-error checks are
separate observations. Its [standalone native bridge](ASSEMBLY_HINGE_STOPS_NATIVE.md)
adds six current proofs and independent measurement. The separate
[saved extension](ASSEMBLY_HINGE_STOPS.md) connects optional stops to the editor,
worker and repair visitors. Preserve the old unlimited four-role form and keep
source-specific integration evidence distinct from standalone checks.

The independent [ordered plane placement primitive](ASSEMBLY_PLANE_PLACEMENT.md)
measures four original planes along a moving ray with analytical owner
derivatives. Its transversal chart and signed distances add no saved Width
mode, solver admission or native reference authority.

The [saved profile-center family](ASSEMBLY_PROFILE_CENTER_MATES.md) connects
current full disks or rectangles with explicit material edges to native solve,
independent final checks and editor preview/Apply. Keep its saved admission
separate from mixed-profile mathematical measurement and from external default
or orientation policies. The configured desktop command requires its own
source-specific execution record.

The [bounded profile-center prerequisite](ASSEMBLY_PROFILE_CENTERS.md) recognizes
one complete native rectangular or circular planar boundary and independently
measures ordered centers/normals. Detached observations and numerical resolution
provide no current-reference proof, roll correspondence, saved mate or editor
command. Keep those remaining integration requirements explicit.

The separate [current profile-reference measurement](ASSEMBLY_PROFILE_REFERENCES.md)
requires exact active face/body/source identities and private snapshot-bound
profile witnesses. It composes centers in a common nearby frame while retaining
original placement-chain error. Its fresh read-only pair report does not grant
a saved mate, solver or editor capability.

The separate [symmetry geometry](ASSEMBLY_SYMMETRY_GEOMETRY.md) compares two
matching analytic supports about a third plane with three actual owner roles.
Its numerical solver retains points, lines, planes, spheres and cylinders,
including three moving, repeated and fixed owners. Point supports have no axis;
existing binary families cannot consume them. Position rows use the target
frame, normal rows the reflected source frame, with complete moving-frame
derivatives and geodesic radian scaling. Physical norm/angle checks remain
separate from component rows and local rank evidence. The
[saved/native symmetry workflow](ASSEMBLY_SYMMETRY.md) adds strict three-role
declarations, exact native witnesses, explicit uncertainty throughout numerical
trials and fresh independent final measurements. Native uncertainty never
widens the requested bands. Only the absent-tuple standalone numerical API keeps
its previous tolerance-sum compatibility. Dropdown editing and worker capability
remain separate from read-only report DTOs and viewport point picking. Consult
source-specific validation before claiming an executed interaction or lifecycle.

The [native vertex reference prerequisite](ASSEMBLY_VERTEX_REFERENCES.md)
adds conservative exact-incidence keys and current point queries, separate from
mesh positions, explicit datums, sphere centres and directional witnesses.
Snapshot-issued point proof is private, live and document-bound; copying display
metadata never authenticates a point. This prerequisite adds no saved mate or
vertex-picking/editor command and does not complete symmetry integration.

Lengths use millimeters. State angular units explicitly: the sketch's directed angular dimensions use degrees, while geometric calculations may use radians. Persisted point-on-line and point-on-circle relations use complete supports; a finite hit test is a separate requirement. Useful starting points are [sketch types](../src/sketch/types.ts), the [solver](../src/sketch/solver.ts), [trim](../src/sketch/trim.ts), [extend](../src/sketch/extend.ts) and their adjacent regression tests.

Read the [semantic CAD reference contract](SEMANTIC_REFERENCES.md) before changing extrusion provenance, v2 reference identity, document acceptance or selection aliases. This branch integrates verified references for the first eligible finite entity-profile extrusion and retains conservative v1 behavior for saved references and unsupported correspondence. Original regression inputs and analytical expectations are recorded in [fixture provenance](PROVENANCE.md); written tests and source-level ownership reasoning are not executed validation results.

The proposed [body management contract](BODY_MANAGEMENT.md) covers persistent body identity, explicit creation and Combine, selective cuts, history, export and the complete implementation checklist for issue #26. Its analytical fixtures are acceptance targets, not recorded passes.

The [scoped feature geometry contract](FEATURE_PATTERNS.md) distinguishes exact
per-owner contributions, potential historical states and native availability.
Its signed material copying is separate from the initial saved per-instance
regeneration path. Geometry/true keeps selected targets. Varying sketches,
additive ALL, dynamic geometry scope, AUTO discovery and broader recipes remain
required work.

The [feature recipe declaration layer](FEATURE_RECIPES.md) documents the pure
closure/frame API. The [regeneration contract](FEATURE_REGENERATION.md) connects
explicit-frame tool construction, chronological evaluation and the saved
selected or cut-only ALL scope. The initial native path accepts intrinsic
rectangle/circle cuts or selected merge extrusions with blind/ThroughAll endings
or an explicit fixed principal-plane UpToSurface limit, and no variation.
The bounded saved policy names the seed and end-condition locator; it is never
inferred from geometry. ALL resolves the complete current native
catalog on each rebuild; it does not save a target snapshot. Limits remain
32 selected targets, 256 dynamic owners and 512 active owner applications, with
separate closure/history envelopes. Geometry copy/true and regeneration/false have distinct saved
declarations; legacy false without the explicit mode still rejects.

The 51 pure declaration, 21 evaluator and 18 saved engine cases have different
boundaries. Exact source capture, current-target checks, ordered operations,
atomic owner publication and programmatic save/reopen/history checks do not
establish real property-panel interaction or worker preview/Apply behavior.
Check the actual source-specific [validation](VALIDATION.md) before extending
an earlier component or desktop-smoke result to later integrated source.

The dynamic ALL increment adds 54 authored cases across 17 model/command, seven
SSR, 18 native scope/evaluator, eight saved-engine and four contextual deletion
cases. Counts are fixture inventory, not passing results. ALL retains exact
historical sources and native current-target proofs; only changed owners advance.
An exact consumer through ALL still depends on its body's creator, while ALL
itself is not a saved inventory dependency. Additive ALL and AUTO remain explicit
pending capabilities. Their full contract and evidence boundaries are in
[FEATURE_REGENERATION](FEATURE_REGENERATION.md#dynamic-all-scope) and
[PROVENANCE](PROVENANCE.md#dynamic-all-model-and-rendered-fixtures).

## Test geometry and persistence

The local [rigid assembly proposal](ASSEMBLIES.md) adds separate version-2 APIs,
repairable occurrence-scoped declarations, a simultaneous solver and a dedicated
workspace/worker route. Keep graph, native placement, solver, scripted renderer
interaction and file IPC evidence separate. `test:desktop:assembly` uses the same
hidden isolated production harness as the pattern workflows and a statically
selected original fixture. Actual worker replies supply geometry/solver results;
test-owned native-dialog paths select files. It does not establish human pointer
or native-dialog operation, flexible motion, structural exports or platform
support. CI is configured to run the case on each target; inspect executed runs.
The movement stage uses absolute local translation and incremental local rotation
controls, actual native relation checks and authenticated Apply, with a temporary
solve anchor that is never saved as a fixed flag or mate. Numeric target controls
do not establish pointer dragging, continuous path following or collision stopping.
The [explicit angular request](ASSEMBLY_MOTION.md) preserves signed whole turns
and checks bounded stations before publishing one final preview. The gear stage
adds +720-degree Cancel/Apply/Undo/Redo and saved-winding checks, plus rejection
of an incompatible full X turn. Station checks are not continuous collision
evidence, and the existing command deadlines remain unchanged.
The separate [screw relation](ASSEMBLY_SCREWS.md) includes coaxial alignment and
component-origin axial travel. `test:desktop:assembly-screw` creates bearings
and a guided slider from an original unmated fixture, then uses actual capture,
numeric rotation/translation, Cancel/Apply, Undo/Redo, parameter edits,
suppression/reactivation and file IPC. It runs in its own hidden isolated child
with the same 180/170/35-second parent/child/step limits. Its millimeter coupling
tolerance must not be reported as an identical angular follower tolerance.
CI is configured to run this command separately on each target; inspect actual
source-specific results before claiming execution or platform support.
For local visual review, `SOLIDFLOW_UI_CAPTURE=1` adds one hidden `capturePage`
PNG to the assembly test's JSON output after the final reopened gear mechanism.
Earlier recorded interference, movement and source-update runs retain their
own capture points. Capture is read-only,
keeps the window hidden, and is disabled by default in CI. The parent verifies
its bytes/hash before cleaning up the isolated profile. Keep such local output
under ignored artifacts; a screenshot is not native geometry or interaction proof.

The separate [flat assembly export](ASSEMBLY_EXPORT.md) reconstructs committed
native geometry rather than exporting a displayed preview. Its
`test:desktop:assembly-export` command uses a tracked original fixture and the
same hidden isolated production harness, real worker and restricted file IPC.
Dialog paths are test-owned; this does not establish human native-dialog or
installed-package operation. Geometry-only STEP and tessellated STL have
different validation boundaries from structural assembly interchange. CI is
configured to run the command on each target, which is not an executed result.

The separate [parallel/perpendicular relation proposal](ASSEMBLY_DIRECTION_MATES.md)
uses exact plane normals, cylindrical axes and native LINE edges. Mixed
plane/direction pairs reverse the collinear/orthogonal interpretation compared
with two planes or two directions. Its fixed original-fixture
`test:desktop:assembly-direction` command retains the existing isolated hidden
production harness and deadlines; it does not inject solver replies or committed
state. CI configuration and authored cases do not imply execution or platform
support. Record source-specific outcomes in the validation record.

The separate [plane/cylindrical-surface tangent proposal](ASSEMBLY_TANGENT_MATES.md)
uses an explicit surface reference and a side relative to the plane normal.
Its constraints apply to infinite analytic supports; native support-normal
reports are separate from finite contact or body interference. The fixed
`test:desktop:assembly-tangent` command uses the same hidden production harness,
test-owned dialogs and deadlines. Record actual numerical, native, renderer and
saved-file results separately; configured CI is not an executed platform pass.

The separate [cylinder surface tangency proposal](ASSEMBLY_CYLINDER_TANGENCY.md)
retains distinct nonparallel and added-parallelism intent, fresh surface
witnesses and declared internal radius roles. Its fixed
`test:desktop:assembly-cylinder-tangent` command uses two original documents
with the same hidden child, test-owned dialogs and unchanged deadlines. Neither
variant inherits the plane/cylinder straight-translation proof. Record executed
source-specific native, UI and file results before claiming a pass.

The separate [signed plane-distance interval proposal](ASSEMBLY_LIMIT_DISTANCE.md)
retains bilateral alignment and explicit inclusive signed bounds. Its
`test:desktop:assembly-limit-distance` command uses an original two-box document,
actual worker replies and test-owned file dialogs under the unchanged hidden
harness deadlines. Cone projection and strict movement are distinct operations;
an active unilateral boundary is not a bilateral position lock. Authored cases
and configured CI do not imply execution or platform support. Record actual
numerical, native, renderer and persistence evidence separately.

The dependent [principal direction-angle interval proposal](ASSEMBLY_LIMIT_ANGLE.md)
uses explicit inclusive degree bounds and a declared principal coordinate.
Its `test:desktop:assembly-limit-angle` command uses the original rotated
two-box document and the same hidden production harness, test-owned dialog
paths and unchanged deadlines. Domain endpoints, singular restoration and
signed winding stops have distinct contracts; no cosine-gradient zero or
passing regular case establishes their acceptance. Record actual numerical,
native, renderer, path and saved-file results separately. A configured CI job
is not an executed platform pass.

The [part replacement contract](ASSEMBLY_COMPONENT_REPLACEMENT.md) separates
selected expanded-instance isolation from replacing all exact-source uses.
`test:desktop:assembly-replacement` checks two levels of reused subassemblies,
explicit face/LINE repairs and actual gear recapture, with one replacement Apply,
Undo/Redo and Save As/reopen. It uses original synthetic files, real worker
results and test-owned dialog paths under the existing hidden harness deadlines.
CI is configured to run this command on each target; only executed results can
establish the checked platform/case. Screw/rack native tests are separate from
this gear-specific renderer workflow, which does not prove general automatic
correspondence, human dialogs, subassembly replacement or configurations.

Prefer small analytical fixtures with a known result. For example, a closed 10×6 rectangle extruded 4 mm should have volume 240 mm³; the test should also establish valid BRep and the expected number of solids. For affected references, edit an earlier feature, rebuild dependent features and serialize/reopen the document. Test failure paths for atomic behavior when the command can reject a change.

The [subassembly source-update contract](ASSEMBLY_SUBASSEMBLY_UPDATES.md)
describes a separate all-use update from a complete v2 source with an authored
new revision. The worker retains the exact plan and native catalog, requires
explicit descendant repairs and capture decisions, and grants Apply only after
a fresh solve. Its renderer workflow checks an original fixed-prism case with
a renamed child; source-local inspection of suppressed children is separate
from active parent-placement checks. Configured CI is not platform acceptance.

OpenCascade/WASM tests use the public Vitest `forks` pool: isolated child processes with a fresh worker per test file under Vitest's enabled isolation default. Initialize the runtime before constructing shapes, dispose engines and release owned native objects after use. Keep focused checks on the project configuration. The worker-count policy, test selection and timeouts remain unchanged; avoid sharing mutable kernel state across test files or weakening validity checks to accommodate a failing fixture.

Distinguish these evidence types in reports: numerical unit/integration tests, server-rendered components, browser or Electron interaction and exported-file checks. Record the exact files and commands used. Public CI must be self-contained: it uses tracked source, declared dependencies and synthetic fixtures that the project can distribute. A new fixture needs documented provenance, generation steps, parameters, units and tolerances. Do not invent a source or an expected result to fill a gap in evidence.

The [directed circular stop contract](ASSEMBLY_DIRECTED_ANGLE_STOPS.md) adds an
explicit third guide and an inclusive start/sweep arc. Its independent coordinate
does not reinterpret principal-angle files or count accumulated turns.
`test:desktop:assembly-directed-angle` reuses the tracked original drilled-prism
fixture, real production controls/worker and isolated test-owned Open/Save As
paths under the existing harness deadlines. Six actual local-X pointer drags
use trusted DOM client points and posted request poses for calibration;
the candidate's solved pose supplies neither calibration nor expected
projection. The actual request is bounded against its ideal target, then independently clamped to
literal [-30,60] before checking native/report/display output. Keep those two
precision checks distinct. Save/reopen retains the captured request-derived
expectation. See the [pointer oracles](PROVENANCE.md#directed-circular-stop-pointer-oracles)
and record source-specific results separately; neither configured CI nor a
sampled path proves general platform support, continuous motion or the
complete assembly demo.

The same fixed command then opens an original three-prism shared-source
case, updates depth and through-hole length together, and repairs first,
second and LINE-guide references through actual controls. It checks missing
repairs, ready Cancel, a fresh explicit r1 verification, a distinct revision
retry, Apply, one Undo/Redo and saved reopening. Cancel may restore the
confirmed scene from cache; do not require an unsolicited worker build.
Both workflows share the unchanged time budget and explicit test-owned file
queues; the final capture belongs to the repaired three-prism document.
See the [source-update fixture](PROVENANCE.md#directed-circular-stop-shared-guide-update-fixture)
for independent geometry and evidence limits.

The [native symmetry measurement contract](ASSEMBLY_SYMMETRY_NATIVE_MEASUREMENT.md)
describes standalone read-only comparison of three explicit roles across point,
line, plane, sphere and cylinder purposes. Its fresh snapshot proofs, independent
physical residuals and uncertainty admission grant no saved-mate, solve or Apply
authority. Keep numerical, native and UI evidence separate; repair, persistence
and complete-demo integration remain outside this measurement contract.

## Work safely with desktop files

The [revolute hinge prerequisite](ASSEMBLY_HINGE_CORE.md) supplies numerical
constraints and standalone current-native resolution and measurement. Its
[saved integration](ASSEMBLY_HINGE.md) adds four-role intent, editor/worker
preview/Apply and repair. Preserve actual rigid owners in reference contexts,
qualify axial planes structurally and check physical spin separately from a
DOF count. The [optional angular stops](ASSEMBLY_HINGE_STOPS.md) have their own
six-role lifecycle. Complete assembly acceptance remains open.

The renderer must stay isolated from general Node.js and filesystem access. Use the existing preload/IPC bridge and native-dialog grants for file operations. Do not add arbitrary IPC commands, disable navigation/protocol checks, remove size limits or persist privileged paths in a document to work around a UI problem. Security regressions need tests in the desktop-security suite and a private report if they expose users.

Do not include local recovery data, binaries or output from `artifacts/`, `dist/` or `release/` in a code pull request. Keep generated files out of changes unless the repository explicitly tracks them. See [CONTRIBUTING.md](../CONTRIBUTING.md) for review and provenance requirements.

### Bounded path-curve prerequisite

The [bounded path-curve contract](ASSEMBLY_PATH_CURVES.md) documents current native
LINE/circle observation and evaluation, strict snapshot proof lifetime and
local/world numerical budgets. It adds no saved Path mate, solver family, editor
or worker command. Its original CAD regressions run with the ordinary public
unit suite; source-specific validation remains recorded separately.

The [material circular-arc origin](ASSEMBLY_MATERIAL_ARC_PATH.md) adds a separate
joint edge/vertex purpose for open circular trims. Keep its private proof,
evaluation-specific precision and material-origin direction separate from the
generic parameter-sense observer and the saved LINE family. Its original
regressions use the same public unit suite; it adds no worker or editor command.

The [numerical circular-path layer](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md) adds
explicit trim/support-circle domains, fixed material distance, changing-tangent
Follow/UP, actual owner incidence and local constrained movement. Its separate
radius/frame/sweep errors are mandatory numerical declarations, not inferred
native metrology. Keep it separate from saved mate authentication, native
admission, worker/editor commands and lifecycle. Original mathematical and CAD
experiments run in the public unit suite; record source-specific execution.

The separate [current-native circular bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md)
derives numerical constraints from current material proofs and independently
verifies candidate poses with fresh queries. Its stored analytic Float64 model
keeps topology tolerances separate from center/radius/frame/sweep and native D1
arithmetic. Retain original placement-chain budgets and actual root owners;
scoped selection does not introduce child freedom. This bridge adds no saved
mate, worker command, editor or Apply capability. Its original native tests run
in the public unit suite; run build and desktop smoke after integration changes
and record only the actual checked cases and platforms.

The [saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) connects these current
proofs to explicit saved intent, scoped numerical owners, fresh independent final
checks and private worker preview/Apply. Repair code must choose LINE or arc
purpose from the saved mate family and endpoint role; their compound reference
shapes are identical. Positive native circular-origin scene metadata nominates
editor/repair choices, never proofs. The separate production-renderer command
above uses unchanged hidden-harness deadlines and real worker/file IPC. Record
its actual source-specific execution independently of configured CI.
