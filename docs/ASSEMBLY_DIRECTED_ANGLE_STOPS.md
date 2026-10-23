# Directed circular angle stops

This dependent increment constrains the existing projected circular coordinate
with an explicit guide. It is separate from the saved principal-direction
interval and from a continuous multi-turn mechanical coordinate. Acceptance
cases below are targets until their source-specific execution is recorded in
[VALIDATION.md](VALIDATION.md). Full assembly and demo acceptance remain open.

## Saved intent and direction

A distinct mate has `type: 'limit-directed-angle'`,
`coordinate: 'directed-about-axis'`, three exact geometry references `first`,
`second`, `guide`, and `arc: { start, sweep }` in degrees. All fields are plain
JSON data; both numbers are finite, `0 <= start < 360` and
`0 <= sweep <= 360`. Neither an angular zero nor a turn counter is captured.
The three directions use the eligibility and authentication rules of
[directed measurement](ASSEMBLY_DIRECTED_ANGLE_MEASUREMENT.md).

Project the first and second directions onto the plane perpendicular to the
guide. Their positive angle follows the right-hand rule about the guide and
is measured in `[0,360)`. The allowed arc starts at `start` and proceeds in
that positive direction for `sweep`. Endpoints are inclusive at the declared
radian precision. For example, `{ start:330, sweep:60 }` permits 330, 350, 0,
10 and 30 degrees, and excludes 31 and 329 degrees. Zero sweep is one circular
orientation; 360 degrees allows the whole circle. A full circle still requires
defined, authenticated directions; it does not waive reference validity.

Swapping first and second, or reversing only the guide, reverses the coordinate.
To describe the same physical set after such a reversal, the corresponding arc
starts at `-(start+sweep)` modulo 360 and retains its sweep. Selection changes
never perform this conversion silently. A common rigid rotation preserves the
coordinate. The guide can belong to a moving component; its actual motion
participates in the equation and component incidence.

This relation constrains one projected angle. It adds no coincidence,
coaxiality, positional lock or requirement that either measured direction be
perpendicular to the guide. Directions parallel to the guide have no azimuth;
undefined or numerically inadmissible projections reject atomically. Existing
`limit-angle` files retain their principal `[0,180]` coordinate and bounds.

## Local solving and movement

Internally, radians are lifted to a local interval around the arc's center.
For an arc shorter than a full circle, the branch cut is opposite that center,
outside the allowed set. Its Float64 ambiguity allowance is
`64*epsilon*(1+abs(center)+abs(angle))` radians, separate from the physical
angular tolerance. A proper arc whose half-complement is no larger than that
allowance rejects for insufficient precision. An exact or numerically ambiguous
tie at the branch cut rejects with an orientation-chart diagnostic. It is not a
global infeasibility certificate and does not choose a hidden revolution.
This bounded policy can be reconsidered using a separate, explicitly tested
restoration strategy; increasing search budgets is not evidence of one.

The derivative includes all three placed directions. Translation and common
rotation leave the coordinate unchanged. Active minimum/maximum inequalities
are separate from bilateral rank; equal bounds constrain a regular scalar
azimuth, including at 0 and 180 degrees. They do not inherit the principal
angle's parallel/antiparallel tilt kernel. A full-circle declaration contributes
no stop row. Each successful candidate needs a fresh native three-direction
measurement within its saved arc before receiving Apply authority.

Strict movement rejects a destination or sampled station outside the interval.
Projected movement may stop at an endpoint and must permit a subsequent inward
request. Signed motion requests retain their explicit sampled path: a full-turn
request can cross a forbidden sector despite ending at its starting quaternion.
Station checks are not a proof of an unsampled continuous path or collision
clearance. A final orientation of 90 degrees and one reached after 450 degrees
share a circular coordinate; accumulated-turn stops remain separate work.

## Acceptance cases and atomic lifecycle

Updating a shared part reviews affected `first`, `second` and `guide`
references separately. A reference marked for repair must be chosen from the
current catalog of that same component and revision. A LINE guide uses the
edge repair control. The subsequent solve authenticates all three directions
and the saved arc; selecting an edge alone grants no Apply authority. This
circular declaration has no mechanical zero to recapture. Cancel preserves
the committed revision; an accepted source update is one history transaction
and retains the earlier embedded definition.

- Known planar rays, oblique projections, reversed operands/guide and common
  rigid rotation establish direction and units independently of the solver.
- A 330-degree start and 60-degree sweep exercise both endpoints and crossing
  zero. Interior, outside, equal and full-circle declarations have distinct
  membership and mobility expectations. An ambiguous opposite-center request
  rejects without claiming global conflict.
- Outward movement from each endpoint rejects or projects according to the
  selected movement mode; inward movement returns to the allowed interior.
  Guide motion changes the equation when geometry requires it.
- Undefined projections, stale revisions, suppressed references and failed
  restoration withhold a candidate and preserve the committed document,
  history and any unrelated preview authority as specified by that operation.
- Suppression removes the stop; reactivation restores and verifies it. Editing
  keeps the relation identity and explicit arc. Reference repair and source or
  part replacement handle the guide with the same exact-source rules as the
  other endpoints.
- Apply, Cancel, Undo/Redo, serialization and actual desktop Save As/reopen
  retain all three references and the circular declaration. Legacy principal
  intervals retain their original interpretation after a round trip.

Tests must state independent coordinates, degree/radian units and tolerances.
Native cases additionally check BRep validity, solid count and unchanged
volume/area. Numerical, native, rendered-control and production-worker/file
evidence are separate; a pass in one layer does not establish the others.
