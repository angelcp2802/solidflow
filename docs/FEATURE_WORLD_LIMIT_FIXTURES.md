# Fixed principal-plane recipe fixtures

All inputs described here were authored for SolidFlow on 2026-10-14. They use
handwritten document records and analytical Cartesian solids, without imported
CAD models, vendor binaries or copied source. Counts describe authored cases;
execution results and failures belong in the source-specific validation record.

## Saved intent and rendered controls

The model suite has 18 symbolic cases. Its base is a 2 x 2 x 16 mm box, and its
source circle has radius 0.5 mm at XY offset -6 mm, with an UpToSurface limit
at principal XY=0. The declared translation is [3,0,4] mm. These records test
selected/ALL save/reopen, explicit versus missing intent, unsupported and stale
policies, duplicate records, getters and non-enumerable data, detached command
edits, scope/method/seed changes, closure freshness and stale Apply receipts.
They do not construct native shapes.

Four server-rendered control cases use separately authored symbolic feature
records. They check the initially unchecked choice, saved/disabled state,
removal of stale intent and absence of a control for unsupported datum targets.
Rendered markup does not establish mouse/keyboard interaction or CAD results.

## Analytical native expectations

For a completely internal cylindrical cavity of radius r and length h:

- Removed volume is pi*r*r*h.
- Added boundary area is 2*pi*r*h + 2*pi*r*r, including both internal caps.

For a cylindrical boss whose base disk lies entirely on a box top, the lost
top disk and new tip disk cancel, so the added area is 2*pi*r*h.
Box volume and surface area follow their three Cartesian side lengths.
Expected results must use these formulas, without calling the extrusion or
recipe implementation to calculate an oracle.

The source box spans [-1,-1,-8] to [1,1,8] mm: volume 64 mm³ and area 136 mm².
A radius-0.5 source cavity from z=-6 to z=0 removes 3*pi/2 mm³ and adds
13*pi/2 mm². A translated start z=-2 instead makes a two-millimetre cavity:
volume 64-pi/2 mm³ and area 136+5*pi/2 mm². Its source tool remains six
millimetres long, so copying and recalculating are distinguishable.

Eleven authored native cases use actual linear/circular/mirror document features,
signed rays, selected cut/merge and dynamic ALL with distinct coincident owners
and an unchanged remote owner. Additional assertions retain exact historical
source states, source edits, document round trips, history and atomic failure
after an earlier real tool succeeds. The native test source is the authoritative
case inventory; an authored fixture or static review is not a passing result.

The mirror uses a separate XY datum at z=2 mm while its end limit remains
principal XY=0. The reflected start is z=10 with a -Z ray. Its target box
spans [-1,-1,-12] to [1,1,12], volume 96 mm³ and area 200 mm². Recalculation
therefore makes a ten-millimetre cavity (96-5*pi/2 mm³, 200+21*pi/2 mm²);
copying the six-millimetre source stops at z=4 (96-3*pi/2 mm³,
200+13*pi/2 mm²). A cube at [0,0,2] distinguishes the two material results.
This datum belongs to the mirror placement, not the extrusion end reference.

A separate 90-degree rotation about Y through z=-2 places the start at
[-4,0,-2] with a +X ray parallel to the fixed XY plane. The complete pattern
must reject without a new owner poststate. A call-through observer checks the
actual builder rejection; it supplies no geometry or substituted CAD result.

Native metrics require one valid closed solid per final owner, absolute volume
and area error below 1e-5, and coordinate error below 1e-6 mm. Material probes
are 0.2 mm cubes, volume 0.008 mm³ when wholly present and zero when absent,
with volume error below 1e-7 mm³. These tolerances apply only to these fixtures.

The fixtures exercise SolidFlow's declared external principal-plane semantics.
They do not establish other CAD interoperability, datum/face correspondence,
empty-owner restoration, complete property-panel interaction or platform support.

## Production-renderer workflow and recorded evidence

