# Configured numerical scopes and state planning

This standalone layer projects current configured material references into a
selected assembly scope's numerical coordinates. It also plans reusable rigid
states in child-before-parent order. It does not run a configured solve, write
poses or captures back, create an Apply candidate, or add saved/editor support.

It builds on the [effective core](ASSEMBLY_CONFIGURATIONS_CORE.md),
[current native references](ASSEMBLY_CONFIGURATIONS_NATIVE.md),
[relation inventory](ASSEMBLY_CONFIGURATIONS_RELATIONS.md),
[numerical adapters](ASSEMBLY_CONFIGURATIONS_NUMERIC.md), and
[declarative capture state](ASSEMBLY_CONFIGURATIONS_STATE.md).

## Closed selected scope

`createConfiguredAssemblyNumericalScope(snapshot, input, scopePath)` selects an
exact active assembly occurrence from the effective evaluation. The input is
the complete document, catalog, root selector and generation used by that native
snapshot. Hidden children remain available; suppressed children are excluded
from the local body list. Each direct child retains its effective pose and
authored fixed flag.

The returned scope is deeply frozen and registered privately for its originating
snapshot. A copied object, another session's scope or an obsolete context cannot
acquire that registration. `assertConfiguredAssemblyNumericalScope` checks the
complete current input before and after authentication, including for empty
scopes and callers using only the body list. The controller must advance
generation for context changes, including switching away and back.

Scope authentication invokes the native implementation's captured methods
directly. Structural providers and instance method overrides cannot substitute
for its private receiver identity, witness registry or complete-context checks.
Scoped numerical publication is checked again after adapter execution.
Scopes share one privately owned evaluation per native session, avoiding copies
of source bytes for every scope. Every use still checks the complete live input;
the cache grants no validity after a context change or across sessions.

`assertConfiguredAssemblyScopedRelation` additionally requires a genuinely
resolved relation declared in that exact placed scope, definition tuple and
selected configuration. Equal intrinsic states in sibling instances retain
separate material grants. No public callback or caller-supplied effective body
table is accepted as an alternative projection.

## Numerical owners and material owners

A configured material witness keeps its physical root owner and complete
occurrence path. Scoped projection does not change that witness or authorize
arbitrary descendants as independently movable native bodies.

Within the selected numerical problem, the immediate effective child on a
reference path is its numerical body. Descendant transforms below that child
are composed directly from the effective chain. A reference to the scope itself
uses its static local frame with a null numerical body. References outside the
scope, inactive declarations or mismatched ancestry are rejected. No composed
world pose is inverted to recover small descendant translations.

`buildConfiguredAssemblyScopedConstraint` applies this closed projection to the
same relation inventory as the root adapters: binary and mechanical relations,
four-support width, symmetry, profile centers, LINE and circular paths with
optional planar UP, and four- or six-role hinges. Auxiliary carrier, guide and
UP roles follow the same scope rules. Hinge axis, axial and optional angular
roles must retain their corresponding numerical owner.

The adapters retain original effective placement magnitudes and depth for
uncertainty estimates; selecting a smaller numerical scope does not erase a
large or cancelled source chain. Direction-only proofs remain direction-only.
The existing native support, structural qualification and precision gates still
apply. Numerical DTOs do not confer material-reference, capture or edit
authority, and a local numerical result would still require fresh physical
verification at every full-root occurrence.

## Numerical convergence and physical acceptance

The generic solver's optional `lengthRefinementTolerance` requests a tighter
working length target for variable groups, alongside its existing angular
refinement option. It must be positive, finite, own data and no larger than the
problem's public length tolerance. Omitting it preserves the existing behavior.
Fixed relations keep the public band, and iteration, trial and seed budgets are
unchanged. This is one bounded solve, not a hidden retry.

An independently measured native relation can carry a more conservative error
bound than its numerical equation checks. A tighter working target can leave
room for that verification, but cannot certify it. Public/native acceptance
bands remain unchanged and a fresh physical check is still required. A chosen
working fraction in an original experiment is not a general conditioning policy
for every family, placement or input uncertainty.

## Reusable selected-state plan

`planAssemblyConfigurationSolve(document, catalog, rootConfiguration)` is a
pure declaration planner. Its state key is exactly
`[definition.id, definition.revision, configurationIdOrNull]`. The base state is
distinct from every named configuration; display names and occurrence paths
are not intrinsic state identity.

The planner includes active assembly scopes, including hidden instances. It
records complete intrinsic occurrences and mates, child selectors, active
direct-child bodies and unique active assembly dependencies. Repeated uses of
one state are grouped only if their intrinsic declarations and dependencies
agree. Every instance retains its full path, configuration ancestry, world pose
and visibility. Distinct selected states remain separate even if their current
geometry coincides.

The returned deeply frozen states are ordered child before parent, each state
once. Cycles or missing active dependencies reject planning. Complete core
validation still covers dormant declarations and existing graph/size limits.
A `ready` plan indicates declaration availability, not solvability or native
acceptance; `references-unavailable` diagnostics remain visible. The plan has
no private snapshot or Apply authority and does not implement flexible
per-instance behavior.

## Remaining integration

The standalone [selected-state transaction](ASSEMBLY_CONFIGURATIONS_SOLVE.md)
now solves rigid states child before parent, stages exact state poses/winding
and checks every actual placed use with fresh native geometry before private
atomic publication. Base changes explicitly preserve named inherited values
under existing limits. Shared child states retain normal propagation to every
parent that selects them; this is not flexible per-instance state.

The standalone [independent geometry gate](ASSEMBLY_CONFIGURATIONS_VERIFICATION.md)
now supplies fresh physical checks across the current relation inventory at
every placed scope. It does not execute the state plan or provide writeback.

Configuration scope remains broader than captures and numerical frames:
relation parameter variants, part feature variants and topology-dependent
repair, versioned persistence, history/recovery, editor selection and its
preview/Apply lifecycle are still required. Import/export, source updates,
replacement and other consumers need an explicit effective-state policy before
saved configurations can be exposed. This layer does not change the saved
document parser or claim those workflows are implemented.

Actual command results and checked cases belong in [VALIDATION.md](VALIDATION.md).
This contract makes no platform or full-configuration completion claim.
