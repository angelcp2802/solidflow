'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');
const PHASES = Object.freeze(['standard-initial-unselected', 'standard-initial-selected', 'standard-initial-deselected',
  'standard-accepted-unselected', 'standard-accepted-selected', 'standard-accepted-deselected',
  'configured-named-unselected', 'configured-named-selected', 'configured-named-deselected']);

// Shape projection only. The caller still binds the actual worker record and
// source/catalog signatures; this function cannot confer native authority.
function captureNativeFrame(record, configured) {
  const value = record?.response?.ok && record.response.value;
  if (configured) {
    const wrapper = value?.kind === 'configured-assembly-scene' ? value
      : value?.kind === 'configured-assembly-applied' ? value.scene : null;
    if (wrapper?.kind !== 'configured-assembly-scene' || wrapper.scene?.kind !== 'assembly-scene' || !wrapper.context) throw Error('Exact configured native scene wrapper/context required');
    return { scene: wrapper.scene, context: wrapper.context };
  }
  const scene = value?.kind === 'assembly-scene' ? value : value?.kind === 'assembly-applied' ? value.scene : null;
  if (scene?.kind !== 'assembly-scene') throw Error('Exact standard native scene required');
  return { scene, context: null };
}

// Fixed fixture presentation observer, with no mutation of application/scene,
// document, selection, camera or style. The caller performs ordinary UI actions.
function createAssemblyPropertiesCapture({ allowed, getWindow, evaluate, observe, waitFor, waitForPresentation,
  presentationActive, check, owned, token, digest, captures, STEP_MS }) {
  check(allowed === true && process.env.SOLIDFLOW_UI_CAPTURE === '1', 'Only the exact fixed assembly-properties scenario can capture');
  const resolved = fs.realpathSync.native(owned), relative = path.relative(fs.realpathSync.native(os.tmpdir()), resolved);
  const marker = JSON.parse(fs.readFileSync(path.join(resolved, '.test-owned.json'), 'utf8'));
  check(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
    && path.basename(resolved).startsWith('solidflow-pattern-all-test-') && marker.token === token, 'Capture uses its own token-owned temporary profile');
  const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(...JSON.parse(' + quote(JSON.stringify(args)) + '))');
  let busy = false; const attempted = new Set();
  const owner = () => {
    const window = getWindow(); check(window && !window.isDestroyed() && !window.isVisible() && !window.webContents.isDestroyed()
      && presentationActive(), 'Passive capture requires live hidden owned window and active presentation subscription'); return window;
  };
  async function read(phase) {
    const window = owner(), configured = phase.startsWith('configured-');
    const dom = await page(configured => {
      const roots = document.querySelectorAll(configured ? '.configured-assembly-workspace' : '.assembly-app'), root = roots[0];
      const hosts = root?.querySelectorAll('.assembly-viewport'), host = hosts?.[0], r = host?.getBoundingClientRect();
      const raw = localStorage.getItem('solidflow.autosave'), doc = raw && JSON.parse(raw);
      const selected = configured ? document.querySelector('[aria-label="Ocurrencia configurada"]')?.value
        : [...document.querySelectorAll('.assembly-app [data-assembly-tree-path][aria-selected="true"]')].map(e => JSON.parse(e.getAttribute('data-assembly-tree-path')));
      return { ready: roots.length === 1 && root.checkVisibility() && root.getAttribute('aria-busy') === 'false' && hosts.length === 1
          && host.checkVisibility() && host.querySelectorAll(':scope > canvas:not([role="img"])').length === 1
          && !document.querySelector('.cad-context-menu,[role="menu"],dialog[open]') && !root.querySelector('[role="alert"]'),
        raw, doc, selected, bounds: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
        windowWidth: innerWidth, windowHeight: innerHeight,
        viewLabel: host?.querySelector('[aria-label="Nombre de la vista"]')?.textContent.trim() ?? null,
        background: { persisted: localStorage.getItem('solidflow.viewport-background.v1'), inline: host?.style.background ?? null },
        title: root?.querySelector('.assembly-shell-document > strong')?.textContent,
        history: [...root?.querySelectorAll('button[aria-label="Deshacer ensamblaje"],button[aria-label="Rehacer ensamblaje"],button[title="Deshacer"],button[title="Rehacer"]') ?? []].map(e => ({ label: e.getAttribute('aria-label') ?? e.title, disabled: e.disabled })) };
    }, configured);
    const observed = await observe(); check(!observed.workerErrors.length && owner() === window, 'Owned renderer/native observation remains healthy');
    const record = observed.assemblies.filter(row => row.response?.ok && (configured ? ['build-configured-assembly', 'apply-configured-assembly'] : ['build-assembly', 'apply-assembly']).includes(row.action)).at(-1);
    const native = record ? captureNativeFrame(record, configured) : null, scene = native?.scene;
    const source = configured ? dom.doc?.source : dom.doc, b = dom.bounds;
    if (!dom.ready || !scene || !source || source.id !== 'original-assembly-part-properties' || !b || b.width <= 0 || b.height <= 0
      || b.x < 0 || b.y < 0 || b.x + b.width > dom.windowWidth || b.y + b.height > dom.windowHeight) return { ready: false };
    check(configured ? dom.doc.version === 3 && canonical(JSON.parse(native.context.sourceSignature)) === canonical(source)
      && canonical(JSON.parse(native.context.catalogSignature)) === canonical(dom.doc.catalog) && native.context.rootConfiguration === dom.doc.rootConfiguration
      : canonical(record.response.value.document ?? record.document ?? record.current) === canonical(source), 'Captured scene belongs to current actual committed document');
    check(scene.bodies.length === 3 && scene.solidCount === 3 && scene.prototypeCount === 2 && !scene.warnings.length
      && scene.bodies.every(body => body.visible && body.body?.bodyId === 'embedded-body' && body.body.sourceFeatureId === 'embedded-solid' && Math.abs(body.volume - 24) <= 1e-5), 'Capture uses only the three current original native prism bodies');
    const selected = phase.endsWith('-selected'), paths = configured ? dom.selected ? [[dom.selected]] : [] : dom.selected;
    check(canonical(paths) === canonical(selected ? [['moving']] : []), 'Actual component owner matches fixed captured phase');
    const movingTuple = source.occurrences.find(o => o.id === 'moving').definition;
    const shared = source.definitions.find(d => d.id === movingTuple.id && d.revision === movingTuple.revision);
    const control = source.definitions.find(d => d.id === 'embedded-edit-prism' && d.revision === 'r-control');
    const initial = phase.startsWith('standard-initial-');
    check(shared.document.appearance.color === (initial ? '#cc6633' : '#339966') && control.document.appearance.color === '#3366cc', 'Captured exact source revisions retain independent declarations');
    return { ready: true, frame: { recoverySha256: digest(dom.raw), sceneId: scene.sceneId, nativeSerial: record.serial,
      components: scene.bodies.map(body => ({ component: body.component, body: body.body, visible: body.visible, bounds: body.bounds })),
      selection: paths, bounds: b, windowWidth: dom.windowWidth, windowHeight: dom.windowHeight,
      viewLabel: dom.viewLabel, background: dom.background, title: dom.title, history: dom.history } };
  }
  return async phase => {
    check(!busy && !attempted.has(phase) && PHASES[attempted.size] === phase && captures.length < PHASES.length, 'Only sequential unique fixed assembly appearance captures');
    attempted.add(phase); busy = true;
    try {
      const window = owner(); await waitFor('ready fixed original assembly capture ' + phase, async () => (await read(phase)).ready, STEP_MS);
      const before = (await read(phase)).frame, images = [], bitmaps = [];
      for (let index = 0; index < 2; index++) {
        await evaluate(`new Promise((resolve,reject)=>{let first,second;const timer=setTimeout(()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);reject(Error('Assembly capture RAF deadline'));},${STEP_MS});first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{clearTimeout(timer);resolve();});});})`);
        await waitForPresentation('Assembly properties ' + phase); const presented = await read(phase);
        check(presented.ready && canonical(presented.frame) === canonical(before) && owner() === window, 'Exact actual frame identity retained across presentation');
        const image = await window.webContents.capturePage(undefined, { stayHidden: true }), png = image.toPNG(), size = image.getSize(), bitmap = image.toBitmap();
        check(!image.isEmpty() && png.length > 0 && png.length <= 10*1024*1024 && Number.isSafeInteger(size.width) && size.width > 0
          && Number.isSafeInteger(size.height) && size.height > 0 && size.width*size.height <= 4_000_000 && bitmap.length === size.width*size.height*4, 'Bounded nonempty actual assembly PNG/bitmap');
        const after = await read(phase); check(after.ready && canonical(after.frame) === canonical(before) && owner() === window, 'Passive capture preserves all observed document/native/selection/layout state');
        images.push({png,size}); bitmaps.push(bitmap);
      }
      check(canonical(images[0].size) === canonical(images[1].size), 'Same-state capture dimensions match');
      let changedPixels = 0, maxByteDelta = 0;
      for (let offset = 0; offset < bitmaps[0].length; offset += 4) { let changed = false;
        for (let channel = 0; channel < 4; channel++) { const delta = Math.abs(bitmaps[0][offset+channel]-bitmaps[1][offset+channel]); if(delta)changed=true; maxByteDelta=Math.max(maxByteDelta,delta); }
        if(changed)changedPixels++;
      }
      const name = 'assembly-properties-' + phase + '.png', repeatName = 'assembly-properties-' + phase + '-repeat.png';
      await fsp.writeFile(path.join(resolved,name),images[0].png,{flag:'wx'}); await fsp.writeFile(path.join(resolved,repeatName),images[1].png,{flag:'wx'});
      const metadata = {phase,name,repeatName,sha256:digest(images[0].png),repeatSha256:digest(images[1].png),bytes:images[0].png.length,repeatBytes:images[1].png.length,
        width:images[0].size.width,height:images[0].size.height,frame:before,noise:{changedPixels,totalPixels:images[0].size.width*images[0].size.height,maxByteDelta},presented:true,stayHidden:true,visualAcceptance:'pending-review'};
      captures.push(metadata);return metadata;
    } finally {busy=false;}
  };
}
module.exports = createAssemblyPropertiesCapture;
module.exports.PHASES = PHASES;
module.exports.captureNativeFrame = captureNativeFrame;
