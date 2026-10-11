# Associative sketch mirror

In an entity sketch, choose **Simetría de croquis**, select the source lines,
arcs or circles, and choose a different straight line under **Con respecto a**.
The axis can be chosen from the list or with **Seleccionar eje en el croquis**.
Ordinary clicks add/remove source entities. The preview shows every image;
**Aplicar simetría** adds the whole copy with one sketch-history entry. Escape
ends the tool without applying its preview. Previously applied commands remain.

A construction line is normally the useful axis: construction geometry is
excluded from solid contours. An ordinary line can also be an axis but remains
part of its original contour. Reflection uses the complete supporting line,
including points beyond the finite axis endpoints. Reversing those endpoints
does not change the result.

## Geometry and relationships

Original entities, points, constraints and dimensions keep their IDs. Each
shared source point has one reflected point; lines and arcs retain shared
contacts. Circles keep their radius through an equality relation. An arc
retains its center/start/end roles and reverses its clockwise flag, including
arcs larger than 180 degrees. Construction flags are preserved.

**Compartir puntos fuente sobre el eje** explicitly reuses selected source
points that lie on the axis within `1e-7` mm. It does not merge unrelated point
identities. The reused point gets a point-on-line relation unless it is already
an axis endpoint or has that relation. Disable sharing to create distinct
reflected point identities even on the axis. The immutable origin remains a
reserved reference: about an offset axis its image is a new ordinary point.

Each distinct source/image point pair has a persisted `symmetric` relation with
`a` and `b` point IDs and an `axisId` line ID. Its two equations constrain the
connecting segment perpendicular to the axis and the midpoint onto the axis.
They work in both directions; source dimensions normally drive the copies,
while additional image dimensions can constrain the source or conflict.
Source fix, global horizontal/vertical and angular constraints are not blindly
copied. Source dimensions retain their ownership, and driven measurements are
fresh solver output.

An additional `mirrorArcDirection` relation stores the source and image arc IDs
and their axis. It controls the discrete clockwise flag, alongside the point
reflection equations that control coordinates. Changing the source arc's sense
inverts its image as well; a direct image-sense edit is restored from its source.
Each image has one direction owner. Chains are supported in source-to-image
order; cycles and multiple direction owners are rejected explicitly.

The tool consumes displayed solved geometry, prepares a detached proposal and
checks the source identity again before applying. A complete proposal is solved
once at the application boundary. Invalid selections, degenerate axes,
off-axis seam joins, coincident image entities, structural overflow or solver
failure leave the source unchanged. Crossing sketches may be drawn; a crossing
or otherwise invalid solid contour is diagnosed by the CAD builder.

## Editing, removing and reopening

Edit driving source or axis dimensions normally; reflection relations remain
active after saving/reopening. Editing an image point is a constrained edit,
not a command to break its relation. Select and delete a relation in the
relations inspector to remove that particular link. Circle radius equality
is a separate relation and can be removed independently.

Deleting geometry removes constraints whose point/entity/axis references no
longer exist. It does not delete the other side of a mirror automatically.
Surviving valid constraints remain active: deleting an axis removes point
symmetry, but a surviving circle-radius equality can still link the radii.
Trim/extend/fillet use the same reference accounting; constraints on preserved
points remain. Inspect the remaining relations when deliberately breaking a
mirror. Undo/redo restores the stored geometry and relations together.

This is an additive version-1 constraint type. Existing version-1 documents
remain readable without migration. Earlier builds that do not know `symmetric`
reject those new documents explicitly; forward compatibility is not promised.
Unknown relation types and missing or wrongly typed axes are rejected rather
than discarded.

## Reproducible CAD examples

The library's **Simetría de medio perfil** contains three open lines
`(0,0)→(5,0)→(5,6)→(0,6)` and a construction axis at `x=0`.
Reflect the three material lines with axis-point sharing, finish the sketch and
extrude 4 mm. The result is a 10×6×4 mm plate with split top/bottom edges:
`V=240 mm³`, `A=248 mm²`, bounds `(-5,0,0)–(5,6,4)`.
Change the source half-width from 5 to 7 mm: the 14×6×4 mm result has
`V=336 mm³`, `A=328 mm²`, bounds `(-7,0,0)–(7,6,4)`.
For half-width `w`, height `h` and depth `d`, independently:
`S=2wh`, `P=4w+2h`, `V=Sd`, `A=2S+Pd`.

**Simetría de un arco** contains a right semicircle of radius 5 mm. Reflect
the arc about its construction axis, sharing the center and endpoints, to
close a disk. Extruding 4 mm gives `V=100π mm³`, `A=90π mm²`.
At radius 7 mm the corresponding values are `196π` and `154π`.

Numerical regressions also cover mirrored circular holes and 270-degree arc
holes. For a 10×6 plate with two radius-`r` circular holes,
`S=60−2πr²`, `P=32+4πr`; at depth 4, use `V=4S`, `A=2S+4P`.
A radius-1 major-segment hole has area `3π/4+1/2` and perimeter
`3π/2+√2`, independently from circular-sector and triangle formulas.

Tests distinguish analytical coordinates, BRep/mass/bounds, document/STEP
reopening, rendered components and actual interaction. They check selected
face/edge reference persistence and a dependent fillet after the half-width
edit; this is not a general topological-naming guarantee. Coordinate tolerance
is `5e-7` mm per axis and CAD mass/area/bounds use absolute `5e-6` in their
respective units. Symmetry sketches attempt an extra `1e-10` mm solver
refinement to reduce orientation drift, while the existing public `1e-7` mm
acceptance and geometric validity checks remain unchanged.

The current command creates one associated copy. Move without copy, dynamic
mirroring, patterns of mirrored copies and general overlap resolution are
separate work. Real interaction with this new tool and library cards remains
unverified; server rendering and the Electron initial-loader smoke do not
establish pointer/keyboard, cancel, undo or interactive reopen behavior.
See [validation](VALIDATION.md) and [issue #10](https://github.com/angelcp2802/solidflow/issues/10).
