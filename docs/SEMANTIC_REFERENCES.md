# Semantic CAD references

## Current behavior and compatibility

The active engine uses conservative `face-v1|` and `edge-v1|` geometric keys. A unique exact key is required when resolving a saved selection. Changed geometry or ambiguous correspondence can require reselection. Existing keys, fixtures and rejection regressions must retain that behavior; loading a document must not reinterpret a v1 key as a semantic reference.

[Issue #21](https://github.com/angelcp2802/solidflow/issues/21) tracks references that survive edits to an existing generating entity. The experimental opt-in producer and pure v2 descriptor modules are being developed separately from the active engine. They do not yet establish editor support, downstream reconstruction or a general persistent-naming solution. The document parser and active resolvers continue to accept their existing formats until explicit integration is reviewed and validated.

## Identity contract

An experimental semantic reference identifies the generating operation, exact historical source, sketch entity and topological role. Its structural context includes entity kinds and connectivity, material-region boundaries and relevant discrete operation/constraint branches. It excludes coordinates, dimensions, radii, geometric rank, enumeration indices and native pointers or hash codes.

Boundary cycles are canonicalized using saved entity identities, independent of the starting traversal position and entity-array order. Hole membership is unordered. Changing the region's membership, connectivity, entity kind, generating source or relevant discrete branch invalidates its descriptors conservatively. Editing a radius or position alone must not substitute a different entity when two holes exchange geometric order.

The initial roles are start/end cap, side face of an entity, and start/end rim of an entity. Start and end refer to the generating extrusion, rather than sorting world coordinates. A signed-direction branch is explicit. Vertical joins, circular seams, split/merged targets, Boolean descendants and other unproved roles receive no semantic reference.

Generated objects must receive fresh identities on creation; ordinary edits, serialization and undo/redo preserve surviving identities. [PR #24](https://github.com/angelcp2802/solidflow/pull/24) tracks that prerequisite for offset, mirror, fillet and chamfer creation; it must be integrated before enabling normal v2 creation workflows. An entity ID alone does not prove continuity: a circle converted into an arc can retain its ID, and must still change the structural descriptor. Deliberately replacing geometry while reusing the same identities in manually edited JSON is outside this continuity claim.

V2 face and edge keys use distinct version prefixes followed by a canonical lowercase SHA-256 digest. An exact source scope and a unique match are required. A stored v2 key must never fall back to a nearest shape, enumeration index or v1 geometric alias.

Catalog selection must preserve the document's existing limits: up to 256 faces and 4096 edges. Empty face selections retain their operation-specific meaning; edge operations require a nonempty selection. Multiple keys or versions naming the same native target remain a duplicate selection.

## Native provenance and ownership

The first producer is opt-in for a finite nonzero extrusion of one planar material region with holes. The existing extrusion, revolution and compound paths remain independent. Unsupported multiple regions or islands are rejected by this opt-in API; a future caller can explicitly choose the existing construction path for ordinary modeling. Provenance is available only after verifying every claimed history result's type, cardinality and unique membership in the actual body and appropriate cap. Mapping must be unique in both directions. Failure to establish provenance after a valid body is built leaves that geometry usable while reporting that semantic references are unavailable.

The pure identity layer requires boundary connectivity through saved point IDs or explicit coincident constraints. Joins established only by geometric tolerance do not receive v2 references in this increment. Structural descriptor checks do not establish native geometry, nesting or cleanup; those remain separate responsibilities.

Wire insertion and face repair can replace native identities. The producer must follow the edge returned after insertion through final face construction, and verify its correspondence before consulting prism history. Input edges, intermediate copies and final targets are not interchangeable merely because their coordinates agree.

The producer owns its body and retained face/edge wrappers. Binding targets are borrowed views valid only for that owner's lifetime. Transferring the body is a one-time action; disposing the owner still releases retained mapping wrappers. Each owned wrapper has one release path, including exceptions. No live native object enters a saved document or historical descriptor catalog. Source-level ownership reasoning and calls to wrapper disposal do not by themselves establish native leak freedom.

Cap support frames should be anchored to the generating plane and extrusion side, with a verified actual normal. Editing an interior hole must not move a supported sketch merely because a surface sampling parameter changed. Current placement data belongs to the resolved binding, not to its identity digest.

## Integration requirements

Activation requires coordinated engine, document and editor changes. The first eligible body is a finite entity-profile extrusion without an end condition or Boolean output. Its start offset and frame must follow the existing signed and symmetric extrusion rules exactly. Build semantic context from the relevant ordered dependencies, preserving the legacy lineage unchanged; the experimental context is not a replacement for the complete document history.

Retain the provenance owner until all native consumers and final picking have finished. Historical support descriptors must copy references, aliases and frames without retaining native wrappers; operations that need historical native faces require a separately owned catalog. A failed operation must preserve the metadata belonging to the last valid body. Unsupported output correspondence must not silently inherit an earlier body's semantic references.

Picking needs one entry per actual shape and serializable aliases so existing v1 selections remain highlighted and removable when a verified v2 key becomes primary. Exact-key comparisons in the viewport, property panels and hole support lookup need explicit alias handling. Preserve saved v1 references; a stored v2 selection never resolves through a v1 alias. Strict parser acceptance and the edge/face consumers must be integrated together rather than enabling v2 only in the picker.

These integration requirements are pending. The opt-in modules and their tests do not establish the engine, document or editor behavior described here.

## Acceptance evidence still required

Use original Cartesian fixtures in millimeters, including a 50 by 20 plate of thickness 4 with two unequal circular holes. Check the single-solid valid BRep and analytical volume, surface area and bounds. For hole radii `r1` and `r2`, the planar material area is `1000 - pi * (r1^2 + r2^2)`, its boundary length is `140 + 2 * pi * (r1 + r2)`, volume is four times the material area, and total surface area is twice the material area plus four times the boundary length.

Exercise shared offset distance, individual source radius and source position edits, including radius-order exchanges. A selected hole-rim finish and a feature supported by a perforated cap must rebuild from their intended sources, then survive save/reopen and undo/redo. Deleted/recreated sources, type changes, suppression, signed-direction changes and ambiguous or split/merged correspondence require explicit rejection cases. Successful downstream operations also need fresh STEP reconstruction and appropriate independent geometry checks.

Record commands, cases, tolerances and actual results in the validation record and pull request. A native experiment, pure descriptor test or initial-model desktop smoke does not establish real editor interaction. The experimental modules remain unverified until their tests and required project checks actually run.
