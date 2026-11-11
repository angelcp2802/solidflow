'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dispatchShortcutKey } = require('./desktop-shortcut-key-event.cjs');

async function events(combo, platform, editable) {
  const result=[]; await dispatchShortcutKey(combo,{platform,editable,send:async event=>result.push(event)});return result;
}
test('macOS select-all and native undo carry editing commands only on their physical keydown',async()=>{
  for(const [combo,key,vk,command] of [['A','a',65,'selectAll'],['Z','z',90,'undo']]){
    assert.deepEqual(await events(combo,'darwin',true),[
      {key:'Meta',code:'MetaLeft',windowsVirtualKeyCode:91,type:'rawKeyDown',modifiers:4},
      {key,code:'Key'+combo,windowsVirtualKeyCode:vk,modifiers:4,type:'rawKeyDown',commands:[command]},
      {key,code:'Key'+combo,windowsVirtualKeyCode:vk,modifiers:4,type:'keyUp'},
      {key:'Meta',code:'MetaLeft',windowsVirtualKeyCode:91,type:'keyUp',modifiers:0},
    ]);
  }
});
test('model undo, file commands, and non-macOS editing never receive an editor command',async()=>{
  for(const [combo,platform,editable] of [['Z','darwin',false],['ShiftZ','darwin',true],['Y','darwin',true],['S','darwin',true],['ShiftS','darwin',true],['A','win32',true],['Z','linux',true]]){
    const rows=await events(combo,platform,editable);
    assert.ok(rows.every(row=>!Object.hasOwn(row,'commands')));
    assert.equal(rows.at(-1).modifiers,0);
    assert.equal(rows[0].key,platform==='darwin'?'Meta':'Control');
  }
});
test('one held model Undo repeats the Z keydown before either key is released',async()=>{
  const sent=[];
  const key={key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2};
  const modifier={key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17};
  await dispatchShortcutKey('Z',{platform:'win32',editable:false,send:async event=>sent.push(event),
    beforeRepeat:async()=>assert.deepEqual(sent,[
      {...modifier,type:'rawKeyDown',modifiers:2},
      {...key,type:'rawKeyDown'},
    ]),
  });
  assert.deepEqual(sent.slice(2),[
    {...key,type:'rawKeyDown',autoRepeat:true},
    {...key,type:'keyUp'},
    {...modifier,type:'keyUp',modifiers:0},
  ]);
});
test('held Undo rejects other commands and editable focus, and releases both keys after a failed first-key check',async()=>{
  const sent=[], options={platform:'win32',editable:false,send:async event=>sent.push(event),beforeRepeat:async()=>{}};
  await assert.rejects(dispatchShortcutKey('Y',options),/bounded non-editable document Undo/);
  await assert.rejects(dispatchShortcutKey('Z',{...options,editable:true}),/bounded non-editable document Undo/);
  assert.deepEqual(sent,[]);
  const failure=new Error('first-key check failed');
  await assert.rejects(dispatchShortcutKey('Z',{...options,beforeRepeat:async()=>{throw failure;}}),error=>error===failure);
  assert.deepEqual(sent.map(({key,type,autoRepeat})=>[key,type,autoRepeat]),[
    ['Control','rawKeyDown',undefined],['z','rawKeyDown',undefined],['z','keyUp',undefined],['Control','keyUp',undefined],
  ]);
});
test('select-all without owned editable focus and unknown keys dispatch nothing',async()=>{
  const sent=[];const options={platform:'darwin',editable:false,send:async event=>sent.push(event)};
  await assert.rejects(dispatchShortcutKey('A',options),/owned editable/);
  await assert.rejects(dispatchShortcutKey('arbitrary',options),/Bounded/);
  assert.deepEqual(sent,[]);
});
test('normal-view shortcut carries the platform modifier and releases it without editing commands',async()=>{
  for(const platform of ['win32','linux','darwin']){
    const modifier=platform==='darwin'?4:2, rows=await events('8',platform,false);
    assert.deepEqual(rows.slice(1,3),[
      {key:'8',code:'Digit8',windowsVirtualKeyCode:56,modifiers:modifier,type:'rawKeyDown'},
      {key:'8',code:'Digit8',windowsVirtualKeyCode:56,modifiers:modifier,type:'keyUp'},
    ]);
    assert.equal(rows[0].key,platform==='darwin'?'Meta':'Control');
    assert.equal(rows.at(-1).modifiers,0);
    assert.ok(rows.every(row=>!Object.hasOwn(row,'commands')));
  }
});
test('main dispatch failure still releases every key and preserves the first error',async()=>{
  const failure=new Error('keydown failed'),sent=[];
  await assert.rejects(dispatchShortcutKey('ShiftS',{platform:'darwin',editable:false,send:async event=>{
    sent.push(event);if(event.key==='S'&&event.type==='rawKeyDown')throw failure;
    if(event.key==='S'&&event.type==='keyUp')throw new Error('release failed');
  }}),error=>error===failure);
  assert.deepEqual(sent.slice(-3).map(event=>[event.key,event.type,event.modifiers]),[['S','keyUp',12],['Shift','keyUp',4],['Meta','keyUp',0]]);
});
test('unmodified focus and cancellation keys retain the original two-event route',async()=>{
  assert.deepEqual(await events('Escape','darwin',false),[
    {key:'Escape',code:'Escape',windowsVirtualKeyCode:27,modifiers:0,type:'rawKeyDown'},
    {key:'Escape',code:'Escape',windowsVirtualKeyCode:27,modifiers:0,type:'keyUp'},
  ]);
});
