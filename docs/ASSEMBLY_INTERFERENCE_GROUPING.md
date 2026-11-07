# Root-subassembly inspection groups

**Agrupar subensamblajes raíz** omits candidate pairs whose leaves belong to the
same root component occurrence. It applies to the confirmed assembly's static
interference and clearance inspection. It does not move or combine material.

`AssemblyInterferenceOptions.treatSubassembliesAsComponents` is an optional
strict boolean. Omission and false preserve the previous inspection policy;
validated reports include the actual normalized value. This is transient
inspection intent, with no saved-document version or assembly declaration change.

## Admission and identity

Grouping can be combined with all three inspection scopes and explicit
exclusions. Scope membership and exclusions resolve against the complete
original graph. Selecting a leaf or an inner subassembly never promotes it to
a new root group. Excluding one descendant removes that leaf, rather than its
whole root group. Exact references, revisions and duplicate-list validation
remain required before native allocation.

`includeWithinComponent: true` can remain requested alongside grouping. Grouping
takes precedence: a pair sharing a root occurrence is omitted even when it uses
two distinct bodies of one part. Both actual normalized booleans remain in the
report. Turning grouping off restores the retained internal-body request.
This also applies to a root part, which is its own group.

The group key is the first segment of the full leaf `occurrencePath`. A root
part is its own group. Every descendant of a root subassembly shares that root
occurrence's key, including descendants of further nested subassemblies. Two
occurrences of one definition have different keys. Definition IDs, prototype
cache entries and display names never merge those groups.

Grouping intersects the scope's pair policy. `among-selected` admits pairs
between selected leaves in different original root groups. Selecting two leaves
within the same root group therefore produces zero eligible pairs when grouped.
`selected-against-rest` additionally requires exactly one selected leaf per
pair; two leaves within the same original root group still cannot be compared.
Overlapping ancestor/descendant selections deduplicate leaves without changing
their original group. Exclusions dominate selection without changing ancestry.

The same predicate controls potential-pair counting and native pair queries.
Existing suppression, visibility, body identities, budgets and native failure
handling continue to apply. An omitted pair is outside this inspection's scope;
it supplies no distance, contact or absence-of-overlap claim.

## Reports and controls

Eligible pairs retain their two original leaf/body references, Common solid
metrics, meshes and closest points. No synthetic group body or union is built.
Participant counts still count leaf components and bodies, not groups.

Scope, selection, exclusion and internal-body controls remain editable while
grouping is enabled, except that the selected list is disabled in `all` mode.
The internal-body checkbox retains its value. The flag participates in the
request signature, so changing it removes the previous report and highlight.
Displayed policy comes from the accepted report's options. Inspection grants no
Apply authority and does not edit history, recovery or source bytes.

## Reviewable cases and limits

The original unit cases cover three flat leaves, one inner subassembly with a
root leaf, two levels inside one root group and two reused root groups. The
[original desktop fixture](PROVENANCE.md#root-subassembly-grouping-fixtures)
has two coincident occurrences of `G={S={A,B},C}`. It provides fifteen ungrouped
pairs and nine cross-group pairs, with original identities retained.

`npm run test:desktop:assembly-interference-grouping` exercises production Open,
the checkbox, actual worker reports, highlight invalidation and restored pair
identities. The separate `test:desktop:assembly-interference-grouping-multibody`
command uses two reused nested groups containing the same original two-body part,
checking six ungrouped, four cross-group and six restored pairs with internal-body
inclusion retained. A configured command is not an execution result; consult the
[validation record](VALIDATION.md).

The separate `test:desktop:assembly-interference-grouping-scope` command uses
four multibody leaves under two reused nested root groups. It checks selected
leaves within one group, selections spanning groups, exact exclusions and the
selected-against-rest intersection. Its original geometry and pair sums are
documented in [fixture provenance](PROVENANCE.md#grouping-with-selected-and-excluded-fixtures).

Union volumes, flexible assemblies and continuous collision remain outside this
increment. The fixtures and one platform's results do not establish general
geometry, importer, interaction or platform coverage.
