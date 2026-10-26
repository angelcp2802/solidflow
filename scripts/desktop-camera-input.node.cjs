'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const cameraInput=require('./desktop-camera-input.cjs');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const label=(values={})=>({key:'X',text:'Eje X',disabled:false,className:'selected',visible:true,
  button:{left:210,top:190,width:80,height:30},textRect:{left:220,top:198,width:10,height:8},...values});

function fixture(options={}){
  const sent=[],captures=[],scripts=[];
  const rect={left:100,top:80,width:800,height:500};
  const canvas={getClientRects:()=>[rect],getBoundingClientRect:()=>rect};
  const labels=(options.labels??[]).map(value=>({
    dataset:{originKey:value.key},textContent:value.text,disabled:value.disabled,className:value.className,
    getClientRects:()=>value.visible?[value.button]:[],checkVisibility:()=>value.visible,
    getBoundingClientRect:()=>value.button,getAttribute:name=>value[name]??null,
    textRect:value.textRect,border:value.border??'1px',
  }));
  const document={querySelectorAll:selector=>{
    if(selector==='.assembly-origin-labels > button[data-origin-key]')return labels;
    assert.equal(selector,'.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"]),.assembly-viewport canvas');
    return options.ambiguous?[canvas,canvas]:[canvas];
  },elementFromPoint:()=>options.hit===false?{}:canvas,createRange(){
    let selected;return {selectNodeContents(element){selected=element;},getBoundingClientRect(){return selected.textRect;}};
  }};
  const size=options.size??{width:608,height:300},raw=options.raw??Buffer.alloc(size.width*size.height*4,127),digests=[];
  const image={getSize:()=>size,isEmpty:()=>!!options.empty,toBitmap:()=>raw};
  const window={isVisible:()=>!!options.visible,webContents:{debugger:{isAttached:()=>options.attached!==false,sendCommand:async(method,event)=>{
    assert.equal(method,'Input.dispatchMouseEvent');sent.push(event);await options.fail?.(event);
  }},capturePage:async crop=>{captures.push(crop);return image;}}};
  const camera=cameraInput({getWindow:()=>window,allowed:options.allowed!==false,check:(value,message)=>assert.ok(value,message),digest:bytes=>{
    digests.push(Buffer.from(bytes));return digest(bytes);
  },evaluate:async source=>{scripts.push(source);return JSON.parse(JSON.stringify(vm.runInNewContext(source,{document,innerWidth:1024,innerHeight:700,
    getComputedStyle:element=>({borderLeftWidth:element.border,borderRightWidth:element.border,borderTopWidth:element.border,borderBottomWidth:element.border})})));}});
  return {...camera,sent,captures,scripts,raw,digests};
}
test('orbit and pan send bounded real middle-button CDP paths with only Shift distinguishing pan',async()=>{
  for(const kind of ['orbit','pan']){
    const f=fixture(),result=await f.cameraGesture(kind),modifiers=kind==='pan'?8:0;
    assert.deepEqual(result,{kind,start:{x:596,y:340},end:{x:656,y:364},modifiers,transport:'CDP mouse events'});
    assert.equal(f.sent.length,10);
    assert.deepEqual(f.sent[1],{type:'mousePressed',x:596,y:340,button:'middle',buttons:4,clickCount:1,pointerType:'mouse',modifiers});
    assert.deepEqual(f.sent.slice(2,8).map(e=>[e.x,e.y,e.buttons,e.modifiers]),Array.from({length:6},(_,i)=>[606+i*10,344+i*4,4,modifiers]));
    assert.equal(f.sent[8].type,'mouseReleased');assert.equal(f.sent[8].buttons,0);
    assert.deepEqual(f.sent[9],{type:'mouseMoved',x:16,y:16,button:'none',buttons:0,pointerType:'mouse',modifiers:0});
    assert.equal(f.captures.length,0);
  }
});
test('wheel uses one finite delta with no press or release and parks afterward',async()=>{
  const f=fixture();await f.cameraGesture('wheel-in');
  assert.equal(f.sent.length,3);
  assert.deepEqual(f.sent[1],{type:'mouseWheel',x:596,y:340,deltaX:0,deltaY:-160,button:'none',buttons:0,pointerType:'mouse'});
});
test('scope, hidden window, debugger, unique canvas and actual hit fail closed before pointer input',async()=>{
  for(const options of [{allowed:false},{visible:true},{attached:false},{ambiguous:true},{hit:false}]){
    const f=fixture(options);await assert.rejects(f.cameraGesture('orbit'));assert.deepEqual(f.sent,[]);assert.deepEqual(f.captures,[]);
  }
  const f=fixture();await assert.rejects(f.cameraGesture('arbitrary'));assert.equal(f.scripts.length,0);
});
test('failed drag and failed release both attempt final parking and preserve the earliest error',async()=>{
  const primary=new Error('drag failure'),release=new Error('release failure');
  const f=fixture({fail:event=>{if(event.type==='mouseMoved'&&event.buttons===4)throw primary;if(event.type==='mouseReleased')throw release;}});
  await assert.rejects(f.cameraGesture('pan'),error=>error===primary);
  assert.equal(f.sent.at(-2).type,'mouseReleased');assert.equal(f.sent.at(-1).modifiers,0);assert.equal(f.sent.at(-1).x,16);
  const releaseOnly=fixture({fail:event=>{if(event.type==='mouseReleased')throw release;}});
  await assert.rejects(releaseOnly.cameraGesture('orbit'),error=>error===release);assert.equal(releaseOnly.sent.at(-1).x,16);
});
test('wheel failure parks and capture hashes only actual interior pixels without pointer or application mutations',async()=>{
  const failure=new Error('wheel failure'),f=fixture({fail:event=>{if(event.type==='mouseWheel')throw failure;}});
  await assert.rejects(f.cameraGesture('wheel-in'),error=>error===failure);assert.equal(f.sent.at(-1).x,16);
  const capture=fixture();assert.deepEqual(await capture.cameraFrame(),{width:608,height:300,sha256:digest(capture.raw),rawSha256:digest(capture.raw),maskedRects:[],unmaskedPixelCount:182400});
  assert.deepEqual(capture.captures,[{x:196,y:180,width:608,height:300}]);assert.deepEqual(capture.sent,[]);
  await assert.rejects(fixture({empty:true}).cameraFrame(),/pixels/);
});

