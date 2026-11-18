import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyConfiguredDocument, assemblyConfiguredGeometryInput, serializeAssemblyConfiguredDocument, parseAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { validateAssemblyMate, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { ConfiguredAssemblyWorkerSession, type ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-session'
import { buildConfiguredAssemblyScene, type ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'
import * as scenes from './kernel.assembly-configuration-scene'
import { CadEngine } from './kernel.engine'

const require=createRequire(import.meta.url)
const original=require('../../scripts/desktop-assembly-configured-compound-original.cjs') as (family:string,profileKind?:string)=>unknown
type Family='profile-center'|'line-path'|'circular-path'
const families:Family[]=['profile-center','line-path','circular-path']
const copy=<T>(value:T):T=>structuredClone(value)
const near=(a:number,b:number,band=1e-6)=>{expect(Number.isFinite(a)).toBe(true);expect(Math.abs(a-b)).toBeLessThanOrEqual(band)}
const vector=(a:readonly number[],b:readonly number[],band=1e-6)=>{expect(a).toHaveLength(b.length);a.forEach((v,i)=>near(v,b[i],band))}
beforeAll(async()=>{setOC(await initOpenCascade({wasmBinary:await readFile(require.resolve('replicad-opencascadejs/wasm')),print:()=>undefined,printErr:()=>undefined}))},60_000)
function fixture(family:Family,kind='rectangle'):ConfiguredAssemblyWorkerContext{return {document:validateAssemblyConfiguredDocument(original(family,kind)),generation:31}}
const target=(scopePath=['left'],configuration:string|null='compact')=>({scopePath,definition:{id:'compound-S',revision:'s-r1'},configuration})
function nominees(current:ConfiguredAssemblyWorkerContext,family:Family,kind='rectangle',scopePath:readonly string[]=['left']){
 const scene=buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(current.document,current.generation))
 const body=(id:string)=>{const rows=scene.scene.bodies.filter(b=>b.component.occurrencePath.join('/')===[...scopePath,id].join('/'));expect(rows).toHaveLength(1);return rows[0]}
 const component=(id:string)=>({occurrencePath:[id],definition:{...body(id).component.definition}})
 const vertex=(id:string,p:readonly number[])=>{const rows=body(id).vertexPoints!.filter(v=>v.point.every((x,i)=>Math.abs(x-p[i])<1e-10));expect(rows).toHaveLength(1);return {kind:'vertex' as const,...copy(rows[0].selection),component:component(id),support:'point' as const}}
 const plane=(id:string,axis=2,at=family==='profile-center'?3:4)=>{const rows=body(id).faces.filter(f=>f.support?.kind==='plane'&&f.support.normal[axis]>.99&&Math.abs(f.support.point[axis]-at)<1e-10);expect(rows).toHaveLength(1);return {kind:'face' as const,...copy(rows[0].selection),component:component(id),support:'plane' as const}}
 const edge=(id:string,axis:number,coordinate:number,z:number)=>{const rows=body(id).edges!.filter(e=>e.support?.kind==='line'&&Math.abs(e.support.axis[axis])>.99&&Math.abs(e.support.point[1-axis]-coordinate)<1e-10&&Math.abs(e.support.point[2]-z)<1e-10);expect(rows).toHaveLength(1);return rows[0]}
 const profile=(id:string)=>{
  const face=plane(id),axisEdge=kind==='rectangle'?edge(id,0,-2,3):null
  return {face:{component:face.component,body:face.body,face:face.face},axis:axisEdge?{edge:copy(axisEdge.selection.edge),sense:(axisEdge.support!.kind==='line'&&axisEdge.support!.axis[0]>0?1:-1) as 1|-1}:null}
 }
 const arc=()=>{const start=vertex('a',[5,-2,4]).vertex;const rows=body('a').edges!.filter(e=>e.circularPathOrigins?.length===2&&e.circularPathOrigins.some(v=>v.sourceFeatureId===start.sourceFeatureId&&v.key===start.key));expect(rows).toHaveLength(1);return {...copy(rows[0].selection),component:component('a'),startVertex:start}}
 const base={id:'original-compound',name:'Original '+family,type:family,suppressed:false}
 const guide=plane('a')
 const raw=family==='profile-center'?{...base,first:profile('a'),second:profile('b'),alignment:'aligned',offsetMm:2,orientation:kind==='rectangle'?{mode:'rectangle',quarterTurns:1}:{mode:'free'}}
  :family==='line-path'?{...base,point:vertex('b',[-2,3,0]),path:{...copy(edge('a',1,-2,4).selection),component:component('a'),startVertex:vertex('a',[-2,-3,4]).vertex},position:{mode:'distance',distanceMm:1,reverse:false},orientation:{pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:{mode:'up',axis:'z',reverse:false,guide}}}
  :{...base,point:vertex('b',[3,-2,4]),path:arc(),position:{mode:'coordinate',distanceMm:Math.PI/2},orientation:{pitchYaw:{mode:'follow',axis:'x',reverse:false},roll:{mode:'up',axis:'z',reverse:false,guide}}}
 return {mate:validateAssemblyMate(raw),scene,body,vertex,plane,edge,arc}
}
// Original expected placements/material bounds use elementary dimensions and
// proper quarter-turns, never production transforms, endpoint or solver helpers.
function physical(scene:ConfiguredAssemblyScene,family:Family,kind='rectangle'){
 const s=scene.scene;expect(s.solidCount).toBe(4);expect(s.bodies).toHaveLength(4);expect(s.prototypeCount).toBe(1)
 const root2=Math.SQRT2,rows=family==='profile-center'?(kind==='rectangle'?
  [['left/a',[-3,-2,0],[3,2,3]],['left/b',[-2,-3,2],[2,3,5]],['right/a',[28,-3,0],[32,3,3]],['right/b',[27,-2,2],[33,2,5]]]:
  [['left/a',[-2,-2,0],[2,2,3]],['left/b',[-2,-2,2],[2,2,5]],['right/a',[28,-2,0],[32,2,3]],['right/b',[28,-2,2],[32,2,5]]]):family==='line-path'?
  [['left/a',[-2,-3,0],[2,3,4]],['left/b',[-2,-8,4],[2,-2,8]],['right/a',[27,-2,0],[33,2,4]],['right/b',[32,-2,4],[38,2,8]]]:
  [['left/a',[3,-2,0],[5,0,4]],['left/b',[1+root2,-2,0],[3+root2,-2+2*root2,4]],['right/a',[30,3,0],[32,5,4]],['right/b',[32-2*root2,1+root2,0],[32,3+root2,4]]]
 const volume=family==='profile-center'?(kind==='rectangle'?288:48*Math.PI):family==='line-path'?384:16*Math.PI
 const area=family==='profile-center'?(kind==='rectangle'?432:80*Math.PI):family==='line-path'?512:24*Math.PI+64
 near(s.volume,volume,1e-5);near(s.area,area,1e-5)
 expect(new Set(s.bodies.map(b=>b.component.occurrencePath.join('/'))).size).toBe(4)
 for(const [path,min,max]of rows){const selected=s.bodies.filter(b=>b.component.occurrencePath.join('/')===path);expect(selected).toHaveLength(1);vector(selected[0].bounds.min,min as number[]);vector(selected[0].bounds.max,max as number[])}
 if(family!=='profile-center'||kind==='rectangle'){
  const rotate=(q:readonly number[],v:readonly number[])=>{const[x,y,z,w]=q,[a,b,c]=v;return[(1-2*y*y-2*z*z)*a+(2*x*y-2*z*w)*b+(2*x*z+2*y*w)*c,(2*x*y+2*z*w)*a+(1-2*x*x-2*z*z)*b+(2*y*z-2*x*w)*c,(2*x*z-2*y*w)*a+(2*y*z+2*x*w)*b+(1-2*x*x-2*y*y)*c]}
  for(const owner of ['left','right']){
   const b=s.bodies.find(b=>b.component.occurrencePath.join('/')===owner+'/b')!,q=b.worldPose.rotation
   const wanted=family==='profile-center'?(owner==='left'?[0,1,0]:[-1,0,0]):family==='line-path'?(owner==='left'?[0,1,0]:[-1,0,0]):(owner==='left'?[-Math.SQRT1_2,Math.SQRT1_2,0]:[-Math.SQRT1_2,-Math.SQRT1_2,0])
   vector(rotate(q,family==='line-path'?[0,1,0]:[1,0,0]),wanted,1e-8);vector(rotate(q,[0,0,1]),[0,0,1],1e-8)
  }
 }
}
function declaration(current:ConfiguredAssemblyWorkerContext){return evaluateAssemblyConfiguration(current.document.source,current.document.catalog,current.document.rootConfiguration).scopes.find(s=>s.path.join('/')==='left')!.mates[0] as AssemblyMate}
it.each(families)('authors %s with current compounds, verifies all shared geometry and privately applies/reopens',family=>{
 const current=fixture(family),before=copy(current),{mate}=nominees(current,family),session=new ConfiguredAssemblyWorkerSession()
 const first=session.previewEdit(current,{...target(),change:{kind:'add',mate}})
 expect(first.verification.accepted).toBe(true);expect(first.verification.reports).toHaveLength(2);physical(first.scene,family)
 session.discard(first.token);expect(()=>session.apply(current,first.token)).toThrow(/unknown|consumed/)
 const preview=session.previewEdit(current,{...target(),change:{kind:'add',mate}}),expected=copy(preview.document)
 preview.document.catalog.length=0;session.discard('unrelated')
 const applied=session.apply(current,preview.token);expect(applied.document).toEqual(expected);expect(current).toEqual(before);expect(applied.document.source).toEqual(before.document.source)
 expect(applied.document.catalog[1].configurations.find(v=>v.id==='dormant')).toEqual(before.document.catalog[1].configurations.find(v=>v.id==='dormant'))
 const reopened=parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(applied.document)),next={document:reopened,generation:0},fresh=new ConfiguredAssemblyWorkerSession().preview(next)
 expect(fresh.verification.accepted).toBe(true);physical(fresh.scene,family)
 expect(()=>session.apply(current,preview.token)).toThrow(/unknown|consumed/)
},60_000)
it('authors original circle-circle Free profile offset without inventing a material roll',()=>{
 const current=fixture('profile-center','circle'),{mate}=nominees(current,'profile-center','circle'),session=new ConfiguredAssemblyWorkerSession()
 const preview=session.previewEdit(current,{...target(),change:{kind:'add',mate}})
 expect(preview.verification.accepted).toBe(true);expect(preview.verification.reports).toHaveLength(2);physical(preview.scene,'profile-center','circle')
 if(mate.type!=='profile-center')throw Error('Original profile missing');expect(mate.orientation).toEqual({mode:'free'});expect(mate.first.axis).toBeNull();expect(mate.second.axis).toBeNull()
},60_000)
it.each(families)('replaces complete %s parameter intent and freshly measures both shared uses',family=>{
 const current=fixture(family),{mate}=nominees(current,family),session=new ConfiguredAssemblyWorkerSession(),first=session.previewEdit(current,{...target(),change:{kind:'add',mate}}),applied=session.apply(current,first.token)
 const next={document:applied.document,generation:applied.generation},changed=copy(declaration(next)),before=copy(next)
 if(changed.type==='profile-center')changed.offsetMm=3
 else if(changed.type==='line-path')changed.position={mode:'distance',distanceMm:2,reverse:false}
 else if(changed.type==='circular-path')changed.position={mode:'coordinate',distanceMm:0}
 else throw Error('Original compound relation missing')
 const preview=session.previewEdit(next,{...target(),change:{kind:'replace',mateId:changed.id,mate:changed}})
 expect(preview.verification.accepted).toBe(true);expect(preview.verification.reports).toHaveLength(2)
 for(const owner of ['left','right']){
  const b=preview.scene.scene.bodies.find(b=>b.component.occurrencePath.join('/')===owner+'/b')!
  if(family==='profile-center'){near(b.bounds.min[2],3);near(b.bounds.max[2],6)}
  else if(family==='line-path'){vector(b.bounds.min,owner==='left'?[-2,-7,4]:[31,-2,4]);vector(b.bounds.max,owner==='left'?[2,-1,8]:[37,2,8])}
  else {vector(b.bounds.min,owner==='left'?[3,-2,0]:[30,3,0]);vector(b.bounds.max,owner==='left'?[5,0,4]:[32,5,4])}
 }
 const result=session.apply(next,preview.token);expect(declaration({document:result.document,generation:result.generation})).toEqual(changed)
 expect(result.document.source).toEqual(current.document.source);expect(next).toEqual(before)
},60_000)
it.each(['trim','support-circle'] as const)('authors explicit Free circular %s domain from a retained interior physical point',domain=>{
 const current=fixture('circular-path'),{mate}=nominees(current,'circular-path'),session=new ConfiguredAssemblyWorkerSession(),first=session.previewEdit(current,{...target(),change:{kind:'add',mate}}),applied=session.apply(current,first.token)
 const next={document:applied.document,generation:applied.generation},changed=copy(declaration(next));if(changed.type!=='circular-path')throw Error('Original arc missing')
 changed.position={mode:'free',domain}
 const preview=session.previewEdit(next,{...target(),change:{kind:'replace',mateId:changed.id,mate:changed}})
 expect(preview.verification.accepted).toBe(true);expect(preview.verification.reports).toHaveLength(2);physical(preview.scene,'circular-path')
 for(const row of preview.verification.reports){const measured=row.measurement;if(measured.family!=='circular-path')throw Error('Original circular report missing');expect(measured.status).toBe('ok');near(measured.coordinateMm!,Math.PI/2);near(measured.positionResidualMm!,0)}
 expect(changed.position).toEqual({mode:'free',domain})
},60_000)
it.each(families)('Base %s authoring isolates named and dormant inherited declaration lists',family=>{
 const current=fixture(family);current.document.rootConfiguration='mixed'
 const before=copy(current),{mate}=nominees(current,family),session=new ConfiguredAssemblyWorkerSession(),preview=session.previewEdit(current,{...target(['left'],null),change:{kind:'add',mate}})
 const result=session.apply(current,preview.token),node=result.document.source.definitions.find(d=>d.id==='compound-S') as EmbeddedAssemblyDefinition
 expect(node.mates).toHaveLength(1);expect(node.mates[0].id).toBe(mate.id)
 for(const state of result.document.catalog[1].configurations)expect(state.mateDeclarations).toEqual([])
 expect(result.document.source.definitions.filter(d=>d.kind==='part')).toEqual(before.document.source.definitions.filter(d=>d.kind==='part'));expect(current).toEqual(before)
},60_000)
it.each(['line-path','circular-path'] as const)('rejects a nonincident %s material-origin vertex, leaving input and authority unchanged',family=>{
 const current=fixture(family),before=copy(current),n=nominees(current,family),mate=copy(n.mate),session=new ConfiguredAssemblyWorkerSession()
 if(mate.type!=='line-path'&&mate.type!=='circular-path')throw Error('Original path missing')
 mate.path.startVertex=n.vertex('a',family==='line-path'?[-2,-3,0]:[3,-2,4]).vertex
 expect(()=>session.previewEdit(current,{...target(),change:{kind:'add',mate}})).toThrow();expect(current).toEqual(before);expect(()=>session.apply(current,'not-issued')).toThrow(/unknown|consumed/)
},60_000)
it('rejects a rectangle material axis on the opposite face instead of matching equal coordinates or source alone',()=>{
 const current=fixture('profile-center'),before=copy(current),n=nominees(current,'profile-center'),mate=copy(n.mate)
 if(mate.type!=='profile-center'||!mate.first.axis)throw Error('Original rectangle material axis missing')
 mate.first.axis.edge=copy(n.edge('a',0,-2,0).selection.edge)
 expect(()=>new ConfiguredAssemblyWorkerSession().previewEdit(current,{...target(),change:{kind:'add',mate}})).toThrow();expect(current).toEqual(before)
},60_000)
it('does not reuse circular material proof as LINE or a radial LINE as circular proof',()=>{
 const current=fixture('circular-path'),before=copy(current),n=nominees(current,'circular-path'),mate=n.mate
 if(mate.type!=='circular-path')throw Error('Original circular path missing')
 const line=validateAssemblyMate({...mate,type:'line-path',position:{mode:'distance',distanceMm:1,reverse:false},orientation:{pitchYaw:'free',roll:'free'}})
 expect(()=>new ConfiguredAssemblyWorkerSession().previewEdit(current,{...target(),change:{kind:'add',mate:line}})).toThrow()
 const circular=copy(mate),edge=n.edge('a',0,-2,4)
 circular.path={...copy(edge.selection),component:{occurrencePath:['a'],definition:{...n.body('a').component.definition}},startVertex:n.vertex('a',[5,-2,4]).vertex}
 expect(()=>new ConfiguredAssemblyWorkerSession().previewEdit(current,{...target(),change:{kind:'add',mate:circular}})).toThrow();expect(current).toEqual(before)
},60_000)
it.each(['line-path','circular-path'] as const)('rejects singular projected UP in %s without an automatic guide fallback',family=>{
 const current=fixture(family),before=copy(current),n=nominees(current,family),mate=copy(n.mate)
 if(mate.type!=='line-path'&&mate.type!=='circular-path')throw Error('Original path missing')
 if(typeof mate.orientation.roll!=='object')throw Error('Original UP missing')
 const guideRows=n.body('a').faces.filter(f=>f.support?.kind==='plane'&&Math.abs(f.support.normal[1])>.99)
 expect(guideRows.length).toBeGreaterThan(0)
 mate.orientation.roll.guide={kind:'face',...copy(guideRows[0].selection),component:{occurrencePath:['a'],definition:{...n.body('a').component.definition}},support:'plane'}
 if(mate.type==='circular-path')mate.position={mode:'coordinate',distanceMm:0}
 expect(()=>new ConfiguredAssemblyWorkerSession().previewEdit(current,{...target(),change:{kind:'add',mate}})).toThrow();expect(current).toEqual(before)
},60_000)
it.each(families)('consumes stale %s Apply and refuses proposal contexts/DTOs as baseline authority',family=>{
 const current=fixture(family),{mate}=nominees(current,family),session=new ConfiguredAssemblyWorkerSession(),preview=session.previewEdit(current,{...target(),change:{kind:'add',mate}})
 expect(()=>session.apply({document:preview.document,generation:current.generation},preview.token)).toThrow(/baseline/)
 expect(()=>session.apply(current,preview.token)).toThrow(/unknown|consumed/)
 const next=session.previewEdit(current,{...target(),change:{kind:'add',mate}});current.generation++
 expect(()=>session.apply(current,next.token)).toThrow(/baseline/)
},60_000)
it.each(['failure','reentry'] as const)('withholds compound capability after a real final scene %s',phase=>{
 const current=fixture('line-path'),before=copy(current),{mate}=nominees(current,'line-path'),session=new ConfiguredAssemblyWorkerSession(),actual=scenes.buildConfiguredAssemblyScene
 const spy=vi.spyOn(scenes,'buildConfiguredAssemblyScene').mockImplementation((...args)=>{const result=actual(...args);if(phase==='failure')throw Error('Original compound final scene failure');current.generation++;return result})
 try{expect(()=>session.previewEdit(current,{...target(),change:{kind:'add',mate}})).toThrow(phase==='failure'?'Original compound final scene failure':/context changed/)}finally{spy.mockRestore()}
 expect(current.document).toEqual(before.document);expect(()=>session.apply(current,'not-issued')).toThrow(/unknown|consumed/)
},60_000)
it('drains actual native cleanup failure without publishing an authoring capability',()=>{
 const current=fixture('profile-center'),before=copy(current),{mate}=nominees(current,'profile-center'),session=new ConfiguredAssemblyWorkerSession(),actual=CadEngine.prototype.dispose
 let calls=0;const spy=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){actual.call(this);calls++;throw Error('Original compound cleanup failure')})
 try{expect(()=>session.previewEdit(current,{...target(),change:{kind:'add',mate}})).toThrow();expect(calls).toBeGreaterThan(0)}finally{spy.mockRestore()}
 expect(current).toEqual(before);expect(()=>session.apply(current,'not-issued')).toThrow(/unknown|consumed/)
},60_000)

