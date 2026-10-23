# Rigid assembly documents and editor

This is a local proposal for [issue #45](https://github.com/angelcp2802/solidflow/issues/45).
The Assembly entry opens a separate rigid assembly workspace; part editing keeps
its existing version-1 document/history APIs. The new workspace has occurrence
selection, component and mate controls, worker preview/Apply, committed recovery
and document file routing. This initial path does not complete the issue's scope.
Test inventory is not an executed result; see [VALIDATION](VALIDATION.md).

The explicit [root revision action](ASSEMBLY_SOURCE_REVISIONS.md) authors a new
source revision through private native preview and Apply. Ordinary edits/Save
retain opaque revision labels; root authoring gives linked parents a distinct
version to review without manually changing JSON. It preserves committed poses
and captures, requiring ordinary Solve/Apply first if they would change.

The local [explicit linked-source workflow](ASSEMBLY_LINKED_SOURCES.md) adds
read-only native selection and reload/review for embedded parts and rigid
subassemblies. Saved descriptors carry a basename and accepted byte digest;
the embedded copy works offline and reopening requires file selection again.
Source cache and descriptor commit together after native preview and Apply.
This does not provide automatic updates, writeback or multi-document recovery.

The local [material LINE path mate](ASSEMBLY_LINE_PATH.md) connects an explicit
material point, LINE edge and material start vertex to saved Free, Distance and
Percentage intent. Optional Follow aligns an explicit component axis, with its
own reversal. Roll can remain free or align a different component axis with a
material guide face normal projected across the path. Its third reference has
independent reversal and current-source repair. This scoped lifecycle does not
complete general Path support.

The separate [material circular-arc origin](ASSEMBLY_MATERIAL_ARC_PATH.md)
authenticates an explicit endpoint and finite directed metric queries on open
circular trims. Its current snapshot proof is a prerequisite; it does not add
a saved curved-path mate, solver or editor lifecycle.

The [numerical circular-path solver](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md) is a
separate layer with explicit domains, changing-tangent Follow/UP, actual owner
incidence and finite-end constrained movement. Original CAD experiments
re-query transformed material geometry, but do not add native admission,
saved intent, editor/worker commands or lifecycle acceptance.

The subsequent [current-native circular bridge](ASSEMBLY_CIRCULAR_PATH_NATIVE.md)
derives numerical inputs from the live analytic BRep and independently checks
candidate poses with fresh native queries. Separate arithmetic budgets retain
the original placement chains and actual root rigid owners. Its declared
Float64 reference model discloses topology tolerances separately; it adds no
saved circular mate, worker/editor command or Apply authority.

The [saved circular-path family](ASSEMBLY_CIRCULAR_PATH.md) then connects those
proofs to explicit Free trim/support-circle or finite-distance intent,
Follow/UP, worker preview/Apply, repair and editor lifecycle. It uses a distinct
family and purpose-specific repair catalog despite sharing compound selection
syntax with LINE. This bounded circular family does not establish complete
Path coverage, an external application's domain policies or the assembly demo.

## Definitions, occurrences and persistence

`assemblyDocument.ts` defines a separate version-2 format in millimeters. It
embeds version-1 parts and a flat table of assembly definitions. Definitions use
the opaque tuple `(id, revision)`. Occurrences reuse definitions while retaining
different local IDs, names, poses and state. A part definition's ID matches its
embedded document. Different revisions may coexist; one identity cannot name
both a part and an assembly. Revisions are labels, not content hashes or native
freshness certificates.

Paths contain occurrence IDs at every level, never sibling indices or names.
Nested mate paths are local to their declaring assembly. Reusing a subassembly
expands mates in each actual occurrence namespace. Renaming/reordering siblings
does not retarget an endpoint; deleting one does not authorize a same-name match.

Parsing validates dormant and suppressed definitions too. Cycles, missing
definition revisions, duplicate local IDs, unknown fields, nonfinite numbers,
executable object fields and sparse arrays reject. Shared JavaScript aliases
count as repeated serialized data; object cycles reject. Bounds are 20 MiB UTF-8,
512 embedded definitions, 4,096 stored and expanded occurrences, 4,096 stored and
expanded mates, 32 occurrence levels, 2,000 features per part and 20,000 stored
part features in total. Generic JSON traversal caps depth at 128 and values at
one million. Pretty serialization checks actual output size separately.

The `parseCadDocument`/`serializeCadDocument` union APIs route opened/recovered
documents to the appropriate workspace. Validation returns detached data. Dangling/stale mate endpoints
can remain for repair; missing occurrence *definition* revisions reject the graph.

## Poses and native ownership

`rigidPose.ts` uses Hamilton quaternions `[x,y,z,w]`, column vectors and `R*p+t`.
Matrices are flat row-major arrays; directions receive rotation only. Composition
is `parent * local`, rotating child translation before adding parent translation.
Inverse translation is `-R^T*t`. Scale, reflection and shear are not rigid poses.
Quaternion norm must be within `1e-10` of one: validation preserves accepted
values, computation normalizes a detached copy. Nonfinite arithmetic rejects;
there is no arbitrary coordinate cap. Visibility inherits with AND, suppression
with OR. A fixed child is fixed relative to its parent, not automatically world.

`placeAssemblyBody` borrows one valid closed solid and returns an independently
owned placed solid. It validates BRep/cardinality/bounds, checks corner arithmetic
before transforming, duplicates geometry and enables native geometry copying.
It validates the result and retains ownership until temporary cleanup succeeds.
Cleanup failures propagate. It does not merge components, build a document,
resolve faces or solve mates.

## Mate declarations and reference inspection

The format declares concentric, coincident, signed plane-distance, angle,
component-lock, [parallel/perpendicular](ASSEMBLY_DIRECTION_MATES.md),
[gear](ASSEMBLY_GEARS.md), [screw](ASSEMBLY_SCREWS.md) and
[rack and pinion](ASSEMBLY_RACK_PINION.md), and four-plane
[centered width](ASSEMBLY_WIDTH.md) relations. The basic angle mate
uses degrees in `[0,180]`; distances are mm. Gear phase and lifted angular
coordinates use radians and have a separate explicit-carrier contract.
A screw includes coaxiality and component-origin axial travel linked to relative
lifted rotation; its lead is mm per revolution and it has no additional carrier.
A rack and pinion couples relative twist to translation along an authenticated
LINE edge or cylinder direction; it adds one scalar relation without alignment.
A full lock stores `T_first^-1*T_second`. A concentric rotation lock stores relative
orientation captured from a fresh concentric solution, preserving axial
translation. A saved declaration alone does not establish satisfaction,
degrees of freedom, redundancy or conflict.

Face endpoints name an occurrence path, expected definition revision, exact body
state and face reference. Null body declares a legacy aggregate rather than
inventing body identity. A principal plane with null component names its declaring
assembly frame; otherwise it uses that component's frame.

`inspectAssemblyMateReferences` reports scoped paths, declared poses, suppressed
components, stale definitions, missing occurrences and structural producer/body
problems. It preserves suppressed mates and inspects reused subassemblies
separately. It never reinterprets stale face IDs against a new definition or
substitutes a nearest/same-name face. Every inspection has
`nativeVerificationRequired: true`, including empty diagnostic lists. Returned
candidates are for inspection/repair and grant no native geometry authority.

## Native reference sessions

`extractAssemblyFaceSupport` reads actual BRep plane/cylinder adaptors and the
face's native tolerance. Plane normals follow parametric X cross Y and face
orientation, with the existing canonical frame convention. Cylinder axes are
geometric axes and do not reverse merely because a hole face is reversed.
Other surface kinds, internal/external orientation and nonfinite or degenerate
native observations reject. No mesh fit, bounds-derived axis or nominal profile
value supplies an analytic support.

`CadEngine.inspectCurrentFaceSupport` returns numeric data only. Explicit bodies
require the exact current body state and its actual face-key lineage. Legacy
aggregates require the exact final producer and cannot substitute for explicit
bodies. The engine retains an owned semantic face catalog before native prism
producers retire, so current v2 keys remain authenticated afterward. Inspection
is sealed only after successful build and producer cleanup. A late native epoch
change prevents publishing analytic output.

Current face and edge catalogs belong to one immutable engine generation and
exact body/source state. Renderer references, aliases and face frames are
detached copies. Reusing a catalog does not reuse an earlier numeric support:
each inspection extracts the actual native surface or curve again. Rebuild,
failed publication and disposal revoke the generation before releasing its
catalogs and geometry.

`AssemblyGeometrySnapshot` rebuilds each active unique embedded part revision
once. Shared occurrences retain separate paths and declared poses. It issues
deeply frozen endpoint objects bound by private WeakMap identity to the session
and the complete normalized document. Reusing a revision label with changed
content does not preserve freshness. Cloned or cross-session objects are not
proof; disposal revokes authority before releasing native engines. Principal
datum planes are identified separately from native faces and use their actual
declaring component/assembly frame. Suppressed mates are skipped, active broken
references reject, and no nearest-face substitution occurs.

Reference snapshots use `CadEngine.rebuildForAssemblyReferences`, which shares
the complete feature reconstruction and validation pipeline with rendering but
omits final body/face/edge tessellation and their visual DTO construction. Its
explicit empty/legacy/body inventory contains detached canonical references.
Native shape presence does not depend on an empty display array. Each snapshot still owns newly rebuilt
engines: no prototype pool or snapshot sharing crosses initial, solving,
before/after and final verification boundaries. All angular stations and fresh
support queries remain required. The final worker scene must still mesh
successfully before it can publish an Apply capability; reference inventory
alone cannot authenticate a rendered preview.

Admission limits are 4,096 prototype and expanded body entries and 65,536 cached
face references plus a separate 65,536 edge-reference cap. A legacy aggregate
is one entry, not a claim about its number of solids. Each prototype builds
before these totals can be checked: the limits
do not bound the kernel's peak memory or build time. The native face factory and
picking consumer adopt received wrappers immediately, attempt all releases and
retain primary/cleanup failures. Allocations lost inside an upstream SDK call
before it returns a wrapper remain upstream responsibilities.

## Numerical foundation

`assemblyLeastSquares.ts` provides direct one-sided Jacobi SVD, a minimum-norm
pseudoinverse step and Tikhonov damping in original matrix units. It does not form
or rank a normal matrix. The full right factor retains variable directions for
wide matrices; numerically discarded directions are reported, not invented.
Reconstruction, basis orthogonality, convergence and rank uncertainty are exposed.
Ambiguous rank or failed factor evidence prevents publishing a least-squares step.
The `certified` flag means reported Float64 checks passed, not interval proof.

Its numerical limits are 256 rows, 128 columns and 128 sweeps (64 default). These
are limits of this kernel, not an assembly-size support claim. Rank is a numerical
threshold result; it is not physical DOF, redundancy or a conflict certificate.
The matrix kernel supplies simultaneous rigid-mate steps and final local rank.

## Local rigid solver and transactions

`assemblyKinematics` uses left SE(3) increments in one fixed normalized frame,
including the exponential's V*v translation. `assemblyMateEquations` supplies
analytic Jacobians for concentric cylinders, coincident and signed-distance
planes, angles and component locks. Both floating endpoints contribute derivatives.
Geometric vector rows use the second endpoint's moving frame, including its
frame derivative. Common rigid motion therefore does not turn an accepted
nonzero residual into an extra Jacobian constraint.
Saved angle targets are degrees; angular residuals/tolerances are radians.
Concentric spin lock adds relative orientation without fixing axial translation.
The pi logarithm cut and singular interior-angle charts are diagnosed; bounded
initial orientations use actual resolved support/component frames, not fixture
target poses. Exact zero/180-degree angle targets use regular signed-vector rows.

`assemblySolver` partitions by free-owner incidence, including zero-Jacobian
relations; common fixed owners do not join otherwise independent free groups.
Each connected group admits at most 256 rows and 128 columns; excess rejects
without dropping constraints. Total numerical inputs cap at 4,096 bodies/mates.
LM accepts decreasing residual proposals and computes final rank from the complete
combined Jacobian using direct SVD. Local DOF is six per free rigid occurrence
minus that verified rank. Unanchored groups retain common rigid mobility;
null vectors, singular values, factor evidence and physical residuals are reported.
Uncertain rank, exhausted iteration budgets and insufficient precision publish no
poses. These are local numerical results, not global uniqueness or exhaustive
mechanism analysis. Inconsistency is reported only with a violated fixed relation
or unequal offsets on exactly identical ordered plane endpoints; other failures
remain nonconverged. No proximity matching supplies a conflict certificate.

Physical norm/angle checks govern satisfaction. Per-mate length tolerance is
max(requested mm tolerance, sum of both native face tolerances); the actual
tolerance is reported. Angular tolerance is explicit. The adapter defaults to
1e-6 mm and 1e-8 rad and rejects a conservative Float64 coordinate-resolution
policy before silently relaxing those requests. This policy is not interval proof.

`prepareAssemblySolve` authenticates native supports, solves active unique
subassembly declarations bottom-up and treats each subassembly as a rigid unit
in its parent. Nested component frames stay relative to that rigid owner; child
fixed flags are never converted into world anchors. Internal local DOF is
reported separately from parent mobility. Reused rigid subassemblies share their
solved definition configuration. Flexible independent child configurations remain
unimplemented. Suppressed declarations stay saved and dormant sources are not solved.

The final candidate rebuilds fresh native references and physically checks every
expanded active mate. This verifies analytic relations derived from actual BRep
supports; it does not itself construct every placed occurrence solid. Separate
native integration tests check the original three-solid example's placed geometry.
Every temporary native session must release successfully before a preview is
published. A private object-identity capability binds that frozen preview to the
complete source. Clones, discarded/consumed previews and changed sources reject
Apply. `applyAssemblySolvePreview` commits one detached history snapshot; failures
leave history untouched. Rotation-lock capture accepts only a current authenticated
concentric preview and returns a declaration requiring a new solve.

`assemblyEditing` provides detached occurrence/mate edits and bounded undo/redo
(100 total states by default, at most 256). Shared-definition scope is selected by
exact ID/revision. New declarations use a process UUID namespace plus a monotonic
safe counter; edits preserve IDs, deleted IDs are not deliberately reused, and
cross-process collision resistance depends on UUID randomness. Deletion retains
dangling mate endpoints for repair. Revision labels stay opaque. Syntax/history
APIs alone grant no native authority.

## Native scene and worker authority

`copyCurrentBodyShape` transfers an independently owned native copy of an exact
current body state. Null is permitted only for the complete legacy aggregate;
it never selects one enumerated solid. `placeAssemblyShape` validates BRep, every
closed positive-volume solid, absence of loose geometry, finite bounds and
preserved cardinality. The existing one-solid placement contract remains intact.

`buildAssemblyScene` builds each active unique part revision once, copies and
places each occurrence independently, and queries its actual native mesh,
volume, area, bounds and solid count. No Fuse is performed. Totals count coincident
occurrences separately. Hidden components contribute material but not visible
bounds or picking; suppressed components are excluded. Prototype face meshes
are rigidly transformed for picking, retaining local saved keys plus complete
occurrence/definition/body scope. This is display metadata; later mate preparation
authenticates references again. Unsupported analytic surface kinds are explicit;
invalid queries or cleanup failures remain fatal. No nearest-face matching occurs.
Scene budgets are 4,096 prototype/expanded body entries, 65,536 prototype face
references and four million numeric mesh values. Admission follows native build
or meshing, so these limits do not bound peak kernel heap/time.

Assembly actions share the existing serialized worker queue and generation
handling. `AssemblyWorkerSession` retains one private native preview and an opaque
single-use token bound to the complete committed base and validated proposal.
Native object identities never cross RPC. Preview returns a separately built
native scene. Apply checks the unchanged base, consumes the capability and
returns a complete candidate/scene before renderer history changes. Rebuild,
replacement preview, discard, source drift, failed Apply or worker replacement
revokes old authority. Failed capture changes no document; the UI discards its
old token before recovery. Spin/full-component capture uses authenticated solved
frames and freshly solves the resulting declaration, preserving solver policy.

## Workspace and files

The workspace has a component tree, names/poses/fixed/visible/suppressed controls,
insertion of a chosen v1 part or v2 assembly, reuse of existing definitions and
scoped mate declarations. [Component import](ASSEMBLY_COMPONENT_IMPORT.md)
embeds assembly root contents and their dependency library without replacing
the open parent or persisting an external filesystem path. Identical exact
definitions are reused; conflicting payloads reject instead of overwriting
another source. Local occurrence paths and declaring-frame mates remain local.
Nested scopes edit shared rigid definitions, and internal local mobility remains
separate from parent mobility. Existing lock declarations can be retained and
fresh full-component locks captured from a successful preview.

The separate Three viewer keys components/bodies/faces by full scope. Frontmost
face overlays, including unsupported surfaces, control self-occlusion; another
body can still occlude a selectable face. Same-body coarse/fine tessellation
differences do not fabricate another body's occlusion or broaden pick tolerance.
Overlapping ambiguous identities reject selection. A visible reference list is
an additional way to choose actual native planes/cylinders.

Renderer request generations guard late replies. Edits invalidate Apply
immediately; pending/rejected/cancelled previews cannot replace committed history.
Save/autosave serialize only committed documents, and replacement uses the dirty
guard. Startup leaves invalid/unavailable recovery bytes intact until an explicit
document change. The native save bridge admits a bounded v2 envelope while the
renderer validates the full graph. Existing main-frame, URL, file-dialog grant,
atomic-write and file-operation-lock policies remain in force; no IPC channel or
arbitrary filesystem capability is added.
Closing a dirty native window prompts to keep editing or close without saving.
Only the explicit close choice overrides the renderer's unload prevention;
Cancel, stale windows and native-dialog errors retain the window. This does not
promise successful recovery writes or save unapplied previews.

## Shared part revisions and explicit repair

`prepareAssemblyPartUpdate` stages a new embedded revision of the same part
identity. Every stored occurrence using the exact old tuple changes together,
including shared, dormant and suppressed declarations. Earlier revisions stay
embedded; other revision tuples, occurrence identities, poses, roles and mate
declarations remain intact. A label collision rejects. The plan lists affected
mate endpoints only when their original occurrence paths actually reached the
old source; matching a stale label alone never selects another component.
Syntax planning and explicit `repairAssemblyEndpoint` grant no native authority.

`reviewAssemblyPartSourceUpdate` builds actual old and new scenes. A component
or principal-plane revision can retain its saved component identity without
claiming a native face. A face can retain association only when every actual
scope expansion has the same exact primary semantic-v2 face/body/support in
both native catalogs, with the same verified finite entity-prism origin and
discrete history context. Suppressed/missing expansions or a changed/missing
semantic origin require repair. Legacy ordinal keys, compatibility aliases,
nearest geometry, names and shape signatures never supply correspondence.
Review returns display/staging data without an Apply token; native query or
cleanup failure prevents its publication. These gates do not establish general
topological correspondence or linked external-file tracking.

Select a part component and use **Actualizar pieza** to read a revised v1
document through the existing file bridge. The review panel shows the affected
uses and references. Manual repair selects an actual compatible face on the
same local occurrence; equivalent shared scopes edit one saved declaration.
The file, recovery and history keep the confirmed document while this proposal
is edited. Rejection preserves the panel for further repair. A fresh native
Solve and authenticated Apply commit the complete update as one history state.
Cancel restores the confirmed scene. Source review, repaired previews and stale
responses cannot silently replace committed data; Save and unrelated edits are
blocked while the update is staged. File paths are not embedded as source links.
The worker now retains a private part-review ID and exact cache proposal;
the renderer may supply only repairs to its named pending endpoints before
Solve. Modified report caches, poses, other mate fields or link descriptors
cannot replace that plan. See the [linked-source contract](ASSEMBLY_LINKED_SOURCES.md)
for the optional saved descriptor and separate read capability.

## Replacing a part component

**Sustituir pieza** replaces a part by another identity, either for one expanded
instance or for all uses of the exact source revision. Selected replacement
isolates nested shared definitions along that path; other instances retain
their sources. Faces and edges require explicit native-catalog choices. A new
Solve, including explicit mechanical recapture where needed, precedes one
authenticated Apply. The [replacement contract](ASSEMBLY_COMPONENT_REPLACEMENT.md)
defines scope, source preservation, reference authority and cancellation.

## Movement with rigid relations

This increment keeps the existing version-2 document format. An
`AssemblyComponentMove` names a component by its **complete root occurrence
path and exact definition tuple** and requests an absolute local `RigidPose`
relative to that occurrence's containing assembly. It is neither a world pose
nor an incremental displacement. `planAssemblyComponentMove` validates plain
data and the complete current graph, then stages only that declaration's pose
through `applyAssemblyEdit`. IDs, definition references, flags and mate
declarations remain intact; revision labels remain opaque.

An inherited suppression or a fixed selected occurrence rejects the request.
A fixed ancestor does not fix its independently movable child in world space.
Editing a declaration in a reused assembly definition affects every actual
expansion of that declaration. `affectedPaths` lists those complete paths,
including suppressed expansions, without inventing paths for dormant sources.
This syntax plan alone supplies no native geometry or Apply authority.

`prepareAssemblyMovePreview` starts from the original committed base and uses
a temporary driver anchor for the exact selected declaration in its containing
scope. It solves the active unique assembly definitions bottom-up with all
their active saved mates, then rebuilds fresh native references and checks every
expanded active mate. The resulting local pose must also satisfy the requested
target within the requested tolerances (defaults `1e-6` mm and `1e-8` rad),
without relaxing those target tolerances.
Existing native face tolerance policy for mate checks remains separately
reported. A target incompatible with those relations publishes no candidate.

The temporary anchor is computational and is never saved as a fixed flag or
mate. Scope rank/DOF reported during this preview are conditional on that driver;
they do not replace the undriven mechanism's mobility or persist in the document.
Reused rigid definitions retain one shared configuration. The final candidate
retains the original fixed roles and must pass native checks before publication.
All temporary native sessions must release successfully. A private authenticated
preview binds the complete original base, request and candidate; source drift,
failure, cancellation, replacement or consumed authority prevents Apply.

Numeric placement and incremental rotation controls use the separate
[explicit motion request](ASSEMBLY_MOTION.md), which retains signed full turns
and checks bounded stations before publishing one final native preview. The
absolute-pose API above remains available with its existing meaning. Preview and
Cancel leave committed data, recovery and files unchanged. Authenticated Apply
commits the whole constrained movement as one history transaction, so one Undo
restores all affected poses and lifted gear coordinates together. This path does not implement pointer
dragging, continuous trajectories, collision avoidance or stopping at contact.
The 27 pure model, 24 native, 26 UI/SSR and three session/transport cases are
authored inventories; source-specific execution must be recorded separately
before claiming a pass.

## Constrained pointer movement

The viewport's **Arrastrar posición** and **Arrastrar giro** modes attach a
manipulator to an empty intent proxy. Translation uses world axes; rotation uses
the selected component's local axes. Native body meshes are never attached to
that proxy. Only scenes returned by a fresh successful native movement solve
replace the displayed geometry. Pointer intent can differ from the last verified
scene while the worker is busy; it does not become committed geometry.

A pointer target is the absolute world pose of the complete selected path and
exact definition tuple. It moves that path's root rigid owner as one unit. A
child fixed relative to its floating parent can be selected; a fixed root owner
cannot move. This differs from numeric local editing of a shared definition.
The separate strict world-movement API solves child scopes first and derives
the owner target as target times inverse relative pose. It retains the exact
target using a temporary anchor and requested 1e-6 mm / 1e-8 rad defaults. Its
previously recorded behavior and numeric local movement remain unchanged.

The pointer route now uses local constrained projection. It solves child scopes,
recomputes the selected-to-owner frame, and obtains a feasible hard-mate solution
without a pointer anchor. Translation minimizes selected world-position error
first and orientation error second; rotation reverses those priorities. The
secondary linearized objective acts only in the primary task's numerical
nullspace, with every secondary acceptance preserving the best primary cost
within its roundoff band. At numerical stationarity, bounded secondary probes can also accept
finite primary-cost ties within a fixed roundoff band around the best attained
cost; unsuccessful probes retain the prior stationary result. This covers flat
cost ties without accumulating one physical tolerance per iteration. Hard mate
equations never trade accuracy for a finite target penalty.
Their actual rank/DOF retain the saved mechanism's freedom.

The projector uses the hard Jacobian's checked SVD nullspace, bounded SE(3)
steps, hard-only restoration and a lexicographic line search. An objective
step must deliver at least 0.1 of its predicted first-order decrease;
an arbitrarily small decrease alone does not admit an oscillating full step.
The reported stationarity norm is the normalized feasible Gauss–Newton step norm, not a
certified distance to a global optimum. The default threshold is 1e-8; lengths
use the solve's fixed lengthScale and rotations use radians. Requested physical
mate tolerances remain separate. Exhausted budgets, uncertain rank, invalid
charts, finite-precision or native release failures publish no candidate.
There are no changed assembly capacity or worker/deadline overrides.
Numerical data copying admits arrays up to the existing 4,096 input envelope,
depth 64 and one million visited data nodes; this is not a peak-heap bound.
Selected-point arithmetic subtracts the fixed origin before adding a rotated
local offset, preserving the solver's conditioning convention.

Fresh native reconstruction checks all expanded active relations and verifies
the selected world frame agrees with the numerical projected result within the
requested tolerances. A separate projection witness reports requested/resolved
poses, position/angular pointer deviations, mode, rigid owner, convergence and
local-only evidence. Pointer deviation may exceed mate tolerances. The UI shows
both quantities separately and never labels that deviation as a mate failure.
A projection that changes no active declared pose beyond the requested
position/angular policy grants no Apply capability.

Each gesture owns one original committed base and request generation. The stream
holds at most one in-flight request and one latest unsent target. Intermediate
verified scenes cannot enable Apply; replaced capabilities are discarded. After
pointer release, only the last verified target grants the normal one-use Apply.
A latest rejection restores the confirmed scene. Cancel, Escape, pointer cancel,
window blur, source replacement or unmount revoke known and future capabilities.
Save and document edits remain blocked during the gesture and final request.
Apply is one history transaction; no driver or fixed flag is persisted.

Each target starts from the original committed base; the previous verified
reply is not a warm-start trajectory state. This is local discrete projection,
without a global nearest-placement or branch-continuation guarantee. It does not
inspect the swept path, stop at collision or provide flexible per-instance
subassemblies. The scripted
pointer workflow uses Chromium input in a hidden owned Electron window; its
recorded result is separate from a human gesture or installed-package claim.

## Rectilinear translation with a contact stop

The separate **Trasladar hasta contacto** panel requests an absolute world
destination and nonnegative clearance. It moves the selected root rigid owner;
a fixed nested child can follow a free root. It does not change pointer dragging
or the strict local/world movement APIs. Preview remains separate from Apply,
Cancel revokes the one-use capability, and Apply is one undoable transaction.
Only actual placements are saved; the trace and its witnesses are transient.

The operation first solves the requested world endpoint against actual native
references. The graph, source contents, revisions, mates, flags and timestamps
must remain identical, apart from active local poses. Every active local
rotation must agree with the original within the angular policy and is then
replaced by the exact original quaternion. Fixed local translations and
inactive declarations cannot change. A shared declaration active through at
least one unsuppressed use remains shared; its other suppressed uses are saved
without being included in the trace. In exact arithmetic, the resulting world
translations are affine, including nested/reused leaves. The initial model must already satisfy
its active relations. Fresh native checks run at both restored endpoints and
the final stopped placement.

For the five current mate families, constant rotations make plane signed
distances, axis-offset vectors and relative lock translations affine; angular
residuals remain constant. Norm tolerance bands are convex. Endpoint checks
therefore preserve these same relations along this straight interpolation.
A future nonlinear mate family needs its own trajectory argument before it can
use this route. Final rank/DOF are measured without a temporary anchor and
without allowing the verification solve to move the inspected placement.

The trace rebuilds each participating part revision once. Independently owned native
placed bodies supply distance queries, including hidden active components.
Suppressed leaves and pairs inside a single leaf component are excluded.
Different-component pairs with exactly equal world displacement are invariant
and counted separately; they are not declared initially interference-free.
Every other pair is queried at each reported fraction. A pair initially within
the numerical safety band rejects the operation; existing relative contact is
not silently ignored. No fixed pose-sampling interval or clear final endpoint
can bypass an intermediate obstacle.

The step is at most `0.8 * (distance - band) / relativeSpeed`. Translation makes
pair distance 1-Lipschitz in relative displacement. The band contains requested
clearance, both actual BRep tolerances, the requested native distance deflection
and a Float64 arithmetic margin. Coordinate resolution comparable to the
requested deflection rejects rather than silently increasing it. Native
queries must complete, provide finite consistent closest points and preserve
their admitted tolerance. A stop retains a positive measured gap beyond this
band, within one requested length tolerance of it. This is numerical
conservative advancement under the native distance tool's policy, not a
certified distance-error interval or an exact first-contact time.

Precision admission includes local coordinates, complete ancestor chains and
prototype geometry before cancellation. Each query uses the actual declaration
interpolation that Apply will save, checks its agreement with the affine ideal,
and reserves a Float64 margin for both ends of an advance. Small world bounds
cannot hide loss of precision in large cancelling local coordinates.

Defaults are zero clearance, 1e-6 mm distance deflection and 1,024 queries;
the explicit query cap is 8,192. Body/pair admission uses the existing 256/32,640
envelopes. These are not kernel-time or peak-memory bounds. A budget, precision,
build, distance or ownership-release failure withholds the complete preview
and its Apply authority. Progress at or below the movement tolerance also
rejects. Rotary/curved trajectories, warm-start continuation, sliding from
initial contact, flexible components and collision stopping during pointer
dragging remain required work.

## Native interference and clearance inspection

**Comprobar interferencias** inspects the confirmed document without solving or
moving components. Apply or cancel any staged source update or mate preview first.
`analyzeAssemblyInterference` rebuilds each participating exact part revision and
uses independently owned placed BReps with full leaf occurrence/definition/body
identity. Null body retains the complete legacy aggregate. Suppressed components
are excluded; hidden components participate by default and can be excluded with
the explicit option. Body pairs within the same leaf component are excluded by
default. **Incluir cuerpos de una misma pieza** also inspects distinct explicit
bodies of a multibody part. Crossing a selected component group against the rest
still excludes internal pairs. Nested sibling leaf occurrences are distinct
participants even when they reuse the same source.

The optional [inspection scope](ASSEMBLY_INTERFERENCE_SCOPE.md) selects full
component/subassembly occurrence references and explicit exclusions. It supports
all components, pairs within the selected group and pairs crossing from the
selected group to the rest. Exclusions take priority. References are checked
against the current graph before native work; a reused subassembly expansion
remains distinct. The report states the evaluated scope and participant counts.

The separate [root-subassembly grouping policy](ASSEMBLY_INTERFERENCE_GROUPING.md)
can omit pairs within each root occurrence, including further nested leaves.
Reused occurrences remain distinct and eligible pairs retain original body
identities. It intersects all three inspection scopes and explicit exclusions;
selecting descendants does not promote them to new roots, and excluding a leaf
does not exclude its whole root group. Internal-body inclusion
can remain requested: grouping takes precedence and omits all pairs sharing a
root occurrence, including distinct bodies of one part. Both options retain
their values, so disabling grouping restores the internal-body policy.

Defaults are clearance 1 mm, length tolerance 1e-6 mm, volume tolerance 1e-6 mm3
and inclusion of hidden components; within-component inspection and
root-subassembly grouping default to false.
For each candidate, the effective length band
is max(requested length tolerance, sum of both actual native shape tolerances).
The report carries that band explicitly. Conservative native BRep bounds include
native tolerances. A positive axis gap can exclude a pair only beyond clearance
plus the effective length band and a coordinate-dependent rounding allowance.
An excluded pair has no queried exact distance. Other eligible pairs count as
native-tested even when their measured distance exceeds the reporting threshold;
potential pairs equal tested plus bounds-excluded pairs.

Candidates use a completed, non-destructive native Common and direct owned
`BRepExtrema_DistShapeShape`, not distance between display meshes or unchecked
wrapper measurements. Common must be nonnull and BRep-valid. Each positive solid
has closed shells and strictly positive finite signed volume; no source-body
volume floor discards a small intersection. The distance tool receives the
effective length band through `SetDeflection`; it must finish and return at least
one solution, a finite nonnegative value and finite owned closest points. Their
Euclidean separation must agree with the returned value within the effective
band. The Float64 policy rejects coordinate resolution comparable to that band
instead of enlarging it silently. These native observations, deflection settings
and numerical guards are not certified error intervals or exact physical proof.

A positive Common volume above the volume tolerance is **overlap**. Positive
volume at or below it is **small-overlap** and remains a collision. With zero
solid volume, distance within the effective length band is **contact within
tolerance**, which does not assert exact touching. Otherwise a distance within
clearance plus that band is **clearance**. Only positive Common solids supply
the red world-space intersection mesh; standalone contact faces/edges/points
do not become a material overlay. Closest points are separate numeric witnesses.
Volumes are per body pair and must not be summed as a union interference volume.

Admission caps are 256 body entries, 32,640 different-component body pairs and
four million intersection-mesh numbers. Body admission follows prototype build,
pair admission precedes native pair work, and mesh admission follows native
meshing. These are not peak-memory or kernel-time limits. No clipping or partial
report is allowed: a native build/query, precision, budget or cleanup failure
withholds the entire report and retains causal operation/release failures.
All received native owners release before numeric data can escape. The report
and its display ID contain no Apply token; analysis also revokes an older preview.

The UI accepts a reply only for the unchanged committed document, options and
request generation. Changes, cancellation or failure clear the report and its
selection. Inspection does not edit history, recovery or saved bytes. Selecting
a row highlights its scoped pair and actual world-space witnesses. A hidden
participant can be drawn temporarily as a non-pickable result witness without
changing its saved visibility; closing the report removes that presentation.
Rendering and triangle selection do not authenticate native geometry or mates.
This is a bounded static body-pair inspection. Continuous collision detection,
grouping beyond the explicit root-only policy and a global intersection-union
operation remain open.

## Declaration bill of materials

The separate [bill of materials contract](ASSEMBLY_BOM.md) covers the three
read-only table modes, exact revision/context quantities, full-path member
selection, suppression/visibility policy and bounded literal-text CSV export.
It reads the confirmed declaration graph without native reconstruction or pose
composition. Neither table quantities nor exported CSV assert material/mass,
native geometry validity, configuration support or complete assemblies.

## Mechanical angular coupling

The local [gear relation contract](ASSEMBLY_GEARS.md) adds two actual cylinder
references, an explicit carrier, ratio/direction and saved angular phase.
Native capture, lifted numerical continuation, editing and history remain
separate evidence boundaries. A gear relation does not infer tooth geometry,
collision response or unconstrained multi-turn input from a quaternion target.
It does not complete mechanical mates, flexible assemblies or motion simulation.

The separate [explicit numeric motion contract](ASSEMBLY_MOTION.md) preserves
signed whole-turn intent and measures actual driver winding through bounded
native-verified stations. The [source-specific execution](VALIDATION.md#explicit-numeric-angular-motion--2026-10-16)
covers +720-degree Cancel/Apply/history/save/reopen and incompatible full-turn
rejection. Station checks do not establish continuous feasibility or rotary
collision prevention.

The [screw relation](ASSEMBLY_SCREWS.md) privately aligns two native cylindrical
faces before capturing its relative angular zero and axial reference. One final
preview/Apply carries both the helical state and poses through history and
persistence. The [execution record](VALIDATION.md#screw-relations-and-combined-mechanisms--2026-10-16)
separates pure equations, native single/mixed mechanisms and the actual scripted
renderer. Its length residual does not imply identical angular follower accuracy.
These cases do not establish thread geometry, continuous motion or collision
prevention, flexible assemblies or complete mechanical mate support.

## Flat geometry export

The dependent [flat export contract](ASSEMBLY_EXPORT.md) defines independent
native reconstruction of the committed document, all active occurrences
including hidden geometry, suppression exclusion and exact nested placements.
STEP is geometry-only BRep in millimeters; STL is unitless binary tessellation
whose coordinates use millimeters. Neither reconstructs document hierarchy,
definition reuse, occurrence identities or mates. There is no component Fuse.
The existing single-solid STEP part import remains a separate route.
Check the exact-source validation record before claiming an executed export
or renderer/file result; structural assembly interchange remains required.

## Remaining work

The dependent [plane/cylinder tangent contract](ASSEMBLY_TANGENT_MATES.md)
distinguishes exact cylindrical surfaces from their derived axes. Its two
equations constrain infinite analytic supports, with an explicit plane-oriented
side and a separate native support-normal report. They do not attest finite
trimmed-face contact or absence of solid interference. Other tangent pairs and
the complete assembly scope remain required; inspect source-specific validation
before claiming a numerical, native or renderer result.

The dependent [cylinder surface tangency proposal](ASSEMBLY_CYLINDER_TANGENCY.md)
separates a regular nonparallel relation from tangency with added parallelism.
Both use exact surface-purpose references and explicit external/internal radius
roles. These equations and fresh support-normal reports apply to infinite
supports, not finite contact, containment, rolling or non-interference. Source
updates must revalidate declared radius order. They do not inherit the
plane/cylinder straight-translation admission. Authored cases and configured
workflows need their own recorded execution; full tangent coverage remains open.

The dependent [spherical tangency proposal](ASSEMBLY_SPHERE_TANGENCY.md) adds
separate plane/sphere, sphere/sphere and cylinder/sphere intent. Spheres have
unique centres and no mate axis; exact native spherical purpose uses a separate
reference/witness and picker path. Equations describe complete analytic supports
and fresh oriented normals, with explicit side or radius roles. The original
Revolve construction gate is distinct from new mate, source repair and renderer
evidence. Coincident/contact-circle strata, finite contact and full tangent
coverage remain required; authored/CI-configured paths imply no pass.

The dependent [signed plane-distance interval proposal](ASSEMBLY_LIMIT_DISTANCE.md)
adds explicit inclusive minimum/maximum bounds and aligned/opposed plane intent.
Unilateral boundaries differ from bilateral locks: projection must release a
boundary toward the interior, while a strict out-of-range destination rejects.
Bilateral rank/DOF, active working sets, lineality and target stationarity remain
separate. Native/source authority and atomic mechanical state still apply.
The implemented [principal direction-angle intervals](ASSEMBLY_LIMIT_ANGLE.md)
and [directed circular stops](ASSEMBLY_DIRECTED_ANGLE_STOPS.md) have distinct
saved coordinates, native verification, movement and editor contracts.
Accumulated-turn stops and continuous-path guarantees remain separate work.
Source-specific interval acceptance is recorded in [VALIDATION](VALIDATION.md).
Remaining Width modes, general paths and other advanced families still require
implementation and acceptance; these intervals do not complete the full
checklist. The separate [saved profile-center integration](ASSEMBLY_PROFILE_CENTER_MATES.md)
now connects complete circular pairs with free spin and rectangular pairs with
explicit material edges/senses/quarter turns to native solving, editor history
and persistence. Circular roll locking, automatic orientation correspondence,
broader interaction and native-policy compatibility remain separate work.
The separate [ordered plane-bisector geometry](ASSEMBLY_WIDTH_GEOMETRY.md)
retains all four supports and their owner derivatives. Its numerical centered
solver admits four original plane supports, including distinct, repeated and
fixed owners, with physical angle/offset checks and local target projection.
The [centered-width integration](ASSEMBLY_WIDTH.md) adds strict grouped saved
references, native verification and editor controls for that plane subset.
Complete mode, reference-family, lifecycle and interaction acceptance remain
required; the full Width requirement is not completed by this increment.

The separate [symmetry geometry](ASSEMBLY_SYMMETRY_GEOMETRY.md) compares two
selected analytic entities about an independently owned plane, retaining all
three owner roles. The numerical integration solves and locally projects all
five matching families with explicit source/target/mirror incidence, physical
checks and ownership-aware orientation seeds. Points have no invented axis;
three/six row budgets are not rank declarations. The implemented
[saved/native symmetry integration](ASSEMBLY_SYMMETRY.md) retains source,
target and mirror roles through strict parsing, native verification,
serialization, explicit source/replacement repair, editor selection and
preview/Apply/Cancel/history/reopening. Its five families are material points,
lines, planes, spheres and cylinders; an explicit cylinder-face axis is a line
purpose rather than a complete cylindrical surface. Source-specific native,
repair and viewport interaction results remain separate acceptance evidence.
Broader datum producers, general persistent correspondence and symmetry
translation-until-contact remain open; the integration does not complete the
assembly/demo requirements.

The [native vertex prerequisite](ASSEMBLY_VERTEX_REFERENCES.md) adds exact
current incidence keys, fresh point/tolerance queries and separate point
witnesses. The symmetry integration uses these witnesses for saved material
vertex references and current-catalog viewport selection. Display coordinates
and copied metadata grant no native or Apply authority. Incidence identity
retains conservative eligibility and conditional durability; general vertex
naming, automatic repair and explicit datum-point producers remain separate
work.

Test inventories and configured desktop workflows are not passes; inspect the
source-specific validation record before claiming interaction coverage. Automatic
shared-source correspondence beyond the verified semantic family, linked-file recovery, flexible subassemblies,
interference grouping beyond the root-only policy and continuous motion beyond static body-pair inspection,
configuration-aware BOM/custom purchasing metadata, broader mates and structural
import/export remain required.
Issue #45 retains the complete checklist. Neither a locally solved example nor
placing three declared test solids establishes all these paths or platform support.
