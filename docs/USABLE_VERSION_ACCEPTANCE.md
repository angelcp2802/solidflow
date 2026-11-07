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
| C02 | Create and edit supported sketch entities, dimensions and constraints through the normal editor. | Passed the recorded integrated XY rectangle/circle/centre-arc route: 237 checkpoints with actual strokes, driving dimensions, fixed corner, incompatible constraint, diagnosis, direct Cancel, local/document Undo/Redo and three Save/Open/STEP cases. Existing numerical suites supply the other supported geometry cases; broader command/input aliases remain in C13. |
| C03 | Extrusion, cut, revolution and revolved cut consume an explicitly selected eligible sketch. | Passed the final recorded sequence/revolution routes with the 4 November fix. Empty selection, operation selection, suppressed and consumed sketches, active drafts and normal selected-sketch input retain their guards. |
| C04 | Successive salients and cuts, including a new sketch on a face, reconstruct and persist. | Passed the recorded final cases. Sequence oracle V960→944→928→976→984 mm³, final A848 mm² and bounds [-10,-6,0]…[10,6,9]. Fresh-sketch oracle V960→1008→996 and A736→784→808. Original tolerances retained. |
| C05 | Every enabled implemented solid-operation family has a working normal entry, editable parameters and recoverable invalid input. | The recorded 33-command batch passes the bounded normal family cases below. A visible enabled action without a working handler is a blocker. Additive dynamic ALL, AUTO/variation and broader feature regeneration remain required pending capabilities in their existing contract; canonical body-pattern success does not close them. Existing disabled modules retain clear availability guidance. |
| C06 | Earlier-feature edits, suppression/deletion and references preserve identities or expose explicit recovery. | The recorded `part-reference-repair` route passes 139 checks: scalar-depth support continuity, signed-branch loss/diagnosis, explicit reselection with the same IDs, Cancel/retry, suppression/reactivation, cascade deletion/history, Save/Open and physical STEP planes. This explicit-body case uses actual v1 references; preserve the documented v2 gate and topology limits. |
| C07 | Create a three-component assembly from modeled/imported/reused parts, then fix, float and place the intended occurrence. | Final combined part/assembly and basic-authoring routes, exact names/source/body/occurrence IDs and independently checked placements after reopen. |
| C08 | Relate components both to root/component origins and to one another. | Recorded standard/configured origin routes pass 331/326 checks; new aligned/opposed plane cases pass 83/132 with fixed-pose invariance, literal normals/incidence, Cancel/retry, history and saved Solve. Retain separate coincidence/concentricity, rotation-lock and distance contracts, and do not infer unique position/yaw from a plane relation. |
| C09 | Ordinary saved relations and their reference replacements work at the supported boundaries. | The recorded ordinary-assembly route passes 483 checks, retaining 30°→60° and Apply/Save/Open/fresh Solve at 0°/180°. Saved distance, angle, coincidence, concentricity and parallel/perpendicular reference edits pass the separate 276-check route. Preserve the model/native antipodal regressions, exact declarations, residuals and tolerances. The panel-scroll correction still needs its new hosted result. |
| C10 | Each exposed specialized relation family completes its announced lifecycle. | Fixed inventory of distance/angle limits, directed angle, tangencies, component lock, gear/screw/rack, width, symmetry, profile center, LINE/circular paths and limited/unlimited hinge. Standard Gear/Screw actual cylindrical acquisition passes 149/143 checks; nomination remains separate from native capture/Apply. Profile-centre, LINE and circular acquisition and other family final cases remain required. |
| C11 | Shared-source changes and embedded-part editing preserve the parent and every exact active source use. | Repair lost references explicitly, preserve Cancel, update one revision/history state on Apply and keep source-file ownership. Final embedded route covers two reused occurrences, V48→72/A104→132 and independent poses/bounds. |
| C12 | Pending work, Cancel and operating-system close preserve documents and reject late/stale actions. | Passed the 7 November recorded Windows fixture. Exact dispatched Apply/request outstanding at exit, four rejected Apply exits, authentic reply before parent rebuild, real native keep/discard close and fresh-process recovery/reopen. Interruption midway through kernel execution has separate coverage requirements. |
| C13 | Selection, viewport context, ribbon/side-panel commands, camera and keyboard act on the intended target. | The [finite command matrix](USABLE_COMMAND_MATRIX.md) maps aliases and evidence. Bottom Open, current-document focus and selected-feature Properties are corrected; final selector, alias, context and keyboard cases remain. Exercise component/face/LINE/datum and background selection, wheel zoom, middle-button navigation, field/tree/viewport focus, Escape, standard/Normal To/named/previous views and separate camera/document history. |
| C14 | The currently implemented nested/configured workflows retain their scope, state and references. | Reused subassembly with two supported states, correct editable scope, state isolation, supported relation forms, Cancel/Apply/history/recovery and Save/reopen. Explicitly track the configured omissions below. |
| C15 | Part materials, density, part colour and background are configurable and persist compatibly. | Passed the recorded integrated cases: part properties 70, actual two-process recovery/background 75+30 and three-use standard/configured material/mass lifecycle 231. Thirty-two fixed frames are hash-verified; selected views are qualitatively reviewed. Exact source ID+revision, history and file compatibility remain authoritative. Retain the documented OS-picker/GPU/platform limits and [the contract](PART_PROPERTIES.md). |
| C16 | File operations preserve native document versions and the supported interchange formats. | `.solidflow` v1/v2/v3; supported single-solid/structural STEP import; STEP/STL geometry and BOM CSV export where exposed. Actual controls and restricted IPC, cancel/invalid/error paths, saved identities/bytes and an independent STEP reimport geometry check. |
| C17 | The final application has appropriate security, error and responsiveness checks. | Full `npm test`, build and desktop smoke after relevant changes, code-review and security-review of sensitive boundaries. Fix confirmed vulnerabilities and reproducible use blockers. Profile a reported slowdown on the same workload before/after any performance change. |
| C18 | A clearly identified executable opens from the desktop and completes a practical combined walkthrough. | Local Windows 0.19.0 executable/ASAR hashes, exact nine-file production mapping, updated shortcut with separate profile, real packaged-window Save/Open/Resolver/Cancel/OS close/fresh-process recovery and Spanish guide are recorded. Matching hosted checks for the published tree remain required. Record user feedback and installed-platform/human acceptance separately. |

