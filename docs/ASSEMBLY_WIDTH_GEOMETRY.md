# Ordered plane geometry for width relations

`src/model/assemblyPlaneBisectors.ts` provides independent numerical geometry
for two ordered plane pairs. It retains each reference and its owner instead
of replacing a group by a midpoint attached to one component. This is a
building block for the width relation in issue #45. A separate numerical
centered solver consumes these four supports as described below. This helper
itself supplies no native authority. The separate
[saved centered-width contract](ASSEMBLY_WIDTH.md) connects native references,
documents and the editor without changing this geometry layer's evidence.

## Inputs and coordinate convention

Each support supplies a point in millimeters, a unit normal and an owner ID.
The numerical normal must have unit length within `1e-12`; computation uses
a normalized copy without mutating the supplied data.
A null owner denotes the fixed scope frame. Non-null IDs identify ownership;
they do not declare whether that owner is free in a particular solve. Native
authentication, current source revisions and ancestor placement arithmetic
remain the caller's responsibility.

The fixed conditioning origin is `o`, and the positive length scale is `S`.
Calculations use `x=(p-o)/S`. Input point errors are in millimeters and normal
direction errors are in radians. Omitted errors mean no additional supplied
uncertainty; this does not establish native exactness. A world point cannot
recover precision lost before it reached this module.

The caller selects `sum` or `difference` explicitly. Neither reference order,
material orientation nor a nearby candidate silently selects another branch.
For signs `s=+1` and `s=-1`, respectively:

```text
a_i = n_i . x_i
u = n_0 + s*n_1
L = |u|
b = u/L
h = (a_0 + s*a_1)/L
bisector plane: b . x = h
```

The same equations handle the admitted parallel and intersecting pairs. Exact
normal cancellation has no unique plane on the selected branch. It returns
`degenerate`; near cancellation or insufficient arithmetic precision returns
`precisionLimit`. The other branch is never substituted. Malformed numerical
inputs throw, separately from those geometric diagnostics.

## Derivatives and ownership

Every reference has six formal columns `[vX,vY,vZ,wX,wY,wZ]` under the same
normalized left retraction as `retractRigidBodyPose`. Translation `v` is
dimensionless, corresponding to `S*v` millimeters; rotation `w` uses radians.
For one support variation:

```text
dx = v + w cross x
dn = w cross n
da = n . v
du = dn_0 + s*dn_1
dL = b . du
db = (du - b*dL)/L
dh = (da_0 + s*da_1 - h*dL)/L
```

Formal reference blocks remain available even for a fixed-frame input. The
separate owner blocks sum all contributions from the same non-null owner and
omit null. Callers must select actual free-owner columns rather than treating
the number of references as the number of moving bodies. No derived midpoint
or independent virtual component contributes an extra unknown.

## Comparing two pairs

The comparison accepts four original plane references, an explicit alignment
sign `e`, and a current frame rotation `R0` attached to the first width
support's owner. The caller must compose that rotation from the same owner.
The first width support also supplies the anchor `x0`:

```text
q = b_tab - e*b_width
r_normal = transpose(R0)*q
r_offset = h_tab - e*h_width - q . x0
```

The normal result is a dimensionless vector defect, not an angle measurement.
The offset is a normalized length. At coincidence they vanish. Both remain
invariant under a common rigid change of all supports, the anchor and its
attached frame, including away from coincidence. Their derivatives include
the moving frame and anchor:

```text
dr_normal = transpose(R0)*(dq - w0 cross q)
dr_offset = dh_tab - e*dh_width - dq . x0 - q . dx0
```

Those frame/anchor terms belong to the first support's formal block once;
owner accumulation then combines repeated references. Omitting them would
give common rigid motion an artificial numerical effect at a nonzero defect.
Changing a plane's tangential parameter point preserves its bisector. Changing
the comparison anchor can change this chart's nonzero offset defect when the
bisectors are not parallel; it does not change the coincident zero set.

## Precision and acceptance boundary

The module estimates Float64 arithmetic and supplied input uncertainty before
cancellable sums. It rejects unresolved selected branches and unrepresentable
length normalization, and checks derivative blocks before and after owner
accumulation. These first-order estimates are a numerical admission policy,
not formal interval certificates or physical error guarantees. A downstream
solver still needs independent angle/length checks and native verification.

