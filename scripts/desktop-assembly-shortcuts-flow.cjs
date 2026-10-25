'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Reuse the original 2x3x4 prism bearing. No injected model or keyboard handler.
module.exports = function assemblyShortcutWorkflow(context) {
  const c = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const { configured, expected, input, output, shortcutOutput, shortcutKey, shortcutText, evaluate, observe, waitFor, pointer, capture,
    check, checks, canonical, digest, ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs } = c;
  const ROOT = configured ? '.configured-assembly-workspace' : '.assembly-app';
  const NAV = configured ? '[aria-label="Comandos del ensamblaje configurado"]' : '.assembly-toolbar';
  const serial = async () => (await observe.counters()).serial;
  const BUILD = configured ? 'build-configured-assembly' : 'build-assembly';
  const gestures = [], phases = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = configured ? require('./desktop-configured-navigation.cjs')({ page, waitFor, actualControl, pointer }) : c.assemblyNavigation;
  async function actualControl(selector, text = null) {
    await navigation.reveal(selector, text ?? '');
    await waitFor('enabled command ' + (text || selector), () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      return rows.length === 1 && !rows[0].disabled && !rows[0].closest('[hidden]') && rows[0].getClientRects().length > 0;
    }, selector, text));
    // The manager's real tab handler schedules focus/scroll in requestAnimationFrame.
    // Let that reveal settle before scrolling this specific command into view.
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One visible enabled command required: ' + selector);
      rows[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    const inspect = () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text), e = rows[0], r = e?.getBoundingClientRect();
      const x = r?.left + r?.width / 2, y = r?.top + r?.height / 2;
      const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, scrollOwners = [];
      for (let parent = e?.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX + ' ' + style.overflowY)) scrollOwners.push({
          tag: parent.tagName, id: parent.id, className: parent.className, scrollTop: parent.scrollTop, scrollLeft: parent.scrollLeft,
          clientHeight: parent.clientHeight, scrollHeight: parent.scrollHeight, clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth });
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { clip.left = Math.max(clip.left, rect.left + parent.clientLeft); clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { clip.top = Math.max(clip.top, rect.top + parent.clientTop); clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight); }
      }
      return { count: rows.length, enabled: !!e && !e.disabled, visible: !!e && !e.closest('[hidden]') && !!r.width && !!r.height,
        rect: r ? [r.x, r.y, r.width, r.height] : null, clip, scrollOwners, contained: !!r && r.left >= clip.left && r.top >= clip.top && r.right <= clip.right && r.bottom <= clip.bottom, x, y,
        hit: !!e && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && e.contains(document.elementFromPoint(x, y)) };
    }, selector, text);
    let previous = '', since = 0;
    const target = await waitFor('stationary hit-tested command ' + (text || selector), async () => {
      const value = await inspect(), key = JSON.stringify(value);
      if (key !== previous) { previous = key; since = Date.now(); }
      return value.count === 1 && value.enabled && value.visible && value.contained && value.hit && Date.now() - since >= 120 ? value : false;
    }).catch(async error => { error.message += '; control=' + JSON.stringify(await inspect()); throw error; });
    await pointer('mouseMoved', { x: target.x, y: target.y });
    check(canonical(await inspect()) === canonical(target), 'Command geometry and hit remain current before pointer press');
    await pointer('mousePressed', { x: target.x, y: target.y }, 1); await pointer('mouseReleased', { x: target.x, y: target.y }, 0);
    gestures.push({ selector, text, point: [target.x, target.y] });
  }
  const button = (text, parent = NAV) => actualControl(parent + ' button', text);
  const aria = label => actualControl('button[aria-label="' + label + '"]');
  async function response(after, action) {
    return waitFor('native ' + action, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Worker transport healthy');
      const rows = state.assemblies.filter(row => row.serial > after && row.action === action && row.response);
      check(rows.length <= 1, 'Exactly one requested response for ' + action); if (!rows.length) return false;
      check(rows[0].response.ok, rows[0].response.error || 'Native response succeeds'); return rows[0];
    });
  }
  async function recovery(doc) {
    await waitFor('exact idle committed recovery', () => page(root => {
      const raw = localStorage.getItem('solidflow.autosave');
      return raw && document.querySelector(root)?.getAttribute('aria-busy') === 'false' ? JSON.parse(raw) : null;
    }, ROOT).then(actual => actual && canonical(actual) === canonical(doc)));
  }

  const key = async combo => { await shortcutKey(combo); gestures.push({ key: combo, transport: 'CDP physical down/up' }); await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  const outside = () => actualControl(ROOT + ' button[title="Isométrica"]');
  const snapshot = async () => ({ native: await observe(), recovery: await page(() => localStorage.getItem('solidflow.autosave')), dialogs: dialogCounts(), ipc: structuredClone(ipc) });
  const stable = async (before, label) => check(canonical(await snapshot()) === canonical(before), label);
  const modalAuthority = () => page(() => {
    const selectors={save:'.assembly-quickbar button[title="Guardar"]',apply:'button[aria-label="Aplicar ensamblaje"]',step:'button[aria-label="Exportar STEP plano del ensamblaje"]',stl:'button[aria-label="Exportar STL del ensamblaje"]'};
    const controls={};for(const [key,selector] of Object.entries(selectors)){const rows=document.querySelectorAll(selector);if(rows.length!==1)throw Error('One modal authority control required: '+key);controls[key]=rows[0].disabled;}
    return {controls,busy:document.querySelector('.assembly-app')?.getAttribute('aria-busy'),dialog:!!document.querySelector('[role="dialog"]')};
  });
  async function modalStable(before, opened, after, authorityBefore, authorityOpened, authorityAfter, command) {
    const nativeCore = state => {const {eventSerial,assemblyUi,...rest}=state;return rest;};
    const prefix=before.native.assemblyUi,last=prefix.at(-1),suffix=after.native.assemblyUi.slice(prefix.length);
    const expectedSuffix=last?[
      {...last,eventSerial:before.native.eventSerial+1,stepExportDisabled:true,stlExportDisabled:true},
      {...last,eventSerial:before.native.eventSerial+2}]:[];
    const exactCore = state => canonical(nativeCore(state.native))===canonical(nativeCore(before.native))
      && state.recovery===before.recovery&&canonical(state.dialogs)===canonical(before.dialogs)&&canonical(state.ipc)===canonical(before.ipc);
    const baselineValid=!!last&&prefix.length>0&&prefix.length<510&&last.applyDisabled===true&&last.saveDisabled===false
      &&last.busy===false&&last.stepExportDisabled===false&&last.stlExportDisabled===false;
    const prefixEqual=canonical(after.native.assemblyUi.slice(0,prefix.length))===canonical(prefix);
    const openedExact=canonical(opened.native.assemblyUi)===canonical([...prefix,expectedSuffix[0]])&&opened.native.eventSerial===before.native.eventSerial+1;
    const restoredExact=canonical(suffix)===canonical(expectedSuffix)&&after.native.eventSerial===before.native.eventSerial+2;
    const authorityExact=authorityBefore.busy==='false'&&!authorityBefore.dialog&&authorityBefore.controls.save===false&&authorityBefore.controls.apply===true
      &&authorityBefore.controls.step===false&&authorityBefore.controls.stl===false
      &&canonical(authorityOpened)===canonical({...authorityBefore,dialog:true,controls:{...authorityBefore.controls,step:true,stl:true}})
      &&canonical(authorityAfter)===canonical(authorityBefore);
    const audit={command,baselineValid,prefixEqual,openedExact,restoredExact,authorityExact,workerAndRecoveryExact:exactCore(opened)&&exactCore(after),
      beforeEventSerial:before.native.eventSerial,afterEventSerial:after.native.eventSerial,beforeLength:prefix.length,afterLength:after.native.assemblyUi.length,
      suffix,expectedSuffix,authorityBefore,authorityOpened,authorityAfter};
    const valid=baselineValid&&prefixEqual&&openedExact&&restoredExact&&authorityExact&&audit.workerAndRecoveryExact;
    if(!valid) audit.difference={changedNativeKeys:Object.keys(before.native).filter(k=>canonical(before.native[k])!==canonical(after.native[k])),
      beforeTail:prefix.slice(-2),openedTail:opened.native.assemblyUi.slice(-3),afterTail:after.native.assemblyUi.slice(-4),
      beforeSerial:before.native.serial,afterSerial:after.native.serial,recoveryBeforeSha256:digest(before.recovery),recoveryAfterSha256:digest(after.recovery),
      dialogsBefore:before.dialogs,dialogsAfter:after.dialogs,ipcBefore:before.ipc,ipcAfter:after.ipc};
    checks.push({keyboardModalAudit:audit});
    check(valid,'Modal preserves complete worker history/recovery/IPC and exact export-disable/restore presentation: '+JSON.stringify(audit));
  }
  const currentDocument = () => page(() => JSON.parse(localStorage.getItem('solidflow.autosave')));
  function geometry(wrapper, label) {
    const scene = configured ? wrapper.scene : wrapper;
    check(scene.solidCount === 2 && scene.bodies.length === 2 && Math.abs(scene.volume - 48) < 1e-5 && Math.abs(scene.area - 104) < 1e-5, 'Original two-prism V48/A104: ' + label);
    for (const id of ['ground', 'moving']) {
      const body = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(body.length === 1, 'Exact original occurrence ' + id);
      const expectedBounds = id === 'ground' ? [[-15,0,0],[-13,3,4]] : [[-1.5,0,6],[Math.sqrt(3),1+1.5*Math.sqrt(3),10]];
      for (const [side,values] of [['min',expectedBounds[0]],['max',expectedBounds[1]]]) values.forEach((v,i) => check(Math.abs(body[0].bounds[side][i]-v)<1e-6,'Independent literal prism bounds: '+label));
    }
    phases.push({ label, volume: scene.volume, area: scene.area, solids: scene.solidCount });
  }
  async function saved(file, doc, count) {
    await waitFor('completed keyboard save and exact owned file', async () => {
      try { return ipc.filter(v=>v.channel==='document:save'&&v.completed).length === count
        && canonical(JSON.parse(await fs.readFile(file,'utf8'))) === canonical(doc)
        && await page(root=>document.querySelector(root)?.getAttribute('aria-busy')==='false'&&!document.querySelector(root+' header')?.textContent.includes('*'),ROOT); }
      catch(e){if(e.code==='ENOENT')return false;throw e;}
    });
  }
  async function nativeTextUndo(selector) {
    await actualControl(selector); const value=await page(s=>document.querySelector(s).value,selector), before=await snapshot();
    await key('A'); await shortcutText('native undo probe');
    await waitFor('actual keyboard text inserted',()=>page(s=>document.querySelector(s)?.value==='native undo probe',selector));
    await key('Z'); await waitFor('native input undo restores prior text without assembly undo',()=>page((s,v)=>document.querySelector(s)?.value===v,selector,value));
    await stable(before,'Native text undo leaves complete worker history, recovery and file requests unchanged');
    checks.push({ nativeTextUndo: { selector, originalValue:value, typed:'native undo probe', restored:value, inputRetainedFocus:await page(s=>document.activeElement===document.querySelector(s),selector) } });
  }
  return async () => {
    const originalBytes=await fs.readFile(input);
    await waitFor('startup document',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')),initialReadyMs);
    let before=await serial(); await key('O');
    await waitFor('initial replacement confirmation',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await actualControl('[role="dialog"][aria-labelledby="discard-title"] button','Continuar sin guardar');
    let row=await response(before,BUILD), current=configured?row.current.document:row.document;
    check(canonical(current)===canonical(expected),'Keyboard Open loads exact original owned document'); geometry(row.response.value,'opened'); await recovery(current);
    await outside(); await key('ShiftS'); await saved(output,current,1);
    if(!configured){
      await actualControl(`[data-assembly-tree-path='["moving"]']`);
      await nativeTextUndo('input[aria-label="Nombre del componente"]');
      const invalidBefore=await snapshot();await key('A');await key('Backspace');await key('S');
      await waitFor('invalid name is restored before Save',()=>page(()=>document.querySelector('input[aria-label="Nombre del componente"]')?.value==='moving'));
      await stable(invalidBefore,'Rejected blank name CtrlS neither saves nor changes CAD/history');
      await actualControl('input[aria-label="Nombre del componente"]');
      await key('A'); await shortcutText('Keyboard renamed');
      before=await serial(); await key('S'); row=await response(before,BUILD); current=row.document;
      const renamed=structuredClone(expected);renamed.occurrences[1].name='Keyboard renamed';renamed.updatedAt=current.updatedAt;
      check(canonical(current)===canonical(renamed),'CtrlS from focused name commits only current name before saving');geometry(row.response.value,'name-save');await recovery(current);await saved(output,current,2);
      await outside(); before=await serial(); await key('Z');row=await response(before,BUILD);
      check(canonical(row.document)===canonical(expected),'Outside-input Undo restores exact original document');geometry(row.response.value,'undo');await recovery(expected);
      before=await serial();await key('Y');row=await response(before,BUILD);check(canonical(row.document)===canonical(current),'Outside-input Redo restores exact renamed document');geometry(row.response.value,'redo');await recovery(current);
      const reselectBefore=await snapshot();
      await actualControl(`[data-assembly-tree-path='["moving"]']`);
      await stable(reselectBefore,'Reselecting moving after Redo changes no worker history, recovery or file requests');
      // A native text edit followed by pointer blur creates one dirty model step.
      await actualControl('input[aria-label="Nombre del componente"]');await key('A');await shortcutText('native undo probe');before=await serial();await outside();row=await response(before,BUILD);current=row.document;await recovery(current);
      for(const command of ['O','N']){
        const state=await snapshot(),authorityBefore=await modalAuthority();await key(command);await waitFor('dirty document confirmation',()=>page(()=>!!document.querySelector('[role="dialog"]')));
        await key('O');await key('S');const opened=await snapshot(),authorityOpened=await modalAuthority();
        await key('Escape');await waitFor('Escape closes only replacement dialog',()=>page(()=>!document.querySelector('[role="dialog"]')));
        await recovery(current);await modalStable(state,opened,await snapshot(),authorityBefore,authorityOpened,await modalAuthority(),command);
      }
      await key('S');await saved(output,current,3);
    } else {
      await actualControl('[aria-label="Comandos del ensamblaje configurado"] button[aria-controls="configured-relation-inspector"]');
      await nativeTextUndo('input[aria-label="Nombre de relación configurada"]');
      await outside();const state=await snapshot();for(const command of ['O','S','ShiftS','Z','Y'])await key(command);
      await stable(state,'Configured retained relation draft blocks file and history shortcuts');
      await aria('Cerrar relación');await recovery(current);await outside();await key('S');await saved(output,current,2);
    }
    await outside();await key('ShiftS');await saved(shortcutOutput,current,configured?3:4);
    // Cancelled native Open consumes only its own granted picker path.
    const openRecovery=await snapshot();await key('O');await waitFor('native picker cancellation completed',()=>ipc.filter(v=>v.channel==='document:open'&&v.completed).length===2);
    check(canonical(await currentDocument())===canonical(current)&&canonical((await observe()).assemblies)===canonical(openRecovery.native.assemblies),'Canceled Open preserves complete document and worker history');
    await recovery(current);
    before=await serial();await key('O');row=await response(before,BUILD);check(canonical(configured?row.current.document:row.document)===canonical(current),'Keyboard reopen retains exact saved document');geometry(row.response.value,'reopened');await recovery(current);
    // Camera shortcuts have no CAD/document authority. Standard projected origin labels additionally witness orientation.
    if(!configured){await actualControl('#assembly-origin-controls label:first-child input');}
    await outside();const cameraBefore=await snapshot();
    const labels=()=>page(()=>[...document.querySelectorAll('.assembly-origin-labels button[data-origin-key]')].filter(e=>e.getClientRects().length).map(e=>({key:e.dataset.originKey,left:e.style.left,top:e.style.top})));
    const iso=await labels();await key('1');if(iso.length)await waitFor('Front changes observed projected origin labels',async()=>canonical(await labels())!==canonical(iso));
    await key('5');await key('7');await key('F');await stable(cameraBefore,'Camera shortcuts preserve document, native history, recovery and file requests');
    checks.push({ keyboardCamera: { configured, projectedLabelsObserved:iso.length, keys:['1','5','7','F'], limits:iso.length?'Projection changed for Front; no new geometric solve.':'Only non-CAD invariant checked; no camera orientation oracle.' } });
    if(!configured){
      await aria('Seleccionar orígenes');await waitFor('origin picker armed',()=>page(()=>document.querySelector('[aria-label="Seleccionar orígenes"]')?.getAttribute('aria-pressed')==='true'));
      const state=await snapshot();await key('Escape');await waitFor('Escape disarms picker only',()=>page(()=>document.querySelector('[aria-label="Seleccionar orígenes"]')?.getAttribute('aria-pressed')==='false'));await stable(state,'Picker Escape preserves complete document, native history and recovery');
    }
    await outside();before=await serial();if(configured)await button('Resolver configuración');else await aria('Resolver ensamblaje');
    row=await response(before,configured?'preview-configured-assembly':'preview-assembly');
    check(configured ? row.response.value.kind==='configured-assembly-preview'&&row.response.value.hasToken===true : row.response.value.status==='ready','Fresh preview exists before keyboard Cancel');
    await waitFor('preview finishes and exposes current Apply before disabled shortcut checks',()=>page((configured,root)=>{
      const e=configured?[...document.querySelectorAll('[aria-label="Comandos del ensamblaje configurado"] button')].find(e=>e.textContent.trim()==='Aplicar configuración'):document.querySelector('[aria-label="Aplicar ensamblaje"]');
      return document.querySelector(root)?.getAttribute('aria-busy')==='false'&&!!e&&!e.disabled;
    },configured,ROOT));
    const candidateState=await snapshot();await key('S');await key('ShiftS');await stable(candidateState,'Preview disables Save shortcuts without consuming candidate authority');
    before=await serial();await key('Escape');await response(before,configured?'discard-configured-assembly':'discard-assembly');await recovery(current);
    await waitFor('Escape revokes Apply capability',()=>page(configured=>{
      const e=configured?[...document.querySelectorAll('[aria-label="Comandos del ensamblaje configurado"] button')].find(e=>e.textContent.trim()==='Aplicar configuración'):document.querySelector('[aria-label="Aplicar ensamblaje"]');return !!e&&e.disabled;
    },configured));
    check((await fs.readFile(input)).equals(originalBytes),'Original fixture file never overwritten');
    check(canonical(JSON.parse(await fs.readFile(shortcutOutput,'utf8')))===canonical(current),'Final SaveAs bytes retained after reopen and Cancel');
    check(dialogCounts().opens===3&&dialogCounts().saves===2,'Exactly bounded owned file picker grants');
    const final=await observe();check(!final.workerErrors.length&&!consoleErrors.length&&!failedRequests.length,'No native or renderer errors');
    checks.push({ scenario:configured?'configured-assembly-shortcuts':'assembly-shortcuts',phases,gestures,savedSha256:digest(await fs.readFile(shortcutOutput)),sourceSha256:digest(originalBytes),limits:'Actual CDP keydown/up and text key events; native file dialogs substituted only with owned paths. Standard New confirmation cancelled only. Configured New not available. No external native-window or cross-platform parity claim.' });
    await capture(current);
  };
};
