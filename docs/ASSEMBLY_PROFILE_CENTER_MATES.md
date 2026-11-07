# Saved profile-center relations

The `profile-center` family connects the [numerical equations](ASSEMBLY_PROFILE_CENTER_SOLVER.md)
to current bounded native profiles, saved assembly declarations and the assembly
editor. It supports two complete circular profiles with free spin, or two
complete rectangles with explicit material directions. These are deliberate
project policies, not a claim of compatibility with another application's
classification, defaults or orientation controls.

## Saved intent and admission

An `AssemblyProfileCenterMate` stores ID, name, suppression, two ordered compound
selections, alignment, signed `offsetMm` and orientation. Each selection contains
`face:{component,body,face}` and `axis:null|{edge,sense}`. Component identity
includes the complete occurrence path and definition ID/revision. Body and
producer identities remain explicit. Saved data contains no cached center,
normal, matrix, error estimate, native wrapper, witness or preview token.

Free orientation requires null axes and two native full disks. Rectangular
orientation requires two complete rectangles, an exact boundary LINE edge and
`sense:1|-1` for each, and `quarterTurns:0|1|2|3`. A square needs the same explicit
choices; no longest side or boundary traversal supplies a correspondence.
Mixed circle/rectangle pairs remain available to standalone mathematical
measurement but reject as saved native relations. Circular roll locking is not
implemented. Unsupported, partial, holed or nonplanar boundaries reject according
to the [bounded recognizer](ASSEMBLY_PROFILE_CENTERS.md).

For first center and normal `cA,nA`, the signed target is
`cB-cA=offsetMm*nA`. Aligned/opposed means `nB=+nA` or `nB=-nA`.
Positive quarter turns use the right-hand direction about `nA`:
`uB=cos(q*pi/2)*uA+sin(q*pi/2)*(nA cross uA)`.
Opposed alignment does not reverse the offset or this rule. Material direction
is the explicit sense times the increasing native LINE parameter direction,
as described in [material-axis checks](ASSEMBLY_PROFILE_MATERIAL_AXES.md).
No external button, enum, hidden producer or default orientation mapping is
established by these conventions.

## Native solve and final verification

The snapshot resolves each saved selection through its own current profile or
joint profile/edge purpose. Ordinary plane, LINE, point or symmetry witnesses
cannot substitute. The joint query proves that the selected edge belongs to
that exact face boundary in the current body and producer epoch. Cloned proofs,
other snapshots and stale documents cannot authenticate a selection.

The rigid adapter retains local centers, normals and explicit material axes
with the actual owning rigid body and local frame. Nested definitions solve
in their own scopes; reused geometry does not merge occurrence identities or
placements. Position and direction estimates include extraction errors and
original placement-chain magnitudes/depth before cancellation. Numerical
resolution and physical residual checks keep their requested bands; uncertainty
does not widen them. These estimates remain first-order budgets, not certified
metrological intervals.

A fresh candidate snapshot verifies every active expanded relation. Separate
native queries independently recompute the full center-defect norm and normal
and material-direction angles. They must satisfy the saved intent and agree
with the numerical report. A successful numerical row evaluation alone cannot
publish a ready preview. Invalid geometry, unresolved precision, query/release
failure or conflicting relations withhold publication atomically.

Reports include scope and ordered component paths, profile kinds, explicit
choices and residuals in millimeters/radians. They describe a bounded-profile
relation, not solid interference or contact. Detached reports grant no Apply
authority. Rank and local freedom come from the accepted numerical system;
the free circular family adds no roll equation or unique body placement.

Discrete constrained moves, verified sampled motion and constrained drag use
fresh checks.
Continuous translation-until-contact excludes this family: endpoint satisfaction
alone does not prove that the entire path preserves it.

## Editing, repair and lifetime

The editor selects both faces and, for rectangles, both material edges and
senses. Offset, alignment and quarter-turn choices are explicit. Selecting a
different face clears its prior edge. Incomplete compound selections cannot
start a preview. Current authoring uses dropdown choices; this is not a claim
of viewport profile picking.

Creation, editing, suppression and deletion use the existing authenticated
preview/Apply flow. Preview cancellation preserves the committed document;
Apply consumes the worker's private capability and creates one history entry.
Document changes, stale or reused tokens and invalid native final checks cannot
authorize Apply. Recovery and saving use the committed document. Undo/Redo and
save/parse/reopen preserve the saved selections and explicit choices; reopening
still requires a new solve to obtain a current report.

Source updates and replacement treat each face/edge/sense selection atomically.
An old plane key or matching label cannot retain a profile. A repaired compound
selection must pass fresh native shape and boundary-incidence checks. Changing
the owner or face requires a complete new selection, rather than retaining an
unrelated edge. Repeated and nested references preserve their full namespaces;
suppressed or dormant references gain no current proof merely from saved syntax.
Catalog enumeration is bounded and rejects excessive work instead of generating
an unbounded Cartesian list of face/edge candidates.

The configured `npm run test:desktop:assembly-profile-center` scenario uses
original tracked models and actual renderer/worker/file IPC. Its authored flow
covers both admitted families, failed incidence, cancellation, editing, history,
suppression/deletion and saved reopening. Configuration is not an execution
result: see [validation](VALIDATION.md) for source-specific runs and
[provenance](PROVENANCE.md#saved-profile-center-lifecycle-fixtures) for independent
geometry. General profile compatibility, circular roll locking, external
orientation/default equivalence and complete assembly-demo readiness remain
separate requirements.
