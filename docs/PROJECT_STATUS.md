# Project status and review queue

Snapshot: 2026-10-15, 10:22 UTC. This is a dated review index. The default branch
is the published source baseline; open pull requests are unmerged proposals.
Refresh their state, base/head and commit-specific Actions results before an
integration decision.

This queue records thirteen open, unmerged proposals: eight ready for review
(#27, #29, #31, #33, #34, #36, #37 and #39) and five drafts
(#35, #38, #40, #41 and #42).
The CAD dependency order is #27 → #29 → #31 → #34 → #36 → #37 → #38 → #39 → #40 → #41 → #42.
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

Review from the earliest unmerged prerequisite against its actual base. A child
contains unmerged ancestors; its checks do not mean those ancestors landed on
`main`. Refresh affected bases and run their required checks after a parent
changes. Do not skip draft prerequisites because a later child is ready for review.
Bounded source reviews of #40 and #41 are complete, along with the source
and local raw-evidence reviews of #42. The confirmed #38 case is unchanged on its original head; its
focused correction and the nonblocking provenance-link repair are proposed
separately in #42. These dependent proposals remain in draft. Review completion
does not expand the recorded validation scope or change a PR's state automatically.
Contributions normally start from `main`; coordinate work on an existing
increment rather than duplicating its branch.

| Parallel lane | State and base | Review purpose |
| --- | --- | --- |
| [#33](https://github.com/angelcp2802/solidflow/pull/33) | Ready for review, `main`; head `33a7d843` before this status follow-up | Project index, review queue and matching Node type-update policy. Its main-based checks do not exercise the stacked CAD suites. |
| [#35](https://github.com/angelcp2802/solidflow/pull/35) | Draft, `main`; head `0a0ab22a` | Desktop outcome/cleanup diagnostics and normal quit after readiness. Review its separate macOS crash and retained local failures. |

All thirteen proposals remain unmerged. This index records PR state and evidence,
not contributor approval or authorization to merge.

[#24](https://github.com/angelcp2802/solidflow/pull/24) and
[#25](https://github.com/angelcp2802/solidflow/pull/25) are closed as superseded
by #27. Both heads are exact ancestors of the integration; their original
branches and validation histories are retained. They were not separately merged.
[#23](https://github.com/angelcp2802/solidflow/pull/23), the Node 26 type-definition
update, is deferred under the current Node 24 policy. Its checks passed; the
deferral concerns the runtime migration policy.

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

## Parallel desktop diagnostics proposal

[#35](https://github.com/angelcp2802/solidflow/pull/35) addresses
[#30](https://github.com/angelcp2802/solidflow/issues/30) on `main`, independently
of the eleven-proposal CAD stack above. It preserves the primary launch outcome
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
| Body management | [#26](https://github.com/angelcp2802/solidflow/issues/26) | Review #29/#31/#34/#36/#37/#38/#39/#40/#41/#42; full feature regeneration/varying sketches, additive ALL and dynamic geometry/automatic scope, broader nested/dependent ownership, lifecycle, legacy adoption and real interaction/reference coverage. |

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
