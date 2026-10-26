'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
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
    textRect:value.textRect,border:value.border??'1px',computed:value.computed,
  }));
  const document={querySelectorAll:selector=>{
    if(selector==='.assembly-origin-labels > button[data-origin-key]')return labels;
    assert.equal(selector,'.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"]),.assembly-viewport canvas');
    return options.ambiguous?[canvas,canvas]:[canvas];
  },elementFromPoint:()=>options.hit===false?{}:canvas,createRange(){
    let selected;return {selectNodeContents(element){selected=element;},getBoundingClientRect(){return selected.textRect;}};
  }};
  let size=options.size??{width:608,height:300};
  const raw=options.raw??Buffer.alloc(size.width*size.height*4,127),digests=[];
  let currentRaw=raw;
  const image={getSize:()=>size,isEmpty:()=>!!options.empty,toBitmap:()=>currentRaw};
  const window={isVisible:()=>!!options.visible,webContents:{debugger:{isAttached:()=>options.attached!==false,sendCommand:async(method,event)=>{
    assert.equal(method,'Input.dispatchMouseEvent');sent.push(event);await options.fail?.(event);
  }},capturePage:async crop=>{captures.push(crop);return image;}}};
  const camera=cameraInput({getWindow:()=>window,allowed:options.allowed!==false,
    allowRasterComparison:options.rasterComparison,allowFrameDiagnostics:options.frameDiagnostics,
    check:(value,message)=>assert.ok(value,message),digest:bytes=>{
    if(options.diagnosticHashFailure&&typeof bytes==='string')throw Error('diagnostic hash unavailable');
    digests.push(Buffer.from(bytes));return digest(bytes);
  },evaluate:async source=>{scripts.push(source);return JSON.parse(JSON.stringify(vm.runInNewContext(source,{document,innerWidth:1024,innerHeight:700,
    devicePixelRatio:options.devicePixelRatio??1,
    getComputedStyle:element=>({borderLeftWidth:element.border,borderRightWidth:element.border,borderTopWidth:element.border,borderBottomWidth:element.border,...element.computed})})));}});
  return {...camera,sent,captures,scripts,raw,digests,setCapture(bytes,dimensions=size){currentRaw=bytes;size=dimensions;}};
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

test('raster retention requires explicit isolated camera-navigation scope without image diagnostics',()=>{
  assert.equal(fixture().rasterComparison,undefined);
  for(const rasterComparison of [null,1,'true',{},[]])assert.throws(()=>fixture({rasterComparison}),/opt-in/);
  assert.throws(()=>fixture({rasterComparison:true,allowed:false}),/opt-in/);
  assert.throws(()=>fixture({rasterComparison:true,frameDiagnostics:true}),/opt-in/);
});

test('only the latest exact capture object can be retained or compared, without changing poll signatures',async()=>{
  const f=fixture({rasterComparison:true,size:{width:8,height:8}}),first=await f.cameraFrame();
  const signature=JSON.stringify(first),second=await f.cameraFrame();
  assert.equal(JSON.stringify(second),signature);
  assert.deepEqual(Object.keys(second),['width','height','sha256','rawSha256','maskedRects','unmaskedPixelCount']);
  assert.throws(()=>f.rasterComparison.retainBaseline({...second}),/capture object/);
  assert.throws(()=>f.rasterComparison.retainBaseline(first),/capture object/);
  f.rasterComparison.retainBaseline(second);
  const third=await f.cameraFrame();
  assert.throws(()=>f.rasterComparison.compare({...third}),/capture object/);
  assert.throws(()=>f.rasterComparison.compare(second),/capture object/);
  const result=f.rasterComparison.compare(third);
  assert.equal(result.raw.changedPixels,0);assert.equal(result.raw.bbox,null);
  assert.deepEqual(result.raw.grid4x4,Array(16).fill(0));assert.equal(result.unmasked.maxByteDelta,0);
  assert.equal(f.captures.length,3);assert.equal(f.scripts.length,6);assert.deepEqual(f.sent,[]);
  f.rasterComparison.clear();
  assert.throws(()=>f.rasterComparison.compare(third),/capture object/);
  assert.throws(()=>f.rasterComparison.retainBaseline(third),/capture object/);
  const fourth=await f.cameraFrame();
  assert.throws(()=>f.rasterComparison.compare(fourth),/retained crop/);
  f.rasterComparison.retainBaseline(fourth);
  assert.equal(f.rasterComparison.compare(await f.cameraFrame()).raw.changedPixels,0);
  f.rasterComparison.clear();
});

