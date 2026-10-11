# SolidFlow saved-document and UI-export fixtures

These project-owned regression inputs were copied byte for byte from local
verification artifacts on 2026-10-11. The STEP files were exported from the
SolidFlow desktop UI while exercising the corresponding examples.

`solidflow-0.10-angular-60-programmatic.solidflow` is the original programmatic
0.10 angular baseline used to verify serialization and driven-dimension
compatibility. Its name intentionally distinguishes it from UI captures.

The other saved `.solidflow` inputs remain in the repository `examples/`
directory. These files do not require `artifacts/` or machine-specific paths.
No test substitutes regenerated geometry when an input is missing.

The table records the exact copied bytes. The filenames retain their original
sample names. These are project-created sample documents and exports; their
reuse follows the project license, with dependency licenses remaining separate.

| File | Regression suite | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `solidflow-0.10-angular-60-programmatic.solidflow` | `kernel.driven-dimensions.test.ts` | 2203 | `310b59d03e36cdbca4e23bb849f4d3e9b420edb2bbd4d6869d2c15487722fc6a` |
| `Caja exterior abierta por dos caras.step` | `kernel.face-operations.test.ts` | 31079 | `e6c0fa21de0daa9a6f64395470c686032ff35a2e162436016a045ae81f39ca15` |
| `Desmoldeo asociado a cara superior 50 mm.step` | `kernel.face-operations.test.ts` | 16905 | `243e2920c7a5ab094471322cea56995bf1b933eb7f800274274c16b3ddac9093` |
| `Caja con apertura curva.step` | `kernel.face-operations.test.ts` | 73237 | `53769c5e0b07ea144456ee106065fe11d0d993e444ce14dbe368cc68f1795220` |
| `Placa por todo ambos sentidos.step` | `kernel.extrusion-limits.test.ts` | 20283 | `8d48f067631233857ab4a2a89e9b7f271988c897857b445f0ec9b50077431ae2` |
| `Caja con corte hasta siguiente.step` | `kernel.extrusion-limits.test.ts` | 35409 | `814fe74de5a390000894a85ac8fcd531bfec3671d8daa74846b6905c7250a5ad` |
| `Saliente hasta techo cilíndrico.step` | `kernel.extrusion-limits.test.ts` | 30556 | `51c9ce5a65513cbe25c2e99b0f74836fdd411a4791f1579c7df8f3d315b08e99` |
| `Cinco taladros hasta punta.step` | `kernel.holes.test.ts` | 50104 | `9a4231902f74bf7f86715048654f9bffb984e1ced6bdfd1c3e21faf01a10ae03` |
| `Placa con taladros refrentados.step` | `kernel.holes.test.ts` | 50406 | `f52284718c6de3a8a8403d92f94cde85d17fe9924e21b2daec64fec4099e69ce` |
| `Placa con taladros avellanados.step` | `kernel.holes.test.ts` | 46551 | `ac11c738827e9aff069a25afa2198ed84340125394ef843f80d6ecf7e81f7498` |
| `Caja con dos taladros pasantes.step` | `kernel.holes.test.ts` | 51272 | `c5fb874371f34ad3b4256216d91320e9f65b4f3c385cc03d4ca7e10fdf19f613` |
| `Brida circular de tres taladros inversa.step` | `kernel.patterns.test.ts` | 17097 | `85226f1727ce7b69081e1d60d1f280aa5d0c591b160575e6f088485e6837501d` |