// Additive original acceptance: keep the preceding 24 cases and their bands.
// All selections below come from actual current configured native scenes.
function rejectedCompound(current:ConfiguredAssemblyWorkerContext,mate:AssemblyMate,where=target()){
 const before=copy(current),session=new ConfiguredAssemblyWorkerSession()
 expect(()=>session.previewEdit(current,{...where,change:{kind:'add',mate}})).toThrow()
 expect(current).toEqual(before)
 expect(()=>session.apply(current,'not-issued')).toThrow(/unknown|consumed/)
}
it('rejects a real cylinder full-circle seam through configured circular-path preview',()=>{
 const current=fixture('profile-center','circle')
 // Original 1x1x1 blind underside pocket makes current same-body material
 // vertices selectable without granting identity to the closed-only seam.
 // Upper R2 circle at Z3 remains closed; V=12pi-1, A=20pi+4.
 const part=current.document.source.definitions.find(d=>d.kind==='part')!
 if(part.kind!=='part')throw Error('Original cylinder part missing')
 part.document.features.push(
  {id:'original-pocket-profile',name:'Original lower pocket profile',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[0,0],width:1,height:1}},
  {id:'original-pocket',name:'Original lower pocket',type:'cut',sketchId:'original-pocket-profile',depth:1,symmetric:false,suppressed:false,bodyScope:[{bodyId:'body',sourceFeatureId:'solid'}]})
 const before=copy(current),scene=buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(current.document,current.generation))
 const body=(id:string)=>scene.scene.bodies.find(b=>b.component.occurrencePath.join('/')==='left/'+id)!
 const a=body('a')
 near(a.volume,12*Math.PI-1,1e-5);near(a.area,20*Math.PI+4,1e-5)
 // Display lines nominate the upper edge at left identity, never radius proof.
 const upper=(values:readonly number[])=>values.length>=9&&values.length%3===0&&Array.from({length:values.length/3},(_,i)=>i).every(i=>Math.abs(values[3*i+2]-3)<1e-10)
 const circles=a.edges!.filter(e=>e.support===null&&upper(e.lines))
 expect(circles).toHaveLength(1)
 const circle=circles[0];expect(circle.circularPathOrigins??[]).toHaveLength(0)
 const vertex=(id:string)=>{const rows=body(id).vertexPoints!.filter(v=>v.point.every((x,i)=>Math.abs(x-[.5,.5,0][i])<1e-10));expect(rows).toHaveLength(1);return rows[0]}
 const component=(id:string)=>({occurrencePath:[id],definition:{...body(id).component.definition}})
 const mate=validateAssemblyMate({id:'original-full-circle-rejected',name:'Original closed seam is not an open material arc',type:'circular-path',suppressed:false,
  point:{kind:'vertex',...copy(vertex('b').selection),component:component('b'),support:'point'},
  path:{...copy(circle.selection),component:component('a'),startVertex:copy(vertex('a').selection.vertex)},
  position:{mode:'coordinate',distanceMm:0},orientation:{pitchYaw:'free',roll:'free'}})
 const session=new ConfiguredAssemblyWorkerSession()
 // Origin is a genuine current same-body vertex. The explicit closed-circle
 // purpose guard must run before incidence: arbitrary missing/nonincident
 // vertex errors would NOT satisfy this diagnostic assertion.
 expect(()=>session.previewEdit(current,{...target(),change:{kind:'add',mate}})).toThrow('Material arc requires an open trimmed circle, not LINE or a closed seam.')
 expect(current).toEqual(before);expect(()=>session.apply(current,'not-issued')).toThrow(/unknown|consumed/)
},60_000)
for(const family of families)for(const missing of ['tuple','body'] as const)
it(`withholds ${family} preview for an unavailable exact ${missing}`,()=>{
 const current=fixture(family),n=nominees(current,family),mate=copy(n.mate)
 const selection=mate.type==='profile-center'?mate.first.face:mate.type==='line-path'||mate.type==='circular-path'?mate.path:null
 if(!selection)throw Error('Original compound positional role missing')
 if(missing==='tuple')selection.component.definition.revision='missing-original-r999'
 else {expect(selection.body).not.toBeNull();selection.body={...selection.body!,bodyId:'missing-original-body'}}
 rejectedCompound(current,validateAssemblyMate(mate))
},60_000)
function finiteGuideFixture(family:'line-path'|'circular-path',epsilon:number){
 const current=fixture(family),s=current.document.source.definitions.find(d=>d.id==='compound-S') as EmbeddedAssemblyDefinition
 const a=s.occurrences.find(o=>o.id==='a')!,h=-Math.PI/2+epsilon
 s.occurrences.push({...copy(a),id:'guide',name:'Original finite projected guide',pose:{translation:[20,30,40],rotation:[Math.sin(h/2),0,0,Math.cos(h/2)]},fixed:true})
 const n=nominees(current,family),mate=copy(n.mate)
 if(mate.type!=='line-path'&&mate.type!=='circular-path')throw Error('Original path missing')
 const scene=buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(current.document,current.generation))
 const g=scene.scene.bodies.find(b=>b.component.occurrencePath.join('/')==='left/guide')!
 const rows=g.faces.filter(f=>f.support?.kind==='plane'&&f.support.normal[2]>.99&&Math.abs(f.support.point[2]-4)<1e-10)
 expect(rows).toHaveLength(1)
 const guide={kind:'face' as const,...copy(rows[0].selection),component:{occurrencePath:['guide'],definition:{...g.component.definition}},support:'plane' as const}
 mate.orientation={pitchYaw:{mode:'follow',axis:'y',reverse:false},roll:{mode:'up',axis:'z',reverse:false,guide}}
 if(mate.type==='circular-path')mate.position={mode:'coordinate',distanceMm:0}
 // Independent proper Rx(h) action on actual local roof normal. At fixed
 // coordinate0 both original material paths have +Y tangent.
 const normal=[0,-Math.sin(h),Math.cos(h)],projection=Math.hypot(normal[0],normal[2])
 expect(Number.isFinite(projection)).toBe(true);expect(projection).toBeGreaterThan(0)
 return{current,mate:validateAssemblyMate(mate),projection}
}
it.each(['line-path','circular-path'] as const)('withholds finite uncertain %s UP and accepts a separately retained guide cone',family=>{
 const uncertain=finiteGuideFixture(family,1e-10),before=copy(uncertain.current),session=new ConfiguredAssemblyWorkerSession()
 expect(uncertain.projection).toBeLessThan(1e-8)
 // Not a missing reference or exactly parallel-vector construction. The real
 // native finite directional error cannot certify this nonzero projection.
 expect(()=>session.previewEdit(uncertain.current,{...target(),change:{kind:'add',mate:uncertain.mate}})).toThrow(/precision|projection|uncertain|retai|observ|angle|direction/i)
 expect(uncertain.current).toEqual(before);expect(()=>session.apply(uncertain.current,'not-issued')).toThrow(/unknown|consumed/)
 const safe=finiteGuideFixture(family,.2),safeBefore=copy(safe.current),fresh=new ConfiguredAssemblyWorkerSession()
 expect(safe.projection).toBeGreaterThan(.19)
 const preview=fresh.previewEdit(safe.current,{...target(),change:{kind:'add',mate:safe.mate}})
 expect(preview.verification.accepted).toBe(true);expect(preview.verification.reports).toHaveLength(2)
 expect(preview.verification.bands).toEqual({lengthToleranceMm:1e-6,angleToleranceRad:1e-8})
 for(const row of preview.verification.reports){const measured=row.measurement
  if(measured.family!=='line-path'&&measured.family!=='circular-path')throw Error('Original path report missing')
  expect(measured.status).toBe('ok');expect(measured.satisfied).toBe(true)
  expect(Math.abs(measured.rollResidualRad!)+measured.precision.rollErrorRad!).toBeLessThanOrEqual(1e-8)
 }
 expect(safe.current).toEqual(safeBefore);fresh.discard(preview.token)
},60_000)
function nestedCompoundFixture(family:Family){
 const current=fixture(family),source=current.document.source,s=source.definitions.find(d=>d.id==='compound-S') as EmbeddedAssemblyDefinition
 const stamp=source.createdAt,g:EmbeddedAssemblyDefinition={kind:'assembly',id:'compound-G',revision:'g-r1',name:'Original noncommuting shared parent',createdAt:stamp,updatedAt:stamp,
  occurrences:[{id:'inner',name:'Inner original S',definition:{id:s.id,revision:s.revision},pose:{translation:[5,-7,2],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:true,visible:true,suppressed:false}],mates:[]}
 source.definitions.push(g)
 for(const o of source.occurrences)o.definition={id:g.id,revision:g.revision}
 for(const state of current.document.catalog[0].configurations)for(const o of state.occurrences)if(o.configuration==='compact')o.configuration='wrapped'
 current.document.catalog.push({definition:{id:g.id,revision:g.revision},configurations:[{id:'wrapped',name:'Original wrapped compact',occurrences:[{occurrenceId:'inner',configuration:'compact'}],mates:[]}]})
 current.document=validateAssemblyConfiguredDocument(current.document)
 return current
}
function nestedCompoundPhysical(scene:ConfiguredAssemblyScene,family:Family){
 const root2=Math.SQRT2
 const local=family==='profile-center'?
  [['a',[-3,-2,0],[3,2,3]],['b',[-2,-3,2],[2,3,5]]]:family==='line-path'?
  [['a',[-2,-3,0],[2,3,4]],['b',[-2,-8,4],[2,-2,8]]]:
  [['a',[3,-2,0],[5,0,4]],['b',[1+root2,-2,0],[3+root2,-2+2*root2,4]]]
 const expected=new Map<string,{min:number[];max:number[]}>()
 for(const owner of ['left','right'])for(const [id,lo,hi]of local){const min=lo as number[],max=hi as number[]
  // Literal Rx90 + [5,-7,2], then distinct outer Rz90+[30,0,0].
  const lmin=[min[0]+5,-max[2]-7,min[1]+2],lmax=[max[0]+5,-min[2]-7,max[1]+2]
  expected.set(owner+'/inner/'+id,owner==='left'?{min:lmin,max:lmax}:{min:[30-lmax[1],lmin[0],lmin[2]],max:[30-lmin[1],lmax[0],lmax[2]]})
 }
 const actual=scene.scene.bodies
 expect(actual).toHaveLength(4);expect(scene.scene.solidCount).toBe(4);expect(scene.scene.prototypeCount).toBe(1)
 expect(new Set(actual.map(b=>b.component.occurrencePath.join('/'))).size).toBe(4)
 expect(actual.map(b=>b.component.occurrencePath.join('/')).sort()).toEqual([...expected.keys()].sort())
 for(const b of actual){const e=expected.get(b.component.occurrencePath.join('/'))!;vector(b.bounds.min,e.min);vector(b.bounds.max,e.max)}
 near(scene.scene.volume,family==='profile-center'?288:family==='line-path'?384:16*Math.PI,1e-5)
 near(scene.scene.area,family==='profile-center'?432:family==='line-path'?512:24*Math.PI+64,1e-5)
}
it.each(families)('authors %s at depth-two selected state with all shared proper placements',family=>{
 const current=nestedCompoundFixture(family),before=copy(current),scope=['left','inner'],n=nominees(current,family,'rectangle',scope),session=new ConfiguredAssemblyWorkerSession()
 const preview=session.previewEdit(current,{...target(scope),change:{kind:'add',mate:n.mate}})
 expect(preview.verification.accepted).toBe(true);expect(preview.verification.reports).toHaveLength(2)
 const expectedKeys=['left','right'].map(owner=>JSON.stringify([[owner,'inner'],'compound-S','s-r1','compact',n.mate.id])).sort()
 expect(preview.verification.reports.map(r=>r.key).sort()).toEqual(expectedKeys)
 const core=evaluateAssemblyConfiguration(preview.document.source,preview.document.catalog,preview.document.rootConfiguration)
 for(const owner of ['left','right']){
  const placed=core.parts.filter(p=>p.path.join('/').startsWith(owner+'/inner/'))
  expect(placed).toHaveLength(2)
  for(const p of placed){expect(p.configurationAncestry.map(a=>a.configuration)).toEqual(['both-compact','wrapped','compact'])}
 }
 nestedCompoundPhysical(preview.scene,family)
 const applied=session.apply(current,preview.token)
 expect(current).toEqual(before);expect(applied.document.source).toEqual(before.document.source)
 expect(applied.document.catalog.find(c=>c.definition.id==='compound-S')!.configurations.find(c=>c.id==='dormant')).toEqual(before.document.catalog.find(c=>c.definition.id==='compound-S')!.configurations.find(c=>c.id==='dormant'))
 const reopened={document:parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(applied.document)),generation:0},fresh=new ConfiguredAssemblyWorkerSession(),again=fresh.preview(reopened)
 expect(again.verification.accepted).toBe(true);expect(again.verification.reports.map(r=>r.key).sort()).toEqual(expectedKeys);nestedCompoundPhysical(again.scene,family)
 fresh.discard(again.token)
},60_000)
