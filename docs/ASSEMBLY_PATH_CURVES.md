# Bounded assembly path curves

This layer observes and evaluates a current finite native edge. It is a prerequisite
for future path constraints, not a saved Path mate, rigid solver family, editor,
worker command or Apply capability. No external application's parameter or
orientation policy is established by these APIs.

## Current curve contract

`observeAssemblyPathCurve` accepts an actual valid bounded LINE or circular edge.
It retains the finite increasing native parameter domain, endpoints, length,
parameter speed, native tolerance and closed/periodic flags. Circular observations
also retain center, radius and the native normal/X frame. Trimmed arcs and a full
single-period circle are distinct; a full circle retains its observed seam.
Unsupported curves, ambiguous endpoint topology and inconsistent native geometry
are rejected rather than approximated or fitted.

The caller supplies `sense: 1 | -1`. This chooses the directed start and tangent
relative to increasing native parameters; reversing topology traversal does not
silently change that choice. It does not authenticate a material start or seam
across a producer rebuild. An edge reference alone promises no persisted path
origin.

`evaluateAssemblyPathCurve` accepts either a raw native `parameter` within that
trim or an `arc-length` coordinate `distanceMm` between zero and the measured
length. It returns the native parameter, directed arc length, point and unit
tangent. Native parameters are neither normalized fractions nor generally arc
length: circular parameters and linear parameters have different scaling.
There is no extrapolation, clamping, periodic wrapping, nearest-point search or
implicit percentage conversion.

## Resolution and lifetime

Requested `lengthToleranceMm` and `angleToleranceRad` default to `1e-6 mm` and
`1e-8 rad`. They must be positive finite data; the angular band must be below pi.
The query tracks native edge/vertex topology tolerances and floating arithmetic
estimates for position, length and tangent. Inadequate resolution raises
`AssemblyPathCurvePrecisionError`; requested bands are never widened internally.
These estimates are conservative numerical guards, not calibrated physical
angular metrology or a formal worst-case interval certificate. A topology
tolerance does not become a measured physical angular uncertainty.

Temporary native adaptors, topology handles and math objects have bounded owned
lifetimes. Results contain detached numerical data, not borrowed native handles.
A cleanup failure remains an error rather than a successful observation.

## Assembly snapshot purpose

`AssemblyGeometrySnapshot.resolvePathCurveSelection` and
`evaluatePathCurveSelection` require an exact current component definition,
body/edge producer and explicit sense. Strict declaration parsers reject unknown
fields, accessors and malformed numerical options before querying geometry.
Explicit-body and legacy-body selection remain separate; a multibody result
requires its current body identity.

Each successful call queries the current native bounded edge. Its frozen witness
contains local and world curve data, and evaluation data when requested. World
composition retains original placement-chain magnitudes and depth before
cancellation; composed position, length and tangent budgets must still fit the
requested bands. A large or cancelled placement chain cannot gain authority from
its small final coordinates.

A private purpose-specific registry binds the witness to its live snapshot and
unchanged document. Copied DTOs, foreign snapshots, stale documents and disposed
snapshots cannot authenticate it. A Path witness cannot substitute for an old
infinite LINE, mate, point or profile witness. A valid native-query failure closes
the borrowed snapshot; malformed preflight data does not consume it.

## Evidence and remaining work

Original public tests exercise finite 3-4-5 and oblique lines, a radius-2 quarter
circle, a shifted full-circle seam, explicit senses, topology reversal, trim
rejection, uncertainty, cleanup and native failure. Snapshot tests cover current
body/producer identity, repeated and nested occurrences, world composition,
precision rejection and private proof lifetime. See [fixture provenance](PROVENANCE.md).
Tests use literal Cartesian and analytic expectations, not a second call to the
production evaluator as their oracle.

This contract does not establish multi-edge path continuity, persistent path
origins, a vertex-to-path residual, pitch/yaw/roll choices, saved document roles,
source repair, solver integration or renderer authoring. Those remain separate
implementation and acceptance gates. Source-specific command results and platform
claims belong in [validation](VALIDATION.md), not in this API description.

The subsequent [material LINE mate](ASSEMBLY_LINE_PATH.md) supplies a separate
compound material origin, vertex residual, saved intent and editor lifecycle
for straight edges with optional component-axis Follow and either free roll or
projected UP from an explicit material planar face. Its
explicit Free position extension policy
does not change this observer's finite native query domain. The broader curve,
continuity, seam and orientation gates above still apply.

The separate [material circular-arc origin](ASSEMBLY_MATERIAL_ARC_PATH.md)
authenticates an explicit endpoint of an open circular trim and issues its own
current snapshot proof. It adds no saved curved-path mate or closed-circle seam
policy and does not change this observer's coordinate or lifetime contract.

Circle observations also expose separate analytic arithmetic fields for the
[current-native circular bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md). Raw frame
norm and orthogonality defects are retained before normalization. These fields
describe computations on stored native Float64 data; they do not reinterpret
the existing topology-inclusive precision fields as calibrated radius or angle
metrology. World composition copies the fields, charging position and frame
while retaining rigid-invariant radius and sweep.
