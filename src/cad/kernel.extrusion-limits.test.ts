import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC, sketchCircle, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import type { CadResult, ExtrudeFeature, Feature, SketchFeature } from './kernel.types';
import { createExtrudeEndExample } from '../examples/extrude-end-conditions';
import { parseDocument, serializeDocument } from '../model/document';
import { throughAllBossTool, untilNextTool, upToSurfaceTool } from './kernel.extrusion-limits';

const engine=new CadEngine();
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined})),60_000);
afterEach(()=>engine.dispose());


const uiReports:unknown[]=[];
afterAll(async()=>{if(process.env.SOLIDFLOW_CAD_REPORT==='1'&&uiReports.length===8)await writeFile(new URL('../../artifacts/verify-ui-extrude-end-export.json',import.meta.url),JSON.stringify(uiReports,null,2)+'\n');});
function sketch(id:string, offset=0, radius=5): SketchFeature {
  return {id,name:id,type:'sketch',plane:'XY',offset,profile:{kind:'circle',center:[0,0],radius},suppressed:false};
}
function extrude(id:string, sketchId:string, depth=40): ExtrudeFeature {
  return {id,name:id,type:'extrude',sketchId,depth,symmetric:false,suppressed:false};
}
function box():Feature[]{return [{...sketch('base-sketch'),profile:{kind:'rectangle',center:[0,0],width:80,height:50}},extrude('base','base-sketch')];}
function hollow():Feature[]{return [...box(),{id:'shell',name:'Vaciado',type:'shell',baseFeatureId:'base',thickness:4,direction:'inward',removedFaces:[],suppressed:false}];}
function good(features:Feature[]):CadResult{const result=engine.build(features);expect(result.featureErrors).toEqual([]);return result;}
async function roundTrip(result:CadResult){const shape=(await importSTEP(engine.export('step'))).asShape3D(),oc=getOC(),check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),mass=new oc.GProp_GProps(),solids=shape.solids;
 try{oc.BRepGProp.VolumeProperties(shape.wrapped,mass,1e-10,false,false);expect(check.IsValid()).toBe(true);expect(solids).toHaveLength(1);expect(mass.Mass()).toBeCloseTo(result.volume,4);}finally{check.delete();mass.delete();solids.forEach(s=>s.delete());shape.delete();}}

