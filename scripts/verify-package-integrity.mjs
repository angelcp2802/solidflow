/** Compare packaged sources to the current build without executing the portable. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const asar = createRequire(import.meta.url)("@electron/asar");
const sourcePackage = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
const version = sourcePackage.version;
const minorVersion = version.split(".").slice(0, 2).join(".");
const archivePath = "release/win-unpacked/resources/app.asar";
const archive = path.join(root, archivePath);
const packaged = JSON.parse(
  asar.extractFile(archive, "package.json").toString("utf8"),
);
assert.equal(packaged.version, version, "Packaged version must match source");
const assets = (await readdir(path.join(root, "dist/assets"))).sort();
const paths = [
  "dist/index.html",
  "dist/solidflow.svg",
  ...assets.map((name) => `dist/assets/${name}`),
  "electron/main.cjs",
  "electron/preload.cjs",
  "build/icon.ico",
];
const files = [];
for (const file of paths) {
  const built = await readFile(path.join(root, file));
  const packed = asar.extractFile(archive, path.normalize(file));
  assert.ok(built.equals(packed), `Packaged bytes differ: ${file}`);
  files.push({
    path: file,
    bytes: packed.length,
    sha256: createHash("sha256").update(packed).digest("hex"),
  });
}
const report = {
  version,
  archive: archivePath,
  status: "PASS",
  files,
  portableExecuted: false,
  scope: "Read-only comparison of packaged app.asar to built files",
};
const reportPath = `artifacts/package-integrity-${minorVersion}.json`;
await writeFile(
  path.join(root, reportPath),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    status: report.status,
    version,
    files: files.length,
    report: reportPath,
  }),
);
