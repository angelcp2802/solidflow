/** Check packaged application files, CAD runtime and notices against the build. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
const [resourcesPath = "release/win-unpacked/resources", ...extraArgs] = process.argv.slice(2);
assert.equal(extraArgs.length, 0, "Usage: node scripts/verify-package-integrity.mjs [resources-directory]");
const resources = path.resolve(root, resourcesPath);
const archive = path.join(resources, "app.asar");
const archivePath = path.relative(root, archive);
const packaged = JSON.parse(
  asar.extractFile(archive, "package.json").toString("utf8"),
);
assert.equal(packaged.version, version, "Packaged version must match source");
const assets = (await readdir(path.join(root, "dist/assets"))).sort();
const cadPackage = "node_modules/replicad-opencascadejs";
const variants = ["cjs", "js", "wasm"];
const omitted = variants.map((extension) => `${cadPackage}/dist/replicad_multi.${extension}`);
const members = new Set(asar.listPackage(archive));
for (const file of omitted) {
  assert.ok(!members.has(path.join(path.sep, file)), `Unexpected packaged CAD variant: ${file}`);
  await assert.rejects(lstat(path.join(`${archive}.unpacked`, file)), { code: "ENOENT" });
}
const paths = [
  "dist/index.html",
  "dist/solidflow.svg",
  ...assets.map((name) => `dist/assets/${name}`),
  "electron/main.cjs",
  "electron/preload.cjs",
  "build/icon.ico",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  `${cadPackage}/LICENSE`,
  ...variants.map((extension) => `${cadPackage}/dist/replicad_single.${extension}`),
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
const notices = [];
for (const name of (await readdir(path.join(root, "licenses"))).sort()) {
  const file = path.join("licenses", name);
  const source = await readFile(path.join(root, file));
  const packed = await readFile(path.join(resources, file));
  assert.ok(source.equals(packed), `Packaged notice differs: ${file}`);
  notices.push({
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
  notices,
  omitted,
  portableExecuted: false,
  scope: "Packaged file and notice comparison without executing the application",
};
const reportPath = `artifacts/package-integrity-${minorVersion}.json`;
await mkdir(path.dirname(path.join(root, reportPath)), { recursive: true });
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