test('retention is capped at two million pixels without changing larger capture results',async()=>{
  const f=fixture({rasterComparison:true,size:{width:2000,height:1000}});
  f.rasterComparison.retainBaseline(await f.cameraFrame());
  f.rasterComparison.clear();
  f.setCapture(Buffer.alloc(2001*1000*4,127),{width:2001,height:1000});
  const large=await f.cameraFrame();
  assert.equal(large.width,2001);assert.equal(large.unmaskedPixelCount,2001000);
  assert.equal(large.rawSha256,large.sha256);
  assert.throws(()=>f.rasterComparison.retainBaseline(large),/pixel limit/);
  f.rasterComparison.clear();
});

test('independent byte differences retain exact pixel counts, exclusive bounds and fixed grid locations',async()=>{
  const f=fixture({rasterComparison:true,size:{width:8,height:8}}),before=await f.cameraFrame();
  f.rasterComparison.retainBaseline(before);
  const bytes=Buffer.from(f.raw);
  bytes[0]=129;bytes[(5*8+3)*4+2]=0;bytes[(7*8+7)*4+3]=255;
  f.setCapture(bytes);
  const after=await f.cameraFrame(),result=f.rasterComparison.compare(after),grid=Array(16).fill(0);
  grid[0]=1;grid[9]=1;grid[15]=1;
  assert.deepEqual(result.raw,{changedPixels:3,maxByteDelta:128,bbox:{x:0,y:0,right:8,bottom:8},grid4x4:grid});
  assert.deepEqual(result.unmasked,result.raw);
  assert.deepEqual(result.expected,{rawSha256:before.rawSha256,sha256:before.sha256});
  assert.deepEqual(result.actual,{rawSha256:after.rawSha256,sha256:after.sha256});
  assert.equal(result.masks.rawChangedInsideMasks,0);assert.equal(result.masks.rawChangedOutsideMasks,3);
  const {pixelEvidence,...statistics}=result;
  assert.ok(JSON.stringify(statistics).length<3000);
  assert.ok(Buffer.byteLength(JSON.stringify(pixelEvidence),'utf8')<=128*1024);assert.equal(f.captures.length,2);
  f.rasterComparison.clear();
});

test('failure statistics use only existing text exclusions and still count their raw differences',async()=>{
  const f=fixture({rasterComparison:true,labels:[label()]}),before=await f.cameraFrame();
  f.rasterComparison.retainBaseline(before);
  const bytes=Buffer.from(f.raw);
  bytes[(18*608+24)*4]=129; // Inside the original text rectangle.
  bytes[(17*608+22)*4]=128; // Adjacent pixel remains in the exact comparison.
  bytes[(80*608+80)*4]=130;bytes[(299*608+607)*4+3]=131;
  f.setCapture(bytes);
  const after=await f.cameraFrame(),result=f.rasterComparison.compare(after);
  assert.deepEqual(after.maskedRects,before.maskedRects);
  assert.equal(result.raw.changedPixels,4);assert.equal(result.unmasked.changedPixels,3);
  assert.equal(result.raw.maxByteDelta,4);assert.equal(result.unmasked.maxByteDelta,4);
  assert.deepEqual(result.raw.bbox,{x:22,y:17,right:608,bottom:300});
  assert.deepEqual(result.unmasked.bbox,result.raw.bbox);
  const rawGrid=Array(16).fill(0);rawGrid[0]=2;rawGrid[4]=1;rawGrid[15]=1;
  assert.deepEqual(result.raw.grid4x4,rawGrid);
  const comparisonGrid=[...rawGrid];comparisonGrid[0]=1;
  assert.deepEqual(result.unmasked.grid4x4,comparisonGrid);
  assert.deepEqual(result.masks,{identical:true,expectedPixels:120,actualPixels:120,rawChangedInsideMasks:1,rawChangedOutsideMasks:3});
  assert.equal(digest(bytes),after.rawSha256);assert.equal(f.captures.length,2);assert.equal(f.scripts.length,4);assert.deepEqual(f.sent,[]);
  f.rasterComparison.clear();
});

