# Cylinder surface tangency

This dependent proposal adds two explicit infinite-support relations within
the remaining tangent work for [issue #45](https://github.com/angelcp2802/solidflow/issues/45).
It does not complete the tangent family or assemblies. Read
[VALIDATION](VALIDATION.md) for source-specific executed results; authored
cases, formulas and configured workflows are not passes.

## Saved intent and exact references

Both endpoints explicitly select an exact current cylindrical surface using
`AssemblyCylinderSurfaceReference`. Existing derived-axis, plane, LINE and
component references are not converted to surface intent. The old geometry
reference union and its validators retain their meaning. The separate
[plane/cylinder relation](ASSEMBLY_TANGENT_MATES.md) remains `type: 'tangent'`
with its original signed plane side and parser.

New version-2 records declare either:

- `type: 'skew-cylinder-tangent'`: a regular nonparallel-axis support relation,
  without an axis-angle constraint.
- `type: 'parallel-cylinder-tangent'`: support tangency with an additional
  parallel-axis constraint. Native axis directions are undirected; no signed
  alignment field is saved.

Both use `branch: { kind: 'external' }` or
`branch: { kind: 'internal', larger: 'first' | 'second' }`.
The internal endpoint declares the larger-radius support, not a containing
body. Fresh native radii must preserve that order with resolvable precision;
source changes and repairs cannot silently exchange it or substitute an
absolute radius difference. External intent has no inert `larger` field.
No plane side, user radius, offset, phase, neutral, angle history or contact
point is saved. Strict validation applies to suppressed declarations too.
Older readers are not promised to accept the new types.

Changing the family requires closing the current editor and deliberately
creating the other relation. An edit retains the original family, ID and
explicit endpoint/radius-role intent. Suppression, reactivation and deletion
remain ordinary authenticated Preview/Apply operations. Manual source repair
preserves exact occurrence path, definition revision, body and face identity,
and the surface purpose; branch validity is then evaluated against fresh data.

## Nonparallel equation

Canonicalize each arbitrary local axis point before world placement. Let
`C1,C2` be the placed points, `a,b` the unit axes, `r1,r2 > 0` the current native
radii, and `w=C2−C1`. On a regular nonparallel chart:

```text
g = |a × b| > 0
n = (a × b) / g
h = n · w
D = |h| > 0
R = r1 + r2                         external
R = r_larger − r_smaller > 0        internal
e = D − R
```

This is one length equation. It does not add parallelism, an axial stop, spin
locking or rolling. Reversing either native axis reverses `n,h` together and
preserves the distance and physical result. At regular configurations the
local rank is one: one fixed component leaves five DOF; two free components
leave eleven including six common rigid gauge freedoms.

The analytical differential uses `k=a×b`, `dk=da×b+a×db`:

```text
dh = n · dw + (w − h n) · dk / g
de = sign(h) dh
```

The absolute-distance chart must not silently switch to parallel equations.
Nearly parallel closest-axis parameters can diverge, so a calculated contact
point is not needed to evaluate the equality or the normal report. A finite,
resolvable cross product and separation are required. Overflow, underflow,
uncertain sign, unresolvable radius gap or amplified roundoff must reject
without changing requested tolerances.
The initial numerical chart rejects `|a×b| <= 1e-7`; this is an explicit
admission boundary, not a switch to the parallel family or a relaxed angular
acceptance tolerance. Radius guards concern representable arithmetic on the
fresh current native radii; they do not supply an extra radial uncertainty model.

## Additional parallelism

For the explicitly parallel family, orientation rows use `a×b` in the second
endpoint's moving frame. Three vector rows have regular physical rank two.
The acceptance check also measures `atan2(|a×b|, |a·b|)` in radians; individual
vector components passing tolerance cannot replace that physical angle check.
Both aligned and opposed axis descriptions represent the same geometry.

The radial length equation uses:

```text
v = w − a(a · w)
D = |v| > 0
e = D − R
dD = (v/D) · [dw − da(a·w) − a(da·w + a·dw)]
```

There are four numerical rows with regular physical rank three. One fixed
component leaves three DOF; two free components leave nine including the six
common gauge freedoms. Expressing the orientation residual and its derivative
in a moving frame preserves that gauge off the solution manifold as well.
An orthogonal start is an ambiguous stationary chart and may reject honestly;
this proposal does not add a special cylinder-tangency seed or fallback.
The initial chart rejects `|a·b| <= 1e-7` around that stationary start. The
physical acceptance angle retains the requested solver tolerance.

These are local rank statements, not global mechanism mobility. Coincident
axes, zero distance, equal-radius internal contact and transitions between
the nonparallel and parallel strata need separate contracts and remain open.
They are not admitted by perturbing input, squaring a distance residual or
changing the number of equations during a solve.

## Fresh native authority and normal evidence

Both exact current cylindrical surfaces must be queried afresh using distinct
private native surface witnesses. Renderer metadata, nominal sketch radii,
old axis witnesses, cloned tuples and stale source revisions cannot authorize
the operation. Final independent reconstruction re-queries both supports and
their radial material senses before publishing Preview/Apply authority.
Query, cleanup, source-currentness, reentry or final-scene failures withhold it.

Let native oriented radial senses be `epsilon1,epsilon2`, each `+1` or `−1`.
At support tangency the oriented normal dot is `−epsilon1 epsilon2` on the
external branch and `+epsilon1 epsilon2` on the internal branch. The detached
optional `cylinderTangencies` report is separate from plane/cylinder
`tangencies`; it records family, full scope path, mate ID, branch, both senses,
same/opposed normal relation and `supportOnly: true`. It is not serialized as
document intent or used as renderer-written authority.

Infinite support-normal agreement does not prove that trimmed faces meet,
that solids avoid overlap, that one body contains another or that they roll
together. In particular, internally related cylinders with nonparallel axes
can have material overlap elsewhere. Native body interference/clearance and
future finite-contact rules remain separate checks.

## Transactions, movement and evidence

Existing gear/screw/rack active and passive tracking keeps its no-reseed policy
and saved winding. Failed trial, native query or cleanup restores atomic pose
and tracking state; these new geometric relations create no lift history.
Compatible mixed mechanisms need their own independent cases.

The local workflow exposed a nearly satisfied redundant parallel/direction
combination whose different endpoint frames leave an uncertain Jacobian rank.
The proposed correction refines only a physically satisfied state with a
certified factor, nonzero residual and certified large singular modes. It may
take a provisional damped step in that subspace under the existing iteration,
trial and chart limits. Ambiguous modes are not inverted or declared absent.
The complete fresh Jacobian must subsequently certify a stable rank before
poses or tracking maps can be published. A missing budget, uncertified factor,
zero residual or unresolved final rank still rejects. Consult the validation
record for the correction's actual execution status.

Neither family inherits the plane/cylinder constant-rotation straight-translation
allowlist. Parallel tangent positions lie on a nonconvex distance locus; a chord
between valid endpoints can break the relation. Nonparallel absolute signed
distance can cross zero between opposite branches. Endpoint satisfaction alone
is insufficient. Angular station evidence remains sampled, without continuous
contact or collision guarantees.

The fixed `npm run test:desktop:assembly-cylinder-tangent` workflow uses two
original tracked unmated documents, actual worker geometry and controls,
real native-face pointer input and restricted test-owned Open/Save As paths.
It retains the hidden isolated child and the existing 180/170/35-second budgets.
Numerical/Jacobian/rank, fresh BRep/D1, component tests, renderer interaction,
saved bytes and visual review are separate evidence boundaries. Configured
cross-platform CI and one local case do not establish platform support.

Full tangent acceptance still requires the remaining cylindrical degenerations
and transitions, LINE/curve and other analytic/general surfaces, finite-domain
contact and broader compatibility. Complete assemblies, installed packages,
structural interchange and the user's full-scope demo remain open.
