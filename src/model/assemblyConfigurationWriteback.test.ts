import {describe,it,expect} from 'vitest'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {evaluateAssemblyConfiguration} from './assemblyConfigurationCore'
import {stageAssemblyConfigurationSolveState,type AssemblyConfigurationSolveStateUpdate} from './assemblyConfigurationWriteback'
import {identityRigidPose} from './rigidPose'
import type {AssemblyDocument,EmbeddedAssemblyDefinition,AssemblyAxisReference} from './assemblyDocument'
// UNATTESTED keys test declaration-only writeback, never native axis membership.
const axis=(id:'a'|'b'):AssemblyAxisReference=>({kind:'face',component:{occurrencePath:[id],definition:{id:id==='a'?'configuration-A':'configuration-B',revision:'r1'}},body:null,face:{sourceFeatureId:'solid',key:'face-v1|UNATTESTED-writeback-axis'},support:'axis'})
const owner=(document:AssemblyDocument)=>document.definitions.find(d=>d.id==='configuration-S') as EmbeddedAssemblyDefinition
function setup(configuration:string|null=null){
 const {document,catalog}=assemblyConfigurationCoreFixture()
 const update:AssemblyConfigurationSolveStateUpdate={definition:{id:'configuration-S',revision:'s-r1'},configuration,
  poses:[{id:'a',pose:identityRigidPose()},{id:'b',pose:{translation:[6,0,0],rotation:[0,0,0,1]}}],gearAngles:[],screwAngles:[],rackPinionAngles:[]}
 return {document,catalog,update}
}
describe('original configured state writeback declarations',()=>{
 it('writes one named state while retaining source, selector, suppression and independent ownership',()=>{
  const {document,catalog,update}=setup('compact'),before=JSON.stringify({document,catalog})
  const result=stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)
  expect(JSON.stringify(result.document)).toBe(JSON.stringify(document))
  const variant=result.catalog[1].configurations[0]
  expect(variant.occurrences[0]).toEqual({occurrenceId:'b',pose:{translation:[6,0,0],rotation:[0,0,0,1]}})
  expect(result.catalog[1].configurations[1]).toEqual(catalog[1].configurations[1])
  expect(JSON.stringify({document,catalog})).toBe(before)
  update.poses[1].pose.translation[0]=99;expect(variant.occurrences[0].pose!.translation[0]).toBe(6)
  expect(Object.isFrozen(variant.occurrences[0].pose!.translation)).toBe(true)
 })
 it('isolates every named inherited pose including dormant suppressed variants before base writeback',()=>{
  const {document,catalog,update}=setup(),before=JSON.stringify({document,catalog})
  const result=stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)
  expect(owner(result.document as AssemblyDocument).occurrences[1].pose.translation).toEqual([6,0,0])
  expect(result.catalog[1].configurations[0].occurrences[0].pose!.translation).toEqual([4,0,0])
  expect(result.catalog[1].configurations[1].occurrences[0]).toEqual({occurrenceId:'b',suppressed:true,pose:{translation:[10,0,0],rotation:[0,0,0,1]}})
  expect(JSON.stringify({document,catalog})).toBe(before)
 })
 it('retains complete mechanical neutral captures and isolates base winding in all named variants',()=>{
  const {document,catalog,update}=setup()
  owner(document).mates=[{id:'g',name:'Original authored gear declaration',type:'gear',suppressed:true,
   first:axis('a'),second:axis('b'),carrier:null,
   ratio:{numerator:1,denominator:2},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0},phase:7}]
  update.gearAngles=[{mateId:'g',first:4*Math.PI,second:-2*Math.PI}]
  const result=stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)
  const gear=owner(result.document as AssemblyDocument).mates[0]
  expect(gear).toMatchObject({suppressed:true,phase:7,angles:{first:4*Math.PI,second:-2*Math.PI},neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]}})
  for(const variant of result.catalog[1].configurations)expect(variant.mates[0]).toMatchObject({mateId:'g',suppressed:true,capture:{type:'gear',angles:{first:0,second:0},phase:7}})
 })
 it.each(['missing','extra','duplicate','fixed','undefined','getter'] as const)('rejects %s output atomically without executable reads',kind=>{
  const {document,catalog,update}=setup(),before=JSON.stringify({document,catalog});let reads=0
  if(kind==='missing')update.poses.pop()
  if(kind==='extra')update.poses.push({id:'unknown',pose:identityRigidPose()})
  if(kind==='duplicate')update.poses.push(update.poses[0])
  if(kind==='fixed')owner(document).occurrences[1].fixed=true
  if(kind==='undefined')Object.defineProperty(update,'gearAngles',{value:undefined,enumerable:true})
  if(kind==='getter')Object.defineProperty(update,'poses',{get(){reads++;return []},enumerable:true})
  const actualBefore=JSON.stringify(document)
  expect(()=>stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)).toThrow();expect(reads).toBe(0)
  expect(JSON.stringify(document)).toBe(actualBefore);if(kind!=='fixed')expect(JSON.stringify({document,catalog})).toBe(before)
 })
 it('requires all passive outputs and rejects unavailable mechanical references',()=>{
  const {document,catalog,update}=setup()
  owner(document).mates=[{id:'s',name:'Original screw',type:'screw',suppressed:true,
   first:axis('a'),second:axis('b'),lead:2,reverse:false,alignment:'aligned',neutralRotation:[0,0,0,1],angle:0,neutralTravel:3}]
  expect(()=>stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)).toThrow()
  update.screwAngles=[{mateId:'s',angle:2*Math.PI}];owner(document).occurrences[0].suppressed=true;update.poses=update.poses.filter(p=>p.id!=='a')
  expect(()=>stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)).toThrow(/Unavailable mechanical/)
 })
 it('retains hidden active bodies and excludes suppressed direct bodies',()=>{
  const {document,catalog,update}=setup('single');owner(document).occurrences[0].visible=false
  update.poses=[{id:'a',pose:identityRigidPose()}]
  const result=stageAssemblyConfigurationSolveState(document,catalog,'single-right',update)
  const scope=evaluateAssemblyConfiguration(result.document as AssemblyDocument,result.catalog as never,'single-right').scopes.find(s=>s.path[0]==='right')!
  expect(scope.occurrences[0].visible).toBe(false);expect(scope.occurrences[1].suppressed).toBe(true)
 })
})



