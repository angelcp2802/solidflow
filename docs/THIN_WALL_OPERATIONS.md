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
field `secondDirection: { enabled: boolean, depth: number,
endCondition?: ExtrudeEndCondition }`. Its own enumerable `enabled` and `depth`
data fields are required. The optional second end uses the existing strict
`throughAll`, `untilNext` or `upToSurface` union; extra keys, accessors, coercion,
`null` and explicit undefined reject. The second depth stays positive and finite,
from `0.01` through `100000 mm`, including while OFF or automatic. The first
signed depth retains its individual magnitude range of `0.01..100000 mm`.
Automatic sides retain numerically validated depths, while the selected native
limits determine geometry and D1's sign determines both senses.

Each active side can independently be Blind, unilateral ThroughAll, UntilNext
or UpToSurface. Both rays begin at the same original solved profile and incoming
frame: first along `sign(D1)` and second in the opposite sense. Direction 1
inversion reverses both rays while retaining their target declarations; it does
not swap targets or add a separate Direction 2 inversion. An explicit surface
or plane target left behind its ray rejects until the user repairs it; dynamic
cut rays retain the proven-absence rule below. First-direction axial
mid-plane and ThroughAll in both senses remain incompatible with an active
second direction. The second side never offers either of those two modes.

For two Blind sides, construction retains the single interval beginning at
`-sign(D1)*D2` and spanning `sign(D1)*(abs(D1)+D2)`, up to `200000 mm`. Moving the
source plane moves these fixed-depth endpoints. For an automatic side, resolve
its own boundary from the unchanged source frame and the same pre-operation
owner. Compose both native tools atomically; inclined or curved end geometry
must not be replaced by an average, enclosing bound or nominal depth. Moving a
source plane between two fixed world-plane targets changes the resolved lengths
while retaining both world endpoints. Mixed modes move only their Blind end.

New-body ThroughAll/UntilNext sides name their own exact limit bodies; those
read owners are not outputs or material targets. Cut sides use their explicit
scope, and both sides read each owner's state before either cut is applied.
A missing ray requires the existing exact-owner native absence proof. Contact,
an incomplete limiting face, failed native work or failed release cannot become
a miss. In ALL regeneration, an owner outside both rays keeps its prior state.
An error in either side must not publish a partial result.

Absence preserves legacy bytes and reference descriptors. Presence identifies
enabled/OFF, and a declared second end additionally identifies its end kind;
continuous lengths do not become topology identities. OFF retains the second
length, condition and target while using only the first side for geometry.
Retained references remain structural/deletion dependencies, but inactive body
limits are not active native-owner requirements. Older strict readers reject
new fields rather than discard them. Explicit editor clearing removes the own
field; ordinary OFF/ON does not. The existing semantic-prism provenance path
continues to decline declared second directions, including OFF.

Incompatible midpoint/both-senses changes retain the active request and block
Apply until explicit OFF recovery. Invalid first/second numeric drafts remain
editable even when inactive and prevent Apply; changing modes does not insert
a default replacement depth. A focused correction field stays mounted through
the first valid digit and decimal. D1 retains its existing editability during
body picking, while D2 and facial picking remain blocked and Apply still requires
the completed current body selection.

Face selection is owned by its first/second role, draft, document epoch, source
model and prefix. Editing, cancellation or changing owners revokes that request.
The viewport additionally checks the same scene, request and camera presented
at press and release, and cancels stale gestures after navigation or resizing.
These source/pure contracts do not establish physical face-click acceptance;
the independent-end renderer route selects planes through property controls.
The separate `test:desktop:part-face-limits` route uses actual CDP clicks on
original preceding-body caps for both roles, including saved target replacement,
held-gesture cancellation, history and fresh reopening. See its
[provenance](PROVENANCE.md#original-viewport-face-limit-inputs--2026-10-29) and
[executed validation](VALIDATION.md). This bounded hidden-window route does not
establish arbitrary/curved-face selection, installed-app or human acceptance.

Primitive and genuinely source-solved entity regeneration reuse these sides
after placement and apply reflection parity once. A fixed principal-plane
UpToSurface end requires an explicit world policy per
`(featureId, path)`, where the paths are `endCondition.target` and
`secondDirection.endCondition.target`. One side's policy does not authorize the
other. Inactive/stale choices remain explicitly removable. Datum/face limits
and transformed/instance correspondence in regeneration remain pending; they
must not silently fall back to copied geometry or an unrelated plane.

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
and no active automatic end on either side. Open,
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
