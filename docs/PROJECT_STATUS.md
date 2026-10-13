# Project status and review queue

Snapshot: 2026-10-14. The default branch is the published source baseline;
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
| 4 | [#34](https://github.com/angelcp2802/solidflow/pull/34) | `feat/body-sweep-loft` (#31) | Explicit body ownership for linear/circular patterns and mirror: exact current/historical sources, persistent instance outputs and targeted merge. |

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

## Parallel desktop diagnostics proposal

[#35](https://github.com/angelcp2802/solidflow/pull/35) addresses
[#30](https://github.com/angelcp2802/solidflow/issues/30) on `main`, independently
of the four-proposal CAD stack above. It preserves the primary launch outcome
alongside cleanup errors and retains isolated temporary data when the owned
child's close was not observed. It is draft and unmerged; #30 remains open.

For source `b488bc3`, the [CI run](https://github.com/angelcp2802/solidflow/actions/runs/38476808951)
and [security run](https://github.com/angelcp2802/solidflow/actions/runs/38476808925)
have six successful checks, testing merge `0160695` with `main` at `43c7573`.
Each Windows x64, Linux x64 and macOS arm64 log records 1,492 unit/CAD cases in
74 files, 31 Node cases, the 1,972-module build, an initial-model Electron/WASM
smoke pass with no console errors or failed requests, and packaging with
`--publish never`. CodeQL passed; the audit retained eight moderate findings.
Packaging logs are not independent evidence of binary signing or notarization.

The updated local source passed 31 IPC cases, including the original VM
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
| Body management | [#26](https://github.com/angelcp2802/solidflow/issues/26) | Review #29/#31/#34, persistent pattern/mirror outputs, legacy adoption and wider interaction/reference coverage. |

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
