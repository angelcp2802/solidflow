import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { serializeAssemblyDocument } from '../model/assemblyDocument'
import { assemblyStepStructureFixture } from './kernel.assembly-step-structure-fixture.test-utils'
import { exportAssemblyStepStructureNative } from './kernel.assembly-step-export'
import { CadEngine } from './kernel.engine'
import * as faces from './kernel.faces'
import * as edges from './kernel.edges'
import * as vertices from './kernel.vertices'
import { NativeCleanupError, NativeOwners, withNativeOwners } from './kernel.native-ownership'
import { stepLengthUnit } from './kernel.step-units'

beforeAll(async () => {
 setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
 // Initialize STEP statics before snapshotting the settings restored by exports.
 withNativeOwners(owners=>{owners.own(new (getOC().STEPCAFControl_Writer)())})
}, 60_000)
const near = (a: number, b: number) => { expect(Number.isFinite(a)).toBe(true); expect(Math.abs(a-b)).toBeLessThanOrEqual(1e-6) }
const settings = () => {const oc=getOC();return [oc.Interface_Static.CVal('xstep.cascade.unit'),oc.Interface_Static.CVal('write.step.unit'),oc.Interface_Static.IVal('write.step.schema'),oc.Interface_Static.IVal('write.step.assembly'),oc.XCAFDoc_ShapeTool.AutoNaming()]}
const noFiles = () => expect(getOC().FS.readdir('/').filter((p:string)=>p.startsWith('solidflow-structure-'))).toEqual([])
const boxes = [
 {v:24,a:52,min:[97,0,18],max:[100,4,20]}, {v:24,a:52,min:[100,0,8],max:[104,3,10]}, {v:10,a:34,min:[89,0,20],max:[90,5,22]},
 {v:24,a:52,min:[0,80,0],max:[4,82,3]}, {v:24,a:52,min:[0,90,-4],max:[3,92,0]}, {v:10,a:34,min:[0,78,10],max:[5,80,11]},
]
let nextRead=0
async function nativeGeometry(blob:Blob,count:number){
 const bytes=new Uint8Array(await blob.arrayBuffer());expect(stepLengthUnit(bytes)).toEqual({millimetersPerUnit:1})
 withNativeOwners(owners=>{
  const oc=getOC(),path='/structure-test-read-'+(++nextRead)+'.step';owners.own({delete(){oc.FS.unlink(path)}});oc.FS.writeFile(path,bytes)
  const reader=owners.own(new oc.STEPControl_Reader());expect(reader.ReadFile(path)).toBe(oc.IFSelect_ReturnStatus.IFSelect_RetDone);reader.SetSystemLengthUnit(1);expect(reader.SystemLengthUnit()).toBe(1);const roots=reader.NbRootsForTransfer();expect(roots).toBeGreaterThan(0);expect(reader.TransferRoots()).toBe(roots)
  const shape=owners.own(reader.OneShape()),check=owners.own(new oc.BRepCheck_Analyzer(shape,true,false,false));expect(check.IsValid()).toBe(true)
  const explorer=owners.own(new oc.TopExp_Explorer(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)),remaining=boxes.slice(0,count).map(b=>({...b,used:false}));let n=0,totalV=0,totalA=0
  while(explorer.More()){
   const solid=owners.own(explorer.Current()),valid=owners.own(new oc.BRepCheck_Analyzer(solid,true,false,false));expect(valid.IsValid()).toBe(true)
   const box=owners.own(new oc.Bnd_Box());oc.BRepBndLib.AddOptimal(solid,box,false,false);const low=owners.own(box.CornerMin()),high=owners.own(box.CornerMax()),min=[low.X(),low.Y(),low.Z()],max=[high.X(),high.Y(),high.Z()]
   const matches=remaining.filter(b=>!b.used&&min.every((x,i)=>Math.abs(x-b.min[i])<=1e-6)&&max.every((x,i)=>Math.abs(x-b.max[i])<=1e-6));expect(matches).toHaveLength(1);matches[0].used=true
   const volume=owners.own(new oc.GProp_GProps()),area=owners.own(new oc.GProp_GProps());oc.BRepGProp.VolumeProperties(solid,volume,false,false,false);oc.BRepGProp.SurfaceProperties(solid,area,false,false);near(volume.Mass(),matches[0].v);near(area.Mass(),matches[0].a);totalV+=volume.Mass();totalA+=area.Mass();n++;explorer.Next()
  }
  expect(n).toBe(count);expect(remaining.every(b=>b.used)).toBe(true);near(totalV,count===6?116:58);near(totalA,count===6?276:138)
 })
}
it('owns a normal native document constructor through independent public smart-handle wrappers',()=>{
 withNativeOwners(owners=>{
  const oc=getOC(),format=owners.own(new oc.TCollection_ExtendedString('XmlXCAF',true)),document=owners.own(new oc.TDocStd_Document(format))
  expect(document.GetRefCount()).toBe(1)
  const main=owners.own(document.Main());expect(main.IsNull()).toBe(false)
  const second=owners.own(oc.TDocStd_Document.Get(main));expect(document.GetRefCount()).toBe(2)
  owners.release(second);expect(owners.cleanupErrors()).toEqual([]);expect(document.GetRefCount()).toBe(1)
  expect(document.IsValid()).toBe(true);expect(owners.own(document.Main()).IsNull()).toBe(false)
 })
})
it('rejects the first occupied export pathname without changing any foreign bytes or filesystem entry',()=>{
 const oc=getOC(),path='/solidflow-structure-1.step',foreign=new Uint8Array([11,23,47,83,131]),prior=settings()
 oc.FS.writeFile(path,foreign)
 const baseline=oc.FS.readdir('/').sort(),perform=vi.spyOn(oc.STEPCAFControl_Writer.prototype,'Perform')
 try{expect(()=>exportAssemblyStepStructureNative(assemblyStepStructureFixture())).toThrow('ocupada');expect(perform).not.toHaveBeenCalled();expect(new Uint8Array(oc.FS.readFile(path))).toEqual(foreign);expect(oc.FS.readdir('/').sort()).toEqual(baseline);expect(settings()).toEqual(prior)}finally{perform.mockRestore();oc.FS.unlink(path)}
})
for(const hiddenRight of [false,true])it('exports reused nested local placements and all active BReps, hiddenRight='+hiddenRight,async()=>{
 const d=assemblyStepStructureFixture({hiddenRight}),before=serializeAssemblyDocument(d),prior=settings(),blob=exportAssemblyStepStructureNative(d),text=await blob.text()
 expect(blob.type).toBe('application/step');expect(text.startsWith('ISO-10303-21;')).toBe(true);expect(text).toMatch(/FILE_SCHEMA/);expect(text).toMatch(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/);expect(text.match(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(/g)).toHaveLength(6)
 // Structural entity presence/count is only a smoke; the separate graph reader
 // establishes definition identity/reuse and names. This reader checks BReps.
 await nativeGeometry(blob,6);expect(serializeAssemblyDocument(d)).toBe(before);expect(settings()).toEqual(prior);noFiles()
})
it('omits the suppressed reused root instance while preserving the retained local graph',async()=>{const d=assemblyStepStructureFixture({suppressedRight:true}),before=serializeAssemblyDocument(d),blob=exportAssemblyStepStructureNative(d);await nativeGeometry(blob,3);expect((await blob.text()).match(/NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(/g)).toHaveLength(5);expect(serializeAssemblyDocument(d)).toBe(before);noFiles()})
it('rejects an active empty assembly subtree before native allocation',()=>{const d=assemblyStepStructureFixture(),s=d.definitions.find(x=>x.id==='structure-S');if(s?.kind!=='assembly')throw Error('assembly');s.occurrences.forEach(o=>o.suppressed=true);const spy=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences');try{expect(()=>exportAssemblyStepStructureNative(d)).toThrow('activa');expect(spy).not.toHaveBeenCalled();noFiles()}finally{spy.mockRestore()}})
it('rebuilds each exact part tuple once despite identical names and geometry',()=>{const d=assemblyStepStructureFixture(),spy=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences');try{expect(exportAssemblyStepStructureNative(d).size).toBeGreaterThan(0);expect(spy).toHaveBeenCalledTimes(3)}finally{spy.mockRestore()}noFiles()})
for(const fault of ['Perform','writer release','file read','file cleanup'] as const)it('withholds bytes and drains owners after '+fault,()=>{
 const oc=getOC();withNativeOwners(owners=>{owners.own(new oc.STEPCAFControl_Writer())});const prior=settings(),d=assemblyStepStructureFixture(),before=serializeAssemblyDocument(d),failure=Error('Original structural STEP fault'),records:{releases:number;kind:string;transfers:number}[]=[]
 const seen=new WeakMap<object,typeof records[number]>(),originalTransfer=NativeOwners.prototype.transfer,originalOwn=NativeOwners.prototype.own,read=oc.FS.readFile.bind(oc.FS),unlink=oc.FS.unlink.bind(oc.FS);let patched=false
 const catalogRecords:{releases:number}[]=[]
 const track=<T extends {dispose():void}>(catalog:T):T=>{const record={releases:0},release=catalog.dispose.bind(catalog);catalogRecords.push(record);Object.defineProperty(catalog,'dispose',{configurable:true,value:()=>{record.releases++;release()}});return catalog}
 const actualFaces=faces.createFaceCatalog,actualEdges=edges.createEdgeCatalog,actualVertices=vertices.createVertexCatalog
 const faceSpy=vi.spyOn(faces,'createFaceCatalog').mockImplementation((...args)=>track(actualFaces(...args)))
 const edgeSpy=vi.spyOn(edges,'createEdgeCatalog').mockImplementation((...args)=>track(actualEdges(...args)))
 const vertexSpy=vi.spyOn(vertices,'createVertexCatalog').mockImplementation((...args)=>track(actualVertices(...args)))
 const transfer=vi.spyOn(NativeOwners.prototype,'transfer').mockImplementation(function(this:NativeOwners,value){const record=seen.get(value);if(record)record.transfers++;originalTransfer.call(this,value)})
 const own=vi.spyOn(NativeOwners.prototype,'own').mockImplementation(function<T extends {delete():void}>(this:NativeOwners,value:T):T{
  if(seen.has(value))return originalOwn.call(this,value) as T
  const record={releases:0,kind:value.constructor.name+':'+value.delete.toString().slice(0,160),transfers:0},release=value.delete.bind(value);records.push(record);seen.set(value,record)
  Object.defineProperty(value,'delete',{configurable:true,value:()=>{record.releases++;release();if(fault==='writer release'&&value instanceof oc.STEPCAFControl_Writer)throw failure}})
  if(fault==='Perform'&&value instanceof oc.STEPCAFControl_Writer){const perform=value.Perform.bind(value);Object.defineProperty(value,'Perform',{configurable:true,value:(...args:Parameters<typeof perform>)=>{perform(...args);throw failure}});patched=true}
  return originalOwn.call(this,value) as T
 })
 const fileRead=vi.spyOn(oc.FS,'readFile').mockImplementation((...args:Parameters<typeof read>)=>{const result=read(...args);if(fault==='file read'&&String(args[0]).startsWith('/solidflow-structure-')){patched=true;throw failure}return result})
 const fileCleanup=vi.spyOn(oc.FS,'unlink').mockImplementation((...args:Parameters<typeof unlink>)=>{const result=unlink(...args);if(fault==='file cleanup'&&String(args[0]).startsWith('/solidflow-structure-')){patched=true;throw failure}return result})
 try{let caught:unknown;try{exportAssemblyStepStructureNative(d)}catch(error){caught=error}expect(caught).toBeDefined();if(fault==='writer release'||fault==='file cleanup')expect(caught).toBeInstanceOf(NativeCleanupError);else expect(patched).toBe(true);expect(records.length).toBeGreaterThan(0);expect(records.filter(r=>r.releases!==1&&! (r.releases===0&&r.transfers===1&&r.kind==='Object:() => catalog.dispose()'))).toEqual([]);expect(records.filter(r=>r.releases===0)).toHaveLength(9);expect(catalogRecords).toHaveLength(9);expect(catalogRecords.every(r=>r.releases===1)).toBe(true);expect(settings()).toEqual(prior);expect(serializeAssemblyDocument(d)).toBe(before);noFiles()}finally{own.mockRestore();transfer.mockRestore();faceSpy.mockRestore();edgeSpy.mockRestore();vertexSpy.mockRestore();fileRead.mockRestore();fileCleanup.mockRestore()}
})