test('retained metadata and buffer hashes reject mutation, unequal dimensions and failed latest captures',async()=>{
  for(const mutate of ['metadata','bytes']){
    const f=fixture({rasterComparison:true,size:{width:8,height:8}}),before=await f.cameraFrame();
    f.rasterComparison.retainBaseline(before);
    f.setCapture(Buffer.from(f.raw));const after=await f.cameraFrame();
    if(mutate==='metadata')before.maskedRects.push({x:0});else f.raw[0]=0;
    assert.throws(()=>f.rasterComparison.compare(after),/unchanged/);
    f.rasterComparison.clear();
  }
  const f=fixture({rasterComparison:true,size:{width:8,height:8}}),before=await f.cameraFrame();
  f.rasterComparison.retainBaseline(before);
  f.setCapture(Buffer.alloc(9*8*4,127),{width:9,height:8});
  const different=await f.cameraFrame();
  assert.throws(()=>f.rasterComparison.compare(different),/equal bitmap dimensions/);
  f.setCapture(Buffer.alloc(3));await assert.rejects(f.cameraFrame(),/four bytes/);
  assert.throws(()=>f.rasterComparison.compare(different),/capture object/);
  f.rasterComparison.clear();
});

test('pixel evidence copies native bytes in clipped 3 by 3 neighborhoods from the original two captures',async()=>{
  const original=Buffer.alloc(8*8*4,127);
  // Literal byte offsets and distinct rows surround the asymmetric (4,3)
  // center. The expected neighborhood below is independent of offset math.
  for(const [offset,bytes] of [[76,[1,2,3,4]],[80,[11,12,13,14]],[84,[21,22,23,24]],
    [108,[31,32,33,34]],[112,[41,42,43,44]],[116,[51,52,53,54]],
    [140,[61,62,63,64]],[144,[71,72,73,74]],[148,[81,82,83,84]]])original.set(bytes,offset);
  const f=fixture({rasterComparison:true,size:{width:8,height:8},raw:Buffer.from(original)});
  const before=await f.cameraFrame();f.rasterComparison.retainBaseline(before);
  const changed=Buffer.from(original);changed[0]=129;changed[114]=0;changed[255]=255;
  f.setCapture(changed);
  const after=await f.cameraFrame(),result=f.rasterComparison.compare(after),evidence=result.pixelEvidence;
  assert.equal(evidence.status,'retained');
  assert.deepEqual(evidence.pixels.map(({x,y})=>[x,y]),[[0,0],[4,3],[7,7]]);
  assert.deepEqual(evidence.pixels.map(({neighborhood:n})=>[n.x,n.y,n.width,n.height,n.pixels.length]),[[0,0,2,2,4],[3,2,3,3,9],[6,6,2,2,4]]);
  assert.deepEqual(evidence.pixels[0].comparisonBefore,[127,127,127,127]);
  assert.deepEqual(evidence.pixels[0].comparisonAfter,[129,127,127,127]);
  assert.deepEqual(evidence.pixels[1].comparisonBefore,[41,42,43,44]);
  assert.deepEqual(evidence.pixels[1].comparisonAfter,[41,42,0,44]);
  assert.deepEqual(evidence.pixels[2].comparisonAfter,[127,127,127,255]);
  assert.deepEqual(evidence.pixels[1].neighborhood.pixels.map(({x,y,before,after})=>({x,y,before,after})),[
    {x:3,y:2,before:[1,2,3,4],after:[1,2,3,4]},
    {x:4,y:2,before:[11,12,13,14],after:[11,12,13,14]},
    {x:5,y:2,before:[21,22,23,24],after:[21,22,23,24]},
    {x:3,y:3,before:[31,32,33,34],after:[31,32,33,34]},
    {x:4,y:3,before:[41,42,43,44],after:[41,42,0,44]},
    {x:5,y:3,before:[51,52,53,54],after:[51,52,53,54]},
    {x:3,y:4,before:[61,62,63,64],after:[61,62,63,64]},
    {x:4,y:4,before:[71,72,73,74],after:[71,72,73,74]},
    {x:5,y:4,before:[81,82,83,84],after:[81,82,83,84]},
  ]);
  for(const sample of evidence.pixels)for(const pixel of sample.neighborhood.pixels){
    const offset=(pixel.y*8+pixel.x)*4;
    assert.deepEqual(pixel.before,[...original.subarray(offset,offset+4)]);
    assert.deepEqual(pixel.after,[...changed.subarray(offset,offset+4)]);
    assert.equal(pixel.maskedBefore,false);assert.equal(pixel.maskedAfter,false);
  }
  assert.deepEqual(f.raw,original);assert.equal(digest(changed),after.rawSha256);
  assert.equal(f.captures.length,2);assert.equal(f.scripts.length,4);assert.deepEqual(f.sent,[]);
  assert.deepEqual(Object.keys(after),['width','height','sha256','rawSha256','maskedRects','unmaskedPixelCount']);
  const saved=JSON.stringify(evidence);
  evidence.expected.canvas.x=-1;evidence.actual.crop.y=-1;evidence.pixels[0].neighborhood.pixels[0].before[0]=0;
  assert.equal(JSON.stringify(f.rasterComparison.compare(after).pixelEvidence),saved);
  f.rasterComparison.clear();assert.throws(()=>f.rasterComparison.compare(after),/capture object/);
});

