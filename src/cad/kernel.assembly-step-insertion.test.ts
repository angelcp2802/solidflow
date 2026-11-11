import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC,importSTEP,measureShapeVolumeProperties} from 'replicad'
import {withNativeOwners} from './kernel.native-ownership'
import {beforeAll,expect,it,vi} from 'vitest'
import {createEmptyAssembly,createAssemblyExample} from '../examples/assembly'
import {validateAssemblyDocument,serializeAssemblyDocument,type AssemblyDocument} from '../model/assemblyDocument'
import {createStepSource,type StepSource} from '../model/stepSource'
import {assemblyStepMultibodyFixture} from './kernel.assembly-step-multibody-fixture.test-utils'
import {exportAssemblyStepStructureNative} from './kernel.assembly-step-export'
import * as scenes from './kernel.assembly-scene'
import {KernelDispatcher} from './kernel.dispatcher'
import type {AssemblyPreviewReply} from './kernel.assembly-types'
import type {Feature} from './kernel.types'

const stamp='2026-10-23T00:00:00.000Z'
const features:Feature[]=[
 {id:'profile',name:'Original2x3',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[1,1.5],width:2,height:3}},
 {id:'solid',name:'Originaldepth4',type:'extrude',sketchId:'profile',depth:4,symmetric:false,suppressed:false},
]
function parent():AssemblyDocument {
 const document=createEmptyAssembly('Original insertion parent')
 document.id='insertion-parent';document.revision='parent-r1';document.createdAt=stamp;document.updatedAt=stamp
 document.definitions=[{kind:'part',id:'parent-part',revision:'r1',document:{version:1,id:'parent-part',name:'Own original box',units:'mm',createdAt:stamp,updatedAt:stamp,features:structuredClone(features)}}]
 document.occurrences=[{id:'own',name:'Parent own',definition:{id:'parent-part',revision:'r1'},pose:{translation:[-20,0,0],rotation:[0,0,0,1]},fixed:true,suppressed:false,visible:true}]
 return validateAssemblyDocument(document)
}
let source:StepSource
beforeAll(async()=>{
 setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined}))
 source=createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(assemblyStepMultibodyFixture()).arrayBuffer()))
},60_000)

it('admits a complete independent eight-body graph while retaining the parent geometry and exact reference locators',()=>{
 const dispatcher=new KernelDispatcher(),current=parent(),saved=serializeAssemblyDocument(current),before=scenes.buildAssemblyScene(current)
 try {
  const candidate=dispatcher.handle({id:1,action:'insert-assembly-step',current,source}) as AssemblyDocument
  expect(candidate.id).toBe(current.id);expect(candidate.revision).toBe(current.revision)
  expect(candidate.name).toBe(current.name);expect(candidate.createdAt).toBe(current.createdAt)
  expect(candidate.definitions.find(d=>d.id==='parent-part')).toEqual(current.definitions[0])
  expect(candidate.occurrences[0]).toEqual(current.occurrences[0]);expect(candidate.occurrences).toHaveLength(2)
  const added=candidate.occurrences[1];expect(added.pose).toEqual({translation:[0,0,0],rotation:[0,0,0,1]})
  expect(added.fixed).toBe(false);expect(added.visible).toBe(true);expect(added.suppressed).toBe(false)
  const after=scenes.buildAssemblyScene(candidate)
  expect(after.solidCount).toBe(9);expect(after.bodies).toHaveLength(9)
  expect(Math.abs(after.volume-160)).toBeLessThan(1e-5);expect(Math.abs(after.area-396)).toBeLessThan(1e-5)
  const own=after.bodies.find(b=>b.component.occurrencePath[0]==='own')!
  expect(own).toEqual(before.bodies[0])
  const imported=after.bodies.filter(b=>b.component.occurrencePath[0]===added.id)
  expect(imported).toHaveLength(8)
  const expectedBounds=[
   [[97,0,18],[100,4,20]],[[98,0,9],[100,5,10]],[[100,0,8],[104,3,10]],[[89,0,20],[90,5,22]],
   [[0,80,0],[4,82,3]],[[0,90,0],[5,91,2]],[[0,90,-4],[3,92,0]],[[0,78,10],[5,80,11]],
  ]
  for(const body of imported){
   const matches=expectedBounds.filter(([min,max])=>min.every((v,i)=>Math.abs(v-body.bounds.min[i])<=1e-6)&&max.every((v,i)=>Math.abs(v-body.bounds.max[i])<=1e-6))
   expect(matches).toHaveLength(1);expectedBounds.splice(expectedBounds.indexOf(matches[0]),1)
  }
  expect(expectedBounds).toHaveLength(0)
  expect(serializeAssemblyDocument(current)).toBe(saved)
 }finally{dispatcher.dispose()}
})

