# Prototype input and validation hardening

This increment follows persisted configurations. It addresses concrete input
and validation problems without adding a CAD family or completing the assembly
scope. Executed results belong in the [validation ledger](VALIDATION.md).

## Own data records

Seven model admission paths previously copied caller-named fields into fresh
null-prototype objects. Six already checked local allowed keys; cylinder branch
admission checked its exact discriminated shape afterward. Review found no
demonstrated prototype-pollution path, but the dynamic writes drew CodeQL
`js/remote-property-injection` findings.

Six paths now capture permitted own enumerable data descriptors in a Map.
Their consumers read literal field names and construct the same literal output
types. Cylinder branches use exact own-key counts and literal descriptors.
Missing optional fields remain distinct from own `undefined`; getters, symbols,
serialization hooks, hidden/extra fields and unexpected prototypes still reject.
Nested values remain untrusted until the existing domain validators detach and
validate them. This does not convert a data record into geometric authority.

## File reads

An `lstat` before `open` cannot prove which object the pathname will open. The
reader now admits the actual descriptor first, before reading bytes: regular
file, usable identity and existing size limit. Path/descriptor identity, size,
timestamps and canonical paths must agree before and after the bounded read.
The source capability still authorizes a canonical pathname, permitting an
editor's atomic replacement **between** complete reads. It does not grant Save.

POSIX opens request `O_NOFOLLOW | O_NONBLOCK | O_RDONLY`; unsupported flags or
open failure do not trigger an unprotected fallback. Windows retains `O_RDONLY`
and descriptor/path checks. The [Node file-open documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-open-constants)
distinguishes these platform flags. Do not infer Windows no-follow/nonblocking
protection from a passing Windows descriptor test.

Portable regressions use actual owned file descriptors for wrong-file and
nonregular observations, check zero bytes read and one close, then verify the
file-operation gate remains usable. The separate POSIX regression replaces an
admitted regular path with a real FIFO immediately before open. It runs each
file channel in a killable child with a fixed deadline, preventing an old
blocking `open` from hanging the test runner. A Windows skip supplies no POSIX
runtime evidence. No fixture uses a private model or external application.

Fault hooks capture the actual canonical owned path before arming. Windows
dialog requests deliberately use a verified uppercase alias of the same file;
the mock matches the canonical path that main opens. The alias must not turn
an intended negative case into an uninjected successful read. This changes test
admission, not file-opening or identity policy in production.

## Worker queue

A malformed message could fail again while reading `request.id` in the error
handler, leaving the promise queue rejected and later valid work unprocessed.
A strict own-data transport envelope now captures safe correlation, the actual
known action and its required/optional union fields before queueing. Missing
or invalid correlation is discarded; correlated malformed envelopes return
errors without initializing WASM or calling a domain command. Payload semantics
and private token checks remain in their existing command-specific boundaries.

Initialization, handler and transport failures cannot poison later tasks.
Failed response serialization gets one small correlated failure attempt; no
CAD command, initialization side effect or private capability is replayed.
The worker factory retains its existing initialization memoization and retry.

The real desktop baseline also starts an independent dedicated worker using
the **observed production bundle**. It sends null, unknown/missing envelopes
and an invalid build payload, then requests an original 2×3×4 prism. Ordered
errors followed by native volume 24 mm³ and literal bounds demonstrate recovery
through production worker/WASM code. This is separate from pure queue tests.

The origin warning requires receiver-context review. The app creates a private
module `Worker`, not a window message broker or shared worker. The
[HTML worker standard](https://html.spec.whatwg.org/multipage/workers.html#dedicated-workers-and-the-dedicatedworkerglobalscope-interface)
defines its implicit port; [CodeQL's origin-check help](https://codeql.github.com/codeql-query-help/javascript/js-missing-origin-check/)
describes communication between windows. Actual pinned desktop probe replies
record their event metadata. An origin comparison copied from a window example
is not established as a correct worker policy. No query suppression, blanket
origin allowance or security-check disabling is part of this increment; actual
CodeQL acceptance must be reported separately from this review.

## Renderer oracles

The directed-guide source-repair workflow now observes
`preview-assembly-part-update` and its private review identity. Unrepaired
references produce the command's exact correlated failure, retaining the
editable stage and withholding Apply. The old test awaited a general assembly
preview that the current editor no longer sends.

Pointer oracles distinguish issued double coordinates from actual DOM
coordinates. Input must arrive unchanged or as its exact float32 value; two
observed samples predict the third posted intention. Literal independent
interval clamps use that actual intention, never the solved pose. The expected
angular state remains attached to the test event through Apply and reopening.
Native tolerances, physical-check thresholds and test deadlines are unchanged.
Correcting this assumption does not by itself identify a hosted failure whose
full log was unavailable. See the ledger for the specific local reproduction.

## CI failure diagnostics

The shared renderer harness annotates the original child failure before exit.
The Node IPC suite retains the built-in `spec` reporter and adds a separate
`TestsStream` reporter for failed leaf tests. It puts the original own assertion
cause and test name into the same bounded diagnostic formatter, ignores parent
subtest aggregates and leaves Node's exit status, pass/fail/skip and ordinary
output intact. Annotations are emitted only for `GITHUB_ACTIONS=true`.

Messages are limited to 4096 encoded bytes, escape workflow-command controls
and redact absolute paths/URLs. Descriptor reads avoid invoking arbitrary
error/name getters. These annotations improve observability; they neither
convert failures into passes nor identify an unobserved hosted cause.
