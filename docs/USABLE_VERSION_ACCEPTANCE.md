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
| C04 | Successive salients and cuts, including a new sketch on a face, reconstruct and persist. | The [0.25.0 native Windows walkthrough](VALIDATION.md#packaged-0250-combined-demo--windows-2026-11-11) applies two cuts and two merged extrusions from four prepared sketches, saves and reopens. Sequence oracle V960→944→928→976→984 mm³, final A848 mm² and bounds [-10,-6,0]…[10,6,9]. The separate fresh-sketch route retains V960→1008→996 and A736→784→808. The [earlier-boss edit](VALIDATION.md#editing-an-earlier-boss-with-a-dependent-face-cut--windows-2026-11-11) extends that chain through Cancel, Apply, history and Save/Open. Raising the earlier boss from 3 to 5 mm retains the dependent sketch and cut, moves the cut floor from Z4 to Z6 and gives V1028/A840. Original tolerances retained. |
| C05 | Every enabled implemented solid-operation family has a working normal entry, editable parameters and recoverable invalid input. | The recorded normal families retain their cases. The combined `daa78a6` source passes bounded additive ALL, captured AUTO and selected Blind depth variation. The integrated 0.20.0 batch verifies the Selected Blind driving-radius table. The 0.21.0 Windows package verifies independent width and height on a selected rectangular Blind cut. The follow-up verifies radius and rectangular dimensions on merged Blind bosses in local focal runs. The corrected [0.27.0 native two-direction cap case](VALIDATION.md#packaged-0270-two-direction-thin-wall-caps--windows-2026-11-11) verifies a 13 mm and 7 mm wall with two 4 mm caps, Undo/Redo and independent STEP geometry. The [Direction 2 fixed-plane recipe](VALIDATION.md#fixed-principal-plane-regeneration-in-direction-2--windows-2026-11-11) verifies the enabled Selected cut lifecycle through Cancel/retry, Apply, Save As and Open. Exact integrated and hosted checks, other dimensions, additional recipe parameters and broader regeneration remain required. The [finite recipe availability inventory](FEATURE_RECIPE_AVAILABILITY.md) separates blocked new choices and explicit saved-selection repair from those remaining requirements. Existing disabled modules retain clear availability guidance. |
| C06 | Earlier-feature edits, suppression/deletion and references preserve identities or expose explicit recovery. | The recorded `part-reference-repair` route passes 139 checks: scalar-depth support continuity, signed-branch loss/diagnosis, explicit reselection with the same IDs, Cancel/retry, suppression/reactivation, cascade deletion/history, Save/Open and physical STEP planes. This explicit-body case uses actual v1 references; preserve the documented v2 gate and topology limits. |
| C07 | Create a three-component assembly from modeled/imported/reused parts, then fix, float and place the intended occurrence. | The [0.26.0 native mixed assembly](VALIDATION.md#packaged-0260-mixed-three-piece-assembly--windows-2026-11-11) incorporates a new STEP prism alongside two uses of an existing modeled source, fixes/frees the new occurrence and moves it to X70. Fresh recovery and explicit Open preserve the graph and three STL placements. The [0.23.0 empty-start route](VALIDATION.md#packaged-assembly-authoring-and-shared-part-editing--windows-2026-11-11) retains its distinct three-prism case. |
| C08 | Relate components both to root/component origins and to one another. | The [0.26.0 native mixed assembly](VALIDATION.md#packaged-0260-mixed-three-piece-assembly--windows-2026-11-11) verifies saved root XY and XZ relations and Guía-to-Prism signed YZ distance, with zero local degrees of freedom after fresh Solve. The 0.23.0 root distance and component-axis parallelism, standard/configured origin cases, and aligned/opposed planes retain their own contracts. |
| C09 | Ordinary saved relations and their reference replacements work at the supported boundaries. | The recorded ordinary-assembly route passes 483 checks, retaining 30°→60° and Apply/Save/Open/fresh Solve at 0°/180°. Saved distance, angle, coincidence, concentricity and parallel/perpendicular reference edits pass the separate 276-check route. The [ordinary material distance route](VALIDATION.md#ordinary-signed-distance-between-two-material-faces--windows-2026-11-11) verifies two actual viewport face replacements and the reopened signed constraint. Preserve the antipodal regressions and tolerances. The panel-scroll correction passed Windows, Linux and macOS hosted jobs on `a490e89`. |
| C10 | Each exposed specialized relation family completes its announced lifecycle. | Fixed inventory of distance/angle limits, directed angle, tangencies, component lock, gear/screw/rack, width, symmetry, profile center, LINE/circular paths and limited/unlimited hinge. Material acquisition and held-role selection have bounded desktop results for the stated families. Keep nomination separate from native capture/Apply and verify the combined lifecycle and scope. The [standard intersecting Width case](VALIDATION.md#centered-width-with-intersecting-material-planes--windows-2026-11-11) verifies four ordered inclined faces, Cancel/Apply, history, Save/Open and fresh Solve for the two original prisms. Other [Width variants](ASSEMBLY_WIDTH.md#evidence-and-remaining-scope) remain open. The original configured LINE recipe has a packaged Windows lifecycle with rejection, Cancel/retry, Apply, edit, history and reopening. [Packaged LINE evidence](VALIDATION.md#packaged-configured-line-path--windows-2026-11-11). |
| C11 | Shared-source changes and embedded-part editing preserve the parent and every exact active source use. | The [0.24.0 Windows walkthrough](VALIDATION.md#packaged-material-face-repair--windows-2026-11-11) verifies two explicit planar-face repairs, Cancel/retry, one Apply/Undo/Redo and fresh Solve after reopen. The saved graph retains both occurrences, their poses, the Z-axis relation and both repaired owners. Independent STL measures 72 mm³ and 132 mm². The [source repair availability case](VALIDATION.md#solve-availability-during-shared-part-source-repair--windows-2026-11-11) verifies that panel, ribbon and Tools Solve wait for the exact current repairs and preserve the existing native preview and Apply checks. |
| C12 | Pending work, Cancel and operating-system close preserve documents and reject late/stale actions. | Passed the 7 November recorded Windows fixture. Exact dispatched Apply/request outstanding at exit, four rejected Apply exits, authentic reply before parent rebuild, real native keep/discard close and fresh-process recovery/reopen. Interruption midway through kernel execution has separate coverage requirements. |
| C13 | Selection, viewport context, ribbon/side-panel commands, camera and keyboard act on the intended target. | The [finite command matrix](USABLE_COMMAND_MATRIX.md) maps aliases and evidence. Windows records cover bounded Help ownership, edit-menu focus, sketch modification controls and held-role selection. The follow-up verifies part File-menu ownership for Delete and Ctrl+Z/S/O/N, plus the configured dirty-document decision and retry in both layouts. Finish the remaining entry-point, context and keyboard cases. Retain view, camera and document history as separate checks. |
| C14 | The currently implemented nested/configured workflows retain their scope, state and references. | Reused subassembly with two supported states, correct editable scope, state isolation, supported relation forms, Cancel/Apply/history/recovery and Save/reopen. Explicitly track the configured omissions below. The configured LINE package case verifies right Compact, mixed Base/Compact isolation, saved orientation and fresh resolve. The origin-owner case verifies that a fresh Right Compact relation can select its local XY after editing with a Left Base component owner. [Packaged LINE evidence](VALIDATION.md#packaged-configured-line-path--windows-2026-11-11) · [Origin owner fallback](VALIDATION.md#configured-origin-owner-fallback--windows-2026-11-11). |
| C15 | Part materials, density, part colour and background are configurable and persist compatibly. | The [0.27.0 Windows walkthrough](VALIDATION.md#packaged-0270-materials-recovery-and-configured-bom--windows-2026-11-11) verifies native color, density and mass for a two-body part, same-source occurrences, visibility and suppression, fresh profile recovery, and Base/named configured BOM and CSV. The 0.24.0 Windows package verifies native colour pickers, 0.001 kg mass, Undo/Redo, a byte-identical recovery copy and native Open for one cube. Prior integrated cases cover part properties (70), two-process recovery/background (75+30) and the three-use standard/configured material/mass lifecycle (231). Thirty-two fixed frames remain hash-verified, with qualitative review of selected views. Exact source ID and revision, history and file compatibility remain authoritative. [0.24.0 walkthrough](VALIDATION.md#packaged-part-appearance-and-recovery--windows-2026-11-11) · [Properties contract](PART_PROPERTIES.md). |
| C16 | File operations preserve native document versions and the supported interchange formats. | Recorded Windows cases cover `.solidflow` v1/v2/v3, ordinary single-solid and structural STEP, STEP/STL geometry and configured BOM CSV. The [0.25.0 structural round trip](VALIDATION.md#packaged-0250-structural-step-replacement-and-recovery--windows-2026-11-11) verifies dirty Save and continue with Cancel/retry, independent graph/geometry of eight placed solids, and byte-identical fresh-process recovery and reopening while the original STEP is unavailable. Installed/platform checks retain separate requirements. |
| C17 | The final application has appropriate security, error and responsiveness checks. | Full `npm test`, build and desktop smoke after relevant changes, code-review and security-review of sensitive boundaries. Fix confirmed vulnerabilities and reproducible use blockers. Profile a reported slowdown on the same workload before/after any performance change. |
| C18 | A clearly identified executable opens from the desktop and completes a practical combined walkthrough. | The [0.26.0 Windows directory package](VALIDATION.md#packaged-0260-demo-and-fixed-plane-cut--windows-2026-11-11) has a verified shortcut, a Spanish guide and 17 original examples. The shortcut loads the clean two-solid assembly at 1,968 mm³. Native Direction 2 recalc, Save/Open and independent STEP evidence are recorded. The [0.25.0 combined walkthrough](VALIDATION.md#packaged-0250-combined-demo--windows-2026-11-11) retains actual part creation, standard assembly authoring, fresh Solve/Cancel and independent STL checks. Hosted, installed-platform and human-use results retain separate requirements. |

## Solid-operation family matrix

The supported variants and identities in the linked contracts define each case.
Retain independent BRep/solid-count/volume/area/bounds checks where applicable.

| Family | Existing route or contract | Final lifecycle status |
| --- | --- | --- |
| Extrude/cut and independent end directions | `part-sequence`, `part-from-empty`, `part-two-direction`, `part-two-direction-limits`, `part-face-limits` | Recorded integrated canonical routes pass; command aliases remain in C13. |
| Revolve/revolved cut and admitted axes | `part-revolution`, `part-external-axis` | Recorded integrated bounded revolution/cut and external-axis routes pass. |
| Thin walls, supported corners and caps | `part-thin-wall`, `part-auto-corners`, `part-end-caps` | Recorded integrated cases pass. The local additive mid-plane Blind extension verifies two signed depths and the existing cap lifecycle. Other cap extents, topology and profile contracts retain their own requirements. |
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
| Complete demo and human use | The 0.25.0 Windows directory package passed the native combined part and two-occurrence assembly walkthrough, with verified desktop access and a guide. The 0.24.0 package retains separate native C11 and C15 results. The 0.23.0 package retains its three-occurrence authoring and configured-reference cases. | Record human use and installed-platform acceptance separately. |
| Remaining view-editor behaviour | Presets, Normal To, named views, Previous and bounded native selector and gesture cases in three workspaces. The standard and configured compact renderer routes exercise direct view buttons at 1024×681 content size. | C13/N02–N06 retains the remaining selector, compact and context entries. |
| Broader keyboard interaction | Document/camera shortcuts, field ownership, Help focus, modal Escape and menu traversal have bounded cases. Local follow-up covers the part File menu and configured discard dialog in normal and compact windows. | C13/N07/N08 and P-X01 retain their named field, tree, viewport, repeat and composition cases. |
| Recurring persistence and installed/platform use | Versioned documents, interchange, close and recovery have local routes. All three persistence jobs pass on `2a9ad6d`. | C16 and C17 retain the exact-head results still to be verified. C18 records the local executable and combined walkthrough. Recurring hosted stability, cost and installed acceptance remain in [desktop tracking](https://github.com/angelcp2802/solidflow/issues/53). |
| Menus, context, selection and navigation | Windows focal records cover ordinary selection modes, plane toolbar, operation entries and embedded-copy aliases. The standard viewport right-release opens Move and Edit Part for the targeted occurrence. The 0.25.0 package verifies the structural STEP transition. | C05, C07, C13 retain multi-sketch, tree/viewport and remaining standard/configured aliases in the command matrix. |
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

- The [0.30.0 Windows package](VALIDATION.md#packaged-0300-keyboard-and-width-choices--windows-2026-11-11)
  passed its required checks and the four focused width, keyboard, body
  and nested-origin routes. The native window verifies the two Escape
  actions and labels for the inclined width references. Its verified
  shortcut recovers the 2,208 mm³ assembly with identical saved bytes.
  Complete the exact desktop inventory, hosted and installed checks.
  [Functional tracking](https://github.com/angelcp2802/solidflow/issues/55)

- The exact 0.28.0 Windows source passed all 123 commands and the
  independent rehash. The hosted and installed gates retain their live
  evidence in [desktop tracking](https://github.com/angelcp2802/solidflow/issues/53).

### Prior checkpoints

- The first 0.27.0 Windows x64 directory package passed its exact
  required suite and 19 prioritized commands. The packaged centered
  cap edit, rejection, Undo and Redo, recovery, Open and STEP geometry
  have a [native record](VALIDATION.md#packaged-0270-centered-thin-wall-cap-lifecycle--windows-2026-11-11).
  A later candidate includes the origin-leader correction and needs
  independent package and hosted validation.

- The verified 0.26.0 Windows demo includes the eight-solid structural
  STEP example and the Direction 2 recalc. The exact package and REA
  inventories passed. All 123 frozen Windows commands passed and their
  logs were independently rehashed. The native mixed three-piece case
  solved with zero local degrees of freedom
  after reopening with the source paths withheld. The exact hosted tree
  passed both Security jobs. The macOS compact configured camera test
  reported a stationary raster mismatch during Previous after keyboard
  Fit. All other renderer jobs passed. The three Desktop jobs stopped at
  the renderer prerequisite. The repeat on the same tree reproduced both
  pixel hash pairs. The local follow-up retains the exact comparison and
  captures diagnostic pixel differences for the next hosted attempt.
  [0.26.0 package and native evidence](VALIDATION.md#packaged-0260-demo-and-fixed-plane-cut--windows-2026-11-11)
  · [Mixed assembly](VALIDATION.md#packaged-0260-mixed-three-piece-assembly--windows-2026-11-11)
  · [Hosted camera case](VALIDATION.md#hosted-0260-compact-configured-camera-observation--2026-11-11)

- The local follow-up adds the Spanish fixed-plane diagnostic, scoped
  configured context and compact IME handling, standard assembly
  visibility and overlapping-component keyboard Move checks, and caps
  for additive mid-plane Blind thin walls. Keep their package and hosted
  acceptance distinct from the delivered 0.26.0 demo.

- Draft PR #49 head `6ab5ebce197267d8fb9b0e2c1b2eb34003562cf3` and hosted
  merge `febdf028878bf6cca2974f9acba453fc035e1f83` identify the frozen 0.25.0
  checkpoint. The Windows x64 package passed the native combined walkthrough.
  The verified shortcut opens the saved two-solid assembly at 1,968 mm³,
  with the Spanish guide and 13 original samples checked. All 122 frozen
  Windows commands, all 15 hosted CI jobs and both hosted Security jobs
  passed. Remaining command cases, installed platforms and human use
  retain their own evidence. [Draft PR](https://github.com/angelcp2802/solidflow/pull/49)
  · [CI](https://github.com/angelcp2802/solidflow/actions/runs/43022928891)
  · [Security](https://github.com/angelcp2802/solidflow/actions/runs/43022928819)
  · [0.25.0 native combined case](VALIDATION.md#packaged-0250-combined-demo--windows-2026-11-11)

### Earlier integration records

- Draft PR #49 head `916b5e34d52de912230d47c5e87fc0d67796967a` and the
  hosted merge `9ca4a228f684aa37a3f8dc534087885c86c23434` match the
  frozen 0.24.0 source tree of `f299733`. The frozen Windows inventory
  passed all 122 commands. Both Security jobs passed. Windows and macOS
  persistence passed. Ubuntu persistence was cancelled at its 35-minute
  limit, so all three Desktop jobs stopped at their prerequisite. [Draft PR](https://github.com/angelcp2802/solidflow/pull/49)
  · [CI](https://github.com/angelcp2802/solidflow/actions/runs/43012702127)
  · [Security](https://github.com/angelcp2802/solidflow/actions/runs/43012702125)
- The local 0.24.0 desktop shortcut and updated guide are verified. The
  original four-cut plate opens at 772 mm³ and the guide includes ten
  verified samples. C11 material-face repair, C15 appearance and recovery,
  and the C10/C14 configured LINE case have separate native passes.
  [Windows demo access and native cases](VALIDATION.md#packaged-demo-access--windows-2026-11-11)
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
- An earlier candidate combined exact root-part placement transport, named
  origin-owner selectors, explicit recipe availability and repair, the five
  normal finishing/Hole cases and finite operation/copy alias evidence.
  The source, executable and hosted checks each retain their own acceptance
  receipts. The seven explicit variation/repair/Windows-transition CI steps
  and the new focal routes keep the current job permissions and budgets.

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
- Issue #55 is 16/25 with nine groups open, #53 is 7/9, PR #49 is a draft and
  release gate #5 is open. Human use, recurring hosted stability and installed
  platforms have separate evidence requirements.

The project objective stays active until the required local gate is satisfied.
