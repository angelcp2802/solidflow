# Usable local version acceptance

Started 2026-11-07 from the user's instruction to finish a usable SolidFlow
application. The priority is the local Windows application. The project keeps
its blue desktop workflow, GPL-3.0-only license, independent implementation,
document compatibility, geometric tolerances and Windows/macOS/Linux targets.

## Completion rule

Each row below needs an exact source revision, compiled-artifact identity,
original fixture provenance, actual command or interaction, result and remaining
limits. An implemented path with earlier evidence stays pending until its
required final-artifact check is recorded. A missing capability needs an
implementation and the corresponding review and validation.

Close the usable-version gate after every required row passes and the executable,
access and guide have been verified. Record findings from the user's subsequent
use in the prototype checklist. Human acceptance, recurring hosted stability,
installed-platform acceptance and the public release gate have their own
results. Their current open states stay visible in the project queue.

The operation and command inventory is frozen to the functionality exposed by
the integrated 2026-11-07 candidate, plus the previously requested material and
appearance controls. Each family has a canonical successful lifecycle and an
invalid/cancelled case within its documented supported variants. New feature
proposals need an explicit scope decision instead of silently extending this
gate.

## Required checks

| ID | Observable outcome | Required evidence and current gap |
| --- | --- | --- |
| C01 | One candidate contains the desktop's explicit sketch selection and the embedded-editor transition work. | Passed in the recorded 7 November candidate. Common build, full suite, native transition and affected renderer routes are accepted on frozen inputs. |
| C02 | Create and edit supported sketch entities, dimensions and constraints through the normal editor. | Real drawing, one valid constrained edit, one incompatible constraint, diagnosis, Cancel and local Undo/Redo. Existing numerical suites supply independent geometry, with a final native interaction still required. |
| C03 | Extrusion, cut, revolution and revolved cut consume an explicitly selected eligible sketch. | Passed the final recorded sequence/revolution routes with the 4 November fix. Empty selection, operation selection, suppressed and consumed sketches, active drafts and normal selected-sketch input retain their guards. |
| C04 | Successive salients and cuts, including a new sketch on a face, reconstruct and persist. | Passed the recorded final cases. Sequence oracle V960→944→928→976→984 mm³, final A848 mm² and bounds [-10,-6,0]…[10,6,9]. Fresh-sketch oracle V960→1008→996 and A736→784→808. Original tolerances retained. |
| C05 | Every enabled implemented solid-operation family has a working normal entry, editable parameters and recoverable invalid input. | Complete the finite family matrix below. A visible enabled action without a working handler is a blocker. Existing disabled modules retain clear availability guidance. |
| C06 | Earlier-feature edits, suppression/deletion and references preserve identities or expose explicit recovery. | One compatible earlier edit and one lost-reference case, reconstruction, diagnosis/repair, Undo/Redo and saved reopen. Preserve the documented topology correspondence limits. |
| C07 | Create a three-component assembly from modeled/imported/reused parts, then fix, float and place the intended occurrence. | Final combined part/assembly and basic-authoring routes, exact names/source/body/occurrence IDs and independently checked placements after reopen. |
| C08 | Relate components both to root/component origins and to one another. | Planes, axes, coincidence/concentricity, rotation lock and distance with independent poses/residuals, Cancel/retry/Apply, Save/reopen and fresh Solve. |
| C09 | Ordinary saved relations and their reference replacements work at the supported boundaries. | Distance, angle, coincidence, concentricity and parallel/perpendicular. Add Apply/persistence/reopen checks at ordinary angles 0° and 180°, currently a concrete evidence gap. |
| C10 | Each exposed specialized relation family completes its announced lifecycle. | Fixed inventory of distance/angle limits, directed angle, tangencies, component lock, gear/screw/rack, width, symmetry, profile center, LINE/circular paths and limited/unlimited hinge. Map each to its existing route and close announced material/mechanical-picking and origin-orientation gaps. |
| C11 | Shared-source changes and embedded-part editing preserve the parent and every exact active source use. | Repair lost references explicitly, preserve Cancel, update one revision/history state on Apply and keep source-file ownership. Final embedded route covers two reused occurrences, V48→72/A104→132 and independent poses/bounds. |
| C12 | Pending work, Cancel and operating-system close preserve documents and reject late/stale actions. | Passed the 7 November recorded Windows fixture. Exact dispatched Apply/request outstanding at exit, four rejected Apply exits, authentic reply before parent rebuild, real native keep/discard close and fresh-process recovery/reopen. Interruption midway through kernel execution has separate coverage requirements. |
| C13 | Selection, viewport context, ribbon/side-panel commands, camera and keyboard act on the intended target. | The [finite command matrix](USABLE_COMMAND_MATRIX.md) maps aliases and evidence. Resolve its actual inactive navigation/property controls, then complete selector, alias, context and keyboard cases. Exercise component/face/LINE/datum and background selection, wheel zoom, middle-button navigation, field/tree/viewport focus, Escape, standard/Normal To/named/previous views and separate camera/document history. |
| C14 | The currently implemented nested/configured workflows retain their scope, state and references. | Reused subassembly with two supported states, correct editable scope, state isolation, supported relation forms, Cancel/Apply/history/recovery and Save/reopen. Explicitly track the configured omissions below. |
| C15 | Part materials, density, part colour and background are configurable and persist compatibly. | Optional strict declarations, part controls, source-revision colours, fresh native mass and a separate background preference are implemented in the current working increment. Final renderer lifecycle, reused-source appearance and fresh-process profile evidence remain pending. See [the contract](PART_PROPERTIES.md). |
| C16 | File operations preserve native document versions and the supported interchange formats. | `.solidflow` v1/v2/v3; supported single-solid/structural STEP import; STEP/STL geometry and BOM CSV export where exposed. Actual controls and restricted IPC, cancel/invalid/error paths, saved identities/bytes and an independent STEP reimport geometry check. |
| C17 | The final application has appropriate security, error and responsiveness checks. | Full `npm test`, build and desktop smoke after relevant changes, code-review and security-review of sensitive boundaries. Fix confirmed vulnerabilities and reproducible use blockers. Profile a reported slowdown on the same workload before/after any performance change. |
| C18 | A clearly identified executable opens from the desktop and completes a practical combined walkthrough. | Final local artifact hashes and source mapping, actual startup with original sample documents, a short opening/testing guide, save/close/reopen and matching hosted checks. Record user feedback and installed-platform/human acceptance separately. |

