import { expect,it,vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createEmptyAssembly } from '../examples/assembly'
import type { AssemblyVertexReference,AssemblyCircularPathMate } from '../model/assemblyDocument'
import type { AssemblyCircularPathSupportReport } from '../cad/kernel.assembly-types'
import Panel,{assemblyCircularPathUiProposal,assemblyCircularPathUiReports,AssemblyCircularPathSupportSummary} from './AssemblyCircularPathMatePanel'
const point=(id='point'):AssemblyVertexReference=>({kind:'vertex',support:'point',component:{occurrencePath:[id],definition:{id:'original',revision:'r1'}},body:{bodyId:'sector',sourceFeatureId:'solid'},vertex:{sourceFeatureId:'solid',key:'vertex-v1|'+'a'.repeat(64)}})
const path=()=>({component:point('path').component,body:point().body,edge:{sourceFeatureId:'solid',key:'edge-v1|original'},startVertex:point().vertex})
const proposal=(domain:'trim'|'support-circle'='trim')=>assemblyCircularPathUiProposal(point(),path(),' Original arc ','free',domain,'')
it.each(['trim','support-circle'] as const)('authors detached explicit free domain %s and a complete material origin',domain=>{
 const p=point(),a=path(),before=structuredClone([p,a]),value=assemblyCircularPathUiProposal(p,a,' Arc ','free',domain,'')
 expect(value.position).toEqual({mode:'free',domain});expect(value.type).toBe('circular-path');expect(value.name).toBe('Arc');expect(value.orientation).toEqual({pitchYaw:'free',roll:'free'});value.path.startVertex.key='changed';expect([p,a]).toEqual(before);expect(value).not.toHaveProperty('coordinateMm')
})
it('authors millimetres without reverse, percent, normalized parameter or a fabricated native target',()=>{
 const value=assemblyCircularPathUiProposal(point(),path(),'Arc','coordinate','trim','1.25')
 expect(value.position).toEqual({mode:'coordinate',distanceMm:1.25});expect(value).not.toHaveProperty('parameter')
 for(const bad of ['', 'NaN','Infinity','-1'])expect(()=>assemblyCircularPathUiProposal(point(),path(),'Arc','coordinate','trim',bad)).toThrow()
 expect(()=>assemblyCircularPathUiProposal(null,path(),'Arc','free','trim','')).toThrow();expect(()=>assemblyCircularPathUiProposal(point(),null,'Arc','free','trim','')).toThrow();expect(()=>assemblyCircularPathUiProposal(point(),path(),' ','free','trim','')).toThrow()
 expect(()=>assemblyCircularPathUiProposal(point(),path(),'Arc','free','unknown' as never,'')).toThrow()
})
const choices=()=>({points:[{key:'point',label:'Actual point',reference:point()}],paths:[{key:'arc-origin',label:'Actual arc / material endpoint',reference:path()}]})
it('renders explicit domain and combined compound choice, enabling only current complete drafts',()=>{
 const mate:AssemblyCircularPathMate={id:'arc',...proposal()},html=renderToStaticMarkup(<Panel mate={mate} {...choices()} disabled={false} onPreview={vi.fn()} onCancelEdit={vi.fn()}/> )
 for(const label of ['Punto del trayecto circular','Arco y origen del trayecto circular','Dominio del trayecto circular','Arco recortado','Circunferencia de soporte','Cancelar edición de trayecto circular'])expect(html).toContain(label)
 expect(html).toContain('<button>Vista previa de la edición');expect(html).not.toContain('Invertir trayecto');expect(html).not.toContain('Porcentaje')
 const stale=renderToStaticMarkup(<Panel mate={mate} points={[]} paths={[]} disabled={false} onPreview={vi.fn()} onCancelEdit={vi.fn()}/>);expect(stale).toContain('pendiente de elección actual');expect(stale).toContain('<button disabled="">Vista previa')
})
it('locks controls for preview and retains independent follow and planar UP choices',()=>{
 const guide={kind:'face' as const,support:'plane' as const,component:point('guide').component,body:point().body,face:{sourceFeatureId:'solid',key:'material-plane'}},orientation={pitchYaw:{mode:'follow' as const,axis:'x' as const,reverse:true},roll:{mode:'up' as const,axis:'z' as const,reverse:false,guide}},value=assemblyCircularPathUiProposal(point(),path(),'Arc','coordinate','trim','1',orientation)
 expect(value.orientation).toEqual(orientation)
 const html=renderToStaticMarkup(<Panel mate={{id:'arc',...value}} {...choices()} guides={[{key:'guide',label:'Actual plane',reference:guide}]} disabled onPreview={vi.fn()} onCancelEdit={vi.fn()}/>);expect([...html.matchAll(/<(?:input|select|button)\b[^>]*>/g)].every(m=>m[0].includes('disabled'))).toBe(true)
 expect(html).toContain('Eje UP del trayecto circular');expect(html).toContain('Invertir orientación del trayecto circular');expect(html).toContain('Invertir UP del trayecto circular')
 expect(()=>assemblyCircularPathUiProposal(point(),path(),'Arc','free','trim','',{pitchYaw:'free',roll:orientation.roll} as never)).toThrow()
 expect(()=>assemblyCircularPathUiProposal(point(),path(),'Arc','free','trim','',{...orientation,pitchYaw:{mode:'follow',axis:'z',reverse:false}})).toThrow()
})
function fixture(){
 const document=createEmptyAssembly(),mate:AssemblyCircularPathMate={id:'arc',...proposal()};document.mates=[mate];document.occurrences=['point','path'].map(id=>({id,name:id,definition:{id:'original',revision:'r1'},pose:{translation:[0,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}))
 const report:AssemblyCircularPathSupportReport={kind:'circular-path',mateId:'arc',scopePath:[],status:'ok',satisfied:true,componentPaths:{point:['point'],path:['path']},position:mate.position,orientation:mate.orientation,radiusMm:2,sweepRad:Math.PI/2,curveLengthMm:Math.PI,coordinateMm:Math.PI/2,targetCoordinateMm:null,positionResidualMm:1e-12,orientationResidualRad:null,rollResidualRad:null,domainMarginsMm:{minimum:Math.PI/2,maximum:Math.PI/2},lengthTolerance:1e-6,angleTolerance:1e-8,precision:{positionErrorMm:1e-12,tangentErrorRad:1e-12,orientationErrorRad:null,rollErrorRad:null,domainMarginErrorMm:1e-12},uncertaintyModel:'current-native-analytic-float64',topologyTolerancesMm:{point:1e-7,path:1e-7},materialOrigin:true,verificationOnly:true,compatibilityAuthority:false}
 return {document,report}
}
it('shows only exact current-intent independent reports with retained budgets',()=>{
 const {document,report}=fixture();expect(assemblyCircularPathUiReports(document,[report])).toEqual([report]);expect(renderToStaticMarkup(<AssemblyCircularPathSupportSummary document={document} reports={[report]}/>)).toContain('Trayecto circular verificado')
 for(const patch of [{kind:'line-path'},{materialOrigin:false},{satisfied:false},{status:'precisionLimit'},{position:{mode:'free',domain:'support-circle'}},{componentPaths:{point:['path'],path:['point']}},{coordinateMm:NaN},{radiusMm:0},{positionResidualMm:1e-6},{domainMarginsMm:{minimum:-1e-6,maximum:1}},{precision:{...report.precision,domainMarginErrorMm:null}},{orientationResidualRad:0},{rollResidualRad:0},{verificationOnly:false},{compatibilityAuthority:true}])expect(assemblyCircularPathUiReports(document,[{...report,...patch} as never])).toEqual([])
 expect(assemblyCircularPathUiReports(document,[report,report])).toEqual([])
})
it('matches fixed and support-circle domain reports without reusing trim or a different coordinate',()=>{
 const {document,report}=fixture(),mate=document.mates[0];if(mate.type!=='circular-path')throw Error('Expected arc')
 mate.position={mode:'coordinate',distanceMm:1};const fixed={...report,position:mate.position,targetCoordinateMm:1,coordinateMm:1,domainMarginsMm:null,precision:{...report.precision,domainMarginErrorMm:null}};expect(assemblyCircularPathUiReports(document,[fixed])).toHaveLength(1);expect(assemblyCircularPathUiReports(document,[{...fixed,targetCoordinateMm:2}])).toEqual([])
 mate.position={mode:'free',domain:'support-circle'};const full={...fixed,position:mate.position,targetCoordinateMm:null};expect(assemblyCircularPathUiReports(document,[full])).toHaveLength(1);expect(assemblyCircularPathUiReports(document,[{...full,domainMarginsMm:report.domainMarginsMm}])).toEqual([])
})
