# Origin axes in assembly relations

Assemblies can reference the X, Y and Z axes through the origin of the current
assembly scope or a component. These are analytic lines in that owner's local
coordinate system. The full occurrence placement transforms them into the
assembly frame; an axis belonging to a subassembly does not require part faces.

In the standard workspace, select a relation and expand **Usar un eje de
origen**. Choose the owner, choose X/Y/Z, then use it in reference 1 or 2.
In the configured general relation form, select the corresponding **eje de
origen** entry in each reference list. Root and nested scope labels distinguish
the coordinate systems. The controls nominate a reference; the native preview
must still validate and solve it before Apply.

Both workspaces also display selectable origin references. Enable axes or
planes and choose the current scope, selected component or both. In the
standard workspace, activate reference 1 or 2 and **Seleccionar origen**;
in the configured relation editor, use the corresponding origin-role button.
Click a projected label, axis line or finite plane witness. One accepted pick
fills that role and disarms picking. Leaving the relation pane also disarms
picking while retaining the draft. Incompatible kinds leave the role unchanged.

The overlay uses the current effective global placement, while saved identity
remains relative to the declaring scope. Hidden, suppressed, ambiguous or stale
owners are excluded. Labels bind to their displayed owner and pose; geometry
picking requires the currently rendered catalog. The overlay remains visible
through material solids, with axis picking taking priority near an axis line.
Coincident axis projections are ambiguous. Use a distinct label when reachable;
if labels also overlap, show only the scope or selected component before picking.
Plane rectangles and axis extents are display witnesses of infinite
analytic references, not new material faces or edges. Changing visibility or
selecting a reference does not solve or modify the committed document.

Origin axes are available for parallel, perpendicular and angular relations,
including the angular limit forms, and for concentricity with another origin
axis or a cylindrical material axis. A concentric relation aligns two complete
lines and leaves translation along the line and rotation about it free. The
solver may choose a different value of a free coordinate while restoring the
constraints. An added angular relation can constrain the remaining rotation.

Rotation locking on a concentric relation with an origin axis is explicitly
unsupported. Gear, screw, rack-pinion, hinge and material symmetry references
retain their existing material requirements. An origin axis has no cylinder
radius, material surface, edge incidence or winding capture. Selecting it must
never fabricate those properties.

## Saved identity and lifecycle

The v2/v3 reference union adds `principal-axis`, with exactly `component` and
`axis` fields. The axis is one of `X`, `Y`, `Z`; `component: null` means the
declaring assembly scope. Component references retain their scope-relative
occurrence path and definition revision. Source revision, replacement and
subassembly repair preserve the chosen axis and require a current owner.
Suppressed, stale or missing owners cannot produce a valid native reference.

Existing documents retain their meaning. Documents using the new reference
require a reader that supports it; older readers reject the unknown kind.
The file version and existing strict validation are retained. No IPC operation
or file privilege is added.

## Repeatable original example

The two fixed renderer commands are:

```sh
npm run build
npm run test:desktop:assembly-origin-axes
npm run test:desktop:assembly-configured-origin-axes
```

Their original recipe has two 2 × 3 × 4 mm prisms. One is fixed at
[−15, 0, 0] mm. The moving prism begins at [20, 10, 6] mm, rotated 20 degrees
about Z. The real forms create a concentric relation between its Z axis and
the scope Z axis, then a 30-degree relation between their X axes. The configured
case edits the named `demo` state while retaining the Base and dormant state.

The workflows inspect private preview, Cancel/retry, Apply, history and actual
file Save/reopen. Volume is 48 mm³ and area is 104 mm². Their bounds oracle uses
literal prism dimensions and trigonometry; free axial displacement is not
mistaken for a constrained value. Axis roles use actual pointer input on
projected labels. The workflow also checks an incompatible plane, a compatible
transient plane and leaving the relation editor with an armed role. Owner and
relation parameters still use scripted form controls; this does not establish
arbitrary geometry-hit or physical mouse navigation coverage. Execution
results and exact limits belong in
[VALIDATION.md](VALIDATION.md); these commands alone are not passing evidence.

Origin-axis rotation capture and the complete assembly demo remain separate
outstanding work. Displayed-reference picking does not extend the supported
solver families or establish general visibility and platform coverage.
