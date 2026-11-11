# Current native profile references

The separate [numerical profile-center solver](ASSEMBLY_PROFILE_CENTER_SOLVER.md)
consumes explicit numerical declarations. This current-reference layer does not
yet construct those constraints or authorize a saved relationship.

The later [material-direction layer](ASSEMBLY_PROFILE_MATERIAL_AXES.md) adds a
separate joint face/boundary-edge proof and independent physical target checks.
It leaves this face-only witness and the older saved mate purposes unchanged.

This layer connects the [bounded profile observations](ASSEMBLY_PROFILE_CENTERS.md)
to current assembly face identities and a standalone read-only pair measurement.
It does not add a saved profile mate, solver equation, worker command, editor
tool or Apply capability.

## Identity and purpose

`validateAssemblyProfileFaceSelection` accepts exactly `component`, `body` and
`face`. Both source identifiers must agree when a body is explicit. The common
component/body/face syntax validator provides no geometric authority. A pair
contains exactly `first` and `second`, preserving order. Executable fields,
inherited data, unknown fields and malformed paths reject before native queries.

`AssemblyGeometrySnapshot.resolveProfileFaceSelection` requires an active part
occurrence in the stated assembly scope, with the exact current definition
revision and body/face identity. It queries `CadEngine.inspectCurrentProfileSupport`
against the existing current native catalog and inspection epoch. An explicit
body cannot be replaced by the aggregate or by another body's similarly named
face. Hidden occurrences remain document references; suppressed occurrences,
including those under a suppressed ancestor, are unavailable.

Every successful query issues a deeply frozen `AssemblyProfileWitness`. Its
private object identity belongs to one live snapshot and one complete validated
document signature. Clones, display metadata, another snapshot's observation and
old document contents do not authenticate it. Its separate proof map cannot be
consumed by existing plane/axis, point or saved-mate witness assertions.

The observation retains its original local profile and its declared world pose.
World rectangles transform their center, corners, normal and boundary axes;
world disks transform center/normal and retain the radius without inventing a
roll axis. The world uncertainty includes composition arithmetic. The local
uncertainty remains separate. Private placement arithmetic retains the sum of
original translation magnitudes and path depth, including cancelling chains.

## Fresh pair measurement

`measureAssemblyProfileReferences` validates the request, scope and numerical
resolution before resolving either role. Each call queries both faces freshly,
including repeated roles or reused source geometry. After composing and measuring,
it checks both private witnesses against the original live document again.
Document or engine changes during reentrant work prevent publication.

The calculation composes each local center directly relative to the first
placement's translation, keeping world-axis directions. It does not first add
large world coordinates and then subtract the resulting centers. The original
placement magnitudes, path depth and local-center lever arm remain in the
first-order uncertainty estimate. Cancellation therefore does not turn an
unresolved original placement into an accurately measured small difference.

The report uses the independent ordered-center API: signed first-normal axial
displacement, transverse displacement and norm, center distance, and both normal
alignment angles. Units are millimeters and radians. It identifies the two actual
profile kinds and occurrence paths. Measuring a rectangle/disk pair does not
admit it as a compatible saved relationship. No offset/flip policy, rectangular
roll correspondence, constraint satisfaction or degrees of freedom are inferred.

Defaults are `1e-6 mm` length resolution and `1e-8 rad` angular resolution. An
`ok` result admits the estimated numerical resolution only. `precisionLimit`
from relative composition or the independent measurement retains the borrowed
snapshot. An unresolved native extraction rejects instead; it cannot publish a
partial first/second report. Requested bands are never widened to hide error.
These estimates are not formal interval or physical metrology certificates.

## Lifetime and remaining integration

Malformed request/policy/scope declarations reject before native queries and
preserve the borrowed snapshot. A structurally valid but unavailable native
identity enters resolution: pair-operation failure disposes the snapshot.
Native query and release failures also close it, and cleanup failures remain
fatal. The direct single-face resolver preserves its snapshot for preflight
selection/occurrence rejection, but closes it after a failure inside native
extraction, composition or final currentness validation. Successful callers
retain responsibility for disposal.

Original native/pure cases and independent coordinates are listed in
[provenance](PROVENANCE.md#current-profile-reference-fixtures). Programmatic
reference measurement is distinct from editor interaction and saved intent.
Numerical mate equations, explicit shape/alignment/orientation policy, saved
schema and repair, worker/session capability, authoring, history and saved
reopening remain separate work. No complete assembly-demo or platform claim
follows from this prerequisite; see actual [validation](VALIDATION.md).
