# Current native circular-path resolution and verification

This layer connects [current material arc references](ASSEMBLY_MATERIAL_ARC_PATH.md)
to the explicit [numerical circular-path constraint](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md).
It issues numerical input from current native geometry and independently measures
a candidate document. It adds no saved mate, worker publication capability,
editor, Apply, history or reopening workflow. “Native” here means the project's
current CAD runtime; it does not establish compatibility with a reference
application or its Path policies.

## Explicit request and material frame

`AssemblyCircularPathReferenceRequest` contains a material point reference, an
`AssemblyArcPathSelection`, position and orientation. The strict parser accepts
exact own data fields, without invoking accessors. Position is either Free with
an explicit `trim` or `support-circle` domain, or a nonnegative `distanceMm`
coordinate. Current geometry must also admit that coordinate within its actual
finite length. There is no percentage, endpoint clamp, periodic wrapping or
implicit external-domain policy.

The path requires an open circular edge and its exact current native endpoint.
Body, producer, source revision and endpoint incidence retain the material arc
contract. Native identity is not inferred from equal coordinates. LINE and
generic bounded-curve witnesses cannot stand in for this purpose.

The selected endpoint defines a proper material frame: radial direction from
the center to that start, forward tangent toward the other trim endpoint, and
their cross-product normal. Choosing the other endpoint reverses travel through
the trim; the material normal can then oppose the native circle parameter
normal. Reversing edge traversal alone does not change the selected origin.
The full frame uses native circle axes and their raw defects before
normalization. Actual D1 at the chosen start corroborates its tangent; one
tangent alone does not certify all three frame directions.

Optional Follow aligns a signed canonical component axis with the changing
tangent. Optional UP requires Follow, a different component axis and an actual
current material planar face as guide. Follow and UP have separate reversals.
Principal planes and fabricated circle axes are not material guide substitutes.

## Numerical reference model and separate error accounts

The issued resolution and independent measurement identify their model as
`current-native-analytic-float64`. The stored GPPoint tuple and current analytic
circle center, radius, axes and trim parameters are the numerical reference
data. The allowances account for their finite arithmetic and composition.
They are not calibrated physical metrology, a guarantee about an unknown
intended shape, or a formal IEEE interval proof.

Native topology tolerance remains visible as `topologyTolerancesMm.point` and
`.path`. It supports the existing topology/incidence observation contract. It
does not become a point-coordinate uncertainty ball, radius error, angular
error or phase error in this separate analytic query family. This distinction
does not loosen the older bounded-curve observer's admission checks.

Center, radius, frame and sweep arithmetic remain separate. Raw unit and
orthogonality defects, accepted normalization, native parameter magnitudes and
subtraction, and actual D1 tangent discrepancies contribute to their relevant
budgets. Radius uncertainty must exclude zero and sweep uncertainty must retain
a proper open arc strictly between zero and `2*pi`.

The center allowance is derived from the analytic center data. A discrepancy
between a native endpoint or D1 point and that circle must fit an explicit
analytic coherence budget; it is not absorbed into the center allowance merely
because it fits topology tolerance. Interior D1 evaluation has its own
`arithmetic.positionMm` and `arithmetic.tangentRad`, separate from both the
material observation and the generic topology-containing precision envelope.
A changed circle, failed D1 query or exhausted evaluation budget rejects.

Default requested bands are `1e-6 mm` and `1e-8 rad`. Nominal physical residual
plus retained error must fit the requested band; uncertainty never widens it.
Free phase requires a radial coefficient-error ball that excludes zero. The
trim complement cut and an unresolved projected UP direction cannot acquire a
fabricated tangent, phase or roll. Unavailable finite error fields are reported
as null rather than nonfinite DTO values.

## Real rigid owners and issued-reference lifetime

`resolveAssemblyCircularPathReferences(snapshot, document, request, options,
scopePath)` returns a frozen `circular-path-resolution`, including current
point/path/optional UP proofs, full component paths, reference-model metadata
and a readonly `RigidCircularPathConstraint`.

