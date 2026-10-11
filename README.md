# SolidFlow

<img src="public/solidflow.svg" width="72" alt="SolidFlow logo" />

**Free, open-source parametric desktop CAD with a blue interface.**

SolidFlow aims to make capable 3D design accessible on Windows, macOS and Linux.
It is an early-stage project: useful modeling operations work today, and large
parts of a complete CAD system remain on the [roadmap](docs/ROADMAP.md).

[CI](https://github.com/angelcp2802/solidflow/actions/workflows/ci.yml) ·
[Security](https://github.com/angelcp2802/solidflow/actions/workflows/security.yml) ·
[Contribute](CONTRIBUTING.md) · [Guía en español](docs/QUICKSTART.es.md)

## Try it from source

Install Node.js 24 and Git, then run:

```sh
git clone https://github.com/angelcp2802/solidflow.git
cd solidflow
npm ci
npm run desktop
```

For the production loader: `npm run build`, then `npm start`.
The editable format is `.solidflow`; STEP and STL are export formats.
No external CAD installation or account is required.

## Current capabilities

- Sketch lines, circular arcs and circles; geometric constraints, driving and
  driven dimensions, trim and extend, [sketch fillets](docs/SKETCH_FILLET.md)
  with editable or linked radii, [straight-line sketch chamfers](docs/SKETCH_CHAMFER.md),
  [associative sketch mirror](docs/SKETCH_MIRROR.md), construction geometry and undo/redo.
- Associative planar supports and reference planes; extrude, cut, revolve,
  sweep, loft, fillet, chamfer, patterns, mirror, shell, draft and hole features.
- Feature history, reconstruction, suppression, editable documents, recovery
  and STEP/STL export built on OpenCascade BRep geometry.

The interface currently uses Spanish labels. Unsupported commands are disabled.
Assemblies, technical drawings, sheet metal, simulation, general CAD import and
complete persistent topological naming are still pending.

Sketch fillets handle line/arc pairs and batches of common straight-line
corners, with keep/delete policies and individual or linked radii. Batches
preview and apply the complete selection together, rejecting interacting
corners that collapse or reverse a shared segment. Full-circle sources and
curved-corner batches remain work in
[issue #6](https://github.com/angelcp2802/solidflow/issues/6). The
[fillet guide](docs/SKETCH_FILLET.md) separates analytical CAD evidence from the
browser interaction exercised so far.

## Development and collaboration

```sh
npm test
npm run build
npm run test:desktop
```

The public tests include analytical geometry checks, document compatibility,
sketch behavior, saved UI fixtures and IPC security. They use only versioned
inputs. See [development](docs/DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md),
[validation](docs/VALIDATION.md) and [fixture provenance](docs/PROVENANCE.md).

Open an issue or send a focused pull request. English and Spanish are welcome.
Read [CONTRIBUTING.md](CONTRIBUTING.md), [governance](docs/GOVERNANCE.md), the
[Code of Conduct](CODE_OF_CONDUCT.md) and [security reporting](SECURITY.md).

## Platforms and packages

CI is configured to build, test the real Electron production loader and package
Windows x64, macOS arm64 and Linux x64. A configured job is not proof of platform
support: consult the linked Actions run and validation record for actual results.

Build on the target operating system with `npm run package:win`,
`npm run package:mac` or `npm run package:linux`. Packages appear in `release/`.
They are unsigned development builds; macOS notarization and signed releases are
not yet configured. CI validates packaging but does not upload binaries until the CAD toolchain's
complete corresponding-source bundle is verified. There is no automatic
GitHub Release publication.

## License

Copyright © 2026 SolidFlow contributors. Project code is licensed under
[GNU GPL version 3 only](LICENSE) (SPDX: `GPL-3.0-only`). You may use, study,
modify and redistribute it under that license. Contributions retain their
copyright and use the same project license.

Dependencies retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and the original texts in [licenses/](licenses/).
