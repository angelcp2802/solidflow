'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Original analytical fixture, real top commands/left properties and worker.
// No application state or worker responses are supplied by this workflow.
module.exports = function partSequenceWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, menu, menuKey, pointer, asideWheel, capture,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]';
  const records = [];
  const partToAssembly = require('./desktop-part-to-assembly-flow.cjs')(context);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + quote(JSON.stringify(v)) + ')').join(',') + ')');
  const initialLayout = (phase, profileId, locked) => require('./desktop-part-extrude-layout.cjs')({ page, recovery, check, records }, phase, { profileId, locked });
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
  function geometry(record, volume, height, width = 20) {
    check(record.response.ok, record.response.error || 'Native build failed.');
    const value = record.response.value;
    check(value.featureErrors.length === 0 && value.bodyCatalogActive && value.bodies.length === 1, 'Expected one healthy explicit body.');
    const body = value.bodies[0];
    check(body.ref.bodyId === 'seq-body' && Math.abs(body.volume - volume) <= 1e-5, 'Independent sequential volume/identity.');
    [[body.bounds.min, [-width/2,-6,0]], [body.bounds.max, [width/2,6,height]]].forEach(([actual,wanted]) =>
      wanted.forEach((x,i) => check(Math.abs(actual[i]-x) <= 1e-6, 'Independent sequential bounds.')));
  }
  async function built(serial, operationCount, volume, height, phase, width = 20) {
    const record = await waitFor('native sequence ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Worker observation error.');
      return state.builds.filter(r=>r.serial>serial && r.features.some(f=>f.id==='seq-base')
        && r.features.filter(f=>f.type==='extrude'||f.type==='cut').length===operationCount
        && r.response?.ok && r.response.value.featureErrors.length===0
        && r.response.value.bodies?.length===1 && Math.abs(r.response.value.bodies[0].volume-volume)<=1e-5).at(-1);
    }).catch(async error => { error.message += '; diagnostics=' + JSON.stringify(await observe()); throw error; });
    geometry(record,volume,height,width); records.push({phase,serial:record.serial,volume,bounds:record.response.value.bodies[0].bounds}); return record;
  }
  async function ready() {
    await waitFor('current operation can Apply',()=>evaluate(`!!document.querySelector(${quote(APPLY)}) && !document.querySelector(${quote(APPLY)}).disabled`));
  }
  const recovery = () => evaluate(`localStorage.getItem('solidflow.autosave')`);
  const inspectPanelTarget = selector => page(selector => {
    const panel = document.querySelector('.property-manager.property-manager-extrude'), matches = panel?.querySelectorAll(selector);
    if (!panel || matches.length !== 1) throw Error('One current property target required: ' + selector);
    const element = matches[0], r = element.getBoundingClientRect(), p = panel.getBoundingClientRect(), h = panel.querySelector('.property-manager-header').getBoundingClientRect();
    const top = Math.max(0, p.top + panel.clientTop, h.bottom), bottom = Math.min(innerHeight, p.top + panel.clientTop + panel.clientHeight);
    const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, hit = document.elementFromPoint(point.x, point.y);
    return { point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, scrollTop: panel.scrollTop,
      visible: r.width > 0 && r.height > 0 && r.left >= p.left && r.right <= p.left + panel.clientWidth && r.top >= top && r.bottom <= bottom
        && !!hit && (hit === element || element.contains(hit)), disabled: element.matches(':disabled'), text: element.textContent.trim(),
      delta: r.top < top ? -160 : 160, wheelPoint: { x: p.left + 4, y: (top + bottom) / 2 } };
  }, selector);
  async function revealPanelTarget(selector) {
    let previous = null, quietSince = 0;
    const stationary = () => waitFor('stationary property target ' + selector, async () => {
      const current = await inspectPanelTarget(selector), key = JSON.stringify(current);
      if (previous !== key) { previous = key; quietSince = Date.now(); return false; }
      return Date.now() - quietSince >= 120 ? current : false;
    });
    let state = await stationary();
    for (let step = 0; !state.visible && step < 16; step++) {
      const old = state.scrollTop;
      await asideWheel(state.wheelPoint, state.delta);
      await waitFor('property wheel movement', async () => { const next = await inspectPanelTarget(selector); return next.visible || next.scrollTop !== old; });
      state = await stationary();
    }
    check(state.visible, 'Property control or reason is fully contained and unobscured after normal panel wheel: ' + JSON.stringify({ selector, state }));
    records.push({ phase: 'property-wheel-reveal', selector, ...state }); return state;
  }
  async function pressPanelTarget(selector) {
    const state = await revealPanelTarget(selector); check(!state.disabled, 'Property target is enabled');
    await pointer('mouseMoved', state.point);
    const current = await inspectPanelTarget(selector);
    check(current.visible && !current.disabled && canonical(current.point) === canonical(state.point) && current.scrollTop === state.scrollTop,
      'Property target remains stable before the actual pointer press');
    await pointer('mousePressed', current.point, 1); await pointer('mouseReleased', current.point, 0);
  }
  async function blockedBodyReason(kind, beforeRecovery) {
    const wanted = kind === 'cut' ? 'Selecciona al menos un cuerpo que quieras cortar.' : 'Selecciona un cuerpo límite para calcular hasta dónde llega la extrusión.';
    const status = '.body-operation-panel [role="status"]';
    await waitFor('explicit body selection rejection ' + kind, () => page((kind, wanted) => {
      const panel = document.querySelector('.property-manager.property-manager-extrude'), apply = panel?.querySelector('button[title="Aceptar operación"]');
      return apply?.disabled && panel.querySelector('.body-operation-panel [role="status"]')?.textContent === wanted
        && (kind === 'cut' ? panel.querySelectorAll('.body-operation-panel input[type="checkbox"]:checked').length === 0
          : panel.querySelector('[aria-label="Cuerpo límite de la extrusión"]')?.value === '');
    }, kind, wanted));
    if (kind !== 'cut') await revealPanelTarget('[aria-label="Cuerpo límite de la extrusión"]');
    const shown = await revealPanelTarget(status);
    check(shown.text === wanted && await recovery() === beforeRecovery, 'Actionable rejection is visible and preserves committed recovery');
    records.push({ phase: 'blocked-body-selection', kind, reason: shown.text, applyDisabled: true, recoveryUnchanged: true });
  }
  const contextSelector = id => '.tree-row[data-feature-id="'+id+'"]';
  async function actualTreePress(selector, button = 1) {
    await evaluate(`(() => {const matches=document.querySelectorAll(${quote(selector)});
      if(matches.length!==1)throw Error('One tree pointer target required');
      matches[0].scrollIntoView({block:'nearest',inline:'nearest'});})()`);
    const inspect=()=>evaluate(`(() => {const matches=document.querySelectorAll(${quote(selector)});
      if(matches.length!==1)throw Error('One tree pointer target required');const target=matches[0],r=target.getBoundingClientRect();
      const point={x:r.left+r.width/2,y:r.top+r.height/2},hit=document.elementFromPoint(point.x,point.y);
      let scroll=target.parentElement;while(scroll){const style=getComputedStyle(scroll);
        if(/auto|scroll/.test(style.overflowY+' '+style.overflowX)&&(scroll.scrollHeight>scroll.clientHeight||scroll.scrollWidth>scroll.clientWidth))break;
        scroll=scroll.parentElement;}
      const sr=scroll?.getBoundingClientRect(),rect=box=>box?{left:box.left,top:box.top,width:box.width,height:box.height}:null;
      return {point,rect:rect(r),viewport:{width:innerWidth,height:innerHeight},nearestScrollRect:rect(sr),scrollTop:scroll?.scrollTop??null,
        hit:hit?{tag:hit.tagName,class:typeof hit.className==='string'?hit.className:hit.getAttribute('class')}:null,
        visible:!target.closest('[hidden]')&&!target.disabled&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight
          &&(!sr||(r.left>=sr.left&&r.top>=sr.top&&r.right<=sr.right&&r.bottom<=sr.bottom))&&!!hit&&(hit===target||target.contains(hit))};})()`);
    let previous=null,stableSince=0;
    const state=await waitFor('stationary tree pointer target '+selector,async()=>{
      const current=await inspect(),key=JSON.stringify(current);
      if(key!==previous){previous=key;stableSince=Date.now();return false;}
      return current.visible&&Date.now()-stableSince>=120?current:false;
    }).catch(async error=>{error.message+='; treeTarget='+JSON.stringify(await inspect().catch(reason=>({error:reason.message})));throw error;});
    await pointer('mouseMoved',state.point);
    check(canonical(await inspect())===canonical(state),'Tree target remains visible and stationary immediately before the actual press');
    await pointer('mousePressed',state.point,button);
    await pointer('mouseReleased',state.point,button===2?2:0);
  }
  async function contextOpen(id, keyboard) {
    const selector=contextSelector(id);
    if(keyboard) {
      await evaluate(`(() => { const rows=document.querySelectorAll(${quote(selector)});
        if(rows.length!==1||rows[0].closest('[hidden]'))throw Error('One visible context row required');
        const r=rows[0].getBoundingClientRect();if(!r.width||!r.height)throw Error('Context row has no layout');rows[0].focus(); })()`);
      await menuKey('ContextMenu');
    } else await actualTreePress(selector,2);
    await waitFor('context menu focuses first edit action '+id,()=>evaluate(`(() => {
      const popup=document.querySelector('.part-feature-context-menu');return !!popup
        &&popup.contains(document.activeElement)&&document.activeElement?.getAttribute('data-part-context-action')==='edit-feature'
        &&!document.activeElement.disabled;
    })()`));
    records.push({phase:'context-menu-open',featureId:id,input:keyboard?'CDP ContextMenu after row focus':'CDP right press/release'});
  }
  async function treeNavigation() {
    const parent='.tree-row[data-feature-id="seq-base"]',toggle='button[data-part-tree-toggle="seq-base"]';
    const child='.tree-row[data-feature-id="seq-base-sketch"][data-parent-feature-id="seq-base"]';
    const state=()=>evaluate(`(() => {const parent=document.querySelector(${quote(parent)}),toggle=document.querySelector(${quote(toggle)}),children=[...document.querySelectorAll(${quote(child)})];
      const group=document.getElementById(toggle?.getAttribute('aria-controls')??'');
      return {expanded:toggle?.getAttribute('aria-expanded'),childCount:children.length,childSelected:children.length===1&&children[0].classList.contains('selected'),
        controlledGroup:!!group,groupHidden:group?.hidden,
        parentSelected:!!parent?.classList.contains('selected'),focus:document.activeElement===parent?'parent':children.includes(document.activeElement)?'child':'other'};})()`);
    const beforeRecovery=await recovery(),beforeSerial=(await observe()).serial;
    await waitFor('Base disclosure initially collapsed',async()=>{const current=await state();return current.expanded==='false'&&current.childCount===0&&current.controlledGroup&&current.groupHidden;});
    await actualTreePress(toggle);
    await waitFor('Base disclosure exposes its nested profile',async()=>{const current=await state();return current.expanded==='true'&&current.childCount===1&&current.controlledGroup&&!current.groupHidden;});
    await actualTreePress(child);
    await waitFor('actual child row click selects Base profile',async()=>{const current=await state();return current.childSelected&&!current.parentSelected;});
    await actualTreePress(toggle);
    await waitFor('collapse unmounts nested profile without selecting parent',async()=>{const current=await state();return current.expanded==='false'&&current.childCount===0&&!current.parentSelected;});
    check(await recovery()===beforeRecovery&&(await observe()).serial===beforeSerial,'Disclosure collapse preserves document recovery and native build serial');
    await actualTreePress(toggle);
    await waitFor('expansion restores the selected nested profile',async()=>{const current=await state();return current.expanded==='true'&&current.childCount===1&&current.childSelected&&!current.parentSelected;});
    await actualTreePress(toggle);
    await waitFor('Base closed before keyboard navigation',async()=>{const current=await state();return current.expanded==='false'&&current.childCount===0;});
    await evaluate(`document.querySelector(${quote(parent)}).focus()`);
    await menuKey('ArrowRight');
    await waitFor('first Right expands while preserving parent focus and child selection',async()=>{const current=await state();return current.expanded==='true'&&current.childCount===1&&current.focus==='parent'&&current.childSelected&&!current.parentSelected;});
    await menuKey('ArrowRight');
    await waitFor('second Right focuses selected child',async()=>{const current=await state();return current.focus==='child'&&current.childSelected&&!current.parentSelected;});
    await menuKey('ArrowLeft');
    await waitFor('child Left returns parent focus without selecting parent',async()=>{const current=await state();return current.focus==='parent'&&current.childSelected&&!current.parentSelected;});
    await menuKey('ArrowLeft');
    await waitFor('parent Left closes without changing selection',async()=>{const current=await state();return current.focus==='parent'&&current.expanded==='false'&&current.childCount===0&&!current.parentSelected;});
    await change('input[aria-label="Filtro del árbol"]','Base profile');
    await waitFor('filter reveals matching child while retaining selection',async()=>{const current=await state();return current.expanded==='true'&&current.childCount===1&&current.childSelected&&!current.parentSelected;});
    await change('input[aria-label="Filtro del árbol"]','');
    await waitFor('clearing filter restores closed disclosure',async()=>{const current=await state();return current.expanded==='false'&&current.childCount===0&&!current.parentSelected;});
    check(await recovery()===beforeRecovery&&(await observe()).serial===beforeSerial,'Pointer, keyboard and filter navigation preserve committed recovery and native geometry');
    records.push({phase:'feature-tree-navigation',pointer:'CDP disclosure and child-row presses',keys:['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft'],filter:'scripted visible input',selectionRetained:true,queryDoesNotPersistExpansion:true,serial:beforeSerial});
  }
  async function savedUnusedCancel() {
    const id='seq-cut-left-sketch',originalRecovery=await recovery();
    await contextOpen(id,true);await menuKey('Enter');await ready();
    await change('input[aria-label="Anchura"]',3);await ready();
    const before=(await observe()).builds.at(-1),draft=before.features.find(feature=>feature.id===id);
    check(draft?.type==='sketch'&&draft.profile.width===3,'Saved unused sketch accepts the original width edit in its draft');
    const draftFeatures=canonical(before.features);
    await evaluate(`(() => {const button=[...document.querySelectorAll('.ribbon-tabs button')].find(e=>e.textContent.trim()==='Operaciones');if(!button)throw Error('Operations tab unavailable');button.click();})()`);
    await click('button.command[title="Corte extruido"]');
    await waitFor('saved unused sketch starts direct cut',()=>evaluate(`!!document.querySelector('input[aria-label="Profundidad"]')`));
    await initialLayout('saved-unused-cut-cancel', id, true);
    await change('input[aria-label="Profundidad"]',4);await ready();
    check(await evaluate(`(() => {const selector=document.querySelector('select[aria-label="Croquis de la operación"]');return selector?.disabled&&selector.value==='seq-cut-left-sketch';})()`),
      'Saved unused direct cut locks the original sketch identity');
    check(await recovery()===originalRecovery,'Saved unused sketch and cut previews preserve committed recovery');
    await pressPanelTarget('.body-operation-panel input[type="checkbox"]');
    await blockedBodyReason('cut', originalRecovery);
    let serial=(await observe()).serial;await click('button[title="Cancelar operación"]');
    await waitFor('saved unused cut Cancel resumes width-three sketch',()=>evaluate(`document.querySelector('input[aria-label="Anchura"]')?.value==='3'
      &&document.querySelector('.ribbon-tabs .selected')?.textContent.trim()==='Croquis'`));
    await ready();const restored=await built(serial,1,960,4,'saved-unused-cancel-cut');
    check(canonical(restored.features)===draftFeatures,'Cut Cancel restores the exact saved sketch draft, IDs and feature order');
    check(await recovery()===originalRecovery,'Cut Cancel leaves original saved sketch recovery untouched');
    serial=(await observe()).serial;await click('button[title="Cancelar operación"]');
    await waitFor('saved sketch Cancel exits editing',()=>evaluate(`!document.querySelector('.property-manager')`));
    const cancelled=await built(serial,1,960,4,'saved-unused-cancel-sketch');
    check(canonical(cancelled.features)===canonical(expected.features),'Sketch Cancel restores width two and the exact original IDs/order');
    check(await recovery()===originalRecovery,'Cancelling both drafts leaves the original recovery unchanged');

    await contextOpen(id,true);await menuKey('Enter');await ready();
    await change('input[aria-label="Anchura"]',3);await ready();
    await evaluate(`(() => {const button=[...document.querySelectorAll('.ribbon-tabs button')].find(e=>e.textContent.trim()==='Operaciones');if(!button)throw Error('Operations tab unavailable');button.click();})()`);
    await waitFor('saved unused acceptance route exposes direct cut',()=>evaluate(`document.querySelector('.ribbon-tabs .selected')?.textContent.trim()==='Operaciones'
      &&!!document.querySelector('button.command[title="Corte extruido"]')&&!document.querySelector('button.command[title="Corte extruido"]').disabled`));
    await click('button.command[title="Corte extruido"]');
    await waitFor('saved unused acceptance cut properties',()=>evaluate(`!!document.querySelector('input[aria-label="Profundidad"]')`));
    await initialLayout('saved-unused-cut-accept', id, true);
    await change('input[aria-label="Profundidad"]',4);await ready();
    serial=(await observe()).serial;await click(APPLY);
    await waitFor('saved unused direct cut committed',()=>evaluate(`!document.querySelector('.property-manager')`));
    const accepted=await built(serial,2,936,4,'saved-unused-accepted');
    const editedFeatures=structuredClone(expected.features);editedFeatures.find(feature=>feature.id===id).profile.width=3;
    const cut=accepted.features.at(-1);
    check(canonical(accepted.features.slice(0,-1))===canonical(editedFeatures)
      &&accepted.features.filter(feature=>feature.id===id).length===1
      &&cut.type==='cut'&&cut.sketchId===id&&cut.depth===4&&!cut.symmetric
      &&cut.bodyScope?.length===1&&cut.bodyScope[0].bodyId==='seq-body'&&cut.bodyScope[0].sourceFeatureId==='seq-base',
      'Saved unused Apply updates the original sketch in order and appends one exact scoped cut');
    serial=(await observe()).serial;await click('button[title="Deshacer (Ctrl+Z)"]');
    const undoCut=await built(serial,1,960,4,'saved-unused-undo-cut');
    check(canonical(undoCut.features)===canonical(editedFeatures),'First Undo removes only the new cut and retains saved sketch width three');
    serial=(await observe()).serial;await click('button[title="Deshacer (Ctrl+Z)"]');
    const undoEdit=await built(serial,1,960,4,'saved-unused-undo-edit');
    check(canonical(undoEdit.features)===canonical(expected.features),'Second Undo restores original saved sketch width two and exact feature order');
    serial=(await observe()).serial;await click('button[title="Rehacer (Ctrl+Y)"]');
    const redoEdit=await built(serial,1,960,4,'saved-unused-redo-edit');
    check(canonical(redoEdit.features)===canonical(editedFeatures),'First Redo restores only saved sketch width three');
    serial=(await observe()).serial;await click('button[title="Rehacer (Ctrl+Y)"]');
    const redoCut=await built(serial,2,936,4,'saved-unused-redo-cut');
    check(canonical(redoCut.features)===canonical(accepted.features),'Second Redo restores the exact accepted cut and updated sketch');
    serial=(await observe()).serial;await click('button[title="Deshacer (Ctrl+Z)"]');
    const resetCut=await built(serial,1,960,4,'saved-unused-reset-cut');
    check(canonical(resetCut.features)===canonical(editedFeatures),'Reset Undo retains the exact edited saved sketch');
    serial=(await observe()).serial;await click('button[title="Deshacer (Ctrl+Z)"]');
    const resetEdit=await built(serial,1,960,4,'saved-unused-reset-edit');
    check(canonical(resetEdit.features)===canonical(expected.features),'Two final Undos restore the exact original document before the existing sequence');
  }
  async function consumedSketchEdit(final) {
    const beforeRecovery=await recovery(),beforeSerial=(await observe()).serial;
    await contextOpen('seq-base',false);await menuKey('Escape');
    await waitFor('context Escape closes and restores Base row focus',()=>evaluate(`!document.querySelector('.part-feature-context-menu')
      &&document.activeElement===document.querySelector('.tree-row[data-feature-id="seq-base"]')`));
    check(await recovery()===beforeRecovery&&(await observe()).serial===beforeSerial,'Context Escape restores focus without document changes or rebuilding');
    await contextOpen('seq-base',false);await menuKey('ArrowDown');
    await waitFor('context Down chooses explicit Base profile edit',()=>evaluate(`document.activeElement?.getAttribute('data-part-context-action')==='edit-sketch-seq-base-sketch'&&!document.activeElement.disabled`));
    await menuKey('Enter');await ready();
    check(await evaluate(`document.querySelector('input[aria-label="Anchura"]')?.value==='20'`),'Consumed Base profile opens through its operation context');
    await change('input[aria-label="Anchura"]',22);await ready();
    await evaluate(`(() => {const button=[...document.querySelectorAll('.ribbon-tabs button')].find(e=>e.textContent.trim()==='Operaciones');if(!button)throw Error('Operations tab unavailable');button.click();})()`);
    const solidCommands=()=>evaluate(`(() => {const titles=['Saliente/Base extruido','Corte extruido','Revolución'];return {
      tab:document.querySelector('.ribbon-tabs .selected')?.textContent.trim(),
      commands:[...document.querySelectorAll('button.command')].filter(e=>titles.includes(e.querySelector('span')?.textContent.trim()))
        .map(e=>({title:e.querySelector('span').textContent.trim(),tooltip:e.title,disabled:e.disabled}))};})()`);
    const commandState=await waitFor('consumed sketch operation tab and solid commands mounted',async()=>{
      const state=await solidCommands();return state.tab==='Operaciones'&&state.commands.length===3
        &&['Saliente/Base extruido','Corte extruido','Revolución'].every(title=>state.commands.filter(command=>command.title===title).length===1)?state:false;
    });
    check(commandState.commands.every(command=>command.disabled),
      'Consumed sketch editing keeps all solid-start commands disabled; observed='+JSON.stringify(commandState));
    check(await recovery()===beforeRecovery,'Editing a consumed sketch does not prematurely alter committed recovery');
    let serial=(await observe()).serial;await click(APPLY);
    await waitFor('consumed sketch accepted',()=>evaluate(`!document.querySelector('.property-manager')`));
    await waitFor('context sketch edit reveals its owner and selects the nested profile on return',()=>evaluate(`document.querySelector('button[data-part-tree-toggle="seq-base"]')?.getAttribute('aria-expanded')==='true'
      &&document.querySelectorAll('.tree-row[data-feature-id="seq-base-sketch"][data-parent-feature-id="seq-base"].selected').length===1
      &&!document.querySelector('.tree-row[data-feature-id="seq-base"]')?.classList.contains('selected')`));
    const changed=await built(serial,5,1080,9,'consumed-sketch-rebuilt',22);
    const expectedFeatures=structuredClone(final.features);expectedFeatures.find(feature=>feature.id==='seq-base-sketch').profile.width=22;
    check(canonical(changed.features)===canonical(expectedFeatures),'Consumed sketch edit preserves all five solid operations, IDs, order and downstream references');
    serial=(await observe()).serial;await click('button[title="Deshacer (Ctrl+Z)"]');
    const undone=await built(serial,5,984,9,'undo-consumed-sketch');
    check(canonical(undone.features)===canonical(final.features),'Undo restores the exact prior sketch and complete downstream history');
    serial=(await observe()).serial;await click('button[title="Rehacer (Ctrl+Y)"]');
    const redone=await built(serial,5,1080,9,'redo-consumed-sketch',22);
    check(canonical(redone.features)===canonical(changed.features),'Redo restores the exact widened sketch and complete downstream history');
    return redone;
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
    await open('file');
    await partToAssembly.draftGuard();
    await menuKey('Tab');
    await waitFor('part menu Tab reaches quick actions in shared header',()=>evaluate(`!document.querySelector('.part-main-menus [role="menu"]')&&!!document.activeElement?.closest('.command-header .quick-actions')`));
    check(canonical(await snapshot())===canonical(original)&&(await observe()).serial===before.serial,'Menu navigation preserves the cut draft without another native build');
    records.push({phase:'live-cut-menu-keyboard',keys:['ArrowDown','Escape','Escape','Tab'],draftRetained:true,insertGuards:true,serial:before.serial});
  }
  return async () => {
    await waitFor('part file control ready',()=>evaluate(`document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument==='function' && !!document.querySelector('button[aria-label="Abrir (Ctrl+O)"]')`),initialReadyMs);
    let serial=(await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('owned initial document replacement prompt',()=>evaluate(`!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')`));
    await evaluate(`(() => { const b=document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button'); if(!b||b.disabled||b.textContent.trim()!=='Continuar sin guardar')throw Error('Expected owned initial replacement'); b.click(); })()`);
    await built(serial,1,960,4,'original');
    await require('./desktop-command-header-layout.cjs')({page,check,checks}, 'part-sequence-initial-before-reveal', 'part');
    await require('./desktop-part-selection-controls.cjs')(context);
    await treeNavigation();
    await savedUnusedCancel();
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
      await initialLayout('sequence-' + op.type + '-' + i, expected.features.find(feature => feature.name === op.sketch).id, false);
      if(op.type==='cut') {
        await waitFor('sole current cut body preselected',()=>evaluate(`document.querySelectorAll('.body-operation-panel input[type="checkbox"]:checked').length===1`));
      }
      await change('input[aria-label="Profundidad"]',op.depth);
      if(op.type==='extrude') {
        await waitFor('body result available',()=>evaluate(`!!document.querySelector('select[aria-label="Resultado del saliente"]') && !document.querySelector('select[aria-label="Resultado del saliente"]').disabled`));
        if (i === 2) {
          const saved = await recovery();
          await change('select[aria-label="Resultado del saliente"]', 'new');
          for (const mode of ['throughAll', 'untilNext']) {
            await revealPanelTarget('[aria-label="Condición final"]');
            await change('select[aria-label="Condición final"]', mode);
            await blockedBodyReason(mode, saved);
          }
          await revealPanelTarget('[aria-label="Condición final"]');
          await change('select[aria-label="Condición final"]', 'blind');
        }
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
    const originalFinal=await built(serial,5,984,9,'redo');
    const final=await consumedSketchEdit(originalFinal);
    await menu('Guardar como…');
    await waitFor('native Save and clean title',async()=>dialogCounts().saves===1 && ipc.some(e=>e.channel==='document:save'&&e.completed)
      && await evaluate(`!document.querySelector('.document-title')?.textContent.includes('*')`));
    const saved=JSON.parse(await fsp.readFile(output,'utf8'));
    check(saved.id===expected.id && canonical(saved.features)===canonical(final.features),'Saved actual authored sequence.');
    serial=(await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened=await built(serial,5,1080,9,'reopened',22);
    check(canonical(reopened.features)===canonical(saved.features),'Reopened actual saved sequence.');
    check(dialogCounts().opens===2&&dialogCounts().saves===1,'Owned original/save/reopen dialogs only.');
    check(!consoleErrors.length&&!failedRequests.length,'No renderer resource or console errors.');
    check(protocolResponses.some(p=>/kernel\.worker-[\w-]+\.js$/.test(p.url)&&p.status===200)
      && protocolResponses.some(p=>p.url.endsWith('.wasm')&&p.status===200),'Production worker and WASM observed.');
    checks.push({originalSha256:digest(await fsp.readFile(input)),savedSha256:digest(await fsp.readFile(output)),records,
      independentOracles:'Volumes 960,944,928,976,984 mm3; saved unused width-three cut removes 3*2*4=24 mm3, leaving 936 mm3. Widening the base from 20 to 22 mm adds 2*12*4=96 mm3, giving 1080 mm3 with X bounds ±11 mm. Bounds 1e-6 mm, volume 1e-5 mm3. Native area/BRep checks are separate.'});
    await capture(saved);
    await partToAssembly.run(saved);
    check(!consoleErrors.length && !failedRequests.length && protocolResponses.every(value => value.status >= 200 && value.status < 400),
      'Part-to-assembly continuation has no renderer, request or production resource errors');
  };
};
