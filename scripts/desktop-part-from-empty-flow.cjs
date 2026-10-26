'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// No input document: every sketch starts empty and receives real pointer strokes.
// Parameter fields use the actual visible controls; no model/worker state injection.
module.exports = function fromEmptyWorkflow(c) {
  const { output, evaluate, observe, waitFor, pointer, menu, capture, key, checks, check, canonical, digest,
    consoleErrors, failedRequests, ipc, protocolResponses, dialogCounts, initialReadyMs, cameraFrame, cameraGesture, rasterComparison, shortcutText, namedViewKey } = c;
  const APPLY = 'button[title="Aceptar operación"]', SVG = 'svg[aria-label="Editor de croquis multientidad"]';
  const NEW = '[role="dialog"][aria-labelledby="new-document-title"]';
  const phases = [], drawings = [];
  let documentId, bodyId;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + quote(JSON.stringify(v)) + ')').join(',') + ')');
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (value, wanted, tolerance, label) => check(Number.isFinite(value) && Math.abs(value-wanted) <= tolerance, label + ': ' + value + ' expected ' + wanted);
  async function press(selector, text = null) {
    await page((selector, text) => {
      const rows=[...document.querySelectorAll(selector)].filter(e=>text===null||e.textContent.trim()===text);
      if(rows.length!==1||rows[0].disabled||rows[0].closest('[hidden]'))throw Error('One enabled control required: '+selector+' '+text);
      rows[0].scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    }, selector, text);
    await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const point=await page((selector,text)=>{
      const rows=[...document.querySelectorAll(selector)].filter(e=>text===null||e.textContent.trim()===text),e=rows[0],r=e?.getBoundingClientRect();
      if(rows.length!==1||e.disabled||!r.width||!r.height)throw Error('Missing visible control');
      const x=r.left+r.width/2,y=r.top+r.height/2;
      if(x<0||y<0||x>=innerWidth||y>=innerHeight||!e.contains(document.elementFromPoint(x,y)))throw Error('Control obscured: '+selector);
      return{x,y};
    },selector,text);
    await pointer('mouseMoved',point);await pointer('mousePressed',point,1);await pointer('mouseReleased',point,0);
  }
  const tab = text => press('.ribbon-tabs button', text);
  async function change(selector, value) {
    await waitFor('enabled parameter '+selector,()=>page(selector=>{
      const rows=document.querySelectorAll(selector),e=rows[0];
      return rows.length===1&&!e.disabled&&!e.closest('[hidden]')&&e.getClientRects().length>0;
    },selector));
    await page((selector,value)=>{
      const e=document.querySelector(selector);
      if(!e||e.disabled||e.closest('[hidden]')||!e.getClientRects().length)throw Error('Enabled parameter required: '+selector);
      const p=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,String(value));
      e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));
    },selector,value);
  }
  const ready = () => waitFor('current operation may be accepted',()=>page(selector=>!!document.querySelector(selector)&&!document.querySelector(selector).disabled,APPLY)).catch(async error=>{
    const state=await observe();
    checks.push({operationFailure:{panel:await page(()=>document.querySelector('.property-manager')?.textContent),lastBuilds:state.builds.slice(-3),workerErrors:state.workerErrors}});
    throw error;
  });
  const idle = () => waitFor('part workspace is ready',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&!document.querySelector('.property-manager')));
  async function built(after, count, volume, area, height, phase) {
    const row=await waitFor('from-empty native '+phase,async()=>{
      const state=await observe();check(!state.workerErrors.length,'Healthy worker transport');
      return state.builds.filter(r=>r.serial>after&&r.features.length===count&&r.response?.ok&&!r.response.value.featureErrors.length
        &&r.response.value.bodies?.length===1&&Math.abs(r.response.value.bodies[0].volume-volume)<=1e-5).at(-1);
    });
    const value=row.response.value,body=value.bodies[0];
    check(value.bodyCatalogActive&&!value.warnings.length,'One healthy explicit body without warnings');
    bodyId??=body.ref.bodyId;check(body.ref.bodyId===bodyId,'Original body identity retained through every operation');
    near(body.volume,volume,1e-5,'Independent volume');near(body.meshAreaMm2,area,1e-4,'Independent planar mesh area');
    for(let i=0;i<3;i++){near(body.bounds.min[i],[-20,-15,0][i],1e-6,'Minimum bound');near(body.bounds.max[i],[20,15,height][i],1e-6,'Maximum bound');}
    phases.push({phase,serial:row.serial,volume:body.volume,area:body.meshAreaMm2,bounds:body.bounds});return row;
  }
  async function draw(corners, offset, expectedFeatureCount) {
    await idle();await tab('Croquis');await press('button.command[title="Nuevo croquis"]');
    await waitFor('new empty multientity sketch',()=>page(svg=>!!document.querySelector(svg)&&document.querySelectorAll(svg+' [data-selection-kind="entity"]').length===0,SVG));
    await change('select[aria-label="Soporte del plano"]','principal:XY');
    await change('input[aria-label="Desfase"]',offset);
    await press('button.command[title="Rectángulo"]');
    const calibration=await page((selector,corners)=>{
      const svg=document.querySelector(selector),origin=svg?.querySelector('[aria-label="Origen fijo (0, 0)"] circle'),grid=svg?.querySelector('pattern'),matrix=svg?.getScreenCTM();
      if(!origin||!grid||!matrix)throw Error('Visible origin/grid calibration unavailable');
      const scale=Number(grid.getAttribute('width'))/10;
      // These ordinary fit views keep a literal 10 mm grid; the saved points
      // below independently reject any wrong calibration or unintended snap.
      if(!(scale>=1&&scale<=30))throw Error('Unexpected ordinary sketch scale');
      const points=corners.map(([x,y])=>new DOMPoint(Number(origin.getAttribute('cx'))+x*scale,Number(origin.getAttribute('cy'))-y*scale).matrixTransform(matrix));
      const rect=svg.getBoundingClientRect();
      if(points.some(p=>p.x<=rect.left+12||p.x>=rect.right-12||p.y<=rect.top+12||p.y>=rect.bottom-12))throw Error('Drawing targets must be inside visible sketch');
      return{scale,origin:[Number(origin.getAttribute('cx')),Number(origin.getAttribute('cy'))],points:points.map(p=>({x:p.x,y:p.y}))};
    },SVG,corners);
    const before=(await observe()).serial;
    await pointer('mouseMoved',calibration.points[0]);await pointer('mousePressed',calibration.points[0],1);
    await pointer('mouseMoved',calibration.points[1],1);await pointer('mouseReleased',calibration.points[1],0);
    await ready();
    const row=await waitFor('drawn rectangle reaches real worker',async()=>{
      const s=await observe();check(!s.workerErrors.length,'Drawing worker healthy');
      return s.builds.filter(r=>r.serial>before&&r.features.length===expectedFeatureCount&&r.features.at(-1)?.profile?.kind==='entities'
        &&r.features.at(-1).profile.points.length===4&&r.response?.ok&&!r.response.value.featureErrors.length).at(-1);
    });
    const sketch=row.features.at(-1),p=sketch.profile,[a,b]=corners;
    check(sketch.type==='sketch'&&sketch.plane==='XY'&&sketch.offset===offset&&(!sketch.support||sketch.support.kind==='principal'&&sketch.support.plane==='XY'),'Authored principal XY support and exact offset');
    check(p.entities.length===4&&p.entities.every(e=>e.type==='line'),'Four actual rectangle edges');
    const wanted=[[a[0],a[1]],[a[0],b[1]],[b[0],a[1]],[b[0],b[1]]];
    for(const target of wanted)check(p.points.filter(point=>Math.abs(point.x-target[0])<1e-9&&Math.abs(point.y-target[1])<1e-9).length===1,'Actual drawn point equals original analytical corner');
    drawings.push({sketchId:sketch.id,offset,corners:wanted,calibration});return sketch;
  }
  async function feature(type, sketch, depth, throughAll, merge, count, volume, area, height, phase) {
    await tab('Operaciones');await press('button.command[title="'+(type==='extrude'?'Saliente/Base extruido':'Corte extruido')+'"]');
    await waitFor('feature parameter panel',()=>page(()=>!!document.querySelector('input[aria-label="Profundidad"]')));
    await change('input[aria-label="Profundidad"]',depth);
    if(merge){
      await change('select[aria-label="Resultado del saliente"]','merge');
      await waitFor('one current merge destination',()=>page(()=>document.querySelectorAll('.body-operation-panel input[type="checkbox"]').length===1));
      if(!await page(()=>document.querySelector('.body-operation-panel input[type="checkbox"]')?.checked))await press('.body-operation-panel input[type="checkbox"]');
      await press('.body-operation-panel button','Ver vista previa');
    }
    if(throughAll)await change('select[aria-label="Condición final"]','throughAll');
    await ready();
    check(await page(id=>{const e=document.querySelector('select[aria-label="Croquis de la operación"]');return e?.disabled&&e.value===id;},sketch.id),'Direct operation uses the active drawn sketch');
    const serial=(await observe()).serial;await press(APPLY);await idle();
    const row=await built(serial,count,volume,area,height,phase),last=row.features.at(-1);
    check(last.type===type&&last.sketchId===sketch.id&&last.depth===depth&&!last.symmetric,'Saved feature uses requested sketch and signed depth');
    if(throughAll)check(last.endCondition?.kind==='throughAll'&&!last.endCondition.bothDirections,'Explicit one-direction through-all cut saved');
    else check(!last.endCondition,'Blind depth retained');
    if(merge)check(last.bodyOperation?.mode==='merge'&&last.bodyOperation.target.bodyId===bodyId,'Explicit merge destination retained');
    if(type==='cut')check(last.bodyScope?.length===1&&last.bodyScope[0].bodyId===bodyId,'Cut affects only original body');
    return row;
  }
  return async()=>{
    await waitFor('initial part startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    const initial=await recovery(),initialHistory=await observe();
    await key('N');await waitFor('New document chooser opens',()=>page(selector=>!!document.querySelector(selector),NEW));
    await key('N');await key('O');await key('S');await key('Z');await key('7');
    check(await page(selector=>document.querySelectorAll(selector).length===1,NEW),'Chooser owns repeated New and background commands');
    await key('Escape');await waitFor('New cancellation closes chooser',()=>page(selector=>!document.querySelector(selector),NEW));
    check(await recovery()===initial&&canonical(await observe())===canonical(initialHistory),'Cancelled New preserves complete initial document and worker history');
    check(dialogCounts().opens===0&&dialogCounts().saves===0,'New cancellation never invokes file dialogs');
    await key('N');await press(NEW+' [data-new-document-kind="part"]');
    await waitFor('owned initial dirty confirmation',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button');await idle();
    const empty=JSON.parse(await recovery());documentId=empty.id;
    check(empty.version===1&&empty.features.length===0&&empty.id!==JSON.parse(initial).id,'New piece begins with no imported geometry and a distinct identity');
    check(await page(()=>{const buttons=document.querySelectorAll('button[title="Deshacer (Ctrl+Z)"]');return buttons.length===1&&buttons[0].disabled;}),'New piece owns one present disabled Undo control');
    const baseSketch=await draw([[-20,-15],[20,15]],0,1);
    await feature('extrude',baseSketch,10,false,false,2,12000,3800,10,'base');
    const cutSketch=await draw([[-5,-5],[5,5]],0,3);
    await feature('cut',cutSketch,20,true,false,4,11000,4000,10,'through-hole');
    const bossSketch=await draw([[10,5],[18,13]],10,5);
    await feature('extrude',bossSketch,3,false,true,6,11192,4096,13,'second-boss');
    const pocketSketch=await draw([[-16,-10],[-10,-6]],10,7);
    const final=await feature('cut',pocketSketch,-2,false,false,8,11144,4136,13,'separate-pocket');
    let serial=(await observe()).serial;await key('Z');await idle();
    const undo=await built(serial,7,11192,4096,13,'undo-pocket');
    check(canonical(undo.features)===canonical(final.features.slice(0,-1)),'Undo removes only the last cut, retaining its sketch');
    serial=(await observe()).serial;await key('Y');await idle();
    const redo=await built(serial,8,11144,4136,13,'redo-pocket');check(canonical(redo.features)===canonical(final.features),'Redo restores exact ordered operations');
    await menu('Guardar como…');
    await waitFor('actual saved file complete',async()=>dialogCounts().saves===1&&ipc.some(e=>e.channel==='document:save'&&e.completed)&&await page(()=>!document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes=await fs.readFile(output),saved=JSON.parse(savedBytes);
    check(saved.id===documentId&&canonical(saved.features)===canonical(final.features),'Saved file preserves authored identity and all eight features');
    serial=(await observe()).serial;await key('O');await idle();
    const reopened=await built(serial,8,11144,4136,13,'reopened');check(canonical(reopened.features)===canonical(saved.features),'Reopened history retains original sketches, cut scopes and merge target');
    const reopenedDocument=JSON.parse(await recovery());
    check(reopenedDocument.id===documentId&&canonical(reopenedDocument.features)===canonical(saved.features),'Reopened recovery retains exact authored document identity and features');
    check(dialogCounts().opens===1&&dialogCounts().saves===1,'Only one Save As and saved reopen; no input fixture is opened');
    await require('./desktop-view-navigation-flow.cjs')({page,waitFor,check,checks,canonical,key,cameraFrame,cameraGesture,rasterComparison,kind:'part',actualControl:press,
      snapshot:async()=>({native:await observe(),recovery:await recovery(),dialogs:dialogCounts(),ipc:structuredClone(ipc),ui:await page(()=>{
        const viewport=document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"]');
        return {history:['Deshacer (Ctrl+Z)','Rehacer (Ctrl+Y)'].map(title=>({title,disabled:document.querySelector('button[title="'+title+'"]')?.disabled})),
          selection:['selection-mode','selected-face','selected-edges','selected-bodies'].map(name=>[name,viewport?.getAttribute('data-part-'+name)])};
      })})});
    await require('./desktop-part-view-remount.cjs')({page,waitFor,check,checks,canonical,cameraFrame,cameraGesture,key,press,tab,idle,recovery,observe,ipc,dialogCounts});
    const named = await require('./desktop-named-views-flow.cjs')({kind:'part',page,waitFor,check,checks,canonical,digest,key,text:shortcutText,namedViewKey,press,pointer,
      cameraFrame,cameraGesture,rasterComparison,observe,ipc,dialogCounts,output,reopen:async document=>{
        // A clean saved part is replaced through the real chooser. The new
        // document must not inherit its predecessor's presentation catalog.
        const beforeNew=(await observe()).serial;
        await key('N');await waitFor('New owns the named-view isolation transition',()=>page(selector=>!!document.querySelector(selector),NEW));
        await press(NEW+' [data-new-document-kind="part"]');await idle();
        const empty=JSON.parse(await recovery());
        check(empty.version===1&&empty.id!==document.id&&empty.features.length===0&&!Object.hasOwn(empty,'namedViews'),
          'New part owns a fresh identity with no previous named-view catalog');
        const emptyBuild=await waitFor('one original empty part builds after named-view isolation',async()=>{
          const rows=(await observe()).builds.filter(row=>row.serial>beforeNew&&row.response);
          check(rows.length<=1,'Named-view isolation creates one empty part build');
          return rows.length===1&&rows[0].response.ok&&rows[0].features.length===0?rows[0]:false;
        });
        check(emptyBuild.response.value.featureErrors.length===0&&emptyBuild.response.value.warnings.length===0,'Fresh isolated part has no native errors');
        const beforeOpen=(await observe()).serial;await key('O');
        await waitFor('unsaved isolated part asks before named-view reopen',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
        await press('[role="dialog"][aria-labelledby="discard-title"] button','Continuar sin guardar');await idle();
        const row=await built(beforeOpen,8,11144,4136,13,'named-view-reopened');
        check(canonical(row.features)===canonical(document.features),'Named-view reopen retains all eight original geometric operations');
      }});
    check(dialogCounts().opens===2&&dialogCounts().saves===1&&ipc.filter(e=>e.channel==='document:save'&&e.completed).length===2,
      'Original one Open/SaveAs plus one named-view Save and reopen, with no added SaveAs');
    check(!consoleErrors.length&&!failedRequests.length,'No renderer or resource errors');
    check(protocolResponses.some(p=>/kernel\.worker-[\w-]+\.js$/.test(p.url)&&p.status===200)&&protocolResponses.some(p=>p.url.endsWith('.wasm')&&p.status===200),'Actual production worker and WASM loaded');
    checks.push({savedSha256:digest(named.savedBytes),originalSaveSha256:digest(savedBytes),phases,drawings,independentOracles:'Original rectangles: base40x30x10; through-hole10x10; mergedboss8x8x3; separatepocket6x4x2. V12000/11000/11192/11144mm3 at1e-5; planar meshA3800/4000/4096/4136mm2 at1e-4; bounds1e-6mm; four-point rectangles1e-9mm. No prepared geometry or imported input.',limits:'Actual pointer strokes and command input; parameter fields assigned via existing controls. Mesh area is not native BRep area; external-window and platform acceptance are separate.'});
    await capture(named.document);
  };
};
