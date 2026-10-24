'use strict';
const fs=require('node:fs/promises');
const {encodeJavaScriptString:quote}=require('./desktop-ui-source.cjs');
module.exports=function configuredPicking(c){
 const {expected,input,output,evaluate,observe,waitFor,click,pointer,asideWheel,capture,checks,check,canonical,digest,ipc,dialogCounts,consoleErrors,failedRequests,initialReadyMs}=c;
 const ROOT='.configured-assembly-workspace',NAV='[aria-label="Archivo del ensamblaje configurado"]',FORM='[aria-label="Editar relación del estado"]',ACTION='preview-configured-assembly-relation-edit',gestures=[],phases=[];
 const page=(fn,...args)=>evaluate('('+fn.toString()+')('+args.map(v=>'JSON.parse('+quote(JSON.stringify(v))+')').join(',')+')');
 const near=(a,b,t,label)=>check(Number.isFinite(a)&&Math.abs(a-b)<=t,label+': '+a+' expected '+b);
 async function button(text,parent=ROOT){await page((text,parent)=>{const a=[...document.querySelectorAll(parent+' button')].filter(b=>b.textContent.trim()===text);if(a.length!==1||a[0].disabled)throw Error('One enabled button required: '+text);a[0].click();},text,parent);}
 async function actualControl(selector,text=null,allowAsideWheel=false){
  const inspect=()=>page((selector,text)=>{
   const matches=[...document.querySelectorAll(selector)].filter(e=>text===null||e.textContent.trim()===text);
   if(matches.length!==1||matches[0].disabled)throw Error('One enabled actual control required: '+selector);
   const e=matches[0],r=e.getBoundingClientRect(),aside=e.closest('[aria-label="Inspector del ensamblaje configurado"]'),container=aside??e.closest('nav'),a=container?.getBoundingClientRect();
   const top=Math.max(0,a?a.top+container.clientTop:0),bottom=Math.min(innerHeight,a?a.top+container.clientTop+container.clientHeight:innerHeight);
   const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
   return {point:{x,y},visible:r.width>0&&r.height>0&&r.left>=Math.max(0,a?.left??0)&&r.right<=Math.min(innerWidth,a?.right??innerWidth)&&r.top>=top&&r.bottom<=bottom&&!!hit&&(hit===e||e.contains(hit)),
    aside:!!aside,scrollTop:aside?.scrollTop??0,delta:r.top<top?-200:200,wheelPoint:aside?{x:a.left+Math.min(100,a.width/2),y:(top+bottom)/2}:null,rect:{top:r.top,bottom:r.bottom},clip:{top,bottom}};
  },selector,text);
  let state=await inspect();
  for(let step=0;!state.visible&&allowAsideWheel&&state.aside&&step<24;step++){
   check(typeof asideWheel==='function','Bounded actual inspector wheel required');const old=state.scrollTop;
   await asideWheel(state.wheelPoint,state.delta);await waitFor('actual inspector wheel movement',async()=>{const next=await inspect();return next.scrollTop!==old||next.visible;});state=await inspect();
  }
  check(state.visible,'Control is physically visible and unobscured: '+JSON.stringify({selector,text,...state}));
  await pointer('mouseMoved',state.point);await pointer('mousePressed',state.point,1);await pointer('mouseReleased',state.point,0);
  gestures.push({kind:'control',selector,text,point:state.point,asideScrollTop:state.scrollTop});
 }
 async function revealedInspector(){
  const result=await waitFor('application-owned inspector reveal and focus',()=>page(()=>{
   const aside=document.querySelector('[aria-label="Inspector del ensamblaje configurado"]'),form=document.querySelector('#configured-relation-inspector'),field=form?.querySelector('input:not(:disabled),select:not(:disabled),button:not(:disabled)'),heading=form?.querySelector('h2,h3');
   if(!aside||!field||!heading||document.activeElement!==field)return false;const a=aside.getBoundingClientRect(),r=field.getBoundingClientRect(),h=heading.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   const visible=b=>b.width>0&&b.height>0&&b.top>=Math.max(0,a.top+aside.clientTop)&&b.bottom<=Math.min(innerHeight,a.top+aside.clientTop+aside.clientHeight)&&b.left>=a.left&&b.right<=a.right;
   return visible(r)&&visible(h)&&(hit===field||field.contains(hit))?{scrollTop:aside.scrollTop,field:field.getAttribute('aria-label'),heading:heading.textContent,headingTop:h.top,top:r.top,bottom:r.bottom}:false;
  }));gestures.push({kind:'application-inspector-reveal',...result});
 }
 async function control(label,value){await page((label,value)=>{const e=document.querySelector('[aria-label="'+label+'"]');if(!e||e.disabled)throw Error('Enabled control required: '+label);Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},label,value);}
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
 async function component(id,z){await top();const before=(await observe()).serial,p=await press([id==='A'?-8:8,0,id==='A'?4:z+4],z);await waitFor('actual component '+id,()=>page(id=>document.querySelector('[aria-label="Ocurrencia configurada"]')?.value===id,id));check((await observe()).serial===before,'Component selection sends no worker solve');gestures.push({kind:'component',id,p});}
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
 async function draft(type,name){await actualControl('[aria-label="Comandos del ensamblaje configurado"] button','Nueva relación');await revealedInspector();await control('Tipo de relación configurada',type);await control('Nombre de relación configurada',name);}
 async function preview(base,z,refs,type){const before=await observe();await button('Vista previa de relación configurada',FORM);const row=await response(before.serial,ACTION),v=row.response.value,m=row.edit.change.mate;check(canonical(row.current.document)===canonical(base)&&row.edit.configuration==='demo'&&row.edit.scopePath.length===0,'Exact named root preview context');check(row.edit.change.kind==='add'&&m.type===type&&canonical(m.first)===canonical(refs[0])&&canonical(m.second)===canonical(refs[1]),'Exact pointer-authored endpoints reach native');if(type==='distance')check(m.distance===2,'Literal signed distance two');check(v.kind==='configured-assembly-preview'&&v.hasToken&&v.verification.accepted&&v.verification.status==='verified','Verified private proposal');geometry(v.scene,v.document,z,'preview-'+type);await recovery(base);return v.document;}
 async function apply(doc,z){const before=await observe();await button('Aplicar configuración',NAV);const a=await response(before.serial,'apply-configured-assembly');check(canonical(a.response.value.document)===canonical(doc),'Apply exact full proposal');const b=await response(before.serial,'build-configured-assembly');const scene=geometry(b.response.value,doc,z,'apply');await recovery(doc);return scene;}
 async function history(label,doc,z){const before=await observe();await button(label,NAV);const row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(doc),'Exact full history');geometry(row.response.value,doc,z,label);await recovery(doc);}
 return async()=>{
  await waitFor('production startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
  const inputBytes=await fs.readFile(input);let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('owned discard dialog',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');let row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(expected),'Original full v3 imported');let scene=geometry(row.response.value,expected,6,'initial');await recovery(expected);
  await component('A',6);await component('B',6);
  await draft('distance','Pointer top distance');const faces=[await pick(1,'face','B',6,scene),await pick(2,'face','A',6,scene)];await control('Distancia de relación configurada en mm','2');
  const staged=await preview(expected,2,faces,'distance');before=await observe();await button('Cancelar',NAV);await response(before.serial,'discard-configured-assembly');row=await response(before.serial,'build-configured-assembly');geometry(row.response.value,expected,6,'cancel');await recovery(expected);
  let current=await preview(expected,2,faces,'distance');check(canonical(current)===canonical(staged),'Cancel retry retains authored declaration');scene=await apply(current,2);await history('Deshacer',expected,6);await history('Rehacer',current,2);
  await component('B',2);await draft('parallel','Pointer top LINE parallel');const lines=[await pick(1,'edge','A',2,scene),await pick(2,'edge','B',2,scene)];const distanceDoc=current;current=await preview(current,2,lines,'parallel');scene=await apply(current,2);await history('Deshacer',distanceDoc,2);await history('Rehacer',current,2);
  await button('Guardar como',NAV);await waitFor('canceled Save As',()=>ipc.filter(e=>e.channel==='document:save'&&e.completed).length===1);await recovery(current);await button('Guardar como',NAV);await waitFor('actual saved v3',async()=>{try{return ipc.filter(e=>e.channel==='document:save'&&e.completed).length===2&&canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(current);}catch(e){if(e.code==='ENOENT')return false;throw e;}});
  const saved=await fs.readFile(output);before=await observe();await button('Abrir',NAV);row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(current),'Reopen exact authored v3');geometry(row.response.value,current,2,'reopen');await recovery(current);await component('B',2);
  // Reopen the saved distance form for visual review of persistent face marks.
  // This display-only editor does not create a proposal or alter the saved file.
  before=await observe();await actualControl('[aria-label="Comandos del ensamblaje configurado"] button','Relaciones');await actualControl('button[aria-label="Editar relación configurada Pointer top distance"]',null,true);
  await waitFor('saved distance form ready',()=>page(form=>!!document.querySelector(form),FORM));
  await button('Isométrica','[aria-label="Vistas del ensamblaje configurado"]');
  await revealedInspector();
  await recovery(current);check((await observe()).serial===before.serial,'Opening saved references is display-only');
  check((await fs.readFile(input)).equals(inputBytes),'Original fixture unchanged');check(dialogCounts().opens===2&&dialogCounts().saves===2,'Exact original/reopen and canceled/successful Save dialogs');check(!consoleErrors.length&&!failedRequests.length,'Healthy renderer/resources');checks.push({savedSha256:digest(saved),originalSha256:digest(inputBytes),gestures,phases,limits:'Original two cubes, named root, top planar distance and X LINE parallel. Actual CDP geometry picks; form controls scripted. Final capture displays the reopened saved distance editor. No nested/suppressed picking or general platform claim.'});await capture(current);
  await button('Cerrar edición de relación configurada',FORM);
  await waitFor('saved editor closed before owned window teardown',()=>page(form=>!document.querySelector(form),FORM));await recovery(current);
 };
};
