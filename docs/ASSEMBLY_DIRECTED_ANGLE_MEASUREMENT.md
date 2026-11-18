# Directed angular measurement

The read-only assembly tool measures a circular angle from a first direction
to a second direction around an explicitly selected guide. Eligible references
are current principal-plane normals, native planar-face normals, geometric
cylindrical axes and canonical LINE directions. Each selection retains its
exact occurrence path, definition revision and applicable body/topology identity.
It is a separate operation from saved principal-angle interval relations.

For unit directions `a`, `b` and guide `g`, project `a` and `b` onto the plane
normal to `g` and normalize the projections to `u` and `v`. The coordinate is
`atan2(g dot (u cross v), u dot v)`, mapped to `[0, 2*pi)`. Degrees are displayed
in `[0,360)`. The positive direction follows the right-hand rule about `g`.
Swapping the first and second references, or reversing the guide, reverses the
circular coordinate. Common rigid rotation leaves it unchanged. Oblique
directions are projected; this measurement does not enforce perpendicularity,
alignment, position or any other relation between the selected supports.

The guide is never inferred from screen orientation, neighbouring relations,
face parameter axes or the current angle. No angular zero or turn counter is
captured. For example, an isolated final orientation at 90 degrees and one
reached after 450 degrees have the same circular measurement. This tool does
not itself implement directed rotation stops, continuous motion or accumulated turns.
The separate [circular stop relation](ASSEMBLY_DIRECTED_ANGLE_STOPS.md) uses
this coordinate with an explicit start/sweep arc and its own validation.
Existing `principal-direction` mates keep their saved meaning and schema.

## Native and numerical boundaries

A request contains only `scopePath`, `first`, `second` and `guide`. Its JSON-data
boundary rejects extra fields, accessors, malformed paths and incompatible
reference purposes. The worker opens an independent complete-document native
snapshot, resolves and authenticates all three references, measures their
currently placed directions and releases the snapshot before returning a report.
Stale or suppressed references reject. It never resolves by display name or
uses tessellated vertices as support evidence.

The fixed angular admission precision is `1e-8` radians. A direction parallel
to the guide has no projected azimuth and rejects. Near-parallel directions
also reject if the explicit Float64 projection or composed-frame admission
allowance exceeds that precision; the tolerance is not increased to admit them.
Those allowances are numerical admission policies, not certified error bounds
for the native geometry library. Reports include both projection lengths and
all three current unit directions so their displayed value is reviewable.

The operation owns its engines independently. Success, geometric rejection or
cleanup failure cannot consume an existing assembly preview capability or
dispose the active part engine. A cleanup failure withholds the report and
preserves the primary failure alongside the release error. A report carries
no Apply token, candidate document or saved model change.

## Interaction and validation

The panel offers three current reference lists within the selected assembly
scope. Measuring does not add a relation, history entry or dirty state.
Changes of document, scope or selection invalidate displayed results. Pending
measurement can be cancelled; a late completion cannot restore a cancelled
result or supersede a newer request. Authoring previews and staged source
updates/replacements block this measurement panel.

The original numerical, native and production-renderer cases are described in
[fixture provenance](PROVENANCE.md#directed-angular-measurement-fixtures).
Run `npm run test:desktop:assembly-angle-measurement` after building for the
isolated production-renderer workflow. It uses real worker/WASM results and
test-owned Open/Save As paths. Authored tests and configured CI are not executed
results; exact source, tolerances, failures and platform limits belong in
[the validation record](VALIDATION.md). Full assembly and demo acceptance remain
open.
