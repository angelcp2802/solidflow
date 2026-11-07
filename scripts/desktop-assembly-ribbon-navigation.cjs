'use strict';

// Reveal mounted command panels through their application-owned tabs only.
module.exports = function ribbonNavigation({ configured, page, waitFor, actualControl, pointer }) {
  const prefix = configured ? 'configured' : 'assembly';
  async function tab(name) {
    const selector='[data-'+prefix+'-command-tab="'+name+'"]';
    const current=await page((prefix,name)=>{
      const tab=document.querySelector('[data-'+prefix+'-command-tab="'+name+'"]');
      const panel=document.querySelector('[data-'+prefix+'-command-panel="'+name+'"]');
      if(!tab||!panel||tab.disabled)throw Error('Actual command tab and panel required: '+name);
      return tab.getAttribute('aria-selected')==='true'&&!panel.hidden&&getComputedStyle(panel).display!=='none';
    },prefix,name);
    if(current)return;
    if(actualControl)await actualControl(selector);
    else {
      const point=await page(selector=>{
        const tab=document.querySelector(selector),r=tab?.getBoundingClientRect();
        const x=r?.left+r?.width/2,y=r?.top+r?.height/2;
        if(!tab||tab.disabled||tab.closest('[hidden]')||!r?.width||!r.height||x<0||y<0||x>=innerWidth||y>=innerHeight||!tab.contains(document.elementFromPoint(x,y)))
          throw Error('Command tab is not visible and reachable: '+selector);
        return {x,y};
      },selector);
      if(pointer){await pointer('mouseMoved',point);await pointer('mousePressed',point,1);await pointer('mouseReleased',point,0);}
      else await page(selector=>document.querySelector(selector).click(),selector);
    }
    await waitFor('actual ribbon reveals '+prefix+' '+name,()=>page((prefix,name)=>{
      const tab=document.querySelector('[data-'+prefix+'-command-tab="'+name+'"]'),panel=document.querySelector('[data-'+prefix+'-command-panel="'+name+'"]');
      return tab?.getAttribute('aria-selected')==='true'&&panel?.hidden===false&&getComputedStyle(panel).display!=='none';
    },prefix,name));
  }
  async function reveal(selector,text='') {
    const owner=await page((selector,text,prefix)=>{
      const rows=[...document.querySelectorAll(selector)].filter(e=>!text||e.textContent.trim()===text);
      if(rows.length!==1)throw Error('One mounted command navigation target required: '+selector+' '+text);
      return rows[0].closest('[data-'+prefix+'-command-panel]')?.getAttribute('data-'+prefix+'-command-panel')||'';
    },selector,text,prefix);
    if(owner)await tab(owner);
  }
  return {tab,reveal};
};
