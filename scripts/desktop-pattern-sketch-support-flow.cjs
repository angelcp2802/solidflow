'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: js } = require('./desktop-ui-source.cjs');

module.exports = function associatedSketchWorkflow({ expected, evaluate, observe, waitFor, click, menu, checks,
  consoleErrors, failedRequests, ipc, input, output, check, canonical, digest, initialReadyMs, dialogCounts }) {
  const method = 'select[aria-label="Método de repetición de operaciones"]';
  const support = 'select[aria-label="Colocación de los soportes de croquis"]';
  const apply = 'button[title="Aceptar operación"]';
  const policies = ['datum-a', 'datum-b', 'profile-c'].map(featureId => ({ featureId, path: 'support', placement: 'transform' }));
  const phaseGraph = phase => {
    const result = structuredClone(expected.features), p = result.at(-1);
    if (phase !== 'geometry') {
      p.source.geometryPattern = false;
      p.featurePattern = { ...p.featurePattern, mode: 'regenerate', scope: 'selected',
        referencePolicies: phase === 'ready' ? policies : [], variation: { kind: 'none' } };
    }
    return result;
  };
  async function choose(selector, value) {
    await evaluate(`(() => { const field = document.querySelector(${js(selector)}), value = ${js(value)};
      const option = field && [...field.options].find(item => item.value === value);
      if (!field || field.disabled || !option || option.disabled) throw Error('Expected a selectable real property');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(field, value);
      field.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  }
  async function after(before, phase, pending = false) {
    const graph = canonical(phaseGraph(phase));
    return waitFor('worker returns ' + phase + ' associated profile', async () => {
      const observation = await observe();
      check(!observation.workerErrors.length, 'Unexpected worker error');
      const records = observation.builds.filter(item => item.serial > before.serial && item.response && canonical(item.features) === graph);
      const record = records.at(-1);
      if (!record) return false;
      const response = record.response;
      check(response.ok && response.value.bodyCatalogActive, 'Expected native body catalog');
      const rejected = phase === 'missing', errors = response.value.featureErrors;
      if (rejected) check(errors.length === 1 && errors[0].id === 'ui-world-P' && errors[0].message.includes(':support: '), 'Expected the unassigned support error');
      else check(!errors.length, 'Unexpected geometry error: ' + JSON.stringify(errors));
      if (pending) {
        const samples = observation.ui.filter(sample => sample.eventSerial > before.eventSerial && sample.eventSerial < record.responseEventSerial
          && sample.method === 'regenerate' && sample.sketchSupport === (rejected ? '' : 'transform'));
        check(samples.length && samples.every(sample => sample.applyDisabled), 'Apply was not guarded before a native response');
      }
      const bodies = response.value.bodies;
      check(bodies.length === 2, 'Expected exactly two native owners');
      for (const [id, state, volume, min, max] of [
        ['S','seed-limit',600-16*Math.PI,[0,0,0],[10,10,6]],
        ['A',rejected ? 'create-A' : 'ui-world-P',rejected ? 1000 : 1000-(phase === 'geometry' ? 16 : 32)*Math.PI,[8,0,2],[18,10,12]],
      ]) {
        const body = bodies.find(item => item.ref.bodyId === id);
        check(body?.ref.sourceFeatureId === state && body.createdByFeatureId === 'create-'+id && Math.abs(body.volume-volume)<1e-5, 'Unexpected exact owner or analytical volume for '+id);
        for (const [side, coords] of [['min',min],['max',max]]) check(coords.every((v,i)=>Math.abs(body.bounds[side][i]-v)<1e-6),'Unexpected native bounds for '+id);
      }
      return record;
    });
  }
  const recovery = () => evaluate("localStorage.getItem('solidflow.autosave')");
  const disabled = () => evaluate('document.querySelector('+js(apply)+')?.disabled');
  async function preview() {
    await evaluate(`(() => {const rows=[...document.querySelectorAll('.tree-row')].filter(row=>[...row.querySelectorAll('span')].some(span=>span.textContent==='Patrón del croquis asociado'));
      if(rows.length!==1)throw Error('Expected exact pattern');rows[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()`);
    await waitFor('geometry editor opens',()=>evaluate('document.querySelector('+js(method)+')?.value === "geometry"'));
    let before=await observe(); await choose(method,'regenerate'); await after(before,'missing',true);
    await waitFor('missing support blocks Apply',async()=>await disabled() && await evaluate("document.querySelector('.error-banner[role=alert] span')?.textContent.includes('Transformar con cada copia')"));
    check(await evaluate('document.querySelector('+js(support)+')?.closest(".property-section")?.textContent.includes("Plano · Plano derivado")'),'Original historical chain is offered');
    before=await observe(); await choose(support,'transform'); const candidate=await after(before,'ready',true);
    await waitFor('verified support enables Apply',async()=>await disabled()===false);
    return candidate;
  }
  return async function workflow() {
    const original=await fsp.readFile(input);
    await waitFor('renderer ready',()=>evaluate("document.querySelector('.statusbar')?.textContent.includes('Listo') && !!window.solidflow?.openDocument"),initialReadyMs);
    let before=await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('discard initial unsaved part',()=>evaluate("!!document.querySelector('[role=dialog][aria-labelledby=discard-title] .primary-button')"));
    await click('[role=dialog][aria-labelledby=discard-title] .primary-button'); const initial=await after(before,'geometry');
    const prior=await waitFor('initial exact recovery',async()=>{const raw=await recovery();return raw && canonical(JSON.parse(raw).features)===canonical(expected.features) && raw;});
    await preview(); check(await recovery()===prior,'Valid preview changed committed recovery'); before=await observe();
    await click('button[title="Cancelar operación"]'); await after(before,'geometry');
    check(await recovery()===prior,'Cancel changed recovery'); const candidate=await preview();
    before=await observe(); await click(apply); const accepted=await after(before,'ready');
    await waitFor('Apply closes editor',()=>evaluate("!document.querySelector('.property-manager')"));
    for(const [title,phase] of [['Deshacer (Ctrl+Z)','geometry'],['Rehacer (Ctrl+Y)','ready']]){
      before=await observe(); await click('button[title="'+title+'"]'); await after(before,phase);
    }
    await menu('Guardar como…');
    await waitFor('actual IPC writes isolated file',()=>dialogCounts().saves===1 && ipc.some(item=>item.channel==='document:save'&&item.completed));
    const file=JSON.parse(await fsp.readFile(output,'utf8'));
    check(file.id===expected.id && canonical(file.features)===canonical(phaseGraph('ready')),'Unexpected saved support graph');
    before=await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); const opened=await after(before,'ready');
    check(dialogCounts().opens===2 && dialogCounts().saves===1 && !consoleErrors.length && !failedRequests.length && original.equals(await fsp.readFile(input)),'Unexpected renderer lifecycle error');
    checks.push({ derivedLengthsMm:{source:4,geometryCopy:4,regeneratedTarget:8}, savedFileSha256:digest(await fsp.readFile(output)),
      builds:[initial,candidate,accepted,opened].map(item=>({serial:item.serial,bodies:item.response.value.bodies})) });
  };
};
