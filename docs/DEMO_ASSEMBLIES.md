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

## Edit a relation in one state

Use a fresh copy of the original document generated above. Keep **Right compact**
selected and choose the `right` scope in **Ámbito de configuración**.

1. In **Relaciones del estado**, edit **Original signed X distance**. Set
   **Distancia de relación configurada en mm** to 6. This draft changes no saved
   or committed value.
2. Press **Vista previa de relación configurada**. The actual native solve puts
   right/B at local X6, while left Base/B remains at X10. The viewport still
   contains four solids, volume 68 mm³ and area 172 mm².
3. Press **Cancelar**: right/B returns to its committed X4 placement. The form
   retains the draft. Preview again, then **Aplicar configuración** to commit.
4. Try **Deshacer/Rehacer**. Choose **Both compact** to see both uses of the
   same compact state at local X6. These uses share an intrinsic state.
5. Choose the `right` scope again. **Nueva relación configurada** can add a
   distance zero between `a`'s principal YZ plane and the scope's principal YZ
   plane. Name it, preview and Apply. Its **Suprimir** and **Eliminar** actions
   also require preview/Apply. Neither changes the original prisms' geometry.
6. Use **Guardar como**, then reopen the file. Both the named relation list and
   its selected root state persist. **Resolver configuración** freshly checks
   the reopened state; Cancel preserves its committed declarations.

`npm run test:desktop:assembly-configured-relations` executes this bounded path
in the isolated production renderer and also checks Base-edit isolation,
history, recovery, canceled Save As and normal Save. Its dialogs use test-owned
paths. Read the [editing contract](ASSEMBLY_CONFIGURED_RELATION_EDITING.md) and
[validation record](VALIDATION.md) for the actual executed results.

## Capture a mechanical relation in one state

Generate an original mechanical document from its public dimensions:

```sh
node -e "const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'solidflow-demo-'));const file=path.join(dir,'mechanical.solidflow');fs.writeFileSync(file,JSON.stringify(require('./scripts/desktop-assembly-configured-mechanical-original.cjs')('gear')));console.log(file)"
npm start
```

The recipe accepts `lock`, `concentric`, `gear`, `screw` and `rack-pinion`.
Each has two reused scopes with original R2/H4 and R1/H3 cylinders and a
2×3×4 prism. Six solids have volume 38π+48 mm³ and area 64π+104 mm².

1. Open the printed file. Select `right` in **Ámbito de configuración** and
   press **Nueva relación mecánica configurada**.
2. Choose the family and name it. Lock takes components `a` and `b`; concentric,
   gear and screw take their current cylinder axes. Rack uses `a`'s axis and an
   explicit material LINE from `rack`. Gear can use the scope or `rack` as carrier.
3. Press **Vista previa de relación mecánica configurada**. Capture and final
   verification run natively for both shared uses. Locked concentric and screw
   align the current axes before capture. Try **Cancelar**, retry and Apply.
4. Edit the relation. **Conservar captura y vueltas acumuladas** retains its
   neutral while parameters change. Changed references require explicit
   **Volver a capturar la posición actual**, which starts a new neutral.
5. Try Undo/Redo. **Right compact** shows the untouched Base use alongside the
   edited named use. Save As, reopen and solve again to verify persisted captures.

`npm run test:desktop:assembly-configured-mechanical` runs five separate bounded
production-renderer cases. Read the [capture contract](ASSEMBLY_CONFIGURED_MECHANICAL_CAPTURE.md)
and [validation record](VALIDATION.md) for actual execution; configuring these
commands does not establish a completed assembly demo or general motion coverage.

## Scope

The ordinary rigid assembly workspace and configured workspace have different
available controls. The configured view offers graphical relation creation/editing
for the families listed in its form, plus suppression/removal. New mechanical
captures use the separate native form above. Profile/path compound forms and
general reference repair remain unavailable there, alongside interactive
constrained dragging, configured interference/geometric export,
part-feature variants and flexible instances. A passing walkthrough does not
establish arbitrary model compatibility, complete mechanical motion, installed
packaging or Windows/macOS/Linux support.
