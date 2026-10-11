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
circles with persistent point-reflection and circle-radius relations. Solid
operations include extrude/cut/revolve, sweep/loft, finishing, patterns/mirror,
shell/draft and hole features. Documents can be edited and recovered; geometry
can be exported as STEP and STL. Each operation has explicit limitations.

## Next priorities

1. Make Windows, macOS and Linux builds reproducible and verify real interaction
   on each platform; add signing and notarization before stable releases.
2. Improve sketch diagnostics, selection, accessibility and keyboard workflows.
3. Expand geometric regression cases, document migrations and reference stability.
4. Improve robustness and performance on larger feature histories and complex
   topology; develop a fuller body manager and persistent reference system.
5. Add missing sketch tools, import workflows, assemblies, technical drawings
   and manufacturing modules as separately scoped proposals with acceptance tests.

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