The handwritten [pattern-world-limit-original.json](../src/cad/fixtures/pattern-world-limit-original.json)
is an original seven-feature millimetre document. Its source box is
[-1,-1,-8]..[1,1,8], and its independent target box is [2,-1,-8]..[4,1,8].
The radius-0.5 source circle starts at z=-6 and cuts toward principal XY=0.
The initial geometry pattern uses exact source/target bindings and displacement
[3,0,4], moving the six-millimetre cavity to target z=-2..4. Explicit world-limit
regeneration instead cuts from z=-2 to the unchanged XY=0 plane: target volume
changes from 64-3*pi/2 to 64-pi/2 mm³; source geometry stays unchanged.

The `npm run test:desktop:pattern-world-limit` command uses the
[fixed workflow factory](../scripts/desktop-pattern-world-limit-flow.cjs) and the
shared production-loader launcher. Scripted DOM events select regeneration
without a saved policy. The real worker must return the missing-policy feature
error, and Apply must remain blocked. Clicking the explicit fixed-limit checkbox
then requests a new real preview. The recorded workflow checks four healthy phases:

1. Initial geometry-pattern document.
2. Preview with the explicitly saved principal-plane/world policy.
3. Committed result after actual Apply.
4. Reopened result after preload/IPC Save As to an isolated test-owned file.

The missing-policy preview is a separate expected rejection, not a healthy
phase. Each selected worker request/response must retain exact source/target
routes, body/source/creator IDs, document origin and unchanged feature prefix.
The saved file and reopened worker input must preserve the policy and declaration.

UI evidence checks volume error below 1e-5 mm³ and coordinate bounds error below
1e-6 mm, plus exact refs/IDs. It does not transport or estimate surface area.
Area and material-probe expectations belong to the eleven authored native cases
and their tolerances above, with actual outcomes recorded separately in
[VALIDATION.md](VALIDATION.md). The parent must observe successful child close
before reporting cleanup and a complete pass.

The local Windows invocation recorded on 2026-10-14 passed this workflow for
the wrapper/flow/shared-launcher SHA-256 identities
`6b4316a92addb43627f61f7dfd9428e717d3eb8b2fa90748afd274b91ccb79b8`,
`0cdcd63b825d7738a1b1475d423addaa9e101f173e18afde8094f49aff3f3340`
and `631b2941551ae306cd547b06ffdf3f44271df35c996e365f962af4ebae4467af`.
The fixture SHA-256 is
`b87673e59da0637dc9b29912ed665a6c7efc3d33ccdfd703fb3d9b757afefbbd`.
It observed healthy worker requests 3, 8, 9 and 10 for the four phases above,
the separate expected missing-policy rejection at request 7, actual preload/IPC
Save As and reopen, child close and guarded temporary-profile deletion. The
world-policy preview, Apply and reopened target each had volume 64-pi/2 mm³;
the initial copied target and unchanged source had volume 64-3*pi/2 mm³.

The separate focused native invocation passed 11/11 cases; the first full suite
still failed, including seven timeouts in that native file. The corrected pure
selection passed 31 model/SSR cases, and the later production build passed.
Standard desktop failed with EBUSY; the rerun of ALL on the factored launcher
failed its 180-second deadline without confirmed child close. These outcomes
and exact source boundaries are recorded separately in
[VALIDATION.md](VALIDATION.md). No earlier ALL pass transfers to the factored
launcher, and this world-limit pass does not validate subsequent harness
hardening.

This single linear selected case does not establish circular/mirror interaction,
ALL end-reference choices, human/native-dialog behavior, AUTO, variation, general
profiles, lifecycle, interoperability or platform support.


### Later hardened-launcher checkpoint

A later source-string-hardened invocation reached the same four functional
worker phases, missing-policy rejection and Save As/reopen assertions, but its
parent exited 1 at the 180-second deadline without observing child close. The
launcher reported retaining the isolated profile; its filesystem presence was
not independently checked. It is not a complete workflow-command pass or cleanup
proof. The earlier successful invocation above remains tied to its
listed launcher bytes; neither result replaces the other. The separate checkpoint
and full-suite failure are recorded in [VALIDATION.md](VALIDATION.md).
