# Parallel and perpendicular assembly relations

This dependent proposal covers the standard direction relations in
[issue #45](https://github.com/angelcp2802/solidflow/issues/45). It does not
complete assembly acceptance. Authored cases and configured workflows are not
executed results; consult [VALIDATION](VALIDATION.md).

## Supports and geometric meaning

Both endpoints retain exact occurrence paths, definition revisions and native
body/entity references under [ASSEMBLIES](ASSEMBLIES.md). A principal plane or
authenticated planar face contributes its normal. A cylindrical face selects
its derived analytic axis explicitly; a native LINE edge contributes its line
direction. A line is not a decorative viewport segment. Points, circular edges,
general surfaces and inferred axes are not admitted by this declaration.

The geometric meaning depends on both supports. In this table, a direction is
either a cylinder axis or a LINE edge, and a plane contributes its normal:

| Endpoint pair, in either order | Parallel | Perpendicular |
| --- | --- | --- |
| Plane and plane | Collinear normals | Orthogonal normals |
| Direction and direction | Collinear directions | Orthogonal directions |
| Plane and direction | Orthogonal normal and direction | Collinear normal and direction |

For a plane and a line, parallel means the line's direction lies parallel to the
plane, independently of their separation. Perpendicular means the line follows
the plane normal. Mapping every pair uniformly to a zero- or 90-degree angle
between stored directions would therefore be wrong. The existing `angle` mate
keeps its original normal/axis/line angular meaning and saved values.

These are direction relations. They do not impose coincident planes, collinear
axis positions, concentric cylinders, tangency, contact or a particular offset.
Translations and spin about an aligned direction remain available unless other
relations constrain them. Selecting a cylinder's axis does not mate its curved
surface to the plane.

## Saved branch and strict acceptance

New version-2 records use explicit `parallel` or `perpendicular` types and two
geometry references. `alignment` is required: `aligned` or `opposed` when the
table requires collinearity, and `null` when it requires orthogonality. The latter
has no orientation branch. Inapplicable orientation values and unrelated angle,
distance or rotation-lock fields reject rather than becoming inert metadata.
Changing either support or family must recompute which branch applies.

This extends the current version-2 reader; it does not migrate existing angle
records or promise that older readers accept the new mate types. Dormant and
suppressed records still receive complete structural validation. Native
resolution must verify fresh support kinds against the declaration before
constructing the numerical relation; names and old scene meshes are not proof.

## Solver and transaction boundary

The simultaneous solver retains angular residuals and analytic derivatives. A
collinearity relation removes two independent rotational freedoms; an
orthogonality relation removes one at a regular configuration. With one fixed
component and one free component, their isolated local DOFs are four and five.
With two free components they are ten and eleven, including the six common rigid
gauge freedoms. These local ranks do not certify global mobility or the rank of
an arbitrary mechanism. Points and translations do not enter these equations.

Singular initial direction charts need bounded seeding or explicit rejection;
zero derivatives cannot authorize a false solution. The existing prohibition
on reseeding groups containing active or passive gear, screw or rack-and-pinion
tracking remains: singular new relations in those groups may reject instead of
inventing a lifted angular history. Compatible nonsingular combinations still
need their own evidence. Solver budgets, tolerances and whole-turn admission do
not change.

Preview and Apply retain exact-source, generation and single-use capability
checks. Rejection, cancellation, source drift and worker failure cannot publish
new committed poses or overwrite history/recovery. Native BRep validity and
reference freshness remain separate from numerical angular satisfaction.

## Replacing references in a saved standard relation

The standard editor permits either endpoint of a saved parallel/perpendicular
relation to be replaced or cleared. It uses current planar/cylindrical faces,
analytic LINE edges, and root/component principal axes or planes. A cleared
endpoint remains empty and blocks preview; the saved endpoint is not a fallback.
Changing supports recomputes the orientation branch from the replacement pair.

The draft retains the exact saved declaration, document signature, scope revision,
scope path and editor session. Selecting a reference changes only that draft.
Preview resolves current native supports and Apply requires its existing private
single-use capability. Preview Cancel retains the draft for retry; closing the
editor discards it. Apply, history, document replacement and scope changes revoke
the retained edit. ID and suppression survive an accepted replacement, including
conversion between parallel and perpendicular. No saved schema is added.

See [the walkthrough](DEMO_ASSEMBLIES.md) for the controls and
[validation](VALIDATION.md) for the exact executed scope; these rules do not
establish general interaction, nested-assembly or platform coverage.

## Required evidence

The support matrix has nine ordered pairs from plane, cylinder-axis and LINE.
Each family has nine pairs; nine collinear cases have two signed branches and
nine orthogonal cases have one, giving 27 declared combinations. Pure equations
and finite-difference Jacobian checks must be separated from actual native
support resolution. Cases need fixed/free and free/free rank and gauge checks,
invariance under independent translations, antipodal/parallel singular starts,
conflicts, independent groups, malformed records and old-document round trips.

Original native fixtures must check real planar faces, cylindrical axes and LINE
edges at independent poses, with valid BRep, solid count, volume, area and bounds.
Reused/nested scopes, visibility/suppression, stale references, source repair and
history need explicit cases. The editor workflow must use actual worker results,
author/edit/Cancel/Apply, Undo/Redo, suppression, deletion and Save As/reopen. A
hidden scripted renderer and test-owned dialog choices do not establish human
native-dialog operation, installed-package behavior or platform support.

`npm run test:desktop:assembly-direction` is a separate fixed-fixture production
workflow with the existing 180/170/35-second parent/child/step limits. Adding it
to CI is not an executed result. This relation proposal does not open the demo
gate for the complete assembly scope.
