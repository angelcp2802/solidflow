'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
module.exports = function assemblyImportWorkflow(context) {
  const { expected, input, output, baselinePath, sourcePath, rejectedPath, source, evaluate, observe, waitFor, click, capture, checks, ipc,
    check, canonical, digest, initialReadyMs, dialogCounts, consoleErrors, failedRequests } = context;
  const phases = [], APPLY='button[aria-label="Aplicar ensamblaje"]', CANCEL='button[aria-label="Cancelar vista previa del ensamblaje"]';
  const page=(fn,...args)=>evaluate('('+fn.toString()+')('+args.map(encodeJavaScriptString).join(',')+')');
  const close=(a,b,t,label)=>check(Number.isFinite(a)&&Math.abs(a-b)<t,label+' actual='+a+' expected='+b);
  const vector=(a,b,t,label)=>{check(Array.isArray(a)&&a.length===b.length,label+' shape');a.forEach((x,i)=>close(x,b[i],t,label+'['+i+']'));};
  async function button(text,parent='.assembly-app') { await page((text,parent)=>{
    const rows=[...document.querySelectorAll(parent+' button')].filter(x=>x.textContent.trim()===text);
    if(rows.length!==1||rows[0].disabled)throw Error('One enabled button required: '+text);rows[0].click();
  },text,parent); }
  async function control(selector,value) { await page((selector,value)=>{
    const el=document.querySelector(selector);if(!el||el.disabled)throw Error('Editable control required: '+selector);
    const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  },selector,value);await waitFor('actual control intent',()=>page((selector,value)=>document.querySelector(selector)?.value===value,selector,value)); }
  async function response(serial,action) {return waitFor('actual worker '+action,async()=>{
    const state=await observe();check(!state.workerErrors.length,'Worker error');const e=state.assemblies.filter(x=>x.serial>serial&&x.action===action&&x.response).at(-1);
    if(!e)return false;check(e.response.ok,e.response.error||'Worker rejection');
    const value=e.response.value,scene=value?.kind==='assembly-scene'?value:value?.scene;
    phases.push({action,serial:e.serial,...(scene?{geometry:{solidCount:scene.solidCount,prototypeCount:scene.prototypeCount,
      volume:scene.volume,area:scene.area,warnings:scene.warnings,bodies:scene.bodies.map(b=>({component:b.component,body:b.body,
        worldPose:b.worldPose,solidCount:b.solidCount,volume:b.volume,area:b.area,bounds:b.bounds}))}}:{}),
      ...(value?.checks?{checks:value.checks,scopes:value.scopes.map(s=>({definition:s.definition,status:s.result.status,localDOF:s.result.localDOF}))}:{})});return e;
  });}
  async function recovery(doc,label) { await waitFor(label+' committed recovery',async()=>{
    const raw=await page(()=>localStorage.getItem('solidflow.autosave'));
    return await page(()=>document.querySelector('.assembly-app')?.getAttribute('aria-busy')==='false')&&raw&&canonical(JSON.parse(raw))===canonical(doc);
  }); }
  function intent(doc,count) {
    check(doc.id===expected.id&&doc.occurrences.length===count&&doc.mates.length===0,'Parent root identity/local mates preserved');
    check(doc.definitions.length===source.definitions.length+1,'Import duplicated or lost dependency definitions');
    const embedded=doc.definitions.find(x=>x.id===source.id&&x.revision===source.revision);
    check(embedded?.kind==='assembly'&&canonical(embedded.occurrences)===canonical(source.occurrences)&&canonical(embedded.mates)===canonical(source.mates),'Imported local fixed occurrence/nullframe mate changed');
    check(canonical(doc.definitions.filter(x=>x.id!==source.id))===canonical(source.definitions),'Original dependency bytes changed');
    check(new Set(doc.occurrences.map(x=>x.id)).size===count&&doc.occurrences.every(x=>canonical(x.definition)===canonical({id:source.id,revision:source.revision})&&!x.fixed&&!x.suppressed&&x.visible),'Distinct imported occurrence IDs/reused root definition required');
  }
  function geometry(scene,doc,moved) {
    const count=doc.occurrences.length;intent(doc,count);
    check(scene.kind==='assembly-scene'&&scene.bodies.length===2*count&&scene.solidCount===2*count&&scene.prototypeCount===1,'Fresh native imported body/prototype counts');
    close(scene.volume,48*count,1e-5,'Material volume sum');close(scene.area,104*count,1e-5,'Material area sum');
    check(canonical(scene.warnings)===canonical(['Original overlapping independent boxes: La pieza contiene 2 sólidos separados.']),'Expected one source-definition warning');
    for(let owner=0;owner<count;owner++)for(let slot=0;slot<2;slot++) {
      const root=doc.occurrences[owner],bodyId=slot?'analysis-body-b':'analysis-body-a',feature=slot?'box-b-extrude':'box-a-extrude';
      const rows=scene.bodies.filter(b=>canonical(b.component.occurrencePath)===canonical([root.id,'m'])&&b.body?.bodyId===bodyId);
      check(rows.length===1,'Exact imported occurrence/body reference');const b=rows[0];
      check(canonical(b.component.definition)===canonical({id:'original-analysis-multibody',revision:'r1'})&&b.body.sourceFeatureId===feature&&b.solidCount===1,'Original source revision/body/solid');
      close(b.volume,24,1e-5,'Each body volume');close(b.area,52,1e-5,'Each body area');
      const transformed=moved&&owner===0;
      vector(b.bounds.min,transformed?[7,20+slot,30]:[slot,0,0],1e-6,'Independent lower bounds');
      vector(b.bounds.max,transformed?[10,22+slot,34]:[2+slot,3,4],1e-6,'Independent upper bounds');
      vector(b.worldPose.translation,transformed?[10,20,30]:[0,0,0],1e-6,'Actual root placement');
      const q=b.worldPose.rotation;close(Math.hypot(...q),1,1e-10,'Unit orientation');
      // Independent quaternion action on basisX; ±q are the same rotation.
      vector([1-2*(q[1]*q[1]+q[2]*q[2]),2*(q[0]*q[1]+q[3]*q[2]),2*(q[0]*q[2]-q[3]*q[1])],transformed?[0,1,0]:[1,0,0],1e-6,'Original X basis after Rz90');
    }
  }
  function ready(event,doc,moved) {
    const value=event.response.value;check(value.status==='ready'&&value.hasToken,'Authenticated native preview');
    intent(value.document,doc.occurrences.length);geometry(value.scene,value.document,moved);
    check(value.scopes.length===2&&value.scopes.some(s=>s.definition.id===source.id&&s.result.localDOF===0),'Imported fixed local scope solved in own frame');
    check(value.checks.length===doc.occurrences.length&&value.checks.every(c=>c.satisfied&&c.lengthResidual<=c.lengthTolerance&&c.angleResidual<=c.angleTolerance),'Fresh local null-frame plane checks for every imported occurrence');
    return value;
  }
  async function fresh(doc,moved) {
    const before=await observe();await click('button[aria-label="Resolver ensamblaje"]');const e=await response(before.serial,'preview-assembly');ready(e,doc,moved);
    check(canonical(e.response.value.document.occurrences.map(x=>x.pose))===canonical(doc.occurrences.map(x=>x.pose)),'No-op solve preserves root placements');
    await click(CANCEL);await recovery(doc,'Cancel no-op solve');check(await page(sel=>document.querySelector(sel)?.disabled===true,APPLY),'Cancelled solve revokes Apply');
  }
  async function imported(beforeDoc,count,moved) {
    const before=await observe();await button('Importar componente','.assembly-toolbar');const event=await response(before.serial,'build-assembly');const doc=event.document;
    intent(doc,count);geometry(event.response.value,doc,moved);check(doc.id===beforeDoc.id,'Import replaced parent root');await recovery(doc,'Import');return doc;
  }
  return async()=>{
    await waitFor('initial production readiness',()=>page(()=>document.querySelector('.statusbar')?.textContent.includes('Listo')&&typeof window.solidflow?.openDocument==='function'),initialReadyMs);
    const original=await fs.readFile(input),sourceBytes=await fs.readFile(sourcePath);
    const rejected={...source,name:'Original conflicting imported S'};
    await fs.writeFile(rejectedPath,JSON.stringify(rejected),{flag:'wx'});
    let before=await observe();await click('button[aria-label="Abrir (Ctrl+O)"]');await waitFor('initial discard dialog',()=>page(()=>!!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));await button('Continuar sin guardar','[role="dialog"][aria-labelledby="discard-title"]');
    let e=await response(before.serial,'build-assembly');check(canonical(e.document)===canonical(expected),'Actual parent Open');await recovery(expected,'Open');
    // Establish an actual parent filepath before import, then exercise Save
    // without a dialog. Import must never redirect that path to its source.
    await button('Guardar como','.assembly-toolbar');
    await waitFor('empty parent baseline Save As',async()=>{
      if(dialogCounts().saves!==1||ipc.filter(x=>x.channel==='document:save'&&x.completed).length!==1)return false;
      try{return canonical(JSON.parse(await fs.readFile(baselinePath,'utf8')))===canonical(expected);}catch(err){if(err.code==='ENOENT')return false;throw err;}
    });
    const baselineName=baselinePath.split(/[\\/]/).pop();
    await waitFor('actual parent filename after baseline Save As',()=>page(name=>document.querySelector('.assembly-file')?.textContent===name,baselineName));
    await recovery(expected,'Baseline Save As');
    phases.push({action:'baseline-parent-save-as',path:baselineName,documentSha256:digest(canonical(expected))});
    let doc=await imported(expected,1,false);const identityDoc=doc;
    check(await page(name=>document.querySelector('.assembly-file')?.textContent===name,baselineName),'Import replaced parent filename with source');
    await button('Guardar','.assembly-toolbar');
    await waitFor('normal Save writes imported graph to baseline parent',async()=>{
      if(dialogCounts().saves!==1||ipc.filter(x=>x.channel==='document:save'&&x.completed).length!==2)return false;
      try{return canonical(JSON.parse(await fs.readFile(baselinePath,'utf8')))===canonical(identityDoc);}catch(err){if(err.code==='ENOENT')return false;throw err;}
    });
    await recovery(identityDoc,'Normal parent Save');
    const baselineBytes=await fs.readFile(baselinePath);
    check((await fs.readFile(sourcePath)).equals(sourceBytes),'Normal Save overwrote imported source');
    check(await page(name=>document.querySelector('.assembly-file')?.textContent===name,baselineName),'Normal Save lost parent filepath');
    phases.push({action:'normal-save-parent-after-import',path:baselineName,sha256:digest(baselineBytes),saveDialogs:dialogCounts().saves});
    await fresh(doc,false);
    await page(name=>{const rows=[...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(r=>r.querySelector('span')?.firstChild?.textContent===name);if(rows.length!==1||rows[0].disabled)throw Error('Exact imported root tree row');rows[0].click();},doc.occurrences[0].name);
    await waitFor('root component selected',()=>page(name=>document.querySelector('input[aria-label="Nombre del componente"]')?.value===name,doc.occurrences[0].name));
    for(const [i,axis]of ['X','Y','Z'].entries())await control('input[aria-label="Destino local '+axis+' del componente"]',String([10,20,30][i]));
    await control('select[aria-label="Eje local del movimiento"]','2');await control('input[aria-label="Giro local del movimiento en grados"]','90');
    before=await observe();await click('button[aria-label="Vista previa del movimiento"]');e=await response(before.serial,'move-assembly-component-motion');const candidate=ready(e,doc,true);
    await click(APPLY);const applied=await response(e.serial,'apply-assembly');check(applied.hasToken&&applied.response.value.kind==='assembly-applied','Single-use authentic movement Apply');
    const expectedCandidate={...candidate.document},actual={...applied.response.value.document};delete expectedCandidate.updatedAt;delete actual.updatedAt;check(canonical(expectedCandidate)===canonical(actual),'Apply preserves authenticated import movement');doc=applied.response.value.document;geometry(applied.response.value.scene,doc,true);await recovery(doc,'Movement Apply');const movedDoc=doc;
    // Same root identity/revision with distinct content must fail atomically,
    // before native build. This test-owned input is never a worker response.
    const recoveryBefore=await page(()=>localStorage.getItem('solidflow.autosave'));
    const historyBefore=await page(()=>['Deshacer ensamblaje','Rehacer ensamblaje','Aplicar ensamblaje'].map(label=>document.querySelector('button[aria-label="'+label+'"]')?.disabled));
    before=await observe();await button('Importar componente','.assembly-toolbar');
    await waitFor('explicit conflicting-content rejection',()=>page(()=>document.querySelector('.assembly-status.error')?.textContent.includes('contenido distinto')));
    check((await observe()).serial===before.serial,'Rejected import allocated native worker geometry');
    check(await page(()=>localStorage.getItem('solidflow.autosave'))===recoveryBefore,'Rejected import changed committed recovery');
    check(canonical(await page(()=>['Deshacer ensamblaje','Rehacer ensamblaje','Aplicar ensamblaje'].map(label=>document.querySelector('button[aria-label="'+label+'"]')?.disabled)))===canonical(historyBefore),'Rejected import changed history/Apply state');
    check(await page(sel=>document.querySelector(sel)?.disabled===true,APPLY),'Rejected import manufactured Apply authority');
    phases.push({action:'rejected-import-before-worker',serial:before.serial});
    doc=await imported(doc,2,true);const twice=doc;
    before=await observe();await click('button[aria-label="Deshacer ensamblaje"]');e=await response(before.serial,'build-assembly');check(canonical(e.document)===canonical(movedDoc),'Undo restores one moved import');geometry(e.response.value,e.document,true);await recovery(movedDoc,'Undo');
    before=await observe();await click('button[aria-label="Rehacer ensamblaje"]');e=await response(before.serial,'build-assembly');check(canonical(e.document)===canonical(twice),'Redo restores both exact imports');geometry(e.response.value,e.document,true);await recovery(twice,'Redo');
    await fresh(twice,true);
    await button('Guardar como','.assembly-toolbar');await waitFor('actual saved assembly',async()=>{if(dialogCounts().saves!==2||ipc.filter(x=>x.channel==='document:save'&&x.completed).length!==3)return false;try{return canonical(JSON.parse(await fs.readFile(output,'utf8')))===canonical(twice);}catch(err){if(err.code==='ENOENT')return false;throw err;}});const saved=await fs.readFile(output);
    before=await observe();await button('Abrir','.assembly-toolbar');e=await response(before.serial,'build-assembly');check(canonical(e.document)===canonical(twice),'Exact Save/reopen graph');geometry(e.response.value,e.document,true);await recovery(twice,'Reopen');await fresh(twice,true);
    // Inspect the actual two imported containers. Root occurrence identity,
    // never their shared definition, determines grouping eligibility.
    const within='input[aria-label="Incluir cuerpos de una misma pieza"]',group='input[aria-label="Agrupar subensamblajes raíz"]';
    const panel='[role="region"][aria-label="Interferencias y holguras"]';
    const recoveryBeforeInspection=await page(()=>localStorage.getItem('solidflow.autosave'));
    const historyBeforeInspection=await page(()=>['Deshacer ensamblaje','Rehacer ensamblaje','Aplicar ensamblaje'].map(label=>document.querySelector('button[aria-label="'+label+'"]')?.disabled));
    check(await page((within,group)=>document.querySelector(within)?.checked===false&&document.querySelector(group)?.checked===false,within,group),'Fresh default inspection policies');
    await control('input[aria-label="Holgura de comprobación"]','0');await click(within);
    await waitFor('explicit internal-body policy',()=>page(within=>document.querySelector(within)?.checked===true,within));
    async function inspectImported(grouped) {
      const before=await observe();await click('button[aria-label="Comprobar interferencias"]');
      const event=await response(before.serial,'inspect-assembly-interferences'),report=event.response.value;
      const options={clearance:0,lengthTolerance:1e-6,volumeTolerance:1e-6,includeHidden:true,includeWithinComponent:true,
        treatSubassembliesAsComponents:grouped,scope:{mode:'all',selected:[],excluded:[]}};
      check(canonical(event.current)===canonical(twice)&&canonical(event.options)===canonical(options)&&canonical(report.options)===canonical(options),
        'Imported inspection uses committed graph and exact full-root options');
      check(report.kind==='assembly-interference-report'&&report.hasToken===false&&report.bodyCount===4&&report.componentCount===2,
        'Read-only imported report preserves four bodies and two complete leaf occurrences');
      check(report.potentialPairCount===(grouped?4:6)&&report.testedPairCount===(grouped?0:2)&&report.broadPhaseExcludedCount===4
        &&report.pairs.length===(grouped?0:2),'Imported scope grouping pair accounting, not shared-definition exclusion');
      check(canonical(report.scopeSummary)===canonical({mode:'all',selectedLeafCount:0,excludedLeafCount:0,eligibleLeafCount:2,eligiblePairCount:grouped?4:6}),
        'Imported full-root scope accounting');
      if(!grouped)for(let owner=0;owner<2;owner++) {
        const root=twice.occurrences[owner],component={occurrencePath:[root.id,'m'],definition:{id:'original-analysis-multibody',revision:'r1'}};
        const pairs=report.pairs.filter(pair=>canonical(pair.first.component)===canonical(component)&&canonical(pair.second.component)===canonical(component));
        check(pairs.length===1,'One exact internal pair for each imported occurrence');const pair=pairs[0];
        check(canonical([pair.first.body,pair.second.body].sort((a,b)=>a.bodyId.localeCompare(b.bodyId)))===canonical([
          {bodyId:'analysis-body-a',sourceFeatureId:'box-a-extrude'},{bodyId:'analysis-body-b',sourceFeatureId:'box-b-extrude'}]),'Exact original A/B body references');
        check(pair.status==='overlap'&&pair.solidCount===1&&pair.intersectionMesh?.vertexCount>0,'Native closed internal Common mesh');
        close(pair.intersectionVolume,12,1e-5,'Independent imported internal Common volume');close(pair.minimumDistance,0,1e-6,'Independent overlap distance');
        vector(pair.intersectionMesh.bounds.min,owner===0?[7,21,30]:[1,0,0],1e-6,'Imported internal Common lower bounds');
        vector(pair.intersectionMesh.bounds.max,owner===0?[10,22,34]:[2,3,4],1e-6,'Imported internal Common upper bounds');
      }
      await waitFor('actual imported report rendered',()=>page((panel,id)=>document.querySelector(panel+' [data-analysis-id]')?.getAttribute('data-analysis-id')===id,panel,report.analysisId));
      await recovery(twice,'Read-only imported inspection');
      check(await page(()=>localStorage.getItem('solidflow.autosave'))===recoveryBeforeInspection,'Inspection changed committed recovery bytes');
      check(canonical(await page(()=>['Deshacer ensamblaje','Rehacer ensamblaje','Aplicar ensamblaje'].map(label=>document.querySelector('button[aria-label="'+label+'"]')?.disabled)))===canonical(historyBeforeInspection)
        &&await page(sel=>document.querySelector(sel)?.disabled===true,APPLY),'Inspection changed history or enabled Apply');
      phases.at(-1).analysis={analysisId:report.analysisId,options:report.options,scopeSummary:report.scopeSummary,bodyCount:report.bodyCount,componentCount:report.componentCount,
        potentialPairCount:report.potentialPairCount,testedPairCount:report.testedPairCount,broadPhaseExcludedCount:report.broadPhaseExcludedCount,
        pairs:report.pairs.map(pair=>({id:pair.id,first:pair.first,second:pair.second,status:pair.status,intersectionVolume:pair.intersectionVolume,solidCount:pair.solidCount,
          minimumDistance:pair.minimumDistance,commonBounds:pair.intersectionMesh?.bounds}))};
      return report;
    }
    const ungrouped=await inspectImported(false);before=await observe();await click(group);
    await waitFor('group policy invalidates imported report',()=>page((group,panel)=>document.querySelector(group)?.checked===true&&!document.querySelector(panel+' [data-analysis-id]'),group,panel));
    check((await observe()).serial===before.serial,'Grouping change automatically requested native inspection');
    const grouped=await inspectImported(true);check(grouped.analysisId!==ungrouped.analysisId,'Fresh grouped inspection authority');
    check((await fs.readFile(input)).equals(original)&&(await fs.readFile(sourcePath)).equals(sourceBytes)&&(await fs.readFile(output)).equals(saved)&&(await fs.readFile(baselinePath)).equals(baselineBytes),'Input/source/baseline/saved bytes unchanged');
    await waitFor('final regular saved filename',()=>page(name=>document.querySelector('.assembly-file')?.textContent===name,output.split(/[\\/]/).pop()));
    check(dialogCounts().opens===5&&dialogCounts().saves===2&&dialogCounts().csvExports===0,'Exact five Open/two Save As dialogs queue');
    check(canonical(ipc.map(x=>x.channel))===canonical(['document:open','document:save','document:open','document:save','document:open','document:open','document:save','document:open'])&&ipc.every(x=>x.completed),'Only authorized file IPC');
    const final=await observe();check(!consoleErrors.length&&!failedRequests.length&&!final.workerErrors.length,'Renderer/worker errors');
    checks.push({importInputSha256:digest(original),importSourceSha256:digest(sourceBytes),savedSha256:digest(saved),baselineParentSha256:digest(baselineBytes),phases,identityDocument:identityDoc,finalDocument:twice,
      independentOracles:'Original M A[0,2],B[1,3] x[0,3]x[0,4], each V24/A52; S local fixed M+null/XY coincident mate. First root Rz90+[10,20,30]: A bounds[7,20,30]..[10,22,34], B[7,21,30]..[10,23,34]. Second root identity, exact reused deps/prototype. V/A1e-5,bounds/placement1e-6,basis1e-6. Actual worker Solve local fixed-plane checks, not build-only mate proof. Reopened inspection within=true: ungrouped6potential/2tested/4broad with two V12 internal Commons; grouped4potential/0tested/4broad, no pairs; root occurrence identities remain distinct despite shared source.',
      limits:'Scripted production controls and real worker/file IPC. No fake CAD/state/capability, vendor API claim, source linkage, native-dialog pointer, arbitrary import graph or broad platform support. Baseline parent Save As then normal Save after import writes only the parent filepath; source unchanged. Same-revision conflicting-content rejection exercised before worker with recovery/history unchanged. Picker cancellation not exercised by this fixed path queue.'});
    await capture(twice);
  };
};
