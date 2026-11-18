# Current profile material directions and physical checks

This layer extends the [bounded face measurements](ASSEMBLY_PROFILE_CENTERS.md)
with an explicit rectangular boundary direction. It also independently checks
the physical equations of the [numerical profile-center family](ASSEMBLY_PROFILE_CENTER_SOLVER.md)
against fresh native observations. By itself it creates no saved mate or Apply
authority. The separate [saved/native/editor integration](ASSEMBLY_PROFILE_CENTER_MATES.md)
uses these proofs without turning detached observations into capabilities.

## One face, one exact edge and an explicit sense

`AssemblyProfileAxisSelection` contains the existing component/body/face identity,
an exact edge reference and `sense:1|-1`. Syntax validation requires matching
source identity and own data fields. The engine resolves both references in
one current body/catalog epoch. `extractAssemblyRectangleAxisSupport` then
recognizes the complete bounded rectangle and requires exactly one native
`IsSame` edge match within its boundary. A geometrically identical independent
edge, a different face's edge or a generic LINE witness cannot supply incidence.

The selected edge must be an analytic LINE with a finite increasing parameter
interval and two distinct boundary vertices. Its curve endpoints must uniquely
match those vertices; native D1 position and direction must agree with the
segment and face plane. These are consistency checks after identity has already
been established, rather than geometric searches for a likely edge.

The explicit direction is `sense * normalized(D1)` for increasing native curve
parameter. It is independent of TopAbs edge orientation, coordinate sign,
boundary ordinal and longest side. Small projection onto the authenticated face
plane is charged to the reported angular error. A square permits either selected
side; no automatic long-axis correspondence is invented. Circles keep their
face-only observation and reject this rectangular-axis operation.

The returned position/normal and `xDirectionErrorRad` values are first-order
input/arithmetic estimates, not certified metrology intervals. Endpoint
consistency uses native spatial tolerances. The angular estimate retains
arithmetic before endpoint subtraction, analytical/chord discrepancy and actual
projection correction; it does not convert a native linear tolerance into a
certified angular tolerance. Requested bands are never enlarged.

The snapshot issues a separately frozen `profile-axis` witness through a private
WeakMap. Old face, point and LINE purposes, copied objects and other snapshots
cannot authenticate it. The witness retains local support, composed world
support and private original placement-chain magnitudes. World uncertainties
include composition even when large translations cancel. Reentrant document or
geometry changes and query/release failures prevent publication.

## Independent current physical evaluation

`evaluateAssemblyProfileCenterReferences` accepts an ordered pair, alignment,
signed offset and explicit free/rectangular orientation. Each role contains a
face selection and either null axis or `{edge,sense}`. Free orientation requires
null axes; rectangular orientation requires both complete axis selections.
Malformed requests, scope or numerical bands reject before new native queries.

Two fresh face or joint face/edge queries supply the observations. Centers are
composed relative to the first placement before adding local coordinates, while
retaining errors from the original chain. Independent vector arithmetic checks
the full center defect `cB-cA-offset*nA`, the `atan2` normal angle and, when
requested, the explicit quarter-turn material-direction angle. It does not call
the numerical row helper or infer satisfaction from componentwise residuals.

An `ok` report includes `satisfied` only when its numerical budgets fit the
original bands. `precisionLimit` omits `satisfied` and retains the borrowed
snapshot. Valid native query failures close the snapshot, including cleanup
failure aggregation. Both proofs are checked again before returning a report.
Reports carry `verificationOnly:true` and `compatibilityAuthority:false`:
mathematical checking of a free mixed pair is not native relationship admission.

This independent physical verification is now used by the separate
[saved profile-center integration](ASSEMBLY_PROFILE_CENTER_MATES.md), including
its native final checks. The standalone API retains its measurement-only
compatibility boundary. Original fixtures and source-specific command results belong in
[provenance](PROVENANCE.md#current-profile-material-axis-fixtures) and
[validation](VALIDATION.md); narrow native cases do not establish platform or
complete assembly-demo support.
