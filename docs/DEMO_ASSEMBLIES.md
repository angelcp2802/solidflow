# Assembly prototype walkthrough

The integration draft is [PR #49](https://github.com/angelcp2802/solidflow/pull/49).
This walkthrough covers a bounded prototype, not the complete assembly scope
or a release. See [validation](VALIDATION.md) for the exact executed cases.

## Selecting references before opening a relation

In the standard assembly, use **Preseleccionar caras** or **Preseleccionar
aristas lineales** in the viewport toolbar. Click a current face/LINE, then hold
Ctrl (or Meta) while clicking another reference. Ctrl/Meta on an already selected
item removes it. You can also select root/component datums in the Components
tree. Rotate or zoom between separate selections as needed.

Choose the ribbon's **Relación**, or **Insertar → Relación de posición…**.
One reference fills Reference 1 and activates Reference 2. Two references fill
both cards in selection order. Review the proposed family, name, orientation
and any numeric value; choose **Vista previa** and inspect the result before
**Aplicar**. Preselection alone does not change the document. More than two
references, unsupported geometry or an obsolete selection require a new
selection rather than silently dropping an item.

A compatible ordinary family is retained. Otherwise planes suggest Coincident,
declared axes suggest Concentric, and mixed/LINE references suggest Parallel.
Choose the required family explicitly; no distance, angle or contact is guessed.
Saved relations and specialized role editors retain their own drafts when
reopened. A pending preview can be reopened through **Relación** without losing
its Apply/Cancel state. The manager's Relations tab remains ordinary navigation.

The automated acceptance uses the existing original drilled prisms in the root
standard workspace. Pure selection tests cover additional nested datum/currentness
cases; they do not establish configured or nested interactive acceptance.

## From a modeled part to a constrained three-component assembly

The `test:desktop:part-sequence` route now continues the actually authored part
into one assembly. It keeps the original two-occurrence transfer and saved
reopening checks before adding a different original prism and relations. The
part remains an embedded, independent copy; its saved source file is not
overwritten. This is a bounded standard-assembly demo, not complete assembly
or human/platform acceptance.

1. Finish the part's successive cuts and bosses. Use **Crear ensamblaje con
   esta pieza**. Name the fixed first occurrence **Base**, reuse its source as
   **Guía**, and move Guía to local `(35,0,0)` with zero rotation. Preview and
   Apply the movement.
2. Import the original 3x2x4 mm prism, name it **Pin**, and preview/Apply its
   initial position `(60,0,20)`, with zero rotation. New instances start at
   identity; use the tree and Properties to distinguish overlapping instances.
3. In Relations choose **Concéntrica**, aligned. Use the explicit origin-axis
   forms to set root **X** as Reference 1 and Guía **X** as Reference 2. Preview
   and Apply. Then **Resolver ensamblaje**, **Bloquear giro** for that saved
   relation, and Apply the newly verified capture.
4. Create a signed **Distancia** from root **YZ** to Guía **YZ**, value **-35**.
   Preview and Apply. The ordered references and negative sign put Guía at X35.
5. Create an aligned **Concéntrica** from Guía **Z** to Pin **Z**. Preview and
   Apply; then solve, capture its rotation with **Bloquear giro**, and Apply.
   Before the final distance, Pin's movement along this axis is still free.
   Capturing rotation preserves the verified current orientation.
6. Create signed **Distancia** from Guía **XY** to Pin **XY**, value **-20**.
   Preview and Apply. Four relations and two captures now close the root scope
   with zero local degrees of freedom, without a temporary anchor.
7. Edit the saved root-to-Guía distance to **-40**. Preview: Guía and Pin both
   move 5 mm in X. Cancel keeps the edited fields for retry and preserves the
   committed document. Retry and Apply, then Undo/Redo. Save normally, reopen,
   solve the saved model and Cancel that final preview.

The final assembly has three solids and two embedded part definitions. Its
per-component material totals V2184 mm3 and A1876 mm2. Base remains at the
origin; Guía is `(40,0,0)` and Pin `(40,0,20)`. The independently captured
orientation determines Pin's bounds; see
[provenance](PROVENANCE.md#original-combined-part-and-assembly-demo--2026-10-29).
The automated route uses actual pointer actions and Tab, with visible native
field setters for values. Origins are selected through explicit forms; this
does not claim viewport-reference picking. Its final reopened solve is a new
native request in the same hidden window/worker. Cancel verifies committed
data and retained scene metadata, not an independent pixel-restoration test.
Exact executed results and any separate native-window check belong in
[validation](VALIDATION.md).

The separate [visible Windows check](VALIDATION.md#native-three-component-demo-and-bounded-rea-outcomes--2026-10-29)
opened this saved assembly in a fresh process, edited -40 to -45 on its own
copy, exercised Cancel/retry/Apply and native keyboard history/save, then
reopened it and checked component selection/Properties and another solve.
It complements the automated authoring route; complete human acceptance and
installed-platform validation remain open.

## Replacing references of a saved parallel/perpendicular relation

1. In the standard assembly's Relations list, choose **Editar** for the saved
   parallel or perpendicular relation. References 1 and 2 show its saved targets.
2. Select either reference card. Use a current face or LINE edge, or expand
   **Referencias de origen** to choose a root/component plane or axis. **Quitar
   referencia** empties that endpoint; both references must be present to preview.
3. Review the relation type and orientation. For a plane and direction,
   perpendicular aligns the direction with the plane normal; parallel makes
   them orthogonal. Position remains free unless another relation constrains it.
4. Choose **Vista previa de los cambios**. Cancel returns to the committed model
   while keeping the edited references for retry. **Cerrar edición** discards
   those changes. Apply commits only the freshly verified preview.
5. Undo/Redo applies to the accepted change. Save and reopen the assembly to
   retain its new references, then solve again to verify their current geometry.

This uses the standard workspace. Exact executed cases and remaining scope are
recorded in [validation](VALIDATION.md).

## Editing a saved working view

In a part, standard assembly or configured assembly, position the camera and
open **Vistas guardadas**. Enter a new name and choose **Guardar vista actual**.
The catalog belongs to that document.

To change an existing entry, select it in the list. Edit **Nombre de la vista
seleccionada** and press **Renombrar**. To replace its orientation and framing,
close the dialog, navigate to the desired view, reopen the dialog, select the
entry and choose **Actualizar vista**. **Mostrar** recalls the saved camera;
Update itself leaves the displayed camera where it is.

Close the dialog before using document Undo/Redo or Save. Completed rename and
update commands are undoable and are included in the ordinary saved document.
Closing the dialog discards a name that has only been typed; it does not undo
an explicit completed command. Names must be unique within the document.
An existing entry can still be renamed or updated when all 64 slots are used.

## Standard three-piece authoring

The bounded automated route includes direct naming followed by a single Fixed
or Save As click. See the latest validation entry for its source snapshot,
full-suite and desktop-smoke results. This is not a complete assembly,
platform or exact interaction-parity claim. Preserve any current unsaved work
before starting an empty standard assembly.

1. From the part workspace use **Crear un ensamblaje**, or use
   **Nuevo ensamblaje** within the standard assembly workspace. Then
   **Importar componente** loads the original 3-by-2-by-4 mm prism. After its
   current rebuild, the new occurrence is selected and Properties opens with
   focus on its name.
2. Name the first instance **Base** and explicitly enable
   **Fijo respecto a su padre**. You can click this control directly after typing
   the name. Insertion itself leaves components free at
   identity pose; no first-component fixing or non-overlapping placement is
   assumed.
   If the name is empty, contains only whitespace or exceeds 200 characters,
   leaving the field shows an error and restores the committed name. Correct
   the name before continuing; rejected text does not change the assembly model.
   In the standard component tree, right-click selects the target and opens
   its commands. **Flotar/Fijar** changes its fixed state; **Propiedades del
   componente** opens the selected name. Escape closes the menu and keeps the
   selection. A datum's menu provides origin navigation without assigning a
   relation. The focused viewport also supports the ContextMenu key; background
   right-click offers camera views and preserves component selection.
3. Return to Components and use **Insertar otra ocurrencia** twice from the
   same reusable source. Name them **Guía** and **Seguidor**. Move Guía to X8 mm
   and Seguidor to X16 mm in Properties, leaving Y/Z zero and no rotation.
   For each move, use **Vista previa del movimiento**, inspect the result and
   **Aplicar**. Selecting a component alone does not move it. After both moves,
   explicitly press **Ajustar** to frame the scene before picking origin
   references. This is a user camera action, not automatic fitting after movement.
4. In Relations, expand **Referencias de origen** and show planes. Choose the
   current scope to pick root YZ as Reference 1, then select Guía and use
   selected-component ownership to pick its YZ plane as Reference 2. Set a
   signed distance of -10 mm. Preview and Apply after fresh verification.
   With these normals, the signed condition is dot(nGuía, pRoot-pGuía)=-10.
5. In the saved relation list, choose **Editar distancia** for that relation.
   Change its name and signed distance to -12 mm. Type remains read-only;
   Name, Orientation and References 1/2 are editable. Keep the original
   references for this walkthrough.
   Use **Vista previa de la distancia editada**, then Cancel. The editor retains
   the changed fields for retry while the committed relation stays at -10 mm.
   The automated route also previews the opposite orientation and cancels it;
   restore **Alineada**, retry and Apply. Undo returns to -10 mm; Redo restores
   the renamed -12 mm relation. **Terminar edición de distancia** leaves the
   editor without applying its fields. Finish editing before creating another
   relation. Cancel coverage checks recovery, history controls, retained fields
   and revoked Apply; it does not measure the restored displayed scene.
6. Relate Seguidor's Z axis parallel and aligned to Base's Z axis. Edit that
   relation to perpendicular, preview, Cancel and inspect the retained committed
   relation. Retry and Apply, then exercise Undo/Redo. The relation leaves
   freedom in Seguidor, so a unique complete solved pose is not the expected result.
7. Create an ordinary **Ángulo** relation using Guía Z as Reference 1 and
   Base Z as Reference 2. Set 30 degrees, preview and Apply. Choose
   **Editar ángulo** for the saved relation, change its name and set 60 degrees.
   Type remains read-only; keep the original ordered references for this route.
   This angle has no Orientation field. Use **Vista previa del ángulo editado**, then Cancel.
   Preview 0 and 180 degrees separately and Cancel each; restore 60, retry and
   Apply. Undo restores the saved 30-degree relation; Redo returns to the renamed
   60-degree relation. **Terminar edición de ángulo** leaves without applying.
   The current model accepts finite values from 0 to 180 degrees; this is not a
   claim of another application's angle conventions. Cancel retains the editor
   and committed recovery/history state and revokes Apply; the route does not
   independently measure the restored displayed scene.
8. In Properties rename
   Seguidor to **Seguidor guardado** and click **Guardar como** directly; reopen
   the saved file and verify that name and all three relations: renamed -12 mm
   distance, perpendicular relation and renamed 60-degree angle. Solve freshly
   after reopening and Cancel.

The original prism has volume 24 mm³ and area 52 mm²; three occurrences total
72 mm³ and 156 mm² of per-solid area. The original recipe is
`scripts/desktop-assembly-basic-authoring-original.cjs`; its automated route is
`npm run test:desktop:assembly-basic-authoring`. See [validation](VALIDATION.md)
for the current route's executed snapshot and results; earlier context-menu and
name-rejection runs are retained there as historical evidence.
A separate manual Windows check reuses this saved original assembly, inserts
one more occurrence with automatic Properties/name focus, and undoes it back
to three solids. It does not manually repeat New/import/relations/Save/reopen.
Another bounded manual check of the earlier `333c09b` portable opens the saved
three-piece assembly, renames Base and toggles Fixed with one click, restores
Fixed, then renames and uses one Save As click. Native reopening retains the
name, three solids and 72 mm³; document comparison retains both relations,
poses, definitions and fixed state. That package predates the rejection fix
and saved-distance/ordinary-angle editing; it does not validate those features.
Automated form assignment is scripted on visible controls, with actual pointer
actions and Tab blur for other names; the two direct name/action checks use
neither Tab nor an intervening rebuild wait. Later controls may use scroll
assistance. Empty, whitespace-only and 201-character rejection checks also use
scripted field assignment followed by actual Tab blur. This is distinct
from a manual walkthrough and does not cover configured/nested authoring,
contact, collision or STEP export.
See [provenance](PROVENANCE.md#original-three-piece-assembly-authoring-case) and
[validation](VALIDATION.md) for independent oracles and actual results.

## Replace a saved standard relation's references

For a saved distance, ordinary angle, coincidence or concentricity, open its
editor and select **Referencia 1** or **Referencia 2**. Use **Quitar referencia**
to clear that slot, then select compatible current geometry or an origin datum.
An angle can also use a straight edge. Clearing a field leaves the saved
relation intact; Preview remains unavailable until both references are valid.

Preview the edited relation, then Apply. Cancel returns to the committed scene
and retains the draft for another attempt. **Terminar edición** discards the
draft. After Apply, Undo/Redo and Save/reopen use the same relation identity.
For a locked concentric relation, changing its component owners requires
explicit **Desbloquear giro**. Replacing an axis on the same ordered owners
preserves the capture, subject to fresh verification.

The separate `npm run test:desktop:assembly-mate-reference-edit` route uses an
original five-prism fixture. See [validation](VALIDATION.md) for its executed
results and [provenance](PROVENANCE.md) for geometry and evidence boundaries.

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

## Author profiles and material paths in a configured state

Preserve your current document before opening another one. Generate fresh copies
of the four original recipes in a new temporary directory; this command writes
no existing project or source file:

```sh
node -e "const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'solidflow-compound-demo-'));const make=require('./scripts/desktop-assembly-configured-compound-original.cjs');for(const [name,family,kind] of [['profile-rectangle','profile-center','rectangle'],['profile-circle','profile-center','circle'],['line-path','line-path','rectangle'],['circular-path','circular-path','rectangle']]){const file=path.join(dir,name+'.solidflow');fs.writeFileSync(file,JSON.stringify(make(family,kind)),{flag:'wx'});console.log(file)}"
npm start
```

Open one printed file normally. It starts in **Both compact**, with two reused
scopes, four solids and one part prototype. The right scope is rotated 90° about
Z and translated 30 mm along root X. These independently authored originals have
different geometry; see [provenance](PROVENANCE.md#original-configured-compound-authoring).

Select `right` in **Ámbito de configuración**, press **Nueva relación compuesta
configurada**, choose **Tipo de relación compuesta configurada**, and enter
**Nombre de relación compuesta configurada**. Use the matching recipe below.
The option labels retain owner, local coordinates/direction and exact underlying
locator. A choice nominates geometry; preview still checks its native purpose
and incidence.

### Rectangle and circular profiles

For `profile-rectangle.solidflow`, choose **Centro de perfiles** and
**Rectángulos · eje material** in **Familia de perfiles configurada**.

1. In **Cara del perfil 1 configurado**, choose A's top face at local Z3 with
   normal +Z. Choose B's corresponding top face for profile 2.
2. In **Arista material del perfil 1 configurado** and profile 2, choose the
   top boundary LINE parallel to local X at Y−2, Z3. For this original pair,
   choose +1 in both **Sentido material** controls, as checked by the recorded
   workflow. The ±1 choice follows or reverses the edge's material parameter.
   The catalog displays a canonical LINE axis; its sign does not establish the
   increasing parameter direction. Check the actual quarter turn in preview.
3. Keep **Orientación de normales de perfiles configurada** aligned, set
   **Desplazamiento de perfiles configurado en mm** to 2 and
   **Cuartos de vuelta de perfiles configurados** to 1.
4. Preview. The rectangle pair uses the chosen material quarter turn; in each
   scope B's bounds are [-2,−3,2]..[2,3,5] before the outer placement.

For `profile-circle.solidflow`, use **Círculos · giro libre**, select A/B top
faces at Z3, aligned normals and offset 2. No material edge or quarter turn is
required. Free roll does not prescribe a unique body spin. The four-solid
volume/area totals are 288/432 for rectangles and 48π/80π for disks, in mm³/mm².

### Material LINE

For `line-path.solidflow`, choose **Punto sobre trayecto LINE**.

1. Choose B's local vertex [-2,3,0] in **Punto del trayecto LINE configurado**.
2. Choose A's top edge parallel to Y at X−2, Z4 in **Arista del trayecto LINE
   configurado**. Choose [-2,−3,4] in **Origen del trayecto LINE configurado**.
   Changing the edge clears its previous origin.
3. Set **Modo del trayecto LINE configurado** to **Distancia** and
   **Valor del trayecto LINE configurado** to 1. Leave position reversal off.
4. Set **Orientación del trayecto LINE configurado** to **Alinear un eje local
   con el trayecto** and
   **Eje de orientación del trayecto LINE configurado** to Y. Set **Giro del
   trayecto LINE configurado** to **Vector UP · cara plana material**, **Eje UP del trayecto LINE configurado**
   to Z, and **Guía UP del trayecto LINE configurado** to A's top planar face.
   Leave both orientation reversals off.

The target material point is [-2,−2,4] in the declaring scope. Total volume/area
remain 384/512. Distance, percentage and Free are distinct intents: Free permits
the straight prolongation; fixed quantities must fit the actual finite length.

### Material circular path

For `circular-path.solidflow`, choose **Punto sobre trayecto circular**.

1. Choose B's local vertex [3,−2,4] in **Punto del trayecto circular configurado**.
2. In **Arco y origen del trayecto circular configurado**, choose A's upper
   material arc with origin [5,−2,4]. The arc and endpoint are one selection.
3. Set **Modo del trayecto circular configurado** to distance from the origin
   and **Valor del trayecto circular configurado** to `1.5707963267948966` (π/2).
4. Select **Alinear un eje local con el trayecto** with axis X, **Vector UP ·
   cara plana material** with axis Z, and A's top material plane using the corresponding
   **Orientación**, **Eje de orientación**, **Giro**, **Eje UP** and **Guía UP del
   trayecto circular configurado** controls. Leave reversals off.

The scope-local point target is [3+√2,−2+√2,4] and its tangent is
[−√(1/2),√(1/2),0]. Total volume/area remain 16π/(24π+64). Free mode requires an
explicit **Dominio del trayecto circular configurado**: finite trim or supporting
circle. Neither is an inferred external application's Free policy.

### Preview, shared state and files

For each recipe, press **Vista previa de relación compuesta configurada**.
Before **Aplicar configuración**, try **Cancelar**: the committed geometry,
recovery and history remain unchanged and the draft stays available for retry.
Preview again, Apply, then try **Deshacer/Rehacer**. The two compact uses share
the edited intrinsic relation; they are not flexible instances.

Edit the new relation from **Relaciones del estado**. Change the profile offset
to 3; for LINE try percentage 25 with **Invertir posición del trayecto LINE
configurado**; for circular try a coordinate of 0 or preview an explicit Free
domain. Reselecting a profile face clears its edge; reselecting a LINE edge
clears its origin. Incomplete selections and equal Follow/UP axes block preview;
an invalid boundary/origin or excessive coordinate can reject natively without
enabling Apply. Correct the draft rather than changing tolerance.

Choose **Right compact** to compare the unchanged Base use on the left with the
edited compact use on the right. Return to **Both compact** to see both shared
uses. **Suprimir**, **Activar** and **Eliminar** also require preview/Apply.
Use **Guardar como** to save a new file; canceling that dialog must preserve
file identity and dirty state. After a successful save, reopen the new file and
press **Resolver configuración** for a fresh check; Cancel preserves its saved
intent. Ordinary **Guardar** writes the granted parent path, never the original
recipe file unless you deliberately chose that path.

For a form walkthrough or screenshot, after the saved reopen and fresh
solve/Cancel, choose `right` and **Editar** on the saved relation without changing
anything. Check that the exact faces/edges/origin, modes, quantity and orientation
controls restore. **Aplicar configuración** remains unavailable until a new
preview. **Cerrar edición de relación configurada** discards this unmodified
draft and leaves the committed history and saved bytes alone. The optional
scripted capture is staged at this same saved-state point; its execution is
reported separately from this manual guide.

The fixed aggregate `npm run test:desktop:assembly-configured-compound` contains
four isolated production-renderer workflows for these recipes. Read the
[compound contract](ASSEMBLY_CONFIGURED_COMPOUND_AUTHORING.md) and
[validation record](VALIDATION.md) for actual execution. This manual walkthrough
is not itself evidence that a renderer, platform or complete assembly demo passed.

## Scope

The ordinary rigid assembly workspace and configured workspace have different
available controls. The configured view offers graphical relation creation/editing
for the families listed in its form, plus suppression/removal. New mechanical
captures use the separate native form above. Profile/path compound forms use
the configured material-reference form. General reference repair remains
unavailable there, alongside interactive
constrained dragging, configured interference/geometric export,
part-feature variants and flexible instances. A passing walkthrough does not
establish arbitrary model compatibility, complete mechanical motion, installed
packaging or Windows/macOS/Linux support.
