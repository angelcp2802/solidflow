# Architecture

The [configured scope and state planner](ASSEMBLY_CONFIGURATIONS_SCOPE.md)
separates local numerical bodies from full-root material ownership and orders
reused rigid states child before parent. It does not yet publish a configured
solve/writeback transaction.

The [capture/winding layer](ASSEMBLY_CONFIGURATIONS_STATE.md) supplies exact-
state sidecar operations and materializes named captures into the real core
catalog. The unchanged native input signature includes normalized captures;
historical capture validity and production solve/writeback remain separate.

The standalone [rigid configuration evaluator](ASSEMBLY_CONFIGURATIONS_CORE.md)
keeps named occurrence states separate from saved v2 syntax until production
references, scoped solving and all graph consumers can resolve them consistently.
It returns owned declaration data without native or Apply authority.
The separate [configured native context](ASSEMBLY_CONFIGURATIONS_NATIVE.md)
binds frame, geometry, direction, surface, profile and bounded-path observations
to source, catalog, selector and controller generation with its own proof
lifetime. Closed observation helpers confer no authority. Legacy assertions
and variant-specific solving remain separate.
The [effective relation inventory](ASSEMBLY_CONFIGURATIONS_RELATIONS.md) adds
declaration diagnostics and separately authenticated native aggregates for the
current saved families. It consumes effective scopes without rewriting the
base graph. The separate [numerical adapters](ASSEMBLY_CONFIGURATIONS_NUMERIC.md)
map authentic configured roles to detached constraints and add bounded
independent hinge/profile/path support measurements. Production variant-aware
solving, native capture transactions, writeback and Apply authority remain separate.

SolidFlow uses Electron for its desktop shell, React for the interface and
OpenCascade through Replicad for exact BRep modeling. Three.js renders meshes
and selection overlays. A mesh is a visualization, not the modeling authority.

| Area | Responsibility |
| --- | --- |
| `electron/` | Main process, constrained preload bridge, file dialogs and local recovery |
| `src/App.tsx`, `src/components/` | Command flow, property panels, sketch interaction and viewport |
| `src/model/` | Serializable documents, validation, migration and dependencies |
| `src/sketch/` | 2D geometry, local constraint solver, trim and extend |
| `src/cad/` | Worker transport, BRep reconstruction, feature operations and references |
| `src/examples/`, `examples/` | Synthetic examples and saved editable documents |
| `src/cad/fixtures/solidflow-ui/` | Versioned inputs from SolidFlow UI and regression baselines |

The renderer sends serializable requests to a worker. The worker owns the CAD
engine and returns meshes, bounds, diagnostics and catalogs of references.
Dependencies rebuild in feature order. Missing or ambiguous supports produce
an explicit diagnostic instead of silently choosing another face or edge.

An `importedSolid` feature owns bounded STEP bytes and an integrity digest.
Reconstruction reads those bytes in the CAD worker with an explicitly owned
native reader and temporary virtual file, then feeds the exact solid into the
same downstream feature pipeline. Build and committed-snapshot export do not
depend on the original filesystem path or a retained import cache. See the
[import contract](STEP_IMPORT.md) for units, compatibility and scope.

The additive [explicit imported-body base](IMPORTED_BODIES.md) owns one bounded
single-solid STEP source per declared body. All sources validate before one
native catalog transaction publishes their exact IDs and aggregate without
fusion. It shares the first/unique import-base rule with `importedSolid`, while
preserving that older feature's legacy aggregate semantics. Structural STEP
products with several solids can therefore remain one part definition rather
than being split into invented assembly products.

The [structural STEP editor route](ASSEMBLY_STEP_EDITOR.md) uses separate worker
import/export requests and the existing restricted file bridge. Import prepares
an autonomous v2 document before replacement confirmation; export reconstructs
a detached committed snapshot. Direct component insertion prepares the entire
composed candidate before one parent-history edit, with a captured shared scope.
These commands retain neither a neutral-file
write path nor Apply authority and preserve unrelated native workspace state.

The Electron renderer has no Node integration. Filesystem access goes through
specific preload/IPC methods validated by the main process. The production
loader serves bundled assets through the application protocol; its smoke test
checks the real loader, worker and WASM initialization with a temporary profile.

Keep document format changes compatible with existing saved examples. Keep
geometry tests independent of presentation tests. Changes to the solver,
references or BRep operations need meaningful geometric acceptance criteria.
