# Assembly bill of materials

**Lista de materiales** opens a nonmodal table below the viewport. It reads the
confirmed version-2 document. Pending mate, source-update or motion previews do
not supply its rows; selection and export remain disabled until pending work is
applied or cancelled. Table/filter/selection/export actions do not edit history,
recovery or saved assembly bytes and never grant Apply authority.

## Counting and identity

`buildAssemblyBom` validates the complete document/graph, then walks only
root-reachable occurrence declarations. It neither builds native solids nor
composes poses. Thus an otherwise valid declaration can be counted even if its
native reconstruction fails or its world-placement arithmetic overflows. This
is a declaration inventory, not a statement of geometry validity, material or
mass. A part occurrence counts once, including zero-body and multibody parts.
Unused definitions do not count.

Suppression always prunes the complete branch. Hidden active occurrences are
included by default; disabling **Incluir ocultos** prunes hidden ancestors and
their descendants. A descendant's own visibility cannot override a hidden
ancestor. Fixed state has no effect on quantity. There is no implicit custom
exclude-from-BOM property or configuration inference.

| Mode | Grouping and quantity |
| --- | --- |
| Solo piezas / `parts-only` | All active part leaves group globally by exact definition ID and revision. Per-parent quantity is undefined and displayed as a dash; total is the number of full-path members. |
| Primer nivel / `top-level` | Only root occurrences, including subassemblies, group by that exact tuple. Per-parent and total quantities count their root occurrences. |
| Con jerarquía / `indented` | Siblings group by exact tuple inside their parent row's definition-ancestry context. Per-parent quantity counts matching eligible child declarations in one parent; total counts all full-path members under the aggregated parent instances. |

Two revisions or two different identities remain separate even if names and
geometry match. Reused nested occurrences retain complete root paths and exact
definition tuples. Equal leaf definitions under different parent contexts keep
separate hierarchical rows. Canonical names come from definitions; member
choices retain occurrence names and complete paths. Choosing one member selects
exactly that occurrence in the existing tree/viewer. Hidden components are not
made visible and a row containing several members is not a multiple selection.

Row keys encode mode and tuple ancestry directly, without recursive JSON
escaping. Numbers follow filtered declared encounter order (`1`, `1.1`, ...).
They are presentation values that may change after filtering or structural
editing, not saved identities. Returned DTOs have no aliases into the input.
Row/member/traversal admission uses the existing 4,096 occurrence envelope;
limits are not native-time or peak-memory claims. Failure withholds the complete
report rather than clipping it.

## CSV contract

Export uses the current committed document and current table options,
independently of which member is selected. Columns are fixed:

`Item, Type, Name, Definition ID, Revision, Quantity per parent, Total quantity, Occurrence paths`

Every field is quoted; embedded quotes double, separators are commas and lines
end in CRLF. Encoding is UTF-8 with one initial BOM. All textual data columns
carry exactly one added apostrophe before their original value, including IDs
and the JSON array of complete occurrence paths. This literal-text marker is
added even if the original begins with an apostrophe. Quantity fields are
positive safe integers without that marker, or empty for undefined per-parent
quantity. Fixed headers have no marker. Display values and saved identities
remain unchanged. A schema-aware consumer can remove exactly one marker from
text columns; ordinary CSV parsers see it as data. No claim is made about later
editing/reimport or execution in arbitrary spreadsheet software.

NUL and unpaired UTF-16 surrogates in exported text reject; they are not silently
normalized or substituted. Occurrence path elements are checked before JSON
escaping. Complete encoded output, including BOM/quotes/CRLF, is capped at
20 MiB. No partial output is returned.

Desktop CSV uses the existing restricted `document:export` transport with a
separate 20 MiB UTF-8 admission policy. It copies the exact byte view before the
native Save As dialog, rechecks sender/main-frame identity afterward, requires
the selected `.csv` extension and writes atomically. It grants no document-save
path permission. STEP/STL transport remains separate from CSV's declaration
meaning; `CadExportFormat` and the geometry worker are unchanged. Browser
downloads use a CSV Blob and are a separate path from native dialogs.

The [fixture provenance](PROVENANCE.md#assembly-bom-and-csv-fixtures) records
original count/byte expectations. Authored tests and configured workflows do
not establish a pass; inspect the source-specific [validation](VALIDATION.md).
Configurations, custom purchasing metadata, material/mass, promoted/hidden
child BOM policies, drawing-attached tables, linked-file provenance and the
remaining complete assembly/CAD scope remain required work.
