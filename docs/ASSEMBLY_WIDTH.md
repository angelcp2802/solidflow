# Centered width from four original plane references

The centered width relation retains two ordered width planes and two ordered
tab planes. Each original reference keeps its occurrence, source revision,
body and face identity or explicit principal-plane purpose. The relation
compares their selected bisector planes. It does not replace the references
with a midpoint owned by one component or reinterpret an axis as a surface.

## Saved declaration and references

Version-2 documents admit `type: 'width'`, `mode: 'centered'`, two exact
two-tuples `width` and `tab`, `widthBranch` and `tabBranch` (`sum` or
`difference`), and `alignment` (`aligned` or `opposed`). Existing mate identity,
name and suppression fields remain required. The declaration has no `first`
or `second` fields and stores no derived geometric support. Other modes,
unknown properties, non-plane purposes, missing choices, sparse tuples and
executable data reject. Original version-2 declarations retain their meaning;
older readers can reject the new family rather than silently reinterpret it.

The saved endpoint roles are `width-0`, `width-1`, `tab-0` and `tab-1`.
Enumeration preserves order, repeated owners and fixed scope references.
Syntax inspection returns four independent inspections and still requires
native verification. It does not authenticate an existing face or solution.

Source updates and component replacement retain all affected roles. Explicit
repair changes one tuple element through a syntax-validated copy; group roles
never become extra object properties. A missing fourth repair cannot be
treated as complete because the first three references are current. Reference
budgets use the actual pending inventory. Shared declarations, dormant and
suppressed uses retain their separate existing lifecycle rules.

## Native solve and final verification

The native snapshot resolves and authenticates all four original plane
supports. A stale, suppressed, unavailable or wrongly purposed fourth
reference aborts without publishing a partial preview. The numerical adapter
passes four endpoints with their actual rigid owners and local frames to the
[centered solver](ASSEMBLY_WIDTH_GEOMETRY.md#numerical-centered-solver).
Repeated owners accumulate; null scope references add no free variable.
Subassembly definitions solve from the bottom up and remain rigid in their
parent, following the existing assembly contract.

Native placement-chain arithmetic is checked before cancellable sums. After
solving, a fresh snapshot reconstructs the candidate and authenticates the
four supports again. A separate physical measurement computes selected
bisectors from native world planes, anchored at the first width support,
without using the solver's residual helper or a fitted midpoint. It measures
angle with `atan2(norm(cross),dot)` in radians and signed offset in mm. The
physical length band is the maximum of the requested band and the sum of four
native support tolerances. Unresolved branch normalization, unrepresentable
arithmetic or excessive estimated uncertainty rejects.

The fresh `widthCentered` report carries the selected branches, alignment,
physical angle and offset, branch lengths and tolerances. It is detached
display data. Worker preview tokens and the private solve authority still
govern Apply; copying or changing a report grants no authority. Cancellation,
history and reopening use the same validated declarations. The independent
physical check covers infinite supports, not finite trimmed face contact,
collision prevention or geometric clearance.

## Editor and movement

The relation editor offers centered width with four plane selectors, two
explicit bisector choices and their orientation. References come from the
current native scene or explicit principal planes. Both bisector alternatives
remain explicit; neither material orientation nor a nearby pose silently
selects a replacement branch. A cancelling branch rejects and leaves the
confirmed document intact so the user can correct the proposal.

Each of the four roles has a model-picking button alongside its plane selector.
A pick resolves one unique current visible planar scene entry and stores only
its scoped reference declaration. Selection advances to the next empty role;
an existing role can be selected again while editing. Its active button or the
global face-selection control stops picking. The selection ticket binds the
role to the document signature, assembly scope and generation; invalidation
revokes it. Preview, staging and replacement operations block selection.
Neither a scene pick nor a dropdown choice authenticates a native support or
creates an Apply capability. All four references still require worker preview
and fresh native verification.

Creation, parameter/reference editing, suppression and deletion use the
existing preview/Apply transaction. The four selected planes can be
highlighted. The fresh report appears only for a current applicable preview
with satisfied checks. Numeric target movement and local pointer projection
consume the nary solver. Local projection supplies no continuous collision
or global nearest-motion claim. The separate rectilinear contact-stop
operation admits the centered plane subset under the conditions below.

## Rectilinear contact-stop

The existing translation path preserves graph, sources, references and local
rotations, restoring the original quaternions before interpolating only local
translations. Consequently all world rotations remain constant, also through
nested assemblies. Each original local plane point, normal and tolerance must
remain fixed. Fresh authenticated endpoint snapshots compare all four ordered
supports, their local parameter points (including the first width anchor),
normals, X directions, tolerances, origins, source identities and world
rotations exactly. A reparameterized support can conservatively reject; no
geometrically equivalent point is silently substituted for the moving anchor.

For this ideal constant-rotation path, each world plane point is affine in
fraction `f`. The selected branch normal `b`, length `L`, comparison normal
defect `q=bTab-sign*bWidth` and first-owner rotation are constant. Plane
offsets and the anchored comparison
`g(f)=hTab(f)-sign*hWidth(f)-q.dot(anchor(f))` are affine. The physical angle
is constant, and `abs(g(f))` is bounded by the convex combination of endpoint
absolute offsets. The four unchanged native tolerances give one fixed physical
length band. This argument applies to distinct/repeated owners and fixed scope
references; it requires the actual anchor even with a nonzero accepted normal
defect. Other modes and changing rotations do not inherit it.

Fresh source/destination checks retain branch and precision admission. The
existing body-distance tracer uses conservative numerical advancement with
native tolerances, requested clearance, distance deflection and coordinate
margins; its arithmetic and query budgets remain unchanged. It can stop before
the numerical contact band or complete a clear destination. Final native mate,
movement and mobility checks authenticate the actual stopped candidate before
Apply. This is the existing numerical distance policy, not exact contact time
or a formal SDK error certificate. Initial moving-pair overlap, insufficient
separation, exhausted queries and inconsistent geometry reject atomically.

## Evidence and remaining scope

The original numerical and native fixtures include distinct, repeated and
fixed owners, a fourth-only free owner, nested assembly placement, intersecting
plane pairs, strict declarations and source/replacement repairs. Separate
renderer tests exercise controls; the fixed `test:desktop:assembly-width`
scenario uses original tracked geometry, actual worker replies and test-owned
file dialogs. Authored tests and configured commands are not execution results;
consult [VALIDATION](VALIDATION.md) and [PROVENANCE](PROVENANCE.md).

Additional cases exercise four free oblique owners with physical plane-equation
and common-rigid-gauge checks, including accepted residuals with initially
ambiguous numerical rank. Native lifecycle cases change actual box dimensions,
repair all four source roles, and replace only the fourth owner with a wider
part whose final position has an independent literal solution. Native movement
cases distinguish strict targets from local projection and independently
rebuild all three observed rotation stations. Separate affine-path cases and
native contact-stop fixtures exercise the bounded constant-rotation operation;
sampled rotations supply no continuous-path claim.

Free, Dimension and Percent modes, cylindrical-surface and standalone-axis tab
cases, general eligibility/branch/flip policies, margins and active boundaries,
broader repair and interaction cases remain required. The complete 32
geometry/mode acceptance questions in the geometry contract remain open.
These centered-plane increments do not complete the assembly requirement or
open the complete assembly demo gate. Windows evidence does not establish
macOS/Linux support or hosted CI execution.
