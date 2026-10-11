# Contributing to SolidFlow

SolidFlow is an independent parametric CAD project with a blue desktop interface. We welcome bug reports, small fixes, geometry tests, documentation, accessibility work and platform testing. English and Spanish are both welcome in issues and pull requests.

Windows, macOS and Linux are project targets. A successful build on one system does not establish support on the others. Check the [roadmap](docs/ROADMAP.md) and [validation record](docs/VALIDATION.md) before describing a feature or platform as supported.

## Start with a reproducible problem

Search existing issues, then describe the workflow you want to improve. For a bug, include the version or commit, operating system and architecture, exact steps, expected result and actual result. A small synthetic `.solidflow` document is more useful than a large confidential model. Remove personal paths, secrets and proprietary data from attachments.

For a new operation, solver rule, document-format change, dependency or platform integration, open an issue before investing in a large implementation. Describe a concrete example and how its result can be checked. Small corrections can go directly to a pull request. Report security vulnerabilities using [SECURITY.md](SECURITY.md), not a public bug report.

## Make a focused change

1. Fork the repository and create a branch from its default branch.
2. Follow the [development guide](docs/DEVELOPMENT.md) to install dependencies and run the app.
3. Keep the pull request focused on one problem. Avoid unrelated formatting, generated bundles and dependency updates.
4. Add a meaningful regression test for changed behavior, and update the relevant contract or user instructions.
5. Explain the result, validation and remaining limits in the pull request. Draft pull requests are welcome for early review.

Do not commit `node_modules`, compiled output, installers, recovery files or local research artifacts. A new dependency needs a reason, its license and its effect on the desktop build. Keep `package-lock.json` in sync with intentional dependency changes.

## Validate the behavior

Before requesting review, run:

```sh
npm ci
npm test
npm run build
```

For changes to Electron, IPC, the production loader or worker/WASM integration, also run `npm run test:desktop` after building. Report the operating system and commands actually run. If a check cannot run locally, say why; a screenshot is not a substitute for an unexecuted check. CI requirements and platform-specific commands are described in the [development guide](docs/DEVELOPMENT.md).

CAD changes need evidence appropriate to their effect:

- Use independent coordinates, formulas or known fixtures to check geometry. Do not calculate the expected result with the same helper under test.
- For solid operations, check BRep validity, solid count and relevant volume, area or bounds. Check saved-document round trips, references and downstream reconstruction when they can be affected.
- For sketch editing, check constraints, shared points, undo/redo and fresh driven measurements where relevant. Cover a useful boundary or rejection case.
- Separate programmatic tests, rendered UI tests, real interaction and exported-file checks. State tolerances and the exact behavior exercised; one passing model does not establish coverage for every configuration.

Pure documentation or presentation changes do not need artificial geometry tests. Validate their links or actual appearance instead. Public CI must run from a fresh checkout using the tracked source and fixtures, without unpublished local artifacts or external desktop applications.

## Review, provenance and conduct

Maintainers review correctness, scope, compatibility and evidence. Address feedback in the same pull request and explain any disagreement with a reproducible example. A proposal may be deferred when it lacks a maintainable implementation or a clear acceptance test. See [governance](docs/GOVERNANCE.md) for decisions and releases.

SolidFlow uses [GPL-3.0-only](LICENSE). Code contributions are accepted under that same license; no separate CLA or copyright assignment is requested. Submit work you have the right to contribute, preserve third-party notices and document fixture provenance. Do not contribute vendor binaries, copied proprietary source, private models or credentials. AI-assisted changes have the same review and evidence requirements as other changes; contributors remain responsible for what they submit.

Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md).
