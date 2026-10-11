# Working on SolidFlow

Read CONTRIBUTING.md and docs/DEVELOPMENT.md before changing the project.
Keep CAD behavior, document compatibility and independent geometric evidence
reviewable. Do not claim platform support from a single passing case. Keep
validation claims limited to the cases and tolerances actually checked.

Use `npm test` and `npm run build` for code changes. After Electron, IPC,
worker or WASM integration changes, also run `npm run test:desktop`.

Do not publish local artifacts, personal paths, proprietary source, vendor
binaries or private CAD models. New fixtures need provenance. Work in focused
branches and explain actual validation in the pull request.
