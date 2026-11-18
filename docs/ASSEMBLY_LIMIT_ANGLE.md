# Principal direction-angle intervals

This dependent proposal adds an inclusive interval for the principal angle
between two authenticated directions. Implementation and source-specific
validation must be recorded separately in [VALIDATION.md](VALIDATION.md).
Authored cases, a configured CI command or this contract are not executed
acceptance. Full assembly acceptance and the demo remain open.

## Saved declaration and direction purposes

The distinct mate has `type: 'limit-angle'`, the explicit discriminator
`coordinate: 'principal-direction'`, `first` and `second` existing
`AssemblyGeometryReference` values, and `limits: { minimum, maximum }` in
degrees. Both bounds are finite and `0 <= minimum <= maximum <= 180`.
Equal bounds retain the declared interval. There is no saved alignment,
current angle, working set, multiplier, phase or winding counter.

Eligible directions are current plane normals, geometric cylindrical axes
and native LINE directions. All nine ordered pairs have the same direct
direction-angle interpretation. The parallel/perpendicular mixed-purpose
complement is not applied. A plane normal uses the actual surface derivatives
and face orientation; a cylinder uses its geometric parameter axis; an
undirected LINE retains the existing local canonical sign independent of edge
traversal. Spheres, surface-tangency purposes, circular/general curves and
inferred axes are ineligible. Exact scope, revision, source and body/reference
authentication remain required.

For placed unit directions `a,b`, the measured angle is
`alpha = atan2(norm(a cross b), a dot b)` in `[0, pi]`. Internally the margins
are `alpha-L` and `U-alpha` in radians. Swapping endpoints preserves both angle
and bounds. Reversing one direction maps an equivalent interval to
`[180-maximum, 180-minimum]`; reversing both preserves it. Selection and edits
never convert bounds automatically.

This angle does not measure spin about aligned axes or distinguish full turns.
The separate [directed circular stops](ASSEMBLY_DIRECTED_ANGLE_STOPS.md) use
three declared directions and a circular arc. Accumulated-turn stops require
their own continuous lifted coordinate and remain separate work. Explicit motion
requests still check their actual sampled path. For example, from Rx(-120°)
with principal bounds `[90,180]`, a +240° request visits an invalid angle even
though its final quaternion equals that of the admissible -120° request.
Sampled checks do not prove a continuous path or collision guarantee.

## Regular and endpoint geometry

At `0 < alpha < pi`, the derivative is
`dalpha = -(omegaA-omegaB) dot (a cross b) / norm(a cross b)`.
Translations and common rigid motion leave it unchanged. An isolated free
body retains bilateral rank zero and six bilateral DOF; active unilateral
bounds must be reported separately. A regular boundary has a halfspace cone
with lineality five; equal regular bounds have lineality five as well.
Neither working-set rank nor bilateral DOF alone measures feasible mobility.

At parallel or antiparallel directions this scalar derivative is undefined.
A zero cosine derivative must not imply convergence or unrestricted motion.
With `s=+1` at parallel and `s=-1` at antiparallel, the local relative-tilt
defect is `c=a-s*b` and its variation is
`K delta = s*(omegaA-omegaB) cross b`. The distance from that endpoint is
`2*asin(norm(c)/2)`. Endpoint strata require their actual tilt kernel/cone.

Domain bounds `L=0` and `U=pi` do not impose an artificial stop at their own
endpoint. `[0,180]` is tautological. Equal `[0,0]` or `[180,180]` forbids both
relative transverse tilts while allowing translation and axial spin; its
isolated fixed/free tangent kernel has dimension four, despite bilateral rank
zero. A principal interval creates no position constraint or axis guide.

Restoration from a violated endpoint must search admitted hard-nullspace
directions with all other active inequalities retained. Testing only separate
SVD basis directions is insufficient when a combined direction lies in a
narrow feasible cone. A first-order opening can be sought by constrained
least squares against both signs of the tilt-image basis. Every accepted
trial must improve the original nonlinear merit and respect existing
mechanical chart admission and unchanged budgets.

`K*N=0` is not an infeasibility certificate. Curved constrained mechanisms can
open at second order. Bounded manifold continuation/probes must retain the
second-order critical-cone conditions and original nonlinear checks. Search
exhaustion, uncertain rank or precision rejects without a candidate; none is
a global conflict proof. Required feasible parallel, antiparallel and curved
mechanical examples must pass before claiming this family accepted. No seed
jump, hidden angular zero, fixture target pose or budget increase supplies a
solution. Active and passive gear/screw/rack charts advance only on accepted
trials and roll back atomically on failure.

## Native evidence and editor

Fresh final native directions, not retained meshes or model residuals,
authenticate a successful result. Reports use explicit `angleDegrees`,
`limitsDegrees` and `angleToleranceRadians`, with the principal discriminator,
geometric activity, regular/parallel/antiparallel stratum and domain-bound
flags. Any reported directions are detached current world unit vectors with
their actual support kinds. Reports display evidence and grant no Apply
authority. The existing authenticated preview token remains required.

The editor must state principal-angle meaning and degree units, keep explicit
bounds during reference edits, distinguish strict destinations from projected
movement, and preserve identity, Cancel, history, suppression, deletion,
source repair and saved reopening. Screenshots, rendered components and real
worker/file interaction have separate evidence boundaries.

The original two-box fixture and analytical corner/normal expectations are
recorded in [PROVENANCE.md](PROVENANCE.md). Required acceptance includes both
endpoint strata, inward release, contradictory/redundant intervals, every
ordered direction purpose, floating/nested/reused scopes, actual fresh native
measurements, mechanical continuation, sampled invalid paths, transaction
rollback and source/history/file workflows. Other advanced mate families,
installed packages and platform acceptance remain separate work.
