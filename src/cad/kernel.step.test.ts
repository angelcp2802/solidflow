import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { afterEach, beforeAll, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import { importStepSolid } from './kernel.step';
import { createStepSource, decodeStepSource } from '../model/stepSource';
import { addFeature, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature } from '../model/document';
import type { CadResult, Feature, HoleFeature, ImportedSolidFeature } from './kernel.types';

const engine = new CadEngine(), tolerance = 5e-6, coordinateTolerance = 5e-7;
type Metrics = { volume: number; area: number; bounds: number[][] };
const box: Metrics = { volume: 240, area: 248, bounds: [[0,0,0],[10,6,4]] };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000);
afterEach(() => engine.dispose());
async function fixture(name = 'box-mm.step') { return new Uint8Array(await readFile(new URL(`./fixtures/step-import/${name}`, import.meta.url))); }
async function base(name = 'box-mm.step'): Promise<ImportedSolidFeature> { return { id: 'import', type: 'importedSolid', name: 'Base importada', source: createStepSource(await fixture(name)), suppressed: false }; }
async function document(name = 'box-mm.step') { return addFeature(createDocument('Original synthetic STEP'), await base(name)); }
function good(features: Feature[]) { const result = engine.build(features); expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]); return result; }
function measure(shape: Shape3D): Metrics {
  const oc=getOC(), analyzer=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false), solids=shape.solids;
  const mass=new oc.GProp_GProps(), surface=measureShapeSurfaceProperties(shape), bounds=shape.boundingBox;
  try {
    expect(analyzer.IsValid()).toBe(true); expect(solids).toHaveLength(1);
    oc.BRepGProp.VolumeProperties(shape.wrapped,mass,1e-10,false,false);
    return {volume:mass.Mass(),area:surface.area,bounds:bounds.bounds};
  } finally { bounds.delete(); surface.delete(); mass.delete(); solids.forEach(solid=>solid.delete()); analyzer.delete(); }
}
function metrics(actual: Metrics, expected: Metrics) {
  expect(Math.abs(actual.volume-expected.volume)).toBeLessThan(tolerance); expect(Math.abs(actual.area-expected.area)).toBeLessThan(tolerance);
  actual.bounds.forEach((side,i)=>side.forEach((value,j)=>expect(Math.abs(value-expected.bounds[i][j])).toBeLessThan(tolerance)));
}
async function exported(expected: Metrics, features?: Feature[]) {
  const source=createStepSource(new Uint8Array(await engine.export('step',features).arrayBuffer())), shape=importStepSolid(source);
  try { metrics(measure(shape),expected); } finally { shape.delete(); }
}
function top(result: CadResult) { const found=result.faces!.filter(face=>face.frame&&face.frame.normal[2]>.99); expect(found).toHaveLength(1); return found[0]; }
function hole(result: CadResult): HoleFeature {
  const frame=top(result).frame!;
  // Face frame axes are measured independently from the world center (5,3,4).
  const delta=[5-frame.origin[0],3-frame.origin[1],4-frame.origin[2]], x=frame.xDirection;
  const y=[frame.normal[1]*x[2]-frame.normal[2]*x[1],frame.normal[2]*x[0]-frame.normal[0]*x[2],frame.normal[0]*x[1]-frame.normal[1]*x[0]];
  return {id:'hole',name:'Taladro R1',type:'hole',baseFeatureId:'import',support:{kind:'face',face:top(result).ref},positions:[{id:'center',x:delta.reduce((sum,v,i)=>sum+v*x[i],0),y:delta.reduce((sum,v,i)=>sum+v*y[i],0)}],reversed:false,diameter:2,head:{kind:'simple'},endCondition:{kind:'throughAll'},suppressed:false};
}
function holeMetrics(radius:number):Metrics { return {...box,volume:240-4*Math.PI*radius*radius,area:248-2*Math.PI*radius*radius+8*Math.PI*radius}; }

