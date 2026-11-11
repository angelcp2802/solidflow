'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');
const { FIRST_PHASES, REOPEN_PHASES, BACKGROUND_KEY } = require('./desktop-part-properties-restart.cjs');

// Fixed original-cube presentation only. No camera/React/Three state access,
// application controls, DOM styling, geometry writes or material RGB oracle.
module.exports = function createPartPropertiesCapture({ allowed, phase, getWindow, evaluate, observe, waitFor,
  waitForPresentation, presentationActive, check, owned, token, digest, captures, STEP_MS }) {
  const phases = phase === 'first' ? FIRST_PHASES : phase === 'reopen' ? REOPEN_PHASES : [];
  check(allowed === true && phases.length > 0 && process.env.SOLIDFLOW_UI_CAPTURE === '1', 'Properties captures require the exact fixed transition scenario and phase');
  const resolved = fs.realpathSync.native(owned), temporary = fs.realpathSync.native(os.tmpdir());
  const relative = path.relative(temporary, resolved), marker = JSON.parse(fs.readFileSync(path.join(resolved, '.test-owned.json'), 'utf8'));
  check(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
    && path.basename(resolved).startsWith('solidflow-pattern-all-test-') && marker.token === token,
  'Capture output must remain in the exact token-owned temporary profile');
  check(Array.isArray(captures) && Number.isSafeInteger(STEP_MS) && STEP_MS > 0, 'Properties capture requires bounded sequential evidence');
  const attempted = new Set(); let capturing = false;
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const owner = () => {
    const window = getWindow();
    check(window && !window.isDestroyed() && !window.isVisible() && !window.webContents.isDestroyed() && presentationActive(),
      'Capture requires the live hidden owned window and its active presentation subscription');
    return window;
  };
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(...JSON.parse(' + quote(JSON.stringify(args)) + '))');
  async function read(capturePhase) {
    const window = owner();
    const dom = await page(key => {
      const hosts = document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"]'), host = hosts[0], rect = host?.getBoundingClientRect();
      const raw = localStorage.getItem('solidflow.autosave'), documentValue = raw && JSON.parse(raw);
      const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
        const rows = [...document.querySelectorAll('button')].filter(button => button.title === title);
        return { title, count: rows.length, disabled: rows[0]?.disabled ?? null };
      });
      return { ready: hosts.length === 1 && host.isConnected && host.checkVisibility() && host.querySelectorAll(':scope > canvas:not([role="img"])').length === 1
          && !document.querySelector('.property-manager,.error-banner[role="alert"],dialog[open],[role="menu"]')
          && document.querySelector('.statusbar')?.textContent.includes('Listo') && history.every(value => value.count === 1),
        raw, documentValue, viewportBounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        windowWidth: innerWidth, windowHeight: innerHeight, viewLabel: document.querySelector('[aria-label="Nombre de la vista"]')?.textContent.trim() ?? null,
        selection: { mode: host?.getAttribute('data-part-selection-mode'), face: host?.getAttribute('data-part-selected-face'),
          edges: host?.getAttribute('data-part-selected-edges'), bodies: host?.getAttribute('data-part-selected-bodies') },
        background: { persisted: localStorage.getItem(key), inline: host?.style.background ?? null,
          color: host ? getComputedStyle(host).backgroundColor : null, image: host ? getComputedStyle(host).backgroundImage : null },
        title: document.querySelector('.document-title')?.textContent ?? null, history };
    }, BACKGROUND_KEY);
    const native = await observe(), last = native.builds.at(-1), value = last?.response?.ok && last.response.value;
    check(owner() === window && native.workerErrors.length === 0, 'Properties capture window/native observation ownership remains unchanged');
    const bounds = dom.viewportBounds, document = dom.documentValue;
    const ready = dom.ready && document?.version === 1 && document.id === 'original-part-properties'
      && equal(last?.features, document.features) && value && value.featureErrors.length === 0 && value.bodies?.length === 1
      && bounds && bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0
      && bounds.x + bounds.width <= dom.windowWidth && bounds.y + bounds.height <= dom.windowHeight;
    if (!ready) return { ready: false, diagnostic: { domReady: dom.ready, documentId: document?.id ?? null,
      featureMatch: equal(last?.features, document?.features), buildSerial: last?.serial ?? null,
      buildReady: !!value, featureErrors: value?.featureErrors?.length ?? null, bodyCount: value?.bodies?.length ?? null,
      viewportBounds: bounds, windowWidth: dom.windowWidth, windowHeight: dom.windowHeight } };
    const body = value.bodies[0], custom = capturePhase !== 'default-unselected', selected = capturePhase === 'selected';
    check(body.ref.bodyId === 'original-properties-cube-body' && body.ref.sourceFeatureId === 'original-properties-extrusion'
      && Math.abs(body.volume - 1000) <= 1e-6, 'Capture uses the current genuine original cube build');
    check(custom ? equal(document.material, { name: 'Material sintético original', densityKgPerM3: 1000 }) && equal(document.appearance, { color: '#cc6633' })
      : !Object.hasOwn(document, 'material') && !Object.hasOwn(document, 'appearance'), 'Capture declaration matches its fixed appearance phase');
    const bodies = JSON.parse(dom.selection.bodies);
    check(dom.selection.face === '' && dom.selection.edges === '[]' && bodies.length === Number(selected)
      && (!selected || equal(bodies[0], body.ref)), 'Actual body selection matches its fixed capture phase');
    return { ready: true, frame: { documentId: document.id, recoverySha256: digest(dom.raw), featuresSha256: digest(JSON.stringify(last.features)),
      material: document.material ?? null, appearance: document.appearance ?? null, nativeSerial: last.serial, bodyReference: body.ref,
      viewportBounds: bounds, windowWidth: dom.windowWidth, windowHeight: dom.windowHeight, viewLabel: dom.viewLabel,
      selection: dom.selection, background: dom.background, title: dom.title, history: dom.history } };
  }
  async function rendererFrames() {
    await evaluate(`new Promise((resolve, reject) => {
      let first, second;
      const timer = setTimeout(() => { cancelAnimationFrame(first); cancelAnimationFrame(second); reject(Error('Properties capture frame deadline.')); }, ${STEP_MS});
      first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { clearTimeout(timer); resolve(); }); });
    })`);
  }
  return async capturePhase => {
    check(!capturing && !attempted.has(capturePhase) && phases[attempted.size] === capturePhase && captures.length < phases.length,
      'Properties captures are sequential, fixed, unique and bounded to their declared inventory');
    attempted.add(capturePhase); capturing = true;
    try {
      const window = owner();
      let lastProbe;
      await waitFor('current original properties frame ' + phase + '/' + capturePhase, async () => {
        const state = await read(capturePhase); lastProbe = state.diagnostic;
        return state.ready;
      }, STEP_MS).catch(error => { error.message += '; boundedProbe=' + JSON.stringify(lastProbe); throw error; });
      const before = (await read(capturePhase)).frame, images = [], bitmaps = [];
      for (let repeat = 0; repeat < 2; repeat++) {
        await rendererFrames(); await waitForPresentation('Properties ' + phase + '/' + capturePhase);
        const presented = await read(capturePhase);
        check(presented.ready && equal(presented.frame, before) && owner() === window,
          'Exact document/native/selection/view/layout identity is unchanged through presentation');
        const image = await window.webContents.capturePage(undefined, { stayHidden: true });
        const png = image.toPNG(), size = image.getSize(), bitmap = image.toBitmap();
        check(!image.isEmpty() && png.length > 0 && png.length <= 10 * 1024 * 1024
          && Number.isSafeInteger(size.width) && size.width > 0 && Number.isSafeInteger(size.height) && size.height > 0
          && bitmap.length === size.width * size.height * 4 && size.width * size.height <= 4_000_000,
        'Properties capture is a bounded nonempty actual browser PNG/bitmap');
        const after = await read(capturePhase);
        check(after.ready && equal(after.frame, before) && owner() === window, 'Capture leaves exact document, worker, selection, view and layout unchanged');
        images.push({ png, size }); bitmaps.push(bitmap);
      }
      check(equal(images[0].size, images[1].size), 'Paired same-state frames have identical dimensions');
      let changedPixels = 0, maxByteDelta = 0;
      for (let offset = 0; offset < bitmaps[0].length; offset += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(bitmaps[0][offset + channel] - bitmaps[1][offset + channel]);
          if (delta) changed = true; maxByteDelta = Math.max(maxByteDelta, delta);
        }
        if (changed) changedPixels++;
      }
      const base = 'part-properties-' + phase + '-' + capturePhase, name = base + '.png', repeatName = base + '-repeat.png';
      await fsp.writeFile(path.join(resolved, name), images[0].png, { flag: 'wx' });
      await fsp.writeFile(path.join(resolved, repeatName), images[1].png, { flag: 'wx' });
      const metadata = { phase: capturePhase, name, repeatName, sha256: digest(images[0].png), repeatSha256: digest(images[1].png),
        bytes: images[0].png.length, repeatBytes: images[1].png.length, width: images[0].size.width, height: images[0].size.height,
        frame: before, noise: { changedPixels, totalPixels: images[0].size.width * images[0].size.height, maxByteDelta },
        presented: true, stayHidden: true, visualAcceptance: 'pending-review' };
      captures.push(metadata); return metadata;
    } finally { capturing = false; }
  };
};
