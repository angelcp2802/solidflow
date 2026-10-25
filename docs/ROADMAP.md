# Roadmap

The [persisted configuration integration](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md)
connects complete v3 source/catalog/selection files to effective native scenes,
private worker previews and atomic Apply, state editing, history, recovery and
save/reopen. The [prototype walkthrough](DEMO_ASSEMBLIES.md) is a bounded route
through these controls. The [relation editing increment](ASSEMBLY_CONFIGURED_RELATION_EDITING.md)
adds state-specific declarations and graphical private previews. Configuration-aware
consumers, complete relation/capture/repair, parameter/part-feature variants and flexible instances remain
open; this is not the complete assembly/demo gate.

The standalone [selected-state solve transaction](ASSEMBLY_CONFIGURATIONS_SOLVE.md)
now connects child-before-parent execution, staged pose/winding writeback and
fresh per-instance geometry gating with a private single-use Apply boundary.
Named inheritance is isolated on base writes; shared child-state propagation
remains explicit. The persisted integration above supplies its first saved/editor
lifecycle. Parameter/part-feature variants, native capture/repair and flexible
instances remain required.

The [configured physical gate](ASSEMBLY_CONFIGURATIONS_VERIFICATION.md) adds
standalone independent measurements and fresh verification for every placed
use of the current relation inventory. The [selected-state scope prerequisite](ASSEMBLY_CONFIGURATIONS_SCOPE.md)
supplies a reusable rigid-state dependency plan and closed local numerical
adapters. The transaction above connects their standalone execution and atomic
writeback; native capture lifecycle and saved/editor integration remain open.

The [capture/winding prerequisite](ASSEMBLY_CONFIGURATIONS_STATE.md) adds strict
state keys and actual named core capture overlays. It does not implement the
remaining variant solve/writeback transaction, relation-parameter/part-feature
variants, saved/editor lifecycle or flexible instances.

SolidFlow is an early-stage parametric CAD application. This roadmap describes
work to do, not completed support or promised delivery dates.

## Current foundation

Sketch entities, local geometric constraints, driving and driven dimensions,
trim/extend, single-corner chamfers between straight sketch lines, planar
supports, reference planes and a feature history. [Sketch fillets](SKETCH_FILLET.md)
handle line/arc pairs and atomic batches of common straight-line corners, with
keep/delete policies, editable radii, source trimming/prolongation and optional
equal-radius relations. [Sketch mirror](SKETCH_MIRROR.md) copies lines, arcs and
circles with persistent point-reflection and circle-radius relations. Sketch
[offsets](SKETCH_OFFSET.md) retain support relationships, editable
separations, connected line/arc chains, disconnected components with a shared
distance, and optional end caps. Solid
operations include extrude/cut/revolve, sweep/loft, finishing, patterns/mirror,
shell/draft and hole features. Documents can be edited and recovered; geometry
can be exported as STEP and STL. [STEP import](STEP_IMPORT.md) adds one closed
solid as an owned base for downstream operations. Each operation has explicit
limitations.

Fillet and chamfer panel ordering now puts selection and size before Bodies
and Name. The original two-prism renderer passes its separate single-edge cases
in local Windows acceptance; all-edge selection, tangent propagation and broader
finishing interaction remain outside that coverage. Hosted acceptance remains
pending. Exact results and snapshot limits are tracked in [validation](VALIDATION.md).

The compact browsing body folder is now part of the document tree, with
keyboard-accessible details and separate root/folder disclosure. The new
original two-body browsing, finishing and successive-parts checks pass again
after the final removal of nested body-list scrolling. Bounded Windows manual
browsing passes at minimum and maximized sizes, and the full suite and desktop
smoke pass on the same final snapshot. Hosted acceptance of the new head remains
pending. Large catalogues, broader selection workflows and cross-platform
interaction are not established
by this bounded layout increment; see [validation](VALIDATION.md).

## Work in review

Use the dated [project status and review queue](PROJECT_STATUS.md) for the
default-branch baseline, open proposal states, dependency order and planned
integration. Refresh each proposal's actual base/head and checks before an
integration decision. The [body-management](BODY_MANAGEMENT.md),
[body-pattern](BODY_PATTERNS.md) and [feature-regeneration](FEATURE_REGENERATION.md)
contracts describe the proposed ownership, scope and regeneration boundaries;
unmerged work does not establish a completed capability on the default branch.