The [original numerical tests](PROVENANCE.md#original-numerical-plane-bisector-geometry)
use literal rational plane equations, branch/order reversals, repeated/fixed
owners, common rigid gauges and central differences at two tangent sizes.
Execution results belong in the source-specific validation record.

## Numerical centered solver

`RigidWidthCenteredConstraint` is a separate numerical union member with
`width` and `tab` ordered two-tuples, an explicit `centered` mode, two selected
branches and `aligned` or `opposed` bisector alignment. It has no fabricated
`first`/`second` endpoints. All four references must carry actual plane
supports and existing owners or the null fixed scope. The numerical endpoint
visitor retains every role, including repeated owners, and the solver's
incidence graph includes the fourth reference. The previous binary families
retain their original declarations.

Endpoint placement is composed directly in the fixed normalized solve frame,
subtracting the conditioning origin before adding local frame/support
offsets. `compareConditionedPlaneBisectors` accepts those already normalized
points and errors; it does not reconstruct distant world points. Composition
uncertainty is estimated before cancellation. The requested physical length
band is the maximum of the problem tolerance and the sum of four support
tolerances. Branch-amplified uncertainty must fit that band and the requested
angular tolerance, otherwise evaluation rejects with `precisionLimit`.

The solver measures the physical bisector angle independently of the chord:

```text
theta = atan2(|(e*b_width) cross b_tab|, (e*b_width) . b_tab)
c = |r_normal|
r_angle = (theta/c)*r_normal
```

At zero, the scale uses its continuous value one. A series below `c=1e-4`
avoids subtractive loss; the Jacobian includes the derivative of this scale,
in addition to the original moving frame and anchor derivatives. Three
angular rows and one normalized offset row do not imply four independent
equations. The original Cartesian regular tests have rank three; arbitrary
geometry does not inherit that rank. Evaluation reports the actual angle in
radians, signed anchored offset in millimeters, selected branches, alignment,
branch lengths and tolerances. Final acceptance uses the physical angle and
absolute anchored offset, not just vector components.
Group evidence copies these measurements for free-owner groups. All-fixed
constraints are checked separately; their measurements remain available from
direct evaluation rather than appearing in a nonexistent free-owner group.

Angles at or above `pi-1e-7` return `orientationChart`. This bounded local
chart makes no global convergence or inconsistency claim about such input.
Exact branch cancellation, malformed declarations and unresolved precision
are distinct diagnostics. Failure never publishes a partial set of poses.
The generic local target projection can consume the numerical constraint;
centered mode adds no inequality or margin boundary.

The [original solver fixtures](PROVENANCE.md#original-numerical-centered-width-solver-cases)
exercise all four owners, repeated/fixed incidence, parallel and intersecting
plane pairs, nested frames, physical angle, angular chart samples, analytic
Jacobian, common rigid gauge and local projection. These are numerical cases,
separate from native CAD verification, document lifecycle and actual editor
interaction. The [saved/native integration](ASSEMBLY_WIDTH.md) resolves its
four original references explicitly; that integration needs separate native,
lifecycle and editor evidence rather than inheriting a numerical test pass.

The complete mode acceptance matrix remains separate from this module:

| Dimension | Required case families |
| --- | --- |
| Width group | Two parallel planes; two intersecting planes |
| Tab group | Two parallel planes; two intersecting planes; one cylindrical surface; one standalone axis |
| Mode | Centered; Free; Dimension; Percent |

These form 32 geometry/mode questions. Each needs an explicit eligibility
decision and independent evidence for the resulting behavior. A case that
belongs to the intended application scope remains required while unsupported
or unresolved; this building block does not turn such a gap into completion.
Reference order, equation orientation, alignment, flip, boundaries and
degenerate cases need their own decisions within those questions.

Complete width behavior remains required: reference-purpose and branch
admission, parallel/intersecting width pairs, plane-pair/cylindrical-surface/axis
tab cases, Centered/Free/Dimension/Percent modes, margins and active boundaries,
all-owner solving and projection, native final checks, grouped source and
replacement repair, history/persistence and actual editor interaction. A
cylindrical surface is distinct from its axis and from a standalone datum
axis. This geometry module resolves none of those identity or mode policies
by substitution, and it does not open the assembly demo gate.
