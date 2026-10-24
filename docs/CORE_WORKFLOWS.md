# Core modeling workflows

The current priority is a complete everyday modeling sequence, tracked in
[issue #55](https://github.com/angelcp2802/solidflow/issues/55). The top command
area selects the operation; the left feature tree selects or edits its inputs;
the left property editor controls parameters and preview/accept/cancel.

The part's top menus support arrow-key navigation, Enter, Tab and Escape.
Escape closes a focused menu and returns focus to its trigger without cancelling
the active sketch or operation. Unavailable actions remain disabled; closing a
menu does not accept or discard a draft.

## Edit operations and their sketches from the tree

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
**Operaciones → Saliente/Base extruido** or **Corte extruido**. Finish any active
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

In a standard assembly,
**Ensamblaje / Componentes** shows the tree, **Relaciones** opens relation
properties and **Evaluar** opens measurement, interference and export controls.
The upper commands route to those same panels. Applying a preview still requires
the existing native verification; the check mark does not bypass it.

In configured assemblies, selecting a component does not force its editor open.
The model tree stays visible when selecting its components.
Use **Propiedades del componente** in the left icon bar to edit it. **Insertar
componente**, **Reutilizar componente**, **Nueva relación** and
**Configuraciones** open their corresponding panels. **Relaciones** lists the
current state's relations. Closing or applying a relation returns to the tree.
Leaving a relation panel stops temporary viewport reference picking and preserves
its draft. Returning to it does not automatically rearm picking.

Panels remain mounted to retain field values, but inactive panels are hidden.
Renderer workflows navigate through the actual tabs before operating fields;
scripted form controls remain distinct from pointer-validated interactions.
The tree's origin labels remain descriptive. Visible origin references have
separate controls and selectable overlays in the viewport.

In a standard assembly, enable **Mostrar ejes** or **Mostrar planos** and choose
**Ámbito actual**, **Componente seleccionado** or **Ambos** in **Orígenes visibles
de**. Select the relation and its reference role, then press **Seleccionar
origen**. The viewport instruction identifies the role being filled. In a
configured assembly, the tree selection initializes the owner when opening the
general relation editor. Under **Referencias de origen**, enable **Ejes** or
**Planos**, choose **Mostrar origen de**, and press the intended reference role.
Use **Componente de origen** to choose another current visible component without
leaving that editor. The selector includes eligible descendants of the current
scope and displays their relative paths. Choosing an owner switches a scope-only
display to that component; **Ambos** retains the scope alongside it. Existing
roles and the tree selection stay unchanged. Changing owner disarms picking:
rearm the intended role, select its origin, then choose the next owner/role.
Only roles with a compatible current displayed reference can be armed.

Click an axis line, a displayed plane, or its projected label to nominate the
reference. Labels identify the axis or plane and its owner; they are also useful
when a line is viewed end-on. If labels overlap, show only the scope or selected
component before picking. A successful selection fills
one role, highlights the reference and ends that picking action. Rearm selection
for the next role. These overlays can be seen through solids: their finite
display size is not the extent of the analytic reference. A plane or axis is
distinct from a material face or edge and cannot supply a cylinder radius,
material incidence or a mechanical capture.

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
and its source-specific validation. Concentric rotation locking with origin
axes remains unsupported. The configured workspace now supports component
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
Mouse event tests exercise the installed OrbitControls implementation; pure
selection/SSR cases are separate from real viewport click evidence.

See [validation](VALIDATION.md) for executed results and
[provenance](PROVENANCE.md#sequential-part-original) for the original dimensions.
