# Assembly symmetry

This saved relation compares selected source and target supports about a third
plane, retaining their actual owners. It does not mirror a complete component,
create geometry or infer finite contact. Its [geometry](ASSEMBLY_SYMMETRY_GEOMETRY.md)
and independent [native measurement](ASSEMBLY_SYMMETRY_NATIVE_MEASUREMENT.md)
are separate layers. Implementation and written fixtures are not execution
receipts; consult [VALIDATION](VALIDATION.md) for source-specific results.

## Saved purpose and identity

Version-2 assemblies admit `type: symmetry`, the ordinary mate identity, name
and suppression fields, and exactly `entityKind`, `source`, `target`, `mirror`
and `alignment`. There are no fictitious binary endpoints or saved native handles.

| Entity family | Source/target purpose | Alignment |
| --- | --- | --- |
| Point | Actual material vertex | Explicit null |
| Line | Actual LINE edge or explicit cylinder-derived face axis | Aligned/opposed |
| Plane | Native planar face or principal plane | Aligned/opposed |
| Sphere | Complete analytic spherical surface | Explicit null |
| Cylinder | Complete analytic cylindrical surface | Aligned/opposed |

The mirror is always a planar face or explicit principal plane. Line-axis
purpose does not inherit surface-radius constraints or radius uncertainty.
A sphere centre cannot substitute for a selected vertex. Explicit datum points
and axes remain distinct purposes. Orientation branches are explicit, not
inferred from material side or proximity.

Strict parsing deep-copies exact data, rejects extra/executable/hidden fields,
and validates purpose, body/source identity and occurrence/revision paths.
Existing document versions remain unchanged. Suppressed and dormant declarations
retain all three references and receive the same syntax validation.
An explicit body and its topology locator must name the same source. Explicit
null names only the current legacy aggregate when no explicit body catalog
exists; it never chooses the first body. Vertex identity follows the
[conservative incidence contract](ASSEMBLY_VERTEX_REFERENCES.md), not general
semantic vertex-v2 naming or guaranteed continuity across arbitrary edits.

## Native and numerical authority

Snapshots authenticate three original roles independently. Point witnesses
retain their separate private proof, alongside the existing directional/surface
proof route. Mixed assertions bind issued objects to a live owning snapshot and
exact document. Scene metadata, syntax, measurements and copied report DTOs
confer no native or Apply authority. Fixed/null, repeated and three moving owners
remain original physical roles; nested frames stay relative to the rigid owner.

The native adapter supplies an explicit source/target/mirror uncertainty tuple.
Native tolerance and original placement-chain arithmetic propagate through each
trial's current reflection lever arm and target projector without widening the
requested bands. The standalone numerical API retains compatibility when the
tuple is absent: its length band is the maximum of requested tolerance and the
three support-tolerance sum. That route is not the native adapter's admission
rule and authenticates no native input.

Orthogonal reflection has operator norm one for source point error; mirror
translation contributes twice its error, and mirror-normal error depends on
the lever arm. Target normal/transverse projectors also have operator norm one,
with direction variation treated separately. These structured bounds replace
a looser triangle estimate. Independent perturbation fixtures check this
argument; comparison bands, SVD policy and iteration budgets are unchanged.
Estimates remain first-order numerical admission, not physical angular metrology
or formal worst-case certificates. Unresolvable arithmetic rejects publication.

Three or six allocated rows do not declare rank. Target-local position and
reflected-source normal charts retain full analytic derivatives and geodesic
radian rows. Local factorization evidence preserves common gauge and honest
rank uncertainty. Strict movement differs from local target projection; neither
establishes global convergence or nearest configuration.

Before issuing a verified proposal, fresh native resolution independently checks
position norm, angle, radius difference and agreement with numerical measures.
Any role, precision, lifetime or cleanup failure prevents atomic publication.
Apply consumes a private single-use worker capability, rechecks the exact base
and commits its unchanged verified candidate; the worker then reconstructs the
scene. Apply does not independently rerun symmetry measurement. Editing a
returned DTO cannot edit the private candidate.

## Repair, editor and lifecycle

The shared endpoint inventory retains `source`, `target` and `mirror` order.
Source updates and selected/all-instance replacement enumerate affected roles
in active, suppressed, dormant and reused scopes. Repairs change explicit roles
through whole-mate validation, preserving identity and support purpose. Vertices
cannot be automatically retained merely because they are neither faces nor
edges. Missing correspondence needs explicit repair or relation removal;
names, coordinates and proximity cannot authorize association.

The editor selects a family and three role-specific dropdown entries from the
current observed scene, with explicit directional alignment. Each role also
has a viewport selection control. Points select material vertices; plane and
surface families select current faces. A line role explicitly chooses either
a LINE edge or a cylinder-face axis before picking. The mirror always selects
a planar face. Dropdown principal planes remain a separate explicit producer.
Editing retains three-role intent through verified preview, Apply, Cancel and
history/reopen. A generic two-reference editor cannot consume this relation.

Viewport selection supplies intent only. A document/scope/scene/generation,
family/role/producer ticket and current-catalog lookup reject stale callbacks,
including a callback retained across rearming the same role. Input coordinates
and copied supports cannot replace a unique current catalog entry. Picking is
exclusive with other reference modes and component dragging, and preview locks
selection. Successful picks advance to the next empty role; an editing pick of
the same reference completes its armed role.

Material-point picking projects native `worldPoint` coordinates in double
precision with actual camera clip/w checks. The default CSS-pixel radius is 8,
bounded by 32; candidates within 0.5 pixels of the nearest candidate reject as
ambiguous. All visible body display meshes, including the candidate's own body
and bodies without vertex catalogs, participate in occlusion. This tests the
rendered mesh, not native geometric visibility or physical metrology. Bounded
selected/hover markers rebind identities to current coordinates and release
their resources when replaced. Neither metadata bounds nor authored cases
establish high-density interaction performance. Executed pointer acceptance
belongs in [VALIDATION](VALIDATION.md); automatic correspondence remains open.

Scene vertex entries are optional metadata, separate from mesh vertices.
Prototype and expanded scene budgets each admit at most 65536 entries. A body
catalog exceeding the remaining allowance is omitted whole with a warning;
its geometry remains usable. Missing metadata cannot acquire substitute points
from a mesh. The native snapshot separately bounds prototype reference entries
before publication. These limits are not performance or capacity benchmarks.

## Remaining scope and acceptance

All five families remain in the acceptance scope, including native geometry,
repair/replacement and actual editor lifecycle evidence. A configured renderer
workflow or a numerical case is not completion. Source-specific viewport
selection acceptance, broader datum/reference producers and general persistent
naming retain their own evidence requirements.
Translation until contact rejects symmetry for every family pending a dedicated
path proof and current native support/rotation/identity checks. No continuous
rotation/contact, finite contact or collision guarantee follows here.

Remaining Width acceptance, full assembly requirements and the complete demo
stay open. Local results do not establish hosted CI or other platforms.
