# Assembly prototype walkthrough

The integration draft is [PR #49](https://github.com/angelcp2802/solidflow/pull/49).
This walkthrough covers a bounded prototype, not the complete assembly scope
or a release. See [validation](VALIDATION.md) for the exact executed cases.

## Reproducible configured document

After installing dependencies, run `npm run build` and
`npm run test:desktop:assembly-configurations`. The latter launches an isolated
hidden production Electron window, uses the real worker and file bridge, then
closes the child and removes its own temporary profile. Its dialogs use
test-owned paths; it does not control an existing application window.

For a manual run, create the original document in a fresh temporary directory:

```sh
node -e "const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'solidflow-demo-'));const file=path.join(dir,'configurations.solidflow');fs.writeFileSync(file,JSON.stringify(require('./scripts/desktop-assembly-configurations-original.cjs')()));console.log(file)"
npm start
```

Open the printed file with **Abrir**. Preserve any existing unsaved document
before replacing it. This original fixture contains two prism prototypes used
twice, with independent literal geometry expectations: four solids, total
volume 68 mm³ and area 172 mm². See its [provenance](PROVENANCE.md#original-persisted-configuration-contexts).

1. Select **Both compact**, then **Right compact** in **Configuración raíz**.
2. Select the `right` scope and occurrence `b`. Change local X from 4 to 6
   and press **Actualizar posición del estado**. This is an authored position,
   not a verified solve.
3. Press **Resolver configuración**. The actual child relation places B at
   local X 10. Press **Cancelar** to restore the committed X 6 scene.
4. Resolve again and press **Aplicar configuración**. Try **Deshacer/Rehacer**.
5. Use **Guardar como**, reopen that file, and verify its selected root and
   complete catalog remain available.

The editor also creates root variants based on Base, selects child variants
and edits visibility, suppression and local pose. Creation controls have pure
coverage; the recorded production-renderer workflow above does not exercise
every authoring control. Suppressing a related component may make its relation
unavailable. Restore that component before solving; relation repair is not yet
available in this view.

## Configured quantities and CSV

With the same original document, open **Lista de materiales**. Its root range
is independent of the editing scope. These counts come from effective piece
occurrences, not native body count or mass.

1. Choose **Both compact** and **Primer nivel**: one S.compact row has quantity
   two. **Con jerarquía** adds A and B rows, each with total two and one per parent.
2. Choose **Right compact**: first level separates S.Base and S.compact. The
   hierarchical view retains their distinct state ancestry. **Solo piezas**
   still gives A twice and B twice.
3. Choose **Right single**: A remains twice and B once because right/B is
   suppressed. Do not solve this state while its active relation needs the
   suppressed component; the table does not certify relation satisfaction.
4. Return to **Both compact**. Choose the table's `right` range and **Solo piezas**:
   A and B each occur once. Selecting an exact member highlights it without
   changing the editing scope or making hidden components visible.
5. Press **Exportar CSV**. Open the resulting UTF-8 CSV to inspect definition
   identity, variant, quantities, full root-relative paths and state ancestry.
   Text cells intentionally carry an initial apostrophe. Canceling the dialog
   preserves the document, saved filepath and history.

The scripted workflow also checks hidden-ancestor filtering, a real export
filesystem error and closing the table while an actual write is underway. Its
dialogs use only isolated test-owned paths. See the [BOM contract](ASSEMBLY_CONFIGURED_BOM.md)
and [actual validation](VALIDATION.md) for boundaries and executed results.

## Scope

The ordinary rigid assembly workspace and configured workspace have different
available controls. The configured view currently lacks relation creation and
repair, interactive constrained dragging, configured interference/geometric export,
part-feature variants and flexible instances. A passing walkthrough does not
establish arbitrary model compatibility, complete mechanical motion, installed
packaging or Windows/macOS/Linux support.
