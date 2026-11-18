# Bounded profile observations and center measurements

This prerequisite recognizes a bounded planar rectangle or disk from a borrowed
native face and measures two explicit centers and normals. It adds no saved mate,
reference proof, solver constraint, worker command, editor tool or Apply authority.
The observations are detached data; callers must independently establish current
document, owner, placement and selected-face identity before using them in a
future assembly operation.

The separate [current-reference measurement](ASSEMBLY_PROFILE_REFERENCES.md)
now validates selected native faces through a live assembly snapshot, issues
private profile-purpose witnesses and measures a fresh pair. It consumes the
low-level observations described here without changing their detached nature.

The later [numerical profile-center family](ASSEMBLY_PROFILE_CENTER_SOLVER.md)
adds explicit equations and rigid solving separately. It does not change this
extractor's detached observations or grant saved/native relationship authority.

## Complete native boundaries

`extractAssemblyProfileSupport` in `kernel.assembly-profile-supports.ts` requires
a valid planar face with one closed wire and no holes. It caps topology traversal
before publishing native wrappers and rejects repeated boundary edges.

A rectangle requires four native LINE edges and four distinct topology vertices.
The connected boundary must close without revisiting a corner. Adjacent sides
are perpendicular, all sides lie in the face plane, opposite side vectors cancel,
and the two diagonal midpoints agree within the explicit recognition checks.
The directional classification uses the smaller of the requested angular band
and `1e-10` rad; it does not turn a linear topology tolerance into physical
angular metrology.
The center comes from those corners. Surface parameter origins, bounding-box
centers and mesh fitting supply no center or profile identity.

The rectangle observation includes its four corners, two boundary axes and two
side lengths. These follow an observed traversal; they are not persistent
semantic directions or a chosen roll correspondence. A square remains a square
with two equivalent side lengths. No unique long axis or ninety-degree branch
is invented.

A disk requires one closed native analytic circular edge with a complete
two-pi parameter span. Its center and radius come from the native circle. A
circle provides no material roll axis, so the disk observation has no rectangle
axes. Annuli, multiple wires, partial circular caps, ellipses, rounded contours,
nonrectangular polygons and nonplanar faces reject rather than being fitted to an
accepted shape. Segmented circular boundaries are outside this initial scope.

The borrowed face remains owned by its caller. Temporary wrappers are released
on success and failure. A release failure is fatal and prevents publication of
an otherwise computed observation.

## Ordered measurements

`measureOrderedProfileCenters` in `assemblyProfileCenterMeasurement.ts` accepts
two center/normal observations in one common coordinate frame and an explicit
numerical resolution. Lengths use millimeters and angles use radians.

For centers `a`, `b` and the first oriented unit normal `n`, it reports:

- The full displacement `d = b - a` and its norm.
- Signed axial displacement `h = n · d`.
- Transverse displacement `t = d - h n` and its norm.
- Both aligned and opposed normal angles using `atan2` of cross-product
  magnitude and signed dot product.

The sign belongs to the first normal and the ordered pair. Reversing the pair
does not necessarily negate the axial result when the normals differ. The API
does not interpret an offset parameter or flip control. It also does not infer
shape compatibility, roll, owner freedom, contact, constraint rank or a target
value. Mixed rectangle/disk observations can be measured without being admitted
as a relationship.

An `ok` result means that the calculation fits its requested numerical
resolution; it does not mean that two profiles satisfy a relation. For example,
an accurately resolved nonzero angle may exceed the requested angular resolution
and still be measured successfully. There is no `satisfied` flag.

## Precision and limits

Native extraction reports the maximum observed linear topology tolerance and
first-order position/normal arithmetic estimates. Rectangle boundary directions
are observations, not certified roll metrology. The pure measurement explicitly
accepts center and normal uncertainty, propagates the first normal's lever arm,
and retains absolute coordinate magnitudes before subtraction. Its estimates are
conservative first-order budgets, not formal interval certificates.

The extractor's default bands are `1e-6` mm and `1e-8` rad. The pure API requires
explicit finite positive length/angular resolutions, with angle below pi. Neither
operation enlarges a requested band to absorb uncertainty. Extraction rejects
unresolved geometry; the pure measurement returns `precisionLimit` for arithmetic
overflow, subnormal data or estimated error above the requested resolution.

Composing centers directly in a nearby common frame can avoid a needless large
world translation. The caller must still retain errors from the original
placement chain; changing frame cannot recover coordinates already rounded away.
No current snapshot or placement-chain proof is added by this prerequisite.

The original numerical and native fixtures are described in
[provenance](PROVENANCE.md#bounded-profile-center-fixtures). Source-specific
execution results belong in [validation](VALIDATION.md). Recognition and measured
centers alone do not establish a saved relationship, editor interaction, source
repair, history, saved reopening or complete assembly-demo readiness.
