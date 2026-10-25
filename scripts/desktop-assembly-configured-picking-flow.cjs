'use strict';
const fs=require('node:fs/promises');
const {encodeJavaScriptString:quote}=require('./desktop-ui-source.cjs');
module.exports=function configuredPicking(c){
 const {expected,input,output,evaluate,observe,waitFor,click,pointer,menuKey,asideWheel,capture,checks,check,canonical,digest,ipc,dialogCounts,consoleErrors,failedRequests,initialReadyMs}=c;
 const ROOT='.configured-assembly-workspace',NAV=':is([aria-label="Archivo del ensamblaje configurado"],[aria-label="Comandos del ensamblaje configurado"])',FORM='[aria-label="Editar relación del estado"]',ACTION='preview-configured-assembly-relation-edit',gestures=[],phases=[];
 const page=(fn,...args)=>evaluate('('+fn.toString()+')('+args.map(v=>'JSON.parse('+quote(JSON.stringify(v))+')').join(',')+')');
 const navigation=require('./desktop-configured-navigation.cjs')({page,waitFor,actualControl});
 const ribbon=require('./desktop-assembly-ribbon-controls.cjs')({configured:true,page,waitFor,actualControl,menuKey,observe,check,canonical,gestures});
 const near=(a,b,t,label)=>check(Number.isFinite(a)&&Math.abs(a-b)<=t,label+': '+a+' expected '+b);
 async function button(text,parent=ROOT){ await navigation.reveal(parent+' button',text); await page((text,parent)=>{const a=[...document.querySelectorAll(parent+' button')].filter(b=>b.textContent.trim()===text);if(a.length!==1||a[0].disabled)throw Error('One enabled button required: '+text);a[0].click();},text,parent);}
 async function actualControl(selector,text=null,allowAsideWheel=false){
  await navigation.reveal(selector,text??'');
  const inspect=()=>page((selector,text)=>{
   const matches=[...document.querySelectorAll(selector)].filter(e=>text===null||e.textContent.trim()===text);
   if(matches.length!==1||matches[0].disabled)throw Error('One enabled actual control required: '+selector);
   const e=matches[0],r=e.getBoundingClientRect(),aside=e.closest('[aria-label="Inspector del ensamblaje configurado"]'),container=aside??e.closest('nav'),a=container?.getBoundingClientRect();
   const top=Math.max(0,a?a.top+container.clientTop:0),bottom=Math.min(innerHeight,a?a.top+container.clientTop+container.clientHeight:innerHeight);
   const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
   return {point:{x,y},visible:r.width>0&&r.height>0&&r.left>=Math.max(0,a?.left??0)&&r.right<=Math.min(innerWidth,a?.right??innerWidth)&&r.top>=top&&r.bottom<=bottom&&!!hit&&(hit===e||e.contains(hit)),
    aside:!!aside,scrollTop:aside?.scrollTop??0,delta:r.top<top?-200:200,wheelPoint:aside?{x:a.left+Math.min(100,a.width/2),y:(top+bottom)/2}:null,rect:{top:r.top,bottom:r.bottom},clip:{top,bottom}};
  },selector,text);
  // CDP wheel dispatch resolves before compositor scrolling finishes. Requiring
  // a quiet target prevents a later wheel frame from moving it after hit testing.
  // This observes real layout only; it never writes scrollTop or retries a click.
  const stationary=async()=>{
   let previous=null,stableSince=0;
   return waitFor('stationary actual inspector target',async()=>{
    const next=await inspect(),key=JSON.stringify({point:next.point,scrollTop:next.scrollTop,rect:next.rect,visible:next.visible});
    if(key!==previous){previous=key;stableSince=Date.now();return false;}
    return Date.now()-stableSince>=120?next:false;
   });
  };
  let state=await stationary();
  for(let step=0;!state.visible&&allowAsideWheel&&state.aside&&step<24;step++){
   check(typeof asideWheel==='function','Bounded actual inspector wheel required');const old=state.scrollTop;
   await asideWheel(state.wheelPoint,state.delta);await waitFor('actual inspector wheel movement',async()=>{const next=await inspect();return next.scrollTop!==old||next.visible;});state=await stationary();
  }
  check(state.visible,'Control is physically visible and unobscured: '+JSON.stringify({selector,text,...state}));
  await pointer('mouseMoved',state.point);
  const hit=await inspect();
  check(hit.visible&&hit.scrollTop===state.scrollTop&&hit.point.x===state.point.x&&hit.point.y===state.point.y,'Actual pointer target remains unchanged immediately before press: '+JSON.stringify({selector,text,before:state,after:hit}));
  await pointer('mousePressed',state.point,1);await pointer('mouseReleased',state.point,0);
  gestures.push({kind:'control',selector,text,point:state.point,asideScrollTop:state.scrollTop});
 }
 async function revealedInspector(mode){
  if(mode!=='create'&&mode!=='edit')throw Error('Explicit inspector creation or editing mode required');
  const expectedField=mode==='create'?'Tipo de relación configurada':'Referencia 1 de relación configurada';
  let result,last=null;
  try{
   result=await waitFor('application-owned inspector reveal and focus',async()=>{
    last=await page((expectedField,editing)=>{
     const aside=document.querySelector('[aria-label="Inspector del ensamblaje configurado"]'),form=document.querySelector('#configured-relation-inspector'),pane=form?.closest('[data-configured-pane="relation"]'),field=form?.querySelector('[aria-label="'+expectedField+'"]'),heading=pane?.querySelector('#configured-property-heading'),type=form?.querySelector('[aria-label="Tipo de relación configurada"]');
     const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
     const a=rect(aside),r=rect(field),h=rect(heading),hit=r?document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2):null;
     const identity=element=>element?{tag:element.tagName,label:element.getAttribute('aria-label'),id:element.id}:null;
     const visible=b=>!!b&&!!a&&b.width>0&&b.height>0&&b.top>=Math.max(0,a.top+aside.clientTop)&&b.bottom<=Math.min(innerHeight,a.top+aside.clientTop+aside.clientHeight)&&b.left>=a.left&&b.right<=a.right;
     const paneHeadings=[...pane?.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')??[]];
     const uniqueLevelTwoHeading=paneHeadings.length===1&&paneHeadings[0]===heading&&heading?.id==='configured-property-heading'&&heading.getAttribute('role')==='heading'&&heading.getAttribute('aria-level')==='2';
     const origins=form?.querySelector('details[aria-label="Referencias de origen configuradas"]');
     const reference1=form?.querySelector('[aria-label="Referencia 1 de relación configurada"]'),reference2=form?.querySelector('[aria-label="Referencia 2 de relación configurada"]'),parameter=form?.querySelector('[aria-label="Distancia de relación configurada en mm"]'),name=form?.querySelector('[aria-label="Nombre de relación configurada"]');
     const ordered=[type,reference1,reference2,origins,parameter,name];
     const editorOrder=ordered.map(element=>({label:element?.getAttribute('aria-label')??null,rect:rect(element)}));
     const parameterFirst=ordered.every(Boolean)&&ordered.every((element,index)=>index===0||!!(ordered[index-1].compareDocumentPosition(element)&Node.DOCUMENT_POSITION_FOLLOWING));
     return {ready:!!field&&!field.matches(':disabled')&&!!type&&type.disabled===editing&&document.activeElement===field&&visible(r)&&visible(h)&&!!hit&&(hit===field||field.contains(hit)),
      expectedField,active:identity(document.activeElement),hit:identity(hit),fieldDisabled:field?.matches(':disabled')??null,typeDisabled:type?.disabled??null,
      paneHeadingCount:paneHeadings.length,uniqueLevelTwoHeading,headingRole:heading?.getAttribute('role')??null,headingLevel:heading?.getAttribute('aria-level')??null,
      editorOrder,parameterFirst,pmHeadingCount:pane?.querySelectorAll('#configured-property-heading').length??0,formHeadingCount:form?.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]').length??0,
      pmTitle:heading?.querySelector('strong')?.textContent?.trim()??null,
      originsOpen:origins?.open??null,formHidden:!!form?.closest('[hidden]'),scrollTop:aside?.scrollTop??null,fieldRect:r,headingRect:h,asideRect:a,
      field:field?.getAttribute('aria-label')??null,heading:heading?.textContent??null,headingTop:h?.top??null,top:r?.top??null,bottom:r?.bottom??null};
    },expectedField,mode==='edit');
    return last.ready?last:false;
   });
  }catch(error){checks.push({configuredInspectorRevealFailure:{mode,...last}});throw error;}
  // Observe the application's initial reveal; no additional scrolling or focusing
  // is performed to obtain this parameter-order and single-title evidence.
  check(result.parameterFirst,'Configured relation DOM order is Type, both references, origin disclosure, Distance and Name before extra reveal: '+JSON.stringify({mode,order:result.editorOrder}));
  check(result.pmHeadingCount===1&&result.uniqueLevelTwoHeading&&result.formHeadingCount===0&&result.pmTitle===(mode==='edit'?'Editar relación':'Nueva relación'),
   'Configured relation has one application-owned level-2 PropertyManager heading without a duplicate editor heading: '+JSON.stringify({mode,pmHeadingCount:result.pmHeadingCount,paneHeadingCount:result.paneHeadingCount,headingRole:result.headingRole,headingLevel:result.headingLevel,formHeadingCount:result.formHeadingCount,pmTitle:result.pmTitle}));
  // This face/LINE workflow never requests origin visibility or picking, including
  // after reopen. Both new and saved editors therefore keep that section closed.
  check(await page(expectedField=>{const group=document.querySelector('details[aria-label="Referencias de origen configuradas"]');return !!group&&!group.open
   &&!!group.querySelector('[aria-label="Componente de referencias de origen configuradas"]')
   &&document.activeElement===document.querySelector('[aria-label="'+expectedField+'"]');},expectedField),
  (mode==='create'?'New relation focuses Type':'Saved distance relation focuses Reference 1 with Type disabled')+' while unused origin controls remain mounted in a closed compact section');
  gestures.push({kind:'application-inspector-reveal',mode,...result});
 }
 async function control(label,value){ await navigation.reveal('[aria-label="'+label+'"]'); await page((label,value)=>{const e=document.querySelector('[aria-label="'+label+'"]');if(!e||e.disabled)throw Error('Enabled control required: '+label);Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},label,value);}
 async function response(after,action){return waitFor('actual '+action,async()=>{const s=await observe();check(!s.workerErrors.length,'Worker transport healthy');const row=s.assemblies.filter(r=>r.serial>after&&r.action===action&&r.response).at(-1);if(!row)return false;check(row.response.ok,row.response.error||'Native request failed');return row;});}
 async function recovery(doc){await waitFor('exact confirmed v3 recovery',async()=>{const raw=await page(()=>localStorage.getItem('solidflow.autosave'));return raw&&canonical(JSON.parse(raw))===canonical(doc)&&await page(root=>document.querySelector(root)?.getAttribute('aria-busy')==='false',ROOT);});}
 function geometry(wrapper,doc,z,label){
  check(wrapper.kind==='configured-assembly-scene'&&wrapper.context.rootConfiguration==='demo','Selected named scene');
  check(canonical(JSON.parse(wrapper.context.sourceSignature))===canonical(doc.source)&&canonical(JSON.parse(wrapper.context.catalogSignature))===canonical(doc.catalog),'Scene binds complete declaration');
  check(canonical(doc.source)===canonical(expected.source),'Named authoring preserves Base');
  const s=wrapper.scene;check(s.solidCount===2&&s.bodies.length===2&&!s.warnings.length,'Two healthy original solids');near(s.volume,128,1e-5,'Literal volume');near(s.area,192,1e-5,'Literal area');
  for(const [id,x,h] of [['A',-8,0],['B',8,z]]){const rows=s.bodies.filter(b=>canonical(b.component.occurrencePath)===canonical([id]));check(rows.length===1,'Unique component body');const b=rows[0];near(b.volume,64,1e-5,'Cube volume');near(b.area,96,1e-5,'Cube area');for(let i=0;i<3;i++){near(b.bounds.min[i],[x-2,-2,h][i],1e-6,'Cube minimum');near(b.bounds.max[i],[x+2,2,h+4][i],1e-6,'Cube maximum');near(b.worldPose.translation[i],[x,0,h][i],1e-6,'Literal placement');}near(Math.abs(b.worldPose.rotation[3]),1,1e-8,'Unchanged orientation');}
  phases.push({label,z,volume:s.volume,area:s.area});return s;
 }
 async function top(){await button('Superior','[aria-label="Vistas del ensamblaje configurado"]');await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
 async function point(world,z){
  const r=await page(()=>{const canvas=document.querySelector('.configured-assembly-view canvas'),r=canvas?.getBoundingClientRect();if(!r||!r.width||!r.height||r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight)throw Error('Entire configured canvas must remain visible');return {x:r.x,y:r.y,width:r.width,height:r.height};});
  // Literal original envelope and public top-view convention: up projects +Y,
  // camera direction (0,-0.0001,1). No camera state or selected geometry injection.
  const span=Math.hypot(20,4,z+4),pixels=r.height/(1.3*span),d=Math.hypot(1,.0001);
  return {x:r.x+r.width/2+world[0]*pixels,y:r.y+r.height/2-(world[1]+.0001*(world[2]-(z+4)/2))/d*pixels};
 }
 async function press(world,z){const p=await point(world,z);await pointer('mouseMoved',p);await pointer('mousePressed',p,1);await pointer('mouseReleased',p,0);return p;}
 async function component(id,z){await top();const before=(await observe()).serial,p=await press([id==='A'?-8:8,0,id==='A'?4:z+4],z);await waitFor('actual component '+id,()=>page(id=>document.querySelector('[aria-label="Ocurrencia configurada"]')?.value===id,id));check(await page(()=>{const pane=document.querySelector('[data-configured-pane="model"]');return pane&&!pane.hidden&&pane.querySelector('button[aria-pressed="true"]');}),'A component click selects its real tree row without replacing the model tree');
  await navigation.pane('occurrence');
  await waitFor('explicit component properties pane',()=>page(()=>{const pane=document.querySelector('[data-configured-pane="occurrence"]');return pane&&!pane.hidden&&pane.querySelector('#configured-occurrence-inspector');}));
  await navigation.pane('model');
  check((await observe()).serial===before,'Component selection and explicit properties navigation send no worker solve');gestures.push({kind:'component',id,p});}
 async function leaveArmedRelation(z){
  const before=(await observe()).serial;
  const draftState=()=>page(()=>({name:document.querySelector('[aria-label="Nombre de relación configurada"]')?.value,type:document.querySelector('[aria-label="Tipo de relación configurada"]')?.value,references:[1,2].map(slot=>document.querySelector('[aria-label="Referencia '+slot+' de relación configurada"]')?.value),occurrence:document.querySelector('[aria-label="Ocurrencia configurada"]')?.value}));
  const original=await draftState();
  await actualControl('button[aria-label="Seleccionar Referencia 1 por cara en vista configurada"]',null,true);
  await waitFor('role armed before leaving editor',()=>page(()=>document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')==='face'));
  await navigation.pane('model');
  await waitFor('leaving editor ends temporary picking',()=>page(()=>!document.querySelector('[aria-label="Selección de referencia en vista configurada"]')&&document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')===''));
  await top();await press([8,0,z+4],z);
  check(canonical(await draftState())===canonical(original),'Clicking model with a retained draft neither selects a component nor changes relation references');
  await navigation.pane('relation');
  check(canonical(await draftState())===canonical(original),'Explicit return restores the same authored relation draft');
  check(await page(()=>document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')===''),'Returning to relation does not rearm a stale picking request');
  check((await observe()).serial===before,'Leaving and returning to the draft sends no native request');
  gestures.push({kind:'leave-armed-relation',draftRetained:true,pickingStopped:true});
 }
 async function pick(slot,kind,id,z,scene){
  const label='Seleccionar Referencia '+slot+' por '+(kind==='face'?'cara':'arista')+' en vista configurada';
  await actualControl('button[aria-label="'+label+'"]',null,true);
  await waitFor('actual role picking '+kind,()=>page(kind=>document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')===kind,kind));
  await waitFor('visible active role feedback',()=>page(slot=>{const e=document.querySelector('[aria-label="Selección de referencia en vista configurada"]');return e&&e.textContent.includes('Referencia '+slot);},slot));
  await top();const before=(await observe()).serial,p=await press([id==='A'?-8:8,kind==='face'?0:-2,id==='A'?4:z+4],z);
  const ref=await waitFor('actual role reference populated',()=>page((slot,kind,id)=>{const value=document.querySelector('[aria-label="Referencia '+slot+' de relación configurada"]')?.value;if(!value)return false;const r=JSON.parse(value);return r.kind===kind&&r.component?.occurrencePath.length===1&&r.component.occurrencePath[0]===id?r:false;},slot,kind,id));
  await waitFor('picked role exits temporary picking feedback',()=>page(()=>!document.querySelector('[aria-label="Selección de referencia en vista configurada"]')&&document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking')===''));
  const body=scene.bodies.find(b=>b.component.occurrencePath[0]===id),rows=(kind==='face'?body.faces:body.edges).filter(r=>canonical(r.selection[kind])===canonical(ref[kind]));
  check(rows.length===1&&canonical(ref.body)===canonical(body.body),'Picked exact current native body and material identity');const support=rows[0].worldSupport;
  if(kind==='face'){check(ref.support==='plane'&&support.kind==='plane','Material planar face role');near(support.normal[2],1,1e-8,'Picked +Z normal');near(support.point[2],id==='A'?4:z+4,1e-6,'Picked top plane');}
  else{check(support.kind==='line','Material LINE role');near(Math.abs(support.axis[0]),1,1e-8,'Picked X LINE');near(support.point[1],-2,1e-6,'Picked front LINE');near(support.point[2],id==='A'?4:z+4,1e-6,'Picked top LINE');}
  check((await observe()).serial===before,'Role selection sends no worker solve');gestures.push({kind,slot,id,p,reference:ref});return ref;
 }
 async function draft(type,name){await actualControl('[aria-label="Comandos del ensamblaje configurado"] button','Nueva relación');await revealedInspector('create');await control('Tipo de relación configurada',type);await control('Nombre de relación configurada',name);}
 async function preview(base,z,refs,type){const before=await observe();await button('Vista previa de relación configurada',FORM);const row=await response(before.serial,ACTION),v=row.response.value,m=row.edit.change.mate;check(canonical(row.current.document)===canonical(base)&&row.edit.configuration==='demo'&&row.edit.scopePath.length===0,'Exact named root preview context');check(row.edit.change.kind==='add'&&m.type===type&&canonical(m.first)===canonical(refs[0])&&canonical(m.second)===canonical(refs[1]),'Exact pointer-authored endpoints reach native');if(type==='distance')check(m.distance===2,'Literal signed distance two');check(v.kind==='configured-assembly-preview'&&v.hasToken&&v.verification.accepted&&v.verification.status==='verified','Verified private proposal');geometry(v.scene,v.document,z,'preview-'+type);await recovery(base);return v.document;}
 async function apply(doc,z){const before=await observe();await button('Aplicar configuración',NAV);const a=await response(before.serial,'apply-configured-assembly');check(canonical(a.response.value.document)===canonical(doc),'Apply exact full proposal');const b=await response(before.serial,'build-configured-assembly');const scene=geometry(b.response.value,doc,z,'apply');await recovery(doc);return scene;}
 async function history(label,doc,z){const before=await observe();await button(label,NAV);const row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(doc),'Exact full history');geometry(row.response.value,doc,z,label);await recovery(doc);}
 return async()=>{
  await waitFor('production startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
  const inputBytes=await fs.readFile(input);let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('owned discard dialog',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');let row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(expected),'Original full v3 imported');let scene=geometry(row.response.value,expected,6,'initial');await recovery(expected);
  await require('./desktop-command-header-layout.cjs')({page,check,checks}, 'configured-picking-initial-before-reveal', 'configured');
  await component('A',6);await component('B',6);
  await draft('distance','Pointer top distance');await leaveArmedRelation(6);const faces=[await pick(1,'face','B',6,scene),await pick(2,'face','A',6,scene)];await control('Distancia de relación configurada en mm','2');
  await ribbon.retained('relation-draft');
  const staged=await preview(expected,2,faces,'distance');await ribbon.retained('verified-preview');before=await observe();await button('Cancelar',NAV);await response(before.serial,'discard-configured-assembly');row=await response(before.serial,'build-configured-assembly');geometry(row.response.value,expected,6,'cancel');await recovery(expected);
  let current=await preview(expected,2,faces,'distance');check(canonical(current)===canonical(staged),'Cancel retry retains authored declaration');scene=await apply(current,2);await history('Deshacer',expected,6);await history('Rehacer',current,2);
  await component('B',2);await draft('parallel','Pointer top LINE parallel');const lines=[await pick(1,'edge','A',2,scene),await pick(2,'edge','B',2,scene)];const distanceDoc=current;current=await preview(current,2,lines,'parallel');scene=await apply(current,2);await history('Deshacer',distanceDoc,2);await history('Rehacer',current,2);
  await button('Guardar como',NAV);await waitFor('canceled Save As',()=>ipc.filter(e=>e.channel==='document:save'&&e.completed).length===1);await recovery(current);await button('Guardar como',NAV);await waitFor('actual saved v3',async()=>{try{return ipc.filter(e=>e.channel==='document:save'&&e.completed).length===2&&canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(current);}catch(e){if(e.code==='ENOENT')return false;throw e;}});
  const saved=await fs.readFile(output);before=await observe();await button('Abrir',NAV);row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(current),'Reopen exact authored v3');geometry(row.response.value,current,2,'reopen');await recovery(current);await component('B',2);
  // Reopen the saved distance form for visual review of persistent face marks.
  // This display-only editor does not create a proposal or alter the saved file.
  before=await observe();await actualControl('[aria-label="Comandos del ensamblaje configurado"] button','Relaciones');await actualControl('button[aria-label="Editar relación configurada Pointer top distance"]',null,true);
  await waitFor('saved distance form ready',()=>page(form=>!!document.querySelector(form),FORM));
  await button('Isométrica','[aria-label="Vistas del ensamblaje configurado"]');
  await revealedInspector('edit');
  await recovery(current);check((await observe()).serial===before.serial,'Opening saved references is display-only');
  check((await fs.readFile(input)).equals(inputBytes),'Original fixture unchanged');check(dialogCounts().opens===2&&dialogCounts().saves===2,'Exact original/reopen and canceled/successful Save dialogs');check(!consoleErrors.length&&!failedRequests.length,'Healthy renderer/resources');checks.push({savedSha256:digest(saved),originalSha256:digest(inputBytes),gestures,phases,limits:'Original two cubes, named root, top planar distance and X LINE parallel. Actual CDP geometry picks and ribbon pointer/keyboard navigation; form controls scripted. Ribbon tabs retain draft and verified-preview fields, recovery, inspector state, confirmation guards and native request serial. Final capture displays the reopened saved distance editor. No nested/suppressed picking or general platform claim.'});await capture(current);
  await button('Cerrar edición de relación configurada',FORM);
  await waitFor('saved editor closed before owned window teardown',()=>page(form=>!document.querySelector(form),FORM));await recovery(current);
 };
};
