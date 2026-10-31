'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Fixed production-renderer route. Native pointer input selects references;
// form select values are explicitly scripted. Geometry oracles use the literal
// prism corners/axes/planes, never the application's solver or reference helpers.
module.exports = function mateReferenceEditWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, capture, cameraFrame, checks, check,
    canonical, digest, ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs } = context;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value =>
    'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = require('./desktop-assembly-navigation.cjs').withNavigation({ ...context, page }).assemblyNavigation;
  const attr = (name, value) => '[' + name + '=' + JSON.stringify(value) + ']';
  const aria = label => 'button' + attr('aria-label', label);
  const role = slot => aria('Referencia ' + slot + ' de la relación');
  const clear = slot => aria('Quitar referencia ' + slot + ' de la relación');
  const APPLY = aria('Aplicar ensamblaje'), CANCEL = aria('Cancelar vista previa del ensamblaje');
  const definition = { id: expected.definitions[0].id, revision: expected.definitions[0].revision };
  const labels = { distance: ['Editar distancia', 'Vista previa de la distancia editada'],
    angle: ['Editar ángulo', 'Vista previa del ángulo editado'],
    coincident: ['Editar coincidencia', 'Vista previa de la relación editada'],
    concentric: ['Editar concentricidad', 'Vista previa de la relación editada'] };
  const phases = [], gestures = [];
  const evidence = { scenario: 'mate-reference-edit', phases, gestures,
    provenance: 'Five uses of the tracked, independently authored 3 by 2 by 4 mm prism. No external CAD or vendor data.',
    tolerances: { volumeMm3: 1e-5, areaMm2: 1e-5, boundsAndPlaneMm: 1e-6, directionAndAngleRad: 1e-6 },
    limits: 'Standard root scope; four independent mates and one fixed occurrence. Actual pointer datum, planar face and LINE picks; selects are scripted visible controls. Only distance and angle require exact Cancel raster restoration, with origins hidden through their real checkboxes. Coincidence and concentricity use UI, document, token, native geometry, history and persistence checks without raster comparison. All four restore origin keys, selection and projected anchors semantically, without an origin-overlay pixel-equivalence claim. No nested/configured reference-editing or cross-platform claim; free coordinates are not unique-pose oracles.' };
  checks.push(evidence);
  const near = (a, b, tolerance, message) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, message + ': ' + a + ' versus ' + b);
  const vector = (a, b, tolerance, message) => { check(Array.isArray(a) && a.length === b.length, message + ' dimensions'); a.forEach((v, i) => near(v, b[i], tolerance, message + '[' + i + ']')); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v*b[i], 0);
  function rotate(q, p) {
    near(Math.hypot(...q), 1, 1e-10, 'Unit owner quaternion');
    const t = cross(q.slice(0, 3), p).map(v => 2*v), c = cross(q.slice(0, 3), t);
    return p.map((v, i) => v + q[3]*t[i] + c[i]);
  }
  const occurrence = (doc, id) => { const rows = doc.occurrences.filter(o => o.id === id); check(rows.length === 1, 'Unique original owner'); return rows[0]; };
  const datum = (kind, id, value) => ({ kind, component: id ? { occurrencePath: [id], definition: { ...definition } } : null,
    [kind === 'principal-plane' ? 'plane' : 'axis']: value });
  const untimed = doc => ({ ...doc, updatedAt: null });
  const corners = doc => doc.occurrences.flatMap(o => [0, 3].flatMap(x => [0, 2].flatMap(y => [0, 4].map(z =>
    rotate(o.pose.rotation, [x, y, z]).map((v, i) => v + o.pose.translation[i])))));
  function envelope(points) {
    return { min: [0,1,2].map(i => Math.min(...points.map(p => p[i]))), max: [0,1,2].map(i => Math.max(...points.map(p => p[i]))) };
  }
  async function actual(selector, text = null) {
    if (await page(() => !!document.querySelector('.assembly-app'))) await navigation.reveal(selector, text ?? '');
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One enabled current control required: ' + selector + '/' + text);
      // A boundary-aligned target may be clipped after a manager reflow.
      // Center controls in the actual scrollable inspector, then let its real
      // layout settle. Viewport labels keep their existing nearest behavior.
      const inspector=rows[0].closest('[role="tabpanel"][id^="assembly-panel-"]');
      rows[0].scrollIntoView({ block: inspector ? 'center' : 'nearest', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))));
    const inspect = () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1) return null;
      const e = rows[0], r = e.getBoundingClientRect(), p = { x: r.left+r.width/2, y: r.top+r.height/2 }, hit = document.elementFromPoint(p.x,p.y);
      let left=0, right=innerWidth, top=0, bottom=innerHeight;
      const scrollAncestors=[];
      for(let parent=e.parentElement;parent;parent=parent.parentElement) {
        const s=getComputedStyle(parent), b=parent.getBoundingClientRect();
        if(/(auto|scroll|hidden|clip)/.test(s.overflowX)){left=Math.max(left,b.left+parent.clientLeft);right=Math.min(right,b.left+parent.clientLeft+parent.clientWidth);}
        if(/(auto|scroll|hidden|clip)/.test(s.overflowY)){top=Math.max(top,b.top+parent.clientTop);bottom=Math.min(bottom,b.top+parent.clientTop+parent.clientHeight);}
        if(scrollAncestors.length<8&&/(auto|scroll|hidden|clip)/.test(s.overflowX+' '+s.overflowY))scrollAncestors.push({
          tag:parent.tagName,id:parent.id,scrollTop:parent.scrollTop,scrollLeft:parent.scrollLeft,
          clientWidth:parent.clientWidth,clientHeight:parent.clientHeight,scrollWidth:parent.scrollWidth,scrollHeight:parent.scrollHeight,
          rect:{x:b.x,y:b.y,width:b.width,height:b.height}});
      }
      const host=e.closest('.assembly-viewport'),canvas=host?.querySelector('canvas'),cr=canvas?.getBoundingClientRect();
      return { point:p, rect:{x:r.x,y:r.y,width:r.width,height:r.height}, visible:!e.disabled&&!e.closest('[hidden]')&&e.checkVisibility({visibilityProperty:true})
        &&r.width>0&&r.height>0&&r.left>=left&&r.right<=right&&r.top>=top&&r.bottom<=bottom&&!!hit&&(hit===e||e.contains(hit)),
        frameCurrent:!host||!!cr&&Math.abs(cr.width-host.clientWidth)<1&&Math.abs(cr.height-host.clientHeight)<1,
        diagnostic:{disabled:e.disabled,hidden:!!e.closest('[hidden]'),clip:{left,right,top,bottom},scrollAncestors,
          hit:hit?{tag:hit.tagName,id:hit.id,label:hit.getAttribute('aria-label'),owns:hit===e||e.contains(hit)}:null} };
    },selector,text);
    // Diagnostics do not change the original stable-target/hit-test contract.
    const targetKey=state=>{if(!state)return canonical(state);const{diagnostic,...target}=state;return canonical(target);};
    let previous, since=0;
    const readiness={selector,text,polls:0,first:null,last:null};
    let target;
    try{
      target=await waitFor('stationary reference-edit control '+(text??selector),async()=>{
        const state=await inspect(), key=targetKey(state);if(key!==previous){previous=key;since=Date.now();}
        readiness.polls++;readiness.first??=state;readiness.last=state;
        return state?.visible&&state.frameCurrent&&Date.now()-since>=120?state:false;
      });
    }catch(error){
      checks.push({controlReadiness:readiness});
      throw Error(error.message+'; target='+JSON.stringify(readiness),{cause:error});
    }
    await pointer('mouseMoved',target.point);
    check(targetKey(await inspect())===targetKey(target),'Pointer target remains stationary before press');
    await pointer('mousePressed',target.point,1);await pointer('mouseReleased',target.point,0);
    gestures.push({action:'pointer',selector,text,point:target.point});
  }
  const button = (text, parent='.assembly-app') => actual(parent+' button',text);
  async function control(selector, value) {
    await navigation.reveal(selector);
    await page((selector,value)=>{
      const e=document.querySelector(selector);
      if(!e||e.disabled||e.closest('[hidden]')||!e.checkVisibility({visibilityProperty:true}))throw Error('Visible enabled select required');
      if(!(e instanceof HTMLSelectElement)||![...e.options].some(o=>o.value===value&&!o.disabled))throw Error('Existing exact select option required');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,value);
      e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
    },selector,value);
    await waitFor('visible scripted selection retained',()=>page((selector,value)=>document.querySelector(selector)?.value===value,selector,value));
    gestures.push({action:'visible-scripted-select',selector,value});
  }
  const serial = async () => (await observe.counters()).serial;
  async function response(after, action) {
    return waitFor('reference-edit worker '+action,async()=>{
      const state=await observe.assemblyResponseAfter(after,action);
      check(!state.workerErrors.length&&state.completedCount<=1,'No worker errors or duplicate completed '+action);
      if(!state.record)return false;
      check(state.record.response.ok,state.record.response.error||'Worker rejected '+action);return state.record;
    });
  }
  async function recovery(doc) {
    await waitFor('exact committed graph and idle renderer',()=>page(wanted=>{
      const raw=localStorage.getItem('solidflow.autosave');
      return document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false'&&raw?JSON.parse(raw):false;
    }).then(value=>value&&canonical(value)===canonical(doc)));
  }
  const ui = () => page(()=>({recovery:localStorage.getItem('solidflow.autosave'),
    undo:document.querySelector('[aria-label="Deshacer ensamblaje"]')?.disabled,
    redo:document.querySelector('[aria-label="Rehacer ensamblaje"]')?.disabled,
    apply:document.querySelector('[aria-label="Aplicar ensamblaje"]')?.disabled,
    label:document.querySelector('.assembly-canvas-label span')?.textContent}));
  // Read-only presentation diagnostics. Projected origin anchors distinguish
  // camera/layout changes from equal-geometry compositing differences without
  // accessing Three/React state or injecting a camera or selection. GPU reads
  // describe only the last bound program after capture, not every frame draw.
  const presentation = () => page(()=>{
    const rectangle=e=>{const r=e?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
    const host=document.querySelector('.assembly-viewport'),canvas=host?.querySelector('canvas');
    const labels=[...document.querySelectorAll('.assembly-origin-labels > button[data-origin-key]')];
    const leaders=[...document.querySelectorAll('.assembly-origin-leaders line')];
    if(labels.length>32||leaders.length>32)throw Error('Bounded origin presentation required');
    // The production Three renderer has already created this WebGL2 context.
    // These queries neither bind a program nor set uniforms, viewport or any
    // other GPU state. In particular, do not consume the GL error queue.
    const gl=canvas?.getContext('webgl2');
    let diagnosticGpu={available:false};
    if(gl){
      const program=gl.getParameter(gl.CURRENT_PROGRAM),viewport=gl.getParameter(gl.VIEWPORT);
      const matrices={};
      for(const name of ['projectionMatrix','modelViewMatrix','viewMatrix']){
        const location=program?gl.getUniformLocation(program,name):null;
        const value=location===null?null:gl.getUniform(program,location);
        matrices[name]=value instanceof Float32Array&&value.length===16&&[...value].every(Number.isFinite)?Array.from(value):null;
      }
      diagnosticGpu={available:true,programBound:program!==null,lastBoundProgramOnly:true,sampledAfterCapture:true,
        activeUniformCount:program?gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS):0,
        viewport:viewport instanceof Int32Array&&viewport.length===4?Array.from(viewport):null,matrices};
    }
    return {viewport:rectangle(host),canvas:rectangle(canvas),canvasWidth:canvas?.width,canvasHeight:canvas?.height,
      devicePixelRatio,selectedPath:document.querySelector('[data-assembly-tree-path][aria-selected="true"]')?.getAttribute('data-assembly-tree-path')??null,
      picking:host?.getAttribute('data-reference-picking'),dragAxis:host?.getAttribute('data-drag-axis'),
      originOwner:document.querySelector('[aria-label="Orígenes visibles de"]')?.value,
      labels:labels.map(e=>({key:e.dataset.originKey,text:e.textContent,rect:rectangle(e),className:e.className,disabled:e.disabled})),
      leaders:leaders.map(e=>Object.fromEntries(['x1','y1','x2','y2'].map(k=>[k,e.getAttribute(k)]))),diagnosticGpu};
  });
  const visiblePresentation=({diagnosticGpu,...value})=>value;
  const originVisibility=()=>page(()=>[1,2].map(index=>{
    const checkbox=document.querySelector('.assembly-origin-tools label:nth-of-type('+index+') input');
    if(!(checkbox instanceof HTMLInputElement)||checkbox.type!=='checkbox')throw Error('Exact origin visibility checkbox required');
    return checkbox.checked;
  }));
  async function setOriginVisibility(wanted){
    for(let index=0;index<2;index++){
      if((await originVisibility())[index]!==wanted[index])await actual('.assembly-origin-tools label:nth-of-type('+(index+1)+') input');
    }
    await waitFor('actual origin visibility checkboxes retain requested state',async()=>canonical(await originVisibility())===canonical(wanted));
  }
  const editor = type => page(preview=>({
    type:document.querySelector('[aria-label="Tipo de relación"]')?.value,
    typeDisabled:document.querySelector('[aria-label="Tipo de relación"]')?.disabled,
    refs:[1,2].map(slot=>{const e=document.querySelector('[aria-label="Referencia '+slot+' de la relación"]');return {text:e?.querySelector('span')?.textContent,disabled:e?.disabled};}),
    clearDisabled:[1,2].map(slot=>document.querySelector('[aria-label="Quitar referencia '+slot+' de la relación"]')?.disabled),
    previewDisabled:document.querySelector(preview)?.disabled,
    unlock:document.querySelector('[aria-label="Desbloquear giro"]')?.checked??null,
    genericSolveDisabled:document.querySelector('[aria-label="Resolver ensamblaje"]')?.disabled,
    relationActions:[...document.querySelectorAll('#assembly-existing-relations .assembly-mate-row button, #assembly-existing-relations .assembly-mate-row input')]
      .map(e=>({label:e.getAttribute('aria-label'),disabled:e.disabled})),
    relativeCapture:[...document.querySelectorAll('#assembly-existing-relations button')]
      .filter(e=>e.textContent.trim()==='Capturar y resolver desde la vista previa').map(e=>e.disabled)
  }),aria(labels[type][1]));
  function guarded(state) {
    const actions=state.relationActions;
    return state.genericSolveDisabled && actions.length===13 && actions.every(e=>e.disabled)
      && ['Editar ', 'Eliminar ', 'Activar '].every(prefix=>actions.filter(e=>e.label?.startsWith(prefix)).length===4)
      && actions.filter(e=>e.label==='Bloquear giro Original concentric').length===1
      && state.relativeCapture.length===1 && state.relativeCapture[0]===true;
  }
  function geometry(scene,doc,phase) {
    check(doc.version===2&&doc.kind==='assembly'&&doc.id===expected.id&&doc.revision===expected.revision
      &&canonical(doc.definitions)===canonical(expected.definitions)&&doc.occurrences.length===5&&doc.mates.length===4,'Exact graph identities and reused source');
    check(canonical(doc.occurrences.map(o=>({...o,pose:null})))===canonical(expected.occurrences.map(o=>({...o,pose:null})))
      &&canonical(occurrence(doc,'ground'))===canonical(occurrence(expected,'ground')),'Exact occurrence identities, flags and fixed ground');
    check(scene.kind==='assembly-scene'&&scene.solidCount===5&&scene.bodies.length===5&&scene.prototypeCount===1&&!scene.warnings.length,'Exact native prism counts');
    near(scene.volume,120,1e-5,'Total independent volume');near(scene.area,260,1e-5,'Total independent area');
    const placements=[];
    for(const o of doc.occurrences){
      const bodies=scene.bodies.filter(b=>canonical(b.component)===canonical({occurrencePath:[o.id],definition}));
      check(bodies.length===1&&bodies[0].solidCount===1,'One exact current native owner');const b=bodies[0];
      near(b.volume,24,1e-5,'Member volume');near(b.area,52,1e-5,'Member area');
      vector(b.worldPose.translation,o.pose.translation,1e-6,'Member world translation');
      vector(b.worldPose.rotation,o.pose.rotation,1e-10,'Member world quaternion');
      const bounds=envelope(corners({...doc,occurrences:[o]}));
      vector(b.bounds.min,bounds.min,1e-6,'Eight literal corners lower bounds');vector(b.bounds.max,bounds.max,1e-6,'Eight literal corners upper bounds');
      // kernel.assembly-scene meshes the placed native BRep. The viewport uses
      // these world vertices directly, without applying worldPose a second time.
      // The observer summarizes the real vertices before compacting its DTO;
      // no raw vertex buffer is copied through the observation boundary.
      check(Number.isInteger(b.worldMeshVertexCount)&&b.worldMeshVertexCount>=8&&b.worldMeshBounds,
        'Finite complete world-space prism mesh summary');
      const meshBounds=b.worldMeshBounds;
      vector(meshBounds.min,bounds.min,1e-6,'World mesh extrema match eight literal corners minimum');
      vector(meshBounds.max,bounds.max,1e-6,'World mesh extrema match eight literal corners maximum');
      placements.push({id:o.id,translation:[...o.pose.translation],rotation:[...o.pose.rotation],nativeBounds:b.bounds,
        meshVertexCount:b.worldMeshVertexCount,meshBounds});
    }
    const bounds=envelope(corners(doc));vector(scene.bounds.min,bounds.min,1e-6,'Whole assembly lower bounds');vector(scene.bounds.max,bounds.max,1e-6,'Whole assembly upper bounds');
    // Independent separation/direction checks for the four authored families.
    // Supports are literal datum axes or the original top face/front top X
    // edge, never solver DTO values. This loop does not certify locked roll.
    for(const m of doc.mates){
      const original=expected.mates.find(x=>x.id===m.id);
      check(original&&m.type===original.type&&m.name===original.name&&m.suppressed===original.suppressed,'ID/type/name/suppression survive replacement');
      const frame=r=>r.component?occurrence(doc,r.component.occurrencePath[0]).pose:{translation:[0,0,0],rotation:[0,0,0,1]};
      const point=(r,p=[0,0,0])=>rotate(frame(r).rotation,p).map((v,i)=>v+frame(r).translation[i]);
      const direction=(r,v)=>rotate(frame(r).rotation,v);
      if(m.type==='distance'||m.type==='coincident'){
        const normal=m.type==='distance'?[1,0,0]:[0,0,1], a=direction(m.first,normal),b=direction(m.second,normal);
        const firstPoint=point(m.first,m.first.kind==='face'?[0,0,4]:[0,0,0]),secondPoint=point(m.second);
        near(dot(a,b),1,1e-6,'Aligned literal plane normals');
        near(dot(b,firstPoint.map((v,i)=>v-secondPoint[i])),m.type==='distance'?-8:0,1e-6,'Independent signed plane separation');
      }else if(m.type==='angle'){
        const a=direction(m.first,[0,0,1]),b=direction(m.second,[1,0,0]);
        near(Math.atan2(Math.hypot(...cross(a,b)),dot(a,b)),Math.PI/2,1e-6,'Independent Z to material/datum X angle');
      }else{
        const a=direction(m.first,[0,0,1]),b=direction(m.second,[0,0,1]),delta=point(m.first).map((v,i)=>v-point(m.second)[i]);
        near(dot(a,b),1,1e-6,'Aligned concentric axes');near(Math.hypot(...cross(delta,b)),0,1e-6,'Concentric axis separation');
      }
    }
    phases.push({phase,documentSha256:digest(canonical(doc)),volume:scene.volume,area:scene.area,solids:scene.solidCount,
      sceneId:scene.sceneId,placements});
  }
  async function build(after,wanted,phase){
    const event=await response(after,'build-assembly');
    check(canonical(event.document)===canonical(wanted),'Exact complete '+phase+' graph');geometry(event.response.value,wanted,phase);await recovery(wanted);return event.response.value;
  }
  async function origin(slot,kind,id,value){
    if(id)await actual('[data-assembly-tree-path]'+attr('data-assembly-tree-path',JSON.stringify([id])));
    await control('[aria-label="Orígenes visibles de"]',id?'selected':'scope');
    const toggle='.assembly-origin-tools label:nth-of-type('+(kind==='principal-axis'?1:2)+') input';
    if(!await page(s=>document.querySelector(s)?.checked,toggle))await actual(toggle);
    await actual(role(slot));await actual('[aria-label="Seleccionar orígenes"]');
    const key=JSON.stringify([kind,id?[[id],definition.id,definition.revision]:null,value]);
    const selector='button[data-origin-key]'+attr('data-origin-key',key),before=await serial();
    await waitFor('mounted exact active origin role',()=>page((selector,slot)=>{
      const e=document.querySelector(selector),r=document.querySelector('[aria-label="Referencia '+slot+' de la relación"]');
      return !!e&&!e.disabled&&r?.classList.contains('active')&&!r.disabled&&document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking')==='origin';
    },selector,slot));
    await actual(selector);
    const label=(id?occurrence(expected,id).name:'Ámbito actual')+' · '+(kind==='principal-axis'?'Eje de origen ':'')+value;
    await waitFor('exact origin stored in role',()=>page((selector,label)=>document.querySelector(selector+' span')?.textContent===label
      &&document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking')==='',role(slot),label));
    check(await serial()===before,'Origin reference choice creates no worker request');
    return datum(kind,id,value);
  }
  async function material(slot,kind,id,scene,doc){
    await actual(role(slot));
    if(kind==='edge')await actual('[aria-label="Seleccionar aristas lineales"]');
    await waitFor('current material picking mode',()=>page(kind=>document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking')===kind,kind));
    await actual('button[title="Frontal"]');await actual('button[title="Ajustar"]');
    await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))));
    const body=scene.bodies.find(b=>b.component.occurrencePath[0]===id);
    const supports=(kind==='face'?body.faces:body.edges).filter(r=>kind==='face'
      ?r.support?.kind==='plane'&&r.support.normal[2]>.999999&&Math.abs(r.support.point[2]-4)<1e-8
      :r.support?.kind==='line'&&Math.abs(r.support.axis[0])>.999999&&Math.abs(r.support.point[1])<1e-8&&Math.abs(r.support.point[2]-4)<1e-8);
    check(supports.length===1,'Unique analytical top plane or top-front X LINE');
    const reference={kind,...structuredClone(supports[0].selection),support:kind==='face'?'plane':'line'};
    const o=occurrence(doc,id),local=kind==='face'?[1.5,1,4]:[1.5,0,4],world=rotate(o.pose.rotation,local).map((v,i)=>v+o.pose.translation[i]);
    const bounds=envelope(corners(doc)),center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),span=Math.hypot(...bounds.min.map((v,i)=>bounds.max[i]-v));
    const rect=await page(()=>{const e=document.querySelector('.assembly-viewport canvas'),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
    const pixels=rect.height/(1.3*span),point={x:rect.x+rect.width/2+(world[0]-center[0])*pixels,y:rect.y+rect.height/2-(world[1]-center[1])*pixels};
    check(await page(point=>document.elementFromPoint(point.x,point.y)===document.querySelector('.assembly-viewport canvas'),point),'Analytical material point hits exposed canvas');
    const before=await serial();await pointer('mouseMoved',point);await pointer('mousePressed',point,1);await pointer('mouseReleased',point,0);
    await waitFor('material pick stores intended role and advances selection',()=>page((slot,kind,id)=>
      document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking')===(kind==='face'?'face':'')
      &&document.querySelector('[aria-label="Referencia '+slot+' de la relación"] span')?.textContent.includes(id),slot,kind,id));
    // A face pick intentionally keeps the next slot armed; LINE is one-shot.
    // Leave the face tool using its actual UI toggle before selecting a datum.
    if(kind==='face'){
      await actual('button[title="Seleccionar caras"]');
      await waitFor('face tool explicitly disarmed with reference retained',()=>page(slot=>
        document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking')===''
        &&document.querySelector('[aria-label="Referencia '+slot+' de la relación"] span')?.textContent.includes('ground'),slot));
    }
    check(await serial()===before,'Material choice creates no worker request');
    gestures.push({action:'material-pointer',slot,kind,world,point,reference});return reference;
  }
  async function preview(base,wantedMate,type,phase){
    const before=await serial();await actual(aria(labels[type][1]));const event=await response(before,'preview-assembly'),v=event.response.value;
    check(canonical(event.current)===canonical(base)&&v.status==='ready'&&v.hasToken&&v.checks.length===4&&v.checks.every(c=>c.satisfied&&c.lengthResidual<=c.lengthTolerance&&c.angleResidual<=c.angleTolerance)
      &&v.scopes.length===1&&!v.scopes[0].temporaryAnchor,'All four constraints verified against exact committed baseline');
    check(canonical(v.document.mates)===canonical(base.mates.map(m=>m.id===wantedMate.id?wantedMate:m)),'Only exact intended mate endpoints change; count/IDs/suppression/metadata preserved');
    geometry(v.scene,v.document,phase);await recovery(base);
    await waitFor('preview freezes reference controls and unrelated relation mutations',async()=>{const state=await editor(type);return guarded(state)&&state.refs.every(r=>r.disabled)&&state.clearDisabled.every(Boolean)&&state.previewDisabled;});
    return v;
  }
  async function edit(base,scene,type){
    // Fixed case scope, never a fallback after a failed pixel assertion.
    const exactRaster=type==='distance'||type==='angle';
    const rasterComparison=exactRaster?'exact':'semanticOnly';
    const rasterReason=exactRaster?null:'Outside the fixed distance/angle raster scope; functional, native geometry and semantic restoration checks apply.';
    const original=base.mates.find(m=>m.type===type);await actual(aria(labels[type][0]+' '+original.name));
    const opened=await waitFor('saved editable ordered references with guarded other actions',async()=>{const state=await editor(type);return state.type===type&&state.typeDisabled&&guarded(state)&&state.refs.every(r=>r.text&&!r.text.includes('Sin seleccionar')&&!r.disabled)&&!state.previewDisabled?state:false;});
    const beforeClear={ui:await ui(),counters:await observe.counters()};await actual(clear(1));
    await waitFor('missing endpoint disables preview',async()=>{const state=await editor(type);return state.clearDisabled[0]&&state.previewDisabled;});
    check(canonical({ui:await ui(),counters:await observe.counters()})===canonical(beforeClear),'Clearing draft leaves recovery/history/committed scene label and native history exact');
    let first,second=structuredClone(original.second);
    if(type==='distance'){
      // Both directions root/component, then the final component pair.
      await origin(1,'principal-plane','ground','YZ');await origin(1,'principal-plane',null,'YZ');
      first=await origin(1,'principal-plane','ground','YZ');second=await origin(2,'principal-plane','distance','YZ');
    }else if(type==='angle'){
      first=await origin(1,'principal-axis','ground','Z');second=await material(2,'edge','angle',scene,base);
    }else if(type==='coincident'){
      first=await material(1,'face','ground',scene,base);second=await origin(2,'principal-plane','coincident','XY');
    }else{
      first=await origin(1,'principal-axis','ground','Z');second=await origin(2,'principal-axis','concentric','Z');
      const locked=await editor(type);check(locked.previewDisabled&&!locked.unlock,'Changed owners cannot transfer a saved rotation lock');
      await actual('input[aria-label="Desbloquear giro"]');
      await waitFor('explicit rotation release enables preview',async()=>{const state=await editor(type);return state.unlock&&!state.previewDisabled;});
    }
    const wanted={...structuredClone(original),first,second,...(type==='concentric'?{rotationLock:null}:{})};
    // Clear hover via actual pointer transport before taking the exact central
    // render crop. Existing bounded text masks preserve every geometry pixel.
    await pointer('mouseMoved',{x:30,y:20});
    await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))));
    const originIntent={editor:await editor(type),ui:await ui(),counters:await observe.counters()};
    const originDisplay={visibility:await originVisibility(),before:visiblePresentation(await presentation()),hidden:false,restored:null};
    await setOriginVisibility([false,false]);
    await waitFor('origin overlays hidden by their actual checkboxes',()=>page(()=>
      !document.querySelector('.assembly-origin-labels [data-origin-key]')&&!document.querySelector('.assembly-origin-leaders line')));
    check(canonical({editor:await editor(type),ui:await ui(),counters:await observe.counters()})===canonical(originIntent),
      'Hiding origins preserves the selected reference draft, committed graph, history and complete worker counters');
    originDisplay.hidden=true;
    const diagnosticImages=[];
    const diagnosticFrame=async name=>{
      const {diagnosticImage,...frame}=await cameraFrame(type==='distance'&&name?{diagnostic:name}:undefined);
      if(diagnosticImage)diagnosticImages.push(diagnosticImage);
      return frame;
    };
    const renderRestoration={type,rasterComparison,rasterCompared:false,rasterReason,id:original.id,references:structuredClone([wanted.first,wanted.second]),
      before:null,secondBefore:null,baseline:null,baselineConfirmation:null,
      stability:exactRaster?{required:3,polls:0,consecutive:0,changes:0,last:null,distinct:[]}:null,
      preview:null,firstRestored:null,lastRestored:null,polls:0,distinct:[],diagnosticImages,originDisplay};
    checks.push({renderRestoration});
    const renderSignature=sample=>{
      // Passive GPU diagnostics must not strengthen or relax the established
      // exact pixel/layout acceptance criteria or change convergence history.
      return canonical({width:sample.frame.width,height:sample.frame.height,sha256:sample.frame.sha256,
        maskedRects:sample.frame.maskedRects,unmaskedPixelCount:sample.frame.unmaskedPixelCount,presentation:visiblePresentation(sample.presentation)});
    };
    let committedFrame=null,draft,committedUi;
    if(exactRaster){
      let previousSignature=null;
      // Use the existing absolute step deadline. Every difference restarts the
      // consecutive count; the first two observations and four distinct states
      // remain diagnostic evidence. No camera, rendering or overlay is changed.
      const stable=await waitFor('three exact consecutive pre-preview render frames',async()=>{
        await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))));
        const state=renderRestoration.stability;
        const sample={frame:await diagnosticFrame(state.polls===0?'before':undefined),presentation:await presentation()};
        const signature=renderSignature(sample),signatureSha256=digest(signature);
        state.polls++;
        renderRestoration.before??=sample;
        if(state.polls===2)renderRestoration.secondBefore=sample;
        state.last=sample;
        if(signature===previousSignature)state.consecutive++;
        else{if(previousSignature!==null)state.changes++;state.consecutive=1;previousSignature=signature;}
        const existing=state.distinct.find(value=>value.signatureSha256===signatureSha256);
        if(existing)existing.count++;
        else if(state.distinct.length<4)state.distinct.push({signatureSha256,count:1,sample});
        return state.consecutive===state.required?sample:false;
      });
      // Freeze the expectation once, before Preview. The fourth diagnostic PNG
      // must independently match that converged expectation; it cannot replace it.
      committedFrame=stable.frame;draft=await editor(type);committedUi=await ui();
      renderRestoration.baseline={...stable,editor:draft};
      renderRestoration.baselineConfirmation={frame:await diagnosticFrame('before-confirm'),presentation:await presentation()};
      check(renderSignature(renderRestoration.baselineConfirmation)===renderSignature(stable),
        'Confirmed pre-preview PNG retains exact converged pixels, canvas, origin anchors and selection');
    }else{
      draft=await editor(type);committedUi=await ui();
      renderRestoration.baseline={frame:null,presentation:await presentation(),editor:draft};
      renderRestoration.before=renderRestoration.baseline;
    }
    const firstPreview=await preview(base,wanted,type,type+'-preview');
    const readPreview=async()=>{
      // DOM confirmation may precede the viewport's scene effect and paint.
      // Await real frame delivery; do not render, fit or alter the camera.
      await page(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true)))));
      return {frame:exactRaster?await cameraFrame():null,presentation:await presentation()};
    };
    if(type==='distance'){
      near(occurrence(base,'distance').pose.translation[0],8,1e-6,'Original moving owner starts at literal X=8');
      near(occurrence(firstPreview.document,'distance').pose.translation[0],0,1e-6,'Edited planes require moving owner at literal X=0');
      const readiness={polls:0,first:null,last:null,distinct:[]};renderRestoration.previewReadiness=readiness;
      renderRestoration.preview=await waitFor('verified eight-millimetre preview reaches rendered geometry',async()=>{
        const sample=await readPreview();readiness.polls++;readiness.first??=sample;readiness.last=sample;
        if(readiness.distinct.length<4&&!readiness.distinct.some(value=>value.frame.sha256===sample.frame.sha256))readiness.distinct.push(sample);
        return sample.frame.sha256!==committedFrame.sha256?sample:false;
      });
      check(renderRestoration.preview.frame.sha256!==committedFrame.sha256,
        'The independently verified eight-millimetre distance movement changes rendered geometry pixels');
    }else renderRestoration.preview=await readPreview();
    const beforeCancel=await serial();await actual(CANCEL);const discarded=await response(beforeCancel,'discard-assembly');
    check(discarded.response.value===null,'Cancel revokes preview token');await recovery(base);
    await waitFor('Cancel restores editable draft and committed renderer',async()=>canonical(await editor(type))===canonical(draft)&&canonical(await ui())===canonical(committedUi));
    if(exactRaster){
      await waitFor('Cancel restores exact committed scene pixels',async()=>{
        const restored=await diagnosticFrame(renderRestoration.polls===0?'restored':undefined);
        renderRestoration.polls++;
        renderRestoration.firstRestored??=restored;
        renderRestoration.lastRestored=restored;
        if(renderRestoration.distinct.length<4&&!renderRestoration.distinct.some(value=>value.frame.sha256===restored.sha256)){
          renderRestoration.distinct.push({frame:restored,presentation:await presentation()});
        }
        return restored.width===committedFrame.width&&restored.height===committedFrame.height&&restored.sha256===committedFrame.sha256;
      });
      renderRestoration.rasterCompared=true;
    }else{
      renderRestoration.semanticRestored={presentation:await presentation()};
      check(canonical(visiblePresentation(renderRestoration.semanticRestored.presentation))
        ===canonical(visiblePresentation(renderRestoration.baseline.presentation)),
      'Cancel restores semantic viewport layout and selection without a raster comparison for this family');
    }
    const afterCancel=await observe.assemblyResponseAfter(beforeCancel,'build-assembly');
    check(afterCancel.completedCount===0&&afterCancel.matching.length===0,'Cancel reuses the committed scene without rebuilding or mutating history');
    const beforeOriginRestore={editor:await editor(type),ui:await ui(),counters:await observe.counters()};
    await setOriginVisibility(originDisplay.visibility);
    await waitFor('restored origin identities, selection and projected anchors',async()=>{
      originDisplay.restored=visiblePresentation(await presentation());
      return canonical(originDisplay.restored)===canonical(originDisplay.before);
    });
    check(canonical({editor:await editor(type),ui:await ui(),counters:await observe.counters()})===canonical(beforeOriginRestore),
      'Restoring origin visibility preserves both edited references, committed graph/history and worker counters');
    const retry=await preview(base,wanted,type,type+'-retry');check(canonical(retry.document.mates)===canonical(firstPreview.document.mates),'Retry retains both newly selected references');
    const beforeApply=await serial();await actual(APPLY);const applied=await response(beforeApply,'apply-assembly'),current=applied.response.value.document;
    check(applied.hasToken&&applied.response.value.kind==='assembly-applied'&&canonical(untimed(current))===canonical(untimed(retry.document)),'Apply consumes exact authenticated proposal');
    geometry(applied.response.value.scene,current,type+'-apply');await recovery(current);
    let currentScene=applied.response.value.scene;
    for(const [label,wantedDoc]of[['Deshacer ensamblaje',base],['Rehacer ensamblaje',current]]){
      const before=await serial();await actual(aria(label));currentScene=await build(before,wantedDoc,type+'-'+label);
    }
    checks.push({referenceEdit:{type,rasterComparison,rasterCompared:renderRestoration.rasterCompared,rasterReason,
      id:original.id,opened,first,second,explicitRotationRelease:type==='concentric',cancelRetainedDraft:true,
      ...(exactRaster?{committedRenderCrop:committedFrame}:{}),historyRoundTrip:true}});
    return {document:current,scene:currentScene};
  }
  return async()=>{
    await waitFor('production startup',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    const inputBytes=await fs.readFile(input);let before=await serial();await actual('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('owned initial discard confirmation',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');
    let scene=await build(before,expected,'original'),current=expected;
    for(const type of ['distance','angle','coincident','concentric']){
      const result=await edit(current,scene,type);current=result.document;scene=result.scene;
    }
    // Freeze the complete Apply-authored graph before Save. Acceptance never
    // recaptures its expectation from recovery or disk after file completion.
    const authored=structuredClone(current);await button('Guardar como');
    await waitFor('single complete exact saved graph',async()=>{
      try{return ipc.filter(e=>e.channel==='document:save'&&e.completed).length===1&&canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(authored);}
      catch(error){if(error.code==='ENOENT')return false;throw error;}
    });
    await waitFor('saved name and idle guards',()=>page(name=>document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false'
      &&document.querySelector('.assembly-shell-document > strong')?.textContent===name,authored.name));
    const saved=await fs.readFile(output);before=await serial();await button('Abrir');await build(before,authored,'saved-reopen');
    for(const type of ['distance','angle','coincident','concentric']){
      const mate=authored.mates.find(m=>m.type===type);await actual(aria(labels[type][0]+' '+mate.name));
      const state=await editor(type);check(state.type===type&&state.typeDisabled&&state.refs.every(r=>r.text&&!r.text.includes('Sin seleccionar')&&!r.disabled),'Reopened exact saved references remain editable');
      await actual(aria(type==='distance'?'Terminar edición de distancia':type==='angle'?'Terminar edición de ángulo':'Terminar edición de relación'));
    }
    await recovery(authored);
    check((await fs.readFile(input)).equals(inputBytes)&&(await fs.readFile(output)).equals(saved),'Opening/editing display preserves both original and saved bytes');
    const full=await observe();check(!full.workerErrors.length&&full.assemblies.every(r=>r.response?.ok===true),'Complete native history healthy');
    check(dialogCounts().opens===2&&dialogCounts().saves===1&&!consoleErrors.length&&!failedRequests.length,'Exact dialogs and healthy renderer');
    evidence.inputSha256=digest(inputBytes);evidence.savedSha256=digest(saved);evidence.savedMates=authored.mates;
    await navigation.panel('components');await capture(authored);
  };
};

