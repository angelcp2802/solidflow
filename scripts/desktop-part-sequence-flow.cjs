'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Original analytical fixture, real top commands/left properties and worker.
// No application state or worker responses are supplied by this workflow.
module.exports = function partSequenceWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, menu, menuKey, capture,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]';
  const records = [];
  async function change(selector, value) {
    await evaluate(`(() => { const e=document.querySelector(${quote(selector)}); if(!e||e.disabled) throw Error('Missing enabled field');
      const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,${quote(String(value))});
      e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
  }
  async function row(name, edit = false) {
    await evaluate(`(() => { const rows=[...document.querySelectorAll('.tree-row')].filter(e=>e.querySelector('span')?.textContent===${quote(name)});
      if(rows.length!==1) throw Error('Expected one feature tree row');
      ${edit ? "rows[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));" : 'rows[0].click();'} })()`);
  }
  function geometry(record, volume, height) {
    check(record.response.ok, record.response.error || 'Native build failed.');
    const value = record.response.value;
    check(value.featureErrors.length === 0 && value.bodyCatalogActive && value.bodies.length === 1, 'Expected one healthy explicit body.');
    const body = value.bodies[0];
    check(body.ref.bodyId === 'seq-body' && Math.abs(body.volume - volume) <= 1e-5, 'Independent sequential volume/identity.');
    [[body.bounds.min, [-10,-6,0]], [body.bounds.max, [10,6,height]]].forEach(([actual,wanted]) =>
      wanted.forEach((x,i) => check(Math.abs(actual[i]-x) <= 1e-6, 'Independent sequential bounds.')));
  }
  async function built(serial, operationCount, volume, height, phase) {
    const record = await waitFor('native sequence ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Worker observation error.');
      return state.builds.filter(r=>r.serial>serial && r.features.some(f=>f.id==='seq-base')
        && r.features.filter(f=>f.type==='extrude'||f.type==='cut').length===operationCount
        && r.response?.ok && r.response.value.featureErrors.length===0
        && r.response.value.bodies?.length===1 && Math.abs(r.response.value.bodies[0].volume-volume)<=1e-5).at(-1);
    }).catch(async error => { error.message += '; diagnostics=' + JSON.stringify(await observe()); throw error; });
    geometry(record,volume,height); records.push({phase,serial:record.serial,volume,bounds:record.response.value.bodies[0].bounds}); return record;
  }
  async function ready() {
    await waitFor('current operation can Apply',()=>evaluate(`!!document.querySelector(${quote(APPLY)}) && !document.querySelector(${quote(APPLY)}).disabled`));
  }
  async function retainedCutMenu() {
    const snapshot=()=>evaluate(`(() => {
      const panel=document.querySelector('.property-manager');
      if(!panel)throw Error('Live cut properties required');
      return {title:panel.querySelector('.property-title')?.textContent,
        controls:[...panel.querySelectorAll('input,select')].map(e=>({tag:e.tagName,label:e.getAttribute('aria-label'),type:e.type,value:e.value,checked:e instanceof HTMLInputElement?e.checked:null})),
        selectedBodies:[...panel.querySelectorAll('.body-operation-panel input[type="checkbox"]:checked')].map(e=>e.closest('label')?.textContent),
        recovery:localStorage.getItem('solidflow.autosave')};
    })()`);
    const original=await snapshot(),before=await observe();
    const open=async id=>{
      // Opening retains the existing scripted command route; key input is CDP.
      await click('[data-assembly-menu="'+id+'"]');
      await waitFor('part menu opens with actual popup focus: '+id,()=>evaluate(`(() => {
        const trigger=document.querySelector('[data-assembly-menu="${id}"]'),popup=document.querySelector('.part-main-menus [role="menu"]');
        return trigger?.getAttribute('aria-expanded')==='true'&&popup?.contains(document.activeElement);
      })()`));
    };
    const escape=async id=>{
      await menuKey('Escape');
      await waitFor('part menu Escape closes and restores trigger: '+id,()=>evaluate(`!document.querySelector('.part-main-menus [role="menu"]')&&document.activeElement===document.querySelector('[data-assembly-menu="${id}"]')`));
    };
    await open('view');await menuKey('ArrowDown');
    await waitFor('part menu real Down focuses Front',()=>evaluate(`document.activeElement?.getAttribute('role')==='menuitem'&&document.activeElement.textContent.trim().startsWith('Frontal')`));
    await escape('view');
    check(canonical(await snapshot())===canonical(original),'Menu Escape preserves live cut depth, fields, body references and committed recovery');
    await open('insert');
    check(await evaluate(`['Saliente extruido','Corte extruido','Revolución'].every(label=>{
      const matches=[...document.querySelectorAll('.part-main-menus .dropdown button')].filter(e=>e.textContent.trim()===label);
      return matches.length===1&&matches[0].disabled;
    })`),'Insert menu disables incompatible solid operations during the live cut draft');
    await escape('insert');
    check(canonical(await snapshot())===canonical(original)&&(await observe()).serial===before.serial,'Menu navigation preserves the cut draft without another native build');
    records.push({phase:'live-cut-menu-keyboard',keys:['ArrowDown','Escape','Escape'],draftRetained:true,insertGuards:true,serial:before.serial});
  }
  return async () => {
    await waitFor('part file control ready',()=>evaluate(`document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument==='function' && !!document.querySelector('button[aria-label="Abrir (Ctrl+O)"]')`),initialReadyMs);
    let serial=(await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('owned initial document replacement prompt',()=>evaluate(`!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')`));
    await evaluate(`(() => { const b=document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button'); if(!b||b.disabled||b.textContent.trim()!=='Continuar sin guardar')throw Error('Expected owned initial replacement'); b.click(); })()`);
    await built(serial,1,960,4,'original');
    // The first sketch is edited and accepted before starting a cut: this is
    // the previous lost-body-selection path, not a preauthored operation.
    await row('Left cut profile',true);
    await ready(); serial=(await observe()).serial; await click(APPLY);
    await waitFor('sketch accepted',()=>evaluate(`!document.querySelector('.property-manager')`));
    await built(serial,1,960,4,'accepted-sketch');
    const operations = [
      {sketch:'Left cut profile',type:'cut',depth:4,volume:944,height:4},
      {sketch:'Right cut profile',type:'cut',depth:4,volume:928,height:4},
      {sketch:'Boss profile',type:'extrude',depth:3,volume:976,height:7},
      {sketch:'Cap profile',type:'extrude',depth:2,volume:984,height:9},
    ];
    for(let i=0;i<operations.length;i++) {
      const op=operations[i];
      await waitFor('part ready for next operation',()=>evaluate(`document.querySelector('.statusbar')?.textContent.includes('Listo') && !document.querySelector('.property-manager')`));
      await row(op.sketch);
      await evaluate(`(() => { const t=[...document.querySelectorAll('.ribbon-tabs button')].find(e=>e.textContent.trim()==='Operaciones'); if(t)t.click(); })()`);
      await click('button.command[title="'+(op.type==='cut'?'Corte extruido':'Saliente/Base extruido')+'"]');
      await waitFor('operation properties ready',()=>evaluate(`!!document.querySelector('input[aria-label="Profundidad"]')`));
      if(op.type==='cut') {
        await waitFor('sole current cut body preselected',()=>evaluate(`document.querySelectorAll('.body-operation-panel input[type="checkbox"]:checked').length===1`));
      }
      await change('input[aria-label="Profundidad"]',op.depth);
      if(op.type==='extrude') {
        await waitFor('body result available',()=>evaluate(`!!document.querySelector('select[aria-label="Resultado del saliente"]') && !document.querySelector('select[aria-label="Resultado del saliente"]').disabled`));
        await change('select[aria-label="Resultado del saliente"]','merge');
        await waitFor('body picker available',()=>evaluate(`document.querySelectorAll('.body-operation-panel input[type="checkbox"]').length===1 && !document.querySelector('.body-operation-panel input[type="checkbox"]').disabled`));
        if(!await evaluate(`document.querySelector('.body-operation-panel input[type="checkbox"]').checked`)) await click('.body-operation-panel input[type="checkbox"]');
        await evaluate(`(() => { const b=[...document.querySelectorAll('.body-operation-panel button')].find(b=>b.textContent.includes('Ver vista previa')); if(!b||b.disabled)throw Error('Preview control unavailable'); b.click(); })()`);
      }
      await ready(); if(i===0)await retainedCutMenu(); serial=(await observe()).serial; await click(APPLY);
      await waitFor('operation committed to feature tree',()=>evaluate(`!document.querySelector('.property-manager')`));
      await built(serial,i+2,op.volume,op.height,'operation-'+(i+1));
    }
    serial=(await observe()).serial; await click('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial,4,976,7,'undo');
    serial=(await observe()).serial; await click('button[title="Rehacer (Ctrl+Y)"]');
    const final=await built(serial,5,984,9,'redo');
    await menu('Guardar como…');
    await waitFor('native Save and clean title',async()=>dialogCounts().saves===1 && ipc.some(e=>e.channel==='document:save'&&e.completed)
      && await evaluate(`!document.querySelector('.document-title')?.textContent.includes('*')`));
    const saved=JSON.parse(await fsp.readFile(output,'utf8'));
    check(saved.id===expected.id && canonical(saved.features)===canonical(final.features),'Saved actual authored sequence.');
    serial=(await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened=await built(serial,5,984,9,'reopened');
    check(canonical(reopened.features)===canonical(saved.features),'Reopened actual saved sequence.');
    check(dialogCounts().opens===2&&dialogCounts().saves===1,'Owned original/save/reopen dialogs only.');
    check(!consoleErrors.length&&!failedRequests.length,'No renderer resource or console errors.');
    check(protocolResponses.some(p=>/kernel\.worker-[\w-]+\.js$/.test(p.url)&&p.status===200)
      && protocolResponses.some(p=>p.url.endsWith('.wasm')&&p.status===200),'Production worker and WASM observed.');
    checks.push({originalSha256:digest(await fsp.readFile(input)),savedSha256:digest(await fsp.readFile(output)),records,
      independentOracles:'Volumes960,944,928,976,984 mm3; bounds1e-6mm, volume1e-5mm3. Native area/BRep checks are separate.'});
    await capture(saved);
  };
};
