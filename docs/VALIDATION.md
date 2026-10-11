# Validation

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

On Windows x64 with Node 24, `npm test` passed all 883 unit/CAD/component tests
in 43 files and all 8 IPC tests, with no skips. TypeScript/Vite build and the
real Electron production-loader smoke passed. The initial sandboxed run passed
the 883 portable tests but blocked two IPC filesystem operations; the complete
suite passed when repeated outside that sandbox. The build retained its
existing large-chunk and dependency externalization warnings.

The increment adds 49 core cases, 5 server-rendered component cases and 7 CAD
cases. Core checks cover line–line, line–arc and arc–arc contacts, finite sweeps,
virtual line intersections, fixed branch selection, keep/delete corner policy,
driving/driven dimensions, equal radii, later radius edits, structural limits
and atomic rejection. The [tool contract](SKETCH_FILLET.md) records the scope;
these cases do not establish general curved-geometry robustness.

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

Hosted checks for this increment require their own PR revision; prior runs do
not establish a pass for the new source. Binary upload remains gated by
[issue #5](https://github.com/angelcp2802/solidflow/issues/5).
