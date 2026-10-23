# Saved material circular-path mates

The saved `circular-path` family relates a material vertex to an open circular
edge with an explicit material endpoint origin. It connects the
[current native query layer](ASSEMBLY_CIRCULAR_PATH_NATIVE.md) to the
[numerical circular constraint](ASSEMBLY_CIRCULAR_PATH_NUMERIC.md), saved
document visitors, worker preview and editor. It is a bounded SolidFlow family,
not a claim about another application's Path modes or complete Path support.

## Saved intent and exact roles

An `AssemblyCircularPathMate` stores its normal mate identity, name and
suppression flag, plus the existing `AssemblyCircularPathReferenceRequest`:

- `point`: an exact material vertex reference;
- `path`: component definition/revision and occurrence path, body, edge and
  `startVertex` in one compound material selection;
- `position`: Free with explicit `domain: 'trim' | 'support-circle'`, or
  `mode: 'coordinate'` with a nonnegative `distanceMm`;
- `orientation`: Free pitch/yaw and free roll, or an explicit component-axis
  Follow with independent reversal and optional material-plane UP.

These are declaration fields only. Radius, measured center/frame, metrology,
native proofs, solver poses, reports and worker tokens are not saved inside the
mate. Strict parsing rejects unknown fields, sparse paths, mismatched producer
declarations, accessors and executable data without invoking them. A finite
distance can parse before geometry is available; preview must also admit it
against the actual current arc length.

Free `trim` retains both finite endpoints. Free `support-circle` uses the
analytic supporting circle beyond that trim. This domain is explicit SolidFlow
intent, with no inferred external Free policy. A coordinate remains inside the
actual finite material trim, inclusively. There is no percentage mode, implicit
periodic wrapping, extrapolation or endpoint clamping. Selecting the other
actual endpoint changes the material origin and forward direction; it is not
an independent unchecked direction flag.

UP requires Follow, a different canonical component axis and an explicit
current planar material face. Follow and UP reversals are independent. No
principal plane, LINE guide, closed-circle seam or guessed normal supplies an
UP role. A singular or insufficiently retained projection rejects rather than
choosing a fallback axis.

The endpoint visitor exposes `point`, compound `path`, and `up` only when UP is
declared. Replacing a path replaces its edge and start vertex atomically. The
shared `isAssemblyPathEndpoint` shape guard, including its legacy LINE-named
alias, recognizes syntax only: LINE and arc selections have the same compound
shape. `assemblyMatePathKind` obtains purpose from the saved family and role.
Neither the shape guard, an opaque key nor matching coordinates authenticates
a native circular edge.

## Current proof, numerical owners and final verification

The snapshot resolves active saved circular mates through a distinct
`ResolvedAssemblyCircularPathMate`: current point, material-arc and optional
plane witnesses. The arc purpose retains the exact same-body native endpoint,
current producer/source/rebuild identity and proper material frame. Closed
circles, LINE substitution and a nonincident same-coordinate vertex reject.
Copied, stale or disposed proofs cannot authenticate a saved solve.

The saved adapter operates in each declaration's actual solve scope; it does
not substitute the standalone root-reference resolver for saved-mate authority.
The top occurrence in that scope is the rigid numerical owner. Nested material
frames are rebuilt from source declarations without cancelling previously
composed world poses or promoting descendants into free bodies. Child assembly
declarations solve before their parents; final verification expands every
active reused instance into its current world placement. Shared roles retain
the same owner and its gauge rather than creating duplicate variables.

A fixed occurrence remains its actual fixed numerical body. Static final
checks intentionally use null numerical owners with current complete world
frames. That null represents a fixed evaluation frame, not a missing material
selection. A saved `body: null` is the existing legacy-body declaration, not a
ground owner or permission to substitute an explicit body's geometry.

Numerical input retains `current-native-analytic-float64` arithmetic from the
actual GPPoint tuple and analytic circle. Native topology tolerance remains
separate incidence metadata, not calibrated point/radius/frame/phase metrology.
Original placement-chain magnitudes and depth remain charged before
cancellation. The material circle's center/radius/frame/sweep and an interior
native D1 evaluation keep their separate error accounts; the
[native contract](ASSEMBLY_CIRCULAR_PATH_NATIVE.md) describes that boundary.

