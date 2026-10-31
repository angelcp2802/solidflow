# Flat assembly geometry export

This is a dependent proposal for the geometry-only export requirement in
[issue #45](https://github.com/angelcp2802/solidflow/issues/45). It does not
implement structural assembly interchange or complete the assembly scope.
Authored checks are not executed results; consult [VALIDATION](VALIDATION.md).

## Document and selection policy

Export reconstructs the complete detached committed version-2 document. It uses
the saved placements without solving mates, moving components or changing
history. A stale or unsatisfied mate declaration is not a certificate of physical
constraint satisfaction. An export contains geometry at the declared poses.
Preview geometry, cached scene meshes and pending source updates are not export
sources. The workspace requires those edits to be applied or cancelled first.

The initial scope is all active part occurrences, including hidden components.
Suppression inherits through the hierarchy and excludes the suppressed branch.
Visibility does not change export membership. Every active part must rebuild
successfully and contain closed native solid geometry; an empty or failed active
part rejects the entire export. Dormant part geometry is not reconstructed,
although the complete document graph must remain structurally valid.

Each unique part ID/revision is rebuilt independently of existing workspace
engines. Exact explicit body states remain separate; a legacy aggregate retains
all of its solids without invented body identities. Each occurrence receives an
independent native copy and its complete composed proper rigid placement once.
Nested rotations and translations follow `parent * local` and `R*p+t` in
[ASSEMBLIES](ASSEMBLIES.md). There is no Fuse or component deduplication: overlapping
and coincident occurrences remain separate solids.

## Format boundary

**STEP plano** is geometry-only BRep in millimeters. It does not preserve the
document hierarchy, reusable definition identities, occurrence IDs, mate graph,
history, visibility or suppression declarations. Reading several exported solids
does not reconstruct an editable SolidFlow assembly. Structural STEP requires a
separate route with explicit hierarchy, units, reusable products and placements.
The separate [structural editor route](ASSEMBLY_STEP_EDITOR.md) offers an explicit
AP242 product/instance choice; it does not change this flat format.
The existing one-solid part import contract in [STEP_IMPORT](STEP_IMPORT.md)
remains unchanged and may reject a multi-solid flat assembly export.

**STL** is binary tessellation of the placed geometry, with linear meshing
tolerance 0.01 mm and angular tolerance 0.08 rad, matching the existing part
export policy. STL has no standardized saved units, hierarchy, exact analytic
surfaces, mates or identities; its coordinates use the document's millimeters.
It is not a BRep or a structural assembly file. Coincident components may produce
coincident triangle shells. A meshing tolerance is not a universal bound on all
derived volume, distance or downstream fabrication errors.

## Transaction and resource boundary

The renderer captures a detached committed snapshot before asynchronous worker
initialization. `export-assembly` is a separate read-only worker route returning
file bytes. It does not replace the cached part engine, consume a pending native
assembly preview or create Apply authority. The workspace locks its editing and
file operations while preparing/writing an export and checks the document and
operation generation before requesting file output.

Desktop output uses the existing restricted preload/IPC Save dialog and atomic
file writer. Cancellation preserves the document, history, recovery and saved
document path. A geometry export is not a `.solidflow` save and does not mark
unsaved edits as saved. Browser output uses a download with the same bytes; that
does not establish native file-dialog or desktop-package operation.

The existing desktop bridge combines its dialog and atomic write in one call.
The renderer can reject a stale operation before that call and ignore a stale
completion afterward; it cannot retract an already-issued write after an
external unmount. Editing stays locked while that call is pending. This is not
a rollback guarantee for file operations already sent to the main process.

Admission caps are 4,096 prototype body entries, 4,096 expanded body entries and
4,096 exported solids. Excess rejects instead of truncating. Output must be
nonempty and at most 256 MiB, matching the existing desktop geometry bridge.
These are admission/output bounds, not peak native memory or execution-time
guarantees. Native reconstruction, copies, placements, writers, temporary files
and parameter restoration must complete cleanup before a Blob can escape;
cleanup failures reject the whole export.

## Evidence required

Original synthetic fixtures must cover reused nested definitions, noncommuting
rotations, explicit multibody and legacy aggregates, visibility/suppression and
overlap without fusion. An independently read STEP needs valid closed BRep,
solid count, units, volume, area, bounds and physical-position checks against
analytical expectations. STL needs binary-layout, triangle, orientation and
coordinate checks with declared discretization limits. A round trip through the
same native library does not establish interoperability with another CAD.

Worker and renderer checks must distinguish committed source from a candidate,
preserve pending preview authority, prevent stale operations from initiating
file output and ignore stale completions.
Cancel, native/export/write failures, history, Save As/reopen and secure file IPC
need separate evidence. Record exact tested source, operating system, commands
and tolerances in the validation record. This proposal does not open the demo
gate for complete assemblies.
