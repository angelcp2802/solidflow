# Configured profile and material-path authoring

[Issue #52](https://github.com/angelcp2802/solidflow/issues/52) connects three
existing saved families to the configured workspace: profile-center, material
LINE path and material circular path. This extends the same
[integration draft](https://github.com/angelcp2802/solidflow/pull/49).
Authored tests and configured CI commands are separate from executed results;
read [validation](VALIDATION.md) for the actual source and cases checked.

## Complete declaration intent

The new controlled form edits the selected scope's exact definition ID/revision
and Base or named state. It sends an ordinary
`AssemblyConfiguredMateEdit`, containing a complete saved mate. It adds no file
format, worker action, captured geometry, metrology or alternative Apply grant.

- **Profile center:** two ordered face selections, each with either a null axis
  for complete circular profiles or an explicit boundary LINE edge and sense
  for rectangles. Normal alignment, signed offset and rectangular quarter turns
  remain explicit. Changing a face clears that face's old edge. Changing profile
  family clears both selections. A square gets no inferred correspondence.
- **LINE:** a material point and a compound edge/start-vertex selection. Free,
  distance and percentage positions retain their existing meanings. Position,
  component-axis Follow and projected material-plane UP reversals are independent.
  Changing the edge clears its old material origin.
- **Circular:** a material point and an atomic open-arc/material-endpoint
  selection. Free explicitly selects the finite trim or supporting circle;
  coordinate mode measures distance inside the current material trim. There is
  no circular percentage, implicit wrapping, closed-circle seam or inferred
  direction from a nearby point.

Both path forms expose the point component's canonical X/Y/Z Follow axis and
optional UP using a different component axis and a material planar guide. A
principal datum is not a material UP face. Missing guide, Free with UP, or equal
Follow/UP axes blocks preview while retaining the draft; the form does not
silently choose another axis. The exact family contracts remain
[profile-center](ASSEMBLY_PROFILE_CENTER_MATES.md),
[LINE](ASSEMBLY_LINE_PATH.md) and [circular](ASSEMBLY_CIRCULAR_PATH.md).

## Current choices and private verification

`configuredCompoundUiChoices` uses the real configured scene and the complete
current source/catalog/root-selection/generation context. It keeps full source,
body, producer and native locator fields, then makes occurrence paths relative
to the declaring scope. Hidden or suppressed members are not offered. A stale
wrapper, different effective ancestry or unavailable scope supplies no choices.
Enumeration is bounded to 4,096 candidates per catalog and 16,384 inspected
items. It never makes an effective v2 document to call a Base-only consumer.

Planar faces are only profile candidates: a plane label does not establish a
complete disk or rectangle. Profile-edge and LINE-origin filters preserve
component/body/producer membership but do not establish boundary incidence.
Circular choices require the scene's actual circular edge/endpoints metadata;
an absent LINE support or mesh coordinates do not classify an arc. References
are normalized before identity comparison, preserving all fields while avoiding
property-order sensitivity. None of these detached choices is a native proof.

The existing `preview-configured-assembly-relation-edit` constructs the proposal
privately, solves selected intrinsic states child before parent and independently
verifies every placed active relation. Native profile kind/boundary, material
endpoint incidence, actual length/domain, Follow/UP projection and retained
precision remain admission gates. The requested length/angular bands are not
expanded to accommodate a failed selection. The matching current scene must
also succeed before a private preview token is published. Ordinary UI checks
and detached physical reports confer no Apply authority.

Named edits affect every use selecting that same intrinsic state. Base edits
preserve the prior effective named declarations, including dormant states.
These are shared rigid states, not flexible occurrence instances. Existing
[configured relation transactions](ASSEMBLY_CONFIGURED_RELATION_EDITING.md)
continue to own the original baseline and private prepared proposal.

## Draft and file lifecycle

Every field, mode, origin, axis, guide and edit change advances the parent draft
revision. Complete context, generation, scope, edit, scene and draft tickets guard
callbacks and asynchronous completion. Preview locks the form; stale replies
discard their own token. A failed or canceled preview does not commit declarations,
history, recovery or file identity. Cancel retains the draft for retry; closing
the form discards it. Apply consumes the genuine private candidate and adds one
complete v3 history snapshot. Existing suppression/deletion, Undo/Redo, recovery,
Save As, normal Save and reopen keep the source, catalog and root selector together.

Reopening a saved relation restores its complete current selections, modes and
parameters without issuing a preview or committing a declaration. The optional
renderer capture is staged only after saved reopen and a fresh solve/Cancel,
with that unmodified form visible. Its checks retain the prior native request
serial, Undo/Redo availability and saved bytes. Closing the draft preserves that
same committed state. A screenshot still supplies neither topology identity nor
Apply authority.

The authored acceptance commands are:

| Command suffix after `test:desktop:assembly-configured-` | Original case |
| --- | --- |
| `profile-center` | Rectangles with material directions and quarter turn |
| `profile-circle` | Complete disks with free roll and signed offset |
| `line-path` | Material LINE coordinate, Follow and UP |
| `circular-path` | Open material arc coordinate, Follow and UP |

`npm run test:desktop:assembly-configured-compound` runs those four fixed commands
sequentially. The workflows are intended to exercise actual DOM choices,
Cancel/retry/Apply, parameter editing, shared/Base isolation, history, complete
file save/reopen and fresh native solving. The test-owned native-save barrier
and clean-renderer readiness checks remain separate from the real write and its
byte digest. Each child retains the existing 180/170/35-second parent/child/step
deadlines and sandbox/file restrictions.

The additive native test matrix includes six missing-source/body cases, a real
closed-circle seam rejection, two finite projected-UP uncertainty/control pairs,
and three depth-two shared-placement cases. The UP fixtures retain an actual
translated guide and a nonzero projection; the uncertain case must reject rather
than widen the band or choose a fallback. The nested cases use noncommuting
Rx90/Rz90 placements, full state ancestry and exact all-placed keys, then verify
original material bounds and reopen. These are authored cases, not passing
claims; consult the source-specific validation results. They do not expand the
supported shape/domain or establish behavior for every conditioning boundary.

The original recipes and independent geometric targets are documented in
[provenance](PROVENANCE.md#original-configured-compound-authoring). Pure UI,
native session, production renderer and saved-file assertions are distinct.
These forms do not establish general curve chains, arbitrary profile recognition,
external application equivalence, configured source repair, interactive motion,
complete configuration authoring, packaging or platform support.
