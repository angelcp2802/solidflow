# Importing reusable components

The assembly workspace's **Importar componente** action embeds a SolidFlow
part or assembly without replacing the open parent document. A part keeps the
existing v1 insertion policy. An assembly source becomes a reusable rigid
subassembly, with its root contents and full definition library preserved.
Import itself creates no external filesystem link. Optional embedded
[linked-source metadata](ASSEMBLY_LINKED_SOURCES.md) is preserved as data;
reading its source requires a separate native selection in this session.

The separate **Insertar STEP estructurado** command admits the bounded native
neutral profile and prepares the complete composed scene before one insertion.
It uses this same definition/scope policy and preserves the parent file identity;
see [structural STEP in the editor](ASSEMBLY_STEP_EDITOR.md#insert-into-the-current-assembly).

## Assembly composition

`insertAssemblyDocument(parent, source, scope?)` validates and detaches both
v2 documents before composition. The source root becomes an embedded assembly
definition with its exact ID, revision, name, timestamps, occurrences and mates.
Its definitions, including dormant definitions, are incorporated without
renaming IDs, revisions, local occurrence paths or mate roles. A null mate owner
continues to mean that imported assembly's own declaring frame.

Definition identity remains the exact ID/revision tuple. An identical existing
definition is reused; object property order does not affect equality. A
different payload under the same tuple rejects. One ID cannot name both a part
and an assembly. Different revisions of the same kind can coexist. An imported
tuple that collides with the parent root rejects rather than overwriting or
embedding that root implicitly.

The final candidate must satisfy the complete existing graph and serialization
limits, including dormant cycles, expanded depth, occurrences, mates, feature
and byte budgets. A rejected composition changes neither input nor history.
The operation creates one fresh occurrence, with identity pose, visible,
unsuppressed and unfixed relative to its containing scope. Internal fixed,
visible and suppressed declarations remain those of the source.

Omitting `scope` inserts at the parent root. An explicit exact assembly scope
uses the existing shared-definition edit policy: every occurrence of that scope
observes its declaration change. Cycles and budgets are checked after insertion
as well as for the source documents. This is a detached declaration operation;
it provides no native geometry, successful solve or Apply authority.

## Editor lifecycle

Native-dialog and browser-file paths dispatch parts and assemblies through the
same component action. The selected file does not replace the parent's file
path or saved baseline. The browser ticket retains the chosen insertion scope
and rejects a response after a different document, request generation or scope.
Changing scope away and back still invalidates that ticket.

Successful insertion becomes one ordinary history state and rebuilds through
the real worker. Reimporting an unchanged assembly creates a distinct
occurrence while reusing its embedded definitions. The existing **Origen del
componente** control can also insert another occurrence of that definition.
Undo/Redo, recovery and saved reopening use the same self-contained document.

Syntax composition and a scene rebuild are separate from native mate solving.
Use an actual solve to verify imported relations in their new containing frame.
Static interference inspection keeps the full imported leaf/body paths; a
container is one original root group, and two reused containers remain distinct
groups. Inspection does not add history or Apply authority.

## Evidence and limits

Original fixtures, analytical transformed bounds and exact source identities
belong in [provenance](PROVENANCE.md). Executed commands and source-specific
results belong in [validation](VALIDATION.md). Configured tests do not establish
an executed platform pass. This action imports SolidFlow documents; the separate
structural STEP command has its own native admission and acceptance. Broader
neutral interoperability, external document links, configurations,
flexible subassemblies and general assembly/demo acceptance remain separate.