it('updates named lifted angles without replacing its neutral frames, suppression or unrelated captures',()=>{
 const {document,catalog,update}=setup('compact')
 owner(document).mates=[{id:'s',name:'Original authored screw',type:'screw',suppressed:false,first:axis('a'),second:axis('b'),lead:2,reverse:true,alignment:'opposed',neutralRotation:[0,0,0,1],angle:0,neutralTravel:3}]
 catalog[1].configurations[0].mates=[{mateId:'s',suppressed:true,capture:{type:'screw',neutralRotation:[0,0,1,0],neutralTravel:9,angle:6*Math.PI}}]
 update.screwAngles=[{mateId:'s',angle:8*Math.PI+.25}]
 const before=JSON.stringify({document,catalog}),result=stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)
 expect(result.catalog[1].configurations[0].mates[0]).toEqual({mateId:'s',suppressed:true,capture:{type:'screw',neutralRotation:[0,0,1,0],neutralTravel:9,angle:8*Math.PI+.25}})
 expect(result.document).toEqual(document);expect(result.catalog[1].configurations[1]).toEqual(catalog[1].configurations[1]);expect(JSON.stringify({document,catalog})).toBe(before)
})
it('rejects an unavailable passive role even with every output supplied',()=>{
 const {document,catalog,update}=setup()
 owner(document).mates=[{id:'s',name:'Original stale screw',type:'screw',suppressed:true,first:{...axis('a'),component:{occurrencePath:['missing'],definition:{id:'configuration-A',revision:'r1'}}},second:axis('b'),lead:2,reverse:false,alignment:'aligned',neutralRotation:[0,0,0,1],angle:0,neutralTravel:0}]
 update.screwAngles=[{mateId:'s',angle:0}]
 const before=JSON.stringify({document,catalog})
 expect(()=>stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)).toThrow(/Unavailable mechanical/)
 expect(JSON.stringify({document,catalog})).toBe(before)
})
it('rejects base-inheritance materialization exceeding the existing override cap atomically',()=>{
 const {document,catalog,update}=setup()
 const source=owner(document),prototype=source.occurrences[0]
 source.occurrences=Array.from({length:64},(_,i)=>({...structuredClone(prototype),id:'body-'+i,name:'Original '+i}))
 document.occurrences=[document.occurrences[0]]
 catalog[0].configurations=[]
 catalog[1].configurations=Array.from({length:64},(_,i)=>({id:'variant-'+i,name:'Original '+i,occurrences:[],mates:[]}))
 // 64*64 pose overrides exactly reach4096; one pre-existing mate override
 // makes the complete normalized catalog exceed that unchanged limit.
 source.mates=[{id:'distance',name:'Original authored distance',type:'distance',suppressed:true,first:{kind:'principal-plane',component:null,plane:'XY'},second:{kind:'principal-plane',component:null,plane:'XY'},distance:0,alignment:'aligned'}]
 catalog[1].configurations[0].mates=[{mateId:'distance',suppressed:true}]
 update.poses=source.occurrences.map(o=>({id:o.id,pose:{translation:[1,0,0],rotation:[0,0,0,1]}}))
 const before=JSON.stringify({document,catalog})
 expect(()=>stageAssemblyConfigurationSolveState(document,catalog,null,update)).toThrow()
 expect(JSON.stringify({document,catalog})).toBe(before)
})