Before publishing a ready preview, final checks re-query current native
geometry and call the independent circular-reference evaluator. The final
position, finite-domain margins, Follow and projected UP defects must retain
their requested bands together with their errors. Default bands are
`1e-6 mm` and `1e-8 rad`; uncertainty never widens them. Query, coherence,
precision or cleanup failure withholds ready publication.

Solve, anchored local/world movement, projected drag and sampled motion
stations share this final verification. Sampled stations do not establish
continuous path or collision safety. The separate translation-until-contact
operation rejects active circular mates: this nonlinear family does not inherit
a continuous-support or affine proof from another family.

## Preview authority, repair and editor lifecycle

Ready previews carry `circularPaths` reports with exact mate/scope and full
point/path/optional UP component paths, echoed intent, physical measurements,
requested bands, precision and reference-model metadata. The report type derives
from the independent evaluator's successful result. It retains
`verificationOnly: true` and `compatibilityAuthority: false`; a successful
measurement is not itself an Apply capability.

Apply consumes the existing worker-owned preview for the exact committed base
and its private candidate. Copies or edits to detached document/report DTOs do
not replace that candidate. Cancel, new preparation, stale committed content
and consumed or forged tokens revoke or fail authorization. Ordinary document
history and parse/serialize retain explicit circular intent without retaining
the transient numerical authority.

Part source updates require explicit current repair of affected point,
compound path and UP roles, including suppressed declarations. Selected-use
replacement and all-use replacement preserve their existing distinct boundaries;
a selected reused ancestor does not silently rewrite its sibling. A v2 assembly
source update inventories renamed descendant boundaries and requires explicit
role choices instead of inventing a new name match or nearest endpoint.

Repair catalogs carry positive current circular-origin metadata and
purpose-specific keys, separately from LINE choices. The worker jointly
revalidates the selected current edge and material endpoint; a declaration with
the correct compound shape or a catalog key alone cannot pass. Incomplete
repair decisions, a LINE substituted for an arc, a nonendpoint origin or an
unavailable boundary reject. UP repair remains a separate explicit face role.
Repairs are proposals until a fresh worker preview authorizes publication.
Dormant or unavailable boundaries can be inventoried as saved declarations;
missing current native geometry does not grant a repair proof.

The editor provides material point and compound arc/origin choices, explicit
Free domain or coordinate, Free/Follow axis and reversal, and Free/UP face,
axis and independent reversal. An unavailable guide, incomplete draft or
coincident Follow/UP axes blocks preview while retaining the user's choices.
Ready preview locks editing until Apply or Cancel. Document/generation/scope
and scene freshness retain the existing preview ticket checks. Editing,
suppression and deletion use the same authenticated preview path; ordinary
Undo/Redo and saved reopening retain declarations and require fresh geometry
for a new solve. These controls do not establish viewport picking.

## Evidence and remaining limits

The [original fixtures](PROVENANCE.md#saved-circular-path-lifecycle-fixtures)
reuse the tracked quarter sector. CAD cases check actual start/mid/end
coordinates from both material origins, Free trim/support-circle, Follow and
third-owner planar UP, shared/nested/reused owners, private candidate authority,
history/roundtrip, failure rejection, projected movement and sampled stations.
Independent Cartesian targets, current material vertex differences and solid
V/A remain separate from reported numerical residuals.
The native repair examples retain the original sector geometry while changing
source identity or descendant names. They establish explicit repair and fresh
incidence checks for those cases, not general topology correspondence.

The authored `test:desktop:assembly-circular-path` scenario targets real
production worker/file IPC for compound dropdown authoring, Free trim with
Follow/UP, coordinate rejection and midpoint editing, Cancel/Apply/history,
suppression/deletion, Save As, reopen and a fresh solve. Its configured command
and authored assertions are not an execution result. Consult
[validation](VALIDATION.md) for the actual source-specific commands and outcomes;
no pending global or renderer result is implied here.

Closed-circle material origins, chained curves, percentage coordinates,
external policy equivalence, general convergence, continuous traversal/contact,
other-platform runtime support and the complete assembly/demo gate remain
outside this increment.
