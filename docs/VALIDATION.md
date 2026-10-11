# Validation

The public repository uses a self-contained suite. Claims are limited to the
cases checked, with the tolerances recorded in each test.

| Command | Evidence |
| --- | --- |
| `npm run test:unit` | Sketch geometry, solver, documents, CAD operations and saved UI fixtures |
| `npm run test:ipc` | Main-process IPC security and boundary checks |
| `npm run build` | TypeScript compilation and production Vite build |
| `npm run test:desktop` | Real Electron production page, preload, worker, WASM and first solid |
| `npm run package:<platform>` | Packaging for the host OS, without publication |

CAD checks use known coordinates, analytical formulas, valid BRep/solid counts,
volume, area, bounds and relevant Boolean differences. A matching volume alone
is insufficient evidence of identical geometry. Saved documents are parsed and
rebuilt; UI-export fixtures are identified separately from programmatic outputs.

GitHub Actions runs the portable suite, build, IPC and Electron smoke on
Windows x64, macOS arm64 and Linux x64, and packages each platform. Its actual
runs are authoritative; workflow configuration alone does not establish a pass.
CodeQL and a dependency audit run separately. The audit includes development
dependencies, blocks high/critical findings and leaves moderate findings visible.

Development packages are unsigned. Successful packaging does not establish
successful installation, notarization or all interactive workflows on that OS.
The project does not yet have exhaustive topology, numerical robustness,
accessibility, performance or platform coverage.
