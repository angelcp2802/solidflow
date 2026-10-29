# Planar thin-wall operations

This independent implementation derives a material section from a solved source
sketch before extrusion, cut, revolution or revolved cut. The source sketch stays
unchanged. This contract describes the current implementation and its limits;
executed acceptance belongs in [validation](VALIDATION.md).

## Saved declaration

The optional `thinWall` field accepts exactly one form:

```ts
{ kind: 'one-side', thickness: number, reversed: boolean }
{ kind: 'mid-plane', thickness: number }
{ kind: 'two-sides', firstThickness: number, secondThickness: number }
```

Dimensions are millimetres. Thicknesses must be finite, greater than `1e-7`, at
most `100000`, with the sum of two sides at most `100000`. The section also has
to survive the existing `1e-5 mm` curve-joining tolerance. A declaration that
passes numeric admission can still fail geometric construction. No input is
clamped or coerced. Accessors, extra keys, `null` and an explicitly stored
`undefined` are rejected. Only absence retains a regular filled operation;
clearing an editor draft removes the own field. Existing document versions and
regular-operation reference descriptors retain their prior meanings.

Axial symmetry and angular mid-plane remain distinct from wall mid-plane.
Reversing revolution changes angular direction; reversing a one-sided wall
changes which side of its planar source receives material. The two controls do
not substitute for each other.

## Section construction

The build uses the already-solved local profile. Construction geometry is
excluded from material; a construction LINE can still define a revolution axis
resolved against the original source before the section is derived. Current
external axes retain their existing exact ownership and coplanarity checks.

LINE/ARC chains and closed line/arc/circle contours use analytic parallel
supports. Sharp corners meet at the unique nearest adjacent intersection; open
chains receive straight planar end segments. The default positive side is right
of the canonical open traversal and outside each closed contour. Closed
traversals are normalized counterclockwise; open traversal follows the stored
direction of its lexicographically first source entity. Reordering the entity
array does not change the traversal. Mid-plane places half the total thickness
on each side; two-sides assigns the first thickness to positive and the second
to negative.

Generated identifiers and topology identity describe source roles, traversal,
joins and wall mode. Continuous thickness values do not masquerade as topology
identity. Generated entities and empty constraints are temporary construction
inputs; they are neither saved source edits nor a second sketch solve. Curve
classification in `SketchVisual.profileTopology` is a current solved display
witness, not saved document authority.

All source and derived components are inspected. Branches, crossings, ambiguous
corners, inverted or collapsed radii, reversed segments, reentry into the source,
and overlapping walls fail explicitly. The implementation does not silently
select the first wire, discard split regions or trim conflicting offsets.
Disconnected valid regions remain disconnected; the existing explicit body
catalogue still requires one closed solid per output identity. A through-all
annular cut that splits an explicit owner must therefore fail until an explicit
multiple-output contract exists.

## Editors and downstream operations

New operations on a current solved open profile automatically enable one side
at `10 mm`; the thin checkbox is required for that profile. A new closed-profile
operation can enable or disable thin mode. Editing an existing operation keeps
its regular/thin UI kind. An existing thin operation allows the three wall-
thickness modes, dimensions and side edits.
The model API still validates complete declarations and supports explicit field
clearing for document transformations and history.

The shared blue panel follows direction controls and keeps thickness separate
from depth, angle, termination, body ownership and cut scope. Invalid temporary
numeric drafts remain editable and prevent Apply. Cancel, history and saved
rebuild must restore the actual declaration and output identity.

All automatic end-condition tools borrow the same prepared section, preserving
their translated frame and offset. Supported extrude/cut regeneration recipes use that
same builder for primitives and source-solved entity profiles. Revolution
regeneration recipes remain outside the existing recipe inventory. A no-hit
pattern shortcut must not skip validating a thin section; a genuine invalid
wall remains an error even when an owner is behind its ray.

## Remaining scope

Axial end caps, automatic corner fillets, clipping/repair of merging or splitting
offsets, complete menu/selection interaction and the wider thin-feature workflow
remain open. Straight planar end segments are not axial end caps. Current
bounded fixtures do not establish complete feature parity or installed-platform
support. Original fixtures, analytical expectations and tolerances are recorded
in [provenance](PROVENANCE.md).
