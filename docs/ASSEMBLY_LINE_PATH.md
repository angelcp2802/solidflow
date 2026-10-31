# Material LINE path mates

This local increment adds a saved `line-path` family to the version-2 assembly
document. It relates one current material vertex to one straight material edge.
It supports optional component-axis Follow and projected UP roll from a current
material planar face. Circular paths and multiple-edge chains require separate
implementation and acceptance.

## Saved intent and current authority

The mandatory roles are `point` (an ordinary material vertex reference) and `path`
(one component, explicit-or-legacy body, edge and `startVertex`). The latter is
one compound selection: its original endpoint is repaired together with its
edge. Exact source revision, producer, body and occurrence identities remain
required. Matching coordinates or a nearby vertex never substitute for native
identity. The worker queries the actual native edge and uses endpoint identity
and native endpoint parameters to direct the LINE from the selected material
endpoint toward its other endpoint. Sorted reference keys do not supply direction.
UP roll adds an `up` role whose material face is saved as
`orientation.roll.guide`. Its own component, source revision and body remain
explicit. Repairing this role replaces the complete face declaration, without
rewriting the point or compound path.

Position is explicit:

| Position | Meaning from the material start, with current length L |
| --- | --- |
| `{mode:'free'}` | Two transverse constraints; no axial lock or finite-trim stop. The point may lie on the straight prolongation. |
| `{mode:'distance',distanceMm:d,reverse:false}` | Lock the coordinate to d, with 0 <= d <= L. |
| `{mode:'distance',distanceMm:d,reverse:true}` | Lock it to L - d, with the same inclusive distance bounds. |
| `{mode:'percent',percent:p,reverse:false}` | Lock it to L * p / 100, with 0 <= p <= 100. |
| `{mode:'percent',percent:p,reverse:true}` | Lock it to L * (1 - p / 100), with the same percentage bounds. |

The saved parser can check nonnegative distance and percentage bounds. Distance
against L requires a fresh native query. An edit or repair that makes d exceed
the actual length rejects before granting Apply. The Free extension is an
explicit mate policy, separate from the finite query domain of the
[bounded-curve observer](ASSEMBLY_PATH_CURVES.md). No arbitrary curve extension
or circular seam policy follows from it.

Pitch/yaw can remain Free or follow one canonical axis of the point component:

```ts
{ pitchYaw: 'free', roll: 'free' }
{ pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: 'free' }
```

The axis is explicitly `x`, `y` or `z` in that component's coordinate frame.
It is not an axis inferred from the material shape. Follow aligns its positive
direction with the LINE directed from the material start toward the other
endpoint. Follow's own `reverse` flag opposes that direction; position's reverse
flag only changes the target coordinate. Selecting a different material start
changes the declared directed path. Roll may stay free, or use an explicitly
selected, different component axis and a material planar face:

```ts
{
  pitchYaw: { mode: 'follow', axis: 'x', reverse: false },
  roll: { mode: 'up', axis: 'y', reverse: false, guide: materialPlanarFace }
}
```

Let `t` be the directed current LINE tangent, `b` the selected point-component
UP axis and `n` the current guide face normal. UP aligns the normalized
projections of `b` and `n` onto the plane perpendicular to `t`. UP's `reverse`
opposes the projected normal. Position, Follow and UP reversal are three
independent flags, each applied once. A guide can belong to a third component
or share a rigid owner with either other role; its arbitrary plane origin adds
no positional constraint.

UP currently requires Follow and a distinct component axis. The guide must be
a material planar face; principal datums and linear guides are outside this
saved family. A zero or insufficiently resolved guide projection rejects before
initialization, with no arbitrary replacement direction. When only the selected
component UP axis lacks a usable projection and Follow is still unsatisfied,
the solver may initialize Follow by rotating an actual free point/path owner,
then reevaluate all constraints and both projection-error cones. This is a
bounded starting-chart policy, not a general convergence guarantee. Both old
Free/Free and Follow/free-roll forms
retain their exact previous saved shape, without migration or an implicit axis.

## Solving, verification and editing

The numerical equations use a chart attached to the path owner. Free position
supplies two length rows; a fixed coordinate supplies three. Follow adds three
geodesic angular rows whose regular local rank is two. Projected UP adds a
scalar angular row with derivatives for the moving point frame, path tangent
and guide normal. Contributions sharing a rigid owner are summed before solving.
These are residual rows,
not universal rank or degree-of-freedom counts. Shared rigid owners, reused
subassemblies and fixed components retain their existing ownership semantics.

Current material selections have a separate snapshot proof purpose. A copied,
stale, disposed, foreign or old infinite-line proof cannot authenticate them.
Native point/edge precision, original placement-chain magnitudes, directional
lever arms and coordinate length uncertainty must fit the requested bands.
Follow includes arithmetic uncertainty of both component frames and the current
LINE tangent. UP retains each original rotation chain and bounds projection
uncertainty with finite direction chords and projection cones. A cone that
cannot exclude zero or retain the angular band withholds acceptance. Its
measured angular residual and error must fit the requested band together.
Reverse distance includes length uncertainty; reverse percentage
uses the coefficient abs(1 - p/100). Bands are not enlarged to make a result pass.

Before publishing a ready preview, the worker queries current native references
again and measures transverse and, when applicable, fixed-coordinate and angular
residuals. The angular check uses the actual component frame and the `atan2`
angle to the signed tangent. A separate projected-angle measurement checks the
current guide and selected UP axis. Absent Follow or UP reports a null residual
for that respective check. All current witnesses are reasserted after querying.
The detached `linePaths` report describes that verification and grants no Apply
authority. Apply consumes the worker's private preview. Solve, projected drag,
motion and translation use the same final verification.

The editor offers explicit point, LINE edge, material start, position mode,
quantity and reverse controls, plus Free/Follow, axis and independent follow
reversal, plus Free/UP roll, material face, UP axis and independent reversal.
An incomplete UP selection or coincident Follow/UP axes blocks preview while
retaining the user's draft. Choices identify declarations; the worker checks exact native
incidence. Incomplete selections block preview and a nonincident origin rejects.
Ready preview disables editing until Apply or Cancel. Ordinary history,
suppression, deletion and saved reopening retain the explicit intent. Source
update and replacement require explicit compound path repair rather than
retaining a guessed frame or nearest endpoint. Changes affecting only the UP
source still require explicit current face repair, including reused and nested
occurrence namespaces.

## Evidence boundary

The public fixtures reuse an original 4 x 6 x 4 mm prism. Literal native
material points, analytic lengths and volume/area expectations provide
independent checks. See [provenance](PROVENANCE.md#material-line-path-fixtures),
[validation](VALIDATION.md) and `npm run test:desktop:assembly-line-path`.
The scripted desktop workflow uses actual production worker responses and
test-owned file-dialog paths; it does not establish manual dialogs or viewport
picking. Configured CI jobs establish no execution result by themselves.

Full Path support, UP without Follow, linear UP guides, singular fallback policy,
general convergence, continuous motion
or collision safety, external-format compatibility, other-platform runtime
support and the complete assembly demo remain separate work.
