'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
module.exports = function assemblySourceUpdateWorkflow(context) {
  const { expected, input, output, files, evaluate, observe, waitFor, click, checks, ipc, consoleErrors, failedRequests,
    check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const phases = [], APPLY='button[aria-label="Aplicar ensamblaje"]', CANCEL='button[aria-label="Cancelar vista previa del ensamblaje"]';
  const PANEL='[role="region"][aria-label="Actualizar origen de subensamblaje"]';
  const SOLVE='button[aria-label="Resolver actualización de subensamblaje"]', DISCARD='button[aria-label="Cancelar actualización de subensamblaje"]';
  const page=(fn,...args)=>evaluate('('+fn.toString()+')('+args.map(encodeJavaScriptString).join(',')+')');
  const near=(a,b,t,label)=>check(Number.isFinite(a)&&Math.abs(a-b)<t,label+' actual='+a+' expected='+b);
  const vector=(a,b,label)=>{check(Array.isArray(a)&&a.length===3,label+' shape');a.forEach((x,i)=>near(x,b[i],1e-6,label+'['+i+']'));};
  async function button(text,parent='.assembly-app') { await page((text,parent)=>{
    const rows=[...document.querySelectorAll(parent+' button')].filter(x=>x.textContent.trim()===text);
    if(rows.length!==1||rows[0].disabled)throw Error('One enabled button required: '+text);rows[0].click();
  },text,parent); }
  async function response(serial,action) { return waitFor('actual worker '+action,async()=>{
    const state=await observe();check(!state.workerErrors.length,'Worker runtime error');
    const event=state.assemblies.filter(x=>x.serial>serial&&x.action===action&&x.response).at(-1);
    if(!event)return false;check(event.response.ok,event.response.error||'Worker rejection');
    const value=event.response.value,scene=value?.kind==='assembly-scene'?value:value?.scene;
    phases.push({action,serial:event.serial,...(scene?{geometry:{volume:scene.volume,area:scene.area,solidCount:scene.solidCount,
      bodies:scene.bodies.map(b=>({component:b.component,body:b.body,volume:b.volume,area:b.area,bounds:b.bounds,worldPose:b.worldPose}))}}:{}),
      ...(value?.checks?{checks:value.checks,scopes:value.scopes.map(x=>({definition:x.definition,status:x.result.status}))}:{})});
    return event;
  }); }
  async function recovery(doc,label) { await waitFor(label+' committed recovery',async()=>{
    const raw=await page(()=>localStorage.getItem('solidflow.autosave'));
    return await page(()=>document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false')&&raw&&canonical(JSON.parse(raw))===canonical(doc);
  }); }
  function geometry(scene,updated) {
    check(scene.solidCount===3&&scene.bodies.length===3&&scene.prototypeCount===(updated?2:1),'Exact source/outside native counts');
    near(scene.volume,updated?96:72,1e-5,'Independent material volume');near(scene.area,updated?184:156,1e-5,'Independent material area');
    for(const [id,shift]of [['left',-10],['right',20],['outside',50]]) {
      const rows=scene.bodies.filter(b=>b.component.occurrencePath[0]===id);check(rows.length===1,'Unique native owner '+id);const b=rows[0],changed=updated&&id!=='outside';
      check(b.solidCount===1&&b.body.bodyId==='original-update-body'&&b.component.definition.id==='original-update-box'
        &&b.component.definition.revision===(changed?'r1':'r0'),'Exact current part tuple/body '+id);
      near(b.volume,changed?36:24,1e-5,'Each original box volume');near(b.area,changed?66:52,1e-5,'Each original box area');
      if(id==='outside'){vector(b.bounds.min,[50,0,0],'Outside lower');vector(b.bounds.max,[52,3,4],'Outside upper');}
      else{vector(b.bounds.min,[shift-2,2,3],'Nested lower');vector(b.bounds.max,[shift+1,changed?5:4,7],'Nested upper');}
    }
  }
  function intent(doc) {
    check(doc.id===expected.id&&doc.revision===expected.revision,'Parent identity preserved');
    check(canonical(doc.occurrences.map(x=>({...x,definition:undefined})))===canonical(expected.occurrences.map(x=>({...x,definition:undefined}))),
      'Outer occurrence IDs/poses/flags preserved');
    check(doc.occurrences.filter(x=>x.id!=='outside').every(x=>x.definition.id==='original-update-source'&&x.definition.revision==='r1'),'Both source uses advanced to authored r1');
    check(canonical(doc.occurrences.find(x=>x.id==='outside').definition)===canonical({id:'original-update-box',revision:'r0'}),'Independent outside part remains r0');
    const historical=expected.definitions.find(x=>x.id==='original-update-source');
    check(canonical(doc.definitions.find(x=>x.id===historical.id&&x.revision===historical.revision))===canonical(historical),'Historical source retained exactly');
    for(const mate of doc.mates)check(canonical(mate.first)===canonical({kind:'principal-plane',component:null,plane:'XY'})
      &&canonical(mate.second.component)===canonical({occurrencePath:[mate.id==='root-left'?'left':'right','m-new'],definition:{id:'original-update-box',revision:'r1'}}),
      'Explicit new descendant with unchanged declaring null frame');
  }
  async function selectLeft() {
    await page(()=>{const rows=[...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(x=>x.querySelector('span')?.firstChild?.textContent==='left');
      if(rows.length!==1||rows[0].disabled)throw Error('Exact source root tree row');rows[0].click();});
    await waitFor('selected source container',()=>page(()=>document.querySelector('input[aria-label="Nombre del componente"]')?.value==='left'));
  }
  async function review(base) {
    await selectLeft();const before=await observe();await click('button[aria-label="Actualizar subensamblaje"]');const event=await response(before.serial,'review-assembly-document-update');
    const value=event.response.value;
    check(value.kind==='assembly-document-source-review'&&!value.hasToken&&value.endpoints.length===2&&value.endpoints.every(x=>x.status==='needs-repair'&&x.afterResolution==='missing-path'),
      'Renamed child yields two explicit pending roles and no Apply capability');
    check(value.endpoints.every(x=>x.locator.side==='second')&&value.capturedMates.length===0,'Null frames and uncaptured relation inventory');
    geometry(value.scene,true);check(canonical(event.current)===canonical(base),'Review exact committed base');await recovery(base,'Review');
    await waitFor('pending source panel blocks solve',()=>page((panel,solve,apply)=>!!document.querySelector(panel)&&document.querySelector(solve)?.disabled===true&&document.querySelector(apply)?.disabled===true,PANEL,SOLVE,APPLY));
    return event;
  }
  async function repair() {
    check(await page(panel=>document.querySelectorAll(panel+' fieldset[data-assembly-endpoint]').length===2,PANEL),'Two actual pending endpoint fieldsets');
    // React commits each selected repair before the next control is operated.
    for(const id of ['root-left','root-right']) {
      await page((panel,id)=>{const fields=[...document.querySelectorAll(panel+' fieldset[data-assembly-endpoint]')].filter(x=>x.getAttribute('data-assembly-endpoint').includes(id));
        if(fields.length!==1)throw Error('Unique pending role '+id);const select=fields[0].querySelector('select');
        const choices=[...select.options].filter(x=>x.textContent.includes('m-new')&&x.textContent.endsWith(' · XY'));
        if(select.disabled||choices.length!==1)throw Error('Unique explicit renamed descendant XY choice');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,choices[0].value);select.dispatchEvent(new Event('change',{bubbles:true}));},PANEL,id);
      await waitFor('repair accepted '+id,()=>page((panel,id)=>{const field=[...document.querySelectorAll(panel+' fieldset[data-assembly-endpoint]')].find(x=>x.getAttribute('data-assembly-endpoint').includes(id));return field?.getAttribute('data-endpoint-status')==='explicit-choice';},PANEL,id));
    }
    await waitFor('all references explicitly selected',()=>page(solve=>document.querySelector(solve)?.disabled===false,SOLVE));
  }
  async function solved(base) {
    const before=await observe();await click(SOLVE);const event=await response(before.serial,'preview-assembly-document-update'),value=event.response.value;
    check(value.status==='ready'&&value.hasToken,'Fresh authenticated v2 source preview');intent(value.document);geometry(value.scene,true);
    check(value.checks.length===4&&value.checks.every(x=>x.satisfied&&x.lengthResidual<=x.lengthTolerance&&x.angleResidual<=x.angleTolerance),'Four fresh root/local plane checks');
    check(!Object.hasOwn(event,'proposed')&&event.decisions.repairs.length===2,'Only exact two decisions cross worker boundary');await recovery(base,'Preview');return event;
  }
  return async()=>{
    await waitFor('initial production readiness',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    const inputBytes=await fs.readFile(input),sourceBytes=await fs.readFile(files.source),incoming=JSON.parse(sourceBytes);
    await fs.writeFile(files.rejected,JSON.stringify({...incoming,id:'original-wrong-source',revision:'r2'}),{flag:'wx'});
    let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('initial discard dialog',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');let event=await response(before.serial,'build-assembly');
    check(canonical(event.document)===canonical(expected),'Actual original source-update Open');geometry(event.response.value,false);await recovery(expected,'Open');
    await button('Guardar como','.assembly-toolbar');await waitFor('baseline parent Save As',async()=>{try{return dialogCounts().saves===1&&canonical(JSON.parse(await fs.readFile(files.baseline,'utf8')))===canonical(expected);}catch(err){if(err.code==='ENOENT')return false;throw err;}});
    const parentName=files.baseline.split(/[\\/]/).pop();
    const first=await review(expected);await click(DISCARD);await recovery(expected,'Discard source review');
    await waitFor('source review closed without Apply',()=>page((panel,apply)=>!document.querySelector(panel)&&document.querySelector(apply)?.disabled===true,PANEL,APPLY));
    const second=await review(expected);check(second.response.value.reviewId!==first.response.value.reviewId,'Discarded review is not reused');await repair();
    let preview=await solved(expected);await click(CANCEL);await recovery(expected,'Cancel ready preview');
    check(await page((panel,apply)=>!!document.querySelector(panel)&&document.querySelector(apply)?.disabled===true,PANEL,APPLY),'Ready Cancel retains decisions and revokes Apply');
    preview=await solved(expected);await click(APPLY);event=await response(preview.serial,'apply-assembly');
    const applied=event.response.value.document;intent(applied);geometry(event.response.value.scene,true);await recovery(applied,'Source Apply');
    check(await page(name=>document.querySelector('.assembly-file')?.textContent===name,parentName),'Source update preserves parent filepath');
    before=await observe();await click('button[aria-label="Deshacer ensamblaje"]');event=await response(before.serial,'build-assembly');
    check(canonical(event.document)===canonical(expected),'One Undo restores full original source graph');geometry(event.response.value,false);await recovery(expected,'Undo');
    before=await observe();await click('button[aria-label="Rehacer ensamblaje"]');event=await response(before.serial,'build-assembly');
    check(canonical(event.document)===canonical(applied),'One Redo restores exact repaired source graph');geometry(event.response.value,true);await recovery(applied,'Redo');
    await button('Guardar','.assembly-toolbar');await waitFor('normal Save still writes parent only',async()=>canonical(JSON.parse(await fs.readFile(files.baseline,'utf8')))===canonical(applied));
    check(dialogCounts().saves===1&&(await fs.readFile(files.source)).equals(sourceBytes),'Source file unchanged and parent Save uses no new dialog');
    await selectLeft();before=await observe();await click('button[aria-label="Actualizar subensamblaje"]');
    const rejected=await waitFor('wrong source identity rejects atomically',async()=>{const state=await observe();return state.assemblies.find(x=>x.serial>before.serial&&x.action==='review-assembly-document-update'&&x.response?.ok===false);});
    check(rejected.response.error.includes('identidad'),'Wrong-source rejection reason');await recovery(applied,'Rejected source');
    check(await page(sel=>document.querySelector(sel)?.disabled===true,APPLY),'Rejected source has no Apply');
    await button('Guardar como','.assembly-toolbar');await waitFor('updated Save As',async()=>{try{return dialogCounts().saves===2&&canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(applied);}catch(err){if(err.code==='ENOENT')return false;throw err;}});
    before=await observe();await button('Abrir','.assembly-toolbar');event=await response(before.serial,'build-assembly');check(canonical(event.document)===canonical(applied),'Exact saved source/repaired paths reopen');geometry(event.response.value,true);await recovery(applied,'Reopen');
    before=await observe();await click('button[aria-label="Resolver ensamblaje"]');event=await response(before.serial,'preview-assembly');
    check(event.response.value.status==='ready'&&event.response.value.checks.length===4&&event.response.value.checks.every(x=>x.satisfied),'Reopened graph freshly solves all four relations');
    geometry(event.response.value.scene,true);await click(CANCEL);await recovery(applied,'Reopened solve Cancel');
    check((await fs.readFile(input)).equals(inputBytes)&&(await fs.readFile(files.source)).equals(sourceBytes),'Original inputs remain byte-identical');
    check(dialogCounts().opens===5&&dialogCounts().saves===2&&dialogCounts().csvExports===0&&ipc.every(x=>x.completed),'Exact original file-dialog queue');
    const final=await observe();check(!consoleErrors.length&&!failedRequests.length&&!final.workerErrors.length,'No renderer/worker runtime errors');
    checks.push({sourceUpdateInputSha256:digest(inputBytes),sourceUpdateIncomingSha256:digest(sourceBytes),savedSha256:digest(await fs.readFile(output)),phases,finalDocument:applied,
      independentOracles:'Original 2x3x4 M0 V24/A52 becomes 3x3x4 M1 V36/A66. Inner Rz90+[1,2,3], outer translations -10 and +20: bounds[-12,2,3]..[-9,5,7] and[18,2,3]..[21,5,7]. Outside M0 at[50,0,0] retains V24/A52 and bounds[50,0,0]..[52,3,4]. Totals V96/A184. Volume/area1e-5; bounds1e-6. Four actual plane-distance checks in declaring frames.',
      limits:'Original synthetic fixed-box case, scripted production controls, actual worker and file IPC with test-owned dialog paths. Explicit principal-plane descendant repair after rename; no automatic topology, human native-dialog interaction, dormant capture or general platform claim.'});
  };
};
