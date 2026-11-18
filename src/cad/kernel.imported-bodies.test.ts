import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, measureShapeSurfaceProperties, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createDocument, validateDocument, serializeDocument, parseDocument, DocumentHistory, type Document } from '../model/document'
import { createStepSource, type StepSource } from '../model/stepSource'
import type { BodyReference, CadResult, Feature, ImportedBodiesFeature, LinearPatternFeature } from './kernel.types'
import { CadEngine } from './kernel.engine'
import { validateAssemblyShape } from './kernel.assembly-placements'
import { NativeBodyCatalog } from './kernel.bodies'
import { withNativeOwners } from './kernel.native-ownership'
import * as step from './kernel.step'

let original:StepSource,translated:StepSource,open:StepSource
const A={bodyId:'import-A',sourceFeatureId:'import-base'},B={bodyId:'import-B',sourceFeatureId:'import-base'}
beforeAll(async()=>{
 setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined,printErr:()=>undefined}))
 const source=async(name:string)=>createStepSource(new Uint8Array(await readFile(new URL('./fixtures/step-import/'+name,import.meta.url))))
 original=await source('box-mm.step');translated=await source('box-translated-mm.step');open=await source('open-shell-mm.step')
},60_000)
const near=(a:number,b:number,band=1e-6)=>{expect(Number.isFinite(a)).toBe(true);expect(Math.abs(a-b)).toBeLessThanOrEqual(band)}
function base(coincident=false):ImportedBodiesFeature{return {type:'importedBodies',id:'import-base',name:'Original autonomous boxes',suppressed:false,bodies:[{bodyId:A.bodyId,source:original},{bodyId:B.bodyId,source:coincident?original:translated}]}}
function document(coincident=false):Document{return validateDocument({...createDocument('Original explicit imported bodies'),features:[base(coincident)]})}
function body(result:CadResult,id:string){const rows=result.bodies?.filter(b=>b.ref.bodyId===id);expect(rows).toHaveLength(1);return rows![0]}
function checkBody(engine:CadEngine,ref:BodyReference,volume:number,area:number,bounds:number[][]){withNativeOwners(owners=>{const shape=owners.own(engine.copyCurrentBodyShape(ref)),surface=owners.own(measureShapeSurfaceProperties(shape)),box=owners.own(shape.boundingBox);expect(validateAssemblyShape(shape)).toBe(1);near(surface.area,area);const oc=getOC(),mass=owners.own(new oc.GProp_GProps());oc.BRepGProp.VolumeProperties(shape.wrapped,mass,1e-10,false,false);near(mass.Mass(),volume);box.bounds.forEach((s,i)=>s.forEach((v,j)=>near(v,bounds[i][j])))})}
function healthy(engine:CadEngine,doc:Document){const before=serializeDocument(doc),result=engine.build(doc.features);expect(result.featureErrors).toEqual([]);expect(result.bodyCatalogActive).toBe(true);expect(serializeDocument(doc)).toBe(before);return result}
for(const coincident of [false,true])it('rebuilds two declared IDs without fusing or deduplicating equal STEP bytes, coincident='+coincident,()=>{
 const d=document(coincident),engine=new CadEngine();try{const result=healthy(engine,d);expect(result.bodies?.map(b=>b.ref)).toEqual([A,B]);near(result.volume,480);checkBody(engine,A,240,248,[[0,0,0],[10,6,4]]);checkBody(engine,B,240,248,coincident?[[0,0,0],[10,6,4]]:[[12,-4,7],[22,2,11]]);expect(body(result,A.bodyId).vertexPoints).toHaveLength(8);expect(body(result,B.bodyId).vertexPoints).toHaveLength(8);expect(()=>engine.copyCurrentBodyShape(null)).toThrow();const text=serializeDocument(d),reopened=parseDocument(text);expect(serializeDocument(reopened)).toBe(text);healthy(engine,reopened);checkBody(engine,B,240,248,coincident?[[0,0,0],[10,6,4]]:[[12,-4,7],[22,2,11]])}finally{engine.dispose()}
})
it('keeps coincident material bodies separate before an explicit Common creates one output',()=>{
 const d=document(true);d.features.push({id:'common',name:'Explicit common',type:'combine',operation:'common',operands:[A,B],keepTools:false,resultBodyId:'common-body',suppressed:false});const engine=new CadEngine();try{const r=healthy(engine,validateDocument(d));expect(r.bodies?.map(b=>b.ref)).toEqual([{bodyId:'common-body',sourceFeatureId:'common'}]);near(r.volume,240);checkBody(engine,{bodyId:'common-body',sourceFeatureId:'common'},240,248,[[0,0,0],[10,6,4]]);expect(()=>engine.copyCurrentBodyShape(A)).toThrow();expect(()=>engine.copyCurrentBodyShape(B)).toThrow()}finally{engine.dispose()}
})
it('scopes a real through cut to A while B and its native references remain untouched',()=>{
 const d=document(),engine=new CadEngine();try{const before=healthy(engine,d),b=body(before,B.bodyId);const vertex=structuredClone(b.vertexPoints![0].ref),face=structuredClone(b.faces[0].ref)
 d.features.push({id:'cut-profile',name:'Original circle R1',type:'sketch',plane:'XY',offset:0,profile:{kind:'circle',center:[5,3],radius:1},suppressed:false},{id:'cut-A',name:'Through A only',type:'cut',sketchId:'cut-profile',depth:4,symmetric:false,bodyScope:[A],suppressed:false})
 const result=healthy(engine,validateDocument(d));expect(result.bodies?.map(b=>b.ref)).toEqual([{...A,sourceFeatureId:'cut-A'},B]);near(result.volume,480-4*Math.PI);checkBody(engine,{...A,sourceFeatureId:'cut-A'},240-4*Math.PI,248+6*Math.PI,[[0,0,0],[10,6,4]]);checkBody(engine,B,240,248,[[12,-4,7],[22,2,11]]);expect(engine.inspectCurrentFaceSupport(face,B)).toBeDefined();expect(engine.inspectCurrentVertexSupport(vertex,B)).toBeDefined();expect(()=>engine.inspectCurrentVertexSupport(vertex,{...A,sourceFeatureId:'cut-A'})).toThrow();expect(()=>engine.copyCurrentBodyShape(A)).toThrow()
 }finally{engine.dispose()}
})
it('copies one imported body through the existing current-body pattern transaction',()=>{
 const d=document(),pattern:LinearPatternFeature={id:'copies',name:'Original A copy',type:'linearPattern',baseFeatureId:'import-base',source:{mode:'bodies',scope:'current',bodies:[A]},bodyPattern:{mode:'new',instances:[{seedBodyId:A.bodyId,address:'1,0',bodyId:'A-copy',retired:false}]},first:{direction:[1,0,0],count:2,spacing:30},second:null,secondSeedOnly:false,skipped:[],suppressed:false};d.features.push(pattern);const engine=new CadEngine();try{const r=healthy(engine,validateDocument(d));expect(r.bodies).toHaveLength(3);near(r.volume,720);checkBody(engine,{bodyId:'A-copy',sourceFeatureId:'copies'},240,248,[[30,0,0],[40,6,4]]);checkBody(engine,B,240,248,[[12,-4,7],[22,2,11]])}finally{engine.dispose()}
})
it('publishes explicit face, edge and vertex inventories and rejects wrong-body/stale producers',()=>{
 const d=document(),engine=new CadEngine();try{const inventory=engine.rebuildForAssemblyReferences(d.features);expect(inventory.kind).toBe('explicit');if(inventory.kind!=='explicit')throw Error('explicit');expect(inventory.bodies.map(b=>b.ref)).toEqual([A,B]);for(const b of inventory.bodies){expect(b.faces).toHaveLength(6);expect(b.edges).toHaveLength(12);expect(b.vertexRefs).toHaveLength(8);expect(engine.inspectCurrentFaceSupport(b.faces[0],b.ref)).toBeDefined();expect(engine.inspectCurrentVertexSupport(b.vertexRefs[0],b.ref)).toBeDefined();expect(()=>engine.inspectCurrentFaceSupport(b.faces[0],{...b.ref,sourceFeatureId:'foreign'})).toThrow()}
 const a=inventory.bodies[0],old=a.faces[0],b=inventory.bodies[1]
 const oldB={face:structuredClone(b.faces[0]),edge:structuredClone(b.edges[0]),vertex:structuredClone(b.vertexRefs[0])}
 const supportB={face:engine.inspectCurrentFaceSupport(oldB.face,B),edge:engine.inspectCurrentEdgeSupport(oldB.edge,B),vertex:engine.inspectCurrentVertexSupport(oldB.vertex,B)}
 const changed=document(),f=changed.features[0];if(f.type!=='importedBodies')throw Error('base');f.bodies[0].source=translated
 engine.rebuildForAssemblyReferences(changed.features);expect(()=>engine.inspectCurrentFaceSupport(old,A)).toThrow()
 // Persisted references from the independent B source remain exactly usable;
 // the expected supports were observed before A changed, not rebuilt B keys.
 expect(engine.inspectCurrentFaceSupport(oldB.face,B)).toEqual(supportB.face)
 expect(engine.inspectCurrentEdgeSupport(oldB.edge,B)).toEqual(supportB.edge)
 expect(engine.inspectCurrentVertexSupport(oldB.vertex,B)).toEqual(supportB.vertex)
 checkBody(engine,B,240,248,[[12,-4,7],[22,2,11]])
 }finally{engine.dispose()}
})
it('suppresses/reactivates the complete base and preserves it through document history',()=>{
 const d=document(),suppressed=structuredClone(d);suppressed.features[0].suppressed=true;const h=new DocumentHistory(d),engine=new CadEngine();try{const off=engine.build(suppressed.features);expect(off.featureErrors).toEqual([]);expect(off.bodyCatalogActive).toBe(false);expect(off.bodies??[]).toEqual([]);expect(()=>engine.export('step')).toThrow();healthy(engine,d);h.apply(suppressed);expect(h.undo()).toEqual(d);expect(h.redo()).toEqual(suppressed);healthy(engine,parseDocument(serializeDocument(d)))}finally{engine.dispose()}
})
it('does not stage or publish body A when the second real source is an open shell',()=>{
 const d=document(),f=d.features[0];if(f.type!=='importedBodies')throw Error('base');f.bodies[1].source=open;const engine=new CadEngine(),stage=vi.spyOn(NativeBodyCatalog.prototype,'stageNewMany');try{const result=engine.build(d.features);expect(result.featureErrors.map(e=>e.id)).toEqual(['import-base']);expect(stage).not.toHaveBeenCalled();expect(result.bodyCatalogActive).toBe(false);expect(result.bodies??[]).toEqual([]);expect(()=>engine.copyCurrentBodyShape(A)).toThrow();expect(()=>engine.export('step')).toThrow();healthy(engine,document())}finally{stage.mockRestore();engine.dispose()}
})
it('fails before native source resolution for duplicate IDs and sparse/executable source tables',()=>{
 const engine=new CadEngine(),read=vi.spyOn(step,'importStepSolid');let accesses=0;const f=base(),duplicate={...f,bodies:[f.bodies[0],f.bodies[0]]},sparse={...f,bodies:[f.bodies[0],,]},getter={...f,get bodies(){accesses++;return f.bodies}}
 try{for(const raw of [duplicate,sparse,getter]){const result=engine.build([raw as Feature]);expect(result.featureErrors).toHaveLength(1);expect(result.bodies??[]).toEqual([]);expect(()=>engine.export('step')).toThrow()}expect(read).not.toHaveBeenCalled();expect(accesses).toBe(0)}finally{read.mockRestore();engine.dispose()}
})
it('drains temporary imports and retires the adopted candidate if a source release fails after the single transaction',()=>{
 const d=document(),engine=new CadEngine(),actual=step.importStepSolid,failure=Error('Original temporary source release failure'),released:number[]=[];let imports=0
 const read=vi.spyOn(step,'importStepSolid').mockImplementation(source=>{const shape=actual(source),index=imports++;released[index]=0;const release=shape.delete.bind(shape);Object.defineProperty(shape,'delete',{configurable:true,value:()=>{released[index]++;release();if(index===0)throw failure}});return shape}),stage=vi.spyOn(NativeBodyCatalog.prototype,'stageNewMany')
 try{expect(()=>engine.build(d.features)).toThrow(AggregateError);expect(stage).toHaveBeenCalledTimes(1);expect(released).toEqual([1,1]);expect(()=>engine.copyCurrentBodyShape(A)).toThrow();expect(()=>engine.export('step')).toThrow()}finally{read.mockRestore();stage.mockRestore();engine.dispose()}
})

for(const oldFirst of [false,true])for(const suppressed of [false,true])it('shares first-unique-base enforcement with legacy STEP, oldFirst='+oldFirst+', suppressed='+suppressed,()=>{
 const legacy:Feature={id:'legacy-base',name:'Original legacy STEP',type:'importedSolid',source:original,suppressed},explicit=base();explicit.suppressed=suppressed
 const features:Feature[]=oldFirst?[legacy,{...base(),id:'second-base'}]:[explicit,{...legacy,id:'second-base'}],engine=new CadEngine()
 try{const result=engine.build(features);expect(result.featureErrors.map(e=>e.id)).toEqual(['second-base']);expect(()=>engine.export('step')).toThrow()}finally{engine.dispose()}
})