it('cuts through a hollow part in one direction and only the first wall with untilNext',async()=>{
 const features=hollow(),base=good(features),profile=sketch('cut-sketch',40);
 const cut:ExtrudeFeature={...extrude('cut','cut-sketch',-1),type:'cut',endCondition:{kind:'throughAll',baseFeatureId:'shell',bothDirections:false}};
 const through=good([...features,profile,cut]);expect(through.volume).toBeCloseTo(base.volume-Math.PI*25*8,5);await roundTrip(through);
 const next=good([...features,profile,{...cut,endCondition:{kind:'untilNext',baseFeatureId:'shell'}}]);expect(next.volume).toBeCloseTo(base.volume-Math.PI*25*4,5);await roundTrip(next);
});
it('throughAll both directions reaches either side of an interior sketch and follows depth edits',()=>{
 const features=box(),profile=sketch('cut-sketch',20),cut:ExtrudeFeature={...extrude('cut','cut-sketch',1),type:'cut',endCondition:{kind:'throughAll',baseFeatureId:'base',bothDirections:true}};
 expect(good([...features,profile,cut]).volume).toBeCloseTo(160000-Math.PI*25*40,5);
 (features[1]as ExtrudeFeature).depth=60;expect(good([...features,profile,cut]).volume).toBeCloseTo(240000-Math.PI*25*60,5);
});
it('adds to the next complete face of a hollow body from its interior floor',()=>{
 const features=hollow(),base=good(features),profile={...sketch('boss-sketch',4),profile:{kind:'rectangle' as const,center:[0,0]as[number,number],width:10,height:10}};
 const boss={...extrude('boss',profile.id),endCondition:{kind:'untilNext' as const,baseFeatureId:'shell'}};
 expect(good([...features,profile,boss]).volume).toBeCloseTo(base.volume+3200,5);
});
it('builds a first extrusion to an offset reference plane, ignoring remembered depth magnitude',async()=>{
 const features:Feature[]=[{id:'limit',name:'Límite',type:'plane',support:{kind:'principal',plane:'XY'},offset:30,reversed:true,suppressed:false},sketch('profile'),{...extrude('boss','profile',1),endCondition:{kind:'upToSurface',target:{kind:'plane',planeId:'limit'}}}];
 const result=good(features);expect(result.volume).toBeCloseTo(750*Math.PI,5);await roundTrip(result);
});
it('builds a first extrusion in negative direction to a principal plane',()=>{
 const result=good([sketch('profile',25),{...extrude('boss','profile',-1),endCondition:{kind:'upToSurface',target:{kind:'principal',plane:'XY'}}}]);
 expect(result.volume).toBeCloseTo(625*Math.PI,5);expect(result.bounds.min[2]).toBeCloseTo(0,6);
});
it('ends on the first exact cylindrical intersection, not on its centre or far side',async()=>{
 const features:Feature[]=[{...sketch('cylinder-sketch',-50,20),plane:'XZ',profile:{kind:'circle',radius:20,center:[0,30]}},extrude('cylinder','cylinder-sketch',100)];
 const base=good(features),face=base.faces!.find(face=>!face.frame)!.ref;
 const result=good([...features,sketch('profile'),{...extrude('boss','profile',1),endCondition:{kind:'upToSurface',target:{kind:'face',face}}}]);
 expect(result.volume-base.volume).toBeCloseTo(797.7678089815826,5);await roundTrip(result);
});
it('uses historical target geometry when later edits have changed the current body',()=>{
 const features=box(),base=good(features),face=base.faces!.find(face=>face.frame?.normal[2]===1)!.ref;
 const profile=sketch('boss-sketch',40,10),boss=extrude('boss',profile.id,20);
 const result=good([...features,profile,boss,sketch('cut-sketch',60,5),{...extrude('cut','cut-sketch',-1),type:'cut',endCondition:{kind:'upToSurface',target:{kind:'face',face}}}]);
 expect(result.volume).toBeCloseTo(160000+Math.PI*(100-25)*20,5);
});
it('suppresses a dependent operation when its automatic base is suppressed',()=>{
 const features=box(),cut:ExtrudeFeature={...extrude('cut','profile',-1),type:'cut',endCondition:{kind:'throughAll',baseFeatureId:'base',bothDirections:false}};
 features[1].suppressed=true;
 const result=engine.build([...features,sketch('profile',40),cut]);
 expect(result.featureErrors).toEqual([]);expect(result.warnings.join(' ')).toMatch(/base.*suprimida/);
});
it('rejects a missing base and a parallel or wrong-side limiting plane',()=>{
 const result=engine.build([...box(),sketch('profile'),{...extrude('boss','profile'),endCondition:{kind:'untilNext',baseFeatureId:'missing'}}]);expect(result.featureErrors[0].message).toMatch(/anterior/);
 for(const plane of['XY','YZ']as const){const invalid=engine.build([sketch('profile',10),{...extrude('boss','profile'),endCondition:{kind:'upToSurface',target:{kind:'principal',plane}}}]);expect(invalid.featureErrors).toHaveLength(1);expect(()=>engine.export('step')).toThrow(/errores/);}
});

