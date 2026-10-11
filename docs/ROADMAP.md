# Roadmap

SolidFlow is an early-stage parametric CAD application. This roadmap describes
work to do, not completed support or promised delivery dates.

## Current foundation

Sketch entities, local geometric constraints, driving and driven dimensions,
trim/extend, planar supports, reference planes and a feature history. Solid
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

Internationalization, packaging for additional architectures and contributor
onboarding are welcome contributions. Discuss large architectural changes in
an issue before implementation. See [CONTRIBUTING](../CONTRIBUTING.md).
