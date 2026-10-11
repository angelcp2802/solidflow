# Public fixture provenance

Public regression inputs under `src/cad/fixtures/solidflow-ui/` are synthetic
SolidFlow documents and STEP exports made for this project. Its README records
the origin, original names, byte counts and SHA-256 hashes of each input. The
legacy angular document is a programmatic compatibility baseline; the STEP
files are saved UI exports. They are not interchangeable kinds of evidence.

The files under `examples/` are synthetic editable demonstrations, not customer
models. Do not add confidential designs, credentials, personal paths or vendor
binaries. New fixtures must identify how they were made and how a reviewer can
check them. Do not relabel third-party output as an original project output.

The source factories under `src/examples/` generate synthetic documents from
the parameters in their code; they are separate from saved UI captures.
`sketch-fillet-prolongation.ts` defines an R10 line–arc gap and an R10/R10
two-arc gap, with fixed support geometry and rectangular closing edges. The
[fillet guide](SKETCH_FILLET.md) records the independent Cartesian contacts,
Green-integral area and perimeter formulas used to validate their R2 fillets
and 4 mm extrusions. Their tests generate documents in memory; no private model
or binary fixture is required.

`sketch-fillet-batch.ts` generates a 10×6 mm Cartesian rectangle with a 4 mm
extrusion, anchored at the sketch origin. It uses no imported geometry or
external fixture. The adjacent bottom corners are `origin` and `bottom-right`;
the adjacent left corners are `origin` and `top-left`. The
[fillet guide](SKETCH_FILLET.md) derives independent contacts, area and
perimeter by subtracting a square minus a quarter disk at each rounded corner.
The batch tests construct and reopen documents and STEP exports in memory;
these are programmatic checks, not saved UI captures.

`sketch-mirror.ts` authors an open Cartesian half-profile
`(0,0)→(5,0)→(5,6)→(0,6)` and a separate right semicircle of radius 5 mm.
Both have construction axes and original driving constraints, in millimeters.
The [mirror guide](SKETCH_MIRROR.md) gives independent rectangle, disk,
circular-hole and major-segment area/perimeter formulas for the 4 mm CAD
extrusions used in tests. These factories and in-memory document/STEP round
trips use no imported/private geometry or new binary fixtures. They are
programmatic examples, not saved interaction captures.
