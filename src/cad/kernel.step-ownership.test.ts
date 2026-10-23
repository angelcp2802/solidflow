import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createStepSource, type StepSource } from '../model/stepSource'
import { importStepSolid } from './kernel.step'
import { NativeCleanupError, NativeOwners } from './kernel.native-ownership'

let box:StepSource,open:StepSource
beforeAll(async()=>{
 setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined,printErr:()=>undefined}))
 box=createStepSource(new Uint8Array(await readFile(new URL('./fixtures/step-import/box-mm.step',import.meta.url))))
 open=createStepSource(new Uint8Array(await readFile(new URL('./fixtures/step-import/open-shell-mm.step',import.meta.url))))
},60_000)
const files=()=>getOC().FS.readdir('/').sort()
const noFiles=()=>expect(files().filter((name:string)=>name.startsWith('solidflow-import-'))).toEqual([])
it('refuses the first occupied import path before reader or write, preserving all foreign bytes',()=>{
 const oc=getOC(),path='/solidflow-import-1.step',bytes=new Uint8Array([7,19,41,83]);oc.FS.writeFile(path,bytes);const before=files(),read=vi.spyOn(oc.STEPControl_Reader.prototype,'ReadFile')
 try{expect(()=>importStepSolid(box)).toThrow('ocupada');expect(read).not.toHaveBeenCalled();expect(new Uint8Array(oc.FS.readFile(path))).toEqual(bytes);expect(files()).toEqual(before)}finally{read.mockRestore();oc.FS.unlink(path)}
})
interface Record {value:{delete():void};releases:number}
function observe<T>(operation:(records:Record[])=>T,patch:(value:{delete():void})=>void=()=>{}):T{
 const records:Record[]=[],seen=new WeakSet<object>(),original=NativeOwners.prototype.own
 const spy=vi.spyOn(NativeOwners.prototype,'own').mockImplementation(function<S extends {delete():void}>(this:NativeOwners,value:S):S{
  if(!seen.has(value)){seen.add(value);patch(value);const record={value,releases:0},release=value.delete.bind(value);records.push(record);Object.defineProperty(value,'delete',{configurable:true,value:()=>{record.releases++;release()}})}
  return original.call(this,value) as S
 })
 try{return operation(records)}finally{spy.mockRestore()}
}
it('transfers a valid original solid only after every other received owner and file has closed',()=>{
 observe(records=>{const solid=importStepSolid(box);try{expect(solid.isNull).toBe(false);expect(records.filter(r=>r.releases===0).map(r=>r.value)).toEqual([solid]);noFiles()}finally{solid.delete()}expect(records.length).toBeGreaterThan(10);expect(records.every(r=>r.releases===1)).toBe(true)})
})
it('rejects the actual open-shell fixture and releases every received native owner',()=>{
 observe(records=>{expect(()=>importStepSolid(open)).toThrow();expect(records.length).toBeGreaterThan(1);expect(records.every(r=>r.releases===1)).toBe(true);noFiles()})
})
for(const fault of ['query','reader release','raw release','unlink','query and cleanup'] as const)it('withholds any result and drains ownership after '+fault,()=>{
 const oc=getOC(),primary=Error('Original STEP read failure'),readerFailure=Error('Original STEP reader release failure'),fileFailure=Error('Original STEP unlink failure'),unlink=oc.FS.unlink.bind(oc.FS);let patched=false,published=false
 const file=vi.spyOn(oc.FS,'unlink').mockImplementation((...args:Parameters<typeof unlink>)=>{const result=unlink(...args);if((fault==='unlink'||fault==='query and cleanup')&&String(args[0]).startsWith('/solidflow-import-'))throw fileFailure;return result})
 try{observe(records=>{
  let error:unknown
  try{const result=importStepSolid(box);published=true;result.delete()}catch(caught){error=caught}
  expect(error).toBeDefined();expect(published).toBe(false);expect(records.length).toBeGreaterThan(1);expect(records.filter(r=>r.releases!==1)).toEqual([]);noFiles()
  if(fault==='query')expect(error).toBe(primary)
  else if(fault==='query and cleanup'){expect(error).toBeInstanceOf(NativeCleanupError);expect((error as AggregateError).errors).toEqual([primary,readerFailure,fileFailure])}
  else expect(error).toBeInstanceOf(NativeCleanupError)
 },value=>{
  if(value instanceof oc.STEPControl_Reader){
   if(fault==='query'||fault==='query and cleanup'){const read=value.ReadFile.bind(value);Object.defineProperty(value,'ReadFile',{configurable:true,value:(...args:Parameters<typeof read>)=>{read(...args);throw primary}})}
   if(fault==='reader release'||fault==='query and cleanup'){const release=value.delete.bind(value);Object.defineProperty(value,'delete',{configurable:true,value:()=>{release();throw readerFailure}})}
  }
  if(fault==='raw release'&&!patched&&value instanceof oc.TopoDS_Shape){patched=true;const release=value.delete.bind(value);Object.defineProperty(value,'delete',{configurable:true,value:()=>{release();throw readerFailure}})}
 });if(fault==='raw release')expect(patched).toBe(true)}finally{file.mockRestore()}
})
