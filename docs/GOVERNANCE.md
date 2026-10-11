# Project governance

SolidFlow aims to become a free, community-developed parametric CAD application for personal and professional work, with a blue interface and Windows, macOS and Linux as target platforms. It is an independent project. Goals describe direction; production readiness and platform support require their own validation.

## Responsibility

At this initial stage, repository administrators are responsible for merge access, releases, security settings and moderation. There is no elected committee or separate foundation. Contributors can propose changes and review each other's work without holding a project role.

Administrators may invite maintainers after sustained, constructive contributions and review work. Responsibilities and access should be explicit and limited to what is needed. Changes to maintainer roles should be recorded publicly, without exposing private account or security information. Maintainers may step back by notifying the other administrators.

## Decisions

Routine fixes are decided through pull-request review. Larger changes start with an issue describing the user problem, proposed behavior, alternatives, compatibility effects and acceptance tests. Relevant discussion should remain in that issue or its linked pull request so others can follow the reasoning.

Maintainers seek agreement and explain decisions using scope, evidence and maintenance cost. If a discussion remains unresolved, repository administrators make and record the decision. Rejected or deferred proposals should receive a concrete reason and, where possible, a condition for reconsideration. There is no automatic voting rule or delivery promise based on issue popularity.

Document-format changes need a migration or compatibility plan. Kernel and solver changes need appropriate geometric regression evidence. A new platform claim needs actual build and runtime results for that platform. Changes to the project's license, governance or release permissions require explicit repository-owner approval and a recorded decision; a normal feature pull request must not silently change them.

## Merging and releasing

The normal merge policy is a pull request with at least one approving review from another contributor with review authority, plus the required passing checks. The review covers correctness, scope, compatibility and user-visible limits; successful CI does not replace it or the manual validation a change requires.

While the project has a single maintainer, that maintainer may use an administrator bypass if the repository's actual rules permit it. This is an explicit exception, not an independent approval. The pull request must record why the exception was needed, the checks performed and known limits; configured checks must pass. Bypass must not be used to conceal failed checks or dismiss an unresolved security issue. As additional maintainers join, the independent-review rule should become the routine path. GitHub rule enforcement and available bypass permissions must be checked in repository settings rather than inferred from this document.

### Enforced repository configuration — 2026-10-11

Two active rulesets target the default branch, currently `main`:

- [Review main](https://github.com/angelcp2802/solidflow/settings/rules/24886026)
  requires a pull request, one approval, dismissal of stale approvals and
  resolved review conversations. Repository administrators have a bypass for
  pull requests only, subject to the recorded single-maintainer exception above.
- [Protect main checks](https://github.com/angelcp2802/solidflow/settings/rules/24886149)
  has no bypass actors. It blocks branch deletion and force pushes, requires
  linear history and an up-to-date tested branch, and requires six checks:
  `Desktop (win-x64, Node 24)`, `Desktop (mac-arm64, Node 24)`,
  `Desktop (linux-x64, Node 24)`, `Dependency audit (high/critical)`,
  `CodeQL (JavaScript/TypeScript)` from GitHub Actions, plus the separate
  `CodeQL` result from GitHub Advanced Security. The review exception does not
  bypass these checks.

Only squash merging is enabled. These are observed repository settings, not
settings provisioned by the source checkout; administrators should verify them
after changing rules or workflows. A fork needs its own repository configuration.

Releases should identify their source revision, changes, supported artifacts and known limits. Binary artifacts need hashes and an accurate signing status. Platform build checks, interactive runtime checks and packaged-application checks must be distinguished. CI output is not automatically an endorsed release, and an unexecuted package must not be described as tested.

Public regression fixtures must state provenance, reproduction steps, units and tolerances. Only files the project has permission to distribute belong in the repository. Analytical expectations and reproducible models should establish the intended behavior; one passing fixture does not establish coverage for every configuration.

## Participation and support

Use [CONTRIBUTING.md](../CONTRIBUTING.md) for proposals and review, the [Code of Conduct](../CODE_OF_CONDUCT.md) for behavior and reporting, and [SECURITY.md](../SECURITY.md) for private vulnerability reports. Support and moderation are best effort; the project does not promise commercial support or response times.

The [roadmap](ROADMAP.md) tracks intended scope and [validation](VALIDATION.md) tracks observed results. Neither is a contract for delivery dates. SolidFlow is licensed under [GPL-3.0-only](../LICENSE); contributions use the same license without a separate CLA. A proposed license change needs a dedicated review and the approval described above.
