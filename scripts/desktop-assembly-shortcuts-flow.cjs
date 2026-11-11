'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Reuse the original 2x3x4 prism bearing. No injected model or keyboard handler.
module.exports = function assemblyShortcutWorkflow(context) {
  const c = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const { configured, compactShortcuts, expected, input, output, shortcutOutput, reboundConfiguredSave, completePendingSave, shortcutKey, shortcutText, assemblyNameComposition, namedViewKey, evaluate, observe, waitFor, pointer, capture,
    check, checks, canonical, digest, ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs, cameraFrame, cameraGesture, rasterComparison, menuKey, captureHeader } = c;
  const ROOT = configured ? '.configured-assembly-workspace' : '.assembly-app';
  const NAV = configured ? '[aria-label="Comandos del ensamblaje configurado"]' : '.assembly-toolbar';
  const NEW_DIALOG = '[role="dialog"][aria-labelledby="new-document-title"]';
  const CONFIGURED_DISCARD = 'dialog[aria-label="Cambios del ensamblaje configurado"]';
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
  async function compactView(label, enabled = true) {
    const inspect = () => page((root, label) => {
      const viewport = document.querySelector(root + ' .assembly-viewport');
      const toolbar = viewport?.parentElement?.querySelector(':scope > .compact-viewport-toolbar');
      const controls = [...(toolbar?.querySelectorAll('button') ?? [])]
        .filter(button => (button.getAttribute('aria-label') ?? button.title) === label);
      const button = controls[0], rect = button?.getBoundingClientRect();
      if (!rect || controls.length !== 1) return null;
      const box = ({ left, top, right, bottom }) => ({ left, top, right, bottom });
      const bounds = box(rect), bar = box(toolbar.getBoundingClientRect()), canvas = box(viewport.getBoundingClientRect());
      const contains = (outer, inner) => outer.left <= inner.left && outer.top <= inner.top
        && outer.right >= inner.right && outer.bottom >= inner.bottom;
      const x = Math.floor(rect.left + rect.width / 2), y = Math.floor(rect.top + rect.height / 2);
      return { label, x, y, bounds, bar, canvas, screen: [innerWidth, innerHeight],
        enabled: !button.disabled, visible: button.checkVisibility() && rect.width > 0 && rect.height > 0,
        contained: contains(bar, bounds) && contains(canvas, bounds)
          && contains({ left: 0, top: 0, right: innerWidth, bottom: innerHeight }, bounds),
        hit: button.contains(document.elementFromPoint(x, y)) };
    }, ROOT, label);
    const target = await waitFor('unscrolled compact viewport control: ' + label, async () => {
      const current = await inspect();
      return current?.enabled === enabled && current.visible && current.contained && current.hit ? current : false;
    }).catch(async error => { error.message += '; compactControl=' + JSON.stringify(await inspect()); throw error; });
    const point = { x: target.x, y: target.y };
    await pointer('mouseMoved', point);
    check(canonical(await inspect()) === canonical(target), label + ': compact control remains current and hit-testable');
    await pointer('mousePressed', point, 1);
    await pointer('mouseReleased', point, 0);
    return target;
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

  const nativeInputState = (selector=null) => page(selector=>{
    const active=document.activeElement,e=selector?document.querySelector(selector):active;
    if(!(e instanceof HTMLInputElement))return {input:false,focused:false,activeTag:active?.tagName??null};
    const label=e.getAttribute('aria-label'),owned=['Nombre del componente','Nombre de relación configurada'].includes(label)
      &&!!e.closest('.assembly-app,.configured-assembly-workspace');
    return {input:true,owned,label:owned?label:null,focused:active===e,enabled:!e.disabled&&!e.readOnly,
      visible:!e.closest('[hidden]')&&e.checkVisibility()&&e.getClientRects().length>0,
      value:owned?e.value.slice(0,96):null,length:owned?e.value.length:null,start:e.selectionStart,end:e.selectionEnd};
  },selector);
  const inputFailure = async (error,selector=null) => { error.message+='; nativeInput='+JSON.stringify(await nativeInputState(selector));throw error; };
  const key = async combo => {
    const prior=combo==='A'?await nativeInputState():null;
    await shortcutKey(combo);gestures.push({key:combo,transport:'CDP physical down/up; macOS owned-field A/Z include native editor commands'});
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if(combo==='A')await waitFor('actual select-all covers the current owned input',async()=>{
      const state=await nativeInputState();return state.owned&&state.focused&&state.enabled&&state.visible
        &&state.label===prior.label&&state.value===prior.value&&state.length===prior.length&&state.start===0&&state.end===state.length;
    }).catch(error=>inputFailure(error));
  };
  const outside = () => actualControl(ROOT + ' button[title="Isométrica"]');
  const snapshot = async () => ({ native: await observe(), recovery: await page(() => localStorage.getItem('solidflow.autosave')), dialogs: dialogCounts(), ipc: structuredClone(ipc) });
  const stable = async (before, label) => check(canonical(await snapshot()) === canonical(before), label);
  async function configuredDiscardReady() {
    await waitFor('configured unsaved decision owns focus', () => page(selector => {
      const dialog = document.querySelector(selector), cancel = dialog?.querySelector('button');
      return dialog instanceof HTMLDialogElement && dialog.matches(':modal') && cancel?.textContent === 'Cancelar'
        && document.activeElement === cancel && document.querySelectorAll('[role="dialog"]').length === 1;
    }, CONFIGURED_DISCARD));
  }
  async function configuredDirtyReplacement(document) {
    const namedDialog = 'dialog.named-views-dialog[open]';
    const open = '[aria-label="Archivo del ensamblaje configurado"] button[title="Abrir"]';
    const baseline = await snapshot();
    const dirty = structuredClone(document);
    check(dirty.namedViews?.length > 0, 'An original saved named view can be removed to make the current configured document dirty');
    dirty.namedViews.shift();
    if (!dirty.namedViews.length) delete dirty.namedViews;
    await actualControl(ROOT + ' button[aria-label="Vistas guardadas"]');
    await actualControl(namedDialog + ' button', 'Eliminar');
    await key('Escape'); await recovery(dirty);
    await outside();
    const before = await snapshot();
    check(canonical(before.native) === canonical(baseline.native) && canonical(before.ipc) === canonical(baseline.ipc),
      'Removing only the first named view makes a dirty metadata edit without a worker or file request');
    const point = await waitFor('idle configured Open target under the replacement dialog', () => page(selector => {
      const button = document.querySelector(selector), r = button?.getBoundingClientRect();
      if (!r || button.disabled || !r.width || !r.height) return false;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return button.contains(document.elementFromPoint(x, y)) ? { x, y } : false;
    }, open));
    await key('N'); await newDialogReady();
    await actualControl(NEW_DIALOG + ' [data-new-document-kind="part"]');
    await configuredDiscardReady();
    check(await page((selector, point, dialog) => {
      const button = document.querySelector(selector), hit = document.elementFromPoint(point.x, point.y);
      return button?.disabled && !!hit && !button.contains(hit) && document.querySelector(dialog)?.matches(':modal');
    }, open, point, CONFIGURED_DISCARD), 'Configured New modal blocks the previously hit-tested Open point');
    await pointer('mouseMoved', point);
    await pointer('mousePressed', point, 1);
    await pointer('mouseReleased', point, 0);
    await key('O'); await key('S');
    check(await page(selector => {
      const dialog = document.querySelector(selector);
      return dialog?.matches(':modal') && dialog.contains(document.activeElement);
    }, CONFIGURED_DISCARD), 'Background pointer and file shortcuts leave the current configured decision active');
    await key('Escape');
    await waitFor('cancelled configured New restores its original focus', () => page((selector, root) =>
      !document.querySelector(selector) && document.activeElement === document.querySelector(root + ' button[title="Isométrica"]'),
    CONFIGURED_DISCARD, ROOT));
    await recovery(dirty);
    await stable(before, 'Canceling dirty configured New leaves exact worker history, recovery and file activity');
    await key('O'); await configuredDiscardReady();
    await actualControl(CONFIGURED_DISCARD + ' button', 'Cancelar');
    await waitFor('cancelled configured Open restores its original focus', () => page((selector, root) =>
      !document.querySelector(selector) && document.activeElement === document.querySelector(root + ' button[title="Isométrica"]'),
    CONFIGURED_DISCARD, ROOT));
    await recovery(dirty);
    await stable(before, 'Canceling dirty configured Open leaves exact worker history, recovery and file activity');
    checks.push({ configuredDiscardOwnership: { openPoint: point, backgroundClick: true, escapeCancelNew: true, buttonCancelOpen: true,
      recoverySha256: digest(before.recovery), fileDialogCounts: before.dialogs } });
    return dirty;
  }
  async function configuredSaveBeforeOpen(empty) {
    const saveButton = CONFIGURED_DISCARD + ' [data-configured-save-continue]';
    const source = { version: 3, kind: 'configured-assembly', source: empty, catalog: [], rootConfiguration: null };
    const beforeConversion = await serial();
    await actualControl('button[aria-label="Crear configuraciones del ensamblaje"]');
    const converted = await response(beforeConversion, BUILD), scene = converted.response.value.scene;
    check(canonical(converted.current.document) === canonical(source)
      && scene.solidCount === 0 && scene.bodies.length === 0 && scene.volume === 0 && scene.area === 0 && scene.bounds === null,
    'Actual conversion creates the exact empty configured assembly and zero-body scene');
    await recovery(source); await outside();
    const before = await snapshot();
    const fileLabel = () => page(root => document.querySelector(root + ' .assembly-shell-file')?.textContent, ROOT);
    const saveRequests = () => ipc.filter(e => e.channel === 'document:save');
    const openRequests = () => ipc.filter(e => e.channel === 'document:open');
    const saveCount = saveRequests().length, openCount = openRequests().length;
    check(await fileLabel() === 'Sin guardar', 'The newly configured assembly has no granted document path');
    await key('O'); await configuredDiscardReady();
    await actualControl(saveButton);
    await waitFor('native Save cancellation returns focus to the same configured decision', async () =>
      saveRequests().length === saveCount + 1 && saveRequests().at(-1)?.completed
      && await page((dialog, save) => document.querySelector(dialog)?.matches(':modal') && document.activeElement === document.querySelector(save), CONFIGURED_DISCARD, saveButton));
    const canceled = saveRequests().at(-1);
    check(canceled.documentWrite?.hasPath === false && canceled.documentWrite.chosen === false
      && openRequests().length === openCount && await fileLabel() === 'Sin guardar',
    'Canceling the native Save picker leaves the configured assembly dirty with no path and no Open');
    const afterCancel = await snapshot();
    check(canonical(afterCancel.native) === canonical(before.native) && afterCancel.recovery === before.recovery,
      'Canceled Save preserves the exact configured scene and recovery');
    check(dialogCounts().saves === before.dialogs.saves + 1 && dialogCounts().opens === before.dialogs.opens,
      'The canceled attempt consumes only its owned native Save picker');
    await actualControl(saveButton);
    await waitFor('native Save writes the untargeted configured assembly and withholds its return', () => saveRequests().at(-1)?.actualWrite);
    const selected = saveRequests().at(-1), bytes = await fs.readFile(reboundConfiguredSave);
    check(selected.completed && selected.ipcReturnReleased === false && selected.documentWrite.hasPath === false
      && selected.documentWrite.sha256 === digest(bytes) && canonical(JSON.parse(bytes.toString('utf8'))) === canonical(source),
    'Native Save chooses the new granted location for the exact empty v3 document');
    const locked = await page(selector => {
      const modal = document.querySelector(selector);
      return modal?.matches(':modal') && modal.getAttribute('aria-busy') === 'true'
        && modal.querySelectorAll('button').length === 3 && [...modal.querySelectorAll('button')].every(button => button.disabled);
    }, CONFIGURED_DISCARD);
    check(locked, 'The single configured decision disables all its commands until Save returns');
    await key('Escape'); await key('O'); await key('S');
    check(openRequests().length === openCount && saveRequests().length === saveCount + 2
      && await page(selector => document.querySelector(selector)?.matches(':modal'), CONFIGURED_DISCARD),
    'Escape and file shortcuts do not settle the held Save or start another file request');
    check(await fileLabel() === 'Sin guardar' && canonical((await snapshot()).native) === canonical(before.native),
      'A native disk write alone cannot publish the new file identity or replace the workspace');
    await completePendingSave();
    await waitFor('after Save, canceled native Open leaves the newly granted configured document clean', async () =>
      openRequests().length === openCount + 1 && openRequests().at(-1)?.completed
      && await fileLabel() === path.basename(reboundConfiguredSave)
      && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false'
        && !document.querySelector(root + ' header')?.textContent.includes('*') && !document.querySelector('[role="dialog"]'), ROOT));
    await recovery(source);
    check(canonical((await snapshot()).native) === canonical(before.native) && selected.ipcReturnReleased === true
      && dialogCounts().saves === before.dialogs.saves + 2 && dialogCounts().opens === before.dialogs.opens + 1
      && (await fs.readFile(reboundConfiguredSave)).equals(bytes),
    'One subsequent canceled Open retains the exact saved configured document, geometry and recovery');
    checks.push({ configuredSaveBeforeOpen: { nativeSaveCanceled: true, pathRebound: true, openAfterSave: 'canceled',
      previousFile: 'Sin guardar', savedFile: path.basename(reboundConfiguredSave), savedSha256: digest(bytes) } });
    return bytes;
  }
  const originProjection = () => page(() => [...document.querySelectorAll('.assembly-origin-labels button[data-origin-key]')].map(element => {
    const rect=element.getBoundingClientRect();return {key:element.dataset.originKey,rect:[rect.x,rect.y,rect.width,rect.height],selected:element.classList.contains('selected')};
  }));
  async function newDialogReady() {
    await waitFor('exact New document selector owns focus',()=>page(selector=>{
      const dialogs=document.querySelectorAll('[role="dialog"]'),dialog=document.querySelector(selector),part=dialog?.querySelector('[data-new-document-kind="part"]');
      return dialogs.length===1&&!!dialog&&dialog.getAttribute('aria-modal')==='true'
        &&dialog.querySelector('h2')?.textContent.trim()==='Nuevo documento'
        &&dialog.querySelectorAll('[data-new-document-kind]').length===2
        &&part?.textContent.trim()==='Pieza'&&!part.disabled&&document.activeElement===part
        &&dialog.querySelector('[data-new-document-kind="assembly"]')?.textContent.trim()==='Ensamblaje';
    },NEW_DIALOG));
  }
  async function newSelectorCancellation(current) {
    // A real root-datum selection supplies a nonempty projection witness for
    // blocked camera keys. No reference or camera state is injected.
    const datum=await page(()=>{
      const rows=[...document.querySelectorAll('[data-assembly-origin-tree-key]')].filter(element=>{
        const reference=JSON.parse(element.dataset.assemblyOriginTreeReference);
        return element.dataset.assemblyOriginTreeOwner==='[]'&&reference.kind==='principal-axis'&&reference.axis==='X'&&reference.component===null;
      });
      if(rows.length!==1)throw Error('One actual root X datum required for selector camera guard');
      return {key:rows[0].dataset.assemblyOriginTreeKey,selector:'[data-assembly-origin-tree-key="'+CSS.escape(rows[0].dataset.assemblyOriginTreeKey)+'"]'};
    });
    const beforeSelection=await snapshot();await actualControl(datum.selector);
    await waitFor('one current root X projection for New selector guard',async()=>{
      const labels=await originProjection();return labels.length===1&&labels[0].key==='["principal-axis",null,"X"]'&&labels[0].rect[2]>0&&labels[0].rect[3]>0;
    });
    await stable(beforeSelection,'Root datum presentation selection does not change worker history, document or files');
    for(const close of ['Escape','Cancelar']){
      const before=await snapshot(),projection=await originProjection();await key('N');await newDialogReady();
      await stable(before,'Opening New selector performs no file, history, document or worker action');
      for(const command of ['N','O','S','ShiftS','Z','Y','1','5','7','F']){
        await key(command);
        if(['1','5','7','F'].includes(command))check(canonical(await originProjection())===canonical(projection),
          'New selector blocks each view shortcut before a later key could restore the original projection: '+command);
      }
      await newDialogReady();await stable(before,'New selector blocks duplicate New, files and history without losing the original document');
      check(canonical(await originProjection())===canonical(projection),'New selector blocks view shortcuts with a nonempty root-axis projection witness');
      if(close==='Escape')await key('Escape');else await actualControl(NEW_DIALOG+' button','Cancelar');
      await waitFor('New selector closes without replacement',()=>page(()=>!document.querySelector('[role="dialog"]')));
      await recovery(current);await stable(before,'Cancel New selector retains exact document identity, worker history, recovery and file grants');
      check(await page(key=>document.activeElement?.dataset.assemblyOriginTreeKey===key,datum.key),'Cancel New selector restores its original focused tree row');
      check(canonical(await originProjection())===canonical(projection),'Cancel New selector retains the selected datum projection');
      checks.push({newDocumentSelector:{configured,close,blockedKeys:['N','O','S','ShiftS','Z','Y','1','5','7','F'],projectionCount:projection.length,limits:'Projected root-axis invariance, not an exact camera matrix or external application parity oracle.'}});
    }
  }
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
  async function compositionOwnsSave() {
    const selector = 'input[aria-label="Nombre del componente"]';
    const fieldState = () => page(selector => {
      const field = document.querySelector(selector);
      return { focused: document.activeElement === field, value: field?.value ?? null };
    }, selector);
    await actualControl(selector);
    const before = await snapshot(), beforeFile = await fs.readFile(output);
    await page(selector => {
      const field = document.querySelector(selector), events = [];
      const types = ['compositionstart', 'compositionupdate', 'compositionend', 'input', 'keydown'];
      const record = event => {
        if (event.type !== 'keydown' || event.code === 'KeyS') {
          events.push({ event, focused: document.activeElement === field });
        }
      };
      for (const type of types) field.addEventListener(type, record, { passive: true });
      window.assemblyNameCompositionEvidence = remove => {
        if (remove) {
          for (const type of types) field.removeEventListener(type, record);
          delete window.assemblyNameCompositionEvidence;
        }
        return events.map(({ event, focused }) => ({ type: event.type, trusted: event.isTrusted, focused,
          data: event.data ?? null, composing: event.isComposing ?? null, key: event.key ?? null,
          ctrl: event.ctrlKey ?? null, prevented: event.defaultPrevented }));
      };
    }, selector);
    const evidence = {};
    checks.push({ assemblyNameComposition: evidence });
    try {
      await assemblyNameComposition('start');
      await waitFor('Chromium exposes the temporary component-name composition', async () => {
        const state = await fieldState();
        return state.focused && state.value === 'moving仮名';
      });
      await key('S');
      const after = await snapshot(), afterFile = await fs.readFile(output);
      const duringSave = await page(() => window.assemblyNameCompositionEvidence(false));
      const save = duringSave.find(event => event.type === 'keydown');
      const keyIndex = duringSave.indexOf(save), beforeKey = duringSave.slice(0, keyIndex);
      const field = await fieldState();
      Object.assign(evidence, { duringSave, field, recoveryEqual: after.recovery === before.recovery,
        nativeSerialBefore: before.native.serial, nativeSerialAfter: after.native.serial,
        fileIpcEqual: canonical(after.ipc) === canonical(before.ipc), savedBytesEqual: afterFile.equals(beforeFile) });
      check(save?.trusted && save.ctrl && save.key === 's' && save.focused && save.composing && !save.prevented
        && beforeKey.some(event => event.type === 'compositionstart' && event.trusted)
        && beforeKey.some(event => event.type === 'input' && event.trusted && event.composing && event.data === '仮名')
        && !beforeKey.some(event => event.type === 'compositionend'),
        'A trusted Ctrl+S reaches the original field during a real Chromium composition');
      check(field.focused && field.value === 'moving仮名' && canonical(after) === canonical(before) && afterFile.equals(beforeFile),
        'Composing Ctrl+S preserves focus, temporary text, exact document, native history, recovery and saved file');
      await assemblyNameComposition('cancel');
      await waitFor('cancelled Chromium composition restores the existing component name', async () => {
        const state = await fieldState();
        return state.focused && state.value === 'moving';
      });
      await stable(before, 'Cancelling composition changes no CAD, recovery or file authority');
    } finally {
      evidence.events = await page(() => window.assemblyNameCompositionEvidence(true));
    }
    const end = evidence.events.at(-1), deletion = evidence.events.at(-2);
    check(end?.type === 'compositionend' && end.focused && end.data === ''
      && deletion?.type === 'input' && deletion.trusted && deletion.focused && deletion.data === null,
      'Chromium cancellation removes the candidate in the same field and ends composition');
  }
  async function nativeTextUndo(selector) {
    await actualControl(selector); const value=await page(s=>document.querySelector(s).value,selector), before=await snapshot();
    await key('A'); await shortcutText('native undo probe');
    await waitFor('actual keyboard text inserted',()=>page(s=>document.activeElement===document.querySelector(s)&&document.querySelector(s)?.value==='native undo probe',selector)).catch(error=>inputFailure(error,selector));
    await key('Z'); await waitFor('native input undo restores prior text without assembly undo',()=>page((s,v)=>document.activeElement===document.querySelector(s)&&document.querySelector(s)?.value===v,selector,value)).catch(error=>inputFailure(error,selector));
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
    await newSelectorCancellation(current);
    const viewSnapshot=async()=>({...await snapshot(),ui:await page(()=>({
        history:[...document.querySelectorAll('button[aria-label^="Deshacer"],button[aria-label^="Rehacer"]')].map(e=>({label:e.getAttribute('aria-label'),disabled:e.disabled})),
        selection:[...document.querySelectorAll('[data-assembly-tree-path][aria-selected="true"],[data-assembly-origin-tree-key][aria-selected="true"]')].map(e=>({path:e.getAttribute('data-assembly-tree-path'),origin:e.getAttribute('data-assembly-origin-tree-key')})),
        picking:document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking')
      }))});
    await require('./desktop-header-menu-flow.cjs')({page,waitFor,check,checks,canonical,actualControl,menuKey,captureHeader,snapshot:viewSnapshot,cameraFrame,kind:configured?'configured':'standard'});
    await require('./desktop-view-navigation-flow.cjs')({page,waitFor,check,checks,canonical,key,cameraFrame,cameraGesture,rasterComparison,kind:configured?'configured':'standard',actualControl,snapshot:viewSnapshot,
      compactView: compactShortcuts ? compactView : undefined });
    if(!configured){
      await actualControl(`[data-assembly-tree-path='["moving"]']`);
      await nativeTextUndo('input[aria-label="Nombre del componente"]');
      if (assemblyNameComposition) await compositionOwnsSave();
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
        const state=await snapshot(),authorityBefore=await modalAuthority();await key(command);
        if(command==='N'){
          await newDialogReady();await stable(state,'Dirty New waits for an explicit document kind without changing the original');
          await actualControl(NEW_DIALOG+' [data-new-document-kind="assembly"]');
        }
        await waitFor('dirty document confirmation',()=>page(()=>!!document.querySelector('[role="dialog"][aria-label="Cambios sin guardar"]')));
        await key('O');await key('S');const opened=await snapshot(),authorityOpened=await modalAuthority();
        await key('Escape');await waitFor('Escape closes only replacement dialog',()=>page(()=>!document.querySelector('[role="dialog"]')));
        await recovery(current);await modalStable(state,opened,await snapshot(),authorityBefore,authorityOpened,await modalAuthority(),command);
      }
      await key('S');await saved(output,current,3);
    } else {
      await actualControl('[aria-label="Comandos del ensamblaje configurado"] button[aria-controls="configured-relation-inspector"]');
      await nativeTextUndo('input[aria-label="Nombre de relación configurada"]');
      await outside();const state=await snapshot();for(const command of ['N','O','S','ShiftS','Z','Y'])await key(command);
      check(await page(()=>!document.querySelector('[role="dialog"]')),'Configured relation draft blocks New without opening a selector');
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
    await require('./desktop-header-menu-flow.cjs').fileNavigation({ page, waitFor, check, checks, canonical, actualControl, menuKey, cameraFrame,
      snapshot: async () => ({ ...await viewSnapshot(), editor: await page(() => ({
        fields: [...document.querySelectorAll('.assembly-app input,.assembly-app select,.configured-assembly-workspace input,.configured-assembly-workspace select')]
          .filter(field => !field.closest('.command-header')).map(field => ({ tag: field.tagName, label: field.getAttribute('aria-label'), value: field.value, checked: field.checked, disabled: field.disabled })),
        roles: [...document.querySelectorAll('button[aria-label^="Referencia "]')].map(button => ({ label: button.getAttribute('aria-label'), text: button.textContent, disabled: button.disabled, pressed: button.getAttribute('aria-pressed') })),
        apply: [...document.querySelectorAll('[aria-label="Comandos del ensamblaje configurado"] button,button[aria-label="Aplicar ensamblaje"]')]
          .filter(button => button.getAttribute('aria-label') === 'Aplicar ensamblaje' || button.textContent.trim() === 'Aplicar configuración').map(button => ({ text: button.textContent, disabled: button.disabled }))
      })) }), kind: configured ? 'configured' : 'standard', phase: 'verified-preview', expectedSaveEnabled: false });
    // File-menu Escape intentionally restores its own trigger. Reuse the
    // original camera-only focus preparation before the pre-existing global
    // shortcut/Cancel assertions, so that the menubar no longer owns Escape.
    await outside();
    const candidateState=await snapshot();await key('S');await key('ShiftS');await key('N');
    check(await page(()=>!document.querySelector('[role="dialog"]')),'Unapplied preview blocks New selector');
    await stable(candidateState,'Preview disables Save and New shortcuts without consuming candidate authority');
    before=await serial();await key('Escape');await response(before,configured?'discard-configured-assembly':'discard-assembly');await recovery(current);
    await waitFor('Escape revokes Apply capability',()=>page(configured=>{
      const e=configured?[...document.querySelectorAll('[aria-label="Comandos del ensamblaje configurado"] button')].find(e=>e.textContent.trim()==='Aplicar configuración'):document.querySelector('[aria-label="Aplicar ensamblaje"]');return !!e&&e.disabled;
    },configured));
    check(dialogCounts().opens===3&&dialogCounts().saves===2,'Original shortcut prefix consumes exactly three Open and two SaveAs grants');
    const named=await require('./desktop-named-views-flow.cjs')({kind:configured?'configured':'standard',page,waitFor,check,checks,canonical,digest,
      key:shortcutKey,heldUndo:compactShortcuts,text:shortcutText,namedViewKey,press:actualControl,pointer,cameraFrame,cameraGesture,rasterComparison,observe,ipc,dialogCounts,output:shortcutOutput,
      reopen:async document=>{
        const beforeOpen=await serial();await key('O');const reopened=await response(beforeOpen,BUILD);
        check(canonical(configured?reopened.current.document:reopened.document)===canonical(document),
          'Named-view native reopen preserves the complete workspace-specific document');
        geometry(reopened.response.value,'named-view-reopened');await recovery(document);
      }});
    current=named.document;
    // Cross workspace boundaries using the actual selector and discard dialogs.
    // New saves the standard name edit or the configured named-view edit.
    const outputBytes=await fs.readFile(output), shortcutBytes=await fs.readFile(shortcutOutput);
    const savesBeforeNew=ipc.filter(v=>v.channel==='document:save'&&v.completed).length;
    if(configured) current = await configuredDirtyReplacement(current);
    else {
      await actualControl(`[data-assembly-tree-path='["moving"]']`);
      await actualControl('input[aria-label="Nombre del componente"]');
      await key('A');await shortcutText('Saved before New');before=await serial();await outside();
      row=await response(before,BUILD);
      const renamed=structuredClone(current);renamed.occurrences[1].name='Saved before New';renamed.updatedAt=row.document.updatedAt;
      check(canonical(row.document)===canonical(renamed),'New Save-and-continue starts from exactly one component-name edit');
      current=row.document;geometry(row.response.value,'before-new-save');await recovery(current);
    }
    before=await serial();await key('N');await newDialogReady();
    await actualControl(NEW_DIALOG+' [data-new-document-kind="part"]');
    if(!configured){
      await waitFor('dirty assembly New requires Save-and-continue',()=>page(()=>!!document.querySelector('[role="dialog"][aria-label="Cambios sin guardar"]')));
      await actualControl('[role="dialog"][aria-label="Cambios sin guardar"] button','Guardar y continuar');
    } else {
      await configuredDiscardReady();
      await actualControl(CONFIGURED_DISCARD + ' [data-configured-save-continue]');
    }
    const partBuild=await waitFor('one completed empty part build after New',async()=>{
      const state=await observe();check(!state.workerErrors.length,'New part worker transport healthy');
      const rows=state.builds.filter(value=>value.serial>before&&value.response);
      check(rows.length<=1,'New creates exactly one part build');if(!rows.length)return false;
      check(rows[0].response.ok,'New part native build succeeds');return rows[0];
    });
    check(canonical(partBuild.features)==='[]'&&partBuild.response.value.bodyCatalogActive===false
      &&partBuild.response.value.bodies===undefined&&canonical(partBuild.response.value.featureErrors)==='[]'
      &&canonical(partBuild.response.value.warnings)==='[]','New part builds an empty legacy feature list with no explicit bodies or errors');
    const newPart=await waitFor('empty part workspace is ready with fresh recovery and history',()=>page(()=>{
      if(!document.querySelector('.app-shell')||document.querySelector('.assembly-app,.configured-assembly-workspace,[role="dialog"]')
        ||!document.querySelector('.statusbar')?.textContent.includes('Listo')
        ||document.querySelector('button[title="Deshacer (Ctrl+Z)"]')?.disabled!==true
        ||document.querySelector('button[title="Rehacer (Ctrl+Y)"]')?.disabled!==true)return false;
      const raw=localStorage.getItem('solidflow.autosave');if(!raw)return false;
      const doc=JSON.parse(raw);return doc.version===1&&doc.name==='Pieza1'&&Array.isArray(doc.features)&&doc.features.length===0?doc:false;
    }));
    const priorAssembly=configured?current.source:current;
    const priorIds=new Set([priorAssembly.id,...priorAssembly.definitions.map(definition=>definition.document?.id).filter(Boolean)]);
    check(typeof newPart.id==='string'&&newPart.id.length>0&&!priorIds.has(newPart.id)
      &&Number.isFinite(Date.parse(newPart.createdAt))&&newPart.createdAt===newPart.updatedAt
      &&canonical(newPart)===canonical({version:1,id:newPart.id,name:'Pieza1',units:'mm',features:[],createdAt:newPart.createdAt,updatedAt:newPart.createdAt}),
    'New part has a distinct identity and only the empty document declaration');
    await waitFor('New completes its exact save policy before another document command',async()=>
      ipc.filter(v=>v.channel==='document:save'&&v.completed).length===savesBeforeNew+1
      &&canonical(JSON.parse(await fs.readFile(shortcutOutput,'utf8')))===canonical(current));
    if(configured){
      const bytes=await fs.readFile(shortcutOutput), write=ipc.filter(v=>v.channel==='document:save').at(-1).documentWrite;
      check(!bytes.equals(shortcutBytes)&&write?.hasPath===true&&write.chosen===true&&write.sha256===digest(bytes),
        'Configured New saves only the exact dirty v3 to its granted file before creating the new part');
    }
    check(dialogCounts().opens===4&&dialogCounts().saves===2,'New retains the three original Open grants plus named-view reopen, with no additional picker for Save-and-continue');
    before=await serial();await key('N');await newDialogReady();
    await actualControl(NEW_DIALOG+' [data-new-document-kind="assembly"]');
    await waitFor('unsaved empty part asks before replacement',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await actualControl('[role="dialog"][aria-labelledby="discard-title"] button','Continuar sin guardar');
    const emptyBuild=await response(before,'build-assembly'),empty=emptyBuild.document,emptyScene=emptyBuild.response.value;
    check(typeof empty.id==='string'&&empty.id.length>0&&!priorIds.has(empty.id)&&empty.id!==newPart.id
      &&Number.isFinite(Date.parse(empty.createdAt))&&empty.createdAt===empty.updatedAt
      &&canonical(empty)===canonical({version:2,kind:'assembly',id:empty.id,revision:'r1',name:'Ensamblaje',units:'mm',createdAt:empty.createdAt,updatedAt:empty.createdAt,definitions:[],occurrences:[],mates:[]}),
    'New from part creates a distinct empty standard assembly declaration');
    check(emptyScene.kind==='assembly-scene'&&emptyScene.bodies.length===0&&emptyScene.solidCount===0&&emptyScene.prototypeCount===0
      &&emptyScene.volume===0&&emptyScene.area===0&&emptyScene.bounds===null,'Empty assembly has independently zero bodies, volume, area and no bounds');
    await waitFor('new standard assembly is idle, unsaved and has empty history',()=>page(expected=>{
      const root=document.querySelector('.assembly-app'),raw=localStorage.getItem('solidflow.autosave');
      return root?.getAttribute('aria-busy')==='false'&&!document.querySelector('.app-shell,.configured-assembly-workspace,[role="dialog"]')
        &&root.querySelector('.assembly-shell-file')?.textContent==='Sin guardar'
        &&root.querySelector('[aria-label="Deshacer ensamblaje"]')?.disabled===true
        &&root.querySelector('[aria-label="Rehacer ensamblaje"]')?.disabled===true
        &&raw&&JSON.stringify(JSON.parse(raw))===JSON.stringify(expected);
    },empty));
    const reboundBytes = configured ? await configuredSaveBeforeOpen(empty) : null;
    before=await serial();await key('O');
    if(!configured){
      await waitFor('unsaved empty assembly asks before reopening original',()=>page(()=>!!document.querySelector('[role="dialog"][aria-label="Cambios sin guardar"]')));
      await actualControl('[role="dialog"][aria-label="Cambios sin guardar"] button','Continuar sin guardar');
    }
    row=await response(before,BUILD);
    check(canonical(configured?row.current.document:row.document)===canonical(current),'Original final Open restores the exact saved document and named catalog after both workspace replacements');
    geometry(row.response.value,'reopened-after-new');await recovery(current);
    check((await fs.readFile(output)).equals(outputBytes),'New and reopen preserve the earlier Save file byte for byte');
    check(ipc.filter(v=>v.channel==='document:save'&&v.completed).length===savesBeforeNew+(configured?3:1),
      'Exactly one Save and continue for New plus the two declared configured Open save attempts');
    if(reboundBytes)check((await fs.readFile(reboundConfiguredSave)).equals(reboundBytes),'Opening the earlier saved assembly preserves the newly granted v3 file');
    checks.push({newDocumentCreation:{configured,partId:newPart.id,assemblyId:empty.id,partBuildSerial:partBuild.serial,assemblyBuildSerial:emptyBuild.serial,
      saveAndContinue:true,limits:'Part path is not exposed by the renderer; fresh part identity, empty declaration/history and bounded file requests are checked, not an unobservable internal path. Empty part observer exposes feature declarations and explicit-body absence, not aggregate mesh metrics.'}});
    check((await fs.readFile(input)).equals(originalBytes),'Original fixture file never overwritten');
    check(canonical(JSON.parse(await fs.readFile(shortcutOutput,'utf8')))===canonical(current),'Final SaveAs bytes retained after reopen and Cancel');
    check(dialogCounts().opens===(configured?6:5)&&dialogCounts().saves===(configured?4:2),
      'Exact original dialog grants plus the configured canceled Open and two Save attempts');
    check(ipc.filter(v=>v.channel==='document:save'&&v.completed).length===(configured?7:6),
      'Exact completed document Save count with the configured Save and continue cases');
    const final=await observe();check(!final.workerErrors.length&&!consoleErrors.length&&!failedRequests.length,'No native or renderer errors');
    checks.push({ scenario:configured?'configured-assembly-shortcuts':'assembly-shortcuts',phases,gestures,savedSha256:digest(await fs.readFile(shortcutOutput)),sourceSha256:digest(originalBytes),limits:'Actual CDP keydown/up and text key events; native file dialogs substituted only with owned paths. Both New selectors cancel without replacement. Standard dirty New cancels its confirmation; configured dirty New blocks background Open, cancels, and retries after canceling dirty Open. Configured draft and both previews block New. Both save their checked edits through Save and continue, create an empty part and assembly, and reopen the earlier saved document. Configured also checks native Save cancellation, a new Save path and a subsequent canceled Open. No external native-window or cross-platform parity claim.' });
    await capture(current);
  };
};
