# Saved explicit hinge angular stops

The optional `stops` extension connects the [numerical hinge](ASSEMBLY_HINGE_STOPS_NUMERIC.md)
and [six-reference native bridge](ASSEMBLY_HINGE_STOPS_NATIVE.md) to the saved
document, ordinary worker preview/Apply and assembly editor. A hinge without
`stops` keeps its existing four-role unlimited form and serialized shape.
This extension defines SolidFlow's explicit coordinate; external angle origin,
sign, selection order, inactive getters and toggle policies remain unresolved.

## Declaration and reference lifetime

The additional own data is:

```ts
stops: {
  coordinate: 'directed-about-axis',
  angular: [firstMaterialPlanarFace, secondMaterialPlanarFace],
  arc: { start: 330, sweep: 60 } // degrees
}
```

Start is in [0,360); sweep is in [0,360]. The interval is inclusive and may
cross zero. A zero sweep and a full circle differ. Neither a captured nominal
angle nor accumulated turns are saved. Present `undefined`, extra fields,
accessors, sparse roles and principal-plane angular datums reject. Syntax
validation grants no geometric authority.

Endpoint visitors retain axis-0/1 and axial-0/1, adding angle-0/1 only when
limited. Both angular references retain complete source/revision/body/topology
identities. Each angular plane must share its side's actual rigid owner with
the axis and axial support; descendant selections may differ. Nested scope
does not create independent child freedom. Suppressed and dormant declarations
retain all six roles for inspection, repair and root revision authoring.

Shared-source changes require explicit repair of affected angular roles.
Replacing one of the original two reused leaves requires three repairs;
replacing both requires six. Atomic endpoint writes preserve the arc and all
other saved roles. No label or coincident location supplies correspondence.

## Native verification and editing

The snapshot retains the authentic six-role aggregate from the standalone
resolver. Numerical constraints include both angular supports and their
retained errors. Final checks make fresh independent native queries for the
physical hinge and directed interval. Four satisfied hinge supports alone
cannot publish a limited candidate. Residual plus retained error must fit
the unchanged requested 1e-6 mm and 1e-8 rad bands by default.

The ordinary hinge report keeps its four-role physical fields and adds a
separate `stops` report: angular owner paths, coordinate, degree arc, measured
phase in radians, projection lengths, interval margins, active boundary,
full-circle flag and direction error. The editor checks report consistency
against the current saved mode, scope, identities and interval. Missing,
stale, malformed or error-exhausted stop data cannot display verification.
A report is detached display data. Exact-base, private native candidate and
single-use worker capability remain the authority for Apply.

The editor starts limited mode with empty explicit start/sweep fields and two
additional material-plane selections. Five references cannot submit a limited
hinge. Mode, field, generation, scene and context changes revoke stale picking
callbacks. Editing restores six selections and the declared arc; source and
replacement panels label the angular roles separately. Angular viewport
choices accept material planar faces only, not cylinder axes or principal
planes. Configured picking support and actual pointer execution are separate
evidence claims.

## Acceptance boundary

The original saved tests cover authentic six-reference resolution, copied-proof
rejection, exact round trip, detached DTO mutation, private Apply/cancellation,
sampled legal motion, fixed outside-stop rejection, suppressed source repair,
all replacement, repeated rigid subassemblies, singular angular projection and
full-circle intent. Model tests also cover dormant/reused/renamed source roles,
selected replacement, root revision and history. SSR/ticket tests exercise the
editor and malformed/stale reports without claiming a rendered interaction.

Three dedicated production workflows reuse the original drilled-leaf fixtures:

- `test:desktop:assembly-hinge-limits`: six-role authoring, invalid projection,
  Cancel/retry, edit/reselection, history, strict interior motion across zero,
  outside-stop rejection, suppression/deletion and Save As/reopen.
- `test:desktop:assembly-hinge-limits-repair`: shared-source six-role repair,
  selected three-role and all six-role replacement, incomplete repair rejection,
  ready Cancel/retry, Apply/history and Save As/reopen.
- `test:desktop:assembly-hinge-limits-picking`: actual CDP selection of six
  material faces, one staged LINE restored before authoring, angular-face edit
  reselection and bounded wrong-purpose/hidden/canceled input controls. A
  separate local-Z gesture stage projects outward requests to both stops and
  checks release toward the interior, Cancel/retry, Apply/history and saved
  reopening.

They use actual controls, production worker and restricted file IPC, original
test-owned dialog substitutions and unchanged 180/170/35-second budgets.
Authored tests and configured multi-platform CI are not execution results.
See [provenance](PROVENANCE.md#original-saved-six-role-hinge-workflows) and
source-specific [validation](VALIDATION.md). The pointer workflow calibrates
trusted DOM client positions against two actual posted targets, then sends a
third input. Its expected destination clamps the actual posted yaw to the
literal physical [-30,30]-degree interval; no solved pose supplies calibration
or the expected clamp. Native material corners, mass/bounds and the actual
signed cylinder guide check the result independently.

These infinite-support stops do not establish trimmed-face contact, finite pin
engagement, continuous collision freedom, external policy compatibility,
general camera/occlusion behavior, installed-package operation, other-platform
support or complete assembly/demo acceptance. The original symmetric local-Z
pointer case does not establish every interval, axis or reference combination.
