# CAD runtime source and identity

This record supports [the corresponding-source review](https://github.com/angelcp2802/solidflow/issues/5).
It identifies the inspected npm runtime and source inputs as of 2026-10-25.
It does **not** establish a clean rebuild, a complete corresponding-source bundle,
or a verified library replacement procedure. Binary release source review remains open.

## npm package and inspected Windows package

SolidFlow locks `replicad-opencascadejs@1.1.0`. The complete npm tarball was
verified against the committed lockfile integrity, then its files were compared
with the installed package and an inspected local Windows `app.asar`.

- Tarball size: **15058089 bytes**.
- Tarball SHA-256: `be73ff9e1bd95f021d01d50dcfe85094e6c6d1ad876283694bbca2ef00f446d9`.
- Locked and calculated SRI: `sha512-s0KHR5V+ivsOE4nZXfuoW70lW0/rldkb3ZDY34LpXOQRFLQN5qVydQm3BRo7boZPdFkkAZBERJ+NzB0DYxrivw==`.
- Package metadata source commit: `e4b05f67dc4e2393a876ce8c5064a9c93db05bf1`.

All eight installed JS, CJS, WASM and declaration files match the tarball.
The following six runtime files also match their raw copies under
`node_modules/replicad-opencascadejs/` in the inspected ASAR:

| Package-relative file | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist/replicad_single.js` | 60124 | `018e57538fcb773f0124eae60aee4de693d3aae01c55b2b883a874911ab121c3` |
| `dist/replicad_single.wasm` | 22980267 | `4c9f22e9f3828dca6f3c95405934cdbe624e593c35266f47f392ab337478dbde` |
| `dist/replicad_single.cjs` | 107 | `e13327f9a883a467eabf1eee8635c7b3687be96dd100acb6bff8a68759b7dfff` |
| `dist/replicad_multi.js` | 67975 | `7a196c1f0627be3bb5e25b6ff948d82e14641d7be3562ce8b44183125b9e5003` |
| `dist/replicad_multi.wasm` | 22481415 | `5b8c6a25a0ee79f3e255cb56cfcb5b1d8c6d3a444efc45907e6fa4536493a208` |
| `dist/replicad_multi.cjs` | 106 | `aa0cedb3cda0466b713ae894cf0fe98c944b86852dc8701f7e0c880cd6c2877e` |

Both `dist/replicad_single.d.ts` and `dist/replicad_multi.d.ts` contain
1,617,183 bytes and have SHA-256
`b44516bd24e6abf0dbe680086e286b117d77299ea77e80f230220dc77d250b08`.
They match the installed package but are **not** included in the inspected ASAR.

The inspected ASAR has SHA-256
`815128c7bcf6e5c4856908c12640a8117a0811499ff92c1070a7e82414c8feca`.
Its two production assets below match the corresponding local Vite build:

| Production asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist/assets/kernel.worker-BsORYtvq.js` | 1346732 | `11501ad92a0506343179177244086f281cfd073911b73839178f64c4e93f4aad` |
| `dist/assets/replicad_single-B_1cTsn_.wasm` | 22980267 | `4c9f22e9f3828dca6f3c95405934cdbe624e593c35266f47f392ab337478dbde` |

The production worker contains transformed application code and upstream glue;
it is not byte-identical to the raw npm JavaScript. The production WASM retains
the raw single-threaded WASM hash. These measurements identify one local Windows
package, not every platform, future build or publicly downloadable release.

## Pinned source inputs

The package metadata, build configuration and toolchain dependency lock identify
these source commits. Each was acquired from its official HTTPS repository into
a private bare Git repository, with commit/tree inventories and archive hashes.
No upstream scripts, build or installation ran during acquisition.

| Source | Exact commit |
| --- | --- |
| [Replicad](https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1) | `e4b05f67dc4e2393a876ce8c5064a9c93db05bf1` |
| [OpenCascade.js](https://github.com/taucad/opencascade.js/tree/ebd263f15337b440b391492af073662707e86482) | `ebd263f15337b440b391492af073662707e86482` |
| [OCCT](https://github.com/Open-Cascade-SAS/OCCT/tree/b8f597c677811d1f9f4d8a97f5ae2825c0353a42) | `b8f597c677811d1f9f4d8a97f5ae2825c0353a42` |
| [RapidJSON](https://github.com/Tencent/rapidjson/tree/24b5e7a8b27f42fa16b96fc70aade9106cf7102f) | `24b5e7a8b27f42fa16b96fc70aade9106cf7102f` |
| [FreeType](https://github.com/freetype/freetype/tree/de8b92dd7ec634e9e2b25ef534c54a3537555c11) | `de8b92dd7ec634e9e2b25ef534c54a3537555c11` |

The dependency commits are recorded in upstream
[DEPS.json](https://github.com/taucad/opencascade.js/blob/ebd263f15337b440b391492af073662707e86482/DEPS.json).
Historical promotion logs record these final OCI identities for
`ghcr.io/taucad/opencascade.js`:

| Image tag | Logged digest |
| --- | --- |
| [canary-ebd263f1-single-threaded](https://github.com/taucad/opencascade.js/actions/runs/30779907989/job/91595770927) | `sha256:215198af0e2ca4c5f308e5540869f2419784dc290062d3eb03d34e4f22e0188c` |
| [canary-ebd263f1-multi-threaded](https://github.com/taucad/opencascade.js/actions/runs/30779907989/job/91595770938) | `sha256:5cb67064edc903ae50c254e32417da9662fa88ec2e734386c28a3806949862ce` |

The package scripts name tags, not digests. Image bytes, signatures and
attestations have not been independently verified, and there is no verified
attestation linking these identities to the published npm tarball's build.
Source acquisition and logged image identification alone do not establish that link.

Static inspection of Replicad's
[package scripts](https://github.com/sgenoud/replicad/blob/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1/packages/replicad-opencascadejs/package.json)
shows that `npm run build` invokes ytt to regenerate configuration. The separate
`buildSingle` and `buildMulti` scripts consume the committed generated YAML and
six C++ wrappers directly, so that route need not run ytt. It still requires the
specified toolchain and compiled inputs; neither regeneration parity nor binary
reproduction has been demonstrated.

RapidJSON's `thirdparty/gtest` and FreeType's `subprojects/dlg` submodules were
recorded but not acquired. In the inspected OpenCascade.js route, the cloned
RapidJSON and FreeType trees provide headers; their own builds are not invoked.
This omission is route-specific: FreeType's autotools bootstrap materializes dlg,
and its make rules require the copied headers. It is not a claim that those
submodules are unnecessary for every upstream build or source distribution.

## Remaining release work

A private pinned-source candidate has been assembled from canonical Git blobs:
314,030,080 bytes, SHA-256
`852288182a871854230f38def8d95b51031cc53f4dc0b7b13d57d7e99dbc76b8`.
Its manifest has SHA-256
`de1cecdb9bbc428bf56938626316fa8002f84265b83876dd8d8d9755c5f5462d`.
Independent archive inspection checked all 37,861 included upstream entries
against the pinned Git trees and their payload hashes. Two serializations of
the same inputs produced the same archive hash.

Exactly four generated Replicad runtime files are excluded: single/multi JS
glue and WASM. CJS shims, generated API declarations, build inputs, full license
files and upstream data remain; this does not establish that every retained
file is preferred editable source. Two absent gitlinks are recorded above.
Acquisition archives showed 4,384 CRLF/LF differences from Git blobs. Candidate
payloads use unchanged Git object bytes, with those differences recorded;
the original acquisitions remain intact.

The candidate has not been published or accepted as complete corresponding
source. Before closing the source review:

- Complete the source, license and transitive toolchain inventory, including
  build tools, SDK/ports and any generated or precompiled inputs actually used.
- Document and execute a clean rebuild; compare its output with the identified
  runtime and explain any differences rather than assuming reproducibility.
- Exercise replacement of the library in the packaged application and preserve
  applicable source access, notices and replacement rights.
- Publish the reviewed source deliverable and instructions through a stable
  recipient-accessible download, then verify that download and its integrity.

See [third-party notices](../THIRD_PARTY_NOTICES.md) and
[the license manifest](../licenses/manifest.json). This identity record does not
replace the original licenses or certify distribution compliance.
