# Original STEP import fixtures

These analytical synthetic models were authored for SolidFlow and are distributed
under GPL-3.0-only. They contain no private model, personal path or proprietary
source. Header metadata uses fixed project attribution and a fixed timestamp.

Regenerate with Node 24 and the locked dependencies:

```sh
node scripts/generate-step-fixtures.mjs
```

The producer is Replicad 1.1.0 / replicad-opencascadejs 1.1.0. It uses the same
OpenCascade implementation as the importer; this is **not** independent producer
interoperability evidence. Expected volume, area and bounds are independent
analytical formulas. `manifest.json` records exact parameters, original length
units, byte counts and SHA-256 for every file. Tests verify those hashes.

| Fixture | Geometry / expected millimeter result |
| --- | --- |
| box-mm | Box 10×6×4; V=240, A=248; bounds (0,0,0)→(10,6,4). |
| box-translated-mm | Same box translated (12,-4,7); bounds (12,-4,7)→(22,2,11). |
| box-rotated-mm | Same box rotated 90° about Z then translated (12,-4,7); bounds (6,-4,7)→(12,6,11). |
| cylinder-mm | R3, height8; V=72π, A=66π; bounds (-3,-3,0)→(3,3,8). |
| box-inch | Explicit conversion-based inch: 1×0.5×0.25 in; mm bounds 25.4×12.7×6.35, V=2048.383, A=1129.03. |
| box-meter | Explicit SI meter: .01×.006×.004 m; mm result equals box-mm. |
| open-shell-mm | Five of six original box faces welded into an open shell; reject. |
| multiple-solids-mm | Box plus separate 2×2×2 box at (20,0,0); reject. |
| solid-and-free-edge-mm | Box plus separate edge (20,0,0)→(21,0,0); reject despite one valid solid. |
| truncated | Original incomplete Part 21 header, authored directly as ASCII; reject. |

CAD tests check BRep validity, one solid, formulas and bounds with absolute
mass/area/bounds tolerance 5e-6 in the corresponding mm units. Selection tests
use coordinate tolerance 5e-7 mm. Those tolerances apply to these small fixtures,
not arbitrary STEP files. The modified box hole has V=240−4π, A=248+6π at R1,
and V=240−9π, A=248+7.5π at R1.5. A selected R1 vertical corner fillet has
V=240−4+π and A=248−10+2.5π.
