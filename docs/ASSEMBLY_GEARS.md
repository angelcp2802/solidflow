# Gear relations

This local development increment adds an angular coupling to the version-2
assembly contract. It is still part of the incomplete assembly work described
in [ASSEMBLIES](ASSEMBLIES.md). Authored cases and expected values below are not
executed results; actual source-specific runs belong in [VALIDATION](VALIDATION.md).

## Saved references and phase

A `gear` mate names two exact cylindrical-face references and an explicit
carrier component. A null carrier means the declaring assembly frame. A carrier
component may itself move; its complete scoped occurrence path and exact
definition revision remain part of the reference. The coupling does not infer
teeth, contact, axis placement or ratio from a selected face's radius. Other
relations establish bearings and axial stops when those are needed.

The saved ratio has positive finite `numerator` and `denominator` fields. With
`a = numerator / max(numerator, denominator)` and
`b = denominator / max(numerator, denominator)`, the scalar equation is
`a * firstAngle + s * b * secondAngle - phase = 0`, where `s` is +1 for
opposed rotation and -1 for the same direction. Thus the second rotation has
magnitude `numerator / denominator` times the first rotation. Both signs refer
to the individually selected native axis directions, relative to the carrier.

`neutralRotations.first/second` record the component orientations relative to
the carrier when the native capture is made. `angles.first/second` are lifted
radian coordinates, including accumulated turns; `phase` is a weighted radian
target and is never reduced modulo a turn. The interface converts a requested
second-axis offset `d` to `phase = s * b * d`. Editing the ratio or phase keeps
the saved identity and neutral rotations. Reopening preserves the saved angle
branch rather than inferring turns from a quaternion.

## Numerical continuation

Relative rotation is measured by swing/twist about each actual local cylinder
axis. A quaternion and its negation describe the same rotation. A degenerate
twist chart, loss of angular precision or an ambiguous continuation must reject
the proposal rather than publish a different phase branch.

The numerical solver needs the lifted state of its latest accepted placement.
Each trial derives its own candidate state; a rejected trial cannot advance
angles. Step size alone does not establish this near a swing singularity, so
the continuation admission also bounds angular variation against the chart's
remaining margin. Projection's hard restoration must carry the accepted state
forward instead of repeatedly lifting against the original document. Carrier
incidence belongs in the connected numerical group and common rigid motion
must preserve a component-carrier relation.

An absolute quaternion target does not encode a requested number of turns.
The separate [numeric motion request](ASSEMBLY_MOTION.md) carries signed winding
intent and verifies bounded stations as one preview. Absolute-pose APIs and the
discrete pointer objective retain their existing boundaries. Continuous gesture
branch following requires separate implementation and evidence. Suppression,
source repair and independently moving components must not silently reset the
stored branch.

An inactive gear whose references cannot currently be resolved retains its
exact saved neutral rotations and angles. Stationary resolution and movement
of unrelated components may proceed. The referenced component/carrier chains
must stay unchanged while angular tracking is unavailable; a proposal that
changes them is rejected. Reactivation still requires resolvable current native
references. Reference or source repair cannot invent continuity from a missing
old support; a new native capture is required when continuity cannot be proved.

## Native capture, preview and Apply

Creation captures neutral rotations from a fresh native solved preview. The
worker resolves both actual cylinder supports and the carrier within that same
complete document snapshot. Renderer numbers and declared references confer no
native authority. Editing, cancellation, source replacement and consumed tokens
retain the existing one-use preview/Apply and committed-history boundaries.

A successful result needs fresh native reconstruction and checks for every
expanded active relation. A null carrier in a nested occurrence is that actual
scope's frame, not the world frame. World-space checks must therefore transport
the actual scope carrier too. A reusable subassembly retains shared declaration
identity while each occurrence is checked in its own placement.

The coupling supplies no collision prevention or physical tooth simulation.
The existing rectilinear contact-stop route continues to reject an unsupported
mate family until that family's trajectory preservation is established. No
new assembly capacity, worker policy, sandbox or test deadline is implied.

## Independent evidence targets

The original plate/two-pin fixture already contains two eccentric cylindrical
bores. Their radial world-support vectors provide angular markers independently
of the UI camera, displayed mesh and the product's quaternion helpers. Four
bearing/stop relations should leave two spin DOF; an independent gear equation
should leave one. A 1:2 opposed relation should turn the follower -30 degrees
for a +60-degree input. A 2:1 opposed relation exercises follower continuation
beyond a half turn. These physical spins are about component/world +Z; the
original actual cylinder supports are directed -Z, so their saved lifted
coordinates have opposite signs (-120/+240 in the second case). Native
quantities, cancellation, single-step history,
editing, suppression, rejected proposals and save/reopen need separate checks.

These expectations do not establish a passing workflow, a packaged release,
all mechanical relations, flexible assemblies or platform support.
