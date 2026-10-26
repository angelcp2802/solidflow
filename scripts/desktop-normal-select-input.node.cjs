'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createNormalSelectInput,inspectNormalSelect,normalSelectDelivered}=require('./desktop-normal-select-input.cjs');

const valid=values=>({count:1,connected:true,visible:true,disabled:false,hit:true,inViewport:true,modal:false,
  optionCount:9,normalReady:true,focused:false,value:'',activePath:'BODY:1/BUTTON:0',selectPath:'BODY:1/SELECT:1',direction:'Tab',...values});
function fixture(options={}){
  const sent=[],reads=[],states=options.states??[valid({focused:true})];let index=0,polls=0;
  const window={isVisible:()=>!!options.visible,webContents:{debugger:{isAttached:()=>options.attached!==false,
    sendCommand:async(method,event)=>{assert.equal(method,'Input.dispatchKeyEvent');sent.push(event);await options.send?.(event);}}}};
  const input=createNormalSelectInput({allowed:options.allowed??true,platform:options.platform??'darwin',
    getWindow:()=>options.changedWindow&&reads.length?{...window}:window,
    evaluate:async source=>{assert.equal(source,'('+inspectNormalSelect.toString()+')()');reads.push(source);return states[Math.min(index++,states.length-1)];},
    waitFor:async(label,inspect)=>{assert.equal(label,'closed Normal orientation selector receives native keyboard focus');
      for(let i=0;i<66;i++){polls++;const result=await inspect();if(result)return result;}throw Error('Unexpected unbounded focus wait');},
    check:(value,message)=>assert.ok(value,message)});
  return {...input,sent,reads,polls:()=>polls};
}

test('macOS Normal typeahead sends unmodified printable n and releases it without a popup or command modifier',async()=>{
  const f=fixture();await f.key('n');
  assert.deepEqual(f.sent,[
    {key:'n',code:'KeyN',windowsVirtualKeyCode:78,modifiers:0,type:'keyDown',text:'n',unmodifiedText:'n'},
    {key:'n',code:'KeyN',windowsVirtualKeyCode:78,modifiers:0,type:'keyUp'},
  ]);assert.equal(f.reads.length,1);
});

test('native Tab and ShiftTab use only their bounded key sequence and release Shift',async()=>{
  const forward=fixture();await forward.key('Tab');
  assert.deepEqual(forward.sent,[{key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:0,type:'keyDown'},
    {key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:0,type:'keyUp'}]);
  const reverse=fixture();await reverse.key('ShiftTab');
  assert.deepEqual(reverse.sent,[{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8},
    {key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8,type:'keyDown'},
    {key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8,type:'keyUp'},
    {type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:0}]);
});

test('wrong platform, scope, ownership, hidden state or key sends no keyboard input',async()=>{
  for(const options of [{platform:'linux'},{platform:'win32'},{allowed:false},{visible:true},{attached:false},{changedWindow:true}]){
    const f=fixture(options);await assert.rejects(f.key('n'));assert.deepEqual(f.sent,[]);
  }
  const f=fixture();for(const key of ['N','Enter','End','8','arbitrary'])await assert.rejects(f.key(key),/Only fixed/);
  assert.deepEqual(f.sent,[]);assert.equal(f.reads.length,0);
});

test('fresh DOM guards reject ambiguous, obscured, disabled, modal or unsupported selector state',async()=>{
  for(const state of [valid({count:2}),valid({connected:false}),valid({visible:false}),valid({disabled:true}),valid({inViewport:false}),
    valid({hit:false}),valid({modal:true}),valid({optionCount:17}),valid({normalReady:false}),valid({value:'front'}),valid({activePath:null})]){
    const f=fixture({states:[state]});await assert.rejects(f.key('Tab'));assert.deepEqual(f.sent,[]);
  }
  const unfocused=fixture({states:[valid()]});await assert.rejects(unfocused.key('n'),/actual selector focus/);assert.deepEqual(unfocused.sent,[]);
});

test('focus follows its initial DOM direction, handles already focused state and detects no advance or cycles',async()=>{
  const f=fixture({states:[valid({direction:'ShiftTab',activePath:'after'}),valid({activePath:'middle'}),valid({activePath:'target',focused:true})]});
  assert.deepEqual(await f.focus(),{steps:2,direction:'ShiftTab',initialPath:'after',focusedPath:'target'});
  assert.equal(f.sent.length,8);assert.equal(f.polls(),3);
  const focused=fixture();assert.equal((await focused.focus()).steps,0);assert.deepEqual(focused.sent,[]);
  const stagnant=fixture({states:[valid()]});await assert.rejects(stagnant.focus(),/did not advance/);assert.equal(stagnant.sent.length,2);
  const cycle=fixture({states:[valid({activePath:'a'}),valid({activePath:'b'}),valid({activePath:'a'})]});
  await assert.rejects(cycle.focus(),/cycled/);assert.equal(cycle.sent.length,4);
  const unordered=fixture({states:[valid({direction:null})]});await assert.rejects(unordered.focus(),/DOM order/);assert.deepEqual(unordered.sent,[]);
});