it.each(['throughAll','untilNext','upToSurface']as const)('builds and exports the public %s example through document serialization',async kind=>{
 const doc=await createExtrudeEndExample(kind,features=>Promise.resolve(engine.build(features)));
 const result=good(parseDocument(serializeDocument(doc)).features);
 const expected=kind==='throughAll'?(80*60-Math.PI*64)*12:kind==='untilNext'?80*60*40-72*52*32-256*Math.PI:40000*Math.PI+797.7678089815826;
 expect(result.volume).toBeCloseTo(expected,4);await roundTrip(result);
});
it('cuts from outside through the first entire wall and skips an incomplete nearer face',()=>{
 const features=hollow();(features[0]as SketchFeature).profile={kind:'rectangle',width:60,height:50,center:[0,0]};
 const cut:ExtrudeFeature={...extrude('cut','profile',-1),type:'cut',endCondition:{kind:'untilNext',baseFeatureId:'shell'}};
 expect(good([...features,sketch('profile',45),cut]).volume).toBeCloseTo(50112-100*Math.PI,5);
 const partial={...sketch('profile',40),profile:{kind:'circle' as const,radius:5,center:[24,0]as[number,number]}};
 expect(good([...features,partial,cut]).volume).toBeCloseTo(48849.542729177294,5);
 const missing={...partial,profile:{...partial.profile,center:[29,0]as[number,number]}};
 expect(engine.build([...features,missing,cut]).featureErrors[0].message).toMatch(/todo el perfil/);
});
it('fills a hollow part with additive ThroughAll without any artificial extension beyond its boundary',async()=>{
 const features=hollow(),base=good(features),profile={...sketch('profile',4),profile:{kind:'rectangle' as const,center:[0,0]as[number,number],width:10,height:10}};
 const boss:ExtrudeFeature={...extrude('boss','profile',1),endCondition:{kind:'throughAll',baseFeatureId:'shell',bothDirections:false}};
 const result=good([...features,profile,boss]);expect(result.volume).toBeCloseTo(base.volume+3200,5);expect(result.bounds.max[2]).toBe(40);await roundTrip(result);
 const both=good([...features,{...profile,offset:20},{...boss,endCondition:{kind:'throughAll',baseFeatureId:'shell',bothDirections:true}}]);expect(both.volume).toBeCloseTo(base.volume+3200,5);
});
it.each(['XZ','YZ']as const)('uses local signed directions on %s for one-sided, outside and both-sided ThroughAll',plane=>{
 const features=box();(features[0]as SketchFeature).plane=plane;
 const profile={...sketch('profile',10),plane};
 const cut:ExtrudeFeature={...extrude('cut','profile',1),type:'cut',endCondition:{kind:'throughAll',baseFeatureId:'base',bothDirections:false}};
 expect(good([...features,profile,cut]).volume).toBeCloseTo(160000-750*Math.PI,5);
 expect(good([...features,profile,{...cut,depth:-1}]).volume).toBeCloseTo(160000-250*Math.PI,5);
 expect(good([...features,{...profile,offset:50},{...cut,depth:-1}]).volume).toBeCloseTo(160000-1000*Math.PI,5);
 expect(good([...features,{...profile,offset:50},{...cut,endCondition:{kind:'throughAll',baseFeatureId:'base',bothDirections:true}}]).volume).toBeCloseTo(160000-1000*Math.PI,5);
 expect(engine.build([...features,{...profile,offset:50},cut]).featureErrors[0].message).toMatch(/sentido/);
});
function inclinedCavity():Feature[]{
 const features=box();(features[0]as SketchFeature).profile={kind:'rectangle',width:60,height:50,center:[0,0]};
 const points=[[-20,10],[20,10],[20,30],[-20,20]];
 features.push({...sketch('cavity-sketch',-25),plane:'XZ',profile:{kind:'entities',points:points.map(([x,y],i)=>({id:`p${i}`,x,y})),constraints:[],entities:points.map((_,i)=>({id:`e${i}`,type:'line',construction:false,start:`p${i}`,end:`p${(i+1)%4}`}))}},
 {...extrude('cavity','cavity-sketch',50),type:'cut'});return features;
}
it.each(['extrude','cut']as const)('terminates %s exactly on an inclined historical face and keeps that face associative',async type=>{
 const features=inclinedCavity(),base=good(features),face=base.faces!.find(face=>face.frame&&face.frame.normal[2]<-.9&&face.frame.normal[0]>.2)!.ref;
 const profile={...sketch('profile',type==='cut'?40:10),profile:{kind:'rectangle' as const,center:[0,0]as[number,number],width:10,height:10}};
 const op:ExtrudeFeature={...extrude('op','profile',type==='cut'?-1:1),type,endCondition:{kind:'upToSurface',target:{kind:'face',face}}};
 const result=good([...features,profile,op]);expect(result.volume).toBeCloseTo(90000+(type==='cut'?-1500:1500),5);await roundTrip(result);
});
it('extends a planar face beyond its trim while refusing a curved face that cannot cover all regions',()=>{
 const features=box(),base=good(features),face=base.faces!.find(face=>face.frame?.normal[2]===1)!.ref;
 const profile={...sketch('profile',50),profile:{kind:'circle' as const,center:[38,0]as[number,number],radius:5}};
 const result=good([...features,profile,{...extrude('op','profile',-1),endCondition:{kind:'upToSurface',target:{kind:'face',face}}}]);
 expect(result.volume).toBeCloseTo(160000+250*Math.PI,5);
 const cylinder:Feature[]=[{...sketch('cylinder-sketch',-50,20),plane:'XZ',profile:{kind:'circle',radius:20,center:[0,30]}},extrude('cylinder','cylinder-sketch',100)];
 const curve=good(cylinder).faces!.find(face=>!face.frame)!.ref;
 const regions:SketchFeature={...sketch('regions'),profile:{kind:'entities',points:[{id:'a',x:0,y:0},{id:'b',x:30,y:0}],constraints:[],entities:[{id:'a-circle',type:'circle',construction:false,center:'a',radius:2},{id:'b-circle',type:'circle',construction:false,center:'b',radius:2}]}};
 const failed=engine.build([...cylinder,regions,{...extrude('up','regions'),endCondition:{kind:'upToSurface',target:{kind:'face',face:curve}}}]);
 expect(failed.featureErrors[0].message).toMatch(/todo el perfil/);expect(()=>engine.export('step')).toThrow(/errores/);
});

