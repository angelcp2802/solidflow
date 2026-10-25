# Core modeling workflows

The current priority is a complete everyday modeling sequence, tracked in
[issue #55](https://github.com/angelcp2802/solidflow/issues/55). The top command
area selects the operation; the left feature tree selects or edits its inputs;
the left property editor controls parameters and preview/accept/cancel.

The **Operaciones** ribbon groups commands under **Crear**, **Quitar material**,
**Modificar**, **Patrones**, **Cuerpos** and **Referencias**. Narrow windows retain
horizontal scrolling. Direct command buttons do not display a dropdown arrow.
While editing, the operation title and accept/cancel controls stay visible as
the left property editor scrolls.

An operation's current input sketches appear in orange while it is edited,
including a consumed profile reopened from the feature tree. Starting an
operation from an unaccepted sketch shows that current sketch. Cancel returns
to the live sketch editor; cancelling an existing operation restores the committed
downstream model. A pending or failed source reconstruction hides the active
overlay until a current source is available. This highlight changes no saved
sketch visibility or selection.

Assembly view commands occupy one compact row centered above the model.
Hover an icon for its command name. Standard assemblies retain the existing
face-selection and move/rotate controls beside the view commands; availability
still follows the current selection and editing state.

The part's top menus support arrow-key navigation, Enter, Tab and Escape.
Escape closes a focused menu and returns focus to its trigger without cancelling
the active sketch or operation. Unavailable actions remain disabled; closing a
menu does not accept or discard a draft.

## Select geometry in a part

The viewport starts in **Auto**: a nearby visible edge takes priority over the
face interior. Hover highlights the same candidate that a left click selects.
Use **Caras**, **Aristas** or **Cuerpos** in the viewport toolbar to choose an
explicit selection mode. Switching modes clears the previous browsing selection.
Click empty background or **Limpiar selección de pieza** to clear it without
changing the document or its history.

While editing an operation, its reference fields own the selection mode and the
browsing controls are disabled. Finish or cancel the operation before changing
the ordinary filter. Wheel zoom and held-middle-button camera navigation keep
their existing controls; a dragged or canceled gesture does not become a click.
Assembly browsing continues to select components; an armed relation field owns
its face, edge, vertex or origin selection instead.

Visible assembly-origin labels are kept inside the viewport in separate boxes,
with a line to their original geometric anchor when displaced. If the available
area cannot fit them, **Referencias de origen** presents the complete set in a
scrolling list. The full owner name remains available in the label's tooltip and
accessible name. A label identifies the exact reference; it does not make an
ambiguous geometric click choose an owner.

## Edit operations and their sketches from the tree

Use the arrow beside an operation to show or hide its input sketches. Unused
sketches stay at the root; a shared sketch can appear beneath each consuming
operation. Collapsing a branch keeps the selection. The filter temporarily
reveals matching branches; clearing it restores the previous expansion.

With a row focused, Right opens its branch and then moves to its first child;
Left returns to the parent or closes its branch. These keys move focus without
changing the selected feature. Editing an input from an operation's context
reveals that occurrence and returns to it when editing finishes.

Right-click an operation in the feature tree to choose **Editar operación** or
an explicitly named **Editar croquis** input. A sketch row offers its own edit
command. For operations with several sketch inputs, each input is listed by
name. The top **Editar** menu provides the same input choices for the selection.
Focus a tree row and press the context-menu key or Shift+F10 to open its menu;
arrows and Enter choose a command, and Escape returns focus without editing.

Changing a consumed sketch rebuilds its downstream operations after acceptance.
While that sketch is being edited, new extrusion, cut and revolution commands
remain disabled. Inspect the rebuilt result after accepting an earlier edit.

## Continue directly from a new or unused sketch

While editing a new sketch or a saved sketch without dependents, wait for a
healthy, current preview, then choose
**Operaciones → Saliente/Base extruido**, **Corte extruido** or **Revolución**. Finish any active
sketch chamfer, fillet, mirror or offset tool first.

The operation retains the sketch as a draft and locks its profile selector.
Inspect its parameters and body targets before accepting. **Cancel** returns to
the same active sketch, preserving its geometry, support and sketch undo/redo;
it does not commit either draft. Acceptance records the new or changed sketch
followed by the solid operation. One document undo removes the operation while
keeping its sketch; a second undo reverses the sketch addition or edit. An
unchanged saved sketch does not add a redundant edit step. Save and recovery use the
accepted document, so finish the operation or return to and accept the sketch
before saving it.

The existing **Salir del croquis** route remains available. These instructions
describe the interaction contract; executed cases and their limits are recorded
in [validation](VALIDATION.md).

## Revolution followed by a cut

While editing an unused sketch, choose **Operaciones → Revolución**. In the
left **Eje de revolución** section, select the sketch's X or Y axis or a line
from that same sketch. Construction lines may define the axis without adding
material. A line's start-to-end order defines its positive direction. Place the
closed profile on one side of the selected axis. In **Dirección 1**, set a
positive angle up to 360 degrees and use **Invertir dirección** to reverse the
turn. Enable **Dirección 2** to add an angle on the opposite side of the profile.
Both angles must be nonnegative and their sum must be greater than zero and no
more than 360 degrees; either side can be zero. Alternatively choose **Plano
medio** in **Condición final de revolución**: the entered angle is the total,
split equally around the profile, and inversion is disabled for that mode.
Inspect the preview, then accept. Cancelling returns to the edited sketch.
Select another sketch to create a subsequent **Corte extruido** against the
current body. Each accepted operation remains a separate history step.

If a saved line no longer exists, the editor retains that missing reference and
requires an explicit replacement; it does not switch to another axis. Older
documents with no axis declaration retain their local-Y direction. Current
documents with the new optional fields require a reader that understands them.

Disabling **Dirección 2** or switching to **Plano medio** discards the second
angle. Returning to **Ángulo especificado** restores one-direction mode, keeping
the first angle and the stored inversion choice. If that first angle is zero,
enter a positive value before previewing the unilateral operation. Mid-plane
ignores inversion while active; it does not erase the saved choice. Changing
extent modes can require repair of downstream face/edge references, even if two
settings produce the same solid.

Axes from another sketch, body edges or cylindrical faces, viewport axis picking,
thin-wall revolution and revolved cuts remain pending. Two-direction and
mid-plane modes have focused model/native/UI checks and a passing selected
production renderer. The current increment also passes the local full suite
(9,699 cases across 422 files, plus 83 IPC checks with two explicit skips) and
desktop smoke. Current-head hosted acceptance remains pending.
The renderer regression
uses an original sleeve profile and axial bore; its formulas and evidence limits
are documented in [provenance](PROVENANCE.md#original-revolution-and-bore-sequence)
and [validation](VALIDATION.md).

## Several cuts and additive extrusions

Open **Archivo → Ejemplo: cortes y salientes sucesivos**. Save any current work
when the normal replacement dialog asks. The original example contains a
20 × 12 × 4 mm base and four unused sketches.

1. Select **Left cut profile** in the tree. Choose **Operaciones → Corte
   extruido**, set depth to **4 mm**, inspect the preview and accept.
2. Repeat with **Right cut profile**, also **4 mm**. These are separate sketches
   at X = −6 and +6 mm, each with a 2 × 2 mm rectangle.
3. Select **Boss profile**, choose **Saliente/Base extruido**, depth **3 mm**,
   and **Resultado del saliente → Añadir material a un cuerpo**. Select the
   existing body, choose **Ver vista previa**, then accept.
4. Repeat for **Cap profile**, depth **2 mm**, adding to the same body.
5. Undo/redo the last operation, save as a `.solidflow` document and reopen it.
   Double-click an earlier feature to edit it; dependent sketches and depths
   must still describe the intended geometry.

Cuts default to the sole current body when no bodies are explicitly selected.
With several bodies and no unique selection or resolved support-face owner,
choose the targets explicitly. Without an explicit body selection, an extrusion
from a currently resolved support face defaults to adding to that face's body.
An explicit current body selection takes priority. An unselected principal-plane
extrusion retains the explicit new-body option.

Expected volumes are 960, 944, 928, 976 and 984 mm³ after the five operations.
The final result is one solid with area 848 mm² and bounds [−10, −6, 0] to
[10, 6, 9] mm. This analytical example does not establish arbitrary sequence
or topology-reference coverage.

## Fresh sketches on current faces

The separate `npm run test:desktop:part-fresh-sketch` workflow starts with only
an original 20 × 12 × 4 mm base, without prepared downstream sketches. Build
first. Its tracked recipe is `scripts/desktop-part-fresh-sketch-original.cjs`;
the interaction is in `scripts/desktop-part-fresh-sketch-flow.cjs`.

1. Enable **Seleccionar caras** and select the base's upper face at Z = 4 mm.
   Choose **Crear croquis en cara**, then **Croquis → Rectángulo**, and draw
   a centered 4 × 4 mm rectangle.
   Wait for the supported sketch view to settle before drawing; inspect its
   support in the left properties and keep the sketch active.
2. Choose **Operaciones → Saliente/Base extruido** directly from the ribbon,
   set depth **3 mm**, and inspect the current-body merge default. Cancel back
   to the same active sketch; use its local Undo and Redo to remove and restore
   the drawn rectangle. Retry the extrusion and accept it.
3. Enable face selection again and select the new upper face at Z = 7 mm.
   Draw a fresh centered 2 × 2 mm rectangle and, while it remains active, choose
   **Insertar → Corte extruido** with depth **−3 mm**. Inspect the current-body
   target, cancel back to the same sketch, then retry and accept. The pocket
   floor is Z = 4 mm.
4. Undo twice: first remove the cut, then its new sketch. Redo twice to restore
   that sketch and the cut in order. Save and reopen. Both sketches should
   retain their face supports and drawn points, with one final solid.

The independent volumes are 960, 1008 and 996 mm³; areas are 736, 784 and
808 mm². Final bounds are [−10, −6, 0] to [10, 6, 7] mm. The renderer scenario
uses pointer events for face selection and drawing, with visible SVG calibration;
its mesh-area checks are separate from native BRep evidence in
`src/cad/kernel.part-fresh-sketch.test.ts`. This bounded case does not establish
arbitrary face orientations, topology changes or general sketch interaction.

Drawing commands can start a fresh sketch directly. Their blue active state
appears only while editing a sketch; **Seleccionar** requires an open sketch,
and **Cota inteligente** requires an editable multientity profile. Compact
operation commands occupy two rows with additional columns; the command area
scrolls horizontally when needed so labels remain available.

The command and checks above describe the configured workflow, not a passing
run. Consult [validation](VALIDATION.md) for actual execution and
[provenance](PROVENANCE.md#fresh-support-face-original) for analytical tolerances.

## Mouse controls

| Input | Action |
| --- | --- |
| Wheel | Zoom |
| Hold middle button and drag | Orbit the 3D view |
| Hold Shift and middle button and drag | Pan the view |
| Left click | Select the current body, component, face or edge picking target |

Ctrl/Meta with the middle button also pans. Left dragging does not orbit.
Canceled or dragged gestures do not select on release. Explicit component
movement uses its own tool. Sketch editing retains 2D middle-button pan.

## Assembly priorities and current limits

The next interface priority is a parameter-first left property manager, with
relation references before naming and secondary explanation. Both workspaces
should clearly distinguish selecting references, verifying a new relation and
applying its verified preview. This is planned interface work: current relation
creation still requires its explicit preview action; the general Solve command
must not be described as creating an unsubmitted relation. Draft, scope and
current-reference guards remain requirements for that work.

Both assembly workspaces use a grouped upper ribbon and one contextual manager
on the left. **Archivo / Editar / Ver / Insertar / Herramientas / Ayuda** offer
the existing actions for the current document, with quick file/history access
immediately below. Unavailable actions retain their disabled state. Open a menu
with a click or the arrow keys; arrows move between commands/menus, Escape
closes it and restores its trigger, and Tab leaves the menu. Opening a menu does
not discard a relation draft. The standard workspace uses **Ver → Árbol de
componentes / Propiedades de relación**; the configured workspace uses
**Ver → Árbol del ensamblaje / Relaciones de posición**. These commands switch
the left manager while retaining its fields; leaving the editor disarms
temporary reference picking.

The upper **Ensamblaje / Relaciones / Evaluar** tabs choose command groups
independently of the left inspector. Changing tabs keeps its draft and active
reference picking. **Ensamblaje** contains insertion and **Relación / Nueva
relación**, plus movement and document tools in the standard workspace or
configuration tools in the configured workspace. **Relaciones** offers the current
relation list. **Evaluar** contains the material list in both workspaces, with
interference and geometry export commands in the standard workspace.

With a command tab focused, Left/Right select the previous/next tab and wrap;
Home/End select the first/last. Tab leaves the selected tab. Solve, Apply and
Cancel remain visible with their existing availability rules. Closing the
material list reveals Evaluar and returns focus to its command. Use the left
manager tabs or an explicit command to open an editor. Applying a preview still
requires the existing native verification; the check mark does not bypass it.

Selecting a component keeps the model tree visible in both assembly workspaces.
In a standard assembly, use **Propiedades** in the left tabs, the tree action or
**Editar → Propiedades del componente** to open its separate editor. **Mover
componente** opens that pane at the movement fields. **Modelo** in its header
returns to the selected row, retaining unsubmitted field values. With no selection,
the Properties tab explains how to select a component; browsing an origin datum
disables component Properties and Move until component selection is restored.

In configured assemblies, use **Propiedades del componente** in the left icon
bar to edit it. **Insertar
componente**, **Reutilizar componente**, **Nueva relación** and
**Configuraciones** open their corresponding panels. **Relaciones** lists the
current state's relations. Closing or applying a relation returns to the tree.
Leaving a relation panel stops temporary viewport reference picking and preserves
its draft. Returning to it does not automatically rearm picking.

Panels remain mounted to retain field values, but inactive panels are hidden.
Renderer workflows navigate through the actual tabs before operating fields;
scripted form controls remain distinct from pointer-validated interactions.
The model tree lists **Plano XY/XZ/YZ** and **Eje X/Y/Z** at the root and under
each visible, unsuppressed component. Expand a component and click a datum to
show it in the viewport; closing that branch retains its highlight. Click a
component to return to body selection. Root datums always belong to the document
root. This exploration does not change the editing scope or assign a relation
role. Use the explicit reference controls below when creating a relation.

In a standard assembly, enable **Mostrar ejes** or **Mostrar planos** and choose
**Ámbito actual**, **Componente seleccionado** or **Ambos** in **Orígenes visibles
de**. Select the relation and its reference role, then press **Seleccionar
origen**. The viewport instruction identifies the role being filled. In a
configured assembly, the tree selection initializes the owner when opening the
general relation editor. Expand **Referencias de origen**, then enable **Ejes** or
**Planos**, choose **Mostrar origen de**, and press the intended reference role.
Use **Componente de origen** to choose another current visible component without
leaving that editor. The selector includes eligible descendants of the current
scope and displays their relative paths. Choosing an owner switches a scope-only
display to that component; **Ambos** retains the scope alongside it. Existing
roles and the tree selection stay unchanged. Changing owner disarms picking:
rearm the intended role, select its origin, then choose the next owner/role.
Only roles with a compatible current displayed reference can be armed.
The origin section starts compact when visibility and picking are not requested.
Its summary shows the displayed count or active role. Collapsing this section
keeps the current owner, visible references and armed role; it does not cancel
picking. Activating visibility or a new origin role opens the section again.

Click an axis line, a displayed plane, or its projected label to nominate the
reference. Labels identify the axis or plane and its owner; they are also useful
when a line is viewed end-on. If labels overlap, show only the scope or selected
component before picking. A successful selection fills
one role, highlights the reference and ends that picking action. Rearm selection
for the next role. These overlays can be seen through solids: their finite
display size is not the extent of the analytic reference. A plane or axis is
distinct from a material face or edge and cannot supply a cylinder radius or
material incidence. Principal axes can participate in concentric rotation
capture; gear, screw and other material-based families retain their own support
requirements.

For a concentric relation between origin axes, or between an origin axis and a
cylindrical face, **Bloquear giro** captures the current relative orientation.
The components can still slide along the common axis. In a standard assembly,
first resolve a valid preview, then use the relation's lock action and review the
new preview before applying. In a configured assembly, **Bloquear giro** opens
the mechanical editor for the existing relation, retaining its identity and
references. Generate the capture preview and Apply or Cancel. A relation with no
previous lock requires a fresh capture; there is no old orientation to retain.

Hiding a reference or changing the displayed owner stops origin picking.
Leaving the relation editor also stops it without discarding the draft.
Hidden or suppressed owners, stale scene/context events and incompatible roles
cannot supply a new reference. Visibility and highlighting do not verify a
relation: generate its native preview, then use **Aplicar** to commit it or
**Cancelar** to discard the preview. **Cancelar selección de origen** only ends
the temporary picking action.

The standard assembly workspace supports component import and repeated
occurrences. Its relation references include assembly and component XY, XZ
and YZ principal planes. The configured workspace also offers those planes.
Its general relation form now has explicit role buttons to select a current
face or LINE edge. Clicking a visible configured component selects its
immediate owner in the current scope.

The configured workspace's upper command bar provides **Insertar componente**,
**Reutilizar componente**, **Nueva relación**, **Relaciones** and
**Configuraciones**. Insertion and reuse reveal their fields in the left
inspector; New relation opens its actual editor. The other commands reveal the
relation list or root configuration. Existing file actions, view controls and
sidebar actions remain available. Commands that open an editor reveal its
inspector section and move keyboard focus. Selecting a component in the tree or
viewport retains the current panel; **Propiedades del componente** opens its
editor. Typing, picking references and unrelated rebuilds do not repeatedly scroll it.
Section headings and context remain visible, with a focusable heading fallback
when a field is disabled. These shortcuts preserve the existing preview/Apply
guards and selected scope.

`npm run test:desktop:assembly-configured-picking-compact` runs the original
pointer workflow at 1040 × 700, including upper-command access and inspector
visibility/focus. Normal and compact cases have Windows execution evidence;
see [validation](VALIDATION.md) for the exact runs. This bounded layout and
two-cube workflow do not establish arbitrary screen-size or platform coverage.

General face/LINE relation references retain their highlight after selection.
While a role is being picked, an instruction beside the viewport identifies
the reference, scope and state, with a cancellation button. Highlights resolve
only against current visible geometry and compatible role choices; they are
display feedback, not native verification or permission to apply a relation.

After building, `npm run test:desktop:assembly-configured-picking` exercises
actual component/face/LINE pointer selection on two original 4 mm cubes.
Explicit B-to-root YZ/XZ distances constrain X=8 and Y=0 while leaving Z free.
Select the top face of B first, then A, and set signed distance +2 mm. The
verified placement moves B from Z=6 to Z=2; reversing the references reverses
the signed convention. The workflow also authors parallel top LINE edges,
checks Cancel/retry/Apply, history and full v3 save/reopen. See
[provenance](PROVENANCE.md#configured-material-pointer-original) and
[validation](VALIDATION.md) for exact coverage; this is not general assembly
or platform acceptance.

Origin X/Y/Z axes now have explicit persisted references, scoped native line
resolution and direction/concentric authoring; see the [origin-axis contract](ASSEMBLY_ORIGIN_AXES.md)
and its source-specific validation, including concentric rotation capture with
origin axes. The configured workspace now supports component
import, registered reuse and fixed/floating authoring through private previews;
see the [component contract](ASSEMBLY_CONFIGURED_COMPONENT_AUTHORING.md).
Named insertion activates the new occurrence in the selected shared state while
Base remains suppressed. Direct viewport picking for specialized compound and
mechanical forms, flexible instances and complete assembly demo acceptance
remain required work.

## Validation entry points

Run `npm test` and `npm run build`. The original native sequence is covered by
`src/cad/kernel.part-sequence.test.ts`, including STEP/native validity, area,
volume, bounds, save/reopen and edited dimensions. After building, run
`npm run test:desktop:part-sequence` for actual upper commands, left properties,
separate operations, history and native file save/reopen. Its prepared sketches
are fixture inputs; this test does not draw all five sketches interactively.
`npm run test:desktop:part-revolution` separately exercises X/Y and construction
line previews, reverse direction, a later bore cut, history, native Save/reopen
and independent STEP reimport from its three original unused sketches.
Mouse event tests exercise the installed OrbitControls implementation; pure
selection/SSR cases are separate from real viewport click evidence.

See [validation](VALIDATION.md) for executed results and
[provenance](PROVENANCE.md#sequential-part-original) for the original dimensions.
