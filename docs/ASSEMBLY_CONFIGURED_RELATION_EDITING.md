# Configured relation editing

This increment addresses [issue #50](https://github.com/angelcp2802/solidflow/issues/50)
inside the existing [integration draft](https://github.com/angelcp2802/solidflow/pull/49).
It extends the [persisted configuration envelope](ASSEMBLY_CONFIGURATIONS_PERSISTENCE.md),
without completing configuration authoring or the assembly demo milestone.

## Declaration compatibility

A named configuration may contain `mateDeclarations: AssemblyMate[]`. When the
field is absent, it inherits the owner's Base declarations. An explicit empty
list means no relations. A present list replaces the complete inherited list;
its IDs are unique within that state. Existing `mates` suppression/capture
overrides apply against that list, including newly declared IDs. Capture syntax
and family compatibility remain strict. Every dormant configuration is parsed.

Old v1/v2 files and v3 files without this optional field retain their meaning.
Earlier strict readers reject the new field rather than discarding it. This is
an extension within the v3 catalog, not a new field on the v2 source. The combined
20 MiB file bound and effective expanded relation budget still apply, including
dormant and suppressed declarations. Native cost is not promised by these limits.

The main-process file gate admits this optional array in its exact catalog
envelope and includes its rows in the existing aggregate 4,096-row bound.
Renderer/model and worker validation still own the full relation schema and
native admission; the file gate grants neither.

An edit names the complete declaring scope path, owner ID/revision and selected
configuration. The target must match the evaluated current document. Supported
declaration operations are add, replace, remove and suppression; replacement
preserves the relation ID. Named edits materialize the effective relation list
and clear its incorporated legacy overlays. All placed uses selecting that same
intrinsic state see the edit. They do not become flexible instances.

Before a Base declaration edit, inherited named relation lists are materialized
from their previous effective values, including dormant states and captures.
Existing explicit named lists retain their independent declarations. This keeps
a Base edit from silently changing named parameters or references. The complete
context is detached and validated before publication; failed edits mutate none
of the input.

## Private native transaction

`preview-configured-assembly-relation-edit` carries the original complete worker
context and a strict edit intent. The worker builds its proposal, solves selected
states child before parent and verifies every placed active relation against
fresh native geometry. A matching actual scene must also succeed before it
issues a private preview token.

The pending transaction retains both the original baseline and the prepared
proposal input. Apply first requires the exact original context, then consumes
the genuine private solve preparation against its own proposal. A copied DTO,
changed context or re-used token grants no authority. Another actual scene and
currentness check precede publication. Invalid pure intent/target admission does
not revoke an unrelated admitted preview; failures during native replacement do.

Authored mechanical capture data is not a fresh capture producer. Add/replace
for lock, gear, screw, rack-pinion and concentric with rotation lock currently
reject at this worker boundary. Suppression/removal of an existing captured
relation remains available. Complete configured mechanical capture and repair
still require their own native integration and evidence.

## Editor and evidence boundary

The configured workspace lists effective relations for the selected scope.
Its graphical form uses current configured scene reference nominees in the
declaring scope frame. Nominees are not native proofs. Native purpose, incidence,
geometric compatibility and satisfaction remain worker gates. Compound forms
and capture-sensitive edits that are not integrated explain their limitation.

Draft fields do not change the committed document. Preview and Cancel retain
history, recovery, file identity and the saved baseline. Apply adds one complete
v3 history state, preserving catalog and root selector. Context, generation,
scope, edit and draft tickets reject stale asynchronous completion. Undo/Redo,
saving and reopening continue to use the complete configured envelope.

The original prism recipe and independent literal bounds are documented in
[provenance](PROVENANCE.md#original-configured-relation-editing). Pure declaration,
native worker, server-rendered UI and production-renderer evidence are separate.
See the [validation ledger](VALIDATION.md) for commands actually executed. An
authored workflow or configured CI step is not a platform pass, complete assembly
demo or release acceptance.