Each selected part belongs to its actual document-root rigid owner:
`componentPath[0]`. The nested endpoint frame is reconstructed from source
declarations below that root. `scopePath` selects reference context; it does
not promote selected descendants into independently moving bodies. Reused and
shared roots retain their actual namespaces and incidence in every role. This
API requires actual material occurrences, including for an UP guide; it does
not invent a null static role.

Position composition charges the original placement-chain magnitudes and depth
before cancellation. A small final world coordinate does not erase large
intermediate translations. Radius and metric length are rigid invariants;
translation does not become angular metrology. Direction and position arithmetic
remain separately accounted for.

A private issuance registry binds the resolution to its live snapshot and
unchanged document. `assertAssemblyCircularPathResolution` checks the current
point, material-arc and optional guide proofs. Copies, wrong-purpose witnesses,
stale documents and disposed snapshots reject. A detached strict numerical copy
can be supplied to the numerical solver; that copy gains no native-reference,
saved-mate or Apply authority.

Malformed request, scope or band data fail before native querying and preserve
the borrowed snapshot. A failure during valid native resolution or verification
disposes it and invalidates prior proofs. Native cleanup failure remains an
error. A returned `precisionLimit` measurement is a bounded unsatisfied result,
not an inconsistency certificate or a thrown native-query failure.

## Independent fresh candidate verification

`evaluateAssemblyCircularPathReferences` re-queries the current point, material
arc and optional plane guide. It does not consume the issued numerical
constraint, solver residuals or a copied resolution as its geometric oracle.
Positions are composed relative to the point owner's placement while retaining
the original arithmetic terms.

A fixed coordinate is sent unchanged to actual finite native D1 evaluation.
Its current point/tangent and separate evaluation allowances enter the final
check. An exterior coordinate rejects even when it differs from the endpoint
by only an ULP. Free position instead measures the explicitly declared analytic
circle or finite trim and its changing tangent. It fabricates no finite native
D1 query beyond the trim. Trim margins, physical distance, Follow and projected
UP defects retain separate nominal and error terms.

The result includes actual component paths, echoed intent, coordinate and
target coordinate, radius/sweep/length, residuals, requested tolerances and
precision metadata. It returns `status: 'ok' | 'precisionLimit'` and `satisfied`;
`ok` alone does not mean satisfied. It always declares `verificationOnly: true`
and `compatibilityAuthority: false`. This report cannot publish a solved
document or authenticate an Apply operation.

## Original checks and remaining boundary

The [original native-resolution fixtures](PROVENANCE.md#current-native-circular-path-resolution-fixtures)
reuse the tracked radius-2 quarter sector. Independent Cartesian targets,
native vertex differences, solid volume/area and fixed bounds check the current
resolved numerical input and freshly queried candidates. Cases include both
material origins, fixed start/mid/end, Free Follow, third-owner UP, nested Rx90
frames, reused Rz90/Rx90 scopes, and local endpoint-to-interior projection.
The projection targets the material point frame, not the component origin, and
makes no global nearest-point or unique Free-pose claim.

Separate arithmetic and verifier controls cover topology-envelope separation,
raw frame defects, current D1 coherence, large cancelled placements, near-band
refusal, the circle axis and complement cut. Fault tests forward actual native
geometry or inject an explicit failure/budget change; they do not provide
successful fake CAD supports. Copied/stale proofs, executable preflight input,
reentrant document changes and a displaced candidate must reject or remain
unsatisfied as appropriate.

Executed commands and global results belong in [validation](VALIDATION.md).
These cases do not establish a saved curved-path family, source repair,
worker/editor lifecycle, renderer interaction, closed-circle material origin,
multi-edge continuity, general convergence, platform support or completion of
the assembly/demo gate.

The subsequent [saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) supplies
explicit declaration roles, scoped adaptation, private worker authority, repair
and editor lifecycle. That integration uses these current proofs and fresh
independent verification; detached reports retain no publication capability.
