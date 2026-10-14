# One-shot macOS SIGBUS diagnostic

This temporary diagnostic observes the original PR35 macOS unit failure once.
It preserves ordinary CI and PR35. It is not a product feature, required-check
replacement, release workflow, retry mechanism or reason to merge a failing
pull request. Keep the diagnostic branch separate and never merge it into a
product branch or the default branch.

## Invocation and pinned source

The dedicated workflow responds only to the initial push creating
`diagnostic/pr35-mac-sigbus` in `angelcp2802/solidflow`. The reviewed harness
must be one commit directly on
`0a0ab22a0cd0b6295b9ff7c5761398b1ae457a4a`; its actual commit and parent are
checked before installation. Create the remote ref through that single reviewed
push, without a placeholder branch push first.

Workflow and script gates require the exact repository/ref, `created:true`,
`deleted:false`, `forced:false`, an all-zero `before`, equal event `after`,
actual SHA and head-commit ID, and run attempt one. The shared script reads a
bounded regular event file and checks exact values without printing the
payload. Later pushes and reruns do not qualify. These gates are not a persistent
global one-use lock: deleting and recreating the branch must not be used to
obtain another run. Do not weaken a gate to execute the experiment.

The harness and source are separate checkouts. The observed source is pinned to
[tested merge b720c4f](https://github.com/angelcp2802/solidflow/tree/b720c4f3eb6cf526fc6d3c23a6954c2e3243c733),
tree `741d8ed0c48d1b988fefd3c6393a6e73e6fd0ff4`. It retains Node24.20.0,
npm11.19.0, Vitest5.0.3, config/lock hashes and the complete 1492-test/74-file
unit selection. No pool, worker limit, isolation, timeout, retry or test filter
changes. The workflow installs, builds and runs that full unit command once,
with an additional phase reporter and Node diagnostic-report flags. It does
not run IPC, Electron or packaging after the unit experiment.

## Synthetic gates before the experiment

From a fresh checkout, the standalone check needs only Node builtins:

```sh
node --test --test-reporter=tap scripts/ci/mac-sigbus/invocation-guard.test.mjs
```

Its 27 original synthetic cases exercise context rejection, event files and
the shared publisher entry using real generated files and captured output.
No private fixtures, dependency install, CAD, Electron, controller or network
are used. Canonical temporary-fixture identity, parent, type, prefix and token
must still match before cleanup.

The workflow runs these tracked gates before the Mac experiment. Raw TAP and
stacks stay in ephemeral runner temp; public gate output contains only numeric
counts/status, an OS-known signal and fixed labels. Failed exits remain failed;
missing/duplicate summaries, skipped/cancelled/todo cases and supervisor errors
fail closed. These tests check publisher return/output, not CLI termination.

## Exit evidence and privacy

An original nonzero unit exit or signal remains the diagnostic's primary
failure. Observer and collector errors are recorded separately; they can also
fail an otherwise zero unit result. One non-reproduction is not a fix or a
platform claim. Reporter I/O and Node report flags can affect timing, even
though the source selection and native budgets remain unchanged.

No secrets, raw report/log uploads, cores, binaries, installers or releases are
used. Raw Node/OS reports and logs remain in ephemeral `RUNNER_TEMP` and are not
persistently retained when the runner disappears. The public publisher requires
a context-bound successful-write receipt, re-whitelists the parsed summary and
limits the final output to 850000 UTF-8 bytes including newline. Suspect symbol
fields are replaced in full with a hash; private paths, environment values and
command arguments are not published. Public report fields are bounded
exception/signal metadata, victim PID, selected backtraces, image UUIDs and safe
basenames, plus integrity hashes and explicit observer/collector errors.

Report collection uses an inventory delta and recorded npm/Vitest coordinator
PIDs. This is not complete native ancestry, process-start identity or crash-time
attestation. A matching report is a candidate observation, not an established
cause. Missing reports do not prove no crash. Logical worker events do not
identify the faulting native thread; the last completed test file does not
identify the faulting operation. Do not infer CPU/RAM causality from snapshots.

The [validation record](VALIDATION.md) separates the passing Windows synthetic
gates, earlier private privacy cases, the inconclusive subprocess timeouts and
the still-unexecuted Mac diagnostic. Product tests/build after applying the
diagnostic branch must be recorded separately. Do not replace failed evidence
or repeat the experiment merely to obtain a green result.

## Recorded local preflight — 2026-10-14

After applying the ten reviewed diagnostic files to a Windows x64 checkout
based on `0a0ab22a0cd0b6295b9ff7c5761398b1ae457a4a`, one `npm test`
invocation exited 1: 1,359 cases passed and 133 timed out, across 74 files
(57 passed, 17 failed; 1,492 cases, none skipped). Timeout reconciliation
accounted for all 133 failures: 130 at 5,000 ms, one at 15,000 ms and two at
30,000 ms. One thread-worker termination timeout was also reported. Vitest
reported 939.63 s; the full npm invocation took 1,180.191 s. IPC did not run
because the unit failure stopped the command chain.

The subsequent `npm run build` exited 0. TypeScript and Vite production
compilation completed with 1,972 transformed modules. Vite reported
1 min 24 s; the full npm invocation took 299.532 s. Warnings covered Node
module browser externalization and chunks larger than 500 kB. Existing
dependencies were reused with matching lockfiles. The diagnostic sources,
ordinary CI, package files and Vitest configuration remained unchanged.

An auxiliary local process observer developed an empty-frontier loop during
part of the tests and the build. Its timing impact is unmeasured and the cause
of the unit timeouts is not established. Only that observer was stopped; the
npm commands finished. The failed unit result is preserved, without a unit
retry, test filter or configuration adjustment.

A separate four-case Windows Node v24.11.1 rehearsal passed in 171.834 s.
The exact inline gate ran the actual tracked suite and accepted 27 passes
with zero failed, cancelled, skipped or todo cases. A publisher import-only
child exited 0 without stdout or stderr. The valid synthetic publisher CLI
exited 0 while preserving synthetic unit and diagnostic status 138 in its
output. The synthetic run-attempt-two CLI exited 1 with the expected
`INITIAL_PUSH_ENV_REQUIRED` rejection and no stdout. All four outer child
exit and close events were observed with null signals, no supervisor errors
and successful removal of the owned rehearsal temporary directory. No
automatic child deadline or process termination was imposed by this rehearsal;
the earlier subprocess-timeout evidence remains unchanged.

The rehearsal checks local inline execution, expected publisher CLI outcomes
and those child close events. It does not execute the Mac controller, a real
crash-report collection or the GitHub initial-push trigger. The local product
checks used the applied diagnostic checkout; the pinned macOS experiment has
not run. The SIGBUS cause remains unknown, and these results establish no
macOS remediation, desktop readiness or platform support.
