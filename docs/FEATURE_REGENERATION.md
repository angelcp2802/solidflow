# Feature regeneration construction — proposal

Feature regeneration must evaluate selected operations again at each instance;
copying the source operation's signed material change does not implement that
behavior. The [recipe declaration component](FEATURE_RECIPES.md) and
[explicit-frame primitive builder](../src/cad/kernel.recipe-primitives.ts) are
separate construction steps. They do not enable a saved regeneration mode or
establish the complete feature-pattern scope. Existing
[geometry contribution patterns](FEATURE_PATTERNS.md) retain their own contract.
Actual executed checks belong in [VALIDATION](VALIDATION.md), not this proposal.

## Explicit-frame primitive input

The builder accepts one circle or rectangle profile, its already-resolved
orthonormal frame, signed depth, an add/subtract operation, and a termination:
blind, ThroughAll, UntilNext or UpToSurface. It creates an actual native Plane,
Sketch and extrusion using that explicit frame. An intrinsic sketch does not
need a fabricated support or a hidden saved datum. No document IDs or saved
planes are allocated by this component.

The resolved frame origin already includes sketch offset. The local profile
center is applied once with `framePoint`; the local Y axis is `normal × X`.
The recipe evaluator must supply signed reflection parity: X′=QX,
N′=det(Q)QN and depth′=det(Q)depth. This preserves the physical extrusion ray
Q(sign(depth)N). A limiting plane's normal has its separate geometric transform
policy; an evaluator must not substitute a profile's signed normal for it.

Profile dimensions and depth magnitude must be 0.01..100000 mm; local profile
center coordinates stay within ±1000000 mm. Frame coordinates and computed
profile/start/end points must be finite. Frame X and normal must be unit and
orthogonal within 1e-8; the builder rejects arbitrary axes instead of repairing
them. Calculated prism length is 1e-7..10000000 mm and calculated start magnitude
is at most 10000000 mm. This is an internal typed interface after strict recipe
parsing, not a raw-document descriptor/prototype validation boundary.

For physical ray `sign(depth)·normal`, a prism of length L starting at s moves
its profile center by `ray·s` and extrudes by `sign(depth)·L`. Blind symmetry
uses `s=−abs(depth)/2`. There is no second sketch-offset application.

## Current target and termination

ThroughAll and UntilNext require the current detached working owner for the
specific instance. The caller must resolve and attest that exact owner/history;
a scene aggregate is not its substitute. The builder makes a native geometric
copy with `copyBodyShape` before calling the existing termination helpers,
protecting borrowed input topology. `Shape.clone()` shares topology and does
not provide this isolation. This is an input copy, not a copied feature delta.

Subtractive ThroughAll constructs an enclosing tool; its artificial margins
do not become the resulting body's boundary. Additive ThroughAll uses actual
exit surfaces. UntilNext cutting stops at a complete exit and an additive
operation at entry. BothDirections uses the supplied signed physical ray and
the existing native helper's two-direction semantics. UpToSurface requires
exactly one explicit resolved plane frame or available borrowed native face;
the helper constructs/clones its own limit. Saved reference ownership, face
role correspondence and historical/native availability remain caller checks.

The caller supplies a validator for every primitive and final helper result.
It must inspect actual native BRep validity, closed-solid cardinality, positive
finite volume and finite bounds without consuming or mutating the tool.
Finite input scalars alone do not establish valid geometry. The returned tool
is owned by the caller; owner Boolean, no-op comparison and catalog publication
are separate operations.

## Ownership and failure limits

Borrowed input wrappers are never deleted by the builder. Each wrapper received
and owned by it gets at most one explicit delete attempt, marked before calling
native release. Cleanup failure is fatal: a received result is released once,
the primary construction/validation error is retained as cause when present,
and cleanup errors remain observable.

Replicad 1.1.0 `Sketch.extrude` consumes the sketch before returning its solid.
The builder adapts `delete` only on that newly owned Sketch instance, records
its release error and avoids a second attempt. This lets a subsequently
returned solid be observed and released before the failure escapes. It does
not patch a global/prototype or change borrowed objects.

An attempted delete is not proof of successful release. Sketch/Plane release
can be internally sequential; factories, extrusion GC and existing limit
helpers can throw before returning an allocation. Their current cleanup paths
can also mask an earlier error or lose a return. This component cannot recover
those unseen allocations or guarantee all child releases. Safe upstream
cleanup adapters and causal failure tests remain required for a complete
ownership claim.

## Integration still required

The [original primitive fixtures](PROVENANCE.md#explicit-frame-recipe-primitive-fixtures)
distinguish a regenerated height-8 cut from a height-4 copied removal for three
specific transforms. They also specify signed/symmetric depth and dynamic
termination checks. Written assertions are not an executed pass, platform
support, exported interoperability or a real interaction result.

This module does not evaluate the selected recipe DAG or change the engine's
existing intrinsic-sketch call sites. Integration still requires exact source
closure and fingerprints, ordered per-instance evaluation, dependent sketch/
plane/constraint resolution, remapped native references, arbitrary profiles
and starts, selected/all/auto scope discovery and re-evaluation, varying
sketches/dimensions/equations, nested composition, creation/split/consumption/
Combine ledgers, persistent identities, stale-preview checks, atomic owner and
cache adoption, no-op references, rollback, picking and document lifecycle.
False/regeneration must not fall back to geometry-delta copying. Unknown
false-mode scope fidelity remains unknown until independently checked.
