import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import type { CadResult, ExtrudeFeature, Feature, HoleFeature, SketchFeature } from './kernel.types';
import { holePositionStructure } from './kernel.holes';
import { frameDot, frameYDirection } from './kernel.frames';
import { createHoleExample } from '../examples/hole-wizard';
import { parseDocument, serializeDocument } from '../model/document';

const engine=new CadEngine();
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined})),60_000);
afterEach(()=>engine.dispose());
const uiReports:unknown[]=[];
afterAll(async()=>{
 if(process.env.SOLIDFLOW_CAD_REPORT!=='1')return;
 if(uiReports.length===uiCases.length)await writeFile(new URL('../../artifacts/verify-ui-hole-wizard-export.json',import.meta.url),JSON.stringify(uiReports,null,2)+'\n');
});
function box():Feature[]{return [{id:'profile',name:'Base',type:'sketch',plane:'XY',offset:0,profile:{kind:'rectangle',width:80,height:60,center:[0,0]},suppressed:false},
 {id:'base',name:'Base',type:'extrude',sketchId:'profile',depth:20,symmetric:false,suppressed:false}];}
function good(features:Feature[]):CadResult{const result=engine.build(features);expect(result.featureErrors).toEqual([]);expect(result.warnings).toEqual([]);return result;}
function hole(base:CadResult):HoleFeature{return{id:'hole',name:'Taladros',type:'hole',baseFeatureId:'base',suppressed:false,
 support:{kind:'face',face:base.faces!.find(face=>face.frame&&face.frame.normal[2]>.99)!.ref},positions:[{id:'p1',x:0,y:0}],reversed:false,diameter:6,
 head:{kind:'simple'},endCondition:{kind:'blind',depth:10,depthReference:'shoulder',tip:{kind:'conical',angle:118}}};}
function mass(shape:Shape3D):number{const oc=getOC(),properties=new oc.GProp_GProps();try{oc.BRepGProp.VolumeProperties(shape.wrapped,properties,1e-10,false,false);return properties.Mass();}finally{properties.delete();}}
async function step(result:CadResult){const shape=(await importSTEP(engine.export('step'))).asShape3D(),check=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false,false),solids=shape.solids;
 try{expect(check.IsValid()).toBe(true);expect(solids).toHaveLength(1);expect(mass(shape)).toBeCloseTo(result.volume,5);}finally{shape.delete();check.delete();solids.forEach(s=>s.delete());}}
const tipHeight=3/Math.tan(59*Math.PI/180);