it('distinguishes the first and last exits of one toroidal face without using bounding planes',()=>{
 const torus=sketchCircle(5,{plane:'XY',origin:[15,0,0]}).revolve([0,1,0],{origin:[0,0,0],angle:360});
 const make=(length:number,start=0)=>sketchCircle(2,{plane:'YZ',origin:[-30+start,0,0]}).extrude(length);
 const next=untilNextTool(torus,[-30,0,0],[1,0,0],make,true),all=throughAllBossTool(torus,[-30,0,0],[1,0,0],false,make);
 try{const first=preciseMetrics(next),last=preciseMetrics(all);expect(first.valid&&last.valid).toBe(true);expect(first.bounds[3]).toBeCloseTo(-Math.sqrt(96),4);expect(last.bounds[3]).toBeCloseTo(20,5);expect(last.volume).toBeGreaterThan(first.volume);}
 finally{next.delete();all.delete();torus.delete();}
},30_000);
it('rebinds a target face after changing its parent depth and propagates target suppression',()=>{
 const features=box(),face=good(features).faces!.find(face=>face.frame?.normal[2]===1)!.ref;
 const rest:Feature[]=[sketch('profile',70),{...extrude('up','profile',-1),endCondition:{kind:'upToSurface',target:{kind:'face',face}}}];
 expect(good([...features,...rest]).volume).toBeCloseTo(160000+750*Math.PI,5);
 (features[1]as ExtrudeFeature).depth=60;expect(good([...features,...rest]).volume).toBeCloseTo(240000+250*Math.PI,5);
 features[1].suppressed=true;const suppressed=engine.build([...features,...rest]);expect(suppressed.featureErrors).toEqual([]);expect(suppressed.volume).toBe(0);expect(suppressed.warnings.join(' ')).toMatch(/superficie límite.*suprimida/);
});
it('records the actual terminated cut contribution for geometry-pattern seeds',async()=>{
 const features=box();features.push({...sketch('profile',20),profile:{kind:'circle',radius:5,center:[-20,0]}},
 {...extrude('hole','profile'),type:'cut',endCondition:{kind:'throughAll',baseFeatureId:'base',bothDirections:true}},
 {id:'pattern',name:'Matriz',type:'linearPattern',suppressed:false,baseFeatureId:'hole',source:{mode:'features',geometryPattern:true,featureIds:['hole']},first:{direction:[1,0,0],spacing:20,count:3},second:null,secondSeedOnly:false,skipped:[]});
 const result=good(features);expect(result.volume).toBeCloseTo(160000-3000*Math.PI,5);await roundTrip(result);
});
it('cuts in the true normal direction of an inclined face-supported sketch',()=>{
 const features=inclinedCavity(),base=good(features),face=base.faces!.find(face=>face.frame&&face.frame.normal[2]<-.9&&face.frame.normal[0]>.2)!;
 const profile:SketchFeature={...sketch('profile',0,2),support:{kind:'face',face:face.ref}};
 const inside:ExtrudeFeature={...extrude('cut','profile',-1),type:'cut',endCondition:{kind:'throughAll',baseFeatureId:'cavity',bothDirections:false}};
 const result=good([...features,profile,inside]);expect(result.volume).toBeLessThan(base.volume);
 // Signed direction stays tied to the support frame; a short blind tool in the same direction also removes material.
 const blind=good([...features,profile,{...inside,endCondition:undefined,depth:-.5}]);expect(blind.volume).toBeCloseTo(base.volume-2*Math.PI,4);
});
it('keeps an annulus and multiple islands intact instead of silently dropping a profile region',async()=>{
 const profile:SketchFeature={...sketch('profile'),profile:{kind:'entities',points:[{id:'c',x:0,y:0},{id:'d',x:20,y:0}],constraints:[],entities:[{id:'outer',type:'circle',construction:false,center:'c',radius:5},{id:'inner',type:'circle',construction:false,center:'c',radius:2},{id:'island',type:'circle',construction:false,center:'d',radius:3}]}};
 const plane:Feature={id:'limit',name:'Límite',type:'plane',support:{kind:'principal',plane:'XY'},offset:20,reversed:false,suppressed:false};
 const op:ExtrudeFeature={...extrude('op','profile'),endCondition:{kind:'upToSurface',target:{kind:'plane',planeId:'limit'}}};
 const result=good([plane,profile,op]);expect(result.volume).toBeCloseTo(600*Math.PI,5);expect(result.warnings).toContain('La pieza contiene 2 sólidos separados.');
 const body=box(),ref=good(body).faces!.find(face=>face.frame?.normal[2]===1)!.ref;
 const cut:ExtrudeFeature={...op,type:'cut',depth:-1,endCondition:{kind:'upToSurface',target:{kind:'face',face:ref}}};
 expect(engine.build([...body,{...profile,offset:50},cut]).featureErrors[0].message).toMatch(/no intersecta/);
});