test('sixteen distinct samples prioritize comparison differences over earlier masked text bytes',async()=>{
  const f=fixture({rasterComparison:true,labels:[label()]}),before=await f.cameraFrame();
  f.rasterComparison.retainBaseline(before);
  const changed=Buffer.from(f.raw),inside=[];
  for(let y=17;y<20;y++)for(let x=23;x<35;x++){changed[(y*608+x)*4]=128;inside.push([x,y]);}
  changed[(80*608+80)*4]=129;changed[(80*608+81)*4+1]=130;f.setCapture(changed);
  const after=await f.cameraFrame(),result=f.rasterComparison.compare(after),samples=result.pixelEvidence.pixels;
  assert.equal(result.raw.changedPixels,38);assert.equal(result.unmasked.changedPixels,2);
  assert.deepEqual(samples.map(({x,y})=>[x,y]),[[80,80],[81,80],...inside.slice(0,14)]);
  assert.equal(new Set(samples.map(({x,y})=>`${x},${y}`)).size,16);
  assert.deepEqual(samples[2].comparisonBefore,[0,0,0,0]);assert.deepEqual(samples[2].comparisonAfter,[0,0,0,0]);
  const textPixel=samples[2].neighborhood.pixels.find(pixel=>pixel.x===23&&pixel.y===17);
  assert.equal(textPixel.maskedBefore,true);assert.equal(textPixel.maskedAfter,true);
  assert.deepEqual(textPixel.before,[127,127,127,127]);assert.deepEqual(textPixel.after,[128,127,127,127]);
  assert.equal(result.masks.rawChangedInsideMasks,36);assert.equal(result.masks.rawChangedOutsideMasks,2);
  assert.equal(f.captures.length,2);assert.equal(f.scripts.length,4);f.rasterComparison.clear();
});

test('observed rectangles, scale and bounded styles remain outside public capture signatures',async()=>{
  const computed={opacity:'1',backgroundColor:'rgb(255, 223, 158)',borderLeftColor:'rgb(168, 102, 22)',
    borderRadius:'2px',transform:'none',unrequested:'not retained'};
  const options={rasterComparison:true,size:{width:1216,height:600},devicePixelRatio:2,labels:[label({computed})]};
  const f=fixture(options),before=await f.cameraFrame();f.rasterComparison.retainBaseline(before);
  const after=await f.cameraFrame(),result=f.rasterComparison.compare(after),observed=result.pixelEvidence.expected;
  assert.deepEqual(before,after);assert.deepEqual(result.pixelEvidence.pixels,[]);
  assert.deepEqual(observed.canvas,{x:100,y:80,width:800,height:500});
  assert.deepEqual(observed.viewport,{width:1024,height:700});
  assert.deepEqual(observed.crop,{x:196,y:180,width:608,height:300});
  assert.deepEqual(observed.bitmapScale,{x:2,y:2});assert.equal(observed.devicePixelRatio,2);
  assert.deepEqual(observed.labels[0],{index:0,keySha256:digest('X'),button:{x:210,y:190,width:80,height:30},
    interior:{x:211,y:191,width:78,height:28},textRect:{x:220,y:198,width:10,height:8},
    computed:{opacity:'1',backgroundColor:'rgb(255, 223, 158)',borderLeftColor:'rgb(168, 102, 22)',borderRightColor:null,
      borderTopColor:null,borderBottomColor:null,borderLeftWidth:'1px',borderRightWidth:'1px',borderTopWidth:'1px',borderBottomWidth:'1px',borderRadius:'2px',transform:'none'}});
  assert.equal(JSON.stringify(observed).includes('Eje X'),false);assert.equal(JSON.stringify(observed).includes('unrequested'),false);
  assert.equal(f.captures.length,2);assert.equal(f.scripts.length,4);assert.deepEqual(f.sent,[]);
  const changedStyle=fixture({...options,devicePixelRatio:Infinity,labels:[label({computed:{...computed,opacity:'0.5',transform:'x'.repeat(193)}})]});
  const samePixels=await changedStyle.cameraFrame();assert.deepEqual(samePixels,before);
  changedStyle.rasterComparison.retainBaseline(samePixels);
  const metadata=changedStyle.rasterComparison.compare(await changedStyle.cameraFrame()).pixelEvidence.expected;
  assert.equal(metadata.devicePixelRatio,null);assert.equal(metadata.labels[0].computed.opacity,'0.5');assert.equal(metadata.labels[0].computed.transform,null);
  assert.deepEqual(await fixture({...options,rasterComparison:false}).cameraFrame(),before);
  f.rasterComparison.clear();changedStyle.rasterComparison.clear();
});

