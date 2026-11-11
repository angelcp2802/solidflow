'use strict';

// Continue on the committed, tracked direction fixture. Native display identities
// are read only; the viewport receives actual pointer input at literal geometry.
module.exports = async function assemblyPreselection({ context, base, page, control, orientation,
  responseAfter, recovery, ready, cancel, reference, selectionKey, first, second, secondFace }) {
  const { assemblyNavigation, pointer, observe, waitFor, checks, check, canonical } = context;
  const VIEWPORT = '[aria-label="Visor 3D del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]';
  const NAME = 'input[aria-label="Nombre de la relación"]';
  const RELATION = 'button[aria-label="Relación de ensamblaje"]';
  const CREATE = 'button[aria-label="Vista previa de la nueva relación direccional"]';
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]';
  const additiveModifier = process.platform === 'darwin' ? 4 : 2;
  const pair = [reference(first), reference(second)];
  const faceKey = selectionKey(first), edgeKey = selectionKey(second);
  const gestures = [], phases = [];
  const evidence = { scenario: 'original-face-line-preselection', gestures, phases,
    provenance: 'Tracked assembly-direction-mates-original: ground top interior [0,0,4], moving top interior [20,8,6+2sqrt(3)] and moving outer LINE midpoint [25,9+1.5sqrt(3),7.5+sqrt(3)].',
    limits: 'One preselected face completed by an armed second-face click and one ordered face/LINE pair in the original root scope, using actual Chromium pointer input and visible form controls. No model, reference, camera or native reply injection; no general geometry, platform or complete relation-family claim.' };
  checks.push(evidence);

  const references = () => page(() => [1, 2].map(slot => {
    const span = document.querySelector('button[aria-label="Referencia ' + slot + ' de la relación"] span');
    if (!span) throw Error('Exactly two displayed preselection reference roles required.');
    return span.title ? JSON.parse(span.title) : null;
  }));
  const selectedKeys = () => page(() => {
    const host = document.querySelector('.assembly-canvas');
    if (!host) throw Error('Actual assembly browse-selection host required.');
    return JSON.parse(host.getAttribute('data-normal-selection-keys'));
  });
  const secondRoleSnapshot = () => page(() => {
    const rectangle = element => {
      const rect = element?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        clientWidth: element.clientWidth, clientHeight: element.clientHeight } : null;
    };
    const viewport = document.querySelector('[aria-label="Visor 3D del ensamblaje"]');
    const manager = document.querySelector('.assembly-manager-sidebar');
    const panel = document.querySelector('#assembly-panel-relations');
    return {
      roles: [1, 2].map(slot => {
        const button = document.querySelector('button[aria-label="Referencia ' + slot + ' de la relación"]');
        const title = button?.querySelector('span')?.title;
        let reference = null;
        if (title) {
          if (title.length > 8192) reference = { diagnosticError: 'Reference title exceeds the diagnostic bound.' };
          else try { reference = JSON.parse(title); } catch { reference = { diagnosticError: 'Reference title is not JSON.' }; }
        }
        return { slot, reference, active: button?.classList.contains('active') ?? false, disabled: button?.disabled ?? null };
      }),
      picking: viewport?.getAttribute('data-reference-picking') ?? null,
      type: document.querySelector('select[aria-label="Tipo de relación"]')?.value ?? null,
      name: document.querySelector('input[aria-label="Nombre de la relación"]')?.value.slice(0, 512) ?? null,
      alignment: document.querySelector('select[aria-label="Orientación de la relación"]')?.value ?? null,
      applyDisabled: document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled ?? null,
      cancelDisabled: document.querySelector('button[aria-label="Cancelar vista previa del ensamblaje"]')?.disabled ?? null,
      busy: document.querySelector('.assembly-app')?.getAttribute('aria-busy') ?? null,
      spinner: !!document.querySelector('.assembly-spinner'),
      panel: { selected: document.querySelector('#assembly-tab-relations')?.getAttribute('aria-selected') ?? null,
        hidden: panel?.hidden ?? null, className: manager?.className.slice(0, 256) ?? null,
        rect: rectangle(manager), content: panel?.textContent.trim().slice(0, 512) ?? null },
      status: document.querySelector('.assembly-status')?.textContent.trim().slice(0, 1024) ?? null,
      viewportRect: rectangle(viewport), canvasRect: rectangle(viewport?.querySelector('canvas')),
    };
  });
  async function noCad(serial, label) {
    await recovery(base.document, label);
    check((await observe()).serial === serial, label + ' must not perform CAD work.');
    check(await page(selector => document.querySelector(selector)?.disabled === true, APPLY),
      label + ' must not grant Apply before a native preview.');
  }
  async function press(selector) {
    await assemblyNavigation.reveal(selector);
    await page(selector => {
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1) throw Error('Exactly one mounted preselection control required.');
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }, selector);
    const inspect = () => page(selector => {
      const matches = document.querySelectorAll(selector), element = matches[0];
      if (matches.length !== 1 || !element) return { count: matches.length, ready: false };
      const rect = element.getBoundingClientRect(), point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      const panel = element.closest('[role="tabpanel"]'), panelRect = panel?.getBoundingClientRect();
      const ready = !element.disabled && !element.closest('[hidden]') && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0
        && rect.right <= innerWidth && rect.bottom <= innerHeight && !!hit && (hit === element || element.contains(hit));
      return { count: matches.length, ready, point, disabled: element.disabled, hidden: !!element.closest('[hidden]'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight },
        hit: hit ? { tag: hit.tagName.slice(0, 32), id: hit.id.slice(0, 128), ariaLabel: hit.getAttribute('aria-label')?.slice(0, 192) ?? null } : null,
        panel: panelRect ? { id: panel.id.slice(0, 128), x: panelRect.x, y: panelRect.y, width: panelRect.width,
          height: panelRect.height, scrollTop: panel.scrollTop, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight } : null };
    }, selector);
    let previous, stableSince = 0;
    const point = await waitFor('stationary preselection control ' + selector, async () => {
      const next = await inspect(), key = canonical(next.ready ? next.point : null);
      evidence.controlObservation = { selector, snapshot: next };
      if (key !== previous) { previous = key; stableSince = Date.now(); }
      return next.ready && Date.now() - stableSince >= 120 ? next.point : false;
    });
    await pointer('mouseMoved', point);
    const current = await inspect(); evidence.controlObservation = { selector, snapshot: current };
    check(current.ready && canonical(current.point) === canonical(point), 'Preselection control moved before its actual press.');
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
  }
  async function components() {
    await assemblyNavigation.panel('components');
    await waitFor('preselection returns to ordinary component browsing', () => page(selector =>
      document.querySelector(selector)?.getAttribute('data-reference-picking') === '', VIEWPORT));
  }
  async function prepare() {
    // A compatible single plane keeps Coincident. A mixed plane/LINE must choose
    // Parallel from that incompatible preference, before the user chooses Perpendicular.
    await control(TYPE, 'coincident'); await components();
    await press('.assembly-view-tools button[title="Frontal"]');
    await press('.assembly-view-tools button[title="Ajustar"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function browse(mode) {
    const selector = 'button[aria-label="Preseleccionar ' + (mode === 'face' ? 'caras' : 'aristas lineales') + '"]';
    await press(selector);
    await waitFor('actual preselection mode ' + mode, () => page((selector, mode) =>
      document.querySelector(selector)?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('.assembly-canvas')?.getAttribute('data-assembly-browse-mode') === mode,
    selector, mode));
  }
  async function physicalPick(world, modifiers) {
    const inspectLayout = () => page(selector => {
      const viewport = document.querySelector(selector), canvas = viewport?.querySelector('canvas');
      const host = viewport?.getBoundingClientRect(), rect = canvas?.getBoundingClientRect();
      const rectangle = value => value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
      return { viewport: rectangle(host), canvas: rectangle(rect), clientWidth: viewport?.clientWidth ?? null,
        clientHeight: viewport?.clientHeight ?? null, ready: !!host && !!rect && rect.width > 0 && rect.height > 0
          && rect.x === host.x && rect.y === host.y && rect.width === host.width && rect.height === host.height
          && rect.width === viewport.clientWidth && rect.height === viewport.clientHeight };
    }, VIEWPORT);
    const observation = { world, beforePresentation: null, afterPresentation: null };
    evidence.pickLayoutObservation = observation;
    const rect = await waitFor('current presented assembly canvas matches its viewport before literal picking', async () => {
      const beforePresentation = await inspectLayout(); observation.beforePresentation = beforePresentation;
      if (!beforePresentation.ready) return false;
      await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const afterPresentation = await inspectLayout(); observation.afterPresentation = afterPresentation;
      return afterPresentation.ready && canonical(beforePresentation) === canonical(afterPresentation) ? afterPresentation.canvas : false;
    });
    const center = base.scene.visibleBounds.min.map((value, index) => (value + base.scene.visibleBounds.max[index]) / 2);
    const span = Math.hypot(...base.scene.visibleBounds.max.map((value, index) => value - base.scene.visibleBounds.min[index]));
    check(Number.isFinite(span) && span > 0, 'Original scene has no finite fit span.');
    const pixels = rect.height / (1.3 * span);
    const point = { x: rect.x + rect.width / 2 + (world[0] - center[0]) * pixels,
      y: rect.y + rect.height / 2 - (world[1] - center[1]) * pixels };
    check(await page((selector, pointText) => {
      const canvas = document.querySelector(selector + ' canvas'), point = JSON.parse(pointText), rect = canvas?.getBoundingClientRect();
      return !!canvas && !!rect && point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom
        && document.elementFromPoint(point.x, point.y) === canvas;
    }, VIEWPORT, JSON.stringify(point)), 'Literal preselection point is not on the actual unobstructed canvas.');
    await pointer('mouseMoved', point, 0, 1, modifiers);
    await pointer('mousePressed', point, 1, 1, modifiers);
    await pointer('mouseReleased', point, 0, 1, modifiers);
    return point;
  }
  async function pick(world, wanted, modifiers, label) {
    const before = (await observe()).serial, point = await physicalPick(world, modifiers);
    await waitFor(label + ' exact current browse identities', async () => canonical(await selectedKeys()) === canonical(wanted));
    await noCad(before, label);
    gestures.push({ label, point, world, modifiers, selectedKeys: wanted });
  }
  async function mixedDraftReentry() {
    const rootXY = { kind: 'principal-plane', component: null, plane: 'XY' };
    const origin = '#assembly-panel-relations details:has(select[aria-label="Componente del plano"])';
    const counters = await observe.counters(), files = canonical({ ipc: context.ipc, dialogs: context.dialogCounts() });
    const history = () => page(() => [...document.querySelectorAll('.assembly-app button')].filter(button =>
      /^(Deshacer|Rehacer)(?:\b|\s)/.test(button.title || button.getAttribute('aria-label') || button.textContent.trim()))
      .map(button => [button.getAttribute('aria-label') || button.title || button.textContent.trim(), button.disabled]));
    const initialHistory = await history();
    await prepare(); await browse('face');
    await pick([0, 0, 4], [['face', faceKey]], 0, 'mixed-draft/ground-face');
    await press(RELATION); await control(TYPE, 'distance');
    check(canonical(await references()) === canonical([pair[0], null]), 'Ribbon preselection supplies only the original material face');
    await press(origin + ' > summary');
    check(await page(() => document.querySelector('select[aria-label="Componente del plano"]')?.value === 'scope'
      && document.querySelector('select[aria-label="Plano principal"]')?.value === 'XY'), 'Current direct origin controls show the root XY plane');
    await press(origin + ' button'); await control(NAME, 'Plano material y raíz');
    await control('input[aria-label="Distancia firmada"]', '4');
    const wanted = [pair[0], rootXY];
    const read = async () => { const state = await secondRoleSnapshot(); return { references: state.roles.map(role => role.reference),
      type: state.type, name: state.name, picking: state.picking, activeRoles: state.roles.map(role => role.active), panel: state.panel.selected,
      value: await page(() => document.querySelector('input[aria-label="Distancia firmada"]')?.value) }; };
    const draft = await read();
    check(canonical(draft.references) === canonical(wanted) && draft.picking === '' && draft.type === 'distance' && draft.panel === 'true' && draft.value === '4',
      'Direct root XY assignment completes the mixed draft and closes the armed face tool');
    const returned = [];
    const verifyReturn = async alias => {
      await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const actual = await read(); returned.push({ alias, actual });
      check(canonical(actual) === canonical(draft), alias + ' must resume the exact mixed draft without replaying the original material pick: ' + JSON.stringify(actual));
    };
    await components(); await press('button[data-assembly-menu="insert"]'); await press('button[data-assembly-command="insert-relation"]');
    await verifyReturn('Insertar → Relación de posición');
    await components(); await press(RELATION); await verifyReturn('Relación de ensamblaje');
    await components();
    await pick([0, 0, 4], [['face', faceKey]], 0, 'mixed-draft/fresh-ground-face');
    await press(RELATION);
    const fresh = await read();
    check(canonical(fresh.references) === canonical([pair[0], null]) && fresh.picking === 'face' && fresh.activeRoles[1],
      'A deliberate fresh pick of the same material face can start another ordered relation');
    await noCad(counters.serial, 'mixed unpreviewed draft reentry');
    check(canonical(await observe.counters()) === canonical(counters) && canonical(await history()) === canonical(initialHistory)
      && canonical({ ipc: context.ipc, dialogs: context.dialogCounts() }) === files, 'Draft reentry preserves exact history, worker and file activity');
    const window = await page(() => ({ width: innerWidth, height: innerHeight }));
    evidence.mixedDraftReentry = { window, draft, returned, fresh, historyUnchanged: true, workerUnchanged: true, filesUnchanged: true };
  }
  async function pairDraft(label) {
    const before = (await observe()).serial;
    await prepare(); await browse('face');
    await pick([0, 0, 4], [['face', faceKey]], 0, label + '/face');
    await browse('edge');
    await pick([25, 9 + 1.5 * Math.sqrt(3), 7.5 + Math.sqrt(3)], [['face', faceKey], ['edge', edgeKey]], additiveModifier,
      label + (additiveModifier === 4 ? '/Meta-LINE' : '/Ctrl-LINE'));
    await press(RELATION);
    await waitFor(label + ' ordered pair and compatible default', async () =>
      canonical(await references()) === canonical(pair) && await page((type, viewport) =>
        document.querySelector(type)?.value === 'parallel'
        && document.querySelector('button[aria-label="Referencia 1 de la relación"]')?.classList.contains('active')
        && !document.querySelector('select[aria-label="Orientación de la relación"]')
        && document.querySelector(viewport)?.getAttribute('data-reference-picking') === '', TYPE, VIEWPORT));
    await noCad(before, label + '/precarga');
    await control(TYPE, 'perpendicular'); await control(NAME, 'Plano y LINE perpendicular'); await orientation('aligned');
    check(canonical(await references()) === canonical(pair), 'Changing relation type must retain the ordered preselected endpoints.');
    await noCad(before, label + '/perpendicular draft');
  }
  async function preview(label) {
    const before = await observe(); await press(CREATE);
    const event = await responseAfter(before.serial, 'preview-assembly');
    const value = ready(event, base.document.mates.length + 1, 4), mate = value.document.mates.at(-1);
    check(canonical(event.current) === canonical(base.document) && mate.type === 'perpendicular'
      && mate.name === 'Plano y LINE perpendicular' && mate.alignment === 'aligned'
      && canonical([mate.first, mate.second]) === canonical(pair), 'Native preview must consume the exact preselected face/LINE pair.');
    phases.push({ label, serial: event.serial, action: event.action, document: value.document, response: value });
    return event;
  }

  check(first.support?.kind === 'plane' && secondFace.support?.kind === 'plane'
    && second.support?.kind === 'line' && second.lines.length >= 6
    && second.lines.every(Number.isFinite) && base.document.mates.length === 0,
  'Preselection requires the untouched original top plane and native LINE.');
  const before = (await observe()).serial;
  await prepare(); await browse('face');
  await pick([0, 0, 4], [['face', faceKey]], 0, 'single-face');
  await press(RELATION);
  await waitFor('single face preloads first slot and arms the empty second face role', async () =>
    canonical(await references()) === canonical([pair[0], null]) && await page((type, viewport) =>
      document.querySelector(type)?.value === 'coincident'
      && document.querySelector('button[aria-label="Referencia 2 de la relación"]')?.classList.contains('active')
      && document.querySelector(viewport)?.getAttribute('data-reference-picking') === 'face', TYPE, VIEWPORT));
  await noCad(before, 'single-face/precarga');
  await control(TYPE, 'distance');
  const familyChange = { requestedType: 'distance', latest: null };
  evidence.singleFaceFamilyChange = familyChange;
  await waitFor('compatible Distance family preserves the preloaded face and armed empty second role', async () => {
    const snapshot = await secondRoleSnapshot(); familyChange.latest = snapshot;
    return snapshot.type === 'distance' && canonical(snapshot.roles.map(role => role.reference)) === canonical([pair[0], null])
      && snapshot.roles[1].active && snapshot.picking === 'face';
  });
  await noCad(before, 'single-face/distance-family');
  const secondWorld = [20, 8, 6 + 2 * Math.sqrt(3)], secondReference = reference(secondFace);
  const secondRoleObservation = { before: await secondRoleSnapshot(), after: null, latest: null, polls: 0,
    camera: typeof context.cameraFrame === 'function' ? { available: true, frame: await context.cameraFrame() }
      : { available: false, reason: 'This direction context does not expose the optional read-only camera-frame capture.' } };
  evidence.secondRoleObservation = secondRoleObservation;
  const roleSerial = (await observe()).serial, secondPoint = await physicalPick(secondWorld, 0);
  gestures.push({ label: 'single-face/armed-second-face', kind: 'armed-reference-face', point: secondPoint,
    world: secondWorld, modifiers: 0, reference: secondReference });
  secondRoleObservation.after = await secondRoleSnapshot();
  await waitFor('armed second-face click completes its exact role and closes picking', async () => {
    const snapshot = await secondRoleSnapshot();
    secondRoleObservation.latest = snapshot; secondRoleObservation.polls++;
    return snapshot.type === 'distance' && canonical(snapshot.roles.map(role => role.reference)) === canonical([pair[0], secondReference]) && snapshot.picking === '';
  });
  await noCad(roleSerial, 'single-face/armed-second-face');
  await components(); await noCad(before, 'single-face/disarmed');
  await mixedDraftReentry();
  await pairDraft('pair-cancel'); await preview('pair-cancel/preview');
  await waitFor('preselected preview idle before manager navigation', () => page(() =>
    document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.assembly-spinner')));
  const previewSerial = (await observe()).serial;
  const navigationObservation = { before: await secondRoleSnapshot(), latest: null, polls: 0 };
  evidence.previewNavigationObservation = navigationObservation;
  await components(); await press(RELATION);
  await waitFor('Relation command resumes the exact retained directional preview', async () => {
    const snapshot = await secondRoleSnapshot(); navigationObservation.latest = snapshot; navigationObservation.polls++;
    return canonical(snapshot.roles.map(role => role.reference)) === canonical(pair) && snapshot.panel.selected === 'true'
      && snapshot.panel.hidden === false && snapshot.type === 'perpendicular' && snapshot.name === 'Plano y LINE perpendicular'
      && snapshot.alignment === 'aligned' && snapshot.applyDisabled === false && snapshot.cancelDisabled === false;
  });
  check((await observe()).serial === previewSerial, 'Manager navigation must not perform CAD work or replace the current preview.');
  evidence.previewNavigation = { serial: previewSerial, references: pair, type: 'perpendicular', alignment: 'aligned', applyEnabled: true, cancelEnabled: true };
  await cancel(base, 'preselected direction candidate cancelled');
  check(canonical(await references()) === canonical(pair), 'Preview Cancel retains the exact editable preselected endpoints.');
  await pairDraft('pair-apply');
  const event = await preview('pair-apply/preview');
  check(gestures.length === 8 && phases.length === 2, 'Expected a single-face preload completed by a second face, mixed draft reentry and two ordered face/LINE attempts.');
  evidence.finalReferences = pair;
  return event;
};
