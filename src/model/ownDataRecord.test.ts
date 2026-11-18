import {expect,it} from 'vitest'
import {captureOwnDataRecord} from './ownDataRecord'
import {validateAssemblyCylinderTangentBranch} from './assemblyCylinderTangentMates'
import {validateAssemblyInterferenceOptions} from './assemblyInterference'
import {validateAssemblyComponentMotion} from './assemblyMotion'
import {validateAssemblyMoveIntent} from './assemblyMovement'
import {prepareAssemblyPartReplacement} from './assemblyReplacement'
import {assemblySourceScopePaths} from './assemblySourceUpdates'
import {validateAssemblyTranslationStopOptions} from './assemblyTranslation'
import {createEmptyAssembly} from '../examples/assembly'

// Original pure intent data only. No CAD topology, file grants or native proof.
const component={occurrencePath:['original-leaf'],definition:{id:'original-part',revision:'r1'}}
const pose={translation:[1,2,3],rotation:[0,0,0,1]}
const cases=[
 {name:'cylinder branch',value:()=>({kind:'external'}),field:'kind',call:(v:unknown)=>validateAssemblyCylinderTangentBranch(v)},
 {name:'interference',value:()=>({clearance:1}),field:'clearance',call:(v:unknown)=>validateAssemblyInterferenceOptions(v as never)},
 {name:'motion',value:()=>({component,translation:[1,2,3],rotation:{axis:2,angle:.25}}),field:'rotation',call:(v:unknown)=>validateAssemblyComponentMotion(v)},
 {name:'movement',value:()=>({component,pose}),field:'pose',call:(v:unknown)=>validateAssemblyMoveIntent(v)},
 {name:'replacement',value:()=>({component,mode:'all',part:{},revision:'r2',ancestorRevisions:[]}),field:'part',call:(v:unknown)=>prepareAssemblyPartReplacement(createEmptyAssembly('Original pure replacement'),v as never)},
 {name:'source update',value:()=>({id:'original-assembly',revision:'r1'}),field:'id',call:(v:unknown)=>assemblySourceScopePaths(createEmptyAssembly('Original pure source'),v as never)},
 {name:'translation',value:()=>({clearance:0}),field:'clearance',call:(v:unknown)=>validateAssemblyTranslationStopOptions(v as never)},
]
it.each(cases)('rejects own dangerous keys in $name without changing any object prototype',row=>{
 const prototypeKeys=Reflect.ownKeys(Object.prototype)
 for(const key of ['__proto__','constructor','prototype']){
  const value=row.value()
  Object.defineProperty(value,key,{enumerable:true,value:{originalPollutionMarker:true}})
  expect(()=>row.call(value)).toThrow()
 }
 expect(Reflect.ownKeys(Object.prototype)).toEqual(prototypeKeys)
 expect(Object.hasOwn(Object.prototype,'originalPollutionMarker')).toBe(false)
})
it.each(cases)('rejects recognized accessor fields in $name before executing them',row=>{
 const value=row.value();let reads=0
 Object.defineProperty(value,row.field,{enumerable:true,get(){reads++;throw Error('Accessor must not execute')}})
 expect(()=>row.call(value)).toThrow();expect(reads).toBe(0)
})
it('captures descriptor values in a Map and preserves presence versus explicit undefined',()=>{
 const input=Object.assign(Object.create(null),{first:1,optional:undefined})
 const result=captureOwnDataRecord(input,['first','optional'],['first'])
 expect(result).toBeInstanceOf(Map);expect(result.get('first')).toBe(1);expect(result.has('optional')).toBe(true);expect(result.get('optional')).toBeUndefined()
 input.first=9;expect(result.get('first')).toBe(1)
 expect(captureOwnDataRecord({first:1},['first','optional'],['first']).has('optional')).toBe(false)
 expect(()=>captureOwnDataRecord({},['first'])).toThrow(/obligatorios/)
})
it('rejects hidden, symbolic, inherited and serialization hooks without executing them',()=>{
 let reads=0
 const hidden=Object.defineProperty({first:1},'extra',{value:2}),symbolic=Object.defineProperty({first:1},Symbol('extra'),{value:2,enumerable:true})
 const hook={first:1,toJSON(){reads++;return {first:1}}}
 for(const input of [hidden,symbolic,hook,Object.assign(Object.create({first:1}),{first:1}),[1],null])expect(()=>captureOwnDataRecord(input,['first'])).toThrow()
 expect(reads).toBe(0)
})
it('retains valid null-prototype intent and optional defaults in public APIs',()=>{
 expect(validateAssemblyCylinderTangentBranch(Object.assign(Object.create(null),{kind:'internal',larger:'second'}))).toEqual({kind:'internal',larger:'second'})
 expect(validateAssemblyInterferenceOptions(Object.create(null))).toEqual(validateAssemblyInterferenceOptions())
 expect(validateAssemblyTranslationStopOptions(Object.create(null))).toEqual(validateAssemblyTranslationStopOptions())
 const moving=Object.assign(Object.create(null),{component:structuredClone(component),pose:structuredClone(pose)})
 const checked=validateAssemblyMoveIntent(moving);moving.pose.translation[0]=99;expect(checked.pose.translation).toEqual([1,2,3])
 expect(()=>validateAssemblyInterferenceOptions({clearance:undefined})).toThrow()
 expect(()=>validateAssemblyTranslationStopOptions({maxQueries:undefined})).toThrow()
})
