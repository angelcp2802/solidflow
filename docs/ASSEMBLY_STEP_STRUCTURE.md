# Native structural STEP prerequisite

This dependent proposal supplies standalone native import/export functions and
an explicitly bounded structural reader. The separate
[editor integration](ASSEMBLY_STEP_EDITOR.md) adds explicit import/export
commands and worker routes using the existing file bridge. The
existing [flat export](ASSEMBLY_EXPORT.md) and [part import](STEP_IMPORT.md)
commands retain their formats. Broader structural interchange acceptance
and the full assembly demo remain open. The [explicit body base](IMPORTED_BODIES.md)
extends native import to multibody products without splitting product identity.

## Exported graph

`exportAssemblyStepStructureNative` reconstructs an independent committed v2
document with the pinned native CAF writer. Each active ID/revision tuple gets
a separate definition label. Nested definitions are reused through ordinary
STEP product usage relationships; geometry or display-name equality never
deduplicates product identity. Occurrences carry names and local proper rigid
placements. The output is a single autonomous AP242 file in millimetres.

All hidden active occurrences participate. Suppression excludes the entire
branch; dormant geometry is not reconstructed. An active empty assembly or
failed/empty part rejects the export. This empty-assembly rejection is stricter
than the flat export's expanded-leaf policy. The exporter constructs a local
compound for a multibody part without fusing its bodies. The original two-body
case writes one product with two solid items; its reused nested round trip is
checked separately from other representations and geometry. Native inventories and output retain the
existing 4096-body/solid and 256 MiB bounds. The document's own definition,
occurrence and depth budgets also apply.

Mates, parametric history, visibility/suppression declarations, original
SolidFlow IDs/revisions and material/body IDs are not a STEP persistence
contract. Product identity within the STEP graph, reuse, names and proper
placements are separate from those application-specific attributes.

## Admitted import profile

The Part 21 syntax reader bounds input to 8 MiB, 600,000 tokens, 100,000
entities and parameter nesting depth 32. It distinguishes quoted text from
enumerations and references, checks duplicate and missing entity identities,
and rejects external files and additional sections. This is not an EXPRESS
schema validator. Structural names accept ASCII with the implemented Part 21
escapes or UTF-8; unsupported encodings/escapes reject the input. The existing
unit gate retains a separate metadata-ignoring legacy decoding mode.

`readStepAssemblyStructure` admits an explicit AP242 profile: one product
definition/shape association per product, placement-only `SHAPE_REPRESENTATION`
assemblies, parts with 1–256 `MANIFOLD_SOLID_BREP` items in ordinary or advanced
BRep shape representations, NAUO/CDSR usage links, and
three-component representation relationships with an item-defined transform.
Child and parent representations and frame memberships must agree. The local
placement is target-frame times inverse(source-frame), with explicit 3D axes;
direction ratios supply frame orientation rather than a length scale. Mixed
length contexts, alternative/mapped/reversed relationships, missing axes,
unsupported structural entities, multiple roots, cycles, inaccessible products
and exceeded graph budgets reject the whole input. Limits are 512 product
definitions including the root, 4096 expanded occurrences, 4096 expanded solids
and depth 32. A product cannot mix its own solid items with assembly children.
Representation subtype alone never decides whether a product is an assembly.

The field roles follow the native library's
[assembly relationship construction](https://github.com/Open-Cascade-SAS/OCCT/blob/master/src/DataExchange/TKDESTEP/STEPConstruct/STEPConstruct_Assembly.cxx)
and [reader transformations](https://github.com/Open-Cascade-SAS/OCCT/blob/master/src/DataExchange/TKDESTEP/STEPControl/STEPControl_ActorRead.cxx).
The installed runtime is checked separately; upstream declarations alone are
not evidence that a binding can be constructed or used safely.
These mutable upstream references explain field roles; they are not a claim
that this source revision is identical to the installed binary.

## Native transfer and persistence

`importAssemblyStepStructureNative` requires an assembly root and resolves each
admitted part representation by its actual Part 21 label in the native model.
A separate entity transfer recovers single-solid prototypes or each explicitly
associated multibody solid in source-local coordinates.
Native geometry is never inferred from the parsed graph or a tessellation.
The existing closed-single-solid, valid-positive-BRep and no-loose-topology
checks apply through a fresh reader of each autonomous part base.

Each single-solid prototype becomes a normal v1 `importedSolid` base. A
multibody prototype becomes one v1 `importedBodies` base with separate owned
one-solid sources and stable saved body assignments. Sources contain STEP
bytes, canonical base64 and SHA-256. A validated v2 document retains the real
definition graph, reuse, names and millimetre local placements. Fresh application
IDs derive from the validated input bytes and product labels. Each import gets
a fresh revision namespace, so new base bytes and creation metadata cannot alias
earlier imported content under the same tuple. Original application IDs and
feature histories are not reconstructed. Imported
occurrences are visible, active and unfixed, with no inferred mates. Names must
fit the saved document's existing 1–200-character rule.

Per-source 8 MiB limits and the final exact 20 MiB serialized-document limit
both apply. The original input file is unnecessary after import. A multibody
product stays one part definition; its bodies receive separate explicit
references. All body sources must transfer and validate before the document is
returned. Invalid, open or unsupported bodies reject the complete import.

## Ownership and evidence

Native wrappers and virtual files remain owned until cleanup succeeds; cleanup
failure withholds the result and propagates a fatal aggregate. Temporary paths
must be unused, writer global settings are restored, and unexpected external
export files reject publication. The pinned document constructor uses a managed
native handle; no manual reference-count adjustment or private binding metadata
is used by production code.

Original fixtures, formulas and tolerances are documented in
[provenance](PROVENANCE.md#original-structural-step-prerequisite). Configured
tests and an implemented function do not establish an executed result. Consult
[validation](VALIDATION.md) for source-specific commands. Programmatic graph,
native geometry and saved round-trip evidence do not establish editor/file-IPC
interaction, interoperability with arbitrary AP242 files, hosted CI,
installed-package operation or another platform.
