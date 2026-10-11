# Sketch fillet

The sketch fillet command inserts an editable tangent arc between two lines or
circular arcs; it is separate from a solid-edge fillet. It changes saved sketch
entities and constraints. The staged scope remains open in
[issue #6](https://github.com/angelcp2802/solidflow/issues/6). A straight-line
milestone does not establish support for all curved pairs or virtual corners.

## Use the tool

1. Open **Placa para redondear** from the library and edit its sketch, or use an
   existing entity sketch. Choose **Redondeo de croquis**.
2. Select a common endpoint, or select two lines/arcs in order A/B. The preview
   shows the modified source entities and the new tangent arc. Choose a labeled
   **Solución geométrica** when several candidates exist. The panel reports
   which source trims or extends, and its endpoint travel in millimeters.
3. Enter a radius in millimeters. Comma and dot decimal separators are accepted.
   Choose **Mantener esquina y cotas** or **Eliminar restricciones de la esquina**.
4. Choose an individual radius, a radius equal to an existing circular entity,
   or **Enlazar redondeos consecutivos**. The first consecutive fillet has its
   own radius dimension; subsequent commands in that tool session link to the
   preceding fillet. A linked radius displays the measured reference radius.
5. Choose **Aplicar redondeo**. The tool remains active for another corner.
   Choose **Terminar redondeo · Esc** before accepting the whole sketch and
   rebuilding downstream features. Save an editable `.solidflow` document or
   export the rebuilt solid as STEP/STL.

The library also offers **Placa para redondear con arco**. Select its origin and
use a 1 mm radius to exercise a closed line–arc contour. The programmatic CAD
checks below cover this example. Its library card was loaded in the browser,
but its fillet was not created through real interaction. Electron interaction
is also separate validation work.

For separated sources, open **Redondeo con prolongación de arco** or **Redondeo
entre dos arcos separados**. Each starts as a sketch only, with an intentional
gap. Edit that sketch, select its first two source entities and apply R2.
The first example trims its line and prolongs its R10 arc; the second prolongs
both R10 arcs. Finish and accept the sketch before creating an extrusion.
Their geometry is covered programmatically; the line–arc preview also has
rendered-component coverage. Real interaction with the two new cards has not
been checked.

## Editing contract

`planSketchFillet` receives the already solved profile displayed by the editor,
a corner-point or two-entity selection, and parameters in millimeters:

```ts
{
  radius: number;
  cornerPolicy: "keep" | "delete";
  equalRadiusEntityId?: string;
  solutionIndex?: number;
}
```

The planner does not mutate or solve its source. Preview and application share
one detached candidate. Its ephemeral `sourceProfile` reference guards against
applying a preview after the source changes; it is not saved in the document.
The result identifies the fillet arc, affected entities, created entities and
created/converted/deleted constraints. Candidate labels and an explicit selected
solution distinguish geometric branches when several tangent arcs are possible.
Candidate indices identify branch, replaced endpoints and the connected radius
component; they can have gaps and are
not positions in the filtered candidate list. A virtual support intersection
is only a geometric witness: two witnesses do not duplicate the same physical
branch. These codes are preview state, not new persisted document fields.

Without an explicit choice, entity-list selection prefers a minor fillet and
then the least total endpoint travel along the sources. A tied minimum requires
an explicit choice. This is the tool's selection policy; it does not infer a
canvas pick position. Once chosen, a branch remains selected across radius
changes; an unavailable branch is rejected without choosing another silently.
When a radius path would pass through a retained arc endpoint, the solutions
on its two sides have different component codes. A latched preview therefore
rejects the crossing instead of silently wrapping a tiny source arc into an
almost complete turn. A valid major interval on the other side remains
available through a fresh explicit choice.

The editor validates a candidate with the normal solver before application
and rejects it without changing history when it cannot solve. Application
creates one sketch undo step; a pending preview does not. Invalid parameter
text stays visible and blocks application. Escape cancels the pending tool,
including from an input, while keeping previously applied sketch edits.
For a legacy rectangle or circle, conversion to entity geometry is a temporary
tool representation until application succeeds; cancellation preserves the
original profile and history. The consecutive-radius reference is reconciled
with surviving session arcs after undo, redo or deletion. These last two fixes
were inspected in code; a final interactive regression was not performed.

## Corner and radius behavior

For a common original corner, keep-corner mode retains original endpoints as
virtual points on the source supports. The existing straight-line virtual-corner
behavior also remains. Driving line-length dimensions become distances between their
original endpoints, preserving IDs, values and dimension metadata. Other
existing constraints remain. A combination that cannot solve is rejected by
the editor. Driven lengths remain on their entities and are measured afresh.

Delete-corner mode removes driving line lengths on the affected sources and
constraints exclusive to removed corner points. It reports removed constraint
IDs and removes a corner point only when no remaining entity or constraint
uses it. The immutable origin and shared/referenced points remain. Horizontal,
vertical and circular-radius constraints are not removed merely because an
entity is trimmed. The planner does not move unaffected neighboring points;
subsequent movement is governed by the normal solver and retained constraints.
An old corner point that remains a source arc's center or a retained endpoint
also keeps its anchoring relations, even when both entities belong to the
selected pair.

For a separated pair containing a circular arc, both modes remove replaced
endpoints and their exclusive constraints instead of creating ghost anchors.
Driving source-line lengths are removed; driven lengths remain fresh readings
of the retained entity. This is an explicit editing policy for these separated
pairs. It does not apply to a common original corner. Source centers, retained
far endpoints, the origin and points still used by external geometry keep their
identities and anchoring relations. The preview lists deleted/converted
constraint counts before application.

Each new fillet has a driving radius or an equality relation to a different
existing circular entity. An equality request must use that entity's currently
measured radius. Repeated commands can therefore create consecutive equal
fillets. Source entities share the new contact point IDs with the fillet, and
explicit tangency branches and arc direction persist in the document.
Point-on-line and point-on-circle relations constrain complete supports; finite
contact tests are a separate part of planning. Support-circle tangency alone
does not establish endpoint connectivity.

The generic sketch solver preserves each arc's continuous sweep during its
Newton trials. A trial that passes through a zero/full-turn sweep or collapses
a radial vector is rejected and damped; crossing a semicircle is allowed. This
does not lock an arc to its initial minor/major classification. Saved point
coordinates define the initial branch: the guard does not retroactively repair
an arc whose branch was already changed before solving. It remains a local
solver and does not guarantee a path to every valid constrained configuration.

## Limits

The planner handles one pair at a time: line–line, line–arc or arc–arc. A point
selection requires exactly two incident source entities. Complete circles are
not trimmed into fillets; they can serve as equal-radius references. Parallel
or collinear lines without a unique corner are rejected. Lines and circular arcs
can trim or prolong to tangent contacts. An arc retains its direction and the
opposite endpoint; its new directed interval must remain strictly between zero
and one turn, with distinct endpoints. Extension through a semicircle is allowed.
Support-intersection witnesses constrain which side of the corner is retained;
proximity to the old endpoint does not choose an arc interval. Ambiguous geometry
requires explicit entity/candidate selection.
A pair sharing two distinct corners requires a selected vertex or an explicit
solution. An unavailable explicit branch is rejected rather than replaced by
another branch silently.

Radii follow the document's limits, currently 0.01 to 100000 mm. Endpoint
proximity uses `1e-7` mm; remaining segments and distinct fillet contacts must
respect the `1e-6` mm geometric minimum. Existing point identities are not
merged by proximity. The fillet is construction geometry only when both source
entities are construction geometry. Structural/count limits are validated
before a changed plan is returned; a rejected plan leaves its source intact.

This is a repeatable single-corner tool, not an atomic batch of interacting
corners. Full-circle source trimming and broader robustness
across curved configurations remain work for the open issue. One closed
line–arc case does not establish complete curved-pair or platform coverage.

The local solver can reject a large radius edit even when direct planning at
the target radius is valid. An anchored line–arc R3→R10 edit is retained as a
precision rejection regression; the unchanged input is returned. Successful
R2→R3 edits do not establish convergence for every radius path.

## Independent example and analytical checks

[`createFilletSketchDocument`](../src/examples/sketch-fillet.ts) creates a fully
defined 10×6 mm rectangle on XY, anchored at the origin, with 10 and 6 mm driving
lengths and a 4 mm extrusion. It contains no fillet until a command is applied.
The corner at the origin exercises both the anchor and the original dimensions.
An optional `"curved"` example replaces the left edge with a clockwise R5 arc
from (0,6) to the origin, centered at the fixed point (-4,3). Its rightward
bulge creates a closed line–arc corner without an external fixture.

A radius `r` removes area `r² − πr²/4` from a right corner. For a rectangle
`w × h` and depth `d`, the remaining volume and surface area are:

```text
V = d × (w×h − r² + πr²/4)
A = 2 × (w×h − r² + πr²/4) + d × (2(w+h) − 2r + πr/2)
```

| Case | Volume (mm³) | Surface area (mm²) | Bounds (mm) |
| --- | --- | --- | --- |
| Initial 10×6×4 rectangle | 240 | 248 | (0,0,0)–(10,6,4) |
| Origin fillet R2 | `224 + 4π` | `224 + 6π` | (0,0,0)–(10,6,4) |
| Radius edited to R1 | `236 + π` | `238 + 2.5π` | (0,0,0)–(10,6,4) |
| Extents edited to 14×8, R2 retained | `432 + 4π` | `376 + 6π` | (0,0,0)–(14,8,4) |
| Two opposite corners with linked R2 | `208 + 8π` | `200 + 12π` | (0,0,0)–(10,6,4) |
| Both linked radii updated to R1 | `232 + 2π` | `228 + 5π` | (0,0,0)–(10,6,4) |

For the curved example, a 1 mm origin fillet has center (-4+4√2,1), line contact
(-4+4√2,0) and circular contact (-4+10√2/3,4/3). With `α=atan2(3,4)` and
`β=asin(1/3)` in radians, independent Green integration gives remaining planar
area `S=78−8√2−12.5α−12β+π/4` and perimeter
`P=30−4√2+5α+6β+π/2`. The extrusion oracles are `V=4S` and `A=2S+4P`, with
unchanged 10×6×4 mm bounds. These constants do not come from the planner or the
CAD kernel's boundary helpers.

Six analytical CAD regressions passed with these independent oracles,
fully defined solutions, save/reopen, stable references and valid single-solid
STEP round trips. They cover the initial rectangle, an R2 origin fillet,
editing R2 to R1 from saved coordinates, changing the original 10/6 dimensions
to 14/8, two consecutive linked radii updated together, and the closed line–arc
example with a fixed R5 support. They use five-decimal-place comparisons for
volume, surface area and bounds; analytical arc coordinates use six decimal
places. Programmatic reconstruction does not establish browser or Electron
interaction, delete-mode solids or general arc–arc robustness.

## Separated-source analytical examples

[`createFilletProlongationDocument`](../src/examples/sketch-fillet-prolongation.ts)
generates the two open sketches above from Cartesian constants, without an
external fixture. Coordinates and lengths below are in millimeters; angles
are radians. Source and fillet contacts share point IDs after application.

For the line–arc example, the line runs from (10,0) to (30,0); the R10 arc,
centered at the origin, runs counterclockwise from 30° to 90°. At R2 the fillet
center is (2√35,2), the line contact is (2√35,0) and the source-arc contact is
(5√35/3,5/3). The source arc extends backwards to `asin(1/6)` while retaining
its (0,10) endpoint. The contour closes through (30,20) and (0,20).

For two arcs, centers are (-6,0) and (6,0), both R10. The left arc runs
counterclockwise from 75° to 180°; the right runs clockwise from 105° to 0°.
At R2 the fillet center is (0,6√3), with contacts (-1,5√3) and (1,5√3).
The left-to-right fillet is a counterclockwise 60° arc. Each source retains
a 120° sweep. The contour closes through (-16,-10) and (16,-10).

For a fillet radius `r` on the illustrated external branch, while its retained
contour remains valid, offset circles and similar triangles give the contacts.
Independent Green integration gives planar area `S` and perimeter `P`:

```text
Line–arc: t = sqrt(100+20r), θ = asin(r/(10+r)), δ = π/2−θ
S = 600 − (100−r²)δ/2 − rt/2
P = 90 − t + (10+r)δ

Two arcs: h = sqrt((10+r)²−36), β = acos(6/(10+r))
S = 320 + 100(π−β) − r²(π−2β)/2 + 6h
P = 52 + 20(π−β) + r(π−2β)

Depth 4: V = 4S, A = 2S+4P
```

| R2 contour | S (mm²) | P (mm) | Extruded bounds (mm) |
| --- | --- | --- | --- |
| Line–arc | `600−24π+48asin(1/6)−2√35` | `90−2√35+6π−12asin(1/6)` | (0,0,0)–(30,20,4) |
| Two arcs | `320+66π+36√3` | `52+14π` | (-16,-10,0)–(16,10,4) |

R3 line–arc contacts are (4√10,0) and (40√10/13,30/13), with center
(4√10,3). Two-arc R3 contacts are (±18/13,10√133/13), with center
(0,√133). These formulas supply expected values independently of the planner
and CAD kernel. Validation distinguishes exact analytical seeds from a radius
edit solved numerically; their precision evidence belongs in
[VALIDATION.md](VALIDATION.md).

## Observed browser interaction

On 2026-10-11, an isolated browser session exercised the rectangular example:
origin selection, R2 preview and application, comma-decimal entry `2,5`, an
invalid radius that disabled application and set `aria-invalid`, and Escape
from the radius input. Undo restored the first corner and redo restored its
fillet. A second R2 fillet at the opposite corner (10,6) was linked to the
first. Editing the first radius dimension from 2 to 1 mm updated both arcs;
the sketch remained fully defined with zero degrees of freedom. Leaving the
sketch rebuilt a model displaying 0.238 cm³ and 10×6×4 mm bounds.

The actual browser download is preserved byte for byte as
[`sketch-fillet-linked-r1.solidflow`](../src/cad/fixtures/solidflow-ui/sketch-fillet-linked-r1.solidflow).
Its 5810 bytes and SHA-256 are recorded in the
[fixture provenance](../src/cad/fixtures/solidflow-ui/README.md). A regression
case reads those exact bytes and is separate from the six analytical cases
above; its execution result belongs in [VALIDATION.md](VALIDATION.md).

Subsequent browser access was denied before interactive reopening or a final
regression of the legacy-conversion and undo/reference fixes. The saved file
has no claimed interactive reopen. Programmatic reopening and STEP export are
separate from browser file interaction; neither establishes native Electron
dialogs. The curved example was loaded but not edited, and delete mode,
alternative branches and virtual-intersection extensions were not exercised
through this browser session. The open issue is not complete.
