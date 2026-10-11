# Sketch chamfer

The sketch chamfer tool replaces one corner between two straight lines with a
straight bevel. It edits the saved sketch geometry and constraints. This is
separate from the solid-edge chamfer operation.

## Use the tool

1. Edit an entity sketch and choose **Chaflán de croquis** in the sketch ribbon.
2. Select a shared endpoint, or select line A followed by line B. The entity
   list also supports selection. **Invertir A / B** swaps their parameter order.
3. Choose equal distances, two distances, or distance and angle. Comma and dot
   decimal separators are accepted. The preview shows the two shortened lines,
   bevel and auxiliary legs.
4. Choose **Aplicar chaflán**. The sketch remains open. Its new dimensions can
   be selected and edited through the usual dimension panel.
5. Exit the sketch to rebuild downstream solid operations. Save the editable
   document as `.solidflow`, or export the rebuilt solid as STEP/STL.

Escape, including while a parameter input has focus, cancels the pending tool
and keeps the sketch open. A pending preview does not modify history. Applying
creates one sketch undo step; undo/redo and cancelling the whole sketch use the
existing editing history. Invalid text stays visible and disables application.

## Parameter convention

Distances are setbacks from the original corner along each selected line.
Distance D1 belongs to A and D2 to B. For a point selection, A/B initially follow
the entity order in the document; the panel displays them and allows reversal.

For distance and angle, D1 belongs to A. The angle is between A directed towards
the original corner and the bevel directed towards B. Angles use degrees. If
the interior corner angle is theta and the entered angle is alpha, the second
setback is `D2 = D1 * sin(alpha) / sin(theta + alpha)`. Valid angles satisfy
`0 < alpha < 180 - theta`. For a right angle, D2 is `D1 * tan(alpha)`.

## Constraint and transaction contract

`planSketchChamfer` consumes the already solved geometry displayed by the
editor. It neither solves nor mutates its input. Preview and application use
the same detached plan. An ephemeral source-reference guard rejects a plan
after its source sketch changes; that guard is never serialized. The editor
solves the candidate before accepting it and leaves the current sketch intact
if the solver reports an invalid result.

The two original line IDs and their construction flags remain. New endpoints
are joined by the bevel. The original corner points remain as virtual corners,
with two auxiliary construction legs and point-on-line relations. A bevel is
construction geometry only when both selected lines are construction geometry.

Driving line-length dimensions on the shortened lines become distances between
their original endpoints, retaining IDs, values and dimension metadata. They
therefore continue to describe the original extents. Driven line lengths remain
on the shortened lines and are measured afresh by the solver. Other constraints
are retained; a combination that cannot solve is rejected at application.
The equal mode uses equal auxiliary lengths; the other modes add their driving
distance or directed-angle constraints. The normal sketch/document format
persists these entities and relations without a format-version change.

## Current limits and evidence

This increment handles one corner between two straight segments with a unique
common endpoint, including distinct endpoint IDs whose coordinates coincide
within `1e-7` mm. A point with more than two incident entities is ambiguous;
select the intended pair explicitly. Arcs, circles, disjoint lines, collinear
lines and configurations without a unique corner are rejected. The tool does
not extend lines, chamfer curves or process multiple corners in one command.

Distances follow the document's dimension limits, currently 0.01 to 100000 mm.
Both remaining segments and the bevel must have length at least `1e-6` mm.
Structural/count limits are checked before returning a changed plan. This
does not establish robustness for all near-degenerate or very large sketches.

Analytical regressions cover acute, right and obtuse corners, endpoint and
selection orientation, fixed corners, driving/driven dimensions, rejected
inputs and persistence. For the included 10 x 6 mm plate extruded 4 mm, setbacks
2/3 give 228 mm3, equal setbacks 2 give 232 mm3, and D1=2 with alpha=30 degrees
gives `240 - 8/sqrt(3)` mm3. CAD tests also check areas, bounds, valid single-solid
BRep, saved-document reconstruction and STEP round trips. See
[validation](VALIDATION.md) for executed checks and UI evidence.
