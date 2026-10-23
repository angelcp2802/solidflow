# Screw relations

This local increment extends the incomplete [assembly contract](ASSEMBLIES.md)
with a mechanical relation between two actual cylindrical faces. It combines
coaxial placement with relative rotation and axial travel. It does not infer
thread geometry, number of starts, contact or lead from cylinder radii.
Authored fixtures and test expectations are not executed validation; consult
the source-specific [validation record](VALIDATION.md).

## Coordinates and signs

A saved `screw` names exact `first` and `second` axis references, an explicit
`alignment` (`aligned` or `opposed`), positive finite `lead` in millimeters per
relative revolution and a boolean `reverse`. There is no additional carrier.
Let `Q1`, `Q2` be the component orientations and `O1`, `O2` their origins in
the declaring scope. The first cylinder's directed native local axis is `a1`.

`neutralRotation = Q2_capture^-1 * Q1_capture` is captured after native coaxial
alignment. The persisted lifted radian `angle` measures first relative to
second about `a1`, using the swing/twist chart of
`neutralRotation^-1 * Q2^-1 * Q1`. It retains turns rather than recovering
winding from an endpoint quaternion. The directed axial coordinate is
`z = dot(Q1*a1, O2-O1)` in millimeters; `neutralTravel` is its captured value.
The relation is

```text
z - neutralTravel - sign * lead * angle / (2*pi) = 0
sign = reverse ? -1 : +1
```

Travel uses component origins, not a cylinder's arbitrary parameter origin.
Moving that parameter origin along the same infinite axis must not change
the relation. Common rigid placement transports both origins and the axis and
leaves the coordinates unchanged. Opposing the second native axis is distinct
from reversing the helical slope. A positive first spin relative to a stationary
second increases `z` when reverse is false; if the first component also moves
axially, its own advance has the opposite sign because `z` is second minus first.

## Numerical solving

Coaxiality contributes four independent relative constraints and the travel
equation contributes one: a fixed first component with an otherwise free second
has one local degree of freedom. The existing three-component vector equations
retain redundant rows; the numerical rank must establish mobility. Do not
deduce it from raw row count or add a separate fixed carrier to force a result.

The travel residual and its tolerance are lengths. Its analytical Jacobian
includes both variation of the first axis and variation of both component
origins, as well as the relative twist derivative. Native alignment errors use
angular tolerances. A length tolerance does not imply the same numeric bound
on a translation-driven follower angle: the slope and the other geometric
errors affect that bound.

Accepted states carry lifted angles across solver trials and projection
restoration. Rejected trials cannot advance them. Active or resolvable suppressed
relations retain their chart without reseeding across a half turn. Ambiguous or
singular charts, underflowed lead conversion, nonfinite arithmetic and angular
precision loss reject rather than selecting another turn branch. A suppressed
relation tracks its angle without imposing coaxiality or travel rows.

The [numeric motion request](ASSEMBLY_MOTION.md) supplies explicit signed turns
and bounded verified stations. It still fixes the selected component's complete
target pose. A single free screw against a fixed component needs compatible
angle and axial target inputs; a motor shaft with an axial stop and a guided,
nonrotating slider permits rotation-only driving of the shaft. Translating that
slider can conversely rotate the shaft. Pointer projection remains a local,
discrete target calculation. Neither route proves a continuous collision-free
trajectory or physical thread dynamics.

## Native capture and persistence

Creation consumes a fresh authenticated solve preview. It privately adds a
temporary concentric relation, solves against existing constraints and queries
fresh actual aligned cylinder supports before capturing the relative zero.
The temporary relation is replaced by the screw; the user receives one final
preview tied to the original committed source. Intermediate capabilities are
discarded, and only final Apply records a history transaction. Cancellation or
failure leaves the committed document unchanged.

Renderer-supplied zero frames, travel origins, lifted angles or retargeted
references confer no native authority. Editing name, lead or reverse
preserves saved identity and captured zeros and continues from the stored branch;
the solver can adjust the resulting pose and angle. Suppression and reactivation
also pass through preview and Apply. Save/reopen retains the actual lifted
coordinate. Native checks cover each expanded occurrence of a reused assembly
in its own placement.

Changing the saved aligned/opposed branch requires a new native capture. It
cannot silently replace the captured relative zero while retaining old turns.

Unavailable suppressed endpoints retain their exact reference/zero/angle state;
referenced placement chains cannot move while tracking is unavailable. Unrelated
work can continue. Repair or source changes need native coordinate continuity,
including directed axes and exact component/frame identity. Missing old evidence
cannot justify a newly invented zero: recapture is required. Broader automatic
source correspondence remains separate work.

## Original analytical mechanism

The [fixture](../src/cad/fixtures/assembly-screw-original.json) and
[generator](../scripts/fixtures/generate-assembly-screw.mjs) contain a fixed plate,
a shaft with an eccentric bore and a rectangular slider. They contain no mates
or solved outputs. The workflow creates actual bearings and an axial stop,
captures the slider's rotation lock and then captures the screw. Complete
parameters and independent formulas belong in [provenance](PROVENANCE.md#original-screw-mechanism).

For lead 2 mm/revolution and the fixture's directed native -Z axes, rotating the
axially stopped shaft by +720 degrees about world +Z requests an angle change
of -4*pi and moves the nonrotating slider from z10 to z14. Moving that slider
another +1 mm requires another +180 degrees of shaft rotation. These are
independent acceptance expectations, not a claim of execution or general support.
