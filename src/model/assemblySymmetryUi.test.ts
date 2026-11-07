import {expect,it} from 'vitest'
import {assemblySymmetryUiProposal,assemblySymmetryUiReports,type SymmetryUiFamily,type SymmetryUiReferences} from './assemblySymmetryUi'
import {validateAssemblySymmetryReferenceSet} from './assemblySymmetryReferences'
import {createEmptyAssembly} from '../examples/assembly'
import type {AssemblySymmetryMate} from './assemblyDocument'
import type {AssemblySymmetrySupportReport} from '../cad/kernel.assembly-symmetry'
import {identityRigidPose} from './rigidPose'
const kinds=['point','line','plane','sphere','cylinder'] as const
function refs(kind:SymmetryUiFamily):SymmetryUiReferences{
  const selected=(family:SymmetryUiFamily,owner:string)=>{
    const common={component:{occurrencePath:[owner],definition:{id:'part',revision:'r1'}},body:{bodyId:'body',sourceFeatureId:'solid'}}
    if(family==='point')return{...common,kind:'vertex',vertex:{sourceFeatureId:'solid',key:'vertex-v1|'+'a'.repeat(64)},support:'point'}
    if(family==='line')return{...common,kind:'edge',edge:{sourceFeatureId:'solid',key:'edge-v1|original'},support:'line'}
    return{...common,kind:'face',face:{sourceFeatureId:'solid',key:'face-v1|original'},support:family==='plane'?'plane':family==='sphere'?'sphere-surface':'cylinder-surface'}
  }
  const r=validateAssemblySymmetryReferenceSet({entityKind:kind,source:selected(kind,'a'),target:selected(kind,'b'),mirror:selected('plane','m'),alignment:kind==='point'||kind==='sphere'?null:'aligned'})
  return[r.source,r.target,r.mirror]
}
function scenario(kind:SymmetryUiFamily){
  const proposal=assemblySymmetryUiProposal(refs(kind),kind,'aligned',' Original '),mate:AssemblySymmetryMate={id:'original',...proposal},document=createEmptyAssembly()
  document.mates=[mate]
  const directed=kind!=='point'&&kind!=='sphere',radial=kind==='sphere'||kind==='cylinder'
  const report:AssemblySymmetrySupportReport={status:'ok',kind:'symmetry',mateId:mate.id,entityKind:kind,alignment:mate.alignment,positionErrorMm:0,angleRadians:directed?0:null,radiusDifferenceMm:radial?0:null,uncertainty:{positionMm:2e-7,angleRad:directed?1e-12:null,radiusMm:radial?2e-7:null},satisfied:true,lengthTolerance:1e-6,angleTolerance:1e-8,scopePath:[],componentPaths:{source:['a'],target:['b'],mirror:['m']},supportOnly:true}
  return{document,report,mate}
}
for(const kind of kinds)it('prepares detached '+kind+' intent retaining three actual roles and explicit purpose',()=>{
  const input=refs(kind),before=structuredClone(input),proposal=assemblySymmetryUiProposal(input,kind,'opposed',' Reflection ')
  expect(proposal.name).toBe('Reflection');expect(proposal.type).toBe('symmetry');expect(proposal).not.toHaveProperty('first');expect(proposal).not.toHaveProperty('second')
  expect(proposal.alignment).toBe(kind==='point'||kind==='sphere'?null:'opposed')
  expect(proposal.source.component!.occurrencePath).toEqual(['a']);expect(proposal.target.component!.occurrencePath).toEqual(['b']);expect(proposal.mirror.component!.occurrencePath).toEqual(['m'])
  proposal.source.component!.occurrencePath[0]='changed';expect(input).toEqual(before)
})
for(const kind of kinds)it('displays only matching satisfied current '+kind+' report with separate uncertainty',()=>{
  const {document,report}=scenario(kind),result=assemblySymmetryUiReports(document,[report])
  expect(result).toEqual([report]);expect(result[0]).not.toBe(report)
  result[0].componentPaths.source[0]='changed';expect(report.componentPaths.source).toEqual(['a'])
  expect(assemblySymmetryUiReports(document,[report,report])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,componentPaths:{...report.componentPaths,mirror:['other']}}])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,uncertainty:{...report.uncertainty,positionMm:1e-3}}])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,positionErrorMm:NaN}])).toEqual([])
  document.mates[0].suppressed=true;expect(assemblySymmetryUiReports(document,[report])).toEqual([])
})
it('rejects incomplete, mixed-purpose and undeclared directional intents',()=>{
  for(const kind of kinds){
    const r=refs(kind)
    expect(()=>assemblySymmetryUiProposal([r[0],null,r[2]],kind,'aligned','Original')).toThrow()
    expect(()=>assemblySymmetryUiProposal([r[0],refs(kind==='point'?'sphere':'point')[0],r[2]],kind,'aligned','Original')).toThrow()
    expect(()=>assemblySymmetryUiProposal([r[0],r[1],refs('sphere')[0]],kind,'aligned','Original')).toThrow()
    expect(()=>assemblySymmetryUiProposal(r,kind,'aligned',' ')).toThrow()
    if(kind!=='point'&&kind!=='sphere')expect(()=>assemblySymmetryUiProposal(r,kind,'','Original')).toThrow()
  }
})
it('rejects accessor role descriptors before invoking their values and rejects sparse roles',()=>{
  let calls=0;const r=refs('point');Object.defineProperty(r,'0',{get(){calls++;return null},enumerable:true})
  expect(()=>assemblySymmetryUiProposal(r,'point','','Original')).toThrow();expect(calls).toBe(0)
  expect(()=>assemblySymmetryUiProposal(new Array(3) as SymmetryUiReferences,'point','','Original')).toThrow()
})
it('retains repeated owners and explicit fixed-scope mirror without creating another component',()=>{
  const r=refs('point');r[1]=r[0];r[2]={kind:'principal-plane',component:null,plane:'YZ'}
  const p=assemblySymmetryUiProposal(r,'point','','Original');expect(p.source).toEqual(p.target);expect(p.source).not.toBe(p.target);expect(p.mirror.component).toBeNull()
})
it('checks actual nested report scope and each fully scoped role path',()=>{
  const {document,report,mate}=scenario('point')
  document.mates=[]
  document.definitions.push({kind:'assembly',id:'sub',revision:'r1',name:'Original nested scope',createdAt:document.createdAt,updatedAt:document.updatedAt,occurrences:[],mates:[mate]})
  document.occurrences.push({id:'nested',name:'Original nested occurrence',definition:{id:'sub',revision:'r1'},pose:identityRigidPose(),fixed:false,suppressed:false,visible:true})
  report.scopePath=['nested'];report.componentPaths={source:['nested','a'],target:['nested','b'],mirror:['nested','m']}
  expect(assemblySymmetryUiReports(document,[report])).toHaveLength(1)
  expect(assemblySymmetryUiReports(document,[{...report,componentPaths:{...report.componentPaths,target:['b']}}])).toEqual([])
  document.occurrences[0].suppressed=true;expect(assemblySymmetryUiReports(document,[report])).toEqual([])
})
it('does not display a forged satisfied flag with wrong angular/radius/family evidence',()=>{
  const {document,report}=scenario('cylinder')
  expect(assemblySymmetryUiReports(document,[{...report,angleRadians:Math.PI}])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,radiusDifferenceMm:.1}])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,entityKind:'line'}])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,alignment:'opposed'}])).toEqual([])
  expect(assemblySymmetryUiReports(document,[{...report,uncertainty:{...report.uncertainty,radiusMm:null}}])).toEqual([])
})
