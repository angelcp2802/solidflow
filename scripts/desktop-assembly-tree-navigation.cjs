'use strict';

// Expand application-owned ancestor disclosures. All rows remain mounted;
// reading hidden ancestry is discovery, never interaction with a hidden row.
module.exports=function treeNavigation({page,waitFor,actualControl,pointer}) {
  const selector=(attribute,key)=>page((attribute,key)=>'['+attribute+'="'+CSS.escape(key)+'"]',attribute,key);
  async function activate(target,text='') {
    if(actualControl){await actualControl(target,text||null);return;}
    await page((target,text)=>{
      const rows=[...document.querySelectorAll(target)].filter(el=>!text||el.textContent.trim()===text);
      if(rows.length!==1||rows[0].disabled||rows[0].closest('[hidden]'))throw Error('Visible enabled tree control required: '+target);
      rows[0].scrollIntoView({block:'nearest',inline:'nearest'});
    },target,text);
    let previous=null,stableSince=0;
    const point=await waitFor('stationary reachable assembly tree control',async()=>{
      const result=await page((target,text)=>{
        const el=[...document.querySelectorAll(target)].find(el=>!text||el.textContent.trim()===text),r=el?.getBoundingClientRect();
        if(!el||el.disabled||el.closest('[hidden]')||!r?.width||!r.height)return null;
        const x=r.left+r.width/2,y=r.top+r.height/2;
        return x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&el.contains(document.elementFromPoint(x,y))?{x,y}:null;
      },target,text);
      const signature=JSON.stringify(result);
      if(!result||signature!==previous){previous=signature;stableSince=Date.now();return false;}
      return Date.now()-stableSince>=100?result:false;
    });
    if(pointer){await pointer('mouseMoved',point);await pointer('mousePressed',point,1);await pointer('mouseReleased',point,0);}
    else await page((target,text)=>{
      const el=[...document.querySelectorAll(target)].find(el=>!text||el.textContent.trim()===text),r=el?.getBoundingClientRect();
      if(!el||el.disabled||el.closest('[hidden]')||!r?.width||!r.height||!el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)))throw Error('Tree control ceased to be reachable');
      el.click();
    },target,text);
  }
  async function reveal(target,text='') {
    const ancestors=await page((target,text)=>{
      const rows=[...document.querySelectorAll(target)].filter(el=>!text||el.textContent.trim()===text);
      if(rows.length!==1)throw Error('One mounted tree navigation target required: '+target);
      const keys=[];let group=rows[0].parentElement?.closest('[data-assembly-tree-parent-key]');
      while(group){keys.unshift(group.getAttribute('data-assembly-tree-parent-key'));group=group.parentElement?.closest('[data-assembly-tree-parent-key]');}
      return keys;
    },target,text);
    for(const key of ancestors){
      const disclosure=await selector('data-assembly-tree-disclosure',key);
      if(await page(s=>document.querySelector(s)?.getAttribute('aria-expanded')==='true',disclosure))continue;
      await activate(disclosure);
      await waitFor('assembly ancestor disclosure opens',()=>page(s=>document.querySelector(s)?.getAttribute('aria-expanded')==='true',disclosure));
    }
  }
  return {reveal,selector,press:async(target,text='')=>{await reveal(target,text);await activate(target,text);}};
};
