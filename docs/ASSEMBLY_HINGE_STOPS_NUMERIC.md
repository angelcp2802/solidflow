# Numerical hinge angular stops

This prerequisite extends the numerical hinge with two explicit angular plane
roles. These numerical APIs grant no saved editing or native reference
authority. The separate [saved extension](ASSEMBLY_HINGE_STOPS.md) composes
current native proofs with optional saved stops and the editor. Reference
application angle origin, sign, range and toggle policies still require
independent evidence; SolidFlow's declared coordinate does not establish them.

## Explicit coordinate and six roles

`RigidHingeConstraint.stops`, when present, declares:

- `coordinate: 'directed-about-axis'`;
- two ordered `angular` endpoints, each an actual numerical plane support;
- an `arc` with `start` in [0,360) and `sweep` in [0,360] degrees;
- optional two-role `uncertainty`, with total position errors in mm and direction
  errors in radians, separate from the original four hinge error records.

Each angular plane belongs to the same effective rigid owner as its side's axis
and axial plane. Its descendant frame may differ. Incidence preserves all six
roles, including repeated owners and null fixed-scope roles. It does not promote
a descendant to an independent moving body. Input copying requires dense own
plain data and does not execute getters or admit unknown/undefined fields.

The first material axis supplies the guide. There is no seventh independent
guide, fixed world UP, captured zero or accumulated turn. Project both ordered
angular normals onto the guide's perpendicular plane. Their right-handed angle
is `atan2(g dot (u cross v), u dot v)`, normalized into [0,2*pi). Axis alignment
belongs to the bilateral hinge; choosing opposed alignment does not silently
reverse this angular guide. Reversing the guide reverses the circular angle;
reversing one angular normal instead adds half a turn.

Axial caps are unsuitable angular substitutes: their normals are parallel to
the axis, making the projection unobservable. Nearly parallel normals also
reject when the declared precision cannot be retained. Full-circle intent
creates no seam stop but still requires observable angular references for its
reported coordinate. Equal endpoints create a zero-width interval.

## Equations, inequalities and movement

The original six hinge chart rows remain bilateral. A regular two-owner hinge
has measured bilateral rank five and one relative spin; adding a proper arc
adds two angular inequalities, not another alignment equation. Interior
mobility, active-bound lineality and bilateral rank remain separate evidence.
At a regular stop the active cone can have rank six and zero lineality while
still permitting motion back into the interval.

The existing arc-centred lift places its branch cut outside the proper arc.
An ambiguous restoration direction rejects rather than selecting a different
turn. A finite uncertainty cone intersecting that cut also rejects. Nominal
gradients retain both plane variations and the first guide-axis variation;
their contributions accumulate on their actual owners. Common rigid motion
therefore remains a gauge, including off solution.

The solver restores violations without the legacy antipodal seed, which could
jump across an interval. Target projection recognizes the hinge inequalities,
clamps outward requests and releases inward requests. It retains no active set
in the input. Fixed infeasibility remains distinct from a free restoration
failure or exhausted iteration budget. This is a local numerical solver, not a
global feasibility proof or continuous sampled-motion implementation.

## Precision and evidence

Direction errors remain independent of positional support tolerances. For each
projected normal, a finite Euclidean ball bounds its original direction cone
and the guide's projector change. Normalization requires that ball to stay
strictly inside the nominal projection length. Bounds on the dot and oriented
triple product then bound the phase's `atan2` disk, including Float64
composition. No position tolerance is converted into angular metrology.

Physical stop acceptance requires nominal interval violation plus retained
direction error to fit the requested angular band. An otherwise nominal fit
whose uncertainty consumes that remaining band returns `precisionLimit` without
publishing partial rows/checks. The conservative error bound is an acceptance
guard; nominal Jacobians do not claim to differentiate it. No length, angular,
iteration, trial or deadline budget is enlarged.

Original [numerical fixtures](PROVENANCE.md#original-numerical-hinge-angular-stops)
check literal rays, both boundaries and release, six-role owner derivatives at
two finite-difference steps, repeated/null owners, descendant frames, common
gauge, fixed rejection, zero/full arcs, singular projections, direction cones
and connected gearing. These declarations confer no native topology authority.
Recorded executions belong in [validation](VALIDATION.md).

The separate [native six-role bridge](ASSEMBLY_HINGE_STOPS_NATIVE.md) adds fresh
proofs and independent support measurement. The separate
[saved extension](ASSEMBLY_HINGE_STOPS.md) adds declaration, repair and
worker/editor lifecycle with its own evidence, including one original local-Z
pointer stop/release case. Externally evidenced angular policies and broader
axis/interval/pointer combinations remain separate work.
This prerequisite does not close the assembly scope or permit the full demo.