it.each(['shoulder','tip']as const)('models an exact 118° tip with blind depth measured to the %s',async depthReference=>{
 const features=box(),operation=hole(good(features));operation.endCondition={kind:'blind',depth:10,depthReference,tip:{kind:'conical',angle:118}};
 const result=good([...features,operation]),shaftDepth=10-(depthReference==='tip'?tipHeight:0);
 expect(result.volume).toBeCloseTo(96000-Math.PI*9*(shaftDepth+tipHeight/3),6);await step(result);
 const imported=(await importSTEP(engine.export('step'))).asShape3D(),faces=imported.faces;
 try{const conical=faces.filter(face=>face.geomType==='CONE');expect(conical).toHaveLength(1);const bounds=conical[0].boundingBox;try{expect(bounds.bounds[0][2]).toBeCloseTo(20-shaftDepth-tipHeight,5);expect(bounds.bounds[1][2]).toBeCloseTo(20-shaftDepth,5);}finally{bounds.delete();}}
 finally{faces.forEach(face=>face.delete());imported.delete();}
});
it.each(['simple','counterbore','countersink']as const)('builds a %s with exact volume and a flat blind bottom',async kind=>{
 const features=box(),operation=hole(good(features));operation.endCondition={kind:'blind',depth:10,depthReference:'tip',tip:{kind:'flat'}};
 operation.head=kind==='simple'?{kind}:kind==='counterbore'?{kind,diameter:10,depth:2}:{kind,diameter:10,angle:90};
 const extra=kind==='simple'?0:kind==='counterbore'?Math.PI*(25-9)*2:Math.PI*(2*(25+15+9)/3-9*2);
 const result=good([...features,operation]);expect(result.volume).toBeCloseTo(96000-90*Math.PI-extra,6);await step(result);
});
it('keeps all centres associative when parent thickness and positions change',()=>{
 const features=box(),operation=hole(good(features));operation.positions=[{id:'left',x:-15,y:10},{id:'right',x:15,y:10}];
 const initial=good([...features,operation]);expect(initial.holes![0].frame.origin[2]).toBe(20);
 (features[1]as ExtrudeFeature).depth=30;operation.positions[1].x=20;
 const changed=good([...features,operation]);expect(changed.holes![0].frame.origin[2]).toBe(30);expect(changed.volume-initial.volume).toBeCloseTo(48000,5);
});
it('uses the historical support face when a later boss changes the current body',()=>{
 const features=box(),operation=hole(good(features));features.push({id:'boss-profile',name:'Boss',type:'sketch',plane:'XY',offset:20,profile:{kind:'circle',center:[0,0],radius:10},suppressed:false},
 {id:'boss',name:'Boss',type:'extrude',sketchId:'boss-profile',depth:10,symmetric:false,suppressed:false});operation.baseFeatureId='boss';
 const result=good([...features,operation]);expect(result.holes![0].frame.origin[2]).toBe(20);expect(result.volume).toBeCloseTo(96000+1000*Math.PI-Math.PI*9*(10+tipHeight/3),5);
});
it.each(['throughAll','untilNext']as const)('resolves %s independently for multiple centres against the same original hollow base',async kind=>{
 const features=box();(features[1]as ExtrudeFeature).depth=40;features.push({id:'shell',name:'Shell',type:'shell',baseFeatureId:'base',thickness:4,direction:'inward',removedFaces:[],suppressed:false});
 const base=good(features),operation=hole(base);operation.baseFeatureId='shell';operation.positions=[{id:'a',x:-10,y:0},{id:'b',x:10,y:0}];operation.endCondition={kind};
 const result=good([...features,operation]);expect(result.volume).toBeCloseTo(base.volume-2*Math.PI*9*(kind==='untilNext'?4:8),5);await step(result);
});
it.each(['counterbore','countersink']as const)('keeps a %s within the exact Until next shaft and rejects a head beyond the first wall',async kind=>{
 const features=box();(features[1]as ExtrudeFeature).depth=40;features.push({id:'shell',name:'Shell',type:'shell',baseFeatureId:'base',thickness:4,direction:'inward',removedFaces:[],suppressed:false});
 const base=good(features),operation=hole(base);operation.baseFeatureId='shell';operation.endCondition={kind:'untilNext'};
 operation.head=kind==='counterbore'?{kind,diameter:10,depth:4}:{kind,diameter:14,angle:90};
 const extra=kind==='counterbore'?Math.PI*(25-9)*4:Math.PI*(4*(49+21+9)/3-9*4);
 const accepted=good([...features,operation]);expect(accepted.volume).toBeCloseTo(base.volume-36*Math.PI-extra,5);await step(accepted);
 operation.head=kind==='counterbore'?{kind,diameter:10,depth:6}:{kind,diameter:18,angle:90};
 const rejected=engine.build([...features,operation]);expect(rejected.featureErrors[0].message).toMatch(/rebaje.*supera.*Hasta siguiente/);expect(rejected.volume).toBeCloseTo(base.volume,6);expect(()=>engine.export('step')).toThrow(/errores/);
});
it('computes overlapping holes with exact boolean union instead of adding removed volumes',()=>{
 const features=box(),operation=hole(good(features));operation.endCondition={kind:'blind',depth:10,depthReference:'shoulder',tip:{kind:'flat'}};operation.positions=[{id:'a',x:-2,y:0},{id:'b',x:2,y:0}];
 const intersection=18*Math.acos(2/3)-2*Math.sqrt(20),expected=96000-(18*Math.PI-intersection)*10;
 const original=good([...features,operation]);expect(original.volume).toBeCloseTo(expected,5);
 operation.positions.reverse();expect(good([...features,operation]).volume).toBeCloseTo(original.volume,5);
});
it('cuts in reversed direction from a principal plane, with the same true drill tip',()=>{
 const features=box(),operation=hole(good(features));operation.support={kind:'principal',plane:'XY'};operation.reversed=true;
 expect(good([...features,operation]).volume).toBeCloseTo(96000-Math.PI*9*(10+tipHeight/3),6);
 operation.reversed=false;expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/no corta material/);
});
it('returns the historical editor frame even when the position list is empty',()=>{
 const features=box(),operation=hole(good(features));operation.positions=[];const result=engine.build([...features,operation]);
 expect(result.featureErrors[0].message).toMatch(/128 posiciones/);expect(result.holes).toEqual([{id:'hole',frame:{origin:[0,0,20],normal:[0,0,1],xDirection:[1,0,0]}}]);expect(result.volume).toBeCloseTo(96000,5);
});
it('rejects coincident centres and any individual position without material even when another is valid',()=>{
 const features=box(),operation=hole(good(features));operation.positions=[{id:'a',x:0,y:0},{id:'b',x:0,y:0}];expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/coincidentes/);
 operation.positions[1].x=100;const result=engine.build([...features,operation]);expect(result.featureErrors[0].message).toMatch(/taladro 2 no corta material/);expect(result.volume).toBeCloseTo(96000,5);expect(()=>engine.export('step')).toThrow(/errores/);
});
it('rejects an excessive point or head before constructing misleading geometry',()=>{
 const features=box(),operation=hole(good(features));operation.endCondition={kind:'blind',depth:1,depthReference:'tip',tip:{kind:'conical',angle:118}};
 expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/tramo cilíndrico/);
 operation.endCondition={kind:'blind',depth:10,depthReference:'tip',tip:{kind:'conical',angle:118}};operation.head={kind:'counterbore',diameter:10,depth:9};expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/rebaje supera/);
 operation.head={kind:'countersink',diameter:30,angle:90};expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/rebaje supera/);
});
it('propagates suppression of its anchored base and refuses stale or curved supports',()=>{
 const features=box(),operation=hole(good(features));features[1].suppressed=true;expect(engine.build([...features,operation]).featureErrors).toEqual([]);
 features[1].suppressed=false;operation.baseFeatureId='missing';expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/base anterior/);
 (features[0]as SketchFeature).profile={kind:'circle',center:[0,0],radius:20};const base=good(features);operation.baseFeatureId='base';operation.support={kind:'face',face:base.faces!.find(face=>!face.frame)!.ref};expect(engine.build([...features,operation]).featureErrors[0].message).toMatch(/cara seleccionada es curva/);
});
it('preserves genuine drilled geometry when the complete operation is a pattern seed',async()=>{
 const features=box(),operation=hole(good(features));operation.positions=[{id:'p1',x:-20,y:0}];operation.head={kind:'counterbore',diameter:10,depth:2};
 const pattern:Feature={id:'pattern',name:'Pattern',type:'linearPattern',baseFeatureId:'hole',source:{mode:'features',geometryPattern:true,featureIds:['hole']},first:{direction:[1,0,0],count:3,spacing:20},second:null,secondSeedOnly:false,skipped:[],suppressed:false};
 const result=good([...features,operation,pattern]);expect(result.volume).toBeCloseTo(96000-3*(Math.PI*9*(10+tipHeight/3)+32*Math.PI),5);await step(result);
});
it('preserves order-independent position identity but invalidates face references when labelled centres exchange roles',()=>{
 const features=box(),operation=hole(good(features));operation.positions=[{id:'a',x:-15,y:0},{id:'b',x:15,y:0}];
 const first=good([...features,operation]),structure=holePositionStructure(operation.positions);
 operation.positions.reverse();expect(holePositionStructure(operation.positions)).toEqual(structure);
 expect(good([...features,operation]).faces!.map(face=>face.ref.key).sort()).toEqual(first.faces!.map(face=>face.ref.key).sort());
 operation.positions.forEach(position=>position.x=-position.x);expect(holePositionStructure(operation.positions)).not.toEqual(structure);
 const exchanged=good([...features,operation]);expect(exchanged.volume).toBeCloseTo(first.volume,6);expect(exchanged.faces!.some(face=>first.faces!.some(old=>old.ref.key===face.ref.key))).toBe(false);
});
it('supports an exactly defined short cylindrical segment when depth is measured to the point',()=>{
 const features=box(),operation=hole(good(features));operation.endCondition={kind:'blind',depth:tipHeight+.001,depthReference:'tip',tip:{kind:'conical',angle:118}};
 expect(good([...features,operation]).volume).toBeCloseTo(96000-Math.PI*9*(.001+tipHeight/3),6);
});
it.each(['XZ','YZ']as const)('keeps entry orientation and true drill depth on the %s plane',async plane=>{
 const features=box();(features[0]as SketchFeature).plane=plane;
 const base=good(features),operation=hole(base);
 const face=base.faces!.find(face=>face.frame&&(plane==='XZ'?face.frame.normal[1]<-.99:face.frame.normal[0]>.99))!;
 operation.support={kind:'face',face:face.ref};operation.positions=[{id:'p1',x:10,y:5}];
 const result=good([...features,operation]);expect(result.volume).toBeCloseTo(96000-Math.PI*9*(10+tipHeight/3),5);await step(result);
});
it('drills normal to an associative inclined planar face',async()=>{
 const features=box(),base=good(features),side=base.faces!.find(face=>face.frame?.normal[0]===1)!.ref;
 features.push({id:'draft',name:'Draft',type:'draft',baseFeatureId:'base',angle:5,reversed:false,propagation:'tangent',support:{kind:'principal',plane:'XY'},faces:[side],suppressed:false});
 const drafted=good(features),face=drafted.faces!.find(face=>face.frame&&face.frame.normal[0]>.9&&face.frame.normal[2]>.01)!,frame=face.frame!;
 const points=Array.from({length:face.vertices.length/3},(_,index)=>face.vertices.slice(index*3,index*3+3));
 const centre=[0,1,2].map(axis=>points.reduce((sum,point)=>sum+point[axis],0)/points.length)as[number,number,number];
 const delta=centre.map((value,axis)=>value-frame.origin[axis])as[number,number,number];
 const operation=hole(base);operation.baseFeatureId='draft';operation.support={kind:'face',face:face.ref};operation.positions=[{id:'inclined',x:frameDot(delta,frame.xDirection),y:frameDot(delta,frameYDirection(frame))}];operation.diameter=2;operation.endCondition={kind:'blind',depth:3,depthReference:'shoulder',tip:{kind:'conical',angle:118}};
 const result=good([...features,operation]);expect(result.volume).toBeCloseTo(drafted.volume-Math.PI*(3+1/Math.tan(59*Math.PI/180)/3),5);await step(result);
});
function metrics(shape:Shape3D){const oc=getOC(),area=new oc.GProp_GProps(),box=shape.boundingBox,check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),solids=shape.solids;
 try{oc.BRepGProp.SurfaceProperties(shape.wrapped,area,1e-10,false);return{volume:mass(shape),area:area.Mass(),bounds:box.bounds.flat(),valid:check.IsValid(),solids:solids.length};}
 finally{area.delete();box.delete();check.delete();solids.forEach(solid=>solid.delete());}}
