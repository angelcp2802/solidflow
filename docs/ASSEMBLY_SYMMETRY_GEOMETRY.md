# Reflection geometry for assembly symmetry

The numerical symmetry geometry compares two selected analytic entities about
a third, independently owned plane. It covers points, infinite lines, infinite
planes, equal-radius spheres and equal-radius cylinders. It relates the
selected supports; it does not reflect a component's complete rigid placement,
duplicate a body or manufacture a mirrored solid.

This is a mathematical building block for the complete assembly requirement.
The separate numerical solver integration below retains all five families and
three owner roles. Neither layer adds a saved mate, native reference authority
or an editor command. The separate [saved/native workflow](ASSEMBLY_SYMMETRY.md)
connects these layers without granting the helper native authority. Written cases
are not executed results; consult [VALIDATION](VALIDATION.md).

## Supports and coordinates

Each support retains its own `ownerId`, including repeated owners. A null owner
denotes the fixed scope. The third role is a plane with a parameter point and
unit normal. Source and target have the same entity kind; lines and cylinders
retain a point and unit direction, planes a point and unit normal, and spheres
a centre. Spheres and cylinders also retain their physical radius.

World input uses millimetres and an explicit conditioning origin and positive
length scale. The separate conditioned entry accepts points and radii already
in that normalized frame; it never reconstructs distant world coordinates.
Directions remain dimensionless. Direction normalization requires unit length
within `1e-12`; calculations use detached normalized copies. Input uncertainty
is explicit, in mm or radians before conditioning and normalized length or
radians afterward. A world point cannot recover precision already lost during
its construction.

Points and spheres have no orientation condition. Lines, planes and cylinders
require an explicit aligned or opposed branch for their reflected direction.
No branch is inferred from proximity, material side or a display mesh. Radius
differences outside the requested length band are incompatible with this
rigid relation; the numerical band does not authenticate a native radius.

## Reflection and comparison

All quantities in these formulas are in the same fixed normalized frame.
Let `s` and `m` be the symmetry plane's point and unit normal, `a` the source
point, `b` the target point and `e` the selected direction sign:

```text
H = I - 2 m m^T
y = a - 2 m [m . (a-s)]
r = nA - 2 m (m . nA)
delta = b-y
q = nB-e*r
```

The reflected point is `y`; `r` applies only to directional families. Position
comparison uses `delta` for points/spheres, `(I-nB*nB^T)*delta` for
lines/cylinders, and `nB*(nB.delta)` for planes. The position and optional
normal defect are expressed in the source owner's current proper frame
`R_A^T`. That frame belongs to the source owner; it is not another independently
moving reference. The physical direction angle is reported separately as
`atan2(norm(cross(e*r,nB)),dot(e*r,nB))` in radians. The normal chord is not
itself an angular measurement or a global solver convergence guarantee.

For a plane or line whose direction condition is unsatisfied, the position
defect uses the reflected source parameter point. It is not the minimum
separation between arbitrary nonparallel supports. Tangential/axial source
reparameterization can change that off-solution chart; at matching directions
it preserves the geometric comparison. Tangential reparameterization of the
symmetry plane preserves the reflection itself. No finite face contact,
trimming, material containment or collision result follows from these equations.

## Three-owner derivatives

Formal columns are `[vX,vY,vZ,wX,wY,wZ]` under normalized left rigid retraction:
`dx=v+w cross x`, `dn=w cross n`. Translation is dimensionless; its physical
length is the conditioning scale times `v`, while rotation uses radians.
With `t=m.(a-s)` and `u=m.nA`:

```text
dy = da - 2 [dm*t + m*(dm.(a-s) + m.(da-ds))]
dr = dnA - 2 [dm*u + m*(dm.nA + m.dnA)]
```

Position projections also differentiate the target direction. Source-frame
variation contributes `-wA cross defect` before multiplication by `R_A^T`,
including away from zero. Omitting the mirror motion, target projection or
moving source frame would change the actual constraint.

Formal blocks remain ordered source, target, symmetry plane even for a null
owner. Physical owner blocks sum repeated IDs and omit null. A non-null ID
does not declare that an owner is free: the numerical solver selects actual
free variables and reports the rank of its complete system. No midpoint or
reflected virtual component contributes another rigid owner.

