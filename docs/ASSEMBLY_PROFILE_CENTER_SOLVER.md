# Numerical profile-center constraints

This numerical family follows the [bounded profile observations](ASSEMBLY_PROFILE_CENTERS.md)
and [current-reference measurements](ASSEMBLY_PROFILE_REFERENCES.md). This layer adds
equations and a bounded rigid solve; its detached numerical inputs alone add no
native-reference or Apply authority. The separate [saved/native/editor integration](ASSEMBLY_PROFILE_CENTER_MATES.md)
now connects admitted current profiles to saved declarations and the worker.
Neither layer establishes the complete assembly demo.

## Explicit geometry and choices

`RigidProfileCenterConstraint` has two ordered `RigidProfileCenterEndpoint`
records, separate from the older analytic-support families. Each endpoint has
an owner ID or null fixed scope, a local rigid frame and a circle or rectangle
profile. Both kinds require a center, unit normal and explicit nonnegative
`positionErrorMm` and `normalErrorRad`. Rectangles also require a unit,
perpendicular `xDirection` and explicit `xDirectionErrorRad`. Directions must
be unit/perpendicular within `1e-12`. The detached input copy rejects unknown
fields, missing budgets, sparse vectors and accessor fields. A plane or cylinder
support cannot substitute for a profile.

For first center/normal `cA,nA` and second center/normal `cB,nB`, the equations are:

- `cB - cA - offsetMm*nA = 0`, including all three position components.
- `nB = s*nA`, with `s=+1` for aligned and `s=-1` for opposed.
- With rectangular orientation, `uB = cos(q*pi/2)*uA + sin(q*pi/2)*(nA cross uA)`.

The signed offset always belongs to the first normal. Opposed alignment changes
the second normal target, without changing that offset or quarter-turn rule.
Orientation is explicitly `{mode:'free'}` or
`{mode:'rectangle',quarterTurns:0|1|2|3}`. The latter requires two rectangles.
The free mathematical family accepts mixed circle/rectangle declarations; this
does not admit a native shape combination or authenticate a material roll axis.
Rectangle directions and their chosen correspondence must be supplied by a
future purpose-specific adapter. Boundary traversal alone is insufficient.

## Derivatives, physical admission and rank

Centers are composed directly relative to the problem's fixed conditioning
origin and length scale. Original placement magnitudes and declared errors are
retained before cancellation. The pure comparison expresses vector defects in
the first endpoint frame and includes its moving-frame derivative and the
first normal's offset lever arm. Two formal six-column role blocks remain
available; physical blocks sum repeated owner IDs once and omit null owners.

Position contributes three normalized length rows. Normal alignment contributes
three angular rows whose norm is the actual `atan2` angle; rectangular orientation
adds three more. A geodesic chord scaling and its derivative keep angular units
in radians. Final checks independently use the full position norm and the larger
of the normal and rectangular angles, preventing componentwise false acceptance.
Uncertainty never widens the requested bands. Unresolved arithmetic produces
`precisionLimit`, with no published pose.

Six or nine rows are capacity counts, not a rank declaration. Rank and local
degrees of freedom come from the existing factorization at the accepted pose.
The original anchored cases give rank five for free circular spin and rank six
for explicitly oriented rectangles. Two moving owners retain common rigid gauge.
These cases do not establish global convergence, every singular configuration
or native degrees of freedom.

An antipodal angular chart is not evaluated as a regular derivative. A bounded
orientation seed may align normals and the explicit rectangular direction before
the combined equations are checked. A circle's deterministic transverse seed
does not add a roll equation. Seeds neither move fixed owners nor publish poses;
iteration/seed limits, conflicting constraints and numerical failures preserve
atomic failure. The existing 256-row group ceiling remains unchanged.

The [original fixtures](PROVENANCE.md#numerical-profile-center-solver-fixtures)
use literal centers/bases and finite differences independently of the production
helper. Actual command results and their scope belong in [validation](VALIDATION.md).
The separate [material-direction and physical-check layer](ASSEMBLY_PROFILE_MATERIAL_AXES.md)
now authenticates an explicitly selected rectangular boundary direction and
checks current physical targets independently. The [saved family](ASSEMBLY_PROFILE_CENTER_MATES.md)
connects these proofs to native solve and editor lifecycle under explicit project
policies. External classification/default orientation compatibility, circle roll
locking and broader mixed-profile admission remain separate work.
