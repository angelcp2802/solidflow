# Explicit STEP body bases

`importedBodies` is an additive version-1 feature for a part containing separate
closed solids. It keeps that part's component identity; it does not turn each
solid into a new assembly product. The legacy `importedSolid` feature and the
existing single-solid import menu retain their meaning.

## Saved declaration

The feature has ordinary `id`, `name` and `suppressed` fields, plus a dense
`bodies` table of 1–256 entries. Each entry contains exactly `bodyId` and
`source`. A source is the existing autonomous STEP/base64/SHA-256 declaration.
Each source must independently reconstruct exactly one valid positive-volume
closed solid, with no loose topology. Names, equal geometry, coincident bounds
or equal source hashes never merge two declared body identities.

The feature is the first solid operation, even when earlier operations are
suppressed. A document has one imported base: either `importedSolid` or
`importedBodies`. Reference planes and sketches can precede it. Declared IDs
are unique, bounded and included in the existing historical body-ID budget.
An edit cannot relabel, reorder, remove or add allocated body IDs. Source bytes,
name and suppression can change while those assignments remain explicit.

Every output has an exact `{bodyId, sourceFeatureId}` reference. All outputs
share the base feature's producer ID, while each has its own source lineage.
The stored assignment is authoritative for identity; it is never a native solid
ordinal or a match to nearby geometry. Source changes invalidate affected
selections through the existing exact reference checks.

## Reconstruction and downstream operations

The engine validates the complete declaration before native import, then reads
every autonomous solid before staging a catalog. One `stageNewMany` transaction
creates and validates all body copies and their aggregate without fusion.
The catalog and aggregate publish together. A failed source, query or cleanup
cannot publish a successful subset; release failures remain fatal.

The ordinary explicit-body tools then apply: selected cuts, body copies,
combination and exact face/edge/vertex inspection. A cut in one body does not
advance an untouched body's producer. Coincident bodies remain distinct owners.
Suppression removes the whole base's material; reactivation rebuilds the same
declared assignments. History and `.solidflow` reopening retain owned sources
and IDs without requiring the original files.

The property panel identifies the imported base and explains its body count.
It does not reconstruct design history or expose a source-table editor.
Adding this feature does not make it a supported feature-regeneration recipe;
unsupported recipe types retain their existing explicit rejection.

## Bounds and compatibility

Each source retains its 8 MiB limit. The new table's full encoded size is checked
before hashing individual sources, and a document containing this feature must
fit the exact 20 MiB UTF-8 pretty-serialized document budget. Existing legacy
documents are not silently converted or given new body IDs. Older applications
that do not understand `importedBodies` reject the new tag; forward compatibility
is not promised. No filesystem path, native handle or worker capability is saved.

The [structural STEP importer](ASSEMBLY_STEP_STRUCTURE.md) assigns body IDs from
admitted Part 21 solid labels once, then persists the autonomous sources. A
single-solid product continues to use the legacy base. A multibody product
remains one part with explicit bodies. Standard STEP interchange does not
promise to preserve original application body IDs across a new import.

Independent fixtures, tolerances and execution scope are recorded in
[provenance](PROVENANCE.md#original-multibody-step-bases) and
[validation](VALIDATION.md). Programmatic evidence, actual editor interaction,
restricted file IPC and platform acceptance are distinct checks.
