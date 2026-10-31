# Replacing a part component

This operation replaces an embedded part with a **different part identity**.
Updating a revision of the same part remains the separate **Actualizar pieza**
workflow. Replacement of subassemblies, linked external files and configuration
mapping remain separate work. This does not change the version-2 file format.

## Scope and sources

The request contains a full root-relative occurrence path, the current exact
definition ID/revision, a validated version-1 replacement part, its embedded
revision, `mode: 'selected' | 'all'`, and `ancestorRevisions`.

- **Selected** changes one expanded occurrence, including a leaf inside a reused
  nested subassembly. Each ancestor on its path receives a separate definition
  revision. The original definitions and other expansions remain intact.
- **All** changes every stored declaration using the exact selected source
  tuple, including suppressed and dormant definitions. Other revisions of the
  same part ID remain unchanged. This mode does not fork ancestors.

Selected requests provide one fresh ancestor revision per path level below the
root; all requests provide none. These labels are allocated once for the staged
operation. A destination tuple may be reused only when it already contains the
same fully validated part document. A conflicting kind, content, source tuple
or ancestor revision rejects the complete plan.

Selected mode copies the ancestor definitions along the chosen path and routes
only that expansion through the copies. Copies retain their definition ID,
occurrence/mate IDs, names, poses, flags and creation dates; their revision and
modification dates identify the new declaration. This isolates an expansion; it
does not implement flexible subassemblies. The root timestamp advances, and the
old sources remain embedded. There is no fallback to changing a shared
declaration when the selected operation exceeds a budget.

The selected occurrence keeps its ID, name, starting pose and fixed/visible/
suppressed flags. A subsequent Solve may move free components to satisfy the
relations. Existing document limits, including definition, declaration,
expanded-hierarchy, depth and byte limits, still apply atomically.

## References and native geometry

The plan records affected occurrence declarations, full expanded paths, copied
scopes, original/new endpoint locators and the desired current component.
Originally current component/principal-plane references may retain their local
frame intention with an updated tuple. A copied ancestor has the same local
frame. This does not establish geometric correspondence.

Every affected face or LINE edge requires an explicit choice, even if names,
feature IDs, keys or geometry match. Previously stale references do not become
current automatically. A stale path that continued through the old part is kept
as the original diagnostic; its manual repair targets the actual affected leaf.

The worker builds a real native catalog from the replacement part at its local
frame, separately from the proposed placed assembly scene. The UI labels these
choices as local coordinates. This permits explicit reference selection for
suppressed or dormant declarations without inventing placed geometry for them.
Each choice must retain the reference kind and plane/axis/LINE/cylinder-surface/
sphere-surface purpose and must belong to the exact desired component and
current catalog. Names, ordinals, nearest surfaces and a renderer-supplied
candidate cannot provide authority.

All affected pending endpoints require repair or explicit removal of their
relation, including inactive declarations. Native placement and active relation
satisfaction are authenticated by a new Solve. Editing inactive metadata does
not prove its future placement or satisfaction after activation.

Source updating and replacement enumerate saved references through one
exhaustive mate-family inventory. The fixed declaring-scope carrier remains an
explicit null role, rather than an absent endpoint. Replacement repair decisions
are bounded by the pending endpoint count in the worker-owned review; every
decision must still address one unique pending locator. This does not increase
document budgets, introduce another mate family or attest a reference's native
geometry.

## Mechanical state and one Apply

The worker retains the original committed document and the complete private
plan. Its comparison baseline contains the same copied hierarchy with the old
leaf sources. Unaffected copied mechanical relations therefore pass the normal
proposal, unavailable-coordinate and native source-continuity guards under
their actual new scope identities. A renderer cannot claim scope equivalence or
manufacture an angular zero.

An affected gear, screw or rack/pinion that changes component identity or repairs
a previously unavailable frame needs explicit native recapture or explicit
removal. Repairing a face alone does not
authorize retaining its old zero or winding data. Recapture resolves and
captures privately, preserving the mate ID and user parameters; only the final
complete Solve can publish Apply authority. There is no intermediate Apply.
An unavailable or incompatible recapture rejects; it does not silently reset an
inactive chart or drop a relation.

Review returns a staging `reviewId`, not an Apply token. Later RPCs submit only
reference, removal and recapture decisions addressed to that private inventory.
The final one-use Apply token remains bound to the original complete committed
document and the worker-owned solved proposal. A wrong or old review ID cannot
cancel a newer operation. A matching review with a changed base is revoked.
Targeted cancellation or a late response cannot consume another review's token.
Other document/mode operations invalidate the current staged operation.

The editor blocks saving, exports and unrelated edits during staging. Changes
to decisions revoke an old preview while retaining the editable review.
Cancel restores the committed scene. Apply makes one history entry; Undo/Redo
and serialization operate on that complete snapshot, including new definitions,
repairs and mechanical captures. Native failure, cleanup failure, stale input
or cancellation must not edit the committed document, recovery or saved file.

The public tests use original synthetic sources. Their provenance and analytical
oracles belong in [PROVENANCE.md](PROVENANCE.md); executed commands, source
bindings and platform limits belong in [VALIDATION.md](VALIDATION.md). This
contract alone is not an execution result or complete assembly acceptance.
