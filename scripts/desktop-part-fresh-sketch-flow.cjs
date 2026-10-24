'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function freshSketchWorkflow(c) {
  const { expected, input, output, evaluate, observe, waitFor, click, pointer, wheel, menu, capture, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = c;
  const APPLY = 'button[title="Aceptar operación"]', records = [], drawn = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + quote(JSON.stringify(v)) + ')').join(',') + ')');
  const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, label + ': ' + a + ' expected ' + b);
  async function press(point) { await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0); }
  async function tab(name) { await page(name => { const e = [...document.querySelectorAll('.ribbon-tabs button')].find(e => e.textContent.trim() === name); if (!e || e.disabled) throw Error('Missing ribbon tab ' + name); e.click(); }, name); }
  async function neutralSketchRibbon() {
    await tab('Croquis');
    await waitFor('outside sketch editing: disabled Select and enabled neutral Rectangle', () => page(() => {
      const buttons = [...document.querySelectorAll('button.command')];
      const selections = buttons.filter(e => e.querySelector('span')?.textContent === 'Seleccionar');
      const rectangles = buttons.filter(e => e.querySelector('span')?.textContent === 'Rectángulo');
      return selections.length === 1 && selections[0].disabled && selections[0].title === 'Seleccionar: todavía no disponible'
        && rectangles.length === 1 && !rectangles[0].disabled && !rectangles[0].classList.contains('active');
    }));
  }
  async function ready() { await waitFor('enabled operation acceptance', () => page(selector => { const e = document.querySelector(selector); return !!e && !e.disabled; }, APPLY)); }
  async function built(after, count, volume, area, height, phase) {
    const row = await waitFor('native fresh sketch ' + phase, async () => {
      const s = await observe(); check(!s.workerErrors.length, 'Healthy production worker transport');
      return s.builds.filter(r => r.serial > after && r.features.length === count && r.features[0]?.id === 'fresh-base-profile' && r.response?.ok
        && r.response.value.featureErrors.length === 0 && r.response.value.bodies?.length === 1
        && Math.abs(r.response.value.bodies[0].volume - volume) <= 1e-5).at(-1);
    });
    const result = row.response.value, body = result.bodies[0];
    check(result.bodyCatalogActive && !result.featureErrors.length && !result.warnings.length && body.ref.bodyId === 'fresh-body', 'One healthy explicit original body');
    near(body.volume, volume, 1e-5, 'Literal volume'); near(body.meshAreaMm2, area, 1e-4, 'Independent planar mesh area');
    for (let i = 0; i < 3; i++) { near(body.bounds.min[i], [-10,-6,0][i], 1e-6, 'Literal minimum'); near(body.bounds.max[i], [10,6,height][i], 1e-6, 'Literal maximum'); }
    records.push({ phase, serial: row.serial, volume: body.volume, meshAreaMm2: body.meshAreaMm2, bounds: body.bounds }); return row;
  }
  async function drawFresh(side, count, volume, area, height, sourceFeatureId) {
    await waitFor('ready before face picking', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && !document.querySelector('.property-manager')));
    await click('button[title="Vista frontal (Ctrl+1)"]');
    await click('button[title="Seleccionar caras"]');
    // Two animation frames allow the requested orthographic camera fit to render.
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const facePoint = await page(() => { const r = document.querySelector('.viewport-canvas canvas')?.getBoundingClientRect(); if (!r || !r.width || !r.height) throw Error('Visible part canvas required'); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await press(facePoint);
    await waitFor('actual planar face selection', () => page(() => document.querySelector('.face-selection-summary strong')?.textContent.includes('Cara plana seleccionada')));
    await page(() => { const b = [...document.querySelectorAll('.face-selection-summary button')].find(b => b.textContent.includes('Crear croquis en cara')); if (!b || b.disabled) throw Error('Face sketch command unavailable'); b.click(); });
    await waitFor('fresh empty entity sketch', () => page(() => !!document.querySelector('svg[aria-label="Editor de croquis multientidad"] [data-sketch-reference="true"]') && document.querySelectorAll('svg[aria-label="Editor de croquis multientidad"] [data-selection-kind="entity"]').length === 0));
    await tab('Croquis'); await click('button.command[title="Rectángulo"]');
    await waitFor('enabled active Rectangle inside the fresh sketch', () => page(() => { const rectangle = document.querySelector('button.command[title="Rectángulo"]'); return !!rectangle && !rectangle.disabled && rectangle.classList.contains('active'); }));
    const calibrate = async () => {
      const calibration = await waitFor('nonempty visible reference calibration', () => page(side => {
      const svg = document.querySelector('svg[aria-label="Editor de croquis multientidad"]'), reference = svg?.querySelector('[data-sketch-reference="true"]'), origin = svg?.querySelector('[aria-label="Origen fijo (0, 0)"] circle'), grid = svg?.querySelector('pattern');
      if (!reference || !origin || !grid) return false;
      const b = reference.getBBox(), matrix = svg.getScreenCTM(), scale = Number(grid.getAttribute('width')) / 10;
      if (!matrix || b.width <= 0 || b.height <= 0 || scale <= 0) return false;
      // These planar references include the whole base outline in both stages.
      const dimensions = [b.width / scale, b.height / scale].sort((a,b) => a-b);
      const center = [(b.x+b.width/2-Number(origin.getAttribute('cx')))/scale, -(b.y+b.height/2-Number(origin.getAttribute('cy')))/scale];
      const targets = [[center[0]-side/2,center[1]-side/2],[center[0]+side/2,center[1]+side/2]];
      const points = targets.map(([x,y]) => { const p = new DOMPoint(Number(origin.getAttribute('cx'))+x*scale, Number(origin.getAttribute('cy'))-y*scale).matrixTransform(matrix); return {x:p.x,y:p.y}; });
      return { center, targets: targets.map(p=>p.map(x=>Math.round(x*1000)/1000)), points, scale, dimensions,
        bbox: { x:b.x,y:b.y,width:b.width,height:b.height }, origin: [Number(origin.getAttribute('cx')),Number(origin.getAttribute('cy'))] };
      }, side));
      // SVG getBBox exposes Float32 pixel coordinates. This bounded visual
      // calibration budget does not change saved-point or native geometry tolerances.
      const b = calibration.bbox;
      const envelopeBudgetMm = 4 * 2 ** -23 * Math.max(Math.abs(b.x), Math.abs(b.y), Math.abs(b.x+b.width), Math.abs(b.y+b.height), 1) / calibration.scale;
      check(envelopeBudgetMm < 0.0001 && Math.abs(calibration.dimensions[0]-12)<=envelopeBudgetMm && Math.abs(calibration.dimensions[1]-20)<=envelopeBudgetMm,
        'Original reference envelope calibration: ' + JSON.stringify({ ...calibration, envelopeBudgetMm }));
      return calibration;
    };
    let calibration = await calibrate();
    for (let zoom = 0; calibration.scale < 12 && zoom < 16; zoom++) {
      const at = {x:(calibration.points[0].x+calibration.points[1].x)/2,y:(calibration.points[0].y+calibration.points[1].y)/2};
      const previous = calibration.scale; await wheel(at, -240);
      await waitFor('actual sketch wheel zoom rendered', async () => (await calibrate()).scale > previous);
      calibration = await calibrate();
    }
    check(calibration.scale >= 12, 'Visible sketch scale keeps intended corners outside origin snapping radius');
    await pointer('mouseMoved', calibration.points[0]); await pointer('mousePressed', calibration.points[0], 1);
    await pointer('mouseMoved', calibration.points[1], 1); await pointer('mouseReleased', calibration.points[1], 0);
    await ready();
    const row = await built(0, count, volume, area, height, 'active-fresh-' + side);
    check(await page(() => !!document.querySelector('svg[aria-label="Editor de croquis multientidad"]')), 'New drawn sketch remains active before direct feature command');
    const sketch = row.features.at(-1), p = sketch.profile;
    check(sketch.type === 'sketch' && sketch.support?.kind === 'face' && sketch.support.face.sourceFeatureId === sourceFeatureId && sketch.offset === 0, 'Fresh associative current face support, no offset workaround');
    check(p.kind === 'entities' && p.points.length === 4 && p.entities.length === 4 && p.entities.every(e=>e.type==='line'), 'Actual rectangle contains four drawn material points and lines');
    const [a,b] = calibration.targets, wanted = [[a[0],a[1]],[a[0],b[1]],[b[0],a[1]],[b[0],b[1]]];
    for (const target of wanted) check(p.points.filter(point => Math.abs(point.x-target[0])<1e-9 && Math.abs(point.y-target[1])<1e-9).length === 1, 'Saved drawing equals independent 0.001 mm snapped pointer target');
    near(b[0]-a[0], side, 1e-9, 'Requested rectangle width'); near(b[1]-a[1], side, 1e-9, 'Requested rectangle height');
    drawn.push({ sketchId: sketch.id, support: sketch.support, targets: wanted, facePoint, scale: calibration.scale }); return sketch;
  }
  async function operation(type, sketch, count, volume, area, height, sourceFeatureId) {
    await tab('Operaciones');
    const ribbon = await waitFor('operation ribbon layout', () => page(() => {
      const container=document.querySelector('.commands'), commands=[...document.querySelectorAll('.command-stack .command')];
      if(!container||!commands.length)return false;
      const box=container.getBoundingClientRect(); return { top:box.top+container.clientTop, height:container.clientHeight,
        commands:commands.map(e=>{const r=e.getBoundingClientRect();return {label:e.textContent.trim(),top:r.top,bottom:r.bottom};}) };
    }));
    check(ribbon.commands.every(r=>r.top>=ribbon.top-1 && r.bottom<=ribbon.top+ribbon.height+1), 'Stacked operation commands stay inside visible ribbon height: '+JSON.stringify(ribbon));
    const recovery = await page(() => localStorage.getItem('solidflow.autosave'));
    const start = async () => {
      await tab('Operaciones');
      if (type === 'extrude') await click('button.command[title="Saliente/Base extruido"]');
      else {
        await click('[data-assembly-menu="insert"]');
        await page(() => { const button = [...document.querySelectorAll('.dropdown button')].find(e => e.textContent.trim() === 'Corte extruido'); if (!button || button.disabled) throw Error('Direct cut menu unavailable'); button.click(); });
      }
    };
    await start();
    await waitFor('automatic current body destination', () => page(type => {
      const selected = document.querySelectorAll('.body-operation-panel input[type="checkbox"]:checked');
      return selected.length === 1 && (type === 'cut' || document.querySelector('select[aria-label="Resultado del saliente"]')?.value === 'merge');
    }, type));
    await page(value => { const e=document.querySelector('input[aria-label="Profundidad"]'); if(!e||e.disabled)throw Error('Depth field unavailable'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value)); e.dispatchEvent(new Event('input',{bubbles:true})); }, type === 'cut' ? -3 : 3);
    await ready();
    check(await page(id => { const select = document.querySelector('select[aria-label="Croquis de la operación"]'); return select?.disabled && select.value === id; }, sketch.id), 'Direct operation retains its active sketch and prevents substituting a different profile');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recovery, 'Feature preview does not prematurely save the new sketch');
    const cancelSerial = (await observe()).serial;
    await click('button[title="Cancelar operación"]');
    await waitFor('Cancel resumes the same active sketch', () => page(() => !!document.querySelector('svg[aria-label="Editor de croquis multientidad"]') && document.querySelector('.ribbon-tabs .selected')?.textContent.trim() === 'Croquis'));
    await ready();
    const previous = type === 'extrude' ? [960,736,4] : [1008,784,7];
    const restored = await built(cancelSerial,count-1,...previous,'cancel-'+type);
    check(canonical(restored.features.at(-1)) === canonical(sketch), 'Cancel restores exact sketch entities, ID and associative support');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recovery, 'Cancel preserves committed recovery');
    if (type === 'extrude') {
      await click('button[title="Deshacer (Ctrl+Z)"]');
      await waitFor('restored sketch retains local drawing Undo', () => page(() => !!document.querySelector('svg[aria-label="Editor de croquis multientidad"]') && document.querySelectorAll('svg[aria-label="Editor de croquis multientidad"] [data-selection-kind="entity"]').length === 0));
      const redoSerial = (await observe()).serial;
      await click('button[title="Rehacer (Ctrl+Y)"]'); await ready();
      const redrawn = await built(redoSerial,count-1,...previous,'local-redo-after-cancel');
      check(canonical(redrawn.features.at(-1)) === canonical(sketch), 'Local Redo restores original material geometry after feature cancellation');
    }
    await start();
    await page(value => { const e=document.querySelector('input[aria-label="Profundidad"]'); if(!e||e.disabled)throw Error('Depth field unavailable'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value)); e.dispatchEvent(new Event('input',{bubbles:true})); }, type === 'cut' ? -3 : 3);
    await ready(); const serial=(await observe()).serial; await click(APPLY);
    await waitFor('operation committed',()=>page(()=>!document.querySelector('.property-manager')));
    const row=await built(serial,count,volume,area,height,type), feature=row.features.at(-1);
    check(feature.type===type && feature.sketchId===sketch.id && feature.depth===(type==='cut'?-3:3) && !feature.symmetric, 'Exact authored signed operation');
    const targets=type==='cut'?feature.bodyScope:[feature.bodyOperation?.target];
    check((type==='cut'||feature.bodyOperation?.mode==='merge') && targets?.length===1 && targets[0]?.bodyId==='fresh-body' && targets[0]?.sourceFeatureId===sourceFeatureId,'Automatic sole current body target persisted without test correction'); return row;
  }
  return async () => {
    await waitFor('part startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    let serial=(await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial owned discard dialog',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await click('[role="dialog"][aria-labelledby="discard-title"] .primary-button');
    const original=await built(serial,2,960,736,4,'original'); check(canonical(original.features)===canonical(expected.features),'Only original base features imported');
    await neutralSketchRibbon();
    const bossSketch=await drawFresh(4,3,960,736,4,'fresh-base');
    const boss=await operation('extrude',bossSketch,4,1008,784,7,'fresh-base');
    const cutSketch=await drawFresh(2,5,1008,784,7,boss.features.at(-1).id);
    const final=await operation('cut',cutSketch,6,996,808,7,boss.features.at(-1).id);
    serial=(await observe()).serial; await click('button[title="Deshacer (Ctrl+Z)"]');
    const undo=await built(serial,5,1008,784,7,'undo-cut'); check(canonical(undo.features)===canonical(final.features.slice(0,-1)),'Undo removes only actual cut');
    serial=(await observe()).serial; await click('button[title="Deshacer (Ctrl+Z)"]');
    const undoSketch=await built(serial,4,1008,784,7,'undo-cut-sketch'); check(canonical(undoSketch.features)===canonical(boss.features),'Second Undo removes only the new cut sketch');
    serial=(await observe()).serial; await click('button[title="Rehacer (Ctrl+Y)"]');
    const redoSketch=await built(serial,5,1008,784,7,'redo-cut-sketch'); check(canonical(redoSketch.features)===canonical(undo.features),'First Redo restores the exact supported sketch');
    serial=(await observe()).serial; await click('button[title="Rehacer (Ctrl+Y)"]');
    const redo=await built(serial,6,996,808,7,'redo-cut'); check(canonical(redo.features)===canonical(final.features),'Redo exact complete history');
    await menu('Guardar como…'); await waitFor('actual save complete',async()=>dialogCounts().saves===1&&ipc.some(e=>e.channel==='document:save'&&e.completed)&&await page(()=>!document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes=await fs.readFile(output), saved=JSON.parse(savedBytes);
    check(saved.id===expected.id&&canonical(saved.features)===canonical(final.features),'Exact saved freshly authored history');
    serial=(await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened=await built(serial,6,996,808,7,'reopened'); check(canonical(reopened.features)===canonical(saved.features),'Reopen preserves support, drawn points and destinations');
    check(dialogCounts().opens===2&&dialogCounts().saves===1,'Exact original/save/reopen dialogs'); check(!consoleErrors.length&&!failedRequests.length,'No renderer/resource errors');
    check(protocolResponses.some(p=>/kernel\.worker-[\w-]+\.js$/.test(p.url)&&p.status===200)&&protocolResponses.some(p=>p.url.endsWith('.wasm')&&p.status===200),'Production worker and WASM observed');
    checks.push({savedSha256:digest(savedBytes),originalSha256:digest(await fs.readFile(input)),records,drawn,independentOracles:'Volumes960/1008/996 mm3 at1e-5; planar mesh areas736/784/808 mm2 at1e-4; bounds1e-6mm; actual drawn points0.001mm snap checked1e-9. BRep checks separate.'}); await capture(saved);
  };
};
