'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Four fixed original workflows. Native scene data nominates actual material
// locators; expected placements below use only literal dimensions and rotations.
module.exports = function configuredCompoundWorkflow(c) {
  const { family, profileKind = 'rectangle', expected, input, output, evaluate, observe, waitFor, click, capture,
    checks, check, canonical, digest, completePendingSave, ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs } = c;
  const ROOT = '.configured-assembly-workspace', NAV = '[aria-label="Archivo del ensamblaje configurado"]';
  const FORM = '[aria-label="Editar relación compuesta del estado"]', ACTION = 'preview-configured-assembly-relation-edit', phases = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  async function button(text, parent = ROOT) { await page((text, parent) => {
    const rows = [...document.querySelectorAll(parent + ' button')].filter(b => b.textContent.trim() === text);
    if (rows.length !== 1 || rows[0].disabled) throw Error('One enabled button required: ' + text); rows[0].click();
  }, text, parent); }
  async function aria(label) { await page(label => { const b = document.querySelector('button[aria-label="' + label + '"]'); if (!b || b.disabled) throw Error('Enabled button required: ' + label); b.click(); }, label); }
  async function control(label, value) { await page((label, value) => {
    const e = document.querySelector('[aria-label="' + label + '"]'); if (!e || e.disabled) throw Error('Enabled control required: ' + label);
    const p = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p, 'value').set.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }, label, value); }
  async function checkbox(label, checked) { await page((label, checked) => { const e = document.querySelector('input[aria-label="' + label + '"]'); if (!e || e.disabled) throw Error('Enabled checkbox required: ' + label); if (e.checked !== checked) e.click(); }, label, checked); }
  async function choose(label, reference) {
    const values = await page(label => [...document.querySelector('[aria-label="' + label + '"]').options].map(o => o.value).filter(v => v && v !== 'retained'), label);
    const matches = values.filter(v => { try { return canonical(JSON.parse(v)) === canonical(reference); } catch { return false; } });
    check(matches.length === 1, 'Exactly one real current option for ' + label); await control(label, matches[0]);
  }
  async function response(after, action, accepted = true) { return waitFor('actual ' + action, async () => {
    const state = await observe(); check(!state.workerErrors.length, 'Actual worker transport healthy');
    const row = state.assemblies.filter(r => r.serial > after && r.action === action && r.response).at(-1);
    if (!row) return false; check(row.response.ok === accepted, row.response.error || 'Unexpected native request result'); return row;
  }); }
  async function recovery(doc) { await waitFor('exact complete configured recovery', async () => {
    const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(doc) && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false', ROOT);
  }); }
  async function savedReady(doc, label) {
    await completePendingSave();
    const ready = await waitFor(label + ' actual clean renderer controls', () => page((name, file, nav) => {
      const root = document.querySelector('.configured-assembly-workspace'), header = root?.querySelector('header');
      const rows = [...document.querySelectorAll(nav + ' button')], one = text => rows.filter(b => b.textContent.trim() === text);
      const open = one('Abrir'), save = one('Guardar'), apply = one('Aplicar configuración');
      if (root?.getAttribute('aria-busy') !== 'false' || header?.querySelector('strong')?.textContent !== 'SolidFlow · ' + name
        || header?.querySelector('span')?.getAttribute('title') !== file || open.length !== 1 || open[0].disabled
        || save.length !== 1 || save[0].disabled || apply.length !== 1 || !apply[0].disabled) return false;
      return { header: header.querySelector('strong').textContent, openEnabled: true, saveEnabled: true, applyDisabled: true };
    }, doc.source.name, output, NAV));
    await recovery(doc); checks.push({ savedRendererReady: { label, ...ready } });
  }
  const near = (a, b, band, label) => check(Number.isFinite(a) && Math.abs(a - b) <= band, label + ': ' + a + ' / ' + b);
  const variants = doc => doc.catalog.find(r => r.definition.id === 'compound-S').configurations;
  const compact = doc => variants(doc).find(v => v.id === 'compact');
  const declaration = doc => { const rows = compact(doc).mateDeclarations ?? []; check(rows.length === 1 && rows[0].type === family, 'One complete original compound declaration'); return rows[0]; };
  function preserved(doc) {
    check(canonical(doc.source) === canonical(expected.source), 'Named compound edit preserves entire Base source');
    check(canonical(doc.catalog[0]) === canonical(expected.catalog[0]), 'Root selector definitions preserved');
    check(canonical(variants(doc).find(v => v.id === 'dormant')) === canonical(variants(expected).find(v => v.id === 'dormant')), 'Dormant original named state preserved');
  }
  const rotate = (q, v) => { const [x,y,z,w] = q, [a,b,d] = v; return [(1-2*y*y-2*z*z)*a+(2*x*y-2*z*w)*b+(2*x*z+2*y*w)*d,(2*x*y+2*z*w)*a+(1-2*x*x-2*z*z)*b+(2*y*z-2*x*w)*d,(2*x*z-2*y*w)*a+(2*y*z+2*x*w)*b+(1-2*x*x-2*y*y)*d]; };
  function geometry(wrapper, doc, stage, label) {
    check(wrapper.kind === 'configured-assembly-scene' && wrapper.context.rootConfiguration === doc.rootConfiguration, 'Actual complete selected scene');
    check(canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(doc.source) && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(doc.catalog), 'Native scene bound to full source/catalog context');
    const s = wrapper.scene, circle = family === 'profile-center' && profileKind === 'circle';
    check(s.bodies.length === 4 && s.solidCount === 4 && s.prototypeCount === 1 && !s.warnings.length, 'Four original solids and one reused prototype');
    const volume = family === 'profile-center' ? circle ? 48*Math.PI : 288 : family === 'line-path' ? 384 : 16*Math.PI;
    const area = family === 'profile-center' ? circle ? 80*Math.PI : 432 : family === 'line-path' ? 512 : 24*Math.PI+64;
    near(s.volume, volume, 1e-5, 'Independent total volume'); near(s.area, area, 1e-5, 'Independent total area');
    check(new Set(s.bodies.map(b => canonical(b.component.occurrencePath))).size === 4, 'One native member per exact placement');
    const original = family === 'profile-center' ? circle ? [[-2,-2,0],[2,2,3]] : [[-3,-2,0],[3,2,3]] : family === 'line-path' ? [[-2,-3,0],[2,3,4]] : [[3,-2,0],[5,0,4]];
    const transform = ([min,max], owner) => owner === 'left' ? [min,max] : [[30-max[1],min[0],min[2]],[30-min[1],max[0],max[2]]];
    for (const owner of ['left','right']) for (const leaf of ['a','b']) {
      const found = s.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([owner,leaf])); check(found.length === 1, 'Unique exact member'); const b = found[0];
      const id = family === 'profile-center' ? 'original-profile-'+profileKind : family === 'line-path' ? 'original-line-prism' : 'original-quarter-sector';
      check(b.component.definition.id === id && b.solidCount === 1, 'Exact original native definition'); near(b.volume,volume/4,1e-5,'Independent member volume'); near(b.area,area/4,1e-5,'Independent member area');
      let local = original, solved = false;
      if (leaf === 'b') {
        const base = doc.rootConfiguration === 'mixed' && owner === 'left';
        if (!stage || base) { const t = base ? family === 'profile-center' ? [8,4,5] : family === 'line-path' ? [12,4,2] : [9,4,2] : family === 'profile-center' ? [6,2,4] : family === 'line-path' ? [10,4,2] : [7,3,1]; local = original.map(v => v.map((x,i) => x+t[i])); }
        else { solved = true;
          if (family === 'profile-center') { const z = stage === 1 ? 2 : 3; local = circle ? [[-2,-2,z],[2,2,z+3]] : [[-2,-3,z],[2,3,z+3]]; }
          else if (family === 'line-path') local = stage === 1 ? [[-2,-8,4],[2,-2,8]] : [[-2,-4.5,4],[2,1.5,8]];
          else local = stage === 1 ? [[1+Math.SQRT2,-2,0],[3+Math.SQRT2,-2+2*Math.SQRT2,4]] : [[3,-2,0],[5,0,4]];
        }
      }
      const [min,max] = transform(local,owner); for(let i=0;i<3;i++){near(b.bounds.min[i],min[i],1e-6,'Independent material minimum');near(b.bounds.max[i],max[i],1e-6,'Independent material maximum');}
      if (solved && !circle) {
        const localDirection = family === 'profile-center' || family === 'line-path' || stage === 2 ? [0,1,0] : [-Math.SQRT1_2,Math.SQRT1_2,0];
        const wanted = owner === 'left' ? localDirection : [-localDirection[1],localDirection[0],localDirection[2]];
        rotate(b.worldPose.rotation,family === 'line-path' ? [0,1,0] : [1,0,0]).forEach((v,i)=>near(v,wanted[i],1e-8,'Independent material Follow/quarter-turn direction'));
        rotate(b.worldPose.rotation,[0,0,1]).forEach((v,i)=>near(v,i===2?1:0,1e-8,'Independent material UP direction'));
      }
    }
    phases.push({label,stage,selected:doc.rootConfiguration,generation:wrapper.context.generation,volume:s.volume,area:s.area,members:s.bodies.map(b=>({path:b.component.occurrencePath,bounds:b.bounds}))});
  }
  function verified(value, doc) {
    const rows = compact(doc).mateDeclarations ?? [], owners = doc.rootConfiguration === 'mixed' ? ['right'] : ['left','right'];
    // Suppressed compound declarations have no active physical constraint.
    // Passive winding observations belong only to mechanical captured families.
    const active = rows.filter(m=>!m.suppressed);
    const wanted = owners.flatMap(owner => active.map(m=>JSON.stringify([[owner],'compound-S','s-r1','compact',m.id])));
    check(value.verification.status === 'verified' && value.verification.accepted && canonical(value.verification.reports.map(r=>r.key).sort())===canonical(wanted.sort()), 'Every exact placed compound declaration independently verified once');
    for(const r of value.verification.reports){ const m=active.find(m=>m.id===JSON.parse(r.key)[4]); check(m&&!r.passive,'Exact active compound declaration has no passive winding'); check(r.measurement.status==='ok'&&r.measurement.satisfied,'Actual physical compound relation satisfied'); }
  }
  async function ready(row, baseline, stage, kind) {
    const v=row.response.value; check(canonical(row.current.document)===canonical(baseline),'Private proposal retains exact original complete baseline');
    check(canonical(row.edit.scopePath)===canonical(['right'])&&row.edit.definition.id==='compound-S'&&row.edit.definition.revision==='s-r1'&&row.edit.configuration==='compact'&&row.edit.change.kind===kind,'Exact scope/tuple/state/edit intent');
    check(v.kind==='configured-assembly-preview'&&v.hasToken&&v.candidateGeneration>v.generation,'Actual private ready single-use capability'); preserved(v.document); verified(v,v.document); geometry(v.scene,v.document,stage,'ready-'+kind); await recovery(baseline); return v.document;
  }
  async function preview(baseline,stage,kind='replace'){const before=await observe();await button('Vista previa de relación compuesta configurada',FORM);return ready(await response(before.serial,ACTION),baseline,stage,kind);}
  async function apply(staged,stage){const before=await observe();await button('Aplicar configuración',NAV);const a=await response(before.serial,'apply-configured-assembly');check(canonical(a.response.value.document)===canonical(staged),'Apply commits exact prepared complete document');const row=await response(before.serial,'build-configured-assembly');geometry(row.response.value,staged,stage,'applied');await recovery(staged);return staged;}
  async function history(label,doc,stage){const before=await observe();await button(label,NAV);const row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(doc),'History restores exact complete context');geometry(row.response.value,doc,stage,label);await recovery(doc);}
  async function reject(baseline){const before=await observe();await button('Vista previa de relación compuesta configurada',FORM);const row=await response(before.serial,ACTION,false);check(!row.response.value,'Rejected material intent yields no native proposal');await recovery(baseline);check(await page(nav=>[...document.querySelectorAll(nav+' button')].some(b=>b.textContent.trim()==='Aplicar configuración'&&b.disabled),NAV),'Rejected native intent has no Apply capability');}
  return async()=>{
    await waitFor('production startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    const originalBytes=await fs.readFile(input);let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('initial discard dialog',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');
    let row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(expected),'Actual file IPC opens original strict v3');geometry(row.response.value,expected,0,'initial');await recovery(expected);
    before=await observe();await control('Ámbito de configuración','["right"]');row=await response(before.serial,'build-configured-assembly');
    const scene=row.response.value.scene,body=id=>{const rows=scene.bodies.filter(b=>canonical(b.component.occurrencePath)===canonical(['right',id]));check(rows.length===1,'Unique current original role body');return rows[0];};
    const component=id=>({occurrencePath:[id],definition:body(id).component.definition});
    const vertex=(id,p)=>{const rows=body(id).vertexPoints.filter(v=>v.point.every((x,i)=>Math.abs(x-p[i])<1e-10));check(rows.length===1,'Unique native material vertex at literal local coordinates');return {kind:'vertex',...rows[0].selection,component:component(id),body:rows[0].selection.body??null,support:'point'};};
    const plane=(id,z)=>{const rows=body(id).faces.filter(f=>f.support?.kind==='plane'&&f.support.normal[2]>.99&&Math.abs(f.support.point[2]-z)<1e-10);check(rows.length===1,'Unique original native roof');return rows[0].selection;};
    const face=(id,z)=>{const f=plane(id,z);return {component:component(id),body:f.body??null,face:f.face};};
    const edge=(id,axis,other,z)=>{const rows=body(id).edges.filter(e=>e.support?.kind==='line'&&Math.abs(e.support.axis[axis])>.99&&Math.abs(e.support.point[1-axis]-other)<1e-10&&Math.abs(e.support.point[2]-z)<1e-10);check(rows.length===1,'Unique original material LINE');return rows[0];};
    const edgeRef=(id,e)=>({kind:'edge',...e.selection,component:component(id),body:e.selection.body??null,support:'line'});
    const pathLabel=family==='line-path'?'LINE configurado':'circular configurado';
    await button('Nueva relación compuesta configurada');await control('Tipo de relación compuesta configurada',family);const name='Original configured '+family+' '+profileKind;await control('Nombre de relación compuesta configurada',name);
    if(family==='profile-center'){
      await control('Familia de perfiles configurada',profileKind==='circle'?'free':'rectangle');
      for(const [i,id]of [[1,'a'],[2,'b']]){await choose('Cara del perfil '+i+' configurado',face(id,3));if(profileKind==='rectangle'){const e=edge(id,0,-2,3);await choose('Arista material del perfil '+i+' configurado',edgeRef(id,e));await control('Sentido material del perfil '+i+' configurado',e.support.axis[0]>0?'1':'-1');}}
      await control('Desplazamiento de perfiles configurado en mm','2');if(profileKind==='rectangle'){
        await control('Cuartos de vuelta de perfiles configurados','1');await choose('Arista material del perfil 1 configurado',edgeRef('a',edge('a',0,-2,0)));await reject(expected);await choose('Arista material del perfil 1 configurado',edgeRef('a',edge('a',0,-2,3)));
      }
    }else{
      await choose('Punto del trayecto '+pathLabel,vertex('b',family==='line-path'?[-2,3,0]:[3,-2,4]));
      if(family==='line-path'){
        await choose('Arista del trayecto LINE configurado',edgeRef('a',edge('a',1,-2,4)));await choose('Origen del trayecto LINE configurado',vertex('a',[-2,-3,0]));await control('Modo del trayecto LINE configurado','distance');await control('Valor del trayecto LINE configurado','1');
      }else{
        const arcs=body('a').edges.filter(e=>e.circularPathOrigins?.length===2&&e.lines.length>0&&e.lines.filter((_,i)=>i%3===2).every(z=>Math.abs(z-4)<1e-10));check(arcs.length===1,'Unique actual native upper open arc');const e=arcs[0];
        await choose('Arco y origen del trayecto circular configurado',{...e.selection,component:component('a'),body:e.selection.body??null,startVertex:vertex('a',[5,-2,4]).vertex});await control('Modo del trayecto circular configurado','coordinate');await control('Valor del trayecto circular configurado',String(Math.PI+1));
      }
      await control('Orientación del trayecto '+pathLabel,'follow');await control('Eje de orientación del trayecto '+pathLabel,family==='line-path'?'y':'x');await control('Giro del trayecto '+pathLabel,'up');await control('Eje UP del trayecto '+pathLabel,'z');const guide=plane('a',4);await choose('Guía UP del trayecto '+pathLabel,{kind:'face',...guide,component:component('a'),body:guide.body??null,support:'plane'});
      await reject(expected);if(family==='line-path')await choose('Origen del trayecto LINE configurado',vertex('a',[-2,-3,4]));else await control('Valor del trayecto circular configurado',String(Math.PI/2));
    }
    let staged=await preview(expected,1,'add');const first=declaration(staged);check(first.name===name,'Actual complete compound name retained');
    before=await observe();await button('Cancelar',NAV);await response(before.serial,'discard-configured-assembly');row=await response(before.serial,'build-configured-assembly');geometry(row.response.value,expected,0,'cancel');await recovery(expected);
    const retry=await preview(expected,1,'add');check(canonical(retry)===canonical(staged),'Cancel/retry produces exact same complete proposal');let current=await apply(retry,1);await history('Deshacer',expected,0);await history('Rehacer',current,1);
    await aria('Editar relación configurada '+name);
    if(family==='profile-center'){
      if(profileKind==='rectangle'){
        await choose('Cara del perfil 2 configurado',face('b',3));check(await page(()=>document.querySelector('[aria-label="Arista material del perfil 2 configurado"]')?.value===''),'Profile face reselection clears material axis atomically');await choose('Arista material del perfil 2 configurado',edgeRef('b',edge('b',0,-2,3)));await control('Sentido material del perfil 2 configurado',edge('b',0,-2,3).support.axis[0]>0?'1':'-1');
      }
      await control('Desplazamiento de perfiles configurado en mm','3');
    }else if(family==='line-path'){
      await choose('Arista del trayecto LINE configurado',edgeRef('a',edge('a',1,-2,4)));check(await page(()=>document.querySelector('[aria-label="Origen del trayecto LINE configurado"]')?.value===''),'LINE edge reselection clears origin atomically');await choose('Origen del trayecto LINE configurado',vertex('a',[-2,-3,4]));await control('Modo del trayecto LINE configurado','percent');await control('Valor del trayecto LINE configurado','25');await checkbox('Invertir posición del trayecto LINE configurado',true);
    }else{
      // Explicit Free domains retain the already measured interior point; they
      // do not infer wrapping or a native application's unobserved policy.
      await control('Modo del trayecto circular configurado','free');await control('Dominio del trayecto circular configurado','support-circle');staged=await preview(current,1);check(declaration(staged).position.domain==='support-circle','Explicit Free support-circle intent retained');before=await observe();await button('Cancelar',NAV);await response(before.serial,'discard-configured-assembly');await response(before.serial,'build-configured-assembly');await recovery(current);await control('Dominio del trayecto circular configurado','trim');staged=await preview(current,1);check(declaration(staged).position.domain==='trim','Explicit Free trim intent retained');before=await observe();await button('Cancelar',NAV);await response(before.serial,'discard-configured-assembly');await response(before.serial,'build-configured-assembly');await recovery(current);await control('Modo del trayecto circular configurado','coordinate');await control('Valor del trayecto circular configurado','0');
    }
    const beforeEdit=current;staged=await preview(current,2);current=await apply(staged,2);await history('Deshacer',beforeEdit,1);await history('Rehacer',current,2);
    before=await observe();await aria('Suprimir relación configurada '+name);staged=await ready(await response(before.serial,ACTION),current,2,'suppression');current=await apply(staged,2);check(declaration(current).suppressed,'Complete declaration suppressed');
    before=await observe();await aria('Activar relación configurada '+name);staged=await ready(await response(before.serial,ACTION),current,2,'suppression');current=await apply(staged,2);const beforeRemove=current;
    before=await observe();await aria('Eliminar relación configurada '+name);staged=await ready(await response(before.serial,ACTION),current,2,'remove');current=await apply(staged,2);check((compact(current).mateDeclarations??[]).length===0,'Exact complete compound deletion');await history('Deshacer',beforeRemove,2);current=beforeRemove;
    before=await observe();await control('Configuración raíz','mixed');row=await response(before.serial,'build-configured-assembly');current=row.current.document;geometry(row.response.value,current,2,'Base-isolated');preserved(current);await recovery(current);
    const header=await page(root=>document.querySelector(root+' header')?.textContent,ROOT);await button('Guardar como',NAV);await waitFor('canceled Save As',()=>ipc.filter(x=>x.channel==='document:save'&&x.completed).length===1);check(dialogCounts().saves===1&&await page(root=>document.querySelector(root+' header')?.textContent,ROOT)===header,'Canceled Save As preserves dirty identity');await recovery(current);
    await button('Guardar como',NAV);await waitFor('real full-context Save As bytes',async()=>{try{return ipc.filter(x=>x.channel==='document:save'&&x.completed).length===2&&canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(current);}catch(e){if(e.code==='ENOENT')return false;throw e;}});await savedReady(current,'Compound Save As');
    before=await observe();await control('Configuración raíz','both-compact');row=await response(before.serial,'build-configured-assembly');current=row.current.document;geometry(row.response.value,current,2,'shared-again');await recovery(current);
    await button('Guardar',NAV);await waitFor('real ordinary Save bytes',async()=>ipc.filter(x=>x.channel==='document:save'&&x.completed).length===3&&canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(current));const saved=await fs.readFile(output),last=ipc.filter(x=>x.channel==='document:save'&&x.completed).at(-1);check(last.documentWrite.hasPath&&last.documentWrite.filePath===output&&last.documentWrite.sha256===digest(saved)&&dialogCounts().saves===2,'Normal Save exact granted path/bytes without new dialog');await savedReady(current,'Compound normal Save');
    before=await observe();await button('Abrir',NAV);row=await response(before.serial,'build-configured-assembly');check(canonical(row.current.document)===canonical(current),'Actual saved complete context reopened');geometry(row.response.value,current,2,'reopened');await recovery(current);
    before=await observe();await button('Resolver configuración',NAV);row=await response(before.serial,'preview-configured-assembly');check(canonical(row.response.value.document)===canonical(current),'Fresh saved solve preserves complete compound intent');verified(row.response.value,current);geometry(row.response.value.scene,current,2,'fresh-reopened-solve');
    before=await observe();await button('Cancelar',NAV);await response(before.serial,'discard-configured-assembly');row=await response(before.serial,'build-configured-assembly');geometry(row.response.value,current,2,'final-cancel');await recovery(current);
    before=await observe();await control('Ámbito de configuración','["right"]');await response(before.serial,'build-configured-assembly');await recovery(current);
    const finalObservation=await observe(),historyState=()=>page(nav=>JSON.stringify([...document.querySelectorAll(nav+' button')].filter(b=>['Deshacer','Rehacer'].includes(b.textContent.trim())).map(b=>[b.textContent.trim(),b.disabled])),NAV);
    const finalHistory=await historyState();await aria('Editar relación configurada '+name);
    await waitFor('reopened complete compound form',()=>page((form,family,kind,pathLabel)=>{
      const section=document.querySelector(form),value=label=>section?.querySelector('[aria-label="'+label+'"]')?.value;
      const selected=label=>{const v=value(label);return !!v&&v!=='retained';};
      if(!section||value('Tipo de relación compuesta configurada')!==family)return false;
      if(family==='profile-center'){
        if(value('Familia de perfiles configurada')!==(kind==='circle'?'free':'rectangle')||value('Desplazamiento de perfiles configurado en mm')!=='3')return false;
        if(![1,2].every(i=>selected('Cara del perfil '+i+' configurado')))return false;
        if(kind==='rectangle'&&(![1,2].every(i=>selected('Arista material del perfil '+i+' configurado'))||value('Cuartos de vuelta de perfiles configurados')!=='1'))return false;
      }else{
        if(!selected('Punto del trayecto '+pathLabel)||!selected('Guía UP del trayecto '+pathLabel)||value('Orientación del trayecto '+pathLabel)!=='follow'||value('Giro del trayecto '+pathLabel)!=='up'||value('Eje UP del trayecto '+pathLabel)!=='z')return false;
        if(family==='line-path'){
          if(!selected('Arista del trayecto LINE configurado')||!selected('Origen del trayecto LINE configurado')||value('Modo del trayecto LINE configurado')!=='percent'||value('Valor del trayecto LINE configurado')!=='25'||!section.querySelector('[aria-label="Invertir posición del trayecto LINE configurado"]')?.checked)return false;
        }else if(!selected('Arco y origen del trayecto circular configurado')||value('Modo del trayecto circular configurado')!=='coordinate'||value('Valor del trayecto circular configurado')!=='0')return false;
      }
      section.scrollIntoView({block:'start'});return true;
    },FORM,family,profileKind,pathLabel));
    await recovery(current);check((await observe()).serial===finalObservation.serial&&await historyState()===finalHistory,'Reopened compound editor preserves committed geometry/history and sends no native mutation');
    check((await fs.readFile(input)).equals(originalBytes)&&(await fs.readFile(output)).equals(saved),'Verification preserves original and saved file bytes');check(dialogCounts().opens===2&&dialogCounts().saves===2&&!consoleErrors.length&&!failedRequests.length,'Exact isolated dialogs and zero renderer/resource errors');
    await capture(current);await button('Cerrar edición de relación configurada',FORM);await recovery(current);check((await observe()).serial===finalObservation.serial&&await historyState()===finalHistory,'Closing reopened draft preserves history and native state');
    console.log(JSON.stringify({test:'production-renderer-configured-compound-measurements',family,profileKind,phases,sourceSha256:digest(originalBytes),savedSha256:digest(saved)}));
  };
};
