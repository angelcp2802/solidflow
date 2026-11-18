'use strict';

// Test-owned, read-only DOM inspection. Native focus and selection are supplied
// exclusively by the three fixed CDP keyboard actions below.
function inspectNormalSelect() {
  const selector='select[aria-label="Orientación de vista"]',matches=[...document.querySelectorAll(selector)],select=matches[0];
  const visible=element=>!!element?.isConnected&&!element.closest('[hidden],[inert]')&&element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&element.getClientRects().length>0;
  const rect=select?.getBoundingClientRect(),active=document.activeElement;
  const path=element=>{
    const parts=[];
    while(element&&element!==document.documentElement&&parts.length<32){
      const parent=element.parentElement;if(!parent)return null;
      parts.push(element.tagName+':'+[...parent.children].indexOf(element));element=parent;
    }
    return element===document.documentElement?parts.reverse().join('/'):null;
  };
  const options=[...(select?.options??[])],normal=options.filter(option=>option.value==='normal');
  const nOptions=options.filter(option=>{
    const style=getComputedStyle(option);
    return !option.disabled&&!option.matches(':disabled')&&!option.closest('[hidden]')
      &&style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&/^n/i.test(option.label.trim());
  });
  const position=active&&select?active.compareDocumentPosition(select):0;
  let direction=null;
  if(active===document.body||active===document.documentElement)direction='Tab';
  else if(!(position&Node.DOCUMENT_POSITION_DISCONNECTED)){
    if(position&Node.DOCUMENT_POSITION_FOLLOWING)direction='Tab';
    else if(position&Node.DOCUMENT_POSITION_PRECEDING)direction='ShiftTab';
  }
  const point=rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:null;
  return {count:matches.length,connected:!!select?.isConnected,visible:visible(select),disabled:!select||select.disabled||select.matches(':disabled'),
    hit:!!point&&document.elementFromPoint(point.x,point.y)===select,
    inViewport:!!rect&&rect.width>0&&rect.height>0&&rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,
    modal:[...document.querySelectorAll('[role="dialog"],[role="menu"]')].some(visible),
    optionCount:options.length,normalReady:normal.length===1&&nOptions.length===1&&nOptions[0]===normal[0],
    focused:active===select,value:select?.value??null,activePath:path(active),selectPath:path(select),direction};
}

function createNormalSelectInput({allowed,platform,getWindow,evaluate,waitFor,check}) {
  const ownedWindow=()=>{
    const window=getWindow();
    check(allowed===true&&platform==='darwin'&&window&&!window.isVisible()&&window.webContents.debugger.isAttached(),
      'Closed Normal selector input requires the hidden owned macOS Normal To workflow');
    return window;
  };
  async function read() {
    const window=ownedWindow(),state=await evaluate('('+inspectNormalSelect.toString()+')()');
    check(ownedWindow()===window,'Normal selector keyboard ownership must remain current');
    check(state.count===1&&state.connected&&state.visible&&!state.disabled&&state.inViewport&&state.hit,
      'One enabled visible hit-tested Normal orientation selector is required');
    check(!state.modal,'Normal selector keyboard traversal cannot cross an open menu or dialog');
    check(state.optionCount>0&&state.optionCount<=16&&state.normalReady,
      'Normal must be the unique enabled visible option beginning with N');
    check(state.value===''&&state.activePath!==null&&state.selectPath!==null,
      'Closed command selector and connected bounded focus identities are required');
    return {window,state};
  }
  async function dispatch(combo,window,state) {
    check(ownedWindow()===window,'Normal selector keyboard ownership must remain current');
    check(combo!=='n'||state.focused,'Normal typeahead requires actual selector focus');
    const shift=combo==='ShiftTab',letter=combo==='n',modifiers=shift?8:0;
    const event={key:letter?'n':'Tab',code:letter?'KeyN':'Tab',windowsVirtualKeyCode:letter?78:9,modifiers};
    const send=event=>window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',event);
    let failure;
    try {
      if(shift)await send({type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:8});
      await send({...event,type:'keyDown',...(letter?{text:'n',unmodifiedText:'n'}:{})});
    } catch(error){failure=error;}
    const releases=[{...event,type:'keyUp'},...(shift?[{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,modifiers:0}]:[])];
    for(const release of releases){try{await send(release);}catch(error){failure??=error;}}
    if(failure)throw failure;
  }
  return {
    async key(combo) {
      check(['Tab','ShiftTab','n'].includes(combo),'Only fixed Normal selector focus and typeahead keys are admitted');
      const {window,state}=await read();await dispatch(combo,window,state);
    },
    async focus() {
      let direction=null,previous=null,steps=0,initialPath=null;
      const visited=new Set();
      return waitFor('closed Normal orientation selector receives native keyboard focus',async()=>{
        const {window,state}=await read();
        initialPath??=state.activePath;
        if(state.focused)return {steps,direction,initialPath,focusedPath:state.activePath};
        check(state.activePath!==previous,'Normal selector Tab traversal did not advance focus');
        check(!visited.has(state.activePath),'Normal selector Tab traversal cycled before reaching its target');
        check(steps<64,'Normal selector focus traversal exceeded 64 keyboard steps');
        direction??=state.direction;
        check(direction==='Tab'||direction==='ShiftTab','Current DOM order must define the selector focus direction');
        visited.add(state.activePath);previous=state.activePath;
        await dispatch(direction,window,state);steps++;return false;
      });
    },
  };
}

function normalSelectDelivered(observation) {
  if(!observation||observation.dropped!==0||!Array.isArray(observation.events)||observation.events.length>24)return false;
  const delivered=observation.events.filter(event=>event.type==='input'||event.type==='change');
  return delivered.length===2&&['input','change'].every(type=>delivered.filter(event=>event.type===type).length===1)
    &&delivered.every(event=>event.isTrusted===true&&event.targetIsSelect===true&&event.state?.connected===true
      &&event.state.current===true&&event.state.disabled===false&&event.state.value==='normal');
}

module.exports={createNormalSelectInput,inspectNormalSelect,normalSelectDelivered};
