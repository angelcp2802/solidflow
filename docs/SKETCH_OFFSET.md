# Associative sketch offsets

In an entity sketch, choose **Equidistancia**, select lines, arcs or circles,
and enter a positive distance in millimeters. **Seleccionar cadena conectada**
expands the selection through shared endpoint identities. It does not join
unrelated points that happen to have the same coordinates. Disable it to
offset only the selected portions. Separate chains and complete circles can
be included in the same operation; each circle is its own component.

**Invertir dirección** selects the other side. **Ambas direcciones** prepares
both copies together. **Cierre de extremos** adds straight or semicircular
end caps to an open chain; closed contours do not need caps. The preview shows
all images and caps before **Aplicar equidistancia** commits the complete
proposal as one sketch-history entry. Escape ends the tool without applying
its pending proposal. A previously applied offset remains in the sketch.

For each open chain, its first selected entity supplies the traversal direction.
The initial side is to its right; reversing that entity's stored endpoints
reverses that side. Closed contours use a counterclockwise traversal and
initially offset outward, regardless of their stored endpoint order. Complete
circles likewise start with a larger image. **Invertir dirección** switches a
closed contour to its inward side.

Choose whether the originals, images or both should become construction
geometry. Construction entities do not contribute to solid contours. The
default preserves the originals' construction flags and creates ordinary
images. Caps follow the images' construction choice. Converting the original
closed contour to construction is useful when the new contour should define
a filled region; retaining two ordinary nested contours produces a hole.

## Geometry and stored relationships

Offsets use exact straight and circular supports. A straight line keeps its
direction; a circular arc keeps its center and traversal sense while its
radius changes. Complete circles get a distinct concentric circle. Adjacent
supports meet at shared image points: corners use miter intersections and
tangent continuations stay tangent. Circular arcs, including major arcs,
remain circular rather than being replaced by a sampled polyline.

The stored `offset` relation records ordered source entities with explicit
traversal directions, image identities for each side, chosen intersection
branches, and any caps. Each image side has a continuous distance variable.
The image's stored `distance` is its geometric seed, not a permanent driving
target. Separate `offsetDistance` dimensions reference the relation and side.
This keeps the geometric association active when a distance dimension is
removed or made driven.

With **Añadir cota de distancia**, edit the distance in the dimensions
inspector. Without it, the separation can change while the image remains
parallel or concentric. A driven distance measures the current solved
separation; its retained value is not a target. Uncapped open endpoints remain
free along their supports when their endpoint policy is free. New uncapped
line offsets created with a distance dimension instead align their end
stations with the source endpoints: the displacement is perpendicular to the
source line. A source length edit from 10 to 12 mm therefore moves an image
endpoint from `(10,-2)` to `(12,-2)`; changing the distance to 3 mm then gives
`(12,-3)`. These equations work in both directions, so an image length
dimension can drive an otherwise free source length. An incompatible image
endpoint target is rejected when the source is fully constrained.

Alignment belongs to the stored association. Converting its distance to a
driven measurement, or deleting only that dimension, frees the separation
while retaining endpoint alignment. Arc endpoints retain their own free
intervals; line alignment does not copy the source arc sweep. Caps and closed
chains retain their existing endpoint equations.

For two sides without caps, or with straight caps, the distances are
independent. Two semicircular caps instead center on the source endpoints
and keep the sides symmetric. Their first distance dimension drives the
separation and the second is a driven measurement. Single-sided semicircular
caps connect the source and image; their initial radius is half the
separation.

The group owns each semicircular cap's exterior winding. A direct edit to a
cap's clockwise flag is restored when solving, just as an associated image
arc's sense follows its source. Capped circular endpoints and tangent
continuation joins retain their original radial ray; the opposite ray is
rejected rather than turning a short contour into a major arc.

