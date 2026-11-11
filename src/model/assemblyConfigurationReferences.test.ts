import { expect, it } from 'vitest'
import { inspectAssemblyConfigurationMateReferences as inspect } from './assemblyConfigurationReferences'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { validateAssemblyMate, type AssemblyMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'

// Original declaration-only recipes derived from the project's A/B box graph.
// Opaque topology keys are deliberately unattested, never native geometry.
const plane=(path:string[]|null)=>({kind:'principal-plane' as const,component:path===null?null:{occurrencePath:path,definition:{id:'configuration-B',revision:'r1'}},plane:'XY' as const})
const component={occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}}
const face={kind:'face' as const,component,body:null,face:{sourceFeatureId:'solid',key:'face-v1|original-declaration'},support:'plane' as const}
const axis={...face,support:'axis' as const}
const edge={sourceFeatureId:'solid',key:'edge-v1|original-declaration'}
const vertex={sourceFeatureId:'solid',key:'vertex-v1|'+'a'.repeat(64)}
const point={kind:'vertex' as const,component,body:null,vertex,support:'point' as const}
const profile={face:{component,body:null,face:face.face},axis:{edge,sense:1 as const}}
const path={component,body:null,edge,startVertex:vertex}
function setup(mates:unknown[]){
 const value=assemblyConfigurationCoreFixture()
 const node=value.document.definitions.find(d=>d.kind==='assembly') as EmbeddedAssemblyDefinition
 node.mates=mates.map(validateAssemblyMate)
 return value
}
const common={id:'relation',name:'Original relation',suppressed:false}
const relation={...common,type:'distance',first:plane(null),second:plane(['b']),distance:2,alignment:'aligned'}
it('uses effective transforms, full chains and ancestry without mutating or aliasing inputs',()=>{
 const {document,catalog}=setup([relation]),before=JSON.stringify({document,catalog})
 const result=inspect(document,catalog,'mixed')
 expect(result.map(v=>[v.scopePath,v.configuration])).toEqual([[['left'],null],[['right'],'compact']])
 const right=result[1];expect(right.scopePose.translation).toEqual([30,0,0])
 expect(right.roles[0]).toMatchObject({side:'first',reference:plane(null),candidate:null,diagnostics:[]})
 expect(right.roles[1].candidate?.path).toEqual(['right','b'])
 right.roles[1].candidate!.worldPose.translation.forEach((v,i)=>expect(v).toBeCloseTo([30,4,0][i],12))
 expect(right.roles[1].candidate!.chain.map(v=>v.id)).toEqual(['right','b'])
 expect(right.configurationAncestry.map(v=>[v.path,v.configuration])).toEqual([[[],'mixed'],[['right'],'compact']])
 expect(JSON.stringify({document,catalog})).toBe(before)
 document.occurrences[1].pose.translation[0]=900;catalog[1].configurations[0].name='Changed'
 expect(right.scopePose.translation[0]).toBe(30)
 expect(Object.isFrozen(right.roles[1].candidate!.definition)).toBe(true)
 expect(Reflect.set(right.roles[1].candidate!.worldPose.translation,'0',900)).toBe(false)
})
it('keeps hidden availability, suppressed scopes and effective mate suppression distinct',()=>{
 const {document,catalog}=setup([relation]);catalog[1].configurations[0].occurrences[0].visible=false
 catalog[1].configurations[0].mates.push({mateId:'relation',suppressed:true})
 let result=inspect(document,catalog,'mixed')
 expect(result[1].suppressed).toBe(true);expect(result[1].scopeSuppressed).toBe(false)
 expect(result[1].roles[1].candidate?.visible).toBe(false);expect(result[1].roles[1].diagnostics).toEqual([])
 document.occurrences[1].suppressed=true;result=inspect(document,catalog,'mixed')
 expect(result[1].scopeSuppressed).toBe(true);expect(result[1].roles[1].diagnostics.map(d=>d.code)).toEqual(['SUPPRESSED_COMPONENT'])
})
it.each([
 ['missing',{...plane(['gone'])},'MISSING_OCCURRENCE',['right','gone']],
 ['through part',{...plane(['b','child'])},'PATH_THROUGH_PART',['right','b']],
 ['stale',{...plane(['b']),component:{...component,definition:{...component.definition,revision:'old'}}},'STALE_DEFINITION',['right','b']],
])('reports %s with the actual scoped path',(_name,reference,code,path)=>{
 const {document,catalog}=setup([{...relation,second:reference}])
 expect(inspect(document,catalog,'mixed')[1].roles[1].diagnostics).toEqual([{code,path}])
})
it.each([
 ['face', {...face,face:{...face.face,sourceFeatureId:'missing'}},'MISSING_FACE_PRODUCER'],
 ['edge', {kind:'edge',component,body:null,edge:{...edge,sourceFeatureId:'missing'},support:'line'},'MISSING_EDGE_PRODUCER'],
 ['vertex', {...point,vertex:{...vertex,sourceFeatureId:'missing'}},'MISSING_VERTEX_PRODUCER'],
])('checks %s producer declarations on effective candidates',(_kind,reference,code)=>{
 const {document,catalog}=setup([{...common,type:'symmetry',entityKind:_kind==='face'?'plane':_kind==='edge'?'line':'point',source:reference,target:reference,mirror:plane(null),alignment:_kind==='vertex'?null:'aligned'}])
 expect(inspect(document,catalog)[0].roles[0].diagnostics.map(d=>d.code)).toEqual([code])
})
const families: [string,unknown,string[]][]=[
 ['width',{...common,type:'width',mode:'centered',width:[plane(['b']),plane(null)],tab:[plane(['b']),plane(['b'])],widthBranch:'sum',tabBranch:'sum',alignment:'aligned'},['width-0','width-1','tab-0','tab-1']],
 ['hinge',{...common,type:'hinge',axis:[axis,axis],axial:[face,face],alignment:'aligned',stops:{coordinate:'directed-about-axis',angular:[face,face],arc:{start:330,sweep:60}}},['axis-0','axis-1','axial-0','axial-1','angle-0','angle-1']],
 ['profile',{...common,type:'profile-center',first:profile,second:profile,alignment:'aligned',offsetMm:0,orientation:{mode:'rectangle',quarterTurns:1}},['first','second']],
 ['line',{...common,type:'line-path',point,path,position:{mode:'free'},orientation:{pitchYaw:{mode:'follow',axis:'x',reverse:false},roll:{mode:'up',axis:'y',reverse:false,guide:face}}},['point','path','up']],
 ['circle',{...common,type:'circular-path',point,path,position:{mode:'free',domain:'support-circle'},orientation:{pitchYaw:'free',roll:'free'}},['point','path']],
 ['directed',{...common,type:'limit-directed-angle',first:plane(['b']),second:plane(null),guide:plane(['b']),coordinate:'directed-about-axis',arc:{start:330,sweep:60}},['first','second','guide']],
]
it.each(families)('preserves ordered compound/n-ary roles for %s',(_name,mate,sides)=>{
 const {document,catalog}=setup([mate]);const result=inspect(document,catalog,'single-right')
 expect(result[0].roles.map(r=>r.side)).toEqual(sides)
 expect(result[1].roles.map(r=>r.side)).toEqual(sides)
 expect(result[1].nativeVerificationRequired).toBe(true)
 expect(result[1].roles.filter(r=>r.candidate!==null).every(r=>r.diagnostics.some(d=>d.code==='SUPPRESSED_COMPONENT'))).toBe(true)
})
it('inspects every component of compound profile and material path producers',()=>{
 const badProfile={...profile,axis:{edge:{...edge,sourceFeatureId:'absent'},sense:1}}
 // Profile parser requires shared producer syntax; missing declared shared producer remains repairable.
 const missingProfile={face:{...profile.face,face:{...face.face,sourceFeatureId:'absent'}},axis:badProfile.axis}
 const missingPath={...path,edge:{...edge,sourceFeatureId:'absent'},startVertex:{...vertex,sourceFeatureId:'absent'}}
 const {document,catalog}=setup([{...families[2][1] as object,first:missingProfile}, {...families[3][1] as object,id:'path',path:missingPath}])
 const result=inspect(document,catalog)
 expect(result[0].roles[0].diagnostics.map(d=>d.code)).toEqual(['MISSING_FACE_PRODUCER','MISSING_EDGE_PRODUCER'])
 expect(result[1].roles[1].diagnostics.map(d=>d.code)).toEqual(['MISSING_EDGE_PRODUCER','MISSING_VERTEX_PRODUCER'])
})
it('rejects executable source/catalog fields without executing getters, including dormant variants',()=>{
 let reads=0;const {document,catalog}=setup([relation])
 Object.defineProperty(catalog[1].configurations[1],'occurrences',{enumerable:true,get(){reads++;return []}})
 expect(()=>inspect(document,catalog)).toThrow();expect(reads).toBe(0)
})


