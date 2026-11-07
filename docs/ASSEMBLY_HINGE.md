# Saved unlimited revolute hinges

The saved `hinge` family connects the [numerical/native foundation](ASSEMBLY_HINGE_CORE.md)
to assembly documents, current reference authentication, worker preview/Apply
and the editor. This contract describes the four-role unlimited branch. The
[optional six-role stop extension](ASSEMBLY_HINGE_STOPS.md) retains that branch
and adds explicit angular travel. External selection-policy compatibility and
complete assembly/demo acceptance remain separate open requirements.

## Saved intent and reference lifecycle

The version-two mate has an ID, name, suppression flag, two ordered `axis`
references, two ordered `axial` references and explicit `aligned` or `opposed`
axis alignment. It has no fictitious binary first/second endpoints and no
captured roll angle. Axis and plane roles remain separate throughout inspection,
replacement, shared-source updates, root revision authoring and saved reopening.
The four visitor names are axis-0, axis-1, axial-0 and axial-1.

Axis references select cylinder-derived face axes or actual LINE edges. Axial
references select native planar faces or declared principal planes. All fields
are strict own data. The existing graph, revision, depth and byte limits apply.
Stale topology/body locators can remain represented for inspection and explicit
repair; syntax validation does not authenticate them or silently find another
face. Suppressed or dormant declarations retain their full identities without
claiming that their geometry was measured.

For each side, the selected axis and plane must resolve to the same effective
rigid owner, even if they come from different descendants. The axial plane's
normal must be parallel or antiparallel to its own axis within the separate
1e-12-rad structural qualification. An oblique or radial plane rejects. Plane
normal signs do not select a roll or change the saved axis alignment.

## Native solve and publication

The snapshot resolves four current purpose-specific witnesses, checks all four
for source membership and freshness, and preserves their actual occurrence
paths. The numerical solve operates on the current declaration's real rigid
owners and descendant frames. A nested reference context does not itself grant
independent movement to children of one rigid owner.

The regular two-owner case constrains coaxiality and axial separation while
retaining relative spin. Rank and local freedoms are calculated from actual
incidence, not assigned from the family name. Fixed, repeated and null owners
retain their real gauge and invariants. The foundation's positional/directional
uncertainty accounting and finite angular-chart admission apply.

After solving, an independent fresh native measurement re-queries the four
roles and checks physical axis agreement, transverse displacement and axial
offset. Residual plus retained error must fit the requested bands. It does not
reuse numerical row residuals, a cached report or a DOF count as a geometric
oracle. A failed query, exhausted precision budget or unsatisfied final measure
withholds the candidate.

The worker retains the native candidate privately. Its normal exact-base
preview/Apply capability, cancellation and single-use rules apply to the hinge.
Editing a detached reply, numerical declaration or support report does not
change the private candidate or grant Apply authority. History and file Save
remain separate from preview and Apply.

Each active hinge also publishes its scoped entry in the ordinary `checks`
list after both numerical and fresh native verification. A suppressed hinge
publishes neither an active check nor a geometric support report.

`reply.hinges` contains current support reports for ordinary solving and the
existing constrained motion/translation routes. Reports include the four full
component paths, axis alignment, axis angle in radians, transverse and axial
defects in millimetres, structural axiality and separate uncertainty estimates.
These infinite-support checks do not certify face overlap, contact, collision
freedom, a continuous trajectory or complete mechanism behavior.

## Editor

The Bisagra selector exposes Eje A, Eje B, Plano axial A and Plano axial B.
Dropdown choices retain complete component, revision, body, topology and
purpose identities. Face picking supplies cylinder-derived axes or planar
faces; the axis roles also offer explicit LINE-edge picking. Principal-plane
choices remain explicit dropdown declarations.

The current scene nominates choices; native solving authenticates them.
Reference equality normalizes strict complete declarations before comparison,
so object property order cannot invalidate a saved axis or erase part of its
identity. A saved reference absent from the current catalog remains visible as
pending reselection and cannot be submitted as a current choice.

