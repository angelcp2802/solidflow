# Owned STEP base solids

Use **Archivo → Importar STEP…** to start a part from a `.step` or `.stp` file.
The complete candidate is read and built before the current part is replaced.
If the current part has unsaved changes, the replacement decision appears after
that validation. Cancelling, invalid input or a document/edit change during the
operation leaves the current document in place. Finish an active edit first.

The imported solid becomes the first solid operation in the tree. Select its
planar faces to create sketches or holes, or its edges for a finish operation.
New operations use the same exact BRep construction and reference checks as
authored parts. The import preserves geometry and placement; it does not
reconstruct the original design history. The base can be renamed, suppressed
or deleted using the existing feature workflow.

Save the result as `.solidflow`. The document owns the exact STEP bytes and
their SHA-256 integrity digest; it does not add the selected filesystem path or
require that file on reopening, rebuilding or exporting. Import does not grant
write access to the original STEP. Export uses the committed document rather
than an outstanding preview. Source replacement changes the base's reference
identity: stale downstream selections must be diagnosed and reselected, never
reattached to the nearest face.

The original bytes can contain author names, file names or other STEP metadata.
They are preserved exactly, so review a document before sharing it; omitting a
filesystem-path field does not anonymize the imported content.

## Acceptance and limits

The initial import contract accepts exactly one valid, positive-volume closed
solid without extra free shells, faces, wires, edges or vertices. Open surfaces,
multiple solids, incomplete transfers and corrupt files are rejected with a
diagnostic. Assemblies, colors, materials, PMI, external resources and original
feature-history recovery are outside this operation's current scope.

The maximum source size is 8 MiB. Base64 expansion fits a source of that size
inside the desktop's 20 MiB document limit; later features still count toward
that limit. Browser recovery storage has its own smaller quota. If recovery
cannot be written, the app reports the failure and asks the user to save a file;
the in-memory part remains available. A recovery warning is not a saved backup.

Units are explicit: source representation contexts must declare supported
length units and the native reader targets millimetres. Missing, conflicting
or unsupported unit declarations are rejected instead of guessed. Current
unit cases and parser boundaries must be read together with the tests and
[validation record](VALIDATION.md); a successful conversion is not a claim of
support for every STEP schema or unit system.

The unit gate currently accepts SI millimetres, SI metres and a declared
conversion-based length scale of 25.4 mm per unit. It follows referenced
representation contexts and conversion factors rather than interpreting a
unit's display name. Differing length scales across 3D contexts are rejected.
It accepts a bounded Part 21 header followed by a single DATA section, with
at most 100,000 entities, 600,000 tokens and nesting depth 32. Strings and
comments cannot introduce unit entities. This gate is not a full EXPRESS schema
validator; successful native transfer and BRep validation are also required.

The version-1 document feature is additive. Existing documents keep their
previous behavior. Older builds that do not know `importedSolid` reject the
new feature explicitly; forward compatibility is not promised. The native
reader and its temporary virtual file have an explicit lifetime on both success
and failure. No native handles or worker cache are serialized.

## Independent geometric expectations

The synthetic fixtures use millimetres unless a source unit is stated. Their
parameters and expectations are authored for the project, independently of the
reader under test.

| Case | Expected result |
| --- | --- |
| Box from `(0,0,0)` to `(10,6,4)` | One solid, volume `240 mm³`, area `248 mm²`. |
| Same box translated by `(12,-4,7)` | Bounds `(12,-4,7)`–`(22,2,11)`, same volume/area. |
| Cylinder `r=3`, `h=8` | Volume `72π mm³`, area `66π mm²`, bounds `(-3,-3,0)`–`(3,3,8)`. |
| Box with through-hole `r=1` at `(5,3)` | Volume `240−4π`, area `248+6π`; box bounds unchanged. |
| Hole edited to `r=1.5` | Volume `240−9π`, area `248+15π/2`. |
| Inch box `1×0.5×0.25` | Millimetre dimensions `25.4×12.7×6.35`, volume `2048.383`, area `1129.03`. |
| Metre box `0.01×0.006×0.004` | The same geometry as the 10×6×4 mm box. |

Document reopening, selected face/edge persistence, downstream reconstruction,
STEP export comparison and invalid-input cases are separate regression scopes.
The public fixtures and round trips use the project's OpenCascade runtime; they
do not by themselves establish interoperability with an independent CAD kernel.
Helper transaction tests, IPC tests, actual file-dialog/editor interaction and
the initial Electron-loader smoke are also separate evidence types.

See [issue #12](https://github.com/angelcp2802/solidflow/issues/12) for the proposal,
acceptance evidence and remaining import work.
