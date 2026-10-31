# Configured assembly bill of materials

The configured workspace builds a declaration-only bill of materials from the
complete saved v3 context: source assembly, configuration catalog and selected
root configuration. It does not unwrap the source and count Base instead.
The existing v2 BOM remains a separate consumer.

`buildConfiguredAssemblyBom` in `src/model/assemblyConfiguredBom.ts` validates
that complete context and evaluates its effective occurrence inventory. Its
`configured-assembly-bom` report has `declarationOnly: true`, selected-state
metadata, detached rows and reference diagnostics. It creates no native shapes,
solver result or Apply capability. A piece occurrence counts as one unit even
if its recipe produces several bodies or no geometry.

## Rows, state and scope

Options are `mode`, `includeHidden` and an assembly `scopePath`. Defaults are
`parts-only`, inclusion of hidden occurrences and the root scope `[]`.
Suppression always excludes the occurrence and its descendants. Hidden filtering
respects the effective visibility of ancestors. A suppressed scope, or a hidden
scope with hidden occurrences excluded, produces an empty list. A missing scope
or a path ending at a part is rejected.

| Mode | Grouping and quantities |
| --- | --- |
| `parts-only` | Descendant parts grouped by exact definition ID and revision. Total quantity counts their eligible placed occurrences; quantity per parent is not applicable. |
| `top-level` | Immediate children only. Assembly identity includes its selected configuration, so Base and a named state are distinct rows. |
| `indented` | Assemblies and parts retain their parent state context. Equal repeated assembly states can share rows; different configuration ancestry stays separate. Item numbers, parent keys and depth describe that grouped hierarchy. |

`quantityTotal` is the number of eligible member occurrences represented by a
row. `quantityPerParent`, where applicable, counts that child identity in its
effective immediate parent state. It is not the number of solids or a value
derived from geometry, display names or placement.

Every member retains its full root-relative occurrence path, exact leaf
definition tuple, occurrence names and configuration ancestry. Selecting a
nested scope changes traversal, not the reference frame of those paths. Base
uses `null`; configuration IDs and display names are separate data. Equal names
or geometry do not merge distinct definition IDs or revisions.

For the original two-use S fixture, `mixed` contains S.Base and S.compact:
parts-only gives two A units and two B units, while top-level gives two distinct
S rows. `both-compact` groups the two S.compact uses; `single-right` suppresses
right/B and gives two A units and one B unit. A list scoped to right/S still
identifies its members as `["right","a"]` and `["right","b"]`.

Repairable relation diagnostics remain visible without claiming that the
counted assembly is solved. Stored source-link name and SHA-256 are historical
metadata. They do not verify current file bytes, expose a path or grant access
to a linked file.

## Workspace and CSV

The **Lista de materiales** panel provides the three modes, assembly scope,
hidden filtering and selection of an exact member occurrence for display
highlighting. These are transient view choices. They do not change the source,
catalog, selected root state, history, recovery or saved bytes. Selection and
export are unavailable while a solve preview or file operation blocks them.
Callbacks are bound to the complete current document and the panel's own view
revision, including close/reopen and option changes away and back.

`serializeConfiguredAssemblyBomCsv` and `encodeConfiguredAssemblyBomCsv` rebuild
the report from the complete committed v3 document. A report DTO or display
scene is not an accepted substitute. CSV includes definition/revision,
configuration, quantities, full member paths and ancestry, selected root and
scope, plus historical source-link name and hash. It uses UTF-8 with a BOM,
quoted fields, doubled quotes and CRLF records. Every textual data cell has an
initial apostrophe to retain literal text in spreadsheet applications; quantity
cells remain decimal integers. This text policy is visible in the panel.

NUL and isolated Unicode surrogates are rejected. CSV output, including expanded
paths and ancestry, is bounded to 20 MiB; overflow withholds the complete output.
The source keeps the existing v3 document and occurrence limits, with at most
4096 BOM rows and 4096 represented members. No partial report is returned on a
budget failure.

An empty list exports the fixed header only; there are no data rows in which
to repeat the selected root and scope.

Desktop CSV uses the existing restricted export bridge, without adding a file
permission. The browser alternative owns and releases its download URL. A
canceled export changes no document or saved-document filepath. Closing the
panel cannot retract a native write already underway; late UI feedback is
discarded, and the file-operation gate remains held until the call settles.

## Boundaries and review entry points

This list does not certify material, mass, native geometry, relation
satisfaction, manufacturing suitability or current linked-source content. It
does not implement configuration-aware interference, geometric export, relation
editing, part-feature variants or flexible instances.

Review `assemblyConfiguredBom.test.ts`, `assemblyConfiguredBomCsv.test.ts`,
`ConfiguredAssemblyBomPanel.tsx` and the BOM ticket/export helpers in
`configuredAssemblyUi.ts` alongside the workspace integration. Original fixture
provenance is recorded [separately](PROVENANCE.md#original-configured-bom-and-csv-cases).
See [configuration persistence](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md) for the
saved context and [VALIDATION.md](VALIDATION.md) for actual executed results.
The existence of these APIs or controls is not a cross-platform acceptance claim.