## Numerical admission

Malformed, nonfinite, sparse or wrongly purposed numerical input rejects.
Unrepresentable normalization, arithmetic or derivative accumulation returns
`precisionLimit`. First-order arithmetic and supplied input-error estimates
are evaluated before cancellation against the requested length and angle
bands. These estimates are numerical admission policy, not interval
certificates, physical metrology or native freshness evidence.

## Numerical solver integration

`RigidSymmetryConstraint` keeps `source`, `target` and `mirror` endpoints;
it has no fictitious binary endpoints. All five matching support families are
admitted. Numerical points have no axis. The exhaustive numerical visitor
retains all three roles, including repeated owners and the null fixed scope.
Cloning validates each support and its purpose before solving; points are
rejected by existing binary families, including gear carriers and angle guides.

The helper's source-frame defects remain its public mathematical chart. The
solver applies different orthogonal charts to keep the row images fixed:

```text
positionRows = R_B^T positionWorld
normalChordRows = R_A^T H q = R_A^T H nB - e*nA_local
```

The target-frame position projector is constant: a plane has one normal
component and a line/cylinder two transverse components. The reflected source
frame leaves a unit-sphere normal image with a constant centre. Differentiation
includes target-frame motion for position, source-frame motion for normal,
and the full mirror derivative `dH=-2(dm*m^T+m*dm^T)`, even away from zero.
Rotating only the residual while retaining its previous Jacobian is invalid.

The solver scales the normal chord by `theta/chord`, with its analytic radial
derivative and a small-chord series, to obtain rows measured in radians.
It checks the physical position norm, radius difference and `atan2` angle
separately. Its angular chart rejects directions within `1e-7` radians of pi.
Bounded orientation seeds use actual free ownership: independent source,
target or mirror motion and shared source/target, source/mirror or target/mirror
motion are distinct proposals. All-shared ownership has no orientation seed.
Deterministic transverse directions are numerical initialization only; every
proposal must pass the combined equations and physical checks. Existing
tracker/limit restrictions on seeding remain unchanged.

Point/sphere constraints budget three rows; directional constraints budget
six. These are capacity counts, not ranks. Local rank/DOF comes from the
complete factored system, retaining common rigid gauge and the existing
certified refinement or honest failure policy. Damping, tolerances, iteration,
trial, row and column budgets are unchanged. Target projection remains local;
there is no new inequality or continuous-motion admission.

Endpoints compose `body*frame` directly in the fixed normalized conditioning
frame, without reconstructing world coordinates or canonicalizing parameter
points. Composition errors are checked before cancellation. An explicit
three-support uncertainty tuple propagates bounds through each reflection and
projector evaluation without widening requested bands. Without that tuple,
the standalone numerical API retains its compatibility band
`max(problem.lengthTolerance, sum of the three support.tolerance values)`.
That route supplies no propagated native uncertainty. The
[native adapter](ASSEMBLY_SYMMETRY.md#native-and-numerical-authority) supplies
the tuple and accounts for amplified mirror uncertainty.
This numerical policy authenticates neither native geometry nor metrology.
Measurements report physical millimetres/radians and retain their entity kind
and alignment. Failures publish no accepted poses.

## Saved workflow and remaining acceptance

The separate [native measurement prerequisite](ASSEMBLY_SYMMETRY_NATIVE_MEASUREMENT.md)
queries and compares current three-role supports without solving or creating a
saved mate. The [saved symmetry workflow](ASSEMBLY_SYMMETRY.md) now connects
all five purposes, strict three-role persistence, native solve/projection,
fresh independent verification, repair and dropdown editor integration.

All five families retain source-specific acceptance obligations for native
purposes, radius/orientation compatibility and the full editor/source lifecycle.
Written implementation alone establishes no executed workflow. Viewport point
picking and continuous-motion/contact-stop admission remain separate; the
translation-until-contact gate rejects symmetry pending its own path argument.

Original numerical tests, a green build or another mate's desktop workflow
complete none of those native, saved or interaction requirements. Full assembly
acceptance and the complete assembly demo remain pending.