Commit-specific results, historical failures, security findings and remaining
acceptance work are retained in the review queue and
[validation record](VALIDATION.md), including links to each historical source.
Keep focused geometry, saved documents, scripted editor interaction, desktop
lifecycle and platform jobs distinct. Passing checks do not explain earlier
failures, establish general platform support or authorize binary publication.

## Next priorities

The [native structural STEP prerequisite](ASSEMBLY_STEP_STRUCTURE.md) preserves
an explicit AP242 product/instance graph and autonomous saved bases for
single-solid and [explicit multibody products](IMPORTED_BODIES.md). Structural
editor/worker commands are described in the separate
[editor integration](ASSEMBLY_STEP_EDITOR.md), including direct component
insertion into a captured parent scope. Broader interchange acceptance
remains open; flat geometry stays an explicit export choice. This does not close the full
assembly-demo gate.

The [rigid configuration evaluation core](ASSEMBLY_CONFIGURATIONS_CORE.md)
is a standalone declaration prerequisite. Configuration-aware native references,
variant-specific solving/writeback, saved/editor lifecycle, every graph
consumer and flexible instances still require integration and acceptance.
The separate [native context](ASSEMBLY_CONFIGURATIONS_NATIVE.md) currently
admits the existing frame/geometry/surface/profile/bounded-path query purposes
with a complete configuration lifetime. The separate
[effective relation inventory](ASSEMBLY_CONFIGURATIONS_RELATIONS.md) adds
selected declarations and native role aggregates. The standalone
[numerical and physical bridge](ASSEMBLY_CONFIGURATIONS_NUMERIC.md) adds
detached constraints and bounded independent support measurements. Production
variant-specific solve/writeback, native capture/winding transactions and editor integration
remain open; these prerequisites do not complete production configurations.

The [revolute hinge prerequisite](ASSEMBLY_HINGE_CORE.md) adds a bounded
unlimited numerical family and independent current-native measurements. The
[saved hinge integration](ASSEMBLY_HINGE.md) adds four-role intent, worker/editor
preview/Apply and repair. The [optional stop extension](ASSEMBLY_HINGE_STOPS.md)
adds six-role saved intent and independent interval verification, with a bounded
local-Z pointer stop/release workflow. Broader interval/selection policies and
full assembly acceptance remain open; these controls alone do not close them.

The local [numerical circular-path layer](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md)
extends the material-arc prerequisite with explicit domains, changing-tangent
orientation and constrained movement. The separate
[current-native bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md) now derives inputs and
independently verifies poses against the stored analytic Float64 model, with
separate center/radius/frame/sweep arithmetic and disclosed topology tolerances.
The [saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) connects explicit
intent, repair, worker/editor preview/Apply and saved reopening for open arcs.
External circular policies, complete-circle origins, multi-edge continuity,
broader interaction/repair and complete assembly/demo acceptance remain open.
Numerical/CAD and bounded renderer cases do not establish other-platform support.

1. Make Windows, macOS and Linux builds reproducible and verify real interaction
   on each platform; add signing and notarization before stable releases.
2. Improve sketch diagnostics, selection, accessibility and keyboard workflows.
3. Expand geometric regression cases, document migrations and reference stability.
4. Improve robustness and performance on larger feature histories and complex
   topology; develop a fuller body manager and persistent reference system.
5. Add missing sketch tools, import workflows, assemblies, technical drawings
   and manufacturing modules as separately scoped proposals with acceptance tests.

[Semantic face/edge references](https://github.com/angelcp2802/solidflow/issues/21)
remain an architecture priority. Current geometric keys deliberately require
reselection for some edits that retain topology, including a resized hole in
an unchanged plate; they are not complete persistent topological naming.

The staged [sketch fillet issue #6](https://github.com/angelcp2802/solidflow/issues/6)
remains open. Remaining scope includes full-circle sources, batches with curved
or virtual corners and broader curved-pair robustness.
The current browser interaction covers linked fillets on a rectangular plate;
the closed line–arc example has analytical CAD evidence but has not been edited
through the real UI. Final interaction regressions for legacy conversion and
undo/reference reconciliation, plus interactive reopening of the saved browser
document, remain unexecuted. See the [fillet guide](SKETCH_FILLET.md) and
[validation record](VALIDATION.md) for the evidence and its limits.

Internationalization, packaging for additional architectures and contributor
onboarding are welcome contributions. Discuss large architectural changes in
an issue before implementation. See [CONTRIBUTING](../CONTRIBUTING.md).
