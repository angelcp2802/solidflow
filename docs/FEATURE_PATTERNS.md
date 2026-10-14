# Scoped feature geometry patterns — proposal

This increment extends the [persistent body catalog](BODY_MANAGEMENT.md) with
selected-scope feature contributions through an explicit opt-in declaration.
The written fixture descriptions here are not execution results; actual
source-specific checks belong in [VALIDATION](VALIDATION.md). This increment
does not establish complete feature-pattern coverage or platform support.
The existing [body-owned pattern contract](BODY_PATTERNS.md)
and legacy aggregate documents keep their separate meanings.

## Saved declaration

Linear, circular and mirror repetitions may opt in through `featurePattern`:

```ts
source: { mode: 'features', geometryPattern: true, featureIds: string[] }
featurePattern: {
  mode: 'geometry';
  targets: BodyReference[];
  bindings: { source: BodyReference; targetBodyIds: string[] }[];
}
```

Each binding selects the exact output state of an earlier selected feature and
routes that owner's material contribution to explicitly selected current
targets. Contributions at different history steps of the same body are
distinct. Every selected feature and target needs a route. Target bodies are
unique by body ID; contribution keys include both body ID and source feature
ID. All references must belong to the corresponding earlier ownership history.

`featurePattern` and `bodyPattern` are mutually exclusive. The declaration
allocates no body identities or instance slots. Its absence preserves the
legacy grammar. This first envelope requires geometry copying; it must not
silently accept semantic regeneration and execute a rigid copy instead.

There are at most 32 selected source features, 32 target owners and 512 exact
bindings per declaration. The union of requested exact contribution records
across active feature repetitions in one rebuild is also bounded by 512.
Active extra transforms multiplied by the sum of all
binding routes may not exceed 512. Omitted instances still use the existing
canonical pattern addresses. Validate the complete declaration and application
budget before retaining native contribution geometry.

Feature-mode mirror retains `mergeBodies:false`. Its signed changes are
routed to the selected existing targets by `featurePattern`; that operation
is separate from the body-copy new/merge choice in `bodyPattern`.

## Owned material and execution order

Capture each requested owner's transition before committing its producer's
catalog transaction. Removed material is `before minus after`; added material
is `after minus before`. A coincident untouched body must not hide another
owner's cut. Scene-wide differences and solid enumeration cannot establish
ownership.

A new output contributes its complete material. A subtractive Combine
contributes the target's before/after difference; consuming its tools is an
ownership event, not additional removed material. Add/common Combine outputs
are newly created results. A consumed input is not a materialized output state.

Use the existing canonical transforms for all three pattern types. For every
active extra instance, process selected features in history order. Within one
feature event, apply all routed owners' removals before all their additions,
independently of the binding list order. Do not group removals or additions
across different feature events. An inner pattern contributes its own net change,
excluding the original seeds.

Operate on independent native target copies. Signed tools may contain several
material regions; persistent output owners must finish as valid closed single
solids. Stage changed replacements together and retain untargeted states.
An internally empty working state can be legitimate between removal and a
later addition, such as copying a closed outward shell contribution. This
exception is local to scoped replay: accept only a successful Boolean's
genuinely empty compound, not a failed/null builder, a sheet or an arbitrary
near-zero-volume shape. Final persistent-owner validation remains required.
Pre-commit Boolean or validity failure must preserve every old owner and ref.
Failures while releasing already-transferred native ownership must be reported
as such; they cannot honestly be described as pre-commit rollback.

## No-op scope and reference availability

The proposed local policy allows one signed substep to miss a selected owner.
Each active extra instance's complete feature group must change material in at
least one routed owner, and the final command must change material overall.
Equal final volume alone is not a no-op: removed and added regions can cancel
in volume while changing the shape. The legacy substep policy stays unchanged.

Only finally changed owners receive `sourceFeatureId=pattern.id`; their body
IDs and creator ownership remain stable. Scoped but unchanged owners retain
their exact earlier refs. Structural output association therefore describes
potential states. It does not fabricate a materialized `bodyId@pattern`, pick
the latest-looking state, or prove that a historical contribution exists.

Parser/history checks may retain structurally possible old and pattern states
for repair. Exact native catalog resolution decides availability and currency.
Preview and Apply must attest the document, declaration, selections and actual
catalog; UI choices cannot infer availability from structural association alone.

## Original analytical regression fixtures

The original inline native file
[`kernel.feature-patterns.test.ts`](../src/cad/kernel.feature-patterns.test.ts)
declares 22 cases. These are written assertions, not recorded passes.
The first three cases use synthetic geometry in millimeters. Owner A is
a centered 100 × 70 plate extruded from z=0 to z=12, with a through-hole of
radius 3 centered at (20,20). Owner B is a distinct coincident uncut plate.
Repeat only A's hole contribution into A. A translation (-40,0,0), a 90-degree
rotation about the z axis, and reflection across the YZ plane each place the
extra hole at (-20,20) in separate cases.

For n disjoint through-holes, independent expected values are:

- Volume: `84000 - 108πn mm³`.
- Surface area: `18080 + 54πn mm²`.
- Bounds: x=[-50,50], y=[-35,35], z=[0,12].

The result should have A with n=2 and B with n=0, retaining two independent
owners. Expected values come from rectangular-prism and cylinder formulas,
not from another call to the pattern engine.

| Written family | Cases | Distinguishing check |
| --- | ---: | --- |
| Coincident owners, one selected cylindrical cut | 3 | Per-owner contribution despite coincident unselected material; source-radius history. |
| Low-terrace through-all contribution | 3 | Copy only actual removed material into a taller region; do not regenerate its end condition. |
| Historical removal followed by fill | 3 | Preserve feature-event order for either seed selection order. |
| Equal-volume boss and notch | 3 | Material changes despite zero net volume. |
| One inner linear pattern followed by mirror | 1 | Copy only the inner pattern's net change, excluding its original seeds. |
| No-op owner and unavailable potential state | 1 | Retain old refs and reject a historical state that never materialized. |
| Late linear/mirror/circular rejection | 3 | Reject all target replacements when a later final owner splits. |
| Subtractive Combine with consumed overshooting tool | 1 | Consumption is not negative geometry. |
| Mixed owner outputs within one event | 1 | All removals before all additions, independent of binding order. |
| Closed outward shell | 1 | Genuine empty intermediate, followed by a valid final wall. |
| Empty compound versus zero-volume face compound | 1 | Volume zero alone does not establish emptiness. |
| Partial native-cache publication failure | 1 | Preserve causal error and observed ownership without partial transfer. |

Coordinates, formulas, written tolerances and failure-test limits are in
[fixture provenance](PROVENANCE.md#scoped-feature-geometry-contribution-fixtures).
The cases use tracked source and declared dependencies. They do not establish
real editor interaction, all producer combinations or complete nested replay.

## Required remaining feature-pattern work

Geometry replay does not complete the feature-pattern goal. Required later
layers include per-instance feature evaluation and end conditions, applicable
varying-sketch constraints, selected dependent-feature remapping, dynamic
all-body scope, an explicitly saved auto-scope policy, nested semantic recipes
and broader ownership lifecycle handling. A persisted selected target list is
not dynamic all-body scope. The written nested linear-then-mirror fixture is
one selected-scope geometry recipe; broader nested transform/owner combinations,
dependent-feature remapping and nested regeneration remain required evidence.
These remain implementation and evidence gaps
under [issue #26](https://github.com/angelcp2802/solidflow/issues/26).

Record focused, full, build, desktop and interaction results for the actual
source before claiming coverage. Earlier body-copy or desktop-diagnostic CI
passes do not validate this proposal.
