# Native vertex references for assemblies

This prerequisite supplies exact current material-vertex identity and separate
native point witnesses. It adds no saved point mate, symmetry declaration,
viewport vertex picker or editor command. The five-family numerical symmetry
solver remains distinct from native/saved/application acceptance.

## Identity and eligibility

`VertexReference` stores only `sourceFeatureId` and a `vertex-v1|` key followed
by 64 lowercase hexadecimal characters. Its digest covers the source, lineage,
global native vertex/edge/face counts and sorted incident primary face/edge
reference keys. Pure hashing validates dense bounded data, exact source scope
and unique references per family; it supplies no native authority. No additional
coordinates, dimensions, enumeration indices, mesh vertices, pointers, aliases
or native hash codes are accepted as identity inputs or ambiguity tie-breaks.
The existing primary keys retain their own naming semantics and limitations.

The native producer verifies the complete borrowed face/edge catalogs against
the current body: each native target and each catalog target must correspond
one-to-one. Each incident primary key must resolve uniquely. Eligible vertices
need at least two distinct open, nondegenerate incident edges and incident
faces. Closed/degenerate-only seams do not become selectable through accidental
uniqueness. Duplicate vertex signatures and ambiguous incident keys are left
unresolved; no nearest point, ordinal or coordinate tie-break repairs them.

These are conservative incidence references, not a general semantic vertex-v2
scheme. Durability depends on the exact current incident references and lineage.
Verified semantic primaries are used where available; legacy geometric primaries
retain their conservative limits. The checked rectangular-prism dimension edit
is evidence for that case, not proof for arbitrary edits, Booleans, seams,
split/merged topology or all producers. Missing correspondence needs reselection.

Vertex capability is optional for otherwise valid bodies. More than 8192
vertices, 4096 edges or 256 faces yields no vertex entries rather than rejecting
the older body operation. These are admission limits, not capacity or timing
benchmarks. Native enumeration, membership or release failures still propagate.

## Selection and native measurement

`AssemblyVertexReference` is separate from directional geometry references:

```text
kind: vertex
component: exact occurrence path and definition/revision
body: exact BodyReference or explicit null legacy aggregate
vertex: VertexReference
support: point
```

The standalone parser deep-copies strict data with exact fields and bounded
identifiers/paths. A missing body is different from explicit null. An explicit
body and vertex must declare the same source. Syntax validates no current
native membership. Null is admissible only for the exact current legacy
aggregate when no explicit body catalog exists. It never chooses the first
body or substitutes an aggregate for an explicit body.

The current engine resolves the unique exact key and queries the actual native
vertex point and tolerance. Epoch, source/body identity, current shape and
catalog lifetime are checked before returning the measurement. Rebuild failure,
stale geometry and release faults cannot authenticate a point. Display
`vertexPoints` carry detached references and coordinates, separately from the
existing mesh `vertices`; those display DTOs confer no solve authority.

## Snapshot authority and ownership

`AssemblyGeometrySnapshot` rebuilds active unique part revisions once and lists
vertex selections with their actual occurrence paths. It resolves a separate
`AssemblyPointWitness`: `kind: point`, `origin: native-vertex`, declared proper
placement and local/world point supports. There is no artificial axis, normal
or component-origin fallback. Explicit datum points and sphere centres remain
different purposes and identities.

A private WeakMap binds each issued frozen object to its owning live snapshot
and exact document. Copied, serialized, foreign or disposed witnesses cannot
recover that proof. The original directional witness union and old mate
resolution remain unchanged. Placement arithmetic retains the original chain
magnitudes/depth separately; it is not a certificate that world composition
recovers lost precision. A point-query failure closes the complete snapshot.
Point issuance, assertion and metadata listing recheck lifetime after potentially
reentrant document/reference validation or native inspection; disposal during
those calls cannot publish a witness or return selection metadata.

The snapshot admits at most 65536 prototype vertex-reference entries, checked
before publication, independently of its existing body/face/edge budgets.
Reused occurrences retain distinct paths without rebuilding their prototype.
Enumeration and retained native wrappers have explicit ownership and cleanup;
fault tests are not a general native leak certificate.

## Remaining integration

The subsequent [saved/native symmetry integration](ASSEMBLY_SYMMETRY.md) uses
this point-witness route for material vertices alongside line/axis, plane,
sphere and cylinder purposes. It retains three saved roles, fresh independent
physical verification and propagated uncertainty, explicit source/replacement
repair, editor and viewport selection, preview/Apply/Cancel, history and saved
reopening. Those application layers have their own source-specific acceptance;
the vertex prerequisite alone does not establish them.

Explicit datum-point producers, general persistent vertex naming and automatic
correspondence remain separate work. Symmetry translation-until-contact and
broader continuous-motion guarantees remain open, as do complete assembly/demo
requirements. Consult [VALIDATION](VALIDATION.md) for executed source-specific
results and [provenance](PROVENANCE.md#original-native-vertex-reference-cases)
for the original prerequisite fixtures.