function preciseMetrics(shape:Shape3D){const oc=getOC(),mass=new oc.GProp_GProps(),area=new oc.GProp_GProps(),check=new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false),box=shape.boundingBox,solids=shape.solids;
 try{oc.BRepGProp.VolumeProperties(shape.wrapped,mass,1e-10,false,false);oc.BRepGProp.SurfaceProperties(shape.wrapped,area,1e-10,false);return{volume:mass.Mass(),area:area.Mass(),valid:check.IsValid(),bounds:box.bounds.flat(),solids:solids.length};}
 finally{mass.delete();area.delete();check.delete();box.delete();solids.forEach(s=>s.delete());}}



function pinVolume(radius:number):number{
 // Independent quadrature of 30-sqrt(20²-x²) over the circular profile; no CAD mass oracle.
 const n=4096,step=(Math.PI/2)/n;let sum=0;
 for(let i=0;i<=n;i++){const angle=i*step,value=4*radius*radius*Math.cos(angle)**2*(30-Math.sqrt(400-radius*radius*Math.sin(angle)**2));sum+=value*(i===0||i===n?1:i%2?4:2);}
 return sum*step/3;
}
it.each([false, true])('protects a shared cylindrical limit face when native splitting fails=%s', failAfterBuild => {
  const owners: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(value: T): T => { owners.push(value); return value; };
  let failed = false, operationError: unknown;
  try {
    // Original cylinder: R20, length100 along -Y, centre section (x0,z30).
    const cylinderSketch = sketchCircle(20, { plane: 'XZ', origin: [0, 50, 30] });
    let cylinder: Shape3D;
    try { cylinder = own(cylinderSketch.extrude(100)); } finally { cylinderSketch.delete(); }
    const faces = cylinder.faces; faces.forEach(own);
    const curved = faces.filter(face => face.geomType === 'CYLINDRE');
    expect(curved).toHaveLength(1);
    const target = curved[0], alias = own(target.clone());
    expect(alias.isSame(target)).toBe(true);
    const originalEdges = target.edges; originalEdges.forEach(own);
    const expectedBounds = [-20, -50, 10, 20, 50, 50];
    const expectCylinder = () => {
      const actual = preciseMetrics(cylinder);
      expect(actual.valid).toBe(true); expect(actual.solids).toBe(1);
      expect(Math.abs(actual.volume - 40_000 * Math.PI)).toBeLessThan(5e-6);
      expect(Math.abs(actual.area - 4_800 * Math.PI)).toBeLessThan(5e-6);
      actual.bounds.forEach((value, index) => expect(Math.abs(value - expectedBounds[index])).toBeLessThan(5e-6));
    };
    expectCylinder();
    const oc = getOC(), nativeBuild = oc.BRepAlgoAPI_Splitter.prototype.Build;
    let builds = 0;
    vi.spyOn(oc.BRepAlgoAPI_Splitter.prototype, 'Build').mockImplementation(function(this: InstanceType<typeof oc.BRepAlgoAPI_Splitter>, ...args) {
      expect(this.NonDestructive()).toBe(true);
      builds++; nativeBuild.apply(this, args);
      if (failAfterBuild) throw new Error('Injected failure after native surface split.');
    });
    const make = (length: number, start = 0) => {
      const profile = sketchCircle(5, { plane: 'XY', origin: [0, 0, start] });
      try { return profile.extrude(length); } finally { profile.delete(); }
    };
    const operation = () => upToSurfaceTool({ face: alias }, [0, 0, 0], [0, 0, 1], make);
    if (failAfterBuild) expect(operation).toThrow('Injected failure after native surface split.');
    else {
      const limited = own(operation()), actual = preciseMetrics(limited);
      expect(actual.valid).toBe(true); expect(actual.solids).toBe(1);
      expect(Math.abs(actual.volume - pinVolume(5))).toBeLessThan(5e-6);
      const bounds = [-5, -5, 0, 5, 5, 30 - Math.sqrt(375)];
      actual.bounds.forEach((value, index) => expect(Math.abs(value - bounds[index])).toBeLessThan(5e-6));
    }
    expect(builds).toBe(1);
    expectCylinder(); expect(alias.isSame(target)).toBe(true);
    const retainedEdges = alias.edges; retainedEdges.forEach(own);
    expect(retainedEdges).toHaveLength(originalEdges.length);
    for (const edge of originalEdges) expect(retainedEdges.filter(retained => retained.isSame(edge))).toHaveLength(1);
  } catch (error) { failed = true; operationError = error; throw error; }
  finally {
    vi.restoreAllMocks();
    const failures: unknown[] = [];
    for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(failed ? [operationError, ...failures] : failures, 'Shared curved limit regression release failed.');
  }
}, 60_000);
const uiCases=[
 {name:'Placa con corte por todo',height:12,kind:'throughAll',both:false,radius:8,volume:(4800-64*Math.PI)*12,bounds:[-40,-30,0,40,30,12],step:false},
 {name:'Placa por todo 35 mm',height:35,kind:'throughAll',both:false,radius:8,volume:(4800-64*Math.PI)*35,bounds:[-40,-30,0,40,30,35],step:false},
 {name:'Placa por todo ambos sentidos',height:35,kind:'throughAll',both:true,radius:8,volume:(4800-64*Math.PI)*35,bounds:[-40,-30,0,40,30,35],step:true},
 {name:'Caja con corte hasta siguiente',height:40,kind:'untilNext',radius:8,volume:192000-72*52*32-256*Math.PI,bounds:[-40,-30,0,40,30,40],step:true},
 {name:'Caja con corte por las dos paredes',height:40,kind:'throughAll',both:false,radius:8,volume:192000-72*52*32-512*Math.PI,bounds:[-40,-30,0,40,30,40],step:false},
 {name:'Saliente hasta techo cilíndrico',height:100,kind:'upToSurface',radius:5,volume:40000*Math.PI+pinVolume(5),bounds:[-20,-50,0,20,50,50],step:true},
 {name:'Saliente hasta techo cilíndrico R7',height:100,kind:'upToSurface',radius:7,volume:40000*Math.PI+pinVolume(7),bounds:[-20,-50,0,20,50,50],step:false},
];
function preciseVolume(shape:Shape3D):number{const oc=getOC(),mass=new oc.GProp_GProps();try{oc.BRepGProp.VolumeProperties(shape.wrapped,mass,1e-10,false,false);return mass.Mass();}finally{mass.delete();}}
it.each(uiCases)('reopens the UI-saved document $name and validates its exported B-rep',async fixture=>{
 const source=await readFile(new URL(`../../examples/${fixture.name}.solidflow`,import.meta.url)),document=parseDocument(source.toString('utf8'));
 expect(parseDocument(serializeDocument(document)).features).toEqual(document.features);
 const sourceFeatures=JSON.stringify(document.features),base=document.features.find(feature=>feature.id==='end-example-base')as ExtrudeFeature,
  profile=document.features.find(feature=>feature.id==='end-example-profile')as SketchFeature,operation=document.features.at(-1)as ExtrudeFeature;
 expect(base.depth).toBe(fixture.height);expect(profile.profile).toMatchObject({kind:'circle',radius:fixture.radius});expect(operation.endCondition?.kind).toBe(fixture.kind);
 if(fixture.both!==undefined)expect(operation.endCondition).toMatchObject({bothDirections:fixture.both});
 if(fixture.both){expect(profile.offset).toBe(-17.5);expect(operation.depth).toBe(20);}
 const result=good(document.features);expect(result.warnings).toEqual([]);expect(JSON.stringify(document.features)).toBe(sourceFeatures);
 expect(result.volume).toBeCloseTo(fixture.volume,4);
 [...result.bounds.min,...result.bounds.max].forEach((value,axis)=>expect(Math.abs(value-fixture.bounds[axis])).toBeLessThan(1e-5));
 const regenerated=(await importSTEP(engine.export('step'))).asShape3D();
 try{
  const regeneratedMetrics=preciseMetrics(regenerated);expect(regeneratedMetrics.valid).toBe(true);expect(regeneratedMetrics.solids).toBe(1);expect(regeneratedMetrics.volume).toBeCloseTo(result.volume,4);
  let stepReport:unknown=null;
  if(fixture.step){
   const stepBytes=await readFile(new URL(`./fixtures/solidflow-ui/${fixture.name}.step`,import.meta.url)),imported=(await importSTEP(new Blob([stepBytes.toString('utf8')]))).asShape3D();
   try{
    const importedMetrics=preciseMetrics(imported);expect(importedMetrics.valid).toBe(true);expect(importedMetrics.solids).toBe(1);
    const volumeDifference=Math.abs(importedMetrics.volume-regeneratedMetrics.volume),boundsDifference=Math.max(...importedMetrics.bounds.map((value,axis)=>Math.abs(value-regeneratedMetrics.bounds[axis])));
    expect(volumeDifference).toBeLessThan(1e-5);expect(boundsDifference).toBeLessThan(1e-6);
    const extra=imported.cut(regenerated),missing=regenerated.cut(imported);let symmetricDifference:number;
    try{symmetricDifference=Math.abs(preciseVolume(extra))+Math.abs(preciseVolume(missing));}finally{extra.delete();missing.delete();}
    expect(symmetricDifference).toBeLessThan(1e-5);
    stepReport={path:`src/cad/fixtures/solidflow-ui/${fixture.name}.step`,bytes:stepBytes.byteLength,sha256:createHash('sha256').update(stepBytes).digest('hex'),...importedMetrics,volumeDifference,boundsDifference,symmetricDifference};
   }finally{imported.delete();}
  }
  uiReports.push({name:fixture.name,document:{path:`examples/${fixture.name}.solidflow`,bytes:source.byteLength,sha256:createHash('sha256').update(source).digest('hex'),featureCount:document.features.length},endCondition:operation.endCondition,profile:profile.profile,profileSupport:profile.support??null,profileOffset:profile.offset,rememberedDepth:operation.depth,expectedVolume:fixture.volume,resultVolume:result.volume,regenerated:regeneratedMetrics,uiStep:stepReport});
 }finally{regenerated.delete();}
},30_000);