function rackWritebackFixture(configuration:string|null) {
 const input=setup(configuration)
 // Original declaration-only A/B producer locators; UNATTESTED topology has
 // no native radius, edge membership or capture authority in this pure test.
 owner(input.document).mates=[{id:'rack',name:'Original authored rack transmission',type:'rack-pinion',suppressed:false,
  first:axis('a'),second:{kind:'edge',component:{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}},body:null,
   edge:{sourceFeatureId:'solid',key:'edge-v1|UNATTESTED-writeback-rack'},support:'line'},
  conversion:{mode:'diameter',override:8},reverse:true,neutralRotation:[0,0,1,0],neutralTravel:-3,angle:-6*Math.PI+.125}]
 input.catalog[1].configurations[0].mates=[{mateId:'rack',suppressed:true,capture:{type:'rack-pinion',neutralRotation:[1,0,0,0],neutralTravel:17,angle:10*Math.PI+.5}}]
 input.catalog[1].configurations.push({id:'dormant-rack',name:'Original inherited rack state',occurrences:[],mates:[]})
 input.update.rackPinionAngles=[{mateId:'rack',angle:-12*Math.PI-.25}]
 return input
}
it('writes only named rack winding while preserving its complete neutral capture and conversion intent',()=>{
 const {document,catalog,update}=rackWritebackFixture('compact'),before=JSON.stringify({document,catalog})
 const result=stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)
 expect(result.document).toEqual(document)
 expect(result.catalog[1].configurations[0].mates).toEqual([{mateId:'rack',suppressed:true,capture:{type:'rack-pinion',neutralRotation:[1,0,0,0],neutralTravel:17,angle:-12*Math.PI-.25}}])
 expect(result.catalog[1].configurations.slice(1)).toEqual(catalog[1].configurations.slice(1))
 const effective=evaluateAssemblyConfiguration(result.document as AssemblyDocument,result.catalog as never,'mixed').scopes.find(s=>s.path[0]==='right')!.mates[0]
 expect(effective).toMatchObject({type:'rack-pinion',conversion:{mode:'diameter',override:8},reverse:true,suppressed:true,neutralRotation:[1,0,0,0],neutralTravel:17,angle:-12*Math.PI-.25})
 expect(JSON.stringify({document,catalog})).toBe(before)
})
it('isolates inherited rack captures across named and dormant states before changing base winding',()=>{
 const {document,catalog,update}=rackWritebackFixture(null),before=JSON.stringify({document,catalog})
 const result=stageAssemblyConfigurationSolveState(document,catalog,'mixed',update)
 const changed=owner(result.document as AssemblyDocument).mates[0]
 expect(changed).toEqual({...owner(document).mates[0],angle:-12*Math.PI-.25})
 expect(result.catalog[1].configurations[0].mates).toEqual(catalog[1].configurations[0].mates)
 for(const index of [1,2])expect(result.catalog[1].configurations[index].mates).toEqual([{mateId:'rack',suppressed:false,capture:{type:'rack-pinion',neutralRotation:[0,0,1,0],neutralTravel:-3,angle:-6*Math.PI+.125}}])
 expect(result.catalog[1].configurations[1].occurrences[0].suppressed).toBe(true)
 expect(JSON.stringify({document,catalog})).toBe(before)
})
