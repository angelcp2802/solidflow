'use strict';

// Actual CDP tab input; all snapshots observe existing controls and recovery.
module.exports = function ribbonControls({ configured, page, waitFor, actualControl, menuKey, observe, check, canonical, gestures }) {
  const prefix=configured?'configured':'assembly',names=['assembly','relations','evaluate'];
  const selector=name=>'[data-'+prefix+'-command-tab="'+name+'"]';
  const read=()=>page(configured=>{
    const aside=document.querySelector(configured?'[aria-label="Inspector del ensamblaje configurado"]':'.assembly-manager-sidebar');
    if(!aside)throw Error('Existing assembly inspector required');
    const confirmation=configured?['Resolver configuración','Aplicar configuración','Cancelar'].map(text=>{
      const rows=[...document.querySelectorAll('[aria-label="Comandos del ensamblaje configurado"] button')].filter(e=>e.textContent.trim()===text);
      if(rows.length!==1)throw Error('Unique configured confirmation required: '+text);return rows[0];
    }):['Resolver ensamblaje','Aplicar ensamblaje','Cancelar vista previa del ensamblaje'].map(label=>{
      const rows=document.querySelectorAll('button[aria-label="'+label+'"]');if(rows.length!==1)throw Error('Unique assembly confirmation required: '+label);return rows[0];
    });
    return {recovery:localStorage.getItem('solidflow.autosave'),
      panes:[...aside.querySelectorAll('[data-configured-pane],[role="tabpanel"]')].map(e=>({key:e.getAttribute('data-configured-pane')||e.id,hidden:e.hidden})),
      fields:[...aside.querySelectorAll('input,select,textarea')].map(e=>({label:e.getAttribute('aria-label'),type:e.type,value:e.value,checked:e instanceof HTMLInputElement?e.checked:null,disabled:e.disabled})),
      buttons:[...aside.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),text:e.textContent.trim(),pressed:e.getAttribute('aria-pressed'),disabled:e.disabled})),
      picking:document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking'),
      confirmation:confirmation.map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent.trim(),disabled:e.disabled,
        persistent:!e.closest('[data-assembly-command-panel],[data-configured-command-panel]'),
        visible:!e.closest('[hidden]')&&r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight};})};
  },configured);
  async function active(name) {
    await waitFor('ribbon commits selected '+prefix+' '+name,()=>page((prefix,name)=>{
      const tabs=[...document.querySelectorAll('[data-'+prefix+'-command-tab]')],panels=[...document.querySelectorAll('[data-'+prefix+'-command-panel]')];
      return tabs.length===3&&panels.length===3&&tabs.every(tab=>{
        const selected=tab.getAttribute('data-'+prefix+'-command-tab')===name;
        return tab.getAttribute('role')==='tab'&&tab.getAttribute('aria-selected')===String(selected)&&tab.tabIndex===(selected?0:-1);
      })&&panels.every(panel=>{const selected=panel.getAttribute('data-'+prefix+'-command-panel')===name;
        return panel.hidden===!selected&&(getComputedStyle(panel).display!=='none')===selected;});
    },prefix,name));
  }
  async function retained(phase) {
    const originalTab=await page(prefix=>document.querySelector('[data-'+prefix+'-command-tab][aria-selected="true"]')?.getAttribute('data-'+prefix+'-command-tab'),prefix);
    check(names.includes(originalTab),'One current assembly ribbon tab before '+phase);
    const original=await read(),before=(await observe()).serial;
    check(original.confirmation.every(button=>button.persistent&&button.visible),'All confirmation controls remain visible outside tab panels before '+phase);
    for(const name of names){await actualControl(selector(name));await active(name);}
    for(const [key,name] of [['Home','assembly'],['ArrowRight','relations'],['End','evaluate'],['ArrowLeft','relations'],['Home','assembly']]){
      await menuKey(key);gestures.push({kind:'ribbon-key',phase,key});await active(name);
      check(await page(selector=>document.activeElement===document.querySelector(selector),selector(name)),'Ribbon keyboard activation focuses its selected tab: '+key);
    }
    await actualControl(selector(originalTab));await active(originalTab);
    const after=await read();
    check(canonical(after)===canonical(original),'Ribbon tabs retain '+phase+' fields, references, inspector, picking, recovery and confirmation guards');
    check((await observe()).serial===before,'Ribbon pointer/keyboard navigation sends no native request during '+phase);
    gestures.push({kind:'ribbon-retained-context',phase,tabs:names,originalTab,serial:before,fields:original.fields.length,confirmation:original.confirmation});
  }
  return {retained};
};
