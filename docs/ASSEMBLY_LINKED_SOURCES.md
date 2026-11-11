# Explicit linked source files

An embedded part or rigid subassembly can carry an optional `sourceLink`:

```json
{
  "kind": "local-file",
  "displayName": "original-prism.solidflow",
  "contentSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

This example digest is opaque syntax. The descriptor records the accepted file
bytes' SHA-256 and a bounded basename. It never contains a path, read capability,
worker review ID or native witness. It is permitted only on embedded definitions,
never on a document root. Exact own data fields, strict basename/digest syntax
and existing complete graph/byte limits apply. Existing unlinked v1/v2 documents
remain valid. Earlier strict readers that do not recognize this optional v2
field cannot open a linked document; unlink and save a copy for those readers.
No document version or graph budget is changed.

## Selection and read permission

The desktop **Vincular archivo…** action selects a `.solidflow` file through a
native dialog. A separate main-process map retains a bounded opaque read-only
capability. Selection never adds that file to the document write grants.
The renderer receives the capability, basename, bounded UTF-8 content and exact
byte digest. Initial UTF-8 BOM is omitted from text parsing but included in the
digest. Malformed UTF-8, oversized/nonregular files and read races reject.

The main process verifies its authorized sender and current canonical path
around every read. An atomic replacement at the same canonical pathname is
allowed between reads; retargeted symlinks or junctions reject. The identity
and modification state of the opened regular file must stay stable during a
read. Errors do not return filesystem paths. Releasing a capability works
during another file operation and does not reinsert it when an authorized read
finishes. Window close clears all grants. There is no arbitrary-path read IPC
or source-file write operation.

## Review and apply

Select an occurrence, then link its exact source definition. For attachment to
unchanged content, comparison uses validated complete cached data: a v2 source
also checks every supplied dependency, including dormant definitions. A digest
label alone is not equality evidence. Metadata attachment/removal still uses
native preview and authenticated Apply.

**Recargar** explicitly reads the authorized source. An unchanged byte digest
creates no history entry. Changed content must preserve source identity and
kind and enters the existing source-review workflow. A v1 part receives a new
opaque revision; a v2 source must supply a different authored revision. All
uses of the exact prior tuple update, including reused, suppressed and dormant
declarations. Existing explicit endpoint repairs and captured-coordinate
continuity rules still apply.

Use [**Crear revisión…**](ASSEMBLY_SOURCE_REVISIONS.md) in the open source
assembly to author that different root revision. Preview and Apply precede Save;
canceling Save As does not erase the created local revision or modify the file.

For a part, the worker privately retains the exact review plan. Only the
review's named pending endpoint repairs can differ before fresh native Solve;
cache, accepted digest, poses, other mate fields and retained endpoints cannot
be replaced through a modified report. The subassembly workflow retains its
existing private plan and bounded decisions. Apply consumes a private native
capability and commits the reviewed cache and descriptor together. Mutating a
returned DTO is never Apply authority. Timestamp comparison cannot change the
actual retained source proposal.

Cancel, failed validation, native rejection and stale asynchronous replies
preserve committed cache, history and recovery. Runtime bindings follow the
current document epoch, definition tuple and accepted descriptor; they are
never serialized or recovered from those labels. The embedded copy remains
usable without the file. After reopening, explicitly select the file again.
Manual source updates without linked-file metadata clear the new outer cache's
old link; historical definitions and imported nested descriptors remain saved.

## Limits and evidence

There is no watcher, automatic reload, source writeback, multi-document
transaction, path search or missing-file recovery. A descriptor is provenance
metadata, not a geometry comparison, file permission or promise of availability.
A successful prism workflow does not establish every topology, assembly size,
file system or platform. Strict readers validate all saved declarations
independently of the descriptor.

Original fixture provenance is recorded in [PROVENANCE.md](PROVENANCE.md#linked-source-file-fixtures).
Actual cases, tolerances and execution limits belong in
[VALIDATION.md](VALIDATION.md#explicit-linked-source-files--2026-10-22).
