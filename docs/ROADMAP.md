# Roadmap

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
