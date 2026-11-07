'use strict';

// Called only after the original part recipe has been saved and reopened.
// Every camera/editor action uses the caller's real input transport.
module.exports=async function partViewRemount(context){
  const {page,waitFor,check,checks,canonical,cameraFrame,cameraGesture,key,press,tab,idle,recovery,observe,ipc,dialogCounts}=context;
  const SVG='svg[aria-label="Editor de croquis multientidad"]';
  const evidence={frames:{},limits:'Stationary central canvas pixel equality after an empty sketch and actual 2D Fit/Cancel. No camera state is read or injected; this is not a full-viewport or CAD geometry oracle. The caller independently validates the saved original recipe.'};
  checks.push({partViewRemount:evidence});
  const history=()=>page(()=>['Deshacer (Ctrl+Z)','Rehacer (Ctrl+Y)'].map(title=>{
    const rows=document.querySelectorAll('button[title="'+title+'"]');
    if(rows.length!==1)throw Error('One actual part history control required');
    return {title,disabled:rows[0].disabled};
  }));
  async function frame(label){
    let previous='',since=0;
    return waitFor('stationary part remount crop: '+label,async()=>{
      const current=await cameraFrame();
      check(Number.isInteger(current.width)&&current.width>0&&Number.isInteger(current.height)&&current.height>0
        &&/^[0-9a-f]{64}$/.test(current.sha256),'Fresh bounded part camera pixels');
      const signature=canonical(current);
      if(signature!==previous){previous=signature;since=Date.now();return false;}
      return Date.now()-since>=200?current:false;
    });
  }
  const sameFrame=(actual,expected,label)=>check(canonical(actual)===canonical(expected),label+': '+canonical({actual,expected}));
  await idle();await tab('Operaciones');
  const savedRecovery=await recovery(),saved=JSON.parse(savedRecovery),before=await observe();
  check(saved.version===1&&saved.features.length>0&&!before.workerErrors.length,'Remount starts from a nonempty committed part and healthy worker');
  const beforeHistory=await history(),beforeIpc=structuredClone(ipc),beforeDialogs=dialogCounts();
  const unchanged=async label=>{
    check(await recovery()===savedRecovery,label+': exact saved recovery including identity and declarations');
    check(canonical(ipc)===canonical(beforeIpc)&&canonical(dialogCounts())===canonical(beforeDialogs),label+': no file IPC or picker grants');
    check(canonical(await history())===canonical(beforeHistory),label+': document history controls unchanged');
  };
  await key('7');const base=await frame('isometric baseline');evidence.frames.base=base;
  evidence.gesture=await cameraGesture('wheel-in');const zoomed=await frame('actual zoom');evidence.frames.zoomed=zoomed;
  check(base.width===zoomed.width&&base.height===zoomed.height&&base.sha256!==zoomed.sha256,'Actual wheel changes rendered zoom before opening a sketch');
  await unchanged('Before sketch entry');
  await tab('Croquis');await press('button.command[title="Nuevo croquis"]');
  await waitFor('actual empty sketch editor replaces 3D viewport',()=>page(selector=>{
    const svg=document.querySelector(selector);
    return !!svg&&svg.checkVisibility()&&svg.getClientRects().length>0
      &&svg.querySelectorAll('[data-selection-kind="entity"]').length===0
      &&!!document.querySelector('.property-manager button[title="Cancelar operación"]');
  },SVG));
  await key('F');
  check(await page(selector=>!!document.querySelector(selector)&&!document.querySelector('[role="dialog"]'),SVG),'Actual Fit key leaves the sketch editor active');
  check(await recovery()===savedRecovery,'2D Fit does not mutate the committed saved recipe');
  await press('.property-manager button[title="Cancelar operación"]');await idle();await tab('Operaciones');
  const restored=await frame('3D viewport after sketch Cancel');evidence.frames.restored=restored;
  sameFrame(restored,zoomed,'Cancelling sketch preserves exact prior 3D zoom after 2D Fit');
  await unchanged('After sketch Cancel');
  await key('ShiftZ');const previous=await frame('Previous after sketch remount');evidence.frames.previous=previous;
  sameFrame(previous,base,'Previous crosses the wheel transaction without an extra 2D Fit history entry');
  await unchanged('After Previous');
  const finalBuild=await waitFor('final remounted part rebuild retains exact saved features',async()=>{
    const state=await observe();check(!state.workerErrors.length,'Remount worker transport stays healthy');
    const rows=state.builds.filter(row=>row.serial>before.serial);
    for(const row of rows){
      if(!row.response)return false;
      check(row.response.ok,'Every completed sketch remount build succeeds');
      check(row.response.value.featureErrors.length===0,'No sketch remount feature errors');
    }
    const last=state.builds.at(-1);
    return last?.response?.ok&&last.response.value.featureErrors.length===0&&canonical(last.features)===canonical(saved.features)
      ?{serial:last.serial,rebuildCount:rows.length,featureCount:last.features.length}:false;
  });
  evidence.finalBuild=finalBuild;evidence.completed=true;
};
