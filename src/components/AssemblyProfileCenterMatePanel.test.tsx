import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createEmptyAssembly } from '../examples/assembly'
import type { AssemblyProfileFaceSelection } from '../model/assemblyProfileReferences'
import type { AssemblyProfileCenterMate } from '../model/assemblyDocument'
import type { AssemblyProfileCenterSupportReport } from '../cad/kernel.assembly-types'
import Panel, { assemblyProfileCenterUiProposal, assemblyProfileCenterUiReports, profileEdgesForFace, type ProfileEdgeChoice } from './AssemblyProfileCenterMatePanel'

const face = (id = 'first'): AssemblyProfileFaceSelection => ({ component: { occurrencePath: [id], definition: { id:'original',revision:'r1' } }, body:{bodyId:'body',sourceFeatureId:'solid'},face:{sourceFeatureId:'solid',key:'face-v1|'+'a'.repeat(64)} })
const edge = { sourceFeatureId:'solid',key:'edge-v1|'+'b'.repeat(64) }
const circle = (id = 'first') => ({ face:face(id),axis:null })
const rectangle = (id = 'first', sense:1|-1 = 1) => ({ face:face(id),axis:{edge,sense} })
function mate(rect = false): AssemblyProfileCenterMate { return { id:'center',...assemblyProfileCenterUiProposal(rect?rectangle():circle(),rect?rectangle('second',-1):circle('second'),'Original center','opposed','-2',rect?{mode:'rectangle',quarterTurns:3}:{mode:'free'}) } }
it('detaches ordered compound intent and signed offset without granting a geometric cache',()=>{
  const first=rectangle(),second=rectangle('second',-1),before=structuredClone([first,second]),value=assemblyProfileCenterUiProposal(first,second,' Material ','aligned','2',{mode:'rectangle',quarterTurns:1})
  expect(value).toEqual({type:'profile-center',name:'Material',suppressed:false,first,second,alignment:'aligned',offsetMm:2,orientation:{mode:'rectangle',quarterTurns:1}})
  value.first.face.component.occurrencePath[0]='changed';expect([first,second]).toEqual(before);expect('worldSupport'in value).toBe(false)
})
it.each(['','Infinity','NaN'])('rejects missing or nonfinite offset %s',offset=>expect(()=>assemblyProfileCenterUiProposal(circle(),circle('second'),'Center','aligned',offset,{mode:'free'})).toThrow())
it('rejects incomplete compound roles, free axes and rectangle roles without axes',()=>{
  expect(()=>assemblyProfileCenterUiProposal(null,circle(),'Center','aligned','0',{mode:'free'})).toThrow()
  expect(()=>assemblyProfileCenterUiProposal(rectangle(),rectangle('second'),'Center','aligned','0',{mode:'free'})).toThrow()
  expect(()=>assemblyProfileCenterUiProposal(circle(),circle('second'),'Center','aligned','0',{mode:'rectangle',quarterTurns:0})).toThrow()
})
it('offers only exact owner/body/source LINE identities without asserting boundary membership',()=>{
  const f=face(),choices:ProfileEdgeChoice[]=[{key:'ok',label:'unproven LINE',faceOwner:f,edge}, {key:'copy',label:'other occurrence',faceOwner:face('second'),edge}, {key:'body',label:'other body',faceOwner:{...f,body:{bodyId:'other',sourceFeatureId:'solid'}},edge}, {key:'source',label:'other source',faceOwner:f,edge:{...edge,sourceFeatureId:'different'}}]
  expect(profileEdgesForFace(choices,f).map(v=>v.key)).toEqual(['ok']);expect(profileEdgesForFace(choices,null)).toEqual([])
})
it.each([false,true])('renders explicit family controls and blocks retained/stale references (rectangle=%s)',rect=>{
  const html=renderToStaticMarkup(<Panel mate={mate(rect)} faces={[]} edges={[]} disabled={false} onPreview={vi.fn()} onCancelEdit={vi.fn()}/>)
  expect(html).toContain('Cara del perfil 1');expect(html).toContain('Cara del perfil 2');expect(html).toContain('pendiente de verificación');expect(html).toContain('Cancelar edición de centro de perfiles');expect(html).toContain('<button disabled="">Vista previa')
  expect(html.includes('Sentido material del perfil 1')).toBe(rect);expect(html.includes('Cuartos de vuelta de perfiles')).toBe(rect)
  expect(html).not.toContain('Seleccionar en el modelo')
})
function reportFixture(rect=false) {
  const document=createEmptyAssembly(),m=mate(rect);document.mates=[m]
  // Display context is syntax only; the actual renderer workflow authenticates geometry.
  document.occurrences=['first','second'].map(id=>({id,name:id,definition:{id:'original',revision:'r1'},pose:{translation:[0,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}))
  const report:AssemblyProfileCenterSupportReport={kind:'profile-center',mateId:m.id,scopePath:[],componentPaths:{first:['first'],second:['second']},profileKinds:{first:rect?'rectangle':'circle',second:rect?'rectangle':'circle'},alignment:m.alignment,offsetMm:m.offsetMm,orientation:m.orientation,positionResidualMm:1e-8,normalAngleRadians:1e-10,rectangleAngleRadians:rect?1e-10:null,lengthTolerance:1e-6,angleTolerance:1e-8,satisfied:true,boundedProfiles:true,verificationOnly:true}
  return {document,report}
}
it.each([false,true])('accepts only consistent bounded current-family display reports (%s)',rect=>{
  const {document,report}=reportFixture(rect);expect(assemblyProfileCenterUiReports(document,[report])).toEqual([report]);expect(assemblyProfileCenterUiReports(document,[report,report])).toEqual([])
  for(const patch of [{positionResidualMm:2e-6},{normalAngleRadians:1e-7},{offsetMm:2},{boundedProfiles:false},{verificationOnly:false},{orientation:{mode:'rectangle',quarterTurns:2}},{profileKinds:{first:'circle',second:'rectangle'}}])expect(assemblyProfileCenterUiReports(document,[{...report,...patch} as AssemblyProfileCenterSupportReport])).toEqual([])
})
