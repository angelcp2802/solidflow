import {expect,it} from 'vitest'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {createAssemblyConfiguredDocument} from './assemblyConfiguredDocument'
import {buildConfiguredAssemblyBom,validateConfiguredAssemblyBomOptions} from './assemblyConfiguredBom'
import {identityRigidPose} from './rigidPose'
import type {EmbeddedAssemblyDefinition} from './assemblyDocument'
// Original tracked A2x3x4/B1x2x5 declaration recipes. Counts below are literal
// occurrence incidence; no BRep, mass, solver or topology authority is inferred.
function fixture(root:string|null='mixed'){
 const {document,catalog}=assemblyConfigurationCoreFixture()
 return createAssemblyConfiguredDocument(document,catalog,root)
}
const quantities=(rows:ReturnType<typeof buildConfiguredAssemblyBom>['rows'])=>rows.map(r=>[r.definition.id,r.configuration,r.quantityPerParent,r.quantityTotal])
it.each([null,'mixed','both-compact','single-right'] as const)('counts effective part units for root %s',root=>{
 const doc=fixture(root),before=JSON.stringify(doc),report=buildConfiguredAssemblyBom(doc)
 expect(quantities(report.rows)).toEqual([['configuration-A',null,null,2],['configuration-B',null,null,root==='single-right'?1:2]])
 expect(report.source.rootConfiguration).toBe(root);expect(report.context.rootConfiguration).toBe(root);expect(report.declarationOnly).toBe(true)
 expect(report.rows.flatMap(r=>r.members.map(m=>m.component.occurrencePath))).toEqual(root==='single-right'?[['left','a'],['right','a'],['left','b']]:[['left','a'],['right','a'],['left','b'],['right','b']])
 expect(JSON.stringify(doc)).toBe(before)
})
it('separates assembly variants in top level and indented contexts but groups equal selected states',()=>{
 const mixed=buildConfiguredAssemblyBom(fixture(),{mode:'top-level'})
 expect(quantities(mixed.rows)).toEqual([['configuration-S',null,1,1],['configuration-S','compact',1,1]])
 const indent=buildConfiguredAssemblyBom(fixture(),{mode:'indented'})
 expect(quantities(indent.rows)).toEqual([['configuration-S',null,1,1],['configuration-A',null,1,1],['configuration-B',null,1,1],['configuration-S','compact',1,1],['configuration-A',null,1,1],['configuration-B',null,1,1]])
 expect(indent.rows.map(r=>r.itemNumber)).toEqual(['1','1.1','1.2','2','2.1','2.2'])
 expect(indent.rows.map(r=>r.parentKey)).toEqual([null,indent.rows[0].key,indent.rows[0].key,null,indent.rows[3].key,indent.rows[3].key])
 const same=buildConfiguredAssemblyBom(fixture('both-compact'),{mode:'indented'})
 expect(quantities(same.rows)).toEqual([['configuration-S','compact',2,2],['configuration-A',null,1,2],['configuration-B',null,1,2]])
 expect(same.rows[0].members.map(m=>m.component.occurrencePath)).toEqual([['left'],['right']])
})
it('selects an actual nested scope while retaining absolute paths and complete root state ancestry',()=>{
 const report=buildConfiguredAssemblyBom(fixture(),{mode:'indented',scopePath:['right']})
 expect(report.scope).toMatchObject({path:['right'],definition:{id:'configuration-S',revision:'s-r1'},configuration:'compact',configurationName:'Compact'})
 expect(quantities(report.rows)).toEqual([['configuration-A',null,1,1],['configuration-B',null,1,1]])
 expect(report.rows.map(r=>[r.depth,r.parentKey,r.itemNumber])).toEqual([[0,null,'1'],[0,null,'2']])
 expect(report.rows[1].members[0]).toEqual({component:{occurrencePath:['right','b'],definition:{id:'configuration-B',revision:'r1'}},name:'b',pathNames:['right','b'],configuration:null,
  configurationAncestry:[{path:[],definition:{id:'configuration-root',revision:'root-r1'},configuration:'mixed'},{path:['right'],definition:{id:'configuration-S',revision:'s-r1'},configuration:'compact'}]})
 for(const path of [['right','b'],['missing']])expect(()=>buildConfiguredAssemblyBom(fixture(),{scopePath:path})).toThrow(/ámbito/)
})
it('inherits hidden filtering and suppression and can reactivate an originally suppressed child',()=>{
 const doc=fixture();doc.source.occurrences[1].visible=false
 expect(quantities(buildConfiguredAssemblyBom(doc).rows)).toEqual([['configuration-A',null,null,2],['configuration-B',null,null,2]])
 expect(quantities(buildConfiguredAssemblyBom(doc,{includeHidden:false}).rows)).toEqual([['configuration-A',null,null,1],['configuration-B',null,null,1]])
 expect(buildConfiguredAssemblyBom(doc,{scopePath:['right'],includeHidden:false}).rows).toEqual([])
 doc.source.occurrences[1].visible=true;doc.source.occurrences[1].suppressed=true
 expect(quantities(buildConfiguredAssemblyBom(doc).rows)).toEqual([['configuration-A',null,null,1],['configuration-B',null,null,1]])
 expect(buildConfiguredAssemblyBom(doc,{scopePath:['right']}).scope.suppressed).toBe(true)
 expect(buildConfiguredAssemblyBom(doc,{scopePath:['right']}).rows).toEqual([])
 doc.source.occurrences[1].suppressed=false
 const s=doc.source.definitions.find(d=>d.kind==='assembly') as EmbeddedAssemblyDefinition;s.occurrences[1].suppressed=true
 doc.catalog[1].configurations[0].occurrences[0].suppressed=false
 expect(quantities(buildConfiguredAssemblyBom(doc).rows)).toEqual([['configuration-A',null,null,2],['configuration-B',null,null,1]])
 expect(buildConfiguredAssemblyBom(doc).rows[1].members[0].component.occurrencePath).toEqual(['right','b'])
 doc.catalog[1].configurations[0].occurrences[0].visible=false
 expect(buildConfiguredAssemblyBom(doc,{includeHidden:false}).rows).toHaveLength(1)
})
it('does not merge distinct part IDs or revisions with equal names and geometry; source metadata is detached only',()=>{
 const doc=fixture(),original=doc.source.definitions.find(d=>d.kind==='part')!
 if(original.kind!=='part')throw Error('Original A required')
 original.sourceLink={kind:'local-file',displayName:'original-source.solidflow',contentSha256:'a'.repeat(64)}
 const other=structuredClone(original);other.id='equal-geometry-Q';other.document.id=other.id
 const revision=structuredClone(original);revision.revision='r2'
 doc.source.definitions.push(other,revision)
 for(const [id,def]of [['q',other],['revision',revision]] as const)doc.source.occurrences.push({id,name:'Same display',definition:{id:def.id,revision:def.revision},pose:identityRigidPose(),fixed:true,suppressed:false,visible:true})
 const rows=buildConfiguredAssemblyBom(doc).rows
 expect(rows.map(r=>[r.definition,r.quantityTotal])).toEqual([[{id:'configuration-A',revision:'r1'},2],[{id:'configuration-B',revision:'r1'},2],[{id:'equal-geometry-Q',revision:'r1'},1],[{id:'configuration-A',revision:'r2'},1]])
 expect(rows[0].sourceLink).toEqual(original.sourceLink);rows[0].sourceLink!.displayName='changed.solidflow';expect(original.sourceLink.displayName).toBe('original-source.solidflow')
 rows[0].members[0].configurationAncestry[0].definition.id='changed';expect(doc.source.id).toBe('configuration-root')
})
it('counts parts once regardless of empty/multibody recipes and ignores poses, fixedness and authored capture values',()=>{
 const doc=fixture(),before=quantities(buildConfiguredAssemblyBom(doc).rows),s=doc.source.definitions.find(d=>d.kind==='assembly') as EmbeddedAssemblyDefinition
 const first=doc.source.definitions.find(d=>d.kind==='part')!;if(first.kind!=='part')throw Error('part')
 first.document.features=[];s.occurrences[0].fixed=true;s.occurrences[1].pose.rotation=[Math.SQRT1_2,0,0,Math.SQRT1_2]
 s.mates=[{id:'lock',name:'Original captured declaration',type:'lock',suppressed:true,first:{occurrencePath:['a'],definition:{id:'configuration-A',revision:'r1'}},second:{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}},relativePose:identityRigidPose()}]
 doc.catalog[1].configurations[0].mates=[{mateId:'lock',suppressed:false,capture:{type:'lock',relativePose:{translation:[100,20,3],rotation:[0,1,0,0]}}}]
 expect(quantities(buildConfiguredAssemblyBom(doc).rows)).toEqual(before)
})
it('retains repairable diagnostics without claiming that counted declarations satisfy relations',()=>{
 const doc=fixture();doc.source.mates=[{id:'missing',name:'Original stale frame',type:'lock',suppressed:false,first:{occurrencePath:['absent'],definition:{id:'configuration-S',revision:'s-r1'}},second:{occurrencePath:['right'],definition:{id:'configuration-S',revision:'s-r1'}},relativePose:identityRigidPose()}]
 const report=buildConfiguredAssemblyBom(doc);expect(report.rows).toHaveLength(2);expect(report.referenceDiagnostics[0].problem).toBe('missing-occurrence');expect(report).not.toHaveProperty('satisfied')
 const dormant=fixture();dormant.catalog[1].configurations[1].occurrences.push({occurrenceId:'a',configuration:'invalid'})
 expect(()=>buildConfiguredAssemblyBom(dormant)).toThrow()
})
it('preserves the4096 complete occurrence envelope and rejects4097 without partial output',()=>{
 const doc=fixture(null),part=doc.source.definitions[0];doc.source.definitions=[part];doc.catalog=[]
 doc.source.occurrences=Array.from({length:4096},(_,i)=>({id:'unit-'+i,name:'Original unit',definition:{id:part.id,revision:part.revision},pose:identityRigidPose(),fixed:false,suppressed:false,visible:true}))
 expect(buildConfiguredAssemblyBom(doc).rows[0].quantityTotal).toBe(4096)
 doc.source.occurrences.push({...doc.source.occurrences[0],id:'overflow'})
 expect(()=>buildConfiguredAssemblyBom(doc)).toThrow()
})
it('rejects executable options, paths and dormant input without executing getters or serializers',()=>{
 let reads=0;const doc=fixture(),path=['right'];Object.defineProperty(path,'0',{enumerable:true,get(){reads++;return 'right'}})
 for(const options of [{get mode(){reads++;return 'parts-only'}},{scopePath:path},{scopePath:undefined},{includeHidden:undefined},{extra:true},Object.create({mode:'parts-only'})])expect(()=>buildConfiguredAssemblyBom(doc,options as never)).toThrow()
 Object.defineProperty(doc.catalog[1].configurations[1],'name',{enumerable:true,get(){reads++;return 'bad'}})
 expect(()=>buildConfiguredAssemblyBom(doc)).toThrow();expect(reads).toBe(0)
 expect(validateConfiguredAssemblyBomOptions(Object.create(null))).toEqual({mode:'parts-only',includeHidden:true,scopePath:[]})
})
it('preserves full nested ancestry and counts under proper noncommuting poses without composing quantities from geometry',()=>{
 const doc=fixture(null),s=doc.source.definitions.find(d=>d.kind==='assembly') as EmbeddedAssemblyDefinition
 const group:EmbeddedAssemblyDefinition={kind:'assembly',id:'original-G',revision:'g1',name:'Original nested group',createdAt:doc.source.createdAt,updatedAt:doc.source.updatedAt,mates:[],occurrences:[{id:'nested',name:'Nested S',definition:{id:s.id,revision:s.revision},pose:{translation:[3,-2,4],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:true,suppressed:false,visible:true}]}
 doc.source.definitions.push(group);doc.catalog=[];doc.source.occurrences.forEach(o=>o.definition={id:group.id,revision:group.revision})
 const report=buildConfiguredAssemblyBom(doc,{mode:'indented'})
 expect(quantities(report.rows)).toEqual([['original-G',null,2,2],['configuration-S',null,1,2],['configuration-A',null,1,2],['configuration-B',null,1,2]])
 expect(report.rows.map(r=>r.depth)).toEqual([0,1,2,2])
 expect(report.rows[3].members[1].component.occurrencePath).toEqual(['right','nested','b'])
 expect(report.rows[3].members[1].configurationAncestry.map(a=>[a.path,a.definition.id,a.configuration])).toEqual([[[],'configuration-root',null],[['right'],'original-G',null],[['right','nested'],'configuration-S',null]])
 expect(buildConfiguredAssemblyBom(doc,{scopePath:['right','nested']}).rows.map(r=>r.quantityTotal)).toEqual([1,1])
})
it('counts a declared multibody part as one purchased unit rather than one unit per explicit body',()=>{
 const doc=fixture(),part=doc.source.definitions[1];if(part.kind!=='part')throw Error('Original B')
 const profile=part.document.features[0],solid=part.document.features[1]
 if(profile.type!=='sketch' || solid.type!=='extrude')throw Error('Original box recipe')
 part.document.features=[profile,{...solid,bodyOperation:{mode:'new',bodyId:'first'}},{...profile,id:'second-profile'},
  {...solid,id:'second-solid',sketchId:'second-profile',bodyOperation:{mode:'new',bodyId:'second'}}]
 expect(quantities(buildConfiguredAssemblyBom(doc).rows)).toEqual([['configuration-A',null,null,2],['configuration-B',null,null,2]])
})
it('reads a deeply frozen complete v3 context and options without borrowing mutable caller arrays',()=>{
 const doc=fixture(),options={mode:'indented' as const,includeHidden:true,scopePath:['right']}
 const freeze=(value:object):void=>{for(const child of Object.values(value))if(child && typeof child==='object')freeze(child);Object.freeze(value)}
 freeze(doc);freeze(options)
 const report=buildConfiguredAssemblyBom(doc,options),signature=JSON.stringify(doc)
 report.options.scopePath.push('changed');report.rows[0].members[0].component.occurrencePath[0]='changed'
 expect(options.scopePath).toEqual(['right']);expect(JSON.stringify(doc)).toBe(signature)
 expect(report.context.sourceSignature).toBe(JSON.stringify(doc.source));expect(report.context.catalogSignature).toBe(JSON.stringify(doc.catalog))
})
