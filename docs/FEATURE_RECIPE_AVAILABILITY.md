# Feature recipe availability and explicit repair

Normal solid operations, copying historical material and regenerating a recipe
have separate capabilities. A working Hole, revolution or finishing operation
does not imply a corresponding regeneration recipe. The native gates in
`featureRecipes.ts` remain authoritative; this UI increment adds no recipe,
parameter, document grammar or native acceptance rule.

## Finite availability inventory

| Seed metadata | Selected regeneration | ALL/AUTO regeneration |
| --- | --- | --- |
| Explicit cut, intrinsic rectangle/circle or real solved entities | Existing admitted subset, subject to native profile, limit and ownership checks | Existing admitted cut subset |
| Merge extrusion with the same intrinsic profiles | Existing admitted subset | Only the existing primitive rectangle/circle Blind subset accepted by `isInitialAdditiveAllRecipe` |
| New-body extrusion or legacy operations without explicit owners | Unavailable recipe; normal operation/body-copy capabilities remain separate | Unavailable recipe |
| Revolution/revolved cut, Hole, fillet/chamfer, shell/draft, sweep/loft, Combine | Existing `OPERATION_RECIPE_PENDING` gate; normal commands retain their capabilities | Same gate |
| Pattern seed or imported solid/body source | No corresponding regeneration recipe; existing copy semantics remain separate | Same gate |
| Associated sketch support, active face/datum end limit | Existing correspondence/policy gates; no implicit reference remapping | Same limits |

Selected principal-plane UpToSurface remains selectable so its existing fixed
world-policy control can be supplied. An inactive second limit is ignored where
the existing extractor ignores it. A current missing-policy error for an active
principal-plane limit names the exact direction, plane and checkbox in
**Planos límite**. The worker diagnostic and the verified-preview gate
retain their original values. Positive ALL/AUTO still reject own
end-condition, thin-wall or second-direction declarations, including retained
OFF second-direction data. This UI check reuses the same pure additive
eligibility helper; it does not normalize saved fields.

Depth and sketch dimension assignments keep the explicit
clear-before-scope-change contract. The [anchored rectangle extension](FEATURE_REGENERATION.md#driving-rectangle-dimensions-per-instance)
adds width and height for the stated Blind cut or merge. The depth table
also applies to a closed, solved entity profile, retaining that source section.
Angle, equation and other drivers retain their separate requirements.

## Selection and repair

The UI blocks new incompatible seed, method and ALL/AUTO selections and explains
the known metadata limitation. Geometry-copy mode keeps its existing choices.
An already chosen unsupported, suppressed or missing source remains visible
and removable, subject to the existing loading/variation guards. A stored
method or scope is displayed without automatically replacing it. Availability
never changes seed definitions, targets, bindings, document history or files.

The original repair case opens a structurally valid Hole regeneration request
that the unchanged native gate rejects. Editing and Cancel retain it exactly.
Only explicit source replacement and Apply repair it; Undo restores the prior
unavailable declaration. Save As creates an independent repaired file and Open
reconstructs it. The original input and unavailable document are not overwritten.

Metadata inspection uses an indexed historical prefix and at most 32 selected
IDs. The history slice/index is memoized across ordinary draft-field changes.
No closure extraction, constraint solve or native work is added to availability
rendering. This is a bounded-work property, not a measured latency improvement.
Native previews, currentness, applicability and atomic publication still decide
whether Apply is possible.

## Local acceptance and the broader project goal

The initial 7 November ledger (`5b65187`) defined C05 through nine normal solid
families and their documented supported variants. The frozen public `ce27324`
also already retained additive ALL, AUTO/variation and broader regeneration as
required work in their existing contracts. The 10 November follow-up added
explicit references to solved constraints and additional recipe parameters.
Those requirements must not be erased by an availability fix or expanded into
unselected universal CAD scope.

This increment addresses the demonstrated enabled-choice mismatch and explicit
repair. The remaining C05 recipe/reference/lifecycle requirements stay in
[FEATURE_RECIPES](FEATURE_RECIPES.md) and
[FEATURE_REGENERATION](FEATURE_REGENERATION.md). The body-catalogue,
legacy-adoption and broader interaction contract in issue #26 remains open.
The finite local gate retains its remaining scope decision. Source-specific
results and their limits belong in [VALIDATION](VALIDATION.md).