## Solid-operation family matrix

The supported variants and identities in the linked contracts define each case.
Retain independent BRep/solid-count/volume/area/bounds checks where applicable.

| Family | Existing route or contract | Final lifecycle status |
| --- | --- | --- |
| Extrude/cut and independent end directions | `part-sequence`, `part-from-empty`, `part-two-direction`, `part-two-direction-limits`, `part-face-limits` | Pending aggregate acceptance and command inventory. |
| Revolve/revolved cut and admitted axes | `part-revolution`, `part-external-axis` | Pending final aggregate acceptance. |
| Thin walls, supported corners and caps | `part-thin-wall`, `part-auto-corners`, `part-end-caps` | Existing bounded contracts; remaining advertised eligibility/editing cases require explicit mapping. |
| Fillet/chamfer | `part-finishing` and the finishing contracts | Existing single-edge cases; check enabled advertised selection options and recoverable errors. |
| Sweep/loft | `part-sweep-loft`, native/saved-feature contracts | The 7 November bounded normal create/edit/recover/Cancel/history/Save/Open/STEP route passes 126 checkpoints. Retain its declared straight-circle/two-section ruled limits and the overall family inventory. |
| Shell/draft | Existing saved feature types and documented face-operation contracts | Audit normal UI lifecycle and saved reference repair coverage. |
| Hole | Existing hole examples, saved feature types and kernel cases | Audit normal UI lifecycle and admitted depth/end variants. |
| Linear/circular pattern and mirror | `pattern-all`, `pattern-until-next` and pattern/mirror contracts | Complete announced scopes, editing, rejection and saved reopen coverage. |
| Combine and explicit body catalogues | `part-body-catalog`, imported-body and combine contracts | Final identity/selection/Undo/Redo and persistence check. |

