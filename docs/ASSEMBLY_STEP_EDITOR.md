# Structural STEP in the editor

The explicit structural commands use the bounded native profile in
[ASSEMBLY_STEP_STRUCTURE](ASSEMBLY_STEP_STRUCTURE.md). They exchange product
definitions, reused instances, names, closed solid geometry and proper rigid
placements. Mates, feature history, application IDs, source links, visibility
and suppression declarations are not STEP persistence guarantees. This local
increment does not complete arbitrary STEP interoperability or the assembly demo.

## Import as a new assembly

Choose the structural assembly import command in either workspace. It opens
one `.step` or `.stp` file and prepares an autonomous version-2 document in the
CAD worker. All product and solid transfers, closed-solid checks, source
integrity, an independent complete native scene build and the final
saved-document size check must succeed before the
replacement decision. A multibody product stays one part with explicit body
assignments. Reused products stay reused; equal names or geometry do not merge
their identities.

Finish pending edits first. A canceled file selection, unsupported file,
rejected replacement or stale response keeps the current document, history,
saved-file identity and recovery. Successful import starts a new unsaved
assembly with fresh history. It is a document replacement, not an undoable
insertion, linked reload, automatic repair or an Apply capability. Save As a
`.solidflow` file to retain the autonomous imported bases. The source STEP path
never becomes a document write target, and saved reopening requires no access
to that neutral file.

Imported occurrences are visible, active and unfixed. No mates are inferred.
The workspace reconstructs the accepted document through its normal worker
build. Read the native profile for the supported representations and refusal
conditions; an assembly root is required. The existing part command
**Importar STEP…** retains its separate single-solid contract.

## Insert into the current assembly

Choose **Insertar STEP estructurado** in the assembly workspace to embed a
neutral assembly as a reusable component in the current scope. This adds one
ordinary history state while retaining the parent's ID, revision, name, saved
file path and saved baseline. Undo/Redo preserves the exact inserted identities.
The source root becomes one reusable assembly definition; its original nested
product boundaries and multibody parts remain intact.

The worker imports the neutral source, composes it through
[the existing component identity policy](ASSEMBLY_COMPONENT_IMPORT.md), then
independently rebuilds the entire candidate before the editor can commit.
Existing native part shapes, assembly previews and source-review capabilities
are not consumed by this preparation. The insertion does not solve or repair
existing mates or grant Apply authority. Finish pending edits first.

The insertion scope is captured before file selection. Changes to the parent,
scope or operation generation invalidate the pending selection, including
leaving a scope and returning to it. Inserting into a shared assembly definition
changes that declaration in every occurrence of the definition. No independent
per-instance copy is invented. Cancellation, unsupported input, composition or
native-scene failure leaves the parent, history, recovery and file identity in
place.

The accepted component can be reused through the existing component source
control. Importing the neutral file again deliberately creates a fresh source
revision; names, geometry or truncated hashes do not deduplicate sources. All
embedded bases remain autonomous after saving and reopening. The original
neutral path grants no write authority and is not persisted as a linked source.
This command retains the structural profile's assembly-root requirement and
existing byte, graph and scene budgets.

## Export a committed structure

The assembly export panel offers **STEP estructurado** alongside **STEP plano**
and STL. Structured export rebuilds a detached committed document with the
native CAF writer and outputs autonomous AP242 in millimetres. It includes
hidden active occurrences and excludes suppressed branches. Active empty
assemblies and failed or empty parts reject the entire structured export.
Positions come from the committed document, not an outstanding preview or
cached display mesh; export does not solve constraints or certify their
physical satisfaction.

Pending edits, movement previews and source/replacement stages must be applied
or canceled first. The transaction checks the committed signature, confirmed
scene and workspace generation before reconstruction and file output. Export
and dialog cancellation do not alter document history, recovery, saved state or
the `.solidflow` path. Once the existing desktop dialog/write call has been
issued, the renderer cannot retract that write after an external unmount; it
ignores stale completion instead.

Separate `import-assembly-step`, `insert-assembly-step` and
`export-assembly-step` worker requests own
their temporary native resources. They do not consume an existing part shape,
assembly preview or source-review capability. Input snapshots are detached
before asynchronous worker initialization. The renderer uses the existing
restricted STEP read and geometry write IPC; no new filesystem privilege or
saved path is introduced. The structural UI choice maps to the ordinary
`.step` extension at that bridge.

## Limits and evidence

Input is at most 8 MiB. Output is at most 256 MiB. Consequently a valid export
can exceed the current import limit; no round-trip guarantee follows for that
file. All autonomous sources and metadata together must fit the exact 20 MiB
serialized `.solidflow` budget. Existing graph, expanded-solid and parser
budgets remain in force.

Pure transaction tests establish cancellation, freshness and ownership rules.
Native tests establish graph membership and geometry. The dedicated production
renderer workflow exercises real worker requests, actual output bytes and
restricted file IPC with original fixtures and test-owned dialog selections.
Planar mesh area is distinct from native BRep area; their evidence must be
reported separately. Configured checks are not executed results. Consult
[validation](VALIDATION.md) and
[editor provenance](PROVENANCE.md#original-structural-step-editor-workflow) and
[insertion provenance](PROVENANCE.md#original-structural-step-insertion-workflows)
for actual cases, commands and tolerances. Browser fallback, human dialogs, independent
CAD interoperability, installers and other platforms need their own evidence.
