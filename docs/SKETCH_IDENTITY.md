# Generated sketch identity

Sketch IDs identify saved objects. They are opaque references, not display names,
geometry descriptions or a public sequence for callers to reconstruct.

Offset, mirror, fillet and chamfer allocate identities for newly created geometry
through the shared sketch allocator. Each proposal obtains one UUID namespace,
lazily when its first new ID is needed. A local counter distinguishes its points,
entities and constraints. The allocator checks all occupied profile IDs and its
own allocations; collision checking has a finite bound. It does not mutate the
source profile.

An independent proposal can have different IDs even when its geometry is equal.
Preview and application must consume the same prepared proposal. Rejected
proposals do not replace the source or enter document history. An early rejection
that needs no new object does not request a UUID; a later rejection can discard
identities allocated while constructing its candidate.

Editing an existing object does not regenerate its ID merely because its
coordinates or dimensions change. Surviving source objects retain their IDs.
Serialization, reopening and undo/redo preserve the identities in that document;
they do not rerun an object's creation command. Old documents and original saved
fixtures retain their existing IDs, with no implicit migration or schema change.

The previous first-available-gap allocation could reuse a deleted object's ID.
Fresh namespaces remove that deterministic reuse in normal creation workflows.
The allocator guarantees uniqueness within the current profile and proposal;
there is no persistent registry of every deleted ID. Deliberately rewriting IDs
in a document is outside this continuity contract.

This is a prerequisite for [semantic CAD references](https://github.com/angelcp2802/solidflow/issues/21),
not an implementation of them. A sketch ID alone does not establish which face
or edge a solid operation generated. Native correspondence, ambiguity rejection,
legacy reference compatibility and downstream reconstruction need their own
implementation and evidence.

Regression fixtures for this contract are constructed from public sketch types
in memory. They compare complete validated profiles while replacing only newly
allocated IDs with test roles, and separately check uniqueness, deletion,
recreation and persistence. They do not import private models or external CAD
artifacts. Actual execution results belong in the validation record and PR.
