# Rack and pinion relations

This local proposal extends the incomplete [assembly contract](ASSEMBLIES.md)
with one scalar coupling between an actual pinion cylinder and a rack's actual
straight edge or cylinder axis. Bearings and slider guides remain separate.
Teeth, contact, collision prevention and perpendicular placement are not inferred.
Authored checks are not executed results; consult [validation](VALIDATION.md).

## References and conversion

`rack-pinion.first` is the pinion's exact occurrence/body/cylindrical-face axis
reference. `second` is an exact rack cylindrical-face axis or an `edge` reference
with `support: 'line'`. Components must differ. A display segment or arbitrary
renderer axis cannot authenticate an edge. Existing version-2 documents retain
their declarations without invented mechanical defaults.

`conversion` contains `mode: 'diameter' | 'travel'` and `override: number | null`.
Null resolves afresh from native radius R: diameter2R, travel per revolution
2*pi*R and advance per radian R. Explicit diameter D gives D/2; explicit travel
L gives L/(2*pi). Values must be positive, finite and representable. The default
is never saved as cached lead. The input is empty/white for default and yellow
for an explicit override, even one equal to the native value. Switching modes
preserves explicit physical conversion; clearing it restores default.

## Coordinates and signs

Let Qp/Qr be pinion/rack attitudes, Op/Or their origins, and a the pinion's
directed native local axis. Capture stores `neutralRotation = Qr^-1 * Qp`,
lifted radian `angle`, and millimeter `neutralTravel`. The swing/twist chart
measures pinion relative to rack about a, retaining turns through accepted states.

Normalize the undirected rack local axis, make its first component of magnitude
greater than 1e-12 positive, and preserve all other components. Apply the same
convention to rack cylinders. World rack direction is e=Qr*canonicalAxis. Pinion
axis remains natively directed. Source revisions crossing the canonical sign
boundary require recapture; old turns cannot be reinterpreted in a new chart.

For native pinion cylinder point c, use its closest point to the local component
origin, `cPerp = c-a*dot(a,c)`, and world point `Cp = Op+Qp*cPerp`:

```text
s = dot(e, Or-Cp)
s-neutralTravel-sign*advance*angle = 0
sign = reverse ? -1 : +1
```

Using Op alone creates false sinusoidal travel when an eccentric component
origin orbits a fixed pinion axis. Shifting the cylinder parameter origin along
that axis cannot change cPerp. The rack line's arbitrary point does not enter s.
Common rigid displacement leaves the equation invariant.

## Solver and motion

This contributes one independent scalar length constraint. Two otherwise free
bodies have eleven DOF, including six common rigid freedoms. A guided rotor and
nonrotating slider lose one of their two remaining freedoms. The analytical
Jacobian includes rack-direction variation, pinion-axis-point motion and relative
twist. Conditioning precedes distant world offsets; precision loss rejects.
Length residual tolerance does not imply the same follower-angle tolerance.

Active and resolvable suppressed relations track lifted angles through accepted
solver/projection states. Rejected trials cannot advance them. Singular charts,
ambiguous half turns and winding precision loss reject. Suppression adds no rows.
Unavailable suppressed references retain captured state and freeze referenced
placement chains while unrelated work continues. Mechanical maps remain internal
solver data, separate from transported scope summaries.

[Numeric motion](ASSEMBLY_MOTION.md) retains signed rotations and checks bounded
stations before publishing one final preview. It fixes the driven component's
complete pose. An eccentric pinion origin has a curved orbit about its bearing;
the current linear-translation path request is not a native joint-axis driver
and may reject incompatible multi-station orbits. A valid single station does
not establish a continuous orbital trajectory or collision-free sweep.

## Native authority and editing

Creation consumes a fresh authenticated preview, resolves both actual supports
again and captures zeros at that placement, without hidden alignment. Only the
final preview is published, bound to the original committed document. Apply
records one history transaction. Renderer-supplied zeros, winding, retargeted
components and invented line geometry confer no authority.

Name, conversion and reverse edits preserve identity and zeros while solving
may adjust poses/angle. Suppression/reactivation, Cancel, Undo/Redo and save/reopen
retain these rules. Each reused scope receives actual native checks. Source or
repair continuity requires exact component/frame paths, the pinion's directed
axis/canonical point and rack canonical direction. A radius-only change can
intentionally change default advance. Missing old evidence cannot justify a new
zero; changed coordinate charts require recapture.

Scene edge DTOs contain exact identities, local/world LINE supports and world
endpoint pairs from each individual native edge mesh. Body-wide decorative lines
never supply identity. Generation/body-bound catalogs own topology until source
replacement or disposal; support queries remain native. Semantic v2 catalogs
retain independently owned lifetimes. Cleanup errors are failures.

The viewport selects visible LINE edges with pixel/depth checks and rejects
ambiguous identity ties. Hidden/ghost geometry cannot be selected. Capture picks
are tied to preview token and UI generation and change only selection intent.
Ordinary committed-face editing guards remain in place.

## Original acceptance mechanism

The [fixture](../src/cad/fixtures/assembly-rack-pinion-original.json) and
[generator](../scripts/fixtures/generate-assembly-rack-pinion.mjs) are original
unmated parts; [provenance](PROVENANCE.md#original-rack-and-pinion-mechanism)
records dimensions/formulas. The authored command
`npm run test:desktop:assembly-rack-pinion` creates bearings and a guide, captures
an actual pointer-selected edge, tests default/override conversion, bidirectional
motion, history, edits and file IPC. Isolated parent/child/step deadlines remain
180/170/35 seconds. Configuration alone is not an execution/platform result.

Default R2, pinion native -Z, rack canonical local+Z transported to world+X and
neutral travel -10mm imply pinion +720 worldZ degrees → angle -4*pi and rack
displacement -8*pi mm. Rack translation +2*pi mm drives a half turn in the other
direction. Native markers/end planes/bounds/volume/area must corroborate poses.
Sketch lines/circles, circular edges, explicit axes and revolved-surface pinion
references remain broader required work. This does not complete assemblies.