const binaryRecipes: [string,object][]=[
 ['concentric',{first:axis,second:axis,alignment:'aligned',rotationLock:null}],
 ['coincident',{first:face,second:plane(null),alignment:'aligned'}],
 ['distance',{first:face,second:plane(null),alignment:'opposed',distance:-3}],
 ['limit-distance',{first:face,second:face,alignment:'aligned',limits:{minimum:-2,maximum:4}}],
 ['limit-angle',{first:face,second:face,coordinate:'principal-direction',limits:{minimum:10,maximum:170}}],
 ['angle',{first:face,second:face,angle:35}],
 ['parallel',{first:face,second:face,alignment:'aligned'}],
 ['perpendicular',{first:face,second:face,alignment:null}],
 ['tangent',{first:face,second:{...face,support:'cylinder-surface'},side:'positive'}],
 ['skew-cylinder-tangent',{first:{...face,support:'cylinder-surface'},second:{...face,support:'cylinder-surface'},branch:{kind:'external'}}],
 ['parallel-cylinder-tangent',{first:{...face,support:'cylinder-surface'},second:{...face,support:'cylinder-surface'},branch:{kind:'internal',larger:'first'}}],
 ['plane-sphere-tangent',{first:face,second:{...face,support:'sphere-surface'},side:'negative'}],
 ['sphere-sphere-tangent',{first:{...face,support:'sphere-surface'},second:{...face,support:'sphere-surface'},branch:{kind:'external'}}],
 ['cylinder-sphere-tangent',{first:{...face,support:'cylinder-surface'},second:{...face,support:'sphere-surface'},branch:{kind:'external'}}],
 ['lock',{first:component,second:component,relativePose:{translation:[0,0,0],rotation:[0,0,0,1]}}],
 ['gear',{first:axis,second:axis,carrier:null,ratio:{numerator:2,denominator:3},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0},phase:0}],
 ['screw',{first:axis,second:axis,lead:2,reverse:false,alignment:'aligned',neutralRotation:[0,0,0,1],angle:0,neutralTravel:0}],
 ['rack-pinion',{first:axis,second:{kind:'edge',component,body:null,edge,support:'line'},conversion:{mode:'diameter',override:4},reverse:false,neutralRotation:[0,0,0,1],angle:0,neutralTravel:0}],
]
it.each(binaryRecipes)('retains %s declarations and all repeated/passive roles', (type,data)=>{
 const {document,catalog}=setup([{...common,type,...data,suppressed:true}])
 const result=inspect(document,catalog,'mixed')
 expect(result).toHaveLength(2)
 expect(result[1].mate.type).toBe(type);expect(result[1].suppressed).toBe(true)
 expect(result[1].roles.map(r=>r.side)).toEqual(type==='gear'?['first','second','carrier']:['first','second'])
 expect(result[1].roles.flatMap(r=>r.diagnostics)).toEqual([])
 expect(result[1].roles[0].candidate?.worldPose.translation[1]).toBeCloseTo(4,12)
 if(type==='gear')expect(result[1].roles[2]).toMatchObject({reference:null,candidate:null,diagnostics:[]})
})
it.each(['point','line','plane','sphere','cylinder'])('preserves %s symmetry purpose without manufacturing geometry',entityKind=>{
 const source=entityKind==='point'?point:entityKind==='line'?{kind:'edge',component,body:null,edge,support:'line'}:{...face,support:entityKind==='plane'?'plane':entityKind==='sphere'?'sphere-surface':'cylinder-surface'}
 const {document,catalog}=setup([{...common,type:'symmetry',entityKind,source,target:source,mirror:plane(null),alignment:entityKind==='point'||entityKind==='sphere'?null:'aligned'}])
 const roles=inspect(document,catalog)[0].roles
 expect(roles.map(r=>r.side)).toEqual(['source','target','mirror'])
 expect(roles[0].reference).toEqual(roles[1].reference);expect(roles[2].candidate).toBeNull()
 expect(roles.flatMap(r=>r.diagnostics)).toEqual([])
})
it('reports body inventory, producer suppression and exact state mismatch independently',()=>{
 const broken={...face,body:{bodyId:'missing',sourceFeatureId:'other'}}
 const {document,catalog}=setup([{...common,type:'coincident',first:broken,second:plane(null),alignment:'aligned'}])
 expect(inspect(document,catalog)[0].roles[0].diagnostics.map(d=>d.code)).toEqual(['MISSING_BODY_STATE','FACE_BODY_STATE_MISMATCH'])
 const part=document.definitions.find(d=>d.id==='configuration-B')!
 if(part.kind!=='part')throw Error('Original part expected')
 part.document.features[1].suppressed=true
 expect(inspect(document,catalog)[0].roles[0].diagnostics.map(d=>d.code)).toEqual(['SUPPRESSED_FACE_PRODUCER','MISSING_BODY_STATE','FACE_BODY_STATE_MISMATCH'])
})


