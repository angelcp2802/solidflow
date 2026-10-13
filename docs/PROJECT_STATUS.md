# Project status and review queue

Snapshot: 2026-10-13. The default branch is the published source baseline;
open pull requests are proposals. Check their current state and commit-specific
Actions results before using this snapshot to make a decision.

## Default branch and proposed CAD work

The baseline for this snapshot is `main` at
`43c7573c688b35a0bb70a0206416fff17ae298cd` (application version 0.19.0).
The capabilities in the [README](../README.md) and [roadmap](ROADMAP.md)
describe that baseline. The following CAD increments are still draft proposals,
with dependencies that determine their review order:

| Review order | Pull request | Base branch | Proposed scope |
| --- | --- | --- | --- |
| 1 | [#27](https://github.com/angelcp2802/solidflow/pull/27) | `main` | Generated sketch identities and opt-in semantic references for a bounded finite-prism family; retain conservative geometric references elsewhere. |
| 2 | [#29](https://github.com/angelcp2802/solidflow/pull/29) | `feat/semantic-reference-integration` (#27) | Explicit body catalog, exact body-state references, targeted operations and Combine. |
| 3 | [#31](https://github.com/angelcp2802/solidflow/pull/31) | `feat/body-catalog-combine` (#29) | Explicit new-body and targeted-merge ownership for sweep and loft. |

Review each increment against its stated base. A downstream draft includes
unmerged prerequisites; its checks do not mean those prerequisites have landed
on `main`. Contributions normally start from `main`; coordinate a change to a
draft increment with its existing branch and issue instead of duplicating it.

[#24](https://github.com/angelcp2802/solidflow/pull/24) and
[#25](https://github.com/angelcp2802/solidflow/pull/25) are closed as superseded
by #27. Both heads are exact ancestors of the integration; their original
branches and validation histories are retained. They were not separately merged.
[#23](https://github.com/angelcp2802/solidflow/pull/23), the Node 26 type-definition
update, is deferred under the current Node 24 policy. Its checks passed; the
deferral concerns the runtime migration policy.

## Evidence and review still required

The recorded runtime heads of #27 (`ac7e21f`), #29 (`b12c71b`) and #31 (`e326878`)
each have six successful hosted checks, including configured desktop jobs on
Windows x64, Linux x64 and macOS arm64.
Those jobs exercise programmatic tests, an isolated initial-model Electron
smoke check and unsigned packaging. They do not establish complete interactive
coverage, independent interoperability or general platform support. They also
do not replace review by another contributor.

Local failed runs remain recorded in each proposal and its validation history.
For #31's integrated runtime source `e326878`, the final local full run reported
1,722 passed and 84 timed-out cases (81 at 5 seconds and three at 60 seconds).
The separate IPC run passed 11 tests. The desktop smoke command failed while
cleaning up the temporary profile's `DIPS-wal` file and emitted no readiness
report; its initial-model outcome remains unknown.
The hosted full suite passed 1,806 cases in 97 files
on each of its three configured platforms. Preserve both results when reviewing
the change; a green hosted run does not explain a local failure.

Known unresolved diagnostics have separate issues:

- [#28](https://github.com/angelcp2802/solidflow/issues/28): an earlier Linux
  portable-test exit 139 with a segmentation-fault diagnostic. The crashing
  component and cause remain unknown despite a passing repeat.
- [#30](https://github.com/angelcp2802/solidflow/issues/30): preserve primary
  desktop smoke failures when temporary-profile cleanup also fails.
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
| Body management | [#26](https://github.com/angelcp2802/solidflow/issues/26) | Review #29/#31, persistent pattern/mirror outputs, legacy adoption and wider interaction/reference coverage. |

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