it('inserts into one shared definition so both real nested instances contain the new autonomous graph',()=>{
 const dispatcher=new KernelDispatcher(),current=parent(),own=current.occurrences[0]
 current.definitions.push({kind:'assembly',id:'shared',revision:'s-r1',name:'Shared original scope',createdAt:stamp,updatedAt:stamp,mates:[],occurrences:[own]})
 current.occurrences=['left','right'].map((id,i)=>({id,name:id,definition:{id:'shared',revision:'s-r1'},pose:{translation:[0,i*200,0],rotation:[0,0,0,1]},fixed:true,suppressed:false,visible:true}))
 const saved=serializeAssemblyDocument(current)
 try{
  const candidate=dispatcher.handle({id:1,action:'insert-assembly-step',current,source,scope:{id:'shared',revision:'s-r1'}}) as AssemblyDocument
  expect(candidate.occurrences).toEqual(current.occurrences)
  const shared=candidate.definitions.find(d=>d.id==='shared');expect(shared?.kind).toBe('assembly')
  if(shared?.kind!=='assembly')throw Error('Shared scope absent')
  expect(shared.occurrences).toHaveLength(2);expect(shared.occurrences[0]).toEqual(own)
  const scene=scenes.buildAssemblyScene(candidate)
  expect(scene.solidCount).toBe(18);expect(Math.abs(scene.volume-320)).toBeLessThan(1e-5);expect(Math.abs(scene.area-792)).toBeLessThan(1e-5)
  expect(scene.bodies.filter(b=>b.component.occurrencePath[0]==='left')).toHaveLength(9)
  expect(scene.bodies.filter(b=>b.component.occurrencePath[0]==='right')).toHaveLength(9)
  const leftBounds=[
   [[-20,0,0],[-18,3,4]],
   [[97,0,18],[100,4,20]],[[98,0,9],[100,5,10]],[[100,0,8],[104,3,10]],[[89,0,20],[90,5,22]],
   [[0,80,0],[4,82,3]],[[0,90,0],[5,91,2]],[[0,90,-4],[3,92,0]],[[0,78,10],[5,80,11]],
  ]
  for(const [owner,dy] of [['left',0],['right',200]] as const){
   // Literal source placements plus an independent 200 mm Y translation;
   // no production pose-composition helper supplies these expected boxes.
   const remaining=leftBounds.map(([min,max])=>[min.map((v,i)=>v+(i===1?dy:0)),max.map((v,i)=>v+(i===1?dy:0))])
   const bodies=scene.bodies.filter(body=>body.component.occurrencePath[0]===owner)
   expect(new Set(bodies.map(body=>JSON.stringify([body.component,body.body]))).size).toBe(9)
   for(const body of bodies){
    const matches=remaining.filter(([min,max])=>min.every((v,i)=>Math.abs(v-body.bounds.min[i])<=1e-6)&&max.every((v,i)=>Math.abs(v-body.bounds.max[i])<=1e-6))
    expect(matches).toHaveLength(1);remaining.splice(remaining.indexOf(matches[0]),1)
   }
   expect(remaining).toHaveLength(0)
  }
  const leftKeys=new Set(scene.bodies.filter(body=>body.component.occurrencePath[0]==='left').map(body=>JSON.stringify([body.component,body.body])))
  expect(scene.bodies.filter(body=>body.component.occurrencePath[0]==='right').every(body=>!leftKeys.has(JSON.stringify([body.component,body.body])))).toBe(true)
  expect(serializeAssemblyDocument(current)).toBe(saved)
 }finally{dispatcher.dispose()}
})

it('withholds scene failure and malformed input without consuming a cached part or pending private preview',async()=>{
 const part=new KernelDispatcher(),assembly=new KernelDispatcher(),current=createAssemblyExample()
 try{
  part.handle({id:1,action:'build',features})
  const preview=assembly.handle({id:1,action:'preview-assembly',current,proposed:current}) as AssemblyPreviewReply
  expect(preview.status).toBe('ready');if(preview.status!=='ready')throw Error(preview.message)
  const malformed=createStepSource(new TextEncoder().encode('not STEP'))
  expect(()=>part.handle({id:2,action:'insert-assembly-step',current:parent(),source:malformed})).toThrow()
  expect(()=>assembly.handle({id:2,action:'insert-assembly-step',current,source:malformed})).toThrow()
  const failure=vi.spyOn(scenes,'buildAssemblyScene').mockImplementationOnce(()=>{throw Error('Insertion scene rejected')}).mockImplementationOnce(()=>{throw Error('Insertion scene rejected')})
  try{
   expect(()=>part.handle({id:3,action:'insert-assembly-step',current:parent(),source})).toThrow('Insertion scene rejected')
   expect(()=>assembly.handle({id:3,action:'insert-assembly-step',current,source})).toThrow('Insertion scene rejected')
  }finally{failure.mockRestore()}
  const blob=part.handle({id:4,action:'export',format:'step'}) as Blob
  const shape=await importSTEP(blob)
  withNativeOwners(owners=>{owners.own(shape);expect(Math.abs(owners.own(measureShapeVolumeProperties(shape.asShape3D())).volume-24)).toBeLessThan(1e-5)})
  const applied=assembly.handle({id:4,action:'apply-assembly',current,token:preview.token})
  expect(applied && 'kind' in applied && applied.kind).toBe('assembly-applied')
  expect(()=>assembly.handle({id:5,action:'apply-assembly',current,token:preview.token})).toThrow('ya no está disponible')
 }finally{part.dispose();assembly.dispose()}
},60_000)
