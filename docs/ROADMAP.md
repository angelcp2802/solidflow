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

The [project status and review queue](PROJECT_STATUS.md) separates the default
branch from the draft CAD stack: [#27](https://github.com/angelcp2802/solidflow/pull/27)
for sketch identities and bounded semantic references, then
[#29](https://github.com/angelcp2802/solidflow/pull/29) for explicit body management,
then [#31](https://github.com/angelcp2802/solidflow/pull/31) for body-aware sweep
and loft, then [#34](https://github.com/angelcp2802/solidflow/pull/34) for explicit
body ownership in linear/circular patterns and mirror, then
[#36](https://github.com/angelcp2802/solidflow/pull/36) for selected historical
feature-geometry contributions routed to current owned bodies, then
[#37](https://github.com/angelcp2802/solidflow/pull/37) for initial selected
per-instance regeneration of intrinsic rectangle/circle cut and merge recipes
with blind/ThroughAll endings, then
[#38](https://github.com/angelcp2802/solidflow/pull/38) for cut-only regenerate/false
ALL over the complete current body catalog without a saved target snapshot, then
[#39](https://github.com/angelcp2802/solidflow/pull/39) for a typed UntilNext
intersection/ownership foundation without saved recipe or scope-policy activation.
The current #38 source `06cfdd5c` retains 279 runtime inputs and changes two
child path-resolution calls to the native API in its
[instrumented desktop regression](https://github.com/angelcp2802/solidflow/blob/06cfdd5cdccb5dac930d7d8c5b30c2300549b6a7/scripts/desktop-pattern-all.cjs)
with an
[original synthetic fixture](https://github.com/angelcp2802/solidflow/blob/06cfdd5cdccb5dac930d7d8c5b30c2300549b6a7/src/cad/fixtures/pattern-all-original.json).
Its [CI](https://github.com/angelcp2802/solidflow/actions/runs/38550096433) and
[security](https://github.com/angelcp2802/solidflow/actions/runs/38550096455) runs
have six successful checks: all three configured platforms passed 2,198 tests
in 125 files, 11 IPC checks, the 1,985-module build and initial-model smoke.
The selected-to-ALL preview/Apply/save/reopen check completed four distinct
worker builds, actual child close and profile deletion; packaging used
`--publish never`. Current local evidence remains
failed: 81 default-suite timeouts, a 45-second desktop deadline and incomplete
ALL interaction/8.3 paired controls. Hosted success does not explain them.
Three new medium CodeQL alerts remain pending triage; the audit's eight
moderate development-package entries concern one GHSA, with no patched sprintf
version listed. Development flags do not establish absence of CI exposure.
The review queue records the source-specific security and failure details.

Earlier `f65d6f1b` local Windows selected-to-ALL preview, Apply, save/reopen and
TEMP-alias passes retain their bounded scripted-interaction scope. For historical
[documentation head `4f9d8a19`](https://github.com/angelcp2802/solidflow/blob/4f9d8a195bd62c462518bcf9530809466bffecda/docs/VALIDATION.md),
the added interaction command passed on Linux/macOS and failed at the Windows
profile guard before its UI workflow; Windows packaging was skipped. The
[historical CI run](https://github.com/angelcp2802/solidflow/actions/runs/38531791880)
was not green. The earlier `4a2cee2c` six-check pass also remains separate.
Geometry/true retains selected targets. Full regeneration, other end/start
conditions, varying sketches, additive ALL, dynamic geometry/automatic scope
and broader nested/dependent ownership and lifecycle behavior remain required.
For #39 head `0629b3a7`, [CI](https://github.com/angelcp2802/solidflow/actions/runs/38572088904)
and [security](https://github.com/angelcp2802/solidflow/actions/runs/38572089487)
have six successful checks. Each configured platform passed 2,217 tests in 126
files, including the 19 component cases, 11 IPC checks, build 1,985, initial-model
smoke, the inherited four-phase selected-to-ALL workflow and packaging with
`--publish never`. Local evidence remains mixed: focused 19, separate IPC 11 and
build passed; default full failed with 176 test timeouts, 35 hook-related skips
and a worker warning; desktop failed at 45 seconds. The two-worker comparison
was aborted with at least 70 observed failures and no complete outcome. These
results neither explain those failures nor activate UntilNext in saved patterns.
Its original inline fixtures and source-specific history are recorded in the
[proposal ledger](https://github.com/angelcp2802/solidflow/blob/0629b3a733b8d98cec586fbe6e79d2265cadda37/docs/VALIDATION.md#untilnext-resolution-foundation--2026-10-14).
The three medium #38 alerts and eight moderate development-package entries
remain unresolved; #35's separate macOS crash remains unknown.

These proposals have not merged. Their
checks and remaining acceptance work are recorded separately from the foundation
above.

The independent [desktop diagnostic proposal #35](https://github.com/angelcp2802/solidflow/pull/35)
targets `main` for [issue #30](https://github.com/angelcp2802/solidflow/issues/30).
It is a parallel maintenance lane. Current head `0a0ab22a` passes hosted
Windows/Linux checks, but macOS unit/CAD terminates with a bus error before IPC
or desktop smoke. Its local desktop command now passes after normal quit;
one full-suite CAD timeout remains recorded separately. The review queue keeps
earlier failures and source-specific results. The issue stays open for review
and remaining real desktop acceptance.

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
