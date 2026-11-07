# Configured component authoring

Component import, reuse and fix/float operate on the complete v3 document:
source definitions, configuration catalog and selected root state. They prepare
a detached proposal and require the configured worker's verified preview before
Apply. They do not publish a legacy Base-only assembly.

## Scope and state

The selected scope identifies an exact occurrence path, assembly definition
revision and effective configuration. A stale or suppressed scope cannot accept
an edit. Changes to a shared definition/state affect every use selecting that
same intrinsic state; selecting one displayed instance does not isolate it.

- **Base insertion:** the new occurrence is active in Base and inherited by
  existing named states. Existing overrides remain intact.
- **Named insertion:** the occurrence is registered once in the source and
  suppressed in Base. An override activates it in the selected named state;
  other states retain their inherited suppression.
- **Fix/float:** Base changes are inherited unless a named state has an explicit
  `fixed` override. Named edits write that state's override. Fixing means fixed
  relative to the containing assembly, not necessarily world space. Floating
  does not remove mates or give a rigid subassembly flexible-instance behavior.

The configured evaluator passes the effective fixed flag into the solve plan.
An edit that makes existing relations unsatisfiable must fail verification
without committing source, catalog or history changes.

## Import and reuse

A v1 part requires an explicit revision label. A v2 assembly retains its source
revision and complete embedded definition registry. A v3 import additionally
retains its configuration catalog, saved captures and selected root state,
which becomes the inserted child's selected state. Saved captures are validated
and subsequently checked by the native workflow; importing them is not a new
capture grant.

Definitions are matched by exact identity/revision and normalized content.
Matching records are reused; conflicting content is rejected. Named catalog
entries with the same owner and configuration ID must also agree. Graph cycles,
kind collisions and the existing document, graph and catalog limits remain
rejections. The input file is not rewritten.

Base has no stored child-configuration selector. Importing or reusing a named
child state therefore requires a named parent state: select or create that
parent configuration first. This restriction is reported explicitly; the
imported state is never silently replaced with Base. Reusing a definition
creates a fresh occurrence identity without duplicating the definition.

## Walkthrough

1. Open a configured assembly and select its scope and state in the left panel.
2. Under **Insertar componente**, enter the name, local insertion coordinates
   and whether it should be fixed relative to its parent. Import a document or
   choose a registered definition and its child state.
3. Review the verified scene, then choose **Aplicar configuración** or
   **Cancelar**. Fix/float on a selected occurrence uses the same preview route.
4. Undo/Redo and Save As/reopen preserve the complete v3 context, including
   occurrence identities, overrides and imported catalogs.

The private single-use Apply token belongs to the original complete baseline
and one prepared candidate. Apply does not allocate another occurrence.
Cancel/retry may allocate a different fresh identity; Cancel preserves the
committed document. Renderer freshness checks include scope, selection and
form revision, and discard replies that arrive for an obsolete context.

## Evidence boundaries

The [original renderer recipe](../scripts/desktop-assembly-configured-components-original.cjs)
constructs 2×3×4 mm and 1×2×5 mm prisms, with analytical volumes 24 and 10 mm³
and areas 52 and 34 mm². Two uses of a shared subassembly exercise named-state
import and reuse. The
[renderer workflow](../scripts/desktop-assembly-configured-components-flow.cjs)
uses production controls, real worker replies and test-owned file-dialog paths
for import cancellation/retry, preview/Apply, fix/float, history, state switching,
recovery and saved reopening. After building, its entry point is
`npm run test:desktop:assembly-configured-components`.

[Native session cases](../src/cad/kernel.assembly-configuration-occurrence-edit.test.ts)
separately exercise private candidate identity, placed geometry, shared states,
fixation rejection and lifecycle guards. The
[pure authoring tests](../src/model/assemblyConfiguredOccurrenceEditing.test.ts)
cover declarations, inheritance, catalog preservation, collisions, cycles,
staleness and strict data boundaries. These are different evidence layers;
scripted controls are not human dialog or pointer-interaction evidence.

These authored cases and any configured CI jobs do not establish execution or
platform support. Record actual commands, platform, tolerances, failures and
results in the validation record after the checks complete. No execution result
is claimed by this contract.
