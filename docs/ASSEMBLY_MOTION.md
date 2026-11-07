# Explicit numeric assembly rotation

This local proposal gives a numeric component movement an explicit signed
angular increment. It extends the [assembly contract](ASSEMBLIES.md) and
[gear continuation](ASSEMBLY_GEARS.md). Authored cases are evidence targets;
executed results belong in [VALIDATION](VALIDATION.md).

## Request and local frame

`AssemblyComponentMotion` contains an exact component reference, an absolute
final local `translation`, and `rotation: { axis, angle }`. The axis is 0, 1 or
2 for intrinsic component X, Y or Z; the angle is signed radians, including
whole turns. The panel displays degrees. A request of 720 degrees retains
`4*pi`, rather than reducing it to the identity quaternion. The existing
absolute-pose movement APIs retain their separate meaning.

For a fraction `f` of the request, every target is calculated from the original
pose: `q(f) = q0 * Exp(localAxis * angle * f)` and
`p(f) = p0 + f * (targetLocalTranslation - p0)`. It is not calculated by
repeatedly multiplying the preceding target. A whole-turn final target may
reuse the original quaternion representation; this does not skip the stations
or discard the requested winding.

Admission validates plain numeric data, exact revision/path identity and the
existing fixed/suppressed occurrence restrictions before allocating stations.
The nominal angular step is at most `pi/3`; the local request cap is 128
stations. A zero-angle translation still has one station. These bounds do not
change assembly graph, solver, worker, sandbox or test deadline policies.

## Atomic preview

The worker solves each station against the previously verified candidate,
including the accepted lifted gear angles. Each station must pass fresh native
checks and the existing selected-component target tolerances. Intermediate
candidates and capabilities remain private; no intermediate Apply, scene
publication or history entry occurs. Every intermediate capability is revoked.
Any rejection, cleanup failure or lost winding continuity rejects the complete
request.

Explicit stations refine numerical angular convergence of variable groups to
one tenth of the requested tolerance, retaining any explicit finer solver
target. Fully fixed relations retain the public band: no variable can improve
their already accepted angular defect. An unrelated free body does not change
that fact or disable refinement of another group. Initial gear/screw/rack state
derivation uses the public band; variable trials retain their tighter target.
The optional numerical `angleRefinementTolerance` must be finite, positive and
no larger than the problem's public angular tolerance. It changes no length,
iteration/trial/step budget or final acceptance band. Internal scope reports
retain the actual numerical tolerance used; final native checks, selected-target
and winding witnesses retain the public requested
tolerance. This convergence margin addresses the checked 2:1 follower case;
it does not establish a universal absolute follower-angle bound for arbitrarily
extreme ratios. An unrepresentable tighter tolerance rejects atomically.

Repeated native verification also needs deterministic ownership inside face
descriptor queries. Topology traversal owns each native current handle,
including duplicates, while retaining the original first-occurrence `IsSame`
order. Curve adaptors, sampled native points and center-of-mass points are
released explicitly. These ownership changes must preserve the existing face
keys, sampling arithmetic and fresh native checks; they are not permission to
skip rebuilds or reset the worker between stations.

The final capability is bound to the original complete document. Apply consumes
it once and commits one transaction. Cancel leaves the confirmed document and
saved file untouched. A full turn can change saved gear coordinates while
leaving physical endpoint orientations identical. That coordinate change must
remain part of the transaction and save/reopen result.

The result separates the final pose witness from an angular continuation
witness: axis, requested/evaluated radians, verified/total station count, maximum
angular step, winding residual/tolerance and `sampledOnly: true`. The evaluated
angle is lifted from actual verified component orientations relative to the
original local frame; it is not copied from the requested angle or inferred
only from the final principal quaternion. The renderer checks this witness
against the pending request before enabling Apply.

The incremental angle field resets after Apply, Undo or Redo even when final
poses match. Preview and Cancel retain the entered angle. Reported mobility
with a temporary driver remains conditional on that driver; use a fresh
undriven solve after Apply to measure the saved mechanism's natural DOF.

## Evidence and limits

Original model cases cover signed turns, local-frame multiplication, nested
reused declarations, request limits and original-base interpolation. Native
cases use the public plate/two-pin geometry and independently calculated angular
expectations. The desktop gear workflow requests +720 degrees through the real
numeric controls. With same-direction ratio 1:2, physical driver/follower turns
are +720/+360; the fixture's actual selected cylinder axes are -Z, so saved
gear increments are `-4*pi` and `-2*pi`. Eccentric native support markers verify
the physical endpoints. Cancel, repeat/Apply, one Undo/Redo, input reset and
saved reopen must be checked separately. A full 360-degree X request conflicts
with the Z bearings at intermediate stations and must reject despite its
identity endpoint.

These are bounded sampled station checks. They do not prove continuous
feasibility, collision-free rotation, physical tooth contact, continuous
multi-turn pointer gestures, flexible subassemblies or general platform
support. Ratios or geometry beyond the existing solver's numerical capacity
may reject atomically. This proposal does not complete assemblies or the full
CAD product.
