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
