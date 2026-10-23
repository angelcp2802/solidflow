# Core modeling workflows

The current priority is a complete everyday modeling sequence, tracked in
[issue #55](https://github.com/angelcp2802/solidflow/issues/55). The top command
area selects the operation; the left feature tree selects or edits its inputs;
the left property editor controls parameters and preview/accept/cancel.

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

The standard assembly workspace supports component import and repeated
occurrences. Its relation references include assembly and component XY, XZ
and YZ principal planes. The configured workspace also offers those planes.
Its general relation form now has explicit role buttons to select a current
face or LINE edge. Clicking a visible configured component selects its
immediate owner in the current scope.

Origin X/Y/Z axes now have explicit persisted references, scoped native line
resolution and direction/concentric authoring; see the [origin-axis contract](ASSEMBLY_ORIGIN_AXES.md)
and its source-specific validation. Concentric rotation locking with origin
axes remains unsupported. Configured component insertion/fixed-state editing and direct
viewport picking for specialized compound/mechanical forms remain open. Assemble
the initial component structure in the standard workspace before selecting
configurations. These limits remain part of the required work.

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
