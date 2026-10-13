# Explicit body patterns and reflection

This proposed increment extends the explicit body catalog to linear patterns,
circular patterns and mirror. The older `features` and single historical `body`
sources retain their aggregate reconstruction behavior when the new fields are
absent. Feature-delta replay inside an explicit body catalog remains pending;
this increment does not adopt legacy aggregates or derive identity from solid
enumeration, bounds, mass or nearest geometry.

## Sources and outputs

An explicit source is `source:{mode:'bodies',scope:'current'|'historical',bodies}`.
Its ordered list contains 1–32 exact `{bodyId,sourceFeatureId}` references to
distinct bodies. Current inputs must match the current catalog exactly.
Historical inputs resolve only a retained snapshot of that exact body and
producer/modifier; consumed current bodies can still supply such a snapshot.
The pattern's `baseFeatureId` remains its aggregate predecessor, separate from
the seed states and a merge target. Suppressed or unavailable inputs reject.

`bodyPattern:{mode:'new',instances}` creates independent copies and leaves every
input unchanged. Each saved instance contains `seedBodyId`, a canonical address,
an opaque `bodyId` and `retired`. Linear addresses are `i,j`, circular addresses
are `i`, and reflection uses `mirror`; the original seed has no output slot.
The ledger covers omitted positions too. Reordering seeds, changing supported
dimensions, and omitting/restoring positions preserve their existing output IDs.

Removing a seed or position in a committed edit retires its slots permanently.
A later expansion allocates fresh identities without discarding the retired
records. While editing, returning to a committed seed/position before accepting
restores its original slot; a temporary draft change does not retire a committed
identity. Allocation happens only in the editing command, never on load,
preview preparation or native reconstruction. Undo/redo restores exact document
snapshots. A saved ledger is append-only; existing bindings cannot be reassigned
and committed retired slots cannot be reactivated.

`bodyPattern:{mode:'merge',target}` adds only the transformed copies to one exact
current target. It retains the target's creation identity and advances its state
to this feature. Seed bodies are not consumed. All copies are staged together;
the final union must be one valid closed solid. A later copy can bridge an
earlier disconnected intermediate. New/merge cannot be switched on an existing
saved repetition. For mirror, `mergeBodies` must agree with the explicit mode.

Separate new bodies may overlap or coincide, just as other explicit producers
may. They retain separate native ownership and identities. This does not change
the older repetition path's duplicate-geometry rejection.

## Atomicity, references and limits

Resolve every seed and the target before creating candidates. Validate the
complete staged catalog before a single transfer. A bad later copy, stale
reference, disconnected final merge or limit error leaves the preceding catalog
and unselected body metadata unchanged and blocks export of the failed rebuild.
Current and historical lookups never substitute a surviving body with the same
ID in a different state. Historical topology and transformed copies have owned
lifetimes, with native candidates released on success and rejection.

The parser includes all seed/target dependencies in deletion cascades and checks
earlier structural ownership. Retired and omitted output associations remain
loadable for repair; reconstruction rejects a reference to an unmaterialized
state. A merge's creation chain follows its target, not copied seeds.

The existing 256 active-body and 256 pattern-position bounds remain. Explicit
repetitions permit at most 512 active seed applications, 8,192 saved slots per
feature including retired records, and 65,536 created body IDs per document.
At most 512 distinct exact historical body states are retained for the active
repetitions of one rebuild. Limits reject rather than truncate IDs or records.
Legacy aggregate bodies do not acquire these explicit identities automatically.

Preview/Apply uses the existing detached body command and attests the full
document, seed selection and scope, target, settings, ledger and exact native
preview. Changing any input invalidates Apply. Cancel commits nothing.

The property panel exposes multiple seeds, current/historical scope, independent
new-body or target-merge choice and a separate current destination. A stale
selection remains visible for explicit correction. Programmatic or rendered
component tests do not establish real pointer/keyboard editor acceptance.

## Evidence boundary

The identity ledger, retirement policy and resource limits are independent
project design choices. Existing local feature-pattern observations do not
establish multibody copying, merging or opaque-ID persistence. The original
analytical fixtures and tolerances are documented in [PROVENANCE](PROVENANCE.md).
Actual commands, failures and results belong in [VALIDATION](VALIDATION.md).
Same-kernel STEP round trips check geometry only; they do not preserve opaque
document IDs or prove independent interoperability. General topological naming,
feature-delta replay in a body catalog, broader interaction and the other CAD
modules remain separate acceptance work.
