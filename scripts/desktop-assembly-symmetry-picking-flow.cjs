"use strict";
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Original native display references; actual CDP pointer events choose all roles.
// Literal camera projection and independent reflection/material bounds below.
module.exports = function symmetryPickingWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const {expected,input,output,evaluate,observe,waitFor,click,capture,pointer,checks,ipc,check,canonical,digest,initialReadyMs,dialogCounts,consoleErrors,failedRequests,protocolResponses}=context;
  const families=['point','line','plane','sphere','cylinder','axisline'];
  const TYPE='select[aria-label="Tipo de relación"]', FAMILY='select[aria-label="Familia de simetría"]', NAME='input[aria-label="Nombre de simetría"]', ALIGN='select[aria-label="Orientación de simetría"]';
  const roles=['Origen de simetría','Destino de simetría','Plano de simetría'], APPLY='button[aria-label="Aplicar ensamblaje"]', CANCEL='button[aria-label="Cancelar vista previa del ensamblaje"]', SUMMARY='[aria-label="Simetría verificada"]';
  const evidence={scenario:'original-six-case-native-symmetry-pointer',cases:[]};checks.push(evidence);
  evidence.pointerHits=[];
  evidence.pointerAttempts=[];
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
    if(kind==='point'){candidates=(b.vertexPoints??[]).filter(v=>norm(sub(v.point,[4,0,4]))<=1e-12);check(candidates.length===1,'Unique actual material corner '+id);return {reference:{kind:'vertex',...candidates[0].selection,support:'point'},point:candidates[0].point,body:b};}
    if(kind==='line'){candidates=(b.edges??[]).filter(v=>v.support?.kind==='line'&&Math.abs(v.support.point[0]-4)<1e-12&&Math.abs(v.support.point[1])<1e-12&&Math.abs(v.support.axis[2])>.999);check(candidates.length===1,'Unique actual corner-Z LINE '+id);const v=candidates[0];return {reference:{kind:'edge',...v.selection,support:'line'},point:v.support.point,direction:v.support.axis,body:b};}
    candidates=b.faces.filter(v=>kind==='plane'?v.support?.kind==='plane'&&v.support.normal[0]>.999&&Math.abs(v.support.point[0]-4)<1e-12:kind==='sphere'?v.sphereSurface?.kind==='sphere-surface':v.support?.kind==='cylinder');check(candidates.length===1,'Exact actual '+kind+' surface '+id);const v=candidates[0],s=kind==='sphere'?v.sphereSurface:v.support;
    if(kind==='sphere')return {reference:{kind:'face',...v.selection,support:'sphere-surface'},point:s.center,radius:s.radius,body:b};
    return {reference:{kind:'face',...v.selection,support:kind==='plane'?'plane':kind==='axisline'?'axis':'cylinder-surface'},point:s.point,direction:kind==='plane'?s.normal:s.axis,...(kind==='cylinder'?{radius:s.radius}:{}),body:b};
  }
  function refsFor(scene,kind){const a=support(scene,kind+'-source',kind),b=support(scene,kind+'-target',kind),m=support(scene,kind+'-mirror','plane');return [a.reference,b.reference,m.reference];}
  function intent(document,kind,refs,id,name){const m=document.mates.find(v=>v.name===name);check(m?.type==='symmetry'&&m.entityKind===(kind==='axisline'?'line':kind)&&m.suppressed===false&&!('first'in m)&&!('second'in m),'Three-role saved '+kind+' intent');if(id)check(m.id===id,'Stable symmetry ID');check(canonical([m.source,m.target,m.mirror])===canonical(refs),'Exact ordered three references');check(m.alignment===(kind==='point'||kind==='sphere'?null:kind==='plane'?'opposed':'aligned'),'Explicit original branch');return m;}
  // A reflected support does not lock the complete rigid-body pose. Point and
  // sphere leave orientation free; directional supports retain their physical
  // gauge freedoms too. Check fixed/nonparticipating poses exactly, and use
  // the actual proper rotation for independent finite-solid bounds below.
  function geometry(scene,document,solved){check(scene.kind==='assembly-scene'&&scene.solidCount===18&&scene.bodies.length===18&&scene.prototypeCount===3&&!scene.warnings.length,'Original eighteen solids/three prototypes');check(canonical(document.definitions)===canonical(expected.definitions),'Original sources preserved');near(scene.volume,1152+256*Math.PI/3,1e-4,'Independent total original volume');near(scene.area,1536+128*Math.PI,1e-4,'Independent total original area');
    for(const occ of document.occurrences){
      const orig=expected.occurrences.find(v=>v.id===occ.id),kind=occ.id.split('-')[0],participates=occ.id.endsWith('-target')&&solved.includes(kind),native=body(scene,occ.id);
      check(native.solidCount===1,'One original native solid '+occ.id);near(norm(occ.pose.rotation),1,1e-10,'Proper unit rotation '+occ.id);
      if(!participates)check(canonical(occ.pose)===canonical(orig.pose),'Fixed or nonparticipating pose preserved exactly '+occ.id);

      vector(native.worldPose.translation,occ.pose.translation,1e-12,'Actual native scene placement');vector(native.worldPose.rotation,occ.pose.rotation,1e-12,'Actual native scene rotation');
      let min,max;
      const solidKind=occ.id.endsWith('-mirror')?'prism':kind==='sphere'?'sphere':kind==='cylinder'||kind==='axisline'?'cylinder':'prism';
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
  function independent(scene,kind,alignment){const a=support(scene,kind+'-source',kind),b=support(scene,kind+'-target',kind),pa=placed(a.body,a.point),pb=placed(b.body,b.point),reflected=[8-pa[0],pa[1],pa[2]],delta=sub(pb,reflected);let position=delta,angle=null;
    if(a.direction){const na=rotate(a.body.worldPose.rotation,a.direction),nb=rotate(b.body.worldPose.rotation,b.direction),reflectedN=[-na[0],na[1],na[2]],signed=mul(reflectedN,alignment==='aligned'?1:-1);angle=Math.atan2(norm(cross(signed,nb)),dot(signed,nb));position=kind==='plane'?mul(nb,dot(nb,delta)):sub(delta,mul(nb,dot(nb,delta)));near(angle,0,1e-8,'Independent reflected direction');}
    near(norm(position),0,1e-6,'Independent reflected physical position');if(a.radius!==undefined){near(a.radius,2,1e-9,'Original radius');near(b.radius-a.radius,0,1e-6,'Independent radius equality');}return {positionMm:norm(position),angleRadians:angle,radiusDifferenceMm:a.radius===undefined?null:b.radius-a.radius};
  }
  function nativeReports(value){check(Array.isArray(value.symmetries)&&value.symmetries.length===value.document.mates.length,'Fresh native report per symmetry');for(const r of value.symmetries){check(r.kind==='symmetry'&&r.status==='ok'&&r.satisfied&&r.supportOnly===true,'Admitted fresh native symmetry report');near(r.positionErrorMm,0,1e-6,'Native physical position');if(r.angleRadians!==null)near(r.angleRadians,0,1e-8,'Native physical angle');if(r.radiusDifferenceMm!==null)near(r.radiusDifferenceMm,0,1e-6,'Native radius');check(r.uncertainty.positionMm<=r.lengthTolerance&&(r.uncertainty.angleRad===null||r.uncertainty.angleRad<=r.angleTolerance)&&(r.uncertainty.radiusMm===null||r.uncertainty.radiusMm<=r.lengthTolerance),'Separate uncertainty admission');const m=value.document.mates.find(m=>m.id===r.mateId);check(!!m,'Report saved mate identity');independent(value.scene,m.source.component.occurrencePath[0].replace(/-source$/,''),m.alignment);}}
  function ready(event,solved){const v=event.response.value;check(v.status==='ready'&&v.hasToken,'Actual authenticated preview');check(v.checks.length===v.document.mates.length&&v.checks.every(c=>c.satisfied),'Actual numerical checks');nativeReports(v);geometry(v.scene,v.document,solved);return v;}
  async function frames(count){await page(raw=>new Promise((resolve,reject)=>{let n=Number(raw),frame;const timer=setTimeout(()=>{cancelAnimationFrame(frame);reject(Error('Viewport frame wait exceeded35second step budget'));},35000);const next=()=>{if(--n<=0){clearTimeout(timer);resolve()}else frame=requestAnimationFrame(next)};frame=requestAnimationFrame(next)}),String(count));}
  const viewportLayout=()=>page(()=>{
    const host=document.querySelector('[aria-label="Visor 3D del ensamblaje"]'),canvas=host?.querySelector('canvas');
    if(!host||!canvas)throw Error('Actual symmetry viewport absent');
    const rectOf=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
    return {rect:rectOf(canvas),hostRect:rectOf(host),width:host.clientWidth,height:host.clientHeight};
  });
  async function stableViewport(){
    let previous=null,stableSince=0;
    return waitFor('stationary actual symmetry viewport',async()=>{
      const layout=await viewportLayout(),key=JSON.stringify(layout);
      if(key!==previous){previous=key;stableSince=Date.now();return false;}
      const r=layout.rect,h=layout.hostRect;
      return layout.width>0&&layout.height>0&&Math.abs(r.width-layout.width)<1&&Math.abs(r.height-layout.height)<1
        &&Math.abs(r.x-h.x)<1&&Math.abs(r.y-h.y)<1&&Date.now()-stableSince>=120?layout:false;
    });
  }
  function picker(kind,index){return 'button[aria-label="Seleccionar '+roles[index]+(index<2&&(kind==='line'||kind==='axisline')?(kind==='line'?' como arista lineal':' como eje cilíndrico'):'')+' en el modelo"]';}
  async function pickRole(base,kind,index,ref,reselect){
    const startedMs=Date.now();
    const selector=picker(kind,index),mode=index===2?'face':kind==='point'?'vertex':kind==='line'?'edge':'face';
    await button('Isométrica','.assembly-view-tools');await frames(2);
    const viewReadyMs=Date.now();
    if(!await page(s=>document.querySelector(s)?.getAttribute('aria-pressed')==='true',selector))await click(selector);
    await waitFor('armed '+kind+' '+roles[index],()=>page((s,m)=>document.querySelector(s)?.getAttribute('aria-pressed')==='true'&&document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')===m,selector,mode));
    check(await page(()=>document.querySelector('button[aria-label="Arrastrar posición"]')?.getAttribute('aria-pressed')==='false'&&document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed')==='false'),'Role picking turns component drag off');
    const id=kind+'-'+['source','target','mirror'][index],occ=base.document.occurrences.find(o=>o.id===id);
    check(canonical(occ.pose.rotation)===canonical([0,0,0,1]),'Literal pointer owner has initial proper identity rotation');
    // Same native supports, sampled on their visible portions from +X/+Y/+Z.
    // The +X plane's upper-Y interior and the corner-Z edge above Z=3
    // clear the adjacent mirror prism; the material vertex remains exact.
    const local=index===2||kind==='plane'?[4,5.4,2]:kind==='point'?[4,0,4]:kind==='line'?[4,0,3.5]:kind==='sphere'?[2/Math.sqrt(3),2/Math.sqrt(3),2/Math.sqrt(3)]:[2/Math.sqrt(2),2/Math.sqrt(2),2];
    // Manager tabs change the host width before ResizeObserver updates the
    // renderer's canvas. Project only after both describe the same stable area.
    const layout=await stableViewport(),rect=layout.rect,bounds=base.scene.visibleBounds;
    const center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),span=Math.max(1,Math.hypot(...bounds.max.map((v,i)=>v-bounds.min[i]))),pixels=rect.height/(1.3*span),worldPoint=local.map((v,i)=>v+occ.pose.translation[i]),r=worldPoint.map((v,i)=>v-center[i]);
    // Independent orthonormal basis for eye (1,1,1) with world +Y up.
    const point={x:rect.x+rect.width/2+(r[0]-r[2])/Math.sqrt(2)*pixels,y:rect.y+rect.height/2-(-r[0]+2*r[1]-r[2])/Math.sqrt(6)*pixels};
    check(point.x>rect.x&&point.x<rect.x+rect.width&&point.y>rect.y&&point.y<rect.y+rect.height,'Literal native support point inside actual canvas');
    const roleSelector='select[aria-label="'+roles[index]+'"]',options=await page(s=>[...document.querySelector(s).options].map(o=>({value:o.value,disabled:o.disabled})),roleSelector);
    const faceKey=index===2?JSON.stringify([JSON.stringify([ref.component.occurrencePath,ref.component.definition.id,ref.component.definition.revision]),ref.body?[ref.body.bodyId,ref.body.sourceFeatureId]:null,ref.face.sourceFeatureId,ref.face.key]):null;
    const matching=options.filter(o=>{if(o.disabled)return false;if(index===2)return o.value===faceKey;try{return canonical(JSON.parse(o.value))===canonical(ref)}catch{return false}});check(matching.length===1,'Exact actual native option for pointer intent');
    // Only the serial is compared across a display-only pick. Keep the complete
    // native history for response/geometry checks without copying it per pointer.
    const previous=await page(rs=>JSON.parse(rs).map(role=>document.querySelector('select[aria-label="'+role+'"]')?.value),JSON.stringify(roles)),stored=await page(()=>localStorage.getItem('solidflow.autosave')),before=await observe.counters();
    await pointer('mouseMoved',point);
    check(canonical(await viewportLayout())===canonical(layout),'Symmetry viewport remains stationary immediately before press');
    await pointer('mousePressed',point,1);
    check(canonical(await viewportLayout())===canonical(layout),'Symmetry viewport remains stationary while pressed');
    await pointer('mouseReleased',point);
    const attempt=await page((s,picker,pointJson)=>{
      const el=document.querySelector(s),host=document.querySelector('[aria-label="Visor 3D del ensamblaje"]'),canvas=host?.querySelector('canvas'),point=JSON.parse(pointJson),hit=document.elementFromPoint(point.x,point.y);
      const rectOf=element=>{const r=element?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};
      return {actualSelectValue:el?.value??null,selectedText:el?.selectedOptions?.[0]?.textContent??null,armedButtonState:document.querySelector(picker)?.getAttribute('aria-pressed')??null,viewportPickMode:host?.getAttribute('data-reference-picking')??null,statusbarText:document.querySelector('.assembly-status')?.textContent??null,
        afterRelease:{canvasRect:rectOf(canvas),hostRect:rectOf(host),hostSize:host?{width:host.clientWidth,height:host.clientHeight}:null,canvasSize:canvas?{width:canvas.clientWidth,height:canvas.clientHeight,bufferWidth:canvas.width,bufferHeight:canvas.height}:null,cursor:canvas?getComputedStyle(canvas).cursor:null,hit:hit?{tag:hit.tagName,id:hit.id,className:hit.getAttribute('class'),ariaLabel:hit.getAttribute('aria-label'),isCanvas:hit===canvas}:null}};
    },roleSelector,selector,JSON.stringify(point));
    evidence.pointerAttempts.push({kind,index,reselect,viewBarrierElapsedMs:viewReadyMs-startedMs,elapsedBeforeWaitMs:Date.now()-startedMs,expectedOptionKey:matching[0].value,worldPoint,point,rect,sceneCenter:center,sceneSpan:span,pixelsPerMm:pixels,...attempt});
    await waitFor('actual native pointer '+kind+' '+roles[index],()=>page((s,v)=>document.querySelector(s)?.value===v,roleSelector,matching[0].value));
    await waitFor('completed native armed role '+kind+' '+roles[index],()=>page(s=>document.querySelector(s)?.getAttribute('aria-pressed')==='false',selector));
    const after=await page(rs=>JSON.parse(rs).map(role=>document.querySelector('select[aria-label="'+role+'"]')?.value),JSON.stringify(roles));for(let slot=0;slot<3;slot++)if(slot!==index)check(after[slot]===previous[slot],'Pointer preserves other symmetry roles');
    if(reselect)check(after[index]===previous[index],'Same-source pointer reselect preserves exact current identity');
    check((await observe.counters()).serial===before.serial,'Display pointer selection performs no CAD operation');check(await page(()=>localStorage.getItem('solidflow.autosave'))===stored,'Pointer intent preserves committed recovery');
    evidence.pointerHits.push({kind,index,role:roles[index],mode,reselect,owner:id,viewBarrierElapsedMs:viewReadyMs-startedMs,totalElapsedMs:Date.now()-startedMs,worldPoint,point,rect,sceneCenter:center,sceneSpan:span,pixelsPerMm:pixels,reference:ref});
  }
  async function reportUi(){await idle('symmetry report idle');await waitFor('physical symmetry report and locked controls',()=>page((summary,rolesJson)=>{const el=document.querySelector(summary),text=el?.textContent??'';return text.includes('tres soportes')&&text.includes('posición')&&text.includes('incertidumbre')&&text.includes('Soportes infinitos')&&JSON.parse(rolesJson).every(role=>document.querySelector('select[aria-label="'+role+'"]')?.disabled===true);},SUMMARY,JSON.stringify(roles)));}
  async function cancel(document){await click(CANCEL);await recovery(document,'Cancel preserves exact commit');check(await page(apply=>document.querySelector(apply)?.disabled===true,APPLY),'Cancelled capability cannot Apply');}
  return async()=>{
    const originalBytes=await fsp.readFile(input);check(expected.id==='assembly-symmetry-picking-original'&&expected.mates.length===0&&expected.occurrences.length===18,'Tracked original six-case fixture');evidence.fixtureSha256=digest(originalBytes);
    await waitFor('initial production readiness',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('initial discard confirmation',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');let event=await responseAfter(before.serial,'build-assembly'),committed={document:event.document,scene:event.response.value};check(canonical(committed.document)===canonical(expected),'Exact original fixture opened');geometry(committed.scene,committed.document,[]);await recovery(committed.document,'initial fixture');
    const solved=[];
    for(const [index,kind] of families.entries()){
      const baseline=committed.document,refs=refsFor(committed.scene,kind),name='Simetría seleccionada '+kind,record={kind,refs,phases:[]};evidence.cases.push(record);
      await control(TYPE,'symmetry');await control(FAMILY,kind==='axisline'?'line':kind);
      if(index===0){
        await click(picker(kind,0));await click('button[aria-label="Cancelar selección de simetría"]');
        check(await page(()=>document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')===''),'Explicit role Cancel clears picking intent');
        const targetName=expected.occurrences.find(o=>o.id==='point-target').name;
        (await assemblyNavigation.panel('components'), await page(name=>{const rows=[...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(r=>r.querySelector('span')?.firstChild?.textContent===name);if(rows.length!==1)throw Error('Exact free target row absent');rows[0].click()},targetName));
        await idle('selected free target');await click('button[aria-label="Arrastrar posición"]');
        check(await page(()=>document.querySelector('button[aria-label="Arrastrar posición"]')?.getAttribute('aria-pressed')==='true'),'Actual component drag mode active before role arming');
      }
      for(let i=0;i<3;i++)await pickRole(committed,kind,i,refs[i],false);if(kind!=='point'&&kind!=='sphere')await control(ALIGN,kind==='plane'?'opposed':'aligned');await control(NAME,name);
      before=await observe();await button('Vista previa de simetría');event=await responseAfter(before.serial,'preview-assembly');const v=ready(event,[...solved,kind]),mate=intent(v.document,kind,refs,null,name);await reportUi();check(canonical(event.current)===canonical(baseline),'Actual author uses committed baseline');record.phases.push({phase:'author-ready',serial:event.serial,value:v});
      before=await observe();await click(APPLY);event=await responseAfter(before.serial,'apply-assembly');check(event.hasToken&&event.response.value.kind==='assembly-applied','Actual Apply capability');committed={document:event.response.value.document,scene:event.response.value.scene};solved.push(kind);intent(committed.document,kind,refs,mate.id,name);geometry(committed.scene,committed.document,solved);await recovery(committed.document,'applied '+kind);const accepted=committed.document;
      for(const [action,wanted,which] of [['Deshacer',baseline,solved.slice(0,-1)],['Rehacer',accepted,solved]]){before=await observe();await click('button[aria-label="'+action+' ensamblaje"]');event=await responseAfter(before.serial,'build-assembly');check(canonical(event.document)===canonical(wanted),'Exact '+action+' '+kind);geometry(event.response.value,event.document,which);await recovery(event.document,action+' '+kind);committed={document:event.document,scene:event.response.value};}
      await click('button[aria-label="Editar simetría '+name+'"]');await pickRole(committed,kind,0,refs[0],true);await control(NAME,name+' editada');
      before=await observe();await button('Vista previa de la edición de simetría');event=await responseAfter(before.serial,'preview-assembly');ready(event,solved);check(event.proposed.mates.find(m=>m.id===mate.id)?.name===name+' editada','Actual name edit proposal');await reportUi();await cancel(accepted);await button('Cancelar edición de simetría');
      await button('Guardar como',':is(.assembly-toolbar, .assembly-quickbar)');await waitFor('Save As exact '+kind,async()=>{if(dialogCounts().saves!==index+1||!ipc.some(v=>v.channel==='document:save'&&v.completed))return false;try{return canonical(JSON.parse(await fsp.readFile(output,'utf8')))===canonical(accepted);}catch{return false;}});const savedBytes=await fsp.readFile(output);record.savedSha256=digest(savedBytes);
      before=await observe();await button('Abrir',':is(.assembly-toolbar, .assembly-quickbar)');event=await responseAfter(before.serial,'build-assembly');check(canonical(event.document)===canonical(accepted),'Exact saved three-role '+kind+' reopened');intent(event.document,kind,refs,mate.id,name);geometry(event.response.value,event.document,solved);committed={document:event.document,scene:event.response.value};await recovery(committed.document,'reopened '+kind);
      before=await observe();await click('button[aria-label="Resolver ensamblaje"]');event=await responseAfter(before.serial,'preview-assembly');ready(event,solved);await reportUi();record.phases.push({phase:'reopened-fresh-native-verification',serial:event.serial,value:event.response.value});await cancel(committed.document);
      check(digest(await fsp.readFile(input))===digest(originalBytes)&&digest(await fsp.readFile(output))===digest(savedBytes),'Original and saved bytes preserved for '+kind);
    }
    if(process.env.SOLIDFLOW_UI_CAPTURE==='1'){await control(TYPE,'symmetry');await click('button[aria-label="Editar simetría Simetría seleccionada cylinder"]');await page(()=>document.querySelector('.assembly-symmetry-panel')?.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'}));await capture(committed.document);}
    check(evidence.pointerHits.length===24&&evidence.pointerHits.filter(v=>v.reselect).length===6,'Eighteen actual author hits and six same-source edit hits');
    check(dialogCounts().opens===7&&dialogCounts().saves===6,'Exact test-owned six Save As/reopen pairs');check(!consoleErrors.length&&!failedRequests.length,'Production renderer errors');check(protocolResponses.every(v=>v.status>=200&&v.status<400),'Production asset request failure');Object.assign(evidence,{finalDocument:committed.document,limits:'Six original cases: all five analytic families plus explicit cylinder-face line-axis purpose. Eighteen actual author role picks and six same-source edit reselects, native mirror plane, actual worker/Apply/history, six Save As/reopen pairs and fresh native verification. No arbitrary visibility, nested/suppressed picking, general datum naming, complete free-pose, human-dialog, vendor or platform claim.'});
  };
};
