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
| C05 | Every enabled implemented solid-operation family has a working normal entry, editable parameters and recoverable invalid input. | The recorded normal families retain their cases. The combined `daa78a6` source passes bounded additive ALL, captured AUTO and selected Blind depth variation. The integrated 0.20.0 batch verifies the Selected Blind driving-radius table. The 0.21.0 Windows package verifies independent width and height on a selected rectangular Blind cut. The follow-up verifies radius and rectangular dimensions on merged Blind bosses in local focal runs. Exact integrated and hosted checks, other dimensions, additional recipe parameters and broader regeneration remain required. The [finite recipe availability inventory](FEATURE_RECIPE_AVAILABILITY.md) separates blocked new choices and explicit saved-selection repair from those remaining requirements. Existing disabled modules retain clear availability guidance. |
| C06 | Earlier-feature edits, suppression/deletion and references preserve identities or expose explicit recovery. | The recorded `part-reference-repair` route passes 139 checks: scalar-depth support continuity, signed-branch loss/diagnosis, explicit reselection with the same IDs, Cancel/retry, suppression/reactivation, cascade deletion/history, Save/Open and physical STEP planes. This explicit-body case uses actual v1 references; preserve the documented v2 gate and topology limits. |
| C07 | Create a three-component assembly from modeled/imported/reused parts, then fix, float and place the intended occurrence. | Final combined part/assembly and basic-authoring routes, exact names/source/body/occurrence IDs and independently checked placements after reopen. |
| C08 | Relate components both to root/component origins and to one another. | Recorded standard/configured origin routes pass 331/326 checks; new aligned/opposed plane cases pass 83/132 with fixed-pose invariance, literal normals/incidence, Cancel/retry, history and saved Solve. Retain separate coincidence/concentricity, rotation-lock and distance contracts, and do not infer unique position/yaw from a plane relation. |
| C09 | Ordinary saved relations and their reference replacements work at the supported boundaries. | The recorded ordinary-assembly route passes 483 checks, retaining 30°→60° and Apply/Save/Open/fresh Solve at 0°/180°. Saved distance, angle, coincidence, concentricity and parallel/perpendicular reference edits pass the separate 276-check route. Preserve the antipodal regressions and tolerances. The panel-scroll correction passed Windows, Linux and macOS hosted jobs on `a490e89`. |
| C10 | Each exposed specialized relation family completes its announced lifecycle. | Fixed inventory of distance/angle limits, directed angle, tangencies, component lock, gear/screw/rack, width, symmetry, profile center, LINE/circular paths and limited/unlimited hinge. Material acquisition and held-role selection have bounded desktop results for the stated families. Keep nomination separate from native capture/Apply and verify the combined lifecycle and scope. |
| C11 | Shared-source changes and embedded-part editing preserve the parent and every exact active source use. | Repair lost references explicitly, preserve Cancel, update one revision/history state on Apply and keep source-file ownership. Final embedded route covers two reused occurrences, V48→72/A104→132 and independent poses/bounds. |
| C12 | Pending work, Cancel and operating-system close preserve documents and reject late/stale actions. | Passed the 7 November recorded Windows fixture. Exact dispatched Apply/request outstanding at exit, four rejected Apply exits, authentic reply before parent rebuild, real native keep/discard close and fresh-process recovery/reopen. Interruption midway through kernel execution has separate coverage requirements. |
| C13 | Selection, viewport context, ribbon/side-panel commands, camera and keyboard act on the intended target. | The [finite command matrix](USABLE_COMMAND_MATRIX.md) maps aliases and evidence. Windows records cover bounded Help ownership, edit-menu focus, sketch modification controls and held-role selection. The follow-up verifies part File-menu ownership for Delete and Ctrl+Z/S/O/N, plus the configured dirty-document decision and retry in both layouts. Finish the remaining entry-point, context and keyboard cases. Retain view, camera and document history as separate checks. |
| C14 | The currently implemented nested/configured workflows retain their scope, state and references. | Reused subassembly with two supported states, correct editable scope, state isolation, supported relation forms, Cancel/Apply/history/recovery and Save/reopen. Explicitly track the configured omissions below. |
| C15 | Part materials, density, part colour and background are configurable and persist compatibly. | Passed the recorded integrated cases: part properties 70, actual two-process recovery/background 75+30 and three-use standard/configured material/mass lifecycle 231. Thirty-two fixed frames are hash-verified; selected views are qualitatively reviewed. Exact source ID+revision, history and file compatibility remain authoritative. Retain the documented OS-picker/GPU/platform limits and [the contract](PART_PROPERTIES.md). |
| C16 | File operations preserve native document versions and the supported interchange formats. | Recorded Windows cases cover `.solidflow` v1/v2/v3, ordinary single-solid and structural STEP, STEP/STL geometry and configured BOM CSV, including stated cancellation/rejection cases and independent STEP geometry. The 0.21.0 Windows package has an exact structural STEP round trip, dirty Save and continue with Cancel/retry, and fresh-process byte-identical recovery. Other exact integrated and installed/platform checks remain required. |
| C17 | The final application has appropriate security, error and responsiveness checks. | Full `npm test`, build and desktop smoke after relevant changes, code-review and security-review of sensitive boundaries. Fix confirmed vulnerabilities and reproducible use blockers. Profile a reported slowdown on the same workload before/after any performance change. |
| C18 | A clearly identified executable opens from the desktop and completes a practical combined walkthrough. | The [Windows 0.22.0 prototype](VALIDATION.md#packaged-0220-on-windows--2026-11-11) has a verified shortcut and guide, a saved/reopened boss-width edit with independent STL checks, a configured Save/Open/recovery walkthrough and a v2 three-plate reopen. The [0.20.0 walkthrough](VALIDATION.md#packaged-0200-demo-and-recovery--windows-2026-11-11) records successive part operations and material, three-plate relations and native close. Record matching hosted checks, user feedback and installed-platform acceptance separately. |

## Solid-operation family matrix

The supported variants and identities in the linked contracts define each case.
Retain independent BRep/solid-count/volume/area/bounds checks where applicable.

| Family | Existing route or contract | Final lifecycle status |
| --- | --- | --- |
| Extrude/cut and independent end directions | `part-sequence`, `part-from-empty`, `part-two-direction`, `part-two-direction-limits`, `part-face-limits` | Recorded integrated canonical routes pass; command aliases remain in C13. |
| Revolve/revolved cut and admitted axes | `part-revolution`, `part-external-axis` | Recorded integrated bounded revolution/cut and external-axis routes pass. |
| Thin walls, supported corners and caps | `part-thin-wall`, `part-auto-corners`, `part-end-caps` | Recorded integrated cases pass; retain the documented eligibility limits and distinguish other native-only variants. |
| Fillet/chamfer | `part-finishing`, `part-finishing-all` and the finishing contracts | Recorded integrated single-edge cases pass. The 11 November focused follow-up adds both all-edge normal lifecycles at size 0.5→1 mm, invalid recovery, edit/Cancel/history/Save/Open and physical STEP. Its final combined-candidate result remains required; tangent propagation and other modes are not inferred. |
| Sweep/loft | `part-sweep-loft`, native/saved-feature contracts | The 7 November bounded normal create/edit/recover/Cancel/history/Save/Open/STEP route passes 126 checkpoints. Retain its declared straight-circle/two-section ruled limits and the overall family inventory. |
| Shell/draft | `part-shell-draft` and documented face-operation contracts | Recorded integrated lifecycle passes 172 checkpoints, including invalid thickness, selected opening, four draft faces and physical STEP planes. Other neutral/opening variants are not inferred from this case. |
| Hole | `part-hole`, `part-hole-flat`, `part-hole-conical`, `part-hole-next`, saved feature types and kernel cases | Recorded integrated lifecycle passes 119 checkpoints for two simple/counterbored through-hole centres. The 11 November focused follow-up adds normal Blind flat depth3→4, conical shoulder3→tip3 and countersink UntilNext90°→120°, including rejected input and physical STEP depths/surfaces. Its final combined-candidate result remains required. Other admitted combinations retain their separate contracts. |
| Linear/circular pattern and mirror | `part-pattern-create`, `pattern-all`, `pattern-until-next`, `part-additive-all`, `part-auto-scope`, `part-instance-depth`, `part-instance-radius` and pattern/mirror contracts | Body patterns retain their 194-checkpoint route. The combined bounded additive ALL, AUTO and selected-depth routes pass 101, 134 and 84. The new driving-circle radius route passes 93 focal checkpoints. The final combined 0.20.0 candidate and broader variation/regeneration retain their requirements. |
| Combine and explicit body catalogues | `part-combine`, `part-body-catalog`, imported-body and combine contracts | Recorded integrated ordered union/intersection/subtraction route passes 114 checkpoints, preserving an unrelated body, identities, history and final STEP bounds. Keep-tools and other variants retain their separate evidence. |

## Existing nine prototype groups

The [priority issue](https://github.com/angelcp2802/solidflow/issues/55) has 16
checked items out of 25. Each of its nine open groups keeps its own evidence.

| Existing open group | Recorded bounded cases | Remaining gate work |
| --- | --- | --- |
| Complete demo and human use | Sequential part modeling and embedded editing have recorded routes. The `1c6e955` Windows package passes the two- and three-plate origin/component distance walkthrough and fresh-process recovery. | C07, C08, C11, C18 on the next integrated executable, verified access and guide. Record human use separately. |
| Remaining view-editor behaviour | Presets, Normal To, named views, Previous and bounded native selector and gesture cases in three workspaces. | C13/N02–N06 retains the remaining selector, compact and context entries. |
| Broader keyboard interaction | Document/camera shortcuts, field ownership, Help focus, modal Escape and menu traversal have bounded cases. Local follow-up covers the part File menu and configured discard dialog in normal and compact windows. | C13/N07/N08 and P-X01 retain their named field, tree, viewport, repeat and composition cases. |
| Recurring persistence and installed/platform use | Versioned documents, interchange, close and recovery have local routes. All three persistence jobs pass on `2a9ad6d`. | C16–C18 require the next exact-head results and executable. Recurring hosted stability, cost and installed acceptance remain in [desktop tracking](https://github.com/angelcp2802/solidflow/issues/53). |
| Menus, context, selection and navigation | Windows focal records cover ordinary selection modes, plane toolbar, operation entries and embedded-copy aliases. The 0.21.0 package verifies the structural STEP transition. | C05, C07, C13 retain multi-sketch, tree/viewport and remaining standard/configured aliases in the command matrix. |
| Contextual/reference-first editors | Explicit support repair, saved ordinary-reference edits and embedded source changes have original lifecycle cases. | C06 and C09–C11 retain remaining advertised contexts, exact source ownership and final binding. Configured source/reference repair retains its separate advanced contract. |
| Thin/specialized material/mechanical/origin cases | Thin modes, corners, Blind caps, second directions, mechanical picking, aligned/opposed origins and five normal finishing/Hole cases have bounded evidence. | C05, C08, C10 retain the declared variant and scope inventory, including cap, offset and wider automatic-corner requirements. |
| Boundary angles and nested/configured/material references | Ordinary 0°/180°, named-state isolation and the supported compound/mechanical configured cases have records. | C09, C10, C14 require their combined scope/lifecycle evidence. Advanced configured movement, projection and repair stay in their separate contracts. |
| Materials, density, colours and backgrounds | C15 records 70, 75+30 and 231 checks, including real recovery and the fixed presentation captures. | Bind the cases to the next integrated source and artifact. Picker, GPU and human-use evidence retain their separate limits. |

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

- Draft PR #49 head `8f5c7701` and the hosted merge have the exact reviewed
  tree of `f40743`. All 121 frozen Windows commands pass, including the Screw
  regression and every declared desktop route. The local 0.20.0 executable
  passes the combined part/material/assembly and fresh-process recovery
  walkthrough. Its separate shortcut and guide are verified. Matching hosted
  CI passes all fifteen jobs and Security passes. Recurring stability and
  human/installed results retain their separate requirements.
- Draft PR #49 publishes `2a9ad6d`, with the exact tree of local `1c6e955`.
  Build, 11,427 unit/CAD cases in 518 files, 224 IPC checks with two skips and
  desktop startup pass. The 115-command source batch stops at the Screw route
  after 76 passes. Hosted Security and nine renderer/configured jobs pass,
  including all three persistence jobs. Three relations jobs fail the same
  Screw scene/document placement comparison and gate the Desktop jobs.
- The `1c6e955` Windows 0.20.0 archive has nine verified production members.
  The packaged walkthrough now passes the original 150 mm case and a third
  plate at 120 mm through Cancel/retry/Apply, history, Save/Open, fresh Solve
  and process recovery. The recovered three-plate Save As matches the saved
  original bytes. Source binding and limits are in [Validation](VALIDATION.md).
- The next candidate combines exact root-part placement transport, named
  origin-owner selectors, explicit recipe availability and repair, the five
  normal finishing/Hole cases and finite operation/copy alias evidence.
  The source, executable and hosted checks each retain their own acceptance
  receipts. The seven explicit variation/repair/Windows-transition CI steps
  and the new focal routes keep the current job permissions and budgets.

### Earlier integration records

- Public `02bab957` in draft PR #49 follows the 31-command Windows baseline
  and adds the bounded Float64 corner-picking correction. All nine relations,
  configured-authoring and hinge/symmetry jobs pass, with Security successful.
  Persistence has the recorded Help/label failures and Desktop prerequisite
  failures. The delivered executable belongs to the earlier `ce27324` snapshot.
- `daa78a6` passes an eighteen-command Windows integration with 11,367 cases
  in 514 files, 224 IPC checks, two explicit skips and native desktop startup.
  It exercises AUTO, selected instance depth, sketch/menu/STEP workflows,
  materials, recovery and embedded transitions. Manifest
  `c4e63d024079562cb9efa951c9541be0873e30997b0c8f2825125771813bdcc1`.
- The first local 0.20.0 snapshot combines that source with the display aliases and
  corner-picking correction. Exact `6d1f705` passes all 25 source commands,
  11,373 unit/CAD cases in 514 files, 224 IPC checks with two skips, build and
  startup. Its packaged-window part and 30 mm assembly cases pass. An
  identity-origin 150 mm plane-distance relation fails with `nonConverged`.
  Correcting that blocker and checking the final executable remain required.
- Local `4fb894f6` passes its full suite, build and startup plus default/compact
  Help 520/520 and sketch 371/365 cases. Its Help keyboard and label-fragment
  corrections retain exact source bindings and hosted verification requirements.
- The `1c6e955` integration includes signed-distance conditioning from
  `e76be8f` and the driving-circle table from `81edcde`, with their separate
  focal evidence retained.
- C05 AUTO, bounded selected-depth variation and the Selected Blind
  driving-circle radius table have their recorded cases. Other driving
  dimensions, general solved-sketch variation, additional recipe parameters and
  broader regeneration keep their required implementation and evidence.
- C10 and C13 retain their finite family/command inventory. The bounded
  material picks, Help, edit-menu focus, sketch tools and display cases have
  evidence. Further aliases and context cases keep their named requirements.
- C15 has material, colour, mass and fresh-process recovery cases. Frame and
  hardware/platform claims remain limited to their actual recorded checks.
- Issue #55 is 16/25 with nine groups open, #53 is 6/9, PR #49 is a draft and
  release gate #5 is open. Human use, recurring hosted stability and installed
  platforms have separate evidence requirements.

The project objective stays active until the required local gate is satisfied.