it.each(['free-profile','unlimited-hinge','free-line','up-circle'])('preserves optional role absence and explicit variant %s',variant=>{
 let mate:unknown
 if(variant==='free-profile')mate={...common,type:'profile-center',first:{...profile,axis:null},second:{...profile,axis:null},alignment:'opposed',offsetMm:1,orientation:{mode:'free'}}
 else if(variant==='unlimited-hinge')mate={...common,type:'hinge',axis:[axis,axis],axial:[face,face],alignment:'opposed'}
 else if(variant==='free-line')mate={...common,type:'line-path',point,path,position:{mode:'free'},orientation:{pitchYaw:'free',roll:'free'}}
 else mate={...families[3][1] as object,type:'circular-path',position:{mode:'coordinate',distanceMm:1}}
 const {document,catalog}=setup([mate]);const entry=inspect(document,catalog)[1]
 expect(entry.roles.map(r=>r.side)).toEqual(variant==='unlimited-hinge'?['axis-0','axis-1','axial-0','axial-1']:variant==='free-profile'?['first','second']:variant==='free-line'?['point','path']:['point','path','up'])
 expect(entry.roles.flatMap(r=>r.diagnostics)).toEqual([])
})
it('checks material references to assemblies without interpreting their topology declarations',()=>{
 const {document,catalog}=setup([])
 document.mates.push(validateAssemblyMate({...common,type:'coincident',first:{...face,component:{occurrencePath:['right'],definition:{id:'configuration-S',revision:'s-r1'}}},second:plane(null),alignment:'aligned'}))
 const root=inspect(document,catalog)[0]
 expect(root.roles[0].diagnostics).toEqual([{code:'FACE_REQUIRES_PART',path:['right']}])
 expect(root.roles[0].candidate?.definition.kind).toBe('assembly')
})
it('validates dormant mate getters before producing any inventory',()=>{
 const {document,catalog}=setup([relation]);let reads=0
 const dormant=structuredClone(document.definitions.find(d=>d.kind==='assembly')!)
 dormant.id='dormant';Object.defineProperty(dormant.mates[0],'second',{enumerable:true,get(){reads++;throw Error('Executable')}})
 document.definitions.push(dormant)
 expect(()=>inspect(document,catalog)).toThrow();expect(reads).toBe(0)
})