it('checks byte-level provenance for every original fixture',async()=>{
  const manifest=JSON.parse(await readFile(new URL('./fixtures/step-import/manifest.json',import.meta.url),'utf8'));
  for(const item of manifest.fixtures){const bytes=await fixture(item.name);expect(bytes.length).toBe(item.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);}
});
it.each([
  ['box-mm.step',box],
  ['box-translated-mm.step',{...box,bounds:[[12,-4,7],[22,2,11]]}],
  ['box-rotated-mm.step',{...box,bounds:[[6,-4,7],[12,6,11]]}],
  ['cylinder-mm.step',{volume:72*Math.PI,area:66*Math.PI,bounds:[[-3,-3,0],[3,3,8]]}],
  ['box-inch.step',{volume:2048.383,area:1129.03,bounds:[[0,0,0],[25.4,12.7,6.35]]}],
  ['box-meter.step',box],
] as const)('imports %s with analytical BRep/mass/area/placement, reopens exact bytes and exports a fresh snapshot',async(name,expected)=>{
  const doc=await document(name), before=structuredClone(doc), result=good(doc.features);
  expect(doc).toEqual(before); expect(Math.abs(result.volume-expected.volume)).toBeLessThan(tolerance);
  const feature=doc.features[0] as ImportedSolidFeature, shape=importStepSolid(feature.source);
  try {metrics(measure(shape),expected as Metrics);}finally{shape.delete();}
  const reopened=parseDocument(serializeDocument(doc)), rebuilt=good(reopened.features);
  expect(rebuilt.faces?.map(face=>face.ref)).toEqual(result.faces?.map(face=>face.ref)); expect(rebuilt.edges.map(edge=>edge.ref)).toEqual(result.edges.map(edge=>edge.ref));
  expect(decodeStepSource((reopened.features[0] as ImportedSolidFeature).source)).toEqual(await fixture(name));
  await exported(expected as Metrics,reopened.features);
});
it('retains actual cylinder BRep geometry rather than triangulating it',async()=>{
  const shape=importStepSolid((await base('cylinder-mm.step')).source),faces=shape.faces;
  try {expect(faces.map(face=>face.geomType).sort()).toEqual(['CYLINDRE','PLANE','PLANE'].sort());}finally{faces.forEach(face=>face.delete());shape.delete();}
});
it('agrees with an independently specified box by symmetric difference, in addition to formulas',async()=>{
  const shape=importStepSolid((await base()).source),oracle=makeBox([0,0,0],[10,6,4]);
  const a=shape.cut(oracle),b=oracle.cut(shape);
  try {const ma=measureShapeVolumeProperties(a),mb=measureShapeVolumeProperties(b);try{expect(Math.abs(ma.volume)+Math.abs(mb.volume)).toBeLessThan(tolerance);}finally{ma.delete();mb.delete();}}finally{a.delete();b.delete();oracle.delete();shape.delete();}
});
it('modifies an imported planar face with a through hole and edits its radius after save/reopen',async()=>{
  const doc=await document(),initial=good(doc.features),operation=hole(initial),withHole=addFeature(doc,operation),first=good(withHole.features);
  expect(first.holes![0].frame.normal[2]).toBeCloseTo(1,7); await exported(holeMetrics(1));
  const reopened=parseDocument(serializeDocument(withHole)),edited=updateFeature(reopened,'hole',{diameter:3});
  const changed=good(edited.features);expect(Math.abs(changed.volume-(240-9*Math.PI))).toBeLessThan(tolerance);await exported(holeMetrics(1.5));
  expect((edited.features[0] as ImportedSolidFeature).source).toEqual((doc.features[0] as ImportedSolidFeature).source);
  expect((edited.features[1] as HoleFeature).support).toEqual(operation.support);
});
it('reopens a selected imported edge and applies a real R1 corner fillet',async()=>{
  const doc=await document(),initial=good(doc.features),corner=initial.edges.filter(edge=>edge.lines.every((value,index)=>index%3===0?Math.abs(value-10)<coordinateTolerance:index%3===1?Math.abs(value-6)<coordinateTolerance:true));
  expect(corner).toHaveLength(1);
  const finished=addFeature(doc,{id:'fillet',name:'R1',type:'fillet',baseFeatureId:'import',size:1,selection:{mode:'selected',edges:[corner[0].ref]},suppressed:false});
  good(parseDocument(serializeDocument(finished)).features);await exported({...box,volume:240-4+Math.PI,area:248-10+2.5*Math.PI});
});
it('invalidates saved face and edge references when the imported source bytes change',async()=>{
  const doc=await document(),initial=good(doc.features),withHole=addFeature(doc,hole(initial));
  const replacement=(await base('box-translated-mm.step')).source;
  const changed=updateFeature(withHole,'import',{source:replacement});
  expect(engine.build(changed.features).featureErrors[0].message).toMatch(/selección|cara/);expect(()=>engine.export('step')).toThrow(/errores/);
  const edgeDoc=addFeature(doc,{id:'fillet',name:'R1',type:'fillet',baseFeatureId:'import',size:1,selection:{mode:'selected',edges:[initial.edges[0].ref]},suppressed:false});
  expect(engine.build(updateFeature(edgeDoc,'import',{source:replacement}).features).featureErrors[0].message).toMatch(/selección|arista/);
});
it('propagates suppression/deletion and records import/dependent edits in detached undo/redo snapshots',async()=>{
  const empty=createDocument(),doc=addFeature(empty,await base()),initial=good(doc.features),withHole=addFeature(doc,hole(initial));
  const suppressed=updateFeature(withHole,'import',{suppressed:true}),result=engine.build(suppressed.features);
  expect(result.featureErrors).toEqual([]);expect(result.volume).toBe(0);expect(result.warnings.length).toBeGreaterThan(0);
  expect(removeFeature(withHole,'import').features).toEqual([]);
  const history=new DocumentHistory(empty);history.apply(doc);history.apply(withHole);good(history.undo().features);expect(history.undo()).toEqual(empty);history.redo();good(history.redo().features);await exported(holeMetrics(1));
});
it.each(['open-shell-mm.step','multiple-solids-mm.step','solid-and-free-edge-mm.step','truncated.step'])('rejects %s without modifying input and prevents export',async name=>{
  const feature=await base(name),before=structuredClone(feature),result=engine.build([feature]);
  expect(result.featureErrors).toHaveLength(1);expect(result.volume).toBe(0);expect(feature).toEqual(before);expect(()=>engine.export('step')).toThrow(/errores/);
});
it('rejects missing units and external references before creating a native virtual file',async()=>{
  const text=new TextDecoder().decode(await fixture()),before=getOC().FS.readdir('/').filter((name:string)=>name.startsWith('solidflow-import-'));
  for(const changed of [text.replace(/GLOBAL_UNIT_ASSIGNED_CONTEXT\s*\(\([^)]+\)\)/,'').replace("'3D Context with UNIT and UNCERTAINTY'","'GLOBAL_UNIT_ASSIGNED_CONTEXT((#346))'"),text.replace('ENDSEC;\nEND-ISO-10303-21;',"#9999=EXTERNAL_SOURCE('untrusted');\nENDSEC;\nEND-ISO-10303-21;")]){
    expect(()=>importStepSolid(createStepSource(new TextEncoder().encode(changed)))).toThrow(/STEP:/);
  }
  expect(getOC().FS.readdir('/').filter((name:string)=>name.startsWith('solidflow-import-'))).toEqual(before);
});
it('cleans virtual files across repeated native success/failure and rejects a digest mismatch',async()=>{
  const before=getOC().FS.readdir('/').filter((name:string)=>name.startsWith('solidflow-import-'));
  for(let i=0;i<4;i++){good([(await base())]);engine.build([await base('open-shell-mm.step')]);}
  expect(getOC().FS.readdir('/').filter((name:string)=>name.startsWith('solidflow-import-'))).toEqual(before);
  const feature=await base();feature.source.sha256='0'.repeat(64);expect(engine.build([feature]).featureErrors[0].message).toMatch(/SHA|huella|contenido/);
});
it('rejects an unsupported native geometric entity after the unit gate and cleans its virtual file',async()=>{
  const bytes=new TextEncoder().encode(new TextDecoder().decode(await fixture()).replace('MANIFOLD_SOLID_BREP','UNSUPPORTED_SOLID_BREP'));
  const before=getOC().FS.readdir('/').filter((name:string)=>name.startsWith('solidflow-import-'));
  expect(()=>importStepSolid(createStepSource(bytes))).toThrow(/STEP:/);
  expect(getOC().FS.readdir('/').filter((name:string)=>name.startsWith('solidflow-import-'))).toEqual(before);
});
it('exports a committed owned snapshot while a newer invalid preview remains rejected',async()=>{
  const committed=await document();good(committed.features);
  const preview=await document('multiple-solids-mm.step');expect(engine.build(preview.features).featureErrors).toHaveLength(1);
  await exported(box,parseDocument(serializeDocument(committed)).features);
  expect(()=>engine.export('step')).toThrow(/errores/);
});
it('enforces first-solid ownership at runtime even for suppressed predecessors and second imports',async()=>{
  const imported=await base(),sketch:Feature={id:'sketch',name:'Sketch',type:'sketch',plane:'XY',offset:0,profile:{kind:'rectangle',width:2,height:2,center:[0,0]},suppressed:false};
  const solid:Feature={id:'solid',name:'Solid',type:'extrude',sketchId:'sketch',depth:2,symmetric:false,suppressed:true};
  expect(engine.build([sketch,solid,imported]).featureErrors[0].message).toMatch(/primera/);
  expect(engine.build([imported,{...imported,id:'second',suppressed:true}]).featureErrors[0].message).toMatch(/primera/);
  expect(engine.build([imported,{...imported,id:'second'}]).volume).toBeCloseTo(240,6);expect(()=>engine.export('step')).toThrow(/errores/);
  good([sketch,imported]);
});
