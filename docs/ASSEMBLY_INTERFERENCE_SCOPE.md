# Selecting an interference inspection

This extends the existing [static native inspection](ASSEMBLIES.md#native-interference-and-clearance-inspection).
It does not solve mates, move components or grant Apply authority. Selection is
temporary inspection state; it is not saved in the assembly document.

## Scope and identity

`AssemblyInterferenceOptions.scope` is optional. Omission preserves the previous
all-components behavior. An explicit scope has exactly three required fields:

```ts
{
  mode: 'all' | 'among-selected' | 'selected-against-rest',
  selected: AssemblyComponentReference[],
  excluded: AssemblyComponentReference[]
}
```

Each reference carries a full root-relative occurrence path and exact definition
ID/revision. Names, sibling indexes and a matching part ID alone cannot identify
an instance. A subassembly reference includes its descendant part occurrences;
selecting one expansion of a reused definition does not select its other
expansions. Overlapping ancestor/descendant references deduplicate leaves.
Exact duplicates within either list are rejected. A reference may appear in both
lists: exclusion always wins.

The parser accepts only detached enumerable data fields, valid bounded paths and
finite existing numerical options. Every supplied reference must resolve against
the current complete graph, including suppressed declarations, before any native
build. A missing occurrence or different revision rejects the whole request.
There is no fallback by display name and no partial report for valid entries.

| Mode | Body pairs admitted after exclusions and visibility filtering |
| --- | --- |
| `all` | Every eligible body pair. `selected` must be empty. |
| `among-selected` | Both bodies belong to leaves in the expanded selection. |
| `selected-against-rest` | Exactly one leaf component belongs to the expanded selection. |

The two selected modes require at least one selected reference. A valid reference
whose leaves are all suppressed, hidden by the requested policy or excluded can
produce zero candidate pairs; this is an executed empty scope. It is not an
all-components fallback. In particular, the crossing mode does not include
selected/selected or rest/rest pairs.

Suppressed leaves never participate. Hidden descendants inherit ancestor
visibility and follow `includeHidden`. Exclusions remove a leaf before prototype
construction and body admission. In `among-selected`, unselected leaves are also
removed before construction. Other modes retain the nonexcluded eligible leaves.
The existing 256-body, 32,640-pair and mesh admission limits remain in force.
`includeWithinComponent` is an optional boolean, normalized to `false` when
omitted. The previous different-leaf policy remains the default. Setting it to
`true` also admits distinct explicit bodies within the same multibody leaf in
`all` and `among-selected`. Exact body identities, rather than names, distinguish
the members; a body is never compared with itself. A legacy aggregate remains
one body, with no invented internal identities. `selected-against-rest` still
requires exactly one selected leaf and therefore admits no within-leaf pair,
regardless of this option. Selecting a subassembly does not otherwise discard
pairs between its distinct leaf occurrences when grouping is off.

The separate [root grouping option](ASSEMBLY_INTERFERENCE_GROUPING.md) intersects
all three scope policies. Its key remains the first segment of each leaf's
original full occurrence path, including for the unselected rest. Selecting or
excluding descendants never creates new group roots. Grouping can remove an
otherwise eligible cross-selection pair if both leaves share the same root;
an excluded descendant does not exclude its entire root group.

## What the report means

Every report contains `scopeSummary`:

- `mode`: the policy actually evaluated.
- `selectedLeafCount`: unique active leaves matched by selection before hidden
  filtering or exclusions.
- `excludedLeafCount`: unique active leaves matched by exclusions before hidden
  filtering. This may overlap the selected count.
- `eligibleLeafCount`: leaves participating after visibility, exclusion and mode
  filtering. It includes an eligible empty part even when it supplies no bodies.
- `eligiblePairCount`: actual body pairs admitted by scope, internal-pair and grouping policies;
  equal to `potentialPairCount`, and to native-tested plus bounds-excluded pairs.

`componentCount` continues to count participants that supplied actual native
bodies. The leaf counts are declaration counts, not measures of material or
successful native queries. Per-pair volume, distance, tolerance, ownership and
failure semantics remain unchanged.

## Editor behavior

The panel offers an unchecked **Incluir cuerpos de una misma pieza** option,
the three modes and separate multiple-selection lists for
components and exclusions. Entries show their full name ancestry and complete
occurrence paths, distinguishing repeated display names. Suppressed
and hidden states are indicated. Choosing all components clears the selected
list explicitly; exclusions remain active. Each list has an explicit clear
control. Selecting no component in a selected mode disables inspection.

Changing scope, clearance, hidden, grouping or within-component policy removes the old report and highlight.
Reply admission includes the complete scope and both flags in the options signature, together
with the unchanged committed document and request generation. Controls are
disabled during preview/operations, and cancellation invalidates a pending reply.
Obsolete references stay visible for explicit removal and fail worker admission;
they are not silently assigned to a new revision. History, recovery, saved bytes,
visibility and document format remain unchanged by inspection or selection.

The report echoes the within-component policy actually evaluated. Inspection
does not save the option or modify geometry, visibility, document history or
recovery. The same native Common, distance, tolerance and admission budgets
apply to internal and cross-component pairs.

This does not implement interference unions, inferred group boundaries or
continuous collision detection. Executed evidence
and its platform limits belong in [VALIDATION.md](VALIDATION.md).
