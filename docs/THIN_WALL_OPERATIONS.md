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

Each form can additionally declare `autoCorners: { enabled: boolean, radius:
number }`. The radius is the **inner material radius**, in millimetres, with
the same finite numeric admission range as a wall thickness. Presence is strict:
both own data fields are required even when disabled, and an explicit
`undefined`, accessor or extra field is invalid. Disabled settings retain their
radius for later editing; absence preserves the previous declaration and
reference descriptor exactly. Continuous radii are not topology identities.
Older strict readers that predate this option reject its presence rather than
silently discarding it; documents without the option retain their prior form.

Each wall form can also declare `endCaps: { enabled: boolean, thickness:
number }`. Both own data fields are required, including while disabled. Cap
thickness uses the same finite numeric range as wall thickness; extra fields,
accessors, coercions and explicit undefined are rejected. Absence preserves
legacy declarations and identities. Presence identifies only enabled/OFF state,
not continuous cap thickness. Older strict readers reject this new field.

Axial symmetry and angular mid-plane remain distinct from wall mid-plane.
Reversing revolution changes angular direction; reversing a one-sided wall
changes which side of its planar source receives material. The two controls do
not substitute for each other.

## Independent linear directions — 2026-10-29

Both regular and thin `extrude`/`cut` operations can declare the separate optional
field `secondDirection: { enabled: boolean, depth: number }`. Its exact own
enumerable data fields are required; extra keys, accessors, coercion, `null` and
explicit undefined reject. The second depth is positive and finite, from
`0.01` through `100000 mm`, including while OFF. The existing signed first depth
retains its individual magnitude range of `0.01..100000 mm`.

An active second direction requires Blind depth and `symmetric: false`, with no
`endCondition`. For `s = sign(D1)`, construction starts at `-s*D2` from the source
plane and extrudes once over `s*(abs(D1)+D2)`. The calculated span can reach
`200000 mm`. Direction 1 inversion changes the sign of the whole interval while
retaining both stored lengths; there is no independent Direction 2 inversion.
This interval differs from legacy axial mid-plane, which splits one total depth
equally around the source plane. It also differs from the two planar wall sides.

Absence preserves saved bytes and reference descriptors. A present record adds
`['second-direction-v1', enabled]` to structural identity; neither continuous
length enters that identity. OFF retains its valid second length and uses the
existing first-direction or mid-plane/automatic construction. Older strict
readers reject the new field rather than discard it. Editor clearing removes
the own field; ordinary OFF/ON does not clear it. The existing semantic-prism
provenance path declines declared second directions, including OFF, rather than
assigning a first-direction-only provenance to the new interval.

The parser retains valid numeric intent for explicit recovery after an
incompatible extent change. The engine and recipe extractor reject active
mid-plane or automatic combinations before any provisional factory or no-hit
shortcut. Explicit OFF preserves the selected first-direction limit and its
references. Invalid OFF dimensions remain editable and block Apply. Changing
the first extent never replaces an invalid first depth with a default length.

The original solved profile and its incoming frame/offset are reused once.
Moving a source plane moves both fixed-depth endpoints; it does not anchor them
to surrounding faces. Source solves, body scopes, creation identities and
material declarations retain their existing contracts. Primitive and authentic
source-solved entity regeneration use the same interval after linear, circular
or reflected placement; reflection parity is applied once to the first signed
depth before calculating the shifted start.

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

Enabled automatic corner rounding first constructs one temporary rounded source,
then offsets both walls from that common source. This keeps corner arcs
concentric, with radii `R` and `R + positive + negative`. For a counterclockwise
turn, the temporary source radius is `R + negative`; for a clockwise turn it is
`R + positive`. The analytic LINE/ARC and ARC/ARC tangent candidates reuse the
sketch fillet geometry without creating saved constraints or invoking its edit
command. Every corner is planned against the original solved chain, and both
replacement ends of each shared LINE or ARC are checked together before output.
Tangent continuations do not create extra arcs; cusps, ambiguous branches,
extensions, consumed shared segments and crossings reject atomically.

Automatic rounding currently requires exclusively open material chains. Closed
or mixed profiles reject explicitly. The smaller-arc admission used for this
derived geometry retains the `1e-5 mm` joining tolerance; it does not relax the
existing `0.01 mm` source-ARC admission. Source sketches, their construction
geometry and axis references remain unchanged.