test('focus permits reaching the target on step 64 and rejects a 65th input',async()=>{
  const states=Array.from({length:64},(_,index)=>valid({activePath:'step'+index}));
  const success=fixture({states:[...states,valid({activePath:'target',focused:true})]});assert.equal((await success.focus()).steps,64);assert.equal(success.sent.length,128);
  const failure=fixture({states:[...states,valid({activePath:'still-outside'})]});await assert.rejects(failure.focus(),/64 keyboard/);assert.equal(failure.sent.length,128);
});

test('keydown failure still releases all pressed keys and preserves the first exception',async()=>{
  const primary=new Error('keydown failed'),cleanup=new Error('keyup failed');
  const f=fixture({send:event=>{if(event.type==='keyDown'&&event.key==='n')throw primary;if(event.type==='keyUp')throw cleanup;}});
  await assert.rejects(f.key('n'),error=>error===primary);assert.equal(f.sent.at(-1).type,'keyUp');
  const reverse=fixture({send:event=>{if(event.type==='keyDown'&&event.key==='Tab')throw primary;if(event.type==='keyUp'&&event.key==='Tab')throw cleanup;}});
  await assert.rejects(reverse.key('ShiftTab'),error=>error===primary);
  assert.deepEqual(reverse.sent.slice(-2).map(event=>[event.key,event.type,event.modifiers]),[['Tab','keyUp',8],['Shift','keyUp',0]]);
  const releaseOnly=fixture({send:event=>{if(event.type==='keyUp')throw cleanup;}});await assert.rejects(releaseOnly.key('n'),error=>error===cleanup);
});

test('native-delivery acceptance needs exactly one trusted Normal input and change with no dropped observations',()=>{
  const event=type=>({type,isTrusted:true,targetIsSelect:true,state:{connected:true,current:true,disabled:false,value:'normal'}});
  const observation={events:[{type:'keydown'},event('input'),event('change'),{type:'keyup'}],dropped:0,state:{value:''}};
  assert.equal(normalSelectDelivered(observation),true);
  for(const bad of [{...observation,dropped:1},{...observation,events:[event('change')]},{...observation,events:[event('input')]},
    {...observation,events:[event('input'),event('change'),event('change')]},
    {...observation,events:[{...event('input'),isTrusted:false},event('change')]},
    {...observation,events:[event('input'),{...event('change'),targetIsSelect:false}]},
    {...observation,events:[event('input'),{...event('change'),state:{...event('change').state,value:'front'}}]},
    {...observation,events:Array(25).fill(event('input'))}])assert.equal(normalSelectDelivered(bad),false);
});

test('DOM inspection reads actual focus order, selector hit and unique visible N option without mutation',()=>{
  function inspect(options={}){
    const root={tagName:'HTML',parentElement:null,children:[]},body={tagName:'BODY',parentElement:root,children:[],isConnected:true};root.children=[body];
    const rect={left:10,top:20,right:110,bottom:50,width:100,height:30};
    const option=(value,label,extra={})=>({value,label,disabled:false,matches:()=>false,closest:()=>null,style:{display:'block',visibility:'visible'},...extra});
    const normal=option('normal','Normal a (Ctrl+8)'),select={tagName:'SELECT',parentElement:body,isConnected:true,options:[option('front','Frontal'),normal],disabled:false,value:'',
      closest:()=>null,matches:()=>false,checkVisibility:()=>true,getClientRects:()=>[rect],getBoundingClientRect:()=>rect};
    const active={tagName:'BUTTON',parentElement:body,isConnected:true,compareDocumentPosition:()=>options.after?2:4};body.children=[active,select];
    select.compareDocumentPosition=()=>0;
    if(options.ambiguousN)select.options.push(option('another','Nuevo'));
    if(options.hiddenNormal)normal.style.display='none';
    if(options.disabledNormal)normal.disabled=true;
    const document={documentElement:root,body,activeElement:options.focused?select:active,
      querySelectorAll:selector=>selector.startsWith('select')?(options.duplicate?[select,select]:[select]):[],elementFromPoint:()=>options.obscured?active:select};
    return vm.runInNewContext('('+inspectNormalSelect.toString()+')()',{document,innerWidth:500,innerHeight:300,
      Node:{DOCUMENT_POSITION_DISCONNECTED:1,DOCUMENT_POSITION_PRECEDING:2,DOCUMENT_POSITION_FOLLOWING:4},getComputedStyle:option=>option.style});
  }
  assert.equal(inspect().direction,'Tab');assert.equal(inspect({after:true}).direction,'ShiftTab');
  assert.equal(inspect({focused:true}).focused,true);assert.equal(inspect().normalReady,true);
  for(const option of ['ambiguousN','hiddenNormal','disabledNormal'])assert.equal(inspect({[option]:true}).normalReady,false);
  assert.equal(inspect({duplicate:true}).count,2);assert.equal(inspect({obscured:true}).hit,false);
});
