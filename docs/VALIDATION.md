# Validation

## Body integration development snapshot — 2026-10-13

The body work is on `feat/body-catalog-combine`, based on the reference
integration in PR #27. The current source is commit
`2ebc22e6b971972c133e74edd5a9fd93a84e5394` in
[draft PR #29](https://github.com/angelcp2802/solidflow/pull/29).
The final build, full-suite, standalone IPC, desktop and hosted results below
cover this source; earlier focused runs and their corrections are retained
separately.
Local checks used Windows x64, Node 24.11.1 and Vitest 5.0.3. They do not
establish platform support or complete the body-management checklist in
[issue #26](https://github.com/angelcp2802/solidflow/issues/26).

- `npm run build`: passed TypeScript and the production build (1980 modules).
  All 232 recorded source/configuration inputs were unchanged during the run.
  The final build includes the test-fixture correction and three additional
  scoped-finish tests described below; the earlier successful build preceded
  those test-only edits.
- The document/command/SSR/display-selection suite passed 68 tests in six
  files, with no skipped cases, in 34.39 seconds. It covers parsing and
  dependencies, command invalidation, selection namespaces, display occlusion,
  panels and body-limit transitions. It is not real application interaction.
- The first focused CAD/selection run passed 142 and failed 22 of 164 tests
  in ten files (eight passed, two failed), in 657.38 seconds. Its 232 recorded
  inputs were unchanged. All 29 engine body-workflow cases passed, including
  analytical geometry, current body references, failure atomicity, save/reopen,
  history and fresh same-kernel STEP checks. The two new shared-curved-target
  cases and four semantic-limit cases also passed.
- Of those 22 failures, 21 were unchanged 5000 ms budgets in existing
  extrusion-limit tests. The remaining assertion received "This object has
  been deleted" instead of the expected solid-count rejection. Investigation
  confirmed that the test's compound builder consumed the borrowed candidate
  wrappers before the assertion. The fixture now transfers clones and checks
  both originals again after rejection. The subsequent catalog-only run passed
  all 29 tests in 93.38 seconds, with its 232 recorded inputs unchanged.
- Three additional scoped-finish cases for fillet, shell and draft passed
  in 149.64 seconds; the 29 earlier cases were skipped by the explicit
  `-t scoped.*finish` filter. This run retained all 232 recorded inputs
  unchanged and checked analytical geometry plus fresh same-kernel STEP.
  The current engine workflow file contains 32 cases.
- Full `npm test` exited 1: 1680 passed and 60 failed of 1740 tests in
  93 files (77 passed, 16 failed), in 616.76 seconds. All 60 reported failures
  were timeouts: 56 at unchanged 5000 ms budgets and four at unchanged
  60000 ms budgets. No assertion, crash or hook failure was reported in this
  run. Its 232 recorded inputs were unchanged. The cause remains unproven;
  these results do not establish that the affected behavior is defect-free.
  The command stopped before IPC because its scripts are joined by `&&`.
- A subsequent standalone `npm run test:ipc` passed all 11 tests, with no
  failed, cancelled or skipped tests, in 22495.8097 ms. Its 232 recorded
  inputs were unchanged. This separate result does not turn the failed
  `npm test` invocation into a pass.
- The local `npm run test:desktop` exited 1 with an `EBUSY` error while
  removing the temporary profile's `DIPS` file. Its 232 recorded inputs
  were unchanged. The log emitted no readiness result or timeout diagnostic,
  so it does not establish whether the initial model became ready or why
  the profile file remained locked. This invocation is not a passing smoke
  check.

Hosted checks for this body source passed in
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38353551009)
and [security analysis](https://github.com/angelcp2802/solidflow/actions/runs/38353551184),
with all six required checks successful. The pull-request head was
`2ebc22e6b971972c133e74edd5a9fd93a84e5394`, the base was
`ac7e21fd66cdfc197057a8995ff3dc5d494d4717`, and the checked-out merge commit
was `5af2989c26c2c7a7700d80f0bc1e6f4f1e6c3d1e`.

| Hosted platform | Node | Unit/CAD result | Vitest duration |
| --- | --- | --- | --- |
| Windows x64 | 24.21.0 | 1740 passed in 93 files | 40.27 s |
| Linux x64 | 24.21.0 | 1740 passed in 93 files | 30.17 s |
| macOS arm64 | 24.20.0 | 1740 passed in 93 files | 45.06 s |

All three jobs used npm 11.19.0 and Vitest 5.0.3. Each passed the 32 engine
body-workflow cases and 29 native catalog cases, all 11 IPC tests, the
1980-module production build, the Electron smoke check and unsigned packaging
with `--publish never`. The smoke reports recorded WASM loaded, no console
errors and no failed requests. These are executed checks for this source;
they do not validate interactive body editing, installer use or complete
platform support. CodeQL succeeded. The dependency audit passed its
high/critical gate while retaining eight moderate findings; a passing gate
does not mean an empty audit.

Retained local log SHA-256 digests identify the final runs without publishing
local artifacts:

| Local command | Log SHA-256 |
| --- | --- |
| `npm run build` | `61c14da9d122605a5c985e152315c8f2ed2b2cc8d12f06e917e909cb31dd8e9c` |
| `npm test` | `fae871f7ce2aa731d7900854a3c6e43470207224ec87e7842fa821cd44ae5e64` |
| `npm run test:ipc` | `60532b93499999706a0d950b46d0d910a0593476c190d07d08fcc0a2c28dbaa9` |
| `npm run test:desktop` | `592f47bc30a0dd581deadbee7f442d48a27b3a7eecedecf30df9cddc2dc3fc7b` |

The focused suites can be reproduced without private artifacts:

```sh
npm run test:unit -- src/model/bodyReferences.test.ts src/model/bodyCommands.test.ts src/cad/body-selection.test.ts src/components/BodyManagementPanel.test.tsx src/components/Viewport.bodies.test.ts src/components/ExtrudePanel.body-limit.test.ts
npm run test:unit -- src/cad/kernel.bodies.test.ts src/cad/kernel.body-workflow.test.ts src/cad/kernel.extrusion-limits.test.ts src/cad/kernel.semantic-catalogs.limits.test.ts src/model/bodyReferences.test.ts src/model/bodyCommands.test.ts src/cad/body-selection.test.ts src/components/BodyManagementPanel.test.tsx src/components/Viewport.bodies.test.ts src/components/ExtrudePanel.body-limit.test.ts
```

Native body geometry uses absolute 5e-6 volume/area/bounds comparisons and
5e-7 face-coordinate selection where stated. STEP reimport uses the same
kernel; these cases do not establish independent interoperability or transport
of parametric history/body IDs through STEP. The initial catalog policy rejects
empty, disconnected or split outputs requiring undeclared body identities.
Sweep, loft and repetition producers still need explicit body-output ownership.

## Evidence scope

The public repository uses a self-contained suite. Claims are limited to the
cases checked, with the tolerances recorded in each test.

| Command | Evidence |
| --- | --- |
| `npm run test:unit` | Sketch geometry, solver, documents, CAD operations and saved UI fixtures |
| `npm run test:ipc` | Main-process IPC security and boundary checks |
| `npm run build` | TypeScript compilation and production Vite build |
| `npm run test:desktop` | Real Electron production page, preload, worker, WASM and first solid |
| `npm run package:<platform>` | Packaging for the host OS, without publication |

CAD checks use known coordinates, analytical formulas, valid BRep/solid counts,
volume, area, bounds and relevant Boolean differences. A matching volume alone
is insufficient evidence of identical geometry. Saved documents are parsed and
rebuilt; UI-export fixtures are identified separately from programmatic outputs.

GitHub Actions runs the portable suite, build, IPC and Electron smoke on
Windows x64, macOS arm64 and Linux x64, and packages each platform. Its actual
runs are authoritative; workflow configuration alone does not establish a pass.
CodeQL and a dependency audit run separately. The audit includes development
dependencies, blocks high/critical findings and leaves moderate findings visible.

Development packages are unsigned. Successful packaging does not establish
successful installation, notarization or all interactive workflows on that OS.
The project does not yet have exhaustive topology, numerical robustness,
accessibility, performance or platform coverage.

## Semantic reference integration — 2026-10-13 (in progress)

This branch combines the generated-sketch identity prerequisite with the prism
reference modules, then connects the engine, document parser and UI selection
aliases. Newly written context, persistence, consumer and selection tests are
tracked separately from their execution. The results below distinguish passing
hosted checks from failed local complete-suite and desktop runs. Interactive
editor workflows have not been checked for this integration source.

On Windows x64 (10.0.26200), Node 24.11.1, npm 11.6.2 and Vitest 5.0.3, a
focused invocation of the installed Vitest entrypoint passed all 44 cases in
three files, exiting 0 in 52.13 seconds of Vitest time:

- `src/cad/kernel.semantic-context.test.ts`: 17 pure ancestry/context cases.
- `src/model/document.semantic-references.test.ts`: 13 document cases.
- `src/cad/selection.references.test.ts`: 14 symbolic DTO-selection cases.

The invocation used `run --config vitest.config.ts`, those three file paths
and `--pool=threads`. No worker-count or timeout overrides were added to the
command or configuration. The recorded `CI`, `NODE_OPTIONS`,
`UV_THREADPOOL_SIZE` and Vitest environment variables were absent; this was
not an exhaustive inventory of environment variables.
Eleven recorded files had identical hashes before and
after the run. These checks do not initialize WASM, build native geometry or
execute editor events. Later edits to the native fixtures are not validated
by this pure run.

The first integration `npm run build` exited 1 with two TS2339 diagnostics in
`kernel.semantic-context.ts`: the dependency-selection expression did not
explicitly narrow its final branch to a sketch before accessing `support`.
The source now checks `feature.type === 'sketch'` in that branch. The repeat
`npm run build` exited 0, passing TypeScript and the production Vite build,
with the existing `node:module` externalization and large-chunk warnings.
All 219 recorded inputs were unchanged during each build. The earlier
44-case pure run precedes the correction; the later focused run also exercised
the affected context cases.

The separate `npm run test:ipc` check also exited 0: all 11 checks passed,
with zero failures, cancellations or skips (30,496.674 ms reported by Node's
test runner). This is an IPC result, not a completed `npm test` or desktop
loader result for the integration source.

At integration commit `42840c0e3b77d33d896e009edd402c4271531edb`, the focused
`npm run test:unit -- src/cad/kernel.semantic-engine.test.ts
src/cad/kernel.semantic-face-operations.test.ts
src/cad/kernel.semantic-context.test.ts` run exited 1: 29 cases passed and
7 failed in 556.15 seconds, across two failed files and one passed file.
All 219 recorded inputs remained unchanged. Four failures occurred while
constructing the rectangular face-operation fixture, before its assertions:
the producer unconditionally copied a face and checked `IsDone()` even when
there were no holes to add. One engine assertion found no displayed rim for
the other hole. The fillet and historical support/up-to-surface cases each
reported the existing 60,000 ms timeout locally. These are distinct diagnostics;
the construction error does not explain the timeout results.

Hosted [CI run 38335538773](https://github.com/angelcp2802/solidflow/actions/runs/38335538773)
for that exact head completed with 1,521 passed and 87 failed portable cases
on each of Windows x64, Linux x64 and macOS arm64 (17 failed and 68 passed
files). All three builds passed; their IPC, Electron smoke and packaging
steps were skipped after the portable failures. The hosted logs reproduce the
four fixture construction errors and the missing-rim assertion, but contain
no timeout diagnostics. The other hosted failures require revalidation after
the producer correction, rather than an assumption that they share its cause.
[Security run 38335538770](https://github.com/angelcp2802/solidflow/actions/runs/38335538770)
passed CodeQL and the configured high/critical audit gate. Eight moderate
dependency findings remain visible through the packaging-tool dependency
chain; passing that gate does not mean an empty audit report.

The subsequent correction reuses the already validated exterior face when
there are no holes and retains face repair, BRep validity and correspondence
checks. Partial fixture setup is now covered by cleanup. A new engine case
uses actual deletion and offset recreation, in addition to the existing
same-geometry identity replacement case. These edits need their own results;
the preceding 36-case run does not validate the changed source.

The displayed-rim helper now allows the installed mesh extractor's bounded
Float32 coordinate rounding, while new fresh-STEP checks evaluate eight
parameters on each closed native hole circle at unchanged absolute `5e-7` mm
radial/z tolerance. This distinguishes display coordinates from native geometry;
the old failure log does not contain coordinates from which to measure its
exact error. The local build after these changes passed TypeScript and Vite
(1,976 modules, 1 minute 26 seconds reported by Vite), with all 219 recorded
inputs unchanged and the existing warnings. This precedes a final finite-value
guard in that test helper; final-source results are recorded separately below.

### Corrected integration source `5f5bc3c`

At commit `5f5bc3c8a73f84396fdbe331e36a136c2daa1ff2`, the final local
`npm run build` exited 0 after the finite-value guard, passing TypeScript and
Vite (1,976 modules, 1 minute 18 seconds reported by Vite), with the existing
externalization and large-chunk warnings. All 219 recorded inputs were unchanged.
The local `npm run test:desktop` exited 1 with the sole diagnostic
`Electron no terminó en 45 segundos.` Its 219 recorded inputs were also
unchanged. The failing loader stage and underlying cause are not established;
this is not a local smoke pass.

A separate instrumented desktop diagnostic also exited 1 with all 219 recorded
inputs unchanged. It retained the 45/35/25-second budgets, sandbox, hidden window
and isolated user data, but used a private instrumented entrypoint. Recorded
elapsed stages reached application readiness at 4.659 seconds, window creation
at 8.377 seconds, the HTML response at 11.003 seconds, JS/CSS responses at
20.805 seconds, DOM/load at 23.264 seconds, the worker response at 25.523 seconds
and the WASM response at 29.778 seconds. These responses had HTTP status 200.
The outer 45-second deadline fired at 47.489 seconds; the child later exited
with SIGTERM at 60.458 seconds. No post-inspection, completion, inner 35-second
timeout or initial-model readiness event was recorded before termination.
These observations do not establish kernel compilation time, the blocking
stage or the cause of the original smoke failure, and are not a passing smoke.

On Windows x64 with Node 24.11.1, npm 11.6.2 and Vitest 5.0.3, the full
local `npm test` exited 1: 1,547 passed and 62 failed portable cases out of
1,609, across 17 failed and 68 passed files (85 total). Vitest reported
792.96 seconds. The command and configuration used the project defaults,
without worker-count or timeout overrides, and all 219 recorded inputs stayed
unchanged. IPC did not execute because the unit phase failed in
`npm run test:unit && npm run test:ipc`.

Exhaustive classification of that local log distinguishes these diagnostics:

| Failed cases | Diagnostic |
| --- | --- |
| 57 | Vitest timeout at 5,000 ms |
| 1 | Vitest timeout at 15,000 ms in the 8 MiB STEP-source boundary case |
| 3 | Vitest timeout at 60,000 ms in semantic-engine continuity/history, hole fillet and historical support/up-to-surface cases |
| 1 | The connected 128-point solver case expected `fullyDefined` but received `notConverged`, with the solver's calculation-time-limit message |

The solver assertion is distinct from a Vitest timeout. This classification
does not establish the cause of either diagnostic. Of the 37 affected cases
(14 semantic-engine, six semantic face-operation and 17 semantic-context),
34 passed locally and the three engine cases above timed out. No geometric
assertion, timeout budget or production solver tolerance was relaxed.

Hosted [CI run 38338860064](https://github.com/angelcp2802/solidflow/actions/runs/38338860064)
checked that same source. Its actual platform results are:

| Platform | Portable and IPC results | Build, initial-model smoke and unsigned packaging |
| --- | --- | --- |
| Windows x64, Node 24.21.0 | 1,609 portable cases in 85 files and 11 IPC checks passed | Passed |
| macOS arm64, Node 24.20.0 | 1,609 portable cases in 85 files and 11 IPC checks passed | Passed |
| Linux x64, Node 24.21.0, first attempt | Process exited 139 with `Segmentation fault (core dumped)`; no final suite summary or IPC run | Build passed; smoke and packaging skipped |
| Linux x64, Node 24.21.0, one controlled repeat | 1,609 portable cases in 85 files and 11 IPC checks passed | Passed, with Xvfb for smoke |

The first Linux [job 115105089584](https://github.com/angelcp2802/solidflow/actions/runs/38338860064/job/115105089584)
reported 1,059 passing cases in 41 files before the crash; these are partial
counts. The complete log contains no native or Node backtrace, assertion,
timeout, out-of-memory or worker-error diagnostic identifying its cause.
The last reported test does not identify the crashing component. The single
[repeat, job 115108175082](https://github.com/angelcp2802/solidflow/actions/runs/38338860064/job/115108175082),
used the same head, configuration, Ubuntu 24.04.5 runner image, Node 24.21.0,
npm 11.19.0 and Vitest 5.0.3, and passed. This does not explain or resolve the
first crash. Windows and macOS were not rerun. Their logs and the Linux repeat
explicitly passed all 37 affected cases, including the actual offset-image
deletion/recreation case: only the recreated image has the new 1.5 mm driver;
the other offset remains free.

All six hosted checks for this head finished successfully after that repeat.
[Security run 38338859971](https://github.com/angelcp2802/solidflow/actions/runs/38338859971)
passed CodeQL and the configured high/critical audit gate; eight moderate
dependency findings remained visible. These hosted results do not replace the
failed local checks, establish the crash's cause or prove complete platform
and interactive-workflow coverage. Packaging is without publication, and
binary upload remains gated by issue #5.

The earlier opt-in module source
`52508a0214ad7b36b5e1b18df797c34d20400ad1` has separate evidence. Its local
build passed, as did 42 focused tests in four files. Hosted CI for that exact
head passed 1,534 portable tests and 11 IPC tests on each of Windows x64,
Linux x64 and macOS arm64, along with build, initial-model Electron smoke and
packaging without publication. Those runs do not validate this later activation.

On Windows x64, Node 24.11.1 and npm 11.6.2, that module source's full local
`npm test` exited 1 after 843.14 seconds, using the project runner defaults with
`VITEST_MAX_WORKERS` unset. It reported 1,420 passed and 114 failed tests
(1,534 total), in 15 failed and 63 passed files (78 total). Exhaustive log
classification assigned all 114 failures to timeout diagnostics: 108 at
5,000 ms, five at 30,000 ms and one at 60,000 ms. No assertion failures or
additional worker/unhandled-error diagnostics were found in that log. IPC did
not run because the unit phase failed. This is a failed check; its underlying
cause is not established by the timeout classification or hosted passes.

A separate, single-test reproduction on that same module source selected
`builds a simple with exact volume and a flat blind bottom` in
`src/cad/kernel.holes.test.ts`. With runner defaults and the existing budgets
unchanged, it exited 1: the one selected test timed out at 5,000 ms and 34
unselected tests were filtered out. Vitest reported 104.77 seconds overall;
the selected case was reported at 27,250 ms. This establishes that a local
timeout also occurred outside a full-suite run. It does not identify its cause
or establish a concurrency, geometry or runtime regression.

The same module source's local desktop smoke exited 1 at its 45-second outer
deadline without a completion report. The failing stage and cause were not
established. Initial-model smoke, packaging and programmatic STEP round trips
do not establish full platform support, interaction coverage or independent
CAD interoperability. Binary publication remains gated by issue #5.

## Generated sketch identity prerequisite — 2026-10-13

On Windows x64, source head `857838149858d6eb926d223ead2ccdc5b881d0fd`,
Node 24.11.1 and npm 11.6.2, `npm test` with `VITEST_MAX_WORKERS=1`
exited 1 after 4,219.39 seconds. The portable phase reported 1,381 passed
and 122 failed tests (1,503 total), across 15 failed and 61 passed files
(76 total). All 122 reported failures were test timeouts: 121 at 5,000 ms
and one at 15,000 ms. IPC did not execute because the unit phase failed in
`npm run test:unit && npm run test:ipc`. Test selection, assertions and
existing timeout budgets were unchanged. The underlying cause has not been
established.

All six hosted checks passed on that same source head, recorded separately
in [PR #24](https://github.com/angelcp2802/solidflow/pull/24). Their platform
results do not change this failed local result or establish exhaustive
platform or interactive-workflow coverage. Subsequent heads require their
own checks before merge.

## Disconnected sketch offsets — 2026-10-12

Local evidence for this increment is from Windows x64 with Node 24.11.1.
The nine new CAD cases passed in a focused run. TypeScript/Vite production
build passed with the existing large-chunk and dependency-externalization
warnings. The first complete unit run finished with 1,380 passed and 112
failed tests across 74 files; IPC did not run because the unit command failed.
All 112 reported failures were timeouts: 104 at 5 seconds, one at 15 seconds
and seven at 30 seconds. There was also a worker-termination timeout warning.
That run used the default file-worker limit on a 16-processor host. The second
complete `npm test` run, with `VITEST_MAX_WORKERS=2`, exited 1 after 1,397.13
seconds: 1,431 passed and 61 timed out (60 at 5 seconds, one at 30 seconds),
across 14 failed and 60 passed files. IPC did not run because the unit command
failed. Test selection, assertions and existing timeout budgets were unchanged.
Running `npm run test:ipc` separately then passed all 11 checks, with no failures,
cancellations or skips; this does not change either failed complete-suite result.
The first local Electron smoke exited at its existing 45-second limit before
readiness was established. One retry after the complete unit runs had terminated
also exited at the unchanged 45-second limit without establishing readiness.
No complete local-suite or local-loader pass is claimed for this increment.
A bounded resource observation found significant external CPU load, but it
does not establish the sole cause of these outcomes.

A fresh isolated `npm ci` passed from the 0.19.0 manifest and lockfile, whose
hashes remained unchanged. Audit reported eight moderate findings and zero
high/critical findings; none was suppressed.

All six required hosted checks passed on source head `65104a3`:
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38309109057),
[security](https://github.com/angelcp2802/solidflow/actions/runs/38309109062)
and [CodeQL](https://github.com/angelcp2802/solidflow/runs/115010656069).
Each desktop job passed all 1,492 portable tests in 74 files and all 11 IPC
checks, with no skips, plus build, real initial-model Electron smoke and
unsigned packaging. Smoke logs report WASM loaded, zero console errors and
zero failed requests. Windows x64 and Linux x64 used Node 24.21.0; macOS arm64
used Node 24.20.0. These are results for the recorded source and workflows,
not exhaustive platform or interactive-tool validation. Subsequent heads
still require their own checks before merge.

The original Cartesian CAD fixture is a 50×20 mm plate, 4 mm deep, with
two circular holes. Their source radii 3 and 5 mm, separated by 20 mm, share
an outward offset of 2 mm, giving hole radii 5 and 7 mm. Independent planar
area and perimeter are `S=1000−π(rA²+rB²)` and `P=140+2π(rA+rB)`;
the prism uses `V=4S` and `A=2S+4P`. At radii 5 and 7 this gives
`V=4000−296π` mm³ and `A=2560−52π` mm². Tests check both selection
orders, one programmatic history entry, undo/redo, exact document reopening,
valid BRep, one solid, bounds and fresh programmatic STEP export/reimport.

A second plate starts with source radii 2 and 5 mm and offset 1 mm. Shared
distance 1→1.5 and source radius 2→2.25 edits rebuild the analytical solid.
Unchanged exterior face/edge references and an R1 exterior-corner fillet
survive these particular edits. That fillet independently removes
`4−π` mm³ and `10−2.5π` mm². Resized circular rims and perforated faces
currently receive different geometric keys: a saved rim fillet rejects its
stale selection and export is blocked rather than silently selecting another
edge. General persistent naming remains open in
[issue #21](https://github.com/angelcp2802/solidflow/issues/21).

No-dimension, driven-dimension and deleted-dimension cases check a shared
offset changed through an image-radius constraint. A larger shared offset
whose circles cross the plate boundary rejects the solid without modifying
the input or exporting a stale result. Coordinates and radii use `5e-7` mm;
mass, area and bounds use absolute `5e-6` in their respective units. Healthy
solver residuals must stay within the existing `1e-7` acceptance. The new
CAD cases use a 60-second per-case budget for WASM reconstruction; geometric
criteria and production solver tolerances were not relaxed.

Core and planner coverage includes shared distance families, strict saved
references, deletion cleanup, disconnected component partitioning, per-chain
direction, atomic capacity/rejection and both-side cap coupling. Dimension
ownership, driven/deleted-dimension edits and cap coupling are explicit local
policies; equivalence to another solver is not established. Server rendering
and source review are separate from actual pointer, keyboard, cancel and
interactive history/reopening, which remain unexecuted for the new tool.
The Electron smoke exercises only the initial model. STEP producer and reader
share OpenCascade, so these round trips do not establish independent
interoperability. Broader offset coverage remains open in
[issue #14](https://github.com/angelcp2802/solidflow/issues/14), and binary
upload remains disabled under
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Owned STEP import increment — 2026-10-11

On Windows x64 with Node 24.11.1, `npm test` passed all 1,247 portable tests in
61 files and all 11 IPC checks, without skips. `npm run build` passed with the
existing dependency-externalization and large-chunk warnings. The real Electron
production-loader smoke passed with `wasmLoaded: true`, `consoleErrors: []` and
`failedRequests: []`. This smoke exercises the initial solid, not STEP file
selection or the import controls. An isolated fresh `npm ci` installed all
341 packages successfully. The dependency audit reported 0 high/critical and
8 moderate development findings; none is suppressed.

This increment adds 126 portable cases and 3 IPC checks. They cover exact owned
bytes, canonical base64, SHA-256 integrity and the 8 MiB source boundary;
strict additive version-1 parsing; first-solid and single-import ownership;
history, suppression, deletion and reference dependencies; and atomic import
preparation. Transaction cases reject malformed files, failed construction,
cancelled replacement and stale document/edit contexts before a commit.
Transport checks resend the complete source after worker replacement and
export a committed snapshot independently of another build. Real main-process
handlers, with controlled dialog transport and temporary files, check bounded
reads, exact bytes, sender identity, operation serialization and absence of a
write grant for the original STEP. These controlled checks are separate from
actual editor and native-dialog interaction, which remains unverified for this
increment.

The ten original inputs, generator and manifest are described in
[PROVENANCE.md](PROVENANCE.md). Accepted cases check a box, translation,
rotation, a true cylindrical BRep, declared inch conversion and declared metre
conversion against analytical expectations. Open shells, multiple solids,
free topology outside the solid, truncated input and an unsupported native
geometric entity reject. A closed-shell gate, BRep validity, positive volume,
one solid and complete root transfer are required. Cleanup tests check that
repeated success/failure leaves no temporary virtual import file.

The [STEP contract](STEP_IMPORT.md) records independent formulas for the
10×6×4 mm box (`V=240 mm³`, `A=248 mm²`), cylinder and unit conversions.
An imported top face supports a through-hole at `(5,3)` with radius 1 mm:
`V=240−4π` and `A=248+6π`. Editing its radius to 1.5 mm after reopening gives
`V=240−9π` and `A=248+15π/2`. A selected imported edge supports an R1 fillet.
Checks include exact source-byte reopening, face/edge reference stability,
reference invalidation after source replacement, downstream reconstruction,
suppression/deletion, undo/redo and programmatic STEP export/reimport.
Absolute mass/area/bounds tolerances are `5e-6` in their respective units;
coordinate-based selected-edge checks use `5e-7` mm. Public fixtures and round
trips use the same OpenCascade runtime for generation and consumption; they do
not establish interoperability with an independent producer or kernel.

The bounded Part 21 unit gate follows referenced 3D representation contexts
and conversion factors. It accepts SI millimetres, SI metres and declared
25.4 mm conversion units; missing, malformed, conflicting and unsupported
length declarations reject. Strings, comments and unused contexts cannot
supply a missing unit. External-resource entities and additional sections
reject before native transfer. The gate is not a full EXPRESS schema validator
and does not establish support for arbitrary STEP schemas, assemblies or
metadata. Source bytes remain embedded in the editable document; no original
path, native handle or worker cache is required to reopen it.

Hosted checks are pending for this increment's exact source head. Earlier
platform results do not establish a pass for these changes. Binary publication
remains disabled under [issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Associative sketch mirror increment — 2026-10-11

On Windows x64 with Node 24.11.1, the final `npm test` passed all 1,121 portable
tests in 55 files and all 8 IPC checks, without skips. TypeScript/Vite build
passed with the existing dependency-externalization and large-chunk warnings.
Real Electron production-loader smoke passed with WASM loaded, no console
errors and no failed requests; it exercises the initial solid, not the new
mirror controls. An isolated fresh `npm ci` succeeded without replacing the
dependencies used by a running development application. The dependency audit
reports 0 high/critical and 8 moderate development findings; none is suppressed.

The 128 added cases comprise 52 symmetry/typed-reference checks, 23 discrete
arc-direction checks, 7 document/history checks, 29 planner/application checks,
4 rendered-component cases and 13 CAD cases. They cover horizontal/vertical/
oblique and reversed axes, source/axis edits, shared points and explicit seam
joining, origin handling, linked circle radii, arc winding and major arcs,
direction chains/ownership rejection, strict fields, deletion/trim/extend/
fillet reference cleanup, version-1 round trips and atomic rejection.
Application tests distinguish stale/unhealthy sources from one whole-proposal
solve, including a real conflicting image constraint.

The [mirror guide](SKETCH_MIRROR.md) records independent plate, circular-hole,
disk and major-segment formulas. A mirrored 5×6 half-profile extruded 4 mm has
`V=240 mm³`, `A=248 mm²`; changing half-width to 7 after reopening gives
`V=336 mm³`, `A=328 mm²`. These tests check coordinates, valid BRep, one solid,
bounds, exact document reopening and programmatic STEP reconstruction. Selected
face/edge references and a dependent fillet remain valid across that width edit.
Coordinate tolerance is `5e-7` mm per axis; mass/area/bounds use absolute
`5e-6` in their respective units. A dedicated regression also changes the
source arc sense after reopening and checks the correctly reflected complete
disk, rather than accepting overlapping semicircles. Numerical refinement
reduces mirror orientation drift without changing the public solver acceptance
or the geometric naming/validity criteria. No general convergence or naming
guarantee is inferred.

Server rendering checks source/axis controls, seam sharing, the combined image
overlay, stale preview suppression and blocked application. Static integration
review confirms the single draft-history commit and configuration/source guards.
Neither executes pointer/keyboard, cancel, undo/redo or interactive reopening.
Real interaction with this tool/card remains unverified. Move without copy,
dynamic mirroring and general overlap resolution remain open in
[issue #10](https://github.com/angelcp2802/solidflow/issues/10).
This source needs its own hosted checks; earlier platform results are separate.
Binary publication remains disabled under
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Releasable line-offset endpoint following — 2026-10-12

On Windows x64 with Node 24.11.1, `npm test` passed 1,441 portable tests in
71 files and all 11 IPC checks, with no skips. TypeScript/Vite build passed
with the existing dependency-externalization and large-chunk warnings. The
isolated Electron production-loader smoke passed with WASM loaded, zero
console errors and zero failed requests; it exercises the initial model.
Fresh isolated `npm ci` installed 341 packages. Its dependency graph and
manifest match this source except for root version metadata, changed from
0.17 to 0.18 after installation. Audit: eight moderate, zero high/critical.

The 62 added cases comprise 28 core, 28 explicit-reposition and 6 CAD checks.
New no-dimension uncapped line boundaries follow independently until an
accepted explicit point edit releases the requested boundary. Checks cover
untouched source length 10→14, released end x=12, released start x=-2 with
untouched end continuing to 14, normal-only release, reversed traversal,
rotated 3-4-5 geometry, mixed line/arc boundaries and independent sides.
Strict parsing preserves false flags, rejects malformed/ineligible states
and keeps legacy absence/free mode and permanent aligned mode unchanged.
Output constraints remain hard targets; they may drive a free source or
reject a fixed-source conflict without implicitly releasing a boundary.
Local reported DOF is tested; equivalence to another solver is not claimed.

The explicit command uses the solved profile displayed to the user and rejects
stale or unhealthy sources. Full XY targets and partial X/Y targets are tested
against existing relations, including an R10 circle where X=8 permits Y=6.
Temporary target points/constraints are removed before saved rank and driven
values are calculated. Invalid IDs, origin edits, nonfinite/out-of-range
coordinates, capacity overflow and conflicting targets reject atomically.
Targets within `5e-7` mm of their current coordinate preserve following and
avoid a history write. Final requested axes must also remain within `5e-7`
mm after temporary target removal; a small equation residual alone cannot
confirm a point destination. A near-parallel support regression rejects a
request whose cleaned solution moves away from its target. A successful
release survives one programmatic undo/redo entry and saved-document reopening.
App wiring calls the command from the canvas and numeric point inspector;
focused component checks are server rendering, not pointer/keyboard execution.

The original Cartesian fixture builds a width-2, height-4 prism through two
offset associations. Independent `V=8L` and `A=12L+16` give length 14:
`V=112 mm³`, `A=184 mm²`; released end x=12: `V=96`, `A=160`;
released start x=-2 and end following to 14: `V=128`, `A=208`.
Checks establish valid BRep, one solid, bounds and fresh programmatic STEP
export/reimport. Station/target coordinates and relative separations use
`5e-7` mm; mass, area and bounds use absolute `5e-6` in their respective units.
The free normal translation is measured from the solved sketch, not asserted
to retain its seed: a nested source-length edit shifted it by approximately
`2.28e-6` mm. A partial Y request also leaves X free; the full XY normal-only
case preserves the requested station. Production acceptance was not loosened.

Face/edge references survive the tested unchanged-document reopening.
Releasing a station equation with identical coordinates changes those keys,
and a selected fillet using the obsolete key rejects instead of silently
rebinding. This is conservative naming evidence, not general persistent naming.
STEP producer and reader share OpenCascade; independent interoperability is
not established. Automatic reattachment is not implemented. Real editing,
cancel, keyboard, pointer and interactive undo/reopen remain unexecuted for
this increment under [issue #14](https://github.com/angelcp2802/solidflow/issues/14).
This source requires its own hosted checks; earlier platform results are
separate. Binary upload remains disabled under
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Aligned line-offset endpoints — 2026-10-12

On Windows x64 with Node 24.11.1, `npm test` passed 1,379 portable tests in
68 files and all 11 IPC tests, with no skips. `npm run build` passed with the
existing chunk-size and dependency-externalization warnings.
`npm run test:desktop` passed the isolated initial-model production loader:
WASM loaded, zero console errors and zero failed requests. This smoke check
does not interact with the offset tool. A fresh isolated `npm ci` installed
341 packages on the same dependency graph; the later 0.17 version change
affects only root package metadata. Audit: zero high/critical findings and
eight moderate development findings.

The increment adds 25 core cases, two document/CAD cases and one structural
naming case. Newly dimensioned uncapped line images align their endpoint
stations with the source. Checks cover source length 10→12 mm and distance
2→3 mm, bidirectional dimensions, immutable incompatible-target rejection,
reversed/vertical lines, independent sides and mixed line/arc ends. Converting
or deleting the distance dimension keeps alignment and frees only normal
separation; a driven reading measures that solved separation. Legacy absence
of `lineEndpointMode` preserves free endpoint behavior. Explicit free mode
shares its structural descriptor, while aligned mode differs. Caps, closed
groups and free arc intervals retain their prior rules.

Original Cartesian geometry exercises two successive offset associations
and a 4 mm extrusion: a 10×2 rectangle becomes 12×2, with volume 80→96 mm³
and surface area 136→160 mm². The checks establish valid BRep, one solid,
analytical bounds, saved-document reconstruction, one history entry with
programmatic undo/redo, stable selected face/edge references and a fresh
STEP export after replacing the engine's current body. Coordinate tolerance
is `5e-7` mm and CAD mass/area/bounds use absolute `5e-6` in their respective
units. The STEP producer and reader share OpenCascade; this is not independent
interoperability evidence. These selected references do not establish general
topological naming.

Free separation can move numerically while remaining unconstrained; its seed
is not a fixed target. Following an untouched no-dimension line endpoint until
the user repositions it remains open in
[issue #17](https://github.com/angelcp2802/solidflow/issues/17). Real offset-tool
interaction remains unexecuted. This revision needs its own hosted checks;
earlier platform results do not establish a pass for the new source. Binary
upload remains disabled under
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Initial public-source validation — 2026-10-11

A clean copy of the initial tracked tree, with a fresh `npm ci` on Windows x64
and Node 24.11.1, passed all 761 unit/CAD tests in 37 files and all 8 IPC tests,
with no skipped tests. TypeScript/Vite build and the real Electron production
loader also passed from that clean copy. No local capture directory was copied.

The dependency audit found 0 high/critical findings and 8 moderate findings in
the development-tool chain. The moderate advisory is not ignored; compatible
automatic remediation was not available at this check. Review dependency
updates and current advisory data instead of treating an audit pass as proof
that every dependency is vulnerability-free.

Hosted checks for the initial source commit:
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38145914642)
and [security analysis](https://github.com/angelcp2802/solidflow/actions/runs/38145914644).
Inspect each job's conclusion before making a platform claim.

## Sketch chamfer increment — 2026-10-11

On Windows x64, the final local tree passed `npm test`: 822 unit/CAD tests in
40 files and all 8 IPC tests, with no skips. TypeScript/Vite build passed.
The real Electron production-loader smoke also passed with WASM loaded and no
console errors or failed requests; it exercises the initial solid, not the
chamfer editor or native file dialogs.

The increment adds 51 core chamfer cases, 5 server-rendered component cases and
5 CAD integration cases. These cover acute/right/obtuse corners, endpoint and
selection order, fixed and virtual corners, editable driving dimensions, fresh
driven measurements, atomic rejection, stale-preview guards, persistence and
STEP reconstruction. Solid checks include analytical volume/area, bounds,
reference stability and valid single-solid BRep. Test assertions record their
tolerances. The [tool contract](SKETCH_CHAMFER.md) states the geometric scope.

Real browser interaction in an isolated local development session checked:
origin selection, ordered entity-list selection, A/B reversal, equal-distance
and two-distance previews, comma decimals, invalid-input blocking, Escape with
an input focused, apply, undo/redo, editing the setback from 2 to 1.5 mm, undoing
that edit and rebuilding the existing 4 mm extrusion. The 10 x 6 mm plate with
2/3 mm setbacks displayed 0.228 cm3 and a 10 x 6 x 4 mm envelope. Saving and
reopening the actual `.solidflow` download preserved that result.

That exact browser download is tracked as
`src/cad/fixtures/solidflow-ui/sketch-chamfer-distances-2-3.solidflow`; its fixture
README records provenance, byte count and hash. Tests read it directly without
regeneration. STEP checks here are programmatic exports, not captures from a
native desktop save dialog. SSR tests do not execute pointer or keyboard events.
Interactive chamfer evidence on macOS/Linux and the distance/angle UI flow
remain pending; numerical CAD tests cover all three parameter modes.

Hosted checks on the initial chamfer head `64ef269` passed on Windows x64,
macOS arm64 and Linux x64, including build, portable tests, IPC, real Electron
production-loader smoke and unsigned packaging:
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38158887834).
[Security analysis](https://github.com/angelcp2802/solidflow/actions/runs/38158887842)
and the separate CodeQL code-scanning result also passed. This result belongs
to that source revision; later changes need their own required checks.

## Sketch fillet increment — 2026-10-11

On Windows x64 with Node 24.11.1, the final local tree passed `npm test`: all
903 unit/CAD/component tests in 44 files and all 8 IPC tests, with no skips.
TypeScript/Vite build and the real Electron production-loader smoke passed.
An earlier sandboxed revision passed its 883 portable tests but blocked two IPC
filesystem operations; the final complete suite ran outside that sandbox.
The build retained its existing large-chunk and dependency externalization
warnings.

The increment adds 51 core cases, 18 arc-step/solver cases, 5 server-rendered
component cases and 7 CAD cases. Core checks cover line–line, line–arc and
arc–arc contacts, finite sweeps,
virtual line intersections, fixed branch selection, keep/delete corner policy,
driving/driven dimensions, equal radii, later radius edits, structural limits
and atomic rejection. The [tool contract](SKETCH_FILLET.md) records the scope;
these cases do not establish general curved-geometry robustness.

Delete mode retains corner anchors still used by a source arc's center or other
surviving geometry. Solver trials reject a finite arc crossing its zero/full-turn
boundary, including crossings hidden between the trial endpoints, while allowing
valid minor/major transitions through a half-turn. Tests cover translated and
scaled cases, serialization and unchanged geometry on rejection. This local
continuity guard uses the saved initial coordinates; it does not repair already
wound documents. Existing near-boundary precision failures at small scales are
recorded as rejection cases without weakening solver tolerances.

Six CAD cases use analytical volume, surface area and contact-coordinate
oracles for a 10×6×4 mm plate, radius/extents edits, two linked fillets and a
closed line–arc contour. A seventh reads the exact browser-saved
`sketch-fillet-linked-r1.solidflow` fixture, checks its hash and reconstructs
both R1 arcs with their equality relation. All seven check fully defined
sketches, saved-document reconstruction, stable references, valid BRep and
single-solid STEP round trips. Volume, area and bounds comparisons use five
decimal places; contact-coordinate comparisons use six. Fixture provenance
is recorded in its adjacent README.

Real browser interaction checked the rectangular example: origin selection,
R2 preview/application, comma decimals, invalid-input blocking and Escape from
the radius input, first-fillet undo/redo, a second opposite R2 fillet linked to
the first, and editing the first radius to R1 with both arcs updating. The
sketch remained fully defined with zero degrees of freedom. Rebuilding showed
0.238 cm³ and 10×6×4 mm bounds, and the actual download was saved byte for byte.

Interactive file reopening was denied by browser permissions. Later browser
access was also denied, so the final legacy-conversion and undo/reference fixes
have code-review evidence but no final interactive regression. The curved
example was loaded but not edited through the UI. Delete mode, alternative
branches, virtual extensions and macOS/Linux editor interaction remain pending.
SSR tests do not execute events, and Electron smoke covers the initial solid,
not the fillet editor or native file dialogs. STEP exports above are
programmatic. Full-circle sources, arc prolongation and atomic corner batches
remain open in [issue #6](https://github.com/angelcp2802/solidflow/issues/6).

Hosted checks on the final fillet head `27f9a7a` passed on Windows x64,
macOS arm64 and Linux x64, including all 903 portable tests, 8 IPC tests,
build, real Electron production-loader smoke and unsigned packaging:
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38165413775).
[Security analysis](https://github.com/angelcp2802/solidflow/actions/runs/38165413774)
and the separate CodeQL result also passed. These results belong to that
revision, not subsequent source changes. Binary upload remains gated by
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Atomic straight-line sketch fillet batches — 2026-10-11

On Windows x64 with Node 24.11.1, `npm test` passed 993 portable tests in
49 files and all 8 IPC tests, with no skips. `npm run build` passed with the
existing chunk/externalization warnings. `npm run test:desktop` passed the
real production loader with WASM loaded, no console errors and no failed
requests. The dependency audit reported no high/critical findings and eight
moderate development findings; this is not a claim of zero vulnerabilities.

The first workspace `npm ci` attempt could not replace files held by the
running desktop/development processes; a recovery install also encountered
locked runtime files. An isolated clean install from the unchanged lockfile
succeeded. The workspace's 15,499 installed package/runtime files were verified
byte for byte against that installation after recovery. An initial desktop
smoke attempt stopped during runtime installation, before loading the app;
the completed smoke result above followed recovery. No running user process
was stopped for this check.

This increment adds 23 batch core cases, 5 application-boundary cases,
2 server-rendered component cases and 11 CAD cases. Core cases exercise
adjacent/opposite corners, reversed selection/source representation, original
length conversion once, complete cleanup, linked/individual/external radii,
structural limits and whole-selection rejection. A healthy rectangle with an
existing opposite-edge equality provides a real solver-conflict rejection.
Stale/unhealthy sources skip solving; a valid application solves the entire
proposal once. Post-solve checks reject source collapse/reversal or changed
contact topology before a commit. Anchored linked left-corner R2→R3/R3.1
dimension edits reject through the existing solver and return the edited
input unchanged; no generic path guarantee or changed solver tolerance is
claimed.

The synthetic 10×6×4 mm plate checks bottom and left adjacency using independent
centers/contacts and the square-minus-quarter-disk formulas in the
[fillet guide](SKETCH_FILLET.md). Both R2 corners give `V=208+8π` mm³ and
`A=200+12π` mm². CAD checks include linked R2→R1, one individual R2→R1,
original dimensions changed to 12×8, valid BRep, one solid, bounds, exact
document reopening, stable face/edge references and programmatic STEP round
trips. Absolute mass/area/bounds tolerances are `5e-6` in their respective
units; coordinates use `5e-7` mm per axis. Shared 6 mm edge collapse at R3 and
reversal at R3.1 reject in both selection orders and leave the original plate
rebuildable.

Server rendering checks both fillet arcs, the combined retained source and
both endpoint reports. Static application review confirms one draft-history
commit for the accepted whole batch and no editor writes on rejection. These
checks do not execute pointer, radius-blur, Escape or undo/redo events. Real
interaction with the new batch tool/card remains unverified; Electron smoke
covers the initial solid. Full-circle sources, curved/virtual corner batches
and broader robustness remain open in
[issue #6](https://github.com/angelcp2802/solidflow/issues/6). This source needs
its own hosted checks before merge; earlier platform results are separate.

## Sketch arc prolongation increment — 2026-10-11

On Windows x64 with Node 24.11.1, `npm test` passed all 952 portable tests in
46 files and all 8 IPC tests, with no skips. TypeScript/Vite build passed,
retaining the existing large-chunk and dependency externalization warnings.
Real Electron production-loader smoke passed with WASM loaded, no console
errors and no failed requests. It exercises the initial solid, not interaction
with the new library cards or the fillet editor.

This increment adds 38 core cases, 2 rendered-component cases and 9 CAD cases.
Core checks include analytical line–arc and two-arc prolongation, reflected
and reversed representations, A/B order, rotation/scale, physical branch
deduplication, radius transitions from extension to trimming, retained
major-arc intervals, tied defaults, exclusive constraint cleanup and atomic
rejection. Common-corner behavior remains covered by the earlier tests.
Connected-radius component checks reject retained-end crossings instead of
silently wrapping a tiny source arc into an almost complete turn. Fresh major
intervals remain available. These regressions include reflected/reversed A/B
variants, offset-intersection side, tangent births, no-finite-root cases,
one/two-source arc–arc crossings and scaled/translated representations.
The rendered-component additions check the line–arc overlay and trim/extend
labels, plus blocked application with selectable candidates for a tied default.
They do not execute pointer or keyboard events.

The CAD cases start from the two synthetic, intentionally open, sketch-only
[examples](../src/examples/sketch-fillet-prolongation.ts). Actual R2 planning
closes each contour; fully defined solutions retain support/far anchors and
share tangent contact IDs. The tests add a 4 mm extrusion and check analytical
volume/surface area, bounds, valid BRep, one solid, exact document reopening,
stable face/edge references and programmatic STEP round trips. Exact analytical
R3 final seeds provide separate ideal-mass controls. R2/R3 ideal controls use
absolute `5e-6` mm³/mm² for mass/surface and `5e-6` mm for bounds. The
[fillet guide](SKETCH_FILLET.md) records their independent formulas.

Reopened R2→R3 edits use absolute `5e-7` mm per coordinate, checking centers,
contacts and all anchors. With `d=√2×5e-7` mm, independently checked endpoint
and center coordinates imply radial error at most `2d` and a sufficient
sweep-error bound `2asin(2d/R)` radians. These are numerical edit checks, not
the stricter exact-seed mass controls. For these edited examples, measured
volume differs from ideal R3 by approximately `−9.06882e-6` mm³ (line–arc)
and `+6.90356e-6` mm³ (two arcs); both exceed the exact-seed `5e-6` bound.
Their CAD reconstruction is checked separately at `5e-6` against an independent
Green integration of the realized endpoint/midpoint circumcircles. This
separates accepted solver seed error from kernel reconstruction accuracy.
Solver tolerances were not changed.

A large anchored line–arc R3→R10 radius edit remains a `notConverged`
regression, with the input and returned fallback unchanged; direct planning
at R10/R12 and R2→R3 edits pass their focused checks. This local solver does
not guarantee convergence for every valid radius path.

Real interaction with the new examples, full-circle source trimming, atomic
corner batches and general curved-pair robustness remain unverified or open.
This revision needs its own hosted checks; earlier platform results do not
establish a pass for the new source. Binary upload remains disabled under
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).

## Associative sketch offsets — 2026-10-11

On Windows x64 with Node 24.11.1, `npm test` passed all 1,351 portable tests in
66 files and all 11 IPC tests, with no skips. `npm run build` passed with the
existing large-chunk and dependency-externalization warnings.
`npm run test:desktop` passed the real production loader, with WASM loaded,
no console errors and no failed requests. A fresh isolated `npm ci` installed
341 packages from the lockfile; the dependency audit reported zero
high/critical findings and eight moderate development findings.

The increment adds 104 portable cases, including 21 CAD cases and 9
server-rendered component cases. Core checks exercise open line/arc freedoms,
optional dimensions and fresh driven readings, two independent sides versus
symmetric round caps, clockwise/reversed closed representations, connected
line/arc chains, major arcs, rotated/translated cap ownership, construction,
typed references, immutable rejection, structural limits and malformed saved
groups. Collapsed/reversed segments, finite overlap, self-intersections,
repeated interior vertices, wrong branches and antipodal capped/continuation
arc stations reject. Editing a cap's retained clockwise flag is corrected
from the owning group; a valid BRep alone would not detect an inward cap.

CAD checks use original Cartesian rectangle, circle, concave L, mixed capsule,
line-cap and quarter-circle-strip profiles. The [offset guide](SKETCH_OFFSET.md)
gives independent area/perimeter and 4 mm prism formulas. The tests check valid
BRep, one solid, mass, area, bounds, saved-document reconstruction and
programmatic STEP export/reimport. Source-width, source-radius and distance
edits are exercised; selected face/edge references and a dependent outer-corner
fillet survive the tested rectangular edits. These cases do not establish
general persistent topological naming. Absolute CAD mass/area/bounds tolerance
is `5e-6` in the respective units, with `5e-7` mm per coordinate. Offset
equations attempt `1e-10` mm refinement while retaining the existing public
`1e-7` mm residual acceptance and geometry checks.

Rendered checks cover complete overlays, both sides and caps, construction
styling, stale-preview suppression, blocked application and a fresh driven
measurement in the inspector. Read-only application review confirms one
draft-history write for a successful proposal and rejection of unhealthy
offset edits before that write. These checks do not execute pointer, keyboard,
cancel, undo/redo or interactive reopening. Real interaction with the new
tool and library cards remains unverified; the Electron smoke exercises only
the initial model. STEP producer and reader share the project's OpenCascade
runtime, so those round trips do not prove independent interoperability.

Uncapped endpoints remain free along their supports. Topology-changing
trim/extend/chamfer/fillet commands require explicitly unlinking participating
offset entities first. Disconnected sets, splines, external projected edges,
general overlap resolution and broader robustness remain open in
[issue #14](https://github.com/angelcp2802/solidflow/issues/14). This source
requires its own hosted checks before merge; earlier platform results are
separate. Binary upload remains disabled under
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).
