# Authoring assembly source revisions

**Crear revisión…** explicitly creates a new revision of the current assembly
root. Ordinary edits and Save keep the existing opaque revision label. Linked
parents require a distinct incoming revision for changed v2 content; this action
provides an authoring path without editing document JSON.

The dialog shows the root identity/current revision and proposes a fresh UUID.
The user may enter another nonempty label within the existing 128-character
identifier limit. Labels have no numeric ordering or geometry meaning. The
new exact root tuple must be absent from the complete current registry,
including historical and dormant definitions. The same label or a collision
rejects; no existing definition is replaced and no historical root snapshot is
implicitly added. The enclosing document ID stays the same.

## Declaration rewrite

`createAssemblyRootRevision(document, revision)` validates and detaches the
entire document before reading the graph. It changes the root revision and
advances its modification time monotonically. Every occurrence declaration
that references the old exact root tuple follows the new tuple, including
suppressed uses in dormant scopes. This preserves the valid definition graph;
an old root reference cannot simply be left without its definition.

Mate endpoints are traced in the original graph and declaring frame. Only
references that actually resolve to the old root and whose purpose admits an
assembly frame are rebound: component and principal-plane roles. Null scope
frames stay null. Stale paths and stale material point/face/edge/profile/path/UP
claims do not become current assembly geometry by matching a label. Grouped
Width/Symmetry roles and component captures retain their saved structure.

Other revisions of the same ID, occurrence IDs/names/poses/flags, material
definitions, source descriptors and captured coordinate data are preserved.
An embedded declaration referencing the root can therefore change reference
tuples without changing its own opaque revision or stored source descriptor.
That descriptor records previously accepted source bytes; it does not prove
that a locally edited cache remains identical to that file. A later rebind
compares complete validated file content independently of the digest label.

The result passes the complete existing graph validation and pretty UTF-8
20 MiB saved-byte limit. No declaration, feature, hierarchy or history budget
is enlarged. The helper is declaration work, not native proof or file access.

## Native preview, Apply and Save

The worker action accepts only the committed document and requested label. It
constructs the proposal privately; a renderer candidate cannot supply changed
geometry, poses or captured values. A fresh native Solve checks current active
relations. Its complete candidate must equal the authored proposal exactly,
including poses and captured coordinates, before a capability is published.
If solving would change anything else, the preview is discarded and the user
must first use ordinary Solve and Apply. Equality is not weakened by a geometry
tolerance and the native proof is never attached to another document.

Apply authenticates the exact old committed base and privately retained native
candidate. It creates one history state; Undo/Redo restores complete snapshots.
Canceling the dialog or preview creates no history or file write. Stale replies,
changed bases, failed validation/publication and consumed tokens grant no Apply.
Dormant and suppressed declarations are preserved and syntax-checked; the native
solve does not demonstrate satisfaction of their inactive mates.

Creating a revision and saving are separate actions. After Apply the document
is dirty. Canceling Save As preserves the created revision, dirty state, prior
file identity and existing file bytes. A subsequent normal Save uses the
existing dialog-granted path. This is a normal authorized document write, distinct
from the linked parent's read-only source grant.

The parent then explicitly selects/reloads the saved source, reviews affected
references, solves and applies its updated embedded cache and accepted byte
digest. Reopening a parent requires selecting its source again; no capability
is reconstructed from a saved descriptor. Editing the source in another
workspace does not fabricate a retained parent read permission.

## Scope and evidence

This operation authors only the current root revision. It does not introduce
automatic dependency revisions, a release/change-log system, source writeback,
watchers, multi-window synchronization or multi-document transactions. Existing
document versions and unlinked file compatibility remain unchanged. Label
uniqueness is checked in the current graph, not across all files or history.

See [linked sources](ASSEMBLY_LINKED_SOURCES.md),
[original provenance](PROVENANCE.md#assembly-source-revision-fixtures) and
[actual validation](VALIDATION.md#assembly-source-revision-authoring--2026-10-23).
