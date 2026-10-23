# Persisted rigid assembly configurations

This is the saved/editor integration for the [configuration core](ASSEMBLY_CONFIGURATIONS_CORE.md)
and [selected-state solve transaction](ASSEMBLY_CONFIGURATIONS_SOLVE.md). It
does not complete configurations or the full assembly scope in issue #45.

## File boundary

The new saved format is an explicit envelope, not extra fields on a v2 source:

```ts
{
  version: 3,
  kind: 'configured-assembly',
  source: AssemblyDocument, // strict version 2
  catalog: AssemblyConfigurationCatalog,
  rootConfiguration: string | null
}
```

The source owns identity, revisions, definitions, base poses and base captures.
The catalog owns named overrides and complete named mechanical captures. The
selected root state is persisted so reopening reconstructs the selected state.
There is no second capture sidecar, duplicated root metadata, native handle,
authoritative cached scene, token, file grant or persisted runtime generation.

`assemblyConfiguredDocument.ts` checks own JSON data, UTF-8 size, density,
complexity and exact fields before Core graph/effective-placement validation.
The final canonical envelope also has its own 20 MiB bound, including wrapper
overhead. A v3 source cannot recursively embed another configured envelope.
Repairable reference diagnostics remain data, not proof of solved geometry.

The new `cadDocument.ts` dispatcher admits versions 1, 2 and 3 explicitly;
unsupported versions reject. Legacy source/import/replacement parsers retain
their strict v1/v2 admission. They never unwrap v3 to its source and discard a
catalog. Earlier builds reject v3 rather than silently opening its base state.

## Native scene and worker ownership

`buildConfiguredAssemblyScene` consumes Core's actual effective part inventory.
It shares native geometry construction with the base scene without constructing
a fictitious effective v2 document. Reused placements remain distinct; hidden
parts retain physical totals, while suppressed parts allocate no placed body.
The existing body/reference/mesh budgets and draining native ownership remain.

The distinguishable scene wrapper carries generation, exact canonical source
and catalog signatures, root selector and revision identity. Each body retains
its configuration ancestry. These are display/currentness tags, never native
proof or Apply authority. Raw complete context is checked again after native
construction and cleanup, before returning any DTO.

Configured worker commands are distinct from legacy assembly commands. The
worker retains the genuine in-process solve preparation; the renderer receives
only an opaque token, detached candidate, review and actual effective scene.
Scene preparation must succeed before a token is issued. A matching Apply
attempt consumes its token before validating the complete baseline, including
malformed or stale attempts. It uses the private candidate and reconstructs
another actual matching scene; a later failure publishes no committed state.
Discard of an old token cannot consume a newer one.

Pure context/policy rejection happens before disposing another workspace or
revoking an admitted configured preview. Native preparation/currentness or scene
failure withholds the replacement. Ordinary read-only configured builds do not
consume a valid pending preview. Session disposal and conflicting workspace
commands revoke their owned capabilities. No native allocation outlives a call.

## Editor, history and files

The configured workspace is an explicit route. The ordinary assembly workspace
offers **Configuraciones…** for its confirmed source. It retains the parent's
real file identity and marks the new format unsaved until an explicit save.
Opening a v3 file or valid recovery selects the configured route directly.
Saving after conversion writes v3 to that same path. Use **Guardar como** to
retain a separate v2 original for earlier builds.

The editor selects Base or a named root, creates variants based on Base,
edits effective occurrence state, selects child configurations in named parent
states and invokes the real configured worker Solve/Cancel/Apply pipeline.
Shared intrinsic states propagate to all their selected users; this is not
independent flexible-instance behavior. Authoring Base changes inherited values;
the solver's separate base-writeback isolation policy remains documented in
the transaction contract.

Complete source/catalog/root-selector snapshots move together through bounded
history, Undo/Redo, dirty comparison, recovery, save and reopening. Runtime
epochs advance on context transitions, including away/back and history moves.
Async completion tickets bind canonical persisted bytes, epoch, scope and file
identity. Stale preview replies discard only their own token. Rendering a
detached scene copy never calls a legacy native producer.

Save captures the exact canonical bytes before awaiting the restricted file
bridge. Canceled Save As retains the prior path and saved baseline. Successful
save records only the bytes actually submitted. Existing main-process sender,
path-grant, atomic-write, byte-limit and renderer-isolation policies remain.
The main process admits a bounded v3 transport envelope; full graph and native
validation remain separate boundaries. Invalid recovery is read-only and is
not overwritten by a fallback document.

## Evidence and remaining work

Original pure cases cover complete gear/screw/rack capture syntax, dormant
states, selected-child graphs, exact envelope size, atomic history and recovery.
Their un-attested topology strings are deliberately not native evidence.
Native cases use the tracked original A2×3×4 and B1×2×5 prisms, reused rigidly
with proper quarter turns. Literal independent per-body bounds and mass totals
check selected scenes and nontrivial child-before-parent worker transactions:
four solids, volume 68 mm³ and area 172 mm², with case-specific suppression
variants. Query/release/reentry failures and private-token controls are separate
from display checks. See [provenance](PROVENANCE.md#original-persisted-configuration-contexts)
and the [validation ledger](VALIDATION.md) for actual executed outcomes.

The dedicated production-renderer workflow uses real configured worker replies
and the restricted file bridge with isolated test-owned dialog paths. It checks
selected states, authored named placement, Solve/Cancel/retry/Apply, full history,
recovery and Save As/reopen. It is not a human native-dialog or installed-package
test; configured CI is not an executed platform result.

Still required: complete configured relation authoring/parameter editing,
native mechanical capture and repair, all-family motion/drag/source lifecycle,
configuration-aware BOM/interference/export and project import, parameter and
part-feature variants, and flexible instances. Incompatible legacy consumers
continue rejecting v3. The configured view labels its unavailable operations;
it must not substitute base-state results for the selected configuration.
Suppressing a component used by an active relation can leave that relation
unavailable. This view cannot yet repair or suppress the relation; restore the
component before solving that state again.
