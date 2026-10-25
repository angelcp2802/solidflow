'use strict';

// A bounded presentation regression on the existing original nested BOM fixtures.
// CDP input proves this application's behavior, not another product's keyboard semantics.
module.exports=async function treeControls({configured=false,page,waitFor,pointer,menuKey,navigation,observe,check,canonical,checks,response}) {
  if(!pointer||!menuKey)throw Error('Actual assembly tree pointer and keyboard transports required');
  if(typeof observe.counters!=='function'||typeof observe.auditCounters!=='function')throw Error('Read-only observer counters and parity audit required');
  // Both owning workflows intentionally encode page arguments as strings only.
  const mode=configured?'configured':'';
  if(configured)await navigation.pane('model');else await navigation.panel('components');
  const tree=require('./desktop-assembly-tree-navigation.cjs')({page,waitFor,pointer});
  const inventory=await page(configured=>[...document.querySelectorAll('[data-assembly-tree-key]')].map(row=>{
    const key=row.getAttribute('data-assembly-tree-key'),identity=JSON.parse(key);
    return {key,parent:row.getAttribute('data-assembly-tree-parent'),path:identity[configured?1:0],kind:row.hasAttribute('data-assembly-origin-tree-key')?'origin':configured?identity[0]:'occurrence',definition:identity.slice(-2)};
  }),mode);
  const parentPath=configured?['left']:['g-a'],siblingPath=configured?['right']:['g-b'],childPath=configured?['left','a']:['g-a','p-a'];
  function occurrence(path){const rows=inventory.filter(row=>row.kind==='occurrence'&&canonical(row.path)===canonical(path));check(rows.length===1,'One original tree occurrence at '+JSON.stringify(path));return rows[0];}
  const parent=occurrence(parentPath),sibling=occurrence(siblingPath),child=occurrence(childPath);
  check(parent.key!==sibling.key&&canonical(parent.definition)===canonical(sibling.definition)&&child.parent===parent.key,'Reused original definition has independent occurrence branches');
  const row=key=>tree.selector('data-assembly-tree-key',key),disclosure=key=>tree.selector('data-assembly-tree-disclosure',key);
  const selected=()=>page(()=>[...document.querySelectorAll('[data-assembly-tree-key][aria-selected="true"]')].map(el=>el.getAttribute('data-assembly-tree-key')));
  const recovery=await page(()=>localStorage.getItem('solidflow.autosave')),before=(await observe.auditCounters(configured?'configured-tree-idle':'standard-tree-idle')).serial;
  async function expanded(key,wanted){await waitFor('tree disclosure state '+wanted,()=>page((key,wanted)=>{
    const el=[...document.querySelectorAll('[data-assembly-tree-disclosure]')].find(el=>el.getAttribute('data-assembly-tree-disclosure')===key);
    return el?.getAttribute('aria-expanded')===String(wanted);
  },key,String(wanted)));}
  async function focused(key){await waitFor('tree row receives keyboard focus',()=>page(key=>document.activeElement?.getAttribute('data-assembly-tree-key')===key,key));}
  // A previous external selection may legitimately have revealed an ancestor.
  for(const branch of [parent,sibling])if(await page(s=>document.querySelector(s)?.getAttribute('aria-expanded')==='true',await disclosure(branch.key))){await tree.press(await disclosure(branch.key));await expanded(branch.key,false);}
  const originalSelection=await selected();
  await tree.press(await disclosure(parent.key));await expanded(parent.key,true);await focused(parent.key);
  check(await page(s=>document.querySelector(s)?.getAttribute('aria-expanded')==='false',await disclosure(sibling.key))&&canonical(await selected())===canonical(originalSelection),'Opening one reused branch leaves its sibling collapsed and selection unchanged');
  check((await observe.counters()).serial===before&&await page(()=>localStorage.getItem('solidflow.autosave'))===recovery,'Disclosure sends no native request or recovery write');
  const selectionSerial=(await observe.counters()).serial,oldScope=configured?await page(()=>document.querySelector('[aria-label="Ámbito de configuración"]')?.value):null;
  await tree.press(await row(child.key));
  await waitFor('actual descendant selection stays in the tree',async()=>canonical(await selected())===canonical([child.key])&&await page(configured=>configured?document.querySelector('[data-configured-pane="model"]')?.hidden===false:document.querySelector('#assembly-panel-components')?.hidden===false,mode));
  // Changing a configured owner retains its existing fresh-build guard.
  if(configured&&oldScope!==JSON.stringify(parentPath)){
    const rebuilt=await response(selectionSerial,'build-configured-assembly');
    check(canonical(rebuilt.current.document)===canonical(JSON.parse(recovery)),'Owner selection rebuild preserves the complete committed document');
  }
  await waitFor('selected tree owner ready',()=>page(configured=>{
    const root=document.querySelector(configured?'.configured-assembly-workspace':'.assembly-app');
    const props=document.querySelector('button[aria-label="Propiedades del componente seleccionado"]');
    return root?.getAttribute('aria-busy')==='false'&&props&&!props.disabled;
  },mode));
  const settled=(await observe.counters()).serial;
  await tree.press(await disclosure(parent.key));await expanded(parent.key,false);await focused(parent.key);
  check(canonical(await selected())===canonical([child.key])&&await page(s=>!!document.querySelector(s)?.closest('[hidden]'),await row(child.key)),'Collapsing retains the selected mounted descendant while hiding its row');
  const firstChild=inventory.find(value=>value.parent===parent.key);
  check(firstChild&&firstChild.kind==='origin','Right enters the actual first origin datum before nested components or configuration actions');
  for(const [key,target,open] of [['ArrowRight',parent.key,true],['ArrowRight',firstChild.key,null],['ArrowLeft',parent.key,null],['ArrowLeft',parent.key,false],['ArrowDown',sibling.key,null],['ArrowUp',parent.key,null]]){
    await menuKey(key);await focused(target);if(open!==null)await expanded(parent.key,open);
  }
  check(canonical(await selected())===canonical([child.key]),'Arrow navigation changes focus without activating a different component');
  await tree.press('button[aria-label="Propiedades del componente seleccionado"]');
  await waitFor('explicit selected-component properties are shown',()=>page(configured=>configured
    ?document.querySelector('[data-configured-pane="occurrence"]')?.hidden===false&&document.querySelector('[aria-label="Ocurrencia configurada"]')?.value==='a'
    :document.querySelector('#assembly-panel-properties')?.hidden===false
      &&document.querySelector('#assembly-tab-properties')?.getAttribute('aria-selected')==='true'
      &&document.querySelector('#assembly-panel-components')?.hidden===true
      &&document.activeElement===document.querySelector('[aria-label="Nombre del componente"]'),mode));
  check((await observe.counters()).serial===settled&&await page(()=>localStorage.getItem('solidflow.autosave'))===recovery,'Collapse, keyboard focus and explicit properties preserve settled native serial and exact recovery');
  if(!configured){
    const fields=()=>page(()=>[...document.querySelectorAll('fieldset[aria-label="Edición del componente seleccionado"] input,fieldset[aria-label="Edición del componente seleccionado"] select,fieldset[aria-label="Edición del componente seleccionado"] textarea')]
      .map(el=>({label:el.getAttribute('aria-label'),type:el.type,value:el.value,checked:el.checked,disabled:el.matches(':disabled')})));
    const retainedFields=await fields();
    check(retainedFields.length>0,'Properties keeps the original component editing fields mounted');
    const propertiesReady=selector=>waitFor('properties pane and requested focus are ready',()=>page(selector=>{
      const pane=document.querySelector('#assembly-panel-properties'),target=document.querySelector(selector);
      return pane?.hidden===false&&document.querySelector('#assembly-tab-properties')?.getAttribute('aria-selected')==='true'
        &&document.querySelector('#assembly-panel-components')?.hidden===true&&!!target?.getClientRects().length&&document.activeElement===target;
    },selector));
    async function moveReady(){
      await propertiesReady('.assembly-movement h3');
      let observed=null;
      try{
        await waitFor('Move exposes its first numeric field inside the visible sidebar',async()=>{
          observed=await page(()=>{
            const pane=document.querySelector('#assembly-panel-properties'),inputs=[...document.querySelectorAll('[aria-label="Destino local X del componente"]')],input=inputs[0];
            const rect=input?.getBoundingClientRect(),panel=pane?.getBoundingClientRect();
            if(inputs.length!==1||!pane||!input||!rect||!panel)return{ready:false,count:inputs.length};
            const clip={left:Math.max(0,panel.left+pane.clientLeft),top:Math.max(0,panel.top+pane.clientTop),
              right:Math.min(innerWidth,panel.left+pane.clientLeft+pane.clientWidth),bottom:Math.min(innerHeight,panel.top+pane.clientTop+pane.clientHeight)};
            const point={x:rect.left+rect.width/2,y:rect.top+rect.height/2},hit=document.elementFromPoint(point.x,point.y);
            const within=rect.width>0&&rect.height>0&&rect.left>=clip.left&&rect.right<=clip.right&&rect.top>=clip.top&&rect.bottom<=clip.bottom;
            return{ready:pane.hidden===false&&!input.closest('[hidden]')&&within&&input.contains(hit),
              rect:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},clip,point,disabled:input.matches(':disabled'),
              hit:{tag:hit?.tagName,label:hit?.getAttribute('aria-label')},scrollTop:pane.scrollTop};
          });
          return observed.ready?observed:false;
        });
      }catch(error){checks.push({assemblyMoveFieldVisibilityFailure:observed});throw error;}
      check(observed.ready,'Move shows the entire first numeric input inside the viewport/sidebar with its center unobstructed, including fixed-component disabled fields');
      checks.push({assemblyMoveFieldVisibility:observed});
    }
    async function unchanged(label){
      check(canonical(await fields())===canonical(retainedFields)&&canonical(await selected())===canonical([child.key])
        &&(await observe.counters()).serial===settled&&await page(()=>localStorage.getItem('solidflow.autosave'))===recovery,
      label+' retains mounted fields, selected occurrence, native serial and exact recovery');
    }
    async function model(){
      await tree.press('button[aria-label="Volver al árbol de componentes"]');
      await waitFor('actual Model return hides properties and focuses the selected component',()=>page(key=>{
        const pane=document.querySelector('#assembly-panel-properties'),group=pane?.querySelector('fieldset'),name=document.querySelector('[aria-label="Nombre del componente"]');
        return pane?.hidden===true&&document.querySelector('#assembly-panel-components')?.hidden===false
          &&document.querySelector('#assembly-tab-components')?.getAttribute('aria-selected')==='true'
          &&!!group&&!group.disabled&&!!name&&!name.getClientRects().length&&document.activeElement?.getAttribute('data-assembly-tree-key')===key;
      },child.key));
    }
    await model();await unchanged('Initial Model return');
    await navigation.reveal('button[aria-label="Mover componente"]');await tree.press('button[aria-label="Mover componente"]');
    await moveReady();await unchanged('Move command');
    await tree.press('#assembly-tab-properties');await propertiesReady('[aria-label="Nombre del componente"]');await unchanged('Properties tab');
    await model();await unchanged('Model return after Properties');
    await tree.press('button[aria-label="Mover componente"]');await moveReady();await unchanged('Repeated Move command');
    await model();await unchanged('Final Model return');
    checks.push({assemblyComponentPaneNavigation:{sequence:['Mover componente','Propiedades','Modelo','Mover componente','Modelo'],component:child.path,
      fieldCount:retainedFields.length,nativeSerial:settled,evidenceLimits:'Actual CDP commands and pane navigation retain existing field values; no field edit, movement preview or CAD request.'}});
  }
  if(configured)await navigation.pane('model');else await navigation.panel('components');
  await require('./desktop-assembly-origin-tree-controls.cjs')({configured,page,waitFor,pointer,navigation,observe,check,canonical,checks,ownerPath:parentPath,siblingPath});
  checks.push({assemblyTreeNavigation:{configured,parent:parent.path,child:child.path,sibling:sibling.path,keyboard:['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowDown','ArrowUp'],evidenceLimits:'Actual CDP pointer/disclosure/row selection and fixed keyboard input on original reused BOM occurrences. No native-product keyboard parity, CAD edit, new geometry oracle or platform claim.'}});
};