All source and derived components are inspected. Branches, crossings, ambiguous
corners, inverted or collapsed radii, reversed segments, reentry into the source,
and overlapping walls fail explicitly. The implementation does not silently
select the first wire, discard split regions or trim conflicting offsets.
Disconnected valid regions remain disconnected; the existing explicit body
catalogue still requires one closed solid per output identity. A through-all
annular cut that splits an explicit owner must therefore fail until an explicit
multiple-output contract exists.

## Axial end caps

Active caps currently require an additive fixed-depth extrusion with one or two
Blind directions and one simple closed source component, with `symmetric: false`
and no `endCondition`. Open,
mixed, nested or disconnected sources reject; cuts, revolutions, axial mid-plane
and automatic limits reject before any provisional prism or no-hit witness.
Disabled settings retain their data and use the previous uncapped geometry.

The prepared section carries explicit temporary outer/inner profiles. Construct
the complete outer extrusion over signed depth `D`, then subtract its inner core
over `sign(D) * (abs(D) - 2*c)`, beginning `sign(D)*c` from the incoming resolved
start frame. Both caps occupy the existing axial envelope. Preserve the caller's
support, offset and orientation once; do not recover these from generated IDs or
solve either temporary profile. The remaining core must exceed `1e-5 mm`;
zero, negative or sub-tolerance cores reject rather than becoming a filled block.
Engine and supported fixed-depth additive regeneration share this construction,
native ownership and non-destructive Boolean handling.

With two active directions, `D` is the complete calculated span above and the
incoming start already includes its second-direction shift. Construct caps once
at the two external ends, with one continuous core over the complete interval
instead of independently capping either branch.
Do not cap or validate each branch independently: `D1=13`, `D2=7`, `c=4` has a
20 mm envelope and a 12 mm core that crosses the source plane, although the
second branch alone is shorter than two caps. It remains subject to the same
single-closed-region and native validity checks.

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

The extrusion editor offers automatic corner controls only for one current,
successful solved profile explicitly identified as containing exclusively open
chains (`SketchVisual.profileOpenOnly`). Missing, duplicate, stale, closed or
mixed witnesses do not permit new activation. A retained extrusion setting can
still be disabled after its source becomes closed or mixed; it cannot be
reactivated without eligibility. The global stale-prefix lock remains in force.
Its initial radius is `5 mm`; the
declared radius is retained across wall-mode changes and disabling/re-enabling.
An invalid retained radius remains visible and editable even while disabled,
and retains focus during correction until the user leaves the field. No value
is silently reset or clamped. A valid inactive radius is hidden when unfocused.
This bounded UI inventory does not establish the corresponding cut/revolution
menus. The shared material builder nevertheless consumes validated corner
settings in all four operation types and supported extrude/cut recipes.

All automatic end-condition tools borrow the same prepared section, preserving
their translated frame and offset. Supported extrude/cut regeneration recipes use that
same builder for primitives and source-solved entity profiles. Revolution
regeneration recipes remain outside the existing recipe inventory. A no-hit
pattern shortcut must not skip validating a thin section; a genuine invalid
wall remains an error even when an owner is behind its ray.

The blue extrusion panel offers new caps only for a unique current successful
closed source with `SketchVisual.profileClosedSingle`, and only in additive
Blind mode without axial symmetry, including an independent second Blind depth.
This display witness does not replace native checks.
The initial cap thickness of `1 mm` is a SolidFlow UI choice, not a universal
default inferred from another application. Wall-mode changes and OFF/ON preserve
both optional settings and their independent dimensions.

Retained caps remain explicitly recoverable in all four editors after an
unsupported source or extent change: disable them instead of silently dropping
the request. An active unsupported cap dimension is locked; an invalid inactive
dimension remains editable. Its DOM field stays mounted and visibly focused
through decimal correction, and hides after blur when inactive and valid. The
global stale-prefix/operation locks retain priority. The original production
route is `npm run test:desktop:part-end-caps`.

## Remaining scope

Independent automatic limits or inversion for the second linear direction,
other cap extents, multi-region cap policy,
broader automatic-corner UI/runtime coverage, clipping/repair of
merging or splitting offsets, complete menu/selection interaction and the wider
thin-feature workflow remain open. Straight planar end segments are not axial end caps. Current
bounded fixtures do not establish complete feature parity or installed-platform
support. Original fixtures, analytical expectations and tolerances are recorded
in [provenance](PROVENANCE.md).