Picking and submission retain document, scope, generation, scene and edit-epoch
tickets. A late pointer callback must match the exact rendered intent, rather
than fill whichever role was selected later. Preview, staging, drag and document
changes block or revoke selection. Four roles are assembled as one proposal;
the document changes only after native preview and explicit Apply.

The editor supports editing/reselection, cancellation, suppression/deletion and
normal history/reopening. Its verified summary displays only reports consistent
with the current unsuppressed saved mate and all four expanded paths. That
display check confers no native authority.

### Local geometry labels

Current material choices show the native support's prototype-local point in
millimetres and its local plane normal or axis direction, followed by the
occurrence, body and feature producer. A cylindrical face axis and a LINE edge
are labeled separately. For example, a leaf's z0 and z4 caps have different
local points and normals; a radial plane is not relabeled as an axial cap.
The labels remain local when the occurrence is translated or rotated. Declared
principal planes identify their declared local frame instead.

Display rounding and labels do not enter saved identity or acceptance bands.
Complete normalized references remain the choice keys. Labels put their local
geometry before the owner/producer suffix so the closed selector exposes the
distinguishing values. Selected choices and options also
retain the complete label in a tooltip. Geometrically identical descriptions
receive an ordinal explicitly marked as belonging to the current catalog;
that ordinal is neither persisted nor used to find a later face. Missing or
nonfinite display geometry is labeled unavailable, not printed as a numerical
measurement. Native solving still checks purpose, ownership and axiality.

### Authored interaction and repair workflows

The separate `assembly-hinge-picking` workflow is designed to exercise actual
viewport pointers for the four roles, purpose rejection and editing/reselection,
followed by native preview/Apply, history and saved reopening. It starts with
separated, rotated original leaves so a pointer result cannot be inferred from
an already seated joint. Staging a LINE edge is distinct from proving a saved
LINE-axis solve. Its material-point and placed-bound checks remain independent
of labels and picker projection. This is a bounded scripted interaction case,
not proof of arbitrary visibility, human pointer behavior or every camera view.

The separate `assembly-hinge-repair` workflow authors a four-role relation and
reviews a shared source update, selected replacement and all-use replacement.
A source update affects four material roles; selected replacement affects the
moving axis and cap only; all-use replacement affects all four. The authored
case requires explicit current choices for each affected role. A source preview
with one role unrepaired must reject without an Apply capability; replacement
Resolve stays disabled while required repairs are pending. Unaffected selected-
replacement roles retain their exact declarations.

Ready Cancel/retry, fresh review/revision identities, private Apply, Undo/Redo,
Save As/reopening and fresh verification are separate observations in those
scripts. The repair case uses eleven Open and four Save As substitutions. It
checks proper current rotations and literal material bounds rather than imposing
a unique free-roll pose. These authored workflows and configured commands are
not execution results; actual runs, failures and limits belong in validation.
They do not establish nested copy-on-write repair, suppressed repair, angular
stops, finite contact or completion of the full assembly scope.


## Evidence and open scope

The [original drilled leaves](PROVENANCE.md#original-two-leaf-unlimited-hinge-control)
provide independent volume, area, bounds and eccentric-point oracles. The
separate [saved renderer fixture](PROVENANCE.md#saved-unlimited-hinge-renderer-fixture)
uses the same public geometry. Numerical, native capability, model lifecycle,
SSR/ticket and production-renderer evidence must be recorded separately in
[validation](VALIDATION.md), including actual platforms and tolerances.

The unlimited branch described here does not choose angular-limit references
or an angle origin. The [optional extension](ASSEMBLY_HINGE_STOPS.md) supplies
an explicit directed interval with separate evidence. External angular policy,
finite contact and other axis/point/circular-edge combinations remain open
alongside assembly and demo readiness; a passing unlimited joint does not
complete the full assembly scope.
