# Validation

## Desktop launcher diagnostics — 2026-10-14

[Draft PR #35](https://github.com/angelcp2802/solidflow/pull/35) proposes
diagnostic preservation for the desktop smoke launcher. Runtime source
[`b488bc34f17703b0a1bc2d5fd6bcb69fca07f8f2`](https://github.com/angelcp2802/solidflow/commit/b488bc34f17703b0a1bc2d5fd6bcb69fca07f8f2)
is based on `43c7573c688b35a0bb70a0206416fff17ae298cd` and extends the
earlier diagnostic source `038bc50acda77af3a968eed29734f803d7bca1a3`.
The proposal remains unmerged and [issue #30](https://github.com/angelcp2802/solidflow/issues/30)
remains open. Main's runtime baseline is unchanged by this proposal.

Local Windows x64 / Node 24.11.1 results for the updated source are:

| Command | Recorded result |
| --- | --- |
| `npm test` | Exit 1: 1,352 passed and 140 failed of 1,492 tests; 59 passed and 15 failed of 74 files; 853.24 seconds. The failed unit phase did not enter IPC. |
| `npm run test:ipc` | Separate run: 31 passed, zero failed, cancelled or skipped; 24,611.7259 ms. These comprise 20 launcher cases and 11 IPC-security cases. |
| `npm run build` | TypeScript and production build passed; 1,972 modules transformed, with Vite reporting 1 minute 56 seconds. |
| `npm run test:desktop` | Exit 1: `AggregateError` retains the 45-second deadline as cause and `SMOKE_CLOSE_UNCONFIRMED` as a secondary diagnostic. No readiness report was produced. |

All 140 logged full-suite failures were test timeouts: 136 at 5 seconds and
four at 30 seconds, across 101 printed error groups. One worker-termination
warning was separate. Complete log classification identified no assertion,
hook-failure, unhandled/uncaught or crash diagnostic. This does not establish
that timed-out assertions completed, exclude latent defects or identify a
cause. The source and complete before/after maps contain the same 203 runtime
inputs, without missing, extra, duplicate or changed hashes; no environment
override was recorded. The separate IPC pass does not change the failed full
result.

In the real desktop invocation, close remained unconfirmed, cleanup was
skipped and the isolated temporary data was retained. No cleanup lock error
was emitted in that invocation. Neither WASM loading nor initial-model
readiness is established locally. This explicit timeout outcome does not
recover the primary outcome or cause of the earlier cleanup-only failure.
The existing deadlines, sandbox settings and cleanup retry budget remain
unchanged. Child-handle release does not prove that descendants, inherited
streams or an outer harness terminated.

For this exact source, all six hosted checks succeeded in
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38476808951)
and [Security](https://github.com/angelcp2802/solidflow/actions/runs/38476808925).
The tested merge
[`0160695c6a28445b890615e4a43219eefaf4e99e`](https://github.com/angelcp2802/solidflow/commit/0160695c6a28445b890615e4a43219eefaf4e99e)
has parents `43c7573c688b35a0bb70a0206416fff17ae298cd` and
`b488bc34f17703b0a1bc2d5fd6bcb69fca07f8f2`, with the same tree
`236ac2b2d074d1007dd30c2601e3a0186a90bc99` as the proposed head.
Each complete Windows x64, Linux x64 and macOS arm64 log records all 1,492
tests in 74 files, 31 Node passes without failures/cancellations/skips,
build 1,972, and real initial-model Electron smoke PASS with
`wasmLoaded: true`, `consoleErrors: []` and `failedRequests: []`.
Packaging ran with `--publish never`; binary signatures were not independently
inspected. Windows/Linux used Node 24.21.0 and macOS used Node 24.20.0,
with npm 11.19.0, Vitest 5.0.3 and Vite 8.3.4. CodeQL and the high/critical
audit threshold passed; eight moderate development findings remained visible.
These bounded checks do not establish total security or platform support.

The earlier `038bc50` results remain separate. Its local full run exited 1
with 1,346 passed and 146 failed of 1,492 tests; 54 passed and 20 failed of
74 files, in 1,131.62 seconds. All 146 failures were test timeouts: 138 at
5 seconds, seven at 30 seconds and one at 15 seconds, across 95 printed error
groups, with three separate worker warnings. Its own 30-case Node, build and
six successful hosted checks belong to that earlier source:
[desktop CI](https://github.com/angelcp2802/solidflow/actions/runs/38471687902)
and [Security](https://github.com/angelcp2802/solidflow/actions/runs/38471687894).
Those hosted desktop jobs each checked 1,492 tests in 74 files, 30 Node cases,
build 1,972 and initial-model smoke. Neither hosted revision explains the
local full-suite or desktop failures.

The launcher regressions use original synthetic child events and VM checks;
they do not launch Electron. Initial-model smoke does not execute editor tools,
native file dialogs or locked-profile recovery. No signing/notarization,
independent CAD interoperability, native-leak or general lifecycle guarantee
is established. Binary publication remains gated by
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).
This entry records existing checks of the runtime source above, rather than
a rerun for a later documentation-only head. Any later hosted result must be
identified by its own head in the pull request. All earlier validation entries
retain their original scope below.

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