test('diagnostic metadata failure or output budget never changes exact comparison statistics',async()=>{
  const computed=Object.fromEntries(['opacity','backgroundColor','borderLeftColor','borderRightColor','borderTopColor','borderBottomColor','borderRadius','transform'].map(key=>[key,'x'.repeat(192)]));
  const cases=[{diagnosticHashFailure:true,labels:[label()]},{labels:Array.from({length:32},(_,i)=>label({key:String(i),computed}))}];
  for(const options of cases){
    const f=fixture({...options,rasterComparison:true}),before=await f.cameraFrame();f.rasterComparison.retainBaseline(before);
    const bytes=Buffer.from(f.raw);bytes[(80*608+80)*4]=128;f.setCapture(bytes);
    const after=await f.cameraFrame(),result=f.rasterComparison.compare(after);
    assert.equal(result.raw.changedPixels,1);assert.equal(result.raw.maxByteDelta,1);
    assert.equal(result.unmasked.changedPixels,1);assert.notEqual(after.sha256,before.sha256);
    if(options.diagnosticHashFailure){assert.equal(result.pixelEvidence.status,'retained');assert.equal(result.pixelEvidence.expected,null);assert.equal(result.pixelEvidence.actual,null);}
    else assert.deepEqual(result.pixelEvidence,{status:'unavailable',reason:'byte-budget',byteLimit:128*1024});
    assert.equal(f.captures.length,2);assert.equal(f.scripts.length,4);assert.deepEqual(f.sent,[]);f.rasterComparison.clear();
  }
});

