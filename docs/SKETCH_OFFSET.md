# Associative sketch offsets

In an entity sketch, choose **Equidistancia**, select a line, arc or circle,
and enter a positive distance in millimeters. **Seleccionar cadena conectada**
expands the selection through shared endpoint identities. It does not join
unrelated points that happen to have the same coordinates. Disable it to
offset only the selected connected portion.

**Invertir dirección** selects the other side. **Ambas direcciones** prepares
both copies together. **Cierre de extremos** adds straight or semicircular
end caps to an open chain; closed contours do not need caps. The preview shows
all images and caps before **Aplicar equidistancia** commits the complete
proposal as one sketch-history entry. Escape ends the tool without applying
its pending proposal. A previously applied offset remains in the sketch.

For an open chain, the first selected entity supplies the traversal direction.
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
free along their supports. Association alone does not require an image line
to retain the source length or an image arc to retain the source sweep.

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

The current command handles one connected chain or one circle at a time.
It does not resolve arbitrary overlapping contours, branch networks or
topological events automatically. Disconnected sets, splines, projected
external edges and round/bevel corner policies remain separate work.
Real interaction with this new panel, its library cards and reopening remains
unverified; static component rendering and initial Electron-loader checks
do not execute pointer, keyboard, cancel or undo/redo workflows.
Remaining coverage is tracked in
[issue #14](https://github.com/angelcp2802/solidflow/issues/14).
