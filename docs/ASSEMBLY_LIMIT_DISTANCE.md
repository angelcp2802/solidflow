# Signed plane-distance interval proposal

This dependent increment proposes distance intervals between two complete
analytic planes. It does not complete the advanced mate families or the full
assembly acceptance checklist. The contract, original fixture and authored
tests are separate from source-specific results in [validation](VALIDATION.md).

## Saved intent and geometry

`limit-distance` contains exactly two existing plane references: a current native
planar face or a declared principal plane, each with its full occurrence/revision
context. It requires `alignment: aligned | opposed` and
`limits: {minimum, maximum}` in millimetres. Both bounds are finite and
`minimum <= maximum`. Unknown fields, wrong purposes and implicit endpoint
substitution reject. Cylinders, spheres and arbitrary axes are not planes.

The saved family retains its identity when both bounds are equal. Two opposite
inequalities then impose the interval; do not silently rewrite the declaration
as a distance mate. No current coordinate, active set, multiplier, cached
geometry, hidden zero or angular lift is saved. Existing distance and other
families retain their meaning.

For unit second-plane normal `n2` and canonical placed plane points `P1,P2`:

```text
q = n2 · (P1-P2)
gMinimum = q-minimum >= 0
gMaximum = maximum-q >= 0
dq = dn2 · (P1-P2) + n2 · (dP1-dP2)
```

The alignment remains a separate angular equality. The scalar derivative must
annihilate every common rigid twist, including away from the target and with
nonzero local frame offsets. Local plane parameter origins are canonicalized;
original placement and bound magnitudes must remain visible to precision
checks before cancellation or normalization can erase them. Acceptance retains
the physical and actual native tolerances, with conservative rejection when a
requested arithmetic precision cannot be certified.

The sign is part of the declaration. Under exact alignment `n1=s*n2`, reversing
endpoints gives `q'=-s*q`. For aligned normals the equivalent interval is
`[-maximum,-minimum]`; for opposed normals it remains `[minimum,maximum]`.
Reference edits never infer or apply that conversion. Complete support equality
does not establish contact between finite selected faces or material clearance.

## Restoration, projection and mobility

The existing bilateral Jacobian rank has a distinct meaning from a working-set
matrix or admissible velocity cone. A fixed/free aligned plane pair contributes
bilateral rank two and four local bilateral degrees of freedom. A single bound
permits motion back toward the interior; counting its active row as a bilateral
lock would give a false mobility result. At a regular boundary the cone has
dimension four and lineality three. A quadrant likewise has dimension two and
lineality zero; neither dimension is obtained by subtracting all active-row
ranks. Do not report an uncertified general cone dimension.

Restoration starts from potentially infeasible geometry and retains damped
Gauss–Newton treatment of the bilateral equations, together with unilateral
violations. It must not require every redundant angular linearization to hold
exactly. For example, with fixed `n2=Z` and
`n1=(sqrt(3)/2,0,1/2)`, every variation satisfies `n1·dn1=0`, while
`n1·(-(n1-n2))=-1/2`. An exact linear equality subproblem would wrongly reject
this finitely alignable 60-degree state.

From a verified feasible state, target projection uses the certified bilateral
nullspace `N` and retains all original inequalities:

```text
min 1/2 ||Jprimary*N*z + rprimary||²
subject to B*N*z >= -g
```

A bound that blocks a step can enter the working set. A bound with the wrong
dual sign must release when motion points toward the interior. With Lagrangian
`cost-mu*g`, multipliers are nonnegative. At `q=10`, target `20` must release the
lower bound; target `0` can remain at `10`. Target `40` from interior `20` can
project locally to upper bound `30`, declaring the remaining target residual.
A hard anchored destination at `40` instead rejects.

Secondary optimization preserves the achieved primary image while retaining
every original inequality. Freezing the primary working set would prevent valid
secondary releases. SVD, numerical rank and KKT evidence must remain reviewable;
do not form normal equations, invent a direction, clip the final pose, widen
tolerances or hide uncertain/budget-limited outcomes. Pivots, retries and
restoration consume the existing solve budgets. An uncertain certificate or
unresolved cycle withholds the candidate.

For rotation-first interval projection, the secondary subspace is factored in
the original physical tangent coordinates with the selected owner's three
angular variables eliminated. Its certified dimension must agree with the
primary-image nullspace. Structural zeros remain in that physical step through
retraction; a second lift through dense bases could introduce a small real
primary rotation from an exact minimum. This changes optimization coordinates,
not a computed pose or the primary-cost comparison. Original inequalities and
the primary-step shift remain in the secondary problem.

Bilateral rank/DOF, geometric bound activity, working-set membership, lineality
and requested-target stationarity are separate evidence. Original nonlinear
alignment and interval checks must pass after every accepted candidate. Local
stationarity or rank is not global mobility or global optimality proof.

## Native authority and transactions

Current exact plane witnesses and source revisions authenticate reconstruction.
Optional ephemeral `limitDistances` reports contain `kind: limit-distance`,
scope path, mate ID, alignment, saved bounds, freshly measured coordinate,
activity (`interior | minimum | maximum | both`), physical length tolerance and
`supportOnly: true`. Activity is interpreted within the reported tolerance.
Reports are detached copies of fresh final native evaluation; display data or
a report copied by the renderer grants no Apply authority.

Preview/Apply, source repair, Cancel, suppression, deletion, Undo/Redo and
save/reopen retain the existing atomic rules. Query, cleanup, epoch or final
scene failure preserves committed poses, history and mechanical state. Active
sets stay ephemeral. Active/passive gear, screw and rack lifts retain their
existing admission, continuity and rollback requirements. This family adds no
seed, reseed or constant-rotation translation admission.

Endpoint feasibility does not certify an intervening motion. For common normals
`n(t)=Rx(t)Z`, `P2=0` and `P1=20n(t)+15Z`, the signed coordinate is
`q(t)=20+15cos(t)`. Endpoints at `±pi/2` give 20, but the midpoint gives 35,
outside `[10,30]`. Existing station checks remain explicitly sampled; collision
stopping and continuous path guarantees require separate evidence.

## Original fixture and remaining scope

The [original fixture](PROVENANCE.md#original-signed-plane-distance-interval-fixture)
uses a fixed 40×30×4 block and a free 10×6×2 block. With first endpoint the
moving top and second the fixed top, identity rotations and moving translation
`[0,0,Z]`, `q=Z-2`. Thus Z12/22/32 represent lower/interior/upper positions for
`[10,30]`. The independent totals are 4920 mm³ and 3144 mm². Geometry, numeric
cone evidence, actual worker/UI interactions, file IPC and visual review are
different validation layers.

Limit angles require a separate principal-angle or signed lifted-angle
contract; quaternions alone do not preserve whole turns. Width, symmetry, path,
profile-centre and the other advanced/mechanical mate families remain required.
This proposed interval does not open the user's full-scope demo or a release.
