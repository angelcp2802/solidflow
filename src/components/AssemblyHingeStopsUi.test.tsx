import { expect, it, vi } from 'vitest'
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import original from '../cad/fixtures/assembly-hinge-original.json'
import { validateAssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyHingeSupportReport } from '../cad/kernel.assembly-types'
import { AssemblyHingeMatePanel, AssemblyHingeSupportSummary, assemblyHingeUiProposal, assemblyHingeUiReports, type HingeUiReferences } from './AssemblyHingeMatePanel'
import { currentHingePick, hingeTicketIsCurrent, nextHingePick, renderedHingePick, liveHingeTicketIsCurrent, type HingePickTicket } from './assemblyHingePicking'

// Original declaration-only UI locators, not native geometric witnesses.
const source=validateAssemblyDocument(original).occurrences[0].definition
const ref=(owner:string,support:'axis'|'plane',key:string)=>({kind:'face' as const,component:{occurrencePath:[owner],definition:{...source}},
  body:{bodyId:'original-hinge-body',sourceFeatureId:'hole'},face:{sourceFeatureId:'hole',key:'face-v1|original-'+key},support})
const refs:HingeUiReferences=[ref('ground','axis','axis'),ref('moving','axis','axis'),ref('ground','plane','cap4'),ref('moving','plane','cap0'),ref('ground','plane','ray'),ref('moving','plane','ray')]
function props():ComponentProps<typeof AssemblyHingeMatePanel>{return{references:structuredClone(refs),axes:refs.slice(0,2).map(r=>({key:JSON.stringify(r),reference:r!,label:'Original axis'})),
  planes:refs.slice(2).map((r,i)=>({key:JSON.stringify(r),reference:r!,label:'Original material plane '+i})),name:'Original limited hinge',alignment:'aligned',editing:false,disabled:false,picking:null,
  limited:true,start:'330',sweep:'60',onLimited:vi.fn(),onStart:vi.fn(),onSweep:vi.fn(),onReference:vi.fn(),onPick:vi.fn(),onName:vi.fn(),onAlignment:vi.fn(),onPreview:vi.fn(),onCancelEdit:vi.fn()}}
interface Control{children?:ReactNode;'aria-label'?:string;disabled?:boolean;value?:unknown;onClick?:()=>void;onChange?:(event:{target:{checked:boolean;value:string}})=>void}
function controls(node:ReactNode):ReactElement<Control>[]{return Children.toArray(node).flatMap(c=>isValidElement<Control>(c)?[c,...controls(c.props.children)]:[])}
const submit=(p:ReturnType<typeof props>)=>controls(AssemblyHingeMatePanel(p)).find(c=>c.type==='button'&&c.props.children===(p.editing?'Verificar edición de bisagra':'Añadir bisagra'))!

it('requires six complete material roles and explicit angular quantities without changing the unlimited shape',()=>{
  const limited=assemblyHingeUiProposal(refs,' Limited ','aligned',{start:'330',sweep:'60'})
  expect(limited.stops).toMatchObject({coordinate:'directed-about-axis',arc:{start:330,sweep:60}});expect(limited.stops!.angular).toHaveLength(2)
  const four=refs.slice(0,4) as HingeUiReferences;expect(Object.hasOwn(assemblyHingeUiProposal(four,'Free','aligned'),'stops')).toBe(false)
  for(const fields of [{start:'',sweep:'60'},{start:'330',sweep:' '},{start:'360',sweep:'0'},{start:'0',sweep:'361'},{start:'-1',sweep:'30'},{start:'NaN',sweep:'30'}])expect(()=>assemblyHingeUiProposal(refs,'Limited','aligned',fields)).toThrow()
  const missing=structuredClone(refs);missing[5]=null;expect(()=>assemblyHingeUiProposal(missing,'Limited','aligned',{start:'330',sweep:'60'})).toThrow()
  const datum=structuredClone(refs);datum[4]={kind:'principal-plane',component:null,plane:'YZ'}
  expect(()=>assemblyHingeUiProposal(datum,'Limited','aligned',{start:'330',sweep:'60'})).toThrow(/material/)
  expect(()=>assemblyHingeUiProposal(refs,'Limited','aligned')).toThrow()
  expect(assemblyHingeUiProposal(refs,'Limited','aligned',{start:'0',sweep:'0'}).stops!.arc.sweep).toBe(0)
})
it('renders six roles, empty explicit fields and no ready action with five roles or a principal angular datum',()=>{
  const p=props();p.start='';p.sweep='';expect(submit(p).props.disabled).toBe(true)
  const html=renderToStaticMarkup(AssemblyHingeMatePanel(p));expect(html).toContain('Plano angular A de bisagra');expect(html).toContain('Plano angular B de bisagra')
  expect(html).toContain('Inicio angular de bisagra en grados');expect(html).toContain('Recorrido angular de bisagra en grados')
  p.start='330';p.sweep='60';p.references[5]=null;expect(submit(p).props.disabled).toBe(true)
  p.references=structuredClone(refs);p.planes.push(p.planes[2]);expect(submit(p).props.disabled).toBe(true);p.planes.pop()
  p.references=structuredClone(refs);p.references[4]={kind:'principal-plane',component:null,plane:'YZ'}
  p.planes.push({key:JSON.stringify(p.references[4]),label:'Declared datum',reference:p.references[4]!});expect(submit(p).props.disabled).toBe(true)
})
it('restores saved normalized six-role edit values and keeps current scene choice keys',()=>{
  const p=props(),saved=assemblyHingeUiProposal(refs,p.name,'aligned',{start:'330',sweep:'60'})
  p.editing=true;p.references=[...saved.axis,...saved.axial,...saved.stops!.angular]
  const tree=AssemblyHingeMatePanel(p);expect(submit(p).props.disabled).toBe(false);submit(p).props.onClick!();expect(p.onPreview).toHaveBeenCalledOnce()
  expect(renderToStaticMarkup(tree)).not.toContain('Referencia guardada')
  const inputs=controls(tree).filter(c=>c.type==='input');expect(inputs.find(c=>c.props['aria-label']==='Inicio angular de bisagra en grados')!.props.value).toBe('330')
  p.disabled=true;expect(controls(AssemblyHingeMatePanel(p)).filter(c=>c.type==='button'||c.type==='input'||c.type==='select').every(c=>c.props.disabled)).toBe(true)
})
function fixture(){const doc=validateAssemblyDocument(original);doc.mates=[{id:'limited',...assemblyHingeUiProposal(refs,'Original limited hinge','aligned',{start:'330',sweep:'60'})}]
  const report:AssemblyHingeSupportReport={kind:'hinge',status:'ok',mateId:'limited',scopePath:[],alignment:'aligned',satisfied:true,supportOnly:true,qualifiedRotation:true,
    axisAngleRad:0,transverseResidualMm:0,axialOffsetMm:0,axialityRad:[0,0],lengthToleranceMm:1e-6,angleToleranceRad:1e-8,precision:{positionMm:4e-7,directionRad:1e-12},componentPaths:{axis:[['ground'],['moving']],axial:[['ground'],['moving']]},
    stops:{coordinate:'directed-about-axis',componentPaths:[['ground'],['moving']],arcDegrees:{start:330,sweep:60},angleRadians:0,projectionLengths:{first:1,second:1},marginsRadians:{minimum:Math.PI/6,maximum:Math.PI/6},activity:'interior',fullCircle:false,directionErrorRad:1e-12}}
  return{doc,report}}
