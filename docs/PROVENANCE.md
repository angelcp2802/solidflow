# Public fixture provenance

## Assembly reference-panel regression reuse

This presentation change introduces no geometry fixture or imported asset.
The compact standard and configured origin cases retain
`scripts/desktop-assembly-origin-axes-original.cjs`: original 2-by-3-by-4 mm
prisms with analytical volume 24 mm3 and area 52 mm2, unchanged definition,
occurrence and reference identities. Rotation-lock and compact configured
picking regressions retain their existing original fixtures and oracles.

The new disclosure checks use actual pointer and keyboard input on the
application's existing controls. They observe layout, active role, reference
values, recovery and native-request state without assigning hidden references
or accepting extra geometry. Running the standard case at minimum size adds
no numerical tolerance, geometry or platform guarantee. The first run passes
the disclosure invariants but fails later before pointer press; the follow-up
adds diagnostics only and records target motion in the second failing run.
The navigation-frame wait adds no CAD fixture or geometric oracle. Run 03 passes
the prior stability check but fails origin assignment; a bounded manual attempt
on an original two-prism demo also leaves the role unassigned. No Apply, Save or
geometry change is accepted in that manual check. After a disclosure-state
update fix preserving the ticket guards, standard origin 04 passes 247 checks
on the same original recipe. Separate temporary diagnostics are not treated as
acceptance, and their instrumentation is removed before the run. Configured
origin, rotation-lock and compact configured regressions also pass on that
snapshot. Manual 04 uses an isolated recovery seed of the original two-prism
fixture and assigns only the first origin reference; it performs no preview,
Apply, Save or export. Four final images provide bounded presentation evidence,
not geometric or interaction oracles. Build, all four selected renderers,
full-suite and smoke pass on the same final 1,130-input source/runtime snapshot.
Current-head hosted acceptance remains pending. Exact results and historical
snapshots are recorded in [validation](VALIDATION.md).

## Shared command-header regression reuse

The shared header introduces no CAD fixture, imported model, stored topology
reference or external visual asset. Its interaction checks reuse the
project's original part and assembly recipes with their existing identities
and independent geometry expectations. Body-catalogue, successive-part and
revolution cases retain the provenance recorded below; rigid/configured
persistence and compact configured picking retain their original recipes.
Standard and configured origin-axis cases
use `scripts/desktop-assembly-origin-axes-original.cjs`, whose original
2-by-3-by-4 mm prism has analytical volume 24 mm3 and area 52 mm2.

Header bounds, hit targets, keyboard focus and menu placement are presentation
observations, not extra geometry or interoperability oracles. The first local
catalogue run passes 42 checkpoints on the unchanged original long-name fixture;
its header/tree measurements apply only to that content size and case. Reusing
a passing fixture does not itself validate other header actions. The revolution
follow-up opens the existing Info disclosure through actual input and checks
unchanged geometry and document invariants; it adds no fixture, tolerance or
CAD operation. Revolution, parts and rigid assembly pass on the final snapshot;
the two changed harness inputs distinguish it from the retained selected 01
catalogue and origin/picking results. Configured persistence, full-suite and
smoke also pass on the final snapshot. Eight reviewed captures document
presentation only; they add no geometric or persistence oracle. The local lower-edge check records an
infeasible negative scroll offset before the Info disclosure and a feasible
positive offset afterward, with all original assertions preserved. Exact
results and limits belong in [validation](VALIDATION.md).

## Original body-catalogue presentation case

`scripts/desktop-part-body-catalog-original.cjs` reuses the original finishing
two-prism recipe and its document, feature and body IDs. It changes only the
document and extrusion display names, adding long descriptive names for the
catalogue/details checks. There is no imported model, external asset or stored
topology reference. A spans [0,0,0] to [10,6,4] mm; B spans [20,0,0] to
[30,6,4] mm. Each prism has analytical volume 240 mm3 and area 248 mm2.

`scripts/desktop-part-body-catalog-flow.cjs` checks worker volume, the summed
planar triangle-mesh area and literal bounds with absolute tolerances of 5e-6
in their respective units. It does not measure native BRep area or perform a
new STEP round trip. Pointer selection and native keyboard disclosure actions
must preserve exact current body identities, worker serial/build history,
recovery and history availability. A lower-feature edit is cancelled; the same
original document is then reopened. No operation is accepted and no file is
saved or exported. Two original opens and unchanged fixture bytes are required.

This is a presentation and read-only browsing case with two bodies, not new
finishing coverage, large-catalogue acceptance or platform support. Initial
layout checks precede helper reveal; later pointer actions can use scroll
assistance. The earlier 03 run's 41 checkpoints and three presentation captures precede
the final scroll adjustment; captures add no geometric oracle. The final local
04 run also passes 41 checkpoints, including body B and its details control
remaining visible with A's details open. The bounded Windows manual check uses
this same original fixture seeded through isolated recovery; it performs no
native Open, edit, Apply, Save or export. Build, selected renderers, manual
browsing, full-suite and smoke validation share the final unchanged input
snapshot. Hosted acceptance of the new head remains pending. Exact results and
source identity belong in [validation](VALIDATION.md).

## Original two-prism finishing cases

`scripts/desktop-part-finishing-original.cjs` authors two separate rectangular
prisms: A spans [0,0,0] to [10,6,4] mm; B is translated 20 mm along X and spans
[20,0,0] to [30,6,4] mm. Each has volume 240 mm3 and area 248 mm2. The recipe
contains two sketches and two explicit new-body extrusions, with no imported
geometry or stored topology references. Its coordinates share the original
analytical construction used by `kernel.body-workflow.test.ts`.

`scripts/desktop-part-finishing-flow.cjs` starts each finish from that original
input. A real pointer selects A's vertical edge at x=10, y=6; the current edge
DTO is checked as a witness after selection, never injected into the UI. A
radius-1 fillet removes a 1-by-1 corner minus its quarter circle over height 4,
leaving volume 236+pi mm3 and area 238+2.5*pi mm2. A separate equal-distance-1
chamfer removes a triangular prism, leaving volume 238 mm3 and area
239+4*sqrt(2) mm2. Both retain A's original bounds. B retains volume 240 mm3,
area 248 mm2 and its literal bounds; its observed body/edge data are also
compared unchanged. These are two separate single-edge cases, not chained
finishes, all-edge selection or tangent-propagation coverage.

Worker volume and bounds, and exported-solid volume, area and bounds, use
absolute tolerances of 5e-6 in their respective units. The literal native corner
witness uses 5e-7 mm. A separate STEP reader checks millimetre units, complete
root transfer, aggregate and per-solid BRep validity, and exactly two solids.
It uses the same kernel family; this is not independent interoperability, and
there is no separate closed-shell assertion.

The workflow checks Cancel/retry, Apply, Undo/Redo, saved bytes, reopening and
two actual STEP exports. File dialogs use isolated test-owned paths. Initial
layout measurements precede helper scrolling; later pointer activation can use
scroll assistance. The bounded local Windows results are recorded in
[validation](VALIDATION.md#fillet-and-chamfer-panel-order--2026-10-25); they do
not establish broader finishing coverage or general platform support.

## Extrusion and cut panel-order checks

`scripts/desktop-part-extrude-layout.cjs` reads the existing production UI; it
introduces no geometry fixture. The sequence and fresh-sketch integrations
reuse `src/cad/fixtures/part-sequence-original.json` and
`scripts/desktop-part-fresh-sketch-original.cjs`, documented below. Empty cut
selection and missing new-extrusion body limits are temporary UI drafts;
Cancel or repair returns to the existing sequence without adding accepted
geometry. Original geometric expectations and tolerances remain in place.

The additional `BodyManagementPanel.test.tsx` cases use symbolic body DTOs and
original incomplete declarations to check narrow diagnostic presentation.
They are not native geometry or pointer evidence.

## Original two-direction and mid-plane revolution cases

`src/cad/kernel.revolution-extent.test.ts` authors an annular-sector rectangle
with radial coordinate 2 to 5 mm and axial Y coordinate 1 to 7 mm. No imported
model, binary, artwork or external implementation contributes to the fixture.
For a partial total angle theta in radians, volume is 63 theta mm3 and area is
(63 theta + 36) mm2. Thus a 60/30-degree interval has V=31.5 pi and
A=31.5 pi+36. With the local positive-Y convention, its bounds are
(1,1,-5 sqrt(3)/2) to (5,7,2.5); reversal changes the Z interval to
[-2.5,5 sqrt(3)/2]. Mid-plane total 90 degrees instead has bounds
(sqrt(2),1,-5/sqrt(2)) to (5,7,5/sqrt(2)). A complete annulus has V=A=126 pi
and bounds (-5,1,-5) to (5,7,5), without the partial interval's radial caps.

Additional original recipes use a transformed support, a translated 3-4-5 line
axis, a rectangular nested hole and a radius-1 circular profile centered at
radial coordinate 4 and axial coordinate 3. An explicit annulus body followed
by a radius-3 scoped bore has V=96 pi and A=128 pi. Expected formulas and literal
bounds do not call the production extent resolver. A separate STEP read checks
BRep validity, one solid, volume and area within 1e-5, and bounds within 1e-6 mm.
The model fixture in `src/model/revolutionExtentDocument.test.ts` is likewise an
original rectangle and declaration sequence for strict parsing, round trips,
dependencies and history; it is not geometric evidence. UI fixtures exercise
mode transitions and preserved inversion without claiming native geometry.
Focused results, selected renderer passes and remaining acceptance are recorded in
[validation](VALIDATION.md#two-direction-and-mid-plane-revolution--2026-10-25).

## Original principal-axis rotation capture

`scripts/desktop-assembly-origin-axis-lock-original.cjs` reuses the tracked
original 2 by 3 by 4 mm prism recipe. The fixed prism is translated to (-15,0,0).
The moving prism starts at (0,0,6), rotated +30 degrees about Z, with a free
concentric relation between its Z axis and the root Z axis. The configured case
authors this relation only in the named `demo` state; Base and `untouched` remain
separate. No imported geometry, model or implementation contributes to the recipe.

Each prism has volume 24 mm3 and area 52 mm2. The moving XY bounds are
(-1.5,0) to (sqrt(3),1+3*sqrt(3)/2); Z spans four millimetres. These asymmetric
bounds expose roll that a circular cylinder cannot. The ordered captured
quaternion is (0,0,-sin(pi/12),cos(pi/12)), up to sign. Capture removes spin
while leaving axial travel free. Native tests additionally use original
cylinders, distinct shared placements and nested wrappers, with independent
literal orientation, area, volume and bounds checks. Pure numerical cases check
reversed roles, both quaternion signs, differently directed local axes and
floating common-frame freedom. These are bounded original cases, not universal
assembly coverage. Renderer file dialogs use isolated test-owned paths.

## Original revolution and bore sequence

`scripts/desktop-part-revolution-original.cjs` authors three unused sketches in
millimetres: an XY rectangle centered at (2,0), width 4 and height 8, and an XZ
circle centered at (0,0), radius 1, plus an XY entity rectangle x=[3,7], y=[0,10]
with a construction line from (3,-2) to (3,12). There are no imported solids or downstream
operations in the input. The actual editor changes rectangle height to 10.
Its local-Y half revolution has volume 80 pi and bounds (-4,-5,-4) to (4,5,0);
the full revolution has volume 160 pi and bounds (-4,-5,-4) to (4,5,4).
A symmetric 20 mm cut through the radius-1 circle leaves volume 150 pi and
surface area 130 pi, with the same full-cylinder bounds.

The entity rectangle's full local-Y annulus has volume 400 pi. Quarter turns
about X or Y both have volume 100 pi but different literal bounds; reversal
flips their Z interval. A reversed quarter turn about the construction line at
x=3 has volume 40 pi and bounds (3,0,0) to (7,10,4). These axis previews are
cancelled before the original sleeve sequence. Its final saved revolution
explicitly selects Y with reversal; a full turn retains the cylinder/tube
geometry. Construction-line persistence is checked separately by model tests.

The two-direction extension reuses the staged sleeve rectangle x=[0,4],
y=[-5,5]. A 60/30-degree total has V=40 pi and bounds
(0,-5,-2 sqrt(3)) to (4,5,2); reversal changes Z to [-2,2 sqrt(3)].
Mid-plane total 90 degrees has the same volume with Z spanning
[-2 sqrt(2),2 sqrt(2)]. The persisted reversed 270/90 turn preserves the full
cylinder and subsequent bore formulas above. These coordinates are authored
analytically in `scripts/desktop-part-revolution-extents.cjs`; they do not use
the production interval resolver. Mid-plane previews are not the saved final
variant in this renderer case.

These literal formulas are independent of the worker's results. The workflow
uses actual pointer activation; numerical fields use input/select setters and
bubbling events. It checks Cancel, operation history, Save/reopen and exports
actual STEP bytes through the existing restricted IPC. A separate native reader
checks BRep validity, one solid, volume and area within 1e-5 and bounds within
1e-6 mm. It does not reuse the application's native shapes. File dialogs are
substituted with test-owned paths, so this is not manual native-dialog evidence.
The native axis tests author additional cylinders, torus profiles and an oblique
3-4-5-axis rectangle. That cylinder's center is (1,2,0), unit axis (.6,.8,0),
length 10 and radius 4: volume 160 pi, area 112 pi and literal bounds
(-5.2,-4.4,-4) to (7.2,8.4,4). Expected coordinates do not call the production
axis resolver. A separate STEP import checks validity, solid count, volume,
area and bounds; changed/rejected axes cannot reuse an older export.
No external model, binary, artwork or implementation is included. These cases
do not establish arbitrary axes, all profile topologies or a complete workbench.

## Ordinary part selection and origin-label placement

The part-selection unit cases construct an original 8 by 8 planar display
square, its upper boundary segment and a separate 9 by 9 occluding plane.
Literal screen points distinguish a near-edge hit, face interior and empty
background. These are display/picking cases, not native solid measurements.
The renderer reuses `part-sequence-original.json`: its 20 by 12 by 4 base,
front-view fit and observed canvas rectangle locate actual pointer targets.
Native output and application picking helpers do not supply those targets.
Selection checks retain exact recovery, worker request counts and history-control
availability; the sequence's existing geometric and persistence oracles follow.

Origin-label layout cases use authored pixel coordinates, distinct keys and
bindings, coincident anchors, long names, viewport edges and insufficient area.
They preserve the original projection tests. Standard/configured renderer checks
reuse the existing two-prism origin fixture and inspect actual button rectangles,
center hit targets and pairwise non-overlap before the original reference presses.
No new CAD file, external artwork, binary or private model is included. These
presentation cases do not establish arbitrary topology or platform support.

## Assembly component panes and origin disclosure

This presentation increment reuses the original nested BOM and two-prism
origin-axis fixtures, without adding CAD files or geometric oracles. Standard
pane navigation checks existing fields, full occurrence selection, native serial
and exact recovery. The free-component case prepares one local-X form value with
scripted input/change events, navigates with actual CDP pointer controls, then
restores the original value without preview or CAD mutation. Guarded fixtures
report that preparation as skipped rather than claiming draft-retention coverage.
Configured origin disclosure checks retained owner, visibility, roles and draft
while closing/reopening its actual summary. Static markup cases use synthetic
form controls; they do not establish browser focus or runtime disclosure behavior.
No external visual assets or implementation are included. Executed cases and
their limits are recorded in [validation](VALIDATION.md).

## Assembly origin-tree browsing

The pure catalog tests reuse `assemblyConfigurationCore.test-utils.ts` and its
original prisms. Literal world witnesses distinguish the reused B occurrences:
centers (10,0,0) and (30,4,0), with the latter's local X directed along world Y.
An extent of 2 gives X-axis endpoints (30,2,0)/(30,6,0) and XZ-plane corners
(30,2,-2), (30,6,-2), (30,6,2), (30,2,2), compared to 12 decimal places.
These are display-transform witnesses, not native BRep or solver measurements.
A generated repetition of the same authored source supplies 312 catalog entries
to check that the viewport still displays only one selected datum.

Static component tests reuse the existing original standard/configured assemblies.
The renderer reuses the original two-prism origin-axis and nested BOM recipes;
no imported model, topology key, binary or third-party visual asset is added.
The small plane/axis SVG icons are authored directly in the shared component.
Pointer cases check the actual tree and projected-label selection, retained
collapse state, current scope/owner, history guards, native request count/serial
and exact recovery text. They add no relation-role assignment or geometric oracle.
The existing independent geometry, preview/history and saved-file checks remain
separate. Source-specific execution belongs in [validation](VALIDATION.md).

## Assembly occurrence-tree navigation

The shared navigation tests author a small presentation-only hierarchy with two
owners of a reused definition, a deeper branch and a revised identity. Standard
and configured component tests reuse the existing original assembly fixtures;
static markup checks do not establish actual focus or geometric correctness.

The renderer's bounded disclosure, selection, keyboard and explicit-properties
scenario reuses the original standard and configured BOM assemblies. Their
geometry, quantities, CSV records and saved-file oracles remain independently
declared. Configured scope changes retain the existing native rebuild and the
prior scope/occurrence is restored through controls before the BOM regression.
No new CAD fixture, imported model, external image or copied implementation is
introduced. Actual interaction results and limits belong in [validation](VALIDATION.md).

## Assembly command-tab navigation

The shared ribbon tests author only tab values and inspect static accessible
ownership. Renderer navigation reuses the original origin-axis prisms and
configured pointer cubes below. Actual CDP tab presses and fixed keyboard keys
compare existing fields, inspector state, recovery and native request serial
before and after navigation. BOM close/focus checks reuse the existing original
BOM catalogs and use scripted controls. No new model or external asset is added;
the existing independent geometry and file-persistence oracles are unchanged.

## Part feature-tree presentation

`src/model/partFeatureTree.test.ts` authors small sketch, extrusion, sweep and
loft declarations for hierarchy, shared inputs, duplicate and unresolved
references, filtering and occurrence identity. No imported model or external
geometry supplies these cases; they make no geometric-validity claim.
The identifier case constructs parser-accepted text with spaces, punctuation,
Unicode and isolated UTF-16 surrogates and checks exact, distinct ARIA ID encoding.

The tree-navigation renderer checks reuse the original sequential part below.
They compare recovery text and worker build serial before and after disclosure,
selection, keyboard navigation and filtering. Pointer targets are revealed with
the DOM scroll API, then hit-tested before actual CDP input. Field changes remain
scripted. The existing solid geometry, history and file oracles are unchanged.

## Configured material pointer original

`scripts/desktop-assembly-configured-picking-original.cjs` constructs two
original 4×4×4 mm cubes, sharing one part definition. A is fixed at (−8,0,0);
B begins floating at (8,0,6). Two explicit B-to-root principal-plane distances,
YZ=8 and XZ=0 mm with aligned normals, constrain X/Y and orientation while
leaving Z free. No external model, topology keys or prepared material relations
are imported. The selected named state `demo` initially inherits Base.

The renderer selects B's +Z top face, then A's, and authors signed distance
+2 mm. B moves to Z=2; the opposite reference order has the opposite sign.
Matching top-front X-directed native LINE edges then receive a parallel relation.
Every cube independently has volume 64 mm³, area 96 mm² and one solid. Totals
remain 128 mm³/192 mm²/two solids. A bounds are [−10,−2,0]..[−6,2,4]; final B
bounds are [6,−2,2]..[10,2,6]. Bounds/placement use 1e-6 mm and volume/area 1e-5.
The native case also checks preserved Base/dormant states, current identities,
unsatisfied measurement, one-use previews, history and serialized reopening.

Actual CDP events select components and material roles. Calibration uses the
literal envelope and the public Superior camera convention, after the role
instruction has changed the viewport height. Form controls and native-dialog
paths are scripted in the hidden test-owned window; no solver response, camera
state or document is injected. A final screenshot displays the saved relation's
editor for visual highlight review. It is not geometric measurement or proof of
general nested, hidden, suppressed or cross-platform picking behavior.

## Original configured component authoring

`scripts/desktop-assembly-configured-components-original.cjs` independently
constructs a 2×3×4 mm anchor and a 1×2×5 mm pin. Each starts at the coordinate
origin: analytical volumes are 24/10 mm³ and areas 52/34 mm². The parent places
the shared subassembly at X=0 and X=20. Named states A/B initially inherit its
single anchor. An original imported v3 assembly has a named pin translation of
X=3, inserted at X=5; its placed pin starts at X=8 or X=28. Reusing the anchor
at Y=8 gives six final solids, volume116 mm³ and area276 mm². No external model
bytes, personal files or captured geometry contribute to this fixture.

The native occurrence-edit tests reuse the tracked original configuration
fixture. Their independent literal bounds distinguish the rotated right use,
X=4 versus required X=10 movement, fixed-position rejection, full imported
catalogs and source-preserving publication. Coordinate tolerance is 1e-6 mm;
volume/area tolerance is 1e-5. See [validation](VALIDATION.md) for actual runs
and the [component contract](ASSEMBLY_CONFIGURED_COMPONENT_AUTHORING.md) for
the boundary between declarations, native verification and scripted controls.

## Original origin-axis relation examples

`scripts/desktop-assembly-origin-axes-original.cjs` independently constructs two
rectangular prisms from a 2 × 3 mm XY profile extruded 4 mm. Each has volume
24 mm³ and area 52 mm². The fixed occurrence is translated −15 mm along X; the
moving occurrence begins at [20, 10, 6] mm with a 20-degree Z rotation. The
configured envelope adds empty named `demo` and `untouched` states. There are no
external model bytes or vendor geometry. The corresponding renderer creates
the relations through the application's controls.

Displayed-origin selection reuses that same renderer recipe without changing
its solids, placements or native tolerances. `assemblyOriginPicking.test.ts`
reuses `assemblyConfigurationCoreFixture` for scoped ownership, with literal
translations/quaternions and orthographic/perspective camera coordinates for
display projection, clipping and ambiguity checks. These mathematical display
oracles are independently authored and do not supply native geometry results.

`src/cad/kernel.assembly-principal-axis.test.ts` independently constructs a
radius-2 mm circle extruded 8 mm: volume 32π mm³, area 40π mm². Literal nested
coordinate frames, unit axes and deliberately authored slide/spin cases supply
the reference oracles. Geometric BRep bounds exclude triangulation, use 1e-6 mm
coordinate tolerance, and keep unconstrained axial placement separate from
radial constraints. See [validation](VALIDATION.md) for executed evidence.

## Sequential part original

`src/cad/fixtures/part-sequence-original.json` and
`src/examples/part-sequence.ts` are original GPL-3.0-only project geometry:
one 20 × 12 × 4 mm base at the origin, two disjoint 2 × 2 mm cuts centered at
(−6,0) and (6,0), a 4 × 4 × 3 mm boss at Z=4 and a 2 × 2 × 2 mm cap at Z=7.
The fixture contains the base and four unused XY sketches; the completed factory
interleaves every sketch and operation. No external model or topology key is used.

Volumes after each operation: 960, 944, 928, 976, 984 mm³. Final area is
736 + 48 + 48 + 16 = 848 mm²; bounds [−10,−6,0] to [10,6,9] mm.
The edited analytical case changes base/cut depth to 5 and boss/cap support
offsets to 5/8: volume 1216 mm³, area 928 mm², upper Z=10.
The consumed-sketch variant widens only the base rectangle from 20 to 22 mm:
the added strip contributes 2×12×4=96 mm³ and exterior area 2×2×(12+4)=64 mm².
The complete result has volume 1080 mm³, area 912 mm² and X bounds ±11 mm;
all downstream sketches, operation IDs and references remain unchanged. The
renderer also edits an unused profile from width 2 to 3 mm before cancelling
its staged cut and sketch. Its separate accepted retry cuts 3×2×4=24 mm³ from
the 960 mm³ base, leaving 936 mm³, and checks separate sketch/operation Undo/Redo.
No external geometry is used.
Native tests check BRep validity, one solid, volume/area within 1e-5 and
coordinates within 1e-6 mm, including exported STEP reimport. Renderer tests
author separate operations through the real UI, using the prepared sketches.
See [the walkthrough](CORE_WORKFLOWS.md) for interaction and coverage limits.

## Original configured compound authoring

`scripts/desktop-assembly-configured-compound-original.cjs` embeds unchanged part
definitions from the tracked originals: `assembly-profile-center-original.json`
(6×4×3 rectangle or radius-2/height-3 disk), `assembly-line-path-original.json`
(4×6×4 prism), and `assembly-material-arc-original.json` (radius-2 quarter-sector,
height 4). It creates only new original occurrence/state declarations. There is
no external asset, topology key, authored relation, measured capture or private
reference-model data in the generated starting document.

Two proper rigid placements reuse the same `compound-S` definition: left is
identity, right is Rz90 followed by root translation [30,0,0]. Each contains
fixed A and free B. Base B translations are [8,4,5] for profiles, [12,4,2] for
LINE and [9,4,2] for the sector; compact uses [6,2,4], [10,4,2] and [7,3,1]
respectively. A separate dormant state retains [15,5,3]. Root states select
compact in both uses or only the right one. The source geometry remains original
project-authored GPL-3.0-only data.

Independent per-part volume/area are 72/108 for the rectangle, 12π/20π for the
disk, 96/128 for the LINE prism and 4π/(6π+16) for the sector, in mm³/mm². Four
placed solids give totals 288/432, 48π/80π, 384/512 and 16π/(24π+64), respectively.
Mass checks use 1e-5 in the corresponding units; bounds use 1e-6 mm and the
separate component-axis checks use 1e-8. Expected values come from original
dimensions and explicit proper rotations, not numerical residual rows.

The authored native rectangle case aligns normals with signed offset 2 mm and
one material quarter turn; local B bounds are [-2,-3,2]..[2,3,5]. The circular
profile case uses the same offset without prescribing an unobservable spin.
The LINE starts at [-2,-3,4] toward +Y: coordinate 1 gives point [-2,-2,4]; its
selected B material point is [-2,3,0], with Follow Y and material UP Z. For the
sector, the original upper circle center is [3,-2,4], radius 2 and trim length π.
Distance π/2 from [5,-2,4] gives [3+√2,-2+√2,4] and tangent
[-√(1/2),√(1/2),0]. Follow X and UP Z give independently derived rotated material
bounds. The reused right placement applies the stated Rz90/translation to these
same original targets. Current native metadata nominates actual locators; these
coordinates never substitute for native identity or incidence.

The additive native cases use these original parts or the explicit derivative
below. Six unavailable-reference
cases independently change the first profile/path source revision or body ID
for each of the three families; they must withhold a proposal and preserve the
input. The closed-circle rejection adds an original centered 1×1 square sketch
at XY Z0 and a 1 mm cut into the R2/height-3 cylinder. The lower pocket supplies
real material corners at [±0.5,±0.5,0], while the upper circle remains closed at
Z3. Independent per-part volume/area become 12π−1 mm³ and 20π+4 mm². The point
and origin use actual same-body pocket vertices. The preview must report the
exact closed-circle diagnostic before testing endpoint incidence; a missing or
nonincident reference error cannot satisfy that assertion. No displayable seam
vertex is fabricated. A closed edge must not become an open material arc merely
because coordinate zero is requested. WORLD Float32 display lines
nominate the upper edge at the original identity placement; they are not local
curve coordinates or radius metrology. Analytic dimensions and current native
point observations remain separate.

Two projected-UP cases add an actual fixed third occurrence of the original
part to each reused scope. Its translation is [20,30,40], with proper
`Rx(h)`, where `h = -π/2 + ε`. The original roof normal [0,0,1] becomes
`n=[0,-sin(h),cos(h)]`; the relevant material tangent is +Y. The projected
normal length is therefore `abs(cos(h))`. At ε=1e-10 it is finite and nonzero,
but the native directional error cannot retain the requested angular band.
A separate ε=0.2 control has projection above 0.19 and is written to require
the actual roll residual plus its error to fit 1e-8 rad. The guide's displaced
plane origin adds no positional equation. These are current-native tests with
real guide owners, not zero-vector or manually certified uncertainty fixtures.

Three nested cases wrap S in a new original G definition. G's `inner` occurrence
uses `Rx90` then translation [5,-7,2]; the outer right occurrence still uses
`Rz90` then [30,0,0]. For a source-local box `[lo,hi]`, the independent inner
bounds are `[lo.x+5,-hi.z-7,lo.y+2]` through
`[hi.x+5,-lo.z-7,hi.y+2]`. Right's bounds then apply the explicit outer quarter
turn: `[30-innerMax.y,innerMin.x,innerMin.z]` through
`[30-innerMin.y,innerMax.x,innerMax.z]`. Proper rotations preserve the existing
four-body volume/area totals. The cases require exact `left/inner/a,b` and
`right/inner/a,b` paths, shared placed-relation keys and ancestry
`both-compact → wrapped → compact`, while Base source and dormant state remain
unchanged through private Apply and saved reopen. No world-inverse cancellation
or flexible child freedom supplies these expectations.

The four fixed renderer workflows are written to operate real controlled forms,
the production worker and test-owned file dialogs. The native-session cases
exercise private declaration previews and fresh physical checks; pure UI cases
use explicitly un-attested symbolic references only for syntax and ticket tests.
None injects a native result, solver response, application document or Apply token.
The configured job lists all four commands alongside the five mechanical cases;
that configuration is not an execution result. Consult [validation](VALIDATION.md)
for actual runs. See the [configured compound contract](ASSEMBLY_CONFIGURED_COMPOUND_AUTHORING.md)
for the scope and remaining limits.

Their optional final capture is placed after saved reopen, fresh solve/Cancel
and reopening the actual compound editor without changing fields. The flow is
written to check restored current selections and parameters, unchanged native
request serial/history availability and unchanged saved bytes, then close the
draft. This is a committed-state form capture, not a new preview or proof of
unscripted selection. Whether these additive cases and captures executed belongs
in validation; their presence in source records no new passing result.

## Controlled native-save completion ordering

The fixed `assembly-source-update-save-pending` scenario reuses the complete
[original subassembly prisms](#embedded-subassembly-source-update-prisms),
dialog queues, native worker and physical assertions of the ordinary source
update. It changes no part, relation, declaration, solver output or file bytes.
One statically selected `document:save` return is withheld after the real main
handler has validated permissions and written its actual selected file. The
harness checks the returned path stays inside its owned profile and matches the
fixed Save queue; read-back SHA-256 must match the actual request. No additional
file permission is granted.

Before the next evaluation, the test records only bounded actual DOM readiness:
busy flag, header/file label and enabled/disabled controls. Replaying the exact
old tracked flow under this ordering naturally fails while the real baseline
file already exists. The corrected flow releases the unchanged result and
waits for clean actual controls and exact recovery. Cleanup releases only this
test-owned pending return and preserves the primary failure. This reproduction
establishes the ordering risk, not the cause of an earlier macOS CI failure.

The five configured mechanical cases apply the same one-return barrier to their
first successful Save As (after the separately canceled dialog). Both successful
Save As and normal Save require clean header/path and Open/Save availability,
disabled Apply and complete v3 recovery before another operation. Snapshot
nominees and the IPC-return marker supply no native or React authority.

All scenarios remain hidden and isolated. Existing 180/170/35-second parent,
child and step deadlines, sandbox, production inputs, geometry tolerances,
file grants and original assertions are unchanged. Native, renderer, actual
file bytes and diagnostic cleanup remain separate evidence. Read
[actual validation](VALIDATION.md) before inferring execution or platform support.

## Original configured mechanical capture

`scripts/desktop-assembly-configured-mechanical-original.cjs` creates only public
analytical primitives in millimetres: A is a cylinder of radius 2 and height 4,
B has radius 1 and height 3, and rack is a 2×3×4 rectangular prism. Their respective
volumes are 16π, 3π and 24 mm³; areas are 24π, 8π and 52 mm². Two reused rigid
scopes yield six solids, volume 38π+48 and area 64π+104. The right scope is a proper
90-degree Z rotation translated 30 mm along root X. Base places B at X8, compact
at X6, and dormant at X12. The fixture contains no authored captured relation,
external model, binary, personal path or recovered vendor data.

The five fixed renderer commands author each family through actual configured
component/cylinder/LINE nominees. Lock captures translation[6,0,0]; locked
concentric and screw align B's axis to X0 before capture. Gear uses the explicit
third rack component as carrier. The rack renderer selects the local material
X edge at y=z=0, with zero initial axial travel. The separate native test uses
a Y edge and its own nonzero literal travel oracle. The prism's independent
local rectangle is [0,2]×[0,3], placed at y8, and its root-rotated bounds are
computed from those dimensions rather than the proposed document's pose.

Renderer bounds use 1e-6 mm, native volume/area 1e-5 in their respective units;
neutral quaternion and travel checks retain their separately stated tolerances.
The test observes real worker requests/replies, complete exact-state declarations,
placed verification keys, recovery, history and test-owned Open/Save IPC. Cancel
and retain/recapture are distinct. No worker result, solver response, React state
or privileged arbitrary file grant is injected. Each child keeps the original
180/170/35-second parent/child/step deadlines and isolated profile.

These neutral lifecycle fixtures do not establish arbitrary nonzero frame/phase
behavior, general mechanical motion, topology correspondence or platform support.
Native, pure, UI and file assertions remain separate. Actual executed source and
results belong in [validation](VALIDATION.md); configuring CI records no pass.

## Original compact interval pointer regression

The related `assemblyConfigurationState.test.ts` maximum-size case retains its
original 64 inherited variants ×64 mechanical relations, admitting 4096 state
entries and rejecting the 4097th atomically. New forward/reverse batches give
one relation ID a Base concentric declaration, an inherited concentric state
and an explicit named gear declaration with ratio 5/7. They check complete
independent captures, parameters and input preservation. These original pure
declarations distinguish sharing a Base validator from sharing state identity;
they establish no native mechanical capture.

`desktop-assembly-limit-distance-compact.cjs` reuses the existing original
`assembly-limit-distance-original.json` and complete production interval flow.
Only its test-owned hidden window constructor uses the existing production
minimum size, 1040×700; actual native bounds/content size and canvas rectangles
are recorded separately. The ordinary-size command remains a separate case.
No caller-supplied viewport, source file or script is accepted.

Handle acquisition tries the same six offsets on both real Z-handle halves.
Each nominee must hit the actual canvas under `elementFromPoint`; after a real
CDP move, two animation frames precede reading the published hover axis.
Bounded observations retain coordinates, hit target, axis, dispatch and actual
trusted input data even on failure. They nominate a handle, never a solved pose.

The independent physical destinations, posted-input affine calibration,
signed-plane equations, volume/area/bounds bands and 180/170/35-second
parent/child/step deadlines are unchanged. The same four actual gestures,
38 recorded phases and restricted Save As/reopen lifecycle remain required.
No product transform, application state or worker reply is injected. Runtime
results and the controlled before/after comparison belong in
[validation](VALIDATION.md); a fixed compact test is not general platform support.

## Original configured relation editing

The pure `assemblyConfiguredMateEditing.test.ts` cases reuse the project-authored
A/B/S graph and original un-attested topology labels for syntax and state
isolation. All current binary and compound declarations, named captures, dormant
states, exact replacement IDs, getters, budgets and explicit empty lists are
data-only evidence. No authored capture or topology key is a native attestation.

`kernel.assembly-configuration-relation-edit.test.ts` uses the original A2×3×4
and B1×2×5 prisms, including two uses of S.compact. Its new coincident XY planes
require no geometric displacement. Native totals remain four solids, volume
68 mm³ and area 172 mm² with absolute 1e-5 bands. Existing lock declarations in
suppression/removal cases exercise preservation, not a fresh capture producer.
Actual scene/query faults and reentrant generation changes withhold publication;
detached preview mutation and proposal-as-baseline attempts grant no Apply.

The separate `desktop-assembly-configured-relations-flow.cjs` reuses the original
`desktop-assembly-configurations-original.cjs` recipe. Editing the compact
principal YZ distance from 10 to 6 mm gives right/B bounds [28,6,0]–[30,7,5]
under the literal proper map `(x,y,z) -> (30-y,x,z)`. Left Base/B remains
[10,0,0]–[11,2,5]. Selecting both-compact puts left/B at [6,0,0]–[7,2,5]
while retaining right/B at local X6. Adding an A-to-scope YZ distance zero is
compatible with fixed A; suppression and deletion change no mass or bounds.
A Base distance edit to 8 gives left/B [8,0,0]–[9,2,5], preserves compact6
and materializes dormant Single's old distance10. Undo restores the whole
previous context. No product edit helper calculates these expected coordinates.

Four one-to-one placed solids retain V=68/A=172; body/total volume and area use
1e-5 bands and literal bounds use 1e-6 mm. Ordinary DOM controls send actual
worker intents; private preview/Apply, history, recovery and saved reopening use
the production route. Only isolated test-owned native-dialog paths are substituted.
No worker reply, React callback, committed state or cached mesh is injected.
The hidden parent/child/step budgets remain 180/170/35 seconds. These original
GPL-3.0-only cases contain no private models, vendor source or binaries. Their
presence and configured CI commands do not establish executed results; see
[validation](VALIDATION.md) for actual outcomes and platform limits.

## Original Node CI reporter cases

The configured transport cases in `desktop-security.node.cjs` use original
small declarations to save/reopen a v3 catalog with absent, populated and empty
`mateDeclarations`. Save As, Open and normal Save retain exact submitted bytes.
Non-array values, unknown catalog fields, per-list overflow and aggregate
overflow within/across variants must reject before any dialog. These are actual
restricted file-IPC tests with owned temporary files; main admits a bounded
envelope and does not attest the contained relation or native geometry.

`scripts/desktop-node-ci-reporter.node.cjs` creates a small original temporary
Node fixture: one pass and one skip, followed by a nested assertion comparing
literal 17 and 23. Actual child processes verify success/failure exit codes,
ordinary `spec` output and exactly one leaf-failure annotation. A local run
without the CI flag still fails but emits no annotation. In-memory error records
add deliberately hostile own getters, cyclic/bounded causes, workflow-command
text, synthetic paths and long Unicode names/messages; no private file data or
credentials are used. Cleanup verifies the exact owned temporary directory.
These are reporter and transport tests, not CAD or platform evidence.

The three descriptor/open-failure cases in `desktop-security.node.cjs` use
original owned files and capture their actual canonical path before arming a
fault. Windows requests deliberately retain a distinct uppercase path alias;
an independent `realpath` check confirms it names the same file. Hooks match
the canonical path actually opened by the main process, rather than silently
missing the fault because a dialog path has different spelling. These cases
retain zero-read/one-close, exact flags, no unsafe open retry and subsequent
usable file-gate checks. Case-alias execution does not establish new 8.3-path
or junction coverage; the existing real-link cases have separate provenance.

The POSIX FIFO child captures its canonical target by the same preparation
before arming, while retaining the original path for replacement and restoration.
An auxiliary local Linux run places `TMPDIR` at an owned directory symlink to
a real sibling directory, then runs the four selected descriptor/open/FIFO
cases. The wrapper changes no product source or expected result. Runtime and
filtered-case limits belong in the validation ledger.

## Original configured BOM and CSV cases

`assemblyConfiguredBom.test.ts` and `assemblyConfiguredBomCsv.test.ts` reuse the
tracked original declaration fixture in `assemblyConfigurationCore.test-utils.ts`:
A is a 2×3×4 mm prism and B a 1×2×5 mm prism, used by S twice under a root
with an original quarter-turn placement. Base places B at X10, compact at X4,
and single suppresses B. BOM expectations are independent occurrence counts:
mixed and both-compact contain two A and two B units; single-right contains
two A and one B. Distinct Base/compact assembly rows, repeated equal states,
nested full paths and inherited hidden/suppressed filters are authored directly.

Additional original declarations exercise equal names with different IDs or
revisions, a two-body part still counted as one unit, unavailable relation
references, stored source-link metadata and dormant variants. These are data
inventory cases, not native material or solver evidence. The known prism mass
formulas belong to the separate native fixture checks, not the BOM oracle.

CSV cases use an independently authored quoted-record reader and literal
headers, paths and ancestry. Synthetic text covers formula-like prefixes,
quotes, line breaks, Unicode, invalid text and a bounded nested expansion that
exceeds the encoded output budget. No private document or external model
supplies an expected row or CSV byte sequence. The panel/export tests use
original detached reports and controlled browser/file callbacks; they do not
substitute for an executed production renderer or native file dialog.

These fixtures are project-authored under GPL-3.0-only. See the
[configured BOM contract](ASSEMBLY_CONFIGURED_BOM.md) and the validation ledger
for the distinction between declarations, UI tests and executed acceptance.

## Original worker recovery and read-race cases

The production worker recovery probe in `scripts/desktop-smoke.cjs` authors a
rectangle on XY centered at (1, 1.5), width 2 and height 3, then extrudes it by
4 mm. Its independent expected volume is 24 mm³ and bounds are (0,0,0) to
(2,3,4), with a 1e-6 band in the corresponding units. This is an original
synthetic construction, not imported CAD. It proves one native reconstruction
after malformed transport/payload messages, not arbitrary geometry validity.

`ownDataRecord.test.ts` and `kernel.worker-queue.test.ts` use original artificial
intent records, envelopes and callback faults. Their transport/type evidence
does not certify native geometry. Descriptor-read tests use original strings
and actual files created in isolated temporary directories. Their wrong-file,
nonregular and POSIX FIFO replacement controls contain no private document or
vendor source. The POSIX child case is conditional; its presence is not evidence
that it ran on Windows.

The directed-angle and distance renderer fixes retain their existing original
prism fixtures. Independent input expectations come from actual DOM coordinates
and literal interval arithmetic, never from a solved pose. Source-repair tests
still select current native reference identities explicitly. These additions
are project-authored contributions under the repository's GPL-3.0-only license.

## Original persisted configuration contexts

The v3 parser/history/recovery tests reuse the independently authored A/B prism
declarations from `src/model/assemblyConfigurationCore.test-utils.ts`. A is
x=[0,2], y=[0,3], z=[0,4], with V=24 mm³ and A=52 mm²; B is x=[0,1],
y=[0,2], z=[0,5], with V=10 and A=34. Two rigid uses of their S assembly
therefore total V=68 and A=172. Pure mechanical capture declarations use
explicitly un-attested topology labels and establish syntax/preservation only.

`src/cad/kernel.assembly-configuration-scene.test.ts` builds actual placed
native geometry from effective selected inventory, with literal proper-rotation
bounds and active/hidden/suppressed variants. The separate worker-session file
adds an original named child lock from B.X4 to3 and a parent lock from X30 to20,
retaining the parent's +90° Z placement. Its literal final bounds are left/A
[0,0,0]–[2,3,4], left/B [3,0,0]–[4,2,5], right/A [17,0,0]–[20,2,4],
right/B [18,3,0]–[20,4,5]. Bounds use 1e-6 mm; volume/area use 1e-5.
No face ordinal, fabricated worker reply or copied private native proof supplies
these expected values. Fault cases call actual native work before withholding
publication, and separately check draining release/currentness/token policy.

The production-renderer recipe in
`scripts/desktop-assembly-configurations-original.cjs` is another original
declaration of those same prism dimensions, +90° Z/right-X30 placement and
Base/compact/single variants. Its authored signed principal-plane distance
requires the child's B.X=10. The UI edits a named B.X4 to6, then the actual
configured worker solves it to10. Right/B bounds are [28,6,0]–[30,7,5]
after authoring and [28,10,0]–[30,11,5] after solve; right/A remains
[27,0,0]–[30,2,4]. The flow checks original source and dormant declarations,
all four independent placed solids, whole-context history/recovery and actual
file IPC. The final saved root selection is both-compact. Native mass/geometry
cases, scripted rendered observations and file-grant tests are distinct evidence.

These recipes contain no imported vendor model, private source, machine path,
native handle or authoritative cached mesh. They are project-authored under
GPL-3.0-only. See [the persistence contract](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md)
and [executed validation](VALIDATION.md) for current outcomes and remaining scope.

## Original selected-state solve transactions

`assemblyConfigurationWriteback.test.ts` reuses the independently authored A/B/S
configuration graph. Its declaration-only mechanical cases contain explicitly
UNATTESTED native locator keys: they check exact capture/winding writeback,
inheritance isolation, fixed/output IDs and existing caps, not native geometry
or historical capture. Gear, screw and rack declarations retain complete neutral
fields and parameters while changing only the requested lifted values. The
empty-assembly policy cases exercise private transaction admission without
constructing any native shape.

`kernel.assembly-configuration-solve.test.ts` reuses the same original boxes:
A `[0,2]×[0,3]×[0,4]`, volume 24 and area 52; B `[0,1]×[0,2]×[0,5]`, volume 10
and area 34. The compact child starts B at X=4. Its authored signed distance
`2-(bx+1)=-2` and compatible proper lock place B at X=3 with identity rotation.
Two actual instances select that one child state. A parent lock seats right/B
at left/A, requiring the parent to use the newly staged child: right's final
translation is X=-3 and rotation identity, despite its initial Rz90 placement.

The literal final bounds are left/A `(0,0,0)..(2,3,4)`, left/B
`(3,0,0)..(4,2,5)`, right/A `(-3,0,0)..(-1,3,4)` and right/B
`(0,0,0)..(1,2,5)` mm. Four independently rebuilt/placed BReps must each be one
valid solid; summed volume/area are 68 mm³ / 172 mm². Bounds use 1e-6 mm and
volume/area use 1e-5 in their respective units. These overlapping analytical
supports do not establish body interference or finite contact.

Mechanical cases reuse the unchanged original R2, height-3 extrusion from
`assembly-profile-center-original.json`, whose selected native cylinder axis
is `(0,0,-1)`. Explicit authored identity neutral frames and current lifted
angles `7pi/2,-4pi` start an active equal opposed gear; the follower ends at
`-7pi/2`. A suppressed gear follows the same accepted winding while preserving
its distinct phase 123. Another named state's anchors `15pi/2,-8pi` remain
unchanged. Separate far translations of ±1e12 mm use a genuine explicit carrier
and current `4pi,-4pi` anchors to check that angular equations ignore unrelated
position precision. This is not an arbitrary moving-carrier or trajectory test.

The native solve experiments explicitly request variable working tolerances
5e-7 mm and 1e-9 radians. Public acceptance remains 1e-6 mm / 1e-8 radians;
the transaction does not select a hidden refinement fraction. Later fixed-parent
failure, a distant second placed instance, raw-baseline reentry, release failure,
stale winding, single-use/copy rejection, exact context mismatch and generation
overflow must publish no partial candidate. No new public fixture, imported
model, external binary or third-party dependency is introduced. Actual executed
counts and limits belong in [VALIDATION.md](VALIDATION.md).

## Original configured physical verification

The physical verification cases appended to
`kernel.assembly-configuration-numeric.test.ts` reuse its five unchanged
tracked original recipes and their existing current native selections. They
author occurrence placements and mate intent only; no imported or private
model, native binary or new feature recipe is added.

The nineteen-family binary matrix checks both the identity placed scope and
the reused scope under Rz90 plus `(10,20,30)` mm. Literal checks include signed
plane coordinates, principal/directed angular margins, proper relative locks,
neutral mechanical coordinates and analytic tangencies. Two R2 cylinders have
external distance 4 mm with parallel or orthogonal axes; two R3 spheres have
external center distance 6 mm; an R2 cylinder and R3 sphere have external
axis/center distance 5 mm. A plane at X=2 and an axis at X=0 select the negative
side with radius 2 mm; a sphere centered at Z=7 is 3 mm from the Z=4 plane.
The nominated cylinder's native axis is `(0,0,-1)`, while the nominated Z=4
plane normal is `(0,0,1)`. The mixed plane/axis perpendicular declaration
therefore has principal angle pi: aligned intent fails and opposed intent
passes. This literal sign check does not assume that every extrusion's native
parameter axis follows its feature direction.

Four Width branch combinations use the authored X=2/X=10 sum bisector X=6 and
X=2/X=-2 difference bisector X=0, with combined normal length 2. Singular
opposed sum normals must be refused. Five symmetry families use the X=2
mirror, independently placed exact reflections and literal failed-reflection
offsets/directions. Residuals just below and above the requested band test
overlap refusal. Stored multi-turn angles are authored continuity anchors,
not recovered historical motion.

Fresh verification tests exercise every actual placed use, rejected active
references, retained unavailable passive diagnostics and complete failure on
reentry/query/release errors. Separate nonnative policy tests check executable
option rejection and that structural providers cannot impersonate native
sessions. Expected geometry comes from these literal constructions and physical
formulas, not the measurement or numerical residual implementation. Actual
executed coverage belongs in [VALIDATION.md](VALIDATION.md); this provenance
does not establish saved/editor integration or a complete assembly demo.

## Original configured numerical scope and state planning

`assemblyConfigurationSolveGraph.test.ts` reuses the original A/B configuration
boxes. Its additional G assembly is an authored declaration wrapper with a
literal Rx90 child pose beneath the original root Rz90 placement. Independent
points `(3,-3,5)` and `(33,3,5)` check the two instance frames. These are pure
planning cases, with no claimed native shape, capture or solver authority.

The scoped cases appended to `kernel.assembly-configuration-numeric.test.ts`
reuse its same five unchanged tracked geometry recipes and 31 declarations.
Every family is projected in both exact declaring instances. Immediate child
IDs and identity descendant frames are literal expectations; material supports,
parameters, captures, optional roles and retained uncertainty are compared with
the existing root adapters. Separate nested Rx/Rz coordinates, null declaring
frames, local hinge role incidence and large/cancelled placement controls check
the new ownership boundary. Authentic session, scope, reference and relation
checks remain separate from numerical DTOs.

Six additional standalone numerical experiments fix all local children except
one and solve four/six-role hinges, both profile centers, LINE and a fixed
circular path. Only a test-owned named occurrence pose is staged; source/base,
other variants and root placements must remain unchanged. Fresh native
reconstruction then independently measures the selected material geometry.
Literal hinge/circular-profile translations are 4/2 mm along local Z. Literal
world path target points are `(13,19,34)` mm for LINE and `(12,25,34)` mm for the
R2 quarter circle, whose length is pi mm. Free component spin does not imply a
unique component translation. Checks retain the existing 1e-6 mm and 1e-8 radian
bands. The experiments explicitly request half the public length band as the
variable convergence target; fixed/native acceptance remains unchanged. This
working fraction is a bounded experiment choice, not a general native-margin
policy. These are experiments, not production configured solve/writeback or
complete assembly acceptance. See the [contract](ASSEMBLY_CONFIGURATIONS_SCOPE.md)
and the separate executed validation record.

The new length-refinement cases in `assemblySolverRefinement.test.ts` author
original analytical plane gaps without native geometry. One variable group
also retains independently declared active/passive multi-turn gears with
nonidentity neutral frames. Their exact lifted values and captures must remain
unchanged while actual length refinement occurs. These pure checks do not
establish native recapture or opt-in continuity for every mechanical family.

Three additional core cases compare the shared declaration normalizer with the
full evaluator, including authored lock captures, dormant/executable rejection
and finite declarations whose composed world pose overflows. The additional
native control checks that full construction still rejects that overflow before
engine allocation, and a changed live context is revoked before a native query
even after its original JSON is restored. Declaration validation alone is not
expanded or native admission.

## Original configuration capture and winding declarations

`assemblyConfigurationState.test.ts` authors mechanical state declarations over
the original A/B configuration boxes and the tracked R2x3 circular prism. Its
`UNATTESTED` topology keys are syntax-only labels, not native membership,
metrology, capture provenance or Apply evidence. The lifted scalars and neutral
frames are independently authored values. No feature recipe is changed.

These controls distinguish exact base/null and named state keys, all five
capture families, dormant and suppressed entries, named-core inheritance and
explicit sidecar precedence, independent ownership and exact named-state
materialization. Count and byte-envelope controls use original zero bytes in
opaque source records. Those bytes exercise storage/encoding and combined
20 MiB admission only: they are not STEP geometry and no native import is
claimed for them.

The additional native cases in `kernel.assembly-configuration-numeric.test.ts`
reuse the same five original project recipes described in the
[configured numerical provenance](#original-configured-numerical-bridges).
They declare separate concentric/lock/gear/screw/rack-pinion captures on an
existing named state, materialize them into the real core catalog, query actual
configured aggregates and inspect the resulting detached numerical values.
Further controls change a selected capture while geometry and selector remain
equal, and reject malformed dormant capture data before native allocation.
These cases do not establish solvability, historical recapture correctness,
variant solve/writeback or an editor workflow. The
[state contract](ASSEMBLY_CONFIGURATIONS_STATE.md) describes these boundaries;
executed results are recorded separately in validation.

## Original configured numerical bridges

`kernel.assembly-configuration-numeric.test.ts` reuses the five original project
feature recipes described in the [configured relation inventory](#original-configured-relation-inventories):
4x6x4 box, R2x3 circular prism, R3 sphere, R2 quarter-sector extruded 4 mm
about (3,-2), and H4 drilled leaf. No solid features are changed. Native metadata
nominates exact current topology; names and observational helpers issue no proof.

Six authored root-owner numerical experiments cover unlimited/limited hinges,
circular/rectangular profile centers, LINE and circular path. The source graph
stays unchanged; an explicit catalog pose produces a separate candidate with a
new generation, snapshot and freshly resolved material roles. These are original
programmatic experiments, not production configured solving, capture/writeback,
saved selectors or an editor/Apply workflow.

Literal controls include the right box-b rule
(x,y,z) → (10+z,22+x,30+y), root hinge seating at translation (0,0,4),
a seated limited phase of zero inside the declared 330°/60° interval with both
margins π/6, and the R2 quarter arc of length π at fixed material distance zero.
Unsolved profile controls expect center residuals 2 or 6 mm and normal angles
0 or π/2. The LINE control expects coordinate 2 mm, target 1 mm, transverse
residual √50 mm and full position residual √51 mm. Bounded literal comparisons
use an absolute `1e-10` oracle band; solver and measurement declarations use
`1e-6` mm and `1e-8` radian acceptance bands. These policies do not establish
general calibrated native accuracy.

A local-frame control places a root owner at `1e16` mm and its child at `0.25`
mm. Although the composed world translation rounds away that child offset, the
numerical descendant frame must retain the literal `0.25` mm. A cancellation
control uses original translations `+1e14` and `-1e14` mm, retaining `2e14` mm
of placement magnitude in the precision policy. A separate nominal-gap control
adds `0.8e-6` mm to the seated hinge: nominal proximity must not consume error
needed to retain the original acceptance band. No requested band is widened.

Fixed circular measurement adds an actual finite native D1 query; the reentry
control calls the real query before changing context. Numerical residual rows
do not calculate the independent physical expectations. The
[numerical contract](ASSEMBLY_CONFIGURATIONS_NUMERIC.md) records purpose and
authority limits. Executed results belong to the validation record; this section
makes no test-run or platform-support claim.

Free circular controls independently place the same original material point
at theta `pi/4` on the R2 arc and at theta `-pi/2` outside its quarter trim.
The interior uses a declared Rz135 component orientation for actual tangent
Follow and material UP, with coordinate and both margins `pi/2` mm. The outside
point has coordinate `-pi` mm and nearest-endpoint distance `sqrt(8)` mm;
explicit support-circle and finite-trim domains must remain distinct. The
circle-center control has no observable phase and must retain explicit nulls,
rather than publish an invented coordinate or nonfinite report values.

## Original configured relation inventories

`assemblyConfigurationReferences.test.ts` authors original declaration-only
relations over the tracked A/B [configuration core fixture](#original-rigid-configuration-evaluation-fixtures).
Its 46 cases cover every currently saved family, ordered/null/repeated roles,
effective placements and suppression, source/producer/body diagnostics,
compound profile/path declarations and executable dormant input rejection.
Opaque topology keys are deliberately unattested. These cases do not load CAD
or turn a declaration candidate into geometric evidence.

`kernel.assembly-configuration-relations.test.ts` reuses unchanged GPL-3.0-only
feature recipes from the original LINE, profile-center, material-arc,
plane/sphere-tangent and hinge fixtures. They are the 4x6x4 box, R2x3 circular
prism, R3 sphere, R2 quarter-sector extruded 4 mm about (3,-2), and H4 drilled
leaf. H4 is [-2,10]x[-2,2]x[0,4] with an R1 through hole at x=y=0; its earlier
independent provenance records V=192−4π/A=224+6π. This increment does not add
a new solid-property matrix or alter any feature recipe.

A separate native source scene has ten original uses and five prototypes.
Its real topology metadata nominates roles only. The configured session
rebuilds its own five native prototypes and freshly queries every accepted
role; neither the probe nor an observational helper issues an aggregate.
The new original S declaration contains two uses of each part recipe and is
itself reused at left identity and right Rz90+(10,20,30). The right `tilt`
variant places only box-b at Rx90+(2,0,0). Thus box-b follows the literal rule
(x,y,z) → (10+z,22+x,30+y); the other right leaves follow
(x,y,z) → (10−y,20+x,30+z). Point/normal comparisons use absolute 1e-10 for
these bounded originals, with no general native precision claim.

Thirty-one positive relation declarations cover nineteen binary families,
centered width, five symmetry forms, both profile-center modes, LINE/circular
paths with UP and unlimited/limited hinges. Each is resolved in both scopes.
The nineteen-family case checks 38 exact aggregates and their distinct native
purposes. Literal controls include right box-b point (14,20,27), rectangle
center (14,22,30), unchanged right disk center (10,20,33), sphere center
(10,20,30), LINE endpoints (13,18,34)/(13,22,34), and arc center (12,23,34),
radius 2 and length π. Full paths, declaring-scope carriers and root owners
are checked separately from these coordinates.

The 39 native cases also cover variant-specific passive equations, hidden and
suppressed scopes, declaratively unavailable roles, strict boolean filtering,
global active preflight, clones/foreign/legacy/helper data, every complete-input
field, empty/unavailable-only postchecks, reentry and all-or-nothing failure.
Root-declared hinge controls query four/six real roles before rejecting an
axial/angular plane from a different root owner. A radial axial-plane control
is intentionally resolved as inventory data, without claiming qualified
rotation or satisfaction: that qualification belongs to the later physical
measurement/numerical bridge. Mechanical neutral values are explicit synthetic
declarations, not newly authenticated capture results.

Fault wrappers first perform actual native operations, then raise errors or
change context. They never substitute geometric outputs. Cleanup checks
install after construction and require exactly one release of each of five
owned prototypes, preserving primary and cleanup failures. Actual source-specific
results and limits belong in [validation](VALIDATION.md).

## Original configured native-purpose fixtures

`kernel.assembly-configuration-purposes.test.ts` reuses unchanged original
GPL-3.0-only feature declarations from four tracked fixtures:
`assembly-line-path-original.json` (4x6x4 prism, V=96/A=128),
`assembly-profile-center-original.json` (R2x3 circular prism, V=12π/A=20π),
`assembly-material-arc-original.json` (R2x4 quarter sector about (3,-2),
V=4π/A=6π+16), and `assembly-plane-sphere-tangent-original.json` (R3 sphere,
V=36π/A=36π). Units are mm, mm³ and mm². Native solid counts, properties and
bounds are checked independently with 1e-5 property and 1e-6 coordinate bands.
No new imported model, vendor bytes or private artifact supplies geometry.

The new original declaration reuses one source assembly on the left at base
and on the right under Rz90+(10,20,30). Its selected `tilt` state places the
leaf at Rx90+(2,0,0). The literal right coordinate rule is
(x,y,z) → (10+z,22+x,30+y); directions follow (z,x,y). Native source-scene
metadata only nominates topology IDs. Every accepted configured observation
queries the configured session's own real native prototype. The independent
rectangle-axis sign comes from D1 on a separately copied native edge, without
using the profile-axis adapter. The source probe is not configured authority.

Expected rectangle cap center is (14,22,30), with four corners at
(14,22±2,30±3). The disk cap center is (13,22,30), radius 2. Sphere center is
(10,22,30), radius 3. The material LINE runs from (14,20,27) to (14,24,27),
length 4, with midpoint (14,22,27). The sector's transformed arc center is
(14,25,28), radius 2, length π; its half-length point is
(14,25+√2,28+√2) and tangent (0,-1/√2,1/√2). Material reversal and generic
parameter evaluation remain separate queries. These native point/direction
comparisons use absolute 1e-10. The effective chain is √1400+2 mm/depth two;
its scalar comparison uses 1e-12 to accommodate independent norm rounding.

The 38 new cases cover all twelve added configured witness kinds, the seven
advanced methods, plane/LINE/cylinder directions, both bounded profiles,
LINE/circle generic curves, full owner paths, relative scopes and null frames.
Clones, other sessions, legacy grants, disposed contexts and stale generation
reject for every added kind; source/catalog/selector mismatches have separate
advanced cases. Hidden/suppressed paths, executable preflight data, joint
incidence, reentrant input change and post-query/cleanup faults have bounded
checks. Faults wrap real operations; they never replace a geometric result.

Cancelling +1e16/-1e16 placements retain the effective 2e16 mm chain. All five
path query/evaluation purposes refuse their unchanged default precision bands.
Profile-axis world position uncertainty remains greater than 100 mm while
local extraction remains below 1e-6 mm; this reports uncertainty rather than
claiming pair-measurement admission. An explicit 1e-16 rad band rejects native
profile-axis extraction. These estimates are not certified intervals or general
precision guarantees. Actual results and limits belong in
[validation](VALIDATION.md).

## Original configured native-reference fixtures

`kernel.assembly-configuration-snapshot.test.ts` reuses the original A/B
[configuration evaluation fixture](#original-rigid-configuration-evaluation-fixtures).
It queries actual native vertex/face catalogs. All eight B corners are matched
one-to-one to x in {0,1}, y in {0,2}, z in {0,5}. Base-left world points are
(10+x,y,z); compact-right points are (30-y,4+x,z). Six distinct face identities
and all local axis-aligned normal directions are checked. Right plane points
follow that same explicit coordinate rule and normals follow (-ny,nx,nz).
Coordinate and direction comparisons use absolute 1e-9 for these original
prisms, without a general native precision claim.

A right-scope null YZ frame has origin (30,0,0), normal +Y and actual rigid
owner `right`. A scope-relative B vertex retains full path right/b. Its
effective placement magnitude sum is 30+4=34 mm and depth two. A separate
cancellation case sets root X=1e16 and selected local X=-1e16: the origin is
zero but the retained sum is 2e16 mm. This is arithmetic-lifetime evidence,
not admission of a tolerance or recovery of lost world precision.

Original state changes test hidden material, right-only suppression,
base-suppressed material activated by compact and same-state reuse. Faults are
injected around real native operations only to test withholding, revocation
and cleanup; their outputs do not replace native geometry. Rebuild resets and
context-owned cleanup are counted in separate phases. The tests preserve the
primary error, attempt each context cleanup once and reject reentrant context
changes before publishing a session or witness.

The body-budget fixture authors two explicit disjoint prisms in one part:
the original 2x3x4 solid and [10,11]x[0,2]x[0,5]. A valid root declaration uses
it 4,096 times. The real native rebuild must report two bodies and no feature
errors; its 8,192 expanded body entries then exceed the existing native limit.
This is bounded rejection evidence, not a successful large-assembly benchmark.
All source data are original GPL-3.0-only declarations, without private or
external model input. Actual source-specific runs belong in
[validation](VALIDATION.md).

## Original rigid configuration evaluation fixtures

`assemblyConfigurationCore.test-utils.ts` authors original GPL-3.0-only source
declarations on 2026-10-23. No private model, neutral import or external
application output supplies geometry. Part A is [0,2]x[0,3]x[0,4] mm,
V=24 mm³/A=52 mm². Part B is [0,1]x[0,2]x[0,5], V=10/A=34. A source S owns
A at identity and B translated +10 mm in X. Its named compact state moves B to
X=4; its single state suppresses B. These are separate catalog declarations,
not fields accepted by the current saved-document parser.

The root uses S at identity on the left and at Rz90 plus (30,0,0) on the right.
Selecting base on the left and compact on the right gives four solids,
V=68/A=172, with independent literal boxes:

| Path | Minimum mm | Maximum mm |
| --- | --- | --- |
| left/a | (0,0,0) | (2,3,4) |
| left/b | (10,0,0) | (11,2,5) |
| right/a | (27,0,0) | (30,2,4) |
| right/b, compact | (28,4,0) | (30,5,5) |

Selecting single on the right removes only its B from active geometry:
three solids, V=58/A=138. The suppressed declaration remains inspectable.
Selecting compact on both sides instead moves left/b to (4,0,0)..(5,2,5),
with unchanged four-body totals. Re-evaluating base restores right/b to
(28,10,0)..(30,11,5), without rewriting either source or catalog.

`kernel.assembly-configuration-core.test.ts` builds actual source BReps,
places each active part using evaluated world poses and checks BRep validity,
one-to-one full paths, solid count, native volume/area and the independent
bounds. Absolute bands are 1e-5 mm³/mm² for per-body and aggregate properties
and 1e-6 mm for bounds. A separate common gauge is Rx90 plus (7,-11,13),
whose expected coordinate rule is (x+7,-z-11,y+13). Expected boxes follow that
explicit rule, without using the production pose-composition helper.

Pure configuration tests establish declaration identity, ownership, bounded
evaluation and component-reference availability. They do not establish native
topology or mate satisfaction. A storage-only probe generates original zero
bytes and wraps them as canonical source data to exercise combined byte
admission; those bytes are not valid STEP geometry and are never loaded by the
native kernel. Native placement cases do not construct a
substitute current document, solve a configured mate or issue private Apply.
Saved/editor configuration support, flexible solving, external parity and
platform claims need separate integration and evidence. Actual executed checks
belong in [validation](VALIDATION.md).

## Original structural STEP insertion workflows

`kernel.assembly-step-insertion.test.ts` and the separate production-renderer
recipe `desktop-assembly-step-insertion-flow.cjs` add original GPL-3.0-only
cases authored on 2026-10-23. They reuse the original eight-body product graph
described under [structural STEP editor provenance](#original-structural-step-editor-workflow).
The neutral input is generated from that authored graph by the actual native
structural exporter; no private model or external application output is input.

The native dispatcher case adds a parent-owned 2x3x4 mm prism at
[-20,0,0]..[-18,3,4], V=24 mm³/A=52 mm². One insertion gives nine separate
solids, V=160/A=396. Its shared-scope case instantiates the same edited
subassembly twice, at identity and +200 mm in Y: eighteen solids,
V=320/A=792, with all nine independent literal bounds checked in each
instance. Component/body identities must remain distinct between instances.
Native dispatcher total volume/area comparisons use absolute 1e-5 mm³/mm²;
their literal bounds use 1e-6 mm.

The renderer parent instead owns a 10x6x4 mm prism at
[200,0,0]..[210,6,4], V=240 mm³/A=248 mm². Direct insertion gives nine
solids, V=376/A=592. Inserting a second occurrence of the accepted source
tuple gives seventeen solids, V=512/A=936, retaining two copies at each of
the eight original literal source bounds. These sums describe separate
bodies, including coincident occurrences, rather than a Boolean union.
Renderer per-body and aggregate native volume/area, independent planar mesh
area and fresh exported BRep checks use absolute 1e-6 bands in their
respective mm units, including bounds. Local quaternion
equivalence uses 1e-10, including opposite-sign quaternion representations.

The recipe specifies real worker and restricted file-IPC operations with
test-owned dialog selections, exact graph/history/source checks, saved reopening
after the neutral input is removed and fresh native reading of actual exported
bytes. Its root-scope case is separate from the native shared-scope case.
Model-only transaction tests establish cancellation/freshness rules, not native
geometry. Configuring a workflow records no execution result; source-specific
runs and their limits belong in [validation](VALIDATION.md).

## Assembly source revision fixtures

`assemblyRevisions.test.ts`, `kernel.assembly-revisions.test.ts` and
`assemblyRootRevisionUi.test.tsx` add original GPL-3.0-only declaration,
native and UI cases authored on 2026-10-23. They reuse the tracked original
material-arc declarations only for syntax tests; opaque topology/digest values
do not prove native geometry. Native revision cases independently author
[0,2]x[0,3]x[0,4] mm prisms, V=24 mm³/A=52 mm² each. Two fixed copies
translated -10/+20 mm total V=48/A=104 with bounds [-10,0,0]..[22,3,4],
at absolute 1e-6 bands. These sums do not claim a union volume.

One initially unsatisfied coincident datum leaves tangential position and roll
free. Its rejection/retry case asserts invariant V/A and the current bottom
plane at z=0 within 1e-6 mm; it does not assign an unsupported tangential
coordinate. Revision authoring itself preserves the solved poses exactly.
Added native gear, screw and rack-and-pinion cases reuse their existing
original public fixtures and independently specified V/A formulas, at 1e-5
mm³/mm². Captures come from current native queries, not synthetic DTOs.

`desktop-assembly-source-revision-flow.cjs` uses only the original r0 source
and parent from `desktop-assembly-linked-source-original.cjs`. Actual editor
controls release the child and move it +1 mm in X, then author and save the
root revision. No updated source fixture or hand-written r1 replaces that
workflow. Source bounds become [1,0,0]..[3,3,4]; two reused parent roots at
-10/+20 produce [-9,0,0]..[-7,3,4] and [21,0,0]..[23,3,4], with unchanged
V24/A52 per solid. Renderer V/A bands are 1e-5 and coordinate bands 1e-6.
File bytes/digests are measured after real authorized Save. Native dialogs
are test-owned substitutions; no external application supplies geometry.

## Linked source file fixtures

`assemblySourceLinks.test.ts`, `kernel.assembly-linked-sources.test.ts` and the
linked-source UI workflow add original GPL-3.0-only examples authored on
2026-10-22. No private model, external application output or vendor binary is
input. Model-only keys and repeated-character digests are opaque syntax data;
they do not prove native geometry or file-byte identity. Desktop-security and
production file-IPC checks separately hash actual test-owned UTF-8 bytes.

The native fixtures use two placed copies of [0,w]x[0,3]x[0,4] mm. For w=2,
each prism has V=24 mm³/A=52 mm²; for w=3, V=36 mm³/A=66 mm². Totals are
48/104 and 72/132 respectively, without a union-volume claim. Translations
[-10,0,0] and [20,0,0] give combined bounds [-10,0,0]..[22,3,4] and
[-10,0,0]..[23,3,4]. Volume, area and bounds use absolute bands of 1e-6 in
their respective mm units. A reused rigid subassembly keeps the same literal
geometry and placements. A current top material plane is repaired explicitly
into an original parallel relation; a fresh native solve verifies satisfaction.

`scripts/desktop-assembly-linked-source-original.cjs` independently authors
the same literal prisms as temporary test-owned files. The production renderer
checks each reused body, total V/A at 1e-5 mm³/mm² and each bound at 1e-6 mm.
Its v2 fixture adds one identity-placed child `m` inside the reused source.
The workflow explicitly edits only its original source files between reads,
computes their actual byte digests and asserts parent/source byte preservation.
Native dialogs are test-owned substitutions; no human-dialog, watcher or
general native-reference compatibility claim follows from these fixtures.

## Saved circular-path lifecycle fixtures

`assemblyCircularPathLifecycle.test.ts`,
`kernel.assembly-circular-path-solve.test.ts`,
`kernel.assembly-circular-path-repair.test.ts` and
`AssemblyCircularPathMatePanel.test.tsx` add original GPL-3.0-only cases
authored on 2026-10-22. They reuse
`src/cad/fixtures/assembly-material-arc-original.json`; no external model,
reference-application output, vendor binary or private artifact supplies input.
Opaque keys in model-only declaration cases provide syntax evidence only.

The unchanged original sector is the radius-2 quarter circle centered at
`(3,-2)` with two radial LINEs and a +4 mm extrusion. Per solid,
V=`4*pi mm3`, A=`6*pi+16 mm2`, identity bounds `(3,-2,0)..(5,0,4)`.
The moving material point is locally `(3,-2,4)`. Literal upper-arc targets
are `(5,-2,4)`, `(3+sqrt(2),-2+sqrt(2),4)` and `(3,0,4)`;
forward tangents are `+Y`, `(-1/sqrt(2),1/sqrt(2),0)` and `-X`.
Both actual endpoint origins are tested. Saved coordinate tests use the actual
measured length fractions `0`, `1/2` and `1`, without substituting analytic pi
for a native endpoint that differs by an ULP.

The CAD adapter consumes actual current-native Float64 arithmetic metadata,
not manually assigned metrology. Topology tolerance remains separately
reported. An original third sector fixed at `(20,-10,0)` provides its current
upper +Z plane for positive/negative UP Z with Free Follow X. Native vertex
differences check actual canonical component directions. Numerical projected
movement starts at a measured midpoint, releases the fixed coordinate to Free,
then targets the endpoint and returns inward with fresh native reports. No
unique Free pose or globally nearest motion is asserted.

Reused saved sources have root Rz90 plus `(10,20,30)` and Rx90 plus
`(-10,-20,-30)`. For child midpoint `(x,y,4)`, with
`x=3+sqrt(2)` and `y=-2+sqrt(2)`, literal world points are
`(10-y,20+x,34)` and `(-10+x,-24,-30+y)`. A separate shared-root declaration
retains one actual rigid owner, and a nested part translated by `(-3,2,-4)`
puts the selected material point at its root frame origin for sampled rotation
stations. These cases check fresh final geometry, not continuous traversal.
Cancelled `+1e16/-1e16 mm` source chains must reject at default precision.

Model cases cover exact intent, strict parsing without accessors, compound
role rewrites, dormant/suppressed inventories, selected/all-use replacement,
renamed v2 descendants and history/roundtrip. Native repair cases separately
authenticate circular catalogs and complete current point/path/UP repairs;
these native repair examples retain sector geometry while changing source
identity or descendant names, without claiming general topology correspondence.
LINE substitutions and nonendpoint vertices reject. Worker tests alter report
and document DTOs, exercise consumed/stale/cancelled tokens and inject a final
native-query failure without accepting fake CAD supports. Active circular mates
are rejected by the separate continuous translation-until-contact operation.

CAD position and direction checks use `1e-6 mm` / `1e-8 rad`, with V/A bands
`1e-5 mm3` / `1e-5 mm2`; curve/selection corroboration uses `1e-10` where stated
in each test. Model-only keys confer no measured geometry authority. The
authored production-renderer scenario reuses the two tracked sector occurrences
and their original upper plane as UP guide. It targets explicit dropdown
authoring and real worker/file lifecycle. Its distinct moving material vertex
is `(5,-2,0)` on occurrence B; Follow X and UP Y align with the actual upper
arc tangent and +Z roof guide. A fixed `pi/2 mm` coordinate has the literal
midpoint above. Native vertex differences supply an independent proper basis;
continuous quarter-sector extrema, including both extrusion ends, check placed
bounds for arbitrary solved rotations. A `4 mm` request exceeds the literal
pi-length arc and must reject without changing committed recovery. The arc's
display ordinal and rounded origin label are not native identity: its opaque
value preserves exact body/producer/edge/start references. Execution and platform evidence
belong in [validation](VALIDATION.md), not in fixture provenance. See the
[saved family contract](ASSEMBLY_CIRCULAR_PATH.md).

## Current native circular-path resolution fixtures

`kernel.assembly-circular-path-resolution.test.ts`,
`kernel.assembly-circular-path-evaluation.test.ts`,
`kernel.assembly-circular-path-world.test.ts`,
`kernel.assembly-arc-path-arithmetic.test.ts` and
`assemblyCircularPathReferences.test.ts` were independently authored on
2026-10-22 under GPL-3.0-only. They use the public CAD runtime and original
recipes, with no reference-application execution, private research input,
external model or binary fixture. The integration cases reuse the tracked
`src/cad/fixtures/assembly-material-arc-original.json`; no new geometry fixture
is required.

The sector has center `(3,-2)`, radius 2 mm, an explicit quarter arc between
`(5,-2)` and `(3,0)`, two radial LINEs and a +4 mm extrusion. Per solid,
V=`4*pi mm3`, A=`6*pi+16 mm2`; identity bounds are `(3,-2,0)..(5,0,4)`.
The material point is the reused sector's upper radial junction `(3,-2,4)`.
Current native source references and issued analytic arithmetic supply the
numerical constraint. Unlike the earlier recipe-only numerical experiment,
these integration cases do not assign hand-authored `1e-12` metrology budgets.
The model label is `current-native-analytic-float64`; exposed native topology
tolerances remain separate incidence metadata, not calibrated point/radius/
frame/phase uncertainty.

Literal upper-arc targets are `(5,-2,4)`,
`(3+sqrt(2),-2+sqrt(2),4)` and `(3,0,4)`, with forward tangents `+Y`,
`(-1/sqrt(2),1/sqrt(2),0)` and `-X`. Reversing the material endpoint gives
start radial `+Y`, forward tangent `+X` and midpoint tangent
`(1/sqrt(2),-1/sqrt(2),0)`; it does not borrow the native parameter normal as
the directed material normal. Coordinates use fractions of actual native trim
length, which can differ from analytic pi by an ULP. The separate endpoint
corroboration uses the retained actual endpoint parameter without clamping;
Cartesian expectations remain literal.

An original third reuse fixed at `(20,-10,0)` supplies its actual upper +Z
material plane for positive/negative UP Z. Free Follow and Free Follow plus UP
are solved at default bands and independently remeasured. Local projection
then targets the material frame translated locally by `(3,-2,4)`: endpoint
`(5,-2,4)` with Rz90, followed by the interior midpoint with Rz135. New native
point queries and material vertex differences check the changing X tangent and
Z guide alignment; fixed owners, source declarations and input remain unchanged.
There is no globally nearest or unique Free-pose oracle.

A nested point part uses local Rx90 and translation `(2,0,0)`; its actual rigid
owner remains the root occurrence, and its local Z is the Follow axis. Reused
scope roots use Rz90 plus `(10,20,30)` and Rx90 plus `(-10,-20,-30)`. Their
selected start point has literal world coordinates `(12,25,34)` and
`(-5,-24,-32)`. Scope selection never creates free child bodies. Separate
verifier controls compose two noncommuting nested rotations and retain original
`+1e16/-1e16 mm` placement magnitudes before cancellation.

The separate world-composition cases apply local Rx90 plus `(1,2,3)`, followed
by root Rz90 plus `(10,20,30)`. The literal center is `(12,24,31)`, with forward
radial/tangent/normal `(+Y,+Z,+X)` and reverse `(+Z,+Y,-X)`; solid bounds are
`(8,24,31)..(12,26,33)`. Original cancelled translations `+1e16/-1e16` expose
the retained `2e16 mm` magnitude at depth two under an explicit `1e5 mm`
linear inspection band. A separate default-band query rejects; this does not
claim default precision at those placements. Invariant radius/sweep and angular
budgets remain separate from the large positional allowance.

The native edge builder normalizes an attempted large parameter phase. Tests
retain the actual observed interval instead of claiming native large-phase
coverage. A separate pure Float64 subtraction case at `1e13` checks its
arithmetic allowance; it is not a native geometry test.

Physical checks use `1e-6 mm` / `1e-8 rad`; curve/frame corroboration normally
uses `1e-10`, and V/A comparisons use `1e-5 mm3` / `1e-5 mm2`. Fixed bounds use
`1e-6 mm`. Explicitly tighter requests and near-band perturbations test refusal,
not wider admission. Arithmetic controls distinguish center/radius/frame/sweep
from interior native D1 budgets, expose raw normalization defects and inject
only declared defects or failures while forwarding actual native geometry.
Lifetime controls reject copied/wrong-purpose/stale/cancelled proofs,
accessors, reentrant mutation and native-query failure. A candidate displaced
0.01 mm out of the arc plane fails fresh verification.

This is current-native resolution, numerical solve and independent verification
evidence, with local numerical projection. It grants no saved mate, worker
Apply, renderer, external compatibility or platform claim. See the
[native contract](ASSEMBLY_CIRCULAR_PATH_NATIVE.md) and actual
[validation](VALIDATION.md).

## Numerical circular-path fixtures

The `assemblyCircularPath*` tests were independently authored on 2026-10-22
under GPL-3.0-only. They use explicit mathematical circles, minor/major open
trims, fixed coordinates and independent point/normal/tangent expectations.
Moving-frame derivatives use central differences at `1e-5` and `2e-6` in
normalized owner translations/radian rotations, including all 18 columns for
three free roles, shared/null owners and common rigid gauge. Finite error
controls perturb point, radius, proper frame and sweep independently. Separate
cases exercise actual-owner initialization, capacity, fixed contradictions,
uncertainty refusal, and activation/release of both finite ends in projection.
Separate conditioning controls retain exact quarter/major endpoints at length
scales `1e-6` and `1e6`, a radius-0.2 / sweep-0.1 endpoint at scale 3, and a
one-ULP interior coordinate. A one-ULP exterior physical coordinate rejects.

`src/cad/kernel.assembly-circular-path-numeric.test.ts` reuses the tracked
original `assembly-material-arc-original.json` sector, with no new binary or
external model. Its numerical circle is authored from the recipe: center
`(3,-2,4)`, radius 2, radial X, tangent Y, sweep `pi/2`. The moving material
point is the reused sector's upper radial junction `(3,-2,4)`. Numerical errors
of `1e-12 mm` / `1e-12 rad` are explicitly declared analytic-input budgets;
they are not certified from the native observer or its topology tolerance.
After solving, new native BRep queries independently check the actual placed
point, material arc and component direction through differences of vertices.
Targets at distances `0`, `pi/2` and `pi` are `(5,-2,4)`,
`(3+sqrt(2),-2+sqrt(2),4)` and `(3,0,4)` with tangents `+Y`,
`(-1/sqrt(2),1/sqrt(2),0)` and `-X`. One native reconstructed length is an ULP
below analytic pi; its endpoint query uses the actual retained native endpoint
parameter, while the numerical target and independent Cartesian oracle remain
literal. No observer clamping is added.

The per-solid V=`4*pi mm3`, A=`6*pi+16 mm2` and fixed-sector bounds
`(3,-2,0)..(5,0,4)` remain independent checks. Physical position/direction bands
are `1e-6 mm` / `1e-8 rad`; separate curve/vector comparisons use `1e-10`, and
volume/area use `1e-5 mm3` / `1e-5 mm2`. These experiments confer no production
native admission, saved mate, editor or external policy claim. See the
[contract](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md) and actual [validation](VALIDATION.md).

## Material LINE path fixtures

The tracked `src/cad/fixtures/assembly-line-path-original.json` and new
`assemblyLinePath*` / `kernel.assembly-line-path*` tests use original synthetic
recipes authored on 2026-10-22 under GPL-3.0-only. They contain no external
application output, private CAD model or binary fixture. The renderer fixture
uses a centered 4 x 6 mm XY rectangle extruded 4 mm into one explicit body,
reused by a fixed path occurrence and a free point occurrence. Each placed
solid has V=96 mm3 and A=128 mm2; totals are 192 mm3 and 256 mm2.

The fixed LINE joins A=(-2,-3,4) to B=(-2,3,4), length 6 mm. The selected moving
material corner is locally (-2,3,0). Literal distance-1 targets are (-2,-2,4)
and, reversed, (-2,2,4). Percentage-25 targets are (-2,-1.5,4) and, reversed,
(-2,1.5,4). The same-body corner (2,-3,4) is deliberately nonincident to this
edge and must reject as its material origin. Distance 7 must reject against the
current length 6. Source declarations and original input bytes remain unchanged.

Direct native tests include endpoint identity, topology reversal, a shifted
100..105 native parameter interval, wrong-body and same-coordinate foreign
vertices, current proof lifetime, nested/reused placements and precision failure.
Numerical tests use literal axes and independent finite differences. Separate
native solve tests check Free beyond the trim, fixed-coordinate reversal,
current final re-query failure, private Apply, projection/motion and saved
history. Repair tests cover nested/suppressed roles and actual nonincident
replacement rejection. Coordinate comparisons and physical admission bands
remain distinct; see the [contract](ASSEMBLY_LINE_PATH.md) and actual
[validation](VALIDATION.md) for tolerances and executed scope.

The Follow extension adds original component-axis cases to
`kernel.assembly-line-path-follow.test.ts` and `assemblyLinePathSolver.test.ts`.
The native prism case uses an X-directed edge from (-2,-3,4) to (2,-3,4), with
literal point and positive/negative canonical component-axis targets. A nested
Rx90 point frame maps its local Z to parent -Y before the root pose is solved.
Separate controls move the path owner with the point owner fixed, reject a wrong
axis despite zero positional error, and reject combined angular uncertainty
without changing the requested band. Numerical cases use both moving owners,
off-solution finite differences at two step sizes, a common rigid gauge and an
exact antipodal start. The renderer keeps the previous fixture and measures
canonical component directions through differences of its current native material
vertices; it does not infer axes from a viewport image or prescribe a roll pose.

## Bounded path-curve fixtures

`src/cad/kernel.assembly-path-curves.test.ts` and
`src/cad/kernel.assembly-path-snapshot.test.ts` contain original synthetic recipes
authored on 2026-10-22 under GPL-3.0-only. They use the public CAD runtime and no
private model, installed reference application or external binary fixture.

The direct finite line joins `(1,2,3)` to `(4,6,3)`: length 5 mm and increasing
tangent `(0.6,0.8,0)`. At directed distance 2 mm its points are `(2.2,3.6,3)` and,
for reversed sense, `(2.8,4.4,3)`. An oblique line joins `(10,-3,5)` to
`(13.6,-3,0.2)`, with length 6 mm; its 3 mm point is `(11.8,-3,2.6)` and tangent
`(0.6,0,-0.8)`. Circular recipes have center `(3,-2,5)`, radius 2 mm, normal +Z
and X direction +X. The `[0,pi/2]` arc has length pi mm; at pi/2 mm its point is
`(3+sqrt(2),-2+sqrt(2),5)`. A full circle starts at parameter pi/4 and ends one
period later, retaining that current seam instead of normalizing it away.
Coordinate comparisons normally use `1e-10 mm`; native precision admission uses
explicit requested bands and includes topology tolerance rather than treating
that comparison tolerance as a physical certificate.

Snapshot recipes use an original 4×6×4 mm prism centered at sketch `(0,0)` or a
radius-2 cylinder centered at `(3,-2)`, extruded 4 mm. They cover legacy and
explicit bodies, repeated/nested occurrences, exact source/body identities,
fresh local/world observations, foreign/copied/stale proof rejection and cleanup.
Large translations and cancelled placement chains test failure at default
resolution and retention of original arithmetic magnitudes under an explicitly
wider requested band. These are bounded-curve prerequisites, not saved Path mate
or renderer acceptance. See [the curve contract](ASSEMBLY_PATH_CURVES.md).

## Material circular-arc origin fixtures

`src/cad/fixtures/assembly-material-arc-original.json`,
`kernel.assembly-arc-path*.test.ts` and `assemblyArcPathReferences.test.ts`
contain original GPL-3.0-only recipes authored on 2026-10-22. No external
application model, binary, proprietary source or private research file supplies
test input. Declaration-only opaque keys assert no native geometry authority.

The tracked document extrudes a quarter-sector profile 4 mm in +Z into body
`sector` and reuses it twice. Its center is `(3,-2)`, radius 2 mm, with an
explicit CCW arc from `(5,-2)` to `(3,0)` and two radial LINEs. Each solid has
V=`4*pi mm3`, A=`6*pi+16 mm2` and bounds `(3,-2,0)..(5,0,4)` at identity.
Those material expectations do not use the production curve evaluator.
The top arc has length pi mm. Its half-length point is
`(3+sqrt(2),-2+sqrt(2),4)`, with tangent `(-1/sqrt(2),1/sqrt(2),0)` from the
first endpoint and the opposite tangent from the other endpoint.

Direct native edge cases use the same radius/center at Z=5, both actual endpoint
vertices, reversed topology and a major trim `[pi/4,7*pi/4]` with length
`3*pi mm`. A trim `[7*pi/4,9*pi/4]` crosses native phase `2*pi` without modulo
normalization: its half-length point is `(5,-2,5)` and directed tangents are
opposite Y directions from its two material endpoints.
Independent foreign vertices with identical coordinates must reject.
LINEs, ellipses, full circles/seams and ambiguous native endpoint parameters are
separate rejection controls. Native query and cleanup faults forward actual
geometry or explicitly fail; they do not supply successful mock CAD supports.

Nested/reused original placements check literal world coordinates under proper
3D rotations and retain cancelled `+1e16/-1e16 mm` arithmetic magnitude. Default
precision refusal is separate from a deliberately wider requested linear band.
Interior-evaluation budget controls forward real native geometry and inject only
explicitly larger uncertainty to verify its retention and rejection after pose
composition. These are numerical budget controls, not calibrated metrology.
Current source/body/namespace, copied/stale proof and lifetime tests remain
separate from saved-mate, solver, UI and external behavior claims. See the
[material arc contract](ASSEMBLY_MATERIAL_ARC_PATH.md) and actual
[validation](VALIDATION.md).


## Saved profile-center lifecycle fixtures

`src/cad/fixtures/assembly-profile-center-original.json`,
`src/cad/kernel.assembly-profile-center-solve.test.ts` and
`src/cad/kernel.assembly-profile-center-repair.test.ts` contain original synthetic
recipes authored on 2026-10-22 under GPL-3.0-only. The desktop wrapper and flow
use the tracked document and declared public dependencies. No private model,
installed reference application, binary or research receipt is a test input.

The desktop document contains four occurrences and two reused prototypes, with
no initial mates. Its circle is radius 2, depth 3 mm, centered at sketch `(0,0)`;
its rectangle is 6×4×3 mm, also centered at `(0,0)`. Their top centers are
`(0,0,3)` and normals +Z. Circle occurrences begin at translations `(-12,0,0)`
(fixed) and `(-5,3,8)` (free); rectangle occurrences begin at `(12,0,0)` (fixed)
and `(20,4,10)` (free), all with identity rotation. Each body is explicitly
`body`, produced by `solid`.

Each circle solid has volume `12*pi mm³` and area `20*pi mm²`; each rectangle
has volume 72 and area 108 in those units. Four solids therefore total
`144+24*pi mm³` and `216+40*pi mm²`, without subtracting overlaps. For an active
aligned pair at signed offset `h`, the circle's free solid has X/Y bounds
`[-14,-10]×[-2,2]` and Z `[h,h+3]`. The rectangle's center is `(12,0,3+h)`;
for an odd quarter turn its X/Y bounds are `[10,14]×[-3,3]`, and for an even
quarter turn `[9,15]×[-2,2]`, with Z `[h,h+3]`. These are literal material
bounds, not expected values reconstructed by the production profile extractor.
The rectangle material edge is selected from the actual top boundary at local
Y=-2, Z=3 with the explicit increasing +X LINE direction and sense +1.
A same-body bottom edge at Z=0 is a deliberate nonincident rejection case.

The authored renderer flow checks circles/free and rectangles/explicit q=1,
preview Cancel/retry, wrong-edge rejection, Apply, compound face/edge reselection,
edit offset, Undo/Redo, suppression/reactivation, deletion, Save As/reopen and
fresh re-solve. It checks actual native reports and worker capabilities. It uses
dropdowns and test-owned dialogs, not viewport pointer picking or a human file
dialog. Bounds use `1e-5 mm`, volume/area `1e-5 mm³/mm²`, reported center residual
`1e-6 mm` and direction residual `1e-8 rad`. Command registration and this recipe
are not a claim that the flow executed; source-specific runs belong in
`VALIDATION.md`.

The 18 authored native integration cases use a separate 6×4×4 mm rectangular
prism centered at sketch `(2,1)` and a radius-2, depth-4 cylinder centered at
`(0,0)`. Their top centers are `(2,1,4)` and `(0,0,4)`. An off-origin circular
variant has center `(2,1,4)` and checks the transformed material center, rather
than imposing a unique body translation on its free spin. Each rectangular
solid has volume 96 and area 128; each cylinder has volume `16*pi` and area
`24*pi`. A fixed first owner begins at identity; the second starts at
`(9,-6,7)`. Offset is +2 mm along the first +Z normal.

For rectangles the literal expected second translations are:

| Quarter turns | Aligned | Opposed |
| --- | --- | --- |
| 0 | `(0,0,2)` | `(0,2,10)` |
| 1 | `(3,-1,2)` | `(1,-1,10)` |
| 2 | `(4,2,2)` | `(4,0,10)` |
| 3 | `(1,3,2)` | `(3,3,10)` |

The expected material X directions are +X, +Y, -X, -Y respectively. The material
Z direction is +Z for aligned and -Z for opposed; Y completes the corresponding
proper basis. Even-quarter bounds are `[-1,5]×[-1,3]`, odd-quarter bounds
`[0,4]×[-2,4]`; Z is `[2,6]` aligned and `[6,10]` opposed. Tests derive these
from literal recipe geometry and explicit basis arithmetic, rather than using
the numerical helper as an expected-value oracle. Native material bounds use
`1e-6 mm`, basis directions `1e-8`, and volume/area `1e-5 mm³/mm²` bands.

The remaining cases cover authenticated Apply/history/reopen, atomic conflicts,
wrong boundary purpose, copied/consumed tokens, mutated report DTOs, independent
final-query failure and sampled free-circle motion/drag. Two reused nested
occurrences retain four placed solids and one prototype. The literal transformed
bounds for the second child are `[7,19,32]..[11,25,36]` under outer Rz90 plus
`(10,20,30)`, and `[-9,-1,-2.8]..[-2.2,3,4.4]` under the separately prescribed
proper Y rotation plus `(-10,0,0)`. A same-owner pair checks retained common
rigid freedom. Separate repair cases exercise atomic face/edge/sense choices,
selected replacement, renamed descendants, repeated scopes and bounded candidate
enumeration. None establishes external default orientation, native enum/button
mapping, circle roll locking, general convergence or platform support.


## Current profile material-axis fixtures

The native axis extractor, snapshot and physical-evaluation tests use original
analytic geometry built through the project's declared kernel. No external CAD
model, vendor implementation or native reference proof is checked in.

`kernel.assembly-profile-axis-supports.test.ts` selects the actual face-owned
edges of original rectangles and squares by unique literal endpoint pairs in
the test oracle. Native wire assembly may replace the initially constructed
edges; those older edges are not accepted as if they belonged to the face.
The tests cover every side and both explicit senses, native TopAbs reversal,
oblique Cartesian directions, an independently built identical edge, circular
faces, distant arithmetic and native query/release faults.

`kernel.assembly-profile-axis-snapshot.test.ts` uses an original 6-by-4-by-3
prism centered at XY `[2,1]`, a 2-by-2-by-3 square prism at `[22,1]` and a
radius-2, height-3 cylinder at `[12,1]`. Their top centers are `[2,1,3]`,
`[22,1,3]` and `[12,1,3]`. The rectangular top corners are
`[-1,-1,3],[5,-1,3],[5,3,3],[-1,3,3]`. A separate copy of the original native
body supplies an independently inspected LINE derivative sign; expected
positions/directions use literal Cartesian transforms, not the new extractor.
The noncommuting placement Ry with cosine `.6` and sine `.8`, translation
`[10,-3,5]`, followed by Rz90 and `[-7,11,2]`, gives center `[-5,24.6,7.2]`,
normal `[0,.8,.6]` and selected X direction equal to its observed parameter sign
times `[0,.6,-.8]`. A reused occurrence differs by `[30,-10,5]`.

Other snapshot cases check unrelated edges, explicit short-side choice, squares,
circle axis rejection, cross-purpose/copied/cross-session proofs, malformed
preflight, stale sources, reentrant invalidation, cleanup aggregation and
cancelled `2e16 mm` placement magnitudes. Default `1e-6 mm`/`1e-8 rad` bands
admit the declared exact LINE cases; an explicit `1e-16 rad` band rejects.

`kernel.assembly-profile-center-evaluation.test.ts` checks full center norms,
aligned/opposed normal angles, explicit quarter-turn targets, sense reversal,
squares, free mixed pairs, repeated fresh queries and retained chain errors.
One noncommuting three-dimensional case independently expects center separation
`sqrt(906) mm` and a `pi/2` normal angle. Parser tests check detached strict
declarations. The new physical checker does not use the solver's row helper as
its expected result. These are programmatic geometry/lifetime results, without
saved mate, editor, Apply/history, repair or platform claims.

## Numerical profile-center solver fixtures

`assemblyProfileCenterGeometry.test.ts`, `assemblyProfileCenterEquations.test.ts`
and `assemblyProfileCenterSolver.test.ts` contain original numerical declarations,
without external CAD models, copied implementation or native-reference proofs.
Their explicit uncertainty fields are part of each declared experiment.

The anchored solve uses first center `[1,2,3]`, normal `+Z` and offset `2 mm`.
A free circular center at local zero targets `[1,2,5]`; two already-satisfied
spins `0` and `.7 rad` retain their distinct directions and one local freedom.
For an oriented rectangle at local center `[2,-1,4]`, quarter zero requires body
translation `[-1,3,1]`. Quarter-turn targets are literal `+X,+Y,-X,-Y`, with
normal `+Z` or `-Z` under aligned/opposed choices. A negative offset of `-3 mm`
targets `[1,2,0]`, independently of the second normal's sign. Separate odd-quarter
cases move the first owner and check the inverse orientation rule.

The nonzero endpoint frame is `Rz90 + [10,20,30]`, mapping local `[2,3,4]` to
`[7,22,34]` and local X to Y. Target center `[5,6,9]` and X direction imply the
literal body `Rz-90` and translation `[-17,13,-25]`. Tests implement an independent
closed-form quaternion matrix to compare centers/bases, with `1e-6 mm` and
`1e-8 rad` physical bands. Rank five/six/zero checks concern these specific
accepted configurations, rather than an unconditional family rank.

Pure-helper finite differences exercise all twelve formal columns at two steps
off solution, an oblique moving first frame, repeated/null owners and common
rigid gauge. Bridge tests independently perturb the solver retraction and use
length scales 1, 10 and 1000. Physical defect norms reject a case whose individual
components fit their bands. Other cases cover actual geodesic angles, antipodal
chart rejection/restoration, far-placement cancellation, mandatory uncertainties,
strict declarations, atomic conflicting-offset failure and zero getter calls.
Capacity controls admit 42 six-row or 28 nine-row declarations at 252 rows and
reject the next declaration without changing the 256-row ceiling. No numerical
fixture supplies native compatibility, material-axis authentication, saved mate,
editor interaction, repair, history or platform evidence.

## Original ordered plane placement equations

`src/model/assemblyPlanePlacement.test.ts` contains original numerical inputs,
not imported CAD models or saved native references. The nonparallel example
uses anchor `(0,2,-1)` with normal `(1,0,0)`, then points `(10,0,0)`,
`(2,0,0)` and `(5,0,0)` with rational unit normals `(3/5,4/5,0)`,
`(3/5,0,4/5)` and `(4/5,3/5,0)`. Substituting the ray `(lambda,2,-1)`
into the three plane equations gives literal intersections `22/3`, `10/3`
and `7/2`. The expected values do not come from the helper under test.

The independent parallel example uses X planes `-7,11,-2,-5` in original
role order, giving ray parameters `[0,18,5,2]`. With explicit tab span sign
`-1`, tab extent is 3 and available span is 15; ordered start/end distances
are 5 and 16 while the physical near-envelope gap is 2. These arithmetic choices
do not admit a saved Width mode or define an orientation policy.

Original proper rigid transformations generate oblique/common-frame variants.
Two-step central finite differences perturb each original support independently
or every support of the same physical owner. They check analytic derivatives,
including the first support's moving ray origin and direction. Repeated IDs
and null roles are explicit test data, not inferred component relationships.
The [contract](ASSEMBLY_PLANE_PLACEMENT.md) and
[validation record](VALIDATION.md) state the actual scope and tolerances.

## Original directional and surface symmetry repair fixtures

The fifteen `src/cad/fixtures/assembly-symmetry-{line,plane,sphere,cylinder,axisline}-repair-*.json`
fixtures are original analytic constructions extending the public symmetry
prism, full-revolution sphere and circular-extrusion cylinder below. Each
family has an unmated assembly, a same-part-ID updated document and a distinct
replacement part. No external model supplies geometry and no native reference
keys are invented. Source, target and mirror references must come from current
native catalogs. These files propose repair inputs; their provenance does not
claim an executed repair workflow.

Source and target share one entity prototype; the fixed mirror uses a separate
4 by 6 by 4 mm prism prototype. Thus an entity update or all-occurrence entity
replacement addresses exactly two saved usages and two relation roles. The
mirror is unchanged and still needs fresh native verification. Source and
mirror are fixed; target is free. The mirror support is its actual left face,
world plane X=0, rather than an inferred component origin.

Line/plane prisms have local bounds `[0,W] x [0,6] x [0,H] mm`, with W=H
equal to 4, 6 and 8 for baseline, update and replacement. Their source and target
translations start at X=-10 and X=7 mm. The line proposal uses source edge
`(W,0,z)` and target edge `(0,0,z)` along Z; the plane proposal uses source
face X=W and target face X=0. Reflection in X=0 therefore gives target line
or plane X=`10-W`, namely 6, 4 and 2 mm. Line axial position and plane
tangential position are free; these oracles do not prescribe a complete target
translation or quaternion. Each prism has `V=6WH` and
`A=2*(6W+WH+6H)`. Including the unchanged mirror, three-solid volume/area
totals are 288/384, 528/560 and 864/768 in mm³/mm².

Sphere parts retain the original full 360-degree revolution of a semicircle
and diameter, with radii 2, 3 and 4 mm. Their source centre is X=-5 mm and
the initial target centre X=6 mm, so reflection requires centre X=5 mm for
all radii, without restricting rotation. Using `V=4*pi*r^3/3` and
`A=4*pi*r^2`, two spheres plus the mirror have volume/area
`96+64*pi/3` / `128+32*pi`, `96+72*pi` / `128+72*pi`, and
`96+512*pi/3` / `128+128*pi` in mm³/mm².

Cylinder and axis-line parts use extruded circles with local centre X=0, 1
and 2 mm, radius 2, 3 and 4 mm, and height 4, 6 and 8 mm. Source starts at
X=-5 and target at X=6 mm. The reflected infinite Z axes lie at X=5, 4 and
3 mm respectively. Cylinder relations additionally compare equal radii;
explicit face-axis line relations do not. With `V=pi*r^2*H` and
`A=2*pi*r*(r+H)`, two cylinders plus the mirror give volume/area
`96+32*pi` / `128+48*pi`, `96+108*pi` / `128+108*pi`, and
`96+256*pi` / `128+192*pi` in mm³/mm². The axis-line fixture is a separate
purpose control, not another symmetry family or a cylindrical-surface result.

A proposed selected source replacement from radius 3 to 4 mm leaves target
radius 3 mm. Sphere/cylinder symmetry then has an independent signed
target-minus-source radius difference of -1 mm that rigid motion cannot
repair. A fresh all-occurrence radius-4 replacement removes that mismatch.
The corresponding face-axis line relation can accept unequal material radii;
its mixed radius-4/height-8 source and radius-3/height-6 target plus mirror have
volume `96+182*pi mm³` and area `128+150*pi mm²`. Reference failure,
uncertainty rejection and incompatible-radius geometry must remain distinct.

Finite material bounds must use actual proper poses: all eight prism corners,
sphere centre plus/minus radius, and cylinder endpoint extrema expanded in
coordinate i by `r*sqrt(1-axis_i^2)`. Independent reflection, physical angle
and radius checks concern selected supports; they do not assert finite contact,
a unique free pose, other repair scopes or platform support.

## Original reused nested point-symmetry repair fixtures

`src/cad/fixtures/assembly-symmetry-nested-repair-original.json` and its
`assembly-symmetry-nested-repair-updated-part-original.json` and
`assembly-symmetry-nested-repair-replacement-part-original.json` companions
extend the original public material-point repair prisms below. No external CAD
or private model supplies geometry. The baseline is an unmated assembly with
no invented native keys: source/target vertices and the mirror face must be
selected from a fresh native catalog before adding a point-symmetry declaration.

Each prism has local bounds `[0,W] x [0,6] x [0,H] mm`: W=H=4 for the original,
6 for the same-part-ID update and 8 for the distinct replacement part. The
three inner occurrences have source translation `(-10,0,0) mm`, target
`(7,0,0) mm` and mirror zero, with source/mirror fixed and target free. One
shared outer definition contains an `inner` occurrence with translation
`(3,5,2) mm` and a literal 90-degree Z rotation. Root `left`, `right` and
`sleeping` occurrences reuse that outer definition at X=-40,40,120 mm;
`sleeping` starts suppressed. These are two real assembly ancestors, not
duplicated independent three-part fixtures.

The independent rotation matrix is `[0,-1,0; 1,0,0; 0,0,1]`. An inner point
`(x,y,z)` under root X=T therefore becomes `(T+3-y,5+x,2+z)`. The native
left mirror plane X=0 becomes world Y=5. With source vertex `(W,6,H)` and
target vertex `(0,6,H)`, baseline reflection gives inner `(6,6,4)` and world
`(T-3,11,6) mm`; the original target point is `(T-3,12,6) mm`, one mm away.
After selected replacement of only the source by the 8 by 6 by 8 mm part,
its reflected point is inner `(2,6,8)`, world `(-43,7,10) mm` in the left
expansion. The target keeps its original material vertex `(0,6,4)`.
After shared-source update, all three prisms become 6 by 6 by 6 mm and the
reflected point is inner `(4,6,6)`, world `(T-3,9,8) mm`. These selected-point
oracles do not prescribe the target's complete free pose.

For each prism, `V=6*W*H mm³` and `A=2*(6*W+W*H+6*H) mm²`. With two active
expansions, baseline totals are 576 mm³/768 mm²; selected source replacement
in the left expansion gives 864 mm³/960 mm²; shared update gives
1296 mm³/1296 mm². Reactivating the third expansion gives nine solids:
selected replacement totals 1152 mm³/1344 mm² because the other expansions
remain original; shared-update totals are 1944 mm³/1944 mm². Finite bounds
must use all eight corners transformed by each actual proper pose. Fixed
ancestor/source/mirror poses and unaffected declarations have exact-copy
oracles; the free target has no prescribed quaternion or full translation.

The proposed selected-replacement case addresses `left/inner/source`, requiring
two ancestor revision forks and one changed leaf. Only its source role needs a
new vertex repair under the cloned inner scope; target and mirror retain their
original purpose/references and still require fresh native verification.
The original shared inner/outer definitions, right expansion and initially
suppressed sleeping expansion remain isolated from that selected fork.
The proposed shared-source case instead updates three saved part-use
declarations and repairs source/target/mirror once in the shared inner scope;
expanded uses are not additional saved declarations. Reactivation must verify
the previously suppressed expansion against its actual resulting revision.

Selected replacement and shared update are separate intended interaction
scenarios so each can retain incomplete-repair rejection, ready-preview
Cancel/retry, Apply, Undo/Redo, Save As/reopen and reactivation within the
existing deadlines. This is fixture provenance and an independent acceptance
plan, not an execution result; consult [VALIDATION](VALIDATION.md) for any
recorded run. It establishes no other-family repair, arbitrary correspondence,
viewport visibility, finite contact, continuous motion or platform support.

## Original symmetry viewport-selection fixture

### Original display selection and lifetime cases

`src/components/assemblyVertexPicking.test.ts` constructs original THREE boxes
and literal orthographic/perspective cameras, with detached symbolic vertex
catalogs. It checks a real front corner and hidden back corner, own/other-body
occlusion, absent catalogs, occurrence-distinct identities and conservative
pixel ties. A 90-degree perspective camera with aspect two and depth nine
projects `(1,1)` to NDC `(1/18,1/9)` independently; near/far clipping and
non-square CSS coordinates are checked separately. This unit camera does not
establish a perspective mode in the assembly product.

Other cases exercise exact eight-pixel and half-pixel boundaries, orthographic
zoom, F64 coordinate 16777217 rather than its rounded Float32 neighbour,
invalid views/thresholds and the optional metadata cap. Foreign body/source,
revision, malformed key and invalid duplicate metadata reject. Exclusive
vertex/edge/face intent cannot fall through to another producer. Display markers
resolve selected identities against current coordinates, omit stale/hidden or
ambiguous entries, cap selected/hovered markers and release every constructed
geometry/material. These display fixtures grant no native point proof.

`assemblySymmetryPicking.test.ts` uses original symbolic scene rows for material
vertices, LINE edges, planar faces, sphere surfaces and cylindrical surfaces.
It distinguishes cylindrical-axis line intent from cylinder-surface intent and
restricts the third role to a plane. Payload coordinates cannot substitute for
the unique current catalog row; scope, occurrence, revision, body, topology key
and purpose stay explicit. Selection tickets check document signature, scope,
generation, scene ID, family, producer and blocked staging/preview state.
Auto-advance fills only empty roles, retains explicit line-producer intent and
stops after reselecting a complete tuple; mirror-only arming does not infer a
line producer. Semantic reference comparison ignores property insertion order
while preserving body/source/key, occurrence/revision, purpose and plane intent.
These are helper and resource-lifetime cases, not executed pointer gestures,
native geometry authentication or application acceptance results.

### Original six-row geometric pointer plan

`src/cad/fixtures/assembly-symmetry-picking-original.json` derives only from
the original tracked five-family symmetry fixture below. The prior fixture is
unchanged. The dedicated document has six rows at Y=0,20,40,60,80,100 mm:
point, material LINE, plane, sphere, cylinder and an explicitly cylinder-derived
line-axis selection. Each row has independent source, target and mirror owners.
Source/mirror are fixed, target is free; all initial rotations are identity.
The additional row uses the existing cylinder prototype for source/target and
the existing prism for its mirror. It adds no datum, mesh-derived point or
external model.

All mirror references are native positive-X planar faces of the original
`[0,4] x [0,6] x [0,4] mm` prisms, giving the literal world plane X=4.
Point/LINE/plane source translations have X=-5 mm and targets start at X=6 mm.
Point selection is the actual local corner `(4,0,4) mm`; its reflected world
position is `(9,Y,4) mm`, while the initial target point is `(10,Y,4) mm`.
LINE selection uses the Z-directed edge at local X=4,Y=0. Its reflected
infinite line has X=9,Y=row Y. Plane selection uses local X=4 with outward
normal +X; its reflected plane is X=9 with normal -X, requiring the explicit
opposed branch for a target +X normal. These supports do not prescribe the
target's full rigid pose or a universal target translation.

Sphere, cylinder and derived-axis sources have X=-5 mm and targets start at
X=14 mm. Their reflection about X=4 places the sphere centre at `(13,Y,0) mm`
or the infinite Z axis at X=13,Y=row Y. Initial position defects are one mm.
The original radius remains 2 mm and cylinder depth remains 4 mm. Cylinder
surface and derived line-axis intents stay distinct; the latter does not assert
radius compatibility. Sphere/point have null alignment, LINE/cylinder/derived
axis use aligned intent, and planes use opposed intent. Axial/tangential and
rotational freedoms are checked through selected supports, not invented poses.

The 12 prisms, two spheres and four cylinders give independent total volume
`1152+256*pi/3 mm³`, area `1536+128*pi mm²` and 18 solids. Material bounds can
be checked using all eight transformed prism corners, sphere centre plus/minus
radius and cylinder endpoint extrema plus `R*sqrt(1-axisCoordinate²)`.

The authored pointer oracle uses the existing Isometric view, whose eye
direction is `(1,-1.3,1)`. For actual visible-bound centre C, diagonal S
clamped to at least one mm, CSS canvas height H and relative point `(dx,dy,dz)`,
the independent projection has scale `k=H/(1.3*S)`, horizontal displacement
`k*(1.3*dx+dy)/sqrt(2.69)` and upward displacement
`k*(-dx+1.3*dy+2.69*dz)/sqrt(9.9261)`. Canvas left/top and half its CSS
width/height supply the pixel origin; no hidden camera or selected-reference
state supplies expected pixels. Geometric click candidates are the prism
corner `(4,0,4)`, LINE midpoint `(4,0,2)`, planar interior `(4,0.6,2)`,
sphere centre plus `2*(1,-1.3,1)/sqrt(3.69)` and cylindrical side point
`(2/sqrt(2.69),-2.6/sqrt(2.69),2) mm`, transformed by the actual owner pose.
The low-Y planar point avoids same-row occlusion from the target in this view.

This records original geometry and a selection plan, not an executed pointer
result. Actual event delivery, selected current identities, occlusion and
native verification need their own interaction evidence in
[VALIDATION](VALIDATION.md). No arbitrary-view visibility, persistent naming,
finite contact, global motion or platform acceptance follows from this fixture.

## Original desktop point-symmetry repair fixture

`src/cad/fixtures/assembly-symmetry-repair-original.json` and its
`assembly-symmetry-repair-updated-part-original.json` and
`assembly-symmetry-repair-replacement-part-original.json` companions are
original rectangle/extrusion documents. No external CAD model is imported.
Each prism has local bounds `[0,W] x [0,6] x [0,H] mm`, with `W=H=4` for
the baseline, 6 for the changed shared source and 8 for the replacement.
The XY rectangles have centres `(W/2,3) mm`; one-sided extrusion depth is H.
The source update changes actual geometry while retaining its part ID;
the replacement has its own part ID. Neither operation is an identity-only edit.

Three occurrences share the original prototype. Their initial translations are
source `(-10,0,0) mm`, target `(7,0,0) mm` and mirror `(0,0,0) mm`, with
identity rotations. Source and mirror are fixed; target is free. The selected
source material vertex is `(W,6,H) mm` locally, the target material vertex is
`(0,6,H) mm`, and the mirror is the actual native left planar face at X=0.
The independent reflected source point is therefore `(10-W,6,H) mm`:
`(6,6,4)`, `(4,6,6)` and `(2,6,8) mm` for the three geometries. The initial
target point `(7,6,4) mm` has a one-mm defect. These are selected-point oracles,
not prescribed complete target poses or inferred point/axis references.

For three equal prisms, independent total volume is `3*W*6*H mm³` and area is
`6*(6*W+W*H+6*H) mm²`: respectively 288/384, 648/648 and 1152/960 for
baseline, source update and replacement. The authored flow checks three native
solids, each body's volume/area and all eight corners transformed by its actual
proper rotation and translation. Fixed poses are checked exactly; the target's
remaining rotation is not assumed to stay at identity. Material bounds and
direct world-point reflection are separate from support-only worker reports.

`scripts/desktop-assembly-symmetry-repair-flow.cjs` authors one point symmetry
through current vertex dropdowns and a native planar mirror. Its source-update
path explicitly repairs all three roles, requests a solve with the mirror
still pending, then retries after choosing the mirror. Its all-occurrence
replacement path checks that two of three repairs leave Resolve disabled.
Both paths include ready-preview cancellation, a fresh review and explicit
repairs, Apply, Undo/Redo, Save As/reopen and a fresh native verification that
is cancelled. The script requests eight Open and three Save As operations
through test-owned dialog paths and checks preservation of original inputs
and previously saved bytes. The changed-source revision and replacement review
identities must differ after cancelling and retrying.

This records authored scope and independent fixture formulas, not executed
results. Execution belongs in [VALIDATION](VALIDATION.md). It covers one
point-family, shared-source, three-owner scenario; it does not establish
viewport picking, nested/suppressed repair interaction, the other four families'
repair editors, arbitrary persistent correspondence, human file dialogs,
collision or other-platform behavior.

## Original saved/native symmetry integration cases

`src/model/assemblySymmetry.test.ts` constructs original syntax-only declarations
for all five families, not native applicability evidence. It checks saved
round trips, source/target/mirror incidence, explicit role repair, selected/all
replacement plans, shared/suppressed/dormant scopes, producer diagnostics,
executable rejection and both lazy parser import orders. The existing strict
standalone reference cases keep purpose and body/source checks separate.

`assemblySymmetryUncertainty.test.ts` exercises the explicit ordered
source/target/mirror uncertainty tuple, current reflection/projection lever arms,
radius and directional uncertainty, two scales, distant origins, cancelled
original chains, projection rejection and strict data copying. Legacy numerical
tolerance-sum compatibility is checked only without the tuple.
`assemblySymmetryNativeTolerance.test.ts` uses a literal X reflection with
source/target X=-1/+1 mm and point errors `epsilon=1e-7 mm`. Reflection has
operator norm one and mirror translation contributes twice its error, giving
the independently attained `4*epsilon` defect inside the unchanged `1e-6 mm`
band. Normal/transverse projectors also have norm one. All five families check
this structured bound; these are first-order estimates, not interval proofs.

`kernel.assembly-symmetry-solve.test.ts` reuses the original centred
4 by 6 by 4 mm prism, radius-2 depth-4 cylinder and the existing original
radius-2/radius-3 revolved spheres. All five saved families start with a literal
one-mm target defect and check newly resolved world supports by direct reflection,
projection and `atan2`, separately from the constraint evaluator. Fresh scenes
check volumes 96, `16*pi` and `32*pi/3 mm³` as appropriate. Three moving owners,
repeated owners, a mirror-only correction, explicit fixed-scope mirror and
face-axis line purpose retain their actual incidence. The point mid-plane
oracle for X=-7/+8 mm is X=0.5 mm. A rotated nested scope, radius mismatch,
cancelled source/mirror chains, later native-query failure, strict movement,
local projection and worker Cancel/Apply/Undo/Redo/reopen retain separate checks.
A copied preview document cannot edit the private candidate. A proposed
radius-`1e10 mm` primitive test was not admitted by the existing radius bound
and was removed; it supplies no native extreme-radius evidence.

`kernel.assembly-symmetry-repair.test.ts` uses these original sources to require
exact current repairs for all affected roles on source revision and replacement,
both active and suppressed. It distinguishes source/target from a separately
owned mirror source, rejects a forged legacy-aggregate point repair, and retains
repeated point roles across reused nested and suppressed expansions.
`assemblySymmetryUi.test.ts` checks detached three-role intent and matching
current physical report selection; symbolic UI DTOs establish no native proof.

`kernel.assembly-vertex-scene.test.ts` uses original prisms and cylinders to
check fresh prototype queries, detached local/world occurrence metadata,
explicit-body and reused/nested scope identity, and release on query failure.
Injected catalog cardinalities check the 65536 prototype and expanded metadata
allowances, whole-body omission and preserved usable body geometry; they do
not construct that many independent native vertices or benchmark capacity.
Six additional source-update/replacement panel cases use original scene DTOs
to check exact point candidate identity, explicit body/source/revision and
reused namespace handling. Helper/SSR candidate tests are separate from native
repair verification and do not establish Electron repair interaction.

### Original five-family desktop symmetry fixture

`src/cad/fixtures/assembly-symmetry-original.json` is an original unmated
assembly with 15 occurrences sharing three embedded prototypes. Its prism is
the XY rectangle centred at `(2,3) mm`, 4 by 6 mm, extruded 4 mm: local bounds
`[0,4] x [0,6] x [0,4] mm`, volume 96 mm³ and area 128 mm². Its cylinder has
radius 2 mm and depth 4 mm, volume `16*pi mm³`, area `24*pi mm²`. The sphere
reuses the complete original radius-2 revolution described in
[spherical tangency provenance](#original-spherical-tangency-fixtures), with
volume `32*pi/3 mm³` and area `16*pi mm²`. No external model is imported.

Each family has source X=-5 mm, initial target X=6 mm and mirror X=0 mm.
The groups lie at Y=0,20,40,60,80 mm for point, line, plane, sphere and cylinder.
Source/mirror occurrences are fixed. The mirror reference is the explicit YZ
principal plane attached to its own component, not a guessed native face.
Point and LINE selections use the actual local origin vertex and origin
Z-directed edge. Planar choices use explicit opposed normal intent; line and
cylinder use aligned intent. The reflected selected origins require target
X=5 mm. This does not lock the complete target pose or its remaining freedoms.
The 11 prisms, two spheres and two cylinders give total volume
`1056+160*pi/3 mm³` and total area `1408+80*pi mm²`.

The authored `test:desktop:assembly-symmetry` flow chooses exact current dropdown
entries for every family, previews and applies each relation, checks native
reports and independent reflected supports, exercises Undo/Redo and edit
reselection, blocks a missing role and cancels edited proposals. Directional
branch edits accept either a verified ready proposal or an explicit rejection;
they do not assert universal branch solvability. Save As/reopen retains the
five grouped declarations. Fixed/nonparticipating poses are checked exactly;
participating poses use their actual proper rotation to derive finite bounds.
Prisms use all eight transformed corners, spheres centre plus/minus radius,
and cylinders endpoint extrema plus `R*sqrt(1-axisCoordinate²)`.
Material and finite bounds are checked independently of support-only reports.
This is dropdown interaction, not viewport point picking, source repair UI,
general collision or cross-platform evidence. Execution belongs in
[VALIDATION](VALIDATION.md); this inventory records no final acceptance result.

## Original native symmetry measurement cases

`src/model/assemblySymmetryMeasurement.test.ts` checks an independent physical
measurement path for point, line, plane, sphere and cylinder supports. The
original rational mirror has point `(7/3,14/3,14/3) mm` and normal `(1,2,2)/3`,
so its plane offset is 7 mm and its reflection matrix is
`H=[7,-4,-4; -4,1,-8; -4,-8,1]/9`, with translation `(14,28,28)/3 mm`.
Source `(1,2,-1)` reflects to `(5,10,7) mm`; target `(6,12,10)` leaves
`delta=(1,2,3) mm`. Target direction +Y gives position errors `sqrt(14)`
for point/sphere, `sqrt(10)` for line/cylinder and 2 mm for the plane.
Reflected +X is `(7,-4,-4)/9`; the aligned physical angle is
`atan2(sqrt(65),-4)` radians. These literal expectations do not call the
numerical constraint helper. Radius-3 supports, translated copies, exact zero
sets, opposed pi branches and a radius difference of 1 mm are checked.
The comparison bands are `1e-6 mm` and `1e-8 rad`; literal measurements use
12-decimal comparisons, with the pi branch checked to 14 decimals.
Mirror lever-arm and target-projection uncertainty, excessive radius error,
overflow, subnormal inputs and normal-input subtraction to a subnormal defect
exercise honest precision rejection rather than enlarged comparison bands.

`src/cad/kernel.assembly-symmetry.test.ts` observes all five families through
actual engines and snapshot witnesses without solving or changing the document.
The original box is the 4 by 6 by 4 mm rectangle extrusion, with local corners
`[-2,2] x [-3,3] x [0,4] mm`. Source/target owners translate by -5/+5 mm in X.
The selected vertices `(-2,-3,0)` and `(2,-3,0)` therefore reflect at
`(-7,-3,0)` and `(7,-3,0) mm`. Actual Z-directed LINE edges use those X/Y
coordinates; actual opposite X faces supply the planar pair. A third box owner
at X=-2 mm supplies its +X face as the actual mirror plane X=0.
Moving the target +1 mm in X gives a literal 1 mm physical defect in every
family. Repeated source/target ownership is checked for every family too.

The original radius-2, depth-4 circle extrusion supplies cylindrical surfaces
and separately selected face-axis line purpose. Radius-2 and radius-3 spheres
reuse the complete original revolved sources described in
[spherical tangency provenance](#original-spherical-tangency-fixtures), not a
nominal sphere centre or display mesh. Equal-radius surface pairs have centres
at X=-5/+5 mm; radius-2 to radius-3 target changes report a signed +1 mm
radius difference and fail the unchanged physical band. A target cylinder
rotation of 15 degrees about X reports `pi/12` radians. A separate coaxial
opposed-branch case reports pi. A cylindrical-axis line selection cannot
substitute for surface purpose.

Native reports use the default `1e-6 mm` and `1e-8 rad` bands; literal defect,
radius and angular values are compared within `1e-9` in their physical units.
An enclosing 90-degree Z rotation and translation `(20,30,40) mm` preserve
the zero set while retaining actual nested component paths and scope. A
legacy aggregate, an equal detached document copy, stale content and explicit
body/aggregate substitutions exercise the separate identity rules. Two calls
must perform four actual point queries and two actual mirror-face queries;
equality of cached reports alone would not satisfy that observation.

Large cancelling source placements and a separately rotated cancelling mirror
chain retain `1e16 mm` placement magnitudes and return `precisionLimit`.
Finite opposite `1e308 mm` placements whose original magnitude sum overflows
also return `precisionLimit`, preserving the otherwise usable native snapshot.
Fault injection after the second point query, reentrant disposal during that
query or the third mirror query, and invalid accessor-bearing policy/scope
inputs cannot publish a partial report. Faults do not calculate expected
geometry. Copied report DTOs cannot recover private point proof. These cases
establish no native metrology certificate, saved mate, solver admission,
viewport selection, repair or editor workflow. Written inventories are not
execution results; those belong in [VALIDATION](VALIDATION.md).

## Original native vertex reference cases

`kernel.vertex-references.test.ts` constructs original discrete face/edge
references to check canonical reordering, source/lineage/count/incidence
changes, strict key syntax and rejection of duplicate, foreign, sparse or
executable descriptors. Identical incidence intentionally hashes identically:
native uniqueness must be established separately. `assemblyVertexReference.test.ts`
checks detached round trips, explicit null versus missing body, source/body
consistency and rejection of directional/datum substitutions and accessors.

`kernel.vertices.test.ts` uses an original Cartesian prism with corners
`[-2,2] x [-3,3] x [0,4] mm`: eight vertices, volume 96 mm³ and area 128 mm².
Actual native validity, solid count, material properties and bounds are checked
separately from incidence keys. Reordered borrowed catalogs preserve identity;
a width edit from 4 to 6 mm checks only that original conservative correspondence.
Foreign/incomplete catalogs, ambiguity and cleanup faults exercise rejection.
An original regular 256-sided prism exceeds the 256-face vertex capability
limit while retaining usable body geometry. This is no capacity benchmark.

`kernel.vertex-point-support.test.ts` checks fresh native point/tolerance
queries and failure/release handling. `kernel.vertex-engine.test.ts` exercises
the current engine's exact body/source/epoch routes; these are native engine
cases, not renderer interaction or a point-mate command.

`kernel.assembly-point-snapshot.test.ts` extrudes the original 4 by 6 by 4 mm
rectangle in both legacy and explicit-body documents. Two occurrences reuse
one native rebuild. A 90-degree Z rotation and translation `(10,20,30) mm`
give the independent world formula `(10-y,20+x,30+z)`. A nested local
translation `(2,0,0)` under a 90-degree Z parent at `(100,0,0)` gives
`(100-y,2+x,z)`, with retained placement magnitude 102 mm and depth two.
Current-document, source edit, suppression, revision, wrong purpose, copied,
foreign and disposed authority cases reject. A native-query/release fault closes
the snapshot. Reentrant disposal after a successful native measurement and
during plain-object proxy document validation cannot publish a point, assert
old point proof or return listing metadata. Inventory cardinality injection
checks exactly 65536 admitted
versus 65537 rejected before snapshot publication, then verifies the failed
engine no longer permits native inspection. It does not create 65536 independent
native vertices or establish memory/time capacity.

These original fixtures import no external models. Written cases and source
ownership reasoning are not execution receipts; see [VALIDATION](VALIDATION.md)
and the [vertex contract](ASSEMBLY_VERTEX_REFERENCES.md) for scope and limits.

## Original numerical symmetry solver cases

`src/model/assemblySymmetrySolver.test.ts` constructs original infinite
supports about the plane X=0. Source point `(-5,2,3)` reflects to target
`(5,2,3) mm`; source direction `(3/5,4/5,0)` reflects to
`(-3/5,4/5,0)`. Spheres and cylinders have radius 3 mm. An independent
Euclidean reflection, target projection and `atan2` angle check the accepted
poses without calling the residual helper. The regular all-free cases check
local rank 3 for point/sphere/plane and 4 for line/cylinder, then repair target
translation `(1,-0.4,0.7) mm`. These particular ranks are not global DOF claims.

All five families check actual left-retraction derivatives at `2e-6` and
`7e-7`, with error at most `7e-7*max(1,abs(finiteDifference))` per component.
An oblique source frame and three distinct owners, each shared-owner partition,
all-shared ownership and null source ownership exercise every free column.
Common six-axis gauge sums are checked separately. Other cases exercise a
mirror-only free owner, fixed consistency/conflict, actual local target
projection, and exact antipodal initialization through independent and shared
ownership partitions, including a free mirror with shared fixed entities.

The distant point case keeps local quarter/half-mm offsets at origin X=`1e16`
without adding that origin back into residual coordinates. Malformed roles,
radius mismatch, normalization underflow and huge cancellation reject atomic
pose publication. Tiny accepted `1e-9`-radian directional defects at scales
1 and 100 exercise regular-rank refinement. These are numerical fixtures;
there are no imported bodies, native witnesses, saved mates or editor actions.
Executed results and final-source acceptance belong in [VALIDATION](VALIDATION.md).

## Original numerical symmetry support cases

`src/model/assemblySymmetryGeometry.test.ts` contains original numerical
supports, not imported CAD files, saved mates, native faces or external
example models. The cases cover point, infinite line, plane, sphere and
cylinder reflection with all three owner roles. Sphere/cylinder radii are
explicit numerical data; a passing case authenticates no native surface.

The principal rational oracle uses mirror normal `(1,2,2)/3` and plane offset
7 mm, source point `(1,2,-1)` and target point `(6,12,10) mm`. Its literal
reflection matrix is
`[7,-4,-4; -4,1,-8; -4,-8,1]/9`, with translation `(14,28,28)/3 mm`.
The reflected source is `(5,10,7) mm`, so the target defect is `(1,2,3) mm`.
Conditioning origin `(1,-2,3) mm` and scale 2 mm give normalized reflection
`(2,6,2)`. Source +X reflects to `(7,-4,-4)/9`; target +Y yields aligned
chord `(-7,13,4)/9` and physical angle `atan2(sqrt(65),-4)` radians.
Opposed direction uses `(7,5,-4)/9` and `atan2(sqrt(65),4)`. These constants
come from the written reflection matrix, not the implementation under test.

Point/sphere position error is `sqrt(14) mm`, line/cylinder transverse error
`sqrt(10) mm`, and plane anchored error 2 mm. The original proper frame
quaternion `(1,2,2,4)/5` gives the literal normalized point defect
`(13/50,33/25,13/10)` and plane normal chord
`(149/225,343/225,-16/45)`. A common rigid gauge uses its independently
written rational matrix and translation `(7,-11,13) mm`, updating the attached
source frame too. Values are compared within `1e-11` by default, with
`2e-12` gauge and `2e-11` common-owner-null checks where stated in the file.

Analytic owner derivatives are compared with central differences under actual
left rigid retractions at `2e-6` and `7e-7`. All six columns are exercised
for three distinct owners, shared source/target, a fixed target and all three
roles sharing one owner, in every entity family. The source's oblique attached
frame moves with that owner. The stated derivative bound is
`5e-7 * max(1, largest absolute finite-difference component)`.

Mirror-plane tangential reparameterization preserves values and all three
formal derivative blocks away from the solution. Source-plane tangential and
source-line axial reparameterization is checked at matching directions; it
does not establish parameter invariance of an off-direction position chart.
Other cases distinguish explicit direction branches, radius compatibility,
admitted and excessive input uncertainty, malformed declarations and numerical
normalization limits. Already conditioned small offsets remain separate from
unrecoverable world-coordinate rounding. Execution results belong in
[VALIDATION](VALIDATION.md), not this fixture inventory.

## Original centered-width desktop fixture

`src/cad/fixtures/assembly-width-original.json` is an original project fixture,
constructed from one XY rectangle, 4 by 6 mm, extruded 4 mm as an explicit
body. Four occurrences share that embedded part and revision. Their X
translations are -6, +6, 0 and 0 mm; the first three are fixed. No mates are
preloaded. For the contact-stop follow-up, the fourth occurrence starts at
`(0,0,8) mm`, already centered; the other Z translations and all Y translations
are zero. The earlier authoring fixture started at X=3, Z=0 mm; native solve
cases retain that correction. Centering leaves tangential translations free,
so the contact fixture starts satisfied to define its independent gap. The
independent volume/area is 96 mm³ / 128 mm² per body, with
local bounds `[-2,-3,0]` to `[2,3,4]` mm, matching the native regression's
original prism. The fixture contains no external model or proprietary input.

The renderer case through source `4ca5503` uses dropdowns for signed X planes:
width X=-8/+8 and tab X=-2/+2 mm, with explicit difference/difference and
aligned bisectors. The viewport-selection follow-up uses the same document
and four positive-X faces, with independent plane positions `[-4,8,2,2] mm`.
Both explicit sum branches have bisector X=2 mm and retain the fourth owner's
X translation at zero. The two tab supports coincide as infinite planes but
belong to separate original faces and occurrences. This case establishes no
finite tab enclosure or material-side eligibility rule. Separate native cases
retain the mixed-sign/difference behavior.

The follow-up clicks all four faces through actual CDP mouse input in its
hidden test-owned Electron window. Target face interiors use original local
coordinates `(2,-2.4,2) mm`, original occurrence translations and the ordinary
isometric preset. The projection is independently calculated from that preset's
literal direction `(1,-1.3,1)`, source bounds and the actual canvas rectangle;
it reads or writes no camera object. Expected face identity is found by source
occurrence and signed native normal, never a retained face index. Each click
must select only its assigned role, preserve committed recovery and perform no
CAD operation. A same-face reselection during editing must additionally close
the armed picker, so unchanged dropdown text alone cannot imply a hit.

Four references and identity must survive preview/Apply, rejected and
cancelled edits, history and Save As/reopen. Pose checks use 1e-6 mm; the native
bisector-angle report uses 1e-8 rad. The scalar quaternion assertion is not a
full-body angular bound. Test-owned native dialogs and actual worker replies
are separate from human interaction or installed-package evidence. Optional
hidden captures are local artifacts. Execution results belong in the validation
record; the fixture and flow alone imply no pass. Hidden-window camera-orbit
preflights are separate failed experiments, not successful viewport coverage.

The contact-stop extension selects the fourth owner through its actual tree
control and requests absolute world target `(0,0,2) mm` with zero clearance.
After centering, its bottom is at Z=8 and the third body's top at Z=4 mm.
The literal gap `4-6f` and geometric contact fraction `2/3` are checked
separately from the actual worker distance, safety band and conservative
fraction. Only the contact Z reference uses `5e-6 mm` to account for the
stated numerical band; other pose checks retain `1e-6 mm`. A ready Cancel,
another ready preview, authenticated Apply and one exact Undo restore the
centered Z=8 document before the original edit/history/save/reopen sequence.
The renderer observes actual controls, worker results and file IPC; it
supplies no geometry, committed poses or native success responses.

## Scoped feature geometry contribution fixtures

The 22 cases declared in `src/cad/kernel.feature-patterns.test.ts` are original
inline fixtures authored for this project, in millimeters. They use Cartesian
rectangles/extrusions, cylindrical cuts, explicit planes and closed offsets.
Documents, native tools and probes are generated in memory from tracked source
and declared dependencies; no imported model or binary fixture supplies an
expected result. The formulas below are independent of contribution capture,
the pattern planner and replay. These descriptions record written assertions,
not executed passes; actual commands and outcomes belong in
[VALIDATION](VALIDATION.md).

The [scoped feature contract](FEATURE_PATTERNS.md) distinguishes exact
historical source contributions from current target references. The fixtures
allocate no new body IDs in a feature repetition. Only finally changed targets
advance to the pattern's state. Geometric result cases check per-body BRep
validity, closed shells and solid count, with absolute volume/area tolerance
`1e-5` in mm³/mm² and bounds
tolerance `1e-6` mm. Material probes are cubes of side 0.2 mm, with expected
intersection volume 0 or 0.008 mm³ at absolute tolerance `1e-7`. The explicit
empty-topology checks use `1e-10` volume comparisons; the topology and injected
failure cases have their own stated assertions. Each new native case and
initialization has a 60-second budget; a budget is not an accuracy guarantee or
a recorded result.

### Coincident owners and low-region hole copying

A and B are distinct coincident boxes
`[-50,50]×[-35,35]×[0,12]`, each V84000/A18080. Only A initially has an R3
through-cut centered at (20,20). Translation (-40,0,0), rotation +90° about Z,
and reflection in YZ each place one extra cut at (-20,20), in three separate
cases. For n disjoint radius-r through-holes,
`V=84000−12πr²n` and `A=18080+(24πr−2πr²)n`.
Thus A with two R3 holes has V84000−216π/A18080+108π, while B stays uncut.
A radius edit to 4 gives V84000−384π/A18080+128π. The linear case includes
serialization/reopening and undo/redo. Body references and serializable picking
data are checked separately from these geometric formulas.

Three further cases distinguish a copied *actual* hole contribution from
per-instance end-condition evaluation. The linear/mirror terrace is
`[0,30]×[0,10]×[0,4]` plus `[15,30]×[0,10]×[4,8]`, V1800/A1120.
The circular terrace is `[-20,20]²×[0,4]` plus `[0,20]²×[4,8]`,
V8000/A4160. An R1 through-all hole starts at z=0 in the +Z direction at
(5,5), or (10,-10) for circular, and actually removes only four millimeters
of material. Translation +20X, reflection across X15, or rotation +90°Z
moves that four-millimeter contribution into the tall region, at (25,5) or
(10,10). The two holes remove 8π volume and add 14π area: the original through
hole adds 6π and the copied blind cavity adds 8π. A regenerated through hole
would instead remove 12π total and add 20π area. Probes at z=6 require the
copied location to retain its roof. These cases specify geometry copying,
not implemented regeneration.

### Ordered mixed effects, equal-volume changes and one nested recipe

The ordered fixture begins with `[-16,16]²×[0,4]`, V4096/A2560.
R removes `[7,9]×[3,5]×[2,4]`; later F adds the same XY footprint over
z=3..6. Its final cell has a 2×2×1 enclosed cavity at z=2..3 and a 2×2×2
boss at z=4..6, changing volume by +4 and area by +32. Selecting R,F or F,R
must still replay the historical R→F order. The independent cell centers are:

| Repetition | Centers including the original | Final V/A |
| --- | --- | --- |
| Linear, two extra copies at −8X and −16X | (8,4), (0,4), (-8,4) | 4108 / 2656 |
| Circular, four equally spaced quarter turns | (8,4), (-4,8), (-8,-4), (4,-8) | 4112 / 2688 |
| YZ reflection | (8,4), (-8,4) | 4104 / 2624 |

All bounds remain x,y=[-16,16], z=[0,6], with one solid. Probes distinguish the
boss, enclosed cavity and restored z=3..4 material.

A separate three-case family has zero net volume change with different material
locations. The linear base is `[0,40]×[0,12]×[0,4]`, V1920/A1376.
A 2×2×4 boss over X4..6/Y5..7 adds 16 volume/+32 area; a through-notch over
X8..10/Y5..7 removes 16 volume/+24 area. One +20X copy gives V1920/A1488.
For circular/mirror cases the base is `[-20,20]²×[0,4]`, V6400/A3840;
the boss is X7..9/Y3..5/Z4..8 and the notch X7..9/Y7..9/Z0..4.
Four quarter-turn cells give V6400/A4064; two reflected cells give
V6400/A3952. All these bounds reach z=8. Positive boss and negative notch
probes ensure equal volume cannot be accepted as proof of no change.

The one nested fixture first copies R→F by +6Y, then mirrors *only that inner
pattern's net contribution* in YZ. Final centers are (8,4), (8,10), (-8,10):
V4108/A2656, with no boss at (-8,4). This is a bounded selected-scope
linear-then-mirror recipe, not evidence for every nested transform, owner,
scope, dependent-feature remapping or regenerated recipe.

### No-op scopes and late atomic rejection

The no-op fixture starts with `[0,20]×[0,10]×[0,4]`, V800/A640.
Two R1 through-cuts at (5,5) and (15,5) give V800−8π/A640+12π.
The selected distant body `[40,42]×[0,2]²` does not change; a separate last
producer creates `[50,51]×[0,1]²`. Both retain their earlier exact refs and
picking data. The latter producer is the pattern's aggregate predecessor,
separate from the historical cut source. A later reference to the distant
body's potential-but-unmaterialized pattern state must fail rather than use
its latest actual state.

The stepped rejection family starts from
`[0,14]×[0,4]×[0,2]` plus `[0,L]×[0,4]×[2,4]`.
Before a groove, V=112+8L and A=200+4L. With L=8, removing
X1..2/Y0..4/Z0..2 leaves V168/A244, still bridged above the groove.
Linear +4X and +8X copies first produce valid V160/A256, then sever the thin
tail at X9..10. The complete repetition must reject and retain V168/A244.

Reflection across X4 places the groove at X6..7. The L=8 owner remains bridged,
but a second L=4 owner (V144/A216) splits. The circular case rotates the
independent historical groove +90°Z into X-4..0/Y1..2/Z0..2. Its vertical
targets have L=8 (V176/A232) and L=0.5 (V116/A202); the latter splits.
Each case checks unchanged preceding targets and exact references after the
late failure, with failed-model export blocked.

### Combine, same-event ordering and empty intermediates

The subtractive Combine fixture uses A=`[0,20]×[0,4]²`, V320/A352, and a
consumed tool `[2,3]×[-1,5]×[0,2]`. Its actual removed target region ends at
Y4, giving V312/A364. Copying that contribution +6X gives V304/A376.
An independently owned `[8,9]×[4.25,4.75]×[0,2]` box, V1/A7, lies only
in the tool's overshoot and must remain unchanged. Tool consumption cannot
be replayed as additional negative material.

A direct native replay fixture supplies two owner records for the same event.
One changes `[0,1]×[0,2]²` to `[0,3]×[0,2]²` (added X1..3); the other
changes `[0,2]×[0,2]²` to `[0,1]×[0,2]²` (removed X1..2).
Both route a +10X copy into T=`[11,12]×[0,2]²`.
All event removals before all additions yield `[11,13]×[0,2]²`, V8/A24,
for either binding order. Applying the first owner's addition before the
second owner's removal would incorrectly leave X12..13, V4/A16.
The source records and expected box formulas are original; this isolated
event test does not claim a complete model-level mixed producer recipe.

A closed outward unit shell starts from a 10×6×4 box. Planar intersection
offsets give an outer 12×8×6 box, so the wall has
V=576−240=336 and A=432+248=680. Copying its signed contribution +20X into
the original box at X20..30 removes the entire target before adding the
wall. Final bounds are (19,-1,-1)..(31,7,5), with one solid and stable target
identity. Cavity and wall probes distinguish the two regions.

A separate actual-topology fixture subtracts a 2×2×2 box from itself and
compares that empty compound with a compound containing the box's z=0 face.
Both have zero measured volume; only the compound without topology is an
admissible empty intermediate. This is local replay policy. Failed/null
builders and final empty or multiple-solid owners are not accepted.

### Cache-publication failure and evidence limits

The twenty-second case cuts both coincident plate owners and requests both
exact output contributions, routed only to A. A finishes with two R3 holes;
B retains its single original hole and current reference. A selective failure
is then injected *after* the second staged cache insertion. The case requires
zero commits of the affected transaction, the original error as cause,
unchanged document bytes, blocked export and one release attempt for each
observed prior owner, candidate owner, captured delta and candidate aggregate.

The previous aggregate is not separately watched and the previous historical
contribution cache is empty in this fixture. Its disposal counts therefore do
not prove those additional paths or native leak freedom. It is causal failure
evidence, not a heap measurement.

### Owned history cleanup fixtures

Three original inline cases in
[`kernel.body-workflow.test.ts`](../src/cad/kernel.body-workflow.test.ts)
exercise the owned history lifecycle and an undeclared catalog repetition.
They reuse the project's boxes A=`[0,10]×[0,6]×[0,4]` and
B=`[20,30]×[0,6]×[0,4]`. Each starts at V240/A248. A +10X geometry copy
routed to its own current owner gives bounds X0..20 and X20..40 respectively,
each V480/A448 and one closed solid. These per-owner formulas are independent
of the replay; the compound's two owners must not be replaced by an inferred
physical union.

The first history contribution is captured and registered before the second
capture is instrumented. The second uses the real native validator and a
separate native copy. One case throws a capture error and then throws a release
error after actually deleting that copy; the other retains its valid copy
through real replay/commit and throws during final history cleanup. Assertions
require the original error objects in order, one observed copy-delete attempt,
one disposal per registered contribution, unchanged document bytes and blocked
export. The undeclared case requires unchanged preceding bodies and no legacy
aggregate history capture. These are distinct failure stages; no preassembled
aggregate error supplies an expected result.

The observations do not count every native wrapper or the previous aggregate,
measure a heap or establish general leak freedom. Like the other fixture
descriptions, they define assertions; recorded commands and outcomes belong in
[VALIDATION](VALIDATION.md).

These 22 feature-contribution definitions do not establish execution results, real editor
interaction, independent interoperability, general face/edge naming or native
coverage of every producer. Per-instance regeneration/varying sketches,
dynamic all-body scope, saved automatic scope, broader nested/dependent
recipes and ownership lifecycle work remain required by the full goal.

## Explicit body repetition fixtures

The inputs in `kernel.body-patterns.test.ts` are original inline Cartesian
fixtures, in millimeters. They use rectangles, extrusions and exact saved body
references; no imported private model, external application geometry or native
solid ordering supplies an expected result. The model/command tests use original
synthetic records and symbolic healthy-preview receipts, not native geometry.
The component tests are server-rendered controls, not real editor interaction.

For a box of side lengths x,y,z, V=xyz and A=2(xy+xz+yz). Seed A occupies
X1..3/Y2..5/Z0..4 (V24/A52); a targeted extension raises its current height to
Z6 (V36/A72). Seed B is X5..6/Y−7..−5/Z1..4 (V6/A22). Unselected U occupies
X30..35/Y−6..−4/Z1..4 (V30/A62). A 3×2 grid with X10/Y8 spacing, omitting (2,1),
creates four copies of each selected seed. The eight copies plus current A, B
and U have eleven solids: historical seed scope gives V192/A452; current scope
gives V240/A532. Both aggregates have bounds (1,−7,0) to (35,13,6). Per-copy
positions are written explicitly in the test, independently of the planner.

For circular copies, S is X4..6/Y1..4/Z0..2 (V12/A32), with axis Z through
(1,−2,0). Positive quarter turns give bounds (−5,1,0)..(−2,3,2),
(−4,−8,0)..(−2,−5,2), and (4,−7,0)..(7,−5,2). The seed and these three copies
have V48/A128. Adding U gives V78/A190 and five solids; reversing direction and
omitting index 2 gives V66/A158 and four solids. Reflection across X5 follows
x'=10−x, regardless of the plane normal sign: A maps to X7..9/Y2..5/Z0..4 and B
to X4..5/Y−7..−5/Z1..4. Seeds, copies and U give V90/A210 and five solids.

For new versus merge, S is X0..2/Y0..3/Z0..4 and T is X3..5/Y0..3/Z0..4,
each V24/A52. A copy translated X4 occupies X4..6 and remains V24/A52 when
separate; union with T is X3..6 (V36/A66). A face-tangent X5 copy gives the
target X3..7 (V48/A80). A second X8 copy is disconnected and must reject the
whole merge without changing T's original V24/A52. A different bridge fixture
uses unit seed X0..1 and target X3..4, both Y0..1/Z0..1: the first copy X1..2
is disconnected, the second X2..3 bridges it, and the final target is X1..4,
V3/A14. Circular 180-degree and principal-YZ mirror merge cases independently
produce a V36/A66 target; the seed and U remain unchanged.

Same-identity merge cases use current A at height 6 as the target and translate
its selected current or historical seed by X2. A current height-6 copy produces
a 4×3×6 box, V72/A108. A historical height-4 copy gives V36+24=60 and
A72+52−2*(3*4)=100, with bounds (1,2,0) to (5,5,6). With unchanged B and U the
aggregates are V108/A192 or V96/A184, respectively, each with three solids.
The output follows the current target's creation chain, not the copied snapshot.

A nested pattern selects only B's saved output X15..16/Y−7..−5/Z1..4 and copies
it by Y20 to X15..16/Y13..15/Z1..4. Cutting this output with a radius-1/4,
height-3 through-hole removes 3π/16 volume; two removed disks total π/8 area and
the cylindrical wall adds 3π/2, for net area +11π/8. The other five entries stay
unchanged. Coincident new-copy, consumed historical source, stale-current
rejection, skip/unskip, committed retirement, undo/redo and reopen cases use
the same original box records and persisted slot bindings.

Native validity, closed shells and exact solid counts are checked alongside
per-body volume/area (absolute tolerance 5e−6) and bounds (5e−7 mm). Mesh counts
and serializable picking metadata are separate checks. New native cases and
initialization use 60-second budgets. The new saved-ID-boundary stress case
also has a 60-second budget while checking all 65,536 IDs and one-over-limit
rejection; its initial default-5-second timeout remains in the validation record.
Existing test budgets are unchanged. STEP
export/reimport reconstructs the committed snapshot in the same kernel and
checks analytical geometry; it does not prove independent interoperability or
opaque-ID preservation. The [body-pattern contract](BODY_PATTERNS.md) separates
the independent identity design from observed feature behavior. Executed results
are recorded separately in [VALIDATION](VALIDATION.md).

## Explicit sweep and loft body fixtures

The inputs in `kernel.body-sweep-loft.test.ts` are original inline Cartesian
millimeter fixtures. A sweep translates an XY circular section along a
straight world-Z path saved in an XZ sketch. A loft uses two parallel XY
circles, explicit local seams, and `ruled:true`; no imported model or external
application supplies the geometry or expected values.

The first explicit producer creates an R2, height-4 cylinder at Z=0..4:
volume 16π mm³, area 24π mm² and bounds (-2,-2,0) to (2,2,4).
Editing the sweep's profile to R3 gives volume 36π and area 42π.
Editing only the loft's upper radius to R3 gives a height-4 conical frustum:
volume 76π/3 and area (13+5sqrt(17))π, with radial bounds ±3.
These follow V=πr²h, A=2πr(r+h), and the frustum formulas
V=πh(r0²+r0r1+r1²)/3 and
A=π(r0²+r1²)+π(r0+r1)sqrt(h²+(r1-r0)²).

The scoped workflow starts with cylinder A at Z=0..4 and an independent
10×6×4 box B from (20,0,0) to (30,6,4), of volume 240 and area 248.
An R2 producer at Z=4..8 touches A. New-body mode retains A, B and the new
cylinder as three entries, with aggregate volume 240+32π and area 248+48π.
Merge into A produces two entries with the same aggregate volume and bounds,
but area 248+40π. Solid count and exposed contact area therefore distinguish
explicit creation from an unintended fusion; aggregate volume alone cannot.

Changing the upper sweep profile to R3 makes A a stepped pair of cylinders:
volume 52π and area 58π, including the exposed radius-2-to-3 step at Z=4.
The corresponding loft edit makes A a lower R2 cylinder plus the R2-to-R3
frustum: volume 124π/3 and area (29+5sqrt(17))π. Both have bounds
(-3,-3,0) to (3,3,8). A radius-1 axial through cut, placed on A's saved
body-owned top face and scoped only to A, removes 8π and adds net 14π
of surface area. Distant B retains its reference, creating feature, geometry
and face/edge picking keys through these edits and document-history states.

Rejection cases select disconnected B while the tool actually touches A,
retain an obsolete A reference after an explicit height-6 modification,
retain a consumed A after a coaxial-cylinder union, and suppress either input
of each producer. The consuming union creates one R2, height-8 result with
volume 32π and area 40π; its new body identity must not replace a saved A
operand. These cases require atomic rejection and block export of the errored
document. Existing absent-field sweep/loft regressions retain the legacy
`merge` behavior; the new fixtures exercise explicit body operations.
At the worker/kernel boundary, raw features with contradictory `merge` and
`bodyOperation` fields, unknown modes, null/undefined operation values or an
array in place of the operation must also reject without passing through
document validation first. Structurally loadable, absent-field legacy sweep/loft records
must reject in an already active catalog for either merge flag, preserving the
previous body geometry and picking rather than inventing output ownership.

Two additional raw declaration matrices, one per producer, reuse the strict
body-operation guard shared with extrusion and revolution. Each submits 19
malformed own declarations, five declarations with inherited required fields
and two defined inherited `bodyOperation` values, without geometry inputs.
The `merge` flag is consistent with the supplied mode so it cannot mask an
invalid operation shape. These cases require the declaration error and an
empty result before input lookup; they are separate from the 20 geometric
and workflow cases above. Own properties, prototypes and inherited values
are checked separately because structured cloning drops prototypes. They do
not establish behavior for arbitrary getters, proxies or other exotic objects.

Native volume, area and bounds comparisons use absolute tolerance 5e-6;
planar picking-frame selection uses 5e-7. Display meshes are not precision
oracles. Fresh STEP imports check BRep validity, closed shells, solid count
and an unordered multiset of analytical per-solid metrics. That geometric
comparison does not assign or recover document IDs from STEP. Saved IDs,
exact body/source references, reopening and undo/redo are checked separately.
The STEP round trip uses the same kernel and does not establish independent
interoperability, real editor interaction or general sweep/loft naming.
Written fixtures are acceptance cases, not executed validation results.

## Raw body-operation boundary fixtures

`src/cad/kernel.body-operation-boundary.test.ts` uses original inline Cartesian
coordinates in millimeters. The baseline square is centered at `(0,0)` on XY
at z=-5 with width and height 10; an explicit depth-10 extrusion creates body A
with bounds `(-5,-5,-5)` to `(5,5,5)`, volume 1000 mm³ and area 600 mm².
The contained extrusion uses a centered 2×2 square at z=-1 and depth 2, giving
the cube `[-1,1]^3` (volume 8). The contained revolution rotates the XY
rectangle centered at `(1,0)`, width 2 and height 4, through 360° around the
local Y axis; its cylinder has radius 2, length 4, volume `16π`, and bounds
`(-2,-2,-2)` to `(2,2,2)`.

Raw `CadEngine.build` inputs intentionally bypass saved-document parsing.
Unknown modes must reject without advancing A's exact body/source reference;
valid merge controls keep A's analytical geometry and advance its source.
Rejection cases retain A's own face and edge picking descriptors and block
both STEP and STL export from the current errored engine state.
Each unknown-mode case also supplies that declaration through a prototype,
checks its defined inherited value separately from the feature's own properties,
and requires rejection with the same retained A state. This bounded case does
not establish behavior for arbitrary getters, proxies or exotic objects.
Malformed operation objects are also submitted without an available sketch to
check that declaration rejection precedes geometry construction. Separate
absence controls retain the legacy route. Native baseline/result checks use
BRep validity, one solid, adaptive volume, surface area and bounds with
absolute tolerance `5e-6`; legacy controls check result volume and bounds.
The file is authored for this project without external models or binaries.
These definitions describe test expectations, not an executed pass or general
platform coverage.

## Explicit body management fixtures

The original inputs in kernel.bodies.test.ts, kernel.body-workflow.test.ts and
model/bodyReferences.test.ts are authored Cartesian coordinates in millimeters,
not imported models. The body workflow uses A from (0,0,0) to (10,6,4) and B
from (5,0,0) to (15,6,4), or B translated to (20,0,0) for selective cutting.
The coordinates, analytical volume/area/bounds, shifted-B variants and proposed
identity/retention policies are recorded in [BODY_MANAGEMENT.md](BODY_MANAGEMENT.md).

Native comparisons use absolute tolerance 5e-6 for volume, area and bounds.
Face orientation/coordinate selection uses 5e-7; display meshes are not a native
precision oracle. A radius-1 through hole removes 4π mm³ and adds net 6π mm²
to each selected 10×6×4 body. A cut selecting distant B while the tool crosses A
must reject; checking aggregate mass alone would not establish target scope.
The extending-boss fixture uses a tool from (8,0,0) to (14,6,4), explicitly
merged into A. The result is a 14×6×4 box with volume 336 mm³ and area
328 mm²; with unchanged distant B the aggregate has volume 576 mm³ and area
576 mm². A disconnected tool from (40,0,0) to (50,6,4) must reject.
The geometric multi-body failure fixture processes A first and distant B
second with the same radius-1 tool: failure on B must retain both original
bodies, including A, and block export of the errored document.
The scoped chamfer selects the vertical A edge at X=10,Y=6,Z=0..4 and uses
equal face distances of 1 mm. It removes a right-triangular prism of volume
2 mm³; A's resulting surface area is 239+4sqrt(2) mm². Distant B is unchanged.
The radius-1 fillet of that same edge has volume 236+π mm³ and surface area
238+5π/2 mm². The inward thickness-1 shell removes the top face and leaves
an 8×4×3 cavity: A has volume 144 mm³ and surface area 320 mm².
For the four-wall 5-degree draft about the bottom XY plane, let t=tan(5°).
Its section is (10-2Zt)×(6-2Zt), so A's volume is 240-256t+(256/3)t² and
surface area 120-128t+64t²+(128-64t)/cos(5°). These cases retain A's original
bounds and distant B, and check their fresh committed STEP aggregate.
The new-body limit fixture uses overlapping A with Z=-4..10 and B with Z=0..4.
A radius-1 profile at (7,3,-2) references B explicitly: ThroughAll ends at
Z=4 (height 6), UntilNext at Z=0 (height 2). The tool's volume is hπ and
surface area (2h+2)π; retained A and B contribute 1080 mm³ and 816 mm².
Redirecting an earlier channel cut from A to B must not redirect a saved
body-limit reference with the same source feature ID.
The invalid two-solid replacement is constructed from clones transferred to
the compound builder. The original caller-owned candidates are measured
again after rejection; fixture preparation must not consume those originals.

The tests also exercise exact saved current-state references, retained operands,
historical per-body face support, document round trips, undo/redo, suppressed
supports, cleanup failure and a post-transfer metadata failure. Fault
injections test failure reporting, history-delta release and ownership after a state transfer; they
do not establish general leak freedom. Fresh STEP exports are reimported with the same
OpenCascade implementation. This checks the declared geometric cases, not
independent interoperability, parametric-history/ID transport through STEP or
complete multi-body CAD coverage. Written tests are not executed results; see
[VALIDATION.md](VALIDATION.md) for commands and source-specific outcomes.

The shared curved-limit regression in kernel.extrusion-limits.test.ts uses an
original radius-20, length-100 cylinder along Y, centered at X=0 and Z=30.
Its expected volume is 40000π mm³, surface area 4800π mm², and bounds
(-20,-50,10) to (20,50,50). A radius-5 circular tool starts at Z=0 and ends
on the cylinder's lower surface Z=30-sqrt(400-X²). The existing Simpson
quadrature oracle integrates that analytical height over the circular profile.
The success and injected post-Build failure cases check the original shared
target's mass, surface, bounds and topology identity; they do not prove general
absence of native mutation. Geometry and bounds comparisons use 5e-6.

Public regression inputs under `src/cad/fixtures/solidflow-ui/` are synthetic
SolidFlow documents and STEP exports made for this project. Its README records
the origin, original names, byte counts and SHA-256 hashes of each input. The
legacy angular document is a programmatic compatibility baseline; the STEP
files are saved UI exports. They are not interchangeable kinds of evidence.

The files under `examples/` are synthetic editable demonstrations, not customer
models. Do not add confidential designs, credentials, personal paths or vendor
binaries. New fixtures must identify how they were made and how a reviewer can
check them. Do not relabel third-party output as an original project output.

The generated-identity regressions author an open Cartesian corner from
`(0,0)` to `(10,0)` and `(0,10)`, with a construction mirror axis at x=20,
in millimeters. Offset, mirror, fillet and chamfer proposals use those inline
profiles; identity comparisons retain every geometry and constraint field and
replace only newly created IDs with test roles. A separate offset lifecycle
uses an anchored `(0,0)→(10,0)` source: right offsets at 2 and 3 mm have
independent expected endpoint heights y=-2 and y=-3. It exercises sketch
deletion/recreation, document serialization and the real document-history
class, without a CAD runtime or imported file. The allocator's injected UUID
is a synthetic identity fixture, not a credential or external model. Existing
saved CAD fixtures and their hashes are unchanged. See the
[identity contract](SKETCH_IDENTITY.md); these checks do not establish solid
face/edge continuity or real editor interaction.

The source factories under `src/examples/` generate synthetic documents from
the parameters in their code; they are separate from saved UI captures.
`sketch-fillet-prolongation.ts` defines an R10 line–arc gap and an R10/R10
two-arc gap, with fixed support geometry and rectangular closing edges. The
[fillet guide](SKETCH_FILLET.md) records the independent Cartesian contacts,
Green-integral area and perimeter formulas used to validate their R2 fillets
and 4 mm extrusions. Their tests generate documents in memory; no private model
or binary fixture is required.

`sketch-fillet-batch.ts` generates a 10×6 mm Cartesian rectangle with a 4 mm
extrusion, anchored at the sketch origin. It uses no imported geometry or
external fixture. The adjacent bottom corners are `origin` and `bottom-right`;
the adjacent left corners are `origin` and `top-left`. The
[fillet guide](SKETCH_FILLET.md) derives independent contacts, area and
perimeter by subtracting a square minus a quarter disk at each rounded corner.
The batch tests construct and reopen documents and STEP exports in memory;
these are programmatic checks, not saved UI captures.

`sketch-mirror.ts` authors an open Cartesian half-profile
`(0,0)→(5,0)→(5,6)→(0,6)` and a separate right semicircle of radius 5 mm.
Both have construction axes and original driving constraints, in millimeters.
The [mirror guide](SKETCH_MIRROR.md) gives independent rectangle, disk,
circular-hole and major-segment area/perimeter formulas for the 4 mm CAD
extrusions used in tests. These factories and in-memory document/STEP round
trips use no imported/private geometry or new binary fixtures. They are
programmatic examples, not saved interaction captures.

The ten files under `src/cad/fixtures/step-import/` are original synthetic
STEP regression inputs generated by
[`scripts/generate-step-fixtures.mjs`](../scripts/generate-step-fixtures.mjs).
Run `node scripts/generate-step-fixtures.mjs` with the locked dependencies to
generate them. The adjacent [manifest](../src/cad/fixtures/step-import/manifest.json)
records each file's byte count, SHA-256, producer, source units, parameters and
expected result. File headers use fixed project metadata and a fixed timestamp;
they contain no machine paths or personal author information.

Six accepted inputs describe a 10×6×4 mm box, translated and rotated boxes,
a radius-3 height-8 mm cylinder, a 1×0.5×0.25 inch box and a
0.01×0.006×0.004 metre box. Four rejection inputs contain an open shell,
two solids, one solid with a free edge, and an authored truncated header.
The generator and consumer both use the project's OpenCascade runtime;
these inputs are not independent-producer or saved UI evidence. The
expectations come from analytical geometry, not from reading back the fixture.

The [STEP import contract](STEP_IMPORT.md) records the independent mass,
surface-area and placement expectations, including subsequent hole edits.
CAD assertions use absolute `5e-6` for mass, area and bounds in their respective
units; coordinate-based selected-edge checks use `5e-7` mm. Tests check fixture
hashes, BRep validity, a single closed solid, saved-document reconstruction,
stable references and programmatic STEP export/reimport. No private models,
external application or untracked research input is needed by the public suite.

`sketch-offset.ts` authors an origin-anchored 10×6 rectangle, a radius-3 circle
and an L polygon with vertices `(0,0),(10,0),(10,4),(4,4),(4,10),(0,10)`.
Its original dimensions and coordinates are in millimeters; no offset is
pre-applied. The [offset guide](SKETCH_OFFSET.md) derives areas and perimeters
from rectangles, circles and the polygon shoelace formula. Tests construct
offsets, extrusions, documents and STEP exports in memory using tracked
source and declared dependencies. These are original synthetic examples,
not imported models or saved UI captures. Their analytical expectations
are independent of the planner and kernel reconstruction.

The offset continuation regressions author a horizontal line from `(0,0)` to
`(10,0)`, an uncapped right offset at 2 mm, and a second pair at 1 mm with
straight end caps. Only the final 10×2 rectangle contributes material. At a
4 mm extrusion depth, independently `V=8L` and `A=12L+16`: length 10 gives
`V=80 mm³`, `A=136 mm²`; length 12 gives `V=96 mm³`, `A=160 mm²`.
These profiles and their STEP round trips are generated in memory from public
source. No external model or new binary fixture is used. Endpoint alignment
is checked with explicit Cartesian coordinates and dimensional targets.

The no-dimension following regressions reuse an authored `(0,0)→(10,0)`
source and a right offset at 2 mm, with two capped 1 mm descendants. At depth
4 mm the material is a length-L, width-2 rectangular prism, independently
`V=8L` and `A=12L+16`. Untouched source continuation to 14 gives `V=112`,
`A=184`; an end released at x=12 retains `V=96`, `A=160`; a released start
at x=-2 and an untouched end following to 14 give `V=128`, `A=208`.
Station coordinates, explicit targets and relative separations use `5e-7`
mm. The free normal translation is taken from the realized solved profile;
it is not required to retain its nominal seed. CAD mass, area and bounds use
absolute `5e-6` in their respective units. Point-reposition fixtures also use an
original R10 circle centered at `(0,0)`: requesting X=8 permits Y=6, while
fixing both X=8 and Y=8 conflicts with the circle. No saved interaction,
private input or new binary fixture is involved in these tests.

The disconnected-offset fixtures in
`src/cad/kernel.offset-disconnected.test.ts` are original in-memory Cartesian
geometry authored for this project. They construct a fixed 50×20 rectangle
from `(-10,-10)` to `(40,10)` and source circles at `(0,0)` and `(20,0)`.
Source radii 3 and 5 with outward distance 2 create hole radii 5 and 7 after
the originals become construction geometry. A second pair, radii 2 and 5,
checks distance 1→1.5, a source-radius edit to 2.25, and shared separation
when a distance dimension is absent, driven or deleted. A new image-radius
target of 4 makes the second hole radius 7. At 4 mm thickness the independently
derived formulas are `S=1000−π(rA²+rB²)`, `P=140+2π(rA+rB)`, `V=4S`
and `A=2S+4P`. Coordinates/radii use absolute `5e-7` mm; CAD volume, area
and bounds use absolute `5e-6` in their respective units. A distance edit to
6 creates a hole intersecting the plate boundary and checks rejection of
global material and stale export. All documents and STEP bytes are generated
from tracked source and declared dependencies. The STEP writer and reader
share OCCT; these are programmatic checks, not independent interoperability
or saved editor-interaction captures. No external input or binary fixture is
introduced.

The same plate checks an R1 outer-corner fillet: it removes one
square-minus-quarter-disk prism, changing volume by `−4+π` mm³ and surface
area by `−10+2.5π` mm². This outer selection is tested through common-distance
and source-radius edits. A separate R0.25 hole-rim fillet checks that an obsolete
curved-edge key rejects after resizing the hole. Only the unchanged outer
boundary is expected to retain its keys across those edits; unchanged-document
reopening checks the complete face/edge catalogs. No general naming claim is
inferred.

The distance-family core fixtures in
`src/sketch/offset.distance-family.test.ts` are also original inline geometry:
circles of radii 2, 7 and 15 at `(0,0)`, `(50,0)` and `(100,0)`, whose
image radii are independently `R+d`; and two lines `(0,0)→(10,0)` and
`(30,5)→(20,5)`. Their stored directions are opposite. A shared right
separation 3 therefore gives image y=-3 and y=8. The batch-planner fixtures
in `src/sketch/offset.batch.test.ts` include an authored line
`(0,-2)→(6,-2)`, a counterclockwise semicircle centered at `(6,0)` ending
at `(6,2)`, and a separate R3 circle centered at `(20,0)`. Right distance
1 gives line y=-3, arc radius 3 and circle radius 4. Expected coordinates
and radii use Cartesian arithmetic rather than the planner. These sources
exercise shared equations, explicit point repositioning, construction flags,
parsing, capacity rejection and document/history cleanup. Cleanup and driven
mobility are explicit local policies; these synthetic fixtures do not claim
another application's solver or lifecycle behavior.

The experimental semantic-reference regressions are authored inline in
`src/cad/kernel.provenance.test.ts`,
`src/cad/kernel.semantic-references.test.ts` and
`src/cad/kernel.semantic-catalogs.test.ts`. They use original Cartesian
coordinates in millimeters and symbolic identity inputs, with no imported
model, saved interaction capture or new binary fixture. The
[semantic-reference contract](SEMANTIC_REFERENCES.md) separates the verified
primitive roles, compatibility policy and remaining integration evidence.

The producer tests construct a 50×20 rectangle from `(-10,-10)` to `(40,10)`,
with circular holes centered at `(0,0)` and `(20,0)` and extrusion depth 4.
Their radius pairs are authored arithmetically as `R+d`: source radii 2 and 5
with distance 1 or 1.5, then source radii 2.25 and 5 with distance 1.5.
These inputs do not themselves invoke an offset planner or establish shared
solver behavior. Separate cases exchange radii `3,6` to `6,3`, and extrude
the `3,6` pair to depth −4. Independent expectations are
`S=1000−π(rA²+rB²)`, `P=140+2π(rA+rB)`, `V=|depth|S` and
`A=2S+|depth|P`. Written BRep/solid-count assertions accompany absolute
`5e-6` volume, area and bounding-coordinate tolerances in their respective
units. Hole-target bounds use `5e-6` mm; cap-origin and support-frame parity
assertions use `5e-7` mm for positions and `5e-7` for direction components.

A placed producer case supplies origin `(7,-4,9)`, local X direction
`(0,1,0)` and normal `(0,0,1)`, with radii `3,6` and `3.5,6.5`.
That explicit frame overrides the nominal principal-plane offset 100.
The authored world bounds are `(-3,-14,9)` to `(17,36,13)`; support origins
are the world origin projected onto the cap planes, `(0,0,9)` and `(0,0,13)`.
A D-shaped-hole case replaces the radius-3 circle under the same entity ID
with a counterclockwise upper semicircle from `(3,0)` to `(-3,0)` and its
closing diameter. With the other radius-6 hole, the independent expected
volume is `4(1000−4.5π−36π)` mm³, checked at absolute `5e-6` alongside BRep
validity. This case does not assert a D-shaped-hole surface-area oracle.

The native catalog tests reuse the 50×20×4 plate with initial radii `3,6`.
Edits use `(rA,rB,centerAX)` values `(3.5,6.5,0)`, `(7,2,0)` and
`(3.5,6.5,-1)`, retaining the second center at `(20,0)`. Circular rim bounds
use absolute `5e-7` mm; cap origin `(0,0,4)` and normal `(0,0,1)` use exact
tuple assertions. These cases specify versioned resolution, legacy aliases,
duplicate-selection rejection, replaced-source rejection and copied
historical frames. Injected history/release errors exercise wrapper ownership
paths; disposal call counts are not proof of native leak freedom.

The pure identity tests start from the same rectangle with radii `3,5` and
include an affine edit `x→2x+123`, `y→3y−57`: the resulting 100×60 rectangle
contains holes of radii `16,14`, reversing their size order. Other inline
inputs cover source types, connectivity, explicit coincident relations,
history, offset branches and symbolic split/merge ambiguity. SHA-256
expectations use a separately written canonical payload and Node's crypto
implementation. Symbolic target tokens and structural validation establish
neither native correspondence, geometric nesting nor BRep validity.

The separate `src/cad/kernel.semantic-catalogs.limits.test.ts` uses synthetic
targets whose `isSame` compares object identity. Its four cases specify the
existing document-selection limits: 257 distinct edges are accepted, 4097
edges are rejected, 256 faces are accepted and 257 faces are rejected. These
are API compatibility fixtures, with no native shapes, coordinates or WASM
initialization, and provide no geometric evidence.

These regression files are programmatic definitions, not execution
results or independent-kernel interoperability evidence. The native cases
use the project's locked OCCT runtime. Engine/parser/UI integration and
downstream reconstruction have their own regression definitions and validation
requirements; no pass is inferred from these fixture descriptions.

The integration's `src/cad/kernel.semantic-context.test.ts` is pure input
validation using an original unit square with four saved corner and line IDs.
It includes 1,000 unrelated reference planes, dependency chains with 254 or
255 planes, continuous placement/depth edits and discrete orientation branches.
These inputs test the relevant history closure, not native geometry or support
for a document beyond its existing feature limit. The model tests in
`src/model/document.semantic-references.test.ts` use an original 10×6 sketch,
a depth-4 extrusion and literal symbolic keys. They exercise parsing, exact
selection bounds and detached history without asserting CAD validity.
`src/cad/selection.references.test.ts` uses plain symbolic picking entries,
including duplicate aliases. Those definitions test directional matching and
selection state, not rendered geometry, pointer interaction or native identity.

The original `src/cad/kernel.semantic-face-operations.test.ts` fixtures are in
millimeters. An open-top inward shell starts from `[0,w]×[0,6]×[0,4]`, with
`w=10` then `12` and thickness 1. Independent cavity subtraction gives
`V=24w−12(w−2)` and summing exterior, interior and lip faces gives
`A=12w+8(w+6)+6(w+2)`. Bounds remain `(0,0,0)` to `(w,6,4)`.

The face-operation plate uses the earlier 50×20×4 boundary and hole pairs
`(rA,rB)=(3,6),(3.5,6.5),(6,3)`; center A moves from `(0,0)` to `(-1,0)`
while B remains `(20,0)`. Only hole A is tapered by 5 degrees from the
principal XY plane at z=0. With `rEnd=rA+4tan(5°)`, independent frustum
subtraction gives `V=4000−(4π/3)(rA²+rA*rEnd+rEnd²)−4πrB²`. The surface
expectation is `A=2000−π(rA²+rEnd²+2rB²)+560`
`+π(rA+rEnd)hypot(4,rEnd−rA)+8πrB`. Written native assertions check valid
BRep, one solid and absolute `5e-6` volume/area/bounding-coordinate errors.
Further cases use the same box/plate for legacy compatibility, unavailable or
foreign references, native alias duplicates and injected construction/release
failures. They specify ownership behavior rather than proving leak freedom.

The original `src/cad/kernel.semantic-engine.test.ts` defines 14 engine cases;
these are written assertions, with no execution result inferred here. Its base
fixture is the 50×20 rectangle from `(-10,-10)` to `(40,10)`, extruded from
z=0 to z=4. Source circles are centered at `(0,0)` and `(20,0)`, initially
with radii 2 and 5. Unlike the producer-only inputs above, this fixture invokes
`planSketchOffset` and `solveOffsetApplication`: outward distance 1, chain
selection enabled, one side, no caps, source construction geometry and added
dimensions. The resulting two material circles have radii 3 and 6, with two
offset relations, one shared-distance family and one driving distance. The
four rectangle corners and both source centers are fixed, with driving source
radius dimensions. Center A is its own saved point, initially at `(0,0)`;
editing it does not move the immutable sketch origin.

The successive `(distance,sourceRadiusA,sourceRadiusB,centerAX,centerBX)` inputs
are `(1,2,5,0,20)`, `(1.5,2,5,0,20)`, `(1.5,2.25,5,0,20)`,
`(1.5,2.25,5,-1,21)` and `(1,6,1,-1,20)`. Both centers retain y=0.
Expected image radii are independently
`rA=sourceRadiusA+distance` and `rB=sourceRadiusB+distance`; the last edit
exchanges their size order to `7,2`. These are edits of the original saved
entities and relations, without replanning or allocating replacement IDs.
For `S=1000−π(rA²+rB²)` and `P=140+2π(rA+rB)`, the solid expectations are
`V=4S` mm³ and `A=2S+4P` mm². Overall bounds remain `(-10,-10,0)` to
`(40,10,4)`.

The selected end rim of hole A is identified by current display coordinates
on `(x−centerAX)²+y²=rA²`, z=4; the second end rim is checked against
`(x−centerBX)²+y²=rB²`, z=4. Their analytical extents are
`(centerAX−rA,-rA,4)` to `(centerAX+rA,rA,4)` and
`(centerBX−rB,-rB,4)` to `(centerBX+rB,rB,4)`. The written engine assertions
check radial distance and z. The installed Replicad 1.1.0 edge mesh extractor
reads its native line buffer through `Float32Array`; the display comparison
therefore adds a per-coordinate half-ULP rounding bound, combined in XY with
the Euclidean norm. It is not an exact native-coordinate oracle. Fresh STEP
checks in the continuity and command-recreation cases separately enumerate
closed native circles and evaluate eight curve parameters `i/8`, `i=0..7`,
requiring exactly one rim per expected center/radius/z at absolute `5e-7` mm
radial and z error. Edges, curves and evaluated vectors have explicit local
ownership. The end-cap support frame is exactly origin `(0,0,4)`,
X direction `(1,0,0)` and normal `(0,0,1)`; its analytical outer bounds are
`(-10,-10,4)` to `(40,10,4)`. The cap check uses that frame, stable reference
and overall solid bounds, not a separate cap-mesh extent oracle. Catalog
assertions expect eight primary v2 faces and 18 edges: 12 primary v2 rims
with legacy aliases and six unclaimed legacy vertical/seam edges. Saved
references and all sketch point/entity/constraint IDs are checked through
serialization, reopening, undo and redo.

Two further cases create an active selected hole-A top-rim fillet or chamfer
once, of size `q=0.25`, then retain that exact saved reference through the same
five parameter sets. Each edited document is serialized and reopened with the
finish active; undo and redo also reconstruct and export the active finish,
checking both states against their complete volume, area and bounds oracles.
Independent revolution of the
removed section gives chamfer volume removal
`π(rA*q²+q³/3)` and surface change
`π[(2√2−4)rA*q+(√2−1)q²]`. For the fillet the removed cross-sectional area
is `q²(1−π/4)` and its radial first moment is `q³(5/6−π/4)`. Consequently,
the removed volume is
`π[rA*q²(2−π/2)+q³(5/3−π/2)]`, including the exterior factor π; the surface
change is `(π²−4π)rA*q+(π²−3π)q²`. Bounds remain those of the unmodified
plate. These volume and area oracles are measured on freshly reconstructed
STEP BReps, rather than inferred from the result's mesh or volume field.

The historical-support case places a 4×4 boss centered at `(30,0)` on the
original cap z=4 and extrudes it to z=8. A radius-1 cut starts on the principal
XY plane at z=8 and uses negative direction with `upToSurface` targeting the
saved original cap reference. Independent expectations are
`V=4S+64−4π`, `A=2S+4P+64+8π`, and bounds `(-10,-10,0)` to `(40,10,8)`.
It checks the initial, source-radius-edited, both-centers-moved and
radius-order-exchanged inputs, including document/history reconstruction.
Undo returns to the moved-centers state and redo restores the exchanged-radii
state; both rebuild and fresh STEP checks use full volume, area and bounds
oracles. The resulting Boolean body must
use its own legacy picking identity, without inheriting prism v2 metadata.

Discrete-change cases keep valid bare geometry while rejecting the old rim:
depth −4 has z bounds `[-4,0]`, symmetric depth 4 has bounds `[-2,2]`, an
identical recreated circle has a new saved entity ID, and a circle is replaced
by a counterclockwise upper semicircle `(3,0)→(-3,0)` plus its diameter.
For that D-shaped hole, with the other radius-6 hole, independent section and
perimeter are `S=1000−π(9/2+36)` and `P=140+3π+6+12π`; expected volume and
area are `4S` and `2S+4P`, with unchanged plate bounds. Further cases specify
suppression, size-zero finish rejection with retained valid prism picking,
a thrown primitive `Shape` read without legacy reconstruction, and a thrown
`Generated` read that preserves valid legacy geometry but rejects stored v2.

The final case uses two separate radius-1 disks centered at `(0,0)` and
`(5,0)`, each extruded 4 mm. It expects legacy references, two valid solids,
`V=8π`, `A=20π`, bounds `(-1,-1,0)` to `(6,1,4)`, and the explicit warning
`La pieza contiene 2 sólidos separados.` This is not a single-solid import
fixture.

An additional command-lifecycle case starts from the two actual offset images,
stores inactive hole-A rim and cap references, deletes image A with
`removeSelection`, and recreates it from source circle A using
`planSketchOffset` and `solveOffsetApplication` at distance 1.5. It checks that
the old image ID disappears, the recreated image receives a different ID, and
image B retains its identity. Deletion removes the shared-distance family and
the former A driver; recreation adds only a new A distance driver 1.5. B keeps
its undriven offset relation and its current separation 1, checked by geometry.
Thus this case changes
both identity and constraint structure, rather than isolating identity alone.
The earlier same-geometry/new-ID case remains that separate control. New hole
radii are 3.5 and 6 at centers `(0,0)` and `(20,0)`, giving independent
`V=4000−193π`, `A=2560−20.5π`, and the unchanged outer bounds. The old rim
finish and old cap support are activated separately and must reject while
preserving the last valid body and blocking export of the errored model. The
valid recreated document is reopened and freshly reconstructed through STEP.

Written sketch coordinate/radius and native rim checks use absolute `5e-7` mm;
displayed rim coordinates additionally allow the stated Float32 rounding bound. Solved
sketches require maximum residual at most `1e-7`. CAD volume, area and bounds
comparisons use absolute `5e-6` in their respective units. Fresh STEP checks
request native volume integration parameter `1e-10`, BRep validity and the
declared solid count; that parameter is not a general accuracy guarantee.
The writer and reader share the project's OCCT runtime. These definitions
establish neither an executed pass, independent interoperability nor platform
support, and consume no external models, private artifacts or binary fixtures.

## Explicit-frame recipe primitive fixtures

The fixtures in [kernel.recipe-primitives.test.ts](../src/cad/kernel.recipe-primitives.test.ts)
are original Cartesian boxes, circles, cylinders and explicit frame transforms
authored for the [primitive construction proposal](FEATURE_REGENERATION.md).
They use no external models or binary fixtures. Expected geometry is not
rebuilt through the builder or termination helper under test. The definitions
below describe 17 written cases, not an executed result; source-specific
results and limitations belong in [VALIDATION](VALIDATION.md).

The three transformation cases start from a box `[0,10]²×[0,4]` and a radius-1
ThroughAll cut centered at `(5,5)`, with physical direction +Z. Its source result
has `V=400−4π`, `A=360+6π`. The current destination is height 8. Regeneration
must give `V=800−8π`, `A=520+14π`, whereas an independent blind 4-unit cylinder
control gives `V=800−4π`, `A=520+8π`. In the latter pocket, one removed exterior
disk and one new interior disk cancel; the 8π area increment is its cylinder
wall. A 0.2-edge probe centered at destination z=6 distinguishes the results.
The shallow cylinder is a control, not an implementation of delta copying.

The explicit destination frames are: translation +20X, with origin `(20,0,0)`,
X=+X and N=+Z; reflection in X=15, with origin `(30,0,0)`, X=−X, signed N=−Z
and signed depth −1; and a half-turn about Z through `(15,0,0)`, with origin
`(30,0,0)`, X=−X and N=+Z. Translation/reflection destinations are
`[20,30]×[0,10]×[0,8]` and probe `(25,5,6)`; the rotated destination is
`[20,30]×[−10,0]×[0,8]` and probe `(25,−5,6)`. These frames test the native
input convention, not a complete transform/recipe integration.

Four blind cases use origin `(7,11,13)`, local X=world Y, normal=world X,
rectangle center `(2,3)`, width 4, height 6 and depth ±5, with/without symmetry.
World profile center is `(7,13,16)`, `V=120`, `A=148`, Y bounds `[11,15]` and
Z bounds `[13,19]`. Non-symmetric X bounds are `[7,12]` or `[2,7]`; symmetric
bounds are `[4.5,9.5]` for either sign. These coordinates expose a duplicated
center/offset or an incorrect signed start.

Two owner cases separately provide `[0,10]²×[0,h]`, h=4 or 8, while an unrelated
height-40 box exists elsewhere. After the radius-1 cut the result is
`V=100h−hπ`, `A=200+40h+(2h−2)π`; the unrelated box stays `V=4000,A=1800`.
Two direction cases use `[0,10]²×[−3,5]` and the same profile at z=0. A one-sided
pocket has `V=800−5π,A=520+10π` and retains material at `(5,5,−2)`; the
both-sided hole has `V=800−8π,A=520+14π` and removes it. Both remove `(5,5,4)`.

UntilNext cutting on the height-8 box must produce the radius-1 tool from z=0
to 8, `V=8π,A=18π`. Additive UntilNext against `[0,10]²×[4,8]` instead stops at
entry z=4: tool `V=4π,A=10π`, fused body `V=400+4π,A=360+8π`, bounds z=`[0,8]`.
UpToSurface uses `[0,4]²×[2,10]`, radius .5 at `(2,2)`, start frame z=2 and an
explicit plane z=6: tool `V=π,A=4.5π`, cut body `V=128−π,A=160+4π`. This plane
fixture does not attest a saved face reference's owner or correspondence.

The additive ThroughAll fixture subtracts enclosed `[2,8]²×[2,6]` from
`[0,10]²×[0,8]`, giving a closed hollow solid `V=656,A=688`. The radius-1 tool
must end at actual exit z=8, with `V=8π,A=18π`, rather than a cutting margin.
Filling the cavity's four-unit cylindrical segment gives `V=656+4π,A=688+6π`:
the new interior wall contributes 8π and the two removed interior disks 2π.

A first-validator failure case throws a synthetic primary on an actual blind tool
and makes only that received native handle's delete throw after release. It
requires one attempt, both errors and the retained primary cause. It patches
no global/prototype. It does not exercise hidden helper allocations, Sketch
child-release failures, native OOM or complete allocation safety. Existing SDK
and termination-helper internal cleanup limits remain explicit in the contract.

Proposed absolute tolerances are `1e-5` for volume/area, `1e-6` for bounds and
`1e-7` for probe intersection volume (full cube 0.008). Nonempty tools/results
must pass real BRep validity, one closed solid, positive finite volume and
finite bounds. These numerical checks do not establish exported-file fidelity,
interactive picking, saved owner/reference lifecycle or platform support.

The two supplied-owner fixtures also inspect the actual radius-1 cutting tool:
for h=4/8 and physical +Z, its one-unit enclosure margin ends at z=5/9,
with volume `(h+1)π`, area `2(h+2)π` and bounds `(4,4,0)..(6,6,h+1)`.
This distinguishes an overlong tool calculated from the unrelated height-40
owner; it does not attest a complete evaluator's owner lookup. A separate
seventeenth written case reaches the final validator after ThroughAll returns
its actual native tool. Both callback stages first pass the real validator;
the second then injects the primary, and that result's native handle is
actually deleted before injecting the secondary cleanup error. The case
requires ordered exact error identities, one delete attempt, no escaped result
and an unchanged valid target. These are authored acceptance checks until
source-specific execution is recorded in VALIDATION.

## Feature recipe declaration fixtures

The four inline suites `src/model/featureRecipes.test.ts`,
`featureRecipes.inputs.test.ts`, `featureRecipes.boundaries.test.ts` and
`featureRecipes.regression.test.ts` define 51 original synthetic pure cases
(24+4+3+20). Their code and numerical/symbolic inputs were authored for this
project under its license. They contain no imported CAD model, external asset,
binary fixture or reference-application measurement. Generation is the literal
inline feature/request definitions, ordinary JavaScript objects and arrays,
and explicitly bounded string repetition in the tests.

The closure fixture declares a 10×10 rectangle centered at(5,5) on XY at z0,
an explicit source extrusion of depth 4, and a circle of radius1 centered at(5,5)
for a source cut. A target rectangle is centered at(25,5), with the same sides
and depth. A translation of 20 along X maps the source coordinates to that
target. These are declarations only: no native extrusion/cut is performed by
the tests. A coincident second source owner has a different symbolic body ID;
its exact state must remain distinct. Other cases add an earlier2×2 boss
declaration, unrelated sketches, late planes, suppressed ancestry and alternate
target routes to distinguish dependency closure from replay and native state
availability. Potential output references are not measured solids.

Frame expectations come from Cartesian reflection/rotation, independently of
the helper under test. Reflection in YZ maps origin(3,2,1) to(−3,2,1), local
X to−X and, with sketch parity, normal to−Z; depth 4 becomes−4 while the
physical extrusion ray stays+Z. Local point(2,4) therefore maps from(5,6,1)
to(−5,6,1). A positive quarter turn around(2,3,0) maps(5,3,0) to(2,6,0).
A 450-degree Z rotation around(2,3,4) maps(4,3,5) to(2,5,5) and direction
(2,0,1) to(0,2,1), while retaining the saved transform rather than changing
its declaration. Axis-aligned expectations are exact where stated; rotation
scalars use `toBeCloseTo(...,12)`. These numerical tolerances do not apply to
unexecuted BReps.

Input-envelope cases use an oversized property name, twenty 60,000-character
property names, combined 600,000-character keys/values, escaped null characters
and surrogate-pair keys. The bound counts UTF-16 code units. Other inputs use
`Number.MAX_VALUE`, ordinary descriptor getters, hidden/symbol fields,
array subclasses and explicit missing/stale instance parent-route selectors.
Expected results are rejection codes/error types or preserved exact data,
never an expected shape generated by another CAD operation. Getter counters
check that rejection precedes invoking an accessor. Successful expected
rejections do not establish geometric or native availability.

This fixture family supplies no native solids, volumes, areas, bounds, export
or application-interaction evidence. It documents the declaration/frame layer
in [FEATURE_RECIPES](FEATURE_RECIPES.md); the full per-instance evaluator,
end-condition and ownership/persistence matrix remains required. Execution
claims belong to the actual source-specific validation record, separately from
the fixture descriptions.

## Recipe bridge and native ownership fixtures

The additional recipe/ownership fixtures are original synthetic constructions
and causal failures authored for the [native recipe bridge](FEATURE_REGENERATION.md#per-instance-native-recipe-bridge).
They use no external models. Their written count is 24: ten ownership-protocol
cases, eight native bridge cases, four native helper failure cases and two
native engine-boundary cases. These are separate from the earlier 51 pure
declaration cases and 17 primitive cases. Written definitions do not establish
an execution result; actual source-specific checks belong in [VALIDATION](VALIDATION.md).

The three transformed bridge cases extract a recipe from a source declaration
`[0,10]²×[0,4]` with a radius-1 ThroughAll cut centered at `(5,5)`. They construct
the current height-8 target independently with native `makeBox`. Translation
+20X, half-turn about Z through `(15,0,0)` and reflection in X=15 use canonical
addresses `1,0`, `1` and `mirror`. Translation/reflection target bounds are
`(20,0,0)..(30,10,8)`; the rotated target is `(20,−10,0)..(30,0,8)`.
The actual cutting tool has current-owner height 8 plus one-unit enclosure
margin: `V=9π`, `A=20π`, bounds `(24,4,0)..(26,6,9)` or the corresponding
Y interval `[−6,−4]`. The cut result is `V=800−8π,A=520+14π`. The material probe
at `(25,5,6)` or `(25,−5,6)` has zero overlap. These cases exercise model frame
resolution and native construction, not a complete catalog's historical source
attestation or a saved false-mode document.

A blind merge case uses a 2×2 profile at z=4, centered `(5,5)`, depth 2 and
translation +20X. Its actual tool has `V=8,A=24`, bounds `(24,4,4)..(26,6,6)`;
merging into `[20,30]×[0,10]×[0,4]` gives `V=408,A=376`, bounds z=`[0,6]`.
No fake intrinsic support or saved datum is introduced. Three rejection cases
retain inactive-address, unbound-target and pending UntilNext boundaries before
the validator is called. The eighth case injects a validator primary and an
owned native-handle release error, retaining both and their identity through
the bridge while the borrowed current target stays healthy.

Bridge volume/area tolerance is absolute `1e-5`, bounds `1e-6`, and probe
intersection volume `1e-7` for a cube of volume 0.008. Nonempty tools and bodies
must pass real native BRep validity, one closed solid, positive finite volume
and finite bounds. Expected metrics use Cartesian box/cylinder formulas;
expected geometry is never constructed through the helper under test.

The ten [ownership protocol cases](../src/cad/kernel.native-ownership.test.ts)
use original JavaScript owners and error sentinels. They require delayed result
transfer, reverse cleanup without early stopping, exact primary identity,
result release after sibling failure, earlier acquisition cleanup, no repeated
delete, rejection of unowned/released transfer, nested failure propagation,
duplicate handles, and registration failure both after insertion and before
insertion with a duplicate and a later owner. Registration faults replace only
one scope's Map instance method; no global/prototype/SDK mutation is used.
These cases do not establish native allocation safety or OOM behavior.

The four [native helper failure cases](../src/cad/kernel.extrusion-limits.ownership.test.ts)
construct actual radius-1 blind prisms and/or an actual `[0,10]²×[0,8]` target.
They inject a later `faces` acquisition failure after UntilNext owns its prism;
a cut failure after additive ThroughAll receives its real native intersection;
a final-prism factory failure after UpToSurface receives its probe; and a
prism release failure after a successful UpToSurface split. Received-instance
delete faults call the real deleter before throwing. The assertions require
one attempt, retained primary/cleanup errors and healthy borrowed target where
applicable. Exact candidate-result release is additionally checked by the
protocol cases and ownership control-flow review; unseen SDK allocations and
sequential child-release failures are not measured by these fixtures.

The two [engine boundary cases](../src/cad/kernel.native-cleanup-boundary.test.ts)
first build an actual legacy 10×10×8 box. A throwing helper module fault returns
no fake geometry: a NativeCleanupError must escape with its identity and leave
no retained engine shape/catalog, while an ordinary geometry Error remains a
feature error with the previous box volume 800 and bounds `(0,0,0)..(10,10,8)`
within `1e-6`. The helper namespace spy is restored; no SDK/native prototype is
patched. These are call-site classification checks, separate from actual
native helper cleanup faults. None establishes all-scope parity, a complete
DAG, document/reference lifecycle, interaction, export or platform support.

## Primitive constructor registration failure fixtures

Two further original native cases in
[kernel.recipe-primitives.ownership.test.ts](../src/cad/kernel.recipe-primitives.ownership.test.ts)
exercise shared ownership when an actual received SDK Sketch cannot be
registered. They are separate from the preceding 17 primitive cases and the
24 bridge/ownership cases. Written counts are not execution results; actual
source-specific validation belongs in [VALIDATION](VALIDATION.md).

Each constructs a native 10×10×4 current target, radius-1 intrinsic circular
profile centered at `(5,5)`, explicit XY frame and positive ThroughAll direction.
The actual SDK Sketch factory and its deleter remain real. A project ownership
scope's Map instance throws either before insertion or after its real insertion
of that received Sketch. Its captured release calls the real Sketch deleter
before a second synthetic cleanup error. No SDK/native prototype, global Map,
fake support, saved identity or geometric return is patched.

Both cases require the registration primary to remain the AggregateError cause,
the exact primary and cleanup objects in order, one captured release attempt,
no tool validation/returned tool, and a healthy borrowed target. The unchanged
target has one valid closed native solid, volume 400 within absolute `1e-5`,
and bounds `(0,0,0)..(10,10,4)` within `1e-6`. A defensive fixture owner also
releases an unexpected returned tool if the injection fails to activate.

The original 17 geometry/validator expectations stay unchanged and need rerun
on the refactored source; these two cases do not substitute for them. The shared
scope can release only wrappers actually received. Allocations lost inside SDK
or copy/Boolean factories before return, sequential native child-release
failures and native OOM remain outside the measured boundary. No complete
leak-freedom, platform, interaction, lifecycle or regeneration-parity claim is
made by these cases.

## Chronological recipe evaluator fixtures

The 21 cases in `src/cad/kernel.feature-recipes.test.ts` are original synthetic
Cartesian models authored for this project. They use intrinsic rectangle/circle
profiles, boxes and cylinders created by the declared kernel dependencies. No private
model, external CAD fixture or copied expected boundary representation is required.
Lengths are millimetres; angular transform inputs are degrees. Source poststates are
constructed independently from the declared source operations so the evaluator receives
real exact historical native states. Expected results are mathematical constants and
point classifications, never expected geometry generated by the evaluator.

The 21 expanded component cases cover:

| Family | Cases | Independent result or causal observation |
| --- | ---: | --- |
| Taller-target through-all, linear/circular/mirror | 3 | A 10×10×8 target with a radius-one through hole has V=800−8π, A=520+14π. The independent seed is 10×10×4 with V=400−4π, A=360+6π. A probe at z=6 is void only when the operation regenerates through the taller target. |
| Selected no-op parent and per-address child | 2 | A 12×8×4 base plus one 2×2×2 boss has V392, A368. Radius-.5 depth-two holes remove π/2 and add 2π area each. One hole gives V392−π/2/A368+2π; two bosses/holes give V400−π/A384+4π. The unchanged first parent still provides its exact same-address semantic role. |
| Updated-owner dynamic termination | 1 | A 10×10×4 base with a 2×2×4 boss has V416, A392. The radius-.5 through hole traverses height eight, giving V416−2π, A392+7.5π. The independently observed construction tool extends to z=9, with V9π/4, A9.5π. |
| Missing address, stale target, and every-source attestation | 3 | Exact-key fault injection cannot borrow another address; an old current target rejects before building tools; one missing same-event historical owner rejects before grouping. Previous target geometry and identity remain unchanged. |
| Routed unchanged owner | 1 | The remote 12×8×4 owner remains V384, A352 at its old exact reference; no target@pattern state is invented for it. |
| Late final split | 1 | An 8×4×4 box with a 6×4×2 tail has V176, A232. One bottom-through slot gives V168, A244; an earlier copied slot gives V160, A256. The later tail-cut split rejects the final result atomically. |
| Temporary islands and later bridge | 1 | The intermediate pair of 4×6×4 boxes has V192, A256. Adding the original bridge gives XZ area38 and perimeter36, extruded six along Y: V228, A292; bounds [30,0,0]–[40,6,5]. Only the final one-solid result is publishable. |
| Empty then restored material | 1 | Removing the complete 10×10×4 target yields genuine topology-free empty material; a later blind 10×10×6 tool restores V600, A440. A zero-volume sheet is not an empty-state oracle. |
| Equal-volume relocation and cancellation | 2 | Removing one 2×2×1 pocket and adding a separate 2×2×1 boss retains V240 but changes area from248 to264, bounds and point membership. Adding then removing the identical boss is a complete no-op and rejects. |
| Current-definition freshness | 1 | Changing the parent depth after evaluation, with unchanged native IDs, rejects staging and releases candidates. |
| Equivalent converging historical routes | 1 | Two exact poststates of the same fixed intrinsic event route to one target. Both sources and virtual roles are attested; only one actual event/target tool is applied, yielding V160, A256. |
| Ownership and error preservation | 4 | Candidate release before commit; first disposal-registration failure with two real candidates; a fatal actual source-cleanup error appearing before staging; and a late real final-split error plus candidate cleanup failure. Every case preserves the previous catalog. |

Every successful geometric case checks valid BRep, one final solid, volume, area and
bounds. Target/source point probes distinguish selected configurations. Metric tolerance
is 1e-5 mm³/mm², bounds tolerance 1e-6 mm and probe-volume tolerance 1e-7 mm³. Runtime
initialization and each native test use 60 seconds; authored budgets are not execution
results. Tests use detached native source/target shapes and release received native
wrappers; causal release tests count attempts, not all native heap allocations.

These are component tests. By themselves they do not establish saved-parser/engine
integration, worker/editor preview/application, save/reopen, undo/redo, selection,
complete face correspondence, dynamic all/auto scopes, varying sketches, nested recipes,
lifecycle outputs or parity with another application's regeneration. The separate engine
fixture family below has its own boundary. Actual execution belongs in the validation
record after it occurs.

## Saved regeneration engine fixtures

The 18 cases in `src/cad/kernel.feature-recipes.integration.test.ts` are original
synthetic millimetre fixtures for the explicit saved regeneration declaration. They use
project-native rectangle/circle features, separate owned prisms, exact source/target
references and a datum plane; no external CAD asset or private model is required.
Expected geometry is given by box/cylinder formulas and Cartesian point probes rather
than reconstructed expected BReps.

Six cases compare geometry copy and actual regeneration for a radius-one through-all
source cut through a 10×10×4 seed, applied to a distinct 10×10×8 target. Linear +20X,
circular 180° about Z through(15,0,0), and reflection in X15 place the target hole at
the stated analytical center. Geometry copy yields V800−4π/A520+8π, leaving material at
z6; regenerated through-all yields V800−8π/A520+14π, void at z6. A coincident unselected
body remains V800/A520 at its original exact identity. Both paths remove material at z2.
The seed remains V400−4π/A360+6π.

The twelve remaining cases cover an older exact source after a later cut and after
consumption by Combine; stale current targets; a routed no-op owner; complete no-op
rejection; a downstream consumer of an unavailable potential no-op state; source edit,
serialization/reopen and undo/redo; late tail splitting with atomic rejection; false
without an explicit declaration; a pending creation-output identity diagnostic;
chronological multi-feature parent→through-all construction; and a no-op parent with a
real blind child. Their independent constants include later-cut source
V400−5π/A360+9.5π, combined prism V480−4π/A416+6π, edited radius-two target
V800−32π/A520+24π, and parent-updated target V416−2π/A392+7.5π. The radius-.5/depth-two
no-op-parent child removes π/2, giving V392−π/2/A368+2π.

Successful cases check native BRep validity, one final closed solid, volume, area,
bounds and exact owner references. Selected cases check original creators, body counts,
renderer metadata and material probes. Rejections preserve all predecessor bodies and
block export. Metric tolerance is 1e-5 mm³/mm², coordinate tolerance 1e-6 mm,
probe-volume tolerance 1e-7 mm³. Initialization and each native case retain a 60-second
budget. Written cases are not execution results.

These fixtures exercise saved-parser/engine integration separately from the standalone
recipe evaluator. Their actual source-specific execution belongs in
[VALIDATION](VALIDATION.md). They do not establish browser/Electron interaction,
picking, worker preview freshness, exported-file interoperability, complete face/offset
correspondence, dynamic all/auto scopes, varying sketches, nested recipes or
new/consumed/split recipe output identities. Those remain required work; pending
rejection is not parity evidence.

## Saved calculation-method model and rendered fixtures

The 28 cases in `src/model/featurePatternSavedModes.test.ts` use original
symbolic millimetre records: two independently created owners, an earlier
merge extrusion and a later blind cut on one owner. Linear, circular and
mirror variants retain both historical source states separately from the
current target states. No native geometry is constructed by this file.
Cases check strict geometry/true and regenerate/false pairing, serialization,
undeclared false rejection, unknown or inherited/decorated declarations,
unchanged identities and detached routing through method changes. A method
change invalidates the earlier command plan and requires a fresh preview
receipt. The supplied `healthy` flag is a symbolic input to the command
attestation boundary, not proof of native preview health.

The nine cases in `src/components/PatternPanel.savedModes.test.tsx` render
original symbolic histories with `renderToStaticMarkup`. They check the saved
method selected for each family, historical seed labels separately from current
target labels, enabled/disabled states, an unavailable target retained for
repair, and legacy presentation. Edit callbacks throw if rendering invokes
them; inputs must remain unchanged. These cases execute no UI event and prove
neither interaction, native availability nor worker preview/Apply behavior.
Actual execution results belong in [VALIDATION](VALIDATION.md).

## Recipe-cache capture and registration fault fixtures

The three cases in `src/cad/kernel.recipe-cache-ownership.test.ts` use original
10×10×4 and 10×10×8 boxes, separated by +20 mm X. Two disjoint radius-one,
depth-one blind pockets at local (3,5) and (7,5) leave exact source volumes
400−π and 400−2π mm³. The second cut explicitly follows the first exact owner
state. Copy-input volumes use absolute tolerance 1e-5 mm³; this file asserts
lifecycle/error behavior rather than the area of a successful pattern result.

One case throws an ordinary sentinel at the project's exact-source copy call.
The actual evaluator must retain that cause, reject the consuming pattern
before constructing a tool, and leave the healthy predecessor bodies and
serialized input unchanged. No fake native shape is returned.

Two cases use real native copies and a real ownership-scope subclass. Only that
scope's private Map instance has an own registration fault, before or after
inserting the second received copy. Its instance delete calls the real native
delete and then throws a separate cleanup sentinel. The first historical copy
has already transferred to the old cache. Each old/fresh copy must receive one
delete attempt; the fatal aggregate must retain the exact primary and cleanup
causes, skip evaluator/tool calls, and clear the failed engine state. Neither
an SDK/class prototype nor global Map is patched. Initialization and each
native case use a 60-second budget.

These are project call-site fault discriminators. They do not inject failure
into the engine's closure-local cache publication Maps or post-adoption prior
catalog release, and do not prove native OOM, factory-internal reclamation or
total leak freedom. The public source-order review and those unexecuted
boundaries remain separate from the actual three-case execution record.

## Dynamic ALL model and rendered fixtures

The 17 cases in `src/model/featurePatternAllScope.test.ts` and seven cases in
`src/components/PatternPanel.allScope.test.tsx` use original symbolic body and
feature records. No native geometry, external model, application export or
private asset is required. Linear, circular and mirror records pair explicit
regeneration with geometryPattern false, exact historical source refs and scope
routes rather than a saved current-target snapshot.

The model cases check saved round trips, strict declaration shape/parity,
detached scope edits, explicitly chosen target routes, unchanged identities,
seed pruning without inferred bindings, selected/dynamic/application budgets,
fresh command attestation after inventory or current-state changes, and
contextual potential output refs retained for repair. A symbolic healthy flag
exercises command attestation only; it supplies no native availability proof.

SSR checks the initial ALL scope/method and an explicit switch to selected,
historical labels, a paginated
current ALL catalog with at most 64 visible names, loading states, pending
additive scope prose and absence of automatic scope or target checkboxes for ALL.
Callbacks throw if render edits any input. An original 8192-slot history has
8191 retired slots and one active slot; ordinary ALL choices stay bounded while
an exact selected retired ref remains visible as unavailable repair data.
These assertions execute no UI event and prove neither interaction nor native
materialization. Four existing selected-fixture files retain their original
oracles and case counts; their type narrowings do not broaden what they test.

## Dynamic ALL creator-deletion fixtures

`src/model/featurePatternAllDeletion.test.ts` defines four original symbolic
ownership graphs. Source S and its historical cut precede independently created
B and C, an ALL pattern P based on C, an exact B@P consumer and its child, and
an independent C@P repair consumer. Each of B's creator and its profile is
deleted with B active or suppressed.

Expected deletion removes B's creator, its exact and transitive consumers, and
the requested profile when applicable. P, its exact historical seed, C and the
unchanged C@P repair ref remain. Creation association is queried against the
original context and memoized by exact ref; unresolved association adds no
invented dependency. The fixture checks immutability and saved round trips,
without claiming that a potential P poststate exists natively. No geometric
identity substitution or dependency on every ALL inventory member is introduced.

Together with the 18 native scope and eight saved-engine cases below, these
files add 54 authored cases at distinct boundaries. Counts describe fixture
inventory, not executed passes. Additive ALL, dynamic geometry scope, AUTO,
dependent/varying recipes and broader output lifecycles remain required work.

## Native dynamic recipe-scope fixtures

The inputs proposed in `src/cad/kernel.recipe-scopes.native.test.ts` are original
analytical millimeter fixtures constructed from boxes, radius-one cylinders,
intrinsic rectangle/circle sketches and explicit body references. No external
CAD model, application export, proprietary source, binary or private asset is
required. The eighteen authored cases describe a native scope/evaluator boundary;
their presence alone is not a recorded validation result.

A historical 10-by-10-by-4 source has a radius-one through opening at (5,5).
Linear translation by +20X, a 180-degree Z rotation about (15,0,0), and reflection
in X=15 route its recipe to independent coincident 10-by-10-by-8 owners. The
expected per-owner volume is 800-8pi and surface area is 520+14pi. Circular
placement has bounds [20,-10,0] to [30,0,8]; linear/mirror bounds are [20,0,0] to
[30,10,8]. The exact historical source stays 400-4pi/360+6pi, while a remote
10-by-10-by-8 owner stays 800/520 with its old state reference.

An earlier extension of the same A identity to height10 yields 1000-10pi and
600+18pi. A newly inserted coincident D at height12 yields 1200-12pi and
680+22pi. These expectations follow V=100h-pi*h and A=200+40h+(2h-2)pi and
distinguish fresh ALL membership/current refs from a persisted selected list.
Each owner must remain one valid closed solid; original creation identity and
unmodified exact references are asserted separately from geometry.

The file also proposes cropped/extra/stale snapshots, forged proofs and native
shape-identity drift, exact historical capture failures before target copies or
tool construction,
35-owner real evaluation, and a 512-route declaration versus a 513-route rejection
before target copies or tools. The 512 positive check is declaration/membership
coverage, not execution of 512 material operations. The shape-drift case uses a
real deep copy of an unchanged owner to require stage rejection and exactly one
release of each retained candidate without modifying borrowed catalog geometry.

Selected scope retains real positive and cancellation discriminators. A
2-by-2-by-2 attached boss changes a 10-by-10-by-4 box from 400/360 to 408/376.
ALL positive applicability must instead report its explicit pending diagnostic
before tool construction. A selected through removal followed by a fill has
genuine per-event effects on both owners while only an originally pocketed owner
changes finally: a 2-by-2-by-2 bottom pocket has 392/376 and is restored to
400/360; a 30-by-10-by-4 neighbor returns to 1200/920 and retains its old exact
state. This does not establish ALL addition or AUTO capture behavior.

Authored tolerances are 1e-5 for volume/area, 1e-6 for bounds, and 1e-7 for cube
intersection volume. A 0.2-sided cube has expected material volume 0.008 or zero
at the stated interior probes. Metric expectations are independent formulas;
the tested kernel supplies only observed geometry. Record actual executions
separately before claiming that any proposed case passed. Saved dynamic grammar,
property-panel interaction, automatic capture, varying/dependent recipes and
broader lifecycle behavior require their own evidence.

## Saved ALL engine acceptance fixtures

`src/cad/kernel.recipe-all.integration.test.ts` defines eight original cases
using the saved ALL regeneration declaration through CadEngine. It is separate
from component-native, symbolic-command and server-rendered presentation tests.
No external CAD model or binary is used.

Units are mm. A 10×10×4 source has a unit-radius ThroughAll hole at (5,5).
Two independently owned coincident 10×10×8 targets receive a +20 X copy,
a 180-degree Z rotation about (15,0,0), or reflection in X=15. A remote
10×10×8 owner remains at X=50..60. For a target height h and radius r,
independent formulas are V=100h−πr²h and
A=200+40h−2πr²+2πrh. Baseline aggregate volume, counting both distinct
coincident owners, is 2800−20π. Current-state/membership edits extend A to
height10 and insert D of height12; aggregate volume becomes 4200−34π.
The ALL intent remains unchanged and saves neither targets nor a snapshot.

An R2 source edit is saved/reopened and exercised through undo/redo. Source
V/A becomes400−16π/360+8π; each height8 target becomes800−32π/520+24π.
A later remote cut explicitly referencing the no-op C@pattern state must stay
loadable for repair but fail native construction/export, preserving earlier
owners. This is an exact-reference rejection, not a missing-body fallback.

Checks require valid BRep, one solid per owner, independent per-owner volume
and surface area within1e-5, bounds within1e-6, saved opaque refs/creator IDs
and a .2³ material probe within1e-7 volume. Fixtures release metric/probe
wrappers and dispose their engines. Case and initialization budgets are60s.
These checks do not prove native leak absence, real pointer/worker preview/Apply,
general ownership lifecycle, independent interoperability or platform support.

## Instrumented dynamic ALL desktop fixture

`scripts/desktop-pattern-all.cjs` loads the original synthetic document in
`src/cad/fixtures/pattern-all-original.json`. The fixture was authored from
rectangles, one circle and explicit feature/body identities. It contains no
imported model, external application output or personal filesystem path. Lengths
are millimeters; volumes are cubic millimeters.

The source S is a 10×10×4 box with a radius-one ThroughAll cut centered at (5,5).
A and B are independently owned coincident 10×10×8 boxes in X=20…30, Y=0…10,
Z=0…8. C is a remote 10×10×8 box in X=50…60. A two-position linear pattern moves
the cut 20 mm along X and initially selects A only. Its source binding is exactly
S at `seed-cut`; C is the global predecessor.

Independent expected volumes are S=400−4π, A=800−8π, selected B=800 and C=800.
After changing to dynamic ALL, both A and B have volume 800−8π; S and C retain
their old exact states. Bounds stay equal to the original boxes. The authored
checks use volume tolerance 10⁻⁵ and coordinate tolerance 10⁻⁶, compare exact
body/source/creator identities at four worker phases, and verify the saved and
reopened ALL declaration has a scope route and no persisted target snapshot.

This is an instrumented production-renderer regression using scripted DOM
events. It retains the real worker/WASM and restricted preload/file IPC, while
keeping its fresh window hidden and choosing only test-owned temporary paths
for native dialogs. It observes Apply disabled before the ALL preview response,
then performs Apply, Save As and reopen. Initial readiness and individual steps
retain 35-second limits; the separate complete workflow has a 180-second parent
deadline. The standard desktop smoke deadlines are unchanged.

Authored assertions are not passing evidence. The actual command, source,
platform and outcome belong in the validation ledger. This one linear cut
workflow does not establish general GUI interaction, native-dialog behavior,
other pattern families, platform support or broader recipe/lifecycle coverage.

## Per-owner UntilNext classification fixtures

The 19 cases in
[`src/cad/kernel.until-next-resolution.test.ts`](../src/cad/kernel.until-next-resolution.test.ts)
are original synthetic inputs created for this project from boxes, circles and
rectangular cavities. The test constructs them in memory using the declared
dependencies; no external CAD document, binary fixture or private model supplies
an input or expected result. Lengths are millimeters, areas mm² and volumes mm³.

The procedure builds each target independently, creates a fresh radius-one prism
in an explicit frame, classifies its actual forward intersection, and checks any
complete tool and resulting cut. Expected values come from elementary geometry,
not a second call to the classifier or its limit helper. The geometric cases are:

| Cases | Original construction and independent oracle |
| --- | --- |
| 1 remote miss | The circle is centered at `(5,5)` along +Z. Target `[20,30]×[0,10]×[0,8]` has V800/A520; separation is `20−(5+1)=14`. |
| 3 contact boundaries | The same circle reaches x6. Boxes beginning at x `6+g`, for `g=0,10⁻⁹,10⁻⁵`, have exact separation g and unchanged V800/A520. `10⁻⁷` is the classifier's explicit contact/near distance resolution. |
| 4 first-wall placements | Outer `10×10×8` minus an enclosed `6×6×4` cavity at z2..6 gives V656/A688. Translated, half-turn and two reflected frames exercise physical ray parity. Both walls intersect the enclosing query, V4π; the first-wall tool has V2π/A6π. Its cut gives V`656−2π`/A`688+2π`, and a far-wall probe retains material. |
| 1 partial face then complete exit | The radius-one circle centered at x7.5 crosses the cavity edge x8. Circle area inside the cavity footprint is `Ai=2π/3+√3/4`. Tool height8 gives V8π/A18π. Removed material is `8π−4Ai=16π/3−√3`; final V is `656−16π/3+√3` and A is `688+22π/3−9√3/2`. |
| 1 incomplete overhang | Target `[0,5.5]×[0,10]×[0,8]` has V440/A358. Actual forward material is `8Ai=16π/3+2√3`, but no target face closes the entire circular profile. |
| 1 temporary-island owner | Removing slab x4..6 through `10×10×8` leaves two `4×10×8` islands, combined V640/A608. A circle centered at `(2,5)` gives a height8 tool. The cut keeps two solids with V`640−8π`/A`608+14π`; the remote island's interior probe stays material. |

For the partial-cavity area, new cylindrical wall contributes `32π/3`. Remove
two exterior disks `2π`, two cavity horizontal patches `2Ai`, and an inner
vertical patch `4√3`. The net area change is therefore
`32π/3−2π−2Ai−4√3=22π/3−9√3/2`.

Volume and area tolerances are `10⁻⁵`; bounds use `10⁻⁶`. Material probes compare
the intersection of a `0.2³` cube with the analytically expected occupied or
empty interior, using volume tolerance `10⁻⁷`. Tests check valid BRep, relevant
solid counts, bounds and unchanged borrowed targets rather than volume alone.

Eight further causal cases cover original factory errors, cleanup errors after
a miss/incomplete limit or after a complete tool has been built, repeated
wrappers, and distinct JavaScript facades exposing a borrowed or repeated native
handle. They preserve sentinel errors and check observed release attempts and
borrowed-owner geometry. These assertions do not establish general garbage
collector or upstream factory lifetime safety.

This is native component coverage, not a saved recipe or pattern interaction
fixture. A completed empty Common plus native separation is distinct from
contact or material without a complete limit. No selected/ALL no-hit policy,
source-base remapping, additive scope, AUTO, associative references, variation,
nested lifecycle, independent interoperability or platform support follows from
these cases. Written fixture counts are not passing results; exact-source
execution belongs in [VALIDATION.md](VALIDATION.md).

## Fixed principal-plane recipe fixtures

The [fixed-plane fixture guide](FEATURE_WORLD_LIMIT_FIXTURES.md) records original
analytical constructions for 18 model cases, four rendered-control cases and
eleven native cases. Written counts and expectations are not execution results;
the guide separates native volume/area/probe tolerances from UI evidence.

The original seven-feature
[pattern-world-limit-original.json](../src/cad/fixtures/pattern-world-limit-original.json)
uses two 2×2×16 mm boxes, a radius-0.5 circular cut and displacement [3,0,4].
The [planned production-renderer workflow](FEATURE_WORLD_LIMIT_FIXTURES.md#production-renderer-workflow-and-recorded-evidence)
distinguishes copied and fixed-plane regenerated cavities. It records four
healthy worker phases plus the expected missing-policy rejection, actual Apply,
isolated Save As/reopen and exact refs/IDs. UI metrics cover volume and bounds,
not surface area. Its authored flow is unexecuted until source-specific evidence
appears in [VALIDATION.md](VALIDATION.md); it does not establish broader
interaction, interoperability or platform support.

## Source-solve and native component fixtures

These 90 additional cases are original synthetic constructions authored for
this project: 18 entity-profile ownership, 15 source-solve registry, four raw
engine admission, 14 additive UntilNext, 21 positive closed-tool and 18 native
face-occurrence cases. Inputs are generated in memory from coordinates,
constraints, boxes, cylinders and raw native compounds using the declared
dependencies. No imported/private model, external application output or vendor
binary supplies a fixture or expected geometry. Lengths use mm, area mm² and
volume mm³. Written case partitions describe inventory; actual aggregate runs
belong in [VALIDATION](VALIDATION.md#source-solve-and-native-component-composition--2026-10-15).
The focused 109-case invocation also includes the existing 19 Cut-classification
cases described above; those 19 are not new cases in this composition.

### Entity-profile received-resource ownership

[kernel.profiles.ownership.test.ts](../src/cad/kernel.profiles.ownership.test.ts)
constructs one or two radius-one circular contours centered at `(3,0)` and
`(9,0)`, extruded 4 mm. Each cylinder has `V=4π` and
`A=2πr(r+h)=10π`. With frame origin `(4,5,6)`, X `(1,0,0)` and normal
`(0,0,1)`, bounds are `(6,4,6)` to `(8,6,10)` for one region, or to `(14,6,10)`
for two. The deliberately supplied legacy offset 999 must not be reapplied
when an explicit frame is present. BRep validity and individual solid counts
are checked; volume/area tolerance is `1e-5`, bounds `1e-6` mm.

Faults operate on actual received wrappers and their project ownership scopes:
second-contour construction with two earlier release failures; registration
before/after insertion for extrusion, revolution, contour transfer and compound
wrapper; completed-result retirement after cleanup failure; a throwing compound
type assertion; extrusion input access; raw compound construction/adoption and
native Add failure. Distinct wires, their bounds and transfer counts identify
the second contour rather than counting registration calls as new geometry.
Actual native deletion precedes cleanup sentinels. Checks preserve primary/error
identity and one release attempt for each received owner, including the raw
compound's single adoption owner. An unrelated caller-owned `10×8×3` box remains
outside those scopes, with V240 and unchanged bounds. These cases do not prove
SDK-internal allocation safety or total leak freedom.

### Real solves, historical prefixes and raw engine admission

[kernel.sketch-solves.test.ts](../src/cad/kernel.sketch-solves.test.ts) starts a
circle at radius 1 with center `(3,0)`, fixes that center and drives radius to
2. The independent radius bound is `abs(r-2) <= 1e-7` mm. A driven radius with
nominal value 999 must measure 2 freshly; the fully defined result has zero
degrees of freedom. Removing the center fixation leaves two free translations;
adding a conflicting center fixation must retain an actual failed solve and
publish no fallback success. Tests check the full result and its actual
visual/maps, not an injected success status.

Other cases cover suppressed/unavailable sources, failure after visual/map
staging, detached returned views, source/earlier-prefix edits, later-definition
separation, forged/cross-build handles and checkpoints, copied reader methods,
revocation and mutations during staging. An XZ datum offset 5 plus sketch offset
3 has independent frame origin `(0,-8,0)`, X `(1,0,0)`, normal `(0,-1,0)`;
changed or unavailable datum state invalidates its witness. This checks metadata
freshness, not native face-to-owner association or associative instance replay.

The four [raw engine cases](../src/cad/kernel.sketch-solves.raw.test.ts) call the
actual sketch-only engine without initializing native CAD. Rejected pattern
getters and ignored suppressed-sketch getters stay unread; noncloneable ignored
extras preserve ordinary rendering while withholding certification for that
prefix. An ordinary throwing getter remains local and prevents later
reconstruction. Rendered points satisfy `(x-3)²+y²=4` within `1e-6` mm² and z=0.

### Additive first entry versus subtractive exit

[kernel.until-next-add-resolution.test.ts](../src/cad/kernel.until-next-add-resolution.test.ts)
uses a `10×10×8` box minus an enclosed `6×6×4` cavity: V656 and A688.
A radius-one ray starts at the cavity floor z2. Add reaches the first complete
entry at z6, producing a height-4 tool V4π/A10π and final
V`656+4π`/A`688+6π`. Cut reaches the exit z8, producing V6π/A14π;
only the roof is removed, giving final V`656-2π`/A`688+2π`.
The forward Common is V2π in both cases. Copying a height-2 tool instead gives
V`656+2π`/A`688+4π`, exposing the difference from regeneration.

Four supplied placements cover +20X translation, a half-turn frame, reflected
normal/depth parity and a negative physical Z ray. These are supplied-frame
component cases, not tests of an actual pattern plan. A foreign box earlier on
the same ray stays borrowed and does not supply a limit. Probes distinguish the
near/deep cavity, roof and material outside the profile. A remote target proves
separation 14 mm; gaps `0`, `1e-9` and `1e-5` mm distinguish contact/near from a
completed miss at the component's `1e-7` mm resolution. A partial roof at
x≤5.5 has forward volume `4π/3 + √3/2` and no complete profile cap.
Borrowed-prism rejection, original construction failures, query cleanup after
miss/incomplete observations and retirement of a completed tool preserve their
causal and ownership boundaries.

### Positive closed temporary tools

[kernel.closed-tools.test.ts](../src/cad/kernel.closed-tools.test.ts) starts with
an annulus R2/r1/height3: `V=π(4-1)3=9π`,
`A=2π(4-1)+2π(2+1)3=24π`. Adding a separate `2×2×2` box gives
V`8+9π`/A`24+24π` and two tool regions, while persistent-owner validation still
rejects two solids. Reversed parent/child orientations exercise accumulated
native orientation; repeated occurrences remain two natively even when SDK
solid enumeration deduplicates them. Overlapping `2×3×4` boxes at x0..2 and
x1..3 reject as a compound, while their native union has V36/A66. Two touching
`2³` cubes are permitted as a two-region tool (V16/A48); their union has A40.
Loose faces/edges, an empty compound, inverted material and a five-face open
box shell reject without consuming healthy borrowed inputs.

Two radius-one columns through a `12×6×8` owner produce a height-8 tool
V16π/A36π and final V`576-16π`/A`432+28π`. Two columns with different cap
heights must not become an invented complete exit: the connected target has
V168/A236 and forward material V2.5π. Two additive regions from z2 to z6 in
the enclosed cavity produce V8π/A20π, with final V`656+8π`/A`688+12π`;
the intervening cavity remains empty. Query faults exercise masses 0, -1, NaN
and Infinity after the real native query, an original mass-query error,
analyzer release and a loose-topology primary followed by release failure.

For these Add/closed-tool fixtures, volume and area use tolerance `1e-5` in
their respective units and bounds `1e-6` mm. Independent interior/exterior
probes use 0.2 mm cubes, expected common volume 0.008 or zero mm³, tolerance
`1e-7` mm³. Expected material is specified analytically, not calculated with
the classifier or validator being tested.

### Native face occurrences and retained clone lifetime

[kernel.native-face-membership.test.ts](../src/cad/kernel.native-face-membership.test.ts)
creates a fresh `12×8×4` box, V384 and
`A=2(12×8+12×4+8×4)=352`; its bottom face has A96 and bounds
`(0,0,0)` to `(12,8,0)`. Bounds select that fixture face only; the membership
helper never uses geometry to infer identity. A fresh coincident box and an
explicit geometric copy share metrics but not the original face's TShape.
Real clone wrappers retain membership; reversed orientation remains `IsSame`
but differs in `IsEqual`. A single +20X transform with `copyGeom=false` retains
TShape while changing Location, with moved bounds `(20,0,0)` to `(32,8,4)`.
Its actual moved face occurrence supplies the fixture; equal matrices from
separate transforms are not assumed to create equal location datum chains.

Native compounds exercise repeated occurrences and actual empty topology.
After every original body/face wrapper is retired, retained clones still undergo
BRep, solid-count, mass, area, bounds and interior/exterior probe checks.
Tolerances are `1e-5` for mass/area, `1e-6` mm for bounds and `1e-7` mm³ for
the 0.2 mm probes centered at `(6,4,2)` and `(13,4,2)`.
Other cases reject null/non-FACE operands and preserve actual More, post-match
Next and IsSame failures, matched-Current/final-Explorer cleanup failures, and
registration failures before/after insertion with both cleanup errors. Numeric
success cannot escape a failed traversal or release. These eighteen cases
establish neither a historical support issuer nor same-instance correspondence.

## ALL unilateral forward-material fixtures

Thirteen additional component cases in `kernel.recipe-scopes.native.test.ts` and
two saved-engine cases in `kernel.recipe-all.integration.test.ts` are original
synthetic millimetre fixtures. Written cases are not execution results.

The source is the existing 10×10×4 box with a radius-one through hole. A forward
10×10×8 target must become V800−8π/A520+14π. A distinct behind-plane 10×10×8
owner stays V800/A520 at its exact creation state, with a same-address virtual
no-op role and unchanged metadata. Cartesian variants use: +20X placement with
+Z ray and behind bounds [20,0,−10]..[30,10,−2]; a 90-degree +Y rotation about
(15,0,0) with +X ray, forward bounds [15,0,5]..[23,10,15] and behind bounds
[5,0,5]..[13,10,15]; reflection across Z10 with −Z physical ray, forward bounds
[0,0,12]..[10,10,20] and behind bounds [0,0,22]..[10,10,30]. Independent interior
probe centers are (25,5,6), (19,5,10) and (5,5,16).

Other component cases require bilateral ThroughAll to cut the negative-Z
owner, selected unilateral behavior to retain its original rejection, a
classified no-op owner’s shape-identity drift to reject staging and release
the retained candidate once, and complete no-op ALL to remain rejected. The
remaining component cases retain explicit primitive parameter rejection for
three deliberately invalid evaluator declarations (zero radius/width and an
out-of-range center), the original native error in the near-plane tolerance
band, and real received-owner bounds query/release failures without publication.
engine success case uses saved parsing/reopen and independent body metrics.
The late-failure case uses a 10×4×2 source with a 1×2 through slot (V76/A144)
and a separate 8×4×4 target plus 6×2×2 tail (V152/A208). The first +4X slot
gives a healthy V144/A228 target; the +8X slot cuts the tail across its full
width and height, producing a later split that must
reject atomically while the behind-plane owner stays V800/A520.

Metric tolerances are 1e-5 mm³/mm², bounds 1e-6 mm and 0.2-cube common volumes
1e-7 mm³. Expected geometry uses box/cylinder formulas and Cartesian points,
not the absence classifier. No external asset, binary or private model is
used. The complete two affected files subsequently passed 41/41 cases on the
exact local Windows correction snapshot, including these 15 new cases. Their
[source-specific execution record](VALIDATION.md#all-unilateral-forward-material-correction-2026-10-15)
is separate from the definitions above; counts overlap with the full suite.
These cases do not establish general contact classification, new terminations,
entity-profile support, platform support or native leak freedom.

## Intrinsic solved-entity recipe fixtures

All coordinates, constraints, geometry and expectations in the three new
entity recipe/checkpoint/declaration test files were authored for this project.
They use millimeters and existing distributable Node/OpenCascade dependencies;
no vendor models, binaries, screenshots or extracted source are fixture inputs.
There were 18 native engine cases, five source/checkpoint cases and four pure
declaration cases in the original 27-case proposal. They are retained in the
composed source and its [recorded execution](VALIDATION.md#entity-all-profile-composition--local-evidence-2026-10-15).

The asymmetric D contour contains three lines and one CCW semicircle centered
at (6,5), radius r=2, joined to a four-mm-wide rectangle at x=2..6,
y=5-r..5+r. Points are fixed and a driven radius nominal999 is measured fresh.
Its area is 8r+pi*r^2/2=16+2pi and perimeter 8+2r+pi*r=12+2pi.
A 10x10x4 source ThroughAll cut leaves V336-8pi, A376+4pi.
The actual target is 10x10x8: V672-16pi, A584+12pi. Bounds remain the
target box. Linear, circular and mirror features use the real pattern generator.
The mirror's positive local y and asymmetric curved side expose an incorrect
normal/parity or winding repair. Cartesian probe coordinates are independent
of the generator. For edited r=1, area8+pi/2 and perimeter10+pi give target
V736-4pi and A584+7pi. Save/reopen, upstream edit, undo and redo rebuild it.

The circle fixture saves radius1, fixes center(5,5), drives radius2 and stores
a driven nominal999. Its actual result must have r within 1e-7 mm of2 and
fresh measurement2. The source leaves V400-16pi,A360+8pi; the eight-mm
target leaves V800-32pi,A520+24pi. A raw-radius1 fallback gives the wrong
target V800-8pi. Without center fixes the actual underdefined two translational
degrees of freedom remain visible; no unique-solution claim is made.

Selected merge fixtures add a height2 annulus R2/R1 on a target top at z8,
giving V800+6pi,A520+12pi,zmax10, or two disjoint radius1 regions,
giving V800+4pi,A520+8pi,zmax10. The latter native tool has multiple regions
but the merged persistent target stays one solid. The center hole/gap remains
empty above the original top and material stays present below it.

The symmetric depth2 D cut around target z4 leaves V768-4pi,A576+8pi;
probes at z2/4/6 distinguish offset from mid-plane start. Both-direction
ThroughAll starts at that mapped interior plane and must reach both box ends.
The explicit world XY end-plane fixture starts at mapped z8 and cuts to z0;
it keeps V672-16pi,A584+12pi rather than transforming the limit with Q.

An additive ThroughAll fixture has a 10x10x4 source with enclosed 8x8x2
cavity and a 10x10x8 target with enclosed 8x8x4 cavity. A radius1 cylinder
fills only the cavity up to actual body exits: source V272+2pi,A552+2pi;
target V544+4pi,A776+6pi. Ceiling, floor and side material belong to one
connected owner before and after the merge. The existing end helper is used.

Coincident distinct native owners test explicit selected routing. A later
nonintersecting address rejects atomically without publishing an earlier
candidate. A wide30x10x8 target accepts two addresses with actual working
revisions0->1->2: V2144-32pi,A1368+24pi. Editing the real source before
staging rejects and preserves V2400,A1240 at its original owner reference.
Missing/copied readers reject before target cloning; checkpoint tests cover
foreign/forged/omitted handles, prefix edits, revocation and failed real solves.
Model tests preserve associative, variation, UntilNext, additive ALL, AUTO and
nested-operation diagnostics without treating those rejections as completion.

Native checks use BRep validity, one persistent solid, mass/area absolute1e-5,
bounds1e-6 mm and 0.2-mm common-volume probes with tolerance1e-7 mm^3
(expected0 or0.008). Raw radius checks use absolute1e-7 mm. Original values
are mathematical oracles; expected geometry never comes from the builder under
test. The linked source-specific native execution is not a human UI check,
export round trip or general platform-support result.

## Entity ALL absence composition fixtures

These additions are original synthetic millimeter fixtures for the composed
entity/source-checkpoint and forward-material path. They use the current V4
fixtures and public dependencies, without private models or extracted source.
The 27 original V4 cases and all earlier failure/evidence records remain
separate. The composed source adds 52 cases over its primitive-only base:
41 entity integration, five source/checkpoint, four declaration and two native
scope/tolerance cases. Their bounded local execution is recorded in VALIDATION;
the original proposal and earlier V4 evidence are not retroactively relabeled.

A circle saves r1, drives r2 and retains driven nominal999; the actual native
profile must contain radius2 and the real solve measures2, with one engine
source solve. A is `[20,0,0]..[30,10,8]`, B `[20,0,-10]..[30,10,-2]` and the
actual linear instance translates +20X with physical ray +Z. A becomes
V800-32pi,A520+24pi; B keeps V800,A520 and its predecessor ref/metadata. The
native component also checks the complete S/A/B inventory and B's real body
role with unchanged revision, then commits the proposal and checks metadata.

The actual Y90 rotation about `(15,0,0)` maps center `(5,5,0)` to `(15,5,10)`,
ray +X. A is `[15,0,5]..[23,10,15]`, B `[5,0,5]..[13,10,15]`; S also lies
behind in this rotation. Reflection across Z10 maps the center to `(5,5,20)`,
ray -Z; A `[0,0,12]..[10,10,20]`, B `[0,0,22]..[10,10,30]`. Source offset4,
depth -1 and actual translation `(20,0,4)` place the instance plane at Z8 with
ray -Z; A `[20,0,0]..[30,10,8]`, B `[20,0,10]..[30,10,18]`. Each A has the
same eight-mm r2 through-hole formula, while B remains its V800,A520 box.
Independent Cartesian Common probes distinguish the removed channel and B's
preserved material. Saved ALL contains no target inventory snapshot.

The asymmetric D reuses the original line/arc geometry and formulas above.
Two disjoint radius1 regions produce a valid closed compound cutting tool and
one connected perforated owner: V800-16pi,A520+28pi for height8. An annulus is
validated only as a direct native witness; no single persistent owner is
claimed for an annular through cut that would disconnect an interior core.
A genuine registry-issued solved open line must fail native contour closure.
This is a direct constructor rejection fixture, not a forged healthy seed BRep.

Selected behind-owner and near/contact maxima -0.5e-6/0/+0.5e-6 retain the
original ThroughAll rejection and must not call the witness validator.
Bilateral ALL actually cuts B. Complete-address no-op remains rejected.
Causal project-level adapters observe the actual received witness/native box;
they inject construction/release faults and source/working revision drift on
successful deletion, with one native delete attempt and no earlier publication.
The existing two ALL bounds-fault cases now delegate the real conservative-box
factory and adapt only the box for the actual detached current B owner. They do
not replace SDK global methods or invent a bounds result. AddOptimal includes
native BRep tolerances and a further global max-tolerance enlargement. A direct original 2x3x4 box case queries actual
vertex/edge/face MaxTolerance and requires the conservative native envelope to
extend more than half that positive tolerance below Z0 and above Z4; this
distinguishes tolerance inclusion from an exact-only envelope.

Two higher-tolerance discriminators serialize only newly constructed original
native geometry through BRepToolsWrapper.Write, require CASCADE Topology V3,
edit only the first field after each Ve record to0.001, and reread with the real
SDK. The [published OCCT format implementation](https://github.com/Open-Cascade-SAS/OCCT/blob/V7_8_1/src/BRepTools/BRepTools_ShapeSet.cxx)
identifies that field as vertex tolerance; this fixed source tag is not an
assertion of the installed SDK's OCCT version. Restoring those fields must
recover every original byte; runtime native MaxTolerance must report0.001 and
validity/mass checks must pass. No fake box or caller-supplied scalar stands in
for these genuine native tolerance changes. These tests ran with the composed
source recorded in VALIDATION, distinct from earlier private SDK exploration.

The owner-envelope case is a 10x10x8 box at
`[20,0,-8.0002]..[30,10,-0.0002]`, still V800/A520/one valid solid. Exact
geometry is behind Z0, but the globally enlarged factory box must cross Z0;
all six extrema must expand by at least0.001-1e-9 mm. This detects dropping the
global enlargement even when AddOptimal(true) includes a smaller face tolerance.
The witness case uses a normal-tolerance owner at those same coordinates and
the authentic solved r2 circle prism. Only the actual witness's native vertex
tolerance is elevated; V4pi/A12pi for length1 and real closed-tool validity must
remain intact. Its detached maximum0.001 exceeds the0.0002 owner separation,
so the helper must return to the ordinary B tool route and retain the original
ThroughAll rejection with no earlier A publication. Native tolerance-query
failure also propagates after a real query and releases the received witness
once; it cannot authorize a no-op.

A later entity rectangular slot uses original fixed corners `(1,1)`, `(2,1)`,
`(2,3)`, `(1,3)` and the real +4X/+8X pattern. Source10x4x2 leaves V76,A144.
A starts as 8x4x4 plus a 6x2x2 attached tail: V152,A208. The first slot leaves
the actual still-connected working A at V144,A228; the second cuts the full
tail section and must reject a split persistently. A/source/B predecessor
geometry, saved bytes and export rejection are checked after the failure.

Tolerances remain volume/area absolute1e-5, bounds1e-6 mm, 0.2-mm cube Common
volume1e-7 mm^3 and actual radius/driven comparison1e-7 mm. Native validity,
closed positive tool solids and final one-solid owners remain mandatory.
These native fixtures alone do not establish entity UI interaction, other support or
variation policies, export round trips, all platforms or general CAD parity.

## Scripted entity ALL UI fixture

The separate local UI case uses an original synthetic JSON document and six
private harness/input copies. The circle is at local (5,5) on XY/Z0, saves
radius1, drives radius2 and preserves driven nominal999. S is the 10x10x4
source with its unilateral ThroughAll seed cut; A is
`[20,0,0]..[30,10,8]`, B is `[20,0,-10]..[30,10,-2]`. The original fixture
SHA-256 is `81e0180cee6b9792798ebcd3ace65c28bb849dd9936be92ca34297570f9216f4`.
The linear pattern translates +20X. Geometry mode copies the four-mm source
contribution; selected regeneration then cuts A's actual eight-mm height,
followed by dynamic ALL. Independent expected volumes are S400-16pi,
A800-16pi for geometry and A800-32pi for regeneration, with B800 unchanged.

One actual scripted React/property-panel run observed five worker phases:
geometry, selected-regenerate preview, ALL preview, committed ALL and reopened
ALL. Each contains S/A/B volume/bounds/ref observations, 15 total. B retains
exact `B@create-B` and creator `create-B` in all five, without a saved ALL
target snapshot. The saved nominal radius1, driving2 and driven999 stay intact.
The actual response's source-sketch visual has 96 tessellated endpoints per
phase on the radius2 circle at (5,5), Z0; this is solved-display evidence, not
a full solver-result/token/status/DOF or driven-annotation measurement.

Volume tolerance is 1e-5 mm^3, bounds and displayed endpoint tolerances are
1e-6 mm. Actual worker/preload/IPC responses were observed; native file-dialog
paths were substituted with test-owned choices. The inner Electron close and
owned temporary cleanup were reported by the reviewed harness, with outer
exit/close 0 and drained streams. No direct UI BRep/solid-count/area/Common
query, human pointer/native-dialog interaction, other pattern families,
support/variation/correspondence policy or platform support is established.
This private local harness is not yet a tracked dedicated CI command. Its
[recorded validation](VALIDATION.md#entity-all-profile-composition--local-evidence-2026-10-15)
does not extend earlier primitive UI evidence or native assertions to those
unobserved cases.

## UntilNext saved declaration fixtures

The eight cases in
[featureRecipes.until-next.test.ts](../src/model/featureRecipes.until-next.test.ts)
are original, synthetic declaration fixtures. Their source and two target
profiles are 8-by-8 rectangles centered at `(4,4)`, `(24,4)` and `(44,4)`, with
declared extrusion depths 5, 9 and 13 mm. The source circle has radius 1 mm;
the separate annular entity declaration uses concentric circles of radii 2 and
1 mm at sketch offset 1 mm. The only canonical instance translates by `(20,0,0)` mm. These dimensions
are input declarations, not measured native geometry.

The expected source remains `source-owner@source-base`, while the source
poststate is `source-owner@seed` and its selected destination is
`owner-a@base-a`. The fixtures check these distinct identities, exact native
requirements, unchanged editable input, selected additive intent, whole
annular declaration retention and ALL's derived snapshot/routing syntax.
A two-owner snapshot is supplied to pure extraction; this does not attest the
complete native catalog. Other cases reject substituting a destination base
for the source base and combining unilateral UntilNext with legacy symmetry,
retain the independent additive-ALL gate, and distinguish UntilNext and
ThroughAll preview fingerprints without rewriting the original extraction.

The fixed UntilNext case added to
[featureRecipes.entities.test.ts](../src/model/featureRecipes.entities.test.ts)
uses that file's existing original circle declaration and +20X placement. It
checks termination and placement without issuing solved geometry; the primitive
adapter continues to reject an unsolved entity profile. The variation case
remains separate and still requires its pending policy.

No test in this declaration group constructs a native limit, solves a sketch,
proves a miss, renders an editor or establishes material applicability.
Executed results must be recorded separately in [VALIDATION](VALIDATION.md).

## UntilNext native tolerance and failure fixtures

The eight additional cases in
[kernel.until-next-resolution.test.ts](../src/cad/kernel.until-next-resolution.test.ts)
extend the original native classifier fixtures. The profile is a radius-one
circle centered at `(5,5)` along +Z. Its forward prism has analytical volume
`pi * length` and area `2*pi*(length+1)`; the target box is
`[6+gap,0,0]..[16+gap,10,8]`, with volume 800 and area 520. The geometric
side separation is exactly `gap`. Lengths are mm, volumes mm³ and areas mm².

| Case | Owner maximum vertex tolerance | Prism maximum vertex tolerance | Geometric gap |
| --- | --- | --- | --- |
| Owner tolerance band | 0.001 | Unchanged native value | 0.0002 |
| Prism tolerance band | Unchanged native value | 0.001 | 0.0002 |
| Combined tolerance band | 0.0006 | 0.0006 | 0.0009 |
| Separated control | 0.001 | 0.001 | 0.01 |

The elevated-tolerance inputs are serialized from these newly constructed
native boxes/prisms using the installed SDK's BRep V3 writer. Only the numeric
tolerance fields immediately following `Ve` change. Restoring them recovers
every original byte; native MaxTolerance, BRep validity and analytical metrics
are checked after reading the edited original fixture. No external model,
vendor fixture or mock bounding box supplies this geometry.

The first three cases must not authorize `empty-forward`; a real native Common
may itself report contact or material. A completed topology-free Common whose
distance is above the old floor but below the combined tolerance guard is a
stronger discriminator only when actually observed. Its branch and result
must be recorded after execution rather than presumed from these inputs.
The separated control requires actual native absence and its analytical gap.
Volume/area tolerance is `1e-5`, bounds `1e-6`; separation uses `1e-8`, and the
authored native tolerance metadata is checked within `1e-15`.

Four causal failure cases inject a fault after a real tolerance query at the
owner or prism, return a nonfinite observation after a real native query, or
throw after actually releasing the conservative box. They require failure
propagation and healthy borrowed geometry; the instrumented prism/box release
is attempted once. These injected errors are test mechanisms, not naturally
observed kernel failures or absence evidence. No native execution or general
lifetime guarantee follows from authoring these cases.

## Saved UntilNext native regeneration fixtures

The 68 cases authored in
[kernel.recipe-until-next.integration.test.ts](../src/cad/kernel.recipe-until-next.integration.test.ts)
use original boxes, enclosed rectangular cavities and planar profiles. All
lengths are mm, volumes mm³ and areas mm². No imported model, copied seed BRep
delta or output of a termination helper supplies an expected result.

The source hollow box is `[0,0,0]..[12,10,10]` minus
`[2,2,3]..[10,8,7]`: volume 1008, area 888. The additive target instead has
cavity ceiling 8: volume 960, area 916. ALL's second coincident-bounds owner
has cavity `[2,2,5]..[10,8,8]`: volume 1056, area 860. Remote and behind owners
are 12-by-10-by-10 boxes, volume 1200 and area 680.

A radius-1.5 circle centered at `(6,5)` cuts to the first complete exit at z3,
removing `27*pi/4`; the first target becomes `1008-27*pi/4`, area `888+9*pi/2`.
The second ALL owner exits at z5: volume `1056-45*pi/4`, area `860+21*pi/2`.
Add starts at z3 and enters the target roof at z8: volume `960+45*pi/4`,
area `916+21*pi/2`. Its source roof is z7, so copying source depth would give
a different target. Cartesian placement oracles are written independently:
`(x+24,y,z)`, `(36-x,-y,z)`, `(36-x,y,z)`, `(x,y,30-z)` and
`(18+z,y,18-x)`. Bounds map the eight original corners. Reflection about z15
may also cut the original source in ALL; that case does not assert it unchanged.

The authentic solved circle has nominal radius 0.75, driving radius 1.5 and a
retained driven placeholder 999; measured radius must be 1.5. An underdefined
variant retains two degrees of freedom. Editing the driving radius to 2 must
give volume `1008-12*pi`, area `888+4*pi`, through save/reopen, undo and redo.
Whole profiles also include an annulus with radii 2/1, two radius-one disks at
`(4,5)`/`(8,5)`, and a D contour: rectangle `[3,4]..[7,6]` plus its right
radius-one semicircle. Their areas are `3*pi`, `2*pi`, `8+pi/2`; perimeters
are `6*pi`, `4*pi`, `10+pi`. Cuts use length 3, except the annulus starts at z1
and exits z3. Its inner core remains connected through the original base.
Adds use length 5. Area increments are `length*perimeter-2*profileArea`,
except the internal-entry annular cut, whose increment is `2*perimeter`.

Other cases advance the cavity floor from z3 to z5 (volume 1104, area 832),
advance the source with a radius-0.25 one-mm blind hole, or reverse the physical
ray from offset z10. Selected misses, tangent contact, partial closing faces,
a later missing address and a later partial ALL owner must reject atomically.
Native inventory tests retain unchanged refs, virtual body roles and revisions;
staging rejects identity/checkpoint drift. A widened 48-by-10 source supports
a no-op UntilNext parent followed by a material-changing blind child at the
same address. Its remote target ends at volume `1200-pi`, area `680+2*pi`.

Causal tests fail the validator of the actual completed tool, throw after
actually releasing it, mutate source/revision after real probe cleanup, and
reject a genuinely solved open contour. The open-contour component does not
claim that its drawing produced a healthy historical seed solid. A further
original query prism has vertex tolerances raised to 0.001 by the same
reversible BRep field edit described above and a geometric gap 0.0002 from a
later ALL owner. Each prism's native tolerance and analytical metrics are
checked; real Common may detect contact/material. The test requires atomic
rejection, without presuming which native branch demonstrates it.

Native volume/area tolerance is `1e-5`, bounds `1e-6`; original 0.2-mm Common
cubes compare volume 0.008 or zero within `1e-7`. Measured driven radius uses
`1e-7`; edited native tolerance uses `1e-15`. The strict bridge's existing
pending case is replaced by a real radius-one, length-eight tool (volume
`8*pi`, area `18*pi`) against its original 10-by-10-by-8 box. Adding these
fixtures records their origin and acceptance targets, not passing results or
general platform support. Executed evidence belongs in [VALIDATION](VALIDATION.md).

## Scripted saved UntilNext desktop fixtures

The three original JSON documents pattern-until-next-cut-original.json,
pattern-until-next-add-original.json and pattern-until-next-partial-original.json
use only independently specified boxes, cavities and radius-one circles.
Coordinates/lengths use mm; volume formulas use mm³ and area formulas use mm².
No imported model or external application output supplies their expected geometry.

CUT: S is [0,0,0]..[10,10,10]. Its UntilNext circle at (5,5,z0) removes 10π:
S volume1000−10π, area600+18π. A is [20,0,0]..[30,10,8], with the original
closed cavity [22,2,2]..[28,8,6]: volume656, area688. Copying the source cut
removes both two-mm walls (4π), whereas regenerated Cut stops at the first
complete exit z2 and removes only2π. A volumes are656−4π and656−2π;
analytical areas688+4π and688+2π. B is [20,0,−10]..[30,10,−2],
volume800/area520, and stays at B@create-B. In ALL, S is remote from the
translated circle and B is behind it; neither is removed from the inventory.

ADD: S has the same10×10×8 closed-cavity construction. Its circle starts atz2
and UntilNext Add first enters the roof atz6, adding4π; S volume656+4π,
area688+6π. A is [20,0,0]..[30,10,12] minus cavity
[22,2,2]..[28,8,10]: volume912/area944. Geometry copying adds4π, a column
joined only to the floor; regeneration adds8π and joins floor to roof.
A volumes912+4π/912+8π and analytical areas944+8π/944+14π distinguish them.
Only selected additive merge is exercised; additive ALL stays gated.

PARTIAL: A is [20,0,0]..[25.5,10,8], volume440/area358 before the pattern.
The translated radius-one circle is centered(25,5), overhanging x25.5.
Its intersection area is2π/3+√3/4, so the original geometry-copy notch removes
16π/3+2√3. Regeneration has positive forward material but no whole-profile
closing face: the actual native NO_COMPLETE_FACE diagnostic must be visible
and Apply stays disabled. Only the failed regeneration preview reports the
pre-pattern A@create-A with volume440. The committed/autosaved original geometry
document keeps A@ui-next-partial-P with volume440−16π/3−2√3 during rejection and
after Cancel; both autosave reads must match the original geometry fixture.
Cancel restores the rendered original geometry-copy document through React.

The scripted workflow observes14 distinct actual worker builds if complete:
seven CUT phases, four ADD phases, PARTIAL geometry/rejection/cancel.
It checks volumes at1e−5 and bounds at1e−6, exact source/creator refs, unchanged
source prefixes and saved intent. Selected cut, cut ALL and selected Add each
use Apply, real preload/IPC Save As and reopen (six opens, three saves total).
The partial error is expected; other feature/worker/renderer/request errors fail.
No result is implied by adding this regression. Native BRep validity, area and
far-wall material probes belong to separately executed kernel tests; this UI
command does not make those queries or claim human/native-dialog interaction,
installed-package acceptance or general platform support.

## Assembly graph, rigid pose and native placement fixtures

The assembly model, reference and placement tests are original synthetic inputs
authored for issue #45. They contain no external CAD files, imported geometry,
vendor binaries or private models. All lengths are mm. The schema fixtures use
explicit opaque IDs, revision-addressed embedded documents, reusable occurrence
paths and small original rectangles. Deliberately unattested face keys test only
declaration inspection; an empty diagnostic list is not native face authority.
Cycle, missing revision, suppression, clone, strict JSON and resource-bound cases
exercise document acceptance independently of geometry or mate solving.

Pose oracles use independent Cartesian maps. Parent Z90 with translation
(10,20,30) composed with local X90 and translation (1,2,3) maps
(x,y,z) to (z+8,x+21,y+33), hence (4,5,6) to (14,25,38).
A 180-degree rotation about (1,2,2)/3 maps (3,-6,9) to (-1,10,-5).
These expected coordinates do not come from the pose helper under test.
Coordinate oracles use absolute tolerance `1e-12`; quaternion input norm
tolerance is `1e-10`. Positive and negative quaternion signs represent the same
rotation, while accepted near-unit declaration values remain unchanged.

The native placement fixture builds a 40 by 30 by 4 plate on z=0..4, centered
at the origin, with radius-3 through holes at (-10,0) and (10,0). Independent
formulas are `V=4800-72*pi`, `A=2960+12*pi`; bounds are
[-20,-15,0]..[20,15,4]. Its reusable pin has radius 2, height 12 on z=0..12,
and an eccentric radius-0.25 bore centered at (1,0):
`V=189*pi/4`, `A=495*pi/8`, bounds [-2,-2,0]..[2,2,12].
Declared pin translations (-10,0,-8) and (10,0,-8) produce three separately
owned solids, with total `V=4800+45*pi/2`, `A=2960+543*pi/4`.
These placements are supplied test inputs, not mate-solver outputs.

A left pin Z90 spin moves its bore from (-9,0) to (-10,1). Original and placed
material checks intersect real native solids with side-0.1 cubes: expected
Common volume is zero in a bore and 0.001 in material. Other tests use X90 and
noncommuting parent/local placements, with independent map
(x,y,z) to (z+6,x+1,y-7). Volume/area tolerance is `1e-5`, bounds `1e-6`, probe
volume `1e-8`. They check native validity, one-solid cardinality, independent
body/face topology, source material preservation and lifetime after disposing
prototype owners. Native fault cases preserve original operation/release errors
and withhold failed results. Topological `IsPartner` checks are not comparisons
of underlying surface pointers; geometry copying uses the native CopyGeom
contract. No tests here establish editor interaction, mates, motion, assembly
file routing, structural STEP interoperability or general platform support.

## Assembly analytic reference and numerical fixtures

The native support, snapshot, face-ownership and least-squares tests are original
synthetic cases for issue #45. They consume no external model or proprietary
artifact. Native supports come from real BRep adaptors, not fixture metadata.
The support box is [-2,-3,1]..[4,5,7], V=288 and A=264. Its canonical upper
plane is z=7 with outward +Z. A radius-2 cylinder of height 12 at (3,4,5) has
V=48*pi and A=56*pi. Native Z90 with translation (7,-5,9) moves its axis point
to (3,-2,14); X90 with translation (7,8,9) moves it to (10,3,13).
The eccentric-bore pin uses the earlier original assembly fixture. The native
hole face reverses material normal without reversing its geometric cylinder axis.
A radius-3 sphere has V=A=36*pi; an original revolved cone of radius 2 and height
4 has V=16*pi/3 and A=4*pi+4*pi*sqrt(5). Both unsupported supports reject.
Native support geometry checks use volume/area tolerance 1e-5, coordinates 1e-8,
radius 1e-12 and real queried face tolerance. Invalid
observations and release failures are causal faults after real native calls;
they are not claims of distorted/high-tolerance native model coverage.

The face catalog fixture is a box [0,0,0]..[2,3,4], V=24 and A=52, with areas
[12,8,6] for faces normal to X/Y/Z. Six mathematical unit-cube sides and Node's
SHA-256 independently supply exact expected descriptor keys for two lineages.
A radius-2 height-3 cylinder has V=12*pi, A=20*pi. Ownership cases adapt received
native instances, preserve real queries/releases and check primary plus cleanup
causes, transfer withholding and one release attempt per received wrapper.
Bounds/coordinate tolerance is 1e-6 and volume/area tolerance 1e-5.

Snapshot fixtures reuse the eccentric pin at two declared poses. Native bore
axes have world XY coordinates (-10,1) and (11,0); points along an infinite
cylinder axis are equivalent. Parameter-axis sign is retained from the native
surface rather than assumed from the nominal extrusion; the independent Z90
map is (-y,x,z). Expected XY/axis coordinates use 1e-9. Proof tests
cover frozen numeric data, clone/cross-session rejection, complete-document
changes with retained revision labels, disposal/failure revocation, actual v2
entity-circle caps after producer cleanup, exact explicit and legacy references,
nested datum frames and an actual later failed cut. The resource case reuses a
real two-body prototype 2,049 times: 4,098 expanded entries exceed admission.
It does not establish peak memory bounds or exhaust the separate face-ref limit.

Numerical oracles include Cartesian 3-4-5 columns, independent rational
Householder spectra, wide/null directions and rational minimum-norm/damped
solutions. For A=[[1,0],[0,1],[1,1]], b=[1,2,4], the least-squares solution is
[4/3,7/3]; with lambda=1 it is [9/8,13/8]. Absolute numerical checks generally
use 1e-11, with explicit scale-normalized comparisons for extreme magnitudes.
Zero matrices, rank uncertainty, iteration exhaustion, unrepresentable arithmetic
and the declared matrix dimension boundary are separate cases. None supplies
physical DOF, mate satisfaction/conflict, a complete assembly solver, editor
interaction, export interoperability or platform support evidence.

## Rigid assembly solver and editing fixtures

These new fixtures are original numerical and CAD constructions for issue #45.
No external model or target placement supplies a solver seed. Kinematics cases
use Cartesian quarter/half turns, rational rotations and the SE(3) exponential.
Analytic Jacobian cases use independent Cartesian residuals and centered finite
differences of every free-body column (steps 2e-6 and 7e-7, relative comparison 2e-7),
including both floating endpoints, component-relative frames, q/-q, conditioning
scales and distance/angle/spin/full locks. Direct numerical checks generally use
1e-10 or 1e-11; explicit small-angle cases have their own tighter bounds.

Solver cases use original plane/cylinder numeric supports, independent pivot/rank
expectations, common rigid gauge, repeated/dependent rows and complete combined
constraints. They distinguish physical norm acceptance, native-expanded length
tolerance, certified duplicate-offset/fixed conflicts, nonconvergence, rank
uncertainty, capacity and precision failures. Numeric supports are not native proof.
Off-manifold vector cases check common-transform invariance and six common
rigid null directions. A concentric gap of 8e-7 mm at scale 10, a plane gap of
8e-7 with angle error 8e-9 rad, and polar angle errors 8e-9 rad are already
accepted but must retain ranks 4, 3 and 2 respectively without refinement.
Editing fixtures use an original v1 2x3 rectangle extruded 4 mm, reused occurrence
and nested datum declarations. They cover identity, exact scope, detached data,
atomic rejection, all saved mate families and bounded undo/redo; they do not build
BRep geometry or establish native freshness.

The native solve fixture uses the original plate and eccentric pin dimensions
listed above. Initial pin translations are (-4,3,-2) and (14,-7,-1); the first
has rotation Exp(0.23,-0.17,0.31). Actual BRep radius/axis/top-plane selection
creates saved references and retains native parameter-axis signs. Solved expected
translations (-10,0,-8) and (10,0,-8) are assertion oracles only. Twelve initial
free DOF become two spins after concentric and cap-plane mates; a fresh left Z90
spin-lock capture leaves one. Native placed solids check independent formulas for
each part and totals, with V/A tolerance 1e-5 and bounds/translation 1e-6.
The left eccentric bore at (-10,1) after Z90 rejects a side-0.1 cube probe while
(-9,0) contains volume 0.001, tolerance 1e-7. Solver angle tolerance is 1e-8 rad;
length checks report max(1e-6 mm, sum of native face tolerances).

An extra signed distance of 1 mm on exactly the cap-coincidence endpoints has an
explicit incompatible-offset certificate and no published candidate/history edit.
Programmatic Apply, undo/redo, serialization and fresh native reopen retain source
and occurrence identities. Changing the shared outer radius to 2.5 and revision
to r2 keeps old r1 endpoints broken until explicit selection/repair of actual r2
faces. Both reused pins then have V=297*pi/4 and A=627*pi/8, tolerance 1e-5.
This is explicit repair, not automatic face correspondence. Reused rigid nested
datum fixtures keep child fixed state local and parent mobility separate. A real
native disposal followed by a causal exception withholds preview authority.
Nested cases also solve a free local child plane before parent relations to
that child and reject a fixed internal plane contradiction before changing
either reused parent placement.
No case establishes interactive assembly editing, flexible motion, collision
analysis, structural export, installed packages or general platform support.

## Rigid assembly workspace, scene and file fixtures

The library example and tracked `assembly-original.json` desktop input reuse
the earlier original plate/pin dimensions and source feature construction. There
are exactly two embedded sources and three occurrences; pins share one source.
The desktop root identity/date are synthetic and fixed. The library root gets
a fresh identity/date per creation. Initial left translation is (-4,3,-2), with
quaternion Exp(0.23,-0.17,0.31); right translation is (14,-7,-1), identity rotation.
These are displaced input poses; no fixture supplies solved placements or mates.
The expected left/right translations (-10,0,-8)/(10,0,-8) are checked only after
actual native mating. Initial cylinder bounds use the independent support function
`t_i + min/max(0,12*a_i) +/- 2*sqrt(1-a_i^2)`, with axis `a=R*(0,0,1)`.
Native volume/area checks use 1e-5; initial posed bounds 1e-5, final translation/
bounds 1e-6 and axis 1e-8. Solver physical check tolerances remain explicit.

The scene tests separately use declared solved-shaped placements as builder
inputs, including left Z90, and check analytical totals and local/world face
meshes against the independent map (-y-10,x,z-8). Native support witnesses are
freshly resolved afterward; display metadata does not grant authority. Hidden,
suppressed, empty, nested and reused multibody cases preserve their own meaning.
The multibody fixture has four occurrences of original 2x3x4 boxes (V=96,A=208
in total). A real concave plate-hole wall is ray-picked from inside its void,
at (-10,0,2) toward angle 0.14 rad, using actual native body/face meshes and Three
triangle intersections. This is a numerical picker check, not human/WebGL UI use.

Owned-copy/aggregate fixtures are original boxes [0,0,0]..[2,3,4] and
[5,0,0]..[7,3,4], each V=24,A=52. Z90 plus (10,20,30) maps (x,y,z) to
(10-y,20+x,30+z), with aggregate bounds [7,20,30]..[10,27,34]. They check native
validity, closed/cardinality-preserving children, independent topology and
material between children, lifetime after prototype disposal and rejection of
real empty, inverted, open and loose-vertex geometry. Native query/copy/mesh and
cleanup faults are causal on real received owners. Oversized mesh-number and
unsupported-classification faults test admission/control flow, not a claim that
those substituted numeric observations describe real source geometry.

Worker-session tests authenticate unchanged base plus proposal, reject forged/
stale/replaced/discarded tokens and mutated response documents, and capture
relative frames followed by a fresh solve. Nested full-lock oracle is translation
(-9,5,-12), Z-90 for the stated parent/child fixture. A late assembly discard and
an unknown action leave a subsequently built native 2x3x4 part available for the
existing cached STL export API. Controlled-Worker tests are transport-only; SSR
and Three planar display fixtures are rendering/selection-only. None manufactures
native authority, geometry or an accepted assembly result. Recovery/IPC fixtures
are original empty documents and malformed metadata/size variants.

The original statically allowlisted workspace desktop stage operates real rendered controls,
actual worker replies and the original preload/IPC, with file-dialog choices
restricted to its test-owned directory. It records initial DOF12, four relation
steps to8/7/3/2, fresh spin-lock capture to1, six Apply operations, Save As/reopen,
capability Cancel and an incompatible identical-plane 1mm offset. The saved file
and committed recovery must remain unchanged after rejection. Geometry and DOF
observations come from the worker; the observer supplies no React state, native
result or document replacement. The [source-specific validation record](VALIDATION.md#rigid-assembly-workspace-and-document-routing--2026-10-15)
records actual local execution separately from this fixture inventory. That original case
does not establish human pointer/native-dialog use, flexible motion, interference,
exports, installed packages or general platform support. Optional local visual
capture observed a clean reopened DOM, renderer frames and a presentation before
capturing the hidden page; its inspected PNG is interface evidence only. Later
workflow extensions and their current capture point are described below.

## Assembly part-source revision and repair fixtures

The new original `assembly-updated-pin-original.json` is a v1 part with the
earlier example pin's identity and feature construction. Its outer radius changes
from 2 to 2.5 mm; height 12, eccentric bore radius 0.25 at (1,0), explicit body
identity and cut history stay unchanged. Names/dates are synthetic. Each revised
pin has V=297*pi/4 and A=627*pi/8; with the original plate, total V=4800+153*pi/2,
A=2960+675*pi/4. Final left/right bounds are (-12.5,-2.5,-8)..(-7.5,2.5,4) and
(7.5,-2.5,-8)..(12.5,2.5,4). Volume/area tolerance is 1e-5, bounds/translation
1e-6 and quaternion orientation-dot error 1e-8. These expectations come from
cylinder/annulus formulas and the earlier independent mating coordinates.

The 35 pure declaration cases use original 2x3x4 and revised 5x3x4 boxes, a
coexisting revision with width 1, unrelated identities with identical geometry,
reused/suppressed scope expansions and dormant declarations. They cover exact
tuple selection, seven affected endpoints listed once per declaration, four
changed component declarations, retained IDs/poses/flags/mates/older revisions,
broken-path exclusion and explicit support-family repair. Malformed/executable
inputs, revision collisions, size/graph limits, serialization and bounded history
have separate cases. No pure fixture supplies native geometry authority.

The 20 native cases build real old/new parts and native face catalogs. Original
radius-2/radius-2.5 pins check volume, area, bounds and a side-0.1 cube at radius
2.25: old void, revised material volume 0.001 (probe tolerance 1e-7). Four explicit
repairs use actual revised outer-cylinder/top faces before a fresh solve/Apply;
their no-spin-lock setup retains two DOF. Finite entity-circle extrusion fixtures
check exact semantic-v2 lineage and actual changed dimensions. The depth-12 to
depth-16 cap case keeps the staged old translation -12 with the new cap at world
Z4, then the new native solve moves translation to -16. Its two radius-2 cylinders
total V=128*pi and A=144*pi, with three DOF. Its free in-plane translation and
spin are not uniquely fixed by the plane mate. Bounds are checked independently
from radius/height and the saved free translation (tx,ty): moving cylinder
(tx-2,ty-2,-16)..(tx+2,ty+2,0), fixed cylinder (-2,-2,0)..(2,2,16), plus their
Cartesian union. A nominal X=10 is not asserted as a solved constraint.
Changed entity history, direction, missing/forged face, support/body mismatch,
reused scopes and suppressed/dormant expansions do not authorize heuristic
association. Causal native query/cleanup failures and actual revoked epochs test
publication boundaries. Exact tolerances and setups remain in the adjacent tests.

Nineteen additional SSR/pure UI cases inspect source-review controls, readable
piece/scope/relation names, same-occurrence repair choices, equivalent shared
declarations, support-family filtering and blocked busy actions. One controlled
Worker case checks request/result correlation without geometry, and two actual
worker-session cases revoke older Apply authority on successful or rejected
source review. These inventories are not passing claims.

The assembly desktop workflow now continues after its original rejection case:
read the revised part through the native file bridge, cancel without changing
the file/recovery, read again, reject an unrepaired solve while keeping the panel,
manually repair four actual faces, solve/apply, undo the whole update once, redo,
save and reopen. The original left spin lock remains, so this UI case expects one
DOF. It checks the revised formulas above, exact saved identities/references and
older source preservation. The observer records actual replies only; it does not
inject model state, revision labels, expected poses or solver outcomes. In that
source-update workflow, optional visual capture occurred after the revised file
reopened; the current extended workflow captures the collision inspection described
below instead. Actual execution is recorded
in the [source-specific validation record](VALIDATION.md#assembly-part-source-revisions-and-reference-repair--2026-10-15);
this workflow does not establish human native
dialogs, broad correspondence, external-file monitoring, installed packages or
general platform support.

## Constrained assembly movement fixtures

This increment adds 80 authored cases: 27 pure model, 24 native, 26 UI/helper/SSR
and three session/transport cases. Counts are fixture inventories, not passes.

The 27 pure `assemblyMovement` cases use an original in-memory 2x3x4 part,
principal-plane mate declarations and a root/shared/wrapper graph with an older
shared revision and a dormant source. No fixture supplies native geometry or
solver output. The requested local translation (4,5,6) becomes (34,5,6) under a
parent translated +30X, and (-5,44,6) under Rz90 plus (0,40,0); these independent
coordinate oracles distinguish absolute local targets from world poses or
deltas. One shared pin declaration has three actual expanded paths, including a
suppressed parent path; the dormant source contributes none. Exact scoped IDs,
definition revisions, fixed/suppressed roles, detached data, malformed/executable
inputs, history and v1-in-v2 serialization have separate cases. These are syntax
and persistence tests, not native satisfaction or movement results.

The native movement fixtures reuse the earlier original plate and radius-2,
height-12 pins with the radius-0.25 eccentric bore at local (1,0). They first
obtain actual native mates and a fresh solved configuration, then fix the right
pin. A subsequent identity movement normalizes the selected left pin's initial spin.
An accepted left Z90 target preserves V=189*pi/4, A=495*pi/8 and bounds
(-12,-2,-8)..(-8,2,4). Independent side-0.1 cube probes at (-9,0,-2) and
(-10,1,-2) exchange void/material roles: before Z90 the former is inside the
bore, afterward the latter is. Material probe volume is 0.001. Actual native
probes, tolerance checks, linked free bodies, reused nested scopes and failure
cases belong to the 24-case native inventory; execution is recorded separately below.
They do not establish a continuous motion path. The joint free-body lock target
uses A=(10,20,30), Z90 and saved relative B=(5,0,0), identity, giving B=(10,25,30),
Z90. Shared nested targets (4,5,0), Z90 under fixed parent frames give actual
leaf translations (34,5,0) and (-5,44,0); suppressed expansions remain saved but
do not contribute native scene bodies. Comparisons use 1e-5 for volume/area,
1e-6 for pose/bounds, 1e-8 for orientation and 1e-7 for probe volume.

The 24 panel helper/SSR and two workspace SSR cases use original Cartesian
rotation oracles, opposite quaternion signs, Y180, finite-input rejection,
temporary-rank labeling and fixed/suppressed/busy gating. They do not execute
async renderer lifecycle or manufacture an accepted native reply. Two real
worker-session cases check original-base authority, immutable private candidates,
one-use Apply and lateral rejection; one controlled-Worker case is transport-only.

The desktop extension follows the revised-source workflow and precedes
the three existing interference inspections. It selects the actual revised
radius-2.5 right pin and requests a local incremental Z90 through rendered
numeric controls. For prior unit Hamilton quaternion q=[qx,qy,qz,qw], the
independent postmultiplication q*Z90 is
`[(qx+qy)/sqrt(2),(qy-qx)/sqrt(2),(qz+qw)/sqrt(2),(qw-qz)/sqrt(2)]`.
The prior local X bore offset becomes the prior local Y basis. The observed
support's local z=0 origin is `t + R(q)*[0,1,0]`; at mid-height, the bore center
would be `t + 6*R(q)*[0,0,1] + R(q)*[0,1,0]`.
This uses the actual earlier placement, not an injected expected pose. Pin
V=297*pi/4 and A=627*pi/8 remain unchanged by rigid rotation. Native unit probes
and renderer geometry/pose observations remain separate evidence types.

That scripted stage is specified to preview/Cancel, preview/Apply, verify the
natural one-DOF mechanism again without the driver and Cancel that check, Undo/Redo,
save/reopen and reject the incompatible lateral local target X=11 while retaining
the confirmed document. Cumulative file operations are specified as three Save IPC
requests and six Open requests through movement reopen; the subsequent two-box
inspection is the seventh Open. These are workflow expectations, not execution
claims or new native-dialog coverage. The final optional capture remains the
selected two-box collision with the actual floating component's movement controls,
not motion evidence. No fixture establishes real
pointer dragging, collision-free trajectories, stopping at contact, flexible
subassemblies or general mechanism/platform support. Source-specific runs and
their unchanged tolerances must be recorded separately in [VALIDATION](VALIDATION.md).

The [source-specific movement execution record](VALIDATION.md#constrained-assembly-component-movement--2026-10-15)
now records the actual Windows run of all 80 added cases and the ten scripted
movement phases. Both Cancel steps observe capability discard and the previously
confirmed scene; they do not invent a new native build or measurement. Results
and the inspected final collision capture remain separate from these oracles.

## Assembly native interference and clearance fixtures

This local increment adds 32 native cases, 16 pure model/options/identity cases,
27 UI/SSR/Three cases and three root integration cases (two real worker-session
authority cases and one controlled-Worker correlation case). These are authored
inventories, not success claims. Execution and source-specific results belong in
[VALIDATION](VALIDATION.md). Fixtures are original public-feature constructions
and original mathematical/display data; no external CAD model or binary is used.
Lengths are millimeters and volumes cubic millimeters. Model, UI and controlled
transport fixtures do not manufacture native geometry or accepted mate authority.

The native tests build actual source prototypes, independent placed BReps,
completed Common operations and checked native minimum-distance tools. Default
options are clearance 1, length tolerance 1e-6, volume tolerance 1e-6 and hidden
inclusion. The reported per-pair length tolerance can increase to the sum of
actual native shape tolerances. Native distance deflection is configured with
that effective band, and closest-point separation is independently compared
with the native value. Coordinate rounding admission is an explicit Float64
policy, not a certified numerical or SDK error interval.

Independent native oracles include:

- Two 16x10x8 boxes, local [-8,-5,0]..[8,5,8], with the second translated +12X:
  Common volume 4x10x8=320. Z90 followed by translation (10,0,0) gives second
  bounds [5,-8,0]..[15,8,8] and Common volume 3x10x8=240. A contained 4x2x2 box
  at z=2..4 gives volume 16 and native minimum distance zero.
- Face, edge and point contact inputs use translations (16,0,0), (16,10,0)
  and (16,10,8). Expected solid volume and distance are zero, with no material
  overlay. The report's contact classification remains tolerance-qualified.
- Boxes 16x0.1x0.1 overlapping by 1e-5 give positive volume 1e-7; boxes
  16x0.01x0.01 overlapping by 8e-7 give 8e-11, below the source validator's
  separate 1e-10 admission floor. Both remain **small-overlap collisions** under
  the default volume threshold. Positive-volume checks do not use that floor.
- Translation (16.5,0,0) gives clearance 0.5. A gap 5e-7 exercises contact within
  the length band without asserting exact touch. Diagonal gaps (0.6,0.8) give
  distance 1; gaps (0.8,0.8) give sqrt(1.28), so that native-tested candidate
  exceeds clearance 1 despite neither axis alone excluding it. A 2 mm axis gap
  is bounds-excluded and receives no exact-distance observation.
- Two separate 4x4x4 bodies centered 10 mm apart, reused in another component
  translated +1X, give two Common volumes 48. Internal pairs of the same leaf
  component are excluded. The legacy two-solid aggregate instead retains null
  body identity and one pair with two positive Common solids and volume 96.
  Reused nested leaf paths remain distinct and pair IDs survive sibling reorder.
- The original plate with R3 holes and actual solved R2.5 eccentric-bore pins
  gives two plate/pin clearances 0.5, without positive Common volume. Their AABBs
  overlap, so native queries decide the gap. Pin centers 20 apart imply radial
  gap 15 and justify expecting their pair to be excluded at clearance 1. A
  clearance 0.1 rerun of the analytical input returns no rows while still testing
  both plate/pin pairs. This is a separate inspection, not a kernel retry.
- Changing both reused box widths 16 to 18 under the same opaque source revision
  changes the intersection volume 320 to 480 through fresh native reconstruction.
  Hidden inclusion, suppression, empty scenes and a real missed downstream cut
  have independent inclusion/publication cases.

Native scalar/point/box mesh-coordinate comparisons generally use absolute 1e-6;
the solved plate/pin gap comparison uses 1e-5. Small-volume comparisons use
relative 1e-5 of their analytical positive value. Original source poses are
inputs or actual solved results as identified above, never expected final poses
injected as solver output. The 257-occurrence case rejects body admission before
placed-body/pair work. The mesh-budget case substitutes an oversized numeric
response only after real Common meshing to test rejection, not large-model memory
performance. Native tool/point faults adapt actual received owners, preserve real
queries/releases and check completion, solution count, nonfinite/inconsistent
observations, causal query-plus-cleanup failure and prototype-seal revocation.
No native cleanup failure becomes a clear/contact result or a partial report.

The tracked [assembly-interference-original.json](../src/cad/fixtures/assembly-interference-original.json)
is an original 2x3 rectangle centered at (1,1.5), extruded 4 along +Z. It creates
one explicit source body [0,0,0]..[2,3,4], V24. Two independently placed occurrences
at identity and translation (1,0,0) have Common [1,0,0]..[2,3,4], V12. IDs, names
and timestamps are synthetic. No external model, fabricated report or saved
solver placement supplies the collision result.

The recorded static-inspection workflow continues after source-update save/reopen
with three read-only inspections. The constrained-movement extension above is
ordered before these inspections without extending their earlier recorded scope.
Clearance 1 checks two actual 0.5 plate/pin gaps;
clearance 0.25 yields no returned pairs while both native candidates remain
counted; then the original two-box document opens through the file bridge and
reports one Common solid, V12 and mesh bounds [1,0,0]..[2,3,4]. Plate/pin witness
points must lie at radial distances 3 and 2.5 from the corresponding hole axis,
with separation 0.5. The workflow checks actual rendered rows, pair selection,
unchanged saved bytes/recovery and blocked Apply, without injecting documents,
poses, native reports or meshes. Volume tolerance is 1e-5; witness distances and
Common mesh bounds use 1e-6. These programmed controls/observations do not prove
human pointer or native-dialog operation, continuous motion, general grouping,
installed packages, export interoperability or platform support.

Optional `SOLIDFLOW_UI_CAPTURE=1` now captures the selected final two-box collision
after the three inspections, with the actual world-space material overlay. This
replaces the earlier capture point after the revised assembly reopened; the
historical execution records and earlier inspected images retain their original
scope. Capture keeps the window hidden and supplies interface evidence only;
it is not a native volume measurement or an executed-result claim for this
increment. Reports/overlays are numeric display data without an Apply token,
selected hidden participants remain non-pickable, and stale document/options or
request generations must discard the report and selection.

## Constrained world and pointer movement fixtures

The world-movement tests are original source-authored cases using the existing
public plate and eccentric-bore pin features. No external CAD file or solver
output is used as an expected placement. A top-level pin starts from an actual
native mate solve followed by an explicitly identified identity-rotation input.
Requested Z90 moves its eccentric bore from (-9,0,-2) to (-10,1,-2). Independent
0.1 mm cube/Common probes swap void/0.001 mm3 material at these points. Volume
189pi/4 and area 495pi/8 use 1e-5; probes use 1e-7 and bounds/poses use 1e-6.

The original nested fixture has a fixed child Rx90 at local (2,3,4) and a fixed
sibling at (-2,1,0), with a declared relative lock. A floating root A and fixed
reuse B share this definition. Requesting child WORLD Z90 at (10,20,30) implies
root mapping (x,y,z) to (-z,x,-y), translation (14,18,33); the sibling origin is
(14,16,32). Native validity, independent solid metrics, bounds and material
probes distinguish composition order and confirm both members move together
while B and the shared declarations remain unchanged. A separate unsolved
child-plane case starts at local Z6 and requires its internal solve before the
root target is derived. Drift and cleanup faults adapt actual native/numeric
owners; they test withheld authority, not successful geometry substitutes.

Pure graph cases use noncommuting Cartesian transforms: leaf (1,2,3)/Z90 under
inner (4,5,6)/X90 gives relative (5,2,8); root A (10,20,30)/Z90 gives world
(8,25,38), while root B (-10,0,4)/Z180 gives (-15,-2,12). Symbolic drag-session
replies test scheduling and cancellation only and provide no geometric evidence.

The tracked pointer workflow extends the existing revised R2.5 pin case. Actual
hover labels locate the manipulator's Z ring or X handle; Chromium delivers a
press, three moves and release. Native reply coordinates and the actual requested
quaternion are compared using an explicit Cartesian rotation matrix for the
eccentric bore, with world positions/bounds 1e-6, orientation dot 1e-8 and volume/
area 1e-5. Requests and replies are observed without setting Three objects, React
state, native authority or accepted poses. Cancel, Apply, single Undo/Redo,
native Save/reopen and incompatible lateral drag check committed recovery/file
preservation. Native dialog destinations remain isolated test substitutions.
No exact human rotation angle, swept path, collision stopping or general platform
support is inferred from this case.

Optional capture now occurs after the pointer result is saved/reopened, with
the selected pin and rotation manipulator in the top view. The later static
interference inspections still execute, but no longer capture the two-box view.
Historical images and validation records retain their original capture point.

## Constrained drag projection fixtures

Projection inputs are original source-authored numerical and native cases. The
pointer objective is transient numerical data; it is never inserted as a saved
mate, temporary fixed body or native reference. Translation and rotation use
explicit, independently authored primary/secondary priorities. Numerical
stationarity is local and does not prove a global closest point or safe swept
trajectory.

Pure cases build analytical unit XY planes, offset planes and unit Z cylinders
with explicit zero native tolerance. Plane target (4,-3,2) projects to (4,-3,0);
an offset plane Z2 gives (4,-3,2) from target Z5. A unit-radius selected point on
a Z hinge projects target (0,2,0) to (0,1,0), with Z90 and positional distance 1;
rotate priority instead retains requested Z90 despite another requested origin.
Two free bodies locked at relative (5,0,0) become (10,20,30) and (10,25,30)
under common Z90. A selected local (2,3,4)/X90 frame driven to (10,20,30)/Z90
implies owner (14,18,33), mapping (x,y,z) to (-z,x,-y). Scaled, permuted and
conditioned variants use these same Cartesian formulas, not projector output
as expected coordinates. Pure scheduling/SSR and fault-adapted numerical
replies do not supply native geometric proof.

A unit-circle target at its centre has equal primary cost for all hinge angles;
requested secondary Z90 must therefore remain available. Finite cost-tie probes
check that case while an outside-circle target still retains its primary Z90
minimum against a conflicting orientation preference. A separate pure case uses
owner/origin (1e16,0,0), local offset (1,0,0) and target (1e16,1,0): normalizing
before adding the offset retains the hinge's rotation derivative. This does not
claim native accuracy at that coordinate; the native adapter's independent
coordinate-resolution policy rejects such an unsafe physical scale.

The native slider uses the existing original plate/pin feature definitions,
fixes the plate and other pin, then solves one actual concentric mate. An
authenticated spin lock retains only axial freedom. Requested position
(13,4,z+5) projects onto cylinder axis
(10,0,z+5), with pointer distance 5 mm; the secondary orientation objective
preserves the starting spin. A separate unlocked variant retains two DOF and
also reaches requested Z90; actual bore/material probes check that orientation.
A strict world move to the same off-axis target remains rejected. R2 pins
retain V189pi/4 and A495pi/8; R2.5 UI pins retain
V297pi/4 and A627pi/8. Geometry, selected supports and saved mates are rebuilt
independently of the soft pointer objective.

The native hinge reuses original R2 pins for fixed ground, root axle and fixed
payload. Axle local pose is identity; payload is translated (1,0,0). Native
ground/axle cylinder axes are concentric and their z=12 end-cap supports
coincide, leaving root Z spin. Target payload (0,2,0) projects to (0,1,0)/Z90;
rotation priority with requested origin (1,0,0) and Z90 instead reports pointer
distance sqrt(2). Each placed pin is BRep-valid with one solid; independent
0.1 mm cube/Common probes give void or 0.001 mm3 material. Scalars use 1e-5,
bounds/position 1e-6, angles 1e-8 and probes 1e-7. These are separate component
solids; no collision-free or material-union claim is made for this mechanism.

The scripted UI workflow suppresses the actual right-cap checkbox after the
preceding saved assembly flow. A real front-view XZ manipulator gesture requests
both +X and +Z. Native projection must retain X10/Y0, reach the requested Z and
preserve spin, while separately reporting abs(requestedX-10) as pointer distance.
Natural root DOF remains two, without an anchor. Bounds are independently
(-20,-15,-8)..(20,15,requestedZ+12); totals remain V4800+153pi/2 and
A2960+675pi/4. Coordinate/bounds comparisons use 1e-6, scalar metrics 1e-5 and
orientation-dot 1e-8. Cancel preserves the cap-suppressed confirmed source;
Apply is one history transaction. Save As writes an isolated separate file,
reopen reconstructs it and a later Open restores the unchanged original file.

The observer copies actual requests/replies and sends normal Chromium pointer
input. It does not set React/Three state, projected poses, native results or
authority. Capture moves to the saved/reopened projected slider in front view
with the XZ manipulator selected. The projection panel and its separate pointer/
mate errors are checked while a real preview is displayed; the later capture
has no persisted preview witness. Historical captures retain their own point.
Execution results, exact cases and tolerances belong to the source-specific
validation record, separately from these authored fixture origins.

The earlier [static interference execution record](VALIDATION.md#assembly-native-interference-and-clearance--2026-10-15)
retains its own Windows run, script-encoding failure, numeric observations and
capture. Its scope does not establish in-flight analysis cancellation, hidden
participants, contact or small-overlap interaction for this projection increment.

## Rectilinear translation-stop fixtures

`src/cad/fixtures/assembly-translation-original.json` is an original millimeter
document authored from public rectangle/extrusion features. It contains a 4 mm
cube at the origin (V64, A96) and a fixed 0.5 by 8 by 8 mm obstacle translated
to X10 (V32, A144). Two declared perpendicular principal-plane coincidences
leave translation along X. The cube's right edge starts at X2; the obstacle's
left edge is X9.75. Exact geometric contact would therefore occur at cube X7.75.
A target X20 has a clear final endpoint after passing through the obstacle;
the native advancement must stop slightly before X7.75. Requested clearance
0.25 gives a stop slightly before X7.5; a target X-5 is clear. The guarded
locations are compared within 1e-5 mm, not asserted to be exact contact.

The native preview tests replace the first principal endpoint with the actual
current BRep bottom face, selected from a fresh scene. They retain the separate
perpendicular plane, check natural DOF1 and actual relation satisfaction, and
verify volume/area within 1e-7. Genuine preview/worker capabilities, response
mutation, one-use Apply, Cancel, history, serialized reopening, initial contact,
query exhaustion, incompatible targets and initially unsolved sources are
separate cases. Failure injection tests withhold authority; their injected
failures are not successful geometry evidence.

The independent native trace tests use a 16 by 10 by 8 mm box (V1280, A736)
and a 0.2 by 12 by 10 mm obstacle at X20 (V24, A248.8). First contact is X11.9,
or fraction 0.2975 toward X40; clearance0.5 shifts it to X11.4. At X12 the
material intersection is analytically 0.1 by 10 by 8 = 8 mm3. Other original
cases cover relative two-body motion (fraction0.4), a rotated nested box
(X14.9), multiple bodies (X17.9), unchanged labels with changed source content
(X9.4), reused scopes, hidden/suppressed participants and native ownership.
Guarded stop coordinates use 5e-6 mm; native mass/area/intersection metrics use
1e-6. Pure model and SSR cases use symbolic original graphs/DTOs and supply no
native geometry, real gesture or Apply authority.

`desktop-assembly-translation-flow.cjs` opens the tracked slider through the
actual file bridge, requests a stopped target, Cancel, a clear target, Cancel,
clearance0.25, Cancel, then default-stop Apply, one Undo/Redo, separate Save As
and reopen. A near-contact continuation rejects without altering saved bytes.
Only control values supply intent; the production worker provides all native
trace, scene, physical checks and private capabilities. Native dialog choices
are restricted to test-owned paths. The existing test deadlines, sandbox,
worker pool and dependency configuration remain unchanged. The optional single
hidden capture now follows this stopped document's clean committed reopening.
It proves presentation only, separately from preceding DOM and native evidence.

These fixture declarations and expected formulas are not passing results. The
source-specific validation record identifies executed commands, failures and
tolerances. Rotary/curved motion, pointer collision stopping, initial-contact
sliding, certified SDK distance intervals and exact first-contact time remain
outside these cases.

## Assembly BOM and CSV fixtures

The pure `assemblyBom.test.ts` fixtures are original declaration graphs, not
geometry fixtures. Two occurrences of G each contain two P(r1) and one Q, with
P(r2) also at root. The independent expected parts-only quantities are 4/2/1;
hierarchy gives G2, P per-parent2/total4, Q1/2 and root P(r2)1. Other original
graphs distinguish parent contexts, repeated names/IDs/revisions, hidden and
suppressed ancestors, fixed state, unused sources, empty/multibody/failed-native
part declarations, graph depth/cycles, getters and the 4,096 occurrence envelope.
Large world-placement overflow is deliberately irrelevant to this declaration
inventory. These inputs do not authenticate native geometry or solved mates.

`assemblyBomCsv.test.ts` uses original symbolic definitions and count goldens.
CSV expected records check three views, literal-text apostrophes, original
apostrophes, numeric-looking IDs, formula-like strings, leading whitespace,
comma/quote/CRLF, Unicode and invalid NUL/unpaired-surrogate rejection. A deeply
reused Unicode path fixture has a valid saved graph but an encoded report above
20 MiB, exercising complete-output rejection. No spreadsheet program executes
these strings. Node IPC cases write actual test-owned temporary files through
the real main-process handlers, with only native transport/dialog surfaces
substituted. They separately check bytes/view offsets, mutation during the
dialog, UTF-8, size, cancellation, sender/frame/navigation, path extension,
serialization, atomic cleanup and absence of document-save grants.

The SSR panel fixture derives from the public original plate/pin source and
adds original symbolic subassemblies. Two reused supports each have two active
pins and one suppressed pin; one support occurrence is hidden. A different
support has one pin and one pin is direct at root: flat total6, visible total4,
and five hierarchical rows. It tests presentation and exact-path selection
only, not native reconstruction, browser events or exports.

`src/cad/fixtures/assembly-bom-original.json` is an original public-feature
desktop fixture. Two active occurrences of G each contain two 4 mm cubes
P(r1) and one 2 mm cube Q; one G occurrence is hidden. A third G is suppressed,
a 6 by4 by4 mm P(r2) is at root, and one part definition is unused. Both P
revisions deliberately share their canonical name. The Q name is `=SUM(1,2)`;
P names contain Unicode, quotes and a comma. Names are raw display data and
literal-text marker/quoting cases in the exported CSV, not formulas evaluated
by the application. Counts are 4/2/1 or visible2/1/1; top-visible G1/P(r2)1;
hierarchy G2, P local2/total4, Q1/2 and root P(r2)1. Independently, V=4×64+2×8+96
=368 mm3 and A=4×96+2×24+128=560 mm2, with seven active solids and three exact
part revisions. Scene metric comparisons use1e-7; counts and CSV bytes are exact.

`desktop-assembly-bom-flow.cjs` opens that tracked document through actual
preload/file IPC, observes table/filter/member controls, selects the complete
hidden reused path, cancels one native CSV dialog and compares three native
CSV files with independently declared records. It checks unchanged original
bytes/recovery/history and no extra CAD requests. Existing deadlines, runtime,
pool and sandbox policies are unchanged. Native dialog choices are restricted
to owned test paths. The optional single hidden capture now follows the final
clean committed BOM table; earlier stages supply no capture. Authored case
inventories and configured workflows are not passes; actual results belong in
the source-specific validation record.

## Mechanical gear relation evidence

The pure gear helpers, solver cases and native/UI cases are original project
work. Angular expectations use explicit axis rotations, trigonometry and an
independently written scalar gear equation. Neutral rotations and lifted
angles are saved numerical declarations; only the worker's current native
snapshot can capture and authenticate the actual cylinder/carrier references.
No copied proprietary code, vendor binaries or private CAD inputs are used.

`scripts/desktop-assembly-gear-flow.cjs` reopens the unchanged public
`assembly-original.json` fixture at the end of the existing desktop scenario.
It mounts both shafts again using four actual bearing/stop controls; no solved
fixture, React state, worker result or accepted pose is injected. The original
plate and eccentric-bore pins retain their previously documented formulas:
three solids, two prototypes, volume `4800 + 45*pi/2` mm3 and area
`2960 + 543*pi/4` mm2. Independent shaft-center targets are `(-10,0,-8)` and
`(10,0,-8)`, component +Z orientation, whole bounds
`[-20,-15,-8]..[20,15,4]` mm. The actual native cylindrical supports are
directed -Z; this is distinct from the component's positive local Z.

Each pin's original radius-0.25 bore lies at radial distance 1 mm. Actual native
world-support radial vectors provide angular markers: the expected next vector
is the preceding vector rotated by explicit sine/cosine. Opposed ratio 1:2
expects +60/-30 degrees. Opposed 2:1 expects +120/-240; the latter orientation
alone is indistinguishable from +120, so saved lifted state and subsequent
operations are checked separately. Saved coordinates follow the native axes,
thus -120/+240 in that second case. Quantities use 1e-5, centers/bounds 1e-6 and
angles 1e-8 tolerances. These are analytical targets until a run records passes.

The authored workflow includes native capture, Cancel, Apply, one-transaction
Undo/Redo, ratio/direction/offset editing, suppression and independent movement,
reactivation, actual Chromium Z-ring input, native Save As/reopen and a fresh
solve. Native dialogs select owned temporary paths only. The optional single
hidden screenshot now follows the final reopened committed gear mechanism;
earlier BOM capture results remain historical evidence of their own source.
Runtime, public process pool, worker policy, deadlines and sandbox remain
unchanged. This is not tooth/contact simulation, unrestricted winding intent,
continuous multi-turn pointer operation, complete assemblies or platform proof.

## Explicit numeric rotation evidence targets

The angular motion model, native cases and UI request tests are original project
work. They use existing public synthetic definitions and independently written
axis-angle/trigonometric expectations; no new external CAD fixture is introduced.
The motion targets are calculated from the original component frame, with signed
radian increments retained separately from quaternions. Pure cases are not native
geometry or interactive evidence.

The extended `desktop-assembly-gear-flow.cjs` uses the same original mounted
plate/two-pin mechanism and actual movement controls. After changing the gear to
same-direction 1:2 with a 15-degree follower offset, +720 degrees on the left
component should increment its native -Z coordinate by `-4*pi` and the right
coordinate by `-2*pi`. Physical endpoint eccentric markers must match their
preceding positions within 1e-6 mm, while saved lifted increments use 1e-8 rad.
The actual reply must report twelve verified angular stations, evaluated driver
winding `4*pi` and winding residual at most 1e-8 rad. Cancel, repeat/Apply, a
single Undo/Redo, reset of the incremental input and native Save As/reopen are
separate targets. A 360-degree intrinsic X request must reject against the Z
bearings at an intermediate station and preserve committed recovery.

Native replies supply all candidates, scene supports and continuation witnesses.
The observer only records actual requests/replies; scripted file dialogs remain
limited to test-owned paths. No accepted pose, saved winding, scene or solver
result is injected. The existing station, solver and desktop budgets remain
bounded. These targets do not establish continuous feasibility, collision-free
rotary motion, a multi-turn pointer gesture, installed-package interaction or
platform support. Record actual passing and failed runs in VALIDATION.

The accompanying native topology/face ownership cases use original analytic
boxes and cylinders. They compare first-occurrence native identity/order,
retain the independent Cartesian face-key oracle, and observe real received
wrappers being released on success and injected query/release failure. The
fault adapters delegate actual native queries; they do not supply accepted
geometry or alter the multi-station target. These cases check the project's
explicit descriptor ownership, not every allocation inside a dependency or a
general memory bound for all CAD workloads.

The precision regression uses the same original public plate and pins with
independently declared initial spins of 0.5 and 0.24 rad about component +Z.
Fresh native capture sets their relative gear zeros. A 2:1 opposed +120-degree
explicit input has two angular stations and should produce native lifted
coordinates `-2*pi/3` and `4*pi/3`, within the unchanged 1e-8-rad comparisons.
The physical follower bore target follows sine/cosine of `0.24 - 4*pi/3`.
Internal convergence is refined rather than changing those expected values or
the public witness tolerances. The retained renderer failure that motivated
this case involved weighted residual about 8.56e-9 rad but follower error about
1.71e-8 rad; it was a convergence boundary, not a lost turn.

## Original screw mechanism

`src/cad/fixtures/assembly-screw-original.json` is an original analytical
document authored for this project from rectangles, circles, extrusions and
through cuts. Regenerate it with `node scripts/fixtures/generate-assembly-screw.mjs`.
The deterministic generator writes only that fixture; it uses no external CAD,
retained research, private model or solver output. Units are millimeters. The
three initial component attitudes are identity. The fixed support starts at
the origin, the shaft at `(0,0,-8)` and the slider at `(0,0,10)`. No mates or
captured coordinate zeros are supplied by the file.

The support is a centered 40 by 30 rectangle extruded 4 with a centered R3
through bore: volume `4800-36*pi`, area `2960+6*pi`. The shaft is R2, length 30,
with an eccentric R0.25 through bore centered at local `(1,0)`: volume
`945*pi/8`, area `1143*pi/8`. The slider is a centered 10 by 10 rectangle
extruded 6 with a centered R2.5 through bore: volume `600-75*pi/2`, area
`440+35*pi/2`. These formulas use prism/cylinder volumes, outer/inner lateral
areas and removal of both bore caps. The three independent solids sum to
volume `5400+357*pi/8` and area `3400+1331*pi/8`. They are not fused; overlapping
material, if a later motion places it there, is not subtracted from these sums.

The scripted desktop workflow selects actual cylinder/plane faces. A shaft
bearing and an 18 mm signed top-plane distance keep its origin at z-8 while
leaving spin. A concentric slider guide with freshly captured rotation lock
leaves axial translation. These stages should have natural DOF 8, 7, 3, 2 before
the captured screw reduces them to1. The original cylinder axes are native-Z
negative. With lead 2 and reverse false, shaft +720 degrees about component +Z
should retain lifted angle `-4*pi` and translate the nonrotating slider +4mm.
Slider +1 mm should drive another +180-degree shaft spin. The physical eccentric
bore point independently checks sine/cosine of the saved angle modulo a turn.
Component-origin separation checks the helical equation independently of a
cylinder's arbitrary axial parameter origin.

Scene volume/area use 1e-5 tolerances, actual coaxiality/travel and the eccentric
marker use 1e-6mm, bounds use 1e-5mm, and native axis/driver winding comparisons
use 1e-8rad. The translation-driven half-turn comparison uses 1e-5rad, derived
from the millimeter coupling/placement tolerances and lead 2, not an assumed
1e-8 angular follower guarantee. Numerical model cases use their explicitly
declared tighter length tolerances separately. Native cases also query actual
BRep/cardinality within their own execution scope.

The fixed `test:desktop:assembly-screw` command uses the existing hidden
production-loader harness with a separately owned temporary profile. It tests
native capture, reciprocal advance input, two-turn Cancel/repeat/Apply, one
Undo/Redo, bidirectional drive, incompatible target rejection, parameter
editing, suppression/reactivation and native Save As/reopen. The parent,
child and step deadlines remain 180, 170, 35 seconds respectively. Scripted events
and test-owned dialog paths do not supply geometry or worker responses. The
optional local capture remains hidden and is read-only visual evidence. This
is a set of authored checks, not an executed result or proof of physical thread
geometry, continuous collision, installed packages or general platform support.

## Original rack and pinion mechanism

`src/cad/fixtures/assembly-rack-pinion-original.json` is an original analytical
document authored from rectangles, circles, extrusions and through cuts. Run
`node scripts/fixtures/generate-assembly-rack-pinion.mjs` to reproduce it. It
contains no mates, captured coordinate zeros, vendor data or solved output.
Lengths are millimeters. Ground and pinion have identity attitudes; rack and
guide rotate +90 degrees about Y. Their initial origins are respectively
`(0,0,0)`, `(0,0,-8)`, `(-10,10,10)` and `(-40,10,10)`. Ground and guide are fixed.

The support is a centered 40 by 30 plate of depth4 with R3 centered through bore:
V=`4800-36*pi`, A=`2960+6*pi`. The pinion is R2 length30 with an R0.25 through
bore at local `(1,0)`: V=`945*pi/8`, A=`1143*pi/8`. The rack is a centered 10 by
10 prism of depth60 with centered R2.5 through bore: V=`6000-375*pi`,
A=`2600+575*pi/2`. The fixed guide is an R2 length80 cylinder:
V=`320*pi`, A=`328*pi`. Independent solids sum to V=`10800+217*pi/8`,
A=`5560+6115*pi/8`. Overlaps are not subtracted or fused.
Initial union bounds are `[-40,-15,-8]..[50,15,22]`.

The authored workflow creates a pinion bearing, an 18mm signed top-plane stop,
a rack/guide concentric relation and its freshly captured rotation lock. Natural
DOF expectations are 12→8→7→3→2; the scalar rack relation reduces this to1.
Pinion raw axis is native -Z. Rack local +Z transforms to world +X. Its actual
longitudinal edge at local x-5,y+5 has world endpoints `(-10,15,15)` and
`(50,15,15)`; the desktop workflow derives its exact identity from the native
per-edge DTO and uses an actual Chromium pointer in Superior view. Capture must
preserve placement and derive neutral travel -10mm afresh.

Default radius2 gives 2mm/radian. Pinion +720 worldZ degrees gives angle `-4*pi`,
rack displacement `-8*pi`, and rack origin x=`-10-8*pi`. Rack translation
`+2*pi` then drives `+pi` relative radians. Scene volume/area use 1e-5, native
marker/end-plane/coupling use 1e-6mm, bounds use 1e-5mm and native axis/driver
winding use 1e-8rad. Translation-driven follower check uses 1e-5rad from the
millimeter coupling tolerance; it is not a 1e-8 follower guarantee. Model/native
tests state their own tolerances separately.

The eccentric-origin native case shifts the pinion circle center to x3 and
marker to x4, while initial component origin x-3 keeps its physical axis at
world x0. A +60-degree rotation with target origin
`(-1.5,-1.5*sqrt(3),-8)` retains that axis and requires rack displacement
`-2*pi/3`. Using the moving component origin alone would add a false orbital
term. This is a bounded endpoint/station case, not proof of a continuous orbit.

The static `test:desktop:assembly-rack-pinion` command uses a separately owned
hidden production child and test-owned dialog paths. Authored checks cover
native capture, conversion/default restoration, Cancel/repeat/Apply, Undo/Redo,
bidirectional drive, rejection, edits, suppression/reactivation and Save As/reopen.
It supplies no geometry or solver replies. Deadlines remain 180/170/35 seconds.
Written checks and workflow configuration do not imply execution, tooth contact,
collision prevention or general platform support.

The combined native acceptance case adds the original screw fixture's nut and
reuses this mechanism's support/pinion as a second bearing/geared follower at
x50. Seven independent solids share five prototypes. Summed analytical
V=`16200+287*pi/4`, A=`8960+3723*pi/4` use 1e-5 tolerances. Its pinion bearing,
axial stop, rack guide, follower bearing/stop and nut guide leave four natural
freedoms; screw, 2:1 opposed gear and rack capture reduce them to3,2,1.
A +720-degree pinion drive should retain screw/rack angle `-4*pi`, gear first
`-4*pi` and second `+8*pi`, nut z14 and rack x=`-10-8*pi`; the follower's
eccentric marker returns to `(51,0)`. Fresh native checks, Apply and saved reopen
must preserve all three mechanical families together, without changing sources,
fixed/visible flags or captured zeros. This is an authored bounded expectation.

## Original flat assembly export geometry

`src/cad/fixtures/assembly-flat-export-original.json` is original analytical
geometry authored for this project. Its deterministic source is
`scripts/fixtures/generate-assembly-flat-export.mjs`; run it with Node to rewrite
only that fixture. Neither file contains imported CAD, vendor data, retained
research, native solver output or captured mate state. All lengths are mm.

The legacy part is the rectangular prism `[0,0,0]..[10,6,4]`, volume 240 mm³
and area 248 mm². The explicit-body part contains body A,
`[0,0,0]..[2,3,4]`, volume 24 and area 52, and body B,
`[10,0,0]..[11,2,3]`, volume 6 and area 22. These expectations follow
`V=abc` and `A=2(ab+ac+bc)` independently of CAD helpers.

The shared subassembly places the legacy child at `(3,4,-8)` with a +90° X
rotation and the explicit-body child at identity. Its first root occurrence
has translation `(10,-2,1)` and a +90° Z rotation. The independent composite
map for its legacy child is `(x,y,z) -> (z+6,x+1,y-7)`; its bounds are
`[6,1,-7]..[10,11,-1]`. Its explicit bodies use
`(x,y,z) -> (10-y,x-2,1+z)`, giving A bounds `[7,-2,1]..[10,0,5]` and B bounds
`[8,8,1]..[10,9,4]`. The second root occurrence is hidden, translated to
`(40,0,0)` with identity attitude. Its legacy map is
`(x,y,z) -> (43+x,4-z,y-8)` and bounds `[43,0,-8]..[53,4,-2]`; its A and B
bounds are `[40,0,0]..[42,3,4]` and `[50,0,0]..[51,2,3]`.

A separate legacy occurrence uses translation `(6,1,-7)` and Hamilton
quaternion `[0.5,0.5,0.5,0.5]`. It coincides with the first legacy child and
must remain a second solid. A suppressed child, suppressed subassembly and
suppressed empty part must contribute nothing. ALL active geometry includes
the hidden parent and its three bodies. Thus seven expanded solids share two
active part definitions and three prototype body entries. Unfused sums are
volume 780 mm³, area 892 mm² and bounds `[6,-2,-8]..[53,11,5]`.

The native flat-export tests read actual emitted STEP bytes through a fresh
native reader, count every SOLID visit, and check each analytical box's BRep,
volume, area and placement. STEP millimetres and absence of assembly-usage
entities are checked separately. Binary STL is checked by decoding actual
facets: seven rectangular prisms give 84 outward triangles and 4284 bytes,
with independently summed oriented volume, area and bounds. The separate R2,
12 mm cylinder case expects exact STEP `V=48*pi`, `A=56*pi`; STL is approximate
under the declared 0.01/0.08 meshing policy and a 1 mm³ volume comparison.
Box/native comparisons use 1e-5 tolerances, and Cartesian STL face comparisons
use 1e-6 mm. Neither roundtrip through the same native library nor a flat STEP
file proves another CAD application's interoperability or retained hierarchy.

Additional original tests cover distinct revisions, partially overlapping
solids, invalid/empty active parts, incompatible mate declarations, source
copies and output ownership. Real native transfer/write/meshing and file
queries are delegated before injected faults; cleanup failure withholds all
bytes. Count-boundary tests explicitly inject metadata cardinality or repeat
one real native SOLID child to exercise admission without claiming capacity
for 4096 independently constructed solids. These authored fixtures and checks
do not themselves record executed validation or platform support.

The additional original legacy-aggregate case adds a disjoint `[20,0,0]..[21,2,3]`
prism to the legacy `[0,0,0]..[10,6,4]` prism, without explicit body operations.
One occurrence uses translation `(10,20,30)` and a +90° Z rotation, independently
mapping `(x,y,z)` to `(10-y,20+x,30+z)`. Its single null body reference must retain
both solids: bounds `[4,20,30]..[10,30,34]` and `[8,40,30]..[10,41,33]`, summed
volume 246 mm³ and area 270 mm². The fresh native STEP reader checks both BReps
and their individual metrics within 1e-5. Binary STL must contain 24 outward
facets and 1284 bytes, with six faces per prism and volume, area and global bounds
`[4,20,30]..[10,41,34]` checked within 1e-6. Source serialization stays unchanged.
This is an authored export acceptance case, separate from earlier copy/place
tests and from rejected cardinality injections.

## Original parallel/perpendicular assembly fixture

`src/cad/fixtures/assembly-direction-mates-original.json` is an original
SolidFlow version-2 document generated from explicit parameters by
`scripts/fixtures/generate-assembly-direction-mates.mjs`. It contains no imported
CAD, private model or external application's data. Regenerate from the repository
root with `node scripts/fixtures/generate-assembly-direction-mates.mjs` and compare
the bytes before using it as a source-pinned input.

One reusable part starts with a 10×6 rectangle centered at the origin in XY,
extruded 4 mm. A radius-1 mm through bore is centered at `(2,0)` mm. The remaining
closed solid has volume `240-4π` mm³, area `248+6π` mm² and bounds
`[-5,-3,0]..[5,3,4]` mm. The bore removes two radius-1 disks and adds a cylindrical
wall of area `8π`. A top planar face, the bore's analytic cylinder axis and the
vertical corner LINE at `(5,3,z)` provide actual native support candidates.
Their geometric axes are parallel to local Z; signed native frame directions
must be checked separately rather than guessed from an entity name.

Two occurrences reuse this exact part revision: a fixed ground occurrence at
identity and a free moving occurrence translated by `(20,10,6)` mm with a +30°
X rotation. Independently, moving coordinates map to
`(20+x,10+√3*y/2-z/2,6+y/2+√3*z/2)`. Initial assembly volume is `480-8π` mm³,
area `496+12π` mm², and bounds are `[-5,-3,0]` to
`[25,10+3√3/2,7.5+2√3]` mm. The occurrence paths distinguish identical reused
entity keys; no mate exists initially. A direction relation must not silently
constrain the independent origins or turn this bore into a concentric mate.

The [direction relation contract](ASSEMBLY_DIRECTION_MATES.md) defines the
ordered support matrix and orientation branches. Derived programmatic cases
use original principal planes, real faces and LINE edges, independent poses
and deliberate invalid/stale declarations. Native support, numerical rank,
renderer interaction, persistence and file IPC evidence remain separate.
Fixture generation and authored analytical expectations do not record a test
pass, installed-package behavior or platform support.

The 63 authored native direction cases comprise the 27 support/branch
combinations and 36 integration cases. Fresh independently placed BReps check
validity, one solid per body, volume/area at `1e-5`, outer-corner bounds at
`1e-6` mm and actual analytic-support angles at `1e-8` rad. The radius-1.25 mm
source-repair variant uses `V=240-4πr²` and `A=248+8πr-2πr²`, not the radius-1
shortcut. The renderer uses volume/area and bounds at `1e-5`, world-direction
angles at `1e-6` rad and scene/saved translation agreement at `1e-12` mm.
Only the fixed ground must keep its original pose; the free component's origin
may move under the solver's rigid-body retraction. Bounds come from the accepted
pose with independent rotation formulas. These checks do not impose a new
position constraint or promise universal origin immobility.

## Original plane and cylinder tangent fixture

`src/cad/fixtures/assembly-tangent-plane-cylinder-original.json` is an original
synthetic millimeter document generated by
`scripts/fixtures/generate-assembly-tangent-plane-cylinder.mjs`. It contains no
imported geometry or private model. Run the generator from the repository root
with `node scripts/fixtures/generate-assembly-tangent-plane-cylinder.mjs` and
compare the result byte-for-byte. Generation is separate from native geometric
validation.

The root assembly is `assembly-tangent-plane-cylinder-original/r1`. Its two
embedded parts are `tangent-ground/r1` and `tangent-roller/r1`, with exact
occurrence paths `ground` and `roller`. Each uses an original XY sketch and
an explicit new-body extrusion. The fixed ground is a centered 40 by 30 mm
rectangle extruded 4 mm, with `ground-body@ground-solid`; its local bounds are
`[-20,-15,0]` to `[20,15,4]` mm, volume 4,800 mm³ and area 2,960 mm². Its top
face has outward normal +Z at z4.

The free roller is a radius-2 mm circle centered at the local origin, extruded
12 mm along +Z, with `roller-body@roller-solid`. Its local volume is `48π mm³`
and area `56π mm²`. The initial quaternion `[0,√(1/2),0,√(1/2)]` rotates the
local axis to +X; translation is `[-6,0,10]` mm. Independently, a local point
maps to `[-6+z,y,10−x]`. The initial cylinder bounds are `[-6,-2,8]` to
`[6,2,12]` mm; total assembly bounds are `[-20,-15,0]` to `[20,15,12]` mm,
with two solids, two prototypes, volume `4800+48π mm³` and area
`2960+56π mm²`. The initial document has no mates.

For a solved arbitrary roller rotation, let `a` be the independently rotated
local +Z axis, `C0` its saved translation and `C1=C0+12a` the other cap center.
The exact cylinder extent on Cartesian axis `i` is
`2√(max(0,1−a_i²))`; bounds are the smaller/larger cap-center coordinate minus/
plus that extent. Rotating the local bounding-box corners would overestimate
an oblique cylinder and is not an exact bound oracle. A tangency constraint
does not fix the free roller origin. With axis rotation held fixed, the top
plane's positive/negative branch would place its centerline at z6/z2; this
simple example must not be imposed as a universal solver-placement oracle.

The [tangent contract](ASSEMBLY_TANGENT_MATES.md) constrains infinite analytic
supports and reports their oriented-normal relation separately. Its signed
distance and angle do not establish finite trimmed-face contact or absence of
solid overlap. Numerical, fresh native, renderer and saved-file results require
their own source-specific execution record in [VALIDATION](VALIDATION.md).

Derived original native cases deliberately vary that same roller: a centered
radius-0.5 mm through-bore leaves volume `45π mm³` and area `67.5π mm²`;
a radius-2.5 mm solid revision has volume `75π mm³` and area `72.5π mm²`;
an eccentric sketch center `(3,0)` changes the axis placement without changing
radius, length or mass. Their bounds use actual accepted cap centers and the
outer radius. A separate native extraction fixture constructs a radius-2,
length-12 cylinder at `(3,4,5)`. An original eccentric radius-0.25 bore at
`(1,0)` in the corresponding origin-centered cylinder leaves volume
`189π/4 mm³` and area `495π/8 mm²`. These formulas include both annular caps
and the inner cylindrical wall.

The indirect-frame extraction case constructs its own native `gp_Ax3`,
reverses X and builds a radius-2 cylinder patch with parameter intervals
`u=[0,2π]` and `v=[0,12]`. Explicit forward/reversed face wrappers separate
handedness from face orientation. Native derivatives at `(u,v)=(0.73,4)`
supply an independent oriented radial-normal oracle. This parametric face
case does not claim a closed material solid or authorize reflected assembly
placements.

The straight-translation obstacle is an original 0.2 by 8 by 8 mm prism at
translation `(20,100,2)`, with volume 12.8 mm³, area 134.4 mm² and bounds
`[19.9,96,2]` to `[20.1,104,10]` mm. The roller at `[-6,100,6]` with a +90° Y
rotation lies outside the ground plate's finite face. Translation along +X
would first reach the obstacle at roller origin x7.9. The native stopping
policy must stop before that contact with its existing clearance/tolerances;
the tangent equations independently remain satisfied. Clear-path variants
also start outside the ground's finite face, rather than relaxing clearance
to admit an initially contacting body. These are authored expectations, not
executed outcomes.

The compatible native gear case reuses the separately documented original
plate/two-pin assembly and adds a copy of this 40 by 30 by 4 mm ground as a
fixed wall at `[-16,0,0]` with a +90° Y rotation. Its top plane becomes x−12
with outward normal +X, tangent to the radius-2 shaft axis at x−10. Four solids
have total volume `9600+45π/2 mm³` and area `5920+543π/4 mm²`. The case targets
one guided 1:2 gear pair and a 60° driver change; it does not establish every
mechanical combination or absence of interference elsewhere in that assembly.

## Original cylinder surface tangency fixtures

`src/cad/fixtures/assembly-cylinder-tangent-skew-original.json` and
`src/cad/fixtures/assembly-cylinder-tangent-parallel-original.json` are original
synthetic millimeter documents generated by
`scripts/fixtures/generate-assembly-cylinder-tangent.mjs`. They contain no
imported model or measured external geometry. Regenerate both with
`node scripts/fixtures/generate-assembly-cylinder-tangent.mjs` and compare bytes.
Generation is separate from native reconstruction and relation validation.

Each root has revision `r1` and two unmated occurrences named `fixed` and
`moving`. The embedded `cylinder-tangent-fixed/r1` part is an original centered
radius-2 mm XY circle extruded 12 mm along local +Z, with exact body identity
`fixed-body@fixed-body-solid`. It is grounded with identity rotation and
translation `[0,0,-6]` mm. Its world bounds are `[-2,-2,-6]` to `[2,2,6]` mm,
volume `48π mm³` and area `56π mm²`.

The embedded `cylinder-tangent-moving/r1` part is a centered radius-3 mm XY
circle extruded 10 mm along local +Z, with `moving-body@moving-body-solid`.
It has volume `90π mm³` and area `78π mm²`. In the nonparallel fixture its
quaternion is `[-√(1/2),0,0,√(1/2)]`, an `Rx(-90°)` rotation, with translation
`[7,-5,0]` mm. Independently, a local point maps to `[7+x,-5+z,-y]`; its axis
is +Y and bounds are `[4,-5,-3]` to `[10,5,3]` mm. In the parallel fixture
it has identity rotation and translation `[7,0,-5]` mm, with bounds
`[4,-3,-5]` to `[10,3,5]` mm. Both initial axis distances are 7 mm, so neither
fixture contains solved external or internal tangent placement.

Each assembly has two solids and two prototypes, total volume `138π mm³` and
area `134π mm²`. Initial overall bounds are `[-2,-5,-6]` to `[10,5,6]` mm for
nonparallel axes, and `[-2,-3,-6]` to `[10,3,6]` mm for parallel axes. External
support tangency targets axis distance 5 mm; internal support tangency targets
1 mm with the moving radius-3 support explicitly declared larger. The latter
does not assert material containment or non-interference.

For accepted arbitrary cylinder poses, independent exact bounds use local cap
centers, their placed unit axis `a`, and radius `r`: radial extent on world axis
`i` is `r√(max(0,1−a_i²))`. Use the smaller/larger placed cap coordinate minus/
plus that extent. The grounded occurrence must retain its pose; free origins
are not constrained to their initial translations. The
[cylinder surface contract](ASSEMBLY_CYLINDER_TANGENCY.md) distinguishes the
nonparallel scalar distance from the parallel radial distance and added angular
constraint. Oracles must use the declared family rather than choose a formula
after observing the result. Authored geometry and formulas do not claim an
executed numerical, native, renderer, file or platform pass.

Derived original native discriminators place the moving radius-3 cylinder at
axis distance 5 mm and ground both components, separating an already satisfied
external support relation from numerical convergence. Physical axis-reversal
cases use `Rx(90°)` with translation `[5,5,0]` mm for the nonparallel moving
cylinder, or `Rx(180°)` with `[5,0,5]` mm for the parallel cylinder. These reverse
the directed parameter axis while preserving the finite cylinder's placement.
Eccentric-source cases move the fixed sketch center to local x2 and the moving
center to local x3, compensating their initial X translations by −2/−3 mm.
Their radii, lengths, volumes and areas remain unchanged; accepted bounds must
include the independently rotated local sketch-center offset.

The inner-surface discriminator changes the fixed source to an original annulus
with outer radius 7 mm, inner radius 5 mm and height 12 mm, using a separate
centered circular through-cut. Its selected support is the bore. The moving
source has radius 2 mm and height 8 mm. In the parallel case the fixed extrusion
starts at `[0,0,0]`, and the moving extrusion at `[3,0,2]` with identity rotation.
In the nonparallel case the fixed extrusion starts at `[0,0,-6]`, and the moving
one at `[3,-4,0]` with `Rx(-90°)`. Both target internal distance 3 mm with the
radius-5 bore explicitly larger; endpoint reversal must exchange the saved
larger role and the two native radial senses.

The annulus has volume `288π mm³` and area `336π mm²`; the small cylinder has
volume `32π mm³` and area `40π mm²`. Each pair totals `320π mm³` and
`376π mm²`. Overall bounds are `[-7,-7,0]` to `[7,7,12]` mm for the parallel
pair and `[-7,-7,-6]` to `[7,7,6]` mm for the nonparallel pair. An analytical
support tangent location is `[5,0,z]` for the parallel generator or `[5,0,0]`
for the nonparallel case; neither is a measured finite contact report. The
nonparallel finite solids can overlap away from that location. Native body
intersection is checked separately rather than inferred from normal agreement.
Actual surface derivatives at `(u,v)=(0.73,4)` check outer/bore radial senses
independently of the production frame determinant.

The new mixed-mechanism cases reuse the previously documented original gear,
screw and rack fixtures and add an original radius-2, height-12 fixed cylinder.
For gear it uses `Rx(-90°)` at `[-6,-6,0]` mm; for rack, the same rotation at
`[4,-6,0]` mm. These use the nonparallel external family with the guided
radius-2 driver. The screw case uses the explicitly parallel family and an
identity-rotation adjacent cylinder at `[4,0,-8]` mm. Its support distance is
4 mm. The added cylinder contributes `48π mm³` and `56π mm²`; it does not add
tooth/thread geometry or a collision policy.

Expected totals are four solids with `V=4800+141π/2`, `A=2960+767π/4` for gear;
four solids with `V=5400+741π/8`, `A=3400+1779π/8` for screw; and five solids
with `V=10800+601π/8`, `A=5560+6563π/8` for rack, in mm³/mm². Each new authored
motion case requests +720 degrees through twelve existing bounded stations,
with independent driver/follower winding and eccentric bore markers, followed
by authenticated Apply and a fresh saved-document solve. These authored
expectations are not executed results or general compatibility evidence.

The parallel redundancy regressions reuse these original radius-2/radius-3
sources and a pose retained from their scripted renderer solve: moving
translation `[1.0000000083145897,0,-4.999579950764704]` mm and quaternion
`[0,-4.514114087029962e-10,0,1]`. This is generated numerical regression data,
not measured external geometry. The internal support distance remains 1 mm;
an added aligned-axis relation tests both endpoint orders against the same
near-satisfied placement. Expected rank is 3 and fixed/free local DOF is 3.
The existing analytical volume, area and exact placed-cylinder bound oracles
apply. The zero-iteration case must retain rank uncertainty without publishing
an Apply token. These expectations need source-specific execution evidence.

## Original persisted sphere construction gate

`src/cad/fixtures/sphere-revolve-original.json` is an original synthetic
millimeter document generated by
`scripts/fixtures/generate-sphere-revolve-original.mjs`. It contains no imported
geometry. Regenerate with `node scripts/fixtures/generate-sphere-revolve-original.mjs`
and compare bytes; generation alone does not establish native reconstruction.

The version-1 document has an XY sketch at offset zero, an arc centred on the
reserved origin from `(0,-3)` to `(0,3)` counterclockwise through `(3,0)`, and
a diameter from north to south. A full 360-degree Revolve around sketch local Y
creates explicit body `sphere-body@sphere-revolve`. The analytic swept region
is `x²+y²+z²≤9`, so independent targets are one closed valid solid, centre and
centre of mass `(0,0,0)`, radius 3 mm, `V=36π mm³`, `A=36π mm²` and bounds
`[-3,-3,-3]..[3,3,3]` mm. The underdefined original sketch does not claim a
fully constrained profile.

The source gate requires an actual `GeomAbs_Sphere` surface from independently
rebuilt reference-only and rendered engines after parse/serialize/reopen.
A visually spherical result, nominal radius or direct sphere primitive does
not satisfy it. It also requires exact catalog identities, genuine finite
tessellation, independent native `D1` normals away from UV poles and the
source-specific one-face/three-edge full-sphere topology: one periodic meridian
seam and two collapsed pole edges. The original poles are `(0,±3,0)`; the
generating meridian is `z=0`, `x≥0`, `x²+y²=9`. Degenerate edges need native
classification before any 3D-curve query. These are authored expectations,
not an observed topology or general platform claim.

Metric targets use `1e-5` for volume/area, `1e-8 mm` for native points,
bounds/radius and `1e-8` for differential direction; rendered vertex radius
uses `1e-6 mm`. Old plane/cylinder support inspectors must still reject the
spherical face. This gate introduces no spherical mate/reference API, and
does not prove spherical patches, cavities, finite contact or full assemblies.

## Original spherical tangency fixtures

`src/cad/fixtures/assembly-plane-sphere-tangent-original.json`,
`assembly-sphere-sphere-tangent-original.json` and
`assembly-cylinder-sphere-tangent-original.json` are original synthetic unmated
version-2 assemblies. Regenerate them with
`node scripts/fixtures/generate-assembly-sphere-tangent.mjs`. The generator
reuses the public original semicircle/Revolve sphere recipe above, with radius
2 or 3 mm, and original Cartesian rectangle/circle extrusion profiles. It uses
no imported model. Repeated generation must reproduce canonical JSON bytes;
that check alone is not native mate or renderer evidence.

Each root is `assembly-<pair>-tangent-original/r1`, with occurrences `fixed`
(grounded) and `moving` (free), identity rotations, and no mates. The moving
part is always `sphere-source-r3/r1`, local body `sphere-body@sphere-revolve`,
with centre zero and radius 3 mm. Sphere definitions retain the same local
feature/body names; their definition revision and full occurrence path remain
essential reference context. Their local bounds are centre plus/minus radius,
independent of orientation. The radius-3 sphere has `V=36π`, `A=36π`; the
radius-2 sphere has `V=32π/3`, `A=16π`, in mm³/mm².

The plane/sphere fixture embeds `sphere-tangent-plane/r1`: a centred 40×30 mm
XY rectangle extruded 4 mm, body `sphere-plane-body@plane-solid`, at identity
placement. Its bounds are `[-20,-15,0]..[20,15,4]`, volume 4800 mm³ and area
2960 mm². Moving sphere translation is `[0,0,10]` mm, so the initial assembly
bounds are `[-20,-15,0]..[20,15,13]`. The top oriented plane is z4 with normal
+Z. A positive-side target sphere centre is `[0,0,7]`, giving overall bounds
`[-20,-15,0]..[20,15,10]`; negative side gives centre `[0,0,1]` and bounds
`[-20,-15,-2]..[20,15,4]`. Both total `V=4800+36π`, `A=2960+36π`. Negative-side
material overlap is compatible with the complete-plane support equation.

The sphere/sphere fixture embeds fixed `sphere-source-r2/r1` at identity and
moving radius-3 sphere at `[7,0,0]`. Initial bounds are
`[-2,-3,-3]..[10,3,3]`. External distance is 5 mm: centre `[5,0,0]` gives bounds
`[-2,-3,-3]..[8,3,3]`. Internal distance is 1 mm with the moving sphere explicitly
larger: centre `[1,0,0]` gives bounds `[-2,-3,-3]..[4,3,3]`. Each arrangement
has two independent solids/prototypes and totals `V=140π/3`, `A=52π`.

The cylinder/sphere fixture embeds `sphere-tangent-cylinder/r1`: an original
radius-2 circle extruded 12 mm, body `sphere-cylinder-body@cylinder-solid`,
placed at `[0,0,-6]` with identity rotation. Its axis is Z, bounds
`[-2,-2,-6]..[2,2,6]`, volume `48π` and area `56π`. Moving sphere translation is
`[7,0,0]`, giving initial overall bounds `[-2,-3,-6]..[10,3,6]`. External target
distance 5 gives centre `[5,0,0]` and bounds `[-2,-3,-6]..[8,3,6]`; internal
distance 1 with the sphere larger gives centre `[1,0,0]` and bounds
`[-2,-3,-6]..[4,3,6]`. Both total `V=84π`, `A=92π`. For the internal example,
the analytic tangent point is `[-2,0,0]`, with both geometric radials −X.
The surfaces also intersect at `[2,0,±2√2]`; equal support normals do not imply
finite non-interference or containment.

The centres/bounds above are independent Cartesian target placements, not
requirements to preserve an arbitrary free origin. Accepted geometry must use
fresh actually placed centres and cylinder axes. Native BRep, normal and source
identity checks, component tests, actual pointer/worker/file workflows and
visual review remain separate. A sphere's local revolution poles lie on ±Y;
pointer targets must avoid poles and the generating seam and be verified against
actual mesh data. No numerical/native/editor/platform pass is implied by these
authored fixtures or their formulas.

The native regressions derive further original models from these recipes. An
eccentric saved sphere has local centre `[0,4,2]`: its XY semicircle has centre
`(0,4)`, endpoints `(0,1)/(0,7)`, radius 3 and sketch offset 2. Quaternion
`(.5,.5,.5,.5)` maps that centre to `[2,0,4]` before translation. Checks use the
accepted pose and this independent transform rather than prescribing a free
component origin. A separate cylinder profile centred at `[3,0]` with occurrence
X translation −3 retains world centreline X0. Standalone native extractor cases
also use an original radius-3 sphere centred at `[3,4,5]`, with `V=A=36π`:
Rz90 plus `[7,-5,9]` gives centre `[3,-2,14]`; quaternion
`(.5,-.5,.5,.5)` plus that translation gives `[3,-10,12]`. Bounds are centre ±3.

An original concentric spherical shell subtracts a saved radius-5 revolution
from radius 7. A separate radius-2 ball at `[3,0,0]` touches its inner face.
Together they have two solids, `V=904π/3`, `A=312π`, bounds ±7. The cylindrical
variant cuts a radius-5 bore through a radius-7, height-12 cylinder, placed
z−6..6, with the same ball. It totals `V=896π/3`, `A=352π`, bounds
`[-7,-7,-6]..[7,7,6]`. The selected inner radial material sense is −1 and the
ball's is +1; the internal declared larger role follows endpoint order.
Independent native `D1` normals and Common volume ≤`1e-9 mm³` distinguish these
two cavity cases from the larger-sphere/cylinder overlapping example above.
These are specific cases, not general containment or interference guarantees.

Both-fixed off-face discriminators place the plane/sphere ball at `[0,100,7]`
or cylinder/sphere ball at `[5,0,100]`. Their complete support equations hold,
while native finite-body distances are respectively `sqrt(85²+3²)−3` and
`sqrt(94²+3²)−3` mm, checked within `1e-6 mm`. Native V/A checks use `1e-5`,
placed assembly bounds and support equations `1e-6 mm`. Standalone extractor
points/radii/bounds and differential normals use `1e-8`; fresh checks also
retain each actual native tolerance. Additional
surface-crossing probes use native distance ≤`1e-8 mm` at `[2,0,±2√2]`.

Pure numerical precision regressions are separate from native geometry. They
include local terms `−1e16 + 1 + 1e16`, and an exact dyadic normalization case
with `scale=2^1023`, `L=2^−51`, body and frame translations each `3L/8`,
local centre `11L/8` and sphere radius `5L/8`. BigInt units of `L/8` give centre
17 and plane/sphere residual 12, exceeding tolerance 8; the paired spherical
sum target 6 gives residual 11. A rounded zero cannot authorize publication.
Original nested native occurrences also retain large ±`1e16` translations
around a 1 mm term. Their rejection may occur first under the pre-existing
child-scope magnitude guard; this fixture does not assert an earlier native
false pass. The spherical precision contract documents the conservative domain.

## Original signed plane-distance interval fixture

`src/cad/fixtures/assembly-limit-distance-original.json` is an original unmated
version-2 assembly generated by
`node scripts/fixtures/generate-assembly-limit-distance.mjs`. The inputs are
literal Cartesian rectangle/extrusion definitions, with no imported model.
Repeated generation reproduces canonical JSON bytes; that is not a native
geometry, mate or renderer pass.

Root identity is `assembly-limit-distance-original/r1`, with independent
occurrences `fixed` and `moving`, identity rotations, visible/unsuppressed
state and no saved mates. The fixed part `limit-distance-fixed/r1` extrudes a
centred 40×30 XY rectangle by 4 mm, body `limit-fixed-body@fixed-solid`, at
translation zero. The moving part `limit-distance-moving/r1` extrudes a centred
10×6 rectangle by 2 mm, body `limit-moving-body@moving-solid`, initially placed
at `[0,0,22]`. Features are `fixed-profile/fixed-solid` and
`moving-profile/moving-solid`. Stable synthetic timestamps precede subsequent
editing; they are not an execution time.

Independent volume/area are fixed `4800/2960` and moving `120/184` in mm³/mm²,
totalling 4920 mm³ and 3144 mm² for two separate solids/prototypes. Fixed bounds
are `[-20,-15,0]..[20,15,4]`. For an identity moving pose `[0,0,Z]`, moving
bounds are `[-5,-3,Z]..[5,3,Z+2]`; the accepted examples have overall bounds
`[-20,-15,0]..[20,15,Z+2]`. General placed-box bounds must use the eight actual
rotated vertices rather than forcing a free pose. Proper placement preserves
V/A independently of a mate.

With first endpoint the moving upper plane (local z2, normal +Z) and second
the fixed upper plane (z4, normal +Z), the signed coordinate is `q=Z-2`.
Thus minimum/interior/maximum q10/20/30 correspond to Z12/22/32. A hard request
q40 is translation Z42 and must reject; target projection may stop at Z32,
declaring a 10 mm target-position residual. From lower Z12, an inward target Z22
must release the lower boundary; an outward target Z2 must remain bounded.
The native finite-box separation for these accepted identity poses is `Z-4`:
8, 18 and 28 mm. It is separate from the complete-plane coordinate.

For opposing native normals, selecting the unrotated moving lower plane
(local z0, outward −Z) against fixed upper +Z gives `q=Z-4`; the corresponding
translations are Z14/24/34. For aligned reversed endpoint order, preserve
equivalent geometry only through an explicit interval `[-30,-10]`, with no
automatic sign reversal. A zero-width interval remains an explicit saved
two-bound declaration, distinct from a distance mate.

Prospective native checks use V/A `1e-5`, placed bounds/coordinate/clearance
`1e-6 mm` and physical orientation `1e-8 rad`. The physical plane oracle uses
fresh native D1 points and face-oriented normalized derivative cross products;
its angular comparison uses `atan2`, rather than interpreting a dot-product
error as radians. The scripted renderer checks
placed box bounds at `1e-5 mm`, the signed plane coordinate at `1e-6 mm`,
plane orientation at `1e-6 rad`, scene/saved physical rotation at `1e-8 rad`
and scene/saved translations at `1e-12 mm`. These are distinct evidence layers.
Numerical inequality, cone/KKT and precision-domain checks need
their own independent expected values. Actual native face tolerances remain
part of physical acceptance. These original formulas and targets imply no
executed pass, continuous motion guarantee, platform support or demo.

The scripted Z drag calibrates its screen-coordinate mapping with two real
held-pointer movements, their received DOM client coordinates and their posted
requested poses. A passive observer records input without writing document,
camera or manipulator state. The third real
movement targets the unchanged literal destination 42 or 22 mm. Calibration
does not read projected CAD geometry or change the declared precision; the
independent final position, signed interval and pointer-deviation checks remain.
All three movements share the original drag anchor and unchanged viewport.
Before the inward drag only, one real pixel-mode wheel event with delta −1000
zooms the front view. This is recorded separately from the four pick/drag
gestures; it performs no CAD operation. The existing OrbitControls pixel-wheel
rule gives a zoom factor `1/0.95^10`. The final literal assertions remain the
acceptance test rather than an assumed mouse-coordinate resolution guarantee.

## Original principal direction-angle interval fixture

`src/cad/fixtures/assembly-limit-angle-original.json` is an original synthetic
unmated assembly created for the principal-angle interval proposal. It is
generated by `node scripts/fixtures/generate-assembly-limit-angle.mjs` from
literal Cartesian rectangles, depths and one analytical rotation. No imported
CAD model, vendor data or external application supplies its geometry.
The timestamp is fixed at 2026-10-19T00:00:00Z; two local generator executions
produced byte-identical JSON. Repeated generation and declaration checks are
separate from unexecuted native, solver and renderer acceptance targets.

Root `assembly-limit-angle-original/r1` embeds independent
`limit-angle-fixed/r1` and `limit-angle-moving/r1` part definitions, two
occurrences and no mates. The fixed part extrudes a centred 40×30 mm XY
rectangle through 4 mm into explicit body `angle-fixed-body`, with identity
pose. The moving part extrudes a centred 10×6 mm XY rectangle through 2 mm
into `angle-moving-body`, with translation `[0,0,22]` and Rx(60°), quaternion
`[1/2,0,0,sqrt(3)/2]`. Feature IDs are `fixed-profile/fixed-solid` and
`moving-profile/moving-solid`; source geometry and body identity must survive
all mate operations.

Independent solid/area targets are V=4800/A=2960 for the fixed box and
V=120/A=184 for the moving box, totaling V=4920 mm³ and A=3144 mm². Native
acceptance also needs valid BRep, two solids and appropriate material probes.
For an arbitrary verified saved rigid pose, transform the eight local box
corners to compute bounds independently of the CAD bounding-box helper.
For Rx(theta), moving local `(x,y,z)` maps to
`(x, y*cos(theta)-z*sin(theta), 22+y*sin(theta)+z*cos(theta))`.
At 60°, its bounds are
`[-5,-3/2-sqrt(3),22-3*sqrt(3)/2]` through
`[5,3/2,23+3*sqrt(3)/2]`. Rotating or translating a separate occurrence
does not change the solid mass or embedded part declarations.

The fixed top cap has outward normal `+Z`; the moving top cap has local
normal `+Z`, so its world normal at 60° is `[0,-sqrt(3)/2,1/2]` and the
principal angle is 60°. A local top point `(1,1,2)` is strictly inside the
moving cap and can support actual pointer selection; native face identity
and ray selection must be observed rather than assumed from this point.
Fresh actual surface D1 points/oriented normals are required for native
angular checks. Scene support vectors and screenshots are separate evidence.

For bounds `[30,120]` degrees, analytical targets include 30/60/120°,
strict destinations 15/150° outside the interval, projected stops at 30/120°
and release inward to 60°. Principal angle is `acos(cos(theta))`; swapping
references preserves it. Opposite cap normals complement the angle and need
explicitly complementary bounds. Translation is unconstrained by this mate.
Equal endpoint/domain intervals, initially violated parallel/antiparallel
starts, all native plane/cylinder-axis/LINE combinations, constrained
second-order opening and sampled paths need their own declared fixtures and
checks; this one regular two-box input does not establish them.

Planned native angular comparisons use actual D1/axis/LINE measurements and
an explicitly recorded radian tolerance. Renderer bounds/mass checks,
reported-angle checks, physical rotations, saved poses and pointer input
have separate tolerances recorded with their actual tests. No authored
expectation changes an existing solver tolerance, trial budget or deadline.
These formulas do not imply an executed feature pass, finite contact,
signed rotation stops, full assembly acceptance, platform support or demo.

The separate authored curved-mechanism cases in
`src/cad/kernel.assembly-limit-angle.test.ts` reuse only original primitives:
the existing `direction-block` (10×6×4 mm box with an eccentric R1 through-bore
at local `(2,0)`) and the new 10×6×2 mm moving box. Rigid definitions
`curved-rotor-a` and `curved-rotor-b` each contain fixed children `axis` and
`normal`. The axis child uses Ry(90°) or Ry(45°), respectively; its normal-box
child has identity placement. `curved-ground` contains fixed `guide-a` and
`guide-b` with the matching bearing placements. Root occurrences A/B start
free at identity and G fixed at identity. This construction uses ordinary
nested rigid placements, with exact native leaf references; it needs no new
sketch plane or imported geometry.

Two native concentric relations and two matching cap-plane stops leave two
rotor spins. A captured same-direction gear with ratio `sqrt(2):1` leaves one
coupled spin. The actual native parameter-axis signs must be queried: the
analytical target is `-X` for A and `-(X+Z)/sqrt(2)` for B. With physical
rotations `thetaA=t`, `thetaB=sqrt(2)*t`, captured lifts then have the matching
negative signs. Selected normal-box TOP normals both start `+Z`; selecting
the actual B BOTTOM normal supplies the antiparallel variant. The required
intervals are `[30,60]` and `[120,150]` degrees. Bilateral rank eleven and one
bilateral DOF for the two free root owners are analytical acceptance targets.

Their independent world normal formulas are
`a=(0,-sin(t),cos(t))` and
`b=((1-cos(sqrt(2)*t))/2,-sin(sqrt(2)*t)/sqrt(2),(1+cos(sqrt(2)*t))/2)`.
At zero, the first relative tilt derivative vanishes, while the second is
`-X`; the principal angle opens as `t²/2+O(t³)`. At `t=pi/2`,
`a dot b=sin(pi/sqrt(2))/sqrt(2)` lies strictly between `1/2` and
`sqrt(3/8)`, placing the angle inside `[30,60]`. The opposite B normal
complements that interval. A zero first derivative is therefore not a proof
of conflict. A bounded solver must find a real valid result rather than use
this analytical reference pose as an input or hidden seed.

The bore is eccentric: its bearing pivots are
`pA=(0,0,-2)` and `pB=(sqrt(2),0,-sqrt(2))` up to ordinary rotation arithmetic.
Root translations must follow `p-R*p` to retain the fixed guides; assuming
every root translation remains zero would be wrong. The existing SE(3)
exponential can follow this bearing subgroup directly. This example checks
the actual bearing manifold and second-order angular opening, but does not
by itself establish nonzero iterative hard-manifold correction or general
curved-mechanism continuation.
Four bored blocks and two normal boxes give six separate leaf solids, with
analytical total V=`1200-16*pi` mm³ and A=`1360+24*pi` mm² if those metrics
are checked. Coincident or overlapping supports do not prove material contact
or non-interference. Actual native normals/pivots, accepted gear lifts,
input immutability, authenticated Apply and fresh saved reopening remain
separate required checks. These are authored targets, not executed results.

The separate authored desktop workflow uses the rotated two-box document,
one actual native top-cap pick and five local-X rotation drags. Each drag
calibrates its third held-pointer input from two received DOM coordinates and
their actual posted request quaternions; it does not use projected CAD output
as input feedback. Literal 15° and 150° targets project to 30° and 120°;
returning to 60° exercises inward release at both bounds. Cancel/repeat,
history, suppression/reactivation, deletion, contradictory intervals, equal
0°/180° declarations, reference reversal and saved reopening have distinct
authored phases. Ordinary Cancel rebuilds and intermediate requests are not
included in the 46 registered-phase inventory. Two Opens and one Save As use
test-owned native-dialog paths; the complete child and step deadlines remain
unchanged.

The authored independent renderer assertions use `1e-6 rad` for requested
physical quaternion error, resolved physical quaternion error, actual native
support angle and pointer angular deviation. Scene/saved physical rotations
use `1e-8 rad`, scene/saved translations `1e-12 mm`, projected secondary
position `1e-6 mm`, and displayed box bounds/volume/area `1e-5` absolute in
their units. Native tests have separate actual BRep/D1/axis/LINE expectations
at `1e-8 rad`, box bounds at `1e-6 mm` and volume/area at `1e-5` absolute.
These separate tolerances are acceptance targets, not a universal precision
certificate or evidence that any command has passed.

## Native solid traversal lifetime regression

The additional `kernel.native-topology.test.ts` integration cases use an
original Cartesian 2 × 3 × 4 mm box and a second disjoint copy translated
10 mm in X. A corresponding saved feature declaration creates the same box
from a centred rectangle and a 4 mm extrusion with explicit body identity.
The tests delegate actual native explorer queries and deletion, observe every
raw solid result, compound builder and raw compound and require deterministic
release before observer cleanup, including an actual Add followed by an
injected staging failure.
The same original prism also checks deterministic face, direction-vector,
prism-builder and raw-result release. A completion-query fault follows a real
successful native prism construction and precedes requesting its result, so
the test itself does not lose an unreturned raw result. The original feature
input must remain unchanged and the failed rebuild must withhold current body
authority.
They cover repeated body/aggregate validation, genuine two-solid rejection
and both rendered and assembly-reference rebuilds, while checking borrowed
BRep validity and Cartesian bounds at 1e-6 mm. These lifetime observations do
not substitute for the separate interval geometry and desktop checks.

## Original planar catalog frame lifetime fixtures

The eleven additional `kernel.faces-ownership.test.ts` cases use the original
2 × 3 × 4 mm box from that file. Two faults run the real native Normal or D0
query before throwing; five faults physically delete one distinct frame owner
before reporting failure. They require all received temporaries to be released
and an incomplete catalog to be withheld, while the borrowed source remains
valid. The five owners are the normal point/vector/face query and the surface
adaptor/point. These observations do not measure the whole WASM heap.

Four compatibility inputs map the box by `p'=R*p+[7,-5,11]` mm. R is identity,
a positive Z quarter-turn, or the explicit oblique matrix with rows
`[2,-1,2]/3`, `[2,2,-1]/3`, `[-1,2,2]/3`. The fourth case uses the translated
identity placement and a real native Reversed wrapper. Independent Cartesian
corner/edge coordinates supply the six support planes, bounds, normalized
descriptor inputs and SHA-256 reference keys. Frame normals are signed matrix
columns; the origin is the projection of the world origin onto each support.
Frame X is the projected world X direction, falling back to world Y at an
X-normal plane. No catalog query supplies these expectations.

The positive-volume placed body must retain valid BRep, one solid, V=24 mm³
and A=52 mm². The separately reversed wrapper has signed V=-24 mm³, A=52 mm²
and the same bounds; it checks orientation compatibility, not admission as a
positive-volume body. Bounds and frame comparisons use 1e-6 in their units,
volume/area use 1e-5, and descriptor keys compare exactly. The original source
also remains valid and unchanged. These are authored acceptance cases whose
actual execution belongs in the validation record.

## Original owned primitive sketch fixtures

The 35 authored `kernel.primitive-sketch.test.ts` cases use an original 2 × 3
mm rectangle or R2 mm circle, each centred at local `(1.25,-0.75)`, with named
plane offset 1.5 mm and extrusion depth 4 mm. Eight geometry cases cover both
profiles in XY, XZ and YZ and on an explicit oblique frame. That frame has
origin `[7,-5,11]` mm, X=`[2,2,-1]/3`, Y=`[-1,2,2]/3` and normal
`[2,-1,2]/3`, the columns of the proper 60-degree rotation about `(1,1,1)`.
The support-frame route uses the specified frame origin rather than the
separate named-plane offset.

Independent targets use `C=O+1.25*X-0.75*Y`. The rectangular prism's eight
corners are `C+u*X+v*Y+d*N` for `u=±1`, `v=±1.5`, `d=0,4`; their coordinate
extrema give its bounds. For the cylindrical prism, coordinate i has bounds
`C_i+min(0,4*N_i)-2*sqrt(1-N_i²)` through
`C_i+max(0,4*N_i)+2*sqrt(1-N_i²)`. Volume/area targets are 24 mm³/52 mm² and
16*pi mm³/24*pi mm², respectively. Each geometry case requires valid native
BRep and one solid. Bounds use 1e-6 mm, volume and area use 1e-5 absolute in
their units, and origin/direction metadata use 1e-12 in their units.

Eight separate compatibility cases compare actual native edge traversal and
samples at normalized parameters `0,.125,.25,.5,.75,1` exactly against the
previous SDK construction route, including the circle's default seam. Native
face and edge reference declarations also compare exactly. Those comparisons
establish compatibility with the previous route; the Cartesian formulas above
supply independent geometric expectations. Reference consumption and complete
saved-document reopening remain distinct evidence boundaries.

Two success cases observe every received physical owner: 48 for a rectangle
and 18 for a circle, with only the wire and two metadata vectors retained by
the returned Sketch. Three faults run real Normalize, SetTransformation or
wire Build work before throwing. Thirteen physical-delete faults combine a
real deletion with a rejected result transfer and require every received owner
to be attempted. Fallback cleanup is counted separately and cannot satisfy
those assertions. The final case injects a real completed wire Build failure
in the ordinary engine path, requires current body authority to be withheld
and preserves the source declarations exactly.

These fixtures exercise the project-owned ordinary primitive construction
boundary. They do not establish arbitrary allocation failures inside a
third-party constructor before it returns, deterministic release in every
operation builder, full assembly readiness or resolution of the cumulative
native fault. Actual execution is recorded separately in VALIDATION.md.

## Original native validation context fixtures

The `kernel.native-validation.test.ts` fixtures are original native primitives
in millimeters. Box A uses the public direction-block dimensions, with bounds
`[-5,-3,0]` through `[5,3,4]`, V=240 mm³ and A=248 mm². Box C has corner
`[7,-5,11]` and dimensions 3 × 2 × 5 mm, giving bounds `[7,-5,11]` through
`[10,-3,16]`, V=30 mm³ and A=62 mm². Cylinder D is R2, height 3 mm, on the
global Z axis: V=`12*pi` mm³, A=`20*pi` mm² and bounds `[-2,-2,0]` through
`[2,2,3]`. These expectations use box and cylinder formulas, not the context
under test.

Malformed solid B is assembled from five oriented faces of A, omitting the
top face at Z=4 mm. Native shell/solid construction alone does not certify
validity. The independent topological witness requires five faces and twelve
unique edges: four edges incident to one retained face and eight incident to
two. Fresh native analyzers with full and topology-only checks must both
reject it before it can serve as an invalid-input oracle. No native validity
result is replaced with a mocked rejection. B is never admitted as a body.

The batch integration cases retain separate A and C bodies, with two solids,
total V=270 mm³, A=310 mm² and bounds `[-5,-5,0]` through `[10,3,16]`.
Coordinates use absolute error below `1e-6 mm`; volume and area use absolute
error below `1e-5` in their units. Validity booleans, topology counts, serial
and inexact analyzer flags, catalog metadata and native wrapper identities are
checked exactly. Identity and source preservation do not come from sorting
or comparing measured geometry.

Each context covers one final staged entry/aggregate validation batch or one
assembly aggregate/child-solid validation call. Its borrowed shapes remain
owned until its analyzer is retired, before outer cleanup or transaction
transfer. A false first seed is
an ordinary geometry rejection and retires the analyzer; it is not assumed
to be a valid reset checkpoint. After a valid seed is established, checks of
later valid or invalid inputs must restore it. The existing positive-volume,
solid-count, shell-closure and loose-topology rules remain separate checks.
Standalone body validation and intermediate operation scopes retain their routes.

Fault adapters delegate real native Init, IsValid or physical deletion before
throwing, including falsy thrown values and combined primary/reset/release
errors. Separate flag-report adapters follow real flag queries. The cases
require staging failures to withhold transactions and preserve source metadata
and entry/shape/wrapper identity. A separate fatal rebuild case must withhold
current body-copy authority and permit a fresh valid rebuild. A guard probe
runs before physical analyzer retirement;
fallback cleanup is counted separately and cannot satisfy release assertions.

Eight additional assembly cases reuse A, C and malformed B. Single-solid and
two-solid success cases require one analyzer and exactly one or two received
child wrappers. Their native volume, area and bounds use the independent
targets and unchanged tolerances above. The open B case requires the real
aggregate query to reject it before any child wrapper is acquired. A valid
compound containing A plus a face of C must retain the loose-geometry
rejection; a valid face-only compound must retain the no-solid rejection.
Three faults occur after a real child validity query, reset Init or physical
analyzer deletion. They must withhold the result, preserve the original error
inside a fatal aggregate and release the analyzer before every child wrapper.
Exact owner counts and zero fallback releases prevent cleanup from passing
without exercising the context.

The existing three assembly-copy query/release fault cases target the nested
context in the second aggregate validation. They retain actual native query
and physical-delete work, require one candidate-copy release, revoke current
copy authority after a fatal fault and require recovery on a fresh valid
rebuild. They do not change saved references or document serialization.

Within assembly validation, each target check resets to and checks the whole
aggregate seed. That repeated work may grow with the number and complexity of solids.
Fewer analyzer constructors per call does not establish lower memory use,
faster validation or resolution of cumulative native-memory growth. No context
is shared across placement calls, engines or rebuilds.

These are authored acceptance checks, not execution results. They do not
establish same-wrapper mutation, geometric-parameter-invalid equivalence,
native thread safety, platform support or resolution of the cumulative
native fault. Actual execution is recorded separately in VALIDATION.md.

## Assembly interference selection fixtures

The scope tests are original synthetic declarations and public primitive
features authored for SolidFlow. They contain no imported model or vendor data.
Model tests use symbolic shared subassembly/part definitions to check full paths,
exact revisions, ancestor expansion, suppression, visibility and exclusion
precedence; they do not supply native geometry evidence. Component tests use
symbolic report DTOs only for labels, controls and identity preservation.

The native interference test extends its existing 16 × 10 × 8 mm rectangle
extrusions with four occurrences translated to X = 0, 12, 24 and 40 mm. The
six unordered pairs are enumerated manually. Their minimum distances are
0, 8, 24, 0, 12 and 0 mm in AB, AC, AD, BC, BD, CD order. AB and BC each
overlap by 4 × 10 × 8 = 320 mm³; CD touch without positive solid volume.
Selecting A/C admits AC alone for the selected-only mode, and AB/AD/BC/CD
for the crossing mode. Native distances, witness separation and volumes use
the existing absolute 1e-6 tolerances. Reused subassembly cases use two local
boxes at X = 0/12 mm and parent translations 0/24 mm, retaining distinct paths.
Additional cases check hidden/suppressed ancestry, valid empty parts, stale
references before native construction and exclusions before body admission.

The scripted desktop workflow derives a temporary input from the tracked
`assembly-interference-original.json`: the original 2 × 3 × 4 mm boxes at
X = 0/1 mm remain, with two expansions of one single-box subassembly added at
X = 20/21 mm. This derivative is created in the isolated test input before
opening it through the application. Neither a model nor a report is injected
into the renderer. The two positive Common volumes are independently
1 × 3 × 4 = 12 mm³, checked to 1e-5 mm³; distance and mesh bounds use
1e-6 mm. The manually expected candidate counts are all = 6, among root
boxes = 1, root boxes against the rest = 4, one exact nested exclusion = 3,
selected nested parent against the rest with its sibling excluded = 2, and
exclusion of both nested leaves including the selected descendant = 0.
Original and derived input hashes are retained separately in the test report.
Worker transport mocks check message correlation only; separate real native
worker-session cases cover reused carriers and exact exclusions.

These fixture definitions are acceptance criteria. Passing commands and their
actual source/platform scope are recorded separately in VALIDATION.md.

## Reusable assembly import fixtures

`assembly-import-parent-original.json` is an original empty v2 parent document.
`assembly-import-subassembly-original.json` is an original GPL-3.0-only
composition of the unchanged public two-body part from
`assembly-interference-grouping-multibody-original.json`. Its source assembly
S contains one identity-placed fixed occurrence `m`. A single aligned XY
coincidence relates S's own null declaring frame to m's principal XY plane.
There are no external model files, geometry conversion or source links.

M contains independent boxes `A=[0,2] × [0,3] × [0,4]` and
`B=[1,3] × [0,3] × [0,4]` mm, each V24 mm3/A52 mm2. A root occurrence of S
with Rz90 degrees and translation `[10,20,30]` has literal material bounds:

| Body | Minimum, mm | Maximum, mm |
| --- | --- | --- |
| A | `[7,20,30]` | `[10,22,34]` |
| B | `[7,21,30]` | `[10,23,34]` |

A second imported S at identity retains the original bounds. Both occurrences
share one M prototype but have distinct complete `[new-root-id,m]` paths.
Four placed solids sum to V96 mm3/A208 mm2; these are body multiplicities,
not material-union measurements. Volume/area use 1e-5 absolute bands and
bounds/placement use 1e-6 mm. The desktop workflow independently checks the
quaternion action on the X basis against `[0,1,0]` for the rotated instance.

The native CAD case validates closed placed solids, exact body/producer keys,
local declarations, reused prototypes, transformed bounds and saved round trips.
An actual solve verifies two native local-plane checks, one per root context,
and the shared S scope has zero local DOF. The parent has two free roots;
the local result does not imply zero parent DOF.

The desktop workflow uses actual Import controls, worker builds, numeric
movement preview/Apply, an incompatible-content rejection, repeated import,
Undo/Redo, Save As/reopen and fresh Solve/Cancel. A test-owned rejected source
is generated before opening: it retains the source ID/revision and changes
only its name. It must fail before worker geometry allocation, preserving
recovery, history and Apply state. An initial Save As establishes the parent
filepath. After import, ordinary Save writes that parent's file without another
dialog and leaves the source intact. A final Save As/reopen preserves the earlier
parent bytes. The fixed queue exercises five Open requests, two Save As dialogs
and three save IPC calls. Picker cancellation is not part of that queue.

After reopening, internal-body inspection has six candidates: two tested
internal Commons of V12 mm3 and four bounds-excluded cross-root pairs. The
transformed Common bounds are `[7,21,30]..[10,22,34]`; the identity Common has
bounds `[1,0,0]..[2,3,4]` mm. Grouping retains four cross-root candidates, all
bounds-excluded, and reports no hits. This distinguishes the two original root
occurrences from their shared source definition. Inspection preserves history,
recovery and file bytes, and grants no Apply authority.

The 21 model import cases use separate original declarations and boundary
inputs, including synthetic point/width reference keys. Those keys assert
syntax preservation only and provide no native topology or solve authority.
The byte case uses 4,000 suppressed four-plane declarations with long paths:
compact data fits the existing 20 MiB boundary while pretty UTF-8 persistence
does not. No threshold is widened to admit it. Model and editor cases are
separate from the one native geometric fixture; executed commands and limits
belong in [validation](VALIDATION.md).

## Grouping with selected and excluded fixtures

`assembly-interference-grouping-scope-original.json` is an original
GPL-3.0-only composition derived from the public grouping-multibody fixture.
Its embedded part definition is unchanged. To reproduce the composition, keep
the two identity-placed root `g-left`/`g-right` occurrences of `G={S}`, replace
S's one M occurrence with `m1` and `m2`, both referencing the same M definition,
and retain identity poses with no mates. The four leaves have exact paths
`[g-left,s,m1]`, `[g-left,s,m2]`, `[g-right,s,m1]` and `[g-right,s,m2]`.
There are eight placed source solids and one part prototype. No external model,
conversion or proprietary geometry is used.

M contains independent boxes `A=[0,2] × [0,3] × [0,4]` and
`B=[1,3] × [0,3] × [0,4]` mm, each V24 mm3/A52 mm2. Every pair of distinct M
occurrences has Common matrix `[[24,12],[12,24]]` mm3, sum 72. Each M also has
one internal A/B Common of 12 mm3. With internal inclusion true, the desktop
workflow uses these literal expectations:

| Scope | Grouping | Pairs | Pair volume sum, mm3 |
| --- | --- | ---: | ---: |
| All four leaves | Off | 28 | 480 |
| All four leaves | On | 16 | 288 |
| Both leaves within g-left | On / off | 0 / 6 | 0 / 96 |
| Both g-left leaves selected, m2 excluded | Off / on | 1 / 0 | 12 / 0 |
| g-left plus g-right/m1 selected | On | 8 | 144 |
| g-left/m1 selected against the rest | On | 8 | 144 |
| All, excluding g-left/m1 | On | 8 | 144 |

The sums retain pair multiplicity; the material union remains 36 mm3. Checks
retain exact original leaf/body references and compare Common mesh bounds with
literal box intersections. Volume/area use 1e-5, lengths/bounds 1e-6 mm and sums
1e-4 mm3 absolute bands. Inspection controls revoke report/highlight without
requesting automatic worker work; source bytes, recovery and history remain
unchanged. The separate-solid warning is expected once per part definition.

Native unit cases reuse the public two-body part unchanged, duplicate M
within S and reuse G at two roots. They use independent explicit leaf-pair lists and the
literal Common matrix, including overlapping ancestor/descendant selection,
exclusion priority and inherited visibility/suppression cases. These assertions
are separate from the desktop sequence. Executed results and precise coverage
belong in [validation](VALIDATION.md).

## Grouping with internal-body fixtures

`assembly-interference-grouping-multibody-original.json` is an original
GPL-3.0-only composition of public SolidFlow features. Its embedded part
definition is copied unchanged from the existing
`assembly-interference-multibody-original.json`, without external geometry or
model conversion. `S={M}` and `G={S}` reuse that part in two root occurrences,
`g-left` and `g-right`. All poses are identity, with no mates. There are two leaf
occurrences, four bodies and one native part prototype.

The two bodies of M are independent 2 by 3 rectangles extruded 4 mm:
`A=[0,2] × [0,3] × [0,4]` and `B=[1,3] × [0,3] × [0,4]` mm. Each has volume
24 mm3 and area 52 mm2; their Common is `[1,2] × [0,3] × [0,4]`, volume 12 mm3.
Including internal pairs without grouping gives six observations: two identical
cross-root pairs of 24 mm3 and four A/B pairs of 12 mm3, sum 96 mm3. Grouping
keeps the four cross-root pairs with matrix `[[24,12],[12,24]]`, sum 72 mm3.
These sums are multiplicities, separate from the literal material union of
3 by 3 by 4 = 36 mm3. Disabling grouping restores all six original pair IDs
while internal-body inclusion remains true.

Three native unit cases construct those same literal solids directly with
public features: two root parts, two reused one-level subassemblies and a
single subassembly containing one part. They check the four crossed pairs or
zero grouped pairs for the single-root case, retained flags, valid placed
source solids and unchanged declarations. The desktop fixture separately
checks two assembly levels with exact `[g-left,s,m]` and `[g-right,s,m]` paths.
It checks V/area and Common volumes to 1e-5, distance and mesh bounds to
1e-6 mm and pair sums to 1e-4 mm3. Scripted controls also check report/highlight
invalidation, requested options and unchanged file/recovery/history. The
expected separate-solid warning is asserted literally once per prototype.
Authored assertions and configured CI do not establish execution or platform
support; actual results belong in [validation](VALIDATION.md).

## Root-subassembly grouping fixtures

The grouping cases in `src/cad/kernel.assembly-interference.test.ts` are original
project-authored rectangle extrusions and rigid placements. Each prism measures
4 × 6 × 4 mm, with volume 96 mm³ and area 128 mm². Their X intervals are A=[1,5],
B=[4,8] and C=[3,7], with Y=[-3,3], Z=[0,4]. The common YZ area is 24 mm²;
therefore AB=24, AC=48 and BC=72 mm³. Flat, one-level and two-level group layouts
share these literal world coordinates. Reused-group tests reconstruct one part
prototype and retain six separate leaf/body occurrences, including reordered
root occurrences. Source volumes/areas, pair identities, DTO copying, unchanged
input and rejection before native allocation have separate assertions.

The tracked [desktop fixture](../src/cad/fixtures/assembly-interference-grouping-original.json)
was authored directly from the same coordinates on 2026-10-22 under the project
GPL-3.0-only license. It uses three original XY rectangle sketches with centres
(3,0), (6,0), (5,0), width 4 and height 6, followed by separate-body extrusions
of depth 4. All declared poses are identity. `S={A,B}`, `G={S,C}`, and two root
occurrences reuse G. There are three part prototypes, six solids and no mates.

For two coincident Gs, all fifteen body pairs overlap. The nine cross-root pairs
have the literal matrix, with rows/columns A, B, C:

| | A | B | C |
| --- | ---: | ---: | ---: |
| A | 96 | 24 | 48 |
| B | 24 | 96 | 72 |
| C | 48 | 72 | 96 |

The cross-pair sum is 576 mm³; all-pair sum is 864 mm³. These are multiplicities
of pair observations, not the material union, which spans 7 × 6 × 4 = 168 mm³.
Expected Common bounds are `[max(xmin),min(xmax)] × [-3,3] × [0,4]`, computed
from literal source coordinates rather than the native report under test.

The dedicated production-renderer workflow uses actual Open and checkbox
controls, worker reports and explicit body references. It checks 15 → 9 → 15
pairs, Common volumes and mesh bounds, restored IDs, control admission,
highlight invalidation and unchanged source/recovery/history. Source-body and
Common-volume tolerances, and source-body area tolerance, are 1e-5; distance
and bounds tolerances are 1e-6 mm; the
pair-sum check uses 1e-4 mm³. Configured CI and authored assertions do not imply
execution, human native-dialog interaction, general grouping or platform
support; actual results belong in [validation](VALIDATION.md).

## Within-component interference fixtures

These original SolidFlow inputs use public rectangle/extrusion features, with
no imported geometry or external model. Native tests construct two independent
4 x 4 x 4 mm bodies centred in X/Y, extruded from Z=0 to 4. Their X-centre
spacing is 3, 4, 4.5 or 7 mm: the expected results are 16 mm3 of overlap,
contact without positive solid volume, 0.5 mm clearance, or a distant pair
excluded at the default clearance. Each actual placed input must remain one
valid closed solid with volume 64 mm3, area 96 mm2 and its literal bounds
before inspection and immediately before disposal. Material summaries and
serialized declarations are checked unchanged; the existing native 1e-6
absolute volume/length bands are retained.

Two such leaves separated by 20 mm give manually enumerated pair counts:
all=6 with internal pairs enabled versus 4 by default; one selected leaf
among itself=1 versus 0; that leaf against the rest=4 under either policy.
A 30 mm clearance admits all those pairs for enumeration. Reused nested
leaves retain their distinct full paths and two exact body states per leaf.
Ancestor exclusion, visibility and suppression remove whole leaves. Reordering
occurrences must preserve sorted pair identities.

The tracked [multibody desktop fixture](../src/cad/fixtures/assembly-interference-multibody-original.json)
is a separate original input, manually authored from the same public feature
grammar. Two 2 x 3 mm XY rectangles centred at (1,1.5) and (2,1.5) are
independently extruded 4 mm with explicit `new` body operations. Their bounds
are [0,0,0]..[2,3,4] and [1,0,0]..[3,3,4], each with volume 24 mm3 and
area 52 mm2. The independent Common is [1,0,0]..[2,3,4], volume 12 mm3.
One fixed visible occurrence contains both bodies and no mates. The scripted
production workflow uses actual Open, checkbox, scope, inspection and pair
selection controls, with real worker metrics and Common mesh extents.
Six inspections target default=0, enabled-all=1, disabled=0, enabled-among=1,
enabled-crossing=0 and restored-all=1 pairs. Volume/area use 1e-5 and
length/mesh bounds 1e-6 absolute tolerances. Input bytes, recovery and disabled
Undo/Redo/Apply must remain unchanged. Pair-ID observation does not inspect
both body colours or rendered meshes. A separate viewport unit case verifies
selection of both exact members without selecting a third body of that part.

The dedicated command retains the shared isolated production harness and its
unchanged 180/170/35-second deadlines. These are fixture definitions and
acceptance criteria; executed results belong in VALIDATION.md.

## Assembly part replacement fixtures

The replacement model, native and component fixtures are original SolidFlow
test declarations and public primitive features. They use no imported model,
proprietary data or external application. The model tests enumerate two levels
of reused subassemblies, root/local references, stale paths and coexistence of
source revisions. The selected leaf path and every changed declaration are
enumerated independently; original definitions, poses, names and flags are
compared with their untouched snapshots. Definition and stored-declaration
budget cases reject a whole copy-on-write plan without clipping it.

The native part sources are circles of radius 2 or 3 mm extruded 4 mm. Replacing
one of two R2 cylinders with R3 gives volume 52π mm³; replacing both gives
72π mm³. A separate rack source uses the YZ plane so its native direction is
orthogonal to the pinion axis. Captures use gear ratio 2:1/opposed, screw lead
2 mm per turn/aligned, and rack conversion from the actual native diameter.
These are native captured relations; no saved zeros or final solved poses are
fabricated by a fixture.

The two-level selected gear case contains three unchanged R2×4 cylinders and
one R3×4 cylinder after replacement: total volume 84π mm³ and area 114π mm².
The changed branch composes Ry90 with translation (0,20,0), then Rz90 with
translation (10,0,0). Manually composed world bounds for its changed cylinder
are (-13,6,-3) to (-7,10,3), with occurrence translation (-10,6,0). The unchanged
nearby cylinder has bounds (-12,0,-2) to (-8,4,2). Bounds and translations use
absolute 1e-6 mm; volume/area comparisons use six decimal places. The tests
also keep the reused sibling and all original definitions unchanged, reopen
the complete result and check one-use Apply and exact Undo.

Suppressed-coordinate and stale-carrier cases use actual captured gears before
making their declarations unavailable. A failed recapture must retain the old
document and coordinates; explicit relation removal is a separate user decision.
A same-ID ancestor carrier with an obsolete revision requires explicit fresh
capture. Native incompatible fixed-axis recapture is a real rejection case.
Controlled worker transport and symbolic SSR DTOs separately test correlation,
identity, labels and pending decisions; they do not supply geometric evidence.

Two native fault cases wrap the real engine and delegate shape construction,
meshing and release before raising controlled errors. One fails while building
the replacement catalog; the other fails while publishing the final scene after
an actual gear recapture. They check both mesh/release causes, one release attempt
for the affected wrapper, revocation of old capabilities, unchanged committed
input and a clean retry. These are explicit fault adapters, not operating-system
crash or arbitrary allocation-failure coverage.

The desktop replacement scenario derives isolated inputs from the tracked
`assembly-original.json` and `assembly-updated-pin-original.json`. It authors
two nested reused occurrences, each with a cylinder R2×12 and a separate
2×2×12 mm prism. The replacement has a different part ID and cylinder R2.5×12;
the prism remains unchanged. Original aggregate volume/area are 96+96π mm³
and 208+112π mm². One replaced leaf gives 96+123π and 208+128.5π; both give
96+150π and 208+145π. Volume/area use absolute 1e-5; body bounds use 1e-6 mm
and fixed rotations use 1e-8. These formulas are independent of the engine.

The harness obtains original top-plane, vertical LINE and cylindrical-axis
references from actual worker catalogs and writes a test-owned input before
ordinary file Open. A gear is captured through production controls. The flow
then uses real replacement controls for cancel, manual repair, recapture,
selected isolation, all-source replacement, Apply, history and Save As/reopen.
It supplies no React state, CAD response or Apply token. Inputs and separately
saved selected/all outputs are hashed. Executed commands and visual-review
limits remain separate evidence in VALIDATION.md.

## Directed angular measurement fixtures

The numerical measurement cases are original literal vectors, trigonometric
rays and an independently written `Ry(30) Rx(45)` matrix. They distinguish
the projected circular coordinate from the principal direction angle, include
240-degree and oblique examples, and check reversed endpoints/guide, zero
crossing, unobservable azimuths and malformed input. They supply no native
geometry authority and reuse no external CAD model.

The native cases author a 10-by-6-by-4 mm box and a separate radius-2,
height-4 mm cylinder in one part definition. Each instance therefore has
volume `240+16*pi` mm3 and area `248+24*pi` mm2. Three instances give six
solids. One native top normal is placed along +X; an independently specified
`Rz(120) Ry(90)` quaternion places a native LINE along
`(-1/2,sqrt(3)/2,0)`. The actual extruded cylinder has geometric axis -Z,
giving the circular measurement 240 degrees (principal angle 120 degrees).
The native test checks the axis sign before measuring; it does not flip it
to obtain a preferred result. Two reused, two-level assembly scopes apply
`Ry(90) Rz(90)` and `Rx(90) Rz(90)` respectively. Their expected world vectors
are written explicitly and both retain the same circular coordinate. Native
volume/area tolerances are absolute 1e-6; vectors/degrees use absolute 1e-8.
Additional cases exercise oblique/small projections, stale and suppressed
references, exact reopening, retained preview authority and the active part
engine. Cleanup adapters first release real native geometry, then raise an
original controlled fault; they verify both primary/release failures and a
clean retry without claiming operating-system crash coverage.

The production-renderer measurement scenario reuses the tracked original
`assembly-direction-mates-original.json` fixture. Its two drilled prisms have
total volume `480-8*pi` mm3 and area `496+12*pi` mm2. With the moving instance
at Rx(30), top-normal to top-normal about +X gives 30 degrees, swapping them
gives 330 degrees, the corresponding canonical LINE gives 30 degrees, and
the cylindrical -Z axis gives 210 degrees. Volume/area tolerance is 1e-5 and
angular tolerance is 1e-7 degrees. The flow uses actual production controls,
native worker results and isolated Open/Save As paths. It checks rejected
parallel-to-guide projection, stale display invalidation, blocked authoring
preview, unchanged history/recovery, and saved reopening without any Apply.
It injects no document, React state or CAD response into the running app.
Counts and actual execution results belong in the validation record.

## Directed circular stop fixtures

The numerical stop cases are original Cartesian rays and analytical rotations.
They exercise positive right-hand arcs, 330-degree start plus 60-degree sweep,
zero crossing, equal/full-circle declarations, regular scalar endpoint cones,
undefined projections and precision-limited near-full arcs. A three-body oblique
case checks all 18 Jacobian columns with central differences at steps 2e-6 and
7e-7 and absolute error 4e-7, including guide motion; common rigid variations
cancel to 2e-14. Equal stops at 0, 180 and 270 degrees retain one scalar azimuth
constraint. Mechanical combinations check independently expected lifted values
in the existing gear/screw/rack charts without saving winding in the new mate.
Small original 4-by-6-by-2 mm prism declarations support graph, dormant-guide,
source-revision, replacement, history and serialization cases; these pure
model tests grant no native geometry authority.

Native cases reuse the tracked original
`assembly-direction-mates-original.json`. Each 10-by-6-by-4 mm prism has a
through-hole of radius 1 mm: volume `240-4*pi` mm3 and area `248+6*pi` mm2.
Independent checks rebuild and place the BRep, require validity and one solid
per instance, measure volume/area to 1e-5, compare all eight transformed box
corners to bounds at 1e-6 mm, and extract oriented top normals from native
surface derivatives. About explicit +X, the yz-plane azimuth of those normals
independently establishes Rx(theta) modulo 360. Degree comparisons normally
use 1e-7; restored poses use the specific 1e-6-degree or radian tolerances
written in each case. Native plane/cylinder/LINE triples check their actual
signs, including the cylinder's -Z axis. Reused scopes under Rz(90) and Ry(90)
retain the same angle with world guides +Y and -Z respectively. The four-prism
aggregate is `960-16*pi` mm3 and `992+24*pi` mm2. A source update increases the
prism depth to 5 mm and requires fresh manual LINE-guide repair. The controlled
final-query fault delegates real geometry work and then withholds a candidate;
it is not operating-system fault coverage.

The separate production-renderer stop workflow uses the same original fixture
with its initial Rx(30) pose. It authors the explicit 330+60 arc, rejects outward
requests from both endpoints, returns inward, passes 330 to 350 to 10 through
zero, and rejects a full-turn excursion with an unchanged final orientation.
Suppression permits an outside pose; reactivation must restore and freshly
verify the endpoint. Editing, Cancel, Apply, Undo/Redo and actual Save As/reopen
retain all three references and the explicit arc. Two-prism volume/area use
1e-5, saved quaternion comparisons 1e-6 radians, and reported angles 1e-5
degrees. Current scene/saved positions use 1e-12 mm, independent transformed
corner bounds use 1e-5 mm, and strict moves retain their explicitly requested
position to 1e-7 mm. Angular restoration alone does not fix a free origin.
The script uses actual controls and worker results with test-owned
file-dialog choices; it injects no document, React state or geometric response.
Authored cases and configured CI do not imply execution. Record source-specific
passes, failures and remaining coverage in VALIDATION.md.

## Directed circular stop pointer oracles

The pointer follow-up reuses `assembly-direction-mates-original.json` and
its original drilled 10-by-6-by-4 mm prisms. It adds no external model, fixture
geometry or unit/CAD case. Original +Z and Rx(theta)+Z about explicit +X
give the signed short-chart interval [-30,60] for the edited 330+90 arc.
Ideal requests are 90, 90, 40, -40, -10 and 10 degrees; the first upper
projection is cancelled, the second applied with history.

Two trusted DOM client points and their posted request quaternions calibrate
each third actual held move. The actual request must first match its ideal
target within `1e-6 rad`. Independently clamping that posted local-X angle
to [-30,60] supplies expected projection, without reading solved pose or
reported angle. Finite DOM coordinates need not represent the ideal angle
exactly. Report, independently measured native top-cap yz azimuth and
displayed angle match this expectation within `1e-5 degrees`; resolved
quaternions also retain the ideal-result `1e-6 rad` check. Endpoints stay
exactly 60 and -30. The captured request-derived expectation survives Save
As and fresh verification after reopen. No CAD angle helper supplies it.

Original analytical volume/area, native/saved pose identity and independent
eight-corner bounds remain checked. The moving normal is compared with
original +Z independently rotated by the saved quaternion at `1e-8` per
component. Pointer translation and secondary position use `1e-6 mm`;
request-to-clamp angular deviation uses `1e-6 rad`, and displayed angular
deviation uses `1e-9 rad`. Numeric motions retain their literal-target
checks. Passive observation provides evidence only, with no document, React
state, geometry response or Apply-token injection. Executed passes, failed
oracle assumptions and coverage limits belong in the
[validation record](VALIDATION.md#directed-circular-stop-pointer-projection--2026-10-21).

## Directed circular stop shared-guide update fixture

The fixed guide-repair workflow derives a test-owned input from tracked
`assembly-direction-mates-original.json` before ordinary file Open. It
retains the original 10-by-6 mm rectangle and eccentric radius-1 mm bore,
sets the moving occurrence to Rx(-10) at (20,10,6), and adds one fixed Ry(90)
occurrence at (40,0,0), sharing the same part. Ground remains identity at
the origin. The source update changes both extrusion and cut depth from
4 to 5 mm, preserving a through-hole rather than creating a blind bore.

For depth h, each prism has volume `(60-pi)*h` and area
`120+32*h+(2*h-2)*pi`. Three instances give original
`720-12*pi` / `744+18*pi` and updated `900-15*pi` / `840+24*pi`.
Let c=cos(10 degrees), s=sin(10 degrees). Literal bounds are ground
(-5,-3,0)..(5,3,h), moving (15,10-3c,6-3s)..(25,10+3c+hs,6+3s+hc),
and guide (40,-3,-5)..(40+h,3,5). These expectations and an independent
saved-quaternion transformation of all eight box corners check placement.
The initial poses already satisfy the relation, so this update expects to
retain those feasible placements.

Native catalogs supply actual reference identities. The unique local top
caps have +Z normals; the guide LINE has local +Z axis and local point x=5,
y=3. Its Ry(90) placement gives world +X. Fixed +Z to moving (0,s,c) about
+X therefore measures 350 degrees inside the literal 330+60 arc. No solver
coordinate helper supplies this expectation. Volume/area and bounds use
`1e-5`; intended positions `1e-7 mm`; intended and native/saved physical
rotations `1e-8 rad`; native/saved positions `1e-12 mm`; directions
`1e-8` per component and angle `1e-7 degrees`.

Actual controls author the mate, stage the source, repair two current caps
and the current LINE, solve, cancel, re-review, apply and use history/file
round trips. Both all-pending and guide-only-pending states must reject.
The proposal retains unchanged r1 plus the new source; repaired reference,
occurrence and mate identities are checked explicitly. Confirmed file and
recovery remain unchanged until Apply. Fixed test-owned file choices are
statically allowlisted; no document, React state, native response or token is
injected. No new unit/CAD case or external fixture model is introduced.
Execution results and retained failed harness assumptions belong in the
[validation record](VALIDATION.md#directed-circular-stop-shared-guide-source-repair--2026-10-21).

## Three-owner all-instance replacement regression

The added case in `kernel.assembly-limit-directed-angle.test.ts` derives its
input from the unchanged original `assembly-direction-mates-original.json`.
It adds a fixed guide prism at (40,0,0), Ry(90), and retains ground at identity
and moving at Rx(350). All three occurrences initially share one source. The
replacement has a different part identity; both extrusion and eccentric R1
through-cut depth change from 4 to 5 mm. No external model is introduced.

The independent depth-h formulas remain volume `(60-pi)*h` and area
`120+32*h+(2*h-2)*pi` per prism. At h=5, three solids give `900-15*pi` and
`840+24*pi`, checked to absolute `1e-5`. Each independently rebuilt placed
BRep must be valid and contain one solid. Eight transformed box corners check
each placed bound to `1e-6 mm`. Oriented native D1 top-cap normals verify the
350-degree angle about the explicit +X guide to `1e-7 degrees`.

All three exact replacement references must be selected from the actual local
native catalog. Omitting the guide repair rejects; an extra fourth decision
rejects before its accessors are invoked. Accepted feasible poses retain
translations to `1e-8 mm` and full physical rotations to `1e-8 rad`, using a
sign-corrected quaternion chord and `4*asin(chord/2)`. Mate identity, unchanged
original source, exact repaired references, Undo/Redo and serialized reopening
with a fresh Solve are checked. This is a native integration test; it does not
add a desktop all-instance interaction case. Executed checks and their platform
limits belong in the
[validation record](VALIDATION.md#shared-saved-mate-endpoint-inventory--2026-10-21).

## Original numerical plane-bisector geometry

`src/model/assemblyPlaneBisectors.test.ts` defines original Cartesian plane
supports directly in TypeScript. It introduces no file fixture or external
model. These numerical infinite-plane cases do not establish a saved Width
mate, native-reference freshness, finite contact, solver DOF, movement, UI or
platform behavior.

The first ordered pair uses points `(5,0,0)` and `(-10,0,0)` mm, with unit
normals `(3/5,4/5,0)` and `(-3/5,4/5,0)`. Relative to origin `(1,-2,3)` mm and
length scale `4 mm`, the individual plane offsets are independently `1` and
`41/20`. Their sum branch has normal `+Y`, normalized offset `61/32` and
branch length `8/5`; their difference branch has normal `+X`, offset `-7/8`
and branch length `6/5`.

A second pair uses points `(0,13,0)` and `(0,-26,0)` mm with normals
`(0,5/13,12/13)` and `(0,-5/13,12/13)`. Its sum branch has normal `+Z`, offset
`41/32` and branch length `24/13`. With the first pair's first point as the
comparison anchor, the literal normal residuals are `(0,-1,1)` and `(0,1,1)`
for the two comparison alignments; their anchored offsets are `5/8` and
`55/16`. These nonzero residuals also exercise common rigid gauge invariance
away from a solution, including the derivative of the anchor and reference
frame.

Analytic columns are compared against central finite differences with tangent
steps `2e-6` and `7e-7`, using the actual normalized left retraction in
`retractRigidBodyPose`. The cases keep all original references while assigning
four distinct owners, three owners, repeated owners across both pairs, one
fixed-frame reference and a common owner. Fixed-frame references have no owner
columns. The geometry and comparison checks use derivative tolerances
`3e-7*max(1,abs(expected))` and `4e-7*max(1,abs(expected))`, respectively.
Literal coordinates, equation reversals, tangential parameter-point changes,
shared-owner sums and common rigid gauges use absolute `1e-11` comparisons.

Exact zero-length branches, including coincident equations, must remain
explicitly degenerate rather than selecting another branch. A separate
near-cancellation case declares `1e-8 rad` normal uncertainty against a
`1e-10` branch separation and checks a precision-limit result. Malformed
nonunit/nonfinite input and caller-data preservation are separate checks.
Executed validation belongs in the validation record; the authored tests alone
do not constitute a passing result.

The comparison finite differences also use an oblique initial reference-frame
rotation `Exp(0.23,-0.31,0.17)`, composing each left increment before that
initial frame. Four distinct free owners retain six common rigid tangent
null directions both at a zero residual and at the nonzero rational residual;
the tests check summed owner columns and actual common retractions. This checks
common gauge directions, not a complete solver rank or DOF classification.
Tangential parameter-point invariance applies to the individual bisector plane.
The comparison's anchored scalar is a coordinate chart: changing its anchor
can change that scalar away from a solution, so no invariance under arbitrary
anchor replacement is claimed.

Precision regressions separately cover normalized length tolerances that become
zero or infinite even with all plane offsets zero; nonzero coordinate deltas
that normalize to zero or subnormal values; nonzero point uncertainty erased by
normalization; and declared or arithmetic uncertainty before cancelling equal
and opposite offsets. An accepted common-owner case scales every original
length by `1e120`, with an appropriately scaled tolerance, and requires finite
support and accumulated owner derivative blocks. These checks exercise the
explicit conservative arithmetic policy; they are not a formal certificate of
Float64 error bounds.

## Original numerical centered-width solver cases

`src/model/assemblyWidthSolver.test.ts` defines an original numerical
`width`/`centered` constraint with two ordered width planes and two ordered tab
planes. It introduces no native fixture or external model. The width planes
are `x=-8` and `x=8` mm; the tab planes are `x=-2` and `x=2` mm, with opposing
Cartesian unit normals and explicit difference branches. Their original
references remain separate, with four distinct, repeated or fixed-frame owners.
No synthetic midpoint endpoint is assigned to one of those owners.

For the fourth-owner case the first three owners are fixed and only the
second tab support has translation `d=3 mm`. Its planes lie at `-2` and `2+d`,
so coincidence with the width bisector requires `d=0`. The four-free-owner
case checks the regular three independent equations and the complete
24-column incidence group. Those rank and DOF expectations belong to these
specific Cartesian configurations, not every width geometry. A shared rigid
owner gives zero relative rank; two free group owners retain their common
rigid gauge. A separate nonzero-defect case checks six common rigid Jacobian
null directions.

The nested-frame case uses translation `(7,3,-1)` mm and a quarter-turn about
Z. Local plane points at `y=11` and `y=3`, with normals `+Y` and `-Y`, therefore
become `x=-4` and `x=4` relative to their owner. An owner translation of `2 mm`
in X gives an independently known `2 mm` bisector defect. Another case uses a
common world translation and conditioning origin of `1e16 mm`, with a local
endpoint-frame translation of `0.5 mm`; it checks that normalized evaluation
retains the half-millimeter defect instead of reconstructing and rounding
world support points.

Physical angular checks use `atan2(norm(cross),dot)` independently of the
width residual helper. The right-angle case expects `pi/2 rad`, rather than
the vector chord `sqrt(2)`; an explicit opposed-alignment case checks the
opposite normals. Analytic rows are also compared against central differences
under actual normalized left retractions, using steps `2e-6` and `7e-7` and
absolute/relative tolerance `5e-7*max(1,abs(expected))` per derivative. The first
width endpoint includes an oblique local frame in those cases.

An additional intersecting-plane fixture uses width normals
`(-.6,-.8,0)`/`(.6,-.8,0)` at `x=-8/+8 mm`, and tab normals
`(-.8,-.6,0)`/`(.8,-.6,0)` at `x=-2/+2 mm`. Both ordered difference
bisectors are `-X`. The tab begins at `(3,4,-3) mm` with `Rz(.27)`.
After solving, an independent calculation forms
`b=(n0-n1)/norm(n0-n1)` and
`h=(dot(n0,p0)-dot(n1,p1))/norm(n0-n1)` from the actual world supports.
It checks coincident `-X` bisectors and zero offsets, while preserving the
original pair dot products `.28` and `-.28`. It prescribes no unique
tangential pose.

Two original tilt controls reuse those rational normals with all four local
plane points at the origin and tab translation `(0,7,-3) mm`. Literal `Rx`
and `Ry` matrices at `pi/12 rad` give hinge directions `(0,-sin(a),cos(a))`
and `(sin(a),0,cos(a))`. Both hinges tilt by 15 degrees. The X rotation
preserves the difference bisector `-X` and zero offset, so its initial
evaluation is satisfied despite nonparallel hinges. The Y rotation gives
bisector `(-cos(a),0,sin(a))`, signed offset `-3*sin(a) mm` and angular
defect `a`, so its initial evaluation is not satisfied. Matrix, point,
opening-dot and physical-report oracles use absolute tolerance `1e-12`;
the existing problem bands remain `1e-6 mm` and `1e-8 rad`. These checks
do not require a free-owner solve to fail or prescribe its repaired pose.

Angular-chart samples at `1e-4 +/- 1e-8 rad` compare physical angle against
`atan2(abs(sin(theta)),cos(theta))` at `1e-10 rad` tolerance. The Z-rotation
Jacobian column is checked with central steps `2e-8` and `7e-9`, absolute
tolerance `5e-7`, crossing the small-chord evaluation transition.
The sample `pi-2e-7 rad` admits physical-angle evaluation; `pi-.5e-7 rad`
requires an `orientationChart` diagnostic. These are local evaluation samples,
not a claim of global convergence near the excluded antipodal chart.

The numerical projection cases drive the grounded tab or only the fourth
reference owner toward `(5,7,-3)` or `(6,7,-3)` mm. Their independent positional
result is `(0,7,-3)` mm for these infinite Cartesian supports. A spin about X
is a free direction in the grounded pair case. The tests require local-only
projection evidence and no invented inequality or boundary cone. Position
checks use `1e-6 mm`, rotated unit-direction components `1e-8`, and literal evaluation checks
`1e-10 mm` or `1e-10 rad` as stated in the test.

A four-free-owner oblique variant keeps those intersecting local plane pairs
and places every owner in the common frame with quaternion `(1,2,2,4)/5`
and translation `(7,-11,13) mm`. The literal rotation matrix is
`[9,-12,20;20,15,0;-12,16,15]/25`, giving both bisectors the independent
normal `(-9,-20,12)/25` and offset `313/25 mm`. Only the fourth owner is
perturbed by angular parameters `0`, `1e-9` and `.08 rad`. Reconstructed
plane equations check the physical zero set; at these regular configurations
the expected rank is three and local mobility is 21. An already acceptable
small defect can have an ambiguous fourth singular value; the test requires
the existing certified residual refinement to resolve the rank instead of
assuming that physical acceptance alone determines it. Six common Jacobian
directions and an actual common quarter-turn/translation check rigid gauge
and plane-equation covariance. A fourth-owner target with translation and
rotation checks local projection while all four owners remain in the hard
group; the other owners' individual final poses are not prescribed. No
production rank policy is altered. These cases are numerical evidence only.

Malformed modes, branches, alignment, cardinalities, owners and support
purposes are rejection cases; selected branch cancellation, normalization
precision and incompatible fixed geometry must not publish poses. These are
pure numerical evaluator/solver/projection cases. Saved schema, native support
binding, source replacement, editor interaction, other width modes, geometric
contact, continuous motion and platform support are outside their evidence.
Execution results belong in the validation record after checks run.

## Original saved and native four-plane centered-width cases

`src/model/assemblyWidth.test.ts` and
`src/cad/kernel.assembly-width.test.ts` introduce original declarations built
in the tests. They contain no imported CAD model, external fixture or native
application capture. The part is a rectangle centered at `(0,0)` with width
`4 mm`, height `6 mm`, extruded from `z=0` to `z=4 mm`, with an explicit body
identity. Its literal bounds are `(-2,-3,0)` through `(2,3,4) mm`, volume
`96 mm^3` and surface area `128 mm^2`.

The native four-owner declaration places that same part at X translations
`-6`, `6`, `0`, `3 mm`. Ordered width references select the negative-X face
of the first owner and positive-X face of the second, at `x=-8/+8 mm`.
Ordered tab references select the negative-X face of the third owner and
positive-X face of the fourth, initially at `x=-2/+5 mm`. Both branches are
explicit differences with aligned bisectors. With the first three owners
fixed, the independently known centered result is fourth-owner X translation
`0 mm`. The four distinct free-owner and repeated one/two-owner variants
inventory local group incidence and fixture-specific rank, not global rank
for arbitrary width constraints. A nested variant declares the mate inside
a shared assembly frame, rotated by a quarter turn about Z and translated
by `(30,-11,7) mm`; its local `x=0` plane becomes world `y=-11 mm`.

Final geometric assertions rebuild the actual native solids, check BRep
validity, solid and plane-face counts, volume, area and bounds from the eight
literal transformed corners. Surface D1 derivatives and native face
orientation supply independent world plane normals and offsets. For each
ordered pair the oracle computes the normalized normal difference and the
difference of plane offsets divided by that normal-difference length.
Coincidence uses `atan2(norm(cross),dot)` for angle and the independently
measured offsets for length; it does not call the numerical bisector helper
or use a solver report as its expected geometry. Metric tolerances are
`1e-5` for volume/area, `1e-6 mm` for bounds, positions and plane offsets,
and `1e-8 rad` for angular coincidence.

The pure document cases inventory strict two-plus-two ordered roles,
data-only validation, history, serialization, four-role source update and
replacement, including reused, suppressed and dormant declarations. Native
cases inventory witness identity/lifetime, fourth-reference rejection,
worker cancel/apply/reopen and explicit repair of all four replacement roles.
Principal-plane references in the pure tests are syntax examples, not native
geometry evidence. The all-instance replacement now has a new original source
identity and widens the original rectangle from 4 to 6 mm. Missing fourth-role decisions must not
publish a candidate. Assertions are an intended coverage inventory until
the corresponding commands are run and their results recorded separately.
These cases do not establish other width modes, cylindrical tabs, continuous
motion, external application compatibility or platform support.

The additional intersecting native case uses closed entity-line triangles
`(-4,0),(4,0),(0,3)` and `(-3,0),(3,0),(0,4)`, extruded `4 mm`.
Their volumes are both `48 mm^3`; surface areas are `96` and `88 mm^2`.
The sloping outward side normals are respectively `(+/-.6,.8,0)` and
`(+/-.8,.6,0)`. Ordered negative-X/positive-X selections give difference
bisectors on `x=0`, with branch lengths `1.2` and `1.6` and opening dot
products `.28` and `-.28`. Only the second prism is free, initially translated
`3 mm` in X and rotated `.27 rad` about Z. The final rebuilt BRep is checked
against transformed triangular vertices, the literal metrics and independent
oriented D1 normals/offsets, at the tolerances above. No unique tangential
pose is prescribed. A separate direct-measurement case rejects invalid
length/angular tolerances while requiring all four live witnesses and the
source document to remain usable and unchanged afterward.

A source-update case independently rebuilds the centered 4 mm boxes, changes
the source revision and actual width to 6 mm, rejects all four old face
references, and repairs every role using the current native catalog. Apply,
history and serialized reopening retain the new geometry. It then replaces
only the fourth occurrence with an original 8 mm box. The tab planes become
`x=-3` and `x=d+4 mm`, so their centered result requires `d=-1 mm`; the other
three occurrences remain unchanged. For width `w`, height 6 and depth 4,
the independent metrics are `V=24w mm^3`, `A=20w+48 mm^2`, with local corners
`x=+/-w/2`, `y=+/-3`, `z=0/4 mm`. Thus the wider boxes have metrics
144/168 and 192/208 respectively. Native BRep, D1 plane and transformed-corner
checks retain the tolerances above. These are constructed public features,
with no imported geometry or external CAD data.

## Original native centered-width movement cases

`src/cad/kernel.assembly-width-motion.test.ts` reuses the tracked original
4-by-6-by-4 mm box fixture above, starting the fourth occurrence centered at
`x=0`. It authors its four actual native faces from signed normals in the
current scene. With the first three occurrences fixed, the independent
pointer target `(6,7,-3) mm`, `Rx(.2)` projects to `(0,7,-3) mm`, `Rx(.2)`.
The positional target error is 6 mm; strict local/world movement rejects
that unreachable target and admits the reachable world target. Worker-owned
Cancel, Apply, history and saved reopening retain the original mate and fixed
occurrences. The projected report remains explicitly local and support-only.

A separate signed motion requests `Rx(2.4)` and translation `(0,6,-3) mm`.
A transparent spy observes the real native verifier without replacing its
implementation. All three actual station candidates are reconstructed:
station `i=1..3` has translation `(0,2i,-i) mm` and `Rx(.8i)`. Each original
solid must have valid BRep, one solid, volume 96 and area 128. Bounds come
from literal corners transformed by the independent sine/cosine Rx formula,
and oriented surface D1 derivatives check the actual X planes. Width planes
`-8/+8` and tab planes `-2/+2 mm` retain midpoint zero. Position/bounds and
offset use `1e-6 mm`, angular/direction checks `1e-8`, and metrics `1e-5`.
The report's three verified stations remain sampled evidence. In this separate
motion fixture the third and fourth boxes initially overlap; a contact-stop
request must reject that initial moving-pair interference. This does not turn
sampled rotations into continuous collision, finite-contact, pointer-interaction
or platform evidence.

## Original centered-width rectilinear contact-stop cases

`src/cad/kernel.assembly-width-translation.test.ts` reuses the original
4-by-6-by-4 mm box construction. The first three fixed occurrences have
translations `(-6,0,0)`, `(6,0,0)` and `(0,0,0) mm`; the fourth starts at
`(0,0,8) mm`. Actual negative-X/positive-X faces give width planes `-8/+8`
and tab planes `-2/+2 mm`. Both selected difference bisectors coincide at
X=0. The fourth box moves toward `(0,0,2) mm`, so its independent normal
gap to the third is `g(f)=4-6f mm`. Exact geometric contact would occur at
`f=2/3`; the conservative numerical stop must occur earlier, with measured
gap above the reported native safety band and distance-minus-band at most the
requested `1e-6 mm` deflection. A `.25 mm` requested clearance instead gives
geometric reference fraction `.625` and Z=4.25 mm. Position relative to the
geometric reference uses `5e-6 mm` to include the stated numerical band;
fraction uses `1e-6`. The band inequalities are checked separately.

The unrestricted endpoint intersects the third box in `48 mm^3`; these are
not clear endpoints. The stopped candidate has no positive interference.
A destination at Z=12 mm is clear and completes fraction one. Initial contact,
an incompatible X target and a one-query budget reject without a token or
partial document. Cancel/Apply, token reuse, mutable response isolation,
history and saved reopening retain the original four references and actual
stopped pose. Each rebuilt box has valid BRep, one solid, volume 96 and area
128; independent oriented D1 planes and literal eight-corner bounds check
the physical gap. Metrics use `1e-5`, bounds/gap `1e-6 mm`, directions
`1e-8`, and quaternion comparisons `1e-12` up to sign.

One native variant places all four occurrences in the original common frame
with quaternion `(1,2,2,4)/5` and translation `(7,-11,13) mm`. Its oracle uses
the literal rational matrix `[9,-12,20;20,15,0;-12,16,15]/25` for corners and
normal offsets, independently of product placement helpers. The requested
world endpoint is `(8.6,-11,14.2) mm`. The same fraction `2/3` and normal
gap formula remain the geometric reference. This is one rotated fixture,
not complete orientation, hierarchy or platform coverage.

Two numerical affine-path cases in `assemblyWidthSolver.test.ts` use four
distinct free owners and intersecting original plane pairs. Both tab owners
have a constant Z rotation `epsilon=4e-9 rad`, yielding a nonzero accepted
normal defect. In direct coordinates, width supports have Y velocity 3 and
tab supports Y velocity 2 mm per fraction; Z velocities are `1,-2,3,-4`.
The independently derived anchored offset is
`16*sin(epsilon/2)^2 + f*sin(epsilon) mm`. Its changing anchor term matters:
the unanchored tab-only slope is `-2*sin(epsilon)` rather than the correct
`+sin(epsilon)`. Fractions `0,1/8,1/2,7/8,1` check the literal offset,
constant physical angle and affine interpolation, directly at `1e-13 mm`
and under the rational common frame at `1e-12 mm`. These are numerical
samples of the stated algebraic argument, not native collision evidence.

Three controlled native-provider faults change the target snapshot's first
width support point tangentially, its normal, or its tolerance after the real
endpoint solve. Actual snapshot issuance and witness authentication remain
in place. Each must reject native continuity before the collision tracer and
publish no capability. These faults test conservative refusal, not successful
motion or geometry. The production path retains the original data, deadlines,
distance policy and privileged file boundary.

## Embedded subassembly source-update prisms

`src/cad/kernel.assembly-document-updates.test.ts` constructs original synthetic
documents with `createEmptyAssembly` and ordinary rectangle sketches/extrusions.
They are GPL-3.0-only SolidFlow fixtures; no external CAD model, native reference
application or retained research artifact is an input to these public tests.

The old material is `[0,2] × [0,3] × [0,4] mm`, with volume `24 mm³` and area
`52 mm²`. Its authored new revision changes only X width to 3 mm, giving volume
`36 mm³` and area `66 mm²`. These follow `xyz` and `2(xy+xz+yz)` independently.
The source's inner placement is Rz90 followed by translation `(1,2,3) mm`:
`(x,y,z) → (1-y,2+x,3+z)`. Parent copies translate X by -10 and +20 mm.
The updated bounds are respectively `[-12,2,3]..[-9,5,7]` and
`[18,2,3]..[21,5,7] mm`; two solids total `V=72 mm³`, `A=132 mm²`.
The old pair totals `V=48 mm³`, `A=104 mm²`, with maximum Y=4 mm.
An independent old-material occurrence at X=50 remains unchanged: updated
three-solid totals are `V=96 mm³`, `A=184 mm²`, with bounds
`[-12,0,0]..[52,5,7] mm`. Areas and volumes sum occurrences without fusion.

An ancestor-only edit changes inner X translation from 1 to 5 mm while retaining
the exact part tuple and local geometry. Its two world boxes are
`[-8,2,3]..[-5,4,7]` and `[22,2,3]..[25,4,7] mm`. A renamed-child variant keeps
the same original prism and requires an explicit current descendant choice.
Four translated source uses provide four actual top Z=7 planes for the saved
Width roles; after updating, `V=144 mm³`, `A=264 mm²`. This is a role/repair test
of the existing centered plane relation, not evidence for other Width modes.

A separate original cylinder variant uses R=1 mm, H=4 mm, two coaxial copies
separated by 6 mm, and actual native concentric rotation-lock capture. Its totals
are `V=8π mm³`, `A=20π mm²`. Recapture during the source update must restore the
saved suppressed flag. Original component-lock capture uses the prism variant.
The remote-cut rejection uses an original R=1 circle at `(100,0)` and depth
4 mm, outside the finite material. Fault tests forward the real native mesh and
release calls before raising explicit query/cleanup failures; they provide no
successful substitute CAD response.

Material comparisons use `1e-5 mm³` volume and `1e-5 mm²` area bands; bounds use
`1e-6 mm`. Expected bounds and placements use the stated literal coordinate
mapping rather than the placement or solve helper under test. Declaration
identities, local/parent null frames, cancellation, private capability rejection,
history and saved parsing have separate assertions. Authored tests do not assert
executed acceptance, linked sources, structural interchange, configuration or
general platform support; source-specific runs belong in `VALIDATION.md`.

The renderer workflow uses separately tracked
`src/cad/fixtures/assembly-source-update-original.json` and
`src/cad/fixtures/assembly-source-update-incoming-original.json`, authored on
2026-10-22 from the same literal original rectangle/extrusion recipes under
GPL-3.0-only. The parent embeds `original-update-source:r0` twice at X=-10/+20
and an independent `original-update-box:r0` at X=50. The incoming source keeps
its assembly identity, declares revision r1, changes its child ID `m` to
`m-new`, and uses `original-update-box:r1` of width 3 mm. Its inner Rz90 and
translation `(1,2,3)` are unchanged. The three-solid before/after totals are
`V=72/A=156` and `V=96/A=184` in cubic/square millimeters. Neither the direct
old-material occurrence nor its original source is implicitly revised.

These files contain one source-local and two root principal-plane distance
declarations for the 3 mm child-origin Z offset. Each null owner remains its
own declaring frame; stored endpoint order and signed distance must be checked
together. Two source expansions and two root relations require four fresh
physical checks. The authored renderer flow covers review Cancel/retry, two
explicit renamed-child principal-plane repairs, ready-preview Cancel/retry,
one Apply/Undo/Redo, parent save identity, Save As/reopen and wrong incoming
identity rejection. These are authored cases, not an execution or platform
claim; they use no external models or private artifact dependencies.

## Bounded profile-center fixtures

`src/cad/kernel.assembly-profile-supports.test.ts` and
`src/model/assemblyProfileCenterMeasurement.test.ts` contain original synthetic
fixtures authored on 2026-10-22 under GPL-3.0-only. They depend only on tracked
source and declared public dependencies. No external model, installed reference
application, binary or private research output is a public test input.

The native rectangle has literal corners `(1,2,3)`, `(7,2,3)`, `(7,6,3)`,
`(1,6,3) mm`, so its center is `(4,4,3)`, side lengths 6 and 4 mm and oriented
normal +Z. A rational proper rotation
`(x,y,z) -> (0.6x+0.8z,y,-0.8x+0.6z)` followed by `(10,-3,5) mm` gives center
`(14.8,1,3.6)` and normal `(0.8,0,0.6)`. The test supplies the literal mapped
corners rather than using the extractor or a production placement helper to
calculate its expected center. Face reversal retains the center and reverses
the observed normal.

The disk has original radius 2 mm and center `(3,-2,5) mm`. A separate disk at
`(7,8,5)` combined with the original rectangle gives literal displacement
`(3,4,2)`, axial distance 2, transverse norm 5 and center distance `sqrt(29) mm`.
That case explicitly propagates the native observation's uncertainty into the
pure measurement. It authenticates neither a saved reference nor a mate.
Rejection fixtures include an annulus, semicircular cap, ellipse, four-edge
rounded contour, skew quadrilaterals, triangle, nonplanar surface and distant
coordinates. Query/release failures are explicitly injected after receipt of
real native wrappers; they do not supply a successful replacement CAD result.

The pure ordered-center oracle starts at `(1,2,3)` and `(4,6,15) mm`: displacement
`(3,4,12)`, axial 12, transverse norm 5 and center distance 13 mm. With second
normal `(3/5,0,4/5)`, the aligned angle is `atan2(3,4)`. Reversing these roles
uses the new first normal and yields axial `-57/5`, not merely the negation of
12. An independent proper coordinate permutation `(x,y,z)->(z,x,y)` checks
common rigid-motion invariance. Additional rational-normal, opposed-normal,
small-angle, large-coordinate cancellation and explicit-uncertainty cases
exercise the documented measurement limits.

Coordinate assertions use `1e-10 mm` in the native cases and normally `1e-11 mm`
in the pure cases; classification and uncertainty admission use their separately
stated bands. Those numerical assertions are not evidence for global geometric
coverage, physical metrology, saved relationships or platform support. Actual
source-specific command results belong in `VALIDATION.md`.

## Current profile-reference fixtures

The profile snapshot, pair-measurement and adversarial reference test files
construct original synthetic v2 assemblies on 2026-10-22 under GPL-3.0-only.
The pure selection-parser tests use original opaque identity strings; they
provide no native geometry. All public cases use tracked source and declared
dependencies, without private models, application binaries or research output.

`kernel.assembly-profile-snapshot.test.ts` uses an original 4×6×4 mm prism
centered at sketch XY `(0,0)` and a radius-2 mm cylinder centered at `(3,-2)`.
Their top profile centers are `(0,0,4)` and `(3,-2,4) mm`. Rz90 followed by
`(10,20,30)` gives centers `(10,20,34)` and `(12,23,34)`; rectangle corners are
literal `(10-y,20+x,34)` for `x=±2`, `y=±3`. Legacy and explicit-body variants
keep separate identity checks. A two-body variant adds an equal prism at
sketch X=20 with another explicit body ID. A nested inner translation `(2,0,0)`
under outer Rz90 and `(100,0,0)` gives top center `(100,2,4)`, original placement
magnitude sum 102 mm and depth 2.

`kernel.assembly-profile-measurement.test.ts` uses another original 4×6×4 prism
centered at `(2,3)` and radius-2 disk centered at `(5,6)`. Top centers are
`(2,3,4)` and `(5,6,4) mm`. Reused prisms separated by `(3,4,12)` have center
distance 13, axial distance 12 and transverse norm 5 mm. The unmoved mixed pair
has delta `(3,3,0)` and transverse norm `sqrt(18)`; this is a measurement, not
compatibility admission.

The scoped 3D case gives the first prism Rz90 and translation `(10,20,30)` and
the disk Rx90 and `(-2,3,11)`. Their centers within the scope are the independent
literal coordinates `(7,22,34)` and `(3,-1,17)` with normals +Z and -Y. A common
outer translation `(100,-50,7)` cancels. Thus delta is `(-4,-23,-17)`, axial
distance -17, transverse norm `sqrt(545)` and center distance `sqrt(834) mm`;
both normal comparison angles are π/2. Expected coordinates do not use a
production pose-composition or measurement helper.

`kernel.assembly-profile-reference-adversarial.test.ts` adds an original 6×4×3
prism centered at `(2,1)` and radius-2 cylinder centered at `(12,1)`, with explicit
body IDs and original reused placements. Descriptor/proof/epoch/source tests
forward real native work or raise explicit failures; no successful mock CAD
support replaces real geometry. Hidden/suppressed ancestors, missing native
body identities and source changes under the same tuple remain distinct cases.

Cancelling original chains `+1e12/-1e12` and `+1e16/-1e16 mm` test retention of
their original magnitude despite a small final translation. The latter retains
`2e16 mm` at depth 2 and exposes a larger world-position uncertainty than its
unchanged local extraction. A sketch center at the legal coordinate `1e6 mm`
with inverse placement rejects the explicit `1e-7 mm` extraction band. The
initial authoring attempt at `1e10` was rejected by the existing sketch parser;
no coordinate limit or production tolerance was changed to admit that fixture.

Native coordinate comparisons use `1e-10 mm`; numerical admission retains its
separate explicit/default bands and first-order limits. Currentness, independent
geometry and lifetime are programmatic tests, not evidence for editor commands,
saved mate/repair/history or platform support. Actual execution belongs in
`VALIDATION.md`.


## LINE path planar UP equation and native fixtures

`assemblyLinePathRollGeometry.test.ts`, `assemblyLinePathSolver.test.ts`,
`assemblyLinePathUpMate.test.ts` and `kernel.assembly-line-path-up.test.ts` add
original GPL-3.0-only declarations and mathematical cases authored on
2026-10-22. They use literal vectors, public native geometry and independently
written Rodrigues perturbations or material-coordinate expectations. No private
receipt, external CAD output, application binary or proprietary source is an
input to these tests.

The native recipe reuses the original 4 x 6 x 4 mm prism. Its X-directed LINE
runs from `(-2,-3,4)` to `(2,-3,4)`. A third prism at `(20,30,40)` has a local
+Y plane rotated around Z by `-atan(3/4)`, giving normal `(0.6,0.8,0)` and
projected direction +Y perpendicular to the path's +X tangent. All six distinct
Follow/UP canonical-axis pairs and both independent signs use those literal
directions; no unique free-gauge quaternion is prescribed. Other original cases
exercise a guide-only movable owner, shared owners, reused nested frames,
unchanged material volume/area, stale proof rejection, explicit repair and
saved intent. A guide at `1e16 mm` tests direction-only incidence; the same
owner's positional participation elsewhere retains the positional precision
guard.

Numerical cases independently perturb all three owner rotations, including
shared-owner columns and a common rigid gauge. Finite direction-error cones,
near-band residual-plus-error admission, singular projection refusal and bounded
Follow initialization have separate controls. Declaration/history tests cover
the third role through source changes, selected/all replacement and renamed
subassembly descendants. These are authored cases; source-specific execution
and physical bands belong in [validation](VALIDATION.md).

## LINE path planar UP renderer fixture

[assembly-line-path-up-original.json](../src/cad/fixtures/assembly-line-path-up-original.json)
is an original GPL-3.0-only document authored on 22 October 2026. It copies the
unchanged part declaration from the tracked
[assembly-line-path-original.json](../src/cad/fixtures/assembly-line-path-original.json)
and adds one occurrence. No external model, application binary, private artifact
or vendor geometry supplies the fixture.

All three occurrences reuse the same intrinsic rectangle centered at [0,0],
width 4 mm, height 6 mm and positive 4 mm extrusion into a separate body. Each
solid has V=96 mm³ and A=128 mm²; the three placed solids total V=288 mm³ and
A=384 mm². These are sums of placed bodies, with no union-volume claim.
The fixed path keeps identity placement. Its selected material LINE is
[-2,-3,4]→[-2,3,4], length 6 mm, with the first vertex explicitly selected as
origin. The point occurrence starts at translation [12,4,2] with identity
rotation and uses local material corner [-2,3,0].

The added guide starts fixed at translation [20,-10,0] with unit quaternion
[0,0,√0.1,√0.9], a rotation around Z with cos=0.8 and sin=0.6. Its local +X
plane has world normal [0.8,0.6,0], oblique to the literal +Y path tangent.
Its projected normal perpendicular to the path is +X. Its independent world
bounds are [16.6,-13.6,0]..[23.4,-6.4,4]. The renderer selects this material
face explicitly; no face ordinal, datum plane or private fixture is assumed.

The authored workflow checks UP axes Y/Z with independent reversal using
native placed vertex pairs as component bases, actual guide-face support and
literal ±X projection expectations. A later actual component-control edit fixes
the solved point and releases only the guide. From the accepted UPY/reversed
state, a change to UPZ/reversed requires the guide normal projection to become
−Z while both the point and path keep their poses. The complete guide pose
and its normal component along the tangent remain unconstrained by that
oracle. Original local geometry and material properties remain checked.

Native volume/area bands are 1e−5 mm³/mm²; coordinate and independent basis
checks use 1e−8 mm and final material-point residuals use 1e−6 mm. The workflow
uses actual production controls, worker capabilities and test-owned file
dialogs. Its source describes acceptance cases, not an executed result,
viewport-picking proof, general native equivalence or platform support.


## Original two-leaf unlimited hinge control

[kernel.assembly-hinge-fixture.test-utils.ts](../src/cad/kernel.assembly-hinge-fixture.test-utils.ts)
contains an original GPL-3.0-only recipe authored on 23 October 2026 for the
[native hinge prerequisite tests](../src/cad/kernel.assembly-hinge.test.ts).
A public XY rectangle centered at [4,0], width 12 mm and height 4 mm, is
extruded by 4 mm. A public circle at [0,0], radius 1 mm, is cut through the
same body. The two occurrences reuse this single part definition; no external
CAD file, reference-application model, private trace or vendor geometry is used.

The literal local bounds are [-2,-2,0]..[10,2,4]. Each solid has
V=192−4π mm³ and A=224+6π mm². Two placed solids therefore sum to
V=384−8π mm³ and A=448+12π mm²; these sums do not describe a Boolean union.
The ground occurrence is fixed. The moving occurrence seats at translation
[0,0,4]. Actual current hole-cylinder references and the ground top/moving
bottom planes provide the independent concentric-plus-coincident control.
With only the moving root free, coaxiality removes four independent modes and
axial coincidence removes one: the checked regular case retains one spin.
The tests measure the actual rank instead of assuming every selection has it.

Material corner [10,2,4] of the moving leaf becomes [10,2,8] at zero spin and
[-2,10,8] after a positive quarter-turn about Z. Moving bounds change from
[-2,-2,4]..[10,2,8] to [-2,-2,4]..[2,10,8]. Fresh native vertex resolution,
BRep validity, one solid per occurrence, literal volume/area and these bounds
make the remaining rotation observable independently of solver row residuals.
Volume/area bands are 1e−5 mm³/mm²; point and bounds bands are 1e−6 mm.
The native bridge cases request 1e−6 mm and 1e−8 rad acceptance bands.

Additional original arrangements reuse this part below rigid containers.
They check different axis/cap descendants belonging to one effective owner,
full occurrence paths, and a proper Rx90 placement with independently expected
corner [17,-10,5]. A nested selection context does not turn descendants into
independent root bodies: the checked same-root case has rank zero and six
common rigid modes when that root is free. Another control leaves both roots
free and distinguishes six common rigid modes from the one relative spin.

Negative cases include radial axial-plane selections, a cap tilted by 5e−9 rad
that fails the separate 1e−12 rad structural axiality gate, malformed/accessor
requests, copied or stale proofs, disposed snapshots, fourth-query failure and
large original translations of +1e12/−1e12 mm whose cancellation must not erase
the precision budget. Actual material LINE edges are a separate positive axis
case. The current four-reference resolution and detached numerical constraint
are prerequisites only: they add no saved hinge family, editor, worker Apply
capability, angular limit, external runtime compatibility or platform claim.


## Saved unlimited hinge renderer fixture

[assembly-hinge-original.json](../src/cad/fixtures/assembly-hinge-original.json)
is the literal JSON form of the original GPL-3.0-only two-leaf recipe in
[kernel.assembly-hinge-fixture.test-utils.ts](../src/cad/kernel.assembly-hinge-fixture.test-utils.ts).
It was authored on 23 October 2026 from the public rectangle, circle, extrusion
and through-cut features. A single drilled leaf definition is reused by a fixed
ground occurrence and a free moving occurrence; the input contains no mates.
There is no external CAD source, private model or application trace in the fixture.

The rectangle occupies x[-2,10], y[-2,2] and is extruded to z[0,4]; the axial
through hole is the radius-1 circle centered at [0,0]. Each leaf has
V=192−4π mm³ and A=224+6π mm². The two placed solids sum to V=384−8π mm³
and A=448+12π mm², without a union-volume or finite-contact claim. Ground is
at identity and moving starts at translation [0,0,4]. Its literal material
corner [10,2,4] is therefore [10,2,8] in the initial world frame. A positive
90-degree Z spin puts the same corner at [-2,10,8], and moving bounds change
from [-2,-2,4]..[10,2,8] to [-2,-2,4]..[2,10,8]. The hole is interior and does
not alter these rectangular extrema.

The authored [renderer workflow](../scripts/desktop-assembly-hinge-flow.cjs)
selects the current radius-1 cylinder of each leaf and the ground z4/moving z0
cap planes by native geometric support and full producer identity. It exercises
incomplete input, actual radial-plane rejection, ready Cancel/retry/Apply,
edit/reselection, history, suppression/deletion and saved reopening. A real
component-motion control requests the 90-degree spin; native material vertices,
placed bounds, area/volume and fresh reports provide the independent oracles.
The regular fixed-ground case checks local rank5/DOF1 again after the temporary
movement anchor is removed. Volume/area bands are 1e−5 mm³/mm², point and bounds
bands 1e−6 mm, material basis 1e−8 and requested hinge angular band 1e−8 rad.

The scenario uses production renderer/worker/file IPC and test-owned dialog
substitutions. Its configured CI entries and authored source are not evidence of
an executed renderer result, human file-dialog interaction, viewport picking,
reference-application compatibility, angular limits or support on another platform.

## Original hinge picking and H4/H5/H6 repair controls

The original GPL-3.0-only recipes below were authored within this project on
23 October 2026. They use public rectangle, circle, extrusion and through-cut
features, without external CAD files, application output or imported binaries.

- [assembly-hinge-original.json](../src/cad/fixtures/assembly-hinge-original.json)
  supplies the existing H4 drilled leaf and two seated occurrences.
- [assembly-hinge-picking-original.json](../src/cad/fixtures/assembly-hinge-picking-original.json)
  reuses that H4 feature recipe, with fixed ground at identity and the moving
  occurrence at translation [20,0,8] mm and proper Rx(-90°). Its initial moving
  bounds are [18,0,6]..[30,4,10]. It contains no mates or precomputed solve.
- [assembly-hinge-updated-part-original.json](../src/cad/fixtures/assembly-hinge-updated-part-original.json)
  keeps the H4 part ID and changes both extrusion and through-cut depths to
  H5=5 mm. The shared-source case updates both occurrences.
- [assembly-hinge-replacement-part-original.json](../src/cad/fixtures/assembly-hinge-replacement-part-original.json)
  declares a distinct replacement part ID and depths H6=6 mm. Selected and
  all-use replacement have different affected role inventories.

For every H, the local outer box is x[-2,10], y[-2,2], z[0,H], with an interior
radius-1 through hole centered at x=y=0. The independent formulas are
V=(48−π)H mm³ and A=96+32H+(2H−2)π mm². H4 therefore has V=192−4π/A=224+6π;
H5 has V=240−5π/A=256+8π; H6 has V=288−6π/A=288+10π.
The outer rectangular corners still give the exact placed box extrema after
proper rotation: the interior hole does not remove them.

The repair script checks per-body values as well as sums. H5/H5 and H4/H6
both sum to V=480−10π and A=512+16π, so totals alone cannot distinguish a
shared update from selected replacement. All-use H6/H6 sums to V=576−12π and
A=576+20π. These are sums of separate solids, not Boolean-union measures.
Current ground-top/moving-bottom cap choices and hole axes supply material
oracles independently of an assumed free-roll pose. Volume/area bands are
1e-5 mm³/mm², placed point/bounds bands 1e-6 mm and material-direction bands
1e-8; requested hinge acceptance remains 1e-6 mm and 1e-8 rad.

`assemblyHingeChoices.test.ts` supplies original display-only support metadata
with literal cap points z0/z4, radial normals and distinct cylinder/LINE labels.
It checks local/world distinction, reused occurrence namespaces, hidden/scope
filtering, full normalized keys and non-authoritative current-catalog ordinals.
Those examples are not native BRep execution or evidence of reference currency.

The saved native motion regressions use an independently declared Rx(4e-9 rad)
placement of the original H4 moving leaf at [2e-8,-4e-9,4] mm. That angular
defect is below the public 1e-8-rad band and above the optional 1e-9-rad internal
refinement target. Intrinsic Z motion by pi/2+0.125 rad must retain the public
band through two verified stations, with and without an unrelated free leaf.
For material corner [10,2,4], set x=10 cos(a)-2 sin(a), y=10 sin(a)+2 cos(a):
the literal final point is [x,y cos(t)-4 sin(t),4+y sin(t)+4 cos(t)]. The native
point uses a 1e-6-mm band. A separate Rx(2e-8 rad) driven case must reject with
the original public 1e-8-rad certificate. These are project-authored placements,
not imported reference-application measurements or a prescribed free-roll result.

`assemblySolverRefinement.test.ts` adds original numerical XY-plane declarations
with independent fixed and movable owners. Both start at a 4e-9-rad X tilt:
the fixed relation must retain that accepted defect under the public 1e-8-rad
band while the movable group refines to its explicit 1e-9-rad target. A fixed
2e-8-rad control rejects atomically. Omitted/equal targets and invalid or executable
target fields have separate cases. These pure numerical observations are not
native reference authentication. The saved native preflight also rejects invalid
caller targets before the private station target can mask them.

The authored `assembly-hinge-picking` and `assembly-hinge-repair` scenarios
exercise separate interaction and repair contracts. Source code, fixtures and
configured workflow registration are not proof of execution. Actual renderer
results and any failed attempts must be recorded separately in validation; no
other-platform, angular-limit, contact or full-demo claim follows from them.

## Original numerical hinge angular stops

`assemblyHingeStopsDeclaration.test.ts`, `assemblyHingeStopsGeometry.test.ts`
and `assemblyHingeStopsNumeric.test.ts` contain original GPL-3.0-only numerical
declarations authored on 23 October 2026. They import no external CAD files,
reference-application coordinates, binaries or precomputed native solutions.

The Cartesian joint has two Z line axes, coincident axial planes through z2
and two separate X-normal angular planes through [3,0,0]. With the fixed owner
at identity and the other rotated by theta about Z, the independent material
ray is [cos(theta),sin(theta),0]. The explicit arc start330/sweep60 degrees
admits zero and has endpoints at -30/+30 degrees. Rays at 320/40 degrees restore
to 330/30; sequential inward/outward targets establish release and clamping at
both ends. Equal20-degree endpoints differ from a full circle. The angular
normal's point does not determine an angle origin.

Separate descendant rotations of +10/-5 degrees under a physical +20-degree
rotation give a literal five-degree phase. Reversing both Z axes reverses the
guide's sign without changing the normals; opposed bilateral axis alignment
alone does not do so. Common-motion and twelve owner-column derivatives are
checked at finite-difference steps 2e-5 and 7e-6. Helper-level nine ambient
direction derivatives use their separately recorded two step sizes. The
two-owner test's derivative comparison band is 3e-8; its physical acceptance
bands remain 1e-6 mm and 1e-8 rad. These are different quantities.

The connected original 2:1 gear has normalized weights 1 and 1/2 and phase
40 degrees: thetaMoving + thetaFollower/2 = 40 degrees. Restoring the hinge's
40-degree violation to its 30-degree stop therefore places the follower ray at
20 degrees. This expectation uses that literal relation, not the gear helper.

Direction-cone controls perturb all three directions, including the material
guide, and independently compare observed angular change with the retained
bound. Singular axial-cap projection, nearly parallel normals, cone/cut
intersection and exhausted precision reject. A nominal violation of 8e-9 rad
with a declared 2e-9-rad first-normal error exhausts the 1e-8-rad requested band;
the same error at a 29-degree interior pose remains admissible. No positional
support tolerance is treated as a measured angular error.

These are explicit numerical inputs, not current native topology witnesses,
fresh installed-application observations or evidence of saved/editor hinge
limits. The [contract](ASSEMBLY_HINGE_STOPS_NUMERIC.md) retains those integration
requirements and the full assembly/demo scope.

## Original native six-role hinge controls

`kernel.assembly-hinge-limits.test.ts` reuses the project's original GPL-3.0-only
H4 drilled-leaf recipe and adds original placements and inline reference
requests authored on 23 October 2026. It imports no external CAD models,
application coordinates, binaries or native solutions. The separate
`assemblyLimitedHingeReferences.test.ts` checks strict standalone syntax. The
later saved integration admits strict optional stops while preserving the
four-role standalone request boundary and the old unlimited serialized form.

Each leaf has local box x[-2,10], y[-2,2], z[0,4] and an R1 through hole at
x=y=0. Per-body V=192−4*pi mm³ and A=224+6*pi mm²; two separate leaves sum to
V=384−8*pi and A=448+12*pi. Ground is fixed at identity; the moving leaf is at
[0,0,4] mm with a literal Z rotation. Current cylinder axes and z4/z0 caps
provide the original hinge roles. Two current +X-normal faces at x10 provide
angular roles. The actual native cylinder guide is checked as signed Z; the
expected phase is guideSign*theta modulo one turn, not an assumed positive
kernel-axis convention. The symmetric start330/sweep60-degree interval has
physical endpoints at −30/+30 degrees under either guide sign.

At physical theta, native material corner [10,2,4] must be at
[10*cos(theta)−2*sin(theta),10*sin(theta)+2*cos(theta),8]. Original box corners
independently bound each placed solid. Volume/area bands are 1e-5 mm³/mm²;
placed material-point/bound bands are 1e-6 mm and phase comparisons 1e-8 rad.
An original proper common Rx(90 degrees) placement checks a guide outside world
Z. With translation [7,−2,3] and physical spin20 degrees, the same material
corner is [7+10*cos20−2*sin20,−10,3+10*sin20+2*cos20]. The BRep analyzer and
independent solid traversal check the original native prototype separately.

Reused nested containers supply distinct axis/cap/angular descendants. Angular
descendant rotations +10/−5 degrees under physical +20 degrees give a literal
five-degree phase, with the actual guide sign retained. A separate Ry(30
degrees) descendant case has perpendicular projection lengths sqrt(3)/2 while
retaining a signed twenty-degree phase. Selecting a nested context keeps its
actual root owner, including repeated-owner zero relative rank.

Fresh measurement counts exactly six face queries. Fault controls execute the
real queries before failing the sixth or changing the document at its return;
they do not supply invented native support. Cleanup tests retain ordered
primary and release failures and verify one public-wrapper disposal attempt.
Copies, different snapshots, changed sources, disposed proofs and geometrically
coincident faces on the other owner cannot grant six-role authority.

Separate controls distinguish a zero-width interval, an observable full circle,
the opposite-centre chart, unrepresentable radian conversion, an unobservable
axial-cap normal, exhausted length precision and large cancelling placement
declarations. These support measurements are not saved/editor stop lifecycle,
external angular-policy compatibility, continuous contact or full-demo evidence.

## Original saved six-role hinge workflows

The [saved stop extension](ASSEMBLY_HINGE_STOPS.md) adds original GPL-3.0-only
tests and scripts authored on 23 October 2026. It reuses the tracked
`assembly-hinge-original.json`, `assembly-hinge-updated-part-original.json` and
`assembly-hinge-replacement-part-original.json` recipes. There are no new
imported models, vendor assets, binaries, private paths or external coordinates.

`assemblyHingeStopsLifecycle.test.ts` adds nine model cases with original
declaration locators. They establish strict saved syntax, unlimited byte-shape
compatibility, six-role visitors and repairs, dormant/reused/renamed source
handling, selected copy isolation, root revision and history. Their invented
locators are syntax/lifecycle inputs and grant no native witness.

`kernel.assembly-hinge-limits-saved.test.ts` adds ten native cases built from
the original leaf recipe. Six current material proofs, copied-proof rejection,
fresh physical/interval reports, detached DTO mutation, one-use private Apply,
motion, saved reconstruction, suppressed repairs, six-role replacement, repeated
rigid subassemblies, singular projection and full-circle intent have distinct
controls. Six new UI cases and one additional case in each of the three repair
panel suites cover explicit fields, role-purpose filtering, tickets, stale or
malformed stop reports and role labels. SSR is separate from real interaction.

The production `assembly-hinge-limits` script selects six actual current native
roles through dropdowns. Angular faces are the material +X faces at local x10.
It deliberately uses an axial face for one angular role to reject an
unobservable projection. Five roles, empty fields and start360 cannot submit.
The explicit start330/sweep60-degree arc wraps zero. Commanded physical Z angles
are 0, +20 and −20 degrees; a request from +20 to +40 rejects atomically. The
negative incremental request crosses zero. Its phase oracle observes the actual
selected cylinder axis's signed local Z, then expects guideSign*physicalTheta
modulo one turn. No native axis convention is assumed.

For H4, each native material corner [10,2,4] must map to
[10*cos(theta)−2*sin(theta),10*sin(theta)+2*cos(theta),8]. Eight independent
rotated box corners bound the solid, and the [−2,2,4] to [10,2,4] edge supplies
the material X basis [cos(theta),sin(theta),0]. Each original leaf has
V=192−4*pi and A=224+6*pi; aggregate V=384−8*pi and A=448+12*pi. Point/bound
bands are 1e-6 mm, material basis/phase 1e-8 and mass/area 1e-5. Native requested
hinge bands remain 1e-6 mm and 1e-8 rad with retained error charged.

The separate `assembly-hinge-limits-repair` script uses H4/H5/H6 leaves with
local x[−2,10], y[−2,2], z[0,H] and an R1 through hole. Each has
V=(48−pi)*H and A=96+32*H+(2*H−2)*pi. H5/H5 and H4/H6 share aggregate
V=480−10*pi and A=512+16*pi, so each body's volume, area, complete source tuple,
native material corners and proper-pose bounds must also match. Repair leaves
the free roll unprescribed; expected geometry is calculated with an independent
quaternion rotation from the actual saved proper pose. Its phase uses the sign
of the exact selected current cylinder face, never a presumed positive guide.

Shared-source H4→H5 requires six explicit repairs. Selected H4→H6 requires the
moving axis, cap and angular face while preserving the other three complete
references; all replacement requires all six. Five-of-six source and total
replacement repairs, and two-of-three selected repairs, cannot publish Apply.
The start/sweep and mate ID remain exact through ready Cancel/retry, Apply,
Undo/Redo and saved reopening. Original inputs and all four saved byte streams
remain unchanged by later previews and reopening.

Both scripts use actual production controls, worker results and restricted file
IPC with isolated test-owned native-dialog substitutions. Their queues are
respectively two Open/one Save As and eleven Open/four Save As; parent, child
and step deadlines remain 180/170/35 seconds. Authored commands and configured
CI do not record a pass. Actual results belong in [validation](VALIDATION.md).
These workflows establish no angular-role pointer selection, pointer projection
at either stop, continuous trajectory/contact, external policy equivalence,
installed-package operation, other-platform support or full assembly demo.

## Original limited-hinge pointer selection and stops

`desktop-assembly-hinge-limits-picking-flow.cjs` and its separate
`desktop-assembly-hinge-limits-drag.cjs` helper are original GPL-3.0-only scripts
authored on 23 October 2026. They reuse the tracked original
`assembly-hinge-picking-original.json` H4 recipe, without new imported models,
external coordinates, vendor binaries or proprietary source. Initial moving
placement is [20,0,8] mm with Rx(−90 degrees), keeping both caps selectable.

Six actual CDP face clicks select two R1 cylinder axes, the ground z4/moving z0
caps and two material +X planes at local x10. A staged current LINE selection is
restored to the original cylinder before authoring; an eighth hit reselects the
moving angular plane during editing. The original isometric camera projection
uses the current canvas rectangle and original material points. Full current
owner/body/producer/reference option identities must match after each click;
the other five fields, recovery bytes and worker serial remain unchanged.

Negative inputs click a plane for a cylinder-axis role and a cylinder for an
angular material-plane role, release a canceled armed gesture, and click a
retained material pixel after hiding its source. These bounded interactions do
not prove arbitrary visibility, saved LINE authoring or a callback-before-render
race. The script observes normal DOM state and trusted input; it does not invoke
React callbacks or replace documents, CAD responses or worker capabilities.

After actual six-role authoring, the explicit start330/sweep60-degree arc bounds
physical Z spin by [−30,30] degrees under either observed cylinder guide sign.
The initial solved free roll is observed rather than prescribed. A frontal view
keeps local Z perpendicular to the view ray. Two actual horizontal held moves
produce distinct trusted DOM clientX values and posted request poses, which
calibrate the final third pointer input. No solved pose or reported phase enters
that calibration. Rotation about the view ray uses a different non-affine
chart and is outside this case.

Five gestures request +60 degrees twice (Cancel, then retry/Apply), +10 toward
the interior, −60 toward the other stop and −10 toward the interior. Each gesture
has exactly three posted projection requests from the exact confirmed document.
Requested quaternion/yaw must fit the literal target within 1e-6 rad. Finite
client coordinates quantize the input, so expected output is calculated from
the actual posted yaw: clamp it independently to literal [−30,30] degrees.
The saved reopening expectation retains that input-derived value.

For expected physical theta, the moving material corner [10,2,4] must be at
[10*cos(theta)−2*sin(theta),10*sin(theta)+2*cos(theta),8], with eight transformed
box corners supplying independent placed bounds. Each leaf retains
V=192−4*pi and A=224+6*pi; total V=384−8*pi and A=448+12*pi. These use
1e-5 mass/area and 1e-6 mm point/bound bands. Actual native world normals give
an independent XY azimuth with the selected cylinder's signed Z guide; expected
directed phase is guideSign*theta modulo a turn. Phase comparisons and the
unchanged requested native acceptance band are 1e-8 rad, with retained error
charged. Pointer target error is a separate 1e-6-rad check.

Both boundary activities and interior release are verified. Projection's
reported angular deviation must equal abs(postedYaw−clampedYaw), with no
temporary motion anchor or substituted strict-motion result. Apply stays
blocked while held, the confirmed recovery stays unchanged until Apply, and
Cancel revokes the candidate. Source cache, six-role declaration and arc remain
exact through Apply, Undo/Redo and saved reopening. Actual file IPC uses two
Open and one Save As test-owned substitutions, with input/saved bytes retained.

The existing 180/170/35-second parent/child/step budgets and sandbox remain
unchanged. Authored scripts and configured multi-platform CI are separate from
source-specific [executions](VALIDATION.md). This original local-Z/symmetric-arc
case establishes no continuous trajectory/contact, arbitrary camera, general
interval/reference combination, external angular policy, human file-dialog,
installed-package or other-platform acceptance, or full assembly/demo completion.

## Original structural STEP prerequisite

`kernel.assembly-step-structure-fixture.test-utils.ts` is an original
GPL-3.0-only recipe authored on 23 October 2026. It constructs millimetre
rectangular prisms from sketches and extrusions; no imported model, vendor
binary, proprietary source or private file is required. P and Q are separate
ID/revision definitions with identical 2×3×4 geometry and the same quoted,
Unicode display name. C is a 1×2×5 prism. Their local boxes start at [0,0,0].

Subassembly S contains a:P at identity, b:Q at Rx90+[10,0,0], and c:C at
Rz90+[0,10,0]. G contains S at Ry90+[0,0,20]. Root contains left:G at
Rz90+[100,0,0] and right:G at Rx90+[0,100,0]. The rotations do not commute.
Six native placed solids must have these hand-derived world boxes, ordered
left a/b/c then right a/b/c:

| Leaf | Minimum (mm) | Maximum (mm) |
| --- | --- | --- |
| left/a | [97,0,18] | [100,4,20] |
| left/b | [100,0,8] | [104,3,10] |
| left/c | [89,0,20] | [90,5,22] |
| right/a | [0,80,0] | [4,82,3] |
| right/b | [0,90,-4] | [3,92,0] |
| right/c | [0,78,10] | [5,80,11] |

P/Q each have V=24 and A=52; C has V=10 and A=34, giving expanded
V=116 mm³ and A=276 mm². Hidden right preserves all six; suppressed right
leaves V=58 and A=138. Native export tests use absolute 1e-6 numeric bands.
Saved import/rebuild tests use max(1e-6, abs(expected)*1e-10), explicitly
including transformed bounds, volume and area. These are checked assertion
bands, not a general interchange precision or manufacturing guarantee.

Native unit derivatives change the actual generated STEP length declarations
while retaining its numeric coordinates: metres scale lengths by 1000, and
an explicit dimensional conversion graph scales inches by 25.4. Expected
lengths, areas and volumes scale by s, s² and s³ respectively; rotations do not.
Autonomous saved bases are re-read in millimetres and rebuilt after v2
serialization. A second structural export/import checks reuse and geometry
again. The original input file is not needed by the reopened document.

Repeated imports of the exact same bytes at two controlled dates receive fresh
revision namespaces. Both complete caches must compose in one destination with
twelve expanded leaves and no false exact-tuple content conflict; reuse within
each imported graph remains intact.

`kernel.step-part21.test.ts` and `kernel.step-structure.test.ts` contain original
literal syntax/graph recipes. Their empty shell placeholders deliberately do
not constitute transferable BRep; native geometry authority is exercised in
separate exporter/importer tests. Structural frame checks include a nonidentity
source frame, literal noncommuting point transforms, declared units, and very
small/large finite direction ratios. Graph checks preserve separate same-name
products and reject malformed, ambiguous, external, cyclic or excessive input.

Fault cases cover selected transfer, query, native-release and virtual-file
failures, result withholding, owned-wrapper release and preservation of foreign
files at occupied temporary names. The part-import arena retains a valid result
until all other releases succeed. Export tests distinguish intentionally
transferred engine catalog leases from the underlying catalogs' actual disposal;
neither is counted as an unowned exporter handle.

The [structural contract](ASSEMBLY_STEP_STRUCTURE.md) states the deliberately
restricted AP242 profile, one-solid-per-product import boundary and absent
worker/editor route. Tests use generated standard STEP entities, not a sidecar
that pretends to establish hierarchy. Execution results belong in
[validation](VALIDATION.md); no external application, arbitrary-file
compatibility, hosted CI, installed package, other platform or complete demo
is established by these cases.

## Original multibody STEP bases

The original GPL-3.0-only
`kernel.assembly-step-multibody-fixture.test-utils.ts` extends the structural
STEP recipe on 23 October 2026. P gains a second explicit rectangular prism
with local bounds [10,0,0]–[11,2,5] mm, V=10 mm³ and A=34 mm². P remains one
part definition with two bodies. Q retains the same display name and original
2×3×4 geometry as P's first body; C remains a separate 1×2×5 part. No external
model, vendor binary or proprietary source supplies these recipes.

The existing six world boxes remain unchanged. The two added boxes are
left/a [98,0,9]–[100,5,10] and right/a [0,90,0]–[5,91,2] mm, derived by the
same literal Ry90 then Rz90/Rx90 coordinate maps. Totals are eight solids,
V=136 and A=344; suppressing right leaves four solids, V=68 and A=172.
Hidden right still contributes its geometry. Local and world comparisons use
max(1e-6, abs(expected)*1e-10). Native metre/inch derivatives retain numeric
coordinates while changing declared length graphs, so length/area/volume
expectations scale by s/s²/s³. Each autonomous saved body base is re-read in mm.

Actual standard STEP structure is checked independently of solid enumeration:
six products, three part definitions, three assembly definitions including root,
six usage edges and P with two associated `MANIFOLD_SOLID_BREP` labels. The
writer uses an ordinary `SHAPE_REPRESENTATION` for this P, demonstrating why
representation subtype cannot classify every product as an assembly. Native
transfers resolve the exact associated solid labels; saved body IDs are explicit
assignments rather than ordinals. A second export/import after v2 reopening
must retain product reuse and all eight placed solids.

A coincident variant makes both P bodies 2×3×4 at the same local coordinates.
They must remain separate body owners in one product: summed V=48/A=104,
with their native intersection V=24. Equal names, shape coordinates or hashes
do not authorize deduplication. A second-entity transfer failure withholds the
whole import and restores virtual files.

`kernel.imported-bodies.test.ts` reuses the tracked original mm box, translated
box and open-shell STEP fixtures. Each closed box has V=240/A=248; translated
bounds are [12,-4,7]–[22,2,11]. Native cases check independent/coincident owners,
intersection, selected cuts, body copies, exact inspection, source invalidation,
suppression/history, failed second source and fatal cleanup after adoption.
When only A's source changes, old A selection rejects while B's original face,
edge and vertex references resolve again with unchanged supports and native
metrics. This does not retain a borrowed witness across an engine rebuild.

`model/importedBodies.test.ts` uses original tiny Part 21 syntax for integrity
and saved-schema tests only. `importedBodies.size.test.ts` uses an original
zero-byte payload, deliberately not a transferable CAD model: two canonical
base64 sources total 20,960,000 encoded bytes, below the 20 MiB table cap.
Additional Unicode sketch names cross the final UTF-8 serialized-file limit
and must still reject. Geometry authority belongs to the separate native cases.

The new additive feature does not change the legacy one-solid menu or grant
feature-recipe regeneration. Executed native, renderer, IPC and platform checks
must be read in [validation](VALIDATION.md); they do not establish arbitrary
STEP representation compatibility or complete structural editor/demo scope.

`desktop-imported-bodies-flow.cjs` builds an original v1 document at test runtime
from the two tracked box STEP fixtures, with one `importedBodies` feature and
declared `import-A`/`import-B` IDs. The test-owned input directory has no
standalone STEP source file. Normal Open supplies the document through actual
restricted file IPC; the observer records actual worker results without changing
requests, replies or application state.

The production-renderer workflow checks read-only base information/Cancel,
whole-base suppression/reactivation with Undo/Redo, fresh reconstruction and
Save As/reopening. Native worker volumes/bounds and saved source bytes/SHA/IDs
are checked separately from planar mesh area. Each actual box mesh has summed
area 248 mm² under an absolute 1e-6 band; this is not a new BRep-area DTO.
Its fixed dialog queue is two Open and one Save As. The existing 180/170/35-second
parent/child/step budgets and renderer sandbox remain unchanged. Body-detail
observation is enabled only for this statically allowlisted scenario. Other
scenarios retain their earlier normalized response shape and omit the mesh-area
work. This case establishes neither viewport picking nor a structural STEP
import dialog, selected-body cut interaction or general platform acceptance.

## Original structural STEP editor workflow

`desktop-assembly-step-flow.cjs` declares an original GPL-3.0 runtime recipe
matching `kernel.assembly-step-multibody-fixture.test-utils.ts`. It writes its
own test inputs, without a private model or a prefabricated neutral export.
P is the 2×3×4 box plus a disjoint 1×2×5 box at `(10,0,0)`. Q has P's first
box geometry and display name, but a distinct product identity. C is the
1×2×5 box. The S/G/left/right graph, proper quarter rotations and literal
world boxes follow the structural fixture above. The eight placed solids have
independent totals V=136 mm³ and A=344 mm². Their individual volumes are 24
or 10 mm³; surface areas are 52 or 34 mm².

The workflow requests a structured export from the actual committed editor
document. Its graph checks use the actual emitted STEP entity relationships;
they do not use a SolidFlow sidecar or infer products from geometry equality.
Fresh native reading checks all eight valid native solids, physical properties and
the eight hand-derived world bounds. The ordinary production assembly scene
already reports native volume, area, solid count and bounds; those fields are
separate from a tessellation-area estimate. Physical scalar/bounds comparisons
use absolute 1e-6 in their respective units; local quaternion comparison admits
equivalent signs under a 1e-10 norm band.

The fixed scenario covers structural import from both workspaces, dialog
cancellation, malformed-source rejection, normal Save As/reopening and a second
structured export from the reopened autonomous bases. The exact STEP source
bytes/SHA, body assignments, product reuse, names and local placements have
separate checks. Source neutral paths are never saved as `.solidflow` targets.
The dialog substitutions belong solely to the test-owned isolated filesystem;
worker requests and replies remain the actual production path. No solver reply,
React callback or application state is injected.

The shared 180/170/35-second parent/child/step budgets, sandbox and file IPC
permissions remain unchanged. The scenario is statically allowlisted.
Configured commands are not execution evidence. Actual checks and any failure
or remaining limits belong in [validation](VALIDATION.md). The original case
does not prove arbitrary AP242 compatibility, another CAD kernel, human native
dialogs, browser fallback, installed packages, general platform support or the
complete assembly demo.

## Fresh support face original

The original analytical recipe in `scripts/desktop-part-fresh-sketch-original.cjs`
and native cases in `src/cad/kernel.part-fresh-sketch.test.ts` were authored for
this project under its GPL-3.0 license. They use no external CAD model, vendor
asset or proprietary source. The renderer input contains only a centered
20 × 12 mm XY rectangle and its 4 mm extrusion; downstream sketches are absent.

The workflow creates a centered 4 × 4 mm rectangle on the current Z = 4 mm
face, merges a 3 mm boss, then creates a centered 2 × 2 mm rectangle on the
new Z = 7 mm face and cuts with depth −3 mm. The pocket ends at Z = 4 mm.
The independent volume calculation is 20×12×4 = 960, then +4×4×3 = 1008,
then −2×2×3 = 996 mm³. The base area is
2×(20×12 + 20×4 + 12×4) = 736 mm². The boss adds its lateral area
4×4×3 = 48 mm²: the removed contact patch and new top patch cancel.
The pocket likewise adds 4×2×3 = 24 mm², giving areas 784 and 808 mm².
Bounds remain [−10, −6, 0] to [10, 6, 4] for the base and
[−10, −6, 0] to [10, 6, 7] after both operations.

Native checks use absolute 1e-6 mm length and 1e-5 physical-property bands
in their respective units. Renderer worker volume uses 1e-5 mm³, bounds
1e-6 mm, and independently summed planar mesh area 1e-4 mm². Mesh area
is not a native BRep-area measurement. The sketch's existing 0.001 mm snap
is retained; saved points are compared to the intended snapped pointer targets
under 1e-9 mm, separately from geometric properties.

`desktop-part-fresh-sketch-flow.cjs` uses actual pointer events to pick support
faces and draw the two rectangles. Rendered SVG origin, grid and projected
reference bounds calibrate screen coordinates. SVG Float32 pixel bounds admit
a bounded calibration budget derived from coordinate magnitude and scale,
required to remain below 0.0001 mm. This calibration allowance does not relax
saved-point or native tolerances. Screenshots document appearance only; neither
they nor Float32 display coordinates provide geometry authority. History and
file reopening compare the retained sketch supports, points and destinations.

These are tracked definitions and intended checks, not passing renderer or
full-suite claims. Executed results belong in [validation](VALIDATION.md).
Coverage is limited to this centered planar sequence; it does not establish
arbitrary support orientation, changing topology, general interactive sketch
coverage or platform support.
