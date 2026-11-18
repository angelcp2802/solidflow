# Ordered plane placement along a moving ray

`src/model/assemblyPlanePlacement.ts` measures four ordered infinite planes
along a ray attached to the first plane. It is a pure mathematical primitive.
It introduces no saved mate, Width mode, solver constraint, native reference
authority, editor option or Apply capability. The existing centered-width
[bisector contract](ASSEMBLY_WIDTH_GEOMETRY.md) remains separate and unchanged.

## Inputs, signs and domain

Inputs retain four original roles in an exact dense tuple:
`[width0, width1, tab0, tab1]`. Each support supplies its owner ID or null,
a point and unit normal, and optional absolute point/direction uncertainty.
Normals must have unit length within `1e-12`; the helper normalizes their
finite representation. Unknown/executable fields, malformed tuples, missing
owners/signs, nonfinite values and invalid tolerances reject.

Two signs are mandatory: `directionSign` and `tabSpanSign`, each `+1` or `-1`.
They are mathematical choices. Neither geometry, material sense, sorting nor
proximity chooses them automatically.

Let support points be `p_i`, normals `n_i`, ray origin `x0=p_0` and ray
direction `e=directionSign*n_0`. For each plane:

```
A_i = n_i · (p_i - x0)
B_i = n_i · e
lambda_i = A_i / B_i
ray(lambda) = x0 + lambda*e
```

This is an open transversal chart: each plane must intersect the ray with a
resolvable nonzero `B_i`. All four supports may translate and rotate
independently. The helper imposes no pair parallelism. `lambda_0` and its
derivatives are exactly zero by the shared-anchor identity.

An exactly zero computed denominator returns `nonTransverse`. A denominator
unresolved relative to its error estimate returns `precisionLimit`. Neither
diagnostic swaps a direction or drops a support. Parallel-angle diagnostics
describe current geometry; they are not orientation constraints.

## Ordered scalar measurements

With `s=tabSpanSign`, the returned lengths are:

| Field | Formula |
| --- | --- |
| `widthSpan` | `lambda_1` |
| `signedTabSpan` | `lambda_3 - lambda_2` |
| `tabExtent` | `s * signedTabSpan` |
| `availableSpan` | `widthSpan - tabExtent` |
| `orderedStartDistance` | `lambda_2` |
| `orderedEndDistance` | `lambda_1 - lambda_3` |

These are ordered distances. In particular, start plus end equals
`widthSpan-signedTabSpan`, which differs from `availableSpan` when `s=-1`.
They do not generally represent two physical envelope clearances. Negative or
zero spans remain signed data; the helper does not clamp, sort, impose
containment or divide by the available span.

For an original parallel example, width planes at `x=-7,11` and ordered tab
planes at `x=-2,-5`, with direction `+X` and tab sign `-1`, give parameters
`[0,18,5,2]`. Tab extent is `3`, available span `15`, ordered start `5` and
ordered end `16`. The physical near-envelope gap is `2`, illustrating the
distinction. A scalar expression such as `start-available/3` is zero here;
that arithmetic does not admit a saved Percent mode.

Nonparallel inputs still measure ray-plane intersections. Moving the anchor
point tangentially can change that ray and its intersections. Tangential
reparameterization of any other support point leaves its plane and
intersection unchanged. A common proper rigid motion preserves all scalar
measurements. These properties do not define a nonparallel Width placement
policy or its orientation manifold.

## Coordinates and analytical derivatives

`measureOrderedPlanePlacement` accepts world points in mm and a conditioning
origin, length scale, length tolerance in mm and angle tolerance in radians.
It returns normalized lengths and explicitly includes `lengthScaleMm`.
`measureConditionedOrderedPlanePlacement` accepts points/errors already in one
fixed normalized frame and a normalized length tolerance. It never adds the
world origin back. Both entrypoints mark output units as `normalized`.

Six derivative columns are `[vX,vY,vZ,wX,wY,wZ]`: translation is normalized
length and rotation is radians. Under left retraction:

```
dp_i = v_i + w_i × p_i
dn_i = w_i × n_i
dx0  = v_0 + w_0 × x0
de   = w_0 × e
dA_i = dn_i · (p_i-x0) + n_i · (dp_i-dx0)
dB_i = dn_i · e + n_i · de
dlambda_i = (dA_i-lambda_i*dB_i) / B_i
```

The moving origin and direction terms belong to the first support's formal
block. Each returned scalar uses the corresponding linear combination of
parameter derivatives. Four formal blocks remain available even for null
owners. Repeated owner IDs accumulate once in `owners`; null adds no physical
owner columns. A non-null ID does not declare an owner free: the consuming
solver would choose its actual variable columns separately.

Common translation and rotation cancel in these scalar derivatives, including
away from a proposed target value. No fixed-world vector residual introduces
an additional rank. The helper does not claim a global constraint rank or
convergence result.

## Precision and evidence boundary

The world wrapper accounts for declared errors and original operand magnitudes
before cancellation and normalization. It cannot restore coordinates already
lost during earlier world composition. Unrepresentable scaling, unresolved
subnormal point/error data, overflow, nonfinite derivative blocks or nonfinite
repeated-owner aggregates return `precisionLimit`.

For a parameter, a first-order quotient estimate uses numerator error `uA`
and denominator error `uB`:

```
uLambda = (uA + abs(lambda)*uB) / (abs(B)-uB)
```

The denominator must exceed `uB` in magnitude. Scalar estimates propagate
absolute coefficient magnitudes. Final length and angle uncertainty must fit
the explicitly supplied measurement bands; the helper never widens them.
The estimates are conservative first-order arithmetic/input-error estimates,
not a formal interval certificate or native metrology.

Original tests use rational nonparallel normals/points with literal parameters
`[0,22/3,10/3,7/2]`, the parallel example above, and independent finite
differences at steps `1e-5` and `2e-6`. They exercise all four sign combinations,
moving anchor, four/three/repeated/null owners, common rigid gauge,
normal-equation reversal, fixed conditioning scales `2` and `7`, oblique
frames, parameterization and precision/malformed-input boundaries. Numerical
agreement is checked at the tolerances stated in the test; it supplies no
native, renderer, persistence or platform acceptance.

Width mode admission remains separate: ordered correspondence, orientation,
Dimension units, Percent interpretation, bounds, Free, intersecting groups,
cylindrical surfaces and standalone axes require their own contracts and
evidence. This primitive does not complete any unverified cell of the
[32-case geometry/mode scope](ASSEMBLY_WIDTH_GEOMETRY.md).
