# Development guide

Use Node.js 24 and npm. Dependency versions are recorded in `package-lock.json`; install them with `npm ci`. Git is needed for the contribution workflow. Windows is the platform with the current local desktop evidence; macOS and Linux are targets whose build and runtime results must be recorded separately.

## Run locally

From the repository root:

```sh
npm ci
npm run desktop
```

The desktop development command starts Vite on `127.0.0.1:5173` and opens Electron. The port is fixed; close an earlier instance if it is occupied. Closing the application ends its development server.

For production-loader testing:

```sh
npm run build
npm start
```

`npm run dev` provides a browser view. Browser downloads and native desktop dialogs are different paths; testing one does not validate the other. Use a synthetic document for experiments and keep a copy before changing a model you need.

## Checks

| Command | Scope |
| --- | --- |
| `npm test` | The public unit/CAD suite and desktop-security checks from a fresh checkout. |
| `npm run test:unit` | Unit and CAD regressions that can run from a fresh public checkout. |
| `npm run test:ipc` | The desktop-security suite without opening a desktop window. |
| `npm run build` | TypeScript checking and production compilation of UI, worker and WASM integration. |
| `npm run test:desktop` | Real Electron production-loader smoke check after building, with a hidden window and isolated temporary user data. |
| `npx --no-install vitest run src/sketch/extend.review.test.ts --pool=threads` | A focused sketch/CAD regression file; replace the path with the relevant test. |

The desktop smoke check loads the initial model, preload, worker and WASM and checks readiness and console errors. It does not click the editor's tools or launch the packaged installer. On a headless Linux machine, a display server is needed for Electron; CI can use `xvfb-run -a npm run test:desktop` after installing the required system libraries. Do not disable Electron's sandbox to make a check pass.

Run focused tests while developing, then the checks relevant to the complete change. The [CI workflow](../.github/workflows/ci.yml) is configured for Node 24 on Windows 2025 x64, Ubuntu 24.04 x64 and macOS 15 arm64: install, build, unit tests, IPC tests, Electron smoke check and packaging. Linux uses Xvfb. A configured job is not an executed result; check Actions for the actual commit and platform before claiming a pass.

CI packages have no signing or notarization credentials and are built with `--publish never`. Binary upload is disabled until the CAD library's complete corresponding-source bundle is verified. They are not automatically published releases. Local packaging commands are `npm run package:win`, `npm run package:mac` and `npm run package:linux`; use the command appropriate to the host. Packaging success does not prove interactive operation, signing or acceptance by the platform's application controls. Current evidence and its limits belong in [VALIDATION.md](VALIDATION.md).

Pull-request CI and security checks run for every target branch, including
stacked pull requests based on a feature branch. The workflow-dispatch entry
points can also validate a published branch explicitly. Inspect the actual
head and run results before reporting a pass.

## Find the right layer

| Path | Responsibility |
| --- | --- |
| `src/model/` | Document schema, parsing, dependencies, references and history. |
| `src/sketch/` | Entity geometry, editing, structural validation and the local constraint solver. |
| `src/cad/` | Replicad/OpenCascade operations, BRep validation, worker transport and export. |
| `src/components/` | Sketch editor, 3D viewer and property panels. |
| `src/examples/` | Small reproducible documents exposed through the library. |
| `electron/` | Window, local application protocol, native file dialogs and the restricted IPC bridge. |

Keep geometry out of presentation-only mockups. A new tool should change the saved model through the editing layer and rebuild through the public CAD engine. In sketch trim/extend, preview and commit consume the solved geometry being displayed; they do not run a hidden solve. Driven values come from the solver result, not from a retained nominal value. Read the relevant contract before changing those rules.

Generated sketch IDs are opaque saved identities. Read the [identity contract](SKETCH_IDENTITY.md) before changing creation, preview/application or deletion behavior; a new creation and an edit of an existing object have different identity requirements.

Lengths use millimeters. State angular units explicitly: the sketch's directed angular dimensions use degrees, while geometric calculations may use radians. Persisted point-on-line and point-on-circle relations use complete supports; a finite hit test is a separate requirement. Useful starting points are [sketch types](../src/sketch/types.ts), the [solver](../src/sketch/solver.ts), [trim](../src/sketch/trim.ts), [extend](../src/sketch/extend.ts) and their adjacent regression tests.

Read the [semantic CAD reference contract](SEMANTIC_REFERENCES.md) before changing extrusion provenance, v2 reference identity, document acceptance or selection aliases. This branch integrates verified references for the first eligible finite entity-profile extrusion and retains conservative v1 behavior for saved references and unsupported correspondence. Original regression inputs and analytical expectations are recorded in [fixture provenance](PROVENANCE.md); written tests and source-level ownership reasoning are not executed validation results.

The proposed [body management contract](BODY_MANAGEMENT.md) covers persistent body identity, explicit creation and Combine, selective cuts, history, export and the complete implementation checklist for issue #26. Its analytical fixtures are acceptance targets, not recorded passes.

The [scoped feature geometry proposal](FEATURE_PATTERNS.md) distinguishes exact
per-owner contributions, potential historical states and native availability.
It is under implementation; regeneration, varying sketches and dynamic scopes
remain separate required work.

The [feature recipe declaration layer](FEATURE_RECIPES.md) documents the pure
closure/frame API and its pending native evaluator. Its 51 synthetic pure
cases are separate from [explicit-frame native tool construction](FEATURE_REGENERATION.md),
integrated regeneration and interactive UI validation. Current saved geometry
grammar stays unchanged until these layers are explicitly integrated and checked.

## Test geometry and persistence

Prefer small analytical fixtures with a known result. For example, a closed 10×6 rectangle extruded 4 mm should have volume 240 mm³; the test should also establish valid BRep and the expected number of solids. For affected references, edit an earlier feature, rebuild dependent features and serialize/reopen the document. Test failure paths for atomic behavior when the command can reject a change.

OpenCascade/WASM tests use thread isolation and initialize their runtime before constructing shapes. Dispose engines and release owned native objects after use. Avoid sharing mutable kernel state across test files or weakening validity checks to accommodate a failing fixture.

Distinguish these evidence types in reports: numerical unit/integration tests, server-rendered components, browser or Electron interaction and exported-file checks. Record the exact files and commands used. Public CI must be self-contained: it uses tracked source, declared dependencies and synthetic fixtures that the project can distribute. A new fixture needs documented provenance, generation steps, parameters, units and tolerances. Do not invent a source or an expected result to fill a gap in evidence.

## Work safely with desktop files

The renderer must stay isolated from general Node.js and filesystem access. Use the existing preload/IPC bridge and native-dialog grants for file operations. Do not add arbitrary IPC commands, disable navigation/protocol checks, remove size limits or persist privileged paths in a document to work around a UI problem. Security regressions need tests in the desktop-security suite and a private report if they expose users.

Do not include local recovery data, binaries or output from `artifacts/`, `dist/` or `release/` in a code pull request. Keep generated files out of changes unless the repository explicitly tracks them. See [CONTRIBUTING.md](../CONTRIBUTING.md) for review and provenance requirements.