it('reopens the UI-saved first extrusion of a constrained rectangle to its 45 mm reference plane',async()=>{
 const name='Saliente hasta plano 45 mm',source=await readFile(new URL(`../../examples/${name}.solidflow`,import.meta.url)),document=parseDocument(source.toString('utf8'));
 expect(document.name).toBe('Pieza1');expect(document.features).toHaveLength(3);expect(parseDocument(serializeDocument(document)).features).toEqual(document.features);
 const [plane,profile,operation]=document.features;
 if(plane.type!=='plane'||profile.type!=='sketch'||profile.profile.kind!=='entities'||operation.type!=='extrude')throw new Error('Unexpected UI fixture structure');
 expect(plane.offset).toBe(45);expect(profile.profile.entities).toHaveLength(4);expect(profile.profile.constraints).toHaveLength(6);
 expect(profile.profile.constraints.flatMap(constraint=>constraint.type==='length'&&'value'in constraint?[constraint.value]:[]).sort((a,b)=>a-b)).toEqual([30,40]);
 expect(operation.endCondition).toEqual({kind:'upToSurface',target:{kind:'plane',planeId:plane.id}});expect(operation.depth).toBe(20);
 const result=good(document.features);expect(result.warnings).toEqual([]);expect(result.volume).toBeCloseTo(54000,4);
 const expectedBounds=[-20,-15,0,20,15,45];[...result.bounds.min,...result.bounds.max].forEach((value,axis)=>expect(Math.abs(value-expectedBounds[axis])).toBeLessThan(1e-6));
 const regenerated=(await importSTEP(engine.export('step'))).asShape3D();
 try{
  const measures=preciseMetrics(regenerated);expect(measures.valid).toBe(true);expect(measures.solids).toBe(1);expect(measures.volume).toBeCloseTo(54000,4);
  uiReports.push({name,document:{path:`examples/${name}.solidflow`,bytes:source.byteLength,sha256:createHash('sha256').update(source).digest('hex'),internalName:document.name,featureCount:document.features.length},endCondition:operation.endCondition,profile:{kind:'entities',entityCount:4,constraintCount:6,dimensions:[40,30]},targetPlane:plane,rememberedDepth:operation.depth,expectedVolume:54000,resultVolume:result.volume,regenerated:measures,uiStep:null});
 }finally{regenerated.delete();}
 const changed=structuredClone(document.features);if(changed[0].type!=='plane')throw new Error('Plane expected');changed[0].offset=30;
 expect(good(changed).volume).toBeCloseTo(36000,4);
});
