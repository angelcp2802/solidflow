# Architecture

SolidFlow uses Electron for its desktop shell, React for the interface and
OpenCascade through Replicad for exact BRep modeling. Three.js renders meshes
and selection overlays. A mesh is a visualization, not the modeling authority.

| Area | Responsibility |
| --- | --- |
| `electron/` | Main process, constrained preload bridge, file dialogs and local recovery |
| `src/App.tsx`, `src/components/` | Command flow, property panels, sketch interaction and viewport |
| `src/model/` | Serializable documents, validation, migration and dependencies |
| `src/sketch/` | Pure 2D geometry, local constraint solver, trim and extend |
| `src/cad/` | Worker transport, BRep reconstruction, feature operations and references |
| `src/examples/`, `examples/` | Synthetic examples and saved editable documents |
| `src/cad/fixtures/solidflow-ui/` | Versioned inputs from SolidFlow UI and regression baselines |

The renderer sends serializable requests to a worker. The worker owns the CAD
engine and returns meshes, bounds, diagnostics and catalogs of references.
Dependencies rebuild in feature order. Missing or ambiguous supports produce
an explicit diagnostic instead of silently choosing another face or edge.

The Electron renderer has no Node integration. Filesystem access goes through
specific preload/IPC methods validated by the main process. The production
loader serves bundled assets through the application protocol; its smoke test
checks the real loader, worker and WASM initialization with a temporary profile.

Keep document format changes compatible with existing saved examples. Keep
geometry tests independent of presentation tests. Changes to the solver,
references or BRep operations need meaningful geometric acceptance criteria.
