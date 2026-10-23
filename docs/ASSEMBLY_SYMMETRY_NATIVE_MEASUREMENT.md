# Native symmetry measurement

This contract describes the standalone, read-only symmetry measurement in
`kernel.assembly-symmetry.ts`. It measures current native analytic supports;
it does not create a saved mate, run a symmetry solve, move components or expose
a UI command. A detached report carries no Apply authority. The separate
[saved symmetry workflow](ASSEMBLY_SYMMETRY.md) consumes this independent
measurement after native solving; it does not change this standalone operation.

## Three explicit selection roles

`validateAssemblySymmetryReferenceSet` requires source, target and mirror roles.
Source and target must declare the same purpose:

| Purpose | Accepted references | Physical comparison |
| --- | --- | --- |
| Point | Actual topology vertices | Full reflected-point displacement |
| Line | Actual LINE edges or an explicitly selected cylinder-derived face axis | Transverse displacement of the reflected line anchor and direction agreement |
| Plane | Principal planes or native planar faces | Target-normal projection of the reflected anchor displacement and normal agreement |
| Sphere | Native spherical surface references | Reflected-center displacement and radius difference |
| Cylinder | Native cylindrical surface references | Transverse reflected-axis displacement, direction agreement and radius difference |

The mirror is an explicit principal or native plane. A derived axis is a line
purpose, not proof of a cylindrical surface. Sphere and cylinder purposes require
their explicit surface references; they are not inferred from a point or axis.
These are infinite analytic support comparisons, not certificates of trimmed
face overlap, complete shape correspondence or global BRep symmetry.

Line, plane and cylinder declarations require an explicit `aligned` or `opposed`
branch. Point and sphere require null alignment. The branch compares the target
direction with the reflected source direction or its negative; it is not an
inferred interior/exterior convention.

## Current native observations and lifetime

`measureAssemblySymmetryReferences` resolves all three roles through an
`AssemblyGeometrySnapshot`. Each role uses fresh current-native queries and
private snapshot proofs of membership, ownership, placement and purpose. Public
reference syntax alone does not authenticate current geometry. Body and topology
source identifiers must agree where declared.

Each private witness is checked while preparing its support and all three are
checked again against the original live document immediately before returning.
Snapshot availability and freshness guards also apply to reentrant queries;
a nested operation cannot grant authority to a stale or unavailable snapshot.

Malformed selection syntax or measurement policy is rejected before native
queries and preserves the borrowed snapshot. A failure inside the measurement
operation disposes that snapshot; cleanup failure is reported rather than
silently discarded. Successful measurement leaves snapshot lifetime with its
caller. There are no selection writes, rebuilds or document mutations.

## Coordinates, uncertainty and admission

The kernel composes support points directly relative to a common anchor from the
mirror placement. It does not first add a large world translation and then
subtract it. The original placement-chain magnitude sum and depth remain in the
rounding estimate so cancellation cannot erase the precision guard.

The independent physical calculation uses millimetres and radians. It reflects
the source point and, for directional purposes, its direction through the mirror.
Plane position is a target-normal projection; line/cylinder position is a
transverse projection. Away from orientation agreement these are anchored
support defects, not a general minimum-separation algorithm. The physical angle
uses `atan2` of cross-product magnitude and dot product. Sphere/cylinder reports
also retain the signed target-minus-source radius difference.

Native linear shape tolerance supplies a declared support envelope. Placement
rounding, mirror lever arm and off-solution target-direction uncertainty are
propagated conservatively to first order. Floating-point rotation error is an
angular arithmetic estimate, not measured physical angular metrology. These
bounds are not a formal interval or worst-case certification.

Default requested bands are `1e-6` mm and `1e-8` rad. A caller may explicitly
supply finite positive bands; the angular band must be below pi. Uncertainty
never widens those requested bands. Nonrepresentable arithmetic, or an estimated
uncertainty exceeding a requested band, produces `precisionLimit` rather than
an accepted comparison. The numerical layer also guards normally representable
inputs and reflection/radius arithmetic; those guards are numerical admission,
not additional native measurements.

An `ok` report means the calculation passed its uncertainty admission. Its
`satisfied` flag separately requires the measured position and angle defects,
and the radius difference when applicable, to lie within the requested bands.
A radius mismatch is a physical mismatch, not permission to enlarge a band.
Acceptance therefore needs both independent numerical admission and the physical
residual checks. The report retains the uncertainty estimates and does not
present their first-order estimates as an interval proof.

## Remaining integration

This measurement operation alone does not establish a saved mate or solve.
The [saved/native integration](ASSEMBLY_SYMMETRY.md) adds strict three-role
declarations, explicit uncertainty during numerical trials and fresh independent
final measurements, with repair and dropdown editing. Its Apply capability is
separate from this detached report. Actual authoring, editing, Undo/Redo and
saved reopening require their own source-specific execution evidence. Viewport
point picking, general motion/contact and complete assembly acceptance remain
open. Coverage of one purpose or placement does not establish all-family or
platform support; record numerical, native and interaction results separately.
