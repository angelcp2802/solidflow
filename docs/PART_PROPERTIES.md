# Part material and appearance

Open **Herramientas → Propiedades físicas** in a part, or the matching right-side
task panel. Assign a material name, a density in kg/m³ and an optional opaque
part colour. **Aplicar propiedades** commits one document-history entry and
rebuilds the part. **Cancelar cambios** drops only the uncommitted fields.
Undo/Redo, recovery and native `.solidflow` saving use the normal document paths.
The editor must finish its current geometry operation before applying properties.

The material declaration is self-contained. There is no certified material
catalogue or automatic density lookup. The user supplies the density; material
names alone do not imply mechanical, thermal or manufacturing properties.

## Saved declaration and compatibility

Part documents retain version 1 and may include these optional fields:

```json
{
  "material": { "name": "Example material", "densityKgPerM3": 1000 },
  "appearance": { "color": "#cc6633" }
}
```

The example is a synthetic density for validation, not a material recommendation.
Names are canonical trimmed NFC text, at most 80 characters with no controls.
Density must be finite, greater than zero and at most 1,000,000 kg/m³. Colours
are exactly seven characters: `#` followed by six hexadecimal digits. Unknown
fields, accessors and invalid declarations are rejected by the model and native
save/recovery boundary.

Old documents keep the absence of these fields and the original blue appearance.
New readers admit both forms, including embedded part documents inside version 2
and version 3 assemblies. Earlier strict readers reject enriched documents with
unknown optional fields. This extension does not claim backward readability by
those older applications. Interchange geometry exports do not carry these native
document properties or the feature history.

## Shared sources and mass

Properties belong to the part source. Occurrences of the same exact definition
and revision share them. Different source revisions retain their own values.
The standard embedded-part editor uses its existing source-review transaction
to update all exact source uses. Configured assemblies display properties from
their supported source snapshots; this adds no new configured source-editing
or per-occurrence appearance override.

Mass is a derived display value, not saved geometry or solve authority:

`massKg = nativeVolumeMm3 / 1,000,000,000 × densityKgPerM3`

The part uses only the healthy, complete, current committed reconstruction.
Editing previews, stale results, missing material and nonrepresentable results
do not become zero mass. Assembly totals likewise require the exact current
confirmed scene and a density for every contributing source. Active hidden uses
contribute; suppressed uses are absent from the native scene. This is a sum of
occurrence volumes, with no Boolean union or overlap subtraction.

## Viewport background

**Ver → Fondo del visor…** offers the original background or a solid colour.
Apply changes the shared profile preference used by part and assembly viewers;
Cancel leaves the committed preference alone. Restoring the default stages the
original background until Apply. This setting never modifies a CAD document,
its dirty state, history, recovery bytes or file permissions. If the profile
cannot save the preference, the dialog reports that it applies for this session.

Execution results and their platform limits belong in [validation](VALIDATION.md)
and the [usable-version acceptance ledger](USABLE_VERSION_ACCEPTANCE.md).