Planning consumes the solved geometry currently displayed. Applying checks
that this source and the selection still match, solves the whole detached
proposal once, and only then adds it to history. Invalid selections, branches,
collapsed radii or segments, self-intersections, structural overflow and failed
solves leave the original sketch unchanged. These checks also apply during
later source or distance edits; the solver does not silently choose a different
intersection branch to rescue an invalid contour.

## Disconnected components and shared distance

The command partitions the original displayed sketch using shared endpoint
identities before creating any images. Selecting another entity in the same
expanded component does not create a second copy. With chain expansion off,
only the selected entities participate; separate selected portions remain
separate components. Coordinate proximity does not merge them. Every
component retains its own traversal, source/image association, endpoint
policy, joins and caps. The preview contains the entire proposed operation;
a failure in one component rejects the whole proposal without retaining an
earlier component.

Each side has one shared separation across all selected components. An
`equalOffsetDistance` relation stores at least two distinct references
`{ offsetId, side }`. Its equations equate the existing continuous distance
variables, with no additional driving value. The per-image stored distance
remains a geometric seed. Thus two source lines `(0,0)→(10,0)` and
`(20,5)→(30,5)` at right distance 2 produce images at y=-2 and y=3.
Changing the shared distance to 3 produces y=-3 and y=2. Reversing the stored
direction of the second source makes its right side point upward instead.

Adding dimensions creates one driving distance per side, owned by the first
component. The family remains active when that dimension is deleted or made
driven. Without a driving dimension, an image's normal movement can change
the common separation while preserving the associations. A driven dimension
reports solved geometry; its retained nominal value cannot constrain the
family. Endpoint-following release remains local to the endpoint explicitly
moved, while the normal distance stays shared.

With two sides and straight or absent caps, each side's family is independent.
If any open component has semicircular caps, those caps impose side symmetry,
which propagates through both families. Only the first distance then drives;
the second is a driven measurement. This is an explicit geometric and solver
policy. It does not establish another solver's rank, cap-edit or lifecycle
behavior.

Deleting an association removes its references from each family. A family
with at least two surviving members keeps its identity and equality equations;
a smaller family is removed. A dimension owned by the deleted association is
removed, without promoting a surviving dimension or creating another driver.
Surviving family members can therefore retain a shared but free separation.
Deleting only the family relation unlinks its common-distance equations and
retains the individual offset associations and their existing dimensions.

Starting with 0.19, the family is a new relation in the version-1 document format. Existing
documents retain their endpoint policies and are not silently upgraded.
Earlier readers that do not recognize `equalOffsetDistance` reject documents
containing it. Missing associations or sides, repeated references and unknown
fields are invalid; no partial family is accepted during parsing.

## Editing, unlinking and compatibility

Original point/entity/constraint identities are retained. Images get new
identities and their own centers, connected to the source through equations.
Select the offset relation in the relations inspector to inspect its geometry
or delete that association. Deleting only a distance dimension leaves the
association with a free separation. Deleting the group removes dimensions
that reference it; deleting an image or source removes incomplete groups and
their dependent dimensions. Surviving geometry remains editable.

Trim, extend, chamfer and sketch fillet currently require deleting the offset
relation before changing the topology of a participating source, image or cap.
Their diagnostic explains that explicit unlink step. They do not silently
detach the association. Other entities in the same sketch remain available
to those tools.

Save/reopen preserves the group, distance dimensions, shared image vertices,
construction choices and frozen branches. This adds relation types to the
version-1 format. Existing version-1 documents remain readable. Older builds
that do not recognize `offset` or `offsetDistance` reject those newer
documents explicitly; forward compatibility is not promised.

Starting with 0.17, an image may additionally store
`lineEndpointMode: "aligned" | "free"`. An absent field means free, preserving
0.16 documents even when they have a driving distance dimension. Explicit
free mode has the same geometry and structural naming as absence. Aligned
mode applies only to line endpoints of uncapped open chains; it is rejected
on closed or capped groups and groups whose two ends are arcs. Older builds
that do not recognize the field reject such newer documents. The enclosing
document remains version 1.

