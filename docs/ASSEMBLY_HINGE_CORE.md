# Revolute hinge numerical and native prerequisite

This layer describes an explicitly bounded, unlimited revolute joint. It adds
numerical equations and standalone current-native resolution and measurement.
The separate [saved hinge integration](ASSEMBLY_HINGE.md) connects these
prerequisites to document intent, editor, private worker preview/Apply and
reference repair. The separate [numerical angular-stop extension](ASSEMBLY_HINGE_STOPS_NUMERIC.md)
adds two material plane roles and explicit directed intervals. Its
[standalone native bridge](ASSEMBLY_HINGE_STOPS_NATIVE.md) adds current proofs
and independent measurement. Saved/editor angular-stop integration and broader
assembly/demo acceptance remain open.
These standalone APIs themselves grant no publication authority.

## Four ordered roles and actual owners

`RigidHingeConstraint` contains two ordered `axis` endpoints, two ordered
`axial` endpoints and an `aligned` or `opposed` axis relationship. Axes use
analytic line or cylinder supports; axial endpoints use planes. Plane normal
signs do not choose a roll or change the axis alignment.

Each axis and corresponding axial plane must belong to the same effective
rigid owner. Their local frames and descendant component paths may differ.
Repeated owners, fixed owners and null fixed-scope roles retain their actual
incidence; they do not acquire artificial independent degrees of freedom.

An axial plane must be perpendicular to its own axis, within a structural
`1e-12` rad threshold. This gate is independent of the requested residual band.
The implementation does not snap an oblique plane to an axial one. Coaxial
axes plus coincident radial planes can leave translation rather than rotation;
one remaining degree of freedom alone is insufficient evidence of a hinge.

The native request parser accepts explicit cylinder-derived face axes or
actual LINE edges, and planar faces or declared principal planes. Current
topology, body membership, source revision and purpose must resolve in the
native snapshot. Equal coordinates or a detached reference label are not proof.

`scopePath` selects a reference context in the supplied complete document.
The native bridge uses `componentPath[0]` as its actual rigid owner and
recomposes the descendant frame from declarations below that owner. Selecting
a nested context does not promote its children into independently moving
bodies. A separate local definition solve needs its own actual scoped document.

## Numerical equations and rank

The chart has three angular-vector rows, two transverse-position rows and one
axial-separation row. The angular vector is expressed in the first axis's
material frame and retains the derivative of that frame. Its three components
have a two-dimensional image in a regular configuration. The solver computes
rank from the actual assembled Jacobian; it does not prescribe rank five or
one remaining degree of freedom for all incidence patterns.

The intended regular case constrains coaxiality and zero axial separation,
while allowing relative spin. The axial scalar uses the first axis direction;
the structural per-owner plane qualification prevents this scalar from
accepting unrelated radial geometry. Signed antipodal axis configurations
need bounded initialization before their local angular chart can be used.

Numerical declarations may carry four separate position and direction error
records, in axis-0, axis-1, axial-0, axial-1 order. Native topology tolerance
is included in each declared total position allowance; an explicit allowance
smaller than its support tolerance rejects rather than erasing that envelope.
Topology tolerance does not become angular metrology. Formal endpoint incidence, current rigid
owners, length conditioning and left-retraction derivatives remain explicit.

## Native lifetime and independent measurement

`resolveAssemblyHingeReferences` completes four current queries before issuing
a frozen resolution tied privately to its snapshot. The public assertion
checks all four witnesses against the unchanged document and live snapshot.
Copies, another snapshot, changed documents and disposed snapshots reject.
Valid resolution failures dispose the borrowed snapshot, including failure of
the fourth query; cleanup failures remain visible. Malformed request syntax
fails before querying.

`buildAssemblyHingeConstraint` produces a strict detached numerical copy from
the current witnesses. That copy confers no document, preview or Apply authority.
Original placement-chain magnitudes and depths are retained before cancellation.
Large intermediate transforms cannot gain precision merely because their final
coordinates are small.

`measureAssemblyHingeReferences` independently queries all four references
again. It measures the physical signed axis angle, transverse anchor defect,
axial offset and each axis/plane qualification. It does not reuse the solver's
rows, rank, solved midpoint or numerical constraint as its geometric oracle.
Changed candidate placements require a fresh snapshot.

Default bands are `1e-6` mm and `1e-8` rad. Requested bands must be finite and
positive, with the angular band below pi/2. Conservative first-order position
and direction allowances remain separate from measured residuals. The native
comparison requires residual plus retained allowance to fit the band; it never
widens the band. Insufficient precision, including a nominally fitting residual
whose allowance cannot fit, returns `precisionLimit`. These arithmetic accounts
are not calibrated physical metrology or a formal interval certificate.

An `ok` report still needs `satisfied: true`. `qualifiedRotation` identifies the
admitted axial support geometry; it does not certify a global degree count,
continuous trajectory, trimmed-face overlap, collision freedom or compatibility
with another application's selection policies. All reports are `supportOnly`.

## Evidence boundary

The original drilled-leaf recipe and literal mass, bound and eccentric-point
oracles are described in [provenance](PROVENANCE.md#original-two-leaf-unlimited-hinge-control).
The control uses the existing saved concentric and coincident primitives;
its private Apply/motion lifecycle is separate from this new numerical family.
Neither that control nor standalone hinge measurement alone establishes the
separate saved workflow or its [angular-stop extension](ASSEMBLY_HINGE_STOPS.md),
full assembly readiness or a platform
other than an explicitly recorded execution. Actual check results belong in
[validation](VALIDATION.md).