it.each(['blind','counterbore','countersink']as const)('builds the public %s wizard example after serializing its four positions',async kind=>{
 const document=await createHoleExample(kind,features=>Promise.resolve(engine.build(features))),reopened=parseDocument(serializeDocument(document));
 const operation=reopened.features.at(-1);if(operation?.type!=='hole')throw new Error('Hole example expected');
 expect(operation.positions).toHaveLength(4);expect(operation.diameter).toBe(8);expect(operation.positions.map(position=>[position.x,position.y]).sort()).toEqual([[-30,-20],[-30,20],[30,-20],[30,20]].sort());
 const perHole=kind==='blind'?Math.PI*16*(10+4/Math.tan(59*Math.PI/180)/3):kind==='counterbore'?Math.PI*(16*24+(64-16)*4):Math.PI*(16*24+4*(64+32+16)/3-16*4);
 const result=good(reopened.features);expect(result.volume).toBeCloseTo(168000-4*perHole,5);expect(result.bounds).toEqual({min:[-50,-35,0],max:[50,35,24]});await step(result);
});

const uiDrillHeight=4/Math.tan(59*Math.PI/180);
const uiCases:Array<{name:string;count:number;kind:HoleFeature['endCondition']['kind'];head:HoleFeature['head']['kind'];reference?:'shoulder'|'tip';headDepth?:number;headAngle?:number;box?:boolean;step?:boolean;volume:number}>=[
 {name:'Taladros ciegos hasta hombro',count:4,kind:'blind',head:'simple',reference:'shoulder',volume:168000-4*16*Math.PI*(10+uiDrillHeight/3)},
 {name:'Taladros ciegos hasta punta',count:4,kind:'blind',head:'simple',reference:'tip',volume:168000-4*16*Math.PI*(10-2*uiDrillHeight/3)},
 {name:'Cinco taladros hasta punta',count:5,kind:'blind',head:'simple',reference:'tip',step:true,volume:168000-5*16*Math.PI*(10-2*uiDrillHeight/3)},
 {name:'Placa con taladros refrentados',count:4,kind:'throughAll',head:'counterbore',headDepth:4,step:true,volume:168000-4*Math.PI*(16*24+48*4)},
 {name:'Refrentados de 6 mm',count:4,kind:'throughAll',head:'counterbore',headDepth:6,volume:168000-4*Math.PI*(16*24+48*6)},
 {name:'Placa con taladros avellanados',count:4,kind:'throughAll',head:'countersink',headAngle:90,step:true,volume:168000-4*Math.PI*(16*24+4*(64+32+16)/3-16*4)},
 {name:'Avellanados de 100 grados',count:4,kind:'throughAll',head:'countersink',headAngle:100,volume:168000-4*Math.PI*(16*24+4/Math.tan(50*Math.PI/180)*((64+32+16)/3-16))},
 {name:'Caja con dos taladros hasta siguiente',count:2,kind:'untilNext',head:'simple',box:true,volume:192000-72*52*32-64*Math.PI*4-2*16*Math.PI*4},
 {name:'Caja con dos taladros pasantes',count:2,kind:'throughAll',head:'simple',box:true,step:true,volume:192000-72*52*32-64*Math.PI*4-2*16*Math.PI*8},
];
it.each(uiCases)('reopens the UI-saved wizard document $name and checks its exact exported geometry',async fixture=>{
 const source=await readFile(new URL(`../../examples/${fixture.name}.solidflow`,import.meta.url)),document=parseDocument(source.toString('utf8'));
 expect(parseDocument(serializeDocument(document)).features).toEqual(document.features);
 const operation=document.features.at(-1);if(operation?.type!=='hole')throw new Error('Expected a saved hole operation');
 expect(document.features).toHaveLength(fixture.box?6:3);expect(operation.diameter).toBe(8);expect(operation.reversed).toBe(false);expect(operation.positions).toHaveLength(fixture.count);
 expect(operation.endCondition.kind).toBe(fixture.kind);expect(operation.head.kind).toBe(fixture.head);expect(operation.support.kind).toBe('face');
 if(operation.support.kind==='face')expect(operation.support.face.sourceFeatureId).toBe(operation.baseFeatureId);
 if(operation.endCondition.kind==='blind'){expect(operation.endCondition.depth).toBe(10);expect(operation.endCondition.depthReference).toBe(fixture.reference);expect(operation.endCondition.tip).toEqual({kind:'conical',angle:118});}
 if(operation.head.kind==='counterbore')expect(operation.head).toEqual({kind:'counterbore',diameter:16,depth:fixture.headDepth});
 if(operation.head.kind==='countersink')expect(operation.head).toEqual({kind:'countersink',diameter:16,angle:fixture.headAngle});
 const coordinates=operation.positions.map(point=>[point.x,point.y]).sort();
 expect(coordinates).toEqual((fixture.box?[[-25,15],[25,15]]:fixture.count===5?[[-25,-15],[30,20],[-30,20],[30,-20],[10,0]]:[[-30,-20],[30,-20],[30,20],[-30,20]]).sort());
 const before=JSON.stringify(document.features),result=good(document.features);expect(JSON.stringify(document.features)).toBe(before);expect(result.volume).toBeCloseTo(fixture.volume,5);
 const expectedBounds=fixture.box?[-40,-30,0,40,30,40]:[-50,-35,0,50,35,24];
 [...result.bounds.min,...result.bounds.max].forEach((value,axis)=>expect(Math.abs(value-expectedBounds[axis])).toBeLessThan(1e-6));
 expect(result.holes).toHaveLength(1);expect(result.holes![0]).toMatchObject({id:operation.id,frame:{origin:[0,0,fixture.box?40:24],normal:[0,0,1]}});
 const generated=(await importSTEP(engine.export('step'))).asShape3D();
 try{
  const regenerated=metrics(generated);expect(regenerated.valid).toBe(true);expect(regenerated.solids).toBe(1);expect(regenerated.volume).toBeCloseTo(fixture.volume,5);
  let uiStep:unknown=null;
  if(fixture.step){
   const stepBytes=await readFile(new URL(`./fixtures/solidflow-ui/${fixture.name}.step`,import.meta.url)),imported=(await importSTEP(new Blob([stepBytes.toString('utf8')]))).asShape3D();
   try{
    const measured=metrics(imported);expect(measured.valid).toBe(true);expect(measured.solids).toBe(1);
    const volumeDifference=Math.abs(measured.volume-regenerated.volume),areaDifference=Math.abs(measured.area-regenerated.area),boundsDifference=Math.max(...measured.bounds.map((value,axis)=>Math.abs(value-regenerated.bounds[axis])));
    expect(volumeDifference).toBeLessThan(1e-5);expect(areaDifference).toBeLessThan(1e-5);expect(boundsDifference).toBeLessThan(1e-6);
    const extra=imported.cut(generated),missing=generated.cut(imported);let symmetricDifference:number;
    try{symmetricDifference=Math.abs(mass(extra))+Math.abs(mass(missing));}finally{extra.delete();missing.delete();}
    expect(symmetricDifference).toBeLessThan(1e-5);
    uiStep={path:`src/cad/fixtures/solidflow-ui/${fixture.name}.step`,bytes:stepBytes.byteLength,sha256:createHash('sha256').update(stepBytes).digest('hex'),...measured,volumeDifference,areaDifference,boundsDifference,symmetricDifference};
   }finally{imported.delete();}
  }
  uiReports.push({name:fixture.name,document:{path:`examples/${fixture.name}.solidflow`,bytes:source.byteLength,sha256:createHash('sha256').update(source).digest('hex'),internalName:document.name,featureCount:document.features.length},hole:{diameter:operation.diameter,positions:operation.positions,endCondition:operation.endCondition,head:operation.head,support:operation.support,reversed:operation.reversed},resolvedFrame:result.holes![0].frame,expectedVolume:fixture.volume,resultVolume:result.volume,regenerated,uiStep});
 }finally{generated.delete();}
},30_000);