Starting with 0.18, new offsets without a distance dimension instead store
`lineEndpointFollowing: [startFollows, endFollows]` for eligible line ends.
Indices refer to the chain's traversal direction, including reversed sources,
rather than an entity's stored endpoint order. Each true flag adds a station
equation. An untouched line initially from `(0,-2)` to `(10,-2)` therefore
has end stations x=0 and x=14 when its source length changes to 14 mm. Its
uniform normal separation remains free and can drift numerically from the
2 mm seed; these station equations do not fix Y at -2.

Dragging an image endpoint or editing its X/Y coordinate explicitly releases
that endpoint's following flag if the requested coordinate changes and the
whole reposition succeeds. A normal-only edit releases it too. Placing the
end at `(12,-2)` then changing the source to 14 mm leaves its end station
at x=12. Moving only the start to `(-2,-2)` leaves the untouched end
following to x=14. The two ends and the two sides retain independent
flags. Permanent aligned mode is unaffected. A source edit, dimension edit
or arbitrary numerical displacement does not implicitly release a flag.

Repositioning targets the solved geometry displayed in the editor. A drag
requests both coordinates; a numeric edit requests only the entered axis,
allowing the other coordinate to satisfy existing relations. Targets are
temporary and are removed before reporting the saved sketch's DOF and driven
measurements. Every supplied axis must still reach its requested coordinate
within `5e-7` mm after target removal; a healthy residual alone is insufficient.
Requested movement of at most `5e-7` mm is treated as a no-op at that editing
precision. Rejected, stale and no-op requests do not release a flag or create
a history entry. Successful repositioning commits once; undo/redo
and save/reopen preserve the geometry and following state.

This is an explicit local solver policy using hard station equations. For a
fixed source line without a distance dimension, its reported freedom is one
before release, two after releasing one end, and three after releasing both.
Output dimensions remain constraints: they may drive a free source or reject
a conflict with a fixed source while the station follows. They do not release
following automatically. These rules do not establish equivalence to another
solver's internal rank or behavior. Automatic reattachment, including returning
to a coincident station, is not implemented.

The new field is mutually exclusive with `lineEndpointMode`, requires an
uncapped open chain with a line at either boundary, and permits true only at
a line boundary. `[false,false]` is retained on save and has the same
structural naming as legacy free mode. An absent field retains legacy free
Cartesian endpoint seeds; existing documents are not silently upgraded.
An older build rejects the unfamiliar field. Arc intervals, caps and closed
groups retain their existing rules. The enclosing document remains version 1.

## Original examples and analytical checks

The library examples are authored Cartesian geometry in millimeters. They
start without an offset so the operation can be applied from the editor.

**Equidistancia de una placa** starts with a 10×6 rectangle. A 1 mm outward
offset has dimensions 12×8. Keeping both contours ordinary makes a ring:
its area is `12×8−10×6=36 mm²`, total perimeter `40+32=72 mm`.
Extruding 4 mm gives `V=144 mm³`, `A=360 mm²`, and bounds
`(−1,−1,0)–(11,7,4)`. With the source in construction, the filled outer plate
instead gives `V=384 mm³` and `A=352 mm²`.

**Equidistancia circular** starts with radius 3. At outward distance 1,
the concentric ring has area `π(4²−3²)=7π mm²` and total perimeter `14π mm`.
A 4 mm extrusion gives `V=28π mm³`, `A=70π mm²`, bounds
`(−4,−4,0)–(4,4,4)`.

**Equidistancia de un contorno en L** starts at
`(0,0),(10,0),(10,4),(4,4),(4,10),(0,10)`.
Its area is 64 mm² and perimeter 40 mm. An outward miter offset of 1 mm has
area 108 mm² and perimeter 48 mm; the ring's 4 mm extrusion therefore gives
`V=176 mm³`, `A=440 mm²`. The inward contour at 1 mm has area 28 mm² and
perimeter 32 mm, giving `V=144 mm³`, `A=360 mm²` for the inner ring.
Keeping both images and making the source construction gives
`V=320 mm³`, `A=480 mm²`. At inward distance 2 mm the narrow legs collapse
and the whole command is rejected, including an otherwise valid outer image.

