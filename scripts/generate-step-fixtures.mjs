import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import initOpenCascade from 'replicad-opencascadejs';
import { setOC, exportSTEP, makeBox, makeCylinder, makeCompound, makeLine, weldShellsAndFaces } from 'replicad';
// Original synthetic geometry, GPL-3.0-only; run with Node 24 from the repo.
const output = new URL('../src/cad/fixtures/step-import/', import.meta.url);
await mkdir(output, { recursive: true });
const oc = await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined });
setOC(oc);
const manifest = [];
function sanitize(text, name) {
  return text.replace(/FILE_NAME\([\s\S]*?\);/, `FILE_NAME('${name}','2000-01-01T00:00:00',('SolidFlow contributors'),('SolidFlow'),'Open CASCADE STEP processor','SolidFlow synthetic fixture','');`);
}
async function emit(name, owned, { unit = 'MM', parameters, expected } = {}) {
  try {
    const raw = await exportSTEP(owned.map(shape => ({ shape, name: 'Original synthetic fixture' })), { unit, modelUnit: unit }).text();
    const text = sanitize(raw, name), bytes = Buffer.from(text, 'utf8');
    await writeFile(new URL(name, output), bytes);
    manifest.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), producer: 'Replicad 1.1.0 / replicad-opencascadejs 1.1.0, same kernel as importer', sourceUnits: unit, parameters, expected });
  } finally { owned.forEach(shape => shape.delete()); }
}
await emit('box-mm.step', [makeBox([0,0,0],[10,6,4])], { parameters: { dimensions: [10,6,4] }, expected: { volume: 240, area: 248, bounds: [[0,0,0],[10,6,4]] } });
await emit('box-translated-mm.step', [makeBox([0,0,0],[10,6,4]).translate([12,-4,7])], { parameters: { dimensions: [10,6,4], translation: [12,-4,7] }, expected: { volume: 240, area: 248, bounds: [[12,-4,7],[22,2,11]] } });
await emit('box-rotated-mm.step', [makeBox([0,0,0],[10,6,4]).rotate(90,[0,0,0],[0,0,1]).translate([12,-4,7])], { parameters: { dimensions: [10,6,4], rotationZDegrees: 90, translation: [12,-4,7] }, expected: { volume: 240, area: 248, bounds: [[6,-4,7],[12,6,11]] } });
await emit('cylinder-mm.step', [makeCylinder(3,8)], { parameters: { radius: 3, height: 8 }, expected: { volume: 72*Math.PI, area: 66*Math.PI, bounds: [[-3,-3,0],[3,3,8]] } });
await emit('box-inch.step', [makeBox([0,0,0],[1,0.5,0.25])], { unit: 'INCH', parameters: { dimensions: [1,0.5,0.25] }, expected: { volume: 2048.383, area: 1129.03, bounds: [[0,0,0],[25.4,12.7,6.35]] } });
await emit('box-meter.step', [makeBox([0,0,0],[0.01,0.006,0.004])], { unit: 'M', parameters: { dimensions: [0.01,0.006,0.004] }, expected: { volume: 240, area: 248, bounds: [[0,0,0],[10,6,4]] } });
const openBox = makeBox([0,0,0],[10,6,4]), faces = openBox.faces;
try { await emit('open-shell-mm.step', [weldShellsAndFaces(faces.slice(0,5))], { parameters: { originalBox: [10,6,4], omittedFaceOrdinal: 5 }, expected: { reject: 'No closed solid' } }); }
finally { faces.forEach(face => face.delete()); openBox.delete(); }
await emit('multiple-solids-mm.step', [makeBox([0,0,0],[10,6,4]), makeBox([20,0,0],[22,2,2])], { parameters: { firstDimensions: [10,6,4], secondBounds: [[20,0,0],[22,2,2]] }, expected: { reject: 'Two solids' } });
const solid = makeBox([0,0,0],[10,6,4]), edge = makeLine([20,0,0],[21,0,0]), compound = makeCompound([solid, edge]);
try { await emit('solid-and-free-edge-mm.step', [compound], { parameters: { box: [10,6,4], freeEdge: [[20,0,0],[21,0,0]] }, expected: { reject: 'Free edge outside solid' } }); }
finally { solid.delete(); edge.delete(); }
const broken = Buffer.from('ISO-10303-21;\nHEADER;\n', 'ascii');
await writeFile(new URL('truncated.step', output), broken);
manifest.push({ name: 'truncated.step', bytes: broken.length, sha256: createHash('sha256').update(broken).digest('hex'), producer: 'Original authored invalid text', expected: { reject: 'Truncated header' } });
await writeFile(new URL('manifest.json', output), JSON.stringify({ provenance: 'Original analytical synthetic fixtures authored for SolidFlow. OpenCascade writer and reader probes use the same kernel; geometry expectations are independent formulas. This does not independently prove cross-implementation interoperability.', fixtures: manifest }, null, 2));
console.log(`Generated ${manifest.length} original STEP fixtures.`);