## Solid-operation family matrix

The supported variants and identities in the linked contracts define each case.
Retain independent BRep/solid-count/volume/area/bounds checks where applicable.

| Family | Existing route or contract | Final lifecycle status |
| --- | --- | --- |
| Extrude/cut and independent end directions | `part-sequence`, `part-from-empty`, `part-two-direction`, `part-two-direction-limits`, `part-face-limits` | Recorded integrated canonical routes pass; command aliases remain in C13. |
| Revolve/revolved cut and admitted axes | `part-revolution`, `part-external-axis` | Recorded integrated bounded revolution/cut and external-axis routes pass. |
| Thin walls, supported corners and caps | `part-thin-wall`, `part-auto-corners`, `part-end-caps` | Recorded integrated cases pass; retain the documented eligibility limits and distinguish other native-only variants. |
| Fillet/chamfer | `part-finishing` and the finishing contracts | Recorded integrated single-edge cases pass; all-edge geometry has native evidence but its full UI lifecycle is not established here. |
| Sweep/loft | `part-sweep-loft`, native/saved-feature contracts | The 7 November bounded normal create/edit/recover/Cancel/history/Save/Open/STEP route passes 126 checkpoints. Retain its declared straight-circle/two-section ruled limits and the overall family inventory. |
| Shell/draft | `part-shell-draft` and documented face-operation contracts | Recorded integrated lifecycle passes 172 checkpoints, including invalid thickness, selected opening, four draft faces and physical STEP planes. Other neutral/opening variants are not inferred from this case. |
| Hole | `part-hole`, saved feature types and kernel cases | Recorded integrated lifecycle passes 119 checkpoints for two simple/counterbored through-hole centres with outside-centre rejection and physical STEP axes/radii. Other admitted end modes retain their separate contracts. |
| Linear/circular pattern and mirror | `part-pattern-create`, `pattern-all`, `pattern-until-next` and pattern/mirror contracts | Recorded integrated body creation/edit/rejection/history/reopen route passes 194 checkpoints with physical STEP copy poses. Additive ALL, AUTO/variation and broader regeneration remain pending. |
| Combine and explicit body catalogues | `part-combine`, `part-body-catalog`, imported-body and combine contracts | Recorded integrated ordered union/intersection/subtraction route passes 114 checkpoints, preserving an unrelated body, identities, history and final STEP bounds. Keep-tools and other variants retain their separate evidence. |

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

- Public checkpoint `ce27324` in draft PR #49 contains the preceding 33-command
  and 13-command Windows records and the separately delivered local prototype.
- Local `5a205660` integrates support repair, opposed origin planes, standard
  Gear/Screw acquisition and the strict Relations-panel actor correction.
  Its isolated 19-command batch passes 11,248 cases/502 files, 220 IPC checks
  with two skips, startup and sixteen renderer routes. Input manifest:
  `350743fced5b9090c5a196206597c9e1e5c88c53352d999871eec4d3459cd588`.
- The independent audit binds all 1,388 inputs, nine production members and
  nineteen logs. C15 runs without raster in this batch; earlier captured
  evidence retains its own exact application identity.
- C05 normal canonical families have their recorded cases. Additive dynamic
  ALL, AUTO/variation and broader regeneration remain required implementation
  work, not closed by successful body-copy patterns.
- C15's bounded material/revision-colour/mass and two-process profile cases are
  recorded. Preserve their exact source identity, frame-review and platform
  limits instead of the obsolete same-process-only gap.
- C10 still needs the remaining ProfileCentre/LINE/circular acquisition work.
  C13 retains uninvoked menu/ribbon aliases, display/help/rename/delete and
  remaining sketch command cases; earlier selector/background/navigation
  controls have recorded bounded acceptance.
- The old public macOS/Linux persistence failure occurs before the first new
  boundary preview. The actor correction passes Windows locally; the next
  public head needs its own CI, security and dependent Desktop results. Keep
  #55 at 16/25, #53 at 6/9, PR #49 draft/unmerged and release #5 open.

The project objective stays active until the required local gate is satisfied.
