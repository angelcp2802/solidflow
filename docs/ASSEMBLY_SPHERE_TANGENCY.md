# Spherical support tangency proposal

This dependent increment proposes three distinct geometric relations on
complete analytic supports. A complete sphere is compact; planes and cylinders
are unbounded. Ignoring a selected face's trim does not establish finite contact,
containment, rolling, no slip or absence of material overlap. Full tangent and
assembly acceptance remain open. Consult [validation](VALIDATION.md) for actual
source-specific results; this contract and authored tests alone imply no pass.

The preceding [original sphere construction gate](PROVENANCE.md#original-persisted-sphere-construction-gate)
verified one saved semicircle/Revolve as a native spherical face, with actual
reference/render catalogs and seam/pole behavior. It did not add sphere mates.

## Saved intent and compatibility

- `plane-sphere-tangent`: exactly one plane and one sphere-surface reference,
  either endpoint order, with `side: positive | negative` relative to the
  oriented plane normal.
- `sphere-sphere-tangent`: two sphere-surface references and
  `branch: {kind: external} | {kind: internal, larger: first | second}`.
- `cylinder-sphere-tangent`: exactly one cylinder-surface and one sphere-surface
  reference, either order, with the same explicit branch and larger-endpoint role.

The new sphere-surface reference contains the exact occurrence path, definition
revision, body state and face locator with `support: sphere-surface`. It stays
outside the old geometry-reference union. Existing plane/cylinder `tangent/side`,
both cylinder tangencies, axis references and old family validators retain their
meaning. A spherical face must not become a direction or arbitrary parametric
axis. Unknown/extra fields and invalid endpoint-purpose pairs reject.

No radius, surface frame, contact point, alignment, angular phase, material sense
or lift history is saved. Internal larger means the declared endpoint has the
strictly larger fresh radius. Do not apply absolute value, infer a new role or
silently swap it after source changes or endpoint edits. Radius arithmetic needs
finite representable sums/differences and the existing scale-sensitive precision
guard; this is not a new model of radius-measurement uncertainty.

## Native source authority

A dedicated current sphere inspector must authenticate exact identity and fresh
native `GeomAbs_Sphere` purpose, centre, positive radius, tolerance and radial
material sense. A separate private snapshot witness binds it to occurrence,
revision, body, face and current generation. Display data or copied/stale proof
cannot authenticate preview or Apply.

The native query owns every received adaptor, sphere, frame, centre and direction
wrapper before another allocating/fallible query. It validates face orientation,
finite values and an orthonormal nondegenerate native frame; all owners release
before a DTO escapes. Query, release, final scene or epoch replacement failure
withholds authority and preserves committed history. Independent native `D1`
away from UV poles checks oriented normals; production determinant arithmetic
does not supply its expected normal.

Let `ε` be native outward-material radial sense (`+1` or `−1`). It combines
actual face orientation with native parameter-frame handedness. Proper placement
preserves `ε` and radius while transforming the unique centre. Existing native
plane/cylinder support and `scene.support` remain unchanged. Separate optional
`sphereSurface` / `worldSphereSurface` display metadata contain spherical
geometry for the purpose-specific picker. They do not provide an axis or Apply
authority. The numeric sphere support is `{kind: sphere, point: centre, radius,
tolerance}`, with no axis or X direction.

## Equations and regular rank

All following lengths are physical millimetres for explanation. Implementations
use the existing solve origin and length scale, physical residual checks and
numerical rank policy. Endpoint points vary as `δp=δv+ω×p`, directions as
`δa=ω×a`. A sphere's centre is a unique point, including any local offset from
the component origin. Local plane/cylinder parameter origins are canonicalized
before world placement; a sphere centre is never projected onto an axis.

These three new families conservatively reject a requested precision they cannot
certify. A Float64 composition bound uses the normalized body-minus-origin,
local frame and support terms before cancellable sums, including unrotated
vector magnitudes. Normalized tolerance, radii and radius target must be positive
normal numbers. A nonzero placement or support term that normalizes to zero or
a subnormal also rejects as `precisionLimit`; no term or radius is floored.
This leaves ordinary geometry in a distant common solve frame admissible, but
does not claim arbitrary extreme-scale arithmetic. Native mapping additionally
retains the original occurrence-chain translation magnitudes and depth in
private live witness data; an excessive composition bound rejects before using
a rounded composed centre. Existing families keep their previous policies.

### Plane and sphere

For unit plane normal `n`, plane point `P`, sphere centre `S`, radius `r>0` and
signed side `σ=+1/−1`:

```text
e = n·(S−P) − σr
δe = δn·(S−P) + n·(δS−δP)
```

There is one length row and no sphere-axis angle. At a solution the complete
support tangent point is `S−σrn`; it is an analytical oracle, not a saved finite
contact report. Oriented support-normal dot sign is `−σεsphere`. A principal
plane has a declared normal, not a material-containment claim. A centre on the
plane is not a derivative singularity of this signed equation.

### Two spheres

For centres `S1,S2`, separation `w=S2−S1`, distance `D=|w|>0`, direction
`u=w/D`, and target `R=r1+r2` externally or the declared positive radius gap
internally:

```text
e = D−R
δe = u·(δS2−δS1)
```

External geometric normals oppose. Internal normals agree, with tangent point
`S1+r1u` when first is larger or `S1−r1u` when second is larger. Oriented
normal dot sign is `−ε1ε2` externally and `+ε1ε2` internally.

### Cylinder and sphere

For cylinder unit axis `a`, canonical axis point `C`, sphere centre `S`,
`w=S−C`, axial scalar `h=a·w`, radial vector `v=w−ah`, `D=|v|>0`, `u=v/D`
and the same declared sum/gap target:

```text
e = D−R
δv = δw−δa h−a(δa·w+a·δw)
δe = u·δv
```

No angular or axial-position constraint is added. At the axis foot `F=C+ah`,
the external tangent location is `F+rcu`. Internally it is `F+rcu` if the
cylinder is larger, and `F−rcu` if the sphere is larger. In the last case both
geometric radial directions are `−u`. Oriented normal dot sign remains
`−εcεs` externally and `+εcεs` internally. A larger sphere does not contain an
infinite cylinder; complete surfaces/materials may intersect away from this
local tangency.

Each regular relation between distinct owners has rank one: fixed/free local
DOF five, floating/floating DOF eleven including six common rigid gauge modes.
Same-owner and both-fixed cases have no free relative columns and need their
own physical/rank-zero checks. Common rigid twists must annihilate each full
Jacobian, including away from solution and with eccentric local centres.

Coincident-centre sphere pairs and zero radial separation in cylinder/sphere
are outside these regular distance charts. Equal/coincident supports and
contact-circle strata require separate contracts; do not square residuals,
invent a direction seed or switch family. Uncertain final rank still rejects.

## Reports, source changes and movement

Optional ephemeral `sphericalTangencies` reports contain kind, scope path,
mate ID, normal relation and `supportOnly: true`. Plane/sphere also reports
side and sphere radial material sense; the other two report branch and both
endpoint radial senses. Reports come from fresh final native sources and are
detached/frozen/copied across the existing worker boundary. They are not saved
or renderer-owned authority.

Current source revision/purpose, exact manual repair, suppression, history,
Cancel, authenticated Apply and save/reopen retain the existing atomic rules.
Revised radii or reversed declared larger roles must be evaluated afresh.
No nearest-sphere repair, cached nominal radius or hidden editor identity is
introduced. UI editing keeps the selected family locked until the editor closes.
Sphere selection uses actual mesh/native metadata with full occurrence context.

These geometric relations create no lifted winding map. Active/passive gear,
screw and rack state must retain the existing no-reseed and rollback rules.
No new constant-rotation translation allowlist is granted. Distance loci for
sphere/sphere and cylinder/sphere are nonconvex; accepted endpoints do not
certify the intervening path. Motion remains sampled under unchanged budgets
and stations, without continuous contact or collision guarantees.

## Original evidence and remaining work

Three original unmated documents and their independent equations/metrics are
listed in [provenance](PROVENANCE.md#original-spherical-tangency-fixtures).
The authored inventory is 297 model, 144 native and 68 component cases. It is
not an executed result. The separate renderer workflow registers 72 operations
across the three originals, including three sphere-face pointer selections,
authenticated preview/Apply, history and test-owned Save As/reopen dialogs.
Model, native, rendered component, actual pointer/worker/file and exported
geometry evidence are distinct. Keep source hashes, tolerances and failures
reviewable. One passing original case cannot establish arbitrary spherical
patches/cavities, platforms or all mechanisms.

Finite trimmed contact, rolling/no-slip, material non-interference, coincident
and contact-circle strata, other tangent surfaces and full assembly scope remain
required. This proposal does not open the user's demo or a release.
