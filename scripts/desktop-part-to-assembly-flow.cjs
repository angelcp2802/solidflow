'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Continues the original sequential-part fixture. No synthetic assembly is
// supplied: the production command copies the actual committed part.
module.exports = function partToAssemblyWorkflow(context) {
  const { output, partAssemblyOutput, evaluate, observe, waitFor, pointer, checks, check, canonical, digest, ipc, dialogCounts } = context;
  const COMMAND = 'Crear ensamblaje con esta pieza';
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + quote(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = require('./desktop-assembly-navigation.cjs').withNavigation({ ...context, page }).assemblyNavigation;
  const evidence = { scenario: 'original-sequential-part-to-independent-assembly', phases: [],
    limits: 'Actual pointer commands; visible name/select fields use scripted setters. One fixed identity occurrence then one coincident floating reuse. No automatic placement, collision, linked source, source history transfer or general multi-body claim.' };

  async function press(selector, text = '', allowDisabled = false) {
    const inspect = () => page((selector, text) => {
      const matches = [...document.querySelectorAll(selector)].filter(e => !text || e.textContent.trim() === text);
      if (matches.length !== 1) throw Error('One exact transition action required: ' + selector + ' / ' + text);
      const e = matches[0], r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { point, disabled: e.disabled === true, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        visible: !e.closest('[hidden]') && r.width > 0 && r.height > 0 && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)) };
    }, selector, text);
    let previous, since = 0;
    const state = await waitFor('stationary part-to-assembly action ' + (text || selector), async () => {
      const value = await inspect(), key = canonical(value);
      if (key !== previous) { previous = key; since = Date.now(); }
      return value.visible && (allowDisabled || !value.disabled) && Date.now() - since >= 120 ? value : false;
    });
    await pointer('mouseMoved', state.point);
    check(canonical(await inspect()) === canonical(state), 'Transition action remains reachable and stationary before press');
    await pointer('mousePressed', state.point, 1); await pointer('mouseReleased', state.point, 0);
  }
  async function field(selector, value) {
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), e = matches[0];
      if (matches.length !== 1 || e.disabled || e.closest('[hidden]') || !e.getClientRects().length) throw Error('One visible enabled transition field required');
      e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = e.getBoundingClientRect();
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (r.width <= 0 || r.height <= 0 || r.left < left || r.top < top || r.right > right || r.bottom > bottom || !hit || !(hit === e || e.contains(hit))) throw Error('Transition field must be contained and unobscured before the scripted setter');
      const prototype = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (e instanceof HTMLSelectElement && ![...e.options].some(option => option.value === value)) throw Error('Actual reusable definition option required');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(e, value);
      e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    await waitFor('transition field records ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function response(serial, phase) {
    const record = await waitFor('actual assembly build after ' + phase, async () => {
      const state = await observe.assemblyResponseAfter(serial, 'build-assembly');
      check(!state.workerErrors.length && state.completedCount <= 1, 'One successful transition build without worker errors');
      if (!state.record) return false;
      check(state.record.response.ok, state.record.response.error || 'Transition assembly build failed');
      return state.record;
    });
    await waitFor('transition assembly idle ' + phase, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
    return record;
  }
  function geometry(record, part, count, phase, firstId) {
    const doc = record.document, scene = record.response.value;
    check(doc.version === 2 && doc.kind === 'assembly' && doc.id !== part.id && doc.definitions.length === 1 && doc.occurrences.length === count && doc.mates.length === 0,
      'Independent new root with one reusable part definition and exact occurrence count');
    const definition = doc.definitions[0];
    check(definition.kind === 'part' && definition.id === part.id && canonical(definition.document) === canonical(part) && !Object.hasOwn(definition, 'sourceLink'),
      'Embedded definition preserves the exact current committed part without an invented external source');
    check(new Set(doc.occurrences.map(o => o.id)).size === count && scene.kind === 'assembly-scene' && scene.bodies.length === count && scene.solidCount === count,
      'Exact distinct occurrence identities and healthy native solid count');
    const near = (actual, expected, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, label);
    near(scene.volume, count === 1 ? 1080 : 2160, 1e-5, 'Independent additive volume of unchanged sequential parts');
    near(scene.area, count === 1 ? 912 : 1824, 1e-5, 'Independent area of unchanged sequential parts');
    for (const occurrence of doc.occurrences) {
      check(canonical(occurrence.definition) === canonical({ id: definition.id, revision: definition.revision })
        && canonical(occurrence.pose) === canonical({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] })
        && occurrence.fixed === (occurrence.id === firstId) && occurrence.visible && !occurrence.suppressed,
      'First occurrence stays fixed at origin; subsequent reuse stays floating at identity');
      const bodies = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([occurrence.id]));
      check(bodies.length === 1 && bodies[0].body.bodyId === 'seq-body' && canonical(bodies[0].worldPose) === canonical(occurrence.pose), 'Actual native body retains occurrence, body identity and pose');
      near(bodies[0].volume, 1080, 1e-5, 'Independent per-occurrence sequential volume');
      near(bodies[0].area, 912, 1e-5, 'Independent per-occurrence sequential area');
      for (const [actual, wanted] of [[bodies[0].bounds.min, [-11, -6, 0]], [bodies[0].bounds.max, [11, 6, 9]], [scene.bounds.min, [-11, -6, 0]], [scene.bounds.max, [11, 6, 9]]])
        wanted.forEach((value, axis) => near(actual[axis], value, 1e-6, 'Independent unchanged bounds'));
    }
    evidence.phases.push({ phase, serial: record.serial, documentSha256: digest(canonical(doc)), partSha256: digest(canonical(definition.document)),
      count, volume: scene.volume, area: scene.area, bounds: scene.bounds, fixed: doc.occurrences.map(o => ({ id: o.id, fixed: o.fixed })) });
    return doc;
  }
  async function draftGuard() {
    // Called with the actual File popup already open during the existing cut.
    const before = await observe(), recovery = await page(() => localStorage.getItem('solidflow.autosave'));
    check(await page(label => {
      const menu = [...document.querySelectorAll('.part-main-menus [role="menuitem"]')].filter(e => e.textContent.trim() === label);
      const ribbon = document.querySelectorAll('button[aria-label="' + label + '"]');
      return !!document.querySelector('.property-manager') && menu.length === 1 && menu[0].disabled && ribbon.length === 1 && ribbon[0].disabled
        && !!document.querySelector('button[title="Crear un ensamblaje"]');
    }, COMMAND), 'Both part-to-assembly routes are disabled during the live cut; empty assembly remains a distinct command');
    await press('.part-main-menus [role="menuitem"]', COMMAND, true);
    check(canonical(await observe()) === canonical(before) && await page(() => localStorage.getItem('solidflow.autosave')) === recovery,
      'Actual disabled transition click preserves the complete worker observation and committed recovery');
    checks.push({ partToAssemblyDraftGuard: { workerSha256: digest(canonical(before)), recoverySha256: digest(recovery), disabledMenu: true, disabledRibbon: true } });
  }
  async function run(saved) {
    checks.push({ partToAssembly: evidence });
    const originalBytes = await fsp.readFile(output), beforeRename = await observe.counters();
    check(canonical(JSON.parse(originalBytes)) === canonical(saved), 'Original saved piece bytes retained before independent copy');
    await press('[data-assembly-menu="edit"]');
    await press('.part-main-menus [role="menuitem"]', 'Cambiar nombre de pieza');
    await field('.modal input[name="name"]', 'Sequential part accepted without Save');
    await press('.modal form button.primary-button, form.modal button.primary-button');
    await waitFor('accepted dirty part name without an operation draft', () => page(() => {
      const title = document.querySelector('.document-title')?.textContent;
      const command = document.querySelector('button[aria-label="Crear ensamblaje con esta pieza"]');
      const recovery = JSON.parse(localStorage.getItem('solidflow.autosave') || 'null');
      return title?.includes('Sequential part accepted without Save') && title.includes('*') && !document.querySelector('.property-manager') && !document.querySelector('form.modal')
        && !!command && !command.disabled && recovery?.name === 'Sequential part accepted without Save';
    }));
    const part = JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')));
    check(part.name === 'Sequential part accepted without Save' && part.id === saved.id && canonical(part.features) === canonical(saved.features)
      && (await fsp.readFile(output)).equals(originalBytes),
    'Committed unsaved rename preserves full feature chain and source file');
    const afterRename = await observe(), renameBuilds = afterRename.builds.filter(record => record.serial > beforeRename.serial && record.response);
    check(!afterRename.workerErrors.length && renameBuilds.length === 1 && renameBuilds[0].response.ok
      && canonical(renameBuilds[0].features) === canonical(part.features) && renameBuilds[0].response.value.featureErrors.length === 0,
    'The normal document-history rename rebuilds the exact committed features before transfer');
    evidence.sourceFileSha256 = digest(originalBytes); evidence.dirtyPartSha256 = digest(canonical(part));
    const before = await observe.counters();
    await press('button[aria-label="' + COMMAND + '"]');
    const first = await response(before.serial, 'copy-current-piece'), firstId = first.document.occurrences[0]?.id;
    let doc = geometry(first, part, 1, 'one-fixed-origin', firstId);
    check(await page(() => !document.querySelector('[aria-labelledby="discard-title"]') && document.querySelector('.assembly-shell-file')?.textContent === 'Sin guardar'
      && document.querySelector('.assembly-shell-document > strong')?.textContent.includes('*')), 'Independent copy is dirty with no inherited file path or discard prompt');
    check(canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(doc), 'Copied assembly recovery matches exact worker input');
    await navigation.reveal('select[aria-label="Origen del componente"]');
    await field('select[aria-label="Origen del componente"]', JSON.stringify([doc.definitions[0].id, doc.definitions[0].revision]));
    await page(() => {
      const matches = [...document.querySelectorAll('#assembly-panel-components button')].filter(e => e.textContent.trim() === 'Insertar otra ocurrencia');
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('Visible reusable source action required');
      matches[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    });
    const reuseBefore = await observe.counters();
    await press('#assembly-panel-components button', 'Insertar otra ocurrencia');
    const reused = await response(reuseBefore.serial, 'reuse-current-piece'); doc = geometry(reused, part, 2, 'two-occurrences-one-definition', firstId);
    await waitFor('reused assembly recovery matches committed document', async () => canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(doc));
    await press('.assembly-quickbar button[title="Guardar como"]');
    await waitFor('independent assembly Save As completes', async () => {
      if (dialogCounts().saves !== 2 || ipc.filter(e => e.channel === 'document:save' && e.completed).length !== 2) return false;
      try { return canonical(JSON.parse(await fsp.readFile(partAssemblyOutput, 'utf8'))) === canonical(doc)
        && await page(() => !document.querySelector('.assembly-shell-document > strong')?.textContent.includes('*')); } catch { return false; }
    });
    const assemblyBytes = await fsp.readFile(partAssemblyOutput), reopenBefore = await observe.counters();
    await press('.assembly-quickbar button[title="Abrir"]');
    const reopened = await response(reopenBefore.serial, 'reopen-independent-assembly');
    check(canonical(reopened.document) === canonical(doc), 'Reopen retains exact copied part, fixed/free flags and assembly identities');
    geometry(reopened, part, 2, 'reopened-two-occurrences', firstId);
    check((await fsp.readFile(output)).equals(originalBytes) && dialogCounts().opens === 3 && dialogCounts().saves === 2
      && canonical(ipc.map(e => e.channel)) === canonical(['document:open', 'document:save', 'document:open', 'document:save', 'document:open']) && ipc.every(e => e.completed),
    'Only original part and independent assembly Save/reopen routes ran; source bytes were never overwritten');
    check(!(await observe()).workerErrors.length, 'No worker errors during part-to-assembly continuation');
    Object.assign(evidence, { assemblySavedSha256: digest(assemblyBytes), sourceFileUnchanged: true, finalDocument: doc,
      independentOracles: 'Final original sequence: widened22*12*4 base1056 minus two2*2*4 cuts32 plus4*4*3 boss48 plus2*2*2 cap8=1080mm3; area800+48+48+16=912mm2. Two coincident occurrences sum2160/1824, not a fused union. V/A1e-5; bounds1e-6.' });
    const combined = require('./desktop-part-assembly-mates-flow.cjs')({ ...context, page, press, field, navigation });
    const final = await combined(doc, part, firstId);
    return final.document;
  }
  return { draftGuard, run };
};
