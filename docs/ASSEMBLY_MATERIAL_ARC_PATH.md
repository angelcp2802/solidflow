# Material origins on trimmed circular paths

This layer authenticates an explicit material endpoint of a current open
circular edge and evaluates its finite trim from that origin. It is a
prerequisite for curved Path constraints. It adds no saved mate, solver family,
editor command, worker message or Apply capability. External Path policies for
Free position, distance/percentage, orientation and complete circles remain
separate requirements.

## Selection and native incidence

`AssemblyArcPathSelection` names an exact component definition/revision, body,
edge and `startVertex`. Its strict parser accepts own data fields only. An
explicit-body source cannot be replaced by its aggregate or another body's
identical geometry. The vertex and edge must share their actual current body
and producer.

`observeAssemblyArcPath` requires an actual valid circular trim with exactly
two distinct native endpoint vertices. `IsSame` authenticates the selected
vertex; coordinates do not. Native vertex parameters must identify the exact
first and last trim parameters. The chosen endpoint determines the direction
toward the other endpoint, independently of topology traversal or circle phase.
LINE, ellipses, nonincident/foreign vertices, closed circles and ambiguous native
parameters reject. A closed seam is not assigned a direction or retained by
guessing from an edge key.

`CadEngine.inspectCurrentArcPath` and `inspectCurrentArcPathEvaluation` jointly
query current native edge and vertex catalogs. Source/body identity, rebuild
epoch and retained catalogs must remain unchanged through the operation.
The existing LINE material-origin purpose remains separate.

## Finite coordinates and world precision

`evaluateAssemblyArcPath` and the snapshot evaluation accept the existing
explicit native `parameter` or directed `arc-length` coordinate. The latter
lies between zero and the measured trim length. Raw native parameter phase
is retained verbatim; it is not a normalized fraction. There is no clamping,
nearest-point search, extrapolation or periodic wrapping. These geometric
queries do not establish a saved Distance/Percentage mate policy.

The native point, unit tangent and original curve data are detached values.
The default requested bands remain `1e-6 mm` and `1e-8 rad`; inadequate
resolution raises a precision error rather than widening them. The finite
curve observer's native tolerance and arithmetic limits still apply; they are
numerical guards, not calibrated physical metrology or a formal interval proof.

World composition retains the original placement-chain translation magnitudes
and depth before cancellation. Points and circle center include positional
composition error. Radius and metric length are invariant under rigid placement;
translation does not become a direction error. Rotated normal, X direction and
tangent retain their angular composition budget. An interior evaluation keeps
its own point/tangent errors, which may exceed the endpoint observation's.
Both observation and evaluation must fit the requested bands.

The additional [current-native circular bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md)
retains a proper material radial/tangent/normal frame and separate center,
radius, frame and sweep arithmetic. Evaluated native D1 points/tangents retain
their own arithmetic fields. This declared Float64 reference model is separate
from the existing topology-inclusive `precision` fields. Actual endpoint and D1
data must corroborate the same analytic circle within the arithmetic guards;
topology tolerance cannot hide an incoherent circle. Neither model calibrates
accuracy against an intended physical part.

## Snapshot purpose and lifetime

`AssemblyGeometrySnapshot.resolveArcPathSelection` and
`evaluateArcPathSelection` issue frozen `arc-path` witnesses with local/world
curves and, when requested, evaluations. A separate private registry binds each
witness to its issuing live snapshot and unchanged document. The associated
`assemblyArcPathPlacementArithmetic` query authenticates that same purpose.
Copied values, old documents, foreign/disposed snapshots and generic bounded
curve or LINE witnesses cannot substitute for it. It is not admitted through
saved-mate authentication.

Malformed declarations fail before querying native geometry and do not consume
the session. A failure after valid native querying closes the borrowed snapshot
and withholds every old proof. Temporary native adaptors and handles retain
owned cleanup; release failures remain failures.

## Original evidence and remaining integration

The [original sector fixture](PROVENANCE.md#material-circular-arc-origin-fixtures)
has center `(3,-2)`, radius 2 mm, a quarter-circle boundary and depth 4 mm. The
top arc joins `(5,-2,4)` and `(3,0,4)`, with length pi mm. Its half-length point
is `(3+sqrt(2),-2+sqrt(2),4)`; from the first endpoint its tangent there is
`(-1/sqrt(2),1/sqrt(2),0)`. These literal expectations are independent of native
parameter phase and the implementation's evaluator.

Tests cover both endpoints, reversed topology, major and crossing-period trims, proper 3D nested
poses, reused occurrences, current source/body incidence, precision and proof
lifetime. The original solid's volume, area and bounds are checked separately
from path observations. Actual execution belongs in [validation](VALIDATION.md).

The separate [numerical circular-path layer](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md)
adds explicit domains, simultaneous numerical incidence and changing-tangent
Follow/UP. The separate current-native bridge authenticates inputs for its
declared analytic model and independently verifies candidate poses; neither
layer authenticates saved intent or Apply. The subsequent
[saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) adds explicit intent,
repairs and editor lifecycle for its bounded scope. Established external
coordinate/domain policies, broader lifecycle acceptance, complete-circle
origin/direction, multi-edge continuity, general convergence and the full
assembly/demo gate are not established by this prerequisite.