For every prism, independently, `V=S×h` and `A=2S+P×h`.
These expectations come from rectangles, disks and the polygon shoelace
formula, independently from the offset planner and CAD builder. In-memory
document and STEP round trips are programmatic evidence, separate from
actual editor interaction. See [fixture provenance](PROVENANCE.md) and
[validation](VALIDATION.md) for executed cases and tolerances.

Additional original CAD cases use a capsule with straight length 6 and radius
2. Offsetting outward by 1 gives radius 3: the ring has
`S=12+5π`, `P=24+10π`, hence `V=48+20π`, `A=120+50π` at depth 4.
A length-10 line with straight caps and independent separations 2 and 3 makes
a 10×5 rectangle, with `V=200`, `A=220`. Symmetric semicircular caps at
distance 2 instead give `S=40+4π`, `P=20+4π`, `V=160+16π`, `A=160+24π`.
A quarter-circle strip between radii 2 and 3, with straight radial caps,
gives `S=5π/4`, `P=5π/2+2`, `V=5π`, `A=8+25π/2`.
Lengths, areas and volumes here use mm, mm² and mm³ respectively.

The endpoint-continuation check starts with a length-10 source line, an
uncapped right offset at 2 mm, then two 1 mm offsets with straight caps.
Only the final rectangle is material. At depth 4 mm its width is 2 mm, so
`V=8L` and `A=12L+16`: changing the source length from 10 to 12 mm changes
volume from 80 to 96 mm³ and area from 136 to 160 mm². This checks a
dimension edit through two associations, saved document history, selected
references and a fresh programmatic STEP export.

The no-dimension following checks use the same authored line and capped
descendants. At depth 4 mm, untouched continuation to length 14 gives
`V=112 mm³`, `A=184 mm²`. Releasing the end at x=12 retains
`V=96 mm³`, `A=160 mm²` after that source edit. Releasing the start at x=-2
while the untouched end follows to 14 gives length 16, hence
`V=128 mm³`, `A=208 mm²`. A normal-only edit moves the rectangle without
changing its dimensions. The tests check saved documents, programmatic
history, valid BRep, a single solid, bounds and fresh STEP reconstruction.
Changing following equations changes the structural descriptor; no general
persistent-reference guarantee across a release is inferred.

The disconnected CAD checks use an original 50×20 plate bounded by
`(-10,-10)` and `(40,10)`, with circular supports centered at `(0,0)` and
`(20,0)`. The source circles become construction geometry; their images form
two holes. At depth 4, hole radii `rA,rB` give
`S=1000−π(rA²+rB²)`, `P=140+2π(rA+rB)`, `V=4S`, `A=2S+4P`.
Source radii 3 and 5 offset by 2 give hole radii 5 and 7, hence
`V=4000−296π`, `A=2560−52π`. A separate source-radius pair 2 and 5
avoids radius-order ties while checking common distance 1→1.5 and a source
radius edit. The unchanged outer boundary and a selected outer-corner fillet
retain their references in these edits. Resized holes and perforated planar
faces can acquire new keys under the existing conservative geometric naming;
a saved fillet on an obsolete hole edge requires reselection instead of
silently binding to another edge. General persistent naming remains pending in
[issue #21](https://github.com/angelcp2802/solidflow/issues/21).

The command does not resolve arbitrary overlapping contours, branch networks
or topological events automatically. Per-component validity does not establish
valid global material: intersecting holes or contact with a plate boundary
can still make an extrusion invalid. Splines, projected external edges and
round/bevel corner policies remain separate work.
Real interaction with this new panel, its library cards and reopening remains
unverified; static component rendering and initial Electron-loader checks
do not execute pointer, keyboard, cancel or undo/redo workflows.
Remaining coverage is tracked in
[issue #14](https://github.com/angelcp2802/solidflow/issues/14).