## Existing nine prototype groups

The [priority issue](https://github.com/angelcp2802/solidflow/issues/55) has 16
checked items out of 25. Each of its nine open groups keeps its own evidence.

| Existing open group | Gate rows and follow-up |
| --- | --- |
| Complete demo and human use | C07, C08, C11, C18; record actual human feedback separately. |
| Remaining view-editor behaviour | C13 and its finite view-command cases. |
| Broader keyboard interaction | C13 with field, tree and viewport ownership. |
| Recurring persistence and installed/platform use | C16–C18 and [desktop tracking](https://github.com/angelcp2802/solidflow/issues/53). |
| Menus, context, selection and navigation | C05, C07, C13; every enabled advertised command gets an inventory entry. |
| Contextual/reference-first editors | C06, C09–C11 and the applicable saved editors. |
| Thin/specialized material/mechanical/origin cases | C05, C08, C10 with the supported-variant inventory. |
| Boundary angles and nested/configured/material references | C09, C10, C14. |
| Materials, density, colours and backgrounds | C15. |

Configured source/reference repair, constrained drag, configured interference
and geometric export, part-feature variants and flexible instances are genuine
omissions identified by the current configured workspace. The advanced motion
and variant work remains explicitly tracked in [#54](https://github.com/angelcp2802/solidflow/issues/54)
and the configuration contracts. The current local gate verifies the supported
configured workflows and availability guidance. Bringing an advanced omission
into this gate requires recording the scope decision here.

## Execution and evidence policy

Use the canonical project skills with the corrections in the agent guide.
Worktrees share the installed skills instead of creating divergent copies.
Use REA for questions about shipped artifacts or reference runtime behaviour,
recording artifact identity, Evidence and limitations. Use repository tools for
ordinary source analysis. Reference inspection and geometric validation have
separate evidence records.

Run checks after the final relevant changes. Reuse a passing result only when
its exact inputs and products match the required final snapshot. Investigate
failures with a hypothesis and discriminating experiment before changing
production behaviour. Preserve failed evidence, authentication, oracles,
tolerances and deadlines.

## Current resumption point

- Source branch `codex/usable-windows-closure-20261107` uses baseline `6e0f0ad`, which integrates
  the desktop's `0cb75cd` sketch-selection correction. Existing transition work
  is preserved for review and final acceptance.
- A fresh private validation runtime reuses the existing locked dependencies.
  Its profile and generated documents are isolated from the user's session.
- The final increment passes eight commands, 11,120 unit/CAD cases, 203 IPC
  checks with two platform skips, five renderer routes and desktop startup.
  The independent source/runtime/product audit is retained with manifest
  `3ec29211edb6539ed942a17d5826b1d8828a109d11d9e1b8d2c2d22934db5d1c`.
- The next increment passes ten commands, 11,204 unit/CAD cases in 498 files,
  207 IPC checks with two skips and seven Windows renderer routes. Independent
  audit manifest: `74cbe1a48b94ca87248e96efdfe606772f1ac64b4f3f5ebfdf1f6583352faae5`.
- C05 sweep/loft normal creation, saved editing, recovery, Cancel, history and
  saved reopen pass the bounded original cases. Hole and Combine are the next
  finite families; their geometric contracts are prepared independently.
- C15's original-cube route passes 70 checkpoints, including mass and separate
  same-process background preference. Reused-source rendered colour and
  fresh-process profile persistence remain open; C15 is not complete.
- The C13 command matrix records the actual inactive navigation/property
  controls and remaining selector/alias/focus cases. Other open rows keep
  their existing evidence and supported-variant scope.
- Public PR #49 remains the review location. The published `8be9f24` snapshot
  has its own 15 successful CI jobs and two successful security jobs. New
  aggregate acceptance will be recorded against its own revision.

The project objective stays active until the required local gate is satisfied.
