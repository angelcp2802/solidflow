import {expect,it} from 'vitest'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {createAssemblyConfiguredDocument,serializeAssemblyConfiguredDocument} from './assemblyConfiguredDocument'
import {validateAssemblyMate,type EmbeddedAssemblyDefinition} from './assemblyDocument'
import {
  validateAssemblyConfiguredMechanicalSpec as spec,
  configuredMechanicalMateSpec as project,
  validateAssemblyConfiguredMechanicalEdit as validate,
  inspectAssemblyConfiguredMechanicalEdit as inspect,
  configuredMechanicalMateDeclaration as declaration,
  type AssemblyConfiguredMechanicalSpec,type AssemblyConfiguredMechanicalEdit,
} from './assemblyConfiguredMechanicalEditing'

// Original declaration-only recipes on the project A/B graph. Axis/edge keys
// are UNATTESTED; these tests do not claim native membership or fresh capture.
const owner={id:'configuration-S',revision:'s-r1'},tau=2*Math.PI
const component=(id:'a'|'b')=>({occurrencePath:[id],definition:{id:'configuration-'+id.toUpperCase(),revision:'r1'}})
const axis=(id:'a'|'b')=>({kind:'face' as const,component:component(id),body:null,face:{sourceFeatureId:'solid',key:'face-v1|UNATTESTED-mechanical-intent'},support:'axis' as const})
const edge={kind:'edge' as const,component:component('b'),body:null,edge:{sourceFeatureId:'solid',key:'edge-v1|UNATTESTED-mechanical-intent'},support:'line' as const}
const common=(type:string)=>({id:'original-'+type,name:'Original '+type,suppressed:false})
const recipes:[string,unknown,unknown,unknown][]=[
 ['concentric',{...common('concentric'),type:'concentric',first:axis('a'),second:axis('b'),alignment:'opposed'},
  {type:'concentric',rotationLock:[-1,0,0,0]}, {rotationLock:[-1,0,0,0]}],
 ['lock',{...common('lock'),type:'lock',first:component('a'),second:component('b')},
  {type:'lock',relativePose:{translation:[2,-3,5],rotation:[0,0,0,-1]}}, {relativePose:{translation:[2,-3,5],rotation:[0,0,0,-1]}}],
 ['gear',{...common('gear'),type:'gear',first:axis('a'),second:axis('b'),carrier:null,ratio:{numerator:3,denominator:2},direction:'opposed',phase:.375},
  {type:'gear',neutralRotations:{first:[0,0,0,1],second:[0,0,1,0]},angles:{first:4*tau+.25,second:-6*tau-.5}},
  {neutralRotations:{first:[0,0,0,1],second:[0,0,1,0]},angles:{first:4*tau+.25,second:-6*tau-.5}}],
 ['screw',{...common('screw'),type:'screw',first:axis('a'),second:axis('b'),lead:5,reverse:true,alignment:'aligned'},
  {type:'screw',neutralRotation:[0,1,0,0],neutralTravel:-7,angle:8*tau+.125}, {neutralRotation:[0,1,0,0],neutralTravel:-7,angle:8*tau+.125}],
 ['rack-pinion',{...common('rack-pinion'),type:'rack-pinion',first:axis('a'),second:edge,conversion:{mode:'travel',override:12},reverse:false},
  {type:'rack-pinion',neutralRotation:[1,0,0,0],neutralTravel:9,angle:-10*tau+.75}, {neutralRotation:[1,0,0,0],neutralTravel:9,angle:-10*tau+.75}],
]
function fixture(){
 const f=assemblyConfigurationCoreFixture(),node=f.document.definitions.find(d=>d.id===owner.id) as EmbeddedAssemblyDefinition
 node.mates=recipes.map(([,s,,fields])=>validateAssemblyMate({...s as object,...fields as object}))
 return createAssemblyConfiguredDocument(f.document,f.catalog,'mixed')
}
function edit(value:AssemblyConfiguredMechanicalSpec,kind:'add'|'replace'='add',capture:'retain'|'recapture'='retain'):AssemblyConfiguredMechanicalEdit {
 return {scopePath:['right'],definition:{...owner},configuration:'compact',change:kind==='add'?{kind,spec:value}:{kind,mateId:value.id,capture,spec:value}}
}

