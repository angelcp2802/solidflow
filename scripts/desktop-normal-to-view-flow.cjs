'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// A fixed route over three original inputs, operated through real pointer and
// keyboard controls. No model, selection or camera state is supplied by the test.
module.exports = function runNormalToViewWorkflow(c) {
  const { documents, inputs, evaluate, observe, waitFor, pointer, key, wheel, cameraFrame,
    checks, check, canonical, digest, ipc, dialogCounts, initialReadyMs, consoleErrors, failedRequests, protocolResponses } = c;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + quote(JSON.stringify(v)) + ')').join(',') + ')');
  const raf = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const attr = (name, value) => '[' + name + '=' + JSON.stringify(value) + ']';
  const normalButton = 'button[aria-label="Normal a"]';
  const phases = [], gestures = [], normalCommands = [], evidence = { scenario: 'normal-to-view', phases, gestures, normalCommands,
    provenance: 'Original 20 by 12 by 4 mm prisms with a radius-1.5, depth-2 blind pocket at (-4,1). Two assembly occurrences, the second rotated 90 degrees about Z and translated 30 mm along X. No external model.',
    tolerances: { volumeMm3: 1e-5, nativeAreaMm2: 1e-5, boundsMm: 1e-6, analyticDirection: 1e-6, sketchProjectionPx: .11 },
    limits: 'Fixed scope: part, standard root assembly and one configured root state. Native world frames plus literal geometric points independently predict real pointer hits. Exact Previous raster comparison is only performed with no selection and no origin overlays, using the existing central canvas crop. Selected faces and datum overlays have semantic and pointer checks, without pixel-equivalence claims. Nearest/up/ties/Fit are SolidFlow conventions; this is not external-runtime or cross-platform parity. Entering/cancelling a sketch may build its preview; camera commands inside a settled editor may not.' };
  checks.push({ normalToView: evidence });
  const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a-b) <= tolerance, label + ': ' + a + ' vs ' + b);
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value*b[index], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => { const length = Math.hypot(...a); check(Number.isFinite(length) && length > 1e-8, 'Nondegenerate independent direction'); return a.map(v => v/length); };
  const front = { direction: [0,0,1], up: [0,1,0] };
  const iso = { direction: [1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3)], up: [-1/Math.sqrt(6),2/Math.sqrt(6),-1/Math.sqrt(6)] };
  const natural = frame => ({ direction: unit(frame.normal), up: unit(cross(frame.normal, frame.xDirection)) });
  const pair = (first, second) => ({ direction: unit(first.normal), up: unit(second.normal.map((v,i) => v-dot(second.normal,first.normal)*first.normal[i])) });
  const principal = plane => plane === 'XY' ? { normal: [0,0,1], xDirection: [1,0,0] }
    : plane === 'XZ' ? { normal: [0,-1,0], xDirection: [1,0,0] } : { normal: [1,0,0], xDirection: [0,1,0] };
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  let kind, native, baseline;
  const host = () => kind === 'part' ? '.graphics-area' : kind === 'standard' ? '.assembly-canvas' : '.configured-assembly-view';
  const canvas = () => kind === 'part' ? '.viewport-canvas canvas:not([role="img"])' : '.assembly-viewport canvas:not([role="img"])';
  const selection = () => page(selector => {
    const e = document.querySelector(selector);
    return e ? { kind: e.getAttribute('data-normal-selection-kind'), keys: JSON.parse(e.getAttribute('data-normal-selection-keys') || 'null'),
      enabled: e.getAttribute('data-normal-enabled') === 'true', buttonDisabled: document.querySelector('button[aria-label="Normal a"]')?.disabled } : null;
  }, host());
  const presentation = () => page((hostSelector,canvasSelector)=>{
    const box=e=>{const r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height,clientWidth:e.clientWidth,clientHeight:e.clientHeight}:null;};
    const outer=document.querySelector(hostSelector),surface=document.querySelector(canvasSelector),viewport=surface?.parentElement;
    return {outer:box(outer),viewport:box(viewport),canvas:box(surface),picking:viewport?.getAttribute('data-reference-picking')??null};
  },host(),canvas());
  function nativeTargets(state) {
    const all=native?.bodies.flatMap(body=>body.faces)??[];
    return (state?.keys??[]).slice(0,3).map(value=>{
      const key=kind==='part'?value:value[1];
      const matches=all.filter(face=>faceKey(face)===key);
      return {key,matches:matches.slice(0,2).map(face=>({frame:faceFrame(face),axis:kind==='part'?face.viewAxis:face.worldViewAxis,
        support:kind==='part'?null:face.worldSupport}))};
    });
  }
  const history = () => page(() => [...document.querySelectorAll('button')].filter(e => /^(Deshacer|Rehacer)( |$)/.test(e.getAttribute('aria-label') || e.title))
    .map(e => ({ label: e.getAttribute('aria-label') || e.title, disabled: e.disabled })));
  const snapshot = async () => ({ native: await observe(), recovery: await recovery(), history: await history(), ipc: structuredClone(ipc), dialogs: dialogCounts() });
  async function unchanged(label, expected = baseline) {
    check(canonical(await snapshot()) === canonical(expected), label + ': exact worker history, recovery, model Undo/Redo and file IPC unchanged');
  }
  async function pressAt(point, additive = false, clickCount = 1) {
    const modifiers = additive ? process.platform === 'darwin' ? 4 : 2 : 0;
    await pointer('mouseMoved', point, 0, 1, modifiers);
    await pointer('mousePressed', point, 1, clickCount, modifiers);
    await pointer('mouseReleased', point, 0, clickCount, modifiers);
    await raf();
  }
  async function actual(selector, text = null, additive = false, double = false) {
    if (kind === 'standard') await require('./desktop-assembly-navigation.cjs').withNavigation({ ...c, page }).assemblyNavigation.reveal(selector, text ?? '');
    else if (kind === 'configured' && selector.includes('data-assembly-origin-tree'))
      await require('./desktop-assembly-tree-navigation.cjs')({ page, waitFor, pointer }).reveal(selector, text ?? '');
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One enabled visible control required: ' + selector + '/' + text);
      rows[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    await raf();
    const point = await waitFor('reachable Normal To control ' + (text ?? selector), () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text), e = rows[0], r = e?.getBoundingClientRect();
      if (rows.length !== 1 || e.disabled || !r.width || !r.height || e.closest('[hidden]')) return false;
      const p = { x: r.left+r.width/2, y: r.top+r.height/2 };
      return p.x>=0 && p.x<innerWidth && p.y>=0 && p.y<innerHeight && e.contains(document.elementFromPoint(p.x,p.y)) ? p : false;
    }, selector, text));
    await pressAt(point, additive);
    if (double) await pressAt(point, additive, 2);
    gestures.push({ kind, action: double ? 'double-pointer' : 'pointer', selector, text, additive, point });
  }
  async function selected(expectedKind, count, label, enabled = expectedKind !== 'invalid') {
    return waitFor(label, async () => {
      const state = await selection();
      return state?.kind === expectedKind && Array.isArray(state.keys) && state.keys.length === count
        && state.enabled === enabled && state.buttonDisabled === !enabled ? state : false;
    });
  }
  async function clear() {
    const point = await page(selector => {
      const e=document.querySelector(selector), r=e?.getBoundingClientRect();
      if(!r?.width||!r.height)throw Error('Actual canvas required');
      const p={x:r.left+r.width*.95,y:r.top+r.height*.88};
      if(document.elementFromPoint(p.x,p.y)!==e)throw Error('Empty canvas witness is obscured');
      return p;
    },canvas());
    await pressAt(point);await selected('none',0,'Real empty-canvas click clears view selection');
  }
  async function frame(label) {
    let last = '', since = 0;
    return waitFor('stationary unselected Normal To crop: ' + label, async () => {
      await raf();const current=await cameraFrame(), {rawSha256,...compared}=current;
      check(current.width>0&&current.height>0&&/^[0-9a-f]{64}$/.test(current.sha256)&&/^[0-9a-f]{64}$/.test(rawSha256),'Fresh bounded canvas pixels');
      check(current.maskedRects.length===0&&current.unmaskedPixelCount===current.width*current.height,'Exact raster case has no origin labels or exclusions');
      const signature=canonical(compared);if(signature!==last){last=signature;since=Date.now();return false;}
      return Date.now()-since>=500?current:false;
    });
  }
  async function waitNormal(label) {
    await raf();await waitFor(label,()=>page(selector=>!!document.querySelector(selector)&&!document.querySelector(selector).disabled,normalButton));
  }
  async function normal(method = 'key') {
    const before = await selection();check(before?.enabled, 'Current admitted selection before Normal To');
    check(normalCommands.length<32,'Bounded fixed-route command observations');
    const command={kind,method,before,nativeTargets:nativeTargets(before),presentationBefore:await presentation()};normalCommands.push(command);
    if(method==='key')await key('8');
    else if(method==='button')await actual(normalButton);
    else {
      // A visible native select is the same existing toolbar command. Pointer
      // opens it, then its actual option is chosen by the bounded key transport.
      await actual('select[aria-label="Orientación de vista"]');
      await c.menuKey('End');await c.menuKey('Enter');
    }
    await waitNormal('Normal To request presented');
    command.after=await selection();command.presentationAfter=await presentation();
    check(canonical(command.after)===canonical(before),'View command retains ordered selected identities');
    await unchanged('Normal To '+method);
  }
  function faces(owner='ground') {
    return kind==='part' ? native.bodies.flatMap(b=>b.faces) : native.bodies.filter(b=>canonical(b.component.occurrencePath)===canonical([owner])).flatMap(b=>b.faces);
  }
  function faceFrame(face) {
    if(kind==='part')return face.frame;
    const s=face.worldSupport;return s?.kind==='plane'?{origin:s.point,normal:s.normal,xDirection:s.xDirection}:null;
  }
  function faceKey(face) {
    if(kind==='part')return JSON.stringify(['face',face.ref.sourceFeatureId,face.ref.key]);
    const s=face.selection,component=JSON.stringify([s.component.occurrencePath,s.component.definition.id,s.component.definition.revision]);
    return JSON.stringify([component,s.body?[s.body.bodyId,s.body.sourceFeatureId]:null,s.face.sourceFeatureId,s.face.key]);
  }
  function planeFace(axis, position, owner='ground') {
    const matches=faces(owner).filter(f=>{const p=faceFrame(f);return p&&Math.abs(Math.abs(p.normal[axis])-1)<1e-6&&Math.abs(p.origin[axis]-position)<1e-6;});
    check(matches.length===1,'Unique native analytical plane '+owner+'/'+axis+'/'+position);return matches[0];
  }
  async function project(world, basis) {
    // The box envelope and fit convention are analytical fixture inputs. No
    // camera/React/Three state is read, and no application projection helper runs.
    const center=kind==='part'?[0,0,2]:[13,0,2];
    const right=unit(cross(basis.up,basis.direction)),up=unit(basis.up),offset=world.map((v,i)=>v-center[i]);
    const projected=[dot(offset,right),dot(offset,up)];
    return page((selector,projected,isPart)=>{
      const e=document.querySelector(selector),r=e?.getBoundingClientRect();if(!r?.width||!r.height)throw Error('Current material canvas required');
      const scale=isPart?Math.min(r.width,r.height)/(1.64*30):r.height/(1.3*Math.hypot(46,20,4));
      const p={x:r.left+r.width/2+projected[0]*scale,y:r.top+r.height/2-projected[1]*scale};
      if(p.x<=r.left+8||p.x>=r.right-8||p.y<=r.top+8||p.y>=r.bottom-8||document.elementFromPoint(p.x,p.y)!==e)throw Error('Independent projected point must hit visible canvas');
      return p;
    },canvas(),projected,kind==='part');
  }
  async function pick(world,basis,wanted,label,additive=false) {
    const point=await project(world,basis);
    const record={kind,phase:label,world,expectedDirection:basis.direction,expectedUp:basis.up,point,faceKey:faceKey(wanted),
      wantedNativeFrame:faceFrame(wanted),wantedNativeAxis:kind==='part'?wanted.viewAxis:wanted.worldViewAxis,
      selectionBefore:await selection(),presentationBefore:await presentation(),polls:0,first:null,last:null};
    phases.push(record);await pressAt(point,additive);record.presentationAfter=await presentation();
    await waitFor(label,async()=>{
      const s=await selection(),key=faceKey(wanted);
      const sample={selection:s,nativeTargets:nativeTargets(s)};
      record.polls++;record.first??=sample;record.last=sample;
      return kind==='part'?s?.keys?.includes(key):s?.keys?.some(value=>value[0]==='face'&&value[1]===key);
    });
    record.completed=true;
    await unchanged(label);
  }
  async function selectPlane(plane,additive=false,owner=null) {
    if(kind==='part')await actual('.tree-row.plane',({XY:'Alzado',XZ:'Planta',YZ:'Vista lateral'})[plane],additive);
    else {
      const selector=await page((plane,owner)=>{
        const rows=[...document.querySelectorAll('[data-assembly-origin-tree-reference]')].filter(e=>{
          const r=JSON.parse(e.dataset.assemblyOriginTreeReference);return r.kind==='principal-plane'&&r.plane===plane
            &&JSON.stringify(r.component?.occurrencePath??[])===JSON.stringify(owner?[owner]:[]);
        });
        if(rows.length!==1)throw Error('Unique actual datum row required');
        return '[data-assembly-origin-tree-key='+JSON.stringify(rows[0].dataset.assemblyOriginTreeKey)+']';
      },plane,owner);
      await actual(selector,null,additive);
    }
    await selected(additive?'planes':'plane',additive?2:1,'Ordered real principal-plane selection');
  }
  async function open(current) {
    kind=current;const before=(await observe()).serial;await key('O');
    if(kind==='part'){
      // Only the disposable startup demo in this hidden test-owned session is
      // replaced. The three original inputs are never edited or discarded.
      const dialog='[role="dialog"][aria-labelledby="discard-title"]';
      await waitFor('Owned startup demo asks before replacement',()=>page(selector=>!!document.querySelector(selector),dialog));
      await actual(dialog+' button','Continuar sin guardar');
    }
    native=await waitFor('Healthy original '+kind+' document',async()=>{
      const state=await observe();check(!state.workerErrors.length,'Worker remains error-free');
      if(kind==='part'){
        const row=state.builds.filter(r=>r.serial>before&&r.features?.[0]?.id==='normal-profile'&&r.response?.ok).at(-1);
        return row&&!row.response.value.featureErrors.length&&row.response.value.bodies?.length===1?row.response.value:false;
      }
      const row=state.assemblies.filter(r=>r.serial>before&&r.response?.ok).at(-1);let value=row?.response.value;
      for(let i=0;value&&i<4;i++,value=value.scene)if(value.kind==='assembly-scene'&&value.bodies?.length===2)return value;
      return false;
    });
    await waitFor('Exact original recovery '+kind,async()=>{const raw=await recovery();return raw&&canonical(JSON.parse(raw))===canonical(documents[kind]);});
    await waitFor('Normal To controls mounted '+kind,async()=>{const s=await selection();return !!s&&typeof s.kind==='string'&&Array.isArray(s.keys);});
    check(native.bodies.length===(kind==='part'?1:2),'Expected original body count');
    for(const body of native.bodies){near(body.volume,960-4.5*Math.PI,1e-5,'Independent pocket volume');
      if(kind!=='part')near(body.area,736+6*Math.PI,1e-5,'Independent native pocket BRep area');
    }
    const bounds=kind==='part'?native.bodies[0].bounds:native.bounds;
    for(let i=0;i<3;i++){near(bounds.min[i],(kind==='part'?[-10,-6,0]:[-10,-10,0])[i],1e-6,'Original minimum');near(bounds.max[i],(kind==='part'?[10,6,4]:[36,10,4])[i],1e-6,'Original maximum');}
    check(faces().length>=8,'Current face inventory includes independent pocket faces');
    if(kind==='part')await actual('button[data-part-selection-mode="face"]');
    await clear();baseline=await snapshot();phases.push({kind,phase:'opened',volume:native.bodies.map(b=>b.volume),bounds});
  }
  async function emptyPrevious() {
    await key('7');const before=await frame(kind+' isometric');await key('8');const aligned=await frame(kind+' nearest');
    check(before.sha256!==aligned.sha256&&before.width===aligned.width&&before.height===aligned.height,'No-selection Normal To actually changes isometric raster');
    await key('ShiftZ');const restored=await frame(kind+' Previous');
    check(restored.sha256===before.sha256&&restored.width===before.width&&restored.height===before.height,'Previous restores every compared unselected pixel exactly');
    await unchanged('Nearest and Previous');phases.push({kind,phase:'nearest-previous',rasterCompared:true,before,aligned,restored});
    await key('8');await waitNormal('Nearest cardinal orientation');
    await pick([-4,1,2],front,planeFace(2,2),'Nearest isometric tie reaches front pocket floor');
  }
  async function planarAndPair() {
    const top=planeFace(2,4),floor=planeFace(2,2),bottom=planeFace(2,0);
    await key('1');if(kind==='part')await actual('button[data-part-selection-mode="face"]');
    await pick([5,-2,4],front,top,'Actual upper planar face');
    await selected('plane',1,'One current planar face admits Normal To');await normal('button');
    await pick([-4,1,2],natural(faceFrame(top)),floor,'Natural planar orientation locates asymmetric pocket floor');
    await normal();await normal('button');const flipped=natural(faceFrame(floor));flipped.direction=flipped.direction.map(v=>-v);
    await pick([-4,1,0],flipped,bottom,'Repeated target flips to opposite side while retaining up');
    await key('1');await pick([5,-2,4],front,top,'Reselect upper plane for ordered pair');
    await selectPlane('YZ',true);const ordered=await selection();await normal();
    await pick([-4,1,2],pair(faceFrame(top),principal('YZ')),floor,'Ordered second datum normal points up');
    phases.push({kind,phase:'ordered-pair',ordered,rasterCompared:false});
    await selectPlane('YZ');await selectPlane('XY',true);await normal('menu');
    // The turned occurrence is in front of ground when looking from +X.
    const side=kind==='part'?10:36,owner=kind==='part'?'ground':'turned';
    await pick([side,1,3],pair(principal('YZ'),principal('XY')),planeFace(0,side,owner),'Reversed ordered pair looks along X with Z up');
    if(kind!=='part'){
      await selectPlane('YZ',false,'turned');await normal();
      await pick([29,10,3],{direction:[0,1,0],up:[0,0,1]},planeFace(1,10,'turned'),'Rotated occurrence plane uses its world pose exactly once');
    }
  }
  async function curved() {
    await key('7');if(kind==='part')await actual('button[data-part-selection-mode="face"]');
    const curves=faces().filter(f=>kind==='part'?!!f.viewAxis:!!f.worldViewAxis||f.worldSupport?.kind==='cylinder');
    check(curves.length===1,'One original cylindrical pocket surface');const curved=curves[0];
    await pick([-4-1.5/Math.sqrt(2),1-1.5/Math.sqrt(2),3],iso,curved,'Actual curved pocket face from an oblique view');
    await selected('axis',1,'Analytic curved face admits Normal To');await normal();
    const axis=kind==='part'?curved.viewAxis:curved.worldViewAxis??{direction:curved.worldSupport.axis,xDirection:curved.worldSupport.xDirection};
    const orientation=natural({normal:axis.direction,xDirection:axis.xDirection??[1,0,0]});
    near(Math.abs(orientation.direction[2]),1,1e-6,'Original cylindrical native axis is Z');
    const forward=orientation.direction[2]>0;
    await pick([-4,1,forward?2:0],orientation,planeFace(2,forward?2:0),'Curved face Normal To looks along its analytic axis');
  }
  async function rejectedSelection() {
    await key('1');if(kind==='part')await actual('button[data-part-selection-mode="face"]');
    const top=planeFace(2,4);await pick([5,-2,4],front,top,'Current face before parallel-pair rejection');
    // Admission rejection is fixed and explicit, never treated as no selection.
    if(kind==='part')await actual('.tree-row.plane','Alzado',true);
    else {
      const selector=await page(()=>{const e=[...document.querySelectorAll('[data-assembly-origin-tree-reference]')].find(e=>{const r=JSON.parse(e.dataset.assemblyOriginTreeReference);return r.kind==='principal-plane'&&r.plane==='XY'&&r.component===null;});if(!e)throw Error('Root XY datum required');return '[data-assembly-origin-tree-key='+JSON.stringify(e.dataset.assemblyOriginTreeKey)+']';});
      await actual(selector,null,true);
    }
    const rejected=await selected(kind==='part'?'planes':'invalid',2,'Parallel pair disables Normal To',false);const before=await snapshot();
    await key('8');await raf();check(canonical(await selection())===canonical(rejected),'Rejected pair stays selected');await unchanged('Rejected parallel pair',before);
    if(kind==='part'){
      await key('1');await pick([5,-2,4],front,top,'Single face before additive removal');
      await pressAt(await project([5,-2,4],front),true);await selected('none',0,'Ctrl-click removes the last selected face');
      // Catalog selection deliberately keeps the existing empty face ticket;
      // changing the picking mode would clear it and miss this regression.
      await key('7');await actual('.part-body-catalog .body-row input[type="checkbox"]');
      await selected('invalid',0,'Body selection cannot reuse an empty face ticket as nearest');
      const bodyState=await snapshot(),bodySelection=await selection();await key('8');await raf();
      check(canonical(await selection())===canonical(bodySelection),'Rejected body shortcut retains the unsupported selection');await unchanged('Rejected body shortcut',bodyState);
      await actual('button[data-part-selection-mode="face"]');
      const curves=faces().filter(f=>!!f.viewAxis);check(curves.length===1,'Original curved witness remains current');
      await pick([-4-1.5/Math.sqrt(2),1-1.5/Math.sqrt(2),3],iso,curves[0],'Rejected body shortcut retains oblique orientation instead of nearest');
    }
  }
  async function partFeatureAndSketch() {
    await actual('.tree-row[data-feature-id="normal-base"]');await selected('plane',1,'Single-sketch feature admits Normal To');await normal('button');
    await pick([-4,1,2],front,planeFace(2,2),'Single-sketch feature uses its original XY support');
    await actual('button[data-part-tree-toggle="normal-pocket"]');
    await actual('.tree-row[data-feature-id="normal-pocket-profile"][data-parent-feature-id="normal-pocket"]',null,false,true);
    const svg='svg[aria-label="Editor de croquis multientidad"]';
    await waitFor('Original circle sketch editor ready',()=>page(selector=>!!document.querySelector(selector)&&document.querySelector('button[title="Aceptar operación"]')?.disabled===false,svg));
    const sketchState=()=>page(selector=>{
      const e=document.querySelector(selector),circle=e?.querySelector('[data-selection-kind="entity"][data-selection-id="pocket-circle"]');
      if(!e||!circle)throw Error('Actual original circle entity required');const r=circle.getBoundingClientRect(),s=e.getBoundingClientRect();
      return {circle:{x:r.x,y:r.y,width:r.width,height:r.height},svg:{x:s.x,y:s.y,width:s.width,height:s.height},point:{x:s.x+s.width/2,y:s.y+s.height/2}};
    },svg);
    await key('8');await raf();const fitted=await sketchState(),inside=await snapshot();
    await wheel(fitted.point,-240);await waitFor('Actual sketch wheel changes scale',async()=>Math.abs((await sketchState()).circle.width-fitted.circle.width)>.5);
    await key('8');await waitFor('Normal To restores the 2D sketch framing',async()=>{
      const current=await sketchState();return ['x','y','width','height'].every(k=>Math.abs(current.circle[k]-fitted.circle[k])<=.11);
    });
    await unchanged('Settled 2D Normal To and physical zoom',inside);
    phases.push({kind,phase:'2d-sketch-normal',fitted,restored:await sketchState(),rasterCompared:false});
    await actual('button[title="Cancelar operación"]');
    await waitFor('Part editor cancelled without committed edit',()=>page(()=>!document.querySelector('.property-manager')&&document.querySelector('.statusbar')?.textContent.includes('Listo')));
    await waitFor('Original committed build after editor cancellation',async()=>{const s=await observe(),r=s.builds.at(-1);return !s.workerErrors.length&&r?.response?.ok&&!r.response.value.featureErrors.length&&canonical(r.features)===canonical(documents.part.features);});
    check(await recovery()===inside.recovery,'2D entry/Cancel preserves exact document');check(canonical(ipc)===canonical(inside.ipc),'2D entry/Cancel performs no file IPC');
    baseline=await snapshot();
  }
  return async () => {
    const originalBytes={};for(const name of ['part','standard','configured'])originalBytes[name]=await fs.readFile(inputs[name]);
    await waitFor('Normal To initial production startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    for(const current of ['part','standard','configured']){
      await open(current);await emptyPrevious();await planarAndPair();await curved();await rejectedSelection();
      if(kind==='part')await partFeatureAndSketch();
      await clear();await unchanged('Completed '+kind+' camera workflow');
    }
    check(dialogCounts().opens===3&&dialogCounts().saves===0,'Exactly three granted original Opens and no Saves');
    for(const name of ['part','standard','configured']){
      const after=await fs.readFile(inputs[name]);check(after.equals(originalBytes[name]),'Original '+name+' bytes untouched');
      phases.push({kind:name,phase:'input-preserved',sha256:digest(after)});
    }
    check(!consoleErrors.length&&!failedRequests.length,'No renderer/resource errors');
    check(protocolResponses.some(p=>/kernel\.worker-[\w-]+\.js$/.test(p.url)&&p.status===200)&&protocolResponses.some(p=>p.url.endsWith('.wasm')&&p.status===200),'Actual production worker and WASM loaded');
    evidence.completed=true;
  };
};
