"use strict";
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Original public 4x6x4 prism, R2/H4 cylinder and the tracked original R2
// revolved sphere from assembly-sphere-sphere-tangent-original.json. Five
// independent three-owner rows: source/mirror fixed, target starts at X6.
// Real dropdowns, worker/Apply and file IPC only. No viewport point-click claim.
module.exports = function symmetryWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const {expected,input,output,evaluate,observe,waitFor,click,capture,checks,ipc,check,canonical,digest,initialReadyMs,dialogCounts,consoleErrors,failedRequests,protocolResponses}=context;
  const saveObservation=require('./desktop-save-observation.cjs').createSaveObservation({input,output,canonical,digest});
  const families=['point','line','plane','sphere','cylinder'];
  const TYPE='select[aria-label="Tipo de relación"]', FAMILY='select[aria-label="Familia de simetría"]', NAME='input[aria-label="Nombre de simetría"]', ALIGN='select[aria-label="Orientación de simetría"]';
  const roles=['Origen de simetría','Destino de simetría','Plano de simetría'], APPLY='button[aria-label="Aplicar ensamblaje"]', CANCEL='button[aria-label="Cancelar vista previa del ensamblaje"]', SUMMARY='[aria-label="Simetría verificada"]';
  const evidence={scenario:'original-five-family-symmetry',cases:[]};checks.push(evidence);
  const page=(fn,...args)=>evaluate('('+fn.toString()+')('+args.map(encodeJavaScriptString).join(',')+')');
  const near=(a,b,t,label)=>check(Number.isFinite(a)&&Math.abs(a-b)<=t,label+' actual='+a+' expected='+b);
  const vector=(a,b,t,label)=>{check(Array.isArray(a)&&a.length===b.length,label+' dimensions');a.forEach((v,i)=>near(v,b[i],t,label+'['+i+']'));};
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),norm=a=>Math.hypot(...a);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function rotate(q,p){near(norm(q),1,1e-10,'Unit proper quaternion');const t=mul(cross(q.slice(0,3),p),2),c=cross(q.slice(0,3),t);return p.map((v,i)=>v+q[3]*t[i]+c[i]);}
  function placed(body,p){const r=rotate(body.worldPose.rotation,p);return r.map((v,i)=>v+body.worldPose.translation[i]);}
  async function button(text,scope='.assembly-app'){ await assemblyNavigation.button(text, scope);await page((text,scope)=>{const values=[...document.querySelectorAll(scope+' button')].filter(v=>v.textContent.trim()===text);if(values.length!==1||values[0].disabled)throw Error('Exact enabled button absent: '+text);values[0].click();},text,scope);}
  async function control(selector,value){ await assemblyNavigation.reveal(selector);await page((selector,value)=>{const el=document.querySelector(selector);if(!el||el.disabled)throw Error('Editable control absent: '+selector);const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;if(el instanceof HTMLSelectElement&&![...el.options].some(o=>o.value===value&&!o.disabled))throw Error('Exact option absent: '+value);Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},selector,value);await waitFor('rendered '+selector,()=>page((selector,value)=>document.querySelector(selector)?.value===value,selector,value));}
  const idle=label=>waitFor(label,()=>page(()=>document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false'));
  async function responseAfter(serial,action){return waitFor('actual '+action,async()=>{const state=await observe();check(!state.workerErrors.length,'Actual worker errors');const found=state.assemblies.filter(v=>v.serial>serial&&v.action===action&&v.response);check(found.length<=1,'Duplicate '+action);if(!found.length)return false;check(found[0].response.ok,found[0].response.error||'Actual operation failed');return found[0];});}
  async function recovery(document,label){await waitFor(label+' committed recovery',async()=>await page(()=>document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false')&&canonical(JSON.parse(await page(()=>localStorage.getItem('solidflow.autosave'))))===canonical(document));}
  function body(scene,id){const values=scene.bodies.filter(v=>canonical(v.component.occurrencePath)===canonical([id]));check(values.length===1,'Exact native owner '+id);return values[0];}
  function support(scene,id,kind){const b=body(scene,id);let candidates;
    if(kind==='point'){candidates=(b.vertexPoints??[]).filter(v=>norm(v.point)<=1e-12);check(candidates.length===1,'Unique actual origin vertex '+id);return {reference:{kind:'vertex',...candidates[0].selection,support:'point'},point:candidates[0].point,body:b};}
    if(kind==='line'){candidates=(b.edges??[]).filter(v=>v.support?.kind==='line'&&Math.abs(v.support.point[0])<1e-12&&Math.abs(v.support.point[1])<1e-12&&Math.abs(v.support.axis[2])>.999);check(candidates.length===1,'Unique actual origin-Z LINE '+id);const v=candidates[0];return {reference:{kind:'edge',...v.selection,support:'line'},point:v.support.point,direction:v.support.axis,body:b};}
    candidates=b.faces.filter(v=>kind==='plane'?v.support?.kind==='plane'&&v.support.normal[0]<-.999&&Math.abs(v.support.point[0])<1e-12:kind==='sphere'?v.sphereSurface?.kind==='sphere-surface':v.support?.kind==='cylinder');check(candidates.length===1,'Exact actual '+kind+' surface '+id);const v=candidates[0],s=kind==='sphere'?v.sphereSurface:v.support;
    if(kind==='sphere')return {reference:{kind:'face',...v.selection,support:'sphere-surface'},point:s.center,radius:s.radius,body:b};
    return {reference:{kind:'face',...v.selection,support:kind==='plane'?'plane':'cylinder-surface'},point:s.point,direction:kind==='plane'?s.normal:s.axis,...(kind==='cylinder'?{radius:s.radius}:{}),body:b};
  }
  function refsFor(scene,kind){const source=support(scene,kind+'-source',kind),target=support(scene,kind+'-target',kind),owner=body(scene,kind+'-mirror').component;return [source.reference,target.reference,{kind:'principal-plane',component:owner,plane:'YZ'}];}
  function intent(document,kind,refs,id,name){const m=document.mates.find(v=>v.name===name);check(m?.type==='symmetry'&&m.entityKind===kind&&m.suppressed===false&&!('first'in m)&&!('second'in m),'Three-role saved '+kind+' intent');if(id)check(m.id===id,'Stable symmetry ID');check(canonical([m.source,m.target,m.mirror])===canonical(refs),'Exact ordered three references');check(m.alignment===(kind==='point'||kind==='sphere'?null:kind==='plane'?'opposed':'aligned'),'Explicit original branch');return m;}
  // A reflected support does not lock the complete rigid-body pose. Point and
  // sphere leave orientation free; directional supports retain their physical
  // gauge freedoms too. Check fixed/nonparticipating poses exactly, and use
  // the actual proper rotation for independent finite-solid bounds below.
  function geometry(scene,document,solved){check(scene.kind==='assembly-scene'&&scene.solidCount===15&&scene.bodies.length===15&&scene.prototypeCount===3&&!scene.warnings.length,'Original fifteen solids/three prototypes');check(canonical(document.definitions)===canonical(expected.definitions),'Original sources preserved');near(scene.volume,1056+160*Math.PI/3,1e-4,'Independent total original volume');near(scene.area,1408+80*Math.PI,1e-4,'Independent total original area');
    for(const occ of document.occurrences){
      const orig=expected.occurrences.find(v=>v.id===occ.id),kind=occ.id.split('-')[0],participates=occ.id.endsWith('-target')&&solved.includes(kind),native=body(scene,occ.id);
      check(native.solidCount===1,'One original native solid '+occ.id);near(norm(occ.pose.rotation),1,1e-10,'Proper unit rotation '+occ.id);
      if(!participates)check(canonical(occ.pose)===canonical(orig.pose),'Fixed or nonparticipating pose preserved exactly '+occ.id);
      else near(occ.pose.translation[0],5,1e-6,'Independent constrained target X '+occ.id);
      vector(native.worldPose.translation,occ.pose.translation,1e-12,'Actual native scene placement');vector(native.worldPose.rotation,occ.pose.rotation,1e-12,'Actual native scene rotation');
      let min,max;
      const solidKind=occ.id.endsWith('-mirror')?'prism':kind==='sphere'?'sphere':kind==='cylinder'?'cylinder':'prism';
      if(solidKind==='prism'){
        const corners=[0,4].flatMap(x=>[0,6].flatMap(y=>[0,4].map(z=>placed(native,[x,y,z]))));
        min=[0,1,2].map(i=>Math.min(...corners.map(p=>p[i])));max=[0,1,2].map(i=>Math.max(...corners.map(p=>p[i])));
        near(native.volume,96,1e-6,'Original prism volume');near(native.area,128,1e-6,'Original prism area');
      }else if(solidKind==='sphere'){
        const center=placed(native,[0,0,0]);min=center.map(v=>v-2);max=center.map(v=>v+2);
        near(native.volume,32*Math.PI/3,1e-6,'Original R2 sphere volume');near(native.area,16*Math.PI,1e-6,'Original R2 sphere area');
      }else{
        const first=placed(native,[0,0,0]),last=placed(native,[0,0,4]),axis=rotate(occ.pose.rotation,[0,0,1]);
        const extent=axis.map(v=>2*Math.sqrt(Math.max(0,1-v*v)));min=first.map((v,i)=>Math.min(v,last[i])-extent[i]);max=first.map((v,i)=>Math.max(v,last[i])+extent[i]);
        near(native.volume,16*Math.PI,1e-6,'Original R2 H4 cylinder volume');near(native.area,24*Math.PI,1e-6,'Original R2 H4 cylinder area');
      }
      vector(native.bounds.min,min,1e-6,'Independent rotated finite-solid bounds min '+occ.id);vector(native.bounds.max,max,1e-6,'Independent rotated finite-solid bounds max '+occ.id);
    }
  }
  function independent(scene,kind,alignment){const a=support(scene,kind+'-source',kind),b=support(scene,kind+'-target',kind),pa=placed(a.body,a.point),pb=placed(b.body,b.point),reflected=[-pa[0],pa[1],pa[2]],delta=sub(pb,reflected);let position=delta,angle=null;
    if(a.direction){const na=rotate(a.body.worldPose.rotation,a.direction),nb=rotate(b.body.worldPose.rotation,b.direction),reflectedN=[-na[0],na[1],na[2]],signed=mul(reflectedN,alignment==='aligned'?1:-1);angle=Math.atan2(norm(cross(signed,nb)),dot(signed,nb));position=kind==='plane'?mul(nb,dot(nb,delta)):sub(delta,mul(nb,dot(nb,delta)));near(angle,0,1e-8,'Independent reflected direction');}
    near(norm(position),0,1e-6,'Independent reflected physical position');if(a.radius!==undefined){near(a.radius,2,1e-9,'Original radius');near(b.radius-a.radius,0,1e-6,'Independent radius equality');}return {positionMm:norm(position),angleRadians:angle,radiusDifferenceMm:a.radius===undefined?null:b.radius-a.radius};
  }
  function nativeReports(value){check(Array.isArray(value.symmetries)&&value.symmetries.length===value.document.mates.length,'Fresh native report per symmetry');for(const r of value.symmetries){check(r.kind==='symmetry'&&r.status==='ok'&&r.satisfied&&r.supportOnly===true,'Admitted fresh native symmetry report');near(r.positionErrorMm,0,1e-6,'Native physical position');if(r.angleRadians!==null)near(r.angleRadians,0,1e-8,'Native physical angle');if(r.radiusDifferenceMm!==null)near(r.radiusDifferenceMm,0,1e-6,'Native radius');check(r.uncertainty.positionMm<=r.lengthTolerance&&(r.uncertainty.angleRad===null||r.uncertainty.angleRad<=r.angleTolerance)&&(r.uncertainty.radiusMm===null||r.uncertainty.radiusMm<=r.lengthTolerance),'Separate uncertainty admission');const m=value.document.mates.find(m=>m.id===r.mateId);check(!!m,'Report saved mate identity');independent(value.scene,m.entityKind,m.alignment);}}
  function ready(event,solved){const v=event.response.value;check(v.status==='ready'&&v.hasToken,'Actual authenticated preview');check(v.checks.length===v.document.mates.length&&v.checks.every(c=>c.satisfied),'Actual numerical checks');nativeReports(v);geometry(v.scene,v.document,solved);return v;}
  async function reportUi(){await idle('symmetry report idle');await waitFor('physical symmetry report and locked controls',()=>page((summary,rolesJson)=>{const el=document.querySelector(summary),text=el?.textContent??'';return text.includes('tres soportes')&&text.includes('posición')&&text.includes('incertidumbre')&&text.includes('Soportes infinitos')&&JSON.parse(rolesJson).every(role=>document.querySelector('select[aria-label="'+role+'"]')?.disabled===true);},SUMMARY,JSON.stringify(roles)));}
  async function chooseReference(index,reference){const selector='select[aria-label="'+roles[index]+'"]';if(index===2){await control(selector,'datum:'+JSON.stringify(reference.component.occurrencePath)+':YZ');return;}
    const options=await page(selector=>[...document.querySelector(selector).options].map(o=>({value:o.value,disabled:o.disabled})),selector);const found=options.filter(o=>{if(!o.value||o.disabled||o.value==='retained')return false;try{return canonical(JSON.parse(o.value))===canonical(reference);}catch{return false;}});check(found.length===1,'Exact current native dropdown reference '+roles[index]);await control(selector,found[0].value);
  }
  async function cancel(document){await click(CANCEL);await recovery(document,'Cancel preserves exact commit');check(await page(apply=>document.querySelector(apply)?.disabled===true,APPLY),'Cancelled capability cannot Apply');}
  return async()=>{
    const originalBytes=await fsp.readFile(input);check(expected.id==='assembly-symmetry-original'&&expected.mates.length===0&&expected.occurrences.length===15,'Tracked original five-family fixture');evidence.fixtureSha256=digest(originalBytes);
    await waitFor('initial production readiness',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('initial discard confirmation',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');let event=await responseAfter(before.serial,'build-assembly'),committed={document:event.document,scene:event.response.value};check(canonical(committed.document)===canonical(expected),'Exact original fixture opened');geometry(committed.scene,committed.document,[]);await recovery(committed.document,'initial fixture');
    const solved=[];
    for(const [index,kind] of families.entries()){
      const baseline=committed.document,refs=refsFor(committed.scene,kind),name='Simetría original '+kind,record={kind,refs,phases:[]};evidence.cases.push(record);
      await control(TYPE,'symmetry');await control(FAMILY,kind);for(let i=0;i<3;i++)await chooseReference(i,refs[i]);if(kind!=='point'&&kind!=='sphere')await control(ALIGN,kind==='plane'?'opposed':'aligned');await control(NAME,name);
      before=await observe();await button('Vista previa de simetría');event=await responseAfter(before.serial,'preview-assembly');const v=ready(event,[...solved,kind]),mate=intent(v.document,kind,refs,null,name);await reportUi();check(canonical(event.current)===canonical(baseline),'Actual author uses committed baseline');record.phases.push({phase:'author-ready',serial:event.serial,value:v});
      before=await observe();await click(APPLY);event=await responseAfter(before.serial,'apply-assembly');check(event.hasToken&&event.response.value.kind==='assembly-applied','Actual Apply capability');committed={document:event.response.value.document,scene:event.response.value.scene};solved.push(kind);intent(committed.document,kind,refs,mate.id,name);geometry(committed.scene,committed.document,solved);await recovery(committed.document,'applied '+kind);const accepted=committed.document;
      for(const [action,wanted,which] of [['Deshacer',baseline,solved.slice(0,-1)],['Rehacer',accepted,solved]]){before=await observe();await click('button[aria-label="'+action+' ensamblaje"]');event=await responseAfter(before.serial,'build-assembly');check(canonical(event.document)===canonical(wanted),'Exact '+action+' '+kind);geometry(event.response.value,event.document,which);await recovery(event.document,action+' '+kind);committed={document:event.document,scene:event.response.value};}
      await click('button[aria-label="Editar simetría '+name+'"]');await control('select[aria-label="'+roles[0]+'"]','');check(await page(()=>[...document.querySelectorAll('.assembly-symmetry-panel button')].find(b=>b.textContent.trim()==='Vista previa de la edición de simetría')?.disabled===true),'Missing role blocks edit');await chooseReference(0,refs[0]);await chooseReference(2,refs[2]);await control(NAME,name+' editada');
      if(kind!=='point'&&kind!=='sphere'){const changed=kind==='plane'?'aligned':'opposed';await control(ALIGN,changed);before=await observe();await button('Vista previa de la edición de simetría');event=await responseAfter(before.serial,'preview-assembly');const reply=event.response.value;check(reply.status==='ready'||reply.status==='rejected','Explicit branch edit has defined actual outcome');if(reply.status==='ready'){check(reply.hasToken,'Ready branch capability');nativeReports(reply);await cancel(accepted);}else{check(!reply.hasToken,'Rejected branch has no capability');await recovery(accepted,'rejected branch preserves commit');}record.phases.push({phase:'branch-edit-unapplied',serial:event.serial,value:reply});await control(ALIGN,kind==='plane'?'opposed':'aligned');}
      before=await observe();await button('Vista previa de la edición de simetría');event=await responseAfter(before.serial,'preview-assembly');ready(event,solved);check(event.proposed.mates.find(m=>m.id===mate.id)?.name===name+' editada','Actual name edit proposal');await reportUi();await cancel(accepted);await button('Cancelar edición de simetría');
      // Keep the original Save predicate. Retain only its last existing read,
      // bounded for diagnostics; neither the cap nor graph.sample accepts a Save.
      const savedGraph=saveObservation.graph(accepted);record.saveObservation=savedGraph.record;
      let lastSaveRaw=null,lastSaveReadError=null,saveReadCount=0,saveReadStatus='not-read';
      try {
        await button('Guardar como',':is(.assembly-toolbar, .assembly-quickbar)');
        await waitFor('Save As exact '+kind,async()=>{
          if(dialogCounts().saves!==index+1||!ipc.some(v=>v.channel==='document:save'&&v.completed))return false;
          try {
            saveReadCount++;lastSaveRaw=null;lastSaveReadError=null;saveReadStatus='pending';
            const raw=await fsp.readFile(output,'utf8');lastSaveReadError=null;
            const withinDiagnosticLimit=Buffer.byteLength(raw,'utf8')<=4*1024*1024;
            lastSaveRaw=withinDiagnosticLimit?raw:null;saveReadStatus=withinDiagnosticLimit?'read':'diagnostic-limit';
            return canonical(JSON.parse(raw))===canonical(accepted);
          } catch(error) { if(saveReadStatus==='pending'){lastSaveReadError=error;saveReadStatus='read-error';}return false; }
        });
      } finally {
        savedGraph.record.readCount=saveReadCount;savedGraph.record.lastReadStatus=saveReadStatus;
        // sample's count===1 return belongs to another route. Ignore it here;
        // this evidence must never change the original predicate or exception.
        try {
          if(lastSaveRaw!==null)savedGraph.sample(lastSaveRaw,ipc.filter(v=>v.channel==='document:save'&&v.completed&&v.documentWrite?.chosen&&v.documentWrite.ordinal===index+1).length);
          else if(lastSaveReadError)savedGraph.failed(lastSaveReadError);
        } catch(error) { savedGraph.failed(error); }
      }
      const savedBytes=await fsp.readFile(output);record.savedSha256=digest(savedBytes);
      before=await observe();await button('Abrir',':is(.assembly-toolbar, .assembly-quickbar)');event=await responseAfter(before.serial,'build-assembly');check(canonical(event.document)===canonical(accepted),'Exact saved three-role '+kind+' reopened');intent(event.document,kind,refs,mate.id,name);geometry(event.response.value,event.document,solved);committed={document:event.document,scene:event.response.value};await recovery(committed.document,'reopened '+kind);
      before=await observe();await click('button[aria-label="Resolver ensamblaje"]');event=await responseAfter(before.serial,'preview-assembly');ready(event,solved);await reportUi();record.phases.push({phase:'reopened-fresh-native-verification',serial:event.serial,value:event.response.value});await cancel(committed.document);
      check(digest(await fsp.readFile(input))===digest(originalBytes)&&digest(await fsp.readFile(output))===digest(savedBytes),'Original and saved bytes preserved for '+kind);
    }
    if(process.env.SOLIDFLOW_UI_CAPTURE==='1'){await control(TYPE,'symmetry');await click('button[aria-label="Editar simetría Simetría original cylinder"]');await page(()=>document.querySelector('.assembly-symmetry-panel')?.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'}));await capture(committed.document);}
    check(dialogCounts().opens===6&&dialogCounts().saves===5,'Exact test-owned five Save As/reopen pairs');check(!consoleErrors.length&&!failedRequests.length,'Production renderer errors');check(protocolResponses.every(v=>v.status>=200&&v.status<400),'Production asset request failure');Object.assign(evidence,{finalDocument:committed.document,limits:'Five original analytic families with fixed source/mirror and one initially offset free target per row. Three real dropdown selections, actual worker/Apply, exact history, edit/reselect/name/branch preview cancellation, five test-owned Save As/reopen pairs and fresh native report. No viewport vertex-click, arbitrary eligibility, vendor equivalence, manual dialog or platform claim.'});
  };
};
