# Third-party notices

SolidFlow's GPL-3.0-only license applies to project code. Dependencies retain
their original copyrights and licenses. Original runtime license texts are in
[licenses/](licenses/), and [licenses/manifest.json](licenses/manifest.json)
records versions from the committed lockfile. Do not remove these notices from
redistributed builds.

| Component | License |
| --- | --- |
| React, React DOM, Scheduler, Three.js, Replicad | MIT |
| OpenType.js, tiny-inflate, string.prototype.codepointat and runtime type packages | MIT |
| Lucide React, Flatbush, Flatqueue | ISC; Lucide's complete notice also preserves its Feather MIT attribution |
| replicad-opencascadejs 1.1.0 | LGPL-2.1-only |
| Electron 44.9.3 | MIT, with Chromium and other third-party notices |

Electron distributions include `LICENSE.electron.txt` and
`LICENSES.chromium.html`. Preserve those complete files. Development tools also
have their own licenses: TypeScript is Apache-2.0; Vite, Vitest and
Electron Builder are MIT. Their presence does not relicense them as project code.

## CAD library source

The application uses the unmodified `replicad-opencascadejs@1.1.0` npm package.
Its package metadata records source commit
`e4b05f67dc4e2393a876ce8c5064a9c93db05bf1`. The source and build configuration are
available in [the upstream Replicad repository at that commit](https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1/packages/replicad-opencascadejs).
The package's original LGPL text is included locally. Its build scripts identify
the OpenCascade.js toolchain. Preserve corresponding source access, build
instructions, notices and applicable library replacement rights when distributing
binaries. A stable binary release requires a corresponding-source distribution
review; CI validates packaging without uploading binaries until that source bundle
is verified.

See [CAD runtime source and identity](docs/CAD_RUNTIME_SOURCE.md) for the verified
package/file identities, pinned upstream inputs and remaining rebuild, replacement
and recipient-download work. Source acquisition is not a completed source release.
