# Project status and review queue

## Latest increment: additional views and restoration diagnostics

Dimetric and Trimetric are available through the existing orientation selector
and View menu in parts, standard assemblies and configured assemblies. They
preserve the blue interface, existing shortcuts and camera-only Previous View
history. Numerical tests project an original asymmetric box through independent
literal screen bases and exercise Fit, repeated commands and direct gestures.

Five local Windows renderer routes pass: the three workspace types and both
compact assembly routes. They exercise actual View-menu activation, repeated
commands and exact Previous restoration without changing observed document,
worker or file authority. Build, 10,101 tests across 445 files, 168 IPC passes
with two explicit skips and desktop startup also pass on the same 1,209-input
snapshot. Executed cases, timings and limits are in [validation](VALIDATION.md).

The latest published parent, `1489bb8`, passed ten renderer/configured-authoring
jobs but failed persistence on Windows and Linux. Windows exhausted its
cumulative assembly deadline; Linux reported different restored pixels. The
new diagnostic retains the exact moved/Previous image pair without relaxing
acceptance. It does not claim to fix either hosted failure. All Desktop jobs
were stopped by that prerequisite, before testing or packaging.

[Issue #55](https://github.com/angelcp2802/solidflow/issues/55) remains 16/25:
the combined view item still includes unfinished editor behavior. Broader
human use, controls/context/reference editing, assembly cases, materials and
installed-platform acceptance remain open. Continue in the existing draft
[PR #49](https://github.com/angelcp2802/solidflow/pull/49); release remains gated
by [#5](https://github.com/angelcp2802/solidflow/issues/5).

## Earlier review: everyday modeling and interface continuity

Continue in [draft PR #49](https://github.com/angelcp2802/solidflow/pull/49),
with interaction priorities in [issue #55](https://github.com/angelcp2802/solidflow/issues/55)
and hosted acceptance in [issue #53](https://github.com/angelcp2802/solidflow/issues/53).
The review remains unmerged; this is not release or complete-demo acceptance.

The current increment applies the parameter-first layout to extrusion and cut:
Profile, direction/destination parameters, Bodies, then Name. Density changes
are local to these editors; the sticky confirmation header and existing
callbacks/guards remain. Exact empty-cut-scope and missing-new-body-limit
diagnostics receive actionable text without replacing unrelated errors or
changing Apply authority.

Local acceptance is complete within the scope below. The initial build fails on the panel test's
union fixture type; narrowing it to the extrusion variant allows build 02 to
pass in 3.677 s. After strengthening the layout helper to measure actual input
height as well as its box, final build 03 passes in 3.593 s with 1,119 frozen
non-Markdown source/runtime inputs. Production code is unchanged from run 02.
Sequence 03 passes 149 checkpoints in 59.324 s at minimum window size, fresh
sketches 03 passes 50 in 16.340 s at normal size, and revolution 03 passes 178
in 48.543 s. All report zero console, request and resource errors with
child/profile cleanup confirmed. They cover initial field order
and visibility, locked staged profiles and existing Cancel/retry paths. The
sequence also checks empty cut selection followed by Cancel and missing
`throughAll`/`untilNext` body limits followed by repair to blind depth and merge;
it does not test Cancel from those limit modes or an artificial empty
`upToSurface` target. Visible minimum-size and maximized checks confirm the
saved cut's blocked empty selection, accessible sticky Cancel and extrusion
depth-edit/Cancel recovery. Name needs scrolling at minimum size; all extrusion
sections fit in the reviewed maximized state. Displayed 1080 mm3 and the restored
model are UI-state observations, not new geometry oracles; depth entry uses an
accessibility setter. Full-suite 03 passes 9,702 cases across 422 files, plus
83 IPC checks and two explicit skips, in 549.302 s. Desktop smoke 03 passes in
1.558 s with zero console, request and resource errors. Build 03, all three
renderer-03 workflows, full-suite 03 and smoke 03 share the exact final
1,119-input source/runtime snapshot. This completes local acceptance for these
cases, not the full renderer matrix, platform support or complete modeling/demo
coverage. Hosted acceptance of the new head remains pending.

Parent `55c4adf` finishes [CI](https://github.com/angelcp2802/solidflow/actions/runs/40167039789)
with failure: eight of nine renderers and all three configured-authoring jobs
pass. Ubuntu persistence job 121090111105 fails at the rigid assembly preview,
Apply and persistence step. One log retrieval attempt returns `Transport
closed`; the exact checkpoint and cause remain unestablished. All three Desktop
jobs stop at `Require every renderer validation job` before unit, smoke and
packaging acceptance. [Security](https://github.com/angelcp2802/solidflow/actions/runs/40167039766)
passes. This historical parent result does not validate the current increment
or the next published head; the completed local acceptance above is separate.

The preceding increment prioritized parameters in the left PropertyManager.
Revolution now orders Profile, Axis, Direction 1, optional Direction 2, Bodies
and Name. The configured general-relation editor orders Type/options,
references, origin disclosure, parameters and Name, with a single title and
Type/create versus Reference 1/saved-distance-edit focus. Standard guidance
distinguishes selecting references, explicitly previewing and applying a current
verified result; it is hidden during blocked editing or replacement dialogs.
Existing error/status reporting and authority guards remain.

Local acceptance of that preceding increment is complete for its final snapshot
recorded below; hosted
acceptance of the current head remains pending. The first build passes in
3.605 s, but the revolution renderer fails after 6.357 s because the first-angle
field crosses the minimum
viewport's lower edge. Removing its redundant axis label retains the associated
select label and the original containment assertion. The second build passes in
3.596 s with 1,118 matching frozen source/runtime inputs. Six selected local
Windows renderers now pass: revolution, successive parts, fresh sketch, compact
configured picking and standard/configured origin axes. They report zero console, request
and resource errors and confirmed child/profile cleanup. At minimum window
size, the first angle is visible without scrolling; reversal and Direction 2
still require scrolling. Configured creation/editing records the intended focus,
one title and closed unused origin controls. A maximized visible check shows all
revolution controls without scrolling, a 60/90 preview and Cancel back to the
bored cylinder. Configured creation shows the intended order and an expandable
origin section without assigning or applying a relation. A fresh visible
observation confirms editor closure back to the model tree, New relation
enabled, configuration ready and two solids with displayed volume 128.000 mm3
and area 192.000 mm2. These are UI-state observations. The first full suite
fails after 547.772 s with
9,697 passing and two failing cases across 422 files (420 passing, two failing).
The two failures are configured UI text expectations; the follow-up changes
only `configuredAssemblyPicking.test.tsx` and `originAxisAuthoring.test.tsx`.
The focused rerun passes 10 cases across both files in 1.22 s. Of 1,118 inputs,
1,116 remain identical to the renderer-02 snapshot; only these test files differ.
Production, harness, fixtures, configuration and dependencies are unchanged,
preserving the scope of the second build and six renderer passes without
claiming identical complete snapshots. Full-suite run 02 passes 9,699 cases
across 422 files, plus 83 IPC checks and two explicit skips, in 543.766 s.
Desktop smoke passes in 1.573 s with zero recorded errors.

A subsequent accessibility correction gives the existing configured workspace
title heading semantics (`role="heading"`, `aria-level="2"`) without changing
its element, ID or style. Its renderer assertion now checks that semantic
heading. Only `ConfiguredAssemblyWorkspace.tsx` and
`desktop-assembly-configured-picking-flow.cjs` differ from the full-suite-02
snapshot; the other 1,116 inputs match. All 1,118 final source/runtime inputs
match. The six renderer-02 passes and full-suite/smoke-02 results remain
evidence for the earlier snapshot, not the complete corrected production state.
Build 03 passes in 3.671 s. The post-correction configured picking renderer
passes 191 checkpoints in 69.425 s, and configured origin axes passes 312 in
85.407 s. Both report zero console, request and resource errors and confirmed
child/profile cleanup. Full-suite 03 passes 9,699 cases across 422 files, plus
83 IPC checks and two explicit skips, in 545.267 s. Desktop smoke 03 passes in
1.644 s with zero console, request and resource errors. Build 03, both configured
renderer-03 cases, full-suite 03 and smoke 03 share the exact final 1,118-input
source/runtime snapshot. The four other renderer-02 cases and manual checks
remain earlier-snapshot evidence, not final-snapshot reruns. Local acceptance
is complete within this scope; this remains work in draft PR #49, not a complete
renderer matrix, assembly/demo acceptance or overall interface fidelity.

Parent `9ac5704` has terminal [CI failure](https://github.com/angelcp2802/solidflow/actions/runs/40163844307):
seven of nine renderer jobs pass, covering relations and hinge/symmetry on all
three systems and macOS persistence. Configured authoring passes on all three.
Windows job 121080751269 and Ubuntu job 121080751250 fail the rigid assembly
preview/Apply/persistence step. All three Desktop jobs stop at the
`Require every renderer` gate before unit, smoke or packaging acceptance.
One log retrieval attempt per failed job returns `Transport closed`, leaving
the exact failure cause unestablished. [Security](https://github.com/angelcp2802/solidflow/actions/runs/40163844308)
completes successfully. These parent results do not validate the current head;
the completed local snapshot-specific acceptance is separate. Current-head
hosted acceptance remains pending.

The preceding increment added two-direction and mid-plane revolution. Two sides
allow one zero angle while requiring a positive total no greater than 360
degrees. Mid-plane interprets the angle as a total span and ignores the stored
reverse choice while active. Legacy documents retain absent extent fields and
their existing lineage; new modes require a reader that understands the optional
field. Focused core/UI/model groups pass 67/21/130 cases and build passes in
3.562 s, with 1,117 source/runtime inputs matching. The first selected local
renderer executions pass: revolution 178 checkpoints in 48.633 s, successive
parts 118 in 31.371 s and fresh sketch 48 in 16.243 s, with zero recorded errors
and confirmed child/profile cleanup. A visible Windows check confirms the saved
270/90 controls, a 60/30 sector, centered mid-plane total 60 with inversion
disabled and Direction 2 hidden, and Cancel back to the bored sleeve. Its value
changes use accessibility setters; it is not a numerical geometry oracle.
Final local `npm test` passes in 546.082 s: 9,699 cases across 422 files,
plus 83 IPC checks and two explicit skips. Desktop smoke passes in 1.599 s
with zero console, request and resource errors. The same 1,117 frozen inputs
cover the build, three selected renderers, full suite and smoke. Current-head
hosted acceptance remains pending. The completed compact-interface results
below belong to the preceding increment.

The part interface now combines labelled operation groups, a persistent
accept/cancel header, automatic face/edge browsing and a collapsible feature tree.
The original sequence exercises multiple cuts and additive extrusions. A separate
original revolution-and-bore workflow checks X/Y and same-sketch line axes,
reverse direction, downstream cut, history, saved reopening and independent STEP
geometry. Its property editor separates the axis reference from Direction 1;
unavailable line references require an explicit replacement.
Both assembly workspaces have contextual command tabs, component properties and
origin-plane/axis tree selection. Configured picking instructions now reserve
their own row instead of covering origin labels.

The assembly viewport now groups its existing view, selection and manipulation
commands into a compact toolbar. Operation editing highlights the current resolved
input profile in orange, including an unaccepted staged sketch and a previously
consumed input. This is presentation state; it changes no document, history or
reference identity. Pending or failed source builds do not display a stale input.

Concentric relations can now capture rotation between current origin axes or
an origin axis and a cylindrical face. The standard workspace captures from a
verified preview; the configured workspace explicitly replaces its existing
free relation while preserving its identity and ordered references. Axial travel
remains free. Original asymmetric-prism renderer cases cover capture, Cancel,
Apply, history and saved reopening. The part selection-action strip now retains
its height, with a compact-window pointer regression for lower-edge double-click
editing and exact Cancel.

Nine selected local Windows renderers pass for the preceding compact-interface
increment, including compact
configured picking, both origin-lock workflows, both free-origin workflows and
the broad assembly sequence. Two presented operation-profile captures have been
visually inspected, and a separate visible Windows demonstration checks opening
the saved revolution, its orange input and lateral Cancel back to the bored
sleeve. A subsequent change reserves the top 44 px for the viewport toolbar when
placing origin labels. Its 12 focused layout cases, production build, repeated
standard/configured origin renderers and compact standard distance workflow
pass. Final acceptance also passes 9,584 unit/CAD cases in 419 files, 83 IPC/security
cases with two explicit platform skips, and actual desktop smoke with zero
recorded errors. All 1,112 non-Markdown inputs match the isolated runtime. The
earlier nine renderer passes precede that last layout change; the three targeted
repetitions do not establish a complete final-layout renderer matrix.

Parent `d4ff3dc` passes seven of nine hosted renderer jobs, all three
configured-authoring jobs and both Security jobs. All relations and hinge/symmetry
jobs pass, as does macOS persistence. Windows and Linux still fail rigid
persistence; detailed log retrieval returns `Transport closed`, so the current
gear stage and failure cause remain unknown. All three Desktop jobs stop at the
required-renderer gate before unit/smoke/package acceptance. These results do not
validate the current two-direction increment.

The older `2b7dc1f` passes five of nine hosted renderer jobs, all three
configured-authoring jobs and both Security jobs. Rigid persistence fails on
Windows and Linux; origin-lock interaction fails on Windows and macOS. The macOS
log shows the enabled lock command below the sidebar clip before any capture
request. Its exact visibility failure does not establish the other jobs' causes.
All three Desktop checks stop at the prerequisite gate before unit/smoke/package
steps. Local gear-stage measurements preserve the original deadline and do not
establish a timing fix. No installed-package or release acceptance is claimed.
See [validation](VALIDATION.md) for exact
local results, retained failures and hosted links; results from earlier commits
do not establish current-head acceptance.

Next priorities include hosted acceptance of the extrusion/cut panel increment.
Further priorities include
viewport/external revolution-axis selection,
thin-wall and revolved-cut workflows, broader material/mechanical reference picking and
the complete basic assembly demo. Repeated/hosted persistence timing, remaining
origin orientations and installed-package support also remain open. The sections
below retain earlier snapshots; their "next" work and counts belong to their
recorded increment.

### Open review queue — 2026-10-25

| PR | Purpose | Reviewed status and next action |
| --- | --- | --- |
| [#49](https://github.com/angelcp2802/solidflow/pull/49) | Current CAD and interface work | Continue the same draft; local and hosted acceptance remain separately recorded. |
| [#48](https://github.com/angelcp2802/solidflow/pull/48) | Pinned CodeQL action update | The two action references retain permissions and workflow behavior. Its own CI/Security pass; no blocking static defect identified. It is separate from application acceptance. |
| [#47](https://github.com/angelcp2802/solidflow/pull/47) | Grouped dependency updates | Its older CI passes, but Electron 44.8.0 precedes this branch's 44.9.3 and its lockfile lacks the current fast-uri/undici patches. Regenerate pending React/react-dom, icon and test-runner updates against the accepted base; preserve current patches and run the current matrix. |
| [#35](https://github.com/angelcp2802/solidflow/pull/35) | Smoke-launcher diagnostics | Draft and currently not mergeable. Normal successful quit is already present; primary-error preservation and confirmed-close-before-cleanup still need selective adaptation. The recorded macOS SIGBUS remains unexplained. |

This queue review changes no dependency, approval, merge or release state.
Passing checks on those older heads do not validate the current application.

### Historical increment: navigable part history

The part tree now collapses each operation's input sketches, preserves selection
when folded and temporarily reveals filtered matches. Contextual sketch editing
returns to the requested owner, including shared inputs. Keyboard focus and
model selection remain separate. The original sequential modeling and fresh
face-supported workflows remain the acceptance cases; see
[core workflows](CORE_WORKFLOWS.md) and [validation](VALIDATION.md).

Continue in the existing draft PR #49 and issue #55. Next interface priorities
are contextual assembly ribbon groups, consistent component-tree navigation
and clearer selection modes. Complete assembly-demo acceptance, specialized
picking and origin-axis rotation locking/capture remain open.

Hosted predecessor `e16fac05` passes
[Security](https://github.com/angelcp2802/solidflow/actions/runs/40137645569).
Its [CI](https://github.com/angelcp2802/solidflow/actions/runs/40137645616) passes
seven of nine renderer jobs and all three configured-authoring jobs. Windows
and macOS stop at the second part-tree context opening after Escape; the logs
do not establish its visibility cause. Rigid persistence passes on Linux and
does not run on the two stopped jobs. Downstream Desktop acceptance is blocked.
The new tree pointer helper reveals its target and reports bounded layout
diagnostics; hosted recovery still requires new-head evidence in issue #53.

### Grouped assembly commands and contextual left manager

Both assembly workspaces now use a shared compact header, grouped upper commands
and a contextual left manager. Components, relation editing and evaluation use
the same sidebar area. Configured component selection keeps the tree visible;
explicit properties and relation commands reveal their editor. Leaving relation
editing stops viewport nomination without losing the draft. See
[core workflows](CORE_WORKFLOWS.md) and [validation](VALIDATION.md).

Windows renderer checks pass for the standard assembly, compact distance
interval, configured normal/compact pointer selection, component authoring and
relation editing. The actual Electron 44.9.3 smoke and production build pass.
Full acceptance passes 9,354 unit/CAD cases across 400 files and 83 IPC/security
cases, with two explicit platform skips. All 1,054 frozen non-Markdown inputs
match the isolated runtime checkout. The fresh
dependency audit reports zero vulnerabilities after compatible fast-uri/undici
patches; this supersedes the preceding local findings below.

Hosted predecessor `f376d99` stops macOS hinge source/replacement repair after
Save As, before the exact ground-owner source-review request. Its log does not
identify whether the control is missing, duplicated or disabled. The three
dependent Desktop gates fail; CodeQL passes and the old-lock dependency audit
fails. Cause-specific diagnosis and new-head hosted acceptance remain open in
[issue #53](https://github.com/angelcp2802/solidflow/issues/53).

Continue in draft PR #49 and
[issue #55](https://github.com/angelcp2802/solidflow/issues/55): simplify reference
labels, finish displayed-origin picking/rotation capture and specialized
material picking, then accept the complete basic assembly demo. Current evidence
does not establish cross-platform or release readiness.

### Configured command access and compact interface

Upper commands now reveal the configured component, relation and configuration
editors with their heading and first enabled field visible. Normal and fixed
1040 × 700 pointer workflows pass 62 and 63 checkpoints, including the original
signed-distance/LINE geometry, history and file reopening. See [validation](VALIDATION.md).

Windows acceptance passes 9,354 unit/CAD cases / 400 files, 83 IPC/security
cases (two platform skips), build and actual Electron 44.9.3 smoke. The runtime
update resolves the preceding Electron advisory. A subsequent audit reports
new undici (high) and fast-uri (moderate) findings; compatible patch remediation
is pending. Hosted predecessor `2c2e993` still fails macOS symmetry LINE repair
and the three dependent Desktop gates. CodeQL passes; dependency audit fails.

The next interface increment in [issue #55](https://github.com/angelcp2802/solidflow/issues/55)
reorganizes the assembly workspace into grouped upper commands and a contextual
left manager. Complete assembly-demo and cross-platform acceptance remain open
in draft PR #49.

### Configured material picking and feedback

The next focused increment in [issue #55](https://github.com/angelcp2802/solidflow/issues/55)
checks real component, face and LINE pointer selection in an original named
assembly state, including Cancel/retry/Apply, Undo/Redo and saved reopening.
The production renderer passes 59 checkpoints / 12 geometry phases; the native
case checks literal placement and unchanged Base/dormant states. Selected
references now retain highlights, and the active picking instruction sits
beside the viewport. See [core workflows](CORE_WORKFLOWS.md),
[provenance](PROVENANCE.md#configured-material-pointer-original) and
[validation](VALIDATION.md). The long sidebar, compact layouts and complete
assembly-demo acceptance remain open in the same draft PR #49.

Final Windows acceptance passes 9,353 cases / 400 files, 83 IPC/security checks
(two explicit skips), build and actual Electron smoke. All 1,048 frozen
non-Markdown inputs remain unchanged. These local results do not establish
the open hosted or cross-platform acceptance.

Hosted predecessor `6ba3fb7` fails macOS nested symmetry selected
replacement/reactivation; its application-level cause remains unknown.
Security CodeQL passes but dependency audit reports one high Electron advisory
GHSA-jr5w-w6x2-84p9. Electron dependency remediation is outstanding. These hosted
failures are not waived by the local pointer workflow.

### Fresh face sketches and interface review

The next focused increment in [issue #55](https://github.com/angelcp2802/solidflow/issues/55)
checks actual pointer-created sketches on two successive native faces, automatic
merge/cut destinations, history and saved reopening. It fixes falsely active
sketch tools and clipped rows in the part-operation ribbon. The original
production renderer passes 39 checks / eight geometry phases; two native cases
also check reconstruction and upstream editing. See [core workflows](CORE_WORKFLOWS.md)
and [validation](VALIDATION.md) for exact tolerances and execution boundaries.
The visible piece review also identifies long sidebar scrolling and faint
reference/helper text. Full assembly-interface and compact-window acceptance
remain open in the same draft PR #49.

Hosted component snapshot `14ef731` ends with 11 successful jobs and four failures
in [CI 40030417412](https://github.com/angelcp2802/solidflow/actions/runs/40030417412).
The macOS six-role hinge stops source/replacement repair step fails; the three
dependent Desktop gates fail and later checks skip. The failing application
operation and cause are not established by the job status. Security40030417631
passes. No gate or deadline is relaxed to bypass these results.

### Configured component authoring

The next increment in [issue #55](https://github.com/angelcp2802/solidflow/issues/55)
adds configured import, registered reuse and parent-relative fixed/floating
authoring through private native previews. A v3 import retains its complete
catalog and selected child state. Named insertion affects every use of that
state and stays suppressed in Base. See the [contract](ASSEMBLY_CONFIGURED_COMPONENT_AUTHORING.md)
and [validation](VALIDATION.md) for exact cases and remaining limits. This stays
in draft PR #49; complete assembly-demo and release acceptance remain open.

Hosted origin-axis snapshot `25fbe30` ended with 11 jobs passing and four
failures in [CI 40027664551](https://github.com/angelcp2802/solidflow/actions/runs/40027664551).
The root failure is macOS material vertex symmetry source/replacement repair;
the other three failures are dependent Desktop gates, with later checks skipped.
Security run 40027664312 passed. The generic renderer annotation does not identify
the failed operation or establish a cause. Earlier security findings remain
separate from workflow execution.

### Origin-axis relation authoring

[Issue #55](https://github.com/angelcp2802/solidflow/issues/55) now includes
explicit root/component X/Y/Z origin references in standard and configured
assemblies. The [contract](ASSEMBLY_ORIGIN_AXES.md) separates analytic line
geometry, concentric free motion and material-only capture. Original renderer
workflows create concentric and angular relations, Cancel/retry/Apply, undo/redo
and save/reopen through real controls. Source-specific execution is recorded in
[VALIDATION.md](VALIDATION.md). The following configured-component increment
addresses insertion and fixed-state authoring; origin-axis rotation locking
and displayed-axis picking remain unfinished.

The final Windows suite passes 9,319 cases across 395 files, 83 IPC/security
checks (two explicit skips), build and actual Electron smoke. Nine focused native
cases and the standard/configured origin-axis renderers pass; these are bounded
cases, not full family or platform acceptance.

The preceding hosted run [40024383011](https://github.com/angelcp2802/solidflow/actions/runs/40024383011)
at `f6f1400` failed in macOS nested symmetry selected replacement/reactivation.
Eleven jobs passed; the failing renderer and its three dependent Desktop gates
did not. Their downstream unit/build/smoke/package steps were skipped. Security
run 40024382969 passed. A generic renderer-script annotation did not identify
the failed application operation, so no specific cause or cross-platform fix
is claimed.

### Core workflow priority

[Issue #55](https://github.com/angelcp2802/solidflow/issues/55) prioritizes
successive part operations and basic assembly authoring before further advanced
configured motion. See the [workflow and exact remaining gaps](CORE_WORKFLOWS.md).
The local increment adds current-body defaults, a sequential original example,
consistent middle-button navigation, configured component/general-role picking
and wrapping assembly commands. Origin-axis references are addressed by the
following increment; configured structural insertion is addressed above.
Exact execution is recorded in VALIDATION.md;
the same draft PR #49 remains the review target.

The local final suite passes 9,298 cases in 392 files plus 83 IPC checks
(two explicit Windows skips), build and actual Electron smoke. The part
sequence renderer passes 39 checks / 9 geometry phases; standard assembly
passes 527 checks and configured relations 61. These bounded Windows results
do not establish the remaining origin-axis or configured insertion scope.

The previous hosted run 40019394430 at `fbdb38d` finished with all three configured
relation jobs passing. The Mac symmetry-line repair and Windows/Mac standard
assembly persistence renderer jobs failed; the required Desktop jobs correctly
failed their dependency gate. This is not a complete three-platform pass.

### Configured compound authoring and validation scheduling

The increment after `ce5604e`, tracked in
[issue #52](https://github.com/angelcp2802/solidflow/issues/52), adds controlled
configured forms for profile-center, material LINE and circular-path relations.
Complete compound references and parameters use the existing private declaration
preview/Apply route. Named edits propagate to shared selected states; Base edits
preserve previous named declarations. Draft changes retain the complete context,
and stale callbacks cannot replace a newer intent. No new format or native
capture authority comes from a choice list or detached report.

Current Windows evidence includes 36 focused native authoring cases and four
production-renderer workflows: rectangle 74 milestones / 23 geometry phases,
circular profile 72 / 23, LINE 74 / 23 and circular path 84 / 25. All pass,
including saved-form restoration and actual committed-state captures. The
final complete suite passes 9,277 cases in 388 files, then 83 IPC/security checks
with two explicit Windows skips. Build and actual Electron smoke pass, alongside
the existing configured relation/mechanical flows. All 1,014 code/test/CI inputs
remain unchanged through final acceptance. See the
[contract](ASSEMBLY_CONFIGURED_COMPOUND_AUTHORING.md),
[human walkthrough](DEMO_ASSEMBLIES.md#author-profiles-and-material-paths-in-a-configured-state)
and source-specific [validation](VALIDATION.md) before making acceptance claims.

[Issue #53](https://github.com/angelcp2802/solidflow/issues/53) separates 51
renderer commands into three fixed batches per OS while retaining smoke,
unit/CAD, IPC and packaging in the original required Desktop checks. Those checks
fail unless every renderer/configured dependency succeeds. Parsed workflow and
exact command parity pass locally; hosted acceptance of the new split is open.
The suite now caps isolated native worker concurrency without changing deadlines.

The same Draft PR #49 remains the review target. Complete configuration
authoring, configured source/reference repair, interactive constrained movement,
flexible instances and the full assembly/demo/release scope remain open. This
increment establishes no general external-application equivalence or platform
support. [Issue #54](https://github.com/angelcp2802/solidflow/issues/54) tracks the
next constrained-movement/projection integration, with all relation families,
shared state, signed mechanical continuity and actual interaction evidence.

### Save completion and renderer readiness

The follow-up to `d99e1eb` addresses a controlled ordering risk in source-update
and configured mechanical acceptance. Written bytes do not prove that the
renderer has received the native Save result and finished its clean/busy state.
The exact old source-update flow fails naturally with real bytes already written
and controls still disabled. The corrected fences release the held real return
and observe clean file identity, controls and recovery before proceeding.
No application geometry or file semantics change. See [validation](VALIDATION.md)
and [provenance](PROVENANCE.md#controlled-native-save-completion-ordering).

Final Windows validation passes 9,204 unit/CAD cases in 385 files, 83 IPC/security
checks with two explicit skips, build and actual Electron smoke. The ordinary
and controlled source-update cases pass 50 milestones / 10 geometry phases each;
all five configured mechanical cases pass 55 milestones / 18 phases each.

The Save correction itself adds no compound form. The following configured
authoring block, tracked in [issue #52](https://github.com/angelcp2802/solidflow/issues/52),
is described in the current section above with its own implementation and
validation boundary. Full assembly/demo acceptance stays open.

### Configured native mechanical capture

The increment after `0f37957`, tracked in [issue #51](https://github.com/angelcp2802/solidflow/issues/51),
adds a separate configured native producer and graphical form for lock, locked
concentric, gear, screw and rack-pinion. Strict intents carry references and
parameters; native captures stay private until final solve, all-placement
verification and scene delivery succeed. Ordinary edits retain their captures;
explicit recapture removes the old declaration first and establishes a new neutral.

The same Draft PR #49 remains the review target. Windows validation passes
18 focused native cases and five renderer workflows, each with 49 milestones
and 18 geometry phases. Final `npm test` passes 9,204 cases in 385 files and
83 IPC/security checks with two explicit Windows skips; build and actual
Electron smoke pass. The bounded lifecycle includes capture/edit/recapture,
exact state isolation, history, recovery and file reopening. See the
[contract](ASSEMBLY_CONFIGURED_MECHANICAL_CAPTURE.md), [demo](DEMO_ASSEMBLIES.md#capture-a-mechanical-relation-in-one-state)
and source-specific [validation](VALIDATION.md) for actual execution. Complete
assembly demo, release and platform acceptance remain open.

### Compact interval pointer regression

The increment after `ad36143` reproduces the hosted pointer assertion locally
using the exact previous interval flow in a fixed 1040×700 hidden window.
All six upper handle nominees are covered by toolbar buttons in that case.
Checking the actual canvas hit target, waiting for hover publication and trying
both handle halves completes the same physical workflow. The ordinary-size
case remains separate.

The same follow-up removes repeated declaration-validator construction for
named states inheriting Base. Their exact state keys and complete capture
checks remain separate; explicit named relation lists keep their own validators.
The unchanged 4096-state case and new mixed-family forward/reverse batches
guard admission, isolation and the existing limits.

Local compact and ordinary runs pass 252 and 251 milestones respectively,
each with 38 phases, four actual gestures and actual save/reopen. Physical
targets, calibration, tolerances and deadlines remain unchanged. See the
[validation record](VALIDATION.md#compact-interval-pointer-acquisition--2026-10-23)
and [provenance](PROVENANCE.md#original-compact-interval-pointer-regression).
The same draft PR #49 collects the correction and requires its own hosted results.
Final Windows checks pass 9133 unit/CAD cases in 382 files, 83 IPC/security
checks with two explicit skips, build and actual Electron smoke. The configured
relation demo also passes its 61 milestones on the final code.
Full assembly acceptance remains open; [issue #51](https://github.com/angelcp2802/solidflow/issues/51)
tracks the next native capture integration for all five configured mechanical families.

### Configured relation editing and repeatable prototype demo

The increment after `d495192`, tracked in [issue #50](https://github.com/angelcp2802/solidflow/issues/50),
adds complete named relation lists, exact-state add/replace/remove/suppression
and graphical private native previews. Base edits preserve previous named
declarations. Drafts do not alter history or recovery; Apply authenticates the
original context and publishes one complete v3 snapshot.

Windows validation passes 9131 unit/CAD cases in 382 files and 83 IPC/security
checks with two explicit skips, build and actual Electron smoke. The new
production-renderer demo passes 61 milestones and 23 geometry phases through
editing, Cancel/Apply, shared variants, history and actual save/reopen. Existing
configured/BOM and rigid renderer workflows also pass their 80 and 527 milestones.
See the
[contract](ASSEMBLY_CONFIGURED_RELATION_EDITING.md), [walkthrough](DEMO_ASSEMBLIES.md#edit-a-relation-in-one-state)
and [validation](VALIDATION.md#configured-relation-editing-and-private-intent-previews--2026-10-23).

The same [draft PR #49](https://github.com/angelcp2802/solidflow/pull/49) collects
the work. Preceding head `f2a1c91` completed Linux CI and packaging; Windows
and macOS failed an existing pointer-handle acquisition assertion after passing unit/CAD
and IPC. Hosted results for this increment remain required. Mechanical capture,
profile/path forms, native repair/source lifecycle, further configured consumers,
flexible instances and the full assembly/release gate remain open.

### Reproduced CI test failures and symmetry repair acceptance

The increment after `ce6871f` corrects the private source-stage protocol in the
point, surface and nested symmetry renderer tests. All eight affected workflows
now pass locally, retaining exact review/base/proposal bindings and unchanged
native oracles. It also fixes file-fault hooks that missed canonical paths:
the current Windows/macOS hosted logs exposed matching rejection failures,
reproduced locally using only a Windows path-case alias. The actual FIFO hook
uses the same canonical-target preparation. Production security remains intact.

Final Windows evidence: 9068 unit/CAD cases in 379 files, 81 IPC/security/source
passes with two explicit skips, build and actual Electron smoke. An auxiliary
Ubuntu/WSL Node18 run passes four selected filesystem cases, including real
three-channel FIFO rejection under a temporary-directory symlink. This does not
establish Node24/Linux/macOS desktop support. See the
[validation ledger](VALIDATION.md#canonical-fault-injection-and-private-symmetry-repair--2026-10-23)
and [hardening contract](PROTOTYPE_HARDENING.md#ci-failure-diagnostics).

The same [draft PR #49](https://github.com/angelcp2802/solidflow/pull/49) retains
the integration. Its earlier `8e2a185` Security and separate CodeQL checks pass,
with one medium alert still reported. Fresh hosted results are required for
the corrected tests; no check/query is disabled. Full assembly and release
acceptance remain open.

### Configured quantities, CSV and reproducible demo

The increment after `c234b61` adds a committed-v3 BOM with variant-aware rows,
three modes, independent assembly range/member highlighting and restricted CSV
export. Counts follow effective suppression/visibility and retain complete
root paths/state ancestry. They certify no material, mass or solved relations.

Final Windows x64 validation passes 9068 unit/CAD cases in 379 files and 79
security/source cases, with two explicit Windows skips. Build, actual Electron
smoke, the configured renderer's 80 milestones/13 BOM phases and the existing
527-milestone rigid renderer pass. CSV cancel, real filesystem error and actual
root/scoped writes preserve the document. See the [contract](ASSEMBLY_CONFIGURED_BOM.md),
[demo](DEMO_ASSEMBLIES.md#configured-quantities-and-csv) and
[validation](VALIDATION.md#configured-bom-csv-and-workflow-diagnostics--2026-10-23).

This remains the same [draft PR #49](https://github.com/angelcp2802/solidflow/pull/49),
not a merge or release. Earlier snapshot `893ec01` passed Linux distance and
directed-stop steps but subsequently failed symmetry repair; Windows failed
IPC security and macOS remained in unit/CAD checks at inspection. Its separate
CodeQL count fell from nine to two alerts. This increment removes only the
redundant FIFO test read and adds bounded primary-failure annotations; it must
receive its own hosted acceptance. No check or query is suppressed.

Configured relation/capture/repair, source lifecycle, interference/geometric
export/import, parameter/part-feature variants, flexible instances and the
complete assembly/demo gate remain open. Historical entries below retain their
own source-specific results and publication context.

### Prototype hardening and reproduced renderer failure

The follow-up on `f167be2` replaces seven caller-named object-write paths with
strict Map/literal admission, admits actual file descriptors before reading,
and prevents malformed worker messages or response failures from poisoning the
native command queue. A production worker probe demonstrates ordered rejection
followed by reconstruction of an original prism. The directed-guide renderer
test now follows the private part-update command and its rejection contract;
pointer expectations follow actual DOM input rather than an ideal double.

Local Windows x64 validation passes 9030 unit/CAD cases in 376 files and
70 security/source checks, with two explicit Windows skips. Build and real
desktop smoke pass. Directed-angle/source-repair, distance, configured and basic
assembly renderer runs pass with child closure and isolated-profile cleanup.
See the [hardening contract](PROTOTYPE_HARDENING.md),
[provenance](PROVENANCE.md#original-worker-recovery-and-read-race-cases) and
[validation](VALIDATION.md#prototype-hardening-and-renderer-contracts--2026-10-23).

This updates the same [draft PR #49](https://github.com/angelcp2802/solidflow/pull/49).
Hosted acceptance remains open. Its earlier `85a33b6` CI failed basic assembly
on macOS, distance intervals on Windows and directed stops on Linux; unavailable
full logs prevent attributing every hosted failure to the local reproduction.
That head's separate CodeQL check still reported nine alerts. No query or
branch check has been suppressed. The assembly milestone and release remain
incomplete; these are validation and input corrections, not new CAD coverage.

### Integration draft and persisted configuration editor

[PR #49](https://github.com/angelcp2802/solidflow/pull/49) collects the rigid
assembly prototype in one draft. The new persisted configuration increment
follows local `8d9a756`: complete strict v3 source/catalog/root-selection files,
actual effective native scenes, private configured worker previews and atomic
Apply, root/child state editing, complete history/recovery and Save As/Save/reopen.
Legacy dependent consumers reject this format instead of returning base results.

The final local Windows x64 run passes 8998 unit/CAD cases in 374 files,
67 security/source checks with one inherited permission skip, production build
and the real Electron baseline. The original configured production-renderer
walkthrough passes 14 geometry/lifecycle phases with actual worker/file IPC,
child close and temporary-profile cleanup. See the [contract](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md),
[demo instructions](DEMO_ASSEMBLIES.md) and [validation record](VALIDATION.md#persisted-configuration-workereditor-integration--2026-10-23).

The draft is not ready to merge or release. Hosted checks on its earlier
`2ce9273` head failed directed-angle stops on Linux and distance intervals on
Windows/macOS; nine CodeQL alerts also require review. Passing build/unit/CAD/
IPC/smoke stages on those systems do not validate skipped later workflows or
platform support. The configured increment requires its own hosted results.

Remaining assembly work includes configured relation/capture/repair and source
lifecycle, dependent BOM/interference/export/import, parameter/part-feature
variants and flexible instances. This walkthrough does not close issue #45's
complete assembly/demo scope. The entries below retain the historical local
bases and validation of their own increments; earlier unpublished/next-step
statements are historical, not the current publication status.

### Local selected rigid configuration solve transactions

The local `codex/assembly-configuration-solve` increment follows `6bd90f5`.
One owning transaction now solves selected intrinsic states child before parent,
stages exact poses/winding and verifies every actual placed use independently
before private atomic publication. Named/base writeback retains complete captures
and explicitly isolates inherited named values. Shared child states retain
normal propagation. Every Apply attempt consumes its private complete-baseline
preparation; failure cannot publish partial child staging.

All 41 new cases pass: 16 native integration, 16 pure writeback and nine pure
policy cases. The complete Windows run passes 8868 unit/CAD cases, 65 security/
source checks with one inherited permission skip, build and the unchanged
Electron baseline. The prior 172 configured native cases are unchanged.

See the [contract](ASSEMBLY_CONFIGURATIONS_SOLVE.md),
[provenance](PROVENANCE.md#original-selected-state-solve-transactions) and
[actual validation](VALIDATION.md#selected-rigid-configuration-solve-transactions--2026-10-23).

Next are persisted configuration envelopes and complete worker/session/editor
integration, including effective scenes, private previews, history, recovery,
save/reopen and dependent consumers. Native capture/repair, parameter/part-feature
variants, flexible instances and the complete assembly/demo gate remain open.
The transaction is standalone, local and unpublished.

### Local independent configured geometry verification

The local `codex/assembly-configuration-verification` increment follows
`857897b`. Independent physical checks now cover the nineteen binary families,
centered Width and five Symmetry purposes. A fresh-candidate verifier combines
them with existing advanced/hinge checks at every actual placed scope, retaining
exact state identity, native purposes, original-chain error and unavailable
passive winding. Fatal query/currentness/release failure withholds the report.

Forty-eight new native and fifteen pure cases pass in the complete Windows
run: 8827 unit/CAD cases, 65 security/source checks with one inherited permission
skip, build and the unchanged Electron baseline. The previous 124 native cases
remain intact except four imports. Earlier test-oracle and new integration
deadline failures are recorded with their actual corrections.

See the [contract](ASSEMBLY_CONFIGURATIONS_VERIFICATION.md),
[provenance](PROVENANCE.md#original-configured-physical-verification) and
[actual validation](VALIDATION.md#independent-configured-geometry-verification--2026-10-23).

Next is selected-state solve execution, child-before-parent staging and atomic
state writeback with capture/winding preservation and fresh final geometry
gating. Base inheritance and shared child-state effects require an explicit
transaction policy. Saved/editor lifecycle, parameter/part-feature variants,
flexible instances, dependent consumers and the complete assembly/demo gate
remain open. This increment is local and unpublished.

### Local configured numerical scopes and state planning

The local `codex/assembly-configuration-scope` increment follows `a0843c8`.
Every current relation family can now project genuine configured references
into an exact declaring scope's immediate numerical children while preserving
their physical root owners. A separate pure planner groups exact intrinsic
states, retains all placed instances and orders children before parents.
An optional length convergence target tightens variable groups without changing
fixed/public/native acceptance bands or solver iteration budgets.

Twenty-six new pure and 56 new native cases pass. Full Windows checks pass
8764 unit/CAD cases, 65 security/source checks with one inherited permission
skip, build and the unchanged Electron baseline. All 875 production/test/config
inputs retain the recorded acceptance digest. Earlier native failures and the
first complete run's combined-relation timeout are recorded with corrections.

See the [contract](ASSEMBLY_CONFIGURATIONS_SCOPE.md),
[provenance](PROVENANCE.md#original-configured-numerical-scope-and-state-planning)
and [actual validation](VALIDATION.md#configured-numerical-scopes-and-state-planning--2026-10-23).

Next is a complete configured numerical transaction: stage child-state results
before parents, preserve mechanical continuity, reconstruct fresh native
geometry, verify every placed instance and write back exact states atomically.
General binary/width/symmetry final physical checks and conditioning still need
integration. Native capture/repair, parameter/part-feature variants, saved/editor
lifecycle, all dependent consumers and flexible instances remain required.
The complete assembly/demo gate stays open. This increment is local and
unpublished.

### Local configuration capture and winding declarations

The local `codex/assembly-configuration-state` increment follows `2923574`.
Complete mechanical capture records now have exact source-tuple, configuration
and mate keys. Named entries materialize into the actual core catalog and
effective native/numerical declarations, preserving source references,
parameters and other states. The combined state envelope retains its 4096-entry
and 20 MiB limits. These are authored declarations; they do not authenticate
historical capture or authorize native recapture.

Fifty-two new pure and three new native cases pass. Full Windows checks pass
8682 unit/CAD cases, 65 security/source checks with one inherited permission
skip, build and the unchanged Electron baseline. All 872 production/test/config
inputs retain the recorded acceptance digest. The first complete attempt's two
boundary timeouts and the validation-cost correction are recorded explicitly.

See the [contract](ASSEMBLY_CONFIGURATIONS_STATE.md),
[provenance](PROVENANCE.md#original-configuration-capture-and-winding-declarations)
and [actual validation](VALIDATION.md#configuration-capture-and-winding-declarations--2026-10-23).

Next are selected-state dependency order and closed numerical scope projection,
general configured final verification and atomic state-specific solve/writeback.
Native capture/repair and winding continuity, relation-parameter/part-feature
variants, saved/editor lifecycle and all dependent consumers still need
integration. Flexible instances and the complete assembly/demo gate remain
open. This increment is local and unpublished.

### Local effective configuration numerical bridges

The local `codex/assembly-configuration-numeric` increment follows `6ef1a85`.
All current configured relation families now have detached numerical adapters
using actual effective descendant frames below their full-root rigid owners.
Hinges, profile centers and material LINE/circular paths also have independent
physical support measurements. Original placement-chain budgets, distinct
native purposes, structural hinge axiality and finite projected-phase errors
remain explicit. Saved v2 syntax and production worker/editor/Apply are unchanged.

Sixty-five new native cases pass, including six standalone solve experiments
followed by fresh native reconstruction and independent measurement. Free
circular interior, Follow/UP, explicit finite/support-circle domains and
undefined center phase have separate executed controls. Full Windows checks
pass 8,627 unit/CAD cases, 65 security/source checks with one inherited permission
skip, build and the unchanged Electron baseline. All 869 production/test/config
inputs retain the recorded acceptance digest. See the
[contract](ASSEMBLY_CONFIGURATIONS_NUMERIC.md),
[provenance](PROVENANCE.md#original-configured-numerical-bridges) and
[actual validation](VALIDATION.md#effective-configuration-numerical-bridges--2026-10-23).

Next are selected-state scope projection, general configured final verification
and variant-specific capture/winding and parameter storage, followed by
transactional solve/writeback and saved/editor integration. State must be keyed
by exact source tuple plus selected configuration, preserving base and every
unselected state. All dependent consumers, independently solved flexible
instances and the full assembly/demo gate remain open. This increment is local
and unpublished; these programmatic checks do not establish configured UI,
installed-package or another-platform acceptance.

### Local effective configured relation references

The local `codex/assembly-configuration-relations` increment follows `0f00119`.
A pure inventory now uses effective scope states and mate suppression rather
than the base declarations. The configured native session resolves all current
saved families into separate private aggregates, including passive mechanical
state in active scopes. Declaration diagnostics remain repairable; native
processing failures revoke the session and withhold the whole result.

Forty-six new pure and thirty-nine new native cases pass. The combined binary
case retains all nineteen families and 38 aggregates. Width, symmetry, profiles,
material paths and hinges have their own ordered purpose checks. All 56 prior
configured native regressions remain unchanged. Full Windows checks pass 8,562
unit/CAD cases, 65 security/source checks with one inherited permission skip,
build and the unchanged desktop baseline. Source freezes cover all 864
production/test/config inputs, including the documented final EOF-only cleanup.
See the
[contract](ASSEMBLY_CONFIGURATIONS_RELATIONS.md),
[provenance](PROVENANCE.md#original-configured-relation-inventories) and
[actual validation](VALIDATION.md#effective-configured-relation-references--2026-10-23),
including the earlier timeout and the retained correction.

Next are authenticated configured physical measurements and numerical bridges
for every family, followed by variant-keyed solve/writeback and capture/winding
storage. Saved/direct-base selectors, all source/repair/BOM/export/editor
consumers and independently solved flexible instances remain required. The
full assembly/demo gate stays open. This remains local and unpublished;
configured CI is not executed platform evidence.

### Local configured native query purposes

The local `codex/assembly-configuration-purposes` increment follows `8d6d70c`.
The separate configured session now queries the existing component frames,
geometry/directions, cylinder/sphere surfaces, bounded profiles and paths with
distinct purposes and complete current-input checks. Observation helpers and
metadata grant no private proof authority. Saved syntax and production
worker/editor commands are unchanged.

Thirty-eight new native cases and eighteen unchanged context regressions pass.
Independent original geometry checks cover 3D variants, purpose/incidence,
precision refusal, full owners and proof lifetime. Full Windows checks pass
8,477 unit/CAD cases, 65 security/source cases with one inherited permission
skip, build and the unchanged production-loader desktop smoke. All 860 frozen
production/test/config inputs remain unchanged. See the
[contract](ASSEMBLY_CONFIGURATIONS_NATIVE.md),
[provenance](PROVENANCE.md#original-configured-native-purpose-fixtures) and
[actual validation](VALIDATION.md#configured-native-query-purposes--2026-10-23).

The next boundary is effective active/passive relation inventories and
authenticated configured measurement aggregates, then numerical adaptation and
variant-specific solve/writeback. Saved/editor lifecycle, direct base selectors,
every graph consumer and flexible instances still require integration. The
full assembly/demo scope remains open. This stays local and unpublished;
configured CI is not executed platform evidence.

### Local configured native plane/point context

The local `codex/assembly-configuration-native` increment follows `7501844`.
A separate native session resolves effective plane/point references with full
occurrence ownership and a private proof registry. Source, catalog, selected
state and controller generation participate in every currentness check.
Native processing and context changes cannot publish a stale return; legacy
assertions remain separate.

Eighteen original native cases pass, including actual transformed material,
same-state reuse, null scopes, hidden/suppressed/activated branches, stale and
cross-legacy proofs, reentry, cleanup and the real expanded-body budget.
Full Windows checks pass 8,439 unit/CAD cases, 65 security/source cases with one
inherited permission skip, build and the unchanged desktop baseline smoke.
The 858 frozen production/test/config inputs remain unchanged. See the
[contract](ASSEMBLY_CONFIGURATIONS_NATIVE.md),
[provenance](PROVENANCE.md#original-configured-native-reference-fixtures) and
[actual validation](VALIDATION.md#native-rigid-configuration-reference-context--2026-10-23).

Remaining native purposes, effective relation inventories, variant-specific
solve/writeback, saved/editor lifecycle and every graph consumer still need
integration. Flexible instances and the complete assembly/demo scope remain
open. This stays local and unpublished; configured CI is not execution.

### Local rigid configuration evaluation core

The local `codex/assembly-configuration-core` increment follows `dd34a75`.
It adds a strict separate catalog and owned evaluation of named rigid states,
including independent selections on reused subassemblies and ordered reference
availability diagnostics. It does not add configuration fields to saved v2
documents or expose a configuration editor. Source/base identity and selected
variant identity remain separate.

Eighteen pure cases and four original native-placement cases pass. Independent
boxes check four-body V68/A172 and right-only suppression to three-body
V58/A138, including same-variant reuse and a common 3D gauge. Full Windows
checks pass 8,421 unit/CAD cases, 65 security/source cases with one inherited
permission skip, build and the unchanged production desktop smoke. All 856
frozen production/test/config inputs remain unchanged. See the
[contract](ASSEMBLY_CONFIGURATIONS_CORE.md),
[provenance](PROVENANCE.md#original-rigid-configuration-evaluation-fixtures) and
[actual validation](VALIDATION.md#rigid-configuration-evaluation-core--2026-10-23).

The next integration must bind native proof/currentness to the complete
source, catalog and selected state, then solve and write back by variant without
overwriting base or another configuration. Saved syntax, base occurrence
selectors, source/repair/BOM/export consumers, editor lifecycle, flexible
instances and the complete assembly/demo gate remain open. This stays local
and unpublished; configured CI is not an executed platform result.

### Local structural STEP component insertion

The local `codex/assembly-step-insertion` increment follows `2a2ff76` and adds
**Insertar STEP estructurado** to the assembly workspace. Native source
admission, composition and full candidate preparation precede one ordinary
parent edit. The parent keeps its identity, saved path and baseline. Exact
history, accepted-source reuse and autonomous saved reopening have actual
production-renderer evidence with original geometry and restricted file IPC.

The 53-step renderer checks nine bodies after insertion and seventeen after
reuse, retaining separate coincident bodies in the real structured export.
Shared-scope insertion is separately checked under two native instances.
See the [contract](ASSEMBLY_STEP_EDITOR.md#insert-into-the-current-assembly),
[provenance](PROVENANCE.md#original-structural-step-insertion-workflows) and
[actual validation](VALIDATION.md#structural-step-component-insertion--2026-10-23).
Windows checks pass 8,399 unit/CAD cases, 65 security/source cases with one
inherited permission skip, build, desktop smoke and both affected import
regressions. All 852 frozen production/test/config inputs remain unchanged.
This stays local and unpublished; configured CI is not a hosted result.
Missing assembly families, configuration/flexible behavior, broader interchange
and the complete assembly/demo scope remain open.

### Local structural STEP editor interchange

The local `codex/assembly-step-editor` increment follows `6fe3b6d`, which
preserves multibody product boundaries on top of the `b19a3bc` native structural
prerequisite. Explicit commands now import an autonomous new unsaved assembly
from either workspace and export committed product/instance structure alongside
the separate flat formats. Independent native scene preparation precedes the
replacement decision; cancellation and rejection retain the current workspace.

The original reused eight-solid case passes the actual production renderer,
including both workspace imports, restricted file IPC, source-independent saved
reopening and two real structural exports with fresh native geometry checks.
See the [contract](ASSEMBLY_STEP_EDITOR.md),
[provenance](PROVENANCE.md#original-structural-step-editor-workflow) and
[source-specific validation](VALIDATION.md#structural-step-editor-interchange--2026-10-23).
This increment stays local and unpublished. Final Windows checks pass 8,383
unit/CAD cases, 65 IPC/security/source cases with one inherited permission skip,
build, production desktop smoke and both affected renderer regressions. The
847 frozen production/test/config inputs remain unchanged. Exact acceptance
belongs in validation; configured CI is not execution.
Broader neutral representations, independent interoperability and the complete
assembly/demo scope remain open.

### Local limited-hinge pointer acceptance

The local `codex/assembly-hinge-limits-pointer` increment follows `6dea4f2`.
It adds an original production workflow for six actual face selections, angular
edit reselection, bounded wrong-purpose/hidden/canceled input controls and
local-Z stop projection with inward release. Trusted DOM input and actual
posted targets supply the pointer expectation; independent native material
geometry and the signed guide verify the result. The saved/native product
implementation is unchanged in this focused acceptance increment.

The original symmetric-arc case passes 124 recorded checks: eight pointer hits,
four negative interactions and five rotation gestures. It checks ready
Cancel/retry, Apply/history and saved reopening. Exact source-specific commands
and limits belong in [validation](VALIDATION.md). Broader axis/interval/camera
combinations, external policies and the complete assembly/demo gate remain
open. This increment stays local; configured CI is not an executed platform
result.

Final Windows checks pass 8,232 unit/CAD cases, 65 IPC/security cases with one
inherited permission-limited symlink skip, build and production desktop smoke.
The existing unlimited pointer and limited dropdown regressions also pass.
All 827 frozen source/runtime/config files remain unchanged; actual validation
and evidence limits are linked above.

### Local optional hinge angular stops

The local `codex/assembly-hinge-limits-integration` increment follows `118798c`.
It connects the existing six-role numerical/native primitive to strict optional
saved stops, current worker verification, editor authoring and source/replacement
repair. The old unlimited four-role document form remains intact. The
[contract](ASSEMBLY_HINGE_STOPS.md) and
[provenance](PROVENANCE.md#original-saved-six-role-hinge-workflows) distinguish
declaration, native proof, scripted interaction and remaining acceptance.

This focused increment stays local and unpublished. Actual source-specific
checks belong in [validation](VALIDATION.md). Angular-role pointer selection,
pointer projection at both stops, externally evidenced angular policies and
the complete assembly/demo gate remain separate requirements. Configured
multi-platform CI is not an executed platform result.

Final Windows checks pass 8,232 unit/CAD cases, 65 IPC/security cases with one
inherited permission-limited symlink skip, build and production desktop smoke.
The two new renderer workflows pass 90/twelve and 164/thirty recorded
checks/phases; the three existing unlimited hinge workflows also pass. Their
actual cases and evidence limits remain in validation.

### Local assembly source revision authoring

The local `codex/assembly-source-revisions` increment follows `b9caade`.
It adds an explicit root revision action, complete valid reference rekeying,
private worker/native preview and Apply, with Save remaining a separate action.
This fills the authoring gap for changed linked v2 sources. Exact native
candidate equality prevents incidental pose/capture changes during revision
creation; ordinary Solve/Apply must precede authoring when needed.
See the [contract](ASSEMBLY_SOURCE_REVISIONS.md),
[provenance](PROVENANCE.md#assembly-source-revision-fixtures) and
[actual checks](VALIDATION.md#assembly-source-revision-authoring--2026-10-23).

Automatic dependency revisions, multi-document recovery and the wider
assembly/demo scope remain open. The increment stays local and unpublished;
configured multi-platform CI is not a runtime result.

Final Windows x64 checks pass 8,039 unit/CAD cases, 65 IPC/security cases with
one inherited permission-limited file-symlink skip, build and desktop smoke.
The new actual-source authoring renderer passes 63 recorded checks/17 phases;
existing linked-source and source-update workflows pass 113/30 and 41/10.
A presented final frame was inspected. Exact cases and limits remain in
validation; these results do not close the full assembly/demo scope.

### Local explicit linked source files

The local `codex/assembly-linked-sources` increment follows `dd51e88`. It adds
optional embedded source descriptors, separate read-only file capabilities and
explicit review/reload for parts and rigid subassemblies. The embedded cache
remains self-contained; source contents and accepted byte digest are applied
together after fresh native verification. Reopening requires native file
selection again. See the [contract](ASSEMBLY_LINKED_SOURCES.md) and
[actual validation](VALIDATION.md#explicit-linked-source-files--2026-10-22).

Automatic reload, source writeback, multi-document recovery, structural
interchange, remaining Width modes and the full assembly/demo gate remain open.
This increment stays local and unpublished; no other-platform or hosted CI
result follows from the local tests.

Final Windows x64 checks pass 8,016 unit/CAD cases, 65 IPC/security checks
with one permission-limited symlink skip, production build, desktop smoke,
the new 113-check/30-phase linked-source renderer workflow and the existing
41-check/10-phase source-update workflow. A separate presented-frame capture
was inspected. Limits and actual case tolerances remain in validation.

### Local saved material circular-path lifecycle

The local `codex/assembly-circular-path-lifecycle` increment follows `382c6b1`.
It connects explicit saved circular intent to current material references,
scoped numerical owners, fresh independent final checks, private worker Apply,
source repair and editor lifecycle. LINE and circular selections have identical
compound syntax; purpose now follows the saved family and role throughout
catalogs, keys and native repair. Positive native circular-origin metadata
nominates complete edge/endpoint choices without granting proof authority.
See the [contract](ASSEMBLY_CIRCULAR_PATH.md),
[original provenance](PROVENANCE.md#saved-circular-path-lifecycle-fixtures) and
[actual checks](VALIDATION.md#saved-material-circular-path-lifecycle--2026-10-22).

Free trim/support-circle domains are explicit SolidFlow intent, with finite
material distance and optional component-axis Follow/projected planar UP.
External circular policies, closed-circle material origins, chained curves,
broader interaction and the complete assembly/demo gate remain open. The
increment stays local and unpublished; configured CI is not an executed
other-platform result.

Final Windows x64 checks pass 7,977 unit/CAD cases, 50 IPC/security checks,
production build, desktop smoke, the new 62-check / 8-phase circular renderer
workflow and the existing 201-check / 70-phase LINE workflow. Four new files
add 52 original cases. An earlier final-source run hit three existing 5-second
test limits; focused reproduction and the complete unchanged repeat pass.
Those failures and their unproven cause remain in the validation record.

### Local current-native circular-path bridge

The local `codex/assembly-circular-path-native` increment follows `f8ea7ff`.
It derives numerical circular constraints from current material point/arc/UP
proofs and independently verifies candidate poses with fresh native queries.
The declared `current-native-analytic-float64` reference model separates
center/radius/frame/sweep and D1 arithmetic from disclosed topology tolerances.
Original placement chains and actual root rigid owners remain authoritative,
including scoped/reused selections. See the
[contract](ASSEMBLY_CIRCULAR_PATH_NATIVE.md) and
[original provenance](PROVENANCE.md#current-native-circular-path-resolution-fixtures).

The native regression matrix includes fixed start/mid/end, both origins,
Free Follow/UP, nested poses and local material-point projection. It does not
add a saved curved-path declaration, editor/worker command, source repair or
Apply/history/reopening lifecycle. External domain policies, closed-circle
origins, chained paths, remaining Width modes and the complete assembly/demo
gate remain open. This increment stays local and unpublished. Source-specific
results belong in [validation](VALIDATION.md#current-native-circular-path-bridge--2026-10-22).

Final Windows x64 checks pass 7,925 unit/CAD cases, 50 IPC/security checks,
production build and desktop smoke. The five new test files add 67 original
cases; the production-loader smoke is separate from native geometry checks.
No circular renderer workflow, hosted-CI result or other-platform execution is
claimed.

### Local numerical circular-path solver

The local `codex/assembly-circular-path-numeric` increment follows `f1547fc`.
It adds explicit numerical trim/support-circle domains, fixed material distance,
changing-tangent Follow/UP and constrained target projection with actual owner
incidence. Both finite ends remain inequalities, independent of bilateral rank.
Separate mandatory position/radius/frame/sweep errors gate acceptance. See the
[contract](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md) and original
[provenance](PROVENANCE.md#numerical-circular-path-fixtures).

The native CAD experiment uses manually declared original recipe data and
re-queries transformed material geometry after numerical solving. It is not a
production native admission adapter. Saved curved-path declarations, source
repair, justified native error budgets, editor/worker integration and lifecycle
remain open. Complete-circle origins, chained paths, external policies, remaining
Width modes and the complete assembly/demo gate are also pending. This increment
stays local and unpublished. Current source-specific check results belong in
[validation](VALIDATION.md#numerical-circular-path-solving--2026-10-22).

Final Windows x64 checks pass 7,858 unit/CAD cases, 50 IPC/security checks,
production build and desktop smoke. The five new test files contain 81 original
cases; actual native recipe experiments, mathematical derivatives and the
production-loader smoke have separate scopes. No circular renderer workflow,
hosted-CI result or other-platform execution is claimed.

### Local current material circular-arc origin

The local `codex/assembly-material-arc-path` increment follows `9aa1007` with
explicit material endpoints and directed finite queries on open circular
trims. Current native edge/vertex incidence, separate private snapshot proof,
original placement budgets and owned cleanup are required. Both endpoints,
major trims, a trim crossing `2*pi` and reused nested placements have original
regressions. See the [contract](ASSEMBLY_MATERIAL_ARC_PATH.md),
[provenance](PROVENANCE.md#material-circular-arc-origin-fixtures) and
[actual checks](VALIDATION.md#current-material-circular-arc-origin--2026-10-22).

Windows x64 checks pass 7,777 unit/CAD cases, 50 IPC/security checks, production
build and desktop smoke. This is a
geometry/reference prerequisite; saved curved-path declarations, free coordinate
policy, simultaneous solver, orientation and editor lifecycle remain open.
It does not extend the LINE mate into a circular or chained path. Full-circle
seams, remaining Width modes and the complete assembly/demo gate are also
pending. The increment stays local and unpublished, with no new other-platform,
installer, hosted-CI or reference-application policy claim.

### Local material LINE projected planar UP

The local `codex/assembly-line-path-roll` increment follows `4ab0b09` and adds
explicit material-plane UP to component-axis Follow. The three references keep
their actual rigid owners through solving, native final verification and
compound repair. Independent reversal and saved intent survive editor history
and reopening. Old Free/Free and Follow/free-roll declarations keep their
previous saved shape. See the [contract](ASSEMBLY_LINE_PATH.md),
[original provenance](PROVENANCE.md#line-path-planar-up-equation-and-native-fixtures)
and [actual checks](VALIDATION.md#material-line-projected-planar-up--2026-10-22).

Windows x64 checks pass 7,738 unit/CAD cases, 50 IPC/security checks, production
build, desktop smoke and the expanded 201-check / 70-phase renderer workflow.
The renderer includes a guide-only movable component and saved UP editing;
the native matrix checks all 24 distinct axis/sign combinations. These are
bounded cases, not general convergence or platform support. UP without Follow,
linear UP guides, circular/chained paths, Width modes beyond centered and the
complete assembly/demo gate remain open. This increment stays local and
unpublished. Earlier entries retain their historical scope.

### Local material LINE component-axis Follow

The local `codex/assembly-line-path-follow` increment follows `5df6902` and adds
optional explicit component-axis Follow to the saved LINE mate. X/Y/Z and its
own reversal are separate from the position mode and reversal; roll stays free.
The old Free/Free form reopens unchanged. Fresh native angular verification,
uncertainty admission, private Apply and the existing compound references remain
required. See the [contract](ASSEMBLY_LINE_PATH.md),
[provenance](PROVENANCE.md#material-line-path-fixtures) and
[actual checks](VALIDATION.md#material-line-component-axis-follow--2026-10-22).

Windows x64 checks pass 7,646 unit/CAD cases, 50 IPC/security checks, build,
production-loader smoke and the expanded 133-check / 49-phase renderer workflow.
Controlled roll, circular/chained paths, broader interaction and full
assembly/demo acceptance remain open. This increment remains local and
unpublished; configured CI and other-platform support have no new execution
result. Earlier entries retain their historical scope.

### Local saved material LINE path lifecycle

The local `codex/assembly-line-path-lifecycle` increment follows `5291987` and
adds a saved material point / LINE edge / material-start relation. Free position
retains axial sliding on the underlying straight support; Distance and Percentage
lock explicit inclusive coordinates with reversal. Current native incidence and
actual length gate preview; fresh final verification and private worker authority
gate Apply. Compound path repair, scoped references, history and reopening retain
the explicit intent. See the [contract](ASSEMBLY_LINE_PATH.md),
[original fixture provenance](PROVENANCE.md#material-line-path-fixtures) and
[actual validation](VALIDATION.md#saved-material-line-path-lifecycle--2026-10-22).

Windows x64 checks pass 7,612 unit/CAD cases, 50 IPC/security checks, build,
production-loader smoke and the dedicated 98-check / 34-phase renderer workflow.
The renderer covers original dropdown authoring and saved lifecycle; source
repair and nested scopes have separate unit/native evidence. This is one
straight-edge family with free pitch/yaw and roll. Circular/chained paths,
non-Free orientation and full assembly/demo acceptance remain open. The branch
remains local and unpublished; configured CI and other-platform support have no
new execution result. Earlier entries below describe their own historical scope.

### Local current bounded path curves

The local `codex/assembly-path-native-foundation` increment follows `f36c018`
with current finite LINE and circular-arc observations, directed arc-length
evaluation and separate native snapshot proofs. Native trim parameters, explicit
sense, endpoints and an observed circular seam stay distinct from a normalized
fraction or persisted path origin. Composed world precision must fit the
requested bands; copied or old LINE proofs cannot authenticate these queries.
See the [contract](ASSEMBLY_PATH_CURVES.md),
[original fixtures](PROVENANCE.md#bounded-path-curve-fixtures) and
[validation](VALIDATION.md#current-bounded-path-curves--2026-10-22).

Windows x64 checks pass 7,532 unit/CAD tests, 50 IPC/security checks, build and
production-loader smoke. This is a geometry/reference prerequisite. Saved Path
relations, the free-path solver coordinate, multiple-edge continuity, persistent
origin/repair policy, pitch/yaw/roll semantics and editor acceptance remain open.
No Path authoring UI or complete assembly/demo acceptance is claimed. Work
remains local and unpublished; other-platform execution is not established.

### Local saved profile-center lifecycle

The local `codex/assembly-profile-center-lifecycle` increment follows `e1bcae8`
and connects current bounded-profile proofs to the assembly solver, saved v2
declarations, authenticated previews, editor controls, history and reopening.
The admitted saved families are two complete circular faces with free spin,
or two rectangular faces with explicit boundary edges, senses and quarter turns.
Signed offset belongs to the first normal. Fresh native queries independently
check the final physical targets before granting Apply.

Compound face/edge/sense references participate in source updates, selected/all
replacement and subassembly updates; repairs stay explicit and atomic. See the
[lifecycle contract](ASSEMBLY_PROFILE_CENTER_MATES.md),
[original fixtures](PROVENANCE.md#saved-profile-center-lifecycle-fixtures) and
[actual validation](VALIDATION.md#saved-profile-center-lifecycle--2026-10-22).
Windows x64 checks pass 7,508 unit/CAD cases, 50 IPC/security checks, build,
production-loader smoke, the dedicated 27-phase profile workflow and the
existing assembly renderer regression. These results cover the recorded cases.
This is local, unpublished work. Pointer selection, circular roll locking,
automatic rectangular correspondence, complete native orientation compatibility,
continuous translation-path admission and full assembly/demo acceptance remain
open. Windows checks do not establish macOS or Linux operation.

### Local profile material directions and physical verification

The local `codex/assembly-profile-material-axis` increment follows `b6f606e`
with an explicit native rectangle face/boundary-edge/sense purpose, separate
private witnesses and independent physical target evaluation. The engine checks
both identities and actual boundary membership together. Squares retain the
explicit chosen side; circles retain no material axis. See the
[contract](ASSEMBLY_PROFILE_MATERIAL_AXES.md) and [validation](VALIDATION.md).

This observation/measurement layer grants no saved-mate or Apply authority of
its own. Its later [lifecycle integration](ASSEMBLY_PROFILE_CENTER_MATES.md)
supplies a bounded saved-family policy and solver/editor adapter. Both increments
stay local and unpublished; neither is full demo acceptance.

### Local numerical profile-center solve

The local `codex/assembly-profile-center-solver` increment follows `4cafa14`
with a dedicated two-profile numerical family, signed first-normal offset,
normal alignment and explicit rectangular quarter turns. Complete moving-frame
derivatives, mandatory uncertainty budgets and physical norm checks feed the
existing bounded solver. See the [contract](ASSEMBLY_PROFILE_CENTER_SOLVER.md)
and [validation](VALIDATION.md) for actual checked cases.

The later [saved lifecycle](ASSEMBLY_PROFILE_CENTER_MATES.md) supplies current
native-reference admission, authoring and persistence separately. The numerical
API alone grants none of that authority. These increments remain local and
unpublished; they are not complete demo acceptance.

### Local reusable assembly import

The local `codex/assembly-subassembly-import` increment follows `3fccb16` and
adds v2 assembly sources to **Importar componente**. Composition preserves
root metadata, dependency definitions, local occurrence paths and mate roles.
Identical exact definitions are reused, while conflicting payloads, cycles and
budget overflows reject atomically. The parent's document/file identity is
retained. A file ticket captures the insertion scope and rejects stale replies.

The [import contract](ASSEMBLY_COMPONENT_IMPORT.md) separates declaration
composition, native scene building, mate solve and editor history/file evidence.
The original fixed-plane multibody fixture checks an imported group's rotated
and translated bounds, reuse and declaring-frame relations. Windows x64 checks
passed 7,243 unit/CAD cases, 50 IPC/security checks, build, smoke, the general
assembly workflow and the extended import/save/inspection workflow. Actual
scope and tolerances belong in [validation](VALIDATION.md). External-format structural
interchange, linked sources, configurations, flexible assemblies, remaining
Width modes and full assembly/demo acceptance remain open. This increment
remains local and unpublished.

### Local grouping with selection and exclusions

The local `codex/assembly-grouping-scope` increment follows `ceb02e9` and
combines grouping with all three inspection scopes and exact exclusions.
Group identity remains the first segment of each original full occurrence
path. Partial selection never creates a new group root; excluding one leaf
does not exclude its whole root group. The existing pair predicate, saved
documents, solver and native geometric operations are unchanged.

The [grouping contract](ASSEMBLY_INTERFERENCE_GROUPING.md) and new original
four-leaf multibody fixture define the policy and independent geometric
oracles. Windows x64 validation passed 7,217 unit/CAD cases, 50 IPC/security
checks, build, smoke, the new nine-report workflow and three existing
interference workflows. Consult [validation](VALIDATION.md) for tolerances and
actual source-specific scope.
This increment supersedes the scope restrictions described for the earlier
local grouping increments below. Union volumes, flexible assemblies,
continuous collision and the complete assembly/demo requirements remain open.
The change remains local and unpublished.

### Local grouping with internal bodies

The local `codex/assembly-grouping-multibody` increment follows `e31e313` and
admits internal-body inclusion alongside complete-root grouping. Grouping
omits pairs sharing a root occurrence while both booleans retain their requested
values. Turning grouping off restores the internal pairs. Saved documents,
history, solver and native geometric operations are unchanged.

The [grouping contract](ASSEMBLY_INTERFERENCE_GROUPING.md) and original reused
two-body fixture distinguish original pair identities from geometric unions.
The dedicated production-renderer case checks six, four and six restored pairs;
consult [validation](VALIDATION.md) for actual source-specific results. Selected
scopes and exclusions were not admitted by this earlier increment. The later
local grouping-scope increment above extends them. Continuous collision and the
complete assembly demo remain required work. This increment remains local and unpublished.

### Local root-subassembly grouping

The local `codex/assembly-interference-grouping` increment follows `f49ddb6e`
and adds an optional [root-only grouping policy](ASSEMBLY_INTERFERENCE_GROUPING.md)
to static body-pair inspection. It preserves full leaf/body identities and
distinguishes reused occurrences. Default inspection remains ungrouped.
The original production-renderer case checks fifteen, nine and restored-fifteen
pairs; consult [validation](VALIDATION.md) for actual execution results.

Grouping with selected scopes or exclusions rejected in that source; the
later local grouping-scope increment above extends them. Union volumes, continuous collision and the
complete assembly demo remain required work. This local increment is not a
published or merged release.

### Local within-component interference inspection

The local `codex/assembly-interference-within-component` follow-up to
`ecf622e` adds an explicit temporary option to inspect distinct bodies of a
multibody part. Omission retains the previous different-component policy.
All and among-selected scopes can include internal pairs; selected-against-rest
still requires a pair crossing the component selection. Geometry, saved
declarations and history remain read-only.

The [scope contract](ASSEMBLY_INTERFERENCE_SCOPE.md) and original
[fixtures](PROVENANCE.md#within-component-interference-fixtures) define
the accepted policy and geometric oracles. A dedicated production-renderer
command is configured alongside the portable checks; configured CI does not
establish an executed platform pass. Actual source-specific results belong in
[validation](VALIDATION.md). The increment remains local and unpublished.
Further grouping combinations, union volumes, continuous collision and the full
assembly/demo requirements remain open.

### Local ordered plane placement primitive

The local `codex/assembly-width-placement` follow-up to `23fadaa` adds
four original ordered plane/ray intersections, signed scalar measurements,
complete moving-anchor derivatives and repeated/null owner handling. Its
open transversal chart has explicit direction/extent signs and precision
diagnostics. It adds no saved Width mode, native reference authority, solver
constraint or editor capability.

Source `5d1b2f5220f4c1d67f859140adc4b160261a5ab6` passed 7,160 unit/CAD
cases in 266 files, 50 IPC/security checks, build and production-loader smoke
on Windows x64. The [validation record](VALIDATION.md#ordered-plane-placement-primitive--2026-10-22)
and [contract](ASSEMBLY_PLANE_PLACEMENT.md) distinguish the 18 new numerical
cases from native CAD, persistence and editor acceptance. This local increment
remains unpublished; remaining Width modes, the 32 geometry/mode questions and
complete assembly/demo requirements remain open.

### Local directional and surface symmetry repair

The local `codex/assembly-symmetry-surface-repair` follow-up to `f91034d`
adds original LINE, plane, sphere, cylinder and explicit face-axis line-purpose
repair fixtures and separate production-renderer workflows. Source update and
all-occurrence replacement retain partial-role rejection, ready Cancel/retry,
authenticated Apply, history, saved reopening and fresh native verification.
The unchanged mirror has a separate prototype and is checked independently.

Source `dbf971befb0aae86b9d5917bc777619e8bb397ed` passed 7,142 unit/CAD
cases in 265 files, 50 IPC/security checks, build, smoke, all five new workflows
and both existing nested point-repair workflows on Windows x64. The
[validation record](VALIDATION.md#directional-and-surface-symmetry-repair--2026-10-22)
retains actual geometric bands, generic unequal-radius rejection, the
unequal-radius axis-purpose acceptance control and timeout history. Other-family
nested repair, broader correspondence/datums/contact and full assembly/demo
acceptance remain separate. This increment remains local and unpublished.

### Local reused nested point-symmetry repair

The local `codex/assembly-symmetry-nested-repair` follow-up to `bd86ac5`
adds actual point-repair evidence under two reused assembly ancestors. Selected
replacement isolates one leaf with two ancestor revisions and source-only
repair. Shared-source update repairs all three saved roles once without forks.
Both separate production-renderer cases retain ready Cancel/retry, authenticated
Apply, exact history/reopening and a separate suppressed-copy reactivation.
Production CAD, document syntax and editor code are unchanged.

Source `84a1ee778a32a1051b80efed4247edbc73c1d689` passed 7,142 unit/CAD
cases in 265 files, 50 IPC/security checks, build, real Electron smoke, both
new nested cases and existing root point-repair, selected/all replacement and
general assembly regressions on Windows x64. The
[validation record](VALIDATION.md#reused-nested-point-symmetry-repair--2026-10-22)
retains exact scope/role counts, native reflected-point/material oracles,
wrong-decision/token-revocation coverage, visual limits and integrity of
737 source/seven production files.

This is one point family with the specified reused/suppressed expansions, not
all nested repair or nested viewport picking. Other-family repair, general
naming/datums/contact and remaining Width modes/geometry retain their separate
requirements. This increment is unpublished; configured CI is not an executed
other-platform result, and the complete assembly demo remains pending.

### Local symmetry viewport reference selection

The local `codex/assembly-symmetry-viewport-selection` follow-up to `016a85e`
adds role-specific model picking for all five symmetry families and explicit
cylinder-face line-axis purpose. Material vertices use F64 camera projection,
conservative display occlusion/ambiguity and current-identity markers. Current
document/scope/generation/role tickets reject stale intent; native worker
verification and authenticated Apply remain the sole publication authority.

Source `35e9cc19ba358821e92aad7594cc3d2a387618ba` passed the complete
7,140-case suite in 264 files, 50 IPC/security checks, build, real Electron
smoke, the new six-case/24-pointer workflow and existing symmetry, point repair,
Width, rack/pinion and general assembly renderer regressions on Windows x64.
The [validation record](VALIDATION.md#symmetry-viewport-reference-selection--2026-10-22)
retains native bands, independent material/reflection oracles, the semantic
reference-order fix, frame-wait/deadline history, visual limits and integrity
of 728 source/seven production files.

This supplies actual selection evidence for the six original root cases;
nested/suppressed picking and other-family/nested repair remain separate work.
Approximate display visibility, unit perspective geometry and configured CI
establish no native visibility, product perspective mode, dense-scene capacity
or other-platform result. General naming/datums, contact, remaining Width/full
assemblies and the complete demo remain open. This increment is unpublished.

### Local material-point symmetry repair interaction

The local `codex/assembly-symmetry-repair-ui` follow-up to `af96d8a` adds a
production-renderer acceptance workflow for explicit source/target material
vertices and a native mirror face on three root owners. A shared-source update
and all-occurrence replacement check incomplete repair rejection/blocking,
ready Cancel/retry, authenticated Apply, exact history and saved reopening.
Original prism fixtures and direct reflected-point/material oracles remain
separate from worker report metadata. Production CAD and unit cases are unchanged.

Source `b9aa23d9c842ae285dc10d456100037f0e22d0ea` passed the complete
7,115-case suite in 262 files, 50 IPC/security checks, build, real Electron
smoke, the new point-repair workflow and existing five-family symmetry and
selected/all replacement regressions on Windows x64. The
[validation record](VALIDATION.md#material-point-symmetry-source-and-replacement-repair--2026-10-22)
records actual phase counts, partial-repair behavior, native tolerances,
final visual limits and integrity of 721 source/seven production files.

This supplies Electron repair evidence for this point-family root-owner case.
Other families and nested/suppressed repair, viewport vertex picking, broader
datum/reference producers, general persistent naming and contact-path acceptance
remain open. This increment is local and unpublished; configured CI establishes
no other-platform result. Full symmetry, remaining Width/assemblies and the
complete demo remain pending.

### Local saved/native three-reference symmetry

The local `codex/assembly-symmetry-native-documents` follow-up to `dad11a3`
adds strict saved source/target/mirror declarations for point, line, plane,
sphere and cylinder symmetry. Current native references, explicit per-trial
uncertainty and fresh independent physical checks gate the authenticated
preview. Source/replacement repair retains all three roles and exact material
vertices. The editor supports dropdown authoring/editing and saved reopening;
copied scene/report metadata grants no native or Apply authority.

Source `8dad94313406859fb7c581cc540668dcc682d91b` passed the complete
7,115-case suite in 262 files, 50 IPC/security checks, build, real Electron
smoke, five-family symmetry author/edit/history/reopen and existing general
assembly, Width and replacement renderer workflows on Windows x64. The
[validation record](VALIDATION.md#saved-native-three-reference-symmetry--2026-10-22)
records actual tolerances, uncertainty correction, free-pose oracle correction,
startup/capture fixes, final visual review and integrity of 716 source/seven
production files. These are local results; configured CI is not execution.

The [saved symmetry contract](ASSEMBLY_SYMMETRY.md) keeps support symmetry
separate from whole-component mirroring and finite contact. Electron symmetry
repair, viewport vertex picking, broader datum/reference producers, general
persistent naming and contact-path acceptance remain open. Native and helper/SSR
repair cases do not complete those editor requirements. This increment is
unpublished; full symmetry, remaining Width/assemblies and the complete demo
remain pending.

### Local independent native symmetry measurement

The local `codex/assembly-native-symmetry-measurement` follow-up to `19c9cc5`
adds strict standalone selection syntax and read-only native physical
measurement for point, line, plane, sphere and cylinder symmetry. Source,
target and mirror retain three actual roles and current snapshot authority.
Physical norm, angle and radius reports remain separate from constraint rows,
saved declarations and Apply authorization. Explicit first-order uncertainty
admission retains native tolerance and original placement-chain magnitudes;
it claims no physical angular metrology or formal error certificate.

Source `b6e216d05b080e6f8e4889149e292854ddacf223` passed 53 new cases in
three files, the complete 6,997-case suite in 255 files, 50 IPC/security checks,
build, real Electron smoke and existing assembly/Width renderer regressions on
Windows x64. The [validation record](VALIDATION.md#independent-native-symmetry-measurement--2026-10-21)
records actual tolerances, fresh three-role observations, precision/failure
rejection and source integrity. Existing renderer regressions establish no
symmetry picking, editor or history workflow.

Saved symmetry declarations and solver integration, repair/replacement,
preview/Apply/Cancel, editor selection and saved reopening remain required.
This prerequisite is local and unpublished. Full symmetry, remaining Width and
assembly requirements and the complete assembly demo remain pending.

### Local native vertex reference prerequisite

The local `codex/assembly-native-vertex-references` follow-up to `c870ac2`
adds conservative material-vertex identity from exact current primary face/edge
incidence, fresh native point/tolerance queries and separate snapshot point
authority. Explicit body identities and exact legacy aggregates remain distinct;
copied display/reference DTOs cannot recover private live-document-bound proof.
Optional vertex-catalog bounds do not invalidate otherwise usable body geometry.

Source `de852009641ce12c73192f5c02fb1c0fca5cea5d` passed 38 new cases in six
new files, the complete 6,944-case suite in 252 files, 50 IPC/security checks,
build, real Electron smoke and existing assembly/Width renderer regressions on
Windows x64. The [validation record](VALIDATION.md#native-vertex-reference-prerequisite--2026-10-21)
retains the restored budget-message compatibility checks, optional-capability
correction, exact limits and renderer scope. No viewport vertex selection or
symmetry interaction is established by those existing renderer workflows.

The [vertex contract](ASSEMBLY_VERTEX_REFERENCES.md) limits durability to the
verified current incidence and lineage; it claims no general vertex-v2 naming.
Saved point/symmetry mates, all five symmetry families' native/application
integration, uncertainty propagation, editor, history and source repair remain
required. This prerequisite is local and unpublished. Full symmetry, remaining
Width and assembly requirements and the complete assembly demo remain pending.

### Local numerical three-owner symmetry solver

The local `codex/assembly-symmetry-solver` follow-up to `a0c415e` integrates
all five numerical support families: point, line, plane, sphere and cylinder.
Source, target and mirror retain their actual moving, shared or fixed owners.
Target-local position and reflected-source normal charts include their full
derivatives; physical norm/angle checks, ownership-aware orientation seeds and
local projection remain separate from rank evidence and native authority.

Source `c518558` passed 31 new numerical cases, the complete 6,906-case suite
in 246 files, 50 IPC/security checks, build, real Electron smoke and existing
assembly/Width renderer regressions on Windows x64. The
[validation record](VALIDATION.md#numerical-three-owner-symmetry-solver--2026-10-21)
retains the initial line/cylinder rank failure, chart correction, final checks
and renderer limits. Those renderer runs establish no symmetry interaction.
The [contract](ASSEMBLY_SYMMETRY_GEOMETRY.md#numerical-solver-integration)
keeps native witnesses and uncertainty propagation, saved three-role mates,
serialization, repair, editor/history and application acceptance pending.
This increment is local and unpublished. Full symmetry, remaining Width and
assembly requirements and the complete assembly demo remain pending.

### Local numerical symmetry geometry

The local `codex/assembly-symmetry-geometry` follow-up to `5b880cb` adds
original reflection/comparison for five analytic entity families about a third
plane. Source, target and mirror keep their actual owner roles, including
repeated and fixed owners. Moving-plane derivatives, the attached source
frame, explicit direction branches and radius/precision diagnostics are
separate from native support authority.

Source `0ca380f` passed 34 new numerical cases, the complete 6,875-case suite
in 245 files, 50 IPC/security checks, build and real Electron smoke on Windows
x64. The [validation record](VALIDATION.md#three-owner-analytic-symmetry-geometry--2026-10-21)
records exact tolerances and the unchanged production output: this mathematical
module is not a new usable command. All five families still need native
references, strict saved three-role declarations, solver/projection integration,
fresh independent checks, repair and editor/history acceptance described in
the [contract](ASSEMBLY_SYMMETRY_GEOMETRY.md). This increment is local and
unpublished. Full symmetry, the remaining Width and assembly requirements and
the complete assembly demo remain pending.

### Local centered-width viewport selection

The local `codex/assembly-width-viewport-selection` follow-up to `9e162b4`
adds a model-picking button for each of the four ordered plane roles, advances
to the next empty role and permits reselection while editing. Current visible
scene entries and document/scope/generation tickets keep stale display data
out of the proposal; native preview and Apply authority remain separate.

Source `d083c72` passed 6,841 cases in 244 files, 50 IPC/security checks,
build, real Electron smoke and the Width renderer workflow with 80 recorded
checks on Windows x64. Four actual face clicks author the relation and one
same-face editing click closes its active role. Contact-stop, rejection,
history and Save As/reopen remain checked. The
[validation record](VALIDATION.md#centered-width-viewport-selection--2026-10-21)
separates the visible positive-X/sum case from failed hidden-window orbit
experiments and prior signed-plane cases. This increment is unpublished.
Other modes, general eligibility and interaction, all 32 geometry/mode
questions and complete assembly acceptance remain required. The full assembly
demo is not ready.

### Local centered-width translation until contact

The local `codex/assembly-width-contact-translation` follow-up to `49f4424`
admits centered four-plane Width in the existing straight, constant-rotation
contact-stop operation. Fresh native endpoint snapshots preserve the four local
supports, anchors, source identities, tolerances and world rotations. The
explicit affine-offset argument and existing conservative distance tracer
keep that admission separate from general rotation or exact contact claims.

Final source `4ca5503` passed 6,830 cases in 244 files, 50 IPC/security checks,
build, real Electron smoke and the extended Width renderer workflow with
72 recorded checks on Windows x64. Actual controls exercise stopped preview,
Cancel, Apply and Undo alongside the existing edit/save/reopen sequence.
The [validation record](VALIDATION.md#centered-width-rectilinear-contact-stop--2026-10-21)
retains the failed free-position assertion, corrected fixture, numerical bands
and visual limits. This increment is unpublished. Other modes, cylinder/axis
behavior, all 32 geometry/mode acceptance questions and the full assembly demo
remain required. No full assembly requirement is newly completed.

### Local centered-width movement and geometric repair evidence

The local `codex/assembly-width-motion-evidence` follow-up to `ce3c567`
checks native strict movement versus local target projection, all three
actual rotation station candidates, real source widening with four repaired
faces, and a wider selected replacement whose independent result is X=-1 mm.
Four free oblique owners retain their common rigid gauge and verified local
rank. This adds seven tests and strengthens an existing one; runtime code,
saved format and solver policy are unchanged.

Source `65b803f` passed 6,817 cases in 243 files, 50 IPC/security checks,
build and real Electron smoke on Windows x64. The
[validation record](VALIDATION.md#centered-width-movement-and-geometric-repair--2026-10-21)
separates these native/numerical cases from prior renderer evidence. This
increment is unpublished. Contact-stop still rejects Width here; other modes,
cylinder/axis behavior, broader acceptance and the complete assembly demo
remain required. No full assembly requirement is newly completed.

### Local saved and native centered width

The local `codex/assembly-width-centered-documents` branch connects four
original plane references to strict saved declarations, grouped repair, native
resolution and independent physical final checks. The editor offers four
plane selectors, explicit bisectors/alignment and a current verified report.
Preview/Apply, cancellation, history and reopening retain the grouped intent.
The [contract](ASSEMBLY_WIDTH.md) keeps this Centered plane subset separate
from the complete Width requirement.

Final source `01a9a22` passed 6,810 unit/CAD cases, 50 IPC/security checks,
build, smoke, the new Width desktop workflow (46 recorded checks) and the
existing assembly desktop workflow (526 recorded checks). The
[validation record](VALIDATION.md#saved-and-native-centered-width--2026-10-21)
retains the failed capture assumption, actual tolerances and visual limits.
This local Windows x64 increment is unpublished. Other modes, cylinder/axis
tab behavior, general branch/flip policies and remaining lifecycle/movement
acceptance stay required. The full 32-question matrix and assembly demo gate
remain open; no full assembly requirement is newly completed.

### Local numerical centered-width solver

The local `codex/assembly-width-centered-solver` follow-up integrates four
original plane supports into a separate numerical constraint. It preserves
all four owners in the solve graph, accumulates repeated ownership, checks
the actual bisector angle and anchored offset, and supports generic local
target projection. Plane placement stays in the normalized solve frame.
The [contract](ASSEMBLY_WIDTH_GEOMETRY.md#numerical-centered-solver) separates
this capability from a saved Width relation and native reference authority.

Implementation `cfbb679` passed 24 new numerical cases, the full 6,778-case
unit/CAD suite, 50 IPC/security checks, build, production-loader smoke and
the existing assembly desktop workflow (526 recorded checks) on Windows x64.
The [validation record](VALIDATION.md#numerical-centered-width-solver--2026-10-21)
retains the initial overstrict pose assertion and the exact evidence limits.
Saved schema/native binding, other modes, source repair, history and actual
Width editor interaction remain required. All 32 geometry/mode questions
remain open to complete acceptance. This increment is local and unpublished,
does not complete an assembly requirement and does not open the demo gate.

### Local ordered plane-bisector geometry

The local `codex/assembly-width-geometry` follow-up adds original numerical
geometry for two ordered plane groups, retaining all four references and
their owner derivatives. Repeated owners accumulate; fixed-frame references
add no owner columns. Its anchored comparison includes the moving reference
frame so a common rigid motion has no artificial effect away from a solution.
The [contract](ASSEMBLY_WIDTH_GEOMETRY.md) separates this building block from
the complete width relation and retains all 32 geometry/mode questions.

Implementation `19119df` passed 26 original numerical geometry cases, the full
6,754-case unit/CAD suite, 50 IPC/security checks and build on Windows x64.
The [validation record](VALIDATION.md#ordered-plane-bisector-geometry--2026-10-21)
states tolerances and separates this numerical result from native and editor
coverage. Saved Width declarations, native resolution, mode/branch admission,
all-owner solving and lifecycle/editor integration remain required. This
local increment is unpublished and does not open the assembly demo gate.

### Local saved-mate endpoint inventory

The local `codex/assembly-mate-endpoints` follow-up centralizes saved reference
enumeration and lookup for source updating and component replacement. It
preserves fixed-scope null carriers and uses the worker's pending inventory to
bound replacement repairs. The saved format and geometric equations are
unchanged. A new native regression replaces all three owners of a directed stop
with taller original drilled prisms and explicitly repairs its two caps and
LINE guide, including rejection, history and serialized reopening.

Source `d3e51c0` passed 6,728 unit/CAD cases, 50 IPC/security checks, build,
production-loader smoke, the composed directed-stop desktop workflow
(309 checks / 58 phases) and component replacement (86 checks / 19 phases).
The [validation record](VALIDATION.md#shared-saved-mate-endpoint-inventory--2026-10-21)
separates the added native case from existing desktop coverage. This result is
local Windows x64 evidence and unpublished. Width and other multi-reference
relations still require their geometry, native resolution, solver and editor
implementation; no assembly requirement is newly completed and the complete
demo gate remains closed.

### Local directed-stop shared-guide repair

The local `codex/assembly-directed-guide-repair` follow-up verifies actual
shared-source updating of a directed stop with two native top caps and an
explicit LINE guide. It rejects missing repairs, accepts three explicit
current references, cancels a ready proposal, retries with a new revision,
then applies, undoes/redoes and saves/reopens. The guide field now explains
rechecking the three directions and arc instead of unrelated capture.
Source `4bdbd6a` passed build, smoke and the composed desktop workflow:
309 checks / 58 phases, retaining the six earlier pointer drags.
The full suite passed 6,727 unit/CAD cases and 50 IPC/security checks.
No new unit/CAD cases were added.
The [validation record](VALIDATION.md#directed-circular-stop-shared-guide-source-repair--2026-10-21)
retains both failed harness assumptions and precise geometric limits.
This local, unpublished Windows x64 result establishes one manual source
repair case; it does not complete a requirement, general guide/replacement
coverage, width/symmetry relations or the full assembly/demo gate.

### Local directed circular stop pointer follow-up

The dependent local `codex/assembly-directed-angle-gestures` branch adds six
actual hidden Chromium rotation gestures to the existing original fixture:
both stops, inward release, zero crossing, Cancel/Apply, history and Save
As/reopen. Harness source `0973da7` passed build, production-loader smoke and
the expanded desktop workflow (220 checks / 43 phases / six drags).
The full suite passed 6,727 unit/CAD cases and 50 IPC/security checks. This
increment adds no product behavior or unit/CAD cases. The
[validation record](VALIDATION.md#directed-circular-stop-pointer-projection--2026-10-21)
separates ideal-input precision from output accuracy against the actual
posted input and retains both failed oracle attempts. Results remain local
Windows x64 evidence and unpublished. No assembly requirement is newly
completed; broader guide/editor and mechanism cases and the complete
assembly/demo gate remain open.

### Local directed circular stops

The dependent local `codex/assembly-directed-angle-stops` branch adds an
inclusive directed arc with two directions and an explicit guide. The
[contract](ASSEMBLY_DIRECTED_ANGLE_STOPS.md) defines crossing zero, scalar equal
stops, full circles, strict sampled motion, projection and finite-precision
rejections. Existing principal-angle files keep their original meaning.
Native reconstruction, authenticated authoring/editing, guide repair and
history/persistence are connected. Production source `769e000` passed 6,727
unit/CAD cases and 50 IPC/security checks. Final source `5bd217d` changes only
the desktop test's placement oracle; it passed build and five Electron
commands with identical production bundles. The
[validation record](VALIDATION.md#directed-circular-angle-stops--2026-10-21)
distinguishes exact sources, failures and coverage boundaries. This increment
is local and unpublished. At that increment, Width, symmetry and
path/profile-center relations still required their later integrations.
Accumulated-turn stops and broader assembly acceptance remain open; this does
not open the complete assembly demo gate. Later entries above record the
bounded Width, symmetry and profile-center implementations.

### Local directed angular measurement

The dependent local `codex/assembly-directed-angle-measurement` branch adds a
read-only circular measurement from two current directions and an explicit
guide. Its [contract](ASSEMBLY_DIRECTED_ANGLE_MEASUREMENT.md) separates projected
measurement from saved principal-angle bounds and future directed rotation
stops. Native references and a separate worker operation feed three selectors;
the report does not change a document, add history or grant Apply authority.
Source `dc746b473eb069076483174f1878e348800320a8` passed 6,527 unit/CAD cases,
50 IPC/security checks, build and the standard, directed-measurement and
principal-angle desktop workflows on Windows x64. The
[validation record](VALIDATION.md#directed-angular-measurement--2026-10-21)
retains failed attempts, tolerances and interaction limits. This increment
remains unpublished; configured CI is not hosted execution. It does not
complete an assembly requirement or open the full assembly demo gate.

Latest reconciliation: 2026-10-15, 14:46 UTC. The default branch remains
`43c7573c688b35a0bb70a0206416fff17ae298cd` (application version 0.19.0).
Open pull requests are unmerged proposals; refresh their actual base/head and
commit-specific checks before an integration decision.

## Current queue

Exactly two pull requests were open at reconciliation:

| Pull request | State and exact head | Review status |
| --- | --- | --- |
| [#44](https://github.com/angelcp2802/solidflow/pull/44) | Ready for review; `80f595f8ce58326b678ef0a6864f67fe41eedb3e`, based on current `main` | Single integration proposal combining the reviewed CAD stack, governance, public process isolation and saved UntilNext regeneration. Six required checks passed on this head. It remains unmerged. |
| [#35](https://github.com/angelcp2802/solidflow/pull/35) | Draft; `0a0ab22a0cd0b6295b9ff7c5761398b1ae457a4a`, based on current `main` | Separate desktop outcome/cleanup proposal. Its macOS crash remains unresolved; it is not included in #44. |

The thirteen superseded proposals #27, #29, #31, #33, #34, #36, #37, #38,
#39, #40, #41, #42 and #43 are closed. Their exact heads are ancestors of #44;
closure did not merge them into `main` or delete their branches, discussions,
check histories or retained failures. Review the combined change in #44 rather
than reopening duplicate integration lanes. Keep one active integration
proposal while that review is pending.

### Published UntilNext increment

The focused local branch `codex/saved-until-next-regeneration` adds actual
per-owner UntilNext resolution for selected Cut/Add and cut ALL. Tested source
`12c5ecbeae1f5ec1782cbd008b3871fb352603c0` passed 477 focused tests,
2,492 full unit/CAD tests, 32 IPC tests, build and all four desktop commands on
Windows x64. The new scripted desktop workflow covers preview/Apply/save/reopen
and rejected-edit preservation. Its
[source-specific validation](VALIDATION.md#saved-untilnext-regeneration--2026-10-15)
retains the earlier failed attempts, geometric tolerances and interaction limits.
This increment was subsequently published in #44 at `80f595f8`; the final
commit only updates documentation relative to the locally tested source above.
Six checks passed on that exact published head. The
[desktop CI run](https://github.com/angelcp2802/solidflow/actions/runs/38745801092)
passed its configured Windows x64, macOS arm64 and Linux x64 jobs; the
[security run](https://github.com/angelcp2802/solidflow/actions/runs/38745800946)
passed CodeQL and the high/critical audit threshold. The audit still reports
eight moderate dependency entries. Successful configured cases and packaging
do not establish general platform support or an installed, signed release.

### Local assembly foundation

The focused `codex/assembly-document-graph` branch starts from `80f595f8` for
[issue #45](https://github.com/angelcp2802/solidflow/issues/45). It proposes
embedded assembly definitions, reusable occurrences, rigid poses, repairable
scoped references and an independently owned native body-placement helper.
The [contract](ASSEMBLIES.md) separates graph, native references, local mate
solving and editor integration. Validation belongs to its own source-specific
record; #44's checks do not validate this new local code. No extra assembly PR
has been opened. The early foundations kept the Assembly entry disabled.

Local source `fdf0746a28124aae1c9276c9f93c6709b2ddcb3d` passed 148 new focused
tests, 2,640 full unit/CAD tests, 32 IPC checks, build and standard desktop smoke
on Windows x64. Its [validation record](VALIDATION.md#assembly-graph-and-rigid-placement-foundation--2026-10-15)
retains the first TypeScript failure and limits these results to document,
placement and existing desktop smoke behavior. That tested source did not
implement mate solving or assembly interaction.

The later local native-reference/numerical increment is validated at
`b17853909a2f86129f94a97c2c8295b5ff4f9496`: 294 focused tests, 2,786 full
unit/CAD tests, 32 IPC checks, build and all four existing desktop commands
passed on Windows x64. It adds authenticated native plane/cylinder sessions,
complete-document freshness, face cleanup guards and direct numerical SVD.
Its [source-specific record](VALIDATION.md#native-assembly-references-and-numerical-foundation--2026-10-15)
retains failed attempts and separates part UI regression from actual assembly
interaction. That tested source did not implement simultaneous mate solving.
The subsequent local rigid solver, authenticated preview/Apply and bounded
editing/history increment is validated at
`9173605598a6af23d86d1627b7e8f81b211ddcd7`: 495 focused tests, 2,987 full
unit/CAD tests, 32 IPC checks, build and standard desktop smoke passed on Windows
x64. Its [source-specific record](VALIDATION.md#rigid-assembly-solver-and-atomic-history--2026-10-15)
retains the gauge-rank correction and earlier TypeScript failure. Original
plate/two-pin cases, local DOF/conflict evidence and explicit source repair
were separate from the then-disabled editor, without assembly-worker/file
routing or additional PR/new hosted/platform evidence.

The local workspace increment is validated at
`18cd892846ebf7db9ecde3d0884fe26b91860794`: 595 focused tests, 3,087 full unit/CAD
tests, 41 IPC/security checks, build and all five desktop commands passed on
Windows x64. It connects a separate rigid assembly workspace, native scene/worker
authority, committed recovery and v2 file IPC. The original scripted renderer
case creates four face relations, captures one spin lock, performs six Apply
operations, saves/reopens and rejects a contradictory offset without changing
the committed file. Its [source-specific record](VALIDATION.md#rigid-assembly-workspace-and-document-routing--2026-10-15)
separates native geometry, transport, scripted interaction, close callbacks and
visual review. Flexible instances, automatic source correspondence, motion,
interference and structural exports remain outside this initial editor path.
The branch remains local and unpublished, with no additional PR, new hosted CI
or macOS/Linux result. Issue #45 retains the full acceptance scope.

The dependent local `codex/assembly-source-updates` branch adds shared part
revision review and explicit reference repair. Source
`685d7cd9389c52fd19650d397718e1c4e0e7417a` passed 672 focused tests, 3,164 full
unit/CAD tests, 41 IPC/security checks, build and all five desktop commands on
Windows x64. Native correspondence is limited to the exact verified finite
entity-prism semantic family; ordinal faces require explicit selection. The
scripted desktop case updates both pins from radius 2 to 2.5, cancels/reviews,
rejects unrepaired references, repairs four actual faces, applies, undoes/redoes
one transaction and saves/reopens. Its [validation record](VALIDATION.md#assembly-part-source-revisions-and-reference-repair--2026-10-15)
retains the free-motion test-oracle correction and separates native support,
UI, transport and file evidence. The branch remains unpublished; broad automatic
correspondence, external linked-source recovery and the remaining issue #45
modules are still required. No additional PR or hosted/platform result is claimed.

The dependent local `codex/assembly-interference` branch adds static native
body-pair interference and clearance inspection. Source
`f76baed853d5b6225d278f1020f24314dc4d020f` passed 750 focused tests, 3,242 full
unit/CAD tests, 41 IPC/security checks, build and all five desktop commands on
Windows x64. The scripted assembly workflow preserves its earlier relations,
source revision/repair and file steps, then checks two 0.5 mm clearances, a
narrower threshold and one original two-box Common volume of 12 mm3. Reports
are read-only and contain no Apply authority. Its [validation record](VALIDATION.md#assembly-native-interference-and-clearance--2026-10-15)
retains the first script-encoding failure and distinguishes native geometry,
rendering, transport and scripted controls. This branch remains local and
unpublished. Continuous collision, intra-component body pairs, subassembly
grouping, flexible motion and the remaining issue #45 scope are still required;
no new PR, hosted CI, installed-package or platform result is claimed.

The dependent local `codex/assembly-constrained-movement` branch adds numeric
component movement checked against the active saved relations. Source
`da7abd8323a7ea67577a02409c5f079417c87b39` passed 830 focused tests, 3,322 full
unit/CAD tests, 41 IPC/security checks, build and all five desktop commands on
Windows x64. A selected component has a temporary solve anchor; Apply saves its
verified pose without adding a fixed flag or lock. The scripted case rotates
the revised right pin locally by 90 degrees, cancels/applies, restores natural
one-DOF mobility, undoes/redoes, saves/reopens and rejects a lateral target.
Its [source-specific record](VALIDATION.md#constrained-assembly-component-movement--2026-10-15)
separates actual native material probes, SSR/transport, scripted controls and
the final collision capture. This branch remains local and unpublished;
pointer dragging, continuous paths/collision stopping, flexible instances and
the remaining issue #45 scope are still required. No new hosted/platform or
installed-package result is claimed.

The dependent local `codex/assembly-pointer-drag` branch adds actual viewport
pointer input with native world-target verification. Source
`f6af53ba9c923cbc5cd992133255c3403593c9db` passed 901 focused tests, 3,393 full
unit/CAD tests, 41 IPC/security checks, build and all five desktop commands on
Windows x64. A nested selection drives its root rigid occurrence; shared local
definitions remain unchanged by that world movement. The scripted pointer case
checks rotation, Cancel/Apply, single Undo/Redo, save/reopen and rejection of
incompatible X translation. Its [validation record](VALIDATION.md#constrained-world-and-pointer-assembly-movement--2026-10-15)
separates native rigid-group geometry, controlled stream lifecycle, actual
Chromium pointer input and the inspected top-view manipulator capture. It remains
local and unpublished, without new PR/hosted CI or installed/macOS/Linux result.
Trajectory projection, continuous collision stopping, flexible subassemblies,
advanced mates, BOM/configurations and the remaining issue #45 scope are open.

The dependent local `codex/assembly-constrained-drag` branch projects pointer
intent onto the saved mechanism's available motion, with position/orientation
priorities and pointer deviation separated from hard relation errors. Source
`7b967be60a5de86a8e038199bb6be09850e1af01` passed 1,002 focused tests, 3,494 full
unit/CAD tests, 41 IPC/security checks, build and all five desktop commands on
Windows x64. Native slider, offset-hinge, nested-scope and coupled-group cases
retain their natural DOF without a pointer anchor. Actual diagonal XZ pointer
input slides the revised pin only along its axis; Cancel/Apply, Undo/Redo,
separate Save As/reopen and unchanged original-file restoration pass. The
[execution record](VALIDATION.md#local-constrained-assembly-drag-projection--2026-10-15)
retains the TypeScript test-construction failure and the three hinge convergence
failures that led to sufficient-descent selection. This branch remains local
and unpublished. Discrete local projection does not establish warm-start path
continuity, a global nearest placement, collision stopping or complete assemblies;
flexible instances and the remaining issue #45 scope are still required.

The dependent local `codex/assembly-translation-contact-stop` branch adds the
separate **Trasladar hasta contacto** command. It checks native distances along
straight constant-rotation translation, including obstacles between clear
endpoints, and retains a measured numerical safety gap. Source
`52b9f0fe9bdc1d0099b9ab2526b6b16ee616e93d` passed 1,108 focused tests, 3,600 full
unit/CAD tests, 41 security/IPC checks, build and all five desktop commands on
Windows x64. The new real renderer workflow checks stopped and clear targets,
requested clearance, Cancel, Apply, one Undo/Redo, separate Save As/reopen and
a rejected near-contact continuation. The [execution record](VALIDATION.md#rectilinear-assembly-translation-with-contact-stop--2026-10-15)
retains an unproven tight-deflection expectation and a TypeScript observation
test failure, alongside the final passing evidence. No production tolerance,
dependency, worker-pool or deadline was changed to pass them. This remains
local and unpublished. Rotary/curved paths, motion from initial contact,
pointer collision stopping, flexible instances, advanced mates, BOM and the
remaining complete assembly/CAD scope are still open.

The dependent local `codex/assembly-bom` branch adds three declaration-based
bill-of-materials views, exact revision/context quantities, full-path member
selection and bounded CSV export of the confirmed document. Source
`5d1abdf45d11dd8107aba82f56f4ff6b36c2a1a4` passed 1,214 focused tests, 3,706 full
unit/CAD tests, 50 security/IPC checks, build and all five desktop commands on
Windows x64. The real renderer checks reused/hidden/suppressed occurrences and
two revisions with equal names, one cancelled native export and three exact
CSV files, without editing the document/history or requesting another CAD build.
The [execution record](VALIDATION.md#assembly-bill-of-materials-and-csv--2026-10-16)
retains the initial TypeScript test-factory failure. The [BOM contract](ASSEMBLY_BOM.md)
separates declaration counts and literal-text CSV from native geometry, material
and mass. This remains local and unpublished. Configurations, custom purchasing
metadata, promoted child policies, drawing-attached tables and the remaining
complete assembly/CAD scope still require implementation and evidence.

The dependent local `codex/assembly-gear-mate` branch adds a native angular
gear coupling with an explicit carrier, positive real ratio, direction, phase
and saved lifted angles. Tested source
`59607bb75ba31b16d341df91e91a6f85b72f4e45` passed 1,319 focused cases, 3,811 full
unit/CAD cases, 50 security/IPC checks, build and all five desktop commands on
Windows x64. The new real-renderer stage captures two actual cylinders,
checks linked spins including a follower beyond a half turn, Cancel/history,
parameter editing, suppression/reactivation, Chromium input and native
save/reopen. The [execution record](VALIDATION.md#gear-relations-and-lifted-angular-state--2026-10-16)
retains the build/scope failures and corrected fixture convention. The
[gear contract](ASSEMBLY_GEARS.md) separates native-axis signs, saved branches,
inactive unavailable references and quaternion targets from unrestricted winding
drivers. This remains local and unpublished. Continuous multi-turn gestures,
explicit winding intent, other mechanical mates, flexible assemblies and the
remaining complete CAD scope still require implementation and evidence.

The dependent local `codex/assembly-angular-drive` branch adds explicit signed
numeric rotation with whole turns, bounded verified stations and one final
authenticated preview/history transaction. Tested source
`070403b11c66f9cfae9be9c50b95915f08069f79` passed 1,445 focused cases,
3,937 full unit/CAD cases, 50 security/IPC checks, build and all five desktop
commands on Windows x64. The real renderer verifies +720 degrees, Cancel,
repeat/Apply, one Undo/Redo, input reset, native save/reopen and rejection of
an incompatible full X turn. The [execution record](VALIDATION.md#explicit-numeric-angular-motion--2026-10-16)
retains the typing, native memory and 2:1 precision failures, alongside their
repairs and the unchanged public tolerances. The [motion contract](ASSEMBLY_MOTION.md)
separates explicit winding, internal numerical refinement and sampled station
checks from continuous feasibility or collision prevention. This remains local
and unpublished; continuous multi-turn gestures, rotary collision stopping,
other mechanical mates, flexible assemblies and the remaining full CAD scope
still require implementation and evidence. No new PR or hosted/platform result
is claimed.

Complete assemblies, technical drawings, sheet metal, simulation, broader interoperability
and the remaining recipe/reference/lifecycle policies are still required work.
Neither this local increment nor the integration proposal completes the CAD
application or establishes general platform support.

The dependent local `codex/assembly-screw-mate` branch adds native coaxial screw
capture, positive mm-per-turn lead with reciprocal input and reverse, relative
lifted rotation, component-origin travel, editing/suppression, history and
version-2 persistence. Source `1fb63fb44688599b02a9d7635f4979a28470fa30`
passed 1,556 focused cases, 4,048 full unit/CAD cases, 50 IPC/security cases,
build and all six desktop commands on Windows x64. Its original renderer flow
checks +720-degree Cancel/repeat/Apply, one Undo/Redo, translation-driven spin,
parameter changes and native Save As/reopen. A subsequent test-only increment,
`a98fae3c6cf05ee4e8354a35f3e4762218d90001`, adds a simultaneous gear/screw
mechanism and passed all 35 native screw cases, 4,049 full unit/CAD cases,
50 IPC/security cases, build and standard desktop smoke. All eight production
file hashes remain identical to the six-command desktop run; only the native
test file changed between the tested sources. The
[validation record](VALIDATION.md#screw-relations-and-combined-mechanisms--2026-10-16)
retains the first type-check failure and separates actual native, numerical,
rendered, file and visual evidence. The [contract](ASSEMBLY_SCREWS.md) distinguishes
coaxial alignment from reverse, component-origin travel from arbitrary cylinder
origins, and millimeter error from angular accuracy. This remains local and
unpublished, with no new PR/hosted CI/macOS/Linux execution or installed release.
Other mechanical mates, flexible instances, continuous collision, full assembly
acceptance and the remaining complete CAD scope are still required work.

The dependent local `codex/assembly-rack-pinion` branch adds native
pinion-cylinder coupling to an exact rack LINE edge or cylinder axis, with
native-radius defaults, diameter/travel overrides, signed winding and explicit
edge picking/repair. Its [contract](ASSEMBLY_RACK_PINION.md) and original fixture
retain separate guide constraints and do not imply teeth or contact physics.
Source `c0ba5c21d90c6727f24ee64dcd4b303682c1f9b4` passed build, 1,797 focused
cases in 64 files, 4,264 full unit/CAD cases in 201 files, 50 IPC/security cases
and all seven desktop commands on Windows x64. The rack renderer flow passed
27 phases, eleven Apply operations, one actual Chromium edge-pointer selection
and Save As/reopen. Native reference-only rebuilds retain full geometric
reconstruction while omitting final visual tessellation; final scene construction
still precedes preview/Apply authority. The
[validation record](VALIDATION.md#rack-and-pinion-relations-and-native-reference-rebuilds--2026-10-16)
retains the earlier timeouts and test-oracle failures, exact source and physical
limits. No deadline, station count or production tolerance was relaxed.
The grouped assembly PR description is prepared locally but has not been
published; no new remote state, hosted CI or platform result is claimed.
Flexible instances, configurations, remaining mate/reference families,
linked-source recovery, continuous collision and structural interchange remain
required. Full assembly acceptance and the user's demo gate are not complete.

The dependent local `codex/assembly-flat-export` branch adds
committed assembly geometry export as flat STEP and binary STL. Its
[contract](ASSEMBLY_EXPORT.md) includes hidden active components, excludes
suppressed branches, applies full nested placements once and preserves
coincident solids without Fuse. Geometry export does not preserve hierarchy,
definition reuse, mates or editable history. Source
`05d39819f57024b4c849cff878791d266e3ee1a0` passed build, 1,883 focused cases in
67 files, 4,350 full unit/CAD cases in 204 files, 50 IPC/security cases and all
eight desktop commands on Windows x64, with zero drift across 562 source inputs.
The export workflow passed cancellation, six independently checked STEP/STL
files, rename, Undo/Redo and Save As/reopen. Its original seven-solid fixture
checks nested placements, hidden and suppressed branches and coincident copies;
a separate native case checks two solids within one legacy body entry. See the
[validation record](VALIDATION.md#flat-assembly-geometry-export--2026-10-16) for
tolerances and retained failures. This is local, unpublished evidence; structural
STEP, broader interoperability, installed packages and macOS/Linux execution
remain unverified. The complete assembly scope and demo gate remain open.

The dependent local `codex/assembly-direction-mates` increment adds
explicit parallel and perpendicular relations for the currently admitted planes,
cylinder axes and native LINE edges. Its
[contract](ASSEMBLY_DIRECTION_MATES.md) distinguishes mixed plane/direction
semantics, signed collinear branches and direction-only freedom from coincidence
or concentricity. Source `a7d99eafc101ca0bd9f8e87949a2116f98b04b88` passed all
twelve local commands on Windows x64: build, 2,171 focused cases, 4,638 full
unit/CAD cases, 50 IPC/security cases and all nine desktop commands. Every
command preserved all 572 public source inputs. The new desktop workflow
recorded 36 phases, thirteen Apply actions, one actual LINE pointer selection
and Save As/reopen. The [validation record](VALIDATION.md#parallel-and-perpendicular-assembly-relations--2026-10-16)
retains the first build failure, the preceding passing source and a separate
editor-state correction identified by static review. These bounded results
remain local and unpublished; complete assembly acceptance and the demo gate
remain open.

The dependent local `codex/assembly-tangent-plane-cylinder` increment implements
the [plane/cylindrical-surface tangent contract](ASSEMBLY_TANGENT_MATES.md).
It uses a distinct surface purpose, explicit plane-oriented side and separate
native support-normal evidence. Its two equations constrain infinite supports,
without claiming finite trimmed-face contact or absence of body overlap. Source
`f4cd14ab9952a17498b79e44c974e847b7b2816c` passed all thirteen local commands
on Windows x64: build, 2,427 focused cases, 4,894 full unit/CAD cases,
50 IPC/security cases and all ten desktop commands. Every command preserved
all 583 public source inputs. The new workflow recorded 24 phases, seven Apply
actions, one actual cylindrical-face pointer selection and Save As/reopen.
The [validation record](VALIDATION.md#plane-and-cylindrical-surface-tangency--2026-10-16)
retains three preceding failed attempts and a separate passing workflow probe.
These results remain local and unpublished. Other tangent pairs and complete
assembly acceptance remain required; the demo gate stays closed.

The dependent local `codex/assembly-cylinder-tangent` increment implements
the [cylinder surface tangency contract](ASSEMBLY_CYLINDER_TANGENCY.md): separate
regular nonparallel and explicitly parallel families, exact surface references,
external/internal branch and declared larger-radius role. Infinite support
relations do not establish finite contact, containment, rolling or absence of
solid overlap. Corrected source `e5c541482fde781f9ca059734b41cf07ec7eb6dd`
passed all fourteen local commands on Windows x64: build, 2,777 focused cases
in 77 files, 5,244 full unit/CAD cases in 214 files, 50 IPC/security cases and
all eleven desktop commands. Every command preserved all 594 source inputs.
The new workflow completed both original documents, 52 registered phases,
sixteen authenticated Apply actions, two native-face pointer selections and
two Save As/reopen cycles. Registered phases exclude ordinary committed-scene
rebuilds that Cancel can initiate.

An earlier full attempt failed its final workflow on numerical rank uncertainty
when adding a compatible parallel relation. The correction refines only
certified singular modes under existing budgets and must certify the complete
fresh Jacobian before accepting poses. The [validation record](VALIDATION.md#cylinder-surface-tangency--2026-10-16)
preserves that failure, its diagnostic probe and the corrected preflight/full
results. These results remain local and unpublished. Other tangent surfaces,
cylindrical degenerations/transitions, full assembly acceptance and the demo
remain pending; the preceding plane/cylinder evidence retains its exact source.

The dependent local `codex/assembly-sphere-source` branch validates one original
saved semicircle/Revolve sphere before adding spherical mates. Source
`d39f096f02c6e76057dff789a9b57d92a87c7908` passed build and `npm test` on
Windows x64: 5,245 unit/CAD cases in 215 files and 50 IPC/security cases, with
597 source inputs unchanged. Its native gate checks actual spherical surface
classification, independent geometry, exact reference/render catalogs and
seam/pole behavior after reopening. Two earlier failed probes exposed an
unsupported empty-mesh-buffer assumption; the corrected test checks exact
native degeneration and original pole coordinates. Production and existing
tests are unchanged from the preceding cylinder increment. This adds no
spherical mate/reference API or new desktop interaction evidence. Complete
tangent and assembly acceptance, and the demo, remain pending.

The dependent local `codex/assembly-sphere-tangent` increment adds
the [spherical support tangency proposal](ASSEMBLY_SPHERE_TANGENCY.md): distinct
plane/sphere, sphere/sphere and cylinder/sphere declarations with exact spherical
purpose, fresh native witnesses, side/radius roles and a dedicated picker.
Windows source `712a85babc418f708fb4e82c5dc926c31adf6719` passed all fifteen
commands: build, 3,287 focused and 5,754 full unit/CAD cases, 50 IPC checks and
twelve desktop commands. The 509 new model/native/component cases overlap those
suite counts. The three original renderer cases complete 72 registered
operations, 21 authenticated Applies, three actual sphere pointers and nine
file-IPC calls, including history and fresh reopen. Eight captures have private
source-specific QA. [Validation](VALIDATION.md#spherical-support-tangency--2026-10-16-utc)
retains the earlier build/type and exact-native-coordinate test failures,
precision-domain fixes, tolerances and limits. This remains local and unpublished.
Complete supports and normal agreement do not claim finite contact, rolling,
general containment/non-interference, other tangent surfaces or platform
support. Full assemblies and the demo remain open.

The dependent local `codex/assembly-limit-distance` branch starts from
`4e6e2a80db390d79d922f90050dbe6420f614e1c` for the
[signed plane-distance interval proposal](ASSEMBLY_LIMIT_DISTANCE.md).
Windows x64 source `b8b4976c88053c76e32f3292256fe92e2489a1d9` passed all
sixteen local commands: build, 3,537 focused cases in 86 files, 6,004 full
unit/CAD cases in 223 files, 50 IPC/security cases and thirteen desktop
commands. All 622 source inputs remained unchanged. The 250 new model,
native and component cases overlap those suite counts. This implements
bounded inclusive signed intervals, bilateral plane alignment, unilateral
boundary release and constrained target projection.

The original two-box renderer workflow completed 38 registered phases, eleven
authenticated Applies, four pick/drag gestures and one separately recorded
wheel view adjustment, with Save As/reopen and three file-IPC calls. For its
isolated fixed/free plane pair, bilateral rank two and four local bilateral
DOF remain distinct from boundary lineality three and target deviation.
The [validation record](VALIDATION.md#signed-plane-distance-intervals--2026-10-19-utc)
preserves the two preceding failed validation attempts, failed and successful
separate workflow preflights, exact tolerances and private visual-review limits.
These results remain local and unpublished. At that increment, limit angles,
width, symmetry and profile-centre still required their later integrations;
those bounded implementations are recorded above. Path and remaining advanced
scope still require acceptance. No finite
contact, general mechanism, installed-package or other-platform acceptance is
claimed; the complete assembly/demo gate remains closed.

The dependent local branch `codex/assembly-limit-angle` started at
`20ccaf873f1847dc737dbf155c1476cc750226b7` for the
[principal direction-angle interval proposal](ASSEMBLY_LIMIT_ANGLE.md).
It adds explicit 0–180° bounds, regular and endpoint strata,
constrained restoration/projection, fresh native direction measurements and
the editor/file workflow. Its original two-box fixture has repeatable
generation. Earlier cumulative native failures and partial validation remain
recorded in [VALIDATION.md](VALIDATION.md).

The dependent local `codex/native-validation-context` branch scopes native
checkers to finite final-catalog and assembly validation calls, retaining
borrowed shapes until checker retirement. Windows x64 source
`5f5e1eb790f295685fc261ab9c276c75f17590c1` passed build, 110 focused cases,
all 6393 unit/CAD cases in 228 files, 50 IPC checks and all fourteen public
desktop commands. This includes the complete 119-case angular file and the
principal-angle renderer, movement, history and saved-file workflow. One later
capture-enabled angular run at documentation-only head `680237a` also passed;
its final reopened viewport received bounded visual review. Controls below
the captured fold, human native dialogs and installed packages were not
visually validated by that capture.

These results remain local and unpublished. They establish neither a general
native-memory fix nor a performance improvement. Directed circular intervals,
signed winding stops and the other advanced families remain required work;
existing principal-angle files retain their 0–180° meaning. Earlier distance
evidence keeps its own exact source. The complete assembly/demo gate remains
closed, with no new hosted or other-platform result claimed.

## Assembly inspection selection — local source, 2026-10-20

The dependent local `codex/assembly-interference-scope` source `fa14a84` adds
explicit component/subassembly selection and exclusions to static native
interference inspection. It distinguishes selected-only pairs from pairs
crossing to the rest, validates full occurrence paths and exact revisions, and
reports the evaluated scope. Reused instances stay distinct and exclusions
take priority. Inspection and its options leave the committed model unchanged.

Windows x64 passed build, all 6419 unit/CAD cases and 50 IPC cases, production
desktop readiness and the complete assembly renderer workflow with the new
scope controls. The [validation record](VALIDATION.md#assembly-interference-selection-and-exclusions--2026-10-20)
states the analytical fixtures, tolerances and the limited final-frame visual
review. This source remains local and unpublished. It does not establish other
platforms, installation, automatic grouping, within-part analysis, union volumes
or continuous collision detection. The complete assembly/demo gate stays closed.

## Part replacement — local source, 2026-10-20

The dependent local `codex/assembly-component-replacement` source adds
different-ID embedded part replacement. Selected mode isolates one expanded
instance through copied ancestor revisions; all mode changes every use of the
exact source revision. Native catalogs support explicit reference repair, and
affected mechanical coordinates require native recapture or explicit removal.
The [contract](ASSEMBLY_COMPONENT_REPLACEMENT.md) keeps one authenticated Apply,
complete Undo/Redo and unchanged original part sources reviewable.

Implementation `b59d97b` passed build; `dd6c989`, with identical production
source plus CI/development documentation, passed all 6460 unit/CAD/component
cases, 50 IPC checks, production readiness, the new 86-check replacement desktop
workflow and the existing 526-check assembly workflow on Windows x64. The
[validation record](VALIDATION.md#part-replacement-and-explicit-reattachment--2026-10-20)
separates native cases, scripted interaction, failure evidence and the limited
final-frame review. This is partial replacement acceptance: subassemblies,
linked sources, configurations, reusable attachment mapping and broader cases
remain open. These results remain local and unpublished; complete assembly/demo,
installation and other-platform acceptance are still pending.

## Historical review index — 2026-10-15, 11:48 UTC

The sections below retain the earlier queue, original heads and evidence as a
dated historical index. Their fourteen-proposal counts, planned integration and
individual ready/draft states describe 11:48 UTC, not the current queue above.

This queue records fourteen open, unmerged proposals observed before the planned
integration proposal below: eight ready for review
(#27, #29, #31, #33, #34, #36, #37 and #39) and six drafts
(#35, #38, #40, #41, #42 and #43).
The CAD dependency order is #27 → #29 → #31 → #34 → #36 → #37 → #38 → #39 → #40 → #41 → #42 → #43.
[#33](https://github.com/angelcp2802/solidflow/pull/33) and
[#35](https://github.com/angelcp2802/solidflow/pull/35) are parallel main-based
lanes. Ready-for-review is a PR state, not approval or integration; the ready
child does not make its draft prerequisites ready. The current single-maintainer
policy requires a recorded review and all six strict checks, with zero required
approvals; independent review remains preferred. See
[governance](GOVERNANCE.md) for the observed rules and merge settings.

## Default branch and proposed CAD work

The baseline for this snapshot is `main` at
`43c7573c688b35a0bb70a0206416fff17ae298cd` (application version 0.19.0).
The capabilities in the [README](../README.md) and [roadmap](ROADMAP.md)
describe that baseline. The following increments are proposed on separate branches,
with dependencies that determine their review and integration order:

| Order | Pull request and state | Base | Proposed scope | Review before integration |
| --- | --- | --- | --- | --- |
| 1 | [#27](https://github.com/angelcp2802/solidflow/pull/27), ready for review | `main` | Generated sketch identities and bounded finite-prism semantic references; conservative geometric references elsewhere. | Identity compatibility and the reference-family boundary. |
| 2 | [#29](https://github.com/angelcp2802/solidflow/pull/29), ready for review | #27 | Explicit body catalog, exact body-state references, targeted operations and Combine. | Atomic body-state changes, Combine and raw-mode rejection. |
| 3 | [#31](https://github.com/angelcp2802/solidflow/pull/31), ready for review | #29 | Explicit new-body and targeted-merge ownership for sweep and loft. | Ownership, downstream references and earlier-feature edits. |
| 4 | [#34](https://github.com/angelcp2802/solidflow/pull/34), ready for review | #31 | Owned linear/circular pattern and mirror instances, historical sources and targeted merge. | Persistent instance outputs, source history and target routes. |
| 5 | [#36](https://github.com/angelcp2802/solidflow/pull/36), ready for review | #34 | Selected historical feature-geometry contributions routed to current owners. | Contribution ownership, exact source/target bindings and inherited security triage. |
| 6 | [#37](https://github.com/angelcp2802/solidflow/pull/37), ready for review | #36 | Initial selected per-instance intrinsic rectangle/circle cut and merge regeneration with blind/ThroughAll endings. | Rebuilt tools versus geometry copying, historical provenance and late-failure atomicity. |
| 7 | [#38](https://github.com/angelcp2802/solidflow/pull/38), draft | #37 | Cut-only dynamic ALL over the complete current catalog, with no saved derived target snapshot. | Confirmed behind-plane ThroughAll/ALL rejection is unchanged on this head; correction proposed in #42. Retain inventory, lifecycle and interaction review. |
| 8 | [#39](https://github.com/angelcp2802/solidflow/pull/39), ready for review | #38 | Typed native UntilNext forward classification and tool ownership foundation. | Component evidence and owner boundaries; saved recipe/bridge/scope policies remain inactive. |
| 9 | [#40](https://github.com/angelcp2802/solidflow/pull/40), draft; head `7cec5c8d` | #39 | Explicit fixed-world principal-plane UpToSurface policy, property-panel preview/Apply and saved reopening. | Bounded source review completed; hold for prerequisite #38 and retain distinct hosted/local evidence. |
| 10 | [#41](https://github.com/angelcp2802/solidflow/pull/41), draft; head `372e2524` | #40 | Historical real-solve registry and native Add-entry, closed-tool and face-occurrence foundations. | Bounded source review completed; hold for prerequisite #38. The separate nonblocking provenance-link correction is proposed only in #42. |
| 11 | [#42](https://github.com/angelcp2802/solidflow/pull/42), draft; head `746be890` | #41 | Conservative behind-plane no-op for intrinsic ALL cuts with unilateral ThroughAll; complete inventory and virtual roles retained. | Bounded source and local raw-evidence review completed; local checks and six hosted checks passed. #40 and #41 remain draft prerequisites. |
| 12 | [#43](https://github.com/angelcp2802/solidflow/pull/43), draft; head `dbdcc9af` | #42 | Fixed intrinsic entity instances from authentic solved source sketches; behind-plane ALL no-op requires validated native profile and tolerance evidence. | Bounded source, native and local workflow reviews completed. Hosted Windows unit/CAD failed with a V8 fatal diagnostic and no final suite summary; the cause remains unknown. macOS and Linux passed their configured jobs. Keep prerequisite and remaining-policy review explicit. |

Review from the earliest unmerged prerequisite against its actual base. A child
contains unmerged ancestors; its checks do not mean those ancestors landed on
`main`. Refresh affected bases and run their required checks after a parent
changes. Do not skip draft prerequisites because a later child is ready for review.
Bounded source reviews of #40 and #41 are complete, along with the source
and local raw-evidence reviews of #42 and #43. The confirmed #38 case is unchanged on its original head; its
focused correction and the nonblocking provenance-link repair are proposed
separately in #42. These dependent proposals remain in draft. Review completion
does not expand the recorded validation scope or change a PR's state automatically.
Contributions normally start from `main`; coordinate work on an existing
increment rather than duplicating its branch.

| Parallel lane | State and base | Review purpose |
| --- | --- | --- |
| [#33](https://github.com/angelcp2802/solidflow/pull/33) | Ready for review, `main`; head `cb7c2332` at this snapshot | Project index, review queue and matching Node type-update policy. Its main-based checks do not exercise the stacked CAD suites. |
| [#35](https://github.com/angelcp2802/solidflow/pull/35) | Draft, `main`; head `0a0ab22a` | Desktop outcome/cleanup diagnostics and normal quit after readiness. Review its separate macOS crash and retained local failures. |

All fourteen proposals remain unmerged. This index records PR state and evidence,
not contributor approval or authorization to merge.

[#24](https://github.com/angelcp2802/solidflow/pull/24) and
[#25](https://github.com/angelcp2802/solidflow/pull/25) are closed as superseded
by #27. Both heads are exact ancestors of the integration; their original
branches and validation histories are retained. They were not separately merged.
[#23](https://github.com/angelcp2802/solidflow/pull/23), the Node 26 type-definition
update, is deferred under the current Node 24 policy. Its checks passed; the
deferral concerns the runtime migration policy.

## Planned integration proposal

An unnumbered integration proposal is being prepared on
`codex/integrate-reviewed-cad`. Its intended composition combines the CAD stack
through #43, the organization changes from #33 and a proposed Vitest `forks`
configuration for process isolation. The
[planned comparison against main](https://github.com/angelcp2802/solidflow/compare/main...codex/integrate-reviewed-cad)
identifies its intended review range; this snapshot assigns no published
integration head or PR number. Hosted checks remain pending publication of
the proposal.

The fourteen-proposal queue above was observed before publication of this
additional proposal. Refresh the counts, base/head and commit-specific checks
when it is published. Preparing this composition does not change the existing
PR states or integrate their changes into `main`.

### Local integration follow-up, 2026-10-15 11:56–11:57 UTC

After the 11:48 queue snapshot, one local Windows x64 / Node 24.21.0 sequence
on integration source `dbadd4f522bca88b5ff365880821e1f6c781da7b` with the
reviewed `forks` configuration passed all five commands: 2,407 unit/CAD tests
in 138 files followed by 32 IPC/security/literal checks, TypeScript and the
1,985-module production build, standard desktop smoke, selected-to-ALL
interaction and fixed-plane interaction. No retries were used. The 405 recorded
source inputs, 15 dependency inputs, runtime/runner and seven production
output files remained unchanged across execution. Independent raw-log review
confirmed these bounded outcomes; each existing desktop command retains its
own fixture, interaction and lifecycle limits.

This local follow-up does not change the earlier fourteen-proposal queue or
supply hosted checks for the unpublished integration proposal. The separate
`threads` baseline below also passed; neither result establishes the cause
or resolution of #43's earlier hosted Windows V8 fatal outcome. That failure
remains recorded separately. General platform support and release readiness
remain unproved.

## Evidence and review still required

The named commits below retain their own historical evidence. A new proposal
head does not inherit an earlier run's result; a focused pass does not replace
its default-suite, desktop or platform checks.

The recorded runtime heads of #27 (`ac7e21f`), #29 (`b12c71b`) and #31 (`e326878`)
each have six successful hosted checks, including configured desktop jobs on
Windows x64, Linux x64 and macOS arm64.
Those jobs exercise programmatic tests, an isolated initial-model Electron
smoke check and unsigned packaging. They do not establish complete interactive
coverage, independent interoperability or general platform support. They also
do not replace a recorded review; independent contributor review remains
preferred when available.

Local failed runs remain recorded in each proposal and its validation history.
For #31's integrated runtime source `e326878`, the final local full run reported
1,722 passed and 84 timed-out cases (81 at 5 seconds and three at 60 seconds).
The separate IPC run passed 11 tests. The desktop smoke command failed while
cleaning up the temporary profile's `DIPS-wal` file and emitted no readiness
report; its initial-model outcome remains unknown.
The hosted full suite passed 1,806 cases in 97 files
on each of its three configured platforms. Preserve both results when reviewing
the change; a green hosted run does not explain a local failure.

For [#34](https://github.com/angelcp2802/solidflow/pull/34), runtime source
`60014c4` is based on #31 at `92a8747`. The final documentation-only head
`601788c` retains the same 243 runtime inputs; hosted jobs tested merge `0e6bd9d`.
The [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38465622528)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38465622843)
completed with six successful checks. Each configured Windows x64, Linux x64
and macOS arm64 job passed the production build, 1,888 tests in 101 files
(including 23 body-pattern cases), 11 IPC tests and the isolated initial-model
Electron/WASM smoke check. The smoke logs reported no console errors or failed
requests; packaging used `--publish never`. Complete pattern/mirror
interaction, independent interoperability and general platform support remain
unproved. The complete local runtime-source run reported 1,719 passed and 169
failed of 1,888 tests, with 84 passed and 17 failed of 101 files in 1,165.13s.
All 169 reported failures were test timeouts: 159 at 5 seconds, one at 20 seconds
and nine at 60 seconds. Three worker-termination warnings were recorded
separately; their causes remain unknown. Separate IPC passed 11 cases and the
production build passed 1,982 modules. Local desktop smoke failed at the
45-second deadline without a readiness report. Preserve those failures and
the earlier validation history; hosted success does not explain them.

For [#36](https://github.com/angelcp2802/solidflow/pull/36), runtime source
`c10d31f` is based on #34 at `601788c`; documentation head `ae449881`
retains the same 251 runtime inputs. The
[CI run](https://github.com/angelcp2802/solidflow/actions/runs/38495555168)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38495555227)
completed with six successful checks, testing merge `2ae4f0db` whose tree
equals the published head. Each configured Windows x64, Linux x64 and macOS
arm64 job passed 1,971 tests in 105 files, including 22 native feature-pattern
cases, 11 IPC cases, the 1,985-module build and the initial-model Electron/WASM
smoke check with no console errors or failed requests. Packaging completed with
`--publish never`. CodeQL and the high/critical audit threshold passed; eight
moderate findings remain. These results do not establish signing, release
readiness, real editor interaction, independent interoperability or general
platform support.

The current local source full run failed: 1,877 passed and 94 test timeouts of
1,971 cases, with 84 passed and 21 failed of 105 files in 759.99s. The timeouts
were 82 at 5 seconds and 12 at 60 seconds. Three selected cleanup cases passed
with 30 filtered skips; separate IPC passed 11 cases, and build and the isolated
initial-model desktop smoke passed. Preserve the preceding snapshot's pure,
native and failing full results in the
[source-specific ledger](https://github.com/angelcp2802/solidflow/blob/ae4498810de64ab46a9398145ea37d8c1f6b00dc/docs/VALIDATION.md#scoped-feature-contributions--source-specific-results-2026-10-14).
Hosted success does not explain local deadlines. Selected geometry replay is
a foundation: full per-instance regeneration, varying sketches, dynamic and automatic
scope, broader nested/dependent patterns and ownership lifecycle acceptance
remain required by open [#26](https://github.com/angelcp2802/solidflow/issues/26).


For [#37](https://github.com/angelcp2802/solidflow/pull/37), runtime source
`97def5ae` is based on #36 at `d0173137`; documentation head `682fba8e`
retains its 271 runtime inputs. The initial regeneration path rebuilds selected
intrinsic rectangle/circle cut and merge recipes per instance with blind or
ThroughAll endings, exact historical sources and current working targets.
The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/682fba8e3eccb616f4fe442e04c44033bd2682d4/docs/VALIDATION.md)
records local Windows x64 `npm test` passing 2,144 tests in 120 files and
11 IPC checks, plus the 1,985-module production build. Standard desktop
smoke reached initial-model readiness, including worker/WASM with no console
errors or failed requests, but failed the 45-second exit deadline; it is not
an overall desktop pass.
The [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38513041921)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38513041841)
completed with six successful checks for head `682fba8e`, testing merge
`c0310601` whose tree equals the published head. Each configured Windows x64,
Linux x64 and macOS arm64 job passed 2,144 tests in 120 files, 11 IPC checks,
the 1,985-module build and the initial-model Electron/WASM smoke check with no
console errors or failed requests. Packaging completed with `--publish never`.
Hosted success does not explain the local exit failure or establish real
interaction, independent interoperability or general platform support.
Broader regeneration, other end/start conditions, exact dependent-reference
correspondence, all/automatic scope, variation and ownership lifecycle acceptance
remain required; programmatic and SSR checks do not establish real interaction.

At this snapshot, #38 remains draft because one local reproduction on source
`06cfdd5c` confirms an ALL/ThroughAll rejection: adding owner B wholly behind
the sketch start plane (z=−10..−2) aborts the pattern even when positive-side
owner A is valid. A focused correction is proposed separately in #42; #38's
source is unchanged. This records that particular review finding, not a cause
proven for the historical CI or local deadline
failures below; their original evidence remains intact.

The latest [#38](https://github.com/angelcp2802/solidflow/pull/38) source
[`06cfdd5c`](https://github.com/angelcp2802/solidflow/commit/06cfdd5cdccb5dac930d7d8c5b30c2300549b6a7)
retains 279 runtime/configuration inputs and changes only two child
`fs.realpathSync` calls to `fs.realpathSync.native` in the instrumented desktop
test's isolated-profile guards. The
[CI run](https://github.com/angelcp2802/solidflow/actions/runs/38550096433)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38550096455)
completed with six successful checks. Tested merge `99eae087` has parents
`682fba8e` and `06cfdd5c`; its tree `67b78118` equals the proposed head.
Each Windows x64, Linux x64 and macOS arm64 job passed 2,198 tests in 125 files,
11 IPC checks, the 1,985-module build and the initial-model Electron/WASM smoke
with no recorded console errors or failed requests. The selected-to-ALL
interaction completed four distinct selected/preview/committed/reopened worker
builds, exact owner refs, analytical volume/bounds checks, Save As/reopen,
actual child close and guarded profile deletion. Packaging used `--publish never`.
The scripted linear-cut check uses volume tolerance `1e-5` and bounds tolerance
`1e-6`; it does not establish other editor workflows or general platform support.

Current local Windows x64 / Node 24.11.1 evidence for those native-path bytes
remains failed: default `npm test` reported 2,117 passed and 81 test timeouts of
2,198 in 125 files, in 1,038.63 seconds. Its chained IPC command was not entered;
separate IPC passed 11 checks and the production build passed 1,985 modules with
warnings retained. Standard desktop smoke failed at 45 seconds without a
recorded readiness pass. The normal interaction reached healthy selected
geometry, then its ALL wait failed at 35 seconds; the 180-second workflow did
not observe child close and retained its profile. A separate real Windows 8.3
pair reused the same owned container: the old CLI failed the profile guard;
the native-path CLI reached the renderer and healthy selected state, then ALL
also failed at 35 seconds. Its outer 240-second deadline left no final record,
after-map or cleanup proof. Local API probes distinguish default/native path
outcomes, but do not establish the exact spelling/predicate of the earlier
hosted Windows failure or explain these local timeouts.

The successful security workflow reports three new medium CodeQL alerts whose
triage remains pending. Its audit records eight moderate development-package
entries associated with one advisory,
[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c),
with no patched sprintf version listed. Development flags do not establish
absence of CI exposure, and successful checks are not a zero-vulnerability
finding. Preserve the following earlier source-specific evidence too.

For earlier [#38](https://github.com/angelcp2802/solidflow/pull/38) evidence, runtime source
`d2f9904e` is based on #37 at `682fba8e`; documentation head `4a2cee2c`
retains the same 277 runtime/configuration inputs. Initial intrinsic
rectangle/circle cuts with blind/ThroughAll endings can use saved regenerate/false
ALL. It resolves every current native owner at each rebuild and preserves exact
historical source refs and saves no derived current targets. Only materially
changed owners advance. Geometry/true remains selected. The source adds 54
original cases across model/command, SSR, native scope, saved-engine and
contextual creator-deletion boundaries.

The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/4a2cee2c1d20222bbeab709c8594ad49292faeb9/docs/VALIDATION.md)
records local Windows x64 `npm test` passing 2,198 tests in 125 files followed
by 11 IPC-security checks, and the 1,985-module production build. Standard
initial-model desktop smoke exited 0 after readiness, actual child close and
isolated cleanup; the complete invocation took 24.112 seconds. This source
carries the success-only normal-quit correction from #35, without importing
that proposal's additional launcher tests. Its result does not explain #35's
separate macOS bus error or any earlier source's failed validation.

The [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38520181075)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38520180933)
completed with six successful checks for head `4a2cee2c`, testing merge
`40b5acd3` whose tree equals the published head. Each configured Windows x64,
Linux x64 and macOS arm64 job passed 2,198 tests in 125 files, 11 IPC checks,
the 1,985-module build and the initial-model Electron/WASM smoke check with no
recorded console errors or failed requests. Packaging completed with
`--publish never`. This does not resolve the separate #35 macOS crash.

The earlier runtime source
[`f65d6f1b`](https://github.com/angelcp2802/solidflow/commit/f65d6f1b8ee1feeb3ca37432fb8668fbbd8e6c79)
and [documentation head `4f9d8a19`](https://github.com/angelcp2802/solidflow/blob/4f9d8a195bd62c462518bcf9530809466bffecda/docs/VALIDATION.md)
retain 279 runtime/configuration inputs and add an
[instrumented production-renderer regression](https://github.com/angelcp2802/solidflow/blob/f65d6f1b8ee1feeb3ca37432fb8668fbbd8e6c79/scripts/desktop-pattern-all.cjs)
with an
[original synthetic fixture](https://github.com/angelcp2802/solidflow/blob/f65d6f1b8ee1feeb3ca37432fb8668fbbd8e6c79/src/cad/fixtures/pattern-all-original.json).
On Windows x64 with Node 24.11.1, `npm test` passed 2,198 tests in 125 files
followed by 11 IPC checks (unit phase 55.70 seconds), and the production build
passed 1,985 modules. Standard initial-model desktop smoke passed in
19.478 seconds. The normal instrumented UI invocation passed in 29.305 seconds;
a separate owned TEMP/TMP junction-alias invocation passed in 29.279 seconds.
Both observed selected, ALL-preview, committed and reopened worker builds,
checked exact per-owner refs and analytical volumes, and completed actual child
close/code-zero and guarded cleanup. Native-dialog choices were confined to
test-owned temporary files; this is one scripted linear-cut workflow.

For head `4f9d8a19`, the
[new CI run](https://github.com/angelcp2802/solidflow/actions/runs/38531791880)
finished with a Windows failure; Linux and macOS jobs and all three
[security checks](https://github.com/angelcp2802/solidflow/actions/runs/38531791689)
passed: five successful checks and one failed check. Windows passed the
1,985-module build, 2,198 tests in 125 files, 11 IPC checks and the standard
initial-model smoke. Its new interaction step reported
`Error: Unexpected isolated profile.` before the UI workflow, followed by a
missing `workflow-result.json`; no UI workflow report was produced. Packaging
was skipped. The cause of the profile-guard rejection remains unknown.
Linux and macOS passed the new interaction workflow with four actual worker
phases, child close and cleanup, and packaging with `--publish never`.

The six successful hosted checks at `4a2cee2c`
did not run the new property-panel test. Those historical results do not explain
the Windows guard failure, #35's separate macOS bus error or any earlier local
failure. One scripted linear-cut workflow does not establish complete
interaction, independent interoperability or general platform support.

The organization proposal's six successful checks on `633bc340` validate its
separate baseline and do not execute these 2,198 CAD cases. ALL additive
applicability, dynamic geometry scope, AUTO discovery, other end/start conditions,
exact dependent-reference
correspondence, variation, nested recipes, output lifecycle and full interaction
acceptance remain required. The initial-model smoke is not property-panel
interaction, independent interoperability or general platform support.

For [#39](https://github.com/angelcp2802/solidflow/pull/39), head
[`0629b3a7`](https://github.com/angelcp2802/solidflow/commit/0629b3a733b8d98cec586fbe6e79d2265cadda37)
is based on #38 at `06cfdd5c`. This is a typed UntilNext component foundation:
it distinguishes separated forward misses, contact/near geometry, material
without a complete limit and completed native tools, while preserving primary
and cleanup failures and exact borrowed/repeated-handle ownership boundaries.
It does not activate saved recipe grammar, the per-instance bridge or a
selected/ALL no-hit, partial-intersection or global-part/per-owner policy.

The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/0629b3a733b8d98cec586fbe6e79d2265cadda37/docs/VALIDATION.md#untilnext-resolution-foundation--2026-10-14)
retains local Windows x64 evidence: 19 focused native cases passed, comprising
11 geometric and eight causal cases. Four supplied frames do not exercise actual
pattern transforms. The recorded default full run failed: 2,006 passed, 176 test
timeouts and 35 skips of 2,217 cases in 126 files, with a separate 60-second hook
timeout and one worker-termination warning; chained IPC did not run. Separate IPC
passed 11 checks and the production build passed 1,985 modules. Standard desktop
failed at 45 seconds without readiness or confirmed-close proof. A two-worker
whole-unit comparison was aborted after at least 70 observed failures across
four completed file reports, without a full summary or normal-cleanup proof.
The earlier malformed-launch result remains in the ledger. These are historical
source-specific runs, not an assertion that the new head passed locally.

The [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38572088904)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38572089487)
completed with six successful checks for `0629b3a7`. Each configured Windows x64,
Linux x64 and macOS arm64 log records 2,217 passed tests in 126 files, including
the 19 UntilNext component cases without unit skips, 11 IPC checks and the
1,985-module build. Initial-model Electron/WASM smoke reported no console errors
or failed requests. The inherited selected-to-ALL workflow completed its four
healthy worker phases, exact refs and geometric checks, save/reopen, actual child
close and guarded profile deletion; it does not integrate UntilNext. Packaging
completed with `--publish never`. Tested merge `f1e4834d` has parents `06cfdd5c`
and `0629b3a7`; its tree `acabb9a5` equals the proposed head. Hosted success does
not explain the local failures or establish general platform support. The
security result does not resolve #38's three medium alerts, its eight moderate
development-package entries for one GHSA, or #35's macOS bus error.

The organization proposal also has six successful checks at `09497446`; they concern its separate main-based baseline, not the stacked CAD suites.

### Fixed-plane regeneration proposal #40

#### Historical snapshot at 51388ba3

[#40](https://github.com/angelcp2802/solidflow/pull/40) initially published the proposed
fixed-world principal-plane UpToSurface behavior at
[`51388ba3`](https://github.com/angelcp2802/solidflow/commit/51388ba31a4e78c28134f2ea2459cde7cfe5431d),
based on #39 at `0629b3a7`. It is draft, unmerged and absent from `main`.
Its 26-file increment saves an explicit world-limit choice, transforms the
instance profile/ray while retaining that limit, and requests a fresh preview
before Apply. It also hardens the inherited interaction source serializer.
This is a bounded regeneration increment, not general entity/reference support
or activation of UntilNext in saved patterns.

The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/51388ba31a4e78c28134f2ea2459cde7cfe5431d/docs/VALIDATION.md#fixed-principal-plane-regeneration--local-evidence-2026-10-14)
and [original fixture formulas](https://github.com/angelcp2802/solidflow/blob/51388ba31a4e78c28134f2ea2459cde7cfe5431d/docs/FEATURE_WORLD_LIMIT_FIXTURES.md)
retain local Windows results for the recorded code snapshot:

| Check | Recorded result and limit |
| --- | --- |
| Production build | Passed, 1,985 modules; retained warnings remain part of the record. |
| Separate IPC suite | Passed 32/32. The IPC command chained after the failed unit phase was not entered. |
| Required `npm test` | Failed: 2,123 passed and 127 timeouts of 2,250 cases; 107 passed and 22 failed files of 129. The timeout cause remains unproven. |
| Standard desktop and selected-to-ALL interaction | Both commands failed their deadlines. |
| Fixed-plane interaction | Worker assertions, expected missing-policy rejection, Apply and Save As/reopen completed. The parent command failed its deadline without observing child close; this is a failed desktop command, not an overall pass. |
| Earlier focused snapshots | Eleven native cases and 31 model/SSR cases passed on their separately recorded input scopes. Those results do not replace the failed full/desktop results or validate a later harness. |

Documentation followed execution. The tested code hashes were checked unchanged
before committing; the recorded 31-input list is partial, not a complete runtime
manifest. Keep the earlier source-specific failures and focused results in the
ledger rather than treating this published head as a new local whole-check pass.

Hosted checks associated with head `51388ba3` were inspected separately at
19:37 UTC on 2026-10-14. The
[CI run](https://github.com/angelcp2802/solidflow/actions/runs/38624416703)
failed, while the
[Security run](https://github.com/angelcp2802/solidflow/actions/runs/38624416693)
completed successfully:

| Configured CI job | Completed steps | Failure / skipped stages |
| --- | --- | --- |
| Linux x64, Node 24 | Build, portable unit/CAD, IPC and initial-model Electron loader smoke passed. | Selected-to-ALL interaction failed; fixed-plane interaction and packaging were skipped. |
| Windows x64, Node 24 | Build, portable unit/CAD, IPC and initial-model Electron loader smoke passed. | Selected-to-ALL interaction failed; fixed-plane interaction and packaging were skipped. |
| macOS arm64, Node 24 | Build, portable unit/CAD, IPC and initial-model Electron loader smoke passed. | Selected-to-ALL interaction failed; fixed-plane interaction and packaging were skipped. |

These are job/step outcomes associated with the PR head. This index does not
infer the hosted failure's cause or a complete checked-out runtime manifest.
Hosted unit success does not explain the local timeouts. The initial-model smoke
does not replace editor interaction, and the skipped fixed-plane/package stages
supply no pass. The successful Security workflow does not establish that earlier
CodeQL alerts or dependency findings were cleared. Neither #39's green checks nor
these partial #40 results establish platform support or release readiness.

#### Follow-up at 7cec5c8d (2026-10-14)

The current #40 head is
[`7cec5c8d`](https://github.com/angelcp2802/solidflow/commit/7cec5c8d2a2378e49ab76158764e59728aba0a67),
still based on #39 at `0629b3a7`, draft and unmerged. Its
[CI run](https://github.com/angelcp2802/solidflow/actions/runs/38635677883)
and [Security run](https://github.com/angelcp2802/solidflow/actions/runs/38635678148)
have six successful checks. Each configured Node 24 job on Windows x64,
Linux x64 and macOS arm64 passed 2,250 unit/CAD cases in 129 files, 32 IPC checks,
the 1,985-module build, initial-model smoke, selected-to-ALL interaction,
fixed-plane interaction and packaging with `--publish never`.
The fixed-plane report includes four actual worker phases, Apply, save/reopen,
observed child close and deletion of its test-owned profile. These are bounded
scripted workflows; native file-dialog choices are substituted.

A separate local Windows x64 / Node 24.11.1 run retained the same 292 recorded
input hashes and runner before and after execution. The entry-source fixes
were already present when it began; committing them changed HEAD from
`51388ba3` to `7cec5c8d` without changing those recorded bytes. The inventory
does not cover the complete transitive dependency tree. The
[PR's dated validation report](https://github.com/angelcp2802/solidflow/pull/40)
retains this local outcome:

| Local command | Recorded result and limit |
| --- | --- |
| Required `npm test` | Failed: 2,114 passed and 136 test timeouts of 2,250 cases; 110 passed and 19 failed files of 129. The 91 failure blocks cover 95 cases at 5 s, 11 at 30 s and 30 at 60 s. No hook timeout or unhandled/crash/worker-termination indicator was observed; the timeout cause remains unproven. |
| Separate IPC / production build | Passed 32/32 and 1,985 modules respectively, with build warnings retained. The IPC phase chained after the failed unit suite was not entered. |
| Standard desktop | Failed with `EBUSY` during temporary-profile cleanup. Its logs do not establish the primary launch outcome, readiness or descendant-tree closure. |
| Selected-to-ALL desktop | Failed the 180-second deadline without observed child close; the temporary profile was retained. |
| Fixed-plane desktop | Failed while waiting for initial renderer readiness, before Open, Apply or save/reopen. |

Hosted success does not explain or erase the local failures. The six green
checks and bounded scripted cases do not establish general platform support,
release readiness or clearance of earlier CodeQL/dependency findings. Binary
publication remains disabled.

### Source-solve and native component proposal #41

[#41](https://github.com/angelcp2802/solidflow/pull/41), head
[`372e2524`](https://github.com/angelcp2802/solidflow/commit/372e25245f1aecff8ac4b61c83ad702038fb32c1),
is based on #40 at `7cec5c8d`. Its bounded source review is complete, while
the unresolved #38 prerequisite keeps it in draft. Its
thirteen CAD source/test paths and three documents add real historical solve
capture plus native entry/tool/query foundations. The
[source-specific ledger](https://github.com/angelcp2802/solidflow/blob/372e25245f1aecff8ac4b61c83ad702038fb32c1/docs/VALIDATION.md#source-solve-and-native-component-composition--2026-10-15)
records 90 added component cases, a 109-case focused pass and a local Windows
full pass of 2,340 unit/CAD cases plus 32 IPC checks. Build and the three
standard/ALL/fixed-plane desktop commands passed within their separately
recorded scopes; the standard launcher does not observe its inner Electron
close event. Six hosted checks also passed for this head.

One inherited provenance link still points to a nonexistent planned-workflow
heading. Its nonblocking correction is proposed only in #42; #40 and #41 retain
their original heads. The existing
[production-renderer workflow and recorded evidence](https://github.com/angelcp2802/solidflow/blob/372e25245f1aecff8ac4b61c83ad702038fb32c1/docs/FEATURE_WORLD_LIMIT_FIXTURES.md#production-renderer-workflow-and-recorded-evidence)
is the intended destination. This link issue is separate from #38's CAD finding.

These are component and inherited-workflow results, not general solved-profile
or associative recipe activation. Native datum/face/instance correspondence,
saved UntilNext, variation, additive ALL, AUTO, nesting and broader ownership
lifecycle remain required work. These passes do not erase the older failures,
resolve the newly confirmed #38 case or establish general platform support.

### ALL unilateral forward-material correction #42

[#42](https://github.com/angelcp2802/solidflow/pull/42), head
[`746be890`](https://github.com/angelcp2802/solidflow/commit/746be89089f5167271b21a3f69b7e3156711f68c),
is based on #41 at `372e2524` and remains draft. Independent source and local raw
validation reviews completed for the bounded correction: an intrinsic ALL cut
with unilateral ThroughAll can retain a wholly behind-plane owner as an
unchanged virtual output after a conservative native-bounds proof. Complete
owner inventory, stale-state checks and budgets remain in force. Selected and
bilateral behavior are unchanged; this does not activate entity-profile ALL.

The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/746be89089f5167271b21a3f69b7e3156711f68c/docs/VALIDATION.md#all-unilateral-forward-material-correction-2026-10-15)
records 15 new regressions (13 component and two engine cases), included in a
41/41 focused pass and the local Windows full pass of 2,355/2,355 unit/CAD cases
plus 32/32 IPC checks. Build, standard desktop smoke and the existing ALL UI
workflow passed once with no overrides or retries. That UI workflow checks
preview, Apply, Save As/reopen and actual child close/temporary-data cleanup;
its existing fixture does not exercise the new behind-plane case. The standard
launcher does not instrument its inner Electron close event. The new
component/engine cases provide the behind-plane evidence.

The [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38718588646)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38718588535)
record six successful checks for this head, observed on 2026-10-15 at 10:20 UTC.
These outcomes do not establish general three-platform support or
clear existing dependency/CodeQL findings. Original #38 remains unchanged and
draft, #40/#41 remain draft prerequisites, and the inherited provenance anchor
is repaired only in #42. This proposal does not erase previous failures or
authorize integration, signing or release.

### Fixed intrinsic entity-profile regeneration proposal #43

[#43](https://github.com/angelcp2802/solidflow/pull/43), head
[`dbdcc9af`](https://github.com/angelcp2802/solidflow/commit/dbdcc9af872079f41384a306783f6e67a5d87728),
is based on #42 at `746be890` and remains draft and unmerged. Its reviewed
increment constructs fixed intrinsic entity instances from the engine's
authentic checkpoint-covered solved profile. A unilateral ALL cut can retain
a wholly behind-ray owner only after conservative owner bounds and a validated,
successfully released native profile witness establish separation, including
vertex, edge and face tolerances. Existing document syntax, exact source and
current owner checks, atomic staging and final single-solid owner validation
remain in force.

The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/dbdcc9af872079f41384a306783f6e67a5d87728/docs/VALIDATION.md#entity-all-profile-composition--local-evidence-2026-10-15)
records 52 added public cases, a 93/93 focused pass across five complete files,
and local Windows x64 / Node 24.11.1 `npm test` passing 2,407/2,407 unit/CAD
cases in 138 files followed by 32/32 IPC/security/literal checks. Build passed
TypeScript and 1,985 modules with existing warnings retained. Standard desktop
smoke and the existing public ALL and fixed-plane interaction commands passed
once, without test-pool/budget overrides or retries; their evidence scopes stay
separate. The standard launcher does not instrument its inner Electron close.

One additional private, scripted production-renderer circular-entity workflow
passed geometry, selected-regenerate preview, ALL preview, Apply, Save As and
reopen. Five distinct actual worker builds supplied 15 body observations:
forward A changes from geometry-copy volume `800−16π` to regenerated `800−32π`,
while behind B retains `B@create-B`, its creator, volume `800 mm³` and bounds
`[20,0,-10]..[30,10,-2]`. The maximum volume error was `1.57e−9 mm³` against
`1e−5`; bounds used `1e−6 mm`. Actual source sketch-visual endpoints matched
radius `2 mm` at z0 within `1e−6 mm`, while saved nominal radius `1 mm`, driving
radius `2 mm` and driven nominal `999` remained intact. Both previews kept
Apply disabled until their worker response. Original preload/isolation,
completed IPC, observed child close and guarded owned-profile cleanup were
retained. This harness is local evidence, not a new public CI command; the
visual does not establish a
fresh driven annotation, full solver result/token, UI area/probes or native
BRep/solid-count query.

At this snapshot, the [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38727248744)
is terminal on this exact head. The failed
[Windows unit/CAD job](https://github.com/angelcp2802/solidflow/actions/runs/38727248744/job/116396053288)
emitted a V8 fatal diagnostic without a final suite summary. Its IPC, standard
desktop, ALL/fixed-plane interaction and packaging stages were skipped. The
configured macOS / Node 24.20 and Linux / Node 24.21 jobs passed 2,407 unit/CAD
cases in 138 files, 32 IPC/security/literal checks, build, all three existing
desktop commands and packaging with `--publish never`. These are bounded
job-specific outcomes, not general platform support. The Windows failure's
cause remains unknown. The
[security run](https://github.com/angelcp2802/solidflow/actions/runs/38727248808)
is tracked separately; no six-check success is claimed.

A separate local Windows x64 / Node 24.21 `threads` baseline passed 2,407
unit/CAD cases and 32 IPC/security/literal checks. It did not reproduce the
hosted fatal outcome or establish its cause. That result belongs to its
`threads` configuration; the later `forks` integration follow-up above supplies
separate evidence. Neither pass explains or erases the hosted failure or
proves its cause was resolved.

Associative supports, variation, saved UntilNext, additive ALL, AUTO, nesting and broader
ownership/reference acceptance remain pending. These bounded results do not
establish general platform support, resolve inherited security findings or
#35's separate macOS crash, erase earlier failures, or authorize integration,
binaries or release.

## Parallel desktop diagnostics proposal

[#35](https://github.com/angelcp2802/solidflow/pull/35) addresses
[#30](https://github.com/angelcp2802/solidflow/issues/30) on `main`, independently
of the twelve-proposal CAD stack above. It preserves the primary launch outcome
alongside cleanup errors and retains isolated temporary data when the owned
child's close was not observed. It is draft and unmerged; #30 remains open.

The latest runtime source `dab4f056` requests normal Electron quit after
successful readiness; unsuccessful completion retains its forced nonzero exit.
Documentation head `0a0ab22a` preserves all 203 runtime/configuration inputs.
Its own local build and 31 Node cases passed, and the real initial-model desktop
command exited 0 after close and cleanup (15.553 seconds for the complete
invocation). The local full run still failed: 1,491 passed and one 5-second
toroidal-case timeout of 1,492 cases in 74 files; IPC was not entered. The exact
case passed separately at its unchanged timeout; that does not change the full
result. The [source-specific ledger](https://github.com/angelcp2802/solidflow/blob/0a0ab22a0cd0b6295b9ff7c5761398b1ae457a4a/docs/VALIDATION.md)
preserves both results and the ineffective initial focused selection.

The current [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38516444018)
is not green: Windows x64 and Linux x64 passed 1,492 cases in 74 files, 31 Node
cases, build 1,972, initial-model Electron/WASM smoke and unsigned packaging.
macOS arm64's unit/CAD process terminated with `Bus error: 10` (step exit 138),
without a final suite summary; IPC, smoke and packaging were skipped. The crash
cause remains unknown. All three [security checks](https://github.com/angelcp2802/solidflow/actions/runs/38516444008)
passed. The tested merge `b720c4f3` has the same tree as head `0a0ab22a`.
No retry or suppression was requested; these results do not establish general
platform support or resolve the older failures below.

For source `b488bc3`, the [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38476808951)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38476808925)
have six successful checks, testing merge `0160695` with `main` at `43c7573`.
Each Windows x64, Linux x64 and macOS arm64 log records 1,492 unit/CAD cases in
74 files, 31 Node cases, the 1,972-module build, an initial-model Electron/WASM
smoke pass with no console errors or failed requests, and packaging with
`--publish never`. CodeQL passed; the audit retained eight moderate findings.
Packaging logs are not independent evidence of binary signing or notarization.

That earlier local source passed 31 IPC cases, including the original VM
temporary-path rejection case, and the 1,972-module build. Its full unit run
failed: 1,352 passed and 140 failed of 1,492 tests; 59 passed and 15 failed of
74 files in 853.24s. All 140 logged failures were test timeouts, 136 at 5 seconds
and four at 30 seconds, with one separate worker-termination warning. The failed
unit phase did not run IPC; the standalone 31-case result has its own scope.
Desktop smoke reported an aggregate with the 45-second deadline as cause and
unconfirmed child close as the secondary failure. Cleanup was skipped and
isolated temporary data retained; no readiness report or cleanup lock error
was observed. Neither the local failures nor their causes are resolved by CI.

Keep the earlier source `038bc50` evidence too: its six hosted checks passed,
while local full reported 1,346 passed and 146 timed-out tests in 20 failed
files (138 at 5 seconds, seven at 30 seconds and one at 15 seconds), plus three
separate worker warnings. Synthetic launcher tests do not establish real locked
profile recovery, descendant/stream termination or full interactive coverage.

Known unresolved diagnostics have separate issues:

- [#28](https://github.com/angelcp2802/solidflow/issues/28): an earlier Linux
  portable-test exit 139 with a segmentation-fault diagnostic. The crashing
  component and cause remain unknown despite a passing repeat.
- [#30](https://github.com/angelcp2802/solidflow/issues/30): review the independent
  diagnostic proposal #35; real locked-profile behavior and the original
  readiness outcome remain unresolved.
- [#32](https://github.com/angelcp2802/solidflow/issues/32): reject unknown
  body-operation modes at the raw extrusion/revolution engine boundary. The
  correction is proposed in #29 and shared with sweep/loft in #31, with public
  rejection and compatibility regressions. The issue remains open for review
  and integration; the document parser already rejected the original mode.

Use the proposed branch's contracts, provenance and validation record when
reviewing new CAD behavior. The [validation record](VALIDATION.md) on `main`
continues to describe the default-branch evidence.

## Open acceptance work

These issues remain open even where an initial increment has merged or a draft
has passing checks:

| Area | Issue | Remaining scope |
| --- | --- | --- |
| Sketch fillets | [#6](https://github.com/angelcp2802/solidflow/issues/6) | Full-circle sources, curved/virtual-corner batches and broader interaction and robustness. |
| Sketch mirror | [#10](https://github.com/angelcp2802/solidflow/issues/10) | Real pointer/keyboard interaction, cancellation, history and interactive reopening. |
| STEP import | [#12](https://github.com/angelcp2802/solidflow/issues/12) | Native file-dialog/editor workflows and independent interoperability. |
| Sketch offsets | [#14](https://github.com/angelcp2802/solidflow/issues/14), [#20](https://github.com/angelcp2802/solidflow/issues/20) | Broader offset acceptance and interaction for disconnected components already present in the baseline. |
| Persistent references | [#21](https://github.com/angelcp2802/solidflow/issues/21) | Review #27 and expand beyond its bounded semantic-reference family. |
| Body management | [#26](https://github.com/angelcp2802/solidflow/issues/26) | Review #29/#31/#34/#36/#37/#38/#39/#40/#41/#42/#43; broader regeneration and varying sketches, additive ALL and dynamic geometry/automatic scope, broader nested/dependent ownership, lifecycle, legacy adoption and real interaction/reference coverage. |

Assemblies, technical drawings, sheet metal, simulation and broader import and
manufacturing workflows remain part of the [roadmap](ROADMAP.md). This queue
does not reduce that scope or claim those modules are implemented.

## Collaboration and distribution

Read [CONTRIBUTING](../CONTRIBUTING.md), [development](DEVELOPMENT.md) and
[governance](GOVERNANCE.md). Keep proposals focused; state the exact commit,
commands, fixtures, tolerances and remaining limits in the pull request.
Preserve failed evidence and distinguish numerical tests, rendered components,
real interaction and exported-file checks.

The project remains GPL-3.0-only. Binary upload and releases remain gated on
the complete corresponding-source verification tracked in
[#5](https://github.com/angelcp2802/solidflow/issues/5). Successful unsigned
packaging is not release authorization.
