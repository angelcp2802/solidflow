# Numerical circular paths

This layer adds an explicit numerical `circular-path` constraint to the rigid
assembly solver and target projection. It follows the separate
[material arc observation](ASSEMBLY_MATERIAL_ARC_PATH.md). Numerical data confer
no current native reference authority. The separate
[current-native bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md) supplies issued
numerical inputs and independent verification for its declared analytic model;
this numerical layer adds no saved declaration, worker message, editor command
or Apply capability.

## Explicit input and owners

The first role is a point. The second contains a circle center, material-start
radial and forward tangent directions, positive radius and open sweep strictly
between zero and `2*pi`. Its proper orthogonal frame is explicit, rather than
inferred from a circle seam. Position, radius, frame and sweep have separate
mandatory nonnegative error bounds. Radius uncertainty must exclude zero;
sweep uncertainty must retain a proper open arc. A native topology tolerance
does not establish these metrology bounds.

Free position requires either `domain: 'trim'` or `domain: 'support-circle'`.
The former retains both finite endpoints; the latter uses the supporting
circle. This API choice does not establish an external application's Free
policy. Fixed position declares an inclusive material `distanceMm` from zero
to `radiusMm * sweepRad`, with no percentage, extrapolation or wrapping policy.
Physical coordinate admission precedes conditioning. Its validated fraction of
the physical trim is used only for numerical scaling, retaining exact endpoints
that separate divisions could round outside the normalized trim. The arithmetic
change is charged to the point/tangent frame error. One ULP beyond the physical
endpoint still rejects; underflow does not turn a nonzero coordinate into zero.

Optional Follow aligns an explicit signed component axis with the tangent.
Optional UP requires Follow, a distinct perpendicular component axis, and an
actual plane guide with its own rigid owner and direction uncertainty. Each
axis has an independent reversal. Point, path and guide incidence retains all
three roles, including repeated owners and the null fixed-scope owner. Groups
still have exactly six variables per free body; there is no hidden path body,
auxiliary phase variable or saved winding.

## Equations and finite domain

In the path frame, let `p = Rpath^T * (P-C)`, with material start directions
`u,v`, normal `n = u cross v`, and `rho` the length of the projection of `p`
onto their plane. Free position has two bilateral rows:

```
n dot p
rho - radius
```

For a trim of sweep `beta`, rotate `u,v` by `beta/2` to get the centered frame
`m,q`. Its current phase `alpha = atan2(q dot p, m dot p)` has margins
`radius * (beta/2 + alpha)` and `radius * (beta/2 - alpha)`, expressed in
length units. This chart retains minor and major arcs. Its discontinuity lies
in the complement and is explicitly rejected near the cut. Support-circle
position has neither these bounds nor this cut. A Free point on the circle's
axis lacks a radial/tangent chart; a direction is never fabricated for it.

For fixed distance `s`, the target is
`C + radius * (cos(s/radius)*u + sin(s/radius)*v)`, giving three position rows.
It remains regular when the starting point lies on the circle axis.

Full derivatives include the moving path frame:
`dp = Rpath^T * (dP-dC-omegaPath cross (P-C))`. Free phase variation propagates
into Follow and UP. Follow uses a frame that turns with the phase; UP uses the
effective tangent rotation `omegaPath + normalWorld*dphase`. Repeated owners
contribute through every actual role to the same six columns. Common rigid
motion is therefore a gauge even off solution.

The final positional check is the Euclidean distance to the supporting circle,
finite arc or fixed target, as declared. It also retains the trim margins.
Scalar rows fitting individually do not establish that the physical norm fits.
Follow uses an actual angular defect, and UP uses its signed projected angle.

## Precision, restoration and movement

Lengths are conditioned once; error accounting retains the uncancelled
placement terms. Near-unit frame normalization is charged. Free phase needs a
finite coefficient-error ball that excludes zero; fixed phase includes the
positive lower radius bound in its quotient error. Finite distance-to-set,
tangent and margin errors remain separate. Nominal residual plus its retained
error must fit the requested physical band; uncertainty never enlarges it.
Nominally feasible but insufficiently precise poses return `precisionLimit`,
without an inconsistency certificate. The arithmetic allowances are numerical
guards, not a formal interval proof or calibrated native metrology.

A bounded initialization may move an actual free point or path owner to the
material start when its radial chart or complement cut is unavailable. It
cannot create relative freedom in a shared owner or use a free guide to move
fixed point/path geometry. Follow/UP proposals rotate actual owners about the
selected material point. Every proposal is re-evaluated with all constraints
and unchanged uncertainty before a pose can be returned. Mechanical tracking
and existing interval groups retain their previous seed restrictions.

Both trim inequalities consume capacity even when inactive. They remain
separate from bilateral rank and are used by restoration, the local feasible
cone, and constrained target projection. An active endpoint can release for an
inward target. This is local numerical movement, not a global nearest-point,
continuous collision or general convergence claim.

## Evidence boundary

Original mathematical cases and a reused original sector fixture are described
in [provenance](PROVENANCE.md#numerical-circular-path-fixtures). The CAD experiment
constructs numerical inputs from the independent recipe, solves them, then
re-queries the transformed native point, arc and changing tangent. Its declared
error budgets are not a production native admission bridge. Executed checks
belong in [validation](VALIDATION.md).

The separate current-native bridge derives radius/frame/sweep arithmetic for
the stored analytic Float64 model; it does not establish physical metrology.
The subsequent [saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) connects
explicit intent, source repair, authoring, private preview/Apply, history and
reopening for its bounded scope. Complete-circle origins, chained curves,
external policies and complete assembly/demo acceptance remain open. The saved
LINE family is unchanged.
