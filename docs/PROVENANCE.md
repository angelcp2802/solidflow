# Public fixture provenance

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
