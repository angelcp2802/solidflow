'use strict';

// A bounded presentation regression on the existing original nested BOM fixtures.
// CDP input proves this application's behavior, not another product's keyboard semantics.
module.exports=async function treeControls({configured=false,page,waitFor,pointer,menuKey,navigation,observe,check,canonical,checks,response}) {
  if(!pointer||!menuKey)throw Error('Actual assembly tree pointer and keyboard transports required');
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
  const recovery=await page(()=>localStorage.getItem('solidflow.autosave')),before=(await observe()).serial;
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
  check((await observe()).serial===before&&await page(()=>localStorage.getItem('solidflow.autosave'))===recovery,'Disclosure sends no native request or recovery write');
  const selectionSerial=(await observe()).serial,oldScope=configured?await page(()=>document.querySelector('[aria-label="Ámbito de configuración"]')?.value):null;
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
  const settled=(await observe()).serial;
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
    :document.activeElement===document.querySelector('[aria-label="Nombre del componente"]'),mode));
  check((await observe()).serial===settled&&await page(()=>localStorage.getItem('solidflow.autosave'))===recovery,'Collapse, keyboard focus and explicit properties preserve settled native serial and exact recovery');
  if(configured)await navigation.pane('model');else await navigation.panel('components');
  await require('./desktop-assembly-origin-tree-controls.cjs')({configured,page,waitFor,pointer,navigation,observe,check,canonical,checks,ownerPath:parentPath,siblingPath});
  checks.push({assemblyTreeNavigation:{configured,parent:parent.path,child:child.path,sibling:sibling.path,keyboard:['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowDown','ArrowUp'],evidenceLimits:'Actual CDP pointer/disclosure/row selection and fixed keyboard input on original reused BOM occurrences. No native-product keyboard parity, CAD edit, new geometry oracle or platform claim.'}});
};