it('displays only the exact saved six-role interval and expanded angular paths, including uncertainty',()=>{
  const{doc,report}=fixture();expect(assemblyHingeUiReports(doc,[report])).toEqual([report]);expect(renderToStaticMarkup(<AssemblyHingeSupportSummary document={doc} reports={[report]}/>)).toContain('Giro dirigido')
  for(const change of [(r:typeof report)=>{delete r.stops},(r:typeof report)=>{r.stops!.componentPaths[1]=['ground']},(r:typeof report)=>{r.stops!.arcDegrees.sweep=90},
    (r:typeof report)=>{r.stops!.fullCircle=true},(r:typeof report)=>{r.stops!.activity='minimum'},(r:typeof report)=>{r.stops!.angleRadians=NaN},
    (r:typeof report)=>{r.stops!.directionErrorRad=-1},(r:typeof report)=>{Object.assign(r.stops!,{scopePath:[]})},
    (r:typeof report)=>{Object.assign(r.stops!,{projectionLengths:null})},(r:typeof report)=>{Object.assign(r.stops!,{arcDegrees:null})},
    (r:typeof report)=>{Object.assign(r.stops!,{marginsRadians:null})}]){const r=structuredClone(report);change(r);expect(assemblyHingeUiReports(doc,[r])).toEqual([])}
  const reordered=structuredClone(report);reordered.stops!.arcDegrees={sweep:60,start:330};expect(assemblyHingeUiReports(doc,[reordered])).toEqual([reordered])
  const wrongScope=structuredClone(report);wrongScope.scopePath=['other'];expect(assemblyHingeUiReports(doc,[wrongScope])).toEqual([])
  expect(assemblyHingeUiReports(doc,[report,report])).toEqual([]);doc.mates[0].suppressed=true;expect(assemblyHingeUiReports(doc,[report])).toEqual([])
})
it('rejects a nominal near-bound report whose retained error consumes the remaining band',()=>{
  const{doc,report}=fixture(),s=report.stops!;s.angleRadians=Math.PI/6+8e-9;s.marginsRadians={minimum:Math.PI/3+8e-9,maximum:-8e-9};s.activity='maximum';s.directionErrorRad=3e-9
  expect(assemblyHingeUiReports(doc,[report])).toEqual([])
  s.directionErrorRad=1e-10;expect(assemblyHingeUiReports(doc,[report])).toEqual([report])
  const unlimited=validateAssemblyDocument(doc);if(unlimited.mates[0].type!=='hinge')throw Error('Hinge');delete unlimited.mates[0].stops
  expect(assemblyHingeUiReports(unlimited,[report])).toEqual([])
})
it('revokes angular callbacks on mode/epoch transitions before rendering newer controls',()=>{
  const t:HingePickTicket={signature:'original',scope:'[]',generation:1,sceneId:'scene',family:'hinge',epoch:3,limited:true,slot:4,producer:'face'}
  expect(currentHingePick(t,t,false)).toBe(true);expect(currentHingePick({...t,producer:'line-edge'},t,false)).toBe(false)
  expect(hingeTicketIsCurrent(t,{...t,limited:false})).toBe(false);expect(currentHingePick(t,{...t,limited:false},false)).toBe(false)
  expect(renderedHingePick(t,{...t,slot:5},t,false)).toBe(false);expect(renderedHingePick(t,t,{...t,epoch:4},false)).toBe(false)
  const live={mounted:true,signature:t.signature,generation:t.generation,scope:t.scope,sceneId:t.sceneId,confirmedSignature:t.signature,sceneSignature:t.signature}
  expect(liveHingeTicketIsCurrent(t,null,live)).toBe(false)
  const pending=structuredClone(refs);pending[4]=null;pending[5]=null
  expect(nextHingePick({...t,slot:3},pending)).toMatchObject({slot:4,producer:'face'});pending[4]=refs[4]
  expect(nextHingePick(t,pending)).toMatchObject({slot:5,producer:'face'});pending[5]=refs[5];expect(nextHingePick(t,pending)).toBeNull()
})
