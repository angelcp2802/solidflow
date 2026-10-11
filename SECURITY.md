# Security policy

SolidFlow is an early-stage desktop CAD application. Security maintenance is best effort. The default development branch and the most recent released version, when available, are the focus for fixes; older versions have no guaranteed backports or long-term support. There is no promised response deadline or paid bounty program.

## Report privately

Do not post vulnerability details, exploit files or sensitive logs in public issues or pull requests.

On the GitHub repository, open **Security** (or **Security and quality**) and choose **Report a vulnerability**. Submit a private report through GitHub's vulnerability-reporting form. This option is available only after repository administrators enable it; the presence of this policy does not enable it. [GitHub's reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately) explain the process.

If that option is unavailable, open a general issue asking maintainers to enable private vulnerability reporting or provide a preferred private security contact. Include no description of the suspected flaw, proof of concept or attachments in that public request. No dedicated security email address is currently published.

In the private report, include:

- The affected version or commit, operating system, architecture and execution mode.
- The security impact and any prerequisites or required user action.
- Minimal reproduction steps and a synthetic file or proof of concept, if needed.
- Expected and observed behavior, and any suggested mitigation.
- Your preferred attribution and disclosure expectations.

Use data and systems you are authorized to test. Remove credentials, personal models and unrelated user data from evidence.

## Scope and handling

Relevant areas include Electron renderer isolation, IPC authorization, native-dialog file grants, path and protocol handling, document parsing, exported files, resource exhaustion and dependencies. Incorrect geometry is normally a public bug; use private reporting when it creates a security impact.

Maintainers will try to reproduce and assess the report, discuss a fix privately and coordinate disclosure with the reporter. A confirmed security fix should identify affected versions, a fixed version or mitigation and credit the reporter when they agree. Timelines depend on the people available; this policy makes no service-level guarantee.

Checks and advisories are evidence with a limited scope. Passing CI, having a security policy or generating an installer does not establish a security audit or a trusted signature. Consult [validation](docs/VALIDATION.md) for the status of particular builds.
