# Public fixture provenance

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
