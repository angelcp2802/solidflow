# Plane and cylindrical-surface assembly tangency

This dependent proposal covers one required part of the tangent family in
[issue #45](https://github.com/angelcp2802/solidflow/issues/45). Other tangent
pairs, finite contact and the full assembly scope remain required. Consult
[VALIDATION](VALIDATION.md) for executed results; a declaration, authored test
or configured desktop command is not a pass.

## Exact supports and saved side

One endpoint is a principal plane or exact current planar face. The other is
an exact current cylindrical face selected explicitly as a surface, rather
than its derived axis. Both endpoint orders are admitted. Saved version-2
records use `type: 'tangent'` and `side: 'positive' | 'negative'`. The side is
always relative to the plane's oriented normal, independent of endpoint order.
No alignment, user-entered radius, offset, phase or angular history is saved.

The new `cylinder-surface` reference purpose is separate from existing plane,
axis and LINE references. Existing angle, parallel/perpendicular, concentric
and mechanical relations retain their original reference acceptance. An old
saved axis reference is not converted silently. Both suppressed and active
records receive strict validation, including the requirement for exactly one
plane and one cylindrical surface. Source repair preserves purpose, exact
occurrence/revision/body/face identity and explicit selection. The version-2
extension does not promise older readers accept the new type.

## Infinite analytic tangency

For a unit plane normal `n`, plane point `P`, unit cylinder axis `a`, an axis
point `C`, native radius `r > 0` and side sign `s = +1` or `−1`, the relation is:

```text
n · a = 0
n · (C − P) − s r = 0
```

The angular equation uses `atan2(n·a, |n×a|)` in radians. The distance equation
uses millimeters and the freshly queried native radius. These equations mate
the infinite plane and cylinder supports. They do not prove that the trimmed
faces meet, that the solids avoid overlap or that the components roll together.
A finite face can be far from the support tangency generator. Use separate
native interference/clearance inspection for the actual bodies.

The native surface witness also records radial material sense `e = ±1`, from
face orientation and the handedness of the actual native parameter frame. At
support tangency, the cylinder's oriented normal is `−s e n`: the two support
normals are opposed when `s e = +1`, and the same when `s e = −1`. A satisfied
preview reports this relation separately. It is not an overlap classification
or a measured finite contact point. Principal planes define oriented supports
without claiming a material face.

## Native authority and solver behavior

The extractor reads native position, axis, X/Y directions, radius, face
orientation and tolerance into detached data, releasing every received
temporary wrapper before returning. A dedicated current-face inspector and
private session witness attest the surface purpose. Old axis witnesses, scene
metadata, cloned objects and renderer tuples do not confer that authority.
Final verification independently rebuilds and re-queries both supports before
publishing Preview/Apply authority. Query, cleanup, reentry, source drift or
final-scene failure cannot authorize a result.

Only the tangent mapper lowers the authenticated surface to the numerical
cylinder data. The arbitrary axis point is canonicalized in its local frame
before world placement and numerical conditioning. Overflow, radius
underflow or unresolvable precision loss rejects; tolerances and budgets are
not enlarged to admit it. Material sense is separate report data and does not
alter the two equations.

At a regular configuration the two independent rows have local rank two.
One fixed and one free component leave four DOF; two free components leave
ten, including six common rigid gauge freedoms. Tangency does not fix axial
translation or spin. These local ranks do not certify global mechanism
mobility. A singular initial axis parallel to the plane normal needs bounded
seeding under the existing policy or explicit rejection. Active/passive gear,
screw and rack tracking retain their no-reseed policy and whole-turn state.

Straight translation with constant local rotations may admit this exact
plane/cylinder pair: its angular residual stays constant and its signed length
residual is affine. Admission must check the pair, rather than accepting every
future tangent subtype by name. This proof does not establish continuous
trimmed-face contact or extend contact stopping to rotary motion.

## Required independent evidence

Original native cases must cover both endpoint orders and signs, outer and
inner cylindrical faces, reversed orientation and an actual indirect native
frame. Independent surface derivatives must check oriented radial normals;
reusing the production frame triple product would not be an independent
oracle. Existing axis extraction must retain its previous meaning. Ownership,
currentness, forged witnesses, stale source, exact body identity and cleanup
reentry need rejection cases.

Equation/Jacobian, off-solution gauge, singular starts, rank, conflicts and
precision cases are separate from fresh BRep validity, solid count, volume,
area and bounds. Nested reuse, hidden/suppressed occurrences, source repair,
history, actual Preview/Cancel/Apply and Save As/reopen need explicit evidence.
The fixed `npm run test:desktop:assembly-tangent` workflow uses the production
renderer and original fixture with the existing 180/170/35-second budgets,
hidden test-owned child and restricted file dialogs. It is not the user's demo
or proof of installed-package or cross-platform behavior.

The dependent [cylinder surface proposal](ASSEMBLY_CYLINDER_TANGENCY.md) preserves
this plane/cylinder type and adds separate nonparallel and explicitly parallel
families. Consult its own source-specific evidence before claiming execution.
Cylinder degenerations/transitions, LINE/curve pairs, spherical/conical and
general surfaces, finite-contact policies and complete tangent-family acceptance
remain open. This increment cannot open the full assembly demo gate.
