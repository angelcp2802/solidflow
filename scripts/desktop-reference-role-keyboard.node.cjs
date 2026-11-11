'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const create=require('./desktop-reference-role-keyboard.cjs');
// Synthetic transport tests do not claim browser focus or CAD acceptance.
function harness({visible=false,focused=true,failEnter=false,stuck=false}={}) {
  const commands=[];let calls=0,pressed='false';const window={isVisible:()=>visible,webContents:{isDestroyed:()=>false,debugger:{isAttached:()=>true,async sendCommand(method,event){commands.push({method,event});if(event.type==='keyDown'&&event.key==='Enter'){if(failEnter)throw Error('original dispatch failure');pressed=pressed==='false'?'true':'false'}}}}};
  const activate=create({allowed:true,getWindow:()=>window,evaluate:async source=>source.includes("getAttribute('aria-pressed')")?pressed:source.includes('document.activeElement===document.querySelector')?true:({focused:focused||!stuck&&calls++>0,active:1,direction:'backward'}),check:(v,label)=>{if(!v)throw Error(label)},waitFor:async(label,read)=>{for(let i=0;i<66;i++){const result=await read();if(result)return result}throw Error(label)}});
  return {commands,activate};
}
test('rejects arbitrary roles and a visible or unowned window before native input',async()=>{
  const h=harness();await assert.rejects(h.activate('arbitrary-selector'),/Only fixed material roles/);assert.deepEqual(h.commands,[]);
  const visible=harness({visible:true});await assert.rejects(visible.activate('gear-2'),/owned hidden window/);assert.deepEqual(visible.commands,[]);
});
test('uses bounded native ShiftTab and Enter, releasing every key without setting focus',async()=>{
  const h=harness({focused:false});const result=await h.activate('line-origin');assert.equal(result.steps,1);assert.equal(result.direction,'backward');
  assert.deepEqual(h.commands.map(c=>[c.event.type,c.event.key]),[['keyDown','Shift'],['keyDown','Tab'],['keyUp','Tab'],['keyUp','Shift'],['keyDown','Enter'],['keyUp','Enter']]);
  assert.ok(h.commands.every(c=>c.method==='Input.dispatchKeyEvent'));
});
test('retains the original dispatch error and still releases Enter',async()=>{
  const h=harness({failEnter:true});await assert.rejects(h.activate('profile-2'),/original dispatch failure/);assert.deepEqual(h.commands.map(c=>[c.event.type,c.event.key]),[['keyDown','Enter'],['keyUp','Enter']]);
});
test('rejects focus cycles without activating a reference',async()=>{
  const h=harness({focused:false,stuck:true});await assert.rejects(h.activate('origin'),/within 64 controls/);assert.ok(h.commands.length===4&&h.commands.every(c=>c.event.key!=='Enter'));
});