test('only the observed text range is excluded while raw pixels, button border, background and other scene pixels remain exact',async()=>{
  const f=fixture({labels:[label()]}),original=Buffer.from(f.raw),frame=await f.cameraFrame();
  assert.deepEqual(frame.maskedRects,[{key:'X',text:'Eje X',state:{disabled:false,className:'selected',ariaPressed:null,ariaSelected:null},x:23,y:17,width:12,height:10}]);
  assert.equal(frame.unmaskedPixelCount,182280);
  const expected=Buffer.from(original);
  for(let y=17;y<27;y++)expected.fill(0,(y*608+23)*4,(y*608+35)*4);
  assert.deepEqual(f.digests[0],expected);assert.deepEqual(f.digests[1],original);assert.deepEqual(f.raw,original);
  assert.equal(frame.sha256,digest(expected));assert.equal(frame.rawSha256,digest(original));assert.deepEqual(f.sent,[]);
  const inside=Buffer.from(original);inside[(18*608+24)*4]=33;
  const changedText=await fixture({labels:[label()],raw:inside}).cameraFrame();
  assert.equal(changedText.sha256,frame.sha256);assert.notEqual(changedText.rawSha256,frame.rawSha256);
  for(const[x,y]of [[22,17],[14,10],[21,16],[80,80]]){
    const outside=Buffer.from(original);outside[(y*608+x)*4]=33;
    assert.notEqual((await fixture({labels:[label()],raw:outside}).cameraFrame()).sha256,frame.sha256);
  }
});

test('text exclusions use bitmap scaling and clip at the original capture without masking SVG or whole labels',async()=>{
  const f=fixture({size:{width:1216,height:600},labels:[label({button:{left:190,top:178,width:30,height:20},textRect:{left:194,top:179,width:10,height:4}})]});
  const frame=await f.cameraFrame();
  assert.deepEqual(frame.maskedRects.map(({x,y,width,height})=>({x,y,width,height})),[{x:0,y:0,width:17,height:7}]);
  assert.equal(frame.unmaskedPixelCount,1216*600-119);
  assert.equal(f.digests[0][(7*1216+0)*4],127);assert.equal(f.digests[0][(0*1216+17)*4],127);
  assert.deepEqual(f.sent,[]);
});

test('text padding stops at actual CSS borders scaled into the bitmap',async()=>{
  const f=fixture({size:{width:1216,height:600},labels:[label({border:'2px',button:{left:210,top:190,width:20,height:20},textRect:{left:212,top:192,width:16,height:16}})]});
  const frame=await f.cameraFrame();
  assert.deepEqual(frame.maskedRects.map(({x,y,width,height})=>({x,y,width,height})),[{x:32,y:24,width:32,height:32}]);
  assert.equal(f.digests[0][(23*1216+32)*4],127);assert.equal(f.digests[0][(24*1216+31)*4],127);
  assert.equal(f.digests[0][(56*1216+32)*4],127);assert.equal(f.digests[0][(24*1216+64)*4],127);
});

test('only visible text intersections are retained, with deterministic identity and union pixel counts',async()=>{
  const f=fixture({labels:[label({key:'B',text:'B'}),label({key:'A',text:'A','aria-pressed':'true'}),
    label({key:'hidden',visible:false}),label({key:'outside',button:{left:10,top:10,width:80,height:30},textRect:{left:20,top:18,width:10,height:8}})]});
  const frame=await f.cameraFrame();
  assert.deepEqual(frame.maskedRects.map(({key,text,state})=>({key,text,state})),[
    {key:'A',text:'A',state:{disabled:false,className:'selected',ariaPressed:'true',ariaSelected:null}},
    {key:'B',text:'B',state:{disabled:false,className:'selected',ariaPressed:null,ariaSelected:null}},
  ]);
  assert.equal(frame.unmaskedPixelCount,182280);
});

test('malformed, ambiguous or excessive masks fail closed rather than hiding a camera change',async()=>{
  const cases=[
    [label(),label()],Array.from({length:33},(_,i)=>label({key:String(i)})),
    [label({key:''})],[label({text:''})],[label({textRect:{left:209,top:198,width:10,height:8}})],
    [label({border:'invalid'})],[label({border:'-1px'})],
    [label({textRect:{left:220,top:198,width:Infinity,height:8}})],
    [label({button:{left:200,top:180,width:500,height:200},textRect:{left:201,top:181,width:498,height:198}})],
  ];
  for(const labels of cases){const f=fixture({labels});await assert.rejects(f.cameraFrame());assert.deepEqual(f.sent,[]);}
  await assert.rejects(fixture({raw:Buffer.alloc(5)}).cameraFrame(),/four bytes/);
});
