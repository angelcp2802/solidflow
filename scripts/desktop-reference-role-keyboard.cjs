'use strict';
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Fixed native Tab/ShiftTab/Enter on the scenario's test-owned role buttons only.
// No focus, declaration, worker state or reference is injected.
module.exports = function referenceRoleKeyboard({ allowed, heldReferenceKind, getWindow, evaluate, waitFor, check }) {
  const labels = {
    point:'Seleccionar Punto del trayecto circular en el modelo',arc:'Seleccionar Arco del trayecto circular en el modelo',origin:'Seleccionar Origen del trayecto circular en el modelo',up:'Seleccionar Guía UP del trayecto circular en el modelo',
    'line-point':'Seleccionar Punto del trayecto LINE en el modelo','line-origin':'Seleccionar Origen del trayecto LINE en el modelo',
    'gear-1':'Seleccionar eje 1 del engranaje en el modelo','gear-2':'Seleccionar eje 2 del engranaje en el modelo',
    'screw-1':'Seleccionar eje 1 del tornillo en el modelo','screw-2':'Seleccionar eje 2 del tornillo en el modelo',
    'profile-1':'Seleccionar cara del perfil 1 en el modelo','profile-2':'Seleccionar cara del perfil 2 en el modelo',
  };
  const heldLabels = {
    'standard-face': { 'face-1': 'Referencia 1 de la relación', 'face-2': 'Referencia 2 de la relación' },
    'configured-face': { 'face-1': 'Seleccionar Referencia 1 por cara en vista configurada', 'face-2': 'Seleccionar Referencia 2 por cara en vista configurada' },
    'standard-origin': { 'origin-2': 'Seleccionar orígenes', 'root-z': 'Seleccionar Eje Z · Raíz' },
    'configured-origin': { 'origin-2': 'Seleccionar Referencia 2 por origen en vista configurada', 'root-z': 'Seleccionar Eje Z · Raíz' },
  };
  const page=(fn,...args)=>evaluate('('+fn.toString()+')('+args.map(v=>'JSON.parse('+encodeJavaScriptString(JSON.stringify(v))+')').join(',')+')');
  const owned=()=>{const w=getWindow();check(allowed===true&&w&&!w.isVisible()&&!w.webContents.isDestroyed()&&w.webContents.debugger.isAttached(),'Fixed material role keyboard requires its owned hidden window');return w};
  async function dispatch(w,shift,enter=false){check(owned()===w,'Current material keyboard window');const event={key:enter?'Enter':'Tab',code:enter?'Enter':'Tab',windowsVirtualKeyCode:enter?13:9,modifiers:shift?8:0};let failure;try{if(shift)await w.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8});await w.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{...event,type:'keyDown',...(enter?{text:'\r',unmodifiedText:'\r'}:{})})}catch(error){failure=error}for(const e of [{...event,type:'keyUp'},...(shift?[{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:0}]:[])])try{await w.webContents.debugger.sendCommand('Input.dispatchKeyEvent',e)}catch(error){failure??=error}if(failure)throw failure;}
  return async function activate(role){
    const material = Object.hasOwn(labels, role), scoped = heldLabels[heldReferenceKind];
    check(material || scoped && Object.hasOwn(scoped, role), 'Only fixed material roles or the scenario’s held reference controls');
    const w=owned(),selector='button[aria-label="'+(material ? labels[role] : scoped[role])+'"]',visited=new Set();let steps=0,direction;
    await waitFor('native focus on current material '+role,async()=>{
      const v=await page(selector=>{const rows=document.querySelectorAll(selector),e=rows[0],active=document.activeElement;if(rows.length!==1||e.disabled||e.closest('[hidden]')||!e.checkVisibility()||document.querySelector('dialog[open],[role="menu"]'))throw Error('One available material role without modal owner');const position=active?.compareDocumentPosition(e),all=[...document.querySelectorAll('*')];return{focused:active===e,active:all.indexOf(active),direction:active===document.body||active===document.documentElement||position&Node.DOCUMENT_POSITION_FOLLOWING?'forward':'backward'}},selector);
      check(owned()===w,'Keyboard target belongs to same window');if(v.focused)return true;check(steps<64&&!visited.has(v.active),'Material Tab traversal must advance within 64 controls');visited.add(v.active);direction??=v.direction;await dispatch(w,direction==='backward');steps++;return false;
    });
    check(await page(selector=>document.activeElement===document.querySelector(selector),selector),'Actual native material role focus before Enter');
    if (!material) { await dispatch(w,false,true); return { role, steps, direction }; }
    const beforePressed=await page(selector=>document.querySelector(selector)?.getAttribute('aria-pressed'),selector);check(beforePressed==='true'||beforePressed==='false','Role exposes its actual toggle state');await dispatch(w,false,true);
    const afterPressed=beforePressed==='true'?'false':'true';await waitFor('actual native role toggle after Enter',async()=>owned()===w&&await page(selector=>document.querySelector(selector)?.getAttribute('aria-pressed'),selector)===afterPressed);
    return {role,steps,direction,beforePressed,afterPressed};
  };
};