it.each(recipes)('normalizes %s specs without exposing a placeholder and assembles only supplied declared capture',(_family,input,capture,fields)=>{
 const parsed=spec(input),before=JSON.stringify(input)
 expect(parsed).toEqual(input)
 const assembled=declaration(parsed,capture)
 expect(assembled).toEqual({...input as object,...fields as object})
 expect(project(assembled)).toEqual(input)
 expect(JSON.stringify(input)).toBe(before)
 expect('nativeAuthority'in parsed).toBe(false);expect('recaptured'in assembled).toBe(false)
})
it.each(recipes)('rejects caller capture fields in a %s spec, including explicit undefined',(_family,input,_capture,fields)=>{
 for(const key of Object.keys(fields as object))for(const value of [(fields as Record<string,unknown>)[key],undefined])expect(()=>spec({...input as object,[key]:value})).toThrow()
 expect(()=>spec({...input as object,unknown:1})).toThrow()
})
it('requires explicit weighted gear phase, keeps it as a parameter, and rejects a second phase in capture',()=>{
 const [,raw,capture]=recipes[2],input=structuredClone(raw) as Record<string,unknown>
 delete input.phase;expect(()=>spec(input)).toThrow()
 const changed=spec({...raw as object,phase:-.75})
 expect(declaration(changed,capture)).toMatchObject({phase:-.75,angles:{first:4*tau+.25,second:-6*tau-.5}})
 expect(()=>declaration(changed,{...capture as object,phase:-.75})).toThrow()
})
it.each(recipes)('retains exact existing %s references while allowing new parameters and names',(_family,input)=>{
 const f=fixture(),value=spec({...input as object,name:'Edited original parameter declaration'})
 if(value.type==='gear'){value.ratio={numerator:5,denominator:7};value.phase=-.5}
 if(value.type==='screw')value.lead=8
 if(value.type==='rack-pinion')value.conversion={mode:'diameter',override:14}
 const before=serializeAssemblyConfiguredDocument(f),result=inspect(f,edit(value,'replace'))
 expect(result.edit.change.spec).toEqual(value)
 expect(result.existing).toEqual((f.source.definitions.find(d=>d.id===owner.id) as EmbeddedAssemblyDefinition).mates.find(m=>m.id===value.id))
 expect(serializeAssemblyConfiguredDocument(f)).toBe(before)
 result.edit.change.spec.name='Changed returned copy'
 expect(serializeAssemblyConfiguredDocument(f)).toBe(before)
})
it('rejects ordered endpoint/carrier/body changes for retain but admits explicit recapture',()=>{
 const f=fixture(),gear=spec(recipes[2][1]);if(gear.type!=='gear')throw Error('Original gear required')
 const changed:AssemblyConfiguredMechanicalSpec[]=[
  {...gear,first:gear.second,second:gear.first},
  {...gear,carrier:component('a')},
  {...gear,first:{...gear.first,body:{bodyId:'other',sourceFeatureId:'solid'}}},
  {...gear,first:{...gear.first,component:{...gear.first.component,definition:{...gear.first.component.definition,revision:'other'}}}},
 ]
 for(const value of changed){expect(()=>inspect(f,edit(value,'replace','retain'))).toThrow(/endpoint roles/);expect(inspect(f,edit(value,'replace','recapture')).edit.change.spec).toEqual(value)}
 const same=structuredClone(gear)
 same.first={support:same.first.support,face:{key:same.first.face.key,sourceFeatureId:same.first.face.sourceFeatureId},body:same.first.body,component:same.first.component,kind:same.first.kind}
 expect(inspect(f,edit(same,'replace')).existing?.type).toBe('gear')
})
it('keeps the locked concentric route separate from an existing unlocked declaration',()=>{
 const f=fixture(),node=f.source.definitions.find(d=>d.id===owner.id) as EmbeddedAssemblyDefinition
 const mate=node.mates.find(m=>m.type==='concentric')!;if(mate.type!=='concentric')throw Error('Original concentric required')
 mate.rotationLock=null;const value=project(mate)
 expect(()=>inspect(f,edit(value,'replace'))).toThrow(/no rotation lock/)
 expect(inspect(f,edit(value,'replace','recapture')).existing).toMatchObject({rotationLock:null})
 expect(()=>declaration(value,{type:'concentric',rotationLock:null})).toThrow(/locked route/)
})
it('selects exact effective Base/Named declarations and permits same-ID family replacement only with recapture',()=>{
 const f=fixture(),base=(f.source.definitions.find(d=>d.id===owner.id) as EmbeddedAssemblyDefinition).mates[0]
 const gear=validateAssemblyMate({...recipes[2][1] as object,...recipes[2][3] as object,id:base.id})
 f.catalog[1].configurations[0].mateDeclarations=[gear]
 const named=project(gear),baseSpec=project(base)
 expect(inspect(f,edit(named,'replace')).existing).toEqual(gear)
 const baseEdit={...edit(baseSpec,'replace'),scopePath:['left'],configuration:null}
 expect(inspect(f,baseEdit).existing).toEqual(base)
 expect(()=>inspect(f,edit(baseSpec,'replace'))).toThrow(/same mechanical family/)
 expect(inspect(f,edit(baseSpec,'replace','recapture')).existing).toEqual(gear)
 f.catalog[1].configurations[0].mateDeclarations=[]
 expect(inspect(f,edit(baseSpec)).existing).toBeNull()
})
it('rejects duplicate/absent IDs, wrong paths/tuples/selectors and mismatched replacement IDs atomically',()=>{
 const f=fixture(),value=spec(recipes[0][1]),operation=edit(value,'replace'),before=serializeAssemblyConfiguredDocument(f)
 for(const bad of [edit(value),{...operation,scopePath:['missing']},{...operation,configuration:null},{...operation,definition:{...owner,revision:'old'}},
   {...operation,change:{...operation.change,mateId:'absent'}}, {...operation,change:{...operation.change,spec:{...value,id:'other'}}}])expect(()=>inspect(f,bad)).toThrow()
 expect(serializeAssemblyConfiguredDocument(f)).toBe(before)
})
it('allows explicit recapture from an ordinary declaration without treating its old values as a mechanical capture',()=>{
 const f=fixture(),node=f.source.definitions.find(d=>d.id===owner.id) as EmbeddedAssemblyDefinition
 const ordinary=validateAssemblyMate({id:'original-gear',name:'Original ordinary distance',suppressed:false,type:'distance',
   first:{kind:'principal-plane',component:null,plane:'XY'},second:{kind:'principal-plane',component:null,plane:'XY'},distance:3,alignment:'aligned'})
 node.mates[node.mates.findIndex(mate=>mate.id===ordinary.id)]=ordinary
 const intent=edit(spec(recipes[2][1]),'replace','recapture')
 expect(inspect(f,intent).existing).toEqual(ordinary)
 expect(()=>inspect(f,edit(intent.change.spec,'replace','retain'))).toThrow(/same mechanical family/)
})
it('owns accepted specs and capture fields independently of caller references and rejects hidden/prototype data',()=>{
 const value=spec(recipes[2][1]),capture=structuredClone(recipes[2][2]) as {type:string;neutralRotations:{first:number[];second:number[]};angles:{first:number;second:number}}
 if(value.type!=='gear')throw Error('Original gear required')
 const assembled=declaration(value,capture)
 value.ratio.numerator=99;value.first.component.occurrencePath[0]='changed';capture.angles.first=999;capture.neutralRotations.first[0]=1
 expect(assembled).toMatchObject({ratio:{numerator:3,denominator:2},first:{component:{occurrencePath:['a']}},angles:{first:4*tau+.25},neutralRotations:{first:[0,0,0,1]}})
 const valid=edit(spec(recipes[0][1])),hidden={...valid}
 Object.defineProperty(hidden,'extra',{value:1,enumerable:false});expect(()=>validate(hidden)).toThrow()
 expect(()=>validate(Object.assign(Object.create({extra:1}),valid))).toThrow()
 expect(()=>validate({...valid,[Symbol('extra')]:1})).toThrow()
 let reads=0;const getter=structuredClone(valid)
 Object.defineProperty(getter.change,'spec',{enumerable:true,get(){reads++;return value}})
 expect(()=>validate(getter)).toThrow();expect(reads).toBe(0)
})
it('rejects invalid/unknown/missing policies and executable own or nested spec fields with zero getter reads',()=>{
 const operation=edit(spec(recipes[2][1]),'replace');let reads=0
 for(const key of ['scopePath','definition','configuration','change']){
  const bad={...operation};Object.defineProperty(bad,key,{enumerable:true,get(){reads++;return operation[key as keyof typeof operation]}});expect(()=>validate(bad)).toThrow()
 }
 const bad=structuredClone(operation);Object.defineProperty(bad.change.spec,'phase',{enumerable:true,get(){reads++;return 0}});expect(()=>validate(bad)).toThrow()
 const nested=structuredClone(operation);if(nested.change.spec.type!=='gear')throw Error('Original gear required')
 Object.defineProperty(nested.change.spec.first.face,'key',{enumerable:true,get(){reads++;return 'face-v1|UNATTESTED'}});expect(()=>validate(nested)).toThrow()
 for(const capture of [undefined,null,'automatic',false])expect(()=>validate({...operation,change:{...operation.change,capture}})).toThrow()
 expect(()=>validate({...operation,change:{...operation.change,angles:{first:0,second:0}}})).toThrow()
 expect(()=>validate({...operation,scopePath:new Array(1)})).toThrow()
 expect(()=>spec({...recipes[0][1] as object,name:'x'.repeat(201)})).toThrow()
 expect(()=>spec({...recipes[3][1] as object,lead:Infinity})).toThrow()
 expect(reads).toBe(0)
})
it('rejects malformed captures rather than publishing parser placeholder values',()=>{
 const gear=spec(recipes[2][1]),concentric=spec(recipes[0][1])
 for(const capture of [{type:'gear'}, {...recipes[2][2] as object,angles:{first:Infinity,second:0}}, {...recipes[2][2] as object,unknown:1}, recipes[0][2]])expect(()=>declaration(gear,capture)).toThrow()
 expect(()=>declaration(concentric,{type:'concentric',rotationLock:[0,0,0,0]})).toThrow()
 let reads=0;const captured={type:'gear',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]}}
 Object.defineProperty(captured,'angles',{enumerable:true,get(){reads++;return {first:0,second:0}}})
 expect(()=>declaration(gear,captured)).toThrow();expect(reads).toBe(0)
})