// Original synthetic hashes model accepted images, not camera or application
// state. The real flow runs with a controlled clock and its unchanged polls.
async function navigationFixture(options={}){
  let clock=0,active='',latest,baseline,compares=0,clears=0,primaryError;
  const events=[],checks=[],polls=[];
  const module={exports:{}};
  vm.runInNewContext(readFileSync(require.resolve('./desktop-view-navigation-flow.cjs'),'utf8'),{module,Date:{now:()=>clock}});
  const frameHash=label=>{
    if(label.startsWith('preset '))return label.endsWith('7')?'a':label.at(-1);
    if(label==='previous preset 5'&&options.failBeforeWheel)return 'e';
    if(label.startsWith('previous preset '))return label.at(-1);
    if(label.includes('temporary front'))return '1';
    if(label==='fit after wheel')return 'e';
    if(label==='wheel-in previous restores baseline'&&options.failWheel)return 'e';
    if(label==='previous restores zoom after Fit')return 'd';
    if(label.includes('actual input')||label.includes('previous restores gesture'))return label.startsWith('orbit')?'b':label.startsWith('pan')?'c':'d';
    return 'a';
  };
  const rasterComparison={
    retainBaseline(result){assert.equal(result,latest);baseline=result;events.push('retain:'+active);if(options.retainError)throw Error('diagnostic retention');},
    compare(result){assert.equal(result,latest);assert.ok(baseline);compares++;events.push('compare:'+active);if(options.compareError)throw Error('diagnostic comparison');return {status:'compared',raw:{changedPixels:1}};},
    clear(){clears++;baseline=null;events.push('clear');if(options.clearError)throw Error('diagnostic cleanup');},
  };
  let error;
  try {
    await module.exports({kind:'standard',checks,rasterComparison:options.optOut?undefined:rasterComparison,
      canonical:JSON.stringify,check:(condition,message)=>{if(!condition){primaryError=new Error(message);throw primaryError;}},
      snapshot:async()=>({native:{builds:[{serial:1,response:{ok:true,value:{bodies:[{}]}}}],assemblies:[],workerErrors:[]}}),
      key:async combo=>{events.push('key:'+combo);},cameraGesture:async kind=>{events.push('gesture:'+kind);},
      page:async()=>{events.push('projection:'+active);return [];},
      cameraFrame:async(...args)=>{
        assert.deepEqual(args,[]);events.push('capture:'+active);
        latest={width:8,height:8,sha256:frameHash(active).repeat(64),rawSha256:clock.toString(16).padStart(64,'0'),maskedRects:[],unmaskedPixelCount:64};return latest;
      },
      waitFor:async(label,predicate)=>{
        active=label.replace('stationary rendered camera crop: ','');
        for(let count=1;count<=3;count++){
          clock+=250;const result=await predicate();
          if(result){assert.equal(count,3);polls.push(count);events.push('accepted:'+active);return result;}
        }
        throw Error('Original 500ms stationary signature changed');
      },
    });
  } catch(caught){error=caught;}
  return {error,primaryError,events,polls,compares,clears,evidence:checks.find(value=>value.viewNavigation)?.viewNavigation};
}

test('wheel failure binds the accepted original captures before projection and preserves the exact assertion',async()=>{
  const f=await navigationFixture({failWheel:true});
  assert.equal(f.error,f.primaryError);assert.match(f.error.message,/Previous crosses one completed wheel-in transaction/);
  assert.equal(f.compares,1);assert.equal(f.clears,1);assert.equal(f.events.at(-1),'clear');
  const retained=f.events.indexOf('retain:wheel-in initial isometric');
  assert.deepEqual(f.events.slice(retained-1,retained+2),['accepted:wheel-in initial isometric','retain:wheel-in initial isometric','projection:wheel-in initial isometric']);
  assert.equal(f.evidence.rasterComparison.status,'compared');assert.equal(f.evidence.rasterComparison.raw.changedPixels,1);
  assert.equal(f.polls.length,28);assert.ok(f.polls.every(count=>count===3));
  assert.equal(f.events.filter(value=>value.startsWith('capture:')).length,84);
});

test('diagnostic retention, comparison or cleanup failures never replace the original navigation failure',async()=>{
  for(const option of ['retainError','compareError','clearError']){
    const f=await navigationFixture({failWheel:true,[option]:true});
    assert.equal(f.error,f.primaryError);assert.match(f.error.message,/Previous crosses one completed wheel-in transaction/);
    assert.equal(f.clears,1);assert.equal(f.events.at(-1),'clear');
    assert.equal(f.evidence.rasterComparison.status,option==='clearError'?'compared':'unavailable');
  }
  const early=await navigationFixture({failBeforeWheel:true});
  assert.equal(early.error,early.primaryError);assert.match(early.error.message,/Previous returns preset 5/);
  assert.equal(early.clears,1);assert.equal(early.compares,0);assert.equal(early.events.at(-1),'clear');
  assert.equal(early.evidence.rasterComparison,undefined);
  assert.equal(early.events.some(value=>value.startsWith('retain:')),false);
});

test('successful and opted-out navigation keep the original polls, captures and report without diff statistics',async()=>{
  const success=await navigationFixture(),without=await navigationFixture({optOut:true});
  assert.equal(success.error,undefined);assert.equal(without.error,undefined);
  assert.equal(success.compares,0);assert.equal(success.clears,1);assert.equal(without.clears,0);
  assert.equal(success.evidence.rasterComparison,undefined);assert.equal(without.evidence.rasterComparison,undefined);
  assert.equal(success.evidence.completed,true);assert.equal(without.evidence.completed,true);
  const inputs=events=>events.filter(value=>!value.startsWith('retain:')&&value!=='clear');
  assert.deepEqual(inputs(success.events),without.events);assert.deepEqual(success.polls,without.polls);
});
